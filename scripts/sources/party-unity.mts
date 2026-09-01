/**
 * 당론 이탈률 — Voteview 호명투표에서 "자기 당 다수와 반대로 던진 비율" 을 낸다.
 *
 *   node --experimental-strip-types scripts/sources/party-unity.mts --dry
 *   node --experimental-strip-types scripts/sources/party-unity.mts
 *
 * 왜 이 지표인가. 표결 **일치도**(두 사람이 얼마나 같이 던지는가)는 당적의
 * 대리변수라 이미 기각됐다 — Cruz × Hawley 98.6% 는 관계가 아니라 소속이었다.
 * 이탈률은 자기 당을 기준으로 잡으므로 소속이 상수가 되고, "당에 맞선다" 를
 * 직접 잰다. 실제로 상위가 Perez·Golden·Fitzpatrick·Fetterman·Collins·Massie 로
 * 나와 안면 타당도가 확인됐다 — DW-NOMINATE 이탈은 Massie 를 평균 이하로 놓쳤다.
 *
 * **관계를 설명하는 값이 아니다.** 당내 갈등 엣지와의 상관을 두 지표로 검증했고
 * 둘 다 무신호였다(NOMINATE p=0.813, 이탈률 p=0.992). Collins 16.5% · Fitzpatrick
 * 22.9% 는 당내 feud 가 0 이다. 조용히 상시 이탈하는 것은 공개 충돌을 낳지 않는다.
 * 인물 속성으로만 쓰고, 엣지를 만들지 않는다.
 *
 * 경로는 지어내지 않았다. voteview.com/data 와 articles/data_help_votes 가
 * 링크로 준 것을 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  castOf,
  defectionRate,
  isPartyVote,
  majority,
  medianOf,
  sideOf,
  type Cast,
  type Side,
} from './party-unity-core.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DRY = process.argv.includes('--dry');
const OUT = path.join(ROOT, 'src/data/party-unity.json');
const cacheDir = path.join(import.meta.dirname, '.party-unity-cache');

const CONGRESS = 119;
/** 분모가 이보다 얇으면 값을 내지 않는다 — 3건 중 1건이 33% 가 되는 것을 막는다 */
const MIN_VOTES = 30;
const BASE = 'https://voteview.com/static/data/out';

