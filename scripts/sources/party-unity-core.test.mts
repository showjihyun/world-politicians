import { describe, expect, it } from 'vitest';
import {
  castOf,
  defectionRate,
  isPartyVote,
  majority,
  medianOf,
  sideOf,
} from './party-unity-core.mts';

describe('castOf', () => {
  it('1~3 은 찬성, 4~6 은 반대', () => {
    expect([1, 2, 3].map(castOf)).toEqual(['Y', 'Y', 'Y']);
    expect([4, 5, 6].map(castOf)).toEqual(['N', 'N', 'N']);
  });

  // 0 은 그 의회 소속이 아님, 7~9 는 출석/기권. 이탈을 물을 수 없다.
  it('찬반이 아닌 코드는 세지 않는다', () => {
    expect([0, 7, 8, 9].map(castOf)).toEqual([null, null, null, null]);
  });
});

describe('majority', () => {
  it('많은 쪽을 낸다', () => {
    expect(majority(10, 3)).toBe('Y');
    expect(majority(3, 10)).toBe('N');
  });

  // 동수면 "자기 당 다수" 가 없다 — 이탈 여부를 물을 기준이 없다.
  it('동수면 다수가 없다', () => {
    expect(majority(5, 5)).toBeNull();
    expect(majority(0, 0)).toBeNull();
  });
});

describe('isPartyVote', () => {
  it('양당 다수가 갈리면 정당 표결', () => {
    expect(isPartyVote('Y', 'N')).toBe(true);
    expect(isPartyVote('N', 'Y')).toBe(true);
  });

  // 만장일치에 가까운 표결까지 분모에 넣으면 이탈이 희석돼 모두 충성스러워 보인다.
  it('같은 방향이면 정당 표결이 아니다', () => {
    expect(isPartyVote('Y', 'Y')).toBe(false);
  });

  it('한쪽에 다수가 없으면 정당 표결이 아니다', () => {
    expect(isPartyVote(null, 'Y')).toBe(false);
    expect(isPartyVote('Y', null)).toBe(false);
  });
});

describe('defectionRate', () => {
  it('비율을 백분율로 낸다', () => {
    expect(defectionRate({ votes: 400, against: 60 }, 30)).toBeCloseTo(15, 6);
  });

  // 3건 중 1건이면 33% 가 된다. 그 숫자가 화면 최상위로 올라온다.
  it('분모가 얇으면 값을 내지 않는다', () => {
    expect(defectionRate({ votes: 3, against: 1 }, 30)).toBeNull();
    expect(defectionRate({ votes: 29, against: 29 }, 30)).toBeNull();
  });

  it('경계값은 통과시킨다', () => {
    expect(defectionRate({ votes: 30, against: 3 }, 30)).toBeCloseTo(10, 6);
  });

  it('한 번도 안 어기면 0', () => {
    expect(defectionRate({ votes: 500, against: 0 }, 30)).toBe(0);
  });
});

describe('medianOf', () => {
  it('홀수는 가운데', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
  });

  it('짝수는 가운데 둘의 평균', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('빈 배열은 없음', () => {
    expect(medianOf([])).toBeNull();
  });
});

describe('sideOf', () => {
  it('정당 코드를 그대로 읽는다', () => {
    expect(sideOf('100', null)).toBe('D');
    expect(sideOf('200', null)).toBe('R');
  });

  // Sanders·King 은 코드가 328 이다. 코드만 보면 이탈률이 아예 안 나온다.
  it('무소속은 코커스를 따른다', () => {
    expect(sideOf('328', 'D')).toBe('D');
    expect(sideOf('328', 'R')).toBe('R');
  });

  it('코커스도 모르면 판정하지 않는다', () => {
    expect(sideOf('328', null)).toBeNull();
    expect(sideOf('999', undefined)).toBeNull();
  });
});
