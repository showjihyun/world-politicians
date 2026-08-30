import { describe, expect, it } from 'vitest';
import {
  applyResult,
  dedupeByStory,
  pickForRetry,
  bySalience,
  rank,
  accumulate,
  buildStats,
  isAllowedSource,
  partitionByMonth,
  pickRecent,
  resolveGeneratedAt,
  type SignalLike,
} from './core.mts';

const HOSTS = ['apnews.com', 'politico.com', 'thehill.com'] as const;
const NAMES = ['Associated Press', 'AP News', 'AP', 'Politico', 'The Hill', 'NPR'] as const;

const sig = (over: Partial<SignalLike> & { id: string; date: string }): SignalLike => ({
  people: ['a'],
  classified: true,
  polarity: 'feud',
  ...over,
});

describe('isAllowedSource', () => {
  it('정확히 일치하는 매체명을 통과시킨다', () => {
    expect(isAllowedSource('', 'AP News', HOSTS, NAMES)).toBe(true);
    expect(isAllowedSource('', 'Politico', HOSTS, NAMES)).toBe(true);
  });

  it('매체명이 문장 안에 단어로 들어 있어도 통과시킨다', () => {
    expect(isAllowedSource('', 'The Hill - Breaking News', HOSTS, NAMES)).toBe(true);
  });

  // 회귀: 목록의 'AP' 를 부분일치로 쓰다가 아래 매체들이 전부 통과했다.
  // 실제로 9건이 데이터에 들어와 있었고, "이 매체에서만 수집한다" 는 서술이 거짓이 됐다.
  it.each([
    'CoinGape',
    'Yahoo News Singapore',
    'TelegraphHerald.com',
    'Iowa Capital Dispatch',
    'Jewish Telegraphic Agency',
    'Capitol City Now',
    'Link Newspaper',
  ])('단어 경계가 아닌 부분일치는 막는다: %s', (name) => {
    expect(isAllowedSource('', name, HOSTS, NAMES)).toBe(false);
  });

  it('URL 호스트로도 판정한다', () => {
    expect(isAllowedSource('https://www.politico.com/x', 'Unknown Blog', HOSTS, NAMES)).toBe(true);
  });

  it('이름이 비면 거부한다', () => {
    expect(isAllowedSource('', '   ', HOSTS, NAMES)).toBe(false);
  });
});

describe('accumulate', () => {
  const old = [sig({ id: 'old', date: '2026-08-01' })];

  // 회귀: 예전에는 매 실행이 결과를 덮어써서, 수집이 부실한 날 아카이브가 통째로 날아갔다.
  // 실제로 239건이 4건으로 잘린 적이 있다.
  it('신규가 비어도 기존을 잃지 않는다', () => {
    expect(accumulate(old, [], 365, new Date('2026-08-20'))).toHaveLength(1);
  });

  it('같은 id 는 신규로 덮어쓴다', () => {
    const merged = accumulate(old, [sig({ id: 'old', date: '2026-08-02' })], 365, new Date('2026-08-20'));
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toBe('2026-08-02');
  });

  it('보관 기간이 지난 것만 버린다', () => {
    const merged = accumulate(
      [sig({ id: 'ancient', date: '2020-01-01' }), ...old],
      [],
      365,
      new Date('2026-08-20')
    );
    expect(merged.map((s) => s.id)).toEqual(['old']);
  });

  it('날짜가 깨진 항목은 버리지 않는다 — 파싱 실패로 데이터를 잃으면 안 된다', () => {
    const merged = accumulate([sig({ id: 'weird', date: 'not-a-date' })], [], 365, new Date('2026-08-20'));
    expect(merged).toHaveLength(1);
  });
});

describe('pickRecent', () => {
  it('인물당 상한을 지킨다', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      sig({ id: `s${i}`, date: `2026-08-${String(i + 1).padStart(2, '0')}`, people: ['a'] })
    );
    expect(pickRecent(many, 4, 0)).toHaveLength(4);
  });

  // 분할의 전제: 이 크기는 아카이브가 아니라 인물 수에 비례해야 한다.
  it('아카이브가 10배가 되어도 결과 크기는 인물 수에 묶인다', () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        sig({ id: `s${i}`, date: '2026-08-01', people: [`p${i % 5}`] })
      );
    const small = pickRecent(mk(50), 4, 6).length;
    const large = pickRecent(mk(500), 4, 6).length;
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(5 * 4 + 6);
  });

  it('여러 인물이 등장한 기사는 한 번만 담는다', () => {
    const shared = [sig({ id: 'x', date: '2026-08-01', people: ['a', 'b', 'c'] })];
    expect(pickRecent(shared, 4, 0)).toHaveLength(1);
  });
});

