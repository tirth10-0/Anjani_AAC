/**
 * tests/test_inventory_integrity.js
 * Comprehensive Automated Test Suite for AgroChem ERP Inventory Integrity Engine
 *
 * Verifies:
 * 1. Standardized unit conversions (Nos, Gram, Kg, Ml, Litre with density support).
 * 2. SKU-specific packaging and box calculations (100 bottles of 500 ml = 50 L; 20 boxes * 10 = 200 bottles; etc.).
 * 3. Idempotency guard and duplicate submission blocking.
 * 4. Pre-transaction stock validation and negative stock prevention.
 * 5. Purchase receipt inward booking with batch price preservation.
 * 6. True FIFO batch deduction order and batch-level movement logging.
 * 7. Partial dispatches and multi-batch consumption.
 * 8. Order cancellations and traceable stock restoration.
 * 9. Production run consumption and finished good output booking.
 * 10. Diagnostics engine detecting balance discrepancies and healing negative batches.
 */

const assert = require('assert');
const path = require('path');
const inventoryCore = require('../assets/js/inventory-core.js');

const { Units, IdempotencyGuard, Service } = inventoryCore;

// ============================================================================
// MOCK DATABASE CLIENT FOR ISOLATED TRANSACTION & MOVEMENT TESTING
// ============================================================================
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
    this.filters.push(row => row[field] === value);
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

  ilike(field, value) {
    this.filters.push(row => String(row[field] || '').toLowerCase() === String(value || '').toLowerCase());
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

    // Attach insert directly to the query entry point
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

// ============================================================================
// TEST RUNNER
// ============================================================================
let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    \x1b[31mError:\x1b[0m ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 3).map(l => `    ${l}`).join('\n'));
    }
  }
}

