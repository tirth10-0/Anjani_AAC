/* orders.js */
let allOrders = [], orderItems = [], editingOrderId = null;
let activeOrderTab = 'Orders';
let activeStatusFilter = '';
let activeItemsStatusFilter = '';
let allPackagingData = [];
let allDetailedItems = [];

function formatOrderNo(orderNo) {
  if (!orderNo) return '—';
  return String(orderNo).replace(/^DSP-/i, 'O-');
}

function extractUserNotes(notes) {
  if (!notes) return '';
  return String(notes)
    .replace(/(?:^|\n\n?)(?:DISPATCH_META|Dispatch_meta):[\s\S]*$/i, '')
    .trim();
}

async function getNextOrderNo() {
  let maxNum = 0;
  try {
    const { data: dbOrders } = await window.dbClient.from('orders').select('order_no');
    const orderList = dbOrders || allOrders || [];
    for (let o of orderList) {
      if (o.order_no) {
        const m = String(o.order_no).match(/^(?:O|ORD|DSP)-(\d+)$/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num < 1000000 && num > maxNum) maxNum = num;
        } else {
          const num = UTILS.extractNumericPart(o.order_no);
          if (num < 1000000 && num > maxNum) maxNum = num;
        }
      }
    }
  } catch (_) {
    for (let o of allOrders) {
      if (o.order_no) {
        const num = UTILS.extractNumericPart(o.order_no);
        if (num < 1000000 && num > maxNum) maxNum = num;
      }
    }
  }
  return 'O-' + String(maxNum + 1).padStart(2, '0');
}

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

let cachedBottlesList = [];

async function fetchPackagingData() {
  try {
    const [pkgRes, invRes, batchRes] = await Promise.all([
      window.dbClient.from('product_packaging').select('*'),
      window.dbClient.from('inventory_items').select('*'),
      window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory')
    ]);

    if (!pkgRes.error && pkgRes.data) {
      allPackagingData = pkgRes.data;
    }

    const stockMap = {};
    (batchRes.data || []).forEach(b => {
      const qty = parseFloat(b.current_qty) || 0;
      stockMap[b.item_id] = (stockMap[b.item_id] || 0) + qty;
    });

    if (!invRes.error && invRes.data) {
      cachedBottlesList = invRes.data.filter(it => it.category === 'Bottles').map(it => ({
        ...it,
        total_stock: stockMap[it.id] !== undefined ? stockMap[it.id] : (parseFloat(it.stock) || 0)
      }));
    }
  } catch (e) {
    console.error('Failed to fetch packaging/inventory data:', e);
  }
}

async function loadOrders() {
  console.log('Loading orders...');
  updatePageDebug('Loading Orders...', '#0C3925');
  try {
    UTILS.renderTableSkeleton('orders-table');
    await DB.initDB();

    // High performance: fetch packaging, inventory, stock batches, orders, clients, and order_items all in parallel!
    const [pkgRes, invRes, batchRes, ordersRes, clientsRes, orderItemsRes] = await Promise.all([
      window.dbClient.from('product_packaging').select('*'),
      window.dbClient.from('inventory_items').select('*'),
      window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory'),
      window.dbClient.from('orders').select('*').order('id', { ascending: false }),
      window.dbClient.from('clients').select('id, name'),
      window.dbClient.from('order_items').select('*')
    ]);

    if (ordersRes.error) throw ordersRes.error;

    // 1. Process packaging & bottle stock
    if (!pkgRes.error && pkgRes.data) {
      allPackagingData = pkgRes.data;
    }
    const stockMap = {};
    (batchRes.data || []).forEach(b => {
      const qty = parseFloat(b.current_qty) || 0;
      stockMap[b.item_id] = (stockMap[b.item_id] || 0) + qty;
    });
    if (!invRes.error && invRes.data) {
      cachedBottlesList = invRes.data.filter(it => it.category === 'Bottles').map(it => ({
        ...it,
        total_stock: stockMap[it.id] !== undefined ? stockMap[it.id] : (parseFloat(it.stock) || 0)
      }));
    }

    // 2. Map clients in O(1) time
    const clientMap = new Map();
    (clientsRes.data || []).forEach(c => clientMap.set(c.id, c.name));

    allOrders = UTILS.sortLatestFirst(ordersRes.data || [], o => o.order_no || o.id);
    allOrders.forEach(o => {
      o.order_no = formatOrderNo(o.order_no);
      o.client_display = clientMap.get(o.client_id) || o.client_name || '—';
    });

    // 3. Group order items in O(1) time without N+1 sequential requests
    const itemsByOrderId = new Map();
    (orderItemsRes.data || []).forEach(it => {
      if (!itemsByOrderId.has(it.order_id)) itemsByOrderId.set(it.order_id, []);
      itemsByOrderId.get(it.order_id).push(it);
    });

    allDetailedItems = [];
    allOrders.forEach(o => {
      o.items = itemsByOrderId.get(o.id) || [];
      o.items.forEach(it => {
        allDetailedItems.push({
          order_id: o.id,
          order_no: o.order_no,
          client_display: o.client_display,
          date: o.date,
          status: o.status,
          product_name: it.product_name,
          product_id: it.product_id,
          packaging_size: it.packaging_size || it.packing_size || '',
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total
        });
      });
    });

    applyFiltersAndRender();
    updatePageDebug('Ready (' + allOrders.length + ')', '#0C3925');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
  } catch (err) {
    console.error('loadOrders failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load orders: ' + err.message, 'error');
  }
}

async function buildDetailedOrderItems() {
  return;
}

