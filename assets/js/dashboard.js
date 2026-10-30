/* dashboard.js */
let revenueChart = null;
let categoryChart = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadDashboard() {
  console.log('Loading dashboard...');
  updatePageDebug('Initializing...', '#0C3925');
  
  try {
    renderDashboardSkeleton();
    await DB.initDB();

    // High performance: 5 parallel queries with 0 duplicate requests
    const ordersQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('orders').select('id, order_no, client_name, date, total_amount, status').order('date', { ascending: false })) : window.dbClient.from('orders').select('id, order_no, client_name, date, total_amount, status').order('date', { ascending: false });
    const purchasesQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('purchases').select('date, total_amount')) : window.dbClient.from('purchases').select('date, total_amount');
    const expensesQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('expenses').select('amount')) : window.dbClient.from('expenses').select('amount');
    const invQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('inventory_items').select('id, name, unit, reorder_level, category, item_subtype, stock')) : window.dbClient.from('inventory_items').select('id, name, unit, reorder_level, category, item_subtype, stock');
    const batchQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('stock_batches').select('item_id, current_qty, purchase_price').eq('item_type', 'Inventory')) : window.dbClient.from('stock_batches').select('item_id, current_qty, purchase_price').eq('item_type', 'Inventory');

    const [
      ordersRes,
      purchasesRes,
      expensesRes,
      invRes,
      batchRes
    ] = await Promise.all([
      ordersQuery,
      purchasesQuery,
      expensesQuery,
      invQuery,
      batchQuery
    ]);

    const allOrders = ordersRes.data || [];
    const allPurchases = purchasesRes.data || [];
    const allExpenses = expensesRes.data || [];
    const invData = invRes.data || [];
    const batches = batchRes.data || [];

    // 1. Revenue KPI (Orders with Delivered or Completed status, matching Business Reports)
    let revenue = 0;
    let activeOrders = 0;
    const currentYear = new Date().getFullYear();
    const monthlyRev = new Array(12).fill(0);

    allOrders.forEach(o => {
      const amt = parseFloat(o.total_amount) || 0;
      const st = String(o.status || '').toLowerCase().trim();
      const isDelivered = st === 'delivered' || st === 'completed';
      if (isDelivered) {
        revenue += amt;
      } else {
        activeOrders++;
      }
      if (isDelivered && o.date) {
        const d = new Date(o.date);
        if (d.getFullYear() === currentYear) {
          monthlyRev[d.getMonth()] += amt;
        }
      }
    });

    const kpiRevenue = document.getElementById('kpi-revenue');
    if (kpiRevenue) kpiRevenue.textContent = UTILS.fmtCurrency(revenue);

    // 2. Active Orders KPI & Pending Badge
    const kpiOrders = document.getElementById('kpi-orders');
    if (kpiOrders) kpiOrders.textContent = activeOrders;
    const badge = document.getElementById('pending-badge');
    if (badge) {
      badge.textContent = activeOrders;
      badge.style.display = activeOrders ? '' : 'none';
    }

    // 3. Purchases KPI & Chart Data
    let totalPurchases = 0;
    const monthlyPur = new Array(12).fill(0);

    allPurchases.forEach(p => {
      const amt = parseFloat(p.total_amount) || 0;
      totalPurchases += amt;
      if (p.date) {
        const d = new Date(p.date);
        if (d.getFullYear() === currentYear) {
          monthlyPur[d.getMonth()] += amt;
        }
      }
    });

    const kpiPurchases = document.getElementById('kpi-purchases');
    if (kpiPurchases) kpiPurchases.textContent = UTILS.fmtCurrency(totalPurchases);

    // 4. Expenses KPI
    const totalExpenses = allExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const kpiExpenses = document.getElementById('kpi-expenses');
    if (kpiExpenses) kpiExpenses.textContent = UTILS.fmtCurrency(totalExpenses);

    // 5. Render Revenue Chart
    renderRevenueChart(monthlyRev, monthlyPur);

    // 6. Recent Orders (Top 5 already sorted by date DESC)
    const recent5 = allOrders.slice(0, 5);
    renderRecentActivities(recent5);

    // 7. Inventory Section & Stock Alerts
    const costMap = {};
    batches.forEach(b => {
      if (!costMap[b.item_id]) costMap[b.item_id] = { totalCost: 0, totalQty: 0 };
      const qty = parseFloat(b.current_qty) || 0;
      const price = parseFloat(b.purchase_price) || 0;
      if (qty > 0) {
        costMap[b.item_id].totalCost += (qty * price);
        costMap[b.item_id].totalQty += qty;
      }
    });

    window.dashboardInventoryData = invData.map(p => {
      const batchStock = (costMap[p.id] && costMap[p.id].totalQty) ? costMap[p.id].totalQty : (parseFloat(p.stock || 0) || 0);
      let cost = 0;
      if (costMap[p.id] && costMap[p.id].totalQty > 0) {
        cost = costMap[p.id].totalCost / costMap[p.id].totalQty;
      }
      const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(p.name) : (p.name || '');
      const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(p.unit || '') : (p.unit || '');
      return { ...p, name: cName, unit: cUnit, stock: batchStock, val: batchStock * cost };
    });

    const techSubtypes = ['insecticide', 'herbicide', 'fungicide', 'pgr', 'solvent', 'technical'];
    const stockAlerts = window.dashboardInventoryData
      .filter(p => {
        const rawType = String(p.item_subtype || p.category || 'Raw Material').trim();
        const isTech = String(p.category || '').toLowerCase() === 'technical' || techSubtypes.includes(rawType.toLowerCase());
        const reorder = parseFloat(p.reorder_level || 0);
        const threshold = reorder > 0 ? reorder : (isTech ? 7 : 50);
        return p.stock <= threshold;
      })
      .map(p => {
        const rawType = String(p.item_subtype || p.category || 'Raw Material').trim();
        const itemType = UTILS.formatCategoryLabel(rawType);
        const isTech = String(p.category || '').toLowerCase() === 'technical' || techSubtypes.includes(rawType.toLowerCase());
        const reorder = parseFloat(p.reorder_level || 0);
        return { 
          ...p, 
          type: itemType,
          reorder_level: reorder > 0 ? reorder : (isTech ? 7 : 50)
        };
      })
      .sort((a, b) => a.stock - b.stock);

    renderStockAlerts(stockAlerts || []);
    renderInventoryValueSection();

    console.log('Dashboard: All data loaded successfully in single parallel query batch');
    updatePageDebug('Ready', '#0C3925');
  } catch (err) {
    console.error('Dashboard loadDashboard failed:', err);
    updatePageDebug('FAILED: ' + (err.message || 'Unknown error'), '#EF4444');
    APP.showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function renderDashboardSkeleton() {
  ['kpi-revenue', 'kpi-orders', 'kpi-purchases', 'kpi-expenses'].forEach(id => UTILS.setSkeletonText(id, 'w-50', true));
  UTILS.renderListSkeleton('recent-orders-list', 5);
  UTILS.renderListSkeleton('stock-alerts-list', 4);
}

function renderRevenueChart(revenueData, purchasesData = []) {
  const ctx = document.getElementById('revenue-chart');
  if (!ctx) return;
  
  UTILS.destroyChart(revenueChart);
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  
  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sales Revenue (₹)',
          data: revenueData,
          borderColor: '#0C3925',
          backgroundColor: 'rgba(12, 57, 37,0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#0C3925',
          pointRadius: 3.5
        },
        {
          label: 'Purchases (₹)',
          data: purchasesData,
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.35,
          pointBackgroundColor: '#F59E0B',
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { font: { family: 'Space Grotesk', size: 11 }, boxWidth: 10, padding: 8, color: 'var(--text-secondary)' }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${UTILS.fmtCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v),
            font: { family: 'Space Grotesk', size: 10 },
            color: 'var(--text-muted)'
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { font: { family: 'Space Grotesk', size: 10 }, color: 'var(--text-muted)' },
          grid: { display: false }
        }
      }
    }
  });
}

