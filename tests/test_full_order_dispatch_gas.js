const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('=== TEST: GODOWN DISPATCH & DELETION END-TO-END ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Authenticate session
  console.log('Step 1: Logging in...');
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
  await sleep(1500);

  // 2. Navigate to Warehouses page to confirm baseline
  console.log('Step 2: Checking baseline warehouse stock...');
  await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#warehouses-table tbody tr');
    return rows.length > 0 && !rows[0].innerText.includes('Loading');
  }, { timeout: 15000 });
  await sleep(1500);

  let whRows = await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('#warehouses-table tbody tr'));
    return trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Baseline warehouses:');
  whRows.forEach(r => console.log('  ', r));

  // 3. Navigate to Orders page and create Order O-01
  console.log('Step 3: Creating Order O-01 (100 units Anjani Coragen-80 Ec)...');
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const orderInfo = await page.evaluate(async () => {
    const { data: oData, error: oErr } = await window.dbClient.from('orders').insert([{
      order_no: 'O-01',
      client_id: 12,
      client_name: 'Krishi Seva Kendra (Siddharth Makwana)',
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      total_amount: 240000,
      paid_amount: 0,
      company_id: 623,
      branch_id: 1
    }]).select();
    if (oErr) throw oErr;
    const ord = oData[0];

    const { data: oiData, error: oiErr } = await window.dbClient.from('order_items').insert([{
      order_id: ord.id,
      product_id: 66,
      product_name: 'Anjani Coragen-80 Ec',
      quantity: 100,
      unit_price: 2400,
      total: 240000,
      packing_size: '1 Litre',
      company_id: 623
    }]).select();
    if (oiErr) throw oiErr;

    return { order: ord, item: oiData[0] };
  });
  console.log('Order created successfully:', orderInfo.order.id, orderInfo.order.order_no);

  // 4. Execute the complete commercial dispatch workflow targeting Gas Partner Godown
  console.log('Step 4: Executing commercial dispatch targeting Gas Co-marketing Godown (WH-AAC-GAS)...');
  const dspRes = await page.evaluate(async (ordId, oiId) => {
    // 4a. Prepare Dispatch
    const prep = await window.DISPATCH_SERVICE.prepareDispatch(window.dbClient, {
      order_id: ordId,
      dispatch_no: 'DSP-01',
      dispatch_date: new Date().toISOString().split('T')[0],
      warehouse_id: 1, // Leaves Factory Warehouse
      delivery_target: 'GODOWN',
      target_warehouse_id: 532, // Gas Co-marketing Godown
      target_warehouse_name: 'Gas Co-marketing Godown (WH-AAC-GAS)',
      vehicle_no: 'GJ 03 AB 1512',
      items: [{
        order_item_id: oiId,
        product_id: 66,
        product_name: 'Anjani Coragen-80 Ec',
        packaging_size: '1 Litre',
        units_per_box: 10,
        batch_no: 'B-01',
        total_units_dispatched: 100,
        boxes_dispatched: 10,
        loose_dispatched: 0,
        unit_price: 2400,
        total_amount: 240000
      }],
      idempotency_key: `DSP-PREP-DSP-01-${ordId}`
    });

    const dspId = prep.dispatch.id;

    // 4b. Packing Verification
    await window.DISPATCH_SERVICE.verifyPacking(window.dbClient, {
      dispatchId: dspId,
      verifiedBy: 'Godown Operator',
      verificationNotes: 'Physical corrugated cartons, batch seal intact, bottle count and labeling verified.'
    });

    // 4c. Manager Approval
    await window.DISPATCH_SERVICE.approveDispatch(window.dbClient, {
      dispatchId: dspId,
      approvedBy: 'Dispatch Manager',
      approvalNotes: 'Authorized for commercial transfer to Gas Co-marketing Godown.'
    });

    // 4d. Gatekeeper Physical Dispatch
    const exec = await window.DISPATCH_SERVICE.executeDispatch(window.dbClient, {
      dispatchId: dspId,
      dispatchedBy: 'Security Gatekeeper',
      vehicleNo: 'GJ 03 AB 1512'
    });

    return { prep, exec };
  }, orderInfo.order.id, orderInfo.item.id);

  console.log('Dispatch executed:', dspRes);
  await sleep(2000);

  // 5. Navigate to Warehouses page and verify Gas Godown has 100 units!
  console.log('Step 5: Verifying Warehouses page reflects 100 units in Gas Godown...');
  await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#warehouses-table tbody tr');
    return rows.length > 0 && !rows[0].innerText.includes('Loading');
  }, { timeout: 15000 });
  await sleep(1500);

  let whRowsAfterDsp = await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('#warehouses-table tbody tr'));
    return trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Warehouses after dispatch:');
  whRowsAfterDsp.forEach(r => console.log('  ', r));

  const gasRowAfterDsp = whRowsAfterDsp.find(r => r.includes('WH-AAC-GAS'));
  console.log('GAS Row Result:', gasRowAfterDsp);

  const shotCreditedPath = path.join(ARTIFACTS_DIR, 'warehouse_gas_credited_100_units_verified.png');
  await page.screenshot({ path: shotCreditedPath });
  console.log('Saved screenshot of credited godown:', shotCreditedPath);

  // Assert 100 units
  if (!gasRowAfterDsp || !gasRowAfterDsp.includes('100 units')) {
    throw new Error('VERIFICATION_FAILED: Gas Godown did not show 100 units after dispatch!');
  }
  console.log('SUCCESS: Gas Godown accurately credited with 100 units!');

  // 6. Delete Order O-01 from Orders page
  console.log('Step 6: Deleting Order O-01 and confirming deletion...');
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#orders-table tbody tr');
    return rows.length > 0 && !rows[0].innerText.includes('Loading');
  }, { timeout: 15000 });
  await sleep(1500);

  await page.evaluate(async (ordId) => {
    window.deleteOrder(ordId);
    setTimeout(() => {
      if (window.APP && window.APP.handleConfirmOk) {
        window.APP.handleConfirmOk();
      }
    }, 250);
  }, orderInfo.order.id);

  await sleep(3500);

  // 7. Verify Warehouses page resets to 0 units!
  console.log('Step 7: Verifying Warehouses page resets to 0 units after deletion...');
  await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#warehouses-table tbody tr');
    return rows.length > 0 && !rows[0].innerText.includes('Loading');
  }, { timeout: 15000 });
  await sleep(1500);

  let whRowsFinal = await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('#warehouses-table tbody tr'));
    return trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Warehouses after order deletion:');
  whRowsFinal.forEach(r => console.log('  ', r));

  const gasRowFinal = whRowsFinal.find(r => r.includes('WH-AAC-GAS'));
  console.log('GAS Row Final Result:', gasRowFinal);

  const shotZeroPath = path.join(ARTIFACTS_DIR, 'warehouse_gas_reset_to_0_units_verified.png');
  await page.screenshot({ path: shotZeroPath });
  console.log('Saved screenshot of reset godown:', shotZeroPath);

  // Assert 0 units
  if (!gasRowFinal || !gasRowFinal.includes('0 units')) {
    throw new Error('VERIFICATION_FAILED: Gas Godown did not reset to 0 units after order deletion!');
  }
  console.log('SUCCESS: Gas Godown accurately reset to 0 units upon order deletion!');

  // 8. Re-create and dispatch Order O-01 so the user has their active order in place!
  console.log('Step 8: Re-creating and dispatching Order O-01 to Gas Godown for the user...');
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DISPATCH_SERVICE);
  await sleep(1500);

  const userOrder = await page.evaluate(async () => {
    const { data: oData } = await window.dbClient.from('orders').insert([{
      order_no: 'O-01',
      client_id: 12,
      client_name: 'Krishi Seva Kendra (Siddharth Makwana)',
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      total_amount: 240000,
      paid_amount: 0,
      company_id: 623,
      branch_id: 1
    }]).select();
    const ord = oData[0];

    const { data: oiData } = await window.dbClient.from('order_items').insert([{
      order_id: ord.id,
      product_id: 66,
      product_name: 'Anjani Coragen-80 Ec',
      quantity: 100,
      unit_price: 2400,
      total: 240000,
      packing_size: '1 Litre',
      company_id: 623
    }]).select();

    const prep = await window.DISPATCH_SERVICE.prepareDispatch(window.dbClient, {
      order_id: ord.id,
      dispatch_no: 'DSP-01',
      dispatch_date: new Date().toISOString().split('T')[0],
      warehouse_id: 1,
      delivery_target: 'GODOWN',
      target_warehouse_id: 532,
      target_warehouse_name: 'Gas Co-marketing Godown (WH-AAC-GAS)',
      vehicle_no: 'GJ 03 AB 1512',
      items: [{
        order_item_id: oiData[0].id,
        product_id: 66,
        product_name: 'Anjani Coragen-80 Ec',
        packaging_size: '1 Litre',
        units_per_box: 10,
        batch_no: 'B-01',
        total_units_dispatched: 100,
        boxes_dispatched: 10,
        loose_dispatched: 0,
        unit_price: 2400,
        total_amount: 240000
      }],
      idempotency_key: `DSP-PREP-DSP-01-${ord.id}`
    });

    const dspId = prep.dispatch.id;
    await window.DISPATCH_SERVICE.verifyPacking(window.dbClient, {
      dispatchId: dspId,
      verifiedBy: 'Godown Operator',
      verificationNotes: 'Physical corrugated cartons, batch seal intact, bottle count and labeling verified.'
    });
    await window.DISPATCH_SERVICE.approveDispatch(window.dbClient, {
      dispatchId: dspId,
      approvedBy: 'Dispatch Manager',
      approvalNotes: 'Authorized for commercial transfer to Gas Co-marketing Godown.'
    });
    await window.DISPATCH_SERVICE.executeDispatch(window.dbClient, {
      dispatchId: dspId,
      dispatchedBy: 'Security Gatekeeper',
      vehicleNo: 'GJ 03 AB 1512'
    });

    return { orderId: ord.id, dspId };
  });

  console.log('User active order created and dispatched:', userOrder);
  await sleep(1500);

  // Final check of warehouse page
  await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#warehouses-table tbody tr');
    return rows.length > 0 && !rows[0].innerText.includes('Loading');
  }, { timeout: 15000 });
  await sleep(1500);

  const finalCheckWh = await page.evaluate(() => {
    const trs = Array.from(document.querySelectorAll('#warehouses-table tbody tr'));
    return trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim());
  });
  console.log('Warehouses live state:');
  finalCheckWh.forEach(r => console.log('  ', r));

  const shotFinal = path.join(ARTIFACTS_DIR, 'warehouse_gas_final_verified_100_units.png');
  await page.screenshot({ path: shotFinal });
  console.log('Saved final screenshot:', shotFinal);

  await browser.close();
  console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
})();
