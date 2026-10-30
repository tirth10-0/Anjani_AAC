
/* ─── CO-MARKETING BRAND / LABEL OWNER & STOCK VERIFICATION HELPERS ─── */
async function populateOrderBrandSelect(selectedOwner = 'E') {
  const sel = document.getElementById('order-label-owner-select');
  if (!sel) return;

  let companies = [];
  try {
    const { data: compList } = await window.dbClient.from('companies').select('id, name, code, is_manufacturing');
    companies = compList || [];
  } catch (_) {}

  if (!companies.some(c => c.code === 'AAC' || c.code === 'ACC' || c.code === 'E')) companies.unshift({ id: 1, name: 'Anjani Agri Care', code: 'AAC', is_manufacturing: true });
  if (!companies.some(c => c.code === 'GAS')) companies.push({ id: 2, name: 'Greenfield Agro Solutions', code: 'GAS', is_manufacturing: false });

  const activeCode = (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getActiveCompany) 
    ? (window.TENANT_CONTEXT.getActiveCompany().code || 'AAC') 
    : 'E';
  let targetOwner = (selectedOwner || activeCode || 'E').toUpperCase();
  if (targetOwner === 'ACC' || targetOwner === 'AAC') targetOwner = 'E';
  currentOrderLabelOwner = targetOwner;

  sel.innerHTML = companies.map(c => {
    let normCode = (c.code || '').toUpperCase();
    if (normCode === 'ACC' || normCode === 'AAC') normCode = 'E';
    const isSel = normCode === targetOwner;
    const typeLabel = c.is_manufacturing ? 'In-House Mfg' : 'Co-Marketing Partner';
    return `<option value="${normCode}" ${isSel ? 'selected' : ''}>${normCode} (${c.name} - ${typeLabel})</option>`;
  }).join('');
}

function onOrderClientChange(clientId) {
  const clientSelect = document.getElementById('client-select');
  if (!clientSelect) return;
  const clientText = (clientSelect.options[clientSelect.selectedIndex]?.text || '').toLowerCase();
  
  // Co-marketing company auto-detection: if client is Greenfield / GAS, switch brand to GAS
  if (clientText.includes('greenfield') || clientText.includes('gas')) {
    const ownerSel = document.getElementById('order-label-owner-select');
    if (ownerSel) {
      ownerSel.value = 'GAS';
      onOrderLabelOwnerChange('GAS');
    }
  } else if (clientText.includes('estimate') || clientText.includes('afield') || clientText.includes('anjani') || clientText.includes('acc') || clientText.includes('aac')) {
    const ownerSel = document.getElementById('order-label-owner-select');
    if (ownerSel) {
      ownerSel.value = 'E';
      onOrderLabelOwnerChange('E');
    }
  }
}

function onOrderLabelOwnerChange(ownerVal) {
  let val = (ownerVal || 'E').trim().toUpperCase();
  if (val === 'ACC' || val === 'AAC') val = 'E';
  currentOrderLabelOwner = val;
  console.log('[Orders] Brand / Label Owner changed to:', currentOrderLabelOwner);
  // Re-resolve labels for all current order items
  orderItems.forEach(it => {
    resolveOrderItemLabel(it, currentOrderLabelOwner);
  });
  renderOrderItems();
}

function resolveOrderItemLabel(item, labelOwner = currentOrderLabelOwner) {
  if (!item || !item.product_id) {
    item.label_inventory_id = null;
    item.label_name = null;
    item.label_stock = 0;
    return null;
  }

  const pMatch = cachedProductsList.find(p => p.id == item.product_id);
  const pName = item.product_name || pMatch?.name || '';
  const packSize = item.packaging_size || item.packing_size || '';

  let targetOwner = (labelOwner || currentOrderLabelOwner || 'E').toUpperCase();
  if (targetOwner === 'ACC' || targetOwner === 'AAC') targetOwner = 'E';

  // Search cachedLabelsList
  const matched = (cachedLabelsList || []).find(it => {
    if ((it.category || '').toLowerCase() !== 'labels') return false;

    // 1. Check Product match
    let pMatchOk = false;
    if (it.product_id && parseInt(it.product_id, 10) === parseInt(item.product_id, 10)) {
      pMatchOk = true;
    } else if (pName && it.name.toLowerCase().includes(pName.toLowerCase())) {
      pMatchOk = true;
    }
    if (!pMatchOk) return false;

    // 2. Check Size match
    const itSize = it.item_size || it.size || '';
    let sizeMatchOk = false;
    if (window.INVENTORY_CORE && window.INVENTORY_CORE.Units) {
      sizeMatchOk = window.INVENTORY_CORE.Units.sizesMatch(itSize, packSize);
      if (!sizeMatchOk && it.name) {
        sizeMatchOk = window.INVENTORY_CORE.Units.sizesMatch(it.name, packSize);
      }
    } else {
      sizeMatchOk = (itSize && packSize && itSize.toLowerCase().replace(/\s+/g, '') === packSize.toLowerCase().replace(/\s+/g, ''));
    }
    if (!sizeMatchOk) return false;

    // 3. Check Owner match (E vs GAS, with backward compatibility for ACC and AAC)
    const itSubtype = String(it.item_subtype || '').trim().toUpperCase();
    const itNameUpper = String(it.name || '').toUpperCase();
    if (itSubtype === targetOwner || (targetOwner === 'E' && (itSubtype === 'ACC' || itSubtype === 'AAC'))) return true;
    if (itNameUpper.includes(`[${targetOwner}]`) || itNameUpper.includes(`(${targetOwner})`)) return true;
    if (targetOwner === 'E' && (itNameUpper.includes('[ACC]') || itNameUpper.includes('(ACC)') || itNameUpper.includes('[AAC]') || itNameUpper.includes('(AAC)'))) return true;
    if (!itSubtype && (targetOwner === 'E' || targetOwner === 'ACC' || targetOwner === 'AAC')) return true;

    return false;
  });

  if (matched) {
    item.label_inventory_id = matched.id;
    item.label_name = matched.name;
    item.label_owner = targetOwner;
    item.label_stock = matched.total_stock !== undefined ? matched.total_stock : (parseFloat(matched.stock) || 0);
  } else {
    item.label_inventory_id = null;
    item.label_name = null;
    item.label_owner = targetOwner;
    item.label_stock = 0;
  }

  return matched;
}

function isPackagingSizeCompatible(pkgNameOrSize, targetSize) {
  if (!pkgNameOrSize || !targetSize) return false;
  const pStr = String(pkgNameOrSize).toLowerCase();
  const tStr = String(targetSize).toLowerCase();

  const pNums = pStr.match(/\d+(?:\.\d+)?/g) || [];
  const tNums = tStr.match(/\d+(?:\.\d+)?/g) || [];
  if (!pNums.length || !tNums.length) return false;

  const pNum = parseFloat(pNums[0]);
  const tNum = parseFloat(tNums[0]);
  if (pNum !== tNum) return false;

  const isMl = (s) => /\bml\b|m\.l\.|milli/i.test(s);
  const isLtr = (s) => /\b(ltr|lt|l|litre|liter)\b/i.test(s) && !isMl(s);
  const isKg = (s) => /\b(kg|kilo)\b/i.test(s);
  const isGm = (s) => /\b(gm|g|gram)\b/i.test(s) && !isKg(s);

  if (isMl(tStr) && !isMl(pStr)) return false;
  if (isLtr(tStr) && !isLtr(pStr)) return false;
  if (isKg(tStr) && !isKg(pStr)) return false;
  if (isGm(tStr) && !isGm(pStr)) return false;

  return true;
}

