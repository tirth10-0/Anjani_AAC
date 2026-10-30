const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

async function runTests() {
  console.log('=== STARTING COMPREHENSIVE GLOBAL BOX CLEANUP VERIFICATION ===');
  const results = {
    testA_purchase: { passed: false, details: [] },
    testB_inventory: { passed: false, details: [] },
    testC_products: { passed: false, details: [] },
    testD_orders: { passed: false, details: [] },
    testE_dashboard: { passed: false, details: [] },
    testF_multipleUnits: { passed: false, details: [] },
    testG_dataIntegrity: { passed: false, details: [] },
    testH_persistedReload: { passed: false, details: [] }
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('favicon')) {
      console.warn('[Browser Error]', text);
    }
  });

  try {
    // 0. Authenticate
    console.log('\n[AUTH] Logging into ERP...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle2' });
    await page.evaluate(async () => {
      const { data, error } = await window.dbClient.auth.signInWithPassword({
        email: 'admin@anjani.test',
        password: 'Test@Agro2026!'
      });
      if (error) throw error;
      localStorage.setItem('admin_user', 'admin@anjani.test');
    });
    console.log('[AUTH] Logged in successfully.');

    // ─────────────────────────────────────────────────────────────
    // TEST A: PURCHASE PAGE
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST A: Purchases Page ---');
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    // 1. Check Purchases Table Items
    const purchaseRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#purchases-table tbody tr'));
      return rows.map(tr => {
        const pNo = tr.querySelector('.cell-bold')?.innerText.trim();
        const items = tr.querySelector('.cell-items-summary')?.innerText.trim();
        return { pNo, items };
      });
    });
    console.log('Purchases rows loaded:', purchaseRows.length);
    console.log('Sample purchase rows:', purchaseRows.slice(0, 4));

    const pTableHasDup = purchaseRows.some(r => /box\s+box/i.test(r.items));
    const pTableHasCleanBox = purchaseRows.some(r => /regular box \d+/i.test(r.items));

    results.testA_purchase.details.push({
      step: 'Purchase Table scan',
      count: purchaseRows.length,
      sample: purchaseRows.slice(0, 4),
      duplicateFound: pTableHasDup,
      cleanBoxFound: pTableHasCleanBox
    });

    // 2. Check purchasableItems array in memory
    const purchasable = await page.evaluate(() => {
      return (window.purchasableItems || []).map(p => ({ name: p.name, type: p.type, unit: p.unit }));
    });
    console.log('purchasableItems sample:', purchasable.slice(0, 5));
    const pItemsHasDup = purchasable.some(p => /box\s+box/i.test(p.name) || /box\s+box/i.test(p.unit));
    const pItemsHasCleanBox = purchasable.some(p => p.name.includes('Regular Box 250 Ml'));

    results.testA_purchase.details.push({
      step: 'Purchasable items list scan',
      count: purchasable.length,
      sample: purchasable.slice(0, 5),
      duplicateFound: pItemsHasDup,
      cleanBoxFound: pItemsHasCleanBox
    });

    // 3. Open New Purchase Modal and trigger suggestion portal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('New Purchase'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, ));

    // Focus input and test suggestion portal
    const inputValAfterSelect = await page.evaluate(() => {
      const input = document.querySelector('.item-search-input');
      if (!input) return null;
      input.value = 'Re';
      if (typeof onItemSearchInput === 'function') onItemSearchInput(0, input);
      const portalItems = Array.from(document.querySelectorAll('#purchases-suggestion-portal .suggestion-item'));
      const textList = portalItems.map(el => el.innerText.trim());
      // Select first item
      if (typeof selectItemSuggestion === 'function' && window.purchasableItems && window.purchasableItems.length > 0) {
        selectItemSuggestion(0, window.purchasableItems[0].name);
      }
      return { textList, finalValue: input.value };
    });
    console.log('Suggestion portal test:', inputValAfterSelect);

    const portalHasDup = inputValAfterSelect?.textList?.some(t => /box\s+box/i.test(t));
    const inputHasDup = /box\s+box/i.test(inputValAfterSelect?.finalValue || '');

    results.testA_purchase.details.push({
      step: 'Suggestion portal & input test',
      portalText: inputValAfterSelect?.textList,
      inputValue: inputValAfterSelect?.finalValue,
      portalHasDup,
      inputHasDup
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_purchases_modal.png') });
    results.testA_purchase.passed = !pTableHasDup && !pItemsHasDup && !portalHasDup && !inputHasDup && pTableHasCleanBox;
    console.log('Test A passed:', results.testA_purchase.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST B: INVENTORY PAGE
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST B: Inventory Page ---');
    await page.goto(`${BASE_URL}/pages/inventory.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    // Click 'Boxes' tab
    await page.evaluate(() => {
      const tab = document.querySelector('button[data-tab="Boxes"]');
      if (tab) tab.click();
    });
    await new Promise(r => setTimeout(r, ));

    const boxRows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#inventory-table tbody tr')).map(tr => {
        const name = tr.querySelector('td.cell-bold span')?.innerText.trim();
        const unit = tr.querySelectorAll('td')[3]?.innerText.trim();
        const stock = tr.querySelectorAll('td')[2]?.innerText.trim();
        return { name, unit, stock };
      });
    });
    console.log('Inventory Boxes rows count:', boxRows.length);
    console.log('Inventory Boxes sample:', boxRows.slice(0, 5));

    const invBoxesHasDup = boxRows.some(r => /box\s+box/i.test(r.name) || /box\s+box/i.test(r.unit));
    const invBoxesHasClean = boxRows.some(r => r.name.includes('Regular Box 250 Ml'));

    results.testB_inventory.details.push({
      step: 'Boxes tab rows scan',
      count: boxRows.length,
      sample: boxRows.slice(0, 5),
      duplicateFound: invBoxesHasDup,
      cleanFound: invBoxesHasClean
    });

    // Check all inventory items in window.allInventory
    const allInv = await page.evaluate(() => {
      return (window.allInventory || []).map(i => ({ name: i.name, unit: i.unit, cat: i.category }));
    });
    const allInvDup = allInv.some(i => /box\s+box/i.test(i.name) || /box\s+box/i.test(i.unit));

    results.testB_inventory.details.push({
      step: 'All inventory data scan',
      count: allInv.length,
      duplicateFound: allInvDup
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_inventory_boxes_tab.png') });
    results.testB_inventory.passed = !invBoxesHasDup && !allInvDup && invBoxesHasClean;
    console.log('Test B passed:', results.testB_inventory.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST C: PRODUCTS PAGE
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST C: Products & Packaging Page ---');
    await page.goto(`${BASE_URL}/pages/products.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const productsPageText = await page.evaluate(() => document.body.innerText);
    const prodDupFound = /box\s+box/i.test(productsPageText);

    results.testC_products.details.push({
      step: 'Products page text scan',
      duplicateFound: prodDupFound
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_products_page.png') });
    results.testC_products.passed = !prodDupFound;
    console.log('Test C passed:', results.testC_products.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST D: ORDERS & DISPATCH PAGE
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST D: Orders & Dispatch Page ---');
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const ordersData = await page.evaluate(() => {
      const boxes = (window.cachedBoxesList || []).map(b => b.name);
      const pageText = document.body.innerText;
      return { boxes, pageText };
    });
    console.log('Orders cachedBoxesList sample:', ordersData.boxes.slice(0, 5));

    const ordersBoxesDup = ordersData.boxes.some(b => /box\s+box/i.test(b));
    const ordersTextDup = /box\s+box/i.test(ordersData.pageText);

    results.testD_orders.details.push({
      step: 'Orders packaging box list scan',
      count: ordersData.boxes.length,
      sample: ordersData.boxes.slice(0, 5),
      duplicateFound: ordersBoxesDup,
      pageTextDuplicate: ordersTextDup
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_orders_page.png') });
    results.testD_orders.passed = !ordersBoxesDup && !ordersTextDup;
    console.log('Test D passed:', results.testD_orders.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST E: DASHBOARD
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST E: Dashboard Page ---');
    await page.goto(`${BASE_URL}/pages/dashboard.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const dashData = await page.evaluate(() => {
      const items = (window.dashboardInventoryData || []).filter(i => /box/i.test(i.name)).map(i => ({ name: i.name, unit: i.unit }));
      const pageText = document.body.innerText;
      return { items, pageText };
    });
    console.log('Dashboard box items sample:', dashData.items.slice(0, 5));

    const dashItemsDup = dashData.items.some(i => /box\s+box/i.test(i.name) || /box\s+box/i.test(i.unit));
    const dashTextDup = /box\s+box/i.test(dashData.pageText);

    results.testE_dashboard.details.push({
      step: 'Dashboard scan',
      sample: dashData.items.slice(0, 5),
      duplicateFound: dashItemsDup,
      pageTextDuplicate: dashTextDup
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_dashboard_page.png') });
    results.testE_dashboard.passed = !dashItemsDup && !dashTextDup;
    console.log('Test E passed:', results.testE_dashboard.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST F: MULTIPLE UNIT TYPES PRESERVED
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST F: Multiple Unit Types Preserved ---');
    const unitPreservationResults = await page.evaluate(() => {
      const cases = [
        { raw: '10 Box', expected: '10 Box' },
        { raw: '10 Boxes', expected: '10 Boxes' },
        { raw: 'Box', expected: 'Box' },
        { raw: '50 Bottle', expected: '50 Bottle' },
        { raw: '100 Bottles', expected: '100 Bottles' },
        { raw: '25 Kg', expected: '25 Kg' },
        { raw: '5 Litre', expected: '5 Litre' },
        { raw: '500 Ml', expected: '500 Ml' },
        { raw: '12 Nos', expected: '12 Nos' },
        { raw: 'Regular Box Box 250 Ml', expected: 'Regular Box 250 Ml' },
        { raw: '10 Box Box', expected: '10 Box' }
      ];
      return cases.map(c => {
        const cleanedName = UTILS.cleanItemName(c.raw);
        const cleanedUnit = UTILS.cleanUnitLabel(c.raw);
        return {
          raw: c.raw,
          expected: c.expected,
          cleanedName,
          cleanedUnit,
          preservedSingle: c.raw.includes('Box Box') ? (cleanedName === c.expected) : (cleanedName === c.raw || cleanedUnit === c.expected)
        };
      });
    });
    console.log('Unit preservation checks:', unitPreservationResults);

    const allPreserved = unitPreservationResults.every(c => c.preservedSingle);
    results.testF_multipleUnits.details.push(...unitPreservationResults);
    results.testF_multipleUnits.passed = allPreserved;
    console.log('Test F passed:', results.testF_multipleUnits.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST G: DATA INTEGRITY (NUMERICAL VALUES UNTOUCHED)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST G: Data Integrity ---');
    await page.goto(`${BASE_URL}/pages/inventory.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const stockMathIntegrity = await page.evaluate(() => {
      const allItems = window.allInventory || [];
      const boxItems = allItems.filter(i => (i.category === 'Boxes' || /box/i.test(i.name)));
      return boxItems.map(i => ({
        id: i.id,
        name: i.name,
        rawName: i.rawName,
        total_stock: i.total_stock,
        avg_cost: i.avg_cost,
        stockIsNumber: typeof i.total_stock === 'number' && !isNaN(i.total_stock),
        costIsNumber: typeof i.avg_cost === 'number' && !isNaN(i.avg_cost)
      }));
    });
    console.log('Stock math integrity sample:', stockMathIntegrity.slice(0, 5));

    const mathValid = stockMathIntegrity.every(i => i.stockIsNumber && i.costIsNumber);
    results.testG_dataIntegrity.details.push({
      itemCount: stockMathIntegrity.length,
      sample: stockMathIntegrity.slice(0, 5),
      mathValid
    });
    results.testG_dataIntegrity.passed = mathValid && stockMathIntegrity.length > 0;
    console.log('Test G passed:', results.testG_dataIntegrity.passed);

    // ─────────────────────────────────────────────────────────────
    // TEST H: PERSISTENCE ACROSS FULL RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- TEST H: Full Browser Reload Persistence ---');
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'networkidle2' });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const reloadedPurchasesText = await page.evaluate(() => document.body.innerText);
    const reloadedDupFound = /box\s+box/i.test(reloadedPurchasesText);
    results.testH_persistedReload.details.push({
      reloadedPage: 'purchases.html',
      duplicateFound: reloadedDupFound
    });

    await page.goto(`${BASE_URL}/pages/inventory.html`, { waitUntil: 'networkidle2' });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, ));

    const reloadedInventoryText = await page.evaluate(() => document.body.innerText);
    const reloadedInvDup = /box\s+box/i.test(reloadedInventoryText);
    results.testH_persistedReload.details.push({
      reloadedPage: 'inventory.html',
      duplicateFound: reloadedInvDup
    });

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_box_reloaded_verification.png') });
    results.testH_persistedReload.passed = !reloadedDupFound && !reloadedInvDup;
    console.log('Test H passed:', results.testH_persistedReload.passed);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await browser.close();
  }

  // Save results artifact
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'global_box_cleanup_test_results.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log('\n=== ALL TESTS FINISHED ===');
  console.log('Summary:', {
    testA_purchase: results.testA_purchase.passed,
    testB_inventory: results.testB_inventory.passed,
    testC_products: results.testC_products.passed,
    testD_orders: results.testD_orders.passed,
    testE_dashboard: results.testE_dashboard.passed,
    testF_multipleUnits: results.testF_multipleUnits.passed,
    testG_dataIntegrity: results.testG_dataIntegrity.passed,
    testH_persistedReload: results.testH_persistedReload.passed
  });
}

runTests();
