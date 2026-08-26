import type { Branch, Party, PersonStatus, Politician, RelType, Relationship } from '../types';
import { RELATIONSHIPS } from '../data/relationships';

export interface SimNodeProps {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphNode extends Politician, SimNodeProps {
  degree: number;
  feudCount: number;
  bridgeCount: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  rel: Relationship;
}

/** normalized pair key (sorted) */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildGraph(politicians: Politician[]) {
  const nodes: GraphNode[] = politicians.map((p) => ({
    ...p,
    degree: 0,
    feudCount: 0,
    bridgeCount: 0,
  }));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const links: GraphLink[] = [];
  const adjacency = new Map<string, Set<string>>();
  const linkMap = new Map<string, GraphLink>();

  for (const rel of RELATIONSHIPS) {
    const na = nodeMap.get(rel.a);
    const nb = nodeMap.get(rel.b);
    if (!na || !nb || rel.a === rel.b) continue;
    const key = pairKey(rel.a, rel.b);
    if (linkMap.has(key)) continue; // dedupe
    // orient feud edges so particles flow instigator -> target
    let src = rel.a;
    let dst = rel.b;
    if (rel.type === 'feud' && rel.initiator === 'b') {
      src = rel.b;
      dst = rel.a;
    }
    const link: GraphLink = {
      id: key,
      source: src,
      target: dst,
      rel,
    };
    links.push(link);
    linkMap.set(key, link);

    if (!adjacency.has(rel.a)) adjacency.set(rel.a, new Set());
    if (!adjacency.has(rel.b)) adjacency.set(rel.b, new Set());
    adjacency.get(rel.a)!.add(rel.b);
    adjacency.get(rel.b)!.add(rel.a);

    na.degree += 1;
    nb.degree += 1;
    if (rel.type === 'feud') {
      na.feudCount += 1;
      nb.feudCount += 1;
    }
    if (rel.type === 'bipartisan') {
      na.bridgeCount += 1;
      nb.bridgeCount += 1;
    }
  }

  return { nodes, links, adjacency, linkMap };
}

export interface Filters {
  parties: Party[];
  branches: Branch[];
  factions: string[];
  relTypes: RelType[];
  strongOnly: boolean;
}

export function isNodeVisible(
  node: GraphNode,
  f: Filters,
  storyFocus: Set<string> | null
): boolean {
  if (storyFocus && !storyFocus.has(node.id)) return false;
  if (f.parties.length && !f.parties.includes(node.party)) return false;
  if (f.branches.length && !f.branches.includes(node.branch)) return false;
  if (f.factions.length && !f.factions.includes(node.faction)) return false;
  return true;
}

export function isLinkVisible(
  link: GraphLink,
  f: Filters,
  visibleNodes: Set<string>
): boolean {
  if (!visibleNodes.has(typeof link.source === 'string' ? link.source : (link.source as unknown as GraphNode).id))
    return false;
  if (!visibleNodes.has(typeof link.target === 'string' ? link.target : (link.target as unknown as GraphNode).id))
    return false;
  if (f.relTypes.length && !f.relTypes.includes(link.rel.type)) return false;
  if (f.strongOnly && link.rel.strength < 2) return false;
  return true;
}

// ── Insights ──

function topBy<T>(arr: T[], score: (x: T) => number, n = 5): T[] {
  return [...arr].sort((a, b) => score(b) - score(a)).slice(0, n);
}

export function computeInsights(nodes: GraphNode[], links: GraphLink[]) {
  // conflict hubs — feud-weighted
  // NOTE: use immutable rel.a/rel.b — force-graph mutates l.source/target into node objects
  const feudWeight = new Map<string, number>();
  for (const l of links) {
    if (l.rel.type !== 'feud') continue;
    feudWeight.set(l.rel.a, (feudWeight.get(l.rel.a) ?? 0) + l.rel.strength);
    feudWeight.set(l.rel.b, (feudWeight.get(l.rel.b) ?? 0) + l.rel.strength);
  }
  const conflictHubs = topBy(nodes, (n) => feudWeight.get(n.id) ?? 0).filter(
    (n) => (feudWeight.get(n.id) ?? 0) > 0
  );

  const connectHubs = topBy(nodes, (n) => n.degree).filter((n) => n.degree > 0);

  // bridge builders — cross-party positive edges
  const partyOf = new Map(nodes.map((n) => [n.id, n.party]));
  const bridges = new Map<string, number>();
  for (const l of links) {
    if (l.rel.type !== 'bipartisan' && l.rel.type !== 'ally') continue;
    const pa = partyOf.get(l.rel.a);
    const pb = partyOf.get(l.rel.b);
    if (!pa || !pb || pa === pb || pa === 'X' || pb === 'X') continue;
    const w = l.rel.type === 'bipartisan' ? 2 : 1;
    bridges.set(l.rel.a, (bridges.get(l.rel.a) ?? 0) + w);
    bridges.set(l.rel.b, (bridges.get(l.rel.b) ?? 0) + w);
  }
  const bridgeBuilders = topBy(nodes, (n) => bridges.get(n.id) ?? 0).filter(
    (n) => (bridges.get(n.id) ?? 0) > 0
  );

  const buzzRanking = topBy(nodes, (n) => n.buzz, 6);

  return { conflictHubs, connectHubs, bridgeBuilders, buzzRanking };
}

// ── Status helpers ──

export function statusRank(s?: PersonStatus): number {
  return s === 'legacy' ? 3 : s === 'departed' ? 2 : 1;
}
