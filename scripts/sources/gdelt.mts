/**
 * 과거 아카이브 수집 — Google News 로 닿지 않는 오래된 관계용.
 *
 * Google News RSS 는 최근 기사 위주라 맥케인–바이든 우정, 체니 부녀처럼 몇 년 전
 * 사건이 근거인 관계는 아무것도 찾지 못한다. GDELT DOC 2.0 은 2017년부터의
 * 아카이브를 검색할 수 있다.
 *
 * 핵심은 "언제" 다. 2017~현재 전체를 검색하면 최근 일반 기사만 돌아오지만,
 * 사건이 일어난 시기로 창을 좁히면 정확히 그 보도가 나온다.
 *   "McCain Biden eulogy" 2018-08~09 → "Joe Biden heartfelt eulogy for John McCain" (WaPo)
 * 그래서 LLM 에게 검색어와 함께 사건 시기도 추정하게 한다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/gdelt.mts --dry
 *   node --experimental-strip-types scripts/sources/gdelt.mts
 *
 * 주: GDELT API 는 이 환경에서 HTTPS 핸드셰이크가 실패해 HTTP 로 호출한다.
 * 공개 뉴스 메타데이터 조회이고 자격증명이 오가지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { CONFIG } from '../news-pipeline/config.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src/data/relationship-sources.json');
const DRY = process.argv.includes('--dry');
const PER_CALL = 8;
const PER_PAIR = 3;
const GDELT_FLOOR = 201701; // DOC 2.0 커버리지 하한

interface Src { title: string; url: string; source: string; date: string }
type SourceMap = Record<string, Src[]>;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 화이트리스트는 파이프라인과 동일하게 유지한다 — README 가 이 목록을 약속한다 */
const ALLOW = CONFIG.allowedSourceHosts;
const allowed = (domain = '') => ALLOW.some((a) => domain === a || domain.endsWith('.' + a));
/** GDELT 는 도메인만 주므로 표시용 매체명을 되돌린다 */
const outletName = (domain = ''): string => {
  const base = ALLOW.find((a) => domain === a || domain.endsWith('.' + a)) ?? domain;
  const pretty: Record<string, string> = {
    'apnews.com': 'AP News', 'reuters.com': 'Reuters', 'cnn.com': 'CNN',
    'foxnews.com': 'Fox News', 'nbcnews.com': 'NBC News', 'abcnews.go.com': 'ABC News',
    'cbsnews.com': 'CBS News', 'npr.org': 'NPR', 'politico.com': 'Politico',
    'thehill.com': 'The Hill', 'axios.com': 'Axios', 'rollcall.com': 'Roll Call',
    'washingtonexaminer.com': 'Washington Examiner', 'semafor.com': 'Semafor',
    'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post',
    'wsj.com': 'The Wall Street Journal',
  };
  return pretty[base] ?? base;
};

