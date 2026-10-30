/* purchases.js */
let allPurchases = [], purchaseItems = [], editingPurchaseId = null;
let purchasableItems = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

let isLoadingPurchases = false;
let pendingPurchasesReload = false;

async function loadPurchases() {
  if (isLoadingPurchases) {
    pendingPurchasesReload = true;
    return;
  }
  isLoadingPurchases = true;
  console.log('Loading purchases...');
  updatePageDebug('Loading Purchases...', '#0C3925');
  
  try {
    UTILS.renderTableSkeleton('purchases-table');
    await DB.initDB();
    if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.init) {
      await window.TENANT_CONTEXT.init();
    }
    
    // Load purchasable items, purchases, suppliers, and purchase_items in parallel
    const pQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('purchases').select('*').order('id', { ascending: false })) : window.dbClient.from('purchases').select('*').order('id', { ascending: false });
    const supQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('suppliers').select('*')) : window.dbClient.from('suppliers').select('*');
    const piQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('purchase_items').select('*')) : window.dbClient.from('purchase_items').select('*');

    const [, pRes, supRes, piRes] = await Promise.all([
      refreshPurchasableItems(),
      pQuery,
      supQuery,
      piQuery
    ]);

    if (pRes.error) throw pRes.error;
    allPurchases = pRes.data || [];
    const suppliersList = supRes.data || [];
    const allItems = piRes.data || [];
    
    allPurchases.forEach(p => {
      const match = suppliersList.find(s => s.id === p.supplier_id);
      p.supplier_display = match ? match.name : (p.supplier_name || '—');
      p.items = allItems.filter(it => it.purchase_id === p.id);
    });

    allPurchases = UTILS.sortLatestFirst(allPurchases, p => p.purchase_no || p.id);
    renderTable(allPurchases);
    if (typeof window !== 'undefined') window.allPurchases = allPurchases;
    await populateSupplierSelect();
    
    updatePageDebug('Ready (' + allPurchases.length + ')', '#0C3925');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    
    console.log('Purchases: All data loaded successfully');

    // Attach debounced search listener
    const searchInput = document.getElementById('search-input');
    if (searchInput && !searchInput.dataset.listenerAttached) {
      searchInput.dataset.listenerAttached = 'true';
      searchInput.addEventListener('input', (typeof UTILS !== 'undefined' && UTILS.debounce) ? UTILS.debounce(filterAndRender, 250) : filterAndRender);
    }

  } catch (err) {
    console.error('Purchases loadPurchases failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load purchases: ' + err.message, 'error');
  } finally {
    isLoadingPurchases = false;
    if (pendingPurchasesReload) {
      pendingPurchasesReload = false;
      loadPurchases();
    }
  }
}

async function refreshPurchasableItems() {
  try {
    const prodQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('products').select('id, name, unit, item_size, packaging')) : window.dbClient.from('products').select('id, name, unit, item_size, packaging');
    const invQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('inventory_items').select('id, name, unit, item_size')) : window.dbClient.from('inventory_items').select('id, name, unit, item_size');

    const [pRes, iRes] = await Promise.all([
      prodQuery,
      invQuery
    ]);
    const p = pRes.data || [];
    const i = iRes.data || [];
    
    const combined = [
      ...i.map(x => {
        const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(x.name) : (x.name || '');
        const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(x.unit || 'Nos') : (x.unit || 'Nos');
        return { id: x.id, name: cName, rawName: x.name, unit: cUnit, type: 'Inventory', item_size: x.item_size };
      }),
      ...p.map(x => {
        const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(x.name) : (x.name || '');
        const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(x.unit || 'Nos') : (x.unit || 'Nos');
        return { id: x.id, name: cName, rawName: x.name, unit: cUnit, type: 'Catalog', item_size: x.item_size || x.packaging };
      })
    ];
    
    const map = new Map();
    combined.forEach(x => {
      if (!x.name) return;
      const key = x.name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { id: x.id, name: x.name.trim(), rawName: x.rawName, unit: x.unit || 'Nos', type: x.type, item_size: x.item_size });
      }
    });

    purchasableItems = Array.from(map.values());
    if (typeof window !== 'undefined') window.purchasableItems = purchasableItems;
  } catch (err) {
    console.error('refreshPurchasableItems failed:', err);
  }
}

let purchasesTableEnhancer = null;

const safeEscape = (str) => {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};

