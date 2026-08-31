import { describe, expect, it } from 'vitest';
import { decodeEntities, extractJsonArray, rssField } from './parse-core.mts';

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

describe('decodeEntities', () => {
  it('숫자 엔티티를 푼다 — 이게 화면에 그대로 나가고 있었다', () => {
    expect(decodeEntities('Trump&#8217;s &#8216;plan&#8217;')).toBe('Trump\u2019s \u2018plan\u2019');
  });

  it('16진 엔티티도 푼다', () => {
    expect(decodeEntities('Trump&#x2019;s')).toBe('Trump\u2019s');
  });

  it('이름 엔티티를 푼다', () => {
    expect(decodeEntities('A &lt;b&gt; &quot;C&quot; &hellip;')).toBe('A <b> "C" \u2026');
  });

  // &amp; 를 먼저 풀면 &amp;quot; 가 " 까지 가버린다. 원문이 보여주려던 것은
  // &quot; 라는 글자 자체다.
  it('&amp; 를 맨 나중에 푼다 — 두 번 풀지 않는다', () => {
    expect(decodeEntities('&amp;quot;')).toBe('&quot;');
    expect(decodeEntities('R&amp;D')).toBe('R&D');
  });

  it('모르는 엔티티는 그대로 둔다 — 지어내지 않는다', () => {
    expect(decodeEntities('&zzz; &#0; &#99999999;')).toBe('&zzz; &#0; &#99999999;');
  });

  it('엔티티가 없으면 원문 그대로', () => {
    expect(decodeEntities('Trump\u2019s plan')).toBe('Trump\u2019s plan');
  });
});

describe('rssField 가 엔티티까지 처리한다', () => {
  const TITLE = /<title>([\s\S]*?)<\/title>/;

  it('CDATA · 태그 · 엔티티를 함께 벗긴다', () => {
    const item = '<title><![CDATA[<b>Cruz</b> defends Trump&#8217;s plan]]></title>';
    expect(rssField(item, TITLE)).toBe('Cruz defends Trump\u2019s plan');
  });

  // 엔티티를 먼저 풀면 &lt;b&gt; 가 <b> 가 되어 태그 제거에 걸린다.
  // 태그를 먼저 지우므로 글자로 남는다.
  it('엔티티로 쓰인 꺾쇠는 글자로 남긴다', () => {
    expect(rssField('<title>use &lt;b&gt; here</title>', TITLE)).toBe('use <b> here');
  });

  it('없는 태그는 빈 문자열', () => {
    expect(rssField('<other>x</other>', TITLE)).toBe('');
  });
});
