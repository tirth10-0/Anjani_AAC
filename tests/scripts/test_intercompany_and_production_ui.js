const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Helper login
  async function login() {
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
    await new Promise(r => setTimeout(r, 1200));
  }

  await login();

  const results = {
    intercompany: {},
    production: {}
  };

  // =========================================================================
  // TEST 1: INTERCOMPANY STOCK RECONCILIATION
  // =========================================================================
  console.log('Testing Intercompany Stock Reconciliation...');

  // 1A: Mobile 375px Empty State Centering
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const reconBtn = document.querySelector('.tab-btn[data-tab="Reconciliation"]');
    if (reconBtn) reconBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const mobileEmptyState = await page.evaluate(() => {
    const wrap = document.getElementById('recon-recipients-table-wrap');
    const emptyRow = document.querySelector('#recon-recipients-table tr.empty-row');
    const emptyState = document.querySelector('#recon-recipients-table .recon-empty-state') || document.querySelector('#recon-recipients-table .empty-state');
    const icon = emptyState ? (emptyState.querySelector('.recon-empty-icon-wrap') || emptyState.querySelector('svg')) : null;
    const title = emptyState ? (emptyState.querySelector('.recon-empty-title') || emptyState.querySelector('p')) : null;

    const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
    const eRect = emptyState ? emptyState.getBoundingClientRect() : null;
    const iRect = icon ? icon.getBoundingClientRect() : null;
    const tRect = title ? title.getBoundingClientRect() : null;

    const wrapCenter = wrapRect ? wrapRect.left + wrapRect.width / 2 : 0;
    const iconCenter = iRect ? iRect.left + iRect.width / 2 : 0;
    const titleCenter = tRect ? tRect.left + tRect.width / 2 : 0;

    return {
      wrapCenter: Math.round(wrapCenter * 10) / 10,
      iconCenter: Math.round(iconCenter * 10) / 10,
      titleCenter: Math.round(titleCenter * 10) / 10,
      iconOffsetFromCenter: Math.abs(wrapCenter - iconCenter),
      titleOffsetFromCenter: Math.abs(wrapCenter - titleCenter)
    };
  });

  results.intercompany.mobileEmptyState = mobileEmptyState;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_recon_empty_mobile_375.png') });

  // 1B: Laptop 1280px & 1366px - Verify No Horizontal Scrollbar
  for (const width of [1280, 1366]) {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      document.querySelector('.tab-btn[data-tab="Reconciliation"]').click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Test Empty State on Laptop
    const laptopEmpty = await page.evaluate(() => {
      const wrap = document.getElementById('recon-recipients-table-wrap');
      const table = document.getElementById('recon-recipients-table');
      return {
        wrapWidth: wrap ? wrap.clientWidth : 0,
        tableWidth: table ? table.offsetWidth : 0,
        hasWrapScrollbar: wrap ? (wrap.scrollWidth > wrap.clientWidth) : false
      };
    });

    // Populate with dummy rows to test filled table on laptop
    await page.evaluate(() => {
      const recTbody = document.querySelector('#recon-recipients-table tbody');
      if (recTbody) {
        recTbody.innerHTML = `
          <tr>
            <td style="font-weight:700;color:var(--primary);">Afield Chemical Corp <span class="badge badge-gray" style="font-size:10px;">ACC-01</span></td>
            <td><strong>5,000 Units</strong></td>
            <td style="color:#16a34a;font-weight:700;">4,800 Units</td>
            <td style="color:#0284c7;font-weight:700;">200 Units</td>
            <td><span class="badge" style="background:#fef3c7;color:#b45309;font-weight:700;">1,500 Units</span></td>
            <td style="color:var(--danger,#ef4444);font-weight:600;">0</td>
            <td><span class="badge badge-warning">In Balance</span></td>
          </tr>
          <tr>
            <td style="font-weight:700;color:var(--primary);">Bharat Agro Care <span class="badge badge-gray" style="font-size:10px;">BAC-02</span></td>
            <td><strong>2,500 Units</strong></td>
            <td style="color:#16a34a;font-weight:700;">2,500 Units</td>
            <td style="color:#0284c7;font-weight:700;">0 Units</td>
            <td><span class="badge" style="background:#fef3c7;color:#b45309;font-weight:700;">800 Units</span></td>
            <td style="color:var(--danger,#ef4444);font-weight:600;">0</td>
            <td><span class="badge badge-success">Fully Reconciled</span></td>
          </tr>
        `;
      }
    });
    await new Promise(r => setTimeout(r, 400));

    const laptopPopulated = await page.evaluate(() => {
      const wrap = document.getElementById('recon-recipients-table-wrap');
      const table = document.getElementById('recon-recipients-table');
      const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
      const all = wrap ? Array.from(wrap.querySelectorAll('*')) : [];
      const overflowing = all.filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > wrapRect.right + 0.5;
      }).map(el => ({
        tag: el.tagName,
        className: el.className,
        text: el.innerText ? el.innerText.slice(0, 30) : '',
        right: Math.round(el.getBoundingClientRect().right),
        wrapRight: Math.round(wrapRect.right),
        overflow: Math.round(el.getBoundingClientRect().right - wrapRect.right)
      }));

      return {
        wrapWidth: wrap ? wrap.clientWidth : 0,
        tableWidth: table ? table.offsetWidth : 0,
        scrollWidth: wrap ? wrap.scrollWidth : 0,
        clientWidth: wrap ? wrap.clientWidth : 0,
        diff: wrap ? (wrap.scrollWidth - wrap.clientWidth) : 0,
        hasWrapScrollbar: wrap ? (wrap.scrollWidth > wrap.clientWidth) : false,
        overflowing,
        columnWidths: Array.from(table.querySelectorAll('thead th')).map(th => ({
          text: th.innerText.trim(),
          width: Math.round(th.getBoundingClientRect().width)
        }))
      };
    });

    results.intercompany[`laptop_${width}`] = {
      empty: laptopEmpty,
      populated: laptopPopulated
    };

    if (width === 1280) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_recon_matrix_laptop_1280.png') });
    }
  }

  // 1C: Mobile 375px with Populated Rows (testing responsive card transform)
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await page.evaluate(() => {
    if (typeof UTILS !== 'undefined' && UTILS.applyMobileTableLabels) {
      UTILS.applyMobileTableLabels('recon-recipients-table');
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intercompany_recon_populated_mobile_375.png') });

  // =========================================================================
  // TEST 2: PRODUCTION MODAL OUTPUT & FINISHED PRODUCT UI
  // =========================================================================
  console.log('Testing Production Modal Output UI...');

  for (const width of [360, 375, 430]) {
    await page.setViewport({ width, height: 667, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/production.html`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));

    // Open Record Production Modal
    await page.evaluate(() => {
      window.openProductionModal();
    });
    await new Promise(r => setTimeout(r, 600));

    // Select manufactured product & set quantity
    await page.evaluate(() => {
      const pSel = document.getElementById('product-select');
      if (pSel && pSel.options.length > 1) {
        pSel.selectedIndex = 1;
        pSel.dispatchEvent(new Event('change'));
      }
      const qIn = document.getElementById('quantity-produced-input');
      if (qIn) {
        qIn.value = '500';
        qIn.dispatchEvent(new Event('input'));
      }
    });
    await new Promise(r => setTimeout(r, 500));

    // Add Finished Product as Output
    await page.evaluate(() => {
      window.addFinishedProductRow();
    });
    await new Promise(r => setTimeout(r, 600));

    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('#production-modal .modal');
      const card = document.querySelectorAll('#production-modal .product-form-card')[1];
      const rows = Array.from(document.querySelectorAll('.production-items-table tr.production-item-row'));

      const modalRect = modal.getBoundingClientRect();
      const cardRect = card ? card.getBoundingClientRect() : null;

      const rowData = rows.map((r, i) => {
        const rRect = r.getBoundingClientRect();
        const action = r.classList.contains('is-increase') ? 'INCREASE' : 'DECREASE';
        const stockCell = r.querySelector('.cell-prod-stock');
        const qtyCell = r.querySelector('.cell-prod-qty');
        const unitCell = r.querySelector('.cell-prod-unit');
        const removeCell = r.querySelector('.cell-prod-remove');
        const removeBtn = removeCell ? removeCell.querySelector('button') : null;

        const uInput = unitCell ? unitCell.querySelector('input') : null;

        return {
          idx: i,
          action,
          rowWidth: Math.round(rRect.width),
          rowRight: Math.round(rRect.right),
          cardRight: cardRect ? Math.round(cardRect.right) : null,
          modalRight: Math.round(modalRect.right),
          rowOverflowsModal: Math.round(rRect.right) > Math.round(modalRect.right),
          unitInputRight: uInput ? Math.round(uInput.getBoundingClientRect().right) : null,
          unitOverflowsRow: uInput ? Math.round(uInput.getBoundingClientRect().right) > Math.round(rRect.right) : false,
          removeBtnRight: removeBtn ? Math.round(removeBtn.getBoundingClientRect().right) : null,
          removeBtnVisible: removeBtn ? Math.round(removeBtn.getBoundingClientRect().right) <= Math.round(rRect.right) : false
        };
      });

      return {
        viewportWidth: window.innerWidth,
        modalWidth: Math.round(modalRect.width),
        rows: rowData
      };
    });

    results.production[`mobile_${width}`] = modalCheck;

    if (width === 375) {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_output_fixed_mobile_375.png') });
    }
  }

  // 2B: Desktop 1280px Production Modal Check
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/pages/production.html`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    window.openProductionModal();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => {
    const pSel = document.getElementById('product-select');
    if (pSel && pSel.options.length > 1) {
      pSel.selectedIndex = 1;
      pSel.dispatchEvent(new Event('change'));
    }
    window.addFinishedProductRow();
  });
  await new Promise(r => setTimeout(r, 600));

  const desktopModalCheck = await page.evaluate(() => {
    const modal = document.querySelector('#production-modal .modal');
    const table = document.querySelector('.production-items-table');
    const rows = Array.from(document.querySelectorAll('.production-items-table tr.production-item-row'));
    return {
      modalWidth: Math.round(modal.getBoundingClientRect().width),
      tableWidth: Math.round(table.getBoundingClientRect().width),
      rowCount: rows.length,
      desktopHeaderVisible: window.getComputedStyle(document.querySelector('.production-items-table thead')).display !== 'none'
    };
  });

  results.production.desktop_1280 = desktopModalCheck;
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_output_desktop_1280.png') });

  console.log('\n================ TEST SUMMARY RESULTS ================');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})();
