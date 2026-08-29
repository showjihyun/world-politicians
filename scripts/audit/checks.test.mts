import { describe, expect, it } from 'vitest';
import {
  checkAllowlist, checkCrosswalk, checkDates, checkDocClaims, checkDuplicates, checkFreshness,
  checkManifest, checkPresentation, checkReferences, checkVerifiable, verdict,
  type SourceRef,
} from './checks.mts';

const NOW = new Date('2026-08-29T06:00:00Z');
const src = (over: Partial<SourceRef> = {}): SourceRef => ({
  title: 'Headline',
  url: 'https://politico.com/a',
  source: 'Politico',
  date: '2026-08-01',
  ...over,
});

// 실제 화이트리스트 판정을 흉내낸다 (단어 경계)
const isAllowed = (url: string, name: string) =>
  ['politico.com', 'apnews.com'].some((h) => url.includes(h)) ||
  ['Politico', 'AP News'].some((n) => name.toLowerCase() === n.toLowerCase());

describe('checkAllowlist', () => {
  it('허용 매체만 있으면 조용하다', () => {
    expect(checkAllowlist([src()], isAllowed, 'sources')).toHaveLength(0);
  });

  // 실제 사고: 'AP' 부분일치로 CoinGape 등 9건이 데이터에 들어왔다
  it('허용 목록 밖 매체를 FAIL 로 잡는다', () => {
    const f = checkAllowlist(
      [src({ source: 'CoinGape', url: 'https://coingape.com/x' })],
      isAllowed, 'sources'
    );
    expect(f[0].level).toBe('fail');
    expect(f[0].samples).toContain('CoinGape');
  });
});

describe('checkDates', () => {
  it('미래 날짜를 잡는다', () => {
    const f = checkDates([{ date: '2027-01-01' }], 'signals', NOW);
    expect(f.some((x) => x.check === 'signals.date.future' && x.level === 'fail')).toBe(true);
  });

  it('형식이 깨진 날짜를 잡는다', () => {
    const f = checkDates([{ date: 'nope' }], 'signals', NOW);
    expect(f.some((x) => x.check === 'signals.date.format')).toBe(true);
  });

  it('GDELT 하한 이전 항목을 잡는다', () => {
    const f = checkDates([{ date: '2015-05-05' }], 'sources', NOW, '2017-01-01');
    expect(f.some((x) => x.check === 'sources.date.floor')).toBe(true);
  });

  it('정상 날짜는 통과시킨다', () => {
    expect(checkDates([{ date: '2026-08-01' }], 'signals', NOW)).toHaveLength(0);
  });
});

describe('checkFreshness', () => {
  // 실제 사고: 재처리가 수집 시각을 갱신해 배지가 27.7시간 어긋났다.
  // 그때 generatedAt(08-29 03:40)은 최신 기사(08-28)보다 뒤였으므로 이 검사로는
  // 안 잡힌다 — 그래서 stale 경고와 함께 두 방향을 모두 본다.
  it('수집 시각이 최신 기사보다 이르면 FAIL', () => {
    const f = checkFreshness('2026-08-01T00:00:00Z', '2026-08-28', NOW);
    expect(f.some((x) => x.check === 'meta.generatedAt.beforeData')).toBe(true);
  });

  it('수집 시각이 미래면 FAIL', () => {
    const f = checkFreshness('2027-01-01T00:00:00Z', '2026-08-28', NOW);
    expect(f.some((x) => x.check === 'meta.generatedAt.future')).toBe(true);
  });

  it('오래 갱신되지 않으면 WARN — 야간 작업이 멈춘 것을 알린다', () => {
    const f = checkFreshness('2026-08-20T00:00:00Z', '2026-08-19', NOW);
    expect(f.some((x) => x.check === 'meta.stale' && x.level === 'warn')).toBe(true);
  });

  it('정상 범위면 조용하다', () => {
    expect(checkFreshness('2026-08-28T22:57:00Z', '2026-08-28', NOW)).toHaveLength(0);
  });

  it('수집 시각이 없으면 FAIL', () => {
    expect(checkFreshness(null, '2026-08-28', NOW)[0].level).toBe('fail');
  });
});

