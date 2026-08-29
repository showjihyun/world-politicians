import indexJson from './signals/index.json';
import recentJson from './signals/recent.json';
import { pairKey } from '../lib/graph';
import type { NewsSignal } from '../types';

/**
 * 뉴스 신호는 매일 누적되므로 아카이브 전체를 초기 번들에 넣으면 계속 커진다
 * (365일 상한까지 차면 1.5MB). 그래서 셋으로 나눠 둔다:
 *
 *   signals/index.json    매니페스트 — 월 목록·인물별 건수·집계. 항상 즉시 로드
 *   signals/recent.json   첫 화면이 실제로 쓰는 몫(인물당 4 + 전체 6). 즉시 로드.
 *                         인물 수에 비례하므로 아카이브가 커져도 크기가 그대로다
 *   signals/YYYY-MM.json  월별 전체 아카이브. 시계열을 열 때만 가져온다
 *
 * 파이프라인은 세 가지를 매 실행마다 다시 쓴다 (scripts/news-pipeline/merge.mts).
 */

interface SignalsIndex {
  generatedAt: string | null;
  windowDays: number;
  stats: { total: number; classified: number; ally: number; feud: number; neutral: number };
  firstDate: string | null;
  lastDate: string | null;
  months: string[];
  counts: Record<string, number>;
}

const INDEX = indexJson as unknown as SignalsIndex;

/** 첫 화면용 신호. 전체 아카이브가 아니다 — 그건 loadArchive() 로 받는다 */
export const SIGNALS: NewsSignal[] = ((recentJson as { signals?: unknown[] }).signals ??
  []) as NewsSignal[];

/** 수집·분석 시점 메타 (화면 타임스탬프 표시용) */
export const SIGNALS_META = {
  generatedAt: INDEX.generatedAt ?? null,
  windowDays: INDEX.windowDays ?? 30,
  /** 아카이브 전체 건수 — 즉시 로드분이 아니라 매니페스트 기준 */
  count: INDEX.stats?.total ?? SIGNALS.length,
  firstDate: INDEX.firstDate ?? null,
  lastDate: INDEX.lastDate ?? null,
  months: INDEX.months ?? [],
};

export const SIGNALS_BY_PERSON = new Map<string, NewsSignal[]>();
for (const s of SIGNALS) {
  for (const pid of s.people) {
    if (!SIGNALS_BY_PERSON.has(pid)) SIGNALS_BY_PERSON.set(pid, []);
    SIGNALS_BY_PERSON.get(pid)!.push(s);
  }
}

/** 인물별 아카이브 전체 건수 — 4건만 들고 있어도 "17건" 을 정확히 표시할 수 있다 */
export function signalCountFor(personId: string): number {
  return INDEX.counts?.[personId] ?? SIGNALS_BY_PERSON.get(personId)?.length ?? 0;
}

export const LATEST_SIGNALS = SIGNALS.slice(0, 6);

// ── 전체 아카이브 (지연 로딩) ────────────────────────────────────────────
// 파일명이 달마다 바뀌므로 정적 import 를 쓸 수 없다. glob 으로 지연 import 맵을
// 만들어 두고 필요할 때만 가져온다.
const MONTH_FILES = import.meta.glob<{ signals?: NewsSignal[] }>('./signals/20*.json');

let archive: NewsSignal[] | null = null;
let archiveLoading: Promise<NewsSignal[]> | null = null;

/** 월별 파티션을 전부 받아 합친다. 두 번째 호출부터는 캐시를 돌려준다 */
export function loadArchive(): Promise<NewsSignal[]> {
  if (archive) return Promise.resolve(archive);
  archiveLoading ??= Promise.all(
    Object.values(MONTH_FILES).map((load) =>
      load()
        .then((m) => m.signals ?? [])
        .catch(() => [] as NewsSignal[])
    )
  ).then((chunks) => {
    const seen = new Set<string>();
    const all: NewsSignal[] = [];
    for (const c of chunks) {
      for (const s of c) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        all.push(s);
      }
    }
    archive = all;
    return all;
  });
  return archiveLoading;
}

/** pairKey → 페어의 모든 신호. 시계열이 쓰며, 아카이브를 먼저 받아야 한다 */
export function signalsByPair(all: NewsSignal[]): Map<string, NewsSignal[]> {
  const m = new Map<string, NewsSignal[]>();
  for (const s of all) {
    if (!s.pair) continue;
    const k = pairKey(s.pair[0], s.pair[1]);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  return m;
}
