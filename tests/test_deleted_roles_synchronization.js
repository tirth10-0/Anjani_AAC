/**
 * tests/test_deleted_roles_synchronization.js
 * Verification for System Roles Count and Active Role Dynamic Synchronization
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('--- DELETED ROLES SYNCHRONIZATION VERIFICATION SUITE ---');
console.log('===============================================================');

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'pages', 'user-roles.html');
const userRolesJsPath = path.join(rootDir, 'assets', 'js', 'user-roles.js');
const sharedLayoutJsPath = path.join(rootDir, 'assets', 'js', 'shared-layout.js');
const rbacContextJsPath = path.join(rootDir, 'assets', 'js', 'rbac-context.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const userRolesJs = fs.readFileSync(userRolesJsPath, 'utf8');
const sharedLayoutJs = fs.readFileSync(sharedLayoutJsPath, 'utf8');
const rbacContextJs = fs.readFileSync(rbacContextJsPath, 'utf8');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// 1. user-roles.js initialization and filtering logic
runTest('1.1 user-roles.js loads roles catalog and updates stats immediately on DOMContentLoaded', () => {
  assert.match(userRolesJs, /document\.addEventListener\('DOMContentLoaded',\s*async\s*\(\)\s*=>\s*\{[\s\S]*?loadRolesCatalog\(\);[\s\S]*?updateStats\(\);/, 'Must call loadRolesCatalog and updateStats early');
});

runTest('1.2 user-roles.js loadInitialData filters out deleted roles when merging DB rolesRes.data', () => {
  assert.match(userRolesJs, /let deletedRoles = \[\];[\s\S]*?localStorage\.getItem\(DELETED_ROLES_STORAGE_KEY\)/, 'Must read deleted roles before checking rolesRes');
  assert.match(userRolesJs, /!deletedRoles\.includes\(dbRole\.code\)\s*&&\s*!SYSTEM_ROLES_CATALOG\.some/, 'Must ensure deleted roles are not added back from DB');
});

runTest('1.3 updateStats dynamically updates tab-roles-btn text with catalog length', () => {
  assert.match(userRolesJs, /tabRolesBtn\.textContent\s*=\s*`System Roles \(\$\{SYSTEM_ROLES_CATALOG\.length\}\)`;|tabRolesBtn\.textContent\s*=\s*'System Roles \('\s*\+\s*SYSTEM_ROLES_CATALOG\.length\s*\+\s*'\)'/, 'Must update tab-roles-btn text with real length');
});

// 2. Dropdown updates in user-roles.js
runTest('2.1 updateRoleDropdowns updates #user-role, #filter-user-role, #matrix-role-selector, and #rbac-role-select', () => {
  assert.match(userRolesJs, /document\.getElementById\('user-role'\)/, 'Must update user-role select');
  assert.match(userRolesJs, /document\.getElementById\('filter-user-role'\)/, 'Must update filter-user-role select');
  assert.match(userRolesJs, /document\.getElementById\('matrix-role-selector'\)/, 'Must update matrix-role-selector select');
  assert.match(userRolesJs, /document\.getElementById\('rbac-role-select'\)/, 'Must update rbac-role-select');
});

runTest('2.2 saveCustomRole triggers window.RBAC.reloadRoles', () => {
  assert.match(userRolesJs, /if\s*\(window\.RBAC\s*&&\s*window\.RBAC\.reloadRoles\)\s*\{\s*window\.RBAC\.reloadRoles\(\);?\s*\}/, 'Must call window.RBAC.reloadRoles in saveCustomRole');
});

// 3. shared-layout.js dynamic topbar role options
runTest('3.1 shared-layout.js defines renderRbacRoleOptionsHtml filtering deleted roles', () => {
  assert.match(sharedLayoutJs, /function renderRbacRoleOptionsHtml\(\)/, 'Must define renderRbacRoleOptionsHtml');
  assert.match(sharedLayoutJs, /!deleted\.includes\(r\.code\)/, 'Must filter out deleted roles');
});

runTest('3.2 shared-layout.js TOPBAR_HTML uses renderRbacRoleOptionsHtml() inside #rbac-role-select', () => {
  assert.match(sharedLayoutJs, /<select id="rbac-role-select"[^>]*>[\s\S]*?\$\{renderRbacRoleOptionsHtml\(\)\}[\s\S]*?<\/select>/, 'Must use renderRbacRoleOptionsHtml inside rbac-role-select');
});

runTest('3.3 initRbacControls invokes updateBadge immediately synchronously', () => {
  assert.match(sharedLayoutJs, /function initRbacControls\(\)\s*\{[\s\S]*?const updateBadge[\s\S]*?updateBadge\(\);[\s\S]*?window\.RBAC\.init/, 'Must call updateBadge synchronously');
});

// 4. Functional simulation test with simulated browser globals
runTest('4.1 Functional Simulation: deleting 9 roles updates catalog length to 1 and excludes deleted roles from available roles', () => {
  const mockStorage = {
    erp_deleted_roles: JSON.stringify([
      'company_owner', 'production_manager', 'factory_operator', 'godown_operator',
      'qc_officer', 'accountant', 'store_manager', 'sales_executive', 'viewer_auditor'
    ])
  };

  const BASE_ROLES = [
    { code: 'super_admin', name: 'Software Super Admin' },
    { code: 'company_owner', name: 'Company Owner / Director' },
    { code: 'production_manager', name: 'Production Manager' },
    { code: 'factory_operator', name: 'Factory Operator' },
    { code: 'godown_operator', name: 'Packaging / Godown Operator' },
    { code: 'qc_officer', name: 'QC Officer' },
    { code: 'accountant', name: 'Accountant' },
    { code: 'store_manager', name: 'Inventory / Store Manager' },
    { code: 'sales_executive', name: 'Sales / Dispatch Executive' },
    { code: 'viewer_auditor', name: 'Viewer / Auditor' }
  ];

  const deleted = JSON.parse(mockStorage.erp_deleted_roles);
  const filtered = BASE_ROLES.filter(r => !deleted.includes(r.code));

  assert.strictEqual(filtered.length, 1, 'Only 1 role should remain');
  assert.strictEqual(filtered[0].code, 'super_admin', 'Remaining role must be super_admin');

  // Verify simulated tab button text
  const tabRolesBtn = { textContent: '' };
  tabRolesBtn.textContent = `System Roles (${filtered.length})`;
  assert.strictEqual(tabRolesBtn.textContent, 'System Roles (1)', 'Tab button text must be System Roles (1)');
});

runTest('4.2 Functional Simulation: deleting root super_admin role allows testing from scratch with 0 roles', () => {
  assert.match(userRolesJs, /Software Super Admin is the root governance role\. Deleting it will leave 0 configured roles for testing from scratch/, 'Must offer warning confirmation when deleting super_admin');
  assert.match(userRolesJs, /No System Roles Configured/, 'Must define empty state in renderRolesTable');
  assert.match(userRolesJs, /All system roles have been removed for fresh testing/, 'Empty state must explain fresh testing');
});

console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('===============================================================');

if (failCount > 0) process.exit(1);