describe('checkManifest', () => {
  const manifest = { stats: { total: 2 }, months: ['2026-08'], counts: { a: 2 } };

  it('일치하면 조용하다', () => {
    expect(checkManifest(manifest, { months: ['2026-08'], total: 2, counts: { a: 2 } })).toHaveLength(0);
  });

  // 분할 이후 새로 생긴 어긋남 지점 — 매니페스트만 갱신되고 파티션이 안 바뀌는 경우
  it('총계가 어긋나면 FAIL', () => {
    const f = checkManifest(manifest, { months: ['2026-08'], total: 5, counts: { a: 5 } });
    expect(f.some((x) => x.check === 'manifest.total')).toBe(true);
  });

  it('월 목록이 어긋나면 FAIL', () => {
    const f = checkManifest(manifest, { months: ['2026-07', '2026-08'], total: 2, counts: { a: 2 } });
    expect(f.some((x) => x.check === 'manifest.months')).toBe(true);
  });

  it('인물별 건수가 어긋나면 FAIL — 화면의 "N건" 이 틀리게 된다', () => {
    const f = checkManifest(manifest, { months: ['2026-08'], total: 2, counts: { a: 7 } });
    expect(f.some((x) => x.check === 'manifest.counts')).toBe(true);
  });
});

describe('checkReferences', () => {
  it('데이터셋에 없는 인물 id 를 잡는다', () => {
    const f = checkReferences(
      [{ id: '1', date: '2026-08-01', source: '', url: '', title: '', people: ['ghost'] }],
      new Set(['trump'])
    );
    expect(f[0].samples).toContain('ghost');
  });

  it('pair 안의 id 도 확인한다', () => {
    const f = checkReferences(
      [{ id: '1', date: '2026-08-01', source: '', url: '', title: '', people: ['trump'], pair: ['trump', 'ghost'] }],
      new Set(['trump'])
    );
    expect(f).toHaveLength(1);
  });
});

describe('checkPresentation', () => {
  // 실제 사고: 443건의 제목에 " - 매체명" 이 붙어 화면에 두 번 나왔다
  it('제목 끝 매체명 중복을 WARN 으로 잡는다', () => {
    const f = checkPresentation([src({ title: 'Something happened - Politico' })]);
    expect(f.some((x) => x.check === 'sources.titleSuffix')).toBe(true);
  });

  it('디코딩 안 된 HTML 엔티티를 FAIL 로 잡는다', () => {
    const f = checkPresentation([src({ title: 'AI &amp; Tech Brief' })]);
    expect(f.some((x) => x.check === 'sources.entities' && x.level === 'fail')).toBe(true);
  });

  it('빈 제목/URL 을 잡는다', () => {
    expect(checkPresentation([src({ title: '  ' })]).some((x) => x.check === 'sources.empty')).toBe(true);
  });

  it('정상 항목은 조용하다', () => {
    expect(checkPresentation([src()])).toHaveLength(0);
  });
});

describe('checkVerifiable', () => {
  // 실제 사고: 링크 478개 중 450개가 목적지를 확인할 수 없는 리다이렉트였다
  it('Google News 리다이렉트를 FAIL 로 잡는다', () => {
    const f = checkVerifiable([src({ url: 'https://news.google.com/rss/articles/CBMi...' })]);
    expect(f[0].level).toBe('fail');
  });

  it('원본 URL 은 통과시킨다', () => {
    expect(checkVerifiable([src()])).toHaveLength(0);
  });
});

describe('checkDuplicates', () => {
  it('한 엣지 안의 URL 중복을 FAIL 로 잡는다', () => {
    const f = checkDuplicates({ 'a|b': [src(), src()] });
    expect(f.some((x) => x.check === 'sources.dupUrl' && x.level === 'fail')).toBe(true);
  });

  // GDELT 가 모바일·지역판을 다른 URL 로 돌려주던 문제
  it('URL 은 다른데 제목이 같으면 WARN', () => {
    const f = checkDuplicates({
      'a|b': [src({ url: 'https://politico.com/1' }), src({ url: 'https://politico.com/2' })],
    });
    expect(f.some((x) => x.check === 'sources.dupTitle' && x.level === 'warn')).toBe(true);
  });
});

