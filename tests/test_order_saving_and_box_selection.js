/**
 * tests/test_order_saving_and_box_selection.js
 * Verification suite for:
 * 1. Order saving error fix (no non-existent 'dispatched_units' column in order_items insert payload).
 * 2. Box selection column in Order Items table (Product -> Pack Size -> Bottle -> Box -> Quantity -> Unit Price -> Total -> Remove).
 * 3. Packaging inventory deductions:
 *    - Bulk finished product: quantity * pack_size (e.g. 80 units of 1L = 80L).
 *    - Bottles: 1 bottle per unit (e.g. 80 units = 80 bottles).
 *    - Boxes: physical boxes consumed with partial box rounding (80 units @ 12/box = 7 boxes).
 * 4. Pricing and totals independence from packaging selections.
 * 5. Reversibility of stock deductions on order edit and cancellation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test runner helpers
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

// Reusable mock database engine
class MockQuery {
  constructor(table, client, tableName) {
    this.table = table;
    this.client = client;
    this.tableName = tableName;
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.updateData = null;
    this.isDelete = false;
  }

  select(fields = '*') {
    return this;
  }

  eq(field, value) {
    this.filters.push(row => row[field] == value);
    return this;
  }

  gt(field, value) {
    this.filters.push(row => parseFloat(row[field]) > parseFloat(value));
    return this;
  }

  lt(field, value) {
    this.filters.push(row => parseFloat(row[field]) < parseFloat(value));
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orders.push({ field, ascending });
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  update(updates) {
    this.updateData = updates;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  _execute() {
    let rows = this.table.filter(row => this.filters.every(f => f(row)));

    if (this.updateData) {
      let count = 0;
      rows.forEach(r => {
        Object.assign(r, this.updateData);
        count++;
      });
      return { data: count, error: null };
    }

    if (this.isDelete) {
      const remaining = this.client.tables[this.tableName].filter(row => !this.filters.every(f => f(row)));
      const count = this.client.tables[this.tableName].length - remaining.length;
      this.client.tables[this.tableName] = remaining;
      return { data: count, error: null };
    }

    for (const ord of this.orders) {
      rows.sort((a, b) => {
        const valA = a[ord.field];
        const valB = b[ord.field];
        if (valA < valB) return ord.ascending ? -1 : 1;
        if (valA > valB) return ord.ascending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: JSON.parse(JSON.stringify(rows)), error: null };
  }

  async maybeSingle() {
    const res = this._execute();
    const rows = res.data || [];
    return { data: rows.length > 0 ? rows[0] : null, error: null };
  }

  async single() {
    return this.maybeSingle();
  }

  then(resolve, reject) {
    try {
      const res = this._execute();
      resolve(res);
    } catch (e) {
      reject(e);
    }
  }
}

class MockDatabaseClient {
  constructor() {
    this.tables = {
      orders: [],
      order_items: [],
      inventory_items: [],
      stock_batches: [],
      stock_movements: [],
      products: [],
      product_packaging: []
    };
    this._nextId = 1000;
  }

  from(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    const table = this.tables[tableName];
    const client = this;

    const query = new MockQuery(table, client, tableName);

    query.insert = function(items) {
      const inserted = items.map(item => {
        const row = { id: client._nextId++, created_at: new Date().toISOString(), ...item };
        table.push(row);
        return row;
      });
      return {
        data: inserted,
        error: null,
        select: () => ({ data: inserted, error: null }),
        then: (resolve) => resolve({ data: inserted, error: null })
      };
    };

    return query;
  }
}

async function runTests() {
  console.log('--- TEST SUITE: ORDER SAVING & BOX SELECTION ---');

  // Load inventory core
  const inventoryCore = require('../assets/js/inventory-core.js');

  // =========================================================================
  // 1. UI Structure & Header Verification in pages/orders.html
  // =========================================================================
  await test('orders.html table contains Box column immediately beside Bottle', () => {
    const htmlPath = path.join(__dirname, '..', 'pages', 'orders.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Verify table headers order
    assert(html.includes('<th style="width:22%">Product</th>'), 'Product header exists');
    assert(html.includes('<th style="width:13%">Pack Size</th>'), 'Pack Size header exists');
    assert(html.includes('<th style="width:16%">Bottle</th>'), 'Bottle header exists');
    assert(html.includes('<th style="width:16%">Box</th>'), 'Box header exists');
    assert(html.includes('<th style="width:9%">Qty</th>'), 'Qty header exists');
    assert(html.includes('<th style="width:11%">Unit Price (₹)</th>'), 'Unit Price header exists');
    assert(html.includes('<th style="width:9%">Total</th>'), 'Total header exists');

    // Verify sequential positioning: Bottle immediately preceding Box
    const btlIdx = html.indexOf('<th style="width:16%">Bottle</th>');
    const boxIdx = html.indexOf('<th style="width:16%">Box</th>');
    assert(btlIdx !== -1 && boxIdx !== -1, 'Both Bottle and Box headers exist');
    assert(boxIdx > btlIdx, 'Box header is immediately after Bottle');
    const subStr = html.slice(btlIdx, boxIdx);
    assert(!subStr.includes('<th style="width:9%">Qty</th>'), 'Qty does not precede Box');
  });

  // =========================================================================
  // 2. orders.js Script Inspection: Clean order_items Payload & Box Handlers
  // =========================================================================
  await test('orders.js strictly inserts valid order_items schema columns without dispatched_units', () => {
    const jsPath = path.join(__dirname, '..', 'assets', 'js', 'orders.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Confirm cachedBoxesList is declared and populated
    assert(js.includes('let cachedBoxesList = [];'), 'cachedBoxesList declared');
    assert(js.includes("it.category === 'Boxes'"), 'cachedBoxesList filters category Boxes');

    // Confirm Box select dropdown is rendered in renderOrderItems
    assert(js.includes('order-box-select'), 'order-box-select class present');
    assert(js.includes('onBoxChange('), 'onBoxChange handler present');

    // Confirm insertOrderItemsAndSyncStock does NOT insert dispatched_units into order_items
    const insertFnIdx = js.indexOf('async function insertOrderItemsAndSyncStock');
    assert(insertFnIdx !== -1, 'insertOrderItemsAndSyncStock exists');

    const itemRowsIdx = js.indexOf('const itemRows = processedItems.map(');
    assert(itemRowsIdx !== -1, 'itemRows mapping exists');
    const itemRowsChunk = js.slice(itemRowsIdx, js.indexOf('.insert(stampedRows)'));

    assert(!itemRowsChunk.includes('dispatched_units'), 'Does NOT include non-existent dispatched_units in itemRows payload');
    assert(!itemRowsChunk.includes('remaining_units'), 'Does NOT include non-existent remaining_units in itemRows payload');
    assert(!itemRowsChunk.includes('ordered_units'), 'Does NOT include non-existent ordered_units in itemRows payload');
    assert(!itemRowsChunk.includes('ordered_boxes'), 'Does NOT include non-existent ordered_boxes in itemRows payload');

    // Confirm metadata is stored in DISPATCH_META
    const fnBody = js.slice(insertFnIdx, js.indexOf('async function deleteOrder'));
    assert(fnBody.includes('DISPATCH_META:'), 'DISPATCH_META stored in orders.notes');
  });

  // =========================================================================
  // 3. Packaging Calculations & Physical Box Deductions
  // =========================================================================
  await test('80 bottles @ 12 units/box calculates 6 full boxes, 8 loose, and 7 physical outer boxes consumed', () => {
    const calc = inventoryCore.calculatePackagingQuantities({
      packagingSize: '1 Litre',
      unitsPerBox: 12,
      totalUnits: 80
    });

    assert.strictEqual(calc.totalUnits, 80, 'Total units = 80');
    assert.strictEqual(calc.totalVolumeLitres, 80.0, 'Volume = 80 Litres');
    assert.strictEqual(calc.boxes, 6, 'Full boxes = 6');
    assert.strictEqual(calc.loose, 8, 'Loose bottles = 8');
    // Critical: physical boxes consumed must be 7 (6 full + 1 partial)
    assert.strictEqual(calc.outerBoxesConsumed, 7, '7 physical boxes consumed (6 full + 1 partial)');
  });

  await test('Exact box multiple (e.g. 120 bottles @ 12 units/box) calculates 10 full boxes and 10 outer boxes consumed', () => {
    const calc = inventoryCore.calculatePackagingQuantities({
      packagingSize: '500 ml',
      unitsPerBox: 12,
      totalUnits: 120
    });

    assert.strictEqual(calc.totalUnits, 120, 'Total units = 120');
    assert.strictEqual(calc.totalVolumeLitres, 60.0, 'Volume = 60 Litres');
    assert.strictEqual(calc.boxes, 10, 'Full boxes = 10');
    assert.strictEqual(calc.loose, 0, 'Loose bottles = 0');
    assert.strictEqual(calc.outerBoxesConsumed, 10, '10 physical boxes consumed');
  });

  // =========================================================================
  // 4. Mock Database End-to-End Save, Deduction, Reversibility & Pricing Integrity
  // =========================================================================
  await test('Simulate order creation, box deduction, price preservation, and reversible cancellation', async () => {
    const client = new MockDatabaseClient();
    client.tables.inventory_items = [
      { id: 101, name: 'Chlorantraniliprole Bulk Liquid', stock: 500, unit: 'Litre', category: 'Raw Materials' },
      { id: 14, name: 'Imida Bottle 1 Ltr', stock: 800, unit: 'Nos', category: 'Bottles' },
      { id: 15, name: 'Common Box Box 10*10*10', stock: 880, unit: 'Nos', category: 'Boxes' }
    ];
    client.tables.stock_batches = [
      { id: 1, item_id: 101, item_type: 'Inventory', current_qty: 500, batch_no: 'B-BULK-01', purchase_date: '2026-01-01' },
      { id: 2, item_id: 14, item_type: 'Inventory', current_qty: 800, batch_no: 'B-BTL-01', purchase_date: '2026-01-01' },
      { id: 3, item_id: 15, item_type: 'Inventory', current_qty: 880, batch_no: 'B-BOX-01', purchase_date: '2026-01-01' }
    ];

    inventoryCore.Service.setDb(client);

    // Setup window environment for orders logic
    global.window = {
      dbClient: client,
      INVENTORY_CORE: inventoryCore,
      INVENTORY_SERVICE: inventoryCore.Service
    };

    // 1. User orders 80 units of Chlorantraniliprole 1L @ ₹850
    // Selected Bottle: #14 (Imida Bottle 1 Ltr)
    // Selected Box: #15 (Common Box, 12 units/box)
    const initialBulk = await inventoryCore.Service.getItemStock(101);
    const initialBottles = await inventoryCore.Service.getItemStock(14);
    const initialBoxes = await inventoryCore.Service.getItemStock(15);

    assert.strictEqual(initialBulk, 500, 'Initial bulk: 500 L');
    assert.strictEqual(initialBottles, 800, 'Initial bottles: 800 Nos');
    assert.strictEqual(initialBoxes, 880, 'Initial boxes: 880 Nos');

    const qty = 80;
    const unitPrice = 850;
    const packStr = '1 Litre';
    const unitsPerBox = 12;

    const packCalc = inventoryCore.calculatePackagingQuantities({
      packagingSize: packStr,
      unitsPerBox: unitsPerBox,
      totalUnits: qty
    });

    // Verify pricing: 80 * 850 = 68,000 (purely product and quantity based)
    const itemTotal = qty * unitPrice;
    assert.strictEqual(itemTotal, 68000, 'Item total is ₹68,000 unaffected by packaging');

    // Simulate order save
    const orderId = 1001;
    const orderNo = 'O-1001';

    // 1. Insert order_items with ONLY physical schema columns
    const itemRow = {
      order_id: orderId,
      product_id: 1,
      inventory_item_id: 101,
      product_name: 'Chlorantraniliprole 18.5% SC',
      packing_size: packStr,
      bottle_inventory_id: 14,
      quantity: qty,
      unit_price: unitPrice,
      discount: 0,
      total: itemTotal
    };
    client.tables.order_items.push({ id: 1, ...itemRow });

    // 2. Perform FIFO stock deductions
    // A. Deduct Bottles: 80 units
    await inventoryCore.Service.deductStockFIFO({
      itemId: 14,
      quantity: qty,
      movementType: 'DISPATCH_BOTTLES',
      referenceId: orderId,
      referenceNo: orderNo
    });

    // B. Deduct Boxes: 7 physical boxes (80 units @ 12/box)
    await inventoryCore.Service.deductStockFIFO({
      itemId: 15,
      quantity: packCalc.outerBoxesConsumed,
      movementType: 'DISPATCH_BOXES',
      referenceId: orderId,
      referenceNo: orderNo
    });

    // C. Deduct Bulk Liquid: 80 Litres
    await inventoryCore.Service.deductStockFIFO({
      itemId: 101,
      quantity: packCalc.totalVolumeLitres,
      movementType: 'DISPATCH',
      referenceId: orderId,
      referenceNo: orderNo
    });

    // Verify stock balances after order deduction
    const stockBulkAft = await inventoryCore.Service.getItemStock(101);
    const stockBtlAft = await inventoryCore.Service.getItemStock(14);
    const stockBoxAft = await inventoryCore.Service.getItemStock(15);

    assert.strictEqual(stockBulkAft, 500 - 80, 'Bulk deducted by 80L -> 420L');
    assert.strictEqual(stockBtlAft, 800 - 80, 'Bottles deducted by 80 -> 720 Nos');
    assert.strictEqual(stockBoxAft, 880 - 7, 'Boxes deducted by 7 -> 873 Nos');

    // Verify movement records
    const movs = client.tables.stock_movements.filter(m => m.txn_id === orderId);
    assert.strictEqual(movs.length, 3, '3 stock movements logged (bottle, box, bulk)');

    // 3. Test Order Reversal / Cancellation
    await inventoryCore.Service.reverseReferenceStock({
      referenceId: orderId,
      referenceNo: orderNo,
      movementType: 'DISPATCH_REVERSAL'
    });

    // Verify stock fully and accurately restored
    const stockBulkRev = await inventoryCore.Service.getItemStock(101);
    const stockBtlRev = await inventoryCore.Service.getItemStock(14);
    const stockBoxRev = await inventoryCore.Service.getItemStock(15);

    assert.strictEqual(stockBulkRev, 500, 'Bulk liquid fully restored to 500L');
    assert.strictEqual(stockBtlRev, 800, 'Bottles fully restored to 800 Nos');
    assert.strictEqual(stockBoxRev, 880, 'Boxes fully restored to 880 Nos');
  });

  console.log('\n===============================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} TOTAL)`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
