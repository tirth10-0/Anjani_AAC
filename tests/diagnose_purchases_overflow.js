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

  // Login once
  console.log('Logging in...');
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

    // Wait for purchases table
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)');
      return rows.length > 0;
    }, { timeout: 15000 });

    await sleep(800);

    const overflowInfo = await page.evaluate(() => {
      function check(el, label) {
        if (!el) return null;
        return {
          label,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          diff: el.scrollWidth - el.clientWidth,
          hasScroll: el.scrollWidth > el.clientWidth,
          overflowX: window.getComputedStyle(el).overflowX
        };
      }

      const tableWrap = document.querySelector('#purchases-table-wrap');
      const table = document.querySelector('#purchases-table');
      const mainContent = document.querySelector('.main-content');
      const pageBody = document.querySelector('.page-body');
      const html = document.documentElement;
      const body = document.body;

      const overflowing = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollWidth > el.clientWidth + 1) {
          const style = window.getComputedStyle(el);
          overflowing.push({
            tag: el.tagName,
            id: el.id,
            className: (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '',
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
            diff: el.scrollWidth - el.clientWidth,
            overflowX: style.overflowX
          });
        }
      });

      const ths = Array.from(document.querySelectorAll('#purchases-table th')).map(th => ({
        name: th.innerText.trim(),
        width: th.offsetWidth,
        scrollW: th.scrollWidth
      }));

      return {
        tableWrap: check(tableWrap, '#purchases-table-wrap'),
        table: check(table, '#purchases-table'),
        mainContent: check(mainContent, '.main-content'),
        pageBody: check(pageBody, '.page-body'),
        html: check(html, 'html'),
        body: check(body, 'body'),
        ths,
        overflowing
      };
    });

    console.log(`\n========================================`);
    console.log(`=== Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    console.log(`========================================`);
    console.log('tableWrap:', overflowInfo.tableWrap);
    console.log('table:', overflowInfo.table);
    console.log('mainContent:', overflowInfo.mainContent);
    console.log('html:', overflowInfo.html);
    console.log('Column widths (px):', overflowInfo.ths.map(t => `${t.name}: ${t.width}px`).join(' | '));
    console.log(`Total Overflowing elements: ${overflowInfo.overflowing.length}`);
    overflowInfo.overflowing.forEach(o => {
      console.log(`  -> <${o.tag} id="${o.id}" class="${o.className}"> scrollW=${o.scrollW}, clientW=${o.clientW}, diff=${o.diff}, overflowX=${o.overflowX}`);
    });
  }

  await browser.close();
})();
