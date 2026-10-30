/**
 * tests/test_dispatch_workflow.js
 * Comprehensive Automated Test Suite for Godown Verification and Dispatch Workflow
 *
 * Verifies:
 * 1. Box and loose calculation mathematics across variable SKU packaging configs.
 * 2. Pre-dispatch validation: blocks quarantined, unapproved, or missing stock batches.
 * 3. Shortage detection: blocks dispatches exceeding warehouse batch quantity.
 * 4. Over-dispatch prevention: blocks dispatches exceeding ordered remaining balance.
 * 5. Godown operator packing verification workflow (Pending Verification -> Verified).
 * 6. Manager dispatch authorization (Verified -> Approved).
 * 7. Single-posting physical stock deduction: stock deducted EXACTLY ONCE at gate exit.
 * 8. Anti double-deduction guard: blocks repeated execution and duplicate stock hits.
 * 9. Partial dispatch status integrity: partially dispatched orders are NEVER marked fully dispatched.
 * 10. Multi-phase completion: final partial dispatch accurately transitions order to Fully Dispatched / Completed.
 * 11. Zero double-deduction on Invoice generation: commercial invoice links to dispatch with is_stock_deducted: false.
 * 12. Safe cancellation, return & inventory reversal: accurately restores batch inventory and remaining order quantities.
 * 13. Idempotency guard: duplicate submission protection.
 */

const assert = require('assert');
const dispatchCore = require('../assets/js/dispatch-core.js');

