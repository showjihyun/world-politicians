import { describe, expect, it } from 'vitest';
import {
  hashSeed,
  invalidLabels,
  mergeLabels,
  pruneSuperseded,
  sampleSignals,
  readPairCorrect,
  refreshModel,
  readPolarity,
  score,
  seededShuffle,
  stratumOf,
  toLabelRow,
  verdictAgainst,
  type LabelRow,
  type SignalLike,
} from './labels-core.mts';

const sig = (id: string, over: Partial<SignalLike> = {}): SignalLike => ({
  id,
  url: `https://politico.com/${id}`,
  title: `T ${id}`,
  source: 'Politico',
  date: '2026-08-01',
  pair: ['a', 'b'],
  polarity: 'feud',
  classified: true,
  ...over,
});

const row = (id: string, over: Partial<LabelRow> = {}): LabelRow => ({
  ...toLabelRow(sig(id)),
  ...over,
});

describe('seededShuffle', () => {
  // 매번 다른 기사를 뽑으면 프롬프트 효과와 표본 운을 구분할 수 없다
  it('같은 시드면 같은 순서', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(xs, 42)).toEqual(seededShuffle(xs, 42));
  });

  it('시드가 다르면 순서가 다르다', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(xs, 1)).not.toEqual(seededShuffle(xs, 2));
  });

  it('원본을 바꾸지 않고 같은 원소를 낸다', () => {
    const xs = [1, 2, 3];
    expect(seededShuffle(xs, 9).sort()).toEqual([1, 2, 3]);
    expect(xs).toEqual([1, 2, 3]);
  });
});

describe('hashSeed', () => {
  it('같은 문자열이면 같은 값', () => {
    expect(hashSeed('feud:hub')).toBe(hashSeed('feud:hub'));
  });

  it('다른 문자열이면 다른 값', () => {
    expect(hashSeed('feud:hub')).not.toBe(hashSeed('feud:rest'));
  });
});

describe('stratumOf', () => {
  const hubs = new Set(['trump']);

  it('극성과 허브 여부로 나눈다', () => {
    expect(stratumOf(sig('x', { pair: ['trump', 'cruz'] }), hubs)).toBe('feud:hub');
    expect(stratumOf(sig('y', { pair: ['cruz', 'hawley'] }), hubs)).toBe('feud:rest');
  });

  // 미분류는 극성이 없는 것이지 neutral 이 아니다 — 섞으면 둘 다 못 잰다
  it('미분류를 따로 센다', () => {
    expect(stratumOf(sig('z', { classified: false }), hubs)).toBe('unclassified:rest');
  });
});

describe('sampleSignals', () => {
  const hubs = new Set(['trump']);
  const many = [
    ...Array.from({ length: 60 }, (_, i) => sig(`f${i}`, { pair: ['trump', 'x'] })),
    ...Array.from({ length: 20 }, (_, i) => sig(`a${i}`, { polarity: 'ally', pair: ['c', 'd'] })),
    ...Array.from({ length: 3 }, (_, i) => sig(`n${i}`, { polarity: 'neutral', pair: ['e', 'f'] })),
    ...Array.from({ length: 2 }, (_, i) => sig(`u${i}`, { classified: false, pair: ['g', 'h'] })),
  ];

  it('같은 입력이면 같은 표본', () => {
    expect(sampleSignals(many, 30, hubs, 7).map((s) => s.id)).toEqual(
      sampleSignals(many, 30, hubs, 7).map((s) => s.id)
    );
  });

  // 비례 배분만 하면 드문 층이 한두 건만 들어와 그 층을 못 잰다
  it('드문 층도 가능한 만큼 채운다', () => {
    const got = sampleSignals(many, 40, hubs, 7);
    expect(got.filter((s) => s.polarity === 'neutral')).toHaveLength(3);
    expect(got.filter((s) => !s.classified)).toHaveLength(2);
  });

  it('요청한 수를 넘지 않는다', () => {
    expect(sampleSignals(many, 25, hubs, 7)).toHaveLength(25);
  });

  it('전체보다 많이 요청하면 전체를 낸다', () => {
    expect(sampleSignals(many, 999, hubs, 7)).toHaveLength(many.length);
  });

  it('중복 없이 낸다', () => {
    const got = sampleSignals(many, 50, hubs, 7).map((s) => s.id);
    expect(new Set(got).size).toBe(got.length);
  });
});

