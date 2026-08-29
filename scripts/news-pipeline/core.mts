/**
 * 파이프라인 도메인 — 순수 함수.
 *
 * fs·fetch·process 를 건드리지 않는다. 여기 있는 규칙들은 전부 실제로 사고를
 * 낸 적이 있는 것들이고, 파일시스템에 묶여 있는 동안에는 검증할 방법이 없었다:
 *
 *   - 매체 허용 판정: 'AP' 를 부분일치로 쓰다가 CoinG(ap)e, Yahoo News Sing(ap)ore,
 *     Tele(grap)hHerald 를 통과시켰다
 *   - 누적: 매 실행마다 결과를 덮어써서 수집이 부실한 날 아카이브가 통째로 날아갔다
 *   - 즉시로드 선별: 이 크기가 인물 수가 아니라 아카이브 크기에 비례하면
 *     분할한 의미가 없어진다
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export interface SignalLike {
  id: string;
  date: string;
  people: string[];
  classified?: boolean;
  polarity?: 'ally' | 'feud' | 'neutral';
}

export interface SignalsStats {
  total: number;
  classified: number;
  ally: number;
  feud: number;
  neutral: number;
}

/**
 * 매체 허용 판정.
 *
 * 이름은 반드시 단어 경계로 맞춘다. 부분일치를 쓰면 목록의 짧은 항목 하나가
 * 무관한 매체를 통째로 끌어들인다 — 'AP' 가 그랬다.
 */
export function isAllowedSource(
  sourceUrl: string,
  sourceName: string,
  hosts: readonly string[],
  names: readonly string[]
): boolean {
  if (sourceUrl && hosts.some((h) => sourceUrl.includes(h))) return true;

  const name = sourceName.trim().toLowerCase();
  if (!name) return false;

  return names.some((raw) => {
    const n = raw.toLowerCase();
    if (name === n) return true;
    const i = name.indexOf(n);
    if (i === -1) return false;
    const before = i === 0 ? '' : name[i - 1];
    const after = name[i + n.length] ?? '';
    return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
  });
}

/** 분류·비중립을 앞세우고 그 안에서 최신순 */
export function rank(s: SignalLike): number {
  return s.classified && s.polarity !== 'neutral' ? 0 : 1;
}
export function bySalience(a: SignalLike, b: SignalLike): number {
  return rank(a) - rank(b) || (a.date < b.date ? 1 : -1);
}

/**
 * 기존 + 신규를 id 로 합치고 보관 기간이 지난 것만 버린다.
 * 덮어쓰지 않는 것이 핵심이다 — 신규가 비어도 기존은 남아야 한다.
 */
export function accumulate<T extends SignalLike>(
  existing: T[],
  incoming: T[],
  retentionDays: number,
  now: Date = new Date()
): T[] {
  const map = new Map<string, T>();
  for (const s of existing) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return [...map.values()].filter((s) => {
    const ts = new Date(`${s.date}T00:00:00Z`).getTime();
    return Number.isNaN(ts) || ts >= cutoff;
  });
}

export function buildStats(signals: SignalLike[]): SignalsStats {
  return {
    total: signals.length,
    classified: signals.filter((s) => s.classified).length,
    ally: signals.filter((s) => s.polarity === 'ally').length,
    feud: signals.filter((s) => s.polarity === 'feud').length,
    neutral: signals.filter((s) => !s.classified || s.polarity === 'neutral').length,
  };
}

/**
 * 첫 화면이 쓰는 몫만 고른다.
 * 결과 크기가 인물 수에 비례해야 한다 — 아카이브 크기에 비례하면 분할이 무의미하다.
 */
export function pickRecent<T extends SignalLike>(
  signals: T[],
  perPerson: number,
  globalRecent: number
): T[] {
  const sorted = [...signals].sort(bySalience);
  const keep = new Set<string>();
  const seen = new Map<string, number>();

  for (const s of sorted) {
    for (const p of s.people) {
      const n = seen.get(p) ?? 0;
      if (n < perPerson) {
        seen.set(p, n + 1);
        keep.add(s.id);
      }
    }
  }
  for (const s of sorted.slice(0, globalRecent)) keep.add(s.id);

  return sorted.filter((s) => keep.has(s.id));
}

/** 신호를 'YYYY-MM' 으로 묶는다. 날짜가 이상한 것은 버린다 */
export function partitionByMonth<T extends SignalLike>(signals: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const s of signals) {
    const m = (s.date ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    if (!out.has(m)) out.set(m, []);
    out.get(m)!.push(s);
  }
  return out;
}

/**
 * 수집 시각 결정.
 *
 * generatedAt 은 "뉴스를 실제로 수집한 시각" 이다. 분할·정규화 같은 재처리가
 * 이 값을 갱신하면 화면의 신선도 배지가 재처리 시각을 수집 시각으로 표시한다.
 * 그래서 기본은 기존 값 유지이고, 실제 수집일 때만 새 값을 쓴다.
 */
export function resolveGeneratedAt(
  previous: string | null | undefined,
  candidate: string,
  fresh: boolean
): string {
  if (fresh) return candidate;
  return previous ?? candidate;
}
