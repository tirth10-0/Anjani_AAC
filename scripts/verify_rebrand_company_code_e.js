const puppeteer = require('puppeteer-core');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artDir = 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runVerification() {
  console.log('=== STARTING COMPREHENSIVE VERIFICATION FOR COMPANY CODE E ===');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // 1. Authenticate
  console.log('Step 1: Authenticating...');
  await page.goto('http://localhost:5174/login.html', { waitUntil: 'domcontentloaded' });
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
    localStorage.setItem('erp_active_company_code', 'E');
    localStorage.setItem('active_company_code', 'E');
    localStorage.setItem('erp_active_company_name', 'Estimate');
  });
  await sleep(1500);

  // 2. Dashboard Verification
  console.log('Step 2: Checking Dashboard...');
  await page.goto('http://localhost:5174/pages/dashboard.html', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const dashboardDetails = await page.evaluate(() => {
    const compPill = document.querySelector('.company-active-pill, .topbar-company-pill, .company-name');
    const brandName = document.querySelector('.sidebar-brand-name, .brand-text');
    return {
      pillText: compPill ? compPill.innerText.trim() : null,
      brandText: brandName ? brandName.innerText.trim() : null
    };
  });
  console.log('Dashboard Details:', dashboardDetails);
  await page.screenshot({ path: `${artDir}/e_code_dashboard_desktop.png`, fullPage: false });

  // 3. Companies Page Verification
  console.log('Step 3: Checking Companies Page...');
  await page.goto('http://localhost:5174/pages/companies.html', { waitUntil: 'networkidle2' });
  await sleep(2000);
  const companyTableInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#companies-table-body tr, .company-row'));
    return rows.map(r => r.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Companies Table Rows:', companyTableInfo);
  await page.screenshot({ path: `${artDir}/e_code_companies_desktop.png`, fullPage: false });

  // Open Branches Modal for company
  console.log('Step 3b: Opening Branches Modal...');
  const branchesOpened = await page.evaluate(() => {
    const brBtn = document.querySelector('button[title*="Branch"], .btn-branches, button[onclick*="openBranchesModal"]');
    if (brBtn) {
      brBtn.click();
      return true;
    }
    // Try finding by onclick
    const allBtns = Array.from(document.querySelectorAll('button'));
    const btn = allBtns.find(b => b.innerText.includes('Branches') || (b.getAttribute('onclick') && b.getAttribute('onclick').includes('openBranchesModal')));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (branchesOpened) {
    await sleep(1000);
    const branchModalText = await page.evaluate(() => {
      const modal = document.getElementById('branches-modal');
      return modal ? modal.innerText.replace(/\s+/g, ' ').trim() : null;
    });
    console.log('Branches Modal Text:', branchModalText);
    await page.screenshot({ path: `${artDir}/e_code_branches_modal.png` });
    await page.evaluate(() => APP.closeModal('branches-modal'));
    await sleep(500);
  }

  // 4. Warehouses Page Verification
  console.log('Step 4: Checking Warehouses Page...');
  await page.goto('http://localhost:5174/pages/warehouses.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  const warehouseRowsInfo = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.wh-grid > .wh-card, #warehouses-table-body tr, .wh-card-wrapper'));
    return rows.map(r => r.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Warehouse Cards/Rows:', warehouseRowsInfo);
  await page.screenshot({ path: `${artDir}/e_code_warehouses_desktop.png`, fullPage: false });

  // Open View Stock on Gas Godown (ID 532)
  console.log('Step 4b: Opening Gas Godown View Stock...');
  await page.evaluate(() => {
    if (typeof openWarehouseDetails === 'function') {
      openWarehouseDetails(532, 'stock');
    }
  });
  await sleep(2000);
  const gasGodownModalMeta = await page.evaluate(() => {
    const modal = document.getElementById('warehouse-view-modal');
    const header = modal ? modal.querySelector('.wh-modal-header-panel, .modal-header') : null;
    const body = modal ? modal.querySelector('#warehouse-view-body') : null;
    return {
      headerText: header ? header.innerText.replace(/\s+/g, ' ').trim() : null,
      batchRowsCount: body ? body.querySelectorAll('tbody tr, .stock-batch-card').length : 0
    };
  });
  console.log('Gas Godown Modal Meta:', gasGodownModalMeta);
  await page.screenshot({ path: `${artDir}/e_code_warehouse_gas_godown.png` });
  await page.evaluate(() => APP.closeModal('warehouse-view-modal'));
  await sleep(1000);

  // Open View Stock on Main Plant Warehouse (ID 1)
  console.log('Step 4c: Opening Main Plant Warehouse View Stock...');
  await page.evaluate(() => {
    if (typeof openWarehouseDetails === 'function') {
      openWarehouseDetails(1, 'stock');
    }
  });
  await sleep(2000);
  const mainPlantModalMeta = await page.evaluate(() => {
    const modal = document.getElementById('warehouse-view-modal');
    const header = modal ? modal.querySelector('.wh-modal-header-panel, .modal-header') : null;
    const body = modal ? modal.querySelector('#warehouse-view-body') : null;
    return {
      headerText: header ? header.innerText.replace(/\s+/g, ' ').trim() : null,
      batchRowsCount: body ? body.querySelectorAll('tbody tr, .stock-batch-card').length : 0
    };
  });
  console.log('Main Plant Modal Meta:', mainPlantModalMeta);
  await page.screenshot({ path: `${artDir}/e_code_warehouse_main_plant.png` });
  await page.evaluate(() => APP.closeModal('warehouse-view-modal'));
  await sleep(1000);

  // 5. Orders Page Verification
  console.log('Step 5: Checking Orders Page...');
  await page.goto('http://localhost:5174/pages/orders.html', { waitUntil: 'networkidle2' });
  await sleep(2500);

  // Open New Order modal to verify brand options
  await page.evaluate(() => {
    if (typeof openNew === 'function') openNew();
  });
  await sleep(1500);
  const orderModalInfo = await page.evaluate(() => {
    const sel = document.getElementById('order-label-owner-select');
    const options = sel ? Array.from(sel.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })) : [];
    return { options };
  });
  console.log('Order Label Owner Select Options:', orderModalInfo);
  await page.screenshot({ path: `${artDir}/e_code_orders_new_modal.png` });
  await page.evaluate(() => APP.closeModal('order-modal'));
  await sleep(500);

  // 6. Inventory Page Verification
  console.log('Step 6: Checking Inventory Page...');
  await page.goto('http://localhost:5174/pages/inventory.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  const inventoryInfo = await page.evaluate(() => {
    const ownerFilter = document.getElementById('label-owner-filter');
    const filterOptions = ownerFilter ? Array.from(ownerFilter.options).map(o => ({ value: o.value, text: o.text })) : [];
    const rows = Array.from(document.querySelectorAll('#inventory-table-body tr')).slice(0, 5);
    return {
      filterOptions,
      sampleRows: rows.map(r => r.innerText.replace(/\s+/g, ' ').trim())
    };
  });
  console.log('Inventory Info:', inventoryInfo);
  await page.screenshot({ path: `${artDir}/e_code_inventory_desktop.png`, fullPage: false });

  // 7. Mobile Viewport Responsive Testing (375x667)
  console.log('Step 7: Testing Mobile Viewport (375x667)...');
  await page.setViewport({ width: 375, height: 667, isMobile: true });

  // Dashboard mobile
  await page.goto('http://localhost:5174/pages/dashboard.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: `${artDir}/e_code_dashboard_mobile.png`, fullPage: false });

  // Companies mobile
  await page.goto('http://localhost:5174/pages/companies.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: `${artDir}/e_code_companies_mobile.png`, fullPage: false });

  // Warehouses mobile
  await page.goto('http://localhost:5174/pages/warehouses.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: `${artDir}/e_code_warehouses_mobile.png`, fullPage: false });

  // Warehouses modal mobile
  await page.evaluate(() => {
    if (typeof openWarehouseDetails === 'function') openWarehouseDetails(532, 'stock');
  });
  await sleep(1500);
  await page.screenshot({ path: `${artDir}/e_code_warehouse_gas_godown_mobile.png`, fullPage: false });
  await page.evaluate(() => APP.closeModal('warehouse-view-modal'));

  await browser.close();
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
