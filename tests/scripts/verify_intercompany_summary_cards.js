const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

const VIEWPORTS = [
  { width: 320, height: 600, name: 'mobile_320' },
  { width: 360, height: 640, name: 'mobile_360' },
  { width: 375, height: 667, name: 'mobile_375' },
  { width: 390, height: 844, name: 'mobile_390' },
  { width: 430, height: 932, name: 'mobile_430' },
  { width: 768, height: 1024, name: 'tablet_768' },
  { width: 1024, height: 768, name: 'laptop_1024' },
  { width: 1366, height: 768, name: 'desktop_1366' }
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Authenticate
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({ email: 'admin@anjani.test', password: 'Test@Agro2026!' });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await new Promise(r => setTimeout(r, 1200));

  const results = {};

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width <= 430 ? 2 : 1 });
    await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle2' });

    // Open Stock Reconciliation tab
    await page.evaluate(() => {
      const reconBtn = document.querySelector('.tab-btn[data-tab="Reconciliation"]');
      if (reconBtn) reconBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    const check = await page.evaluate((vpWidth) => {
      const winWidth = window.innerWidth;
      const docScrollWidth = document.documentElement.scrollWidth;
      const grid = document.getElementById('intercompany-summary-grid');
      const cards = Array.from(grid ? grid.querySelectorAll('.summary-metric-card') : []);
      const gridRect = grid ? grid.getBoundingClientRect() : null;

      const cardMetrics = cards.map((c, i) => {
        const r = c.getBoundingClientRect();
        const lbl = c.querySelector('.summary-metric-label');
        const val = c.querySelector('.summary-metric-value');
        const sub = c.querySelector('.summary-metric-subtext');

        return {
          idx: i,
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          overflowsViewport: Math.round(r.right) > winWidth,
          label: lbl ? {
            text: lbl.innerText,
            whiteSpace: getComputedStyle(lbl).whiteSpace,
            wrapped: lbl.scrollHeight > 20
          } : null,
          val: val ? {
            text: val.innerText,
            fontSize: getComputedStyle(val).fontSize
          } : null,
          sub: sub ? {
            text: sub.innerText,
            whiteSpace: getComputedStyle(sub).whiteSpace
          } : null
        };
      });

      const anyOverflow = cardMetrics.some(c => c.overflowsViewport);
      const horizontalPageScroll = docScrollWidth > winWidth;

      return {
        viewportWidth: vpWidth,
        docScrollWidth,
        horizontalPageScroll,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        gridRect: gridRect ? {
          width: Math.round(gridRect.width),
          left: Math.round(gridRect.left),
          right: Math.round(gridRect.right)
        } : null,
        anyOverflow,
        cardMetrics
      };
    }, vp.width);

    results[vp.name] = check;

    // Capture screenshots for mobile_375, mobile_320, tablet_768, desktop_1366
    if (['mobile_320', 'mobile_360', 'mobile_375', 'desktop_1366'].includes(vp.name)) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `intercompany_summary_cards_${vp.name}.png`) });
    }
  }

  // Test Stress Dynamic Values (Huge Stock Numbers & Long Text)
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await page.evaluate(() => {
    document.getElementById('recon-owned-units').textContent = '1,250,500 Units';
    document.getElementById('recon-intransit-units').textContent = '95,400 Units';
    document.getElementById('recon-consign-units').textContent = '450,000 Units';
    document.getElementById('recon-discrepancy-units').textContent = '12,350 Units';
  });
  await new Promise(r => setTimeout(r, 400));

  const stressCheck = await page.evaluate(() => {
    const winWidth = window.innerWidth;
    const cards = Array.from(document.querySelectorAll('#intercompany-summary-grid .summary-metric-card'));
    return {
      allFit: cards.every(c => Math.round(c.getBoundingClientRect().right) <= winWidth),
      cards: cards.map((c, i) => ({
        idx: i,
        val: c.querySelector('.summary-metric-value').innerText,
        right: Math.round(c.getBoundingClientRect().right),
        overflow: Math.round(c.getBoundingClientRect().right) > winWidth
      }))
    };
  });
  results.stressDynamicValues = stressCheck;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_summary_cards_stress_mobile_375.png') });

  // Test Tab Switching Preservation
  await page.evaluate(() => {
    // Switch to Tab 1: Transfers
    const tBtn = document.querySelector('.tab-btn[data-tab="Transfers"]');
    if (tBtn) tBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    // Switch to Tab 3: Relationships
    const rBtn = document.querySelector('.tab-btn[data-tab="Relationships"]');
    if (rBtn) rBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    // Switch back to Tab 2: Reconciliation
    const recBtn = document.querySelector('.tab-btn[data-tab="Reconciliation"]');
    if (recBtn) recBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const tabSwitchCheck = await page.evaluate(() => {
    const winWidth = window.innerWidth;
    const cards = Array.from(document.querySelectorAll('#intercompany-summary-grid .summary-metric-card'));
    return {
      allFitAfterTabSwitch: cards.every(c => Math.round(c.getBoundingClientRect().right) <= winWidth),
      gridVisible: document.getElementById('intercompany-summary-grid').offsetParent !== null
    };
  });
  results.tabSwitching = tabSwitchCheck;

  console.log('\n================ COMPLETE SUMMARY CARDS TEST RESULTS ================');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})();
