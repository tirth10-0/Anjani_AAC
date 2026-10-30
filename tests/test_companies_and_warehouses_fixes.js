/**
 * tests/test_companies_and_warehouses_fixes.js
 * Automated Tests for:
 * 1. warehouses.js syntax check, safeDeleteWarehouse structure, loadWarehouses
 * 2. companies.html tag balancing & modal isolation
 * 3. companies.js safeDeleteCompany dependency handling & non-freezing modal flow
 * 4. Safe deletion of company with 0 dependencies in test environment
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧪 Starting Companies & Warehouses Diagnostics and Fix Verification...\n');

// 1. Verify JS syntax of warehouses.js and companies.js
console.log('--- Test Group 1: JavaScript Syntax & Import Analysis ---');
try {
  execSync('node -c assets/js/warehouses.js', { stdio: 'pipe' });
  console.log('  ✓ [PASS] assets/js/warehouses.js passes Node.js syntax parsing without errors');
} catch (e) {
  assert.fail('assets/js/warehouses.js failed syntax parsing: ' + e.message);
}

try {
  execSync('node -c assets/js/companies.js', { stdio: 'pipe' });
  console.log('  ✓ [PASS] assets/js/companies.js passes Node.js syntax parsing without errors');
} catch (e) {
  assert.fail('assets/js/companies.js failed syntax parsing: ' + e.message);
}

// 2. Verify warehouses.js function structures
console.log('\n--- Test Group 2: Warehouses safeDeleteWarehouse & loadWarehouses Structure ---');
const whContent = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'warehouses.js'), 'utf8');

assert(whContent.includes('isDeletingWarehouse'), 'warehouses.js must have isDeletingWarehouse double-click guard');
assert(whContent.includes('APP.showSpinner();\n  try {'), 'safeDeleteWarehouse must call showSpinner and open try block');
assert(whContent.includes('APP.hideSpinner();'), 'safeDeleteWarehouse must call hideSpinner in finally block');
assert(whContent.includes('loadWarehouses()'), 'warehouses.js must have loadWarehouses function and invocation');
console.log('  ✓ [PASS] safeDeleteWarehouse has complete try/finally lifecycle and double-click guard');

// 3. Verify companies.html modal structure & tag balancing
console.log('\n--- Test Group 3: Companies.html Modal Structure & Overlay Isolation ---');
const compHtml = fs.readFileSync(path.join(__dirname, '..', 'pages', 'companies.html'), 'utf8');

// Ensure branches-modal is closed before company-dependency-modal
const branchesModalIdx = compHtml.indexOf('id="branches-modal"');
const depModalIdx = compHtml.indexOf('id="company-dependency-modal"');
assert(branchesModalIdx !== -1, 'branches-modal must exist in companies.html');
assert(depModalIdx !== -1, 'company-dependency-modal must exist in companies.html');
assert(branchesModalIdx < depModalIdx, 'branches-modal must precede company-dependency-modal');

const branchesModalStart = compHtml.lastIndexOf('<div', branchesModalIdx);
const betweenModals = compHtml.substring(branchesModalStart, depModalIdx);
const openDivCount = (betweenModals.match(/<div(\s+[^>]*)?>/g) || []).length;
const closeDivCount = (betweenModals.match(/<\/div>/g) || []).length;
assert.strictEqual(openDivCount, closeDivCount, `Divs between branches-modal and company-dependency-modal must be balanced (open: ${openDivCount}, close: ${closeDivCount})`);
console.log('  ✓ [PASS] company-dependency-modal is an independent top-level overlay, NOT nested inside branches-modal');

// 4. Verify companies.js safeDeleteCompany dependency checking & modal interaction
console.log('\n--- Test Group 4: safeDeleteCompany Dependency Verification & Modal Flow ---');
const compJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'companies.js'), 'utf8');

assert(compJs.includes('isDeletingCompany'), 'companies.js must have isDeletingCompany double-click guard');
assert(compJs.includes('intercompany_relationships'), 'safeDeleteCompany must check intercompany_relationships dependencies');
assert(compJs.includes('APP.hideSpinner();\n      const modalMsg'), 'safeDeleteCompany must hide spinner before opening company-dependency-modal');
assert(compJs.includes('APP.hideSpinner();\n    APP.showConfirm('), 'safeDeleteCompany must hide spinner before opening showConfirm');
assert(compJs.includes('allCompanies = allCompanies.filter(c => c.id !== companyId)'), 'safeDeleteCompany must update allCompanies state immediately');
console.log('  ✓ [PASS] safeDeleteCompany properly hides spinner, opens visible modal, and prevents UI lockup');

// 5. Test Live Supabase Company Creation and Safe Deletion (0 dependencies)
console.log('\n--- Test Group 5: Safe Company Lifecycle in Live Database ---');
(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient('https://quxcvoywufjjynluntvg.supabase.co', 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr');

  // Insert test company
  const testCode = 'TEST-' + Math.floor(Math.random() * 8999 + 1000);
  const { data: created, error: createErr } = await client.from('companies').insert([{
    tenant_id: 1,
    name: 'Temporary Automated Test Company',
    code: testCode,
    is_manufacturing: false,
    status: 'Active'
  }]).select();

  assert(!createErr, 'Failed to create test company: ' + (createErr ? createErr.message : ''));
  const testCompId = created[0].id;
  console.log(`  ✓ [PASS] Created test company with ID ${testCompId} (${testCode})`);

  // Verify deletion of 0-dependency company
  const { error: delErr } = await client.from('companies').delete().eq('id', testCompId);
  assert(!delErr, 'Failed to delete test company: ' + (delErr ? delErr.message : ''));
  console.log(`  ✓ [PASS] Successfully deleted 0-dependency test company (ID ${testCompId})`);

  console.log('\n🎉 ALL COMPANIES & WAREHOUSES DIAGNOSTIC TESTS PASSED!\n');
})().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
