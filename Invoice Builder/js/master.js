/**
 * ==============================================================================
 * js/master.js — Master Data Management Logic
 * Anjani Agri Care ERP
 * 
 * Manages Clients and Products CRUD operations, tab switching, contextual search,
 * desktop table rendering, and responsive mobile card presentation.
 * ==============================================================================
 */

'use strict';

let currentTab = 'clients';
let productsData = [];
let clientsData = [];

function escapeHTML(value) {
  return String(value || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

function normalizeGSTIN(value) {
  return String(value || '').trim().toUpperCase();
}

if (typeof window.formatText !== 'function') {
  window.formatText = function(str) {
    return String(str || '').trim();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Font loading detection
  if (document.fonts && typeof document.fonts.load === 'function') {
    document.fonts.load('24px "Material Symbols Outlined"').then(function() {
      document.body.classList.add('material-symbols-loaded');
    }).catch(function() {
      document.body.classList.add('material-symbols-loaded');
    });
  } else {
    document.body.classList.add('material-symbols-loaded');
  }

  loadData();
});

function switchTab(tab) {
  currentTab = tab;

  // Segmented tab active states
  document.querySelectorAll('.segment-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Show/hide view containers
  const prodView = document.getElementById('view-products');
  const cliView = document.getElementById('view-clients');
  if (prodView) prodView.style.display = tab === 'products' ? 'block' : 'none';
  if (cliView) cliView.style.display = tab === 'clients' ? 'block' : 'none';

  // Contextual search placeholder
  const searchInput = document.getElementById('master-search');
  if (searchInput) {
    searchInput.placeholder = tab === 'products'
      ? 'Search products by brand, product name, or packaging...'
      : 'Search clients by name, phone, or GSTIN...';
    searchInput.value = '';
  }

  const clearBtn = document.getElementById('master-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';

  filterMasterTable();
}
window.switchTab = switchTab;

function clearMasterSearch() {
  const searchInput = document.getElementById('master-search');
  const clearBtn = document.getElementById('master-search-clear');
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  filterMasterTable();
}
window.clearMasterSearch = clearMasterSearch;

function filterMasterTable() {
  const searchInput = document.getElementById('master-search');
  const clearBtn = document.getElementById('master-search-clear');
  const query = (searchInput?.value || '').trim().toLowerCase();

  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

  const isProd = currentTab === 'products';
  const tbody = document.getElementById(isProd ? 'products-tbody' : 'clients-tbody');
  const mobContainer = document.getElementById(isProd ? 'products-mobile-cards' : 'clients-mobile-cards');

  // Filter desktop table rows
  let visibleDesktopRows = 0;
  if (tbody) {
    const rows = tbody.querySelectorAll('tr:not(.state-row)');
    rows.forEach(row => {
      const text = row.innerText.toLowerCase();
      const match = !query || text.includes(query);
      row.style.display = match ? '' : 'none';
      if (match) visibleDesktopRows++;
    });

    const emptyRow = tbody.querySelector('.empty-search-row');
    if (emptyRow) {
      emptyRow.style.display = (visibleDesktopRows === 0 && query) ? '' : 'none';
    }
  }

  // Filter mobile cards
  let visibleMobCards = 0;
  if (mobContainer) {
    const cards = mobContainer.querySelectorAll('.master-mob-card');
    cards.forEach(card => {
      const text = card.innerText.toLowerCase();
      const match = !query || text.includes(query);
      card.style.display = match ? 'flex' : 'none';
      if (match) visibleMobCards++;
    });

    const emptyMob = mobContainer.querySelector('.empty-search-card');
    if (emptyMob) {
      emptyMob.style.display = (visibleMobCards === 0 && query) ? 'flex' : 'none';
    }
  }
}
window.filterMasterTable = filterMasterTable;

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = isError ? 'error show' : 'show';
  setTimeout(() => { t.className = ''; }, 3000);
}

// ─── API INTERACTIONS ───────────────────────────────────────

async function loadData() {
  const prodTbody = document.getElementById('products-tbody');
  const cliTbody = document.getElementById('clients-tbody');
  const prodMob = document.getElementById('products-mobile-cards');
  const cliMob = document.getElementById('clients-mobile-cards');

  const loadingHTML = `
    <tr class="state-row">
      <td colspan="6">
        <div class="loading-row-content">
          <span class="material-symbols-outlined spinner-icon">autorenew</span>
          <span>Loading data...</span>
        </div>
      </td>
    </tr>
  `;

  if (prodTbody) prodTbody.innerHTML = loadingHTML;
  if (cliTbody) cliTbody.innerHTML = loadingHTML;

  try {
    const apiObj = window.api || (typeof api !== 'undefined' ? api : null);
    if (!apiObj) throw new Error('API layer not loaded');

    // Load both in parallel from database
    const [prods, cli] = await Promise.all([
      apiObj.getProducts(),
      apiObj.getClients()
    ]);

    // Normalize Products Data
    productsData = (prods || []).map(p => {
      const findKey = (obj, k) => Object.keys(obj).find(key => key.trim().toLowerCase().replace(/\s/g, '') === k.toLowerCase());
      const getV = (obj, k) => {
        const matchedKey = findKey(obj, k);
        return matchedKey ? (obj[matchedKey] || '').toString().trim() : '';
      };

      return {
        ProductID: p.ProductID || p.id || getV(p, 'productid') || '',
        BrandName: formatText(getV(p, 'brandname') || getV(p, 'brand') || ''),
        ProductName: formatText(getV(p, 'productname') || getV(p, 'product') || getV(p, 'name') || ''),
        PackagingSize: formatText(getV(p, 'packagingsize') || getV(p, 'packaging') || getV(p, 'size') || ''),
        UnitPrice: parseFloat(getV(p, 'unitprice') || getV(p, 'price') || 0)
      };
    });

    // Normalize Clients Data
    clientsData = (cli || []).map(c => {
      const findKey = (obj, k) => Object.keys(obj).find(key => key.trim().toLowerCase().replace(/\s/g, '') === k.toLowerCase());
      const getV = (obj, k) => {
        const matchedKey = findKey(obj, k);
        return matchedKey ? (obj[matchedKey] || '').toString().trim() : '';
      };

      return {
        ClientID: c.ClientID || c.id || getV(c, 'clientid') || '',
        ClientName: formatText(getV(c, 'clientname') || getV(c, 'name') || ''),
        Address: formatText(getV(c, 'address') || ''),
        Phone: getV(c, 'phone') || getV(c, 'mobile') || '',
        GSTIN: normalizeGSTIN(getV(c, 'gstin') || ''),
        DueAmount: parseFloat(getV(c, 'dueamount') || getV(c, 'due') || 0)
      };
    });

    productsData = productsData.slice().reverse();
    clientsData = clientsData.slice().reverse();

    // Update tab counters
    const cliBadge = document.getElementById('badge-clients-count');
    const prodBadge = document.getElementById('badge-products-count');
    if (cliBadge) cliBadge.textContent = clientsData.length;
    if (prodBadge) prodBadge.textContent = productsData.length;

    renderTables();
  } catch (err) {
    console.error('Error loading master data:', err);
    showToast('Failed to load data: ' + (err.message || err), true);
    const errHTML = `
      <tr class="state-row">
        <td colspan="6" style="text-align:center;padding:40px;color:#DC2626;font-weight:600;">
          Failed to load records. Please check your backend connection.
        </td>
      </tr>
    `;
    if (prodTbody) prodTbody.innerHTML = errHTML;
    if (cliTbody) cliTbody.innerHTML = errHTML;
  }
}

function renderTables() {
  const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Render Products ──
  const ptbody = document.getElementById('products-tbody');
  const pmob = document.getElementById('products-mobile-cards');

  if (productsData.length === 0) {
    if (ptbody) {
      ptbody.innerHTML = `
        <tr class="state-row">
          <td colspan="6" style="text-align:center;padding:50px 20px;color:#64748B;">
            <span class="material-symbols-outlined" style="font-size:42px;color:#94A3B8;display:block;margin-bottom:8px;">inventory_2</span>
            <strong>No Products Found</strong>
            <div style="font-size:13px;margin-top:4px;">Click "Create New Entry" to add your first product.</div>
          </td>
        </tr>
      `;
    }
    if (pmob) {
      pmob.innerHTML = `
        <div class="master-mob-card" style="text-align:center;padding:40px 16px;color:#64748B;align-items:center;">
          <span class="material-symbols-outlined" style="font-size:42px;color:#94A3B8;">inventory_2</span>
          <div style="font-weight:700;color:#1E293B;margin-top:6px;">No Products Found</div>
          <div style="font-size:13px;">Click "Create New Entry" to add your first product.</div>
        </div>
      `;
    }
  } else {
    // Desktop products table
    if (ptbody) {
      let pHtml = productsData.map((p, index) => {
        const priceStr = '₹' + INR.format(p.UnitPrice || 0);
        return `
          <tr>
            <td style="color:#64748B;font-weight:600;font-size:12px;font-family:monospace;">${index + 1}</td>
            <td>
              <span class="brand-badge">${escapeHTML(p.BrandName || '—')}</span>
            </td>
            <td>
              <span style="font-weight:700;color:#0F172A;font-size:13.5px;">${escapeHTML(p.ProductName || '')}</span>
            </td>
            <td>
              <span class="pack-badge">${escapeHTML(p.PackagingSize || '—')}</span>
            </td>
            <td style="text-align:right;">
              <span class="price-text-bold">${priceStr}</span>
            </td>
            <td style="text-align:right;">
              <div class="actions-group">
                <button type="button" class="action-btn" title="Edit Product" onclick="editRecord('product', '${escapeHTML(p.ProductID)}')">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="action-btn delete" title="Delete Product" onclick="deleteRecord('product', '${escapeHTML(p.ProductID)}')">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      pHtml += `
        <tr class="state-row empty-search-row" style="display:none;">
          <td colspan="6" style="text-align:center;padding:40px;color:#64748B;">
            <div style="font-weight:700;color:#1E293B;">No matching products found</div>
            <div style="font-size:13px;margin-top:4px;">Try a different keyword or clear search.</div>
          </td>
        </tr>
      `;
      ptbody.innerHTML = pHtml;
    }

    // Mobile products cards
    if (pmob) {
      let pCardsHtml = productsData.map(p => {
        const priceStr = '₹' + INR.format(p.UnitPrice || 0);
        return `
          <div class="master-mob-card">
            <div class="mob-card-head">
              <span class="brand-badge">${escapeHTML(p.BrandName || '—')}</span>
              <span class="price-text-bold" style="font-size:16px;">${priceStr}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-weight:700;color:#0F172A;font-size:15px;line-height:1.35;">${escapeHTML(p.ProductName || '')}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span class="pack-badge">${escapeHTML(p.PackagingSize || '—')}</span>
              </div>
            </div>
            <div class="mob-card-foot">
              <button type="button" class="mob-action-edit" onclick="editRecord('product', '${escapeHTML(p.ProductID)}')">
                <span class="material-symbols-outlined">edit</span>
                <span>Edit Product</span>
              </button>
              <button type="button" class="mob-action-del" title="Delete" onclick="deleteRecord('product', '${escapeHTML(p.ProductID)}')">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      pCardsHtml += `
        <div class="master-mob-card empty-search-card" style="display:none;text-align:center;padding:30px 16px;color:#64748B;align-items:center;">
          <div style="font-weight:700;color:#1E293B;">No matching products found</div>
          <div style="font-size:13px;margin-top:4px;">Try a different keyword or clear search.</div>
        </div>
      `;
      pmob.innerHTML = pCardsHtml;
    }
  }

  // ── Render Clients ──
  const ctbody = document.getElementById('clients-tbody');
  const cmob = document.getElementById('clients-mobile-cards');

  if (clientsData.length === 0) {
    if (ctbody) {
      ctbody.innerHTML = `
        <tr class="state-row">
          <td colspan="6" style="text-align:center;padding:50px 20px;color:#64748B;">
            <span class="material-symbols-outlined" style="font-size:42px;color:#94A3B8;display:block;margin-bottom:8px;">groups</span>
            <strong>No Clients Found</strong>
            <div style="font-size:13px;margin-top:4px;">Click "Create New Entry" to add your first client.</div>
          </td>
        </tr>
      `;
    }
    if (cmob) {
      cmob.innerHTML = `
        <div class="master-mob-card" style="text-align:center;padding:40px 16px;color:#64748B;align-items:center;">
          <span class="material-symbols-outlined" style="font-size:42px;color:#94A3B8;">groups</span>
          <div style="font-weight:700;color:#1E293B;margin-top:6px;">No Clients Found</div>
          <div style="font-size:13px;">Click "Create New Entry" to add your first client.</div>
        </div>
      `;
    }
  } else {
    // Desktop clients table
    if (ctbody) {
      let cHtml = clientsData.map((c, index) => {
        const due = parseFloat(c.DueAmount || c.dueAmount || 0);
        const dueDisplay = due > 0
          ? `<span class="due-alert">₹${INR.format(due)}</span>`
          : `<span style="color:#64748B;font-weight:500;">₹0.00</span>`;
        
        return `
          <tr>
            <td style="color:#64748B;font-weight:600;font-size:12px;font-family:monospace;">${index + 1}</td>
            <td>
              <div style="display:flex;flex-direction:column;gap:2px;max-width:320px;">
                <span style="font-weight:700;color:#0F172A;font-size:13.5px;line-height:1.35;">${escapeHTML(c.ClientName || '')}</span>
                ${c.Address ? `<span style="font-size:12px;color:#64748B;">${escapeHTML(c.Address)}</span>` : ''}
              </div>
            </td>
            <td>
              ${c.Phone ? `<span class="phone-cell"><span class="material-symbols-outlined">call</span>${escapeHTML(c.Phone)}</span>` : '<span style="color:#94A3B8;">—</span>'}
            </td>
            <td>
              ${c.GSTIN ? `<span class="gstin-badge">${escapeHTML(normalizeGSTIN(c.GSTIN))}</span>` : '<span style="color:#94A3B8;">—</span>'}
            </td>
            <td style="text-align:right;">
              ${dueDisplay}
            </td>
            <td style="text-align:right;">
              <div class="actions-group">
                <button type="button" class="action-btn" title="Edit Client" onclick="editRecord('client', '${escapeHTML(c.ClientID)}')">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="action-btn delete" title="Delete Client" onclick="deleteRecord('client', '${escapeHTML(c.ClientID)}')">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      cHtml += `
        <tr class="state-row empty-search-row" style="display:none;">
          <td colspan="6" style="text-align:center;padding:40px;color:#64748B;">
            <div style="font-weight:700;color:#1E293B;">No matching clients found</div>
            <div style="font-size:13px;margin-top:4px;">Try a different keyword or clear search.</div>
          </td>
        </tr>
      `;
      ctbody.innerHTML = cHtml;
    }

    // Mobile clients cards
    if (cmob) {
      let cCardsHtml = clientsData.map(c => {
        const due = parseFloat(c.DueAmount || c.dueAmount || 0);
        const dueDisplay = due > 0
          ? `<span class="due-alert">Due: ₹${INR.format(due)}</span>`
          : `<span style="color:#64748B;font-size:12.5px;font-weight:500;">No Due</span>`;

        return `
          <div class="master-mob-card">
            <div class="mob-card-head">
              <span style="font-weight:800;color:#0F172A;font-size:15px;line-height:1.35;">${escapeHTML(c.ClientName || '')}</span>
              ${dueDisplay}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${c.Address ? `<div style="font-size:12.5px;color:#64748B;">${escapeHTML(c.Address)}</div>` : ''}
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:12.5px;color:#475569;">
                ${c.Phone ? `<span class="phone-cell"><span class="material-symbols-outlined">call</span>${escapeHTML(c.Phone)}</span>` : ''}
                ${c.GSTIN ? `<span class="gstin-badge">${escapeHTML(normalizeGSTIN(c.GSTIN))}</span>` : ''}
              </div>
            </div>
            <div class="mob-card-foot">
              <button type="button" class="mob-action-edit" onclick="editRecord('client', '${escapeHTML(c.ClientID)}')">
                <span class="material-symbols-outlined">edit</span>
                <span>Edit Client</span>
              </button>
              <button type="button" class="mob-action-del" title="Delete" onclick="deleteRecord('client', '${escapeHTML(c.ClientID)}')">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      cCardsHtml += `
        <div class="master-mob-card empty-search-card" style="display:none;text-align:center;padding:30px 16px;color:#64748B;align-items:center;">
          <div style="font-weight:700;color:#1E293B;">No matching clients found</div>
          <div style="font-size:13px;margin-top:4px;">Try a different keyword or clear search.</div>
        </div>
      `;
      cmob.innerHTML = cCardsHtml;
    }
  }
}

// ─── MODAL MANAGEMENT ───────────────────────────────────────

function addPackRowHTML() {
  const container = document.getElementById('packaging-container');
  if (!container) return;
  const HTML = `
    <div class="pack-row" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--bg-banner,#F8FAFC);border-radius:10px;border:1px solid var(--border,#E2E8F0);">
      <div><input class="sb-input pack-size" placeholder="Size (e.g. 1 Ltr, 500 ML)" style="width:100%;" required /></div>
      <div style="display:flex;gap:8px;">
        <input type="number" step="0.01" class="sb-input pack-price" placeholder="Price (₹)" style="width:100%;flex:1;" required />
        <button type="button" class="btn btn-danger remove-pack-btn" onclick="this.parentElement.parentElement.remove()" style="padding:0 12px;">✕</button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', HTML);
  
  // Make first delete button visible if more than 1 row
  const rows = container.querySelectorAll('.pack-row');
  if (rows.length > 1) {
    const firstDel = rows[0].querySelector('.remove-pack-btn');
    if (firstDel) firstDel.style.display = 'block';
  }
}
window.addPackRowHTML = addPackRowHTML;

function openModal(type = currentTab, id = null) {
  const modal = document.getElementById('data-modal');
  const title = document.getElementById('modal-title');
  document.getElementById('entry-id').value = id || '';

  const isProd = type === 'products' || type === 'product';
  document.getElementById('prod-fields').style.display = isProd ? 'block' : 'none';
  document.getElementById('client-fields').style.display = !isProd ? 'block' : 'none';

  title.textContent = id ? `Edit ${isProd ? 'Product' : 'Client'}` : `Add New ${isProd ? 'Product' : 'Client'}`;

  // Clear generic fields
  document.getElementById('prod-brand').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('client-name').value = '';
  document.getElementById('client-addr').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-gstin').value = normalizeGSTIN('');
  const clientDueEl = document.getElementById('client-due');
  if (clientDueEl) clientDueEl.value = '';

  const packContainer = document.getElementById('packaging-container');
  if (packContainer) {
    packContainer.innerHTML = `
      <div class="pack-row" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--bg-banner,#F8FAFC);border-radius:10px;border:1px solid var(--border,#E2E8F0);">
        <div><input class="sb-input pack-size" placeholder="Size (e.g. 1 Ltr, 500 ML)" style="width:100%;" required /></div>
        <div style="display:flex;gap:8px;">
          <input type="number" step="0.01" class="sb-input pack-price" placeholder="Price (₹)" style="width:100%;flex:1;" required />
          <button type="button" class="btn btn-danger remove-pack-btn" onclick="this.parentElement.parentElement.remove()" style="padding:0 12px;display:none;">✕</button>
        </div>
      </div>
    `;
  }

  const addAnotherBtn = document.getElementById('save-another-btn');
  
  if (id) {
    if (addAnotherBtn) addAnotherBtn.style.display = 'none';
    if (isProd) {
      const p = productsData.find(x => String(x.ProductID) === String(id));
      if (p) {
        document.getElementById('prod-brand').value = p.BrandName || '';
        document.getElementById('prod-name').value = p.ProductName || '';
        if (packContainer) {
          const sizeEl = packContainer.querySelector('.pack-size');
          const priceEl = packContainer.querySelector('.pack-price');
          if (sizeEl) sizeEl.value = p.PackagingSize || '';
          if (priceEl) priceEl.value = p.UnitPrice || '';
        }
      }
    } else {
      const c = clientsData.find(x => String(x.ClientID) === String(id));
      if (c) {
        document.getElementById('client-name').value = c.ClientName || '';
        document.getElementById('client-addr').value = c.Address || '';
        document.getElementById('client-phone').value = c.Phone || '';
        document.getElementById('client-gstin').value = normalizeGSTIN(c.GSTIN || '');
        if (clientDueEl) clientDueEl.value = c.DueAmount || c.dueAmount || 0;
      }
    }
  } else {
    // Show only for new Products
    if (addAnotherBtn) addAnotherBtn.style.display = isProd ? 'inline-block' : 'none';
  }

  modal.style.display = 'flex';
}
window.openModal = openModal;

function closeModal() {
  const modal = document.getElementById('data-modal');
  if (modal) modal.style.display = 'none';
}
window.closeModal = closeModal;

async function saveRecord(e, keepOpen = false) {
  if (e && e.preventDefault) e.preventDefault();
  
  const idInput = document.getElementById('entry-id');
  const id = idInput.value;
  const isEditing = Boolean(id);
  const saveBtn = document.getElementById('save-btn');
  const addAnotherBtn = document.getElementById('save-another-btn');

  saveBtn.textContent = 'Saving...';
  saveBtn.disabled = true;
  if (addAnotherBtn) addAnotherBtn.disabled = true;

  // Validate ONLY visible fields in active tab
  const activeFieldsId = currentTab === 'products' ? 'prod-fields' : 'client-fields';
  const activeFields = document.getElementById(activeFieldsId);
  if (activeFields) {
    const requiredInputs = activeFields.querySelectorAll('input[required]');
    for (const inp of requiredInputs) {
      if (!inp.value.trim()) {
        inp.focus();
        inp.setCustomValidity('This field is required');
        inp.reportValidity();
        inp.setCustomValidity('');
        saveBtn.textContent = 'Save changes';
        saveBtn.disabled = false;
        if (addAnotherBtn) addAnotherBtn.disabled = false;
        return;
      }
    }
  }

  // Sequential ID generator
  const getNextMasterId = (t, offset = 0) => {
    const prefix = t === 'products' ? 'P-' : 'C-';
    const data = t === 'products' ? productsData : clientsData;
    const idField = t === 'products' ? 'ProductID' : 'ClientID';
    let max = 0;
    data.forEach(item => {
      const idStr = String(item[idField] || '').toUpperCase();
      if (idStr.startsWith(prefix)) {
        const numPart = idStr.replace(prefix, '');
        const num = parseInt(numPart, 10);
        if (!isNaN(num) && num < 1000000000) {
          if (num > max) max = num;
        }
      }
    });
    return prefix + String(max + 1 + offset).padStart(3, '0');
  };

  if (currentTab === 'products') {
    const brand = formatText(document.getElementById('prod-brand').value.trim());
    const name = formatText(document.getElementById('prod-name').value.trim());
    
    const rows = document.querySelectorAll('.pack-row');
    const dataPayload = [];

    rows.forEach((row, i) => {
      const size = formatText(row.querySelector('.pack-size').value.trim());
      const price = row.querySelector('.pack-price').value.trim();
      if (!size || !price) return;
      
      const item = {
        ProductID: isEditing ? id : getNextMasterId('products', i),
        id: isEditing ? id : getNextMasterId('products', i),
        BrandName: brand,
        'Brand Name': brand,
        brand: brand,
        ProductName: name,
        'Product Name': name,
        product: name,
        name: name,
        PackagingSize: size,
        'Packaging Size': size,
        packaging: size,
        size: size,
        UnitPrice: price,
        'Unit Price': price,
        price: price
      };
      
      dataPayload.push(item);
    });
    
    if (dataPayload.length === 0) {
      saveBtn.textContent = 'Save changes';
      saveBtn.disabled = false;
      return;
    }

    try {
      const apiObj = window.api || (typeof api !== 'undefined' ? api : null);
      if (!apiObj) throw new Error('API layer not loaded');

      if (isEditing) {
        const success = await apiObj.updateProduct(dataPayload[0]);
        if (!success) throw new Error('Update failed');
      } else {
        for (const item of dataPayload) {
          const res = await apiObj.addProduct(item);
          if (res && res.error) throw new Error(res.error);
        }
      }
      
      showToast('Product(s) saved successfully');
      loadData();
      
      if (keepOpen) {
        const packContainer = document.getElementById('packaging-container');
        if (packContainer) {
          packContainer.innerHTML = `
            <div class="pack-row" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--bg-banner,#F8FAFC);border-radius:10px;border:1px solid var(--border,#E2E8F0);">
              <div><input class="sb-input pack-size" placeholder="Size (e.g. 1 Ltr, 500 ML)" style="width:100%;" required /></div>
              <div style="display:flex;gap:8px;">
                <input type="number" step="0.01" class="sb-input pack-price" placeholder="Price (₹)" style="width:100%;flex:1;" required />
                <button type="button" class="btn btn-danger remove-pack-btn" onclick="this.parentElement.parentElement.remove()" style="padding:0 12px;display:none;">✕</button>
              </div>
            </div>
          `;
          packContainer.querySelector('.pack-size').focus();
        }
        idInput.value = '';
      } else {
        closeModal();
      }
    } catch (err) {
      console.error('Product save error:', err);
      showToast('Error saving products: ' + (err.message || err), true);
    }
  } else {
    const data = {
      ClientID: id || getNextMasterId('clients'),
      ClientName: formatText(document.getElementById('client-name').value.trim()),
      Address: formatText(document.getElementById('client-addr').value.trim()),
      Phone: document.getElementById('client-phone').value.trim(),
      GSTIN: normalizeGSTIN(document.getElementById('client-gstin').value),
      DueAmount: parseFloat(document.getElementById('client-due')?.value || 0) || 0
    };

    try {
      const apiObj = window.api || (typeof api !== 'undefined' ? api : null);
      if (!apiObj) throw new Error('API layer not loaded');

      const res = isEditing ? await apiObj.updateClient(data) : await apiObj.addClient(data);
      if (res && res.error) throw new Error(res.error);
      
      showToast('Client saved successfully');
      loadData();
      closeModal();
    } catch (err) {
      console.error('Client save error:', err);
      showToast('Error saving client: ' + (err.message || err), true);
    }
  }

  saveBtn.textContent = 'Save changes';
  saveBtn.disabled = false;
  if (addAnotherBtn) addAnotherBtn.disabled = false;
}
window.saveRecord = saveRecord;

function editRecord(type, id) {
  openModal(type + 's', id);
}
window.editRecord = editRecord;

async function deleteRecord(type, id) {
  if (!confirm(`Are you sure you want to delete this ${type}? This action cannot be undone.`)) return;

  try {
    const apiObj = window.api || (typeof api !== 'undefined' ? api : null);
    if (!apiObj) throw new Error('API layer not loaded');

    if (type === 'product') {
      await apiObj.deleteProduct(id);
      showToast('Product deleted successfully');
      loadData();
    } else {
      await apiObj.deleteClient(id);
      showToast('Client deleted successfully');
      loadData();
    }
  } catch (err) {
    console.error(`Error deleting ${type}:`, err);
    showToast(`Error deleting ${type}: ` + (err.message || err), true);
  }
}
window.deleteRecord = deleteRecord;
