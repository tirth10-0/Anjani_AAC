/* assets/js/reports.js - Comprehensive Sales Analytics & Customer 360 Controller */

let activeReportTab = 'Overview';
let activeDatePreset = 'financial_year';
let salesChart = null, expChart = null;
let currentReportDataset = null;
let selectedProfileCustomer = null;

// Global cached collections
let cachedClients = [];
let cachedCompanies = [];
let cachedProducts = [];
let cachedPackaging = [];
let cachedInventoryItems = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Reports: ' + text;
    if (color) el.style.color = color;
  }
}

/**
 * Tab Switcher
 */
function switchReportTab(tabName) {
  activeReportTab = tabName;
  document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  const tabPanes = {
    'Overview': 'tab-overview',
    'CustomerSales': 'tab-customersales',
    'ProductSales': 'tab-productsales',
    'MonthlyTrends': 'tab-monthlytrends',
    'CompanySummary': 'tab-companysummary'
  };

  Object.entries(tabPanes).forEach(([t, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.style.display = (t === tabName) ? '' : 'none';
  });
}

/**
 * Date Preset Selector
 */
function selectDatePreset(preset) {
  activeDatePreset = preset;
  document.querySelectorAll('#report-date-presets .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-preset') === preset);
  });

  const fromInput = document.getElementById('date-from');
  const toInput = document.getElementById('date-to');
  const labelEl = document.getElementById('active-range-label');

  if (preset === 'custom') {
    if (labelEl) labelEl.textContent = 'Custom Range Selected';
    return;
  }

  const range = window.REPORTS_CORE 
    ? window.REPORTS_CORE.DateRangeHelper.computeDateRange(preset)
    : { from: '', to: '' };

  if (fromInput) fromInput.value = range.from;
  if (toInput) toInput.value = range.to;
  if (labelEl) labelEl.textContent = range.label || '';

  loadReports();
}

/**
 * Initial Setup of Filter Dropdowns
 */
async function initReportFilters() {
  try {
    const [cRes, compRes, pRes, pkgRes, invItemRes] = await Promise.all([
      window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('clients').select('id, name, type, city, balance, credit_limit')) : window.dbClient.from('clients').select('id, name, type, city, balance, credit_limit'),
      window.dbClient.from('companies').select('id, name, code, is_manufacturer'),
      window.dbClient.from('products').select('id, name, unit, category, sku, sell_price, purchase_price'),
      window.dbClient.from('product_packaging').select('*'),
      window.dbClient.from('inventory_items').select('id, name, category, item_subtype, item_size')
    ]);

    cachedClients = cRes.data || [];
    cachedCompanies = compRes.data || [];
    cachedProducts = pRes.data || [];
    cachedPackaging = pkgRes.data || [];
    cachedInventoryItems = invItemRes?.data || [];

    // Populate Clients
    const clientSel = document.getElementById('filter-client');
    if (clientSel) {
      clientSel.innerHTML = '<option value="">All Customers</option>' +
        cachedClients.map(c => `<option value="${c.id}">${c.name} (${c.type || 'Retailer'})</option>`).join('');
    }

    // Populate Companies
    const compSel = document.getElementById('filter-company');
    if (compSel) {
      compSel.innerHTML = '<option value="">All Authorized Companies</option>' +
        cachedCompanies.map(c => `<option value="${c.id}">${c.name} (${c.code || 'CO'})</option>`).join('');
    }

    // Populate Products
    const prodSel = document.getElementById('filter-product');
    if (prodSel) {
      prodSel.innerHTML = '<option value="">All Products</option>' +
        cachedProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    // Initialize searchable select for quick typing of client names
    setTimeout(() => {
      if (typeof UTILS !== 'undefined' && typeof UTILS.initAllAutocompleteSelects === 'function') {
        const bodyEl = document.getElementById('advanced-filters-body');
        if (bodyEl) UTILS.initAllAutocompleteSelects(bodyEl);
      }
    }, 50);
  } catch (err) {
    console.warn('initReportFilters warning:', err);
  }
}

/**
 * Main Report Data Loader & Analytics Execution
 */
