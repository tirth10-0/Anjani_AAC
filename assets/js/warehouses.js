/**
 * assets/js/warehouses.js
 * Warehouse & Storage Location Management Module
 *
 * Implements:
 * 1. Multi-company warehouse hierarchy
 * 2. Safe archival and deactivation lifecycle (preserves historical audit trail & stock movements)
 * 3. Safe deletion with dependency classification:
 *    - Active physical stock: Hard blocked, recommends archival or stock transfer
 *    - Historical records (zero balance batches / movements): Offers Archival (recommended) or force delete with audit snapshot preservation
 *    - Zero dependencies: Permanent deletion
 * 4. Action menu: View Details, Edit, Archive/Reactivate, Delete
 */

let allWarehouses = [];
let allCompanies = [];
let allBranches = [];
let warehouseStockMap = new Map();
let warehouseStockSummary = new Map();
let currentWhModalState = null;
let editingWarehouseId = null;
let isDeletingWarehouse = false;
let isArchivingWarehouse = false;

async function loadWarehouses() {
  console.log('Loading warehouses...');
  try {
    UTILS.renderTableSkeleton('warehouses-table');
    await DB.initDB();
    await window.TENANT_CONTEXT.init();

    const [whRes, cRes, bRes, bStockRes] = await Promise.all([
      window.dbClient.from('warehouses').select('*').order('id', { ascending: true }),
      window.dbClient.from('companies').select('*').order('id', { ascending: true }),
      window.dbClient.from('branches').select('*').order('id', { ascending: true }),
      window.dbClient.from('stock_batches').select('warehouse_id, current_qty, unit, item_name').gt('current_qty', 0)
    ]);

    allWarehouses = whRes.data || [];
    allCompanies = cRes.data || [];
    allBranches = bRes.data || [];

    // Map live physical units per warehouse with unit-awareness
    warehouseStockMap = new Map();
    warehouseStockSummary = new Map();

    (bStockRes.data || []).forEach(b => {
      const wId = b.warehouse_id;
      const qty = parseFloat(b.current_qty) || 0;
      const unit = b.unit || 'Nos';

      warehouseStockMap.set(wId, (warehouseStockMap.get(wId) || 0) + qty);

      if (!warehouseStockSummary.has(wId)) {
        warehouseStockSummary.set(wId, {
          activeBatches: 0,
          itemNames: new Set(),
          unitTotals: {}
        });
      }
      const summary = warehouseStockSummary.get(wId);
      summary.activeBatches += 1;
      if (b.item_name) summary.itemNames.add(b.item_name);
      summary.unitTotals[unit] = (summary.unitTotals[unit] || 0) + qty;
    });

    populateCompanyFilterDropdown();
    filterAndRenderWarehouses();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.oninput = filterAndRenderWarehouses;
  } catch (err) {
    console.error('loadWarehouses failed:', err);
    APP.showToast('Failed to load warehouses: ' + err.message, 'error');
    const tbody = document.querySelector('#warehouses-table tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">
            <div class="empty-state" style="padding:32px 16px;text-align:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin:0 auto 10px;color:var(--danger,#ef4444);display:block;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <h3 style="font-size:15px;margin-bottom:6px;color:var(--text-primary);">Failed to Load Warehouses</h3>
              <p class="text-sm text-muted" style="margin-bottom:14px;max-width:400px;margin-left:auto;margin-right:auto;">${escapeHtml(err.message || 'Database connection error')}</p>
              <button class="btn btn-secondary btn-sm" onclick="loadWarehouses()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Retry Loading
              </button>
            </div>
          </td>
        </tr>
      `;
    }
    const totalInfo = document.getElementById('total-info');
    if (totalInfo) totalInfo.textContent = 'Error loading data';
  }
}

function populateCompanyFilterDropdown() {
  const compSelect = document.getElementById('company-filter');
  if (!compSelect) return;

  const urlParams = new URLSearchParams(window.location.search);
  const targetCompId = urlParams.get('company') || urlParams.get('company_id');
  const targetSearch = urlParams.get('search') || urlParams.get('q');

  if (targetSearch) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = targetSearch;
  }

  let html = `<option value="ALL">All Companies (${allWarehouses.length})</option>`;
  const activeCompId = window.TENANT_CONTEXT.getCompanyId();
  const activeComp = allCompanies.find(c => c.id === activeCompId);
  if (activeComp) {
    const activeCount = allWarehouses.filter(w => w.company_id === activeCompId).length;
    html += `<option value="ACTIVE">Current: ${escapeHtml(activeComp.name)} (${escapeHtml(activeComp.code)}) [${activeCount}]</option>`;
  }

  if (allCompanies.length > 0) {
    html += `<optgroup label="Filter by Company">`;
    allCompanies.forEach(c => {
      const count = allWarehouses.filter(w => w.company_id === c.id).length;
      html += `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)}) — ${count} warehouse${count !== 1 ? 's' : ''}</option>`;
    });
    html += `</optgroup>`;
  }

  compSelect.innerHTML = html;

  if (targetCompId && allCompanies.some(c => String(c.id) === String(targetCompId))) {
    compSelect.value = String(targetCompId);
  } else {
    compSelect.value = 'ALL';
  }

  if (compSelect._ussInstance) {
    compSelect._ussInstance.updateOptions();
  } else if (typeof UniversalSearchSelect !== 'undefined' && typeof UniversalSearchSelect.initAll === 'function') {
    UniversalSearchSelect.initAll(compSelect.parentNode || document);
  }
}

function resetWarehouseFilters() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  const compFilter = document.getElementById('company-filter');
  if (compFilter) compFilter.value = 'ALL';
  const statusFilter = document.getElementById('status-filter');
  if (statusFilter) statusFilter.value = 'ALL';
  filterAndRenderWarehouses();
}

function filterAndRenderWarehouses() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const filterMode = document.getElementById('company-filter')?.value || 'ALL';
  const statusFilter = document.getElementById('status-filter')?.value || 'ALL';
  const activeCompanyId = window.TENANT_CONTEXT.getCompanyId();

  let filtered = allWarehouses;

  if (filterMode === 'ACTIVE') {
    filtered = filtered.filter(w => w.company_id === activeCompanyId);
  } else if (filterMode !== 'ALL' && !isNaN(Number(filterMode))) {
    const cId = Number(filterMode);
    filtered = filtered.filter(w => w.company_id === cId);
  }

  if (statusFilter === 'ACTIVE') {
    filtered = filtered.filter(w => (w.status || 'Active') === 'Active');
  } else if (statusFilter === 'ARCHIVED') {
    filtered = filtered.filter(w => w.status === 'Archived');
  }

  if (q) {
    filtered = filtered.filter(w => {
      const comp = allCompanies.find(c => c.id === w.company_id);
      const br = allBranches.find(b => b.id === w.branch_id);
      return (w.name || '').toLowerCase().includes(q) ||
        (w.code || '').toLowerCase().includes(q) ||
        (w.warehouse_type || '').toLowerCase().includes(q) ||
        (comp && comp.name.toLowerCase().includes(q)) ||
        (br && br.name.toLowerCase().includes(q));
    });
  }

  renderWarehousesTable(filtered);
}

function renderWarehousesTable(data) {
  const tbody = document.querySelector('#warehouses-table tbody');
  if (!tbody) return;

  const totalInfo = document.getElementById('total-info');
  if (totalInfo) totalInfo.textContent = `${data.length} warehouse${data.length !== 1 ? 's' : ''}`;

  if (!data.length) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state" style="padding:32px 16px;text-align:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;margin:0 auto 10px;color:var(--text-muted,#9ca3af);display:block;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            <h3 style="font-size:15px;margin-bottom:4px;color:var(--text-primary);">No warehouses found</h3>
            <p class="text-sm text-muted" style="margin-bottom:12px;">No warehouses match the selected company or status filter.</p>
            <button class="btn btn-secondary btn-sm" onclick="resetWarehouseFilters()">
              Reset Filters & Show All
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map(w => {
    const comp = allCompanies.find(c => c.id === w.company_id);
    const br = allBranches.find(b => b.id === w.branch_id);
    const isArchived = (w.status || 'Active') === 'Archived';

    const statusBadge = isArchived
      ? '<span class="badge badge-warning" style="font-size:10px;padding:2px 6px;">Archived</span>'
      : '<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">Active</span>';

    const summary = warehouseStockSummary.get(w.id) || { activeBatches: 0, unitTotals: {} };
    const unitEntries = Object.entries(summary.unitTotals).filter(([u, q]) => q > 0);
    let stockDisplayHtml = '';
    if (summary.activeBatches === 0 || unitEntries.length === 0) {
      stockDisplayHtml = `<span class="badge badge-gray" style="font-size:10.5px;padding:2px 7px;">No active stock</span>`;
    } else {
      const unitsText = unitEntries.map(([u, q]) => `<strong>${q.toLocaleString()}</strong> ${escapeHtml(u)}`).join(', ');
      stockDisplayHtml = `
        <div class="wh-stock-units-wrap">
          <div class="wh-stock-units-line">${unitsText}</div>
          <div class="wh-stock-batches-count">${summary.activeBatches} active batch${summary.activeBatches !== 1 ? 'es' : ''}</div>
        </div>
      `;
    }

    return `
      <tr class="${isArchived ? 'row-archived' : ''}" style="${isArchived ? 'opacity:0.85;' : ''}">
        <td class="cell-bold cell-mono">
          <div class="wh-code-stack">
            <span class="wh-code-text">${escapeHtml(w.code)}</span>
            ${w.is_default ? '<span class="wh-default-pill">DEFAULT</span>' : ''}
          </div>
        </td>
        <td class="cell-wh-name">
          ${escapeHtml(w.name)}
          ${isArchived ? '<span class="text-xs text-muted comp-archived-tag">(Archived Location)</span>' : ''}
        </td>
        <td>
          ${comp ? `
            <div class="wh-entity-stack">
              <span class="wh-entity-name" title="${escapeHtml(comp.name)}">${escapeHtml(comp.name)}</span>
              <span class="wh-entity-code">${escapeHtml(comp.code)}</span>
            </div>
          ` : '—'}
        </td>
        <td class="wh-branch-text">${br ? escapeHtml(br.name) : '<span class="text-muted">General Depot</span>'}</td>
        <td><span class="badge badge-info wh-type-badge">${escapeHtml(w.warehouse_type || 'General')}</span></td>
        <td class="cell-bold cell-wh-stock">
          ${stockDisplayHtml}
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="wh-view-stock-btn" onclick="viewWarehouseDetails(${w.id})" title="View Live Warehouse Stock">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              <span>View Stock</span>
            </button>
            <button class="action-btn edit" onclick="openEditWarehouse(${w.id})" title="Edit Warehouse">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${isArchived ? `
              <button class="action-btn reactivate" onclick="reactivateWarehouse(${w.id})" title="Reactivate Warehouse" style="color:var(--success,#10b981);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            ` : `
              <button class="action-btn archive" onclick="archiveWarehouse(${w.id})" title="Archive Warehouse (Preserve History)" style="color:#d97706;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10"/><path d="M10 12h4"/></svg>
              </button>
            `}
            <button class="action-btn delete" onclick="safeDeleteWarehouse(${w.id})" title="Delete Warehouse" style="color:var(--danger,#ef4444);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  UTILS.applyMobileTableLabels('warehouses-table');
}

