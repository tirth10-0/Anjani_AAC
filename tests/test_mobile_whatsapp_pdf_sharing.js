const puppeteer = require('puppeteer-core');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('======================================================================');
  console.log('🚀 Starting Verification: Mobile WhatsApp PDF Sharing & Clean Flow');
  console.log('======================================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors']
  });

  try {
    // ------------------------------------------------------------------
    // Part 1: Filename Formatting Assertions
    // ------------------------------------------------------------------
    console.log('--- 1. Testing Standardized Filenames (getStandardInvoicePdfFilename) ---');
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/Invoice%20Builder/index.html`, { waitUntil: 'networkidle2' });

    const filenameTests = await page.evaluate(() => {
      const fn = window.getStandardInvoicePdfFilename;
      return {
        reg1: fn(1, false),
        reg2: fn(2, false),
        reg10: fn(10, false),
        reg104: fn(104, false),
        disp1: fn(1, true),
        disp2: fn('INV-02', true),
        disp10: fn('INV-10', true),
        disp104: fn(104, true)
      };
    });

    console.log('  Filename Test Results:', JSON.stringify(filenameTests, null, 2));
    assert.strictEqual(filenameTests.reg1, 'Invoice_01.pdf');
    assert.strictEqual(filenameTests.reg2, 'Invoice_02.pdf');
    assert.strictEqual(filenameTests.reg10, 'Invoice_10.pdf');
    assert.strictEqual(filenameTests.reg104, 'Invoice_104.pdf');
    assert.strictEqual(filenameTests.disp1, 'INV_01.pdf');
    assert.strictEqual(filenameTests.disp2, 'INV_02.pdf');
    assert.strictEqual(filenameTests.disp10, 'INV_10.pdf');
    assert.strictEqual(filenameTests.disp104, 'INV_104.pdf');
    console.log('  ✓ Standard filename rules verified.\n');

    // ------------------------------------------------------------------
    // Part 2: Mobile Viewport (390px) Invoice Builder Sharing
    // ------------------------------------------------------------------
    console.log('--- 2. Testing Mobile Invoice Builder WhatsApp Sharing (390px) ---');
    const mobilePage = await browser.newPage();
    await mobilePage.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36');
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePage.goto(`${BASE_URL}/Invoice%20Builder/index.html`, { waitUntil: 'networkidle2' });

    // Verify WhatsApp button on mobile bottom tabs
    const mobWhatsAppBtn = await mobilePage.$('#mob-whatsapp-btn');
    assert.ok(mobWhatsAppBtn, '#mob-whatsapp-btn must exist in mobile tab bar');

    // Instrument navigator.share and tracking
    await mobilePage.evaluate(() => {
      window._nativeShareCalls = [];
      window._downloadedFiles = [];
      window._openedUrls = [];

      window._onPdfSaved = (filename) => {
        window._downloadedFiles.push(filename);
      };

      const origSave = window.savePdfBlob;
      window.savePdfBlob = (pdf, filename) => {
        window._downloadedFiles.push(filename);
        if (origSave) origSave(pdf, filename);
      };

      window.open = (url) => {
        window._openedUrls.push(url);
      };

      navigator.canShare = (data) => !!(data && data.files && data.files.length > 0);
      navigator.share = async (data) => {
        window._nativeShareCalls.push({
          hasFiles: !!(data.files && data.files.length > 0),
          fileNames: (data.files || []).map(f => f.name),
          fileTypes: (data.files || []).map(f => f.type),
          hasText: 'text' in data && data.text !== undefined && data.text !== null && data.text !== '',
          hasTitle: 'title' in data && data.title !== undefined && data.title !== null && data.title !== '',
          hasUrl: 'url' in data && data.url !== undefined && data.url !== null && data.url !== ''
        });
        return Promise.resolve();
      };
    });

    // Populate a sample invoice row
    await mobilePage.evaluate(() => {
      window.rows = [{
        id: 1,
        item: 'Phorate 10% CG',
        packSize: '1 Kg',
        packagingType: 'Bag',
        boxes: 1,
        qty: 10,
        price: 150,
        taxable: 1500,
        gstRate: 18,
        gstAmount: 270,
        total: 1770
      }];
    });

    // Click mobile WhatsApp button
    await mobilePage.click('#mob-whatsapp-btn');
    await mobilePage.waitForFunction(() => window._nativeShareCalls && window._nativeShareCalls.length > 0, { timeout: 8000 });

    const mobShares = await mobilePage.evaluate(() => window._nativeShareCalls);
    const mobDownloads = await mobilePage.evaluate(() => window._downloadedFiles);
    console.log('  Mobile Share Call Details:', JSON.stringify(mobShares, null, 2));
    assert.ok(mobShares.length > 0, 'navigator.share must have been called');
    assert.strictEqual(mobShares[0].hasFiles, true, 'Share must contain files');
    assert.ok(/^Invoice_\d{2,}\.pdf$/.test(mobShares[0].fileNames[0]), `Shared file ${mobShares[0].fileNames[0]} must match Invoice_NN.pdf`);
    assert.strictEqual(mobShares[0].hasText, false, 'STRICT: Share must NOT contain text caption!');
    assert.strictEqual(mobShares[0].hasUrl, false, 'STRICT: Share must NOT contain url!');
    assert.strictEqual(mobDownloads.length, 0, 'STRICT: Must NOT trigger any file downloads during native share!');

    // Verify unwanted instruction modal DOES NOT exist or is not displayed
    const modalCheckMobile = await mobilePage.evaluate(() => {
      const m = document.getElementById('whatsapp-instructions-modal');
      return m ? (m.style.display !== 'none' && m.classList.contains('open')) : false;
    });
    assert.strictEqual(modalCheckMobile, false, 'STRICT: Instruction modal must NOT appear during successful share!');
    console.log('  ✓ Instruction modal is NOT shown (clean normal workflow confirmed)');

    const shotMobileBuilder = path.join(ARTIFACT_DIR, 'mobile_390_invoice_builder_whatsapp.png');
    await mobilePage.screenshot({ path: shotMobileBuilder });
    console.log('  ✓ Screenshot captured: mobile_390_invoice_builder_whatsapp.png\n');

    // ------------------------------------------------------------------
    // Part 3: ERP Orders → Dispatch Mobile Viewport (390px)
    // ------------------------------------------------------------------
    console.log('--- 3. Testing ERP Commercial Invoice Mobile Sharing (390px) ---');
    const erpMobilePage = await browser.newPage();
    await erpMobilePage.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36');
    await erpMobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Authenticate
    await erpMobilePage.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await erpMobilePage.waitForFunction(() => window.dbClient && window.dbClient.auth);
    await erpMobilePage.evaluate(async () => {
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

    // Open orders page
    await erpMobilePage.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await erpMobilePage.waitForFunction(() => window.allOrders && window.allOrders.length > 0, { timeout: 10000 });

    // Switch to Dispatches tab
    await erpMobilePage.evaluate(() => {
      const tab = document.querySelector('.tabs .tab-btn[data-tab="Dispatches"]');
      if (tab) tab.click();
    });
    await sleep(1500);

    // Instrument native share and downloads on ERP mobile page
    await erpMobilePage.evaluate(() => {
      window._erpShareCalls = [];
      window._erpDownloads = [];
      window._erpOpenedUrls = [];

      window._onPdfSaved = (filename) => {
        if (filename && !window._erpDownloads.includes(filename)) window._erpDownloads.push(filename);
      };

      const origSave = window.savePdfBlob;
      window.savePdfBlob = (pdf, filename) => {
        if (filename && !window._erpDownloads.includes(filename)) window._erpDownloads.push(filename);
        if (origSave) origSave(pdf, filename);
      };

      window.open = (url) => {
        window._erpOpenedUrls.push(url);
      };

      navigator.canShare = (data) => !!(data && data.files && data.files.length > 0);
      navigator.share = async (data) => {
        window._erpShareCalls.push({
          hasFiles: !!(data.files && data.files.length > 0),
          fileNames: (data.files || []).map(f => f.name),
          hasText: 'text' in data && data.text !== undefined && data.text !== null && data.text !== '',
          hasTitle: 'title' in data && data.title !== undefined && data.title !== null && data.title !== '',
          hasUrl: 'url' in data && data.url !== undefined && data.url !== null && data.url !== ''
        });
        return Promise.resolve();
      };
    });

    // Open Commercial Invoice modal for DSP-02
    await erpMobilePage.evaluate(async () => {
      const dsp = (window.allDispatches || []).find(d => d.dispatch_no === 'DSP-02') || (window.allDispatches || [])[0];
      if (dsp && window.DISPATCH_UI) {
        await window.DISPATCH_UI.viewGeneratedInvoice(dsp.id);
      }
    });

    await erpMobilePage.waitForFunction(() => {
      const m = document.getElementById('view-invoice-modal');
      return m && (m.classList.contains('open') || m.classList.contains('active'));
    }, { timeout: 8000 });

    const modalStateBefore = await erpMobilePage.evaluate(() => {
      const m = document.getElementById('view-invoice-modal');
      return {
        isOpen: m && (m.classList.contains('open') || m.classList.contains('active')),
        invNo: m?.getAttribute('data-invoice-no'),
        title: document.getElementById('view-invoice-title')?.innerText
      };
    });
    console.log('  Modal State Before Share:', modalStateBefore);
    assert.strictEqual(modalStateBefore.isOpen, true, 'Commercial invoice modal must be open');
    assert.ok(modalStateBefore.title.includes('INV-02') || modalStateBefore.invNo === 'INV-02', 'Must be INV-02');

    // Click "Send on WhatsApp"
    console.log('  Clicking Send on WhatsApp...');
    await erpMobilePage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(600);

    const erpShares = await erpMobilePage.evaluate(() => window._erpShareCalls);
    const erpDownloads = await erpMobilePage.evaluate(() => window._erpDownloads);
    console.log('  ERP Share Calls Details:', JSON.stringify(erpShares, null, 2));
    assert.ok(erpShares.length > 0, 'navigator.share must be called');
    assert.strictEqual(erpShares[0].fileNames[0], 'INV_02.pdf', 'Must share INV_02.pdf');
    assert.strictEqual(erpShares[0].hasText, false, 'STRICT: Zero text caption allowed in native share');
    assert.strictEqual(erpShares[0].hasUrl, false, 'STRICT: Zero URL allowed in native share');
    assert.strictEqual(erpDownloads.length, 0, 'STRICT: Must NOT download PDF file during native share!');

    // Confirm that returning to the ERP leaves the normal application screen with NO instruction popup
    const modalCheckERP = await erpMobilePage.evaluate(() => {
      const instrModal = document.getElementById('whatsapp-instructions-modal');
      const invModal = document.getElementById('view-invoice-modal');
      return {
        instructionModalShown: !!(instrModal && instrModal.classList.contains('open')),
        invoiceModalStillOpen: !!(invModal && (invModal.classList.contains('open') || invModal.classList.contains('active'))),
        bodyOverflow: document.body.style.overflow
      };
    });
    console.log('  Post-Share UI State:', modalCheckERP);
    assert.strictEqual(modalCheckERP.instructionModalShown, false, 'STRICT: Instruction popup must NOT appear!');
    assert.strictEqual(modalCheckERP.invoiceModalStillOpen, true, 'Existing invoice modal must remain open and preserved');
    console.log('  ✓ No instruction popup shown; normal ERP screen preserved perfectly.');

    const shotMobileERP = path.join(ARTIFACT_DIR, 'mobile_390_erp_dispatch_commercial_invoice.png');
    await erpMobilePage.screenshot({ path: shotMobileERP });
    console.log('  ✓ Screenshot captured: mobile_390_erp_dispatch_commercial_invoice.png\n');

    // ------------------------------------------------------------------
    // Part 4: Native Share Cancellation Stability
    // ------------------------------------------------------------------
    console.log('--- 4. Testing User Cancellation Handling of Native Share ---');
    await erpMobilePage.evaluate(() => {
      window._erpDownloads = [];
      window._erpOpenedUrls = [];
      // Simulate user tapping Cancel / dismissing share sheet
      navigator.share = async () => {
        const cancelErr = new Error('Share canceled by user');
        cancelErr.name = 'AbortError';
        throw cancelErr;
      };
    });

    await erpMobilePage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(400);

    const cancelState = await erpMobilePage.evaluate(() => {
      const instrModal = document.getElementById('whatsapp-instructions-modal');
      const invModal = document.getElementById('view-invoice-modal');
      return {
        downloadsCount: window._erpDownloads.length,
        openedUrlsCount: window._erpOpenedUrls.length,
        instructionModalShown: !!(instrModal && instrModal.classList.contains('open')),
        invoiceModalStillOpen: !!(invModal && (invModal.classList.contains('open') || invModal.classList.contains('active')))
      };
    });
    console.log('  Cancellation Handling State:', cancelState);
    assert.strictEqual(cancelState.downloadsCount, 0, 'No extra download on cancel');
    assert.strictEqual(cancelState.openedUrlsCount, 0, 'No extra tab opened on cancel');
    assert.strictEqual(cancelState.instructionModalShown, false, 'No instruction popup on cancel');
    assert.strictEqual(cancelState.invoiceModalStillOpen, true, 'Invoice modal stays intact on cancel');
    console.log('  ✓ Share cancellation handled gracefully with complete stability.\n');

    // ------------------------------------------------------------------
    // Part 5: Honest Fallback when File Sharing is Unsupported
    // ------------------------------------------------------------------
    console.log('--- 5. Testing Honest Fallback on Unsupported / Insecure Browsers ---');
    await erpMobilePage.evaluate(() => {
      window._erpDownloads = [];
      window._erpOpenedUrls = [];
      navigator.canShare = () => false;
      navigator.share = undefined;
    });

    await erpMobilePage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(600);

    const fallbackState = await erpMobilePage.evaluate(() => {
      const instrModal = document.getElementById('whatsapp-instructions-modal');
      return {
        downloads: window._erpDownloads,
        openedUrls: window._erpOpenedUrls,
        instructionModalShown: !!(instrModal && instrModal.classList.contains('open'))
      };
    });

    console.log('  Fallback State:', fallbackState);
    assert.strictEqual(fallbackState.downloads.length, 0, 'STRICT: Send on WhatsApp must NOT initiate a normal PDF download on mobile!');
    assert.strictEqual(fallbackState.openedUrls.length, 0, 'STRICT: Must NOT attempt to open broken chat links (wa.me/whatsapp://) on mobile in fallback!');
    assert.strictEqual(fallbackState.instructionModalShown, false, 'STRICT: Must NOT show the giant instruction modal!');
    console.log('  ✓ Honest fallback verified: ZERO silent downloads, zero broken chat links, clean user-facing guidance.\n');

    // ------------------------------------------------------------------
    // Part 6: Desktop Working Workflow Verification
    // ------------------------------------------------------------------
    console.log('--- 6. Verifying Desktop Workflow Remains Fully Intact ---');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1280, height: 900 });

    // Login and open orders page
    await desktopPage.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForFunction(() => window.dbClient && window.dbClient.auth);
    await desktopPage.evaluate(async () => {
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

    await desktopPage.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await desktopPage.waitForFunction(() => window.allOrders && window.allOrders.length > 0, { timeout: 10000 });

    await desktopPage.evaluate(() => {
      const tab = document.querySelector('.tabs .tab-btn[data-tab="Dispatches"]');
      if (tab) tab.click();
    });
    await sleep(1500);

    // Mock native sharing on desktop (Windows Share supported)
    await desktopPage.evaluate(() => {
      window._desktopShareCalls = [];
      window._desktopDownloads = [];

      window._onPdfSaved = (filename) => {
        if (filename && !window._desktopDownloads.includes(filename)) window._desktopDownloads.push(filename);
      };

      navigator.canShare = (data) => !!(data && data.files && data.files.length > 0);
      navigator.share = async (data) => {
        window._desktopShareCalls.push({
          fileNames: (data.files || []).map(f => f.name),
          hasText: 'text' in data && data.text !== undefined && data.text !== null && data.text !== ''
        });
        return Promise.resolve();
      };
    });

    await desktopPage.evaluate(async () => {
      const dsp = (window.allDispatches || []).find(d => d.dispatch_no === 'DSP-02') || (window.allDispatches || [])[0];
      if (dsp && window.DISPATCH_UI) {
        await window.DISPATCH_UI.viewGeneratedInvoice(dsp.id);
      }
    });

    await desktopPage.waitForFunction(() => {
      const m = document.getElementById('view-invoice-modal');
      return m && (m.classList.contains('open') || m.classList.contains('active'));
    }, { timeout: 8000 });

    await desktopPage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(500);

    const desktopShares = await desktopPage.evaluate(() => window._desktopShareCalls);
    console.log('  Desktop Share Result:', desktopShares);
    assert.strictEqual(desktopShares[0].fileNames[0], 'INV_02.pdf');
    assert.strictEqual(desktopShares[0].hasText, false);

    const shotDesktop = path.join(ARTIFACT_DIR, 'desktop_erp_commercial_invoice_clean.png');
    await desktopPage.screenshot({ path: shotDesktop });
    console.log('  ✓ Screenshot captured: desktop_erp_commercial_invoice_clean.png\n');

    console.log('======================================================================');
    console.log('🎉 ALL MOBILE & DESKTOP WHATSAPP SHARING TESTS PASSED CLEANLY!');
    console.log('======================================================================');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
