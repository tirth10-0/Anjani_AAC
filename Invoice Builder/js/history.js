/**
 * ==============================================================================
 * js/history.js — Premium Invoice History Logic
 * Anjani Agri Care ERP
 * 
 * Fetches invoices, categorizes Regular vs Dispatch, renders metric cards,
 * segmented category tabs, desktop table, and responsive mobile cards.
 * ==============================================================================
 */

'use strict';

let allInvoices = [];
let currentCategory = 'all'; // 'all' | 'regular' | 'dispatch'
let currentSearch = '';

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

    try {
        setupEventListeners();
        loadHistoryTable();
    } catch (err) {
        console.error('History initialization error:', err);
    }
});

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('history-search');
    const clearBtn = document.getElementById('search-clear-btn');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            if (clearBtn) clearBtn.style.display = currentSearch ? 'flex' : 'none';
            applyFilterAndSearch();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }

    // Segmented category tabs
    const tabAll = document.getElementById('tab-all');
    const tabRegular = document.getElementById('tab-regular');
    const tabDispatch = document.getElementById('tab-dispatch');

    if (tabAll) tabAll.addEventListener('click', () => setCategory('all'));
    if (tabRegular) tabRegular.addEventListener('click', () => setCategory('regular'));
    if (tabDispatch) tabDispatch.addEventListener('click', () => setCategory('dispatch'));
}

function clearSearch() {
    const searchInput = document.getElementById('history-search');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    currentSearch = '';
    applyFilterAndSearch();
}
window.clearHistorySearch = clearSearch;

function setCategory(cat) {
    currentCategory = cat;

    // Update active tab styling
    document.querySelectorAll('.segment-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-category') === cat) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyFilterAndSearch();
}
window.selectCategory = setCategory;

/**
 * Distinguish invoice type reliably:
 * - Dispatch: originates from Orders Dispatch workflow, source === 'dispatch', or has dispatchNo, or INV- prefix, or DSP prefix
 * - Regular: created directly in Invoice Builder (numeric sequence e.g. 100, 101, 104)
 */
function getInvoiceType(inv) {
    if (!inv) return 'regular';
    const numStr = String(inv.invoiceNumber || inv.uniqueId || '').trim();
    if (
        inv.source === 'dispatch' ||
        Boolean(inv.dispatchNo) ||
        /^INV-\d+/i.test(numStr) ||
        /^DSP/i.test(numStr)
    ) {
        return 'dispatch';
    }
    return 'regular';
}

function parseInvoiceNumberForSort(inv) {
    const numStr = String(inv.invoiceNumber || inv.InvoiceNumber || inv.uniqueId || '').trim();
    const digits = numStr.replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
}

function sortInvoicesHigherToLower(list) {
    return [...list].sort((a, b) => {
        const numA = parseInvoiceNumberForSort(a);
        const numB = parseInvoiceNumberForSort(b);
        if (numA !== numB) {
            return numB - numA;
        }
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
    });
}