describe('mergeLabels — 사람 작업을 덮지 않는다', () => {
  it('이미 채운 칸을 새 표본이 덮지 않는다', () => {
    const done = row('x', { truth: { polarity: 'ally', pairCorrect: true }, note: '확인함' });
    const merged = mergeLabels([done], [row('x')]);
    expect(merged[0].truth).toEqual({ polarity: 'ally', pairCorrect: true });
    expect(merged[0].note).toBe('확인함');
  });

  it('새 항목은 더한다', () => {
    expect(mergeLabels([row('x')], [row('y')]).map((r) => r.id)).toEqual(['x', 'y']);
  });

  // 표본에서 빠졌다고 라벨을 버리면 애써 채운 것이 사라진다
  it('표본에서 빠진 기존 라벨도 버리지 않는다', () => {
    const old = row('old', { truth: { polarity: 'feud', pairCorrect: true } });
    expect(mergeLabels([old], [row('new')]).map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('readPolarity — 오타가 조용히 오답이 되면 안 된다', () => {
  it('정상 값을 읽는다', () => {
    expect(readPolarity('ally')).toBe('ally');
  });

  // 뜻이 분명한 것은 봐준다
  it('대소문자와 앞뒤 공백은 봐준다', () => {
    expect(readPolarity('Feud')).toBe('feud');
    expect(readPolarity(' neutral ')).toBe('neutral');
  });

  // 봐주기 시작하면 어디까지가 유효한지 흐려진다
  it('목록에 없는 값은 읽지 않는다', () => {
    expect(readPolarity('conflict')).toBeNull();
    expect(readPolarity('positive')).toBeNull();
    expect(readPolarity(true)).toBeNull();
    expect(readPolarity(null)).toBeNull();
  });
});

describe('readPairCorrect', () => {
  it('불리언만 받는다', () => {
    expect(readPairCorrect(true)).toBe(true);
    expect(readPairCorrect(false)).toBe(false);
  });

  it("'true' 나 1 은 받지 않는다 — 어디까지가 참인지 흐려진다", () => {
    expect(readPairCorrect('true')).toBeNull();
    expect(readPairCorrect(1)).toBeNull();
  });
});

describe('invalidLabels', () => {
  it('적었는데 읽히지 않는 칸을 짚는다', () => {
    const rows = [row('1', { truth: { polarity: 'conflict' as never, pairCorrect: null } })];
    expect(invalidLabels(rows)).toEqual([{ id: '1', field: 'polarity', value: 'conflict' }]);
  });

  it('빈 칸은 잘못이 아니다 — 아직 안 본 것이다', () => {
    expect(invalidLabels([row('1')])).toEqual([]);
  });

  it('봐줄 수 있는 표기는 잘못이 아니다', () => {
    expect(invalidLabels([row('1', { truth: { polarity: 'Feud' as never, pairCorrect: true } })])).toEqual([]);
  });
});

describe('score', () => {
  it('맞은 것을 센다', () => {
    const rows = [
      row('1', { truth: { polarity: 'feud', pairCorrect: true } }),
      row('2', { truth: { polarity: 'ally', pairCorrect: false } }),
    ];
    const s = score(rows);
    expect(s.polarity).toMatchObject({ scored: 2, correct: 1, accuracy: 50 });
    expect(s.pair).toMatchObject({ scored: 2, correct: 1, accuracy: 50 });
  });

  // 안 본 행을 0 으로 세면 라벨링이 덜 된 것과 모델이 틀린 것이 섞인다
  it('사람이 안 본 행은 채점에서 뺀다', () => {
    const rows = [row('1', { truth: { polarity: 'feud', pairCorrect: true } }), row('2')];
    const s = score(rows);
    expect(s.polarity.scored).toBe(1);
    expect(s.polarity.accuracy).toBe(100);
    expect(s.pending).toBe(1);
  });

  // 오타를 오답으로 세면 모델이 맞았는데 점수가 떨어지고, 그 상태로 잡은
  // 기준선은 낮게 박혀 진짜 하락을 영영 못 잡는다
  it('대소문자가 달라도 맞은 것으로 센다', () => {
    const rows = [row('1', { truth: { polarity: 'FEUD' as never, pairCorrect: true } })];
    expect(score(rows).polarity).toMatchObject({ scored: 1, correct: 1, accuracy: 100 });
  });

  it('읽히지 않는 값은 채점에서 빼고 따로 센다', () => {
    const rows = [
      row('1', { truth: { polarity: 'conflict' as never, pairCorrect: null } }),
      row('2', { truth: { polarity: 'feud', pairCorrect: true } }),
    ];
    const s = score(rows);
    expect(s.polarity).toMatchObject({ scored: 1, correct: 1, accuracy: 100 });
    expect(s.invalid).toBe(1);
  });

  it('어느 쪽으로 틀렸는지 남긴다', () => {
    const rows = [row('1', { truth: { polarity: 'ally', pairCorrect: true } })];
    expect(score(rows).polarity.confusion).toEqual({ 'ally→feud': 1 });
  });

  it('미분류 신호는 극성 채점에서 뺀다 — 모델이 답을 안 낸 것이다', () => {
    const r = { ...row('u'), model: { polarity: null, classified: false } };
    r.truth = { polarity: 'feud', pairCorrect: true };
    const s = score([r]);
    expect(s.polarity.scored).toBe(0);
    expect(s.pair.scored).toBe(1);
  });

  it('라벨이 하나도 없으면 0 으로 나누지 않는다', () => {
    expect(score([row('1')]).polarity.accuracy).toBe(0);
  });
});

describe('verdictAgainst', () => {
  const s = score([
    row('1', { truth: { polarity: 'feud', pairCorrect: true } }),
    row('2', { truth: { polarity: 'feud', pairCorrect: true } }),
    row('3', { truth: { polarity: 'ally', pairCorrect: false } }),
  ]);

  it('기준선이 없으면 통과 — 처음에는 기준을 모른다', () => {
    expect(verdictAgainst(s, null).ok).toBe(true);
  });

  it('기준선보다 크게 떨어지면 잡는다', () => {
    const v = verdictAgainst(s, { polarity: 95, pair: 95 });
    expect(v.ok).toBe(false);
    expect(v.reasons).toHaveLength(2);
  });

  // 표본이 작을 때 1~2건 차이로 깨지면 아무도 안 본다
  it('허용 범위 안의 하락은 통과시킨다', () => {
    expect(verdictAgainst(s, { polarity: s.polarity.accuracy + 2, pair: null }).ok).toBe(true);
  });

  it('채점된 것이 없으면 판정하지 않는다', () => {
    expect(verdictAgainst(score([row('1')]), { polarity: 90, pair: 90 }).ok).toBe(true);
  });
});

describe('refreshModel — 이게 없으면 아무 변화도 감지 못한다', () => {
  const cur = (polarity, classified = true) => ({ polarity, classified });

  it('모델 판정이 바뀌면 갱신하고 센다', () => {
    const rows = [row('a', { model: { polarity: 'feud', classified: true } })];
    const r = refreshModel(rows, new Map([['a', cur('ally')]]));
    expect(r.rows[0].model.polarity).toBe('ally');
    expect(r.changed).toBe(1);
  });

  it('같으면 그대로 두고 세지 않는다', () => {
    const rows = [row('a', { model: { polarity: 'feud', classified: true } })];
    const r = refreshModel(rows, new Map([['a', cur('feud')]]));
    expect(r.changed).toBe(0);
    expect(r.rows[0]).toBe(rows[0]);
  });

  // 재분류가 돌면 미분류였던 행이 분류된다 — 이걸 반영 못 하면 그 행은
  // 영원히 극성 채점에서 빠진다
  it('미분류가 분류되면 반영한다', () => {
    const rows = [row('a', { model: { polarity: null, classified: false } })];
    const r = refreshModel(rows, new Map([['a', cur('feud', true)]]));
    expect(r.rows[0].model).toEqual({ polarity: 'feud', classified: true });
    expect(r.changed).toBe(1);
  });

  // 365일이 지나 아카이브에서 빠져도 라벨을 버리지 않는다
  it('아카이브에 없으면 스냅샷을 지키고 stale 로 센다', () => {
    const rows = [row('gone', { model: { polarity: 'feud', classified: true } })];
    const r = refreshModel(rows, new Map());
    expect(r.rows[0].model.polarity).toBe('feud');
    expect(r.stale).toBe(1);
    expect(r.changed).toBe(0);
  });

  it('사람이 채운 truth 는 건드리지 않는다', () => {
    const rows = [row('a', { model: { polarity: 'feud', classified: true }, truth: { polarity: 'ally', pairCorrect: true } })];
    const r = refreshModel(rows, new Map([['a', cur('neutral')]]));
    expect(r.rows[0].truth).toEqual({ polarity: 'ally', pairCorrect: true });
  });
});

describe('score — pending 이 음수가 되지 않는다', () => {
  // 한 칸은 맞고 한 칸은 오타면 labeled 와 invalid 에 동시에 들어간다
  it('한 칸만 오타여도 pending 이 음수가 되지 않는다', () => {
    const rows = [row('1', { truth: { polarity: 'conflict', pairCorrect: true } })];
    const s = score(rows);
    expect(s.pending).toBe(0);
    expect(s.invalid).toBe(1);
    expect(s.labeled).toBe(1);
  });

  it('아무것도 안 채운 행만 pending 으로 센다', () => {
    const s = score([row('1'), row('2', { truth: { polarity: 'feud', pairCorrect: true } })]);
    expect(s.pending).toBe(1);
  });
});

describe('pruneSuperseded — 같은 기사를 두 번 라벨링하지 않는다', () => {
  const r2 = (id: string, url: string) => ({ ...row(id), url });

  // 중복 제거로 사라진 행의 쌍둥이가 표본에 있으면 같은 기사를 두 번 보게 된다
  it('살아있는 쌍둥이가 표본에 있으면 버린다', () => {
    const rows = [r2('dead', 'https://a'), r2('live', 'https://a')];
    const out = pruneSuperseded(rows, new Set(['live']));
    expect(out.rows.map((x) => x.id)).toEqual(['live']);
    expect(out.dropped).toEqual(['dead']);
  });

  // 365일이 지나 빠진 것은 대신할 행이 없다 — 스냅샷으로 남긴다
  it('쌍둥이가 없으면 남긴다', () => {
    const rows = [r2('old', 'https://gone')];
    const out = pruneSuperseded(rows, new Set());
    expect(out.rows).toHaveLength(1);
    expect(out.dropped).toEqual([]);
  });

  it('url 이 같아도 관계쌍이 다르면 쌍둥이가 아니다', () => {
    const a = { ...row('dead'), url: 'https://a', pair: ['x', 'y'] };
    const b = { ...row('live'), url: 'https://a', pair: ['x', 'z'] };
    expect(pruneSuperseded([a, b], new Set(['live'])).rows).toHaveLength(2);
  });

  it('전부 살아 있으면 아무것도 버리지 않는다', () => {
    const rows = [r2('a', 'https://a'), r2('b', 'https://b')];
    expect(pruneSuperseded(rows, new Set(['a', 'b'])).dropped).toEqual([]);
  });
});
