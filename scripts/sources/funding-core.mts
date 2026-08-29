/**
 * FEC 자금 판정 규칙 — 순수 함수.
 *
 * 이 레이어가 무엇을 말할 수 있고 무엇을 말할 수 없는지가 먼저다.
 *
 *   총 수입 $527M 중
 *     개인 기부   73%  ← 누가 냈는지는 별도의 거대한 파일에 있고, 200달러
 *                        초과분만 항목화된다. 여기서는 총액만 쓴다
 *     PAC 직접기부 6%  ← 이 레이어가 "누가 줬는지" 말할 수 있는 유일한 부분
 *     나머지      21%
 *
 * 6% 를 두고 "이 사람을 후원하는 곳" 이라고 쓰면 오도한다. 화면에 비중을 함께
 * 보여주는 이유다.
 *
 * 섞으면 안 되는 것이 둘 있다.
 *
 *   독립지출(24E/24A)은 기부가 아니다. 후보와 조율이 금지돼 있고, 무엇보다
 *   **24A 는 후보를 반대하는 지출**이다. 실측에서 반대 $18.1M 이 지지 $14.4M
 *   보다 컸다. 이걸 합치면 공격에 쓴 돈이 후원으로 그려진다.
 *
 *   공동모금위원회(DSGN='J')에서 온 돈은 본인이 모은 돈이 도로 들어온 것이다.
 *   실측에서 Mike Johnson 의 1위 "후원자" 가 본인 공동모금위원회($100만)였다.
 *   PAC 의 후보 기부 한도는 주기당 $10,000 이므로 애초에 기부일 수 없다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

/** FEC 벌크는 파이프 구분이고 머리글이 없다 */
export const splitRow = (line: string): string[] => line.split('|');

