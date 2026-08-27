# POLARIS — U.S. Politician Relationship Atlas

**An interactive graph of who in American politics is allied with whom, who is feuding with whom — and how those bonds flip over time.**

101 figures. 266 curated relationships. A nightly pipeline that reads the political press, asks an LLM who just fell out with whom, and folds the answer into a rolling one-year archive. Fully bilingual (English / 한국어). No backend — the whole thing is static files.

![POLARIS demo](docs/demo.gif)

> **[English](#english)** · **[한국어](#한국어)**

---

## English

### What it is

Most political coverage is a stream of isolated events. POLARIS is an attempt to render the *structure* underneath: a force-directed graph where every edge is a documented relationship — alliance, feud, bipartisan bridge, political family, mentorship — and where the news layer on top shows which of those edges are moving right now.

The thesis it makes visible: modern U.S. politics is a **hub-and-spoke network**, not two blocs. Remove the hub and the network doesn't split in two — it atomizes.

### Features

| | |
|---|---|
| **Relationship graph** | 2D canvas and 3D WebGL views of 101 figures across the executive branch, Senate, House, governorships, and non-elected power. Ctrl-drag to rotate in either mode. |
| **Legend as filter** | The legend at bottom-left *is* the control. Toggle a relationship type and those edges vanish while any node left without a visible tie dims — so you see what was filtered, not just a thinner graph. |
| **Live news wire** | Each profile shows recent articles that mention the person, classified by an LLM as alliance-leaning, feud-leaning, or neutral. |
| **Relationship timeline** | Track two people and the ANALYSIS tab draws a month-by-month strip of their relationship polarity, marking the turning points. Trump × Musk shows the June 2025 blow-up and the January 2026 Mar-a-Lago reconciliation. |
| **Guided stories** | Seven curated tours through structural patterns — the Mar-a-Lago gravity well, the GOP civil war, the Democratic generational fight, endangered bipartisan bridges. |
| **Bilingual** | Every label, description, and LLM-generated summary exists in both English and Korean. The classifier writes both languages in a single pass. |
| **Data recency, visible** | A badge shows the actual date range of the articles in the dataset and how long ago the pipeline last ran — green under 24h, amber under 3 days, red beyond. |

### How it works

```mermaid
flowchart TB
    subgraph S["Sources"]
        A["Outlet RSS ×7<br/>Fox · CNN · NPR · Politico · Hill · Axios · Roll Call"]
        B["Google News RSS<br/>per-person queries"]
        C["Curated dataset<br/>101 people · 266 edges"]
    end

    subgraph P["Nightly pipeline — GitHub Actions, 13:00 UTC"]
        D["1 · fetch<br/>source allowlist + alias matching"]
        E["2 · extract<br/>LLM classify, batches of 10"]
        L(["NVIDIA NIM<br/>Nemotron"])
        F["3 · merge<br/>365-day rolling archive"]
        G["4 · validate<br/>schema + person-id integrity"]
        H["5 · commit<br/>news-signals.json"]
    end

    subgraph B2["Browser — no runtime backend"]
        I["Zustand stores"]
        J["d3-force + centering force"]
        K["Canvas 2D / WebGL"]
    end

    A --> D
    B --> D
    C --> D
    D --> E --> F --> G --> H
    E <-. classify .-> L
    H --> I --> J --> K
    W["Wikipedia REST<br/>portraits, lazy"] -. client-side .-> K
```

**Full technical write-up:** [`docs/architecture.html`](docs/architecture.html) — pipeline stages, rendering decisions, and the performance work, with diagrams. *(GitHub shows HTML as source; open it locally, or enable GitHub Pages on this repo to view it rendered.)*

The short version:

1. **Fetch** — seven outlet RSS feeds directly, plus per-person Google News queries built from an alias table. Google News results pass an allowlist of 17 domains and 20 outlet names. Only articles naming two or more people in the dataset become pair candidates.
2. **Classify** — candidates go to an LLM in batches of ten, which returns the relevant pair, a polarity, a confidence score, and a bilingual summary. Without an API key the pipeline degrades to unclassified co-mention signals rather than failing.
3. **Merge** — new signals are unioned with the existing file by stable id, trimmed to 365 days, capped at 1,500. A single run only sees a 30-day window; the archive is what makes the timeline possible.
4. **Validate** — schema, count consistency, and that every referenced person id actually exists.
5. **Commit** — the workflow writes the JSON back to the repo. There is no server: the dataset ships as a static import.

### News sources

Signals are drawn only from these outlets — seven polled directly by RSS, the rest reached through Google News and filtered by an allowlist:

**Wires & networks** — Associated Press · Reuters · CNN · Fox News · NBC News · ABC News · CBS News · NPR
**Politics desks** — Politico · The Hill · Axios · Roll Call · Semafor · Washington Examiner
**Nationals** — The New York Times · The Washington Post · The Wall Street Journal

Portraits and biography links come from the **Wikipedia REST API**, fetched lazily in the browser. No image bytes are stored in this repo.

### Techniques worth stealing

- **Legend-as-filter with dimming.** Hiding edges alone makes a graph quietly wrong. Dimming the now-unconnected nodes makes the filter legible.
- **Fit to the core, not the outliers.** `zoomToFit` over every last node lets two strays shrink the real cluster into a corner. Fitting the core 97% by distance from the centroid keeps the graph filling the viewport on any monitor size.
- **A weak centering force.** Link-less nodes receive only charge repulsion and drift off-screen forever. A gentle pull toward the origin keeps the layout compact — and fixes the framing problem at its root.
- **Fit on engine stop, once.** Fitting on a timer frames coordinates that are still spreading. Fitting on *every* stop yanks the camera back each time the user rotates.
- **Cache 3D node objects; mutate materials for selection.** Building `nodeThreeObject` inline captures selection state, so every click rebuilt all 101 nodes' geometry and canvas textures — a 167 ms frame and a steady GPU leak. Caching by id and updating material colour in place: worst frame 50 ms, heap 69 → 40 MB.
- **Accumulate, never overwrite, time-series data.** The pipeline originally replaced its output each run, so a weak fetch could erase the archive. It merges by id with a 365-day window instead.
- **Match source names on word boundaries.** A bare `'AP'` in an allowlist, matched by substring, silently admits CoinG**ap**e, Yahoo News Sing**ap**ore, and Tele**grap**hHerald.

### Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build

npm run news         # refresh news signals (needs NEWS_LLM_API_KEY)
npm run news:dry     # same, writes to a scratch file instead

node scripts/e2e/polaris.e2e.mjs    # 45 Playwright checks against a real browser
node scripts/demo/record.mjs        # regenerate docs/demo.gif (needs ffmpeg)
```

The LLM step expects an OpenAI-compatible endpoint. It defaults to NVIDIA NIM:

```
NEWS_LLM_API_KEY=...
NEWS_LLM_BASE_URL=https://integrate.api.nvidia.com/v1
NEWS_LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

### Honest caveats

- **The relationship data is editorial.** Those 266 edges are hand-curated from public reporting. Someone else reading the same coverage would draw a different graph. Treat it as an argument, not a record.
- **The LLM classifier is not a fact-checker.** It reads headlines and summaries, not full articles, and it is wrong sometimes. Polarity is a signal, not a verdict.
- **Coverage skews to national English-language press**, and therefore toward the figures that press covers most.

### Stack

React 18 · TypeScript · Vite · Tailwind · Zustand · react-force-graph (d3-force + three.js) · Framer Motion · Playwright · Node 22 native TypeScript for the pipeline · GitHub Actions

### License

MIT — see [LICENSE](LICENSE).

---

## 한국어

### 무엇인가

정치 뉴스는 대개 사건의 나열로 소비됩니다. POLARIS는 그 아래 깔린 **구조**를 그리려는 시도입니다. 모든 엣지가 공개 보도에 근거한 실제 관계 — 동맹, 갈등, 초당적 다리, 정치 가족, 멘토·계승 — 이고, 그 위에 뉴스 레이어가 얹혀 지금 어떤 관계가 움직이고 있는지 보여줍니다.

화면이 드러내는 명제 하나: 현재 미국 정치는 두 개의 블록이 아니라 **하나의 허브와 수십 개의 축**입니다. 허브를 제거하면 네트워크는 둘로 갈라지는 게 아니라 흩어집니다.

### 기능

| | |
|---|---|
| **관계 그래프** | 행정부·상원·하원·주지사·비선출 권력에 걸친 101명을 2D 캔버스와 3D WebGL로. 두 모드 모두 Ctrl+드래그로 회전. |
| **범례가 곧 필터** | 좌측 하단 범례가 컨트롤입니다. 관계 유형을 끄면 해당 선이 사라지고, 남은 관계가 없어진 노드는 어두워집니다 — 그래프가 그냥 성겨지는 게 아니라 무엇이 걸러졌는지 보입니다. |
| **실시간 뉴스 와이어** | 인물별 최근 기사에 LLM이 동맹/갈등/중립 극성을 붙여 보여줍니다. |
| **관계 시계열** | 두 인물을 추적하면 ANALYSIS 탭이 월별 호불호 스트립을 그리고 변곡점을 표시합니다. 트럼프 × 머스크는 2025년 6월 결별과 2026년 1월 마라라고 화해가 그대로 드러납니다. |
| **가이드 스토리** | 구조적 패턴을 따라가는 큐레이션 투어 7편 — 마라라고 중력장, GOP 내전, 민주당 세대전쟁, 멸종위기의 초당적 다리. |
| **완전 이중언어** | 모든 레이블·설명과 LLM 요약이 영어·한국어로 존재합니다. 분류기가 한 번의 호출로 두 언어를 함께 씁니다. |
| **데이터 신선도 표시** | 수록된 기사의 실제 날짜 범위와 마지막 파이프라인 실행 경과를 배지로 — 24시간 이내 초록, 3일 이내 호박, 그 뒤 빨강. |

### 동작 방식

전체 기술 문서: [`docs/architecture.html`](docs/architecture.html) — 파이프라인 단계, 렌더링 결정, 성능 개선 내역을 다이어그램과 함께. *(GitHub는 HTML을 소스로 보여줍니다. 로컬에서 열거나 저장소에 GitHub Pages를 켜면 렌더링된 화면을 볼 수 있습니다.)*

요약하면:

1. **수집** — 7개 언론사 RSS를 직접 폴링하고, 별칭 테이블로 만든 인물별 Google News 쿼리를 더합니다. Google News 결과는 17개 도메인·20개 매체명 화이트리스트를 통과해야 합니다. 데이터셋 인물이 2명 이상 등장한 기사만 페어 후보가 됩니다.
2. **분류** — 후보를 10건씩 묶어 LLM에 보내 해당 페어, 극성, 신뢰도, 이중언어 요약을 받습니다. API 키가 없으면 실패하는 대신 미분류 동반언급 신호로 격하됩니다.
3. **병합** — 새 신호를 기존 파일과 id 기준으로 합치고, 365일이 지난 것은 버리고, 1,500건에서 자릅니다. 한 번의 실행은 30일 창만 보지만, 이 아카이브가 시계열을 가능하게 합니다.
4. **검증** — 스키마, 통계 일치, 참조된 인물 id의 실재 여부.
5. **커밋** — 워크플로가 JSON을 저장소에 다시 씁니다. 서버는 없습니다. 데이터셋은 정적 import로 함께 배포됩니다.

### 참조한 뉴스 소스

신호는 아래 매체에서만 수집합니다. 7곳은 RSS로 직접, 나머지는 Google News를 거쳐 화이트리스트로 걸러집니다.

**통신사·방송** — AP · Reuters · CNN · Fox News · NBC News · ABC News · CBS News · NPR
**정치 전문** — Politico · The Hill · Axios · Roll Call · Semafor · Washington Examiner
**전국지** — The New York Times · The Washington Post · The Wall Street Journal

인물 사진과 위키 링크는 **Wikipedia REST API**에서 브라우저가 지연 로딩합니다. 이미지 파일은 저장소에 두지 않습니다.

### 가져다 쓸 만한 기법

- **범례를 필터로 쓰고, 걸러진 노드를 어둡게.** 선만 감추면 그래프가 조용히 틀린 그림이 됩니다. 연결이 사라진 노드를 어둡게 해야 필터가 읽힙니다.
- **이상치가 아니라 본 덩어리에 맞춘다.** 모든 노드를 담으려는 `zoomToFit`은 멀리 떨어진 두어 개 때문에 정작 본 군집을 구석에 작게 만듭니다. 중심에서 가까운 97%에 맞추면 어떤 해상도에서도 화면을 채웁니다.
- **약한 중심 당김 힘.** 링크 없는 노드는 반발력만 받아 화면 밖으로 영원히 밀려납니다. 원점으로 살짝 당기면 레이아웃이 모이고, 프레이밍 문제도 뿌리에서 해결됩니다.
- **엔진이 멈춘 뒤, 딱 한 번 맞춘다.** 타이머로 맞추면 아직 퍼지는 중인 좌표에 맞춰지고, 멈출 때마다 맞추면 사용자가 돌려놓은 카메라를 매번 되감습니다.
- **3D 노드 오브젝트를 캐시하고 선택은 머티리얼만 수정.** `nodeThreeObject`를 인라인으로 두면 선택 상태를 클로저로 잡아, 클릭할 때마다 101개 노드의 지오메트리와 캔버스 텍스처가 통째로 재생성됩니다(프레임 167ms + GPU 누수). id로 캐시하고 색만 바꾸니 최악 프레임 50ms, 힙 69 → 40MB.
- **시계열 데이터는 덮어쓰지 말고 누적한다.** 원래 파이프라인은 매 실행마다 결과를 교체해서, 수집이 부실한 날 아카이브가 통째로 날아갈 수 있었습니다. 지금은 id 기준 병합 + 365일 창입니다.
- **매체명은 단어 경계로 매칭한다.** 화이트리스트의 맨 `'AP'` 하나를 부분일치로 쓰면 CoinG**ap**e, Yahoo News Sing**ap**ore, Tele**grap**hHerald가 조용히 통과합니다.

### 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm run build

npm run news         # 뉴스 신호 갱신 (NEWS_LLM_API_KEY 필요)
npm run news:dry     # 같은 동작, 임시 파일에만 기록

node scripts/e2e/polaris.e2e.mjs    # 실제 브라우저 기반 45개 검사
node scripts/demo/record.mjs        # docs/demo.gif 재생성 (ffmpeg 필요)
```

LLM 단계는 OpenAI 호환 엔드포인트를 받습니다. 기본값은 NVIDIA NIM입니다.

```
NEWS_LLM_API_KEY=...
NEWS_LLM_BASE_URL=https://integrate.api.nvidia.com/v1
NEWS_LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

### 솔직한 한계

- **관계 데이터는 편집적 판단입니다.** 266개의 엣지는 공개 보도를 근거로 손으로 큐레이션한 것입니다. 같은 보도를 읽은 다른 사람은 다른 그래프를 그릴 것입니다. 기록이 아니라 하나의 주장으로 봐 주세요.
- **LLM 분류기는 팩트체커가 아닙니다.** 본문이 아니라 제목과 요약을 읽고, 틀릴 때가 있습니다. 극성은 신호이지 판정이 아닙니다.
- **커버리지는 전국 단위 영어 매체에 치우쳐** 있고, 따라서 그 매체들이 많이 다루는 인물에 치우칩니다.

### 기술 스택

React 18 · TypeScript · Vite · Tailwind · Zustand · react-force-graph (d3-force + three.js) · Framer Motion · Playwright · 파이프라인은 Node 22 네이티브 TypeScript · GitHub Actions

### 라이선스

MIT — [LICENSE](LICENSE) 참고.

---

## Related / 관련 프로젝트

- **[showjihyun/KoreaPolitician](https://github.com/showjihyun/KoreaPolitician)** — the same idea applied to Korean politics. / 같은 아이디어를 한국 정치에 적용한 프로젝트.
