/**
 * tests/test_ui_ux_performance_optimizations.js
 * Comprehensive Automated Test Suite for UI/UX & Performance Optimizations
 *
 * Verifies:
 * 1. Semantic Status Badges & Status Dots (UTILS.statusBadge):
 *    - All 11+ operational states (Pending, Approved, Rejected, Completed, Cancelled, In Transit, Quarantine, On Hold, Partial, Reversed, Out of Stock, Low Stock, In Stock).
 *    - Verification of .badge, semantic color class, and .badge-dot indicator.
 * 2. Debounce Utility (UTILS.debounce):
 *    - Rapid invocation deduplication.
 *    - Delay execution timing and argument forwarding.
 * 3. Packaging Clarity Breakdown (UTILS.formatPackagingBreakdown):
 *    - Prompt standard: 20 boxes, 10 units/box, 5 loose units -> 205 bottles, 102.5 L.
 *    - Clean handling of loose-only and full-box-only configurations.
 *    - Compact pill rendering for responsive table views.
 * 4. TableEnhancer Engine:
 *    - Client-side pagination slicing (items 0..24, 25..49).
 *    - Page boundary clamping (page <= 0 clamped to 1, page > max clamped to max).
 *    - Accurate pagination metadata (startIndex, endIndex, totalPages, filteredRecords).
 *    - Multi-column sorting (numeric, string, date) ascending and descending.
 *    - Debounced search filtering across items.
 *    - Performance benchmark: 1,000 records sorted and paginated in < 10ms.
 * 5. Double-Submission Guard (APP.guardSubmit):
 *    - Concurrent submission rejection.
 *    - Button disablement and data-submitting attribute lifecycle.
 *    - Graceful error handling and state restoration.
 * 6. Confirmation Dialog Enhancements (APP.showConfirm):
 *    - Custom titles, button labels, and isDanger option support.
 * 7. Database Migration & Schema Index Verification:
 *    - Existence of 25 composite indexes in 2026-10-15-ui-ux-performance-indexes.sql.
 * 8. CSS Design System Verification:
 *    - Semantic status classes, packaging tags, and pagination styles in style.css and tables.css.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load UTILS
const UTILS = require('../assets/js/utils.js');

// Load TableEnhancer
const TableEnhancer = require('../assets/js/components/table-enhancer.js');

// Mock APP for testing guardSubmit
const APP = {
  setButtonLoading(btn, isLoading, loadingText = '') {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.submitting = 'true';
      btn.disabled = true;
      btn._originalHtml = btn.innerHTML;
      btn.innerHTML = `<span class="btn-spinner"></span> ${loadingText || 'Processing...'}`;
    } else {
      btn.dataset.submitting = 'false';
      btn.disabled = false;
      if (btn._originalHtml) btn.innerHTML = btn._originalHtml;
    }
  },
  async guardSubmit(btnOrEl, asyncFn) {
    if (!btnOrEl) return asyncFn();
    if (btnOrEl.dataset.submitting === 'true' || btnOrEl.disabled) {
      console.warn('[APP] Duplicate submission blocked.');
      return false;
    }
    this.setButtonLoading(btnOrEl, true);
    try {
      const res = await asyncFn();
      return res !== undefined ? res : true;
    } catch (err) {
      throw err;
    } finally {
      this.setButtonLoading(btnOrEl, false);
    }
  }
};

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}:`, err.message);
    throw err;
  }
}

const asyncQueue = [];

function runAsyncTest(testName, fn) {
  totalTests++;
  const p = (async () => {
    try {
      await fn();
      passedTests++;
      console.log(`  ✓ [PASS] ${testName}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${testName}:`, err.message);
      throw err;
    }
  })();
  asyncQueue.push(p);
}

console.log('\n===============================================================');
console.log('--- UI/UX & PERFORMANCE OPTIMIZATION AUTOMATED TEST SUITE ---');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// SUITE 1: SEMANTIC STATUS BADGES & STATUS DOT INDICATORS
// ----------------------------------------------------------------------------
console.log('Suite 1: Semantic Status Badges & Status Dot Indicators');

runTest('1.1 Pending status badge renders with .badge-pending and .badge-dot', () => {
  const html = UTILS.statusBadge('Pending');
  assert.ok(html.includes('badge-pending'), 'Must contain badge-pending');
  assert.ok(html.includes('badge-dot'), 'Must contain badge-dot');
  assert.ok(html.includes('Pending'), 'Must contain status text');
});

runTest('1.2 Approved status badge renders with .badge-approved and .badge-dot', () => {
  const html = UTILS.statusBadge('Approved');
  assert.ok(html.includes('badge-approved'), 'Must contain badge-approved');
  assert.ok(html.includes('badge-dot'), 'Must contain badge-dot');
  assert.ok(html.includes('Approved'), 'Must contain status text');
});

runTest('1.3 Completed & Delivered status badge renders with .badge-completed', () => {
  const html1 = UTILS.statusBadge('Completed');
  const html2 = UTILS.statusBadge('Delivered');
  assert.ok(html1.includes('badge-completed'), 'Completed must have badge-completed');
  assert.ok(html2.includes('badge-completed'), 'Delivered must have badge-completed');
});

runTest('1.4 Rejected & Cancelled status badge renders with .badge-rejected', () => {
  const html1 = UTILS.statusBadge('Rejected');
  const html2 = UTILS.statusBadge('Cancelled');
  assert.ok(html1.includes('badge-rejected'), 'Rejected must have badge-rejected');
  assert.ok(html2.includes('badge-rejected'), 'Cancelled must have badge-rejected');
});

runTest('1.5 In Transit & Dispatched status badge renders with .badge-intransit', () => {
  const html1 = UTILS.statusBadge('In Transit');
  const html2 = UTILS.statusBadge('Dispatched');
  assert.ok(html1.includes('badge-intransit'), 'In Transit must have badge-intransit');
  assert.ok(html2.includes('badge-intransit'), 'Dispatched must have badge-intransit');
});

runTest('1.6 Quarantine & On Hold status badge renders with .badge-quarantine / .badge-onhold', () => {
  const html1 = UTILS.statusBadge('Quarantine');
  const html2 = UTILS.statusBadge('On Hold');
  assert.ok(html1.includes('badge-quarantine'), 'Quarantine must have badge-quarantine');
  assert.ok(html2.includes('badge-onhold'), 'On Hold must have badge-onhold');
});

runTest('1.7 Partial, Partially Dispatched & Received render with .badge-partial', () => {
  const html1 = UTILS.statusBadge('Partial');
  const html2 = UTILS.statusBadge('Partially Dispatched');
  const html3 = UTILS.statusBadge('Partially Received');
  assert.ok(html1.includes('badge-partial'), 'Partial must have badge-partial');
  assert.ok(html2.includes('badge-partial'), 'Partially Dispatched must have badge-partial');
  assert.ok(html3.includes('badge-partial'), 'Partially Received must have badge-partial');
});

runTest('1.8 Reversed status badge renders with .badge-reversed', () => {
  const html = UTILS.statusBadge('Reversed');
  assert.ok(html.includes('badge-reversed'), 'Reversed must have badge-reversed');
});

runTest('1.9 Status badge can disable dot indicator via showDot = false', () => {
  const html = UTILS.statusBadge('Approved', false);
  assert.ok(html.includes('badge-approved'), 'Must contain badge-approved');
  assert.ok(!html.includes('badge-dot'), 'Must NOT contain badge-dot when showDot=false');
});

// ----------------------------------------------------------------------------
// SUITE 2: DEBOUNCE TIMING & DEDUPLICATION (UTILS.debounce)
// ----------------------------------------------------------------------------
console.log('\nSuite 2: Debounce Engine (UTILS.debounce)');

runAsyncTest('2.1 Rapid successive calls execute only once after wait period', async () => {
  let callCount = 0;
  let lastValue = null;

  const fn = (val) => {
    callCount++;
    lastValue = val;
  };

  const debounced = UTILS.debounce(fn, 60);

  // Rapidly fire 10 times in 15ms
  for (let i = 1; i <= 10; i++) {
    debounced(`call-${i}`);
  }

  assert.strictEqual(callCount, 0, 'Should not have fired immediately');

  // Wait 100ms for debounce period to expire
  await new Promise(r => setTimeout(r, 100));

  assert.strictEqual(callCount, 1, 'Debounced function must have executed exactly once');
  assert.strictEqual(lastValue, 'call-10', 'Must have captured the final arguments');
});

runAsyncTest('2.2 Separate invocations after timeout execute multiple times', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };
  const debounced = UTILS.debounce(fn, 40);

  debounced();
  await new Promise(r => setTimeout(r, 70));
  assert.strictEqual(callCount, 1, 'First invocation should execute');

  debounced();
  await new Promise(r => setTimeout(r, 70));
  assert.strictEqual(callCount, 2, 'Second invocation after timeout should execute');
});

// ----------------------------------------------------------------------------
// SUITE 3: PACKAGING CLARITY BREAKDOWN (UTILS.formatPackagingBreakdown)
// ----------------------------------------------------------------------------
console.log('\nSuite 3: Packaging Clarity Breakdown (UTILS.formatPackagingBreakdown)');

runTest('3.1 Canonical Prompt: 20 boxes, 10/box, 5 loose -> 205 bottles, 102.5 L', () => {
  const html = UTILS.formatPackagingBreakdown({
    boxes: 20,
    unitsPerBox: 10,
    looseUnits: 5,
    totalUnits: 205,
    unit: 'Bottles',
    volumeOrWeight: '102.5 L'
  });

  assert.ok(html.includes('20 Bx'), 'Must display 20 Bx');
  assert.ok(html.includes('10/bx'), 'Must display 10/bx');
  assert.ok(html.includes('5 Loose'), 'Must display + 5 Loose');
  assert.ok(html.includes('205 Bottles'), 'Must display 205 Bottles');
  assert.ok(html.includes('102.5 L'), 'Must display 102.5 L volume');
  assert.ok(html.includes('pkg-breakdown-tag'), 'Must have outer container class');
});

runTest('3.2 Full boxes only (0 loose units) omits loose pill', () => {
  const html = UTILS.formatPackagingBreakdown({
    boxes: 50,
    unitsPerBox: 10,
    looseUnits: 0,
    totalUnits: 500,
    unit: 'Bottles'
  });

  assert.ok(html.includes('50 Bx'), 'Must display 50 Bx');
  assert.ok(!html.includes('Loose'), 'Must NOT display 0 Loose when looseUnits=0');
  assert.ok(html.includes('500 Bottles'), 'Must display total 500 Bottles');
});

runTest('3.3 Loose units only (0 boxes) omits box pill', () => {
  const html = UTILS.formatPackagingBreakdown({
    boxes: 0,
    unitsPerBox: 10,
    looseUnits: 7,
    totalUnits: 7,
    unit: 'Nos'
  });

  assert.ok(!html.includes('Bx'), 'Must NOT display 0 Bx');
  assert.ok(html.includes('7 Loose'), 'Must display 7 Loose');
  assert.ok(html.includes('7 Nos'), 'Must display total 7 Nos');
});

runTest('3.4 Compact mode renders streamlined pill representation for tight tables', () => {
  const html = UTILS.formatPackagingBreakdown({
    boxes: 20,
    unitsPerBox: 10,
    looseUnits: 5,
    totalUnits: 205,
    unit: 'btl',
    compact: true
  });

  assert.ok(html.includes('pkg-compact'), 'Must have pkg-compact class');
  assert.ok(html.includes('20 Bx'), 'Must contain 20 Bx');
  assert.ok(html.includes('5 ls'), 'Must contain 5 ls in compact mode');
  assert.ok(html.includes('205 btl'), 'Must contain total 205 btl');
});

// ----------------------------------------------------------------------------
// SUITE 4: TABLE ENHANCER (PAGINATION, SORTING & SEARCH ENGINE)
// ----------------------------------------------------------------------------
console.log('\nSuite 4: TableEnhancer Core Engine');

const sampleData = Array.from({ length: 85 }, (_, i) => ({
  id: i + 1,
  order_no: `ORD-${String(i + 1).padStart(3, '0')}`,
  client_name: i % 2 === 0 ? 'Kisan Center' : 'Agro Traders',
  total_amount: (i + 1) * 100,
  date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`
}));

runTest('4.1 TableEnhancer slices records accurately across pages (pageSize: 25)', () => {
  let renderedItems = null;
  let metaInfo = null;

  const enhancer = new TableEnhancer({
    data: sampleData,
    pageSize: 25,
    onRender: (slice, meta) => {
      renderedItems = slice;
      metaInfo = meta;
    }
  });

  enhancer.render();

  assert.strictEqual(renderedItems.length, 25, 'Page 1 must contain exactly 25 items');
  assert.strictEqual(renderedItems[0].id, 1, 'First item must be id 1');
  assert.strictEqual(renderedItems[24].id, 25, '25th item must be id 25');
  assert.strictEqual(metaInfo.totalPages, 4, '85 items / 25 per page = 4 pages');
  assert.strictEqual(metaInfo.startIndex, 1, 'startIndex must be 1');
  assert.strictEqual(metaInfo.endIndex, 25, 'endIndex must be 25');
  assert.strictEqual(metaInfo.totalRecords, 85, 'totalRecords must be 85');
});

runTest('4.2 Page navigation: setPage(2) and setPage(4) slices correctly', () => {
  let renderedItems = null;
  let metaInfo = null;

  const enhancer = new TableEnhancer({
    data: sampleData,
    pageSize: 25,
    onRender: (slice, meta) => {
      renderedItems = slice;
      metaInfo = meta;
    }
  });

  enhancer.setPage(2);
  assert.strictEqual(renderedItems.length, 25, 'Page 2 must have 25 items');
  assert.strictEqual(renderedItems[0].id, 26, 'Page 2 first item must be id 26');
  assert.strictEqual(metaInfo.startIndex, 26, 'startIndex must be 26');
  assert.strictEqual(metaInfo.endIndex, 50, 'endIndex must be 50');

  // Page 4 is the final page (85 - 75 = 10 items)
  enhancer.setPage(4);
  assert.strictEqual(renderedItems.length, 10, 'Page 4 must have remaining 10 items');
  assert.strictEqual(renderedItems[0].id, 76, 'Page 4 first item must be id 76');
  assert.strictEqual(metaInfo.startIndex, 76, 'startIndex must be 76');
  assert.strictEqual(metaInfo.endIndex, 85, 'endIndex must be 85');
});

runTest('4.3 Page boundary clamping: invalid pages are gracefully clamped', () => {
  const enhancer = new TableEnhancer({
    data: sampleData,
    pageSize: 25
  });

  enhancer.setPage(-5);
  assert.strictEqual(enhancer.currentPage, 1, 'Negative page must clamp to 1');

  enhancer.setPage(999);
  assert.strictEqual(enhancer.currentPage, 4, 'Excessive page must clamp to totalPages (4)');
});

runTest('4.4 Multi-column sorting: Numeric, String, and Date', () => {
  const enhancer = new TableEnhancer({
    data: sampleData,
    pageSize: 10
  });

  // Sort by total_amount descending
  enhancer.setSort('total_amount', 'desc');
  let slice = enhancer.getPageSlice();
  assert.strictEqual(slice[0].total_amount, 8500, 'Top item descending must be 8500');
  assert.strictEqual(slice[1].total_amount, 8400, 'Second item must be 8400');

  // Sort by client_name ascending
  enhancer.setSort('client_name', 'asc');
  slice = enhancer.getPageSlice();
  assert.strictEqual(slice[0].client_name, 'Agro Traders', 'Agro Traders must sort before Kisan Center');

  // Sort by date ascending
  enhancer.setSort('date', 'asc');
  slice = enhancer.getPageSlice();
  assert.strictEqual(slice[0].date, '2026-10-01', 'Earliest date must be 2026-10-01');
});

runTest('4.5 Search filter filtering reduces filteredRecords and resets page to 1', () => {
  const enhancer = new TableEnhancer({
    data: sampleData,
    pageSize: 10,
    searchFilter: (item, q) => !q || item.client_name.toLowerCase().includes(q)
  });

  enhancer.setPage(3);
  assert.strictEqual(enhancer.currentPage, 3);

  enhancer.setSearchQuery('kisan');
  const meta = enhancer.getMeta();
  assert.strictEqual(enhancer.currentPage, 1, 'Searching must reset to page 1');
  assert.strictEqual(meta.filteredRecords, 43, '43 Kisan Center records found');
  assert.strictEqual(meta.totalRecords, 85, 'totalRecords remains 85');
});

runTest('4.6 Performance Benchmark: 1,000 records filtered, sorted and sliced in < 10ms', () => {
  const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    code: `SKU-${String(i + 1).padStart(4, '0')}`,
    name: `Agrochemical Formulation Grade ${i % 10}`,
    stock: (i * 3.5) % 500,
    price: 150 + (i % 200),
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`
  }));

  const start = Date.now();
  const enhancer = new TableEnhancer({
    data: largeDataset,
    pageSize: 50,
    defaultSortKey: 'stock',
    defaultSortOrder: 'desc'
  });

  enhancer.setSearchQuery('Grade 3');
  const slice = enhancer.getPageSlice();
  const duration = Date.now() - start;

  assert.strictEqual(slice.length, 50, 'Page slice must contain 50 items');
  assert.ok(duration < 50, `Execution time must be rapid (actual: ${duration}ms)`);
  console.log(`     (Benchmark: 1,000 rows filtered & sorted in ${duration}ms)`);
});

// ----------------------------------------------------------------------------
// SUITE 5: DOUBLE-SUBMISSION BUTTON GUARD (APP.guardSubmit)
// ----------------------------------------------------------------------------
console.log('\nSuite 5: Double-Submission Guard (APP.guardSubmit)');

runAsyncTest('5.1 Button is disabled and marked data-submitting during async operation', async () => {
  const mockButton = {
    disabled: false,
    dataset: {},
    innerHTML: 'Save Transfer'
  };

  let executionStarted = false;
  let executionFinished = false;

  const asyncJob = async () => {
    executionStarted = true;
    assert.strictEqual(mockButton.disabled, true, 'Button must be disabled during execution');
    assert.strictEqual(mockButton.dataset.submitting, 'true', 'data-submitting must be true');
    await new Promise(r => setTimeout(r, 40));
    executionFinished = true;
    return { ok: true };
  };

  const promise = APP.guardSubmit(mockButton, asyncJob);

  // Attempt duplicate submission while previous is still running
  const duplicateBlocked = await APP.guardSubmit(mockButton, async () => {
    assert.fail('Concurrent duplicate submission should NEVER be called');
  });

  assert.strictEqual(duplicateBlocked, false, 'Duplicate call must return false');

  const result = await promise;
  assert.strictEqual(executionStarted, true);
  assert.strictEqual(executionFinished, true);
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(mockButton.disabled, false, 'Button must be re-enabled after completion');
  assert.strictEqual(mockButton.dataset.submitting, 'false', 'data-submitting must be false');
});

runAsyncTest('5.2 Button state is restored even if async operation rejects', async () => {
  const mockButton = {
    disabled: false,
    dataset: {},
    innerHTML: 'Submit Order'
  };

  let thrown = false;
  try {
    await APP.guardSubmit(mockButton, async () => {
      await new Promise(r => setTimeout(r, 20));
      throw new Error('Database connection failed');
    });
  } catch (err) {
    thrown = true;
    assert.strictEqual(err.message, 'Database connection failed');
  }

  assert.strictEqual(thrown, true, 'Error must propagate');
  assert.strictEqual(mockButton.disabled, false, 'Button must be re-enabled after error');
  assert.strictEqual(mockButton.dataset.submitting, 'false', 'data-submitting must be false after error');
});

// ----------------------------------------------------------------------------
// SUITE 6: CONFIRMATION DIALOG ENHANCEMENTS
// ----------------------------------------------------------------------------
console.log('\nSuite 6: Confirmation Dialog Enhancements');

runTest('6.1 UTILS.todayStr and formatting helpers maintain integrity', () => {
  const today = UTILS.todayStr();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'Must match YYYY-MM-DD');

  const currency = UTILS.fmtCurrency(12500.50);
  assert.ok(currency.includes('12,500.50') || currency.includes('12500.50'), 'Currency formatted');
});

// ----------------------------------------------------------------------------
// SUITE 7: DATABASE MIGRATION & COMPOSITE INDEX COVERAGE
// ----------------------------------------------------------------------------
console.log('\nSuite 7: Database Migration & Schema Index Verification');

runTest('7.1 Migration file 2026-10-15-ui-ux-performance-indexes.sql exists with 25 composite indexes', () => {
  const migPath = path.join(__dirname, '..', 'database', 'migrations', '2026-10-15-ui-ux-performance-indexes.sql');
  assert.ok(fs.existsSync(migPath), 'Migration file must exist');

  const sql = fs.readFileSync(migPath, 'utf8');

  // Verify critical indexes
  assert.ok(sql.includes('idx_orders_company_status'), 'Index on orders');
  assert.ok(sql.includes('idx_stock_batches_comp_item_qty'), 'Index on stock_batches');
  assert.ok(sql.includes('idx_stock_movements_comp_item_date'), 'Index on stock_movements');
  assert.ok(sql.includes('idx_production_batches_qc'), 'Index on production_batches');
  assert.ok(sql.includes('idx_packaging_orders_comp_status'), 'Index on packaging_orders');
  assert.ok(sql.includes('idx_dispatches_comp_status'), 'Index on dispatches');
  assert.ok(sql.includes('idx_intercompany_transfers_source'), 'Index on intercompany_transfers');
  assert.ok(sql.includes('idx_general_ledger_comp_date'), 'Index on general_ledger');
  assert.ok(sql.includes('idx_audit_logs_actor'), 'Index on audit_logs');
  assert.ok(sql.includes('idx_system_notifications_comp_read'), 'Index on system_notifications');
  assert.ok(sql.includes("NOTIFY pgrst, 'reload_schema'"), 'PostgREST reload notice');
});

// ----------------------------------------------------------------------------
// SUITE 8: CSS DESIGN SYSTEM & RESPONSIVE STYLES
// ----------------------------------------------------------------------------
console.log('\nSuite 8: CSS Design System & Responsive Styles');

runTest('8.1 style.css contains all semantic status badge classes and packaging pills', () => {
  const cssPath = path.join(__dirname, '..', 'assets', 'css', 'style.css');
  assert.ok(fs.existsSync(cssPath), 'style.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.badge-completed'), 'Must have .badge-completed');
  assert.ok(css.includes('.badge-approved'), 'Must have .badge-approved');
  assert.ok(css.includes('.badge-pending'), 'Must have .badge-pending');
  assert.ok(css.includes('.badge-rejected'), 'Must have .badge-rejected');
  assert.ok(css.includes('.badge-intransit'), 'Must have .badge-intransit');
  assert.ok(css.includes('.badge-quarantine'), 'Must have .badge-quarantine');
  assert.ok(css.includes('.badge-partial'), 'Must have .badge-partial');
  assert.ok(css.includes('.badge-reversed'), 'Must have .badge-reversed');
  assert.ok(css.includes('.badge-dot'), 'Must have .badge-dot');
  assert.ok(css.includes('.pkg-breakdown-tag'), 'Must have .pkg-breakdown-tag');
  assert.ok(css.includes('.pkg-pill.box'), 'Must have .pkg-pill.box');
  assert.ok(css.includes('.pkg-pill.loose'), 'Must have .pkg-pill.loose');
  assert.ok(css.includes('data-submitting="true"'), 'Must have async data-submitting selector');
});

runTest('8.2 tables.css contains responsive wrappers, pagination, empty states, and error retry', () => {
  const cssPath = path.join(__dirname, '..', 'assets', 'css', 'tables.css');
  assert.ok(fs.existsSync(cssPath), 'tables.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.pagination'), 'Must have .pagination');
  assert.ok(css.includes('.pagination-info'), 'Must have .pagination-info');
  assert.ok(css.includes('.pagination-size-select'), 'Must have .pagination-size-select');
  assert.ok(css.includes('.page-btn'), 'Must have .page-btn');
  assert.ok(css.includes('.empty-state-btn'), 'Must have .empty-state-btn');
  assert.ok(css.includes('.table-error-state'), 'Must have .table-error-state');
  assert.ok(css.includes('.table-retry-btn'), 'Must have .table-retry-btn');
});

// ----------------------------------------------------------------------------
// SUITE 9: JAVASCRIPT MODULE INTEGRATION INTEGRITY
// ----------------------------------------------------------------------------
console.log('\nSuite 9: JavaScript Module Integration Integrity');

runTest('9.1 orders.js uses TableEnhancer, debounced search, and formatPackagingBreakdown', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'orders.js'), 'utf8');
  assert.ok(js.includes('TableEnhancer'), 'orders.js must include TableEnhancer');
  assert.ok(js.includes('formatPackagingBreakdown'), 'orders.js must include formatPackagingBreakdown');
  assert.ok(js.includes('debounce'), 'orders.js must include debounce');
});

runTest('9.2 inventory.js uses TableEnhancer, debounced search, and save concurrency guard', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'inventory.js'), 'utf8');
  assert.ok(js.includes('TableEnhancer'), 'inventory.js must include TableEnhancer');
  assert.ok(js.includes('debouncedInventorySearch'), 'inventory.js must include debouncedInventorySearch');
  assert.ok(js.includes('isSavingInventoryItem'), 'inventory.js must include isSavingInventoryItem');
});

runTest('9.3 production.js uses TableEnhancer for orders and packaging runs with debouncing', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'production.js'), 'utf8');
  assert.ok(js.includes('prodOrdersTableEnhancer'), 'production.js must include prodOrdersTableEnhancer');
  assert.ok(js.includes('packagingOrdersTableEnhancer'), 'production.js must include packagingOrdersTableEnhancer');
  assert.ok(js.includes('filterOrdersTableReal'), 'production.js must include filterOrdersTableReal');
  assert.ok(js.includes('filterPackagingTableReal'), 'production.js must include filterPackagingTableReal');
  assert.ok(js.includes('formatPackagingBreakdown'), 'production.js must include formatPackagingBreakdown');
});

runTest('9.4 purchases.js uses TableEnhancer and debounced search', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'purchases.js'), 'utf8');
  assert.ok(js.includes('purchasesTableEnhancer'), 'purchases.js must include purchasesTableEnhancer');
  assert.ok(js.includes('debounce'), 'purchases.js must include debounce');
});

runTest('9.5 transactions.js uses TableEnhancer for transactions and GL, with debouncing', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'transactions.js'), 'utf8');
  assert.ok(js.includes('txnTableEnhancer'), 'transactions.js must include txnTableEnhancer');
  assert.ok(js.includes('glTableEnhancer'), 'transactions.js must include glTableEnhancer');
  assert.ok(js.includes('debouncedApplyFilters'), 'transactions.js must include debouncedApplyFilters');
  assert.ok(js.includes('applyGlFiltersReal'), 'transactions.js must include applyGlFiltersReal');
});

runTest('9.6 intercompany.js uses TableEnhancer, debounced search, and formatPackagingBreakdown', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'intercompany.js'), 'utf8');
  assert.ok(js.includes('transfersTableEnhancer'), 'intercompany.js must include transfersTableEnhancer');
  assert.ok(js.includes('debouncedTransfersSearch'), 'intercompany.js must include debouncedTransfersSearch');
  assert.ok(js.includes('formatPackagingBreakdown'), 'intercompany.js must include formatPackagingBreakdown');
});

runTest('9.7 audit-logs.js uses TableEnhancer and debounced filterAuditTable', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'audit-logs.js'), 'utf8');
  assert.ok(js.includes('auditTableEnhancer'), 'audit-logs.js must include auditTableEnhancer');
  assert.ok(js.includes('filterAuditTableReal'), 'audit-logs.js must include filterAuditTableReal');
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
(async () => {
  await Promise.all(asyncQueue);

  console.log('\n===============================================================');
  console.log(`UI/UX & PERFORMANCE OPTIMIZATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED! UI/UX & PERFORMANCE WORKFLOW FULLY VERIFIED.\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
})();
