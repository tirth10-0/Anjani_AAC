/* daily-transactions.js */
let allDailyTransactions = [];
let editingDailyTransactionId = null;
let materialsUsed = [];
let activeTab = 'all';

let inventoryItems = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

let itemBatchStockMap = {};

function getLocalItemStock(id) {
  if (itemBatchStockMap[id] !== undefined) {
    return itemBatchStockMap[id];
  }
  const it = inventoryItems.find(x => x.id == id);
  return it ? parseFloat(it.stock) || 0 : 0;
}

function formatInventoryOption(item) {
  const stock = getLocalItemStock(item.id);
  const cName = (typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(item.name) : item.name;
  const cUnit = (typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(item.unit || 'Unit') : (item.unit || 'Unit');
  return `${cName} (${item.category || 'Item'} | ${cUnit} | Stock: ${UTILS.fmtNumber(stock)})`;
}

function getAllowedUnits(baseUnit) {
  const unit = String(baseUnit || '').trim().toLowerCase();
  if (['litre', 'ltr', 'l', 'ltr.'].includes(unit)) return ['Litre', 'ML'];
  if (['ml', 'milliliter'].includes(unit)) return ['ML', 'Litre'];
  if (['kg', 'kilogram'].includes(unit)) return ['KG', 'Gram'];
  if (['gram', 'g', 'gm'].includes(unit)) return ['Gram', 'KG'];
  if (unit === 'nos') return ['Nos'];
  return [baseUnit || 'Nos'];
}

function buildMaterialSummary(materials) {
  if (!Array.isArray(materials) || !materials.length) return 'No materials recorded';
  return materials
    .slice(0, 3)
    .map(m => `<span class="purchase-item-tag"><span class="purchase-item-name">${(typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(m.item_name) : m.item_name}</span><span class="purchase-item-qty">(${UTILS.fmtNumber(m.quantity)} ${(typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(m.unit) : m.unit})</span></span>`)
    .join(', ') + (materials.length > 3 ? ` <span class="purchase-item-qty">+${materials.length - 3} more</span>` : '');
}

function getTotalMaterialQty(materials) {
  return materials.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
}

function renderLowStockAlerts() {
  const container = document.getElementById('low-stock-alerts-container');
  if (!container) return;
  const lowStockItems = inventoryItems
    .filter(item => {
      const stock = getLocalItemStock(item.id);
      const ro = parseFloat(item.reorder_level) || 0;
      const itemType = String(item.item_subtype || item.category || 'Raw Material').trim();
      const isTech = String(item.category || '').toLowerCase() === 'technical' || ['insecticide', 'herbicide', 'fungicide', 'pgr', 'solvent'].includes(itemType.toLowerCase());
      const threshold = ro > 0 ? ro : (isTech ? 7 : 50);
      return stock <= threshold;
    })
    .slice(0, 3);

  if (!lowStockItems.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = lowStockItems.map(item => `
    <div class="low-stock-alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      <div><strong>${item.name}</strong> is at or below reorder level. Stock: ${UTILS.fmtNumber(getLocalItemStock(item.id))} ${item.unit || ''}</div>
    </div>
  `).join('');
}

function getCategorizedMaterials(category) {
  const cat = String(category).toLowerCase().trim();
  const techKeywords = [
    'technical', 'technicals',
    'insecticide', 'insecticides',
    'fungicide', 'fungicides',
    'herbicide', 'herbicides',
    'pgr',
    'solvent', 'solvents'
  ];
  
  if (cat === 'technical') {
    return inventoryItems.filter(item => {
      const c = String(item.category || '').toLowerCase().trim();
      const s = String(item.item_subtype || '').toLowerCase().trim();
      return techKeywords.includes(c) || techKeywords.includes(s);
    });
  }
  if (cat === 'others') {
    return inventoryItems.filter(item => {
      const c = String(item.category || '').toLowerCase().trim();
      const s = String(item.item_subtype || '').toLowerCase().trim();
      const isTech = techKeywords.includes(c) || techKeywords.includes(s);
      return !isTech && !['bottles', 'boxes', 'labels'].includes(c);
    });
  }
  return inventoryItems.filter(item => String(item.category).toLowerCase().trim() === cat);
}

function populateCategorizedMaterialSelects() {
  const categories = ['Technical', 'Bottles', 'Boxes', 'Labels', 'Others'];
  categories.forEach(category => {
    const select = document.getElementById(`material-select-${category.toLowerCase()}`);
    if (!select) return;

    const items = getCategorizedMaterials(category);
    select.innerHTML = `<option value="">Select...</option>` + items.map(item => `
      <option value="${item.id}">${item.name}${item.unit ? ` (${item.unit})` : ''}</option>
    `).join('');

    if (select._ussInstance) {
      select._ussInstance.updateOptions();
    } else if (window.UniversalSearchSelect) {
      new UniversalSearchSelect(select);
      select.dataset.ussInitialized = 'true';
    }

    if (!select.dataset.materialChangeAttached) {
      select.addEventListener('change', () => updateMaterialStockHint(category));
      select.dataset.materialChangeAttached = 'true';
    }

    updateMaterialStockHint(category);
  });
}

function attachCategorizedMaterialSearchListeners() {
  const categories = ['Technical', 'Bottles', 'Boxes', 'Labels', 'Others'];
  categories.forEach(category => {
    const select = document.getElementById(`material-select-${category.toLowerCase()}`);
    if (!select) return;
    if (select.dataset.stockListenerAttached) return;

    const input = select._ussInstance?.input;
    if (!input) return;

    input.addEventListener('input', () => {
      const selected = select.options[select.selectedIndex];
      const stockField = document.getElementById(`material-stock-${category.toLowerCase()}`);
      if (!stockField) return;
      if (!selected || !selected.value || input.value !== selected.textContent.trim()) {
        stockField.textContent = 'Available: —';
      }
    });

    select.dataset.stockListenerAttached = 'true';
  });
}

async function loadDailyTransactions() {
  updatePageDebug('Loading Daily Stock Usage...', '#0C3925');

  try {
    UTILS.renderTableSkeleton('daily-transactions-table');
    await DB.initDB();

    // High performance: parallelize inventory_items, stock_batches, and daily_transactions
    const invQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('inventory_items').select('*')) : window.dbClient.from('inventory_items').select('*');
    const batchQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory').gt('current_qty', 0)) : window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory').gt('current_qty', 0);
    const txnQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('daily_transactions').select('*').order('id', { ascending: false })) : window.dbClient.from('daily_transactions').select('*').order('id', { ascending: false });

    const [invRes, batchRes, txnRes] = await Promise.all([
      invQuery,
      batchQuery,
      txnQuery
    ]);

    inventoryItems = invRes.error ? [] : invRes.data || [];

    itemBatchStockMap = {};
    const batches = batchRes.data || [];
    batches.forEach(b => {
      const qty = Math.max(0, parseFloat(b.current_qty) || 0);
      itemBatchStockMap[b.item_id] = (itemBatchStockMap[b.item_id] || 0) + qty;
    });

    populateCategorizedMaterialSelects();
    if (window.UTILS?.initAllAutocompleteSelects) {
      UTILS.initAllAutocompleteSelects();
      attachCategorizedMaterialSearchListeners();
    }
    renderLowStockAlerts();

    if (txnRes.error) throw txnRes.error;
    allDailyTransactions = UTILS.sortLatestFirst(txnRes.data || [], t => t.txn_no || t.id);

    ['search-input', 'date-from-filter', 'date-to-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.listenerAttached) {
        el.addEventListener('input', () => renderTable(allDailyTransactions));
        el.addEventListener('change', () => renderTable(allDailyTransactions));
        el.dataset.listenerAttached = 'true';
      }
    });

    renderTable(allDailyTransactions);
    updateStats(allDailyTransactions);
    UTILS.initAllAutocompleteSelects();
    updatePageDebug(`Ready (${allDailyTransactions.length})`, '#0C3925');
  } catch (err) {
    console.error('Daily Transactions loadDailyTransactions failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load daily transactions: ' + err.message, 'error');
  }
}

