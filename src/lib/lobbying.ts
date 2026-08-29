import { useEffect, useState } from 'react';

/**
 * 로비 회전문 — 눌렀을 때 불러온다.
 *
 * 114KB 다. 그래프에는 쓰이지 않고 인물을 열어야 보이므로 초기 번들에 넣지 않는다.
 *
 * **뜻을 좁게 유지한다.** 이 데이터는 로비 등록서의 `coveredPosition`, 즉 로비스트가
 * 신고한 과거 정부 직위다. "이 인물의 전직 보좌진이 지금 로비 업계에 있다" 는
 * 뜻이지 "그들이 이 인물을 로비한다" 가 아니다. 신고서의 고객은 기업이다.
 */

export interface Alumnus {
  name: string;
  role: string;
  firm: string;
  client: string;
  year: number;
}

export interface PersonLobbying {
  alumniCount: number;
  alumni: Alumnus[];
  topFirms: { name: string; count: number }[];
  topClients: { name: string; count: number }[];
}

interface LobbyingFile {
  years: number[];
  people: Record<string, PersonLobbying>;
}

let cache: LobbyingFile | null = null;
let loading: Promise<LobbyingFile | null> | null = null;
const subs = new Set<() => void>();

function load(): Promise<LobbyingFile | null> {
  if (cache) return Promise.resolve(cache);
  loading ??= import('../data/lobbying.json')
    .then((m) => {
      cache = (m.default ?? m) as unknown as LobbyingFile;
      subs.forEach((fn) => fn());
      return cache;
    })
    .catch(() => null);
  return loading;
}

export interface LobbyingState {
  lobbying: PersonLobbying | null;
  years: number[];
}

export function useLobbying(personId: string | null): LobbyingState {
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

  if (!personId) return { lobbying: null, years: [] };
  return { lobbying: cache?.people[personId] ?? null, years: cache?.years ?? [] };
}
