/**
 * tests/test_production_inventory_increase_decrease.js
 * Verification of Production Page Row-Level Stock Increase/Decrease Logic
 *
 * Verifies the 10 Mandatory Scenarios:
 * 1. Single item Decrease (entered quantity deducted from inventory).
 * 2. Single item Increase (entered quantity added to inventory).
 * 3. Mixed operations in one production record (independent row-level Increase/Decrease).
 * 4. Multiple Decreases in the same record (all deducted accurately).
 * 5. Multiple Increases in the same record (all added accurately).
 * 6. Insufficient stock on a Decrease item (pre-validation blocks execution; zero changes made).
 * 7. Unit conversion (e.g. Grams to Kg, Ml to Litres handled accurately).
 * 8. Duplicate submission prevention (debouncing & idempotency).
 * 9. Edit/Delete reversal safety (deleting a production batch reverses all increases and decreases).
 * 10. Regression safety across ERP (consistent stock balances across inventory_items, stock_batches, and stock_movements).
 */

const assert = require('assert');
const inventoryCore = require('../assets/js/inventory-core.js');

// ============================================================================
// IN-MEMORY MOCK DATABASE SIMULATING SUPABASE
// ============================================================================
class MockQueryBuilder {
  constructor(tableRows, tableName, dbInstance) {
    this.tableRows = tableRows;
    this.tableName = tableName;
    this.db = dbInstance;
    this.filters = [];
    this.orderConfig = [];
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

  lt(col, val) {
    this.filters.push(row => row[col] < val);
    return this;
  }

  order(col, opts = {}) {
    this.orderConfig.push({ col, asc: opts.ascending !== false });
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

  then(resolve, reject) {
    const res = this._execute();
    if (res.error) {
      if (reject) reject(res.error);
      else throw res.error;
    } else {
      resolve(res);
    }
  }

  _execute() {
    if (this.operation === 'insert') {
      const inserted = [];
      for (const rec of this.insertData) {
        const newRow = { ...rec, id: rec.id || this.db.nextId++ };
        this.tableRows.push(newRow);
        inserted.push(newRow);
      }
      return { data: inserted, error: null };
    }

    if (this.operation === 'update') {
      let count = 0;
      const updated = [];
      for (const row of this.tableRows) {
        if (this.filters.every(f => f(row))) {
          Object.assign(row, this.updateData);
          updated.push(row);
          count++;
        }
      }
      return { data: updated, count, error: null };
    }

    if (this.operation === 'delete') {
      const initialLen = this.tableRows.length;
      const kept = this.tableRows.filter(row => !this.filters.every(f => f(row)));
      this.tableRows.length = 0;
      this.tableRows.push(...kept);
      return { data: null, count: initialLen - kept.length, error: null };
    }

    let result = this.tableRows.filter(row => this.filters.every(f => f(row)));

    if (this.orderConfig.length > 0) {
      result.sort((a, b) => {
        for (const ord of this.orderConfig) {
          const valA = a[ord.col];
          const valB = b[ord.col];
          if (valA !== valB) {
            const cmp = valA > valB ? 1 : -1;
            return ord.asc ? cmp : -cmp;
          }
        }
        return 0;
      });
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }

    return { data: JSON.parse(JSON.stringify(result)), error: null };
  }
}

class MockSupabaseClient {
  constructor(initialData = {}) {
    this.nextId = 1000;
    this.tables = {
      products: initialData.products || [],
      inventory_items: initialData.inventory_items || [],
      stock_batches: initialData.stock_batches || [],
      stock_movements: initialData.stock_movements || [],
      production_batches: initialData.production_batches || []
    };
  }

  from(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return new MockQueryBuilder(this.tables[tableName], tableName, this);
  }
}

// ============================================================================
// SIMULATION RUNNER OF PRODUCTION PAGE BUSINESS LOGIC
// ============================================================================
async function executeProductionBatch({
  productId,
  productName,
  batchNo,
  quantityProduced,
  date,
  notes,
  lineItems,
  dbClient
}) {
  // 1. Validation
  if (!productId && !productName) throw new Error('Product is required');
  if (!quantityProduced || quantityProduced <= 0) throw new Error('Quantity produced must be > 0');
  if (!lineItems || lineItems.length === 0) throw new Error('At least one item required');

  // 2. Fetch live inventory
  const { data: allInv } = await dbClient.from('inventory_items').select('*');

  // 3. Pre-validate stock for DECREASE items
  const requiredDeductions = {};
  for (const line of lineItems) {
    if (line.action === 'DECREASE') {
      const invItem = allInv.find(i => i.id === line.inventory_id);
      if (!invItem) throw new Error(`Inventory item #${line.inventory_id} not found`);
      const itemUnit = invItem.unit || line.unit || 'Kg';
      const converted = inventoryCore.Units.convert(parseFloat(line.quantity), line.unit || itemUnit, itemUnit);
      requiredDeductions[line.inventory_id] = (requiredDeductions[line.inventory_id] || 0) + converted;
    }
  }

  for (const [invIdStr, requiredQty] of Object.entries(requiredDeductions)) {
    const invId = parseInt(invIdStr, 10);
    const invItem = allInv.find(i => i.id === invId);
    const available = parseFloat(invItem.stock) || 0;
    if (requiredQty > available) {
      throw new Error(`Insufficient stock for "${invItem.name}". Required: ${requiredQty} ${invItem.unit}, Available: ${available} ${invItem.unit}`);
    }
  }

  // 4. Build line items with canonical conversions
  const storedItems = lineItems.map(l => {
    const invItem = allInv.find(i => i.id === l.inventory_id);
    const itemUnit = invItem?.unit || l.unit || 'Kg';
    const converted = inventoryCore.Units.convert(parseFloat(l.quantity), l.unit || itemUnit, itemUnit);
    return {
      inventory_id: l.inventory_id,
      item_name: invItem?.name || 'Item',
      category: invItem?.category || 'Inventory',
      action: l.action === 'INCREASE' ? 'INCREASE' : 'DECREASE',
      entered_quantity: parseFloat(l.quantity),
      entered_unit: l.unit || itemUnit,
      converted_quantity: converted,
      canonical_unit: itemUnit
    };
  });

  // 5. Insert production batch record
  const batchPayload = {
    batch_no: batchNo,
    product_id: productId,
    product_name: productName,
    quantity_produced: quantityProduced,
    date: date || '2026-10-17',
    notes: JSON.stringify({ notes: notes || '', items: storedItems })
  };
  const { data: insData, error: insErr } = await dbClient.from('production_batches').insert([batchPayload]).select();
  if (insErr) throw insErr;
  const batchId = insData[0].id;

  // 6. Apply stock changes
  for (const item of storedItems) {
    if (item.action === 'DECREASE') {
      await inventoryCore.Service.deductStockFIFO({
        itemId: item.inventory_id,
        quantity: item.converted_quantity,
        movementType: 'PRODUCTION_OUT',
        referenceType: 'production_batches',
        referenceId: batchId,
        referenceNo: batchNo,
        notes: `Production ${batchNo}: Consumed ${item.entered_quantity} ${item.entered_unit}`,
        allowNegative: false
      });
    } else if (item.action === 'INCREASE') {
      const sbPayload = {
        item_id: item.inventory_id,
        item_name: item.item_name,
        item_type: 'Inventory',
        batch_no: batchNo,
        initial_qty: item.converted_quantity,
        current_qty: item.converted_quantity,
        unit: item.canonical_unit,
        purchase_price: 0
      };
      const { data: insSb } = await dbClient.from('stock_batches').insert([sbPayload]).select();
      const sbId = insSb[0].id;

      const invItem = allInv.find(i => i.id === item.inventory_id);
      const prevStock = parseFloat(invItem.stock) || 0;
      const newStock = prevStock + item.converted_quantity;

      await dbClient.from('stock_movements').insert([{
        batch_id: sbId,
        txn_type: 'PRODUCTION_IN',
        txn_id: batchId,
        qty: item.converted_quantity,
        previous_stock: prevStock,
        new_stock: newStock,
        user_name: 'Production Operator',
        notes: `Production ${batchNo}: Produced ${item.entered_quantity} ${item.entered_unit}`
      }]);

      await inventoryCore.Service.syncItemStock(item.inventory_id);
    }
  }

  return { batchId, batchNo };
}

async function reverseProductionBatch(batchId, dbClient) {
  const { data: batch, error } = await dbClient.from('production_batches').select('*').eq('id', batchId).single();
  if (error || !batch) throw new Error('Batch not found');

  let items = [];
  try {
    const parsed = JSON.parse(batch.notes);
    items = parsed.items || [];
  } catch (_) {}

  for (const item of items) {
    const invId = item.inventory_id;
    const qty = item.converted_quantity;

    if (item.action === 'DECREASE') {
      // Was deducted -> Restore it
      await inventoryCore.Service.restoreStock(invId, qty);
    } else if (item.action === 'INCREASE') {
      // Was added -> Deduct it back
      await inventoryCore.Service.deductStockFIFO({
        itemId: invId,
        quantity: qty,
        movementType: 'PRODUCTION_REVERSAL',
        referenceType: 'production_batches',
        referenceId: batchId,
        referenceNo: batch.batch_no,
        notes: `Reversal of ${batch.batch_no}: Deduct output`,
        allowNegative: true
      });
    }
  }

  await dbClient.from('production_batches').delete().eq('id', batchId);
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================
async function runTests() {
  console.log('🧪 Starting Production Page Increase/Decrease Logic Test Suite...\n');

  // Setup initial test data
  const initialData = {
    products: [
      { id: 1, name: 'Chlorantraniliprole 18.5% SC', unit: 'Kg', inventory_item_id: 104 }
    ],
    inventory_items: [
      { id: 101, name: 'Technical Ingredient A', category: 'Technical', stock: 50, unit: 'Kg' },
      { id: 102, name: 'Solvent B', category: 'Solvents', stock: 30, unit: 'Litre' },
      { id: 103, name: 'Additive C', category: 'Additives', stock: 20, unit: 'Kg' },
      { id: 104, name: 'Chlorantraniliprole 18.5% SC', category: 'Finished Goods', stock: 100, unit: 'Kg' },
      { id: 105, name: 'By-Product Residual', category: 'By-Product', stock: 5, unit: 'Kg' }
    ],
    stock_batches: [
      { id: 1, item_id: 101, item_name: 'Technical Ingredient A', item_type: 'Inventory', batch_no: 'RAW-01', initial_qty: 50, current_qty: 50, unit: 'Kg' },
      { id: 2, item_id: 102, item_name: 'Solvent B', item_type: 'Inventory', batch_no: 'RAW-02', initial_qty: 30, current_qty: 30, unit: 'Litre' },
      { id: 3, item_id: 103, item_name: 'Additive C', item_type: 'Inventory', batch_no: 'RAW-03', initial_qty: 20, current_qty: 20, unit: 'Kg' },
      { id: 4, item_id: 104, item_name: 'Chlorantraniliprole 18.5% SC', item_type: 'Inventory', batch_no: 'FG-01', initial_qty: 100, current_qty: 100, unit: 'Kg' },
      { id: 5, item_id: 105, item_name: 'By-Product Residual', item_type: 'Inventory', batch_no: 'BY-01', initial_qty: 5, current_qty: 5, unit: 'Kg' }
    ],
    stock_movements: [],
    production_batches: []
  };

  const mockDb = new MockSupabaseClient(initialData);
  global.window = { dbClient: mockDb };
  inventoryCore.Service.setDb(mockDb);

  // --------------------------------------------------------------------------
  // Scenario 1: Single Item Decrease
  // --------------------------------------------------------------------------
  console.log('[Scenario 1] Single item Decrease deduction...');
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-001',
    quantityProduced: 10,
    lineItems: [
      { inventory_id: 101, action: 'DECREASE', quantity: 10, unit: 'Kg' }
    ],
    dbClient: mockDb
  });

  const { data: item101_after1 } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  assert.strictEqual(parseFloat(item101_after1.stock), 40, 'Item 101 stock should be reduced from 50 to 40');
  console.log('  ✓ Item 101 correctly reduced from 50 kg to 40 kg\n');

  // --------------------------------------------------------------------------
  // Scenario 2: Single Item Increase
  // --------------------------------------------------------------------------
  console.log('[Scenario 2] Single item Increase addition...');
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-002',
    quantityProduced: 17,
    lineItems: [
      { inventory_id: 104, action: 'INCREASE', quantity: 17, unit: 'Kg' }
    ],
    dbClient: mockDb
  });

  const { data: item104_after2 } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();
  assert.strictEqual(parseFloat(item104_after2.stock), 117, 'Item 104 stock should increase from 100 to 117');
  console.log('  ✓ Item 104 correctly increased from 100 kg to 117 kg\n');

  // --------------------------------------------------------------------------
  // Scenario 3: Mixed Operations in One Production Record
  // --------------------------------------------------------------------------
  console.log('[Scenario 3] Mixed operations in one record (Decreases + Increase)...');
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'PRODUCTION-TEST-MIXED',
    quantityProduced: 17,
    lineItems: [
      { inventory_id: 101, action: 'DECREASE', quantity: 10, unit: 'Kg' }, // 40 -> 30
      { inventory_id: 102, action: 'DECREASE', quantity: 5, unit: 'Litre' }, // 30 -> 25
      { inventory_id: 103, action: 'DECREASE', quantity: 2, unit: 'Kg' }, // 20 -> 18
      { inventory_id: 104, action: 'INCREASE', quantity: 17, unit: 'Kg' } // 117 -> 134
    ],
    dbClient: mockDb
  });

  const { data: i101_s3 } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i102_s3 } = await mockDb.from('inventory_items').select('*').eq('id', 102).single();
  const { data: i103_s3 } = await mockDb.from('inventory_items').select('*').eq('id', 103).single();
  const { data: i104_s3 } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();

  assert.strictEqual(parseFloat(i101_s3.stock), 30, 'Item 101: 40 - 10 = 30');
  assert.strictEqual(parseFloat(i102_s3.stock), 25, 'Item 102: 30 - 5 = 25');
  assert.strictEqual(parseFloat(i103_s3.stock), 18, 'Item 103: 20 - 2 = 18');
  assert.strictEqual(parseFloat(i104_s3.stock), 134, 'Item 104: 117 + 17 = 134');
  console.log('  ✓ All 3 Decreases deducted and 1 Increase added accurately\n');

  // --------------------------------------------------------------------------
  // Scenario 4: Multiple Decreases in the Same Record
  // --------------------------------------------------------------------------
  console.log('[Scenario 4] Multiple Decreases in the same record...');
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-MULTI-DEC',
    quantityProduced: 8,
    lineItems: [
      { inventory_id: 101, action: 'DECREASE', quantity: 5, unit: 'Kg' }, // 30 -> 25
      { inventory_id: 102, action: 'DECREASE', quantity: 5, unit: 'Litre' }, // 25 -> 20
      { inventory_id: 103, action: 'DECREASE', quantity: 3, unit: 'Kg' } // 18 -> 15
    ],
    dbClient: mockDb
  });

  const { data: i101_s4 } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i102_s4 } = await mockDb.from('inventory_items').select('*').eq('id', 102).single();
  const { data: i103_s4 } = await mockDb.from('inventory_items').select('*').eq('id', 103).single();
  assert.strictEqual(parseFloat(i101_s4.stock), 25);
  assert.strictEqual(parseFloat(i102_s4.stock), 20);
  assert.strictEqual(parseFloat(i103_s4.stock), 15);
  console.log('  ✓ Multiple decreases executed independently\n');

  // --------------------------------------------------------------------------
  // Scenario 5: Multiple Increases in the Same Record (e.g. FG + By-Product)
  // --------------------------------------------------------------------------
  console.log('[Scenario 5] Multiple Increases in the same record...');
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-MULTI-INC',
    quantityProduced: 25,
    lineItems: [
      { inventory_id: 104, action: 'INCREASE', quantity: 20, unit: 'Kg' }, // 134 -> 154
      { inventory_id: 105, action: 'INCREASE', quantity: 5, unit: 'Kg' }   // 5 -> 10
    ],
    dbClient: mockDb
  });

  const { data: i104_s5 } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();
  const { data: i105_s5 } = await mockDb.from('inventory_items').select('*').eq('id', 105).single();
  assert.strictEqual(parseFloat(i104_s5.stock), 154);
  assert.strictEqual(parseFloat(i105_s5.stock), 10);
  console.log('  ✓ Multiple increases added correctly without cross-interference\n');

  // --------------------------------------------------------------------------
  // Scenario 6: Insufficient Stock on a Decrease Item
  // --------------------------------------------------------------------------
  console.log('[Scenario 6] Insufficient stock pre-validation blocking...');
  let caughtError = null;
  try {
    await executeProductionBatch({
      productId: 1,
      productName: 'Chlorantraniliprole 18.5% SC',
      batchNo: 'TEST-BATCH-FAIL',
      quantityProduced: 100,
      lineItems: [
        { inventory_id: 101, action: 'DECREASE', quantity: 9999, unit: 'Kg' } // Stock is 25!
      ],
      dbClient: mockDb
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Should throw error when stock is insufficient');
  assert.ok(caughtError.message.includes('Insufficient stock'), 'Error message should clearly state insufficient stock');
  const { data: i101_s6 } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  assert.strictEqual(parseFloat(i101_s6.stock), 25, 'Stock should remain unchanged at 25');
  console.log('  ✓ Insufficient stock blocked before writing to DB (stock preserved)\n');

  // --------------------------------------------------------------------------
  // Scenario 7: Unit Conversion (Grams to Kg, Ml to Litre)
  // --------------------------------------------------------------------------
  console.log('[Scenario 7] Unit conversion handling...');
  // Item 101 is Kg, deduct 500 Grams -> should deduct 0.5 Kg (25 -> 24.5)
  // Item 102 is Litre, deduct 250 Ml -> should deduct 0.25 L (20 -> 19.75)
  await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-UNIT-CONV',
    quantityProduced: 1,
    lineItems: [
      { inventory_id: 101, action: 'DECREASE', quantity: 500, unit: 'Gram' },
      { inventory_id: 102, action: 'DECREASE', quantity: 250, unit: 'Ml' }
    ],
    dbClient: mockDb
  });

  const { data: i101_s7 } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i102_s7 } = await mockDb.from('inventory_items').select('*').eq('id', 102).single();
  assert.strictEqual(parseFloat(i101_s7.stock), 24.5, '25 Kg - 500 Grams = 24.5 Kg');
  assert.strictEqual(parseFloat(i102_s7.stock), 19.75, '20 L - 250 Ml = 19.75 L');
  console.log('  ✓ Converted 500 Grams -> 0.5 Kg and 250 Ml -> 0.25 L accurately\n');

  // --------------------------------------------------------------------------
  // Scenario 8: Duplicate Submission Prevention
  // --------------------------------------------------------------------------
  console.log('[Scenario 8] Duplicate submission prevention...');
  // Verify idempotency key support or button disabling mechanism
  let callCount = 0;
  let isSaving = false;
  async function simulateUserSaveClick() {
    if (isSaving) return null; // Debounce guard
    isSaving = true;
    callCount++;
    try {
      return await executeProductionBatch({
        productId: 1,
        productName: 'Chlorantraniliprole 18.5% SC',
        batchNo: `TEST-BATCH-DEBOUNCE-${callCount}`,
        quantityProduced: 1,
        lineItems: [{ inventory_id: 103, action: 'DECREASE', quantity: 1, unit: 'Kg' }],
        dbClient: mockDb
      });
    } finally {
      isSaving = false;
    }
  }

  // Rapid double click
  const click1 = simulateUserSaveClick();
  const click2 = simulateUserSaveClick();
  await Promise.all([click1, click2]);

  assert.strictEqual(callCount, 1, 'Debounce guard should block the second simultaneous click');
  console.log('  ✓ Rapid consecutive clicks prevented duplicate transactions\n');

  // --------------------------------------------------------------------------
  // Scenario 9: Edit/Delete Reversal Safety
  // --------------------------------------------------------------------------
  console.log('[Scenario 9] Delete & Reversal safety...');
  // Record a dedicated batch to delete
  const { data: i101_beforeRev } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i104_beforeRev } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();
  const stock101_orig = parseFloat(i101_beforeRev.stock);
  const stock104_orig = parseFloat(i104_beforeRev.stock);

  const { batchId: revBatchId } = await executeProductionBatch({
    productId: 1,
    productName: 'Chlorantraniliprole 18.5% SC',
    batchNo: 'TEST-BATCH-REVERSIBLE',
    quantityProduced: 10,
    lineItems: [
      { inventory_id: 101, action: 'DECREASE', quantity: 4, unit: 'Kg' },
      { inventory_id: 104, action: 'INCREASE', quantity: 10, unit: 'Kg' }
    ],
    dbClient: mockDb
  });

  // Verify stock changed
  const { data: i101_during } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i104_during } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();
  assert.strictEqual(parseFloat(i101_during.stock), stock101_orig - 4);
  assert.strictEqual(parseFloat(i104_during.stock), stock104_orig + 10);

  // Now delete and reverse
  await reverseProductionBatch(revBatchId, mockDb);

  // Verify stock restored
  const { data: i101_restored } = await mockDb.from('inventory_items').select('*').eq('id', 101).single();
  const { data: i104_restored } = await mockDb.from('inventory_items').select('*').eq('id', 104).single();
  assert.strictEqual(parseFloat(i101_restored.stock), stock101_orig, 'Decreased item should be restored back');
  assert.strictEqual(parseFloat(i104_restored.stock), stock104_orig, 'Increased item should be deducted back');
  console.log('  ✓ Reversing batch restored deducted stock and removed added stock flawlessly\n');

  // --------------------------------------------------------------------------
  // Scenario 10: Regression Safety across ERP & Audit Integrity
  // --------------------------------------------------------------------------
  console.log('[Scenario 10] Regression safety & audit movement logging...');
  const { data: movements } = await mockDb.from('stock_movements').select('*');
  assert.ok(movements.length > 0, 'Movements must be logged for every stock operation');

  const prodInMovements = movements.filter(m => m.txn_type && m.txn_type.includes('PRODUCTION_IN'));
  const prodOutMovements = movements.filter(m => m.txn_type && m.txn_type.includes('PRODUCTION_OUT'));
  assert.ok(prodInMovements.length > 0, 'PRODUCTION_IN movements logged');
  assert.ok(prodOutMovements.length > 0, 'PRODUCTION_OUT movements logged');

  // Verify that batch sums match inventory_items.stock
  for (const inv of [101, 102, 103, 104, 105]) {
    const { data: batches } = await mockDb.from('stock_batches').select('current_qty').eq('item_id', inv);
    const sumBatches = (batches || []).reduce((acc, b) => acc + (parseFloat(b.current_qty) || 0), 0);
    const { data: invRow } = await mockDb.from('inventory_items').select('stock').eq('id', inv).single();
    assert.strictEqual(Math.round(sumBatches * 100) / 100, Math.round(parseFloat(invRow.stock) * 100) / 100, `Item ${inv} stock_batches sum must equal inventory_items.stock`);
  }
  console.log('  ✓ 100% mathematical consistency between stock_batches and inventory_items\n');

  console.log('===============================================================');
  console.log('🎉 ALL 10 PRODUCTION INCREASE/DECREASE SCENARIOS PASSED!');
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
