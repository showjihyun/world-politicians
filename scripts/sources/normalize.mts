/**
 * 수집된 출처의 표기 정리.
 *
 * 감사에서 나온 문제:
 *   - 제목 452/478 에 " - 매체명" 이 붙어 있다 (Google News RSS 형식이 그대로 샌다).
 *     매체명은 옆 칸에 따로 표시되므로 화면에 두 번 나온다.
 *   - HTML 엔티티가 디코딩되지 않았다 ("E&amp;E News", "AI &amp; Tech Brief").
 *   - 같은 매체가 여러 라벨로 갈렸다 (ABC News / "ABC News - Breaking News, Latest
 *     News and Videos", E&E News by POLITICO / E&amp;E News by POLITICO 등 22종).
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/normalize.mts --dry
 *   node --experimental-strip-types scripts/sources/normalize.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'src/data/relationship-sources.json');
const DRY = process.argv.includes('--dry');

interface Src { title: string; url: string; source: string; date: string }

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'",
  '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&rsquo;': '’', '&lsquo;': '‘',
  '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—', '&ndash;': '–',
  '&hellip;': '…',
};

function decode(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  return out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** 라벨을 정본 매체명으로 모은다 */
const CANON: [RegExp, string][] = [
  [/^ap news$|^associated press$|^ap$/i, 'AP News'],
  [/reuters/i, 'Reuters'],
  [/^cnn/i, 'CNN'],
  [/fox news/i, 'Fox News'],
  [/nbc news/i, 'NBC News'],
  [/abc news/i, 'ABC News'],
  [/cbs news/i, 'CBS News'],
  [/^npr/i, 'NPR'],
  [/e&e news/i, 'E&E News by Politico'],
  [/politico pro/i, 'Politico'],
  [/politico/i, 'Politico'],
  [/the hill/i, 'The Hill'],
  [/^axios/i, 'Axios'],
  [/roll call/i, 'Roll Call'],
  [/washington examiner/i, 'Washington Examiner'],
  [/^semafor/i, 'Semafor'],
  [/new york times/i, 'The New York Times'],
  [/washington post/i, 'The Washington Post'],
  [/wall street journal|^wsj$/i, 'The Wall Street Journal'],
];

function canonSource(raw: string): string {
  const s = decode(raw).trim();
  for (const [re, name] of CANON) if (re.test(s)) return name;
  return s;
}

/**
 * Google News 는 제목 끝에 " - 매체명" 을 붙인다. 매체명은 별도 칸에 표시되므로
 * 중복이다. 제목 자체에 하이픈이 들어간 경우를 지우지 않도록, 꼬리가 실제
 * 매체명과 일치할 때만 잘라낸다.
 */
function stripOutlet(title: string, source: string): string {
  const t = decode(title).replace(/\s+/g, ' ').trim();

  // 매체명이 제목 중간에 오고 그 뒤에 슬로건이 더 붙는 경우가 있다
  // ("... march' - ABC News - Breaking News, Latest News and Videos").
  // 마지막 ' - ' 만 보면 꼬리가 슬로건이라 매체명과 안 맞아 못 자른다.
  // 매체명이 나오는 자리에서 바로 자른다.
  const at = t.toLowerCase().indexOf(' - ' + source.toLowerCase());
  if (at >= 20) return t.slice(0, at).trim();

  const cut = t.lastIndexOf(' - ');
  if (cut < 20) return t;
  const tail = t.slice(cut + 3).trim();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nTail = norm(tail);
  const nSrc = norm(source);
  if (!nTail) return t;
  const looksLikeOutlet =
    nTail === nSrc ||
    nSrc.startsWith(nTail) ||
    nTail.startsWith(nSrc) ||
    /^(the)?(hill|verge|guardian|atlantic|independent|times|post|news)/.test(nTail);
  return looksLikeOutlet ? t.slice(0, cut).trim() : t;
}

const map: Record<string, Src[]> = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let titleFix = 0;
let sourceFix = 0;
const before = new Set<string>();
const after = new Set<string>();
const samples: string[] = [];

for (const [key, list] of Object.entries(map)) {
  map[key] = list.map((s) => {
    before.add(s.source);
    const source = canonSource(s.source);
    const title = stripOutlet(s.title, source);
    if (title !== s.title) {
      titleFix++;
      if (samples.length < 6) samples.push(`  "${s.title.slice(-52)}"\n   → "${title.slice(-52)}"`);
    }
    if (source !== s.source) sourceFix++;
    after.add(source);
    return { ...s, title, source };
  });
}

console.log(`제목 정리 ${titleFix}건 · 매체명 정리 ${sourceFix}건`);
console.log(`고유 매체명 ${before.size} → ${after.size}`);
console.log(`정리 후 목록: ${[...after].sort().join(' · ')}`);
if (samples.length) {
  console.log('\n제목 변경 예시:');
  samples.forEach((x) => console.log(x));
}

if (DRY) {
  console.log('\n--dry 이므로 저장하지 않음');
} else {
  fs.writeFileSync(SRC, JSON.stringify(map, null, 1) + '\n');
  console.log(`\n저장 → ${SRC}`);
}
