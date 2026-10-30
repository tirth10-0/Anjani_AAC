const puppeteer = require('puppeteer-core');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artDir = 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTest() {
  console.log('--- Starting Warehouse Stock & Movements Verification ---');
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
    localStorage.setItem('active_company_code', 'E');
  });
  await sleep(1500);

  // 2. Open warehouses page
  console.log('Step 2: Loading warehouses page...');
  await page.goto('http://localhost:5174/pages/warehouses.html', { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => typeof window.viewWarehouseDetails === 'function');
  await sleep(1000);

  // Open Gas Godown (warehouse 532)
  console.log('Step 3: Opening Gas Godown (ID 532)...');
  await page.evaluate(() => {
    window.viewWarehouseDetails(532);
  });
  await page.waitForSelector('.wh-stock-table, .empty-state', { timeout: 10000 });
  await sleep(1500);

  // --- TEST TAB 1: Stock Batches Desktop ---
  console.log('\n--- VERIFYING STOCK BATCHES TAB (Gas Godown Desktop) ---');
  const stockTabData = await page.evaluate(() => {
    const table = document.querySelector('.wh-stock-table');
    if (!table) return { error: 'No wh-stock-table found' };
    const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim().replace(/\s+/g, ' '));
      return tds;
    });
    const batchPillCount = table.querySelectorAll('.wh-batch-pill').length;
    const hasBatchHeader = ths.some(h => /batch/i.test(h));
    return { ths, rowCount: rows.length, firstRow: rows[0], batchPillCount, hasBatchHeader };
  });
  console.log('Stock Batches headers:', stockTabData.ths);
  console.log('Has Batch No header:', stockTabData.hasBatchHeader);
  console.log('Stock Batches row count:', stockTabData.rowCount);
  console.log('Stock Batches first row:', stockTabData.firstRow);
  console.log('Stock Batches batch pill count:', stockTabData.batchPillCount);

  // Take screenshot of Stock Batches desktop
  await page.screenshot({ path: `${artDir}/gas_godown_stock_batches_desktop.png` });

  // --- TEST TAB 2: Stock Movements Desktop ---
  console.log('\n--- VERIFYING STOCK MOVEMENTS TAB (Gas Godown Desktop) ---');
  await page.evaluate(() => {
    document.getElementById('wh-tab-movements-btn')?.click();
  });
  await sleep(1500);

  const movTabData = await page.evaluate(() => {
    const table = document.querySelector('.wh-movements-table');
    if (!table) return { error: 'No wh-movements-table found' };
    const ths = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim().replace(/\s+/g, ' '));
      return {
        date: tds[0],
        item: tds[1],
        type: tds[2],
        qty: tds[3],
        notes: tds[4]
      };
    });
    const genericItemCount = rows.filter(r => r.item.includes('Inventory Item')).length;
    const batchMentionCount = table.querySelectorAll('.wh-movements-table td div[style*="font-family:monospace"]').length;
    return { ths, rowCount: rows.length, sampleRows: rows.slice(0, 5), genericItemCount, batchMentionCount };
  });
  console.log('Movements headers:', movTabData.ths);
  console.log('Movements total rows:', movTabData.rowCount);
  console.log('Generic "Inventory Item" count:', movTabData.genericItemCount);
  console.log('Batch No mentions in table:', movTabData.batchMentionCount);
  console.log('Sample movements:');
  console.table(movTabData.sampleRows);

  // Take screenshot of Stock Movements desktop
  await page.screenshot({ path: `${artDir}/gas_godown_stock_movements_desktop.png` });

  // --- TEST MOBILE VIEWPORTS ---
  console.log('\n--- VERIFYING MOBILE VIEWPORTS ---');
  const mobileWidths = [320, 375, 430];

  for (const w of mobileWidths) {
    await page.setViewport({ width: w, height: 800 });
    await sleep(800);

    // Verify Movements tab mobile cards
    const movCardsData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.wh-mobile-movement-card'));
      const batchMentions = cards.filter(c => c.textContent.includes('Batch:')).length;
      const genericItems = cards.filter(c => c.querySelector('.wh-card-item-title')?.textContent.includes('Inventory Item')).length;
      const items = cards.map(c => c.querySelector('.wh-card-item-title')?.textContent.trim());
      return { count: cards.length, batchMentions, genericItems, firstItem: items[0] };
    });
    console.log(`[Mobile ${w}px Movements] Cards: ${movCardsData.count}, batchMentions: ${movCardsData.batchMentions}, genericItems: ${movCardsData.genericItems}, firstItem: "${movCardsData.firstItem}"`);

    await page.screenshot({ path: `${artDir}/gas_godown_movements_mobile_${w}.png` });

    // Switch to Stock tab on mobile
    await page.evaluate(() => {
      document.getElementById('wh-tab-stock-btn')?.click();
    });
    await sleep(800);

    const stockCardsData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.wh-mobile-stock-card'));
      const batchPills = cards.filter(c => c.textContent.includes('Batch:')).length;
      const items = cards.map(c => c.querySelector('.wh-card-item-title')?.textContent.trim());
      return { count: cards.length, batchPills, firstItem: items[0] };
    });
    console.log(`[Mobile ${w}px Stock] Cards: ${stockCardsData.count}, batchPills: ${stockCardsData.batchPills}, firstItem: "${stockCardsData.firstItem}"`);

    await page.screenshot({ path: `${artDir}/gas_godown_stock_mobile_${w}.png` });

    // Switch back to movements tab for next loop
    await page.evaluate(() => {
      document.getElementById('wh-tab-movements-btn')?.click();
    });
  }

  // --- TEST MAIN PLANT WAREHOUSE (ID 1) ---
  console.log('\n--- VERIFYING MAIN PLANT WAREHOUSE (ID 1) ---');
  await page.setViewport({ width: 1366, height: 768 });
  await page.evaluate(() => {
    window.viewWarehouseDetails(1);
  });
  await sleep(2000);

  const mainPlantData = await page.evaluate(() => {
    const table = document.querySelector('.wh-stock-table');
    const ths = Array.from(table?.querySelectorAll('thead th') || []).map(th => th.textContent.trim());
    const rowCount = table?.querySelectorAll('tbody tr').length || 0;
    const batchPillCount = table?.querySelectorAll('.wh-batch-pill').length || 0;
    return { ths, rowCount, batchPillCount };
  });
  console.log('Main Plant Stock Batches headers:', mainPlantData.ths, 'rows:', mainPlantData.rowCount, 'batchPills:', mainPlantData.batchPillCount);
  await page.screenshot({ path: `${artDir}/main_plant_stock_batches_desktop.png` });

  // Switch to Movements on Main Plant
  await page.evaluate(() => {
    document.getElementById('wh-tab-movements-btn')?.click();
  });
  await sleep(1500);

  const mainPlantMovData = await page.evaluate(() => {
    const table = document.querySelector('.wh-movements-table');
    const ths = Array.from(table?.querySelectorAll('thead th') || []).map(th => th.textContent.trim());
    const rows = Array.from(table?.querySelectorAll('tbody tr') || []).map(tr => {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
      return { item: tds[1], type: tds[2], qty: tds[3] };
    });
    const genericCount = rows.filter(r => r.item?.includes('Inventory Item')).length;
    return { ths, rowCount: rows.length, genericCount, sample: rows.slice(0, 5) };
  });
  console.log('Main Plant Movements headers:', mainPlantMovData.ths);
  console.log('Main Plant Movements rows:', mainPlantMovData.rowCount, 'genericCount:', mainPlantMovData.genericCount);
  console.log('Main Plant Movements sample:');
  console.table(mainPlantMovData.sample);
  await page.screenshot({ path: `${artDir}/main_plant_movements_desktop.png` });

  await browser.close();
  console.log('\n>>> All Tests Completed Successfully! <<<');
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
