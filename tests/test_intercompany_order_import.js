const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('========================================================================');
  console.log('>>> TESTING 1-CLICK ORDER AUTO-FILL INTO INTERCOMPANY STOCK TRANSFER <<<');
  console.log('========================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Authenticate
    console.log('1. Authenticating admin session...');
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

    // 2. Open Intercompany Page
    console.log('2. Opening Intercompany Links page...');
    await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle0' });
    await sleep(1500);

    // 3. Open New Stock Transfer modal
    console.log('3. Opening New Stock Transfer modal...');
    await page.evaluate(() => {
      if (typeof openNewTransfer === 'function') openNewTransfer();
    });
    await sleep(1000);

    // 4. Verify Workflow Guide Banner and Auto-Fill Toolbar
    console.log('4. Verifying Workflow Guide & Auto-Fill Toolbar...');
    const modalInspection = await page.evaluate(() => {
      const modal = document.getElementById('transfer-modal');
      const isVisible = modal && (modal.classList.contains('open') || modal.classList.contains('active'));
      const workflowBanner = modal.querySelector('.modal-body > form > div:first-child');
      const orderSelect = document.getElementById('tr-import-order-select');
      const orderOptions = Array.from(orderSelect ? orderSelect.options : []).map(o => ({ value: o.value, text: o.text }));
      
      return {
        isVisible,
        hasWorkflowBanner: !!workflowBanner && workflowBanner.textContent.includes('Quick Workflow Guide'),
        hasOrderSelect: !!orderSelect,
        orderOptions
      };
    });

    console.log('   ✓ Modal visible:', modalInspection.isVisible);
    assert(modalInspection.isVisible, 'Modal should be active');
    console.log('   ✓ Quick Workflow Guide banner present:', modalInspection.hasWorkflowBanner);
    assert(modalInspection.hasWorkflowBanner, 'Workflow clarification guide banner must be present');
    console.log('   ✓ Order options in dropdown:', modalInspection.orderOptions.length);
    console.log('   Sample order options:', modalInspection.orderOptions.slice(0, 3));
    assert(modalInspection.orderOptions.length > 1, 'Should have at least 1 sales order available to import');

    // 5. Select Order O-01 (ID 90) to Auto-Fill
    console.log('\n5. Selecting Order #O-01 to test 1-click Auto-Fill...');
    await page.evaluate(async () => {
      const sel = document.getElementById('tr-import-order-select');
      sel.value = '90';
      await onImportOrderSelected('90');
    });
    await sleep(1200);

    // 6. Inspect auto-filled line items and totals
    const autoFilledData = await page.evaluate(() => {
      const statusEl = document.getElementById('tr-order-import-status');
      const statusText = statusEl ? statusEl.textContent : '';
      const statusDisplay = statusEl ? window.getComputedStyle(statusEl).display : 'none';

      const rows = Array.from(document.querySelectorAll('#tr-items-tbody tr'));
      const items = rows.map(r => ({
        prodText: r.querySelector('.tr-item-prod')?.options[r.querySelector('.tr-item-prod').selectedIndex]?.text,
        packSize: r.querySelector('.tr-item-pack')?.value,
        batchText: r.querySelector('.tr-item-batch')?.options[r.querySelector('.tr-item-batch').selectedIndex]?.text,
        qty: parseInt(r.querySelector('.tr-item-qty')?.value, 10),
        upb: parseInt(r.querySelector('.tr-item-upb')?.value, 10),
        price: parseFloat(r.querySelector('.tr-item-price')?.value),
        total: r.querySelector('.tr-item-total')?.textContent
      }));

      const slipNo = document.getElementById('tr-slip-no')?.value;
      const notes = document.getElementById('tr-notes')?.value;
      const summaryCard = document.getElementById('tr-live-summary-card')?.textContent;

      return {
        statusDisplay,
        statusText,
        itemCount: items.length,
        items,
        slipNo,
        notes,
        summaryCard
      };
    });

    console.log('   ✓ Import Status Banner visible:', autoFilledData.statusDisplay !== 'none');
    console.log('   ✓ Status Text:', autoFilledData.statusText);
    assert(autoFilledData.statusDisplay !== 'none', 'Import status banner should be displayed');
    assert(autoFilledData.statusText.includes('Auto-filled 12 products'), 'Status should confirm 12 products auto-filled');

    console.log('   ✓ Number of auto-filled line items:', autoFilledData.itemCount);
    assert.strictEqual(autoFilledData.itemCount, 12, 'Expected exactly 12 items imported from Order O-01');

    console.log('   ✓ Auto-generated Slip No:', autoFilledData.slipNo);
    assert(autoFilledData.slipNo.includes('ICT-O-01') || autoFilledData.slipNo.includes('ICT-'), 'Slip No should be auto-set');

    console.log('   ✓ Auto-generated Notes:', autoFilledData.notes);
    assert(autoFilledData.notes.includes('O-01') || autoFilledData.notes.includes('Beej Bhandar'), 'Notes should reference order');

    console.log('\n   Inspecting sample auto-filled rows:');
    autoFilledData.items.slice(0, 4).forEach((it, idx) => {
      console.log(`     Row ${idx + 1}: ${it.prodText} | Pack: ${it.packSize} | Qty: ${it.qty} | UPB: ${it.upb} | Rate: ₹${it.price} | Total: ${it.total}`);
    });

    // Check specific lines from Order O-01
    const chlorRow1 = autoFilledData.items[0];
    assert.strictEqual(chlorRow1.qty, 100, 'First item quantity should be 100');
    assert.strictEqual(chlorRow1.price, 650, 'First item price should be 650');
    assert.strictEqual(chlorRow1.upb, 10, 'First item UPB should be 10');

    const chlorRow2 = autoFilledData.items[1];
    assert.strictEqual(chlorRow2.qty, 80, 'Second item quantity should be 80');
    assert.strictEqual(chlorRow2.price, 350, 'Second item price should be 350');
    assert.strictEqual(chlorRow2.upb, 20, 'Second item UPB should be 20');

    // Verify summary card
    console.log('\n   Live Summary Card:', autoFilledData.summaryCard.replace(/\s+/g, ' '));
    assert(autoFilledData.summaryCard.includes('1280 Units'), 'Summary card should show 1280 total units');
    assert(autoFilledData.summaryCard.includes('64 Boxes'), 'Summary card should show 64 total boxes');
    assert(autoFilledData.summaryCard.includes('13,48,200') || autoFilledData.summaryCard.includes('1348200'), 'Summary card should show total ₹13,48,200');

    // Take screenshot of populated modal
    const modalScreenshotPath = path.join(ARTIFACTS_DIR, 'intercompany_autofill_order_verified.png');
    await page.screenshot({ path: modalScreenshotPath, fullPage: false });
    console.log(`   ✓ Saved verified screenshot to: ${modalScreenshotPath}`);

    // 7. Test "Reset Lines" functionality
    console.log('\n7. Testing "Reset Lines" button...');
    await page.evaluate(() => {
      clearImportedOrderItems();
    });
    await sleep(500);

    const resetState = await page.evaluate(() => {
      const rows = document.querySelectorAll('#tr-items-tbody tr');
      const orderSel = document.getElementById('tr-import-order-select');
      const statusEl = document.getElementById('tr-order-import-status');
      return {
        rowCount: rows.length,
        orderSelVal: orderSel.value,
        statusHidden: !statusEl || window.getComputedStyle(statusEl).display === 'none'
      };
    });
    console.log('   ✓ Row count after reset:', resetState.rowCount);
    console.log('   ✓ Selector value after reset:', resetState.orderSelVal);
    console.log('   ✓ Status hidden:', resetState.statusHidden);
    assert.strictEqual(resetState.rowCount, 1, 'Should reset to 1 empty product line');
    assert.strictEqual(resetState.orderSelVal, '', 'Selector should reset');
    assert(resetState.statusHidden, 'Status banner should be hidden');

    // 8. Re-import and save a real transfer
    console.log('\n8. Re-importing Order O-01 and creating Stock Transfer...');
    await page.evaluate(async () => {
      const sel = document.getElementById('tr-import-order-select');
      sel.value = '90';
      await onImportOrderSelected('90');

      // Select valid source and destination warehouses
      const fromWh = document.getElementById('tr-from-warehouse');
      if (fromWh.options.length > 1) {
        fromWh.selectedIndex = 1;
        onFromWarehouseChange(fromWh.value);
      }

      const toCo = document.getElementById('tr-to-company');
      // Pick another company if available
      if (toCo.options.length > 1) {
        toCo.selectedIndex = 1;
        onToCompanyChange(toCo.value);
      }

      const toWh = document.getElementById('tr-to-warehouse');
      if (toWh.options.length > 1) {
        toWh.selectedIndex = 1;
        onToWarehouseChange(toWh.value);
      }
    });
    await sleep(1000);

    await page.evaluate(async () => {
      await saveTransfer();
    });
    await sleep(1500);

    const createdTransfer = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#transfers-table tbody tr'));
      const firstRowText = rows[0]?.textContent || '';
      return {
        firstRowText,
        hasTransfer: firstRowText.includes('ICT-O-01') || firstRowText.includes('Beej Bhandar') || firstRowText.includes('1,280') || firstRowText.includes('Draft')
      };
    });
    console.log('   ✓ First row in transfers table:', createdTransfer.firstRowText.replace(/\s+/g, ' ').slice(0, 100));
    assert(createdTransfer.hasTransfer, 'New transfer should appear in table');

    // 9. Test Deep Linking from URL: intercompany.html?import_order_id=90
    console.log('\n9. Testing direct URL deep link: pages/intercompany.html?import_order_id=90...');
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.goto(`${BASE_URL}/pages/intercompany.html?import_order_id=90`, { waitUntil: 'networkidle0' });
    await sleep(2000);

    const deepLinkData = await page2.evaluate(() => {
      const modal = document.getElementById('transfer-modal');
      const isVisible = modal && (modal.classList.contains('open') || modal.classList.contains('active'));
      const rows = document.querySelectorAll('#tr-items-tbody tr');
      const statusEl = document.getElementById('tr-order-import-status');
      return {
        isVisible,
        rowCount: rows.length,
        statusText: statusEl ? statusEl.textContent : ''
      };
    });
    console.log('   ✓ Modal auto-opened on deep link:', deepLinkData.isVisible);
    console.log('   ✓ Items auto-imported on page load:', deepLinkData.rowCount);
    console.log('   ✓ Status:', deepLinkData.statusText);
    assert(deepLinkData.isVisible, 'Modal must auto-open when URL has import_order_id');
    assert.strictEqual(deepLinkData.rowCount, 12, 'All 12 items should be imported automatically upon page load');
    await page2.close();

    // 10. Test Orders page: View Details modal contains shortcut button
    console.log('\n10. Testing Orders page View Details modal shortcut...');
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle0' });
    await sleep(1500);

    const ordersPageData = await page.evaluate(async () => {
      // Open view order for ID 90
      await viewOrder(90);
      await new Promise(r => setTimeout(r, 600));

      const modal = document.getElementById('view-modal');
      const transferBtn = modal?.querySelector('a[href*="intercompany.html?import_order_id=90"]');
      const cardTransferLink = document.querySelector('a[href*="intercompany.html?import_order_id="]');

      return {
        modalVisible: modal && (modal.classList.contains('open') || modal.classList.contains('active')),
        hasTransferBtnInModal: !!transferBtn,
        transferBtnHref: transferBtn ? transferBtn.getAttribute('href') : null,
        hasCardTransferLink: !!cardTransferLink
      };
    });
    console.log('   ✓ Order Details modal open:', ordersPageData.modalVisible);
    console.log('   ✓ "Transfer via Intercompany" button present in modal:', ordersPageData.hasTransferBtnInModal);
    console.log('   ✓ Button href:', ordersPageData.transferBtnHref);
    console.log('   ✓ Order card shortcut present:', ordersPageData.hasCardTransferLink);
    assert(ordersPageData.hasTransferBtnInModal, 'Order details modal must provide shortcut to Intercompany transfer');
    assert.strictEqual(ordersPageData.transferBtnHref, 'intercompany.html?import_order_id=90', 'Href must point to order import');

    const ordersModalScreenshot = path.join(ARTIFACTS_DIR, 'orders_intercompany_shortcut_verified.png');
    await page.screenshot({ path: ordersModalScreenshot });
    console.log(`   ✓ Saved orders modal shortcut screenshot to: ${ordersModalScreenshot}`);

    console.log('\n========================================================================');
    console.log('>>> ALL TESTS PASSED: 1-CLICK ORDER IMPORT & WORKFLOW INTEGRATION <<<');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
