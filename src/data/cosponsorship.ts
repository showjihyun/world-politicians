import raw from './cosponsorship.json';
import type { Relationship } from '../types';

/**
 * 공동발의 엣지 — 큐레이션한 관계와 성격이 다르다.
 *
 * 큐레이션 엣지는 "동맹이다" 라는 편집 판단이고, 이것은 "119대에서 78건을 함께
 * 발의했다" 는 측정값이다. 같은 선으로 그리면 보는 사람이 둘을 구분할 수 없어
 * 그래프가 근거를 잃는다. 그래서 별도 타입(`cosponsor`)으로 두고 범례에서
 * 따로 끌 수 있게 했다.
 *
 * 생성: `npm run cosponsor` (GovInfo BILLSTATUS 벌크)
 */

interface RawEdge {
  a: string;
  b: string;
  bills: number;
  /** 생성 시점에 정해진 1~3 — 앱에서 다시 계산하지 않는다 */
  strength: 1 | 2 | 3;
  crossParty: boolean;
  sponsoredByA: number;
  sponsoredByB: number;
  /** 상대 법안에 더 많이 서명한 쪽. 상호적이면 null */
  initiator: 'a' | 'b' | null;
  /** 이미 큐레이션된 관계가 있는 쌍 */
  duplicate: boolean;
  first: string;
  last: string;
}

interface RawFile {
  generatedAt: string;
  congress: number;
  threshold: number;
  stats: { billsScanned: number; edges: number; fresh: number; crossParty: number };
  edges: RawEdge[];
}

const file = raw as RawFile;

export const COSPONSOR_META = {
  congress: file.congress,
  threshold: file.threshold,
  generatedAt: file.generatedAt,
  stats: file.stats,
};

/**
 * 이미 큐레이션된 쌍은 뺀다 — 두 노드 사이에 선을 두 번 그으면 읽을 수 없다.
 * 그 쌍의 건수는 `cosponsorCount` 로 조회해 기존 관계 옆에 보조 표시로 붙인다
 * (DetailDrawer). 근거 패널에는 넣지 않는다 — 법안 날짜가 기사보다 새로워서
 * 관계를 뒷받침하던 기사를 밀어냈다.
 */
export const COSPONSOR_RELATIONSHIPS: Relationship[] = file.edges
  .filter((e) => !e.duplicate)
  .map((e) => ({
    a: e.a,
    b: e.b,
    type: 'cosponsor' as const,
    strength: e.strength,
    ...(e.initiator ? { initiator: e.initiator } : {}),
    note: {
      en: `${e.bills} bills co-sponsored in the ${file.congress}th Congress (${e.first} – ${e.last})${e.crossParty ? ', across party lines' : ''}.`,
      ko: `${file.congress}대 의회에서 ${e.bills}건 공동발의 (${e.first} ~ ${e.last})${e.crossParty ? '. 당을 넘어선 협업' : ''}.`,
    },
  }));

const byPair = new Map(file.edges.map((e) => [`${e.a}|${e.b}`, e]));

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 기존 엣지를 뒷받침하는 공동발의 건수 — 없으면 0 */
export function cosponsorCount(a: string, b: string): number {
  return byPair.get(key(a, b))?.bills ?? 0;
}
