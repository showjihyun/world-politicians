import { useEffect, useState } from 'react';

/**
 * 인물을 열었을 때 불러오는 데이터셋 — 자금·로비·당론 이탈률이 같은 모양이다.
 *
 * 셋이 각자 캐시·구독·로더를 들고 있었고, 그래서 한쪽만 고쳐진 적이 있다
 * (funding 만 loading 플래그를 갖고 있었다). 더 나쁜 것은 셋 다 같은 버그를
 * 들고 있었다는 것이다 — 아래 `load` 의 주석이 그것이다.
 *
 * 그래프를 그리는 데는 필요 없고 인물을 열어야 보이므로 초기 번들에 넣지 않는다.
 */
export interface LazyDataset<T> {
  /** 컴포넌트에서 쓴다. 아직 못 읽었으면 null 이고, 읽히면 다시 그린다. */
  use(key: string | null): T | null;
  /** 불러오기 자체. 훅 없이 검증할 수 있도록 열어 둔다. */
  load(): Promise<T | null>;
}

export function createLazyDataset<T>(importer: () => Promise<unknown>): LazyDataset<T> {
  let cache: T | null = null;
  let loading: Promise<T | null> | null = null;
  const subs = new Set<() => void>();

  function load(): Promise<T | null> {
    if (cache) return Promise.resolve(cache);
    loading ??= importer()
      .then((m) => {
        cache = ((m as { default?: unknown }).default ?? m) as T;
        subs.forEach((fn) => fn());
        return cache;
      })
      .catch(() => {
        // 실패한 약속을 들고 있으면 그 세션 내내 다시 시도하지 않는다.
        // 화면은 "아직 불러오는 중" 과 똑같아 보이는데 영원히 그 상태여서,
        // "기록이 없다" 를 적으려고 만든 안내까지 함께 사라진다.
        // 배포 직후 해시가 바뀐 청크를 한 번 놓치는 것만으로 그렇게 된다.
        loading = null;
        return null;
      });
    return loading;
  }

  function use(key: string | null): T | null {
    const [, force] = useState(0);

    useEffect(() => {
      if (!key) return;
      const fn = () => force((v) => v + 1);
      subs.add(fn);
      void load().then(fn);
      return () => {
        subs.delete(fn);
      };
    }, [key]);

    return key ? cache : null;
  }

  return { use, load };
}