function updateOrderStockSummary() {
  const container = document.getElementById('order-stock-summary-box');
  const contentEl = document.getElementById('order-stock-summary-content');
  const badgeEl = document.getElementById('stock-summary-badge');
  const statsPillsEl = document.getElementById('stock-summary-stats-pills');
  if (!container || !contentEl) return;

  const validItems = orderItems.filter(it => it.product_id && (parseFloat(it.quantity) || 0) > 0);
  if (!validItems.length) {
    container.style.display = 'none';
    if (badgeEl) {
      badgeEl.className = 'badge badge-secondary';
      badgeEl.textContent = '⚠️ Verification Incomplete';
    }
    return;
  }

  container.style.display = 'block';

  let totalRequirementsCount = 0;
  let totalAvailableCount = 0;
  let totalShortageCount = 0;
  let nonLabelDeficits = 0;
  let labelDeficits = 0;

  const productCardsHtml = validItems.map((it, idx) => {
    const qty = parseFloat(it.quantity) || 0;
    const pName = it.product_name || `Product #${idx + 1}`;
    const packSize = it.packaging_size || '';
    const lineRows = [];
    let lineDeficits = 0;
    let lineLabelDeficit = false;

    // 1. Bulk Technical Formulation
    const packMl = (window.INVENTORY_CORE && window.INVENTORY_CORE.parsePackagingSize)
      ? window.INVENTORY_CORE.parsePackagingSize(packSize).volumeMl
      : (UTILS.parsePackSizeInMl(packSize) || 1000);
    const volumeLiters = (packMl / 1000) * qty;
    let techAvail = 0;
    let techName = `${pName} Formulation Bulk`;
    if (it.inventory_item_id) {
      const techItem = (allInventoryItemsList || []).find(t => t.id == it.inventory_item_id);
      if (techItem) {
        techAvail = techItem.total_stock || 0;
        techName = techItem.name;
      }
    }
    const techDeficit = techAvail < volumeLiters;
    totalRequirementsCount++;
    if (techDeficit) {
      totalShortageCount++;
      nonLabelDeficits++;
      lineDeficits++;
    } else {
      totalAvailableCount++;
    }
    lineRows.push({
      type: 'Technical Bulk',
      typeSlug: 'technical',
      item: `${techName} (E Technical)`,
      reqQty: volumeLiters.toFixed(2),
      availQty: techAvail.toFixed(2),
      unit: 'LTR',
      required: `${volumeLiters.toFixed(2)} L`,
      available: `${techAvail.toFixed(2)} L`,
      status: techDeficit ? 'Deficit' : 'OK',
      isLabel: false
    });

    // 2. Bottle
    if (it.bottle_inventory_id) {
      const btl = (cachedBottlesList || []).find(b => b.id == it.bottle_inventory_id);
      const btlAvail = btl ? (btl.total_stock || 0) : 0;
      const btlDeficit = btlAvail < qty;
      totalRequirementsCount++;
      if (btlDeficit) {
        totalShortageCount++;
        nonLabelDeficits++;
        lineDeficits++;
      } else {
        totalAvailableCount++;
      }
      const btlDisplay = btl ? (typeof UTILS !== 'undefined' && UTILS.formatPackagingDisplayName ? UTILS.formatPackagingDisplayName(btl, 'Bottles') : btl.name) : 'Bottle';
      lineRows.push({
        type: 'Bottle',
        typeSlug: 'bottle',
        item: `${btlDisplay} (E Packaging)`,
        reqQty: `${qty}`,
        availQty: `${btlAvail.toFixed(0)}`,
        unit: 'Nos',
        required: `${qty} Nos`,
        available: `${btlAvail.toFixed(0)} Nos`,
        status: btlDeficit ? 'Deficit' : 'OK',
        isLabel: false
      });
    }

    // 3. Box
    if (it.box_inventory_id) {
      const bx = (cachedBoxesList || []).find(b => b.id == it.box_inventory_id);
      const outerBoxes = (it.outer_boxes_consumed !== undefined && it.outer_boxes_consumed !== null)
        ? it.outer_boxes_consumed
        : Math.ceil(qty / (it.bottles_per_box || 12));
      it.outer_boxes_consumed = outerBoxes;
      const bxAvail = bx ? (bx.total_stock || 0) : 0;
      const bxDeficit = bxAvail < outerBoxes;
      totalRequirementsCount++;
      if (bxDeficit) {
        totalShortageCount++;
        nonLabelDeficits++;
        lineDeficits++;
      } else {
        totalAvailableCount++;
      }
      const bxDisplay = bx ? (typeof UTILS !== 'undefined' && UTILS.formatPackagingDisplayName ? UTILS.formatPackagingDisplayName(bx, 'Boxes') : bx.name) : 'Box';
      lineRows.push({
        type: 'Box',
        typeSlug: 'box',
        item: `${bxDisplay} (E Packaging)`,
        reqQty: `${outerBoxes}`,
        availQty: `${bxAvail.toFixed(0)}`,
        unit: 'Nos',
        required: `${outerBoxes} Nos`,
        available: `${bxAvail.toFixed(0)} Nos`,
        status: bxDeficit ? 'Deficit' : 'OK',
        isLabel: false
      });
    }

    // 4. Label (Company-specific)
    const lblMatch = resolveOrderItemLabel(it, currentOrderLabelOwner);
    const lblAvail = it.label_stock || 0;
    const lblDeficit = !lblMatch || (lblAvail < qty);
    totalRequirementsCount++;
    if (lblDeficit) {
      totalShortageCount++;
      labelDeficits++;
      lineLabelDeficit = true;
    } else {
      totalAvailableCount++;
    }
    lineRows.push({
      type: 'Label',
      typeSlug: 'label',
      item: lblMatch ? lblMatch.name : `${currentOrderLabelOwner} ${pName} ${packSize} Label`,
      reqQty: `${qty}`,
      availQty: lblMatch ? `${lblAvail.toFixed(0)}` : '0',
      unit: 'Nos',
      required: `${qty} Nos`,
      available: lblMatch ? `${lblAvail.toFixed(0)} Nos` : '0 (Not in inventory)',
      status: lblDeficit ? 'Deficit' : 'OK',
      isLabel: true
    });

    // Derive line status badge
    let lineBadgeClass = 'badge-success';
    let lineBadgeText = '✓ Available';
    if (lineDeficits > 0) {
      lineBadgeClass = 'badge-danger';
      lineBadgeText = '⚠️ Shortage';
    } else if (lineLabelDeficit) {
      lineBadgeClass = 'badge-warning';
      lineBadgeText = '⚠️ Label Shortage';
    }

    return `
      <div class="stock-line-card">
        <div class="stock-line-card-header">
          <div class="stock-line-card-title">
            <span class="stock-line-idx">#${idx + 1}</span>
            <span class="stock-line-pname">${pName}</span>
            <span class="stock-line-sep">•</span>
            <span class="stock-line-pack">${packSize}</span>
            <span class="stock-line-sep">•</span>
            <span class="stock-line-qty">Qty: <strong>${qty}</strong></span>
          </div>
          <span class="badge ${lineBadgeClass} stock-line-badge">${lineBadgeText}</span>
        </div>

        <!-- Desktop / Laptop / Tablet Table View (> 768px) -->
        <div class="stock-verify-table-desktop">
          <table class="data-table stock-verify-table">
            <thead>
              <tr>
                <th style="width: 15%;">Item Type</th>
                <th style="width: 37%;">Material Name</th>
                <th style="width: 14%; text-align: right;">Required Qty</th>
                <th style="width: 14%; text-align: right;">Available Stock</th>
                <th style="width: 8%; text-align: center;">Unit</th>
                <th style="width: 12%; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows.map(r => `
                <tr class="${r.status === 'Deficit' ? (r.isLabel ? 'row-label-deficit' : 'row-deficit') : 'row-ok'}">
                  <td class="col-type"><span class="sv-type-tag sv-type-${r.typeSlug}">${r.type}</span></td>
                  <td class="col-item">
                    ${r.isLabel ? `<span class="badge ${currentOrderLabelOwner === 'GAS' ? 'badge-info' : 'badge-purple'} brand-badge" style="font-size:9px; padding:1px 5px; margin-right:4px;">${currentOrderLabelOwner}</span>` : ''}
                    <span class="item-name-text">${r.item}</span>
                  </td>
                  <td class="col-req" style="text-align: right; font-weight: 600; white-space: nowrap;">${r.reqQty}</td>
                  <td class="col-avail" style="text-align: right; font-weight: 700; white-space: nowrap; color: ${r.status === 'Deficit' ? (r.isLabel ? 'var(--warning, #f59e0b)' : 'var(--danger, #ef4444)') : 'var(--accent, #1B5E20)'};">${r.availQty}</td>
                  <td class="col-unit" style="text-align: center; color: var(--text-muted); font-size: 11px; white-space: nowrap;">${r.unit}</td>
                  <td class="col-status" style="text-align: center;">
                    <span class="badge ${r.status === 'Deficit' ? (r.isLabel ? 'badge-warning' : 'badge-danger') : 'badge-success'}" style="font-size: 9.5px; padding: 2px 7px;">${r.status === 'Deficit' ? (r.isLabel ? 'DEFICIT' : 'SHORTAGE') : 'OK'}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Mobile Responsive Card View (<= 768px) -->
        <div class="stock-verify-cards-mobile">
          ${lineRows.map(r => `
            <div class="sv-mobile-card ${r.status === 'Deficit' ? (r.isLabel ? 'card-label-deficit' : 'card-deficit') : 'card-ok'}">
              <div class="sv-card-top">
                <span class="sv-type-tag sv-type-${r.typeSlug}">${r.type}</span>
                <span class="badge ${r.status === 'Deficit' ? (r.isLabel ? 'badge-warning' : 'badge-danger') : 'badge-success'} sv-status-badge">
                  ${r.status === 'Deficit' ? (r.isLabel ? '⚠️ DEFICIT' : '✕ SHORTAGE') : '✓ OK'}
                </span>
              </div>
              <div class="sv-card-title">
                ${r.isLabel ? `<span class="badge ${currentOrderLabelOwner === 'GAS' ? 'badge-info' : 'badge-purple'} brand-badge" style="font-size:9px; padding:1px 5px; margin-right:4px;">${currentOrderLabelOwner}</span>` : ''}
                <span class="sv-item-name">${r.item}</span>
              </div>
              <div class="sv-card-grid">
                <div class="sv-grid-row">
                  <span class="sv-grid-label">Required Quantity</span>
                  <span class="sv-grid-val"><strong>${r.reqQty}</strong> <span class="sv-unit">${r.unit}</span></span>
                </div>
                <div class="sv-grid-row">
                  <span class="sv-grid-label">Available Stock</span>
                  <span class="sv-grid-val ${r.status === 'Deficit' ? (r.isLabel ? 'val-warning' : 'val-danger') : 'val-success'}">
                    <strong>${r.availQty}</strong> <span class="sv-unit">${r.unit}</span>
                  </span>
                </div>
                <div class="sv-grid-row sv-status-row">
                  <span class="sv-grid-label">Status</span>
                  <span class="sv-status-pill ${r.status === 'Deficit' ? (r.isLabel ? 'status-pill-warning' : 'status-pill-danger') : 'status-pill-success'}">
                    ${r.status === 'Deficit' ? (r.isLabel ? '⚠️ Label Deficit' : '✕ Insufficient Stock') : '✓ In Stock'}
                  </span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Update top stats pills
  if (statsPillsEl) {
    statsPillsEl.innerHTML = `
      <span class="badge sv-pill sv-pill-neutral">
        <strong>${validItems.length}</strong> ${validItems.length === 1 ? 'Product' : 'Products'}
      </span>
      <span class="badge sv-pill sv-pill-neutral">
        <strong>${totalRequirementsCount}</strong> Requirements
      </span>
      <span class="badge badge-success sv-pill">
        <strong>${totalAvailableCount}</strong> Available
      </span>
      ${totalShortageCount > 0 ? `
      <span class="badge ${nonLabelDeficits > 0 ? 'badge-danger' : 'badge-warning'} sv-pill">
        <strong>${totalShortageCount}</strong> Shortage${totalShortageCount > 1 ? 's' : ''}
      </span>` : ''}
    `;
  }

  // Update top overall status badge
  if (badgeEl) {
    if (nonLabelDeficits > 0) {
      badgeEl.className = 'badge badge-danger';
      badgeEl.textContent = '⚠️ Stock Shortage Detected';
    } else if (labelDeficits > 0) {
      badgeEl.className = 'badge badge-warning';
      badgeEl.textContent = '⚠️ Label Shortage — Order Can Be Saved';
    } else {
      badgeEl.className = 'badge badge-success';
      badgeEl.textContent = '✓ All Required Stock Available';
    }
  }

  contentEl.innerHTML = productCardsHtml;
}

let currentOrderLabelOwner = 'E';
let cachedLabelsList = [];
let allInventoryItemsList = [];
/* orders.js */
let allOrders = [], orderItems = [], editingOrderId = null;
window.updateOrderStockSummary = updateOrderStockSummary;
window.getOrderItems = () => orderItems;
window.setOrderItems = (items) => { orderItems = items; return orderItems; };
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
let cachedBoxesList = [];

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
      allInventoryItemsList = invRes.data.map(it => ({
        ...it,
        total_stock: stockMap[it.id] !== undefined ? stockMap[it.id] : (parseFloat(it.stock) || 0)
      }));
      cachedBottlesList = allInventoryItemsList.filter(it => it.category === 'Bottles');
      cachedBoxesList = allInventoryItemsList.filter(it => it.category === 'Boxes' || (it.category && it.category.toLowerCase().includes('box')) || (it.name && it.name.toLowerCase().includes('box'))).map(it => ({
        ...it,
        name: (it.name || '').replace(/\s*box\s+box\s*/gi, ' Box ').trim()
      }));
      cachedLabelsList = allInventoryItemsList.filter(it => it.category === 'Labels');
    }
  } catch (e) {
    console.error('Failed to fetch packaging/inventory data:', e);
  }
}

async function loadOrders(showSkeleton = true) {
  console.log('Loading orders...');
  updatePageDebug('Loading Orders...', '#0C3925');
  try {
    if (showSkeleton) {
      UTILS.renderTableSkeleton('orders-table');
    }
    await DB.initDB();

    // High performance: fetch packaging, inventory, stock batches, orders, clients, and order_items all in parallel!
    const pkgQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('product_packaging').select('*')) : window.dbClient.from('product_packaging').select('*');
    const invQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('inventory_items').select('*')) : window.dbClient.from('inventory_items').select('*');
    const batchQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory')) : window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory');
    const ordersQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('orders').select('*').order('id', { ascending: false })) : window.dbClient.from('orders').select('*').order('id', { ascending: false });
    const clientsQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('clients').select('id, name')) : window.dbClient.from('clients').select('id, name');
    const orderItemsQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('order_items').select('*')) : window.dbClient.from('order_items').select('*');

    const [pkgRes, invRes, batchRes, ordersRes, clientsRes, orderItemsRes] = await Promise.all([
      pkgQuery,
      invQuery,
      batchQuery,
      ordersQuery,
      clientsQuery,
      orderItemsQuery
    ]);

    if (ordersRes.error) {
      if (ordersRes.error.message && ordersRes.error.message.toLowerCase().includes('jwt issued at future')) {
        console.warn('Clock drift detected on orders load. Retrying in 1.2s...');
        await new Promise(r => setTimeout(r, 1200));
        const retry = await (window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('orders').select('*').order('id', { ascending: false })) : window.dbClient.from('orders').select('*').order('id', { ascending: false }));
        if (!retry.error) {
          ordersRes = retry;
        } else {
          throw ordersRes.error;
        }
      } else {
        throw ordersRes.error;
      }
    }

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
      cachedBoxesList = invRes.data.filter(it => it.category === 'Boxes' || (it.category && it.category.toLowerCase().includes('box')) || (it.name && it.name.toLowerCase().includes('box'))).map(it => ({
        ...it,
        name: (it.name || '').replace(/\s*box\s+box\s*/gi, ' Box ').trim(),
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
      let dispatchMeta = null;
      if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
        try {
          const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
          dispatchMeta = JSON.parse(jsonStr);
        } catch (_) {}
      }

      let totalOrdUnits = 0;
      let totalDispUnits = 0;
      o.items = itemsByOrderId.get(o.id) || [];
      o.items.forEach((it, itIdx) => {
        const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
        let metaMatch = matchFn ? matchFn(it, dispatchMeta?.items_meta, itIdx) : null;
        if (!metaMatch && dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
          const normP = (window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
          const itPack = normP(it.packing_size || it.packaging_size);
          metaMatch = dispatchMeta.items_meta.find(m => (m.id && String(m.id) === String(it.id)) || (String(m.product_id) === String(it.product_id) && normP(m.packing_size || m.packaging_size) === itPack));
        }
        if (metaMatch) {
          if (!it.bottle_inventory_id && metaMatch.bottle_inventory_id) it.bottle_inventory_id = metaMatch.bottle_inventory_id;
          it.box_inventory_id = metaMatch.box_inventory_id || null;
          it.box_name = metaMatch.box_name || null;
          it.outer_boxes_consumed = metaMatch.outer_boxes_consumed || 0;
          it.box_quantity = metaMatch.box_quantity || metaMatch.boxes || 0;
          it.loose_quantity = metaMatch.loose_quantity || metaMatch.loose || 0;
          it.bottles_per_box = metaMatch.bottles_per_box || metaMatch.unitsPerBox || 0;
          it.total_volume = metaMatch.total_volume || null;
        }

        // Dynamic aggregation of qualifying fulfilled units from dispatch records in dispatchMeta.dispatches
        let qualifyingDispUnits = 0;
        if (dispatchMeta && Array.isArray(dispatchMeta.dispatches)) {
          const normP = (window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
          const itPack = normP(it.packing_size || it.packaging_size);
          dispatchMeta.dispatches.forEach(d => {
            const dSt = (d.status || '').toLowerCase().trim();
            if (dSt === 'dispatched' || d.stock_deducted === true) {
              if (Array.isArray(d.items)) {
                d.items.forEach(di => {
                  const diPack = normP(di.packaging_size || di.packing_size);
                  const match = (di.order_item_id && (di.order_item_id == it.id || di.order_item_id == it.order_item_id)) ||
                    (String(di.product_id) === String(it.product_id) && (!diPack || !itPack || diPack === itPack));
                  if (match) {
                    qualifyingDispUnits += parseInt(di.total_units_dispatched || di.quantity || 0, 10);
                  }
                });
              }
            }
          });
        }

        const ordUnits = parseInt(it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? it.quantity : (it.ordered_units || metaMatch?.ordered_units || it.total_units || 0), 10) || 0;
        const dispUnits = Math.min(ordUnits, Math.max(qualifyingDispUnits, parseInt(it.dispatched_units || metaMatch?.dispatched_units || 0, 10)));
        const remUnits = Math.max(0, ordUnits - dispUnits);

        it.ordered_units = ordUnits;
        it.dispatched_units = dispUnits;
        it.remaining_units = remUnits;

        if (!it.bottles_per_box) {
          const normP = (window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
          const itPack = normP(it.packing_size || it.packaging_size);
          const pkg = allPackagingData.find(p => String(p.product_id) === String(it.product_id) && normP(p.packaging_size || p.size) === itPack) || allPackagingData.find(p => String(p.product_id) === String(it.product_id));
          const upb = pkg ? (parseInt(pkg.units_per_box || pkg.bottles_per_box, 10) || 1) : 1;
          it.bottles_per_box = upb;
          if (it.box_quantity === undefined) {
            if (upb > 1) {
              it.box_quantity = Math.floor(ordUnits / upb);
              it.loose_quantity = ordUnits % upb;
            } else {
              it.box_quantity = 0;
              it.loose_quantity = ordUnits;
            }
          }
        }

        totalOrdUnits += ordUnits;
        totalDispUnits += dispUnits;

        allDetailedItems.push({
          id: it.id,
          order_id: o.id,
          order_no: o.order_no,
          client_display: o.client_display,
          date: o.date,
          status: o.status,
          dispatch_status: o.dispatch_status,
          product_name: it.product_name,
          product_id: it.product_id,
          packaging_size: it.packaging_size || it.packing_size || '',
          bottle_inventory_id: it.bottle_inventory_id,
          box_inventory_id: it.box_inventory_id,
          box_name: it.box_name,
          box_quantity: it.box_quantity || 0,
          loose_quantity: it.loose_quantity || 0,
          bottles_per_box: it.bottles_per_box || 1,
          total_volume: it.total_volume,
          quantity: it.quantity,
          ordered_units: ordUnits,
          dispatched_units: dispUnits,
          remaining_units: remUnits,
          unit_price: it.unit_price,
          total: it.total
        });
      });

      // Authoritative dispatch status derivation
      if (totalOrdUnits > 0 && totalDispUnits >= totalOrdUnits) {
        o.dispatch_status = 'Fully Dispatched';
      } else if (totalDispUnits > 0) {
        o.dispatch_status = 'Partially Dispatched';
      } else if (dispatchMeta && dispatchMeta.dispatch_status) {
        o.dispatch_status = dispatchMeta.dispatch_status;
      } else if (dispatchMeta && Array.isArray(dispatchMeta.dispatches) && dispatchMeta.dispatches.length > 0) {
        const activeDispatches = dispatchMeta.dispatches.filter(d => (d.status || '').toLowerCase() !== 'cancelled');
        o.dispatch_status = activeDispatches.length > 0 ? (activeDispatches[0].status || 'Pending Verification') : 'Pending Verification';
      } else {
        o.dispatch_status = 'Pending Verification';
      }
      // Keep detailed items in sync with parent order dispatch_status
      allDetailedItems.filter(it => it.order_id === o.id).forEach(it => {
        it.dispatch_status = o.dispatch_status;
      });
    });

    // Populate client filter dropdown if present
    const clientFilterEl = document.getElementById('order-client-filter');
    if (clientFilterEl && clientsRes.data) {
      const curVal = clientFilterEl.value;
      let opts = '<option value="">All Clients</option>';
      clientsRes.data.forEach(c => {
        opts += `<option value="${c.id}">${c.name}</option>`;
      });
      clientFilterEl.innerHTML = opts;
      if (curVal) clientFilterEl.value = curVal;
    }

    window.allOrders = allOrders;
    window.allClients = (clientsRes && clientsRes.data) ? clientsRes.data : (window.allClients || []);
    window.allPackagingData = (pkgRes && pkgRes.data) ? pkgRes.data : (window.allPackagingData || []);
    window.loadOrders = loadOrders;

    // Strict synchronization of dispatches with loaded orders
    if (allOrders.length === 0) {
      window.allDispatches = [];
      if (window.DISPATCH_SERVICE && typeof window.DISPATCH_SERVICE.clearAllDispatches === 'function') {
        window.DISPATCH_SERVICE.clearAllDispatches();
      }
      if (window.DISPATCH_UI) {
        if (typeof window.DISPATCH_UI.setAllDispatches === 'function') {
          window.DISPATCH_UI.setAllDispatches([]);
        }
        if (typeof window.DISPATCH_UI.renderDispatchesTable === 'function') {
          window.DISPATCH_UI.renderDispatchesTable();
        }
      }
    } else if (Array.isArray(window.allDispatches) && window.allDispatches.length > 0) {
      const activeIds = new Set(allOrders.map(o => String(o.id)));
      const activeNos = new Set(allOrders.map(o => String(o.order_no || '').trim().toUpperCase()));
      window.allDispatches = window.allDispatches.filter(d => {
        return (d.order_id && activeIds.has(String(d.order_id))) ||
               (d.order_no && activeNos.has(String(d.order_no).trim().toUpperCase()));
      });
      if (window.DISPATCH_UI && typeof window.DISPATCH_UI.setAllDispatches === 'function') {
        window.DISPATCH_UI.setAllDispatches(window.allDispatches);
      }
    }

    applyFiltersAndRender();
    updatePageDebug('Ready (' + allOrders.length + ')', '#0C3925');
    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    if (window.DISPATCH_UI && typeof window.DISPATCH_UI.loadDispatches === 'function') {
      window.DISPATCH_UI.loadDispatches().catch(() => {});
    }
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
  const selectedClientId = document.getElementById('order-client-filter')?.value || '';
  if (activeOrderTab === 'Orders') {
    const q = (document.getElementById('search-input')?.value || '').toLowerCase();
    let data = allOrders;
    if (selectedClientId) {
      data = data.filter(o => String(o.client_id) === String(selectedClientId));
    }
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
    if (selectedClientId) {
      data = data.filter(it => {
        const parentOrder = allOrders.find(o => o.id === it.order_id);
        return parentOrder && String(parentOrder.client_id) === String(selectedClientId);
      });
    }
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

let ordersTableEnhancer = null;

function renderOrdersSlice(slice) {
  const cardsContainer = document.getElementById('orders-cards-container');
  const tbody = document.querySelector('#orders-table tbody');

  const safeEscape = (str) => {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  };

  // 1. Render Responsive Order Summary Cards
  if (cardsContainer) {
    cardsContainer.innerHTML = slice.map(o => {
      const totalAmount = parseFloat(o.total_amount) || 0;
      const paidAmount = parseFloat(o.paid_amount) || 0;
      const balance = totalAmount - paidAmount;

      let statusVal = o.status || 'Pending';
      if (statusVal === 'Delivered') statusVal = 'Completed';
      const isCompleted = statusVal.toLowerCase() === 'completed';
      const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

      let dispStatus = o.dispatch_status;
      const items = o.items || [];
      const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0), 0);
      const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
      if (!dispStatus) {
        if (totalOrd > 0 && totalDisp >= totalOrd) {
          dispStatus = 'Fully Dispatched';
        } else if (totalDisp > 0) {
          dispStatus = 'Partially Dispatched';
        } else {
          dispStatus = 'Pending Verification';
        }
      }
      const dispatchBadge = UTILS.statusBadge(dispStatus);

      let balanceClass = 'text-muted';
      if (balance > 0.005) {
        balanceClass = 'text-danger font-bold';
      } else if (balance < -0.005) {
        balanceClass = 'text-info font-bold';
      } else {
        balanceClass = 'text-success font-semibold';
      }

      const dispPercent = totalOrd > 0 ? Math.min(100, Math.round((totalDisp / totalOrd) * 100)) : (dispStatus === 'Fully Dispatched' ? 100 : 0);
      const dispCountText = totalOrd > 0 ? `${totalDisp} / ${totalOrd} units dispatched (${dispPercent}%)` : dispStatus;
      const canDispatch = dispStatus !== 'Fully Dispatched' && (o.status || '').toLowerCase() !== 'cancelled';

      return `
        <div class="order-summary-card" data-order-id="${o.id}">
          <!-- Order Header -->
          <div class="order-summary-card-header">
            <div class="order-summary-header-meta">
              <span class="order-summary-order-no">${o.order_no}</span>
              <span class="order-summary-date">${UTILS.fmtDate(o.date)}</span>
            </div>
            <div class="order-summary-header-badges">
              ${dispatchBadge}
              ${statusBadge}
            </div>
          </div>

          <!-- Client Information -->
          <div class="order-summary-client-row">
            <span class="order-summary-client-label">Client</span>
            <span class="order-summary-client-name" title="${safeEscape(o.client_display || '—')}">${safeEscape(o.client_display || '—')}</span>
          </div>

          <div class="order-summary-card-divider"></div>

          <!-- Financial Summary (Total, Paid, Balance) -->
          <div class="order-summary-finance-grid">
            <div class="finance-box">
              <span class="finance-box-label">Total</span>
              <span class="finance-box-val">${UTILS.fmtCurrency(totalAmount)}</span>
            </div>
            <div class="finance-box">
              <span class="finance-box-label">Paid</span>
              <span class="finance-box-val text-success font-semibold">${UTILS.fmtCurrency(paidAmount)}</span>
            </div>
            <div class="finance-box">
              <span class="finance-box-label">Balance</span>
              <span class="finance-box-val ${balanceClass}">${UTILS.fmtCurrency(balance)}</span>
            </div>
          </div>

          <!-- Dispatch Progress Summary -->
          <div class="order-summary-dispatch-progress">
            <div class="dispatch-progress-label">
              <span>Dispatch Progress</span>
              <span class="dispatch-progress-counts font-semibold">${dispCountText}</span>
            </div>
            <div class="dispatch-progress-bar-wrap">
              <div class="dispatch-progress-bar-fill" style="width: ${dispPercent}%;"></div>
            </div>
          </div>

          <!-- Actions -->
          <div class="order-summary-card-actions">
            <button type="button" class="order-card-btn view" onclick="viewOrder(${o.id})" title="View Details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View Details</span>
            </button>
            <button type="button" class="order-card-btn edit" onclick="openEdit(${o.id})" title="Edit Order">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Edit</span>
            </button>
            ${canDispatch ? `
              <button type="button" class="order-card-btn dispatch" onclick="openPrepareDispatch(${o.id})" title="Prepare Dispatch Slip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg>
                <span style="color:#ffffff;">Dispatch</span>
              </button>
            ` : ''}
            <button type="button" class="order-card-btn delete" onclick="deleteOrder(${o.id})" title="Delete Order">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Also populate table fallback if tbody exists
  if (tbody) {
    tbody.innerHTML = slice.map(o => {
      const totalAmount = parseFloat(o.total_amount) || 0;
      const paidAmount = parseFloat(o.paid_amount) || 0;
      const balance = totalAmount - paidAmount;
      const rowBg = balance <= 0 ? 'rgba(12, 57, 37, 0.05)' : 'rgba(239, 68, 68, 0.05)';
      
      let statusVal = o.status || 'Pending';
      if (statusVal === 'Delivered') statusVal = 'Completed';
      const statusBadge = UTILS.statusBadge(statusVal);

      let dispStatus = o.dispatch_status;
      if (!dispStatus) {
        const items = o.items || [];
        const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.quantity, 10) || 0), 0);
        const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
        if (totalOrd > 0 && totalDisp >= totalOrd) {
          dispStatus = 'Fully Dispatched';
        } else if (totalDisp > 0) {
          dispStatus = 'Partially Dispatched';
        } else {
          dispStatus = 'Pending Verification';
        }
      }
      const dispatchBadge = UTILS.statusBadge(dispStatus);

      let balanceClass = 'text-muted';
      if (balance > 0.005) {
        balanceClass = 'text-danger font-bold';
      } else if (balance < -0.005) {
        balanceClass = 'text-info font-bold';
      } else {
        balanceClass = 'text-success font-semibold';
      }

      return `<tr style="background: ${rowBg}">
        <td class="cell-bold">${o.order_no}</td>
        <td class="cell-client">${o.client_display || '—'}</td>
        <td>${UTILS.fmtDate(o.date)}</td>
        <td class="cell-amount text-right">${UTILS.fmtCurrency(totalAmount)}</td>
        <td class="cell-amount text-right text-success font-semibold">${UTILS.fmtCurrency(paidAmount)}</td>
        <td class="cell-amount text-right ${balanceClass}">${UTILS.fmtCurrency(balance)}</td>
        <td class="text-center">${dispatchBadge}</td>
        <td class="text-center">${statusBadge}</td>
        <td class="text-center"><div class="row-actions" style="justify-content:center;">
          <button class="action-btn view" onclick="viewOrder(${o.id})" title="View Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="action-btn edit" onclick="openEdit(${o.id})" title="Edit Order"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          ${dispStatus !== 'Fully Dispatched' && (o.status || '').toLowerCase() !== 'cancelled' ? `
            <button class="action-btn" onclick="openPrepareDispatch(${o.id})" title="Prepare Dispatch Slip" style="color:var(--primary);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg></button>
          ` : ''}
          <button class="action-btn delete" onclick="deleteOrder(${o.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div></td>
      </tr>`;
    }).join('');
    UTILS.applyMobileTableLabels('orders-table');
  }
}

function renderTable(data) {
  const cardsContainer = document.getElementById('orders-cards-container');
  const tbody = document.querySelector('#orders-table tbody');
  const countEl = document.getElementById('total-info');
  if (countEl) countEl.textContent = `${data.length} order${data.length !== 1 ? 's' : ''}`;
  
  if (!data.length) {
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;">
          <h3>No orders found</h3>
          <p>Create your first order or adjust search filters.</p>
        </div>
      `;
    }
    if (tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><div class="empty-state"><h3>No orders found</h3><p>Create your first order or adjust search filters.</p></div></td></tr>`;
    }
    const pag = document.querySelector('#orders-table-wrap .pagination');
    if (pag) pag.style.display = 'none';
    return;
  }

  if (window.TableEnhancer) {
    if (!ordersTableEnhancer) {
      ordersTableEnhancer = new window.TableEnhancer({
        tableId: 'orders-table',
        pageSize: 25,
        defaultSortKey: 'id',
        defaultSortOrder: 'desc',
        onRender: (pageSlice) => renderOrdersSlice(pageSlice)
      });
    }
    ordersTableEnhancer.setData(data);
    return;
  }

  renderOrdersSlice(data.slice(0, 50));
}