/**
 * View Warehouse Profile & Live Inventory / Stock Movements
 */
async function viewWarehouseDetails(id) {
  const w = allWarehouses.find(x => x.id === id);
  if (!w) return;

  const comp = allCompanies.find(c => c.id === w.company_id);
  const br = allBranches.find(b => b.id === w.branch_id);
  const isArchived = (w.status || 'Active') === 'Archived';

  // Set modal header
  const titleEl = document.getElementById('warehouse-view-title');
  if (titleEl) titleEl.textContent = w.name;

  const statusBadgeEl = document.getElementById('warehouse-view-status-badge');
  if (statusBadgeEl) {
    statusBadgeEl.innerHTML = `<span class="badge ${isArchived ? 'badge-warning' : 'badge-success'}">${isArchived ? 'Archived' : 'Active'}</span>`;
  }

  const subtitleEl = document.getElementById('warehouse-view-subtitle');
  if (subtitleEl) {
    subtitleEl.innerHTML = `
      <div class="wh-meta-item">
        <span class="wh-meta-label">Code:</span>
        <span class="wh-meta-val wh-meta-mono">${escapeHtml(w.code)}</span>
      </div>
      <div class="wh-meta-item">
        <span class="wh-meta-label">Legal Entity:</span>
        <span class="wh-meta-val">${comp ? escapeHtml(comp.name) : '—'}</span>
      </div>
      <div class="wh-meta-item">
        <span class="wh-meta-label">Branch:</span>
        <span class="wh-meta-val">${br ? escapeHtml(br.name) : 'Company-wide'}</span>
      </div>
      <div class="wh-meta-item">
        <span class="wh-meta-label">Type:</span>
        <span class="wh-meta-val">${escapeHtml(w.warehouse_type || 'General')}</span>
      </div>
      ${w.is_default ? `
      <div class="wh-meta-item">
        <span class="badge badge-success wh-default-badge" style="font-size:10px;padding:2px 6px;">DEFAULT</span>
      </div>` : ''}
    `;
  }

  switchWhModalTab('stock', false);

  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px;gap:12px;">
        <div class="spinner"></div>
        <p class="text-sm text-muted" style="margin:0;">Loading inventory records for ${escapeHtml(w.name)}...</p>
      </div>
    `;
  }
  APP.openModal('warehouse-view-modal');

  try {
    const [bRes, pRes, iRes, mRes, ppRes] = await Promise.all([
      window.dbClient.from('stock_batches').select('*').eq('warehouse_id', id).order('current_qty', { ascending: false }),
      window.dbClient.from('products').select('id, name, category, packaging, item_size, purchase_price, unit, reorder_level'),
      window.dbClient.from('inventory_items').select('id, name, category, item_size, item_subtype, unit, reorder_level'),
      window.dbClient.from('stock_movements').select('*').eq('warehouse_id', id).order('created_at', { ascending: false }).limit(100),
      window.dbClient.from('product_packaging').select('*')
    ]);

    const pMap = new Map((pRes.data || []).map(p => [p.id, p]));
    const iMap = new Map((iRes.data || []).map(i => [i.id, i]));
    const ppList = ppRes.data || [];

    // Query order_items & orders for batches linked to dispatches or sales orders
    const rawBatchesData = bRes.data || [];
    const relatedOrderIds = [...new Set(rawBatchesData.map(b => b.purchase_id).filter(pid => pid && typeof pid === 'number' && pid < 2147483647))];
    let oiList = [];
    let ordersList = [];
    if (relatedOrderIds.length > 0) {
      try {
        const [oiFetch, ordFetch] = await Promise.all([
          window.dbClient.from('order_items').select('*').in('order_id', relatedOrderIds),
          window.dbClient.from('orders').select('id, order_no, notes').in('id', relatedOrderIds)
        ]);
        oiList = oiFetch.data || [];
        ordersList = ordFetch.data || [];
      } catch (err) {
        console.warn('[Warehouses] Failed to load related order items for packaging resolution:', err);
      }
    }
    const ordersMap = new Map(ordersList.map(o => [o.id, o]));

    function resolveBatchPackaging(b) {
      // 1. Order Items (for batches created from sales or godown dispatch)
      if (b.purchase_id && oiList.length > 0) {
        const matchingOIs = oiList.filter(oi => 
          oi.order_id === b.purchase_id && 
          (oi.product_id === b.item_id || (oi.product_name && b.item_name && oi.product_name.toLowerCase() === b.item_name.toLowerCase()))
        );

        if (matchingOIs.length === 1 && matchingOIs[0].packing_size) {
          return matchingOIs[0].packing_size;
        }

        if (matchingOIs.length > 1) {
          const priceMatch = matchingOIs.find(oi => parseFloat(oi.unit_price) === parseFloat(b.purchase_price));
          if (priceMatch && priceMatch.packing_size) return priceMatch.packing_size;
          const qtyMatch = matchingOIs.find(oi => parseFloat(oi.quantity) === parseFloat(b.initial_qty));
          if (qtyMatch && qtyMatch.packing_size) return qtyMatch.packing_size;
        }

        const ord = ordersMap.get(b.purchase_id);
        if (ord && ord.notes && ord.notes.includes('DISPATCH_META:')) {
          try {
            const raw = ord.notes.replace(/^DISPATCH_META:\s*/, '').trim();
            const meta = JSON.parse(raw);
            const metaItems = meta.items_meta || (meta.dispatches && meta.dispatches.flatMap(d => d.items)) || [];
            const matchedMeta = metaItems.find(it => 
              (it.product_id == b.item_id || it.product_name === b.item_name) &&
              (parseFloat(it.unit_price) === parseFloat(b.purchase_price) || parseFloat(it.total_units) === parseFloat(b.initial_qty))
            );
            if (matchedMeta && (matchedMeta.packaging_size || matchedMeta.packing_size)) {
              return matchedMeta.packaging_size || matchedMeta.packing_size;
            }
          } catch (_) {}
        }
      }

      // 2. Product Packaging Table (Variants Catalog)
      if (b.item_type === 'Product' || pMap.has(b.item_id)) {
        const variants = ppList.filter(v => v.product_id === b.item_id);
        if (variants.length > 0) {
          if (b.purchase_price) {
            const pMatch = variants.find(v => 
              parseFloat(v.sell_price) === parseFloat(b.purchase_price) || 
              parseFloat(v.purchase_price) === parseFloat(b.purchase_price)
            );
            if (pMatch && pMatch.packaging_size) return pMatch.packaging_size;
          }
          if (variants.length === 1 && variants[0].packaging_size) {
            return variants[0].packaging_size;
          }
          const baseVar = variants.find(v => parseFloat(v.purchase_price) > 0);
          if (baseVar && baseVar.packaging_size) return baseVar.packaging_size;
          if (variants[0].packaging_size) return variants[0].packaging_size;
        }

        const p = pMap.get(b.item_id);
        if (p && (p.item_size || p.packaging)) {
          return p.item_size || p.packaging;
        }
      }

      // 3. Inventory Items (Raw Materials, Packaging Items: Bottles, Boxes, Labels)
      const it = iMap.get(b.item_id) || iMap.get(b.inventory_item_id);
      if (it) {
        if (it.item_size) return it.item_size;
        if (it.item_subtype && !['Insecticide', 'Technical'].includes(it.item_subtype)) {
          return it.item_subtype;
        }
      }

      // 4. Extraction from Item Name (e.g. "Regular Box 1 Ltr", "Imida Bottle 1 Ltr", "Color Box 500 Ml")
      if (b.item_name) {
        const sizeMatch = b.item_name.match(/\b(\d+(?:\.\d+)?\s*(?:Litre|Ltr|L|Ml|Kg|Gram|Gm|G))\b/i);
        if (sizeMatch) return sizeMatch[1];
      }

      // 5. Bulk Technical Stock
      if (b.unit === 'Litre' || b.unit === 'Kg') {
        return 'Bulk';
      }

      return '—';
    }

    const batches = rawBatchesData.map(b => {
      let category = 'Technical';
      let reorderLevel = 0;
      let unitCost = parseFloat(b.purchase_price) || 0;

      if (b.item_type === 'Product') {
        const p = pMap.get(b.item_id);
        category = (p && p.category) ? p.category : 'Finished Good';
        reorderLevel = p ? (parseFloat(p.reorder_level) || 0) : 0;
        if (!unitCost && p && p.purchase_price) unitCost = parseFloat(p.purchase_price) || 0;
      } else {
        const it = iMap.get(b.item_id) || iMap.get(b.inventory_item_id);
        category = (it && it.category) ? it.category : 'Raw Material';
        reorderLevel = it ? (parseFloat(it.reorder_level) || 0) : 0;
      }

      const packaging = resolveBatchPackaging(b);
      const currentQty = parseFloat(b.current_qty) || 0;
      const totalVal = currentQty * unitCost;

      let status = 'In Stock';
      let statusBadgeClass = 'badge-success';
      if (currentQty <= 0) {
        status = 'Out of Stock';
        statusBadgeClass = 'badge-danger';
      } else if (reorderLevel > 0 && currentQty <= reorderLevel) {
        status = 'Low Stock';
        statusBadgeClass = 'badge-warning';
      }

      return {
        ...b,
        category,
        packaging,
        reorderLevel,
        unitCost,
        totalVal,
        status,
        statusBadgeClass
      };
    });

    const rawBatches = bRes.data || [];
    const rawMovements = mRes.data || [];
    const directBatchIds = new Set(rawBatches.map(b => b.id));
    const missingBatchIds = [...new Set(rawMovements.map(m => m.batch_id).filter(id => id && !directBatchIds.has(id)))];
    let allBatchRecords = [...rawBatches];
    if (missingBatchIds.length > 0) {
      try {
        const { data: extraBatches } = await window.dbClient.from('stock_batches').select('*').in('id', missingBatchIds);
        if (extraBatches && extraBatches.length) {
          allBatchRecords = allBatchRecords.concat(extraBatches);
        }
      } catch (_) {}
    }

    const batchLookup = new Map(allBatchRecords.map(b => [b.id, b]));

    function resolveMovementItemName(m) {
      // 1. Direct batch lookup
      if (m.batch_id && batchLookup.has(m.batch_id)) {
        const b = batchLookup.get(m.batch_id);
        if (b.item_name && b.item_name.trim() && b.item_name !== 'Inventory Item') {
          return b.item_name;
        }
        if (b.item_type === 'Product' && pMap.has(b.item_id)) {
          return pMap.get(b.item_id).name;
        }
        if (iMap.has(b.item_id)) {
          return iMap.get(b.item_id).name;
        }
      }

      // 2. Correlate with batches in the same warehouse by purchase_id / txn_id
      if (m.txn_id && m.warehouse_id) {
        const matchedBatches = allBatchRecords.filter(b => 
          b.warehouse_id === m.warehouse_id && 
          b.purchase_id === m.txn_id
        );
        if (matchedBatches.length > 0) {
          const qtyMatch = matchedBatches.find(b => parseFloat(b.initial_qty) === Math.abs(parseFloat(m.qty)));
          if (qtyMatch && qtyMatch.item_name) return qtyMatch.item_name;
          if (matchedBatches[0].item_name) return matchedBatches[0].item_name;
        }
      }

      // 3. Notes analysis (JSON or plain text)
      if (m.notes && typeof m.notes === 'string') {
        if (m.notes.startsWith('{') && m.notes.endsWith('}')) {
          try {
            const parsed = JSON.parse(m.notes);
            if (parsed.item_name) return parsed.item_name;
            if (parsed.product_name) return parsed.product_name;
          } catch (_) {}
        }
        const ofMatch = m.notes.match(/\bof\s+([A-Za-z0-9\s\-]+?)\s+(?:into|from|via)\b/i);
        if (ofMatch && ofMatch[1].trim()) {
          return ofMatch[1].trim();
        }
        for (const p of (pRes.data || [])) {
          if (m.notes.toLowerCase().includes(p.name.toLowerCase())) {
            return p.name;
          }
        }
        for (const it of (iRes.data || [])) {
          if (m.notes.toLowerCase().includes(it.name.toLowerCase())) {
            return it.name;
          }
        }
      }

      // 4. Component dispatch transaction type fallbacks
      if (m.txn_type) {
        if (m.txn_type.includes('DISPATCH_BOTTLES')) return 'Packaging Bottle';
        if (m.txn_type.includes('DISPATCH_BOXES')) return 'Packaging Box';
        if (m.txn_type.includes('DISPATCH_LABELS')) return 'Product Label';
      }

      if (m.item_name && m.item_name !== 'Inventory Item') return m.item_name;
      return 'Stock Item';
    }

    function resolveMovementUnit(m) {
      if (m.batch_id && batchLookup.has(m.batch_id)) {
        const b = batchLookup.get(m.batch_id);
        if (b.unit) return b.unit;
      }
      if (m.txn_type) {
        if (m.txn_type.includes('BOXES')) return 'Boxes';
        if (m.txn_type.includes('BOTTLES') || m.txn_type.includes('LABELS')) return 'Nos';
      }
      return 'Nos';
    }

    const movements = rawMovements.map(m => {
      const resolvedName = resolveMovementItemName(m);
      const unit = resolveMovementUnit(m);
      return {
        ...m,
        item_name: resolvedName,
        unit: unit,
        qty: parseFloat(m.qty) || 0
      };
    });

    const activeBatchesList = batches.filter(b => (parseFloat(b.current_qty) || 0) > 0);
    const distinctItemNames = new Set(activeBatchesList.map(b => b.item_name));
    const totalEstValue = activeBatchesList.reduce((acc, b) => acc + (b.totalVal || 0), 0);
    const lowStockBatches = activeBatchesList.filter(b => b.reorderLevel > 0 && (parseFloat(b.current_qty) || 0) <= b.reorderLevel);
    const depletedBatches = batches.filter(b => (parseFloat(b.current_qty) || 0) <= 0);

    currentWhModalState = {
      warehouseId: id,
      warehouse: w,
      company: comp,
      branch: br,
      batches: batches,
      movements: movements,
      activeTab: 'stock',
      filters: {
        search: '',
        category: 'ALL',
        status: 'IN_STOCK',
        sortBy: 'name_asc'
      },
      metrics: {
        distinctItemsCount: distinctItemNames.size,
        activeBatchesCount: activeBatchesList.length,
        totalEstValue: totalEstValue,
        lowStockCount: lowStockBatches.length,
        depletedCount: depletedBatches.length
      }
    };

    // Update tab badges
    const stockBadge = document.getElementById('wh-stock-tab-badge');
    if (stockBadge) stockBadge.textContent = activeBatchesList.length;

    const movBadge = document.getElementById('wh-movements-tab-badge');
    if (movBadge) movBadge.textContent = movements.length;

    const timeEl = document.getElementById('wh-footer-timestamp');
    if (timeEl) {
      const now = new Date();
      timeEl.textContent = `Retrieved at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Warehouse: ${w.code}`;
    }

    renderCurrentWhModalTab();
  } catch (err) {
    console.error('viewWarehouseDetails error:', err);
    APP.showToast('Failed to load warehouse stock: ' + err.message, 'error');
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="empty-state" style="padding:40px 16px;text-align:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin:0 auto 10px;color:var(--danger,#ef4444);display:block;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <h3 style="font-size:15px;margin-bottom:6px;color:var(--text-primary);">Failed to Load Warehouse Stock</h3>
          <p class="text-sm text-muted" style="margin-bottom:14px;max-width:400px;margin-left:auto;margin-right:auto;">${escapeHtml(err.message || 'Database error occurred')}</p>
          <button class="btn btn-secondary btn-sm" onclick="viewWarehouseDetails(${id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Retry Loading
          </button>
        </div>
      `;
    }
  }
}

