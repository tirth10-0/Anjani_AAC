const puppeteer = require('puppeteer-core');
const path = require('path');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // 1. Authenticate session
  console.log('>>> Initializing login session...');
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

  // Navigate to Intercompany page
  console.log('>>> Navigating to Intercompany page...');
  await page.goto(`${BASE_URL}/pages/intercompany.html`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  console.log('=== Current Page Title:', await page.title());

  // Check table scroll widths
  const tableMetrics = await page.evaluate(() => {
    const tableWrap = document.querySelector('#transfers-view .table-wrap');
    const table = document.querySelector('#transfers-table');
    const doc = document.documentElement;
    return {
      docClientW: doc.clientWidth,
      docScrollW: doc.scrollWidth,
      tableWrapClientW: tableWrap ? tableWrap.clientWidth : 0,
      tableWrapScrollW: tableWrap ? tableWrap.scrollWidth : 0,
      tableClientW: table ? table.clientWidth : 0,
      tableScrollW: table ? table.scrollWidth : 0,
      hasOverflow: doc.scrollWidth > doc.clientWidth || (tableWrap && tableWrap.scrollWidth > tableWrap.clientWidth)
    };
  });
  console.log('Table Metrics at 1440px:', tableMetrics);

  // Click "+ New Transfer / Supply"
  console.log('Clicking New Transfer / Supply button...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Transfer / Supply'));
    if (btn) btn.click();
    else if (typeof openNewTransfer === 'function') openNewTransfer();
  });
  await sleep(1000);

  const modalState = await page.evaluate(() => {
    const modal = document.getElementById('transfer-modal');
    const fromCo = document.getElementById('tr-from-company');
    const toCo = document.getElementById('tr-to-company');
    const fromWh = document.getElementById('tr-from-warehouse');
    const toWh = document.getElementById('tr-to-warehouse');
    return {
      modalOpen: modal ? modal.classList.contains('active') : false,
      fromCoVal: fromCo ? fromCo.value : null,
      fromCoOptions: fromCo ? Array.from(fromCo.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })) : [],
      toCoVal: toCo ? toCo.value : null,
      toCoOptions: toCo ? Array.from(toCo.options).map(o => ({ value: o.value, text: o.text, selected: o.selected })) : [],
      fromWhVal: fromWh ? fromWh.value : null,
      fromWhOptions: fromWh ? Array.from(fromWh.options).map(o => ({ value: o.value, text: o.text })) : [],
      toWhVal: toWh ? toWh.value : null,
      toWhOptions: toWh ? Array.from(toWh.options).map(o => ({ value: o.value, text: o.text })) : []
    };
  });

  console.log('Modal State:', JSON.stringify(modalState, null, 2));

  await page.screenshot({ path: 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac/intercompany_modal_current.png' });
  console.log('Screenshot saved: intercompany_modal_current.png');

  await browser.close();
})();
