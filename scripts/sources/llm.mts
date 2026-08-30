/**
 * LLM 호출 — 어댑터. 세 스크립트(gdelt·rebuild·recollect)가 같은 것을 쓰던 것을 모았다.
 *
 * 재시도 횟수와 실패 처리가 갈라지면 한 스크립트만 조용히 일찍 포기한다.
 * 두 번 시도하고, 둘 다 실패하면 **빈 배열**을 낸다 — 호출부는 빈 배열을
 * "판정 없음" 으로 보고 원본을 유지해야 한다. 이걸 "제거" 로 처리했다가
 * dry-run 중 503 두 번에 그 배치의 근거가 통째로 날아갈 뻔했다.
 *
 * 응답 파싱은 `parse-core.mts` 에 있고 단위 테스트가 있다.
 */
import OpenAI from 'openai';
import { CONFIG } from '../news-pipeline/config.mts';
import { extractJsonArray } from './parse-core.mts';

/**
 * 클라이언트는 처음 쓸 때 만든다.
 *
 * import 시점에 만들면 호출부의 가드("API 키 없음 — 중단")가 돌기 **전에**
 * 생성자가 던진다. 친절한 메시지 대신 스택 트레이스가 나오고, 어느 환경변수가
 * 빠졌는지 알기 어려워진다. 세 스크립트를 이 모듈로 모으면서 생긴 회귀다.
 */
let client: OpenAI | null = null;
const getClient = (): OpenAI => (client ??= new OpenAI({
  apiKey: CONFIG.llm.apiKey,
  baseURL: CONFIG.llm.baseURL,
}));

/** 두 번 시도하고, 못 받으면 빈 배열. 부분 결과를 지어내지 않는다 */
export async function ask(system: string, user: string): Promise<unknown[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().chat.completions.create({
        model: CONFIG.llm.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        max_tokens: CONFIG.llm.maxTokens,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      } as never);
      const content =
        (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
      const arr = extractJsonArray(content);
      if (arr.length) return arr;
    } catch (err) {
      console.warn(`  [llm] 실패 ${attempt + 1}:`, (err as Error).message?.slice(0, 90));
    }
  }
  return [];
}
