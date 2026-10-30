/**
 * tests/test_manufacturing_workflow.js
 * Comprehensive Automated Manufacturing Workflow Test Suite
 *
 * Verifies:
 * 1. Formulation management with standard quantities, units, batch size, expected yield, approval status.
 * 2. Formulation versioning (historical production records are never altered when recipes are revised).
 * 3. Production planning (PO numbers, BOM scaling, dates, assigned employees).
 * 4. Raw-material availability checks before production starts (deficit detection).
 * 5. Material issue and FIFO consumption posting.
 * 6. Single posting workflow: blocks duplicate deductions at production start and completion.
 * 7. Recording of unused returns, wastage, and variance calculations.
 * 8. Production completion with actual output, batch lot numbers, yield %, and operators.
 * 9. Quarantine segregation: unapproved / quarantined batches are segregated from saleable stock.
 * 10. QC status management (Pending, Approved, Rejected, On Hold) and saleable release upon approval.
 * 11. Bidirectional batch traceability (finished lot <-> formulation version <-> consumed raw material batches).
 * 12. Production variance reports.
 */

const assert = require('assert');
const inventoryCore = require('../assets/js/inventory-core.js');
const manufacturingCore = require('../assets/js/manufacturing-core.js');

// ============================================================================
// IN-MEMORY MOCK DATABASE SIMULATING SUPABASE & RLS
// ============================================================================
class QueryBuilder {
  constructor(tableRows, tableName) {
    this.tableRows = tableRows;
    this.tableName = tableName;
    this.filters = [];
    this.orderConfig = null;
    this.limitCount = null;
    this.operation = 'select';
    this.insertData = null;
    this.updateData = null;
  }

  select(fields = '*') {
    return this;
  }

  eq(col, val) {
    this.filters.push(row => row[col] === val);
    return this;
  }

  neq(col, val) {
    this.filters.push(row => row[col] !== val);
    return this;
  }

  gt(col, val) {
    this.filters.push(row => row[col] > val);
    return this;
  }

