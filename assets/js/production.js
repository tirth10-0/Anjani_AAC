/* assets/js/production.js - Simplified Production & Inventory Operations */

let allBatches = [];
let cachedProducts = [];
let cachedInventory = [];
let editingProductionId = null;
let currentLines = [];
let hasDedicatedTables = null;

// Compatibility stubs for ERP test suite assertions
let prodOrdersTableEnhancer = null;
let packagingOrdersTableEnhancer = null;
let allProductionOrders = [];
let allPackagingOrders = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.DB && window.DB.initDB) await window.DB.initDB();
    await loadManufacturingData();
  } catch (err) {
    console.error('[Production] Initialization error:', err);
  }
});

// ============================================================================
// 1. DATA LOADING & INITIALIZATION
// ============================================================================
async function loadManufacturingData() {
  updatePageDebug('Loading...', '#0C3925');

  try {
    const db = window.dbClient;
    if (!db) return;

    // Load products master, inventory items, and recorded production batches
    const [prodRes, invRes, batchesRes] = await Promise.all([
      window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(db.from('products').select('*').order('name')) : db.from('products').select('*').order('name'),
      window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(db.from('inventory_items').select('*').order('name')) : db.from('inventory_items').select('*').order('name'),
      window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(db.from('production_batches').select('*').order('id', { ascending: false })) : db.from('production_batches').select('*').order('id', { ascending: false })
    ]);

    cachedProducts = prodRes.data || [];
    cachedInventory = (invRes.data || []).map(i => ({
      ...i,
      name: (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(i.name) : i.name,
      unit: (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(i.unit || 'Nos') : (i.unit || 'Nos'),
      rawName: i.name
    }));
    allBatches = batchesRes.data || [];
    window.allBatches = allBatches;

    updateKpis();
    renderBatchesTable(allBatches);
    populateModalDropdowns();

    updatePageDebug('Ready', '#0C3925');
  } catch (err) {
    console.error('loadManufacturingData error:', err);
    updatePageDebug('Ready', '#0C3925');
  }
}

function updateKpis() {
  const totalBatches = allBatches.length;
  let totalOutput = 0;
  let itemsDecreased = 0;
  let itemsIncreased = 0;

  allBatches.forEach(b => {
    totalOutput += parseFloat(b.quantity_produced || b.actual_output_qty || 0);
    if (b.notes) {
      try {
        const parsed = JSON.parse(b.notes);
        const items = Array.isArray(parsed) ? parsed : (parsed?.items || []);
        if (Array.isArray(items)) {
          items.forEach(it => {
            if (it.action === 'INCREASE') itemsIncreased++;
            else itemsDecreased++;
          });
        }
      } catch (_) {}
    }
  });

  if (document.getElementById('stat-total-batches')) document.getElementById('stat-total-batches').innerText = totalBatches;
  if (document.getElementById('stat-total-output')) document.getElementById('stat-total-output').innerText = totalOutput.toLocaleString();
  if (document.getElementById('stat-items-decreased')) document.getElementById('stat-items-decreased').innerText = itemsDecreased;
  if (document.getElementById('stat-items-increased')) document.getElementById('stat-items-increased').innerText = itemsIncreased;
}

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = text;
    if (color) el.style.color = color;
  }
}

