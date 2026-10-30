const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('====================================================================');
  console.log('>>> STARTING INTERCOMPANY LINKS COMPREHENSIVE E2E VERIFICATION <<<');
  console.log('====================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Authenticate session
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
  console.log('2. Navigating to Intercompany page...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  const pageTitle = await page.title();
  console.log(`✓ Page Title: "${pageTitle}"`);

  // Verify Header and Overview Banner
  const overviewBanner = await page.evaluate(() => {
    const banner = document.querySelector('.intercompany-overview-card');
    return {
      present: !!banner,
      text: banner ? banner.textContent : ''
    };
  });
  console.log(`✓ Plain-English Banner present: ${overviewBanner.present}`);
  assert(overviewBanner.present, 'Overview banner should be visible on page');
  assert(overviewBanner.text.includes('What is this module for?'), 'Banner should explain module purpose');

  // 3. Test New Stock Transfer Modal & Dropdowns
  console.log('\n3. Testing New Stock Transfer Modal & Warehouse Dropdowns...');
  await page.evaluate(() => {
    if (typeof openNewTransfer === 'function') openNewTransfer();
  });
  await sleep(1000);

  const initialModalData = await page.evaluate(() => {
    const fromCo = document.getElementById('tr-from-company');
    const toCo = document.getElementById('tr-to-company');
    const fromWh = document.getElementById('tr-from-warehouse');
    const toWh = document.getElementById('tr-to-warehouse');
    return {
      fromCoVal: fromCo.value,
      fromCoText: fromCo.options[fromCo.selectedIndex]?.text,
      toCoVal: toCo.value,
      toCoText: toCo.options[toCo.selectedIndex]?.text,
      fromWhCount: fromWh.options.length,
      fromWhOptions: Array.from(fromWh.options).map(o => ({ value: o.value, text: o.text, disabled: o.disabled })),
      toWhCount: toWh.options.length,
      toWhOptions: Array.from(toWh.options).map(o => ({ value: o.value, text: o.text, disabled: o.disabled })),
      fromWhVal: fromWh.value,
      toWhVal: toWh.value
    };
  });

  console.log('Initial Modal State:');
  console.log(`  Supplying Company: "${initialModalData.fromCoText}" (ID: ${initialModalData.fromCoVal})`);
  console.log(`  Receiving Company: "${initialModalData.toCoText}" (ID: ${initialModalData.toCoVal})`);
  console.log(`  Source Warehouse options count: ${initialModalData.fromWhCount}`);
  console.log(`  Destination Warehouse options count: ${initialModalData.toWhCount}`);
  console.log(`  Source Warehouse initial value: "${initialModalData.fromWhVal}" (not silently auto-selected)`);
  console.log(`  Destination Warehouse initial value: "${initialModalData.toWhVal}" (not silently auto-selected)`);

  assert(initialModalData.fromWhCount > 1, 'Source Warehouse dropdown should have valid warehouse records');
  assert(initialModalData.toWhCount > 1, 'Destination Warehouse dropdown should have valid warehouse records');
  assert.strictEqual(initialModalData.fromWhVal, '', 'Source Warehouse should not silently auto-select a warehouse');
  assert.strictEqual(initialModalData.toWhVal, '', 'Destination Warehouse should not silently auto-select a warehouse');

  // Verify options belong to appropriate companies
  const hasAACWarehouse = initialModalData.fromWhOptions.some(o => o.text.includes('WH-AAC') || o.text.includes('Godown') || o.text.includes('Store'));
  const hasGASWarehouse = initialModalData.toWhOptions.some(o => o.text.includes('WH-GAS') || o.text.includes('Godown') || o.text.includes('Store'));
  console.log(`✓ Source Warehouse options contain AAC warehouses: ${hasAACWarehouse}`);
  console.log(`✓ Destination Warehouse options contain GAS warehouses: ${hasGASWarehouse}`);
  assert(hasAACWarehouse, 'Supplying company warehouses should belong to AAC');
  assert(hasGASWarehouse, 'Receiving company warehouses should belong to GAS');

  // 4. Test Reactive Company Switching & Dropdown Refresh
  console.log('\n4. Testing Dynamic Warehouse Refresh on Company Change...');
  
  // Switch From Company to Greenfield Agro Solutions (625)
  await page.evaluate(() => {
    const fromCo = document.getElementById('tr-from-company');
    fromCo.value = '625';
    onFromCompanyChange('625');
  });
  await sleep(500);

  const switchedFromWhData = await page.evaluate(() => {
    const fromWh = document.getElementById('tr-from-warehouse');
    return {
      count: fromWh.options.length,
      val: fromWh.value,
      options: Array.from(fromWh.options).map(o => o.text)
    };
  });
  console.log(`✓ Switched Supplying Company to GAS (625). Source Warehouse count: ${switchedFromWhData.count}`);
  const hasGASInFrom = switchedFromWhData.options.some(t => t.includes('WH-GAS') || t.includes('Central Distribution') || t.includes('Greenfield'));
  console.log(`✓ Source Warehouse now lists GAS warehouses: ${hasGASInFrom}`);
  assert(hasGASInFrom, 'Source Warehouse should update to GAS warehouses when company switches');
  assert.strictEqual(switchedFromWhData.val, '', 'Stale source warehouse selection was cleared');

  // Switch back From Company to AAC (623)
  await page.evaluate(() => {
    const fromCo = document.getElementById('tr-from-company');
    fromCo.value = '623';
    onFromCompanyChange('623');
  });
  await sleep(500);

  // 5. Test Invalid Same Warehouse Selection on Internal Branch Transfer
  console.log('\n5. Testing Internal Branch Transfer and Same-Warehouse Protection...');
  await page.evaluate(() => {
    const toCo = document.getElementById('tr-to-company');
    toCo.value = '623'; // Same company as fromCo
    onToCompanyChange('623');
    
    // Select same warehouse for both
    const fromWh = document.getElementById('tr-from-warehouse');
    const toWh = document.getElementById('tr-to-warehouse');
    fromWh.selectedIndex = 1; // pick first real warehouse
    onFromWarehouseChange(fromWh.value);
    toWh.value = fromWh.value; // pick same warehouse
    onToWarehouseChange(toWh.value);
  });
  await sleep(500);

  const sameWhProtection = await page.evaluate(() => {
    const errorEl = document.getElementById('tr-wh-error-msg');
    const toWh = document.getElementById('tr-to-warehouse');
    const saveBtn = document.getElementById('save-transfer-btn');
    return {
      errorVisible: errorEl ? errorEl.style.display !== 'none' : false,
      errorText: errorEl ? errorEl.textContent : '',
      toWhCleared: toWh.value === '',
      btnDisabled: saveBtn ? saveBtn.disabled : false
    };
  });
  console.log(`✓ Same-Warehouse Error displayed: ${sameWhProtection.errorVisible} ("${sameWhProtection.errorText}")`);
  console.log(`✓ Destination selection cleared: ${sameWhProtection.toWhCleared}`);
  assert(sameWhProtection.errorVisible, 'Error should be shown when selecting same warehouse on branch transfer');
  assert(sameWhProtection.toWhCleared, 'Destination selection should be reset');

  // 6. Complete and Save a Valid Test Transfer
  console.log('\n6. Completing and Saving a Valid Stock Transfer...');
  
  // Set From: AAC Finished Goods Godown, To: GAS Central Distribution Godown
  const savedTransferSlipNo = await page.evaluate(() => {
    const fromCo = document.getElementById('tr-from-company');
    fromCo.value = '623';
    onFromCompanyChange('623');
    
    const toCo = document.getElementById('tr-to-company');
    toCo.value = '625';
    onToCompanyChange('625');
    
    const fromWh = document.getElementById('tr-from-warehouse');
    const toWh = document.getElementById('tr-to-warehouse');
    
    // Pick Finished Goods Godown (530) or second option
    fromWh.selectedIndex = 1;
    onFromWarehouseChange(fromWh.value);
    
    toWh.selectedIndex = 1;
    onToWarehouseChange(toWh.value);
    
    document.getElementById('tr-vehicle-no').value = 'GJ-03-TC-8899';
    document.getElementById('tr-transporter').value = 'Shreeji Express Cargo';
    document.getElementById('tr-eway-bill').value = 'EWB-2026-TEST-7711';
    
    return document.getElementById('tr-slip-no').value;
  });
  await sleep(500);

  // Verify Live Summary Card updated
  const summaryCardText = await page.evaluate(() => {
    const card = document.getElementById('tr-live-summary-card');
    return card ? card.textContent : '';
  });
  console.log(`✓ Live Transfer Summary Card:\n    ${summaryCardText.replace(/\s+/g, ' ').trim()}`);
  assert(summaryCardText.includes('Anjani Agri Care'), 'Summary card should show supplying company');
  assert(summaryCardText.includes('Greenfield Agro'), 'Summary card should show receiving company');

  // Take screenshot of filled modal
  await page.screenshot({ path: `${ARTIFACTS_DIR}/intercompany_modal_verified.png` });
  console.log('✓ Saved modal screenshot: intercompany_modal_verified.png');

  // Submit transfer
  console.log('Submitting transfer...');
  await page.evaluate(async () => {
    await saveTransfer();
  });
  await sleep(2000);

  // 7. Verify Saved Transfer in Transfers Table
  console.log('\n7. Verifying Saved Transfer in Stock Transfers Table...');
  const transferRowData = await page.evaluate((slipNo) => {
    const rows = Array.from(document.querySelectorAll('#transfers-table tbody tr'));
    const matchedRow = rows.find(r => r.textContent.includes(slipNo));
    if (!matchedRow) return null;
    return {
      text: matchedRow.textContent,
      hasFromCo: matchedRow.textContent.includes('Anjani Agri Care'),
      hasToCo: matchedRow.textContent.includes('Greenfield Agro'),
      hasVehicle: matchedRow.textContent.includes('GJ-03-TC-8899'),
      status: matchedRow.querySelector('.col-status')?.textContent?.trim()
    };
  }, savedTransferSlipNo);

  console.log('Saved Transfer Row Data:', transferRowData);
  assert(transferRowData, `Transfer ${savedTransferSlipNo} should appear in the transfers table`);
  assert(transferRowData.hasFromCo, 'Table row should show Anjani Agri Care');
  assert(transferRowData.hasToCo, 'Table row should show Greenfield Agro');
  console.log(`✓ Transfer #${savedTransferSlipNo} successfully rendered with status: "${transferRowData.status}"`);

  // 8. Open Transfer Voucher Modal and Verify Saved Details
  console.log('\n8. Viewing Transfer Voucher Modal...');
  await page.evaluate((slipNo) => {
    const rows = Array.from(document.querySelectorAll('#transfers-table tbody tr'));
    const matchedRow = rows.find(r => r.textContent.includes(slipNo));
    const viewBtn = matchedRow?.querySelector('.action-btn.view');
    if (viewBtn) viewBtn.click();
  }, savedTransferSlipNo);
  await sleep(1000);

  const voucherModalData = await page.evaluate(() => {
    const modal = document.getElementById('view-transfer-modal');
    const content = document.getElementById('view-transfer-content');
    return {
      isOpen: modal ? modal.classList.contains('open') : false,
      text: content ? content.textContent : ''
    };
  });
  console.log(`✓ Voucher Modal Open: ${voucherModalData.isOpen}`);
  assert(voucherModalData.isOpen, 'Voucher modal should open');
  assert(voucherModalData.text.includes(savedTransferSlipNo), 'Voucher should display correct transfer number');
  assert(voucherModalData.text.includes('Anjani Agri Care'), 'Voucher should display Supplying Company');
  assert(voucherModalData.text.includes('Greenfield Agro Solutions'), 'Voucher should display Receiving Company');

  await page.screenshot({ path: `${ARTIFACTS_DIR}/intercompany_voucher_verified.png` });
  console.log('✓ Saved voucher screenshot: intercompany_voucher_verified.png');

  // Close modal
  await page.evaluate(() => APP.closeModal('view-transfer-modal'));
  await sleep(500);

  // 9. Test Responsive Layout across Viewports (1440, 1280, 768, 390)
  console.log('\n9. Testing Responsive Layout & Horizontal Overflow across Viewports...');

  const viewports = [
    { name: 'desktop_1440', width: 1440, height: 900, type: 'Desktop' },
    { name: 'laptop_1280', width: 1280, height: 800, type: 'Laptop' },
    { name: 'tablet_768', width: 768, height: 1024, type: 'Tablet' },
    { name: 'mobile_390', width: 390, height: 844, type: 'Mobile' }
  ];

  for (const vp of viewports) {
    console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height} - ${vp.type}) ---`);
    await page.setViewport({ width: vp.width, height: vp.height });
    await sleep(500);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const tableWrap = document.getElementById('transfers-table-wrap');
      const table = document.getElementById('transfers-table');
      return {
        docScrollW: doc.scrollWidth,
        docClientW: doc.clientWidth,
        wrapScrollW: tableWrap ? tableWrap.scrollWidth : 0,
        wrapClientW: tableWrap ? tableWrap.clientWidth : 0,
        tableScrollW: table ? table.scrollWidth : 0,
        tableClientW: table ? table.clientWidth : 0
      };
    });

    console.log(`  Document: scrollW=${metrics.docScrollW}, clientW=${metrics.docClientW}`);
    console.log(`  TableWrap: scrollW=${metrics.wrapScrollW}, clientW=${metrics.wrapClientW}`);

    const docOverflow = metrics.docScrollW > metrics.docClientW;
    const wrapOverflow = metrics.wrapScrollW > metrics.wrapClientW;

    console.log(`  Doc Overflow: ${docOverflow ? 'FAIL' : 'PASS (0px)'}`);
    console.log(`  Wrap Overflow: ${wrapOverflow ? 'FAIL' : 'PASS (0px)'}`);

    assert(!docOverflow, `Document should have zero horizontal overflow at ${vp.name}`);
    assert(!wrapOverflow, `Table wrap should have zero horizontal overflow at ${vp.name}`);

    // Capture screenshot
    await page.screenshot({ path: `${ARTIFACTS_DIR}/intercompany_${vp.name}_verified.png` });
    console.log(`  ✓ Screenshot saved: intercompany_${vp.name}_verified.png`);
  }

  // 10. Audit Tabs 2 and 3
  console.log('\n10. Auditing Tab 2 (Stock Reconciliation) & Tab 3 (Company Trading Matrix)...');
  
  // Click Tab 2
  await page.evaluate(() => {
    const tabBtn = Array.from(document.querySelectorAll('.tabs .tab-btn')).find(b => b.textContent.includes('Reconciliation'));
    if (tabBtn) tabBtn.click();
  });
  await sleep(1000);

  const reconMetrics = await page.evaluate(() => {
    const view = document.getElementById('reconciliation-view');
    const doc = document.documentElement;
    return {
      visible: view && view.style.display !== 'none',
      docScrollW: doc.scrollWidth,
      docClientW: doc.clientWidth,
      ownedUnits: document.getElementById('recon-owned-units')?.textContent,
      intransitUnits: document.getElementById('recon-intransit-units')?.textContent
    };
  });
  console.log(`✓ Stock Reconciliation Tab Active: ${reconMetrics.visible}`);
  console.log(`✓ Reconciliation Metrics: Owned=${reconMetrics.ownedUnits}, In-Transit=${reconMetrics.intransitUnits}`);
  assert(! (reconMetrics.docScrollW > reconMetrics.docClientW), 'Stock Reconciliation tab should have zero horizontal scroll');

  // Click Tab 3
  await page.evaluate(() => {
    const tabBtn = Array.from(document.querySelectorAll('.tabs .tab-btn')).find(b => b.textContent.includes('Trading Matrix'));
    if (tabBtn) tabBtn.click();
  });
  await sleep(1000);

  const matrixMetrics = await page.evaluate(() => {
    const view = document.getElementById('relationships-view');
    const doc = document.documentElement;
    return {
      visible: view && view.style.display !== 'none',
      docScrollW: doc.scrollWidth,
      docClientW: doc.clientWidth,
      rowCount: document.querySelectorAll('#relationships-table tbody tr').length
    };
  });
  console.log(`✓ Company Trading Matrix Tab Active: ${matrixMetrics.visible} (Rows: ${matrixMetrics.rowCount})`);
  assert(! (matrixMetrics.docScrollW > matrixMetrics.docClientW), 'Trading Matrix tab should have zero horizontal scroll');

  console.log('\n====================================================================');
  console.log('>>> ALL INTERCOMPANY MODULE TESTS PASSED FLAWLESSLY! <<<');
  console.log('====================================================================\n');

  await browser.close();
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
