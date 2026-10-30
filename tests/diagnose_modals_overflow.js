const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';

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
    { name: 'tablet-1024', width: 1024, height: 768 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)');
      return rows.length > 0;
    });
    await sleep(500);

    // Click on P-07's View button or '+9 more' badge to open View Modal
    const modalOpened = await page.evaluate(() => {
      const moreBtn = document.querySelector('.purchase-more-badge');
      if (moreBtn) {
        moreBtn.click();
        return true;
      }
      const viewBtn = document.querySelector('.action-btn.view');
      if (viewBtn) {
        viewBtn.click();
        return true;
      }
      return false;
    });

    await sleep(500);

    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('#purchase-view-modal .modal');
      const modalBody = document.querySelector('#purchase-view-content');
      const tableWrap = document.querySelector('#purchase-view-content .table-wrap, #purchase-view-content div[style*="overflow"]');
      const table = document.querySelector('#purchase-view-content table');

      function getInfo(el, name) {
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

      const overflowingInModal = [];
      if (modal) {
        modal.querySelectorAll('*').forEach(el => {
          if (el.scrollWidth > el.clientWidth + 1) {
            overflowingInModal.push({
              tag: el.tagName,
              className: el.className,
              scrollW: el.scrollWidth,
              clientW: el.clientWidth,
              diff: el.scrollWidth - el.clientWidth
            });
          }
        });
      }

      return {
        modal: getInfo(modal, 'view-modal'),
        modalBody: getInfo(modalBody, 'view-modal-body'),
        tableWrap: getInfo(tableWrap, 'view-modal-table-wrap'),
        table: getInfo(table, 'view-modal-table'),
        overflowingInModal
      };
    });

    console.log(`\n=== View Modal at ${vp.name} (${vp.width}x${vp.height}) ===`);
    console.log('modal:', modalCheck.modal);
    console.log('modalBody:', modalCheck.modalBody);
    console.log('tableWrap:', modalCheck.tableWrap);
    console.log('table:', modalCheck.table);
    console.log('Overflowing in modal:', modalCheck.overflowingInModal);

    // Close view modal
    await page.evaluate(() => window.APP.closeModal('purchase-view-modal'));
    await sleep(300);

    // Test New Purchase Modal
    await page.evaluate(() => window.openAdd());
    await sleep(500);

    const addModalCheck = await page.evaluate(() => {
      const modal = document.querySelector('#purchase-modal .modal');
      const lineItemsWrap = document.querySelector('#purchase-modal .line-items-wrap');
      const lineTable = document.querySelector('#purchase-modal .line-items-table');

      function getInfo(el, name) {
        if (!el) return null;
        return {
          name,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          diff: el.scrollWidth - el.clientWidth,
          hasScroll: el.scrollWidth > el.clientWidth
        };
      }

      return {
        modal: getInfo(modal, 'add-modal'),
        lineItemsWrap: getInfo(lineItemsWrap, 'add-modal-line-items-wrap'),
        lineTable: getInfo(lineTable, 'add-modal-line-table')
      };
    });

    console.log(`Add Modal at ${vp.name}:`, addModalCheck);
    await page.evaluate(() => window.APP.closeModal('purchase-modal'));
    await sleep(300);
  }

  await browser.close();
})();