// ── 대상 엣지 ──
const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
const RE =
  /\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)',\s*type:\s*'(\w+)'[\s\S]{0,120}?note:\s*L\(\s*'((?:[^'\\]|\\.)*)'/g;
const edges: { key: string; a: string; b: string; type: string; note: string }[] = [];
for (const m of relText.matchAll(RE)) {
  edges.push({ key: pairKey(m[1], m[2]), a: m[1], b: m[2], type: m[3], note: m[4].replace(/\\'/g, "'") });
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
console.log(`[gdelt] 전체 ${edges.length} · 근거 있음 ${Object.keys(map).length} · 대상 ${missing.length}`);

if (!CONFIG.llm.apiKey) {
  console.error('[gdelt] NEWS_LLM_API_KEY 없음 — 중단');
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
        (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
      const arr = extractJsonArray(content);
      if (arr.length) return arr;
    } catch (err) {
      console.warn(`  [llm] 실패 ${attempt + 1}:`, (err as Error).message?.slice(0, 90));
    }
  }
  return [];
}

// ── 1단계: 검색어 + 사건 시기 ──
const PLAN_SYSTEM = `You plan archive searches for evidence of a specific political relationship.

For each edge you get two people and a claim. Return:
  q    — 3-6 plain search words naming the event and at least one surname (no quotes/operators)
  from — YYYYMM when coverage of that event would START
  to   — YYYYMM when it would END

Pick a TIGHT window around the event (a few months), not a broad range: broad ranges return
generic recent news. If the claim spans years, choose the single most newsworthy moment.
If the claim gives no datable event, use the period the relationship was most covered.
Archive begins 201701; never return "from" earlier than that.

Return ONLY: [{"edge":0,"q":"biden mccain eulogy memorial","from":"201808","to":"201810"}]`;

console.log('[gdelt] 1단계 — 검색어·시기 추정');
const plans = new Map<string, { q: string; from: string; to: string }>();
for (let i = 0; i < missing.length; i += PER_CALL) {
  const chunk = missing.slice(i, i + PER_CALL);
  const user = chunk
    .map((e, ei) => `EDGE ${ei}: ${names.get(e.a) ?? e.a} <-> ${names.get(e.b) ?? e.b} [${e.type}]\n   claim: ${e.note}`)
    .join('\n\n');
  for (const raw of await ask(PLAN_SYSTEM, user)) {
    const r = raw as { edge?: number; q?: string; from?: string; to?: string };
    if (typeof r.edge !== 'number' || typeof r.q !== 'string') continue;
    const e = chunk[r.edge];
    if (!e) continue;
    const clamp = (v: unknown, fb: string) => {
      const s = String(v ?? '').replace(/\D/g, '').slice(0, 6);
      if (s.length !== 6) return fb;
      return Number(s) < GDELT_FLOOR ? String(GDELT_FLOOR) : s;
    };
    plans.set(e.key, { q: r.q.trim(), from: clamp(r.from, '201701'), to: clamp(r.to, '202608') });
  }
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}
console.log(`[gdelt]   계획 확보 ${plans.size}/${missing.length}`);

// ── 2단계: GDELT 조회 ──
console.log('[gdelt] 2단계 — 아카이브 조회');
const found = new Map<string, Src[]>();
let n = 0;
for (const e of missing) {
  const p = plans.get(e.key);
  if (p) {
    const q = encodeURIComponent(`${p.q} sourcelang:english`);
    const url =
      `http://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=100` +
      `&format=json&sort=hybridrel&startdatetime=${p.from}01000000&enddatetime=${p.to}28000000`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (text.trim().startsWith('{')) {
        const arts = (JSON.parse(text).articles ?? []) as {
          url?: string; title?: string; domain?: string; seendate?: string;
        }[];
        const hits: Src[] = [];
        const seen = new Set<string>();
        for (const a of arts) {
          if (!a.url || !a.title || !allowed(a.domain)) continue;
          // GDELT 는 같은 기사를 다른 URL(모바일·지역판)로 돌려주므로 제목으로도 거른다
          const tkey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
          if (seen.has(a.url) || seen.has(tkey)) continue;
          seen.add(a.url);
          seen.add(tkey);
          const d = (a.seendate ?? '').slice(0, 8);
          hits.push({
            title: a.title.replace(/\s+/g, ' ').trim(),
            url: a.url,
            source: outletName(a.domain),
            date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '',
          });
          if (hits.length >= PER_PAIR * 2) break;
        }
        if (hits.length) found.set(e.key, hits);
      }
    } catch {
      /* 개별 실패는 건너뛴다 */
    }
  }
  if (++n % 15 === 0) console.log(`[gdelt]   ${n}/${missing.length} · 후보 확보 ${found.size}`);
  await new Promise((r) => setTimeout(r, 400)); // GDELT 는 여유 있게
}
const rawHits = [...found.values()].reduce((s, v) => s + v.length, 0);
console.log(`[gdelt]   엣지 ${found.size}개에서 후보 ${rawHits}건`);

// ── 3단계: 관련성 필터 (앞 단계와 동일 기준) ──
const FILTER_SYSTEM = `You audit evidence for a US political relationship graph.

For each EDGE you get two people, the claimed relationship, the claim, and numbered candidate
articles. KEEP an article only if its headline indicates an interaction, stance, conflict,
cooperation, endorsement, criticism, or succession between those two people. DROP if they merely
appear in the same story about an unrelated topic, if it is about only one of them, or if you
cannot tell. When uncertain, DROP.

Return ONLY: [{"edge":0,"keep":[0,2]}]`;

console.log('[gdelt] 3단계 — 관련성 필터');
const keys = [...found.keys()];
const kept = new Map<string, Src[]>();
for (let i = 0; i < keys.length; i += 6) {
  const chunk = keys.slice(i, i + 6);
  const user = chunk
    .map((k, ei) => {
      const e = edges.find((x) => x.key === k)!;
      const arts = found.get(k)!
        .map((s, ai) => `   ${ai}) "${s.title.replace(/"/g, "'")}" — ${s.source}, ${s.date}`)
        .join('\n');
      return `EDGE ${ei}: ${names.get(e.a) ?? e.a} <-> ${names.get(e.b) ?? e.b} [${e.type}]\n   claim: ${e.note}\n${arts}`;
    })
    .join('\n\n');

  const decided = new Map<number, Set<number>>();
  for (const raw of await ask(FILTER_SYSTEM, user)) {
    const r = raw as { edge?: number; keep?: number[] };
    if (typeof r.edge !== 'number') continue;
    decided.set(r.edge, new Set(Array.isArray(r.keep) ? r.keep : []));
  }
  chunk.forEach((k, ei) => {
    const sel = decided.get(ei);
    if (!sel) return; // 판정 못 받으면 채택하지 않는다
    const keep = found.get(k)!.filter((_, ai) => sel.has(ai)).slice(0, PER_PAIR);
    if (keep.length) kept.set(k, keep);
  });
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}

const keptCount = [...kept.values()].reduce((s, v) => s + v.length, 0);
console.log(`\n[gdelt] 후보 ${rawHits} → 채택 ${keptCount} · 근거를 새로 얻은 엣지 ${kept.size}/${missing.length}`);

if (DRY) {
  console.log('\n[gdelt] --dry 이므로 저장하지 않음. 샘플:');
  for (const k of [...kept.keys()].slice(0, 8)) {
    const p = plans.get(k);
    console.log(`  ${k}  ← "${p?.q}" (${p?.from}~${p?.to})`);
    for (const s of kept.get(k)!) console.log(`    · ${s.date} ${s.source} — ${s.title.slice(0, 62)}`);
  }
} else {
  for (const [k, v] of kept) map[k] = v;
  fs.writeFileSync(SRC, JSON.stringify(map, null, 1) + '\n');
  console.log(`[gdelt] 저장 → 근거 보유 엣지 ${Object.keys(map).length}/${edges.length}`);
}
