import { describe, expect, it } from 'vitest';
import { buildPairTimeline, polColor } from './timeline';
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
