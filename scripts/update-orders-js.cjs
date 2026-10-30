const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'assets', 'js', 'orders.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update items mapping in loadOrders to include ordered_units, dispatched_units, remaining_units
code = code.replace(
  `        allDetailedItems.push({
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
        });`,
  `        const ordUnits = parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0;
        const dispUnits = parseInt(it.dispatched_units || 0, 10);
        const remUnits = it.remaining_units !== undefined ? parseInt(it.remaining_units, 10) : Math.max(0, ordUnits - dispUnits);
        allDetailedItems.push({
          order_id: o.id,
          order_no: o.order_no,
          client_display: o.client_display,
          date: o.date,
          status: o.status,
          dispatch_status: o.dispatch_status,
          product_name: it.product_name,
          product_id: it.product_id,
          packaging_size: it.packaging_size || it.packing_size || '',
          quantity: it.quantity,
          ordered_units: ordUnits,
          dispatched_units: dispUnits,
          remaining_units: remUnits,
          unit_price: it.unit_price,
          total: it.total
        });`
);

// 2. Update renderTable row generation to include Dispatch Status badge and Prepare Dispatch action button
const oldRenderTableRow = `    return \`<tr style="background: \${rowBg}">
      <td class="cell-bold">\${o.order_no}</td>
      <td>\${o.client_display || '—'}</td>
      <td>\${UTILS.fmtDate(o.date)}</td>
      <td class="cell-amount">\${UTILS.fmtCurrency(o.total_amount)}</td>
      <td class="cell-amount text-success">\${UTILS.fmtCurrency(o.paid_amount)}</td>
      <td class="cell-amount text-danger">\${UTILS.fmtCurrency(balance)}</td>
      <td>\${statusBadge}</td>
      <td><div class="row-actions">
        <button class="action-btn view" onclick="viewOrder(\${o.id})" title="View Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="action-btn edit" onclick="openEdit(\${o.id})" title="Edit Order"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" onclick="deleteOrder(\${o.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>\`;`;

const newRenderTableRow = `    let dispStatus = o.dispatch_status || (o.status === 'Completed' ? 'Fully Dispatched' : 'Pending Verification');
    let dispBadgeClass = 'badge-warning';
    if (dispStatus === 'Fully Dispatched') dispBadgeClass = 'badge-success';
    else if (dispStatus === 'Partially Dispatched') dispBadgeClass = 'badge-primary';
    else if (dispStatus === 'Verified' || dispStatus === 'Approved') dispBadgeClass = 'badge-info';
    const dispatchBadge = \`<span class="badge \${dispBadgeClass}">\${dispStatus}</span>\`;

    return \`<tr style="background: \${rowBg}">
      <td class="cell-bold">\${o.order_no}</td>
      <td>\${o.client_display || '—'}</td>
      <td>\${UTILS.fmtDate(o.date)}</td>
      <td class="cell-amount">\${UTILS.fmtCurrency(o.total_amount)}</td>
      <td class="cell-amount text-success">\${UTILS.fmtCurrency(o.paid_amount)}</td>
      <td class="cell-amount text-danger">\${UTILS.fmtCurrency(balance)}</td>
      <td>\${dispatchBadge}</td>
      <td>\${statusBadge}</td>
      <td><div class="row-actions">
        <button class="action-btn view" onclick="viewOrder(\${o.id})" title="View Details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="action-btn edit" onclick="openEdit(\${o.id})" title="Edit Order"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        \${dispStatus !== 'Fully Dispatched' && statusVal !== 'Completed' ? \`
          <button class="action-btn" onclick="openPrepareDispatch(\${o.id})" title="Prepare Dispatch Slip" style="color:var(--primary);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg></button>
        \` : ''}
        <button class="action-btn delete" onclick="deleteOrder(\${o.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div></td>
    </tr>\`;`;

code = code.replace(oldRenderTableRow, newRenderTableRow);

// 3. Update renderOrderItemsDetailTable to show Ordered, Dispatched, Remaining columns
const oldDetailRowPart = `      rowsHtml += \`
        <td style="font-weight:600; color:var(--primary); padding: 8px 10px; font-size:12.5px;">\${it.product_name || '—'}</td>
        <td style="padding: 8px 10px; font-size:12px; white-space:nowrap;"><span class="badge badge-neutral" style="padding: 2px 7px; font-size:11px;">\${packSizeStr}</span></td>
        <td style="padding: 8px 10px; font-size:12.5px; font-weight:600; white-space:nowrap;">\${it.quantity}</td>
        <td class="cell-amount" style="padding: 8px 10px; font-size:12.5px; white-space:nowrap;">\${UTILS.fmtCurrency(it.unit_price)}</td>
        <td class="cell-amount" style="font-weight:700; padding: 8px 10px; font-size:12.5px; white-space:nowrap;">\${UTILS.fmtCurrency(it.total)}</td>
      \`;`;

const newDetailRowPart = `      const ordUnits = parseInt(it.ordered_units || it.quantity, 10) || 0;
      const dispUnits = parseInt(it.dispatched_units || 0, 10);
      const remUnits = it.remaining_units !== undefined ? parseInt(it.remaining_units, 10) : Math.max(0, ordUnits - dispUnits);

      rowsHtml += \`
        <td style="font-weight:600; color:var(--primary); padding: 8px 10px; font-size:12.5px;">\${it.product_name || '—'}</td>
        <td style="padding: 8px 10px; font-size:12px; white-space:nowrap;"><span class="badge badge-neutral" style="padding: 2px 7px; font-size:11px;">\${packSizeStr}</span></td>
        <td style="padding: 8px 10px; font-size:12.5px; font-weight:600; white-space:nowrap;">\${ordUnits}</td>
        <td style="padding: 8px 10px; font-size:12.5px; white-space:nowrap;"><span class="badge \${dispUnits > 0 ? 'badge-info' : 'badge-neutral'}">\${dispUnits}</span></td>
        <td style="padding: 8px 10px; font-size:12.5px; font-weight:700; color:\${remUnits === 0 ? 'var(--text-muted)' : 'var(--primary)'}; white-space:nowrap;">\${remUnits}</td>
        <td class="cell-amount" style="padding: 8px 10px; font-size:12.5px; white-space:nowrap;">\${UTILS.fmtCurrency(it.unit_price)}</td>
        <td class="cell-amount" style="font-weight:700; padding: 8px 10px; font-size:12.5px; white-space:nowrap;">\${UTILS.fmtCurrency(it.total)}</td>
      \`;`;

code = code.replace(oldDetailRowPart, newDetailRowPart);

// 4. Update tab switching listener to handle Dispatches tab
const oldTabSwitch = `    if (activeOrderTab === 'Orders') {
      if (ordersWrap) ordersWrap.style.display = '';
      if (itemsWrap) itemsWrap.style.display = 'none';
    } else {
      if (ordersWrap) ordersWrap.style.display = 'none';
      if (itemsWrap) itemsWrap.style.display = '';
    }
    applyFiltersAndRender();`;

const newTabSwitch = `    const dispWrap = document.getElementById('dispatches-table-wrap');

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
      if (window.DISPATCH_UI) window.DISPATCH_UI.loadDispatches();
    }`;

code = code.replace(oldTabSwitch, newTabSwitch);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated orders.js with dispatch tracking and tab handling!');