async function loadHistoryTable() {
    const loadingRow = document.getElementById('loading-row');
    const errorRow = document.getElementById('error-row');
    const emptyRow = document.getElementById('empty-row');
    const mobContainer = document.getElementById('history-mobile-cards');

    // 1. Instant Cache Load (Optimistic UI)
    try {
        const cached = typeof safeStorage !== 'undefined' ? safeStorage.getItem('invoice_history_cache') : null;
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
                const seen = new Set();
                const deduplicated = parsed.filter(inv => {
                    const uid = String(inv.uniqueId || inv.invoiceNumber || '').trim();
                    if (!uid || seen.has(uid)) return false;
                    seen.add(uid);
                    return true;
                });
                allInvoices = sortInvoicesHigherToLower(deduplicated);
                if (allInvoices.length > 0) {
                    if (loadingRow) loadingRow.style.display = 'none';
                    updateMetrics(allInvoices);
                    applyFilterAndSearch();
                }
            }
        }
    } catch (_) {}

    if (errorRow) errorRow.style.display = 'none';
    if (emptyRow) emptyRow.style.display = 'none';

    // 2. Silent Background Synchronization
    try {
        const freshInvoices = await apiGetInvoices();
        const seen = new Set();
        const deduplicated = (freshInvoices || []).filter(inv => {
            const uid = String(inv.uniqueId || inv.invoiceNumber || '').trim();
            if (!uid || seen.has(uid)) return false;
            seen.add(uid);
            return true;
        });

        allInvoices = sortInvoicesHigherToLower(deduplicated);
        if (typeof safeStorage !== 'undefined') {
            safeStorage.setItem('invoice_history_cache', JSON.stringify(allInvoices));
        }

        if (loadingRow) loadingRow.style.display = 'none';
        updateMetrics(allInvoices);
        applyFilterAndSearch();

    } catch (err) {
        console.error('History fetch error:', err);
        if (loadingRow) loadingRow.style.display = 'none';
        if (allInvoices.length === 0) {
            if (errorRow) {
                errorRow.style.display = '';
                const msg = document.getElementById('error-msg');
                if (msg) msg.textContent = 'Failed to load invoices: ' + (err.message || 'Server error');
            }
            if (mobContainer) {
                mobContainer.innerHTML = `
                    <div class="empty-state-box" style="background:#fff;border-radius:14px;border:1px solid #E2E8F0;padding:40px 16px;">
                        <span class="material-symbols-outlined empty-state-icon" style="color:#EF4444;">error</span>
                        <div class="empty-state-title" style="color:#DC2626;">Failed to load invoices</div>
                        <div class="empty-state-text">${escapeHTML(err.message || 'Please check your connection and retry.')}</div>
                        <button type="button" class="btn-action-open" onclick="loadHistoryTable()" style="margin-top:12px;">Retry</button>
                    </div>
                `;
            }
        }
    }
}

function updateMetrics(invoices) {
    const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    let totalCount = invoices.length;
    let regularCount = 0;
    let dispatchCount = 0;
    let totalValue = 0;

    invoices.forEach(inv => {
        const type = getInvoiceType(inv);
        if (type === 'dispatch') {
            dispatchCount++;
        } else {
            regularCount++;
        }
        const amt = parseFloat(inv.totalAmount || inv.GrandTotal || 0) || 0;
        totalValue += amt;
    });

    const elTotal = document.getElementById('metric-total-count');
    const elReg = document.getElementById('metric-regular-count');
    const elDisp = document.getElementById('metric-dispatch-count');
    const elVal = document.getElementById('metric-total-amount');

    if (elTotal) elTotal.textContent = totalCount;
    if (elReg) elReg.textContent = regularCount;
    if (elDisp) elDisp.textContent = dispatchCount;
    if (elVal) elVal.textContent = '₹' + INR.format(totalValue);

    // Segmented tab badges
    const bAll = document.getElementById('badge-count-all');
    const bReg = document.getElementById('badge-count-regular');
    const bDisp = document.getElementById('badge-count-dispatch');

    if (bAll) bAll.textContent = totalCount;
    if (bReg) bReg.textContent = regularCount;
    if (bDisp) bDisp.textContent = dispatchCount;
}

function applyFilterAndSearch() {
    let filtered = [...allInvoices];

    // 1. Category filter
    if (currentCategory === 'regular') {
        filtered = filtered.filter(inv => getInvoiceType(inv) === 'regular');
    } else if (currentCategory === 'dispatch') {
        filtered = filtered.filter(inv => getInvoiceType(inv) === 'dispatch');
    }

    // 2. Search filter
    if (currentSearch) {
        const lower = currentSearch.toLowerCase();
        filtered = filtered.filter(inv => {
            const pool = `${inv.customerName || ''} ${inv.invoiceNumber || ''} ${inv.uniqueId || ''} ${inv.dispatchNo || ''} ${inv.mobile || ''}`.toLowerCase();
            return pool.includes(lower);
        });
    }

    // 3. Update summary text
    const summaryText = document.getElementById('history-summary-text');
    if (summaryText) {
        const catName = currentCategory === 'regular' ? 'regular' : (currentCategory === 'dispatch' ? 'dispatch' : 'total');
        if (currentSearch) {
            summaryText.textContent = `Showing ${filtered.length} of ${allInvoices.length} invoices (filtered)`;
        } else if (currentCategory !== 'all') {
            summaryText.textContent = `Showing ${filtered.length} ${catName} invoices`;
        } else {
            summaryText.textContent = `Showing all ${filtered.length} invoices`;
        }
    }

    renderHistoryRows(filtered);
}

