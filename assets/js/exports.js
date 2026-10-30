/* assets/js/exports.js - Comprehensive Data Exports & Master Workbook Generator */

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Exports: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadExports() {
  updatePageDebug('Ready', '#0C3925');
  setExportPreset('fy');
}

/**
 * Fetch raw table data respecting tenant and company scoping
 */
async function fetchExportData(tableName, from, to) {
  let query = window.dbClient.from(tableName).select('*');

  // Company scoping via TENANT_CONTEXT
  if (window.TENANT_CONTEXT) {
    query = window.TENANT_CONTEXT.filter(query);
  }
  
  // Date filters where supported
  if (['orders', 'daily_transactions', 'purchases', 'transactions', 'expenses', 'order_dispatches'].includes(tableName)) {
    const dateCol = (tableName === 'order_dispatches') ? 'dispatch_date' : 'date';
    if (from) query = query.gte(dateCol, from);
    if (to) query = query.lte(dateCol, to);
  }
  
  const { data, error } = await query;
  if (error) {
    console.warn(`Error fetching ${tableName}:`, error);
    return [];
  }
  
  let records = data || [];
  
  switch(tableName) {
    case 'orders':
      records = UTILS.sortByNumericIdDesc(records, o => o.order_no || o.id);
      break;
    case 'purchases':
      records = UTILS.sortByNumericIdDesc(records, p => p.purchase_no || p.id);
      break;
    case 'daily_transactions':
      records = UTILS.sortByNumericIdDesc(records, dt => dt.txn_no || dt.id);
      break;
    case 'order_dispatches':
      records = UTILS.sortByNumericIdDesc(records, d => d.dispatch_no || d.id);
      break;
    case 'transactions':
      records = UTILS.sortByNumericIdDesc(records, t => t.ref_no || t.id);
      break;
    default:
      records = UTILS.sortByNumericIdDesc(records, r => r.id);
      break;
  }
  
  return records;
}

/**
 * Clean Single Table Export (Excel)
 */
