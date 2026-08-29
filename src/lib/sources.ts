import { useEffect, useState } from 'react';
import { pairKey } from './graph';
import type { RelSource, Relationship } from '../types';

const MAX = 4;

/**
 * 엣지 근거 목록. 266개 엣지 전체의 출처는 400KB 가 넘어 초기 번들에 넣을 수 없다.
 * 사용자가 엣지를 눌러 "어떻게 아느냐" 를 물을 때 그 자리에서 불러온다.
 */
type SourceMap = Record<string, RelSource[]>;

let cache: SourceMap | null = null;
let loading: Promise<SourceMap> | null = null;
const subs = new Set<() => void>();

function load(): Promise<SourceMap> {
  if (cache) return Promise.resolve(cache);
  // 뉴스 근거와 공동발의 근거는 파일이 다르지만 키(pairKey)가 같다.
  // 한 엣지에 둘 다 있을 수 있고(큐레이션된 쌍이 공동발의도 많은 경우) 그때는
  // 서로를 보강한다.
  loading ??= Promise.all([
    import('../data/relationship-sources.json').then((m) => (m.default ?? m) as SourceMap),
    import('../data/cosponsorship-sources.json').then((m) => (m.default ?? m) as SourceMap),
  ])
    .then(([news, bills]) => {
      const merged: SourceMap = { ...news };
      for (const [k, v] of Object.entries(bills)) merged[k] = [...(merged[k] ?? []), ...v];
      cache = merged;
      subs.forEach((fn) => fn());
      return cache;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return loading;
}

function merge(rel: Relationship, collected: RelSource[]): RelSource[] {
  const seen = new Set<string>();
  const out: RelSource[] = [];
  // 수동 확정 → 수집분 순. 같은 URL 은 한 번만.
  //
  // 뉴스 파이프라인의 신호는 여기 넣지 않는다. 그 URL 의 97% 가 Google News
  // 리다이렉트라 목적지도 매체명도 확인할 수 없다. 근거 패널은 "눌러서 확인할 수
  // 있다" 가 전부인 기능이므로, 확인 불가능한 링크가 한 건이라도 섞이면 의미가 없다.
  // (해당 신호들은 프로필의 Latest Wire 에 그대로 남는다)
  for (const s of [...(rel.sources ?? []), ...collected]) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX);
}

export interface RelSourcesState {
  sources: RelSource[];
  /** 수동 확정 출처가 아니라 자동 수집된 후보인가 */
  curated: boolean;
  loading: boolean;
}

/**
 * 자동 수집분은 "두 사람이 같은 기사에 등장" 으로 모은 후보다.
 * 관계를 실제로 뒷받침하는지는 사람이 확인해야 하므로, 화면에서도 그렇게 표시한다.
 */
export function useRelSources(rel: Relationship | null): RelSourcesState {
  const [, force] = useState(0);

  useEffect(() => {
    if (!rel) return;
    const fn = () => force((v) => v + 1);
    subs.add(fn);
    void load().then(fn);
    return () => {
      subs.delete(fn);
    };
  }, [rel]);

  if (!rel) return { sources: [], curated: false, loading: false };

  const collected = cache?.[pairKey(rel.a, rel.b)] ?? [];
  return {
    sources: merge(rel, collected),
    // 공동발의 엣지의 근거는 전부 congress.gov 법안 링크다. "사람이 확인해야 할
    // 후보" 가 아니라 그 엣지를 만든 근거 자체이므로 확정으로 표시한다.
    curated: (rel.sources?.length ?? 0) > 0 || rel.type === 'cosponsor',
    loading: cache === null,
  };
}
