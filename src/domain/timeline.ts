/**
 * 관계 시계열 도메인 — 순수 함수.
 *
 * 큐레이션 아크(HISTORY_ARCS)와 현재 시각을 인자로 받는다. 예전에는 둘 다
 * 모듈 전역이라, "이 입력이면 이 셀이 나와야 한다" 를 고정할 수 없었다.
 * 특히 현재 시각이 박혀 있으면 같은 테스트가 달이 바뀔 때 깨진다.
 *
 * 규칙: 이 파일은 타입 외의 런타임 import 를 갖지 않는다.
 */
import type { HistoryArc, NewsSignal } from '../types';
import type { LocalizedText } from '../types';

export type Pol = 'ally' | 'feud' | 'neutral';

export interface MonthCell {
  ym: string;
  polarity: Pol;
  note: LocalizedText | null;
  curated: boolean;
  flip: boolean;
  /**
   * 매체 간 판정이 갈렸거나, 이겼어도 2배에 못 미친 달.
   * 색은 그대로 두고 표시만 붙인다 — 불일치를 숨기고 한쪽을 고르는 것이 예전 동작이었다.
   */
  contested: boolean;
  /**
   * 이 달에 판정을 받지 못한 신호 수.
   * 아무 표시 없이 내보내면 "판정이 없다" 가 아니라 그냥 빈약한 항목으로 보인다.
   */
  unclassified: number;
}

/**
 * 하루 한 표.
 *
 * 같은 날 같은 쌍을 다섯 매체가 쓰면 예전에는 다섯 표였다. 그 다섯이 한 통신사
 * 기사를 받아쓴 것일 수도 있는데 구분할 방법이 없다. 아카이브 304건에서 같은 날
 * 같은 쌍 묶음이 41개, 결정적 표의 29%가 이 중복이었다.
 *
 * **제목 유사도로 사건을 나누지 않는다.** 재어 봤더니 양방향으로 틀린다 — 같은
 * 사건인데 0.10 인 경우("Trump blames Walz" 대 "Fact check: Trump baselessly
 * claims Walz")가 있고, 다른 사건인데 같은 날인 경우도 있다. 그래서 사건을
 * 탐지한다고 주장하지 않고 **하루를 하루로 센다.** 결정적이고 검증 가능하다.
 */
export interface DayUnit {
  date: string;
  /** 그날의 판정. 매체가 갈려 2/3 을 못 넘으면 null — 투표하지 않는다 */
  polarity: Pol | null;
  /** ally 와 feud 가 함께 나온 날 */
  contested: boolean;
  /**
   * 그날 **판정을 낸** 고유 매체 수. 중립·미분류만 쓴 매체는 세지 않는다 —
   * 세면 한 매체가 판정하고 다섯이 동반언급만 쓴 날이, 세 매체가 합의한 날보다
   * 무거워진다(1+ln 6 = 2.79 대 1+ln 3 = 2.10). 뒷받침의 뜻이 뒤집힌다.
   */
  outlets: number;
  /** 1 + ln(판정 매체 수). 다섯 매체가 다섯 표가 되지 않게 체감시킨다 */
  weight: number;
  /** 판정을 받지 못한 신호 수 — 화면이 "미판정" 을 셀 수 있게 남긴다 */
  unclassified: number;
  note: LocalizedText | null;
}

/** 하루 안에서 다수가 이 비율을 넘어야 그날의 판정으로 인정한다 */
const DAY_MAJORITY = 2 / 3;
/** 반전을 인정하는 배수. 불일치 표시도 같은 값을 쓴다 — 임계는 하나뿐이다 */
const DECISIVE_RATIO = 2;

/**
 * 그날을 설명할 요약을 고른다.
 *
 * 호출부가 **같은 날짜의 신호만** 넘기므로 날짜로 정렬할 것이 없다. 예전에는
 * 날짜 비교자로 정렬했는데, 모든 원소의 날짜가 같아 비교자가 언제나 -1 을 돌려줬다
 * (compare(a,b) 와 compare(b,a) 가 둘 다 음수인 잘못된 비교자였고, "최신 우선" 은
 * 실제로 이뤄진 적이 없다). 지금은 나중에 들어온 것을 고른다.
 */