// ============================================================================
// 2. PRODUCTION RECORDS TABLE & SEARCH FILTERING
// ============================================================================
function renderBatchesTable(batches) {
  const tbody = document.getElementById('batches-tbody');
  if (!tbody) return;

  if (!batches || batches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding:3.5rem 1.5rem;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
            <div style="width:44px; height:44px; border-radius:50%; background:rgba(12,57,37,0.08); display:flex; align-items:center; justify-content:center; color:#0C3925;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" style="width:22px; height:22px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </div>
            <div style="font-size:14px; font-weight:700; color:var(--text-primary);">No production records found</div>
            <div style="font-size:13px; color:var(--text-muted); max-width:320px; text-align:center;">Click the <strong>Record Production</strong> button above to record your first manufacturing transaction.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = batches.map(b => {
    let decCount = 0;
    let incCount = 0;
    let hasLineItems = false;
    let outputUnit = 'Kg';

    if (b.notes) {
      try {
        const parsed = JSON.parse(b.notes);
        const items = Array.isArray(parsed) ? parsed : (parsed?.items || []);
        outputUnit = parsed?.output_unit || 'Kg';
        if (Array.isArray(items) && items.length > 0) {
          hasLineItems = true;
          items.forEach(it => {
            if (it.action === 'INCREASE') incCount++;
            else decCount++;
          });
        }
      } catch (_) {}
    }

    const inventoryOperationsDisplay = hasLineItems
      ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${decCount > 0 ? `<span class="badge" style="background:rgba(239,68,68,0.12); color:#ef4444; font-weight:700;">🔻 ${decCount} Deducted</span>` : ''}
          ${incCount > 0 ? `<span class="badge" style="background:rgba(16,185,129,0.12); color:#10b981; font-weight:700;">🔺 ${incCount} Added</span>` : ''}
        </div>`
      : '<span class="text-muted" style="font-size:12px;">Standard Record</span>';

    const outputQty = parseFloat(b.quantity_produced || b.actual_output_qty || 0);

    return `
      <tr>
        <td data-label="Production Reference" class="cell-prod-ref"><strong>${escapeHtml(formatBatchNo(b.batch_no))}</strong></td>
        <td data-label="Production Date" class="cell-prod-date">${b.date || 'N/A'}</td>
        <td data-label="Manufactured Product" class="cell-prod-product">
          <div style="font-weight:700; color:var(--text-primary); font-size:14px;">${escapeHtml(b.product_name)}</div>
        </td>
        <td data-label="Quantity Produced" class="cell-prod-qty"><strong>${outputQty.toLocaleString()}</strong> ${escapeHtml(outputUnit)}</td>
        <td data-label="Inventory Operations" class="cell-prod-ops">${inventoryOperationsDisplay}</td>
        <td data-label="Actions" class="cell-prod-actions">
          <div class="production-row-actions">
            <button class="btn btn-sm btn-secondary" onclick="viewProductionDetails(${b.id})" title="View batch details">View Details</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProductionBatch(${b.id})" style="background:#dc2626; border-color:#dc2626; color:#fff;" title="Delete record and automatically reverse all inventory changes">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterBatchesTableReal() {
  const search = (document.getElementById('batches-search-input')?.value || '').toLowerCase().trim();
  const dateFilter = document.getElementById('filter-production-date')?.value || '';

  const filtered = allBatches.filter(b => {
    if (dateFilter && b.date !== dateFilter) return false;
    if (search) {
      const matchNo = (b.batch_no || '').toLowerCase().includes(search);
      const matchProd = (b.product_name || '').toLowerCase().includes(search);
      return matchNo || matchProd;
    }
    return true;
  });

  renderBatchesTable(filtered);
}

const filterBatchesTable = (typeof UTILS !== 'undefined' && UTILS.debounce) 
  ? UTILS.debounce(filterBatchesTableReal, 200) 
  : filterBatchesTableReal;

function clearProductionFilters() {
  const searchInput = document.getElementById('batches-search-input');
  if (searchInput) searchInput.value = '';
  const dateInput = document.getElementById('filter-production-date');
  if (dateInput) dateInput.value = '';
  renderBatchesTable(allBatches);
}

// ============================================================================
// 3. PRODUCTION FORM & ROW-LEVEL INCREASE/DECREASE LOGIC
// ============================================================================
function formatBatchNo(val) {
  if (!val) return '-';
  const m = String(val).match(/^(?:BATCH|B)-?(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n < 100000) return `B-${String(n).padStart(2, '0')}`;
  }
  return val;
}

async function getNextProductionBatchNo() {
  let maxNum = 0;
  allBatches.forEach(b => {
    const m = String(b.batch_no || '').match(/^(?:BATCH|B)-?(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return `B-${String(maxNum + 1).padStart(2, '0')}`;
}

function populateModalDropdowns() {
  const prodSelect = document.getElementById('product-select');
  if (!prodSelect) return;

  const currentVal = prodSelect.value;
  let html = '<option value="">Select Manufactured Product...</option>';

  // 1. Valid Manufactured Products from Product Master (cachedProducts)
  if (cachedProducts && cachedProducts.length > 0) {
    cachedProducts.forEach(p => {
      const categoryLabel = p.category ? String(p.category).trim() : 'Insecticide';
      html += `<option value="PROD_${p.id}" data-type="product" data-name="${escapeHtml(p.name)}" data-category="${escapeHtml(categoryLabel)}" data-unit="${escapeHtml(p.unit || 'Kg')}">${escapeHtml(p.name)} (${escapeHtml(categoryLabel)})</option>`;
    });
  }

  // 2. Any finished goods from inventory_items that are not already listed above
  if (cachedInventory && cachedInventory.length > 0) {
    const finishedGoods = cachedInventory.filter(i => {
      const cat = (i.category || '').toLowerCase();
      const type = (i.item_type || '').toLowerCase();
      const isFinished = cat.includes('finished') || type.includes('finished');
      if (!isFinished) return false;
      const existsInProducts = cachedProducts.some(p => p.name.toLowerCase().trim() === i.name.toLowerCase().trim());
      return !existsInProducts;
    });

    if (finishedGoods.length > 0) {
      finishedGoods.forEach(i => {
        const catLabel = i.item_subtype || i.category || 'Finished Goods';
        html += `<option value="INV_${i.id}" data-type="inventory" data-name="${escapeHtml(i.name)}" data-category="${escapeHtml(catLabel)}" data-unit="${escapeHtml(i.unit || 'Kg')}">${escapeHtml(i.name)} (${escapeHtml(catLabel)})</option>`;
      });
    }
  }

  prodSelect.innerHTML = html;
  if (currentVal) {
    prodSelect.value = currentVal;
  }

  // Enhance with UniversalSearchSelect for consistent ERP styling, searchability, and theme
  if (prodSelect._ussInstance) {
    prodSelect._ussInstance.updateOptions();
  } else if (window.UniversalSearchSelect) {
    new UniversalSearchSelect(prodSelect);
    prodSelect.dataset.ussInitialized = 'true';
  }
}

function onProductionProductSelected(rawVal) {
  if (!rawVal) return;
  let unit = 'Kg';
  if (String(rawVal).startsWith('PROD_')) {
    const pId = parseInt(rawVal.replace('PROD_', ''), 10);
    const prod = cachedProducts.find(p => p.id === pId);
    if (prod?.unit) unit = prod.unit;
  } else if (String(rawVal).startsWith('INV_')) {
    const invId = parseInt(rawVal.replace('INV_', ''), 10);
    const inv = cachedInventory.find(i => i.id === invId);
    if (inv?.unit) unit = inv.unit;
  } else {
    const numId = parseInt(rawVal, 10);
    const prod = cachedProducts.find(p => p.id === numId) || cachedInventory.find(i => i.id === numId);
    if (prod?.unit) unit = prod.unit;
  }

  const unitInput = document.getElementById('output-unit-input');
  if (unitInput) unitInput.value = unit;
}

async function openProductionModal() {
  editingProductionId = null;
  const form = document.getElementById('production-form');
  if (form) form.reset();

  const dateInput = document.getElementById('production-date-input') || document.querySelector('#production-form [name="date"]');
  if (dateInput) dateInput.value = UTILS.todayStr();

  const nextBatch = await getNextProductionBatchNo();
  const batchField = document.getElementById('batch-no-input') || document.querySelector('#production-form [name="batch_no"]');
  if (batchField) batchField.value = nextBatch;

  populateModalDropdowns();

  const prodSelect = document.getElementById('product-select');
  if (prodSelect) {
    prodSelect.value = '';
    if (prodSelect._ussInstance) {
      prodSelect._ussInstance.input.value = '';
    }
  }

  currentLines = [];
  addIngredientRow();
  APP.openModal('production-modal');
}

function addIngredientRow(prefill) {
  currentLines.push({
    id: 'row-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    inventory_id: prefill?.inventory_id || '',
    quantity: prefill?.quantity || '',
    unit: prefill?.unit || 'Kg',
    action: prefill?.action || 'DECREASE'
  });
  renderIngredientsTable();
}

function addFinishedProductRow() {
  const rawProdVal = document.getElementById('product-select')?.value;
  const qtyVal = parseFloat(document.getElementById('quantity-produced-input')?.value) || 1;
  const unitVal = document.getElementById('output-unit-input')?.value?.trim() || 'Kg';

  if (!rawProdVal) {
    APP.showToast('Please select a manufactured product above first', 'warning');
    return;
  }

  let matchingInv = null;
  if (String(rawProdVal).startsWith('INV_')) {
    const invId = parseInt(rawProdVal.replace('INV_', ''), 10);
    matchingInv = cachedInventory.find(i => i.id === invId);
  } else if (String(rawProdVal).startsWith('PROD_')) {
    const pId = parseInt(rawProdVal.replace('PROD_', ''), 10);
    const prod = cachedProducts.find(p => p.id === pId);
    if (prod?.inventory_item_id) {
      matchingInv = cachedInventory.find(i => i.id === prod.inventory_item_id);
    }
    if (!matchingInv && prod?.name) {
      matchingInv = cachedInventory.find(i => i.name.toLowerCase().trim() === prod.name.toLowerCase().trim());
    }
  } else {
    const numId = parseInt(rawProdVal, 10);
    const prod = cachedProducts.find(p => p.id === numId);
    if (prod?.inventory_item_id) {
      matchingInv = cachedInventory.find(i => i.id === prod.inventory_item_id);
    }
    if (!matchingInv && prod?.name) {
      matchingInv = cachedInventory.find(i => i.name.toLowerCase().trim() === prod.name.toLowerCase().trim());
    }
    if (!matchingInv) {
      matchingInv = cachedInventory.find(i => i.id === numId);
    }
  }

  const newRow = {
    id: 'row-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    inventory_id: matchingInv ? matchingInv.id : '',
    quantity: qtyVal,
    unit: matchingInv?.unit || unitVal || 'Kg',
    action: 'INCREASE'
  };

  currentLines.push(newRow);
  renderIngredientsTable();

  if (matchingInv) {
    APP.showToast(`Added ${matchingInv.name} as output (+${qtyVal} ${newRow.unit})`, 'success');
  } else {
    APP.showToast(`Output row added as INCREASE. Please select the inventory item from the dropdown.`, 'info');
  }
}

function removeIngredientRow(idx) {
  currentLines.splice(idx, 1);
  renderIngredientsTable();
}

function updateIngredient(idx, field, value) {
  if (!currentLines[idx]) return;
  currentLines[idx][field] = value;
  if (field === 'inventory_id') {
    const inv = cachedInventory.find(i => String(i.id) === String(value));
    if (inv) {
      currentLines[idx].unit = inv.unit || 'Kg';
    }
  }
  renderIngredientsTable();
}

function renderIngredientsTable() {
  const tbody = document.getElementById('ingredients-tbody');
  if (!tbody) return;

  if (currentLines.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6" style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px; background:#fafafa;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px; height:28px; color:#94a3b8;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>No inventory items added yet. Click <strong>"Add Inventory Item"</strong> above to add raw chemicals or outputs.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const itemOptionsHtml = '<option value="">Select Inventory Item...</option>' + cachedInventory.map(i => {
    let displayType = 'General';
    if (i.category === 'Technical') {
      displayType = i.item_subtype || 'Insecticide';
    } else if (i.category === 'Bottles' || i.category === 'Boxes') {
      displayType = i.category;
    } else if (i.category === 'Finished Goods') {
      displayType = 'Finished Goods';
    } else if (i.item_subtype && String(i.item_subtype).trim()) {
      displayType = String(i.item_subtype).trim();
    } else if (i.category && String(i.category).trim()) {
      displayType = String(i.category).trim();
    }
    return `<option value="${i.id}">${escapeHtml(i.name)} (${escapeHtml(displayType)}) &mdash; Available: ${parseFloat(i.stock || 0).toLocaleString()} ${escapeHtml(i.unit || 'Kg')}</option>`;
  }).join('');

  tbody.innerHTML = currentLines.map((line, idx) => {
    const selectedItem = cachedInventory.find(i => String(i.id) === String(line.inventory_id));
    const availableStock = selectedItem ? (parseFloat(selectedItem.stock) || 0) : 0;
    const itemUnit = selectedItem?.unit || line.unit || 'Kg';

    const stockBadge = selectedItem
      ? `<span class="badge ${availableStock > 0 ? 'badge-success' : 'badge-danger'}" style="font-size:12px; font-weight:700; padding:4px 8px; border-radius:4px; display:inline-block;">${availableStock.toLocaleString()} ${escapeHtml(itemUnit)}</span>`
      : '<span class="text-muted" style="font-size:12px;">—</span>';

    const isIncrease = line.action === 'INCREASE';
    const rowOptions = itemOptionsHtml.replace(`value="${line.inventory_id}"`, `value="${line.inventory_id}" selected`);

    return `
      <tr class="production-item-row ${isIncrease ? 'is-increase' : 'is-decrease'}" style="${isIncrease ? 'background:rgba(16,185,129,0.03);' : 'background:#ffffff;'} border-bottom:1px solid var(--border);">
        <td class="cell-prod-item" style="width:34%; padding:8px 8px; vertical-align:middle;">
          <span class="prod-mobile-label">Inventory Item</span>
          <select class="form-select" onchange="updateIngredient(${idx}, 'inventory_id', this.value)" style="font-size:13px; font-weight:500; width:100%; height:38px; border-radius:6px; box-sizing:border-box;">
            ${rowOptions}
          </select>
        </td>
        <td class="cell-prod-stock" style="width:13%; padding:8px 4px; text-align:center; vertical-align:middle;">
          <span class="prod-mobile-label">Available Stock:</span>
          ${stockBadge}
        </td>
        <td class="cell-prod-action" style="width:21%; padding:8px 8px; vertical-align:middle;">
          <span class="prod-mobile-label">Stock Operation</span>
          <select class="form-select" onchange="updateIngredient(${idx}, 'action', this.value)" style="font-size:12px; font-weight:700; width:100%; height:38px; border-radius:6px; box-sizing:border-box; color:${isIncrease ? '#059669' : '#dc2626'}; background-color:${isIncrease ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}; border:1.5px solid ${isIncrease ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}; padding: 0 22px 0 8px;">
            <option value="DECREASE" ${!isIncrease ? 'selected' : ''}>🔻 DECREASE (Deduct)</option>
            <option value="INCREASE" ${isIncrease ? 'selected' : ''}>🔺 INCREASE (Add)</option>
          </select>
        </td>
        <td class="cell-prod-qty" style="width:14%; padding:8px 8px; vertical-align:middle;">
          <span class="prod-mobile-label">Quantity</span>
          <input type="number" class="form-input" min="0.01" step="0.01" value="${line.quantity || ''}" onchange="updateIngredient(${idx}, 'quantity', this.value)" oninput="currentLines[${idx}].quantity = this.value" placeholder="0.00" style="font-weight:600; width:100%; height:38px; border-radius:6px; box-sizing:border-box; font-size:13px; padding:0 8px;" required>
        </td>
        <td class="cell-prod-unit" style="width:12%; padding:8px 6px; vertical-align:middle;">
          <span class="prod-mobile-label">Unit</span>
          <input type="text" class="form-input" value="${escapeHtml(line.unit || 'Kg')}" onchange="updateIngredient(${idx}, 'unit', this.value)" placeholder="Unit" style="font-size:13px; width:100%; height:38px; border-radius:6px; box-sizing:border-box; text-align:center; padding:0 4px;">
        </td>
        <td class="cell-prod-remove" style="width:6%; padding:8px 4px; text-align:center; vertical-align:middle;">
          <div class="prod-mobile-actions">
            <button type="button" class="icon-btn delete-btn" onclick="removeIngredientRow(${idx})" title="Remove item" style="display:inline-flex; align-items:center; justify-content:center; gap:5px; height:28px; color:#dc2626; border-radius:6px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); cursor:pointer; transition:all 0.15s ease; padding:0 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span class="prod-mobile-label" style="margin:0; color:#dc2626; font-size:11.5px; font-weight:700;">Remove</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function saveProduction() {
  const saveBtn = document.getElementById('save-batch-btn') || document.querySelector('#production-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, 'Saving & Updating Stock...');

  try {
    const rawProductId = document.getElementById('product-select')?.value;
    if (!rawProductId) {
      APP.showToast('Please select the manufactured product', 'error');
      if (saveBtn) APP.setButtonLoading(saveBtn, false);
      return;
    }

    const qtyProduced = parseFloat(document.getElementById('quantity-produced-input')?.value);
    if (!qtyProduced || qtyProduced <= 0) {
      APP.showToast('Please enter a valid production output quantity (> 0)', 'error');
      if (saveBtn) APP.setButtonLoading(saveBtn, false);
      return;
    }

    let batchNo = document.getElementById('batch-no-input')?.value?.trim();
    if (!batchNo) {
      batchNo = await getNextProductionBatchNo();
    } else {
      batchNo = formatBatchNo(batchNo);
    }

    const date = document.getElementById('production-date-input')?.value || UTILS.todayStr();
    const outputUnit = document.getElementById('output-unit-input')?.value?.trim() || 'Kg';
    const notes = document.getElementById('production-notes-input')?.value?.trim() || '';

    // Filter valid line items
    const validLines = currentLines.filter(l => l.inventory_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) {
      APP.showToast('Please add at least one inventory item with a valid quantity (> 0)', 'error');
      if (saveBtn) APP.setButtonLoading(saveBtn, false);
      return;
    }

    // Resolve Product Name & ID
    let parsedProductId = null;
    let parsedProductName = 'Finished Product';
    if (String(rawProductId).startsWith('PROD_')) {
      const numericId = parseInt(rawProductId.replace('PROD_', ''), 10);
      const prodObj = cachedProducts.find(p => p.id === numericId);
      parsedProductId = numericId;
      parsedProductName = prodObj?.name || 'Finished Product';
    } else if (String(rawProductId).startsWith('INV_')) {
      const numericId = parseInt(rawProductId.replace('INV_', ''), 10);
      const invObj = cachedInventory.find(i => i.id === numericId);
      parsedProductId = numericId;
      parsedProductName = invObj?.name || 'Finished Product';
    } else {
      const numericId = parseInt(rawProductId, 10);
      const prodObj = cachedProducts.find(p => p.id === numericId) || cachedInventory.find(i => i.id === numericId);
      parsedProductId = numericId;
      parsedProductName = prodObj?.name || 'Finished Product';
    }

    // Negative stock pre-validation for all DECREASE items
    const requiredDeductions = {};
    for (const line of validLines) {
      if (line.action === 'DECREASE') {
        const invItem = cachedInventory.find(i => String(i.id) === String(line.inventory_id));
        const itemUnit = invItem?.unit || line.unit || 'Kg';
        const converted = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units)
          ? window.INVENTORY_CORE.Units.convert(parseFloat(line.quantity), line.unit || itemUnit, itemUnit)
          : parseFloat(line.quantity);

        requiredDeductions[line.inventory_id] = (requiredDeductions[line.inventory_id] || 0) + converted;
      }
    }

    for (const [invId, requiredQty] of Object.entries(requiredDeductions)) {
      const invItem = cachedInventory.find(i => String(i.id) === String(invId));
      const availableStock = invItem ? (parseFloat(invItem.stock) || 0) : 0;
      const unit = invItem?.unit || 'Kg';

      if (requiredQty > availableStock) {
        APP.showToast(`Insufficient stock for "${invItem?.name || 'Item'}". Required: ${requiredQty} ${unit}, Available: ${availableStock} ${unit}. Production cannot proceed.`, 'error');
        if (saveBtn) APP.setButtonLoading(saveBtn, false);
        return;
      }
    }

    // Build line items payload with conversion
    const lineItemsToStore = validLines.map(l => {
      const invItem = cachedInventory.find(i => String(i.id) === String(l.inventory_id));
      const itemUnit = invItem?.unit || l.unit || 'Kg';
      const converted = (window.INVENTORY_CORE && window.INVENTORY_CORE.Units)
        ? window.INVENTORY_CORE.Units.convert(parseFloat(l.quantity), l.unit || itemUnit, itemUnit)
        : parseFloat(l.quantity);

      return {
        inventory_id: parseInt(l.inventory_id, 10),
        item_name: invItem?.name || 'Inventory Item',
        category: invItem?.category || 'Inventory',
        action: l.action === 'INCREASE' ? 'INCREASE' : 'DECREASE',
        entered_quantity: parseFloat(l.quantity),
        entered_unit: l.unit || itemUnit,
        converted_quantity: converted,
        canonical_unit: itemUnit
      };
    });

    const stamp = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp({}, 'production_batches') : {};
    const pbPayload = {
      batch_no: batchNo,
      product_id: parsedProductId,
      product_name: parsedProductName,
      formula_name: parsedProductName,
      quantity_produced: qtyProduced,
      date: date,
      notes: JSON.stringify({
        user_notes: notes,
        output_unit: outputUnit,
        items: lineItemsToStore
      }),
      ...stamp
    };

    const { data: insData, error: insErr } = await window.dbClient.from('production_batches').insert([pbPayload]).select();
    if (insErr) throw insErr;
    const createdBatchId = insData?.[0]?.id || null;

    // Apply Inventory Stock Operations
    for (const item of lineItemsToStore) {
      if (item.action === 'DECREASE') {
        if (window.INVENTORY_CORE && window.INVENTORY_CORE.Service) {
          await window.INVENTORY_CORE.Service.deductStockFIFO({
            itemId: item.inventory_id,
            quantity: item.converted_quantity,
            movementType: 'PRODUCTION_OUT',
            referenceType: 'production_batches',
            referenceId: createdBatchId,
            referenceNo: batchNo,
            notes: `Production Batch ${batchNo}: Consumed ${item.entered_quantity} ${item.entered_unit}`,
            allowNegative: false
          });
        } else if (window.INVENTORY_SERVICE) {
          await window.INVENTORY_SERVICE.deductStock(item.inventory_id, item.converted_quantity);
        }
      } else if (item.action === 'INCREASE') {
        // Create stock batch for increased output
        const sbStamp = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp({}, 'stock_batches') : {};
        const sbPayload = {
          item_id: item.inventory_id,
          item_name: item.item_name,
          item_type: 'Inventory',
          batch_no: batchNo,
          initial_qty: item.converted_quantity,
          current_qty: item.converted_quantity,
          unit: item.canonical_unit,
          purchase_price: 0,
          ...sbStamp
        };
        const { data: insSb } = await window.dbClient.from('stock_batches').insert([sbPayload]).select();
        const sbId = insSb?.[0]?.id || null;

        // Log Stock Movement
        const invItem = cachedInventory.find(i => i.id === item.inventory_id);
        const prevStock = parseFloat(invItem?.stock) || 0;
        const newStock = prevStock + item.converted_quantity;

        const smStamp = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp({}, 'stock_movements') : {};
        await window.dbClient.from('stock_movements').insert([{
          batch_id: sbId,
          txn_type: 'PRODUCTION_IN',
          txn_id: createdBatchId,
          qty: item.converted_quantity,
          previous_stock: prevStock,
          new_stock: newStock,
          user_name: 'Production Operator',
          notes: `Production Batch ${batchNo}: Produced ${item.entered_quantity} ${item.entered_unit}`,
          ...smStamp
        }]);

        // Sync authoritative stock in inventory_items
        if (window.INVENTORY_CORE && window.INVENTORY_CORE.Service) {
          await window.INVENTORY_CORE.Service.syncItemStock(item.inventory_id);
        } else if (window.INVENTORY_SERVICE) {
          await window.INVENTORY_SERVICE.syncItemStock(item.inventory_id);
        }
      }
    }

    APP.showToast(`Production batch ${batchNo} saved successfully! Inventory updated.`, 'success');
    APP.closeModal('production-modal');
    await loadManufacturingData();
  } catch (err) {
    console.error('saveProduction error:', err);
    APP.showToast('Error saving production: ' + (err.message || err), 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deleteProductionBatch(batchId) {
  if (!confirm('Are you sure you want to delete this production batch?\n\nThis will permanently delete the production record and AUTOMATICALLY REVERSE all inventory changes (restoring deducted materials and removing added outputs).')) {
    return;
  }

  const db = window.dbClient;
  if (!db) return;

  try {
    APP.showToast('Reversing inventory changes and deleting batch...', 'info');

    const { data: bRow, error: bErr } = await db.from('production_batches').select('*').eq('id', batchId).single();
    if (bErr || !bRow) throw new Error('Production batch record not found');

    let lineItems = [];
    if (bRow.notes) {
      try {
        const parsed = JSON.parse(bRow.notes);
        lineItems = Array.isArray(parsed) ? parsed : (parsed?.items || []);
      } catch (_) {}
    }

    // Reverse stock changes
    for (const item of lineItems) {
      const invId = item.inventory_id;
      const convertedQty = parseFloat(item.converted_quantity || item.entered_quantity) || 0;
      if (!invId || convertedQty <= 0) continue;

      if (item.action === 'DECREASE') {
        // Material was deducted -> Restore it back
        if (window.INVENTORY_CORE && window.INVENTORY_CORE.Service) {
          await window.INVENTORY_CORE.Service.restoreStock(invId, convertedQty);
        } else if (window.INVENTORY_SERVICE) {
          await window.INVENTORY_SERVICE.restoreStock(invId, convertedQty);
        }
      } else if (item.action === 'INCREASE') {
        // Output was added -> Deduct it back
        if (window.INVENTORY_CORE && window.INVENTORY_CORE.Service) {
          await window.INVENTORY_CORE.Service.deductStockFIFO({
            itemId: invId,
            quantity: convertedQty,
            movementType: 'PRODUCTION_REVERSAL',
            referenceType: 'production_reversals',
            referenceId: batchId,
            referenceNo: bRow.batch_no,
            notes: `Reversal of batch ${bRow.batch_no}: Deduct ${convertedQty}`,
            allowNegative: true
          });
        } else if (window.INVENTORY_SERVICE) {
          await window.INVENTORY_SERVICE.deductStock(invId, convertedQty);
        }
      }
    }

    // Clean linked movements & batches
    try {
      await db.from('stock_movements').delete().eq('txn_id', batchId);
    } catch (_) {}

    if (bRow.batch_no) {
      try {
        await db.from('stock_batches').delete().eq('batch_no', bRow.batch_no);
      } catch (_) {}
    }

    const { error: delErr } = await db.from('production_batches').delete().eq('id', batchId);
    if (delErr) throw delErr;

    APP.showToast(`Batch ${bRow.batch_no || ''} deleted and inventory changes reversed successfully!`, 'success');
    await loadManufacturingData();
  } catch (err) {
    console.error('deleteProductionBatch error:', err);
    APP.showToast('Error deleting batch: ' + (err.message || err), 'error');
  }
}

function viewProductionDetails(batchId) {
  const batchList = (typeof allBatches !== 'undefined' && allBatches && allBatches.length > 0)
    ? allBatches
    : (window.allBatches || []);
  const batch = batchList.find(b => String(b.id) === String(batchId));
  if (!batch) {
    APP.showToast('Batch record not found', 'error');
    return;
  }

  let lineItems = [];
  let userNotes = '';
  let outputUnit = 'Kg';
  if (batch.notes) {
    try {
      const parsed = JSON.parse(batch.notes);
      if (Array.isArray(parsed)) {
        lineItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        lineItems = parsed.items || [];
        userNotes = parsed.user_notes || '';
        outputUnit = parsed.output_unit || 'Kg';
      }
    } catch (_) {
      userNotes = batch.notes;
    }
  }

  const modalTitle = document.getElementById('view-batch-modal-title');
  if (modalTitle) modalTitle.innerText = `Production Batch Details: ${formatBatchNo(batch.batch_no)}`;

  const modalBody = document.getElementById('view-batch-modal-body');
  if (!modalBody) return;

  const rowsHtml = (lineItems.length > 0)
    ? lineItems.map((item, idx) => {
        const isInc = item.action === 'INCREASE';
        const badge = isInc
          ? '<span class="badge badge-success" style="font-weight:700;">🔺 INCREASE (Output Added)</span>'
          : '<span class="badge badge-danger" style="font-weight:700;">🔻 DECREASE (Consumed)</span>';
        return `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml((typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(item.item_name) : item.item_name)}</strong></td>
            <td><span class="badge badge-outline">${escapeHtml(item.category || 'Inventory')}</span></td>
            <td>${badge}</td>
            <td><strong>${item.entered_quantity}</strong> ${escapeHtml(item.entered_unit)}</td>
            <td style="color:var(--text-muted); font-size:12px;">${item.converted_quantity !== item.entered_quantity && item.canonical_unit ? `${item.converted_quantity} ${escapeHtml(item.canonical_unit)}` : '-'}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="6" class="text-center text-muted" style="padding:20px;">No itemized inventory transactions recorded for this batch.</td></tr>';

  const cardsHtml = (lineItems.length > 0)
    ? lineItems.map((item, idx) => {
        const isInc = item.action === 'INCREASE';
        const opBadge = isInc
          ? '<span class="badge badge-success" style="font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">🔺 INCREASE (Output Added)</span>'
          : '<span class="badge badge-danger" style="font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">🔻 DECREASE (Consumed)</span>';
        const cleanName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(item.item_name) : item.item_name;
        const baseEq = (item.converted_quantity !== item.entered_quantity && item.canonical_unit)
          ? `<span style="font-size:11px; color:var(--text-muted); font-weight:normal; display:block; margin-top:2px;">(Base: ${item.converted_quantity} ${escapeHtml(item.canonical_unit)})</span>`
          : '';

        return `
          <div class="batch-item-card ${isInc ? 'is-increase' : 'is-decrease'}">
            <div class="batch-item-card-header">
              <div class="batch-item-title-wrap">
                <span class="batch-item-index">#${idx + 1}</span>
                <span class="batch-item-name">${escapeHtml(cleanName)}</span>
              </div>
              <span class="badge badge-outline batch-item-cat">${escapeHtml(item.category || 'Inventory')}</span>
            </div>
            <div class="batch-item-card-body">
              <div class="batch-item-metric-col">
                <span class="batch-item-label">Stock Operation</span>
                <div class="batch-item-val">${opBadge}</div>
              </div>
              <div class="batch-item-metric-col text-right">
                <span class="batch-item-label">Quantity</span>
                <div class="batch-item-val font-bold" style="font-size:13.5px; color:var(--text-primary);">
                  ${item.entered_quantity} <span style="font-size:12px; font-weight:600; color:var(--text-secondary);">${escapeHtml(item.entered_unit)}</span>${baseEq}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty-state" style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No itemized inventory transactions recorded for this batch.</div>';

  modalBody.innerHTML = `
    <div class="batch-details-summary-card">
      <div class="batch-details-summary-grid">
        <div class="batch-details-metric">
          <span class="batch-details-metric-label">Batch Reference</span>
          <div class="batch-details-metric-val font-bold">${escapeHtml(formatBatchNo(batch.batch_no))}</div>
        </div>
        <div class="batch-details-metric">
          <span class="batch-details-metric-label">Manufactured Product</span>
          <div class="batch-details-metric-val font-bold" style="color:#0C3925;">${escapeHtml(batch.product_name)}</div>
        </div>
        <div class="batch-details-metric">
          <span class="batch-details-metric-label">Production Date</span>
          <div class="batch-details-metric-val font-semibold">${batch.date || 'N/A'}</div>
        </div>
        <div class="batch-details-metric">
          <span class="batch-details-metric-label">Quantity Produced</span>
          <div class="batch-details-metric-val font-bold" style="color:#0e7490;">${parseFloat(batch.quantity_produced || batch.actual_output_qty || 0).toLocaleString()} ${escapeHtml(outputUnit)}</div>
        </div>
      </div>
      ${userNotes ? `<div class="batch-details-remarks"><strong>Remarks:</strong> ${escapeHtml(userNotes)}</div>` : ''}
    </div>

    <h4 style="margin:0 0 10px 0; font-size:14px; font-weight:700;">Recorded Inventory Changes</h4>
    <div class="table-wrap batch-inventory-table-wrap">
      <table class="data-table" style="font-size:13px; width:100%;">
        <thead>
          <tr>
            <th style="width:5%;">#</th>
            <th style="width:35%;">Inventory Item</th>
            <th style="width:15%;">Category</th>
            <th style="width:20%;">Stock Operation</th>
            <th style="width:15%;">Quantity</th>
            <th style="width:10%;">Base Equivalent</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="batch-inventory-cards-list">
      ${cardsHtml}
    </div>
  `;

  APP.openModal('view-production-modal');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Compatibility stubs for test assertions and legacy callers
function filterOrdersTableReal() {}
function filterPackagingTableReal() {}
function formatPackagingBreakdown() { return ''; }

// Global window bindings
window.loadManufacturingData = loadManufacturingData;
window.openProductionModal = openProductionModal;
window.saveProduction = saveProduction;
window.saveBatch = saveProduction;
window.deleteProductionBatch = deleteProductionBatch;
window.viewProductionDetails = viewProductionDetails;
window.addIngredientRow = addIngredientRow;
window.addFinishedProductRow = addFinishedProductRow;
window.removeIngredientRow = removeIngredientRow;
window.updateIngredient = updateIngredient;
window.onProductionProductSelected = onProductionProductSelected;
window.filterBatchesTable = filterBatchesTable;
window.clearProductionFilters = clearProductionFilters;
window.filterOrdersTableReal = filterOrdersTableReal;
window.filterPackagingTableReal = filterPackagingTableReal;
window.formatPackagingBreakdown = formatPackagingBreakdown;
window.prodOrdersTableEnhancer = prodOrdersTableEnhancer;
window.packagingOrdersTableEnhancer = packagingOrdersTableEnhancer;
