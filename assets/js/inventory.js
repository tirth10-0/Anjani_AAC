/* inventory.js */
let allInventory = [], editingItemId = null, activeTab = 'Technical';

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadInventory() {
  console.log('Loading inventory...');
  updatePageDebug('Loading Inventory...', '#0C3925');
  try {
    UTILS.renderTableSkeleton('inventory-table');
    await DB.initDB();
    
    // Parallelize all data queries for instant page load
    const itemsQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('inventory_items').select('*')) : window.dbClient.from('inventory_items').select('*');
    const batchesQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('stock_batches').select('item_id, current_qty, purchase_price').eq('item_type', 'Inventory')) : window.dbClient.from('stock_batches').select('item_id, current_qty, purchase_price').eq('item_type', 'Inventory');

    const [, , itemsRes, batchesRes] = await Promise.all([
      loadMasterOptions(),
      loadCatalogProductSuggestions(),
      itemsQuery,
      batchesQuery
    ]);

    if (itemsRes.error) throw itemsRes.error;
    const items = itemsRes.data || [];
    const batches = batchesRes.data || [];
    
    // Compute dynamic avg cost based on available batches (opening stock + purchases)
    const costMap = {};
    if (batches) {
      batches.forEach(b => {
        if (!costMap[b.item_id]) costMap[b.item_id] = { totalCost: 0, totalQty: 0 };
        const qty = parseFloat(b.current_qty) || 0;
        const price = parseFloat(b.purchase_price) || 0;
        if (qty > 0) {
          costMap[b.item_id].totalCost += (qty * price);
          costMap[b.item_id].totalQty += qty;
        }
      });
    }
    
    allInventory = items.map(ii => {
      const stock = costMap[ii.id] ? costMap[ii.id].totalQty : (parseFloat(ii.stock) || 0);
      let cost = 0;
      if (costMap[ii.id] && costMap[ii.id].totalQty > 0) {
         cost = costMap[ii.id].totalCost / costMap[ii.id].totalQty;
      }
      
      const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(ii.name) : ii.name;
      const cSubtype = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(ii.item_subtype) : ii.item_subtype;
      const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(ii.unit || 'Nos') : (ii.unit || 'Nos');

      return {
        id: ii.id,
        name: cName,
        rawName: ii.name,
        category: ii.category,
        product_id: ii.product_id,
        unit: cUnit,
        item_type: 'Inventory',
        description: ii.description,
        item_subtype: cSubtype,
        item_size: ii.item_size,
        total_stock: stock,
        avg_cost: cost,
        total_value: stock * cost,
        reorder_level: parseFloat(ii.reorder_level) || 0
      };
    });
    window.allInventory = allInventory;

    allInventory = UTILS.sortLatestFirst(allInventory);
    if (typeof window !== 'undefined') window.allInventory = allInventory;
    renderTable(allInventory);
    updatePageDebug('Ready (' + allInventory.length + ')', '#0C3925');
  } catch (err) {
    console.error('loadInventory failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load inventory: ' + err.message, 'error');
    renderTable([]);
  }
}

let catalogProductsCache = [];

function setupCustomSuggestions(inputId, suggestionsId, getItemsFn, onSelectFn) {
  const input = document.getElementById(inputId);
  let suggBox = document.getElementById(suggestionsId);
  if (!input) return;

  if (suggBox && suggBox.parentNode !== document.body) {
    document.body.appendChild(suggBox);
  }

  const updatePosition = () => {
    if (!suggBox || !suggBox.classList.contains('active')) return;
    const rect = input.getBoundingClientRect();
    suggBox.style.position = 'fixed';
    suggBox.style.top = `${rect.bottom + 4}px`;
    suggBox.style.left = `${rect.left}px`;
    suggBox.style.width = `${rect.width}px`;
    suggBox.style.zIndex = '999999';
    suggBox.style.maxHeight = '240px';
    suggBox.style.overflowY = 'auto';
    suggBox.style.background = 'var(--surface, #1e293b)';
    suggBox.style.border = '1px solid var(--border, #334155)';
    suggBox.style.borderRadius = '8px';
    suggBox.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)';
  };

  const renderSuggestions = (query = '') => {
    const items = getItemsFn();
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter(it => (it.name || it).toLowerCase().includes(q)) : items;

    if (!filtered.length) {
      suggBox.innerHTML = '';
      suggBox.classList.remove('active');
      return;
    }

    suggBox.innerHTML = filtered.map(it => {
      const name = it.name || it;
      const unitStr = it.unit ? `<span class="meta" style="font-size:11px;color:var(--text-muted);display:block;margin-top:2px;">Unit: ${it.unit}</span>` : '';
      return `<div class="sugg-item" data-value="${name}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.03);"><div style="font-weight:600;font-size:13px;color:var(--text);">${name}</div>${unitStr}</div>`;
    }).join('');

    suggBox.classList.add('active');
    updatePosition();

    suggBox.querySelectorAll('.sugg-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        suggBox.querySelectorAll('.sugg-item').forEach(i => i.style.background = 'transparent');
        el.style.background = 'rgba(12, 57, 37, 0.12)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.background = 'transparent';
      });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const selectedVal = el.dataset.value;
        input.value = selectedVal;
        suggBox.classList.remove('active');
        const itemObj = items.find(it => (it.name || it) === selectedVal);
        if (onSelectFn) onSelectFn(itemObj || selectedVal);
      });
    });
  };

  input.addEventListener('focus', () => {
    renderSuggestions(input.value);
  });

  input.addEventListener('input', () => {
    renderSuggestions(input.value);
  });

  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);

  document.addEventListener('click', (e) => {
    if (suggBox && !input.contains(e.target) && !suggBox.contains(e.target)) {
      suggBox.classList.remove('active');
    }
  });
}

async function loadCatalogProductSuggestions() {
  try {
    const { data: productsData, error } = await window.dbClient.from('products').select('*');
    if (error) throw error;
    catalogProductsCache = productsData || [];

    setupCustomSuggestions('tech-name-input', 'tech-name-suggestions', () => catalogProductsCache, (item) => {
      if (item && item.unit) {
        populateTechUnitSelect(item.unit);
      }
    });

    setupCustomSuggestions('other-name-input', 'other-name-suggestions', () => catalogProductsCache, null);
  } catch (err) {
    console.error('Failed to load catalog suggestions:', err);
  }
}

let inventoryTableEnhancer = null;

function updateInventoryTableHeader() {
  const table = document.getElementById('inventory-table');
  const thead = table ? table.querySelector('thead') : null;
  if (!thead) return;

  const isLabels = activeTab === 'Labels';
  if (isLabels) {
    table.classList.add('labels-active');
  } else {
    table.classList.remove('labels-active');
  }

  thead.innerHTML = `
    <tr id="inventory-table-header">
      <th class="th-item-name">Item Name</th>
      <th class="th-category">Category</th>
      <th class="th-unit">Unit</th>
      <th class="th-stock">Total Stock</th>
      <th class="th-cost">Avg Cost (₹)</th>
      <th class="th-value">Total Value (₹)</th>
      <th class="th-status">Status</th>
      <th class="th-actions">Actions</th>
    </tr>
  `;
}

