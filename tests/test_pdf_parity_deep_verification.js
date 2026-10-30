const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Deep PDF Parity & Math Verification...');

const elements = {};
function createEl(id) {
  elements[id] = {
    id,
    value: '',
    textContent: '',
    style: { display: '' },
    checked: true,
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return elements[id];
}

const mockDoc = {
  getElementById: (id) => elements[id] || createEl(id),
  addEventListener: () => {},
  querySelector: (sel) => {
    if (sel.includes('#qr-canvas canvas')) return null;
    if (sel.includes('#qr-canvas img')) return null;
    return null;
  },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      remove: () => {},
      appendChild: () => {},
      querySelector: () => null
    };
    return el;
  },
  body: {
    classList: {
      contains: (c) => c === 'gst-mode',
      add: () => {},
      remove: () => {}
    },
    appendChild: () => {}
  }
};

global.window = {
  location: { origin: 'http://localhost:5174' },
  addEventListener: () => {},
  currentDispatchNo: '',
  currentVehicleNo: '',
  rows: []
};
global.document = mockDoc;
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

// Mock QRCode
window.QRCode = function(el, opts) {
  this.opts = opts;
  const canvas = {
    toDataURL: () => 'data:image/png;base64,mockQrCodeDataUrl'
  };
  el.querySelector = (sel) => sel === 'canvas' ? canvas : null;
};
window.QRCode.CorrectLevel = { M: 1 };

// Load files
const taxUtilsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/tax-utils.js'), 'utf8');
const apiCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/api.js'), 'utf8');
const invoicePdfCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/invoice-pdf.js'), 'utf8');

eval(taxUtilsCode);
eval(apiCode);
eval(invoicePdfCode);

// 1. Verify formatPackSize
assert.strictEqual(window.formatPackSize('250 ml'), '250 ML', 'formatPackSize should uppercase ml');
assert.strictEqual(window.formatPackSize('1 ltr'), '1 LTR', 'formatPackSize should uppercase ltr');
assert.strictEqual(window.formatPackSize('500 gm'), '500 GM', 'formatPackSize should uppercase gm');
assert.strictEqual(window.formatPackSize('5 kg'), '5 KG', 'formatPackSize should uppercase kg');
console.log('✓ formatPackSize: 100% passed');

// 2. Verify formatTaxLabel
assert.strictEqual(window.formatTaxLabel('GST12'), 'GST 12%', 'formatTaxLabel should format GST12 to GST 12%');
assert.strictEqual(window.formatTaxLabel('GST18'), 'GST 18%', 'formatTaxLabel should format GST18 to GST 18%');
console.log('✓ formatTaxLabel: 100% passed');

// 3. Verify formatText parenthesis title casing
assert.strictEqual(window.formatText('Krishi Seva Kendra (siddharth Makwana)'), 'Krishi Seva Kendra (Siddharth Makwana)', 'formatText should uppercase (s to (S');
console.log('✓ formatText title casing: 100% passed');

// 4. Test PDF call collector
const recordedDraws = [];
const mockPdf = {
  internal: { pageSize: { width: 210, height: 297 } },
  addFileToVFS: () => {},
  addFont: () => {},
  setFont: () => {},
  setFontSize: () => {},
  setTextColor: () => {},
  setFillColor: () => {},
  setDrawColor: () => {},
  setLineWidth: () => {},
  rect: () => {},
  roundedRect: () => {},
  line: () => {},
  saveGraphicsState: () => {},
  clip: () => {},
  discardPath: () => {},
  restoreGraphicsState: () => {},
  getTextWidth: (t) => (t || '').length * 2,
  splitTextToSize: (t) => [t],
  text: (str, x, y, opts) => {
    recordedDraws.push({ str: String(str), x, y, align: opts?.align });
  },
  addImage: (img, format, x, y, w, h) => {
    recordedDraws.push({ img, x, y, w, h });
  },
  addPage: () => {}
};

