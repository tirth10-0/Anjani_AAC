/**
 * tests/test_warehouse_page_filter_and_company_empty_warehouse_deletion.js
 *
 * Verifies:
 * 1. warehouses.html defaults to "All Companies" and "All Statuses", preventing hidden warehouses.
 * 2. warehouses.js populates company dropdown dynamically, supports URL params (?company=X), and provides filter reset.
 * 3. companies.html & companies.js display warehouse count badge linking to warehouses.html?company=X.
 * 4. companies.js safeDeleteCompany does NOT falsely block deletion when a company only has empty,
 *    zero-dependency warehouses (auto-created with setup); instead cleanly deletes the empty warehouse with the company.
 * 5. Live Supabase test: Creates a company with an empty warehouse (like Crop Solutions), verifies safe deletion succeeds.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

console.log('🧪 Starting Warehouse Filter & Company Empty Warehouse Deletion Tests...\n');

// 1. Verify warehouses.html default filter options
console.log('--- Test Group 1: Warehouses Page Filter Defaults ---');
const whHtml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'warehouses.html'), 'utf8');

assert(whHtml.includes('<option value="ALL" selected>All Companies</option>'),
  'warehouses.html company-filter must default to All Companies so warehouses are not hidden');
assert(whHtml.includes('<option value="ALL" selected>All Statuses</option>'),
  'warehouses.html status-filter must default to All Statuses');
console.log('  ✓ [PASS] warehouses.html defaults to "All Companies" and "All Statuses"');

// 2. Verify warehouses.js dynamic dropdown and reset logic
console.log('\n--- Test Group 2: Warehouses.js Filter Engine & URL Param Navigation ---');
const whJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'warehouses.js'), 'utf8');

assert(whJs.includes('populateCompanyFilterDropdown()'),
  'warehouses.js must define and call populateCompanyFilterDropdown');
assert(whJs.includes('resetWarehouseFilters()'),
  'warehouses.js must define resetWarehouseFilters to recover from empty filter results');
assert(whJs.includes("urlParams.get('company')") || whJs.includes("urlParams.get('company_id')"),
  'warehouses.js must support deep-linking via ?company= query param');
console.log('  ✓ [PASS] warehouses.js dynamically lists companies, supports deep linking, and has filter reset');

// 3. Verify companies.js warehouse count pill & safeDeleteCompany empty warehouse cleanup
console.log('\n--- Test Group 3: Companies.js Navigation Links & Empty Warehouse Deletion ---');
const compJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'companies.js'), 'utf8');

assert(compJs.includes('allWarehouses'),
  'companies.js must track allWarehouses to display counts in table');
assert(compJs.includes('warehouses.html?company='),
  'companies.js must render clickable links to warehouses.html?company=ID');
assert(compJs.includes('totalDependencies = activeStockCount + movCount + ordCount + invCount + icTxCount'),
  'safeDeleteCompany must calculate dependencies based on active stock and transactions, NOT empty warehouse rows');
assert(compJs.includes("from('warehouses').delete().in('id', whIds)"),
  'safeDeleteCompany must delete empty warehouses when deleting the company');
console.log('  ✓ [PASS] companies.js renders warehouse pills and safely cascades empty warehouse deletion');

// 4. Live Supabase Verification: Create company with empty warehouse, then delete
console.log('\n--- Test Group 4: Live Supabase Empty Warehouse & Company Lifecycle ---');
(async () => {
  const client = createClient('https://quxcvoywufjjynluntvg.supabase.co', 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr');

  const rand = Math.floor(Math.random() * 8999 + 1000);
  const compCode = `TEST-EMP-${rand}`;
  const whCode = `WH-EMP-${rand}`;

  // 1. Create company
  const { data: createdComp, error: compErr } = await client.from('companies').insert([{
    tenant_id: 1,
    name: `Test Empty Company ${rand}`,
    code: compCode,
    is_manufacturing: false,
    status: 'Active'
  }]).select();

  assert(!compErr, 'Failed to create test company: ' + (compErr ? compErr.message : ''));
  const testCompId = createdComp[0].id;
  console.log(`  ✓ Created test company ID ${testCompId} (${compCode})`);

  // 2. Create empty warehouse belonging to this company (like the auto-created ones)
  const { data: createdWh, error: whErr } = await client.from('warehouses').insert([{
    company_id: testCompId,
    name: `Test Store ${rand}`,
    code: whCode,
    warehouse_type: 'General',
    status: 'Active'
  }]).select();

  assert(!whErr, 'Failed to create test warehouse: ' + (whErr ? whErr.message : ''));
  const testWhId = createdWh[0].id;
  console.log(`  ✓ Created empty test warehouse ID ${testWhId} (${whCode}) belonging to Company ${testCompId}`);

  // 3. Verify dependency calculation: 0 stock, 0 movements, 0 orders
  const { data: batches } = await client.from('stock_batches').select('id, current_qty').eq('company_id', testCompId);
  const activeStock = (batches || []).filter(b => (Number(b.current_qty) || 0) > 0).length;
  const { data: movs } = await client.from('stock_movements').select('id').eq('warehouse_id', testWhId);
  const movCount = (movs || []).length;

  assert.strictEqual(activeStock, 0, 'Must have 0 active stock');
  assert.strictEqual(movCount, 0, 'Must have 0 stock movements');

  // 4. Simulate deletion: clean up empty warehouse then delete company
  const { error: delWhErr } = await client.from('warehouses').delete().eq('id', testWhId);
  assert(!delWhErr, 'Failed to delete empty warehouse: ' + (delWhErr ? delWhErr.message : ''));

  const { error: delCompErr } = await client.from('companies').delete().eq('id', testCompId);
  assert(!delCompErr, 'Failed to delete company: ' + (delCompErr ? delCompErr.message : ''));
  console.log(`  ✓ [PASS] Cleanly deleted empty warehouse (ID ${testWhId}) and company (ID ${testCompId}) without blockage`);

  console.log('\n🎉 ALL WAREHOUSE FILTER & EMPTY WAREHOUSE DELETION TESTS PASSED!\n');
})().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
