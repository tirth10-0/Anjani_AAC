const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const path = require('path');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Login
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

  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)').length > 0);
    await sleep(800);

    // Open detail modal for P-07 (first row with 11 items)
    await page.evaluate(() => {
      const moreBtn = document.querySelector('.purchase-more-badge');
      if (moreBtn) {
        moreBtn.click();
      } else {
        const viewBtn = document.querySelector('.action-btn.view');
        if (viewBtn) viewBtn.click();
      }
    });

    await page.waitForFunction(() => {
      const modal = document.querySelector('#purchase-view-modal');
      return modal && modal.classList.contains('open');
    }, { timeout: 5000 });

    await sleep(600);

    const overflowCheck = await page.evaluate(() => {
      const modal = document.querySelector('#purchase-view-modal .modal');
      const table = document.querySelector('#purchase-detail-items-table');
      const tableWrap = document.querySelector('.purchase-detail-table-wrap');

      function get(el, name) {
        if (!el) return null;
        return {
          name,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          diff: el.scrollWidth - el.clientWidth,
          hasScroll: el.scrollWidth > el.clientWidth,
          overflowX: window.getComputedStyle(el).overflowX
        };
      }

      return {
        modal: get(modal, 'modal'),
        table: get(table, 'table'),
        tableWrap: get(tableWrap, 'tableWrap')
      };
    });

    console.log(`\n=== Detail Modal at ${vp.name} ===`);
    console.log('modal:', overflowCheck.modal);
    console.log('tableWrap:', overflowCheck.tableWrap);
    console.log('table:', overflowCheck.table);

    const shotPath = path.join(ARTIFACTS_DIR, `purchase_detail_modal_${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`Saved screenshot: ${shotPath}`);

    // Close modal
    await page.evaluate(() => window.APP.closeModal('purchase-view-modal'));
    await sleep(300);
  }

  await browser.close();
})();
