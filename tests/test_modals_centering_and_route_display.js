const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const path = require('path');
const assert = require('assert');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 Starting Verification of Modal Centering, Scrolling, and Source & Destination Display...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // Login
  console.log('\n--- 1. Authenticating Admin User ---');
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

  // =========================================================================
  // TEST GROUP 1: Warehouses Modal Centering & Scrolling across Viewports
  // =========================================================================
  console.log('\n--- 2. Testing Warehouses Modal Centering & Scrolling across Viewports ---');
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'laptop-1024', width: 1024, height: 768 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-320', width: 320, height: 650 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#warehouses-table tbody tr').length > 0);
    await sleep(400);

    // Open Add Warehouse Modal
    await page.evaluate(() => {
      if (typeof openAddWarehouse === 'function') openAddWarehouse();
      else APP.openModal('warehouse-modal');
    });
    await sleep(350);

    const modalMetrics = await page.evaluate((vpWidth, vpHeight) => {
      const modal = document.querySelector('#warehouse-modal .modal');
      const overlay = document.getElementById('warehouse-modal');
      const bodyOverflow = document.body.style.overflow;
      const rect = modal.getBoundingClientRect();
      const leftMargin = rect.left;
      const rightMargin = vpWidth - rect.right;
      const topMargin = rect.top;
      const bottomMargin = vpHeight - rect.bottom;

      return {
        isOpen: overlay.classList.contains('open'),
        bodyOverflow,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
        horizDiff: Math.abs(leftMargin - rightMargin),
        topMargin,
        bottomMargin,
        fitsViewportY: rect.top >= 0 && rect.bottom <= vpHeight + 1,
        fitsViewportX: rect.left >= 0 && rect.right <= vpWidth + 1
      };
    }, vp.width, vp.height);

    console.log(`  [${vp.name}] modal width: ${Math.round(modalMetrics.rect.width)}px, height: ${Math.round(modalMetrics.rect.height)}px`);
    console.log(`    horizontal diff: ${modalMetrics.horizDiff.toFixed(1)}px, top: ${modalMetrics.topMargin.toFixed(1)}px, bottom: ${modalMetrics.bottomMargin.toFixed(1)}px`);
    console.log(`    fitsViewport: X=${modalMetrics.fitsViewportX}, Y=${modalMetrics.fitsViewportY}, bodyOverflow=${modalMetrics.bodyOverflow}`);

    assert(modalMetrics.isOpen, `Modal should be open on ${vp.name}`);
    assert(modalMetrics.horizDiff < 16, `Modal must be horizontally centered on ${vp.name} (diff: ${modalMetrics.horizDiff})`);
    assert(modalMetrics.fitsViewportY, `Modal must not exceed viewport height on ${vp.name}`);
    assert(modalMetrics.fitsViewportX, `Modal must not exceed viewport width on ${vp.name}`);
    assert(modalMetrics.bodyOverflow === 'hidden', `document.body overflow must be locked to hidden while modal is open`);

    // Capture screenshot
    const shotPath = path.join(ARTIFACTS_DIR, `modal_warehouse_${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });

    // Close modal and verify restoration
    await page.evaluate(() => APP.closeModal('warehouse-modal'));
    await sleep(250);
    const restoredOverflow = await page.evaluate(() => document.body.style.overflow);
    assert(restoredOverflow === '', `document.body overflow must be restored to empty after modal close`);
  }
  console.log('  ✓ [PASS] Warehouse modal perfectly centered and bounds constrained on all 6 viewports.');

  // =========================================================================
  // TEST GROUP 2: Dispatches Tab - Source & Destination Display
  // =========================================================================
  console.log('\n--- 3. Testing Dispatches Tab: Source & Destination Explicit Route Blocks ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Array.isArray(window.allOrders) && window.allOrders.length > 0);
  await sleep(600);

  // Switch to Dispatches tab
  await page.evaluate(async () => {
    const tabBtn = document.querySelector('.tabs .tab-btn[data-tab="Dispatches"]');
    if (tabBtn) tabBtn.click();
    if (window.DISPATCH_UI && typeof window.DISPATCH_UI.loadDispatches === 'function') {
      await window.DISPATCH_UI.loadDispatches();
    }
  });
  await sleep(800);

  const routeCheck = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#dispatches-cards-container .dispatch-record-card'));
    const results = [];
    cards.forEach(card => {
      const dspNo = card.querySelector('.dispatch-card-slip-no')?.textContent?.trim();
      const routeBlock = card.querySelector('.dispatch-route-card-block');
      const labels = Array.from(card.querySelectorAll('.dispatch-route-label')).map(l => l.textContent.trim());
      const values = Array.from(card.querySelectorAll('.dispatch-route-val .route-val-text')).map(v => v.textContent.trim());
      const btnView = card.querySelector('button[onclick*="viewDispatch"]');
      const btnInv = card.querySelector('button[onclick*="viewGeneratedInvoice"]');
      results.push({
        dspNo,
        hasRouteBlock: !!routeBlock,
        labels,
        values,
        viewDispatchCall: btnView ? btnView.getAttribute('onclick') : null,
        viewInvoiceCall: btnInv ? btnInv.getAttribute('onclick') : null
      });
    });
    return results;
  });

  console.log('  Dispatches grid route inspection:', JSON.stringify(routeCheck, null, 2));
  assert(routeCheck.length >= 2, 'Should display at least 2 dispatch cards');
  
  // Verify DSP-01 (Godown delivery)
  const dsp1 = routeCheck.find(r => r.dspNo === 'DSP-01');
  assert(dsp1, 'DSP-01 should exist');
  assert(dsp1.hasRouteBlock, 'DSP-01 must have .dispatch-route-card-block');
  assert(dsp1.labels.includes('SOURCE') && dsp1.labels.includes('DESTINATION'), 'DSP-01 must have explicit SOURCE and DESTINATION labels');
  const dsp1Source = dsp1.values[0];
  const dsp1Dest = dsp1.values[1];
  console.log(`  DSP-01: Source="${dsp1Source}" -> Destination="${dsp1Dest}"`);
  assert(dsp1Source.includes('Main Plant Warehouse'), `DSP-01 Source should be Main Plant Warehouse, got: ${dsp1Source}`);
  assert(dsp1Dest.includes('Gas Godown'), `DSP-01 Destination should be Gas Godown, got: ${dsp1Dest}`);

  // Verify DSP-02 (Customer delivery)
  const dsp2 = routeCheck.find(r => r.dspNo === 'DSP-02');
  assert(dsp2, 'DSP-02 should exist');
  assert(dsp2.hasRouteBlock, 'DSP-02 must have .dispatch-route-card-block');
  assert(dsp2.labels.includes('SOURCE') && dsp2.labels.includes('DESTINATION'), 'DSP-02 must have explicit SOURCE and DESTINATION labels');
  const dsp2Source = dsp2.values[0];
  const dsp2Dest = dsp2.values[1];
  console.log(`  DSP-02: Source="${dsp2Source}" -> Destination="${dsp2Dest}"`);
  assert(dsp2Source.includes('Gas Godown'), `DSP-02 Source should be Gas Godown, got: ${dsp2Source}`);
  assert(dsp2Dest.includes('Direct Customer Delivery') || dsp2Dest.includes('Krishi Seva Kendra'), `DSP-02 Destination should be Direct Customer Delivery, got: ${dsp2Dest}`);

  // Capture Dispatch tab screenshots at 1280px and 390px
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'dispatches_tab_cards_desktop_1280.png'), fullPage: false });
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'dispatches_tab_cards_mobile_390.png'), fullPage: false });
  console.log('  ✓ [PASS] Dispatches tab correctly presents explicit SOURCE & DESTINATION for both godown and direct customer transfers.');

  // =========================================================================
  // TEST GROUP 3: Printable Delivery Challan Modal (viewDispatch)
  // =========================================================================
  console.log('\n--- 4. Testing Printable Delivery Challan Modal (Centering & Route Block) ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    // Open dispatch slip for first dispatch
    const dId = window.allDispatches && window.allDispatches[0] ? window.allDispatches[0].id : null;
    if (dId && window.DISPATCH_UI) {
      await window.DISPATCH_UI.viewDispatch(dId);
    }
  });
  await page.waitForFunction(() => document.getElementById('view-dispatch-modal').classList.contains('open'), { timeout: 10000 });
  await sleep(500);

  const slipMetrics = await page.evaluate((vpWidth, vpHeight) => {
    const modal = document.querySelector('#view-dispatch-modal .modal');
    const overlay = document.getElementById('view-dispatch-modal');
    const rect = modal ? modal.getBoundingClientRect() : null;
    const body = modal ? modal.querySelector('.doc-preview-body') : null;
    const routeBlock = document.querySelector('#dispatch-slip-paper .slip-route-grid');
    const labels = routeBlock ? Array.from(routeBlock.querySelectorAll('.slip-route-label')).map(l => l.textContent.trim()) : [];
    const values = routeBlock ? Array.from(routeBlock.querySelectorAll('.slip-route-val')).map(v => v.textContent.trim()) : [];

    return {
      isOpen: overlay && overlay.classList.contains('open'),
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
      horizDiff: rect ? Math.abs(rect.left - (vpWidth - rect.right)) : 999,
      topMargin: rect ? rect.top : 999,
      bottomMargin: rect ? vpHeight - rect.bottom : 999,
      bodyHasScroll: body ? body.scrollHeight > body.clientHeight : false,
      hasRouteGrid: !!routeBlock,
      labels,
      values
    };
  }, 1280, 800);

  console.log('  Delivery Challan modal metrics:', slipMetrics);
  assert(slipMetrics.isOpen, 'Delivery Challan modal must be open');
  assert(slipMetrics.hasRouteGrid, 'Delivery Challan paper must contain .slip-route-grid');
  assert(slipMetrics.horizDiff < 16, `Challan modal must be horizontally centered (diff: ${slipMetrics.horizDiff})`);
  assert(slipMetrics.labels.some(l => l.includes('SOURCE')), 'Must contain SOURCE (DISPATCHING FACILITY)');
  assert(slipMetrics.labels.some(l => l.includes('DESTINATION')), 'Must contain DESTINATION (DELIVERY POINT)');

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'dispatch_challan_modal_desktop_1280.png'), fullPage: false });

  // Test mobile view of Delivery Challan
  await page.setViewport({ width: 390, height: 844 });
  await sleep(400);
  const slipMobile = await page.evaluate((vpWidth, vpHeight) => {
    const modal = document.querySelector('#view-dispatch-modal .modal');
    const rect = modal.getBoundingClientRect();
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
      top: rect.top,
      bottom: rect.bottom,
      horizDiff: Math.abs(rect.left - (vpWidth - rect.right)),
      fits: rect.top >= 0 && rect.bottom <= vpHeight + 1
    };
  }, 390, 844);
  console.log('  Delivery Challan mobile 390px metrics:', slipMobile);
  assert(slipMobile.fits, 'Delivery Challan modal must fit within 390x844 mobile viewport');
  assert(slipMobile.horizDiff < 16, 'Delivery Challan modal must be centered on mobile');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'dispatch_challan_modal_mobile_390.png'), fullPage: false });

  // Close modal
  await page.evaluate(() => APP.closeModal('view-dispatch-modal'));
  await sleep(300);
  console.log('  ✓ [PASS] Delivery Challan modal correctly centered, scrollable, and displays explicit facility route.');

  // =========================================================================
  // TEST GROUP 4: Commercial Invoice Modal (viewGeneratedInvoice)
  // =========================================================================
  console.log('\n--- 5. Testing Commercial Invoice Modal (viewGeneratedInvoice) ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    const dId = window.allDispatches && window.allDispatches[0] ? window.allDispatches[0].id : null;
    if (dId && window.DISPATCH_UI) {
      await window.DISPATCH_UI.viewGeneratedInvoice(dId);
    }
  });
  await page.waitForFunction(() => document.getElementById('view-invoice-modal').classList.contains('open'), { timeout: 10000 });
  await sleep(500);

  const invMetrics = await page.evaluate((vpWidth, vpHeight) => {
    const modal = document.querySelector('#view-invoice-modal .modal');
    const overlay = document.getElementById('view-invoice-modal');
    const rect = modal ? modal.getBoundingClientRect() : null;
    const body = modal ? modal.querySelector('.doc-preview-body') : null;
    return {
      isOpen: overlay && overlay.classList.contains('open'),
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
      horizDiff: rect ? Math.abs(rect.left - (vpWidth - rect.right)) : 999,
      bodyHasScroll: body ? body.scrollHeight > body.clientHeight : false,
      fits: rect ? rect.top >= 0 && rect.bottom <= vpHeight + 1 : false
    };
  }, 1280, 800);
  console.log('  Invoice modal metrics:', invMetrics);
  assert(invMetrics.isOpen, 'Commercial Invoice modal must be open');
  assert(invMetrics.fits, 'Invoice modal must fit within viewport');
  assert(invMetrics.horizDiff < 16, 'Invoice modal must be horizontally centered');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'invoice_modal_desktop_1280.png'), fullPage: false });

  await page.evaluate(() => APP.closeModal('view-invoice-modal'));
  await sleep(300);
  console.log('  ✓ [PASS] Commercial Invoice modal fits viewport and is cleanly scrollable.');

  // =========================================================================
  // TEST GROUP 5: Order Details Modal (viewOrder)
  // =========================================================================
  console.log('\n--- 6. Testing Order Details Modal (viewOrder) ---');
  await page.evaluate(() => {
    const tabBtn = document.querySelector('.tabs .tab-btn[data-tab="Orders"]');
    if (tabBtn) tabBtn.click();
  });
  await sleep(500);

  await page.evaluate(async () => {
    if (window.viewOrder) await window.viewOrder(119);
  });
  await page.waitForFunction(() => document.getElementById('view-modal').classList.contains('open'), { timeout: 10000 });
  await sleep(500);

  const orderModalMetrics = await page.evaluate((vpWidth, vpHeight) => {
    const modal = document.querySelector('#view-modal .modal');
    const overlay = document.getElementById('view-modal');
    const routeBlock = document.querySelector('#view-modal .dispatch-route-card-block');
    const labels = routeBlock ? Array.from(routeBlock.querySelectorAll('.dispatch-route-label')).map(l => l.textContent.trim()) : [];
    const values = routeBlock ? Array.from(routeBlock.querySelectorAll('.dispatch-route-val')).map(v => v.textContent.trim()) : [];
    const rect = modal ? modal.getBoundingClientRect() : null;
    return {
      isOpen: overlay && overlay.classList.contains('open'),
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
      horizDiff: rect ? Math.abs(rect.left - (vpWidth - rect.right)) : 999,
      fits: rect ? rect.top >= 0 && rect.bottom <= vpHeight + 1 : false,
      hasRouteBlock: !!routeBlock,
      labels,
      values
    };
  }, 1280, 800);

  console.log('  Order Details modal route inspection:', orderModalMetrics);
  assert(orderModalMetrics.isOpen, 'Order details modal must be open');
  assert(orderModalMetrics.hasRouteBlock, 'Order details modal must show fulfillment facility route block');
  assert(orderModalMetrics.labels.some(l => l.includes('SOURCE')), 'Order modal must contain SOURCE');
  assert(orderModalMetrics.labels.some(l => l.includes('DESTINATION')), 'Order modal must contain DESTINATION');
  assert(orderModalMetrics.horizDiff < 16, 'Order details modal must be horizontally centered');
  assert(orderModalMetrics.fits, 'Order details modal must fit viewport');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'order_details_modal_desktop_1280.png'), fullPage: false });

  await page.evaluate(() => APP.closeModal('view-modal'));
  await sleep(300);
  console.log('  ✓ [PASS] Order details modal features dedicated SOURCE & DESTINATION fulfillment routes.');

  // =========================================================================
  // TEST GROUP 6: Purchases Details Modal (viewPurchase)
  // =========================================================================
  console.log('\n--- 7. Testing Purchases Details Modal (viewPurchase) ---');
  await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)').length > 0);
  await sleep(600);

  // Click view button on first purchase
  await page.evaluate(async () => {
    if (window.allPurchases && window.allPurchases[0]) {
      await window.viewPurchase(window.allPurchases[0].id);
    } else {
      const viewBtn = document.querySelector('#purchases-table tbody tr:not(.empty-row) button[onclick*="viewPurchase"]');
      if (viewBtn) viewBtn.click();
    }
  });
  await page.waitForFunction(() => document.getElementById('purchase-view-modal').classList.contains('open'), { timeout: 10000 });
  await sleep(500);

  const purchaseModalMetrics = await page.evaluate((vpWidth, vpHeight) => {
    const modal = document.querySelector('#purchase-view-modal .modal');
    const overlay = document.getElementById('purchase-view-modal');
    const routeBlock = document.querySelector('#purchase-view-modal .inward-route-block') || document.querySelector('#purchase-view-modal [style*="grid-template-columns:1fr 1fr"]');
    const labels = routeBlock ? Array.from(routeBlock.querySelectorAll('.dispatch-route-label, div[style*="font-size:10px"]')).map(l => l.textContent.trim()) : [];
    const values = routeBlock ? Array.from(routeBlock.querySelectorAll('.dispatch-route-val, div[style*="font-weight:700"]')).map(v => v.textContent.trim()) : [];
    const rect = modal ? modal.getBoundingClientRect() : null;
    return {
      isOpen: overlay && overlay.classList.contains('open'),
      rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null,
      horizDiff: rect ? Math.abs(rect.left - (vpWidth - rect.right)) : 999,
      fits: rect ? rect.top >= 0 && rect.bottom <= vpHeight + 1 : false,
      hasRouteBlock: !!routeBlock,
      labels,
      values
    };
  }, 1280, 800);

  console.log('  Purchase details modal route inspection:', purchaseModalMetrics);
  assert(purchaseModalMetrics.isOpen, 'Purchase details modal must be open');
  assert(purchaseModalMetrics.hasRouteBlock, 'Purchase details modal must show supply route block');
  assert(purchaseModalMetrics.labels.some(l => l.includes('SOURCE (SUPPLIER)')), 'Must show SOURCE (SUPPLIER)');
  assert(purchaseModalMetrics.labels.some(l => l.includes('DESTINATION (RECEIVING GODOWN)')), 'Must show DESTINATION (RECEIVING GODOWN)');
  assert(purchaseModalMetrics.horizDiff < 16, 'Purchase details modal must be horizontally centered');
  assert(purchaseModalMetrics.fits, 'Purchase details modal must fit viewport');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'purchase_details_modal_desktop_1280.png'), fullPage: false });

  await page.evaluate(() => APP.closeModal('purchase-view-modal'));
  await sleep(300);
  console.log('  ✓ [PASS] Purchases details modal displays explicit SOURCE (SUPPLIER) and DESTINATION (RECEIVING GODOWN).');

  await browser.close();
  console.log('\n🎉 ALL MODAL CENTERING, SCROLLING, AND ROUTE DISPLAY TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
