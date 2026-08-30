/**
 * 소스 간 ID 크로스워크 판정 규칙 — 순수 함수.
 *
 * 왜 필요한가: 소스마다 같은 사람을 다른 id 로 부른다. Voteview 는 icpsr,
 * FEC 는 fec, GovInfo 는 bioguide 를 쓴다. 이름으로 매번 다시 맞추면 방법이
 * 조금만 달라져도 결과가 흔들린다 — 실제로 같은 데이터에서 75 와 79 가 나왔다.
 * 흔들리는 수치 위에는 아무것도 쌓을 수 없다.
 *
 * 그래서 규칙은 하나다. **자동 매칭은 애매하면 포기하고, 애매한 것은 사람이
 * 한 번 정해서 파일에 박는다.** 자동으로 확정할 수 있는 것만 자동으로 하고,
 * 나머지는 확정 목록(overrides)에 없으면 감사가 막는다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

// ── congress-legislators 원본 형태 ──

import { normalizeName } from './keys-core.mts';

export interface LegislatorName {
  first?: string;
  middle?: string;
  last?: string;
  nickname?: string;
  suffix?: string;
  official_full?: string;
}

export interface LegislatorTerm {
  type: 'sen' | 'rep';
  state: string;
  party?: string;
  /** 무소속이 어느 쪽과 함께 하는가 — Sanders·King 은 민주당과 코커스한다 */
  caucus?: string;
  start: string;
  end: string;
}

export interface Legislator {
  id: {
    bioguide?: string;
    icpsr?: number;
    fec?: string[];
    govtrack?: number;
    opensecrets?: string;
    wikidata?: string;
  };
  name: LegislatorName;
  terms: LegislatorTerm[];
}

// ── 산출물 ──

export interface Member {
  bioguide: string;
  icpsr: number | null;
  fec: string[];
  govtrack: number | null;
  opensecrets: string | null;
  name: string;
  party: string;
  /**
   * 실질 소속. 무소속은 코커스하는 쪽을 넣는다.
   *
   * 정당 문자열만 비교하면 Sanders(I) × Markey(D) 가 "초당적" 이 된다. 두 사람은
   * 같은 코커스이므로 그건 초당적 협업이 아니다. 실제로 이 오류로 초당적 쌍을
   * 19개로 세었는데 8개가 Sanders 였다.
   */
  caucus: string;
  state: string;
  chamber: 'senate' | 'house';
  /** 현직 명부(legislators-current)에 있는가 */
  current: boolean;
}

export type MatchMethod = 'official' | 'firstlast' | 'nickname' | 'override';

export interface Match {
  bioguide: string | null;
  method: MatchMethod | null;
  /** bioguide 가 null 인 이유 — 'none' 후보 없음, 'ambiguous' 동명이인 */
  reason?: 'none' | 'ambiguous';
  candidates?: string[];
}

export interface Politician {
  id: string;
  name: string;
  party: string;
  branch: string;
}

export { normalizeName } from './keys-core.mts';

/** 한 의원이 불릴 수 있는 이름들을 방식별로 낸다 */
export function nameKeys(n: LegislatorName): Record<Exclude<MatchMethod, 'override'>, string[]> {
  const keys = (v: string | undefined) => (v ? [normalizeName(v)].filter(Boolean) : []);
  const last = n.last ?? '';
  return {
    official: keys(n.official_full),
    firstlast: keys(n.first && last ? `${n.first} ${last}` : undefined),
    nickname: keys(n.nickname && last ? `${n.nickname} ${last}` : undefined),
  };
}

export type NameIndex = Record<Exclude<MatchMethod, 'override'>, Map<string, string[]>>;

/**
 * 이름 → bioguide 색인.
 *
 * 값이 배열인 것이 핵심이다. 동명이인을 하나로 뭉개면 조용히 틀린 사람에게
 * 붙는다 — 현직 상원의원 John Kennedy 와 JFK 가 그렇다. 후보를 그대로 들고
 * 있다가 2명 이상이면 자동 매칭을 포기한다.
 */
