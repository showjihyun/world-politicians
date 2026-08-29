import { describe, expect, it } from 'vitest';
import {
  checkDryConvention,
  checkFlagDirection,
  readScriptFacts,
} from './convention-rules.mts';

const facts = (src: string) => readScriptFacts('x.mts', src);

describe('readScriptFacts — 무엇을 "쓰기" 로 볼 것인가', () => {
  it('데이터 파일 쓰기를 잡는다', () => {
    expect(facts(`fs.writeFileSync(OUT, json);`).writes).toBe(true);
  });

  // 캐시까지 규칙 대상으로 삼으면 실제 위험(추적 데이터 덮어쓰기)이 흐려진다
  it('gitignore 대상 캐시 쓰기는 세지 않는다', () => {
    expect(facts(`fs.writeFileSync(CONFIG.paths.rawCache, json);`).writes).toBe(false);
    expect(facts(`fs.writeFileSync(cachePath, json);`).writes).toBe(false);
    expect(facts(`fs.writeFileSync('.dry-output.json', json);`).writes).toBe(false);
  });

  it('주석 안의 언급은 사실로 세지 않는다', () => {
    expect(facts(`// fs.writeFileSync(OUT, json) 를 여기서 부른다`).writes).toBe(false);
    expect(facts(` * writeFileSync 로 저장한다`).writes).toBe(false);
  });

  it('삭제도 쓰기로 본다 — 되돌리기 어려운 건 마찬가지다', () => {
    expect(facts(`fs.unlinkSync(path.join(dir, name));`).writes).toBe(true);
  });
});

describe('readScriptFacts — 무엇을 "가드" 로 볼 것인가', () => {
  it('상수 분기를 인정한다', () => {
    expect(facts(`if (DRY) { log(); } else { fs.writeFileSync(OUT, j); }`).guardsWrite).toBe(true);
  });

  it('dry 인자를 받는 모듈을 인정한다', () => {
    expect(
      facts(`export function writeOutput(file: F, dry: boolean) { fs.writeFileSync(OUT, j); }`)
        .guardsWrite
    ).toBe(true);
  });

  // pipeline.mts / finalize.mts 가 이 형태다 — dry 가 쓰기 함수까지 흘러간다
  it('dry 를 넘겨주는 호출부를 인정한다', () => {
    expect(facts(`writeOutput(file, dry, { fresh: true });`).guardsWrite).toBe(true);
  });

  it('아무 가드도 없으면 false', () => {
    expect(facts(`fs.writeFileSync(OUT, j);`).guardsWrite).toBe(false);
  });
});

describe('checkDryConvention', () => {
  it('가드 없이 데이터를 쓰면 위반', () => {
    const v = checkDryConvention([facts(`fs.writeFileSync(OUT, j);`)]);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('미리보기 수단이 없다');
  });

  // --dry 를 읽기만 하고 쓰기를 막지 않으면 플래그가 장식이다
  it('--dry 를 읽지만 쓰기를 막지 않으면 위반이고, 이유가 다르다', () => {
    const v = checkDryConvention([
      facts(`const d = process.argv.includes('--dry');\nfs.writeFileSync(OUT, j);`),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('무력하다');
  });

  it('쓰지 않는 파일은 대상이 아니다', () => {
    expect(checkDryConvention([facts(`export function pure(a: number) { return a + 1; }`)])).toHaveLength(0);
  });

  it('가드가 있으면 통과', () => {
    expect(
      checkDryConvention([facts(`if (DRY) { log(); } else { fs.writeFileSync(OUT, j); }`)])
    ).toHaveLength(0);
  });
});

describe('checkFlagDirection', () => {
  const allowed = ['--dry', '--fetch', '--links'] as const;

  it('등록된 플래그는 통과', () => {
    const v = checkFlagDirection('x.mts', `process.argv.includes('--dry')`, allowed);
    expect(v).toHaveLength(0);
  });

  // 새 플래그가 조용히 늘면 "어느 쪽이 안전한가" 를 매번 확인해야 한다
  it('등록되지 않은 플래그를 잡는다', () => {
    const v = checkFlagDirection('x.mts', `process.argv.includes('--force')`, allowed);
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('--force');
  });

  it('주석 안의 플래그는 세지 않는다', () => {
    const v = checkFlagDirection('x.mts', `// process.argv.includes('--force')`, allowed);
    expect(v).toHaveLength(0);
  });

  it('같은 플래그가 여러 번 나와도 한 번만 보고한다', () => {
    const src = `process.argv.includes('--force')\nprocess.argv.includes('--force')`;
    expect(checkFlagDirection('x.mts', src, allowed)).toHaveLength(1);
  });
});