function renderCategoryChart(data) {
  const ctx = document.getElementById('category-chart');
  if (!ctx) return;
  
  UTILS.destroyChart(categoryChart);
  
  const labels = data.map(d => d.category || 'Unknown').filter(Boolean);
  const values = data.map(d => parseFloat(d.val || 0));
  
  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: { 
      labels: labels.length > 0 ? labels : ['No Data'], 
      datasets: [{ 
        data: values.length > 0 ? values : [1], 
        backgroundColor: ['#7C3AED','#0C3925','#0C3925','#EF4444','#3B82F6','#EC4899'] 
      }] 
    },
    options: { responsive: true, cutout: '70%', plugins: { legend: { display: labels.length > 0 } } }
  });
}

function renderRecentActivities(activities) {
  const el = document.getElementById('recent-orders-list');
  if (!el) return;
  
  if (!activities || activities.length === 0) { 
    el.innerHTML = '<p class="text-muted text-sm">No recent orders.</p>'; 
    return; 
  }
  
  el.innerHTML = activities.map(o => {
    return `<div class="recent-order-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border);">
      <div class="recent-order-info" style="font-size: 13.5px; color: var(--text-primary);">
        <strong>${o.order_no || 'N/A'}</strong> - ${o.client_name || 'Guest'}
        <p>${UTILS.fmtDate(o.date)} • ${UTILS.fmtCurrency(o.total_amount)}</p>
      </div>
      <div>${UTILS.statusBadge(o.status)}</div>
    </div>`;
  }).join('');
}

