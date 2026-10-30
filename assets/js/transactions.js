/* assets/js/transactions.js */
let allTransactions = [], editingTxnId = null;
let allAccounts = [];

function updatePageDebug(text, color) {
  const el = document.getElementById('debug-page-status');
  if (el) {
    el.textContent = 'Page: ' + text;
    if (color) el.style.color = color;
  }
}

async function loadTransactions() {
  console.log('Loading transactions...');
  updatePageDebug('Loading Transactions...', '#0C3925');
  
  try {
    UTILS.renderTableSkeleton('txn-table');
    UTILS.setSkeletonText('total-receipts', 'w-50', true);
    UTILS.setSkeletonText('total-payments', 'w-50', true);
    UTILS.setSkeletonText('net-balance', 'w-50', true);
    
    await DB.initDB();

    // High performance: fetch accounts and transactions simultaneously in a single parallel round-trip
    const accQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('accounts').select('*').order('name')) : window.dbClient.from('accounts').select('*').order('name');
    const txnQuery = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.filter(window.dbClient.from('transactions').select('*').order('id', { ascending: false })) : window.dbClient.from('transactions').select('*').order('id', { ascending: false });

    const [accRes, txnRes] = await Promise.all([
      accQuery,
      txnQuery
    ]);

    if (accRes.error) throw accRes.error;
    if (txnRes.error) throw txnRes.error;

    allAccounts = accRes.data || [];
    const txnData = txnRes.data || [];
    allTransactions = UTILS.sortLatestFirst(txnData, t => t.ref_no || t.id);

    // Compute account balances in memory without making redundant queries
    const accMap = new Map();
    allAccounts.forEach(a => {
      a.total_receipts = 0;
      a.total_payments = 0;
      a.net_balance = 0;
      accMap.set(String(a.id), a);
    });

    allTransactions.forEach(t => {
      const acc = accMap.get(String(t.account_id));
      t.account_name = acc ? acc.name : '';
      if (acc) {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'Receipt') acc.total_receipts += amt;
        else if (t.type === 'Payment') acc.total_payments += amt;
        acc.net_balance = acc.total_receipts - acc.total_payments;
      }
      
      // Determine display reference number
      if (!t.ref_no) {
        if (t.notes && t.notes.startsWith('[Ref: ')) {
          const m = t.notes.match(/^\[Ref:\s*([^\]]+)\]/);
          if (m) t.ref_no = m[1];
        } else if (t.ref_id !== null && t.ref_id !== undefined) {
          t.ref_no = 'TXN-' + t.ref_id;
        } else {
          t.ref_no = 'TXN-' + t.id;
        }
      }
    });

    populateAccountDropdowns();
    applyFilters();
    
    updatePageDebug('Ready (' + allTransactions.length + ')', '#0C3925');
    console.log('Transactions: All data loaded successfully');
  } catch (err) {
    console.error('Transactions loadTransactions failed:', err);
    updatePageDebug('FAILED', '#EF4444');
    APP.showToast('Failed to load transactions: ' + err.message, 'error');
    renderTable([]);
  }
}

function populateAccountDropdowns() {
  const filterSelect = document.getElementById('account-filter');
  if (filterSelect) {
    const curVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Accounts</option>' + 
      allAccounts.map(a => `<option value="${a.id}" ${curVal == a.id ? 'selected' : ''}>${a.name} (${UTILS.fmtCurrency(a.net_balance || 0)})</option>`).join('');
  }

  const formSelect = document.getElementById('txn-account-select');
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">Select Account...</option>' + 
      allAccounts.map(a => `<option value="${a.id}" ${curVal == a.id ? 'selected' : ''}>${a.name}</option>`).join('');
  }
}

let txnTableEnhancer = null;

