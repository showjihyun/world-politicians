import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelBox } from './labels';

const box = (id: string, left: number, top: number, w = 60, h = 14): LabelBox => ({
  id,
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe('placeLabels', () => {
  it('겹치지 않으면 전부 남는다', () => {
    const kept = placeLabels([box('a', 0, 0), box('b', 100, 0), box('c', 0, 40)]);
    expect([...kept].sort()).toEqual(['a', 'b', 'c']);
  });

  it('겹치면 앞선 것이 이긴다', () => {
    const kept = placeLabels([box('first', 0, 0), box('second', 10, 5)]);
    expect(kept.has('first')).toBe(true);
    expect(kept.has('second')).toBe(false);
  });

  // 호출부가 정렬로 "반드시 보일 것" 을 정한다. 커서를 올린 노드를 맨 앞에 두면
  // 그 이름은 무엇과 겹쳐도 살아남는다.
  it('맨 앞에 둔 것은 언제나 살아남는다', () => {
    const kept = placeLabels([box('hover', 10, 5), box('other', 0, 0)]);
    expect(kept.has('hover')).toBe(true);
    expect(kept.has('other')).toBe(false);
  });

  it('탈락한 것은 자리를 차지하지 않는다 — 뒤엣것이 그 자리에 들어갈 수 있다', () => {
    // b 는 a 와 겹쳐 탈락한다. c 는 a 와는 안 겹치고 b 와만 겹친다 → 남아야 한다.
    const kept = placeLabels([box('a', 0, 0, 60, 14), box('b', 50, 0, 60, 14), box('c', 70, 0, 60, 14)]);
    expect([...kept].sort()).toEqual(['a', 'c']);
  });

  it('가로로만 떨어져 있어도 통과한다', () => {
    const kept = placeLabels([box('a', 0, 0, 60, 14), box('b', 61, 0, 60, 14)]);
    expect(kept.size).toBe(2);
  });

  it('세로로만 떨어져 있어도 통과한다', () => {
    const kept = placeLabels([box('a', 0, 0, 60, 14), box('b', 0, 15, 60, 14)]);
    expect(kept.size).toBe(2);
  });

  // 딱 붙으면 겹치지 않아도 두 이름이 한 덩어리로 보인다.
  it('gap 을 주면 맞닿은 것도 떨어뜨린다', () => {
    const pair = [box('a', 0, 0, 60, 14), box('b', 61, 0, 60, 14)];
    expect(placeLabels(pair, 0).size).toBe(2);
    expect(placeLabels(pair, 4).size).toBe(1);
  });

  it('모서리만 스치는 것은 겹친 것이 아니다', () => {
    const kept = placeLabels([box('a', 0, 0, 60, 14), box('b', 60, 14, 60, 14)]);
    expect(kept.size).toBe(2);
  });

  it('빈 목록은 빈 결과', () => {
    expect(placeLabels([]).size).toBe(0);
  });

  it('같은 자리에 여럿이면 하나만 남는다', () => {
    const kept = placeLabels(['a', 'b', 'c', 'd'].map((id) => box(id, 0, 0)));
    expect([...kept]).toEqual(['a']);
  });
});
