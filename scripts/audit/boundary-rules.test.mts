import { describe, expect, it } from 'vitest';
import { checkImports, parseImports, type BoundaryRule } from './boundary-rules.mts';

const domainRule: BoundaryRule = {
  label: 'domain',
  files: [],
  allowValueFrom: [],
  allowTypeFrom: ['../types', './'],
};

describe('parseImports', () => {
  it('타입 전용 import 를 구분한다', () => {
    const [i] = parseImports(`import type { A } from '../types';`);
    expect(i).toMatchObject({ from: '../types', typeOnly: true, line: 1 });
  });

  it('값 import 를 구분한다', () => {
    const [i] = parseImports(`import { A } from '../data/x';`);
    expect(i.typeOnly).toBe(false);
  });

  // `import { type A, type B }` 도 실질적으로 타입 전용이다 — 컴파일 후 사라진다
  it('중괄호 안이 전부 type 이면 타입 전용으로 본다', () => {
    const [i] = parseImports(`import { type A, type B } from '../types';`);
    expect(i.typeOnly).toBe(true);
  });

  it('값과 타입이 섞이면 값 import 다', () => {
    const [i] = parseImports(`import { A, type B } from '../data/x';`);
    expect(i.typeOnly).toBe(false);
  });

  it('부작용 import 도 잡는다 — 런타임 결합이다', () => {
    const [i] = parseImports(`import './polyfill';`);
    expect(i).toMatchObject({ from: './polyfill', typeOnly: false });
  });

  it('여러 줄에서 줄 번호를 정확히 센다', () => {
    const imports = parseImports(`// 주석\n\nimport type { A } from '../types';`);
    expect(imports[0].line).toBe(3);
  });

  it('import 가 아닌 줄은 무시한다', () => {
    expect(parseImports(`const x = 1;\nexport function f() {}`)).toHaveLength(0);
  });

  it('기본 import 도 값으로 본다', () => {
    const [i] = parseImports(`import fs from 'node:fs';`);
    expect(i).toMatchObject({ from: 'node:fs', typeOnly: false });
  });
});

describe('checkImports', () => {
  // 실제로 있었던 위반: 도메인이 RELATIONSHIPS 를 직접 읽어 단위 테스트가 불가능했다
  it('도메인의 데이터셋 값 import 를 잡는다', () => {
    const v = checkImports('src/domain/graph.ts', parseImports(`import { RELATIONSHIPS } from '../data/relationships';`), domainRule);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('value');
    expect(v[0].reason).toContain('인자로 받는다');
  });

  it('도메인의 node:fs import 를 잡는다', () => {
    const v = checkImports('src/domain/x.ts', parseImports(`import fs from 'node:fs';`), domainRule);
    expect(v).toHaveLength(1);
  });

  it('허용된 타입 import 는 통과시킨다', () => {
    const v = checkImports('src/domain/x.ts', parseImports(`import type { A } from '../types';`), domainRule);
    expect(v).toHaveLength(0);
  });

  // 타입이라도 아무 데서나 가져오면 안 된다 — 데이터 층의 형태에 기대게 된다
  it('허용 경로 밖의 타입 import 는 잡는다', () => {
    const v = checkImports('src/domain/x.ts', parseImports(`import type { A } from '../data/signal-history';`), domainRule);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('type');
  });

  it('도메인 내부 상대 경로는 허용한다', () => {
    const v = checkImports('src/domain/x.ts', parseImports(`import type { A } from './graph';`), domainRule);
    expect(v).toHaveLength(0);
  });

  it('값 import 가 허용된 규칙에서는 통과시킨다', () => {
    const relaxed: BoundaryRule = { ...domainRule, allowValueFrom: ['./util'] };
    const v = checkImports('x.ts', parseImports(`import { a } from './util';`), relaxed);
    expect(v).toHaveLength(0);
  });

  it('위반이 여러 개면 전부 보고한다', () => {
    const v = checkImports(
      'src/domain/x.ts',
      parseImports(`import fs from 'node:fs';\nimport { A } from '../data/a';`),
      domainRule
    );
    expect(v).toHaveLength(2);
  });
});
