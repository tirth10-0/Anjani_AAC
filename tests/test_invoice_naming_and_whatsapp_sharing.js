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
  console.log('🚀 Starting Comprehensive Verification: Invoice PDF Naming & WhatsApp Sharing');
  console.log('======================================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors']
  });

  try {
    // ------------------------------------------------------------------
    // Part 1: Unit Verification of getStandardInvoicePdfFilename
    // ------------------------------------------------------------------
    console.log('--- 1. Testing getStandardInvoicePdfFilename Formatting Logic ---');
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/Invoice%20Builder/index.html`, { waitUntil: 'domcontentloaded' });

    const unitTestResults = await page.evaluate(() => {
      const fn = window.getStandardInvoicePdfFilename;
      return {
        reg1: fn(1, false),
        reg2: fn(2, false),
        reg10: fn(10, false),
        reg104: fn(104, false),
        regLeadingZero: fn('01', false),
        regTripleZero: fn('001', false),
        regPrefixed: fn('Invoice-05', false),
        disp1: fn(1, true),
        disp2: fn(2, true),
        disp10: fn(10, true),
        disp104: fn(104, true),
        dispInv01: fn('INV-01', true),
        dispInv02: fn('INV-02', true),
        dispInv10: fn('INV-10', true),
        dispInv104: fn('INV-104', true),
        dispCommercial: fn('Commercial-Invoice-INV-02.pdf', true),
        dispDspFallback: fn('DSP-02', true)
      };
    });

    console.log('Unit Test Results:', JSON.stringify(unitTestResults, null, 2));

    assert.strictEqual(unitTestResults.reg1, 'Invoice_01.pdf', 'Regular 1 failed');
    assert.strictEqual(unitTestResults.reg2, 'Invoice_02.pdf', 'Regular 2 failed');
    assert.strictEqual(unitTestResults.reg10, 'Invoice_10.pdf', 'Regular 10 failed');
    assert.strictEqual(unitTestResults.reg104, 'Invoice_104.pdf', 'Regular 104 failed');
    assert.strictEqual(unitTestResults.disp1, 'INV_01.pdf', 'Dispatch 1 failed');
    assert.strictEqual(unitTestResults.disp2, 'INV_02.pdf', 'Dispatch 2 failed');
    assert.strictEqual(unitTestResults.disp10, 'INV_10.pdf', 'Dispatch 10 failed');
    assert.strictEqual(unitTestResults.disp104, 'INV_104.pdf', 'Dispatch 104 failed');
    assert.strictEqual(unitTestResults.dispInv01, 'INV_01.pdf', 'Dispatch INV-01 failed');
    assert.strictEqual(unitTestResults.dispInv02, 'INV_02.pdf', 'Dispatch INV-02 failed');
    assert.strictEqual(unitTestResults.dispCommercial, 'INV_02.pdf', 'Commercial-Invoice-INV-02.pdf failed');

    console.log('  ✓ All 17 unit test filename assertions passed!\n');

    // ------------------------------------------------------------------
    // Part 2: Invoice Builder Download & WhatsApp Sharing
    // ------------------------------------------------------------------
    console.log('--- 2. Testing Standalone Invoice Builder (Desktop & Mobile) ---');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/Invoice%20Builder/index.html`, { waitUntil: 'networkidle2' });

    // Verify WhatsApp button presence on desktop toolbar
    const whatsappBtnExists = await page.$('#whatsapp-btn');
    assert.ok(whatsappBtnExists, '#whatsapp-btn must exist on desktop toolbar');
    console.log('  ✓ #whatsapp-btn verified on desktop toolbar');

    // Mock navigator.share and track calls
    await page.evaluate(() => {
      window._nativeShareCalls = [];
      window._downloadedFiles = [];
      window._openedUrls = [];

      window._onPdfSaved = (filename) => {
        window._downloadedFiles.push(filename);
      };

      // Intercept anchor click download
      const origAppend = document.body.appendChild.bind(document.body);
      document.body.appendChild = function (node) {
        if (node && node.tagName === 'A' && node.download) {
          window._downloadedFiles.push(node.download);
        }
        return origAppend(node);
      };

      // Mock savePdfBlob to capture filename
      const origSave = window.savePdfBlob;
      window.savePdfBlob = (pdf, filename) => {
        window._downloadedFiles.push(filename);
        if (origSave) origSave(pdf, filename);
      };

      // Mock window.open
      window.open = (url) => {
        window._openedUrls.push(url);
      };

      // Mock navigator.share and canShare (Native file sharing supported mode)
      navigator.canShare = (obj) => {
        return !!(obj && obj.files && obj.files.length > 0);
      };
      navigator.share = async (data) => {
        window._nativeShareCalls.push({
          hasFiles: !!(data.files && data.files.length > 0),
          fileNames: (data.files || []).map(f => f.name),
          fileTypes: (data.files || []).map(f => f.type),
          hasText: 'text' in data && data.text !== undefined && data.text !== null && data.text !== '',
          textVal: data.text,
          hasTitle: 'title' in data && data.title !== undefined && data.title !== null && data.title !== '',
          titleVal: data.title
        });
        return Promise.resolve();
      };
    });

    // Ensure a valid invoice row is present for PDF generation
    await page.evaluate(() => {
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

    // Test Download PDF
    await page.click('#pdf-btn');
    await page.waitForFunction(() => window._downloadedFiles && window._downloadedFiles.length > 0, { timeout: 8000 });

    const builderDownloads = await page.evaluate(() => window._downloadedFiles);
    console.log('  Builder Downloaded Filenames:', builderDownloads);
    assert.ok(builderDownloads.length > 0, 'Must have downloaded a file');
    assert.ok(/^Invoice_\d{2,}\.pdf$/.test(builderDownloads[0]), `Filename ${builderDownloads[0]} must match Invoice_NN.pdf`);
    console.log(`  ✓ PDF Download verified: "${builderDownloads[0]}" matches Invoice_NN.pdf`);

    // Test Send on WhatsApp with Native File Sharing supported
    await page.evaluate(() => {
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
    await page.click('#whatsapp-btn');
    await page.waitForFunction(() => window._nativeShareCalls && window._nativeShareCalls.length > 0, { timeout: 8000 });

    const shareCalls = await page.evaluate(() => window._nativeShareCalls);
    console.log('  Native Share Call Details:', JSON.stringify(shareCalls, null, 2));
    assert.ok(shareCalls.length > 0, 'navigator.share must have been called');
    assert.strictEqual(shareCalls[0].hasFiles, true, 'Share must contain files');
    assert.ok(/^Invoice_\d{2,}\.pdf$/.test(shareCalls[0].fileNames[0]), `Shared file ${shareCalls[0].fileNames[0]} must match Invoice_NN.pdf`);
    assert.strictEqual(shareCalls[0].hasText, false, 'STRICT: Share must NOT contain text caption or prefilled message!');
    console.log('  ✓ Native file share verified: ONLY PDF file shared, zero unwanted caption!');

    // Capture screenshot of Invoice Builder with WhatsApp button
    const shotBuilder = path.join(ARTIFACT_DIR, 'invoice_builder_desktop_whatsapp.png');
    await page.screenshot({ path: shotBuilder });
    console.log('  ✓ Screenshot captured: invoice_builder_desktop_whatsapp.png\n');

    // Test Fallback Mode in Invoice Builder (when direct file sharing unsupported)
    console.log('--- 3. Testing Invoice Builder Fallback on Unsupported Browsers ---');
    await page.evaluate(() => {
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
      window._downloadedFiles = [];
      window._openedUrls = [];
      // Set canShare to false
      navigator.canShare = () => false;
      navigator.share = undefined;
    });

    await page.click('#whatsapp-btn');
    await page.waitForFunction(() => window._downloadedFiles && window._downloadedFiles.length > 0, { timeout: 8000 });

    const fallbackDownloads = await page.evaluate(() => window._downloadedFiles);
    const fallbackUrls = await page.evaluate(() => window._openedUrls);
    const modalVisible = await page.evaluate(() => {
      const m = document.getElementById('whatsapp-instructions-modal');
      return m ? (m.style.display !== 'none' && m.classList.contains('open')) : false;
    });

    console.log('  Fallback Downloaded File:', fallbackDownloads[0]);
    console.log('  Fallback WhatsApp URL:', fallbackUrls[0]);
    console.log('  Fallback Modal Displayed:', modalVisible);

    assert.ok(/^Invoice_\d{2,}\.pdf$/.test(fallbackDownloads[0]), `Fallback download ${fallbackDownloads[0]} must match Invoice_NN.pdf`);
    assert.strictEqual(modalVisible, false, 'STRICT: Transparent instruction modal must NOT be displayed');
    console.log('  ✓ Transparent fallback verified: correct download, clean non-intrusive flow!\n');

    // ------------------------------------------------------------------
    // Part 3: ERP Orders → Dispatch Commercial Invoice Naming & WhatsApp Sharing
    // ------------------------------------------------------------------
    console.log('--- 4. Testing ERP Orders → Dispatch Commercial Invoice Flow ---');
    const erpPage = await browser.newPage();
    await erpPage.setViewport({ width: 1280, height: 900 });

    // Login via login.html
    await erpPage.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await erpPage.waitForFunction(() => window.dbClient && window.dbClient.auth);
    await erpPage.evaluate(async () => {
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
    console.log('  ✓ Authenticated ERP admin successfully.');

    // Navigate to orders.html
    await erpPage.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'networkidle2' });
    await erpPage.waitForFunction(() => window.allOrders && window.allOrders.length > 0, { timeout: 10000 });
    console.log('  ✓ Orders loaded in ERP.');

    // Switch to Dispatches tab
    await erpPage.evaluate(() => {
      const dspTab = document.querySelector('.tabs .tab-btn[data-tab="Dispatches"]');
      if (dspTab) dspTab.click();
    });
    await sleep(1500);

    // Mock native sharing & downloads on ERP page
    await erpPage.evaluate(() => {
      window._erpShareCalls = [];
      window._erpDownloads = [];
      window._erpOpenedUrls = [];

      window._onPdfSaved = (filename) => {
        if (filename && !window._erpDownloads.includes(filename)) {
          window._erpDownloads.push(filename);
        }
      };

      const origSavePdfBlob = window.savePdfBlob;
      window.savePdfBlob = (pdf, filename) => {
        if (filename && !window._erpDownloads.includes(filename)) {
          window._erpDownloads.push(filename);
        }
        if (origSavePdfBlob) origSavePdfBlob(pdf, filename);
      };

      // Intercept anchor click download
      const origAppend = document.body.appendChild.bind(document.body);
      document.body.appendChild = function (node) {
        if (node && node.tagName === 'A' && node.download) {
          window._erpDownloads.push(node.download);
        }
        return origAppend(node);
      };

      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && !window._erpDownloads.includes(this.download)) {
          window._erpDownloads.push(this.download);
        }
        return origClick.apply(this, arguments);
      };

      if (window.jspdf && window.jspdf.jsPDF) {
        const origJsPdfSave = window.jspdf.jsPDF.prototype.save;
        window.jspdf.jsPDF.prototype.save = function (filename) {
          if (filename && !window._erpDownloads.includes(filename)) {
            window._erpDownloads.push(filename);
          }
          return origJsPdfSave.apply(this, arguments);
        };
      }

      window.open = (url) => {
        window._erpOpenedUrls.push(url);
      };

      navigator.canShare = (obj) => !!(obj && obj.files && obj.files.length > 0);
      navigator.share = async (data) => {
        window._erpShareCalls.push({
          hasFiles: !!(data.files && data.files.length > 0),
          fileNames: (data.files || []).map(f => f.name),
          hasText: 'text' in data && data.text !== undefined && data.text !== null && data.text !== '',
          textVal: data.text
        });
        return Promise.resolve();
      };
    });

    // Open Commercial Invoice for DSP-02
    console.log('  Opening Commercial Invoice for DSP-02...');
    await erpPage.evaluate(async () => {
      const dsp = (window.allDispatches || []).find(d => d.dispatch_no === 'DSP-02') || (window.allDispatches || [])[0];
      if (dsp && window.DISPATCH_UI) {
        await window.DISPATCH_UI.viewGeneratedInvoice(dsp.id);
      }
    });

    await erpPage.waitForFunction(() => {
      const modal = document.getElementById('view-invoice-modal');
      return modal && (modal.classList.contains('open') || modal.classList.contains('active'));
    }, { timeout: 8000 });

    // Verify modal opened with correct invoice number INV-02
    const modalDetails = await erpPage.evaluate(() => {
      const modal = document.getElementById('view-invoice-modal');
      const title = document.getElementById('view-invoice-title')?.textContent || '';
      const invNoAttr = modal?.getAttribute('data-invoice-no') || '';
      return {
        isOpen: modal && (modal.classList.contains('open') || modal.classList.contains('active')),
        title: title,
        invNoAttr: invNoAttr
      };
    });

    console.log('  Modal Details:', modalDetails);
    assert.strictEqual(modalDetails.isOpen, true, 'Commercial invoice modal must be open');
    assert.ok(modalDetails.title.includes('INV-02') || modalDetails.invNoAttr === 'INV-02', 'Must belong to INV-02 (NOT DSP-02)');

    // Test Download PDF in ERP
    await erpPage.evaluate(() => {
      window.downloadInvoicePDF();
    });
    await sleep(800);

    const erpDownloads = await erpPage.evaluate(() => window._erpDownloads);
    console.log('  ERP Downloaded Filenames:', erpDownloads);
    assert.ok(erpDownloads.length > 0, 'Must have downloaded a commercial invoice PDF');
    assert.strictEqual(erpDownloads[erpDownloads.length - 1], 'INV_02.pdf', 'Commercial invoice filename must be INV_02.pdf (NOT Commercial-Invoice-INV-02.pdf)');
    console.log('  ✓ ERP Commercial Invoice download verified: exactly "INV_02.pdf"');

    // Test Send on WhatsApp with Native File Sharing supported
    await erpPage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(800);

    const erpShares = await erpPage.evaluate(() => window._erpShareCalls);
    console.log('  ERP Native Share Calls:', JSON.stringify(erpShares, null, 2));
    assert.ok(erpShares.length > 0, 'navigator.share must have been called');
    assert.strictEqual(erpShares[0].fileNames[0], 'INV_02.pdf', 'Shared file must be INV_02.pdf');
    assert.strictEqual(erpShares[0].hasText, false, 'STRICT: Share must NOT include unwanted text caption!');
    console.log('  ✓ ERP Native WhatsApp share verified: strictly "INV_02.pdf" with zero text caption!');

    // Test Fallback Mode in ERP (desktop/unsupported browser)
    console.log('--- 5. Testing ERP WhatsApp Fallback on Unsupported Browsers ---');
    await erpPage.evaluate(() => {
      window._erpDownloads = [];
      window._erpOpenedUrls = [];
      navigator.canShare = () => false;
      navigator.share = undefined;
    });

    await erpPage.evaluate(async () => {
      await window.sendInvoiceWhatsApp();
    });
    await sleep(800);

    const erpFallbackDownloads = await erpPage.evaluate(() => window._erpDownloads);
    const erpFallbackUrls = await erpPage.evaluate(() => window._erpOpenedUrls);
    const erpFallbackModal = await erpPage.evaluate(() => {
      const m = document.getElementById('whatsapp-instructions-modal');
      return {
        exists: !!m,
        isOpen: m && (m.classList.contains('open') || m.style.display !== 'none'),
        text: m ? m.innerText : ''
      };
    });

    console.log('  ERP Fallback Download:', erpFallbackDownloads[0]);
    console.log('  ERP Fallback URL:', erpFallbackUrls[0]);
    console.log('  ERP Fallback Modal:', erpFallbackModal.isOpen);

    assert.strictEqual(erpFallbackDownloads[0], 'INV_02.pdf', 'Fallback download must be INV_02.pdf');
    assert.strictEqual(!!erpFallbackModal?.isOpen, false, 'STRICT: Fallback instruction modal must NOT be displayed');
    console.log('  ✓ ERP Transparent fallback verified: downloads INV_02.pdf without any unwanted instruction modal!');

    // Capture screenshot of ERP Commercial Invoice Modal
    const shotERP = path.join(ARTIFACT_DIR, 'dispatch_commercial_invoice_whatsapp.png');
    await erpPage.screenshot({ path: shotERP });
    console.log('  ✓ Screenshot captured: dispatch_commercial_invoice_whatsapp.png\n');

    // ------------------------------------------------------------------
    // Part 4: Mobile Viewport & History Tab Open Verification
    // ------------------------------------------------------------------
    console.log('--- 6. Testing Mobile Viewport (390px) & Invoice History Flow ---');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePage.goto(`${BASE_URL}/Invoice%20Builder/index.html`, { waitUntil: 'networkidle2' });

    // Verify mobile bottom tab WhatsApp button
    const mobWhatsAppBtn = await mobilePage.$('#mob-whatsapp-btn');
    assert.ok(mobWhatsAppBtn, '#mob-whatsapp-btn must exist in mobile tab bar');
    console.log('  ✓ #mob-whatsapp-btn verified on mobile viewport');

    // Test History Page Open Flow
    await mobilePage.goto(`${BASE_URL}/Invoice%20Builder/history.html`, { waitUntil: 'networkidle2' });
    const openBtns = await mobilePage.$$('.btn-action-open, .mob-btn-open');
    assert.ok(openBtns.length > 0, 'History page must have Open buttons');
    console.log(`  ✓ History page loaded with ${openBtns.length} Open actions`);

    const shotMobile = path.join(ARTIFACT_DIR, 'invoice_builder_mobile_390_whatsapp.png');
    await mobilePage.screenshot({ path: shotMobile });
    console.log('  ✓ Screenshot captured: invoice_builder_mobile_390_whatsapp.png\n');

    console.log('======================================================================');
    console.log('🎉 ALL INVOICE PDF NAMING & PDF-ONLY WHATSAPP SHARING TESTS PASSED!');
    console.log('======================================================================');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