const { DispatchCalculator, StockGuard, Service } = dispatchCore;

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
      orders: [],
      order_items: [],
      order_dispatches: [],
      dispatch_items: [],
      dispatch_reversals: [],
      stock_batches: [],
      stock_movements: [],
      invoices: []
    };
    this._nextId = 5000;
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
// TEST SUITE EXECUTION
// ============================================================================
async function runDispatchWorkflowTests() {
  console.log('====================================================================');
  console.log('  STARTING GODOWN VERIFICATION & DISPATCH WORKFLOW TEST SUITE');
  console.log('====================================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(testName, fn) {
    try {
      fn();
      console.log(`[PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${testName}`);
      console.error(`       Error: ${err.message}`);
      failed++;
    }
  }

  async function runAsyncTest(testName, fn) {
    try {
      await fn();
      console.log(`[PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${testName}`);
      console.error(`       Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Box and Loose Mathematics Breakdown
  // --------------------------------------------------------------------------
  runTest('Test 1: Box and loose calculation (205 units @ 10/box = 20 boxes + 5 loose)', () => {
    const res1 = DispatchCalculator.breakdownBoxesAndLoose(205, 10);
    assert.strictEqual(res1.boxes, 20);
    assert.strictEqual(res1.loose, 5);
    assert.strictEqual(res1.totalUnits, 205);

    // Custom SKU box size: 24 units/box, 50 units = 2 boxes + 2 loose
    const res2 = DispatchCalculator.breakdownBoxesAndLoose(50, 24);
    assert.strictEqual(res2.boxes, 2);
    assert.strictEqual(res2.loose, 2);

    // Exact multiple: 100 units @ 10/box = 10 boxes + 0 loose
    const res3 = DispatchCalculator.breakdownBoxesAndLoose(100, 10);
    assert.strictEqual(res3.boxes, 10);
    assert.strictEqual(res3.loose, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Remaining Quantities Breakdown & Over-Dispatch Blocking
  // --------------------------------------------------------------------------
  runTest('Test 2: Remaining quantity calculation & over-dispatch guard', () => {
    // 500 ordered, 0 previous, 300 new dispatch
    const calc = DispatchCalculator.calculateRemainingQuantities(500, 0, 300, 10);
    assert.strictEqual(calc.orderedUnits, 500);
    assert.strictEqual(calc.previouslyDispatched, 0);
    assert.strictEqual(calc.newDispatchUnits, 300);
    assert.strictEqual(calc.totalDispatchedUnits, 300);
    assert.strictEqual(calc.remainingUnits, 200);
    assert.strictEqual(calc.isPartiallyDispatched, true);
    assert.strictEqual(calc.isFullyDispatched, false);
    assert.strictEqual(calc.currentDispatch.boxes, 30);
    assert.strictEqual(calc.remainingBreakdown.boxes, 20);

    // Over-dispatch attempt: trying to dispatch 205 when only 200 remain
    assert.throws(() => {
      DispatchCalculator.calculateRemainingQuantities(500, 300, 205, 10);
    }, /DISPATCH_EXCEEDS_ORDERED_QUANTITY/);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Quarantine & Unapproved Batch Guard
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 3: StockGuard blocks quarantined or unapproved batches from dispatch', async () => {
    const client = new MockDbClient();

    // Batch 1: In Quarantine (is_quarantine: true, qc_status: 'Pending')
    client.tables.stock_batches.push({
      id: 101,
      batch_no: 'BATCH-QUARANTINE-01',
      current_qty: 500,
      is_quarantine: true,
      qc_status: 'Pending'
    });

    // Batch 2: QC Rejected (qc_status: 'Rejected')
    client.tables.stock_batches.push({
      id: 102,
      batch_no: 'BATCH-REJECTED-02',
      current_qty: 300,
      is_quarantine: false,
      qc_status: 'Rejected'
    });

    // Batch 3: Approved (qc_status: 'Approved')
    client.tables.stock_batches.push({
      id: 103,
      batch_no: 'BATCH-APPROVED-03',
      current_qty: 400,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    // 1. Quarantined batch must throw
    await assert.rejects(
      async () => {
        await StockGuard.validateBatchForDispatch(client, { batchId: 101, requestedUnits: 50 });
      },
      /UNAPPROVED_STOCK_CANNOT_BE_DISPATCHED/
    );

    // 2. Rejected batch must throw
    await assert.rejects(
      async () => {
        await StockGuard.validateBatchForDispatch(client, { batchId: 102, requestedUnits: 50 });
      },
      /UNAPPROVED_STOCK_CANNOT_BE_DISPATCHED/
    );

    // 3. Approved batch must succeed
    const validRes = await StockGuard.validateBatchForDispatch(client, { batchId: 103, requestedUnits: 50 });
    assert.strictEqual(validRes.valid, true);
    assert.strictEqual(validRes.availableUnits, 400);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Warehouse Physical Batch Shortage Detection
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 4: StockGuard blocks requests exceeding available batch balance', async () => {
    const client = new MockDbClient();
    client.tables.stock_batches.push({
      id: 104,
      batch_no: 'BATCH-SHORT-04',
      current_qty: 40,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    await assert.rejects(
      async () => {
        await StockGuard.validateBatchForDispatch(client, { batchId: 104, requestedUnits: 50 });
      },
      /INSUFFICIENT_STOCK_FOR_DISPATCH/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Prepare Commercial Dispatch Slip (Initial Status = Pending Verification)
  // --------------------------------------------------------------------------
  let testOrderId = 1;
  let testDispatchId = null;
  let sharedClient = new MockDbClient();

  await runAsyncTest('Test 5: Prepare commercial dispatch slip with boxes/loose breakdown', async () => {
    // Setup Order & Item
    sharedClient.tables.orders.push({
      id: testOrderId,
      order_no: 'SO-2026-001',
      client_id: 10,
      client_name: 'Gujarat Agro Traders',
      company_id: 1,
      warehouse_id: 1,
      status: 'Confirmed',
      dispatch_status: 'Pending Dispatch'
    });

    sharedClient.tables.order_items.push({
      id: 201,
      order_id: testOrderId,
      product_id: 50,
      product_name: 'Chlorpyrifos 20% EC',
      packing_size: '1 Litre',
      bottles_per_box: 10,
      ordered_units: 500,
      dispatched_units: 0,
      remaining_units: 500,
      unit_price: 350
    });

    // Approved Stock Batch
    sharedClient.tables.stock_batches.push({
      id: 301,
      batch_no: 'CP-BATCH-001',
      product_id: 50,
      current_qty: 600,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    const prep = await Service.prepareDispatch(sharedClient, {
      order_id: testOrderId,
      dispatch_no: 'DSP-0001',
      warehouse_id: 1,
      items: [
        {
          order_item_id: 201,
          stock_batch_id: 301,
          batch_no: 'CP-BATCH-001',
          total_units_dispatched: 300, // 30 boxes
          units_per_box: 10
        }
      ]
    });

    assert.strictEqual(prep.success, true);
    assert.strictEqual(prep.dispatch.status, 'Pending Verification');
    assert.strictEqual(prep.dispatch.stock_deducted, false);
    assert.strictEqual(prep.totalBoxes, 30);
    assert.strictEqual(prep.totalLoose, 0);
    assert.strictEqual(prep.totalUnits, 300);

    testDispatchId = prep.dispatch.id;

    // Verify order dispatch status updated
    const order = sharedClient.tables.orders.find(o => o.id === testOrderId);
    assert.strictEqual(order.dispatch_status, 'Pending Verification');

    // Verify dispatch line item stored
    const dispItems = sharedClient.tables.dispatch_items.filter(di => di.dispatch_id === testDispatchId);
    assert.strictEqual(dispItems.length, 1);
    assert.strictEqual(dispItems[0].boxes_dispatched, 30);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Godown Operator Packing Verification
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 6: Godown operator verifies packing completion & physical seals', async () => {
    const res = await Service.verifyPacking(sharedClient, {
      dispatchId: testDispatchId,
      verifiedBy: 'Ramesh Patel (Godown Operator)',
      verificationNotes: '30 Corrugated Boxes inspected, batch seal intact.'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'Verified');

    const disp = sharedClient.tables.order_dispatches.find(d => d.id === testDispatchId);
    assert.strictEqual(disp.status, 'Verified');
    assert.strictEqual(disp.verified_by, 'Ramesh Patel (Godown Operator)');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Dispatch Manager Approval Workflow
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 7: Manager authorizes verified dispatch for commercial gate exit', async () => {
    const res = await Service.approveDispatch(sharedClient, {
      dispatchId: testDispatchId,
      approvedBy: 'Suresh Shah (Dispatch Manager)',
      approvalNotes: 'Commercial documents and customer credit cleared.'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'Approved');

    const disp = sharedClient.tables.order_dispatches.find(d => d.id === testDispatchId);
    assert.strictEqual(disp.status, 'Approved');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Single-Posting Physical Stock Deduction & Partial Dispatch Status
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 8: Execute gate exit: physical stock deducted EXACTLY ONCE, order marked Partially Dispatched', async () => {
    const initialBatch = sharedClient.tables.stock_batches.find(b => b.id === 301);
    const initialQty = initialBatch.current_qty; // 600

    const exec = await Service.executeDispatch(sharedClient, {
      dispatchId: testDispatchId,
      dispatchedBy: 'Mahesh (Gate Officer)',
      vehicleNo: 'GJ-01-AB-1234',
      transporter_name: 'Shreeji Logistics',
      ewayBillNo: 'EWB-2026-99988'
    });

    assert.strictEqual(exec.success, true);
    assert.strictEqual(exec.stockDeducted, true);
    assert.strictEqual(exec.orderDispatchStatus, 'Partially Dispatched');
    assert.strictEqual(exec.orderStatus, 'Partially Dispatched');
    assert.strictEqual(exec.totalDispatchedUnits, 300);
    assert.strictEqual(exec.totalRemainingUnits, 200);

    // Verify Physical Inventory in stock_batches deducted EXACTLY 300 units
    const updatedBatch = sharedClient.tables.stock_batches.find(b => b.id === 301);
    assert.strictEqual(updatedBatch.current_qty, initialQty - 300); // 300 remaining

    // Verify stock_movements ledger entry
    const movements = sharedClient.tables.stock_movements.filter(m => m.reference_id === String(testDispatchId));
    assert.strictEqual(movements.length, 1);
    assert.strictEqual(movements[0].movement_type, 'DISPATCH');
    assert.strictEqual(movements[0].quantity, -300);

    // Verify order item updated
    const oi = sharedClient.tables.order_items.find(i => i.id === 201);
    assert.strictEqual(oi.dispatched_units, 300);
    assert.strictEqual(oi.remaining_units, 200);
    assert.strictEqual(oi.dispatched_boxes, 30);
    assert.strictEqual(oi.remaining_boxes, 20);

    // CRITICAL: Order must NEVER be marked Fully Dispatched when 200 units remain!
    const order = sharedClient.tables.orders.find(o => o.id === testOrderId);
    assert.strictEqual(order.dispatch_status, 'Partially Dispatched');
    assert.strictEqual(order.status, 'Partially Dispatched');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Anti Double-Deduction Guard (Duplicate Execution Prevention)
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 9: Anti double-deduction guard blocks duplicate execution of same dispatch', async () => {
    await assert.rejects(
      async () => {
        // Attempt executing same dispatch a second time
        await Service.executeDispatch(sharedClient, {
          dispatchId: testDispatchId,
          dispatchedBy: 'Gate Officer'
        });
      },
      /ALREADY_DEDUCTED_DUPLICATE_PREVENTED/
    );

    // Stock batch balance must remain unchanged at 300
    const batch = sharedClient.tables.stock_batches.find(b => b.id === 301);
    assert.strictEqual(batch.current_qty, 300);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Subsequent Partial Dispatch Transitions Order to Fully Dispatched
  // --------------------------------------------------------------------------
  let secondDispatchId = null;
  await runAsyncTest('Test 10: Subsequent dispatch of remaining 200 units transitions order to Fully Dispatched', async () => {
    // 1. Prepare second dispatch for remaining 200 units
    const prep2 = await Service.prepareDispatch(sharedClient, {
      order_id: testOrderId,
      dispatch_no: 'DSP-0002',
      warehouse_id: 1,
      items: [
        {
          order_item_id: 201,
          stock_batch_id: 301,
          batch_no: 'CP-BATCH-001',
          total_units_dispatched: 200, // Remaining 200
          units_per_box: 10
        }
      ]
    });
    secondDispatchId = prep2.dispatch.id;

    // 2. Verify
    await Service.verifyPacking(sharedClient, { dispatchId: secondDispatchId, verifiedBy: 'Godown Operator' });

    // 3. Approve
    await Service.approveDispatch(sharedClient, { dispatchId: secondDispatchId, approvedBy: 'Manager' });

    // 4. Execute gate pass
    const exec2 = await Service.executeDispatch(sharedClient, {
      dispatchId: secondDispatchId,
      dispatchedBy: 'Gate Officer'
    });

    assert.strictEqual(exec2.orderDispatchStatus, 'Fully Dispatched');
    assert.strictEqual(exec2.orderStatus, 'Completed');
    assert.strictEqual(exec2.totalDispatchedUnits, 500);
    assert.strictEqual(exec2.totalRemainingUnits, 0);

    // Stock batch has deducted another 200 units (100 remaining)
    const batch = sharedClient.tables.stock_batches.find(b => b.id === 301);
    assert.strictEqual(batch.current_qty, 100);

    // Order item remaining is 0
    const oi = sharedClient.tables.order_items.find(i => i.id === 201);
    assert.strictEqual(oi.remaining_units, 0);
    assert.strictEqual(oi.dispatched_units, 500);

    // Order is completed
    const order = sharedClient.tables.orders.find(o => o.id === testOrderId);
    assert.strictEqual(order.dispatch_status, 'Fully Dispatched');
    assert.strictEqual(order.status, 'Completed');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Zero Double-Deduction Invoice Generation
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 11: Commercial invoice generation maintains ZERO double-deduction (is_stock_deducted: false)', async () => {
    const batchBefore = sharedClient.tables.stock_batches.find(b => b.id === 301).current_qty;

    const invRes = await Service.generateInvoiceForDispatch(sharedClient, {
      dispatchId: testDispatchId,
      invoiceNo: 'INV-2026-8801',
      createdBy: 'Pooja (Accountant)'
    });

    assert.strictEqual(invRes.success, true);
    assert.strictEqual(invRes.isStockDeducted, false);
    assert.strictEqual(invRes.invoice.is_stock_deducted, false);
    assert.strictEqual(invRes.invoice.dispatch_id, testDispatchId);

    // Verify physical stock batch in warehouse was NOT deducted again
    const batchAfter = sharedClient.tables.stock_batches.find(b => b.id === 301).current_qty;
    assert.strictEqual(batchAfter, batchBefore, 'Physical inventory was deducted by invoice! Must be ZERO double-deduction.');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Safe Dispatch Reversal & Inventory Restoration
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 12: Dispatch reversal restores exact batch inventory and reinstates order balance', async () => {
    // Reverse secondDispatch (which had 200 units)
    const batchBefore = sharedClient.tables.stock_batches.find(b => b.id === 301).current_qty; // 100

    const revRes = await Service.cancelOrReverseDispatch(sharedClient, {
      dispatchId: secondDispatchId,
      reversalType: 'CUSTOMER_RETURN',
      reason: 'Customer transport breakdown, goods returned to warehouse.',
      reversedBy: 'Godown Supervisor'
    });

    assert.strictEqual(revRes.success, true);
    assert.strictEqual(revRes.stockRestored, true);
    assert.strictEqual(revRes.orderDispatchStatus, 'Partially Dispatched');
    assert.strictEqual(revRes.orderStatus, 'Partially Dispatched');

    // Physical stock batch restored (+200 units -> back to 300)
    const batchAfter = sharedClient.tables.stock_batches.find(b => b.id === 301).current_qty;
    assert.strictEqual(batchAfter, batchBefore + 200);

    // Compensating stock movement logged
    const revMovement = sharedClient.tables.stock_movements.find(m => m.movement_type === 'DISPATCH_REVERSAL' && m.reference_id === String(secondDispatchId));
    assert.ok(revMovement);
    assert.strictEqual(revMovement.quantity, 200);

    // Order item remaining reinstated
    const oi = sharedClient.tables.order_items.find(i => i.id === 201);
    assert.strictEqual(oi.dispatched_units, 300);
    assert.strictEqual(oi.remaining_units, 200);

    // Order status reverted to Partially Dispatched
    const order = sharedClient.tables.orders.find(o => o.id === testOrderId);
    assert.strictEqual(order.dispatch_status, 'Partially Dispatched');
    assert.strictEqual(order.status, 'Partially Dispatched');
  });

  // --------------------------------------------------------------------------
  // TEST 13: Idempotency Protection
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 13: Idempotency key blocks duplicate dispatch slip creation on repeated clicks', async () => {
    const key = `IDEMP-${Date.now()}`;
    const prepA = await Service.prepareDispatch(sharedClient, {
      order_id: testOrderId,
      dispatch_no: 'DSP-IDEMP-01',
      idempotency_key: key,
      warehouse_id: 1,
      items: [
        {
          order_item_id: 201,
          stock_batch_id: 301,
          batch_no: 'CP-BATCH-001',
          total_units_dispatched: 50,
          units_per_box: 10
        }
      ]
    });

    assert.strictEqual(prepA.success, true);
    assert.strictEqual(prepA.duplicate, undefined);

    // Resend with same idempotency key
    const prepB = await Service.prepareDispatch(sharedClient, {
      order_id: testOrderId,
      dispatch_no: 'DSP-IDEMP-01',
      idempotency_key: key,
      warehouse_id: 1,
      items: [
        {
          order_item_id: 201,
          stock_batch_id: 301,
          batch_no: 'CP-BATCH-001',
          total_units_dispatched: 50,
          units_per_box: 10
        }
      ]
    });

    assert.strictEqual(prepB.success, true);
    assert.strictEqual(prepB.duplicate, true);
    assert.strictEqual(prepB.dispatch.id, prepA.dispatch.id);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`  GODOWN DISPATCH TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDispatchWorkflowTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
