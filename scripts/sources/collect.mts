/**
 * 관계 엣지의 근거 후보를 수집해 src/data/relationship-sources.ts 를 갱신한다.
 *
 *   1) 이미 수집된 뉴스 신호에서 페어가 일치하는 기사를 그대로 채택 (무료·즉시)
 *   2) 남은 페어는 두 인물 이름으로 Google News RSS 를 직접 질의
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/collect.mts          # 1단계만
 *   node --experimental-strip-types scripts/sources/collect.mts --fetch  # 2단계까지
 *
 * 2단계 결과는 "후보" 다. 자동 채택된 링크가 실제로 그 관계를 뒷받침하는지는
 * 사람이 확인해야 한다 — 이름만 함께 등장한 기사가 섞이기 때문이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, PERSON_ALIASES } from '../news-pipeline/config.mts';
import { isAllowedSource } from '../news-pipeline/fetch.mts';
import { pairKey } from './keys-core.mts';
import { rssField } from './parse-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'src/data/relationship-sources.json');
const DO_FETCH = process.argv.includes('--fetch');
// --dry 는 "쓰지 않는다", --fetch 는 "네트워크 단계를 돈다" — 축이 다르다.
// 다른 쓰기 스크립트와 같은 뜻으로 맞춘다 (scripts/audit/conventions.mts 가 강제)
const DRY = process.argv.includes('--dry');
const PER_PAIR = 3;

interface Src { title: string; url: string; source: string; date: string }


// ── 관계 목록 (정규식 파싱 — 런타임에 TS 를 들이지 않기 위해) ──
const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
const pairs = [...relText.matchAll(/\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)'/g)]
  .map((m) => [m[1], m[2]] as [string, string]);
console.log(`[sources] 관계 엣지 ${pairs.length}개`);

// ── 인물 표시 이름 ──
const names = new Map<string, string>();
for (const file of fs.readdirSync(CONFIG.paths.politiciansDir)) {
  if (!file.endsWith('.ts')) continue;
  const t = fs.readFileSync(path.join(CONFIG.paths.politiciansDir, file), 'utf8');
  for (const m of t.matchAll(/id:\s*'([a-z0-9-]+)'[\s\S]{0,400}?enName:\s*'([^']+)'/g)) {
    if (!names.has(m[1])) names.set(m[1], m[2]);
  }
}

// ── 1단계: 기존 신호에서 채택 ──
const signals: { pair?: [string, string]; title: string; url: string; source: string; date: string }[] =
  JSON.parse(fs.readFileSync(CONFIG.paths.outJson, 'utf8')).signals;

const collected = new Map<string, Src[]>();
for (const s of signals) {
  if (!s.pair) continue;
  const k = pairKey(s.pair[0], s.pair[1]);
  const arr = collected.get(k) ?? [];
  if (arr.some((x) => x.url === s.url)) continue;
  arr.push({ title: s.title, url: s.url, source: s.source, date: s.date });
  collected.set(k, arr);
}
const fromSignals = [...collected.keys()].filter((k) => pairs.some(([a, b]) => pairKey(a, b) === k)).length;
console.log(`[sources] 1단계 — 기존 신호로 커버된 엣지 ${fromSignals}개`);

// ── 2단계: 남은 페어 직접 질의 ──
const missing = pairs.filter(([a, b]) => !collected.has(pairKey(a, b)));
console.log(`[sources] 출처 없는 엣지 ${missing.length}개${DO_FETCH ? ' — 조회 시작' : ' (--fetch 로 조회)'}`);

/**
 * Google News RSS 한 건에서 기사 정보를 뽑는다.
 * link 는 news.google.com 리다이렉트라 도메인 화이트리스트가 통하지 않는다.
 * <source url="..."> 속성에 실제 매체 도메인이 들어 있으므로 그것으로 판별한다.
 */
function parseRss(xml: string): (Src & { srcUrl: string })[] {
  const out: (Src & { srcUrl: string })[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    // new RegExp('...[\s\S]...') 는 문자열 리터럴 안에서 \s 가 s 로 죽어
    // 태그를 전혀 못 잡는다. 정규식 리터럴로 고정한다.
    const grab = (re: RegExp): string => rssField(it, re);
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

if (DO_FETCH) {
  let done = 0;
  for (const [a, b] of missing) {
    const qa = PERSON_ALIASES[a]?.[0] ?? names.get(a) ?? a;
    const qb = PERSON_ALIASES[b]?.[0] ?? names.get(b) ?? b;
    const q = encodeURIComponent(`"${qa}" "${qb}"`);
    const url = `${CONFIG.googleNewsRss}?q=${q}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const hits = parseRss(await res.text())
          .filter((s) => isAllowedSource(s.srcUrl, s.source))
          .map(({ srcUrl: _drop, ...keep }) => keep)
          .slice(0, PER_PAIR);
        if (hits.length) collected.set(pairKey(a, b), hits);
      }
    } catch {
      /* 개별 실패는 건너뛴다 */
    }
    if (++done % 25 === 0) console.log(`[sources]   ${done}/${missing.length}`);
    await new Promise((r) => setTimeout(r, CONFIG.requestDelayMs));
  }
}

// ── 출력 ──
const keys = [...collected.keys()]
  .filter((k) => pairs.some(([a, b]) => pairKey(a, b) === k))
  .sort();

const out: Record<string, Src[]> = {};
for (const k of keys) out[k] = collected.get(k)!;

// TS 모듈이 아니라 JSON 으로 낸다 — 초기 번들에 들어가면 안 되는 크기라
// 앱에서 필요할 때만 동적 import 로 불러온다.
if (DRY) {
  console.log(`[sources] --dry — 쓰지 않음`);
} else {
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
}

console.log(`[sources] ${OUT} — 엣지 ${keys.length}/${pairs.length}개 (${Math.round((keys.length / pairs.length) * 100)}%)`);