export const toAmount = (v: string | undefined): number => {
  const t = (v ?? '').trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

export interface Committee {
  id: string;
  name: string;
  /** CMTE_DSGN — J 는 공동모금, D 는 리더십 PAC */
  designation: string;
  /** CMTE_TP — Q 연계 PAC, N 비연계 PAC, X/Y 정당 */
  type: string;
  connectedOrg: string;
}

export function parseCommittee(line: string): Committee | null {
  const c = splitRow(line);
  if (c.length < 15 || !c[0]) return null;
  return {
    id: c[0],
    name: c[1]?.trim() ?? '',
    designation: c[8]?.trim() ?? '',
    type: c[9]?.trim() ?? '',
    connectedOrg: c[13]?.trim() ?? '',
  };
}

export interface CandidateSummary {
  candidateId: string;
  name: string;
  receipts: number;
  individual: number;
  /** OTHER_POL_CMTE_CONTRIB — 위원회에서 온 돈 총액 */
  committee: number;
  party: number;
  through: string;
}

export function parseCandidateSummary(line: string): CandidateSummary | null {
  const c = splitRow(line);
  if (c.length < 28 || !c[0]) return null;
  return {
    candidateId: c[0],
    name: c[1]?.trim() ?? '',
    receipts: toAmount(c[5]),
    individual: toAmount(c[17]),
    committee: toAmount(c[25]),
    party: toAmount(c[26]),
    through: c[27]?.trim() ?? '',
  };
}

export interface Pas2Row {
  committeeId: string;
  /** 24K 기부 · 24E 지지 독립지출 · 24A 반대 독립지출 */
  transactionType: string;
  amount: number;
  candidateId: string;
}

export function parsePas2(line: string): Pas2Row | null {
  const c = splitRow(line);
  if (c.length < 17 || !c[0] || !c[16]?.trim()) return null;
  return {
    committeeId: c[0],
    transactionType: c[5]?.trim() ?? '',
    amount: toAmount(c[14]),
    candidateId: c[16].trim(),
  };
}

export type DonorKind = 'interest' | 'party' | 'candidate' | 'joint' | 'other';

/**
 * 기부 위원회를 성격별로 나눈다.
 *
 * 'joint' 는 본인이 모은 돈이 도로 들어온 것이라 후원이 아니다 — 집계에서 뺀다.
 * 'party' 는 정당 지원이라 이익집단 돈과 성격이 다르므로 따로 센다.
 */
export function classifyDonor(c: Committee | undefined): DonorKind {
  if (!c) return 'other';
  if (c.designation === 'J') return 'joint';
  if (c.type === 'X' || c.type === 'Y') return 'party';
  if (c.type === 'Q' || c.type === 'N') return 'interest';
  if (c.type === 'H' || c.type === 'S' || c.type === 'P') return 'candidate';
  return 'other';
}

export interface Funder {
  name: string;
  amount: number;
  kind: DonorKind;
  /** 연계 조직 — 'CENCORA, INC.' 처럼 PAC 뒤의 실체 */
  org: string;
}

export interface PersonFunding {
  /** 2025-26 주기 총 수입 */
  receipts: number;
  individual: number;
  /**
   * 이익집단 PAC 이 직접 준 돈 (24K, 공동모금 제외).
   *
   * 환불을 뺀 순액이다. FEC 는 반환된 기부를 음수로 기록하고, 실제로 24K 의
   * 6,187건이 음수다(-$14.9M). 은퇴·사임한 인물은 이 값이 음수가 되는데
   * 파싱 오류가 아니라 "돈을 돌려줬다" 는 사실이다.
   */
  pacDirect: number;
  /** 정당 위원회가 준 돈 */
  partyDirect: number;
  /** 이 사람을 **지지**하는 독립지출 — 기부가 아니다 */
  ieSupport: number;
  /** 이 사람을 **반대**하는 독립지출 — 합치면 공격이 후원으로 보인다 */
  ieOppose: number;
  topFunders: Funder[];
}

export interface AggregateInput {
  /** 후보 id → POLARIS 인물 id */
  toPolaris: Map<string, string>;
  committees: Map<string, Committee>;
  summaries: CandidateSummary[];
  rows: Pas2Row[];
  topN: number;
}

/**
 * 인물별로 모은다.
 *
 * 한 사람이 여러 후보 id 를 가질 수 있다(하원 → 상원 이동 등). 합산한다.
 */
export function aggregate(input: AggregateInput): Record<string, PersonFunding> {
  const { toPolaris, committees, summaries, rows, topN } = input;
  const out: Record<string, PersonFunding> = {};
  const blank = (): PersonFunding => ({
    receipts: 0, individual: 0, pacDirect: 0, partyDirect: 0,
    ieSupport: 0, ieOppose: 0, topFunders: [],
  });
  const ensure = (pid: string) => (out[pid] ??= blank());

  for (const s of summaries) {
    const pid = toPolaris.get(s.candidateId);
    if (!pid) continue;
    const p = ensure(pid);
    p.receipts += s.receipts;
    p.individual += s.individual;
  }

  const byFunder = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const pid = toPolaris.get(r.candidateId);
    if (!pid) continue;
    const p = ensure(pid);

    if (r.transactionType === '24E') { p.ieSupport += r.amount; continue; }
    if (r.transactionType === '24A') { p.ieOppose += r.amount; continue; }
    if (r.transactionType !== '24K') continue;

    const kind = classifyDonor(committees.get(r.committeeId));
    if (kind === 'joint') continue; // 본인이 모은 돈이 도로 들어온 것
    if (kind === 'party') { p.partyDirect += r.amount; continue; }
    if (kind !== 'interest') continue;

    p.pacDirect += r.amount;
    if (!byFunder.has(pid)) byFunder.set(pid, new Map());
    const m = byFunder.get(pid)!;
    m.set(r.committeeId, (m.get(r.committeeId) ?? 0) + r.amount);
  }

  for (const [pid, m] of byFunder) {
    out[pid].topFunders = [...m]
      // 순액이 0 이하인 위원회는 후원자가 아니다 — 돌려받았거나 상쇄됐다
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => {
        const c = committees.get(id);
        return {
          name: c?.name ?? id,
          amount,
          kind: classifyDonor(c),
          org: c?.connectedOrg && c.connectedOrg !== 'NONE' ? c.connectedOrg : '',
        };
      })
      // 금액 내림차순, 같으면 이름순 — 같은 입력이면 같은 파일이 나와야 한다
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
      .slice(0, topN);
  }

  return out;
}

export interface FundingStats {
  people: number;
  receipts: number;
  individual: number;
  pacDirect: number;
  ieSupport: number;
  ieOppose: number;
  /** 이름 있는 기부자로 설명되는 비중 — 화면에 그대로 적는다 */
  namedSharePct: number;
}

export function buildStats(people: Record<string, PersonFunding>): FundingStats {
  const vs = Object.values(people);
  const sum = (f: (p: PersonFunding) => number) => vs.reduce((n, p) => n + f(p), 0);
  const receipts = sum((p) => p.receipts);
  const pacDirect = sum((p) => p.pacDirect);
  return {
    people: vs.length,
    receipts,
    individual: sum((p) => p.individual),
    pacDirect,
    ieSupport: sum((p) => p.ieSupport),
    ieOppose: sum((p) => p.ieOppose),
    namedSharePct: receipts > 0 ? Math.round((pacDirect / receipts) * 1000) / 10 : 0,
  };
}
