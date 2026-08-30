/**
 * 조인 키와 이름 정규화 — 순수 함수. 스크립트 쪽의 정본이다.
 *
 * 왜 따로 두는가: `pairKey` 가 아홉 군데에 복제돼 있었다. 이 키는
 * `relationship-sources.json`·`cosponsorship-sources.json`·그래프를 잇는
 * 조인 키다. 하나만 달라지면 **에러 없이 근거 패널이 비어서 나온다** —
 * 아무도 모른다. `strengthOf` 가 두 벌이라 테스트한 쪽이 안 돌던 것과 같은 종류다.
 *
 * 화면 쪽 정본은 `src/domain/graph.ts` 의 `pairKey` 다. 앱과 스크립트는 빌드
 * 문맥이 달라 한 파일을 공유할 수 없으므로, 둘이 같은 값을 내는지는
 * `keys-core.test.mts` 의 계약 테스트가 고정한다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

/** 두 인물 id 를 순서와 무관한 하나의 키로 — 사전순으로 세워 `|` 로 잇는다 */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * 이름 비교용 정규화.
 *
 * 접미사(Jr·III)와 문장부호를 떨어낸다. 하이픈은 공백이 아니라 제거다 —
 * "Ocasio-Cortez" 가 두 토큰이 되면 성이 "cortez" 가 되어 엉뚱하게 붙는다.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, '')
    .split(/\s+/)
    .filter((t) => t && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(t))
    .join(' ');
}
