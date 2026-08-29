/**
 * 공동발의 엣지 생성.
 *
 * GovInfo 의 BILLSTATUS 벌크(zip)를 받아 발의자 ↔ 공동발의자 쌍을 세고,
 * 기준선을 넘는 쌍을 `src/data/cosponsorship.json` 에 쓴다.
 *
 * 크로스워크(`src/data/crosswalk.json`)가 먼저 있어야 한다. 이름이 아니라
 * bioguide 로 붙이기 때문에 여기서는 이름 매칭을 하지 않는다 — 그 판단은
 * 1단계에서 이미 끝났고 파일에 박혀 있다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/cosponsor.mts --dry
 *   node --experimental-strip-types scripts/sources/cosponsor.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  buildStats, pairKey, parseBill, selectEdges, tallyPairs,
  type Bill, type CosponsorEdge,
} from './cosponsor-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'src/data/cosponsorship.json');
// 근거 표본은 62KB 다. 엣지(16KB)만 초기 번들에 넣고 표본은 눌렀을 때 부른다 —
// relationship-sources.json 과 같은 이유, 같은 방식이다.
const OUT_SOURCES = path.join(ROOT, 'src/data/cosponsorship-sources.json');
const cacheDir = path.join(import.meta.dirname, '.cosponsor-cache');

const CONGRESS = 119;
/** 5건으로 내리면 신규 264개가 되어 큐레이션한 266개가 절반으로 묻힌다 */
const THRESHOLD = 10;
const CHAMBERS = ['s', 'hr'] as const;
const BASE = `https://www.govinfo.gov/bulkdata/BILLSTATUS/${CONGRESS}`;

