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

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)').length > 0);
  await sleep(800);

  const culprits = await page.evaluate(() => {
    const wrap = document.querySelector('#purchases-table-wrap');
    const wrapWidth = wrap.clientWidth;

    const list = [];
    wrap.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      const w = el.offsetWidth;
      const sW = el.scrollWidth;
      if (w > wrapWidth || sW > wrapWidth) {
        list.push({
          tag: el.tagName,
          id: el.id,
          className: typeof el.className === 'string' ? el.className : '',
          offsetWidth: w,
          scrollWidth: sW,
          wrapWidth,
          style: el.getAttribute('style')
        });
      }
    });

    return { wrapWidth, wrapScroll: wrap.scrollWidth, list };
  });

  console.log('Mobile 390 culprits:', JSON.stringify(culprits, null, 2));

  await browser.close();
})();
