/**
 * 소스 간 ID 크로스워크 생성.
 *
 * 현직 의원 전원(공화·민주 + 무소속)에게 bioguide·icpsr·fec·govtrack·opensecrets 를
 * 한 레코드로 묶고, POLARIS 인물을 그 위에 얹는다.
 *
 * 왜 파일로 박는가: 이름 매칭은 방법이 조금만 달라져도 결과가 흔들린다. 실제로
 * 같은 데이터에서 75 와 79 가 나왔다. 매번 다시 맞추는 한 그 위에 쌓는 모든 수치가
 * 같이 흔들린다. 한 번 정해서 파일에 넣고, 이후에는 이 파일을 읽는다.
 *
 * 동명이인은 자동으로 정하지 않는다. crosswalk-overrides.json 에 사람이 적어야
 * 하고, 적지 않으면 **쓰지 않고 종료 코드 1 로 끝난다.** 조용히 틀린 사람에게
 * 붙는 것보다 멈추는 편이 낫다.
 *
 * 실행:
 *   node --experimental-strip-types scripts/sources/crosswalk.mts --dry
 *   node --experimental-strip-types scripts/sources/crosswalk.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildIndex, buildStats, buildSurnameIndex, fillIcpsr, filterParties, icpsrByBioguide,
  needsDecision, normalizeName, parseCsv, parsePoliticians, partyMismatches, resolveAll, toMember,
  type Legislator, type Member, type Override, type Politician,
} from './crosswalk-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'src/data/crosswalk.json');
const OVERRIDES = path.join(import.meta.dirname, 'crosswalk-overrides.json');
const cacheDir = path.join(import.meta.dirname, '.crosswalk-cache');

const BASE = 'https://unitedstates.github.io/congress-legislators';
const VOTEVIEW = 'https://voteview.com/static/data/out/members/HSall_members.csv';
/** 무소속 2명(Sanders·King)을 빼면 우리 그래프의 인물이 사라진다 — 명시적으로 넣는다 */
const PARTIES = ['R', 'D', 'I'] as const;

// ── 원본 적재 (캐시) ──
async function download(url: string, cacheName: string): Promise<string> {
  const cached = path.join(cacheDir, cacheName);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');

  process.stdout.write(`  ${cacheName} 내려받는 중…\n`);
  const res = await fetch(url, { headers: { 'User-Agent': 'polaris-crosswalk' } });
  if (!res.ok) throw new Error(`${cacheName}: HTTP ${res.status}`);
  const body = await res.text();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, body);
  return body;
}

const load = async (name: string): Promise<Legislator[]> =>
  JSON.parse(await download(`${BASE}/${name}.json`, `${name}.json`));

const current = await load('legislators-current');
const historical = await load('legislators-historical');
// congress-legislators 의 icpsr 는 절반 넘게 비어 있다(현직 537명 중 319명).
// 표결 감사가 그 필드에만 기대면 41% 가 조용히 빠지므로 Voteview 원본에서 채운다.
const voteview = icpsrByBioguide(parseCsv(await download(VOTEVIEW, 'voteview-members.csv')));

// ── POLARIS 인물 ──
const people: Politician[] = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/data/politicians'))) {
  if (!f.endsWith('.ts')) continue;
  people.push(...parsePoliticians(fs.readFileSync(path.join(ROOT, 'src/data/politicians', f), 'utf8')));
}

// '_' 로 시작하는 키는 파일 안의 설명이다 — 인물 id 가 아니다
const overrides: Record<string, Override> = Object.fromEntries(
  Object.entries(
    fs.existsSync(OVERRIDES) ? (JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) as Record<string, Override>) : {}
  ).filter(([k]) => !k.startsWith('_'))
);

// ── 해결 ──
// 색인은 현직 + 역대 전부로 만든다. 역대를 빼면 전직 의원이 통째로 누락된다 —
// 로드맵에서 두 번 저지른 실수다.
const index = buildIndex([...current, ...historical]);
const resolutions = resolveAll(people, index, overrides);

