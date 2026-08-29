/**
 * 도메인 경계 판정 규칙 — 순수 함수.
 *
 * 이 파일 자체도 경계 안에 있다: 타입 외의 import 를 갖지 않는다.
 * 규칙이 틀리면 검사가 무의미하므로 단위 테스트가 붙어 있다.
 */

export interface ImportRef {
  /** import 대상 경로 */
  from: string;
  /** `import type ...` 인가 — 컴파일 후 사라지므로 런타임 결합이 없다 */
  typeOnly: boolean;
  line: number;
}

export interface BoundaryRule {
  label: string;
  files: string[];
  /** 값 import 가 허용되는 접두사. 비어 있으면 값 import 자체를 금지 */
  allowValueFrom: string[];
  /** 타입 import 가 허용되는 접두사 */
  allowTypeFrom: string[];
}

export interface Violation {
  file: string;
  line: number;
  from: string;
  kind: 'value' | 'type';
  reason: string;
}

/**
 * import 문을 추출한다.
 *
 * 정규식으로 읽는다 — 이 경계 안의 파일들은 파일 상단에 평범한 import 만 두므로
 * 파서를 들일 필요가 없다. 다만 `import type { A }` 와 `import { type A }` 를
 * 구분해야 한다. 후자는 값 import 문법 안에 타입이 섞인 형태다.
 */
export function parseImports(source: string): ImportRef[] {
  const out: ImportRef[] = [];
  const lines = source.split('\n');

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith('import')) return;

    const m = line.match(/^import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/);
    if (m) {
      const declaredType = Boolean(m[1]);
      const clause = m[2] ?? '';
      // `import { type A, type B }` 처럼 모든 항목이 type 이면 실질적으로 타입 전용이다
      const names = clause.replace(/[{}]/g, '').split(',').map((x) => x.trim()).filter(Boolean);
      const allTypeMembers = names.length > 0 && names.every((n) => n.startsWith('type '));
      out.push({ from: m[3], typeOnly: declaredType || allTypeMembers, line: i + 1 });
      return;
    }

    // `import './side-effect'` — 값도 타입도 아니지만 런타임 결합이다
    const bare = line.match(/^import\s*['"]([^'"]+)['"]/);
    if (bare) out.push({ from: bare[1], typeOnly: false, line: i + 1 });
  });

  return out;
}

const allowed = (from: string, prefixes: string[]) =>
  prefixes.some((p) => from === p || from.startsWith(p));

export function checkImports(
  file: string,
  imports: ImportRef[],
  rule: BoundaryRule
): Violation[] {
  const out: Violation[] = [];

  for (const imp of imports) {
    if (imp.typeOnly) {
      if (!allowed(imp.from, rule.allowTypeFrom)) {
        out.push({
          file,
          line: imp.line,
          from: imp.from,
          kind: 'type',
          reason: `타입 import 허용 경로가 아니다 (허용: ${rule.allowTypeFrom.join(', ') || '없음'})`,
        });
      }
      continue;
    }

    if (!allowed(imp.from, rule.allowValueFrom)) {
      out.push({
        file,
        line: imp.line,
        from: imp.from,
        kind: 'value',
        reason:
          rule.allowValueFrom.length === 0
            ? '도메인은 값 import 를 가질 수 없다 — 필요한 값은 인자로 받는다'
            : `값 import 허용 경로가 아니다 (허용: ${rule.allowValueFrom.join(', ')})`,
      });
    }
  }

  return out;
}

export function formatViolations(violations: Violation[]): string {
  return violations
    .map((v) => `FAIL  ${v.file}:${v.line}\n      ${v.kind} import '${v.from}'\n      ${v.reason}`)
    .join('\n');
}