function renderInventorySlice(slice) {
  const tbody = document.querySelector('#inventory-table tbody');
  const cardsContainer = document.getElementById('inventory-cards-container');

  // 1. Render Table Rows for Desktop / Laptop
  if (tbody) {
    tbody.innerHTML = slice.map(it => {
      const rawType = String(it.item_subtype || it.category || 'Raw Material').trim();
      const itemType = UTILS.formatCategoryLabel(rawType);
      const isTech = String(it.category || '').toLowerCase() === 'technical' || ['insecticide', 'herbicide', 'fungicide', 'pgr', 'solvent'].includes(rawType.toLowerCase());
      const threshold = (it.reorder_level > 0) ? it.reorder_level : (isTech ? 7 : 50);
      const isLow = it.total_stock <= threshold;
      const statusText = it.total_stock === 0 ? 'Out of Stock' : (isLow ? 'Low Stock' : 'In Stock');
      const statusBadge = (typeof UTILS !== 'undefined' && UTILS.statusBadge)
        ? UTILS.statusBadge(statusText, true)
        : `<span class="badge ${it.total_stock === 0 ? 'badge-gray' : (isLow ? 'badge-danger' : 'badge-approved')}"><span class="badge-dot"></span>${statusText}</span>`;

      const isItemLabel = it.category === 'Labels';
      const isBottle = it.category === 'Bottles';
      const isBox = it.category === 'Boxes';
      const isPackaging = isBottle || isBox;

      let displayName = it.name;
      let categoryText = itemType || '—';
      let displayUnit = it.unit || 'Nos';
      let subtext = 'RAW MATERIAL';
      let badgeClass = 'badge-purple';

      if (isItemLabel) {
        const labelInfo = (typeof UTILS !== 'undefined' && UTILS.formatLabelItemDisplay)
          ? UTILS.formatLabelItemDisplay(it)
          : { displayName: it.name, brand: it.item_subtype || 'AAC', unit: it.item_size || 'Nos' };
        displayName = labelInfo.displayName;
        categoryText = labelInfo.brand;
        displayUnit = labelInfo.unit;
        subtext = 'PRODUCT PACKAGING LABEL';
        badgeClass = labelInfo.brand === 'GAS' ? 'badge-info' : 'badge-purple';
      } else if (isPackaging) {
        const pkgInfo = (typeof UTILS !== 'undefined' && UTILS.formatPackagingItemDisplay)
          ? UTILS.formatPackagingItemDisplay(it, it.category)
          : { displayName: it.name, category: it.item_subtype || it.category, unit: it.item_size || it.unit || 'Nos' };
        displayName = pkgInfo.displayName;
        categoryText = pkgInfo.category;
        displayUnit = pkgInfo.unit;
        subtext = isBottle ? 'BOTTLE PACKAGING' : 'CORRUGATED BOX';
        badgeClass = 'badge-purple';
      } else if (isTech) {
        displayName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.name) : it.name;
        categoryText = rawType;
        displayUnit = it.unit || 'Litre';
        subtext = 'RAW TECHNICAL MATERIAL';
        badgeClass = 'badge-purple';
      } else {
        // Others
        displayName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.name) : it.name;
        categoryText = rawType;
        displayUnit = it.unit || 'Nos';
        subtext = 'GENERAL INVENTORY';
        badgeClass = 'badge-purple';
      }

      return `<tr>
        <td class="cell-bold td-item-name">
          <div class="inventory-item-title-box">
            <span class="inventory-item-name">${displayName}</span>
            <span class="inventory-item-subtext">${subtext}</span>
          </div>
        </td>
        <td class="td-category" style="text-align:center;"><span class="badge ${badgeClass}" style="font-weight:700;">${categoryText}</span></td>
        <td class="td-unit" style="font-weight:600;text-align:center;">${displayUnit}</td>
        <td class="td-stock" style="font-weight:700;color:var(--accent);text-align:right;">${it.total_stock.toFixed(2)}</td>
        <td class="td-cost" style="text-align:right;">${UTILS.fmtCurrency(it.avg_cost)}</td>
        <td class="td-value cell-amount" style="text-align:right;font-weight:600;">${UTILS.fmtCurrency(it.total_value)}</td>
        <td class="td-status" style="text-align:center;">${statusBadge}</td>
        <td class="td-actions" style="text-align:center;"><div class="row-actions" style="justify-content:center;">
          <button class="action-btn view" onclick="viewBatches('${it.item_type}', ${it.id})" title="View Batch Breakdown"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="action-btn edit" onclick="openEdit('${it.item_type}', ${it.id})" title="Edit Item & Opening Stock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" onclick="deleteInventoryItem('${it.item_type}', ${it.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  // 2. Render Responsive Mobile Cards (for Mobile < 768px)
  if (cardsContainer) {
    cardsContainer.innerHTML = slice.map(it => {
      const rawType = String(it.item_subtype || it.category || 'Raw Material').trim();
      const itemType = UTILS.formatCategoryLabel(rawType);
      const isTech = String(it.category || '').toLowerCase() === 'technical' || ['insecticide', 'herbicide', 'fungicide', 'pgr', 'solvent'].includes(rawType.toLowerCase());
      const threshold = (it.reorder_level > 0) ? it.reorder_level : (isTech ? 7 : 50);
      const isLow = it.total_stock <= threshold;
      const statusText = it.total_stock === 0 ? 'Out of Stock' : (isLow ? 'Low Stock' : 'In Stock');
      const statusBadge = (typeof UTILS !== 'undefined' && UTILS.statusBadge)
        ? UTILS.statusBadge(statusText, true)
        : `<span class="badge ${it.total_stock === 0 ? 'badge-gray' : (isLow ? 'badge-danger' : 'badge-approved')}"><span class="badge-dot"></span>${statusText}</span>`;

      const isItemLabel = it.category === 'Labels';
      const isBottle = it.category === 'Bottles';
      const isBox = it.category === 'Boxes';
      const isPackaging = isBottle || isBox;

      let cardTitle = it.name;
      let cardSubtitle = 'RAW MATERIAL';
      let tagsHtml = `<span class="badge badge-purple">${itemType || '—'}</span>`;
      let displayUnit = it.unit || 'Nos';

      if (isItemLabel) {
        const labelInfo = (typeof UTILS !== 'undefined' && UTILS.formatLabelItemDisplay)
          ? UTILS.formatLabelItemDisplay(it)
          : { displayName: it.name, brand: it.item_subtype || 'AAC', unit: it.item_size || 'Nos' };
        cardTitle = labelInfo.displayName;
        cardSubtitle = 'PRODUCT PACKAGING LABEL';
        displayUnit = labelInfo.unit;
        tagsHtml = `<span class="badge ${labelInfo.brand === 'GAS' ? 'badge-info' : 'badge-purple'}" style="font-weight:700;">${labelInfo.brand}</span>`;
      } else if (isPackaging) {
        const pkgInfo = (typeof UTILS !== 'undefined' && UTILS.formatPackagingItemDisplay)
          ? UTILS.formatPackagingItemDisplay(it, it.category)
          : { displayName: it.name, category: it.item_subtype || it.category, unit: it.item_size || it.unit || 'Nos' };
        cardTitle = pkgInfo.displayName;
        cardSubtitle = isBottle ? 'BOTTLE PACKAGING' : 'CORRUGATED BOX';
        displayUnit = pkgInfo.unit;
        tagsHtml = `<span class="badge badge-purple" style="font-weight:700;">${pkgInfo.category}</span>`;
      } else if (isTech) {
        cardTitle = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.name) : it.name;
        cardSubtitle = 'RAW TECHNICAL MATERIAL';
        displayUnit = it.unit || 'Litre';
        tagsHtml = `<span class="badge badge-purple">${rawType || '—'}</span>`;
      } else {
        cardTitle = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(it.name) : it.name;
        cardSubtitle = 'GENERAL INVENTORY';
        displayUnit = it.unit || 'Nos';
        tagsHtml = `<span class="badge badge-purple">${rawType || '—'}</span>`;
      }

      return `
        <div class="inventory-card" data-item-id="${it.id}">
          <div class="inventory-card-header">
            <div class="inventory-card-title-group">
              <div class="inventory-card-title">${cardTitle}</div>
              <div class="inventory-card-subtitle">${cardSubtitle}</div>
            </div>
            <div class="inventory-card-status">${statusBadge}</div>
          </div>

          <div class="inventory-card-tags">
            ${tagsHtml}
          </div>

          <div class="inventory-card-metrics">
            <div class="metric-block">
              <span class="metric-label">TOTAL STOCK</span>
              <span class="metric-val text-accent">${it.total_stock.toFixed(2)}</span>
            </div>
            <div class="metric-block">
              <span class="metric-label">UNIT</span>
              <span class="metric-val">${displayUnit}</span>
            </div>
            <div class="metric-block">
              <span class="metric-label">AVG COST</span>
              <span class="metric-val">${UTILS.fmtCurrency(it.avg_cost)}</span>
            </div>
            <div class="metric-block">
              <span class="metric-label">TOTAL VALUE</span>
              <span class="metric-val font-semibold">${UTILS.fmtCurrency(it.total_value)}</span>
            </div>
          </div>

          <div class="inventory-card-actions">
            <button type="button" class="btn btn-sm btn-secondary inventory-action-btn" onclick="viewBatches('${it.item_type}', ${it.id})" title="View Batches">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Batches
            </button>
            <button type="button" class="btn btn-sm btn-secondary inventory-action-btn" onclick="openEdit('${it.item_type}', ${it.id})" title="Edit Item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button type="button" class="btn btn-sm btn-danger inventory-action-btn" onclick="deleteInventoryItem('${it.item_type}', ${it.id})" title="Delete Item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  UTILS.applyMobileTableLabels('inventory-table');
}

function renderTable(data) {
  const tbody = document.querySelector('#inventory-table tbody');
  const cardsContainer = document.getElementById('inventory-cards-container');
  if (!tbody) return;

  updateInventoryTableHeader();

  const filtered = UTILS.sortLatestFirst(filterData(data));
  const countEl = document.getElementById('total-info');
  if (countEl) countEl.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
  
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><h3>No items found</h3><p class="text-sm text-muted">Try adjusting your search query or filters</p></div></td></tr>`;
    if (cardsContainer) {
      cardsContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;"><h3>No items found</h3><p class="text-sm text-muted">Try adjusting your search query or filters</p></div>`;
    }
    const pag = document.querySelector('#inventory-table-wrap .pagination');
    if (pag) pag.style.display = 'none';
    return;
  }

  if (window.TableEnhancer) {
    if (!inventoryTableEnhancer) {
      inventoryTableEnhancer = new window.TableEnhancer({
        tableId: 'inventory-table',
        pageSize: 25,
        defaultSortKey: 'name',
        defaultSortOrder: 'asc',
        onRender: (pageSlice) => renderInventorySlice(pageSlice)
      });
    }
    inventoryTableEnhancer.setData(filtered);
    return;
  }

  renderInventorySlice(filtered.slice(0, 50));
}

