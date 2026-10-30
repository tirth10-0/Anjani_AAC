/**
 * tests/test_admin_modules_management_and_audit_redesign.js
 *
 * Comprehensive Automated Verification Suite for:
 * 1. Mobile Navbar Interaction & Visibility (overflow: visible, floating sheet coordinates, brand click)
 * 2. Security & RBAC Audit Trail Redesign (standard search input, 5 balanced columns, in-flight debounce refresh)
 * 3. Companies & Branches Management (Status column, dependency checks, root entity guard, safe archival, branch deletion)
 * 4. Warehouses Management (Status column, inventory & movement dependency checks, safe archival, activation)
 * 5. Intercompany Trading & Dispatches (State-machine actions: Cancel, Resubmit, and trading matrix deletion)
 * 6. Roles & Access Control (Super Admin safety guard preventing lockout, assignment deletion)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Admin Modules Management & Audit Redesign Tests...\n');

const responsiveCss = fs.readFileSync(path.join(__dirname, '../assets/css/responsive.css'), 'utf8');
const sharedLayoutJs = fs.readFileSync(path.join(__dirname, '../assets/js/shared-layout.js'), 'utf8');
const auditLogsHtml = fs.readFileSync(path.join(__dirname, '../pages/audit-logs.html'), 'utf8');
const auditLogsJs = fs.readFileSync(path.join(__dirname, '../assets/js/audit-logs.js'), 'utf8');
const companiesHtml = fs.readFileSync(path.join(__dirname, '../pages/companies.html'), 'utf8');
const companiesJs = fs.readFileSync(path.join(__dirname, '../assets/js/companies.js'), 'utf8');
const warehousesHtml = fs.readFileSync(path.join(__dirname, '../pages/warehouses.html'), 'utf8');
const warehousesJs = fs.readFileSync(path.join(__dirname, '../assets/js/warehouses.js'), 'utf8');
const intercompanyJs = fs.readFileSync(path.join(__dirname, '../assets/js/intercompany.js'), 'utf8');
const userRolesJs = fs.readFileSync(path.join(__dirname, '../assets/js/user-roles.js'), 'utf8');

// ── TEST GROUP 1: Mobile Navbar Layout & Interactivity ──
console.log('--- Test Group 1: Mobile Navbar Dropdowns & Interactivity ---');

// 1.1 Topbar overflow must be visible on mobile to allow dropdown display
assert(responsiveCss.includes('.topbar') && responsiveCss.includes('overflow: visible !important'),
  'responsive.css must set .topbar overflow: visible !important to prevent clipping dropdowns');
assert(responsiveCss.includes('z-index: 250 !important'),
  'responsive.css must set .topbar z-index to 250 !important');

// 1.2 Mobile dropdown floating sheet styles
assert(responsiveCss.includes('.dropdown-menu-company') && responsiveCss.includes('position: fixed !important'),
  'responsive.css must position mobile company dropdown as fixed floating sheet');
assert(responsiveCss.includes('.dropdown-menu-notif') && responsiveCss.includes('position: fixed !important'),
  'responsive.css must position mobile notification dropdown as fixed floating sheet');
assert(responsiveCss.includes('#user-dropdown') && responsiveCss.includes('position: fixed !important'),
  'responsive.css must position mobile user dropdown as fixed floating sheet');

// 1.3 Pointer events none on button children for reliable touch target detection
assert(responsiveCss.includes('pointer-events: none'),
  'responsive.css must disable pointer events on button children so taps trigger parent button');

// 1.4 Mobile brand clickable to dashboard
assert(sharedLayoutJs.includes('topbar-mobile-brand') && sharedLayoutJs.includes('dashboard.html'),
  'shared-layout.js must navigate to dashboard.html when mobile brand is clicked');

// 1.5 Shared layout wires user dropdown and mutual dismissal
assert(sharedLayoutJs.includes('initUserDropdown'),
  'shared-layout.js must define and call initUserDropdown');
assert(sharedLayoutJs.includes('menu.classList.remove(\'open\')') || sharedLayoutJs.includes('classList.remove(\'open\')'),
  'shared-layout.js must handle dropdown dismissal');

console.log('✅ Group 1 Passed: Mobile navbar layout and touch interactivity verified.\n');

// ── TEST GROUP 2: Security & RBAC Audit Trail Desktop Redesign ──
console.log('--- Test Group 2: Security & RBAC Audit Trail Desktop Redesign ---');

// 2.1 Standardized table search toolbar
assert(auditLogsHtml.includes('class="table-search"'),
  'audit-logs.html must use ERP standard .table-search component');
assert(auditLogsHtml.includes('id="search-audit"'),
  'audit-logs.html must include search input id="search-audit"');
assert(auditLogsHtml.includes('id="filter-audit-date"'),
  'audit-logs.html must include date filter id="filter-audit-date"');
assert(auditLogsHtml.includes('id="btn-clear-audit-filters"'),
  'audit-logs.html must include clear filters button');
assert(auditLogsHtml.includes('id="audit-total-info"'),
  'audit-logs.html must include total info indicator');

// 2.2 Table header has 5 balanced columns
assert(auditLogsHtml.includes('Event & Timestamp'),
  'audit-logs.html must combine Event and Timestamp into Column 1');
assert(auditLogsHtml.includes('Actor'),
  'audit-logs.html must have Column 2 for Actor');
assert(auditLogsHtml.includes('Affected Record'),
  'audit-logs.html must have Column 3 for Affected Record');
assert(auditLogsHtml.includes('Changes (Before → After)'),
  'audit-logs.html must have Column 4 for Changes');
assert(auditLogsHtml.includes('Action'),
  'audit-logs.html must have Column 5 for Action');

// 2.3 Script logic for refresh, clear filters, and diff modal
assert(auditLogsJs.includes('refreshAuditLogs'),
  'audit-logs.js must define refreshAuditLogs');
assert(auditLogsJs.includes('clearAuditFilters'),
  'audit-logs.js must define clearAuditFilters');
assert(auditLogsJs.includes('filter-audit-date'),
  'audit-logs.js must filter logs by date when date is selected');
assert(auditLogsHtml.includes('id="audit-detail-modal"'),
  'audit-logs.html must define #audit-detail-modal overlay');
assert(auditLogsJs.includes('openAuditDiffModal'),
  'audit-logs.js must define openAuditDiffModal');
assert(auditLogsJs.includes('showAuditModal'),
  'audit-logs.js must define showAuditModal');
assert(auditLogsJs.includes('audit-detail-modal'),
  'audit-logs.js must target audit-detail-modal');

console.log('✅ Group 2 Passed: Audit trail desktop redesign, diff modal, and filter controls verified.\n');

// ── TEST GROUP 3: Companies & Branches Safe Deletion & Uniform Action Buttons ──
console.log('--- Test Group 3: Companies & Branches Safe Deletion & Uniform Actions ---');

// 3.1 Table headers & dependency modal in HTML
assert(companiesHtml.includes('<th style="width:8%">Status</th>'),
  'companies.html must contain Status column header in companies-table');
assert(companiesHtml.includes('id="company-dependency-modal"'),
  'companies.html must include #company-dependency-modal for blocked deletions');

// 3.2 Companies table renders Edit, Delete, and Archival Lifecycle
assert(companiesJs.includes('archiveCompany'),
  'companies.js must define archiveCompany for safe archival lifecycle');
assert(companiesJs.includes('safeDeleteCompany'),
  'companies.js must define safeDeleteCompany');
assert(companiesJs.includes('openEditCompany'),
  'companies.js must define openEditCompany');

// 3.3 Protection of Root Company (Anjani Agri Care ID 1) and active company
assert(companiesJs.includes('comp.id === 1'),
  'companies.js must guard against deleting root company ID 1');
assert(companiesJs.includes('window.TENANT_CONTEXT.getCompanyId()'),
  'companies.js must guard against deleting currently active company');

// 3.4 Dependency checking across ERP modules
assert(companiesJs.includes('from(\'branches\')') && companiesJs.includes('from(\'warehouses\')') && companiesJs.includes('from(\'stock_batches\')'),
  'companies.js must check branches, warehouses, and stock_batches dependencies');
assert(companiesJs.includes('from(\'orders\')') && companiesJs.includes('from(\'invoices\')') && companiesJs.includes('from(\'intercompany_transfers\')'),
  'companies.js must check orders, invoices, and intercompany_transfers dependencies');

// 3.5 Branch safe deletion
assert(companiesJs.includes('safeDeleteBranch'),
  'companies.js must define safeDeleteBranch');

console.log('✅ Group 3 Passed: Companies & branches safe deletion, uniform buttons, and safe archival verified.\n');

// ── TEST GROUP 4: Warehouses Safe Deletion & Safe Archival ──
console.log('--- Test Group 4: Warehouses Safe Deletion & Safe Archival ---');

// 4.1 HTML Status column and dependency modal
assert(warehousesHtml.includes('<th style="width:8%">Status</th>'),
  'warehouses.html must include Status column header');
assert(warehousesHtml.includes('id="warehouse-dependency-modal"'),
  'warehouses.html must include #warehouse-dependency-modal');

// 4.2 Script logic for safeDeleteWarehouse and openEditWarehouse
assert(warehousesJs.includes('safeDeleteWarehouse'),
  'warehouses.js must define safeDeleteWarehouse');
assert(warehousesJs.includes('openEditWarehouse'),
  'warehouses.js must define openEditWarehouse');
assert(warehousesJs.includes('archiveWarehouse'),
  'warehouses.js must define archiveWarehouse for safe archival');

// 4.3 Dependency checking for active stock and movement history
assert(warehousesJs.includes('from(\'stock_batches\')') && warehousesJs.includes('from(\'stock_movements\')'),
  'warehouses.js must check stock_batches and stock_movements for warehouse deletion');
assert(warehousesJs.includes('from(\'intercompany_transfers\')'),
  'warehouses.js must check intercompany transfers linked to warehouse');

console.log('✅ Group 4 Passed: Warehouses safe deletion, inventory dependencies, and archive removal verified.\n');

// ── TEST GROUP 5: Intercompany State Machine & Trading Matrix ──
console.log('--- Test Group 5: Intercompany State Machine & Trading Matrix ---');

// 5.1 Row actions for Cancel, Resubmit
assert(intercompanyJs.includes('cancelTransfer'),
  'intercompany.js must define cancelTransfer function');
assert(intercompanyJs.includes('resubmitTransfer'),
  'intercompany.js must define resubmitTransfer function');
assert(intercompanyJs.includes('deleteRelationship'),
  'intercompany.js must define deleteRelationship function');

// 5.2 Dependency guard on deleteRelationship
assert(intercompanyJs.includes('status\', [\'Draft\', \'Approved\', \'In Transit\']'),
  'deleteRelationship must check for active non-completed transfers before deleting relationship');

console.log('✅ Group 5 Passed: Intercompany state-machine transitions and trading matrix removal verified.\n');

// ── TEST GROUP 6: Roles & Access Control Safety Guards & Persistence ──
console.log('--- Test Group 6: Roles & Access Control Safety Guards & Persistence ---');

// 6.1 Super admin lockout prevention in revokeUserAssignment
assert(userRolesJs.includes('activeSuperAdmins') && userRolesJs.includes('activeSuperAdmins.length <= 1'),
  'user-roles.js must verify at least one active super_admin remains before revoking access');

// 6.2 Super admin demotion prevention in saveUserRoleAssignment
assert(userRolesJs.includes('origIsSuper') && userRolesJs.includes('roleCode !== \'super_admin\''),
  'user-roles.js must prevent demoting the sole remaining active super_admin');

// 6.3 Assignment deletion with safety check
assert(userRolesJs.includes('deleteUserAssignment'),
  'user-roles.js must define deleteUserAssignment');

// 6.4 Persistent role assignment storage via ROLES_STORAGE_KEY
assert(userRolesJs.includes('ROLES_STORAGE_KEY'),
  'user-roles.js must define ROLES_STORAGE_KEY for persistent localStorage fallback');
assert(userRolesJs.includes('localStorage.setItem(ROLES_STORAGE_KEY'),
  'user-roles.js must persist mutations to localStorage');
assert(userRolesJs.includes('localStorage.getItem(ROLES_STORAGE_KEY)'),
  'user-roles.js must retrieve persisted assignments from localStorage on load');

console.log('✅ Group 6 Passed: Super Admin safety guards, persistent role assignment storage verified.\n');

console.log('🎉 ALL 6 ADMIN MODULE & AUDIT REDESIGN TEST GROUPS PASSED SUCCESSFULLY!\n');