export function buildIndex(legislators: Legislator[]): NameIndex {
  const idx: NameIndex = { official: new Map(), firstlast: new Map(), nickname: new Map() };
  for (const l of legislators) {
    const bio = l.id?.bioguide;
    if (!bio) continue;
    const keys = nameKeys(l.name);
    for (const method of ['official', 'firstlast', 'nickname'] as const) {
      for (const k of keys[method]) {
        const cur = idx[method].get(k) ?? [];
        if (!cur.includes(bio)) cur.push(bio);
        idx[method].set(k, cur);
      }
    }
  }
  return idx;
}

/**
 * 이름 하나를 맞춘다.
 *
 * 정확한 쪽부터 본다. 어느 단계에서든 후보가 2명 이상이면 **다음 단계로
 * 넘어가지 않고 멈춘다.** 덜 정확한 방식으로 내려가면 우연히 하나만 남아
 * 맞은 것처럼 보이는데, 그게 가장 위험하다.
 */
export function matchName(displayName: string, idx: NameIndex): Match {
  const key = normalizeName(displayName);
  if (!key) return { bioguide: null, method: null, reason: 'none' };

  for (const method of ['official', 'firstlast', 'nickname'] as const) {
    const hit = idx[method].get(key);
    if (!hit || hit.length === 0) continue;
    if (hit.length > 1) {
      return { bioguide: null, method: null, reason: 'ambiguous', candidates: [...hit].sort() };
    }
    return { bioguide: hit[0], method };
  }
  return { bioguide: null, method: null, reason: 'none' };
}

export interface Override {
  /** 확정된 bioguide. 의회 경력이 없으면 null */
  bioguide: string | null;
  /** 왜 이렇게 정했는지 — 나중에 다시 판단하지 않기 위해 남긴다 */
  reason: string;
}

export interface Resolution {
  id: string;
  name: string;
  match: Match;
  /** 사람이 정한 값인가 */
  manual: boolean;
}

/**
 * 101명(또는 그 이상)을 한 번에 해결한다.
 *
 * 확정 목록이 자동 매칭을 **덮어쓴다.** 자동이 맞힌 것처럼 보여도 사람이
 * 아니라고 정했으면 사람 쪽이 이긴다.
 */
export function resolveAll(
  people: Politician[],
  idx: NameIndex,
  overrides: Record<string, Override>
): Resolution[] {
  return people.map((p) => {
    const ov = overrides[p.id];
    if (ov) {
      return {
        id: p.id,
        name: p.name,
        manual: true,
        match: ov.bioguide
          ? { bioguide: ov.bioguide, method: 'override' as const }
          : { bioguide: null, method: null, reason: 'none' as const },
      };
    }
    return { id: p.id, name: p.name, manual: false, match: matchName(p.name, idx) };
  });
}

/**
 * 확정되지 않은 것들 — 감사가 막아야 할 목록.
 *
 * "후보가 없다"(reason 'none') 는 자동으로도 확정이다. 진짜 문제는 동명이인이라
 * 자동이 판단을 포기한 경우다. 이건 반드시 사람이 정해야 한다.
 */
export function unresolved(resolutions: Resolution[]): Resolution[] {
  return resolutions.filter((r) => !r.manual && r.match.reason === 'ambiguous');
}

/**
 * 성(姓) 색인 — 아깝게 놓친 것을 찾기 위한 것이다.
 *
 * 매칭에 쓰지 않는다. 성만으로 맞추면 동성이인이 전부 붙는다.
 */
export function buildSurnameIndex(legislators: Legislator[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const l of legislators) {
    const bio = l.id?.bioguide;
    const last = normalizeName(l.name?.last ?? '');
    if (!bio || !last) continue;
    const cur = idx.get(last) ?? [];
    if (!cur.includes(bio)) cur.push(bio);
    idx.set(last, cur);
  }
  return idx;
}

