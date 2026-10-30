/**
 * tests/test_accounting_costing_audit_notifications.js
 * Comprehensive Automated Test Suite for Accounting, Costing, Audit Logging, and Notifications
 *
 * Verifies:
 * 1. Controlled Double-Entry General Ledger:
 *    - Balanced entries (Debits === Credits, net difference = 0).
 *    - Rejection of invalid amounts, identical accounts, or missing accounts.
 *    - Chart of Accounts (COA) mapping.
 * 2. Connected Financial Workflows:
 *    - Purchase invoice booking: Inventory Asset (1200) + Input GST (1300) vs Accounts Payable (2000).
 *    - Supplier payment: Accounts Payable (2000) vs Bank (1020).
 *    - Sales invoice booking: Accounts Receivable (1100) vs Sales Revenue (4000) + Output GST (2100).
 *    - Dispatch COGS recognition: Cost of Goods Sold (5000) vs Finished Goods (1220).
 *    - Customer receipt: Bank (1020) vs Accounts Receivable (1100).
 *    - Operating expense booking: Expense category (6010-6090) vs Bank/Cash.
 *    - Manufacturing output capitalization: Finished Goods (1220) vs WIP (1210) + Overhead (5300).
 *    - Packaging run cost capitalization: Packed FG (1220) vs Bulk WIP (1210) + Packaging Supplies (1200).
 * 3. Traceable Non-Destructive Reversals:
 *    - Reversals post compensating journal entries with swapped debit/credit accounts.
 *    - Original transaction remains permanently in audit trail with reversed_entry_id linkage.
 *    - Reversing a reversal or double-reversing is strictly prohibited.
 *    - Trial balance reflects zero net impact post-reversal.
 * 4. Documented Inventory Costing & Valuation:
 *    - Moving Weighted Average Cost (WAC) calculations.
 *    - Chronological FIFO batch consumption with accurate unit cost breakdowns.
 *    - Strict separation of physical inventory counts from financial valuations.
 * 5. Historical Purchase Price Protection:
 *    - Historical batch purchase prices and closed transactions are strictly immutable.
 *    - Editing catalog prices or entering new purchase orders never alters closed historical batches.
 * 6. Documented Manufacturing Cost Absorption:
 *    - Considers consumed FIFO raw materials, machine hours, labor hours, and utility overheads.
 *    - Absorbs yield loss and wastage into sound output unit cost.
 * 7. Documented Packaging & Bottling Cost Absorption:
 *    - Considers bulk chemical, bottles, caps, labels, cartons, and packaging labor.
 *    - Breakage/rejection absorption into finished sound SKU unit and box cost.
 *    - Accurate boxes and loose units breakdown.
 * 8. Multi-Entity Accounting & GST Isolation:
 *    - Ledger entries and trial balances are strictly partitioned by company_id.
 * 9. Enterprise Audit Logging & Immutability:
 *    - Append-only recording of all 8 essential categories.
 *    - Before and after values captured with diffs, actors, timestamps, and reference codes.
 *    - Deletion or modification attempts throw AUDIT_LOG_IMMUTABLE errors.
 * 10. Role-Based Notification Service:
 *    - Real-time alerts across all 6 core categories.
 *    - Strict RBAC visibility (QC sees QC holds, Store sees Low Stock, Admin sees all).
 *    - Company-level isolation and read-state management.
 */

const assert = require('assert');
const path = require('path');

const ACCOUNTING_CORE = require('../assets/js/accounting-core');
const COSTING_CORE = require('../assets/js/costing-core');
const AUDIT_LOGGER = require('../assets/js/audit-logger');
const NOTIFICATION_SERVICE = require('../assets/js/notification-service');

let passedTests = 0;
let totalTests = 0;

