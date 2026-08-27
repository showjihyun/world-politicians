/**
 * README 용 데모 GIF 캡처.
 * 주요 기능을 장면 단위로 돌며 프레임을 찍고, ffmpeg 로 GIF 를 만든다.
 * 실행: node scripts/demo/record.mjs   (dev 서버가 떠 있어야 함)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = 'http://localhost:5173';
const OUT = 'scripts/demo/.frames';
const FPS = 10;
let frame = 0;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });

/** seconds 동안 FPS 로 프레임을 찍는다 (그 사이 애니메이션이 흐른다) */
async function hold(seconds) {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    await page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.png` });
    await page.waitForTimeout(1000 / FPS);
  }
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(9000); // 레이아웃 안정 + 자동 선택

// 1. 첫 화면 — 그래프 + 자동 선택된 인물
await hold(3.5);

// 2. Ctrl+드래그 회전
const box = await page.locator('canvas').first().boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.keyboard.down('Control');
await page.mouse.move(cx + 200, cy);
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
  const a = (i / 24) * Math.PI * 0.7;
  await page.mouse.move(cx + 200 * Math.cos(a), cy + 200 * Math.sin(a));
  if (i % 2 === 0) await page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.png` });
}
await page.mouse.up();
await page.keyboard.up('Control');
await hold(1.2);

// 3. 범례 토글 필터 — 갈등 관계만 남기기
for (const t of ['ally', 'bipartisan', 'family', 'mentor']) {
  await page.locator(`[data-testid=legend-${t}]`).click();
  await page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.png` });
  await page.waitForTimeout(120);
}
await hold(2.6);
for (const t of ['ally', 'bipartisan', 'family', 'mentor']) {
  await page.locator(`[data-testid=legend-${t}]`).click();
  await page.waitForTimeout(80);
}
await hold(0.6);

// 4. ANALYSIS — 관계 시계열
await page.locator('[data-testid=track-btn]').click();
await page.getByPlaceholder('Search politicians…').fill('elon musk');
await page.waitForTimeout(500);
await page.getByRole('button').filter({ hasText: 'Elon Musk' }).first().click();
await page.waitForTimeout(1200);
await page.locator('[data-testid=track-btn]').click();
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.locator('button', { hasText: 'ANALYSIS' }).click();
await hold(3.5);

// 5. STORIES — 큐레이션 투어
await page.locator('button', { hasText: 'STORIES' }).click();
await page.waitForTimeout(500);
await hold(1.6);
await page.locator('[data-testid=story-card]').first().click();
await page.waitForTimeout(1400);
await hold(3.0);
await page.locator('aside button[aria-label="Close"]').first().click();
await page.waitForTimeout(700);

// 6. 3D 모드
await page.locator('button', { hasText: 'FILTERS' }).click();
await page.locator('[data-testid=mode-3d]').click().catch(async () => {
  await page.locator('button', { hasText: '2D' }).first().click();
});
await page.waitForTimeout(6000);
await hold(1.5);
await page.keyboard.down('Control');
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 26; i++) {
  await page.mouse.move(cx + i * 16, cy - i * 2);
  if (i % 2 === 0) await page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.png` });
}
await page.mouse.up();
await page.keyboard.up('Control');
await hold(1.4);

// 7. 한국어 전환
await page.locator('[data-testid=lang-ko]').click();
await page.waitForTimeout(900);
await hold(2.2);

await browser.close();
console.log(`frames: ${frame}  (~${(frame / FPS).toFixed(1)}s @ ${FPS}fps)`);

// ffmpeg: 팔레트 생성 후 GIF 인코딩 (색 밴딩 방지).
// 입력 framerate 를 캡처 fps 보다 높여 20초로 맞추고, 폭·색수를 줄여 README 에
// 얹을 만한 용량(약 3.7MB)으로 떨어뜨린다.
const ENC_FPS = 12;
const WIDTH = 800;
const COLORS = 96;
execFileSync('ffmpeg', ['-y', '-framerate', String(ENC_FPS), '-i', `${OUT}/f%04d.png`,
  '-vf', `scale=${WIDTH}:-1:flags=lanczos,palettegen=max_colors=${COLORS}:stats_mode=diff`,
  `${OUT}/pal.png`], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-framerate', String(ENC_FPS), '-i', `${OUT}/f%04d.png`, '-i', `${OUT}/pal.png`,
  '-lavfi', `scale=${WIDTH}:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5`,
  '-loop', '0', 'docs/demo.gif'], { stdio: 'ignore' });
const kb = Math.round(fs.statSync('docs/demo.gif').size / 1024);
console.log(`docs/demo.gif  ${kb}KB  ${(frame / ENC_FPS).toFixed(1)}s`);