describe('partitionByMonth', () => {
  it('YYYY-MM 으로 묶는다', () => {
    const m = partitionByMonth([
      sig({ id: '1', date: '2026-08-01' }),
      sig({ id: '2', date: '2026-08-30' }),
      sig({ id: '3', date: '2026-07-04' }),
    ]);
    expect([...m.keys()].sort()).toEqual(['2026-07', '2026-08']);
    expect(m.get('2026-08')).toHaveLength(2);
  });

  it('날짜가 이상한 항목은 파티션에 넣지 않는다 — 파일명이 깨진다', () => {
    const m = partitionByMonth([sig({ id: 'bad', date: 'nope' })]);
    expect(m.size).toBe(0);
  });
});

describe('resolveGeneratedAt', () => {
  // 회귀: 재처리가 수집 시각을 덮어써서 배지가 "2시간 전" 이라 표시했지만
  // 실제 데이터는 27.7시간 전 것이었다.
  it('재처리는 기존 수집 시각을 보존한다', () => {
    expect(resolveGeneratedAt('2026-08-28T22:57:36Z', '2026-08-29T03:40:00Z', false)).toBe(
      '2026-08-28T22:57:36Z'
    );
  });

  it('실제 수집이면 새 시각을 쓴다', () => {
    expect(resolveGeneratedAt('2026-08-28T22:57:36Z', '2026-08-29T13:00:00Z', true)).toBe(
      '2026-08-29T13:00:00Z'
    );
  });

  it('기존 값이 없으면 후보를 쓴다', () => {
    expect(resolveGeneratedAt(null, '2026-08-29T13:00:00Z', false)).toBe('2026-08-29T13:00:00Z');
  });
});

describe('buildStats', () => {
  it('미분류는 중립으로 센다', () => {
    const s = buildStats([
      sig({ id: '1', date: '2026-08-01', polarity: 'ally' }),
      sig({ id: '2', date: '2026-08-01', classified: false, polarity: undefined }),
    ]);
    expect(s).toMatchObject({ total: 2, classified: 1, ally: 1, neutral: 1 });
  });
});

describe('rank / bySalience — 무엇을 먼저 보여줄 것인가', () => {
  const sig = (over: Record<string, unknown> = {}) =>
    ({ id: 'x', date: '2026-08-01', classified: true, polarity: 'ally', ...over }) as never;

  it('분류되고 극성이 있는 신호가 앞선다', () => {
    expect(rank(sig())).toBeLessThan(rank(sig({ classified: false })));
    expect(rank(sig())).toBeLessThan(rank(sig({ polarity: 'neutral' })));
  });

  // 같은 등급이면 최신이 먼저다 — 오래된 것이 위에 남으면 화면이 굳는다
  it('같은 등급에서는 최신순', () => {
    const older = sig({ date: '2026-07-01' });
    const newer = sig({ date: '2026-08-20' });
    expect([older, newer].sort(bySalience)[0]).toBe(newer);
  });

  it('등급이 날짜보다 우선한다', () => {
    const oldGood = sig({ date: '2026-01-01' });
    const newNeutral = sig({ date: '2026-08-28', polarity: 'neutral' });
    expect([newNeutral, oldGood].sort(bySalience)[0]).toBe(oldGood);
  });

  it('정렬이 안정적이다 — 같은 입력이면 같은 순서', () => {
    const xs = [sig({ id: 'a' }), sig({ id: 'b' }), sig({ id: 'c' })];
    expect([...xs].sort(bySalience).map((x: { id: string }) => x.id)).toEqual(
      [...xs].sort(bySalience).map((x: { id: string }) => x.id)
    );
  });
});

describe('dedupeByStory — 제목이 바뀌면 id 가 달라진다', () => {
  const s = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      url: 'https://foxnews.com/a',
      pair: ['trump', 'walz'],
      date: '2026-08-19',
      people: ['trump', 'walz'],
      classified: true,
      polarity: 'feud',
      ...over,
    }) as never;

  // 매체가 헤드라인을 고치면 hash(url+title) 이 달라져 같은 기사가 두 번 쌓인다
  it('url 과 관계쌍이 같으면 하나만 남긴다', () => {
    expect(dedupeByStory([s('a'), s('b')])).toHaveLength(1);
  });

  it('url 이 다르면 둘 다 남긴다', () => {
    expect(dedupeByStory([s('a'), s('b', { url: 'https://foxnews.com/other' })])).toHaveLength(2);
  });

  // 같은 기사가 두 관계를 다룰 수 있다 — 관계쌍이 다르면 다른 신호다
  it('관계쌍이 다르면 둘 다 남긴다', () => {
    expect(dedupeByStory([s('a'), s('b', { pair: ['trump', 'cruz'] })])).toHaveLength(2);
  });

  it('관계쌍 순서가 뒤바뀐 것은 같은 것으로 본다', () => {
    expect(dedupeByStory([s('a'), s('b', { pair: ['walz', 'trump'] })])).toHaveLength(1);
  });

  // 판정이 있는 쪽이 정보가 많고, 화면에서 극성 없이 나가는 것을 줄인다
  it('분류된 것을 남긴다', () => {
    const kept = dedupeByStory([s('unclassified', { classified: false, polarity: undefined }), s('classified')]);
    expect(kept.map((x) => x.id)).toEqual(['classified']);
  });

  it('둘 다 분류됐으면 최신을 남긴다', () => {
    const kept = dedupeByStory([s('old', { date: '2026-08-01' }), s('new', { date: '2026-08-19' })]);
    expect(kept.map((x) => x.id)).toEqual(['new']);
  });

  it('전부 같으면 id 순으로 정해 결과가 흔들리지 않게 한다', () => {
    expect(dedupeByStory([s('b'), s('a')]).map((x) => x.id)).toEqual(['a']);
    expect(dedupeByStory([s('a'), s('b')]).map((x) => x.id)).toEqual(['a']);
  });

  it('원래 순서를 지킨다 — 정렬은 호출부의 몫이다', () => {
    const xs = [s('x', { url: 'u1' }), s('y', { url: 'u2' }), s('z', { url: 'u3' })];
    expect(dedupeByStory(xs).map((v) => v.id)).toEqual(['x', 'y', 'z']);
  });

  it('빈 입력은 빈 결과', () => {
    expect(dedupeByStory([])).toEqual([]);
  });

  it('관계쌍이 없어도 터지지 않는다', () => {
    expect(dedupeByStory([s('a', { pair: undefined }), s('b', { pair: undefined })])).toHaveLength(1);
  });
});

