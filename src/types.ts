export type Party = 'R' | 'D' | 'I' | 'X';

export type Branch =
  | 'executive'
  | 'senate'
  | 'house'
  | 'governor'
  | 'former'
  | 'special';

export type RelType = 'ally' | 'feud' | 'bipartisan' | 'family' | 'mentor';

export type PersonStatus = 'active' | 'departed' | 'legacy';

/** 이중 언어 텍스트 — 새 언어 추가 시 이 타입과 i18n/ui 사전만 확장 */
export interface LocalizedText {
  en: string;
  ko: string;
}

/** 파벌 */
export interface FactionDef {
  id: string;
  label: LocalizedText;
  short: string;
  party: Party;
  color: string;
  desc: LocalizedText;
}

export interface Politician {
  id: string;
  name: LocalizedText;
  enName: string;
  party: Party;
  branch: Branch;
  role: LocalizedText;
  state?: string;
  faction: string;
  /** 1~10, 노드 크기 */
  prominence: number;
  /** 0~100, 화제성 */
  buzz: number;
  bio: LocalizedText;
  tags?: LocalizedText[];
  status?: PersonStatus;
}

/**
 * 관계 근거로 제시하는 기사 한 건.
 * note 는 "무슨 일이 있었는지" 를 적지만, 독자가 확인할 수 있어야 주장이 검증 가능해진다.
 */
export interface RelSource {
  title: string;
  url: string;
  source: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface Relationship {
  a: string;
  b: string;
  type: RelType;
  /** 1 약 ~ 3 강 */
  strength: 1 | 2 | 3;
  /** 관계 근거 요약 (공개 보도 기반) */
  note: LocalizedText;
  /** feud 방향: 누가 먼저 공격했는가 (입자 흐름 방향) */
  initiator?: 'a' | 'b';
  /** 수동으로 붙인 출처. 자동 수집분(relationship-sources.ts)보다 우선한다 */
  sources?: RelSource[];
}

export interface Story {
  id: string;
  emoji: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  /** 하이라이트할 노드 id 목록 */
  focusIds: string[];
  /** 이 스토리에서 보여줄 관계 유형 (없으면 전체) */
  relTypes?: RelType[];
  paragraphs: LocalizedText[];
  insight: LocalizedText;
}

/** 일일 뉴스 파이프라인이 생성하는 관계 신호 */
export interface NewsSignal {
  id: string;
  date: string;
  source: string;
  url: string;
  title: string;
  people: string[];
  pair?: [string, string];
  polarity?: 'ally' | 'feud' | 'neutral';
  confidence?: number;
  summary_en?: string;
  summary_ko?: string;
  classified: boolean;
}

/** 관계 유형 정본 목록 — 필터 기본값(전체 선택)의 기준 */
export const ALL_REL_TYPES: RelType[] = ['ally', 'feud', 'bipartisan', 'family', 'mentor'];

export const REL_META: Record<
  RelType,
  { label: LocalizedText; color: string; dash?: number[] }
> = {
  ally: {
    label: { en: 'Alliance', ko: '동맹' },
    color: '#34d399',
  },
  feud: {
    label: { en: 'Rivalry / Feud', ko: '불호/갈등' },
    color: '#fb7185',
    dash: [4, 3],
  },
  bipartisan: {
    label: { en: 'Bipartisan Bridge', ko: '초당적 다리' },
    color: '#fbbf24',
  },
  family: {
    label: { en: 'Political Family', ko: '정치 가족' },
    color: '#c084fc',
    dash: [1, 2.5],
  },
  mentor: {
    label: { en: 'Mentor / Succession', ko: '멘토/계승' },
    color: '#94a3b8',
    dash: [2, 4],
  },
};

export const BRANCH_META: Record<Branch, { label: LocalizedText }> = {
  executive: { label: { en: 'Executive', ko: '행정부' } },
  senate: { label: { en: 'Senate', ko: '상원' } },
  house: { label: { en: 'House', ko: '하원' } },
  governor: { label: { en: 'Governors', ko: '주지사' } },
  former: { label: { en: 'Former / Legacy', ko: '전직·레거시' } },
  special: { label: { en: 'Special Actors', ko: '특수 행위자' } },
};
