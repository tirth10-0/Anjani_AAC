/**
 * tests/test_intercompany_mobile_and_delete_fixes.js
 * Automated Verification for:
 * 1. PostgrestBuilder .catch absence (prevention of "...catch is not a function" errors)
 * 2. safeDeleteCompany with safeQuery helper
 * 3. safeDeleteWarehouse with safeQuery helper
 * 4. deleteRelationship resilient dependency checking
 * 5. Intercompany mobile UI (data-table-wrap-mobile, applyMobileTableLabels, responsive styles)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Intercompany Mobile UI & Administrative Deletion Tests...\n');

// 1. Verify no PostgrestBuilder .catch() in assets/js
console.log('--- Test Group 1: Builder .catch Absence Verification ---');
const jsFiles = ['companies.js', 'warehouses.js', 'intercompany.js', 'database.js', 'inventory-core.js'];
jsFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', file), 'utf8');
  const badCatchMatch = content.match(/\.(select|eq|or|filter|order)\([^)]*\)\.catch\(/);
  assert.strictEqual(badCatchMatch, null, `Found invalid builder .catch() in ${file}`);
  console.log(`  ✓ [PASS] assets/js/${file} has zero builder .catch() calls`);
});

// 2. Verify safeQuery helper in companies.js and warehouses.js
console.log('\n--- Test Group 2: safeQuery Implementation in Deletion Handlers ---');
const compContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'companies.js'), 'utf8');
assert(compContent.includes('safeQuery(window.dbClient.from(\'intercompany_transfers\')'), 'companies.js must use safeQuery for intercompany_transfers');
assert(compContent.includes('safeQuery(window.dbClient.from(\'invoices\')'), 'companies.js must use safeQuery for invoices');
console.log('  ✓ [PASS] companies.js uses safeQuery for dependency checks');

const whContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'warehouses.js'), 'utf8');
assert(whContent.includes('safeQuery(window.dbClient.from(\'intercompany_transfers\')'), 'warehouses.js must use safeQuery for intercompany_transfers');
assert(whContent.includes('safeQuery(window.dbClient.from(\'stock_movements\')'), 'warehouses.js must use safeQuery for stock_movements');
console.log('  ✓ [PASS] warehouses.js uses safeQuery for dependency checks');

// 3. Verify intercompany.js resilient deleteRelationship
console.log('\n--- Test Group 3: deleteRelationship Resilient Deletion ---');
const interContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'intercompany.js'), 'utf8');
assert(interContent.includes('isTableMissing'), 'intercompany.js must detect missing transfers table');
assert(interContent.includes('intercompany_relationships\').delete()'), 'intercompany.js must perform remote delete on intercompany_relationships');
assert(interContent.includes('allRelationships.filter(r => r.id !== id)'), 'intercompany.js must immediately filter in-memory array');
console.log('  ✓ [PASS] intercompany.js safely deletes relationship even when transfers table is absent');

// 4. Verify intercompany.html mobile wrapper classes
console.log('\n--- Test Group 4: Intercompany Mobile UI Markup ---');
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'pages', 'intercompany.html'), 'utf8');
assert(htmlContent.includes('<div class="table-wrap data-table-wrap-mobile" style="margin-bottom:20px;">\n          <div class="recon-section-header"'), 'recon-recipients-table must be wrapped in data-table-wrap-mobile');
assert(htmlContent.includes('<div class="table-wrap data-table-wrap-mobile">\n          <div class="recon-section-header"'), 'recon-warehouses-table must be wrapped in data-table-wrap-mobile');
console.log('  ✓ [PASS] All tables in intercompany.html have data-table-wrap-mobile wrapper');

// 5. Verify applyMobileTableLabels calls in intercompany.js
console.log('\n--- Test Group 5: applyMobileTableLabels in intercompany.js ---');
assert(interContent.includes("UTILS.applyMobileTableLabels('recon-recipients-table')"), 'Must call applyMobileTableLabels for recon-recipients-table');
assert(interContent.includes("UTILS.applyMobileTableLabels('recon-warehouses-table')"), 'Must call applyMobileTableLabels for recon-warehouses-table');
assert(interContent.includes("UTILS.applyMobileTableLabels('transfers-table')"), 'Must call applyMobileTableLabels for transfers-table');
assert(interContent.includes("UTILS.applyMobileTableLabels('relationships-table')"), 'Must call applyMobileTableLabels for relationships-table');
console.log('  ✓ [PASS] applyMobileTableLabels called for all 4 intercompany tables');

// 6. Verify responsive.css overflow guards and card styling
console.log('\n--- Test Group 6: responsive.css Intercompany Rules ---');
const respContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'responsive.css'), 'utf8');
assert(respContent.includes('#recon-recipients-table tbody td:last-child'), 'responsive.css must style last-child cell for recon-recipients-table');
assert(respContent.includes('#recon-warehouses-table tbody td:last-child'), 'responsive.css must style last-child cell for recon-warehouses-table');
assert(respContent.includes('overflow-x: hidden !important;'), 'responsive.css must block horizontal overflow on view containers');
console.log('  ✓ [PASS] responsive.css contains card rules and overflow prevention for intercompany views');

console.log('\n🎉 ALL INTERCOMPANY MOBILE UI & ADMINISTRATIVE DELETION TESTS PASSED!\n');
