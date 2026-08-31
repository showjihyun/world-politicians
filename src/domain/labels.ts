/**
 * 라벨을 어디까지 그릴 것인가 — 순수 함수만 둔다.
 *
 * 라벨을 노드마다 따로 그리면 반드시 겹친다. 노드는 서로를 모르기 때문이다.
 * 실제로 중앙 군집에서 이름이 서로를 덮어 읽을 수 없었다 — 정보가 있는데
 * 못 읽는 상태라, 노드를 더 그릴수록 더 나빠졌다.
 *
 * 프레임을 다 그린 뒤 한 번에, **중요한 것부터** 놓고 자리가 없으면 건너뛴다.
 * 건너뛴 이름은 확대하거나 노드에 커서를 올리면 나온다.
 *
 * 규칙: 이 파일은 런타임 import 를 갖지 않는다.
 */

export interface LabelBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 우선순위 순으로 받아 겹치지 않는 것만 남긴다.
 *
 * 앞선 것이 이긴다 — 그래서 호출부가 정렬 순서로 "무엇을 반드시 보일지" 를
 * 정한다. 커서를 올린 노드를 맨 앞에 두면 그 이름은 언제나 살아남는다.
 *
 * `gap` 은 상자 사이 최소 간격이다. 0 이면 글자끼리 딱 붙어 두 이름이 한 덩어리로
 * 보인다 — 겹치지 않아도 읽기 어려운 것은 마찬가지다.
 */
export function placeLabels(boxes: LabelBox[], gap = 0): Set<string> {
  const placed: LabelBox[] = [];
  const kept = new Set<string>();
  for (const b of boxes) {
    const collides = placed.some(
      (p) =>
        b.left < p.right + gap &&
        b.right > p.left - gap &&
        b.top < p.bottom + gap &&
        b.bottom > p.top - gap
    );
    if (collides) continue;
    placed.push(b);
    kept.add(b.id);
  }
  return kept;
}