async function testStep(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testName}:`, err.message);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n================================================================');
  console.log('--- RUNNING ACCOUNTING, COSTING, AUDIT & NOTIFICATIONS SUITE ---');
  console.log('================================================================\n');

  // Reset states before testing
  ACCOUNTING_CORE.clearBuffer();
  AUDIT_LOGGER.clearMemoryBuffer();
  NOTIFICATION_SERVICE.reset();

  // ==============================================================================
  // SUITE 1: CONTROLLED DOUBLE-ENTRY GENERAL LEDGER CORE
  // ==============================================================================
  console.log('▶ SUITE 1: Controlled Double-Entry General Ledger Core');

  await testStep('1.1 Standard Chart of Accounts integrity check', () => {
    const coa = ACCOUNTING_CORE.CHART_OF_ACCOUNTS;
    assert.ok(coa['1010'], 'Cash in Hand (1010) must exist');
    assert.ok(coa['1020'], 'Bank Accounts (1020) must exist');
    assert.ok(coa['1100'], 'Accounts Receivable (1100) must exist');
    assert.ok(coa['1200'], 'Raw Materials Inventory (1200) must exist');
    assert.ok(coa['1210'], 'Work in Progress (1210) must exist');
    assert.ok(coa['1220'], 'Finished Goods Inventory (1220) must exist');
    assert.ok(coa['1300'], 'Input GST Credit (1300) must exist');
    assert.ok(coa['2000'], 'Accounts Payable (2000) must exist');
    assert.ok(coa['2100'], 'Output GST Payable (2100) must exist');
    assert.ok(coa['4000'], 'Sales Revenue (4000) must exist');
    assert.ok(coa['5000'], 'Cost of Goods Sold (5000) must exist');
    assert.ok(coa['5300'], 'Production Overhead (5300) must exist');
    assert.ok(coa['6010'], 'Electricity & Utilities (6010) must exist');
  });

  await testStep('1.2 Balanced Journal Entry validation & balance enforcement', () => {
    const entry = ACCOUNTING_CORE.createBalancedEntry({
      companyId: 1,
      refType: 'manual_journal',
      debitCode: '1020', // Bank
      creditCode: '3000', // Owner Capital
      amount: 500000.00,
      notes: 'Initial owner equity contribution'
    });

    assert.strictEqual(entry.debit_account_code, '1020');
    assert.strictEqual(entry.credit_account_code, '3000');
    assert.strictEqual(entry.amount, 500000.00);
    assert.strictEqual(entry.currency, 'INR');
    assert.strictEqual(entry.is_reversal, false);
  });

  await testStep('1.3 Rejection of zero or negative transaction amounts', () => {
    assert.throws(() => {
      ACCOUNTING_CORE.createBalancedEntry({
        companyId: 1,
        refType: 'test',
        debitCode: '1020',
        creditCode: '1010',
        amount: 0
      });
    }, /ACCOUNTING_INVALID_AMOUNT/);

    assert.throws(() => {
      ACCOUNTING_CORE.createBalancedEntry({
        companyId: 1,
        refType: 'test',
        debitCode: '1020',
        creditCode: '1010',
        amount: -150.00
      });
    }, /ACCOUNTING_INVALID_AMOUNT/);
  });

  await testStep('1.4 Rejection of identical debit and credit accounts', () => {
    assert.throws(() => {
      ACCOUNTING_CORE.createBalancedEntry({
        companyId: 1,
        refType: 'test',
        debitCode: '1020',
        creditCode: '1020',
        amount: 1000
      });
    }, /ACCOUNTING_IDENTICAL_ACCOUNTS/);
  });

  await testStep('1.5 Rejection of missing account codes', () => {
    assert.throws(() => {
      ACCOUNTING_CORE.createBalancedEntry({
        companyId: 1,
        refType: 'test',
        debitCode: null,
        creditCode: '1020',
        amount: 1000
      });
    }, /ACCOUNTING_MISSING_ACCOUNTS/);
  });

  // ==============================================================================
  // SUITE 2: CONNECTED FINANCIAL WORKFLOWS
  // ==============================================================================
  console.log('\n▶ SUITE 2: Connected Financial Workflows');

  await testStep('2.1 Purchase Invoice Inward Booking (Asset + GST vs AP)', () => {
    const result = ACCOUNTING_CORE.postPurchaseInvoice({
      companyId: 1,
      purchaseId: 101,
      purchaseNo: 'PUR-2026-001',
      supplierId: 5,
      supplierName: 'Gujarat Chemical Supplies',
      taxableAmount: 100000,
      taxAmount: 18000,
      totalAmount: 118000
    });

    assert.strictEqual(result.totalBooked, 118000);
    assert.strictEqual(result.entries.length, 2);

    const [eInventory, eTax] = result.entries;
    assert.strictEqual(eInventory.debit_account_code, '1200');
    assert.strictEqual(eInventory.credit_account_code, '2000');
    assert.strictEqual(eInventory.amount, 100000);

    assert.strictEqual(eTax.debit_account_code, '1300');
    assert.strictEqual(eTax.credit_account_code, '2000');
    assert.strictEqual(eTax.amount, 18000);
  });

  await testStep('2.2 Supplier Payment Booking (AP vs Bank)', async () => {
    const paymentEntry = await ACCOUNTING_CORE.postSupplierPayment({
      companyId: 1,
      purchaseId: 101,
      purchaseNo: 'PUR-2026-001',
      supplierId: 5,
      supplierName: 'Gujarat Chemical Supplies',
      amount: 60000,
      mode: 'Bank',
      notes: 'Partial payment RTGS UTR #998877'
    });

    assert.strictEqual(paymentEntry.debit_account_code, '2000');
    assert.strictEqual(paymentEntry.credit_account_code, '1020');
    assert.strictEqual(paymentEntry.amount, 60000);
    assert.strictEqual(paymentEntry.party_type, 'supplier');
  });

  await testStep('2.3 Commercial Sales Invoice & Dispatch COGS Booking', () => {
    const result = ACCOUNTING_CORE.postSalesInvoiceAndCOGS({
      companyId: 1,
      orderId: 501,
      orderNo: 'ORD-2026-001',
      clientId: 12,
      clientName: 'Sardar Agro Center',
      taxableAmount: 200000,
      taxAmount: 36000,
      totalAmount: 236000,
      inventoryCostValue: 140000
    });

    assert.strictEqual(result.revEntry.debit_account_code, '1100');
    assert.strictEqual(result.revEntry.credit_account_code, '4000');
    assert.strictEqual(result.revEntry.amount, 200000);

    assert.strictEqual(result.taxEntry.debit_account_code, '1100');
    assert.strictEqual(result.taxEntry.credit_account_code, '2100');
    assert.strictEqual(result.taxEntry.amount, 36000);

    assert.strictEqual(result.cogsEntry.debit_account_code, '5000');
    assert.strictEqual(result.cogsEntry.credit_account_code, '1220');
    assert.strictEqual(result.cogsEntry.amount, 140000);
  });

  await testStep('2.4 Customer Receipt Booking (Bank vs AR)', async () => {
    const receiptEntry = await ACCOUNTING_CORE.postCustomerReceipt({
      companyId: 1,
      orderId: 501,
      orderNo: 'ORD-2026-001',
      clientId: 12,
      clientName: 'Sardar Agro Center',
      amount: 150000,
      mode: 'Bank',
      notes: 'Cheque deposit #441122'
    });

    assert.strictEqual(receiptEntry.debit_account_code, '1020');
    assert.strictEqual(receiptEntry.credit_account_code, '1100');
    assert.strictEqual(receiptEntry.amount, 150000);
  });

  await testStep('2.5 Operating Expense Booking with automated COA mapping', () => {
    const expEntry = ACCOUNTING_CORE.postExpense({
      companyId: 1,
      expenseId: 88,
      category: 'Electricity & Utilities',
      amount: 14500,
      mode: 'Bank',
      description: 'Factory power bill October 2026'
    });

    assert.strictEqual(expEntry.debit_account_code, '6010');
    assert.strictEqual(expEntry.credit_account_code, '1020');
    assert.strictEqual(expEntry.amount, 14500);
  });

  await testStep('2.6 Manufacturing Output Cost Capitalization', () => {
    const mfgResult = ACCOUNTING_CORE.postManufacturingOutput({
      companyId: 1,
      orderId: 301,
      batchNo: 'BAT-2026-005',
      productName: 'Chlorpyrifos 20% EC',
      materialCost: 80000,
      overheadCost: 12000,
      totalCost: 92000
    });

    assert.strictEqual(mfgResult.totalCapitalized, 92000);
    assert.strictEqual(mfgResult.entries.length, 2);

    const [eMat, eOvh] = mfgResult.entries;
    assert.strictEqual(eMat.debit_account_code, '1220');
    assert.strictEqual(eMat.credit_account_code, '1210');
    assert.strictEqual(eMat.amount, 80000);

    assert.strictEqual(eOvh.debit_account_code, '1220');
    assert.strictEqual(eOvh.credit_account_code, '5300');
    assert.strictEqual(eOvh.amount, 12000);
  });

  await testStep('2.7 Packaging Run Cost Capitalization', () => {
    const packResult = ACCOUNTING_CORE.postPackagingRunCost({
      companyId: 1,
      orderId: 401,
      lotNo: 'LOT-2026-010',
      sku: 'Chlorpyrifos 20% EC - 500ml',
      bulkChemicalCost: 50000,
      packagingMaterialsCost: 18500
    });

    assert.strictEqual(packResult.totalCost, 68500);
    assert.strictEqual(packResult.entries.length, 2);

    const [eBulk, ePackMat] = packResult.entries;
    assert.strictEqual(eBulk.debit_account_code, '1220');
    assert.strictEqual(eBulk.credit_account_code, '1210');
    assert.strictEqual(eBulk.amount, 50000);

    assert.strictEqual(ePackMat.debit_account_code, '1220');
    assert.strictEqual(ePackMat.credit_account_code, '1200');
    assert.strictEqual(ePackMat.amount, 18500);
  });

  // ==============================================================================
  // SUITE 3: TRACEABLE NON-DESTRUCTIVE REVERSALS
  // ==============================================================================
  console.log('\n▶ SUITE 3: Traceable Non-Destructive Reversals');

  await testStep('3.1 Reversal generates compensating journal entry with swapped accounts', () => {
    const testEntry = ACCOUNTING_CORE.createBalancedEntry({
      companyId: 1,
      refType: 'expense',
      debitCode: '6020',
      creditCode: '1010',
      amount: 5000,
      notes: 'Erroneous freight booking'
    });

    const rev = ACCOUNTING_CORE.reverseEntry(testEntry.id, 'Wrong account debited', 'manager@anjani.local');

    assert.strictEqual(rev.is_reversal, true);
    assert.strictEqual(rev.reversed_entry_id, testEntry.id);
    assert.strictEqual(rev.debit_account_code, testEntry.credit_account_code);
    assert.strictEqual(rev.credit_account_code, testEntry.debit_account_code);
    assert.strictEqual(rev.amount, 5000);
    assert.strictEqual(rev.posted_by, 'manager@anjani.local');

    const origCheck = ACCOUNTING_CORE.getLedgerEntries().find(e => e.id === testEntry.id);
    assert.ok(origCheck, 'Original entry must still exist');
    assert.strictEqual(origCheck.is_reversal, false);
  });

  await testStep('3.2 Prevention of duplicate reversal', () => {
    const entry = ACCOUNTING_CORE.createBalancedEntry({
      companyId: 1,
      refType: 'expense',
      debitCode: '6040',
      creditCode: '1020',
      amount: 2500,
      notes: 'Stationery purchase'
    });

    ACCOUNTING_CORE.reverseEntry(entry.id, 'Cancelled bill');

    assert.throws(() => {
      ACCOUNTING_CORE.reverseEntry(entry.id, 'Attempt duplicate reversal');
    }, /ALREADY_REVERSED/);
  });

  await testStep('3.3 Prevention of reversing a reversal entry', () => {
    const entry = ACCOUNTING_CORE.createBalancedEntry({
      companyId: 1,
      refType: 'expense',
      debitCode: '6030',
      creditCode: '1020',
      amount: 1200,
      notes: 'Machine oil'
    });

    const rev = ACCOUNTING_CORE.reverseEntry(entry.id, 'Incorrect vendor');

    assert.throws(() => {
      ACCOUNTING_CORE.reverseEntry(rev.id, 'Cannot reverse a reversal');
    }, /CANNOT_REVERSE_A_REVERSAL/);
  });

  await testStep('3.4 Trial Balance is mathematically balanced (Total Debits === Total Credits)', () => {
    const tb = ACCOUNTING_CORE.getTrialBalance(1);
    assert.strictEqual(tb.isBalanced, true, 'Trial balance must be balanced');
    assert.strictEqual(tb.difference, 0, 'Difference between debits and credits must be zero');
    assert.strictEqual(tb.totalDebits, tb.totalCredits);
    assert.ok(tb.totalDebits > 0, 'Total debits must be positive');
  });

  // ==============================================================================
  // SUITE 4: DOCUMENTED INVENTORY COSTING & VALUATION (WAC & FIFO)
  // ==============================================================================
  console.log('\n▶ SUITE 4: Documented Inventory Costing & Valuation (WAC & FIFO)');

  await testStep('4.1 Moving Weighted Average Cost (WAC) calculation', () => {
    const batches = [
      { id: 1, batch_no: 'B1', current_qty: 100, purchase_price: 250.00 },
      { id: 2, batch_no: 'B2', current_qty: 200, purchase_price: 280.00 },
      { id: 3, batch_no: 'B3', current_qty: 100, purchase_price: 300.00 }
    ];

    const wac = COSTING_CORE.calculateWeightedAverageCost(batches);
    assert.strictEqual(wac.totalQty, 400);
    assert.strictEqual(wac.totalValuation, 111000);
    assert.strictEqual(wac.averageCost, 277.50);
  });

  await testStep('4.2 FIFO Costing: chronological depletion of oldest batches first', () => {
    const batches = [
      { id: 1, batch_no: 'B1', current_qty: 50, purchase_price: 200.00, purchase_date: '2026-01-01' },
      { id: 2, batch_no: 'B2', current_qty: 100, purchase_price: 250.00, purchase_date: '2026-02-01' },
      { id: 3, batch_no: 'B3', current_qty: 150, purchase_price: 300.00, purchase_date: '2026-03-01' }
    ];

    const fifo = COSTING_CORE.calculateFIFOCost(batches, 120);
    assert.strictEqual(fifo.evaluatedQty, 120);
    assert.strictEqual(fifo.totalCost, 27500);
    assert.strictEqual(fifo.unitCost, 229.17);
    assert.strictEqual(fifo.batchBreakdown.length, 2);
    assert.strictEqual(fifo.batchBreakdown[0].batchNo, 'B1');
    assert.strictEqual(fifo.batchBreakdown[0].qtyEvaluated, 50);
    assert.strictEqual(fifo.batchBreakdown[1].batchNo, 'B2');
    assert.strictEqual(fifo.batchBreakdown[1].qtyEvaluated, 70);
  });

  await testStep('4.3 Separation of Physical Stock Counts from Financial Valuation', () => {
    const inventoryBatches = [
      { id: 1, item_name: 'Chlorpyrifos Tech', item_type: 'Raw Material', current_qty: 500, unit: 'Litres', purchase_price: 450.00 },
      { id: 2, item_name: '500ml HDPE Bottle', item_type: 'Packaging', current_qty: 2000, unit: 'Nos', purchase_price: 12.50 },
      { id: 3, item_name: 'Carton Box 20x500ml', item_type: 'Packaging', current_qty: 150, unit: 'Nos', purchase_price: 35.00 },
      { id: 4, item_name: 'Profenofos 50% EC', item_type: 'Finished Good', packaging_size: '500 ml', current_qty: 400, unit: 'Nos', purchase_price: 220.00 }
    ];

    const val = COSTING_CORE.computeInventoryValuation(inventoryBatches);
    assert.strictEqual(val.totalPhysicalUnits, 3050);
    assert.strictEqual(val.categorySummary.rawMaterials, 225000);
    assert.strictEqual(val.categorySummary.packagingMaterials, 30250);
    assert.strictEqual(val.categorySummary.packedFinishedGoods, 88000);
    assert.strictEqual(val.totalValuation, 343250);
  });

  // ==============================================================================
  // SUITE 5: HISTORICAL PURCHASE PRICE PROTECTION GUARANTEE
  // ==============================================================================
  console.log('\n▶ SUITE 5: Historical Purchase Price Protection Guarantee');

  await testStep('5.1 Modification of product catalog price never mutates historical batches', () => {
    const historicalBatch = {
      id: 42,
      batch_no: 'BAT-HIST-2025-01',
      purchase_price: 350.00,
      created_at: '2025-08-15'
    };

    assert.doesNotThrow(() => {
      COSTING_CORE.verifyHistoricalPriceImmutability(historicalBatch, 350.00);
    });

    assert.throws(() => {
      COSTING_CORE.verifyHistoricalPriceImmutability(historicalBatch, 420.00);
    }, /HISTORICAL_PRICE_PROTECTED/);
  });

  // ==============================================================================
  // SUITE 6: MANUFACTURING COST CALCULATION & OVERHEAD ABSORPTION
  // ==============================================================================
  console.log('\n▶ SUITE 6: Manufacturing Cost Calculation & Overhead Absorption');

  await testStep('6.1 Manufacturing batch cost with FIFO ingredients, labor, machine & yield variance', () => {
    COSTING_CORE.setOverheadRates({ laborRate: 250, machineRate: 450, utilityRate: 1.5 });

    const mfg = COSTING_CORE.calculateManufacturingCost({
      orderNo: 'MO-2026-088',
      productName: 'Chlorpyrifos 20% EC',
      batchNo: 'B-CHL-101',
      plannedQty: 1000,
      actualYield: 980,
      consumedIngredients: [
        { name: 'Chlorpyrifos Technical', quantity: 210, unit: 'Kg', batchPurchasePrice: 600.00 },
        { name: 'Solvent Emulsifier Blend', quantity: 790, unit: 'Litre', batchPurchasePrice: 85.00 }
      ],
      laborHours: 6,
      machineHours: 5,
      customOverhead: 500
    });

    assert.strictEqual(mfg.totalMaterialCost, 193150);
    assert.strictEqual(mfg.overheadBreakdown.laborCost, 1500);
    assert.strictEqual(mfg.overheadBreakdown.machineCost, 2250);
    assert.strictEqual(mfg.overheadBreakdown.utilityCost, 1470);
    assert.strictEqual(mfg.overheadBreakdown.totalOverhead, 5720);
    assert.strictEqual(mfg.totalManufacturingCost, 198870);
    assert.strictEqual(mfg.lossQty, 20);
    assert.strictEqual(mfg.yieldPercentage, 98);
    assert.strictEqual(mfg.costPerUnit, 202.93);
  });

  // ==============================================================================
  // SUITE 7: PACKAGING RUN COST & BREAKAGE ABSORPTION
  // ==============================================================================
  console.log('\n▶ SUITE 7: Packaging Run Cost & Breakage Absorption');

  await testStep('7.1 Packaging run cost with bottles, caps, cartons, and breakage absorption', () => {
    const pack = COSTING_CORE.calculatePackagingCost({
      lotNo: 'LOT-500-01',
      sku: 'Chlorpyrifos 20% EC 500ml',
      packagingSize: '500 ml',
      unitsPerBox: 10,
      plannedBottles: 505,
      approvedSoundBottles: 500,
      brokenOrRejectedBottles: 5,
      bulkChemicalCostPerLitre: 200.00,
      bulkVolumePerBottleLitres: 0.5,
      bottleCost: 10.00,
      capCost: 3.00,
      labelCost: 2.00,
      cartonBoxCost: 30.00,
      packagingLaborAllowancePerUnit: 2.00
    });

    assert.strictEqual(pack.totalBulkLitresConsumed, 252.5);
    assert.strictEqual(pack.bulkCostAbsorption, 50500);
    assert.strictEqual(pack.boxesPacked, 50);
    assert.strictEqual(pack.looseUnits, 0);
    assert.strictEqual(pack.packagingComponentsBreakdown.cartonsCost, 1500);
    assert.strictEqual(pack.packagingComponentsBreakdown.totalPackagingMaterials, 10075);
    assert.strictEqual(pack.totalRunCost, 60575);
    assert.strictEqual(pack.costPerSoundUnit, 121.15);
    assert.strictEqual(pack.costPerBox, 1211.50);
  });

  // ==============================================================================
  // SUITE 8: MULTI-ENTITY ACCOUNTING & GST ISOLATION
  // ==============================================================================
  console.log('\n▶ SUITE 8: Multi-Entity Accounting & GST Isolation');

  await testStep('8.1 General Ledger entries are strictly isolated by company_id', () => {
    const co2Entry = ACCOUNTING_CORE.createBalancedEntry({
      companyId: 2,
      refType: 'expense',
      debitCode: '6010',
      creditCode: '1020',
      amount: 8000,
      notes: 'Baroda branch electricity'
    });

    const co1Entries = ACCOUNTING_CORE.getLedgerEntries({ companyId: 1 });
    const co2Entries = ACCOUNTING_CORE.getLedgerEntries({ companyId: 2 });

    assert.ok(co1Entries.every(e => e.company_id === 1), 'Company 1 query must never include Company 2 entries');
    assert.ok(co2Entries.every(e => e.company_id === 2), 'Company 2 query must never include Company 1 entries');
    assert.ok(co2Entries.some(e => e.id === co2Entry.id), 'Company 2 entry must exist in Company 2 ledger');
  });

  await testStep('8.2 Trial Balance can be generated separately per company', () => {
    const tb1 = ACCOUNTING_CORE.getTrialBalance(1);
    const tb2 = ACCOUNTING_CORE.getTrialBalance(2);

    assert.strictEqual(tb1.isBalanced, true);
    assert.strictEqual(tb2.isBalanced, true);
    assert.notStrictEqual(tb1.totalDebits, tb2.totalDebits);
    assert.strictEqual(tb2.totalDebits, 8000);
  });

  // ==============================================================================
  // SUITE 9: ENTERPRISE AUDIT LOGGING & IMMUTABILITY
  // ==============================================================================
  console.log('\n▶ SUITE 9: Enterprise Audit Logging & Immutability');

  await testStep('9.1 Append-only audit logging across all 8 essential categories', async () => {
    const l1 = await AUDIT_LOGGER.logStockMovement({
      companyId: 1,
      actorEmail: 'store@anjani.local',
      itemId: 10,
      itemName: 'Chlorpyrifos Tech',
      movementType: 'FIFO_DEDUCTION',
      qtyBefore: 500,
      qtyChange: -50,
      qtyAfter: 450,
      referenceNo: 'BAT-001'
    });
    assert.strictEqual(l1.action_category, 'STOCK_MOVEMENT');
    assert.strictEqual(l1.before_values.stock, 500);
    assert.strictEqual(l1.after_values.stock, 450);

    const l2 = await AUDIT_LOGGER.logProductionCompletion({
      companyId: 1,
      orderId: 301,
      orderNo: 'PRD-100',
      batchNo: 'B-100',
      productName: 'Profenofos',
      plannedQty: 500,
      actualOutput: 490,
      yieldPercentage: 98
    });
    assert.strictEqual(l2.action_category, 'PRODUCTION_COMPLETION');

    const l3 = await AUDIT_LOGGER.logQCDecision({
      companyId: 1,
      batchId: 50,
      batchNo: 'B-100',
      previousStatus: 'Pending',
      decision: 'Approved',
      inspector: 'Dr. Patel'
    });
    assert.strictEqual(l3.action_category, 'QC_DECISION');

    const l4 = await AUDIT_LOGGER.logPackingApproval({
      companyId: 1,
      orderId: 401,
      lotNo: 'LOT-99',
      sku: 'Profenofos 1L',
      boxesPacked: 40,
      looseUnits: 5,
      soundUnits: 405,
      brokenUnits: 2
    });
    assert.strictEqual(l4.action_category, 'PACKING_APPROVAL');

    const l5 = await AUDIT_LOGGER.logDispatchPosting({
      companyId: 1,
      dispatchId: 701,
      dispatchNo: 'DSP-2026-90',
      customerName: 'Kisan Seva Kendra',
      boxesDispatched: 40,
      looseDispatched: 5
    });
    assert.strictEqual(l5.action_category, 'DISPATCH_POSTING');

    const l6 = await AUDIT_LOGGER.logInvoicePosting({
      companyId: 1,
      invoiceId: 801,
      invoiceNo: 'INV-2026-88',
      customerName: 'Kisan Seva Kendra',
      taxableAmount: 150000,
      taxAmount: 27000,
      totalAmount: 177000
    });
    assert.strictEqual(l6.action_category, 'INVOICE_POSTING');

    const l7 = await AUDIT_LOGGER.logPermissionChange({
      companyId: 1,
      actorEmail: 'superadmin@anjani.local',
      targetUserEmail: 'qc2@anjani.local',
      roleChangedFrom: 'viewer_auditor',
      roleChangedTo: 'qc_officer'
    });
    assert.strictEqual(l7.action_category, 'PERMISSION_CHANGE');

    const l8 = await AUDIT_LOGGER.logFinancialAdjustment({
      companyId: 1,
      actorEmail: 'cfo@anjani.local',
      entryId: 99,
      entryNo: 'JRN-99',
      adjustmentType: 'CREDIT_NOTE',
      amount: 12000,
      reason: 'Product price volume rebate'
    });
    assert.strictEqual(l8.action_category, 'FINANCIAL_ADJUSTMENT');
  });

  await testStep('9.2 Immutability Guard: Deletion of audit logs is strictly rejected', () => {
    assert.throws(() => {
      AUDIT_LOGGER.deleteLog(1);
    }, /AUDIT_LOG_IMMUTABLE/);
  });

  await testStep('9.3 Immutability Guard: Modification of audit logs is strictly rejected', () => {
    assert.throws(() => {
      AUDIT_LOGGER.updateLog(1);
    }, /AUDIT_LOG_IMMUTABLE/);
  });

  await testStep('9.4 Audit query filters by category and actor', () => {
    const stockLogs = AUDIT_LOGGER.getLogs({ category: 'STOCK_MOVEMENT' });
    assert.ok(stockLogs.length >= 1);
    assert.strictEqual(stockLogs[0].action_category, 'STOCK_MOVEMENT');

    const cfoLogs = AUDIT_LOGGER.getLogs({ actorEmail: 'cfo@anjani.local' });
    assert.ok(cfoLogs.length >= 1);
    assert.strictEqual(cfoLogs[0].action_category, 'FINANCIAL_ADJUSTMENT');
  });

  // ==============================================================================
  // SUITE 10: ROLE-BASED NOTIFICATION SERVICE
  // ==============================================================================
  console.log('\n▶ SUITE 10: Role-Based Notification Service');

  await testStep('10.1 Notification broadcast and RBAC filtering', async () => {
    NOTIFICATION_SERVICE.reset();

    await NOTIFICATION_SERVICE.createNotification({
      companyId: 1,
      type: 'QC_HOLD',
      priority: 'Urgent',
      title: 'Batch #BAT-TEST Quarantined',
      message: 'Suspension stability parameter out of range'
    });

    await NOTIFICATION_SERVICE.createNotification({
      companyId: 1,
      type: 'FINANCIAL_ALERT',
      priority: 'Warning',
      title: 'Overdue Receivable',
      message: 'Client ABC overdue by 45 days'
    });

    const qcNotifs = NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: 'qc_officer', companyId: 1 });
    assert.ok(qcNotifs.some(n => n.type === 'QC_HOLD'), 'QC Officer must see QC_HOLD');
    assert.ok(!qcNotifs.some(n => n.type === 'FINANCIAL_ALERT'), 'QC Officer must NOT see FINANCIAL_ALERT');

    const acctNotifs = NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: 'accountant', companyId: 1 });
    assert.ok(acctNotifs.some(n => n.type === 'FINANCIAL_ALERT'), 'Accountant must see FINANCIAL_ALERT');

    const adminNotifs = NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: 'super_admin', companyId: 1 });
    assert.ok(adminNotifs.some(n => n.type === 'QC_HOLD'));
    assert.ok(adminNotifs.some(n => n.type === 'FINANCIAL_ALERT'));
  });

  await testStep('10.2 Notification read state and counter management', () => {
    const unreadBefore = NOTIFICATION_SERVICE.getUnreadCount('super_admin', 1);
    assert.ok(unreadBefore > 0, 'Unread count should be > 0 initially');

    const marked = NOTIFICATION_SERVICE.markAllAsRead('super_admin', 1);
    assert.ok(marked > 0);

    const unreadAfter = NOTIFICATION_SERVICE.getUnreadCount('super_admin', 1);
    assert.strictEqual(unreadAfter, 0, 'Unread count must be 0 after marking all as read');
  });

  await testStep('10.3 Company scoping of notifications', async () => {
    await NOTIFICATION_SERVICE.createNotification({
      companyId: 2,
      type: 'LOW_STOCK',
      title: 'Company 2 Low Stock',
      message: 'Baroda stock low'
    });

    const co1Notifs = NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: 'store_manager', companyId: 1 });
    assert.ok(!co1Notifs.some(n => n.title === 'Company 2 Low Stock'), 'Company 1 user must not see Company 2 notification');

    const co2Notifs = NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: 'store_manager', companyId: 2 });
    assert.ok(co2Notifs.some(n => n.title === 'Company 2 Low Stock'), 'Company 2 user must see Company 2 notification');
  });

  // ==============================================================================
  // SUMMARY REPORT
  // ==============================================================================
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100% SUCCESS)`);
  console.log('================================================================\n');
}

runAllTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