function renderStockAlerts(alerts) {
  const el = document.getElementById('stock-alerts-list');
  if (!el) return;
  
  if (!alerts || alerts.length === 0) { 
    el.innerHTML = '<p class="text-success text-sm">All stock levels healthy!</p>'; 
    return; 
  }
  
  el.innerHTML = alerts.map(p => {
    const isOutOfStock = parseFloat(p.stock || 0) === 0;
    const statusBadge = isOutOfStock
      ? '<span class="badge badge-gray" style="font-size: 11px;">Out of Stock</span>'
      : '<span class="badge badge-danger" style="font-size: 11px;">Low</span>';

    return `<div class="stock-alert-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border);">
      <div class="stock-alert-content" style="display: flex; flex-direction: column; gap: 3px;">
        <div class="stock-alert-name" style="font-weight: 600; font-size: 13.5px; color: var(--text-primary);">
          ${p.name || 'Unknown'} 
          <span class="badge badge-purple" style="font-size: 9.5px; padding: 2px 7px; margin-left: 6px;">${UTILS.formatCategoryLabel(p.type) || 'Raw Material'}</span>
        </div>
        <div class="stock-alert-meta" style="font-size: 12px; color: var(--text-muted); font-weight: 500;">
          ${parseFloat(p.stock || 0).toFixed(2)} ${p.unit || ''}
        </div>
      </div>
      <div>${statusBadge}</div>
    </div>`;
  }).join('');
}

loadDashboard();
function renderInventoryValueSection() {
  const data = window.dashboardInventoryData || [];
  
  // Aggregate totals by category
  const categoryTotals = {};
  let totalValue = 0;
  
  data.forEach(item => {
    const cat = item.category || 'Other';
    const val = item.val || 0;
    if (!categoryTotals[cat]) categoryTotals[cat] = 0;
    categoryTotals[cat] += val;
    totalValue += val;
  });
  
  window.dashboardInventoryCategoryTotals = categoryTotals;
  window.dashboardInventoryTotal = totalValue;
  
  const select = document.getElementById('dashboard-inventory-filter');
  if (select && !select.dataset.listenerAdded) {
    select.addEventListener('change', updateInventoryValueDisplay);
    select.dataset.listenerAdded = 'true';
  }
  
  updateInventoryValueDisplay();
}

function updateInventoryValueDisplay() {
  const select = document.getElementById('dashboard-inventory-filter');
  const typeLabel = document.getElementById('dashboard-inventory-selected-type');
  const valDisplay = document.getElementById('dashboard-inventory-total-value');
  const breakdownContainer = document.getElementById('dashboard-inventory-breakdown');
  
  if (!select || !typeLabel || !valDisplay) return;
  
  const selected = select.value;
  
  if (selected === 'All') {
    typeLabel.textContent = 'Selected Type: All Inventory';
    valDisplay.textContent = UTILS.fmtCurrency(window.dashboardInventoryTotal || 0);
    
    // Build breakdown table
    if (breakdownContainer) {
      const cats = Object.entries(window.dashboardInventoryCategoryTotals || {});
      if (cats.length > 0) {
        let html = '<table class="data-table" style="margin-top: 16px;"><thead><tr><th>Inventory Type</th><th style="text-align: right;">Total Value</th></tr></thead><tbody>';
        cats.sort((a,b) => b[1] - a[1]).forEach(([c, v]) => {
          html += '<tr><td>' + c + '</td><td style="text-align: right;">' + UTILS.fmtCurrency(v) + '</td></tr>';
        });
        html += '<tr style="font-weight: 700;"><td>Total Inventory</td><td style="text-align: right;">' + UTILS.fmtCurrency(window.dashboardInventoryTotal || 0) + '</td></tr>';
        html += '</tbody></table>';
        breakdownContainer.innerHTML = html;
        breakdownContainer.style.display = 'block';
      } else {
        breakdownContainer.style.display = 'none';
      }
    }
  } else {
    typeLabel.textContent = 'Selected Type: ' + selected;
    const val = (window.dashboardInventoryCategoryTotals || {})[selected] || 0;
    valDisplay.textContent = UTILS.fmtCurrency(val);
    if (breakdownContainer) {
      breakdownContainer.style.display = 'none';
    }
  }
}
