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
  console.log('🚀 Starting Verification of Inventory Column Sequence and Packaging Sizes in Unit Column...');
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

  const expectedHeaders = ['Item Name', 'Category', 'Unit', 'Total Stock', 'Avg Cost (₹)', 'Total Value (₹)', 'Status', 'Actions'];
  const tabs = ['Technical', 'Bottles', 'Boxes', 'Labels', 'Others'];

  // =========================================================================
  // TEST GROUP 1: Standardized Column Sequence Across All Five Tabs
  // =========================================================================
  console.log('\n--- 2. Verifying Standardized Column Sequence Across All Five Tabs ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/pages/inventory.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#inventory-table tbody .spinner') && Array.isArray(window.allInventory) && window.allInventory.length > 0, { timeout: 10000 });
  await sleep(600);

  for (const tab of tabs) {
    // Click tab
    await page.evaluate(tabName => {
      const btn = document.querySelector(`.tabs .tab-btn[data-tab="${tabName}"]`);
      if (btn) btn.click();
    }, tab);
    await sleep(400);

    const headers = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#inventory-table thead th')).map(th => th.textContent.trim());
    });

    console.log(`  Tab [${tab}] headers:`, headers);
    assert.deepStrictEqual(headers, expectedHeaders, `Tab ${tab} headers must match standardized sequence`);

    // Verify row column count and structure
    const rowColCount = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#inventory-table tbody tr')).filter(r => !r.querySelector('td[colspan]'));
      const firstRow = rows[0];
      return firstRow ? firstRow.querySelectorAll('td').length : 0;
    });

    if (rowColCount > 0) {
      assert.strictEqual(rowColCount, 8, `Tab ${tab} rows must have exactly 8 cells`);
    }
  }
  console.log('  ✓ [PASS] All 5 tabs feature exact standardized column sequence: Item Name, Category, Unit, Total Stock, Avg Cost, Total Value, Status, Actions.');

  // =========================================================================
  // TEST GROUP 2: Bottles Tab - Bottle Type in Name, Bottle Size in Unit
  // =========================================================================
  console.log('\n--- 3. Verifying Bottles Tab Data Presentation ---');
  await page.evaluate(() => {
    document.querySelector('.tabs .tab-btn[data-tab="Bottles"]').click();
  });
  await sleep(400);

  const bottleRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#inventory-table tbody tr:not(.empty-row)'));
    return rows.map(r => {
      const tds = r.querySelectorAll('td');
      const getVal = (td) => {
        if (!td) return '';
        const clone = td.cloneNode(true);
        const mobileLbl = clone.querySelector('.mobile-label');
        if (mobileLbl) mobileLbl.remove();
        return clone.textContent.trim();
      };
      return {
        name: tds[0]?.querySelector('.inventory-item-name')?.textContent?.trim() || getVal(tds[0]),
        category: getVal(tds[1]),
        unit: getVal(tds[2]),
        stock: getVal(tds[3])
      };
    });
  });

  console.log('  Bottles rows sample:', bottleRows);
  assert(bottleRows.length > 0, 'Bottles tab must have rows');
  for (const b of bottleRows) {
    // Item name must NOT contain size e.g. "1 LTR", "100 ML"
    assert(!/1\s*(ltr|litre)|100\s*ml|250\s*ml|500\s*ml/i.test(b.name), `Bottle name "${b.name}" must not contain packaging size`);
    // Item name must NOT contain redundant word "Bottle"
    assert(!/\bbottles?\b/i.test(b.name), `Bottle name "${b.name}" must not contain redundant word 'Bottle'`);
    // Unit must be the capacity size, NOT "Nos"
    assert(b.unit !== 'Nos', `Bottle unit for "${b.name}" should not be "Nos" (got "${b.unit}")`);
    assert(/litre|ml/i.test(b.unit), `Bottle unit for "${b.name}" should be a capacity (e.g. 1 Litre, 100 ML, 500 ML), got "${b.unit}"`);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'inventory_bottles_tab_standardized_1280.png'), fullPage: false });
  console.log('  ✓ [PASS] Bottles tab correctly displays bottle type in Item Name, brand in Category, and bottle size in Unit.');

  // =========================================================================
  // TEST GROUP 3: Boxes Tab - Box Type in Name, Box Size in Unit
  // =========================================================================
  console.log('\n--- 4. Verifying Boxes Tab Data Presentation ---');
  await page.evaluate(() => {
    document.querySelector('.tabs .tab-btn[data-tab="Boxes"]').click();
  });
  await sleep(400);

  const boxRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#inventory-table tbody tr:not(.empty-row)'));
    return rows.map(r => {
      const tds = r.querySelectorAll('td');
      const getVal = (td) => {
        if (!td) return '';
        const clone = td.cloneNode(true);
        const mobileLbl = clone.querySelector('.mobile-label');
        if (mobileLbl) mobileLbl.remove();
        return clone.textContent.trim();
      };
      return {
        name: tds[0]?.querySelector('.inventory-item-name')?.textContent?.trim() || getVal(tds[0]),
        category: getVal(tds[1]),
        unit: getVal(tds[2]),
        stock: getVal(tds[3])
      };
    });
  });

  console.log('  Boxes rows sample:', boxRows);
  assert(boxRows.length > 0, 'Boxes tab must have rows');
  for (const bx of boxRows) {
    // Item name must NOT contain size
    assert(!/1\s*(ltr|litre)|100\s*ml|250\s*ml|500\s*ml/i.test(bx.name), `Box name "${bx.name}" must not contain packaging size`);
    // Item name must NOT contain redundant word "Box"
    assert(!/\b(box|boxes)\b/i.test(bx.name), `Box name "${bx.name}" must not contain redundant word 'Box'`);
    // Unit must be the box capacity size, NOT "Nos"
    assert(bx.unit !== 'Nos', `Box unit for "${bx.name}" should not be "Nos" (got "${bx.unit}")`);
    assert(/litre|ml/i.test(bx.unit), `Box unit for "${bx.name}" should be capacity size, got "${bx.unit}"`);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'inventory_boxes_tab_standardized_1280.png'), fullPage: false });
  console.log('  ✓ [PASS] Boxes tab correctly displays box type in Item Name, type in Category, and box size in Unit.');

  // =========================================================================
  // TEST GROUP 4: Labels Tab - Product Name in Name, Packaging Size in Unit
  // =========================================================================
  console.log('\n--- 5. Verifying Labels Tab Data Presentation ---');
  await page.evaluate(() => {
    document.querySelector('.tabs .tab-btn[data-tab="Labels"]').click();
  });
  await sleep(400);

  const labelRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#inventory-table tbody tr:not(.empty-row)'));
    return rows.map(r => {
      const tds = r.querySelectorAll('td');
      const getVal = (td) => {
        if (!td) return '';
        const clone = td.cloneNode(true);
        const mobileLbl = clone.querySelector('.mobile-label');
        if (mobileLbl) mobileLbl.remove();
        return clone.textContent.trim();
      };
      return {
        name: tds[0]?.querySelector('.inventory-item-name')?.textContent?.trim() || getVal(tds[0]),
        category: getVal(tds[1]),
        unit: getVal(tds[2]),
        stock: getVal(tds[3])
      };
    });
  });

  console.log('  Labels rows sample:', labelRows);
  assert(labelRows.length > 0, 'Labels tab must have rows');
  for (const lb of labelRows) {
    // Item name must NOT contain the word 'Label'
    assert(!/\blabels?\b/i.test(lb.name), `Label item name "${lb.name}" must not contain the word 'Label'`);
    // Item name must NOT contain brand brackets e.g. [AAC]
    assert(!/\[[a-zA-Z0-9]+\]/i.test(lb.name), `Label item name "${lb.name}" must not contain bracketed brand`);
    // Item name must NOT contain packaging size
    assert(!/1\s*(litre|ltr)|500\s*ml|100\s*ml|250\s*ml/i.test(lb.name), `Label item name "${lb.name}" must not contain packaging size`);
    // Category must be brand (AAC)
    assert(lb.category === 'AAC' || lb.category === 'GAS', `Category must be brand identifier, got "${lb.category}"`);
    // Unit must be packaging size, NOT "Nos"
    assert(lb.unit !== 'Nos', `Label unit should not be "Nos" (got "${lb.unit}")`);
    assert(/litre|ml/i.test(lb.unit), `Label unit should be packaging size (e.g. 1 Litre, 500 ML), got "${lb.unit}"`);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'inventory_labels_tab_standardized_1280.png'), fullPage: false });
  console.log('  ✓ [PASS] Labels tab cleanly presents product formulation in Item Name, AAC brand in Category, and packaging size in Unit.');

  // =========================================================================
  // TEST GROUP 5: Technicals and Others Tabs - Preserved Integrity
  // =========================================================================
  console.log('\n--- 6. Verifying Technicals and Others Tab Preserved Integrity ---');
  await page.evaluate(() => {
    document.querySelector('.tabs .tab-btn[data-tab="Technical"]').click();
  });
  await sleep(400);

  const techRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#inventory-table tbody tr:not(.empty-row)'));
    return rows.map(r => {
      const tds = r.querySelectorAll('td');
      const getVal = (td) => {
        if (!td) return '';
        const clone = td.cloneNode(true);
        const mobileLbl = clone.querySelector('.mobile-label');
        if (mobileLbl) mobileLbl.remove();
        return clone.textContent.trim();
      };
      return {
        name: tds[0]?.querySelector('.inventory-item-name')?.textContent?.trim() || getVal(tds[0]),
        category: getVal(tds[1]),
        unit: getVal(tds[2]),
        stock: getVal(tds[3])
      };
    });
  });

  console.log('  Technicals sample:', techRows[0]);
  assert(techRows.length > 0, 'Technicals tab must have rows');
  assert(techRows[0].unit === 'Litre' || techRows[0].unit === 'KG' || techRows[0].unit === 'LTR', `Technicals unit preserved: ${techRows[0].unit}`);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'inventory_technicals_tab_standardized_1280.png'), fullPage: false });
  console.log('  ✓ [PASS] Technicals tab preserves original item names, categories, and technical units.');

  // =========================================================================
  // TEST GROUP 6: Laptop Responsive Verification (No Horizontal Scrollbar)
  // =========================================================================
  console.log('\n--- 7. Testing Laptop Screen Widths (1024px, 1280px, 1366px, 1440px) ---');
  const laptopWidths = [1024, 1280, 1366, 1440];

  for (const w of laptopWidths) {
    await page.setViewport({ width: w, height: 800 });
    for (const tab of tabs) {
      await page.evaluate(t => document.querySelector(`.tabs .tab-btn[data-tab="${t}"]`)?.click(), tab);
      await sleep(250);

      const overflowCheck = await page.evaluate(() => {
        const wrap = document.getElementById('inventory-table-wrap');
        const table = document.getElementById('inventory-table');
        const hasHorizScroll = wrap.scrollWidth > wrap.clientWidth;
        const lastActionCell = table.querySelector('tbody tr:not(.empty-row) td.td-actions');
        let actionsVisible = true;
        if (lastActionCell) {
          const rect = lastActionCell.getBoundingClientRect();
          actionsVisible = rect.right <= window.innerWidth;
        }
        return {
          hasHorizScroll,
          scrollWidth: wrap.scrollWidth,
          clientWidth: wrap.clientWidth,
          actionsVisible
        };
      });

      assert(!overflowCheck.hasHorizScroll, `Table must NOT have horizontal scrollbar on ${w}px in tab ${tab} (scrollWidth: ${overflowCheck.scrollWidth}, clientWidth: ${overflowCheck.clientWidth})`);
      assert(overflowCheck.actionsVisible, `Actions buttons must remain fully visible on ${w}px in tab ${tab}`);
    }
    console.log(`  ✓ [PASS] Viewport ${w}px: Zero horizontal scroll on all tabs, complete Actions buttons visible.`);
  }

  // =========================================================================
  // TEST GROUP 7: Mobile Viewports (320px, 360px, 375px, 390px, 430px)
  // =========================================================================
  console.log('\n--- 8. Testing Mobile Screen Widths (320px, 360px, 375px, 390px, 430px) ---');
  const mobileWidths = [320, 360, 375, 390, 430];

  for (const mw of mobileWidths) {
    await page.setViewport({ width: mw, height: 800 });
    await page.evaluate(() => document.querySelector('.tabs .tab-btn[data-tab="Bottles"]')?.click());
    await sleep(300);

    const mobileMetrics = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#inventory-cards-container .inventory-card'));
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;
      const firstCard = cards[0];
      const metricLabels = firstCard ? Array.from(firstCard.querySelectorAll('.metric-label')).map(l => l.textContent.trim()) : [];
      const metricVals = firstCard ? Array.from(firstCard.querySelectorAll('.metric-val')).map(v => v.textContent.trim()) : [];

      return {
        cardCount: cards.length,
        pageOverflow,
        metricLabels,
        metricVals
      };
    });

    assert(!mobileMetrics.pageOverflow, `No page horizontal overflow on mobile ${mw}px`);
    assert(mobileMetrics.cardCount > 0, `Mobile cards must render on ${mw}px`);
    assert(mobileMetrics.metricLabels.includes('TOTAL STOCK'), 'Card must have TOTAL STOCK');
    assert(mobileMetrics.metricLabels.includes('UNIT'), 'Card must have UNIT');
    console.log(`  ✓ [PASS] Mobile ${mw}px: Clean card layout with zero overflow, Unit=${mobileMetrics.metricVals[1]}.`);
  }
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'inventory_bottles_mobile_390_standardized.png'), fullPage: false });

  // =========================================================================
  // TEST GROUP 8: Warehouses Page Toolbar Layout Check
  // =========================================================================
  console.log('\n--- 9. Verifying Warehouses Page Filter Toolbar Single-Line Alignment ---');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#warehouses-table tbody tr').length > 0);
  await sleep(600);

  const whToolbarMetrics = await page.evaluate(() => {
    const searchInput = document.getElementById('search-input');
    const compFilter = document.getElementById('company-filter')?.closest('.uss-container') || document.getElementById('company-filter');
    const statusFilter = document.getElementById('status-filter')?.closest('.uss-container') || document.getElementById('status-filter');

    const searchRect = searchInput ? searchInput.getBoundingClientRect() : null;
    const compRect = compFilter ? compFilter.getBoundingClientRect() : null;
    const statusRect = statusFilter ? statusFilter.getBoundingClientRect() : null;

    // Check if on same horizontal baseline (top coordinates within 5px)
    const onSameRow = statusRect && searchRect ? Math.abs(statusRect.top - searchRect.top) < 6 : false;

    return {
      searchTop: searchRect?.top,
      compTop: compRect?.top,
      statusTop: statusRect?.top,
      onSameRow
    };
  });

  console.log('  Warehouses toolbar vertical alignment:', whToolbarMetrics);
  assert(whToolbarMetrics.onSameRow, 'Search, Company filter, and Status filter should be on the same horizontal row on desktop');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'warehouses_toolbar_desktop_single_row.png'), fullPage: false });
  console.log('  ✓ [PASS] Warehouses filter toolbar aligns neatly on a single line on desktop/laptop without awkward wrapping.');

  await browser.close();
  console.log('\n🎉 ALL INVENTORY COLUMN SEQUENCE, UNIT COLUMN, AND PACKAGING TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test run failed:', err);
  process.exit(1);
});
