import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, SOURCE_NAME_ALIASES } from './config.mts';
import { decodeEntities } from '../sources/parse-core.mts';
import {
  accumulate as accumulatePure,
  dedupeByStory,
  bySalience,
  canonicalSourceName,
  buildStats as buildStatsPure,
  dateRange,
  partitionByMonth,
  pickRecent as pickRecentPure,
  resolveGeneratedAt,
} from './core.mts';
import type { Signal } from './extract.mts';

export interface SignalsStats {
  total: number;
  classified: number;
  ally: number;
  feud: number;
  neutral: number;
}

export interface SignalsFile {
  generatedAt: string;
  windowDays: number;
  stats: SignalsStats;
  signals: Signal[];
}

/**
 * 매니페스트 — 앱이 항상 즉시 읽는 작은 파일.
 * 월 목록과 인물별 건수를 들고 있어, 전체 아카이브를 받지 않고도
 * "이 인물 관련 기사 17건" 같은 표시가 가능하다.
 */
export interface SignalsIndex {
  generatedAt: string;
  windowDays: number;
  stats: SignalsStats;
  firstDate: string | null;
  lastDate: string | null;
  /** 최신순 'YYYY-MM' */
  months: string[];
  /** personId → 아카이브 전체 기준 건수 */
  counts: Record<string, number>;
  /** 매체명 → 아카이브 전체 기준 건수. 화면이 소스 구성을 표시하는 데 쓴다 */
  outlets: Record<string, number>;
}

const MONTH_RE = /^\d{4}-\d{2}\.json$/;
const RETENTION_DAYS = 365;

/**
 * 매체명을 알 수 없는 신호가 들어가는 자리.
 *
 * 피드가 매체명을 주지 않으면 `canonicalSourceName` 이 빈 문자열을 돌려준다.
 * 예전에는 그런 신호를 매체 집계에서 통째로 뺐는데, 화면은 건수를
 * `stats.total` 로 적고 비율은 이 집계의 합으로 나눈다 — 하나만 빠져도
 * **"302 signals" 위에 295 의 100%** 가 그려지고, 어디에도 에러가 남지 않는다.
 *
 * 그래서 버리지 않고 이 라벨로 센다. 미분류 신호를 지우지 않고 '미판정' 이라고
 * 적는 것과 같은 이유다 — 모르는 것은 모른다고 적어야 셈이 맞는다.
 * 빈 문자열을 키로 쓰지 않는 이유: 화면이 `name.length > 0` 으로 다시 걸러
 * 결국 같은 곳으로 되돌아간다.
 */
export const UNATTRIBUTED = 'Unattributed';

/** 화면이 즉시 필요로 하는 양 — 인물당 4건(드로어) + 전체 6건(인사이트) */
const PER_PERSON = 4;
const GLOBAL_RECENT = 6;

/**
 * 기존 아카이브 전체를 읽는다.
 * 월 파티션이 있으면 그것을, 없으면 예전 단일 파일을 읽어 이전 데이터를 잃지 않는다.
 */
export function readExisting(): SignalsFile | null {
  const dir = CONFIG.paths.signalsDir;
  const collected: Signal[] = [];
  let meta: Partial<SignalsFile> = {};

  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!MONTH_RE.test(name)) continue;
      try {
        const part = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as {
          signals?: Signal[];
        };
        for (const s of part.signals ?? []) collected.push(s);
      } catch {
        /* 깨진 파티션 하나가 전체 누적을 막지 않게 한다 */
      }
    }
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as SignalsFile;
    } catch {
      /* 매니페스트는 없어도 재생성된다 */
    }
  }

  if (collected.length === 0) {
    // 분할 이전 형식 — 마이그레이션 첫 실행에서 여기로 들어온다
    try {
      return JSON.parse(fs.readFileSync(CONFIG.paths.outJson, 'utf8')) as SignalsFile;
    } catch {
      return null;
    }
  }

  return {
    generatedAt: meta.generatedAt ?? new Date(0).toISOString(),
    windowDays: meta.windowDays ?? CONFIG.windowDays,
    stats: buildStats(collected),
    signals: collected,
  };
}

/** 기존 + 신규를 id 로 합치고 365일이 지난 것을 버린다 */
/**
 * 아카이브에 이미 들어간 제목의 엔티티를 푼다.
 *
 * 수집 단계(rssField)에서 풀게 했지만 그건 **앞으로 들어올 것**에만 듣는다.
 * 이미 쌓인 것은 365일 동안 `Trump&#8217;s` 인 채로 화면에 남는다 — 실제로
 * 5건이 그 상태였다. 게다가 중복 정리가 "확인 가능한 매체 주소" 를 우선하는데
 * 하필 그쪽이 엔티티 버전이라, 놔두면 **깨끗한 쪽이 지워지고 깨진 쪽이 남는다.**
 *
 * id 는 건드리지 않는다. id 는 hash(url+title) 이지만 저장된 값을 그대로 쓰고
 * 다시 계산하지 않는다 — 계산하면 쌓인 신호의 id 가 전부 달라져 다음 실행이
 * 아카이브를 두 배로 만든다. 다음 수집에서 같은 기사가 새 id 로 들어와도
 * url 이 같으므로 dedupeByStory 가 걷어낸다.
 */
