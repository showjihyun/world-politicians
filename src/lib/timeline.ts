import { HISTORY_ARCS } from '../data/signal-history';
import { SIGNALS_BY_PAIR } from '../data/signals';
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

function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
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
  windowMonths: number
): { cells: MonthCell[]; flips: MonthCell[] } | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const live = SIGNALS_BY_PAIR.get(key) ?? [];
  const arc = HISTORY_ARCS.find(
    (h) => (h.a === a && h.b === b) || (h.a === b && h.b === a)
  );

  if (live.length === 0 && !arc) return null;

  const now = currentYm();
  const start = addMonths(now, -(windowMonths - 1));

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
  const totalMonths = monthDiff(start, now) + 1;

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
