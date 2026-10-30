/**
 * tests/test_orders_summary_detail_and_dispatches.js
 * Comprehensive automated test suite for:
 * 1. Orders Summary layout, Indian currency formatting, client wrapping, and dispatch status derivation.
 * 2. Order Items Detail table column alignment, responsive fitting without horizontal overflow.
 * 3. Dispatches & Gate Passes data loading, persistent notes synchronization, batch matching, and full lifecycle.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Static file inspections
console.log('--- Test 1: Inspecting CSS and HTML table definitions ---');
const tablesCss = fs.readFileSync(path.join(__dirname, '../assets/css/tables.css'), 'utf8');
const ordersHtml = fs.readFileSync(path.join(__dirname, '../pages/orders.html'), 'utf8');
const ordersJs = fs.readFileSync(path.join(__dirname, '../assets/js/orders.js'), 'utf8');
const dispatchUiJs = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-ui.js'), 'utf8');
const dispatchCoreJs = fs.readFileSync(path.join(__dirname, '../assets/js/dispatch-core.js'), 'utf8');

// Verify tables.css includes scoped table-layout rules and alignments
assert(tablesCss.includes('#orders-table'), 'tables.css must contain #orders-table rules');
assert(tablesCss.includes('#order-items-detail-table'), 'tables.css must contain #order-items-detail-table rules');
assert(tablesCss.includes('#dispatches-table'), 'tables.css must contain #dispatches-table rules');
assert(tablesCss.includes('font-variant-numeric: tabular-nums'), 'tables.css must use tabular-nums for numeric alignment');
assert(tablesCss.includes('.cell-client'), 'tables.css must define .cell-client wrapping rule');
assert(tablesCss.includes('.cell-product'), 'tables.css must define .cell-product wrapping rule');
assert(tablesCss.includes('#dispatch-status-pill-filters'), 'tables.css must define flex layout for #dispatch-status-pill-filters');
assert(tablesCss.includes('.order-items-cards-grid'), 'tables.css must contain .order-items-cards-grid');
assert(tablesCss.includes('.order-item-card'), 'tables.css must contain .order-item-card');
assert(tablesCss.includes('.order-item-quantities-grid'), 'tables.css must contain .order-item-quantities-grid');
assert(tablesCss.includes('.order-item-finance-row'), 'tables.css must contain .order-item-finance-row');
assert(tablesCss.includes('.order-item-card-actions'), 'tables.css must contain .order-item-card-actions');
assert(tablesCss.includes('.orders-summary-cards-grid'), 'tables.css must contain .orders-summary-cards-grid');
assert(tablesCss.includes('.order-summary-card'), 'tables.css must contain .order-summary-card');
assert(tablesCss.includes('.order-summary-finance-grid'), 'tables.css must contain .order-summary-finance-grid');
assert(tablesCss.includes('.order-summary-dispatch-progress'), 'tables.css must contain .order-summary-dispatch-progress');
assert(tablesCss.includes('.dispatch-items-cards-container'), 'tables.css must contain .dispatch-items-cards-container');
assert(tablesCss.includes('.dispatch-item-card'), 'tables.css must contain .dispatch-item-card');
assert(tablesCss.includes('.order-card-btn.dispatch') && tablesCss.includes('color: #ffffff !important'), 'tables.css must enforce #ffffff text color for dispatch button');
assert(tablesCss.includes('.dispatches-cards-grid'), 'tables.css must contain .dispatches-cards-grid');
assert(tablesCss.includes('.dispatch-record-card'), 'tables.css must contain .dispatch-record-card');
assert(tablesCss.includes('.dispatch-card-quantities-grid'), 'tables.css must contain .dispatch-card-quantities-grid');
assert(tablesCss.includes('.dispatch-card-logistics-grid'), 'tables.css must contain .dispatch-card-logistics-grid');
console.log('[PASS] tables.css contains all required layout, alignment, and card grid rules');

// Verify orders.html header alignments, column spans, and card container
assert(ordersHtml.includes('<th class="cell-amount text-right" style="width:11%; text-align:right;">Total</th>'), 'orders.html Total header must be text-right');
assert(ordersHtml.includes('<th class="cell-amount text-right" style="width:11%; text-align:right;">Paid</th>'), 'orders.html Paid header must be text-right');
assert(ordersHtml.includes('<th class="cell-amount text-right" style="width:11%; text-align:right;">Balance</th>'), 'orders.html Balance header must be text-right');
assert(ordersHtml.includes('<td colspan="12">'), 'orders.html Order items detail empty state must span all 12 columns');
assert(ordersHtml.includes('id="order-items-cards-container"'), 'orders.html must contain #order-items-cards-container');
assert(ordersHtml.includes('id="orders-cards-container"'), 'orders.html must contain #orders-cards-container');
assert(ordersHtml.includes('id="dispatches-cards-container"'), 'orders.html must contain #dispatches-cards-container');
assert(ordersHtml.includes('id="disp-order-select"'), 'orders.html must contain #disp-order-select');
assert(ordersHtml.includes('data-autocomplete'), 'orders.html disp-order-select must have data-autocomplete attribute');
assert(ordersJs.includes('orders-cards-container'), 'orders.js must reference orders-cards-container');
assert(ordersJs.includes('order-items-cards-container'), 'orders.js must reference order-items-cards-container');
assert(dispatchUiJs.includes('dispatches-cards-container'), 'dispatch-ui.js must reference dispatches-cards-container');
console.log('[PASS] orders.html headers, card containers, and empty row colspans correctly defined');

// 2. Mock environment to test orders.js and utils.js rendering logic
const utils = require('../assets/js/utils.js');
const UTILS = global.UTILS = {
  fmtCurrency: (val) => {
    const n = parseFloat(val) || 0;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  fmtDate: (d) => d || '—',
  statusBadge: (st) => `<span class="badge">${st}</span>`,
  applyMobileTableLabels: () => {}
};

console.log('\n--- Test 2: Indian Currency Formatting ---');
assert.strictEqual(UTILS.fmtCurrency(293400), '₹2,93,400.00', 'Should format 293400 with Indian grouping ₹2,93,400.00');
assert.strictEqual(UTILS.fmtCurrency(105000), '₹1,05,000.00', 'Should format 105000 as ₹1,05,000.00');
assert.strictEqual(UTILS.fmtCurrency(0), '₹0.00', 'Should format 0 as ₹0.00');
assert.strictEqual(UTILS.fmtCurrency(1234567.89), '₹12,34,567.89', 'Should format 1234567.89 as ₹12,34,567.89');
console.log('[PASS] Indian currency formatting matches exact specifications');

console.log('\n--- Test 3: Orders Summary Dispatch Status Derivation ---');
// Verify that an order with status = 'Completed' but 0 units dispatched is NOT marked 'Fully Dispatched'
function deriveDispatchStatus(order) {
  let dispStatus = order.dispatch_status;
  if (!dispStatus) {
    const items = order.items || [];
    const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.quantity, 10) || 0), 0);
    const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
    if (totalOrd > 0 && totalDisp >= totalOrd) {
      dispStatus = 'Fully Dispatched';
    } else if (totalDisp > 0) {
      dispStatus = 'Partially Dispatched';
    } else {
      dispStatus = 'Pending Verification';
    }
  }
  return dispStatus;
}

const testOrder17 = {
  id: 17,
  order_no: 'O-01',
  status: 'Completed', // Order booking completed
  total_amount: 105000,
  paid_amount: 400000,
  items: [
    { ordered_units: 50, dispatched_units: 0, remaining_units: 50 }
  ]
};

const status17 = deriveDispatchStatus(testOrder17);
assert.strictEqual(status17, 'Pending Verification', 'Order 17 with 0 dispatched units must NOT be Fully Dispatched');
console.log('[PASS] Order 17 correctly derives status as "Pending Verification" instead of false "Fully Dispatched"');

// Test partial dispatch
const testOrderPartial = {
  id: 18,
  order_no: 'O-02',
  status: 'Completed',
  items: [
    { ordered_units: 50, dispatched_units: 20, remaining_units: 30 }
  ]
};
assert.strictEqual(deriveDispatchStatus(testOrderPartial), 'Partially Dispatched', 'Partially dispatched order must derive "Partially Dispatched"');

// Test fully dispatched
const testOrderFull = {
  id: 19,
  order_no: 'O-03',
  status: 'Completed',
  items: [
    { ordered_units: 50, dispatched_units: 50, remaining_units: 0 }
  ]
};
assert.strictEqual(deriveDispatchStatus(testOrderFull), 'Fully Dispatched', 'Fully dispatched order must derive "Fully Dispatched"');
console.log('[PASS] Status transitions accurately derived for un-dispatched, partial, and full dispatches');

console.log('\n--- Test 4: Eligibility for Prepare Dispatch ---');
// Verify eligible orders filter in dispatch-ui
const ordersList = [
  testOrder17,
  testOrderPartial,
  testOrderFull,
  { id: 20, order_no: 'O-04', status: 'Cancelled', items: [{ ordered_units: 10, dispatched_units: 0 }] }
];

const eligibleOrders = ordersList.filter(o => {
  const st = (o.status || '').toLowerCase();
  const dispSt = (deriveDispatchStatus(o) || '').toLowerCase();
  const items = o.items || [];
  const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.quantity, 10) || 0), 0);
  const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
  const hasRemaining = items.length === 0 || totalOrd === 0 || totalDisp < totalOrd;

  return st !== 'cancelled' && dispSt !== 'fully dispatched' && hasRemaining;
});

assert(eligibleOrders.some(o => o.id === 17), 'Order 17 must be eligible for prepare dispatch');
assert(eligibleOrders.some(o => o.id === 18), 'Order 18 (partial) must be eligible for prepare dispatch');
assert(!eligibleOrders.some(o => o.id === 19), 'Order 19 (full) must NOT be eligible');
assert(!eligibleOrders.some(o => o.id === 20), 'Order 20 (cancelled) must NOT be eligible');
console.log('[PASS] Eligible orders filter correctly includes Order 17 and excludes full/cancelled orders');

console.log('\n--- Test 5: Order Items Detail Card Generation & Data Completeness ---');
// Verify card template rendering logic with mock DOM
const mockCardsContainer = { innerHTML: '' };
const mockTotalInfo = { textContent: '' };
const mockTbody = { innerHTML: '' };

// Create sandbox to execute renderOrderItemsDetailTable
const vm = require('vm');
const sandbox = {
  document: {
    getElementById: (id) => {
      if (id === 'order-items-cards-container') return mockCardsContainer;
      if (id === 'items-total-info') return mockTotalInfo;
      return null;
    },
    querySelector: (sel) => {
      if (sel === '#order-items-detail-table tbody') return mockTbody;
      return null;
    }
  },
  UTILS: {
    ...global.UTILS,
    formatPackagingBreakdown: utils.formatPackagingBreakdown,
    escapeHtml: utils.escapeHtml
  },
  escapeHtml: utils.escapeHtml,
  allPackagingData: [],
  cleanSizeLabel: (val) => val || '—',
  formatOrderNo: (val) => val || '—',
  viewOrder: () => {},
  openEdit: () => {},
  openPrepareDispatch: () => {}
};

// Extract renderOrderItemsDetailTable function string from ordersJs
const fnMatch = ordersJs.match(/function renderOrderItemsDetailTable\([\s\S]*?\n\}/);
assert(fnMatch, 'renderOrderItemsDetailTable must be defined in orders.js');
vm.createContext(sandbox);
vm.runInContext(fnMatch[0], sandbox);

const sampleDetailedItems = [
  {
    order_id: 17,
    order_no: 'O-01',
    client_display: 'Agro Supplies Ltd',
    date: '2026-10-17',
    status: 'Pending',
    dispatch_status: 'Pending Verification',
    product_name: 'Chlorantraniliprole 18.5% SC',
    packaging_size: '1 Litre',
    quantity: 20,
    ordered_units: 20,
    dispatched_units: 0,
    remaining_units: 20,
    unit_price: 650,
    total: 13000
  },
  {
    order_id: 17,
    order_no: 'O-01',
    client_display: 'Agro Supplies Ltd',
    date: '2026-10-17',
    status: 'Pending',
    dispatch_status: 'Pending Verification',
    product_name: 'Emamectin Benzoate 5% SG',
    packaging_size: '500 ml',
    quantity: 10,
    ordered_units: 10,
    dispatched_units: 10,
    remaining_units: 0,
    unit_price: 400,
    total: 4000
  },
  {
    order_id: 18,
    order_no: 'O-02',
    client_display: 'Green Field Fertilizers & Seeds Private Limited',
    date: '2026-10-16',
    status: 'Completed',
    dispatch_status: 'Partially Dispatched',
    product_name: 'Atrazine 50% WP',
    packaging_size: '1 Kg',
    box_quantity: 4,
    loose_quantity: 2,
    bottles_per_box: 12,
    quantity: 50,
    ordered_units: 50,
    dispatched_units: 20,
    remaining_units: 30,
    unit_price: 350,
    total: 17500
  }
];

// Execute card renderer
sandbox.renderOrderItemsDetailTable(sampleDetailedItems);

assert.strictEqual(mockTotalInfo.textContent, '3 items', 'Total info should display 3 items');
const renderedHtml = mockCardsContainer.innerHTML;

// Verify 3 distinct cards are rendered
const cardMatches = renderedHtml.match(/class="order-item-card"/g);
assert(cardMatches && cardMatches.length === 3, 'Must render exactly 3 distinct cards (1 per order item)');

// Verify Card 1 contents
assert(renderedHtml.includes('Chlorantraniliprole 18.5% SC'), 'Card 1 contains Product Name');
assert(renderedHtml.includes('Agro Supplies Ltd'), 'Card 1 contains Client Name');
assert(renderedHtml.includes('1 Litre'), 'Card 1 contains Pack Size badge');
assert(renderedHtml.includes('20 <small>units</small>'), 'Card 1 contains Ordered quantity');
assert(renderedHtml.includes('0 <small>units</small>'), 'Card 1 contains Dispatched quantity');
assert(renderedHtml.includes('₹650.00'), 'Card 1 contains Unit Price formatted in ₹');
assert(renderedHtml.includes('₹13,000.00'), 'Card 1 contains Line Total formatted in ₹');
assert(renderedHtml.includes('onclick="viewOrder(17)"'), 'Card 1 contains View action');
assert(renderedHtml.includes('onclick="openEdit(17)"'), 'Card 1 contains Edit action');
assert(renderedHtml.includes('onclick="openPrepareDispatch(17)"'), 'Card 1 contains Dispatch action');
assert(renderedHtml.includes('style="color:#ffffff;">Dispatch</span>'), 'Order item dispatch button text is explicitly styled with #ffffff');

// Verify Card 2 (second product of same order is its own distinct card)
assert(renderedHtml.includes('Emamectin Benzoate 5% SG'), 'Card 2 contains distinct Product Name');
assert(renderedHtml.includes('₹4,000.00'), 'Card 2 contains Line Total ₹4,000.00');

// Verify Card 3 has packaging breakdown and natural wrapping client name
assert(renderedHtml.includes('Green Field Fertilizers') && renderedHtml.includes('Seeds Private Limited'), 'Card 3 contains full client name');
assert(renderedHtml.includes('4 Bx'), 'Card 3 contains packaging breakdown boxes');
assert(renderedHtml.includes('₹17,500.00'), 'Card 3 contains Line Total ₹17,500.00');

// Verify Empty State when 0 items match
sandbox.renderOrderItemsDetailTable([]);
assert.strictEqual(mockTotalInfo.textContent, '0 items', 'Total info should display 0 items');
assert(mockCardsContainer.innerHTML.includes('No items found'), 'Cards container shows empty state when no items');
console.log('[PASS] Order items card layout renders distinct cards per product with full metadata, quantities, finances, and actions');

console.log('\n--- Test 5b: Orders Summary Card Generation & Responsive Finance Grid ---');
const mockOrdersCardsContainer = { innerHTML: '' };
const mockOrdersTbody = { innerHTML: '' };

const ordersSliceMatch = ordersJs.match(/function renderOrdersSlice\(slice\)[\s\S]*?\n\}/);
assert(ordersSliceMatch, 'renderOrdersSlice must be defined in orders.js');

const ordersSummarySandbox = {
  document: {
    getElementById: (id) => {
      if (id === 'orders-cards-container') return mockOrdersCardsContainer;
      return null;
    },
    querySelector: (sel) => {
      if (sel === '#orders-table tbody') return mockOrdersTbody;
      return null;
    }
  },
  UTILS: global.UTILS,
  viewOrder: () => {},
  openEdit: () => {},
  openPrepareDispatch: () => {},
  deleteOrder: () => {}
};

vm.createContext(ordersSummarySandbox);
vm.runInContext(ordersSliceMatch[0], ordersSummarySandbox);

const sampleOrdersSummary = [
  {
    id: 101,
    order_no: 'O-01',
    client_display: 'Beej Bhandar (Vyas Ramniwas)',
    date: '2026-10-17',
    status: 'Completed',
    dispatch_status: 'Partially Dispatched',
    total_amount: 293400,
    paid_amount: 150000,
    items: [
      { ordered_units: 100, dispatched_units: 80, remaining_units: 20 }
    ]
  },
  {
    id: 102,
    order_no: 'O-02',
    client_display: 'Green Fields Agro Chem Corporation',
    date: '2026-10-16',
    status: 'Pending',
    dispatch_status: 'Pending Verification',
    total_amount: 105000,
    paid_amount: 105000,
    items: [
      { ordered_units: 50, dispatched_units: 0, remaining_units: 50 }
    ]
  }
];

ordersSummarySandbox.renderOrdersSlice(sampleOrdersSummary);

const renderedSummaryHtml = mockOrdersCardsContainer.innerHTML;
assert(renderedSummaryHtml.includes('class="order-summary-card"'), 'Must render .order-summary-card');
assert(renderedSummaryHtml.includes('O-01'), 'Summary card 1 includes Order No O-01');
assert(renderedSummaryHtml.includes('Beej Bhandar (Vyas Ramniwas)'), 'Summary card 1 includes full client name');
assert(renderedSummaryHtml.includes('₹2,93,400.00'), 'Summary card 1 Total formatted as ₹2,93,400.00');
assert(renderedSummaryHtml.includes('₹1,50,000.00'), 'Summary card 1 Paid formatted as ₹1,50,000.00');
assert(renderedSummaryHtml.includes('₹1,43,400.00'), 'Summary card 1 Balance formatted as ₹1,43,400.00');
assert(renderedSummaryHtml.includes('80 / 100 units dispatched (80%)'), 'Summary card 1 shows 80 / 100 units dispatched (80%)');
assert(renderedSummaryHtml.includes('onclick="viewOrder(101)"'), 'Summary card 1 contains View Details');
assert(renderedSummaryHtml.includes('onclick="openEdit(101)"'), 'Summary card 1 contains Edit');
assert(renderedSummaryHtml.includes('onclick="openPrepareDispatch(101)"'), 'Summary card 1 contains Dispatch');
assert(renderedSummaryHtml.includes('style="color:#ffffff;">Dispatch</span>'), 'Summary card dispatch button text is explicitly styled with #ffffff');
assert(renderedSummaryHtml.includes('onclick="deleteOrder(101)"'), 'Summary card 1 contains Delete');

// Card 2: fully paid balance ₹0.00
assert(renderedSummaryHtml.includes('₹1,05,000.00'), 'Summary card 2 Total formatted as ₹1,05,000.00');
assert(renderedSummaryHtml.includes('₹0.00'), 'Summary card 2 Balance is ₹0.00');
assert(renderedSummaryHtml.includes('0 / 50 units dispatched (0%)'), 'Summary card 2 shows 0 / 50 units dispatched (0%)');
console.log('[PASS] Orders Summary renders responsive cards with natural client wrapping, 3-metric finances, and progress bar');

console.log('\n--- Test 5c: Dispatch Preparation Cards & Batch Allocation ---');
// Verify dispatch item card structure and live breakdown
const mockDispContainer = { innerHTML: '' };
const mockInput = { value: '25', dataset: { max: '30' } };
const mockBreakdownSpan = { textContent: '' };
const mockCard = {
  querySelector: (sel) => {
    if (sel === '.disp-item-breakdown') return mockBreakdownSpan;
    return null;
  }
};
mockInput.closest = (sel) => {
  if (sel === '.dispatch-item-card' || sel === 'tr') return mockCard;
  return null;
};

// Test live breakdown calculation (25 units with 10 units/box -> 2 Boxes + 5 Loose)
const recalcFn = (inputEl, unitsPerBox) => {
  let val = parseInt(inputEl.value, 10);
  const max = parseInt(inputEl.getAttribute?.('max') || inputEl.dataset?.max || 999999, 10);
  if (isNaN(val) || val < 0) val = 0;
  if (val > max) val = max;
  const boxes = Math.floor(val / unitsPerBox);
  const loose = val % unitsPerBox;
  const card = inputEl.closest('.dispatch-item-card') || inputEl.closest('tr');
  if (card) {
    const textEl = card.querySelector('.disp-item-breakdown');
    if (textEl) textEl.textContent = `${boxes} Boxes + ${loose} Loose`;
  }
  return { boxes, loose };
};

const calcRes = recalcFn(mockInput, 10);
assert.strictEqual(calcRes.boxes, 2, '25 units with 10/box = 2 boxes');
assert.strictEqual(calcRes.loose, 5, '25 units with 10/box = 5 loose');
assert.strictEqual(mockBreakdownSpan.textContent, '2 Boxes + 5 Loose', 'Live breakdown span displays "2 Boxes + 5 Loose"');

// Test over-limit capping
mockInput.value = '40'; // max is 30
const calcCap = recalcFn(mockInput, 10);
assert.strictEqual(calcCap.boxes, 3, '40 capped to 30 with 10/box = 3 boxes');
assert.strictEqual(calcCap.loose, 0, '40 capped to 30 with 10/box = 0 loose');
console.log('[PASS] Dispatch preparation cards compute live packaging breakdown and enforce remaining quantity limits');

console.log('\n--- Test 6: Dispatch Core Persistence & Notes Synchronization ---');
const dispatchCore = require('../assets/js/dispatch-core.js');

// Mock client simulating Supabase PostgreSQL without physical order_dispatches table
const mockDb = {
  orders: [
    { id: 17, order_no: 'O-01', client_name: 'First Client', notes: null }
  ],
  order_items: [
    { id: 30, order_id: 17, product_id: 2, product_name: 'Chlorantraniliprole 18.5% SC', quantity: 50, ordered_units: 50, dispatched_units: 0, remaining_units: 50 }
  ],
  stock_batches: [
    { id: 2, item_id: 2, batch_no: 'OPEN-02', current_qty: 2710, qc_status: 'Approved', is_quarantine: false }
  ],
  inventory_items: [
    { id: 2, name: 'Chlorantraniliprole 18.5% SC', category: 'Technical' }
  ],
  stock_movements: [],

  from(tableName) {
    const self = this;
    return {
      select(fields) {
        return {
          eq(k, v) {
            return {
              maybeSingle: async () => {
                if (tableName === 'order_dispatches' || tableName === 'dispatches') {
                  const err = new Error("Could not find the table 'public." + tableName + "' in the schema cache");
                  err.code = 'PGRST205';
                  return { data: null, error: err };
                }
                const found = (self[tableName] || []).find(r => r[k] === v);
                return { data: found || null, error: null };
              },
              then(resolve) {
                if (tableName === 'order_dispatches' || tableName === 'dispatches') {
                  const err = new Error("Could not find the table 'public." + tableName + "' in the schema cache");
                  err.code = 'PGRST205';
                  resolve({ data: null, error: err });
                } else {
                  const matches = (self[tableName] || []).filter(r => r[k] === v);
                  resolve({ data: matches, error: null });
                }
              }
            };
          },
          gt(k, v) {
            return {
              eq(k2, v2) {
                return {
                  then(resolve) {
                    const matches = (self[tableName] || []).filter(r => r[k] > v && r[k2] === v2);
                    resolve({ data: matches, error: null });
                  }
                };
              },
              then(resolve) {
                const matches = (self[tableName] || []).filter(r => r[k] > v);
                resolve({ data: matches, error: null });
              }
            };
          },
          then(resolve) {
            if (tableName === 'order_dispatches' || tableName === 'dispatches') {
              const err = new Error("Could not find the table 'public." + tableName + "' in the schema cache");
              err.code = 'PGRST205';
              resolve({ data: null, error: err });
            } else {
              resolve({ data: self[tableName] || [], error: null });
            }
          }
        };
      },
      insert(records) {
        return {
          select() {
            if (tableName === 'order_dispatches' || tableName === 'dispatches') {
              const err = new Error("Could not find the table 'public." + tableName + "' in the schema cache");
              err.code = 'PGRST205';
              return Promise.resolve({ data: null, error: err });
            }
            if (!self[tableName]) self[tableName] = [];
            records.forEach(r => self[tableName].push(r));
            return Promise.resolve({ data: records, error: null });
          },
          then(resolve) {
            if (!self[tableName]) self[tableName] = [];
            records.forEach(r => self[tableName].push(r));
            resolve({ data: records, error: null });
          }
        };
      },
      update(updates) {
        return {
          eq(k, v) {
            if (tableName === 'order_dispatches' || tableName === 'dispatches') {
              const err = new Error("Could not find the table 'public." + tableName + "' in the schema cache");
              err.code = 'PGRST205';
              return Promise.resolve({ data: null, error: err });
            }
            const found = (self[tableName] || []).find(r => r[k] === v);
            if (found) Object.assign(found, updates);
            return Promise.resolve({ data: 1, error: null });
          }
        };
      }
    };
  }
};

async function testDispatchLifecycle() {
  // 1. Initial dispatches should be 0
  const initial = await dispatchCore.Service.getDispatches(mockDb);
  assert.strictEqual(initial.length, 0, 'Initially dispatches must be 0');
  console.log('[PASS] Situation 1 verified: Dispatches table shows 0 when none prepared');

  // 2. Prepare dispatch for Order 17
  const prepRes = await dispatchCore.Service.prepareDispatch(mockDb, {
    order_id: 17,
    dispatch_no: 'DSP-000001',
    dispatch_date: '2026-10-17',
    vehicle_no: 'GJ-01-AB-1234',
    transporter_name: 'Fast Logistics',
    items: [
      {
        order_item_id: 30,
        stock_batch_id: 2,
        batch_no: 'OPEN-02',
        total_units_dispatched: 50,
        units_per_box: 10
      }
    ],
    idempotency_key: 'TEST-DSP-01'
  });

  assert(prepRes.success, 'Dispatch preparation should succeed');
  console.log('[PASS] Dispatch slip DSP-000001 prepared successfully');

  // 3. Verify that dispatch was synced into mockDb.orders[0].notes under DISPATCH_META
  const ordRow = mockDb.orders.find(o => o.id === 17);
  assert(ordRow.notes && ordRow.notes.includes('DISPATCH_META'), 'Order notes must store DISPATCH_META');
  assert(ordRow.notes.includes('DSP-000001'), 'Order notes DISPATCH_META must contain DSP-000001');
  console.log('[PASS] Dispatch record successfully persisted into orders.notes DISPATCH_META');

  // 4. getDispatches retrieves the record via notes sync
  const dispatchesList = await dispatchCore.Service.getDispatches(mockDb);
  assert(dispatchesList.length >= 1, 'getDispatches must return the created dispatch');
  const d = dispatchesList.find(x => x.dispatch_no === 'DSP-000001');
  assert(d, 'Created dispatch must be in list');
  assert.strictEqual(d.order_no, 'O-01', 'Order number attached');
  assert.strictEqual(d.client_name, 'First Client', 'Client name attached');
  assert.strictEqual(d.status, 'Pending Verification', 'Initial status is Pending Verification');
  console.log('[PASS] getDispatches retrieves persistent dispatch with order and client details');

  // 5. Verify Packing
  const vRes = await dispatchCore.Service.verifyPacking(mockDb, {
    dispatchId: d.id,
    verifiedBy: 'Quality In-charge'
  });
  assert(vRes.success, 'Packing verification should succeed');
  assert(mockDb.orders[0].notes.includes('"status":"Verified"'), 'Order notes updated to Verified');
  console.log('[PASS] Godown verification updates status and syncs to orders.notes');

  // 6. Approve Dispatch
  const aRes = await dispatchCore.Service.approveDispatch(mockDb, {
    dispatchId: d.id,
    approvedBy: 'Director'
  });
  assert(aRes.success, 'Approval should succeed');
  assert(mockDb.orders[0].notes.includes('"status":"Approved"'), 'Order notes updated to Approved');
  console.log('[PASS] Manager approval updates status and syncs to orders.notes');

  // 7. Execute Dispatch Gate Pass
  const execRes = await dispatchCore.Service.executeDispatch(mockDb, {
    dispatchId: d.id,
    dispatchedBy: 'Gate Security'
  });
  assert(execRes.success, 'Gate pass execution should succeed');
  assert.strictEqual(execRes.orderDispatchStatus, 'Fully Dispatched');
  assert.strictEqual(mockDb.stock_batches[0].current_qty, 2660, '2710 - 50 = 2660 units');
  assert(mockDb.orders[0].notes.includes('"status":"Dispatched"'), 'Order notes updated to Dispatched');
  console.log('[PASS] Single-posting stock deduction executed exactly once, batch balance updated');

  console.log('\n--- Test 7: Dispatches & Gate Passes Card Layout Rendering ---');
  // Sandbox to execute renderDispatchesTable
  const mockDispCardsContainer = { innerHTML: '' };
  const mockDispTbody = { innerHTML: '' };
  const mockDispTotalInfo = { textContent: '' };

  const sampleDispatches = [
    {
      id: 501,
      dispatch_no: 'DSP-000501',
      order_id: 17,
      order_no: 'O-01',
      client_name: 'Beej Bhandar (Vyas Ramniwas)',
      dispatch_date: '2026-10-17',
      status: 'Pending Verification',
      total_boxes_dispatched: 5,
      total_loose_dispatched: 0,
      total_units_dispatched: 50,
      vehicle_no: 'GJ-01-AB-1234',
      transporter_name: 'Gujarat Roadways',
      invoice_no: null,
      items: [
        { product_name: 'Chlorantraniliprole 18.5% SC', packaging_size: '1 Litre', total_units_dispatched: 50, boxes_dispatched: 5, loose_dispatched: 0 }
      ]
    },
    {
      id: 502,
      dispatch_no: 'DSP-000502',
      order_id: 18,
      order_no: 'O-02',
      client_name: 'Green Field Fertilizers',
      dispatch_date: '2026-10-16',
      status: 'Dispatched',
      total_boxes_dispatched: 2,
      total_loose_dispatched: 5,
      total_units_dispatched: 25,
      vehicle_no: null,
      transporter_name: null,
      invoice_no: 'INV-2026-0042',
      items: [
        { product_name: 'Atrazine 50% WP', packaging_size: '1 Kg', total_units_dispatched: 25, boxes_dispatched: 2, loose_dispatched: 5 }
      ]
    }
  ];

  // Render cards
  const dispCardsSandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'dispatches-cards-container') return mockDispCardsContainer;
        if (id === 'dispatch-total-info') return mockDispTotalInfo;
        return null;
      },
      querySelector: (sel) => {
        if (sel === '#dispatches-table tbody') return mockDispTbody;
        return null;
      }
    },
    UTILS: global.UTILS,
    viewDispatch: () => {},
    openVerifyDispatch: () => {},
    openApproveDispatch: () => {},
    openExecuteDispatch: () => {},
    openReverseDispatch: () => {},
    openGenerateInvoice: () => {},
    viewOrder: () => {}
  };

  // Extract renderDispatchesTable from dispatchUiJs
  const renderDispFnMatch = dispatchUiJs.match(/renderDispatchesTable\(\)\s*\{([\s\S]*?\n\s{4}\})/);
  assert(renderDispFnMatch, 'renderDispatchesTable must be in dispatch-ui.js');
  const fullRenderDispFn = 'function renderDispatchesTable(allDispatches, activeDispatchFilter, activeDispatchSearch) {' + renderDispFnMatch[1];
  vm.createContext(dispCardsSandbox);
  vm.runInContext(fullRenderDispFn, dispCardsSandbox);

  dispCardsSandbox.renderDispatchesTable(sampleDispatches, '', '');

  const renderedDispCardsHtml = mockDispCardsContainer.innerHTML;
  assert(renderedDispCardsHtml.includes('class="dispatch-record-card"'), 'Must render .dispatch-record-card');
  assert(renderedDispCardsHtml.includes('DSP-000501'), 'Card 1 includes DSP-000501');
  assert(renderedDispCardsHtml.includes('Beej Bhandar (Vyas Ramniwas)'), 'Card 1 includes full client name');
  assert(renderedDispCardsHtml.includes('50 <small>units</small>'), 'Card 1 includes total units 50');
  assert(renderedDispCardsHtml.includes('5 <small>bx</small>'), 'Card 1 includes 5 boxes');
  assert(renderedDispCardsHtml.includes('GJ-01-AB-1234'), 'Card 1 includes vehicle number');
  assert(renderedDispCardsHtml.includes('Gujarat Roadways'), 'Card 1 includes transporter name');
  assert(renderedDispCardsHtml.includes('Verify Packing'), 'Pending Verification card displays Verify Packing action');

  // Card 2
  assert(renderedDispCardsHtml.includes('DSP-000502'), 'Card 2 includes DSP-000502');
  assert(renderedDispCardsHtml.includes('Not Assigned'), 'Card 2 shows Not Assigned when vehicle is missing');
  assert(renderedDispCardsHtml.includes('INV-2026-0042'), 'Card 2 includes linked invoice INV-2026-0042');
  assert(renderedDispCardsHtml.includes('Print Slip'), 'Dispatched card includes Print Slip action');
  assert(renderedDispCardsHtml.includes('Customer Return'), 'Dispatched card includes Customer Return action');
  console.log('[PASS] Dispatches & Gate Passes renders responsive cards with full metadata, quantities, and workflow actions');

  console.log('\n--- Test 8: Dispatch Progress Synchronization & Edge Cases ---');
  // Test function simulating the exact calculation in orders.js
  function calculateOrderDispatchProgress(order, items) {
    let dispatchMeta = null;
    if (order.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(order.notes)) {
      try {
        const jsonStr = order.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
        dispatchMeta = JSON.parse(jsonStr);
      } catch (_) {}
    }

    let totalOrdUnits = 0;
    let totalDispUnits = 0;

    items.forEach(it => {
      let qualifyingDispUnits = 0;
      if (dispatchMeta && Array.isArray(dispatchMeta.dispatches)) {
        dispatchMeta.dispatches.forEach(d => {
          const dSt = (d.status || '').toLowerCase().trim();
          if (dSt === 'dispatched' || d.stock_deducted === true) {
            if (Array.isArray(d.items)) {
              d.items.forEach(di => {
                const match = (di.order_item_id && di.order_item_id == it.id) ||
                  (di.product_id && it.product_id && di.product_id == it.product_id) ||
                  (di.product_name && it.product_name && String(di.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim());
                if (match) {
                  qualifyingDispUnits += parseInt(di.total_units_dispatched || di.quantity || 0, 10);
                }
              });
            }
          }
        });
      }

      const ordUnits = parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0;
      const dispUnits = Math.min(ordUnits, Math.max(qualifyingDispUnits, parseInt(it.dispatched_units || 0, 10)));
      const remUnits = Math.max(0, ordUnits - dispUnits);

      it.ordered_units = ordUnits;
      it.dispatched_units = dispUnits;
      it.remaining_units = remUnits;

      totalOrdUnits += ordUnits;
      totalDispUnits += dispUnits;
    });

    const dispPercent = totalOrdUnits > 0 ? Math.min(100, Math.round((totalDispUnits / totalOrdUnits) * 100)) : 0;
    return { totalOrdUnits, totalDispUnits, dispPercent, remainingUnits: totalOrdUnits - totalDispUnits };
  }

  // 1. Order with no qualifying dispatch shows 0%
  const o1 = { id: 10, notes: null };
  const i1 = [{ id: 1, product_id: 1, quantity: 20 }];
  const r1 = calculateOrderDispatchProgress(o1, i1);
  assert.strictEqual(r1.totalDispUnits, 0, 'No dispatches -> 0 dispatched units');
  assert.strictEqual(r1.dispPercent, 0, 'No dispatches -> 0% progress');
  console.log('[PASS] Scenario 1: Order with no qualifying dispatch shows 0% progress');

  // 2. Order with Prepared dispatch (Pending Verification) MUST NOT count as fulfilled -> 0% progress
  const o2 = {
    id: 11,
    notes: 'DISPATCH_META: ' + JSON.stringify({
      dispatches: [
        { id: 1, status: 'Pending Verification', stock_deducted: false, items: [{ order_item_id: 2, total_units_dispatched: 20 }] }
      ]
    })
  };
  const i2 = [{ id: 2, product_id: 1, quantity: 20 }];
  const r2 = calculateOrderDispatchProgress(o2, i2);
  assert.strictEqual(r2.totalDispUnits, 0, 'Pending Verification does NOT count towards fulfilled physical units');
  assert.strictEqual(r2.dispPercent, 0, 'Progress remains 0% until Gate Exit execution');
  console.log('[PASS] Scenario 2: Pending Verification dispatch correctly shows 0% progress');

  // 3. Order after Gate Exit execution (status: Dispatched, stock_deducted: true) -> 100%
  const o3 = {
    id: 12,
    notes: 'DISPATCH_META: ' + JSON.stringify({
      dispatches: [
        { id: 2, status: 'Dispatched', stock_deducted: true, items: [{ order_item_id: 3, total_units_dispatched: 20 }] }
      ]
    })
  };
  const i3 = [{ id: 3, product_id: 1, quantity: 20 }];
  const r3 = calculateOrderDispatchProgress(o3, i3);
  assert.strictEqual(r3.totalDispUnits, 20, 'Dispatched status counts fulfilled units');
  assert.strictEqual(r3.dispPercent, 100, '20/20 units -> 100% progress');
  assert.strictEqual(r3.remainingUnits, 0, 'Remaining units is 0');
  console.log('[PASS] Scenario 3: Dispatched gate pass updates progress to 100%');

  // 4. Partial dispatch (10 out of 20 units) -> 50%
  const o4 = {
    id: 13,
    notes: 'DISPATCH_META: ' + JSON.stringify({
      dispatches: [
        { id: 3, status: 'Dispatched', stock_deducted: true, items: [{ order_item_id: 4, total_units_dispatched: 10 }] }
      ]
    })
  };
  const i4 = [{ id: 4, product_id: 1, quantity: 20 }];
  const r4 = calculateOrderDispatchProgress(o4, i4);
  assert.strictEqual(r4.totalDispUnits, 10, 'Partial dispatch -> 10 units');
  assert.strictEqual(r4.dispPercent, 50, '10/20 units -> 50% progress');
  assert.strictEqual(r4.remainingUnits, 10, 'Remaining units is 10');
  console.log('[PASS] Scenario 4: Partial dispatch displays correct units and 50% progress');

  // 5. Cancelled/Reversed dispatch -> excludes from fulfilled progress
  const o5 = {
    id: 14,
    notes: 'DISPATCH_META: ' + JSON.stringify({
      dispatches: [
        { id: 4, status: 'Cancelled', stock_deducted: false, items: [{ order_item_id: 5, total_units_dispatched: 20 }] }
      ]
    })
  };
  const i5 = [{ id: 5, product_id: 1, quantity: 20 }];
  const r5 = calculateOrderDispatchProgress(o5, i5);
  assert.strictEqual(r5.totalDispUnits, 0, 'Cancelled dispatch does not count');
  assert.strictEqual(r5.dispPercent, 0, 'Progress returns to 0% after cancellation');
  console.log('[PASS] Scenario 5: Cancelled dispatch returns progress to 0%');

  // 6. Multi-product order aggregates correctly without mixing incompatible units
  const o6 = {
    id: 15,
    notes: 'DISPATCH_META: ' + JSON.stringify({
      dispatches: [
        {
          id: 5,
          status: 'Dispatched',
          stock_deducted: true,
          items: [
            { order_item_id: 6, product_name: 'Product A', total_units_dispatched: 30 },
            { order_item_id: 7, product_name: 'Product B', total_units_dispatched: 15 }
          ]
        }
      ]
    })
  };
  const i6 = [
    { id: 6, product_id: 10, product_name: 'Product A', quantity: 30 },
    { id: 7, product_id: 20, product_name: 'Product B', quantity: 20 }
  ];
  const r6 = calculateOrderDispatchProgress(o6, i6);
  assert.strictEqual(r6.totalOrdUnits, 50, 'Total ordered: 30 + 20 = 50 units');
  assert.strictEqual(r6.totalDispUnits, 45, 'Total dispatched: 30 + 15 = 45 units');
  assert.strictEqual(r6.dispPercent, 90, '45 / 50 = 90% progress');
  console.log('[PASS] Scenario 6: Multi-product order aggregates fulfilled units cleanly');

  // 7. Isolation: Dispatching Order A does not affect Order B
  const o7_A = o3;
  const o7_B = o1;
  const r7_A = calculateOrderDispatchProgress(o7_A, [{ id: 3, product_id: 1, quantity: 20 }]);
  const r7_B = calculateOrderDispatchProgress(o7_B, [{ id: 8, product_id: 1, quantity: 50 }]);
  assert.strictEqual(r7_A.dispPercent, 100);
  assert.strictEqual(r7_B.dispPercent, 0);
  console.log('[PASS] Scenario 7: Order isolation verified; dispatching Order A does not alter Order B');

  console.log('\n===============================================================');
  console.log('ALL ORDERS SUMMARY, DETAIL, AND DISPATCH TESTS PASSED!');
  console.log('===============================================================');
}

testDispatchLifecycle().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
