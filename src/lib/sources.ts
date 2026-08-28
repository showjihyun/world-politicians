import { useEffect, useState } from 'react';
import { SIGNALS_BY_PAIR } from '../data/signals';
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
  loading ??= import('../data/relationship-sources.json')
    .then((m) => {
      cache = (m.default ?? m) as SourceMap;
      subs.forEach((fn) => fn());
      return cache;
    })
    .catch(() => {
      cache = {};
      return cache;
    });
  return loading;
}

/** 뉴스 파이프라인이 이미 들고 있는 신호 — 별도 로딩 없이 즉시 쓸 수 있다 */
function liveSources(key: string): RelSource[] {
  return (SIGNALS_BY_PAIR.get(key) ?? []).map((s) => ({
    title: s.title,
    url: s.url,
    source: s.source,
    date: s.date,
  }));
}

function merge(rel: Relationship, collected: RelSource[]): RelSource[] {
  const seen = new Set<string>();
  const out: RelSource[] = [];
  // 수동 확정 → 수집분 → 최근 신호 순. 같은 URL 은 한 번만.
  for (const s of [...(rel.sources ?? []), ...collected, ...liveSources(pairKey(rel.a, rel.b))]) {
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
    curated: (rel.sources?.length ?? 0) > 0,
    loading: cache === null,
  };
}
