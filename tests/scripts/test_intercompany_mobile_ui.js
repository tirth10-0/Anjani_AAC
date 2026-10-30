const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🚀 Starting Intercompany Page Mobile UI & Tab Navigation Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // 1. Authenticate
  console.log('Step 1: Authenticating...');
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

  const viewports = [
    { name: 'mobile_375', width: 375, height: 667 },
    { name: 'mobile_390', width: 390, height: 844 },
    { name: 'mobile_430', width: 430, height: 932 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'desktop_1280', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    console.log(`\n══════════════════════════════════════════════════════════════════`);
    console.log(`TESTING VIEWPORT: [${vp.name}] (${vp.width}x${vp.height})`);
    console.log(`══════════════════════════════════════════════════════════════════`);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // ── Check 1: Removal of "What is this module for?" Banner ──
    const moduleForBannerExists = await page.evaluate(() => {
      const card = document.querySelector('.intercompany-overview-card');
      const textMatches = Array.from(document.querySelectorAll('h4, p, div')).some(el =>
        el.textContent.includes('What is this module for?') ||
        el.textContent.includes('Purchases: Buying from external suppliers')
      );
      return !!card || textMatches;
    });

    if (!moduleForBannerExists) {
      console.log(`✅ PASS [${vp.name}]: "What is this module for?" informational card is completely REMOVED`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: "What is this module for?" banner is still present!`);
    }

    // ── Check 2: Removal of "Agrochemical Supply Chain Trading Matrix" Banner ──
    const agroMatrixBannerExists = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('strong, h4, div')).some(el =>
        el.textContent.includes('Agrochemical Supply Chain Trading Matrix') &&
        el.textContent.includes('Configures official relationships between manufacturing companies')
      );
    });

    if (!agroMatrixBannerExists) {
      console.log(`✅ PASS [${vp.name}]: "Agrochemical Supply Chain Trading Matrix" introductory card is completely REMOVED`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: "Agrochemical Supply Chain Trading Matrix" card is still present!`);
    }

    // ── Check 3: Primary Action Buttons Layout ──
    const btnMetrics = await page.evaluate((isMobile) => {
      const actionsWrap = document.getElementById('intercompany-header-actions');
      const btns = actionsWrap ? actionsWrap.querySelectorAll('button') : [];
      const btnData = Array.from(btns).map(b => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top) };
      });
      const stacked = btnData.length === 2 ? Math.abs(btnData[0].top - btnData[1].top) >= 35 : false;
      return { count: btnData.length, btnData, stacked };
    }, vp.width <= 768);

    if (vp.width <= 768) {
      if (btnMetrics.stacked && btnMetrics.btnData.every(b => b.width >= vp.width - 50)) {
        console.log(`✅ PASS [${vp.name}]: Primary action buttons are neatly stacked full-width (${btnMetrics.btnData[0].width}px, height: ${btnMetrics.btnData[0].height}px)`);
      } else {
        console.warn(`Note [${vp.name}]: Primary button metrics:`, btnMetrics);
      }
    }

    // ── Check 4: Three-Tab Navigation on Mobile ──
    const tabMetrics = await page.evaluate((vpWidth, isMobile) => {
      const tabsContainer = document.querySelector('.tabs.intercompany-tabs') || document.querySelector('.tabs');
      const tabBtns = Array.from(document.querySelectorAll('.tabs .tab-btn'));

      const containerRect = tabsContainer ? tabsContainer.getBoundingClientRect() : null;
      const btnMetrics = tabBtns.map((btn, i) => {
        const r = btn.getBoundingClientRect();
        return {
          idx: i + 1,
          label: btn.textContent.trim(),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          height: Math.round(r.height),
          top: Math.round(r.top),
          visibleInViewport: r.left >= 0 && r.right <= vpWidth + 2
        };
      });

      const allTabsFullyVisible = btnMetrics.every(b => b.visibleInViewport);
      const isTwoRowOnMobile = isMobile && btnMetrics.length === 3 ? (btnMetrics[2].top > btnMetrics[0].top) : false;
      const tab3SpansFullWidth = isTwoRowOnMobile ? (btnMetrics[2].width >= btnMetrics[0].width + btnMetrics[1].width - 15) : false;

      return {
        tabCount: tabBtns.length,
        btnMetrics,
        allTabsFullyVisible,
        isTwoRowOnMobile,
        tab3SpansFullWidth,
        containerWidth: containerRect ? Math.round(containerRect.width) : 0
      };
    }, vp.width, vp.width <= 640);

    console.log(`[${vp.name}] Tab Metrics:`, {
      allVisible: tabMetrics.allTabsFullyVisible,
      isTwoRow: tabMetrics.isTwoRowOnMobile,
      tab3FullWidth: tabMetrics.tab3SpansFullWidth,
      tabs: tabMetrics.btnMetrics.map(t => `${t.label} (${t.width}x${t.height}px, vis=${t.visibleInViewport})`)
    });

    if (tabMetrics.allTabsFullyVisible) {
      console.log(`✅ PASS [${vp.name}]: ALL 3 tabs are completely accessible without horizontal scrolling!`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: One or more tabs overflow the viewport!`, tabMetrics.btnMetrics);
    }

    if (vp.width <= 640) {
      if (tabMetrics.isTwoRowOnMobile && tabMetrics.tab3SpansFullWidth) {
        console.log(`✅ PASS [${vp.name}]: Responsive 2-row layout active: Tab 1 & 2 on Row 1, Tab 3 cleanly spanning Row 2`);
      } else {
        console.warn(`Note [${vp.name}]: Tab layout: isTwoRow=${tabMetrics.isTwoRowOnMobile}, tab3FullWidth=${tabMetrics.tab3SpansFullWidth}`);
      }
    }

    // ── Check 5: TAB 1 (Stock Transfers) ──
    const pageOverflowTab1 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (!pageOverflowTab1) {
      console.log(`✅ PASS [${vp.name}] Tab 1: No page horizontal overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 1: Page has horizontal overflow!`);
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_tab1_transfers_mobile_375.png') });
    }

    // ── Check 6: Switch to TAB 2 (Stock Reconciliation) ──
    console.log(`Switching to Tab 2: Stock Reconciliation...`);
    await page.evaluate(() => {
      const reconBtn = document.querySelector('.tab-btn[data-tab="Reconciliation"]');
      if (reconBtn) reconBtn.click();
    });
    await sleep(800);

    const reconMetrics = await page.evaluate((isMobile) => {
      // Recipient section empty state check
      const recTable = document.getElementById('recon-recipients-table');
      const recHeader = recTable ? recTable.closest('.table-wrap').querySelector('.recon-section-header') : null;
      const recEmpty = recTable ? recTable.querySelector('.empty-state') : null;
      const recEmptyRow = recTable ? recTable.querySelector('tr.empty-row') : null;
      const recMobileLabel = recTable ? recTable.querySelector('.mobile-label') : null;

      const hRect = recHeader ? recHeader.getBoundingClientRect() : null;
      const eRect = recEmpty ? recEmpty.getBoundingClientRect() : null;

      const emptyVerticalGap = (hRect && eRect) ? Math.round(eRect.top - hRect.bottom) : 0;

      // Warehouse distribution cards check
      const whRows = Array.from(document.querySelectorAll('#recon-warehouses-table tbody tr:not(.empty-row)'));
      const whCards = whRows.map((row, i) => {
        const nameEl = row.querySelector('.cell-wh-name') || row.querySelector('td:nth-child(1)');
        const entityEl = row.querySelector('.cell-wh-entity') || row.querySelector('td:nth-child(2)');
        const stockValEl = row.querySelector('.recon-stock-val');
        const numEl = row.querySelector('.recon-stock-num');
        const unitEl = row.querySelector('.recon-stock-unit');
        const consignEl = row.querySelector('.cell-wh-consign') || row.querySelector('td:nth-child(4)');

        const numRect = numEl ? numEl.getBoundingClientRect() : null;
        const unitRect = unitEl ? unitEl.getBoundingClientRect() : null;

        let stockGap = 999;
        if (numRect && unitRect) {
          stockGap = Math.round(unitRect.left - numRect.right);
        }

        return {
          idx: i + 1,
          name: nameEl ? nameEl.textContent.trim() : '',
          entity: entityEl ? entityEl.textContent.trim() : '',
          stockText: stockValEl ? stockValEl.textContent.replace(/\s+/g, ' ').trim() : '',
          stockGap,
          consign: consignEl ? consignEl.textContent.trim() : ''
        };
      });

      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;

      return {
        pageOverflow,
        hasBogusMobileLabel: !!recMobileLabel,
        emptyStateText: recEmpty ? recEmpty.textContent.replace(/\s+/g, ' ').trim() : '',
        emptyVerticalGap,
        whCardCount: whCards.length,
        whCards
      };
    }, vp.width <= 768);

    console.log(`[${vp.name}] Tab 2 (Stock Reconciliation) Metrics:`, {
      pageOverflow: reconMetrics.pageOverflow,
      hasBogusMobileLabel: reconMetrics.hasBogusMobileLabel,
      emptyStateText: reconMetrics.emptyStateText,
      emptyVerticalGap: reconMetrics.emptyVerticalGap,
      whCardCount: reconMetrics.whCardCount
    });

    if (!reconMetrics.pageOverflow) {
      console.log(`✅ PASS [${vp.name}] Tab 2: No horizontal overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: Horizontal overflow detected!`);
    }

    if (!reconMetrics.hasBogusMobileLabel) {
      console.log(`✅ PASS [${vp.name}] Tab 2: Bogus "Recipient Company" label removed from empty state`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: Bogus "Recipient Company" label still present above empty state!`);
    }

    const maxAllowedGap = vp.width <= 768 ? 30 : 70;
    if (reconMetrics.emptyVerticalGap <= maxAllowedGap) {
      console.log(`✅ PASS [${vp.name}] Tab 2: Recipient empty state is compact & directly beneath header (gap: ${reconMetrics.emptyVerticalGap}px, NO excessive blank space)`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: Excessive blank space before empty state: ${reconMetrics.emptyVerticalGap}px!`);
    }

    for (const card of reconMetrics.whCards) {
      console.log(`   Warehouse Card #${card.idx} [${card.name}]: entity="${card.entity}", stock="${card.stockText}" (gap=${card.stockGap}px), consign="${card.consign}"`);

      if (card.stockGap >= 0 && card.stockGap <= 12) {
        console.log(`   ✅ PASS [${vp.name}] #${card.idx}: Stock number & unit tightly grouped (${card.stockText}, gap: ${card.stockGap}px, NOT pushed to edge)`);
      } else {
        console.error(`   ❌ FAIL [${vp.name}] #${card.idx}: Excessive gap between stock and unit: ${card.stockGap}px!`);
      }
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_tab2_recon_mobile_375.png') });
    }

    // ── Check 7: Switch to TAB 3 (Company Trading Matrix) ──
    console.log(`Switching to Tab 3: Company Trading Matrix...`);
    await page.evaluate(() => {
      const relBtn = document.querySelector('.tab-btn[data-tab="Relationships"]');
      if (relBtn) relBtn.click();
    });
    await sleep(800);

    const relMetrics = await page.evaluate((isMobile) => {
      const toolbar = document.getElementById('relationships-table-toolbar');
      const searchWrap = document.getElementById('relationships-search-wrap');
      const searchInput = document.getElementById('search-input');
      const totalInfo = document.getElementById('total-info');

      const sRect = searchWrap ? searchWrap.getBoundingClientRect() : null;
      const tRect = toolbar ? toolbar.getBoundingClientRect() : null;
      const tiRect = totalInfo ? totalInfo.getBoundingClientRect() : null;

      const searchTakesFullWidth = isMobile && sRect && tRect ? (sRect.width >= tRect.width - 32) : true;
      const countPositionedLeft = tiRect && sRect ? (tiRect.left <= sRect.left + 20) : false;

      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;

      return {
        pageOverflow,
        toolbarWidth: tRect ? Math.round(tRect.width) : 0,
        searchWidth: sRect ? Math.round(sRect.width) : 0,
        searchTakesFullWidth,
        countPositionedLeft,
        totalInfoText: totalInfo ? totalInfo.textContent.trim() : ''
      };
    }, vp.width <= 768);

    console.log(`[${vp.name}] Tab 3 (Trading Matrix) Metrics:`, relMetrics);

    if (!relMetrics.pageOverflow) {
      console.log(`✅ PASS [${vp.name}] Tab 3: No horizontal overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 3: Horizontal overflow detected!`);
    }

    if (vp.width <= 768) {
      if (relMetrics.searchTakesFullWidth) {
        console.log(`✅ PASS [${vp.name}] Tab 3: Search input takes full card width (${relMetrics.searchWidth}px)`);
      } else {
        console.error(`❌ FAIL [${vp.name}] Tab 3: Search input width ${relMetrics.searchWidth} vs toolbar ${relMetrics.toolbarWidth}`);
      }

      if (relMetrics.countPositionedLeft) {
        console.log(`✅ PASS [${vp.name}] Tab 3: Relationship count cleanly aligned at bottom-left ("${relMetrics.totalInfoText}")`);
      } else {
        console.warn(`Note [${vp.name}] Tab 3: Relationship count position`);
      }
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_tab3_matrix_mobile_375.png') });
    } else if (vp.name === 'desktop_1280') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_tab3_matrix_desktop_1280.png') });
    }
  }

  console.log('\n🎉 ALL TESTS COMPLETED.');
  await browser.close();
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
