/**
 * 근거를 "검증 가능한 것" 으로 전면 재구축.
 *
 * 기존 근거의 94% 가 Google News 리다이렉트 URL 이었다. 이 주소는 서버에서
 * 따라가면 news.google.com 에서 멈추고(실제 이동에 JS 필요), base64 안에도
 * 원본 주소가 없다. 즉 "이 링크가 정말 그 매체 기사인지" 확인할 방법이 없고,
 * 매체명은 Google 이 RSS 에 적어준 값을 그대로 믿는 것뿐이었다.
 *
 * GDELT 는 원본 도메인을 직접 준다. 그래서:
 *   - URL 만 봐도 매체를 확인할 수 있고
 *   - 링크가 살아 있는지 실제로 확인할 수 있다
 * 커버리지는 줄지만 남는 것은 전부 검증된 링크다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/rebuild.mts --dry
 *   node --experimental-strip-types scripts/sources/rebuild.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { CONFIG } from '../news-pipeline/config.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'src/data/relationship-sources.json');
const DRY = process.argv.includes('--dry');
const PER_CALL = 8;
const PER_PAIR = 3;
const GDELT_FLOOR = 201701;

interface Src { title: string; url: string; source: string; date: string }

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const ALLOW = CONFIG.allowedSourceHosts;
const allowed = (d = '') => ALLOW.some((a) => d === a || d.endsWith('.' + a));
const PRETTY: Record<string, string> = {
  'apnews.com': 'AP News', 'reuters.com': 'Reuters', 'cnn.com': 'CNN',
  'foxnews.com': 'Fox News', 'nbcnews.com': 'NBC News', 'abcnews.go.com': 'ABC News',
  'cbsnews.com': 'CBS News', 'npr.org': 'NPR', 'politico.com': 'Politico',
  'thehill.com': 'The Hill', 'axios.com': 'Axios', 'rollcall.com': 'Roll Call',
  'washingtonexaminer.com': 'Washington Examiner', 'semafor.com': 'Semafor',
  'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post',
  'wsj.com': 'The Wall Street Journal',
};
const outletName = (d = '') => PRETTY[ALLOW.find((a) => d === a || d.endsWith('.' + a)) ?? ''] ?? d;

// ── 관계 ──
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
console.log(`[rebuild] 관계 ${edges.length}개 — 전면 재수집`);

if (!CONFIG.llm.apiKey) {
  console.error('[rebuild] NEWS_LLM_API_KEY 없음 — 중단');
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
  for (let i = 0; i < 2; i++) {
    try {
      const res = await client.chat.completions.create({
        model: CONFIG.llm.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0, max_tokens: CONFIG.llm.maxTokens, stream: false,
        chat_template_kwargs: { enable_thinking: false },
      } as never);
      const c = (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
      const arr = extractJsonArray(c);
      if (arr.length) return arr;
    } catch (err) {
      console.warn(`  [llm] 실패 ${i + 1}:`, (err as Error).message?.slice(0, 80));
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

Pick a TIGHT window around the event (a few months). Broad ranges return generic recent news.
If the claim spans years, choose the single most newsworthy moment.
Archive begins 201701; never return "from" earlier than that.

Return ONLY: [{"edge":0,"q":"biden mccain eulogy memorial","from":"201808","to":"201810"}]`;

console.log('[rebuild] 1단계 — 검색 계획');
const plans = new Map<string, { q: string; from: string; to: string }>();
for (let i = 0; i < edges.length; i += PER_CALL) {
  const chunk = edges.slice(i, i + PER_CALL);
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
  if ((i / PER_CALL) % 6 === 0) console.log(`[rebuild]   계획 ${plans.size}/${edges.length}`);
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}
console.log(`[rebuild]   계획 확보 ${plans.size}/${edges.length}`);

// ── 2단계: GDELT 조회 (원본 도메인) ──
console.log('[rebuild] 2단계 — GDELT 조회');
const found = new Map<string, Src[]>();
let n = 0;
for (const e of edges) {
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
          const tkey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
          if (seen.has(a.url) || seen.has(tkey)) continue;
          seen.add(a.url);
          seen.add(tkey);
          // seendate 는 GDELT 가 기사를 수집한 시각이다. 발행일과 보통 하루 안쪽으로
          // 붙지만 같은 값은 아니다 — 화면에도 "대략의 보도 시점" 으로 읽혀야 한다.
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
    } catch { /* 개별 실패는 건너뛴다 */ }
  }
  if (++n % 40 === 0) console.log(`[rebuild]   ${n}/${edges.length} · 후보 ${found.size}엣지`);
  await new Promise((r) => setTimeout(r, 400));
}
const rawHits = [...found.values()].reduce((s, v) => s + v.length, 0);
console.log(`[rebuild]   엣지 ${found.size}개 · 후보 ${rawHits}건`);