async function loadReports() {
  console.log('Loading business reports...');
  updatePageDebug('Loading Reports...', '#0C3925');

  try {
    UTILS.setSkeletonText('rpt-revenue', 'w-50', true);
    UTILS.setSkeletonText('rpt-dispatched-units', 'w-50', true);
    UTILS.setSkeletonText('rpt-pending-units', 'w-50', true);
    UTILS.setSkeletonText('rpt-outstanding', 'w-50', true);

    await DB.initDB();

    // Default dates if empty
    const fromInput = document.getElementById('date-from');
    const toInput = document.getElementById('date-to');
    if (fromInput && toInput && !fromInput.value && !toInput.value) {
      const range = window.REPORTS_CORE
        ? window.REPORTS_CORE.DateRangeHelper.computeDateRange(activeDatePreset)
        : { from: `${new Date().getFullYear()}-01-01`, to: UTILS.todayStr() };
      fromInput.value = range.from;
      toInput.value = range.to;
      const labelEl = document.getElementById('active-range-label');
      if (labelEl) labelEl.textContent = range.label || '';
    }

    const from = fromInput ? fromInput.value : '';
    const to = toInput ? toInput.value : '';

    // Active filters
    const filterClientId = document.getElementById('filter-client')?.value || null;
    const filterCompanyId = document.getElementById('filter-company')?.value || null;
    const filterProductId = document.getElementById('filter-product')?.value || null;
    const filterSku = document.getElementById('filter-sku')?.value || null;
    const filterOrderStatus = document.getElementById('filter-order-status')?.value || null;
    const filterDispatchStatus = document.getElementById('filter-dispatch-status')?.value || null;

    const filters = {
      clientId: filterClientId,
      companyId: filterCompanyId,
      productId: filterProductId,
      packagingSize: filterSku,
      status: filterOrderStatus,
      dispatchStatus: filterDispatchStatus,
      dateFrom: from,
      dateTo: to
    };

    // Parallel Database Queries with graceful table fallback
    let ordersQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('orders').select('*')) : window.dbClient.from('orders').select('*');
    let orderItemsQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('order_items').select('*')) : window.dbClient.from('order_items').select('*');
    let expensesQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('expenses').select('*')) : window.dbClient.from('expenses').select('*');
    let purchasesQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('purchases').select('*')) : window.dbClient.from('purchases').select('*');

    // Date pre-filtering on server where indexed
    if (from) {
      ordersQuery = ordersQuery.gte('date', from);
      expensesQuery = expensesQuery.gte('date', from);
      purchasesQuery = purchasesQuery.gte('date', from);
    }
    if (to) {
      ordersQuery = ordersQuery.lte('date', to);
      expensesQuery = expensesQuery.lte('date', to);
      purchasesQuery = purchasesQuery.lte('date', to);
    }

    const [
      { data: ordersData },
      { data: orderItemsData },
      { data: expensesData },
      { data: purchasesData }
    ] = await Promise.all([
      ordersQuery,
      orderItemsQuery,
      expensesQuery,
      purchasesQuery
    ]);

    const orders = ordersData || [];
    const orderItems = orderItemsData || [];
    const expenses = expensesData || [];
    const purchases = purchasesData || [];

    // Optional tables fallback
    let dispatches = [];
    let dispatchItems = [];
    let reversals = [];
    let invoices = [];

    try {
      const { data: dData } = await window.dbClient.from('order_dispatches').select('*');
      if (dData) dispatches = dData;
    } catch (_) {}

    try {
      const { data: diData } = await window.dbClient.from('dispatch_items').select('*');
      if (diData) dispatchItems = diData;
    } catch (_) {}

    try {
      const { data: revData } = await window.dbClient.from('dispatch_reversals').select('*');
      if (revData) reversals = revData;
    } catch (_) {}

    try {
      const { data: invData } = await window.dbClient.from('invoices').select('*');
      if (invData) invoices = invData;
    } catch (_) {}

    // Enrich orderItems, dispatches, and dispatchItems from orders.notes (DISPATCH_META)
    const itemsById = new Map();
    orderItems.forEach(oi => itemsById.set(String(oi.id), oi));

    orders.forEach(o => {
      if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
        try {
          const jsonStr = o.notes.replace(/^[sS]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
          const meta = JSON.parse(jsonStr);

          if (!o.dispatch_status && meta.dispatch_status) {
            o.dispatch_status = meta.dispatch_status;
          }

          if (Array.isArray(meta.items_meta)) {
            meta.items_meta.forEach(it => {
              const oi = itemsById.get(String(it.id || it.order_item_id)) ||
                         orderItems.find(x => String(x.order_id) === String(o.id) && String(x.product_id) === String(it.product_id) && String(x.packing_size) === String(it.packing_size));
              if (oi) {
                oi.ordered_units = it.ordered_units || it.total_units || oi.quantity;
                oi.dispatched_units = it.dispatched_units !== undefined ? it.dispatched_units : 0;
                oi.remaining_units = it.remaining_units !== undefined ? it.remaining_units : Math.max(0, oi.ordered_units - oi.dispatched_units);
                oi.bottles_per_box = it.bottles_per_box || oi.bottles_per_box || 10;
                oi.box_quantity = it.box_quantity !== undefined ? it.box_quantity : Math.floor(oi.ordered_units / oi.bottles_per_box);
                oi.loose_quantity = it.loose_quantity !== undefined ? it.loose_quantity : (oi.ordered_units % oi.bottles_per_box);
                oi.packing_size = it.packing_size || it.packaging_size || oi.packing_size;
                oi.packaging_size = oi.packing_size;
              }
            });
          }

          if (Array.isArray(meta.dispatches)) {
            meta.dispatches.forEach(d => {
              d.order_id = d.order_id || o.id;
              d.order_no = d.order_no || o.order_no;
              d.client_name = d.client_name || o.client_name;
              d.client_id = d.client_id || o.client_id;
              if (!dispatches.some(x => String(x.id) === String(d.id) || x.dispatch_no === d.dispatch_no)) {
                dispatches.push(d);
              }
              if (Array.isArray(d.items)) {
                d.items.forEach(dit => {
                  dit.order_id = d.order_id;
                  dit.order_no = d.order_no;
                  dit.dispatch_no = d.dispatch_no;
                  dit.dispatch_date = d.dispatch_date;
                  dit.invoice_no = d.invoice_no;
                  dispatchItems.push(dit);
                });
              }
            });
          }
        } catch (e) {
          console.warn('[Reports] Failed to parse DISPATCH_META for order', o.id, e);
        }
      }

      // Merge local storage offline dispatches
      try {
        const localDispatches = JSON.parse(localStorage.getItem('order_dispatches') || '[]');
        if (Array.isArray(localDispatches)) {
          localDispatches.forEach(ld => {
            if (String(ld.order_id) === String(o.id) && !dispatches.some(x => String(x.id) === String(ld.id) || x.dispatch_no === ld.dispatch_no)) {
              dispatches.push(ld);
            }
          });
        }
      } catch (_) {}
    });

    // Run Analytics Engine
    const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;
    if (!core) {
      throw new Error('Reports Core Analytics Engine not loaded');
    }

    const customerReport = core.getCustomerSalesReport({
      orders,
      orderItems,
      dispatches,
      dispatchItems,
      clients: cachedClients,
      invoices,
      reversals,
      filters
    });

    const productReport = core.getProductSalesReport({
      orders,
      orderItems,
      products: cachedProducts,
      packaging: cachedPackaging,
      reversals,
      filters
    });

    const monthlyReport = core.getMonthlyTrendReport({
      orders,
      dispatches,
      reversals,
      filters
    });

    const companyReport = core.getCompanySummaryReport({
      orders,
      dispatches,
      companies: cachedCompanies,
      filters
    });

    // Operational Expenses by Category
    const expCatMap = {};
    expenses.forEach(e => {
      const cat = e.category || 'General Operations';
      expCatMap[cat] = (expCatMap[cat] || 0) + (parseFloat(e.amount) || 0);
    });
    const expensesByCategory = Object.entries(expCatMap)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    currentReportDataset = {
      customerReport,
      productReport,
      monthlyReport,
      companyReport,
      expensesByCategory,
      raw: { orders, orderItems, dispatches, dispatchItems, expenses, purchases, reversals, products: cachedProducts, inventoryItems: cachedInventoryItems }
    };
    window.currentReportDataset = currentReportDataset;

    // Render Views
    renderExecutiveKPIs(customerReport.totals);
    renderCustomerSalesTable(customerReport);
    renderProductSalesTable(productReport);
    renderMonthlyTrendTable(monthlyReport);
    renderCompanySummaryTable(companyReport);
    renderCharts(monthlyReport.rows, expensesByCategory);
    renderTopSummaries(productReport.rows, customerReport.rows);

    updatePageDebug('Ready', '#0C3925');
  } catch (err) {
    console.error('loadReports failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load reports: ' + err.message, 'error');
  }
}

