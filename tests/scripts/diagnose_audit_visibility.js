const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';

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
    await window.dbClient.auth.signInWithPassword({ email: 'admin@anjani.test', password: 'Test@Agro2026!' });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Desktop test
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${BASE_URL}/pages/audit-logs.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const desktopInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('#audit-tbody tr');
    const totalInfo = document.getElementById('audit-total-info')?.textContent;
    const allLogsLen = window.allAuditLogs ? window.allAuditLogs.length : 'undefined';
    const desktopRowsVisible = Array.from(rows).filter(r => window.getComputedStyle(r).display !== 'none').length;
    const mobileRowsVisible = Array.from(document.querySelectorAll('.audit-mobile-row')).filter(r => window.getComputedStyle(r).display !== 'none').length;
    return {
      allLogsLen,
      totalInfo,
      totalRows: rows.length,
      desktopRowsVisible,
      mobileRowsVisible,
      firstRowHtml: rows[0] ? rows[0].outerHTML.slice(0, 300) : null
    };
  });
  console.log('Desktop audit page info:', desktopInfo);

  // 2. Mobile test
  await page.setViewport({ width: 375, height: 750, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/pages/audit-logs.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  const mobileInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('#audit-tbody tr');
    const totalInfo = document.getElementById('audit-total-info')?.textContent;
    const allLogsLen = window.allAuditLogs ? window.allAuditLogs.length : 'undefined';
    const desktopRowsVisible = Array.from(document.querySelectorAll('.audit-desktop-row')).filter(r => window.getComputedStyle(r).display !== 'none').length;
    const mobileRowsVisible = Array.from(document.querySelectorAll('.audit-mobile-row')).filter(r => window.getComputedStyle(r).display !== 'none').length;
    const tableWrap = document.getElementById('audit-table-wrap');
    const table = document.getElementById('audit-table');
    const tbody = document.getElementById('audit-tbody');
    return {
      allLogsLen,
      totalInfo,
      totalRows: rows.length,
      desktopRowsVisible,
      mobileRowsVisible,
      tableWrapDisplay: tableWrap ? window.getComputedStyle(tableWrap).display : null,
      tableDisplay: table ? window.getComputedStyle(table).display : null,
      tbodyDisplay: tbody ? window.getComputedStyle(tbody).display : null,
      firstRowHtml: rows[0] ? rows[0].outerHTML.slice(0, 300) : null
    };
  });
  console.log('Mobile audit page info:', mobileInfo);

  await browser.close();
})();