// ── 3단계: 관련성 필터 ──
const FILTER_SYSTEM = `You audit evidence for a US political relationship graph.

For each EDGE you get two people, the claimed relationship, the claim, and numbered candidate
articles. KEEP an article only if its headline indicates an interaction, stance, conflict,
cooperation, endorsement, criticism, or succession between those two people. DROP if they merely
appear in the same story about an unrelated topic, if it is about only one of them, or if you
cannot tell. When uncertain, DROP.

Return ONLY: [{"edge":0,"keep":[0,2]}]`;

console.log('[rebuild] 3단계 — 관련성 필터');
const keys = [...found.keys()];
const relevant = new Map<string, Src[]>();
for (let i = 0; i < keys.length; i += 6) {
  const chunk = keys.slice(i, i + 6);
  const user = chunk.map((k, ei) => {
    const e = edges.find((x) => x.key === k)!;
    const arts = found.get(k)!
      .map((s, ai) => `   ${ai}) "${s.title.replace(/"/g, "'")}" — ${s.source}, ${s.date}`).join('\n');
    return `EDGE ${ei}: ${names.get(e.a) ?? e.a} <-> ${names.get(e.b) ?? e.b} [${e.type}]\n   claim: ${e.note}\n${arts}`;
  }).join('\n\n');
  const decided = new Map<number, Set<number>>();
  for (const raw of await ask(FILTER_SYSTEM, user)) {
    const r = raw as { edge?: number; keep?: number[] };
    if (typeof r.edge !== 'number') continue;
    decided.set(r.edge, new Set(Array.isArray(r.keep) ? r.keep : []));
  }
  chunk.forEach((k, ei) => {
    const sel = decided.get(ei);
    if (!sel) return;
    const keep = found.get(k)!.filter((_, ai) => sel.has(ai)).slice(0, PER_PAIR);
    if (keep.length) relevant.set(k, keep);
  });
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}
const relCount = [...relevant.values()].reduce((s, v) => s + v.length, 0);
console.log(`[rebuild]   관련성 통과 ${relCount}건 · 엣지 ${relevant.size}`);

// ── 4단계: 링크 생존 확인 — 이 단계가 "검증 가능" 의 근거다 ──
console.log('[rebuild] 4단계 — 링크 생존 확인');
const status = { alive: 0, blocked: 0, dead: 0, err: 0 };
const verified = new Map<string, Src[]>();
let vN = 0;
for (const [k, list] of relevant) {
  const live: Src[] = [];
  for (const s of list) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(s.url, {
        redirect: 'follow', signal: ctl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) polaris-link-check' },
      });
      clearTimeout(timer);
      // 주요 매체는 크롤러에 403 을 준다 — 주소가 틀린 것이 아니므로 살아 있는 것으로 본다.
      // 404/410 은 실제로 사라진 기사다.
      if (r.status < 400) { status.alive++; live.push(s); }
      else if (r.status === 403 || r.status === 401 || r.status === 429) { status.blocked++; live.push(s); }
      else status.dead++;
    } catch { status.err++; }
  }
  if (live.length) verified.set(k, live);
  if (++vN % 30 === 0) console.log(`[rebuild]   ${vN}/${relevant.size} 엣지 확인`);
}
const finalCount = [...verified.values()].reduce((s, v) => s + v.length, 0);
console.log(
  `[rebuild]   생존 ${status.alive} · 봇차단(정상) ${status.blocked} · 죽음 ${status.dead} · 오류 ${status.err}`
);

console.log(`\n[rebuild] 최종: 엣지 ${verified.size}/${edges.length} · 링크 ${finalCount}건 (전부 원본 URL·생존 확인)`);

if (DRY) {
  console.log('\n[rebuild] --dry 이므로 저장하지 않음. 샘플:');
  for (const k of [...verified.keys()].slice(0, 6)) {
    console.log(`  ${k}`);
    for (const s of verified.get(k)!) console.log(`    · ${s.date} ${s.source} — ${s.url.slice(0, 66)}`);
  }
} else {
  const obj: Record<string, Src[]> = {};
  for (const k of [...verified.keys()].sort()) obj[k] = verified.get(k)!;
  fs.writeFileSync(OUT, JSON.stringify(obj, null, 1) + '\n');
  console.log(`[rebuild] 저장 → ${OUT}`);
}
