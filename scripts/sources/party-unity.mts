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
// CSV 파싱은 crosswalk-core 의 parseCsv 를 쓴다. 같은 Voteview 파일을 위해
// 이미 쓰여 있고 테스트도 있다 — bioname 의 `"WARREN, Elizabeth"` 가 그 이유다.
// 복제하면 이스케이프된 따옴표와 길이가 어긋난 행에서 조용히 갈라진다.
import { countRaggedRows, num, parseCsv } from './crosswalk-core.mts';
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
/** 회기가 진행 중이라 표결이 계속 늘어난다. 캐시가 이보다 오래되면 다시 받는다. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BASE = 'https://voteview.com/static/data/out';

/** 이 바이트가 언제 받아진 것인가 — generatedAt 은 "쓴 시각" 이 아니라 이것이다 */
interface Grabbed {
  text: string;
  fetchedAt: Date;
}

async function grab(url: string, name: string): Promise<Grabbed> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, name);
  // 캐시를 무기한 믿으면 회기가 진행돼도 같은 표결에 머문 채 generatedAt 만
  // 새로 찍힌다 — "다시 쓴 시각" 을 "수집한 시각" 으로 내보내는 그 실수다.
  if (fs.existsSync(cached) && Date.now() - fs.statSync(cached).mtimeMs < CACHE_MAX_AGE_MS) {
    return { text: fs.readFileSync(cached, 'utf8'), fetchedAt: new Date(fs.statSync(cached).mtimeMs) };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} ${res.status} — ${url}`);
  const text = await res.text();
  // 받다 끊긴 파일을 캐시로 남기면 그다음부터 영원히 그것을 읽는다.
  const tmp = `${cached}.part`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, cached);
  return { text, fetchedAt: new Date() };
}

/**
 * 받은 CSV 를 표로 만든다.
 *
 * parseCsv 는 길이가 어긋난 행을 **말없이 버린다.** 그 침묵이 분모를 조용히
 * 깎으면 모든 비율이 함께 어긋나는데 어떤 검사도 걸리지 않는다 — 이 스크립트가
 * 막으려는 실패 그 자체다. 하나라도 버려졌으면 멈춘다.
 */
function rows(g: Grabbed, what: string): Record<string, string>[] {
  const dropped = countRaggedRows(g.text);
  if (dropped) throw new Error(`${what}: 열 개수가 어긋난 행 ${dropped}개 — 파일이 바뀌었다`);
  return parseCsv(g.text);
}

/**
 * 있어야 하는 열이 다 있는가.
 *
 * 열 이름이 바뀌면 값이 undefined 가 되고, 그 행은 조용히 걸러진다. 결과는
 * **빈 데이터셋**인데 스크립트는 0 으로 끝나고 파일은 새 시각으로 쓰인다.
 * 이 저장소가 반복해서 당한 종류라 여기서 멈춘다.
 */
function requireCols(rows: Record<string, string>[], cols: string[], what: string): void {
  if (!rows.length) throw new Error(`${what}: 행이 없다`);
  const missing = cols.filter((c) => !(c in rows[0]));
  if (missing.length) throw new Error(`${what}: 열이 없다 — ${missing.join(', ')}`);
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
}

async function main(): Promise<void> {
  const cross = JSON.parse(fs.readFileSync(cwPath, 'utf8')) as {
    polaris: Record<string, { bioguide: string | null }>;
    members: { bioguide: string; caucus?: string }[];
  };
  const caucusByBio = new Map(cross.members.map((m) => [m.bioguide, m.caucus ?? null]));

  // ── 의원 명부 ──
  const memGrab = await grab(`${BASE}/members/HSall_members.csv`, 'HSall_members.csv');
  const memRows = rows(memGrab, 'members');
  requireCols(memRows, ['congress', 'chamber', 'icpsr', 'party_code', 'bioguide_id'], 'members');
  // 어느 파일이든 가장 오래된 수집 시각이 이 데이터의 수집 시각이다.
  let fetchedAt = memGrab.fetchedAt;

  const CHAMBERS = new Set(['House', 'Senate']);
  const members = new Map<number, Member>();
  for (const r of memRows) {
    if (r.congress !== String(CONGRESS)) continue;
    // Voteview 는 대통령의 입장 표명도 한 행으로 담는다 — 의회 표결이 아니다.
    // 세면 그의 입장이 소속 당의 다수 계산에 한 표로 섞인다.
    if (!CHAMBERS.has(r.chamber)) continue;
    const icpsr = num(r.icpsr);
    if (!Number.isFinite(icpsr)) continue;
    members.set(icpsr, {
      side: sideOf(r.party_code, caucusByBio.get(r.bioguide_id)),
      chamber: r.chamber,
      bioguide: r.bioguide_id,
    });
  }
  if (!members.size) throw new Error(`${CONGRESS}대 의원이 0명 — 열이나 회기 번호를 확인한다`);

  // ── 표결 ──
  // 전 의회 파일은 669MB 다. 의회별 파일이 따로 있어 그것만 받는다.
  const calls = new Map<string, Map<number, Cast>>();
  for (const ch of ['H', 'S']) {
    const name = `${ch}${CONGRESS}_votes.csv`;
    const g = await grab(`${BASE}/votes/${name}`, name);
    if (g.fetchedAt < fetchedAt) fetchedAt = g.fetchedAt;
    const voteRows = rows(g, name);
    requireCols(voteRows, ['rollnumber', 'icpsr', 'cast_code'], name);
    for (const r of voteRows) {
      const cast = castOf(num(r.cast_code));
      if (!cast) continue;
      const icpsr = num(r.icpsr);
      if (!Number.isFinite(icpsr)) continue;
      const key = `${ch}|${r.rollnumber}`;
      let m = calls.get(key);
      if (!m) calls.set(key, (m = new Map()));
      m.set(icpsr, cast);
    }
  }
  if (!calls.size) throw new Error('호명투표가 0건 — 열이나 회기 번호를 확인한다');

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
    let arr = byGroup.get(k);
    if (!arr) byGroup.set(k, (arr = []));
    arr.push(r);
  }
  const medians: Record<string, number> = {};
  for (const [k, arr] of byGroup) {
    const med = medianOf(arr);
    if (med !== null) medians[k] = Math.round(med * 100) / 100;
  }

  // ── POLARIS 인물에 붙인다 ──
  // Voteview 는 회기 중 당적을 바꾼 의원에게 두 번째 행을 준다 — icpsr + 70000.
  // 119대에 실제로 한 명 있다(Kiley 22336 / 92336). bioguide 하나에 icpsr 하나만
  // 들고 있으면 나중 것만 남아 표결 절반이 사라지는데, 그래도 최소 표결 수는
  // 넘어서 어떤 검사에도 안 걸린다.
  const icpsrsByBio = new Map<string, number[]>();
  for (const [ic, m] of members) {
    const list = icpsrsByBio.get(m.bioguide);
    if (list) list.push(ic);
    else icpsrsByBio.set(m.bioguide, [ic]);
  }
  const people: Record<string, { rate: number; votes: number; against: number; side: Side; chamber: string }> = {};
  // 빠지는 이유가 셋이다. 하나로 합치면 "의원이 아니다" 가 "표결이 적다" 까지
  // 뜻하게 되어 이름이 사실을 뒤집는다.
  const skipped = { notInCongress: 0, noSide: 0, noVotes: 0, thinRecord: 0 };
  // 왜 빠졌는지를 화면까지 들고 간다. 이유를 뭉개면 현직 의원에게
  // '현직 의원이 아니다' 라고 적게 된다 — 실제로 vance·rubio 가 그랬다.
  const excluded: Record<string, string> = {};
  for (const [id, v] of Object.entries(cross.polaris)) {
    const ids = v.bioguide ? (icpsrsByBio.get(v.bioguide) ?? []) : [];
    const seats = ids.map((ic) => members.get(ic)!).filter(Boolean);
    if (!seats.length) {
      skipped.notInCongress++;
      excluded[id] = "notInCongress";
      continue;
    }
    const seat = seats.find((m) => m.side);
    if (!seat?.side) {
      // 자리는 있는데 소속을 못 정했다 — 무소속인데 코커스가 비어 있다.
      // '의원이 아니다' 로 세면 명부 사실인 척하며 크로스워크 구멍을 숨긴다.
      skipped.noSide++;
      excluded[id] = "noSide";
      continue;
    }
    // 당적을 바꾼 사람은 두 icpsr 에 표결이 나뉘어 있다 — 합쳐야 온전한 기록이다.
    const t = ids.reduce(
      (acc, ic) => {
        const r = tally.get(ic);
        return r ? { votes: acc.votes + r.votes, against: acc.against + r.against } : acc;
      },
      { votes: 0, against: 0 }
    );
    if (!t.votes) {
      skipped.noVotes++;
      excluded[id] = "noVotes";
      continue;
    }
    const rate = defectionRate(t, MIN_VOTES);
    if (rate === null) {
      skipped.thinRecord++;
      excluded[id] = "thinRecord";
      continue;
    }
    const m = seat;
    people[id] = {
      rate: Math.round(rate * 10) / 10,
      votes: t.votes,
      against: t.against,
      side: m.side,
      chamber: m.chamber,
    };
  }

  const rates = Object.values(people).map((p) => p.rate);
  const out = {
    // 파일을 쓴 시각이 아니라 이 바이트를 받은 시각이다. 캐시에서 왔으면
    // 그 캐시가 만들어진 때다 — 안 그러면 같은 데이터가 새것으로 보인다.
    generatedAt: fetchedAt.toISOString(),
    congress: CONGRESS,
    source: 'Voteview (voteview.com) — DW-NOMINATE 프로젝트의 호명투표 원본',
    note:
      '자기 당 다수와 반대로 던진 비율. 분모는 양당 다수가 갈린 "정당 표결" 만이다 — ' +
      '만장일치에 가까운 표결까지 넣으면 이탈이 희석돼 모두가 충성스러워 보인다. ' +
      '인물 속성이며 관계를 설명하지 않는다.',
    minVotes: MIN_VOTES,
    /**
     * 막대 축의 최대치. 분포가 심하게 쏠려 있어 0~100% 로 그리면 거의 모두가
     * 빈 막대가 된다. 화면에 상수로 박으면 데이터가 그 위로 올라간 날 두 사람이
     * 똑같이 가득 찬 막대가 되므로, 관측 최대치에서 여기서 정해 내려보낸다.
     */
    axisMax: Math.max(10, Math.ceil((rates.length ? Math.max(...rates) : 0) / 5) * 5),
    stats: {
      rollCalls: calls.size,
      partyVotes,
      people: Object.keys(people).length,
      skipped,
    },
    medians,
    people,
    excluded,
  };

  const top = Object.entries(people).sort((a, b) => b[1].rate - a[1].rate);
  console.log('당론 이탈률');
  console.log('─'.repeat(58));
  console.log(`${CONGRESS}대 · 호명투표 ${calls.size}건 중 정당 표결 ${partyVotes}건 (${Math.round((partyVotes / calls.size) * 100)}%)`);
  console.log(
    `POLARIS ${Object.keys(people).length}명 산출 · 제외 ${skipped.notInCongress + skipped.noVotes + skipped.thinRecord}명` +
      ` (의원 아님 ${skipped.notInCongress} · 소속 불명 ${skipped.noSide} · 표결 없음 ${skipped.noVotes} · ${MIN_VOTES}건 미만 ${skipped.thinRecord})`
  );
  console.log(`막대 축 0~${out.axisMax}%`);
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
