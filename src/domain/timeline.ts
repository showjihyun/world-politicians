/**
 * 관계 시계열 도메인 — 순수 함수.
 *
 * 큐레이션 아크(HISTORY_ARCS)와 현재 시각을 인자로 받는다. 예전에는 둘 다
 * 모듈 전역이라, "이 입력이면 이 셀이 나와야 한다" 를 고정할 수 없었다.
 * 특히 현재 시각이 박혀 있으면 같은 테스트가 달이 바뀔 때 깨진다.
 *
 * 규칙: 이 파일은 타입 외의 런타임 import 를 갖지 않는다.
 */
import type { HistoryArc, NewsSignal } from '../types';
import type { LocalizedText } from '../types';

export type Pol = 'ally' | 'feud' | 'neutral';

export interface MonthCell {
  ym: string;
  polarity: Pol;
  note: LocalizedText | null;
  curated: boolean;
  flip: boolean;
}

const POL_WEIGHT: Record<Pol, number> = { feud: 2, ally: 2, neutral: 0 };

/** 기준 월. 인자로 받지 않으면 오늘 — 테스트가 시점을 고정할 수 있어야 한다 */
function currentYm(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * 페어의 월별 호불호 타임라인 (live 뉴스 신호 우선, 없으면 큐레이션 아크 forward-fill).
 * windowMonths 내 데이터가 전혀 없으면 null.
 */
export function buildPairTimeline(
  a: string,
  b: string,
  windowMonths: number,
  /** 아카이브에서 만든 pairKey → 신호 맵. 호출부가 먼저 loadArchive() 해야 한다 */
  byPair: Map<string, NewsSignal[]>,
  /** 큐레이션 아크. 도메인은 데이터셋을 직접 읽지 않는다 */
  arcs: HistoryArc[],
  /** 기준 시점 — 기본은 지금 */
  now: Date = new Date()
): { cells: MonthCell[]; flips: MonthCell[] } | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const live = byPair.get(key) ?? [];
  const arc = arcs.find(
    (h) => (h.a === a && h.b === b) || (h.a === b && h.b === a)
  );

  if (live.length === 0 && !arc) return null;

  const nowYm = currentYm(now);
  const start = addMonths(nowYm, -(windowMonths - 1));

  // live 월별 집계 (다수결, 동점 시 neutral; 최신 요약을 노트로)
  const liveByMonth = new Map<string, { pol: Pol; note: LocalizedText }>();
  for (const s of [...live].sort((x, y) => (x.date < y.date ? -1 : 1))) {
    const ym = s.date.slice(0, 7);
    if (ym < start) continue;
    const prev = liveByMonth.get(ym);
    if (!s.polarity || s.polarity === 'neutral') {
      if (!prev) liveByMonth.set(ym, { pol: 'neutral', note: s.summary_ko ? { en: s.summary_en ?? s.title, ko: s.summary_ko } : { en: s.title, ko: s.title } });
      continue;
    }
    const note: LocalizedText = { en: s.summary_en ?? s.title, ko: s.summary_ko ?? s.title };
    if (!prev) {
      liveByMonth.set(ym, { pol: s.polarity, note });
    } else if (prev.pol !== s.polarity) {
      // 충돌 시 더 강한 극성 유지, 동점이면 최신으로 덮음
      if (POL_WEIGHT[s.polarity] > POL_WEIGHT[prev.pol]) liveByMonth.set(ym, { pol: s.polarity, note });
    } else {
      liveByMonth.set(ym, { pol: prev.pol, note });
    }
  }

  // curated forward-fill map
  const curPoints = arc ? [...arc.points].sort((x, y) => (x.ym < y.ym ? -1 : 1)) : [];

  const cells: MonthCell[] = [];
  // 윈도우 시작 이전의 마지막 큐레이션 포인트로 seed — 안 그러면 창 앞부분이 통째로 비고
  // 창 안에서 첫 변곡이 일어난 것처럼 보인다 (예: trump×musk 의 feud→ally 반전이 사라짐)
  const seed = [...curPoints].reverse().find((p) => p.ym < start);
  let carried: { pol: Pol; note: LocalizedText | null } | null = seed
    ? { pol: seed.polarity as Pol, note: seed.note }
    : null;
  const totalMonths = monthDiff(start, nowYm) + 1;

  for (let i = 0; i < totalMonths; i++) {
    const ym = addMonths(start, i);
    const liveEntry = liveByMonth.get(ym);
    const cp = curPoints.find((p) => p.ym === ym);

    if (liveEntry) {
      cells.push({ ym, polarity: liveEntry.pol, note: liveEntry.note, curated: false, flip: false });
      carried = { pol: liveEntry.pol, note: liveEntry.note };
      continue;
    }
    if (cp) {
      carried = { pol: cp.polarity as Pol, note: cp.note };
      cells.push({ ym, polarity: cp.polarity as Pol, note: cp.note, curated: true, flip: false });
      continue;
    }
    if (carried) {
      cells.push({ ym, polarity: carried.pol, note: null, curated: true, flip: false });
    }
    // carried 없음(데이터 시작 전) → 셀 생략
  }

  // flip 마킹
  const flips: MonthCell[] = [];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].polarity !== cells[i - 1].polarity) {
      cells[i].flip = true;
      flips.push(cells[i]);
    }
  }

  return cells.length ? { cells, flips } : null;
}

export function polColor(p: Pol): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#64748b';
}
