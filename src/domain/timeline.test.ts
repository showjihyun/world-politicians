import { describe, expect, it } from 'vitest';
import { buildPairTimeline, groupByDay, polColor, tallyMonth, type DayUnit } from './timeline';
import type { HistoryArc } from '../data/signal-history';
import type { NewsSignal } from '../types';

const NOW = new Date('2026-08-15T00:00:00Z'); // 시점을 고정한다 — 달이 바뀌어도 결과가 같아야 한다

const sig = (date: string, polarity: NewsSignal['polarity'], id = date): NewsSignal => ({
  id,
  date,
  source: 'AP News',
  url: 'https://apnews.com/x',
  title: `t-${id}`,
  people: ['a', 'b'],
  pair: ['a', 'b'],
  polarity,
  classified: true,
});

const arc = (points: HistoryArc['points']): HistoryArc[] => [{ a: 'a', b: 'b', points }];
const pairs = (list: NewsSignal[]) => new Map([['a|b', list]]);

describe('buildPairTimeline', () => {
  it('데이터가 전혀 없으면 null', () => {
    expect(buildPairTimeline('a', 'b', 6, new Map(), [], NOW)).toBeNull();
  });

  // 회귀: 창 시작 이전의 큐레이션 포인트를 seed 하지 않아, 창 앞부분이 통째로 비고
  // 마치 창 안에서 처음 관계가 생긴 것처럼 보였다 (trump×musk 의 반전이 사라졌다).
  it('창 시작 이전의 마지막 큐레이션 포인트를 이어받는다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 3,
      new Map(),
      arc([{ ym: '2025-01', polarity: 'feud', note: { en: '', ko: '' } }]),
      NOW
    );
    expect(tl).not.toBeNull();
    // 창은 2026-06~08. 그보다 훨씬 이전 포인트 하나뿐이어도 전 구간이 채워져야 한다
    expect(tl!.cells).toHaveLength(3);
    expect(tl!.cells.every((c) => c.polarity === 'feud')).toBe(true);
  });

  it('극성이 바뀌는 지점을 flip 으로 표시한다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 3,
      new Map(),
      arc([
        { ym: '2025-01', polarity: 'feud', note: { en: '', ko: '' } },
        { ym: '2026-07', polarity: 'ally', note: { en: 'made up', ko: '화해' } },
      ]),
      NOW
    );
    const flips = tl!.flips;
    expect(flips).toHaveLength(1);
    expect(flips[0].ym).toBe('2026-07');
    expect(flips[0].polarity).toBe('ally');
  });

  it('뉴스 신호가 있으면 큐레이션 아크보다 우선한다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 2,
      pairs([sig('2026-08-02', 'ally')]),
      arc([{ ym: '2025-01', polarity: 'feud', note: { en: '', ko: '' } }]),
      NOW
    );
    const aug = tl!.cells.find((c) => c.ym === '2026-08')!;
    expect(aug.polarity).toBe('ally');
    expect(aug.curated).toBe(false);
  });

  it('같은 달에 상반된 신호가 있으면 더 강한 극성을 남긴다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([sig('2026-08-01', 'neutral', 'n'), sig('2026-08-02', 'feud', 'f')]),
      [],
      NOW
    );
    expect(tl!.cells[tl!.cells.length - 1].polarity).toBe('feud');
  });

  it('창 밖의 오래된 신호는 무시한다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([sig('2020-01-01', 'ally')]),
      [],
      NOW
    );
    expect(tl).toBeNull();
  });

  it('기준 시점을 바꾸면 창도 함께 움직인다', () => {
    const arcs = arc([{ ym: '2025-01', polarity: 'ally', note: { en: '', ko: '' } }]);
    const a = buildPairTimeline('a', 'b', 2, new Map(), arcs, new Date('2026-08-15T00:00:00Z'));
    const b = buildPairTimeline('a', 'b', 2, new Map(), arcs, new Date('2026-03-15T00:00:00Z'));
    expect(a!.cells[a!.cells.length - 1].ym).toBe('2026-08');
    expect(b!.cells[b!.cells.length - 1].ym).toBe('2026-03');
  });
});

