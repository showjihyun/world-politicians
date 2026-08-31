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

export interface ClassifyOutcome {
  pair?: [string, string] | null;
  evidence?: string;
  polarity?: 'ally' | 'feud' | 'neutral';
  confidence?: number;
  summary_en?: string;
  summary_ko?: string;
}

/**
 * 분류 결과를 기존 신호에 얹는다.
 *
 * **판정을 못 받으면 원본을 그대로 돌려준다.** 침묵을 "판정 없음으로 덮어쓰기" 로
 * 처리하면 이미 분류돼 있던 것까지 지워진다 — dry-run 중 503 이 두 번 났을 때
 * 그 배치의 근거가 통째로 날아갈 뻔했다.
 *
 * 관계쌍은 모델이 **데이터셋 인물 두 명**을 제대로 짚었을 때만 바꾼다. 그렇지
 * 않으면 기존 쌍을 지킨다 — 엉뚱한 쌍으로 갈아치우면 근거 파일과 조인이 깨진다.
 */
export function applyResult<T extends ClassifiableSignal>(signal: T, result: ClassifyOutcome | undefined): T {
  if (!result || !result.polarity) return signal;

  const people = signal.people ?? [];
  const ok =
    result.pair &&
    result.pair.length === 2 &&
    people.includes(result.pair[0]) &&
    people.includes(result.pair[1]) &&
    result.pair[0] !== result.pair[1];
  const pair = ok ? ([...result.pair!].sort() as [string, string]) : signal.pair;

  return {
    ...signal,
    pair,
    polarity: result.polarity,
    evidence: result.evidence ?? signal.evidence,
    // 결과에 없는 필드로 기존 값을 덮지 않는다. 모델이 극성만 주고 요약을
    // 빠뜨리면 화면의 설명이 조용히 사라진다.
    confidence: result.confidence ?? signal.confidence,
    summary_en: result.summary_en ?? signal.summary_en,
    summary_ko: result.summary_ko ?? signal.summary_ko,
    classified: true,
  };
}

export interface ClassifiableSignal {
  people?: string[];
  evidence?: string;
  pair?: [string, string] | string[];
  polarity?: string;
  confidence?: number;
  summary_en?: string;
  summary_ko?: string;
  classified?: boolean;
}

/**
 * 다시 시도할 것을 고른다.
 *
 * 분류에 실패한 신호는 파이프라인이 다시 보지 않아 영원히 미분류로 남는다.
 * 실제로 엿새치(29건)가 그렇게 갇혀 있었다. 오래된 것부터 처리하고, 한 번에
 * 너무 많이 부르지 않도록 상한을 둔다 — 장애가 길었으면 수백 건일 수 있다.
 */