const surnames = buildSurnameIndex([...current, ...historical]);
const pending = needsDecision(resolutions, surnames);
if (pending.length) {
  const byBioguide = new Map(
    [...current, ...historical].filter((l) => l.id?.bioguide).map((l) => [l.id.bioguide!, l])
  );
  const label = (bio: string) => {
    const l = byBioguide.get(bio);
    if (!l) return bio;
    const t = l.terms?.[l.terms.length - 1];
    const n = l.name.official_full ?? `${l.name.first ?? ''} ${l.name.last ?? ''}`.trim();
    return `${bio} ${n}${t ? ` (${t.type} ${t.state} ~${t.end.slice(0, 4)})` : ''}`;
  };

  console.error('\n사람이 정해야 할 것이 남았다. crosswalk-overrides.json 에 적어라.\n');
  for (const r of pending) {
    const parts = normalizeName(r.name).split(' ').filter(Boolean);
    const cands = r.match.candidates ?? surnames.get(parts[parts.length - 1] ?? '') ?? [];
    const why = r.match.reason === 'ambiguous' ? '동명이인' : '성은 같은데 못 맞춤';
    console.error(`  ${r.name}  — ${why}`);
    for (const c of cands.slice(0, 4)) console.error(`      ${label(c)}`);
    console.error(`    "${r.id}": { "bioguide": null, "reason": "" },\n`);
  }
  console.error('쓰지 않고 종료한다. 틀린 사람에게 붙는 것보다 멈추는 편이 낫다.');
  process.exitCode = 1;
} else {
  // ── 명부 구성 ──
  // 현직 전원 + POLARIS 가 가리키는 역대 의원(전직 의원이 우리 그래프에 있다)
  const wanted = new Set(resolutions.map((r) => r.match.bioguide).filter(Boolean) as string[]);
  const members: Member[] = [];
  const seen = new Set<string>();

  for (const l of current) {
    const m = toMember(l, true);
    if (m && !seen.has(m.bioguide)) { members.push(m); seen.add(m.bioguide); }
  }
  for (const l of historical) {
    const bio = l.id?.bioguide;
    if (!bio || seen.has(bio) || !wanted.has(bio)) continue;
    const m = toMember(l, false);
    if (m) { members.push(m); seen.add(bio); }
  }

  const kept = filterParties(members, PARTIES);
  const dropped = members.length - kept.length;
  const byBio = new Map(kept.map((m) => [m.bioguide, m]));

  // 걸러낸 정당 때문에 POLARIS 인물이 사라지면 안 된다
  const orphan = resolutions.filter((r) => r.match.bioguide && !byBio.has(r.match.bioguide));
  for (const r of orphan) {
    const m = members.find((x) => x.bioguide === r.match.bioguide);
    if (m) { kept.push(m); byBio.set(m.bioguide, m); }
  }

  const { members: filledMembers, filled } = fillIcpsr(kept, voteview);
  filledMembers.sort((a, b) => a.bioguide.localeCompare(b.bioguide));
  const stats = buildStats(filledMembers, resolutions);
  const currentOnly = filledMembers.filter((m) => m.current);
  const mismatches = partyMismatches(people, resolutions, new Map(filledMembers.map((m) => [m.bioguide, m])));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: `${BASE}/`,
    note: '현직 의원 전원 + POLARIS 가 참조하는 역대 의원. 동명이인은 crosswalk-overrides.json 에서 확정한다.',
    stats,
    polaris: Object.fromEntries(
      resolutions.map((r) => [r.id, { bioguide: r.match.bioguide, method: r.match.method }])
    ),
    members: filledMembers,
  };

  // ── 보고 ──
  console.log('크로스워크');
  console.log('─'.repeat(58));
  const cur = (f: (m: typeof filledMembers[0]) => boolean) => currentOnly.filter(f).length;
  console.log(`의원 ${stats.members}  = 현직 ${currentOnly.length} + 전직 ${stats.members - currentOnly.length}`);
  console.log(`  현직: 상원 ${cur((m) => m.chamber === 'senate')} · 하원 ${cur((m) => m.chamber === 'house')}` +
    `  (${Object.entries(stats.byParty).map(([k, v]) => `${k} ${v}`).join(' · ')} — 전직 포함)`);
  console.log(`  icpsr 보유 ${stats.withIcpsr}/${stats.members} (Voteview 로 ${filled}건 보충) · fec 보유 ${stats.withFec}`);
  if (dropped > 0) console.log(`  제외한 소수정당·공석 ${dropped}`);
  console.log(`POLARIS ${stats.polarisMatched}/${stats.polarisTotal} 매칭`);
  const byMethod: Record<string, number> = {};
  for (const r of resolutions) if (r.match.method) byMethod[r.match.method] = (byMethod[r.match.method] ?? 0) + 1;
  console.log(`  방식: ${Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}`);
  const none = resolutions.filter((r) => !r.match.bioguide);
  console.log(`  의회 기록 없음 ${none.length}: ${none.slice(0, 6).map((r) => r.name).join(', ')}${none.length > 6 ? ' …' : ''}`);

  if (mismatches.length) {
    console.log('─'.repeat(58));
    console.log(`소속이 어긋나는 인물 ${mismatches.length} — 우리 라벨 vs 의회 기록`);
    for (const m of mismatches) console.log(`  ${m.id}: 우리 '${m.ours}' · 기록 '${m.theirs}'`);
  }
  console.log('─'.repeat(58));

  if (DRY) {
    console.log(`--dry — 쓰지 않았다 (${(JSON.stringify(payload).length / 1024).toFixed(0)}KB 예정)`);
  } else {
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
    console.log(`${path.relative(ROOT, OUT)} 기록 (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`);
  }
}
