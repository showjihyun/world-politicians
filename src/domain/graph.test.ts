import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  createCenteringForce,
  isLinkVisible,
  isNodeVisible,
  pairKey,
  rotateNodes,
  type Filters,
  type GraphNode,
} from './graph';
import { ALL_REL_TYPES } from '../types';
import type { Politician, Relationship } from '../types';

const person = (id: string, over: Partial<Politician> = {}): Politician => ({
  id,
  name: { en: id, ko: id },
  enName: id,
  party: 'R',
  branch: 'senate',
  role: { en: '', ko: '' },
  faction: 'maga',
  prominence: 5,
  buzz: 50,
  bio: { en: '', ko: '' },
  tags: [],
  ...over,
});

const rel = (a: string, b: string, over: Partial<Relationship> = {}): Relationship => ({
  a,
  b,
  type: 'ally',
  strength: 2,
  note: { en: '', ko: '' },
  ...over,
});

// 관계 유형이 늘 때마다 고쳐야 하는 목록을 두지 않는다 — 정본에서 가져온다
const ALL_REL: Filters['relTypes'] = [...ALL_REL_TYPES];
const filters = (over: Partial<Filters> = {}): Filters => ({
  parties: [],
  branches: [],
  factions: [],
  relTypes: [...ALL_REL],
  strongOnly: false,
  ...over,
});

