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

export type ExcludedReason = 'notInCongress' | 'noSide' | 'noVotes' | 'thinRecord';

/** JSON 이 없거나 못 읽었을 때 쓰는 축. 데이터가 오면 언제나 그쪽이 이긴다. */
const FALLBACK_AXIS_MAX = 30;

interface UnityFile {
  congress: number;
  minVotes: number;
  /** 막대 축의 최대치 — 관측 최대치에서 계산해 내려온다 */
  axisMax: number;
  /** "House|R" → 같은 당·같은 원의 중앙값 */
  medians: Record<string, number>;
  people: Record<string, PersonUnity>;
  /** 값이 없는 사람은 왜 없는지 — 이유를 뭉개면 화면이 틀린 말을 한다 */
  excluded: Record<string, ExcludedReason>;
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
    .catch(() => {
      // 실패한 약속을 들고 있으면 그 세션 내내 다시 시도하지 않는다.
      // 화면은 "아직 불러오는 중" 과 똑같아 보이는데 영원히 그 상태다 —
      // 없다는 사실을 적으려고 만든 장치가 바로 그 실패에서 사라진다.
      loading = null;
      return null;
    });
  return loading;
}

export interface UnityState {
  unity: PersonUnity | null;
  /** 같은 당·같은 원의 중앙값 — 홀로 놓인 비율은 높은지 낮은지 알 수 없다 */
  median: number | null;
  /**
   * 막대 축의 최대치. 화면에 상수로 박으면 데이터가 그 위로 올라간 날
   * 상위 몇 명이 똑같이 가득 찬 막대가 되어 구분이 사라진다.
   */
  axisMax: number;
  congress: number;
  /** 데이터를 읽었는가 — 아직 못 읽은 것과 기록이 없는 것은 다르다 */
  known: boolean;
  /** 값이 없다면 왜 없는가. 이유마다 화면 문구가 다르다. */
  reason: ExcludedReason | null;
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

  if (!personId)
    return { unity: null, median: null, axisMax: FALLBACK_AXIS_MAX, congress: 0, known: false, reason: null };
  const unity = cache?.people[personId] ?? null;
  return {
    unity,
    median: unity ? (cache?.medians[`${unity.chamber}|${unity.side}`] ?? null) : null,
    // 0 은 ?? 를 통과한다. 0 으로 나누면 모든 막대가 가득 찬다.
    axisMax: cache?.axisMax && cache.axisMax > 0 ? cache.axisMax : FALLBACK_AXIS_MAX,
    congress: cache?.congress ?? 0,
    // 아직 안 불러온 것과 기록이 없는 것을 구분한다 — 둘 다 빈 화면이면
    // "판정이 없다" 가 아니라 그냥 빈약한 항목으로 보인다.
    known: cache !== null,
    reason: unity ? null : (cache?.excluded[personId] ?? null),
  };
}
