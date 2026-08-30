import { describe, expect, it } from 'vitest';
import { normalizeName, pairKey } from './keys-core.mts';
import { pairKey as domainPairKey } from '../../src/domain/graph';
import { pairKey as auditPairKey } from '../audit/checks.mts';

describe('pairKey', () => {
  it('순서가 달라도 같은 키가 나온다', () => {
    expect(pairKey('cruz', 'warren')).toBe(pairKey('warren', 'cruz'));
  });

  it('사전순으로 세운다', () => {
    expect(pairKey('warren', 'cruz')).toBe('cruz|warren');
  });

  it('같은 id 두 번도 처리한다', () => {
    expect(pairKey('cruz', 'cruz')).toBe('cruz|cruz');
  });
});

/**
 * 앱과 스크립트는 빌드 문맥이 달라 한 파일을 공유할 수 없다. 감사 규칙(checks.mts)은
 * 순수성 때문에 값 import 가 금지돼 있어 자기 것을 쓴다. 그래서 셋이 같은 값을
 * 내는지를 여기서 고정한다 — 어긋나면 근거 패널이 **에러 없이** 비어서 나온다.
 */
describe('pairKey 계약 — 앱·스크립트·감사가 같은 키를 내야 한다', () => {
  const samples: [string, string][] = [
    ['cruz', 'warren'],
    ['warren', 'cruz'],
    ['a', 'b'],
    ['ocasio-cortez', 'omar-ilhan'],
    ['zzz', 'aaa'],
    ['collins-susan', 'murkowski'],
    ['same', 'same'],
  ];

  it.each(samples)('%s × %s 에서 세 구현이 일치한다', (a, b) => {
    const mine = pairKey(a, b);
    expect(domainPairKey(a, b)).toBe(mine);
    expect(auditPairKey(a, b)).toBe(mine);
  });
});

describe('normalizeName', () => {
  it('대소문자와 문장부호를 무시한다', () => {
    expect(normalizeName('Donald J. Trump')).toBe('donald j trump');
  });

  // 하이픈을 공백으로 바꾸면 성이 "cortez" 가 되어 엉뚱하게 붙는다
  it('하이픈은 제거한다', () => {
    expect(normalizeName('Alexandria Ocasio-Cortez')).toBe('alexandria ocasiocortez');
  });

  it('접미사를 떨어낸다', () => {
    expect(normalizeName('Robert F. Kennedy Jr.')).toBe(normalizeName('Robert F. Kennedy'));
  });

  it('발음 부호를 벗긴다', () => {
    expect(normalizeName('Raúl M. Grijalva')).toBe('raul m grijalva');
  });

  it('빈 문자열은 빈 결과', () => {
    expect(normalizeName('   ')).toBe('');
  });
});
