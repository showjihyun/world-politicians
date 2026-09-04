# 언론 편향 연구가 POLARIS 호불호 판정에 말하는 것

> 2026-09-02 작성, 2026-09-03 구현 결과 반영. Reddit 에서 "언론의 편향 보도와 어그로성
> 헤드라인 때문에 데이터 신뢰도가 떨어진다" 는 지적을 받았다. 정치학·커뮤니케이션·경제학에서
> 언론 편향을 다룬 논문 중 인용이 높은 것을 모아 읽고, 파이프라인의 어디에 닿는지와 무엇을
> 바꿔야 하는지를 적는다.
> 인용 수는 OpenAlex(2026-09-02 조회) 기준이다. 단행본은 OpenAlex 가 과소집계하므로 참고만 한다.
>
> **무엇을 넣었고 무엇을 일부러 안 넣었는지는 0-2 에 있다.** 아래 0·0-1 은 조사 시점의
> 기록이라 그대로 둔다 — 무엇이 틀렸었는지를 지우면 왜 고쳤는지가 사라진다.

## 0. 조사 시점(2026-09-02)의 상태

당시 파이프라인이 실제로 하던 일을 코드에서 확인한 것이다. 셋은 그 뒤 고쳤다(0-2).

| 사실 | 근거 |
| --- | --- |
| 분류기는 **헤드라인만** 읽는다. 제목·매체·날짜·인물 ID 가 입력 전부다 | `llm.mts` `classifyBatch` 의 listing |
| 극성은 기사 단위 3분류(ally/feud/neutral)이고, 관계 "점수" 는 없다 | `types.ts` `NewsSignal` |
| 화면의 월별 호불호는 다수결이 **아니다**. 그 달 **첫 비중립 신호가 이기고**, 이후 반대 극성은 개수와 무관하게 무시된다. 주석은 "동점이면 최신으로 덮음" 이라 적혀 있는데 코드는 `>` 비교라 동점이면 먼저 온 것을 지킨다 | `domain/timeline.ts` `liveByMonth`. 합성 신호로 확인: feud 1건 뒤 ally 6건 → 셀은 feud |
| 매체는 가중치가 없다. Reuters 1건과 CNN 1건이 같은 표다 | 같은 곳 |
| 모델이 준 `confidence` 는 저장만 되고 어디에도 쓰이지 않는다. 12개 값밖에 없고 중앙값 0.9 | 아카이브 실측 |
| 정답지는 118행. 사람이 확인한 것 20 · 모델 1차 채움(`by: model`) 98. 기준선은 사람 40건부터 적으므로 아직 `null` | `scripts/eval/labels.json` · `npm run eval` |
| 2026-09-01 수집이 **이미 분류돼 있던 신호를 미분류로 덮어썼다.** `accumulate` 가 incoming 을 id 로 무조건 `map.set` 하므로, 재수집된 기사의 LLM 배치가 실패하면 아카이브의 판정이 지워진다 | 아래 0-1 |

아카이브 실측 (2026-07-28 ~ 2026-09-01, 304건).

```
분류 276건 중   feud 158 · ally 73 · neutral 45      → ally+feud 중 feud 68%
매체 상위 3     The Hill 87 · Fox News 61 · CNN 27   → 전체의 58%
통신사          AP 6 · Reuters 5                     → 전체의 3.6%
트럼프 포함     215건 (71%). 쌍이 있는 276건 중 192건이 트럼프 쌍
쌍 100개 중     신호 1건짜리 52개 · 매체 1곳짜리 57개
URL             292/304 가 Google News 리다이렉트 → 본문을 가져올 수 없다
```

매체별 feud 비율 (ally+feud 중, n 이 작으니 방향만 본다).

```
CNN 88%  ABC 90%  WaPo 83%  Fox 74%  Examiner 75%  The Hill 71%  Politico 67%
CBS 56%  WSJ 40%  Axios 40%  NYT 33%  NBC 33%  AP 33%  Reuters 0%
```

같은 날 같은 쌍을 두 매체 이상이 다룬 묶음이 41개, 그중 극성이 갈린 것이 10개(24%).
예: 2026-08-26 Graham×Trump — Fox "Trump endorsement boosts sister of late Lindsey Graham" 은
ally, CBS "Darline Graham, Trump's pick to replace Lindsey Graham, moves on" 은 feud 로 나갔다.
두 번째는 오분류다. 같은 사건인데 매체가 다르다는 이유로 표가 두 장 들어갔고, 그중 하나는 틀렸다.

정확도 (`npm run eval`, 2026-09-02).

```
극성     94/108 = 87%      사람 라벨만 보면 17/18. 98행의 정답이 모델 1차 채움이라 87% 는
                            정확도라기보다 재현성에 가깝다 — 사람 40건이 되기 전에는 기준선을 적지 않는다
관계쌍   103/118 = 87.3%
오류 14건의 방향
  neutral→feud 7 · neutral→ally 3 · feud→neutral 2 · ally→neutral 1 · feud→ally 1
  → ally 와 feud 가 뒤집힌 것은 1건. 오류의 절반은 "둘 사이의 행위가 아닌 기사" 를 feud 로 부른 것이다
```

예: "Warren presses RFK Jr. on Trump ties to lettuce distributor" → feud(Trump×RFK). 행위의 주체는
Warren 이고 둘은 대상일 뿐이다. "Hunter Biden: Trump 'the one existential threat'" → feud(Biden×Trump).
발언자가 Hunter 다. 헤드라인에 두 이름과 공격 동사가 있으면 모델이 쌍을 만든다.

**맞는 지적.** 헤드라인만 보고 매체를 가중하지 않으니, 우리가 재는 것은 "관계" 가 아니라
"헤드라인이 갈등을 얼마나 파는가" 에 가깝다. 아래 문헌은 그 비율이 68% 로 나오는 것이
우연이 아니라 뉴스 생산의 구조라고 말한다. 그리고 오류의 방향도 그쪽이다 — 틀릴 때는
갈등이 아닌 것을 갈등으로 부른다.

**틀린 지적.** 우리는 매체의 정파성을 극성으로 옮기지 않는다. 극성은 "A 가 B 를 공격했다/옹호했다"
는 두 사람 사이의 **행위** 분류이고, "이 매체가 A 를 좋아하는가" 가 아니다. 다만 그 구분이
화면에 적혀 있지 않아서 읽는 사람이 알 길이 없다. 이건 알고리즘이 아니라 표기 문제다.

### 0-1. 조사 중 발견한 결함 둘

문헌과 무관하게, 코드를 읽다 나온 것이다. 둘 다 알고리즘보다 먼저 고쳐야 했고, 고쳤다(0-2).
아래는 무엇이 어떻게 틀렸었는지의 기록이다.

