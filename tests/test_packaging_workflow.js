/**
 * tests/test_packaging_workflow.js
 * Comprehensive Automated Test Suite for Agrochemical QC and Packaging / Bottling Workflow
 *
 * Verifies:
 * 1. Product-specific packaging configurations & units per box calculation (e.g. 205 bottles @ 10/box = 20 boxes + 5 loose).
 * 2. Box capacity is NEVER hardcoded across different SKUs (100ml, 250ml, 500ml, 1L).
 * 3. Packaging configuration versioning & immutable history snapshots.
 * 4. Packaging BOM scaling (bulk volume + bottles + caps + labels + cartons).
 * 5. Material availability pre-check (detects shortages, blocks quarantined bulk batches).
 * 6. Material issue & Anti Double-Deduction Guard.
 * 7. Packaging completion: output booking, chemical deduction, breakage & unused returns.
 * 8. Remaining bulk chemical tracking across partial packing runs.
 * 9. Quarantine segregation: Unapproved packed batches CANNOT enter saleable stock.
 * 10. QC Approval workflow: Releases quarantined packed goods into saleable stock.
 * 11. QC Rejection workflow: Retains rejected lots permanently in quarantine.
 * 12. Bidirectional genealogy: Finished Lot <-> Packaging BOM <-> Bulk Batch <-> Synthesis.
 */

const assert = require('assert');
const path = require('path');
const inventoryCore = require('../assets/js/inventory-core.js');
const packagingCore = require('../assets/js/packaging-core.js');

const { PackagingCalculator, AvailabilityChecker, Service } = packagingCore;

// ============================================================================
// MOCK DATABASE CLIENT FOR ISOLATED TESTING
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
    return { data: (res.data && res.data.length > 0) ? res.data[0] : null, error: null };
  }

  then(resolve) {
    resolve(this._execute());
  }
}

