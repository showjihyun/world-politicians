import { L } from './L';

/**
 * 호불호 시계열의 "변곡점" 큐레이션 — 공개 보도 기반 월별 아크.
 * builder가 첫 포인트부터 현재까지 forward-fill 하므로, 변곡만 기록하면 됨.
 */
export interface HistoryPoint {
  ym: string;
  polarity: 'ally' | 'feud' | 'neutral';
  note: { en: string; ko: string };
}

export interface HistoryArc {
  a: string;
  b: string;
  points: HistoryPoint[];
}

export const HISTORY_ARCS: HistoryArc[] = [
  {
    a: 'trump', b: 'musk',
    points: [
      { ym: '2025-05', polarity: 'ally', note: L('DOGE 시절 최고의 동반자', 'DOGE 시절 최고의 동반자') },
      { ym: '2025-06', polarity: 'feud', note: L('Public breakup over the Big Beautiful Bill + Epstein bomb', '대형조세법 반대·에핀스타 폭탄으로 공개 결별') },
      { ym: '2026-01', polarity: 'ally', note: L('Mar-a-Lago dinner photo — reconciliation sealed', '마라라고 만찬 사진으로 화해 공식화') },
      { ym: '2026-08', polarity: 'ally', note: L('Backs GOP midterms with $100M+', '$1억+ 중간선거 자금으로 복귀') },
    ],
  },
  {
    a: 'trump', b: 'mtg',
    points: [
      { ym: '2025-06', polarity: 'ally', note: L('Loudest loyalist on the trail', '러닝메이트 최강 충성파') },
      { ym: '2025-09', polarity: 'feud', note: L('Epstein-files fight turns personal', '에핀스타 파일 공개 요구로 개인전 돌입') },
      { ym: '2025-11', polarity: 'feud', note: L('Branded "traitor" — announces resignation', '"반역자" 낙인 후 사임 선언') },
    ],
  },
  {
    a: 'trump', b: 'massie',
    points: [
      { ym: '2025-08', polarity: 'feud', note: L('Discharge petition declared "hostile act"', '탄원서가 "행정부 적대 행위"로 규정됨') },
      { ym: '2026-05', polarity: 'feud', note: L('Loses primary to Trump-backed challenger', '트럼프 지지 후보에게 예선 패배') },
    ],
  },
  {
    a: 'massie', b: 'khanna',
    points: [
      { ym: '2025-07', polarity: 'ally', note: L('EFTA introduced across the aisle', 'EFTA 초당적 발의') },
      { ym: '2025-11', polarity: 'ally', note: L('Law of the land: 427-1', '하원 427-1 법제화') },
      { ym: '2026-07', polarity: 'ally', note: L('EFTA II launched together', 'EFTA II 공동 재발의') },
    ],
  },
  {
    a: 'schumer', b: 'aoc',
    points: [
      { ym: '2025-03', polarity: 'feud', note: L('Shutdown-surrender vote enrages the left', '셧다운 항복 표결에 진보 분노') },
      { ym: '2025-10', polarity: 'feud', note: L('"Schumer Shutdown" standoff deepens rift', '"슈머 셧다운" 대치로 균열 심화') },
      { ym: '2026-08', polarity: 'feud', note: L('AOC still won\'t rule out the primary', 'AOC, 경선 가능성 계속 열어둠') },
    ],
  },
  {
    a: 'musk', b: 'bannon',
    points: [
      { ym: '2025-01', polarity: 'feud', note: L('H-1B visa war ignites MAGA-vs-tech', 'H-1B 전쟁으로 MAGA-vs-테크 점화') },
      { ym: '2025-06', polarity: 'feud', note: L('Epstein bomb: "go f*** yourself" era', '에핀스타 폭탄 전쟁') },
    ],
  },
  {
    a: 'fetterman', b: 'sanders',
    points: [
      { ym: '2024-12', polarity: 'ally', note: L('Progressive hope of Pennsylvania', '펜실베이니아의 진보 희망') },
      { ym: '2025-03', polarity: 'feud', note: L('Israel/border realignment goes public', '이스라엘·국경 노선 변경 공개화') },
    ],
  },
  {
    a: 'biden', b: 'harris',
    points: [
      { ym: '2025-01', polarity: 'ally', note: L('Farewell tour as partners', '파트너로서 퇴장 투어') },
      { ym: '2025-09', polarity: 'neutral', note: L('Aide-blame book excerpts chill ties', '보좌진 책 저격으로 냉각 조짐') },
      { ym: '2026-01', polarity: 'feud', note: L('"107 Days" memoir detonates camp war', '회고록 「107일」로 진영 전쟁 폭발') },
    ],
  },
  {
    a: 'harris', b: 'newsom',
    points: [
      { ym: '2025-01', polarity: 'feud', note: L('2028 shadow primary opens', '2028 예비 경쟁 개시') },
      { ym: '2026-08', polarity: 'feud', note: L('Both fully in the 2028 arena', '양측 2028 레이스 본격 진입') },
    ],
  },
  {
    a: 'vance', b: 'walz',
    points: [
      { ym: '2024-10', polarity: 'feud', note: L('VP debate — the civil showdown', 'VP 토론, 예의 바른 대결') },
      { ym: '2024-12', polarity: 'neutral', note: L('Campaign heat cools post-election', '선거 종료 후 열기 식음') },
    ],
  },
  {
    a: 'trump', b: 'newsom',
    points: [
      { ym: '2025-06', polarity: 'feud', note: L('National Guard deployed over his objection', '반발 속 내셔널가드 강제 파견') },
      { ym: '2026-06', polarity: 'feud', note: L('Counter-gerrymander special election', '게리맨더 역전 국민투표') },
    ],
  },
  {
    a: 'trump', b: 'fetterman',
    points: [
      { ym: '2025-02', polarity: 'neutral', note: L('"Sensible Democrat" praise begins', '"상식적 민주당원" 호평 시작') },
      { ym: '2025-06', polarity: 'ally', note: L('Mar-a-Lago dinner together', '마라라고 저녁 식사') },
    ],
  },
];
