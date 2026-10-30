// tests/test_production_records_table_overflow_fix.js
// Verification suite for Production Records table width, column proportions, and responsive behavior

const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🧪 RUNNING PRODUCTION RECORDS TABLE OVERFLOW FIX TESTS');
console.log('===============================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

const rootDir = path.resolve(__dirname, '..');
const productionHtml = fs.readFileSync(path.join(rootDir, 'pages', 'production.html'), 'utf8');
const tablesCss = fs.readFileSync(path.join(rootDir, 'assets', 'css', 'tables.css'), 'utf8');
const responsiveCss = fs.readFileSync(path.join(rootDir, 'assets', 'css', 'responsive.css'), 'utf8');
const productionJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', 'production.js'), 'utf8');

// Test 1: Production Records Table column percentages sum to 100%
console.log('\n[Test 1] Inspecting column width allocations in production.html...');
const batchesTableMatch = productionHtml.match(/<table[^>]*id="batches-table"[^>]*>([\s\S]*?)<\/table>/);
assert(!!batchesTableMatch, 'Found #batches-table in production.html');

const widthMatches = [...batchesTableMatch[1].matchAll(/<th\s+style="width:\s*(\d+)%[^"]*">([^<]+)<\/th>/g)];
assert(widthMatches.length === 6, `Found 6 header columns in #batches-table (found: ${widthMatches.length})`);

let sumWidths = 0;
widthMatches.forEach(m => {
  const pct = parseInt(m[1], 10);
  const name = m[2].trim();
  sumWidths += pct;
  console.log(`    - Column "${name}": ${pct}%`);
});
assert(sumWidths === 100, `Column widths sum exactly to 100% (calculated: ${sumWidths}%)`);

// Test 2: Scoped layout and padding in tables.css
console.log('\n[Test 2] Verifying scoped table-layout and padding in tables.css...');
assert(tablesCss.includes('#batches-table'), 'tables.css contains scoped #batches-table block');
assert(/#batches-table\s*\{[^}]*table-layout:\s*fixed;[^}]*width:\s*100%;/s.test(tablesCss), '#batches-table enforces table-layout: fixed and width: 100%');
assert(/#batches-table\s*th,\s*#batches-table\s*td\s*\{[^}]*padding:\s*10px 8px;/s.test(tablesCss), '#batches-table has compact padding (10px 8px)');
assert(tablesCss.includes('#batches-table-wrap'), 'tables.css targets #batches-table-wrap');

// Test 3: Flexible wrapping for Product Name and Inventory Operations
console.log('\n[Test 3] Verifying text wrapping and badge styling for long contents...');
assert(/#batches-table\s+\.cell-prod-product\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*break-word;/s.test(tablesCss), 'Manufactured product cell allows multi-line text wrapping without horizontal overflow');
assert(/#batches-table\s+\.cell-prod-ops\s*\{[^}]*white-space:\s*normal;/s.test(tablesCss), 'Inventory operations cell wraps badges neatly');

// Test 4: Actions column button layout and visibility
console.log('\n[Test 4] Verifying action buttons (View Details, Delete) formatting...');
assert(tablesCss.includes('.production-row-actions'), 'tables.css contains .production-row-actions styling');
assert(productionJs.includes('viewProductionDetails(${b.id})'), 'production.js renders View Details button with proper onclick handler');
assert(productionJs.includes('deleteProductionBatch(${b.id})'), 'production.js renders Delete button with proper onclick handler');
assert(productionJs.includes('View Details') && productionJs.includes('Delete'), 'Both View Details and Delete buttons are rendered');

// Test 5: Mobile responsiveness (<= 768px)
console.log('\n[Test 5] Verifying mobile responsive behavior and data-label attributes...');
assert(productionJs.includes('data-label="Production Reference"'), 'Row template includes data-label="Production Reference"');
assert(productionJs.includes('data-label="Production Date"'), 'Row template includes data-label="Production Date"');
assert(productionJs.includes('data-label="Manufactured Product"'), 'Row template includes data-label="Manufactured Product"');
assert(productionJs.includes('data-label="Quantity Produced"'), 'Row template includes data-label="Quantity Produced"');
assert(productionJs.includes('data-label="Inventory Operations"'), 'Row template includes data-label="Inventory Operations"');
assert(productionJs.includes('data-label="Actions"'), 'Row template includes data-label="Actions"');
assert(responsiveCss.includes('#batches-table tbody td:last-child'), 'responsive.css contains mobile styling for #batches-table action cell');

// Test 6: Verify production business logic functions remain untouched
console.log('\n[Test 6] Verifying core production functions and handlers are intact...');
assert(productionJs.includes('async function saveProduction()'), 'saveProduction function is present and intact');
assert(productionJs.includes('async function deleteProductionBatch('), 'deleteProductionBatch function is present and intact');
assert(productionJs.includes('function viewProductionDetails('), 'viewProductionDetails function is present and intact');
assert(productionJs.includes('function filterBatchesTableReal()'), 'filterBatchesTableReal filter function is present and intact');
assert(productionJs.includes('function clearProductionFilters()'), 'clearProductionFilters function is present and intact');

console.log('\n===============================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} TOTAL)`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL PRODUCTION RECORDS TABLE OVERFLOW TESTS PASSED!');
}
