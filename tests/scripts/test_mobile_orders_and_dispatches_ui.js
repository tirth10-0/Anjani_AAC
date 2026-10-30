const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('Starting Multi-Device Puppeteer Test...');
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

  // Helper to open Orders page
  async function loadOrdersPage(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.tabs', { timeout: 8000 });
    await page.waitForSelector('.order-summary-card', { timeout: 10000 }).catch(() => {});
    await sleep(1000);
  }

  // 2. Test 375px Orders Summary Tab
  console.log('Step 2: Testing 375px Orders Summary...');
  await loadOrdersPage(375, 812);

  const tabMetrics375 = await page.evaluate(() => {
    const tabsContainer = document.querySelector('.tabs');
    const tabBtns = Array.from(document.querySelectorAll('.tabs .tab-btn'));
    const containerBox = tabsContainer.getBoundingClientRect();
    const btnBoxes = tabBtns.map(b => ({
      text: b.textContent.trim(),
      width: b.getBoundingClientRect().width,
      height: b.getBoundingClientRect().height,
      left: b.getBoundingClientRect().left,
      right: b.getBoundingClientRect().right
    }));
    const actionsBox = document.querySelector('.order-summary-card-actions');
    const actionBtns = actionsBox ? Array.from(actionsBox.querySelectorAll('.order-card-btn')).map(b => ({
      text: b.textContent.trim(),
      width: b.getBoundingClientRect().width,
      height: b.getBoundingClientRect().height,
      top: b.getBoundingClientRect().top
    })) : [];

    return {
      windowWidth: window.innerWidth,
      containerWidth: containerBox.width,
      btnBoxes,
      actionBtns
    };
  });
  console.log('375px Tab Metrics:', JSON.stringify(tabMetrics375, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'orders_tabs_mobile_375.png') });

  // 3. Test 390px Orders Summary Tab
  console.log('Step 3: Testing 390px Orders Summary...');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await sleep(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'orders_tabs_mobile_390.png') });

  // 4. Test Dispatches & Gate Passes Tab on 390px
  console.log('Step 4: Testing 390px Dispatches & Gate Passes tab...');
  await page.evaluate(() => {
    const dispTab = Array.from(document.querySelectorAll('.tabs .tab-btn')).find(b => b.textContent.includes('Dispatches'));
    if (dispTab) dispTab.click();
  });
  await sleep(1200);

  const dispatchMetrics390 = await page.evaluate(() => {
    const card = document.querySelector('.dispatch-record-card');
    const actions = document.querySelector('.dispatch-card-actions');
    const actionBtns = actions ? Array.from(actions.querySelectorAll('.order-card-btn, .btn')).map(b => ({
      text: b.textContent.trim(),
      width: b.getBoundingClientRect().width,
      height: b.getBoundingClientRect().height,
      top: b.getBoundingClientRect().top
    })) : [];
    const bottomNav = document.querySelector('.mobile-bottom-nav');
    const bottomNavTop = bottomNav ? bottomNav.getBoundingClientRect().top : 9999;
    const lastActionBottom = actions ? actions.getBoundingClientRect().bottom : 0;

    return {
      cardWidth: card ? card.getBoundingClientRect().width : 0,
      windowWidth: window.innerWidth,
      actionBtns,
      bottomNavTop,
      lastActionBottom,
      clearsBottomNav: lastActionBottom < bottomNavTop
    };
  });
  console.log('390px Dispatches Metrics:', JSON.stringify(dispatchMetrics390, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'orders_dispatches_tab_mobile_390.png') });

  // 5. Test View Commercial Invoice modal on 375px and 390px
  console.log('Step 5: Testing Commercial Invoice Modal on 375px...');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
  await sleep(500);

  // Trigger view invoice
  await page.evaluate(async () => {
    const d = (window.allDispatches && window.allDispatches[0]) || (window.DISPATCH_UI && window.DISPATCH_UI.getAllDispatches()[0]);
    if (d) {
      await window.DISPATCH_UI.viewGeneratedInvoice(d.id);
    } else {
      // Find a button with viewGeneratedInvoice
      const btn = document.querySelector('button[onclick*="viewGeneratedInvoice"]');
      if (btn) btn.click();
    }
  });
  await sleep(1500);

  const invoiceMetrics375 = await page.evaluate(() => {
    const modal = document.querySelector('#view-invoice-modal .modal');
    const header = document.querySelector('#view-invoice-modal .doc-modal-header');
    const body = document.querySelector('#view-invoice-content');
    const footer = document.querySelector('#view-invoice-footer');
    const paper = document.querySelector('#view-invoice-paper');
    const wrapper = document.querySelector('.doc-scale-wrapper');
    const footerBtns = footer ? Array.from(footer.querySelectorAll('button, a')).map(b => ({
      text: b.textContent.trim(),
      width: b.getBoundingClientRect().width,
      height: b.getBoundingClientRect().height,
      top: b.getBoundingClientRect().top
    })) : [];

    return {
      windowWidth: window.innerWidth,
      modalBox: modal ? { width: modal.getBoundingClientRect().width, height: modal.getBoundingClientRect().height } : null,
      headerBox: header ? { height: header.getBoundingClientRect().height } : null,
      bodyBox: body ? { width: body.clientWidth, height: body.clientHeight, scrollHeight: body.scrollHeight } : null,
      footerBox: footer ? { height: footer.getBoundingClientRect().height, top: footer.getBoundingClientRect().top } : null,
      wrapperBox: wrapper ? { width: wrapper.getBoundingClientRect().width, height: wrapper.getBoundingClientRect().height } : null,
      paperTransform: paper ? paper.style.transform : '',
      footerBtns
    };
  });
  console.log('375px Invoice Modal Metrics:', JSON.stringify(invoiceMetrics375, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'invoice_modal_mobile_375.png') });

  // 6. Test Invoice modal on 390px
  console.log('Step 6: Testing Commercial Invoice Modal on 390px...');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await sleep(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'invoice_modal_mobile_390.png') });

  // 7. Test WhatsApp Invoice Sharing
  console.log('Step 7: Testing WhatsApp Invoice Sharing Button...');
  const whatsappTestResult = await page.evaluate(() => {
    let interceptedUrl = null;
    const originalOpen = window.open;
    window.open = function(url, target) {
      interceptedUrl = url;
      return null;
    };

    const waBtn = document.querySelector('#view-invoice-footer .btn-whatsapp');
    if (waBtn) {
      waBtn.click();
    } else {
      window.DISPATCH_UI.sendInvoiceWhatsApp();
    }

    window.open = originalOpen;
    return {
      interceptedUrl,
      decodedUrl: interceptedUrl ? decodeURIComponent(interceptedUrl) : null
    };
  });
  console.log('WhatsApp Share Test Result:', JSON.stringify(whatsappTestResult, null, 2));

  // Close invoice modal
  await page.evaluate(() => APP.closeModal('view-invoice-modal'));
  await sleep(600);

  // 8. Test Commercial Dispatch Slip modal on 390px
  console.log('Step 8: Testing Commercial Dispatch Slip Modal on 390px...');
  await page.evaluate(async () => {
    const d = (window.allDispatches && window.allDispatches[0]) || (window.DISPATCH_UI && window.DISPATCH_UI.getAllDispatches()[0]);
    if (d) {
      await window.DISPATCH_UI.viewDispatch(d.id);
    }
  });
  await sleep(1200);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dispatch_slip_modal_mobile_390.png') });

  // Close dispatch modal
  await page.evaluate(() => APP.closeModal('view-dispatch-modal'));
  await sleep(600);

  // 9. Test 768px Tablet (Invoice modal & layout)
  console.log('Step 9: Testing 768px Tablet...');
  await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });
  await page.evaluate(async () => {
    const d = (window.allDispatches && window.allDispatches[0]) || (window.DISPATCH_UI && window.DISPATCH_UI.getAllDispatches()[0]);
    if (d) await window.DISPATCH_UI.viewGeneratedInvoice(d.id);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'invoice_modal_tablet_768.png') });
  await page.evaluate(() => APP.closeModal('view-invoice-modal'));
  await sleep(500);

  // 10. Test Desktop 1280px & 1440px
  console.log('Step 10: Testing Desktop 1280px...');
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluate(async () => {
    const d = (window.allDispatches && window.allDispatches[0]) || (window.DISPATCH_UI && window.DISPATCH_UI.getAllDispatches()[0]);
    if (d) await window.DISPATCH_UI.viewGeneratedInvoice(d.id);
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'invoice_modal_desktop_1280.png') });
  await page.evaluate(() => APP.closeModal('view-invoice-modal'));
  await sleep(500);

  console.log('Step 11: Testing Desktop 1440px...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  // Switch back to Orders Summary tab
  await page.evaluate(() => {
    const ordTab = Array.from(document.querySelectorAll('.tabs .tab-btn')).find(b => b.textContent.includes('Orders'));
    if (ordTab) ordTab.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'orders_desktop_1440.png') });

  await browser.close();
  console.log('All browser verification tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
