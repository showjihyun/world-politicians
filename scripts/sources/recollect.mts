/**
 * 근거를 찾지 못한 엣지 재수집.
 *
 * 1차 수집은 인물 이름만으로 검색했다("donald trump" "thomas massie"). 이름이 함께
 * 등장하는 기사가 곧 관계의 근거는 아니어서, 관련성 필터를 거치면 아무것도 남지
 * 않는 엣지가 생긴다. 여기서는 관계 주장(note)에서 사건 키워드를 LLM 으로 뽑아
 * 그 사건을 직접 검색한다. ("Massie discharge petition Trump" 식)
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/recollect.mts --dry
 *   node --experimental-strip-types scripts/sources/recollect.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { CONFIG } from '../news-pipeline/config.mts';
import { isAllowedSource } from '../news-pipeline/fetch.mts';
import { pairKey } from './keys-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src/data/relationship-sources.json');
const DRY = process.argv.includes('--dry');
const PER_CALL = 8;
const PER_PAIR = 3;

interface Src { title: string; url: string; source: string; date: string }
type SourceMap = Record<string, Src[]>;


// ── 관계 목록 ──
const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
const RE =
  /\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)',\s*type:\s*'(\w+)'[\s\S]{0,120}?note:\s*L\(\s*'((?:[^'\\]|\\.)*)'/g;
const edges: { key: string; a: string; b: string; type: string; note: string }[] = [];
for (const m of relText.matchAll(RE)) {
  edges.push({
    key: pairKey(m[1], m[2]),
    a: m[1],
    b: m[2],
    type: m[3],
    note: m[4].replace(/\\'/g, "'"),
  });
}

const names = new Map<string, string>();
for (const file of fs.readdirSync(CONFIG.paths.politiciansDir)) {
  if (!file.endsWith('.ts')) continue;
  const t = fs.readFileSync(path.join(CONFIG.paths.politiciansDir, file), 'utf8');
  for (const m of t.matchAll(/id:\s*'([a-z0-9-]+)'[\s\S]{0,400}?enName:\s*'([^']+)'/g)) {
    if (!names.has(m[1])) names.set(m[1], m[2]);
  }
}

const map: SourceMap = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const missing = edges.filter((e) => !map[e.key]?.length);
console.log(`[recollect] 전체 ${edges.length} · 근거 있음 ${Object.keys(map).length} · 대상 ${missing.length}`);

if (!CONFIG.llm.apiKey) {
  console.error('[recollect] NEWS_LLM_API_KEY 없음 — 중단');
  process.exit(1);
}
const client = new OpenAI({ apiKey: CONFIG.llm.apiKey, baseURL: CONFIG.llm.baseURL });

function extractJsonArray(text: string): unknown[] {
  const c = text.replace(/```json|```/g, '').trim();
  const s = c.indexOf('[');
  const e = c.lastIndexOf(']');
  if (s === -1 || e <= s) return [];
  try {
    const p = JSON.parse(c.slice(s, e + 1));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

async function ask(system: string, user: string): Promise<unknown[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: CONFIG.llm.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: CONFIG.llm.maxTokens,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      } as never);
      const content =
        (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
          ?.content ?? '';
      const arr = extractJsonArray(content);
      if (arr.length) return arr;
    } catch (err) {
      console.warn(`  [llm] 실패 ${attempt + 1}:`, (err as Error).message?.slice(0, 90));
    }
  }
  return [];
}

// ── 1단계: 사건 검색어 생성 ──
const QUERY_SYSTEM = `You write news search queries that find evidence for a specific political relationship.

For each edge you get two people and a claim about their relationship. Produce ONE Google News
search query that would surface articles about THAT SPECIFIC EVENT or dynamic — not general
coverage of either person.

Use the distinctive event nouns from the claim (bill names, scandals, votes, offices, incidents).
Include at least one surname. Keep it under 8 words. No quotes, no operators, no dates.

Return ONLY: [{"edge":0,"q":"massie discharge petition trump hostile"}]`;

console.log('[recollect] 1단계 — 사건 검색어 생성');
const queries = new Map<string, string>();
for (let i = 0; i < missing.length; i += PER_CALL) {
  const chunk = missing.slice(i, i + PER_CALL);
  const user = chunk
    .map(
      (e, ei) =>
        `EDGE ${ei}: ${names.get(e.a) ?? e.a} <-> ${names.get(e.b) ?? e.b} [${e.type}]\n   claim: ${e.note}`
    )
    .join('\n\n');
  const arr = await ask(QUERY_SYSTEM, user);
  for (const raw of arr) {
    const r = raw as { edge?: number; q?: string };
    if (typeof r.edge !== 'number' || typeof r.q !== 'string') continue;
    const e = chunk[r.edge];
    if (e && r.q.trim()) queries.set(e.key, r.q.trim());
  }
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}
console.log(`[recollect]   검색어 확보 ${queries.size}/${missing.length}`);

// ── 2단계: 검색 ──
function parseRss(xml: string): (Src & { srcUrl: string })[] {
  const out: (Src & { srcUrl: string })[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const grab = (re: RegExp): string => {
      const hit = it.match(re);
      return hit ? hit[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
    };
    const title = grab(/<title[^>]*>([\s\S]*?)<\/title>/);
    const link = grab(/<link[^>]*>([\s\S]*?)<\/link>/);
    const src = grab(/<source[^>]*>([\s\S]*?)<\/source>/);
    const pub = grab(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
    const srcUrl = (it.match(/<source[^>]*\surl="([^"]+)"/) ?? [])[1] ?? '';
    if (!title || !link) continue;
    const d = new Date(pub);
    out.push({
      title,
      url: link,
      srcUrl,
      source: src || 'Google News',
      date: Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10),
    });
  }
  return out;
}

console.log('[recollect] 2단계 — 검색');
const found = new Map<string, Src[]>();
let n = 0;
for (const e of missing) {
  const q = queries.get(e.key);
  if (q) {
    const url = `${CONFIG.googleNewsRss}?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const hits = parseRss(await res.text())
          .filter((s) => isAllowedSource(s.srcUrl, s.source))
          .map(({ srcUrl: _d, ...k }) => k)
          .slice(0, PER_PAIR * 2); // 관련성 필터에서 줄어드니 여유 있게
        if (hits.length) found.set(e.key, hits);
      }
    } catch {
      /* 개별 실패는 건너뛴다 */
    }
  }
  if (++n % 25 === 0) console.log(`[recollect]   ${n}/${missing.length} · 후보 확보 ${found.size}`);
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}
const rawHits = [...found.values()].reduce((s, v) => s + v.length, 0);
console.log(`[recollect]   엣지 ${found.size}개에서 후보 ${rawHits}건`);

