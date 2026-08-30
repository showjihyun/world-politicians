/**
 * 정확도 측정 — 순수 함수.
 *
 * 이 저장소에는 LLM 판정(극성·관계쌍)의 정확도를 재는 장치가 없었다. 신호 299건이
 * 전부 판정을 달고 화면에 나가는데 얼마나 맞는지 아무도 몰랐다. 프롬프트를 고치고
 * "좋아졌다" 고 믿는 것을 막으려면 고정된 정답이 있어야 한다.
 *
 * 설계에서 지켜야 하는 것 둘.
 *
 * **표본은 결정적이어야 한다.** 매번 다른 기사를 뽑으면 점수가 흔들려서 프롬프트
 * 변경의 효과와 표본 운의 차이를 구분할 수 없다. 시드로 고정한다.
 *
 * **라벨은 스냅샷을 들고 있어야 한다.** 신호는 365일이 지나면 아카이브에서 빠진다.
 * id 만 들고 있으면 그때 라벨이 통째로 죽는다. 채점에 필요한 것을 라벨 파일 안에
 * 복사해 둔다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export type Polarity = 'ally' | 'feud' | 'neutral';

export interface SignalLike {
  id: string;
  url: string;
  title: string;
  source: string;
  date: string;
  pair?: [string, string] | string[];
  polarity?: string;
  classified?: boolean;
}

export interface LabelRow {
  id: string;
  /** 채점에 필요한 것을 복사해 둔다 — 원본이 아카이브에서 빠져도 살아 있어야 한다 */
  url: string;
  title: string;
  source: string;
  date: string;
  pair: string[];
  /** 파이프라인이 내린 판정 */
  model: { polarity: string | null; classified: boolean };
  /** 사람이 채우는 칸. null 이면 아직 안 봤다는 뜻이고 채점에서 제외된다 */
  truth: { polarity: Polarity | null; pairCorrect: boolean | null };
  note: string;
}

/** 문자열을 32비트 정수로 — 시드용 */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 같은 입력이면 같은 순서를 내는 셔플 (mulberry32) */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 층으로 나눈다.
 *
 * 극성만으로 나누면 표본이 Trump 로 쏠린다 — feud 146건 중 108건이 Trump 관련이다.
 * 허브 여부를 함께 봐야 "허브가 아닌 관계에서도 맞는가" 를 잴 수 있다.
 */
export function stratumOf(s: SignalLike, hubs: Set<string>): string {
  const pol = s.classified ? (s.polarity ?? 'none') : 'unclassified';
  const hub = (s.pair ?? []).some((p) => hubs.has(p)) ? 'hub' : 'rest';
  return `${pol}:${hub}`;
}

/**
 * 층별로 고르게 뽑는다.
 *
 * 층마다 최소 `floor` 개를 채우고 남은 자리를 크기 순으로 나눈다. 비례 배분만 하면
 * 드문 층(neutral·미분류)이 한두 건만 들어와 그 층의 정확도를 못 잰다.
 */
export function sampleSignals(
  signals: SignalLike[],
  size: number,
  hubs: Set<string>,
  seed: number,
  floor = 8
): SignalLike[] {
  const groups = new Map<string, SignalLike[]>();
  for (const s of signals) {
    const k = stratumOf(s, hubs);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  // 층 이름 순으로 돌려 결정적으로 만든다
  const keys = [...groups.keys()].sort();
  const picked: SignalLike[] = [];
  const rest = new Map<string, SignalLike[]>();

  for (const k of keys) {
    const shuffled = seededShuffle(groups.get(k)!, seed ^ hashSeed(k));
    picked.push(...shuffled.slice(0, floor));
    rest.set(k, shuffled.slice(floor));
  }
  // 남은 자리는 층이 큰 순서로 채운다
  const remaining = keys
    .flatMap((k) => rest.get(k)!.map((s) => ({ k, s })))
    .sort((x, y) => (rest.get(y.k)!.length - rest.get(x.k)!.length) || x.s.id.localeCompare(y.s.id));
  for (const { s } of remaining) {
    if (picked.length >= size) break;
    picked.push(s);
  }
  return picked.slice(0, size).sort((a, b) => a.id.localeCompare(b.id));
}

export function toLabelRow(s: SignalLike): LabelRow {
  return {
    id: s.id,
    url: s.url,
    title: s.title,
    source: s.source,
    date: s.date,
    pair: [...(s.pair ?? [])],
    model: { polarity: s.classified ? (s.polarity ?? null) : null, classified: Boolean(s.classified) },
    truth: { polarity: null, pairCorrect: null },
    note: '',
  };
}

/**
 * 기존 라벨을 지키면서 새 표본을 얹는다.
 *
 * 재실행이 사람 작업을 덮으면 안 된다 — 아카이브를 덮어쓰지 않는 것과 같은 이유다.
 * 이미 채운 칸은 그대로 두고, 표본에서 빠진 것도 버리지 않는다(라벨은 많을수록 좋다).
 */
export function mergeLabels(existing: LabelRow[], fresh: LabelRow[]): LabelRow[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of fresh) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 사람이 적은 값을 읽는다.
 *
 * 대소문자와 앞뒤 공백은 봐준다 — `Feud` 와 `feud ` 는 뜻이 분명하다. 하지만
 * `conflict` 처럼 목록에 없는 값은 **봐주지 않는다.** 조용히 오답으로 세면
 * 모델이 맞았는데 점수가 떨어지고, 그 상태로 기준선을 잡으면 기준선이 낮게
 * 박혀 진짜 하락을 영영 못 잡는다.
 */
export function readPolarity(v: unknown): Polarity | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return t === 'ally' || t === 'feud' || t === 'neutral' ? t : null;
}