class MockDbClient {
  constructor() {
    this.tables = {
      products: [],
      product_packaging: [],
      packaging_config_versions: [],
      packaging_orders: [],
      packaging_materials_consumed: [],
      stock_batches: [],
      stock_movements: [],
      inventory_items: [],
      production_orders: [],
      production_materials: []
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

    query.insert = function (items) {
      const inserted = (Array.isArray(items) ? items : [items]).map(item => {
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
// TEST HARNESS
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
      console.error(err.stack.split('\n').slice(1, 4).map(l => `    ${l}`).join('\n'));
    }
  }
}

async function runPackagingTests() {
  console.log('\n=============================================================');
  console.log('🧪 RUNNING AGROCHEMICAL QC & PACKAGING WORKFLOW TEST SUITE');
  console.log('=============================================================\n');

  // --------------------------------------------------------------------------
  console.log('[SECTION 1] SKU-Specific Box & Loose Calculations');
  // --------------------------------------------------------------------------
  await test('Example Specification: 205 bottles @ 10 units/box yields 20 boxes and 5 loose', () => {
    const res = PackagingCalculator.calculateBoxesAndLoose(205, 10, true);
    assert.strictEqual(res.boxes, 20, 'Should have 20 full boxes');
    assert.strictEqual(res.loose, 5, 'Should have 5 loose bottles');
    assert.strictEqual(res.totalBottles, 205);
  });

  await test('SKU with 24 units/box: 126 bottles yields 5 boxes and 6 loose', () => {
    const res = PackagingCalculator.calculateBoxesAndLoose(126, 24, true);
    assert.strictEqual(res.boxes, 5);
    assert.strictEqual(res.loose, 6);
  });

  await test('SKU with 40 units/box (100 ml): 1000 bottles yields 25 full boxes and 0 loose', () => {
    const res = PackagingCalculator.calculateBoxesAndLoose(1000, 40, true);
    assert.strictEqual(res.boxes, 25);
    assert.strictEqual(res.loose, 0);
  });

  await test('Box capacity is NEVER hardcoded across different SKUs', () => {
    const sku1L = PackagingCalculator.calculateBoxesAndLoose(100, 10); // 10 per box
    const sku250ml = PackagingCalculator.calculateBoxesAndLoose(100, 40); // 40 per box
    assert.notStrictEqual(sku1L.boxes, sku250ml.boxes, 'Different SKU capacities produce different box counts');
    assert.strictEqual(sku1L.boxes, 10);
    assert.strictEqual(sku250ml.boxes, 2);
    assert.strictEqual(sku250ml.loose, 20);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 2] Packaging Configuration Versioning & History');
  // --------------------------------------------------------------------------
  await test('Creating a new packaging configuration starts at version 1', async () => {
    const db = new MockDbClient();
    const config = await Service.savePackagingConfiguration(db, {
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 20,
      bottle_inventory_id: 6,
      cap_inventory_id: 7,
      carton_inventory_id: 15,
      purchase_price: 120,
      sell_price: 180
    });

    assert.strictEqual(config.version, 1);
    assert.strictEqual(config.is_new, true);
    assert.strictEqual(db.tables.product_packaging.length, 1);
  });

  await test('Modifying packaging config archives version 1 and upgrades active to version 2', async () => {
    const db = new MockDbClient();
    const existing = db.tables.product_packaging.push({
      id: 50,
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 20,
      bottle_inventory_id: 6,
      version: 1,
      effective_date: '2026-01-01',
      allow_loose: true
    });

    const upgraded = await Service.savePackagingConfiguration(db, {
      id: 50,
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 24, // Changed carton supplier/capacity
      bottle_inventory_id: 8,
      effective_date: '2026-10-12'
    });

    assert.strictEqual(upgraded.version, 2);
    // Verifies archive snapshot exists in packaging_config_versions
    assert.strictEqual(db.tables.packaging_config_versions.length, 1);
    assert.strictEqual(db.tables.packaging_config_versions[0].version, 1);
    assert.strictEqual(db.tables.packaging_config_versions[0].units_per_box, 20);

    // Active record is version 2
    const active = db.tables.product_packaging.find(p => p.id === 50);
    assert.strictEqual(active.version, 2);
    assert.strictEqual(active.units_per_box, 24);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 3] Packaging BOM Scaling & Component Requirements');
  // --------------------------------------------------------------------------
  await test('BOM correctly scales bulk volume, bottles, caps, labels, cartons for 205 bottles of 500 ml', () => {
    const bom = PackagingCalculator.calculatePackagingBOM({
      id: 1,
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 10,
      allow_loose: true,
      bottle_inventory_id: 6,
      bottle_name: '500ml HDPE Bottle',
      cap_inventory_id: 7,
      cap_name: 'Seal Cap',
      carton_inventory_id: 15,
      carton_name: 'Master Corrugated Box'
    }, 205);

    // 205 bottles * 0.5 L = 102.5 Litres of bulk liquid
    assert.strictEqual(bom.required_bulk_litres, 102.5);
    assert.strictEqual(bom.required_bottles, 205);
    assert.strictEqual(bom.required_caps, 205);
    assert.strictEqual(bom.required_labels, 205);
    assert.strictEqual(bom.boxes, 20);
    assert.strictEqual(bom.loose, 5);
    assert.strictEqual(bom.required_cartons, 20);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 4] Stock Availability Pre-Check & Quarantined Bulk Block');
  // --------------------------------------------------------------------------
  await test('Availability check passes when bulk chemical and packaging materials are in stock', async () => {
    const db = new MockDbClient();
    // Bulk batch in stock_batches: 500 Litres, Approved
    db.tables.stock_batches.push({
      id: 101,
      company_id: 1,
      batch_no: 'CHLOR-BULK-01',
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved'
    });
    // Inventory items
    db.tables.inventory_items.push(
      { id: 6, name: 'Bottle 500ml', stock: 1000 },
      { id: 7, name: 'Cap', stock: 1000 },
      { id: 8, name: 'Label', stock: 1000 },
      { id: 15, name: 'Carton', stock: 200 }
    );

    const config = {
      id: 1,
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 10,
      bottle_inventory_id: 6,
      cap_inventory_id: 7,
      label_inventory_id: 8,
      carton_inventory_id: 15
    };

    const res = await AvailabilityChecker.checkPackagingAvailability(db, {
      bulkBatchId: 101,
      packagingConfig: config,
      plannedBottles: 205
    });

    assert.strictEqual(res.canFulfill, true);
    assert.strictEqual(res.shortages.length, 0);
  });

  await test('Availability check blocks scheduling when bulk batch is still in QUARANTINE', async () => {
    const db = new MockDbClient();
    // Bulk batch still in quarantine (unapproved bulk synthesis)
    db.tables.stock_batches.push({
      id: 102,
      company_id: 1,
      batch_no: 'CHLOR-BULK-QUARANTINE',
      current_qty: 500,
      is_quarantine: true,
      qc_status: 'Pending'
    });
    db.tables.inventory_items.push({ id: 6, stock: 1000 });

    const res = await AvailabilityChecker.checkPackagingAvailability(db, {
      bulkBatchId: 102,
      packagingConfig: { id: 1, packaging_size: '500 ml', bottle_inventory_id: 6 },
      plannedBottles: 200
    });

    assert.strictEqual(res.canFulfill, false);
    assert.ok(res.shortages.some(s => s.error === 'BULK_BATCH_IN_QUARANTINE_OR_UNAPPROVED'));
  });

  await test('Availability check flags deficit when bottle or carton stock is insufficient', async () => {
    const db = new MockDbClient();
    db.tables.stock_batches.push({
      id: 101,
      company_id: 1,
      batch_no: 'CHLOR-BULK-01',
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved'
    });
    // Only 50 bottles in stock, but order needs 205
    db.tables.inventory_items.push({ id: 6, name: 'Bottle 500ml', stock: 50 });

    const res = await AvailabilityChecker.checkPackagingAvailability(db, {
      bulkBatchId: 101,
      packagingConfig: { id: 1, packaging_size: '500 ml', bottle_inventory_id: 6 },
      plannedBottles: 205
    });

    assert.strictEqual(res.canFulfill, false);
    const bottleDeficit = res.shortages.find(s => s.type === 'Bottle');
    assert.ok(bottleDeficit);
    assert.strictEqual(bottleDeficit.available, 50);
    assert.strictEqual(bottleDeficit.shortage, 155);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 5] Packaging Order Creation & Anti Double-Issuance');
  // --------------------------------------------------------------------------
  await test('Creates packaging order with planned quantities and Planned status', async () => {
    const db = new MockDbClient();
    db.tables.stock_batches.push({
      id: 101,
      company_id: 1,
      batch_no: 'BULK-101',
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved'
    });
    db.tables.inventory_items.push({ id: 6, stock: 500 });
    db.tables.product_packaging.push({
      id: 1,
      product_id: 10,
      packaging_size: '1 Litre',
      units_per_box: 10,
      bottle_inventory_id: 6
    });

    const result = await Service.createPackagingOrder(db, {
      order_no: 'PKG-2026-001',
      company_id: 1,
      product_id: 10,
      packaging_id: 1,
      bulk_batch_id: 101,
      planned_bottles: 200
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.order.status, 'Planned');
    assert.strictEqual(result.order.material_status, 'Pending');
    assert.strictEqual(result.order.qc_status, 'Pending');
    assert.strictEqual(result.order.planned_bulk_qty, 200);
  });

  await test('Material issue marks order as Materials Issued and blocks double issuance', async () => {
    const db = new MockDbClient();
    db.tables.packaging_orders.push({
      id: 501,
      order_no: 'PKG-2026-001',
      status: 'Planned',
      material_status: 'Pending'
    });

    const issueRes = await Service.issuePackagingMaterials(db, { orderId: 501 });
    assert.strictEqual(issueRes.status, 'Materials Issued');

    // Attempting to issue materials again must fail
    await assert.rejects(
      async () => await Service.issuePackagingMaterials(db, { orderId: 501 }),
      /MATERIALS_ALREADY_ISSUED/
    );
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 6] Packaging Completion: Breakage, Leakage & Unused Returns');
  // --------------------------------------------------------------------------
  await test('Completes packaging run: deducts bulk chemical, tracks breakage, reconciles returns', async () => {
    const db = new MockDbClient();

    // Initial Bulk batch has 300 Litres
    db.tables.stock_batches.push({
      id: 101,
      company_id: 1,
      batch_no: 'BULK-CHLOR-300L',
      current_qty: 300,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    // Initial Packaging Items stock
    db.tables.inventory_items.push(
      { id: 6, name: 'Bottle 500ml', stock: 500 },
      { id: 7, name: 'Cap', stock: 500 },
      { id: 8, name: 'Label', stock: 500 },
      { id: 15, name: 'Carton', stock: 100 }
    );

    // Packaging configuration: 500 ml, 10 units/box
    db.tables.product_packaging.push({
      id: 1,
      product_id: 10,
      packaging_size: '500 ml',
      units_per_box: 10,
      bottle_inventory_id: 6,
      cap_inventory_id: 7,
      label_inventory_id: 8,
      carton_inventory_id: 15
    });

    db.tables.packaging_orders.push({
      id: 601,
      order_no: 'PKG-RUN-601',
      company_id: 1,
      product_id: 10,
      packaging_id: 1,
      packaging_size: '500 ml',
      units_per_box: 10,
      bulk_batch_id: 101,
      bulk_batch_no: 'BULK-CHLOR-300L',
      planned_bottles: 210,
      status: 'Materials Issued',
      material_status: 'Issued',
      qc_status: 'Pending'
    });

    // PACKING EXECUTION:
    // Actual good packed bottles: 205 (which is 20 boxes + 5 loose)
    // Leaking/rejected filled bottles: 2 (consumed bulk chemical!)
    // Empty bottle breakage: 3
    // Cap wastage: 2
    // Label wastage: 5
    // Carton wastage: 1
    // Unused cartons returned to store: 2
    const completion = await Service.completePackagingRun(db, {
      order_id: 601,
      actual_bottles_packed: 205,
      rejected_bottles: 2,
      bottle_breakage: 3,
      cap_wastage: 2,
      label_wastage: 5,
      carton_wastage: 1,
      materials_returned: [{ type: 'Carton', qty: 2 }],
      packing_batch_no: 'LOT-PKG-205-BOTTLES',
      packed_by: 'Operator Ramesh',
      verified_by: 'Supervisor Suresh'
    });

    assert.strictEqual(completion.actualBottles, 205);
    assert.strictEqual(completion.boxesPacked, 20);
    assert.strictEqual(completion.loosePacked, 5);

    // Chemical consumed: (205 good + 2 rejected) * 0.5 L = 207 * 0.5 = 103.5 Litres
    assert.strictEqual(completion.actualBulkConsumed, 103.5);

    // Remaining bulk in bulk batch: 300 - 103.5 = 196.5 Litres
    const bulkBatch = db.tables.stock_batches.find(b => b.id === 101);
    assert.strictEqual(bulkBatch.current_qty, 196.5);
    assert.strictEqual(completion.remainingBulkQty, 196.5);

    // Bottles deducted: 205 good + 2 rejected + 3 breakage = 210 bottles.
    // Stock becomes 500 - 210 = 290
    const bottleItem = db.tables.inventory_items.find(i => i.id === 6);
    assert.strictEqual(bottleItem.stock, 290);

    // Cartons deducted: 20 boxes + 1 damaged - 2 returned = 19 net cartons deducted.
    // Stock becomes 100 - 19 = 81
    const cartonItem = db.tables.inventory_items.find(i => i.id === 15);
    assert.strictEqual(cartonItem.stock, 81);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 7] Quarantine Segregation & Saleable Stock Isolation');
  // --------------------------------------------------------------------------
  await test('Packed finished goods MUST be placed into QUARANTINE upon completion', async () => {
    const db = new MockDbClient();
    db.tables.product_packaging.push({
      id: 1,
      product_id: 10,
      packaging_size: '1 Litre',
      units_per_box: 10
    });
    db.tables.packaging_orders.push({
      id: 701,
      order_no: 'PKG-RUN-701',
      packaging_id: 1,
      product_id: 10,
      packaging_size: '1 Litre',
      units_per_box: 10,
      status: 'Materials Issued'
    });

    const completion = await Service.completePackagingRun(db, {
      order_id: 701,
      actual_bottles_packed: 100,
      packing_batch_no: 'LOT-QUARANTINE-CHECK'
    });

    // Check newly booked batch in stock_batches
    const packedBatch = db.tables.stock_batches.find(b => b.id === completion.stockBatchId);
    assert.ok(packedBatch, 'Batch must exist in stock_batches');
    assert.strictEqual(packedBatch.is_quarantine, true, 'MUST BE QUARANTINED');
    assert.strictEqual(packedBatch.qc_status, 'Pending', 'QC status must be Pending');
    assert.strictEqual(packedBatch.boxes_count, 10);
    assert.strictEqual(packedBatch.loose_count, 0);
  });

  await test('Sales FIFO deduction strictly EXCLUDES quarantined unapproved packed goods', async () => {
    const db = new MockDbClient();
    inventoryCore.Service.setDb(db);

    db.tables.inventory_items.push({
      id: 10,
      name: 'Chlorpyrifos 20% EC 1L Bottle',
      stock: 50,
      unit: 'Bottles'
    });

    // Batch A: 50 bottles, Approved, saleable
    db.tables.stock_batches.push({
      id: 1,
      company_id: 1,
      item_id: 10,
      item_type: 'Inventory',
      batch_no: 'LOT-APPROVED-SALEABLE',
      current_qty: 50,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    // Batch B: 200 bottles, newly packed in QUARANTINE
    db.tables.stock_batches.push({
      id: 2,
      company_id: 1,
      item_id: 10,
      item_type: 'Inventory',
      batch_no: 'LOT-IN-QUARANTINE',
      current_qty: 200,
      is_quarantine: true,
      qc_status: 'Pending'
    });

    // Attempt to deduct 75 bottles for sales order
    // Saleable stock is only 50 (Batch B cannot be touched!)
    // Must throw INSUFFICIENT_STOCK
    await assert.rejects(
      async () => {
        await inventoryCore.Service.deductStockFIFO({
          itemId: 10,
          quantity: 75,
          movementType: 'DISPATCH',
          referenceType: 'SALES_ORDER',
          referenceId: 'SO-101'
        });
      },
      /INSUFFICIENT_STOCK/
    );

    // Verify Batch B was NOT deducted
    const b2 = db.tables.stock_batches.find(b => b.id === 2);
    assert.strictEqual(b2.current_qty, 200, 'Quarantined batch must be untouched');
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 8] QC Inspection: Approval vs Rejection Workflows');
  // --------------------------------------------------------------------------
  await test('QC Approval releases packed batch from quarantine into saleable inventory', async () => {
    const db = new MockDbClient();
    db.tables.stock_batches.push({
      id: 88,
      company_id: 1,
      batch_no: 'LOT-QC-TEST',
      current_qty: 205,
      boxes_count: 20,
      loose_count: 5,
      is_quarantine: true,
      qc_status: 'Pending'
    });

    db.tables.packaging_orders.push({
      id: 801,
      packed_stock_batch_id: 88,
      units_per_box: 10,
      actual_boxes_packed: 20,
      actual_loose_packed: 5,
      qc_status: 'Pending'
    });

    const qcRes = await Service.updatePackagingQcStatus(db, {
      orderId: 801,
      qcStatus: 'Approved',
      qcInspectedBy: 'QC Officer Dr. Mehta',
      qcNotes: 'All leak tests passed, seal and label integrity verified.'
    });

    assert.strictEqual(qcRes.qcStatus, 'Approved');
    assert.strictEqual(qcRes.isQuarantine, false);

    const releasedBatch = db.tables.stock_batches.find(b => b.id === 88);
    assert.strictEqual(releasedBatch.is_quarantine, false, 'Batch must now be unquarantined');
    assert.strictEqual(releasedBatch.qc_status, 'Approved');
  });

  await test('QC Rejection retains packed batch permanently in quarantine', async () => {
    const db = new MockDbClient();
    db.tables.stock_batches.push({
      id: 89,
      company_id: 1,
      batch_no: 'LOT-FAIL-TEST',
      current_qty: 100,
      is_quarantine: true,
      qc_status: 'Pending'
    });

    db.tables.packaging_orders.push({
      id: 802,
      packed_stock_batch_id: 89,
      qc_status: 'Pending'
    });

    const qcRes = await Service.updatePackagingQcStatus(db, {
      orderId: 802,
      qcStatus: 'Rejected',
      qcInspectedBy: 'QC Officer Dr. Mehta',
      qcNotes: 'Cap torque failure; container leaking.'
    });

    assert.strictEqual(qcRes.qcStatus, 'Rejected');
    assert.strictEqual(qcRes.isQuarantine, true);

    const rejectedBatch = db.tables.stock_batches.find(b => b.id === 89);
    assert.strictEqual(rejectedBatch.is_quarantine, true, 'Must remain in quarantine');
    assert.strictEqual(rejectedBatch.qc_status, 'Rejected');
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 9] Partial Packing Runs & Remaining Bulk Tracking');
  // --------------------------------------------------------------------------
  await test('Partial bottling run leaves unbottled bulk chemical available for subsequent runs', async () => {
    const db = new MockDbClient();
    // Bulk tank has 1,000 Litres
    db.tables.stock_batches.push({
      id: 999,
      company_id: 1,
      batch_no: 'CHLOR-REACTOR-01',
      current_qty: 1000,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    // Run 1: Pack 250 Litres into 250 bottles of 1 Litre
    db.tables.product_packaging.push({
      id: 1,
      product_id: 1,
      packaging_size: '1 Litre',
      units_per_box: 10
    });

    db.tables.packaging_orders.push({
      id: 901,
      order_no: 'PKG-RUN-PARTIAL-1',
      packaging_id: 1,
      product_id: 1,
      packaging_size: '1 Litre',
      bulk_batch_id: 999,
      units_per_box: 10,
      status: 'Materials Issued'
    });

    const run1 = await Service.completePackagingRun(db, {
      order_id: 901,
      actual_bottles_packed: 250
    });

    assert.strictEqual(run1.remainingBulkQty, 750);
    const bulkAfterRun1 = db.tables.stock_batches.find(b => b.id === 999);
    assert.strictEqual(bulkAfterRun1.current_qty, 750);

    // Run 2: Pack 500 Litres into 1,000 bottles of 500 ml from the SAME bulk batch!
    db.tables.product_packaging.push({
      id: 2,
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 20
    });

    db.tables.packaging_orders.push({
      id: 902,
      order_no: 'PKG-RUN-PARTIAL-2',
      packaging_id: 2,
      product_id: 1,
      packaging_size: '500 ml',
      bulk_batch_id: 999,
      units_per_box: 20,
      status: 'Materials Issued'
    });

    const run2 = await Service.completePackagingRun(db, {
      order_id: 902,
      actual_bottles_packed: 1000
    });

    // 1000 bottles of 500 ml = 500 Litres consumed
    assert.strictEqual(run2.actualBulkConsumed, 500);
    // Remaining in reactor: 750 - 500 = 250 Litres
    assert.strictEqual(run2.remainingBulkQty, 250);
    const bulkAfterRun2 = db.tables.stock_batches.find(b => b.id === 999);
    assert.strictEqual(bulkAfterRun2.current_qty, 250);
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 10] Bidirectional Traceability: Bulk <-> Packaging <-> Finished Goods');
  // --------------------------------------------------------------------------
  await test('Full Traceability: Given packed lot LOT-GENEALOGY-01, traces bulk reactor and packaging components', async () => {
    const db = new MockDbClient();

    // Stage 1 (Bulk Synthesis Order from Phase 4)
    db.tables.production_orders.push({
      id: 4001,
      order_no: 'PO-CHLOR-BULK-01',
      formulation_version: 2,
      actual_output_qty: 1000,
      yield_pct: 99.5
    });

    db.tables.stock_batches.push({
      id: 555,
      batch_no: 'BULK-REACTOR-555',
      order_id: 4001,
      current_qty: 800,
      qc_status: 'Approved'
    });

    // Stage 2 (Bottling Run)
    db.tables.packaging_orders.push({
      id: 9001,
      order_no: 'PKG-2026-FINAL',
      packing_batch_no: 'LOT-GENEALOGY-01',
      product_id: 1,
      packaging_size: '500 ml',
      units_per_box: 10,
      actual_bottles_packed: 205,
      actual_boxes_packed: 20,
      actual_loose_packed: 5,
      actual_bulk_consumed: 102.5,
      remaining_bulk_qty: 697.5,
      bulk_batch_id: 555,
      bulk_batch_no: 'BULK-REACTOR-555',
      qc_status: 'Approved',
      qc_inspected_by: 'Dr. Mehta',
      qc_notes: 'Passed all chemical and physical assays',
      packed_by: 'Operator Mahesh',
      verified_by: 'Supervisor Dave'
    });

    db.tables.packaging_materials_consumed.push(
      { packaging_order_id: 9001, material_name: '500ml HDPE Bottle', actual_consumed: 205, unit: 'Nos' },
      { packaging_order_id: 9001, material_name: 'Induction Cap', actual_consumed: 205, unit: 'Nos' },
      { packaging_order_id: 9001, material_name: 'Printed Label', actual_consumed: 205, unit: 'Nos' },
      { packaging_order_id: 9001, material_name: 'Corrugated Box', actual_consumed: 20, unit: 'Nos' }
    );

    const trace = await Service.getPackagingTraceability(db, { packingBatchNo: 'LOT-GENEALOGY-01' });

    assert.strictEqual(trace.finishedGoods.packing_batch_no, 'LOT-GENEALOGY-01');
    assert.strictEqual(trace.finishedGoods.boxes_packed, 20);
    assert.strictEqual(trace.finishedGoods.loose_packed, 5);
    assert.strictEqual(trace.finishedGoods.total_bottles, 205);
    assert.strictEqual(trace.finishedGoods.qc_status, 'Approved');

    assert.strictEqual(trace.bottlingRun.packed_by, 'Operator Mahesh');
    assert.strictEqual(trace.bulkOrigin.bulk_batch_no, 'BULK-REACTOR-555');
    assert.strictEqual(trace.bulkOrigin.bulk_consumed_litres, 102.5);
    assert.strictEqual(trace.bulkOrigin.production_order.order_no, 'PO-CHLOR-BULK-01');
    assert.strictEqual(trace.bulkOrigin.production_order.recipe_version, 2);
    assert.strictEqual(trace.packagingMaterials.length, 4);
  });

  console.log('\n=============================================================');
  console.log(` SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPackagingTests().catch(err => {
  console.error('Fatal error in packaging test runner:', err);
  process.exit(1);
});
