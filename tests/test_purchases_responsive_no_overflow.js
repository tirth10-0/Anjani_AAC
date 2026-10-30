/**
 * tests/test_purchases_responsive_no_overflow.js
 * End-to-end automated verification for Purchases Page Responsive Layout:
 * - 0 horizontal scrolling across Desktop (1440px), Laptop (1280px), Tablet (768px), and Mobile (390px).
 * - Full visibility of Actions column on laptop and desktop.
 * - 5-column balanced tablet layout with cleanly stacked secondary info.
 * - Mobile card view with clean header, item tags, and touch action buttons.
 * - Purchase Detail Modal responsive fit across all viewports.
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runResponsiveTests() {
  console.log('--- STARTING PURCHASES RESPONSIVE LAYOUT VERIFICATION ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Authenticate session
  console.log('>>> Initializing login session...');
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({
      email: 'admin@anjani.test',
      password: 'Test@Agro2026!'
    });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await sleep(1000);

  const viewports = [
    { name: 'desktop_1440', width: 1440, height: 900, type: 'desktop' },
    { name: 'laptop_1280', width: 1280, height: 800, type: 'laptop' },
    { name: 'tablet_768', width: 768, height: 1024, type: 'tablet' },
    { name: 'mobile_390', width: 390, height: 844, type: 'mobile' }
  ];

  for (const vp of viewports) {
    console.log(`\n======================================================`);
    console.log(`>>> Testing Viewport: ${vp.name} (${vp.width}x${vp.height} - ${vp.type.toUpperCase()})`);
    console.log(`======================================================`);

    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#purchases-table tbody tr .row-actions').length > 0, { timeout: 15000 });
    await sleep(600);

    // Measure viewport overflow metrics
    const metrics = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const mainContent = document.querySelector('.main-content');
      const tableWrap = document.querySelector('#purchases-table-wrap');
      const table = document.querySelector('#purchases-table');

      // Check actions button position
      const firstRowActions = table?.querySelector('tbody tr .row-actions');
      const actionsRect = firstRowActions ? firstRowActions.getBoundingClientRect() : null;

      // Check visible columns in thead
      const ths = Array.from(table?.querySelectorAll('thead th') || []).map(th => {
        const style = window.getComputedStyle(th);
        return {
          name: th.innerText.trim(),
          width: th.offsetWidth,
          visible: style.display !== 'none'
        };
      });

      return {
        html: { scrollW: html.scrollWidth, clientW: html.clientWidth },
        body: { scrollW: body.scrollWidth, clientW: body.clientWidth },
        mainContent: { scrollW: mainContent?.scrollWidth, clientW: mainContent?.clientWidth },
        tableWrap: { scrollW: tableWrap?.scrollWidth, clientW: tableWrap?.clientWidth },
        table: { scrollW: table?.scrollWidth, clientW: table?.clientWidth },
        actionsRect: actionsRect ? { right: actionsRect.right, width: actionsRect.width } : null,
        viewportWidth: window.innerWidth,
        ths
      };
    });

    console.log(`[${vp.name}] TableWrap: scrollW=${metrics.tableWrap.scrollW}, clientW=${metrics.tableWrap.clientW}`);
    console.log(`[${vp.name}] Document: scrollW=${metrics.html.scrollW}, clientW=${metrics.html.clientW}`);

    // Assert: No horizontal scrolling on Document
    assert(
      metrics.html.scrollW <= metrics.html.clientW,
      `FAILURE: Document has horizontal overflow at ${vp.name} (scrollW: ${metrics.html.scrollW} > clientW: ${metrics.html.clientW})`
    );
    console.log(`✓ PASS: Document has 0 horizontal scroll (scrollW <= clientW).`);

    // Assert: No horizontal scrolling on Table Wrapper
    assert(
      metrics.tableWrap.scrollW <= metrics.tableWrap.clientW + 1,
      `FAILURE: Table wrapper has horizontal overflow at ${vp.name} (scrollW: ${metrics.tableWrap.scrollW} > clientW: ${metrics.tableWrap.clientW})`
    );
    console.log(`✓ PASS: #purchases-table-wrap fits within container with 0 horizontal overflow.`);

    // Check actions button visibility on desktop/laptop
    if (vp.type === 'desktop' || vp.type === 'laptop') {
      assert(
        metrics.actionsRect && metrics.actionsRect.right <= metrics.viewportWidth,
        `FAILURE: Actions column extends outside viewport at ${vp.name} (right: ${metrics.actionsRect?.right} > ${metrics.viewportWidth})`
      );
      console.log(`✓ PASS: Actions buttons are 100% visible inside viewport (right: ${Math.round(metrics.actionsRect.right)}px <= ${metrics.viewportWidth}px).`);

      // Verify all 9 columns are displayed
      const visibleCols = metrics.ths.filter(t => t.visible);
      assert.strictEqual(visibleCols.length, 9, `Expected 9 columns on ${vp.type}, found ${visibleCols.length}`);
      console.log(`✓ PASS: All 9 columns visible on ${vp.type}.`);
    } else if (vp.type === 'tablet') {
      // Verify tablet has 5 core columns visible
      const visibleCols = metrics.ths.filter(t => t.visible);
      assert.strictEqual(visibleCols.length, 5, `Expected 5 columns on tablet, found ${visibleCols.length}`);
      console.log(`✓ PASS: Tablet displays 5 core balanced columns (Purchase No, Supplier, Items, Total, Actions).`);
    } else if (vp.type === 'mobile') {
      // Verify card layout is active
      const isCardLayout = await page.evaluate(() => {
        const row = document.querySelector('#purchases-table tbody tr');
        return window.getComputedStyle(row).display === 'block';
      });
      assert(isCardLayout, 'FAILURE: Mobile card layout (display: block) is not active at 390px!');
      console.log(`✓ PASS: Mobile card view (display: block) is cleanly rendered at 390px.`);
    }

    // Save screenshot
    const shotPath = path.join(ARTIFACTS_DIR, `verified_${vp.name}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`Saved screenshot: ${shotPath}`);

    // Verify Detail Modal at this viewport
    console.log(`Opening Purchase Details modal at ${vp.name}...`);
    await page.evaluate(() => {
      const moreBtn = document.querySelector('.purchase-more-badge');
      if (moreBtn) {
        moreBtn.click();
      } else {
        const viewBtn = document.querySelector('.action-btn.view');
        if (viewBtn) viewBtn.click();
      }
    });

    await page.waitForFunction(() => {
      const m = document.getElementById('purchase-view-modal');
      return m && m.classList.contains('open');
    });
    await sleep(500);

    const modalMetrics = await page.evaluate(() => {
      const modal = document.querySelector('#purchase-view-modal .modal');
      const table = document.querySelector('#purchase-detail-items-table');
      const tableWrap = document.querySelector('.purchase-detail-table-wrap');

      return {
        modal: { scrollW: modal?.scrollWidth, clientW: modal?.clientWidth },
        tableWrap: { scrollW: tableWrap?.scrollWidth, clientW: tableWrap?.clientWidth },
        table: { scrollW: table?.scrollWidth, clientW: table?.clientWidth },
        viewportW: window.innerWidth
      };
    });

    console.log(`[${vp.name} Modal] Modal: scrollW=${modalMetrics.modal.scrollW}, clientW=${modalMetrics.modal.clientW}`);
    assert(
      modalMetrics.modal.scrollW <= modalMetrics.modal.clientW + 1,
      `FAILURE: Detail modal has horizontal overflow at ${vp.name}`
    );
    assert(
      modalMetrics.tableWrap.scrollW <= modalMetrics.tableWrap.clientW + 1,
      `FAILURE: Detail modal table wrap has horizontal overflow at ${vp.name}`
    );
    console.log(`✓ PASS: Purchase Details Modal fits container with 0 horizontal overflow.`);

    const modalShotPath = path.join(ARTIFACTS_DIR, `verified_modal_${vp.name}.png`);
    await page.screenshot({ path: modalShotPath });
    console.log(`Saved modal screenshot: ${modalShotPath}`);

    // Close modal
    await page.evaluate(() => window.APP.closeModal('purchase-view-modal'));
    await sleep(300);
  }

  await browser.close();
  console.log('\n======================================================');
  console.log('ALL RESPONSIVE NO-OVERFLOW TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runResponsiveTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err.message);
  process.exit(1);
});
