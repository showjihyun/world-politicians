/**
 * 도메인 경계 검사.
 *
 * ADR 0001 은 "도메인은 타입 외의 런타임 import 를 갖지 않는다" 고 정했지만
 * 강제하는 것이 없었다. 사람은 리뷰로 잡을 수 있어도, 규칙을 문서에서만 읽는
 * 쪽은 어긴다. 경계가 한 번 녹으면 ADR 0001 이 무효가 되고 단위 테스트가
 * 다시 느려지거나 불안정해진다.
 *
 *   npm run audit:boundary
 *
 * ESLint 를 들이지 않은 이유: 이 저장소에 ESLint 설정이 없고, 규칙 하나를 위해
 * eslint + typescript-eslint + 설정을 얹는 것보다 이 검사가 가볍고 빠르다.
 * 판정 규칙(checkImports)은 순수 함수라 단위 테스트가 붙어 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkImports, formatViolations, parseImports, type BoundaryRule } from './boundary-rules.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * 지켜야 할 경계.
 * allow 에 없는 곳에서 "값" 을 가져오면 위반이다. 타입만 가져오는 것은 허용한다 —
 * 컴파일 후 사라지므로 런타임 결합이 생기지 않는다.
 */
const RULES: BoundaryRule[] = [
  {
    label: 'src/domain',
    files: listFiles('src/domain', /\.ts$/, /\.test\.ts$/),
    allowValueFrom: [],
    allowTypeFrom: ['../types', './'],
  },
  {
    label: 'scripts/news-pipeline/core.mts',
    files: ['scripts/news-pipeline/core.mts'],
    allowValueFrom: [],
    allowTypeFrom: ['./'],
  },
  {
    label: 'scripts/audit/checks.mts',
    files: ['scripts/audit/checks.mts'],
    allowValueFrom: [],
    allowTypeFrom: ['./'],
  },
];

function listFiles(dir: string, match: RegExp, exclude?: RegExp): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => match.test(f) && !(exclude && exclude.test(f)))
    .map((f) => `${dir}/${f}`);
}

let violations = 0;
let checked = 0;

for (const rule of RULES) {
  for (const rel of rule.files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    checked++;
    const found = checkImports(rel, parseImports(fs.readFileSync(abs, 'utf8')), rule);
    if (found.length) {
      violations += found.length;
      console.log(formatViolations(found));
    }
  }
}

console.log('도메인 경계 검사');
console.log('─'.repeat(58));
if (violations === 0) {
  console.log(`통과 — 파일 ${checked}개, 위반 없음`);
  console.log('도메인은 값 import 를 갖지 않는다 (ADR 0001)');
} else {
  console.log(`위반 ${violations}건 / 파일 ${checked}개`);
  console.log('도메인이 데이터·fs·네트워크를 직접 참조하면 단위 테스트가 성립하지 않는다.');
  console.log('필요한 값은 인자로 받고, 실제 바인딩은 어댑터(src/lib, *.mts)에서 한다.');
}
// process.exit() 은 이벤트 루프를 끊어 Windows 에서 libuv assertion 을 내고
// 종료 코드가 127 로 뭉개진다. 코드만 정하고 자연 종료를 기다린다.
process.exitCode = violations === 0 ? 0 : 1;
