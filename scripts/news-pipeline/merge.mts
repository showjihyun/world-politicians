import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mts';
import {
  accumulate as accumulatePure,
  dedupeByStory,
  bySalience,
  buildStats as buildStatsPure,
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
}

const MONTH_RE = /^\d{4}-\d{2}\.json$/;
const RETENTION_DAYS = 365;

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
export function accumulate(existing: SignalsFile | null, incoming: Signal[]): Signal[] {
  // id 는 hash(url + title) 이라 매체가 헤드라인을 고치면 같은 기사가 다른 id 로
  // 두 번 쌓인다. id 로 합친 뒤 (url, 관계쌍) 으로 한 번 더 거른다.
  return dedupeByStory(accumulatePure(existing?.signals ?? [], incoming, RETENTION_DAYS));
}

const buildStats = buildStatsPure;

export function buildFile(signals: Signal[], cap = CONFIG.maxSignals): SignalsFile {
  const sorted = [...signals].sort(bySalience).slice(0, cap);
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

  const dates = file.signals.map((s) => s.date).filter(Boolean).sort();
  const counts: Record<string, number> = {};
  for (const s of file.signals) for (const p of s.people) counts[p] = (counts[p] ?? 0) + 1;

  const index: SignalsIndex = {
    generatedAt,
    windowDays: file.windowDays,
    stats: file.stats,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    months,
    counts,
  };
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