function renderTxnSlice(data) {
  const tbody = document.querySelector('#txn-table tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(t => `<tr>
    <td>${UTILS.fmtDate(t.date)}</td>
    <td><span class="badge ${t.type === 'Receipt' ? 'badge-success' : 'badge-danger'}"><span class="badge-dot"></span>${t.type}</span></td>
    <td><span style="font-weight: 500; color: var(--text-primary);">${t.account_name || '—'}</span></td>
    <td class="cell-mono">${t.ref_no || '—'}</td>
    <td class="cell-bold">${t.party_name || '—'}</td>
    <td><span class="badge badge-gray">${t.mode || 'Cash'}</span></td>
    <td class="cell-amount ${t.type === 'Receipt' ? 'positive' : 'negative'}">${UTILS.fmtCurrency(t.amount)}</td>
    <td><div class="row-actions">
      <button class="action-btn edit" onclick="openEdit(${t.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="action-btn delete" onclick="deleteTxn(${t.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
    </div></td>
  </tr>`).join('');
  UTILS.applyMobileTableLabels('txn-table');
}

function renderTable(data) {
  const tbody = document.querySelector('#txn-table tbody');
  if (!tbody) return;
  const countEl = document.getElementById('total-info');
  if (countEl) countEl.textContent = `${data.length} transaction${data.length !== 1 ? 's' : ''}`;
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9" class="empty-cell"><div class="empty-state"><span aria-hidden="true" style="font-size:28px;font-weight:800;line-height:1;color:var(--accent)">₹</span><h3>No transactions</h3><p>Record your first payment or receipt.</p></div></td></tr>`;
    const pag = document.querySelector('#txn-table-wrap .pagination');
    if (pag) pag.style.display = 'none';
    return;
  }

  if (window.TableEnhancer) {
    if (!txnTableEnhancer) {
      txnTableEnhancer = new window.TableEnhancer({
        tableId: 'txn-table',
        pageSize: 25,
        defaultSortKey: 'id',
        defaultSortOrder: 'desc',
        onRender: (pageSlice) => renderTxnSlice(pageSlice)
      });
    }
    txnTableEnhancer.setData(data);
    return;
  }

  renderTxnSlice(data.slice(0, 50));
}

function renderSummary(data) {
  const receipts = data.filter(t => t.type === 'Receipt').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const payments = data.filter(t => t.type === 'Payment').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const receiptCount = data.filter(t => t.type === 'Receipt').length;
  const paymentCount = data.filter(t => t.type === 'Payment').length;
  const net = receipts - payments;

  const rEl = document.getElementById('total-receipts');
  const pEl = document.getElementById('total-payments');
  const nEl = document.getElementById('net-balance');
  if (rEl) rEl.textContent = UTILS.fmtCurrency(receipts);
  if (pEl) pEl.textContent = UTILS.fmtCurrency(payments);
  if (nEl) {
    nEl.textContent = UTILS.fmtCurrency(net);
    nEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  const receiptMetaEl = document.getElementById('receipt-meta');
  if (receiptMetaEl) receiptMetaEl.textContent = receiptCount ? `${receiptCount} receipt${receiptCount === 1 ? '' : 's'} recorded` : 'Incoming cash collected';

  const paymentMetaEl = document.getElementById('payment-meta');
  if (paymentMetaEl) paymentMetaEl.textContent = paymentCount ? `${paymentCount} payment${paymentCount === 1 ? '' : 's'} recorded` : 'Payments Made';

  const netMetaEl = document.getElementById('net-balance-meta');
  if (netMetaEl) {
    netMetaEl.textContent = net > 0
      ? 'Receipts are ahead of payments'
      : net < 0
        ? 'Payments are ahead of receipts'
        : 'Receipts and payments are even';
    netMetaEl.style.color = net > 0 ? 'var(--success)' : net < 0 ? 'var(--danger)' : 'var(--text-secondary)';
  }
}

function openAdd() {
  editingTxnId = null;
  document.getElementById('modal-title').textContent = 'Record Transaction';
  const txnForm = document.getElementById('txn-form');
  txnForm.reset();
  const accountSelect = document.getElementById('txn-account-select');
  if (accountSelect) accountSelect.value = '';
  UTILS.applyDefaultDateInputs(txnForm, { skipFieldNames: ['due_date'] });
  APP.openModal('txn-modal');
}

function openEdit(id) {
  editingTxnId = id;
  const t = allTransactions.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-title').textContent = 'Edit Transaction';
  
  // Clean notes from [Ref: ...] header for user display if present
  let userNotes = t.notes || '';
  if (userNotes.startsWith('[Ref: ')) {
    userNotes = userNotes.replace(/^\[Ref:\s*[^\]]+\]\s*/, '');
  }
  
  const formData = {
    ...t,
    ref_no: t.ref_no || '',
    notes: userNotes
  };

  UTILS.populateForm('txn-form', formData);
  const accountSelect = document.getElementById('txn-account-select');
  if (accountSelect) accountSelect.value = t.account_id || '';
  UTILS.applyDefaultDateInputs(document.getElementById('txn-form'), { skipFieldNames: ['due_date'] });
  APP.openModal('txn-modal');
}

async function saveTxn() {
  const d = UTILS.getFormData('txn-form');
  if (!d.type || !d.amount || !d.date) { APP.showToast('Type, amount and date are required', 'error'); return; }
  
  const saveBtn = document.querySelector('#txn-modal .btn-primary');
  if (saveBtn) APP.setButtonLoading(saveBtn, true, editingTxnId ? 'Updating...' : 'Recording...');

  try {
    const rawRef = (d.ref_no || '').trim();
    let numRefId = null;
    if (rawRef && /^\d+$/.test(rawRef)) {
      numRefId = parseInt(rawRef, 10);
    }
    
    // Store reference cleanly: if alphanumeric, prepend tag in notes so it's safely persisted without breaking schema
    let combinedNotes = (d.notes || '').trim();
    if (rawRef) {
      combinedNotes = `[Ref: ${rawRef}]` + (combinedNotes ? ' ' + combinedNotes : '');
    }

    const payload = {
      type: d.type,
      party_name: d.party_name || '',
      amount: parseFloat(d.amount) || 0,
      mode: d.mode || 'Cash',
      date: d.date,
      notes: combinedNotes,
      ref_id: numRefId,
      ref_type: rawRef ? 'Manual' : null,
      account_id: d.account_id ? parseInt(d.account_id, 10) : null
    };

    if (editingTxnId) {
      const { error } = await window.dbClient
        .from('transactions')
        .update(payload)
        .eq('id', editingTxnId);
      if (error) throw error;
      APP.showToast('Transaction updated!', 'success');
    } else {
      const stampedPayload = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(payload) : payload;
      const { error } = await window.dbClient
        .from('transactions')
        .insert([stampedPayload]);
      if (error) throw error;
      APP.showToast('Transaction recorded!', 'success');
    }

    APP.closeModal('txn-modal');
    loadTransactions();
  } catch (err) {
    console.error('saveTxn failed:', err);
    APP.showToast('Error saving transaction: ' + err.message, 'error');
  } finally {
    if (saveBtn) APP.setButtonLoading(saveBtn, false);
  }
}

async function deleteTxn(id) {
  APP.showConfirm('Delete this transaction?', async () => {
    try {
      const { error } = await window.dbClient
        .from('transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      
      APP.showToast('Transaction deleted.', 'success');
      setTimeout(() => loadTransactions(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete transaction: ' + err.message, 'error');
    }
  });
}

function applyFilters() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  const type = document.getElementById('type-filter')?.value || '';
  const account = document.getElementById('account-filter')?.value || '';

  let filtered = allTransactions;

  if (type) {
    filtered = filtered.filter(x => x.type === type);
  }
  if (account) {
    filtered = filtered.filter(x => String(x.account_id) === String(account));
  }
  if (q) {
    filtered = filtered.filter(t => 
      `${t.type} ${t.ref_no || ''} ${t.party_name || ''} ${t.mode || ''} ${t.account_name || ''} ${t.notes || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  // Sort descending by numeric ID / reference
  filtered = UTILS.sortLatestFirst(filtered, t => t.ref_no || t.id);

  renderTable(filtered);
  renderSummary(filtered);
}

// --- ACCOUNTS MANAGEMENT ---
async function loadAccounts() {
  try {
    const { data: accData, error: accErr } = await window.dbClient
      .from('accounts')
      .select('*')
      .order('name');
    if (accErr) throw accErr;
    allAccounts = accData || [];

    // Also fetch transactions to calculate per-account balances
    const { data: txns } = await window.dbClient.from('transactions').select('account_id, type, amount');
    const txnList = txns || [];

    allAccounts.forEach(a => {
      const aTxns = txnList.filter(t => String(t.account_id) === String(a.id));
      const rcpt = aTxns.filter(t => t.type === 'Receipt').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      const pymt = aTxns.filter(t => t.type === 'Payment').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      a.total_receipts = rcpt;
      a.total_payments = pymt;
      a.net_balance = rcpt - pymt;
    });

    // Populate filters and dropdowns
    const filterSelect = document.getElementById('account-filter');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Accounts</option>' + 
        allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      filterSelect.value = currentVal;
    }

    const formSelect = document.getElementById('txn-account-select');
    if (formSelect) {
      const currentVal = formSelect.value;
      formSelect.innerHTML = '<option value="">Select Account...</option>' + 
        allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      formSelect.value = currentVal;
    }

    setTimeout(() => UTILS.initAllAutocompleteSelects(), 50);
    renderAccountsTable();
  } catch (err) {
    console.error('loadAccounts failed:', err);
  }
}

function renderAccountsTable() {
  const tbody = document.querySelector('#accounts-table tbody');
  if (!tbody) return;

  if (allAccounts.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6" class="empty-cell"><div class="empty-state">No accounts found. Add your first account.</div></td></tr>';
    return;
  }

  tbody.innerHTML = allAccounts.map(a => `
    <tr>
      <td class="cell-bold"><span class="account-name-val">${a.name}</span></td>
      <td>${a.account_number || a.details || '—'}</td>
      <td class="cell-amount text-success">${UTILS.fmtCurrency(a.total_receipts || 0)}</td>
      <td class="cell-amount text-danger">${UTILS.fmtCurrency(a.total_payments || 0)}</td>
      <td class="cell-amount" style="font-weight:700; color: ${(a.net_balance || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${UTILS.fmtCurrency(a.net_balance || 0)}
      </td>
      <td>
        <div class="row-actions accounts-actions">
          <button class="ledger-btn" onclick="filterByAccount(${a.id})" title="View Ledger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> <span>Ledger</span>
          </button>
          <button class="action-btn edit" onclick="editAccount(${a.id})" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" onclick="deleteAccount(${a.id})" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');

  UTILS.applyMobileTableLabels('accounts-table');
}

function filterByAccount(accountId) {
  const filterSelect = document.getElementById('account-filter');
  if (filterSelect) {
    filterSelect.value = accountId;
  }
  switchTab('ledger');
}

function switchTab(tab) {
  const tabLedger = document.getElementById('tab-ledger');
  const tabGl = document.getElementById('tab-general-ledger');
  const tabAccounts = document.getElementById('tab-accounts');
  const secLedger = document.getElementById('section-ledger');
  const secGl = document.getElementById('section-general-ledger');
  const secAccounts = document.getElementById('section-accounts');

  tabLedger?.classList.remove('active');
  tabGl?.classList.remove('active');
  tabAccounts?.classList.remove('active');
  if (secLedger) secLedger.style.display = 'none';
  if (secGl) secGl.style.display = 'none';
  if (secAccounts) secAccounts.style.display = 'none';

  if (tab === 'ledger') {
    tabLedger?.classList.add('active');
    if (secLedger) secLedger.style.display = 'block';
    loadTransactions();
  } else if (tab === 'general-ledger') {
    tabGl?.classList.add('active');
    if (secGl) secGl.style.display = 'block';
    loadGeneralLedger();
  } else if (tab === 'accounts') {
    tabAccounts?.classList.add('active');
    if (secAccounts) secAccounts.style.display = 'block';
    loadAccounts();
  }
}

function openAddAccount() {
  document.getElementById('account-form-container').style.display = 'block';
  document.getElementById('account-form-title').textContent = 'Add New Account';
  document.getElementById('account-edit-id').value = '';
  document.getElementById('account-name-input').value = '';
  document.getElementById('account-details-input').value = '';
}

function closeAccountForm() {
  document.getElementById('account-form-container').style.display = 'none';
}

function editAccount(id) {
  const a = allAccounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('account-form-container').style.display = 'block';
  document.getElementById('account-form-title').textContent = 'Edit Account';
  document.getElementById('account-edit-id').value = a.id;
  document.getElementById('account-name-input').value = a.name;
  document.getElementById('account-details-input').value = a.account_number || a.details || '';
}

async function saveAccount() {
  const name = document.getElementById('account-name-input').value.trim();
  const details = document.getElementById('account-details-input').value.trim();
  const editId = document.getElementById('account-edit-id').value;

  if (!name) {
    APP.showToast('Account name is required', 'error');
    return;
  }

  try {
    const payload = { 
      name, 
      account_number: details || null 
    };

    if (editId) {
      const { error } = await window.dbClient
        .from('accounts')
        .update(payload)
        .eq('id', editId);
      if (error) throw error;
      APP.showToast('Account updated!', 'success');
    } else {
      const stampedAccount = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(payload) : payload;
      const { error } = await window.dbClient
        .from('accounts')
        .insert([stampedAccount]);
      if (error) throw error;
      APP.showToast('Account created!', 'success');
    }

    closeAccountForm();
    await loadAccounts();
    setTimeout(() => loadTransactions(), 100);
  } catch (err) {
    console.error(err);
    APP.showToast('Error saving account: ' + err.message, 'error');
  }
}

async function deleteAccount(id) {
  APP.showConfirm('Are you sure you want to delete this account? Transactions associated with it will remain.', async () => {
    try {
      const { error } = await window.dbClient
        .from('accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;

      APP.showToast('Account deleted', 'success');
      closeAccountForm();
      await loadAccounts();
      setTimeout(() => loadTransactions(), 100);
    } catch (err) {
      console.error(err);
      APP.showToast('Failed to delete account: ' + err.message, 'error');
    }
  });
}

// Event Listeners with Debounce
const debouncedApplyFilters = (typeof UTILS !== 'undefined' && UTILS.debounce) ? UTILS.debounce(applyFilters, 250) : applyFilters;
document.getElementById('search-input')?.addEventListener('input', debouncedApplyFilters);
document.getElementById('type-filter')?.addEventListener('change', applyFilters);
document.getElementById('account-filter')?.addEventListener('change', applyFilters);

// --- GENERAL LEDGER (DOUBLE-ENTRY) & LINKING MANAGEMENT ---
let allGlEntries = [];
let pendingPurchasesList = [];
let pendingOrdersList = [];

async function loadGeneralLedger() {
  try {
    const glTbody = document.getElementById('gl-tbody');
    if (glTbody) glTbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:2rem;">Loading double-entry journal...</td></tr>';

    const companyId = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getActiveCompanyId() : 1;

    // Load from DB if possible
    if (window.dbClient) {
      try {
        const { data: dbGl } = await window.dbClient.from('general_ledger').select('*').eq('company_id', companyId).order('id', { ascending: false });
        if (Array.isArray(dbGl) && dbGl.length > 0) {
          dbGl.forEach(item => {
            if (window.ACCOUNTING_CORE && !window.ACCOUNTING_CORE.getLedgerEntries().some(e => e.entry_no === item.entry_no)) {
              window.ACCOUNTING_CORE.getLedgerEntries().push(item);
            }
          });
        }
      } catch (e) {}
    }
    // Clean-slate: do not insert mock fallback entries if ledger is empty

    if (window.ACCOUNTING_CORE) {
      allGlEntries = window.ACCOUNTING_CORE.getLedgerEntries({ companyId });
      const tb = window.ACCOUNTING_CORE.getTrialBalance(companyId);

      const dEl = document.getElementById('gl-total-debits');
      const cEl = document.getElementById('gl-total-credits');
      const sEl = document.getElementById('gl-balance-status');
      const diffEl = document.getElementById('gl-diff-text');

      if (dEl) dEl.textContent = UTILS.fmtCurrency(tb.totalDebits);
      if (cEl) cEl.textContent = UTILS.fmtCurrency(tb.totalCredits);
      if (sEl) {
        sEl.textContent = tb.isBalanced ? 'Balanced (0.00 Diff)' : `Discrepancy: ${UTILS.fmtCurrency(tb.difference)}`;
        sEl.style.color = tb.isBalanced ? '#10B981' : '#EF4444';
      }
      if (diffEl) {
        diffEl.textContent = tb.isBalanced ? 'Debits equal Credits (Double-Entry Validated)' : 'Investigation required: Debits do not match Credits';
      }
    }

    applyGlFilters();
  } catch (err) {
    console.error('loadGeneralLedger error:', err);
  }
}

function applyGlFiltersReal() {
  const q = (document.getElementById('gl-search-input')?.value || '').toLowerCase().trim();
  const type = document.getElementById('gl-type-filter')?.value || '';

  let list = allGlEntries;
  if (type) {
    if (type === 'reversal') {
      list = list.filter(e => e.is_reversal || e.ref_type.includes('reversal'));
    } else {
      list = list.filter(e => e.ref_type === type);
    }
  }
  if (q) {
    list = list.filter(e => 
      `${e.entry_no} ${e.ref_type} ${e.ref_no || ''} ${e.debit_account_code} ${e.debit_account_name} ${e.credit_account_code} ${e.credit_account_name} ${e.party_name || ''} ${e.notes || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  renderGlTable(list);
}

const applyGlFilters = (typeof UTILS !== 'undefined' && UTILS.debounce) 
  ? UTILS.debounce(applyGlFiltersReal, 250) 
  : applyGlFiltersReal;

let glTableEnhancer = null;

function renderGlSlice(list) {
  const tbody = document.getElementById('gl-tbody');
  if (!tbody) return;

  tbody.innerHTML = list.map(e => {
    const isRev = e.is_reversal === true;
    const isReversed = allGlEntries.some(x => x.reversed_entry_id === e.id);
    let statusText = 'Posted';
    if (isRev) statusText = 'Compensating Reversal';
    else if (isReversed) statusText = 'Reversed';
    const statusBadge = (typeof UTILS !== 'undefined' && UTILS.statusBadge)
      ? UTILS.statusBadge(statusText, true)
      : `<span class="badge ${isReversed ? 'badge-danger' : (isRev ? 'badge-warning' : 'badge-success')}"><span class="badge-dot"></span>${statusText}</span>`;

    return `
      <tr>
        <td style="white-space:nowrap;">${UTILS.fmtDate(e.date)}</td>
        <td class="cell-mono font-bold">${e.entry_no}</td>
        <td>
          <span class="badge badge-gray" style="text-transform:capitalize;">${(e.ref_type || '').replace(/_/g, ' ')}</span>
          <div style="font-size:11px; color:var(--text-muted);">${e.ref_no || '—'}</div>
        </td>
        <td>
          <div class="font-bold text-primary">${e.debit_account_code}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${e.debit_account_name}</div>
        </td>
        <td>
          <div class="font-bold text-success">${e.credit_account_code}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${e.credit_account_name}</div>
        </td>
        <td class="cell-bold">${e.party_name || '—'}</td>
        <td class="cell-amount font-bold">${UTILS.fmtCurrency(e.amount)}</td>
        <td>${statusBadge}</td>
        <td>
          ${(!isRev && !isReversed) ? `
            <button class="btn btn-sm btn-secondary" onclick="openReversalModal(${e.id})" title="Traceable Reversal" style="padding:3px 8px; font-size:11px; color:#EF4444; border-color:rgba(239,68,68,0.3);">
              Reverse
            </button>
          ` : '<span style="font-size:11px; color:var(--text-muted);">Immutable</span>'}
        </td>
      </tr>
    `;
  }).join('');

  if (typeof UTILS !== 'undefined' && UTILS.applyMobileTableLabels) {
    UTILS.applyMobileTableLabels('gl-table');
  }
}

function renderGlTable(list) {
  const tbody = document.getElementById('gl-tbody');
  const countEl = document.getElementById('gl-total-info');
  if (countEl) countEl.textContent = `${list.length} journal entr${list.length === 1 ? 'y' : 'ies'}`;
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9" class="empty-cell"><div class="empty-state"><h3>No journal entries</h3><p>Recorded transactions and operations will generate double-entry journals here.</p></div></td></tr>';
    const pag = document.querySelector('#gl-table-wrap .pagination');
    if (pag) pag.style.display = 'none';
    return;
  }

  if (window.TableEnhancer) {
    if (!glTableEnhancer) {
      glTableEnhancer = new window.TableEnhancer({
        tableId: 'gl-table',
        pageSize: 25,
        defaultSortKey: 'id',
        defaultSortOrder: 'desc',
        onRender: (pageSlice) => renderGlSlice(pageSlice)
      });
    }
    glTableEnhancer.setData(list);
    return;
  }

  renderGlSlice(list.slice(0, 50));
}

function openReversalModal(entryId) {
  const e = allGlEntries.find(x => x.id === entryId);
  if (!e) return;
  document.getElementById('reversal-entry-id').value = e.id;
  document.getElementById('reversal-entry-target').value = `${e.entry_no} (${e.ref_type.replace(/_/g, ' ')} - ${UTILS.fmtCurrency(e.amount)})`;
  document.getElementById('reversal-reason').value = '';
  APP.openModal('reversal-modal');
}

async function executeTraceableReversal() {
  const entryId = parseInt(document.getElementById('reversal-entry-id').value, 10);
  const reason = (document.getElementById('reversal-reason').value || '').trim();
  if (!reason) {
    APP.showToast('Please specify a valid reason for reversing this financial entry.', 'error');
    return;
  }

  try {
    if (window.ACCOUNTING_CORE) {
      const rev = window.ACCOUNTING_CORE.reverseEntry(entryId, reason, 'accountant@afield.local');
      if (window.AUDIT_LOGGER) {
        await window.AUDIT_LOGGER.logFinancialAdjustment({
          entryId: rev.id,
          entryNo: rev.entry_no,
          adjustmentType: 'TRANSACTION_REVERSAL',
          amount: rev.amount,
          reason,
          beforeValues: { status: 'Posted' },
          afterValues: { status: 'Reversed', reversal_entry_no: rev.entry_no }
        });
      }
      APP.showToast(`Compensating reversal ${rev.entry_no} posted successfully!`, 'success');
      APP.closeModal('reversal-modal');
      await loadGeneralLedger();
    }
  } catch (err) {
    console.error('Reversal error:', err);
    APP.showToast('Failed to reverse entry: ' + err.message, 'error');
  }
}

async function onTxnLinkTypeChange() {
  const type = document.getElementById('txn-link-type')?.value;
  const wrap = document.getElementById('txn-linked-doc-wrap');
  const sel = document.getElementById('txn-linked-doc-select');
  const label = document.getElementById('txn-linked-doc-label');
  if (!wrap || !sel) return;

  if (!type) {
    wrap.style.display = 'none';
    sel.innerHTML = '<option value="">Select Document...</option>';
    return;
  }

  wrap.style.display = 'block';
  sel.innerHTML = '<option value="">Loading documents...</option>';

  const companyId = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getActiveCompanyId() : 1;

  if (type === 'purchase') {
    label.textContent = 'Select Supplier Purchase Bill';
    try {
      let q = window.dbClient ? window.dbClient.from('purchases').select('id, purchase_no, supplier_name, total_amount, paid_amount, status').order('id', { ascending: false }) : null;
      if (q && window.TENANT_CONTEXT) q = window.TENANT_CONTEXT.filter(q);
      const res = q ? await q : { data: [] };
      pendingPurchasesList = res.data || [];
      if (pendingPurchasesList.length === 0) {
        sel.innerHTML = '<option value="">No purchase bills found</option>';
      } else {
        sel.innerHTML = '<option value="">Select Purchase Bill...</option>' + 
          pendingPurchasesList.map(p => {
            const due = (parseFloat(p.total_amount) || 0) - (parseFloat(p.paid_amount) || 0);
            return `<option value="${p.id}">${p.purchase_no || 'PO-' + p.id} - ${p.supplier_name || 'Vendor'} (Due: ${due > 0 ? UTILS.fmtCurrency(due) : '₹0.00'})</option>`;
          }).join('');
      }
    } catch (e) {
      sel.innerHTML = '<option value="">Failed to load purchases</option>';
    }
  } else if (type === 'order') {
    label.textContent = 'Select Customer Sales Order / Invoice';
    try {
      let q = window.dbClient ? window.dbClient.from('orders').select('id, order_no, client_name, total_amount, paid_amount, status').order('id', { ascending: false }) : null;
      if (q && window.TENANT_CONTEXT) q = window.TENANT_CONTEXT.filter(q);
      const res = q ? await q : { data: [] };
      pendingOrdersList = res.data || [];
      if (pendingOrdersList.length === 0) {
        sel.innerHTML = '<option value="">No sales orders found</option>';
      } else {
        sel.innerHTML = '<option value="">Select Sales Order...</option>' + 
          pendingOrdersList.map(o => {
            const due = (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0);
            return `<option value="${o.id}">${o.order_no || 'ORD-' + o.id} - ${o.client_name || 'Client'} (Due: ${due > 0 ? UTILS.fmtCurrency(due) : '₹0.00'})</option>`;
          }).join('');
      }
    } catch (e) {
      sel.innerHTML = '<option value="">Failed to load orders</option>';
    }
  }
}

function onLinkedDocSelectChange() {
  const linkType = document.getElementById('txn-link-type')?.value;
  const docId = document.getElementById('txn-linked-doc-select')?.value;
  if (!docId) return;

  const partyInp = document.getElementById('txn-party-name');
  const refInp = document.querySelector('input[name="ref_no"]');
  const amtInp = document.querySelector('input[name="amount"]');

  if (linkType === 'purchase') {
    const p = pendingPurchasesList.find(x => String(x.id) === String(docId));
    if (p) {
      if (partyInp) partyInp.value = p.supplier_name || '';
      if (refInp) refInp.value = p.purchase_no || ('PO-' + p.id);
      const due = (parseFloat(p.total_amount) || 0) - (parseFloat(p.paid_amount) || 0);
      if (amtInp && due > 0) amtInp.value = due;
      const typeSelect = document.getElementById('txn-type-select');
      if (typeSelect) typeSelect.value = 'Payment';
    }
  } else if (linkType === 'order') {
    const o = pendingOrdersList.find(x => String(x.id) === String(docId));
    if (o) {
      if (partyInp) partyInp.value = o.client_name || '';
      if (refInp) refInp.value = o.order_no || ('ORD-' + o.id);
      const due = (parseFloat(o.total_amount) || 0) - (parseFloat(o.paid_amount) || 0);
      if (amtInp && due > 0) amtInp.value = due;
      const typeSelect = document.getElementById('txn-type-select');
      if (typeSelect) typeSelect.value = 'Receipt';
    }
  }
}

// Event Listeners
document.getElementById('search-input')?.addEventListener('input', applyFilters);
document.getElementById('type-filter')?.addEventListener('change', applyFilters);
document.getElementById('account-filter')?.addEventListener('change', applyFilters);

// Expose globals for inline html handlers
window.switchTab = switchTab;
window.openAdd = openAdd;
window.openEdit = openEdit;
window.saveTxn = saveTxn;
window.deleteTxn = deleteTxn;
window.openAddAccount = openAddAccount;
window.closeAccountForm = closeAccountForm;
window.editAccount = editAccount;
window.saveAccount = saveAccount;
window.deleteAccount = deleteAccount;
window.filterByAccount = filterByAccount;

window.loadGeneralLedger = loadGeneralLedger;
window.applyGlFilters = applyGlFilters;
window.renderGlTable = renderGlTable;
window.openReversalModal = openReversalModal;
window.executeTraceableReversal = executeTraceableReversal;
window.onTxnLinkTypeChange = onTxnLinkTypeChange;
window.onLinkedDocSelectChange = onLinkedDocSelectChange;

loadTransactions();
