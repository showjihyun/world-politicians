/**
 * 외부에서 온 텍스트 파싱 — 순수 함수.
 *
 * LLM 응답과 RSS 는 둘 다 우리가 형태를 통제할 수 없는 입력이다. 그런데 이 파싱이
 * 네 곳(gdelt·rebuild·recollect·filter)에 복제돼 있었고 테스트가 하나도 없었다.
 *
 * 여기가 조용히 틀리면 결과가 **빈 배열**로 나온다. 파이프라인은 빈 배열을
 * "판정 없음" 으로 처리해 원본을 유지하므로 에러도 로그도 남지 않는다 — 그날 배치가
 * 통째로 아무 일도 안 한 것이 된다. 복제본 하나만 관대해도 스크립트마다 결과가
 * 달라지고, 그 차이를 알아챌 방법이 없다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

/**
 * LLM 응답에서 JSON 배열을 꺼낸다.
 *
 * 모델이 코드펜스를 붙이거나 앞뒤에 설명을 단다. 첫 `[` 부터 마지막 `]` 까지를
 * 잘라 파싱하고, 조금이라도 어긋나면 **빈 배열**을 낸다 — 부분적으로 살린 값을
 * 넘기면 판정이 절반만 반영된 채 데이터가 덮인다.
 *
 * **알려진 한계:** 첫 `[` 부터 자르므로 `{"results":[...]}` 로 감싸 와도 살아나는
 * 대신, 산문 속 대괄호(`근거는 [1] 참고`)도 배열로 읽는다. 지금 파이프라인은 빈
 * 배열을 "판정 없음" 으로 처리해 원본을 유지하므로 이 관대함이 손해보다 이득이
 * 컸다. 바꾸려면 동작 변경이므로 정리 작업이 아니라 별도로 판단한다.
 */
export function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * RSS 항목에서 태그 하나를 꺼낸다.
 *
 * CDATA 를 벗기고 안에 남은 태그도 지운다. 매체 RSS 는 제목에 `<b>` 를 넣거나
 * CDATA 로 감싸는 곳이 섞여 있어서, 안 벗기면 그대로 화면에 나간다.
 */
export function rssField(item: string, re: RegExp): string {
  const hit = item.match(re);
  if (!hit) return '';
  return hit[1]
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}