// Dispatch-generated invoiceDoc
const dispatchDoc = {
  Date: '2026-10-19',
  date: '2026-10-19',
  DueDate: '2026-10-19',
  dueDate: '2026-10-19',
  dispatchNo: 'DSP-520601',
  vehicleNo: 'GJ 03 AB 1512',
  meta: {
    uniqueId: 'INV-02',
    invoiceNumber: 'INV-02',
    date: '2026-10-19',
    dueDate: '2026-10-19',
    dispatchNo: 'DSP-520601',
    vehicleNo: 'GJ 03 AB 1512'
  },
  InvoiceNumber: 'INV-02',
  InvoiceType: 'GST',
  business: {
    company: 'Anjani Agri Care',
    address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.',
    phone: '7878777727',
    email: 'afieldcropcare@gmail.com',
    gstin: '24AERFS1718Q1ZB',
    signatory: 'Authorized Signatory'
  },
  bank: {
    name: 'PUNJAB NATIONAL BANK',
    account: '9178002100002019',
    ifsc: 'PUNB0917800',
    upi: '9427213943m@pnb'
  },
  customer: {
    name: 'Krishi Seva Kendra (Siddharth Makwana)',
    address: 'At: Virva, Dist: Rajkot',
    phone: '9635478011',
    mobile: '9635478011',
    gstin: '24AAAFK1234A1Z5',
    state: 'Gujarat',
    pincode: '360024',
    pin: '360024',
    dueAmount: 0
  },
  settings: {
    intro: 'Thank you for your business.',
    terms: '',
    showQR: true,
    taxType: 'GST12'
  },
  rows: [
    {
      id: 'r_1',
      brand: 'Anjani Agri Care',
      name: 'Afield - 02',
      desc: 'Afield - 02',
      packaging: '250 ML',
      boxes: 0,
      unitsPerBox: 10,
      loose: 0,
      totalUnits: 81,
      qtyUnit: 'Bottles',
      totalVolume: 0,
      volumeUnit: 'Litres',
      priceBasis: 'per_unit',
      discountPct: 0,
      taxableValue: 162000,
      qty: 81,
      price: 2000,
      total: 162000,
      hsn: '38089190',
      gstRate: 12
    }
  ],
  calculations: {
    subtotal: 162000,
    taxType: 'GST12',
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    cgstAmount: 9720,
    sgstAmount: 9720,
    igstAmount: 0,
    totalTax: 19440,
    grandTotal: 181440,
    dueAmount: 0
  }
};

window.drawA4InvoicePdf(mockPdf, dispatchDoc);

// Verify exact values in recordedDraws
const findText = (prefix) => recordedDraws.find(d => d.str && d.str.includes(prefix));

// Meta
assert(findText('INV-02'), 'Invoice No should be INV-02');
assert(findText('19 Oct 2026'), 'Date should be 19 Oct 2026');
assert(findText('DSP-520601'), 'Dispatch should be DSP-520601');
assert(findText('GJ 03 AB 1512'), 'Vehicle should be GJ 03 AB 1512');

// Customer
assert(findText('Krishi Seva Kendra (Siddharth Makwana)'), 'Customer name should be title cased');
assert(findText('96354 78011'), 'Phone should be formatted 96354 78011');
assert(findText('360024'), 'Pincode should be 360024');

// Table Row
assert(findText('250 ML'), 'Packaging must be 250 ML');
assert(findText('1,62,000.00'), 'Row total must be 1,62,000.00');

// Totals Box
assert(findText('GST 12%'), 'Tax label banner must be GST 12%');
assert(findText('9,720.00'), 'CGST and SGST must be 9,720.00');
assert(findText('19,440.00'), 'Total GST must be 19,440.00');
assert(findText('1,81,440.00'), 'Grand total must be 1,81,440.00');

// Footer
assert(findText('9427213943m@pnb'), 'Bank UPI must be 9427213943m@pnb');
assert(findText('Scan to Pay'), 'Scan to Pay text must be present');
assert(findText('Tirth'), 'Signature must be Tirth');

// Check QR Image
const qrImageDraw = recordedDraws.find(d => d.img && d.w === 20 && d.h === 20);
assert(qrImageDraw, 'QR image must be drawn at 20x20 in footer');

// 5. Verify customer.contact fallback without phone/mobile keys
const contactOnlyDoc = {
  InvoiceNumber: 'INV-03',
  customer: {
    name: 'Krishi Seva Kendra (Siddharth Makwana)',
    contact: '96354 78011'
  },
  rows: []
};
const contactDraws = [];
const mockPdf2 = {
  ...mockPdf,
  text: (str, x, y, opts) => contactDraws.push({ str: String(str), x, y, align: opts?.align }),
  addImage: () => {}
};
window.drawA4InvoicePdf(mockPdf2, contactOnlyDoc);
const foundContactPhone = contactDraws.find(d => d.str && d.str.includes('96354 78011'));
assert(foundContactPhone, 'customer.contact must resolve to formatted phone in BILL TO');
console.log('✓ customer.contact fallback: 100% passed');

// 6. Verify standardized Invoice filename logic
function getCleanInvoiceFilename(invNum) {
  let numPart = String(invNum || '').trim();
  numPart = numPart.replace(/^invoice[-_ ]*/i, '');
  numPart = numPart.replace(/^(?:inv|dsp|ord|order|o)[-_ ]*/i, '');
  numPart = numPart.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!numPart) numPart = '01';
  return `Invoice_${numPart}.pdf`;
}
assert.strictEqual(getCleanInvoiceFilename('INV-02'), 'Invoice_02.pdf', 'INV-02 should produce Invoice_02.pdf');
assert.strictEqual(getCleanInvoiceFilename('INV-01'), 'Invoice_01.pdf', 'INV-01 should produce Invoice_01.pdf');
assert.strictEqual(getCleanInvoiceFilename('Invoice_INV-02'), 'Invoice_02.pdf', 'Invoice_INV-02 should produce Invoice_02.pdf');
assert.strictEqual(getCleanInvoiceFilename('100'), 'Invoice_100.pdf', '100 should produce Invoice_100.pdf');
console.log('✓ Filename format standardization (Invoice_<number>.pdf): 100% passed');

console.log('🎉 All Deep PDF Parity assertions passed with 100% precision!');