/** 같은 날을 여러 매체가 다룬 상황을 만든다 */
const from = (date: string, polarity: NewsSignal['polarity'], source: string): NewsSignal => ({
  ...sig(date, polarity, `${date}-${source}`),
  source,
});

const unit = (
  date: string,
  polarity: DayUnit['polarity'],
  weight = 1,
  contested = false
): DayUnit => ({ date, polarity, contested, outlets: 1, weight, unclassified: 0, note: null });

describe('groupByDay — 하루 한 표', () => {
  it('같은 날 다섯 매체가 다뤄도 한 표다', () => {
    const units = groupByDay(
      ['CNN', 'Fox News', 'The Hill', 'AP News', 'Reuters'].map((s) =>
        from('2026-08-05', 'feud', s)
      )
    );
    expect(units).toHaveLength(1);
    expect(units[0].outlets).toBe(5);
    expect(units[0].polarity).toBe('feud');
    // 다섯 매체가 다섯 표가 되면 안 된다 — 한 통신사 기사를 받아쓴 것일 수 있다
    expect(units[0].weight).toBeLessThan(3);
    expect(units[0].weight).toBeGreaterThan(1);
  });

  it('매체가 하나면 가중이 1 이다', () => {
    expect(groupByDay([sig('2026-08-05', 'feud')])[0].weight).toBe(1);
  });

  it('하루 안에서 판정이 갈리면 그날은 투표하지 않는다', () => {
    const [u] = groupByDay([
      from('2026-08-05', 'ally', 'Fox News'),
      from('2026-08-05', 'feud', 'CBS News'),
    ]);
    expect(u.polarity).toBeNull();
    expect(u.contested).toBe(true);
  });

  it('다수가 3분의 2 를 넘으면 그날의 판정으로 인정한다', () => {
    const [u] = groupByDay([
      from('2026-08-05', 'feud', 'Fox News'),
      from('2026-08-05', 'feud', 'CBS News'),
      from('2026-08-05', 'ally', 'CNN'),
    ]);
    expect(u.polarity).toBe('feud');
  });

  // 미분류를 아무 표시 없이 흘리면 "판정이 없다" 가 "아무 일도 없었다" 로 보인다
  it('미분류만 있는 날은 중립으로 채우고 미분류 수를 남긴다', () => {
    const [u] = groupByDay([{ ...sig('2026-08-05', undefined), classified: false }]);
    expect(u.polarity).toBe('neutral');
    expect(u.unclassified).toBe(1);
  });

  it('날짜순으로 돌려준다', () => {
    const dates = groupByDay([sig('2026-08-09', 'ally'), sig('2026-08-02', 'feud')]).map(
      (u) => u.date
    );
    expect(dates).toEqual(['2026-08-02', '2026-08-09']);
  });

  // 회귀: 하루 안 다수를 기사 수로 세면 한 매체가 여러 건 쓴 날을 그 매체가 정한다.
  // "하루 한 표" 의 요점은 매체를 세는 것이지 기사를 세는 것이 아니다.
  it('하루 안 다수는 기사 수가 아니라 매체 수로 센다', () => {
    const [u] = groupByDay([
      { ...from('2026-08-05', 'feud', 'The Hill'), id: 'h1' },
      { ...from('2026-08-05', 'feud', 'The Hill'), id: 'h2' },
      { ...from('2026-08-05', 'feud', 'The Hill'), id: 'h3' },
      { ...from('2026-08-05', 'ally', 'CNN'), id: 'c1' },
    ]);
    // 기사로 세면 feud 3/4 = 75% 로 이긴다. 매체로 세면 1대1 이라 그날은 투표하지 않는다
    expect(u.polarity).toBeNull();
    expect(u.contested).toBe(true);
  });

  // 회귀: 가중을 "그날 이 쌍을 다룬 매체" 로 세면, 한 매체가 판정하고 다섯이 동반언급만
  // 쓴 날이 세 매체가 합의한 날보다 무거워진다. 뒷받침의 뜻이 정확히 뒤집힌다.
  it('판정을 내지 않은 매체는 가중에 세지 않는다', () => {
    const [oneVoter] = groupByDay([
      from('2026-08-05', 'feud', 'CNN'),
      ...['A', 'B', 'C', 'D', 'E'].map((s, i) => ({ ...from('2026-08-05', 'neutral', s), id: `n${i}` })),
    ]);
    const [threeVoters] = groupByDay(
      ['CNN', 'Fox News', 'NPR'].map((s) => from('2026-08-06', 'feud', s))
    );
    expect(oneVoter.outlets).toBe(1);
    expect(threeVoters.outlets).toBe(3);
    expect(oneVoter.weight).toBeLessThan(threeVoters.weight);
  });

  // 회귀: 호출부가 넘기는 순서는 정해져 있지 않다(bySalience 가 같은 날짜에 대해
  // 일관성 없는 비교자다). 정렬하지 않으면 무관한 신호가 늘 때마다 툴팁이 바뀐다.
  it('같은 날 신호의 순서가 달라져도 노트가 같다', () => {
    const a = { ...from('2026-08-05', 'feud', 'CNN'), summary_en: 'A', summary_ko: '가' };
    const b = { ...from('2026-08-05', 'feud', 'Fox News'), summary_en: 'B', summary_ko: '나' };
    expect(groupByDay([a, b])[0].note).toEqual(groupByDay([b, a])[0].note);
  });

  // 회귀: 같은 뉴스룸의 이름 변형이 각각 한 표를 던지면 "하루 한 표" 가 무너진다.
  // 아카이브에 Politico · POLITICO Pro · E&E News by POLITICO 가 함께 있다.
  it('같은 뉴스룸의 이름 변형은 한 표다', () => {
    const [u] = groupByDay([
      { ...from('2026-08-05', 'feud', 'Politico'), outlet: 'Politico', id: 'p1' },
      { ...from('2026-08-05', 'feud', 'POLITICO Pro'), outlet: 'Politico', id: 'p2' },
      { ...from('2026-08-05', 'ally', 'CNN'), id: 'c1' },
    ]);
    // 원본으로 세면 feud 2 대 ally 1 로 feud 가 이긴다. 정본으로 세면 1대1 이라 갈린다
    expect(u.outlets).toBe(2);
    expect(u.polarity).toBeNull();
    expect(u.contested).toBe(true);
  });

  // 회귀: 모든 매체가 각자 안에서 갈린 날은 표가 하나도 없어 중립으로 떨어졌다.
  // "아무 일도 없었다" 가 아니라 가장 센 불일치인데 화면이 조용했다.
  it('모든 매체가 각자 갈린 날은 불일치로 표시한다', () => {
    const [u] = groupByDay([
      { ...from('2026-08-05', 'ally', 'CNN'), id: 'c1' },
      { ...from('2026-08-05', 'feud', 'CNN'), id: 'c2' },
      { ...from('2026-08-05', 'ally', 'Fox News'), id: 'f1' },
      { ...from('2026-08-05', 'feud', 'Fox News'), id: 'f2' },
    ]);
    expect(u.contested).toBe(true);
    expect(u.polarity).toBe('neutral');
  });

  // 회귀: 갈려서 어느 쪽도 밀지 않은 매체까지 세면, 한 매체가 판정하고 다섯이 서로
  // 갈린 날이 세 매체가 합의한 날보다 무거워진다. 이 필드가 막으려던 역전이다.
  it('갈린 매체는 가중에 세지 않는다', () => {
    const [oneVoter] = groupByDay([
      { ...from('2026-08-05', 'feud', 'CNN'), id: 'c1' },
      ...['A', 'B', 'C', 'D', 'E'].flatMap((s, i) => [
        { ...from('2026-08-05', 'ally', s), id: `a${i}` },
        { ...from('2026-08-05', 'feud', s), id: `b${i}` },
      ]),
    ]);
    const [threeVoters] = groupByDay(
      ['CNN', 'Fox News', 'NPR'].map((s) => from('2026-08-06', 'feud', s))
    );
    expect(oneVoter.outlets).toBe(1);
    expect(oneVoter.weight).toBeLessThan(threeVoters.weight);
  });

  it('한 매체가 같은 날 갈리면 그 매체는 어느 쪽도 밀지 않는다', () => {
    const [u] = groupByDay([
      { ...from('2026-08-05', 'feud', 'The Hill'), id: 'h1' },
      { ...from('2026-08-05', 'ally', 'The Hill'), id: 'h2' },
      { ...from('2026-08-05', 'feud', 'CNN'), id: 'c1' },
    ]);
    // The Hill 은 자기 안에서 갈렸다. 남는 것은 CNN 의 feud 하나뿐이다
    expect(u.polarity).toBe('feud');
  });
});