export function pickForRetry<T extends ClassifiableSignal & { date: string; id: string }>(
  signals: T[],
  limit: number
): T[] {
  return signals
    .filter((s) => !s.classified)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * 같은 기사를 한 번만 남긴다.
 *
 * id 는 `hash(url + title)` 이라 **제목이 바뀌면 다른 id 가 된다.** 매체가
 * 헤드라인을 고치거나(`Tim Walz accused…` → `Walz defies Trump…`) 영상판에
 * `Video ` 접두사가 붙으면 같은 기사가 두 번 쌓인다. 실제로 그렇게 두 건이 들어왔다.
 *
 * id 체계를 바꾸지 않는 이유: 지금 쌓인 신호의 id 가 전부 달라져서 다음 실행이
 * 아카이브를 통째로 두 배로 만든다. 그래서 id 는 그대로 두고 **(url, 관계쌍)** 으로
 * 한 번 더 거른다.
 *
 * 무엇을 남기는가: 분류된 것을 남긴다. 판정이 있는 쪽이 정보가 많고, 화면에서도
 * 극성 없이 나가는 것을 줄인다. 그다음은 최신, 그다음은 id 순 — 같은 입력이면
 * 같은 결과가 나와야 한다.
 */
/** 이 함수만 url·pair 를 요구한다 — SignalLike 를 넓히면 무관한 함수까지 끌려온다 */
export type StoryLike = SignalLike & { url: string; pair?: string[]; title?: string };

/**
 * 같은 기사인지 판단하기 위한 제목 키.
 *
 * 같은 기사가 매체 RSS 와 구글뉴스 RSS 양쪽으로 들어온다. url 이 다르고
 * (구글뉴스는 리다이렉트 주소다) 제목도 다르다 — 구글뉴스는 ` - The Hill` 을
 * 붙이고, 매체 쪽은 `&#8217;` 같은 엔티티를 그대로 준다. id 는 hash(url+title)
 * 이라 둘 다 통과해 **같은 헤드라인이 화면에 두 번 나갔다** (309건 중 32건).
 *
 * 엔티티를 푸는 대신 **지운다.** 푼 결과는 따옴표·대시라서 어차피 문장부호로
 * 지워지므로 결과가 같고, 디코딩 표를 이 파일과 checks.mts 에 복제하지 않아도
 * 된다 — 둘 다 값 import 가 금지돼 있어 복제 말고는 방법이 없다.
 *
 * 매체 접미사 규칙은 완벽하지 않다 — 제목이 ` - 짧은 말` 로 끝나면 그것도
 * 떨어진다. 키에는 관계쌍도 함께 들어가고, 실제 아카이브 309건에서 잘못 묶인
 * 것은 없었다.
 */
export function storyTitleKey(title: string): string {
  return title
    .replace(/&#?\w+;/g, ' ')                              // 엔티티는 풀지 않고 지운다
    .replace(/\s+[-\u2013|]\s+[^-\u2013|]{2,28}$/, ' ')  // " - The Hill"
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 같은 기사를 한 번만 남긴다. 키가 둘이라 두 번 훑는다.
 *
 *   1. url + 관계쌍 — 매체가 헤드라인만 고친 경우 (url 은 그대로다)
 *   2. 제목 + 관계쌍 — 다른 피드로 다시 들어온 경우 (url 이 다르다)
 *
 * 하나로 합칠 수 없다. 1 은 제목이 달라도 같다고 봐야 하고, 2 는 url 이 달라도
 * 같다고 봐야 한다 — 서로 반대 방향이다.
 */
export function dedupeByStory<T extends StoryLike>(signals: T[]): T[] {
  const byUrl = (s: StoryLike) => `${s.url}\u0000${pairPart(s)}`;
  // 제목이 없으면 합치지 않는다. 빈 키로 묶으면 서로 다른 기사가 한 건이 된다.
  const byTitle = (s: StoryLike) => {
    const t = storyTitleKey(s.title ?? '');
    return t ? `${t}\u0000${pairPart(s)}` : `\u0000${s.id}`;
  };
  return pickBest(pickBest(signals, byUrl), byTitle);
}

function pairPart(s: StoryLike): string {
  return [...(s.pair ?? [])].sort().join('|');
}

function pickBest<T extends StoryLike>(signals: T[], keyOf: (s: T) => string): T[] {
  const best = new Map<string, T>();
  for (const s of signals) {
    const key = keyOf(s);
    const prev = best.get(key);
    if (!prev || preferSignal(s, prev) < 0) best.set(key, s);
  }
  // 원래 순서를 지킨다 — 정렬은 호출부의 몫이다
  const keep = new Set([...best.values()].map((s) => s.id));
  return signals.filter((s) => keep.has(s.id));
}

/**
 * 음수면 a 를 남긴다.
 *
 * 분류된 것을 먼저 남기고, 그다음이 **확인 가능한 출처**다. 구글뉴스 리다이렉트는
 * 목적지도 매체도 확인할 수 없어 근거 패널에 넣지 못한다. 같은 기사가 매체
 * 주소로도 들어와 있다면 그쪽을 남기는 편이 언제나 낫다.
 */
function preferSignal(a: StoryLike, b: StoryLike): number {
  const ac = a.classified ? 0 : 1;
  const bc = b.classified ? 0 : 1;
  if (ac !== bc) return ac - bc;
  const ar = isRedirect(a.url) ? 1 : 0;
  const br = isRedirect(b.url) ? 1 : 0;
  if (ar !== br) return ar - br;
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id.localeCompare(b.id);
}

function isRedirect(url: string): boolean {
  return url.includes('news.google.com');
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
  fresh: boolean,
  lastDate?: string | null
): string {
  if (fresh) return candidate;
  if (!previous) return candidate;
  // 보존이 기본이지만, 데이터가 기록된 시각보다 새로우면 그대로 둘 수 없다.
  // 수집 시각이 최신 기사보다 이르면 감사가 meta.generatedAt.beforeData 로 잡는다.
  // 재처리라도 실제로 새 기사를 승격했다면 그건 수집이 있었다는 뜻이다.
  if (lastDate && previous.slice(0, 10) < lastDate) return candidate;
  return previous;
}