// ── 3단계: 관련성 필터 (1차와 같은 기준) ──
const FILTER_SYSTEM = `You audit evidence for a US political relationship graph.

For each EDGE you get two people, the claimed relationship, the claim, and numbered candidate
articles. KEEP an article only if its headline indicates an interaction, stance, conflict,
cooperation, endorsement, criticism, or succession between those two people. DROP if they merely
appear in the same story about an unrelated topic, if it is about only one of them, or if you
cannot tell. When uncertain, DROP.

Return ONLY: [{"edge":0,"keep":[0,2]}]`;

console.log('[recollect] 3단계 — 관련성 필터');
const keys = [...found.keys()];
const kept = new Map<string, Src[]>();
for (let i = 0; i < keys.length; i += 6) {
  const chunk = keys.slice(i, i + 6);
  const user = chunk
    .map((k, ei) => {
      const e = edges.find((x) => x.key === k)!;
      const arts = found
        .get(k)!
        .map((s, ai) => `   ${ai}) "${s.title.replace(/"/g, "'")}" — ${s.source}, ${s.date}`)
        .join('\n');
      return `EDGE ${ei}: ${names.get(e.a) ?? e.a} <-> ${names.get(e.b) ?? e.b} [${e.type}]
   claim: ${e.note}
${arts}`;
    })
    .join('\n\n');

  const arr = await ask(FILTER_SYSTEM, user);
  const decided = new Map<number, Set<number>>();
  for (const raw of arr) {
    const r = raw as { edge?: number; keep?: number[] };
    if (typeof r.edge !== 'number') continue;
    decided.set(r.edge, new Set(Array.isArray(r.keep) ? r.keep : []));
  }
  chunk.forEach((k, ei) => {
    // 판정을 못 받으면 채택하지 않는다 — 재수집이므로 보수적으로
    const sel = decided.get(ei);
    if (!sel) return;
    const keep = found.get(k)!.filter((_, ai) => sel.has(ai)).slice(0, PER_PAIR);
    if (keep.length) kept.set(k, keep);
  });
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}

const keptCount = [...kept.values()].reduce((s, v) => s + v.length, 0);
console.log(
  `\n[recollect] 후보 ${rawHits} → 채택 ${keptCount} · 근거를 새로 얻은 엣지 ${kept.size}/${missing.length}`
);

if (DRY) {
  console.log('\n[recollect] --dry 이므로 저장하지 않음. 샘플:');
  for (const k of [...kept.keys()].slice(0, 6)) {
    console.log(`  ${k}  ← "${queries.get(k)}"`);
    for (const s of kept.get(k)!) console.log(`    · ${s.title.slice(0, 76)}`);
  }
} else {
  for (const [k, v] of kept) map[k] = v;
  fs.writeFileSync(SRC, JSON.stringify(map, null, 1) + '\n');
  const edgesWith = Object.keys(map).length;
  console.log(`[recollect] 저장 → 근거 보유 엣지 ${edgesWith}/${edges.length}`);
}
