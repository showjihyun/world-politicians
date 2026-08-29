/**
 * 도메인 그래프 함수에 실제 데이터셋을 묶는 어댑터.
 * 컴포넌트는 지금까지처럼 '../lib/graph' 에서 가져다 쓰면 된다 —
 * 순수 로직만 src/domain/graph.ts 로 옮겼을 뿐 호출부는 그대로다.
 */
import { COSPONSOR_RELATIONSHIPS } from '../data/cosponsorship';
import { RELATIONSHIPS } from '../data/relationships';
import { buildGraph as buildGraphPure } from '../domain/graph';
import type { Politician } from '../types';

export * from '../domain/graph';

/**
 * 이 앱의 관계 데이터로 그래프를 만든다.
 *
 * 큐레이션한 관계에 공동발의 엣지를 얹는다. 후자는 측정값이라 타입이 다르고,
 * 범례에서 따로 끌 수 있다. 이미 큐레이션된 쌍은 데이터 쪽에서 걸러 두었다 —
 * 두 노드 사이에 선을 두 번 그으면 읽을 수 없다.
 */
export function buildGraph(politicians: Politician[]) {
  return buildGraphPure(politicians, [...RELATIONSHIPS, ...COSPONSOR_RELATIONSHIPS]);
}