**시계열 셀은 첫 신호가 정한다.** `domain/timeline.ts` 의 `liveByMonth` 는 극성이 다르면
`POL_WEIGHT[s] > POL_WEIGHT[prev]` 일 때만 덮는다. feud 와 ally 가 같은 무게(2)라 이 조건은
항상 거짓이고, 그 달 첫 비중립 신호가 남는다. 합성 신호 5조로 확인했다.

```
ally 1건 → feud 1건(나중)        셀 = ally
feud 1건 → ally 6건(나중)        셀 = feud
neutral 1건 → feud 1건           셀 = feud   (neutral 만 0 이라 덮인다)
```

주석("동점이면 최신으로 덮음")과 코드가 반대다. 어느 쪽이 의도인지와 무관하게 6:1 을 1 이
이기는 규칙은 둘 다 아니다. A3 이 이 블록을 통째로 바꾼다.

**수집이 판정을 지운다.** `core.mts` 의 `accumulate` 는 `existing` 을 넣고 `incoming` 을 id 로
`map.set` 한다. 같은 id 가 다시 수집되면(30일 창 안이면 흔하다) incoming 이 이긴다. 그 기사의
LLM 배치가 실패했으면 incoming 은 `classified: false` 이고, **아카이브에 있던 판정이 그것으로
바뀐다.** `git show` 로 라벨 표본 10건의 상태를 커밋별로 따라갔다.

```
e5deb7f 08-29 perf      C C C - C C C C C C   미분류 0
d780891 08-29 수집      C C C C C u C C u u   미분류 30
102ab1b 08-31 fix       C C C C C u C C u u   미분류 29
b94f2c3 08-30 수집      C C C C C C C C C C   미분류 0
a7ba1c8 08-31 fix       C C C C C - C C C C   미분류 0
d70f233 09-01 수집      u u u u u u u u u u   미분류 27     ← 열 개 전부 판정을 잃었다
```

`audit:data` 가 당시 경고하던 미분류 28건(9.2%)은 "어려운 기사" 가 아니라 이 경로로 지워진
것이다. `reclassify` 가 뒤에서 되살리려 하지만, LLM 이 그 실행 내내 죽어 있었으면 둘 다 실패한다.
"판정을 못 받은 항목은 원본을 유지한다" 는 원칙이 `applyResult` 에는 있고 `accumulate` 에는 없다.
고치는 법은 한 줄이다 — incoming 이 미분류이고 existing 이 분류돼 있으면 existing 을 지킨다.
실패시켜 보는 법도 한 줄이다 — 분류된 existing 과 같은 id 의 미분류 incoming 을 넣고 결과가
분류돼 있어야 한다. 조사 시점의 코드는 이 테스트에서 빨간불이었다.

## 0-2. 구현 결과 (2026-09-03)

넷만 넣었다. 나머지는 왜 안 넣었는지 4절에 적는다. **지표 없이 알고리즘을 넣으면 이 저장소가
반복해서 데인 그 상태가 된다** — 프롬프트를 고치고 "좋아졌다" 고 믿는 것.

| 무엇 | 결과 |
| --- | --- |
| `accumulate` 판정 보존 | 미분류 incoming 이 분류된 existing 을 덮지 않는다. 테스트 3개, 빨간불 먼저 확인 |
| 지워진 판정 복구 | `npm run news:recover` 로 git 이력에서 25건. **미분류 28건(9.2%) → 1건(0.3%)** |
| 하루 한 표 | `timeline.ts` `groupByDay`. 같은 날 같은 쌍은 매체가 몇이든 한 표, 가중 `1 + ln(매체 수)` |
| 가중 다수결·반전 이력 | `tallyMonth`. 임계는 2배 하나뿐이다 — 반전 인정과 불일치 표시가 같은 기준을 쓴다 |
| 매체 구성·불일치 표기 | 화면에 소스 구성과 판정 불일치를 적는다. `index.json` 에 `outlets` 추가 |

복구 뒤 아카이브가 302건이 됐다(중복 2건이 드러나 빠졌다 — 미분류 신호는 쌍이 비어 있어
예전 거르기를 통과했고, 판정을 되살리자 기존 신호와 같은 키가 됐다).

```
아카이브 302건 (2026-07-28 ~ 2026-09-01) · 미분류 1건
분류 301건 중  feud 163 · ally 81 · neutral 57      → ally+feud 중 feud 67%
매체 17곳      The Hill 86 · Fox News 61 · CNN 27   → 상위 3곳이 58%
통신사         AP 6 · Reuters 5                     → 3.6%
트럼프 포함    213건 (71%)
쌍 107개 중    신호 1건짜리 55 · 매체 1곳짜리 60 · 트럼프 쌍 48
같은 날 같은 쌍 묶음 43개 · 중복 표 77장 · 그중 극성이 갈린 묶음 10개
```

집계 단위를 바꾼 효과와 셀 변화다.

```
결정적 표    신호 단위 244 → 하루 단위 175 (28% 축소)
(쌍,월) 셀   121개 중 극성이 달라진 셀 3개 · 불일치 표시가 붙은 셀 5개

  Jeffries×Trump 2026-08   ally → feud    feud 5건 대 ally 2건인데 ally 로 나가고 있었다
  Graham×Trump   2026-08   feud → ally    Fox 가 ally, CBS 가 feud. 이제 불일치로 표시된다
  Rand Paul×Trump 2026-07  feud → neutral 같은 이유
```

정확도도 다시 쟀다. 복구로 채점 가능한 행이 108개에서 118개로 늘었다.
**점수가 오른 것을 개선으로 읽으면 안 된다.** `npm run eval` 은 라벨의 `model` 칸을 현재
아카이브로 갱신하는데, 복구가 판정을 되살리면서 3행의 모델 판정이 바뀌었고 그 셋이 전부
정답과 일치했다. 모델도 프롬프트도 바뀌지 않았다. 게다가 그 정답 자체를 대부분 모델이 채웠다.

```
극성    100/118 = 84.7%      사람 라벨만 보면 18/20
관계쌍  103/118 = 87.3%
오류 18건 중 neutral→feud 10 · neutral→ally 4 · feud→neutral 2 · ally→neutral 1 · feud→ally 1
  → ally 와 feud 가 뒤집힌 것은 1건. 오류의 절반 이상이 "둘 사이의 행위가 아닌 기사" 를 feud 로 부른 것이다
```

**이 수치는 아직 기준선이 아니다.** 118행 중 98행의 정답을 모델이 채웠다(`by: model`).
사람 40건을 채우기 전까지 `npm run eval` 은 하락을 잡지 못한다. 그게 다음 작업이다.

