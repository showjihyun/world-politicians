/**
 * 소스 구성 산식 — 순수. **정본은 여기 하나다.**
 *
 * 이 규칙은 네 곳이 같은 답을 내야 한다.
 *
 *   화면(InsightsPanel)   매체 막대와 비율을 그린다
 *   감사(data.mts)        README 의 수치를 이 값과 대조한다
 *   감사(checks.mts)      매니페스트 합계가 총계와 맞는지 본다
 *   E2E                   화면이 펼친 줄 수가 매체 수와 맞는지 본다
 *
 * 갈리면 조용히 틀린다. 감사가 화면에 없는 값을 요구하고, 사람은 둘 중 어느 쪽이
 * 맞는지 알 수 없다. 합계는 맞으니 종료 코드는 0 이다.
 *
 * `checks.mts` 만 이 파일을 import 하지 못한다 — 순수성 때문에 값 import 가 금지돼
 * 있다(audit:boundary). 그쪽은 사본을 두고 계약 테스트가 두 구현을 묶는다.
 * `storyTitleKey`·`pairKey` 와 같은 사정이고 같은 방식으로 고정한다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

/** 이름을 붙여 세는 상위 매체 수. 나머지는 접어서 한 줄로 묶는다 */
export const MIX_TOP = 5;

/** 통신사 — 허용 목록이 이 매체들에 쓰는 정본 이름 */
export const WIRE_NAMES = /^(ap|ap news|associated press|reuters)$/i;

export type OutletEntry = [name: string, count: number];

export interface OutletMix {
  /** 셀 만한 항목만, 건수 내림차순 (동점은 이름순) */
  entries: OutletEntry[];
  /** entries 의 합. **화면의 모든 비율이 이 값을 분모로 쓴다** */
  total: number;
  top: OutletEntry[];
  rest: OutletEntry[];
  restTotal: number;
  /** 상위 몇 곳이 차지하는 정수 퍼센트 */
  topShare: number;
}

/**
 * 매니페스트의 매체 집계를 읽는 하나의 방법.
 *
 * - 이름이 비었거나 0건인 항목은 세지 않는다. 화면이 그리지 않는 것을 감사가 세면
 *   어긋남이 상쇄돼 조용히 통과한다
 * - 건수 내림차순, 동점은 이름순. 매니페스트의 키 순서에 기대지 않는다 —
 *   기대면 데이터가 안 바뀐 날에도 순서가 흔들린다
 */
export function outletMix(outlets: Record<string, number>, topN: number = MIX_TOP): OutletMix {
  const entries = Object.entries(outlets ?? {})
    .filter(([name, n]) => countsTowardMix(name, n))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const rest = entries.slice(topN);
  const restTotal = rest.reduce((sum, [, n]) => sum + n, 0);
  return {
    entries,
    total,
    top: entries.slice(0, topN),
    rest,
    restTotal,
    topShare: total ? Math.round(((total - restTotal) / total) * 100) : 0,
  };
}

/**
 * 이 항목을 매체 구성에 세는가.
 *
 * 따로 빼 둔 이유는 `checks.mts` 의 사본이 **이 함수 하나만** 베끼면 되게 하려는 것이다.
 * 사본이 클수록 갈라질 자리가 늘어난다.
 */
export function countsTowardMix(name: string, count: number): boolean {
  return name.length > 0 && count > 0;
}

/** 소수 자리를 지정해 비율을 낸다. 분모가 0 이면 0 — 나눗셈으로 NaN 을 만들지 않는다 */
export function shareOf(part: number, total: number, digits = 0): number {
  if (!total) return 0;
  const f = 10 ** digits;
  return Math.round((part / total) * 100 * f) / f;
}

/** 통신사 몫 — 기준선으로 쓸 수 있는지 판단하는 값이라 소수 한 자리까지 본다 */
export function wireShare(mix: OutletMix, digits = 1): number {
  const wire = mix.entries
    .filter(([name]) => WIRE_NAMES.test(name))
    .reduce((n, [, c]) => n + c, 0);
  return shareOf(wire, mix.total, digits);
}