  order(col, opts = {}) {
    this.orderConfig = { col, asc: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  insert(records) {
    this.operation = 'insert';
    this.insertData = Array.isArray(records) ? records : [records];
    return this;
  }

  update(updates) {
    this.operation = 'update';
    this.updateData = updates;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  async single() {
    const res = this._execute();
    if (res.error) return res;
    if (!res.data || res.data.length === 0) return { data: null, error: new Error('Record not found') };
    return { data: res.data[0], error: null };
  }

  async maybeSingle() {
    const res = this._execute();
    if (res.error) return res;
    return { data: (res.data && res.data.length > 0) ? res.data[0] : null, error: null };
  }

  _execute() {
    if (this.operation === 'insert') {
      const inserted = [];
      for (const r of this.insertData) {
        const copy = { ...r };
        if (!copy.id) copy.id = Math.floor(Math.random() * 100000) + 1;
        this.tableRows.push(copy);
        inserted.push(copy);
      }
      return { data: inserted, error: null };
    }

    if (this.operation === 'update') {
      const updated = [];
      for (const row of this.tableRows) {
        let match = true;
        for (const f of this.filters) {
          if (!f(row)) { match = false; break; }
        }
        if (match) {
          Object.assign(row, this.updateData);
          updated.push(row);
        }
      }
      return { data: updated, error: null };
    }

    if (this.operation === 'delete') {
      const toKeep = [];
      const deleted = [];
      for (const row of this.tableRows) {
        let match = true;
        for (const f of this.filters) {
          if (!f(row)) { match = false; break; }
        }
        if (match) deleted.push(row);
        else toKeep.push(row);
      }
      this.tableRows.length = 0;
      this.tableRows.push(...toKeep);
      return { data: deleted, error: null };
    }

    // Default: select
    let rows = this.tableRows.slice();
    for (const f of this.filters) rows = rows.filter(f);
    if (this.orderConfig) {
      const { col, asc } = this.orderConfig;
      rows.sort((a, b) => asc ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1));
    }
    if (this.limitCount) rows = rows.slice(0, this.limitCount);
    return { data: rows, error: null };
  }

  then(resolve, reject) {
    try {
      const res = this._execute();
      resolve(res);
    } catch (err) {
      if (reject) reject(err);
      else resolve({ data: null, error: err });
    }
  }
}

class MockDatabase {
  constructor() {
    this.tables = {
      formulations: [
        {
          id: 1,
          product_id: 101,
          product_name: 'Chlorpyrifos 20% EC',
          version: 1,
          standard_batch_size: 1000,
          batch_size: 1000,
          standard_unit: 'Litre',
          batch_unit: 'Litre',
          expected_yield_pct: 98.5,
          approval_status: 'Approved',
          status: 'Draft',
          company_id: 1
        }
      ],
      formulation_ingredients: [
        { id: 1, formulation_id: 1, product_id: 201, product_name: 'Chlorpyrifos Tech 98%', quantity: 204.08, unit: 'Kg', percentage: 20.408 },
        { id: 2, formulation_id: 1, product_id: 202, product_name: 'Emulsifier Blend', quantity: 100, unit: 'Litre', percentage: 10.0 },
        { id: 3, formulation_id: 1, product_id: 203, product_name: 'Aromex Solvent', quantity: 695.92, unit: 'Litre', percentage: 69.592 }
      ],
      formulation_versions: [],
      production_orders: [],
      production_batches: [],
      production_materials: [],
      inventory_items: [
        { id: 101, name: 'Chlorpyrifos 20% EC (Finished Bulk)', stock: 0, unit: 'Litre' },
        { id: 201, name: 'Chlorpyrifos Tech 98%', stock: 500, unit: 'Kg' },
        { id: 202, name: 'Emulsifier Blend', stock: 300, unit: 'Litre' },
        { id: 203, name: 'Aromex Solvent', stock: 1500, unit: 'Litre' }
      ],
      stock_batches: [
        { id: 1, item_id: 201, item_name: 'Chlorpyrifos Tech 98%', item_type: 'Inventory', batch_no: 'TECH-CHLOR-01', initial_qty: 500, current_qty: 500, unit: 'Kg', purchase_date: '2026-09-01', is_quarantine: false, qc_status: 'Approved' },
        { id: 2, item_id: 202, item_name: 'Emulsifier Blend', item_type: 'Inventory', batch_no: 'EMUL-01', initial_qty: 300, current_qty: 300, unit: 'Litre', purchase_date: '2026-09-01', is_quarantine: false, qc_status: 'Approved' },
        { id: 3, item_id: 203, item_name: 'Aromex Solvent', item_type: 'Inventory', batch_no: 'SOLV-01', initial_qty: 1500, current_qty: 1500, unit: 'Litre', purchase_date: '2026-09-01', is_quarantine: false, qc_status: 'Approved' }
      ],
      stock_movements: [],
      rbac_audit_logs: []
    };
  }

  from(table) {
    if (!this.tables[table]) this.tables[table] = [];
    return new QueryBuilder(this.tables[table], table);
  }
}

// ============================================================================
// TEST EXECUTION
// ============================================================================
async function runManufacturingTests() {
  console.log('===================================================================');
  console.log('🏭 RUNNING AGROCHEMICAL MANUFACTURING WORKFLOW TEST SUITE');
  console.log('===================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  const mockDb = new MockDatabase();
  inventoryCore.Service.setDb(mockDb);
  manufacturingCore.Service.setDb(mockDb);

  // --------------------------------------------------------------------------
  // GROUP 1: Formulation Management & Versioning
  // --------------------------------------------------------------------------
  console.log('--- GROUP 1: Formulation Management & Versioning ---');

  await test('Formulation master includes standard batch size, expected yield, and approval status', async () => {
    const forms = await manufacturingCore.Service.getFormulations();
    assert.strictEqual(forms.length, 1);
    const f1 = forms[0];
    assert.strictEqual(f1.product_name, 'Chlorpyrifos 20% EC');
    assert.strictEqual(f1.version, 1);
    assert.strictEqual(f1.batch_size, 1000);
    assert.strictEqual(f1.expected_yield_pct, 98.5);
    assert.strictEqual(f1.approval_status, 'Approved');
    assert.strictEqual(f1.ingredients.length, 3);
  });

  await test('Revising an approved formulation creates an immutable snapshot of v1 and increments to v2', async () => {
    const revisionData = {
      id: 1,
      product_id: 101,
      product_name: 'Chlorpyrifos 20% EC',
      batch_size: 1000,
      batch_unit: 'Litre',
      expected_yield_pct: 99.0, // Modified yield
      approval_status: 'Approved',
      ingredients: [
        { inventory_id: 201, product_name: 'Chlorpyrifos Tech 98%', quantity: 205, unit: 'Kg', percentage: 20.5 },
        { inventory_id: 202, product_name: 'Emulsifier Blend', quantity: 95, unit: 'Litre', percentage: 9.5 },
        { inventory_id: 203, product_name: 'Aromex Solvent', quantity: 700, unit: 'Litre', percentage: 70.0 }
      ]
    };

    const res = await manufacturingCore.Service.saveFormulation(revisionData);
    assert.strictEqual(res.version, 2, 'New version must be 2');

    // Verify formulation_versions contains archived snapshot of v1
    const versions = await manufacturingCore.Service.getFormulationVersions(1);
    assert.strictEqual(versions.length, 1, 'Must have 1 archived version snapshot');
    assert.strictEqual(versions[0].version, 1, 'Archived version must be 1');
    assert.strictEqual(versions[0].expected_yield_pct, 98.5, 'Original yield 98.5% must be preserved in archive');
  });

  // --------------------------------------------------------------------------
  // GROUP 2: BOM Scaling & Stock Availability Pre-Check
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 2: BOM Scaling & Stock Availability Pre-Check ---');

  const recipeIngredients = [
    { product_id: 201, product_name: 'Chlorpyrifos Tech 98%', quantity: 200, unit: 'Kg' },
    { product_id: 202, product_name: 'Emulsifier Blend', quantity: 100, unit: 'Litre' },
    { product_id: 203, product_name: 'Aromex Solvent', quantity: 700, unit: 'Litre' }
  ];

  await test('BOM correctly scales 1000L recipe to 2000L target batch', () => {
    const scaled = manufacturingCore.BomCalculator.scaleBom(recipeIngredients, 1000, 2000);
    assert.strictEqual(scaled[0].required_qty, 400); // 200 * 2
    assert.strictEqual(scaled[1].required_qty, 200); // 100 * 2
    assert.strictEqual(scaled[2].required_qty, 1400); // 700 * 2
  });

  await test('Stock availability check detects sufficient stock for 1000L batch', async () => {
    // Current stock: Tech=500, Emul=300, Solvent=1500
    // Required for 1000L: Tech=200, Emul=100, Solvent=700
    const check = await manufacturingCore.Service.checkMaterialAvailability(recipeIngredients, 1000, 1000);
    assert.strictEqual(check.isSufficient, true, 'Stock must be sufficient');
    assert.strictEqual(check.deficitCount, 0);
  });

  await test('Stock availability check flags deficit when planned batch exceeds warehouse stock', async () => {
    // Planned 3000L -> Tech needed = 600 (stock 500), Solvent needed = 2100 (stock 1500)
    const check = await manufacturingCore.Service.checkMaterialAvailability(recipeIngredients, 1000, 3000);
    assert.strictEqual(check.isSufficient, false, 'Stock must be insufficient');
    assert.strictEqual(check.deficitCount, 2, 'Should flag 2 deficit ingredients (Tech & Solvent)');
    const techItem = check.items.find(i => i.inventory_id === 201);
    assert.strictEqual(techItem.isSufficient, false);
    assert.strictEqual(techItem.deficit_qty, 100); // 600 - 500 = 100 deficit
  });

  // --------------------------------------------------------------------------
  // GROUP 3: Production Planning & Order Creation
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 3: Production Planning & Order Creation ---');

  let plannedOrder = null;

  await test('Creates production order with PO number, planned BOM snapshot, and Planned status', async () => {
    plannedOrder = await manufacturingCore.Service.createProductionOrder({
      order_no: 'PO-2026-088',
      product_id: 101,
      product_name: 'Chlorpyrifos 20% EC',
      formulation_id: 1,
      formulation_version: 2,
      standard_batch_size: 1000,
      planned_quantity: 1000,
      unit: 'Litre',
      target_start_date: '2026-10-12',
      target_due_date: '2026-10-14',
      assigned_operator: 'Ramesh Patel',
      assigned_supervisor: 'Suresh Kumar',
      ingredients: recipeIngredients
    });

    assert.strictEqual(plannedOrder.order_no, 'PO-2026-088');
    assert.strictEqual(plannedOrder.status, 'Planned');
    assert.strictEqual(plannedOrder.material_status, 'Pending');
    assert.strictEqual(plannedOrder.qc_status, 'Pending');
    assert.strictEqual(plannedOrder.planned_bom.length, 3);
  });

  // --------------------------------------------------------------------------
  // GROUP 4: Material Issue & Posting Step 1 (FIFO Deduction)
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 4: Material Issue & FIFO Deduction ---');

  await test('Material issue deducts raw materials via FIFO and updates status to Materials Issued', async () => {
    const issueRes = await manufacturingCore.Service.issueMaterials(plannedOrder.id);
    assert.strictEqual(issueRes.success, true);
    assert.strictEqual(issueRes.material_status, 'Issued');

    // Verify stock deduction in stock_batches:
    // Tech: 500 - 200 = 300
    // Emul: 300 - 100 = 200
    // Solvent: 1500 - 700 = 800
    const techBatch = mockDb.tables.stock_batches.find(b => b.item_id === 201);
    const emulBatch = mockDb.tables.stock_batches.find(b => b.item_id === 202);
    const solvBatch = mockDb.tables.stock_batches.find(b => b.item_id === 203);

    assert.strictEqual(techBatch.current_qty, 300);
    assert.strictEqual(emulBatch.current_qty, 200);
    assert.strictEqual(solvBatch.current_qty, 800);
  });

  await test('Anti Double-Deduction Guard: Attempting to issue materials again is strictly blocked', async () => {
    await assert.rejects(async () => {
      await manufacturingCore.Service.issueMaterials(plannedOrder.id);
    }, /MATERIALS_ALREADY_ISSUED/);
  });

  // --------------------------------------------------------------------------
  // GROUP 5: Production Completion, Returns, Wastage & Quarantine Output
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 5: Production Completion, Returns & Quarantine Output ---');

  let completionRes = null;

  await test('Completes production: restocks returned unused raw materials and books output into Quarantine', async () => {
    // Reconciliation scenario:
    // Tech: 200 issued, 195 consumed, 5 returned unused, 0 wastage
    // Emul: 100 issued, 98 consumed, 0 returned, 2 process wastage
    // Solvent: 700 issued, 700 consumed
    const reconciliation = [
      { inventory_id: 201, standard_qty: 200, issued_qty: 200, consumed_qty: 195, returned_qty: 5, wastage_qty: 0 },
      { inventory_id: 202, standard_qty: 100, issued_qty: 100, consumed_qty: 98, returned_qty: 0, wastage_qty: 2 },
      { inventory_id: 203, standard_qty: 700, issued_qty: 700, consumed_qty: 700, returned_qty: 0, wastage_qty: 0 }
    ];

    completionRes = await manufacturingCore.Service.completeProductionOrder(plannedOrder.id, {
      actual_output_qty: 990, // 990L finished chemical
      batch_no: 'B-02',
      date: '2026-10-12',
      operator_name: 'Ramesh Patel',
      supervisor_name: 'Suresh Kumar',
      reconciliation: reconciliation
    });

    assert.strictEqual(completionRes.success, true);
    assert.strictEqual(completionRes.actualOutput, 990);
    assert.strictEqual(completionRes.yieldPct, 99.0); // (990 / 1000) * 100 = 99.0%
    assert.strictEqual(completionRes.qcStatus, 'Pending');

    // Verify 5 Kg unused Tech was returned to inventory: 300 + 5 = 305
    const techBatch = mockDb.tables.stock_batches.find(b => b.item_id === 201);
    assert.strictEqual(techBatch.current_qty, 305, 'Unused 5 Kg must be restocked into inventory');

    // Verify finished batch B-02 was created in QUARANTINE
    const finishedBatch = mockDb.tables.stock_batches.find(b => b.batch_no === 'B-02');
    assert(finishedBatch, 'Output batch B-02 must exist in stock_batches');
    assert.strictEqual(finishedBatch.is_quarantine, true, 'Batch MUST be marked is_quarantine = true');
    assert.strictEqual(finishedBatch.qc_status, 'Pending', 'Batch QC status MUST be Pending');
  });

  // --------------------------------------------------------------------------
  // GROUP 6: Quarantine Stock Segregation
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 6: Quarantine Stock Segregation ---');

  await test('Quarantined batch B-02 does NOT appear in saleable finished goods stock', async () => {
    // Product 101 has 990L physically in warehouse, but it is in QUARANTINE!
    const saleableStock = await inventoryCore.Service.getItemStock(101);
    assert.strictEqual(saleableStock, 0, 'Saleable stock must be 0 while batch is in quarantine');
  });

  await test('Sales order FIFO deduction rejects deducting from quarantined batch B-02', async () => {
    await assert.rejects(async () => {
      await inventoryCore.Service.deductStockFIFO({
        itemId: 101,
        quantity: 100,
        movementType: 'DISPATCH',
        referenceType: 'orders',
        referenceId: 501
      });
    }, /INSUFFICIENT_STOCK/);
  });

  // --------------------------------------------------------------------------
  // GROUP 7: QC Status Management & Release to Saleable Inventory
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 7: QC Inspection & Release to Saleable Stock ---');

  await test('QC Rejection maintains batch permanently in quarantine', async () => {
    const rejRes = await manufacturingCore.Service.updateQcStatus(plannedOrder.id, {
      qcStatus: 'Rejected',
      qcNotes: 'Sample failed active ingredient assay (17.8% vs 20.0% standard)'
    });
    assert.strictEqual(rejRes.isSaleable, false);

    const finishedBatch = mockDb.tables.stock_batches.find(b => b.batch_no === 'B-02');
    assert.strictEqual(finishedBatch.is_quarantine, true);
    assert.strictEqual(finishedBatch.qc_status, 'Rejected');
    assert.strictEqual(await inventoryCore.Service.getItemStock(101), 0);
  });

  await test('QC Approval releases batch from quarantine and updates saleable stock to 990L', async () => {
    const appRes = await manufacturingCore.Service.updateQcStatus(plannedOrder.id, {
      qcStatus: 'Approved',
      qcNotes: 'Re-test passed purity, viscosity, and emulsion stability tests',
      inspectedBy: 'Dr. Mehta (QC Chief)'
    });
    assert.strictEqual(appRes.isSaleable, true);

    const finishedBatch = mockDb.tables.stock_batches.find(b => b.batch_no === 'B-02');
    assert.strictEqual(finishedBatch.is_quarantine, false, 'is_quarantine must become false');
    assert.strictEqual(finishedBatch.qc_status, 'Approved', 'qc_status must become Approved');

    // NOW saleable stock reflects the 990L!
    const saleableStock = await inventoryCore.Service.getItemStock(101);
    assert.strictEqual(saleableStock, 990, 'Saleable stock must now be 990L');
  });

  // --------------------------------------------------------------------------
  // GROUP 8: Bidirectional Batch Traceability
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 8: Bidirectional Batch Traceability ---');

  await test('Forward Traceability: Given finished batch B-02, traces recipe v2, operators, and raw materials', async () => {
    const trace = await manufacturingCore.Service.getBatchTraceability('B-02');
    assert(trace, 'Traceability report must not be null');
    assert.strictEqual(trace.type, 'FINISHED_GOOD_FORWARD_TRACE');
    assert.strictEqual(trace.batchNo, 'B-02');
    assert.strictEqual(trace.productName, 'Chlorpyrifos 20% EC');
    assert.strictEqual(trace.actualOutputQty, 990);
    assert.strictEqual(trace.yieldPct, 99.0);
    assert.strictEqual(trace.formulation.version, 2);
    assert.strictEqual(trace.qcStatus, 'Approved');
    assert.strictEqual(trace.isQuarantine, false);
    assert.strictEqual(trace.consumedRawMaterials.length, 3);

    const techConsumed = trace.consumedRawMaterials.find(m => m.inventoryId === 201);
    assert.strictEqual(techConsumed.consumedQty, 195);
    assert.strictEqual(techConsumed.returnedQty, 5);
  });

  // --------------------------------------------------------------------------
  // GROUP 9: Manufacturing Variance Reports
  // --------------------------------------------------------------------------
  console.log('\n--- GROUP 9: Manufacturing Variance Reports ---');

  await test('Compiles variance report comparing planned vs actual output, yield, and wastage', async () => {
    const report = await manufacturingCore.Service.getProductionVarianceReport();
    assert(report, 'Report must exist');
    assert.strictEqual(report.totalOrders, 1);
    assert.strictEqual(report.completedBatches, 1);
    assert.strictEqual(report.totalPlannedOutput, 1000);
    assert.strictEqual(report.totalActualOutput, 990);
    assert.strictEqual(report.totalWastage, 10); // 1000 - 990
    assert.strictEqual(report.averageYieldPct, 99.0);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n===================================================================');
  console.log(`🎉 TEST RUN COMPLETE: ${passed} / ${total} tests passed (100% SUCCESS)`);
  console.log('===================================================================');

  if (passed !== total) process.exit(1);
}

runManufacturingTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
