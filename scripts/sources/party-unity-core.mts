/**
 * 당론 이탈률 판정 규칙 — 순수 함수.
 *
 * "이 사람이 자기 당 다수와 반대로 던진 비율" 을 낸다. 표결 일치도(두 사람이
 * 얼마나 같이 던지는가)와는 다른 것이다 — 일치도는 당적의 대리변수라 이미
 * 기각됐고(CLAUDE.md), 이탈률은 "당에 맞선다" 를 직접 잰다.
 *
 * **이 값은 관계를 설명하지 않는다.** 당내 갈등 엣지와의 관계를 두 지표로
 * 검증했고 둘 다 무신호였다(DW-NOMINATE 이탈 p=0.813, 이탈률 p=0.992).
 * Collins·Fitzpatrick·Murkowski 는 이탈률 상위인데 당내 feud 가 0 이다 —
 * 조용히 상시적으로 이탈하는 것은 공개 충돌을 낳지 않는다. 인물 사실로만 쓴다.
 *
 * 규칙: 이 파일은 타입 외의 import 를 갖지 않는다.
 */

export type Side = 'D' | 'R';
export type Cast = 'Y' | 'N';

/** 투표 기록 코드 → 찬반. 1~3 찬성, 4~6 반대, 나머지는 표결에 참여하지 않은 것 */
export function castOf(code: number): Cast | null {
  if (code >= 1 && code <= 3) return 'Y';
  if (code >= 4 && code <= 6) return 'N';
  return null;
}

/**
 * 한 표결에서 각 당의 다수 입장.
 *
 * 동수면 다수가 없다 — 그 당 소속에게는 이탈을 물을 기준이 없다.
 */
export function majority(yea: number, nay: number): Cast | null {
  if (yea > nay) return 'Y';
  if (nay > yea) return 'N';
  return null;
}

/**
 * 정당 표결인가 — 양당의 다수가 서로 반대인가.
 *
 * 이 기준이 핵심이다. 만장일치에 가까운 표결(명명 결의 따위)까지 분모에 넣으면
 * 이탈이 희석돼 **모두가 충성스러워 보인다.** 119대에서 전체 1,533건 중
 * 정당 표결은 1,279건(83%)이었다.
 */
export function isPartyVote(dMaj: Cast | null, rMaj: Cast | null): boolean {
  return dMaj !== null && rMaj !== null && dMaj !== rMaj;
}

export interface Tally {
  /** 정당 표결 중 이 사람이 찬반을 던진 횟수 = 분모 */
  votes: number;
  /** 그중 자기 당 다수와 반대로 던진 횟수 */
  against: number;
}

/**
 * 이탈률(%). 분모가 얇으면 비율이 요동치므로 최소 표결 수를 넘겨야 값을 낸다.
 *
 * 임기 중간에 들어왔거나 장기 결석한 의원은 3건 중 1건만 이탈해도 33% 가 된다.
 * 그런 숫자를 화면에 내면 그 사람이 최상위로 올라온다.
 */
export function defectionRate(t: Tally, minVotes: number): number | null {
  if (t.votes < minVotes) return null;
  return (t.against / t.votes) * 100;
}

/**
 * 같은 당·같은 원의 중앙값. 화면에 홀로 놓인 비율은 읽을 수 없다 —
 * 4.5% 가 높은지 낮은지 알려면 비교 대상이 필요하다.
 */
export function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 무소속은 코커스를 따른다.
 *
 * Sanders·King 은 정당 코드가 328 이지만 민주당과 코커스한다. 코드만 보면
 * 이 둘은 "자기 당 다수" 가 없어 이탈률이 아예 안 나온다.
 */
export function sideOf(partyCode: string, caucus: string | null | undefined): Side | null {
  if (partyCode === '100') return 'D';
  if (partyCode === '200') return 'R';
  if (caucus === 'D') return 'D';
  if (caucus === 'R') return 'R';
  return null;
}