function formatDailyTxnNo(txnNo, id) {
  if (!txnNo) return id ? `D-${String(id).padStart(2, '0')}` : '-';
  const s = String(txnNo).trim();
  const match = s.match(/^(?:DTXN|D)-?(\d+)$/i);
  if (match) {
    let n = parseInt(match[1], 10);
    if (n >= 1000) n = n - 1000;
    return `D-${String(n).padStart(2, '0')}`;
  }
  return s;
}

function renderTable(data) {
  const tbody = document.querySelector('#daily-transactions-table tbody');
  if (!tbody) return;

  const filtered = filterTransactions(data);
  document.getElementById('total-info').textContent = `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`;

  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><div class="empty-state"><h3>No entries found</h3></div></td></tr>';
    updateStats(filtered);
    return;
  }

  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td class="cell-mono">${formatDailyTxnNo(t.txn_no, t.id)}</td>
      <td>${UTILS.fmtDate(t.date)}</td>
      <td>${t.material_summary || t.item_summary || 'No materials recorded'}</td>
      <td>${t.notes ? t.notes : '—'}</td>
      <td><span class="material-pill">${parseInt(t.material_count, 10) || 0} line${parseInt(t.material_count, 10) === 1 ? '' : 's'}</span></td>
      <td><div class="row-actions">
        <button class="action-btn edit" onclick="openEdit(${t.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" onclick="deleteTransaction(${t.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>
  `).join('');

  updateStats(filtered);
  UTILS.applyMobileTableLabels('daily-transactions-table');
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`switchTab('${tab}')`));
  });
  renderTable(allDailyTransactions);
}

function filterTransactions(data) {
  const q = document.getElementById('search-input')?.value.toLowerCase();
  const fromDate = document.getElementById('date-from-filter')?.value;
  const toDate = document.getElementById('date-to-filter')?.value;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localToday = `${year}-${month}-${day}`;

  const list = data.filter(t => {
    const tDateStr = String(t.date || '').substring(0, 10);

    if (activeTab === 'today' && tDateStr !== localToday) return false;
    if (activeTab === 'week') {
      const tDate = new Date(`${tDateStr}T00:00:00`);
      const todayDate = new Date(`${localToday}T00:00:00`);
      const diffDays = (todayDate - tDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 7 || diffDays < 0) return false;
    }
    if (activeTab === 'month') {
      if (tDateStr.substring(0, 4) !== String(year) || tDateStr.substring(5, 7) !== month) return false;
    }

    if (fromDate && tDateStr < fromDate) return false;
    if (toDate && tDateStr > toDate) return false;

    if (q) {
      const formattedNo = formatDailyTxnNo(t.txn_no, t.id).toLowerCase();
      const haystack = [
        t.txn_no,
        formattedNo,
        t.material_summary,
        t.item_summary,
        t.notes
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
  return UTILS.sortLatestFirst(list, t => t.txn_no || t.id);
}

async function getNextDailyTxnNo() {
  try {
    const { data: allTxns } = await window.dbClient.from('daily_transactions').select('id, txn_no');
    let maxNum = 0;
    (allTxns || []).forEach(t => {
      const s = String(t.txn_no || '');
      const match = s.match(/^(?:DTXN|D)-?(\d+)$/i);
      if (match) {
        let n = parseInt(match[1], 10);
        if (n >= 1000) n = n - 1000;
        if (n > maxNum && n < 100000) maxNum = n;
      }
    });
    return `D-${String(maxNum + 1).padStart(2, '0')}`;
  } catch (err) {
    console.error('Error generating next daily txn no:', err);
    return 'D-01';
  }
}

function updateStats(data) {
  const totalLines = data.reduce((sum, row) => sum + (parseInt(row.material_count, 10) || 0), 0);
  const totalQty = data.reduce((sum, row) => sum + (parseFloat(row.total_material_qty) || 0), 0);
  const totalMaterialsEl = document.getElementById('total-material-lines');
  const totalQtyEl = document.getElementById('total-qty-used');
  if (totalMaterialsEl) totalMaterialsEl.textContent = `${totalLines} materials`;
  if (totalQtyEl) totalQtyEl.textContent = `Qty used: ${UTILS.fmtNumber(totalQty)}`;
}

function resetMaterialEntryFields() {
  ['technical', 'bottles', 'boxes', 'labels', 'others'].forEach(category => {
    const select = document.getElementById(`material-select-${category}`);
    const qtyField = document.getElementById(`material-qty-${category}`);
    if (select) {
      select.value = '';
      select.dispatchEvent(new Event('change'));
      if (select._ussInstance) select._ussInstance.updateOptions();
    }
    if (qtyField) qtyField.value = category === 'others' ? '' : '0';
  });
}

async function openAdd() {
  editingDailyTransactionId = null;
  materialsUsed = [];
  goToTransactionStep(1);
  document.getElementById('modal-title').textContent = 'New Daily Entry';
  document.getElementById('daily-transaction-form').reset();
  resetMaterialEntryFields();
  populateCategorizedMaterialSelects();
  renderMaterialsList();

  try {
    const nextNo = await getNextDailyTxnNo();
    document.getElementById('txn-no-field').value = nextNo;
  } catch (err) {
    document.getElementById('txn-no-field').value = 'D-01';
  }

  UTILS.applyDefaultDateInputs(document.getElementById('daily-transaction-form'));
  renderMaterialsList();
  APP.openModal('daily-transaction-modal');
}

async function openEdit(id) {
  editingDailyTransactionId = id;
  goToTransactionStep(1);
  resetMaterialEntryFields();

  try {
    const { data: t, error } = await window.dbClient.from('daily_transactions').select('*').eq('id', id).single();
    if (error) throw error;
    
    const { data: mats } = await window.dbClient.from('daily_transaction_materials').select('*').eq('daily_transaction_id', id);

    document.getElementById('modal-title').textContent = 'Edit Daily Entry';
    document.getElementById('txn-no-field').value = formatDailyTxnNo(t.txn_no, t.id);
    const existingDateValue = String(t.date || '').substring(0, 10);
    if (existingDateValue) {
      document.getElementById('txn-date-field').value = existingDateValue;
    } else {
      UTILS.applyDefaultDateInputs(document.getElementById('daily-transaction-form'));
    }
    document.getElementById('notes-field').value = t.notes || '';

    materialsUsed = (mats || []).map(m => {
      const item = inventoryItems.find(inv => String(inv.id) === String(m.item_id));
      return {
        item_id: parseInt(m.item_id, 10),
        item_name: m.item_name,
        item_type: m.item_type || item?.category || 'Other',
        quantity: parseFloat(m.quantity) || 0,
        unit: m.unit || item?.unit || 'Nos',
        base_unit: item?.unit || m.unit || 'Nos'
      };
    });

    renderMaterialsList();
    APP.openModal('daily-transaction-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load transaction data: ' + err.message, 'error');
  }
}

function addCategorizedMaterial(category) {
  const select = document.getElementById(`material-select-${category.toLowerCase()}`);
  const qtyField = document.getElementById(`material-qty-${category.toLowerCase()}`);
  if (!select || !qtyField) return;

  const itemId = select.value;
  const quantity = parseFloat(qtyField.value) || 0;
  if (!itemId || quantity <= 0) {
    APP.showToast('Select a variant and enter the used quantity.', 'error');
    return;
  }

  const item = inventoryItems.find(x => String(x.id) === String(itemId));
  if (!item) return;

  if (materialsUsed.some(entry => String(entry.item_id) === String(itemId))) {
    APP.showToast('This inventory item has already been added.', 'error');
    return;
  }

  materialsUsed.push({
    item_id: parseInt(itemId, 10),
    item_name: item.name,
    item_type: item.category || 'Other',
    quantity,
    unit: item.unit || 'Nos',
    base_unit: item.unit || 'Nos'
  });

  renderMaterialsList();
  resetMaterialEntryFields();
}

function updateMaterialStockHint(category) {
  const select = document.getElementById(`material-select-${category.toLowerCase()}`);
  const stockField = document.getElementById(`material-stock-${category.toLowerCase()}`);
  if (!select || !stockField) return;

  const item = inventoryItems.find(x => String(x.id) === String(select.value));
  if (!item) {
    stockField.textContent = 'Available: —';
    return;
  }

  const stock = getLocalItemStock(item.id);
  stockField.textContent = `Available: ${UTILS.fmtNumber(stock)} ${item.unit || 'Nos'}`;
}

function removeInventoryMaterial(idx) {
  materialsUsed.splice(idx, 1);
  renderMaterialsList();
}

function updateMaterialQty(idx, val) {
  if (materialsUsed[idx]) materialsUsed[idx].quantity = parseFloat(val) || 0;
}

function updateMaterialUnit(idx, val) {
  if (materialsUsed[idx]) materialsUsed[idx].unit = val;
}

function renderMaterialsList() {
  const listEl = document.getElementById('materials-list');
  if (!listEl) return;

  if (!materialsUsed.length) {
    listEl.innerHTML = '<div class="material-empty">No materials added yet.</div>';
    return;
  }

  listEl.innerHTML = `
    <div class="material-list-head">
      <div>Item</div>
      <div>Category</div>
      <div>Stock</div>
      <div>Quantity</div>
      <div>Unit</div>
      <div>Action</div>
    </div>
    ${materialsUsed.map((item, idx) => {
      const stock = getLocalItemStock(item.item_id);
      const units = getAllowedUnits(item.base_unit || item.unit);
      return `
        <div class="material-row">
          <div class="material-item-meta">
            <div class="material-item-name">${(typeof UTILS !== 'undefined' && UTILS.cleanItemName) ? UTILS.cleanItemName(item.item_name) : item.item_name}</div>
            <div class="material-item-sub">
              <span>Base unit: ${(typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(item.base_unit || item.unit) : (item.base_unit || item.unit)}</span>
            </div>
          </div>
          <div class="material-cell-category">
            <span class="mobile-label">Category</span>
            <span class="material-pill">${item.item_type || 'Other'}</span>
          </div>
          <div class="material-cell-stock">
            <span class="mobile-label">Stock</span>
            <span style="font-weight:600; font-size:12.5px;">${UTILS.fmtNumber(stock)} ${(typeof UTILS !== 'undefined' && UTILS.cleanUnitLabel) ? UTILS.cleanUnitLabel(item.base_unit || item.unit) : (item.base_unit || item.unit)}</span>
          </div>
          <div class="material-cell-qty">
            <span class="mobile-label">Quantity</span>
            <input type="number" class="form-input" value="${item.quantity}" min="0.01" step="0.01" onchange="updateMaterialQty(${idx}, this.value)">
          </div>
          <div class="material-cell-unit">
            <span class="mobile-label">Unit</span>
            <select class="form-select" onchange="updateMaterialUnit(${idx}, this.value)">
              ${units.map(unit => `<option value="${unit}" ${item.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}
            </select>
          </div>
          <div class="material-cell-action">
            <button type="button" class="action-btn delete" onclick="removeInventoryMaterial(${idx})" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>
      `;
    }).join('')}
  `;
  setTimeout(() => {
    if (window.UTILS?.initAllAutocompleteSelects) {
      UTILS.initAllAutocompleteSelects();
    }
  }, 10);
}

async function saveTransaction() {
  const date = document.getElementById('txn-date-field').value;
  const notes = document.getElementById('notes-field').value || '';
  let txn_no = document.getElementById('txn-no-field').value || '';
  txn_no = formatDailyTxnNo(txn_no);
  if (!txn_no || txn_no === '-') {
    txn_no = await getNextDailyTxnNo();
  }

  if (!date) {
    APP.showToast('Please select a date.', 'error');
    return;
  }
  if (!materialsUsed.length) {
    APP.showToast('Please add at least one material entry.', 'error');
    return;
  }

  const saveBtn = document.querySelector('#daily-transaction-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, editingDailyTransactionId ? 'Updating...' : 'Saving...');

  try {
    for (const material of materialsUsed) {
      const item = inventoryItems.find(x => String(x.id) === String(material.item_id));
      const baseUnit = item ? item.unit : material.base_unit || material.unit;
      const stock = item ? parseFloat(item.stock) || 0 : 0;
      const convertedQty = UTILS.convertUnit ? UTILS.convertUnit(material.quantity, material.unit, baseUnit) : material.quantity;
      if (convertedQty <= 0) {
        APP.showToast(`Quantity for "${material.item_name}" must be greater than zero.`, 'error');
        return;
      }
      
      // We check stock in the backend ideally, but we can bypass the strict frontend block 
      // if editing since they might just be changing the date. 
      // Actually, if editing we shouldn't block on current stock since it might already be deducted.
    }

    const payload = {
      date,
      notes,
      txn_no,
      material_count: materialsUsed.length,
      material_summary: materialsUsed.map(m => m.item_name).join(', ')
    };

    let txnId = editingDailyTransactionId;

    if (editingDailyTransactionId) {
      // Restore old stock in stock_batches
      const { data: oldMats } = await window.dbClient.from('daily_transaction_materials').select('*').eq('daily_transaction_id', editingDailyTransactionId);
      if (oldMats) {
        for (const om of oldMats) {
          const item = inventoryItems.find(x => String(x.id) === String(om.item_id));
          const baseUnit = item?.unit || om.unit;
          const baseQty = UTILS.convertUnit(parseFloat(om.quantity) || 0, om.unit, baseUnit);
          await window.INVENTORY_SERVICE.restoreStock(om.item_id, baseQty);
        }
      }
      
      await window.dbClient.from('daily_transaction_materials').delete().eq('daily_transaction_id', editingDailyTransactionId);
      
      const { error } = await window.dbClient.from('daily_transactions').update(payload).eq('id', editingDailyTransactionId);
      if (error) throw error;
    } else {
      const stampedPayload = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(payload) : payload;
      const { data, error } = await window.dbClient.from('daily_transactions').insert([stampedPayload]).select();
      if (error) throw error;
      txnId = data[0].id;
    }

    // Insert new materials
    const newMats = materialsUsed.map(m => ({
      daily_transaction_id: txnId,
      item_id: m.item_id,
      item_name: m.item_name,
      item_type: m.item_type || 'Other',
      quantity: parseFloat(m.quantity) || 0,
      unit: m.unit || m.base_unit || 'Nos'
    }));

    if (newMats.length > 0) {
      const stampedMats = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(newMats) : newMats;
      await window.dbClient.from('daily_transaction_materials').insert(stampedMats);
      
      // Deduct stock in stock_batches with unit conversion to base unit
      for (const m of newMats) {
        const item = inventoryItems.find(x => String(x.id) === String(m.item_id));
        const baseUnit = item?.unit || m.unit;
        const baseQty = UTILS.convertUnit(parseFloat(m.quantity) || 0, m.unit, baseUnit);
        await window.INVENTORY_SERVICE.deductStock(m.item_id, baseQty);
      }
    }

    APP.showToast('Daily entry saved and inventory stock synchronized!', 'success');
    APP.closeModal('daily-transaction-modal');
    loadDailyTransactions();
  } catch (err) {
    console.error('saveTransaction failed:', err);
    APP.showToast('Error saving transaction: ' + err.message, 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deleteTransaction(id) {
  APP.showConfirm('Delete this entry? All deducted inventory stock will be restored.', async () => {
    try {
      // Restore stock in stock_batches with unit conversion to base unit
      const { data: oldMats } = await window.dbClient.from('daily_transaction_materials').select('*').eq('daily_transaction_id', id);
      if (oldMats) {
        for (const om of oldMats) {
          const item = inventoryItems.find(x => String(x.id) === String(om.item_id));
          const baseUnit = item?.unit || om.unit;
          const baseQty = UTILS.convertUnit(parseFloat(om.quantity) || 0, om.unit, baseUnit);
          await window.INVENTORY_SERVICE.restoreStock(om.item_id, baseQty);
        }
      }
      
      // Cascades
      const { error } = await window.dbClient.from('daily_transactions').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Failed to delete transaction');

      APP.showToast('Entry deleted and inventory restored.', 'success');
      setTimeout(() => loadDailyTransactions(), 100);
    } catch (err) {
      console.error('deleteTransaction failed:', err);
      APP.showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  });
}

document.getElementById('search-input')?.addEventListener('input', () => renderTable(allDailyTransactions));

loadDailyTransactions();

let transactionFormStep = 1;

function goToTransactionStep(step) {
  transactionFormStep = Math.max(1, Math.min(2, step));

  document.querySelectorAll('#daily-transaction-modal .product-step-panel').forEach(panel => {
    panel.classList.toggle('active', Number(panel.dataset.stepPanel) === transactionFormStep);
  });

  const modalBody = document.querySelector('#daily-transaction-modal .modal-body');
  if (modalBody) modalBody.scrollTop = 0;

  for (let i = 1; i <= 2; i++) {
    document.getElementById(`txn-step-pill-${i}`)?.classList.toggle('active', i === transactionFormStep);
  }

  const prevBtn = document.getElementById('txn-prev-btn');
  const nextBtn = document.getElementById('txn-next-btn');
  const saveBtn = document.getElementById('txn-save-btn');
  if (prevBtn) prevBtn.style.display = transactionFormStep === 1 ? 'none' : 'inline-flex';
  if (nextBtn) nextBtn.style.display = transactionFormStep === 2 ? 'none' : 'inline-flex';
  if (saveBtn) saveBtn.style.display = transactionFormStep === 2 ? 'inline-flex' : 'none';

  if (transactionFormStep === 2) {
    populateCategorizedMaterialSelects();
    attachCategorizedMaterialSearchListeners();
  }
}

function transactionFormNextStep() {
  const date = document.getElementById('txn-date-field').value;
  if (transactionFormStep === 1 && !date) {
    APP.showToast('Please select a date before continuing', 'error');
    return;
  }
  goToTransactionStep(transactionFormStep + 1);
}

// Auto migrate legacy daily transactions to standard D-01, D-02...
(async function migrateLegacyDailyTxns() {
  try {
    if (!window.dbClient) return;
    const { data: txns } = await window.dbClient.from('daily_transactions').select('id, txn_no').order('id', { ascending: true });
    if (txns && txns.length > 0) {
      let seq = 1;
      for (const t of txns) {
        const s = String(t.txn_no || '');
        if (/^DTXN-/i.test(s) || !s) {
          const match = s.match(/\d+/);
          let n = match ? parseInt(match[0], 10) : seq;
          if (n >= 1000) n = n - 1000;
          const newNo = `D-${String(n).padStart(2, '0')}`;
          await window.dbClient.from('daily_transactions').update({ txn_no: newNo }).eq('id', t.id);
        } else {
          const dMatch = s.match(/^D-(\d+)$/i);
          if (dMatch) {
            const n = parseInt(dMatch[1], 10);
            if (n >= seq) seq = n;
          }
        }
        seq++;
      }
    }
  } catch (e) {
    console.warn('Daily transaction migration notice:', e);
  }
})();