function renderHistoryRows(invoices) {
    const tbody = document.getElementById('history-tbody');
    const mobContainer = document.getElementById('history-mobile-cards');
    const emptyRow = document.getElementById('empty-row');
    const loadingRow = document.getElementById('loading-row');
    const errorRow = document.getElementById('error-row');

    if (loadingRow) loadingRow.style.display = 'none';
    if (errorRow) errorRow.style.display = 'none';

    // Clear existing data rows
    if (tbody) {
        const rows = tbody.querySelectorAll('tr:not(#loading-row):not(#error-row):not(#empty-row)');
        rows.forEach(r => r.remove());
    }
    if (mobContainer) {
        mobContainer.innerHTML = '';
    }

    if (invoices.length === 0) {
        if (emptyRow) {
            emptyRow.style.display = '';
            const emptyTitle = document.getElementById('empty-title');
            const emptyDesc = document.getElementById('empty-desc');
            if (currentSearch) {
                if (emptyTitle) emptyTitle.textContent = 'No Invoices Matching Search';
                if (emptyDesc) emptyDesc.textContent = `No results found for "${currentSearch}". Try a different keyword or clear search.`;
            } else if (currentCategory !== 'all') {
                if (emptyTitle) emptyTitle.textContent = `No ${currentCategory === 'regular' ? 'Regular' : 'Dispatch'} Invoices Found`;
                if (emptyDesc) emptyDesc.textContent = `There are currently no ${currentCategory === 'regular' ? 'regular' : 'dispatch'} invoices recorded.`;
            } else {
                if (emptyTitle) emptyTitle.textContent = 'No Invoices Found';
                if (emptyDesc) emptyDesc.textContent = 'Save an invoice in the builder to see it here.';
            }
        }

        if (mobContainer) {
            const title = currentSearch 
                ? 'No Invoices Matching Search' 
                : (currentCategory !== 'all' ? `No ${currentCategory === 'regular' ? 'Regular' : 'Dispatch'} Invoices` : 'No Invoices Found');
            const desc = currentSearch 
                ? `No results for "${escapeHTML(currentSearch)}".` 
                : (currentCategory !== 'all' ? `No ${currentCategory} invoices recorded.` : 'Save an invoice in the builder to see it here.');
            
            mobContainer.innerHTML = `
                <div class="empty-state-box" style="background:#fff;border-radius:14px;border:1px solid #E2E8F0;">
                    <span class="material-symbols-outlined empty-state-icon">receipt_long</span>
                    <div class="empty-state-title">${title}</div>
                    <div class="empty-state-text">${desc}</div>
                </div>
            `;
        }
        return;
    }

    if (emptyRow) emptyRow.style.display = 'none';

    const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    invoices.forEach(inv => {
        const type = getInvoiceType(inv);
        const isDispatch = type === 'dispatch';

        // Formatted Date
        let dateStr = inv.date;
        try {
            if (dateStr) {
                const normalized = String(dateStr).slice(0, 10);
                const d = new Date(`${normalized}T12:00:00+05:30`);
                dateStr = d.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
            }
        } catch (_) {}

        const amtVal = parseFloat(inv.totalAmount || inv.GrandTotal || 0) || 0;
        const amtStr = '₹' + INR.format(amtVal);

        const typeBadgeHTML = isDispatch
            ? `<span class="type-badge badge-dispatch"><span class="badge-dot"></span>Dispatch</span>`
            : `<span class="type-badge badge-regular"><span class="badge-dot"></span>Regular</span>`;

        // ── 1. Desktop Table Row ──
        if (tbody) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="inv-num-cell">${escapeHTML(inv.invoiceNumber || '—')}</span>
                </td>
                <td>
                    ${typeBadgeHTML}
                </td>
                <td>
                    <span class="date-cell">${escapeHTML(dateStr || '—')}</span>
                </td>
                <td>
                    <div class="customer-cell-box">
                        <span class="customer-name-heading">${escapeHTML(inv.customerName || 'Unknown')}</span>
                        ${inv.dispatchNo ? `<span class="customer-dispatch-sub"><span class="material-symbols-outlined" style="font-size:13px">local_shipping</span> Dispatch #${escapeHTML(inv.dispatchNo)}</span>` : ''}
                    </div>
                </td>
                <td>
                    ${inv.mobile ? `<span class="mobile-cell-wrap"><span class="material-symbols-outlined">call</span>${escapeHTML(inv.mobile)}</span>` : '<span style="color:#94A3B8;">—</span>'}
                </td>
                <td style="text-align:right;">
                    <span class="amount-cell-bold">${amtStr}</span>
                </td>
                <td style="text-align:right;">
                    <div class="actions-group">
                        <button type="button" class="btn-action-open" onclick="openInvoice('${escapeHTML(inv.uniqueId)}')" title="Open invoice">
                            <span class="material-symbols-outlined">edit_square</span>
                            <span>Open</span>
                        </button>
                        <button type="button" class="btn-action-delete" onclick="deleteInvoice('${escapeHTML(inv.uniqueId)}')" title="Delete invoice">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        // ── 2. Mobile Responsive Card ──
        if (mobContainer) {
            const card = document.createElement('div');
            card.className = 'history-mob-card';
            card.innerHTML = `
                <div class="mob-card-head">
                    <div class="mob-card-inv-badge">
                        <span class="mob-inv-num">${escapeHTML(inv.invoiceNumber || '—')}</span>
                        ${typeBadgeHTML}
                    </div>
                    <div class="mob-card-amount">${amtStr}</div>
                </div>

                <div class="mob-card-body">
                    <div class="mob-card-customer">${escapeHTML(inv.customerName || 'Unknown')}</div>
                    <div class="mob-card-meta">
                        <span class="mob-meta-pill">
                            <span class="material-symbols-outlined">calendar_today</span>
                            <span>${escapeHTML(dateStr || '—')}</span>
                        </span>
                        ${inv.mobile ? `
                        <span class="mob-meta-pill">
                            <span class="material-symbols-outlined">call</span>
                            <span>${escapeHTML(inv.mobile)}</span>
                        </span>` : ''}
                    </div>
                    ${inv.dispatchNo ? `
                    <div style="font-size:12px;color:#059669;font-weight:600;display:flex;align-items:center;gap:4px;margin-top:2px;">
                        <span class="material-symbols-outlined" style="font-size:14px">local_shipping</span>
                        <span>Dispatch #${escapeHTML(inv.dispatchNo)}</span>
                    </div>` : ''}
                </div>

                <div class="mob-card-foot">
                    <button type="button" class="mob-btn-open" onclick="openInvoice('${escapeHTML(inv.uniqueId)}')">
                        <span class="material-symbols-outlined">edit_square</span>
                        <span>Open Invoice</span>
                    </button>
                    <button type="button" class="mob-btn-delete" onclick="deleteInvoice('${escapeHTML(inv.uniqueId)}')" title="Delete invoice">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            `;
            mobContainer.appendChild(card);
        }
    });
}

