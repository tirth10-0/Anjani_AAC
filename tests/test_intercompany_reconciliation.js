/**
 * tests/test_intercompany_reconciliation.js
 * Comprehensive Automated Test Suite for Intercompany Stock Supply & Reconciliation Engine
 *
 * Verifies:
 * 1. Internal stock transfers (same legal entity, no commercial invoice).
 * 2. Intercompany commercial transactions (distinct legal entities, commercial billing references).
 * 3. Consignment stock supply arrangements (stock held at recipient, legally owned by Anjani).
 * 4. Quarantine & unapproved batch protection (blocks quarantined/unapproved lots).
 * 5. Shortage detection at transfer preparation.
 * 6. In-transit posting: source stock deducted at dispatch, destination not yet credited (prevents double-counting).
 * 7. Anti double-dispatch guard (blocks repeated execution).
 * 8. Destination receipt conditions: destination stock credited ONLY upon verified receipt.
 * 9. Partial receipts, damages, and shortages reconciliation.
 * 10. Duplicate confirmation prevention (idempotency guard).
 * 11. Delivery rejection and safe return restoration back to source warehouse batch.
 * 12. Cross-company access restrictions (Company B cannot access Company A's transfers; Anjani has complete visibility).
 * 13. Live multi-entity reconciliation dashboard calculations (owned stock, in-transit, consignment, recipient balances).
 * 14. Idempotency token protection.
 */

const assert = require('assert');
const intercompanyCore = require('../assets/js/intercompany-core.js');

