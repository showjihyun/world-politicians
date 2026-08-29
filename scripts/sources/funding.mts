/**
 * FEC 자금 레이어 생성.
 *
 * 2025-26 주기의 후보 재무 요약과 위원회→후보 거래를 받아 인물별로 묶어
 * `src/data/funding.json` 에 쓴다. 크로스워크의 `fec` id 로 붙이므로 여기서는
 * 이름 매칭을 하지 않는다.
 *
 * 로드맵은 이걸 "엣지 레이어" 로 예상했지만 실측 결과 아니었다.
 *   공동 후원자 엣지 — 겹침 8개 이상이 5쌍뿐이고 100% 같은 코커스였다.
 *     당을 다시 쓰는 것 외에 정보가 없다.
 *   리더십 PAC 을 통한 정치인 → 정치인 — 벌크에 PAC 소유자 연결이 36개뿐이라
 *     붙일 수 없다. 이름 매칭으로 때우면 그게 곧 흔들림의 원인이 된다.
 * 그래서 엣지가 아니라 인물 속성으로 만든다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/funding.mts --dry
 *   node --experimental-strip-types scripts/sources/funding.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  aggregate, buildStats, parseCandidateSummary, parseCommittee, parsePas2,
  type CandidateSummary, type Committee, type Pas2Row,
} from './funding-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'src/data/funding.json');
const cacheDir = path.join(import.meta.dirname, '.funding-cache');

const CYCLE = 2026;
const TOP_N = 8;
const BASE = `https://www.fec.gov/files/bulk-downloads/${CYCLE}`;
const FILES = { summary: 'weball26', committees: 'cm26', transactions: 'pas226' } as const;

async function fetchZip(name: string): Promise<Buffer> {
  const cached = path.join(cacheDir, `${name}.zip`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  process.stdout.write(`  ${name} 내려받는 중…` + String.fromCharCode(10));
  const res = await fetch(`${BASE}/${name}.zip`, { headers: { 'User-Agent': 'polaris-funding' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

/** zip 안의 단일 텍스트 항목을 꺼낸다. FEC 벌크는 항목이 하나뿐이다 */
function unzipOne(buf: Buffer): string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 형식이 아니다 (EOCD 없음)');
  const count = buf.readUInt16LE(eocd + 10);
  if (count !== 1) throw new Error(`zip 항목이 ${count}개다 — FEC 벌크는 하나여야 한다`);
  const p = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(p + 10);
  const compSize = buf.readUInt32LE(p + 20);
  const localOff = buf.readUInt32LE(p + 42);
  const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
  const raw = buf.subarray(start, start + compSize);
  // FEC 벌크는 latin-1 이다. utf8 로 읽으면 회사명의 악센트가 깨진다
  return (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('latin1');
}

const lines = async (name: string) => unzipOne(await fetchZip(name)).split(/\r?\n/);

// ── 크로스워크 ──
const cwPath = path.join(ROOT, 'src/data/crosswalk.json');
if (!fs.existsSync(cwPath)) {
  console.error('crosswalk.json 이 없다 — npm run crosswalk 를 먼저 돌린다');
  process.exitCode = 1;
} else {
  const cw = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as {
    polaris: Record<string, { bioguide: string | null }>;
    members: { bioguide: string; fec: string[] }[];
  };
  const fecByBio = new Map(cw.members.map((m) => [m.bioguide, m.fec]));
  const toPolaris = new Map<string, string>();
  for (const [pid, v] of Object.entries(cw.polaris)) {
    for (const f of (v.bioguide && fecByBio.get(v.bioguide)) || []) toPolaris.set(f, pid);
  }

  // ── 적재 ──
  const committees = new Map<string, Committee>();
  for (const l of await lines(FILES.committees)) {
    const c = parseCommittee(l);
    if (c) committees.set(c.id, c);
  }
  const summaries: CandidateSummary[] = [];
  for (const l of await lines(FILES.summary)) {
    const s = parseCandidateSummary(l);
    if (s) summaries.push(s);
  }
  const rows: Pas2Row[] = [];
  for (const l of await lines(FILES.transactions)) {
    const r = parsePas2(l);
    if (r) rows.push(r);
  }
  process.stdout.write(
    `  위원회 ${committees.size.toLocaleString()} · 후보 ${summaries.length.toLocaleString()} · 거래 ${rows.length.toLocaleString()}` +
      String.fromCharCode(10)
  );

  const people = aggregate({ toPolaris, committees, summaries, rows, topN: TOP_N });
  const stats = buildStats(people);
  const through = summaries.find((s) => toPolaris.has(s.candidateId))?.through ?? '';

  const payload = {
    generatedAt: new Date().toISOString(),
    cycle: CYCLE,
    coverageThrough: through,
    source: `${BASE}/`,
    note:
      '공시된 직접 기부에 한한다. 개인 기부는 총액만 있고(200달러 초과분만 항목화), ' +
      '독립지출은 후보와 조율이 금지된 별개의 돈이라 기부에 합치지 않았다 — ' +
      '특히 24A 는 후보를 **반대**하는 지출이다. 본인 공동모금위원회에서 들어온 돈은 뺐다.',
    stats,
    people,
  };

  // ── 보고 ──
  const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
  console.log('FEC 자금');
  console.log('─'.repeat(58));
  console.log(`${CYCLE} 주기 · ${stats.people}명 · ${through} 까지`);
  console.log(`  총 수입      ${money(stats.receipts)}`);
  console.log(`  개인 기부    ${money(stats.individual)}  (${Math.round((100 * stats.individual) / stats.receipts)}%)  — 총액만, 기부자 불명`);
  console.log(`  PAC 직접기부 ${money(stats.pacDirect)}  (${stats.namedSharePct}%)  — 이름 있는 기부자`);
  console.log(`  독립지출     지지 ${money(stats.ieSupport)} · 반대 ${money(stats.ieOppose)}  — 기부 아님`);
  const ranked = Object.entries(people).sort((a, b) => b[1].pacDirect - a[1].pacDirect);
  console.log('PAC 기부 상위:');
  for (const [pid, f] of ranked.slice(0, 5)) {
    console.log(`  ${money(f.pacDirect).padStart(7)}  ${pid.padEnd(16)} 최대 후원 ${f.topFunders[0]?.name.slice(0, 34) ?? '-'}`);
  }
  const attacked = Object.entries(people).sort((a, b) => b[1].ieOppose - a[1].ieOppose)[0];
  if (attacked?.[1].ieOppose) {
    console.log(`반대 지출 최다: ${attacked[0]} ${money(attacked[1].ieOppose)}`);
  }
  console.log('─'.repeat(58));

  if (DRY) {
    console.log(`--dry — 쓰지 않았다 (${(JSON.stringify(payload).length / 1024).toFixed(0)}KB 예정)`);
  } else {
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + String.fromCharCode(10));
    console.log(`${path.relative(ROOT, OUT)} 기록 (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
  }
}