function openInvoice(uniqueId) {
    if (!uniqueId) return;
    window.location.href = `index.html#edit=${encodeURIComponent(uniqueId)}`;
}
window.openInvoice = openInvoice;

async function deleteInvoice(uniqueId) {
    if (!uniqueId) return;
    const inv = allInvoices.find(i => String(i.uniqueId) === String(uniqueId) || String(i.invoiceNumber) === String(uniqueId));
    const invLabel = inv ? (inv.invoiceNumber || uniqueId) : uniqueId;

    if (!confirm(`Are you sure you want to delete invoice ${invLabel}? This action cannot be undone.`)) {
        return;
    }

    // 1. Optimistic UI Removal
    const backupInvoices = [...allInvoices];
    allInvoices = allInvoices.filter(i => String(i.uniqueId) !== String(uniqueId) && String(i.invoiceNumber) !== String(uniqueId));

    updateMetrics(allInvoices);
    applyFilterAndSearch();

    if (typeof safeStorage !== 'undefined') {
        safeStorage.setItem('invoice_history_cache', JSON.stringify(allInvoices));
    }

    // 2. Perform Backend Request
    try {
        const result = await apiDeleteInvoice(uniqueId);
        if (!result || !result.success) {
            throw new Error(result && result.message ? result.message : 'Deletion failed on server');
        }
    } catch (err) {
        console.error('Delete invoice error:', err);
        alert('Delete failed: ' + (err.message || 'Server connection failed. Deletion rolled back.'));
        allInvoices = backupInvoices;
        if (typeof safeStorage !== 'undefined') {
            safeStorage.setItem('invoice_history_cache', JSON.stringify(allInvoices));
        }
        updateMetrics(allInvoices);
        applyFilterAndSearch();
    }
}
window.deleteInvoice = deleteInvoice;

function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}
