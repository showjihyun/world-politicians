import { describe, expect, it } from 'vitest';
import {
  checkAccuracy,
  checkAllowlist, checkCosponsor, checkCrosswalk, checkDates, checkFunding, checkLobbying, checkDocClaims, checkDuplicates, checkFreshness,
  checkManifest, checkPresentation, checkReferences, checkVerifiable, verdict,
  type AccuracyFile,
  type FundingFile,
  type LobbyingFile,
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

describe('checkCosponsor', () => {
  const bill = (n: number) => ({
    title: `Bill ${n}`,
    url: `https://www.congress.gov/bill/119th-congress/senate-bill/${n}`,
    source: 'Congress.gov',
    date: '2025-03-01',
  });
  const ok = {
    congress: 119,
    threshold: 10,
    stats: { edges: 2, fresh: 1, crossParty: 1 },
    edges: [
      { a: 'markey', b: 'warren', bills: 78, strength: 3, crossParty: false, duplicate: true,
        sponsoredByA: 44, sponsoredByB: 34, initiator: null },
      { a: 'cruz', b: 'warnock', bills: 12, strength: 1, crossParty: true, duplicate: false,
        sponsoredByA: 11, sponsoredByB: 1, initiator: 'b' },
    ],
  };
  const ids = new Set(['markey', 'warren', 'cruz', 'warnock']);
  const curated = new Set(['markey|warren']);
  // 큐레이션된 markey|warren 에는 근거를 두지 않는다
  const srcs = { 'cruz|warnock': [bill(2)] };

  it('맞으면 아무것도 보고하지 않는다', () => {
    expect(checkCosponsor(ok, ids, curated, srcs)).toHaveLength(0);
  });

  it('사라진 인물을 가리키면 잡는다', () => {
    expect(checkCosponsor(ok, new Set(['markey', 'warren']), curated, srcs).map((f) => f.check))
      .toContain('cosponsor.references');
  });

  it('기준선 아래가 섞이면 잡는다', () => {
    const bad = { ...ok, edges: [{ ...ok.edges[1], bills: 9, strength: 1, sponsoredByA: 8, sponsoredByB: 1 }], stats: { edges: 1, fresh: 1, crossParty: 1 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.threshold');
  });

  it('자기 자신과의 엣지를 잡는다', () => {
    const bad = { ...ok, edges: [{ a: 'cruz', b: 'cruz', bills: 20, strength: 2, crossParty: false, duplicate: false, sponsoredByA: 20, sponsoredByB: 0, initiator: 'b' }],
      stats: { edges: 1, fresh: 1, crossParty: 0 } };
    expect(checkCosponsor(bad, ids, curated, { 'cruz|cruz': [bill(1)] }).map((f) => f.check))
      .toContain('cosponsor.self');
  });

  it('같은 쌍이 두 번이면 잡는다', () => {
    const e = ok.edges[1];
    const bad = { ...ok, edges: [e, { ...e, a: 'warnock', b: 'cruz' }], stats: { edges: 2, fresh: 2, crossParty: 2 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.duplicatePair');
  });

  // 표시가 틀리면 큐레이션 엣지 위에 공동발의 엣지가 겹쳐 그려진다
  it('큐레이션 여부 표시가 실제와 다르면 잡는다', () => {
    const bad = { ...ok, edges: [{ ...ok.edges[0], duplicate: false }], stats: { edges: 1, fresh: 1, crossParty: 0 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.duplicateFlag');
  });

  it('그려지는 엣지에 근거가 없으면 잡는다', () => {
    expect(checkCosponsor(ok, ids, curated, {}).map((f) => f.check)).toContain('cosponsor.sources');
  });

  // 법안 날짜가 기사보다 새로워서 관계를 뒷받침하던 기사를 밀어냈다 — 실제 회귀였다
  it('큐레이션된 쌍에 법안 근거가 들어가면 잡는다', () => {
    const leak = { ...srcs, 'markey|warren': [bill(9)] };
    expect(checkCosponsor(ok, ids, curated, leak).map((f) => f.check)).toContain('cosponsor.curatedLeak');
  });

  it('방향별 건수의 합이 총 건수와 다르면 잡는다', () => {
    const bad = { ...ok, edges: [{ ...ok.edges[1], sponsoredByA: 1 }], stats: { edges: 1, fresh: 1, crossParty: 1 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.split');
  });

  // 뒤집을 때 방향 집계를 같이 뒤집지 않으면 화살표가 정확히 반대를 가리킨다
  it('방향이 건수와 반대면 잡는다', () => {
    const bad = { ...ok, edges: [{ ...ok.edges[1], initiator: 'a' as const }], stats: { edges: 1, fresh: 1, crossParty: 1 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.direction');
  });

  it('건수와 강도가 어긋나면 잡는다', () => {
    const bad = { ...ok, edges: [{ ...ok.edges[1], strength: 3 }], stats: { edges: 1, fresh: 1, crossParty: 1 } };
    expect(checkCosponsor(bad, ids, curated, srcs).map((f) => f.check)).toContain('cosponsor.strength');
  });

  // 눌러서 확인할 수 없는 링크가 섞이면 근거 패널의 전제가 깨진다
  it('congress.gov 법안이 아닌 근거를 잡는다', () => {
    const bad = { ...srcs, 'cruz|warnock': [{ ...bill(2), url: 'https://news.google.com/rss/articles/xyz' }] };
    expect(checkCosponsor(ok, ids, curated, bad).map((f) => f.check)).toContain('cosponsor.sourceHost');
  });

  it('요약 수치가 배열과 다르면 잡는다', () => {
    const bad = { ...ok, stats: { edges: 99, fresh: 1, crossParty: 1 } };
    const f = checkCosponsor(bad, ids, curated, srcs);
    expect(f.map((x) => x.check)).toContain('cosponsor.stats');
    expect(f.find((x) => x.check === 'cosponsor.stats')?.samples?.[0]).toContain('99');
  });
});

describe('checkFunding', () => {
  const person = (over: Partial<FundingFile['people'][string]> = {}) => ({
    receipts: 1000, individual: 700, pacDirect: 60, partyDirect: 10,
    ieSupport: 5, ieOppose: 9,
    topFunders: [{ name: 'ACME PAC', amount: 60, kind: 'interest' }],
    ...over,
  });
  const ok: FundingFile = {
    cycle: 2026,
    stats: { people: 1, receipts: 1000, pacDirect: 60, namedSharePct: 6 },
    people: { cruz: person() },
  };
  const ids = new Set(['cruz']);

  it('맞으면 아무것도 보고하지 않는다', () => {
    expect(checkFunding(ok, ids)).toHaveLength(0);
  });

  it('사라진 인물을 가리키면 잡는다', () => {
    expect(checkFunding(ok, new Set(['warren'])).map((x) => x.check)).toContain('funding.references');
  });

  // 파이프 구분 파일에서 열을 하나 밀려 읽으면 총 수입이 음수가 된다
  it('총 수입이 음수면 잡는다', () => {
    const bad = { ...ok, people: { cruz: person({ receipts: -1, topFunders: [] }) },
      stats: { people: 1, receipts: -1, pacDirect: 60, namedSharePct: 0 } };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.negative');
  });

  // FEC 는 반환된 기부를 음수로 적는다. 은퇴한 인물은 PAC 순액이 음수가 되는데
  // 오류가 아니라 "돈을 돌려줬다" 는 사실이므로 실패시키지 않는다.
  it('PAC 순액이 음수인 것은 실패가 아니라 알림이다', () => {
    const bad = { ...ok, people: { cruz: person({ pacDirect: -100, topFunders: [] }) },
      stats: { people: 1, receipts: 1000, pacDirect: -100, namedSharePct: -10 } };
    const f = checkFunding(bad, ids);
    expect(f.find((x) => x.check === 'funding.refunded')?.level).toBe('info');
    expect(f.filter((x) => x.level === 'fail')).toHaveLength(0);
  });

  it('구성 합계가 총 수입을 넘으면 잡는다', () => {
    const bad = {
      ...ok,
      people: { cruz: person({ individual: 900, pacDirect: 900, topFunders: [] }) },
      stats: { people: 1, receipts: 1000, pacDirect: 900, namedSharePct: 90 },
    };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.overcount');
  });

  it('후원자에 0 이하가 섞이면 잡는다', () => {
    const bad = {
      ...ok,
      people: { cruz: person({ topFunders: [{ name: 'X', amount: 0, kind: 'interest' }] }) },
    };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.funderOrder');
  });

  it('후원자가 내림차순이 아니면 잡는다', () => {
    const bad = {
      ...ok,
      people: {
        cruz: person({
          topFunders: [
            { name: 'A', amount: 10, kind: 'interest' },
            { name: 'B', amount: 50, kind: 'interest' },
          ],
        }),
      },
    };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.funderOrder');
  });

  it('이익집단이 아닌 후원자가 섞이면 잡는다', () => {
    const bad = {
      ...ok,
      people: { cruz: person({ topFunders: [{ name: 'OWN JFC', amount: 60, kind: 'joint' }] }) },
    };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.kind');
  });

  it('한도를 크게 넘는 기부는 경고한다 — 도관 PAC 일 수도 있다', () => {
    const bad = {
      ...ok,
      people: { cruz: person({ pacDirect: 100000, topFunders: [{ name: 'BIG', amount: 100000, kind: 'interest' }] }) },
      stats: { people: 1, receipts: 1000000, pacDirect: 100000, namedSharePct: 10 },
    };
    const f = checkFunding({ ...bad, people: { cruz: { ...bad.people.cruz, receipts: 1000000 } } }, ids);
    const hit = f.find((x) => x.check === 'funding.limit');
    expect(hit?.level).toBe('warn');
  });

  it('요약 수치가 실제와 다르면 잡는다', () => {
    const bad = { ...ok, stats: { ...ok.stats, receipts: 99 } };
    expect(checkFunding(bad, ids).map((x) => x.check)).toContain('funding.stats');
  });
});

describe('checkLobbying', () => {
  const alum = (over: Partial<LobbyingFile['people'][string]['alumni'][0]> = {}) => ({
    name: 'Jane Doe',
    role: 'Legislative Director, Rep. Marsha Blackburn',
    firm: 'ACME Gov Rel',
    client: 'Pfizer',
    year: 2026,
    ...over,
  });
  const ok: LobbyingFile = {
    years: [2025, 2026],
    stats: { matched: 1, people: 1 },
    people: {
      blackburn: {
        alumniCount: 1,
        alumni: [alum()],
        topFirms: [{ name: 'ACME Gov Rel', count: 1 }],
        topClients: [{ name: 'Pfizer', count: 1 }],
      },
    },
  };
  const ids = new Set(['blackburn']);

  it('맞으면 아무것도 보고하지 않는다', () => {
    expect(checkLobbying(ok, ids)).toHaveLength(0);
  });

  it('사라진 인물을 가리키면 잡는다', () => {
    expect(checkLobbying(ok, new Set(['cruz'])).map((x) => x.check)).toContain('lobbying.references');
  });

  // 매칭이 헐거워지면 'Sen. Harris' 가 아무 Harris 에게나 붙는다 (역대 33명).
  // 역할 문구에 호칭+이름이 남아 있어야 왜 붙었는지 보여줄 수 있다.
  it('역할 문구에 호칭+이름이 없으면 잡는다', () => {
    const bad = {
      ...ok,
      people: { blackburn: { ...ok.people.blackburn, alumni: [alum({ role: 'Chief of Staff, Department of Labor' })] } },
    };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.evidence');
  });

  it('이름·회사·고객이 비면 잡는다', () => {
    const bad = {
      ...ok,
      people: { blackburn: { ...ok.people.blackburn, alumni: [alum({ firm: '' })] } },
    };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.incomplete');
  });

  it('목록이 총계보다 많으면 잡는다', () => {
    const bad = {
      ...ok,
      stats: { matched: 1, people: 1 },
      people: { blackburn: { ...ok.people.blackburn, alumniCount: 1, alumni: [alum(), alum({ name: 'B C' })] } },
    };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.overflow');
  });

  it('수집 범위 밖의 연도를 잡는다', () => {
    const bad = {
      ...ok,
      people: { blackburn: { ...ok.people.blackburn, alumni: [alum({ year: 1999 })] } },
    };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.year');
  });

  // 안 풀면 화면에 'Becker &amp; Poliakoff' 로 그대로 나간다
  it('XML 엔티티가 남으면 잡는다', () => {
    const bad = {
      ...ok,
      people: { blackburn: { ...ok.people.blackburn, alumni: [alum({ firm: 'Becker &amp; Poliakoff' })] } },
    };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.entities');
  });

  it('요약 수치가 실제와 다르면 잡는다', () => {
    const bad = { ...ok, stats: { matched: 99, people: 1 } };
    expect(checkLobbying(bad, ids).map((x) => x.check)).toContain('lobbying.stats');
  });
});

describe('checkAccuracy', () => {
  const r = (over: Partial<AccuracyFile['rows'][0]> = {}) => ({
    id: 'x',
    model: { polarity: 'feud', classified: true },
    truth: { polarity: 'feud', pairCorrect: true },
    ...over,
  });
  const file = (rows: AccuracyFile['rows'], baseline: AccuracyFile['baseline'] = { polarity: null, pair: null }) =>
    ({ baseline, rows }) as AccuracyFile;

  it('파일이 없으면 알려만 준다', () => {
    const f = checkAccuracy(null);
    expect(f[0]).toMatchObject({ level: 'info', check: 'accuracy.absent' });
  });

  it('라벨이 비어 있으면 알려만 준다', () => {
    const rows = [r({ truth: { polarity: null, pairCorrect: null } })];
    expect(checkAccuracy(file(rows))[0]).toMatchObject({ level: 'info', check: 'accuracy.pending' });
  });

  it('맞으면 점수를 정보로 낸다', () => {
    const f = checkAccuracy(file([r(), r()]));
    expect(f[0]).toMatchObject({ level: 'info', check: 'accuracy.ok' });
    expect(f[0].message).toContain('100%');
  });

  // 절대 점수로 막지 않는다 — 처음에는 기준선을 모른다
  it('기준선이 없으면 점수가 낮아도 실패시키지 않는다', () => {
    const rows = [r({ truth: { polarity: 'ally', pairCorrect: false } })];
    expect(checkAccuracy(file(rows)).some((x) => x.level === 'fail')).toBe(false);
  });

  it('기준선 아래로 떨어지면 잡는다', () => {
    const rows = [r({ truth: { polarity: 'ally', pairCorrect: false } }), r()];
    const f = checkAccuracy(file(rows, { polarity: 95, pair: 95 }));
    expect(f.map((x) => x.check)).toEqual(
      expect.arrayContaining(['accuracy.polarity', 'accuracy.pair'])
    );
    expect(f.every((x) => x.level === 'fail')).toBe(true);
  });

  // 표본이 작을 때 1~2건 차이로 깨지면 아무도 안 본다
  it('허용 범위 안의 하락은 넘긴다', () => {
    const rows = [r(), r(), r(), r({ truth: { polarity: 'ally', pairCorrect: true } })];
    expect(checkAccuracy(file(rows, { polarity: 78, pair: null })).some((x) => x.level === 'fail')).toBe(false);
  });

  // 기준선을 안 적어 두면 하락을 영영 못 잡는다
  it('라벨이 쌓였는데 기준선이 비면 경고한다', () => {
    const rows = Array.from({ length: 45 }, () => r());
    const f = checkAccuracy(file(rows));
    expect(f.find((x) => x.check === 'accuracy.baseline')?.level).toBe('warn');
  });

  it('미분류 신호는 극성 채점에서 뺀다 — 모델이 답을 안 낸 것이다', () => {
    const rows = [r({ model: { polarity: null, classified: false }, truth: { polarity: 'feud', pairCorrect: true } })];
    const f = checkAccuracy(file(rows));
    expect(f[0].message).toContain('극성 0% (0행)');
  });
});
