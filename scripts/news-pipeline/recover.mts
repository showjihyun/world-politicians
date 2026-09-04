/**
 * 지워진 분류를 git 이력에서 되살린다.
 *
 * 왜 필요한가: `accumulate` 가 incoming 을 id 로 무조건 덮어쓰던 시절, 30일 창
 * 안에서 재수집된 기사의 LLM 배치가 실패하면 아카이브에 있던 판정이
 * `classified: false` 로 지워졌다. 2026-09-01 수집에서 라벨 표본 10건이 전부
 * 판정을 잃었다. 원인은 core.mts 에서 막았지만, **이미 지워진 것은 돌아오지
 * 않는다** — 파이프라인은 새로 수집한 기사만 분류하기 때문이다.
 *
 * 저장소가 곧 DB 다(ADR 0002). 야간 커밋 하나하나가 스냅샷이므로 지워지기 전
 * 판정이 이전 커밋의 파티션에 그대로 남아 있다. 그것을 도로 가져온다.
 *
 * 안전 장치:
 *   - id 는 hash(url + title) 이지만 그것만 믿지 않는다. **id · url · title 이
 *     모두 일치할 때만** 복구한다. 하나라도 다르면 건너뛰고 이유를 센다
 *   - 복구하는 것은 판정뿐이다: polarity·confidence·summary_en·summary_ko·
 *     evidence·pair·classified. date·url·title·source 는 현재 값을 지킨다 —
 *     엔티티 정규화·제목 수정 같은 뒤의 재처리를 되돌리면 안 된다
 *   - 가장 최근 커밋의 분류된 값을 쓴다. 재분류가 여러 번 있었으면 마지막 것이 맞다
 *   - `writeOutput` 에 fresh 를 주지 않는다. 이것은 수집이 아니라 재처리이므로
 *     `generatedAt` 이 갱신되면 화면의 신선도 배지가 거짓말을 한다
 *
 *   npm run news:recover:dry   무엇이 복구되는지만 본다 (쓰지 않는다)
 *   npm run news:recover       반영한다
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CONFIG } from './config.mts';
import { buildFile, writeOutput, readExisting, type SignalsFile } from './merge.mts';
import { dedupeByStory } from './core.mts';
import { validate } from './validate.mts';
import type { Signal } from './extract.mts';

const dry = process.argv.includes('--dry');
const ROOT = path.resolve(import.meta.dirname, '../..');
const TRACKED_DIR = 'src/data/signals';
const MONTH_RE = /(^|\/)\d{4}-\d{2}\.json$/;

/**
 * 아카이브 보관 기간과 같다. 이보다 오래된 커밋에만 있던 판정은 지금 아카이브에
 * 남아 있을 수 없다 — 그 신호는 이미 365일 창 밖으로 빠졌다. 되살릴 것이 없는
 * 커밋을 훑는 셈이라 상한을 여기에 둔다.
 */
const SCAN_DAYS = 365;

/**
 * 날짜 상한과 별개로 두는 커밋 수 상한.
 *
 * 커밋 하나마다 `git ls-tree` 한 번 + 파티션 수만큼 `git show` 를 부른다.
 * 아카이브가 1년치로 차면 13개 파티션 × 매일 한 커밋이라 프로세스가 수천 개가
 * 되고, Windows 에서는 그 자체가 느리다. 하루 한 번 도는 야간 작업이 남긴
 * 이력이라 넉넉히 잡아도 이 정도면 최근 넉 달을 덮는다.
 */
const SCAN_LIMIT = 120;

/** 판정에 해당하는 필드. 나머지(date·url·title·source)는 현재 값이 정본이다 */
const VERDICT_FIELDS = [
  'polarity',
  'confidence',
  'summary_en',
  'summary_ko',
  'evidence',
  'pair',
] as const;

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * 이 디렉터리를 건드린 커밋, 최신순. 상한을 넘기면 거기서 자른다.
 *
 * 자를 수밖에 없는 이유: 아래 탐색의 조기 종료(`wanted.size === found.size`)는
 * **전부** 찾았을 때만 걸린다. `stuck` 을 따로 세는 데서 보듯 못 찾는 건이 있는
 * 것이 정상이라, 상한이 없으면 사실상 매번 전체 이력을 훑는다.
 *
 * 어디서 멈췄는지는 반드시 돌려준다. 조용히 덜 찾고 "이력에도 없다" 고 적으면
 * 그것이 이 스크립트가 내놓는 **거짓 결론**이 된다.
 */
