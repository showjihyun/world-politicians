/**
 * 트레일러가 화면에 쓰는 모든 수치와 좌표를 저장소 데이터에서 뽑는다.
 *
 * 영상에 숫자를 손으로 박지 않는다 — README 수치가 조용히 낡았던 것과 같은 일이
 * 영상에서 반복된다. 산식은 앱의 정본(domain/*)을 그대로 import 해서 쓴다.
 *
 * 실행: npm run prepare:data  (esbuild 로 묶어서 node 로 돌린다)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — d3-force-3d 는 타입이 없다
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from 'd3-force-3d';

import { EXECUTIVE } from '../../src/data/politicians/executive';
import { SENATE } from '../../src/data/politicians/senate';
import { HOUSE } from '../../src/data/politicians/house';
import { OTHERS } from '../../src/data/politicians/others';
import { RELATIONSHIPS } from '../../src/data/relationships';
import { FACTION_MAP } from '../../src/data/factions';
import { HISTORY_ARCS } from '../../src/data/signal-history';
import { STORIES } from '../../src/data/stories';
import { buildGraph, pairKey } from '../../src/domain/graph';
import { buildPairTimeline } from '../../src/domain/timeline';
import { outletMix } from '../../src/domain/source-mix';
import type { NewsSignal, Politician } from '../../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// 캡처 시점을 고정한다 — 타임라인 창이 렌더 날짜에 따라 움직이면 두 언어판이 갈린다
const NOW = new Date('2026-10-09T00:00:00Z');

const politicians: Politician[] = [...EXECUTIVE, ...SENATE, ...HOUSE, ...OTHERS];
const cosponsorFile = readJson('src/data/cosponsorship.json');
const cosponsorEdges = (cosponsorFile.edges as any[]).filter((e) => !e.duplicate);

// ── 그래프 + 고정 레이아웃 ─────────────────────────────────────────────
const { nodes, links } = buildGraph(politicians, RELATIONSHIPS);
const W = 3840;
const H = 2160;

type P = { id: string; x?: number; y?: number; r: number };
// 화면 반지름과 같은 식 — trailer/src/data.ts 의 radius 와 맞춘다
const R = (prominence: number) => 14 + prominence * 6;
const simNodes: P[] = nodes.map((n) => ({ id: n.id, r: R(n.prominence) }));
const simLinks = links.map((l) => ({ source: l.rel.a, target: l.rel.b, s: l.rel.strength }));

forceSimulation(simNodes, 2)
  .force('link', forceLink(simLinks).id((d: P) => d.id).distance(150).strength(0.5))
  .force('charge', forceManyBody().strength(-1800))
  .force('x', forceX(0).strength(0.1))
  .force('y', forceY(0).strength(0.2))
  .force('collide', forceCollide((d: P) => d.r + 16))
  .stop()
  .tick(600);

// 화면 안전 영역(좌우 300, 상하 240)에 맞춘다
const fit = (pts: { x: number; y: number }[], box = { x0: 300, x1: W - 300, y0: 260, y1: H - 260 }) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((box.x1 - box.x0) / (maxX - minX), (box.y1 - box.y0) / (maxY - minY));
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return (p: { x: number; y: number }) => ({
    x: Math.round(cx + (p.x - (minX + maxX) / 2) * k),
    y: Math.round(cy + (p.y - (minY + maxY) / 2) * k),
  });
};
const toScreen = fit(simNodes as any);
const layout = Object.fromEntries(simNodes.map((n) => [n.id, toScreen(n as any)]));

// ── 허브를 빼면: 연결 요소 ──────────────────────────────────────────────
const HUB = 'trump';
function components(skip: string | null) {
  const adj = new Map<string, string[]>();
  for (const l of links) {
    const { a, b } = l.rel;
    if (a === skip || b === skip) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const n of nodes) {
    if (n.id === skip || seen.has(n.id)) continue;
    const stack = [n.id];
    const comp: string[] = [];
    seen.add(n.id);
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), stack.push(w));
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}
const before = components(null);
const after = components(HUB);

// 허브 제거 후 레이아웃: 허브 없이 다시 풀되, 처음 위치에서 출발해 흩어지게 한다
const sim2Nodes: P[] = nodes
  .filter((n) => n.id !== HUB)
  .map((n) => ({ id: n.id, r: R(n.prominence), x: (simNodes.find((s) => s.id === n.id) as any).x, y: (simNodes.find((s) => s.id === n.id) as any).y }));
const sim2Links = links
  .filter((l) => l.rel.a !== HUB && l.rel.b !== HUB)
  .map((l) => ({ source: l.rel.a, target: l.rel.b }));
forceSimulation(sim2Nodes, 2)
  .force('link', forceLink(sim2Links).id((d: P) => d.id).distance(110).strength(0.7))
  .force('charge', forceManyBody().strength(-2600))
  .force('x', forceX(0).strength(0.03))
  .force('y', forceY(0).strength(0.05))
  .force('collide', forceCollide((d: P) => d.r + 26))
  .stop()
  .tick(400);
const toScreen2 = fit(sim2Nodes as any);
const atomized = Object.fromEntries(sim2Nodes.map((n) => [n.id, toScreen2(n as any)]));

// ── 뉴스 아카이브 ───────────────────────────────────────────────────────
const sigDir = join(ROOT, 'src/data/signals');
const archive: NewsSignal[] = readdirSync(sigDir)
  .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
  .flatMap((f) => (JSON.parse(readFileSync(join(sigDir, f), 'utf8')).signals ?? []) as NewsSignal[]);
const manifest = readJson('src/data/signals/index.json');

const byPair = new Map<string, NewsSignal[]>();
for (const s of archive) {
  if (!s.pair) continue;
  const k = pairKey(s.pair[0], s.pair[1]);
  (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(s);
}
const tl = buildPairTimeline('trump', 'musk', 18, byPair, HISTORY_ARCS, NOW);
if (!tl) throw new Error('trump × musk 타임라인이 비었다');

const mix = outletMix(manifest.outlets);

// 와이어 장면용 실제 헤드라인 — 판정이 있고 쌍이 있는 최근 것
const wire = archive
  .filter((s) => s.classified && s.pair && s.polarity && s.polarity !== 'neutral' && s.summary_ko && s.title.length < 95)
  .sort((a, b) => b.date.localeCompare(a.date))
  .filter((s, i, arr) => arr.findIndex((t) => pairKey(...t.pair!) === pairKey(...s.pair!)) === i)
  .slice(0, 6)
  .map((s) => ({ date: s.date, source: s.source, title: s.title, pair: s.pair, polarity: s.polarity, summary_en: s.summary_en, summary_ko: s.summary_ko }));

// ── 인물 속성 레이어 ───────────────────────────────────────────────────
const funding = readJson('src/data/funding.json');
const lobbying = readJson('src/data/lobbying.json');
const unity = readJson('src/data/party-unity.json');
const opposeRank = Object.entries(funding.people as Record<string, any>)
  .map(([id, v]) => ({ id, oppose: v.ieOppose ?? 0, support: v.ieSupport ?? 0 }))
  .sort((a, b) => b.oppose - a.oppose);
const massie = funding.people.massie;

const nameOf = (id: string) => {
  const p = politicians.find((x) => x.id === id)!;
  return { en: p.enName, ko: p.name.ko };
};

// 공동발의 장면: 가장 일방적인 쌍과 가장 큰 쌍
const topCosponsor = [...cosponsorEdges].sort((a, b) => b.bills - a.bills)[0];

const out = {
  generatedFrom: 'trailer/scripts/prepare.ts',
  now: NOW.toISOString().slice(0, 10),
  counts: {
    figures: politicians.length,
    curated: links.length,
    cosponsorFresh: cosponsorEdges.length,
    cosponsorAll: cosponsorFile.stats.edges,
    billsScanned: cosponsorFile.stats.billsScanned,
    crossParty: cosponsorFile.stats.crossParty,
    signals: manifest.stats.total,
    classified: manifest.stats.classified,
    stories: STORIES.length,
  },
  hub: {
    id: HUB,
    componentsBefore: before.length,
    largestBefore: before[0].length,
    componentsAfter: after.length,
    largestAfter: after[0].length,
    hubDegree: links.filter((l) => l.rel.a === HUB || l.rel.b === HUB).length,
  },
  nodes: nodes.map((n) => ({
    id: n.id,
    en: n.enName,
    ko: n.name.ko,
    party: n.party,
    color: FACTION_MAP[n.faction]?.color ?? '#94a3b8',
    prominence: n.prominence,
    degree: n.degree,
    ...layout[n.id],
    ax: atomized[n.id]?.x ?? null,
    ay: atomized[n.id]?.y ?? null,
  })),
  links: links.map((l) => ({ a: l.rel.a, b: l.rel.b, type: l.rel.type, strength: l.rel.strength })),
  cosponsor: cosponsorEdges.map((e) => ({ a: e.a, b: e.b, bills: e.bills, initiator: e.initiator ?? null, crossParty: !!e.crossParty })),
  topCosponsor: { a: nameOf(topCosponsor.a), b: nameOf(topCosponsor.b), bills: topCosponsor.bills, byA: topCosponsor.sponsoredByA, byB: topCosponsor.sponsoredByB },
  timeline: {
    a: nameOf('trump'),
    b: nameOf('musk'),
    cells: tl.cells.map((c) => ({ ym: c.ym, polarity: c.polarity, flip: c.flip, contested: c.contested, curated: c.curated })),
  },
  mix: { total: mix.total, top: mix.top, restTotal: mix.restTotal, topShare: mix.topShare, outlets: mix.entries.length },
  manifest: { firstDate: manifest.firstDate, lastDate: manifest.lastDate, ...manifest.stats },
  wire: wire.map((w) => ({ ...w, names: w.pair!.map(nameOf) })),
  funding: {
    people: funding.stats.people,
    pacDirect: funding.stats.pacDirect,
    ieSupport: funding.stats.ieSupport,
    ieOppose: funding.stats.ieOppose,
    namedSharePct: funding.stats.namedSharePct,
    massie: { name: nameOf('massie'), oppose: massie.ieOppose, support: massie.ieSupport },
    opposeTop1SharePct: Math.round((opposeRank[0].oppose / funding.stats.ieOppose) * 100),
  },
  lobbying: { matched: lobbying.stats.matched, people: lobbying.stats.people, years: [lobbying.years[0], lobbying.years.at(-1)] },
  unity: {
    partyVotes: unity.stats.partyVotes,
    people: unity.stats.people,
    collins: { name: nameOf('collins-susan'), rate: unity.people['collins-susan'].rate },
    fitzpatrick: { name: nameOf('fitzpatrick'), rate: unity.people.fitzpatrick.rate },
  },
};

const outPath = join(HERE, '..', 'src', 'generated', 'data.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${outPath}`);
console.log(JSON.stringify({ counts: out.counts, hub: out.hub, timeline: out.timeline.cells.map((c) => `${c.ym}:${c.polarity}${c.flip ? '!' : ''}${c.contested ? '~' : ''}`).join(' '), mix: out.mix.top, wire: out.wire.length, funding: out.funding, unity: out.unity, top: out.topCosponsor }, null, 1));
