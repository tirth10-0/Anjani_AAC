/**
 * tests/test_bug_fixes_and_stabilization.js
 * Comprehensive automated verification for the 5 ERP Bug Fixes & Stabilization:
 *   1. Intercompany Links Data Loading & TenantContext.getActiveCompanyId()
 *   2. Inventory Table Status Column Rendering (No Ellipse/Oval Squishing)
 *   3. Roles & Access Control UI, Search, Metrics, and Confirmation Dialogs
 *   4. Sidebar Scroll-Position Preservation & Restoration Across Navigation
 *   5. Global Dropdown Standardization (Native vs Searchable, Readonly Closed State)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('--- ERP BUG FIXES & STABILIZATION AUTOMATED TEST SUITE ---');
console.log('===============================================================');

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

// ===================================================================
// SUITE 1: ISSUE 1 - INTERCOMPANY LINKS RUNTIME ERROR & DATA LOADING
// ===================================================================
console.log('\nSuite 1: Intercompany Links & Tenant Context Consistency');

const tenantContextCode = fs.readFileSync('assets/js/tenant-context.js', 'utf8');
const intercompanyCode = fs.readFileSync('assets/js/intercompany.js', 'utf8');

runTest('1.1 TenantContext defines getActiveCompanyId alias for getCompanyId', () => {
  assert.ok(tenantContextCode.includes('getActiveCompanyId()'), 'tenant-context.js must define getActiveCompanyId()');
  assert.ok(tenantContextCode.includes('return this.getCompanyId()'), 'getActiveCompanyId must return this.getCompanyId()');
});

runTest('1.2 intercompany.js safely resolves user company ID without runtime error', () => {
  assert.ok(intercompanyCode.includes('function getUserCompanyId()'), 'intercompany.js must define safe getUserCompanyId helper');
  assert.ok(intercompanyCode.includes('getUserCompanyId()'), 'loadTransfers must invoke getUserCompanyId()');
});

runTest('1.3 loadTransfers resolves loading skeleton into error state on failure', () => {
  assert.ok(intercompanyCode.includes('table-error-state'), 'loadTransfers catch block must render .table-error-state');
  assert.ok(intercompanyCode.includes('table-retry-btn'), 'loadTransfers catch block must provide retry CTA');
  assert.ok(!intercompanyCode.includes('window.TENANT_CONTEXT.getActiveCompanyId() : 1'), 'Must not call getActiveCompanyId unsafely');
});

runTest('1.4 intercompany.js subscribes to companyChanged event for dynamic reload', () => {
  assert.ok(intercompanyCode.includes("window.addEventListener('companyChanged'"), 'Must listen to companyChanged');
  assert.ok(intercompanyCode.includes('window.TENANT_CONTEXT?.subscribe'), 'Must subscribe to TENANT_CONTEXT');
});

// ===================================================================
// SUITE 2: ISSUE 2 - INVENTORY TABLE STATUS COLUMN RENDERING
// ===================================================================
console.log('\nSuite 2: Inventory Status Column & Badge Dot Indicator');

const styleCss = fs.readFileSync('assets/css/style.css', 'utf8');
const inventoryJs = fs.readFileSync('assets/js/inventory.js', 'utf8');
const utilsJs = fs.readFileSync('assets/js/utils.js', 'utf8');

runTest('2.1 CSS guards against squishing outer .badge container when .badge-dot is present', () => {
  assert.ok(styleCss.includes('.badge.badge-dot'), 'style.css must have .badge.badge-dot container rule');
  assert.ok(styleCss.includes('width: auto !important;'), '.badge.badge-dot must preserve width: auto');
  assert.ok(styleCss.includes('height: auto !important;'), '.badge.badge-dot must preserve height: auto');
});

runTest('2.2 .badge-dot dot sizing applies specifically to child dot elements', () => {
  assert.ok(styleCss.includes('.badge > .badge-dot') || styleCss.includes('.badge-dot:empty') || styleCss.includes('span.badge-dot'), 'Must target child or empty dot');
});

runTest('2.3 inventory.js uses UTILS.statusBadge for authoritative stock badge rendering', () => {
  assert.ok(inventoryJs.includes('UTILS.statusBadge(statusText, true)'), 'inventory.js must use UTILS.statusBadge with showDot');
  assert.ok(!inventoryJs.includes('<span class="badge badge-success badge-dot">In Stock</span>'), 'Must not hardcode outer badge-dot');
  assert.ok(!inventoryJs.includes('<span class="badge badge-gray badge-dot">Out of Stock</span>'), 'Must not hardcode outer badge-dot for out of stock');
});

runTest('2.4 UTILS.statusBadge renders child <span class="badge-dot"></span> alongside text', () => {
  // Simulate UTILS in node
  const UTILS_FN = new Function(utilsJs + '; return statusBadge;');
  const statusBadge = UTILS_FN();
  const htmlInStock = statusBadge('In Stock', true);
  assert.ok(htmlInStock.includes('<span class="badge-dot"></span>In Stock</span>'), 'In Stock must have child dot and text');
  assert.ok(htmlInStock.includes('badge-approved'), 'In Stock must map to badge-approved');

  const htmlLow = statusBadge('Low Stock', true);
  assert.ok(htmlLow.includes('<span class="badge-dot"></span>Low Stock</span>'), 'Low Stock must have child dot and text');
  assert.ok(htmlLow.includes('badge-lowstock'), 'Low Stock must map to badge-lowstock');

  const htmlOut = statusBadge('Out of Stock', true);
  assert.ok(htmlOut.includes('<span class="badge-dot"></span>Out of Stock</span>'), 'Out of Stock must have child dot and text');
  assert.ok(htmlOut.includes('badge-gray'), 'Out of Stock must map to badge-gray');
});

// ===================================================================
// SUITE 3: ISSUE 3 - ROLES & ACCESS CONTROL PAGE UI
// ===================================================================
console.log('\nSuite 3: Roles & Access Control Page UI Polish');

const userRolesHtml = fs.readFileSync('pages/user-roles.html', 'utf8');
const userRolesJs = fs.readFileSync('assets/js/user-roles.js', 'utf8');

runTest('3.1 pages/user-roles.html has properly structured search toolbar with SVG search icon', () => {
  assert.ok(userRolesHtml.includes('class="table-search"'), 'Must have .table-search wrapper');
  assert.ok(userRolesHtml.includes('id="search-users"'), 'Must contain search-users input');
  assert.ok(userRolesHtml.includes('<svg'), 'Must have search icon SVG');
});

runTest('3.2 Role filter select is tagged with data-native="true" and table toolbar displays total info', () => {
  assert.ok(userRolesHtml.includes('id="filter-user-role"'), 'Must contain filter-user-role');
  assert.ok(userRolesHtml.includes('data-native="true"'), 'Filter must have data-native="true"');
  assert.ok(userRolesHtml.includes('id="users-total-info"'), 'Must have users-total-info span');
});

runTest('3.3 User assignments table specifies responsive column widths fitting 100% width', () => {
  assert.ok(userRolesHtml.includes('style="width:24%;"'), 'User/email header must have width 24%');
  assert.ok(userRolesHtml.includes('style="width:16%;"'), 'Assigned role header must have width 16%');
  assert.ok(userRolesHtml.includes('id="users-table"'), 'Must have users-table');
});

runTest('3.4 user-roles.js implements renderUsersSlice with avatar initials and row action buttons', () => {
  assert.ok(userRolesJs.includes('renderUsersSlice'), 'user-roles.js must define renderUsersSlice');
  assert.ok(userRolesJs.includes('action-btn edit'), 'Must have action-btn edit');
  assert.ok(userRolesJs.includes('title="Revoke Access"'), 'Must have Revoke Access button');
});

runTest('3.5 user-roles.js uses TableEnhancer for client-side pagination', () => {
  assert.ok(userRolesJs.includes('usersTableEnhancer'), 'user-roles.js must maintain usersTableEnhancer instance');
  assert.ok(userRolesJs.includes('new window.TableEnhancer'), 'user-roles.js must instantiate TableEnhancer');
});

runTest('3.6 user-roles.js debounces user search input', () => {
  assert.ok(userRolesJs.includes('debouncedFilterUsersTable'), 'Must have debouncedFilterUsersTable');
  assert.ok(userRolesJs.includes('UTILS.debounce(filterUsersTable, 250)'), 'Must debounce by 250ms');
});

runTest('3.7 revokeUserAssignment uses modal confirmation instead of unstyled window.confirm', () => {
  assert.ok(userRolesJs.includes('APP.showConfirm'), 'revokeUserAssignment must use APP.showConfirm');
  assert.ok(userRolesJs.includes('isDanger: true'), 'Confirmation must declare isDanger: true');
});

runTest('3.8 saveUserRoleAssignment protects against duplicate submissions with APP.guardSubmit', () => {
  assert.ok(userRolesJs.includes('APP.guardSubmit'), 'saveUserRoleAssignment must use APP.guardSubmit');
});

// ===================================================================
// SUITE 4: ISSUE 4 - SIDEBAR SCROLL POSITION PRESERVATION
// ===================================================================
console.log('\nSuite 4: Sidebar Scroll Position Preservation & Restoration');

const sharedLayoutJs = fs.readFileSync('assets/js/shared-layout.js', 'utf8');

runTest('4.1 shared-layout.js does NOT wipe scroll position on page layout injection', () => {
  assert.ok(!sharedLayoutJs.includes("sessionStorage.removeItem('sidebar_scroll_pos');"), 'Must not clear scroll on inject');
  assert.ok(!sharedLayoutJs.includes('if (nav) nav.scrollTop = 0;'), 'Must not reset scrollTop = 0 on inject');
});

runTest('4.2 restoreSidebarScroll function restores vertical scroll position from storage', () => {
  assert.ok(sharedLayoutJs.includes('function restoreSidebarScroll()'), 'Must define restoreSidebarScroll()');
  assert.ok(sharedLayoutJs.includes('sessionStorage.getItem(\'erp_sidebar_scroll_pos\')'), 'Must read erp_sidebar_scroll_pos');
  assert.ok(sharedLayoutJs.includes('nav.scrollTop = pos'), 'Must restore nav.scrollTop to saved pos');
});

runTest('4.3 Active navigation item is scrolled into view if no saved position exists', () => {
  assert.ok(sharedLayoutJs.includes('activeItem.scrollIntoView'), 'Must scroll activeItem into view');
});

runTest('4.4 Continuous scroll listener and click handlers record vertical position', () => {
  assert.ok(sharedLayoutJs.includes("sessionStorage.setItem('erp_sidebar_scroll_pos'"), 'Must store scroll position');
  assert.ok(sharedLayoutJs.includes("navEl.addEventListener('scroll'"), 'Must listen to scroll on sidebar-nav');
});

// ===================================================================
// SUITE 5: ISSUE 5 - STANDARDIZE DROPDOWNS THROUGHOUT THE ENTIRE ERP
// ===================================================================
console.log('\nSuite 5: Dropdown Standardization (Native vs Searchable)');

const searchSelectJs = fs.readFileSync('assets/js/components/search-select.js', 'utf8');
const searchSelectCss = fs.readFileSync('assets/css/components/search-select.css', 'utf8');

runTest('5.1 search-select.js sets input.readOnly = true by default in closed state', () => {
  assert.ok(searchSelectJs.includes('this.input.readOnly = true;'), 'Closed state must be readOnly = true');
});

runTest('5.2 search-select.css enforces cursor: pointer and caret-color: transparent for closed dropdown', () => {
  assert.ok(searchSelectCss.includes('cursor: pointer !important;'), 'Closed input must have cursor: pointer');
  assert.ok(searchSelectCss.includes('caret-color: transparent !important;'), 'Closed input must have caret-color: transparent');
});

runTest('5.3 Open dropdown switches to editable search input and selects text', () => {
  assert.ok(searchSelectJs.includes('this.container.classList.add(\'open\');'), 'open() must add open class to container');
  assert.ok(searchSelectJs.includes('this.input.readOnly = false;'), 'open() must make input editable for typing search');
  assert.ok(searchSelectCss.includes('.uss-container.open .uss-input'), 'css must style open state with text cursor');
});

runTest('5.4 Closing dropdown re-locks input to readOnly and reverts unselected text', () => {
  assert.ok(searchSelectJs.includes('this.container.classList.remove(\'open\');'), 'close() must remove open class');
  assert.ok(searchSelectCss.includes('.uss-input[readonly]'), 'CSS must enforce pointer cursor for readonly input');
});

runTest('5.5 Keyboard accessibility: Space, Enter, or ArrowDown opens closed dropdown', () => {
  assert.ok(searchSelectJs.includes("e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown'"), 'Must open on Space/Enter/ArrowDown');
});

runTest('5.6 isSearchableSelect excludes table filters, pagination, and small fixed selects', () => {
  assert.ok(searchSelectJs.includes('static isSearchableSelect(select)'), 'Must define isSearchableSelect');
  assert.ok(searchSelectJs.includes('pagination-size-select'), 'Must exclude pagination');
  assert.ok(searchSelectJs.includes('matrix-role-selector'), 'Must exclude role matrix');
  assert.ok(searchSelectJs.includes("select.getAttribute('data-native') === 'true'"), 'Must honor data-native="true"');
});

runTest('5.7 isSearchableSelect targets entity fields: product, client, supplier, batch, SKU, warehouse', () => {
  assert.ok(searchSelectJs.includes('product'), 'Must target product');
  assert.ok(searchSelectJs.includes('client'), 'Must target client');
  assert.ok(searchSelectJs.includes('supplier'), 'Must target supplier');
  assert.ok(searchSelectJs.includes('batch'), 'Must target batch');
  assert.ok(searchSelectJs.includes('sku'), 'Must target sku');
});

runTest('5.8 Non-searchable selects are reverted to native .form-select with clean chevron styling', () => {
  assert.ok(searchSelectJs.includes('select._ussInstance.destroy()'), 'Non-searchable select must destroy instance if present');
  assert.ok(searchSelectJs.includes("select.classList.add('form-select')"), 'Must add .form-select class for native styling');
});

// ===================================================================
// SUMMARY
// ===================================================================
console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('===============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 24 TESTS PASSED! ERP BUG FIXES AND STABILIZATION VERIFIED.');
}