검증은 이렇게 했다. 종료 코드 기준이다.

```
npm test        0   581개 통과 (timeline 26 · accumulate·canonicalSourceName 신규 포함)
npm run audit   0   FAIL 0 · WARN 0   (미분류 경고가 문턱 아래로 내려가 사라졌다)
npm run e2e     0   85/85             (표기 검사 6개 신규)
npx tsc         0
npm run build   0
```

**새 검사는 전부 실패도 시켜 봤다.** 반전 이력 제거·가중 체감 제거·`data-contested` 제거·
소스 구성 블록 차단 등 결함을 주입해 종료 코드 1 을 확인했다. 이 저장소에서 "확인했다" 가
거짓이었던 사례가 반복됐으므로, 불량을 주입해 보지 않은 검사는 검사로 세지 않는다.

복구 과정에서 배운 것 하나. 판정을 되살리자 중복 2건이 **새로 드러났다.** 미분류 신호는 쌍이
비어 있어 중복 키가 달랐고, 쌍이 돌아오자 기존 신호와 같은 키가 됐다. 감사의
`signals.duplicate` 가 잡았다 — 데이터를 고치는 변경은 감사를 다시 돌려야 한다는 사례다.

## 1. 인용 상위 논문

### 1-1. 언론 편향 자체를 다룬 것 — Top 10

| # | 논문 | 인용 | 핵심 주장 | POLARIS 에 닿는 곳 |
| --- | --- | --- | --- | --- |
| 1 | Galtung & Ruge 1965, *The Structure of Foreign News*, J. Peace Research | 3,363 | 뉴스가 되는 사건의 12개 요인. **부정적 사건은 해석이 일치해 더 쉽게 뉴스가 된다** | feud 68% 는 관계의 분포가 아니라 선별의 분포다 |
| 2 | Entman 2007, *Framing Bias: Media in the Distribution of Power*, J. Communication | 1,754 | 편향을 왜곡(distortion)·내용(content)·결정(decision-making) 편향으로 나눔. 프레이밍·프라이밍·의제설정을 권력 배분의 관점으로 통합 | 극성이 "행위" 인지 "프레임" 인지 화면에 구분해 적어야 한다 |
| 3 | DellaVigna & Kaplan 2007, *The Fox News Effect*, QJE | 1,547 | Fox 진입이 공화당 득표를 0.4~0.7%p 올렸다. 편향이 실제 결과를 바꾼다는 자연실험 | 매체 구성이 결과를 바꾼다면 우리 매체 구성(Fox 20%)도 결과를 바꾼다 |
| 4 | Gentzkow & Shapiro 2010, *What Drives Media Slant?*, Econometrica | 1,523 | 의회 발언에서 당파 어구를 뽑아 신문의 어구 사용 빈도로 slant 지수를 만듦. slant 는 소유주가 아니라 **독자 성향**이 결정 | 외부 기준(의회)에 대고 매체를 재는 방식. 우리는 통신사를 기준으로 쓸 수 있다 |
| 5 | Mullainathan & Shleifer 2005, *The Market for News*, AER | 1,225 | 독자는 믿음을 확인받길 원하고, 경쟁은 편향을 없애지 않고 **분화**시킨다 | 매체별 극성 비율이 갈리는 것이 정상 상태다. 평균하면 안 되고 보정해야 한다 |
| 6 | Gentzkow & Shapiro 2006, *Media Bias and Reputation*, JPE | 1,045 | 독자가 진실만 원해도 편향이 생긴다. 경쟁자가 오류를 드러낼 수 있을 때만 줄어든다 | 매체 간 교차 확인이 편향을 줄이는 유일한 구조적 장치 |
| 7 | Groseclose & Milyo 2005, *A Measure of Media Bias*, QJE | 1,005 | 매체가 인용하는 싱크탱크와 의원이 인용하는 싱크탱크를 대조해 매체에 ADA 점수를 부여 | "기준 집단에 대고 잰다" 는 설계. 단, 기준 선택에 결과가 민감(Gasper: NTU 하나 빼면 소거) |
| 8 | Vallone, Ross & Lepper 1985, *The Hostile Media Phenomenon*, JPSP | 872 | 같은 보도를 양쪽 당파가 모두 "상대편에 유리하다" 고 본다 | Reddit 의 지적 자체도 일부는 이 효과다. 반박이 아니라 **소스 구성을 보여주는 것**이 답이다 |
| 9 | Soroka 2006, *Good News and Bad News*, J. Politics | 861 | 사람도 언론도 나쁜 소식에 비대칭적으로 반응한다. Soroka·Fournier·Nir 2019 PNAS(463)가 17개국에서 생리반응으로 재확인 | feud 헤드라인의 거짓양성률이 ally 보다 높다고 전제해야 한다 |
| 10 | D'Alessio & Allen 2000, *Media Bias in Presidential Elections: A Meta-Analysis*, J. Communication | 518 | 59개 연구 메타분석. 편향을 **게이트키핑(선별)·커버리지(분량)·진술(논조)** 셋으로 분해 | 우리 문제는 셋 중 앞의 둘이다. 논조(LLM 극성)만 고쳐서는 안 잡힌다 |

같은 급이지만 위 표에서 뺀 것: Entman 1993 *Framing* (15,904), McCombs & Shaw 1972 *Agenda-Setting* (9,235),
Iyengar & Kinder 1987 *News That Matters* (2,687) — 편향의 이론적 토대이나 측정 방법을 주지는 않는다.
Bakshy·Messing·Adamic 2015 Science (3,274) 는 노출 편향(독자 쪽)이라 우리 문제와 축이 다르다.

### 1-2. 방법을 직접 빌려올 수 있는 것