async function grab(url: string, name: string): Promise<string> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, name);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} ${res.status} — ${url}`);
  const text = await res.text();
  fs.writeFileSync(cached, text);
  return text;
}

/** bioname 에 쉼표가 있어 단순 split 이 밀린다 */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function table(text: string): { head: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return { head: lines[0].split(','), rows: lines.slice(1).map(splitCsv) };
}

const cwPath = path.join(ROOT, 'src/data/crosswalk.json');
if (!fs.existsSync(cwPath)) {
  console.error('[party-unity] crosswalk.json 이 없다 — npm run crosswalk 먼저');
  // 아직 아무것도 시작하지 않았다. 멈추지 않으면 없는 파일로 계속 간다.
  process.exit(1);
}

interface Member {
  side: Side | null;
  chamber: string;
  bioguide: string;
  name: string;
}

async function main(): Promise<void> {
  const cross = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as {
    polaris: Record<string, { bioguide: string | null }>;
    members: { bioguide: string; caucus?: string }[];
  };
  const caucusByBio = new Map(cross.members.map((m) => [m.bioguide, m.caucus ?? null]));

  // ── 의원 명부 ──
  const mem = table(await grab(`${BASE}/members/HSall_members.csv`, 'HSall_members.csv'));
  const mIdx = (n: string) => mem.head.indexOf(n);
  const CHAMBERS = new Set(['House', 'Senate']);
  const members = new Map<number, Member>();
  for (const f of mem.rows) {
    if (f[mIdx('congress')] !== String(CONGRESS)) continue;
    // Voteview 는 대통령의 입장 표명도 한 행으로 담는다 — 의회 표결이 아니다.
    if (!CHAMBERS.has(f[mIdx('chamber')])) continue;
    const bioguide = f[mIdx('bioguide_id')];
    members.set(Number(f[mIdx('icpsr')]), {
      side: sideOf(f[mIdx('party_code')], caucusByBio.get(bioguide)),
      chamber: f[mIdx('chamber')],
      bioguide,
      name: f[mIdx('bioname')],
    });
  }

  // ── 표결 ──
  // 전체 의회 파일은 669MB 다. 의회별 파일이 따로 있어 그것만 받는다.
  const calls = new Map<string, Map<number, Cast>>();
  for (const ch of ['H', 'S']) {
    const name = `${ch}${CONGRESS}_votes.csv`;
    const v = table(await grab(`${BASE}/votes/${name}`, name));
    const vIdx = (n: string) => v.head.indexOf(n);
    for (const f of v.rows) {
      const cast = castOf(Number(f[vIdx('cast_code')]));
      if (!cast) continue;
      const key = `${ch}|${f[vIdx('rollnumber')]}`;
      let m = calls.get(key);
      if (!m) calls.set(key, (m = new Map()));
      m.set(Number(f[vIdx('icpsr')]), cast);
    }
  }

  // ── 정당 표결만 골라 이탈을 센다 ──
  const tally = new Map<number, { votes: number; against: number }>();
  let partyVotes = 0;
  for (const votes of calls.values()) {
    const t = { D: { Y: 0, N: 0 }, R: { Y: 0, N: 0 } };
    for (const [icpsr, cast] of votes) {
      const side = members.get(icpsr)?.side;
      if (side) t[side][cast]++;
    }
    const dMaj = majority(t.D.Y, t.D.N);
    const rMaj = majority(t.R.Y, t.R.N);
    if (!isPartyVote(dMaj, rMaj)) continue;
    partyVotes++;
    for (const [icpsr, cast] of votes) {
      const side = members.get(icpsr)?.side;
      if (!side) continue;
      const own = side === 'D' ? dMaj : rMaj;
      let rec = tally.get(icpsr);
      if (!rec) tally.set(icpsr, (rec = { votes: 0, against: 0 }));
      rec.votes++;
      if (cast !== own) rec.against++;
    }
  }

  // ── 같은 당·같은 원 중앙값 (홀로 놓인 비율은 읽을 수 없다) ──
  const byGroup = new Map<string, number[]>();
  for (const [icpsr, t] of tally) {
    const m = members.get(icpsr);
    const r = defectionRate(t, MIN_VOTES);
    if (!m?.side || r === null) continue;
    const k = `${m.chamber}|${m.side}`;
    byGroup.set(k, [...(byGroup.get(k) ?? []), r]);
  }
  const medians: Record<string, number> = {};
  for (const [k, arr] of byGroup) {
    const med = medianOf(arr);
    if (med !== null) medians[k] = Math.round(med * 100) / 100;
  }

  // ── POLARIS 인물에 붙인다 ──
  const bioToIcpsr = new Map([...members.entries()].map(([ic, m]) => [m.bioguide, ic]));
  const people: Record<string, { rate: number; votes: number; against: number; side: Side; chamber: string }> = {};
  let noSeat = 0;
  for (const [id, v] of Object.entries(cross.polaris)) {
    if (!v.bioguide) {
      noSeat++;
      continue;
    }
    const icpsr = bioToIcpsr.get(v.bioguide);
    const m = icpsr != null ? members.get(icpsr) : undefined;
    const t = icpsr != null ? tally.get(icpsr) : undefined;
    if (!m?.side || !t) {
      noSeat++;
      continue;
    }
    const rate = defectionRate(t, MIN_VOTES);
    if (rate === null) {
      noSeat++;
      continue;
    }
    people[id] = {
      rate: Math.round(rate * 10) / 10,
      votes: t.votes,
      against: t.against,
      side: m.side,
      chamber: m.chamber,
    };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    congress: CONGRESS,
    source: 'Voteview (voteview.com) — DW-NOMINATE 프로젝트의 호명투표 원본',
    note:
      '자기 당 다수와 반대로 던진 비율. 분모는 양당 다수가 갈린 "정당 표결" 만이다 — ' +
      '만장일치에 가까운 표결까지 넣으면 이탈이 희석돼 모두가 충성스러워 보인다. ' +
      '인물 속성이며 관계를 설명하지 않는다.',
    minVotes: MIN_VOTES,
    stats: {
      rollCalls: calls.size,
      partyVotes,
      people: Object.keys(people).length,
      withoutSeat: noSeat,
    },
    medians,
    people,
  };

  const top = Object.entries(people).sort((a, b) => b[1].rate - a[1].rate);
  console.log('당론 이탈률');
  console.log('─'.repeat(58));
  console.log(`${CONGRESS}대 · 호명투표 ${calls.size}건 중 정당 표결 ${partyVotes}건 (${Math.round((partyVotes / calls.size) * 100)}%)`);
  console.log(`POLARIS ${Object.keys(people).length}명 산출 · ${noSeat}명은 해당 없음 (의원이 아니거나 표결 ${MIN_VOTES}건 미만)`);
  console.log('중앙값: ' + Object.entries(medians).map(([k, v]) => `${k} ${v}%`).join(' · '));
  console.log('상위');
  for (const [id, p] of top.slice(0, 8)) {
    console.log(`  ${id.padEnd(18)} ${p.side} ${p.chamber.padEnd(6)} ${String(p.rate).padStart(5)}%  (${p.against}/${p.votes})`);
  }

  if (DRY) {
    console.log(`\n[dry] 쓰지 않았다 — ${path.relative(ROOT, OUT)}`);
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\n${path.relative(ROOT, OUT)} 기록`);
}

main().catch((e) => {
  console.error('[party-unity] FAILED:', e);
  // I/O 가 떠 있는데 exit() 하면 종료 코드가 뭉개진다 (CLAUDE.md)
  process.exitCode = 1;
});
