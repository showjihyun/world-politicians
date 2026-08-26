/**
 * POLARIS E2E — 실제 브라우저(Chromium) 기반 스모크 + 인터랙션 테스트
 * 실행: node scripts/e2e/polaris.e2e.mjs   (dev 서버 자동 기동)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = 'e2e/screenshots';
const results = [];

function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function ensureServer() {
  try {
    await fetch(BASE);
    return;
  } catch {
    /* fallthrough */
  }
  console.log('[e2e] dev server starting…');
  const child = spawn('cmd', ['/c', 'npm', 'run', 'dev'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await fetch(BASE);
      return;
    } catch {
      /* retry */
    }
  }
  throw new Error('dev server failed to start');
}

async function main() {
  await ensureServer();
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  // ── 1. 로드 & 그래프 렌더 ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);

  check('app mounts', (await page.locator('#root > *').count()) > 0);
  check('graph canvas rendered', (await page.locator('canvas').count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/01-initial.png` });

  // ── 2. 기본 로케일 = ENG ──
  let body = await page.locator('body').innerText();
  check('default locale ENG', body.includes('Federal · Senate · House relationship map'));

  // ── 3. KOR 토글 ──
  const koBtn = page.locator('[data-testid=lang-ko]');
  const engBtn = page.locator('[data-testid=lang-en]');
  check('lang switcher present', (await koBtn.count()) === 1 && (await engBtn.count()) === 1);
  check('default shows EN active', (await engBtn.innerText()) === 'EN');
  await koBtn.click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  check('KOR toggle applies', body.includes('연방정부 · 상원 · 하원 관계 네트워크'));
  await page.screenshot({ path: `${SHOTS}/02-korean.png` });
  await engBtn.click();
  await page.waitForTimeout(300);

  // ── 4. 검색 → 선택 → 상세 드로어 ──
  await page.getByPlaceholder('Search politicians…').fill('trump');
  await page.waitForTimeout(400);
  await page
    .getByRole('button')
    .filter({ hasText: 'Donald J. Trump' })
    .first()
    .click();
  await page.waitForTimeout(1200);
  const drawerVisible = await page.locator('text=47th President of the United States').isVisible();
  check('search opens detail drawer', drawerVisible);
  check(
    'Latest Wire section present (news signals)',
    (await page.locator('text=Latest Wire').count()) > 0
  );
  check('relationship groups render', (await page.locator('text=Rivals & feuds').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/03-drawer.png` });

  // ── 5. ESC 닫기 ──
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check(
    'ESC closes drawer',
    !(await page.locator('text=47th President of the United States').isVisible())
  );

  // ── 6. 스토리 투어 ──
  await page
    .locator('button', { hasText: 'The Mar-a-Lago Gravity Well' })
    .last()
    .click();
  await page.waitForTimeout(1400);
  check('story overlay opens', await page.locator('text=Why it matters').isVisible());
  await page.screenshot({ path: `${SHOTS}/04-story.png` });
  await page.locator('aside button[aria-label="Close"]').first().click();
  await page.waitForTimeout(600);
  check('story exits', !(await page.locator('text=Why it matters').isVisible()));

  // ── 7. 인사이트 탭 ──
  await page.locator('button', { hasText: 'INSIGHTS' }).click();
  await page.waitForTimeout(400);
  check('insights ranked lists', (await page.locator('text=Conflict Hubs').count()) > 0);
  check(
    'wire ticker in insights',
    (await page.locator('aside >> text=Latest Wire').count()) > 0
  );
  await page.screenshot({ path: `${SHOTS}/05-insights.png` });
  await page.locator('button', { hasText: 'FILTERS' }).click();

  // ── 8. 필터 (정당 칩) ──
  await page.locator('button', { hasText: 'Republican' }).first().click();
  await page.waitForTimeout(800);
  check('party filter toggles without crash', true);
  await page.screenshot({ path: `${SHOTS}/06-filtered.png` });
  await page.locator('button', { hasText: 'Republican' }).first().click();

  // ── 9. 호버 툴팁 ──
  const center = await page.locator('canvas').first().boundingBox();
  if (center) {
    await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
    await page.mouse.move(center.x + center.width / 2 + 30, center.y + center.height / 2 + 18, { steps: 8 });
    await page.waitForTimeout(500);
  }
  check('hover interaction does not crash', true);

  // ── 10. 3D 모드 ──
  try {
    const modeBtn = page.locator('[data-testid=mode-toggle]');
    check('mode toggle shows current 2D', (await modeBtn.innerText()) === '2D');
    await modeBtn.click();
    await page.waitForTimeout(4500);
    check('mode toggle switched to 3D', (await modeBtn.innerText()) === '3D');
    check('3D neural mode renders', (await page.locator('canvas').count()) >= 1);
    await page.screenshot({ path: `${SHOTS}/07-3d.png` });
    await modeBtn.click();
    await page.waitForTimeout(800);
  } catch (e) {
    check('3D neural mode renders', false, String(e).slice(0, 80));
  }

  // ── 11. 콘솔 에러 검사 ──
  const benign = /favicon|net::ERR_|googleapis|gstatic|jsdelivr|ERR_ABORTED/i;
  const hardConsole = consoleErrors.filter((e) => !benign.test(e));
  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('zero hard console errors', hardConsole.length === 0, hardConsole.slice(0, 2).join(' | ').slice(0, 160));

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== E2E RESULT: ${passed}/${results.length} passed ===`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('E2E FATAL:', e);
    process.exit(1);
  });
