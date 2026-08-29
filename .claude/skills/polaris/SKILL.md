---
name: polaris
description: POLARIS 저장소의 작업을 조율한다. 관계 그래프·뉴스 파이프라인·근거·화면·문서에 걸친 요청, 여러 영역이 얽힌 변경, "이거 고쳐줘"처럼 범위가 넓은 요청, 그리고 이전 작업의 재실행·보완·수정 요청 시 이 스킬을 사용할 것. 단순 질문이나 한 파일 수정은 직접 처리해도 된다.
---

# POLARIS 오케스트레이터

미국 정치인 관계 그래프. 영역이 다섯으로 나뉘고 경계면에서 사고가 난다.

## Phase 0 — 범위 판단

먼저 요청이 어느 영역에 닿는지 정한다. **한 영역이면 그 에이전트만 부른다.**
팀을 꾸리는 비용이 이득보다 큰 경우가 많다.

| 영역 | 에이전트 | 파일 |
| --- | --- | --- |
| 관계 엣지·근거 | `data-curator` | `src/data/relationships.ts`, `relationship-sources.json`, `scripts/sources/*` |
| 수집·누적·워크플로 | `pipeline-engineer` | `scripts/news-pipeline/*`, `.github/workflows/*` |
| 그래프·패널·i18n | `frontend` | `src/components/*`, `src/lib/*`, `src/store/*` |
| 검증 | `qa-auditor` | 전 영역 (읽기 + 스크립트 실행) |
| 문서·공유글 | `release-writer` | `README*.md`, `docs/adr/*` |

**이전 작업의 연속인지 확인한다.** 같은 주제로 이미 변경이 있었다면 그것을
먼저 읽고 이어서 한다. 처음부터 다시 하지 않는다.

## Phase 1 — 실행

**둘 이상의 영역에 걸치면** 순서를 정해 순차로 부른다. 이 저장소의 변경은
대개 의존이 있어 병렬이 잘 맞지 않는다:

```
데이터 구조 변경 → pipeline-engineer → frontend → release-writer
근거 수집       → data-curator → release-writer (커버리지 수치)
화면 수정       → frontend
```

각 에이전트가 끝날 때마다 **그 자리에서** `qa-auditor` 에게 넘긴다. 전체가
끝난 뒤 한 번에 검증하면 원인 범위가 넓어진다.

## Phase 2 — 마무리

작업을 끝냈다고 말하기 전에:

- [ ] `npm test && npm run audit` 종료 코드 0
- [ ] 데이터·파이프라인을 건드렸으면 `npm run e2e` 까지
- [ ] 수치가 바뀌었으면 README(EN/KO) 양쪽 반영
- [ ] 검증하지 못한 범위를 명시

## 이 저장소에서 반복된 사고

`CLAUDE.md` 에 있다. 특히:

- 줄바꿈이 CRLF/LF 혼재라 `\n` 기준 치환이 조용히 실패한다
- 파괴적 스크립트는 `--dry` 먼저
- LLM 배치에서 침묵을 삭제로 해석하지 않는다
- `generatedAt` 은 재처리가 갱신하면 안 된다
- 출력 구조를 바꾸면 워크플로 커밋 경로도 바꾼다

## 테스트 시나리오

**정상 흐름** — "근거 커버리지를 올려줘"
→ `data-curator` 가 `evidence-pipeline` 스킬로 `--dry` 확인 후 반영
→ `qa-auditor` 가 `npm run audit:data` 로 판정
→ `release-writer` 가 README 수치 갱신 → 감사 재실행

**에러 흐름** — 감사가 FAIL 을 반환
→ `qa-auditor` 가 원인을 특정(예: 확인 불가 URL 유입)
→ 담당(`data-curator`)에게 넘김. 직접 고치지 않는다
→ 수정 후 재검증. 통과할 때까지 완료로 보고하지 않는다
