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

    // Click the first .action-btn.view
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.action-btn.view');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      console.log(`Could not find .action-btn.view at ${vp.name}`);
      continue;
    }

    await page.waitForFunction(() => {
      const modal = document.querySelector('#purchase-view-modal');
      return modal && modal.classList.contains('active');
    }, { timeout: 5000 });

    await sleep(400);

    const detailModalCheck = await page.evaluate(() => {
      const modal = document.querySelector('#purchase-view-modal .modal');
      const body = document.querySelector('#purchase-view-content');
      const table = document.querySelector('#purchase-view-content table');
      const tableParent = table ? table.parentElement : null;

      function check(el, name) {
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

      const overflowing = [];
      if (modal) {
        modal.querySelectorAll('*').forEach(el => {
          if (el.scrollWidth > el.clientWidth + 1) {
            overflowing.push({
              tag: el.tagName,
              className: el.className,
              scrollW: el.scrollWidth,
              clientW: el.clientWidth,
              diff: el.scrollWidth - el.clientWidth,
              overflowX: window.getComputedStyle(el).overflowX
            });
          }
        });
      }

      return {
        modal: check(modal, 'modal'),
        body: check(body, 'body'),
        tableParent: check(tableParent, 'tableParent'),
        table: check(table, 'table'),
        overflowing
      };
    });

    console.log(`\n=== View Modal at ${vp.name} (${vp.width}x${vp.height}) ===`);
    console.log('modal:', detailModalCheck.modal);
    console.log('tableParent:', detailModalCheck.tableParent);
    console.log('table:', detailModalCheck.table);
    console.log('overflowing count:', detailModalCheck.overflowing.length);
    detailModalCheck.overflowing.forEach(o => {
      console.log(`  -> <${o.tag} class="${o.className}"> scrollW=${o.scrollW}, clientW=${o.clientW}, diff=${o.diff}, overflowX=${o.overflowX}`);
    });

    await page.evaluate(() => window.APP.closeModal('purchase-view-modal'));
    await sleep(300);
  }

  await browser.close();
})();