function renderOrderItemsDetailTable(data) {
  const cardsContainer = document.getElementById('order-items-cards-container');
  const tbody = document.querySelector('#order-items-detail-table tbody');
  const totalInfo = document.getElementById('items-total-info');
  if (totalInfo) totalInfo.textContent = `${data.length} item${data.length !== 1 ? 's' : ''}`;

  if (!data.length) {
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="empty-state order-items-empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;color:#94a3b8;opacity:0.6;margin-bottom:14px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No items found</h3>
          <p>No order items match the selected criteria.</p>
        </div>
      `;
    }
    if (tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="12"><div class="empty-state"><h3>No items found</h3><p>No order items match the selected criteria.</p></div></td></tr>`;
    }
    return;
  }

  const safeEscape = (str) => {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  };

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

  // 1. Render Card Layout
  if (cardsContainer) {
    cardsContainer.innerHTML = data.map(it => {
      let statusVal = it.status || 'Pending';
      if (statusVal === 'Delivered') statusVal = 'Completed';
      const isCompleted = statusVal.toLowerCase() === 'completed';
      const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

      const packSizeStr = getPackSizeStr(it);
      const ordUnits = parseInt(it.ordered_units || it.quantity, 10) || 0;
      const dispUnits = parseInt(it.dispatched_units || 0, 10);
      const remUnits = it.remaining_units !== undefined ? parseInt(it.remaining_units, 10) : Math.max(0, ordUnits - dispUnits);

      let pkgBreakdownHtml = '';
      if (it.box_quantity > 0 || it.loose_quantity > 0) {
        pkgBreakdownHtml = UTILS.formatPackagingBreakdown({
          boxes: it.box_quantity,
          unitsPerBox: it.bottles_per_box,
          looseUnits: it.loose_quantity,
          totalUnits: ordUnits,
          unit: 'units',
          volumeOrWeight: it.total_volume ? `${it.total_volume} L` : null
        });
      }

      const isOrderFullyDispatched = it.dispatch_status === 'Fully Dispatched';
      const isCancelled = (it.status || '').toLowerCase() === 'cancelled';
      const canDispatch = !isOrderFullyDispatched && !isCancelled;

      return `
        <div class="order-item-card" data-order-id="${it.order_id}" data-item-id="${it.id || ''}">
          <!-- A. Order Information -->
          <div class="order-item-card-header">
            <div class="order-item-header-meta">
              <span class="order-item-order-no">${formatOrderNo(it.order_no)}</span>
              <span class="order-item-date">${UTILS.fmtDate(it.date)}</span>
            </div>
            <div class="order-item-header-status">${statusBadge}</div>
          </div>

          <!-- Client Details -->
          <div class="order-item-client-row">
            <span class="order-item-client-label">Client</span>
            <span class="order-item-client-name" title="${safeEscape(it.client_display || '—')}">${safeEscape(it.client_display || '—')}</span>
          </div>

          <div class="order-item-card-divider"></div>

          <!-- B. Product Information -->
          <div class="order-item-product-section">
            <div class="order-item-product-title-row">
              <h4 class="order-item-product-name">${safeEscape(it.product_name || '—')}</h4>
              <span class="badge badge-neutral order-item-pack-badge">${packSizeStr}</span>
            </div>
            ${pkgBreakdownHtml ? `<div class="order-item-packaging-detail">${pkgBreakdownHtml}</div>` : ''}
          </div>

          <!-- C. Quantity and Fulfilment (3 distinct metric blocks) -->
          <div class="order-item-quantities-grid">
            <div class="order-item-qty-box qty-ordered">
              <span class="qty-label">Ordered</span>
              <span class="qty-val">${ordUnits} <small>units</small></span>
            </div>
            <div class="order-item-qty-box qty-dispatched">
              <span class="qty-label">Dispatched</span>
              <span class="qty-val ${dispUnits > 0 ? 'text-info' : 'text-muted'}">${dispUnits} <small>units</small></span>
            </div>
            <div class="order-item-qty-box qty-remaining ${remUnits > 0 ? 'is-pending' : 'is-fulfilled'}">
              <span class="qty-label">Remaining</span>
              <span class="qty-val ${remUnits > 0 ? 'text-primary' : 'text-success'}">${remUnits} <small>units</small></span>
            </div>
          </div>

          <!-- D. Financial Information -->
          <div class="order-item-finance-row">
            <div class="order-item-finance-col">
              <span class="finance-label">Unit Price</span>
              <span class="finance-val">${UTILS.fmtCurrency(it.unit_price)}</span>
            </div>
            <div class="order-item-finance-col text-right">
              <span class="finance-label">Line Total</span>
              <span class="finance-total">${UTILS.fmtCurrency(it.total)}</span>
            </div>
          </div>

          <!-- E. Actions -->
          <div class="order-item-card-actions">
            <button type="button" class="order-card-btn view" onclick="viewOrder(${it.order_id})" title="View Details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View Details</span>
            </button>
            <button type="button" class="order-card-btn edit" onclick="openEdit(${it.order_id})" title="Edit Order">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Edit</span>
            </button>
            ${canDispatch ? `
              <button type="button" class="order-card-btn dispatch" onclick="openPrepareDispatch(${it.order_id})" title="Prepare Dispatch">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg>
                <span style="color:#ffffff;">Dispatch</span>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Also populate table fallback if tbody exists
  if (tbody) {
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

      const blockBg = (groupIdx % 2 === 0) 
        ? 'background-color: rgba(255, 255, 255, 0.035);' 
        : 'background-color: rgba(12, 57, 37, 0.07);';

      items.forEach((it, idx) => {
        const isFirstRow = idx === 0;
        const isLastRow = idx === items.length - 1;
        const rowSpanAttr = isFirstRow ? ` rowspan="${items.length}"` : '';
        
        const borderStyle = isLastRow 
          ? 'border-bottom: 2px solid rgba(12, 57, 37, 0.35);' 
          : 'border-bottom: 1px dashed rgba(255, 255, 255, 0.08);';

        const packSizeStr = getPackSizeStr(it);
        const ordUnits = parseInt(it.ordered_units || it.quantity, 10) || 0;
        const dispUnits = parseInt(it.dispatched_units || 0, 10);
        const remUnits = it.remaining_units !== undefined ? parseInt(it.remaining_units, 10) : Math.max(0, ordUnits - dispUnits);

        const pkgBreakdownHtml = (it.box_quantity > 0 || it.loose_quantity > 0)
          ? UTILS.formatPackagingBreakdown({
              boxes: it.box_quantity,
              unitsPerBox: it.bottles_per_box,
              looseUnits: it.loose_quantity,
              totalUnits: ordUnits,
              unit: 'units',
              volumeOrWeight: it.total_volume ? `${it.total_volume} L` : null
            })
          : `<span style="font-weight:600;">${ordUnits} units</span>`;

        rowsHtml += `<tr style="${blockBg} ${borderStyle}">`;
        if (isFirstRow) {
          rowsHtml += `
            <td class="cell-bold"${rowSpanAttr} style="vertical-align:middle; padding: 7px 8px; font-weight:700; font-size:12px; white-space:nowrap;">${first.order_no}</td>
            <td class="cell-client"${rowSpanAttr} style="vertical-align:middle; padding: 7px 8px; font-size:12px; line-height:1.35;">${first.client_display || '—'}</td>
            <td${rowSpanAttr} style="vertical-align:middle; padding: 7px 8px; font-size:11.5px; white-space:nowrap;">${UTILS.fmtDate(first.date)}</td>
          `;
        }
        rowsHtml += `
          <td class="cell-product" style="font-weight:600; color:var(--primary); padding: 7px 8px; font-size:12px; line-height:1.35;">${it.product_name || '—'}</td>
          <td style="padding: 7px 8px; font-size:11.5px; white-space:nowrap;"><span class="badge badge-neutral" style="padding: 2px 7px; font-size:11px;">${packSizeStr}</span></td>
          <td style="padding: 7px 8px; font-size:11.5px; text-align:right;">${pkgBreakdownHtml}</td>
          <td class="text-center" style="padding: 7px 8px; font-size:12px; text-align:center;"><span class="badge ${dispUnits > 0 ? 'badge-info' : 'badge-neutral'}">${dispUnits}</span></td>
          <td class="text-center" style="padding: 7px 8px; font-size:12px; font-weight:700; color:${remUnits === 0 ? 'var(--text-muted)' : 'var(--primary)'}; text-align:center;">${remUnits}</td>
          <td class="cell-amount text-right" style="padding: 7px 8px; font-size:12px; text-align:right;">${UTILS.fmtCurrency(it.unit_price)}</td>
          <td class="cell-amount text-right" style="font-weight:700; padding: 7px 8px; font-size:12px; text-align:right;">${UTILS.fmtCurrency(it.total)}</td>
        `;
        if (isFirstRow) {
          rowsHtml += `
            <td class="text-center"${rowSpanAttr} style="vertical-align:middle; padding: 7px 8px; text-align:center;">${statusBadge}</td>
            <td class="text-center"${rowSpanAttr} style="vertical-align:middle; padding: 7px 8px; text-align:center;"><div class="row-actions" style="gap:5px; justify-content:center;">
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
}

async function viewOrder(id) {
  try {
    const cachedOrder = (window.allOrders || []).find(o => String(o.id) === String(id));
    let o = (cachedOrder && Array.isArray(cachedOrder.items) && cachedOrder.items.length) ? cachedOrder : null;
    if (!o) {
      const { data: dbO, error: oErr } = await window.dbClient.from('orders').select('*').eq('id', id).single();
      if (oErr) throw oErr;
      const { data: itemsData } = await window.dbClient.from('order_items').select('*').eq('order_id', id);
      dbO.items = itemsData || [];
      o = dbO;
    }

    const balance = parseFloat(o.total_amount) - parseFloat(o.paid_amount || 0);
    let statusVal = o.status || 'Pending';
    if (statusVal === 'Delivered') statusVal = 'Completed';
    const isCompleted = statusVal.toLowerCase() === 'completed';
    const statusBadge = `<span class="badge ${isCompleted ? 'badge-success' : 'badge-warning'}">${statusVal}</span>`;

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

    let itemsHtml = (o.items || []).map(it => {
      const pSize = cleanSizeLabel(it.packing_size || it.packaging_size || '', '');
      let btlName = null;
      let boxName = null;
      if (it.bottle_inventory_id) {
        const b = cachedBottlesList.find(x => x.id == it.bottle_inventory_id);
        if (b) btlName = b.name;
      }
      if (dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
        const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
        const metaMatch = matchFn ? matchFn(it, dispatchMeta.items_meta) : null;
        if (metaMatch) {
          if (!btlName && metaMatch.bottle_inventory_id) {
            const b = cachedBottlesList.find(x => x.id == metaMatch.bottle_inventory_id);
            if (b) btlName = b.name;
          }
          boxName = metaMatch.box_name || (cachedBoxesList.find(bx => bx.id == metaMatch.box_inventory_id)?.name);
        }
      }

      return `
        <div style="padding: 10px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
            <span style="font-weight: 700; color: var(--text-primary); font-size: 13.5px; word-break: break-word;">${it.product_name}</span>
            <span style="font-weight: 800; color: var(--accent); font-size: 13.5px; white-space: nowrap;">${UTILS.fmtCurrency(it.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--text-muted);">
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              <div>Pack: <span class="badge badge-neutral" style="font-size:11px; padding:2px 6px;">${pSize || '—'}</span></div>
              ${btlName ? `<div>Bottle: <span class="badge badge-neutral" style="font-size:11px; padding:2px 6px;">${btlName}</span></div>` : ''}
              ${boxName ? `<div>Box: <span class="badge badge-neutral" style="font-size:11px; padding:2px 6px;">${boxName}</span></div>` : ''}
              ${(() => {
                let lbl = null;
                if (dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
                  const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
                  const m = matchFn ? matchFn(it, dispatchMeta.items_meta) : null;
                  if (m && (m.label_name || m.label_owner)) {
                    lbl = `${m.label_owner ? '[' + m.label_owner + '] ' : ''}${m.label_name || 'Label'}`;
                  }
                }
                return lbl ? `<div>Label: <span class="badge badge-neutral" style="font-size:11px; padding:2px 6px;">${lbl}</span></div>` : '';
              })()}
            </div>
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

        <!-- Fulfillment Route (Source & Destination) -->
        <div class="dispatch-route-card-block" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; background: rgba(12, 57, 37, 0.04); border: 1px solid rgba(12, 57, 37, 0.14); border-radius: 8px; padding: 10px 12px;">
          <div class="dispatch-route-col">
            <span class="dispatch-route-label" style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #0C3925; display:block; margin-bottom: 2px;">SOURCE</span>
            <div class="dispatch-route-val" style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${(() => {
              const sourceWhId = o.warehouse_id || 1;
              if (typeof window !== 'undefined' && Array.isArray(window.allWarehouses)) {
                const foundWh = window.allWarehouses.find(w => String(w.id) === String(sourceWhId) || w.code === String(sourceWhId));
                if (foundWh) return `${foundWh.name} (${foundWh.code})`;
              }
              return 'Main Plant Warehouse (WH-E-01)';
            })()}</div>
            <span class="dispatch-route-sub" style="font-size: 10.5px; color: var(--text-muted);">Origin Fulfillment Facility</span>
          </div>
          <div class="dispatch-route-col dispatch-dest-col">
            <span class="dispatch-route-label" style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #0284c7; display:block; margin-bottom: 2px;">DESTINATION</span>
            <div class="dispatch-route-val" style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${o.client_name || 'Customer Consignee'}</div>
            <span class="dispatch-route-sub" style="font-size: 10.5px; color: var(--text-muted);">Direct Customer Delivery Point</span>
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

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; flex-wrap: wrap;">
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
    let clients = window.allClients || [];
    if (!clients.length && window.dbClient) {
      const { data: clientsData, error } = await window.dbClient.from('clients').select('*');
      if (!error && clientsData) {
        clients = clientsData;
        window.allClients = clientsData;
      }
    }
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

  // Instant visual modal response (< 10ms)
  APP.openModal('order-modal');

  // Synchronous next order number derivation from memory
  let maxNum = 0;
  (window.allOrders || []).forEach(o => {
    if (o.order_no) {
      const num = UTILS.extractNumericPart(o.order_no);
      if (num < 1000000 && num > maxNum) maxNum = num;
    }
  });
  const nextOrderNo = 'O-' + String(maxNum + 1).padStart(2, '0');
  const orderNoField = document.getElementById('order-no-field');
  if (orderNoField) orderNoField.value = nextOrderNo;

  const toggle = document.getElementById('auto-discount-toggle');
  if (toggle) toggle.checked = false;
  const gstSel = document.getElementById('gst-type-select');
  if (gstSel) { gstSel.value = ''; onGstTypeChange(''); }
  handleAutoDiscount();

  orderItems = [{ id: Date.now(), product_id: '', product_name: '', packaging_size: '', bottle_inventory_id: null, box_inventory_id: null, quantity: 1, unit_price: 0, total: 0 }];
  await populateOrderBrandSelect('E');
  await populateClientSelect();
  await renderOrderItems();
  UTILS.applyDefaultDateInputs(orderForm, { skipFieldNames: ['due_date'] });

  // Non-blocking background order number verification with DB
  getNextOrderNo().then(verifiedNo => {
    if (orderNoField && (!orderNoField.value || orderNoField.value.startsWith('O-'))) {
      orderNoField.value = verifiedNo;
    }
  }).catch(() => {});

  setTimeout(() => UTILS.initAllAutocompleteSelects(orderForm), 10);
}

async function openEdit(id) {
  editingOrderId = id;
  // Instant visual modal response (< 10ms)
  APP.openModal('order-modal');
  document.getElementById('modal-title').textContent = 'Edit Order';

  try {
    // If cached in memory, populate immediately
    const cached = (window.allOrders || []).find(x => String(x.id) === String(id));
    let existingOwner = 'E';
    if (cached && cached.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(cached.notes)) {
      try {
        const meta = JSON.parse(cached.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim());
        if (meta.label_owner) existingOwner = meta.label_owner;
      } catch (_) {}
    }
    if (existingOwner === 'ACC' || existingOwner === 'AAC') existingOwner = 'E';
    await populateOrderBrandSelect(existingOwner);
    await populateClientSelect();
    
    let o = cached;
    if (!o || !Array.isArray(o.items) || !o.items.length) {
      const { data: dbO, error: oErr } = await window.dbClient.from('orders').select('*').eq('id', id).single();
      if (oErr) throw oErr;
      const { data: itemsData } = await window.dbClient.from('order_items').select('*').eq('order_id', id);
      dbO.items = itemsData || [];
      o = dbO;
    }

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
      let btlId = item.bottle_inventory_id ? parseInt(item.bottle_inventory_id, 10) : null;
      let boxInvId = null;
      let boxName = null;
      if (dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
        const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
        const metaMatch = matchFn ? matchFn(item, dispatchMeta.items_meta) : null;
        if (metaMatch) {
          if (q <= 0) {
            q = parseFloat(metaMatch.QUANTITY || metaMatch.quantity || metaMatch.TOTAL_UNITS || metaMatch.total_units || 0);
          }
          if (!btlId && metaMatch.bottle_inventory_id) {
            btlId = parseInt(metaMatch.bottle_inventory_id, 10);
          }
          boxInvId = metaMatch.box_inventory_id ? parseInt(metaMatch.box_inventory_id, 10) : null;
          boxName = metaMatch.box_name || null;
        }
      }
      return {
        ...item,
        quantity: q > 0 ? q : 1,
        packaging_size: item.packaging_size || item.packing_size || '',
        bottle_inventory_id: btlId,
        box_inventory_id: boxInvId,
        box_name: boxName,
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
  orderItems.push({ id: Date.now(), product_id: '', product_name: '', packaging_size: '', bottle_inventory_id: null, box_inventory_id: null, quantity: 1, unit_price: 0, total: 0 });
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

function formatBottleDropdownLabel(btl) {
  if (!btl) return 'Select Bottle';
  return (typeof UTILS !== 'undefined' && UTILS.formatPackagingDisplayName)
    ? UTILS.formatPackagingDisplayName(btl, 'Bottles')
    : String(btl.name || btl).replace(/\b(bottle|bottles)\b/gi, '').replace(/\([^)]*avail[^)]*\)/gi, '').trim();
}

function formatBoxDropdownLabel(bxName, stock) {
  if (!bxName) return 'Select Box';
  return (typeof UTILS !== 'undefined' && UTILS.formatPackagingDisplayName)
    ? UTILS.formatPackagingDisplayName(bxName, 'Boxes')
    : String(bxName.name || bxName).replace(/\s*box\s+box\s*/gi, ' Box ').replace(/\b(box|boxes)\b/gi, '').replace(/\([^)]*avail[^)]*\)/gi, '').trim();
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

        if (!item.packaging_size && pkgOptions.length > 0) {
          const selOpt = pkgOptions.find(opt => opt.is_base)
            || pkgOptions.find(opt => /\b1\s*(?:litre|ltr|l)\b/i.test(opt.packaging_size || opt.size || ''))
            || pkgOptions[0];
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

      const curBtl = (cachedBottlesList || []).find(b => b.id == item.bottle_inventory_id);
      const selectedBottleTitle = curBtl ? formatBottleDropdownLabel(curBtl) : 'Select Bottle';

      const curBx = (cachedBoxesList || []).find(b => b.id == item.box_inventory_id);
      const selectedBoxTitle = curBx ? formatBoxDropdownLabel(curBx) : 'Select Box';

      return `
        <tr data-row-idx="${idx}">
          <td style="min-width:170px">
            <span class="mobile-label">Product</span>
            <select class="form-select order-product-select" data-idx="${idx}" onchange="onProductSelectChange(${idx}, this.value)">
              <option value="">Select Product</option>
              ${cachedProductsList.map(p => `<option value="${p.id}" ${p.id == item.product_id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </td>
          <td style="min-width:115px" class="pack-size-cell">
            <span class="mobile-label">Pack Size</span>
            ${pkgSelectHtml}
          </td>
          <td style="min-width:190px">
            <span class="mobile-label">Bottle</span>
            <select class="form-select order-bottle-select" data-idx="${idx}" title="${selectedBottleTitle}" style="width:100%;" onchange="onBottleChange(${idx}, this.value)">
              <option value="">Select Bottle</option>
              ${cachedBottlesList.map(b => `<option value="${b.id}" ${b.id == item.bottle_inventory_id ? 'selected' : ''}>${formatBottleDropdownLabel(b)}</option>`).join('')}
            </select>
          </td>
          <td style="min-width:190px">
            <span class="mobile-label">Box</span>
            <select class="form-select order-box-select" data-idx="${idx}" title="${selectedBoxTitle}" style="width:100%;" onchange="onBoxChange(${idx}, this.value)">
              <option value="">Select Box</option>
              ${cachedBoxesList.map(bx => `<option value="${bx.id}" ${bx.id == item.box_inventory_id ? 'selected' : ''}>${formatBoxDropdownLabel(bx)}</option>`).join('')}
            </select>
          </td>
          <td style="min-width:70px">
            <span class="mobile-label">Quantity</span>
            <input type="number" class="form-input item-qty-input" value="${item.quantity}" min="0" step="any" oninput="onQtyChange(${idx}, this.value)" onchange="onQtyChange(${idx}, this.value)">
          </td>
          <td style="min-width:80px">
            <span class="mobile-label">Unit Price (₹)</span>
            <input type="number" class="form-input item-price-input" value="${item.unit_price}" min="0" step="any" oninput="onUnitPriceChange(${idx}, this.value)" onchange="onUnitPriceChange(${idx}, this.value)">
          </td>
          <td class="cell-amount item-total-display" style="min-width:85px">
            <span class="mobile-label">Total</span>
            ${UTILS.fmtCurrency(item.total)}
          </td>
          <td style="min-width:40px; text-align:center;">
            <span class="mobile-label">Remove</span>
            <button class="action-btn delete" onclick="removeItem(${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </td>
        </tr>
      `;
    }).join('');
    calculateTotal();
    updateOrderStockSummary();
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
    it.bottle_inventory_id = null;
    it.box_inventory_id = null;
    it.box_name = null;
    it.quantity = 0;
    it.unit_price = 0;
    it.total = 0;
    resolveOrderItemLabel(it, currentOrderLabelOwner);
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

  if (pkgOptions.length > 0) {
    pkgOptions = UTILS.sortPackSizesDescending(pkgOptions, opt => opt.packaging_size || opt.size);
    const selectedOpt = pkgOptions.find(opt => opt.is_base)
      || pkgOptions.find(opt => /\b1\s*(?:litre|ltr|l)\b/i.test(opt.packaging_size || opt.size || ''))
      || pkgOptions[0];
    const rawSize = selectedOpt.packaging_size || selectedOpt.size || '';
    it.packaging_size = cleanSizeLabel(rawSize, p?.unit);
    it.unit_price = parseFloat(selectedOpt.sell_price || selectedOpt.selling_price) || parseFloat(p?.sell_price) || 0;
    it.bottles_per_box = parseInt(selectedOpt.units_per_box || selectedOpt.bottles_per_box, 10) || 12;
  } else {
    it.packaging_size = p?.unit || '1 Litre';
    it.unit_price = parseFloat(p?.sell_price) || 0;
    it.bottles_per_box = 12;
  }

  // Auto-match bottle & box based on initial packaging size
  if (it.packaging_size && (cachedBottlesList || []).length > 0) {
    const btlMatch = cachedBottlesList.find(b => isPackagingSizeCompatible(b.name || b.item_size, it.packaging_size));
    it.bottle_inventory_id = btlMatch ? btlMatch.id : null;
  }
  if (it.packaging_size && (cachedBoxesList || []).length > 0) {
    const bxMatch = cachedBoxesList.find(b => isPackagingSizeCompatible(b.name, it.packaging_size));
    if (bxMatch) {
      it.box_inventory_id = bxMatch.id;
      it.box_name = bxMatch.name;
    } else if (cachedBoxesList.length === 1) {
      it.box_inventory_id = cachedBoxesList[0].id;
      it.box_name = cachedBoxesList[0].name;
    }
  }

  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  it.outer_boxes_consumed = it.box_inventory_id ? Math.ceil((parseFloat(it.quantity) || 0) / (it.bottles_per_box || 12)) : 0;
  resolveOrderItemLabel(it, currentOrderLabelOwner);
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
    if (matchOpt.units_per_box || matchOpt.bottles_per_box) {
      it.bottles_per_box = parseInt(matchOpt.units_per_box || matchOpt.bottles_per_box, 10) || 12;
    }
  }

  // Issue E: Check bottle compatibility with new pack size
  if (it.bottle_inventory_id) {
    const curBottle = (cachedBottlesList || []).find(b => b.id == it.bottle_inventory_id);
    if (!curBottle || !isPackagingSizeCompatible(curBottle.name || curBottle.item_size, valStr)) {
      const newBtl = (cachedBottlesList || []).find(b => isPackagingSizeCompatible(b.name || b.item_size, valStr));
      it.bottle_inventory_id = newBtl ? newBtl.id : null;
    }
  } else if ((cachedBottlesList || []).length > 0) {
    const newBtl = cachedBottlesList.find(b => isPackagingSizeCompatible(b.name || b.item_size, valStr));
    if (newBtl) it.bottle_inventory_id = newBtl.id;
  }

  // Issue E: Check box compatibility with new pack size
  if (it.box_inventory_id) {
    const curBox = (cachedBoxesList || []).find(b => b.id == it.box_inventory_id);
    if (!curBox || !isPackagingSizeCompatible(curBox.name, valStr)) {
      const newBx = (cachedBoxesList || []).find(b => isPackagingSizeCompatible(b.name, valStr));
      it.box_inventory_id = newBx ? newBx.id : null;
      it.box_name = newBx ? newBx.name : null;
    }
  } else if ((cachedBoxesList || []).length > 0) {
    const newBx = cachedBoxesList.find(b => isPackagingSizeCompatible(b.name, valStr));
    if (newBx) {
      it.box_inventory_id = newBx.id;
      it.box_name = newBx.name;
    }
  }

  it.total = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  it.outer_boxes_consumed = it.box_inventory_id ? Math.ceil((parseFloat(it.quantity) || 0) / (it.bottles_per_box || 12)) : 0;
  resolveOrderItemLabel(it, currentOrderLabelOwner);
  await renderOrderItems();
}

function onQtyChange(idx, val) {
  const it = orderItems[idx];
  if (!it) return;
  it.quantity = parseFloat(val) || 0;
  it.total = it.quantity * (parseFloat(it.unit_price) || 0);
  it.outer_boxes_consumed = it.box_inventory_id ? Math.ceil(it.quantity / (it.bottles_per_box || 12)) : 0;
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  if (row) {
    const qtyInp = row.querySelector('.item-qty-input');
    if (qtyInp && qtyInp.value != val) qtyInp.value = val;
    const totalDisp = row.querySelector('.item-total-display');
    if (totalDisp) totalDisp.textContent = UTILS.fmtCurrency(it.total);
  }
  calculateTotal();
  updateOrderStockSummary();
}

function onBottleChange(idx, val) {
  let valStr = (val && typeof val === 'object' && val.target) ? val.target.value : val;
  const it = orderItems[idx];
  if (!it) return;
  it.bottle_inventory_id = valStr ? parseInt(valStr, 10) : null;
  const b = (cachedBottlesList || []).find(x => x.id == it.bottle_inventory_id);
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  if (row) {
    const sel = row.querySelector('.order-bottle-select');
    if (sel) sel.title = b ? formatBottleDropdownLabel(b) : 'Select Bottle';
  }
  updateOrderStockSummary();
}

function onBoxChange(idx, val) {
  let valStr = (val && typeof val === 'object' && val.target) ? val.target.value : val;
  const it = orderItems[idx];
  if (!it) return;
  it.box_inventory_id = valStr ? parseInt(valStr, 10) : null;
  const bObj = (cachedBoxesList || []).find(b => b.id == it.box_inventory_id);
  it.box_name = bObj ? (bObj.name || '').replace(/\s*box\s+box\s*/gi, ' Box ').trim() : null;
  it.outer_boxes_consumed = it.box_inventory_id ? Math.ceil((parseFloat(it.quantity) || 0) / (it.bottles_per_box || 12)) : 0;
  const row = document.querySelector(`tr[data-row-idx="${idx}"]`);
  if (row) {
    const sel = row.querySelector('.order-box-select');
    if (sel) sel.title = bObj ? formatBoxDropdownLabel(bObj) : 'Select Box';
  }
  updateOrderStockSummary();
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

let isOrderSaving = false;

async function saveOrder() {
  if (isOrderSaving) return;
  const d = UTILS.getFormData('order-form');
  if (!d.client_id) { APP.showToast('Please select a client', 'error'); return; }
  if (orderItems.length === 0) { APP.showToast('Please add at least one item', 'error'); return; }

  const saveBtn = document.querySelector('#order-modal button.btn-primary');
  if (saveBtn && (saveBtn.dataset.submitting === 'true' || saveBtn.disabled)) return;
  isOrderSaving = true;

  let finalOrderNo = d.order_no ? formatOrderNo(d.order_no) : '';
  if (!finalOrderNo) {
    finalOrderNo = await getNextOrderNo();
  }

  if (saveBtn) {
    saveBtn.dataset.submitting = 'true';
    if (typeof APP !== 'undefined' && APP.setButtonLoading) {
      APP.setButtonLoading(saveBtn, true, 'Saving...');
    } else {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }
  }

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
          orderItems[idx].bottle_inventory_id = parseInt(bottleSel.value, 10);
        } else {
          orderItems[idx].bottle_inventory_id = null;
        }
        const boxSel = row.querySelector('.order-box-select');
        if (boxSel && boxSel.value) {
          orderItems[idx].box_inventory_id = parseInt(boxSel.value, 10);
          const bMatch = cachedBoxesList.find(bx => bx.id == orderItems[idx].box_inventory_id);
          orderItems[idx].box_name = bMatch ? bMatch.name : null;
        } else {
          orderItems[idx].box_inventory_id = null;
          orderItems[idx].box_name = null;
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
      // Resolve label for this row
      resolveOrderItemLabel(it, currentOrderLabelOwner);
    }

    // STRICT PRE-COMMIT STOCK VALIDATION (Guarantees zero partial deduction & zero silent substitution)
    const labelWarnings = [];
    if (!isBackorderMode) {
      for (let i = 0; i < orderItems.length; i++) {
        const it = orderItems[i];
        const qty = parseFloat(it.quantity) || 0;
        const pName = it.product_name || `Item #${i + 1}`;
        const pSize = it.packaging_size || '';

        // A. Validate Bottle (Strict)
        if (it.bottle_inventory_id) {
          const btl = (cachedBottlesList || []).find(b => b.id == it.bottle_inventory_id);
          const btlAvail = btl ? (btl.total_stock || 0) : 0;
          if (btlAvail < qty) {
            APP.showToast(`INSUFFICIENT_STOCK: Required ${qty} bottles of "${btl?.name || 'Bottle'}", but only ${btlAvail.toFixed(0)} available.`, 'error');
            if (saveBtn) { saveBtn.dataset.submitting = 'false'; saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
            return;
          }
        }

        // B. Validate Box (Strict)
        const outerBoxes = (it.box_inventory_id && qty > 0) ? (it.outer_boxes_consumed || Math.ceil(qty / (it.bottles_per_box || 12))) : 0;
        if (it.box_inventory_id && outerBoxes > 0) {
          const bx = (cachedBoxesList || []).find(b => b.id == it.box_inventory_id);
          const bxAvail = bx ? (bx.total_stock || 0) : 0;
          if (bxAvail < outerBoxes) {
            APP.showToast(`INSUFFICIENT_STOCK: Required ${outerBoxes} boxes of "${bx?.name || 'Box'}", but only ${bxAvail.toFixed(0)} available.`, 'error');
            if (saveBtn) { saveBtn.dataset.submitting = 'false'; saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
            return;
          }
        }

        // C. Validate Technical Bulk (Strict)
        if (it.inventory_item_id) {
          const techItem = (allInventoryItemsList || []).find(t => t.id == it.inventory_item_id);
          const packMl = (window.INVENTORY_CORE && window.INVENTORY_CORE.parsePackagingSize)
            ? window.INVENTORY_CORE.parsePackagingSize(pSize).volumeMl
            : (UTILS.parsePackSizeInMl(pSize) || 1000);
          const volumeLiters = (packMl / 1000) * qty;
          const techAvail = techItem ? (techItem.total_stock || 0) : 0;
          if (techAvail < volumeLiters) {
            APP.showToast(`INSUFFICIENT_STOCK: Required ${volumeLiters.toFixed(2)} L of "${techItem?.name || pName}", but only ${techAvail.toFixed(2)} available.`, 'error');
            if (saveBtn) { saveBtn.dataset.submitting = 'false'; saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
            return;
          }
        }

        // D. Validate Label (Issue F: Non-blocking warning per business rule)
        if (!it.label_inventory_id) {
          labelWarnings.push(`No matching ${currentOrderLabelOwner} label found for "${pName} (${pSize})". Required: ${qty} Nos, Available: 0 Nos.`);
        } else {
          const lbl = (cachedLabelsList || []).find(l => l.id == it.label_inventory_id);
          const lblAvail = lbl ? (lbl.total_stock || 0) : (it.label_stock || 0);
          if (lblAvail < qty) {
            labelWarnings.push(`Insufficient ${currentOrderLabelOwner} labels for "${pName} (${pSize})". Required: ${qty} Nos, Available: ${lblAvail.toFixed(0)} Nos.`);
          }
        }
      }

      if (labelWarnings.length > 0) {
        APP.showToast(`⚠️ Label Shortage: ${labelWarnings.join('; ')}. Order will be saved with label shortage.`, 'warning', 4500);
      }
    }

    const executeSave = async (allowBackorder = false) => {

      // Fast in-memory / cached technical item resolution
      for (const item of orderItems) {
        if (!item.inventory_item_id) {
          const product = cachedProductsList.find(p => p.id == item.product_id);
          if (product?.inventory_item_id) {
            item.inventory_item_id = product.inventory_item_id;
          } else if (window.INVENTORY_SERVICE && window.INVENTORY_SERVICE.resolveTechnicalItem) {
            const pName = item.product_name || product?.name || '';
            const techItem = await window.INVENTORY_SERVICE.resolveTechnicalItem(item.product_id, pName);
            if (techItem) {
              item.inventory_item_id = techItem.id;
              if (product) product.inventory_item_id = techItem.id;
            }
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
        await insertOrderItemsAndSyncStock(editingOrderId, orderItems, finalOrderNo || String(editingOrderId), allowBackorder);
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
        const stampedOrder = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(insertData) : insertData;
        const { data: newOrderData, error: insErr } = await window.dbClient.from('orders').insert([stampedOrder]).select();
        if (insErr) throw insErr;
        const newOrderId = newOrderData[0].id;

        // 2. Insert items and deduct stock
        await insertOrderItemsAndSyncStock(newOrderId, orderItems, finalOrderNo || String(newOrderId), allowBackorder);
      }

      APP.closeModal('order-modal');
      APP.showToast('Order saved successfully!', 'success');
      loadOrders(false); // Smooth non-blocking background sync without skeleton flicker
    };

    try {
      await executeSave(false);
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('insufficient stock')) {
        APP.showConfirm(`${err.message}\n\nWould you like to place this order on BACKORDER (allow negative stock / reservation)?`, async () => {
          try {
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving Backorder...'; }
            await executeSave(true);
          } catch (bErr) {
            APP.showToast('Backorder failed: ' + bErr.message, 'error');
          } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Order'; }
          }
        });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('saveOrder failed:', err);
    APP.showToast('Failed to save order: ' + err.message, 'error');
  } finally {
    isOrderSaving = false;
    if (saveBtn) {
      delete saveBtn.dataset.submitting;
      if (typeof APP !== 'undefined' && APP.setButtonLoading) {
        APP.setButtonLoading(saveBtn, false);
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Order';
      }
    }
  }
}

async function revertOrderStock(orderId) {
  try {
    let reversedViaMovements = false;
    if (window.INVENTORY_CORE && window.INVENTORY_CORE.Service) {
      const db = window.INVENTORY_CORE.Service.getDb();
      if (db) {
        const { data: movs } = await db.from('stock_movements').select('id').eq('txn_id', orderId).lt('qty', 0);
        if (movs && movs.length > 0) {
          await window.INVENTORY_CORE.Service.reverseReferenceStock({
            referenceId: orderId,
            referenceNo: `O-${orderId}`,
            movementType: 'DISPATCH_REVERSAL'
          });
          reversedViaMovements = true;
        }
      }
    }

    if (!reversedViaMovements) {
      // Fetch metadata from orders.notes
      const { data: ordRow } = await window.dbClient.from('orders').select('notes').eq('id', orderId).maybeSingle();
      let dispatchMeta = null;
      if (ordRow && ordRow.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordRow.notes)) {
        try {
          const jsonStr = ordRow.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
          dispatchMeta = JSON.parse(jsonStr);
        } catch (_) {}
      }

      const { data: items, error: itErr } = await window.dbClient.from('order_items').select('*').eq('order_id', orderId);
      if (!itErr && items && items.length) {
        for (const it of items) {
          const qty = parseFloat(it.quantity) || 0;
          const packMl = (window.INVENTORY_CORE && window.INVENTORY_CORE.parsePackagingSize)
            ? window.INVENTORY_CORE.parsePackagingSize(it.packing_size || it.packaging_size).volumeMl
            : (UTILS.parsePackSizeInMl(it.packing_size || it.packaging_size) || 1000);
          const volumeLiters = (packMl / 1000) * qty;

          // 1. Restore bottle stock if bottle used
          if (it.bottle_inventory_id && qty > 0) {
            const bottleId = parseInt(it.bottle_inventory_id, 10);
            await window.INVENTORY_SERVICE.restoreStock(bottleId, qty);
          }

          // 2. Restore box stock if box used
          let boxId = null;
          let boxesConsumed = 0;
          if (dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
            const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
            const metaIt = matchFn ? matchFn(it, dispatchMeta.items_meta) : null;
            if (metaIt && metaIt.box_inventory_id && metaIt.outer_boxes_consumed > 0) {
              boxId = parseInt(metaIt.box_inventory_id, 10);
              boxesConsumed = metaIt.outer_boxes_consumed;
            }
          }
          if (boxId && boxesConsumed > 0) {
            await window.INVENTORY_SERVICE.restoreStock(boxId, boxesConsumed);
          }

          // 3. Restore technical stock
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

          // 4. Restore label stock if label used
          let labelId = null;
          if (dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
            const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
            const metaIt = matchFn ? matchFn(it, dispatchMeta.items_meta) : null;
            if (metaIt && metaIt.label_inventory_id) {
              labelId = parseInt(metaIt.label_inventory_id, 10);
            }
          }
          if (labelId && qty > 0) {
            await window.INVENTORY_SERVICE.restoreStock(labelId, qty);
          }
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

async function insertOrderItemsAndSyncStock(orderId, items, orderNo, allowBackorder = false) {
  // Pre-calculate SKU packaging breakdowns
  const processedItems = items.map(it => {
    const qty = parseFloat(it.quantity) || 0;
    const packStr = it.packaging_size || it.packing_size || '';
    
    // Look up packaging configuration
    const pMatch = cachedProductsList.find(p => p.id == it.product_id);
    const pkgOptions = pMatch?.packaging_options || [];
    const matchedPkg = pkgOptions.find(opt => {
      const raw = opt.packaging_size || opt.size || '';
      return cleanSizeLabel(raw, pMatch?.unit) === packStr || raw === packStr;
    });

    const unitsPerBox = parseInt(matchedPkg?.units_per_box || it.bottles_per_box || it.units_per_box || 12, 10) || 12;
    const boxInventoryId = it.box_inventory_id ? parseInt(it.box_inventory_id, 10) : (matchedPkg?.box_inventory_id ? parseInt(matchedPkg.box_inventory_id, 10) : null);
    const boxName = it.box_name || (cachedBoxesList.find(b => b.id == boxInventoryId)?.name || null);

    let packCalc = { boxes: 0, loose: qty, unitsPerBox: unitsPerBox, totalUnits: qty, totalVolumeLitres: 0, outerBoxesConsumed: 0 };
    if (window.INVENTORY_CORE && window.INVENTORY_CORE.calculatePackagingQuantities) {
      packCalc = window.INVENTORY_CORE.calculatePackagingQuantities({
        packagingSize: packStr,
        unitsPerBox: unitsPerBox,
        boxes: it.box_quantity,
        loose: it.loose_quantity,
        totalUnits: qty
      });
    }

    const outerBoxes = (boxInventoryId && qty > 0) ? (packCalc.outerBoxesConsumed || Math.ceil(qty / unitsPerBox)) : 0;

    return {
      ...it,
      box_quantity: packCalc.boxes,
      loose_quantity: packCalc.loose,
      bottles_per_box: unitsPerBox,
      total_units: packCalc.totalUnits,
      total_volume: packCalc.totalVolumeLitres,
      box_inventory_id: boxInventoryId,
      box_name: boxName,
      outer_boxes_consumed: outerBoxes,
      label_inventory_id: it.label_inventory_id || null,
      label_name: it.label_name || null,
      label_owner: currentOrderLabelOwner || 'E'
    };
  });

  // Batch insert all order items into physical order_items table using strictly existent database columns
  const itemRows = processedItems.map(it => {
    const qty = parseFloat(it.total_units || it.quantity) || 0;
    return {
      order_id: orderId,
      product_id: it.product_id ? parseInt(it.product_id, 10) : null,
      inventory_item_id: it.inventory_item_id ? parseInt(it.inventory_item_id, 10) : null,
      product_name: it.product_name || null,
      packing_size: it.packaging_size || it.packing_size || null,
      bottle_inventory_id: it.bottle_inventory_id ? parseInt(it.bottle_inventory_id, 10) : null,
      quantity: qty,
      unit_price: parseFloat(it.unit_price) || 0,
      discount: parseFloat(it.discount) || 0,
      total: parseFloat(it.total) || 0
    };
  });

  let insertedRows = [];
  if (itemRows.length > 0) {
    const stampedRows = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(itemRows) : itemRows;
    const { data: insData, error: insErr } = await window.dbClient.from('order_items').insert(stampedRows).select();
    if (insErr) {
      const { error: insErr2 } = await window.dbClient.from('order_items').insert(stampedRows);
      if (insErr2) throw insErr2;
    } else if (Array.isArray(insData)) {
      insertedRows = insData;
    }
    if (!insertedRows.length) {
      try {
        const { data: fetchedItems } = await window.dbClient.from('order_items').select('*').eq('order_id', orderId).order('id', { ascending: true });
        if (Array.isArray(fetchedItems)) insertedRows = fetchedItems;
      } catch (_) {}
    }
  }

  // Persist dispatch & packaging metadata into orders.notes as DISPATCH_META
  try {
    const { data: currentOrder } = await window.dbClient.from('orders').select('notes, order_no').eq('id', orderId).maybeSingle();
    const cleanNotes = extractUserNotes(currentOrder?.notes || '');
    let existingMeta = {};
    if (currentOrder?.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(currentOrder.notes)) {
      try {
        const jsonStr = currentOrder.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
        existingMeta = JSON.parse(jsonStr);
      } catch (_) {}
    }

    const itemsMeta = processedItems.map((it, idx) => {
      const realDbItem = insertedRows[idx] || null;
      const realDbId = realDbItem?.id || it.id;
      const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
      const prevMatch = matchFn ? matchFn(it, existingMeta.items_meta, idx) : null;
      const prevDisp = prevMatch ? (parseInt(prevMatch.dispatched_units, 10) || 0) : 0;
      const totalUnits = it.total_units || it.quantity;
      const packSize = it.packaging_size || it.packing_size;
      return {
        id: realDbId,
        order_item_id: realDbId,
        product_id: it.product_id,
        product_name: it.product_name,
        packing_size: packSize,
        packaging_size: packSize,
        quantity: it.quantity,
        total_units: totalUnits,
        bottle_inventory_id: it.bottle_inventory_id,
        box_inventory_id: it.box_inventory_id,
        box_name: it.box_name,
        bottles_per_box: it.bottles_per_box,
        box_quantity: it.box_quantity,
        loose_quantity: it.loose_quantity,
        outer_boxes_consumed: it.outer_boxes_consumed,
        ordered_units: totalUnits,
        dispatched_units: prevDisp,
        remaining_units: Math.max(0, totalUnits - prevDisp),
        label_inventory_id: it.label_inventory_id || null,
        label_name: it.label_name || null,
        label_owner: currentOrderLabelOwner || 'E'
      };
    });

    // Update existing dispatches so their line items reflect the newly edited packaging sizes and product names
    const dispatches = Array.isArray(existingMeta.dispatches) ? existingMeta.dispatches : [];
    dispatches.forEach(d => {
      if (Array.isArray(d.items)) {
        d.items.forEach(dit => {
          const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || matchOrderItemWithMeta;
          const matchedItem = matchFn ? matchFn(dit, itemsMeta) : null;
          if (matchedItem) {
            dit.packaging_size = matchedItem.packing_size;
            dit.packing_size = matchedItem.packing_size;
            dit.product_name = matchedItem.product_name;
            if (matchedItem.id) dit.order_item_id = matchedItem.id;
          }
        });
      }
    });

    const packagingMeta = {
      ...existingMeta,
      label_owner: currentOrderLabelOwner || 'E',
      items_meta: itemsMeta,
      dispatches: dispatches
    };

    const finalNotes = cleanNotes
      ? `${cleanNotes}\n\nDISPATCH_META: ${JSON.stringify(packagingMeta)}`
      : `DISPATCH_META: ${JSON.stringify(packagingMeta)}`;
    await window.dbClient.from('orders').update({ notes: finalNotes }).eq('id', orderId);

    // Also synchronize local storage tables so cached dispatch records immediately show updated packing sizes
    try {
      const matchDigits = String(currentOrder?.order_no || orderNo || `O-${orderId}`).match(/\d+/);
      const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(orderId).padStart(2, '0');
      const baseNo = `DSP-${orderDigits}`;

      const localDispatches = JSON.parse(localStorage.getItem('order_dispatches') || '[]');
      let dispChanged = false;
      localDispatches.forEach(ld => {
        if (String(ld.order_id) === String(orderId)) {
          if (!ld.dispatch_no || /^DSP-\d{4,}$/.test(ld.dispatch_no)) {
            ld.dispatch_no = baseNo;
            dispChanged = true;
          }
          if (Array.isArray(ld.items)) {
            ld.items.forEach(dit => {
              const matchedItem = itemsMeta.find(im => (dit.order_item_id && im.id == dit.order_item_id) || (im.product_id && dit.product_id && String(im.product_id) === String(dit.product_id)) || (im.product_name && dit.product_name && String(im.product_name).toLowerCase().trim() === String(dit.product_name).toLowerCase().trim()));
              if (matchedItem) {
                dit.packaging_size = matchedItem.packing_size;
                dit.packing_size = matchedItem.packing_size;
                dit.product_name = matchedItem.product_name;
                dispChanged = true;
              }
            });
          }
        }
      });
      if (dispChanged) {
        localStorage.setItem('order_dispatches', JSON.stringify(localDispatches));
      }

      const localDItems = JSON.parse(localStorage.getItem('dispatch_items') || '[]');
      let dItemsChanged = false;
      localDItems.forEach(dit => {
        const matchedItem = itemsMeta.find(im => (dit.order_item_id && im.id == dit.order_item_id) || (im.product_id && dit.product_id && String(im.product_id) === String(dit.product_id)) || (im.product_name && dit.product_name && String(im.product_name).toLowerCase().trim() === String(dit.product_name).toLowerCase().trim()));
        if (matchedItem) {
          dit.packaging_size = matchedItem.packing_size;
          dit.packing_size = matchedItem.packing_size;
          dit.product_name = matchedItem.product_name;
          dItemsChanged = true;
        }
      });
      if (dItemsChanged) {
        localStorage.setItem('dispatch_items', JSON.stringify(localDItems));
      }
    } catch (_) {}
  } catch (mErr) {
    console.warn('Failed to update order DISPATCH_META:', mErr);
  }

  // OPTION A (ERP STANDARD): Zero stock deduction at order placement time.
  // Placing an order records customer request & line items without reducing physical stock.
  // Authoritative physical stock deduction is executed exclusively upon Gate Exit / Dispatch
  // from the selected source warehouse (e.g., Gas Godown or Main Plant).
}

async function deleteOrder(id) {
  if (!id) {
    console.warn('deleteOrder: invalid id', id);
    return false;
  }
  return new Promise((resolve) => {
    APP.showConfirm('Delete this order and its items?', async () => {
    try {
      const targetOrder = (window.allOrders || []).find(o => String(o.id) === String(id));
      const orderNo = targetOrder?.order_no || `O-${id}`;

      // 1. Authoritative Dispatch & Stock Reversal (restores origin warehouse batches, cleans up godown batches, dispatches & invoices)
      let dispatchHandled = false;
      if (window.DISPATCH_SERVICE && typeof window.DISPATCH_SERVICE.deleteOrderDispatches === 'function') {
        const dspRes = await window.DISPATCH_SERVICE.deleteOrderDispatches(window.dbClient, id, orderNo);
        if (dspRes && dspRes.success) {
          dispatchHandled = true;
        }
      } else {
        ['order_dispatches', 'erp_order_dispatches', 'dispatch_items', 'erp_dispatch_items', 'gate_passes', 'erp_gate_passes'].forEach(k => {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const cleaned = list.filter(d => String(d.order_id) !== String(id) && d.order_no !== orderNo);
                localStorage.setItem(k, JSON.stringify(cleaned));
              }
            }
          } catch (_) {}
        });
      }

      // 2. Revert any additional order stock only if NOT handled authoritatively by deleteOrderDispatches
      if (!dispatchHandled) {
        await revertOrderStock(id);
      }

      // 3. Delete order items & order from Supabase
      await window.dbClient.from('order_items').delete().eq('order_id', id);
      const { error } = await window.dbClient.from('orders').delete().eq('id', id);
      if (error) throw error;
      
      // 4. Update in-memory state immediately for instant responsive UI (0ms latency)
      window.allOrders = (window.allOrders || []).filter(o => String(o.id) !== String(id));
      allOrders = window.allOrders;
      window.allDetailedItems = (window.allDetailedItems || []).filter(it => String(it.order_id) !== String(id));
      allDetailedItems = window.allDetailedItems;

      if (window.allOrders.length === 0) {
        window.allDispatches = [];
        if (window.DISPATCH_SERVICE && typeof window.DISPATCH_SERVICE.clearAllDispatches === 'function') {
          window.DISPATCH_SERVICE.clearAllDispatches();
        }
        if (window.DISPATCH_UI) {
          if (typeof window.DISPATCH_UI.setAllDispatches === 'function') {
            window.DISPATCH_UI.setAllDispatches([]);
          }
          if (typeof window.DISPATCH_UI.renderDispatchesTable === 'function') {
            window.DISPATCH_UI.renderDispatchesTable();
          }
        }
      } else if (window.DISPATCH_UI) {
        if (typeof window.DISPATCH_UI.setAllDispatches === 'function') {
          const cur = window.DISPATCH_UI.getAllDispatches() || [];
          window.DISPATCH_UI.setAllDispatches(cur.filter(d => String(d.order_id) !== String(id) && d.order_no !== orderNo));
        } else if (Array.isArray(window.allDispatches)) {
          window.allDispatches = window.allDispatches.filter(d => String(d.order_id) !== String(id) && d.order_no !== orderNo);
        }
        if (typeof window.DISPATCH_UI.renderDispatchesTable === 'function') {
          window.DISPATCH_UI.renderDispatchesTable();
        }
      }

      applyFiltersAndRender();
      APP.showToast('Order and associated dispatch data deleted. Stock restored.', 'success');

      // 5. Silent background re-sync
      setTimeout(() => loadOrders(), 200);
      resolve({ success: true });
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete order: ' + err.message, 'error');
      resolve({ success: false, error: err });
    }
  });
  });
}

// Tab Switching Listener (Instant responsive tabs without blanking)
document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeOrderTab = e.target.getAttribute('data-tab');

    const ordersWrap = document.getElementById('orders-table-wrap');
    const itemsWrap = document.getElementById('order-items-table-wrap');
    const dispWrap = document.getElementById('dispatches-table-wrap');

    if (activeOrderTab === 'Orders') {
      if (ordersWrap) ordersWrap.style.display = '';
      if (itemsWrap) itemsWrap.style.display = 'none';
      if (dispWrap) dispWrap.style.display = 'none';
      applyFiltersAndRender();
    } else if (activeOrderTab === 'OrderItems') {
      if (ordersWrap) ordersWrap.style.display = 'none';
      if (itemsWrap) itemsWrap.style.display = '';
      if (dispWrap) dispWrap.style.display = 'none';
      applyFiltersAndRender();
    } else if (activeOrderTab === 'Dispatches') {
      if (ordersWrap) ordersWrap.style.display = 'none';
      if (itemsWrap) itemsWrap.style.display = 'none';
      if (dispWrap) dispWrap.style.display = '';
      if (window.DISPATCH_UI) {
        if (Array.isArray(window.allOrders) && window.allOrders.length === 0) {
          window.allDispatches = [];
          if (typeof window.DISPATCH_UI.setAllDispatches === 'function') window.DISPATCH_UI.setAllDispatches([]);
          window.DISPATCH_UI.renderDispatchesTable();
        } else if (Array.isArray(window.allDispatches) && window.allDispatches.length > 0) {
          window.DISPATCH_UI.renderDispatchesTable();
          // Silent background revalidation
          if (typeof window.DISPATCH_SERVICE?.getDispatches === 'function') {
            window.DISPATCH_SERVICE.getDispatches(window.dbClient).then(fresh => {
              if (Array.isArray(fresh)) {
                window.allDispatches = fresh;
                if (activeOrderTab === 'Dispatches') window.DISPATCH_UI.renderDispatchesTable();
              }
            }).catch(() => {});
          }
        } else {
          window.DISPATCH_UI.loadDispatches();
        }
      }
    }
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

const debouncedApplyOrderFilters = (typeof UTILS !== 'undefined' && UTILS.debounce) 
  ? UTILS.debounce(() => applyFiltersAndRender(), 250) 
  : () => applyFiltersAndRender();
document.getElementById('search-input')?.addEventListener('input', debouncedApplyOrderFilters);
document.getElementById('items-search-input')?.addEventListener('input', debouncedApplyOrderFilters);

// Event listeners for auto discount calculations
document.getElementById('auto-discount-toggle')?.addEventListener('change', handleAutoDiscount);
document.querySelector('#order-form input[name="paid_amount"]')?.addEventListener('input', handleAutoDiscount);

loadOrders();
