/**
 * assets/js/dispatch-ui.js
 * Commercial Godown Verification & Multi-Batch Dispatch UI Controller
 *
 * Implements:
 * 1. Dispatches table rendering with live workflow status badges.
 * 2. Prepare Commercial Dispatch Slip modal & batch allocation selector.
 * 3. Godown packing completion verification modal (Operator signoff).
 * 4. Manager dispatch authorization modal (Approval).
 * 5. Gate exit execution modal (Single-posting physical stock deduction).
 * 6. Commercial tax invoice generation (Zero double-deduction).
 * 7. Safe dispatch reversal / customer return modal.
 * 8. Printable Commercial Dispatch Slip view modal.
 */

(function (window) {
  'use strict';

  let allDispatches = [];
  let activeDispatchFilter = '';
  let activeDispatchSearch = '';
  let currentActionDispatchId = null;
  let currentViewDispatch = null;
  let currentViewDispatchItems = [];
  let currentViewDispatchClient = {};
  let currentViewInvoiceDoc = null;

  function safeEscape(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /**
   * Indian Vehicle Registration Plate Auto-Formatter
   * Formats into: [State 1-2 letters] [District 1-2 digits] [Series 1-3 letters] [Number 1-4 digits]
   * e.g. "GJ 03 AB 1512"
   */
  function formatVehicle(val) {
    if (!val) return '';
    const clean = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return '';
    const m = clean.match(/^([A-Z]{1,2})?([0-9]{1,2})?([A-Z]{1,3})?([0-9]{1,4})?/);
    if (!m) return clean;
    const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
    return parts.length ? parts.join(' ') : clean;
  }
  const formatVehicleNumber = formatVehicle;

  function isRandomDsp(no) {
    if (!no) return true;
    const m = String(no).match(/^DSP-(\d{5,})$/);
    return m ? parseInt(m[1], 10) >= 100000 : false;
  }

  function resolveGodownDisplayName(targetWhId, fallbackName) {
    if (targetWhId && Array.isArray(window.allWarehouses)) {
      const wh = window.allWarehouses.find(w => String(w.id) === String(targetWhId) || w.code === String(targetWhId));
      if (wh) {
        return `${wh.name} (${wh.code})`;
      }
    }
    let str = String(fallbackName || '').trim();
    if (!str || str.toLowerCase().includes('gas co-marketing')) {
      return 'GAS (WH-E-GAS)';
    }
    return str;
  }
  window.resolveGodownDisplayName = resolveGodownDisplayName;

  function getElementImageDataUrl(imgEl) {
    if (!imgEl) return null;
    if (imgEl.src && imgEl.src.startsWith('data:image/')) return imgEl.src;
    if (!imgEl.complete || imgEl.naturalWidth === 0) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
      return null;
    }
  }

  /**
   * Next Commercial Dispatch Invoice Number Generator
   * Matches the exact order number (e.g. Order O-01 -> INV-01, O-02 -> INV-02)
   */
  async function getNextDispatchInvoiceNumber(client, dispatch = null) {
    const orderNo = dispatch?.order_no || '';
    let baseDigits = '01';
    if (orderNo) {
      const m = String(orderNo).match(/\d+/);
      if (m) baseDigits = m[0].padStart(2, '0');
    } else if (dispatch?.order_id) {
      baseDigits = String(dispatch.order_id).padStart(2, '0');
    }
    const baseInv = `INV-${baseDigits}`;

    // Check if baseInv already exists for a different dispatch
    let count = 0;
    const currentDispId = dispatch?.id;
    (allDispatches || []).forEach(d => {
      if (d.id !== currentDispId && d.invoice_no && String(d.invoice_no).startsWith(baseInv)) {
        count++;
      }
    });

    if (count === 0) return baseInv;
    return `${baseInv}-${count + 1}`;
  }

  const DISPATCH_UI = {
    formatVehicle: formatVehicle,
    formatVehicleNumber: formatVehicleNumber,
    getNextDispatchInvoiceNumber: getNextDispatchInvoiceNumber,

    /**
     * Load all dispatches from backend service
     */
    async loadDispatches() {
      const cardsContainer = document.getElementById('dispatches-cards-container');
      const totalInfo = document.getElementById('dispatch-total-info');
      if (totalInfo && (!allDispatches || !allDispatches.length)) totalInfo.textContent = 'Loading...';
      if (cardsContainer && (!cardsContainer.children.length || cardsContainer.querySelector('.empty-state'))) {
        cardsContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;">
            <div class="spinner" style="margin:0 auto"></div>
          </div>
        `;
      }
      try {
        if (Array.isArray(allDispatches) && allDispatches.length > 0) {
          this.renderDispatchesTable();
        } else if (typeof UTILS !== 'undefined' && UTILS.renderTableSkeleton) {
          UTILS.renderTableSkeleton('dispatches-table');
        }
        const client = window.dbClient;
        if ((!window.allWarehouses || !window.allWarehouses.length) && client && client.from) {
          try {
            const { data: whList } = await client.from('warehouses').select('*');
            if (whList && whList.length) window.allWarehouses = whList;
          } catch (_) {}
        }
        const list = await window.DISPATCH_SERVICE.getDispatches(client);
        allDispatches = (list || []).map(d => {
          const matchDigits = String(d.order_no || '').match(/\d+/);
          const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
          if (isRandomDsp(d.dispatch_no)) {
            d.dispatch_no = `DSP-${orderDigits}`;
          }
          if (d.invoice_no && (/^INV-\d{5,}$/.test(d.invoice_no) || /^DSP-\d{5,}$/.test(d.invoice_no))) {
            d.invoice_no = `INV-${orderDigits}`;
          }
          return d;
        });

        // Strict consistency with active orders: If orders are loaded, drop any dispatches for deleted orders
        if (Array.isArray(window.allOrders)) {
          if (window.allOrders.length === 0) {
            allDispatches = [];
          } else {
            const activeIds = new Set(window.allOrders.map(o => String(o.id)));
            const activeNos = new Set(window.allOrders.map(o => String(o.order_no || '').trim().toUpperCase()));
            allDispatches = allDispatches.filter(d => {
              const mId = d.order_id && activeIds.has(String(d.order_id));
              const mNo = d.order_no && activeNos.has(String(d.order_no).trim().toUpperCase());
              return mId || mNo;
            });
          }
        }

        // Deduplicate dispatches for the same order: eliminate ghost/duplicate dispatches
        const orderGroups = new Map();
        allDispatches.forEach(d => {
          const k = String(d.order_id || d.order_no || d.id);
          if (!orderGroups.has(k)) orderGroups.set(k, []);
          orderGroups.get(k).push(d);
        });

        const dedupedDispatches = [];
        orderGroups.forEach((disps) => {
          if (disps.length <= 1) {
            dedupedDispatches.push(...disps);
            return;
          }

          const advanced = disps.filter(d => {
            const s = (d.status || '').toLowerCase();
            return s === 'verified' || s === 'approved' || s === 'dispatched';
          });

          if (advanced.length > 0) {
            const advUnits = advanced.reduce((sum, d) => sum + (parseInt(d.total_units_dispatched, 10) || 0), 0);
            disps.forEach(d => {
              const s = (d.status || '').toLowerCase();
              if (s === 'verified' || s === 'approved' || s === 'dispatched') {
                dedupedDispatches.push(d);
              } else if (s === 'pending verification') {
                const dUnits = parseInt(d.total_units_dispatched, 10) || 0;
                const isIdentical = advanced.some(ad => (parseInt(ad.total_units_dispatched, 10) || 0) === dUnits);
                if (isIdentical || advUnits >= dUnits) {
                  return; // Drop ghost duplicate!
                }
                dedupedDispatches.push(d);
              } else {
                dedupedDispatches.push(d);
              }
            });
          } else {
            const seenUnits = new Set();
            disps.forEach(d => {
              const dUnits = parseInt(d.total_units_dispatched, 10) || 0;
              if (seenUnits.has(dUnits)) return;
              seenUnits.add(dUnits);
              dedupedDispatches.push(d);
            });
          }
        });
        allDispatches = dedupedDispatches;
        window.allDispatches = allDispatches;

        if (allDispatches.length === 0) {
          if (totalInfo) totalInfo.textContent = '0 dispatches';
          this.renderDispatchesTable();
          if (Array.isArray(window.allOrders) && window.allOrders.length === 0) {
            ['order_dispatches', 'erp_order_dispatches', 'dispatch_items', 'erp_dispatch_items', 'gate_passes', 'erp_gate_passes'].forEach(k => {
              try { localStorage.setItem(k, '[]'); } catch (_) {}
            });
          }
          return;
        }

        // Prune any dropped ghost entries from localStorage tables
        try {
          ['order_dispatches', 'erp_order_dispatches'].forEach(k => {
            const raw = localStorage.getItem(k);
            if (raw) {
              const local = JSON.parse(raw);
              if (Array.isArray(local) && local.length) {
                const cleaned = local.filter(ld => allDispatches.some(d => String(d.id) === String(ld.id) || d.dispatch_no === ld.dispatch_no));
                localStorage.setItem(k, JSON.stringify(cleaned));
              }
            }
          });
        } catch (_) {}

        // Ensure invoice_history_cache in localStorage is also cleaned up
        try {
          const hist = JSON.parse(localStorage.getItem('invoice_history_cache') || '[]');
          let histUpdated = false;
          hist.forEach(h => {
            if (h.invoiceNumber && (/^INV-\d{5,}$/.test(h.invoiceNumber) || /^DSP-\d{5,}$/.test(h.invoiceNumber))) {
              const dMatch = allDispatches.find(d => d.dispatch_no === h.dispatchNo || String(d.id) === String(h.uniqueId));
              if (dMatch) {
                h.invoiceNumber = dMatch.invoice_no;
                h.uniqueId = dMatch.invoice_no;
                histUpdated = true;
              }
            }
          });
          if (histUpdated) {
            localStorage.setItem('invoice_history_cache', JSON.stringify(hist));
          }
        } catch (_) {}

        this.renderDispatchesTable();
      } catch (err) {
        console.error('loadDispatches error:', err);
        if (typeof APP !== 'undefined' && APP.showToast) {
          APP.showToast('Failed to load dispatches: ' + err.message, 'error');
        }
        if (cardsContainer) {
          cardsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;">
              <p style="color:var(--danger, #ef4444); margin-bottom:10px;">Failed to load dispatches: ${err.message || 'Error'}</p>
              <button class="btn btn-secondary btn-sm" onclick="window.DISPATCH_UI.loadDispatches()">Retry</button>
            </div>
          `;
        }
        if (totalInfo) totalInfo.textContent = '0 dispatches';
      }
    },

    /**
     * Render the Dispatches table with action buttons based on status
     */
    renderDispatchesTable() {
      const cardsContainer = document.getElementById('dispatches-cards-container');
      const tbody = document.querySelector('#dispatches-table tbody');

      let data = allDispatches;
      if (activeDispatchFilter) {
        data = data.filter(d => (d.status || '').toLowerCase() === activeDispatchFilter.toLowerCase());
      }
      if (activeDispatchSearch) {
        const q = activeDispatchSearch.toLowerCase();
        data = data.filter(d => 
          `${d.dispatch_no} ${d.order_no} ${d.client_name} ${d.vehicle_no || ''} ${d.transporter_name || ''} ${d.eway_bill_no || ''}`.toLowerCase().includes(q)
        );
      }

      const totalInfo = document.getElementById('dispatch-total-info');
      if (totalInfo) totalInfo.textContent = `${data.length} dispatch${data.length !== 1 ? 'es' : ''}`;

      const safeEscape = (str) => {
        if (typeof escapeHtml === 'function') return escapeHtml(str);
        if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
        return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      };

      const formatVehicle = (val) => {
        if (!val) return '';
        const clean = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!clean) return '';
        const m = clean.match(/^([A-Z]{1,2})?([0-9]{1,2})?([A-Z]{1,3})?([0-9]{1,4})?/);
        if (!m) return clean;
        const parts = [m[1], m[2], m[3], m[4]].filter(Boolean);
        return parts.length ? parts.join(' ') : clean;
      };

      if (!data.length) {
        if (cardsContainer) {
          cardsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 48px 20px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;color:#94a3b8;opacity:0.6;margin-bottom:14px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <h3>No dispatches found</h3>
              <p>Click "+ Prepare Dispatch" to create your first dispatch slip.</p>
            </div>
          `;
        }
        if (tbody) {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="10"><div class="empty-state"><h3>No dispatches found</h3><p>Click "+ Prepare Dispatch" to create your first dispatch slip.</p></div></td></tr>`;
        }
        return;
      }

      // 1. Render Responsive Cards into cardsContainer
      if (cardsContainer) {
        cardsContainer.innerHTML = data.map(d => {
          const st = d.status || 'Pending Verification';
          let badgeClass = 'badge-warning';
          if (st === 'Verified') badgeClass = 'badge-info';
          else if (st === 'Approved') badgeClass = 'badge-primary';
          else if (st === 'Dispatched') badgeClass = 'badge-success';
          else if (st === 'Cancelled') badgeClass = 'badge-danger';

          const statusBadge = `<span class="badge ${badgeClass}">${st}</span>`;

          const sourceWhId = d.warehouse_id || 1;
          const sourceWhDisplay = resolveGodownDisplayName(sourceWhId, 'Main Plant Warehouse (WH-E-01)');
          const isGodown = d.delivery_target === 'GODOWN';

          let destTitle = '';
          let destSub = '';
          let destIconType = 'customer';

          if (isGodown) {
            destTitle = resolveGodownDisplayName(d.target_warehouse_id, d.target_warehouse_name || 'Gas Godown (WH-E-GAS)');
            destSub = 'Godown Stocking Point';
            destIconType = 'godown';
          } else if (d.intercompany_transfer_id || d.is_intercompany) {
            destTitle = d.target_company_name || d.target_branch_name || d.client_name || 'Receiving Company';
            destSub = 'Intercompany Receiving Point';
            destIconType = 'intercompany';
          } else {
            let cName = (d.client_name || d.consignee_name || 'Customer Consignee').trim();
            cName = cName.replace(/^Direct Customer Delivery\s*[-—:]*\s*/i, '');
            destTitle = cName;
            destSub = 'Customer Consignee Location';
            destIconType = 'customer';
          }

          const formattedVeh = d.vehicle_no ? formatVehicle(d.vehicle_no) : '';
          const vehicleInfo = formattedVeh 
            ? `<span class="dispatch-vehicle-tag" data-vehicle="${safeEscape(d.vehicle_no)}" style="font-weight:700; color:var(--text-primary); font-size:12.5px; letter-spacing:0.5px;">${safeEscape(formattedVeh)}</span>${d.transporter_name ? `<span style="font-size:11.5px; color:var(--text-muted); display:block;">${safeEscape(d.transporter_name)}</span>` : ''}`
            : '<span style="color:var(--text-muted); font-size:12px;">Not Assigned</span>';

          // Invoice column / button
          let invoiceHtml = '<span style="color:var(--text-muted); font-size:12px;">Not Linked</span>';
          let displayInvNo = d.invoice_no;
          if (displayInvNo && (/^INV-\d{5,}$/.test(displayInvNo) || /^DSP-\d{5,}$/.test(displayInvNo))) {
            const matchDigits = String(d.order_no || '').match(/\d+/);
            const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
            displayInvNo = `INV-${orderDigits}`;
            d.invoice_no = displayInvNo;
          }
          if (displayInvNo) {
            invoiceHtml = `<button type="button" class="btn btn-sm" onclick="viewGeneratedInvoice(${d.id})" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700; font-size:11.5px; border-radius:6px; padding:3px 9px; cursor:pointer;" title="View & Download Invoice ${safeEscape(displayInvNo)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;margin-right:4px;vertical-align:-2px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${safeEscape(displayInvNo)}</button>`;
          } else if (st === 'Dispatched') {
            invoiceHtml = `<button type="button" class="btn btn-sm btn-secondary" onclick="openGenerateInvoice(${d.id})" style="padding:2px 8px; font-size:11px; white-space:nowrap;">+ Generate Invoice</button>`;
          }

          // Multi-product breakdown tags if present (No Loose)
          let productBreakdownHtml = '';
          const items = d.items || [];
          if (items.length > 0) {
            const productTags = items.map(it => {
              const pName = safeEscape(it.product_name || 'Product');
              const pSize = it.packaging_size || it.packing_size ? `<span class="badge badge-neutral" style="font-size:10px; margin-left:4px;">${safeEscape(it.packaging_size || it.packing_size)}</span>` : '';
              const qty = it.total_units_dispatched || it.quantity || 0;
              const bxStr = it.boxes_dispatched ? `${it.boxes_dispatched} Boxes` : '';
              return `
                <div class="dispatch-product-item">
                  <div class="product-item-title">${pName}${pSize}</div>
                  <div class="product-item-qty font-bold">
                    ${qty} <small>units</small>
                    ${bxStr ? `<span class="product-item-pack-tag">(${bxStr})</span>` : ''}
                  </div>
                </div>
              `;
            }).join('');
            productBreakdownHtml = `<div class="dispatch-products-list">${productTags}</div>`;
          }

          // Workflow Action Buttons
          let actionsHtml = `
            <button type="button" class="order-card-btn view" onclick="viewDispatch('${d.id}')" title="View Dispatch Slip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>View Details</span>
            </button>
          `;

          if (st === 'Pending Verification') {
            actionsHtml += `
              <button type="button" class="order-card-btn dispatch" onclick="openVerifyDispatch('${d.id}')" title="Godown Packing Verification">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <span style="color:#ffffff;">Verify Packing</span>
              </button>
            `;
          } else if (st === 'Verified') {
            actionsHtml += `
              <button type="button" class="order-card-btn dispatch" onclick="openApproveDispatch('${d.id}')" title="Manager Authorization">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style="color:#ffffff;">Authorize Dispatch</span>
              </button>
            `;
          } else if (st === 'Approved') {
            actionsHtml += `
              <button type="button" class="order-card-btn dispatch" onclick="openExecuteDispatch('${d.id}')" title="Gate Exit & Deduct Stock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                <span style="color:#ffffff;">Execute Gate Pass</span>
              </button>
            `;
          } else if (st === 'Dispatched') {
            actionsHtml += `
              <button type="button" class="order-card-btn edit" onclick="viewDispatch('${d.id}')" title="Print Dispatch Slip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Print Slip</span>
              </button>
              <button type="button" class="order-card-btn delete" onclick="openReverseDispatch('${d.id}')" title="Safe Return / Reversal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                <span>Customer Return</span>
              </button>
            `;
          }

          return `
            <div class="dispatch-record-card" data-dispatch-id="${d.id}">
              <!-- A. Dispatch Header -->
              <div class="dispatch-card-header">
                <div class="dispatch-card-header-meta">
                  <span class="dispatch-card-slip-no">${safeEscape(d.dispatch_no)}</span>
                  <span class="dispatch-card-date">${UTILS.fmtDate(d.dispatch_date)}</span>
                </div>
                <div class="dispatch-card-header-badge">
                  ${statusBadge}
                </div>
              </div>

              <!-- B. Order & Client Info -->
              <div class="dispatch-card-order-row">
                <div class="dispatch-card-meta-col">
                  <span class="dispatch-meta-label">Order Ref</span>
                  <a href="javascript:void(0)" onclick="viewOrder(${d.order_id})" class="dispatch-order-link" title="View Order ${safeEscape(d.order_no)}">${safeEscape(d.order_no)}</a>
                </div>
                <div class="dispatch-card-meta-col client-col">
                  <span class="dispatch-meta-label">Client</span>
                  <span class="dispatch-client-name" title="${safeEscape(d.client_name || '—')}">${safeEscape(d.client_name || '—')}</span>
                </div>
              </div>

              <!-- B2. Explicit Source & Destination Route Block -->
              <div class="dispatch-route-card-block">
                <div class="dispatch-route-col dispatch-source-col">
                  <span class="dispatch-route-label">SOURCE</span>
                  <div class="dispatch-route-val">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="route-icon route-icon-source" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    <div class="route-text-group">
                      <span class="route-val-text" title="${safeEscape(sourceWhDisplay)}">${safeEscape(sourceWhDisplay)}</span>
                      <span class="dispatch-route-sub">Dispatching Facility</span>
                    </div>
                  </div>
                </div>

                <div class="dispatch-route-arrow-col">
                  <div class="dispatch-route-arrow-badge" title="Dispatched To">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="route-arrow-icon" aria-hidden="true">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </div>
                </div>

                <div class="dispatch-route-col dispatch-dest-col">
                  <span class="dispatch-route-label">DESTINATION</span>
                  <div class="dispatch-route-val">
                    ${destIconType === 'godown' ? `
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="route-icon route-icon-dest icon-godown" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    ` : (destIconType === 'intercompany' ? `
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="route-icon route-icon-dest icon-intercompany" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    ` : `
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="route-icon route-icon-dest icon-customer" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                    `)}
                    <div class="route-text-group">
                      <span class="route-val-text" title="${safeEscape(destTitle)}">${safeEscape(destTitle)}</span>
                      <span class="dispatch-route-sub">${safeEscape(destSub)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="dispatch-card-divider"></div>

              <!-- C. Dispatch Quantities (Boxes, Total Units - NO LOOSE) -->
              <div class="dispatch-card-quantities-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="dispatch-qty-box">
                  <span class="qty-label">Boxes</span>
                  <span class="qty-val font-bold">${d.total_boxes_dispatched || 0} <small>bx</small></span>
                </div>
                <div class="dispatch-qty-box">
                  <span class="qty-label">Total Dispatched</span>
                  <span class="qty-val font-bold text-primary">${d.total_units_dispatched || 0} <small>units</small></span>
                </div>
              </div>

              <!-- Product items summary -->
              ${productBreakdownHtml}

              <!-- D. Vehicle, Logistics & Commercial Invoice -->
              <div class="dispatch-card-logistics-grid">
                <div class="logistics-box">
                  <span class="logistics-label">Vehicle / Logistics</span>
                  <div class="logistics-val">${vehicleInfo}</div>
                </div>
                <div class="logistics-box">
                  <span class="logistics-label">Commercial Invoice</span>
                  <div class="logistics-val">${invoiceHtml}</div>
                </div>
              </div>

              <!-- E. Actions Row -->
              <div class="dispatch-card-actions">
                ${actionsHtml}
              </div>
            </div>
          `;
        }).join('');
      }

      // 2. Also populate legacy table fallback for testing/compatibility
      if (tbody) {
        tbody.innerHTML = data.map(d => {
          const st = d.status || 'Pending Verification';
          let badgeClass = 'badge-warning';
          if (st === 'Verified') badgeClass = 'badge-info';
          else if (st === 'Approved') badgeClass = 'badge-primary';
          else if (st === 'Dispatched') badgeClass = 'badge-success';
          else if (st === 'Cancelled') badgeClass = 'badge-danger';

          const statusBadge = `<span class="badge ${badgeClass}">${st}</span>`;

          const sourceWhId = d.warehouse_id || 1;
          const sourceWhDisplay = resolveGodownDisplayName(sourceWhId, 'Main Plant Warehouse (WH-E-01)');
          const isGodown = d.delivery_target === 'GODOWN';

          let destTitle = '';
          let destSub = '';
          let destIconType = 'customer';

          if (isGodown) {
            destTitle = resolveGodownDisplayName(d.target_warehouse_id, d.target_warehouse_name || 'Gas Godown (WH-E-GAS)');
            destSub = 'Godown Stocking Point';
            destIconType = 'godown';
          } else if (d.intercompany_transfer_id || d.is_intercompany) {
            destTitle = d.target_company_name || d.target_branch_name || d.client_name || 'Receiving Company';
            destSub = 'Intercompany Receiving Point';
            destIconType = 'intercompany';
          } else {
            let cName = (d.client_name || d.consignee_name || 'Customer Consignee').trim();
            cName = cName.replace(/^Direct Customer Delivery\s*[-—:]*\s*/i, '');
            destTitle = cName;
            destSub = 'Customer Consignee Location';
            destIconType = 'customer';
          }

          const boxesLoose = `<span style="font-weight:600;">${d.total_boxes_dispatched || 0} Boxes</span>`;
          const formattedVeh = d.vehicle_no ? formatVehicle(d.vehicle_no) : '';
          const vehicleInfo = formattedVeh 
            ? `<span data-vehicle="${safeEscape(d.vehicle_no)}" style="font-weight:600; font-size:12px; letter-spacing:0.5px;">${safeEscape(formattedVeh)}</span>${d.transporter_name ? `<br><span style="font-size:11px; color:var(--text-muted);">${safeEscape(d.transporter_name)}</span>` : ''}`
            : '<span style="color:var(--text-muted); font-size:11px;">Not Assigned</span>';

          // Invoice column
          let invoiceHtml = '<span style="color:var(--text-muted); font-size:11px;">—</span>';
          let displayInvNo = d.invoice_no;
          if (displayInvNo && (/^INV-\d{5,}$/.test(displayInvNo) || /^DSP-\d{5,}$/.test(displayInvNo))) {
            const matchDigits = String(d.order_no || '').match(/\d+/);
            const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
            displayInvNo = `INV-${orderDigits}`;
            d.invoice_no = displayInvNo;
          }
          if (displayInvNo) {
            invoiceHtml = `<button class="btn btn-sm" onclick="viewGeneratedInvoice('${d.id}')" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700; font-size:11px; padding:2px 8px; border-radius:4px; cursor:pointer;" title="View & Download Invoice">${safeEscape(displayInvNo)}</button>`;
          } else if (st === 'Dispatched') {
            invoiceHtml = `<button class="btn btn-sm btn-secondary" onclick="openGenerateInvoice('${d.id}')" style="padding:2px 8px; font-size:11px; white-space:nowrap;">+ Generate</button>`;
          }

          // Contextual workflow action buttons
          let actionsHtml = `
            <button class="action-btn view" onclick="viewDispatch('${d.id}')" title="View Dispatch Slip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          `;

          if (st === 'Pending Verification') {
            actionsHtml += `
              <button class="btn btn-sm btn-primary" onclick="openVerifyDispatch('${d.id}')" title="Godown Packing Verification" style="padding:2px 8px; font-size:11px; white-space:nowrap;">Verify</button>
            `;
          } else if (st === 'Verified') {
            actionsHtml += `
              <button class="btn btn-sm btn-primary" onclick="openApproveDispatch('${d.id}')" title="Manager Authorization" style="padding:2px 8px; font-size:11px; white-space:nowrap;">Approve</button>
            `;
          } else if (st === 'Approved') {
            actionsHtml += `
              <button class="btn btn-sm btn-success" onclick="openExecuteDispatch('${d.id}')" title="Gate Exit & Deduct Stock" style="padding:2px 8px; font-size:11px; background:#16a34a; color:#fff; white-space:nowrap;">Gate Pass</button>
            `;
          } else if (st === 'Dispatched') {
            actionsHtml += `
              <button class="btn btn-sm btn-secondary" onclick="openReverseDispatch('${d.id}')" title="Safe Return / Reversal" style="padding:2px 8px; font-size:11px; color:var(--danger, #ef4444); white-space:nowrap;">Return</button>
            `;
          }

          return `<tr>
            <td class="cell-bold" style="white-space:nowrap;">${d.dispatch_no}</td>
            <td style="font-weight:600; white-space:nowrap;"><a href="javascript:void(0)" onclick="viewOrder(${d.order_id})" style="color:var(--primary); text-decoration:none;">${d.order_no}</a></td>
            <td class="cell-client">
              <div style="font-weight:700; color:var(--text-primary); font-size:13px;">${safeEscape(d.client_name || '—')}</div>
              <div style="margin-top:3px; font-size:10.5px; line-height:1.4;">
                <div style="color:var(--primary); font-weight:700;"><span style="color:var(--text-muted); font-size:9px; text-transform:uppercase;">SOURCE: </span>${safeEscape(sourceWhDisplay)}</div>
                <div style="color:var(--primary); font-weight:700;"><span style="color:var(--text-muted); font-size:9px; text-transform:uppercase;">DEST: </span>${safeEscape(destTitle)}</div>
              </div>
            </td>
            <td style="white-space:nowrap; font-size:12px;">${UTILS.fmtDate(d.dispatch_date)}</td>
            <td style="white-space:nowrap;">${boxesLoose}</td>
            <td class="text-center" style="font-weight:700; white-space:nowrap;">${d.total_units_dispatched || 0}</td>
            <td>${vehicleInfo}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${invoiceHtml}</td>
            <td class="text-center"><div class="row-actions" style="gap:4px; justify-content:center;">${actionsHtml}</div></td>
          </tr>`;
        }).join('');

        UTILS.applyMobileTableLabels('dispatches-table');
      }
    },

    /**
     * Open Modal: Prepare Commercial Dispatch Slip
     */
    async openPrepareDispatch(preselectedOrderId = null) {
      try {
        // Instant visual modal response (< 10ms)
        APP.openModal('prepare-dispatch-modal');

        const orderSelect = document.getElementById('disp-order-select');
        const slipNoField = document.getElementById('disp-slip-no');
        const dateField = document.getElementById('disp-date');
        const itemsContainer = document.getElementById('disp-items-container');

        if (dateField) dateField.value = new Date().toISOString().split('T')[0];
        if (slipNoField) {
          if (preselectedOrderId) {
            const pOrder = (window.allOrders || []).find(o => String(o.id) === String(preselectedOrderId));
            const matchDigits = String(pOrder?.order_no || `O-${preselectedOrderId}`).match(/\d+/);
            const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(preselectedOrderId).padStart(2, '0');
            const baseNo = `DSP-${orderDigits}`;
            const existing = (allDispatches || []).filter(d => String(d.order_id) === String(preselectedOrderId));
            slipNoField.value = existing.length > 0 ? `${baseNo}-${existing.length + 1}` : baseNo;
          } else {
            slipNoField.value = 'DSP-01';
          }
        }

        // Ensure orders are loaded from memory, orders.js, or database query
        if (!window.allOrders || window.allOrders.length === 0) {
          if (typeof window.loadOrders === 'function') {
            await window.loadOrders();
          } else if (window.dbClient) {
            const { data: oList } = await window.dbClient.from('orders').select('*').order('id', { ascending: false });
            const { data: cList } = await window.dbClient.from('clients').select('id, name');
            const { data: oiList } = await window.dbClient.from('order_items').select('*');
            const cMap = new Map();
            (cList || []).forEach(c => cMap.set(c.id, c.name));
            const itemsMap = new Map();
            (oiList || []).forEach(it => {
              if (!itemsMap.has(it.order_id)) itemsMap.set(it.order_id, []);
              itemsMap.get(it.order_id).push(it);
            });
            (oList || []).forEach(o => {
              o.client_display = cMap.get(o.client_id) || o.client_name || '—';
              o.items = itemsMap.get(o.id) || [];
            });
            window.allOrders = oList || [];
          }
        }

        // Populate eligible orders (orders with un-dispatched items that are not cancelled)
        orderSelect.innerHTML = '<option value="">Select sales order…</option>';
        const ordersList = window.allOrders || [];
        const eligibleOrders = ordersList.filter(o => {
          const st = (o.status || '').toLowerCase();
          const dispSt = (o.dispatch_status || '').toLowerCase();
          if (st === 'cancelled' || dispSt === 'fully dispatched') return false;

          const items = o.items || [];
          if (!items.length) return true; // If items not in-memory yet, keep eligible so they load upon selection

          const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0), 0);
          const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
          return totalOrd === 0 || totalDisp < totalOrd;
        });

        eligibleOrders.forEach(o => {
          const items = o.items || [];
          const totalOrd = items.reduce((s, it) => s + (parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0), 0);
          const totalDisp = items.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
          const remUnits = Math.max(0, totalOrd - totalDisp);
          const clientName = o.client_display || o.client_name || 'Client';
          const dateStr = o.date ? UTILS.fmtDate(o.date) : '';
          const remLabel = totalOrd > 0 ? `Remaining: ${remUnits} units` : (o.dispatch_status || 'Eligible Order');
          const optText = `${o.order_no} — ${clientName}${dateStr ? ` (${dateStr})` : ''} — ${remLabel}`;

          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = optText;
          opt.dataset.name = optText;
          opt.dataset.subtext = remLabel;
          if (preselectedOrderId && String(o.id) === String(preselectedOrderId)) {
            opt.selected = true;
          }
          orderSelect.appendChild(opt);
        });

        // Initialize or update UniversalSearchSelect to match Manufactured Product dropdown
        if (orderSelect._ussInstance) {
          orderSelect._ussInstance.updateOptions();
        } else if (window.UniversalSearchSelect) {
          new window.UniversalSearchSelect(orderSelect);
          orderSelect.dataset.ussInitialized = 'true';
        }

        // Populate partner godown / warehouse dropdown
        const targetWhSelect = document.getElementById('disp-target-warehouse');
        const sourceWhSelect = document.getElementById('disp-source-warehouse');
        const deliveryTargetSelect = document.getElementById('disp-delivery-target');
        const whGroup = document.getElementById('disp-target-wh-group');
        if (deliveryTargetSelect) deliveryTargetSelect.value = 'CUSTOMER';
        if (whGroup) whGroup.style.display = 'none';

        let whs = window.allWarehouses || [];
        if (!whs.length && window.dbClient) {
          try {
            const { data: wList } = await window.dbClient.from('warehouses').select('*');
            whs = wList || [];
            window.allWarehouses = whs;
          } catch (_) {}
        }

        if (sourceWhSelect && whs.length > 0) {
          sourceWhSelect.innerHTML = whs.map(w => 
            `<option value="${w.id}" ${w.id === 1 ? 'selected' : ''}>${w.name} (${w.code})</option>`
          ).join('');
        }

        if (targetWhSelect) {
          const godowns = whs.filter(w => w.id !== 1 && (w.status || 'Active') === 'Active');
          if (godowns.length > 0) {
            targetWhSelect.innerHTML = godowns.map(w => 
              `<option value="${w.id}" ${(w.code === 'WH-E-GAS' || w.code === 'WH-ACC-GAS' || w.code === 'WH-AAC-GAS') ? 'selected' : ''}>${w.name} (${w.code || 'WH'})</option>`
            ).join('');
          } else {
            targetWhSelect.innerHTML = '<option value="532" selected>GAS (WH-E-GAS)</option>';
          }
        }

        if (preselectedOrderId) {
          await this.onDispatchOrderSelected(preselectedOrderId);
        } else {
          const orderCardContainer = document.getElementById('disp-selected-order-card');
          if (orderCardContainer) {
            orderCardContainer.style.display = 'none';
            orderCardContainer.innerHTML = '';
          }
          itemsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:13px; padding:12px 0;">Please select a sales order above to view order items.</p>';
        }

        APP.openModal('prepare-dispatch-modal');
      } catch (err) {
        console.error('openPrepareDispatch error:', err);
        APP.showToast('Failed to open dispatch preparation: ' + err.message, 'error');
      }
    },

    /**
     * When an order is selected in Prepare Dispatch modal
     */
    async onDispatchOrderSelected(orderId) {
      const itemsContainer = document.getElementById('disp-items-container');
      const orderCardContainer = document.getElementById('disp-selected-order-card');

      if (!orderId) {
        if (orderCardContainer) {
          orderCardContainer.style.display = 'none';
          orderCardContainer.innerHTML = '';
        }
        itemsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:13px; padding:12px 0;">Please select a sales order above to view order items.</p>';
        return;
      }

      // Immediately clear stale data with loading state
      itemsContainer.innerHTML = '<div class="empty-state" style="padding:24px 0;"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:10px; font-size:12.5px; color:var(--text-muted);">Loading order items & quantities…</p></div>';

      try {
        // Dynamically update slipNoField to match selected order number (e.g. DSP-01, DSP-02, DSP-03)
        const slipNoField = document.getElementById('disp-slip-no');
        let parentOrder = (window.allOrders || []).find(o => String(o.id) === String(orderId));
        if (!parentOrder && window.dbClient) {
          const { data: oRow } = await window.dbClient.from('orders').select('*').eq('id', orderId).single();
          parentOrder = oRow;
        }

        if (slipNoField && parentOrder) {
          const matchDigits = String(parentOrder.order_no || `O-${orderId}`).match(/\d+/);
          const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(orderId).padStart(2, '0');
          const baseNo = `DSP-${orderDigits}`;
          const existing = (allDispatches || []).filter(d => String(d.order_id) === String(orderId));
          slipNoField.value = existing.length > 0 ? `${baseNo}-${existing.length + 1}` : baseNo;
        }

        let dispatchMeta = null;
        if (parentOrder && parentOrder.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(parentOrder.notes)) {
          try {
            const jsonStr = parentOrder.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
            dispatchMeta = JSON.parse(jsonStr);
          } catch (_) {}
        }

        const { data: orderItems, error: oiErr } = await window.dbClient.from('order_items').select('*').eq('order_id', orderId);
        if (oiErr) throw oiErr;

        const safeEscape = (str) => {
          if (typeof escapeHtml === 'function') return escapeHtml(str);
          if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
          return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        };

        // Render Live Actual Order Data Display Card
        if (orderCardContainer && parentOrder) {
          const ordNo = String(parentOrder.order_no || `O-${orderId}`);
          const formattedOrdNo = typeof formatOrderNo === 'function' ? formatOrderNo(ordNo) : ordNo;
          const clientName = parentOrder.client_display || parentOrder.client_name || '—';
          const dateStr = parentOrder.date ? (window.UTILS ? window.UTILS.fmtDate(parentOrder.date) : parentOrder.date) : '—';
          const totalAmt = window.UTILS ? window.UTILS.fmtCurrency(parentOrder.total_amount || 0) : `₹${parentOrder.total_amount || 0}`;
          const paidAmt = window.UTILS ? window.UTILS.fmtCurrency(parentOrder.paid_amount || 0) : `₹${parentOrder.paid_amount || 0}`;
          const bal = Math.max(0, (parseFloat(parentOrder.total_amount) || 0) - (parseFloat(parentOrder.paid_amount) || 0));
          const balAmt = window.UTILS ? window.UTILS.fmtCurrency(bal) : `₹${bal}`;

          // Calculate aggregate order quantities
          const totOrd = (orderItems || []).reduce((s, it) => s + (parseInt(it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? it.quantity : (it.ordered_units || it.total_units || 0), 10) || 0), 0);
          const totDisp = (orderItems || []).reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
          const totRem = Math.max(0, totOrd - totDisp);

          // Status badges
          const st = parentOrder.status || 'Pending';
          const isCompleted = st.toLowerCase() === 'completed';
          const orderBadgeClass = isCompleted ? 'badge-success' : 'badge-warning';

          const dispSt = parentOrder.dispatch_status || (dispatchMeta?.dispatch_status) || (totDisp >= totOrd && totOrd > 0 ? 'Fully Dispatched' : (totDisp > 0 ? 'Partially Dispatched' : 'Pending Verification'));
          let dispBadgeClass = 'badge-warning';
          if (dispSt === 'Verified') dispBadgeClass = 'badge-info';
          else if (dispSt === 'Approved') dispBadgeClass = 'badge-primary';
          else if (dispSt === 'Fully Dispatched' || dispSt === 'Dispatched') dispBadgeClass = 'badge-success';
          else if (dispSt === 'Partially Dispatched') dispBadgeClass = 'badge-primary';

          orderCardContainer.innerHTML = `
            <div class="dispatch-order-banner-card" style="background:var(--surface, #ffffff); border:1px solid var(--border); border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
              <!-- Top Row: Order Reference, Client & Badges -->
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                <div>
                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:17px; font-weight:800; color:var(--primary); letter-spacing:-0.2px;">${safeEscape(formattedOrdNo)}</span>
                    <span style="font-size:12px; color:var(--text-muted); font-weight:500;">Booked: ${safeEscape(dateStr)}</span>
                  </div>
                  <h3 style="font-size:15px; font-weight:700; color:var(--text-primary); margin:4px 0 0; word-break:break-word;">
                    ${safeEscape(clientName)}
                  </h3>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                  <span class="badge ${orderBadgeClass}" title="Order Status">${safeEscape(st)}</span>
                  <span class="badge ${dispBadgeClass}" title="Dispatch Status">${safeEscape(dispSt)}</span>
                </div>
              </div>

              <!-- 4-Metric Grid: Financials & Quantities -->
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
                  <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-muted); display:block; margin-bottom:3px;">Order Total</span>
                  <span style="font-size:14px; font-weight:800; color:var(--text-primary);">${safeEscape(totalAmt)}</span>
                </div>
                <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
                  <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-muted); display:block; margin-bottom:3px;">Paid / Balance</span>
                  <span style="font-size:12.5px; font-weight:700;">
                    <span class="text-success">${safeEscape(paidAmt)}</span>
                    <span style="color:var(--text-muted);">/</span>
                    <span class="${bal > 0 ? 'text-danger' : 'text-success'}">${safeEscape(balAmt)}</span>
                  </span>
                </div>
                <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
                  <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-muted); display:block; margin-bottom:3px;">Total Ordered</span>
                  <span style="font-size:14px; font-weight:800; color:var(--text-primary);">${totOrd} <small style="font-size:11px; font-weight:500; color:var(--text-muted);">units</small></span>
                </div>
                <div style="background:var(--bg); padding:10px 12px; border-radius:8px; border:1px solid var(--border);">
                  <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-muted); display:block; margin-bottom:3px;">Remaining to Dispatch</span>
                  <span style="font-size:14px; font-weight:800; color:var(--primary);">${totRem} <small style="font-size:11px; font-weight:500; color:var(--text-muted);">units</small></span>
                </div>
              </div>
            </div>
          `;
          orderCardContainer.style.display = 'block';
        } else if (orderCardContainer) {
          orderCardContainer.style.display = 'none';
        }

        if (!orderItems || orderItems.length === 0) {
          itemsContainer.innerHTML = '<p style="color:var(--danger, #ef4444); font-size:13px; padding:12px 0;">No line items found for this sales order.</p>';
          return;
        }

        // Fetch QC-Approved batches from stock_batches
        const approvedBatches = await window.DISPATCH_SERVICE.getAvailableApprovedBatches(window.dbClient);

        let cardsHtml = '<div class="dispatch-items-cards-container">';

        orderItems.forEach((it, itIdx) => {
          const matchFn = (window.UTILS && window.UTILS.matchOrderItemWithMeta) || window.matchOrderItemWithMeta;
          let metaMatch = matchFn ? matchFn(it, dispatchMeta?.items_meta, itIdx) : null;
          if (!metaMatch && dispatchMeta && Array.isArray(dispatchMeta.items_meta)) {
            const normPack = (window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
            const itPack = normPack(it.packing_size || it.packaging_size);
            metaMatch = dispatchMeta.items_meta.find(m => (m.id && String(m.id) === String(it.id)) || (String(m.product_id) === String(it.product_id) && normPack(m.packing_size || m.packaging_size) === itPack));
          }

          // Authoritative ordered units: it.quantity from order_items table!
          const ord = (it.quantity !== undefined && it.quantity !== null && it.quantity !== '')
            ? (parseInt(it.quantity, 10) || 0)
            : (parseInt(metaMatch?.ordered_units || metaMatch?.total_units || it.ordered_units || it.total_units || 0, 10) || 0);

          // Dispatched units: check it.dispatched_units or compute from qualifying dispatches
          let disp = parseInt(it.dispatched_units || 0, 10);
          if (disp === 0 && metaMatch && metaMatch.dispatched_units) {
            disp = parseInt(metaMatch.dispatched_units, 10) || 0;
          }
          if (disp === 0 && dispatchMeta && Array.isArray(dispatchMeta.dispatches)) {
            const normPack = (window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
            const itPack = normPack(it.packing_size || it.packaging_size);
            dispatchMeta.dispatches.forEach(d => {
              const dSt = (d.status || '').toLowerCase().trim();
              if (dSt === 'dispatched' || d.stock_deducted === true) {
                if (Array.isArray(d.items)) {
                  d.items.forEach(di => {
                    const isItemMatch = (di.order_item_id && String(di.order_item_id) === String(it.id)) ||
                      (String(di.product_id) === String(it.product_id) && normPack(di.packaging_size || di.packing_size) === itPack);
                    if (isItemMatch) {
                      disp += parseInt(di.total_units_dispatched || di.quantity || 0, 10);
                    }
                  });
                }
              }
            });
          }

          const rem = Math.max(0, ord - disp);
          const upb = parseInt(it.units_per_box || metaMatch?.bottles_per_box || metaMatch?.unitsPerBox || 10, 10) || 10;
          const boxName = it.box_name || metaMatch?.box_name || null;

          // Batch number is a reference label for invoices and gate passes; stock is validated via Inventory
          const defaultBatchNo = it.batch_no || 'B-01';
          const defaultBatchId = null;

          cardsHtml += `
            <div class="dispatch-item-card" data-order-item-id="${it.id}" data-units-per-box="${upb}">
              <!-- Header: Product Title & Pack Size -->
              <div class="dispatch-item-card-header">
                <div class="dispatch-item-product-title">
                  <h4 class="dispatch-item-name">${safeEscape(it.product_name || '—')}</h4>
                  <span class="badge badge-neutral dispatch-item-pack">${it.packing_size || it.packaging_size || '1 Litre'}</span>
                </div>
                ${boxName ? `<span class="badge badge-neutral" style="font-size:11px;">Box: ${safeEscape(boxName)} (${upb}/bx)</span>` : ''}
              </div>

              <!-- 3-Metric Quantity Section -->
              <div class="dispatch-item-quantities">
                <div class="dispatch-qty-box">
                  <span class="qty-label">Ordered</span>
                  <span class="qty-val">${ord} <small>units</small></span>
                </div>
                <div class="dispatch-qty-box">
                  <span class="qty-label">Already Dispatched</span>
                  <span class="qty-val text-muted">${disp} <small>units</small></span>
                </div>
                <div class="dispatch-qty-box">
                  <span class="qty-label">Remaining</span>
                  <span class="qty-val ${rem > 0 ? 'text-primary font-bold' : 'text-success'}">${rem} <small>units</small></span>
                </div>
              </div>

              <!-- Units to Dispatch (Clean, straightforward, no confusing batch dropdown) -->
              <div class="dispatch-item-allocation-single" style="margin-top:12px;">
                <input type="hidden" class="disp-item-batch" value="${defaultBatchNo}" data-batch-no="${defaultBatchNo}">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Units to Dispatch <span class="required">*</span></label>
                  <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                    <input class="form-input disp-item-qty" type="number" min="0" max="${rem}" value="${rem}" 
                      data-max="${rem}"
                      oninput="DISPATCH_UI.recalcLineBreakdown(this, ${upb})" 
                      style="width:160px; font-weight:700; font-size:14px; height:38px;">
                    <div class="disp-item-breakdown-wrap">
                      <span class="disp-item-breakdown" style="font-size:12px; font-weight:600; color:var(--primary, #059669); background:rgba(5, 150, 105, 0.08); padding:5px 12px; border-radius:6px; display:inline-block;">
                        ${(rem % upb > 0) ? `${Math.floor(rem / upb)} Boxes + ${rem % upb} Loose (${rem} units)` : `${Math.floor(rem / upb)} Boxes (${rem} units)`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        });

        cardsHtml += '</div>';
        itemsContainer.innerHTML = cardsHtml;
      } catch (err) {
        console.error('Failed to load order items:', err);
        itemsContainer.innerHTML = `<p style="color:var(--danger, #ef4444); font-size:13px; padding:12px 0;">Error: ${err.message}</p>`;
      }
    },

    recalcLineBreakdown(inputEl, unitsPerBox) {
      const container = inputEl.closest('.dispatch-item-card') || inputEl.closest('tr');
      const qty = parseInt(inputEl.value, 10) || 0;
      const breakdownEl = container?.querySelector('.disp-item-breakdown');
      if (breakdownEl) {
        const upb = unitsPerBox || 10;
        const boxes = Math.floor(qty / upb);
        const loose = qty % upb;
        breakdownEl.textContent = loose > 0 ? `${boxes} Boxes + ${loose} Loose (${qty} units)` : `${boxes} Boxes (${qty} units)`;
      }
    },

    onBatchSelectChange(selectEl) {
      const container = selectEl.closest('.form-group') || selectEl.parentElement;
      const customInput = container?.querySelector('.disp-item-custom-batch');
      if (customInput) {
        if (selectEl.value === 'CUSTOM') {
          customInput.style.display = 'block';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
          customInput.value = '';
        }
      }
    },

    /**
     * Submit Prepare Dispatch Slip
     */
    async submitPrepareDispatch() {
      const orderId = parseInt(document.getElementById('disp-order-select')?.value, 10);
      const dispatchNo = document.getElementById('disp-slip-no')?.value;
      const dispatchDate = document.getElementById('disp-date')?.value;
      const vehicleNo = document.getElementById('disp-vehicle-no')?.value;
      const transporterName = document.getElementById('disp-transporter')?.value;
      const driverContact = document.getElementById('disp-driver-contact')?.value;
      const ewayBillNo = document.getElementById('disp-eway-bill')?.value;
      const notes = document.getElementById('disp-notes')?.value;

      if (!orderId) {
        APP.showToast('Please select a sales order.', 'error');
        return;
      }

      const itemRows = document.querySelectorAll('#disp-items-container .dispatch-item-card, #disp-items-container tbody tr');
      const items = [];

      for (const row of itemRows) {
        const orderItemId = parseInt(row.getAttribute('data-order-item-id'), 10);
        const upb = parseInt(row.getAttribute('data-units-per-box'), 10) || 10;
        const qtyInput = row.querySelector('.disp-item-qty');
        const batchSelect = row.querySelector('.disp-item-batch');
        const customInput = row.querySelector('.disp-item-custom-batch');

        const qty = parseInt(qtyInput?.value, 10) || 0;
        const maxAllowed = parseInt(qtyInput?.getAttribute('data-max') || qtyInput?.getAttribute('max'), 10);
        if (qty > 0) {
          if (!isNaN(maxAllowed) && qty > maxAllowed) {
            APP.showToast(`Dispatch quantity (${qty}) cannot exceed remaining order quantity (${maxAllowed}).`, 'error');
            return;
          }

          let batchId = null;
          let batchNo = '';

          if (batchSelect) {
            if (batchSelect.tagName === 'SELECT' && batchSelect.value === 'CUSTOM') {
              batchNo = (customInput?.value || '').trim();
              if (!batchNo) {
                APP.showToast('Please enter a custom batch number.', 'error');
                return;
              }
            } else if (batchSelect.options && batchSelect.selectedIndex >= 0) {
              const selectedOpt = batchSelect.options[batchSelect.selectedIndex];
              batchNo = selectedOpt?.getAttribute('data-batch-no') || (selectedOpt?.text ? selectedOpt.text.split(' ')[0] : 'B-01');
              const valNum = parseInt(batchSelect.value, 10);
              if (!isNaN(valNum)) batchId = valNum;
            } else {
              batchNo = batchSelect.getAttribute?.('data-batch-no') || batchSelect.value || 'B-01';
              const valNum = parseInt(batchSelect.value, 10);
              if (!isNaN(valNum)) batchId = valNum;
            }
          }
          if (!batchNo) batchNo = 'B-01';

          items.push({
            order_item_id: orderItemId,
            stock_batch_id: null, // Production batches do not gate order dispatches; stock is authoritative in inventory_items
            batch_no: batchNo,
            total_units_dispatched: qty,
            units_per_box: upb
          });
        }
      }

      if (!items.length) {
        APP.showToast('Please enter dispatch quantity (> 0) for at least one item.', 'error');
        return;
      }

      const sourceWarehouseId = parseInt(document.getElementById('disp-source-warehouse')?.value || 1, 10);
      const deliveryTarget = document.getElementById('disp-delivery-target')?.value || 'CUSTOMER';
      const targetWarehouseId = (deliveryTarget === 'GODOWN') ? parseInt(document.getElementById('disp-target-warehouse')?.value, 10) : null;
      const targetWhEl = document.getElementById('disp-target-warehouse');
      const targetWarehouseName = (deliveryTarget === 'GODOWN' && targetWhEl && targetWhEl.selectedOptions[0]) ? targetWhEl.selectedOptions[0].text : null;

      try {
        APP.showToast('Creating Commercial Dispatch Slip…', 'info');
        const res = await window.DISPATCH_SERVICE.prepareDispatch(window.dbClient, {
          order_id: orderId,
          dispatch_no: dispatchNo,
          dispatch_date: dispatchDate,
          warehouse_id: sourceWarehouseId,
          delivery_target: deliveryTarget,
          target_warehouse_id: targetWarehouseId,
          target_warehouse_name: targetWarehouseName,
          vehicle_no: vehicleNo,
          transporter_name: transporterName,
          driver_contact: driverContact,
          eway_bill_no: ewayBillNo,
          notes: notes,
          items: items,
          idempotency_key: `DSP-PREP-${dispatchNo}-${orderId}`
        });

        APP.showToast(`Dispatch Slip #${res.dispatch.dispatch_no} created successfully!`, 'success');
        APP.closeModal('prepare-dispatch-modal');
        await this.loadDispatches();
        if (typeof window.loadOrders === 'function') window.loadOrders();
      } catch (err) {
        console.error('submitPrepareDispatch error:', err);
        APP.showToast('Dispatch preparation failed: ' + err.message, 'error');
      }
    },

    /**
     * Open Godown Packing Completion Verification modal
     */
    async openVerifyDispatch(dispatchId) {
      currentActionDispatchId = dispatchId;
      let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
      if (!details || !details.dispatch) {
        const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
        if (memDisp) {
          details = { dispatch: memDisp, items: memDisp.items || [] };
        }
      }
      if (!details || !details.dispatch) {
        APP.showToast('Dispatch not found', 'error');
        return;
      }

      const d = details.dispatch;
      let items = details.items || [];
      if ((!items || items.length === 0) && d.items && d.items.length) {
        items = d.items;
      }

      // Always synchronize item details with the actual order
      if (d.order_id) {
        let orderItems = [];
        if (window.dbClient) {
          try {
            const { data: oiList } = await window.dbClient.from('order_items').select('id, product_id, product_name, packing_size, packaging_size, unit_price').eq('order_id', d.order_id);
            if (Array.isArray(oiList) && oiList.length) orderItems = oiList;
          } catch (_) {}
        }
        if (!orderItems.length && window.allOrders) {
          const pOrder = window.allOrders.find(o => String(o.id) === String(d.order_id));
          if (pOrder && Array.isArray(pOrder.items) && pOrder.items.length) orderItems = pOrder.items;
        }
        if (orderItems.length) {
          items.forEach(it => {
            const oiMatch = orderItems.find(oi => (it.order_item_id && oi.id == it.order_item_id) || (oi.product_id && it.product_id && String(oi.product_id) === String(it.product_id)) || (oi.product_name && String(oi.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim()));
            if (oiMatch) {
              const actualPack = oiMatch.packing_size || oiMatch.packaging_size;
              if (actualPack) {
                it.packaging_size = actualPack;
                it.packing_size = actualPack;
              }
              if (oiMatch.product_name) it.product_name = oiMatch.product_name;
              if (oiMatch.unit_price) it.unit_price = parseFloat(oiMatch.unit_price) || it.unit_price;
            }
          });
        }
      }

      const matchDigits = String(d.order_no || '').match(/\d+/);
      const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
      if (isRandomDsp(d.dispatch_no)) {
        d.dispatch_no = `DSP-${orderDigits}`;
      }

      const body = document.getElementById('verify-dispatch-body');
      body.innerHTML = `
        <div class="dispatch-meta-card">
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item">
              <span class="dispatch-meta-label">Dispatch Slip:</span>
              <span class="dispatch-meta-val">${safeEscape(d.dispatch_no)}</span>
            </div>
            <div class="dispatch-meta-item">
              <span class="dispatch-meta-label">Order:</span>
              <span class="dispatch-meta-val">${safeEscape(d.order_no)}</span>
            </div>
          </div>
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item dispatch-meta-full">
              <span class="dispatch-meta-label">Client:</span>
              <span class="dispatch-meta-val">${safeEscape(d.client_name)}</span>
            </div>
          </div>
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item dispatch-meta-full">
              <span class="dispatch-meta-label">Total Units:</span>
              <span class="dispatch-meta-val font-bold text-primary">${d.total_units_dispatched} units (${d.total_boxes_dispatched || 0} Boxes)</span>
            </div>
          </div>
        </div>

        <div class="dispatch-cargo-section">
          <h5 class="dispatch-cargo-title">Items to Verify</h5>
          
          <!-- Desktop / Laptop Table (> 768px) -->
          <div class="dispatch-cargo-table-wrap">
            <table class="dispatch-cargo-table">
              <thead>
                <tr>
                  <th style="width:42%; text-align:left;">Product</th>
                  <th style="width:24%; text-align:center;">Packing Size</th>
                  <th style="width:18%; text-align:center;">Boxes</th>
                  <th style="width:16%; text-align:right;">Total Units</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const packSize = it.packaging_size || it.packing_size || '—';
                  return `
                  <tr>
                    <td class="col-product">${safeEscape(it.product_name)}</td>
                    <td class="col-pack text-center"><span class="badge badge-neutral pack-badge">${safeEscape(packSize)}</span></td>
                    <td class="col-boxes text-center font-bold">${it.boxes_dispatched || 0} Boxes${it.loose_dispatched ? ` <small class="text-muted">+ ${it.loose_dispatched} loose</small>` : ''}</td>
                    <td class="col-units text-right font-bold text-primary">${it.total_units_dispatched} units</td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Responsive Cards (<= 768px) -->
          <div class="dispatch-cargo-cards-mobile">
            ${items.map(it => {
              const packSize = it.packaging_size || it.packing_size || '—';
              return `
              <div class="dispatch-cargo-card">
                <div class="dispatch-cargo-card-header">
                  <div class="dispatch-cargo-pname">${safeEscape(it.product_name)}</div>
                  <span class="badge badge-neutral pack-badge">${safeEscape(packSize)}</span>
                </div>
                <div class="dispatch-cargo-card-grid">
                  <div class="dispatch-cargo-metric">
                    <span class="dispatch-metric-label">Boxes Dispatched</span>
                    <span class="dispatch-metric-val font-bold">${it.boxes_dispatched || 0} Boxes${it.loose_dispatched ? ` <small class="text-muted">+ ${it.loose_dispatched} loose</small>` : ''}</span>
                  </div>
                  <div class="dispatch-cargo-metric">
                    <span class="dispatch-metric-label">Total Units</span>
                    <span class="dispatch-metric-val font-bold text-primary">${it.total_units_dispatched} units</span>
                  </div>
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px; margin-top:14px;">
          <label class="form-label">Verified By (Godown Operator / Supervisor) <span class="required">*</span></label>
          <input class="form-input" id="verify-by-name" value="Godown Operator" placeholder="Operator name…">
        </div>
        <div class="form-group">
          <label class="form-label">Physical Packaging Verification Notes</label>
          <textarea class="form-textarea" id="verify-notes" rows="2">Physical corrugated cartons, batch seal intact, bottle count and labeling verified.</textarea>
        </div>
      `;

      APP.openModal('verify-dispatch-modal');
    },

    async submitVerifyDispatch() {
      if (!currentActionDispatchId) return;
      const verifiedBy = document.getElementById('verify-by-name')?.value || 'Godown Operator';
      const notes = document.getElementById('verify-notes')?.value;

      try {
        await window.DISPATCH_SERVICE.verifyPacking(window.dbClient, {
          dispatchId: currentActionDispatchId,
          verifiedBy: verifiedBy,
          verificationNotes: notes
        });
        APP.showToast('Packing verification confirmed!', 'success');
        APP.closeModal('verify-dispatch-modal');
        await this.loadDispatches();
        if (typeof window.loadOrders === 'function') window.loadOrders();
      } catch (err) {
        APP.showToast('Verification failed: ' + err.message, 'error');
      }
    },

    /**
     * Open Manager Dispatch Authorization modal
     */
    async openApproveDispatch(dispatchId) {
      currentActionDispatchId = dispatchId;
      let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
      if (!details || !details.dispatch) {
        const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
        if (memDisp) {
          details = { dispatch: memDisp, items: memDisp.items || [] };
        }
      }
      if (!details || !details.dispatch) {
        APP.showToast('Dispatch not found', 'error');
        return;
      }
      const d = details.dispatch;
      let items = details.items || [];
      if ((!items || items.length === 0) && d.items && d.items.length) {
        items = d.items;
      }

      // Always synchronize item details with the actual order
      if (d.order_id) {
        let orderItems = [];
        if (window.dbClient) {
          try {
            const { data: oiList } = await window.dbClient.from('order_items').select('id, product_id, product_name, packing_size, packaging_size, unit_price').eq('order_id', d.order_id);
            if (Array.isArray(oiList) && oiList.length) orderItems = oiList;
          } catch (_) {}
        }
        if (!orderItems.length && window.allOrders) {
          const pOrder = window.allOrders.find(o => String(o.id) === String(d.order_id));
          if (pOrder && Array.isArray(pOrder.items) && pOrder.items.length) orderItems = pOrder.items;
        }
        if (orderItems.length) {
          items.forEach(it => {
            const oiMatch = orderItems.find(oi => (it.order_item_id && oi.id == it.order_item_id) || (oi.product_id && it.product_id && String(oi.product_id) === String(it.product_id)) || (oi.product_name && String(oi.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim()));
            if (oiMatch) {
              const actualPack = oiMatch.packing_size || oiMatch.packaging_size;
              if (actualPack) {
                it.packaging_size = actualPack;
                it.packing_size = actualPack;
              }
              if (oiMatch.product_name) it.product_name = oiMatch.product_name;
              if (oiMatch.unit_price) it.unit_price = parseFloat(oiMatch.unit_price) || it.unit_price;
            }
          });
        }
      }

      const matchDigits = String(d.order_no || '').match(/\d+/);
      const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
      if (isRandomDsp(d.dispatch_no)) {
        d.dispatch_no = `DSP-${orderDigits}`;
      }

      const body = document.getElementById('approve-dispatch-body');
      body.innerHTML = `
        <div class="dispatch-meta-card">
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item">
              <span class="dispatch-meta-label">Dispatch Slip:</span>
              <span class="dispatch-meta-val">${safeEscape(d.dispatch_no)}</span>
            </div>
            <div class="dispatch-meta-item">
              <span class="dispatch-meta-label">Verified By:</span>
              <span class="dispatch-meta-val">${safeEscape(d.verified_by || 'Godown Operator')}</span>
            </div>
          </div>
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item dispatch-meta-full">
              <span class="dispatch-meta-label">Client:</span>
              <span class="dispatch-meta-val">${safeEscape(d.client_name)}</span>
            </div>
          </div>
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item dispatch-meta-full">
              <span class="dispatch-meta-label">Total Volume:</span>
              <span class="dispatch-meta-val font-bold text-primary">${d.total_units_dispatched} units (${d.total_boxes_dispatched || 0} Boxes)</span>
            </div>
          </div>
        </div>

        <div class="dispatch-cargo-section">
          <h5 class="dispatch-cargo-title">Verified Cargo & Packaging</h5>
          
          <!-- Desktop / Laptop Table (> 768px) -->
          <div class="dispatch-cargo-table-wrap">
            <table class="dispatch-cargo-table">
              <thead>
                <tr>
                  <th style="width:42%; text-align:left;">Product</th>
                  <th style="width:24%; text-align:center;">Packing Size</th>
                  <th style="width:18%; text-align:center;">Boxes</th>
                  <th style="width:16%; text-align:right;">Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const packSize = it.packaging_size || it.packing_size || '—';
                  return `
                  <tr>
                    <td class="col-product">${safeEscape(it.product_name)}</td>
                    <td class="col-pack text-center"><span class="badge badge-neutral pack-badge">${safeEscape(packSize)}</span></td>
                    <td class="col-boxes text-center font-bold">${it.boxes_dispatched || 0} Bx</td>
                    <td class="col-units text-right font-bold text-primary">${it.total_units_dispatched} units</td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Responsive Cards (<= 768px) -->
          <div class="dispatch-cargo-cards-mobile">
            ${items.map(it => {
              const packSize = it.packaging_size || it.packing_size || '—';
              return `
              <div class="dispatch-cargo-card">
                <div class="dispatch-cargo-card-header">
                  <div class="dispatch-cargo-pname">${safeEscape(it.product_name)}</div>
                  <span class="badge badge-neutral pack-badge">${safeEscape(packSize)}</span>
                </div>
                <div class="dispatch-cargo-card-grid">
                  <div class="dispatch-cargo-metric">
                    <span class="dispatch-metric-label">Boxes Dispatched</span>
                    <span class="dispatch-metric-val font-bold">${it.boxes_dispatched || 0} Bx</span>
                  </div>
                  <div class="dispatch-cargo-metric">
                    <span class="dispatch-metric-label">Verified Quantity</span>
                    <span class="dispatch-metric-val font-bold text-primary">${it.total_units_dispatched} units</span>
                  </div>
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>

        <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px; margin-top:12px; line-height:1.45;">
          Authorizing this commercial dispatch confirms customer credit and authorizes the logistics gate pass.
        </p>

        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Approved By (Manager / Director) <span class="required">*</span></label>
          <input class="form-input" id="approve-by-name" value="Dispatch Manager" placeholder="Manager name…">
        </div>
        <div class="form-group">
          <label class="form-label">Approval Remarks</label>
          <textarea class="form-textarea" id="approve-notes" rows="2">Authorized for commercial logistics and gate exit.</textarea>
        </div>
      `;

      APP.openModal('approve-dispatch-modal');
    },

    async submitApproveDispatch() {
      if (!currentActionDispatchId) return;
      const approvedBy = document.getElementById('approve-by-name')?.value || 'Dispatch Manager';
      const notes = document.getElementById('approve-notes')?.value;

      try {
        await window.DISPATCH_SERVICE.approveDispatch(window.dbClient, {
          dispatchId: currentActionDispatchId,
          approvedBy: approvedBy,
          approvalNotes: notes
        });
        APP.showToast('Dispatch approved for gate exit!', 'success');
        APP.closeModal('approve-dispatch-modal');
        await this.loadDispatches();
        if (typeof window.loadOrders === 'function') window.loadOrders();
      } catch (err) {
        APP.showToast('Approval failed: ' + err.message, 'error');
      }
    },

    /**
     * Open Gate Exit & Single-Posting Physical Stock Deduction modal
     */
    async openExecuteDispatch(dispatchId) {
      currentActionDispatchId = dispatchId;
      let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
      if (!details || !details.dispatch) {
        const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
        if (memDisp) {
          details = { dispatch: memDisp, items: memDisp.items || [] };
        }
      }
      if (!details || !details.dispatch) {
        APP.showToast('Dispatch not found', 'error');
        return;
      }
      const d = details.dispatch;

      const body = document.getElementById('execute-dispatch-body');
      body.innerHTML = `
        <div style="background:rgba(22, 163, 74, 0.08); padding:12px; border-radius:8px; border:1px solid rgba(22, 163, 74, 0.3); margin-bottom:14px; font-size:13px;">
          <div style="font-weight:700; color:#16a34a; margin-bottom:4px;">SINGLE-POSTING PHYSICAL STOCK DEDUCTION</div>
          <p style="margin:0; font-size:12px; color:var(--text);">
            Confirming gate exit will physically deduct the <strong>${d.total_units_dispatched} units</strong> from warehouse origin batches <strong>EXACTLY ONCE</strong>, and update order remaining balance.
          </p>
        </div>

        <div class="form-grid product-form-grid" style="gap:10px;">
          <div class="form-group">
            <label class="form-label">Gate Officer</label>
            <input class="form-input" id="gate-officer-name" value="Security Gatekeeper">
          </div>
          <div class="form-group">
            <label class="form-label">Vehicle Registration No</label>
            <input class="form-input" id="gate-vehicle-no" value="${d.vehicle_no ? formatVehicle(d.vehicle_no) : ''}" placeholder="e.g. GJ 03 AB 1512" style="text-transform:uppercase; font-weight:700; letter-spacing:0.5px;" oninput="this.value = DISPATCH_UI.formatVehicleNumber(this.value)" onblur="this.value = DISPATCH_UI.formatVehicleNumber(this.value)">
          </div>
          <div class="form-group">
            <label class="form-label">Transporter Name</label>
            <input class="form-input" id="gate-transporter-name" value="${d.transporter_name || ''}" placeholder="Shreeji Logistics">
          </div>
          <div class="form-group">
            <label class="form-label">Government E-Way Bill No</label>
            <input class="form-input" id="gate-eway-bill" value="${d.eway_bill_no || ''}" placeholder="EWB-2026-99988">
          </div>
        </div>
      `;

      APP.openModal('execute-dispatch-modal');
    },

    async submitExecuteDispatch() {
      if (!currentActionDispatchId) return;
      const dispatchedBy = document.getElementById('gate-officer-name')?.value || 'Gate Officer';
      const vehicleNo = document.getElementById('gate-vehicle-no')?.value;
      const transporterName = document.getElementById('gate-transporter-name')?.value;
      const ewayBillNo = document.getElementById('gate-eway-bill')?.value;

      try {
        APP.showToast('Deducting inventory & posting gate exit…', 'info');
        const res = await window.DISPATCH_SERVICE.executeDispatch(window.dbClient, {
          dispatchId: currentActionDispatchId,
          dispatchedBy: dispatchedBy,
          vehicleNo: vehicleNo,
          transporterName: transporterName,
          ewayBillNo: ewayBillNo
        });

        APP.showToast(`Gate Pass posted! Stock deducted. Order status: ${res.orderDispatchStatus}`, 'success');
        APP.closeModal('execute-dispatch-modal');
        await this.loadDispatches();
        if (typeof window.loadOrders === 'function') window.loadOrders();
      } catch (err) {
        APP.showToast('Gate exit execution failed: ' + err.message, 'error');
      }
    },

    /**
     * Open Commercial Tax Invoice Generation modal (Zero Double-Deduction)
     */
    async openGenerateInvoice(dispatchId) {
      currentActionDispatchId = dispatchId;
      let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
      if (!details || !details.dispatch) {
        const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
        if (memDisp) {
          details = { dispatch: memDisp, items: memDisp.items || [] };
        }
      }
      if (!details || !details.dispatch) {
        APP.showToast('Dispatch not found', 'error');
        return;
      }
      const d = details.dispatch;
      const items = details.items || [];

      const nextInvNo = await getNextDispatchInvoiceNumber(window.dbClient, d);
      const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.total_amount) || 0), 0);
      const tax = subtotal * 0.12;
      const grandTotal = subtotal + tax;

      const body = document.getElementById('generate-invoice-body');
      body.innerHTML = `
        <div style="background:rgba(12, 57, 37, 0.08); padding:12px; border-radius:8px; border:1px solid var(--border); margin-bottom:14px; font-size:13px;">
          <div style="font-weight:700; color:var(--primary); margin-bottom:4px;">ZERO DOUBLE-DEDUCTION GUARANTEE</div>
          <p style="margin:0; font-size:12px; color:var(--text);">
            Physical stock was already deducted at gate pass exit. This tax invoice records financial billing with <strong>is_stock_deducted: false</strong> so inventory is NEVER deducted a second time.
          </p>
        </div>

        <div class="dispatch-meta-card" style="margin-bottom:14px;">
          <div class="dispatch-meta-row">
            <div class="dispatch-meta-item">
              <span class="dispatch-meta-label">Dispatch Slip:</span>
              <span class="dispatch-meta-val font-bold" style="white-space:nowrap;">${safeEscape(d.dispatch_no)}</span>
            </div>
            <div class="dispatch-meta-item" style="flex:1 1 auto; min-width:0;">
              <span class="dispatch-meta-label">Client:</span>
              <span class="dispatch-meta-val font-bold">${safeEscape(d.client_name)}</span>
            </div>
          </div>
        </div>

        <div class="form-grid product-form-grid" style="gap:10px; margin-bottom:14px;">
          <div class="form-group">
            <label class="form-label">Invoice Number</label>
            <input class="form-input" id="inv-no" value="${nextInvNo}" style="font-weight:700;">
          </div>
          <div class="form-group">
            <label class="form-label">Created By (Accountant)</label>
            <input class="form-input" id="inv-creator" value="Accounts Team">
          </div>
        </div>

        <div style="background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>Subtotal:</span><strong>${UTILS.fmtCurrency(subtotal)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span>GST (12%):</span><strong>${UTILS.fmtCurrency(tax)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800; border-top:1px solid var(--border); padding-top:6px; color:var(--primary);">
            <span>Grand Total:</span><span>${UTILS.fmtCurrency(grandTotal)}</span>
          </div>
        </div>
      `;

      APP.openModal('generate-invoice-modal');
    },

    async submitGenerateInvoice() {
      if (!currentActionDispatchId) return;
      const invNo = document.getElementById('inv-no')?.value;
      const createdBy = document.getElementById('inv-creator')?.value || 'Accountant';

      try {
        const res = await window.DISPATCH_SERVICE.generateInvoiceForDispatch(window.dbClient, {
          dispatchId: currentActionDispatchId,
          invoiceNo: invNo,
          createdBy: createdBy
        });

        APP.showToast(`Commercial Invoice #${res.invoice.invoice_no} created (Zero Double-Deduction)!`, 'success');
        APP.closeModal('generate-invoice-modal');
        await this.loadDispatches();
        await this.viewGeneratedInvoice(currentActionDispatchId);
      } catch (err) {
        APP.showToast('Invoice generation failed: ' + err.message, 'error');
      }
    },

    /**
     * Open Safe Reversal / Customer Return modal
     */
    async openReverseDispatch(dispatchId) {
      currentActionDispatchId = dispatchId;
      let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
      if (!details || !details.dispatch) {
        const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
        if (memDisp) {
          details = { dispatch: memDisp, items: memDisp.items || [] };
        }
      }
      if (!details || !details.dispatch) {
        APP.showToast('Dispatch not found', 'error');
        return;
      }
      const d = details.dispatch;

      const body = document.getElementById('reverse-dispatch-body');
      body.innerHTML = `
        <div style="background:rgba(239, 68, 68, 0.08); padding:12px; border-radius:8px; border:1px solid rgba(239, 68, 68, 0.3); margin-bottom:14px; font-size:13px;">
          <div style="font-weight:700; color:var(--danger, #ef4444); margin-bottom:4px;">SAFE DISPATCH REVERSAL & STOCK RESTORATION</div>
          <p style="margin:0; font-size:12px; color:var(--text);">
            Reversing this dispatch will safely restore <strong>${d.total_units_dispatched} units</strong> back to origin warehouse batches and restore remaining balance on Order #${d.order_no}.
          </p>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Reversal Reason / Type <span class="required">*</span></label>
          <select class="form-select" id="rev-type">
            <option value="CUSTOMER_RETURN">Customer Return / Rejection</option>
            <option value="DAMAGED_IN_TRANSIT">Damaged in Transit Return</option>
            <option value="CANCELLATION">Order Cancellation at Gate</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Reason Notes</label>
          <textarea class="form-textarea" id="rev-reason" rows="2" placeholder="Vehicle breakdown, quality dispute, transport return…"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Authorized Supervisor</label>
          <input class="form-input" id="rev-by-name" value="Godown Supervisor">
        </div>
      `;

      APP.openModal('reverse-dispatch-modal');
    },

    async submitReverseDispatch() {
      if (!currentActionDispatchId) return;
      const reversalType = document.getElementById('rev-type')?.value || 'CUSTOMER_RETURN';
      const reason = document.getElementById('rev-reason')?.value || 'Customer return';
      const reversedBy = document.getElementById('rev-by-name')?.value || 'Godown Supervisor';

      try {
        APP.showToast('Restoring physical stock and reversing dispatch…', 'info');
        const res = await window.DISPATCH_SERVICE.cancelOrReverseDispatch(window.dbClient, {
          dispatchId: currentActionDispatchId,
          reversalType: reversalType,
          reason: reason,
          reversedBy: reversedBy
        });

        APP.showToast(`Dispatch reversed! Stock restored. Reversal Ref: ${res.reversalNo}`, 'success');
        APP.closeModal('reverse-dispatch-modal');
        await this.loadDispatches();
        if (typeof window.loadOrders === 'function') window.loadOrders();
      } catch (err) {
        APP.showToast('Reversal failed: ' + err.message, 'error');
      }
    },

    /**
     * View Commercial Dispatch Slip & Delivery Challan (No Loose, Clean Executive UI)
     */
    async viewDispatch(dispatchId) {
      try {
        let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
        if (!details || !details.dispatch) {
          const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
          if (memDisp) {
            details = { dispatch: memDisp, items: memDisp.items || [] };
          }
        }
        if (!details || !details.dispatch) {
          APP.showToast('Dispatch details not found', 'error');
          return;
        }

        const d = details.dispatch;
        let items = details.items || [];
        if ((!items || items.length === 0) && d.items && d.items.length) {
          items = d.items;
        }
        if (Array.isArray(items) && items.length > 1) {
          const uniqueItems = [];
          items.forEach(it => {
            const exists = uniqueItems.some(u =>
              (u.id && it.id && String(u.id) === String(it.id)) ||
              (u.order_item_id && it.order_item_id && String(u.order_item_id) === String(it.order_item_id)) ||
              (u.product_id && it.product_id && String(u.product_id) === String(it.product_id)) ||
              (u.product_name && it.product_name && String(u.product_name).trim().toLowerCase() === String(it.product_name).trim().toLowerCase())
            );
            if (!exists) uniqueItems.push(it);
          });
          items = uniqueItems;
        }

        // Always synchronize item details with the actual order
        if (d.order_id) {
          let orderItems = [];
          if (window.dbClient) {
            try {
              const { data: oiList } = await window.dbClient.from('order_items').select('id, product_id, product_name, packing_size, packaging_size, unit_price').eq('order_id', d.order_id);
              if (Array.isArray(oiList) && oiList.length) orderItems = oiList;
            } catch (_) {}
          }
          if (!orderItems.length && window.allOrders) {
            const pOrder = window.allOrders.find(o => String(o.id) === String(d.order_id));
            if (pOrder && Array.isArray(pOrder.items) && pOrder.items.length) orderItems = pOrder.items;
          }
          if (orderItems.length) {
            items.forEach(it => {
              const oiMatch = orderItems.find(oi => (it.order_item_id && oi.id == it.order_item_id) || (oi.product_id && it.product_id && String(oi.product_id) === String(it.product_id)) || (oi.product_name && String(oi.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim()));
              if (oiMatch) {
                const actualPack = oiMatch.packing_size || oiMatch.packaging_size;
                if (actualPack) {
                  it.packaging_size = actualPack;
                  it.packing_size = actualPack;
                }
                if (oiMatch.product_name) it.product_name = oiMatch.product_name;
                if (oiMatch.unit_price) it.unit_price = parseFloat(oiMatch.unit_price) || it.unit_price;
              }
            });
          }
        }

        const matchDigits = String(d.order_no || '').match(/\d+/);
        const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
        if (isRandomDsp(d.dispatch_no)) {
          d.dispatch_no = `DSP-${orderDigits}`;
        }
        const formattedVeh = d.vehicle_no ? formatVehicle(d.vehicle_no) : '';

        // Fetch client details if available
        let clientAddress = '';
        let clientGstin = '';
        let clientPhone = '';
        let parentOrder = (window.allOrders || []).find(o => String(o.id) === String(d.order_id));
        if (!parentOrder && d.order_id && window.dbClient) {
          try {
            const { data: oRow } = await window.dbClient.from('orders').select('*').eq('id', d.order_id).maybeSingle();
            parentOrder = oRow;
          } catch (_) {}
        }
        const clientId = d.client_id || parentOrder?.client_id;
        if (clientId && window.dbClient) {
          try {
            const { data: cRow } = await window.dbClient.from('clients').select('*').eq('id', clientId).maybeSingle();
            if (cRow) {
              clientAddress = cRow.address || '';
              clientGstin = cRow.gst || cRow.gstin || '';
              clientPhone = cRow.contact || cRow.phone || '';
            }
          } catch (_) {}
        }
        if (!clientPhone && (d.client_name || parentOrder?.client_name) && window.dbClient) {
          try {
            const cNameLookup = (d.client_name || parentOrder?.client_name || '').trim().toLowerCase();
            const { data: allC } = await window.dbClient.from('clients').select('*');
            if (Array.isArray(allC)) {
              const matchedC = allC.find(c => String(c.name || '').trim().toLowerCase() === cNameLookup)
                || allC.find(c => cNameLookup && cNameLookup.includes(String(c.name || '').trim().toLowerCase()));
              if (matchedC) {
                if (!clientAddress) clientAddress = matchedC.address || '';
                if (!clientGstin) clientGstin = matchedC.gst || matchedC.gstin || '';
                clientPhone = matchedC.contact || matchedC.phone || '';
              }
            }
          } catch (_) {}
        }

        currentViewDispatch = d;
        currentViewDispatchItems = items;
        currentViewDispatchClient = { address: clientAddress, gstin: clientGstin, phone: clientPhone };

        const safeEscape = (str) => {
          if (typeof escapeHtml === 'function') return escapeHtml(str);
          if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
          return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        };

        const sourceWhId = d.warehouse_id || 1;
        const sourceWhDisplay = resolveGodownDisplayName(sourceWhId, 'Main Plant Warehouse (WH-E-01)');
        const isGodown = d.delivery_target === 'GODOWN';
        const destDisplayName = isGodown 
          ? resolveGodownDisplayName(d.target_warehouse_id, d.target_warehouse_name || 'Gas Godown (WH-E-GAS)')
          : `Direct Customer Delivery — ${safeEscape(d.client_name || 'Customer')}`;

        const content = document.getElementById('view-dispatch-content');
        content.innerHTML = `
          <div id="dispatch-slip-paper" style="background:#ffffff; color:#0f172a; width:100%; max-width:800px; margin:0 auto; padding:32px 38px; font-family:'Inter', -apple-system, BlinkMacSystemFont, sans-serif; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.06); box-sizing:border-box;">
            <!-- 1. Header: Logo | Company Center | Document Meta -->
            <div style="display:grid; grid-template-columns:110px 1fr auto; gap:16px; align-items:center; border-bottom:3px solid #0C3925; padding-bottom:18px; margin-bottom:20px;">
              <div style="display:flex; align-items:center; justify-content:flex-start;">
                <img src="../assets/images/logo.jpg" alt="Logo" style="height:80px; width:80px; object-fit:contain; display:block;" onerror="this.onerror=null; this.src='../apps/Invoice Builder/logo.jpg';">
              </div>
              <div style="text-align:center;">
                <h2 style="font-size:21px; font-weight:800; color:#0C3925; margin:0; letter-spacing:-0.4px;">Anjani Agri Care</h2>
                <div style="font-size:11px; color:#334155; margin:4px 0 0; line-height:1.5;">
                  <span>Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.</span><br>
                  <span>Phone: <strong>+91 96646 75227</strong></span><span> &nbsp;|&nbsp; </span><span>Email: <strong>anjaniagricare@gmail.com</strong></span><br>
                  <span>GSTIN: <strong>24AERFS1718Q1ZB</strong></span>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="background:#0C3925; color:#ffffff; font-size:11px; font-weight:800; letter-spacing:1.5px; padding:6px 14px; border-radius:6px; display:inline-block; text-transform:uppercase;">DELIVERY CHALLAN</div>
                <div style="margin-top:6px; font-size:11.5px; line-height:1.6; color:#334155;">
                  Slip No: <strong style="color:#0f172a;" id="view-disp-no-val">${safeEscape(d.dispatch_no)}</strong><br>
                  Date: <strong style="color:#0f172a;">${UTILS.fmtDate(d.dispatch_date)}</strong><br>
                  Status: <span style="font-weight:700; color:#059669;">${safeEscape(d.status || 'Dispatched')}</span>
                </div>
              </div>
            </div>

            <!-- 2. Consignee & Transport 2-Column Info Grid -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 16px;">
                <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#0C3925; margin-bottom:6px;">Consignee / Customer Details</div>
                <div style="font-size:15px; font-weight:800; color:#0f172a;">${safeEscape(d.client_name)}</div>
                <div style="font-size:12px; color:#475569; margin-top:4px; line-height:1.5;">
                  Order Ref: <strong style="color:#0C3925;">${safeEscape(d.order_no)}</strong><br>
                  ${clientAddress ? `Address: ${safeEscape(clientAddress)}<br>` : ''}
                  ${clientPhone ? `Phone: ${safeEscape(clientPhone)}<br>` : ''}
                  ${clientGstin ? `GSTIN: <strong>${safeEscape(clientGstin)}</strong>` : ''}
                </div>
              </div>

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 16px;">
                <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#0C3925; margin-bottom:6px;">Transport & Logistics Gate Pass</div>
                <div style="font-size:12px; line-height:1.6; color:#334155;">
                  Vehicle Registration: <strong style="color:#0f172a; font-size:13px; letter-spacing:0.5px;">${safeEscape(formattedVeh || 'Not Assigned')}</strong><br>
                  Transporter Name: <strong style="color:#0f172a;">${safeEscape(d.transporter_name || 'Direct Delivery')}</strong><br>
                  Driver Contact: <strong style="color:#0f172a;">${safeEscape(d.driver_contact || '—')}</strong><br>
                  E-Way Bill No: <strong style="color:#0f172a;">${safeEscape(d.eway_bill_no || '—')}</strong>
                </div>
              </div>
            </div>

            <!-- 2B. Explicit Source & Destination Route -->
            <div class="slip-route-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
              <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px;">
                <div class="slip-route-label" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0C3925; margin-bottom:4px;">SOURCE (DISPATCHING FACILITY)</div>
                <div class="slip-route-val" style="font-size:13.5px; font-weight:800; color:#0f172a;">${safeEscape(sourceWhDisplay)}</div>
                <div style="font-size:11px; color:#15803d; margin-top:2px;">Origin Manufacturing Plant / Warehouse</div>
              </div>

              <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px;">
                <div class="slip-route-label" style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#0C3925; margin-bottom:4px;">DESTINATION (DELIVERY POINT)</div>
                <div class="slip-route-val" style="font-size:13.5px; font-weight:800; color:#0f172a;">${safeEscape(destTitle)}</div>
                <div style="font-size:11px; color:#15803d; margin-top:2px;">${safeEscape(destSub)}</div>
              </div>
            </div>

            <!-- 3. Dispatched Items Table (Clean: Boxes & Total Units, NO LOOSE) -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:12.5px;">
              <thead>
                <tr style="background:#0C3925 !important; color:#ffffff !important;">
                  <th style="padding:9px 12px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; color:#ffffff !important; background:#0C3925 !important; border-top-left-radius:6px; border-bottom-left-radius:6px;">No.</th>
                  <th style="padding:9px 12px; text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; color:#ffffff !important; background:#0C3925 !important;">Products</th>
                  <th style="padding:9px 12px; text-align:center; font-size:11px; font-weight:700; text-transform:uppercase; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap !important;">Pack Size</th>
                  <th style="padding:9px 12px; text-align:center; font-size:11px; font-weight:700; text-transform:uppercase; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap !important;">Boxes</th>
                  <th style="padding:9px 12px; text-align:right; font-size:11px; font-weight:700; text-transform:uppercase; color:#ffffff !important; background:#0C3925 !important; border-top-right-radius:6px; border-bottom-right-radius:6px; white-space:nowrap !important;">Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((it, idx) => `
                  <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:9px 12px; color:#64748b; font-weight:600;">${idx + 1}</td>
                    <td style="padding:9px 12px; font-weight:700; color:#0f172a;">${safeEscape(it.product_name)}</td>
                    <td style="padding:9px 12px; text-align:center; white-space:nowrap !important;"><span style="background:#e2e8f0; color:#334155; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; white-space:nowrap !important; display:inline-block;">${safeEscape(it.packaging_size || '1 Litre')}</span></td>
                    <td style="padding:9px 12px; text-align:center; font-weight:700; color:#0f172a; white-space:nowrap !important;">${it.boxes_dispatched || 0} Boxes</td>
                    <td style="padding:9px 12px; text-align:right; font-weight:800; color:#0C3925; white-space:nowrap !important;">${it.total_units_dispatched} units</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid #0C3925; background:#f8fafc; font-weight:800;">
                  <td colspan="3" style="padding:10px 12px; text-transform:uppercase; font-size:11.5px; color:#0C3925;">Total Dispatched Cargo</td>
                  <td style="padding:10px 12px; text-align:center; font-size:13px; color:#0f172a;">${d.total_boxes_dispatched || 0} Boxes</td>
                  <td style="padding:10px 12px; text-align:right; font-size:14px; color:#0C3925;">${d.total_units_dispatched || 0} Units</td>
                </tr>
              </tfoot>
            </table>

            <!-- 4. 3-Column Audit & Gate Control Signatures -->
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; border-top:1px dashed #cbd5e1; padding-top:18px; margin-top:20px; font-size:11.5px; color:#475569;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
                <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">1. Godown Packaging</div>
                <div>Verified By: <strong>${safeEscape(d.verified_by || 'Godown Operator')}</strong></div>
                <div>Date: <span>${d.verified_at ? UTILS.fmtDate(d.verified_at) : '—'}</span></div>
                <div style="margin-top:20px; border-top:1px solid #cbd5e1; padding-top:4px; font-size:10px; text-align:center;">Supervisor Signature</div>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
                <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">2. Commercial Authorization</div>
                <div>Approved By: <strong>${safeEscape(d.approved_by || 'Dispatch Manager')}</strong></div>
                <div>Date: <span>${d.approved_at ? UTILS.fmtDate(d.approved_at) : '—'}</span></div>
                <div style="margin-top:20px; border-top:1px solid #cbd5e1; padding-top:4px; font-size:10px; text-align:center;">Manager Signature</div>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px;">
                <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">3. Gate Security & Exit</div>
                <div>Officer: <strong>${safeEscape(d.dispatched_by || 'Gate Officer')}</strong></div>
                <div>Date: <span>${d.dispatched_at ? UTILS.fmtDate(d.dispatched_at) : '—'}</span></div>
                <div style="margin-top:20px; border-top:1px solid #cbd5e1; padding-top:4px; font-size:10px; text-align:center;">Gate Pass Exit Stamp</div>
              </div>
            </div>

            <!-- 5. Recipient Acknowledgment Strip -->
            <div style="margin-top:16px; padding:10px 14px; background:#f1f5f9; border-radius:6px; font-size:11px; color:#475569; display:flex; justify-content:space-between; align-items:center;">
              <span>Customer Acknowledgment: <strong>Received above goods in sealed corrugated cartons in sound condition.</strong></span>
              <span style="font-weight:700;">Receiver Sign: ________________</span>
            </div>
          </div>
        `;

        APP.openModal('view-dispatch-modal');
        DISPATCH_UI.applyDocMobileScaling('dispatch-slip-paper', 'view-dispatch-content');
      } catch (err) {
        console.error('viewDispatch error:', err);
        APP.showToast('Failed to view dispatch: ' + err.message, 'error');
      }
    },

    /**
     * Clean Single-Tab Print for Dispatch Slip
     */
    printDispatchSlip() {
      const paper = document.getElementById('dispatch-slip-paper') || document.getElementById('view-dispatch-content');
      if (!paper) {
        APP.showToast('Dispatch document is not ready', 'error');
        return;
      }
      document.body.classList.add('is-printing-slip');
      window.print();
      const cleanup = () => {
        document.body.classList.remove('is-printing-slip');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 1500);
    },

    /**
     * Draw Vector A4 Dispatch Slip / Delivery Challan
     * High-resolution, scalable vector typography matching executive ERP standard
     */
    drawA4DispatchSlipPdf(pdf, d, items = [], clientData = {}) {
      const PW = 210, PH = 297;
      const margin = 13.5;
      const contentWidth = PW - margin * 2;
      const rightEdge = PW - margin;

      const C_DARK_GREEN = [12, 57, 37];
      const C_TEXT_MAIN  = [15, 23, 42];
      const C_TEXT_MUTED = [100, 116, 139];
      const C_BORDER     = [226, 232, 240];
      const C_CARD_BG    = [248, 250, 252];
      const C_WHITE      = [255, 255, 255];

      let y = margin;

      // Draw Logo if element exists
      if (typeof document !== 'undefined') {
        const logoEl = document.querySelector('#dispatch-slip-paper img') || document.querySelector('#view-invoice-paper img') || document.querySelector('img[alt*="Logo"]');
        if (logoEl && logoEl.complete && logoEl.naturalWidth > 0) {
          try {
            const logoData = getElementImageDataUrl(logoEl);
            if (logoData) {
              pdf.addImage(logoData, 'JPEG', margin + 2, y + 1, 20, 20);
            }
          } catch (_) {}
        }
      }

      // 1. Header: Center Company Details
      const centerX = 105;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16.5);
      pdf.setTextColor(...C_DARK_GREEN);
      pdf.text('Anjani Agri Care', centerX, y + 6.5, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.25);
      pdf.setTextColor(...C_TEXT_MAIN);
      pdf.text('Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.', centerX, y + 11.5, { align: 'center' });
      pdf.text('Phone: +91 96646 75227  |  Email: anjaniagricare@gmail.com', centerX, y + 15.5, { align: 'center' });
      pdf.text('GSTIN: 24AERFS1718Q1ZB', centerX, y + 19.5, { align: 'center' });

      // Right Header: Delivery Challan Badge & Meta
      pdf.setFillColor(...C_DARK_GREEN);
      pdf.roundedRect(rightEdge - 42, y + 1, 42, 6.5, 1.8, 1.8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C_WHITE);
      pdf.text('DELIVERY CHALLAN', rightEdge - 21, y + 5.2, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C_TEXT_MUTED);
      pdf.text('Slip No: ', rightEdge - 42, y + 12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C_TEXT_MAIN);
      pdf.text(String(d.dispatch_no || 'DSP-01'), rightEdge, y + 12, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C_TEXT_MUTED);
      pdf.text('Date: ', rightEdge - 42, y + 16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C_TEXT_MAIN);
      pdf.text(String(d.dispatch_date || new Date().toISOString().split('T')[0]), rightEdge, y + 16, { align: 'right' });

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C_TEXT_MUTED);
      pdf.text('Status: ', rightEdge - 42, y + 20);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(5, 150, 105);
      pdf.text(String(d.status || 'Dispatched'), rightEdge, y + 20, { align: 'right' });

      y += 24;

      // Header Divider
      pdf.setDrawColor(...C_DARK_GREEN);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y, rightEdge, y);
      y += 5;

      // 2. Consignee & Transport 2-Column Info Grid
      const colW = (contentWidth - 6) / 2;
      const cardH = 34;

      // Left Card: Consignee
      pdf.setFillColor(...C_CARD_BG);
      pdf.setDrawColor(...C_BORDER);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(margin, y, colW, cardH, 2.5, 2.5, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C_DARK_GREEN);
      pdf.text('CONSIGNEE / CUSTOMER DETAILS', margin + 4, y + 5.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...C_TEXT_MAIN);
      pdf.text(String(d.client_name || 'Customer Name'), margin + 4, y + 10.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C_TEXT_MUTED);
      pdf.text('Order Ref: ', margin + 4, y + 15.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...C_DARK_GREEN);
      pdf.text(String(d.order_no || '—'), margin + 20, y + 15.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C_TEXT_MAIN);
      const resolveAddrFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState) ? window.resolveClientAddressAndState : null;
      const slipRes = resolveAddrFn ? resolveAddrFn({
        address: clientData.address || d.client_address || '',
        city: clientData.city || '',
        state: clientData.state || '',
        pincode: clientData.pincode || clientData.pin || '',
        gstin: cGst
      }) : null;
      const cAddr = slipRes ? [slipRes.cleanAddress, slipRes.state].filter(Boolean).join(', ') : (clientData.address || d.client_address || 'Rajkot, Gujarat');
      const cAddrLines = pdf.splitTextToSize(cAddr, colW - 8);
      pdf.text(cAddrLines.slice(0, 2), margin + 4, y + 20);

      const cGst = clientData.gstin || d.client_gstin || '';
      if (cGst) {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...C_TEXT_MUTED);
        pdf.text('GSTIN: ', margin + 4, y + 29);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...C_TEXT_MAIN);
        pdf.text(cGst, margin + 15, y + 29);
      }

      // Right Card: Transport & Logistics
      const rightColX = margin + colW + 6;
      pdf.setFillColor(...C_CARD_BG);
      pdf.setDrawColor(...C_BORDER);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(rightColX, y, colW, cardH, 2.5, 2.5, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C_DARK_GREEN);
      pdf.text('TRANSPORT & LOGISTICS GATE PASS', rightColX + 4, y + 5.5);

      const drawTransRow = (lbl, val, rowY, valBold = true, valColor = C_TEXT_MAIN) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...C_TEXT_MUTED);
        pdf.text(lbl, rightColX + 4, rowY);
        pdf.setFont('helvetica', valBold ? 'bold' : 'normal');
        pdf.setTextColor(...valColor);
        pdf.text(String(val || '—'), rightColX + colW - 4, rowY, { align: 'right' });
      };

      drawTransRow('Vehicle Registration:', d.vehicle_no ? formatVehicle(d.vehicle_no) : 'Not Assigned', y + 10.5, true, C_DARK_GREEN);
      drawTransRow('Transporter Name:', d.transporter_name || 'Direct Delivery', y + 15.5);
      drawTransRow('Driver Contact:', d.driver_contact || '—', y + 20.5);
      drawTransRow('E-Way Bill No:', d.eway_bill_no || '—', y + 25.5);

      y += cardH + 7;

      // 3. Dispatched Items Table
      pdf.setFillColor(...C_DARK_GREEN);
      pdf.roundedRect(margin, y, contentWidth, 8, 2.2, 2.2, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...C_WHITE);

      pdf.text('No.', margin + 4, y + 5.2);
      pdf.text('PRODUCTS', margin + 14, y + 5.2);
      pdf.text('PACK SIZE', margin + 105, y + 5.2, { align: 'center' });
      pdf.text('BOXES', margin + 145, y + 5.2, { align: 'center' });
      pdf.text('QUANTITY', rightEdge - 4, y + 5.2, { align: 'right' });
      y += 8;

      // Line items
      items.forEach((it, idx) => {
        const rowH = 8.5;
        if (y + rowH > PH - margin - 40) {
          pdf.addPage();
          y = margin + 5;
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...C_TEXT_MUTED);
        pdf.text(String(idx + 1), margin + 4, y + 5.5);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...C_TEXT_MAIN);
        pdf.text(String(it.product_name || 'Product'), margin + 14, y + 5.5);

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...C_TEXT_MAIN);
        pdf.text(String(it.packaging_size || '1 Litre'), margin + 105, y + 5.5, { align: 'center' });
        pdf.text(`${it.boxes_dispatched || 0} Boxes`, margin + 145, y + 5.5, { align: 'center' });

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...C_DARK_GREEN);
        pdf.text(`${it.total_units_dispatched || it.quantity || 0} units`, rightEdge - 4, y + 5.5, { align: 'right' });

        pdf.setDrawColor(...C_BORDER);
        pdf.setLineWidth(0.2);
        pdf.line(margin, y + rowH, rightEdge, y + rowH);

        y += rowH;
      });

      // Table Summary Footer
      const totH = 9;
      pdf.setFillColor(...C_CARD_BG);
      pdf.rect(margin, y, contentWidth, totH, 'F');
      pdf.setDrawColor(...C_DARK_GREEN);
      pdf.setLineWidth(0.6);
      pdf.line(margin, y, rightEdge, y);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...C_DARK_GREEN);
      pdf.text('TOTAL DISPATCHED CARGO', margin + 14, y + 6);
      pdf.text(`${d.total_boxes_dispatched || 0} Boxes`, margin + 145, y + 6, { align: 'center' });
      pdf.text(`${d.total_units_dispatched || 0} Units`, rightEdge - 4, y + 6, { align: 'right' });

      y += totH + 8;

      // 4. 3-Column Audit Signatures
      const sigColW = (contentWidth - 8) / 3;
      const sigBoxH = 26;

      const drawSigBox = (title, who, when, stampText, boxX) => {
        pdf.setFillColor(...C_CARD_BG);
        pdf.setDrawColor(...C_BORDER);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(boxX, y, sigColW, sigBoxH, 2, 2, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...C_TEXT_MAIN);
        pdf.text(title, boxX + 3.5, y + 4.5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(...C_TEXT_MUTED);
        pdf.text(`By: ${who || '—'}`, boxX + 3.5, y + 9);
        pdf.text(`Date: ${when || '—'}`, boxX + 3.5, y + 13);

        pdf.setDrawColor(...C_BORDER);
        pdf.setLineWidth(0.3);
        pdf.line(boxX + 4, y + 20, boxX + sigColW - 4, y + 20);

        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...C_TEXT_MUTED);
        pdf.text(stampText, boxX + sigColW / 2, y + 23.5, { align: 'center' });
      };

      drawSigBox('1. Godown Packaging', d.verified_by || 'Godown Operator', d.verified_at ? String(d.verified_at).slice(0, 10) : '—', 'Supervisor Signature', margin);
      drawSigBox('2. Commercial Auth', d.approved_by || 'Dispatch Manager', d.approved_at ? String(d.approved_at).slice(0, 10) : '—', 'Manager Signature', margin + sigColW + 4);
      drawSigBox('3. Gate Security & Exit', d.dispatched_by || 'Gate Officer', d.dispatched_at ? String(d.dispatched_at).slice(0, 10) : '—', 'Gate Pass Exit Stamp', margin + (sigColW * 2) + 8);

      y += sigBoxH + 6;

      // 5. Recipient Acknowledgment Strip
      pdf.setFillColor(241, 245, 249);
      pdf.roundedRect(margin, y, contentWidth, 8, 1.8, 1.8, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C_TEXT_MAIN);
      pdf.text('Customer Acknowledgment: Received above goods in sealed corrugated cartons in sound condition.', margin + 4, y + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Receiver Sign: ________________', rightEdge - 4, y + 5, { align: 'right' });
    },

    /**
     * Download Dispatch Slip PDF using Vector jsPDF Engine (Crisp Typography)
     */
    downloadDispatchSlipPDF() {
      const element = document.getElementById('dispatch-slip-paper') || document.getElementById('view-dispatch-content');
      const slipNo = (currentViewDispatch && currentViewDispatch.dispatch_no) || document.getElementById('view-disp-no-val')?.textContent || 'Dispatch_Slip';
      const filename = `${slipNo.replace(/[^a-zA-Z0-9_-]/g, '_')}_Delivery_Challan.pdf`;

      APP.showToast('Generating Dispatch Slip PDF download…', 'info');

      // Strip border/shadow on screen if html2pdf is used as fallback
      if (element) {
        element.style.boxShadow = 'none';
        element.style.border = 'none';
      }

      try {
        const jsPdfLib = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
        if (jsPdfLib) {
          const d = currentViewDispatch || {
            dispatch_no: slipNo,
            dispatch_date: new Date().toISOString().split('T')[0],
            status: 'Dispatched'
          };
          const pdf = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          this.drawA4DispatchSlipPdf(pdf, d, currentViewDispatchItems || [], currentViewDispatchClient || {});
          pdf.save(filename);
          if (element) {
            element.style.boxShadow = '';
            element.style.border = '';
          }
          APP.showToast('Dispatch slip PDF downloaded successfully!', 'success');
          return;
        }
      } catch (err) {
        console.warn('Vector PDF export fallback to html2pdf:', err);
      }

      // Fallback to html2pdf if jsPDF vector fails
      if (element && typeof html2pdf === 'function') {
        const opt = {
          margin: [6, 6, 6, 6],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save().then(() => {
          element.style.boxShadow = '';
          element.style.border = '';
          APP.showToast('Dispatch slip PDF downloaded successfully!', 'success');
        }).catch(err => {
          element.style.boxShadow = '';
          element.style.border = '';
          console.error('PDF generation error:', err);
          APP.showToast('PDF download failed: ' + err.message, 'error');
        });
      } else {
        if (element) {
          element.style.boxShadow = '';
          element.style.border = '';
        }
        window.print();
      }
    },

    /**
     * View Generated Commercial Tax Invoice (Exact Invoice Builder UI)
     */
    async viewGeneratedInvoice(dispatchId) {
      try {
        let details = await window.DISPATCH_SERVICE.getDispatchDetails(window.dbClient, dispatchId);
        if (!details || !details.dispatch) {
          const memDisp = (allDispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === String(dispatchId));
          if (memDisp) {
            details = { dispatch: memDisp, items: memDisp.items || [] };
          }
        }
        if (!details || !details.dispatch) {
          APP.showToast('Dispatch details not found', 'error');
          return;
        }

        const d = details.dispatch;
        let items = details.items || [];
        if (Array.isArray(items) && items.length > 1) {
          const uniqueItems = [];
          items.forEach(it => {
            const exists = uniqueItems.some(u =>
              (u.id && it.id && String(u.id) === String(it.id)) ||
              (u.order_item_id && it.order_item_id && String(u.order_item_id) === String(it.order_item_id)) ||
              (u.product_id && it.product_id && String(u.product_id) === String(it.product_id)) ||
              (u.product_name && it.product_name && String(u.product_name).trim().toLowerCase() === String(it.product_name).trim().toLowerCase())
            );
            if (!exists) uniqueItems.push(it);
          });
          items = uniqueItems;
        }
        const formattedVeh = d.vehicle_no ? formatVehicle(d.vehicle_no) : '';

        // Fetch client details
        let clientData = null;
        let parentOrder = (window.allOrders || []).find(o => String(o.id) === String(d.order_id));
        if (!parentOrder && d.order_id && window.dbClient) {
          try {
            const { data: oRow } = await window.dbClient.from('orders').select('*').eq('id', d.order_id).maybeSingle();
            parentOrder = oRow;
          } catch (_) {}
        }

        const clientId = d.client_id || parentOrder?.client_id;
        if (clientId && window.dbClient) {
          try {
            const { data: cRow } = await window.dbClient.from('clients').select('*').eq('id', clientId).maybeSingle();
            clientData = cRow;
          } catch (_) {}
        }
        if (!clientData && (d.client_name || parentOrder?.client_name) && window.dbClient) {
          try {
            const cNameLookup = (d.client_name || parentOrder?.client_name || '').trim().toLowerCase();
            const { data: allC } = await window.dbClient.from('clients').select('*');
            if (Array.isArray(allC)) {
              clientData = allC.find(c => String(c.name || '').trim().toLowerCase() === cNameLookup)
                || allC.find(c => cNameLookup && cNameLookup.includes(String(c.name || '').trim().toLowerCase()))
                || allC.find(c => cNameLookup && String(c.name || '').trim().toLowerCase().includes(cNameLookup))
                || null;
            }
          } catch (_) {}
        }

        // Fetch invoice details if linked
        let invoiceData = null;
        if (d.invoice_id && window.dbClient) {
          try {
            const { data: invRow } = await window.dbClient.from('invoices').select('*').eq('id', d.invoice_id).maybeSingle();
            invoiceData = invRow;
          } catch (_) {}
        }

        let invNo = d.invoice_no || invoiceData?.invoice_no;
        if (!invNo || /^INV-\d{5,}$/.test(invNo) || /^DSP-\d{5,}$/.test(invNo)) {
          const matchDigits = String(d.order_no || '').match(/\d+/);
          const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
          invNo = `INV-${orderDigits}`;
          d.invoice_no = invNo;
          if (invoiceData) invoiceData.invoice_no = invNo;
        }
        const invDate = invoiceData?.invoice_date ? UTILS.fmtDate(invoiceData.invoice_date) : UTILS.fmtDate(d.dispatch_date || new Date().toISOString().split('T')[0]);

        const safeEscape = (str) => {
          if (typeof escapeHtml === 'function') return escapeHtml(str);
          if (typeof window !== 'undefined' && window.UTILS && typeof window.UTILS.escapeHtml === 'function') return window.UTILS.escapeHtml(str);
          return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        };

        const formatPackSize = (str) => {
          if (!str) return '—';
          return String(str).replace(/\b(ml|ltr|kg|gm)\b/gi, m => m.toUpperCase());
        };

        let rawClientName = d.client_name || clientData?.name || parentOrder?.client_name || 'Customer';
        // Capitalize after open parenthesis, e.g. (siddharth -> (Siddharth
        const clientName = rawClientName.replace(/\(([a-z])/g, (m, l) => '(' + l.toUpperCase());
        const clientPhone = clientData?.contact || clientData?.Contact || clientData?.phone || clientData?.Phone || clientData?.mobile || clientData?.Mobile || d.client_phone || parentOrder?.client_phone || parentOrder?.contact || '';
        const clientGstin = clientData?.gst || clientData?.gstin || clientData?.GST || clientData?.GSTIN || '';

        const formatPhoneDisplay = (p) => {
          if (!p) return '';
          const digits = String(p).replace(/\D/g, '');
          if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
          if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
          return String(p).trim();
        };

        const resolveAddrFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState)
          ? window.resolveClientAddressAndState
          : (typeof resolveClientAddressAndState === 'function' ? resolveClientAddressAndState : null);

        const resolvedClient = resolveAddrFn ? resolveAddrFn({
          address: clientData?.address || d.client_address || parentOrder?.shipping_address || '',
          city: clientData?.city || '',
          state: clientData?.state || '',
          pincode: clientData?.pincode || clientData?.pin || '',
          gstin: clientGstin
        }) : {
          cleanAddress: clientData?.city || clientData?.address || '',
          state: clientData?.state || '',
          pincode: clientData?.pincode || ''
        };

        const clientState = resolvedClient.state;
        const clientPin = resolvedClient.pincode;
        const cleanClientAddr = resolvedClient.cleanAddress;

        // Compute line amounts
        let computedSubtotal = 0;
        const tableRows = items.map((it, idx) => {
          const qty = it.total_units_dispatched || it.quantity || 0;
          const boxes = it.boxes_dispatched || 0;
          const price = parseFloat(it.unit_price) || (parseFloat(it.total_amount) && qty ? (parseFloat(it.total_amount) / qty) : 0);
          const lineTotal = parseFloat(it.total_amount) || (qty * price);
          computedSubtotal += lineTotal;
          const packDisplay = formatPackSize(it.packaging_size || '1 Litre');

          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:6px 10px; font-size:12px; color:#475569; font-weight:600; text-align:center;">${idx + 1}</td>
              <td style="padding:6px 10px; font-size:12px; font-weight:700; color:#020618;">${safeEscape(it.product_name)}</td>
              <td style="padding:6px 10px; text-align:center; font-size:12px; white-space:nowrap !important;"><span style="background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:4px; font-weight:600; white-space:nowrap !important; display:inline-block;">${safeEscape(packDisplay)}</span></td>
              <td style="padding:6px 10px; text-align:center; font-size:12px; font-weight:700; color:#020618; white-space:nowrap !important;">${boxes}</td>
              <td style="padding:6px 10px; text-align:center; font-size:12px; font-weight:800; color:#0C3925; white-space:nowrap !important;">${qty}</td>
              <td style="padding:6px 10px; text-align:right; font-size:12px; color:#020618; white-space:nowrap !important;">${UTILS.fmtCurrency(price)}</td>
              <td style="padding:6px 10px; text-align:right; font-size:12px; font-weight:700; color:#020618; white-space:nowrap !important;">${UTILS.fmtCurrency(lineTotal)}</td>
            </tr>
          `;
        }).join('');

        const subtotal = invoiceData?.subtotal ? parseFloat(invoiceData.subtotal) : computedSubtotal;
        const cgst = subtotal * 0.06;
        const sgst = subtotal * 0.06;
        const totalGst = subtotal * 0.12;
        const grandTotal = invoiceData?.total_amount ? parseFloat(invoiceData.total_amount) : (subtotal + totalGst);

        // ── Persist Full Document & History Cache for Invoice Builder & History Page ──
        const invDateIso = invoiceData?.invoice_date ? String(invoiceData.invoice_date).split('T')[0] : (d.dispatch_date ? String(d.dispatch_date).split('T')[0] : new Date().toISOString().split('T')[0]);
        const clientDue = parseFloat(clientData?.balance || 0);

        const invoiceDoc = {
          Date: invDateIso,
          date: invDateIso,
          DueDate: invDateIso,
          dueDate: invDateIso,
          dispatchNo: d.dispatch_no,
          vehicleNo: formattedVeh,
          meta: {
            uniqueId: invNo,
            invoiceNumber: invNo,
            date: invDateIso,
            dueDate: invDateIso,
            dispatchNo: d.dispatch_no,
            vehicleNo: formattedVeh
          },
          InvoiceNumber: invNo,
          InvoiceType: 'GST',
          business: {
            company: 'Anjani Agri Care',
            address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.',
            phone: '9664675227',
            email: 'anjaniagricare@gmail.com',
            gstin: '24AERFS1718Q1ZB',
            signatory: 'Authorized Signatory'
          },
          bank: { name: '', account: '', ifsc: '', upi: '' },
          customer: {
            name: clientName,
            address: cleanClientAddr,
            city: clientData?.city || '',
            contact: clientPhone,
            phone: clientPhone,
            mobile: clientPhone,
            gst: clientGstin,
            gstin: clientGstin,
            state: clientState,
            pincode: clientPin,
            pin: clientPin,
            stateCode: '24',
            placeOfSupply: clientState,
            dueAmount: clientDue
          },
          settings: {
            intro: 'Thank you for your business. Please find your commercial tax invoice details below.',
            terms: '',
            showQR: false,
            taxType: 'GST12'
          },
          rows: items.map((it, idx) => {
            const qty = it.total_units_dispatched || it.quantity || 0;
            const boxes = it.boxes_dispatched || 0;
            const packaging = formatPackSize(it.packaging_size || '1 Litre');
            const unitsPerBox = it.units_per_box ? parseInt(it.units_per_box, 10) : ((boxes > 0 && qty > 0) ? Math.round(qty / boxes) : 10);
            const price = parseFloat(it.unit_price) || (parseFloat(it.total_amount) && qty ? (parseFloat(it.total_amount) / qty) : 0);
            const lineTotal = parseFloat(it.total_amount) || (qty * price);
            return {
              id: 'r_' + (idx + 1),
              brand: 'Anjani Agri Care',
              name: it.product_name,
              desc: it.product_name,
              packaging: packaging,
              boxes: boxes,
              unitsPerBox: unitsPerBox,
              loose: 0,
              totalUnits: qty,
              qtyUnit: 'Bottles',
              totalVolume: 0,
              volumeUnit: 'Litres',
              priceBasis: 'per_unit',
              discountPct: 0,
              taxableValue: lineTotal,
              qty: qty,
              price: price,
              total: lineTotal,
              hsn: '38089190',
              gstRate: 12
            };
          }),
          calculations: {
            subtotal: subtotal,
            taxType: 'GST12',
            cgstRate: 6,
            sgstRate: 6,
            igstRate: 0,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: 0,
            totalTax: totalGst,
            grandTotal: grandTotal,
            dueAmount: clientDue
          },
          billTo: {
            name: clientName,
            address: cleanClientAddr,
            city: clientData?.city || '',
            contact: clientPhone,
            phone: clientPhone,
            mobile: clientPhone,
            gst: clientGstin,
            gstin: clientGstin,
            state: clientState,
            pincode: clientPin,
            pin: clientPin,
            stateCode: '24',
            placeOfSupply: clientState,
            dueAmount: clientDue
          },
          dispatchNo: d.dispatch_no || '',
          orderNo: d.order_no || parentOrder?.order_no || '',
          is_stock_deducted: false
        };

        currentViewInvoiceDoc = invoiceDoc;
        if (typeof window !== 'undefined') {
          window.currentViewInvoiceDoc = invoiceDoc;
        }
        DISPATCH_UI.currentViewInvoiceDoc = invoiceDoc;

        const activeInvoiceModal = document.getElementById('view-invoice-modal');
        if (activeInvoiceModal) {
          activeInvoiceModal.setAttribute('data-invoice-no', invNo);
          activeInvoiceModal.setAttribute('data-dispatch-id', String(d.id || dispatchId));
        }

        // Cache document and history item in localStorage for instant access
        try {
          localStorage.setItem('inv_doc_' + invNo, JSON.stringify(invoiceDoc));
          if (d.dispatch_no) localStorage.setItem('inv_doc_' + d.dispatch_no, JSON.stringify(invoiceDoc));
          if (d.id) localStorage.setItem('inv_doc_' + d.id, JSON.stringify(invoiceDoc));

          let hist = [];
          try {
            hist = JSON.parse(localStorage.getItem('invoice_history_cache') || '[]');
          } catch(e) { hist = []; }

          const histItem = {
            uniqueId: invNo,
            invoiceNumber: invNo,
            date: invDateIso,
            dueDate: invDateIso,
            customerName: clientName,
            mobile: clientPhone,
            totalAmount: grandTotal,
            totalBoxes: items.reduce((s, it) => s + (parseFloat(it.boxes_dispatched) || 0), 0),
            totalUnits: items.reduce((s, it) => s + (parseFloat(it.total_units_dispatched || it.quantity) || 0), 0),
            is_stock_deducted: false,
            dispatchNo: d.dispatch_no,
            source: 'dispatch'
          };

          const existingIdx = hist.findIndex(h => h.uniqueId === invNo || h.invoiceNumber === invNo);
          if (existingIdx >= 0) {
            hist[existingIdx] = { ...hist[existingIdx], ...histItem };
          } else {
            hist.unshift(histItem);
          }
          localStorage.setItem('invoice_history_cache', JSON.stringify(hist));
        } catch (e) {
          console.warn('Could not cache invoice in localStorage:', e);
        }

        // Update modal title and button link (#edit=...)
        const modalTitle = document.getElementById('view-invoice-title');
        if (modalTitle) modalTitle.textContent = `Commercial Tax Invoice — ${invNo}`;

        const openBuilderBtn = document.getElementById('btn-open-invoice-builder');
        if (openBuilderBtn) {
          openBuilderBtn.href = `../Invoice%20Builder/index.html#edit=${encodeURIComponent(invNo)}`;
          openBuilderBtn.onclick = () => {
            try {
              localStorage.setItem('inv_doc_' + invNo, JSON.stringify(invoiceDoc));
              localStorage.setItem('inv_doc_' + invNo.toUpperCase(), JSON.stringify(invoiceDoc));
              localStorage.setItem('inv_doc_' + invNo.toLowerCase(), JSON.stringify(invoiceDoc));
              const matchDigits = String(invNo).match(/\d+/);
              if (matchDigits) {
                localStorage.setItem('inv_doc_' + matchDigits[0], JSON.stringify(invoiceDoc));
                localStorage.setItem('inv_doc_' + matchDigits[0].padStart(2, '0'), JSON.stringify(invoiceDoc));
              }
              if (d.dispatch_no) localStorage.setItem('inv_doc_' + d.dispatch_no, JSON.stringify(invoiceDoc));
              if (d.id) localStorage.setItem('inv_doc_' + d.id, JSON.stringify(invoiceDoc));
              localStorage.setItem('current_edit_invoice', JSON.stringify(invoiceDoc));
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('current_edit_invoice', JSON.stringify(invoiceDoc));
              }
            } catch (_) {}
          };
        }

        // Render Invoice Builder A4 Paper Layout into modal
        const content = document.getElementById('view-invoice-content');
        content.innerHTML = `
          <div id="view-invoice-paper" style="background:#ffffff; color:#020618; width:100%; max-width:794px; margin:0 auto; padding:24px 30px; font-family:'Inter', -apple-system, BlinkMacSystemFont, sans-serif; box-shadow:0 4px 20px rgba(0,0,0,0.06); border-radius:6px; border:1px solid #e2e8f0; position:relative; box-sizing:border-box;">
            <!-- Header: Logo | Company Center | Invoice Box -->
            <div style="display:grid; grid-template-columns:130px 1fr 160px; align-items:center; gap:12px; margin-bottom:14px; padding-bottom:12px; border-bottom:3px solid #0C3925;">
              <div style="display:flex; align-items:center; justify-content:flex-start;">
                <img src="../assets/images/logo.jpg" alt="Anjani Agri Care" style="height:76px; width:76px; max-width:120px; object-fit:contain; border:none; display:block; background:transparent;" onerror="this.onerror=null; this.src='../apps/Invoice Builder/logo.jpg';" />
              </div>
              <div style="text-align:center; display:flex; flex-direction:column; align-items:center;">
                <div style="font-size:20px; font-weight:800; color:#0C3925 !important; letter-spacing:-0.4px;">Anjani Agri Care</div>
                <div style="font-size:11px; color:#000; margin-top:2px; line-height:1.5;">
                  <span>Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.</span><br />
                  <span>96646 75227</span><span> &nbsp;|&nbsp; </span><span>anjaniagricare@gmail.com</span><br />
                  <span>GSTIN: <strong>24AERFS1718Q1ZB</strong></span>
                </div>
              </div>
              <div style="text-align:right; min-width:150px;">
                <div style="display:inline-block; background:#0C3925; color:#fff; font-size:12px; font-weight:700; letter-spacing:2.5px; padding:4px 14px; border-radius:6px; margin-bottom:6px; text-transform:uppercase;">INVOICE</div>
                <div style="font-size:11.5px; color:#000; line-height:1.6;">
                  Invoice No: <strong id="p-inv-num-view">${safeEscape(invNo)}</strong><br />
                  Date: <strong>${invDate}</strong><br />
                  Due: <strong>${invDate}</strong><br />
                  Dispatch: <strong>${safeEscape(d.dispatch_no)}</strong><br />
                  ${formattedVeh ? `Vehicle: <strong>${safeEscape(formattedVeh)}</strong>` : ''}
                </div>
              </div>
              <!-- GST Document Strip -->
              <div style="display:grid; grid-column:1 / -1; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; margin-top:4px; border-top:1px solid #e2e8f0; padding-top:4px;">
                <span style="font-size:10.5px; font-weight:800; color:#000; justify-self:start;">Debit Memo</span>
                <span style="font-size:10.5px; font-weight:800; color:#000; justify-self:center;">Tax Invoice</span>
                <span style="font-size:10.5px; font-weight:800; color:#000; justify-self:end;">Original</span>
              </div>
            </div>

            <!-- Bill From / Bill To (Calibrated to Image 3) -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:14px; padding:12px 14px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
              <div>
                <div style="font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#0f766e; margin-bottom:4px;">BILL FROM</div>
                <div style="font-size:13.5px; font-weight:700; color:#0f172a;">Anjani Agri Care</div>
                <div style="font-size:11.5px; font-weight:500; color:#1e293b; margin-top:2px; line-height:1.4;">Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.</div>
                <div style="display:grid; grid-template-columns:140px 1fr; gap:2px 16px; font-size:11.5px; line-line:1.4; margin-top:4px;">
                  <div><span style="color:#475569;">State:</span> <strong style="color:#0f172a; font-weight:600;">Gujarat</strong></div>
                  <div><span style="color:#475569;">Pincode:</span> <strong style="color:#0f172a; font-weight:600;">360024</strong></div>
                  <div><span style="color:#475569;">Phone:</span> <strong style="color:#0f172a; font-weight:600;">96646 75227</strong></div>
                  <div><span style="color:#475569;">GSTIN:</span> <strong style="color:#0f172a; font-weight:600;">24AERFS1718Q1ZB</strong></div>
                </div>
              </div>
              <div>
                <div style="font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#0f766e; margin-bottom:4px;">BILL TO</div>
                <div style="font-size:13.5px; font-weight:700; color:#0f172a;">${safeEscape(clientName)}</div>
                ${cleanClientAddr ? `<div style="font-size:11.5px; font-weight:500; color:#1e293b; margin-top:2px; line-height:1.4;">${safeEscape(cleanClientAddr)}</div>` : ''}
                <div style="display:grid; grid-template-columns:140px 1fr; gap:2px 16px; font-size:11.5px; line-height:1.4; margin-top:4px;">
                  <div><span style="color:#475569;">State:</span> <strong style="color:#0f172a; font-weight:600;">${safeEscape(clientState)}</strong></div>
                  <div>${clientPin ? `<span style="color:#475569;">Pincode:</span> <strong style="color:#0f172a; font-weight:600;">${safeEscape(clientPin)}</strong>` : ''}</div>
                  <div>${clientPhone ? `<span style="color:#475569;">Phone:</span> <strong style="color:#0f172a; font-weight:600;">${safeEscape(formatPhoneDisplay(clientPhone))}</strong>` : ''}</div>
                  <div>${clientGstin ? `<span style="color:#475569;">GSTIN:</span> <strong style="color:#0f172a; font-weight:600;">${safeEscape(clientGstin)}</strong>` : ''}</div>
                </div>
              </div>
            </div>

            <!-- Intro Note -->
            <div style="font-size:11px; color:#475569; margin-bottom:12px; line-height:1.4;">
              Dear Sir/Mam, Thank you for your valuable business. We are pleased to invoice the dispatched goods as below:
            </div>

            <!-- Items Table (Matching Invoice Builder: Explicit White Headers on Dark Green, Single-line Pack Size) -->
            <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
              <thead>
                <tr style="background:#0C3925 !important; color:#ffffff !important;">
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:center; color:#ffffff !important; background:#0C3925 !important; border-top-left-radius:6px; border-bottom-left-radius:6px; width:36px; white-space:nowrap;">No.</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:left; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap;">Products</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:center; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap; width:90px;">Pack Size</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:center; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap; width:80px;">Boxes</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:center; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap; width:90px;">Qty (Units)</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:right; color:#ffffff !important; background:#0C3925 !important; white-space:nowrap; width:100px;">Rate (₹)</th>
                  <th style="padding:7px 10px; font-size:11px; font-weight:700; text-transform:uppercase; text-align:right; color:#ffffff !important; background:#0C3925 !important; border-top-right-radius:6px; border-bottom-right-radius:6px; white-space:nowrap; width:110px;">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>

            <!-- Totals Box (Matching Invoice Builder Layout) -->
            <div style="display:flex; justify-content:flex-end; margin-top:12px;">
              <div style="width:280px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:#ffffff;">
                <div style="display:flex; justify-content:space-between; padding:7px 12px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#0f172a;">
                  <span>Subtotal</span><strong style="color:#0f172a;">${UTILS.fmtCurrency(subtotal)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:5px 12px; font-size:11.5px; border-bottom:1px solid #f1f5f9; color:#475569;">
                  <span>CGST (6%)</span><span>${UTILS.fmtCurrency(cgst)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:5px 12px; font-size:11.5px; border-bottom:1px solid #f1f5f9; color:#475569;">
                  <span>SGST (6%)</span><span>${UTILS.fmtCurrency(sgst)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 12px; font-size:12px; border-bottom:1px solid #e2e8f0; background:#f8fafc; color:#0f172a;">
                  <span style="font-weight:600;">Total GST (12%)</span><strong style="color:#0f172a;">${UTILS.fmtCurrency(totalGst)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:10px 12px; background:#0C3925 !important; color:#ffffff !important; font-size:14px; font-weight:800;">
                  <span style="color:#ffffff !important;">GRAND TOTAL</span><span style="color:#ffffff !important;">${UTILS.fmtCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>


                        <!-- Footer: Bank Details (Headings Preserved) + Signature -->
            <div style="display:grid; grid-template-columns:1fr auto; gap:20px; border-top:2px solid #0C3925; padding-top:14px; margin-top:14px; align-items:flex-end;">
              <div>
                <div style="font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#0C3925; margin-bottom:5px;">Payment Details</div>
                <div style="font-size:11.5px; line-height:1.5; color:#1e293b;">
                  <div><strong>Bank:</strong> <span id="modal-bank-name">—</span></div>
                  <div><strong>A/C No.:</strong> <span id="modal-bank-acc">—</span></div>
                  <div><strong>IFSC:</strong> <span id="modal-bank-ifsc">—</span></div>
                  <div><strong>UPI:</strong> <span id="modal-bank-upi">—</span></div>
                </div>
              </div>
              <div style="text-align:center; min-width:160px;">
                <div style="font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; margin-bottom:4px;">Authorized Signature</div>
                <div style="height:32px; display:flex; align-items:center; justify-content:center;">
                  <span style="font-family:'Brush Script MT', 'Segoe Script', cursive, sans-serif; font-size:22px; font-weight:700; color:#0C3925;">Tirth</span>
                </div>
                <div style="font-size:11.5px; font-weight:700; color:#000; border-top:1px solid #000; padding-top:4px;">Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
          </div>
        `;

        if (typeof window.QRCode === 'function') {
          const qrCanvasContainer = document.getElementById('qr-canvas');
          if (qrCanvasContainer) {
            try {
              qrCanvasContainer.innerHTML = '';
              new window.QRCode(qrCanvasContainer, {
                text: `upi://pay?pa=9427213943m@pnb&pn=${encodeURIComponent('Anjani Agri Care')}`,
                width: 90,
                height: 90,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M
              });
            } catch (e) {
              console.warn('Modal QR generation failed:', e);
            }
          }
        }

        APP.openModal('view-invoice-modal');
        DISPATCH_UI.applyDocMobileScaling('view-invoice-paper', 'view-invoice-content');
      } catch (err) {
        console.error('viewGeneratedInvoice error:', err);
        APP.showToast('Failed to view invoice: ' + err.message, 'error');
      }
    },

    /**
     * Standardized Commercial Invoice Filename Helper
     */
    getCommercialInvoiceFilename(invNo) {
      if (typeof window !== 'undefined' && typeof window.getStandardInvoicePdfFilename === 'function') {
        return window.getStandardInvoicePdfFilename(invNo, true);
      }
      if (typeof getStandardInvoicePdfFilename === 'function') {
        return getStandardInvoicePdfFilename(invNo, true);
      }
      let clean = String(invNo || '').trim();
      clean = clean.replace(/^(?:commercial[-_ ]*tax[-_ ]*invoice|commercial[-_ ]*invoice|tax[-_ ]*invoice|invoice|inv)[-_ ]*/i, '').trim();
      clean = clean.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!clean) clean = '01';
      if (/^\d+$/.test(clean)) {
        const val = parseInt(clean, 10);
        clean = val < 10 ? String(val).padStart(2, '0') : String(val);
      }
      return `INV_${clean}.pdf`;
    },

    /**
     * Download Commercial Tax Invoice PDF using jsPDF Vector Engine
     */
    downloadInvoicePDF() {
      const element = document.getElementById('view-invoice-paper');
      let doc = currentViewInvoiceDoc || (typeof window !== 'undefined' ? window.currentViewInvoiceDoc : null);
      const modalEl = document.getElementById('view-invoice-modal');
      const modalInvNo = modalEl?.getAttribute('data-invoice-no') || '';
      const titleEl = document.getElementById('view-invoice-title');
      const titleMatch = (titleEl?.textContent || '').match(/INV-[\w-]+/i);
      const activeInvNo = modalInvNo || (titleMatch ? titleMatch[0] : '');

      if (!doc || (activeInvNo && doc.InvoiceNumber && doc.InvoiceNumber.toUpperCase() !== activeInvNo.toUpperCase())) {
        if (activeInvNo) {
          try {
            const cached = localStorage.getItem('inv_doc_' + activeInvNo)
              || localStorage.getItem('inv_doc_' + activeInvNo.toUpperCase())
              || localStorage.getItem('inv_doc_' + activeInvNo.toLowerCase());
            if (cached) doc = JSON.parse(cached);
          } catch (_) {}
        }
      }

      let invNum = (doc && doc.InvoiceNumber) || activeInvNo || (currentViewDispatch && currentViewDispatch.invoice_no) || document.getElementById('p-inv-num-view')?.textContent || 'INV-01';
      if (!invNum || /^DSP-/i.test(invNum)) {
        invNum = (currentViewDispatch && currentViewDispatch.invoice_no) || activeInvNo || 'INV-01';
      }
      const filename = this.getCommercialInvoiceFilename(invNum);

      APP.showToast('Generating Commercial Invoice PDF download…', 'info');

      // Strip border/shadow on screen if html2pdf is used as fallback
      if (element) {
        element.style.boxShadow = 'none';
        element.style.border = 'none';
      }

      try {
        const jsPdfLib = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (typeof jsPDF !== 'undefined' ? jsPDF : null);
        if (jsPdfLib && typeof window.drawA4InvoicePdf === 'function' && doc) {
          const pdf = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          window.drawA4InvoicePdf(pdf, doc);
          if (typeof window !== 'undefined') {
            window._lastDownloadedInvoicePdf = filename;
            if (typeof window._onPdfSaved === 'function') {
              try { window._onPdfSaved(filename); } catch (_) {}
            }
          }
          const saveBlobFn = (typeof window !== 'undefined' && window.savePdfBlob) ? window.savePdfBlob : (typeof savePdfBlob === 'function' ? savePdfBlob : null);
          if (saveBlobFn) {
            saveBlobFn(pdf, filename);
          } else {
            pdf.save(filename);
          }
          if (element) {
            element.style.boxShadow = '';
            element.style.border = '';
          }
          APP.showToast('Commercial Invoice PDF downloaded successfully!', 'success');
          return;
        }
      } catch (err) {
        console.warn('Vector PDF export fallback to html2pdf:', err);
      }

      // Fallback to html2pdf if jsPDF vector fails
      if (element && typeof html2pdf === 'function') {
        const opt = {
          margin: [6, 6, 6, 6],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(element).save().then(() => {
          if (element) {
            element.style.boxShadow = '';
            element.style.border = '';
          }
          APP.showToast('Commercial Invoice PDF downloaded successfully!', 'success');
        }).catch(err => {
          if (element) {
            element.style.boxShadow = '';
            element.style.border = '';
          }
          console.error('PDF generation error:', err);
          APP.showToast('PDF download failed: ' + err.message, 'error');
        });
      } else {
        if (element) {
          element.style.boxShadow = '';
          element.style.border = '';
        }
        window.print();
      }
    },

    /**
     * Clean Single-Tab Print for Commercial Invoice
     */
    printInvoiceSlip() {
      const paper = document.getElementById('view-invoice-paper') || document.getElementById('view-invoice-content');
      if (!paper) {
        APP.showToast('Invoice document is not ready', 'error');
        return;
      }
      document.body.classList.add('is-printing-invoice');
      window.print();
      const cleanup = () => {
        document.body.classList.remove('is-printing-invoice');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 1500);
    },

    /**
     * Send Commercial Tax Invoice via WhatsApp
     * Uses the unified shareInvoicePdfOnWhatsApp service
     */
    async sendInvoiceWhatsApp() {
      const modalEl = document.getElementById('view-invoice-modal');
      const modalInvNo = modalEl?.getAttribute('data-invoice-no') || '';
      const titleEl = document.getElementById('view-invoice-title');
      const titleMatch = (titleEl?.textContent || '').match(/INV-[\w-]+/i);
      const activeInvNo = modalInvNo || (titleMatch ? titleMatch[0] : '');

      let doc = currentViewInvoiceDoc || (typeof window !== 'undefined' ? window.currentViewInvoiceDoc : null);

      // Verify that doc corresponds to the active modal's invoice number
      if (!doc || (activeInvNo && doc.InvoiceNumber && doc.InvoiceNumber.toUpperCase() !== activeInvNo.toUpperCase())) {
        if (activeInvNo) {
          try {
            const cached = localStorage.getItem('inv_doc_' + activeInvNo)
              || localStorage.getItem('inv_doc_' + activeInvNo.toUpperCase())
              || localStorage.getItem('inv_doc_' + activeInvNo.toLowerCase());
            if (cached) doc = JSON.parse(cached);
          } catch (_) {}
        }
      }

      if (!doc) {
        try {
          const invNum = document.getElementById('p-inv-num-view')?.textContent || 'Invoice';
          const cached = localStorage.getItem('inv_doc_' + invNum);
          if (cached) doc = JSON.parse(cached);
        } catch (_) {}
      }

      if (!doc) {
        if (typeof APP !== 'undefined' && APP.showToast) {
          APP.showToast('Invoice document data is not ready. Please try reopening the invoice.', 'error');
        }
        return;
      }

      const shareFn = (typeof window !== 'undefined' && window.shareInvoicePdfOnWhatsApp)
        ? window.shareInvoicePdfOnWhatsApp
        : (typeof shareInvoicePdfOnWhatsApp === 'function' ? shareInvoicePdfOnWhatsApp : null);

      if (!shareFn) {
        if (typeof APP !== 'undefined' && APP.showToast) {
          APP.showToast('WhatsApp sharing service not initialized', 'error');
        }
        return;
      }

      return await shareFn(doc, {
        isDispatch: true,
        onToast: (msg, type) => {
          if (typeof APP !== 'undefined' && APP.showToast) {
            APP.showToast(msg, type);
          }
        }
      });
    },

    /**
     * Close Fallback Instruction Modal (Safe cleanup)
     */
    closeWhatsAppFallbackModal() {
      const modal = document.getElementById('whatsapp-instructions-modal');
      if (modal) {
        modal.classList.remove('open');
        modal.remove();
      }
      const invModal = document.getElementById('view-invoice-modal');
      if (!invModal || (!invModal.classList.contains('open') && !invModal.classList.contains('active'))) {
        document.body.style.overflow = '';
      }
    },

    /**
     * Proportional Mobile Scaling for Document Modals
     */
    applyDocMobileScaling(paperId, contentId) {
      const doScale = () => {
        const paper = document.getElementById(paperId);
        const container = document.getElementById(contentId);
        if (!paper || !container) return;

        const viewportWidth = window.innerWidth;
        if (viewportWidth > 820) {
          // Desktop: natural responsive layout
          paper.style.transform = '';
          paper.style.transformOrigin = '';
          paper.style.width = '100%';
          paper.style.minWidth = '';
          paper.style.maxWidth = (paperId === 'dispatch-slip-paper') ? '800px' : '794px';
          paper.style.margin = '0 auto';
          const wrapper = paper.parentElement;
          if (wrapper && wrapper.classList.contains('doc-scale-wrapper')) {
            wrapper.style.width = '';
            wrapper.style.height = '';
            wrapper.style.margin = '';
          }
          return;
        }

        // Mobile / Tablet: calculate proportional scale
        const containerWidth = container.clientWidth || (viewportWidth - 24);
        const baseWidth = (paperId === 'dispatch-slip-paper') ? 800 : 794;
        const targetWidth = Math.max(280, containerWidth - 12);
        const scale = Math.min(1, Math.max(0.35, targetWidth / baseWidth));

        paper.style.transformOrigin = 'top left';
        paper.style.transform = `scale(${scale})`;
        paper.style.width = `${baseWidth}px`;
        paper.style.minWidth = `${baseWidth}px`;
        paper.style.maxWidth = `${baseWidth}px`;
        paper.style.margin = '0';

        // Wrap paper in doc-scale-wrapper if not already wrapped
        let wrapper = paper.parentElement;
        if (!wrapper || !wrapper.classList.contains('doc-scale-wrapper')) {
          wrapper = document.createElement('div');
          wrapper.className = 'doc-scale-wrapper';
          paper.parentNode.insertBefore(wrapper, paper);
          wrapper.appendChild(paper);
        }

        wrapper.style.display = 'block';
        wrapper.style.overflow = 'hidden';
        wrapper.style.margin = '0 auto';
        const paperHeight = paper.offsetHeight || 1150;
        const scaledWidth = Math.round(baseWidth * scale);
        const scaledHeight = Math.round(paperHeight * scale) + 16;
        wrapper.style.width = `${scaledWidth}px`;
        wrapper.style.height = `${scaledHeight}px`;
      };

      doScale();
      requestAnimationFrame(doScale);
      setTimeout(doScale, 120);
    }
  };

  // Expose globally for HTML event handlers
  window.DISPATCH_UI = DISPATCH_UI;
  window.allDispatches = allDispatches;
  DISPATCH_UI.getAllDispatches = () => allDispatches;
  DISPATCH_UI.setAllDispatches = (l) => { allDispatches = Array.isArray(l) ? l : []; window.allDispatches = allDispatches; };
  window.drawA4DispatchSlipPdf = (pdf, d, items, clientData) => DISPATCH_UI.drawA4DispatchSlipPdf(pdf, d, items, clientData);
  window.formatVehicle = formatVehicle;
  window.formatVehicleNumber = formatVehicleNumber;
  window.onDeliveryTargetChange = function(val) {
    const whGroup = document.getElementById('disp-target-wh-group');
    if (whGroup) {
      whGroup.style.display = (val === 'GODOWN') ? 'block' : 'none';
    }
  };
  window.openPrepareDispatch = (orderId) => DISPATCH_UI.openPrepareDispatch(orderId);
  window.onDispatchOrderSelected = (orderId) => DISPATCH_UI.onDispatchOrderSelected(orderId);
  window.submitPrepareDispatch = () => DISPATCH_UI.submitPrepareDispatch();
  window.openVerifyDispatch = (id) => DISPATCH_UI.openVerifyDispatch(id);
  window.submitVerifyDispatch = () => DISPATCH_UI.submitVerifyDispatch();
  window.openApproveDispatch = (id) => DISPATCH_UI.openApproveDispatch(id);
  window.submitApproveDispatch = () => DISPATCH_UI.submitApproveDispatch();
  window.openExecuteDispatch = (id) => DISPATCH_UI.openExecuteDispatch(id);
  window.submitExecuteDispatch = () => DISPATCH_UI.submitExecuteDispatch();
  window.openGenerateInvoice = (id) => DISPATCH_UI.openGenerateInvoice(id);
  window.submitGenerateInvoice = () => DISPATCH_UI.submitGenerateInvoice();
  window.openReverseDispatch = (id) => DISPATCH_UI.openReverseDispatch(id);
  window.submitReverseDispatch = () => DISPATCH_UI.submitReverseDispatch();
  window.viewDispatch = (id) => DISPATCH_UI.viewDispatch(id);
  window.printDispatchSlip = () => DISPATCH_UI.printDispatchSlip();
  window.downloadDispatchSlipPDF = () => DISPATCH_UI.downloadDispatchSlipPDF();
  window.viewGeneratedInvoice = (id) => DISPATCH_UI.viewGeneratedInvoice(id);
  window.downloadInvoicePDF = () => DISPATCH_UI.downloadInvoicePDF();
  window.printInvoiceSlip = () => DISPATCH_UI.printInvoiceSlip();
  window.sendInvoiceWhatsApp = () => DISPATCH_UI.sendInvoiceWhatsApp();
  window.closeWhatsAppFallbackModal = () => DISPATCH_UI.closeWhatsAppFallbackModal();
  window.getCommercialInvoiceFilename = (invNo) => DISPATCH_UI.getCommercialInvoiceFilename(invNo);
  window.getCurrentViewInvoiceDoc = () => currentViewInvoiceDoc;
  DISPATCH_UI.getCurrentViewInvoiceDoc = () => currentViewInvoiceDoc;
  window.applyDocMobileScaling = (p, c) => DISPATCH_UI.applyDocMobileScaling(p, c);

  // Resize listener for active document preview modals
  window.addEventListener('resize', () => {
    const invModal = document.getElementById('view-invoice-modal');
    if (invModal && (invModal.classList.contains('open') || invModal.classList.contains('active'))) {
      DISPATCH_UI.applyDocMobileScaling('view-invoice-paper', 'view-invoice-content');
    }
    const dispModal = document.getElementById('view-dispatch-modal');
    if (dispModal && (dispModal.classList.contains('open') || dispModal.classList.contains('active'))) {
      DISPATCH_UI.applyDocMobileScaling('dispatch-slip-paper', 'view-dispatch-content');
    }
  });

  // Wire search and status pills on document ready
  document.addEventListener('DOMContentLoaded', () => {
    // Search input
    document.getElementById('dispatch-search-input')?.addEventListener('input', e => {
      activeDispatchSearch = e.target.value || '';
      DISPATCH_UI.renderDispatchesTable();
    });

    // Status filter pills
    document.querySelectorAll('#dispatch-status-pill-filters .cat-pill').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('#dispatch-status-pill-filters .cat-pill').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeDispatchFilter = e.target.getAttribute('data-status') || '';
        DISPATCH_UI.renderDispatchesTable();
      });
    });
  });

})(typeof window !== 'undefined' ? window : this);
