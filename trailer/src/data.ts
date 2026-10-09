/**
 * 모든 수치는 scripts/prepare.ts 가 저장소 데이터에서 뽑은 것이다.
 * 여기서 숫자를 새로 만들지 않는다.
 */
import raw from './generated/data.json';

export type Lang = 'en' | 'ko';
export type Name = { en: string; ko: string };

export type GNode = {
  id: string;
  en: string;
  ko: string;
  party: string;
  color: string;
  prominence: number;
  degree: number;
  x: number;
  y: number;
  ax: number | null;
  ay: number | null;
};
export type GLink = { a: string; b: string; type: string; strength: number };

export const D = raw as unknown as {
  counts: Record<string, number>;
  hub: { id: string; componentsBefore: number; componentsAfter: number; largestAfter: number; hubDegree: number };
  nodes: GNode[];
  links: GLink[];
  cosponsor: { a: string; b: string; bills: number; initiator: 'a' | 'b' | null; crossParty: boolean }[];
  topCosponsor: { a: Name; b: Name; bills: number; byA: number; byB: number };
  timeline: { a: Name; b: Name; cells: { ym: string; polarity: 'ally' | 'feud' | 'neutral'; flip: boolean; contested: boolean; curated: boolean }[] };
  mix: { total: number; top: [string, number][]; restTotal: number; topShare: number; outlets: number };
  manifest: { firstDate: string; lastDate: string; total: number; classified: number; ally: number; feud: number; neutral: number };
  wire: { date: string; source: string; title: string; polarity: 'ally' | 'feud'; summary_en: string; summary_ko: string; names: Name[] }[];
  funding: { people: number; pacDirect: number; ieSupport: number; ieOppose: number; namedSharePct: number; massie: { name: Name; oppose: number; support: number }; opposeTop1SharePct: number };
  lobbying: { matched: number; people: number; years: [number, number] };
  unity: { partyVotes: number; people: number; collins: { name: Name; rate: number } };
};

export const NODE = new Map(D.nodes.map((n) => [n.id, n]));
/** scripts/prepare.ts 의 R 과 같은 식이어야 충돌 간격이 맞는다 */
export const radius = (id: string) => 14 + (NODE.get(id)?.prominence ?? 1) * 6;

/** 허브를 뺀 그래프의 연결 요소 — 큰 순서. 화면이 "9조각" 을 셀 때 이걸 쓴다 */
export const HUB_COMPONENTS: string[][] = (() => {
  const adj = new Map<string, string[]>();
  for (const l of D.links) {
    if (l.a === D.hub.id || l.b === D.hub.id) continue;
    (adj.get(l.a) ?? adj.set(l.a, []).get(l.a)!).push(l.b);
    (adj.get(l.b) ?? adj.set(l.b, []).get(l.b)!).push(l.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of D.nodes) {
    if (n.id === D.hub.id || seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), stack.push(w));
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
})();

if (HUB_COMPONENTS.length !== D.hub.componentsAfter) {
  throw new Error(`연결 요소 수가 준비 스크립트와 다르다: ${HUB_COMPONENTS.length} vs ${D.hub.componentsAfter}`);
}

export const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

export const fmt = (n: number) => n.toLocaleString('en-US');
