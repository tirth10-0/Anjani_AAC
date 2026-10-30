const fs = require('fs');
const XLSX = require('xlsx');
const reportsCore = require('../assets/js/reports-core.js');
const core = reportsCore.Service;

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}: ${details}`);
    failedTests++;
  }
}

console.log('================================================================');
console.log('COMPREHENSIVE EXCEL EXPORT & SCENARIOS VERIFICATION TEST SUITE');
console.log('================================================================\n');

// Mock master data
const mockClients = [
  { id: 101, name: 'Adarsh Krishi Kendra', type: 'Dealer', city: 'Surat', credit_limit: 100000, balance: 15000 },
  { id: 102, name: 'Bharat Kisan Seva', type: 'Retailer', city: 'Ahmedabad', credit_limit: 50000, balance: 0 },
  { id: 103, name: 'Chamunda Agro Tech', type: 'Distributor', city: 'Baroda', credit_limit: 200000, balance: 45000 },
  { id: 104, name: 'Dormant Agri Corp', type: 'Retailer', city: 'Rajkot', credit_limit: 20000, balance: 0 } // No transactions in period
];

const mockOrders = [
  // Scenario 1: Customer 101, Order 1: 1 order, 1 product
  {
    id: 201,
    order_no: 'O-201',
    client_id: 101,
    client_name: 'Adarsh Krishi Kendra',
    date: '2026-04-10',
    status: 'Completed',
    dispatch_status: 'Fully Dispatched',
    total_amount: 13000,
    paid_amount: 13000,
    discount: 0,
    tax: 0,
    notes: 'DISPATCH_META: {"items_meta":[{"id":301,"order_item_id":301,"product_id":"1","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":20,"total_units":20,"bottles_per_box":10,"box_quantity":2,"loose_quantity":0,"ordered_units":20,"dispatched_units":20,"remaining_units":0}],"dispatches":[{"id":501,"dispatch_no":"DSP-201","order_id":201,"order_no":"O-201","dispatch_date":"2026-04-11","status":"Dispatched","total_boxes_dispatched":2,"total_loose_dispatched":0,"total_units_dispatched":20,"invoice_no":"INV-201","items":[{"order_item_id":301,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"boxes_dispatched":2,"loose_dispatched":0,"total_units_dispatched":20,"unit_price":650,"total_amount":13000}]}]}'
  },
  // Scenario 2 & 11: Customer 102, Order 2: Multiple products in one order, different UOMs (Litre vs Kg vs ml)
  {
    id: 202,
    order_no: 'O-202',
    client_id: 102,
    client_name: 'Bharat Kisan Seva',
    date: '2026-05-15',
    status: 'Completed',
    dispatch_status: 'Fully Dispatched',
    total_amount: 52000,
    paid_amount: 20000,
    discount: 0,
    tax: 0,
    notes: 'DISPATCH_META: {"items_meta":[{"id":302,"order_item_id":302,"product_id":"2","product_name":"Afield Coragen-80 Ec","packing_size":"500 ml","packaging_size":"500 ml","quantity":20,"total_units":20,"bottles_per_box":20,"box_quantity":1,"loose_quantity":0,"ordered_units":20,"dispatched_units":20,"remaining_units":0},{"id":303,"order_item_id":303,"product_id":"3","product_name":"Afield Sulfo-80 Wdg","packing_size":"1 Kg","packaging_size":"1 Kg","quantity":10,"total_units":10,"bottles_per_box":10,"box_quantity":1,"loose_quantity":0,"ordered_units":10,"dispatched_units":10,"remaining_units":0}],"dispatches":[{"id":502,"dispatch_no":"DSP-202","order_id":202,"order_no":"O-202","dispatch_date":"2026-05-16","status":"Dispatched","total_boxes_dispatched":2,"total_loose_dispatched":0,"total_units_dispatched":30,"invoice_no":"INV-202","items":[{"order_item_id":302,"product_name":"Afield Coragen-80 Ec","packaging_size":"500 ml","units_per_box":20,"boxes_dispatched":1,"loose_dispatched":0,"total_units_dispatched":20,"unit_price":2000,"total_amount":40000},{"order_item_id":303,"product_name":"Afield Sulfo-80 Wdg","packaging_size":"1 Kg","units_per_box":10,"boxes_dispatched":1,"loose_dispatched":0,"total_units_dispatched":10,"unit_price":1200,"total_amount":12000}]}]}'
  },
  // Scenario 3 & 7: Customer 103, Order 3: Same product in multiple packaging sizes, with loose units
  {
    id: 203,
    order_no: 'O-203',
    client_id: 103,
    client_name: 'Chamunda Agro Tech',
    date: '2026-06-01',
    status: 'Completed',
    dispatch_status: 'Fully Dispatched',
    total_amount: 32500,
    paid_amount: 0,
    discount: 0,
    tax: 0,
    notes: 'DISPATCH_META: {"items_meta":[{"id":304,"order_item_id":304,"product_id":"1","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":25,"total_units":25,"bottles_per_box":10,"box_quantity":2,"loose_quantity":5,"ordered_units":25,"dispatched_units":25,"remaining_units":0},{"id":305,"order_item_id":305,"product_id":"1","product_name":"Afield Chlor-20 Ec","packing_size":"500 ml","packaging_size":"500 ml","quantity":35,"total_units":35,"bottles_per_box":20,"box_quantity":1,"loose_quantity":15,"ordered_units":35,"dispatched_units":35,"remaining_units":0}],"dispatches":[{"id":503,"dispatch_no":"DSP-203","order_id":203,"order_no":"O-203","dispatch_date":"2026-06-02","status":"Dispatched","total_boxes_dispatched":3,"total_loose_dispatched":20,"total_units_dispatched":60,"invoice_no":"INV-203","items":[{"order_item_id":304,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"boxes_dispatched":2,"loose_dispatched":5,"total_units_dispatched":25,"unit_price":650,"total_amount":16250},{"order_item_id":305,"product_name":"Afield Chlor-20 Ec","packaging_size":"500 ml","units_per_box":20,"boxes_dispatched":1,"loose_dispatched":15,"total_units_dispatched":35,"unit_price":464.28,"total_amount":16250}]}]}'
  },
  // Scenario 5 & 6: Customer 103, Order 4: Partially dispatched order with MULTIPLE dispatches
  {
    id: 204,
    order_no: 'O-204',
    client_id: 103,
    client_name: 'Chamunda Agro Tech',
    date: '2026-07-10',
    status: 'In Progress',
    dispatch_status: 'Partially Dispatched',
    total_amount: 65000,
    paid_amount: 20000,
    discount: 0,
    tax: 0,
    notes: 'DISPATCH_META: {"items_meta":[{"id":306,"order_item_id":306,"product_id":"1","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"ordered_units":100,"dispatched_units":60,"remaining_units":40}],"dispatches":[{"id":504,"dispatch_no":"DSP-204-A","order_id":204,"order_no":"O-204","dispatch_date":"2026-07-11","status":"Dispatched","total_boxes_dispatched":3,"total_loose_dispatched":0,"total_units_dispatched":30,"invoice_no":"INV-204-A","items":[{"order_item_id":306,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"boxes_dispatched":3,"loose_dispatched":0,"total_units_dispatched":30,"unit_price":650,"total_amount":19500}]},{"id":505,"dispatch_no":"DSP-204-B","order_id":204,"order_no":"O-204","dispatch_date":"2026-07-15","status":"Dispatched","total_boxes_dispatched":3,"total_loose_dispatched":0,"total_units_dispatched":30,"invoice_no":"INV-204-B","items":[{"order_item_id":306,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"boxes_dispatched":3,"loose_dispatched":0,"total_units_dispatched":30,"unit_price":650,"total_amount":19500}]}]}'
  },
  // Scenario 8: Customer 101, Order 5: Cancelled order
  {
    id: 205,
    order_no: 'O-205',
    client_id: 101,
    client_name: 'Adarsh Krishi Kendra',
    date: '2026-08-01',
    status: 'Cancelled',
    dispatch_status: 'Cancelled',
    total_amount: 19500,
    paid_amount: 0,
    discount: 0,
    tax: 0,
    notes: 'DISPATCH_META: {"items_meta":[{"id":307,"order_item_id":307,"product_id":"1","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":30,"total_units":30,"bottles_per_box":10,"box_quantity":3,"loose_quantity":0,"ordered_units":30,"dispatched_units":0,"remaining_units":30}],"dispatches":[]}'
  }
];

const mockOrderItems = [
  { id: 301, order_id: 201, product_id: 1, product_name: 'Afield Chlor-20 Ec', packing_size: '1 Litre', quantity: 20, unit_price: 650, discount: 0, total: 13000 },
  { id: 302, order_id: 202, product_id: 2, product_name: 'Afield Coragen-80 Ec', packing_size: '500 ml', quantity: 20, unit_price: 2000, discount: 0, total: 40000 },
  { id: 303, order_id: 202, product_id: 3, product_name: 'Afield Sulfo-80 Wdg', packing_size: '1 Kg', quantity: 10, unit_price: 1200, discount: 0, total: 12000 },
  { id: 304, order_id: 203, product_id: 1, product_name: 'Afield Chlor-20 Ec', packing_size: '1 Litre', quantity: 25, unit_price: 650, discount: 0, total: 16250 },
  { id: 305, order_id: 203, product_id: 1, product_name: 'Afield Chlor-20 Ec', packing_size: '500 ml', quantity: 35, unit_price: 464.28, discount: 0, total: 16250 },
  { id: 306, order_id: 204, product_id: 1, product_name: 'Afield Chlor-20 Ec', packing_size: '1 Litre', quantity: 100, unit_price: 650, discount: 0, total: 65000 },
  { id: 307, order_id: 205, product_id: 1, product_name: 'Afield Chlor-20 Ec', packing_size: '1 Litre', quantity: 30, unit_price: 650, discount: 0, total: 19500 }
];

// Scenario 9: Reversal / Return on Order 201
const mockReversals = [
  {
    id: 901,
    order_id: 201,
    dispatch_id: 501,
    client_id: 101,
    return_date: '2026-04-20',
    reason: 'Customer damaged seal return',
    items_reversed: [
      { order_item_id: 301, product_name: 'Afield Chlor-20 Ec', total_units: 5, unit_price: 650 }
    ]
  }
];

// Run Tests
async function runAllTests() {
  // Test Customer Report Generation
  const custReport = core.getCustomerSalesReport({
    orders: mockOrders,
    orderItems: mockOrderItems,
    clients: mockClients,
    reversals: mockReversals
  });

  const summaryData = core.formatCustomerSalesForExport(custReport);
  const productDetailsData = core.formatCustomerProductDetailsForExport({
    orders: mockOrders,
    orderItems: mockOrderItems,
    clients: mockClients,
    reversals: mockReversals
  });
  const transactionsData = core.formatSalesTransactionsForExport({
    orders: mockOrders,
    orderItems: mockOrderItems,
    clients: mockClients,
    reversals: mockReversals
  });

  // Verify Scenario 1: Customer with one order & one product
  const rowS1 = productDetailsData.find(r => r['Order Number'] === 'O-201');
  assert(rowS1 && rowS1['Product Name'] === 'Afield Chlor-20 Ec' && rowS1['Total Ordered Quantity'] === 20 && rowS1['Total Dispatched Quantity'] === 20,
    'Scenario 1: Single order, single product correctly resolved',
    JSON.stringify(rowS1));

  // Verify Scenario 2: Multiple products in one order
  const rowsS2 = productDetailsData.filter(r => r['Order Number'] === 'O-202');
  assert(rowsS2.length === 2 && rowsS2.some(r => r['Product Name'] === 'Afield Coragen-80 Ec') && rowsS2.some(r => r['Product Name'] === 'Afield Sulfo-80 Wdg'),
    'Scenario 2: Multiple products in single order (O-202) mapped accurately into distinct rows');

  // Verify Scenario 3: Same product in multiple packaging sizes
  const rowsS3 = productDetailsData.filter(r => r['Order Number'] === 'O-203');
  const chlor1L = rowsS3.find(r => r['Packaging Size'] === '1 Litre');
  const chlor500m = rowsS3.find(r => r['Packaging Size'] === '500 ml');
  assert(chlor1L && chlor500m && chlor1L['Packaging Size'] !== chlor500m['Packaging Size'],
    'Scenario 3: Same product in distinct packaging sizes (1 Litre vs 500 ml) kept distinguishable');

  // Verify Scenario 4: Customer with multiple orders
  const chamundaOrders = [...new Set(productDetailsData.filter(r => r['Customer Name'] === 'Chamunda Agro Tech').map(r => r['Order Number']))];
  assert(chamundaOrders.length >= 2,
    `Scenario 4: Customer with multiple orders (found ${chamundaOrders.join(', ')})`);

  // Verify Scenario 5: Partially dispatched order
  const rowS5 = productDetailsData.find(r => r['Order Number'] === 'O-204');
  assert(rowS5 && rowS5['Total Ordered Quantity'] === 100 && rowS5['Total Dispatched Quantity'] === 60 && rowS5['Pending Quantity'] === 40 && rowS5['Line Status'] === 'Partially Dispatched',
    'Scenario 5: Partially dispatched order accurately reflects 60 dispatched / 40 pending',
    `Ordered: ${rowS5?.['Total Ordered Quantity']}, Dispatched: ${rowS5?.['Total Dispatched Quantity']}, Pending: ${rowS5?.['Pending Quantity']}`);

  // Verify Scenario 6: Order with multiple dispatches
  assert(rowS5 && rowS5['Dispatch Reference'].includes('DSP-204-A') && rowS5['Dispatch Reference'].includes('DSP-204-B'),
    'Scenario 6: Order fulfilled across multiple dispatches consolidated references correctly',
    rowS5?.['Dispatch Reference']);

  // Verify Scenario 7: Order containing both boxes and loose units
  assert(chlor1L && chlor1L['Boxes Ordered'] === 2 && chlor1L['Loose Units Ordered'] === 5 && chlor500m['Boxes Ordered'] === 1 && chlor500m['Loose Units Ordered'] === 15,
    'Scenario 7: Boxes and loose units correctly split according to Units Per Box',
    `1L: Boxes=${chlor1L?.['Boxes Ordered']}, Loose=${chlor1L?.['Loose Units Ordered']} | 500ml: Boxes=${chlor500m?.['Boxes Ordered']}, Loose=${chlor500m?.['Loose Units Ordered']}`);

  // Verify Scenario 8: Cancelled order
  const rowS8 = productDetailsData.find(r => r['Order Number'] === 'O-205');
  assert(rowS8 && rowS8['Line Status'] === 'Cancelled' && rowS8['Cancelled Quantity'] === 30 && rowS8['Total Dispatched Quantity'] === 0,
    'Scenario 8: Cancelled order correctly reflects Cancelled status without counting as pending dispatch');

  // Verify Scenario 9: Return quantity
  assert(rowS1 && rowS1['Return Quantity'] === 5,
    'Scenario 9: Customer return reflected on order line item (5 units returned)',
    `Return Quantity: ${rowS1?.['Return Quantity']}`);

  // Verify Scenario 10: Payments and outstanding balance
  const bksSummary = summaryData.find(r => r['Customer Name'] === 'Bharat Kisan Seva');
  const bksOrderVal = bksSummary?.['Total Order Value (₹)'] ?? bksSummary?.['Total Billed (₹)'];
  const bksPaidVal = bksSummary?.['Total Payments Received (₹)'] ?? bksSummary?.['Total Paid (₹)'];
  const bksOutBal = bksSummary?.['Outstanding Invoice Balance (₹)'] ?? bksSummary?.['Outstanding Balance (₹)'];
  assert(bksSummary && bksOrderVal === 52000 && bksPaidVal === 20000 && bksOutBal === 32000,
    'Scenario 10: Customer with payment (₹20,000) and outstanding balance (₹32,000) correctly computed',
    JSON.stringify(bksSummary));

  // Verify Scenario 11: Products with different units of measurement (Bottle vs Bag vs ml)
  const coragen = rowsS2.find(r => r['Product Name'] === 'Afield Coragen-80 Ec');
  const sulfo = rowsS2.find(r => r['Product Name'] === 'Afield Sulfo-80 Wdg');
  assert(coragen && sulfo && coragen['Unit of Measurement'] === 'ml' && sulfo['Unit of Measurement'] === 'Kg',
    'Scenario 11: Different units of measurement (ml vs Kg) recognized accurately',
    `Coragen UOM: ${coragen?.['Unit of Measurement']}, Sulfo UOM: ${sulfo?.['Unit of Measurement']}`);

  // Verify Scenario 12: Customer with no transactions during report period
  const dormantSummary = summaryData.find(r => r['Customer Name'] === 'Dormant Agri Corp');
  const dormantDetails = productDetailsData.filter(r => r['Customer Name'] === 'Dormant Agri Corp');
  assert(dormantSummary && dormantSummary['Orders Count'] === 0 && dormantDetails.length === 0,
    'Scenario 12: Customer with no transactions handled gracefully (0 orders, 0 detail rows)');

  // Verify Totals and Reconciliation between Worksheet 1 and Worksheet 2
  const summaryTotalsRow = summaryData.find(r => r['Customer Name'] === 'TOTALS');
  const detailsTotalsRow = productDetailsData.find(r => r['Customer Name'] === 'TOTALS');
  assert(summaryTotalsRow && detailsTotalsRow,
    'Summary TOTALS rows present on both Worksheet 1 and Worksheet 2');

  assert(summaryTotalsRow['Ordered Units'] === 210, // 20 + 20 + 10 + 25 + 35 + 100 = 210 active ordered units
    'Worksheet 1 Summary Ordered Units correctly aggregates active orders',
    `Got: ${summaryTotalsRow?.['Ordered Units']}`);

  assert(summaryTotalsRow['Dispatched Units'] === 170, // 20 + 20 + 10 + 25 + 35 + 60 = 170 dispatched units
    'Worksheet 1 Dispatched Units reconciled',
    `Got: ${summaryTotalsRow?.['Dispatched Units']}`);

  // Multi-sheet Excel workbook generation test
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(summaryData);
  core.applySheetFormatting(ws1, summaryData, XLSX);
  XLSX.utils.book_append_sheet(wb, ws1, 'Customer Summary');

  const ws2 = XLSX.utils.json_to_sheet(productDetailsData);
  core.applySheetFormatting(ws2, productDetailsData, XLSX);
  XLSX.utils.book_append_sheet(wb, ws2, 'Customer-Wise Product Details');

  const ws3 = XLSX.utils.json_to_sheet(transactionsData);
  core.applySheetFormatting(ws3, transactionsData, XLSX);
  XLSX.utils.book_append_sheet(wb, ws3, 'Sales Transactions');

  const testFilePath = 'tests/scratch/scenario_verification_workbook.xlsx';
  XLSX.writeFile(wb, testFilePath);

  const readWb = XLSX.readFile(testFilePath);
  assert(readWb.SheetNames.length === 3 &&
         readWb.SheetNames[0] === 'Customer Summary' &&
         readWb.SheetNames[1] === 'Customer-Wise Product Details' &&
         readWb.SheetNames[2] === 'Sales Transactions',
    'Excel file generated with 3 required worksheets: Customer Summary, Customer-Wise Product Details, Sales Transactions');

  // Verify Column Types (Numbers as numbers, not text)
  const ws2Read = readWb.Sheets['Customer-Wise Product Details'];
  // Check rate cell
  const rateCell = ws2Read['T2']; // Unit Rate column
  assert(rateCell && rateCell.t === 'n' && typeof rateCell.v === 'number',
    'Numeric values stored as native Excel numbers (t: "n") for formulas and analysis',
    `Type: ${rateCell?.t}, Val: ${rateCell?.v}`);

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================');

  if (failedTests > 0) process.exit(1);
}

runAllTests();
