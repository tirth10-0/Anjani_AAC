/* clients.js */
let allClients = [], editingClientId = null;

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadClients() {
  console.log('Loading clients...');
  updatePageDebug('Loading Clients...', '#0C3925');
  
  try {
    UTILS.renderTableSkeleton('clients-table');
    
    console.log('Clients: Initializing database connection...');
    await DB.initDB();
    
    console.log('Clients: Loading clients from backend API...');
    const clientQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('clients').select('*').order('id', { ascending: false })) : window.dbClient.from('clients').select('*').order('id', { ascending: false });
    const { data: clientsData, error } = await clientQuery;
    if (error) throw error;
    allClients = UTILS.sortLatestFirst(clientsData || []);
    
    filterAndRender();
    
    updatePageDebug('Ready (' + allClients.length + ')', '#0C3925');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    
    console.log('Clients: All data loaded successfully');
  } catch (err) {
    console.error('Clients loadClients failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load clients: ' + err.message, 'error');
    renderTable([]);
  }
}

function filterAndRender() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  const type = document.getElementById('type-filter')?.value || '';
  
  let filtered = allClients;
  if (q) {
    filtered = filtered.filter(c => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.contact || '').toLowerCase().includes(q) || 
      (c.city || '').toLowerCase().includes(q)
    );
  }
  if (type) {
    filtered = filtered.filter(c => c.type === type);
  }
  filtered = UTILS.sortLatestFirst(filtered);
  renderTable(filtered);
}

document.getElementById('search-input')?.addEventListener('input', filterAndRender);
document.getElementById('type-filter')?.addEventListener('change', filterAndRender);

