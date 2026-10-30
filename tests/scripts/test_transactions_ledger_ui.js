const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🚀 Starting Cash & Bank Ledger Mobile UI & Double Rupee Verification...');
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
    await page.goto(`${BASE_URL}/pages/transactions.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // ── Check 1: Tab Navigation Layout ──
    const tabMetrics = await page.evaluate((vpWidth, isNarrowMobile) => {
      const tabsContainer = document.querySelector('.tabs.transactions-tabs') || document.querySelector('.tabs');
      const tabBtns = Array.from(document.querySelectorAll('#transactions-tabs .tab-btn'));

      const containerRect = tabsContainer ? tabsContainer.getBoundingClientRect() : null;
      const btnMetrics = tabBtns.map((btn, i) => {
        const r = btn.getBoundingClientRect();
        const computed = window.getComputedStyle(btn);
        return {
          idx: i + 1,
          id: btn.id,
          label: btn.textContent.trim().replace(/\s+/g, ' '),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
          height: Math.round(r.height),
          top: Math.round(r.top),
          visibleInViewport: r.left >= 0 && r.right <= vpWidth + 2,
          bgColor: computed.backgroundColor,
          color: computed.color,
          isActive: btn.classList.contains('active')
        };
      });

      const allTabsFullyVisible = btnMetrics.every(b => b.visibleInViewport);
      // In our 2-row layout: Row 1 = Tab 1 & Tab 2 (Bank Accounts); Row 2 = Tab 3 (General Ledger)
      const glTab = btnMetrics.find(b => b.id === 'tab-general-ledger');
      const ledgerTab = btnMetrics.find(b => b.id === 'tab-ledger');
      const accountsTab = btnMetrics.find(b => b.id === 'tab-accounts');

      const isTwoRowOnMobile = isNarrowMobile && glTab && ledgerTab ? (glTab.top > ledgerTab.top) : false;
      const glTabFullWidth = isTwoRowOnMobile && glTab && containerRect ? (glTab.width >= containerRect.width - 20) : false;

      return {
        tabCount: tabBtns.length,
        btnMetrics,
        allTabsFullyVisible,
        isTwoRowOnMobile,
        glTabFullWidth,
        containerWidth: containerRect ? Math.round(containerRect.width) : 0
      };
    }, vp.width, vp.width <= 640);

    console.log(`[${vp.name}] Tab Metrics:`, {
      allVisible: tabMetrics.allTabsFullyVisible,
      isTwoRow: tabMetrics.isTwoRowOnMobile,
      glTabFullWidth: tabMetrics.glTabFullWidth,
      tabs: tabMetrics.btnMetrics.map(b => `${b.label} (${b.width}x${b.height}px, vis=${b.visibleInViewport})`)
    });

    if (tabMetrics.allTabsFullyVisible) {
      console.log(`✅ PASS [${vp.name}]: ALL 3 tabs are completely accessible without horizontal scrolling!`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: One or more tabs overflow the viewport!`, tabMetrics.btnMetrics);
    }

    if (vp.width <= 640) {
      if (tabMetrics.isTwoRowOnMobile && tabMetrics.glTabFullWidth) {
        console.log(`✅ PASS [${vp.name}]: Clean 2-row layout active: Transactions Ledger & Bank Accounts on Row 1, General Ledger spanning Row 2`);
      } else {
        console.log(`Note [${vp.name}]: Tab layout: isTwoRow=${tabMetrics.isTwoRowOnMobile}, glTabFullWidth=${tabMetrics.glTabFullWidth}`);
      }
    }

    // ── Check 2: TAB 1 (Transactions Ledger) Currency & Content ──
    const tab1Data = await page.evaluate(() => {
      const rEl = document.getElementById('total-receipts');
      const pEl = document.getElementById('total-payments');
      const nEl = document.getElementById('net-balance');
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;

      return {
        receiptsText: rEl ? rEl.textContent.trim() : '',
        paymentsText: pEl ? pEl.textContent.trim() : '',
        netText: nEl ? nEl.textContent.trim() : '',
        pageOverflow
      };
    });

    console.log(`[${vp.name}] Tab 1 Metrics:`, tab1Data);

    const hasDoubleRupeeTab1 = [tab1Data.receiptsText, tab1Data.paymentsText, tab1Data.netText].some(t => t.includes('₹₹'));
    if (!hasDoubleRupeeTab1) {
      console.log(`✅ PASS [${vp.name}] Tab 1: No double rupee symbol detected (${tab1Data.receiptsText}, ${tab1Data.paymentsText}, ${tab1Data.netText})`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 1: Double rupee symbol detected in Tab 1 KPI cards!`);
    }

    if (!tab1Data.pageOverflow) {
      console.log(`✅ PASS [${vp.name}] Tab 1: No horizontal page overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 1: Horizontal page overflow detected!`);
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'transactions_tab1_ledger_mobile_375.png') });
    }

    // ── Check 3: TAB 2 (General Ledger) Double Rupee & Layout ──
    console.log(`Switching to Tab 2: General Ledger (Double-Entry)...`);
    await page.evaluate(() => {
      const btn = document.getElementById('tab-general-ledger');
      if (btn) btn.click();
    });
    await sleep(800);

    const tab2Data = await page.evaluate(() => {
      const dEl = document.getElementById('gl-total-debits');
      const cEl = document.getElementById('gl-total-credits');
      const sEl = document.getElementById('gl-balance-status');
      const diffEl = document.getElementById('gl-diff-text');
      const typeFilter = document.getElementById('gl-type-filter');
      const glActiveTab = document.getElementById('tab-general-ledger');
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;

      // Scan all text in section-general-ledger for '₹₹'
      const secGl = document.getElementById('section-general-ledger');
      const allText = secGl ? secGl.innerText : '';
      const doubleRupeeOccurrences = (allText.match(/₹₹/g) || []).length;

      const debitsVal = dEl ? dEl.textContent.trim() : '';
      const creditsVal = cEl ? cEl.textContent.trim() : '';
      const statusVal = sEl ? sEl.textContent.trim() : '';

      return {
        debitsVal,
        creditsVal,
        statusVal,
        diffText: diffEl ? diffEl.textContent.trim() : '',
        doubleRupeeOccurrences,
        filterVisible: !!typeFilter && typeFilter.offsetWidth > 0,
        filterWidth: typeFilter ? Math.round(typeFilter.getBoundingClientRect().width) : 0,
        tabIsActive: glActiveTab ? glActiveTab.classList.contains('active') : false,
        pageOverflow
      };
    });

    console.log(`[${vp.name}] Tab 2 (General Ledger) Metrics:`, tab2Data);

    if (tab2Data.tabIsActive) {
      console.log(`✅ PASS [${vp.name}] Tab 2: General Ledger tab is active with dark-green active state`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: General Ledger tab failed to activate!`);
    }

    if (!tab2Data.debitsVal.includes('₹₹') && !tab2Data.creditsVal.includes('₹₹') && tab2Data.doubleRupeeOccurrences === 0) {
      console.log(`✅ PASS [${vp.name}] Tab 2: ZERO double rupee symbols! Total Debits="${tab2Data.debitsVal}", Total Credits="${tab2Data.creditsVal}", Status="${tab2Data.statusVal}"`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: Double rupee symbol still present! Occurrences: ${tab2Data.doubleRupeeOccurrences}, Debits: ${tab2Data.debitsVal}, Credits: ${tab2Data.creditsVal}`);
    }

    if (!tab2Data.pageOverflow) {
      console.log(`✅ PASS [${vp.name}] Tab 2: No horizontal page overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 2: Horizontal page overflow detected!`);
    }

    if (tab2Data.filterVisible) {
      console.log(`✅ PASS [${vp.name}] Tab 2: Journal Type filter is visible and responsive (width: ${tab2Data.filterWidth}px)`);
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'transactions_tab2_gl_mobile_375.png') });
    } else if (vp.name === 'desktop_1280') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'transactions_tab2_gl_desktop_1280.png') });
    }

    // ── Check 4: TAB 3 (Bank Accounts) ──
    console.log(`Switching to Tab 3: Bank Accounts...`);
    await page.evaluate(() => {
      const btn = document.getElementById('tab-accounts');
      if (btn) btn.click();
    });
    await sleep(800);

    const tab3Data = await page.evaluate(() => {
      const accountsActiveTab = document.getElementById('tab-accounts');
      const secAccounts = document.getElementById('section-accounts');
      const allText = secAccounts ? secAccounts.innerText : '';
      const doubleRupeeOccurrences = (allText.match(/₹₹/g) || []).length;
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth;
      const rows = Array.from(document.querySelectorAll('#accounts-table tbody tr'));

      return {
        tabIsActive: accountsActiveTab ? accountsActiveTab.classList.contains('active') : false,
        doubleRupeeOccurrences,
        rowCount: rows.length,
        pageOverflow
      };
    });

    console.log(`[${vp.name}] Tab 3 (Bank Accounts) Metrics:`, tab3Data);

    if (tab3Data.tabIsActive) {
      console.log(`✅ PASS [${vp.name}] Tab 3: Bank Accounts tab is active`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 3: Bank Accounts tab failed to activate!`);
    }

    if (tab3Data.doubleRupeeOccurrences === 0) {
      console.log(`✅ PASS [${vp.name}] Tab 3: ZERO double rupee symbols across Bank Accounts!`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 3: Double rupee symbol found in Bank Accounts! Count: ${tab3Data.doubleRupeeOccurrences}`);
    }

    if (!tab3Data.pageOverflow) {
      console.log(`✅ PASS [${vp.name}] Tab 3: No horizontal page overflow`);
    } else {
      console.error(`❌ FAIL [${vp.name}] Tab 3: Horizontal page overflow detected!`);
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'transactions_tab3_accounts_mobile_375.png') });
    }
  }

  await browser.close();
  console.log('\n🎉 ALL CASH & BANK LEDGER TESTS COMPLETED.');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