async function deleteInventoryItem(itemType, id) {
  let message = 'Delete this inventory item?';
  APP.showConfirm(message, async () => {
    try {
      try {
        await window.dbClient.from('stock_batches').delete().eq('item_id', id).eq('item_type', 'Inventory');
      } catch (_) {}
      try {
        await window.dbClient.from('products').update({ inventory_item_id: null }).eq('inventory_item_id', id);
      } catch (_) {}

      const { error } = await window.dbClient.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      
      APP.showToast('Inventory item deleted!', 'success');
      setTimeout(() => loadInventory(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Error deleting item: ' + err.message, 'error');
    }
  });
}

async function viewBatches(type, id) {
  const el = document.getElementById('batch-content');
  if (!el) return;
  
  try {
    const { data: batches, error } = await window.dbClient.from('stock_batches').select('*').eq('item_id', id).eq('item_type', 'Inventory').order('id', { ascending: true });
    if (error) throw error;
    
    // Also fetch purchase metadata for clean source display (P-01, P-02...)
    let purMap = {};
    try {
      const { data: purList } = await window.dbClient.from('purchases').select('id, purchase_no, supplier_name, date, invoice_no');
      (purList || []).forEach(p => { purMap[p.id] = p; });
    } catch (_) {}

    if (!batches || !batches.length) { 
      el.innerHTML = '<div class="empty-state">No active batches.</div>'; 
    } else { 
      const totalStock = batches.reduce((sum, b) => sum + parseFloat(b.current_qty || 0), 0);
      const isMobile = window.innerWidth <= 768;
      
      let tableOrCardContent = '';
      if (isMobile) {
        tableOrCardContent = batches.map(b => {
          const isOpen = b.batch_no && b.batch_no.toUpperCase().includes('OPEN');
          const isProd = b.batch_no && (/^(?:BATCH|B)-/i.test(b.batch_no));
          const pur = b.purchase_id ? purMap[b.purchase_id] : null;
          
          let batchNoDisplay = (b.batch_no || '—')
            .replace(/^PUR-(\d+)$/i, 'P-$1')
            .replace(/^(?:BATCH|B)-?(\d+)$/i, (m, g) => `B-${g.padStart(2, '0')}`);
          if (pur && pur.purchase_no) {
            batchNoDisplay = pur.purchase_no;
          }

          let sourceText = 'Opening Stock Entry';
          if (pur) {
            sourceText = pur.supplier_name || 'Commercial Purchase';
            if (pur.invoice_no && pur.invoice_no.trim()) {
              sourceText += ` (Inv: ${pur.invoice_no})`;
            }
          } else if (b.supplier_name) {
            sourceText = b.supplier_name;
          } else if (isProd) {
            sourceText = 'Production Formulation';
          }

          const badgeClass = isOpen ? 'badge-purple' : (isProd ? 'badge-info' : 'badge-success');
          const badgeText = isOpen ? 'Opening Stock' : (isProd ? 'Production Batch' : 'Purchase Batch');
          const batchDate = b.purchase_date || (pur ? pur.date : null);
          
          return `
            <div style="padding: 10px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; width: 100%; box-sizing: border-box;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                <span class="cell-mono" style="font-weight: 700; font-size: 13.5px; color: var(--text-primary); word-break: break-all;">${batchNoDisplay}</span>
                <span class="badge ${badgeClass}" style="font-size:11px;">${badgeText}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
                <span style="word-break: break-word;">Source: ${sourceText}</span>
                <span>${batchDate ? UTILS.fmtDate(batchDate) : '—'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; padding-top: 6px; border-top: 1px dashed var(--border); margin-top: 6px; flex-wrap: wrap; gap: 4px;">
                <span>Unit Cost: <strong>${UTILS.fmtCurrency(b.purchase_price)}</strong></span>
                <span style="font-weight: 800; color: var(--accent);">${parseFloat(b.current_qty).toFixed(2)} ${b.unit || ''}</span>
              </div>
            </div>
          `;
        }).join('');
      } else {
        tableOrCardContent = `
          <div class="line-items-wrap" style="overflow-x:auto;">
            <table class="data-table" style="width:100%; min-width:580px;">
              <thead>
                <tr>
                  <th>Purchase / Batch No</th>
                  <th>Type / Source</th>
                  <th>Supplier / Ref</th>
                  <th>Date</th>
                  <th>Unit Cost (₹)</th>
                  <th>Remaining Qty</th>
                </tr>
              </thead>
              <tbody>
                ${batches.map(b => {
                  const isOpen = b.batch_no && b.batch_no.toUpperCase().includes('OPEN');
                  const isProd = b.batch_no && (/^(?:BATCH|B)-/i.test(b.batch_no));
                  const pur = b.purchase_id ? purMap[b.purchase_id] : null;

                  let batchNoDisplay = (b.batch_no || '—')
                    .replace(/^PUR-(\d+)$/i, 'P-$1')
                    .replace(/^(?:BATCH|B)-?(\d+)$/i, (m, g) => `B-${g.padStart(2, '0')}`);
                  if (pur && pur.purchase_no) {
                    batchNoDisplay = pur.purchase_no;
                  }

                  let sourceText = 'Opening Stock Entry';
                  if (pur) {
                    sourceText = pur.supplier_name || 'Commercial Purchase';
                    if (pur.invoice_no && pur.invoice_no.trim()) {
                      sourceText += ` (Inv: ${pur.invoice_no})`;
                    }
                  } else if (b.supplier_name) {
                    sourceText = b.supplier_name;
                  } else if (isProd) {
                    sourceText = 'Production Formulation';
                  }

                  const badgeClass = isOpen ? 'badge-purple' : (isProd ? 'badge-info' : 'badge-success');
                  const badgeText = isOpen ? 'Opening Stock' : (isProd ? 'Production Batch' : 'Purchase Batch');
                  const batchDate = b.purchase_date || (pur ? pur.date : null);
                  
                  return `
                    <tr>
                      <td class="cell-mono" style="font-weight: 700;">${batchNoDisplay}</td>
                      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                      <td>${sourceText}</td>
                      <td>${batchDate ? UTILS.fmtDate(batchDate) : '—'}</td>
                      <td>${UTILS.fmtCurrency(b.purchase_price)}</td>
                      <td style="font-weight:700;color:var(--accent)">${parseFloat(b.current_qty).toFixed(2)} ${b.unit || ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      el.innerHTML = `
        <div style="margin-bottom: 12px; font-weight: 600; font-size: 13.5px; background: rgba(12, 57, 37, 0.08); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(12, 57, 37, 0.2); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
          <span>Purchase & Batch Breakdown</span>
          <span>Available Stock: <strong style="color:var(--accent); font-size: 15px;">${totalStock.toFixed(2)}</strong></span>
        </div>
        <div>
          ${tableOrCardContent}
        </div>`; 
    }
    APP.openModal('batch-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Error loading active batches: ' + err.message, 'error');
  }
}

function filterData(data) {
  const q = document.getElementById('search-input')?.value.toLowerCase().trim();
  const techFilter = document.getElementById('tech-filter-select')?.value;
  return data.filter(it => {
    if (activeTab !== 'All') {
      if (activeTab === 'Technical' && it.category !== 'Technical') return false;
      if (activeTab === 'Bottles' && it.category !== 'Bottles') return false;
      if (activeTab === 'Boxes' && it.category !== 'Boxes') return false;
      if (activeTab === 'Labels' && it.category !== 'Labels') return false;
      if (activeTab === 'Others' && ['Technical','Bottles','Boxes','Labels'].includes(it.category || it.item_type)) return false;
    }
    
    if (activeTab === 'Technical' && techFilter && (it.item_subtype || '').toLowerCase() !== techFilter.toLowerCase()) {
      return false;
    }
    
    if (q) {
      const rawName = (it.name || '').toLowerCase();
      let labelInfo = null;
      let pkgInfo = null;
      if (it.category === 'Labels' && typeof UTILS !== 'undefined' && UTILS.formatLabelItemDisplay) {
        labelInfo = UTILS.formatLabelItemDisplay(it);
      } else if ((it.category === 'Bottles' || it.category === 'Boxes') && typeof UTILS !== 'undefined' && UTILS.formatPackagingItemDisplay) {
        pkgInfo = UTILS.formatPackagingItemDisplay(it, it.category);
      }
      const dispName = labelInfo
        ? labelInfo.displayName.toLowerCase()
        : (pkgInfo ? pkgInfo.displayName.toLowerCase() : (((typeof UTILS !== 'undefined' && UTILS.formatPackagingDisplayName) ? UTILS.formatPackagingDisplayName(it) : '').toLowerCase()));
      const brandStr = (labelInfo ? labelInfo.brand : (pkgInfo ? pkgInfo.category : (it.item_subtype || ''))).toLowerCase();
      const packStr = (labelInfo ? (labelInfo.unit || labelInfo.packaging) : (pkgInfo ? pkgInfo.unit : (it.item_size || ''))).toLowerCase();
      const rawSubtype = (it.item_subtype || '').toLowerCase();
      const rawSize = (it.item_size || '').toLowerCase();

      if (!rawName.includes(q) && !dispName.includes(q) && !brandStr.includes(q) && !packStr.includes(q) && !rawSubtype.includes(q) && !rawSize.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

/* ─── DYNAMIC FORM LOGIC ─── */
let masterCache = { technical: [], bottles: [], boxes: [], labels: [] };

async function loadMasterOptions(targetUnit = null) {
  try {
    const { data: opts, error } = await window.dbClient.from('master_options').select('*');
    if (error) throw error;
    
    masterCache.technical = opts.filter(o => o.category === 'technical_unit');
    masterCache.bottles = opts.filter(o => o.category === 'bottle_option');
    masterCache.boxes = opts.filter(o => o.category === 'box_option');
    masterCache.labels = opts.filter(o => o.category === 'label_option');
    
    populateTechUnitSelect(targetUnit);
  } catch (err) {
    console.error('Failed to load master options:', err);
    populateTechUnitSelect(targetUnit);
  }
}

function populateTechUnitSelect(targetUnit = null) {
  const techUnitSelect = document.getElementById('tech-unit-select');
  if (!techUnitSelect) return;
  
  const currentVal = targetUnit || techUnitSelect.value || 'Nos';
  const defaultUnits = ['Nos', 'Gram', 'Kg', 'Litre', 'Ml'];
  const fromMaster = masterCache.technical ? masterCache.technical.map(u => u.value) : [];

  const rawList = [currentVal, ...fromMaster, ...defaultUnits].filter(Boolean);
  const normalizedList = rawList.map(u => UTILS.normalizeUnit(u));
  const unitOptions = Array.from(new Set(normalizedList));

  techUnitSelect.innerHTML = unitOptions.map(u => `<option value="${u}">${u}</option>`).join('');
  techUnitSelect.value = UTILS.normalizeUnit(currentVal);

  if (techUnitSelect._ussInstance) {
    techUnitSelect._ussInstance.updateOptions();
  }
}

function populateDependentTypes(cacheArray, typeSelectId, sizeSelectId) {
  const typeSelect = document.getElementById(typeSelectId);
  const sizeSelect = document.getElementById(sizeSelectId);
  if (!typeSelect || !sizeSelect) return;
  
  const types = [...new Set(cacheArray.map(o => (o.parent_value || '').trim()))].filter(Boolean);
  const currentType = typeSelect.value;
  
  typeSelect.innerHTML = '<option value="">-- Select Type --</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
  if (currentType && types.some(t => t.toLowerCase() === currentType.toLowerCase())) {
    typeSelect.value = types.find(t => t.toLowerCase() === currentType.toLowerCase()) || currentType;
  }
  
  const updateSizes = () => {
    const selectedType = typeSelect.value;
    let matchingOpts = cacheArray;
    if (selectedType) {
      matchingOpts = cacheArray.filter(o => (o.parent_value || '').trim().toLowerCase() === selectedType.trim().toLowerCase());
    }
    const sizes = [...new Set(matchingOpts.map(o => o.value).filter(Boolean))];
    const currentSize = sizeSelect.value;

    sizeSelect.innerHTML = '<option value="">-- Select Size --</option>' + sizes.map(s => `<option value="${s}">${s}</option>`).join('');
    if (currentSize && sizes.includes(currentSize)) {
      sizeSelect.value = currentSize;
    }

    if (sizeSelect._ussInstance) {
      sizeSelect._ussInstance.updateOptions();
    } else if (window.UniversalSearchSelect) {
      new UniversalSearchSelect(sizeSelect);
      sizeSelect.dataset.ussInitialized = 'true';
    }
  };
  
  typeSelect.onchange = updateSizes;
  typeSelect.addEventListener('change', updateSizes);
  
  updateSizes();

  if (typeSelect._ussInstance) {
    typeSelect._ussInstance.updateOptions();
  } else if (window.UniversalSearchSelect) {
    new UniversalSearchSelect(typeSelect);
    typeSelect.dataset.ussInitialized = 'true';
  }
}

function goToInventoryStep(prefix, step) {
  const modal = document.getElementById(`${prefix}-modal`);
  if (!modal) return;

  const pills = modal.querySelectorAll('.product-step-pill');
  pills.forEach((p, idx) => {
    if (idx + 1 === step) p.classList.add('active');
    else p.classList.remove('active');
  });

  const panels = modal.querySelectorAll('.product-step-panel');
  panels.forEach(p => {
    const stepNum = parseInt(p.dataset.stepPanel, 10);
    if (stepNum === step) p.classList.add('active');
    else p.classList.remove('active');
  });

  const prevBtn = document.getElementById(`${prefix}-prev-btn`);
  const nextBtn = document.getElementById(`${prefix}-next-btn`);
  const saveBtn = document.getElementById(`${prefix}-save-btn`);

  if (step === 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'inline-block';
    if (saveBtn) saveBtn.style.display = 'none';
  } else {
    if (prevBtn) prevBtn.style.display = 'inline-block';
    if (nextBtn) nextBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'inline-block';
  }
}

function inventoryFormNextStep(prefix) {
  goToInventoryStep(prefix, 2);
}

function openAdd() {
  const cat = activeTab;
  if (cat === 'Technical') {
    openAddTechnical();
  } else if (cat === 'Bottles') {
    openAddBottle();
  } else if (cat === 'Boxes') {
    openAddBox();
  } else if (cat === 'Labels') {
    openAddLabel();
  } else if (cat === 'Others') {
    openAddOther();
  } else {
    APP.openModal('category-selector-modal');
  }
}

function selectCategoryForAdd(cat) {
  APP.closeModal('category-selector-modal');
  setTimeout(() => {
    if (cat === 'Technical') openAddTechnical();
    else if (cat === 'Bottles') openAddBottle();
    else if (cat === 'Boxes') openAddBox();
    else if (cat === 'Labels') openAddLabel();
    else if (cat === 'Others') openAddOther();
  }, 150);
}

function toggleOpeningStockSection() {
  const openingSections = document.querySelectorAll('.opening-stock-section');
  openingSections.forEach(sec => {
    sec.style.display = 'grid';
  });
}

function renderStockBreakdownBanner(formId, item, overrideOpeningQty = 0) {
  const form = document.getElementById(formId);
  if (!form) return;

  let banner = form.querySelector('.stock-breakdown-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'stock-breakdown-banner';
    banner.style.cssText = 'background: rgba(12, 57, 37, 0.08); border: 1px solid rgba(12, 57, 37, 0.2); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;';
    const panel2 = form.querySelector('.product-step-panel[data-step-panel="2"]');
    if (panel2) panel2.insertBefore(banner, panel2.firstChild);
  }

  const openingQty = parseFloat(overrideOpeningQty) || parseFloat(item.opening_qty) || 0;
  
  // Safely parse total stock without failing on 0
  let totalStock = 0;
  if (item.total_stock !== undefined && item.total_stock !== null) {
      totalStock = parseFloat(item.total_stock);
  } else if (item.stock !== undefined && item.stock !== null) {
      totalStock = parseFloat(item.stock);
  } else {
      totalStock = openingQty;
  }
  
  const unitStr = item.unit || 'Nos';

  banner.innerHTML = `
    <div>
      <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; display:block; margin-bottom:4px;">Opening Stock Entry</span>
      <span style="font-size:15px; font-weight:600;">${openingQty.toFixed(2)} ${unitStr}</span>
    </div>
    <div style="text-align:right">
      <span style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); font-weight:600; display:block; margin-bottom:4px;">Current Live Stock</span>
      <span style="font-size:18px; font-weight:800; color:${totalStock <= 0 ? 'var(--danger)' : 'var(--success)'};">${totalStock.toFixed(2)} ${unitStr}</span>
    </div>
  `;
}

async function getNextOpeningBatchNo() {
  try {
    const { data: batches } = await window.dbClient
      .from('stock_batches')
      .select('batch_no')
      .order('id', { ascending: false });
      
    let maxNum = 0;
    if (batches && batches.length > 0) {
      for (const b of batches) {
        if (b.batch_no && typeof b.batch_no === 'string') {
          const match = b.batch_no.match(/^OPEN-(\d+)$/i);
          if (match) {
            const n = parseInt(match[1], 10);
            if (!isNaN(n) && n > maxNum && n < 100000) {
              maxNum = n;
            }
          }
        }
      }
    }
    const nextNum = maxNum + 1;
    return `OPEN-${String(nextNum).padStart(2, '0')}`;
  } catch (err) {
    console.error('Error getting next opening batch no:', err);
    return 'OPEN-01';
  }
}

async function openAddTechnical() {
  editingItemId = null;
  document.getElementById('technical-modal-title').textContent = 'Add Technical Item';
  const form = document.getElementById('technical-form');
  if (form) {
    form.reset();
    const banner = form.querySelector('.stock-breakdown-banner');
    if (banner) banner.remove();
  }
  populateTechUnitSelect('Nos');
  toggleOpeningStockSection();
  goToInventoryStep('technical', 1);
  const nextBatch = await getNextOpeningBatchNo();
  const batchField = document.querySelector('#technical-form [name="opening_batch_no"]');
  if (batchField && !batchField.value) batchField.value = nextBatch;
  APP.openModal('technical-modal');
}

async function openAddBottle() {
  editingItemId = null;
  document.getElementById('bottle-modal-title').textContent = 'Add Bottle Option';
  const form = document.getElementById('bottle-form');
  if (form) {
    form.reset();
    const banner = form.querySelector('.stock-breakdown-banner');
    if (banner) banner.remove();
  }
  populateDependentTypes(masterCache.bottles, 'tech-bottle-type-select', 'tech-bottle-size-select');
  toggleOpeningStockSection();
  goToInventoryStep('bottle', 1);
  const nextBatch = await getNextOpeningBatchNo();
  const batchField = document.querySelector('#bottle-form [name="opening_batch_no"]');
  if (batchField && !batchField.value) batchField.value = nextBatch;
  APP.openModal('bottle-modal');
}

async function openAddBox() {
  editingItemId = null;
  document.getElementById('box-modal-title').textContent = 'Add Box Option';
  const form = document.getElementById('box-form');
  if (form) {
    form.reset();
    const banner = form.querySelector('.stock-breakdown-banner');
    if (banner) banner.remove();
  }
  populateDependentTypes(masterCache.boxes, 'tech-box-type-select', 'tech-box-size-select');
  toggleOpeningStockSection();
  goToInventoryStep('box', 1);
  const nextBatch = await getNextOpeningBatchNo();
  const batchField = document.querySelector('#box-form [name="opening_batch_no"]');
  if (batchField && !batchField.value) batchField.value = nextBatch;
  APP.openModal('box-modal');
}


/* ─── CO-MARKETING & PRODUCT-SIZE LABEL MAPPING HELPERS ─── */
async function populateLabelFormSelects(selectedProdId = null, selectedSize = null, selectedOwner = null) {
  try {
    // 1. Ensure products cache
    if (!catalogProductsCache || !catalogProductsCache.length) {
      const { data: prods } = await window.dbClient.from('products').select('*').order('name', { ascending: true });
      catalogProductsCache = prods || [];
    }

    // 2. Populate product select
    const prodSelect = document.getElementById('label-product-select');
    if (prodSelect) {
      prodSelect.innerHTML = '<option value="">Select Target Product…</option>' +
        catalogProductsCache.map(p => `<option value="${p.id}" ${p.id == selectedProdId ? 'selected' : ''}>${p.name}</option>`).join('');
    }

    // 3. Populate label owner select from registered companies
    const ownerSelect = document.getElementById('label-owner-select');
    if (ownerSelect) {
      let companies = [];
      try {
        const { data: compList } = await window.dbClient.from('companies').select('id, name, code, is_manufacturing');
        companies = compList || [];
      } catch (_) {}

      // Fallback defaults
      if (!companies.some(c => c.code === 'AAC' || c.code === 'ACC' || c.code === 'E')) companies.unshift({ id: 1, name: 'Anjani Agri Care', code: 'AAC' });
      if (!companies.some(c => c.code === 'GAS')) companies.push({ id: 2, name: 'Greenfield Agro Solutions', code: 'GAS' });

      const activeCode = (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getActiveCompany) 
        ? (window.TENANT_CONTEXT.getActiveCompany().code || 'AAC')
        : 'E';
      let targetOwner = (selectedOwner || activeCode || 'E').toUpperCase();
      if (targetOwner === 'ACC' || targetOwner === 'AAC') targetOwner = 'E';

      ownerSelect.innerHTML = companies.map(c => {
        let normCode = (c.code || '').toUpperCase();
        if (normCode === 'ACC' || normCode === 'AAC') normCode = 'E';
        const isSel = normCode === targetOwner;
        const roleDesc = c.is_manufacturing ? 'In-House Mfg' : 'Co-Marketing Partner';
        return `<option value="${normCode}" ${isSel ? 'selected' : ''}>${normCode} (${c.name} - ${roleDesc})</option>`;
      }).join('');
    }

    // 4. Update sizes for selected product
    await onLabelProductSelectChange(selectedProdId, selectedSize);
  } catch (err) {
    console.warn('populateLabelFormSelects error:', err);
  }
}

async function onLabelProductSelectChange(productId, preselectedSize = null) {
  const sizeSelect = document.getElementById('label-size-select');
  if (!sizeSelect) return;

  if (!productId) {
    sizeSelect.innerHTML = '<option value="">Select Packaging Size…</option>';
    return;
  }

  try {
    const prod = (catalogProductsCache || []).find(p => p.id == productId);
    let sizes = [];

    // Query product_packaging variants
    const { data: pkgs, error } = await window.dbClient.from('product_packaging').select('*').eq('product_id', productId);
    if (!error && pkgs && pkgs.length > 0) {
      sizes = pkgs.map(pk => (window.INVENTORY_CORE && window.INVENTORY_CORE.Units) ? window.INVENTORY_CORE.Units.cleanSizeLabel(pk.packaging_size, prod?.unit) : pk.packaging_size);
    }

    if (!sizes.length) {
      sizes = ['1 Litre', '500 Ml', '250 Ml', '100 Ml', '50 Ml', '5 Litre', '10 Litre'];
    }

    // Unique sizes sorted descending
    const uniqueSizes = [...new Set(sizes.filter(Boolean))];
    if (window.UTILS && window.UTILS.sortPackSizesDescending) {
      uniqueSizes.sort((a, b) => {
        const vA = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units) ? window.INVENTORY_CORE.Units.parsePackagingSize(a).volumeMl : 0;
        const vB = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units) ? window.INVENTORY_CORE.Units.parsePackagingSize(b).volumeMl : 0;
        return vB - vA;
      });
    }

    const normPre = preselectedSize ? String(preselectedSize).trim().toLowerCase() : '';
    sizeSelect.innerHTML = '<option value="">Select Packaging Size…</option>' +
      uniqueSizes.map(s => {
        const isMatch = normPre && (s.toLowerCase() === normPre || (window.INVENTORY_CORE && window.INVENTORY_CORE.Units && window.INVENTORY_CORE.Units.sizesMatch(s, preselectedSize)));
        return `<option value="${s}" ${isMatch ? 'selected' : ''}>${s}</option>`;
      }).join('');

    // If preselectedSize not in list, append it
    if (preselectedSize && !uniqueSizes.some(s => s.toLowerCase() === normPre)) {
      sizeSelect.innerHTML += `<option value="${preselectedSize}" selected>${preselectedSize}</option>`;
    }
  } catch (err) {
    console.warn('onLabelProductSelectChange error:', err);
  }
}

async function openAddLabel() {
  editingItemId = null;
  document.getElementById('label-modal-title').textContent = 'Add Label Inventory';
  const form = document.getElementById('label-form');
  if (form) {
    form.reset();
    const banner = form.querySelector('.stock-breakdown-banner');
    if (banner) banner.remove();
  }
  await populateLabelFormSelects();
  toggleOpeningStockSection();
  goToInventoryStep('label', 1);
  const nextBatch = await getNextOpeningBatchNo();
  const batchField = document.querySelector('#label-form [name="opening_batch_no"]');
  if (batchField && !batchField.value) batchField.value = nextBatch;
  APP.openModal('label-modal');
}

async function openAddOther() {
  editingItemId = null;
  document.getElementById('other-modal-title').textContent = 'Add Other Item';
  const form = document.getElementById('other-form');
  if (form) {
    form.reset();
    const banner = form.querySelector('.stock-breakdown-banner');
    if (banner) banner.remove();
  }
  toggleOpeningStockSection();
  goToInventoryStep('other', 1);
  const nextBatch = await getNextOpeningBatchNo();
  const batchField = document.querySelector('#other-form [name="opening_batch_no"]');
  if (batchField && !batchField.value) batchField.value = nextBatch;
  APP.openModal('other-modal');
}

async function openEdit(type, id) {
  editingItemId = id;
  try {
    const { data: itData, error } = await window.dbClient.from('inventory_items').select('*').eq('id', id).single();
    if (error) throw error;
    const it = itData;

    toggleOpeningStockSection();

    // Fetch opening stock batch to populate fields
    let openingQty = '';
    let openingCost = '';
    let openingBatchNo = '';
    
    const { data: batches } = await window.dbClient.from('stock_batches')
      .select('*').eq('item_id', id).eq('item_type', 'Inventory')
      .order('id', { ascending: true }).limit(1);
      
    let totalLiveStock = 0;
    if (batches && batches.length > 0) {
      const b = batches[0];
      openingQty = b.initial_qty || '';
      openingCost = b.purchase_price || '';
      openingBatchNo = b.batch_no || '';
      totalLiveStock = batches.reduce((sum, batch) => sum + (parseFloat(batch.current_qty) || 0), 0);
    }
    it.total_stock = totalLiveStock;

    if (it.category === 'Technical') {
      goToInventoryStep('technical', 1);
      document.getElementById('technical-modal-title').textContent = 'Edit Technical Item';
      await loadMasterOptions(it.unit);
      UTILS.populateForm('technical-form', it);
      populateTechUnitSelect(it.unit || 'Nos');
      renderStockBreakdownBanner('technical-form', it, openingQty);
      
      const typeSelect = document.querySelector('#technical-form [name="item_type"]');
      if (typeSelect) typeSelect.value = type;
      
      const qtyField = document.querySelector('#technical-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#technical-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#technical-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('technical-modal');
    } else if (it.category === 'Bottles') {
      goToInventoryStep('bottle', 1);
      document.getElementById('bottle-modal-title').textContent = 'Edit Bottle Option';
      document.getElementById('bottle-form').reset();
      populateDependentTypes(masterCache.bottles, 'tech-bottle-type-select', 'tech-bottle-size-select');
      renderStockBreakdownBanner('bottle-form', it, openingQty);
      
      const typeSelect = document.getElementById('tech-bottle-type-select');
      if (typeSelect) {
        typeSelect.value = it.item_subtype || '';
        typeSelect.onchange();
        if (typeSelect._ussInstance) typeSelect._ussInstance.updateOptions();
      }
      const sizeSelect = document.getElementById('tech-bottle-size-select');
      if (sizeSelect) {
        sizeSelect.value = it.item_size || '';
        if (sizeSelect._ussInstance) sizeSelect._ussInstance.updateOptions();
      }
      
      const descField = document.querySelector('#bottle-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#bottle-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#bottle-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#bottle-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('bottle-modal');
    } else if (it.category === 'Boxes') {
      goToInventoryStep('box', 1);
      document.getElementById('box-modal-title').textContent = 'Edit Box Option';
      document.getElementById('box-form').reset();
      populateDependentTypes(masterCache.boxes, 'tech-box-type-select', 'tech-box-size-select');
      renderStockBreakdownBanner('box-form', it, openingQty);
      
      const typeSelect = document.getElementById('tech-box-type-select');
      if (typeSelect) {
        typeSelect.value = it.item_subtype || '';
        typeSelect.onchange();
        if (typeSelect._ussInstance) typeSelect._ussInstance.updateOptions();
      }
      const sizeSelect = document.getElementById('tech-box-size-select');
      if (sizeSelect) {
        sizeSelect.value = it.item_size || '';
        if (sizeSelect._ussInstance) sizeSelect._ussInstance.updateOptions();
      }
      
      const descField = document.querySelector('#box-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#box-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#box-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#box-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('box-modal');
    } else if (it.category === 'Labels') {
      goToInventoryStep('label', 1);
      document.getElementById('label-modal-title').textContent = 'Edit Label Item';
      document.getElementById('label-form').reset();
      renderStockBreakdownBanner('label-form', it, openingQty);

      await populateLabelFormSelects(it.product_id, it.item_size, it.item_subtype);

      const styleInput = document.getElementById('label-type-input');
      if (styleInput) styleInput.value = it.description || '';
      
      const descField = document.querySelector('#label-form [name="description"]');
      if (descField) descField.value = it.description || '';
      
      const qtyField = document.querySelector('#label-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#label-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#label-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('label-modal');
    } else {
      goToInventoryStep('other', 1);
      document.getElementById('other-modal-title').textContent = 'Edit Other Item';
      UTILS.populateForm('other-form', it);
      renderStockBreakdownBanner('other-form', it, openingQty);
      const typeSelect = document.querySelector('#other-form [name="item_type"]');
      if (typeSelect) typeSelect.value = type;
      
      const qtyField = document.querySelector('#other-form [name="opening_qty"]');
      if (qtyField) qtyField.value = openingQty;
      const costField = document.querySelector('#other-form [name="opening_cost"]');
      if (costField) costField.value = openingCost;
      const batchField = document.querySelector('#other-form [name="opening_batch_no"]');
      if (batchField) batchField.value = openingBatchNo;
      
      APP.openModal('other-modal');
    }
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load item data: ' + err.message, 'error');
  }
}

let isSavingInventoryItem = false;

async function saveInventoryItemAPI(payload) {
  if (isSavingInventoryItem) {
    console.warn('[Inventory] Duplicate save submission blocked');
    return { success: false, duplicate: true };
  }
  isSavingInventoryItem = true;
  try {
    const openingQty = parseFloat(payload.opening_qty) || 0;
    const openingCost = parseFloat(payload.opening_cost) || 0;
    let openingBatchNo = payload.opening_batch_no || '';
    if (!openingBatchNo && openingQty > 0) {
      openingBatchNo = await getNextOpeningBatchNo();
    }
    
    // Construct sanitized database payload for inventory_items table
    const dbPayload = {
      name: payload.name,
      category: payload.category || null,
      unit: payload.unit || 'Nos',
      reorder_level: parseFloat(payload.reorder_level || 0),
      product_id: payload.product_id ? parseInt(payload.product_id, 10) : null,
      item_subtype: payload.category === 'Labels' 
        ? (payload.item_subtype || '').trim().toUpperCase() 
        : (payload.item_subtype ? UTILS.formatCategoryLabel(payload.item_subtype) : null),
      item_size: payload.item_size || null,
      description: payload.description || null
    };

    let savedId = editingItemId;

    if (editingItemId) {
      const { error } = await window.dbClient.from('inventory_items').update(dbPayload).eq('id', editingItemId);
      if (error) throw error;
      
      // Update or Insert the opening batch in stock_batches
      const { data: batches } = await window.dbClient.from('stock_batches')
        .select('id, initial_qty').eq('item_id', editingItemId).eq('item_type', 'Inventory')
        .order('id', { ascending: true }).limit(1);
        
      if (batches && batches.length > 0) {
        await window.dbClient.from('stock_batches').update({
           initial_qty: openingQty,
           current_qty: openingQty,
           purchase_price: openingCost,
           batch_no: openingBatchNo || 'OPEN-01',
           unit: dbPayload.unit || ''
        }).eq('id', batches[0].id);
      } else if (openingQty > 0) {
        const batchPayload = {
          item_id: savedId,
          item_name: dbPayload.name,
          item_type: 'Inventory',
          batch_no: openingBatchNo || 'OPEN-01',
          purchase_price: openingCost,
          initial_qty: openingQty,
          current_qty: openingQty,
          unit: dbPayload.unit || ''
        };
        const stampedBatch = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(batchPayload) : batchPayload;
        await window.dbClient.from('stock_batches').insert([stampedBatch]);
      }
    } else {
      // Creating NEW item in inventory_items
      const stampedDbPayload = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(dbPayload) : dbPayload;
      const { data, error } = await window.dbClient.from('inventory_items').insert([stampedDbPayload]).select();
      if (error) throw error;
      savedId = data[0].id;
      
      if (openingQty > 0) {
        const batchPayload = {
          item_id: savedId,
          item_name: dbPayload.name,
          item_type: 'Inventory',
          batch_no: openingBatchNo || 'OPEN-01',
          purchase_price: openingCost,
          initial_qty: openingQty,
          current_qty: openingQty,
          unit: dbPayload.unit || ''
        };
        const stampedBatch = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(batchPayload) : batchPayload;
        await window.dbClient.from('stock_batches').insert([stampedBatch]);
      }
    }

    if (savedId) {
      await window.INVENTORY_SERVICE.syncItemStock(savedId);
    }

    return { success: true };
  } catch (err) {
    throw err;
  } finally {
    isSavingInventoryItem = false;
  }
}

async function saveTechnicalItem() {
  const d = UTILS.getFormData('technical-form');
  if (!d.name) { APP.showToast('Technical name is required', 'error'); return; }
  try {
    const payload = {
      name: d.name,
      category: 'Technical',
      item_subtype: d.item_subtype,
      unit: d.unit || 'Nos',
      description: d.description,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Technical updated!' : 'Technical added!', 'success');
    APP.closeModal('technical-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveTechnicalItem failed:', err);
    APP.showToast('Error saving technical item: ' + err.message, 'error');
  }
}

async function saveBottleItem() {
  const d = UTILS.getFormData('bottle-form');
  if (!d.bottle_type || !d.bottle_size) { APP.showToast('Bottle type and size are required', 'error'); return; }
  
  const cleanType = (d.bottle_type || '').trim().replace(/\s*bottle$/i, '');
  const cleanSize = (d.bottle_size || '').trim().replace(/^bottle\s*/i, '');
  const name = `${cleanType} Bottle ${cleanSize}`.replace(/\s*bottle\s+bottle\s*/gi, ' Bottle ').trim();
  const unit = 'Nos';
  
  try {
    const payload = {
      name,
      category: 'Bottles',
      unit,
      description: d.description,
      item_subtype: d.bottle_type,
      item_size: d.bottle_size,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Bottle updated!' : 'Bottle added!', 'success');
    APP.closeModal('bottle-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveBottleItem failed:', err);
    APP.showToast('Error saving bottle: ' + err.message, 'error');
  }
}

async function saveBoxItem() {
  const d = UTILS.getFormData('box-form');
  if (!d.box_type || !d.box_size) { APP.showToast('Box type and size are required', 'error'); return; }
  
  const cleanType = (d.box_type || '').trim().replace(/\s*box$/i, '');
  const cleanSize = (d.box_size || '').trim().replace(/^box\s*/i, '');
  const name = `${cleanType} Box ${cleanSize}`.replace(/\s*box\s+box\s*/gi, ' Box ').trim();
  const unit = 'Nos';
  
  try {
    const payload = {
      name,
      category: 'Boxes',
      unit,
      description: d.description,
      item_subtype: d.box_type,
      item_size: d.box_size,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Box updated!' : 'Box added!', 'success');
    APP.closeModal('box-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveBoxItem failed:', err);
    APP.showToast('Error saving box: ' + err.message, 'error');
  }
}

async function saveLabelItem() {
  const d = UTILS.getFormData('label-form');
  const productId = d.label_product_id;
  const size = d.label_size;
  let owner = (d.label_owner || 'E').trim().toUpperCase();
  if (owner === 'ACC' || owner === 'AAC') owner = 'E';

  if (!productId) {
    APP.showToast('Please select a target product for this label.', 'error');
    return;
  }
  if (!size) {
    APP.showToast('Please select packaging size for this label.', 'error');
    return;
  }
  if (!owner) {
    APP.showToast('Please select label owner (E or GAS).', 'error');
    return;
  }

  const prod = (catalogProductsCache || []).find(p => p.id == productId);
  const prodName = prod ? prod.name : 'Product';
  const cleanSize = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units) 
    ? window.INVENTORY_CORE.Units.cleanSizeLabel(size, prod?.unit) 
    : size;

  const labelName = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units && window.INVENTORY_CORE.Units.formatLabelName)
    ? window.INVENTORY_CORE.Units.formatLabelName(prodName, cleanSize, owner)
    : `${prodName} ${cleanSize} Label [${owner}]`;

  // Pre-validate duplicate label in inventory
  const dup = (allInventory || []).find(it => 
    it.id !== editingItemId &&
    it.category === 'Labels' &&
    it.product_id == productId &&
    ((it.item_size || '').toLowerCase() === cleanSize.toLowerCase() || (window.INVENTORY_CORE && window.INVENTORY_CORE.Units && window.INVENTORY_CORE.Units.sizesMatch(it.item_size, cleanSize))) &&
    (it.item_subtype || '').toUpperCase() === owner
  );

  if (dup) {
    APP.showToast(`A label for ${prodName} (${cleanSize}) owned by ${owner} already exists in inventory (Item #${dup.id}).`, 'error');
    return;
  }

  const unit = 'Nos';
  
  try {
    const payload = {
      name: labelName,
      category: 'Labels',
      unit,
      product_id: parseInt(productId, 10),
      item_size: cleanSize,
      item_subtype: owner,
      description: d.description || `Label for ${prodName} (${cleanSize}) - Brand: ${owner}${d.label_type ? ' (' + d.label_type + ')' : ''}`,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Label updated!' : 'Label added!', 'success');
    APP.closeModal('label-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveLabelItem failed:', err);
    APP.showToast('Error saving label: ' + err.message, 'error');
  }
}

async function saveOtherItem() {
  const d = UTILS.getFormData('other-form');
  if (!d.name || !d.unit) { APP.showToast('Item name and unit are required', 'error'); return; }
  try {
    const payload = {
      name: d.name,
      category: 'Others',
      unit: d.unit || 'Nos',
      description: d.description,
      opening_qty: d.opening_qty,
      opening_cost: d.opening_cost,
      opening_batch_no: d.opening_batch_no
    };
    await saveInventoryItemAPI(payload);
    APP.showToast(editingItemId ? 'Item updated!' : 'Item added!', 'success');
    APP.closeModal('other-modal');
    setTimeout(() => loadInventory(), 100);
  } catch (err) {
    console.error('saveOtherItem failed:', err);
    APP.showToast('Error saving item: ' + err.message, 'error');
  }
}

/* ─── MASTER OPTIONS LOGIC ─── */
function openInventoryOptionManager() {
  const cat = activeTab;
  if (cat === 'Technical') {
    renderTechnicalUnits();
    APP.openModal('technical-unit-manager-modal');
  } else if (cat === 'Bottles') {
    renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
    APP.openModal('bottle-manager-modal');
  } else if (cat === 'Boxes') {
    renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
    APP.openModal('box-manager-modal');
  } else if (cat === 'Labels') {
    renderGroupedOptions('label_option', 'label-options-groups', 'editLabelOption', 'deleteMasterOption');
    APP.openModal('label-manager-modal');
  } else {
    APP.showToast('Please select Technical, Bottles, Boxes, or Labels tab to manage options.', 'info');
  }
}

async function renderTechnicalUnits() {
  const el = document.getElementById('technical-unit-groups');
  if (!el) return;
  try {
    const { data: all, error } = await window.dbClient.from('master_options').select('*');
    if (error) throw error;
    const opts = (all || []).filter(o => o.category === 'technical_unit').sort((a,b) => a.value.localeCompare(b.value));
    
    let html = `<div style="display:flex;flex-direction:column;gap:8px;">`;
    opts.forEach(o => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
        <div style="font-size:14px;font-weight:700">${o.value}</div>
        <div style="display:flex;gap:12px;">
          <button class="action-btn edit" onclick="editTechnicalUnit(${o.id}, '${o.value}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" onclick="deleteMasterOption(${o.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div style="color:var(--danger)">Failed to load units</div>';
  }
}

async function renderGroupedOptions(category, containerId, editFuncStr, delFuncStr) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const { data: all, error } = await window.dbClient.from('master_options').select('*');
    if (error) throw error;
    const opts = (all || []).filter(o => o.category === category).sort((a,b) => (a.parent_value || '').localeCompare(b.parent_value || ''));
    
    const grouped = {};
    opts.forEach(o => {
      if (!grouped[o.parent_value]) grouped[o.parent_value] = [];
      grouped[o.parent_value].push(o);
    });
    
    let html = `<div style="display:flex;flex-direction:column;gap:16px;">`;
    for (const [parent, items] of Object.entries(grouped)) {
      html += `<div style="border:1px solid var(--border); border-radius:var(--radius); overflow:hidden;">`;
      html += `<div style="padding:16px 20px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border); font-size:14px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">${parent}</div>`;
      html += `<div style="padding:16px; display:flex; flex-direction:column; gap:8px;">`;
      items.forEach(o => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);">
          <div><div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:4px;letter-spacing:0.05em;">SIZE</div><div style="font-size:16px;font-weight:700">${o.value}</div></div>
          <div style="display:flex;gap:12px;">
            <button class="action-btn edit" onclick="${editFuncStr}(${o.id}, '${o.parent_value.replace(/'/g, "\\'")}', '${o.value.replace(/'/g, "\\'")}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="action-btn delete" onclick="${delFuncStr}(${o.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = '<div style="color:var(--danger)">Failed to load grouped options</div>';
  }
}

// Technical Unit Manager
async function saveTechnicalUnit() {
  const id = document.getElementById('technical-unit-id').value;
  const unit = document.getElementById('technical-unit-input').value.trim();
  if (!unit) { APP.showToast('Unit is required', 'error'); return; }
  
  try {
    const payload = { category: 'technical_unit', value: unit };
    if (id) {
      const { error } = await window.dbClient.from('master_options').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window.dbClient.from('master_options').insert([payload]);
      if (error) throw error;
    }
    
    APP.showToast('Unit saved', 'success');
    resetTechnicalUnitManagerForm();
    await renderTechnicalUnits();
    await loadMasterOptions();
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to save unit: ' + err.message, 'error');
  }
}

function editTechnicalUnit(id, value) {
  document.getElementById('technical-unit-id').value = id;
  document.getElementById('technical-unit-input').value = value;
}

function resetTechnicalUnitManagerForm() {
  document.getElementById('technical-unit-manager-form').reset();
  document.getElementById('technical-unit-id').value = '';
}

// Bottle Option Manager
async function saveBottleOption() {
  const id = document.getElementById('bottle-option-id').value;
  const type = document.getElementById('bottle-type-input').value.trim();
  const size = document.getElementById('bottle-size-input').value.trim();
  
  if (!type || !size) { APP.showToast('Type and size are required', 'error'); return; }
  
  try {
    const payload = { category: 'bottle_option', parent_value: type, value: size };
    if (id) {
      const { error } = await window.dbClient.from('master_options').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window.dbClient.from('master_options').insert([payload]);
      if (error) throw error;
    }
    
    APP.showToast(id ? 'Option updated successfully' : 'Option added successfully', 'success');
    resetBottleManagerForm();
    await renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
    await loadMasterOptions();
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to save bottle option: ' + err.message, 'error');
  }
}

function resetBottleManagerForm() {
  document.getElementById('bottle-manager-form').reset();
  document.getElementById('bottle-option-id').value = '';
}

function editBottleOption(id) {
  const opt = masterCache.bottles.find(o => o.id == id);
  if (!opt) return;
  document.getElementById('bottle-option-id').value = opt.id;
  document.getElementById('bottle-type-input').value = opt.parent_value || '';
  document.getElementById('bottle-size-input').value = opt.value || '';
}

// Box Option Manager
async function saveBoxOption() {
  const id = document.getElementById('box-option-id').value;
  const type = document.getElementById('box-type-input').value.trim();
  const size = document.getElementById('box-size-input').value.trim();
  if (!type || !size) { APP.showToast('Type and size are required', 'warning'); return; }
  
  const payload = { category: 'box_option', parent_value: type, value: size };
  try {
    if (id) {
      const { error } = await window.dbClient.from('master_options').update(payload).eq('id', id);
      if (error) throw error;
      APP.showToast('Box option updated', 'success');
    } else {
      const { error } = await window.dbClient.from('master_options').insert([payload]);
      if (error) throw error;
      APP.showToast('Box option added', 'success');
    }
    resetBoxManagerForm();
    await loadMasterOptions();
    renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
  } catch(err) {
    console.error(err);
    APP.showToast('Failed to save box option', 'error');
  }
}

function resetBoxManagerForm() {
  document.getElementById('box-manager-form').reset();
  document.getElementById('box-option-id').value = '';
}

function editBoxOption(id) {
  const opt = masterCache.boxes.find(o => o.id == id);
  if (!opt) return;
  document.getElementById('box-option-id').value = opt.id;
  document.getElementById('box-type-input').value = opt.parent_value || '';
  document.getElementById('box-size-input').value = opt.value || '';
}

// Label Option Manager
async function saveLabelOption() {
  const id = document.getElementById('label-option-id').value;
  const type = document.getElementById('label-type-input').value.trim();
  const size = document.getElementById('label-size-input').value.trim();
  if (!type || !size) { APP.showToast('Type and size are required', 'warning'); return; }
  
  const payload = { category: 'label_option', parent_value: type, value: size };
  try {
    if (id) {
      const { error } = await window.dbClient.from('master_options').update(payload).eq('id', id);
      if (error) throw error;
      APP.showToast('Label option updated', 'success');
    } else {
      const { error } = await window.dbClient.from('master_options').insert([payload]);
      if (error) throw error;
      APP.showToast('Label option added', 'success');
    }
    resetLabelManagerForm();
    await loadMasterOptions();
    renderGroupedOptions('label_option', 'label-options-groups', 'editLabelOption', 'deleteMasterOption');
  } catch(err) {
    console.error(err);
    APP.showToast('Failed to save label option', 'error');
  }
}

function resetLabelManagerForm() {
  const form = document.getElementById('label-manager-form');
  if(form) form.reset();
  const idInput = document.getElementById('label-option-id');
  if(idInput) idInput.value = '';
}

function editLabelOption(id) {
  const opt = masterCache.labels.find(o => o.id == id);
  if (!opt) return;
  document.getElementById('label-option-id').value = opt.id;
  document.getElementById('label-type-input').value = opt.parent_value || '';
  document.getElementById('label-size-input').value = opt.value || '';
}

async function deleteMasterOption(id) {
  APP.showConfirm('Are you sure you want to delete this option? This cannot be undone.', async () => {
    try {
      const { error } = await window.dbClient.from('master_options').delete().eq('id', id);
      if (error) throw error;
      APP.showToast('Option deleted successfully', 'success');
      
      const cat = activeTab;
      if (cat === 'Technical') await renderTechnicalUnits();
      if (cat === 'Bottles') await renderGroupedOptions('bottle_option', 'bottle-options-groups', 'editBottleOption', 'deleteMasterOption');
      if (cat === 'Boxes') await renderGroupedOptions('box_option', 'box-options-groups', 'editBoxOption', 'deleteMasterOption');
      if (cat === 'Labels') await renderGroupedOptions('label_option', 'label-options-groups', 'editLabelOption', 'deleteMasterOption');
      
      await loadMasterOptions();
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete option: ' + err.message, 'error');
    }
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => { 
  btn.addEventListener('click', () => { 
    document.querySelector('.tab-btn.active').classList.remove('active'); 
    btn.classList.add('active'); 
    activeTab = btn.dataset.tab; 
    
    const manageBtn = document.getElementById('manage-inventory-options-btn');
    if (manageBtn) {
      manageBtn.style.display = 'inline-flex';
    }

    const techFilterWrap = document.getElementById('tech-filter-wrap');
    const techFilter = document.getElementById('tech-filter-select');
    if (techFilterWrap) {
      techFilterWrap.style.display = (activeTab === 'Technical') ? 'inline-block' : 'none';
      if (activeTab !== 'Technical' && techFilter) techFilter.value = '';
    } else if (techFilter) {
      techFilter.style.display = (activeTab === 'Technical') ? 'inline-block' : 'none';
      if (activeTab !== 'Technical') techFilter.value = '';
    }

    renderTable(allInventory); 
  }); 
});

const debouncedInventorySearch = UTILS.debounce(() => renderTable(allInventory), 250);
document.getElementById('search-input')?.addEventListener('input', debouncedInventorySearch);
document.getElementById('tech-filter-select')?.addEventListener('change', () => renderTable(allInventory));

const initialTechFilterWrap = document.getElementById('tech-filter-wrap');
if (initialTechFilterWrap) {
  initialTechFilterWrap.style.display = (activeTab === 'Technical') ? 'inline-block' : 'none';
}

// ============================================================================
// STOCK RECONCILIATION & DIAGNOSTICS UI
// ============================================================================
async function openDiagnosticsModal() {
  APP.openModal('diagnostics-modal');
  const content = document.getElementById('diagnostics-content');
  const actions = document.getElementById('diagnostics-actions');
  if (!content) return;

  content.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto 12px"></div>Running authoritative diagnostics audit...</div>`;
  if (actions) actions.innerHTML = '';

  try {
    if (!window.INVENTORY_CORE || !window.INVENTORY_CORE.Service) {
      throw new Error('Authoritative Inventory Engine (INVENTORY_CORE) not loaded');
    }

    const report = await window.INVENTORY_CORE.Service.runDiagnostics();

    let html = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
        <div style="background:var(--surface,#1e293b);padding:14px;border-radius:10px;border:1px solid var(--border,#334155);text-align:center;">
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);text-transform:uppercase;font-weight:600;">Total Items</div>
          <div style="font-size:24px;font-weight:800;color:var(--text,#f8fafc);margin-top:4px;">${report.totalItems}</div>
        </div>
        <div style="background:var(--surface,#1e293b);padding:14px;border-radius:10px;border:1px solid var(--border,#334155);text-align:center;">
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);text-transform:uppercase;font-weight:600;">Warehouse Batches</div>
          <div style="font-size:24px;font-weight:800;color:var(--text,#f8fafc);margin-top:4px;">${report.totalBatches}</div>
        </div>
        <div style="background:var(--surface,#1e293b);padding:14px;border-radius:10px;border:1px solid var(--border,#334155);text-align:center;">
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);text-transform:uppercase;font-weight:600;">Stock Mismatches</div>
          <div style="font-size:24px;font-weight:800;color:${report.discrepanciesCount > 0 ? '#ef4444' : '#10b981'};margin-top:4px;">${report.discrepanciesCount}</div>
        </div>
        <div style="background:var(--surface,#1e293b);padding:14px;border-radius:10px;border:1px solid var(--border,#334155);text-align:center;">
          <div style="font-size:12px;color:var(--text-muted,#94a3b8);text-transform:uppercase;font-weight:600;">Negative Batches</div>
          <div style="font-size:24px;font-weight:800;color:${report.negativeBatchesCount > 0 ? '#ef4444' : '#10b981'};margin-top:4px;">${report.negativeBatchesCount}</div>
        </div>
      </div>
    `;

    if (report.status === 'HEALTHY') {
      html += `
        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:20px;text-align:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width:40px;height:40px;margin:0 auto 8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h3 style="color:#10b981;font-size:17px;font-weight:700;margin-bottom:4px;">All Stock Matches Perfectly (0 Mismatches)</h3>
          <p style="color:var(--text-muted,#94a3b8);font-size:13px;max-width:540px;margin:0 auto;">The total stock shown on all items matches the physical sum of your warehouse batches with 100% accuracy.</p>
        </div>
      `;
    } else {
      html += `
        <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:16px;margin-bottom:16px;">
          <h4 style="color:#ef4444;font-size:15px;font-weight:700;margin-bottom:4px;">Stock Mismatch Detected</h4>
          <p style="color:var(--text-muted,#94a3b8);font-size:13px;">The stock number displayed on your inventory page is slightly different from the actual sum of batches in your warehouse. Click <strong>"Fix & Sync Stock"</strong> below to automatically correct it.</p>
        </div>
      `;

      if (report.discrepancies.length > 0) {
        html += `
          <div class="table-scroll-wrap" style="border:1px solid var(--border,#334155);border-radius:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;margin-bottom:16px;">
            <table class="data-table" style="margin:0;font-size:13px;width:100%;min-width:520px;">
              <thead>
                <tr>
                  <th style="white-space:nowrap;">Item Name</th>
                  <th style="white-space:nowrap;">Category</th>
                  <th style="white-space:nowrap;">Display Stock</th>
                  <th style="white-space:nowrap;">Batch Total</th>
                  <th style="white-space:nowrap;">Difference</th>
                </tr>
              </thead>
              <tbody>
                ${report.discrepancies.map(d => `
                  <tr>
                    <td style="font-weight:600;">${d.name}</td>
                    <td><span class="badge badge-gray">${d.category}</span></td>
                    <td>${d.cachedStock.toFixed(2)} ${d.unit}</td>
                    <td style="color:#10b981;font-weight:700;">${d.calculatedStock.toFixed(2)} ${d.unit}</td>
                    <td style="color:${d.variance < 0 ? '#ef4444' : '#f59e0b'};font-weight:600;">${d.variance > 0 ? '+' : ''}${d.variance.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      if (actions) {
        actions.innerHTML = `
          <button class="btn btn-primary" id="run-reconcile-btn" onclick="executeAutoReconcile()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;margin-right:6px;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Fix & Sync Stock
          </button>
        `;
      }
    }

    content.innerHTML = html;
  } catch (err) {
    console.error('Diagnostics error:', err);
    content.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">Failed to run diagnostics: ${err.message}</div>`;
  }
}

async function executeAutoReconcile() {
  const btn = document.getElementById('run-reconcile-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing stock...';
  }

  try {
    const res = await window.INVENTORY_CORE.Service.repairDiscrepancies();
    APP.showToast(`Stock synchronized successfully! Corrected ${res.repairedItems} items.`, 'success');
    await openDiagnosticsModal();
    await loadInventory();
  } catch (err) {
    console.error('executeAutoReconcile error:', err);
    APP.showToast('Sync failed: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Fix & Sync Stock';
    }
  }
}

loadInventory();

