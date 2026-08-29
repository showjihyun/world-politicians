/**
 * 스크립트 관례 판정 규칙 — 순수 함수.
 *
 * 데이터를 덮어쓰는 스크립트는 반드시 미리보기가 가능해야 한다. 이 관례가 없으면
 * 결과를 보기 전에 반영하게 되고, 되돌리려면 git 을 뒤져야 한다. 실제로 근거
 * 필터가 802 → 381(52% 제거)이었는데, 이 수치를 먼저 보지 않았다면 판단할 근거
 * 없이 반영됐을 것이다.
 *
 * 방향도 하나여야 한다. 예전에는 `collect.mts` 가 `--fetch` 로 부작용을 켜고
 * 나머지는 `--dry` 로 껐다. 축이 반대라 어느 쪽이 안전한지 매번 확인해야 했다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export interface ScriptFacts {
  file: string;
  /** 추적되는 데이터를 쓰는가 (캐시·스크래치는 제외) */
  writes: boolean;
  /** argv 에서 --dry 를 읽는가 (진입점) */
  readsDry: boolean;
  /** 쓰기가 dry 로 막히는가 (상수 분기 또는 인자 전달) */
  guardsWrite: boolean;
}

export interface ConventionViolation {
  file: string;
  rule: string;
  reason: string;
}

const WRITE_CALL = /\b(writeFileSync|writeOutput|unlinkSync|rmSync)\s*\(/;

/**
 * 캐시는 데이터가 아니다.
 * `.raw-cache.json` 같은 gitignore 대상 스크래치에까지 --dry 를 요구하면
 * 규칙이 실제 위험(추적되는 데이터 덮어쓰기)을 흐린다.
 */
const SCRATCH = /[Cc]ache|dry-output|\.bk|\.tmp|tmpdir/;

/** 주석 안의 언급은 사실로 세지 않는다 */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
}

export function readScriptFacts(file: string, source: string): ScriptFacts {
  const code = stripComments(source);

  const dataWrites = code
    .split('\n')
    .filter((l) => WRITE_CALL.test(l))
    .filter((l) => !SCRATCH.test(l));

  const readsDry = /process\.argv\.includes\(\s*['"]--dry['"]\s*\)/.test(code);

  // 가드는 세 형태가 있다. 하나라도 인정하지 않으면 멀쩡한 코드가 위반으로 잡힌다.
  //   상수 분기  if (DRY) { ... } else { write }        — collect.mts
  //   인자 정의  function writeOutput(file, dry: boolean) — merge.mts
  //   인자 전달  writeOutput(file, dry, ...)             — pipeline.mts, finalize.mts
  // 마지막 형태에서는 dry 가 쓰기 함수까지 흘러가므로 실질적으로 막힌다.
  const hasDryBranch = /\bif\s*\(\s*!?\s*(DRY|dry|isDry)\b/.test(code);
  const takesDryParam = /\bdry\s*[?]?\s*:\s*boolean\b/.test(code);
  const passesDry = /\bwriteOutput\s*\([^)]*\bdry\b/.test(code);

  return {
    file,
    writes: dataWrites.length > 0,
    readsDry,
    guardsWrite: hasDryBranch || takesDryParam || passesDry,
  };
}

export function checkDryConvention(facts: ScriptFacts[]): ConventionViolation[] {
  const out: ConventionViolation[] = [];

  for (const f of facts) {
    if (!f.writes) continue;

    // 진입점은 argv 에서 --dry 를 읽고, 모듈은 인자로 받는다.
    // 둘 중 아무 수단도 없으면 미리보기가 불가능하다.
    if (!f.guardsWrite) {
      out.push({
        file: f.file,
        rule: '--dry 필수',
        reason: f.readsDry
          ? '--dry 를 읽지만 쓰기가 분기 밖에 있다 — 플래그가 무력하다'
          : '데이터를 쓰는데 미리보기 수단이 없다. 반영 전에 결과를 볼 수 없으면 되돌리기 어렵다',
      });
    }
  }

  return out;
}

/** 부작용을 "켜는" 반대 방향 플래그가 새로 생기지 않게 한다 — 방향은 하나여야 한다 */
export function checkFlagDirection(
  file: string,
  source: string,
  allowed: readonly string[]
): ConventionViolation[] {
  const code = stripComments(source);
  const flags = [...code.matchAll(/process\.argv\.includes\(\s*['"](--[a-z-]+)['"]\s*\)/g)].map(
    (m) => m[1]
  );
  return [...new Set(flags)]
    .filter((f) => !allowed.includes(f))
    .map((f) => ({
      file,
      rule: '허용된 플래그만',
      reason: `'${f}' 는 등록되지 않은 플래그다. 새 축이 필요하면 관례에 먼저 추가한다 (허용: ${allowed.join(', ')})`,
    }));
}
