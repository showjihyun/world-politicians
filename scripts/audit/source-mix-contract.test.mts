import { describe, it, expect } from 'vitest';
import { countsTowardMix, outletMix } from '../../src/domain/source-mix.ts';
import { checkManifest, countsTowardMixMirror } from './checks.mts';

/**
 * 소스 구성 산식 계약 — 정본과 감사 사본이 같은 답을 내야 한다.
 *
 * 산식은 다섯 곳이 썼다. 넷은 `src/domain/source-mix.ts` 를 import 하도록 합쳤고,
 * `checks.mts` 하나만 사본을 들고 있다 — 순수성 때문에 값 import 가 금지돼 있어
 * (audit:boundary) 다른 방법이 없다. `storyTitleKey`·`pairKey` 와 같은 사정이다.
 *
 * 갈라지면 **에러가 나지 않는다.** 감사는 자기 기준으로 합계를 재서 통과시키고,
 * 화면은 자기 기준으로 나눠 다른 비율을 그린다. 종료 코드는 0 이고, 사람은 둘 중
 * 어느 쪽이 맞는지 알 수 없다. 그래서 여기서 묶는다.
 */
describe('countsTowardMix 계약 — 화면과 감사가 같은 것을 센다', () => {
  // 갈라질 만한 자리를 전부 넣는다. 정상값만 넣으면 두 구현이 달라도 통과한다.
  const names = ['CNN', '', ' ', 'AP News', '0', 'a'.repeat(200)];
  const counts = [5, 1, 0, -1, -0, 0.5, Number.NaN, Number.POSITIVE_INFINITY];

  const cases = names.flatMap((name) => counts.map((count) => ({ name, count })));

  it.each(cases)('$name / $count 에서 두 구현이 일치한다', ({ name, count }) => {
    expect(countsTowardMixMirror(name, count)).toBe(countsTowardMix(name, count));
  });
});

/**
 * 술어가 같은 것만으로는 부족하다. 감사가 실제로 내리는 판정이 정본의 합계와
 * 맞물리는지 본다 — `manifest.outlets` 는 "화면이 나눌 분모" 를 검사하는 항목이고,
 * 그 분모를 정하는 것이 `outletMix().total` 이다.
 */
describe('checkManifest 는 정본의 합계를 기준으로 판정한다', () => {
  const manifestOf = (outlets: Record<string, number>, total: number) => ({
    stats: { total },
    months: ['2026-08'],
    counts: { trump: total },
    outlets,
  });
  const actualOf = (total: number) => ({
    months: ['2026-08'],
    total,
    counts: { trump: total },
  });

  const outletsWithNoise = { CNN: 6, NPR: 4, '': 12, Axios: 0 };
  const canonicalTotal = outletMix(outletsWithNoise).total; // 10 — 빈 이름·0건은 빠진다

  it('정본 합계와 맞으면 매체 항목을 내지 않는다', () => {
    const found = checkManifest(
      manifestOf(outletsWithNoise, canonicalTotal),
      actualOf(canonicalTotal)
    );
    expect(found.filter((f) => f.check.startsWith('manifest.outlets'))).toEqual([]);
  });

  it('버려지는 항목까지 세면 어긋나고, 그때 잡는다', () => {
    // 22 = 빈 이름 12건을 함께 센 값. 사본이 정본보다 후하게 세면 이 상태가 통과한다.
    const found = checkManifest(manifestOf(outletsWithNoise, 22), actualOf(22));
    const outlet = found.find((f) => f.check === 'manifest.outlets');
    expect(outlet?.level).toBe('fail');
    expect(outlet?.message).toContain('10');
  });
});