function noteOf(signals: NewsSignal[], pol: Pol | null): LocalizedText | null {
  if (pol === null) return null; // 판정이 없는 날은 설명할 것도 없다
  // **id 로 정렬해 고른다.** 호출부가 넘기는 순서는 아카이브 적재 순서이고, 그건
  // `bySalience` 가 만든다 — 같은 날짜 두 건에 대해 양방향 모두 -1 을 돌려주는
  // 일관성 없는 비교자라 순서가 정해져 있지 않다. 정렬하지 않으면 같은 달의 툴팁이
  // 무관한 신호가 추가될 때마다 바뀐다.
  const ordered = [...signals].sort((x, y) => x.id.localeCompare(y.id));
  const pick =
    ordered.filter((s) => s.classified && (s.polarity ?? 'neutral') === pol).pop() ??
    ordered.filter((s) => s.classified).pop() ??
    ordered[ordered.length - 1];
  if (!pick) return null;
  return { en: pick.summary_en ?? pick.title, ko: pick.summary_ko ?? pick.title };
}

/**
 * 신호를 날짜로 묶어 하루 한 표로 만든다.
 *
 * 미분류 신호는 표를 만들지 않지만 그날이 존재했다는 사실은 남긴다 — 그래야
 * "판정이 없다" 와 "아무 일도 없었다" 가 구분된다.
 */