function applyFiltersAndRender() {
  if (activeOrderTab === 'Orders') {
    const q = (document.getElementById('search-input')?.value || '').toLowerCase();
    let data = allOrders;
    if (activeStatusFilter) {
      data = data.filter(o => {
        let st = (o.status || 'Pending').toLowerCase();
        if (st === 'delivered') st = 'completed';
        return st === activeStatusFilter.toLowerCase();
      });
    }
    if (q) {
      data = data.filter(o => `${o.order_no} ${o.client_display} ${o.date}`.toLowerCase().includes(q));
    }
    data = UTILS.sortLatestFirst(data, o => o.order_no || o.id);
    renderTable(data);
  } else {
    const q = (document.getElementById('items-search-input')?.value || '').toLowerCase();
    let data = allDetailedItems;
    if (activeItemsStatusFilter) {
      data = data.filter(it => {
        let st = (it.status || 'Pending').toLowerCase();
        if (st === 'delivered') st = 'completed';
        return st === activeItemsStatusFilter.toLowerCase();
      });
    }
    if (q) {
      data = data.filter(it => `${it.order_no} ${it.client_display} ${it.product_name} ${it.date}`.toLowerCase().includes(q));
    }
    data = UTILS.sortLatestFirst(data, it => it.order_no || it.order_id || it.id);
    renderOrderItemsDetailTable(data);
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#orders-table tbody');
  if (!tbody) return;
  document.getElementById('total-info').textContent = `${data.length} order${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><div class="empty-state"><h3>No orders found</h3><p>Create your first order.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(o => {
    const balance = parseFloat(o.total_amount) - parseFloat(o.paid_amount || 0);
    const rowBg = balance <= 0 ? 'rgba(12, 57, 37, 0.08)' : 'rgba(239, 68, 68, 0.08)';
    
    // Status Badge
    let statusVal = o.status || 'Pending';
    if (statusVal === 'Delivered') {
      statusVal = 'Completed';
    }
    const isCompleted = statusVal.toLowerCase() === 'completed';
    const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

    return `<tr style="background: ${rowBg}">
      <td class="cell-bold">${o.order_no}</td>
      <td>${o.client_display || '—'}</td>
      <td>${UTILS.fmtDate(o.date)}</td>
      <td class="cell-amount">${UTILS.fmtCurrency(o.total_amount)}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(o.paid_amount)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(balance)}</td>
      <td>${statusBadge}</td>
      <td><div class="row-actions">
        <button class="action-btn view" onclick="viewOrder(${o.id})" title="View Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="action-btn edit" onclick="openEdit(${o.id})" title="Edit Order"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" onclick="deleteOrder(${o.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
  UTILS.applyMobileTableLabels('orders-table');
}

function renderOrderItemsDetailTable(data) {
  const tbody = document.querySelector('#order-items-detail-table tbody');
  if (!tbody) return;
  const totalInfo = document.getElementById('items-total-info');
  if (totalInfo) totalInfo.textContent = `${data.length} item${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><div class="empty-state"><h3>No items found</h3><p>No order items match the selected criteria.</p></div></td></tr>`;
    return;
  }

  // Group detailed items by order_id
  const groupedMap = new Map();
  data.forEach(it => {
    const key = it.order_id || it.order_no;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key).push(it);
  });

  let rowsHtml = '';
  let groupIdx = 0;
  groupedMap.forEach((items, orderId) => {
    const first = items[0];
    let statusVal = first.status || 'Pending';
    if (statusVal === 'Delivered') statusVal = 'Completed';
    const isCompleted = statusVal.toLowerCase() === 'completed';
    const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

    // High contrast alternating background colors for distinct order blocks
    const blockBg = (groupIdx % 2 === 0) 
      ? 'background-color: rgba(255, 255, 255, 0.035);' 
      : 'background-color: rgba(12, 57, 37, 0.07);';

    const getPackSizeStr = (it) => {
      let packSizeStr = it.packaging_size || it.packing_size;
      if (!packSizeStr) {
        const packMatch = allPackagingData.find(p => p.product_id == it.product_id);
        packSizeStr = packMatch ? cleanSizeLabel(packMatch.packaging_size, packMatch.product_unit) : '—';
      } else {
        packSizeStr = cleanSizeLabel(packSizeStr, '');
      }
      return packSizeStr;
    };

    items.forEach((it, idx) => {
      const isFirstRow = idx === 0;
      const isLastRow = idx === items.length - 1;
      const rowSpanAttr = isFirstRow ? ` rowspan="${items.length}"` : '';
      
      // Distinct bottom border separating different order blocks vs inner item rows
      const borderStyle = isLastRow 
        ? 'border-bottom: 2px solid rgba(12, 57, 37, 0.35);' 
        : 'border-bottom: 1px dashed rgba(255, 255, 255, 0.08);';

      const packSizeStr = getPackSizeStr(it);

      rowsHtml += `<tr style="${blockBg} ${borderStyle}">`;
      if (isFirstRow) {
        rowsHtml += `
          <td class="cell-bold"${rowSpanAttr} style="vertical-align:middle; padding: 8px 10px; font-weight:700; font-size:12.5px; white-space:nowrap;">${first.order_no}</td>
          <td${rowSpanAttr} style="vertical-align:middle; padding: 8px 10px; font-size:12.5px; white-space:nowrap;">${first.client_display || '—'}</td>
          <td${rowSpanAttr} style="vertical-align:middle; padding: 8px 10px; font-size:12px; white-space:nowrap;">${UTILS.fmtDate(first.date)}</td>
        `;
      }
      rowsHtml += `
        <td style="font-weight:600; color:var(--primary); padding: 8px 10px; font-size:12.5px;">${it.product_name || '—'}</td>
        <td style="padding: 8px 10px; font-size:12px; white-space:nowrap;"><span class="badge badge-neutral" style="padding: 2px 7px; font-size:11px;">${packSizeStr}</span></td>
        <td style="padding: 8px 10px; font-size:12.5px; font-weight:600; white-space:nowrap;">${it.quantity}</td>
        <td class="cell-amount" style="padding: 8px 10px; font-size:12.5px; white-space:nowrap;">${UTILS.fmtCurrency(it.unit_price)}</td>
        <td class="cell-amount" style="font-weight:700; padding: 8px 10px; font-size:12.5px; white-space:nowrap;">${UTILS.fmtCurrency(it.total)}</td>
      `;
      if (isFirstRow) {
        rowsHtml += `
          <td${rowSpanAttr} style="vertical-align:middle; padding: 8px 10px; white-space:nowrap;">${statusBadge}</td>
          <td${rowSpanAttr} style="vertical-align:middle; padding: 8px 10px; text-align:center; white-space:nowrap;"><div class="row-actions" style="gap:5px; justify-content:center;">
            <button class="action-btn view" onclick="viewOrder(${first.order_id})" title="View Order" style="min-width:30px; width:30px; height:30px; padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            <button class="action-btn edit" onclick="openEdit(${first.order_id})" title="Edit Order" style="min-width:30px; width:30px; height:30px; padding:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          </div></td>
        `;
      }
      rowsHtml += `</tr>`;
    });
    groupIdx++;
  });

  tbody.innerHTML = rowsHtml;
  UTILS.applyMobileTableLabels('order-items-detail-table');
}