describe('tallyMonth — 가중 다수결과 반전 이력', () => {
  // 회귀: 예전에는 그 달 첫 비중립 신호가 이겼다. feud 와 ally 의 가중치가 같아
  // "더 강한 극성 유지" 조건이 항상 거짓이었기 때문이다.
  it('첫 신호가 아니라 다수가 이긴다', () => {
    const r = tallyMonth([unit('2026-08-01', 'feud'), unit('2026-08-02', 'ally'), unit('2026-08-03', 'ally')], null);
    expect(r.polarity).toBe('ally');
  });

  it('반전은 2배를 넘어야 인정한다', () => {
    const r = tallyMonth([unit('2026-08-01', 'ally', 3), unit('2026-08-02', 'feud', 2)], 'feud');
    expect(r.polarity).toBe('feud'); // 3 < 2 × 2 이므로 이전 달을 지킨다
    expect(r.contested).toBe(true);
  });

  it('2배를 넘으면 반전한다', () => {
    const r = tallyMonth([unit('2026-08-01', 'ally', 3), unit('2026-08-02', 'feud', 1)], 'feud');
    expect(r.polarity).toBe('ally');
  });

  it('이전 달이 없으면 이력 없이 다수를 따른다', () => {
    expect(tallyMonth([unit('2026-08-01', 'ally', 3), unit('2026-08-02', 'feud', 2)], null).polarity).toBe('ally');
  });

  it('이겼어도 2배에 못 미치면 불일치로 표시한다', () => {
    const r = tallyMonth([unit('2026-08-01', 'ally', 3), unit('2026-08-02', 'feud', 2)], null);
    expect(r.polarity).toBe('ally');
    expect(r.contested).toBe(true);
  });

  it('반대 표가 없으면 불일치가 아니다', () => {
    expect(tallyMonth([unit('2026-08-01', 'ally', 1)], null).contested).toBe(false);
  });

  it('동률이면 이전 달을 지킨다', () => {
    const r = tallyMonth([unit('2026-08-01', 'ally'), unit('2026-08-02', 'feud')], 'ally');
    expect(r.polarity).toBe('ally');
    expect(r.contested).toBe(true);
  });

  it('결정적 표가 없으면 중립, 아무 날도 없으면 null', () => {
    expect(tallyMonth([unit('2026-08-01', 'neutral')], null).polarity).toBe('neutral');
    expect(tallyMonth([], null).polarity).toBeNull();
  });

  // 회귀: 중립을 극(pole)으로 취급하면 조용한 달 하나가 다음 달의 진짜 다수를 깎는다.
  // 같은 입력이 앞달의 조용함 여부만으로 다른 색이 되면 안 된다.
  it('중립은 극이 아니다 — 조용한 달이 다음 달 다수를 막지 않는다', () => {
    const units = [unit('2026-08-01', 'ally', 3), unit('2026-08-02', 'feud', 2)];
    expect(tallyMonth(units, 'neutral').polarity).toBe('ally');
    expect(tallyMonth(units, null).polarity).toBe('ally');
  });
});