const { IntercompanyCalculator, IntercompanyGuard, Service } = intercompanyCore;

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
      companies: [
        { id: 1, name: 'Anjani Agri Care', code: 'ACC', is_manufacturing: true },
        { id: 2, name: 'Agro Retail', code: 'CO-A', is_manufacturing: false },
        { id: 3, name: 'Crop Solutions', code: 'CO-B', is_manufacturing: false },
        { id: 4, name: 'Kisan Kendra', code: 'CO-C', is_manufacturing: false }
      ],
      warehouses: [
        { id: 1, name: 'Main Plant Warehouse', company_id: 1 },
        { id: 2, name: 'Company A Central Depot', company_id: 2 },
        { id: 3, name: 'Company B Junagadh Store', company_id: 3 },
        { id: 4, name: 'Company C Morbi Depot', company_id: 4 }
      ],
      products: [
        { id: 10, name: 'Chlorpyrifos 20% EC', category: 'Formulations' }
      ],
      stock_batches: [],
      stock_movements: [],
      intercompany_transfers: [],
      intercompany_transfer_items: [],
      intercompany_reconciliations: []
    };
    this._nextId = 8000;
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
async function runIntercompanyTests() {
  console.log('====================================================================');
  console.log('  STARTING INTERCOMPANY SUPPLY & RECONCILIATION TEST SUITE');
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
  // TEST 1: Box and Loose Mathematics & Receipt Balance Checks
  // --------------------------------------------------------------------------
  runTest('Test 1: Box/Loose calculation and receipt balance verification', () => {
    const res = IntercompanyCalculator.breakdownBoxesAndLoose(205, 10);
    assert.strictEqual(res.boxes, 20);
    assert.strictEqual(res.loose, 5);

    const b1 = IntercompanyCalculator.calculateReceiptBalances({
      dispatchedUnits: 100,
      receivedUnits: 90,
      damagedUnits: 6,
      shortageUnits: 4
    });
    assert.strictEqual(b1.accountedUnits, 100);
    assert.strictEqual(b1.remainingInTransit, 0);
    assert.strictEqual(b1.isFullyAccounted, true);

    // Over-receipt attempt throws error
    assert.throws(() => {
      IntercompanyCalculator.calculateReceiptBalances({
        dispatchedUnits: 100,
        receivedUnits: 95,
        damagedUnits: 10 // total 105 > 100
      });
    }, /RECEIPT_EXCEEDS_DISPATCHED/);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Quarantine & Unapproved Batch Guard
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 2: StockGuard blocks quarantined or unapproved batches from transfer', async () => {
    const client = new MockDbClient();

    client.tables.stock_batches.push({
      id: 501,
      batch_no: 'CP-QUAR-01',
      current_qty: 300,
      is_quarantine: true,
      qc_status: 'Pending'
    });

    await assert.rejects(
      async () => {
        await IntercompanyGuard.validateSourceBatch(client, { batchId: 501, requestedUnits: 50 });
      },
      /UNAPPROVED_STOCK_CANNOT_BE_TRANSFERRED/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 3: Shortage Detection at Transfer Creation
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 3: Shortage detection blocks requests exceeding available batch balance', async () => {
    const client = new MockDbClient();

    client.tables.stock_batches.push({
      id: 502,
      batch_no: 'CP-AVAIL-02',
      current_qty: 40,
      is_quarantine: false,
      qc_status: 'Approved'
    });

    await assert.rejects(
      async () => {
        await IntercompanyGuard.validateSourceBatch(client, { batchId: 502, requestedUnits: 50 });
      },
      /INSUFFICIENT_STOCK/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 4: Internal Stock Transfer (Same Legal Entity, Zero Commercial Billing)
  // --------------------------------------------------------------------------
  const sharedClient = new MockDbClient();
  let internalTransferId = null;

  await runAsyncTest('Test 4: Internal stock transfer between warehouses of same company', async () => {
    // Setup approved stock batch at Main Plant (Company 1, Warehouse 1)
    sharedClient.tables.stock_batches.push({
      id: 601,
      batch_no: 'BATCH-INT-001',
      product_id: 10,
      company_id: 1,
      warehouse_id: 1,
      ownership_company_id: 1,
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    const res = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 1, // Same company
      to_warehouse_id: 1, // Another warehouse or branch
      supply_type: 'BRANCH_TRANSFER',
      items: [
        {
          product_id: 10,
          product_name: 'Chlorpyrifos 20% EC',
          source_stock_batch_id: 601,
          source_batch_no: 'BATCH-INT-001',
          quantity: 100,
          units_per_box: 10,
          unit_price: 300
        }
      ]
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isInternal, true);
    assert.strictEqual(res.transfer.transaction_type, 'INTERNAL_TRANSFER');
    assert.strictEqual(res.transfer.tax_amount, 0, 'Internal transfers must not accrue commercial GST tax');
    assert.strictEqual(res.transfer.status, 'Draft');

    internalTransferId = res.transfer.id;

    // Approve
    await Service.approveTransfer(sharedClient, { transferId: internalTransferId, approvedBy: 'Internal Auditor' });
    const approved = sharedClient.tables.intercompany_transfers.find(t => t.id === internalTransferId);
    assert.strictEqual(approved.status, 'Approved');

    // Dispatch
    const disp = await Service.dispatchTransfer(sharedClient, {
      transferId: internalTransferId,
      dispatchedBy: 'Plant Dispatcher',
      vehicleNo: 'GJ-01-AB-1111'
    });

    assert.strictEqual(disp.status, 'In Transit');
    assert.strictEqual(disp.sourceInvoiceNo, null, 'Internal transfers must not generate commercial sales invoices');

    // Source batch in Warehouse 1 deducted 100 units (500 -> 400)
    const sourceBatch = sharedClient.tables.stock_batches.find(b => b.id === 601);
    assert.strictEqual(sourceBatch.current_qty, 400);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Intercompany Commercial Sale (Anjani -> Company A with Billing)
  // --------------------------------------------------------------------------
  let commercialTransferId = null;

  await runAsyncTest('Test 5: Intercompany commercial sale between distinct entities with tax billing', async () => {
    sharedClient.tables.stock_batches.push({
      id: 602,
      batch_no: 'BATCH-COMM-002',
      product_id: 10,
      company_id: 1,
      warehouse_id: 1,
      ownership_company_id: 1,
      current_qty: 1000,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    const res = await Service.createTransfer(sharedClient, {
      from_company_id: 1, // Anjani
      from_warehouse_id: 1,
      to_company_id: 2,   // Company A (Agro Retail)
      to_warehouse_id: 2, // Company A Depot
      transaction_type: 'INTERCOMPANY_SALE',
      supply_type: 'STANDARD_SALE',
      pricing_terms: 'Dealer Wholesale',
      items: [
        {
          product_id: 10,
          product_name: 'Chlorpyrifos 20% EC',
          source_stock_batch_id: 602,
          source_batch_no: 'BATCH-COMM-002',
          quantity: 200,
          units_per_box: 10,
          unit_price: 350
        }
      ]
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.transfer.transaction_type, 'INTERCOMPANY_SALE');
    assert.strictEqual(res.transfer.subtotal_amount, 70000); // 200 * 350
    assert.strictEqual(res.transfer.tax_amount, 8400); // 12% GST
    assert.strictEqual(res.transfer.total_amount, 78400);

    commercialTransferId = res.transfer.id;

    // Approve & Dispatch
    await Service.approveTransfer(sharedClient, { transferId: commercialTransferId, approvedBy: 'Commercial Manager' });
    const dispRes = await Service.dispatchTransfer(sharedClient, {
      transferId: commercialTransferId,
      dispatchedBy: 'Logistics Head',
      vehicleNo: 'GJ-02-XY-9999',
      ewayBillNo: 'EWB-2026-COMM-11'
    });

    assert.strictEqual(dispRes.status, 'In Transit');
    assert.ok(dispRes.sourceInvoiceNo, 'Commercial intercompany transaction must generate outward invoice reference');

    // Source batch deducted 200 units (1000 -> 800)
    const batch = sharedClient.tables.stock_batches.find(b => b.id === 602);
    assert.strictEqual(batch.current_qty, 800);
  });

  // --------------------------------------------------------------------------
  // TEST 6: In-Transit Single-Counting Guard (Prevents Double-Counting)
  // --------------------------------------------------------------------------
  runTest('Test 6: In-transit posting guarantees zero double-counting while goods are on the road', () => {
    // Goods left Warehouse 1 (-200 units).
    // Goods have NOT arrived at Company A Warehouse 2 yet!
    // Destination stock_batches must NOT have any credited batch for this transfer yet!
    const destBatches = sharedClient.tables.stock_batches.filter(b => b.company_id === 2);
    assert.strictEqual(destBatches.length, 0, 'Destination warehouse must NOT be credited while goods are in transit');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Anti Double-Dispatch Guard (Duplicate Posting Block)
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 7: Anti double-dispatch guard blocks duplicate stock deduction', async () => {
    await assert.rejects(
      async () => {
        // Attempt dispatching same transfer a second time
        await Service.dispatchTransfer(sharedClient, { transferId: commercialTransferId, dispatchedBy: 'Repeated click' });
      },
      /ALREADY_DISPATCHED_DUPLICATE_PREVENTED/
    );

    // Source batch remains unchanged at 800
    const batch = sharedClient.tables.stock_batches.find(b => b.id === 602);
    assert.strictEqual(batch.current_qty, 800);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Destination Receipt & Crediting with Exact Batch Genealogy
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 8: Destination receipt credits destination stock with genealogy link', async () => {
    const items = sharedClient.tables.intercompany_transfer_items.filter(it => it.transfer_id === commercialTransferId);

    const rcptRes = await Service.receiveTransfer(sharedClient, {
      transferId: commercialTransferId,
      receivedBy: 'Company A Storekeeper',
      itemReceipts: [
        {
          item_id: items[0].id,
          received_units: 200,
          damaged_units: 0,
          shortage_units: 0
        }
      ]
    });

    assert.strictEqual(rcptRes.success, true);
    assert.strictEqual(rcptRes.status, 'Received');
    assert.ok(rcptRes.destinationPurchaseNo, 'Receipt must generate inward purchase voucher reference');

    // Verify Destination Batch in Warehouse 2 created with exactly 200 units
    const destBatches = sharedClient.tables.stock_batches.filter(b => b.company_id === 2 && b.warehouse_id === 2);
    assert.strictEqual(destBatches.length, 1);
    assert.strictEqual(destBatches[0].current_qty, 200);
    assert.strictEqual(destBatches[0].ownership_company_id, 2, 'Standard sale transfers legal ownership to Company A');
    assert.strictEqual(destBatches[0].is_consignment, false);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate Confirmation Block (Idempotency Guard)
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 9: Duplicate confirmation guard blocks repeated receipt crediting', async () => {
    await assert.rejects(
      async () => {
        await Service.receiveTransfer(sharedClient, { transferId: commercialTransferId, receivedBy: 'Storekeeper' });
      },
      /ALREADY_RECEIVED_DUPLICATE_PREVENTED/
    );

    // Destination batch remains 200
    const destBatch = sharedClient.tables.stock_batches.find(b => b.company_id === 2 && b.warehouse_id === 2);
    assert.strictEqual(destBatch.current_qty, 200);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Consignment Stock Supply (Anjani Retains Legal Ownership)
  // --------------------------------------------------------------------------
  let consignmentTransferId = null;

  await runAsyncTest('Test 10: Consignment stock supply preserves Anjani legal ownership at recipient warehouse', async () => {
    sharedClient.tables.stock_batches.push({
      id: 603,
      batch_no: 'BATCH-CONSIGN-003',
      product_id: 10,
      company_id: 1,
      warehouse_id: 1,
      ownership_company_id: 1,
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    // Create Consignment Supply to Company B (Company 3, Warehouse 3)
    const res = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 3, // Company B
      to_warehouse_id: 3,
      transaction_type: 'INTERCOMPANY_SALE',
      supply_type: 'CONSIGNMENT',
      pricing_terms: 'Consignment Value',
      items: [
        {
          product_id: 10,
          product_name: 'Chlorpyrifos 20% EC',
          source_stock_batch_id: 603,
          source_batch_no: 'BATCH-CONSIGN-003',
          quantity: 150,
          units_per_box: 10,
          unit_price: 320
        }
      ]
    });

    assert.strictEqual(res.transfer.supply_type, 'CONSIGNMENT');
    assert.strictEqual(res.transfer.ownership_company_id, 1, 'Consignment transfer ownership stays with Anjani');
    consignmentTransferId = res.transfer.id;

    // Approve & Dispatch
    await Service.approveTransfer(sharedClient, { transferId: consignmentTransferId, approvedBy: 'Director' });
    await Service.dispatchTransfer(sharedClient, { transferId: consignmentTransferId, dispatchedBy: 'Gate Officer' });

    // Receive at Company B warehouse
    const items = sharedClient.tables.intercompany_transfer_items.filter(it => it.transfer_id === consignmentTransferId);
    await Service.receiveTransfer(sharedClient, {
      transferId: consignmentTransferId,
      receivedBy: 'Company B Storekeeper',
      itemReceipts: [{ item_id: items[0].id, received_units: 150 }]
    });

    // CRITICAL: Destination batch is in Warehouse 3 (Company B), BUT ownership_company_id is 1 (Anjani)!
    const consignBatch = sharedClient.tables.stock_batches.find(b => b.company_id === 3 && b.warehouse_id === 3);
    assert.ok(consignBatch);
    assert.strictEqual(consignBatch.current_qty, 150);
    assert.strictEqual(consignBatch.is_consignment, true);
    assert.strictEqual(consignBatch.ownership_company_id, 1, 'Consignment stock at recipient location MUST be owned by Anjani');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Partial Receipt with Damages & Shortages Reconciliation
  // --------------------------------------------------------------------------
  let partialTransferId = null;

  await runAsyncTest('Test 11: Partial receipt reconciles damages, shortages, and credits only sound stock', async () => {
    sharedClient.tables.stock_batches.push({
      id: 604,
      batch_no: 'BATCH-PARTIAL-004',
      product_id: 10,
      company_id: 1,
      warehouse_id: 1,
      ownership_company_id: 1,
      current_qty: 500,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    const res = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 4, // Company C
      to_warehouse_id: 4,
      items: [
        {
          product_id: 10,
          product_name: 'Chlorpyrifos 20% EC',
          source_stock_batch_id: 604,
          source_batch_no: 'BATCH-PARTIAL-004',
          quantity: 100,
          units_per_box: 10,
          unit_price: 340
        }
      ]
    });
    partialTransferId = res.transfer.id;

    await Service.approveTransfer(sharedClient, { transferId: partialTransferId, approvedBy: 'Manager' });
    await Service.dispatchTransfer(sharedClient, { transferId: partialTransferId, dispatchedBy: 'Dispatcher' });

    // 100 dispatched: 90 sound received, 6 damaged, 4 shortage
    const items = sharedClient.tables.intercompany_transfer_items.filter(it => it.transfer_id === partialTransferId);
    const rcpt = await Service.receiveTransfer(sharedClient, {
      transferId: partialTransferId,
      receivedBy: 'Company C Inspector',
      itemReceipts: [
        {
          item_id: items[0].id,
          received_units: 90,
          damaged_units: 6,
          shortage_units: 4
        }
      ]
    });

    assert.strictEqual(rcpt.totalReceived, 90);
    assert.strictEqual(rcpt.totalDamaged, 6);
    assert.strictEqual(rcpt.totalShortage, 4);
    assert.strictEqual(rcpt.status, 'Received');

    // Destination stock credited with EXACTLY 90 sound units
    const destBatch = sharedClient.tables.stock_batches.find(b => b.company_id === 4 && b.warehouse_id === 4);
    assert.strictEqual(destBatch.current_qty, 90);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Delivery Rejection & Safe Return to Source Warehouse
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 12: Delivery rejection and safe return restores stock back to source warehouse', async () => {
    sharedClient.tables.stock_batches.push({
      id: 605,
      batch_no: 'BATCH-REJ-005',
      product_id: 10,
      company_id: 1,
      warehouse_id: 1,
      ownership_company_id: 1,
      current_qty: 300,
      is_quarantine: false,
      qc_status: 'Approved',
      units_per_box: 10
    });

    const res = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 2,
      to_warehouse_id: 2,
      items: [
        {
          product_id: 10,
          product_name: 'Chlorpyrifos 20% EC',
          source_stock_batch_id: 605,
          source_batch_no: 'BATCH-REJ-005',
          quantity: 100,
          units_per_box: 10
        }
      ]
    });
    const rejId = res.transfer.id;

    await Service.approveTransfer(sharedClient, { transferId: rejId, approvedBy: 'Manager' });
    await Service.dispatchTransfer(sharedClient, { transferId: rejId, dispatchedBy: 'Gate Officer' });

    // Source batch was deducted (300 -> 200)
    assert.strictEqual(sharedClient.tables.stock_batches.find(b => b.id === 605).current_qty, 200);

    // Reject delivery
    await Service.rejectDelivery(sharedClient, { transferId: rejId, rejectedBy: 'Company A QC', reason: 'Packaging damaged' });
    const rejTransfer = sharedClient.tables.intercompany_transfers.find(t => t.id === rejId);
    assert.strictEqual(rejTransfer.status, 'Rejected');

    // Return to source factory
    const retRes = await Service.returnTransferStock(sharedClient, { transferId: rejId, returnedBy: 'Factory Gate', reason: 'Return from rejected delivery' });
    assert.strictEqual(retRes.stockRestored, true);

    // Source batch restored back to 300
    assert.strictEqual(sharedClient.tables.stock_batches.find(b => b.id === 605).current_qty, 300);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Cross-Company Access Restrictions
  // --------------------------------------------------------------------------
  runTest('Test 13: Company B cannot access Company A transfers; Anjani has full supply chain visibility', () => {
    const transferCoA = { from_company_id: 1, to_company_id: 2 }; // Anjani -> Company A

    // Anjani (Company 1) can view
    assert.doesNotThrow(() => {
      IntercompanyGuard.validateCompanyScope(1, transferCoA);
    });

    // Company A (Company 2) can view
    assert.doesNotThrow(() => {
      IntercompanyGuard.validateCompanyScope(2, transferCoA);
    });

    // Company B (Company 3) is strictly blocked!
    assert.throws(() => {
      IntercompanyGuard.validateCompanyScope(3, transferCoA);
    }, /CROSS_COMPANY_ACCESS_DENIED/);
  });

  // --------------------------------------------------------------------------
  // TEST 14: Multi-Entity Reconciliation Analytics Dashboard
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 14: Live multi-entity reconciliation dashboard analytics', async () => {
    const report = await Service.getReconciliationReport(sharedClient, { ownerCompanyId: 1 });

    assert.strictEqual(report.ownerCompanyId, 1);
    assert.ok(report.totalOwnedStock > 0);
    assert.ok(report.warehouseStock.length >= 4);
    assert.ok(report.recipientBreakdown.length >= 3);

    // Company B has 150 consignment stock owned by Anjani
    const coB = report.recipientBreakdown.find(r => r.company_id === 3);
    assert.ok(coB);
    assert.strictEqual(coB.consignment_stock, 150);

    // Company C has damages and shortages recorded in discrepancies
    const coCDiscrepancy = report.discrepancies.find(d => d.to_company_id === 4);
    assert.ok(coCDiscrepancy);
    assert.strictEqual(coCDiscrepancy.damaged, 6);
    assert.strictEqual(coCDiscrepancy.shortage, 4);
  });

  // --------------------------------------------------------------------------
  // TEST 15: Idempotency Protection
  // --------------------------------------------------------------------------
  await runAsyncTest('Test 15: Idempotency token prevents duplicate transfer creation on repeated clicks', async () => {
    const key = `IDEMP-ICT-${Date.now()}`;
    const t1 = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 2,
      to_warehouse_id: 2,
      idempotency_key: key,
      items: [{ product_id: 10, product_name: 'Chlorpyrifos', source_stock_batch_id: 601, source_batch_no: 'BATCH-INT-001', quantity: 20 }]
    });

    assert.strictEqual(t1.success, true);
    assert.strictEqual(t1.duplicate, undefined);

    const t2 = await Service.createTransfer(sharedClient, {
      from_company_id: 1,
      from_warehouse_id: 1,
      to_company_id: 2,
      to_warehouse_id: 2,
      idempotency_key: key,
      items: [{ product_id: 10, product_name: 'Chlorpyrifos', source_stock_batch_id: 601, source_batch_no: 'BATCH-INT-001', quantity: 20 }]
    });

    assert.strictEqual(t2.success, true);
    assert.strictEqual(t2.duplicate, true);
    assert.strictEqual(t2.transfer.id, t1.transfer.id);
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`  INTERCOMPANY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIntercompanyTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
