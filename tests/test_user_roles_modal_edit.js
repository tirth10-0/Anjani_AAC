/**
 * tests/test_user_roles_modal_edit.js
 * Automated Verification for User Roles Modal & Edit Button functionality
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('--- USER ROLES EDIT BUTTON & MODAL VERIFICATION SUITE ---');
console.log('===============================================================');

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'pages', 'user-roles.html');
const jsPath = path.join(rootDir, 'assets', 'js', 'user-roles.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

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

// 1. HTML Modal Overlay Checks
runTest('1.1 user-role-modal overlay does not have conflicting inline display:none', () => {
  assert.ok(!html.includes('id="user-role-modal" style="display:none;"'), 'Must not have inline display:none overriding .modal-overlay');
  assert.match(html, /<div class="modal-overlay" id="user-role-modal">/, 'Must define .modal-overlay without inline display:none');
});

runTest('1.2 Modal header has clean close button with SVG icon', () => {
  assert.match(html, /<button class="modal-close" onclick="closeUserRoleModal\(\)">[\s\S]*?<svg/, 'Modal close must have SVG icon');
});

// 2. Action Buttons & String IDs in renderUsersSlice
runTest('2.1 renderUsersSlice passes quoted string IDs to action handlers to prevent syntax/type mismatch', () => {
  assert.match(js, /onclick="editUserAssignment\('\$\{a\.id\}'\)"/, 'Edit button must pass ID in quotes');
  assert.match(js, /onclick="revokeUserAssignment\('\$\{a\.id\}'\)"/, 'Revoke button must pass ID in quotes');
  assert.match(js, /onclick="reinstateUserAssignment\('\$\{a\.id\}'\)"/, 'Reinstate button must pass ID in quotes');
  assert.match(js, /onclick="deleteUserAssignment\('\$\{a\.id\}'\)"/, 'Delete button must pass ID in quotes');
});

// 3. Modal Open/Close & APP Integration in user-roles.js
runTest('3.1 openAssignUserModal integrates with APP.openModal and sets .open class', () => {
  assert.match(js, /APP\.openModal\('user-role-modal'\)/, 'Must call APP.openModal');
  assert.match(js, /modal\.classList\.add\('open'\)/, 'Must provide fallback classList.add("open")');
});

runTest('3.2 closeUserRoleModal integrates with APP.closeModal', () => {
  assert.match(js, /APP\.closeModal\('user-role-modal'\)/, 'Must call APP.closeModal');
});

runTest('3.3 openAssignUserModal handles empty companies gracefully with fallback', () => {
  assert.match(js, /availableCompanies = \[\{ id: assignment\?\.company_id \|\| 1, name: 'Anjani Agri Care', code: 'ACC' \}\]/);
});

// 4. Edit Functionality & Safe Lookups
runTest('4.1 editUserAssignment uses safe String comparison to locate record', () => {
  assert.match(js, /allAssignments\.find\(a => String\(a\.id\) === String\(id\)\)/, 'Must compare String(a.id) === String(id)');
});

runTest('4.2 deleteUserAssignment uses safe String comparison for filtering', () => {
  assert.match(js, /allAssignments = allAssignments\.filter\(a => String\(a\.id\) !== String\(id\)\)/, 'Delete must filter using String comparison');
});

// 5. Global Window Registrations
runTest('5.1 window object exposes all user roles handlers for HTML inline execution', () => {
  assert.match(js, /window\.openAssignUserModal = openAssignUserModal;/);
  assert.match(js, /window\.closeUserRoleModal = closeUserRoleModal;/);
  assert.match(js, /window\.editUserAssignment = editUserAssignment;/);
  assert.match(js, /window\.revokeUserAssignment = revokeUserAssignment;/);
  assert.match(js, /window\.reinstateUserAssignment = reinstateUserAssignment;/);
  assert.match(js, /window\.deleteUserAssignment = deleteUserAssignment;/);
  assert.match(js, /window\.saveUserRoleAssignment = saveUserRoleAssignment;/);
  assert.match(js, /window\.renderRolesTable = renderRolesTable;/);
  assert.match(js, /window\.seedAllTenRoles = seedAllTenRoles;/);
  assert.match(js, /window\.editRole = editRole;/);
  assert.match(js, /window\.deleteRole = deleteRole;/);
  assert.match(js, /window\.openCustomRoleModal = openCustomRoleModal;/);
  assert.match(js, /window\.closeCustomRoleModal = closeCustomRoleModal;/);
  assert.match(js, /window\.saveCustomRole = saveCustomRole;/);
});

// 6. System Roles Directory & 10 Role Seeding
runTest('6.1 user-roles.html defines System Roles (10) tab and tab-roles-view table', () => {
  assert.match(html, /id="tab-roles-btn"/, 'Must have tab-roles-btn');
  assert.match(html, /id="tab-roles-view"/, 'Must have tab-roles-view');
  assert.match(html, /id="roles-table"/, 'Must have roles-table');
  assert.match(html, /id="roles-tbody"/, 'Must have roles-tbody');
});

runTest('6.2 user-roles.html seed option removed from toolbar as requested', () => {
  assert.ok(!html.includes('id="btn-seed-roles"'), 'Must not have btn-seed-roles');
  assert.ok(!html.includes('Seed All 10 Role Accounts'), 'Must not have Seed All 10 Role Accounts button in HTML');
});

runTest('6.3 user-roles.js maintains SYSTEM_ROLES_CATALOG with all 10 roles', () => {
  assert.match(js, /SYSTEM_ROLES_CATALOG/, 'Must define SYSTEM_ROLES_CATALOG');
  assert.match(js, /code:\s*'super_admin'/);
  assert.match(js, /code:\s*'company_owner'/);
  assert.match(js, /code:\s*'production_manager'/);
  assert.match(js, /code:\s*'factory_operator'/);
  assert.match(js, /code:\s*'godown_operator'/);
  assert.match(js, /code:\s*'qc_officer'/);
  assert.match(js, /code:\s*'accountant'/);
  assert.match(js, /code:\s*'store_manager'/);
  assert.match(js, /code:\s*'sales_executive'/);
  assert.match(js, /code:\s*'viewer_auditor'/);
});

runTest('6.4 user-roles.js defines renderRolesTable, openRoleMatrix, and seedAllTenRoles', () => {
  assert.match(js, /function renderRolesTable\(\)/);
  assert.match(js, /function openRoleMatrix\(roleCode\)/);
  assert.match(js, /function seedAllTenRoles\(\)/);
});

// 7. Roles Table Layout & Responsive Fit
runTest('7.1 roles-table header column widths sum exactly to 100%', () => {
  assert.match(html, /<th style="width:23%;">Role & Security Persona<\/th>/);
  assert.match(html, /<th style="width:13%;">Role Code<\/th>/);
  assert.match(html, /<th style="width:26%;">Functional Domain<\/th>/);
  assert.match(html, /<th style="width:13%;">Access Scope<\/th>/);
  assert.match(html, /<th style="width:11%;">Assigned<\/th>/);
  assert.match(html, /<th style="width:14%;text-align:right;">Actions<\/th>/);

  const widths = [23, 13, 26, 13, 11, 14];
  const sum = widths.reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, 100, 'Sum of roles table column percentages must equal 100%');
});

runTest('7.2 CSS enforces fixed layout and responsive styles on #roles-table', () => {
  const tablesCssPath = path.join(rootDir, 'assets', 'css', 'tables.css');
  const tablesCss = fs.readFileSync(tablesCssPath, 'utf8');

  assert.match(tablesCss, /#roles-table\s*\{[^}]*table-layout:\s*fixed;/s);
  assert.match(tablesCss, /#roles-table\s*\{[^}]*width:\s*100%;/s);
  assert.match(tablesCss, /#roles-table th,\s*#roles-table td\s*\{[^}]*padding:\s*10px 8px;/s);
  assert.match(tablesCss, /#roles-table \.btn-role-action\s*\{[^}]*height:\s*28px;/s);
});

// 8. Role Avatar Box Standardization to #0C3925
runTest('8.1 CSS strictly defines .role-avatar-box with #0C3925 background and #ffffff text', () => {
  const tablesCssPath = path.join(rootDir, 'assets', 'css', 'tables.css');
  const tablesCss = fs.readFileSync(tablesCssPath, 'utf8');

  assert.match(tablesCss, /\.role-avatar-box\s*\{[^}]*background-color:\s*#0C3925 !important;/s);
  assert.match(tablesCss, /\.role-avatar-box\s*\{[^}]*color:\s*#ffffff !important;/s);
});

runTest('8.2 SYSTEM_ROLES_CATALOG roles all specify #0C3925 dark green color', () => {
  assert.match(js, /color:\s*'#0C3925'/);
  assert.ok(!js.includes("color: '#1e3a8a'"), 'Disparate blue color must be removed');
  assert.ok(!js.includes("color: '#047857'"), 'Disparate green color must be removed');
  assert.ok(!js.includes("color: '#b45309'"), 'Disparate orange color must be removed');
  assert.ok(!js.includes("color: '#7c3aed'"), 'Disparate purple color must be removed');
  assert.ok(!js.includes("color: '#475569'"), 'Disparate grey color must be removed');
});

runTest('8.3 renderRolesTable renders avatar using standardized .role-avatar-box class', () => {
  assert.match(js, /<div class="role-avatar-box">/);
});

// 9. Matrix Removal, White Assign Text, Edit & Delete for All Roles
runTest('9.1 Matrix button removed from renderRolesTable and Assign button styled with white #ffffff text', () => {
  assert.ok(!js.includes('btn-matrix'), 'Matrix button must be removed from table rows');
  assert.match(js, /btn-assign/);
  assert.match(js, /color:\s*#ffffff\s*!important/);
});

runTest('9.2 renderRolesTable renders Edit and Delete action buttons for all roles', () => {
  assert.match(js, /btn-edit-role/);
  assert.match(js, /editRole\('\$\{r\.code\}'\)/);
  assert.match(js, /btn-delete-role/);
  assert.match(js, /deleteRole\('\$\{r\.code\}'\)/);
});

runTest('9.3 deleteRole enforces active user assignments guard and root super_admin guard', () => {
  assert.match(js, /async function deleteRole\(roleCode\)/);
  assert.match(js, /activeAssignments\.length > 0/);
  assert.match(js, /Please reassign or revoke active users first/);
  assert.match(js, /Software Super Admin is the root governance role/);
  assert.match(js, /APP\.showConfirm/);
  assert.match(js, /ROLE_DELETED/);
});

runTest('9.4 editRole is defined and opens modal with role details populated', () => {
  assert.match(js, /function editRole\(roleCode\)/);
  assert.match(js, /edit-role-is-editing/);
  assert.match(js, /ROLE_UPDATED/);
});

runTest('9.5 user-roles.html includes role modal and Create Role action button', () => {
  assert.match(html, /id="custom-role-modal"/);
  assert.match(html, /id="role-modal-title"/);
  assert.match(html, /id="edit-role-is-editing"/);
  assert.match(html, /id="btn-create-role"/);
  assert.match(html, /openCustomRoleModal\(\)/);
  assert.match(html, /saveCustomRole\(event\)/);
});

runTest('9.6 deleteUserAssignment and revokeUserAssignment allow deleting sole Super Admin with warning confirmation', () => {
  assert.match(js, /async function deleteUserAssignment\(id\)/);
  assert.match(js, /isSoleSuperAdmin/);
  assert.match(js, /Deleting it will leave 0 active user assignments for testing purposes/);
  assert.match(js, /ROLE_ASSIGNMENT_DELETED/);
  assert.match(js, /async function revokeUserAssignment\(id\)/);
  assert.match(js, /Revoking access will leave 0 active Super Admins until reinstated/);
});

runTest('9.7 tables.css enforces min-width: 125px on users-table cell-actions to prevent button clipping', () => {
  const tablesCssPath = path.join(rootDir, 'assets', 'css', 'tables.css');
  const tablesCss = fs.readFileSync(tablesCssPath, 'utf8');
  assert.match(tablesCss, /#users-table \.cell-actions,\s*#users-table th:last-child\s*\{[^}]*min-width:\s*125px;/s);
});

console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('===============================================================');

if (failCount > 0) process.exit(1);