async function runAllTests() {
  console.log('\n=============================================================');
  console.log(' RUNNING INVENTORY INTEGRITY AUTOMATED TEST SUITE');
  console.log('=============================================================\n');

  // --------------------------------------------------------------------------
  console.log('[SECTION 1] Standardized Unit Conversions & Density Support');
  // --------------------------------------------------------------------------
  await test('Volume conversion: 500 ml -> 0.5 Litre & 2 Litre -> 2000 ml', () => {
    assert.strictEqual(Units.convert(500, 'Ml', 'Litre'), 0.5);
    assert.strictEqual(Units.convert(2, 'Litre', 'Ml'), 2000);
    assert.strictEqual(Units.convert(1.5, 'ltr', 'ml'), 1500);
  });

  await test('Weight conversion: 500 Gram -> 0.5 Kg & 2.5 Kg -> 2500 Gram', () => {
    assert.strictEqual(Units.convert(500, 'Gram', 'Kg'), 0.5);
    assert.strictEqual(Units.convert(2.5, 'Kg', 'Gram'), 2500);
    assert.strictEqual(Units.convert(750, 'gm', 'kg'), 0.75);
  });

  await test('Volume to Weight with density (e.g. EC formulation density = 1.15 kg/L)', () => {
    // 10 Litres at density 1.15 = 11.5 Kg
    const kg = Units.convert(10, 'Litre', 'Kg', 1.15);
    assert.strictEqual(Math.round(kg * 100) / 100, 11.5);

    // 11.5 Kg at density 1.15 = 10 Litres
    const ltr = Units.convert(11.5, 'Kg', 'Litre', 1.15);
    assert.strictEqual(Math.round(ltr * 100) / 100, 10.0);

    // 500 ml at density 1.25 = 625 Grams
    const gm = Units.convert(500, 'Ml', 'Gram', 1.25);
    assert.strictEqual(Math.round(gm), 625);
  });

  await test('Discrete Nos cross-conversion safety check throws error', () => {
    assert.throws(() => {
      Units.convert(10, 'Nos', 'Litre');
    }, /INVALID_CROSS_UNIT_CONVERSION/);

    assert.throws(() => {
      Units.convert(5, 'Kg', 'Nos');
    }, /INVALID_CROSS_UNIT_CONVERSION/);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 2] SKU-Specific Packaging & Box Calculations');
  // --------------------------------------------------------------------------
  await test('100 bottles of 500 ml represent exactly 50 Litres', () => {
    const res = Units.calculatePackagingQuantities({
      packagingSize: '500 ml',
      unitsPerBox: 20,
      totalUnits: 100
    });
    assert.strictEqual(res.totalUnits, 100);
    assert.strictEqual(res.totalVolumeLitres, 50.0);
    assert.strictEqual(res.totalVolumeMl, 50000);
    assert.strictEqual(res.boxes, 5);
    assert.strictEqual(res.loose, 0);
  });

  await test('20 boxes containing 10 bottles each represent 200 bottles & 100 Litres for 500 ml', () => {
    const res = Units.calculatePackagingQuantities({
      packagingSize: '500 ml',
      unitsPerBox: 10,
      boxes: 20,
      loose: 0
    });
    assert.strictEqual(res.totalUnits, 200);
    assert.strictEqual(res.totalVolumeLitres, 100.0);
    assert.strictEqual(res.outerBoxesConsumed, 20);
  });

  await test('SKU with 24 units/box: 5 boxes + 6 loose = 126 bottles and 31.5 Litres (250 ml)', () => {
    const res = Units.calculatePackagingQuantities({
      packagingSize: '250 ml',
      unitsPerBox: 24,
      boxes: 5,
      loose: 6
    });
    assert.strictEqual(res.totalUnits, 126);
    assert.strictEqual(res.boxes, 5);
    assert.strictEqual(res.loose, 6);
    assert.strictEqual(res.totalVolumeLitres, 31.5);
  });

  await test('Different SKU capacities are respected (never assumes hardcoded box capacity)', () => {
    // 5 Litre Jar: 4 per box
    const packA = Units.calculatePackagingQuantities({
      packagingSize: '5 Litre',
      unitsPerBox: 4,
      totalUnits: 15
    });
    assert.strictEqual(packA.boxes, 3);
    assert.strictEqual(packA.loose, 3);
    assert.strictEqual(packA.totalVolumeLitres, 75.0);

    // 100 ml bottle: 50 per box
    const packB = Units.calculatePackagingQuantities({
      packagingSize: '100 ml',
      unitsPerBox: 50,
      totalUnits: 125
    });
    assert.strictEqual(packB.boxes, 2);
    assert.strictEqual(packB.loose, 25);
    assert.strictEqual(packB.totalVolumeLitres, 12.5);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 3] Idempotency Guard & Duplicate Submission Blocking');
  // --------------------------------------------------------------------------
  await test('IdempotencyGuard blocks concurrent duplicate submissions with same token', () => {
    const key = `order-submit-test-${Date.now()}`;
    assert.strictEqual(IdempotencyGuard.start(key), true);

    // Immediate second click must throw DUPLICATE_REQUEST_BLOCKED
    assert.throws(() => {
      IdempotencyGuard.start(key);
    }, /DUPLICATE_REQUEST_BLOCKED/);

    IdempotencyGuard.commit(key);

    // After commit, start returns false (already processed), skipping re-execution
    assert.strictEqual(IdempotencyGuard.start(key), false);
    assert.strictEqual(IdempotencyGuard.hasBeenProcessed(key), true);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 4] Pre-Transaction Stock Validation & Insufficient Stock');
  // --------------------------------------------------------------------------
  const mockDb = new MockDatabaseClient();
  Service.setDb(mockDb);

  // Setup sample inventory item & batches
  mockDb.tables.inventory_items.push({
    id: 101,
    name: 'Abamectin 1.9% EC Bulk Liquid',
    stock: 50.0,
    unit: 'Litre',
    category: 'Technical'
  });
  mockDb.tables.stock_batches.push({
    id: 201,
    item_id: 101,
    item_type: 'Inventory',
    batch_no: 'B-OLD-01',
    purchase_date: '2026-01-01',
    purchase_price: 1200,
    initial_qty: 30.0,
    current_qty: 30.0,
    unit: 'Litre'
  });
  mockDb.tables.stock_batches.push({
    id: 202,
    item_id: 101,
    item_type: 'Inventory',
    batch_no: 'B-NEW-02',
    purchase_date: '2026-02-01',
    purchase_price: 1250,
    initial_qty: 20.0,
    current_qty: 20.0,
    unit: 'Litre'
  });

  await test('Validates stock availability and allows transaction when sufficient', async () => {
    const check = await Service.validateStockAvailability(101, 40.0, false);
    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.available, 50.0);
  });

  await test('Rejects transaction with INSUFFICIENT_STOCK when request exceeds available stock', async () => {
    try {
      await Service.validateStockAvailability(101, 80.0, false);
      assert.fail('Should have thrown INSUFFICIENT_STOCK');
    } catch (e) {
      assert.strictEqual(e.code, 'INSUFFICIENT_STOCK');
      assert.strictEqual(e.available, 50.0);
      assert.strictEqual(e.required, 80.0);
    }
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 5] FIFO Stock Deduction, Batches & Movement Auditing');
  // --------------------------------------------------------------------------
  await test('Deducts stock in strict FIFO order (depleting oldest batch first)', async () => {
    // Current stock: Batch 201 (30 L, 2026-01-01), Batch 202 (20 L, 2026-02-01) -> Total 50 L
    // Request 35 L deduction:
    // Batch 201 should drop from 30 to 0 (30 deducted)
    // Batch 202 should drop from 20 to 15 (5 deducted)
    // Remaining stock = 15 L
    const newStock = await Service.deductStockFIFO({
      itemId: 101,
      quantity: 35.0,
      movementType: 'DISPATCH',
      referenceType: 'orders',
      referenceId: 501,
      referenceNo: 'ORD-501',
      idempotencyKey: 'test-fifo-order-501'
    });

    assert.strictEqual(newStock, 15.0);

    const b1 = mockDb.tables.stock_batches.find(b => b.id === 201);
    const b2 = mockDb.tables.stock_batches.find(b => b.id === 202);
    assert.strictEqual(b1.current_qty, 0);
    assert.strictEqual(b2.current_qty, 15.0);

    // Verify stock movements logged with batch attribution and reference
    const movements = mockDb.tables.stock_movements.filter(m => m.txn_id === 501);
    assert.strictEqual(movements.length, 2);
    assert.strictEqual(movements[0].batch_id, 201);
    assert.strictEqual(movements[0].qty, -30.0);
    assert.strictEqual(movements[1].batch_id, 202);
    assert.strictEqual(movements[1].qty, -5.0);
  });

  await test('Partial dispatch: deducts remaining quantity in subsequent step', async () => {
    // Stock is now 15 L in Batch 202
    // Partial dispatch of 10 L leaves 5 L
    const newStock = await Service.deductStockFIFO({
      itemId: 101,
      quantity: 10.0,
      movementType: 'DISPATCH',
      referenceType: 'orders',
      referenceId: 502,
      referenceNo: 'ORD-502-PARTIAL'
    });

    assert.strictEqual(newStock, 5.0);
    const b2 = mockDb.tables.stock_batches.find(b => b.id === 202);
    assert.strictEqual(b2.current_qty, 5.0);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 6] Order Cancellation & Traceable Reversals');
  // --------------------------------------------------------------------------
  await test('Reverses order deduction and accurately restores affected historical batches', async () => {
    // Reverse ORD-501 (which deducted 30 from b201 and 5 from b202)
    await Service.reverseReferenceStock({
      referenceId: 501,
      referenceNo: 'ORD-501',
      movementType: 'DISPATCH_CANCELLATION'
    });

    const b1 = mockDb.tables.stock_batches.find(b => b.id === 201);
    const b2 = mockDb.tables.stock_batches.find(b => b.id === 202);

    assert.strictEqual(b1.current_qty, 30.0); // Fully restored to 30
    assert.strictEqual(b2.current_qty, 10.0); // 5 restored + 5 existing = 10

    const totalStock = await Service.getItemStock(101);
    assert.strictEqual(totalStock, 40.0);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 7] Purchase Receipts & Price Preservation');
  // --------------------------------------------------------------------------
  await test('Receives purchase receipt with batch creation and unit price preservation', async () => {
    const success = await Service.receivePurchaseReceipt({
      purchaseId: 801,
      purchaseNo: 'PUR-801',
      supplierId: 10,
      purchaseDate: '2026-03-15',
      items: [
        {
          itemId: 101,
          itemName: 'Abamectin 1.9% EC Bulk Liquid',
          quantity: 100.0,
          unitPrice: 1320.50,
          unit: 'Litre',
          batchNo: 'PUR-801-BATCH'
        }
      ]
    });

    assert.strictEqual(success, true);
    const pBatch = mockDb.tables.stock_batches.find(b => b.purchase_id === 801);
    assert.ok(pBatch);
    assert.strictEqual(pBatch.current_qty, 100.0);
    assert.strictEqual(pBatch.purchase_price, 1320.50);
    assert.strictEqual(pBatch.batch_no, 'PUR-801-BATCH');

    // Total stock is now 40 + 100 = 140
    const totalStock = await Service.getItemStock(101);
    assert.strictEqual(totalStock, 140.0);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 8] Manufacturing Consumption & Output Booking');
  // --------------------------------------------------------------------------
  await test('Manufacturing run consumes raw ingredients FIFO and creates output batch', async () => {
    // Add raw packaging bottles
    mockDb.tables.inventory_items.push({
      id: 301,
      name: '500ml HDPE Bottles',
      stock: 500,
      unit: 'Nos',
      category: 'Packaging'
    });
    mockDb.tables.stock_batches.push({
      id: 401,
      item_id: 301,
      item_type: 'Inventory',
      batch_no: 'BTL-01',
      purchase_date: '2026-01-01',
      current_qty: 500,
      initial_qty: 500,
      unit: 'Nos'
    });

    // Add finished good item
    mockDb.tables.inventory_items.push({
      id: 302,
      name: 'Abamectin 1.9% EC 500ml Bottled',
      stock: 0,
      unit: 'Nos',
      category: 'Finished Goods'
    });

    // Run manufacturing run: consume 50 Litres bulk + 100 bottles -> produce 100 finished bottles
    const success = await Service.bookManufacturingRun({
      productionId: 901,
      batchNo: 'MFG-2026-01',
      date: '2026-03-20',
      ingredients: [
        { itemId: 101, quantity: 50.0, unit: 'Litre' },
        { itemId: 301, quantity: 100, unit: 'Nos' }
      ],
      output: {
        itemId: 302,
        itemName: 'Abamectin 1.9% EC 500ml Bottled',
        quantity: 100,
        unit: 'Nos',
        batchNo: 'MFG-2026-01',
        costPerUnit: 180.0
      }
    });

    assert.strictEqual(success, true);

    // Verify raw material was deducted
    const bulkRemaining = await Service.getItemStock(101);
    assert.strictEqual(bulkRemaining, 90.0); // 140 - 50 = 90

    const bottlesRemaining = await Service.getItemStock(301);
    assert.strictEqual(bottlesRemaining, 400); // 500 - 100 = 400

    // Verify finished good was produced
    const fgStock = await Service.getItemStock(302);
    assert.strictEqual(fgStock, 100);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 9] Diagnostics & Auto-Reconciliation Engine');
  // --------------------------------------------------------------------------
  await test('Diagnostics engine flags cached vs calculated balance discrepancies and negative batches', async () => {
    // Introduce an artificial discrepancy into inventory_items.stock
    const it = mockDb.tables.inventory_items.find(i => i.id === 101);
    it.stock = 999.0; // Incorrect cached balance vs true batch sum of 90.0

    // Introduce an artificial negative batch
    mockDb.tables.stock_batches.push({
      id: 999,
      item_id: 101,
      item_type: 'Inventory',
      batch_no: 'B-CORRUPT',
      current_qty: -15.0,
      unit: 'Litre'
    });

    const diag = await Service.runDiagnostics();
    assert.strictEqual(diag.status, 'DISCREPANCIES_FOUND');
    assert.strictEqual(diag.discrepanciesCount, 1);
    assert.strictEqual(diag.discrepancies[0].itemId, 101);
    assert.strictEqual(diag.negativeBatchesCount, 1);
  });

  await test('Repair tool heals balance discrepancies and clamps negative batches to 0', async () => {
    const repair = await Service.repairDiscrepancies();
    assert.strictEqual(repair.success, true);
    assert.strictEqual(repair.repairedItems, 1);
    assert.strictEqual(repair.fixedNegativeBatches, 1);

    // Re-run diagnostics to verify system is 100% HEALTHY
    const diagAfter = await Service.runDiagnostics();
    assert.strictEqual(diagAfter.status, 'HEALTHY');
    assert.strictEqual(diagAfter.discrepanciesCount, 0);
    assert.strictEqual(diagAfter.negativeBatchesCount, 0);
  });

  // --------------------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(` SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
