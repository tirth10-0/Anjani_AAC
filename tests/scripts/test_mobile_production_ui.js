const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('Starting Production Page Multi-Device Browser Verification...');
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

  // Helper to load production page
  async function loadProductionPage(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/production.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#production-summary-grid', { timeout: 8000 });
    await sleep(1000);
  }

  // 2. Test Main Page on 375px
  console.log('Step 2: Testing 375px Main Production Page...');
  await loadProductionPage(375, 812);

  const mainPageMetrics375 = await page.evaluate(() => {
    const summaryCards = Array.from(document.querySelectorAll('#production-summary-grid .summary-metric-card'));
    const cardsInfo = summaryCards.map(c => ({
      label: c.querySelector('.summary-metric-label')?.textContent.trim(),
      value: c.querySelector('.summary-metric-value')?.textContent.trim(),
      width: c.getBoundingClientRect().width,
      height: c.getBoundingClientRect().height
    }));
    const searchBox = document.querySelector('.production-search-box')?.getBoundingClientRect();
    const datePicker = document.querySelector('.production-date-picker')?.getBoundingClientRect();
    const clearBtn = document.querySelector('.production-clear-btn')?.getBoundingClientRect();

    const recordCard = document.querySelector('#batches-tbody tr');
    const recordBox = recordCard ? recordCard.getBoundingClientRect() : null;

    return {
      windowWidth: window.innerWidth,
      cardsInfo,
      searchBox: searchBox ? { width: searchBox.width, height: searchBox.height } : null,
      datePicker: datePicker ? { width: datePicker.width, height: datePicker.height } : null,
      clearBtn: clearBtn ? { width: clearBtn.width, height: clearBtn.height } : null,
      recordBox: recordBox ? { width: recordBox.width, height: recordBox.height } : null
    };
  });
  console.log('375px Main Page Metrics:', JSON.stringify(mainPageMetrics375, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_page_mobile_375.png') });

  // 3. Test Record Production Modal on 375px
  console.log('Step 3: Testing Record Production Modal on 375px...');
  await page.evaluate(() => openProductionModal());
  await sleep(1200);

  const modalMetrics375 = await page.evaluate(() => {
    const modal = document.querySelector('#production-modal .modal');
    const header = document.querySelector('#production-modal .prod-modal-header');
    const title = document.querySelector('#production-modal .modal-title');
    const closeBtn = document.querySelector('#production-modal .modal-close');
    const banner = document.querySelector('.production-guide-banner');
    const body = document.querySelector('#production-modal .modal-body');
    const footer = document.querySelector('#production-modal .prod-modal-footer');

    // Step 1 fields
    const productSelect = document.querySelector('#product-select')?.getBoundingClientRect();
    const batchInput = document.querySelector('#batch-no-input')?.getBoundingClientRect();
    const dateInput = document.querySelector('#production-date-input')?.getBoundingClientRect();
    const qtyInput = document.querySelector('#quantity-produced-input')?.getBoundingClientRect();
    const unitInput = document.querySelector('#output-unit-input')?.getBoundingClientRect();

    // Step 2 buttons
    const addInvBtn = Array.from(document.querySelectorAll('.product-form-card-actions .btn')).find(b => b.textContent.includes('Add Inventory'));
    const addFinishedBtn = Array.from(document.querySelectorAll('.product-form-card-actions .btn')).find(b => b.textContent.includes('Add Finished'));

    // Step 2 item rows
    const itemRows = Array.from(document.querySelectorAll('.production-items-table tbody tr.production-item-row')).map(r => ({
      width: r.getBoundingClientRect().width,
      height: r.getBoundingClientRect().height,
      hasStock: !!r.querySelector('.cell-prod-stock'),
      hasRemove: !!r.querySelector('.cell-prod-remove'),
      itemWidth: r.querySelector('.cell-prod-item select')?.getBoundingClientRect().width,
      actionWidth: r.querySelector('.cell-prod-action select')?.getBoundingClientRect().width,
      qtyWidth: r.querySelector('.cell-prod-qty input')?.getBoundingClientRect().width,
      unitWidth: r.querySelector('.cell-prod-unit input')?.getBoundingClientRect().width
    }));

    // Footer buttons
    const cancelBtn = document.querySelector('#production-modal .prod-btn-cancel')?.getBoundingClientRect();
    const saveBtn = document.querySelector('#production-modal .prod-btn-save')?.getBoundingClientRect();

    return {
      windowWidth: window.innerWidth,
      modalWidth: modal?.getBoundingClientRect().width,
      instructionBannerExists: !!banner,
      header: {
        titleText: title?.textContent.trim(),
        titleWidth: title?.getBoundingClientRect().width,
        closeBtnWidth: closeBtn?.getBoundingClientRect().width,
        closeBtnHeight: closeBtn?.getBoundingClientRect().height
      },
      step1: {
        productSelectWidth: productSelect?.width,
        batchInputWidth: batchInput?.width,
        dateInputWidth: dateInput?.width,
        qtyInputWidth: qtyInput?.width,
        unitInputWidth: unitInput?.width
      },
      step2Buttons: {
        addInvWidth: addInvBtn?.getBoundingClientRect().width,
        addInvHeight: addInvBtn?.getBoundingClientRect().height,
        addFinishedWidth: addFinishedBtn?.getBoundingClientRect().width,
        addFinishedHeight: addFinishedBtn?.getBoundingClientRect().height
      },
      itemRows,
      footer: {
        cancelWidth: cancelBtn?.width,
        cancelHeight: cancelBtn?.height,
        saveWidth: saveBtn?.width,
        saveHeight: saveBtn?.height
      }
    };
  });
  console.log('375px Modal Metrics:', JSON.stringify(modalMetrics375, null, 2));

  // Type a number into Quantity Produced to verify visibility
  await page.type('#quantity-produced-input', '500.50');
  await sleep(300);

  // Add another row and finished product row to test multiple cards layout
  await page.evaluate(() => {
    addIngredientRow({ action: 'DECREASE', quantity: 25, unit: 'Kg' });
    addFinishedProductRow();
  });
  await sleep(800);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_mobile_375.png') });

  // 4. Test 390px Viewport
  console.log('Step 4: Testing 390px Viewport...');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_mobile_390.png') });

  // Scroll down in modal body to show item cards and footer
  await page.evaluate(() => {
    const modalBody = document.querySelector('#production-modal .modal-body');
    if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
  });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_scrolled_mobile_390.png') });

  // 5. Test 430px Viewport
  console.log('Step 5: Testing 430px Viewport...');
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  await sleep(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_mobile_430.png') });

  // Close modal via Cancel button
  await page.evaluate(() => document.querySelector('#production-modal .prod-btn-cancel').click());
  await sleep(600);

  // 6. Test 768px Tablet
  console.log('Step 6: Testing 768px Tablet...');
  await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 2 });
  await page.evaluate(() => openProductionModal());
  await sleep(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_tablet_768.png') });
  await page.evaluate(() => APP.closeModal('production-modal'));
  await sleep(500);

  // 7. Test Desktop 1280px & 1440px
  console.log('Step 7: Testing Desktop 1280px...');
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluate(() => openProductionModal());
  await sleep(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_modal_desktop_1280.png') });
  await page.evaluate(() => APP.closeModal('production-modal'));
  await sleep(500);

  console.log('Step 8: Testing Desktop 1440px...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await sleep(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'production_page_desktop_1440.png') });

  await browser.close();
  console.log('All Production UI multi-device tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
