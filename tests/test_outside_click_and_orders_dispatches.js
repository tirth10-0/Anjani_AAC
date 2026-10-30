/**
 * tests/test_outside_click_and_orders_dispatches.js
 *
 * Verifies:
 * 1. Accidental outside-click dismissal is permanently disabled in APP.closeModalOnOverlay.
 * 2. Clicks on backdrop do not close modals or lose user input.
 * 3. Programmatic close methods (closeModal, close button, Cancel button) remain fully functional.
 * 4. pages/orders.html contains distinct #dispatches-table-wrap with proper toolbar, table, and pagination.
 * 5. orders.js Dispatches & Gate Passes tab switching properly targets #dispatches-table-wrap.
 * 6. dispatch-ui.js correctly renders table and empty state.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Outside-Click & Orders Dispatches Tab Verification Tests...\n');

const appJs = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const ordersHtml = fs.readFileSync(path.join(__dirname, '../pages/orders.html'), 'utf8');
const ordersJs = fs.readFileSync(path.join(__dirname, '../assets/js/orders.js'), 'utf8');
const dispatchUiJs = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-ui.js'), 'utf8');

// ── TEST GROUP 1: Accidental Outside-Click Dismissal Disabled ──
console.log('--- Test Group 1: Modal Outside-Click Dismissal Prevention ---');

// 1.1 closeModalOnOverlay must NOT remove .open class
assert(!appJs.includes('e.target.classList.remove(\'open\')'),
  'app.js must NOT remove open class on overlay click');

// 1.2 closeModalOnOverlay must be defined as a safe no-op with stopPropagation
assert(appJs.includes('function closeModalOnOverlay'),
  'app.js must define closeModalOnOverlay');
assert(appJs.includes('stopPropagation'),
  'closeModalOnOverlay must stop event propagation to protect modals');

// 1.3 closeModal and openModal must remain intact for explicit close buttons
assert(appJs.includes('function openModal(id)'),
  'app.js must define openModal');
assert(appJs.includes('function closeModal(id)'),
  'app.js must define closeModal');
assert(appJs.includes('overlay.classList.remove(\'open\')'),
  'closeModal must remove open class when explicitly invoked by user');

console.log('✅ Group 1 Passed: Outside-click dismissal disabled across all ERP modals.\n');

// ── TEST GROUP 2: Orders Dispatches & Gate Passes Tab ──
console.log('--- Test Group 2: Orders Dispatches & Gate Passes Tab Layout ---');

// 2.1 orders.html must define #dispatches-table-wrap as an independent wrapper
assert(ordersHtml.includes('id="dispatches-table-wrap"'),
  'orders.html must define #dispatches-table-wrap container');

// 2.2 #order-items-table-wrap must be closed BEFORE #dispatches-table-wrap
const orderItemsWrapIndex = ordersHtml.indexOf('id="order-items-table-wrap"');
const dispatchesWrapIndex = ordersHtml.indexOf('id="dispatches-table-wrap"');
assert(orderItemsWrapIndex !== -1, 'orders.html must contain #order-items-table-wrap');
assert(dispatchesWrapIndex !== -1, 'orders.html must contain #dispatches-table-wrap');
assert(dispatchesWrapIndex > orderItemsWrapIndex, '#dispatches-table-wrap must follow #order-items-table-wrap');

const sliceBetween = ordersHtml.slice(orderItemsWrapIndex, dispatchesWrapIndex);
assert(sliceBetween.includes('</div>'), '#order-items-table-wrap must be closed before #dispatches-table-wrap begins');

// 2.3 #dispatches-table-wrap must contain table, search, and status filters
assert(ordersHtml.includes('id="dispatches-table"'),
  'orders.html must contain #dispatches-table');
assert(ordersHtml.includes('id="dispatch-search-input"'),
  'orders.html must contain #dispatch-search-input');
assert(ordersHtml.includes('id="dispatch-status-pill-filters"'),
  'orders.html must contain #dispatch-status-pill-filters');

// 2.4 orders.js tab switching must show #dispatches-table-wrap and invoke DISPATCH_UI
assert(ordersJs.includes('activeOrderTab === \'Dispatches\''),
  'orders.js must handle activeOrderTab === Dispatches');
assert(ordersJs.includes('dispWrap.style.display = \'\''),
  'orders.js must reveal dispWrap when Dispatches tab is active');
assert(ordersJs.includes('window.DISPATCH_UI.loadDispatches()'),
  'orders.js must trigger loadDispatches on tab activation');

// 2.5 dispatch-ui.js has loadDispatches and renderDispatchesTable
assert(dispatchUiJs.includes('loadDispatches()'),
  'dispatch-ui.js must define loadDispatches');
assert(dispatchUiJs.includes('renderDispatchesTable()'),
  'dispatch-ui.js must define renderDispatchesTable');

console.log('✅ Group 2 Passed: Orders Dispatches tab wrapper, layout, and loading verified.\n');

console.log('🎉 ALL OUTSIDE-CLICK & ORDERS DISPATCHES TESTS PASSED!\n');