/**
 * 아깝게 놓친 것들.
 *
 * "후보가 아예 없다"(reason 'none')를 자동 확정으로 취급하면 조용히 새는 곳이
 * 생긴다. 실제로 Mike Lawler·Dick Durbin·Chris Murphy 가 그렇게 빠졌다 —
 * 데이터에는 Michael·Richard·Christopher 로 들어있고 별칭 필드가 비어 있다.
 *
 * 통칭 사전(Mike→Michael)을 만들면 그 사전이 곧 새로운 흔들림의 원인이 된다.
 * 대신 **성이 같은 의원이 있는데 못 맞춘 경우**를 사람에게 올린다. 같은 사람이면
 * bioguide 를, 아니면 null 을 이유와 함께 적는다. 어느 쪽이든 판단이 파일에 남는다.
 */
export function nearMisses(
  resolutions: Resolution[],
  surnames: Map<string, string[]>
): Resolution[] {
  return resolutions.filter((r) => {
    if (r.manual || r.match.bioguide) return false;
    if (r.match.reason !== 'none') return false;
    const parts = normalizeName(r.name).split(' ').filter(Boolean);
    const last = parts[parts.length - 1];
    return Boolean(last && surnames.has(last));
  });
}

/** 사람이 정해야 하는 것 전부 — 동명이인 + 아깝게 놓친 것 */
export function needsDecision(
  resolutions: Resolution[],
  surnames: Map<string, string[]>
): Resolution[] {
  return [...unresolved(resolutions), ...nearMisses(resolutions, surnames)];
}

/**
 * 정당 코드 정규화.
 *
 * congress-legislators 는 'Republican', 우리 데이터는 'R' 로 적는다. 형식이 다른
 * 것을 불일치로 세면 전원이 불일치로 나와서 진짜 불일치가 묻힌다.
 */
export function partyCode(party: string | undefined): string {
  const p = (party ?? '').trim();
  if (!p) return '';
  if (/^republican$/i.test(p)) return 'R';
  if (/^democrat(ic)?$/i.test(p)) return 'D';
  if (/^independent$/i.test(p)) return 'I';
  return p.length === 1 ? p.toUpperCase() : p;
}

/** 마지막 임기로 소속·주·원(院)을 정한다 */
export function toMember(l: Legislator, current: boolean): Member | null {
  const bio = l.id?.bioguide;
  const last = l.terms?.[l.terms.length - 1];
  if (!bio || !last) return null;
  const n = l.name;
  return {
    bioguide: bio,
    icpsr: l.id.icpsr ?? null,
    fec: l.id.fec ?? [],
    govtrack: l.id.govtrack ?? null,
    opensecrets: l.id.opensecrets ?? null,
    name: n.official_full ?? `${n.first ?? ''} ${n.last ?? ''}`.trim(),
    party: partyCode(last.party),
    caucus: partyCode(last.caucus) || partyCode(last.party),
    state: last.state,
    chamber: last.type === 'sen' ? 'senate' : 'house',
    current,
  };
}

/** 주요 2당만. 무소속은 별도 인자로 받는다 — 기본값으로 숨기지 않는다. 인자도 코드로 준다 */
export function filterParties(members: Member[], parties: readonly string[]): Member[] {
  return members.filter((m) => parties.includes(m.party));
}

/**
 * 최소 CSV 파서 — 따옴표 안의 쉼표를 지킨다.
 *
 * Voteview 의 `bioname` 은 "WARREN, Elizabeth" 형태라 따옴표 안에 쉼표가 있다.
 * 줄을 쉼표로 그냥 자르면 그 뒤 열이 통째로 한 칸씩 밀린다 — 에러가 아니라
 * 조용히 틀린 값이 들어온다.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }

  const head = rows.shift();
  if (!head) return [];
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/**
 * Voteview 명부에서 bioguide → icpsr 를 뽑는다.
 *
 * congress-legislators 의 icpsr 는 비어 있는 경우가 많다(현직 537명 중 319명만
 * 가지고 있었다). 표결 감사가 그 필드에만 기대면 41% 가 조용히 빠진다.
 * 같은 사람이 여러 의회에 나오므로 **가장 최근 의회의 값**을 쓴다.
 */
