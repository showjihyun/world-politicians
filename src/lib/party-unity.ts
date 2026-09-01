import { useEffect, useState } from 'react';

/**
 * 당론 이탈률 — 자기 당 다수와 반대로 던진 비율.
 *
 * 5KB 라 자금(111KB)·로비(113KB) 처럼 무겁지 않지만, 같은 이유로 인물을 열 때
 * 부른다. 그래프를 그리는 데는 쓰이지 않는다.
 *
 * **관계를 설명하는 값이 아니다.** 당내 갈등 엣지와의 상관을 두 지표로 검증했고
 * 둘 다 무신호였다(DW-NOMINATE 이탈 p=0.813, 이탈률 p=0.992). Collins 16.5% ·
 * Fitzpatrick 22.9% 는 당내 feud 가 0 이다 — 조용히 상시 이탈하는 것은 공개
 * 충돌을 낳지 않는다. 인물 사실로만 쓰고 엣지를 만들지 않는다.
 */

export interface PersonUnity {
  /** 정당 표결 중 자기 당 다수와 반대로 던진 비율(%) */
  rate: number;
  /** 분모 — 이 사람이 찬반을 던진 정당 표결 수 */
  votes: number;
  against: number;
  side: 'D' | 'R';
  chamber: 'House' | 'Senate';
}

interface UnityFile {
  congress: number;
  minVotes: number;
  /** "House|R" → 같은 당·같은 원의 중앙값 */
  medians: Record<string, number>;
  people: Record<string, PersonUnity>;
}

let cache: UnityFile | null = null;
let loading: Promise<UnityFile | null> | null = null;
const subs = new Set<() => void>();

function load(): Promise<UnityFile | null> {
  if (cache) return Promise.resolve(cache);
  loading ??= import('../data/party-unity.json')
    .then((m) => {
      cache = (m.default ?? m) as unknown as UnityFile;
      subs.forEach((fn) => fn());
      return cache;
    })
    .catch(() => null);
  return loading;
}

export interface UnityState {
  unity: PersonUnity | null;
  /** 같은 당·같은 원의 중앙값 — 홀로 놓인 비율은 높은지 낮은지 알 수 없다 */
  median: number | null;
  congress: number;
}

export function useUnity(personId: string | null): UnityState {
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

  if (!personId) return { unity: null, median: null, congress: 0 };
  const unity = cache?.people[personId] ?? null;
  return {
    unity,
    median: unity ? (cache?.medians[`${unity.chamber}|${unity.side}`] ?? null) : null,
    congress: cache?.congress ?? 0,
  };
}
