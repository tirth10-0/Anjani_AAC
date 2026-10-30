const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
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

async function runLiveDbAuditTest() {
  console.log('================================================================');
  console.log('LIVE DATABASE EXCEL EXPORT RECONCILIATION TEST');
  console.log('================================================================\n');

  const env = fs.readFileSync('assets/js/database.js', 'utf8');
  const urlMatch = env.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
  const keyMatch = env.match(/supabaseKey\s*=\s*['"]([^'"]+)['"]/);
  const sb = createClient(urlMatch[1], keyMatch[1]);

  const [
    { data: orders },
    { data: orderItems },
    { data: clients },
    { data: products },
    { data: inventoryItems }
  ] = await Promise.all([
    sb.from('orders').select('*'),
    sb.from('order_items').select('*'),
    sb.from('clients').select('*'),
    sb.from('products').select('*'),
    sb.from('inventory_items').select('*')
  ]);

  console.log(`Live DB Records Loaded:`);
  console.log(`  Orders: ${orders.length}`);
  console.log(`  Order Items: ${orderItems.length}`);
  console.log(`  Clients: ${clients.length}`);
  console.log(`  Products: ${products.length}`);
  console.log(`  Inventory Items: ${inventoryItems.length}`);

  // 1. Run Core Analytics Engine for Customer Sales
  const customerReport = core.getCustomerSalesReport({
    orders,
    orderItems,
    clients,
    filters: {}
  });

  // Format Worksheet 1: Customer Summary
  const summaryData = core.formatCustomerSalesForExport(customerReport);
  const summaryTotals = summaryData.find(r => r['Customer Name'] === 'TOTALS');

  assert(summaryTotals !== undefined, 'Worksheet 1 Summary TOTALS row exists');
  assert(summaryTotals['Orders Count'] === 5, 'Worksheet 1 Orders Count is 5', `Got ${summaryTotals?.['Orders Count']}`);
  assert(summaryTotals['Ordered Units'] === 590, 'Worksheet 1 Ordered Units is 590', `Got ${summaryTotals?.['Ordered Units']}`);
  assert(summaryTotals['Dispatched Units'] === 590, 'Worksheet 1 Dispatched Units is 590', `Got ${summaryTotals?.['Dispatched Units']}`);
  assert(summaryTotals['Boxes Dispatched'] === 59, 'Worksheet 1 Boxes Dispatched is 59', `Got ${summaryTotals?.['Boxes Dispatched']}`);
  assert(summaryTotals['Pending Units'] === 0, 'Worksheet 1 Pending Units is 0', `Got ${summaryTotals?.['Pending Units']}`);
  assert(summaryTotals['Total Order Value (₹)'] === 610500, 'Worksheet 1 Total Order Value is ₹6,10,500', `Got ${summaryTotals?.['Total Order Value (₹)']}`);
  assert(summaryTotals['Total Invoiced Amount (₹)'] === 597500, 'Worksheet 1 Total Invoiced Amount is ₹5,97,500 (O-04 uninvoiced)', `Got ${summaryTotals?.['Total Invoiced Amount (₹)']}`);
  assert(summaryTotals['Outstanding Invoice Balance (₹)'] === 597500, 'Worksheet 1 Outstanding Invoice Balance is ₹5,97,500', `Got ${summaryTotals?.['Outstanding Invoice Balance (₹)']}`);

  // 2. Format Worksheet 2: Customer-Wise Product Details
  const productDetailsData = core.formatCustomerProductDetailsForExport({
    orders,
    orderItems,
    clients,
    products,
    inventoryItems,
    filters: {}
  });

  const detailRows = productDetailsData.filter(r => r['#'] !== 'TOTAL');
  const detailTotals = productDetailsData.find(r => r['#'] === 'TOTAL');

  assert(detailRows.length === 8, 'Worksheet 2 has exactly 8 product item rows', `Got ${detailRows.length}`);
  assert(detailTotals !== undefined, 'Worksheet 2 has TOTAL summary row');
  assert(detailTotals['Total Ordered Quantity'] === 590, 'Worksheet 2 Total Ordered Quantity is 590', `Got ${detailTotals?.['Total Ordered Quantity']}`);
  assert(detailTotals['Total Dispatched Quantity'] === 590, 'Worksheet 2 Total Dispatched Quantity is 590', `Got ${detailTotals?.['Total Dispatched Quantity']}`);
  assert(detailTotals['Line Total (₹)'] === 610500, 'Worksheet 2 Line Total sum is ₹6,10,500', `Got ${detailTotals?.['Line Total (₹)']}`);
  assert(detailTotals['Invoiced Value (₹)'] === 597500, 'Worksheet 2 Invoiced Value sum is ₹5,97,500', `Got ${detailTotals?.['Invoiced Value (₹)']}`);

  // Test Order O-04 row specifically (uninvoiced order)
  const o4Row = detailRows.find(r => r['Order Number'] === 'O-04');
  assert(o4Row !== undefined, 'Worksheet 2 contains Order O-04 row');
  assert(o4Row['Invoice Number'] === 'Not Invoiced', 'Order O-04 Invoice Number is "Not Invoiced"', `Got "${o4Row?.['Invoice Number']}"`);
  assert(o4Row['Invoice Status'] === 'Not Invoiced', 'Order O-04 Invoice Status is "Not Invoiced"', `Got "${o4Row?.['Invoice Status']}"`);
  assert(o4Row['Tax Mode'] === 'Non-GST (Uninvoiced)', 'Order O-04 Tax Mode is "Non-GST (Uninvoiced)"', `Got "${o4Row?.['Tax Mode']}"`);
  assert(o4Row['Line Total (₹)'] === 13000, 'Order O-04 Line Total is ₹13,000', `Got ${o4Row?.['Line Total (₹)']}`);
  assert(o4Row['Invoiced Value (₹)'] === 0, 'Order O-04 Invoiced Value is ₹0 without fabricating data', `Got ${o4Row?.['Invoiced Value (₹)']}`);

  // Test Packaging Details
  assert(o4Row['Bottle Type'] === 'Imida Bottle 1 Ltr', 'Order O-04 Bottle Type resolved to "Imida Bottle 1 Ltr"', `Got "${o4Row?.['Bottle Type']}"`);
  assert(o4Row['Box Type'] === 'Regular Box 1 Ltr', 'Order O-04 Box Type resolved to "Regular Box 1 Ltr"', `Got "${o4Row?.['Box Type']}"`);
  assert(o4Row['Label Name'] === 'Afield Chlor-20 Ec 1 Litre Label [ACC]', 'Order O-04 Label Name resolved accurately', `Got "${o4Row?.['Label Name']}"`);

  // 3. Format Worksheet 3: Sales Transactions
  const transactionsData = core.formatSalesTransactionsForExport({
    orders,
    orderItems,
    clients,
    products,
    filters: {}
  });

  const txRows = transactionsData.filter(r => r['Transaction Date'] !== 'TOTALS');
  const txTotals = transactionsData.find(r => r['Transaction Date'] === 'TOTALS');

  assert(txRows.length === 16, 'Worksheet 3 has exactly 16 transaction rows (8 Booked + 8 Dispatched)', `Got ${txRows.length}`);
  assert(txTotals !== undefined, 'Worksheet 3 has TOTALS summary row');
  assert(txTotals['Ordered Quantity'] === 590, 'Worksheet 3 Total Ordered Quantity is 590', `Got ${txTotals?.['Ordered Quantity']}`);
  assert(txTotals['Dispatched Quantity'] === 590, 'Worksheet 3 Total Dispatched Quantity is 590', `Got ${txTotals?.['Dispatched Quantity']}`);
  assert(txTotals['Order-Line Value (₹)'] === 610500, 'Worksheet 3 Order-Line Value sum is ₹6,10,500', `Got ${txTotals?.['Order-Line Value (₹)']}`);
  assert(txTotals['Dispatched Goods Value (₹)'] === 610500, 'Worksheet 3 Dispatched Goods Value sum is ₹6,10,500', `Got ${txTotals?.['Dispatched Goods Value (₹)']}`);
  assert(txTotals['Invoiced Sales Value (₹)'] === 597500, 'Worksheet 3 Invoiced Sales Value sum is ₹5,97,500', `Got ${txTotals?.['Invoiced Sales Value (₹)']}`);
  assert(txTotals['Amount (₹)'] === undefined, 'Worksheet 3 has NO double-counting single "Amount (₹)" column', 'Double-counting column successfully eliminated');

  // 4. Format Worksheet 4: Product & SKU Sales Breakdown
  const productReport = core.getProductSalesReport({
    orders,
    orderItems,
    products,
    filters: {}
  });

  const productSkuData = core.formatProductSalesForExport(productReport);
  const prodTotals = productSkuData.find(r => r['#'] === 'TOTAL');

  assert(prodTotals !== undefined, 'Worksheet 4 has TOTAL summary row');
  assert(prodTotals['Ordered Units'] === 590, 'Worksheet 4 Total Ordered Units is 590', `Got ${prodTotals?.['Ordered Units']}`);
  assert(prodTotals['Dispatched Units'] === 590, 'Worksheet 4 Total Dispatched Units is 590', `Got ${prodTotals?.['Dispatched Units']}`);
  assert(prodTotals['Total Order Value (₹)'] === 610500, 'Worksheet 4 Total Order Value is ₹6,10,500', `Got ${prodTotals?.['Total Order Value (₹)']}`);
  assert(prodTotals['Total Invoiced Sales (₹)'] === 597500, 'Worksheet 4 Total Invoiced Sales is ₹5,97,500', `Got ${prodTotals?.['Total Invoiced Sales (₹)']}`);

  // 5. Generate and Verify the Full Multi-Sheet Workbook (.xlsx)
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

  const ws4 = XLSX.utils.json_to_sheet(productSkuData);
  core.applySheetFormatting(ws4, productSkuData, XLSX);
  XLSX.utils.book_append_sheet(wb, ws4, 'Product & SKU Sales');

  const verifiedFilePath = 'tests/scratch/Estimate_audited_live_verification.xlsx';
  XLSX.writeFile(wb, verifiedFilePath);

  const readBack = XLSX.readFile(verifiedFilePath);
  assert(readBack.SheetNames.length === 4, 'Workbook contains all 4 required worksheets', readBack.SheetNames.join(', '));
  assert(readBack.SheetNames[0] === 'Customer Summary', 'Sheet 1 is Customer Summary');
  assert(readBack.SheetNames[1] === 'Customer-Wise Product Details', 'Sheet 2 is Customer-Wise Product Details');
  assert(readBack.SheetNames[2] === 'Sales Transactions', 'Sheet 3 is Sales Transactions');
  assert(readBack.SheetNames[3] === 'Product & SKU Sales', 'Sheet 4 is Product & SKU Sales');

  // Verify native numeric cell formatting
  const testCell = readBack.Sheets['Customer Summary']['F2']; // Ordered Units cell
  assert(testCell && testCell.t === 'n' && typeof testCell.v === 'number', 'Values are stored as native numbers (t: "n") for formulas and analysis', `Type: ${testCell?.t}, Val: ${testCell?.v}`);

  console.log('\n================================================================');
  console.log(`AUDIT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================');

  if (failedTests > 0) process.exit(1);
}

runLiveDbAuditTest().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