// ── zip 적재 (캐시) ──
async function fetchZip(chamber: string): Promise<Buffer> {
  const cached = path.join(cacheDir, `${CONGRESS}-${chamber}.zip`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);

  const url = `${BASE}/${chamber}/BILLSTATUS-${CONGRESS}-${chamber}.zip`;
  process.stdout.write(`  ${chamber} 내려받는 중…\n`);
  const res = await fetch(url, { headers: { 'User-Agent': 'polaris-cosponsor' } });
  if (!res.ok) throw new Error(`${chamber}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

/**
 * zip 을 직접 읽는다.
 *
 * 의존성을 늘리지 않으려고 중앙 디렉터리를 훑어 deflate 항목만 푼다.
 * GovInfo 의 BILLSTATUS zip 은 항목이 전부 단순 deflate(방식 8) 또는 무압축(0)이다.
 */
function* unzip(buf: Buffer): Generator<string> {
  // 중앙 디렉터리 끝(EOCD) 을 뒤에서 찾는다
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 형식이 아니다 (EOCD 없음)');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    p += 46 + nameLen + extraLen + commentLen;

    // 로컬 헤더의 가변 길이는 중앙 디렉터리와 다를 수 있어 다시 읽는다
    const lnLen = buf.readUInt16LE(localOff + 26);
    const leLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lnLen + leLen;
    const raw = buf.subarray(start, start + compSize);
    if (compSize === 0) continue;
    yield (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
  }
}

/** zip 안의 항목 수 — 다 읽었는지 대조하기 위한 것 */
function countEntries(buf: Buffer): number {
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return buf.readUInt16LE(i + 10);
  }
  return -1;
}

// ── 크로스워크 ──
const cwPath = path.join(ROOT, 'src/data/crosswalk.json');
if (!fs.existsSync(cwPath)) {
  console.error('crosswalk.json 이 없다 — npm run crosswalk 를 먼저 돌린다');
  process.exitCode = 1;
} else {
  const cw = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as {
    polaris: Record<string, { bioguide: string | null }>;
    members: { bioguide: string; party: string; caucus: string }[];
  };
  const toPolaris = new Map<string, string>();
  for (const [id, v] of Object.entries(cw.polaris)) if (v.bioguide) toPolaris.set(v.bioguide, id);
  // 정당이 아니라 코커스로 비교한다 — Sanders(I) × Markey(D) 는 초당적이 아니다
  const partyByBio = new Map(cw.members.map((m) => [m.bioguide, m.caucus || m.party]));
  const caucusOf = new Map<string, string>();
  for (const [bio, id] of toPolaris) caucusOf.set(id, partyByBio.get(bio) ?? '');

  const relText = fs.readFileSync(path.join(ROOT, 'src/data/relationships.ts'), 'utf8');
  const curated = new Set(
    [...relText.matchAll(/\ba:\s*'([a-z0-9-]+)',\s*b:\s*'([a-z0-9-]+)'/g)].map((m) => pairKey(m[1], m[2]))
  );

  // ── 수집 ──
  const bills: Bill[] = [];
  for (const chamber of CHAMBERS) {
    let n = 0;
    let seen = 0;
    for (const xml of unzip(await fetchZip(chamber))) {
      seen++;
      const b = parseBill(xml);
      if (b) { bills.push(b); n++; }
    }
    // zip 을 직접 푸는 코드라 조용히 덜 읽으면 엣지가 소리 없이 줄어든다.
    // 항목 수와 읽은 수가 다르면 멈춘다.
    const entries = countEntries(await fetchZip(chamber));
    if (seen !== entries) {
      throw new Error(`${chamber}: zip 항목 ${entries}개 중 ${seen}개만 읽었다 — 압축 해제가 덜 됐다`);
    }
    process.stdout.write(`  ${chamber}: 법안 ${n.toLocaleString()}건 / 항목 ${entries.toLocaleString()}` + String.fromCharCode(10));
  }

  const tally = tallyPairs(bills);
  const edges: CosponsorEdge[] = selectEdges(tally, { threshold: THRESHOLD, toPolaris, caucusOf, curated });
  const stats = buildStats(bills.length, tally, edges);

  const payload = {
    generatedAt: new Date().toISOString(),
    congress: CONGRESS,
    threshold: THRESHOLD,
    source: `${BASE}/`,
    note:
      '발의자 ↔ 공동발의자 쌍. 표결 일치도가 아니라 공동발의를 쓴 이유는 표결이 당론에 끌려가기 때문이다. ' +
      'duplicate 는 이미 큐레이션된 관계가 있는 쌍이며 그래프에 선을 두 번 긋지 않는다. ' +
      '근거 표본은 cosponsorship-sources.json 에 따로 있다.',
    stats,
    edges: edges.map(({ samples: _drop, ...rest }) => rest),
  };

  // pairKey → 근거. relationship-sources.json 과 같은 모양이라 같은 로더가 읽는다.
  //
  // 큐레이션된 쌍은 넣지 않는다. 근거 패널은 최근 4건만 보여주는데 법안 날짜가
  // 기사보다 새로워서 **관계를 뒷받침하던 기사를 밀어냈다.** 대상 2건이 전부 밀렸다.
  // 그 쌍의 공동발의 건수는 엣지 데이터에 남으므로 화면에서는 건수로 보여준다.
  const sources = Object.fromEntries(
    edges
      .filter((e) => !e.duplicate)
      .map((e) => [
      pairKey(e.a, e.b),
      e.samples.map((s) => ({
        title: s.title || s.id.toUpperCase(),
        url: s.url,
        source: 'Congress.gov',
        date: s.date,
      })),
    ])
  );

  // ── 보고 ──
  console.log('공동발의');
  console.log('─'.repeat(58));
  console.log(`${CONGRESS}대 법안 ${stats.billsScanned.toLocaleString()}건 · 쌍 ${stats.pairsAll.toLocaleString()}`);
  console.log(`기준 ${THRESHOLD}건 이상 → 엣지 ${stats.edges} (신규 ${stats.fresh} · 초당적 ${stats.crossParty})`);
  const directed = edges.filter((e) => e.initiator).length;
  console.log(`방향 있음 ${directed} · 상호적 ${edges.length - directed}`);
  console.log('상위:');
  for (const e of edges.slice(0, 6)) {
    const arrow = e.initiator === 'a' ? `${e.a} → ${e.b}` : e.initiator === 'b' ? `${e.b} → ${e.a}` : `${e.a} ⇄ ${e.b}`;
    console.log(
      `  ${String(e.bills).padStart(3)}건  ${arrow}  (${e.sponsoredByA}/${e.sponsoredByB})` +
        `${e.crossParty ? '  [초당적]' : ''}${e.duplicate ? '  [기존]' : ''}`
    );
  }
  console.log('─'.repeat(58));

  if (DRY) {
    console.log(`--dry — 쓰지 않았다 (${(JSON.stringify(payload).length / 1024).toFixed(0)}KB 예정)`);
  } else {
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
    fs.writeFileSync(OUT_SOURCES, JSON.stringify(sources, null, 2) + '\n');
    for (const f of [OUT, OUT_SOURCES]) {
      console.log(`${path.relative(ROOT, f)} 기록 (${(fs.statSync(f).size / 1024).toFixed(0)}KB)`);
    }
  }
}