async function exportTable(tableName, label) {
  if (window.RBAC && !window.RBAC.hasPermission(tableName, 'export') && !window.RBAC.hasPermission('reports', 'export')) {
    APP.showToast('You do not have permission to export this data', 'error');
    return;
  }

  try {
    APP.showSpinner();
    const data = await fetchExportData(tableName);
    if (!data.length) { 
      APP.showToast('No data to export', 'warning'); 
      return; 
    }
    
    let cleanData = data;
    switch(tableName) {
      case 'clients':
        cleanData = data.map(c => ({ 'ID': c.id, 'Client Name': c.name, 'Contact': c.contact, 'Email': c.email, 'City': c.city, 'GSTIN': c.gst, 'Type': c.type, 'Credit Limit': c.credit_limit, 'Balance': c.balance }));
        break;
      case 'products':
        cleanData = data.map(p => ({ 'ID': p.id, 'Product Name': p.name, 'Category': p.category, 'Base Unit': p.unit, 'Reorder Level': p.reorder_level, 'Cost Price': p.purchase_price, 'Selling Price': p.sell_price }));
        break;
      case 'orders':
        cleanData = data.map(o => ({ 'Order No': o.order_no, 'Client': o.client_name, 'Booking Date': o.date, 'Order Status': o.status, 'Dispatch Status': o.dispatch_status || 'Pending', 'Billed Amount': o.total_amount, 'Paid Amount': o.paid_amount, 'Balance': (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0) }));
        break;
      case 'purchases':
        cleanData = data.map(p => ({ 'Purchase No': p.purchase_no, 'Supplier': p.supplier_name, 'Date': p.date, 'Status': p.status, 'Total Amount': p.total_amount, 'Paid Amount': p.paid_amount }));
        break;
      case 'transactions':
        cleanData = data.map(t => ({ 'Date': t.date, 'Type': t.type, 'Ref No': t.ref_no, 'Party': t.party_name, 'Amount': t.amount, 'Payment Mode': t.mode, 'Notes': t.notes }));
        break;
      case 'expenses':
        cleanData = data.map(e => ({ 'Ref No': 'EXP-' + String(e.id).padStart(3, '0'), 'Date': e.date, 'Category': e.category, 'Description': e.notes || '', 'Amount': e.amount, 'Payment Mode': e.payment_mode }));
        break;
      case 'suppliers':
        cleanData = data.map(s => ({ 'Supplier Name': s.name, 'Contact': s.contact, 'Email': s.email, 'City': s.city, 'GSTIN': s.gst, 'Balance': s.balance }));
        break;
      case 'daily_transactions':
        cleanData = data.map(dt => ({ 'Txn No': dt.txn_no || dt.id, 'Client': dt.client_name, 'Date': dt.date, 'Total Amount': dt.total_amount, 'Paid Amount': dt.paid_amount }));
        break;
    }
    
    UTILS.exportToExcel(cleanData, label);
    APP.showToast(`${label} exported to Excel!`, 'success');
  } catch (err) {
    APP.showToast('Export failed: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
  }
}

/**
 * Clean Single Table Export (CSV)
 */
async function exportCSV(tableName, label) {
  if (window.RBAC && !window.RBAC.hasPermission(tableName, 'export') && !window.RBAC.hasPermission('reports', 'export')) {
    APP.showToast('You do not have permission to export this data', 'error');
    return;
  }

  try {
    APP.showSpinner();
    const data = await fetchExportData(tableName);
    if (!data.length) { 
      APP.showToast('No data to export', 'warning'); 
      return; 
    }
    UTILS.exportToCSV(data, label);
  } catch (err) {
    APP.showToast('Export failed: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
  }
}

/**
 * Export Analytical Calculated Registers (Customer Sales, Product SKUs, Monthly Trends)
 */
async function exportAnalyticalReport(reportType, format = 'excel') {
  if (window.RBAC && !window.RBAC.hasPermission('reports', 'export')) {
    APP.showToast('You do not have permission to export reports', 'error');
    return;
  }

  APP.showSpinner();
  try {
    const fromEl = document.getElementById('export-date-from');
    const toEl = document.getElementById('export-date-to');
    const dateFrom = fromEl ? fromEl.value : '';
    const dateTo = toEl ? toEl.value : '';

    const filters = { dateFrom, dateTo };

    // Fetch necessary analytical tables in parallel
    const [
      orders,
      orderItems,
      dispatches,
      clients,
      products,
      packaging,
      reversals
    ] = await Promise.all([
      fetchExportData('orders', dateFrom, dateTo),
      fetchExportData('order_items'),
      fetchExportData('order_dispatches', dateFrom, dateTo),
      fetchExportData('clients'),
      fetchExportData('products'),
      fetchExportData('product_packaging'),
      fetchExportData('dispatch_reversals')
    ]);

    const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;
    if (!core) throw new Error('Reports Core Analytics Engine not loaded');

    let exportData = [];
    let fileLabel = '';

    if (reportType === 'customer_sales') {
      const report = core.getCustomerSalesReport({
        orders,
        orderItems,
        dispatches,
        dispatchItems: [],
        clients,
        invoices: [],
        reversals,
        filters
      });
      exportData = core.formatCustomerSalesForExport(report);
      fileLabel = `Customer_Annual_Sales_Register_${dateFrom || 'All'}_to_${dateTo || 'All'}`;
    } else if (reportType === 'product_skus') {
      const report = core.getProductSalesReport({
        orders,
        orderItems,
        products,
        packaging,
        reversals,
        filters
      });
      exportData = core.formatProductSalesForExport(report);
      fileLabel = `Product_SKU_Packaging_Breakdown_${dateFrom || 'All'}_to_${dateTo || 'All'}`;
    } else if (reportType === 'monthly_trends') {
      const report = core.getMonthlyTrendReport({
        orders,
        dispatches,
        reversals,
        filters
      });
      exportData = core.ExportFormatter.formatMonthlyTrendsForExport(report);
      fileLabel = `Monthly_Commercial_Sales_Trends_${dateFrom || 'All'}_to_${dateTo || 'All'}`;
    }

    if (!exportData || !exportData.length) {
      APP.showToast('No records found for the selected dates', 'warning');
      return;
    }

    if (format === 'excel' && window.XLSX) {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, reportType.slice(0, 31));
      XLSX.writeFile(wb, `${fileLabel}.xlsx`);
      APP.showToast('Analytical report exported to Excel!', 'success');
    } else {
      const csvStr = core.generateCsvString(exportData, fileLabel.replace(/_/g, ' '));
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      APP.showToast('Analytical report exported to CSV!', 'success');
    }
  } catch (err) {
    console.error('exportAnalyticalReport error:', err);
    APP.showToast('Export failed: ' + err.message, 'error');
  } finally {
    APP.hideSpinner();
  }
}

/**
 * Export Master Consolidated Multi-Sheet Excel Workbook
 */
async function exportFullConsolidatedWorkbook() {
  if (!window.XLSX) { 
    APP.showToast('SheetJS engine not loaded', 'error'); 
    return; 
  }
  if (window.RBAC && !window.RBAC.hasPermission('reports', 'export')) {
    APP.showToast('You do not have permission to export master workbooks', 'error');
    return;
  }

  APP.showSpinner();
  try {
    const fromEl = document.getElementById('export-date-from');
    const toEl = document.getElementById('export-date-to');
    const dateFrom = fromEl ? fromEl.value : '';
    const dateTo = toEl ? toEl.value : '';
    const filters = { dateFrom, dateTo };

    const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;

    const [
      orders,
      orderItems,
      dispatches,
      clients,
      products,
      packaging,
      reversals,
      purchases,
      transactions,
      expenses
    ] = await Promise.all([
      fetchExportData('orders', dateFrom, dateTo),
      fetchExportData('order_items'),
      fetchExportData('order_dispatches', dateFrom, dateTo),
      fetchExportData('clients'),
      fetchExportData('products'),
      fetchExportData('product_packaging'),
      fetchExportData('dispatch_reversals'),
      fetchExportData('purchases', dateFrom, dateTo),
      fetchExportData('transactions', dateFrom, dateTo),
      fetchExportData('expenses', dateFrom, dateTo)
    ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Customer Sales Analytics with Totals
    if (core) {
      const custReport = core.getCustomerSalesReport({ orders, orderItems, dispatches, clients, reversals, filters });
      const custData = core.formatCustomerSalesForExport(custReport);
      if (custData.length) {
        const ws = XLSX.utils.json_to_sheet(custData);
        XLSX.utils.book_append_sheet(wb, ws, 'Customer_Sales');
      }

      // Sheet 2: Product & SKU Packaging Breakdown with Totals
      const prodReport = core.getProductSalesReport({ orders, orderItems, products, packaging, reversals, filters });
      const prodData = core.formatProductSalesForExport(prodReport);
      if (prodData.length) {
        const ws = XLSX.utils.json_to_sheet(prodData);
        XLSX.utils.book_append_sheet(wb, ws, 'Product_SKUs');
      }

      // Sheet 3: Monthly Trends with Totals
      const moReport = core.getMonthlyTrendReport({ orders, dispatches, reversals, filters });
      const moData = core.ExportFormatter.formatMonthlyTrendsForExport(moReport);
      if (moData.length) {
        const ws = XLSX.utils.json_to_sheet(moData);
        XLSX.utils.book_append_sheet(wb, ws, 'Monthly_Trends');
      }
    }

    // Sheet 4: Raw Orders
    if (orders.length) {
      const ws = XLSX.utils.json_to_sheet(orders.map(o => ({
        'Order No': o.order_no,
        'Client': o.client_name,
        'Date': o.date,
        'Order Status': o.status,
        'Dispatch Status': o.dispatch_status || 'Pending',
        'Billed Amount': o.total_amount,
        'Paid Amount': o.paid_amount,
        'Balance': (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0)
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Orders_Register');
    }

    // Sheet 5: Dispatches
    if (dispatches.length) {
      const ws = XLSX.utils.json_to_sheet(dispatches.map(d => ({
        'Dispatch Slip': d.dispatch_no,
        'Order Ref': d.order_no,
        'Client': d.client_name,
        'Date': d.dispatch_date,
        'Vehicle': d.vehicle_no,
        'Boxes': d.total_boxes_dispatched,
        'Loose': d.total_loose_dispatched,
        'Total Units': d.total_units_dispatched,
        'Status': d.status
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Dispatches_Register');
    }

    // Sheet 6: Clients Master
    if (clients.length) {
      const ws = XLSX.utils.json_to_sheet(clients.map(c => ({
        'ID': c.id,
        'Name': c.name,
        'Contact': c.contact,
        'City': c.city,
        'Type': c.type,
        'Credit Limit': c.credit_limit,
        'Balance': c.balance
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Clients_Master');
    }

    // Sheet 7: Products Master
    if (products.length) {
      const ws = XLSX.utils.json_to_sheet(products.map(p => ({
        'ID': p.id,
        'Name': p.name,
        'Unit': p.unit,
        'Cost Price': p.purchase_price,
        'Selling Price': p.sell_price
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Products_Master');
    }

    const filename = `AgroChem_ERP_Master_Consolidated_Report_${UTILS.todayStr()}.xlsx`;
    XLSX.writeFile(wb, filename);
    APP.showToast('Master multi-sheet Excel workbook exported successfully!', 'success');
  } catch(e) {
    console.error('exportFullConsolidatedWorkbook error:', e);
    APP.showToast('Master export failed: ' + e.message, 'error');
  } finally {
    APP.hideSpinner();
  }
}

/**
 * Set Extended Date Presets
 */
function setExportPreset(type) {
  const fromEl = document.getElementById('export-date-from');
  const toEl = document.getElementById('export-date-to');
  if (!fromEl || !toEl) return;

  const core = window.REPORTS_CORE ? window.REPORTS_CORE.DateRangeHelper : null;
  if (!core) return;

  let presetKey = 'financial_year';
  switch(type) {
    case 'today': presetKey = 'today'; break;
    case 'week': presetKey = 'week'; break;
    case 'month': presetKey = 'month'; break;
    case 'quarter': presetKey = 'quarter'; break;
    case 'fy': presetKey = 'financial_year'; break;
    case 'year': presetKey = 'calendar_year'; break;
    case 'all':
      fromEl.value = '';
      toEl.value = '';
      return;
  }

  const range = core.computeDateRange(presetKey);
  fromEl.value = range.from;
  toEl.value = range.to;
}

function selectAllExportModules(status) {
  const ids = ['orders', 'daily_transactions', 'purchases', 'transactions', 'expenses', 'products', 'clients', 'suppliers'];
  ids.forEach(id => {
    const el = document.getElementById('chk-' + id);
    if (el) el.checked = status;
  });
}

async function bulkExportCSV() {
  const fromEl = document.getElementById('export-date-from');
  const toEl = document.getElementById('export-date-to');
  const from = fromEl ? fromEl.value : '';
  const to = toEl ? toEl.value : '';
  
  const tables = [
    { id: 'orders', label: 'Sales_Orders' },
    { id: 'daily_transactions', label: 'Daily_Transactions' },
    { id: 'purchases', label: 'Purchase_Orders' },
    { id: 'transactions', label: 'Ledger_Transactions' },
    { id: 'expenses', label: 'Operational_Expenses' },
    { id: 'products', label: 'Products_Stock_Master' },
    { id: 'clients', label: 'Client_Registry_Master' },
    { id: 'suppliers', label: 'Supplier_Directory_Master' }
  ];
  
  const selectedTables = tables.filter(t => {
    const chk = document.getElementById('chk-' + t.id);
    return chk && chk.checked;
  });
  
  if (selectedTables.length === 0) {
    APP.showToast('Please select at least one module to export', 'warning');
    return;
  }
  
  APP.showSpinner();
  let exportCount = 0;
  
  for (let i = 0; i < selectedTables.length; i++) {
    const table = selectedTables[i];
    try {
      const data = await fetchExportData(table.id, from, to);
      
      if (data.length === 0) {
        continue;
      }
      
      let rangeTag = (from && to) ? `${from}_to_${to}` : 'All_Time';
      const fileName = `${table.label}_${rangeTag}`;
      UTILS.exportToCSV(data, fileName);
      exportCount++;
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (err) {
      console.error(`Failed to export ${table.label}:`, err);
    }
  }
  
  APP.hideSpinner();
  if (exportCount > 0) {
    APP.showToast(`Successfully exported ${exportCount} modules to CSV!`, 'success');
  } else {
    APP.showToast('No records found to export', 'warning');
  }
}

// Window global bindings
window.setExportPreset = setExportPreset;
window.selectAllExportModules = selectAllExportModules;
window.bulkExportCSV = bulkExportCSV;
window.exportTable = exportTable;
window.exportCSV = exportCSV;
window.exportAnalyticalReport = exportAnalyticalReport;
window.exportFullConsolidatedWorkbook = exportFullConsolidatedWorkbook;

loadExports();
