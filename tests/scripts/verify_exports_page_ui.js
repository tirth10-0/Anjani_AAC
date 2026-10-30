const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

const VIEWPORTS = [
  { width: 320, height: 600, name: 'mobile_320' },
  { width: 360, height: 640, name: 'mobile_360' },
  { width: 375, height: 667, name: 'mobile_375' },
  { width: 390, height: 844, name: 'mobile_390' },
  { width: 430, height: 932, name: 'mobile_430' },
  { width: 768, height: 1024, name: 'tablet_768' },
  { width: 1024, height: 768, name: 'laptop_1024' },
  { width: 1366, height: 768, name: 'desktop_1366' }
];

(async () => {
  console.log('--- STARTING COMPREHENSIVE DATA EXPORTS PAGE UI VERIFICATION ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Authenticate
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({ email: 'admin@anjani.test', password: 'Test@Agro2026!' });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await new Promise(r => setTimeout(r, 1200));

  const results = {
    viewports: {},
    themeConsistency: {},
    masterExport: {},
    registers: {},
    singleModules: {},
    buttonsConsistency: {},
    bottomNavClearance: {},
    exportHandlersReady: {}
  };

  // 2. Test across all 8 viewports for horizontal overflow
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width <= 430 ? 2 : 1 });
    await page.goto(`${BASE_URL}/pages/exports.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));

    const metrics = await page.evaluate(() => {
      const docScrollWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const cards = Array.from(document.querySelectorAll('.export-card, .master-export-card, .bulk-exporter-card'));
      const anyCardOverflows = cards.some(c => {
        const r = c.getBoundingClientRect();
        return r.right > winWidth + 2;
      });

      return {
        winWidth,
        docScrollWidth,
        hasHorizontalOverflow: docScrollWidth > winWidth,
        overflowDelta: Math.max(0, docScrollWidth - winWidth),
        totalCards: cards.length,
        anyCardOverflows
      };
    });

    results.viewports[vp.name] = metrics;
    console.log(`Viewport ${vp.name} (${vp.width}px): docScrollWidth=${metrics.docScrollWidth}, overflowDelta=${metrics.overflowDelta}px, totalCards=${metrics.totalCards}`);
  }

  // Set viewport to mobile_375 for detailed checks
  await page.setViewport({ width: 375, height: 750, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}/pages/exports.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  // 3. Theme Consistency: Verify NO blue or orange accents remain on cards
  const themeCheck = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.export-card, .master-export-card, .bulk-exporter-card'));
    const styles = cards.map(c => {
      const cs = window.getComputedStyle(c);
      return {
        borderLeftColor: cs.borderLeftColor,
        borderTopColor: cs.borderTopColor,
        backgroundColor: cs.backgroundColor,
        hasBlue: cs.borderLeftColor.includes('59, 130, 246') || cs.backgroundColor.includes('59, 130, 246'),
        hasOrange: cs.borderLeftColor.includes('245, 158, 11') || cs.backgroundColor.includes('245, 158, 11')
      };
    });

    const blueFound = styles.some(s => s.hasBlue);
    const orangeFound = styles.some(s => s.hasOrange);

    return {
      cardCount: cards.length,
      blueFound,
      orangeFound,
      allNeutralOrGreen: !blueFound && !orangeFound
    };
  });
  results.themeConsistency = themeCheck;
  console.log('Theme consistency check:', JSON.stringify(themeCheck, null, 2));

  // 4. Master Export Button & Presentation
  const masterCheck = await page.evaluate(() => {
    const btn = document.querySelector('.btn-master-download');
    const heroCard = document.querySelector('.master-export-card');
    const subtext = document.querySelector('.master-export-subtext');

    const cs = btn ? window.getComputedStyle(btn) : null;
    const btnRect = btn ? btn.getBoundingClientRect() : null;

    return {
      exists: !!btn,
      text: btn ? btn.textContent.trim() : '',
      hasIcon: !!(btn && btn.querySelector('svg')),
      bgColor: cs ? cs.backgroundColor : null,
      isPrimaryGreen: cs ? cs.backgroundColor.includes('12, 57, 37') : false,
      hasSubtext: !!subtext,
      subtextContent: subtext ? subtext.textContent.trim() : '',
      fitsInViewport: btnRect ? btnRect.right <= window.innerWidth : false
    };
  });
  results.masterExport = masterCheck;
  console.log('Master export check:', JSON.stringify(masterCheck, null, 2));

  // 5. Registers and Single Module Sections Check
  const sectionsCheck = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('.export-section-header')).map(h => {
      const title = h.querySelector('.export-section-title');
      const sub = h.querySelector('.export-section-subtitle');
      return {
        title: title ? title.textContent.trim() : '',
        subtitle: sub ? sub.textContent.trim() : ''
      };
    });

    const grids = Array.from(document.querySelectorAll('.export-cards-grid'));
    const registerCards = Array.from(grids[0] ? grids[0].querySelectorAll('.export-card') : []).map(c => {
      const title = c.querySelector('.export-card-title');
      const desc = c.querySelector('.export-card-desc');
      const excelBtn = c.querySelector('.export-btn-excel');
      const csvBtn = c.querySelector('.export-btn-csv');
      return {
        title: title ? title.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        hasExcel: !!excelBtn,
        hasCSV: !!csvBtn
      };
    });

    const singleModuleCards = Array.from(grids[1] ? grids[1].querySelectorAll('.export-card') : []).map(c => {
      const title = c.querySelector('.export-card-title');
      const desc = c.querySelector('.export-card-desc');
      const excelBtn = c.querySelector('.export-btn-excel');
      const csvBtn = c.querySelector('.export-btn-csv');
      return {
        title: title ? title.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        hasExcel: !!excelBtn,
        hasCSV: !!csvBtn
      };
    });

    return {
      headers,
      registerCardCount: registerCards.length,
      registerCards,
      singleModuleCardCount: singleModuleCards.length,
      singleModuleCards
    };
  });
  results.registers = sectionsCheck.registerCards;
  results.singleModules = sectionsCheck.singleModuleCards;
  console.log(`Sections check: ${sectionsCheck.registerCardCount} registers, ${sectionsCheck.singleModuleCardCount} single modules`);

  // 6. Excel & CSV Buttons Standardization Check
  const buttonsCheck = await page.evaluate(() => {
    const excelBtns = Array.from(document.querySelectorAll('.export-btn-excel'));
    const csvBtns = Array.from(document.querySelectorAll('.export-btn-csv'));

    const sampleExcel = excelBtns[0] ? window.getComputedStyle(excelBtns[0]) : null;
    const sampleCsv = csvBtns[0] ? window.getComputedStyle(csvBtns[0]) : null;

    return {
      excelCount: excelBtns.length,
      csvCount: csvBtns.length,
      excelBg: sampleExcel ? sampleExcel.backgroundColor : null,
      excelColor: sampleExcel ? sampleExcel.color : null,
      excelIsGreenFilled: sampleExcel ? sampleExcel.backgroundColor.includes('12, 57, 37') : false,
      csvBg: sampleCsv ? sampleCsv.backgroundColor : null,
      csvColor: sampleCsv ? sampleCsv.color : null,
      csvBorderColor: sampleCsv ? sampleCsv.borderColor : null,
      csvIsGreenOutlined: sampleCsv ? sampleCsv.borderColor.includes('12, 57, 37') : false
    };
  });
  results.buttonsConsistency = buttonsCheck;
  console.log('Buttons check:', JSON.stringify(buttonsCheck, null, 2));

  // 7. Fixed Bottom Navigation Clearance Check
  const bottomNavCheck = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-bottom-nav, #mobile-bottom-nav');
    const lastCard = document.querySelector('.export-cards-grid:last-of-type .export-card:last-child');
    const pageBody = document.querySelector('.page-body');

    const bodyPaddingBottom = pageBody ? window.getComputedStyle(pageBody).paddingBottom : null;
    const lastCardRect = lastCard ? lastCard.getBoundingClientRect() : null;
    const navRect = nav ? nav.getBoundingClientRect() : null;

    return {
      hasNav: !!nav,
      navHeight: navRect ? Math.round(navRect.height) : 0,
      bodyPaddingBottom,
      hasSufficientPadding: parseInt(bodyPaddingBottom || '0', 10) >= 80
    };
  });
  results.bottomNavClearance = bottomNavCheck;
  console.log('Bottom nav clearance check:', JSON.stringify(bottomNavCheck, null, 2));

  // 8. Export Handlers Check
  const handlersCheck = await page.evaluate(() => {
    return {
      hasMasterExport: typeof window.exportFullConsolidatedWorkbook === 'function',
      hasAnalyticalReport: typeof window.exportAnalyticalReport === 'function',
      hasTableExport: typeof window.exportTable === 'function',
      hasCsvExport: typeof window.exportCSV === 'function',
      hasBulkExport: typeof window.bulkExportCSV === 'function',
      hasPresets: typeof window.setExportPreset === 'function',
      hasSelectAll: typeof window.selectAllExportModules === 'function'
    };
  });
  results.exportHandlersReady = handlersCheck;
  console.log('Handlers check:', JSON.stringify(handlersCheck, null, 2));

  // 9. Capture Screenshots
  // Mobile 375
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'exports_mobile_375.png'), fullPage: false });

  // Tablet 768
  await page.setViewport({ width: 768, height: 1024 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'exports_tablet_768.png'), fullPage: false });

  // Desktop 1366
  await page.setViewport({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'exports_desktop_1366.png'), fullPage: false });

  console.log('--- ALL DATA EXPORTS TESTS COMPLETED SUCCESSFULLY ---');
  console.log('Summary:', JSON.stringify({
    overflowTests: Object.entries(results.viewports).map(([name, m]) => ({ name, overflow: m.hasHorizontalOverflow, delta: m.overflowDelta })),
    allNeutralOrGreen: results.themeConsistency.allNeutralOrGreen,
    masterExportReady: results.masterExport.isPrimaryGreen && results.masterExport.hasSubtext,
    registerCardsCount: results.registers.length,
    singleModuleCardsCount: results.singleModules.length,
    excelIsGreenFilled: results.buttonsConsistency.excelIsGreenFilled,
    csvIsGreenOutlined: results.buttonsConsistency.csvIsGreenOutlined,
    bottomNavClearanceOk: results.bottomNavClearance.hasSufficientPadding,
    allHandlersReady: Object.values(results.exportHandlersReady).every(v => v === true)
  }, null, 2));

  await browser.close();
})();