function renderTable(data) {
  const tbody = document.querySelector('#clients-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} client${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><h3>No clients found</h3><p>Add your first client to start selling.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(c => {
    const type = (c.type || 'Retailer').trim();
    let badgeClass = 'badge-purple';
    if (type.toLowerCase() === 'farmer') badgeClass = 'badge-success';
    else if (type.toLowerCase() === 'dealer') badgeClass = 'badge-info';
    else if (type.toLowerCase() === 'distributor') badgeClass = 'badge-warning';

    return `<tr>
      <td class="cell-bold">${c.name}</td>
      <td>${c.contact || '—'}</td>
      <td>${c.city || '—'}</td>
      <td><span class="badge ${badgeClass}">${type}</span></td>
      <td>${UTILS.fmtCurrency(c.credit_limit || 0)}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(c.balance || 0)}</td>
      <td><div class="row-actions">
        <button class="action-btn view" onclick="openClientHistory(${c.id})" title="View 360° Sales & Dispatch History"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="action-btn edit" onclick="openEdit(${c.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" onclick="deleteClient(${c.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
  UTILS.applyMobileTableLabels('clients-table');
}

function openAdd() {
  editingClientId = null;
  document.getElementById('modal-title').textContent = 'New Client';
  document.getElementById('client-form').reset();
  APP.openModal('client-modal');
}

function openEdit(id) {
  editingClientId = id;
  const c = allClients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-title').textContent = 'Edit Client';
  UTILS.populateForm('client-form', c);
  APP.openModal('client-modal');
}

async function saveClient() {
  const d = UTILS.getFormData('client-form');
  if (!d.name) { APP.showToast('Name is required', 'error'); return; }
  
  const saveBtn = document.querySelector('#client-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, editingClientId ? 'Updating...' : 'Saving...');

  try {
    let error;
    if (editingClientId) {
      const res = await window.dbClient.from('clients').update(d).eq('id', editingClientId);
      error = res.error;
    } else {
      const stamped = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(d) : d;
      const res = await window.dbClient.from('clients').insert([stamped]);
      error = res.error;
    }
    
    if (error) throw new Error(error.message || 'Failed to save client');
    
    APP.showToast(editingClientId ? 'Client updated!' : 'Client added!', 'success');
    APP.closeModal('client-modal');
    loadClients();
  } catch (err) {
    console.error('saveClient failed:', err);
    APP.showToast('Error saving client: ' + err.message, 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deleteClient(id) {
  try {
    // 1. Fetch details of dependencies from stats endpoint
    const { count: ordersCount } = await window.dbClient.from('orders').select('*', { count: 'exact', head: true }).eq('client_id', id);
    const { count: salesCount } = await window.dbClient.from('daily_transactions').select('*', { count: 'exact', head: true }).eq('client_id', id);
    const stats = { orders: ordersCount || 0, sales: salesCount || 0 };
    
    let message = 'Delete this client?';
    if (stats.orders || stats.sales) {
      message = `This client has ${stats.orders || 0} linked order(s) and ${stats.sales || 0} counter sale(s). Delete anyway?`;
    }
    
    APP.showConfirm(message, async () => {
      try {
        const { error: deleteError } = await window.dbClient.from('clients').delete().eq('id', id);
        if (deleteError) throw new Error(deleteError.message || 'Failed to delete client');
        
        APP.showToast('Client deleted!', 'success');
        setTimeout(() => loadClients(), 100);
      } catch (e) {
        console.error(e);
        APP.showToast('Failed to delete client: ' + e.message, 'error');
      }
    });
  } catch (err) {
    console.error('deleteClient dependencies check failed:', err);
    APP.showToast('Failed to verify client dependencies', 'error');
  }
}

let activeProfileClient = null;

async function openClientHistory(id) {
  const c = allClients.find(x => x.id === id);
  if (!c) {
    APP.showToast('Client record not found', 'error');
    return;
  }
  activeProfileClient = c;

  const titleEl = document.getElementById('client-history-modal-title');
  if (titleEl) titleEl.textContent = `${c.name} — 360° Sales & Dispatch History`;

  const bodyEl = document.getElementById('client-history-modal-body');
  if (bodyEl) bodyEl.innerHTML = '<div style="text-align:center; padding:30px;"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:10px; color:var(--text-muted);">Loading customer history...</p></div>';
  APP.openModal('client-history-modal');

  try {
    const [ordersRes, dispatchesRes] = await Promise.all([
      window.dbClient.from('orders').select('*').eq('client_id', id).order('id', { ascending: false }),
      window.dbClient.from('order_dispatches').select('*').eq('client_id', id).order('id', { ascending: false })
    ]);

    const orders = ordersRes.data || [];
    const dispatches = dispatchesRes.data || [];

    // Fetch order items for these orders
    let orderItems = [];
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: oiData } = await window.dbClient.from('order_items').select('*').in('order_id', orderIds);
      if (oiData) orderItems = oiData;
    }

    // 12 Months date boundary
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const twelveMonthsDateStr = twelveMonthsAgo.toISOString().split('T')[0];

    const past12mOrders = orders.filter(o => o.date >= twelveMonthsDateStr && String(o.status || '').toLowerCase() !== 'cancelled');
    const total12mBilled = past12mOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);

    // Dispatched units, boxes, loose
    let totalDispatchedUnits = 0;
    let totalBoxesDispatched = 0;
    let totalLooseDispatched = 0;
    dispatches.forEach(d => {
      totalDispatchedUnits += (parseInt(d.total_units_dispatched, 10) || 0);
      totalBoxesDispatched += (parseInt(d.total_boxes_dispatched, 10) || 0);
      totalLooseDispatched += (parseInt(d.total_loose_dispatched, 10) || 0);
    });

    // If dispatches table empty, calculate from order_items
    if (totalDispatchedUnits === 0 && orderItems.length > 0) {
      orderItems.forEach(it => {
        const dUnits = parseInt(it.dispatched_units || 0, 10);
        totalDispatchedUnits += dUnits;
        const upb = it.bottles_per_box || 10;
        totalBoxesDispatched += Math.floor(dUnits / upb);
        totalLooseDispatched += (dUnits % upb);
      });
    }

    // Pending units
    let totalPendingUnits = 0;
    let totalCancelledUnits = 0;
    const skuMap = {};

    orderItems.forEach(it => {
      const oMatch = orders.find(o => o.id === it.order_id);
      const isCancelled = oMatch && String(oMatch.status || '').toLowerCase() === 'cancelled';
      const ordUnits = parseInt(it.ordered_units || it.quantity, 10) || 0;
      const dispUnits = parseInt(it.dispatched_units || 0, 10);
      const remUnits = it.remaining_units !== undefined ? parseInt(it.remaining_units, 10) : Math.max(0, ordUnits - dispUnits);

      if (isCancelled) {
        totalCancelledUnits += ordUnits;
      } else {
        totalPendingUnits += remUnits;
        const skuKey = `${it.product_name || 'Item'} (${it.packing_size || 'Std'})`;
        if (!skuMap[skuKey]) {
          skuMap[skuKey] = {
            productName: it.product_name,
            packingSize: it.packing_size || 'Standard',
            orderedUnits: 0,
            dispatchedUnits: 0,
            pendingUnits: 0,
            revenue: 0
          };
        }
        skuMap[skuKey].orderedUnits += ordUnits;
        skuMap[skuKey].dispatchedUnits += dispUnits;
        skuMap[skuKey].pendingUnits += remUnits;
        skuMap[skuKey].revenue += (parseFloat(it.total) || 0);
      }
    });

    // Total Financial standing
    const nonCancelledOrders = orders.filter(o => String(o.status || '').toLowerCase() !== 'cancelled');
    const totalAllBilled = nonCancelledOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const totalAllPaid = nonCancelledOrders.reduce((s, o) => s + (parseFloat(o.paid_amount) || 0), 0);
    const computedOutstanding = Math.max(0, totalAllBilled - totalAllPaid);
    const balance = Math.max(parseFloat(c.balance) || 0, computedOutstanding);

    const skusList = Object.values(skuMap);

    const html = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- KPI Answer Summary Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
          <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">12-Month Orders</div>
            <div style="font-size:18px; font-weight:800; color:var(--accent); margin-top:4px;">${UTILS.fmtCurrency(total12mBilled)}</div>
            <div style="font-size:11px; color:var(--text-secondary);">${past12mOrders.length} orders in last 12 mos</div>
          </div>
          <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Dispatched Units</div>
            <div style="font-size:18px; font-weight:800; color:var(--success); margin-top:4px;">${totalDispatchedUnits.toLocaleString()}</div>
            <div style="font-size:11px; color:var(--text-secondary);">${totalBoxesDispatched} bxs + ${totalLooseDispatched} loose</div>
          </div>
          <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Pending Quantity</div>
            <div style="font-size:18px; font-weight:800; color:${totalPendingUnits > 0 ? 'var(--warning, #f59e0b)' : 'var(--text-muted)'}; margin-top:4px;">${totalPendingUnits.toLocaleString()}</div>
            <div style="font-size:11px; color:var(--text-secondary);">Awaiting godown exit</div>
          </div>
          <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Outstanding Balance</div>
            <div style="font-size:18px; font-weight:800; color:${balance > 0 ? 'var(--danger, #ef4444)' : 'var(--success)'}; margin-top:4px;">${UTILS.fmtCurrency(balance)}</div>
            <div style="font-size:11px; color:var(--text-secondary);">Credit Limit: ${UTILS.fmtCurrency(c.credit_limit || 0)}</div>
          </div>
          <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Cancellations</div>
            <div style="font-size:18px; font-weight:800; color:var(--danger); margin-top:4px;">${totalCancelledUnits.toLocaleString()}</div>
            <div style="font-size:11px; color:var(--text-secondary);">Cancelled units</div>
          </div>
        </div>

        <!-- Purchased SKUs Breakdown -->
        <div>
          <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Purchased SKUs & Packaging Sizes (${skusList.length})</h4>
          <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
            <table class="data-table" style="font-size:12.5px; width:100%; min-width:580px; margin:0;">
              <thead>
                <tr>
                  <th>Product Formulation</th>
                  <th>Packaging Size</th>
                  <th>Ordered Units</th>
                  <th>Dispatched Units</th>
                  <th>Pending Units</th>
                  <th>Total Billed</th>
                </tr>
              </thead>
              <tbody>
                ${skusList.length ? skusList.map(s => `<tr>
                  <td class="cell-bold">${s.productName}</td>
                  <td><span class="badge badge-neutral">${s.packingSize}</span></td>
                  <td>${s.orderedUnits.toLocaleString()}</td>
                  <td class="text-success" style="font-weight:700;">${s.dispatchedUnits.toLocaleString()}</td>
                  <td style="color:${s.pendingUnits > 0 ? 'var(--warning)' : 'var(--text-muted)'}; font-weight:700;">${s.pendingUnits.toLocaleString()}</td>
                  <td class="cell-amount">${UTILS.fmtCurrency(s.revenue)}</td>
                </tr>`).join('') : '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:16px;">No SKUs purchased yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Orders Register -->
        <div>
          <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Order History (${orders.length})</h4>
          <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; max-height:240px; overflow:auto; -webkit-overflow-scrolling:touch; width:100%;">
            <table class="data-table" style="font-size:12px; width:100%; min-width:620px; margin:0;">
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Booking Date</th>
                  <th>Order Status</th>
                  <th>Dispatch Status</th>
                  <th>Billed Amount</th>
                  <th>Paid Amount</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                ${orders.length ? orders.map(o => {
                  const b = (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0);
                  return `<tr>
                    <td class="cell-bold">${o.order_no}</td>
                    <td>${UTILS.fmtDate(o.date)}</td>
                    <td><span class="badge ${o.status === 'Completed' ? 'badge-success' : (o.status === 'Cancelled' ? 'badge-danger' : 'badge-warning')}">${o.status}</span></td>
                    <td><span class="badge ${o.dispatch_status === 'Fully Dispatched' ? 'badge-success' : 'badge-neutral'}">${o.dispatch_status || 'Pending'}</span></td>
                    <td class="cell-amount">${UTILS.fmtCurrency(o.total_amount)}</td>
                    <td class="cell-amount text-success">${UTILS.fmtCurrency(o.paid_amount)}</td>
                    <td class="cell-amount ${b > 0 ? 'text-danger' : 'text-success'}">${UTILS.fmtCurrency(b)}</td>
                  </tr>`;
                }).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center; padding:16px;">No order history found.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Dispatches Register if available -->
        ${dispatches.length ? `
          <div>
            <h4 style="font-size:13px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin:0 0 10px;">Dispatches & Gate Passes (${dispatches.length})</h4>
            <div class="table-scroll-wrap" style="background:var(--bg); border:1px solid var(--border); border-radius:8px; max-height:200px; overflow:auto; -webkit-overflow-scrolling:touch; width:100%;">
              <table class="data-table" style="font-size:12px; width:100%; min-width:620px; margin:0;">
                <thead>
                  <tr>
                    <th>Dispatch Slip</th>
                    <th>Date</th>
                    <th>Order Ref</th>
                    <th>Vehicle</th>
                    <th>Boxes / Loose</th>
                    <th>Total Units</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${dispatches.map(d => `<tr>
                    <td class="cell-bold">${d.dispatch_no}</td>
                    <td>${UTILS.fmtDate(d.dispatch_date)}</td>
                    <td>${d.order_no}</td>
                    <td>${d.vehicle_no || 'Direct'}</td>
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

    bodyEl.innerHTML = html;
  } catch (err) {
    console.error('openClientHistory error:', err);
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger);"><p>Failed to load customer profile: ${err.message}</p></div>`;
  }
}

function exportClientProfileToExcel() {
  if (!activeProfileClient) return;
  const c = activeProfileClient;

  // Query table rows directly from modal to guarantee 100% exact match
  const rows = [];
  const trs = document.querySelectorAll('#client-history-modal-body table tbody tr');
  trs.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 6) {
      rows.push({
        'Product Formulation': tds[0].innerText.trim(),
        'Packaging Size': tds[1].innerText.trim(),
        'Ordered Units': tds[2].innerText.trim(),
        'Dispatched Units': tds[3].innerText.trim(),
        'Pending Units': tds[4].innerText.trim(),
        'Total Billed': tds[5].innerText.trim()
      });
    }
  });

  if (window.XLSX && rows.length) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales_Profile');
    XLSX.writeFile(wb, `${c.name.replace(/\s+/g, '_')}_Sales_Ledger.xlsx`);
    APP.showToast('Client ledger exported to Excel!', 'success');
  } else if (rows.length) {
    UTILS.exportToCSV(rows, `${c.name}_Sales_Ledger`);
  } else {
    APP.showToast('No customer ledger rows to export', 'warning');
  }
}

window.openClientHistory = openClientHistory;
window.exportClientProfileToExcel = exportClientProfileToExcel;

loadClients();