export function icpsrByBioguide(rows: Record<string, string>[]): Map<string, number> {
  const best = new Map<string, { congress: number; icpsr: number }>();
  for (const r of rows) {
    const bio = (r.bioguide_id ?? '').trim();
    // Number('') 는 NaN 이 아니라 0 이다. 빈 칸을 그대로 넘기면 icpsr 0 번
    // 의원이 생긴다 — 에러 없이 틀린 id 가 박힌다.
    const num = (v: string | undefined) => {
      const t = (v ?? '').trim();
      return t === '' ? NaN : Number(t);
    };
    const icpsr = num(r.icpsr);
    const congress = num(r.congress);
    if (!bio || !Number.isFinite(icpsr) || !Number.isFinite(congress)) continue;
    const cur = best.get(bio);
    if (!cur || congress > cur.congress) best.set(bio, { congress, icpsr });
  }
  return new Map([...best].map(([k, v]) => [k, v.icpsr]));
}

/** 비어 있는 icpsr 만 채운다. 이미 있는 값은 건드리지 않는다 */
export function fillIcpsr(
  members: Member[],
  byBioguide: Map<string, number>
): { members: Member[]; filled: number } {
  let filled = 0;
  const out = members.map((m) => {
    if (m.icpsr !== null) return m;
    const v = byBioguide.get(m.bioguide);
    if (v === undefined) return m;
    filled++;
    return { ...m, icpsr: v };
  });
  return { members: out, filled };
}

export interface CrosswalkStats {
  members: number;
  byParty: Record<string, number>;
  byChamber: Record<string, number>;
  withIcpsr: number;
  withFec: number;
  polarisMatched: number;
  polarisTotal: number;
}

export function buildStats(members: Member[], resolutions: Resolution[]): CrosswalkStats {
  const byParty: Record<string, number> = {};
  const byChamber: Record<string, number> = {};
  for (const m of members) {
    byParty[m.party] = (byParty[m.party] ?? 0) + 1;
    byChamber[m.chamber] = (byChamber[m.chamber] ?? 0) + 1;
  }
  return {
    members: members.length,
    byParty,
    byChamber,
    withIcpsr: members.filter((m) => m.icpsr !== null).length,
    withFec: members.filter((m) => m.fec.length > 0).length,
    polarisMatched: resolutions.filter((r) => r.match.bioguide).length,
    polarisTotal: resolutions.length,
  };
}

/**
 * 정치인 소스 파싱.
 *
 * `id:` 위치로 먼저 잘라내고 각 조각 안에서만 필드를 찾는다. 하나의 정규식으로
 * id 와 enName 을 함께 잡으면, enName 이 없는 항목에서 **다음 항목의 값**을
 * 끌어온다. 조용히 틀리는 종류라 구조를 먼저 자른다.
 */
export function parsePoliticians(source: string): Politician[] {
  const marks = [...source.matchAll(/^\s+id:\s*'([a-z0-9-]+)',/gm)];
  const out: Politician[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index ?? 0;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? source.length) : source.length;
    const chunk = source.slice(start, end);
    const name = chunk.match(/enName:\s*'([^']+)'/);
    if (!name) continue;
    out.push({
      id: marks[i][1],
      name: name[1],
      party: chunk.match(/party:\s*'([^']*)'/)?.[1] ?? '',
      branch: chunk.match(/branch:\s*'([^']*)'/)?.[1] ?? '',
    });
  }
  return out;
}

/** 우리가 적은 소속과 의회 기록의 소속이 어긋나는 곳 */
export function partyMismatches(
  people: Politician[],
  resolutions: Resolution[],
  members: Map<string, Member>
): { id: string; ours: string; theirs: string }[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: { id: string; ours: string; theirs: string }[] = [];
  for (const r of resolutions) {
    if (!r.match.bioguide) continue;
    const m = members.get(r.match.bioguide);
    const p = byId.get(r.id);
    if (!m || !p || !p.party || !m.party) continue;
    if (p.party !== m.party) out.push({ id: r.id, ours: p.party, theirs: m.party });
  }
  return out;
}