describe('pairKey', () => {
  it('두 방향이 같은 키를 만든다', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});

describe('buildGraph', () => {
  it('degree 와 feud/bridge 카운트를 양쪽 노드에 더한다', () => {
    const { nodes } = buildGraph(
      [person('a'), person('b')],
      [rel('a', 'b', { type: 'feud' })]
    );
    const [a, b] = nodes;
    expect([a.degree, b.degree]).toEqual([1, 1]);
    expect([a.feudCount, b.feudCount]).toEqual([1, 1]);
    expect([a.bridgeCount, b.bridgeCount]).toEqual([0, 0]);
  });

  it('같은 페어가 중복 정의돼도 엣지는 하나만 만든다', () => {
    const { links, nodes } = buildGraph(
      [person('a'), person('b')],
      [rel('a', 'b'), rel('b', 'a', { type: 'feud' })]
    );
    expect(links).toHaveLength(1);
    expect(nodes[0].degree).toBe(1);
  });

  it('데이터셋에 없는 인물을 참조하는 관계는 버린다', () => {
    const { links } = buildGraph([person('a')], [rel('a', 'ghost')]);
    expect(links).toHaveLength(0);
  });

  it('자기 자신과의 관계는 버린다', () => {
    const { links } = buildGraph([person('a')], [rel('a', 'a')]);
    expect(links).toHaveLength(0);
  });

  // feud 전용이던 규칙을 일반화했다. 공동발의도 "더 많이 서명한 쪽" 에서 흘러야 한다
  it('cosponsor 도 initiator 방향으로 향한다', () => {
    const g = buildGraph(
      [person('a'), person('b')],
      [rel('a', 'b', { type: 'cosponsor', initiator: 'b' })]
    );
    expect(g.links[0].source).toBe('b');
    expect(g.links[0].target).toBe('a');
  });

  it('initiator 가 없으면 원래 순서를 지킨다', () => {
    const g = buildGraph([person('a'), person('b')], [rel('a', 'b', { type: 'cosponsor' })]);
    expect(g.links[0].source).toBe('a');
  });

  it('feud 는 initiator 방향으로 향하게 한다 — 입자가 공격자에서 흘러야 한다', () => {
    const { links } = buildGraph(
      [person('a'), person('b')],
      [rel('a', 'b', { type: 'feud', initiator: 'b' })]
    );
    expect(links[0].source).toBe('b');
    expect(links[0].target).toBe('a');
  });

  it('인접 관계는 양방향으로 기록한다', () => {
    const { adjacency } = buildGraph([person('a'), person('b')], [rel('a', 'b')]);
    expect(adjacency.get('a')?.has('b')).toBe(true);
    expect(adjacency.get('b')?.has('a')).toBe(true);
  });
});

describe('isLinkVisible — 관계 유형 필터', () => {
  const nodes = new Set(['a', 'b']);
  const link = { id: 'a|b', source: 'a', target: 'b', rel: rel('a', 'b') };

  it('선택된 유형이면 보인다', () => {
    expect(isLinkVisible(link, filters(), nodes)).toBe(true);
  });

  // 회귀: 예전 모델은 "빈 배열 = 전체 표시" 라서 "전부 끄기" 를 표현할 수 없었다.
  // 지금은 선택된 것만 명시하므로 빈 배열은 '아무것도 안 보임' 이어야 한다.
  it('빈 배열은 전체가 아니라 아무것도 아니다', () => {
    expect(isLinkVisible(link, filters({ relTypes: [] }), nodes)).toBe(false);
  });

  it('끝점이 숨겨져 있으면 엣지도 숨긴다', () => {
    expect(isLinkVisible(link, filters(), new Set(['a']))).toBe(false);
  });

  it('strongOnly 는 강도 2 미만을 거른다', () => {
    const weak = { ...link, rel: rel('a', 'b', { strength: 1 }) };
    expect(isLinkVisible(weak, filters({ strongOnly: true }), nodes)).toBe(false);
  });
});

describe('isNodeVisible', () => {
  const n = { ...person('a'), degree: 0, feudCount: 0, bridgeCount: 0 } as GraphNode;

  it('필터가 비어 있으면 전부 보인다', () => {
    expect(isNodeVisible(n, filters(), null)).toBe(true);
  });

  it('스토리 포커스 밖이면 숨긴다', () => {
    expect(isNodeVisible(n, filters(), new Set(['other']))).toBe(false);
  });

  it('정당 필터가 걸리면 해당 정당만 보인다', () => {
    expect(isNodeVisible(n, filters({ parties: ['D'] }), null)).toBe(false);
    expect(isNodeVisible(n, filters({ parties: ['R'] }), null)).toBe(true);
  });
});

describe('rotateNodes', () => {
  const mk = (x: number, y: number): GraphNode =>
    ({ ...person('n'), degree: 0, feudCount: 0, bridgeCount: 0, x, y }) as GraphNode;

  it('중심점을 기준으로 회전한다 — 중심 자체는 움직이지 않는다', () => {
    const nodes = [mk(-1, 0), mk(1, 0)];
    rotateNodes(nodes, 180);
    expect(nodes[0].x).toBeCloseTo(1, 6);
    expect(nodes[1].x).toBeCloseTo(-1, 6);
  });

  it('고정된 노드는 fx/fy 도 함께 옮긴다 — 안 그러면 시뮬레이션이 되돌린다', () => {
    const n = mk(1, 0);
    n.fx = 1;
    n.fy = 0;
    rotateNodes([n, mk(-1, 0)], 90);
    expect(n.fx).toBeCloseTo(n.x!, 6);
    expect(n.fy).toBeCloseTo(n.y!, 6);
  });

  it('좌표가 없는 노드만 있으면 아무 일도 하지 않는다', () => {
    const n = { ...person('n'), degree: 0, feudCount: 0, bridgeCount: 0 } as GraphNode;
    expect(() => rotateNodes([n], 90)).not.toThrow();
    expect(n.x).toBeUndefined();
  });
});

describe('createCenteringForce', () => {
  it('원점에서 먼 노드를 원점 쪽으로 당긴다', () => {
    const force = createCenteringForce(0.1);
    const n = { x: 100, y: 0, vx: 0, vy: 0 } as GraphNode;
    force.initialize([n]);
    force(1);
    expect(n.vx!).toBeLessThan(0); // 오른쪽에 있으니 왼쪽으로
  });

  it('alpha 가 0 이면 아무것도 하지 않는다 — 시뮬레이션이 식으면 멈춰야 한다', () => {
    const force = createCenteringForce(0.1);
    const n = { x: 100, y: 0, vx: 0, vy: 0 } as GraphNode;
    force.initialize([n]);
    force(0);
    expect(n.vx).toBe(0);
  });

  it('좌표가 없는 노드는 건드리지 않는다', () => {
    const force = createCenteringForce();
    const n = { vx: 0, vy: 0 } as GraphNode;
    force.initialize([n]);
    expect(() => force(1)).not.toThrow();
    expect(n.vx).toBe(0);
  });
});