| 논문 | 인용 | 빌려올 것 |
| --- | --- | --- |
| Baum & Groeling 2008, *New Media and the Polarization of American Political Discourse*, Political Communication | 546 | AP·Reuters 통신사 vs Daily Kos·Free Republic·Fox 를 비교. **통신사는 전통적 뉴스가치로, 당파 매체는 당파 필터로 선별**했다. 통신사를 기준선으로 쓸 근거 |
| Groeling 2010, *When Politicians Attack: Party Cohesion in the Media*, Cambridge UP | (단행본) | **값비싼 발언**(자당 비판·타당 지지)이 **값싼 발언**(자당 지지·타당 비판)보다 훨씬 잘 보도된다. 당내 충돌은 실제보다 부풀려 보이고, 당 간 공격은 정보량이 낮다 |
| Groeling 2008, *Who's the Fairest of them All?*, Presidential Studies Quarterly | — | 같은 지지율 변동이라도 CBS 는 클린턴 하락을 35% 덜, 부시 하락을 33% 더 보도. **선별 편향을 통제 실험처럼 잰 설계** |
| Budak, Goel & Rao 2016, *Fair and Balanced?*, POQ | 337 | 15개 매체, 크라우드 판정. 주요 매체는 논조 차이가 작고 **차이는 주로 어떤 이슈를 고르는가**(issue filtering)에 있다 |
| Eberl, Boomgaarden & Wagner 2017, *One Bias Fits All?*, Communication Research | 149 | 편향을 **가시성(visibility)·논조(tonality)·의제(agenda)** 셋으로 분해하고 각각 효과가 다름을 보임. 트럼프 71% 는 가시성 편향이다 |
| Kim, Lelkes & McCrain 2022, *Measuring dynamic media bias*, PNAS | 45 | 케이블 출연자의 기부 이력으로 슬랜트를 주 단위로 측정. **편향은 단기적으로도 크게 움직인다.** 매체 기준선을 고정값으로 두면 안 된다 |
| Young & Soroka 2012, *Affective News*, Political Communication | 618 | Lexicoder 감성사전(LSD). 자동 코딩은 **사람 코딩에 대고 검증**해야 하고, 9개 기존 사전과 비교했다 |
| Bestvater & Monroe 2023, *Sentiment is Not Stance*, Political Analysis | — | 감성(긍/부정 어조)과 입장(대상에 대한 태도)은 다르다. Lexicoder 를 입장 예측에 쓰면 F1 이 0.668→0.633 으로 떨어진다. 우리 극성은 **입장**이다 |
| Robertson et al. 2023, *Negativity drives online news consumption*, Nature Human Behaviour | 320 | Upworthy 10.5만 헤드라인 A/B. **부정 단어 하나당 클릭률 +2.3%.** 헤드라인은 본문보다 갈등을 팔도록 최적화된 표면이다 |
| Trussler & Soroka 2014, *Consumer Demand for Cynical and Negative News Frames*, IJPP | 336 | 독자는 말로는 긍정 뉴스를 원한다고 하지만 행동은 부정 뉴스를 고른다. 공급 문제가 아니라 수요 문제 |
| Yu & Wojcieszak 2026, *U.S. Partisan Media Criticize the Out-Party More than They Praise the In-Party*, Political Behavior | — | 50개 당파 매체 101만 게시물. **타당 비판 > 자당 칭찬**이 구조적이고, 사용자도 비판 게시물을 더 공유 |
| Penn Media Bias Detector (2024, 블로그) | — | 34,000건에서 GPT-4 로 헤드라인과 본문의 정파성을 따로 채점. **헤드라인이 본문보다 덜 편향** — 단 경제·정치 카테고리는 예외. 헤드라인=어그로 라는 통념의 반례. 검증 없이 방향을 가정하면 안 된다 |
| Hamborg, Donnay & Gipp 2019, *Automated identification of media bias*, IJDL | 216 | 자동 편향 탐지 문헌 종합. **같은 사건을 다룬 여러 매체 기사를 나란히 놓는 것**(matrix-based news analysis)이 편향을 드러내는 기본 단위 |
| Spinde et al. 2021, *BABE*, EMNLP Findings | 65 | 전문가 라벨 3,700문장. 크라우드 라벨은 편향 판정에 신뢰도가 낮아 전문가가 필요했다 |
| Gilardi, Alizadeh & Kubli 2023, *ChatGPT outperforms crowd workers*, PNAS | 1,060 | 입장·프레임 판정에서 LLM 이 크라우드보다 정확도 +25%p. **단, 훈련된 코더와 대조해 잰 뒤의 결론**이다 |
| Törnberg 2023, *ChatGPT-4 Outperforms Experts and Crowd Workers*, arXiv | 161 | 정치 트윗 당파 판정 정확도 0.934. 역시 사람 정답지가 있어서 나온 수치 |
| *LLMs as annotators: the effect of party cues* 2025, Humanities & Social Sciences Communications | — | 정당 단서를 주면 LLM 이 사람보다 **더** 단서에 끌려 라벨을 바꾼다. 우리 프롬프트는 매체명과 인물 ID 를 함께 준다 |
| Leskovec, Huttenlocher & Kleinberg 2010, *Signed Networks in Social Media*, CHI | 1,347 | 부호 네트워크의 구조 균형. 양-양-음 삼각형은 우연보다 훨씬 적다. 극성 라벨의 **일관성 검사기**로 쓸 수 있다 |
| Bro 2025, *A frustratingly easy way of extracting political networks from text*, PLOS ONE | 0 (신간) | GPT-4 로 뉴스에서 정치인 관계 부호를 뽑고 **호명투표 일치도에 대고 검증**. 우리와 같은 과제. 다만 칠레 다당제라 미국에 그대로 옮기면 소속이 다 먹는다 (이 저장소가 Cruz×Hawley 98.6% 로 이미 확인) |

## 2. 문헌이 우리 문제를 어떻게 분해하는가

D'Alessio & Allen 과 Eberl 의 분해를 합치면 셋이다. 셋 다 지금 파이프라인에 있다.

```
게이트키핑(선별)   무엇이 뉴스가 되는가       → feud 68%. Galtung & Ruge, Groeling 2010, Soroka
커버리지(가시성)   누가 얼마나 나오는가       → 트럼프 71%. Eberl 의 visibility bias
진술(논조)         어떻게 서술되는가          → LLM 극성. 이것만 우리가 "판정" 이라 부른다
```

조사 시점의 코드는 셋 중 세 번째만 다뤘다. 앞의 둘은 LLM 프롬프트를 아무리 고쳐도 안 잡힌다 —
프롬프트에 들어오는 헤드라인 집합 자체가 이미 기울어 있기 때문이다.

A2 의 하루 한 표는 게이트키핑 편향에 **부분적으로** 닿는다. 같은 사건의 반복 보도를 한 표로
줄이지만, 어떤 사건이 애초에 기사가 되는가는 그대로다. 가시성 편향(트럼프 71%)은 손대지
않았고 화면에 적어 두기만 했다 — 수집 범위를 바꾸는 일이라 알고리즘으로 고칠 것이 아니다.

문헌이 반복해서 말하는 처방은 하나다. **절대값을 읽지 말고 기준선 대비로 읽어라.**
Groseclose & Milyo 는 의회를, Gentzkow & Shapiro 는 의회 발언을, Baum & Groeling 은 통신사를,
Kim et al. 은 기부 이력을 기준선으로 썼다. 우리에게 가장 가까운 기준선은 AP·Reuters 다 —
Baum & Groeling 이 뉴스가치 기준으로 선별한다고 실측한 곳이고, 우리 허용 목록에 이미 있다.
문제는 그 둘이 3.6% 라는 것이다. 이건 알고리즘이 아니라 수집 구성으로 고친다 (`outletFeeds` 에
AP·Reuters 정치 피드가 없다).

