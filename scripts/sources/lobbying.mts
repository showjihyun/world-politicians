/**
 * 로비 등록서(LD-1) 회전문 레이어 생성.
 *
 * 하원 사무국이 신고서 원본을 XML ZIP 으로 낸다. 키도 인증도 없다.
 *   목록  data/LD/LdSearchPastFilings.json
 *   파일  data/LD/2026_Registrations_XML.zip  (아카이브 2002~)
 *
 * 상원 시스템(lda.senate.gov)은 2026-06-30 에 닫혔고 후속 lda.gov 는 아직
 * 공개 전이지만, 두 원(院)이 같은 신고서를 받으므로 하원 원본으로 충분하다.
 *
 * 이 레이어가 말하는 것은 **"X 의 전직 보좌진이 지금 로비 업계에 있다"** 까지다.
 * 신고서의 고객은 기업이지 정치인이 아니므로 "이들이 X 를 로비한다" 가 아니다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/lobbying.mts --dry
 *   node --experimental-strip-types scripts/sources/lobbying.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  aggregate, buildPeopleIndex, buildStats, parseRegistration,
  type Registration,
} from './lobbying-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'src/data/lobbying.json');
const cacheDir = path.join(import.meta.dirname, '.lobbying-cache');

const BASE = 'https://disclosurespreview.house.gov/data/LD';
/** 최근 5년. 등록서는 새 고객 관계가 생길 때 내므로 여러 해를 봐야 사람이 모인다 */
const YEARS = [2022, 2023, 2024, 2025, 2026];
const MAX_ALUMNI = 12;

async function fetchZip(year: number): Promise<Buffer> {
  const name = `${year}_Registrations_XML.zip`;
  const cached = path.join(cacheDir, name);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  process.stdout.write(`  ${name} 내려받는 중…` + String.fromCharCode(10));
  const res = await fetch(`${BASE}/${name}`, { headers: { 'User-Agent': 'polaris-lobbying' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

/** zip 을 직접 푼다. 항목 수를 대조해 조용히 덜 읽는 것을 막는다 */
function* unzip(buf: Buffer): Generator<string> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 형식이 아니다 (EOCD 없음)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let seen = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    p += 46 + nameLen + extraLen + commentLen;
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(start, start + compSize);
    seen++;
    if (compSize === 0) continue;
    yield (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
  }
  if (seen !== count) throw new Error(`zip 항목 ${count}개 중 ${seen}개만 읽었다`);
}

// ── 인물 ──
const people: { id: string; name: string }[] = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/data/politicians'))) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/data/politicians', f), 'utf8');
  const marks = [...src.matchAll(/^\s+id:\s*'([a-z0-9-]+)',/gm)];
  for (let i = 0; i < marks.length; i++) {
    const chunk = src.slice(marks[i].index ?? 0, marks[i + 1]?.index ?? src.length);
    const name = chunk.match(/enName:\s*'([^']+)'/);
    if (name) people.push({ id: marks[i][1], name: name[1] });
  }
}
const index = buildPeopleIndex(people);

// ── 수집 ──
const filings: { year: number; registration: Registration }[] = [];
for (const year of YEARS) {
  let n = 0;
  for (const xml of unzip(await fetchZip(year))) {
    const r = parseRegistration(xml);
    if (r) { filings.push({ year, registration: r }); n++; }
  }
  process.stdout.write(`  ${year}: 등록서 ${n.toLocaleString()}건` + String.fromCharCode(10));
}

const byPerson = aggregate({ filings, index, maxAlumni: MAX_ALUMNI });
const stats = buildStats(filings, byPerson);

const payload = {
  generatedAt: new Date().toISOString(),
  years: YEARS,
  source: `${BASE}/`,
  note:
    '로비 등록서(LD-1)의 coveredPosition — 로비스트가 신고한 과거 정부 직위다. ' +
    '"이 인물의 전직 보좌진이 지금 로비 업계에 있다" 는 뜻이고, 그들이 이 인물을 ' +
    '로비한다는 뜻이 아니다. 신고서의 고객은 기업이다. ' +
    '이름은 "Rep./Sen. + 전체 이름" 형태만 인정한다 — 성만으로는 어느 의원인지 알 수 없다.',
  stats,
  people: byPerson,
};

// ── 보고 ──
console.log('로비 회전문');
console.log('─'.repeat(58));
console.log(`${YEARS[0]}~${YEARS[YEARS.length - 1]} 등록서 ${stats.registrations.toLocaleString()}건`);
console.log(`  로비스트 ${stats.lobbyists.toLocaleString()} · 직위 기재 ${stats.withPosition.toLocaleString()}`);
console.log(`  POLARIS 인물에 매칭 ${stats.matched.toLocaleString()}명분 · 인물 ${stats.people}명`);
const ranked = Object.entries(byPerson).sort((a, b) => b[1].alumniCount - a[1].alumniCount);
console.log('전직 보좌진이 많은 인물:');
for (const [pid, v] of ranked.slice(0, 6)) {
  console.log(`  ${String(v.alumniCount).padStart(3)}명  ${pid.padEnd(16)} 최다 행선지 ${v.topFirms[0]?.name.slice(0, 32) ?? '-'}`);
}
console.log('─'.repeat(58));

if (DRY) {
  console.log(`--dry — 쓰지 않았다 (${(JSON.stringify(payload).length / 1024).toFixed(0)}KB 예정)`);
} else {
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + String.fromCharCode(10));
  console.log(`${path.relative(ROOT, OUT)} 기록 (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
}
