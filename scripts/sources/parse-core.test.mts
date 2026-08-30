import { describe, expect, it } from 'vitest';
import { extractJsonArray, rssField } from './parse-core.mts';

describe('extractJsonArray', () => {
  it('맨 JSON 배열을 읽는다', () => {
    expect(extractJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  // 모델이 코드펜스를 붙인다
  it('코드펜스를 벗긴다', () => {
    expect(extractJsonArray('```json\n[1,2]\n```')).toEqual([1, 2]);
    expect(extractJsonArray('```\n[3]\n```')).toEqual([3]);
  });

  it('앞뒤 설명을 무시한다', () => {
    expect(extractJsonArray('물론이죠! 결과는 다음과 같습니다:\n[1,2]\n도움이 되었길.')).toEqual([1, 2]);
  });

  // 부분적으로 살린 값을 넘기면 판정이 절반만 반영된 채 데이터가 덮인다
  it('망가진 JSON 은 빈 배열 — 부분 복구를 시도하지 않는다', () => {
    expect(extractJsonArray('[{"a":1},{"b":')).toEqual([]);
    expect(extractJsonArray('[1, 2,]')).toEqual([]);
  });

  // 실제 동작을 못 박는다. 첫 '[' 부터 마지막 ']' 까지를 자르므로 객체로 감싸
  // 와도 안쪽 배열을 꺼낸다. 모델이 {"results":[...]} 로 답할 때 살아나는 쪽이다.
  it('객체로 감싸 와도 안쪽 배열을 꺼낸다', () => {
    expect(extractJsonArray('{"results":[1,2]}')).toEqual([1, 2]);
  });

  // 같은 관대함의 대가다 — 산문 속 대괄호도 배열로 읽는다.
  // 정리 작업에서 동작을 바꾸지 않고 알려진 한계로 고정해 둔다.
  it('산문 속 대괄호도 배열로 읽는다 (알려진 한계)', () => {
    expect(extractJsonArray('근거는 [1] 참고. 판정 불가.')).toEqual([1]);
  });

  it('배열이 아예 없으면 빈 배열', () => {
    expect(extractJsonArray('죄송하지만 판단할 수 없습니다.')).toEqual([]);
    expect(extractJsonArray('')).toEqual([]);
  });

  // 닫는 괄호가 여는 것보다 앞서면 잘라낼 구간이 없다
  it('괄호 순서가 뒤집혀도 터지지 않는다', () => {
    expect(extractJsonArray('] 앞에 닫힘 [')).toEqual([]);
  });

  it('중첩 배열은 바깥 것을 통째로 읽는다', () => {
    expect(extractJsonArray('[[1,2],[3]]')).toEqual([[1, 2], [3]]);
  });

  it('빈 배열 응답을 그대로 낸다 — 오류와 구분되지는 않는다', () => {
    expect(extractJsonArray('[]')).toEqual([]);
  });
});

describe('rssField', () => {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/;

  it('태그 안의 값을 읽는다', () => {
    expect(rssField('<title>Hello</title>', title)).toBe('Hello');
  });

  it('속성이 붙은 태그도 읽는다', () => {
    expect(rssField('<title type="text">Hi</title>', title)).toBe('Hi');
  });

  // CDATA 를 안 벗기면 그대로 화면에 나간다
  it('CDATA 를 벗긴다', () => {
    expect(rssField('<title><![CDATA[Breaking News]]></title>', title)).toBe('Breaking News');
  });

  it('안에 남은 태그를 지운다', () => {
    expect(rssField('<title>A <b>bold</b> claim</title>', title)).toBe('A bold claim');
  });

  it('앞뒤 공백을 떨어낸다', () => {
    expect(rssField('<title>\n  Spaced  \n</title>', title)).toBe('Spaced');
  });

  it('없는 태그는 빈 문자열 — null 을 흘리지 않는다', () => {
    expect(rssField('<link>x</link>', title)).toBe('');
  });

  it('여러 줄에 걸친 값도 읽는다', () => {
    expect(rssField('<title>one\ntwo</title>', title)).toBe('one\ntwo');
  });
});