/**
 * Render Executive KPI Summary Cards
 */
function renderExecutiveKPIs(totals) {
  const rEl = document.getElementById('rpt-revenue');
  const dEl = document.getElementById('rpt-dispatched-units');
  const bEl = document.getElementById('rpt-boxes-summary');
  const pEl = document.getElementById('rpt-pending-units');
  const oEl = document.getElementById('rpt-outstanding');

  if (rEl) rEl.textContent = UTILS.fmtCurrency(totals.netRevenue || totals.totalBilled || 0);
  if (dEl) dEl.textContent = (totals.totalDispatchedUnits || 0).toLocaleString();
  if (bEl) bEl.textContent = `${(totals.totalBoxesDispatched || 0).toLocaleString()} boxes + ${(totals.totalLooseDispatched || 0).toLocaleString()} loose`;
  if (pEl) pEl.textContent = (totals.totalPendingUnits || 0).toLocaleString();
  if (oEl) oEl.textContent = UTILS.fmtCurrency(totals.totalOutstanding || 0);
}

/**
 * Render Tab 2: Customer-Wise Annual Sales Table
 */
function renderCustomerSalesTable(customerReport) {
  const tbody = document.querySelector('#customer-sales-table tbody');
  const tfoot = document.getElementById('customer-sales-tfoot');
  const countBadge = document.getElementById('customer-report-count-badge');
  if (!tbody) return;

  const { rows, totals } = customerReport;
  if (countBadge) countBadge.textContent = `${rows.length} Customer${rows.length !== 1 ? 's' : ''}`;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-muted" style="text-align:center; padding:30px;">No customer orders found matching the selected filters.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => {
    return `<tr>
      <td class="cell-bold">${r.clientName}</td>
      <td><span class="badge badge-neutral">${r.clientType}</span></td>
      <td>${r.city}</td>
      <td style="text-align:center;">${r.totalOrdersCount}</td>
      <td style="font-weight:600;">${r.totalOrderedUnits.toLocaleString()}</td>
      <td class="text-success" style="font-weight:700;">${r.totalDispatchedUnits.toLocaleString()}</td>
      <td style="font-size:12px; white-space:nowrap;">${r.totalBoxesDispatched} bxs + ${r.totalLooseDispatched} loose</td>
      <td style="font-weight:700; color:${r.totalPendingUnits > 0 ? 'var(--warning, #f59e0b)' : 'var(--text-muted)'}">${r.totalPendingUnits.toLocaleString()}</td>
      <td class="text-danger">${(r.totalCancelledUnits + r.totalReturnedUnits).toLocaleString()}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(r.totalBilledAmount)}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(r.totalPaidAmount)}</td>
      <td class="cell-amount text-danger" style="font-weight:700;">${UTILS.fmtCurrency(r.outstandingBalance)}</td>
      <td>
        <div style="display:inline-flex; gap:4px; align-items:center;">
          <button class="btn btn-ghost btn-sm" onclick="openCustomerProfile(${r.clientId})" title="View 360° Profile & Order History" style="padding:4px 8px; font-size:12px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Profile
          </button>
          <button class="btn btn-ghost btn-sm" onclick="exportSingleCustomerExcel(${r.clientId})" title="Download Excel Ledger for ${r.clientName}" style="padding:4px 8px; font-size:12px; color:var(--primary, #0C3925); font-weight:600;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>
      <td colspan="3" class="cell-bold">TOTAL (${rows.length} Customers)</td>
      <td style="text-align:center;">${totals.totalOrders}</td>
      <td>${totals.totalOrderedUnits.toLocaleString()}</td>
      <td class="text-success">${totals.totalDispatchedUnits.toLocaleString()}</td>
      <td>${totals.totalBoxesDispatched} bxs + ${totals.totalLooseDispatched} loose</td>
      <td style="color:var(--warning);">${totals.totalPendingUnits.toLocaleString()}</td>
      <td class="text-danger">${(totals.totalCancelledUnits + totals.totalReturnedUnits).toLocaleString()}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.totalBilled)}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(totals.totalPaid)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(totals.totalOutstanding)}</td>
      <td>—</td>
    </tr>`;
  }

  UTILS.applyMobileTableLabels('customer-sales-table');
}

/**
 * Live search filter for Customer Sales Table
 */
function filterCustomerReportTable(query) {
  const q = String(query || '').toLowerCase().trim();
  const trs = document.querySelectorAll('#customer-sales-table tbody tr');
  let visibleCount = 0;
  trs.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    if (!q || text.includes(q)) {
      tr.style.display = '';
      visibleCount++;
    } else {
      tr.style.display = 'none';
    }
  });
  const countBadge = document.getElementById('customer-report-count-badge');
  if (countBadge) {
    countBadge.textContent = q ? `${visibleCount} Found` : `${trs.length} Customer${trs.length !== 1 ? 's' : ''}`;
  }
}
window.filterCustomerReportTable = filterCustomerReportTable;

