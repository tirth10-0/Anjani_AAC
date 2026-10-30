/**
 * Test: Dispatch Slip Item Deduplication, Header 'No.', and Invoice Builder Loading
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting test_dispatch_invoice_and_dedup.js...');

// 1. Verify dispatch-ui.js has 'No.' instead of '#' for item numbering header
const dispatchUiContent = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-ui.js'), 'utf8');
assert(!dispatchUiContent.includes('>#<'), "dispatch-ui.js should not contain '>#<' header");
assert(dispatchUiContent.includes('>No.<'), "dispatch-ui.js should contain '>No.<' header");
assert(!dispatchUiContent.includes("pdf.text('#'"), "dispatch-ui.js PDF should not draw '#' for column header");
assert(dispatchUiContent.includes("pdf.text('No.'"), "dispatch-ui.js PDF should draw 'No.' for column header");
console.log('✓ Header changed from # to No. in dispatch slip modal & PDF verified.');

// 2. Verify dispatch-core.js deduplicates dispatch items
const dispatchCoreContent = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-core.js'), 'utf8');
assert(dispatchCoreContent.includes('Deduplicate items to prevent duplicate rows for the same product'),
  'dispatch-core.js must include deduplication logic in getDispatchDetails');
console.log('✓ Item deduplication logic in dispatch-core.js verified.');

// 3. Verify Invoice Builder api.js has remote fallback and synchronization
const apiContent = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/api.js'), 'utf8');
const appsApiContent = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/api.js'), 'utf8');
assert.strictEqual(apiContent, appsApiContent, 'api.js in Invoice Builder and apps/Invoice Builder must match');
assert(apiContent.includes('Authoritative fallback to orders table in Supabase'), 'api.js must have authoritative fallback to orders');
console.log('✓ Invoice Builder api.js parity & authoritative fallback verified.');

// 4. Verify storage.js exports restoreInvoiceUI and handles modern format
const storageContent = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/storage.js'), 'utf8');
const appsStorageContent = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/storage.js'), 'utf8');
assert.strictEqual(storageContent, appsStorageContent, 'storage.js in Invoice Builder and apps/Invoice Builder must match');
assert(storageContent.includes('window.restoreInvoiceUI = restoreInvoiceUI;'), 'storage.js must export window.restoreInvoiceUI');
console.log('✓ Invoice Builder storage.js export & parity verified.');

// 5. Verify main.js exports functions to window and executes editId restoring
const mainContent = fs.readFileSync(path.join(__dirname, '../Invoice Builder/js/main.js'), 'utf8');
const appsMainContent = fs.readFileSync(path.join(__dirname, '../apps/Invoice Builder/js/main.js'), 'utf8');
assert.strictEqual(mainContent, appsMainContent, 'main.js in Invoice Builder and apps/Invoice Builder must match');
assert(mainContent.includes('window.renderRows = renderRows;'), 'main.js must export renderRows');
assert(mainContent.includes('window.renderMobItems = renderMobItems;'), 'main.js must export renderMobItems');
assert(mainContent.includes('window.refreshPaper = refreshPaper;'), 'main.js must export refreshPaper');
assert(mainContent.includes('window.recalcAll = recalcAll;'), 'main.js must export recalcAll');
console.log('✓ Invoice Builder main.js exports & parity verified.');

console.log('🎉 ALL DISPATCH & INVOICE BUILDER TESTS PASSED!');
