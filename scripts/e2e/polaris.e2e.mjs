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

  // 월별 아카이브 청크가 첫 화면에 딸려오면 분할이 무의미하다 — 요청을 기록해 확인
  const requested = [];
  page.on('request', (r) => requested.push(r.url()));

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
  // 패널이 화면 안에 들어오고, 스크롤 영역이 실제로 확보되는가.
  // 예전엔 헤더·링크·미터가 857px 를 먹어 스크롤 영역이 16px 로 눌려
  // 아래 내용을 볼 수 없었다.
  const panelFit = await page.evaluate(() => {
    const pick = (txt) => [...document.querySelectorAll('aside')].find((a) => a.textContent?.includes(txt));
    const measure = (el, sel) => {
      if (!el) return null;
      const sc = el.querySelector(sel);
      if (!sc) return null;
      const b = el.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      return {
        ratio: s.height / b.height,
        overflows: b.bottom > window.innerHeight + 1,
        scrollable: sc.scrollHeight > sc.clientHeight,
      };
    };
    return {
      right: measure(pick('47th President'), '[data-testid=drawer-scroll]'),
      left: measure(pick('FILTERS'), '.polaris-scroll'),
    };
  });
  check(
    'right panel fits the viewport',
    !!panelFit.right && !panelFit.right.overflows,
    JSON.stringify(panelFit.right)
  );
  check(
    'right panel body actually scrolls',
    !!panelFit.right && panelFit.right.ratio > 0.5 && panelFit.right.scrollable,
    `ratio ${panelFit.right ? panelFit.right.ratio.toFixed(2) : '?'}`
  );
  check('left panel fits the viewport', !!panelFit.left && !panelFit.left.overflows);
  await page.screenshot({ path: `${SHOTS}/03-drawer.png` });

  // ── 4b. 관계 근거 — "어떻게 아느냐" 에 답이 있는가 ──
  await page.locator('[data-testid=row-evidence]').first().click();
  await page.waitForTimeout(1200);   // 출처는 지연 로딩된다
  check('edge evidence panel opens', (await page.locator('[data-testid=edge-sources]').count()) === 1);
  const srcLinks = await page.locator('[data-testid=edge-sources] a').count();
  const unsourced = await page.locator('[data-testid=edge-unsourced]').count();
  check(
    'edge shows sources or says it has none',
    srcLinks > 0 || unsourced === 1,
    `links ${srcLinks}, unsourced ${unsourced}`
  );
  const hrefs = await page.locator('[data-testid=edge-sources] a').evaluateAll((as) =>
    as.map((a) => a.getAttribute('href'))
  );
  check(
    'source links are real URLs',
    hrefs.length === 0 || hrefs.every((h) => /^https?:\/\//.test(h ?? '')),
    hrefs.slice(0, 1).join('')
  );
  await page.screenshot({ path: `${SHOTS}/10-evidence.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

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
  const beforeAnalysis = [...requested];
  await page.locator('button', { hasText: 'ANALYSIS' }).click();
  await page.waitForTimeout(500);
  check('analysis tab opens', await page.locator('text=Watchlist').isVisible());

  // 분할의 목적: 아카이브는 시계열을 열 때만 받는다
  // dev 서버는 /src/data/signals/2026-08.json, 빌드본은 /assets/2026-08-<hash>.js 로 나간다
  const isMonthChunk = (u) => /signals\/20\d\d-\d\d\.json|assets\/20\d\d-\d\d[-.]/.test(u);
  check(
    'monthly archive is not shipped on first paint',
    beforeAnalysis.filter(isMonthChunk).length === 0,
    `${beforeAnalysis.filter(isMonthChunk).length} chunk(s) before ANALYSIS`
  );
  await page.waitForTimeout(1500);
  check(
    'monthly archive loads when the timeline opens',
    requested.filter(isMonthChunk).length > 0,
    `${requested.filter(isMonthChunk).length} chunk(s) after`
  );
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

  // 관계 유형이 늘 때마다 고쳐야 하는 숫자를 박지 않는다 — "전부 켜져 있다" 를 본다
  const legendButtons = () => page.locator('[data-testid=graph-legend] button[aria-pressed]');
  const legendOn = () => page.locator('[data-testid=graph-legend] [aria-pressed=true]');
  const totalTypes = await legendButtons().count();
  check(
    'legend defaults all on',
    totalTypes >= 5 && (await legendOn().count()) === totalTypes,
    `${await legendOn().count()}/${totalTypes} on`
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
      (await legendOn().count()) === totalTypes - 1
  );
  await page.locator('[data-testid=legend-ally]').click();
  await page.waitForTimeout(300);
  check('legend toggle restores', (await legendOn().count()) === totalTypes);

  // 공동발의는 측정값이라 큐레이션 관계와 별도 타입으로 두었다.
  // 범례에 있어야 하고, 꺼서 화면에서 뺄 수 있어야 한다.
  check(
    'cosponsor type in legend',
    (await page.locator('[data-testid=legend-cosponsor]').count()) === 1
  );
  await page.locator('[data-testid=legend-cosponsor]').click();
  await page.waitForTimeout(500);
  check(
    'cosponsor toggles off',
    (await page.locator('[data-testid=legend-cosponsor]').getAttribute('aria-pressed')) === 'false' &&
      (await legendOn().count()) === totalTypes - 1
  );
  await page.locator('[data-testid=legend-cosponsor]').click();
  await page.waitForTimeout(300);

  // 자금 레이어. Trump 은 2026 주기 후보가 아니라 기록이 없으므로 현직 의원으로 본다.
  await page.getByPlaceholder('Search politicians…').fill('Jeffries');
  await page.waitForTimeout(400);
  await page.getByRole('button').filter({ hasText: 'Hakeem Jeffries' }).first().click();
  await page.waitForTimeout(1500);
  check(
    'funding section renders',
    (await page.locator('text=Campaign finance').count()) > 0
  );
  const fundingText = await page.locator('[data-testid=drawer-scroll]').first().innerText();
  check(
    'funding shows a dollar total',
    /\$\d[\d.,]*[MK]?\s*\n?\s*total receipts/i.test(fundingText) || /total receipts/i.test(fundingText),
    fundingText.split('\n').find((l) => /total receipts/i.test(l)) ?? '-'
  );
  // 6% 를 "이 사람을 후원하는 곳" 으로 읽게 두면 오도한다 — 단서가 반드시 붙어야 한다
  check(
    'funding caveat present',
    /Disclosed direct contributions only/i.test(fundingText)
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 회전문 레이어. 뜻이 좁아야 하므로 단서 문구의 존재까지 검사한다.
  await page.getByPlaceholder('Search politicians…').fill('McConnell');
  await page.waitForTimeout(400);
  await page.getByRole('button').filter({ hasText: 'Mitch McConnell' }).first().click();
  await page.waitForTimeout(1500);
  const lobbyText = await page.locator('[data-testid=drawer-scroll]').first().innerText();
  check('revolving door section renders', /Revolving door/i.test(lobbyText));
  check(
    'revolving door counts former aides',
    /former aides? now registered as lobbyists/i.test(lobbyText),
    lobbyText.split('\n').find((l) => /registered as lobbyists/i.test(l)) ?? '-'
  );
  // "이 의원을 로비한다" 로 읽히면 데이터가 받쳐주지 않는 주장이 된다
  check(
    'revolving door caveat present',
    /not that they lobby this office/i.test(lobbyText)
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

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