describe('checkDocClaims', () => {
  // README 수치는 손으로 갱신해 왔고 그래서 조용히 낡는다
  it('문서 수치가 실제와 다르면 WARN', () => {
    const f = checkDocClaims(
      [{ file: 'README.md', text: '**218 of 266 edges have evidence**' }],
      [{ pattern: /\*\*(\d+) of 266 edges have evidence/, actual: 64, label: '근거 보유 엣지' }]
    );
    expect(f[0].level).toBe('warn');
    expect(f[0].message).toContain('64');
  });

  it('일치하면 조용하다', () => {
    const f = checkDocClaims(
      [{ file: 'README.md', text: '**64 of 266 edges have evidence**' }],
      [{ pattern: /\*\*(\d+) of 266 edges have evidence/, actual: 64, label: '근거 보유 엣지' }]
    );
    expect(f).toHaveLength(0);
  });
});

describe('verdict', () => {
  it('fail 이 있으면 실패다', () => {
    expect(verdict([{ level: 'fail', check: 'x', message: '' }]).ok).toBe(false);
  });

  it('warn 만 있으면 통과다 — 경고로 CI 를 막으면 아무도 안 본다', () => {
    const v = verdict([{ level: 'warn', check: 'x', message: '' }]);
    expect(v.ok).toBe(true);
    expect(v.warn).toBe(1);
  });
});

describe('checkCrosswalk', () => {
  const ok = {
    stats: { members: 2, polarisMatched: 1, polarisTotal: 2 },
    polaris: {
      warren: { bioguide: 'W1', method: 'official' },
      musk: { bioguide: null, method: null },
    },
    members: [
      { bioguide: 'W1', icpsr: 41301, fec: ['S1'] },
      { bioguide: 'X1', icpsr: 1, fec: [] },
    ],
  };
  const ids = new Set(['warren', 'musk']);

  it('맞으면 아무것도 보고하지 않는다', () => {
    expect(checkCrosswalk(ok, ids)).toHaveLength(0);
  });

  // 인물을 추가하고 크로스워크를 다시 만들지 않는 것이 가장 흔한 어긋남이다
  it('인물이 늘었는데 크로스워크가 그대로면 잡는다', () => {
    const f = checkCrosswalk(ok, new Set([...ids, 'newbie']));
    expect(f.map((x) => x.check)).toContain('crosswalk.missing');
    expect(f[0].samples).toContain('newbie');
  });

  it('인물이 사라졌는데 크로스워크에 남아 있으면 잡는다', () => {
    expect(checkCrosswalk(ok, new Set(['warren'])).map((x) => x.check)).toContain('crosswalk.stale');
  });

  it('명부에 없는 bioguide 를 가리키면 잡는다', () => {
    const bad = { ...ok, polaris: { ...ok.polaris, warren: { bioguide: 'ZZZ', method: 'official' } } };
    expect(checkCrosswalk(bad, ids).map((x) => x.check)).toContain('crosswalk.dangling');
  });

  it('명부에 중복이 있으면 잡는다', () => {
    const bad = {
      ...ok,
      stats: { ...ok.stats, members: 3 },
      members: [...ok.members, { bioguide: 'W1', icpsr: 2, fec: [] }],
    };
    expect(checkCrosswalk(bad, ids).map((x) => x.check)).toContain('crosswalk.duplicate');
  });

  // 수치가 배열과 어긋나면 그 수치를 인용한 문서도 같이 틀린다
  it('요약 수치가 배열과 다르면 잡는다', () => {
    const bad = { ...ok, stats: { members: 99, polarisMatched: 1, polarisTotal: 2 } };
    const f = checkCrosswalk(bad, ids);
    expect(f.map((x) => x.check)).toContain('crosswalk.stats');
    expect(f.find((x) => x.check === 'crosswalk.stats')?.samples?.[0]).toContain('99');
  });

  it('icpsr 이 비면 경고한다 — 표결 감사가 조용히 빠진다', () => {
    const bad = { ...ok, members: [{ bioguide: 'W1', icpsr: null, fec: [] }, ok.members[1]] };
    const f = checkCrosswalk(bad, ids);
    expect(f.map((x) => x.check)).toContain('crosswalk.icpsr');
    expect(f.find((x) => x.check === 'crosswalk.icpsr')?.level).toBe('warn');
  });
});