export function groupByDay(signals: NewsSignal[]): DayUnit[] {
  const byDate = new Map<string, NewsSignal[]>();
  for (const s of signals) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const units: DayUnit[] = [];
  for (const [date, list] of byDate) {
    // **매체를 센다. 기사가 아니다.** 기사 수로 세면 한 매체가 그날 세 건을 쓴 것만으로
    // 그 매체가 하루를 정한다 — 가중치를 매체 수로 체감시킨 이유가 사라진다.
    // 한 매체가 자기 안에서 갈리면 어느 쪽도 밀지 않는다.
    const byOutlet = new Map<string, { ally: number; feud: number }>();
    let unclassified = 0;
    for (const s of list) {
      if (!s.classified) {
        unclassified++;
        continue;
      }
      if (s.polarity !== 'ally' && s.polarity !== 'feud') continue;
      // 정본 이름으로 센다. 원본으로 세면 같은 뉴스룸이 이름만 달라도 각각 한 표다
      const key = s.outlet ?? s.source;
      const tally = byOutlet.get(key) ?? { ally: 0, feud: 0 };
      tally[s.polarity]++;
      byOutlet.set(key, tally);
    }
    let ally = 0;
    let feud = 0;
    /** 자기 안에서 갈려 어느 쪽도 밀지 않은 매체 */
    let split = 0;
    for (const t of byOutlet.values()) {
      if (t.ally > t.feud) ally++;
      else if (t.feud > t.ally) feud++;
      else split++;
    }

    const decisive = ally + feud;
    let polarity: Pol | null = null;
    let contested = false;
    if (decisive > 0) {
      const win: Pol | null = ally > feud ? 'ally' : feud > ally ? 'feud' : null;
      const share = win ? Math.max(ally, feud) / decisive : 0.5;
      if (win && share >= DAY_MAJORITY) polarity = win;
      else contested = true;
    } else if (split > 0) {
      // **모든 매체가 각자 안에서 갈린 날.** 표를 낸 매체가 하나도 없지만, 이건
      // "아무 일도 없었다" 가 아니라 가장 센 불일치다. 예전에는 여기로 떨어져
      // 조용한 중립이 됐다 — 화면이 가장 크게 말해야 할 날에 아무 말도 안 했다.
      contested = true;
      polarity = 'neutral';
    } else {
      // 결정적 판정이 없는 날. 중립이든 미분류든 셀을 회색으로 채운다
      polarity = 'neutral';
    }

    // **판정을 낸 매체만 센다.** 갈려서 어느 쪽도 밀지 않은 매체까지 세면, 한 매체가
    // 판정하고 다섯이 서로 갈린 날(1+ln 6 = 2.79)이 세 매체가 합의한 날(1+ln 3 = 2.10)
    // 보다 무거워진다 — 이 필드가 막으려던 바로 그 역전이다.
    const outlets = decisive;
    units.push({
      date,
      polarity,
      contested,
      outlets,
      // 판정이 없는 날은 표가 아니라 가중이 쓰이지 않는다. log(0) 을 막는 바닥만 둔다
      weight: 1 + Math.log(Math.max(1, outlets)),
      unclassified,
      note: noteOf(list, polarity),
    });
  }
  return units.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * 한 달의 하루 표들을 합쳐 셀 하나를 만든다.
 *
 * 예전에는 그 달 **첫 비중립 신호가 이겼다.** feud 와 ally 의 가중치가 같아서
 * "더 강한 극성 유지" 조건이 항상 거짓이었기 때문이다 — Jeffries×Trump 8월이
 * feud 5건 대 ally 2건인데 화면에는 ally 로 나갔다.
 *
 * 반전에는 이력을 둔다. 진짜 반전은 여러 매체가 여러 날 보도하므로 2배를 넘고,
 * 어그로 헤드라인 한 건은 못 넘는다.
 */
export function tallyMonth(
  units: DayUnit[],
  prev: Pol | null
): { polarity: Pol | null; contested: boolean } {
  let ally = 0;
  let feud = 0;
  let sawAny = false;
  let contested = false;
  for (const u of units) {
    sawAny = true;
    if (u.contested) contested = true;
    if (u.polarity === 'ally') ally += u.weight;
    else if (u.polarity === 'feud') feud += u.weight;
  }

  if (ally === 0 && feud === 0) return { polarity: sawAny ? 'neutral' : null, contested };

  const win: Pol | null = ally > feud ? 'ally' : feud > ally ? 'feud' : null;
  const hi = Math.max(ally, feud);
  const lo = Math.min(ally, feud);
  const clears = win !== null && hi >= DECISIVE_RATIO * lo;
  // **중립은 극이 아니다.** 이전 달이 조용했다는 이유로 이번 달의 다수를 반전으로
  // 취급하면, 같은 입력이 앞달의 조용함 여부만으로 다른 색이 된다.
  const isFlip = (prev === 'ally' || prev === 'feud') && win !== null && prev !== win;

  // 동률이거나, 반전인데 2배를 못 넘으면 이전 달을 지킨다
  if (win === null || (isFlip && !clears)) {
    return { polarity: prev ?? 'neutral', contested: true };
  }
  return { polarity: win, contested: contested || (lo > 0 && !clears) };
}

/** 기준 월. 인자로 받지 않으면 오늘 — 테스트가 시점을 고정할 수 있어야 한다 */
function currentYm(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * 페어의 월별 호불호 타임라인 (live 뉴스 신호 우선, 없으면 큐레이션 아크 forward-fill).
 * windowMonths 내 데이터가 전혀 없으면 null.
 */
export function buildPairTimeline(
  a: string,
  b: string,
  windowMonths: number,
  /** 아카이브에서 만든 pairKey → 신호 맵. 호출부가 먼저 loadArchive() 해야 한다 */
  byPair: Map<string, NewsSignal[]>,
  /** 큐레이션 아크. 도메인은 데이터셋을 직접 읽지 않는다 */
  arcs: HistoryArc[],
  /** 기준 시점 — 기본은 지금 */
  now: Date = new Date()
): { cells: MonthCell[]; flips: MonthCell[] } | null {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const live = byPair.get(key) ?? [];
  const arc = arcs.find(
    (h) => (h.a === a && h.b === b) || (h.a === b && h.b === a)
  );

  if (live.length === 0 && !arc) return null;

  const nowYm = currentYm(now);
  const start = addMonths(nowYm, -(windowMonths - 1));

  // live 월별 집계 — 하루 한 표로 묶어 가중 다수결, 반전에는 이력을 둔다.
  //
  // 창 이전의 달까지 훑고 나서 창 안의 것만 내보낸다. 반전 판정이 창 경계에서
  // 끊기면 창을 1년에서 3개월로 좁혔다는 이유만으로 같은 달의 색이 달라진다.
  const signalsByMonth = new Map<string, NewsSignal[]>();
  for (const s of live) {
    const ym = s.date.slice(0, 7);
    const list = signalsByMonth.get(ym);
    if (list) list.push(s);
    else signalsByMonth.set(ym, [s]);
  }

  const liveByMonth = new Map<
    string,
    { pol: Pol; note: LocalizedText | null; contested: boolean; unclassified: number }
  >();
  let prevLive: Pol | null = null;
  for (const ym of [...signalsByMonth.keys()].sort()) {
    const units = groupByDay(signalsByMonth.get(ym)!);
    const { polarity, contested } = tallyMonth(units, prevLive);
    // 이 달에 신호가 하나라도 있으면 tallyMonth 는 null 을 돌려주지 않는다
    // (signalsByMonth 에는 빈 달이 없다). 전부 중립인 달도 prevLive 를 갱신하고,
    // 그 값이 다음 달의 판정에 들어간다 — 중립은 극이 아니라 반전을 막지는 않는다.
    if (polarity === null) continue;
    prevLive = polarity;
    if (ym < start) continue;

    // 노트는 이긴 극성의 가장 최근 날에서 가져온다. **그 극성의 날이 하나도 없으면
    // 노트를 붙이지 않는다** — 이전 달을 물려받았거나 동률로 중립이 된 달에 반대편
    // 요약을 붙이면 셀 색과 설명이 서로 다른 말을 한다.
    const winning = units.filter((u) => u.polarity === polarity);
    const note = [...winning].reverse().find((u) => u.note !== null)?.note ?? null;
    liveByMonth.set(ym, {
      pol: polarity,
      note,
      contested,
      unclassified: units.reduce((n, u) => n + u.unclassified, 0),
    });
  }

  // curated forward-fill map
  const curPoints = arc ? [...arc.points].sort((x, y) => (x.ym < y.ym ? -1 : 1)) : [];

  const cells: MonthCell[] = [];
  // 윈도우 시작 이전의 마지막 큐레이션 포인트로 seed — 안 그러면 창 앞부분이 통째로 비고
  // 창 안에서 첫 변곡이 일어난 것처럼 보인다 (예: trump×musk 의 feud→ally 반전이 사라짐)
  const seed = [...curPoints].reverse().find((p) => p.ym < start);
  // 극성만 이어받는다. 노트는 일부러 들고 다니지 않는다 — 앞선 달의 요약을 빈 달에
  // 붙이면 그 달에 없던 사건을 설명하게 된다. 예전에는 note 를 담아 놓고 소비하는
  // 쪽이 전부 null 을 넣어, 다음 사람이 "버그" 로 보고 되살릴 여지가 있었다.
  // **출처도 함께 이어받는다.** 폴라리티만 들고 다니면, live 로 정해진 달 다음의
  // 빈 달이 `curated: true` 로 그려진다 — 화면과 범례는 그걸 "손으로 큐레이션한
  // 편집 판단" 이라고 말한다. 측정값을 편집 판단으로 둔갑시키는 것이라,
  // 이 저장소가 절대 섞지 말라고 적어 둔 그 구분이 깨진다.
  let carried: { pol: Pol; curated: boolean } | null = seed
    ? { pol: seed.polarity as Pol, curated: true }
    : null;
  const totalMonths = monthDiff(start, nowYm) + 1;

  for (let i = 0; i < totalMonths; i++) {
    const ym = addMonths(start, i);
    const liveEntry = liveByMonth.get(ym);
    const cp = curPoints.find((p) => p.ym === ym);

    if (liveEntry) {
      cells.push({
        ym,
        polarity: liveEntry.pol,
        note: liveEntry.note,
        curated: false,
        flip: false,
        contested: liveEntry.contested,
        unclassified: liveEntry.unclassified,
      });
      carried = { pol: liveEntry.pol, curated: false };
      continue;
    }
    if (cp) {
      carried = { pol: cp.polarity as Pol, curated: true };
      cells.push({
        ym,
        polarity: cp.polarity as Pol,
        note: cp.note,
        curated: true,
        flip: false,
        contested: false,
        unclassified: 0,
      });
      continue;
    }
    if (carried) {
      cells.push({
        ym,
        polarity: carried.pol,
        note: null,
        curated: carried.curated,
        flip: false,
        contested: false,
        unclassified: 0,
      });
    }
    // carried 없음(데이터 시작 전) → 셀 생략
  }

  // flip 마킹
  const flips: MonthCell[] = [];
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].polarity !== cells[i - 1].polarity) {
      cells[i].flip = true;
      flips.push(cells[i]);
    }
  }

  return cells.length ? { cells, flips } : null;
}

export function polColor(p: Pol): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#64748b';
}
