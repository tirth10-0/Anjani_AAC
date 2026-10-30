const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 Starting Verification of Source & Destination UI Refinement in Orders → Dispatches...\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('vite') && !txt.includes('WebSocket')) {
        console.log('  [BROWSER]:', txt);
      }
    });

    // 1. Authenticate
    console.log('--- 1. Authenticating Admin User ---');
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
    console.log('  ✓ Authenticated successfully.');

    // 2. Open Orders page -> Dispatches tab at 1280px
    console.log('\n--- 2. Inspecting Desktop (1280px) Route Card Elements ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.tab-btn[data-tab="Dispatches"]', { timeout: 10000 });
    await page.click('button.tab-btn[data-tab="Dispatches"]');
    await sleep(1500);

    const routeCards = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.dispatch-record-card'));
      return cards.map(c => {
        const slipNo = c.querySelector('.dispatch-card-slip-no')?.textContent?.trim();
        const routeBlock = c.querySelector('.dispatch-route-card-block');
        const sourceLabel = routeBlock?.querySelector('.dispatch-source-col .dispatch-route-label')?.textContent?.trim();
        const destLabel = routeBlock?.querySelector('.dispatch-dest-col .dispatch-route-label')?.textContent?.trim();
        const sourceText = routeBlock?.querySelector('.dispatch-source-col .route-val-text')?.textContent?.trim();
        const sourceSub = routeBlock?.querySelector('.dispatch-source-col .dispatch-route-sub')?.textContent?.trim();
        const destText = routeBlock?.querySelector('.dispatch-dest-col .route-val-text')?.textContent?.trim();
        const destSub = routeBlock?.querySelector('.dispatch-dest-col .dispatch-route-sub')?.textContent?.trim();

        // Computed styles
        const sLabelStyle = window.getComputedStyle(routeBlock?.querySelector('.dispatch-source-col .dispatch-route-label'));
        const dLabelStyle = window.getComputedStyle(routeBlock?.querySelector('.dispatch-dest-col .dispatch-route-label'));
        const sIconStyle = window.getComputedStyle(routeBlock?.querySelector('.dispatch-source-col .route-icon'));
        const dIconStyle = window.getComputedStyle(routeBlock?.querySelector('.dispatch-dest-col .route-icon'));
        const arrowBadgeStyle = window.getComputedStyle(routeBlock?.querySelector('.dispatch-route-arrow-badge'));

        const sColRect = routeBlock?.querySelector('.dispatch-source-col')?.getBoundingClientRect();
        const dColRect = routeBlock?.querySelector('.dispatch-dest-col')?.getBoundingClientRect();
        const arrowRect = routeBlock?.querySelector('.dispatch-route-arrow-col')?.getBoundingClientRect();

        return {
          slipNo,
          sourceLabel,
          destLabel,
          sourceText,
          sourceSub,
          destText,
          destSub,
          sLabelColor: sLabelStyle.color,
          dLabelColor: dLabelStyle.color,
          sLabelFontSize: sLabelStyle.fontSize,
          dLabelFontSize: dLabelStyle.fontSize,
          sLabelFontWeight: sLabelStyle.fontWeight,
          dLabelFontWeight: dLabelStyle.fontWeight,
          sIconColor: sIconStyle.color,
          dIconColor: dIconStyle.color,
          arrowColor: arrowBadgeStyle.color,
          sWidth: sColRect ? Math.round(sColRect.width) : 0,
          dWidth: dColRect ? Math.round(dColRect.width) : 0,
          arrowWidth: arrowRect ? Math.round(arrowRect.width) : 0,
          arrowLeft: arrowRect ? Math.round(arrowRect.left) : 0,
          arrowRight: arrowRect ? Math.round(arrowRect.right) : 0,
          sRight: sColRect ? Math.round(sColRect.right) : 0,
          dLeft: dColRect ? Math.round(dColRect.left) : 0
        };
      });
    });

    console.log('  Route cards details:', JSON.stringify(routeCards, null, 2));

    assert(routeCards.length >= 2, 'Should have at least 2 dispatches displayed');
    const dsp2 = routeCards.find(r => r.slipNo === 'DSP-02') || routeCards[0];
    const dsp1 = routeCards.find(r => r.slipNo === 'DSP-01') || routeCards[1];

    // Verify Label Visual Parity
    assert.strictEqual(dsp2.sourceLabel, 'SOURCE');
    assert.strictEqual(dsp2.destLabel, 'DESTINATION');
    assert.strictEqual(dsp2.sLabelColor, dsp2.dLabelColor, 'SOURCE and DESTINATION labels must have identical colors');
    assert.strictEqual(dsp2.sLabelFontSize, dsp2.dLabelFontSize, 'SOURCE and DESTINATION labels must have identical font sizes');
    assert.strictEqual(dsp2.sLabelFontWeight, dsp2.dLabelFontWeight, 'SOURCE and DESTINATION labels must have identical font weights');
    assert(!dsp2.dLabelColor.includes('3, 105, 161') && !dsp2.dLabelColor.includes('2, 132, 199'), 'Destination label must NOT be bright blue');
    console.log('  ✓ Source & Destination labels have matching style & color (no blue).');

    // Verify Icons Color Parity
    assert.strictEqual(dsp2.sIconColor, dsp2.dIconColor, 'Source and Destination icons must have matching theme green color');
    assert(!dsp2.dIconColor.includes('2, 132, 199'), 'Destination icon must NOT be bright blue');
    console.log('  ✓ Destination icon standardized to theme green.');

    // Verify Clean Titles & Subtitles
    assert(!dsp2.destText.startsWith('Direct Customer Delivery — '), 'Destination title should not be cluttered with prefix');
    assert(dsp2.destText.includes('Krishi Seva Kendra') || dsp2.destText.includes('Makwana'), 'Destination title must be clean customer name');
    assert.strictEqual(dsp2.destSub, 'Customer Consignee Location', 'Subtitle must be Customer Consignee Location');
    console.log('  ✓ DSP-02 customer destination title & subtitle cleaned up.');

    assert(dsp1.destText.includes('Gas Godown') || dsp1.destText.includes('GAS'), 'DSP-01 destination must be Gas Godown');
    assert.strictEqual(dsp1.destSub, 'Godown Stocking Point', 'DSP-01 subtitle must be Godown Stocking Point');
    console.log('  ✓ DSP-01 godown destination verified.');

    // Verify Column Balance & Spacing
    const widthDiff = Math.abs(dsp2.sWidth - dsp2.dWidth);
    assert(widthDiff <= 2, `Source and Destination columns must have equal width (diff: ${widthDiff}px)`);
    assert(dsp2.arrowLeft >= dsp2.sRight, 'Arrow must not overlap Source column');
    assert(dsp2.dLeft >= dsp2.arrowRight, 'Arrow must not overlap Destination column');
    console.log(`  ✓ Column widths balanced: Source=${dsp2.sWidth}px, Arrow=${dsp2.arrowWidth}px, Dest=${dsp2.dWidth}px. No overlap.`);

    // Capture 1280px Desktop screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dispatch_route_desktop_1280.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot captured: dispatch_route_desktop_1280.png');

    // 3. Test Laptop Widths: 1440px, 1366px, 1024px
    console.log('\n--- 3. Testing Desktop & Laptop Viewports (1440px, 1366px, 1024px) ---');
    for (const w of [1440, 1366, 1024]) {
      await page.setViewport({ width: w, height: 800 });
      await sleep(300);
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const viewWidth = window.innerWidth;
        const cardBlocks = Array.from(document.querySelectorAll('.dispatch-route-card-block'));
        const cardOverflows = cardBlocks.some(b => b.scrollWidth > b.clientWidth);
        return { docWidth, viewWidth, pageOverflow: docWidth > viewWidth, cardOverflows };
      });
      assert(!overflow.pageOverflow, `Viewport ${w}px must have zero page horizontal overflow`);
      assert(!overflow.cardOverflows, `Viewport ${w}px must have zero card route block overflow`);
      console.log(`  ✓ Viewport ${w}px: Zero overflow confirmed.`);
    }

    await page.setViewport({ width: 1024, height: 768 });
    await sleep(300);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dispatch_route_laptop_1024.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot captured: dispatch_route_laptop_1024.png');

    // 4. Test Tablet Viewport (768px)
    console.log('\n--- 4. Testing Tablet Viewport (768px) ---');
    await page.setViewport({ width: 768, height: 1024 });
    await sleep(300);
    const tabletData = await page.evaluate(() => {
      const card = document.querySelector('.dispatch-record-card');
      const routeBlock = card?.querySelector('.dispatch-route-card-block');
      const sCol = routeBlock?.querySelector('.dispatch-source-col');
      const dCol = routeBlock?.querySelector('.dispatch-dest-col');
      const sRect = sCol?.getBoundingClientRect();
      const dRect = dCol?.getBoundingClientRect();
      return {
        cardWidth: card?.offsetWidth,
        blockWidth: routeBlock?.offsetWidth,
        sWidth: sRect ? Math.round(sRect.width) : 0,
        dWidth: dRect ? Math.round(dRect.width) : 0,
        overflow: document.documentElement.scrollWidth > window.innerWidth
      };
    });
    console.log('  Tablet (768px) metrics:', tabletData);
    assert(!tabletData.overflow, 'Tablet must have zero horizontal overflow');
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dispatch_route_tablet_768.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot captured: dispatch_route_tablet_768.png');

    // 5. Test Mobile Viewports (430px, 390px, 375px, 360px, 320px)
    console.log('\n--- 5. Testing Mobile Viewports (Vertical Stacking & Rotated Down Arrow) ---');
    for (const w of [430, 390, 375, 360, 320]) {
      await page.setViewport({ width: w, height: 844 });
      await sleep(300);

      const mobileEval = await page.evaluate(() => {
        const routeBlock = document.querySelector('.dispatch-route-card-block');
        const sCol = routeBlock?.querySelector('.dispatch-source-col');
        const dCol = routeBlock?.querySelector('.dispatch-dest-col');
        const arrowBadge = routeBlock?.querySelector('.dispatch-route-arrow-badge');
        const sRect = sCol?.getBoundingClientRect();
        const dRect = dCol?.getBoundingClientRect();
        const badgeStyle = window.getComputedStyle(arrowBadge);
        const isRotated = badgeStyle.transform.includes('matrix') || badgeStyle.transform.includes('rotate');
        const docWidth = document.documentElement.scrollWidth;
        const viewWidth = window.innerWidth;

        return {
          stacked: dRect && sRect ? dRect.top > sRect.bottom : false,
          isRotated,
          badgeTransform: badgeStyle.transform,
          sWidth: sRect ? Math.round(sRect.width) : 0,
          dWidth: dRect ? Math.round(dRect.width) : 0,
          pageOverflow: docWidth > viewWidth,
          cardOverflow: routeBlock ? routeBlock.scrollWidth > routeBlock.clientWidth : false
        };
      });

      console.log(`  Mobile ${w}px result:`, mobileEval);
      assert(mobileEval.stacked, `At ${w}px, Source and Destination should be vertically stacked`);
      assert(mobileEval.isRotated, `At ${w}px, Arrow badge should be rotated 90deg to point downwards`);
      assert(!mobileEval.pageOverflow, `At ${w}px, zero page horizontal overflow allowed`);
      assert(!mobileEval.cardOverflow, `At ${w}px, zero card route horizontal overflow allowed`);
    }

    // Capture 390px and 320px screenshots
    await page.setViewport({ width: 390, height: 844 });
    await sleep(300);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dispatch_route_mobile_390.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot captured: dispatch_route_mobile_390.png');

    await page.setViewport({ width: 320, height: 568 });
    await sleep(300);
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dispatch_route_mobile_320.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot captured: dispatch_route_mobile_320.png');

    console.log('\n======================================================');
    console.log('🎉 ALL SOURCE & DESTINATION UI REFINEMENT TESTS PASSED!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