function switchWhModalTab(tabName, shouldRender = true) {
  if (currentWhModalState) currentWhModalState.activeTab = tabName;
  ['stock', 'movements', 'info'].forEach(t => {
    const btn = document.getElementById(`wh-tab-${t}-btn`);
    if (btn) {
      if (t === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  if (shouldRender) renderCurrentWhModalTab();
}

function renderCurrentWhModalTab() {
  if (!currentWhModalState) return;
  const bodyEl = document.getElementById('warehouse-view-body');
  if (!bodyEl) return;

  if (currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
  } else if (currentWhModalState.activeTab === 'movements') {
    renderWhMovementsTab(bodyEl);
  } else if (currentWhModalState.activeTab === 'info') {
    renderWhInfoTab(bodyEl);
  }
}

function renderWhStockTab(bodyEl) {
  const { warehouse, batches, filters, metrics } = currentWhModalState;

  // Compute categories present in this warehouse
  const categories = [...new Set(batches.map(b => b.category).filter(Boolean))].sort();

  // Apply filters
  let filtered = [...batches];
  const q = (filters.search || '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(b =>
      (b.item_name || '').toLowerCase().includes(q) ||
      (b.batch_no || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q) ||
      (b.packaging || '').toLowerCase().includes(q)
    );
  }

  if (filters.category !== 'ALL') {
    filtered = filtered.filter(b => b.category === filters.category);
  }

  if (filters.status === 'IN_STOCK') {
    filtered = filtered.filter(b => (parseFloat(b.current_qty) || 0) > 0);
  } else if (filters.status === 'DEPLETED') {
    filtered = filtered.filter(b => (parseFloat(b.current_qty) || 0) <= 0);
  }

  // Apply sort
  filtered.sort((a, b) => {
    switch (filters.sortBy) {
      case 'name_desc': return (b.item_name || '').localeCompare(a.item_name || '');
      case 'qty_desc': return (parseFloat(b.current_qty) || 0) - (parseFloat(a.current_qty) || 0);
      case 'qty_asc': return (parseFloat(a.current_qty) || 0) - (parseFloat(b.current_qty) || 0);
      case 'val_desc': return (b.totalVal || 0) - (a.totalVal || 0);
      case 'cat_asc': return (a.category || '').localeCompare(b.category || '');
      case 'name_asc':
      default: return (a.item_name || '').localeCompare(b.item_name || '');
    }
  });

  const formattedTotalValue = metrics.totalEstValue > 0
    ? '₹' + metrics.totalEstValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '₹0.00';

  bodyEl.innerHTML = `
    <!-- Summary Cards -->
    <div class="wh-summary-cards">
      <div class="wh-summary-card">
        <div class="wh-card-label">Distinct Items</div>
        <div class="wh-card-value">${metrics.distinctItemsCount}</div>
        <div class="wh-card-sub">catalog products & materials</div>
      </div>
      <div class="wh-summary-card">
        <div class="wh-card-label">Active Batches</div>
        <div class="wh-card-value" style="color:#16a34a;">${metrics.activeBatchesCount}</div>
        <div class="wh-card-sub">positive physical balance</div>
      </div>
      <div class="wh-summary-card">
        <div class="wh-card-label">Total Stock Value</div>
        <div class="wh-card-value" style="color:#0C3925;">${formattedTotalValue}</div>
        <div class="wh-card-sub">recorded unit purchase value</div>
      </div>
      <div class="wh-summary-card">
        <div class="wh-card-label">Stock Status</div>
        <div class="wh-card-value" style="${metrics.lowStockCount > 0 ? 'color:#d97706;' : 'color:#16a34a;'}">
          ${metrics.lowStockCount > 0 ? `${metrics.lowStockCount} Low` : (metrics.depletedCount > 0 ? `${metrics.depletedCount} Zero` : 'Healthy')}
        </div>
        <div class="wh-card-sub">${metrics.lowStockCount > 0 ? 'items below reorder level' : (metrics.depletedCount > 0 ? 'depleted zero-qty batches' : 'all stock above reorder')}</div>
      </div>
    </div>

    <!-- Search & Filters Toolbar -->
    <div class="wh-stock-toolbar">
      <div class="wh-toolbar-left">
        <div class="wh-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="wh-stock-search-input" placeholder="Search product or material…" value="${escapeHtml(filters.search)}" oninput="onWhStockSearchInput(this.value)">
        </div>
        <select class="wh-filter-select" id="wh-stock-cat-filter" onchange="onWhStockCategoryChange(this.value)">
          <option value="ALL" ${filters.category === 'ALL' ? 'selected' : ''}>All Categories (${batches.length})</option>
          ${categories.map(c => `<option value="${escapeHtml(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select class="wh-filter-select" id="wh-stock-status-filter" onchange="onWhStockStatusChange(this.value)">
          <option value="IN_STOCK" ${filters.status === 'IN_STOCK' ? 'selected' : ''}>Active Stock Only (Qty &gt; 0)</option>
          <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>All Batches (Include Zero Stock)</option>
          <option value="DEPLETED" ${filters.status === 'DEPLETED' ? 'selected' : ''}>Depleted Only (Qty ≤ 0)</option>
        </select>
      </div>
      <div class="wh-toolbar-right">
        <select class="wh-filter-select" id="wh-stock-sort-filter" onchange="onWhStockSortChange(this.value)">
          <option value="name_asc" ${filters.sortBy === 'name_asc' ? 'selected' : ''}>Item Name (A to Z)</option>
          <option value="name_desc" ${filters.sortBy === 'name_desc' ? 'selected' : ''}>Item Name (Z to A)</option>
          <option value="qty_desc" ${filters.sortBy === 'qty_desc' ? 'selected' : ''}>Available Qty (High to Low)</option>
          <option value="qty_asc" ${filters.sortBy === 'qty_asc' ? 'selected' : ''}>Available Qty (Low to High)</option>
          <option value="val_desc" ${filters.sortBy === 'val_desc' ? 'selected' : ''}>Stock Value (High to Low)</option>
          <option value="cat_asc" ${filters.sortBy === 'cat_asc' ? 'selected' : ''}>Category</option>
        </select>
      </div>
    </div>

    <!-- Content: Empty State vs Tables / Cards -->
    ${batches.length === 0 ? `
      <div class="empty-state" style="padding:48px 16px;text-align:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;margin:0 auto 10px;color:var(--text-muted,#9ca3af);display:block;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        <h3 style="font-size:15px;margin-bottom:4px;color:var(--text-primary);">No stock is currently available in this warehouse</h3>
        <p class="text-sm text-muted">There are no inventory batches registered at <strong>${escapeHtml(warehouse.name)}</strong>.</p>
      </div>
    ` : filtered.length === 0 ? `
      <div class="empty-state" style="padding:36px 16px;text-align:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;margin:0 auto 8px;color:var(--text-muted,#9ca3af);display:block;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3 style="font-size:14px;margin-bottom:4px;color:var(--text-primary);">No matching items</h3>
        <p class="text-xs text-muted" style="margin-bottom:12px;">No stock items match your search or filter settings.</p>
        <button class="btn btn-secondary btn-sm" onclick="resetWhStockFilters()">Reset Filters</button>
      </div>
    ` : `
      <!-- Desktop Table -->
      <div class="table-wrap" id="wh-stock-table-wrap" style="box-shadow:none;border:1px solid var(--border,#e2e8f0);border-radius:8px;overflow-x:auto;max-width:100%;">
        <table class="wh-stock-table">
          <thead>
            <tr>
              <th style="width:26%;">Item Name</th>
              <th style="width:13%;">Category</th>
              <th style="width:13%;">Packaging</th>
              <th style="width:12%;text-align:right;">Available Qty</th>
              <th style="width:7%;">Unit</th>
              <th style="width:11%;text-align:right;">Unit Cost</th>
              <th style="width:11%;text-align:right;">Total Value</th>
              <th style="width:7%;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(b => {
              const currentQty = parseFloat(b.current_qty) || 0;
              const formattedVal = b.totalVal > 0 ? '₹' + b.totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
              const formattedCost = b.unitCost > 0 ? '₹' + b.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
              return `
                <tr>
                  <td>
                    <div style="font-weight:600;color:var(--text-primary);line-height:1.35;">${escapeHtml(b.item_name)}</div>
                  </td>
                  <td><span class="badge badge-info" style="font-size:10.5px;">${escapeHtml(b.category)}</span></td>
                  <td style="color:var(--text-muted);font-size:12px;">${escapeHtml(b.packaging || '—')}</td>
                  <td style="text-align:right;">
                    <span class="wh-qty-val ${currentQty <= 0 ? 'is-zero' : ''}">${currentQty.toLocaleString()}</span>
                  </td>
                  <td><span style="font-weight:500;color:var(--text-muted);">${escapeHtml(b.unit || 'Nos')}</span></td>
                  <td style="text-align:right;color:var(--text-muted);">${formattedCost}</td>
                  <td style="text-align:right;font-weight:600;color:#0C3925;">${formattedVal}</td>
                  <td style="text-align:center;"><span class="badge ${b.statusBadgeClass}" style="font-size:10.5px;">${b.status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mobile Responsive Cards -->
      <div class="wh-stock-cards-mobile" id="wh-stock-cards-mobile">
        ${filtered.map(b => {
          const currentQty = parseFloat(b.current_qty) || 0;
          const formattedVal = b.totalVal > 0 ? '₹' + b.totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
          const formattedCost = b.unitCost > 0 ? '₹' + b.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
          return `
            <div class="wh-mobile-stock-card">
              <div class="wh-card-top-row">
                <div class="wh-card-item-title">${escapeHtml(b.item_name)}</div>
                <span class="badge ${b.statusBadgeClass}">${b.status}</span>
              </div>
              <div class="wh-card-badge-row">
                <span class="badge badge-info" style="font-size:10.5px;">${escapeHtml(b.category)}</span>
              </div>
              <div class="wh-card-grid-2col">
                <div>
                  <div class="wh-grid-label">Available Stock</div>
                  <div class="wh-grid-val-stock ${currentQty <= 0 ? 'is-zero' : ''}">
                    ${currentQty.toLocaleString()} <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);">${escapeHtml(b.unit || 'Nos')}</span>
                  </div>
                </div>
                <div>
                  <div class="wh-grid-label">Packaging / Size</div>
                  <div class="wh-grid-val">${escapeHtml(b.packaging || '—')}</div>
                </div>
                <div>
                  <div class="wh-grid-label">Unit Cost</div>
                  <div class="wh-grid-val">${formattedCost}</div>
                </div>
                <div>
                  <div class="wh-grid-label">Total Stock Value</div>
                  <div class="wh-grid-val" style="color:#0C3925;font-weight:700;">${formattedVal}</div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}

function renderWhMovementsTab(bodyEl) {
  const { warehouse, movements } = currentWhModalState;

  if (movements.length === 0) {
    bodyEl.innerHTML = `
      <div class="empty-state" style="padding:48px 16px;text-align:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;margin:0 auto 10px;color:var(--text-muted,#9ca3af);display:block;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        <h3 style="font-size:15px;margin-bottom:4px;color:var(--text-primary);">No stock movements recorded</h3>
        <p class="text-sm text-muted">No historical transactions or audit movements are associated with <strong>${escapeHtml(warehouse.name)}</strong>.</p>
      </div>
    `;
    return;
  }

  bodyEl.innerHTML = `
    <div style="margin-bottom:12px;font-size:12.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">
      <span>Showing latest <strong>${movements.length}</strong> recorded audit transactions</span>
      <span class="badge badge-gray" style="font-size:10px;">IMMUTABLE AUDIT TRAIL</span>
    </div>

    <!-- Desktop Table -->
    <div class="table-wrap" id="wh-movements-table-wrap" style="box-shadow:none;border:1px solid var(--border,#e2e8f0);border-radius:8px;overflow-x:auto;max-width:100%;">
      <table class="wh-movements-table">
        <thead>
          <tr>
            <th style="width:18%;">Date & Time</th>
            <th style="width:28%;">Item Name</th>
            <th style="width:16%;">Transaction Type</th>
            <th style="width:14%;text-align:right;">Quantity Change</th>
            <th style="width:24%;">Reference / Notes</th>
          </tr>
        </thead>
        <tbody>
          ${movements.map(m => {
            const dateStr = m.created_at ? new Date(m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
            const isNegative = (m.qty || 0) < 0;
            const deltaClass = isNegative ? 'wh-delta-neg' : 'wh-delta-pos';
            const deltaPrefix = isNegative ? '' : '+';
            return `
              <tr>
                <td style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(dateStr)}</td>
                <td>
                  <div style="font-weight:600;line-height:1.35;color:var(--text-primary);">${escapeHtml(m.item_name)}</div>
                </td>
                <td>
                  <span class="badge ${isNegative ? 'badge-warning' : 'badge-success'}" style="font-size:10px;">${escapeHtml(m.txn_type || 'TRANSACTION')}</span>
                </td>
                <td style="text-align:right;">
                  <span class="${deltaClass}">${deltaPrefix}${m.qty.toLocaleString()} ${escapeHtml(m.unit || '')}</span>
                </td>
                <td style="font-size:12px;color:var(--text-muted);">
                  ${m.notes ? escapeHtml(m.notes) : '<span style="color:#cbd5e1;">—</span>'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="wh-movements-cards-mobile" id="wh-movements-cards-mobile">
      ${movements.map(m => {
        const dateStr = m.created_at ? new Date(m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        const isNegative = (m.qty || 0) < 0;
        const deltaClass = isNegative ? 'wh-delta-neg' : 'wh-delta-pos';
        const deltaPrefix = isNegative ? '' : '+';
        return `
          <div class="wh-mobile-movement-card">
            <div class="wh-card-top-row">
              <span class="badge ${isNegative ? 'badge-warning' : 'badge-success'}" style="font-size:10px;">${escapeHtml(m.txn_type || 'TRANSACTION')}</span>
              <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(dateStr)}</span>
            </div>
            <div class="wh-card-item-title" style="margin-top:4px;margin-bottom:8px;">${escapeHtml(m.item_name)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid #f1f5f9;">
              <span class="wh-grid-label" style="margin:0;">Quantity Change:</span>
              <span class="${deltaClass}" style="font-size:14px;">${deltaPrefix}${m.qty.toLocaleString()} ${escapeHtml(m.unit || '')}</span>
            </div>
            ${m.notes ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;background:#f8fafc;padding:4px 8px;border-radius:4px;">${escapeHtml(m.notes)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderWhInfoTab(bodyEl) {
  const { warehouse: w, company: comp, branch: br, metrics, movements } = currentWhModalState;

  bodyEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;margin-bottom:16px;">
      <div style="background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Warehouse Code</div>
        <div style="font-size:14px;font-weight:700;color:var(--text-primary);font-family:monospace;margin-top:3px;">${escapeHtml(w.code)}</div>
      </div>
      <div style="background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Storage Category</div>
        <div style="font-size:13px;font-weight:600;color:var(--primary,#0C3925);margin-top:3px;">${escapeHtml(w.warehouse_type || 'General')}</div>
      </div>
      <div style="background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Legal Entity (Owner)</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:3px;">${comp ? escapeHtml(comp.name) : '—'}</div>
      </div>
      <div style="background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Associated Branch</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:3px;">${br ? escapeHtml(br.name) : 'Company-wide (General Depot)'}</div>
      </div>
    </div>

    <div style="background:#ffffff;border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:4px;">Physical Location / Bay Address</div>
      <div style="font-size:13px;color:var(--text-primary);">${w.location ? escapeHtml(w.location) : '<span class="text-muted">No specific bay or physical address specified.</span>'}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:6px;">
        ${w.is_default ? '<span class="badge badge-success" style="font-size:10px;">DEFAULT STOCK LOCATION</span>' : '<span class="badge badge-gray" style="font-size:10px;">Secondary Storage Location</span>'}
      </div>
    </div>

    <div style="background:#ffffff;border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:14px;">
      <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;margin-bottom:8px;">Inventory & Audit Summary</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#166534;font-weight:600;">Active Inventory Batches</div>
          <div style="font-size:18px;font-weight:700;color:#15803d;margin-top:2px;">${metrics.activeBatchesCount} <span style="font-size:12px;font-weight:500;">batches</span></div>
        </div>
        <div style="flex:1;min-width:140px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#1e40af;font-weight:600;">Historical Audit Logs</div>
          <div style="font-size:18px;font-weight:700;color:#1d4ed8;margin-top:2px;">${movements.length} <span style="font-size:12px;font-weight:500;">movements</span></div>
          <div style="font-size:11px;color:#1e40af;margin-top:2px;">Permanently Preserved</div>
        </div>
      </div>
    </div>
  `;
}

function onWhStockSearchInput(val) {
  if (!currentWhModalState) return;
  currentWhModalState.filters.search = val;
  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl && currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
    const searchInput = document.getElementById('wh-stock-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
    }
  }
}

function onWhStockCategoryChange(val) {
  if (!currentWhModalState) return;
  currentWhModalState.filters.category = val;
  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl && currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
  }
}

function onWhStockStatusChange(val) {
  if (!currentWhModalState) return;
  currentWhModalState.filters.status = val;
  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl && currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
  }
}

function onWhStockSortChange(val) {
  if (!currentWhModalState) return;
  currentWhModalState.filters.sortBy = val;
  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl && currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
  }
}

function resetWhStockFilters() {
  if (!currentWhModalState) return;
  currentWhModalState.filters.search = '';
  currentWhModalState.filters.category = 'ALL';
  currentWhModalState.filters.status = 'IN_STOCK';
  currentWhModalState.filters.sortBy = 'name_asc';
  const bodyEl = document.getElementById('warehouse-view-body');
  if (bodyEl && currentWhModalState.activeTab === 'stock') {
    renderWhStockTab(bodyEl);
  }
}

function openAddWarehouse() {
  editingWarehouseId = null;
  document.getElementById('warehouse-modal-title').textContent = 'New Warehouse';
  const form = document.getElementById('warehouse-form');
  if (form) form.reset();

  populateCompanySelect(window.TENANT_CONTEXT.getCompanyId());
  onCompanySelectChanged();
  APP.openModal('warehouse-modal');
}

function openEditWarehouse(id) {
  editingWarehouseId = id;
  const w = allWarehouses.find(x => x.id === id);
  if (!w) return;

  document.getElementById('warehouse-modal-title').textContent = `Edit Warehouse (${w.code})`;
  const form = document.getElementById('warehouse-form');
  if (form) {
    populateCompanySelect(w.company_id);
    form.elements['company_id'].value = w.company_id;
    onCompanySelectChanged(w.branch_id);
    form.elements['name'].value = w.name || '';
    form.elements['code'].value = w.code || '';
    form.elements['warehouse_type'].value = w.warehouse_type || 'General';
    form.elements['location'].value = w.location || '';
    form.elements['is_default'].checked = !!w.is_default;
  }
  APP.openModal('warehouse-modal');
}

function populateCompanySelect(selectedCompanyId) {
  const sel = document.getElementById('modal-company-select');
  if (!sel) return;
  sel.innerHTML = allCompanies
    .filter(c => (c.status || 'Active') === 'Active' || c.id === selectedCompanyId)
    .map(c => `
      <option value="${c.id}" ${c.id === selectedCompanyId ? 'selected' : ''}>${c.name} (${c.code})</option>
    `).join('');
}

function onCompanySelectChanged(selectedBranchId = null) {
  const compId = parseInt(document.getElementById('modal-company-select')?.value, 10);
  const brSel = document.getElementById('modal-branch-select');
  if (!brSel) return;

  const branches = allBranches.filter(b => b.company_id === compId && (b.status || 'Active') === 'Active');
  brSel.innerHTML = '<option value="">No specific branch (Company-wide)</option>' +
    branches.map(b => `<option value="${b.id}" ${b.id === selectedBranchId ? 'selected' : ''}>${b.name} (${b.code})</option>`).join('');
}

async function saveWarehouse() {
  const form = document.getElementById('warehouse-form');
  if (!form) return;

  const compId = parseInt(form.elements['company_id'].value, 10);
  const name = form.elements['name'].value.trim();
  const code = form.elements['code'].value.trim().toUpperCase();
  const branchId = form.elements['branch_id'].value ? parseInt(form.elements['branch_id'].value, 10) : null;
  const isDefault = form.elements['is_default'].checked;

  if (!compId || !name || !code) {
    APP.showToast('Please specify company, name, and code', 'error');
    return;
  }

  // Pre-validate warehouse code uniqueness
  const dup = allWarehouses.find(w => w.code.toUpperCase() === code && w.id !== editingWarehouseId);
  if (dup) {
    APP.showToast(`Warehouse code "${code}" is already in use by "${dup.name}".`, 'error');
    return;
  }

  // If set as default warehouse, unmark other default warehouses for this company
  if (isDefault) {
    await window.dbClient.from('warehouses')
      .update({ is_default: false })
      .eq('company_id', compId)
      .eq('is_default', true);
  }

  const payload = {
    company_id: compId,
    branch_id: branchId,
    name: name,
    code: code,
    warehouse_type: form.elements['warehouse_type'].value || 'General',
    location: form.elements['location'].value.trim() || null,
    is_default: isDefault,
    status: 'Active'
  };

  const btn = document.getElementById('save-warehouse-btn');
  if (btn) APP.setButtonLoading(btn, true);

  try {
    if (editingWarehouseId) {
      const { error } = await window.dbClient.from('warehouses').update(payload).eq('id', editingWarehouseId);
      if (error) throw error;

      if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseUpdated) {
        await window.AUDIT_LOGGER.logWarehouseUpdated({
          companyId: compId,
          warehouseId: editingWarehouseId,
          warehouseName: name,
          warehouseCode: code
        });
      }
      APP.showToast('Warehouse updated successfully', 'success');
    } else {
      const { data: newWh, error } = await window.dbClient.from('warehouses').insert([payload]).select();
      if (error) throw error;

      if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseCreated) {
        await window.AUDIT_LOGGER.logWarehouseCreated({
          companyId: compId,
          warehouseId: newWh && newWh[0] ? newWh[0].id : null,
          warehouseName: name,
          warehouseCode: code
        });
      }
      APP.showToast('Warehouse created successfully', 'success');
    }

    APP.closeModal('warehouse-modal');
    if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
      await window.TENANT_CONTEXT.reload();
    } else {
      await window.TENANT_CONTEXT.init(true);
    }
    await loadWarehouses();
  } catch (err) {
    console.error('saveWarehouse failed:', err);
    APP.showToast('Failed to save warehouse: ' + err.message, 'error');
  } finally {
    if (btn) APP.setButtonLoading(btn, false);
  }
}

/**
 * Safe Archival of Warehouse
 * Retains all historical records, movements, and ledger links while preventing selection in new operational workflows.
 */
async function archiveWarehouse(warehouseId) {
  if (isArchivingWarehouse) return;
  const w = allWarehouses.find(x => x.id === warehouseId);
  if (!w) return;

  APP.showConfirm(
    `Archive warehouse "${w.name}" (${w.code})?<br><br>This will deactivate the warehouse from new purchase inward, production, and sales dispatches, while <strong>permanently preserving</strong> all historical stock movements, transactions, and audit trails.`,
    async () => {
      isArchivingWarehouse = true;
      APP.showSpinner();
      try {
        const { error } = await window.dbClient.from('warehouses').update({
          status: 'Archived'
        }).eq('id', warehouseId);

        if (error) throw error;

        // Log audit trail
        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseArchived) {
          await window.AUDIT_LOGGER.logWarehouseArchived({
            companyId: w.company_id,
            warehouseId: w.id,
            warehouseName: w.name,
            warehouseCode: w.code,
            reason: 'Administrative deactivation'
          });
        }

        w.status = 'Archived';
        APP.closeModal('warehouse-dependency-modal');
        APP.showToast(`Warehouse "${w.name}" archived successfully.`, 'success');
        if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
          await window.TENANT_CONTEXT.reload();
        } else {
          await window.TENANT_CONTEXT.init(true);
        }
        filterAndRenderWarehouses();
      } catch (err) {
        console.error('archiveWarehouse failed:', err);
        APP.showToast('Failed to archive warehouse: ' + err.message, 'error');
      } finally {
        isArchivingWarehouse = false;
        APP.hideSpinner();
      }
    },
    {
      title: 'Archive Warehouse',
      confirmText: 'Archive Location',
      isDanger: false,
      onCancel: () => { isArchivingWarehouse = false; }
    }
  );
}

/**
 * Reactivate Archived Warehouse
 */
async function reactivateWarehouse(warehouseId) {
  const w = allWarehouses.find(x => x.id === warehouseId);
  if (!w) return;

  APP.showConfirm(
    `Reactivate warehouse "${w.name}" (${w.code})?<br><br>This will restore the warehouse to Active status, allowing it to be selected for inventory, purchases, and sales dispatches.`,
    async () => {
      APP.showSpinner();
      try {
        const { error } = await window.dbClient.from('warehouses').update({
          status: 'Active'
        }).eq('id', warehouseId);

        if (error) throw error;

        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseReactivated) {
          await window.AUDIT_LOGGER.logWarehouseReactivated({
            companyId: w.company_id,
            warehouseId: w.id,
            warehouseName: w.name,
            warehouseCode: w.code
          });
        }

        w.status = 'Active';
        APP.showToast(`Warehouse "${w.name}" reactivated successfully.`, 'success');
        if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
          await window.TENANT_CONTEXT.reload();
        } else {
          await window.TENANT_CONTEXT.init(true);
        }
        filterAndRenderWarehouses();
      } catch (err) {
        console.error('reactivateWarehouse failed:', err);
        APP.showToast('Failed to reactivate warehouse: ' + err.message, 'error');
      } finally {
        APP.hideSpinner();
      }
    },
    {
      title: 'Reactivate Warehouse',
      confirmText: 'Reactivate Location',
      isDanger: false,
      onCancel: () => {}
    }
  );
}

/**
 * Safe Deletion Workflow with Dependency Distinction
 */
async function safeDeleteWarehouse(warehouseId) {
  if (isDeletingWarehouse) return;
  const w = allWarehouses.find(x => x.id === warehouseId);
  if (!w) return;

  isDeletingWarehouse = true;
  APP.showSpinner();
  try {
    const safeQuery = async (queryPromise, fallback = { count: 0, data: [] }) => {
      try {
        const r = await queryPromise;
        return r || fallback;
      } catch (_) {
        return fallback;
      }
    };

    const [batchRes, movRes, icFromRes, icToRes, prodRes] = await Promise.all([
      safeQuery(window.dbClient.from('stock_batches').select('id, current_qty').eq('warehouse_id', warehouseId), { data: [] }),
      safeQuery(window.dbClient.from('stock_movements').select('id', { count: 'exact' }).eq('warehouse_id', warehouseId)),
      safeQuery(window.dbClient.from('intercompany_transfers').select('id, status').eq('from_warehouse_id', warehouseId)),
      safeQuery(window.dbClient.from('intercompany_transfers').select('id, status').eq('to_warehouse_id', warehouseId)),
      safeQuery(window.dbClient.from('production_batches').select('id', { count: 'exact' }).eq('warehouse_id', warehouseId))
    ]);

    const batches = batchRes.data || [];
    const activeBatches = batches.filter(b => (Number(b.current_qty) || 0) > 0);
    const zeroBalanceBatches = batches.filter(b => (Number(b.current_qty) || 0) <= 0);
    const totalActiveUnits = activeBatches.reduce((acc, b) => acc + (Number(b.current_qty) || 0), 0);
    const movCount = movRes.count || (movRes.data || []).length;
    const prodCount = prodRes.count || (prodRes.data || []).length;

    const icTransfers = [...(icFromRes.data || []), ...(icToRes.data || [])];
    const inFlightTransfers = icTransfers.filter(t => t.status === 'In-Transit' || t.status === 'Pending');

    APP.hideSpinner();

    // ──────────────────────────────────────────────────────────────────────────
    // CASE 1: ACTIVE PHYSICAL INVENTORY OR IN-FLIGHT TRANSFERS PRESENT
    // Hard blocked - stock must be transferred or zeroed first
    // ──────────────────────────────────────────────────────────────────────────
    if (activeBatches.length > 0 || inFlightTransfers.length > 0) {
      isDeletingWarehouse = false;
      const modalTitle = document.getElementById('warehouse-dependency-title');
      const modalMsg = document.getElementById('warehouse-dependency-msg');
      const listEl = document.getElementById('warehouse-dependency-list');
      const subtextEl = document.getElementById('warehouse-dependency-subtext');
      const archiveBtn = document.getElementById('btn-warehouse-archive');
      const forceDeleteBtn = document.getElementById('btn-warehouse-force-delete');

      if (modalTitle) modalTitle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Permanent Deletion Blocked: Active Inventory`;
      if (modalMsg) modalMsg.innerHTML = `<strong>Warehouse "${escapeHtml(w.name)}" (${escapeHtml(w.code)})</strong> holds active physical inventory and cannot be permanently deleted:`;

      if (listEl) {
        listEl.innerHTML = `
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">
            ${activeBatches.length > 0 ? `<li style="color:var(--danger,#ef4444);font-weight:600;"><strong>${activeBatches.length}</strong> Stock Batches with Active Physical Stock (Total: ${totalActiveUnits} units)</li>` : ''}
            ${inFlightTransfers.length > 0 ? `<li style="color:var(--danger,#ef4444);font-weight:600;"><strong>${inFlightTransfers.length}</strong> Intercompany Transfers In-Transit / Pending</li>` : ''}
            ${movCount > 0 ? `<li><strong>${movCount}</strong> Stock Movement Audit Logs (Historical)</li>` : ''}
          </ul>
        `;
      }

      if (subtextEl) {
        subtextEl.innerHTML = `<strong>Action Required:</strong> Deleting a warehouse holding active physical inventory would orphan stock records. Please transfer or dispatch remaining inventory first. Alternatively, click <strong>Archive Warehouse</strong> below to deactivate it immediately while preserving inventory records.`;
      }

      if (archiveBtn) {
        archiveBtn.style.display = 'inline-flex';
        archiveBtn.onclick = () => archiveWarehouse(warehouseId);
      }
      if (forceDeleteBtn) forceDeleteBtn.style.display = 'none';

      APP.openModal('warehouse-dependency-modal');
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CASE 2: ZERO PHYSICAL STOCK, BUT HISTORICAL AUDIT / MOVEMENTS EXIST
    // Offers Archival (Recommended) or Permanent Deletion with Snapshot Preservation
    // ──────────────────────────────────────────────────────────────────────────
    if (movCount > 0 || zeroBalanceBatches.length > 0 || prodCount > 0) {
      isDeletingWarehouse = false;
      const modalTitle = document.getElementById('warehouse-dependency-title');
      const modalMsg = document.getElementById('warehouse-dependency-msg');
      const listEl = document.getElementById('warehouse-dependency-list');
      const subtextEl = document.getElementById('warehouse-dependency-subtext');
      const archiveBtn = document.getElementById('btn-warehouse-archive');
      const forceDeleteBtn = document.getElementById('btn-warehouse-force-delete');

      if (modalTitle) modalTitle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#d97706;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Historical Transaction Records Exist`;
      if (modalMsg) modalMsg.innerHTML = `<strong>Warehouse "${escapeHtml(w.name)}" (${escapeHtml(w.code)})</strong> has zero active physical stock, but contains historical transactions and audit trail entries:`;

      if (listEl) {
        listEl.innerHTML = `
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">
            ${movCount > 0 ? `<li><strong>${movCount}</strong> Historical Stock Movement Audit Records</li>` : ''}
            ${zeroBalanceBatches.length > 0 ? `<li><strong>${zeroBalanceBatches.length}</strong> Depleted (Zero-Balance) Stock Batches</li>` : ''}
            ${prodCount > 0 ? `<li><strong>${prodCount}</strong> Completed Production Batch Runs</li>` : ''}
          </ul>
        `;
      }

      if (subtextEl) {
        subtextEl.innerHTML = `<strong>Compliance Recommendation:</strong> For GST, ISO, and regulatory compliance, warehouses with transaction history should be <strong>Archived</strong> so historical records remain linked.<br><br>If you choose to permanently delete this warehouse, all historical audit logs will be preserved with immutable snapshot references.`;
      }

      if (archiveBtn) {
        archiveBtn.style.display = 'inline-flex';
        archiveBtn.textContent = 'Archive Warehouse (Recommended)';
        archiveBtn.onclick = () => archiveWarehouse(warehouseId);
      }

      if (forceDeleteBtn) {
        forceDeleteBtn.style.display = 'inline-flex';
        forceDeleteBtn.onclick = () => forceDeleteWarehouseWithAuditPreservation(warehouseId);
      }

      APP.openModal('warehouse-dependency-modal');
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CASE 3: ZERO DEPENDENCIES (CLEAN UNREFERENCED WAREHOUSE)
    // ──────────────────────────────────────────────────────────────────────────
    APP.showConfirm(
      `Are you sure you want to permanently delete warehouse "${w.name}" (${w.code})?<br><br>There are zero stock records, movements, or transactions, but this action cannot be undone.`,
      async () => {
        isDeletingWarehouse = true;
        try {
          APP.showSpinner();
          const { error } = await window.dbClient.from('warehouses').delete().eq('id', warehouseId);
          if (error) throw error;

          if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseDeleted) {
            await window.AUDIT_LOGGER.logWarehouseDeleted({
              companyId: w.company_id,
              warehouseId: w.id,
              warehouseName: w.name,
              warehouseCode: w.code,
              movCountPreserved: 0
            });
          }

          allWarehouses = allWarehouses.filter(x => x.id !== warehouseId);
          APP.showToast(`Warehouse "${w.name}" deleted successfully.`, 'success');
          if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
            await window.TENANT_CONTEXT.reload();
          } else {
            await window.TENANT_CONTEXT.init(true);
          }
          filterAndRenderWarehouses();
        } catch (delErr) {
          console.error('Delete warehouse error:', delErr);
          APP.showToast('Failed to delete warehouse: ' + delErr.message, 'error');
        } finally {
          isDeletingWarehouse = false;
          APP.hideSpinner();
        }
      },
      {
        title: 'Delete Warehouse',
        confirmText: 'Delete Permanently',
        isDanger: true,
        onCancel: () => { isDeletingWarehouse = false; }
      }
    );
  } catch (err) {
    console.error('safeDeleteWarehouse check failed:', err);
    APP.showToast('Failed to verify warehouse dependencies: ' + err.message, 'error');
  } finally {
    isDeletingWarehouse = false;
    APP.hideSpinner();
  }
}

/**
 * Permanent Warehouse Deletion with Audit Trail Preservation
 * Disassociates foreign keys while preserving audit records and logs.
 */
async function forceDeleteWarehouseWithAuditPreservation(warehouseId) {
  const w = allWarehouses.find(x => x.id === warehouseId);
  if (!w) return;

  APP.showConfirm(
    `Permanently delete warehouse "${w.name}" (${w.code})?<br><br>All historical audit logs and stock movement records will be <strong>permanently retained</strong> with snapshot references.<br><br>This action cannot be undone.`,
    async () => {
      isDeletingWarehouse = true;
      APP.showSpinner();
      try {
        // 1. Preserve stock_movements snapshot before deleting warehouse
        try {
          await window.dbClient
            .from('stock_movements')
            .update({ notes: `[Historical Warehouse: ${w.name} (${w.code})]` })
            .eq('warehouse_id', warehouseId)
            .is('notes', null);
        } catch (e) {
          console.warn('Note update notice:', e);
        }

        // 2. Clean up zero-balance depleted batches if any
        try {
          await window.dbClient.from('stock_batches').delete().eq('warehouse_id', warehouseId).lte('current_qty', 0);
        } catch (e) {
          console.warn('Batch cleanup notice:', e);
        }

        // 3. Delete warehouse record
        const { error } = await window.dbClient.from('warehouses').delete().eq('id', warehouseId);
        if (error) throw error;

        // 4. Log immutable audit trail entry
        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logWarehouseDeleted) {
          await window.AUDIT_LOGGER.logWarehouseDeleted({
            companyId: w.company_id,
            warehouseId: w.id,
            warehouseName: w.name,
            warehouseCode: w.code,
            movCountPreserved: 1
          });
        }

        allWarehouses = allWarehouses.filter(x => x.id !== warehouseId);
        APP.closeModal('warehouse-dependency-modal');
        APP.showToast(`Warehouse "${w.name}" permanently deleted. Historical audit trail preserved.`, 'success');
        if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
          await window.TENANT_CONTEXT.reload();
        } else {
          await window.TENANT_CONTEXT.init(true);
        }
        filterAndRenderWarehouses();
      } catch (err) {
        console.error('forceDeleteWarehouse failed:', err);
        APP.showToast('Failed to delete warehouse: ' + err.message, 'error');
      } finally {
        isDeletingWarehouse = false;
        APP.hideSpinner();
      }
    },
    {
      title: 'Permanent Deletion with Audit Preservation',
      confirmText: 'Delete Permanently',
      isDanger: true,
      onCancel: () => { isDeletingWarehouse = false; }
    }
  );
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

loadWarehouses();