async function viewOrder(id) {
  try {
    const { data: o, error: oErr } = await window.dbClient.from('orders').select('*').eq('id', id).single();
    if (oErr) throw oErr;
    const { data: itemsData } = await window.dbClient.from('order_items').select('*').eq('order_id', id);
    o.items = itemsData || [];

    const balance = parseFloat(o.total_amount) - parseFloat(o.paid_amount || 0);
    let statusVal = o.status || 'Pending';
    if (statusVal === 'Delivered') statusVal = 'Completed';
    const isCompleted = statusVal.toLowerCase() === 'completed';
    const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

    let itemsHtml = (o.items || []).map(it => {
      const pSize = cleanSizeLabel(it.packing_size || it.packaging_size || '', '');
      return `
        <div style="padding: 10px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--text-primary); font-size: 13.5px; word-break: break-word;">${it.product_name}</span>
            <span style="font-weight: 800; color: var(--accent); font-size: 13.5px; white-space: nowrap;">${UTILS.fmtCurrency(it.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--text-muted);">
            <div>Pack: <span class="badge badge-neutral" style="font-size:11px; padding:2px 6px;">${pSize || '—'}</span></div>
            <div>Qty: <strong style="color:var(--text-primary)">${it.quantity}</strong> × ${UTILS.fmtCurrency(it.unit_price)}</div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div style="display: flex; flex-direction: column; gap: 14px; width: 100%;">
        <!-- Header Info -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--text);">${formatOrderNo(o.order_no)}</h3>
            <p style="margin: 3px 0 0; font-size: 12px; color: var(--text-muted);">Booked: ${UTILS.fmtDate(o.date)} ${o.due_date ? `| Due: ${UTILS.fmtDate(o.due_date)}` : ''}</p>
          </div>
          <div>${statusBadge}</div>
        </div>

        <!-- Details Card -->
        <div style="display: flex; flex-direction: column; gap: 10px; background: var(--bg); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); font-weight: 700;">Client Details</span>
            <span style="font-weight: 700; font-size: 14px; color: var(--text-primary); text-align: right; word-break: break-word;">${o.client_name || '—'}</span>
          </div>
          <div style="height: 1px; background: var(--border); width: 100%;"></div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); font-weight: 700;">Payment Summary</span>
            <div style="text-align: right; font-size: 12.5px; line-height: 1.4;">
              Total: <strong>${UTILS.fmtCurrency(o.total_amount)}</strong> | Paid: <span class="text-success" style="font-weight: 600;">${UTILS.fmtCurrency(o.paid_amount)}</span>
              <br>Balance: <span class="${balance > 0 ? 'text-danger' : 'text-success'}" style="font-weight: 700;">${UTILS.fmtCurrency(balance)}</span>
            </div>
          </div>
        </div>

        <!-- Ordered Items Section -->
        <div>
          <h4 style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Ordered Items (${(o.items || []).length})</h4>
          <div>
            ${itemsHtml || '<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px;">No items</div>'}
          </div>
        </div>

        ${extractUserNotes(o.notes) ? `
          <div style="background: var(--bg); padding: 10px 12px; border-radius: 6px; font-size: 12px; color: var(--text-muted); border: 1px solid var(--border);">
            <strong style="color:var(--text-secondary)">Notes:</strong> ${extractUserNotes(o.notes)}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;">
          <button class="btn btn-secondary" onclick="APP.closeModal('view-modal')">Close</button>
          <button class="btn btn-primary" onclick="APP.closeModal('view-modal'); openEdit(${o.id});">Edit Order</button>
        </div>
      </div>
    `;

    document.getElementById('view-content').innerHTML = html;
    APP.openModal('view-modal');
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to view order: ' + err.message, 'error');
  }
}

async function populateClientSelect() {
  const sel = document.getElementById('client-select');
  if (!sel) return;
  try {
    const { data: clientsData, error } = await window.dbClient.from('clients').select('*');
    if (error) throw error;
    const clients = clientsData || [];
    sel.innerHTML = '<option value="">Select Client</option>' + clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (sel._ussInstance) {
      sel._ussInstance.updateOptions();
    } else if (window.UniversalSearchSelect) {
      new UniversalSearchSelect(sel);
      sel.dataset.ussInitialized = 'true';
    }
  } catch (err) {
    console.error('populateClientSelect failed:', err);
  }
}

async function openAdd() {
  editingOrderId = null;
  document.getElementById('modal-title').textContent = 'New Sales Order';
  const orderForm = document.getElementById('order-form');
  orderForm.reset();
  const nextOrderNo = await getNextOrderNo();
  const orderNoField = document.getElementById('order-no-field');
  if (orderNoField) orderNoField.value = nextOrderNo;
  const toggle = document.getElementById('auto-discount-toggle');
  if (toggle) toggle.checked = false;
  const gstSel = document.getElementById('gst-type-select');
  if (gstSel) { gstSel.value = ''; onGstTypeChange(''); }
  handleAutoDiscount();
  orderItems = [{ id: Date.now(), product_id: '', product_name: '', quantity: 1, unit_price: 0, total: 0 }];
  await populateClientSelect();
  await renderOrderItems();
  UTILS.applyDefaultDateInputs(orderForm, { skipFieldNames: ['due_date'] });
  APP.openModal('order-modal');
  setTimeout(() => UTILS.initAllAutocompleteSelects(), 10);
}

async function openEdit(id) {
  editingOrderId = id;
  try {
    await populateClientSelect();
    
    const { data: o, error: oErr } = await window.dbClient.from('orders').select('*').eq('id', id).single();
    if (oErr) throw oErr;
    const { data: itemsData } = await window.dbClient.from('order_items').select('*').eq('order_id', id);
    o.items = itemsData || [];

    document.getElementById('modal-title').textContent = 'Edit Order';
    if (o.status === 'Delivered') {
      o.status = 'Completed';
    }

    // Parse dispatch metadata if present in notes to recover items metadata if needed
    let dispatchMeta = null;
    const rawNotes = o.notes || '';
    if (/(?:DISPATCH_META|Dispatch_meta):/i.test(rawNotes)) {
      try {
        const jsonStr = rawNotes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
        dispatchMeta = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('Failed to parse dispatch metadata from notes:', e);
      }
    }

    // Clean user notes for form display
    o.notes = extractUserNotes(o.notes);

    // Normalize order number from DSP- to O-
    if (o.order_no) {
      o.order_no = formatOrderNo(o.order_no);
    }

    UTILS.populateForm('order-form', o);
    const notesInp = document.querySelector('#order-form [name="notes"]');
    if (notesInp) notesInp.value = o.notes || '';

    const orderNoField = document.getElementById('order-no-field');
    if (orderNoField && o.order_no) orderNoField.value = o.order_no;

    UTILS.applyDefaultDateInputs(document.getElementById('order-form'), { skipFieldNames: ['due_date'] });
    const toggle = document.getElementById('auto-discount-toggle');
    if (toggle) toggle.checked = false;
    handleAutoDiscount();

    orderItems = (o.items || []).map(item => {
      let q = parseFloat(item.quantity) || 0;
      if (q <= 0 && dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
        const metaMatch = dispatchMeta.items_meta.find(m => m.product_id == item.product_id || (m.product_name && String(m.product_name).toLowerCase().trim() === String(item.product_name).toLowerCase().trim()));
        if (metaMatch) {
          q = parseFloat(metaMatch.QUANTITY || metaMatch.quantity || metaMatch.TOTAL_UNITS || metaMatch.total_units || 0);
        }
      }
      return {
        ...item,
        quantity: q > 0 ? q : 1,
        packaging_size: item.packaging_size || item.packing_size || '',
        total: (q > 0 ? q : 1) * (parseFloat(item.unit_price) || 0)
      };
    });

    // Restore GST type selector from stored tax %
    const taxVal = parseFloat(o.tax) || 0;
    const gstSel = document.getElementById('gst-type-select');
    if (gstSel) {
      const reverseMap = { 5: 'GST5', 12: 'GST12', 18: 'GST18' };
      gstSel.value = reverseMap[taxVal] || '';
      onGstTypeChange(gstSel.value);
    }

    // Ensure products list is loaded
    const { data: prodData, error: prodErr } = await window.dbClient.from('products').select('*');
    cachedProductsList = prodErr ? [] : (prodData || []);

    // Ensure item packaging options are populated when editing
    for (const item of orderItems) {
      if (item.product_id) {
        const pMatch = cachedProductsList.find(p => p.id == item.product_id);
        if (pMatch && (!pMatch.packaging_options || pMatch.packaging_options.length === 0)) {
          try {
            const { data: pkgs, error: pkgErr } = await window.dbClient.from('product_packaging').select('*').eq('product_id', item.product_id);
            if (!pkgErr && pkgs) {
              pMatch.packaging_options = pkgs;
            }
          } catch (e) {
            console.warn('Failed to pre-fetch packaging for editing item:', item.product_id, e);
          }
        }
      }
    }

    await renderOrderItems();
    APP.openModal('order-modal');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 10);
  } catch (err) {
    console.error(err);
    APP.showToast('Failed to load order: ' + err.message, 'error');
  }
}

async function addOrderItem() {
  orderItems.push({ id: Date.now(), product_id: '', product_name: '', quantity: 1, unit_price: 0, total: 0 });
  await renderOrderItems();
}

function cleanSizeLabel(size, unit) {
  if (!size) return unit || '';
  const s = String(size).trim();
  const u = String(unit || '').trim();
  if (!u) return s;
  // If size already ends with unit (case-insensitive), or already contains a unit abbreviation, return size as is
  if (s.toLowerCase().includes(u.toLowerCase()) || /\b(ltr|ml|kg|gm|nos|pcs|box|bag|drum)\b/i.test(s)) {
    return s;
  }
  return `${s} ${u}`;
}

let cachedProductsList = [];

async function renderOrderItems() {
  const tbody = document.getElementById('order-items-tbody');
  if (!tbody) return;
  
  try {
    await fetchPackagingData();
    const { data: prodData, error: prodErr } = await window.dbClient.from('products').select('*');
    cachedProductsList = prodErr ? [] : (prodData || []);

    // Ensure item packaging options are populated for all items
    for (const item of orderItems) {
      let pMatch = cachedProductsList.find(p => p.id == item.product_id);
      if (!pMatch && item.product_name) {
        pMatch = cachedProductsList.find(p => String(p.name).toLowerCase().trim() === String(item.product_name).toLowerCase().trim());
        if (pMatch) item.product_id = pMatch.id;
      }
      if (pMatch && (!pMatch.packaging_options || pMatch.packaging_options.length === 0)) {
        try {
          const { data: pkgs, error: pkgErr } = await window.dbClient.from('product_packaging').select('*').eq('product_id', pMatch.id);
          if (!pkgErr && pkgs) {
            pMatch.packaging_options = pkgs;
          }
        } catch (e) {
          console.warn('Failed to pre-fetch packaging in renderOrderItems for product:', pMatch.id, e);
        }
      }
    }
    
    tbody.innerHTML = orderItems.map((item, idx) => {
      let pMatch = cachedProductsList.find(p => p.id == item.product_id);
      if (!pMatch && item.product_name) {
        pMatch = cachedProductsList.find(p => String(p.name).toLowerCase().trim() === String(item.product_name).toLowerCase().trim());
      }
      let pkgOptions = pMatch?.packaging_options || [];
      if (pkgOptions.length > 0) {
        pkgOptions = UTILS.sortPackSizesDescending(pkgOptions, opt => opt.packaging_size || opt.size);
      }
      const unitStr = pMatch?.unit || '';
      
      let pkgSelectHtml = '';
      if (pkgOptions.length > 0) {
        const itemNormPack = item.packaging_size ? String(item.packaging_size).toLowerCase().replace(/\s+/g, '') : '';
        
        // First check if any option matches item.packaging_size
        let matchedIndex = -1;
        if (itemNormPack) {
          matchedIndex = pkgOptions.findIndex(opt => {
            const rawSize = opt.packaging_size || opt.size || '';
            const sizeLabel = cleanSizeLabel(rawSize, unitStr);
            const optNorm = String(sizeLabel).toLowerCase().replace(/\s+/g, '');
            const rawNorm = String(rawSize).toLowerCase().replace(/\s+/g, '');
            return optNorm === itemNormPack || rawNorm === itemNormPack;
          });
        }

        const optionsStr = pkgOptions.map((opt, oIdx) => {
          const rawSize = opt.packaging_size || opt.size || '';
          const sizeLabel = cleanSizeLabel(rawSize, unitStr);
          const priceVal = parseFloat(opt.sell_price || opt.selling_price) || 0;
          
          let isSel = false;
          if (matchedIndex !== -1) {
            isSel = (oIdx === matchedIndex);
          } else if (!itemNormPack) {
            isSel = (opt.is_base || oIdx === 0);
          }

          return `<option value="${sizeLabel}" data-price="${priceVal}" ${isSel ? 'selected' : ''}>${sizeLabel}</option>`;
        }).join('');

        // Ensure item.packaging_size is set if not already set
        if (!item.packaging_size && pkgOptions.length > 0) {
          const selOpt = pkgOptions.find(opt => opt.is_base) || pkgOptions[0];
          item.packaging_size = cleanSizeLabel(selOpt.packaging_size || selOpt.size || '', unitStr);
          if (!item.unit_price) item.unit_price = parseFloat(selOpt.sell_price || selOpt.selling_price) || 0;
        }

        pkgSelectHtml = `<select class="form-select order-pack-select" data-idx="${idx}" data-allow-custom="true" onchange="onPackSizeChange(${idx}, this.value)">
          ${optionsStr}
        </select>`;
      } else {
        const fallbackSize = item.packaging_size || unitStr || '';
        item.packaging_size = fallbackSize;
        pkgSelectHtml = `<input type="text" class="form-input order-pack-input" data-idx="${idx}" value="${fallbackSize}" placeholder="Pack size" onchange="onPackSizeChange(${idx}, this.value)">`;
      }

      return `
        <tr data-row-idx="${idx}">
          <td style="min-width:180px">
            <span class="mobile-label">Product</span>
            <select class="form-select order-product-select" data-idx="${idx}" onchange="onProductSelectChange(${idx}, this.value)">
              <option value="">Select Product</option>
              ${cachedProductsList.map(p => `<option value="${p.id}" ${p.id == item.product_id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </td>
          <td style="min-width:140px" class="pack-size-cell">
            <span class="mobile-label">Pack Size</span>
            ${pkgSelectHtml}
          </td>
          <td style="min-width:180px">
            <span class="mobile-label">Bottle</span>
            <select class="form-select order-bottle-select" data-idx="${idx}" onchange="onBottleChange(${idx}, this.value)">
              <option value="">Select Bottle</option>
              ${cachedBottlesList.map(b => `<option value="${b.id}" ${b.id == item.bottle_inventory_id ? 'selected' : ''}>${b.name} (${parseFloat(b.total_stock || b.stock || 0).toFixed(0)} avail)</option>`).join('')}
            </select>
          </td>
          <td>
            <span class="mobile-label">Quantity</span>
            <input type="number" class="form-input item-qty-input" value="${item.quantity}" min="0" step="any" oninput="onQtyChange(${idx}, this.value)" onchange="onQtyChange(${idx}, this.value)">
          </td>
          <td>
            <span class="mobile-label">Unit Price (₹)</span>
            <input type="number" class="form-input item-price-input" value="${item.unit_price}" min="0" step="any" oninput="onUnitPriceChange(${idx}, this.value)" onchange="onUnitPriceChange(${idx}, this.value)">
          </td>
          <td class="cell-amount item-total-display">
            <span class="mobile-label">Total</span>
            ${UTILS.fmtCurrency(item.total)}
          </td>
          <td>
            <span class="mobile-label">Remove</span>
            <button class="action-btn delete" onclick="removeItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </td>
        </tr>
      `;
    }).join('');
    calculateTotal();
    setTimeout(() => {
      if (window.UTILS?.initAllAutocompleteSelects) {
        UTILS.initAllAutocompleteSelects();
      }
    }, 10);
  } catch (err) {
    console.error(err);
  }
}

async function onProductSelectChange(idx, valOrEvt) {
  let val = valOrEvt;
  if (valOrEvt && typeof valOrEvt === 'object' && valOrEvt.target) {
    val = valOrEvt.target.value;
  }
  console.log(`[OrderRow ${idx}] Product selected (ID):`, val);
  const it = orderItems[idx];
  if (!it) return;
  it.product_id = val;
  if (!val) {
    console.log(`[OrderRow ${idx}] Cleared product selection.`);
    it.product_name = '';
    it.packaging_size = '';
    it.unit_price = 0;
    it.total = 0;
    await renderOrderItems();
    return;
  }

  const p = cachedProductsList.find(x => x.id == val);
  console.log(`[OrderRow ${idx}] Fetched product object from Product Master:`, p);
  
  it.product_name = p?.name || '';
  if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.resolveTechnicalItem) {
    const techItem = await window.INVENTORY_SERVICE.resolveTechnicalItem(val, p?.name);
    it.inventory_item_id = techItem?.id || null;
  } else {
    it.inventory_item_id = p?.inventory_item_id || null;
  }
  let pkgOptions = p?.packaging_options || [];
  if (!pkgOptions.length && val) {
    pkgOptions = allPackagingData.filter(pk => pk.product_id == val);
    if (!pkgOptions.length) {
      try {
        const { data: pkgs, error: pkgErr } = await window.dbClient.from('product_packaging').select('*').eq('product_id', val);
        if (!pkgErr && pkgs) pkgOptions = pkgs;
      } catch (e) {
        console.warn('Failed to fetch packaging directly for product:', val, e);
      }
    }
  }
  console.log(`[OrderRow ${idx}] Raw packaging_options array:`, pkgOptions);

  if (pkgOptions.length > 0) {
    pkgOptions = UTILS.sortPackSizesDescending(pkgOptions, opt => opt.packaging_size || opt.size);
    const selectedOpt = pkgOptions.find(opt => opt.is_base) || pkgOptions[0];
    const rawSize = selectedOpt.packaging_size || selectedOpt.size || '';
    it.packaging_size = cleanSizeLabel(rawSize, p?.unit);
    it.unit_price = parseFloat(selectedOpt.sell_price || selectedOpt.selling_price) || parseFloat(p?.sell_price) || 0;
  } else {
    it.packaging_size = p?.unit || '';
    it.unit_price = parseFloat(p?.sell_price) || 0;
  }
  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  await renderOrderItems();
}

async function onPackSizeChange(idx, val) {
  let valStr = (val && typeof val === 'object' && val.target) ? val.target.value : val;
  console.log(`[OrderRow ${idx}] Pack size changed to:`, valStr);
  const it = orderItems[idx];
  if (!it) return;
  it.packaging_size = valStr;
  const p = cachedProductsList.find(x => x.id == it.product_id);
  let pkgOptions = p?.packaging_options || [];
  if (!pkgOptions.length && it.product_id) {
    pkgOptions = allPackagingData.filter(pk => pk.product_id == it.product_id);
    if (!pkgOptions.length) {
      try {
        const { data: pkgs, error: pkgErr } = await window.dbClient.from('product_packaging').select('*').eq('product_id', it.product_id);
        if (!pkgErr && pkgs) pkgOptions = pkgs;
      } catch (e) {
        console.warn('Failed to fetch packaging on pack size change:', e);
      }
    }
  }

  const normVal = String(valStr).toLowerCase().replace(/\s+/g, '');
  const matchOpt = pkgOptions.find(opt => {
    const rawSize = opt.packaging_size || opt.size || '';
    const cleaned = cleanSizeLabel(rawSize, p?.unit);
    const normCleaned = String(cleaned).toLowerCase().replace(/\s+/g, '');
    const normRaw = String(rawSize).toLowerCase().replace(/\s+/g, '');
    return normCleaned === normVal || normRaw === normVal;
  });

  console.log(`[OrderRow ${idx}] Matched packaging option from Product Master:`, matchOpt);

  if (matchOpt) {
    const pr = parseFloat(matchOpt.sell_price || matchOpt.selling_price);
    if (!isNaN(pr) && pr >= 0) {
      it.unit_price = pr;
    }
  }
  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  await renderOrderItems();
}

function onQtyChange(idx, val) {
  const it = orderItems[idx];
  it.quantity = parseFloat(val) || 0;
  it.total = it.quantity * (parseFloat(it.unit_price) || 0);
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  if (row) {
    const totalDisp = row.querySelector('.item-total-display');
    if (totalDisp) totalDisp.textContent = UTILS.fmtCurrency(it.total);
  }
  calculateTotal();
}

function onBottleChange(idx, val) {
  let valStr = (val && typeof val === 'object' && val.target) ? val.target.value : val;
  const it = orderItems[idx];
  it.bottle_inventory_id = valStr ? parseInt(valStr) : null;
}

function onUnitPriceChange(idx, val) {
  const it = orderItems[idx];
  it.unit_price = parseFloat(val) || 0;
  it.total = (parseFloat(it.quantity) || 0) * it.unit_price;
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  if (row) {
    const totalDisp = row.querySelector('.item-total-display');
    if (totalDisp) totalDisp.textContent = UTILS.fmtCurrency(it.total);
  }
  calculateTotal();
}

function removeItem(idx) {
  orderItems.splice(idx, 1);
  renderOrderItems();
}

function handleAutoDiscount() {
  const toggle = document.getElementById('auto-discount-toggle');
  const discountField = document.getElementById('discount-field');
  const paidField = document.querySelector('#order-form input[name="paid_amount"]');
  
  if (!toggle || !discountField || !paidField) return;

  const isAuto = toggle.checked;
  
  if (isAuto) {
    discountField.readOnly = true;
    discountField.style.background = 'var(--bg)';
    
    const subtotal = orderItems.reduce((s, it) => s + it.total, 0);
    const paidAmount = parseFloat(paidField.value) || 0;
    
    if (subtotal > 0 && paidAmount < subtotal) {
      const diff = subtotal - paidAmount;
      const pct = (diff / subtotal) * 100;
      discountField.value = pct.toFixed(2);
    } else {
      discountField.value = "0";
    }
  } else {
    discountField.readOnly = false;
    discountField.style.background = '';
  }
}

function onGstTypeChange(gstCode) {
  const rateMap = { '': 0, 'GST5': 5, 'GST12': 12, 'GST18': 18, 'IGST5': 5, 'IGST12': 12, 'IGST18': 18 };
  const rate = rateMap[gstCode] || 0;
  const taxField = document.getElementById('tax-field');
  if (taxField) taxField.value = rate;
  updateGstBreakdown();
}

function updateGstBreakdown() {
  const subtotal = orderItems.reduce((s, it) => s + it.total, 0);
  const gstCode = document.getElementById('gst-type-select')?.value || '';
  const rateMap = { '': 0, 'GST5': 5, 'GST12': 12, 'GST18': 18, 'IGST5': 5, 'IGST12': 12, 'IGST18': 18 };
  const rate = rateMap[gstCode] || 0;

  const cgstRow = document.getElementById('cgst-row');
  const sgstRow = document.getElementById('sgst-row');
  const igstRow = document.getElementById('igst-row');
  const grandRow = document.getElementById('grand-total-row');

  if (!gstCode || rate === 0) {
    if (cgstRow) cgstRow.style.display = 'none';
    if (sgstRow) sgstRow.style.display = 'none';
    if (igstRow) igstRow.style.display = 'none';
    if (grandRow) grandRow.style.display = 'none';
    return;
  }

  if (gstCode.startsWith('IGST')) {
    const igstAmt = subtotal * rate / 100;
    if (cgstRow) cgstRow.style.display = 'none';
    if (sgstRow) sgstRow.style.display = 'none';
    if (igstRow) { igstRow.style.display = ''; document.getElementById('igst-label').textContent = `IGST (${rate}%):`; document.getElementById('igst-display').textContent = UTILS.fmtCurrency(igstAmt); }
    if (grandRow) { grandRow.style.display = ''; document.getElementById('grand-total-display').textContent = UTILS.fmtCurrency(subtotal + igstAmt); }
  } else {
    const half = rate / 2;
    const cgstAmt = subtotal * half / 100;
    const sgstAmt = subtotal * half / 100;
    if (igstRow) igstRow.style.display = 'none';
    if (cgstRow) { cgstRow.style.display = ''; document.getElementById('cgst-label').textContent = `CGST (${half}%):`; document.getElementById('cgst-display').textContent = UTILS.fmtCurrency(cgstAmt); }
    if (sgstRow) { sgstRow.style.display = ''; document.getElementById('sgst-label').textContent = `SGST (${half}%):`; document.getElementById('sgst-display').textContent = UTILS.fmtCurrency(sgstAmt); }
    if (grandRow) { grandRow.style.display = ''; document.getElementById('grand-total-display').textContent = UTILS.fmtCurrency(subtotal + cgstAmt + sgstAmt); }
  }
}

function calculateTotal() {
  const total = orderItems.reduce((s, it) => s + it.total, 0);
  const el = document.getElementById('order-total-display');
  if (el) el.textContent = UTILS.fmtCurrency(total);
  updateGstBreakdown();
  handleAutoDiscount();

  // Dynamically update Remaining Balance field
  const paidInput = document.getElementById('paid-amount-input');
  const remField = document.getElementById('remaining-balance-field');
  if (paidInput && remField) {
    const paid = parseFloat(paidInput.value) || 0;
    const rem = Math.max(0, total - paid);
    remField.value = UTILS.fmtCurrency(rem);
  }
}

async function saveOrder() {
  const d = UTILS.getFormData('order-form');
  if (!d.client_id) { APP.showToast('Please select a client', 'error'); return; }
  if (orderItems.length === 0) { APP.showToast('Please add at least one item', 'error'); return; }

  let finalOrderNo = d.order_no ? formatOrderNo(d.order_no) : '';
  if (!finalOrderNo) {
    finalOrderNo = await getNextOrderNo();
  }

  const saveBtn = document.querySelector('#order-modal button.btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  const clientSelect = document.getElementById('client-select');
  const clientName = clientSelect ? clientSelect.options[clientSelect.selectedIndex].text : '';
  const paidAmount = parseFloat(d.paid_amount) || 0.00;

  try {
    const autoToggle = document.getElementById('auto-discount-toggle');
    const isAuto = autoToggle && autoToggle.checked;

    const subtotal = orderItems.reduce((s, it) => s + it.total, 0);
    const taxPct = parseFloat(d.tax) || 0.00;
    const taxAmount = subtotal * taxPct / 100;
    const discountPct = parseFloat(d.discount) || 0.00;
    const discountAmount = subtotal * discountPct / 100;
    const finalTotal = isAuto ? paidAmount : (subtotal + taxAmount - discountAmount);
    
    const boToggle = document.getElementById('allow-backorder-toggle');
    const isBackorderMode = boToggle && boToggle.checked;

    // Sync latest live DOM values from form table to orderItems array
    document.querySelectorAll('#order-items-tbody tr').forEach((row, idx) => {
      if (orderItems[idx]) {
        const prodSel = row.querySelector('.order-product-select');
        if (prodSel && prodSel.value) {
          orderItems[idx].product_id = prodSel.value;
          const pObj = cachedProductsList.find(p => p.id == prodSel.value);
          if (pObj) orderItems[idx].product_name = pObj.name;
        }
        const packSel = row.querySelector('.order-pack-select');
        const packInput = row.querySelector('.order-pack-input');
        if (packSel && packSel.value) {
          orderItems[idx].packaging_size = packSel.value;
        } else if (packInput && packInput.value) {
          orderItems[idx].packaging_size = packInput.value;
        }
        const bottleSel = row.querySelector('.order-bottle-select');
        if (bottleSel && bottleSel.value) {
          orderItems[idx].bottle_inventory_id = parseInt(bottleSel.value);
        } else {
          orderItems[idx].bottle_inventory_id = null;
        }
        const qtyInp = row.querySelector('.item-qty-input');
        if (qtyInp) orderItems[idx].quantity = parseFloat(qtyInp.value) || 0;
        const priceInp = row.querySelector('.item-price-input');
        if (priceInp) orderItems[idx].unit_price = parseFloat(priceInp.value) || 0;
        orderItems[idx].total = (parseFloat(orderItems[idx].quantity) || 0) * (parseFloat(orderItems[idx].unit_price) || 0);
      }
    });

    // Validate item quantities and products
    for (let i = 0; i < orderItems.length; i++) {
      const it = orderItems[i];
      if (!it.product_id) {
        APP.showToast(`Please select a product for item #${i + 1}`, 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
        return;
      }
      const q = parseFloat(it.quantity) || 0;
      if (q <= 0) {
        APP.showToast(`Please enter a quantity greater than 0 for ${it.product_name || 'item #' + (i + 1)}`, 'error');
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
        return;
      }
    }

    const executeSave = async (allowBackorder = false) => {

      // Fetch latest inventory items for auto-matching fallback
      for (const item of orderItems) {
        const product = cachedProductsList.find(p => p.id == item.product_id);
        const pName = item.product_name || product?.name || '';
        if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.resolveTechnicalItem) {
          const techItem = await window.INVENTORY_SERVICE.resolveTechnicalItem(item.product_id, pName);
          if (techItem) {
            item.inventory_item_id = techItem.id;
            if (product) product.inventory_item_id = techItem.id;
          }
        }
      }

      console.groupCollapsed(`[Sales Order ${finalOrderNo || 'new'}] inventory resolution`);
      orderItems.forEach(item => {
        const product = cachedProductsList.find(p => p.id == item.product_id);
        console.log('ORDER PRODUCT', {
          name: item.product_name,
          productId: item.product_id,
          inventoryId: product?.inventory_item_id || null,
          quantity: item.quantity,
          unit: product?.unit || null,
          packSize: item.packaging_size
        });
      });
      console.groupEnd();

      if (editingOrderId) {
        // 1. Revert previous stock before applying new order edits
        await revertOrderStock(editingOrderId);

        // 2. Update order row
        const updateData = {
          order_no: finalOrderNo || null,
          client_id: parseInt(d.client_id, 10),
          client_name: clientName,
          date: d.date || UTILS.todayStr(),
          due_date: d.due_date || null,
          status: d.status || 'Pending',
          total_amount: finalTotal,
          paid_amount: paidAmount,
          discount: discountPct,
          tax: taxPct,
          notes: d.notes ? d.notes.trim() : null
        };
        const { error: updErr } = await window.dbClient.from('orders').update(updateData).eq('id', editingOrderId);
        if (updErr) throw updErr;

        // 3. Delete existing items
        await window.dbClient.from('order_items').delete().eq('order_id', editingOrderId);

        // 4. Insert new items and deduct stock
        await insertOrderItemsAndSyncStock(editingOrderId, orderItems, finalOrderNo || String(editingOrderId));
      } else {
        // 1. Insert new order
        const insertData = {
          order_no: finalOrderNo || null,
          client_id: parseInt(d.client_id, 10),
          client_name: clientName,
          date: d.date || UTILS.todayStr(),
          due_date: d.due_date || null,
          status: d.status || 'Pending',
          total_amount: finalTotal,
          paid_amount: paidAmount,
          discount: discountPct,
          tax: taxPct,
          notes: d.notes ? d.notes.trim() : null
        };
        const { data: newOrderData, error: insErr } = await window.dbClient.from('orders').insert([insertData]).select();
        if (insErr) throw insErr;
        const newOrderId = newOrderData[0].id;

        // 2. Insert items and deduct stock
        await insertOrderItemsAndSyncStock(newOrderId, orderItems, finalOrderNo || String(newOrderId));
      }

      APP.closeModal('order-modal');
      APP.showToast('Order saved successfully!', 'success');
      await loadOrders();
    };

    await executeSave(false);
  } catch (err) {
    console.error('saveOrder failed:', err);
    APP.showToast('Failed to save order: ' + err.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
  }
}

async function revertOrderStock(orderId) {
  try {
    const { data: items, error: itErr } = await window.dbClient.from('order_items').select('*').eq('order_id', orderId);
    if (itErr || !items || !items.length) return;

    for (const it of items) {
      const qty = parseFloat(it.quantity) || 0;
      const packMl = UTILS.parsePackSizeInMl(it.packing_size || it.packaging_size) || 1000;
      const volumeLiters = (packMl / 1000) * qty;

      // 1. Restore bottle stock if bottle used
      if (it.bottle_inventory_id && qty > 0) {
        const bottleId = parseInt(it.bottle_inventory_id, 10);
        await window.INVENTORY_SERVICE.restoreStock(bottleId, qty);
      }

      // 2. Restore technical stock
      let techItem = null;
      if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.resolveTechnicalItem) {
        techItem = await window.INVENTORY_SERVICE.resolveTechnicalItem(it.product_id, it.product_name);
      }
      if (!techItem && it.inventory_item_id) {
        const { data: invRow } = await window.dbClient.from('inventory_items').select('id, unit').eq('id', it.inventory_item_id).maybeSingle();
        techItem = invRow;
      }

      if (techItem) {
        let restoreQty = volumeLiters;
        if (techItem.unit) {
          restoreQty = UTILS.convertUnit(volumeLiters, 'Litre', techItem.unit);
        }
        if (restoreQty > 0) {
          await window.INVENTORY_SERVICE.restoreStock(techItem.id, restoreQty);
        }
      }
    }

    // Clean old movements
    try {
      await window.dbClient.from('stock_movements').delete().eq('txn_id', orderId);
    } catch (_) {}
  } catch (err) {
    console.warn('revertOrderStock notice:', err);
  }
}

async function insertOrderItemsAndSyncStock(orderId, items, orderNo) {
  // Batch insert all order items in a single query
  const itemRows = items.map(it => ({
    order_id: orderId,
    product_id: it.product_id ? parseInt(it.product_id, 10) : null,
    product_name: it.product_name,
    packing_size: it.packaging_size || it.packing_size || null,
    bottle_inventory_id: it.bottle_inventory_id ? parseInt(it.bottle_inventory_id, 10) : null,
    quantity: parseFloat(it.quantity) || 0,
    unit_price: parseFloat(it.unit_price) || 0,
    discount: 0,
    total: parseFloat(it.total) || 0
  }));

  if (itemRows.length > 0) {
    const { error: insErr } = await window.dbClient.from('order_items').insert(itemRows);
    if (insErr) throw insErr;
  }

  for (const it of items) {
    const qty = parseFloat(it.quantity) || 0;
    const packMl = UTILS.parsePackSizeInMl(it.packaging_size || it.packing_size) || 1000;
    const volumeLiters = (packMl / 1000) * qty;

    // 1. Deduct bottle stock if selected
    if (it.bottle_inventory_id && qty > 0) {
      const bottleId = parseInt(it.bottle_inventory_id, 10);
      await window.INVENTORY_SERVICE.deductStock(bottleId, qty);
    }

    // 2. Deduct Technical stock
    let techItem = null;
    if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.resolveTechnicalItem) {
      techItem = await window.INVENTORY_SERVICE.resolveTechnicalItem(it.product_id, it.product_name);
    }
    if (!techItem && it.inventory_item_id) {
      const { data: invRow } = await window.dbClient.from('inventory_items').select('id, unit').eq('id', it.inventory_item_id).maybeSingle();
      techItem = invRow;
    }

    if (techItem) {
      let deductQty = volumeLiters;
      if (techItem.unit) {
        deductQty = UTILS.convertUnit(volumeLiters, 'Litre', techItem.unit);
      }
      if (deductQty > 0) {
        await window.INVENTORY_SERVICE.deductStock(techItem.id, deductQty);
      }
    }
  }
}

async function deleteOrder(id) {
  APP.showConfirm('Delete this order and its items?', async () => {
    try {
      // 1. Revert stock
      await revertOrderStock(id);

      // 2. Delete order items & order
      await window.dbClient.from('order_items').delete().eq('order_id', id);
      const { error } = await window.dbClient.from('orders').delete().eq('id', id);
      if (error) throw error;
      
      APP.showToast('Order deleted and stock restored!', 'success');
      setTimeout(() => loadOrders(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete order: ' + err.message, 'error');
    }
  });
}

// Tab Switching Listener
document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeOrderTab = e.target.getAttribute('data-tab');

    const ordersWrap = document.getElementById('orders-table-wrap');
    const itemsWrap = document.getElementById('order-items-table-wrap');

    if (activeOrderTab === 'Orders') {
      if (ordersWrap) ordersWrap.style.display = '';
      if (itemsWrap) itemsWrap.style.display = 'none';
    } else {
      if (ordersWrap) ordersWrap.style.display = 'none';
      if (itemsWrap) itemsWrap.style.display = '';
    }
    applyFiltersAndRender();
  });
});

// Status Pill Filters for Orders
document.querySelectorAll('#status-pill-filters .cat-pill').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('#status-pill-filters .cat-pill').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeStatusFilter = e.target.getAttribute('data-status') || '';
    applyFiltersAndRender();
  });
});

// Status Pill Filters for Items
document.querySelectorAll('#items-status-pill-filters .cat-pill').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('#items-status-pill-filters .cat-pill').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeItemsStatusFilter = e.target.getAttribute('data-status') || '';
    applyFiltersAndRender();
  });
});

document.getElementById('search-input')?.addEventListener('input', () => applyFiltersAndRender());
document.getElementById('items-search-input')?.addEventListener('input', () => applyFiltersAndRender());

// Event listeners for auto discount calculations
document.getElementById('auto-discount-toggle')?.addEventListener('change', handleAutoDiscount);
document.querySelector('#order-form input[name="paid_amount"]')?.addEventListener('input', handleAutoDiscount);

loadOrders();
