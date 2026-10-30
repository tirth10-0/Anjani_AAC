const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🚀 Starting Global ERP Modal & Mobile Viewport Verification Tests...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // 1. Authenticate
  console.log('Step 1: Authenticating test user...');
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

  const viewports = [
    { name: 'mobile_375', width: 375, height: 667 },
    { name: 'mobile_390', width: 390, height: 844 },
    { name: 'mobile_430', width: 430, height: 932 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'desktop_1280', width: 1280, height: 800 }
  ];

  // 2. Test Production Modal across viewports
  console.log('\n--- TEST SUITE 1: Record Production Modal Viewport Fit ---');
  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/production.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // Open Production Modal
    await page.evaluate(() => {
      if (typeof window.openNewBatchModal === 'function') {
        window.openNewBatchModal();
      } else if (window.APP && window.APP.openModal) {
        window.APP.openModal('production-modal');
      }
    });
    await sleep(600);

    const modalMetrics = await page.evaluate((vpHeight) => {
      const modal = document.querySelector('#production-modal .modal');
      const header = document.querySelector('#production-modal .prod-modal-header');
      const footer = document.querySelector('#production-modal .prod-modal-footer');
      const body = document.querySelector('#production-modal .prod-modal-body');
      const overlay = document.getElementById('production-modal');

      if (!modal) return { error: 'Modal not found' };

      const mRect = modal.getBoundingClientRect();
      const hRect = header ? header.getBoundingClientRect() : null;
      const fRect = footer ? footer.getBoundingClientRect() : null;

      return {
        modal: { top: mRect.top, bottom: mRect.bottom, height: mRect.height },
        header: hRect ? { top: hRect.top, bottom: hRect.bottom } : null,
        footer: fRect ? { top: fRect.top, bottom: fRect.bottom } : null,
        bodyScrollable: body ? (body.scrollHeight > body.clientHeight) : false,
        fitsInViewport: mRect.top >= 0 && mRect.bottom <= vpHeight + 2, // 2px margin for rounding
        isHeaderVisible: hRect && hRect.top >= 0,
        isFooterVisible: fRect && fRect.bottom <= vpHeight + 2
      };
    }, vp.height);

    console.log(`[${vp.name} (${vp.width}x${vp.height})] Production Modal:`, {
      top: Math.round(modalMetrics.modal.top),
      bottom: Math.round(modalMetrics.modal.bottom),
      height: Math.round(modalMetrics.modal.height),
      fitsInViewport: modalMetrics.fitsInViewport,
      headerVisible: modalMetrics.isHeaderVisible,
      footerVisible: modalMetrics.isFooterVisible
    });

    if (!modalMetrics.fitsInViewport) {
      console.error(`❌ FAIL: Production modal exceeded viewport on ${vp.name}!`);
    } else {
      console.log(`✅ PASS: Production modal fits strictly within viewport on ${vp.name}`);
    }

    if (vp.name === 'mobile_390') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'production_modal_fixed_mobile_390.png')
      });
    }
  }

  // 3. Test Commercial Invoice & Dispatch Slip Modals on Orders page
  console.log('\n--- TEST SUITE 2: Commercial Invoice & Dispatch Slip Modals ---');
  for (const vp of [viewports[0], viewports[1], viewports[4]]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // Mock an invoice document and view it
    await page.evaluate(() => {
      const content = document.getElementById('view-invoice-content');
      if (content) {
        content.innerHTML = `
          <div id="view-invoice-paper" style="width:794px; min-height:1123px; padding:20px; background:#fff; margin:0 auto; box-sizing:border-box;">
            <h2>Commercial Tax Invoice</h2>
            <p>Invoice No: <span id="p-inv-num-view">INV-01</span></p>
            <table style="width:100%; border-collapse:collapse;">
              <tr><th>Item</th><th>Qty</th><th>Total</th></tr>
              <tr><td>Crop Tonic 500ml</td><td>100</td><td>₹28,000</td></tr>
            </table>
          </div>
        `;
      }
      if (window.APP && window.APP.openModal) {
        window.APP.openModal('view-invoice-modal');
      }
      if (window.DISPATCH_UI && window.DISPATCH_UI.applyDocMobileScaling) {
        window.DISPATCH_UI.applyDocMobileScaling('view-invoice-paper', 'view-invoice-content');
      }
    });
    await sleep(600);

    const invMetrics = await page.evaluate((vpHeight) => {
      const modal = document.querySelector('#view-invoice-modal .modal');
      const header = document.querySelector('#view-invoice-modal .doc-modal-header');
      const footer = document.querySelector('#view-invoice-modal .doc-modal-footer');
      const closeBtnInFooter = document.querySelector('#view-invoice-footer .doc-btn-close');
      const waBtn = document.querySelector('#view-invoice-footer .btn-whatsapp');

      const mRect = modal ? modal.getBoundingClientRect() : null;
      const hRect = header ? header.getBoundingClientRect() : null;
      const fRect = footer ? footer.getBoundingClientRect() : null;

      let waColor = null;
      let waBg = null;
      if (waBtn) {
        const cs = window.getComputedStyle(waBtn);
        waColor = cs.color;
        waBg = cs.backgroundColor;
      }

      return {
        hasDuplicateClose: !!closeBtnInFooter,
        waBtnBg: waBg,
        waBtnColor: waColor,
        fitsInViewport: mRect ? (mRect.top >= 0 && mRect.bottom <= vpHeight + 2) : false,
        top: mRect ? Math.round(mRect.top) : null,
        bottom: mRect ? Math.round(mRect.bottom) : null
      };
    }, vp.height);

    console.log(`[${vp.name}] Commercial Invoice Modal:`, invMetrics);

    if (invMetrics.hasDuplicateClose) {
      console.error(`❌ FAIL: Duplicate close button still exists in invoice footer on ${vp.name}!`);
    } else {
      console.log(`✅ PASS: No duplicate close button in invoice footer on ${vp.name}`);
    }

    if (!invMetrics.fitsInViewport) {
      console.error(`❌ FAIL: Commercial Invoice modal exceeded viewport on ${vp.name}!`);
    } else {
      console.log(`✅ PASS: Commercial Invoice modal fits strictly within viewport on ${vp.name}`);
    }

    if (vp.name === 'mobile_390') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'commercial_invoice_modal_fixed_mobile_390.png')
      });
    }

    // Now test Dispatch Slip Modal
    await page.evaluate(() => {
      if (window.APP && window.APP.closeModal) window.APP.closeModal('view-invoice-modal');
      if (window.APP && window.APP.openModal) window.APP.openModal('view-dispatch-modal');
    });
    await sleep(600);

    const dispMetrics = await page.evaluate((vpHeight) => {
      const modal = document.querySelector('#view-dispatch-modal .modal');
      const closeBtnInFooter = document.querySelector('#view-dispatch-footer .doc-btn-close');
      const mRect = modal ? modal.getBoundingClientRect() : null;

      return {
        hasDuplicateClose: !!closeBtnInFooter,
        fitsInViewport: mRect ? (mRect.top >= 0 && mRect.bottom <= vpHeight + 2) : false,
        top: mRect ? Math.round(mRect.top) : null,
        bottom: mRect ? Math.round(mRect.bottom) : null
      };
    }, vp.height);

    console.log(`[${vp.name}] Dispatch Slip Modal:`, dispMetrics);

    if (dispMetrics.hasDuplicateClose) {
      console.error(`❌ FAIL: Duplicate close button still exists in dispatch slip footer on ${vp.name}!`);
    } else {
      console.log(`✅ PASS: No duplicate close button in dispatch slip footer on ${vp.name}`);
    }

    if (!dispMetrics.fitsInViewport) {
      console.error(`❌ FAIL: Dispatch Slip modal exceeded viewport on ${vp.name}!`);
    } else {
      console.log(`✅ PASS: Dispatch Slip modal fits strictly within viewport on ${vp.name}`);
    }

    if (vp.name === 'mobile_390') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'dispatch_slip_modal_fixed_mobile_390.png')
      });
    }
  }

  // 4. Test WhatsApp Share filename & payload logic
  console.log('\n--- TEST SUITE 3: WhatsApp Sharing Filename & Clean Payload ---');
  const waTestResult = await page.evaluate(() => {
    let capturedFilename = null;
    let capturedSharePayload = null;
    let toastMessages = [];

    // Spy on APP.showToast
    const origToast = window.APP.showToast;
    window.APP.showToast = (msg, type) => {
      toastMessages.push({ msg, type });
      if (origToast) origToast(msg, type);
    };

    // Mock Web Share API on navigator with Object.defineProperty
    Object.defineProperty(navigator, 'canShare', {
      value: (data) => true,
      configurable: true
    });
    Object.defineProperty(navigator, 'share', {
      value: async (payload) => {
        capturedSharePayload = payload;
        if (payload && payload.files && payload.files[0]) {
          capturedFilename = payload.files[0].name;
        }
        return Promise.resolve();
      },
      configurable: true
    });

    // Set complete mock document matching invoiceDoc structure
    window.currentViewInvoiceDoc = {
      InvoiceNumber: 'INV-01',
      InvoiceType: 'GST',
      customer: { name: 'Shree Ram Agro', contact: '9876543210' },
      business: { company: 'Anjani Agri Care', gstin: '24AERFS1718Q1ZB' },
      rows: []
    };

    // Execute sendInvoiceWhatsApp
    window.DISPATCH_UI.sendInvoiceWhatsApp();

    return {
      capturedFilename,
      capturedSharePayload,
      toastMessages
    };
  });

  console.log('WhatsApp Share Test Results:', waTestResult);
  if (waTestResult.capturedFilename === 'Invoice_01.pdf') {
    console.log('✅ PASS: WhatsApp PDF filename correctly standardized to Invoice_01.pdf (NOT Invoice_INV-01.pdf)');
  } else {
    console.error(`❌ FAIL: Expected Invoice_01.pdf, got: ${waTestResult.capturedFilename}`);
  }

  if (waTestResult.capturedSharePayload && !waTestResult.capturedSharePayload.text) {
    console.log('✅ PASS: WhatsApp share payload has NO unwanted prefilled bank/customer text');
  } else {
    console.error(`❌ FAIL: WhatsApp share payload contains unwanted text:`, waTestResult.capturedSharePayload?.text);
  }

  // 5. Test Warehouse Badge Text Wrapping in Dispatches
  console.log('\n--- TEST SUITE 4: Warehouse Label Overflow in Dispatch Cards ---');
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
  await sleep(800);

  // Switch to Dispatches & Gate Passes tab
  await page.evaluate(() => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="Dispatches"]') || document.getElementById('tab-btn-dispatches');
    if (tabBtn) tabBtn.click();
    const dispWrap = document.getElementById('dispatches-table-wrap');
    if (dispWrap) dispWrap.style.display = 'block';
  });
  await sleep(600);

  // Inject a mock godown dispatch card to test extreme text wrapping
  const badgeWrapResult = await page.evaluate(() => {
    const container = document.getElementById('dispatches-cards-container');
    if (!container) return { error: 'dispatches-cards-container not found' };

    const mockCard = document.createElement('div');
    mockCard.className = 'dispatch-record-card';
    mockCard.innerHTML = `
      <div class="dispatch-card-header">
        <span class="dispatch-card-slip-no">DSP-TEST-001</span>
      </div>
      <div class="dispatch-card-order-row">
        <div style="grid-column: 1 / -1; margin-top: 4px; min-width: 0; max-width: 100%;">
          <span class="badge dispatch-godown-badge" style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;border:1px solid #bae6fd;">
            🏢 Stocking into Godown: Gas Godown (WH-AAC-GAS) - Long Warehouse Name That Must Not Overflow
          </span>
        </div>
      </div>
    `;
    container.prepend(mockCard);

    const cardRect = mockCard.getBoundingClientRect();
    const badge = mockCard.querySelector('.dispatch-godown-badge');
    const badgeRect = badge.getBoundingClientRect();

    return {
      cardWidth: Math.round(cardRect.width),
      cardRight: Math.round(cardRect.right),
      badgeWidth: Math.round(badgeRect.width),
      badgeRight: Math.round(badgeRect.right),
      badgeOverflows: badgeRect.right > cardRect.right + 1, // 1px rounding tolerance
      badgeWrapped: badgeRect.height > 20 // Wrapped onto 2+ lines
    };
  });

  console.log('Warehouse Badge Wrapping Result:', badgeWrapResult);
  if (!badgeWrapResult.badgeOverflows) {
    console.log('✅ PASS: Warehouse badge stays strictly inside dispatch card boundaries without horizontal overflow');
  } else {
    console.error('❌ FAIL: Warehouse badge overflows dispatch card right boundary!');
  }

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'dispatch_card_warehouse_badge_mobile_375.png')
  });

  console.log('\n🎉 ALL TESTS COMPLETED.');
  await browser.close();
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
