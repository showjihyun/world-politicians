/**
 * 실제 앱 화면을 4K 로 찍는다 (1920×1080 뷰포트 × deviceScaleFactor 2 = 3840×2160).
 *
 * 조작은 영어 UI 로만 한다 — 셀렉터가 영어 라벨에 기대기 때문이다. 찍는 순간에만
 * 언어를 바꿔 두 장을 남긴다. 그래서 en/ko 화면은 같은 상태의 같은 구도다.
 *
 * 실행: dev 서버를 띄운 뒤  BASE=http://localhost:5199 node scripts/capture.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ui');
for (const l of ['en', 'ko']) mkdirSync(join(OUT, l), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name, settle = 600) => {
  for (const lang of ['ko', 'en']) {
    await page.locator(`[data-testid=lang-${lang}]`).click();
    await wait(settle);
    await page.screenshot({ path: join(OUT, lang, `${name}.png`) });
  }
  console.log('shot', name);
};
const select = async (query, label) => {
  await page.getByPlaceholder('Search politicians…').fill(query);
  await wait(400);
  await page.getByRole('button').filter({ hasText: label }).first().click();
  await wait(1400);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('[data-testid=lang-en]').click();
await wait(6000); // 물리 시뮬레이션이 가라앉을 때까지
await page.keyboard.press('Escape');
await wait(1500);
await shot('01-graph', 1500);

// 범례가 곧 필터 — feud 만 남기기
for (const rt of ['ally', 'bipartisan', 'family', 'mentor', 'cosponsor']) {
  const b = page.locator(`[data-testid=legend-${rt}]`);
  if (await b.count()) await b.click();
  await wait(150);
}
await wait(1500);
await shot('02-legend-feud', 1200);
for (const rt of ['ally', 'bipartisan', 'family', 'mentor', 'cosponsor']) {
  const b = page.locator(`[data-testid=legend-${rt}]`);
  if (await b.count()) await b.click();
  await wait(150);
}
await wait(1200);

// 프로필 + 최신 와이어
await select('trump', 'Donald J. Trump');
await shot('03-profile', 900);

// 근거 패널
// 근거 링크가 실제로 있는 관계를 고른다 — 첫 행은 "근거 없음" 일 수 있다
const rows = page.locator('[data-testid=row-evidence]');
let found = false;
for (let i = 0; i < Math.min(await rows.count(), 15) && !found; i++) {
  // Escape 는 드로어까지 닫는다 — 팝오버가 열린 채로 다음 행을 누른다
  await rows.nth(i).scrollIntoViewIfNeeded();
  await rows.nth(i).click({ force: true });
  await wait(1300);
  found = (await page.locator('[data-testid=edge-sources] a').count()) >= 2;
}
if (!found) throw new Error('근거 링크가 있는 관계를 찾지 못했다');
await shot('04-evidence', 900);
await page.keyboard.press('Escape');
await wait(500);

// 영향력 프로필 — 자금·당론 이탈
await select('massie', 'Thomas Massie');
const unity = page.locator('[data-testid=party-unity]');
if (await unity.count()) {
  await unity.scrollIntoViewIfNeeded();
  await page.locator('[data-testid=drawer-scroll]').evaluate((el) => el.scrollBy(0, -260));
}
await wait(800);
await shot('05-influence', 900);

// 타임라인: trump 추적 → musk 추적 → ANALYSIS
await select('trump', 'Donald J. Trump');
await page.locator('[data-testid=track-btn]').click();
await wait(300);
await page.keyboard.press('Escape');
await select('elon musk', 'Elon Musk');
await page.locator('[data-testid=track-btn]').click();
await wait(300);
await page.keyboard.press('Escape');
await wait(400);
await page.locator('button', { hasText: 'ANALYSIS' }).click();
await wait(2500);
await shot('06-timeline', 1200);

// 인사이트 — 매체 구성
await page.locator('button', { hasText: 'INSIGHTS' }).click();
await wait(1200);
await page.locator('[data-testid=source-mix]').scrollIntoViewIfNeeded();
await wait(600);
await shot('07-source-mix', 900);

// 스토리
await page.locator('button', { hasText: 'STORIES' }).click();
await wait(800);
await page.locator('[data-testid=story-card]').first().click();
await wait(2500);
await shot('08-story', 1500);
await page.locator('aside button[aria-label="Close"]').first().click();
await wait(800);

// 3D
await page.locator('button', { hasText: 'FILTERS' }).click();
await page.locator('[data-testid=mode-toggle]').click();
await wait(7000);
await shot('09-3d', 2500);

await browser.close();
if (errors.length) {
  console.error('page errors:', errors);
  process.exitCode = 1;
}
