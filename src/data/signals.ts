import signalsJson from './news-signals.json';
import { pairKey } from '../lib/graph';
import type { NewsSignal } from '../types';

/**
 * news-pipeline (daily) 가 생성한 파일을 로드.
 * 파이프라인 미실행 시 signals=[] 로 graceful하게 동작.
 */
export const SIGNALS: NewsSignal[] = ((signalsJson as { signals?: unknown[] }).signals ??
  []) as NewsSignal[];

export const SIGNALS_BY_PERSON = new Map<string, NewsSignal[]>();
for (const s of SIGNALS) {
  for (const pid of s.people) {
    if (!SIGNALS_BY_PERSON.has(pid)) SIGNALS_BY_PERSON.set(pid, []);
    SIGNALS_BY_PERSON.get(pid)!.push(s);
  }
}

export const LATEST_SIGNALS = [...SIGNALS].slice(0, 6);

/** pairKey → 최신 시그널 */
export const SIGNAL_BY_PAIR = new Map<string, NewsSignal>();
for (const s of SIGNALS) {
  if (!s.pair) continue;
  const k = pairKey(s.pair[0], s.pair[1]);
  if (!SIGNAL_BY_PAIR.has(k)) SIGNAL_BY_PAIR.set(k, s);
}