describe('applyResult — 침묵을 덮어쓰기로 처리하지 않는다', () => {
  const sig = (over: Record<string, unknown> = {}) =>
    ({
      id: 'a',
      date: '2026-08-13',
      people: ['trump', 'vance', 'rubio'],
      pair: ['trump', 'vance'],
      classified: false,
      ...over,
    }) as never;

  it('판정을 받으면 얹는다', () => {
    const r = applyResult(sig(), { pair: ['trump', 'vance'], polarity: 'feud', confidence: 0.9, summary_en: 'x' });
    expect(r).toMatchObject({ polarity: 'feud', confidence: 0.9, classified: true });
  });

  // 503 두 번에 그 배치의 근거가 통째로 날아갈 뻔했다
  it('판정이 없으면 원본 그대로 — 지우지 않는다', () => {
    const done = sig({ classified: true, polarity: 'ally', summary_en: '기존' });
    expect(applyResult(done, undefined)).toBe(done);
    expect(applyResult(done, { pair: null })).toBe(done);
  });

  it('극성이 빠진 결과도 판정으로 치지 않는다', () => {
    const s = sig();
    expect(applyResult(s, { pair: ['trump', 'vance'], summary_en: 'x' })).toBe(s);
  });

  // 엉뚱한 쌍으로 갈아치우면 근거 파일과 조인이 깨진다
  it('모델이 데이터셋 밖 인물을 짚으면 기존 쌍을 지킨다', () => {
    const r = applyResult(sig(), { pair: ['trump', 'someone-else'] as never, polarity: 'feud' });
    expect(r.pair).toEqual(['trump', 'vance']);
    expect(r.classified).toBe(true);
  });

  it('같은 사람을 두 번 짚어도 기존 쌍을 지킨다', () => {
    const r = applyResult(sig(), { pair: ['trump', 'trump'], polarity: 'feud' });
    expect(r.pair).toEqual(['trump', 'vance']);
  });

  it('제대로 짚으면 쌍을 갱신하고 정렬해 둔다', () => {
    const r = applyResult(sig(), { pair: ['vance', 'rubio'], polarity: 'ally' });
    expect(r.pair).toEqual(['rubio', 'vance']);
  });

  it('원본을 바꾸지 않는다', () => {
    const s = sig();
    applyResult(s, { pair: ['trump', 'vance'], polarity: 'feud' });
    expect(s.classified).toBe(false);
  });
});

describe('pickForRetry', () => {
  const s = (id: string, date: string, classified: boolean) => ({ id, date, classified }) as never;

  it('미분류만 고른다', () => {
    const got = pickForRetry([s('a', '2026-08-01', true), s('b', '2026-08-02', false)], 10);
    expect(got.map((x) => x.id)).toEqual(['b']);
  });

  // 장애가 길었으면 수백 건일 수 있다 — 한 번에 다 부르지 않는다
  it('상한을 넘지 않는다', () => {
    const many = Array.from({ length: 50 }, (_, i) => s(`x${i}`, '2026-08-01', false));
    expect(pickForRetry(many, 20)).toHaveLength(20);
  });

  it('오래된 것부터 처리한다', () => {
    const got = pickForRetry([s('new', '2026-08-20', false), s('old', '2026-08-01', false)], 10);
    expect(got.map((x) => x.id)).toEqual(['old', 'new']);
  });

  it('날짜가 같으면 id 순 — 실행마다 순서가 바뀌지 않게', () => {
    const got = pickForRetry([s('b', '2026-08-01', false), s('a', '2026-08-01', false)], 10);
    expect(got.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('미분류가 없으면 빈 배열', () => {
    expect(pickForRetry([s('a', '2026-08-01', true)], 10)).toEqual([]);
  });
});