function normalizeTitles(signals: Signal[]): Signal[] {
  return signals.map((s) =>
    s.title && /&#?\w+;/.test(s.title) ? { ...s, title: decodeEntities(s.title) } : s
  );
}

export function accumulate(existing: SignalsFile | null, incoming: Signal[]): Signal[] {
  // id 는 hash(url + title) 이라 매체가 헤드라인을 고치면 같은 기사가 다른 id 로
  // 두 번 쌓인다. id 로 합친 뒤 (url, 관계쌍) 으로 한 번 더 거른다.
  // 제목을 먼저 고르고 나서 중복을 본다. 순서가 반대면 엔티티가 남은 제목과
  // 풀린 제목이 서로 다른 기사로 보여 둘 다 살아남는다.
  return dedupeByStory(
    normalizeTitles(accumulatePure(existing?.signals ?? [], incoming, RETENTION_DAYS))
  );
}

const buildStats = buildStatsPure;

/**
 * 화면이 **매체를 셀 때** 쓸 정본 이름을 붙인다.
 *
 * 시계열은 "하루 한 표" 를 매체 단위로 세는데, 그 매체 정체성이 원본 `source`
 * 문자열이면 같은 뉴스룸이 이름만 달라도 각각 한 표를 던진다 — 아카이브에는
 * `Politico`·`POLITICO Pro`·`E&E News by POLITICO` 가 함께 있다. 그러면 한 뉴스룸이
 * 혼자 3분의 2 다수를 만들고 가중까지 부풀린다.
 *
 * `source` 는 그대로 둔다. 와이어 목록과 근거 표시는 기사에 실제로 적힌 이름을
 * 보여야 한다. 정본은 **집계용 별도 필드**로 두고, 원본과 같으면 아예 넣지 않는다 —
 * 302건에 같은 문자열을 한 번 더 쓸 이유가 없다.
 */
function withOutlet(signals: Signal[]): Signal[] {
  return signals.map((s) => {
    const canonical = outletOf(s);
    return canonical && canonical !== s.source ? { ...s, outlet: canonical } : s;
  });
}

/**
 * 집계용 매체 정체성 — **파생은 여기 한 곳에서만 한다.**
 *
 * `withOutlet` 이 이미 붙였으면 그 값을 쓰고, 아니면 지금 계산한다. 두 군데에서
 * 각자 계산하면 매니페스트의 분모(소스 구성)와 시계열의 투표 키가 서로 다른 분할을
 * 말할 수 있는데, 합계는 맞으니 감사는 통과한다. 호출 순서에 기대지도 않는다 —
 * `buildIndex` 가 `withOutlet` 뒤에 온다는 암묵적 전제는 언젠가 깨진다.
 */
function outletOf(s: Signal): string {
  return (
    s.outlet ?? canonicalSourceName(s.source ?? '', CONFIG.allowedSourceNames, SOURCE_NAME_ALIASES)
  );
}

export function buildFile(signals: Signal[], cap = CONFIG.maxSignals): SignalsFile {
  const sorted = withOutlet([...signals].sort(bySalience).slice(0, cap));
  return {
    generatedAt: new Date().toISOString(),
    windowDays: CONFIG.windowDays,
    stats: buildStats(sorted),
    signals: sorted,
  };
}

/**
 * 앱이 첫 화면에서 쓰는 몫만 고른다.
 * 인물 수에 비례하므로 아카이브가 1년치로 커져도 이 크기는 그대로다 —
 * 분할의 핵심이 여기에 있다.
 */
export function pickRecent(signals: Signal[]): Signal[] {
  return pickRecentPure(signals, PER_PERSON, GLOBAL_RECENT);
}

/**
 * 매니페스트를 만든다 — 앱이 아카이브를 받지 않고도 전체를 서술할 수 있는 만큼.
 *
 * `outlets` 는 "이 아카이브가 어느 매체로 이루어져 있는가" 다. 신뢰의 문제라서
 * 싣는다 — 극성 분포(feud 68%)는 관계의 분포가 아니라 **어느 매체를 얼마나 담았는가**
 * 에 딸려 온다. 그걸 숨긴 채 비율만 보여주면 읽는 사람이 판단할 재료가 없다.
 * 건수는 아카이브 전체 기준이다. recent.json 기준으로 세면 즉시 로드분의 구성이
 * 전체의 구성인 것처럼 보인다.
 *
 * generatedAt 은 인자로 받는다 — 보존이냐 갱신이냐는 resolveGeneratedAt 이 정할 일이고
 * 여기서 `new Date()` 를 부르면 재처리가 조용히 수집 시각을 갱신한다.
 */