## 3. 추천 알고리즘 5개

각각 (a) 근거 논문, (b) 지금 코드의 어디를 바꾸는지, (c) 계산, (d) **실패시켜 보는 법**을 적는다.
이 저장소에서 "통과" 가 거짓이었던 사례가 반복됐으므로 (d) 없는 것은 넣지 않았다.
인물 속성과 관계 신호를 섞지 않는 원칙은 그대로다 — 아래 어느 것도 자금·표결을 엣지로 만들지 않는다.

### A1. 매체 기준선 보정 가중 (outlet-calibrated surprisal weighting) — 보류

**근거.** Groseclose & Milyo 2005, Gentzkow & Shapiro 2010, Baum & Groeling 2008, Budak et al. 2016,
Kim et al. 2022(기준선은 움직인다).

**문제.** CNN 의 feud 헤드라인(88%)과 Reuters 의 feud 헤드라인(0%)이 같은 한 표다.
CNN 이 feud 라고 하는 것은 CNN 이 늘 하는 일이라 정보량이 낮고, Reuters 가 feud 라고 하면
드문 일이라 정보량이 높다.

**계산.** 매체 o 의 극성 p 에 대한 기준율을 최근 90일 이동창에서 잡되, 표본이 적은 매체는
전체 분포로 수축시킨다 (empirical Bayes, 사전 강도 k=20).

```
π(p | o)      = (n_{o,p} + k · π(p)) / (n_o + k)
w(signal)     = -log π(p | o)                       // 놀라움(surprisal). 흔한 판정일수록 가벼워진다
w(signal)    *= 1 if o ∈ {AP, Reuters} else λ       // 통신사 기준선. λ 는 1 로 시작하고 라벨로 조정
```

기준율은 **쌍 유형별**로 따로 잡는다 — 같은 당 쌍과 다른 당 쌍. Groeling 2010 에 따르면 당 간
feud 는 값싼 발언이라 기준율이 높고(정보량 낮음), 당내 feud 는 값비싼 발언이라 실제보다 부풀려
보도된다(정보량은 있으나 빈도는 과장). 둘을 한 기준율로 합치면 트럼프×슈머 feud 와
트럼프×매시 feud 가 같은 무게가 된다. "같은 당" 은 정당이 아니라 `crosswalk.caucus` 로 본다.

**바꾸는 곳.** `domain/timeline.ts` 의 `POL_WEIGHT` 상수를 신호별 가중 함수로 교체.
기준율 계산은 `scripts/news-pipeline/core.mts` 에 순수 함수로 두고, 결과를 `signals/index.json`
매니페스트에 `outletBaseline` 으로 실어 앱이 다시 계산하지 않게 한다.

**실패시켜 보는 법.** 한 매체의 모든 신호를 feud 로 바꾼 합성 아카이브를 넣으면 그 매체의
feud 가중치가 0 에 수렴해야 한다. 반대로 매체 하나에 신호가 1건뿐이면 가중치가 전체 분포
근처에 머물러야 한다(수축이 작동한다는 뜻). 둘 중 하나라도 아니면 실패.

**위험.** Groseclose & Milyo 가 받은 비판이 그대로 온다 — 기준선 선택에 결과가 민감하다.
통신사 표본이 11건인 지금 상태에서 λ 를 1 이상으로 올리면 그 11건이 아카이브를 지배한다.
λ 는 라벨 정답지로 맞춘 뒤에만 1 을 벗어난다.

### A2. 하루 한 표와 매체 간 삼각측량 (day-level triangulation) — 넣음

**근거.** Hamborg et al. 2019(같은 사건을 나란히), Budak et al. 2016(차이는 선별에 있다),
Gentzkow & Shapiro 2006(교차 확인만이 편향을 줄인다), D'Alessio & Allen 의 커버리지 편향.

**문제.** 같은 사건을 다섯 매체가 쓰면 표가 다섯 장 들어간다. 그 다섯이 전부 한 통신사
기사를 받아쓴 것일 수도 있다. 같은 날 같은 쌍 묶음 41개 중 10개는 극성까지 갈렸는데,
지금은 둘 다 그대로 표가 된다.

**설계를 바꾼 측정.** 처음에는 제목 토큰 Jaccard 로 사건을 나누려 했다. 재어 보니 **양방향으로
틀린다.** 같은 날 같은 쌍인 묶음 43개 안의 제목쌍 156개를 전부 계산했다.

```
같은 사건인데 유사도가 낮다   J=0.10  "Trump blames Minnesota water hacks on Walz"
                                      "Fact check: Trump baselessly claims Walz is 'behind' cyberattack"
다른 사건인데 같은 날이다      J=0.11  "Trump says he may pull Blanche's nomination until Cornyn and Tillis…"
                                      "Trump doesn't give a f*** what Tillis or Ernst think about Hegseth"
임계별 걷히는 표   0 → 77장 · 0.15 → 64 · 0.25 → 47 · 0.35 → 29 · 0.5 → 11
```

그래서 **사건을 탐지한다고 주장하지 않는다.** 하루를 하루로 센다. 결정적이고 검증 가능하며,
"오늘 이 두 사람 사이에 무언가 있었다" 는 것이 세려는 값에 더 가깝다.

**구현한 계산** (`src/domain/timeline.ts` `groupByDay`).

```
단위        = (pair, 같은 날)
그날의 판정 = 다수가 2/3 이상이어야 인정. 못 넘으면 null — 투표하지 않는다
가중        = 1 + ln(그날의 고유 매체 수)    // 다섯 매체가 다섯 표가 되지 않게 체감
contested   = 그날 ally 와 feud 가 함께 나왔다
```

불일치 자체가 정보다. Fox 가 ally, CBS 가 feud 라고 한 Graham×Trump 는 둘 중 하나가 틀렸다는
뜻이고, 그걸 숨기고 하나를 고르는 것이 예전 동작이었다.

**신호를 지우지 않는다.** `dedupeByStory` 는 그대로 두고 집계 단위만 바꿨다. 같은 사건을 다섯
매체가 쓴 것은 와이어 목록에서는 다섯 건이 맞다 — 표가 다섯 장이 되는 것이 문제였다.

**실패시켜 보는 법(했다).** 가중 체감을 지워 `weight = outlets` 로 바꾸니 "다섯 매체가 한 표"
테스트가 빨간불, 종료 코드 1 이었다. 테스트 7개가 이 규칙을 고정한다.

