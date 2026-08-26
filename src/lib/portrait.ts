import { useEffect, useState } from 'react';

/**
 * Wikipedia REST API로 공식 초상화·위키 링크를 지연 로딩 (CORS 허용).
 * 실패 시 null → 모노그램 폴백.
 */
export interface Portrait {
  img: string | null;
  wikiUrl: string | null;
}

const cache = new Map<string, Portrait>();
const pending = new Set<string>();
const subs = new Set<() => void>();

function notify() {
  subs.forEach((fn) => fn());
}

/** 위키 문서 제목이 애매한 인물만 수동 지정 */
const WIKI_TITLE_OVERRIDES: Record<string, string> = {
  'kim-andy': 'Andy Kim (politician)',
  'bush-w': 'George W. Bush',
  'rfk-jr': 'Robert F. Kennedy Jr.',
  'bill-clinton': 'Bill Clinton',
  'rick-scott': 'Rick Scott',
  'tim-scott': 'Tim Scott',
  'lee-mike': 'Mike Lee (American politician)',
  'cassidy-bill': 'Bill Cassidy',
  'perez-marie': 'Marie Gluesenkamp Perez',
  'frost-maxwell': 'Maxwell Frost',
  'golden-jared': 'Jared Golden',
  'torres-ritchie': 'Ritchie Torres',
  'moore-wes': 'Wes Moore',
  'abbott-greg': 'Greg Abbott',
  'bacon-don': 'Don Bacon',
  'gaetz-matt': 'Matt Gaetz',
  'mccarthy-kevin': 'Kevin McCarthy',
  'haley-nikki': 'Nikki Haley',
  'mccain-john': 'John McCain',
  'dick-cheney': 'Dick Cheney',
  'liz-cheney': 'Liz Cheney',
  'jeb-bush': 'Jeb Bush',
  'paul-rand': 'Rand Paul',
  'kelly-mark': 'Mark Kelly',
  'murphy-chris': 'Chris Murphy',
  'collins-susan': 'Susan Collins',
  'johnson-mike': 'Mike Johnson',
  'mace-nancy': 'Nancy Mace',
  'omar-ilhan': 'Ilhan Omar',
  'khanna-ro': 'Ro Khanna',
};

function wikiTitle(id: string, enName: string): string {
  return WIKI_TITLE_OVERRIDES[id] ?? enName;
}

async function fetchPortrait(id: string, enName: string): Promise<void> {
  const title = wikiTitle(id, enName);
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const portrait: Portrait = {
      img: json?.thumbnail?.source ?? json?.originalimage?.source ?? null,
      wikiUrl: json?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
    };
    cache.set(id, portrait);
  } catch {
    cache.set(id, { img: null, wikiUrl: `https://en.wikipedia.org/wiki/${title}` });
  }
  notify();
}

export function usePortrait(id: string, enName: string): Portrait {
  const [, force] = useState(0);
  useEffect(() => {
    // 선택된 인물이 없을 때도 훅은 호출되므로(빈 문자열) 빈 요청을 막는다
    if (!id || !enName) return;
    const fn = () => force((v) => v + 1);
    subs.add(fn);
    if (!cache.has(id) && !pending.has(id)) {
      pending.add(id);
      void fetchPortrait(id, enName);
    }
    return () => {
      subs.delete(fn);
    };
  }, [id, enName]);

  if (!id) return { img: null, wikiUrl: null };
  return cache.get(id) ?? { img: null, wikiUrl: null };
}