function candidateCommits(): { commits: string[]; total: number; stoppedAt: string | null } {
  const parse = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const all = parse(git(['log', '--format=%H', '--', TRACKED_DIR]));
  const since = new Date(Date.now() - SCAN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const withinWindow = parse(git(['log', `--since=${since}`, '--format=%H', '--', TRACKED_DIR]));
  const commits = withinWindow.slice(0, SCAN_LIMIT);

  const stoppedAt =
    commits.length < withinWindow.length
      ? `커밋 ${SCAN_LIMIT}개 상한`
      : withinWindow.length < all.length
        ? `보관 기간(${SCAN_DAYS}일, ${since} 이후) 밖`
        : null;
  return { commits, total: all.length, stoppedAt };
}

/** 그 커밋 시점의 월 파티션 전체를 읽는다. 없거나 깨졌으면 조용히 건너뛴다 */
function signalsAt(commit: string): Signal[] {
  let listing: string;
  try {
    listing = git(['ls-tree', '--name-only', '-r', commit, '--', TRACKED_DIR]);
  } catch {
    return [];
  }
  const out: Signal[] = [];
  for (const file of listing.split('\n').map((l) => l.trim()).filter((l) => MONTH_RE.test(l))) {
    try {
      const part = JSON.parse(git(['show', `${commit}:${file}`])) as { signals?: Signal[] };
      for (const s of part.signals ?? []) out.push(s);
    } catch {
      /* 깨진 파티션 하나가 나머지 복구를 막지 않게 한다 */
    }
  }
  return out;
}

const existing = readExisting();
if (!existing) {
  console.error('[recover] 아카이브를 읽지 못했다');
  // 맨 앞 가드다 — 아직 아무것도 시작하지 않았으므로 여기서는 exit() 가 맞다
  process.exit(1);
}

const current = existing.signals;
const missing = current.filter((s) => !s.classified);
console.log(
  `[recover] 아카이브 ${current.length}건 · 미분류 ${missing.length}건` +
    (current.length ? ` (${((100 * missing.length) / current.length).toFixed(1)}%)` : '')
);

const wanted = new Map(missing.map((s) => [s.id, s]));
const found = new Map<string, { signal: Signal; commit: string }>();
/** 같은 id 로 분류된 값을 찾았지만 url·title 이 달라 쓰지 않은 것 */
const mismatched = new Map<string, string>();

const { commits, total: commitTotal, stoppedAt } = candidateCommits();
for (const commit of commits) {
  if (wanted.size === found.size) break;
  for (const past of signalsAt(commit)) {
    if (!past.classified) continue;
    const now = wanted.get(past.id);
    if (!now || found.has(past.id)) continue;
    if (past.url !== now.url || past.title !== now.title) {
      // id 가 같아도 url·title 이 다르면 같은 기사라고 단정하지 않는다
      if (!mismatched.has(past.id)) {
        mismatched.set(past.id, past.url !== now.url ? 'url' : 'title');
      }
      continue;
    }
    found.set(past.id, { signal: past, commit });
  }
}

console.log(
  `[recover] 후보 커밋 ${commits.length}개${
    stoppedAt ? ` (이력 ${commitTotal}개 중 — ${stoppedAt}에서 멈췄다)` : ''
  } · 복구 가능 ${found.size}건`
);
for (const [id, { signal, commit }] of found) {
  const title = (wanted.get(id)!.title ?? '').slice(0, 62);
  console.log(`  ${commit.slice(0, 7)}  ${id}  ${signal.polarity}  ${title}`);
}
if (mismatched.size) {
  // 값이 아니라 **사유 종류**를 적는다. 신호마다 한 토큰을 이어붙이면
  // `url·url·url·…·title` 이 되어, 왜 복구가 안 됐는지 알려주는 유일한 표면이
  // 건수만 두 번 말하는 줄로 바뀐다.
  const reasons = [...new Set(mismatched.values())].sort();
  console.log(`[recover] id 는 같지만 ${reasons.join('·')} 이 달라 건너뜀 ${mismatched.size}건`);
}
const stuck = missing.filter((s) => !found.has(s.id));
console.log(`[recover] 이력에도 판정이 없는 것 ${stuck.length}건 — reclassify 가 다시 시도할 몫이다`);
if (stoppedAt && stuck.length) {
  // "이력에도 없다" 는 훑은 범위 안에서의 이야기다. 범위를 잘랐으면 그 사실을
  // 결론 옆에 붙여야 한다 — 안 그러면 덜 찾은 것이 없는 것으로 읽힌다.
  console.log(
    `[recover] 다만 이력을 끝까지 보지 않았다 — ${stoppedAt}에서 멈췄다 (커밋 ${commits.length}/${commitTotal}개)`
  );
}

const recovered: Signal[] = current.map((s) => {
  const hit = found.get(s.id);
  if (!hit) return s;
  const merged: Signal = { ...s, classified: true };
  for (const f of VERDICT_FIELDS) {
    const v = hit.signal[f];
    if (v !== undefined) (merged as Record<string, unknown>)[f] = v;
  }
  return merged;
});

// 중복 거르기는 **판정을 얹은 뒤** 최종 데이터에 건다. 중복 키에는 관계쌍이
// 들어가는데, 미분류 신호는 쌍이 비어 있어 예전 거르기를 통과했다. 여기서 쌍을
// 되살리면 이미 있던 신호와 같은 키가 되어 같은 기사가 화면에 두 번 나간다 —
// 실제로 이 스크립트를 처음 돌렸을 때 `signals.duplicate` 가 2건 걸렸다.
// (`audit/convention-rules.mts` 의 reclassify-dedupe 와 같은 이유다)
const deduped = dedupeByStory(recovered);
if (deduped.length !== recovered.length) {
  const kept = new Set(deduped.map((s) => s.id));
  const dropped = recovered.filter((s) => !kept.has(s.id));
  console.log(
    `[recover] 판정을 되살리자 중복이 드러났다 ${dropped.length}건 — ` +
      `${recovered.length} → ${deduped.length} (${((100 * dropped.length) / recovered.length).toFixed(1)}% 제거)`
  );
  for (const s of dropped) console.log(`  drop ${s.id}  ${(s.title ?? '').slice(0, 62)}`);
}

const file: SignalsFile = buildFile(deduped, CONFIG.maxArchive);
console.log(
  `[recover] 미분류 ${missing.length} → ${file.stats.total - file.stats.classified}건 ` +
    `(분류 ${existing.stats.classified} → ${file.stats.classified} · 전체 ${current.length} → ${file.stats.total})`
);

// fresh 를 주지 않는다. 수집이 아니라 재처리다 — generatedAt 은 보존되어야 한다.
writeOutput(file, dry);
if (!validate(file, dry)) process.exitCode = 1;