/**
 * Render Tab 3: Product & SKU Sales Table
 */
function renderProductSalesTable(productReport) {
  const tbody = document.querySelector('#product-sales-table tbody');
  const tfoot = document.getElementById('product-sales-tfoot');
  const countBadge = document.getElementById('product-report-count-badge');
  if (!tbody) return;

  const { rows, totals } = productReport;
  if (countBadge) countBadge.textContent = `${rows.length} SKU${rows.length !== 1 ? 's' : ''}`;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-muted" style="text-align:center; padding:30px;">No product sales found matching the selected filters.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td class="cell-bold">${r.productName}</td>
    <td><span class="badge badge-neutral">${r.packagingSize}</span></td>
    <td style="text-align:center;">${r.unitsPerBox}</td>
    <td style="text-align:center;">${r.ordersCount}</td>
    <td style="font-weight:600;">${r.orderedUnits.toLocaleString()}</td>
    <td class="text-success" style="font-weight:700;">${r.dispatchedUnits.toLocaleString()}</td>
    <td>${r.boxesDispatched}</td>
    <td>${r.looseDispatched}</td>
    <td style="font-weight:700; color:${r.pendingUnits > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${r.pendingUnits.toLocaleString()}</td>
    <td>${r.totalVolumeLitres.toLocaleString()} L</td>
    <td class="cell-amount">${UTILS.fmtCurrency(r.grossRevenue)}</td>
    <td class="cell-amount text-danger">${UTILS.fmtCurrency(r.returnedAmount)}</td>
    <td class="cell-amount" style="font-weight:700;">${UTILS.fmtCurrency(r.netRevenue)}</td>
  </tr>`).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>
      <td colspan="4" class="cell-bold">TOTAL (${rows.length} SKUs)</td>
      <td>${totals.totalOrderedUnits.toLocaleString()}</td>
      <td class="text-success">${totals.totalDispatchedUnits.toLocaleString()}</td>
      <td>${totals.totalBoxesDispatched}</td>
      <td>${totals.totalLooseDispatched}</td>
      <td style="color:var(--warning);">${totals.totalPendingUnits.toLocaleString()}</td>
      <td>${totals.totalVolumeLitres.toLocaleString()} L</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.grossRevenue)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(totals.returnedAmount)}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.netRevenue)}</td>
    </tr>`;
  }

  UTILS.applyMobileTableLabels('product-sales-table');
}

/**
 * Render Tab 4: Monthly & Quarterly Trends Table
 */
function renderMonthlyTrendTable(monthlyReport) {
  const tbody = document.querySelector('#monthly-trend-table tbody');
  const tfoot = document.getElementById('monthly-trend-tfoot');
  if (!tbody) return;

  const { rows, totals } = monthlyReport;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:30px;">No monthly transactions recorded in this period.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td class="cell-bold">${r.month}</td>
    <td style="text-align:center;">${r.orderCount}</td>
    <td class="text-success" style="font-weight:600;">${r.dispatchedUnits.toLocaleString()}</td>
    <td>${r.boxesDispatched.toLocaleString()}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(r.revenue)}</td>
    <td class="cell-amount text-success">${UTILS.fmtCurrency(r.paidAmount)}</td>
    <td class="cell-amount" style="font-weight:700;">${UTILS.fmtCurrency(r.netRevenue)}</td>
  </tr>`).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>
      <td class="cell-bold">TOTAL (${rows.length} Months)</td>
      <td style="text-align:center;">${totals.totalOrders}</td>
      <td class="text-success">${totals.dispatchedUnits.toLocaleString()}</td>
      <td>${totals.boxesDispatched.toLocaleString()}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.grossRevenue)}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(totals.paidAmount)}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.netRevenue)}</td>
    </tr>`;
  }

  UTILS.applyMobileTableLabels('monthly-trend-table');
}

/**
 * Render Tab 5: Company Summary Table
 */
function renderCompanySummaryTable(companyReport) {
  const tbody = document.querySelector('#company-summary-table tbody');
  const tfoot = document.getElementById('company-summary-tfoot');
  if (!tbody) return;

  const { rows, totals } = companyReport;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted" style="text-align:center; padding:30px;">No company summary data available.</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td class="cell-bold">${r.companyName}</td>
    <td><span class="badge badge-neutral">${r.companyCode}</span></td>
    <td><span class="badge ${r.isManufacturer ? 'badge-primary' : 'badge-neutral'}">${r.isManufacturer ? 'Manufacturer' : 'Depot / Trading'}</span></td>
    <td style="text-align:center;">${r.ordersCount}</td>
    <td class="text-success" style="font-weight:600;">${r.dispatchedUnits.toLocaleString()}</td>
    <td>${r.dispatchedBoxes.toLocaleString()}</td>
    <td class="cell-amount">${UTILS.fmtCurrency(r.grossRevenue)}</td>
    <td class="cell-amount text-success">${UTILS.fmtCurrency(r.paidAmount)}</td>
    <td class="cell-amount text-danger" style="font-weight:700;">${UTILS.fmtCurrency(r.outstandingReceivables)}</td>
  </tr>`).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>
      <td colspan="3" class="cell-bold">TOTAL (${rows.length} Entities)</td>
      <td style="text-align:center;">${totals.totalOrders}</td>
      <td class="text-success">${totals.dispatchedUnits.toLocaleString()}</td>
      <td>${totals.dispatchedBoxes.toLocaleString()}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(totals.grossRevenue)}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(totals.paidAmount)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(totals.outstandingReceivables)}</td>
    </tr>`;
  }

  UTILS.applyMobileTableLabels('company-summary-table');
}

/**
 * Render Charts on Tab 1
 */