**남은 위험.** 같은 날 벌어진 서로 다른 두 사건이 한 표로 합쳐진다. 위 Tillis 예가 그렇다.
"하루 한 표" 라고 부르는 이유이고, 사건 단위라고 부르지 않는 이유다.

### A3. 비대칭 잡음 감지기 모형 (asymmetric-noise relationship state) — 앞부분만 넣음

**근거.** Soroka 2006 / Soroka·Fournier·Nir 2019, Galtung & Ruge 1965, Robertson et al. 2023,
Trussler & Soroka 2014, Groeling 2010.

**문제.** 지금 월별 셀은 그 달 첫 비중립 신호가 정한다(0-1). feud 헤드라인이 ally 보다
훨씬 자주 생산되는 구조에서 이 규칙은 **어그로 헤드라인 한 건이 한 달의 극성을 정할 수 있다**는
뜻이다. 그리고 우리 라벨이 그 방향을 실측으로 보여준다 — 오류 14건 중 7건이 neutral→feud 다.
문헌(Soroka, Robertson)은 이것이 우연이 아니라고 말한다. 부정 단어가 클릭을 만들기 때문에
헤드라인은 갈등 쪽으로 과장되고, 분류기는 그 표면을 읽는다.

**앞부분만 넣었다.** 가중 다수결과 반전 이력은 라벨 없이도 정당하다 — 6:1 이 1 에 지면 안 된다.
비대칭 우도는 사람 라벨 40건 뒤로 미뤘다.

**구현한 계산** (`src/domain/timeline.ts` `tallyMonth`). **임계는 2배 하나뿐이다.**

```
월 집계   하루 표를 가중 합산 (가중은 A2)
승자      ally 와 feud 중 큰 쪽. 동률이면 이전 달을 지킨다
반전      이전 달과 다르면 승자가 패자의 2배 이상일 때만 인정
불일치    그날 안에서 갈렸거나, 이겼어도 2배에 못 미치면 셀에 표시한다 (색은 그대로 둔다)
```

이력을 두는 이유는 이것이다. 진짜 반전은 여러 매체가 여러 날 보도하므로 2배를 넘고,
어그로 헤드라인 한 건은 못 넘는다.

**보류한 뒷부분 — 비대칭 우도.** 헤드라인을 잡음 있는 감지기로 보고 극성별로 다른 오판율을
둔 베이즈 갱신을 한다. 오판율은 이미 잴 수 있다 (라벨 118행 실측, 2026-09-03).

```
P(obs=feud | 실제 neutral) = 10/33 ≈ 0.30    ← 가장 큰 누수. 행위 아닌 기사가 feud 로
P(obs=ally | 실제 neutral) =  4/33 ≈ 0.12
P(obs=ally | 실제 feud)    =  1/72 ≈ 0.01
P(obs=feud | 실제 ally)    =  0/13 → 0.05 로 바닥을 둔다 (표본 13건은 0 을 믿기엔 적다)
```

비대칭의 뜻은 이것이다. feud 관측 하나는 "진짜 feud" 와 "행위 아닌 기사" 사이에서 30% 의
불확실성을 안고 들어오고, ally 관측은 12% 다. 같은 1건이라도 feud 가 확신을 덜 움직여야 한다.

**넣지 않은 이유는 표본이다.** 118행 중 98행의 정답을 모델이 채웠다. 모델이 채운 정답으로
잰 오판율을 그 모델의 출력을 보정하는 데 쓰면 순환이다. 사람 40건이 먼저다.

핵심은 **flip 에 이력(hysteresis)을 두는 것**이다. 트럼프×머스크 같은 실제 반전은 여러 매체가
여러 날 보도하므로 임계를 넘고, 어그로 한 건은 못 넘는다.

**바꾼 곳.** `domain/timeline.ts` 의 `liveByMonth` 집계 블록. 순수 함수라 테스트가 붙는다.
`groupByDay`·`tallyMonth` 를 같은 파일에 뒀다 — `audit:boundary` 가 `src/domain` 의 값 import 를
전면 금지해서 별도 파일로 뺄 수 없다. 창 이전의 달까지 훑고 창 안의 것만 내보낸다. 반전 판정이
창 경계에서 끊기면 창을 1년에서 3개월로 좁혔다는 이유만으로 같은 달의 색이 달라진다.

**실패시켜 보는 법(했다).** 옛 구현과 새 구현에 같은 입력을 넣어 대조했다.

```
feud 1건 뒤 ally 6건       옛 feud   → 새 ally
같은 날 ally·feud 가 갈림   옛 ally   → 새 neutral (불일치)
```

반전 이력을 지워 `DECISIVE_RATIO = 1` 로 바꾸니 테스트 2개가 빨간불, 종료 코드 1 이었다.
테스트 26개가 이 규칙을 고정한다.

**남은 위험.** 진짜 급변(하루 만에 결별)을 한 달 늦게 보여준다. 지금은 불일치 표시로만
드러난다. 셀에 "이번 달 하루 표 n개 중 feud m개" 를 원자료로 같이 적는 것이 다음이다 —
부드럽게 만든 값만 보여주면 그게 또 하나의 편집 판단이 된다.

### A4. 단서 차단 이중 판정과 보정된 신뢰도 (cue-blind dual pass, calibrated confidence) — 이중 패스 기각, 보정은 보류

**근거.** Young & Soroka 2012(사람 코딩에 대고 검증), Gilardi et al. 2023 / Törnberg 2023
(LLM 은 정답지가 있을 때만 "정확하다" 고 말할 수 있다), *LLMs as annotators: party cues* 2025
(단서가 라벨을 흔든다), Bestvater & Monroe(감성 ≠ 입장), Spinde et al. 2021(전문가 라벨).

**문제.** 프롬프트가 매체명을 준다. 문헌은 LLM 이 정당·출처 단서에 사람보다 더 끌린다고
한다 — "Fox News" 라는 문자열이 극성 판정에 들어가고 있을 가능성을 우리는 재지 않았다.
`confidence` 는 모델의 자기보고이고 12개 값에 중앙값 0.9 로 정보가 거의 없는데, 어디에도
쓰이지 않아 해도 안 된 셈이다. 정답지는 있지만 사람이 확인한 행이 20건이라 기준선 임계(40)
에 못 미친다 — 그래서 `accuracy.ok` 는 지금 정보일 뿐 하락을 잡지 못한다.

**계산.**

```
1패스   지금 프롬프트 그대로 (매체명 포함)
2패스   매체명을 지우고 날짜·인물·제목만 (cue-blind)
일치    두 패스의 극성이 같으면 채택, 다르면 polarity=null + reason='cue-sensitive'
α       배치마다 두 패스의 Krippendorff's α 를 로그에 남기고 index.json 에 싣는다
보정    자기보고 confidence 대신, 라벨 정답지에서 (1패스·2패스 일치 여부 × 극성) 별
        실제 정확도를 재서 그 값을 confidence 로 쓴다 (isotonic 은 표본이 40건 넘은 뒤)
```

