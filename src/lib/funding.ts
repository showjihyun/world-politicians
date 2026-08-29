import { useEffect, useState } from 'react';

/**
 * FEC 자금 기록 — 눌렀을 때 불러온다.
 *
 * 111KB 다. 그래프를 그리는 데는 필요 없고 인물을 열어야 보이므로, 근거 패널과
 * 같은 이유로 초기 번들에 넣지 않는다.
 */

export interface Funder {
  name: string;
  amount: number;
  kind: string;
  org: string;
}

export interface PersonFunding {
  receipts: number;
  individual: number;
  /** 이익집단 PAC 이 직접 준 돈 */
  pacDirect: number;
  partyDirect: number;
  /** 이 사람을 지지하는 독립지출 — 후보와 조율이 금지된 별개의 돈이다 */
  ieSupport: number;
  /** 이 사람을 반대하는 독립지출 — 후원이 아니라 공격이다 */
  ieOppose: number;
  topFunders: Funder[];
}

interface FundingFile {
  cycle: number;
  coverageThrough: string;
  stats: { namedSharePct: number };
  people: Record<string, PersonFunding>;
}

let cache: FundingFile | null = null;
let loading: Promise<FundingFile | null> | null = null;
const subs = new Set<() => void>();

function load(): Promise<FundingFile | null> {
  if (cache) return Promise.resolve(cache);
  loading ??= import('../data/funding.json')
    .then((m) => {
      cache = (m.default ?? m) as unknown as FundingFile;
      subs.forEach((fn) => fn());
      return cache;
    })
    .catch(() => null);
  return loading;
}

export interface FundingState {
  funding: PersonFunding | null;
  cycle: number;
  through: string;
  loading: boolean;
}

export function useFunding(personId: string | null): FundingState {
  const [, force] = useState(0);

  useEffect(() => {
    if (!personId) return;
    const fn = () => force((v) => v + 1);
    subs.add(fn);
    void load().then(fn);
    return () => {
      subs.delete(fn);
    };
  }, [personId]);

  if (!personId) return { funding: null, cycle: 0, through: '', loading: false };
  return {
    funding: cache?.people[personId] ?? null,
    cycle: cache?.cycle ?? 0,
    through: cache?.coverageThrough ?? '',
    loading: cache === null,
  };
}

/** 화면용 축약 — $1.2M / $340K */
export function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