function renderCharts(monthlyRows, expensesCats) {
  // Sales Trend Chart
  const salesCtx = document.getElementById('sales-trend-chart');
  if (salesCtx) {
    UTILS.destroyChart(salesChart);
    const labels = monthlyRows.map(r => r.month);
    const revs = monthlyRows.map(r => r.netRevenue || r.revenue || 0);

    salesChart = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [{
          label: 'Net Revenue (₹)',
          data: revs.length ? revs : [0],
          borderColor: '#89E900',
          backgroundColor: 'rgba(137, 233, 0, 0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#89E900',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ' ' + UTILS.fmtCurrency(ctx.parsed.y) } }
        },
        scales: {
          y: { ticks: { callback: v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v) } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Expense Breakdown Chart
  const expCtx = document.getElementById('expense-trend-chart');
  if (expCtx) {
    UTILS.destroyChart(expChart);
    const colors = ['#EF4444', '#0C3925', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'];
    expChart = new Chart(expCtx, {
      type: 'bar',
      data: {
        labels: expensesCats.length ? expensesCats.map(c => c.category) : ['No Data'],
        datasets: [{
          label: 'Amount (₹)',
          data: expensesCats.length ? expensesCats.map(c => c.total) : [0],
          backgroundColor: colors.slice(0, Math.max(1, expensesCats.length)),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => '₹' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v) } }
        }
      }
    });
  }
}

/**
 * Render Top Summary Widgets on Tab 1
 */
function renderTopSummaries(topSkus, topClients) {
  const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (UTILS && UTILS.escapeHtml ? UTILS.escapeHtml : (s => s));
  const prodTbody = document.querySelector('#top-products-table tbody');
  if (prodTbody) {
    const list = topSkus.slice(0, 5);
    if (!list.length) {
      prodTbody.innerHTML = '<tr><td colspan="3" class="text-muted" style="text-align:center; padding:16px;">No products sold.</td></tr>';
    } else {
      prodTbody.innerHTML = list.map((p, i) => `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-name">
          <div class="top-product-info">
            <span class="top-product-name">${safeEscape(p.productName || 'Unknown Product')}</span>
            ${p.packagingSize ? `<span class="top-product-pack">${safeEscape(p.packagingSize)}</span>` : ''}
          </div>
        </td>
        <td class="col-rev">${UTILS.fmtCurrency(p.netRevenue)}</td>
      </tr>`).join('');
    }
  }

  const clientTbody = document.querySelector('#top-clients-table tbody');
  if (clientTbody) {
    const list = topClients.slice(0, 5);
    if (!list.length) {
      clientTbody.innerHTML = '<tr><td colspan="3" class="text-muted" style="text-align:center; padding:16px;">No customer orders.</td></tr>';
    } else {
      clientTbody.innerHTML = list.map((c, i) => `<tr>
        <td class="col-rank">${i + 1}</td>
        <td class="col-name">
          <div class="top-client-info">
            <span class="top-client-name">${safeEscape(c.clientName || 'Unknown Client')}</span>
            ${c.city ? `<span class="top-client-city">${safeEscape(c.city)}</span>` : ''}
          </div>
        </td>
        <td class="col-rev">${UTILS.fmtCurrency(c.totalBilledAmount)}</td>
      </tr>`).join('');
    }
  }
}

/**
 * Toggle Advanced Business Filters panel
 */