"cue-sensitive" 라벨은 A3 의 우도에 들어가지 않고 화면에는 `미판정` 과 같은 급으로 적는다.
침묵을 삭제로 해석하지 않는 원칙은 그대로다 — 원본 신호는 남는다.

**바꾸는 곳.** `llm.mts` `classifyBatch` 에 listing 생성을 매개변수화하고 두 번 부른다.
비용은 두 배지만 배치 10건이라 하루 30배치 → 60배치다.
`scripts/eval/labels.json` 의 모델 1차 98행을 사람이 확인해 `by: human` 을 40건 이상으로
**먼저** 올린다. 이게 없으면 A1~A3 의 파라미터 전부가 감으로 정한 값이 되고, A3 의 우도 초기값도
모델이 모델을 채점한 숫자 위에 서 있게 된다. 표본은 이미 층화돼 있으니 남은 것은 20행을 읽는 일이다.

### A4 의 단서 실험 — 돌렸고, 이중 패스는 기각됐다 (2026-09-04)

계획했던 실험을 실제 파이프라인(`llm.mts` `classifyBatch`)으로 돌렸다. 설계에서 두 가지가
중요했다.

- **소음 바닥을 함께 잰다.** temperature 가 0.2 라 같은 입력도 흔들린다. 같은 조건을 두 번
  돌린 불일치를 재지 않으면 그 흔들림을 단서 효과로 잘못 읽는다
- **제목의 매체 접미사를 지운다.** Google News 제목은 `" - The Hill"` 로 끝난다. `source`
  필드만 바꾸고 제목을 두면 진짜 매체가 그대로 새어 나가 실험이 무의미해진다

배치 구성과 순서는 조건마다 동일하게 뒀다 — 같은 배치의 다른 항목이 판정에 영향을 준다.

```
실험 1 (표본 20 · 제목 접미사 제거 · 배치 구성 고정)
  단서 효과   Fox News vs NPR      0/14 = 0%
  원본 vs Fox                      0/15 = 0%
  원본 vs NPR                      0/14 = 0%
  소음 바닥   같은 입력 2회         2/15 = 13%

실험 2 (표본 30 · temperature 대조)
  temperature 0.2  같은 입력 2회    0/24 = 0%
  temperature 0    같은 입력 2회    1/24 =  4%
```

**결론 1 — 이중 패스는 뺀다.** 매체명을 좌우로 갈아끼워도 극성이 **한 건도** 바뀌지 않았다.
문헌(*LLMs as annotators: party cues*)이 경고한 단서 민감성이 이 프롬프트·이 모델에서는
측정되지 않는다. 비용을 두 배로 쓸 근거가 없다. A4 에서 살아남는 것은 **보정된 신뢰도**뿐이고,
그건 사람 라벨 40건 뒤의 일이다.

**결론 2 — 소음 수치를 믿지 마라.** 같은 조건에서 13% 와 0% 가 나왔다. n=15~24 에서는 한
건이 뒤집힐 때마다 4~13%p 가 움직인다. **재현성을 말하려면 표본이 훨씬 커야 한다.**

**결론 3 — temperature 는 건드리지 않는다.** 0 으로 낮췄더니 불일치가 오히려 1건 늘었다
(0/24 → 1/24). 차이라고 부를 수 없는 크기지만, 적어도 "샘플링이 원인" 이라는 가설은 지지되지
않는다. 이 수치로 설정을 바꾸면 이 저장소가 경고하는 그것이 된다 — 소음을 보고 고친 뒤
좋아졌다고 믿는 것.

흔들린 항목은 무작위가 아니라 **경계에 있는 헤드라인에 몰렸다.** "JD Vance and the Trump team
keep moving the goalposts on Iran" 은 두 실험 모두에서 뒤집혔다(neutral→ally, neutral→feud).
고칠 곳이 있다면 온도가 아니라 이런 문장을 어떻게 다룰지다.

**위험.** 두 패스가 같은 모델이면 같은 방향으로 틀릴 수 있다. 위 실험은 "흔들리는가" 만 재고
"맞는가" 는 못 잰다. 정답지 대비 정확도가 여전히 진짜 지표다.

### A5. 구조 균형 일관성 검사 (signed-triad balance check) — 보류

**근거.** Leskovec, Huttenlocher & Kleinberg 2010, Heider 의 균형 이론, Bro 2025.

**문제.** 극성 라벨은 기사 하나씩 독립으로 붙는데, 관계는 그래프 안에 있다. A–B ally, B–C ally
인데 어느 달 A–C 가 feud 로 뜨면 셋 중 하나가 틀렸을 확률이 높다. Leskovec 은 실제 부호
네트워크에서 양-양-음 삼각형이 우연보다 훨씬 적음을 보였다. 지금은 이 정보를 전혀 쓰지 않는다.

**계산.** 큐레이션 엣지(266) + 이달의 신호 극성(A3 의 posterior 가 0.6 이상인 것)으로 부호
그래프를 만들고, 각 신호 극성이 속한 삼각형의 균형 여부를 센다.

```
balanced(a,b,c) = sign(ab) · sign(bc) · sign(ca) > 0
불균형 비율     = 이 극성이 만드는 불균형 삼각형 / 이 극성이 속한 삼각형
불균형 비율 > 0.5 이고 삼각형 ≥ 3 이면 → 화면에 '주변 관계와 어긋남' 배지, A3 우도 가중 0.5
```

**하지 않는 것.** 균형을 이유로 극성을 **바꾸지 않는다.** 배지만 붙인다. 정치에서 불균형
삼각형은 실제로 존재하고(당내 반란이 정확히 그것이다), 그걸 알고리즘이 지우면 Massie×Trump
가 사라진다. Bro 2025 는 GPT-4 극성을 호명투표 일치도로 검증했는데, 미국 양당제에서 그
검증은 소속을 재는 것이 된다(이 저장소가 Cruz×Hawley 98.6% 로 확인). 그래서 외부 검증은
**같은 코커스 안에서만**, 그리고 eval 지표로만 쓴다 — "뉴스 ally 쌍이 뉴스 feud 쌍보다
공동발의가 많은가" 를 재서 `npm run eval` 에 적고, 무신호면 무신호라고 적는다. 이 저장소가
여섯 번 재서 여섯 번 무신호였던 종류의 검증이므로 있을 것이라고 가정하지 않는다.

**바꾸는 곳.** 새 순수 함수 `domain/balance.ts` (값 import 없이 엣지 배열을 인자로).
`audit:data` 에 `signals.balance` 를 추가하되 **경고**로만 — 불균형은 오류가 아니다.