function renderPurchasesSlice(data) {
  const tbody = document.querySelector('#purchases-table tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(p => {
    let itemsHtml = '—';
    if (p.items && p.items.length > 0) {
      const count = p.items.length;
      const formatTag = (it) => {
        const fullName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.item_name || 'Item') : (it.item_name || 'Item');
        const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(it.unit || '') : (it.unit || '');
        const u = cUnit ? ` ${cUnit.trim()}` : '';
        const rawQty = it.quantity !== undefined && it.quantity !== null ? `${it.quantity}${u}` : '';
        const qtyText = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(rawQty) : rawQty;
        const qtyBadge = qtyText ? `<span class="purchase-item-qty">(${qtyText})</span>` : '';
        return `<span class="purchase-item-tag" title="${safeEscape(fullName)}"><span class="purchase-item-name">${safeEscape(fullName)}</span>${qtyBadge}</span>`;
      };

      if (count <= 2) {
        itemsHtml = `<div class="purchase-items-summary-wrap">${p.items.map(formatTag).join('')}</div>`;
      } else {
        const firstTwo = p.items.slice(0, 2).map(formatTag).join('');
        const remaining = count - 2;
        itemsHtml = `<div class="purchase-items-summary-wrap">${firstTwo}<button type="button" class="purchase-more-badge" onclick="viewPurchase(${p.id})" title="Click to view all ${count} items in structured detail">+${remaining} more</button></div>`;
      }
    }

    const total = parseFloat(p.total_amount) || 0;
    const paid = parseFloat(p.paid_amount) || 0;
    const balance = (parseFloat(p.total_amount) || 0) - (parseFloat(p.paid_amount) || 0);
    const balanceText = UTILS.fmtCurrency(balance);
    const balanceClass = balance > 0.01 ? 'text-danger' : 'text-success';
    const dateFormatted = UTILS.fmtDate(p.date);

    return `<tr>
      <td class="col-purchaseno cell-bold">
        <div class="purchase-header-stack">
          <div class="purchase-primary-id">${safeEscape(p.purchase_no)}</div>
          ${p.invoice_no ? `<span class="sub-invoice-tag badge-mono">Inv: ${safeEscape(p.invoice_no)}</span>` : ''}
        </div>
        <div class="sub-date-mobile">${dateFormatted}</div>
      </td>
      <td class="col-invoiceno cell-mono">${safeEscape(p.invoice_no || '—')}</td>
      <td class="col-supplier">
        <div class="supplier-primary-name">${safeEscape(p.supplier_display || '—')}</div>
        <div class="sub-date-tag">${dateFormatted}</div>
      </td>
      <td class="col-items cell-items-summary">${itemsHtml}</td>
      <td class="col-date">${dateFormatted}</td>
      <td class="col-total cell-amount">
        <div class="total-primary-amount">${UTILS.fmtCurrency(total)}</div>
        <div class="sub-balance-tag ${balanceClass}">Bal: ${balanceText}</div>
      </td>
      <td class="col-paid cell-amount text-success">${UTILS.fmtCurrency(paid)}</td>
      <td class="col-balance cell-amount ${balanceClass}">${balanceText}</td>
      <td class="col-actions"><div class="row-actions">
        <button class="action-btn view" onclick="viewPurchase(${p.id})" title="View Purchase Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="action-btn edit" onclick="openEdit(${p.id})" title="Edit Purchase"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" onclick="deletePurchase(${p.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
  UTILS.applyMobileTableLabels('purchases-table');
}

async function viewPurchase(id) {
  let p = (allPurchases || []).find(x => String(x.id) === String(id));
  if (!p || !Array.isArray(p.items) || !p.items.length) {
    try {
      const { data: dbP } = await window.dbClient.from('purchases').select('*').eq('id', id).maybeSingle();
      if (dbP) {
        const { data: itData } = await window.dbClient.from('purchase_items').select('*').eq('purchase_id', id);
        dbP.items = itData || [];
        p = dbP;
      }
    } catch (_) {}
  }
  if (!p) {
    if (typeof APP !== 'undefined' && APP.showToast) APP.showToast('Purchase record not found', 'error');
    return;
  }

  const modalTitle = document.getElementById('purchase-view-title');
  if (modalTitle) modalTitle.textContent = `Purchase Details — ${p.purchase_no || 'P-' + p.id}`;

  const viewContent = document.getElementById('purchase-view-content');
  if (!viewContent) return;

  const total = parseFloat(p.total_amount) || 0;
  const paid = parseFloat(p.paid_amount) || 0;
  const balance = Math.max(0, total - paid);
  const statusVal = p.status || 'Delivered';
  const isDelivered = statusVal.toLowerCase() === 'delivered';
  const statusBadge = `<span class="badge ${isDelivered ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;
  const supplierName = p.supplier_display || p.supplier_name || '—';

  let itemsHtml = (p.items || []).map((it, idx) => {
    const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.item_name || 'Item') : (it.item_name || 'Item');
    const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(it.unit || '') : (it.unit || '');
    const u = cUnit ? ` ${cUnit.trim()}` : '';
    const qty = it.quantity !== undefined && it.quantity !== null ? it.quantity : 0;
    const price = parseFloat(it.unit_price) || 0;
    const lineTotal = parseFloat(it.total) || (qty * price);
    const expiry = it.expiry_date ? (typeof UTILS !== 'undefined' ? UTILS.fmtDate(it.expiry_date) : it.expiry_date.split('T')[0]) : '—';

    return `
      <tr class="purchase-detail-row" style="border-bottom:1px solid var(--border);">
        <td class="col-idx" data-label="#" style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px 6px;">${idx + 1}</td>
        <td class="col-name" data-label="Item Name" style="font-weight:600; color:var(--text-primary); word-break:break-word; padding:10px 10px;">
          ${safeEscape(cName)}
        </td>
        <td class="col-expiry" data-label="Expiry" style="font-size:12px; color:var(--text-secondary); padding:10px 8px;">${expiry}</td>
        <td class="col-qty" data-label="Qty" style="text-align:right; font-weight:700; color:var(--text-primary); white-space:nowrap; padding:10px 8px;">${qty}${u}</td>
        <td class="col-price" data-label="Unit Price" style="text-align:right; color:var(--text-secondary); white-space:nowrap; padding:10px 8px;">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(price) : '₹' + price.toFixed(2)}</td>
        <td class="col-linetotal" data-label="Total" style="text-align:right; font-weight:700; color:var(--accent, #059669); white-space:nowrap; padding:10px 10px;">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(lineTotal) : '₹' + lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  if (!itemsHtml) {
    itemsHtml = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">No line items recorded for this purchase.</td></tr>`;
  }

  viewContent.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Header Banner / Cards -->
      <div style="background:var(--surface, #ffffff); border:1px solid var(--border); border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:18px; font-weight:800; color:var(--primary);">${safeEscape(p.purchase_no || 'P-' + p.id)}</span>
              ${p.invoice_no ? `<span class="badge badge-neutral" style="font-family:monospace;">Inv: ${safeEscape(p.invoice_no)}</span>` : ''}
              ${statusBadge}
            </div>
            <h4 style="margin:6px 0 0; font-size:15px; font-weight:700; color:var(--text-primary);">
              Supplier: ${safeEscape(supplierName)}
            </h4>
          </div>
          <div style="text-align:right; font-size:12.5px; color:var(--text-muted);">
            <div>Booked: <strong style="color:var(--text-primary);">${typeof UTILS !== 'undefined' ? UTILS.fmtDate(p.date) : p.date}</strong></div>
            ${p.due_date ? `<div>Due: <strong style="color:var(--text-primary);">${typeof UTILS !== 'undefined' ? UTILS.fmtDate(p.due_date) : p.due_date}</strong></div>` : ''}
          </div>
        </div>

        <!-- 4 Financial Metric Cards -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
          <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:2px;">Total Amount</span>
            <span style="font-size:15px; font-weight:800; color:var(--text-primary);">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(total) : '₹' + total.toFixed(2)}</span>
          </div>
          <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:2px;">Amount Paid</span>
            <span style="font-size:15px; font-weight:800; color:var(--success, #10b981);">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(paid) : '₹' + paid.toFixed(2)}</span>
          </div>
          <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:2px;">Balance Due</span>
            <span style="font-size:15px; font-weight:800; color:${balance > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)'};">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(balance) : '₹' + balance.toFixed(2)}</span>
          </div>
          <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:2px;">Line Items</span>
            <span style="font-size:15px; font-weight:800; color:var(--text-primary);">${(p.items || []).length} items</span>
          </div>
        </div>

        <!-- Inward Logistics Route (Source & Destination) -->
        <div class="dispatch-route-card-block inward-route-block" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div class="dispatch-route-col" style="background:rgba(12,57,37,0.06); padding:10px 12px; border-radius:6px; border:1px solid rgba(12,57,37,0.18);">
            <div class="dispatch-route-label" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--primary); margin-bottom:4px;">SOURCE (SUPPLIER)</div>
            <div class="dispatch-route-val" style="font-weight:700; font-size:13px; color:var(--text);">${safeEscape(supplierName)}</div>
            <div class="dispatch-route-sub" style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">Commercial Inward Vendor</div>
          </div>
          <div class="dispatch-route-col dispatch-dest-col" style="background:rgba(2,132,199,0.06); padding:10px 12px; border-radius:6px; border:1px solid rgba(2,132,199,0.18);">
            <div class="dispatch-route-label" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0284c7; margin-bottom:4px;">DESTINATION (RECEIVING GODOWN)</div>
            <div class="dispatch-route-val" style="font-weight:700; font-size:13px; color:var(--text);">${(() => {
              const whName = p.items && p.items[0]?.warehouse;
              return whName || 'Main Plant Warehouse (WH-E-01)';
            })()}</div>
            <div class="dispatch-route-sub" style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">Inward Stock Storage Facility</div>
          </div>
        </div>
      </div>

      <!-- Line Items Section -->
      <div>
        <h4 style="font-size:13.5px; font-weight:700; margin:0 0 8px; color:var(--text-primary);">Purchased Items (${(p.items || []).length})</h4>
        <div class="purchase-detail-table-wrap table-scroll-wrap" style="width:100%; border:1px solid var(--border); border-radius:8px; box-sizing:border-box; overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table class="data-table purchase-detail-items-table" id="purchase-detail-items-table" style="margin:0; width:100%; min-width:560px; border-collapse:collapse;">
            <thead>
              <tr style="background:var(--bg); border-bottom:1px solid var(--border);">
                <th style="width:6%; min-width:32px; text-align:center; padding:9px 6px; font-size:11.5px; white-space:nowrap;">#</th>
                <th style="width:44%; min-width:160px; padding:9px 10px; font-size:11.5px; text-align:left; white-space:nowrap;">Item Name</th>
                <th style="width:15%; min-width:90px; padding:9px 8px; font-size:11.5px; text-align:left; white-space:nowrap;">Expiry</th>
                <th style="width:11%; min-width:70px; padding:9px 8px; font-size:11.5px; text-align:right; white-space:nowrap;">Qty</th>
                <th style="width:11%; min-width:90px; padding:9px 8px; font-size:11.5px; text-align:right; white-space:nowrap;">Unit Price</th>
                <th style="width:13%; min-width:95px; padding:9px 10px; font-size:11.5px; text-align:right; white-space:nowrap;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr style="background:var(--bg); font-weight:700; border-top:2px solid var(--border);">
                <td colspan="3" style="text-align:right; padding:10px 12px; font-size:12.5px;">Grand Total:</td>
                <td style="text-align:right; padding:10px 8px; font-size:12.5px;">${(p.items || []).reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0)}</td>
                <td></td>
                <td style="text-align:right; padding:10px 10px; font-size:13.5px; color:var(--accent, #059669); font-weight:800;">${typeof UTILS !== 'undefined' ? UTILS.fmtCurrency(total) : '₹' + total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Notes Section -->
      ${p.notes ? `
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:8px; padding:12px 14px;">
          <strong style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:4px;">Notes / Observations:</strong>
          <p style="margin:0; font-size:13px; color:var(--text-secondary); white-space:pre-wrap;">${safeEscape(p.notes)}</p>
        </div>
      ` : ''}
    </div>
  `;

  const editBtn = document.getElementById('purchase-view-edit-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      APP.closeModal('purchase-view-modal');
      openEdit(p.id);
    };
  }

  APP.openModal('purchase-view-modal');
}
window.viewPurchase = viewPurchase;

function renderTable(data) {
  const tbody = document.querySelector('#purchases-table tbody');
  if (!tbody) return;
  const countEl = document.getElementById('total-info');
  if (countEl) countEl.textContent = `${data.length} purchase${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><div class="empty-state"><h3>No purchases found</h3></div></td></tr>`;
    const pag = document.querySelector('.table-wrap .pagination, #purchases-table-wrap .pagination');
    if (pag) {
      pag.innerHTML = '';
      pag.style.display = 'none';
    }
    return;
  }

  if (window.TableEnhancer) {
    if (!purchasesTableEnhancer) {
      purchasesTableEnhancer = new window.TableEnhancer({
        tableId: 'purchases-table',
        pageSize: 25,
        defaultSortKey: 'id',
        defaultSortOrder: 'desc',
        onRender: (pageSlice) => renderPurchasesSlice(pageSlice)
      });
      window.purchasesTableEnhancer = purchasesTableEnhancer;
    }
    purchasesTableEnhancer.setData(data);
    return;
  }

  renderPurchasesSlice(data.slice(0, 50));
}

function filterAndRender() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  let filtered = allPurchases;
  if (q) {
    filtered = filtered.filter(p => {
      const itemsText = (p.items || []).map(it => it.item_name || '').join(' ').toLowerCase();
      return (p.purchase_no || '').toLowerCase().includes(q) || 
        (p.supplier_display || '').toLowerCase().includes(q) || 
        (p.invoice_no || '').toLowerCase().includes(q) ||
        (p.date || '').toLowerCase().includes(q) ||
        itemsText.includes(q);
    });
  }
  filtered = UTILS.sortLatestFirst(filtered, p => p.purchase_no || p.id);
  renderTable(filtered);
}

async function populateSupplierSelect() {
  const sel = document.getElementById('supplier-select');
  if (!sel) return;
  try {
    const { data: supData, error } = await window.dbClient.from('suppliers').select('*');
    const suppliers = error ? [] : supData || [];
    sel.innerHTML = '<option value="">Select Supplier</option>' + suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (sel._ussInstance) {
      sel._ussInstance.updateOptions();
    } else if (window.UniversalSearchSelect) {
      new UniversalSearchSelect(sel);
      sel.dataset.ussInitialized = 'true';
    }
  } catch (err) {
    console.error('populateSupplierSelect failed:', err);
  }
}

async function openAdd() {
  editingPurchaseId = null;
  document.getElementById('modal-title').textContent = 'New Purchase Entry';
  const purchaseForm = document.getElementById('purchase-form');
  purchaseForm.reset();
  await refreshPurchasableItems();
  purchaseItems = [];
  await addPurchaseItem();
  UTILS.applyDefaultDateInputs(purchaseForm, { skipFieldNames: ['due_date'] });
  const sup = document.getElementById('supplier-select');
  if (sup) {
    sup.value = '';
    if (sup._ussInstance) {
      sup._ussInstance.updateOptions();
    } else if (window.UniversalSearchSelect) {
      new UniversalSearchSelect(sup);
      sup.dataset.ussInitialized = 'true';
    }
  }
  APP.openModal('purchase-modal');
}

async function openEdit(id) {
  editingPurchaseId = id;
  try {
    await refreshPurchasableItems();
    const { data: p, error } = await window.dbClient.from('purchases').select('*').eq('id', id).single();
    if (error) throw error;
    
    // Fetch line items for this purchase
    const { data: piData, error: piError } = await window.dbClient.from('purchase_items').select('*').eq('purchase_id', id);
    if (!piError && piData) {
      p.items = piData;
    }
    
    document.getElementById('modal-title').textContent = 'Edit Purchase';
    UTILS.populateForm('purchase-form', p);
    UTILS.applyDefaultDateInputs(document.getElementById('purchase-form'), { skipFieldNames: ['due_date'] });

    const sup = document.getElementById('supplier-select');
    if (sup) {
      sup.value = p.supplier_id || '';
      if (sup._ussInstance) {
        sup._ussInstance.updateOptions();
      } else if (window.UniversalSearchSelect) {
        new UniversalSearchSelect(sup);
        sup.dataset.ussInitialized = 'true';
      }
    }

    purchaseItems = p.items || [];
    
    // Map items list correctly and clean duplicate box names
    purchaseItems.forEach(it => {
      if (typeof UTILS !== 'undefined' && UTILS.cleanItemName) {
        it.item_name = UTILS.cleanItemName(it.item_name);
      }
      it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
    });

    renderPurchaseItems();
    APP.openModal('purchase-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load purchase details: ' + err.message, 'error');
  }
}

async function getNextPurchaseBatchNo(offset = 0) {
  try {
    const [{ data: batches }, { data: purItems }, { data: existingPurchases }] = await Promise.all([
      window.dbClient.from('stock_batches').select('batch_no'),
      window.dbClient.from('purchase_items').select('batch_no'),
      window.dbClient.from('purchases').select('purchase_no')
    ]);
      
    let maxNum = 0;
    const all = [
      ...(batches || []),
      ...(purItems || []),
      ...(existingPurchases || []).map(p => ({ batch_no: p.purchase_no }))
    ];
    for (const b of all) {
      if (b.batch_no && typeof b.batch_no === 'string') {
        const match = b.batch_no.match(/^(?:PUR|P)-(\d+)$/i);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum && n < 100000) {
            maxNum = n;
          }
        }
      }
    }
    // Also consider any batch numbers already assigned in the current purchaseItems table
    for (const it of purchaseItems) {
      if (it.batch_no && typeof it.batch_no === 'string') {
        const match = it.batch_no.match(/^(?:PUR|P)-(\d+)$/i);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum && n < 100000) {
            maxNum = n;
          }
        }
      }
    }
    const nextNum = maxNum + 1 + offset;
    return `P-${String(nextNum).padStart(2, '0')}`;
  } catch (err) {
    console.error('Error getting next purchase batch no:', err);
    return `P-${String(1 + offset).padStart(2, '0')}`;
  }
}

async function addPurchaseItem() {
  const nextBatch = await getNextPurchaseBatchNo(0);
  purchaseItems.push({ id: Date.now(), item_id: '', item_name: '', item_type: 'Catalog', quantity: 1, unit_price: 0, batch_no: nextBatch, expiry_date: '', total: 0 });
  renderPurchaseItems();
}

function renderPurchaseItems() {
  const tbody = document.getElementById('purchase-items-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = purchaseItems.map((it, idx) => `
    <tr>
      <td style="min-width:240px;">
        <span class="mobile-label">Item Name</span>
        <input type="text" 
               class="form-input item-search-input" 
               value="${(typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.item_name || '') : (it.item_name || '')}" 
               placeholder="Search catalog/inventory or type name..." 
               autocomplete="off" 
               onfocus="showItemSuggestions(${idx}, this)" 
               oninput="onItemSearchInput(${idx}, this)" 
               onblur="hideItemSuggestionsLater(${idx})">
      </td>
      <td>
        <span class="mobile-label">Expiry Date</span>
        <input type="date" class="form-input" value="${it.expiry_date ? it.expiry_date.split('T')[0] : ''}" onchange="updateItem(${idx}, 'expiry_date', this.value)">
      </td>
      <td>
        <span class="mobile-label">Quantity</span>
        <input type="number" class="form-input" value="${it.quantity}" onchange="updateItem(${idx}, 'quantity', this.value)">
      </td>
      <td>
        <span class="mobile-label">Unit Price (₹)</span>
        <input type="number" class="form-input" value="${it.unit_price}" onchange="updateItem(${idx}, 'unit_price', this.value)">
      </td>
      <td class="cell-amount" id="item-total-${idx}">
        <span class="mobile-label">Total</span>
        ${UTILS.fmtCurrency(it.total)}
      </td>
      <td>
        <span class="mobile-label">Remove</span>
        <button class="action-btn delete" onclick="removePurchaseItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </td>
    </tr>
  `).join('');
  
  calculateTotal();
}

let activeSearchInput = null;

function getSuggestionsPortal() {
  let portal = document.getElementById('item-suggestions-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'item-suggestions-portal';
    portal.className = 'uss-portal-custom';
    portal.style.position = 'absolute';
    portal.style.zIndex = '999999';
    portal.style.background = 'var(--surface, #121e18)';
    portal.style.border = '1px solid var(--border, rgba(12, 57, 37, 0.25))';
    portal.style.borderRadius = 'var(--radius-sm, 8px)';
    portal.style.maxHeight = '240px';
    portal.style.overflowY = 'auto';
    portal.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(12, 57, 37, 0.15)';
    portal.style.backdropFilter = 'blur(12px)';
    portal.style.display = 'none';
    document.body.appendChild(portal);
  }
  return portal;
}

function showItemSuggestions(idx, inputEl) {
  renderSuggestionsList(idx, inputEl);
}

function onItemSearchInput(idx, inputEl) {
  const val = inputEl.value;
  updateItem(idx, 'item_name', val);
  renderSuggestionsList(idx, inputEl);
}

function renderSuggestionsList(idx, inputEl) {
  activeSearchInput = { idx, el: inputEl };
  const portal = getSuggestionsPortal();
  const query = inputEl.value || '';
  const q = query.trim().toLowerCase();
  
  // Filter matches
  const matches = purchasableItems.filter(m => m.name && m.name.toLowerCase().includes(q));

  // Hide portal if no relevant matching item exists
  if (matches.length === 0) {
    portal.style.display = 'none';
    portal.innerHTML = '';
    return;
  }

  // Position portal relative to inputEl in viewport
  const rect = inputEl.getBoundingClientRect();
  portal.style.top = `${rect.bottom + window.scrollY + 4}px`;
  portal.style.left = `${rect.left + window.scrollX}px`;
  portal.style.width = `${Math.max(rect.width, 240)}px`;

  portal.innerHTML = matches.map(m => {
    const safeName = m.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const typeBadge = m.type ? `<span style="font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 999px; background: rgba(12, 57, 37, 0.12); color: var(--accent, #0C3925); border: 1px solid rgba(12, 57, 37, 0.2);">${m.type}</span>` : '';
    return `<div class="suggestion-item" 
         style="padding: 10px 14px; cursor: pointer; color: var(--text-primary, #f8fafc); font-size: 13px; font-family: inherit; border-bottom: 1px solid rgba(255,255,255,0.03); display: flex; justify-content: space-between; align-items: center; transition: background 0.15s ease, color 0.15s ease;"
         onmouseenter="this.style.background='rgba(12, 57, 37, 0.12)'; this.style.color='var(--accent, #0C3925)';"
         onmouseleave="this.style.background='transparent'; this.style.color='var(--text-primary, #f8fafc)';"
         onmousedown="selectItemSuggestion(${idx}, '${safeName}')">
      <span style="font-weight: 500;">${m.name}</span>
      ${typeBadge}
    </div>`;
  }).join('');
  portal.style.display = 'block';
}

function selectItemSuggestion(idx, name) {
  if (activeSearchInput && activeSearchInput.el) {
    activeSearchInput.el.value = name;
  }
  updateItem(idx, 'item_name', name);
  const portal = getSuggestionsPortal();
  portal.style.display = 'none';
}

function hideItemSuggestionsLater() {
  setTimeout(() => {
    const portal = getSuggestionsPortal();
    portal.style.display = 'none';
  }, 200);
}

function updateItem(idx, key, val) {
  const it = purchaseItems[idx];
  if (!it) return;

  if (key === 'item_name' || key === 'item_key') {
    const nameTrimmed = (val || '').trim();
    it.item_name = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(nameTrimmed) : nameTrimmed;
    const match = purchasableItems.find(m => 
      m.name.toLowerCase() === nameTrimmed.toLowerCase() ||
      (m.rawName && m.rawName.toLowerCase() === nameTrimmed.toLowerCase())
    );
    if (match) {
      it.item_id = match.id;
      it.item_type = match.type;
      it.unit = match.unit || 'Nos';
    } else {
      it.item_id = '';
      it.item_type = 'Catalog';
      it.unit = 'Nos';
    }
  } else {
    it[key] = val;
  }
  
  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  const totalCell = document.getElementById(`item-total-${idx}`);
  if (totalCell) {
    totalCell.textContent = UTILS.fmtCurrency(it.total);
  }
  calculateTotal();
}

function removePurchaseItem(idx) {
  purchaseItems.splice(idx, 1);
  renderPurchaseItems();
}

function calculateTotal() {
  const total = purchaseItems.reduce((s, it) => s + it.total, 0);
  document.getElementById('purchase-total-display').textContent = UTILS.fmtCurrency(total);
}

async function savePurchaseDirect(payload, items) {
  const isEdit = !!editingPurchaseId;
  let purchaseId = editingPurchaseId;
  let purchaseNo = '';
  const affectedItemIds = new Set();

  if (isEdit) {
    const updateData = {
      invoice_no: payload.p_invoice_no || '',
      supplier_id: payload.p_supplier_id ? parseInt(payload.p_supplier_id, 10) : null,
      supplier_name: payload.p_supplier_name || '',
      date: payload.p_date,
      due_date: payload.p_due_date || null,
      status: payload.p_status || 'Pending',
      total_amount: payload.p_total_amount || 0,
      paid_amount: payload.p_paid_amount || 0,
      notes: payload.p_notes || ''
    };
    const stampedUpdate = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(updateData) : updateData;
    const { error: updErr } = await window.dbClient.from('purchases').update(stampedUpdate).eq('id', purchaseId);
    if (updErr) throw updErr;

    // Fetch old batch item_ids to sync them later
    const { data: oldBatches } = await window.dbClient.from('stock_batches').select('item_id').eq('purchase_id', purchaseId);
    if (oldBatches) {
      oldBatches.forEach(b => { if (b.item_id) affectedItemIds.add(b.item_id); });
    }

    // Remove old items and old batches to re-sync
    await window.dbClient.from('purchase_items').delete().eq('purchase_id', purchaseId);
    await window.dbClient.from('stock_batches').delete().eq('purchase_id', purchaseId);
  } else {
    // Generate next sequential purchase number P-01, P-02...
    const { data: existingPurchases } = await window.dbClient.from('purchases').select('purchase_no');
    let maxNum = 0;
    (existingPurchases || []).forEach(p => {
      const match = String(p.purchase_no || '').match(/\d+/);
      if (match) {
        const n = parseInt(match[0], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    purchaseNo = `P-${String(maxNum + 1).padStart(2, '0')}`;

    const insertData = {
      purchase_no: purchaseNo,
      invoice_no: payload.p_invoice_no || '',
      supplier_id: payload.p_supplier_id ? parseInt(payload.p_supplier_id, 10) : null,
      supplier_name: payload.p_supplier_name || '',
      date: payload.p_date,
      due_date: payload.p_due_date || null,
      status: payload.p_status || 'Pending',
      total_amount: payload.p_total_amount || 0,
      paid_amount: payload.p_paid_amount || 0,
      notes: payload.p_notes || ''
    };
    const stampedInsert = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(insertData) : insertData;
    const { data: insData, error: insErr } = await window.dbClient.from('purchases').insert([stampedInsert]).select();
    if (insErr) throw insErr;
    purchaseId = insData[0].id;
  }

  // Insert purchase line items
  if (items && items.length > 0) {
    const needsBatch = items.some(it => !it.batch_no || !it.batch_no.trim());
    let initialBatchNo = '';
    let startBatchNum = 1;
    if (needsBatch) {
      initialBatchNo = await getNextPurchaseBatchNo(0);
      const m = initialBatchNo.match(/^(?:PUR|P)-(\d+)$/i);
      if (m) startBatchNum = parseInt(m[1], 10);
    }

    let unassignedBatchOffset = 0;
    const resolvedItems = [];
    for (const it of items) {
      let bNo = it.batch_no ? it.batch_no.trim() : '';
      if (!bNo) {
        bNo = `P-${String(startBatchNum + unassignedBatchOffset).padStart(2, '0')}`;
        unassignedBatchOffset++;
      }
      resolvedItems.push({
        ...it,
        batch_no: bNo
      });
    }

    const pItems = resolvedItems.map(it => ({
      purchase_id: purchaseId,
      item_id: it.item_id ? parseInt(it.item_id, 10) : null,
      item_name: it.item_name || '',
      item_type: it.item_type || 'Inventory',
      quantity: parseFloat(it.quantity) || 0,
      unit_price: parseFloat(it.unit_price) || 0,
      batch_no: it.batch_no,
      expiry_date: it.expiry_date || null,
      total: parseFloat(it.total) || 0
    }));
    const stampedPItems = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(pItems) : pItems;
    const { error: itemsErr } = await window.dbClient.from('purchase_items').insert(stampedPItems);
    if (itemsErr) throw itemsErr;

    // If Delivered, create stock batches and log inward movements for inventory tracking
    if (payload.p_status === 'Delivered') {
      const itemsForReceipt = resolvedItems.filter(it => it.item_id).map(it => ({
        itemId: parseInt(it.item_id, 10),
        itemName: it.item_name || '',
        quantity: parseFloat(it.base_quantity || it.quantity) || 0,
        unitPrice: parseFloat(it.unit_price) || 0,
        unit: it.unit || 'Nos',
        batchNo: it.batch_no,
        expiryDate: it.expiry_date || null
      }));

      if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.receivePurchaseReceipt) {
        await window.INVENTORY_SERVICE.receivePurchaseReceipt({
          purchaseId: purchaseId,
          purchaseNo: purchaseNo,
          supplierId: payload.p_supplier_id ? parseInt(payload.p_supplier_id, 10) : null,
          purchaseDate: payload.p_date,
          items: itemsForReceipt
        });
      } else {
        const stockBatches = resolvedItems.filter(it => it.item_id).map(it => ({
          item_id: parseInt(it.item_id, 10),
          item_name: it.item_name || '',
          item_type: 'Inventory',
          batch_no: it.batch_no,
          purchase_id: purchaseId,
          supplier_id: payload.p_supplier_id ? parseInt(payload.p_supplier_id, 10) : null,
          purchase_date: payload.p_date,
          purchase_price: parseFloat(it.unit_price) || 0,
          initial_qty: parseFloat(it.base_quantity || it.quantity) || 0,
          current_qty: parseFloat(it.base_quantity || it.quantity) || 0,
          unit: it.unit || 'Nos',
          expiry_date: it.expiry_date || null
        }));

        if (stockBatches.length > 0) {
          const stampedBatches = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(stockBatches) : stockBatches;
          await window.dbClient.from('stock_batches').insert(stampedBatches);
        }
      }
    }

    // Synchronize all affected inventory items
    resolvedItems.forEach(it => {
      if (it.item_id) affectedItemIds.add(parseInt(it.item_id, 10));
    });
    for (const itemId of affectedItemIds) {
      await window.INVENTORY_SERVICE.syncItemStock(itemId);
    }
  }

  return { success: true, purchase_id: purchaseId, purchase_no: purchaseNo };
}

async function deletePurchaseDirect(id) {
  const { data: oldBatches } = await window.dbClient.from('stock_batches').select('item_id').eq('purchase_id', id);
  const affectedItemIds = new Set((oldBatches || []).map(b => b.item_id));

  await window.dbClient.from('stock_batches').delete().eq('purchase_id', id);
  await window.dbClient.from('purchase_items').delete().eq('purchase_id', id);
  try {
    await window.dbClient.from('stock_movements').delete().eq('txn_id', id);
  } catch (_) {}
  const { error } = await window.dbClient.from('purchases').delete().eq('id', id);
  if (error) throw error;

  for (const itemId of affectedItemIds) {
    await window.INVENTORY_SERVICE.syncItemStock(itemId);
  }
  return { success: true };
}

async function savePurchase() {
  const d = UTILS.getFormData('purchase-form');
  if (!d.supplier_id) { APP.showToast('Please select a supplier', 'error'); return; }
  if (purchaseItems.length === 0) { APP.showToast('Please add at least one item', 'error'); return; }
  
  const supplierSelect = document.getElementById('supplier-select');
  const supplierName = supplierSelect ? supplierSelect.options[supplierSelect.selectedIndex].text : '';
  const total = purchaseItems.reduce((s, it) => s + it.total, 0);
  
  const saveBtn = document.querySelector('#purchase-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, editingPurchaseId ? 'Updating...' : 'Saving...');

  try {
    const rpcPayload = {
      p_invoice_no: d.invoice_no || '',
      p_supplier_id: d.supplier_id,
      p_supplier_name: supplierName,
      p_date: d.date || UTILS.todayStr(),
      p_due_date: d.due_date || null,
      p_status: d.status || 'Pending',
      p_total_amount: total,
      p_paid_amount: parseFloat(d.paid_amount) || 0.00,
      p_notes: d.notes || ''
    };

    // Prepare line items with base quantity conversion
    const itemsPayload = purchaseItems.map(it => {
      let baseQty = parseFloat(it.quantity) || 0;
      let unit = 'Nos';
      
      const match = purchasableItems.find(m => m.id === it.item_id && m.type === it.item_type);
      if (match) {
        unit = match.unit;
        if (match.item_size) {
          const packSizeMl = UTILS.parsePackSizeInMl(match.item_size);
          if (packSizeMl > 0) {
            const baseUnit = UTILS.normalizeUnit(unit);
            if (baseUnit === 'Litre' || baseUnit === 'Kg') {
              baseQty = (packSizeMl / 1000) * baseQty;
            } else if (baseUnit === 'Ml' || baseUnit === 'Gram') {
              baseQty = packSizeMl * baseQty;
            }
          }
        }
      }

      return {
        item_id: it.item_id || null,
        item_name: it.item_name,
        item_type: it.item_type || 'Inventory',
        quantity: parseFloat(it.quantity) || 0,
        base_quantity: baseQty,
        unit_price: parseFloat(it.unit_price) || 0,
        batch_no: it.batch_no || '',
        expiry_date: it.expiry_date || null,
        total: parseFloat(it.total) || 0,
        unit: unit
      };
    });

    rpcPayload.p_items = itemsPayload;

    if (editingPurchaseId) {
      rpcPayload.p_purchase_id = editingPurchaseId;
      await savePurchaseDirect(rpcPayload, itemsPayload);
      APP.showToast('Purchase updated and inventory synced!', 'success');
    } else {
      const res = await savePurchaseDirect(rpcPayload, itemsPayload);
      const createdNo = res.purchase_no;
      APP.showToast(`Purchase ${createdNo || ''} created and inventory synced!`, 'success');
    }

    APP.closeModal('purchase-modal');
    loadPurchases();
  } catch (err) {
    console.error('savePurchase failed:', err);
    APP.showToast('Failed to save purchase: ' + err.message, 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deletePurchase(id) {
  APP.showConfirm('Delete this purchase and all its line items?', async () => {
    try {
      await deletePurchaseDirect(id);
      APP.showToast('Purchase and associated batches deleted', 'success');
      loadPurchases();
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete: ' + err.message, 'error');
    }
  });
}

if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.subscribe) {
  window.TENANT_CONTEXT.subscribe(() => {
    loadPurchases();
  });
}
window.addEventListener('companyChanged', () => {
  loadPurchases();
});

loadPurchases();


// Auto migrate any legacy PUR- batch numbers to standard P- sequence
(async function migrateLegacyPurchaseBatches() {
  try {
    if (!window.dbClient) return;
    const { data: oldBatches } = await window.dbClient.from('stock_batches').select('id, batch_no').ilike('batch_no', 'PUR-%');
    if (oldBatches && oldBatches.length > 0) {
      for (const b of oldBatches) {
        const updatedNo = b.batch_no.replace(/^PUR-(\d+)$/i, 'P-$1');
        await window.dbClient.from('stock_batches').update({ batch_no: updatedNo }).eq('id', b.id);
      }
      console.log('Migrated legacy stock_batches PUR- to P-');
    }
    const { data: oldItems } = await window.dbClient.from('purchase_items').select('id, batch_no').ilike('batch_no', 'PUR-%');
    if (oldItems && oldItems.length > 0) {
      for (const it of oldItems) {
        const updatedNo = it.batch_no.replace(/^PUR-(\d+)$/i, 'P-$1');
        await window.dbClient.from('purchase_items').update({ batch_no: updatedNo }).eq('id', it.id);
      }
      console.log('Migrated legacy purchase_items PUR- to P-');
    }
  } catch (err) {
    console.warn('Batch migration notice:', err);
  }
})();