function toggleAdvancedFilters() {
  const body = document.getElementById('advanced-filters-body');
  const btn = document.getElementById('toggle-advanced-filters-btn');
  const chevron = document.getElementById('advanced-filters-chevron');
  if (!body) return;

  const isHidden = body.style.display === 'none' || !body.style.display;
  body.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

/**
 * Update count of active secondary filters
 */
function updateActiveFiltersCount() {
  const filterIds = [
    'filter-client',
    'filter-company',
    'filter-product',
    'filter-sku',
    'filter-order-status',
    'filter-dispatch-status'
  ];
  let activeCount = 0;
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value && el.value.trim() !== '') {
      activeCount++;
    }
  });

  const badge = document.getElementById('active-filters-count');
  if (badge) {
    if (activeCount > 0) {
      badge.textContent = `${activeCount} active`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Filter Form Handlers
 */
function applyReportFilters() {
  updateActiveFiltersCount();
  loadReports();
  APP.showToast('Report updated for selected filters', 'success');
}

function resetReportFilters() {
  document.getElementById('filter-client').value = '';
  document.getElementById('filter-company').value = '';
  document.getElementById('filter-product').value = '';
  document.getElementById('filter-sku').value = '';
  document.getElementById('filter-order-status').value = '';
  document.getElementById('filter-dispatch-status').value = '';
  updateActiveFiltersCount();
  selectDatePreset('financial_year');
}

/**
 * Customer 360° Profile Modal
 */
function openCustomerProfile(clientId) {
  if (!currentReportDataset || !currentReportDataset.customerReport) {
    APP.showToast('Report data not loaded', 'warning');
    return;
  }

  const cRow = currentReportDataset.customerReport.rows.find(r => String(r.clientId) === String(clientId));
  if (!cRow) {
    APP.showToast('Customer record not found in active report', 'error');
    return;
  }

  selectedProfileCustomer = cRow;
  selectedProfileCustomer.rawOrders = rawOrders;
  selectedProfileCustomer.rawDispatches = rawDispatches;
  const modalTitle = document.getElementById('cust-modal-title');
  if (modalTitle) modalTitle.textContent = `${cRow.clientName} — 360° Sales & Dispatch Profile`;

  const rawOrders = currentReportDataset.raw.orders.filter(o => String(o.client_id) === String(clientId));
  const rawDispatches = currentReportDataset.raw.dispatches.filter(d => String(d.client_id) === String(clientId));

  const skusList = Object.values(cRow.purchasedSkus || {});

  const html = `
    <div style="display:flex; flex-direction:column; gap:20px;">
      
      <!-- Top Metrics Answer Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">12-Month Orders Total</div>
          <div style="font-size:18px; font-weight:800; color:var(--accent); margin-top:4px;">${UTILS.fmtCurrency(cRow.totalBilledAmount)}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${cRow.totalOrdersCount} orders booked</div>
        </div>
        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Dispatched Units</div>
          <div style="font-size:18px; font-weight:800; color:var(--success); margin-top:4px;">${cRow.totalDispatchedUnits.toLocaleString()}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${cRow.totalBoxesDispatched} bxs + ${cRow.totalLooseDispatched} loose</div>
        </div>
        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Pending Units</div>
          <div style="font-size:18px; font-weight:800; color:${cRow.totalPendingUnits > 0 ? 'var(--warning)' : 'var(--text-muted)'}; margin-top:4px;">${cRow.totalPendingUnits.toLocaleString()}</div>
          <div style="font-size:11px; color:var(--text-secondary);">Awaiting godown release</div>
        </div>
        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Outstanding Receivables</div>
          <div style="font-size:18px; font-weight:800; color:${cRow.outstandingBalance > 0 ? 'var(--danger)' : 'var(--success)'}; margin-top:4px;">${UTILS.fmtCurrency(cRow.outstandingBalance)}</div>
          <div style="font-size:11px; color:var(--text-secondary);">Credit Limit: ${UTILS.fmtCurrency(cRow.creditLimit)}</div>
        </div>
        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Returns & Cancellations</div>
          <div style="font-size:18px; font-weight:800; color:var(--danger); margin-top:4px;">${(cRow.totalCancelledUnits + cRow.totalReturnedUnits).toLocaleString()}</div>
          <div style="font-size:11px; color:var(--text-secondary);">Reversed items</div>
        </div>
      </div>

      <!-- SKUs Purchased Section -->
      <div>
        <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Purchased SKUs & Packaging Configurations</h4>
        <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
          <table class="data-table" style="font-size:12.5px; width:100%; min-width:580px; margin:0;">
            <thead>
              <tr>
                <th>Product Formulation</th>
                <th>Pack Size</th>
                <th>Ordered Units</th>
                <th>Dispatched Units</th>
                <th>Pending Units</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              ${skusList.length ? skusList.map(s => `<tr>
                <td class="cell-bold">${s.productName}</td>
                <td><span class="badge badge-neutral">${s.packagingSize}</span></td>
                <td>${s.orderedUnits.toLocaleString()}</td>
                <td class="text-success">${s.dispatchedUnits.toLocaleString()}</td>
                <td style="color:${s.pendingUnits > 0 ? 'var(--warning)' : 'var(--text-muted)'}; font-weight:700;">${s.pendingUnits.toLocaleString()}</td>
                <td class="cell-amount">${UTILS.fmtCurrency(s.revenue)}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:16px;">No SKU lines found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Order History Section -->
      <div>
        <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Order History (${rawOrders.length})</h4>
        <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; max-height:240px; overflow:auto; -webkit-overflow-scrolling:touch; width:100%;">
          <table class="data-table" style="font-size:12px; width:100%; min-width:620px; margin:0;">
            <thead>
              <tr>
                <th>Order No</th>
                <th>Date</th>
                <th>Order Status</th>
                <th>Dispatch Status</th>
                <th>Total Billed</th>
                <th>Paid Amount</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rawOrders.length ? rawOrders.map(o => {
                const bal = (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0);
                return `<tr>
                  <td class="cell-bold">${o.order_no}</td>
                  <td>${UTILS.fmtDate(o.date)}</td>
                  <td><span class="badge ${o.status === 'Completed' ? 'badge-success' : 'badge-warning'}">${o.status}</span></td>
                  <td><span class="badge ${o.dispatch_status === 'Fully Dispatched' ? 'badge-success' : 'badge-neutral'}">${o.dispatch_status || 'Pending'}</span></td>
                  <td class="cell-amount">${UTILS.fmtCurrency(o.total_amount)}</td>
                  <td class="cell-amount text-success">${UTILS.fmtCurrency(o.paid_amount)}</td>
                  <td class="cell-amount ${bal > 0 ? 'text-danger' : 'text-success'}">${UTILS.fmtCurrency(bal)}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:16px;">No orders found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Dispatches Section -->
      ${rawDispatches.length ? `
        <div>
          <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Dispatches & Gate Passes (${rawDispatches.length})</h4>
          <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; max-height:200px; overflow:auto; -webkit-overflow-scrolling:touch; width:100%;">
            <table class="data-table" style="font-size:12px; width:100%; min-width:620px; margin:0;">
              <thead>
                <tr>
                  <th>Dispatch Slip</th>
                  <th>Date</th>
                  <th>Order Ref</th>
                  <th>Vehicle / Logistics</th>
                  <th>Boxes / Loose</th>
                  <th>Units Dispatched</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${rawDispatches.map(d => `<tr>
                  <td class="cell-bold">${d.dispatch_no}</td>
                  <td>${UTILS.fmtDate(d.dispatch_date)}</td>
                  <td>${d.order_no}</td>
                  <td>${d.vehicle_no || '—'} (${d.transporter_name || 'Direct'})</td>
                  <td>${d.total_boxes_dispatched || 0} bxs + ${d.total_loose_dispatched || 0} loose</td>
                  <td class="text-success" style="font-weight:700;">${(d.total_units_dispatched || 0).toLocaleString()}</td>
                  <td><span class="badge badge-success">${d.status}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

    </div>
  `;

  document.getElementById('cust-modal-body').innerHTML = html;
  APP.openModal('customer-profile-modal');
}

/**
 * Export a Single Customer's Detailed Sales & Dispatch Ledger to Excel (.xlsx)
 * Includes multi-sheet breakdown: Summary & SKUs, Orders History, and Dispatches for the selected dates.
 */
function exportSingleCustomerExcel(clientId) {
  if (!currentReportDataset || !currentReportDataset.customerReport) {
    APP.showToast('Please wait for reports to load.', 'warning');
    return;
  }

  const cRow = currentReportDataset.customerReport.rows.find(r => String(r.clientId) === String(clientId));
  if (!cRow) {
    APP.showToast('Customer data not found.', 'error');
    return;
  }

  const dateFrom = document.getElementById('date-from')?.value || '';
  const dateTo = document.getElementById('date-to')?.value || '';
  const dateRangeStr = (dateFrom && dateTo) ? `${dateFrom}_to_${dateTo}` : (dateFrom ? `from_${dateFrom}` : (dateTo ? `up_to_${dateTo}` : UTILS.todayStr()));

  // 1. SKU Breakdown
  const skusList = Object.values(cRow.purchasedSkus || {});
  const skuRows = skusList.map(s => ({
    'Customer Name': cRow.clientName,
    'Product Formulation': s.productName,
    'Pack Size (SKU)': s.packagingSize,
    'Ordered Units': s.orderedUnits,
    'Dispatched Units': s.dispatchedUnits,
    'Pending Units': s.pendingUnits,
    'Revenue (₹)': parseFloat(s.revenue.toFixed(2))
  }));

  // 2. Orders History
  const rawOrders = (currentReportDataset.raw && currentReportDataset.raw.orders)
    ? currentReportDataset.raw.orders.filter(o => String(o.client_id) === String(clientId))
    : [];
  const orderRows = rawOrders.map(o => {
    const tot = parseFloat(o.total_amount) || 0;
    const paid = parseFloat(o.paid_amount) || 0;
    return {
      'Order No': o.order_no,
      'Date': o.date || '',
      'Status': o.status || 'Draft',
      'Dispatch Status': o.dispatch_status || 'Pending Verification',
      'Total Billed (₹)': tot,
      'Paid Amount (₹)': paid,
      'Balance (₹)': parseFloat((tot - paid).toFixed(2))
    };
  });

  // 3. Dispatches History
  const rawDispatches = (currentReportDataset.raw && currentReportDataset.raw.dispatches)
    ? currentReportDataset.raw.dispatches.filter(d => String(d.client_id) === String(clientId))
    : [];
  const dispatchRows = rawDispatches.map(d => ({
    'Dispatch Slip': d.dispatch_no,
    'Date': d.dispatch_date || '',
    'Order Ref': d.order_no || '',
    'Vehicle / Logistics': d.vehicle_no || (d.transporter_name || 'Direct'),
    'Boxes Dispatched': d.total_boxes_dispatched || 0,
    'Loose Dispatched': d.total_loose_dispatched || 0,
    'Total Units Dispatched': d.total_units_dispatched || 0,
    'Status': d.status || 'Dispatched'
  }));

  const cleanName = (cRow.clientName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanName}_Ledger_${dateRangeStr}.xlsx`;

  if (window.XLSX) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: SKU Breakdown
    const wsSkus = XLSX.utils.json_to_sheet(skuRows.length ? skuRows : [{ 'Customer': cRow.clientName, 'Notice': 'No product purchases in this date range' }]);
    XLSX.utils.book_append_sheet(wb, wsSkus, 'SKU Summary');

    // Sheet 2: Orders History
    if (orderRows.length) {
      const wsOrders = XLSX.utils.json_to_sheet(orderRows);
      XLSX.utils.book_append_sheet(wb, wsOrders, 'Orders History');
    }

    // Sheet 3: Dispatches
    if (dispatchRows.length) {
      const wsDispatches = XLSX.utils.json_to_sheet(dispatchRows);
      XLSX.utils.book_append_sheet(wb, wsDispatches, 'Dispatches');
    }

    XLSX.writeFile(wb, filename);
    APP.showToast(`Excel ledger for "${cRow.clientName}" downloaded!`, 'success');
  } else {
    UTILS.exportToCSV(skuRows, `${cleanName}_Ledger_${dateRangeStr}`);
  }
}

/**
 * Export Customer Profile to Excel (from Modal)
 */
function exportCustomerDetailExcel() {
  if (!selectedProfileCustomer) return;
  exportSingleCustomerExcel(selectedProfileCustomer.clientId);
}

/**
 * Dynamic Exporters for Active Tab (Excel & CSV with Exact Display Totals)
 */
function getActiveReportExportData() {
  if (!currentReportDataset) return null;
  const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;
  if (!core) return null;

  switch (activeReportTab) {
    case 'CustomerSales':
      return {
        data: core.formatCustomerSalesForExport(currentReportDataset.customerReport),
        label: 'Customer_Wise_Annual_Sales_Report'
      };
    case 'ProductSales':
      return {
        data: core.formatProductSalesForExport(currentReportDataset.productReport),
        label: 'Product_SKU_Sales_Report'
      };
    case 'MonthlyTrends':
      return {
        data: core.formatMonthlyTrendsForExport(currentReportDataset.monthlyReport),
        label: 'Monthly_Sales_Trend_Report'
      };
    case 'CompanySummary':
      return {
        data: currentReportDataset.companyReport.rows.map(r => ({
          'Company Name': r.companyName,
          'Code': r.companyCode,
          'Orders': r.ordersCount,
          'Dispatched Units': r.dispatchedUnits,
          'Dispatched Boxes': r.dispatchedBoxes,
          'Gross Revenue (₹)': r.grossRevenue.toFixed(2),
          'Collections (₹)': r.paidAmount.toFixed(2),
          'Outstanding Receivables (₹)': r.outstandingReceivables.toFixed(2)
        })),
        label: 'Company_Wise_Summary_Report'
      };
    case 'Overview':
    default:
      return {
        data: core.formatCustomerSalesForExport(currentReportDataset.customerReport),
        label: 'Executive_Consolidated_Sales_Report'
      };
  }
}

function exportCurrentReportToExcel() {
  if (!currentReportDataset) {
    APP.showToast('No report data to export', 'warning');
    return;
  }

  const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;
  if (!core) {
    APP.showToast('Reporting service not loaded', 'error');
    return;
  }

  const filters = currentReportDataset.customerReport?.filters || {};
  const raw = currentReportDataset.raw || {};

  // 1. Worksheet 1: Customer Summary
  const summaryData = core.formatCustomerSalesForExport(currentReportDataset.customerReport);

  // 2. Worksheet 2: Customer-Wise Product Details (essential detailed line items)
  const productDetailsData = core.formatCustomerProductDetailsForExport({
    orders: raw.orders || [],
    orderItems: raw.orderItems || [],
    dispatches: raw.dispatches || [],
    dispatchItems: raw.dispatchItems || [],
    clients: cachedClients || [],
    products: cachedProducts || raw.products || [],
    inventoryItems: cachedInventoryItems || raw.inventoryItems || [],
    reversals: raw.reversals || [],
    filters
  });

  // 3. Worksheet 3: Sales Transactions (chronological order & dispatch fulfillment ledger)
  const transactionsData = core.formatSalesTransactionsForExport({
    orders: raw.orders || [],
    orderItems: raw.orderItems || [],
    dispatches: raw.dispatches || [],
    dispatchItems: raw.dispatchItems || [],
    clients: cachedClients || [],
    products: cachedProducts || raw.products || [],
    reversals: raw.reversals || [],
    filters
  });

  // 4. Worksheet 4: Product & SKU Sales Breakdown
  const productSkuData = currentReportDataset.productReport
    ? core.formatProductSalesForExport(currentReportDataset.productReport)
    : [];

  if (window.XLSX) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Customer Summary
    if (summaryData && summaryData.length) {
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      core.applySheetFormatting(wsSummary, summaryData, window.XLSX);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Customer Summary');
    }

    // Sheet 2: Customer-Wise Product Details
    if (productDetailsData && productDetailsData.length) {
      const wsDetails = XLSX.utils.json_to_sheet(productDetailsData);
      core.applySheetFormatting(wsDetails, productDetailsData, window.XLSX);
      XLSX.utils.book_append_sheet(wb, wsDetails, 'Customer-Wise Product Details');
    }

    // Sheet 3: Sales Transactions
    if (transactionsData && transactionsData.length) {
      const wsTx = XLSX.utils.json_to_sheet(transactionsData);
      core.applySheetFormatting(wsTx, transactionsData, window.XLSX);
      XLSX.utils.book_append_sheet(wb, wsTx, 'Sales Transactions');
    }

    // Sheet 4: Product & SKU Sales
    if (productSkuData && productSkuData.length) {
      const wsProd = XLSX.utils.json_to_sheet(productSkuData);
      core.applySheetFormatting(wsProd, productSkuData, window.XLSX);
      XLSX.utils.book_append_sheet(wb, wsProd, 'Product & SKU Sales');
    }

    const filename = 'Anjani_Agri_Care.xlsx';
    XLSX.writeFile(wb, filename);
    APP.showToast('Anjani Agri Care Excel report downloaded successfully!', 'success');
  } else {
    // Graceful CSV fallback for systems without XLSX
    UTILS.exportToCSV(productDetailsData, 'Anjani_Agri_Care');
  }
}

function exportCurrentReportToCSV() {
  if (!currentReportDataset) {
    APP.showToast('No report data to export', 'warning');
    return;
  }

  const core = window.REPORTS_CORE ? window.REPORTS_CORE.Service : null;
  const filters = currentReportDataset.customerReport?.filters || {};
  const raw = currentReportDataset.raw || {};

  // For CSV, export detailed customer product sales
  const exportData = (activeReportTab === 'ProductSales')
    ? (core ? core.formatProductSalesForExport(currentReportDataset.productReport) : [])
    : (core ? core.formatCustomerProductDetailsForExport({
        orders: raw.orders || [],
        orderItems: raw.orderItems || [],
        dispatches: raw.dispatches || [],
        dispatchItems: raw.dispatchItems || [],
        clients: cachedClients || [],
        products: cachedProducts || raw.products || [],
        inventoryItems: cachedInventoryItems || raw.inventoryItems || [],
        reversals: raw.reversals || [],
        filters
      }) : []);

  const label = 'Anjani Agri Care';
  const csvContent = core
    ? core.generateCsvString(exportData, label)
    : null;

  if (csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Anjani_Agri_Care.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    APP.showToast('CSV report generated and downloaded successfully!', 'success');
  } else {
    UTILS.exportToCSV(exportData, 'Anjani_Agri_Care');
  }
}

// Global window bindings
window.switchReportTab = switchReportTab;
window.selectDatePreset = selectDatePreset;
window.toggleAdvancedFilters = toggleAdvancedFilters;
window.updateActiveFiltersCount = updateActiveFiltersCount;
window.applyReportFilters = applyReportFilters;
window.resetReportFilters = resetReportFilters;
window.openCustomerProfile = openCustomerProfile;
window.exportCustomerDetailExcel = exportCustomerDetailExcel;
window.exportSingleCustomerExcel = exportSingleCustomerExcel;
window.filterCustomerReportTable = filterCustomerReportTable;
window.exportCurrentReportToExcel = exportCurrentReportToExcel;
window.exportCurrentReportToCSV = exportCurrentReportToCSV;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  await initReportFilters();
  await loadReports();

  // Attach live change listeners for active filter count
  ['filter-client', 'filter-company', 'filter-product', 'filter-sku', 'filter-order-status', 'filter-dispatch-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateActiveFiltersCount);
  });

  // Attach listeners for manual date input changes
  ['date-from', 'date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        document.querySelectorAll('#report-date-presets .cat-pill').forEach(b => b.classList.remove('active'));
        const custBtn = document.querySelector('#report-date-presets .cat-pill[data-preset="custom"]');
        if (custBtn) custBtn.classList.add('active');
        const lbl = document.getElementById('active-range-label');
        if (lbl) lbl.textContent = 'Custom Range Selected';
      });
    }
  });
});