/** true/false 만 받는다. 'y' 나 1 을 봐주기 시작하면 어디까지가 참인지 흐려진다 */
export function readPairCorrect(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export interface InvalidLabel {
  id: string;
  field: 'polarity' | 'pairCorrect';
  value: string;
}

/** 적었는데 읽히지 않는 칸 — 빈 칸(null)과 구분해서 돌려준다 */
export function invalidLabels(rows: LabelRow[]): InvalidLabel[] {
  const out: InvalidLabel[] = [];
  for (const r of rows) {
    const p = r.truth.polarity as unknown;
    if (p !== null && p !== undefined && readPolarity(p) === null) {
      out.push({ id: r.id, field: 'polarity', value: String(p) });
    }
    const c = r.truth.pairCorrect as unknown;
    if (c !== null && c !== undefined && readPairCorrect(c) === null) {
      out.push({ id: r.id, field: 'pairCorrect', value: String(c) });
    }
  }
  return out;
}

export interface Score {
  /** 적었는데 읽히지 않은 칸 */
  invalid: number;
  labeled: number;
  pending: number;
  polarity: {
    scored: number;
    correct: number;
    accuracy: number;
    confusion: Record<string, number>;
  };
  pair: { scored: number; correct: number; accuracy: number };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * 채점한다.
 *
 * 사람이 안 본 행(truth 가 null)은 **제외**한다. 0 으로 세면 라벨링이 덜 된 것과
 * 모델이 틀린 것이 섞여서 점수가 의미를 잃는다.
 */
export function score(rows: LabelRow[]): Score {
  const labeled = rows.filter(
    (r) => readPolarity(r.truth.polarity) !== null || readPairCorrect(r.truth.pairCorrect) !== null
  );
  const confusion: Record<string, number> = {};

  // 읽히지 않는 값은 채점하지 않는다. 오답으로 세면 기준선이 낮게 박힌다.
  const polRows = rows.filter((r) => readPolarity(r.truth.polarity) !== null && r.model.classified);
  let polCorrect = 0;
  for (const r of polRows) {
    const got = r.model.polarity ?? 'none';
    const want = readPolarity(r.truth.polarity)!;
    if (got === want) polCorrect++;
    const k = `${want}→${got}`;
    confusion[k] = (confusion[k] ?? 0) + 1;
  }

  const pairRows = rows.filter((r) => readPairCorrect(r.truth.pairCorrect) !== null);
  const pairCorrect = pairRows.filter((r) => r.truth.pairCorrect === true).length;

  const bad = invalidLabels(rows);
  return {
    labeled: labeled.length,
    pending: rows.length - labeled.length - bad.length,
    invalid: bad.length,
    polarity: {
      scored: polRows.length,
      correct: polCorrect,
      accuracy: pct(polCorrect, polRows.length),
      confusion,
    },
    pair: { scored: pairRows.length, correct: pairCorrect, accuracy: pct(pairCorrect, pairRows.length) },
  };
}

/**
 * 기준선 대비 판정.
 *
 * 절대 점수로 실패시키지 않는다 — 처음에는 기준선을 모른다. 한 번 정한 뒤
 * **떨어지면** 잡는다. 표본이 작을 때 1~2건 차이로 깨지지 않게 여유를 둔다.
 */
export function verdictAgainst(
  s: Score,
  baseline: { polarity: number | null; pair: number | null } | null,
  tolerance = 3
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!baseline) return { ok: true, reasons };
  if (baseline.polarity !== null && s.polarity.scored > 0 && s.polarity.accuracy < baseline.polarity - tolerance) {
    reasons.push(`극성 정확도 ${s.polarity.accuracy}% < 기준선 ${baseline.polarity}% (허용 -${tolerance})`);
  }
  if (baseline.pair !== null && s.pair.scored > 0 && s.pair.accuracy < baseline.pair - tolerance) {
    reasons.push(`관계쌍 정확도 ${s.pair.accuracy}% < 기준선 ${baseline.pair}% (허용 -${tolerance})`);
  }
  return { ok: reasons.length === 0, reasons };
}
