/**
 * 근거 후보 관련성 필터.
 *
 * collect.mts 는 "두 인물이 함께 등장한 기사" 를 모은다. 그래서 관계를 실제로
 * 뒷받침하지 않는 동반 언급이 섞인다(부채 기사에 트럼프와 바이든이 같이 나오는 식).
 * 여기서 LLM 에게 각 후보가 그 관계의 근거가 되는지 물어 걸러낸다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/filter.mts --dry   # 미리보기
 *   node --experimental-strip-types scripts/sources/filter.mts         # 실제 반영
 *
 * 판정이 애매하면 버린다. 근거 패널은 신뢰를 위한 기능이므로
 * 약한 근거를 남기는 쪽이 아예 없는 것보다 나쁘다.
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { CONFIG } from '../news-pipeline/config.mts';
import { pairKey } from './keys-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src/data/relationship-sources.json');
const DRY = process.argv.includes('--dry');
const EDGES_PER_CALL = 6;

interface Src { title: string; url: string; source: string; date: string }
type SourceMap = Record<string, Src[]>;


// ── 관계 주장(note) 파싱 ──
const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
const claims = new Map<string, { type: string; note: string }>();
const RE =
  /\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)',\s*type:\s*'(\w+)'[\s\S]{0,120}?note:\s*L\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const m of relText.matchAll(RE)) {
  claims.set(pairKey(m[1], m[2]), { type: m[3], note: m[4].replace(/\\'/g, "'") });
}
console.log(`[filter] 주장 파싱 ${claims.size}건`);

// ── 인물 이름 ──
const names = new Map<string, string>();
for (const file of fs.readdirSync(CONFIG.paths.politiciansDir)) {
  if (!file.endsWith('.ts')) continue;
  const t = fs.readFileSync(path.join(CONFIG.paths.politiciansDir, file), 'utf8');
  for (const m of t.matchAll(/id:\s*'([a-z0-9-]+)'[\s\S]{0,400}?enName:\s*'([^']+)'/g)) {
    if (!names.has(m[1])) names.set(m[1], m[2]);
  }
}

const map: SourceMap = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const keys = Object.keys(map);
const total = keys.reduce((n, k) => n + map[k].length, 0);
console.log(`[filter] 후보 ${total}건 / 엣지 ${keys.length}개`);

if (!CONFIG.llm.apiKey) {
  console.error('[filter] NEWS_LLM_API_KEY 없음 — 중단');
  process.exit(1);
}
const client = new OpenAI({ apiKey: CONFIG.llm.apiKey, baseURL: CONFIG.llm.baseURL });

const SYSTEM = `You audit evidence for a US political relationship graph.

For each EDGE you are given: two people, the claimed relationship type, the claim itself,
and numbered candidate articles (headline + outlet + date).

Decide, per article, whether a reader could reasonably treat that article as EVIDENCE for
that specific relationship between those two people.

KEEP an article only if its headline indicates an interaction, stance, conflict, cooperation,
endorsement, criticism, succession, or shared action between those two people.

DROP an article if the two people merely appear in the same story about an unrelated topic
(budgets, polls, general news), if it is about only one of them, or if you cannot tell from
the headline. When uncertain, DROP.

Return ONLY a JSON array, one object per edge, using the given edge ids:
[{"edge":0,"keep":[0,2]}]
Use the article numbers shown. Empty keep list is fine and expected.`;

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const s = cleaned.indexOf('[');
  const e = cleaned.lastIndexOf(']');
  if (s === -1 || e <= s) return [];
  try {
    const p = JSON.parse(cleaned.slice(s, e + 1));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

const kept: SourceMap = {};
let processed = 0;
let dropped = 0;

for (let i = 0; i < keys.length; i += EDGES_PER_CALL) {
  const chunk = keys.slice(i, i + EDGES_PER_CALL);

  const prompt = chunk
    .map((k, ei) => {
      const [a, b] = k.split('|');
      const c = claims.get(k);
      const arts = map[k]
        .map((s, ai) => `   ${ai}) "${s.title.replace(/"/g, "'")}" — ${s.source}, ${s.date}`)
        .join('\n');
      return `EDGE ${ei}: ${names.get(a) ?? a} <-> ${names.get(b) ?? b}  [${c?.type ?? '?'}]
   claim: ${c?.note ?? '(none)'}
${arts}`;
    })
    .join('\n\n');

  let decided: Map<number, Set<number>> | null = null;
  for (let attempt = 0; attempt < 2 && !decided; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: CONFIG.llm.model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
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
      if (arr.length) {
        decided = new Map();
        for (const raw of arr) {
          const r = raw as { edge?: number; keep?: number[] };
          if (typeof r.edge !== 'number') continue;
          decided.set(r.edge, new Set(Array.isArray(r.keep) ? r.keep : []));
        }
      }
    } catch (err) {
      console.warn(`  [llm] 실패 ${attempt + 1}:`, (err as Error).message?.slice(0, 100));
    }
  }

  chunk.forEach((k, ei) => {
    // 판정을 못 받은 엣지는 손대지 않는다 — 침묵을 삭제로 해석하면 안 된다
    const sel = decided?.get(ei);
    if (!sel) {
      kept[k] = map[k];
      return;
    }
    const survivors = map[k].filter((_, ai) => sel.has(ai));
    dropped += map[k].length - survivors.length;
    if (survivors.length) kept[k] = survivors;
  });

  processed += chunk.length;
  if (processed % 30 === 0 || processed === keys.length) {
    console.log(`[filter]   ${processed}/${keys.length} 엣지 · 누적 제거 ${dropped}`);
  }
  await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
}

const keptCount = Object.values(kept).reduce((n, v) => n + v.length, 0);
console.log(
  `\n[filter] 후보 ${total} → 유지 ${keptCount} (제거 ${total - keptCount}, ${Math.round(((total - keptCount) / total) * 100)}%)`
);
console.log(`[filter] 근거가 남은 엣지 ${Object.keys(kept).length}/${keys.length}`);

if (DRY) {
  console.log('\n[filter] --dry 이므로 저장하지 않음. 샘플:');
  for (const k of Object.keys(kept).slice(0, 3)) {
    console.log(`  ${k}`);
    for (const s of kept[k]) console.log(`    · ${s.title.slice(0, 78)}`);
  }
} else {
  fs.writeFileSync(SRC, JSON.stringify(kept, null, 1) + '\n');
  console.log(`[filter] 저장 → ${SRC}`);
}
