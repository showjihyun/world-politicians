import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.mts';
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

/** 화면이 즉시 필요로 하는 양 — 인물당 4건(드로어) + 전체 6건(인사이트) */
const PER_PERSON = 4;
const GLOBAL_RECENT = 6;

/** 분류·비중립을 앞세우고 그 안에서 최신순 */
function rank(s: Signal): number {
  return s.classified && s.polarity !== 'neutral' ? 0 : 1;
}
function bySalience(a: Signal, b: Signal): number {
  return rank(a) - rank(b) || (a.date < b.date ? 1 : -1);
}

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
  const map = new Map<string, Signal>();
  for (const s of existing?.signals ?? []) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  const cutoff = Date.now() - 365 * 86_400_000;
  return [...map.values()].filter((s) => {
    const ts = new Date(`${s.date}T00:00:00Z`).getTime();
    return Number.isNaN(ts) || ts >= cutoff;
  });
}

function buildStats(signals: Signal[]): SignalsStats {
  return {
    total: signals.length,
    classified: signals.filter((s) => s.classified).length,
    ally: signals.filter((s) => s.polarity === 'ally').length,
    feud: signals.filter((s) => s.polarity === 'feud').length,
    neutral: signals.filter((s) => !s.classified || s.polarity === 'neutral').length,
  };
}

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
  const sorted = [...signals].sort(bySalience);
  const keep = new Set<string>();
  const perPerson = new Map<string, number>();

  for (const s of sorted) {
    for (const p of s.people) {
      const n = perPerson.get(p) ?? 0;
      if (n < PER_PERSON) {
        perPerson.set(p, n + 1);
        keep.add(s.id);
      }
    }
  }
  for (const s of sorted.slice(0, GLOBAL_RECENT)) keep.add(s.id);

  return sorted.filter((s) => keep.has(s.id));
}

/**
 * 월별 파티션 + 매니페스트 + 즉시 로드분으로 나눠 쓴다.
 * 예전 단일 파일은 지운다 — 남겨두면 번들에 두 벌이 들어간다.
 */
export function writeOutput(file: SignalsFile, dry: boolean): string {
  if (dry) {
    const p = 'scripts/news-pipeline/.dry-output.json';
    fs.writeFileSync(p, JSON.stringify(file, null, 0));
    console.log(`[merge] DRY → ${p} (${file.stats.total} signals)`);
    return p;
  }

  const dir = CONFIG.paths.signalsDir;
  fs.mkdirSync(dir, { recursive: true });

  const byMonth = new Map<string, Signal[]>();
  for (const s of file.signals) {
    const m = (s.date ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(s);
  }

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
    generatedAt: file.generatedAt,
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