export function buildIndex(file: SignalsFile, generatedAt: string, months: string[]): SignalsIndex {
  const { first, last } = dateRange(file.signals);
  const counts: Record<string, number> = {};
  for (const s of file.signals) for (const p of s.people) counts[p] = (counts[p] ?? 0) + 1;

  // 표시 이름만 정본으로 모은다. `Signal.source` 원본은 건드리지 않는다 —
  // 화면의 와이어 목록과 E2E 가 그 값을 쓴다.
  // 건수 내림차순으로 고정한다. 신호 순서를 그대로 따르면 정렬이 동점에서 흔들려
  // 데이터가 안 바뀐 날에도 매니페스트에 키 순서 diff 가 생긴다.
  const tally = new Map<string, number>();
  for (const s of file.signals) {
    // 이름을 못 찾아도 건너뛰지 않는다 — 합계가 stats.total 과 어긋나는 순간
    // 화면의 비율이 전부 거짓이 된다. audit 의 manifest.outlets 가 이걸 지킨다.
    // `outletOf` 하나로 모은다 — `withOutlet` 이 이미 붙였으면 그 값을 쓰고,
    // 아니면 같은 규칙으로 지금 계산한다. 호출 순서에 기대지 않는다.
    const name = outletOf(s).trim() || UNATTRIBUTED;
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const outlets: Record<string, number> = {};
  for (const [name, n] of [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    outlets[name] = n;
  }

  return {
    generatedAt,
    windowDays: file.windowDays,
    stats: file.stats,
    firstDate: first,
    lastDate: last,
    months,
    counts,
    outlets,
  };
}

/**
 * 월별 파티션 + 매니페스트 + 즉시 로드분으로 나눠 쓴다.
 * 예전 단일 파일은 지운다 — 남겨두면 번들에 두 벌이 들어간다.
 *
 * generatedAt 은 "뉴스를 실제로 수집한 시각" 이다. 분할·정규화 같은 재처리에서
 * 이 값이 갱신되면 화면의 신선도 배지가 거짓말을 한다(재처리 시각을 수집 시각으로
 * 표시). 그래서 기본값은 "기존 값 유지" 이고, 실제로 수집한 경우에만 fresh 를 준다.
 */
export function writeOutput(file: SignalsFile, dry: boolean, opts: { fresh?: boolean } = {}): string {
  if (dry) {
    const p = 'scripts/news-pipeline/.dry-output.json';
    fs.writeFileSync(p, JSON.stringify(file, null, 0));
    console.log(`[merge] DRY → ${p} (${file.stats.total} signals)`);
    return p;
  }

  const dir = CONFIG.paths.signalsDir;
  fs.mkdirSync(dir, { recursive: true });

  let previous: string | null = null;
  try {
    previous = (JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
      generatedAt?: string;
    }).generatedAt ?? null;
  } catch {
    /* 매니페스트가 없으면 넘어온 값을 그대로 쓴다 */
  }
  // 재처리는 수집 시각을 건드리지 않는다. 실제 수집만 `{ fresh: true }` 를 준다.
  const generatedAt = resolveGeneratedAt(previous, file.generatedAt, opts.fresh ?? false);

  const byMonth = partitionByMonth(file.signals);

  // 이번에 안 나온 달의 파일은 지운다 (365일 창을 벗어난 달)
  for (const name of fs.readdirSync(dir)) {
    if (MONTH_RE.test(name) && !byMonth.has(name.replace('.json', ''))) {
      fs.unlinkSync(path.join(dir, name));
    }
  }

  const months = [...byMonth.keys()].sort().reverse();
  for (const m of months) {
    const list = byMonth.get(m)!.sort(bySalience);
    fs.writeFileSync(
      path.join(dir, `${m}.json`),
      JSON.stringify({ month: m, signals: list }, null, 1) + '\n'
    );
  }

  const index = buildIndex(file, generatedAt, months);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1) + '\n');

  const recent = pickRecent(file.signals);
  fs.writeFileSync(
    path.join(dir, 'recent.json'),
    JSON.stringify({ signals: recent }, null, 1) + '\n'
  );

  if (fs.existsSync(CONFIG.paths.outJson)) fs.unlinkSync(CONFIG.paths.outJson);

  console.log(
    `[merge] wrote ${dir} — ${months.length}개월 · 전체 ${file.stats.total} · 즉시로드 ${recent.length}`
  );
  return dir;
}
