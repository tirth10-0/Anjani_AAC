const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('>>> Testing Intercompany Transfer Full Lifecycle: Create -> Approve -> Dispatch -> Receive...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Authenticate session
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

  // Navigate to Intercompany page
  await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  // Step 1: Create a Transfer
  console.log('Step 1: Creating a test stock transfer...');
  const createResult = await page.evaluate(async () => {
    const slipNo = `ICT-TEST-${Date.now().toString().slice(-4)}`;
    const res = await window.INTERCOMPANY_SERVICE.createTransfer(window.dbClient, {
      transfer_no: slipNo,
      supply_type: 'STANDARD_SALE',
      from_company_id: 623,
      from_warehouse_id: 524,
      to_company_id: 625,
      to_warehouse_id: 527,
      pricing_terms: 'Transfer Price',
      dispatch_date: new Date().toISOString().split('T')[0],
      vehicle_no: 'GJ-04-TEST-999',
      transporter_name: 'Shreeji Logistics',
      eway_bill_no: 'EWB-2026-TEST-999',
      notes: 'End-to-end lifecycle verification transfer',
      items: [{
        product_id: 66,
        product_name: 'Anjani Coragen-80 Ec',
        source_stock_batch_id: 86,
        source_batch_no: 'P-01',
        quantity: 50,
        units_per_box: 10,
        unit_price: 2400
      }],
      idempotency_key: `ICT-CREATE-${slipNo}`
    });
    await loadTransfers();
    return { success: res.success, id: res.transfer.id, slipNo: res.transfer.transfer_no };
  });

  console.log('Create result:', createResult);
  assert(createResult.success, 'Transfer should be created successfully');
  console.log(`✓ Transfer #${createResult.slipNo} created (ID: ${createResult.id})`);

  // Step 2: Approve the transfer
  console.log('\nStep 2: Approving draft transfer...');
  const approveResult = await page.evaluate(async (transferId) => {
    await window.INTERCOMPANY_SERVICE.approveTransfer(window.dbClient, {
      transferId: transferId,
      approvedBy: 'Supply Chain Operations Head',
      userCompanyId: getUserCompanyId()
    });
    await loadTransfers();
    const updated = allTransfers.find(x => x.id === transferId);
    return { id: transferId, newStatus: updated ? updated.status : null };
  }, createResult.id);

  console.log('Approve result:', approveResult);
  assert.strictEqual(approveResult.newStatus, 'Approved', 'Transfer status should be Approved');
  console.log(`✓ Transfer #${createResult.slipNo} successfully approved!`);

  // Step 3: Dispatch the approved transfer
  console.log('\nStep 3: Dispatching approved transfer (In-Transit Posting & Source Stock Deduction)...');
  const dispatchResult = await page.evaluate(async (transferId) => {
    const res = await window.INTERCOMPANY_SERVICE.dispatchTransfer(window.dbClient, {
      transferId: transferId,
      dispatchedBy: 'Plant Gate Logistics Officer',
      vehicleNo: 'GJ-04-TEST-999',
      transporterName: 'Shreeji Logistics',
      ewayBillNo: 'EWB-2026-TEST-999',
      userCompanyId: getUserCompanyId()
    });
    await loadTransfers();
    const updated = allTransfers.find(x => x.id === transferId);
    return {
      res,
      newStatus: updated ? updated.status : null,
      sourceDeducted: updated ? updated.source_stock_deducted : false,
      invoiceNo: updated ? updated.source_invoice_no : null
    };
  }, createResult.id);

  console.log('Dispatch result:', dispatchResult);
  assert.strictEqual(dispatchResult.newStatus, 'In Transit', 'Transfer status should be In Transit');
  assert.strictEqual(dispatchResult.sourceDeducted, true, 'Source stock should be marked as deducted');
  console.log(`✓ Transfer #${createResult.slipNo} dispatched in transit (Source stock deducted, invoice: ${dispatchResult.invoiceNo})!`);

  // Step 4: Receive goods at destination warehouse
  console.log('\nStep 4: Receiving goods at destination warehouse (Destination Stock Crediting)...');
  const receiveResult = await page.evaluate(async (transferId) => {
    const items = await window.INTERCOMPANY_SERVICE._safeSelectMany(window.dbClient, 'intercompany_transfer_items', 'transfer_id', transferId);
    const itemReceipts = (items || []).map(it => ({
      item_id: it.id,
      received_units: it.dispatched_units,
      damaged_units: 0,
      shortage_units: 0,
      rejected_units: 0,
      returned_units: 0
    }));

    const res = await window.INTERCOMPANY_SERVICE.receiveTransfer(window.dbClient, {
      transferId: transferId,
      receivedBy: 'Depot Warehouse Inward Manager',
      itemReceipts: itemReceipts,
      userCompanyId: getUserCompanyId()
    });
    await loadTransfers();
    const updated = allTransfers.find(x => x.id === transferId);
    return {
      res,
      newStatus: updated ? updated.status : null,
      destinationCredited: updated ? updated.destination_stock_credited : false,
      purchaseNo: updated ? updated.destination_purchase_no : null
    };
  }, createResult.id);

  console.log('Receive result:', receiveResult);
  assert.strictEqual(receiveResult.newStatus, 'Received', 'Transfer status should be Received');
  assert.strictEqual(receiveResult.destinationCredited, true, 'Destination stock should be marked as credited');
  console.log(`✓ Transfer #${createResult.slipNo} fully received (Destination stock credited, inward purchase: ${receiveResult.purchaseNo})!`);

  console.log('\n====================================================================');
  console.log('>>> COMPLETE END-TO-END STOCK TRANSFER LIFECYCLE VERIFIED 100%! <<<');
  console.log('====================================================================');
  await browser.close();
})();
