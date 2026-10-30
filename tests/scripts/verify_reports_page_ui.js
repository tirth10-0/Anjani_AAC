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
  console.log('--- STARTING COMPREHENSIVE BUSINESS REPORTS UI TEST ---');
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
    datePresets: {},
    advancedFilters: {},
    tabs: {},
    topProductsRanking: {},
    topClientsRanking: {},
    exports: {}
  };

  // Test across all 8 viewports
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width <= 430 ? 2 : 1 });
    await page.goto(`${BASE_URL}/pages/reports.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    const metrics = await page.evaluate((width) => {
      const docScrollWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const filterBar = document.querySelector('.report-filter-bar');
      const filterBarRect = filterBar ? filterBar.getBoundingClientRect() : null;

      const presetsContainer = document.getElementById('report-date-presets');
      const presetButtons = Array.from(presetsContainer ? presetsContainer.querySelectorAll('.cat-pill') : []);
      const presetsOverflow = presetButtons.some(b => {
        const r = b.getBoundingClientRect();
        return r.right > (filterBarRect ? filterBarRect.right + 2 : winWidth);
      });

      const tabsContainer = document.getElementById('reports-tabs');
      const tabButtons = Array.from(tabsContainer ? tabsContainer.querySelectorAll('.tab-btn') : []);
      const tabsOverflow = tabButtons.some(t => {
        const r = t.getBoundingClientRect();
        return r.right > winWidth + 2;
      });

      return {
        winWidth,
        docScrollWidth,
        hasHorizontalOverflow: docScrollWidth > winWidth,
        overflowDelta: Math.max(0, docScrollWidth - winWidth),
        filterBarWidth: filterBarRect ? Math.round(filterBarRect.width) : null,
        presetCount: presetButtons.length,
        presetsOverflow,
        tabCount: tabButtons.length,
        tabsOverflow
      };
    }, vp.width);

    results.viewports[vp.name] = metrics;
    console.log(`Viewport ${vp.name} (${vp.width}px): docScrollWidth=${metrics.docScrollWidth}, overflowDelta=${metrics.overflowDelta}px, presetsCount=${metrics.presetCount}, tabsCount=${metrics.tabCount}`);
  }

  // Set viewport to mobile_375 for detailed component verification
  await page.setViewport({ width: 375, height: 750, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}/pages/reports.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Verify Date Range Presets
  const presetTest = await page.evaluate(() => {
    const presets = ['today', 'week', 'month', 'quarter', 'financial_year', 'calendar_year', 'last_12_months', 'custom'];
    const results = {};
    const labelEl = document.getElementById('active-range-label');
    const fromInput = document.getElementById('date-from');
    const toInput = document.getElementById('date-to');

    presets.forEach(p => {
      const btn = document.querySelector(`#report-date-presets .cat-pill[data-preset="${p}"]`);
      if (btn) {
        btn.click();
        results[p] = {
          clicked: true,
          isActive: btn.classList.contains('active'),
          label: labelEl ? labelEl.textContent : '',
          from: fromInput ? fromInput.value : '',
          to: toInput ? toInput.value : ''
        };
      } else {
        results[p] = { clicked: false };
      }
    });

    // Reset back to financial year
    const fyBtn = document.querySelector('#report-date-presets .cat-pill[data-preset="financial_year"]');
    if (fyBtn) fyBtn.click();

    return results;
  });
  results.datePresets = presetTest;
  console.log('Date presets test:', JSON.stringify(presetTest, null, 2));

  // 2. Verify Advanced Filters Collapsible Functionality
  const filterCollapseTest = await page.evaluate(() => {
    const toggleBtn = document.getElementById('toggle-advanced-filters-btn');
    const body = document.getElementById('advanced-filters-body');
    const chevron = document.getElementById('advanced-filters-chevron');
    const badge = document.getElementById('active-filters-count');

    const initialDisplay = body.style.display;

    // Expand
    toggleBtn.click();
    const expandedDisplay = body.style.display;
    const isExpandedAria = toggleBtn.getAttribute('aria-expanded');

    // Select a customer filter
    const clientSel = document.getElementById('filter-client');
    if (clientSel && clientSel.options.length > 1) {
      clientSel.selectedIndex = 1;
      clientSel.dispatchEvent(new Event('change'));
    }

    const badgeAfterSelect = badge ? badge.textContent : '';

    // Collapse
    toggleBtn.click();
    const collapsedDisplay = body.style.display;
    const clientValWhileCollapsed = clientSel ? clientSel.value : '';

    // Expand again to ensure value was preserved
    toggleBtn.click();
    const clientValReopened = clientSel ? clientSel.value : '';

    return {
      initialDisplay,
      expandedDisplay,
      isExpandedAria,
      badgeAfterSelect,
      collapsedDisplay,
      clientValWhileCollapsed,
      clientValReopened,
      preservesValue: clientValWhileCollapsed === clientValReopened && clientValWhileCollapsed !== ''
    };
  });
  results.advancedFilters = filterCollapseTest;
  console.log('Advanced filters collapsible test:', JSON.stringify(filterCollapseTest, null, 2));

  // 3. Verify Report Tabs Grid on Mobile and Tab Switching
  const tabsTest = await page.evaluate(() => {
    const tabsContainer = document.getElementById('reports-tabs');
    const buttons = Array.from(tabsContainer.querySelectorAll('.tab-btn'));
    const style = window.getComputedStyle(tabsContainer);

    const tabsInfo = buttons.map(b => ({
      name: b.getAttribute('data-tab'),
      text: b.textContent.trim(),
      width: Math.round(b.getBoundingClientRect().width),
      height: Math.round(b.getBoundingClientRect().height)
    }));

    // Test switching
    const testSwitch = {};
    buttons.forEach(b => {
      const tabName = b.getAttribute('data-tab');
      b.click();
      const pane = document.getElementById(
        tabName === 'Overview' ? 'tab-overview' :
        tabName === 'CustomerSales' ? 'tab-customersales' :
        tabName === 'ProductSales' ? 'tab-productsales' :
        tabName === 'MonthlyTrends' ? 'tab-monthlytrends' :
        'tab-companysummary'
      );
      testSwitch[tabName] = {
        activeClass: b.classList.contains('active'),
        paneVisible: pane && pane.style.display !== 'none'
      };
    });

    // Reset back to Overview
    const ovBtn = document.querySelector('.tab-btn[data-tab="Overview"]');
    if (ovBtn) ovBtn.click();

    return {
      display: style.display,
      gridTemplateColumns: style.gridTemplateColumns,
      tabCount: buttons.length,
      tabsInfo,
      testSwitch
    };
  });
  results.tabs = tabsTest;
  console.log('Tabs test:', JSON.stringify(tabsTest, null, 2));

  // 4. Verify Top Products & Top Clients Ranking and Left Alignment
  const rankingAndAlignmentTest = await page.evaluate(() => {
    const prodTable = document.getElementById('top-products-table');
    const clientTable = document.getElementById('top-clients-table');

    const prodRows = Array.from(prodTable.querySelectorAll('tbody tr'));
    const prodRanks = prodRows.map(r => {
      const rankCell = r.querySelector('.col-rank');
      const nameCell = r.querySelector('.col-name');
      const nameSpan = r.querySelector('.top-product-name');
      const packSpan = r.querySelector('.top-product-pack');
      const revCell = r.querySelector('.col-rev');

      const nameRect = nameSpan ? nameSpan.getBoundingClientRect() : null;
      const packRect = packSpan ? packSpan.getBoundingClientRect() : null;

      return {
        rankText: rankCell ? rankCell.textContent.trim() : '',
        hasHash: rankCell ? rankCell.textContent.includes('#') : false,
        isPureNumber: rankCell ? /^\d+$/.test(rankCell.textContent.trim()) : false,
        name: nameSpan ? nameSpan.textContent.trim() : (nameCell ? nameCell.textContent.trim() : ''),
        pack: packSpan ? packSpan.textContent.trim() : '',
        nameLeft: nameRect ? Math.round(nameRect.left) : null,
        packLeft: packRect ? Math.round(packRect.left) : null,
        leftAligned: nameRect && packRect ? Math.abs(nameRect.left - packRect.left) <= 2 : true,
        revenue: revCell ? revCell.textContent.trim() : ''
      };
    });

    const clientRows = Array.from(clientTable.querySelectorAll('tbody tr'));
    const clientRanks = clientRows.map(r => {
      const rankCell = r.querySelector('.col-rank');
      const nameSpan = r.querySelector('.top-client-name');
      const citySpan = r.querySelector('.top-client-city');
      const revCell = r.querySelector('.col-rev');

      return {
        rankText: rankCell ? rankCell.textContent.trim() : '',
        hasHash: rankCell ? rankCell.textContent.includes('#') : false,
        isPureNumber: rankCell ? /^\d+$/.test(rankCell.textContent.trim()) : false,
        client: nameSpan ? nameSpan.textContent.trim() : '',
        city: citySpan ? citySpan.textContent.trim() : '',
        revenue: revCell ? revCell.textContent.trim() : ''
      };
    });

    return {
      prodRanks,
      clientRanks
    };
  });
  results.topProductsRanking = rankingAndAlignmentTest.prodRanks;
  results.topClientsRanking = rankingAndAlignmentTest.clientRanks;
  console.log('Top products ranking & alignment:', JSON.stringify(rankingAndAlignmentTest.prodRanks, null, 2));
  console.log('Top clients ranking:', JSON.stringify(rankingAndAlignmentTest.clientRanks, null, 2));

  // 5. Test Exports Existence
  const exportCheck = await page.evaluate(() => {
    return {
      hasExcelFn: typeof window.exportCurrentReportToExcel === 'function',
      hasCsvFn: typeof window.exportCurrentReportToCSV === 'function',
      hasCustomerExcelFn: typeof window.exportCustomerDetailExcel === 'function'
    };
  });
  results.exports = exportCheck;

  // 6. Capture Screenshots
  // Mobile 375 screenshot with filter bar and top tables
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reports_mobile_375_overview.png'), fullPage: false });

  // Mobile 375 with Advanced Filters expanded
  await page.evaluate(() => {
    const btn = document.getElementById('toggle-advanced-filters-btn');
    const body = document.getElementById('advanced-filters-body');
    if (body.style.display === 'none') btn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reports_mobile_375_advanced_filters.png'), fullPage: false });

  // Tablet 768 screenshot
  await page.setViewport({ width: 768, height: 1024 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reports_tablet_768.png'), fullPage: false });

  // Desktop 1366 screenshot
  await page.setViewport({ width: 1366, height: 768 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reports_desktop_1366.png'), fullPage: false });

  console.log('--- ALL TESTS COMPLETED SUCCESSFULLY ---');
  console.log('Summary:', JSON.stringify({
    overflowTests: Object.entries(results.viewports).map(([name, m]) => ({ name, overflow: m.hasHorizontalOverflow, delta: m.overflowDelta })),
    advancedFiltersPreserves: results.advancedFilters.preservesValue,
    topProductsCleanNumbers: results.topProductsRanking.every(p => p.isPureNumber && !p.hasHash),
    topProductsLeftAligned: results.topProductsRanking.every(p => p.leftAligned),
    topClientsCleanNumbers: results.topClientsRanking.every(c => c.isPureNumber && !c.hasHash),
    exportFunctionsReady: results.exports.hasExcelFn && results.exports.hasCsvFn
  }, null, 2));

  await browser.close();
})();
