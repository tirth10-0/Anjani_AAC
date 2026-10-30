const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🚀 Starting Warehouses Mobile UI & WhatsApp Sharing Verification...');
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

  // ══════════════════════════════════════════════════════════════════
  // TEST SUITE 1: Warehouses & Storage Points Page UI & Data Alignment
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- TEST SUITE 1: Warehouses & Storage Points Page ---');
  const viewports = [
    { name: 'mobile_375', width: 375, height: 667 },
    { name: 'mobile_390', width: 390, height: 844 },
    { name: 'mobile_430', width: 430, height: 932 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'desktop_1280', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/warehouses.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const metrics = await page.evaluate((isMobile) => {
      const toolbar = document.getElementById('warehouses-table-toolbar');
      const searchWrap = document.getElementById('warehouses-search-wrap');
      const toolbarLeft = document.getElementById('warehouses-toolbar-left');
      const companyFilter = document.getElementById('company-filter');
      const statusFilter = document.getElementById('status-filter');
      const totalInfo = document.getElementById('total-info');

      const sRect = searchWrap ? searchWrap.getBoundingClientRect() : null;

      // Find visible dropdown elements (either .uss-container or native select)
      const compDropdown = (toolbarLeft && toolbarLeft.querySelector('.uss-container[data-source-id="company-filter"]')) ||
                           (companyFilter && companyFilter._ussInstance && companyFilter._ussInstance.container) ||
                           companyFilter;
      const statDropdown = (toolbarLeft && toolbarLeft.querySelector('.uss-container[data-source-id="status-filter"]')) ||
                           (statusFilter && statusFilter._ussInstance && statusFilter._ussInstance.container) ||
                           statusFilter;

      const cRect = compDropdown ? compDropdown.getBoundingClientRect() : null;
      const stRect = statDropdown ? statDropdown.getBoundingClientRect() : null;
      const tRect = toolbar ? toolbar.getBoundingClientRect() : null;
      const tiRect = totalInfo ? totalInfo.getBoundingClientRect() : null;

      // Check horizontal overflow
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;

      // Check Warehouse cards (tbody rows)
      const rows = Array.from(document.querySelectorAll('#warehouses-table tbody tr:not(.empty-row)'));
      const cardsData = rows.map((row, idx) => {
        // Code & DEFAULT badge
        const codeStack = row.querySelector('.wh-code-stack');
        const codeTextEl = row.querySelector('.wh-code-text');
        const defaultBadgeEl = row.querySelector('.wh-default-pill');

        const codeRect = codeTextEl ? codeTextEl.getBoundingClientRect() : null;
        const defaultRect = defaultBadgeEl ? defaultBadgeEl.getBoundingClientRect() : null;

        let codeAndBadgeSeparated = true;
        let codeDefaultGap = 0;
        if (codeRect && defaultRect) {
          // Check that they do not overlap
          const overlap = !(codeRect.right <= defaultRect.left || defaultRect.right <= codeRect.left || codeRect.bottom <= defaultRect.top || defaultRect.bottom <= codeRect.top);
          codeAndBadgeSeparated = !overlap;
          codeDefaultGap = Math.abs(defaultRect.left - codeRect.right);
        }

        // Legal Entity & Company Code
        const entityStack = row.querySelector('.wh-entity-stack');
        const entityNameEl = row.querySelector('.wh-entity-name');
        const entityCodeEl = row.querySelector('.wh-entity-code');

        const eNameRect = entityNameEl ? entityNameEl.getBoundingClientRect() : null;
        const eCodeRect = entityCodeEl ? entityCodeEl.getBoundingClientRect() : null;

        let entitySeparated = true;
        if (eNameRect && eCodeRect) {
          const overlap = !(eNameRect.right <= eCodeRect.left || eCodeRect.right <= eNameRect.left || eNameRect.bottom <= eCodeRect.top || eCodeRect.bottom <= eNameRect.top);
          entitySeparated = !overlap;
        }

        // Current Stock & Unit
        const stockVal = row.querySelector('.wh-stock-val');
        const stockNumEl = row.querySelector('.wh-stock-num');
        const stockUnitEl = row.querySelector('.wh-stock-unit');

        const numRect = stockNumEl ? stockNumEl.getBoundingClientRect() : null;
        const unitRect = stockUnitEl ? stockUnitEl.getBoundingClientRect() : null;

        let stockGap = 999;
        if (numRect && unitRect) {
          stockGap = Math.round(unitRect.left - numRect.right);
        }

        // Action buttons
        const actionBtns = row.querySelectorAll('.row-actions .action-btn');
        const actionBtnSizes = Array.from(actionBtns).map(b => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });

        return {
          idx: idx + 1,
          code: codeTextEl ? codeTextEl.textContent.trim() : '',
          hasDefaultBadge: !!defaultBadgeEl,
          codeAndBadgeSeparated,
          codeDefaultGap,
          entityName: entityNameEl ? entityNameEl.textContent.trim() : '',
          entityCode: entityCodeEl ? entityCodeEl.textContent.trim() : '',
          entitySeparated,
          stockText: stockVal ? stockVal.textContent.replace(/\s+/g, ' ').trim() : '',
          stockGap,
          actionBtnCount: actionBtns.length,
          actionBtnSizes
        };
      });

      return {
        isMobile,
        pageOverflow,
        toolbarWidth: tRect ? Math.round(tRect.width) : 0,
        searchWidth: sRect ? Math.round(sRect.width) : 0,
        compWidth: cRect ? Math.round(cRect.width) : 0,
        statusWidth: stRect ? Math.round(stRect.width) : 0,
        dropdownsMatchSearchOnMobile: isMobile ? (cRect && sRect && Math.abs(cRect.width - sRect.width) <= 4 && stRect && Math.abs(stRect.width - sRect.width) <= 4) : true,
        countPositionedLeft: tiRect && sRect ? (tiRect.left <= sRect.left + 20) : false,
        totalInfoText: totalInfo ? totalInfo.textContent.trim() : '',
        cardCount: cardsData.length,
        cardsData
      };
    }, vp.width <= 768);

    console.log(`[${vp.name}] Warehouse Metrics:`, {
      pageOverflow: metrics.pageOverflow,
      searchWidth: metrics.searchWidth,
      compWidth: metrics.compWidth,
      statusWidth: metrics.statusWidth,
      dropdownsMatchSearchOnMobile: metrics.dropdownsMatchSearchOnMobile,
      countPositionedLeft: metrics.countPositionedLeft,
      totalInfo: metrics.totalInfoText,
      cardCount: metrics.cardCount
    });

    // Assertions
    if (!metrics.pageOverflow) {
      console.log(`✅ PASS [${vp.name}]: No horizontal page overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: Horizontal page overflow detected!`);
    }

    if (vp.width <= 768) {
      if (metrics.dropdownsMatchSearchOnMobile) {
        console.log(`✅ PASS [${vp.name}]: Company and Status dropdowns match full search bar width (${metrics.compWidth}px)`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Dropdown widths mismatch! search: ${metrics.searchWidth}, comp: ${metrics.compWidth}, status: ${metrics.statusWidth}`);
      }

      if (metrics.countPositionedLeft) {
        console.log(`✅ PASS [${vp.name}]: Warehouse count is cleanly aligned at bottom-left ("${metrics.totalInfoText}")`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Warehouse count is not aligned at bottom-left!`);
      }
    }

    for (const card of metrics.cardsData) {
      console.log(`   Card #${card.idx} [${card.code}]: stock="${card.stockText}" (gap=${card.stockGap}px), default=${card.hasDefaultBadge}, entity="${card.entityName}" [${card.entityCode}]`);

      // Verify Code and DEFAULT badge separation
      if (card.hasDefaultBadge) {
        if (card.codeAndBadgeSeparated) {
          console.log(`   ✅ PASS [${vp.name}] #${card.idx}: Code and DEFAULT badge are distinctly separated (gap ${card.codeDefaultGap}px, NOT merged)`);
        } else {
          console.error(`   ❌ FAIL [${vp.name}] #${card.idx}: Code and DEFAULT badge merged or overlapping!`);
        }
      }

      // Verify Stock number and unit grouping
      if (card.stockGap >= 0 && card.stockGap <= 12) {
        console.log(`   ✅ PASS [${vp.name}] #${card.idx}: Stock number & unit cleanly grouped together (gap: ${card.stockGap}px, NOT pushed to edge)`);
      } else {
        console.error(`   ❌ FAIL [${vp.name}] #${card.idx}: Excessive gap between stock and unit: ${card.stockGap}px!`);
      }

      // Verify Legal Entity & Company Code separation
      if (card.entitySeparated && card.entityCode) {
        console.log(`   ✅ PASS [${vp.name}] #${card.idx}: Legal Entity "${card.entityName}" and code [${card.entityCode}] are distinct elements`);
      } else if (card.entityCode) {
        console.error(`   ❌ FAIL [${vp.name}] #${card.idx}: Legal Entity and code are merged!`);
      }

      // Verify Action buttons dimensions (36x36 on mobile)
      if (vp.width <= 768) {
        const all36 = card.actionBtnSizes.every(s => s.w === 36 && s.h === 36);
        if (all36) {
          console.log(`   ✅ PASS [${vp.name}] #${card.idx}: Action buttons uniformly sized to 36x36px`);
        } else {
          console.warn(`   Note [${vp.name}] #${card.idx}: Action buttons sizes:`, card.actionBtnSizes);
        }
      }
    }

    // Capture screenshots
    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'warehouses_page_fixed_mobile_375.png') });
    } else if (vp.name === 'mobile_390') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'warehouses_page_fixed_mobile_390.png') });
    } else if (vp.name === 'desktop_1280') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'warehouses_page_fixed_desktop_1280.png') });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // TEST SUITE 2: WhatsApp PDF Sharing Logic & Web Share API Fallback
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- TEST SUITE 2: WhatsApp PDF Sharing Handler ---');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
  await sleep(1000);

  const shareVerification = await page.evaluate(async () => {
    // Check if sendInvoiceWhatsApp is bound
    const hasFn = typeof window.sendInvoiceWhatsApp === 'function';

    // Mock an invoice doc
    window.currentViewInvoiceDoc = {
      InvoiceNumber: 'INV-01',
      date: '2026-10-22',
      customer: {
        name: 'Shree Ram Krushi Kendra',
        phone: '9876543210'
      },
      seller: {
        companyName: 'Anjani Agri Care'
      },
      rows: [
        { id: '1', name: 'Anjani Chlor-20', totalUnits: 100, price: 500, taxableValue: 50000, gstRate: 12, total: 56000 }
      ],
      calculations: {
        subtotal: 50000,
        totalTax: 6000,
        grandTotal: 56000
      }
    };

    let shareCallArgs = null;
    let fallbackDialogShown = false;
    let fallbackMessage = '';

    // Test Case A: When Web Share API supports file sharing
    let testASuccess = false;
    const originalNavigatorShare = navigator.share;
    const originalNavigatorCanShare = navigator.canShare;

    try {
      navigator.canShare = (data) => {
        return !!(data && data.files && data.files.length > 0);
      };
      navigator.share = async (data) => {
        shareCallArgs = {
          title: data.title,
          fileCount: data.files ? data.files.length : 0,
          fileName: data.files && data.files[0] ? data.files[0].name : null,
          hasSummaryText: !!data.text
        };
        return Promise.resolve();
      };

      await window.sendInvoiceWhatsApp();
      testASuccess = shareCallArgs &&
                     shareCallArgs.title === 'Commercial Tax Invoice' &&
                     shareCallArgs.fileName === 'Invoice_01.pdf' &&
                     shareCallArgs.hasSummaryText === false;
    } catch (e) {
      console.error('Test A error:', e);
    }

    // Test Case B: When user cancels sharing (AbortError) - must NOT download
    let testBSuccess = false;
    let downloadTriggeredOnCancel = false;
    const originalDownload = window.downloadInvoicePDF;
    window.downloadInvoicePDF = () => {
      downloadTriggeredOnCancel = true;
    };

    try {
      navigator.share = async () => {
        const err = new Error('User cancelled share');
        err.name = 'AbortError';
        throw err;
      };
      await window.sendInvoiceWhatsApp();
      testBSuccess = downloadTriggeredOnCancel === false;
    } catch (e) {
      console.error('Test B error:', e);
    }

    // Test Case C: When Web Share is unsupported (e.g. unsecure HTTP) - intentional fallback
    let testCSuccess = false;
    navigator.canShare = () => false;
    navigator.share = undefined;

    const originalConfirm = window.confirm;
    window.confirm = (msg) => {
      fallbackDialogShown = true;
      fallbackMessage = msg;
      return false; // User clicks Cancel on prompt
    };

    try {
      await window.sendInvoiceWhatsApp();
      testCSuccess = fallbackDialogShown && fallbackMessage.length > 0;
    } catch (e) {
      console.error('Test C error:', e);
    }

    // Restore mocks
    navigator.share = originalNavigatorShare;
    navigator.canShare = originalNavigatorCanShare;
    window.confirm = originalConfirm;
    window.downloadInvoicePDF = originalDownload;

    return {
      hasFn,
      shareCallArgs,
      testASuccess,
      testBSuccess,
      testCSuccess,
      fallbackMessage
    };
  });

  console.log('WhatsApp Sharing Verification Results:', shareVerification);

  if (shareVerification.hasFn) {
    console.log('✅ PASS: sendInvoiceWhatsApp function is globally available');
  } else {
    console.error('❌ FAIL: sendInvoiceWhatsApp is not defined!');
  }

  if (shareVerification.testASuccess) {
    console.log(`✅ PASS: File sharing initiated with correct title "${shareVerification.shareCallArgs.title}", filename "${shareVerification.shareCallArgs.fileName}", and NO unwanted summary message`);
  } else {
    console.error('❌ FAIL: File sharing arguments failed verification!', shareVerification.shareCallArgs);
  }

  if (shareVerification.testBSuccess) {
    console.log('✅ PASS: Cancelling share sheet (AbortError) does NOT trigger automatic PDF download');
  } else {
    console.error('❌ FAIL: Cancelling share sheet triggered unwanted PDF download!');
  }

  if (shareVerification.testCSuccess) {
    console.log('✅ PASS: Unsupported browser receives clear prompt explaining requirement with intentional choice');
  } else {
    console.error('❌ FAIL: Unsupported browser fallback failed!');
  }

  console.log('\n🎉 ALL TESTS COMPLETED.');
  await browser.close();
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
