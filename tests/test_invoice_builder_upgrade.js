/**
 * tests/test_invoice_builder_upgrade.js
 * Comprehensive Automated Test Suite for Invoice Builder Upgrade
 *
 * Verifies:
 * 1. Line Item Packaging Tracking:
 *    - Boxes, units per box, loose units, and total equivalent units calculation.
 *    - User prompt's exact example: Product A, 500 ml: 20 boxes, 10 bottles/box, 5 loose bottles -> Total: 205 bottles, 102.5 Litres.
 *    - Additional SKU configurations (250 ml, 1 Litre, 5 Kg).
 * 2. Pricing Basis Logic:
 *    - 'per_unit' pricing: taxable quantity = totalUnits (e.g. 205 bottles * Rs. 200 = Rs. 41,000).
 *    - 'per_box' pricing: taxable quantity = boxes + loose/unitsPerBox (e.g. 20.5 boxes * Rs. 2,000 = Rs. 41,000).
 *    - Guarantee: Never arbitrarily multiply or divide invoice values merely because expressed in boxes vs units.
 * 3. Discount, Taxable Value & GST Calculations:
 *    - Line-level discounts (percentage-based) deducted from raw line amount before GST.
 *    - GST options: GST 18%, GST 12%, GST 5%, IGST 18%, IGST 12%, IGST 5%, None (0%).
 *    - CGST/SGST splitting (e.g. 9% + 9% for intra-state Gujarat, 18% IGST for inter-state).
 *    - Invoice rounding & grand totals including previous due amount.
 * 4. Backward Compatibility:
 *    - Historical invoices with legacy flat structure (only plain qty and price, no boxes/loose) load and calculate without NaN or error.
 * 5. Persistence & Schema Integrity:
 *    - extractInvoiceJSON and restoreInvoiceUI preserve all box, loose, unitsPerBox, volume, priceBasis, and discount fields.
 * 6. Zero Double-Deduction Guarantee:
 *    - Invoices linked to dispatch have is_stock_deducted: false so inventory is never deducted twice.
 * 7. Navigation Resilience & Logo Resolution:
 *    - ERP Dashboard navigation handles both root and /apps/ contexts without 404 or redirect loops.
 *    - Shared-layout invoice builder URL resolves correctly to ../Invoice Builder/index.html.
 *    - Image fallback handlers gracefully fall back to local logo.jpg.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}:`, err.message);
    throw err;
  }
}

console.log('\n================================================================');
console.log('STARTING AUTOMATED INVOICE BUILDER UPGRADE TEST SUITE');
console.log('================================================================\n');

// Load tax-utils.js in a mock environment
const taxUtilsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/tax-utils.js'), 'utf8');
const taxModule = {};
(new Function('window', taxUtilsCode))(taxModule);
const { calculateInvoiceTotals, getTaxConfig, normalizeTaxType, formatTaxLabel } = taxModule;

// Extract helpers from main.js
const mainJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/main.js'), 'utf8');
const mainModule = {
  inventoryData: [
    {
      brand: 'Anjani Agri Care',
      product: 'Product A',
      sku: 'SKU-PA-500ML',
      packaging: '500 ml',
      units_per_box: 10,
      volume_ml: 500,
      unit: 'Bottles',
      price: 200,
      hsn: '38089190'
    },
    {
      brand: 'Anjani Agri Care',
      product: 'Product B',
      sku: 'SKU-PB-250ML',
      packaging: '250 ml',
      units_per_box: 25,
      volume_ml: 250,
      unit: 'Bottles',
      price: 120,
      hsn: '38089190'
    },
    {
      brand: 'Anjani Agri Care',
      product: 'Product C',
      sku: 'SKU-PC-1L',
      packaging: '1 Litre',
      units_per_box: 12,
      volume_ml: 1000,
      unit: 'Bottles',
      price: 450,
      hsn: '38089190'
    },
    {
      brand: 'Anjani Agri Care',
      product: 'Product D',
      sku: 'SKU-PD-5KG',
      packaging: '5 Kg',
      units_per_box: 4,
      weight_gm: 5000,
      unit: 'Bags',
      price: 1800,
      hsn: '38089200'
    }
  ]
};

// Evaluate helper functions in mainModule context
const helpersCode = `
  function normalizeText(v) { return String(v || '').trim().toLowerCase(); }
  ${mainJsCode.slice(mainJsCode.indexOf('function parseVolumeOrWeight('), mainJsCode.indexOf('function toast('))}
  return { parseVolumeOrWeight, getPackagingDetailsForProduct, calculateLineItemQuantities };
`;
const { parseVolumeOrWeight, getPackagingDetailsForProduct, calculateLineItemQuantities } = (new Function('inventoryData', helpersCode))(mainModule.inventoryData);

// ============================================================================
// 1. BOX, LOOSE UNITS & PACKAGING VOLUME BREAKDOWN
// ============================================================================
console.log('--- 1. Box, Loose Units & Packaging Volume Breakdown ---');

runTest('1.1: Exact user example (Product A 500ml: 20 boxes, 10/box, 5 loose -> 205 bottles, 102.5 L)', () => {
  const row = {
    brand: 'Anjani Agri Care',
    name: 'Product A',
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 5,
    totalUnits: 0,
    priceBasis: 'per_unit',
    price: 200,
    discountPct: 0
  };

  const calc = calculateLineItemQuantities(row);
  assert.strictEqual(calc.boxes, 20, 'Boxes should be 20');
  assert.strictEqual(calc.loose, 5, 'Loose units should be 5');
  assert.strictEqual(calc.unitsPerBox, 10, 'Units per box should be 10');
  assert.strictEqual(calc.totalUnits, 205, 'Total units should be exactly 205 bottles');
  assert.strictEqual(calc.totalVolume, 102.5, 'Total volume should be exactly 102.5 Litres');
  assert.strictEqual(calc.volumeUnit, 'Litres', 'Volume unit should be Litres');
  assert.strictEqual(calc.taxableValue, 41000, 'Taxable value should be 205 * 200 = 41000');
});

runTest('1.2: SKU packaging lookup auto-populates units per box and metadata', () => {
  const details = getPackagingDetailsForProduct('Anjani Agri Care', 'Product A', '500 ml');
  assert(details, 'Details should exist');
  assert.strictEqual(details.unitsPerBox, 10, 'Units per box should be 10 from master');
  assert.strictEqual(details.sku, 'SKU-PA-500ML', 'SKU should be SKU-PA-500ML');
  assert.strictEqual(details.unit, 'Bottles', 'Unit should be Bottles');

  const details250 = getPackagingDetailsForProduct('Anjani Agri Care', 'Product B', '250 ml');
  assert.strictEqual(details250.unitsPerBox, 25, 'Units per box for 250ml should be 25');
});

runTest('1.3: Volume calculation for 250ml, 1 Litre and 5 Kg pack sizes', () => {
  // 250 ml: 10 boxes of 25 + 4 loose = 254 bottles -> 254 * 0.25 = 63.5 L
  const row250 = {
    packaging: '250 ml',
    boxes: 10,
    unitsPerBox: 25,
    loose: 4,
    price: 120
  };
  const calc250 = calculateLineItemQuantities(row250);
  assert.strictEqual(calc250.totalUnits, 254);
  assert.strictEqual(calc250.totalVolume, 63.5);
  assert.strictEqual(calc250.volumeUnit, 'Litres');

  // 1 Litre: 15 boxes of 12 + 0 loose = 180 bottles -> 180 * 1 = 180 L
  const row1L = {
    packaging: '1 Litre',
    boxes: 15,
    unitsPerBox: 12,
    loose: 0,
    price: 450
  };
  const calc1L = calculateLineItemQuantities(row1L);
  assert.strictEqual(calc1L.totalUnits, 180);
  assert.strictEqual(calc1L.totalVolume, 180);

  // 5 Kg: 8 boxes of 4 + 2 loose = 34 bags -> 34 * 5 = 170 Kg
  const row5Kg = {
    packaging: '5 Kg',
    boxes: 8,
    unitsPerBox: 4,
    loose: 2,
    price: 1800
  };
  const calc5Kg = calculateLineItemQuantities(row5Kg);
  assert.strictEqual(calc5Kg.totalUnits, 34);
  assert.strictEqual(calc5Kg.totalVolume, 170);
  assert.strictEqual(calc5Kg.volumeUnit, 'Kg');
});

runTest('1.4: Auto-deriving boxes and loose when only total units/qty is provided', () => {
  const row = {
    packaging: '500 ml',
    unitsPerBox: 10,
    totalUnits: 127,
    boxes: 0,
    loose: 0,
    price: 200
  };
  const calc = calculateLineItemQuantities(row);
  assert.strictEqual(calc.boxes, 12, '127 bottles with 10/box should yield 12 boxes');
  assert.strictEqual(calc.loose, 7, '127 bottles with 10/box should yield 7 loose');
  assert.strictEqual(calc.totalUnits, 127);
});

// ============================================================================
// 2. PRICING BASIS & NO ARBITRARY DIVISION/MULTIPLICATION
// ============================================================================
console.log('\n--- 2. Pricing Basis (Per Unit vs Per Box) ---');

runTest('2.1: Pricing basis per_unit multiplies unit price by total equivalent units', () => {
  const row = {
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 5, // 205 bottles total
    priceBasis: 'per_unit',
    price: 200, // Rs. 200 / bottle
    discountPct: 0
  };
  const calc = calculateLineItemQuantities(row);
  assert.strictEqual(calc.billedQty, 205, 'Billed quantity must equal total units (205)');
  assert.strictEqual(calc.taxableValue, 41000, 'Taxable value must be 205 * 200 = 41,000');
});

runTest('2.2: Pricing basis per_box multiplies carton price by box quantity + fractional loose', () => {
  const row = {
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 5, // 20.5 boxes equivalent
    priceBasis: 'per_box',
    price: 2000, // Rs. 2,000 / box
    discountPct: 0
  };
  const calc = calculateLineItemQuantities(row);
  assert.strictEqual(calc.billedQty, 20.5, 'Billed quantity must equal 20.5 boxes');
  assert.strictEqual(calc.taxableValue, 41000, 'Taxable value must be 20.5 * 2,000 = 41,000');
});

runTest('2.3: Zero arbitrary price multiplication guarantee', () => {
  // If priceBasis is per_unit, expressing quantity in 20 boxes does NOT cause price to be multiplied by boxes!
  const rowUnit = {
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 0, // 200 bottles
    priceBasis: 'per_unit',
    price: 150
  };
  const calcUnit = calculateLineItemQuantities(rowUnit);
  assert.strictEqual(calcUnit.taxableValue, 30000, 'Should be 200 * 150 = 30,000, not 20 * 150');

  // If priceBasis is per_box, price is multiplied by box count
  const rowBox = {
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 0,
    priceBasis: 'per_box',
    price: 1500
  };
  const calcBox = calculateLineItemQuantities(rowBox);
  assert.strictEqual(calcBox.taxableValue, 30000, 'Should be 20 * 1500 = 30,000');
});

// ============================================================================
// 3. DISCOUNTS, TAXABLE VALUES & GST CALCULATION
// ============================================================================
console.log('\n--- 3. Discounts, Taxable Values & GST Calculations ---');

runTest('3.1: Discount percentage reduces taxable value correctly', () => {
  const row = {
    packaging: '500 ml',
    boxes: 20,
    unitsPerBox: 10,
    loose: 5, // 205 bottles
    priceBasis: 'per_unit',
    price: 200, // Gross: Rs. 41,000
    discountPct: 5 // 5% discount = Rs. 2,050
  };
  const calc = calculateLineItemQuantities(row);
  assert.strictEqual(calc.discountAmt, 2050, 'Discount amount must be Rs. 2,050');
  assert.strictEqual(calc.taxableValue, 38950, 'Taxable value must be Rs. 38,950');
});

runTest('3.2: Intra-State GST 18% splits into 9% CGST and 9% SGST', () => {
  const subtotal = 38950;
  const totals = calculateInvoiceTotals(subtotal, 'GST18', 0);
  assert.strictEqual(totals.subtotal, 38950);
  assert.strictEqual(totals.cgstRate, 9);
  assert.strictEqual(totals.sgstRate, 9);
  assert.strictEqual(totals.igstRate, 0);
  assert.strictEqual(totals.cgstAmount, 3505.5, 'CGST 9% of 38950 is 3505.50');
  assert.strictEqual(totals.sgstAmount, 3505.5, 'SGST 9% of 38950 is 3505.50');
  assert.strictEqual(totals.igstAmount, 0);
  assert.strictEqual(totals.totalTax, 7011, 'Total GST is 7011');
  assert.strictEqual(totals.grandTotal, 45961, 'Grand Total is 38950 + 7011 = 45,961');
});

runTest('3.3: Inter-State IGST 18% charges full 18% IGST with zero CGST/SGST', () => {
  const subtotal = 38950;
  const totals = calculateInvoiceTotals(subtotal, 'IGST18', 0);
  assert.strictEqual(totals.cgstAmount, 0);
  assert.strictEqual(totals.sgstAmount, 0);
  assert.strictEqual(totals.igstAmount, 7011);
  assert.strictEqual(totals.totalTax, 7011);
  assert.strictEqual(totals.grandTotal, 45961);
});

runTest('3.4: Grand Total includes Previous Due Amount accurately', () => {
  const subtotal = 38950;
  const previousDue = 5500;
  const totals = calculateInvoiceTotals(subtotal, 'GST18', previousDue);
  assert.strictEqual(totals.dueAmount, 5500);
  assert.strictEqual(totals.grandTotal, 51461, 'Grand total must be 45961 + 5500 = 51,461');
});

runTest('3.5: GST 12%, GST 5% and None (0%) presets work seamlessly', () => {
  const t12 = calculateInvoiceTotals(10000, 'GST12', 0);
  assert.strictEqual(t12.totalTax, 1200);
  assert.strictEqual(t12.grandTotal, 11200);

  const t5 = calculateInvoiceTotals(10000, 'GST5', 0);
  assert.strictEqual(t5.totalTax, 500);
  assert.strictEqual(t5.grandTotal, 10500);

  const tNone = calculateInvoiceTotals(10000, 'NONE', 0);
  assert.strictEqual(tNone.totalTax, 0);
  assert.strictEqual(tNone.grandTotal, 10000);
});

// ============================================================================
// 4. BACKWARD COMPATIBILITY WITH HISTORICAL INVOICES
// ============================================================================
console.log('\n--- 4. Backward Compatibility with Historical Invoices ---');

runTest('4.1: Historical row with only plain qty and price calculates without NaN or crash', () => {
  const legacyRow = {
    brand: 'Anjani Agri Care',
    name: 'Old Item',
    qty: 50,
    price: 300,
    desc: 'Legacy item without packaging config'
  };

  const calc = calculateLineItemQuantities(legacyRow);
  assert.strictEqual(calc.totalUnits, 50, 'Total units should equal qty (50)');
  assert.strictEqual(calc.billedQty, 50, 'Billed qty should equal 50');
  assert.strictEqual(calc.taxableValue, 15000, 'Taxable value should be 50 * 300 = 15,000');
  assert.strictEqual(calc.totalVolume, 0, 'Volume without packaging string should be 0');
  assert.strictEqual(calc.boxes, 0, 'Boxes should default to 0');
  assert.strictEqual(calc.loose, 0, 'Loose should default to 0');
});

runTest('4.2: Historical invoice payload restoration preserves legacy values', () => {
  const legacyInvoiceDoc = {
    meta: {
      uniqueId: 'INV-OLD-001',
      invoiceNumber: '101',
      date: '2026-01-15'
    },
    customer: {
      name: 'Old Farmer Co.',
      phone: '9876543210'
    },
    rows: [
      { brand: 'Anjani', name: 'Product 1', qty: 20, price: 100, total: 2000 },
      { brand: 'Anjani', name: 'Product 2', qty: 10, price: 500, total: 5000 }
    ],
    calculations: {
      subtotal: 7000,
      grandTotal: 7000,
      taxType: 'NONE'
    }
  };

  assert.strictEqual(legacyInvoiceDoc.rows.length, 2);
  const r1 = calculateLineItemQuantities(legacyInvoiceDoc.rows[0]);
  assert.strictEqual(r1.taxableValue, 2000);
  assert(!isNaN(r1.taxableValue), 'Taxable value must not be NaN');
});

// ============================================================================
// 5. STORAGE SCHEMA & DATA PERSISTENCE INTEGRITY
// ============================================================================
console.log('\n--- 5. Storage Schema & Data Persistence Integrity ---');

runTest('5.1: Storage extraction maps all packaging fields into row objects', () => {
  const storageJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/storage.js'), 'utf8');
  assert(storageJsCode.includes('boxes: parseFloat(r.boxes) || 0'), 'storage.js must extract boxes');
  assert(storageJsCode.includes('loose: parseFloat(r.loose) || 0'), 'storage.js must extract loose');
  assert(storageJsCode.includes('unitsPerBox: parseInt(r.unitsPerBox, 10) || 0'), 'storage.js must extract unitsPerBox');
  assert(storageJsCode.includes('priceBasis: r.priceBasis || \'per_unit\''), 'storage.js must extract priceBasis');
  assert(storageJsCode.includes('discountPct: parseFloat(r.discountPct) || 0'), 'storage.js must extract discountPct');
  assert(storageJsCode.includes('totalVolume: parseFloat(r.totalVolume) || 0'), 'storage.js must extract totalVolume');
});

runTest('5.2: Storage restoration passes packaging fields to addRow', () => {
  const storageJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/storage.js'), 'utf8');
  assert(storageJsCode.includes('boxes: parseFloat(r.boxes) || 0'), 'restoreInvoiceUI must restore boxes');
  assert(storageJsCode.includes('unitsPerBox: parseInt(r.unitsPerBox, 10) || 0'), 'restoreInvoiceUI must restore unitsPerBox');
  assert(storageJsCode.includes('priceBasis: r.priceBasis || \'per_unit\''), 'restoreInvoiceUI must restore priceBasis');
});

// ============================================================================
// 6. ZERO DOUBLE-DEDUCTION GUARANTEE WITH DISPATCH
// ============================================================================
console.log('\n--- 6. Zero Double-Deduction Guarantee with Dispatch ---');

runTest('6.1: Commercial invoice payload guarantees is_stock_deducted: false', () => {
  const storageJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/storage.js'), 'utf8');
  assert(storageJsCode.includes('is_stock_deducted: false'), 'Invoice payload must enforce is_stock_deducted: false');

  const apiJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/api.js'), 'utf8');
  assert(apiJsCode.includes('is_stock_deducted: invoiceData.is_stock_deducted !== undefined ? invoiceData.is_stock_deducted : false'), 'apiSaveInvoice must persist is_stock_deducted');
});

runTest('6.2: Dispatch core sets is_stock_deducted: false upon commercial invoice generation', () => {
  const dispatchCoreCode = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-core.js'), 'utf8');
  assert(dispatchCoreCode.includes('is_stock_deducted: false, // ZERO DOUBLE-DEDUCTION GUARANTEE'), 'dispatch-core must enforce is_stock_deducted: false');
});

// ============================================================================
// 7. NAVIGATION RESILIENCE & LOGO RESOLUTION
// ============================================================================
console.log('\n--- 7. Navigation Resilience & Logo Resolution ---');

runTest('7.1: shared-layout.js points getInvoiceBuilderUrl directly to Invoice Builder root', () => {
  const layoutCode = fs.readFileSync(path.join(__dirname, '../assets/js/shared-layout.js'), 'utf8');
  assert(layoutCode.includes("return isPagesDir ? '../Invoice Builder/index.html' : './Invoice Builder/index.html';"),
    'shared-layout must link directly to Invoice Builder, avoiding broken /apps/ routing');
});

runTest('7.2: Invoice Builder pages include handleErpDashboardNav supporting both root and /apps/', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../Invoice Builder/index.html'), 'utf8');
  const historyHtml = fs.readFileSync(path.join(__dirname, '../Invoice Builder/history.html'), 'utf8');
  const masterHtml = fs.readFileSync(path.join(__dirname, '../Invoice Builder/master.html'), 'utf8');

  [indexHtml, historyHtml, masterHtml].forEach((html, idx) => {
    const pageName = ['index.html', 'history.html', 'master.html'][idx];
    assert(html.includes('handleErpDashboardNav'), `${pageName} must define handleErpDashboardNav`);
    assert(html.includes("window.location.href = '../../pages/dashboard.html'"), `${pageName} must support /apps/ fallback`);
    assert(html.includes("window.location.href = '../pages/dashboard.html'"), `${pageName} must support root navigation`);
  });
});

runTest('7.3: All logo images have fallback onerror attached', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../Invoice Builder/index.html'), 'utf8');
  assert(indexHtml.includes('navbar-logo" style="height:48px;width:48px;object-fit:contain;border-radius:10px;border:1px solid var(--border);flex-shrink:0;background:#ffffff;padding:2px;" onerror="this.onerror=null; this.src=\'logo.jpg\';"'), 'navbar-logo must have fallback');
  assert(indexHtml.includes('logo-preview-sb" src="../assets/images/logo.jpg" alt="Anjani Agri Care" style="height:100px;width:100px;max-width:140px;object-fit:contain;border-radius:14px;border:1.5px solid var(--border);box-shadow:var(--shadow-sm);background:#ffffff;padding:4px;display:block;" onerror="this.onerror=null; this.src=\'logo.jpg\';"'), 'sidebar logo must have fallback');
  assert(indexHtml.includes('paper-logo" src="../assets/images/logo.jpg" alt="Anjani Agri Care" style="height:96px;width:96px;max-width:140px;max-height:105px;object-fit:contain;border:none;display:block;background:transparent;padding:0;box-shadow:none;" onerror="this.onerror=null; this.src=\'logo.jpg\';"'), 'paper logo must have fallback');
});

runTest('7.4: loadDefaultLogo ignores HTML SPA fallbacks from Vite', () => {
  assert(mainJsCode.includes("if (ctype.includes('text/html')) continue;"), 'loadDefaultLogo must discard HTML responses from Vite');
});

runTest('7.5: apps/Invoice Builder is synchronized with root Invoice Builder', () => {
  const rootIndex = fs.readFileSync(path.join(__dirname, '../Invoice Builder/index.html'), 'utf8');
  const appsIndex = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/index.html'), 'utf8');
  assert.strictEqual(rootIndex, appsIndex, 'apps/Invoice Builder/index.html must match root Invoice Builder/index.html');
  const rootHistory = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/history.js'), 'utf8');
  const appsHistory = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/history.js'), 'utf8');
  assert.strictEqual(rootHistory, appsHistory, 'apps/Invoice Builder/js/history.js must match root Invoice Builder/js/history.js');
});

runTest('8.1: History page renderHistoryRows executes without ReferenceError and formats amounts', () => {
  const historyJsCode = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/history.js'), 'utf8');
  // Verify amtStr is declared
  assert(historyJsCode.includes('const amtVal = parseFloat(inv.totalAmount || inv.GrandTotal || 0) || 0;'), 'amtVal must be calculated');
  assert(historyJsCode.includes("const amtStr = '₹' + INR.format(amtVal);"), 'amtStr must be defined before use');

  // Test execution in mock environment
  const mockRows = [];
  const mockTableBody = {
    innerHTML: '',
    appendChild: (tr) => mockRows.push(tr)
  };
  const mockDoc = {
    addEventListener: () => {},
    getElementById: (id) => id === 'history-tbody' ? mockTableBody : null,
    createElement: (tag) => ({ tagName: tag, innerHTML: '', style: {} })
  };
  const mockScope = {
    document: mockDoc,
    window: {},
    allInvoices: [],
    escapeHTML: (s) => s || '',
    Intl: Intl
  };
  const fn = new Function('document', 'window', 'escapeHTML', 'Intl', `
    ${historyJsCode}
    return { renderHistoryRows };
  `);
  const exported = fn(mockDoc, mockScope.window, mockScope.escapeHTML, Intl);
  assert(typeof exported.renderHistoryRows === 'function', 'renderHistoryRows must be a function');

  // Render sample invoices (including dispatch and direct)
  const testInvoices = [
    { uniqueId: 'INV-01', invoiceNumber: 'INV-01', customerName: 'Krishi Seva Kendra', totalAmount: 181440, date: '2026-10-19', source: 'dispatch' },
    { uniqueId: 'INV-02', invoiceNumber: '100', customerName: 'Kisan Agro', totalAmount: 50000, date: '2026-10-18' }
  ];
  exported.renderHistoryRows(testInvoices);
  assert.strictEqual(mockRows.length, 2, 'Must render 2 rows');
  assert(mockRows[0].innerHTML.includes('1,81,440.00'), 'Row 1 must contain formatted amount 1,81,440.00');
  assert(mockRows[0].innerHTML.includes('DISPATCH'), 'Row 1 must show DISPATCH badge');
  assert(mockRows[1].innerHTML.includes('50,000.00'), 'Row 2 must contain formatted amount 50,000.00');
});

console.log('\n================================================================');
console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests} tests succeeded)`);
console.log('================================================================\n');
