/**
 * assets/js/companies.js
 * Multi-Company & Branch Management Module
 */

let allCompanies = [];
let allBranches = [];
let allWarehouses = [];
let editingCompanyId = null;
let currentCompanyForBranches = null;
let editingBranchId = null;

async function loadCompanies() {
  console.log('Loading companies...');
  try {
    UTILS.renderTableSkeleton('companies-table');
    await DB.initDB();
    await window.TENANT_CONTEXT.init();

    // Parallel fetch of companies, branches, and warehouses
    const [cRes, bRes, wRes] = await Promise.all([
      window.dbClient.from('companies').select('*').order('id', { ascending: true }),
      window.dbClient.from('branches').select('*').order('id', { ascending: true }),
      window.dbClient.from('warehouses').select('*').order('id', { ascending: true })
    ]);

    allCompanies = cRes.data || [];
    allBranches = bRes.data || [];
    allWarehouses = wRes.data || [];

    // Compute metrics safely
    const mfgCount = allCompanies.filter(c => c.is_manufacturing).length;
    const tradingCount = allCompanies.length - mfgCount;
    const statTotal = document.getElementById('stat-total-companies');
    if (statTotal) statTotal.textContent = allCompanies.length;
    const statMfg = document.getElementById('stat-mfg-companies');
    if (statMfg) statMfg.textContent = mfgCount;
    const statTrading = document.getElementById('stat-trading-companies');
    if (statTrading) statTrading.textContent = tradingCount;
    const statBranches = document.getElementById('stat-total-branches');
    if (statBranches) statBranches.textContent = allBranches.length;

    renderCompaniesTable(allCompanies);

    // Search filter listener
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.oninput = filterAndRenderCompanies;
    }
  } catch (err) {
    console.error('loadCompanies failed:', err);
    APP.showToast('Failed to load companies: ' + err.message, 'error');
    const tbody = document.querySelector('#companies-table tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="8">
            <div class="empty-state" style="padding:32px 16px;text-align:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;margin:0 auto 10px;color:var(--danger,#ef4444);display:block;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <h3 style="font-size:15px;margin-bottom:6px;color:var(--text-primary);">Failed to Load Companies</h3>
              <p class="text-sm text-muted" style="margin-bottom:14px;max-width:400px;margin-left:auto;margin-right:auto;">${escapeHtml(err.message || 'Database connection error')}</p>
              <button class="btn btn-secondary btn-sm" onclick="loadCompanies()">
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

function renderCompaniesTable(data) {
  const tbody = document.querySelector('#companies-table tbody');
  if (!tbody) return;

  const totalInfo = document.getElementById('total-info');
  if (totalInfo) totalInfo.textContent = `${data.length} compan${data.length !== 1 ? 'ies' : 'y'}`;

  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8"><div class="empty-state"><h3>No companies found</h3></div></td></tr>`;
    return;
  }

  const activeId = window.TENANT_CONTEXT.getCompanyId();

  tbody.innerHTML = data.map(c => {
    const branchCount = allBranches.filter(b => b.company_id === c.id).length;
    const whCount = allWarehouses.filter(w => w.company_id === c.id).length;
    const isActive = c.id === activeId;
    const isArchived = (c.status || 'Active') === 'Archived';

    const statusBadge = isArchived
      ? '<span class="badge badge-warning" style="font-size:10px;padding:2px 6px;">Archived</span>'
      : '<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">Active</span>';

    return `
      <tr class="${isActive ? 'row-active-entity' : ''} ${isArchived ? 'row-archived' : ''}" style="${isArchived ? 'opacity:0.85;' : ''}">
        <td class="cell-bold cell-mono">
          <div class="comp-code-stack">
            <span class="font-bold">${escapeHtml(c.code)}</span>
          </div>
        </td>
        <td class="cell-company-name">
          ${escapeHtml(c.name)}
          ${isArchived ? '<span class="text-xs text-muted" style="display:block;font-size:11px;font-weight:normal;">(Archived Entity)</span>' : ''}
        </td>
        <td>
          <span class="company-badge-pill ${c.is_manufacturing ? 'mfg' : 'dist'}">
            ${c.is_manufacturing ? 'Manufacturer' : 'Trading / Retail'}
          </span>
        </td>
        <td class="cell-mono-gstin">${escapeHtml(c.gstin || '—')}</td>
        <td>
          <div class="location-stack">
            <span class="location-city">${escapeHtml(c.city || '—')}</span>${c.city && c.state ? '<span class="location-comma">, </span>' : ''}${c.state ? `<span class="location-state">${escapeHtml(c.state)}</span>` : ''}
          </div>
        </td>
        <td>
          <div class="facility-badges-stack">
            <button type="button" class="facility-pill-btn" onclick="openManageBranches(${c.id})" title="Manage Branches (${branchCount})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="facility-icon" style="width:13px;height:13px;min-width:13px;min-height:13px;"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="22.01"/><line x1="15" y1="22" x2="15" y2="22.01"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="18" x2="9" y2="18.01"/><line x1="15" y1="18" x2="15" y2="18.01"/></svg>
              <span>${branchCount} ${branchCount === 1 ? 'Branch' : 'Branches'}</span>
            </button>
            <a href="warehouses.html?company=${c.id}" class="facility-pill-btn" title="View Warehouses for ${escapeHtml(c.name)} (${whCount})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="facility-icon" style="width:13px;height:13px;min-width:13px;min-height:13px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <span>${whCount} ${whCount === 1 ? 'Warehouse' : 'Warehouses'}</span>
            </a>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="row-actions">
            ${!isActive && !isArchived ? `
              <button class="action-btn action-btn-select" onclick="window.TENANT_CONTEXT.switchCompany(${c.id})" title="Switch active company to ${escapeHtml(c.name)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px;"><polyline points="9 18 15 12 9 6"/></svg>
                <span>Select</span>
              </button>
            ` : ''}
            <button class="action-btn edit" onclick="openEditCompany(${c.id})" title="Edit Details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${c.id !== 1 ? (isArchived ? `
              <button class="action-btn reactivate" onclick="reactivateCompany(${c.id})" title="Reactivate Company" style="color:var(--success,#10b981);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            ` : `
              <button class="action-btn archive" onclick="archiveCompany(${c.id})" title="Archive Company (Preserve History)" style="color:#d97706;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10"/><path d="M10 12h4"/></svg>
              </button>
            `) : ''}
            <button class="action-btn delete" onclick="safeDeleteCompany(${c.id})" title="Delete Company" style="color:var(--danger,#ef4444);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  UTILS.applyMobileTableLabels('companies-table');
}

function filterAndRenderCompanies() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('company-status-filter')?.value || 'ALL';

  let filtered = allCompanies;

  if (statusFilter === 'ACTIVE') {
    filtered = filtered.filter(c => (c.status || 'Active') === 'Active');
  } else if (statusFilter === 'ARCHIVED') {
    filtered = filtered.filter(c => c.status === 'Archived');
  }

  if (q) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q)
    );
  }
  renderCompaniesTable(filtered);
}

function openAddCompany() {
  editingCompanyId = null;
  document.getElementById('company-modal-title').textContent = 'New Company';
  const form = document.getElementById('company-form');
  if (form) form.reset();
  APP.openModal('company-modal');
}

function openEditCompany(id) {
  editingCompanyId = id;
  const comp = allCompanies.find(c => c.id === id);
  if (!comp) return;

  document.getElementById('company-modal-title').textContent = `Edit Company (${comp.code})`;
  const form = document.getElementById('company-form');
  if (form) {
    form.reset();
    form.elements['name'].value = comp.name || '';
    form.elements['code'].value = comp.code || '';
    form.elements['is_manufacturing'].value = comp.is_manufacturing ? 'true' : 'false';
    form.elements['gstin'].value = comp.gstin || '';
    form.elements['pan'].value = comp.pan || '';
    form.elements['email'].value = comp.email || '';
    form.elements['phone'].value = comp.phone || '';
    form.elements['city'].value = comp.city || '';
    form.elements['state'].value = comp.state || '';
    form.elements['address'].value = comp.address || '';
  }
  APP.openModal('company-modal');
}

async function saveCompany() {
  const form = document.getElementById('company-form');
  if (!form) return;

  const name = form.elements['name'].value.trim();
  const code = form.elements['code'].value.trim().toUpperCase();
  const isMfg = form.elements['is_manufacturing'].value === 'true';

  if (!name) {
    APP.showToast('Please enter company name', 'error');
    return;
  }
  if (!code) {
    APP.showToast('Please enter company code', 'error');
    return;
  }

  // Pre-validate company code uniqueness
  const dup = allCompanies.find(c => c.code.toUpperCase() === code && c.id !== editingCompanyId);
  if (dup) {
    APP.showToast(`Company code "${code}" is already in use by "${dup.name}". Please choose a distinct code.`, 'error');
    return;
  }

  // Pre-validate GSTIN if entered
  const gstinVal = form.elements['gstin'].value.trim().toUpperCase() || null;
  if (gstinVal && gstinVal.length !== 15) {
    APP.showToast('GSTIN should typically be 15 alphanumeric characters (e.g., 24AAACA1234A1Z5).', 'warning');
  }

  const payload = {
    tenant_id: 1,
    name: name,
    code: code,
    is_manufacturing: isMfg,
    gstin: gstinVal,
    pan: form.elements['pan'].value.trim().toUpperCase() || null,
    email: form.elements['email'].value.trim() || null,
    phone: form.elements['phone'].value.trim() || null,
    city: form.elements['city'].value.trim() || null,
    state: form.elements['state'].value.trim() || null,
    address: form.elements['address'].value.trim() || null,
    status: 'Active'
  };

  const btn = document.getElementById('save-company-btn');
  if (btn) APP.setButtonLoading(btn, true);

  try {
    if (editingCompanyId) {
      const { error } = await window.dbClient.from('companies').update(payload).eq('id', editingCompanyId);
      if (error) throw error;

      if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logCompanyUpdated) {
        await window.AUDIT_LOGGER.logCompanyUpdated({
          companyId: editingCompanyId,
          companyName: name,
          companyCode: code
        });
      }
      APP.showToast('Company updated successfully', 'success');
    } else {
      const { data: newComp, error } = await window.dbClient.from('companies').insert([payload]).select();
      if (error) throw error;
      
      // Auto-create default branch & warehouse for new company
      if (newComp && newComp[0]) {
        const cId = newComp[0].id;
        const { data: newBr } = await window.dbClient.from('branches').insert([{
          company_id: cId,
          name: `${name} Head Office`,
          code: `${code}-HQ`,
          city: payload.city,
          state: payload.state,
          is_head_office: true,
          status: 'Active'
        }]).select();

        const brId = newBr && newBr[0] ? newBr[0].id : null;

        await window.dbClient.from('warehouses').insert([{
          company_id: cId,
          branch_id: brId,
          name: `${name} Main Store`,
          code: `WH-${code}-01`,
          warehouse_type: isMfg ? 'General' : 'Finished Goods',
          is_default: true,
          status: 'Active'
        }]);

        // Auto grant admin access in user_company_access
        await window.dbClient.from('user_company_access').insert([{
          tenant_id: 1,
          company_id: cId,
          role: 'admin',
          status: 'Active'
        }]);

        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logCompanyCreated) {
          await window.AUDIT_LOGGER.logCompanyCreated({
            companyId: cId,
            companyName: name,
            companyCode: code
          });
        }
      }
      APP.showToast('Company created with default branch and warehouse', 'success');
    }

    APP.closeModal('company-modal');
    if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
      await window.TENANT_CONTEXT.reload();
    } else {
      await window.TENANT_CONTEXT.init(true);
    }
    await loadCompanies();
  } catch (err) {
    console.error('saveCompany failed:', err);
    APP.showToast('Failed to save company: ' + err.message, 'error');
  } finally {
    if (btn) APP.setButtonLoading(btn, false);
  }
}

let isDeletingCompany = false;
let isArchivingCompany = false;

/**
 * Safe Archival of Company
 * Automatically switches active tenant if current company is selected,
 * deactivates entity from new operations, and preserves all historical records & audit trails.
 */
async function archiveCompany(companyId) {
  if (isArchivingCompany) return;
  const comp = allCompanies.find(c => c.id === companyId);
  if (!comp) return;

  if (comp.id === 1) {
    APP.showToast('Security Rule: Anjani Agri Care (ID 1 / 623) is the root legal entity and cannot be archived.', 'error');
    return;
  }

  APP.showConfirm(
    `Archive "${comp.name}" (${comp.code})?<br><br>This will deactivate the entity from initiating new business transactions, while <strong>permanently preserving</strong> all historical invoices, stock movements, and audit logs for authorized reporting.`,
    async () => {
      isArchivingCompany = true;
      APP.showSpinner();
      try {
        // 1. If currently active tenant, switch to Company 1 first
        const activeId = window.TENANT_CONTEXT.getCompanyId();
        if (comp.id === activeId) {
          localStorage.setItem('erp_active_company_id', 1);
          APP.showToast('Switched active workspace to Anjani Agri Care.', 'info');
        }

        // 2. Update company status to Archived
        const { error } = await window.dbClient.from('companies').update({
          status: 'Archived'
        }).eq('id', companyId);

        if (error) throw error;

        // 3. Log audit trail entry
        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logCompanyArchived) {
          await window.AUDIT_LOGGER.logCompanyArchived({
            companyId: comp.id,
            companyName: comp.name,
            companyCode: comp.code,
            reason: 'Administrative entity archival'
          });
        }

        comp.status = 'Archived';
        APP.closeModal('company-dependency-modal');
        APP.showToast(`Company "${comp.name}" archived successfully.`, 'success');
        if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
          await window.TENANT_CONTEXT.reload();
        } else {
          await window.TENANT_CONTEXT.init(true);
        }
        filterAndRenderCompanies();
      } catch (err) {
        console.error('archiveCompany failed:', err);
        APP.showToast('Failed to archive company: ' + err.message, 'error');
      } finally {
        isArchivingCompany = false;
        APP.hideSpinner();
      }
    },
    {
      title: 'Archive Legal Entity',
      confirmText: 'Archive Company',
      isDanger: false,
      onCancel: () => { isArchivingCompany = false; }
    }
  );
}

/**
 * Reactivate Company
 */
async function reactivateCompany(companyId) {
  const comp = allCompanies.find(c => c.id === companyId);
  if (!comp) return;

  APP.showConfirm(
    `Reactivate company "${comp.name}" (${comp.code})?<br><br>This will restore the entity to Active status, allowing it to initiate new business transactions and be selected as an active tenant.`,
    async () => {
      APP.showSpinner();
      try {
        const { error } = await window.dbClient.from('companies').update({
          status: 'Active'
        }).eq('id', companyId);

        if (error) throw error;

        if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logCompanyReactivated) {
          await window.AUDIT_LOGGER.logCompanyReactivated({
            companyId: comp.id,
            companyName: comp.name,
            companyCode: comp.code
          });
        }

        comp.status = 'Active';
        APP.showToast(`Company "${comp.name}" reactivated successfully.`, 'success');
        if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
          await window.TENANT_CONTEXT.reload();
        } else {
          await window.TENANT_CONTEXT.init(true);
        }
        filterAndRenderCompanies();
      } catch (err) {
        console.error('reactivateCompany failed:', err);
        APP.showToast('Failed to reactivate company: ' + err.message, 'error');
      } finally {
        APP.hideSpinner();
      }
    },
    {
      title: 'Reactivate Company',
      confirmText: 'Reactivate Entity',
      isDanger: false,
      onCancel: () => {}
    }
  );
}

async function safeDeleteCompany(companyId) {
  if (isDeletingCompany) return;
  const comp = allCompanies.find(c => c.id === companyId);
  if (!comp) return;

  if (comp.id === 1) {
    APP.showToast('Security Rule: Anjani Agri Care (ID 1 / 623) is the primary manufacturing company and root legal entity, and cannot be deleted.', 'error');
    return;
  }

  isDeletingCompany = true;
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

    const [brRes, whRes, stkRes, ordRes, invRes, icRelRes, icTxRes] = await Promise.all([
      safeQuery(window.dbClient.from('branches').select('id, name, code', { count: 'exact' }).eq('company_id', companyId)),
      safeQuery(window.dbClient.from('warehouses').select('id, name, code, status', { count: 'exact' }).eq('company_id', companyId)),
      safeQuery(window.dbClient.from('stock_batches').select('id, current_qty, warehouse_id').eq('company_id', companyId)),
      safeQuery(window.dbClient.from('orders').select('id', { count: 'exact' }).eq('company_id', companyId)),
      safeQuery(window.dbClient.from('invoices').select('id', { count: 'exact' }).eq('company_id', companyId)),
      safeQuery(window.dbClient.from('intercompany_relationships').select('id', { count: 'exact' }).or(`supplier_company_id.eq.${companyId},customer_company_id.eq.${companyId}`)),
      safeQuery(window.dbClient.from('intercompany_transfers').select('id', { count: 'exact' }).or(`from_company_id.eq.${companyId},to_company_id.eq.${companyId}`))
    ]);

    const branches = brRes.data || [];
    const brCount = brRes.count || branches.length;
    const warehouses = whRes.data || [];
    const whCount = whRes.count || warehouses.length;

    const batches = stkRes.data || [];
    const activeStockCount = batches.filter(b => (Number(b.current_qty) || 0) > 0).length;
    const totalStockQty = batches.reduce((sum, b) => sum + (Number(b.current_qty) || 0), 0);
    const ordCount = ordRes.count || (ordRes.data || []).length;
    const invCount = invRes.count || (invRes.data || []).length;
    const icRelCount = icRelRes.count || (icRelRes.data || []).length;
    const icTxCount = icTxRes.count || (icTxRes.data || []).length;

    // Check if warehouses have any historical movements
    const whIds = warehouses.map(w => w.id);
    let movCount = 0;
    if (whIds.length > 0) {
      const movRes = await safeQuery(window.dbClient.from('stock_movements').select('id', { count: 'exact' }).in('warehouse_id', whIds));
      movCount = movRes.count || (movRes.data || []).length;
    }

    // Only genuine operational / physical inventory / transaction records block deletion
    const totalDependencies = activeStockCount + movCount + ordCount + invCount + icTxCount;

    if (totalDependencies > 0) {
      isDeletingCompany = false;
      APP.hideSpinner();
      const modalMsg = document.getElementById('company-dependency-msg');
      const listEl = document.getElementById('company-dependency-list');
      const archiveBtn = document.getElementById('btn-company-archive');

      if (modalMsg) {
        modalMsg.innerHTML = `<strong>${escapeHtml(comp.name)} (${escapeHtml(comp.code)})</strong> has <strong>${totalDependencies}</strong> dependent records preventing permanent deletion:`;
      }

      if (listEl) {
        listEl.innerHTML = `
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">
            ${activeStockCount > 0 ? `<li style="color:var(--danger,#ef4444);font-weight:600;"><strong>${activeStockCount}</strong> Inventory Batches with Active Physical Stock (${totalStockQty} total units)</li>` : ''}
            ${movCount > 0 ? `<li><strong>${movCount}</strong> Historical Stock Movements on Warehouses (${warehouses.map(w => escapeHtml(w.name)).join(', ')})</li>` : ''}
            ${ordCount > 0 ? `<li><strong>${ordCount}</strong> Sales Order${ordCount > 1 ? 's' : ''}</li>` : ''}
            ${invCount > 0 ? `<li><strong>${invCount}</strong> Tax Invoice${invCount > 1 ? 's' : ''}</li>` : ''}
            ${icTxCount > 0 ? `<li><strong>${icTxCount}</strong> Intercompany Transfer${icTxCount > 1 ? 's' : ''}</li>` : ''}
            ${icRelCount > 0 ? `<li><strong>${icRelCount}</strong> Intercompany Trading Relationship${icRelCount > 1 ? 's' : ''}</li>` : ''}
          </ul>
          ${warehouses.length > 0 ? `
            <div style="margin-top:12px;padding-top:8px;border-top:1px dashed var(--border,#e5e7eb);display:flex;align-items:center;justify-content:space-between;">
              <span class="text-xs text-muted">Manage or inspect storage points:</span>
              <a href="warehouses.html?company=${companyId}" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:4px;text-decoration:none;font-size:11px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                View Warehouses for ${escapeHtml(comp.name)} &rarr;
              </a>
            </div>
          ` : ''}
        `;
      }

      if (archiveBtn) {
        archiveBtn.style.display = 'inline-flex';
        archiveBtn.onclick = () => archiveCompany(companyId);
      }

      APP.openModal('company-dependency-modal');
      return;
    }

    // Zero dependencies -> Confirm permanent deletion
    let emptyEntitiesMsg = '';
    if (warehouses.length > 0 || brCount > 0) {
      const parts = [];
      if (warehouses.length > 0) parts.push(`${warehouses.length} empty warehouse${warehouses.length > 1 ? 's' : ''} (${warehouses.map(w => escapeHtml(w.name)).join(', ')})`);
      if (brCount > 0) parts.push(`${brCount} branch${brCount > 1 ? 'es' : ''}`);
      emptyEntitiesMsg = `<br><br>The associated ${parts.join(' and ')} will also be cleanly removed.`;
    }

    APP.hideSpinner();
    APP.showConfirm(
      `Are you sure you want to permanently delete "${comp.name}" (${comp.code})?<br><br>There are zero active stock records or commercial transactions.${emptyEntitiesMsg}<br><br>Historical audit logs will remain preserved with snapshot references.<br><br>This action cannot be undone.`,
      async () => {
        isDeletingCompany = true;
        try {
          APP.showSpinner();

          // Switch away if active
          const activeId = window.TENANT_CONTEXT.getCompanyId();
          if (comp.id === activeId) {
            localStorage.setItem('erp_active_company_id', 1);
          }

          // Clean up empty warehouses and branches if any exist
          if (whIds.length > 0) {
            await safeQuery(window.dbClient.from('warehouses').delete().in('id', whIds));
          }
          await safeQuery(window.dbClient.from('branches').delete().eq('company_id', companyId));
          await safeQuery(window.dbClient.from('user_company_access').delete().eq('company_id', companyId));
          await safeQuery(window.dbClient.from('intercompany_relationships').delete().or(`supplier_company_id.eq.${companyId},customer_company_id.eq.${companyId}`));
          const { error } = await window.dbClient.from('companies').delete().eq('id', companyId);
          if (error) throw error;

          if (window.AUDIT_LOGGER && window.AUDIT_LOGGER.logCompanyDeleted) {
            await window.AUDIT_LOGGER.logCompanyDeleted({
              companyId: comp.id,
              companyName: comp.name,
              companyCode: comp.code
            });
          }

          allCompanies = allCompanies.filter(c => c.id !== companyId);
          renderCompaniesTable(allCompanies);
          APP.showToast(`Company "${comp.name}" deleted successfully.`, 'success');
          if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
            await window.TENANT_CONTEXT.reload();
          } else {
            await window.TENANT_CONTEXT.init(true);
          }
          await loadCompanies();
        } catch (delErr) {
          console.error('Delete company error:', delErr);
          APP.showToast('Failed to delete company: ' + delErr.message, 'error');
        } finally {
          isDeletingCompany = false;
          APP.hideSpinner();
        }
      },
      {
        title: 'Delete Company',
        confirmText: 'Delete Permanently',
        isDanger: true,
        onCancel: () => { isDeletingCompany = false; }
      }
    );
  } catch (err) {
    console.error('safeDeleteCompany dependency check failed:', err);
    APP.showToast('Failed to verify dependencies: ' + err.message, 'error');
  } finally {
    isDeletingCompany = false;
    APP.hideSpinner();
  }
}

// ============================================================================
// BRANCH MANAGEMENT
// ============================================================================

function openManageBranches(companyId) {
  currentCompanyForBranches = allCompanies.find(c => c.id === companyId);
  if (!currentCompanyForBranches) return;

  document.getElementById('branches-modal-title').textContent = `Branches: ${currentCompanyForBranches.name} (${currentCompanyForBranches.code})`;
  cancelBranchForm();
  renderBranchesList();
  APP.openModal('branches-modal');
}

function renderBranchesList() {
  const wrap = document.getElementById('branches-list-wrap');
  if (!wrap || !currentCompanyForBranches) return;

  const branches = allBranches.filter(b => b.company_id === currentCompanyForBranches.id);
  if (!branches.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 16px;text-align:center;">
      <div style="width:44px;height:44px;border-radius:50%;background:rgba(12,57,37,0.08);color:#0C3925;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:22px;height:22px;"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 22V12h6v10"/></svg>
      </div>
      <h4 style="margin:0 0 4px;font-size:14px;font-weight:700;">No branches defined</h4>
      <p style="margin:0;font-size:12.5px;color:var(--text-muted);">Click "+ Add Branch" above to register physical factory, office, or depot locations.</p>
    </div>`;
    return;
  }

  const safeStr = (s) => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

  wrap.innerHTML = `
    <!-- Desktop / Laptop View: Clean Structured Table -->
    <div class="branches-table-desktop">
      <div class="table-scroll-wrap" style="width:100%;border:1px solid var(--border,#e2e8f0);border-radius:8px;overflow-x:auto;">
        <table class="data-table branches-table" style="font-size:13px;margin:0;width:100%;min-width:540px;">
          <thead>
            <tr>
              <th style="width:18%;min-width:90px;">Code</th>
              <th style="width:34%;min-width:160px;">Branch Name</th>
              <th style="width:24%;min-width:120px;">City / State</th>
              <th style="width:14%;min-width:90px;">Status</th>
              <th style="width:10%;min-width:80px;text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${branches.map(b => `
              <tr>
                <td class="cell-bold cell-mono">${safeStr(b.code)}</td>
                <td class="cell-bold">${safeStr(b.name)}</td>
                <td>${b.city ? `${safeStr(b.city)}, ${safeStr(b.state || '')}` : '—'}</td>
                <td>${b.is_head_office ? '<span class="badge badge-success">HEAD OFFICE</span>' : '<span class="badge badge-gray">Branch</span>'}</td>
                <td style="text-align:right;">
                  <div class="row-actions" style="justify-content:flex-end;gap:6px;">
                    <button type="button" class="action-btn edit" onclick="openEditBranch(${b.id})" title="Edit Branch">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button type="button" class="action-btn delete" onclick="safeDeleteBranch(${b.id})" title="Delete Branch" style="color:var(--danger,#ef4444);">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Mobile View: Dedicated Clean Responsive Cards -->
    <div class="branches-cards-mobile">
      ${branches.map(b => {
        const locationStr = [b.city, b.state].filter(Boolean).map(safeStr).join(', ') || '—';
        const isHeadOffice = Boolean(b.is_head_office);
        const badgeHtml = isHeadOffice
          ? `<span class="badge badge-success branch-status-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;margin-right:3px;flex-shrink:0;"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h1M9 13h1M9 17h1"/></svg>
              Head Office
            </span>`
          : `<span class="badge badge-gray branch-status-badge">Branch Depot</span>`;

        return `
          <div class="branch-card-item">
            <div class="branch-card-header">
              <div class="branch-card-title-col">
                <div class="branch-card-name">${safeStr(b.name)}</div>
                <div class="branch-card-code-pill">${safeStr(b.code)}</div>
              </div>
              <div class="branch-card-badge-col">
                ${badgeHtml}
              </div>
            </div>

            <div class="branch-card-meta-grid">
              <div class="branch-card-meta-item">
                <span class="branch-card-meta-label">Location</span>
                <span class="branch-card-meta-val">${locationStr}</span>
              </div>
              <div class="branch-card-meta-item">
                <span class="branch-card-meta-label">Facility Type</span>
                <span class="branch-card-meta-val">${isHeadOffice ? 'Principal Operating HQ' : 'Operational Branch'}</span>
              </div>
            </div>

            <div class="branch-card-actions">
              <button type="button" class="btn btn-secondary btn-sm branch-action-btn edit" onclick="openEditBranch(${b.id})" title="Edit Branch">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button type="button" class="btn btn-sm branch-action-btn delete" onclick="safeDeleteBranch(${b.id})" title="Delete Branch">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

let isDeletingBranch = false;

async function safeDeleteBranch(branchId) {
  if (isDeletingBranch) return;
  const b = allBranches.find(x => x.id === branchId);
  if (!b) return;

  isDeletingBranch = true;
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

    const whRes = await safeQuery(window.dbClient.from('warehouses').select('id, name', { count: 'exact' }).eq('branch_id', branchId));
    const whCount = whRes.count || (whRes.data || []).length;

    if (whCount > 0) {
      APP.hideSpinner();
      isDeletingBranch = false;
      APP.showToast(`Cannot delete branch "${b.name}": ${whCount} warehouse(s) are linked to it. Reassign or remove warehouses first.`, 'warning');
      return;
    }

    const branchesForCo = allBranches.filter(x => x.company_id === b.company_id);
    if (branchesForCo.length <= 1) {
      APP.hideSpinner();
      isDeletingBranch = false;
      APP.showToast(`Cannot delete the only branch for this company. At least one location is required.`, 'warning');
      return;
    }

    APP.hideSpinner();
    APP.showConfirm(
      `Are you sure you want to delete branch "${b.name}" (${b.code})?`,
      async () => {
        isDeletingBranch = true;
        try {
          APP.showSpinner();
          const { error } = await window.dbClient.from('branches').delete().eq('id', branchId);
          if (error) throw error;
          APP.showToast(`Branch "${b.name}" deleted.`, 'success');
          if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
            await window.TENANT_CONTEXT.reload();
          }
          await loadCompanies();
          renderBranchesList();
        } catch (delErr) {
          console.error('Delete branch error:', delErr);
          APP.showToast('Failed to delete branch: ' + delErr.message, 'error');
        } finally {
          isDeletingBranch = false;
          APP.hideSpinner();
        }
      },
      {
        title: 'Delete Branch',
        confirmText: 'Delete Branch',
        isDanger: true,
        onCancel: () => { isDeletingBranch = false; }
      }
    );
  } catch (err) {
    console.error('safeDeleteBranch check failed:', err);
    APP.showToast('Failed to check branch dependencies: ' + err.message, 'error');
  } finally {
    isDeletingBranch = false;
    APP.hideSpinner();
  }
}

function openAddBranch() {
  editingBranchId = null;
  document.getElementById('branch-form-title').textContent = `New Branch for ${currentCompanyForBranches.name}`;
  const form = document.getElementById('branch-form');
  if (form) {
    form.reset();
    form.style.display = 'block';
  }
}

function openEditBranch(id) {
  editingBranchId = id;
  const b = allBranches.find(x => x.id === id);
  if (!b) return;

  document.getElementById('branch-form-title').textContent = `Edit Branch (${b.code})`;
  const form = document.getElementById('branch-form');
  if (form) {
    form.elements['branch_name'].value = b.name || '';
    form.elements['branch_code'].value = b.code || '';
    form.elements['branch_city'].value = b.city || '';
    form.elements['branch_state'].value = b.state || '';
    form.elements['is_head_office'].checked = !!b.is_head_office;
    form.style.display = 'block';
  }
}

function cancelBranchForm() {
  const form = document.getElementById('branch-form');
  if (form) form.style.display = 'none';
  editingBranchId = null;
}

async function saveBranch() {
  const form = document.getElementById('branch-form');
  if (!form || !currentCompanyForBranches) return;

  const name = form.elements['branch_name'].value.trim();
  const code = form.elements['branch_code'].value.trim().toUpperCase();
  const isHO = form.elements['is_head_office'].checked;

  if (!name || !code) {
    APP.showToast('Please provide branch name and code', 'error');
    return;
  }

  // Pre-check duplicate branch code within this company
  const coBranches = allBranches.filter(b => b.company_id === currentCompanyForBranches.id);
  const dupBranch = coBranches.find(b => b.code.toUpperCase() === code && b.id !== editingBranchId);
  if (dupBranch) {
    APP.showToast(`Branch code "${code}" already exists in ${currentCompanyForBranches.name}.`, 'error');
    return;
  }

  // If marked as Head Office, unmark other head offices for this company
  if (isHO) {
    await window.dbClient.from('branches')
      .update({ is_head_office: false })
      .eq('company_id', currentCompanyForBranches.id)
      .eq('is_head_office', true);
  }

  const payload = {
    company_id: currentCompanyForBranches.id,
    name: name,
    code: code,
    city: form.elements['branch_city'].value.trim() || null,
    state: form.elements['branch_state'].value.trim() || null,
    is_head_office: isHO,
    status: 'Active'
  };

  try {
    if (editingBranchId) {
      const { error } = await window.dbClient.from('branches').update(payload).eq('id', editingBranchId);
      if (error) throw error;
      APP.showToast('Branch updated', 'success');
    } else {
      const { error } = await window.dbClient.from('branches').insert([payload]);
      if (error) throw error;
      APP.showToast('Branch added', 'success');
    }

    cancelBranchForm();
    if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.reload) {
      await window.TENANT_CONTEXT.reload();
    }
    await loadCompanies();
    renderBranchesList();
  } catch (err) {
    console.error('saveBranch failed:', err);
    APP.showToast('Failed to save branch: ' + err.message, 'error');
  }
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

loadCompanies();
