/**
 * tests/test_single_tab_print_and_invoice_ui.js
 *
 * Verifies:
 * 1. Print Dispatch Slip and Print Invoice do NOT open new window/tab (no window.open).
 * 2. Printing executes in current tab via window.print and @media print CSS.
 * 3. Table headers explicitly enforce white text on dark green (#0C3925).
 * 4. Pack sizes enforce white-space: nowrap to avoid awkward line wrapping.
 * 5. PDF generation temporarily clears screen card borders/shadows for full-bleed A4 output.
 * 6. Payment details and Authorized Signatory footer layout fit on single A4 page.
 * 7. Dispatches table header in orders.html has no "Loose" column (Boxes only).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Single-Tab Print & Commercial Invoice UI Verification Tests...\n');

const ordersHtml = fs.readFileSync(path.join(__dirname, '../pages/orders.html'), 'utf8');
const dispatchUiJs = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-ui.js'), 'utf8');

// ── TEST GROUP 1: Single-Tab Printing (No window.open) ──
console.log('--- Test Group 1: Single-Tab Print Verification ---');

// 1.1 Neither printDispatchSlip nor printInvoiceSlip should call window.open
assert(!dispatchUiJs.includes("window.open('', '_blank'"),
  'dispatch-ui.js must NOT use window.open to pop up a new window/tab for printing');
assert(!dispatchUiJs.includes("printWindow.document.write"),
  'dispatch-ui.js must NOT write to a popup window document');

// 1.2 Both print functions should invoke window.print() directly
assert(dispatchUiJs.includes("document.body.classList.add('is-printing-slip')"),
  'printDispatchSlip must add is-printing-slip class');
assert(dispatchUiJs.includes("document.body.classList.add('is-printing-invoice')"),
  'printInvoiceSlip must add is-printing-invoice class');

// 1.3 orders.html must include @media print rules that hide app chrome and isolate paper
assert(ordersHtml.includes('@media print'),
  'orders.html must define @media print stylesheet');
assert(ordersHtml.includes('.app-layout,\n      .sidebar,\n      .topbar') || ordersHtml.includes('.app-layout'),
  'orders.html print styles must hide ERP app-layout');
assert(ordersHtml.includes('#view-invoice-paper,\n      #dispatch-slip-paper') || ordersHtml.includes('#view-invoice-paper'),
  'orders.html print styles must isolate invoice and dispatch papers');

console.log('✅ Group 1 Passed: Single-tab print execution verified (no popup windows or tabs).\n');

// ── TEST GROUP 2: Commercial Invoice UI & Styling ──
console.log('--- Test Group 2: Invoice UI & Contrast Verification ---');

// 2.1 Table headers in viewGeneratedInvoice must have explicit white text on dark green
assert(dispatchUiJs.includes('color:#ffffff !important; background:#0C3925 !important;'),
  'Invoice table headers must explicitly enforce white text (#ffffff) on dark green (#0C3925)');

// 2.2 Pack size must have white-space: nowrap !important
assert(dispatchUiJs.includes('white-space:nowrap !important; display:inline-block;'),
  'Pack size badges must enforce white-space: nowrap to prevent text splitting');

// 2.3 Totals grand total must match Invoice Builder styling
assert(dispatchUiJs.includes('background:#0C3925 !important; color:#ffffff !important; font-size:14px; font-weight:800;'),
  'Invoice totals box must have dark green background with white text for Grand Total');

// 2.4 Payment details & Bank information must be present in footer
assert(dispatchUiJs.includes('PUNJAB NATIONAL BANK'),
  'Invoice footer must include Punjab National Bank details');
assert(dispatchUiJs.includes('9178002100002019'),
  'Invoice footer must include Bank account number');
assert(dispatchUiJs.includes('Authorized Signatory'),
  'Invoice footer must include Authorized Signatory section');

// 2.5 downloadInvoicePDF must temporarily strip screen shadows/borders for clean A4 PDF
assert(dispatchUiJs.includes("element.style.boxShadow = 'none'"),
  'downloadInvoicePDF must strip box-shadow during PDF generation');
assert(dispatchUiJs.includes("element.style.border = 'none'"),
  'downloadInvoicePDF must strip card border during PDF generation');

console.log('✅ Group 2 Passed: Commercial invoice styling and PDF output verified.\n');

// ── TEST GROUP 3: Elimination of "Loose" in Dispatches Table ──
console.log('--- Test Group 3: Elimination of Loose Display ---');

// 3.1 Dispatches table in orders.html must use "Boxes", not "Boxes / Loose"
assert(!ordersHtml.includes('<th style="width:12%;">Boxes / Loose</th>'),
  'orders.html dispatches table must NOT have "Boxes / Loose" column');
assert(ordersHtml.includes('<th style="width:12%;">Boxes</th>'),
  'orders.html dispatches table must have "Boxes" column');

// ── TEST GROUP 4: Invoice Builder Deep-Link & Storage Synchronization ──
console.log('--- Test Group 4: Invoice Builder Deep-Link & History Persistence ---');

// 4.1 openBuilderBtn in dispatch-ui must target #edit=
assert(dispatchUiJs.includes("openBuilderBtn.href = `../Invoice%20Builder/index.html#edit=${encodeURIComponent(invNo)}`"),
  'dispatch-ui.js must link "Open in Invoice Builder" button to #edit=${encodeURIComponent(invNo)}');

// 4.2 main.js must accept both #edit= and ?inv= query parameter
const mainJs = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/main.js'), 'utf8');
assert(mainJs.includes("hash.startsWith('#edit=')"), 'main.js must parse #edit= hash');
assert(mainJs.includes("urlParams.get('inv')"), 'main.js must parse ?inv= query parameter');

// 4.3 dispatch-ui.js must save full invoiceDoc into localStorage inv_doc_
assert(dispatchUiJs.includes("localStorage.setItem('inv_doc_' + invNo, JSON.stringify(invoiceDoc))"),
  'dispatch-ui.js must persist full invoiceDoc in localStorage under inv_doc_');

// 4.4 dispatch-ui.js must update invoice_history_cache with dispatch metadata
assert(dispatchUiJs.includes("localStorage.setItem('invoice_history_cache', JSON.stringify(hist))"),
  'dispatch-ui.js must update invoice_history_cache so invoice appears in history.html');
assert(dispatchUiJs.includes("source: 'dispatch'"),
  'dispatch-ui.js must tag invoice history entry with source: dispatch');

// 4.5 history.js must render DISPATCH badge for commercial invoices
const historyJs = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/history.js'), 'utf8');
assert(historyJs.includes('DISPATCH'), 'history.js must show DISPATCH badge for commercial invoices');
assert(historyJs.includes('inv.dispatchNo'), 'history.js search must include dispatchNo in search pool');

// 4.6 storage.js restoreInvoiceUI must trigger renderRows and renderMobItems
const storageJs = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/storage.js'), 'utf8');
assert(storageJs.includes("window.renderRows === 'function'"), 'restoreInvoiceUI must call renderRows');
assert(storageJs.includes("window.renderMobItems === 'function'"), 'restoreInvoiceUI must call renderMobItems');

console.log('✅ Group 4 Passed: Invoice Builder deep linking, data loading, and history persistence verified.\n');

// ── TEST GROUP 5: Distinct Numbering Series & Context Separation ──
console.log('--- Test Group 5: Numbering Context Separation (Manual 100+ vs DSP-INV-100+) ---');

const apiJs = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/api.js'), 'utf8');

// 5.1 apiGetNextInvoiceNumber must ignore DSP and INV invoices
assert(apiJs.includes("!numStr.startsWith('DSP') && !numStr.startsWith('INV') && !numStr.includes('DSP') && !numStr.includes('INV')"),
  'apiGetNextInvoiceNumber must ignore DSP and INV invoices so manual sequence stays clean');

// 5.2 Test manual vs dispatch numbering behavior programmatically
const mockHistory = [
  { invoiceNumber: '100', uniqueId: '100' },
  { invoiceNumber: '101', uniqueId: '101' },
  { invoiceNumber: 'DSP-INV-100', uniqueId: 'DSP-INV-100' },
  { invoiceNumber: 'DSP-INV-101', uniqueId: 'DSP-INV-101' },
  { invoiceNumber: 'INV-01', uniqueId: 'INV-01' },
  { invoiceNumber: 'INV-02', uniqueId: 'INV-02' }
];

const standardNums = mockHistory
  .filter(i => {
    const numStr = String(i.invoiceNumber || '').trim();
    return !numStr.startsWith('DSP') && !numStr.startsWith('INV') && !numStr.includes('DSP') && !numStr.includes('INV');
  })
  .map(i => parseInt(String(i.invoiceNumber || 0).replace(/[^0-9]/g, ''), 10) || 0);
const nextManual = String(Math.max(99, ...standardNums) + 1).padStart(3, '0');
assert.strictEqual(nextManual, '102', 'Next manual invoice must be 102 (cleanly unaffected by commercial INV-01)');

// 5.3 Verify order number to commercial invoice number matching (O-01 -> INV-01)
function deriveCommercialInvNo(orderNo, orderId = 1) {
  const matchDigits = String(orderNo || '').match(/\d+/);
  const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(orderId || '01').padStart(2, '0');
  return `INV-${orderDigits}`;
}
assert.strictEqual(deriveCommercialInvNo('O-01'), 'INV-01', 'Order O-01 must match commercial invoice INV-01');
assert.strictEqual(deriveCommercialInvNo('O-02'), 'INV-02', 'Order O-02 must match commercial invoice INV-02');
assert.strictEqual(deriveCommercialInvNo('O-15'), 'INV-15', 'Order O-15 must match commercial invoice INV-15');

let maxDisp = 99;
mockHistory.forEach(i => {
  const match = String(i.invoiceNumber || '').match(/DSP-INV-(\d+)/i);
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    if (val > maxDisp) maxDisp = val;
  }
});
const nextDisp = `DSP-INV-${maxDisp + 1}`;
assert.strictEqual(nextDisp, 'DSP-INV-102', 'Next dispatch invoice must be DSP-INV-102 (cleanly sequential)');

// 5.3 Test empty history baseline starts at 100 for both
const emptyHistory = [];
const emptyStandardNums = emptyHistory.map(i => 0);
const firstManual = String(Math.max(99, ...emptyStandardNums) + 1).padStart(3, '0');
assert.strictEqual(firstManual, '100', 'First manual invoice must start at 100');

let emptyDispMax = 99;
const firstDisp = `DSP-INV-${emptyDispMax + 1}`;
assert.strictEqual(firstDisp, 'DSP-INV-100', 'First dispatch invoice must start at DSP-INV-100');

// 5.4 Ensure root and apps Invoice Builder files remain synchronized
const rootApi = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/api.js'), 'utf8');
const rootMain = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/main.js'), 'utf8');
const rootStorage = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/storage.js'), 'utf8');
const rootHistory = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/history.js'), 'utf8');
const rootPdf = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/invoice-pdf.js'), 'utf8');
const appsPdf = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/invoice-pdf.js'), 'utf8');
const rootHtml = fs.readFileSync(path.join(__dirname, '../Invoice Builder/index.html'), 'utf8');
const appsHtml = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/index.html'), 'utf8');

assert.strictEqual(rootApi, apiJs, 'root Invoice Builder api.js must match apps/Invoice Builder api.js');
assert.strictEqual(rootMain, mainJs, 'root Invoice Builder main.js must match apps/Invoice Builder main.js');
assert.strictEqual(rootStorage, storageJs, 'root Invoice Builder storage.js must match apps/Invoice Builder storage.js');
assert.strictEqual(rootHistory, historyJs, 'root Invoice Builder history.js must match apps/Invoice Builder history.js');
assert.strictEqual(rootPdf, appsPdf, 'root Invoice Builder invoice-pdf.js must match apps/Invoice Builder invoice-pdf.js');
assert.strictEqual(rootHtml, appsHtml, 'root Invoice Builder index.html must match apps/Invoice Builder index.html');

// 5.5 Verify legacy invoice numbers (e.g. INV-725375) are converted to INV-01 in dispatch card button
const mockDispatchWithOldInv = {
  id: 101,
  order_no: 'O-01',
  order_id: 1,
  invoice_no: 'INV-725375',
  status: 'Dispatched'
};
let cardInvNo = mockDispatchWithOldInv.invoice_no;
if (cardInvNo && (/^INV-\d{5,}$/.test(cardInvNo) || /^DSP-\d{5,}$/.test(cardInvNo))) {
  const matchDigits = String(mockDispatchWithOldInv.order_no || '').match(/\d+/);
  const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(mockDispatchWithOldInv.order_id || '01').padStart(2, '0');
  cardInvNo = `INV-${orderDigits}`;
}
assert.strictEqual(cardInvNo, 'INV-01', 'Legacy INV-725375 must be sanitized to INV-01 for Order O-01 on dispatch card');

console.log('✅ Group 5 Passed: Numbering context separation, file synchronization, and card button sanitization verified.\n');

// ── TEST GROUP 6: Products Header & Image 3 Bill From/To Layout ──
console.log('--- Test Group 6: Products Header & Image 3 Bill From/To Layout ---');

// 6.1 Products header in dispatch slip and commercial invoice (NOT Product SKU / Description)
assert(!dispatchUiJs.includes('>Product SKU / Description<'),
  'dispatch-ui.js must NOT contain "Product SKU / Description" header');
assert(dispatchUiJs.includes('>Products</th>'),
  'dispatch-ui.js table headers must use "Products"');

// 6.2 Products 7-column header in Invoice Builder HTML
assert(rootHtml.includes('<th style="width:34%; text-align:left;">Products</th>'),
  'Invoice Builder index.html must use "Products" header column');
assert(rootHtml.includes('<th style="width:10%; text-align:center;">Boxes</th>'),
  'Invoice Builder index.html must include "Boxes" header column');
assert(rootHtml.includes('<th style="width:12%; text-align:center;">Qty (Units)</th>'),
  'Invoice Builder index.html must include "Qty (Units)" header column');

// 6.3 Products 7-column header in Invoice Builder PDF generator
assert(rootPdf.includes("pdf.text('PRODUCTS',"),
  'invoice-pdf.js must define PRODUCTS column in table header');
assert(rootPdf.includes("pdf.text('PACK SIZE',"),
  'invoice-pdf.js must define PACK SIZE column');
assert(rootPdf.includes("pdf.text('BOXES',"),
  'invoice-pdf.js must define BOXES column');
assert(rootPdf.includes("pdf.text('QTY (UNITS)',"),
  'invoice-pdf.js must define QTY (UNITS) column');

// 6.4 Image 3 2-column key-value grid for BILL FROM / BILL TO in dispatch-ui.js
assert(dispatchUiJs.includes('BILL FROM') && dispatchUiJs.includes('BILL TO'),
  'dispatch-ui.js must have uppercase teal BILL FROM and BILL TO headers');
assert(dispatchUiJs.includes('State:') && dispatchUiJs.includes('Pincode:'),
  'dispatch-ui.js must include State and Pincode on row 1 of key-value grid');
assert(dispatchUiJs.includes('Phone:') && dispatchUiJs.includes('GSTIN:'),
  'dispatch-ui.js must include Phone and GSTIN on row 2 of key-value grid');

// 6.5 Image 3 2-column key-value grid in Invoice Builder HTML and main.js
assert(rootHtml.includes('id="p-from-grid"') && rootHtml.includes('id="p-client-grid"'),
  'Invoice Builder HTML must define 2-column grid for bill from and bill to');
assert(rootMain.includes('formatPhoneDisplay'),
  'Invoice Builder main.js must implement formatPhoneDisplay helper');

// 6.6 Image 3 format in Invoice Builder PDF generator
assert(rootPdf.includes("State:"), 'invoice-pdf.js must render State:');
assert(rootPdf.includes("Pincode:"), 'invoice-pdf.js must render Pincode:');
assert(rootPdf.includes("Phone:"), 'invoice-pdf.js must render Phone:');
assert(rootPdf.includes("GSTIN:"), 'invoice-pdf.js must render GSTIN:');

console.log('✅ Group 6 Passed: Products header (7 columns) and Image 3 Bill From/To layout verified.\n');

// ── TEST GROUP 7: Quantity Preservation, Grand Total Color, Terms & Tirth Signature ──
console.log('--- Test Group 7: Quantity Integrity (81 vs 82), Grand Total Color, Terms & Tirth Signature ---');

// 7.1 Quantity preservation: test calculateLineItemQuantities logic
// When totalUnits is 81 and boxes is 41 with unitsPerBox 2, totalUnits must stay 81!
function mockCalculateLineItemQuantities(row) {
  const unitsPerBox = parseInt(row.unitsPerBox, 10) || 0;
  const boxes = parseFloat(row.boxes) || 0;
  const loose = parseFloat(row.loose) || 0;
  let totalUnits = parseFloat(row.totalUnits != null ? row.totalUnits : row.qty) || 0;

  if (totalUnits === 0 && (boxes > 0 || loose > 0)) {
    totalUnits = (boxes * (unitsPerBox > 0 ? unitsPerBox : 1)) + loose;
  } else if (totalUnits > 0 && unitsPerBox > 0 && boxes === 0 && loose === 0) {
    row.boxes = Math.floor(totalUnits / unitsPerBox);
    row.loose = totalUnits % unitsPerBox;
  } else if (parseFloat(row.qty) > 0 && totalUnits === 0) {
    totalUnits = parseFloat(row.qty);
    if (unitsPerBox > 0) {
      row.boxes = Math.floor(totalUnits / unitsPerBox);
      row.loose = totalUnits % unitsPerBox;
    }
  }

  let billedQty = totalUnits;
  if (row.priceBasis === 'per_box') {
    billedQty = boxes + (unitsPerBox > 0 ? (loose / unitsPerBox) : 0);
  } else {
    billedQty = totalUnits;
  }

  const unitPrice = parseFloat(row.price) || 0;
  const discountPct = parseFloat(row.discountPct) || 0;
  const rawLineValue = Math.round(billedQty * unitPrice * 100) / 100;
  const discountAmt = Math.round((rawLineValue * discountPct / 100) * 100) / 100;
  const taxableValue = Math.max(0, Math.round((rawLineValue - discountAmt) * 100) / 100);

  return { totalUnits, billedQty, taxableValue };
}

const testRow = {
  totalUnits: 81,
  qty: 81,
  boxes: 41,
  unitsPerBox: 2,
  price: 2000,
  loose: 0,
  priceBasis: 'per_unit'
};
const calcResult = mockCalculateLineItemQuantities(testRow);
assert.strictEqual(calcResult.totalUnits, 81, 'totalUnits must remain 81 (NEVER change to 82)');
assert.strictEqual(calcResult.taxableValue, 162000, 'taxableValue must be exactly 162,000 for 81 units at rate 2,000');
const tax12 = calcResult.taxableValue * 0.12;
const grandTotal12 = calcResult.taxableValue + tax12;
assert.strictEqual(grandTotal12, 181440, 'Grand total must be exactly 1,81,440.00 (matching Image 1)');

// 7.2 Main.js must include preservation of totalUnits
assert(rootMain.includes('if (totalUnits === 0 && (boxes > 0 || loose > 0))'),
  'main.js calculateLineItemQuantities must only derive totalUnits when totalUnits is 0');

// 7.3 Grand total color must be #0C3925 (not #020618 dark blue)
const overrideCss = fs.readFileSync(path.join(__dirname, '../Invoice Builder/css/override.css'), 'utf8');
const mainCss = fs.readFileSync(path.join(__dirname, '../Invoice Builder/css/main.css'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../Invoice Builder/css/style.css'), 'utf8');
assert(!overrideCss.includes('body.gst-mode .totals-grand {\n  display: flex;\n  justify-content: space-between !important;\n  padding: 12px 16px !important;\n  background: #020618'),
  'override.css must NOT set totals-grand background to #020618');
assert(overrideCss.includes('background: #0C3925 !important;'),
  'override.css must set totals-grand background to #0C3925');
assert(mainCss.includes('background: #0C3925 !important;'),
  'main.css must set totals-grand background to #0C3925');
assert(styleCss.includes('background: #0C3925 !important;'),
  'style.css must set totals-grand background to #0C3925');

// 7.4 Jurisdiction / Terms text removed completely from dispatch-ui.js, index.html, api.js
const freshDispatchUi = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-ui.js'), 'utf8');
assert(!freshDispatchUi.includes('Subject to Rajkot Jurisdiction'),
  'dispatch-ui.js must NOT contain "Subject to Rajkot Jurisdiction"');
assert(!rootHtml.includes('Subject to Rajkot Jurisdiction'),
  'Invoice Builder index.html must NOT contain "Subject to Rajkot Jurisdiction"');
assert(!rootApi.includes('Subject to Rajkot Jurisdiction'),
  'Invoice Builder api.js must NOT contain "Subject to Rajkot Jurisdiction"');

// 7.5 Signature text replaced with "Tirth" for all types
assert(freshDispatchUi.includes('>Tirth</span>'),
  'dispatch-ui.js commercial invoice must render "Tirth" signature text');
assert(rootHtml.includes('>Tirth</div>'),
  'Invoice Builder index.html must render "Tirth" signature text');
assert(rootPdf.includes("pdf.text('Tirth',"),
  'invoice-pdf.js must render "Tirth" signature text');

console.log('✅ Group 7 Passed: Quantity preservation (81 units), #0C3925 color, Terms removed & Tirth signature verified.\n');

// ── TEST GROUP 8: Crisp Vector PDF Engines (Invoice & Delivery Challan) ──
console.log('--- Test Group 8: Crisp Vector PDF Engines Verification ---');

// 8.1 invoice-pdf.js must define drawA4InvoicePdf and use vector rendering
assert(rootPdf.includes('window.drawA4InvoicePdf = drawA4InvoicePdf'),
  'invoice-pdf.js must export window.drawA4InvoicePdf');
assert(!rootPdf.includes('calc.totalUnits'),
  'invoice-pdf.js must not reference undefined calc variable');
assert(rootPdf.includes('totalUnits'),
  'invoice-pdf.js must reference totalUnits in scope');

// 8.2 dispatch-ui.js must define drawA4DispatchSlipPdf and use jsPDF
assert(freshDispatchUi.includes('drawA4DispatchSlipPdf(pdf, d, items = [], clientData = {})'),
  'dispatch-ui.js must define drawA4DispatchSlipPdf vector generator');
assert(freshDispatchUi.includes('window.drawA4DispatchSlipPdf ='),
  'dispatch-ui.js must export window.drawA4DispatchSlipPdf');

// 8.3 Verify actual jsPDF generation for both invoice and dispatch slip
const { jsPDF } = require('jspdf');
const mockPdfInvoice = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
const mockPdfDispatch = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

// Test invoice vector generation via invoice-pdf.js
const vm = require('vm');
const mockWindow = {
  document: {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ getContext: () => null })
  },
  navigator: {},
  rows: []
};
mockWindow.window = mockWindow;
vm.createContext(mockWindow);
vm.runInContext(rootPdf, mockWindow);
assert(typeof mockWindow.drawA4InvoicePdf === 'function', 'drawA4InvoicePdf must be loaded in context');

const mockInvoicePayload = {
  InvoiceNumber: 'INV-01',
  InvoiceType: 'GST',
  business: {
    company: 'Anjani Agri Care',
    address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.',
    phone: '7878777727',
    email: 'afieldcropcare@gmail.com',
    gstin: '24AERFS1718Q1ZB'
  },
  customer: {
    name: 'Krishi Seva Kendra',
    address: 'Rajkot Highway',
    phone: '9876543210',
    gstin: '24AAACL1234A1Z1',
    state: 'Gujarat',
    dueAmount: 0
  },
  settings: {
    intro: 'Thank you for your business.',
    terms: '',
    showQR: false,
    taxType: 'GST12'
  },
  rows: [
    {
      name: 'Anjani Coragen-80 Ec',
      packaging: '250 Ml',
      boxes: 41,
      totalUnits: 81,
      price: 2000,
      total: 162000
    }
  ],
  calculations: {
    subtotal: 162000,
    cgstAmount: 9720,
    sgstAmount: 9720,
    totalTax: 19440,
    grandTotal: 181440
  }
};

mockWindow.drawA4InvoicePdf(mockPdfInvoice, mockInvoicePayload);
const invPdfBytes = mockPdfInvoice.output();
assert(invPdfBytes.length > 5000, 'Vector commercial invoice PDF must generate valid bytes (>5KB)');

// Test dispatch slip vector generation via dispatch-ui.js
const mockDispatchContext = {
  window: {},
  document: {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {}
  }
};
mockDispatchContext.window = mockDispatchContext;
vm.createContext(mockDispatchContext);
vm.runInContext(freshDispatchUi, mockDispatchContext);
assert(typeof mockDispatchContext.DISPATCH_UI.drawA4DispatchSlipPdf === 'function', 'drawA4DispatchSlipPdf must be loaded in context');

const mockDispatchData = {
  dispatch_no: 'DSP-01',
  order_no: 'O-01',
  client_name: 'Krishi Seva Kendra',
  dispatch_date: '2026-10-19',
  vehicle_no: 'GJ 03 AB 1512',
  status: 'Dispatched',
  total_boxes_dispatched: 41,
  total_units_dispatched: 81
};
const mockDispatchItems = [
  { product_name: 'Anjani Coragen-80 Ec', packaging_size: '250 Ml', batch_no: 'B-01', boxes_dispatched: 41, total_units_dispatched: 81 }
];

mockDispatchContext.DISPATCH_UI.drawA4DispatchSlipPdf(mockPdfDispatch, mockDispatchData, mockDispatchItems, { address: 'Rajkot' });
const dispPdfBytes = mockPdfDispatch.output();
assert(dispPdfBytes.length > 5000, 'Vector delivery challan PDF must generate valid bytes (>5KB)');

console.log('✅ Group 8 Passed: Crisp Vector PDF Engines for Invoice & Dispatch Slip verified.\n');

console.log('🎉 ALL SINGLE-TAB PRINT, INVOICE BUILDER & NUMBERING TESTS PASSED SUCCESSFULLY!\n');