**실패시켜 보는 법.** 큐레이션 ally 삼각형 A–B–C 에 A–C feud 신호를 주입하면 불균형 비율 1.0,
배지 on. 삼각형이 2개뿐인 노드에 주입하면 배지 off (표본 부족 조건). 큐레이션 feud 삼각형
(적의 적)에 ally 를 주입해도 배지 on 이어야 한다 — 부호 곱이 음수이므로.

**위험.** 신호의 71% 가 트럼프 쌍이라 대부분의 삼각형이 트럼프를 지나고, 사실상 "트럼프와의
관계와 일관되는가" 검사가 된다. 허브를 뺀 삼각형만 세는 변형을 같이 두고 둘을 비교한다.

## 4. 넣은 것과 보류한 것

넷을 넣었다(0-2). 나머지는 **표본이 없어서** 보류했다. 없이 넣으면 이 저장소가 경고하는
그것이 된다 — "프롬프트를 고치고 좋아졌다고 믿는 것".

```
[넣음] accumulate 판정 보존 + git 이력 복구       미분류 9.2% → 0.3%
[넣음] A2 하루 한 표                              결정적 표 28% 축소
[넣음] A3 앞부분 — 가중 다수결·반전 이력          셀 3개 교정, 5개에 불일치 표시
[넣음] 화면 표기 — 매체 구성·판정 불일치

[다음] labels.json 모델 1차 98행 중 20행을 사람이 확인 → by=human 40건, baseline 기록
[기각] A4 이중 패스 — 단서 실험에서 매체명 효과 0/14 (2026-09-04)
[보류] A3 뒷부분(비대칭 우도) · A4 신뢰도 보정        라벨 40건 뒤
[보류] A1 매체 가중                                    통신사 표본을 늘린 뒤
[보류] A5 구조 균형                                    트럼프 밖 삼각형이 늘어난 뒤
```

**A1 을 왜 보류했는가.** 넣어 보고 판단한 것이 아니라 계산해 보고 접었다. 통신사가 11건뿐이라
수축(k=20)하면 추정의 71%를 전체 사전에서 빌린다. 기준선이 되어야 할 값이 전체 평균을
되풀이한다. 그리고 두 큰 매체의 가중이 사실상 같다.

```
The Hill  n=82  원값 60%  수축후 59%  가중 0.52
Fox News  n=55  원값 64%  수축후 62%  가중 0.48
CNN       n=27  원값 85%  수축후 73%  가중 0.31
통신사 표본 8건(분류·쌍 기준) → 수축 비중 71% 가 전체 사전에서 온다
```

먼저 할 일은 알고리즘이 아니라 수집 구성이다. `config.mts` 의 `outletFeeds` 에 AP·Reuters
정치 RSS 가 없다. 통신사가 3.6% 를 벗어나기 전에는 어느 보정도 안정적이지 않다.

**A5 를 왜 보류했는가.** 신호로 만들어지는 삼각형 39개 중 트럼프를 지나지 않는 것이 2개다.
지금 넣으면 구조 균형 검사가 아니라 "트럼프와의 관계와 일관되는가" 검사가 된다.

## 5. 출처

인용 수는 OpenAlex API (`api.openalex.org/works?search=`) 2026-09-02 조회값이다.

- Galtung & Ruge 1965 — https://doi.org/10.1177/002234336500200104
- Entman 2007 — https://doi.org/10.1111/j.1460-2466.2006.00336.x
- DellaVigna & Kaplan 2007 — https://doi.org/10.1162/qjec.122.3.1187
- Gentzkow & Shapiro 2010 — https://doi.org/10.3982/ecta7195
- Mullainathan & Shleifer 2005 — https://doi.org/10.1257/0002828054825619
- Gentzkow & Shapiro 2006 — https://doi.org/10.1086/499414
- Groseclose & Milyo 2005 — https://doi.org/10.1162/003355305775097542 · 비판: Gasper 2011, Nyhan 2005
- Vallone, Ross & Lepper 1985 — https://doi.org/10.1037/0022-3514.49.3.577
- Soroka 2006 — https://doi.org/10.1111/j.1468-2508.2006.00413.x · Soroka, Fournier & Nir 2019 — https://doi.org/10.1073/pnas.1908369116
- D'Alessio & Allen 2000 — https://doi.org/10.1111/j.1460-2466.2000.tb02866.x
- Baum & Groeling 2008 — https://doi.org/10.1080/10584600802426965
- Groeling 2010 — Cambridge UP, ISBN 9780521842093 · Groeling 2008 — Presidential Studies Quarterly 38(4)
- Budak, Goel & Rao 2016 — https://doi.org/10.1093/poq/nfw007
- Eberl, Boomgaarden & Wagner 2017 — https://doi.org/10.1177/0093650215614364
- Kim, Lelkes & McCrain 2022 — https://doi.org/10.1073/pnas.2202197119
- Young & Soroka 2012 — https://doi.org/10.1080/10584609.2012.671234
- Bestvater & Monroe 2023, *Sentiment is Not Stance* — Political Analysis 31(2) · *Stay Tuned* — https://doi.org/10.1017/pan.2025.10023
- Robertson et al. 2023 — https://doi.org/10.1038/s41562-023-01538-4
- Trussler & Soroka 2014 — https://doi.org/10.1177/1940161214524832
- Yu & Wojcieszak 2026 — https://doi.org/10.1007/s11109-025-10115-6
- Penn Media Bias Detector — https://mediabiasdetector.seas.upenn.edu/blog/don-t-judge-a-news-story-by-its-headline/
- Hamborg, Donnay & Gipp 2019 — https://doi.org/10.1007/s00799-018-0261-y
- Spinde et al. 2021 — https://doi.org/10.18653/v1/2021.findings-emnlp.101
- Gilardi, Alizadeh & Kubli 2023 — https://doi.org/10.1073/pnas.2305016120
- Törnberg 2023 — https://doi.org/10.48550/arxiv.2304.06588
- LLMs as annotators: party cues 2025 — https://www.nature.com/articles/s41599-025-05834-4
- Leskovec, Huttenlocher & Kleinberg 2010 — https://doi.org/10.1145/1753326.1753532
- Bro 2025 — https://doi.org/10.1371/journal.pone.0313149
- Groeling 2013 (리뷰) — https://doi.org/10.1146/annurev-polisci-040811-115123
- Puglisi & Snyder 2015 (리뷰) — https://doi.org/10.1016/b978-0-444-63685-0.00015-2
- Prior 2013 (리뷰) — https://doi.org/10.1146/annurev-polisci-100711-135242
