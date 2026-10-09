# POLARIS trailer

4K(3840×2160) · 60fps 트레일러. [Remotion](https://www.remotion.dev/)으로 영상을 코드로 만든다.
영어판과 한국어판 두 벌이 같은 타임라인을 쓴다.

## 만들기

```
npm install
npm run assets     # 음악·글꼴 받기 (저장소에 넣지 않는다)
npm run data       # 저장소 데이터 → src/generated/data.json
npm run capture    # 실제 앱 화면 4K 캡처 → public/ui/{en,ko}/ (루트에서 dev 서버를 먼저 띄운다)
npm run dev        # Remotion Studio 미리보기
npm run render     # out/polaris-trailer-{en,ko}-4k60.mp4
```

`capture` 는 `BASE`(기본 `http://localhost:5199`)의 앱을 연다. 루트에서
`npx vite --port 5199 --strictPort` 로 띄우면 된다.

## 지켜야 하는 것

- **숫자를 손으로 쓰지 않는다.** 화면의 모든 수치는 `scripts/prepare.ts` 가 앱의 정본
  산식(`src/domain/*`)과 데이터 파일에서 뽑는다. 데이터가 바뀌면 `npm run data` 후 다시 렌더한다.
- **그래프 좌표는 준비 단계에서 고정한다.** Remotion 은 프레임을 따로따로 그리므로
  렌더 중에 물리 시뮬레이션을 돌리면 프레임마다 위치가 달라진다.
- **장면 경계는 음악 마디 위에 둔다.** "Hitman" 은 150 BPM 이라 한 박 = 24f, 한 마디 = 96f.
  트랙 51.85초의 드롭이 영상 14초(840f)에 오도록 트랙을 37.85초부터 튼다 (`src/theme.ts`).
- 반지름 식은 `scripts/prepare.ts` 의 `R` 과 `src/data.ts` 의 `radius` 가 같아야 한다.

## 크레딧

Music: "Hitman" by Kevin MacLeod (incompetech.com), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 엔드 카드에 같은 표기가 들어간다.
Font: Pretendard (SIL OFL 1.1), Fira Code (SIL OFL 1.1).
