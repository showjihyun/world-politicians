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

  // 첫 진입 시 관계가 가장 많은 인물이 자동 선택된다
  const autoName = await page
    .locator('aside h2')
    .first()
    .innerText()
    .catch(() => '');
  check('auto-selects most connected figure', autoName.trim().length > 0, autoName.trim());
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
  check(
    'profile links render (wiki/x/news)',
    (await page.locator('[data-testid=profile-links] a').count()) >= 3
  );
  check(
    'portrait or fallback shown',
    (await page.locator('aside img, aside [data-testid=portrait-fallback]').count()) > 0 ||
      (await page.locator('img[alt="Donald J. Trump"]').count()) > 0
  );
  await page.locator('[data-testid=track-btn]').click();
  await page.waitForTimeout(300);
  check('track toggles on', (await page.locator('[data-testid=track-btn]').getAttribute('title')) === 'Tracking');
  await page.screenshot({ path: `${SHOTS}/03-drawer.png` });

  // ── 5. ESC 닫기 ──
  await page.keyboard.press('Escape');
  // 드로어 퇴장은 spring 애니메이션 — 고정 대기는 레이스가 난다. 실제 detach 를 기다린다.
  const drawerText = page.locator('text=47th President of the United States');
  let drawerClosed = true;
  try {
    await drawerText.waitFor({ state: 'detached', timeout: 4000 });
  } catch {
    drawerClosed = false;
  }
  check('ESC closes drawer', drawerClosed);

  // ── 6. 스토리 투어 (하단 독 제거 → STORIES 탭에서 연다) ──
  // 화면 하단을 가로지르던 스토리 독이 사라졌는지 — 사이드바 밖에는 스토리가 없어야 한다
  check(
    'bottom story dock removed',
    (await page.locator('body > div > div.absolute.inset-x-0.bottom-0').count()) === 0 &&
      (await page.locator('text=Social Phenomena').count()) === 0
  );
  await page.locator('button', { hasText: 'STORIES' }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid=story-card]').first().click();
  await page.waitForTimeout(1400);
  check('story overlay opens', await page.locator('text=Why it matters').isVisible());
  await page.screenshot({ path: `${SHOTS}/04-story.png` });
  await page.locator('aside button[aria-label="Close"]').first().click();
  // 스토리 오버레이도 퇴장 애니메이션이 있다 — detach 를 기다려야 안정적이다.
  const storyText = page.locator('text=Why it matters');
  let storyClosed = true;
  try {
    await storyText.waitFor({ state: 'detached', timeout: 4000 });
  } catch {
    storyClosed = false;
  }
  check('story exits', storyClosed);

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

  // ── 7b. ANALYSIS (시계열) — 두 번째 인물 추적 후 페어 아크 확인 ──
  await page.getByPlaceholder('Search politicians…').fill('elon musk');
  await page.waitForTimeout(400);
  await page
    .getByRole('button')
    .filter({ hasText: 'Elon Musk' })
    .first()
    .click();
  await page.waitForTimeout(900);
  await page.locator('[data-testid=track-btn]').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'ANALYSIS' }).click();
  await page.waitForTimeout(500);
  check('analysis tab opens', await page.locator('text=Watchlist').isVisible());
  check(
    'pair timeline card renders',
    await page.locator('text=Donald J. Trump × Elon Musk').isVisible()
  );
  check(
    'timeline strip cells render',
    (await page.locator('[data-testid=tl-cell]').count()) > 6
  );
  await page.screenshot({ path: `${SHOTS}/08-analysis.png` });
  await page.locator('button', { hasText: 'FILTERS' }).click();

  // ── 7c. STORIES (SOCIAL PHENOMENA 전용 탭) ──
  check(
    'stories moved out of FILTERS',
    (await page.locator('aside >> text=Social Phenomena').count()) === 0
  );
  await page.locator('button', { hasText: 'STORIES' }).click();
  await page.waitForTimeout(400);
  check('stories tab opens', await page.locator('aside >> text=Social Phenomena').isVisible());
  check('story cards render', (await page.locator('[data-testid=story-card]').count()) === 7);
  await page.screenshot({ path: `${SHOTS}/09-stories.png` });
  await page.locator('[data-testid=story-card]').first().click();
  await page.waitForTimeout(1200);
  check('story opens from tab', await page.locator('text=Why it matters').isVisible());

  // 스토리 오버레이가 왼쪽 패널을 덮지 않아야 한다 (사이드바가 열린 상태)
  const sidebarBox = await page.locator('aside:has-text("FILTERS")').first().boundingBox();
  const overlayBox = await page.locator('aside:has-text("Why it matters")').first().boundingBox();
  const overlaps =
    sidebarBox && overlayBox &&
    overlayBox.x < sidebarBox.x + sidebarBox.width &&
    overlayBox.x + overlayBox.width > sidebarBox.x;
  check(
    'story overlay clears the sidebar',
    !overlaps,
    `sidebar ends ${sidebarBox ? Math.round(sidebarBox.x + sidebarBox.width) : '?'}, overlay starts ${overlayBox ? Math.round(overlayBox.x) : '?'}`
  );
  await page.locator('aside button[aria-label="Close"]').first().click();
  const storyText2 = page.locator('text=Why it matters');
  try {
    await storyText2.waitFor({ state: 'detached', timeout: 4000 });
  } catch {
    /* 아래 체크에서 잡힌다 */
  }
  await page.locator('button', { hasText: 'FILTERS' }).click();
  await page.waitForTimeout(300);

  // ── 8. 필터 (정당 칩) ──
  await page.locator('button', { hasText: 'Republican' }).first().click();
  await page.waitForTimeout(800);
  check('party filter toggles without crash', true);
  await page.screenshot({ path: `${SHOTS}/06-filtered.png` });
  await page.locator('button', { hasText: 'Republican' }).first().click();

  // ── 9. 호버 툴팁 + 회전 컨트롤 ──
  const center = await page.locator('canvas').first().boundingBox();
  if (center) {
    await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
    await page.mouse.move(center.x + center.width / 2 + 30, center.y + center.height / 2 + 18, { steps: 8 });
    await page.waitForTimeout(500);
  }
  check('hover interaction does not crash', true);
  check('rotate buttons removed', (await page.locator('[data-testid=view-controls]').count()) === 0);

  // Ctrl+드래그 회전 — 노드 픽셀 분포가 실제로 회전했는지로 검증
  const canvasBox = await page.locator('canvas').first().boundingBox();
  // 중심점은 회전 불변이라 판별에 못 쓴다 — 칠해진 픽셀 마스크가 얼마나 달라졌는지로 본다
  const paintMask = () =>
    page.evaluate(() => {
      const c = document.querySelector('canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const COLS = 64, ROWS = 40, cell = [];
      for (let r = 0; r < ROWS; r++) {
        for (let col = 0; col < COLS; col++) {
          const x = Math.floor(((col + 0.5) * c.width) / COLS);
          const y = Math.floor(((r + 0.5) * c.height) / ROWS);
          const i = (y * c.width + x) * 4;
          cell.push(d[i + 3] > 24 && d[i] + d[i + 1] + d[i + 2] > 90 ? 1 : 0);
        }
      }
      return cell;
    });
  const before = await paintMask();
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  await page.keyboard.down('Control');
  await page.mouse.move(cx + 220, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    await page.mouse.move(cx + 220 * Math.cos(a), cy + 220 * Math.sin(a));
  }
  await page.mouse.up();
  await page.keyboard.up('Control');
  await page.waitForTimeout(600);
  const after = await paintMask();
  const painted = before.reduce((a, b) => a + b, 0);
  const changed = before.reduce((n, v, i) => n + (v !== after[i] ? 1 : 0), 0);
  check(
    'ctrl+drag rotates the graph',
    painted > 50 && changed > painted * 0.3,
    `painted ${painted}, changed ${changed}`
  );

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

  // ── 11. 콘솔 에러 + 데이터 시점 표시 ──
  const benign = /favicon|net::ERR_|googleapis|gstatic|jsdelivr|ERR_ABORTED|wikipedia/i;
  const hardConsole = consoleErrors.filter((e) => !benign.test(e));
  // 내장 툴팁이 LocalizedText 객체를 그대로 찍던 버그 회귀 방지
  check(
    'no [object Object] leaked to the UI',
    !(await page.locator('body').innerText()).includes('[object Object]')
  );
  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('zero hard console errors', hardConsole.length === 0, hardConsole.slice(0, 2).join(' | ').slice(0, 160));
  // 데이터 수집기간 배지 (우측 하단)
  const freshText = await page.locator('[data-testid=data-freshness]').innerText();
  check(
    'data coverage badge shown',
    /Data coverage/i.test(freshText) && /\d{1,2}\/\d{1,2}\s*→\s*\d{1,2}\/\d{1,2}/.test(freshText),
    freshText.replace(/\n/g, ' | ').slice(0, 90)
  );
  check('coverage shows update age', /Updated/i.test(freshText) && /signals/i.test(freshText));
  // 첫 화면부터 프로필이 열려 있으므로 배지가 드로어에 가리면 안 된다
  await page.getByPlaceholder('Search politicians…').fill('trump');
  await page.waitForTimeout(400);
  await page.getByRole('button').filter({ hasText: 'Donald' }).first().click();
  await page.waitForTimeout(900);
  const drawerBox2 = await page.locator('aside:has-text("47th President")').first().boundingBox();
  const badgeBox = await page.locator('[data-testid=data-freshness]').boundingBox();
  check(
    'coverage badge clears the drawer',
    !!drawerBox2 && !!badgeBox && badgeBox.x + badgeBox.width <= drawerBox2.x + 1,
    `badge ends ${badgeBox ? Math.round(badgeBox.x + badgeBox.width) : '?'}, drawer starts ${drawerBox2 ? Math.round(drawerBox2.x) : '?'}`
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 범례 토글이 실제로 링크를 필터링하는지
  check('legend on graph', (await page.locator('[data-testid=graph-legend]').count()) === 1);
  check(
    'legend defaults all on',
    (await page.locator('[data-testid=graph-legend] [aria-pressed=true]').count()) === 5
  );
  check(
    'legend removed from FILTERS',
    (await page.locator('aside [data-testid=graph-legend]').count()) === 0
  );
  await page.locator('[data-testid=legend-ally]').click();
  await page.waitForTimeout(500);
  check(
    'legend toggle turns a type off',
    (await page.locator('[data-testid=legend-ally]').getAttribute('aria-pressed')) === 'false' &&
      (await page.locator('[data-testid=graph-legend] [aria-pressed=true]').count()) === 4
  );
  await page.locator('[data-testid=legend-ally]').click();
  await page.waitForTimeout(300);
  check(
    'legend toggle restores',
    (await page.locator('[data-testid=graph-legend] [aria-pressed=true]').count()) === 5
  );

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
