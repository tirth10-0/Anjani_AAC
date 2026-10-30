// ============================================================================
// TEST SUITE: DISPATCH INVENTORY STOCK AUTHORITATIVE VALIDATION
// Verifies that sales order dispatch validates stock strictly against
// the Inventory Page (inventory_items.stock) and NOT against production
// page records (stock_batches).
// ============================================================================

const assert = require('assert');
const dispatchCore = require('../assets/js/dispatch-core.js');

const { Service, StockGuard } = dispatchCore;

class MockQuery {
  constructor(table, client, tableName) {
    this.table = table;
    this.client = client;
    this.tableName = tableName;
    this.filters = [];
    this.updateData = null;
    this.isDelete = false;
  }

  select() { return this; }
  eq(col, val) {
    this.filters.push(row => row[col] === val || String(row[col]) === String(val));
    return this;
  }
  ilike(col, val) {
    const pattern = val.replace(/%/g, '').toLowerCase();
    this.filters.push(row => String(row[col] || '').toLowerCase().includes(pattern));
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
      inventory_items: [],
      products: [],
      stock_batches: []
    };
    this._nextId = 6000;
  }

  from(tableName) {
    if (!this.tables[tableName]) this.tables[tableName] = [];
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

    query.update = function (updates) {
      query.updateData = updates;
      return query;
    };

    return query;
  }
}

async function run() {
  console.log('Testing Dispatch Stock Validation via Inventory Page (inventory_items)...');

  const client = new MockDbClient();

  // 1. Setup Inventory Item (Coragen has 522.25 Litres in Inventory Page)
  client.tables.inventory_items.push({
    id: 22,
    name: 'Anjani Coragen-80 Ec',
    category: 'Finished Goods',
    stock: 522.25,
    unit: 'Litre'
  });

  // 2. Setup Production Batch in stock_batches (only has 100 units from a manufacturing run)
  client.tables.stock_batches.push({
    id: 53,
    batch_no: 'B-01',
    item_id: 22,
    item_name: 'Anjani Coragen-80 Ec',
    current_qty: 100, // LESS than requested 150 units!
    qc_status: 'Approved',
    is_quarantine: false
  });

  // 3. Setup Order O-03 with 150 units of Anjani Coragen-80 Ec 50ml
  client.tables.orders.push({
    id: 3,
    order_no: 'O-03',
    client_name: 'Farmer Co-op',
    status: 'Confirmed'
  });

  client.tables.order_items.push({
    id: 40,
    order_id: 3,
    product_id: 22,
    inventory_item_id: 22,
    product_name: 'Anjani Coragen-80 Ec 50ml',
    packing_size: '50 Ml',
    bottles_per_box: 10,
    ordered_units: 150,
    dispatched_units: 0,
    remaining_units: 150,
    unit_price: 250
  });

  // Test Case A: Dispatch 150 units MUST SUCCEED despite production batch having only 100 units
  const prepResult = await Service.prepareDispatch(client, {
    order_id: 3,
    dispatch_no: 'DSP-003',
    items: [
      {
        order_item_id: 40,
        stock_batch_id: null,
        batch_no: 'B-01',
        total_units_dispatched: 150,
        units_per_box: 10
      }
    ]
  });

  assert.strictEqual(prepResult.success, true, 'Dispatch preparation must succeed!');
  assert.strictEqual(prepResult.totalUnits, 150);
  assert.strictEqual(prepResult.totalBoxes, 15);
  console.log('✓ Test A Passed: Dispatch of 150 units succeeded seamlessly based on inventory stock (522.25L).');

  // Test Case B: Direct StockGuard validation when inventory has stock
  const validCheck = await StockGuard.validateBatchForDispatch(client, {
    batchNo: 'B-01',
    requestedUnits: 150,
    orderItem: client.tables.order_items[0],
    productId: 22,
    productName: 'Anjani Coragen-80 Ec 50ml',
    packagingSize: '50 Ml'
  });
  assert.strictEqual(validCheck.valid, true);
  console.log('✓ Test B Passed: StockGuard correctly validates against inventory_items.');

  // Test Case C: Out of stock inventory item throws user-friendly inventory error
  client.tables.inventory_items[0].stock = 0;
  await assert.rejects(
    async () => {
      await StockGuard.validateBatchForDispatch(client, {
        batchNo: 'B-01',
        requestedUnits: 150,
        orderItem: client.tables.order_items[0],
        productId: 22,
        productName: 'Anjani Coragen-80 Ec 50ml',
        packagingSize: '50 Ml'
      });
    },
    /INSUFFICIENT_STOCK_FOR_DISPATCH: Inventory item "Anjani Coragen-80 Ec" is out of stock/
  );
  console.log('✓ Test C Passed: StockGuard correctly detects exhausted inventory on the Inventory Page.');

  console.log('\nAll inventory-anchored dispatch tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
