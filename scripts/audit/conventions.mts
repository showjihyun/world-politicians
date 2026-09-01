/**
 * 스크립트 관례 검사.
 *
 * 데이터를 덮어쓰는 스크립트는 `--dry` 로 미리보기가 가능해야 하고, 부작용을
 * 켜고 끄는 방향이 하나여야 한다. 문서에만 적힌 관례는 지켜지지 않는다는 것을
 * 이 저장소에서 여러 번 확인했다.
 *
 *   npm run audit:conventions
 *
 * 판정 규칙은 convention-rules.mts (순수, 단위 테스트 있음).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  checkDryConvention, checkFlagDirection, checkReclassifyDedupe, readScriptFacts,
  type ConventionViolation, type ScriptFacts,
} from './convention-rules.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIRS = ['scripts/news-pipeline', 'scripts/sources', 'scripts/audit', 'scripts/eval'];

/** 등록된 플래그. 새 축이 필요하면 여기 먼저 추가하고 이유를 남긴다 */
const ALLOWED_FLAGS = [
  '--dry',    // 쓰지 않는다 (모든 쓰기 스크립트 공통)
  '--fetch',  // 네트워크 단계를 돈다 (collect.mts — 쓰기 여부와 다른 축)
  '--links',  // 링크 생존까지 확인한다 (audit/data.mts — 느린 검사)
  '--sample', // 라벨 표본을 더 뽑는다 (eval/labels.mts — 무엇을 쓸지의 축이고,
              //   쓸지 말지는 --dry 가 정한다. 부작용을 켜는 플래그가 아니다)
] as const;

const facts: ScriptFacts[] = [];
const violations: ConventionViolation[] = [];

for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith('.mts') || name.endsWith('.test.mts')) continue;
    const rel = `${dir}/${name}`;
    const src = fs.readFileSync(path.join(abs, name), 'utf8');
    facts.push(readScriptFacts(rel, src));
    violations.push(...checkFlagDirection(rel, src, ALLOWED_FLAGS));
    violations.push(...checkReclassifyDedupe(rel, src));
  }
}
violations.push(...checkDryConvention(facts));

const writers = facts.filter((f) => f.writes);
console.log('스크립트 관례 검사');
console.log('─'.repeat(58));
if (!violations.length) {
  console.log(`통과 — 쓰기 스크립트 ${writers.length}개 모두 --dry 지원, 플래그 방향 일치`);
} else {
  for (const v of violations) {
    console.log(`FAIL  ${v.file}\n      ${v.rule} — ${v.reason}`);
  }
  console.log('─'.repeat(58));
  console.log(`위반 ${violations.length}건 / 쓰기 스크립트 ${writers.length}개`);
}
process.exitCode = violations.length === 0 ? 0 : 1;
