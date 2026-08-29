/**
 * 시계열 도메인에 실제 큐레이션 아크를 묶는 어댑터.
 */
import { HISTORY_ARCS } from '../data/signal-history';
import { buildPairTimeline as buildPure } from '../domain/timeline';
import type { NewsSignal } from '../types';

export { polColor } from '../domain/timeline';
export type { MonthCell, Pol } from '../domain/timeline';

export function buildPairTimeline(
  a: string,
  b: string,
  windowMonths: number,
  byPair: Map<string, NewsSignal[]>
) {
  return buildPure(a, b, windowMonths, byPair, HISTORY_ARCS);
}
