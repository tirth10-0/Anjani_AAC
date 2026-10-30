const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 Starting Verification of WhatsApp Commercial Invoice PDF Sharing & Fallback Workflow...\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('vite') && !txt.includes('WebSocket')) {
        console.log('  [BROWSER]:', txt);
      }
    });

    // 1. Authenticate
    console.log('--- 1. Authenticating Admin User ---');
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
    console.log('  ✓ Authenticated successfully.');

    // 2. Open Orders page -> Dispatch tab
    console.log('\n--- 2. Navigating to Orders Page -> Dispatches Tab ---');
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button.tab-btn[data-tab="Dispatches"]', { timeout: 10000 });
    await page.click('button.tab-btn[data-tab="Dispatches"]');
    await sleep(1500);

    const dispatches = await page.evaluate(() => {
      return (window.allDispatches || []).map(d => ({
        id: d.id,
        dispatch_no: d.dispatch_no,
        order_no: d.order_no,
        status: d.status,
        client_name: d.client_name,
        invoice_no: d.invoice_no
      }));
    });
    console.log(`  ✓ Found ${dispatches.length} dispatches in ERP:`, dispatches.map(d => `${d.dispatch_no} (${d.invoice_no || 'No Inv'}, ${d.client_name})`));

    // 3. Test DSP-02 (INV-02) Commercial Invoice Opening & Data Parity
    console.log('\n--- 3. Testing DSP-02 Commercial Invoice Viewing & Data Integrity ---');
    const disp2 = dispatches.find(d => d.dispatch_no === 'DSP-02') || dispatches[0];
    assert(disp2, 'DSP-02 dispatch record must exist');

    await page.evaluate(async (id) => {
      await window.viewGeneratedInvoice(id);
    }, disp2.id);
    await sleep(1500);

    const invoice2Data = await page.evaluate(() => {
      const doc = window.currentViewInvoiceDoc || (window.DISPATCH_UI && window.DISPATCH_UI.currentViewInvoiceDoc);
      const title = document.getElementById('view-invoice-title')?.textContent || '';
      const filename = window.getCommercialInvoiceFilename ? window.getCommercialInvoiceFilename(doc?.InvoiceNumber || 'INV-02') : '';
      return {
        docAvailable: !!doc,
        title,
        invoiceNo: doc?.InvoiceNumber,
        dispatchNo: doc?.dispatchNo,
        customerName: doc?.customer?.name,
        customerPhone: doc?.customer?.phone || doc?.customer?.contact,
        billToName: doc?.billTo?.name,
        grandTotal: doc?.calculations?.grandTotal,
        rowsCount: doc?.rows?.length,
        filename
      };
    });

    console.log('  DSP-02 Invoice Doc details:', invoice2Data);
    assert(invoice2Data.docAvailable, 'Invoice document must be loaded in currentViewInvoiceDoc');
    assert.strictEqual(invoice2Data.invoiceNo, 'INV-02', 'Invoice number must be INV-02');
    assert(invoice2Data.customerName.includes('Krishi Seva Kendra') || invoice2Data.customerName.includes('Makwana'), 'Customer name must be authentic client, not "Valued Customer"');
    assert.strictEqual(invoice2Data.filename, 'Commercial-Invoice-INV-02.pdf', 'Filename must be Commercial-Invoice-INV-02.pdf');
    console.log('  ✓ DSP-02 document data & filename verified.');

    // 4. Test Vector PDF Generation for DSP-02
    console.log('\n--- 4. Testing Actual Vector PDF Generation for DSP-02 ---');
    const pdfGenResult = await page.evaluate(() => {
      const doc = window.currentViewInvoiceDoc;
      const jsPdfLib = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
      if (!jsPdfLib || typeof window.drawA4InvoicePdf !== 'function') {
        return { success: false, error: 'PDF engine not loaded' };
      }
      const pdf = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      window.drawA4InvoicePdf(pdf, doc);
      const blob = pdf.output('blob');
      const filename = window.getCommercialInvoiceFilename(doc.InvoiceNumber);
      return {
        success: true,
        blobSize: blob.size,
        blobType: blob.type,
        filename
      };
    });

    console.log('  DSP-02 PDF Generation:', pdfGenResult);
    assert(pdfGenResult.success, 'Vector PDF generation must succeed');
    assert(pdfGenResult.blobSize > 50000, 'PDF size must be substantial (>50KB) vector document');
    console.log('  ✓ Generated valid vector PDF blob of size:', Math.round(pdfGenResult.blobSize / 1024), 'KB.');

    // 5. Test Web Share API (Mobile Devices Simulation)
    console.log('\n--- 5. Testing Mobile Web Share API Workflow (Native File Sharing) ---');
    const shareResult = await page.evaluate(async () => {
      let sharedPayload = null;
      // Mock navigator.canShare and navigator.share
      const origCanShare = navigator.canShare;
      const origShare = navigator.share;

      navigator.canShare = function(data) {
        return !!(data && data.files && data.files.length > 0);
      };

      navigator.share = async function(data) {
        sharedPayload = {
          title: data.title,
          text: data.text,
          filesCount: data.files?.length,
          fileName: data.files?.[0]?.name,
          fileSize: data.files?.[0]?.size,
          fileType: data.files?.[0]?.type
        };
        return Promise.resolve();
      };

      try {
        await window.sendInvoiceWhatsApp();
        return { success: true, sharedPayload };
      } finally {
        navigator.canShare = origCanShare;
        navigator.share = origShare;
      }
    });

    console.log('  Web Share invocation result:', shareResult);
    assert(shareResult.success, 'sendInvoiceWhatsApp must execute smoothly');
    assert(shareResult.sharedPayload, 'navigator.share must have been called');
    assert.strictEqual(shareResult.sharedPayload.filesCount, 1, 'Exactly one PDF file must be attached');
    assert.strictEqual(shareResult.sharedPayload.fileName, 'Commercial-Invoice-INV-02.pdf', 'Shared file must be Commercial-Invoice-INV-02.pdf');
    assert.strictEqual(shareResult.sharedPayload.fileType, 'application/pdf', 'File type must be application/pdf');
    assert(shareResult.sharedPayload.fileSize > 50000, 'File attachment must be non-empty valid PDF');
    assert(shareResult.sharedPayload.text.includes('Commercial Invoice INV-02'), 'Caption must identify the commercial invoice');
    console.log('  ✓ Mobile Web Share API successfully attached the actual PDF file!');

    // 6. Test Web Share API Cancellation (AbortError handling)
    console.log('\n--- 6. Testing User Cancellation on Share Sheet ---');
    const cancelResult = await page.evaluate(async () => {
      const origCanShare = navigator.canShare;
      const origShare = navigator.share;

      navigator.canShare = () => true;
      navigator.share = async () => {
        const err = new Error('Share canceled');
        err.name = 'AbortError';
        throw err;
      };

      let downloadTriggered = false;
      const origCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = origCreateElement.call(document, tag);
        if (tag.toLowerCase() === 'a') {
          const origClick = el.click;
          el.click = function() {
            downloadTriggered = true;
            return origClick.apply(this, arguments);
          };
        }
        return el;
      };

      try {
        await window.sendInvoiceWhatsApp();
        return { downloadTriggered, completedCleanly: true };
      } catch (e) {
        return { error: e.message };
      } finally {
        navigator.canShare = origCanShare;
        navigator.share = origShare;
        document.createElement = origCreateElement;
      }
    });

    console.log('  Cancel handling result:', cancelResult);
    assert.strictEqual(cancelResult.downloadTriggered, false, 'Cancellation must NOT trigger an unwanted fallback download');
    console.log('  ✓ Share cancellation handled gracefully with zero unwanted downloads.');

    // 7. Test Desktop / Unsupported Browser Fallback Workflow
    console.log('\n--- 7. Testing Desktop / Fallback Workflow (Download PDF + WhatsApp + Modal Guide) ---');
    const fallbackResult = await page.evaluate(async () => {
      const origCanShare = navigator.canShare;
      const origShare = navigator.share;
      const origOpen = window.open;

      navigator.canShare = () => false;
      navigator.share = undefined;

      let openedUrl = null;
      window.open = function(url) {
        openedUrl = url;
        return { closed: false };
      };

      let downloadedFileName = null;
      let downloadedBlobUrl = null;
      const origCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = origCreateElement.call(document, tag);
        if (tag.toLowerCase() === 'a') {
          const origClick = el.click;
          el.click = function() {
            downloadedFileName = el.download;
            downloadedBlobUrl = el.href;
            // don't really trigger download in automated test
          };
        }
        return el;
      };

      try {
        await window.sendInvoiceWhatsApp();
        await new Promise(r => setTimeout(r, 600));

        const fallbackModal = document.getElementById('whatsapp-instructions-modal');
        const isModalOpen = fallbackModal && fallbackModal.classList.contains('open');
        const modalHtml = fallbackModal ? fallbackModal.innerHTML : '';

        return {
          downloadedFileName,
          hasBlobUrl: !!downloadedBlobUrl,
          openedUrl,
          isModalOpen,
          modalMentionsFile: modalHtml.includes(downloadedFileName),
          modalMentionsAttach: modalHtml.includes('Attachment') || modalHtml.includes('attach')
        };
      } finally {
        navigator.canShare = origCanShare;
        navigator.share = origShare;
        window.open = origOpen;
        document.createElement = origCreateElement;
      }
    });

    console.log('  Desktop Fallback Execution:', fallbackResult);
    assert.strictEqual(fallbackResult.downloadedFileName, 'Commercial-Invoice-INV-02.pdf', 'Fallback must download Commercial-Invoice-INV-02.pdf');
    assert(fallbackResult.hasBlobUrl, 'Download must use genuine generated PDF blob URL');
    assert(fallbackResult.openedUrl && fallbackResult.openedUrl.includes('api.whatsapp.com'), 'WhatsApp URL must open in new tab');
    assert(fallbackResult.isModalOpen, 'Fallback instruction modal must be displayed to the user');
    assert(fallbackResult.modalMentionsFile, 'Modal must explicitly state the downloaded filename');
    assert(fallbackResult.modalMentionsAttach, 'Modal must instruct the user on attaching the PDF');
    console.log('  ✓ Desktop fallback successfully downloaded PDF, opened WhatsApp, and displayed transparent attach guide!');

    // Capture screenshot of fallback modal
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'whatsapp_desktop_fallback_modal_instructions.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot saved: whatsapp_desktop_fallback_modal_instructions.png');

    // Close the fallback modal
    await page.evaluate(() => {
      if (window.closeWhatsAppFallbackModal) window.closeWhatsAppFallbackModal();
    });
    await sleep(400);

    // 8. Test DSP-01 (INV-01) to verify No Cross-Contamination Between Dispatches
    console.log('\n--- 8. Testing DSP-01 (INV-01) to Verify Dispatch Separation ---');
    const disp1 = dispatches.find(d => d.dispatch_no === 'DSP-01');
    assert(disp1, 'DSP-01 dispatch record must exist');

    await page.evaluate(async (id) => {
      await window.viewGeneratedInvoice(id);
    }, disp1.id);
    await sleep(1500);

    const invoice1Data = await page.evaluate(() => {
      const doc = window.currentViewInvoiceDoc || (window.DISPATCH_UI && window.DISPATCH_UI.currentViewInvoiceDoc);
      const title = document.getElementById('view-invoice-title')?.textContent || '';
      const filename = window.getCommercialInvoiceFilename ? window.getCommercialInvoiceFilename(doc?.InvoiceNumber || 'INV-01') : '';
      return {
        title,
        invoiceNo: doc?.InvoiceNumber,
        dispatchNo: doc?.dispatchNo,
        customerName: doc?.customer?.name,
        filename
      };
    });

    console.log('  DSP-01 Invoice Doc details:', invoice1Data);
    assert.strictEqual(invoice1Data.invoiceNo, 'INV-01', 'Invoice number must be INV-01 for DSP-01');
    assert(invoice1Data.customerName.includes('Kisan Agro') || invoice1Data.customerName.includes('Patel'), 'Customer name must be Kisan Agro Agency (Ramesh Patel)');
    assert.strictEqual(invoice1Data.filename, 'Commercial-Invoice-INV-01.pdf', 'Filename must be Commercial-Invoice-INV-01.pdf');
    console.log('  ✓ DSP-01 is completely isolated from DSP-02 with no cross-contamination.');

    // Capture screenshot of commercial invoice view
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'commercial_invoice_view_dsp01.png'),
      fullPage: false
    });
    console.log('  ✓ Screenshot saved: commercial_invoice_view_dsp01.png');

    console.log('\n======================================================');
    console.log('🎉 ALL 8 TEST SUITES PASSED! WhatsApp PDF Sharing & Fallback verified!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