describe('buildPairTimeline — 하루 한 표가 셀에 반영된다', () => {
  // 회귀: 옛 규칙에서는 이 입력이 feud 를 냈다. 1건이 6건을 이겼다.
  it('feud 1건 뒤에 ally 6건이 오면 셀은 ally 다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([
        sig('2026-08-01', 'feud'),
        ...['02', '03', '04', '05', '06', '07'].map((d) => sig(`2026-08-${d}`, 'ally')),
      ]),
      [],
      NOW
    );
    const aug = tl!.cells[tl!.cells.length - 1];
    expect(aug.polarity).toBe('ally');
  });

  it('같은 날 매체가 갈리면 그 달은 표가 없고 불일치로 표시된다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([from('2026-08-05', 'ally', 'Fox News'), from('2026-08-05', 'feud', 'CBS News')]),
      [],
      NOW
    );
    const aug = tl!.cells[tl!.cells.length - 1];
    expect(aug.polarity).toBe('neutral');
    expect(aug.contested).toBe(true);
  });

  // 회귀: 셀은 회색인데 설명은 "X 가 Y 를 공격했다" 가 붙던 자리.
  // 색과 설명이 다른 말을 하면 둘 다 못 믿게 된다.
  it('셀을 설명하지 못하는 요약은 붙이지 않는다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([from('2026-08-05', 'ally', 'Fox News'), from('2026-08-06', 'feud', 'CBS News')]),
      [],
      NOW
    );
    const aug = tl!.cells[tl!.cells.length - 1];
    expect(aug.polarity).toBe('neutral'); // 1대1 동률
    expect(aug.note).toBeNull(); // ally 도 feud 도 이 셀을 설명하지 않는다
  });

  it('미분류만 있는 달은 그 수를 셀에 남긴다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 1,
      pairs([{ ...sig('2026-08-05', undefined), classified: false }]),
      [],
      NOW
    );
    expect(tl!.cells[tl!.cells.length - 1].unclassified).toBe(1);
  });

  // 회귀: live 로 정해진 달 다음의 빈 달이 `curated: true` 로 그려졌다. 화면과
  // 범례는 그걸 손으로 큐레이션한 편집 판단이라고 말한다 — 측정값을 편집 판단으로
  // 둔갑시키는 것이라, 이 저장소가 절대 섞지 말라고 한 구분이 깨진다.
  it('뉴스로 정해진 달을 이어받은 빈 달은 큐레이션이 아니다', () => {
    const tl = buildPairTimeline(
      'a', 'b', 3,
      pairs(['01', '02', '03'].map((d) => sig(`2026-06-${d}`, 'feud'))),
      [],
      NOW
    );
    const cells = tl!.cells;
    expect(cells.find((c) => c.ym === '2026-06')!.curated).toBe(false);
    // 07·08 은 데이터가 없어 이어받은 달이다 — 출처는 여전히 뉴스다
    expect(cells.find((c) => c.ym === '2026-07')!.curated).toBe(false);
    expect(cells.find((c) => c.ym === '2026-08')!.curated).toBe(false);
  });

  // 창을 좁혔다는 이유만으로 같은 달의 색이 달라지면 안 된다
  it('반전 판정이 창 경계에서 끊기지 않는다', () => {
    const signals = [
      ...['01', '02', '03'].map((d) => sig(`2026-06-${d}`, 'feud')),
      sig('2026-08-01', 'ally'),
      sig('2026-08-02', 'feud'),
    ];
    const wide = buildPairTimeline('a', 'b', 3, pairs(signals), [], NOW);
    const narrow = buildPairTimeline('a', 'b', 1, pairs(signals), [], NOW);
    const last = (t: typeof wide) => t!.cells[t!.cells.length - 1].polarity;
    expect(last(narrow)).toBe(last(wide));
  });
});

describe('polColor', () => {
  it('세 극성에 서로 다른 색을 준다', () => {
    const cs = [polColor('ally'), polColor('feud'), polColor('neutral')];
    expect(new Set(cs).size).toBe(3);
  });

  // 모르는 값이 오면 중립색이어야 한다 — 동맹색으로 떨어지면 없는 관계를 그린다
  it('모르는 값은 중립색', () => {
    expect(polColor('nonsense' as never)).toBe(polColor('neutral'));
  });
});
