import { describe, expect, it } from 'vitest';
import {
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
