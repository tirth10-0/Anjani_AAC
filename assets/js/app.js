// Immediate company branding normalization
(function() {
  if (typeof localStorage !== 'undefined') {
    const cName = localStorage.getItem('erp_active_company_name');
    if (!cName || cName === 'Estimate' || cName === 'Afield Crop Care') {
      localStorage.setItem('erp_active_company_name', 'Anjani Agri Care');
    }
    const aName = localStorage.getItem('active_company_name');
    if (!aName || aName === 'Estimate' || aName === 'Afield Crop Care') {
      localStorage.setItem('active_company_name', 'Anjani Agri Care');
    }
    const cCode = localStorage.getItem('erp_active_company_code');
    if (!cCode || cCode === 'E' || cCode === 'ACC') {
      localStorage.setItem('erp_active_company_code', 'AAC');
    }
    const aCode = localStorage.getItem('active_company_code');
    if (!aCode || aCode === 'E' || aCode === 'ACC') {
      localStorage.setItem('active_company_code', 'AAC');
    }
  }
})();
/* ─── app.js ──────────────────────────────────────────── */
/* Sidebar, Topbar, Toast, Modal, Spinner, Navigation      */

// Clean-slate reset for testing from scratch: clear stale mock/buffered data keys from localStorage
(function() {
  const WIPE_VERSION = 'wipe_2026_10_20_clean_slate_v5';
  if (typeof localStorage !== 'undefined' && localStorage.getItem('erp_last_wipe_version') !== WIPE_VERSION) {
    const keysToRemove = [
      'erp_system_notifications',
      'packagingUnits',
      'deletedPackagingUnits',
      'erp_dispatches',
      'erp_dispatch_items',
      'erp_dispatch_reversals',
      'erp_invoices',
      'erp_intercompany_transfers',
      'erp_intercompany_transfer_items',
      'erp_intercompany_relationships',
      'erp_active_company_id',
      'erp_active_company_name',
      'erp_active_company_code'
    ];
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
    try { localStorage.setItem('erp_last_wipe_version', WIPE_VERSION); } catch (_) {}

    if (typeof window !== 'undefined') {
      if (window.NOTIFICATION_SERVICE && typeof window.NOTIFICATION_SERVICE.clearAll === 'function') {
        window.NOTIFICATION_SERVICE.clearAll();
      }
      if (typeof window.renderTopbarNotifications === 'function') {
        window.renderTopbarNotifications();
      }
    }
  }
})();

// Global Auth check - Cryptographic Supabase Session Enforced
(function() {
  const pathname = window.location.pathname;
  const isLoginPage = pathname.includes('login.html');
  if (isLoginPage) return;

  const isPagesDir = pathname.includes('/pages/');
  const loginUrl = isPagesDir ? '../login.html' : './login.html';

  function redirectToLogin() {
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('admin_user');
    window.location.replace(loginUrl);
  }

  async function verifySession() {
    // If dbClient is not ready yet, wait briefly for database.js / Supabase CDN
    let checks = 0;
    while ((!window.dbClient || !window.dbClient.auth) && checks < 20) {
      await new Promise(r => setTimeout(r, 100));
      checks++;
    }

    if (!window.dbClient || !window.dbClient.auth) {
      console.warn('Supabase DB Client unavailable, redirecting to login.');
      redirectToLogin();
      return;
    }

    try {
      const { data: { session }, error } = await window.dbClient.auth.getSession();
      if (error || !session) {
        redirectToLogin();
        return;
      }

      // Valid session active
      if (session.user?.email) {
        localStorage.setItem('admin_user', session.user.email);
        const nameEl = document.getElementById('user-profile-name');
        if (nameEl) nameEl.textContent = session.user.email.split('@')[0];
      }

      // Listen for session revocation or sign out
      window.dbClient.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_OUT' || !newSession) {
          redirectToLogin();
        }
      });
    } catch (err) {
      console.warn('Session verification exception:', err);
      redirectToLogin();
    }
  }

  verifySession();
})();

/* ── SIDEBAR ─────────────────────────────────────────── */
let sidebarEl = document.getElementById('sidebar');
let mainContentEl = document.getElementById('main-content');
let topbarEl = document.getElementById('topbar');
let sidebarOverlay = document.getElementById('sidebar-overlay');
let sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const THEME_STORAGE_KEY = 'theme';

let sidebarPinned = localStorage.getItem('sidebar_pinned') !== 'false';

function updateSidebarReferences() {
  sidebarEl = document.getElementById('sidebar');
  mainContentEl = document.getElementById('main-content');
  topbarEl = document.getElementById('topbar');
  sidebarOverlay = document.getElementById('sidebar-overlay');
  // Toggle button is now inside the sidebar header
  sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
}

function applySidebarState() {
  if (!sidebarEl) return;
  if (window.innerWidth <= 768) {
    sidebarEl.classList.remove('collapsed');
    sidebarEl.classList.remove('pinned');
    mainContentEl?.classList.remove('sidebar-collapsed');
    topbarEl?.classList.remove('sidebar-collapsed');
    document.documentElement.classList.remove('sidebar-collapsed-mode');
    updateSidebarControls();
    return;
  }
  
  // On laptops and desktops, always force the sidebar to be fully expanded and pinned
  sidebarEl.classList.remove('collapsed');
  sidebarEl.classList.add('pinned');
  mainContentEl?.classList.remove('sidebar-collapsed');
  topbarEl?.classList.remove('sidebar-collapsed');
  document.documentElement.classList.remove('sidebar-collapsed-mode');
  
  closeMobileSidebar();
  updateSidebarControls();
}

function toggleSidebarMode() {
  if (!sidebarEl) return;
  if (window.innerWidth <= 768) {
    const isOpen = sidebarEl.classList.toggle('mobile-open');
    sidebarOverlay?.classList.toggle('active', isOpen);
    document.body.classList.toggle('sidebar-mobile-open', isOpen);
    updateSidebarControls();
  } else {
    // Force sidebar to stay pinned on desktop/laptop
    sidebarPinned = true;
    localStorage.setItem('sidebar_pinned', 'true');
    applySidebarState();
  }
}

function toggleSidebar() {
  toggleSidebarMode();
}

function updateSidebarControls() {
  const isMobile = window.innerWidth <= 768;
  const mobileOpen = !!sidebarEl?.classList.contains('mobile-open');

  if (sidebarToggleBtn) {
    const label = isMobile
      ? (mobileOpen ? 'Close sidebar' : 'Open sidebar')
      : (sidebarPinned ? 'Collapse sidebar' : 'Expand sidebar');
    sidebarToggleBtn.setAttribute('aria-label', label);
    sidebarToggleBtn.setAttribute('title', label);
    sidebarToggleBtn.classList.toggle('active', mobileOpen || (!isMobile && sidebarPinned));
  }

  if (sidebarEl) {
    sidebarEl.setAttribute('aria-hidden', isMobile && !mobileOpen ? 'true' : 'false');
  }
}

function closeMobileSidebar() {
  sidebarEl?.classList.remove('mobile-open');
  sidebarOverlay?.classList.remove('active');
  document.body.classList.remove('sidebar-mobile-open');
  updateSidebarControls();
}

/* ── THEME ───────────────────────────────────────────── */
function getTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  return 'light';
}

function setTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  updateThemeToggleButton();
}

function updateThemeToggleButton() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (!themeToggleBtn) return;

  const currentTheme = document.documentElement.getAttribute('data-theme') || getTheme();
  const isDark = currentTheme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  themeToggleBtn.setAttribute('aria-label', label);
  themeToggleBtn.setAttribute('title', label);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || getTheme();
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
}

function initTheme() {
  setTheme(getTheme());
}

/* ── COLLAPSED SIDEBAR HOVER PUSH ────────────────────── */
/* When collapsed sidebar is hovered, push content right so it doesn't overlap */
function setupCollapsedHoverPush() {
  if (!sidebarEl) return;

  sidebarEl.addEventListener('mouseenter', () => {
    if (window.innerWidth <= 768) return;
    if (!sidebarEl.classList.contains('collapsed')) return;
    // Temporarily give main-content the full sidebar margin
    if (mainContentEl) mainContentEl.style.marginLeft = 'var(--sidebar-w)';
    if (topbarEl) topbarEl.style.left = 'var(--sidebar-w)';
  });

  sidebarEl.addEventListener('mouseleave', () => {
    if (window.innerWidth <= 768) return;
    if (!sidebarEl.classList.contains('collapsed')) return;
    // Revert to collapsed margin
    if (mainContentEl) mainContentEl.style.marginLeft = '';
    if (topbarEl) topbarEl.style.left = '';
  });
}

/* ── ACTIVE NAV ──────────────────────────────────────── */
function setActiveNav() {
  const isInvoiceBuilder = window.location.pathname.includes('Invoice Builder');
  const path = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    const isActive = isInvoiceBuilder ? href.includes('Invoice Builder') : (href === path);
    item.classList.toggle('active', isActive);
  });
}

function restoreSidebarScroll() {
  // Always keep sidebar starting at top so Dashboard & Masters are always visible
  const nav = document.querySelector('.sidebar-nav');
  if (nav) {
    nav.scrollTop = 0;
  }
}

function setupNavClickHandlers() {
  document.querySelectorAll('.nav-item[href]').forEach(item => {
    const label = item.querySelector('.nav-label')?.textContent?.trim();
    if (label) item.setAttribute('data-tooltip', label);
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeMobileSidebar();
    });
  });
}

/* ── TOAST SYSTEM ────────────────────────────────────── */
const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${ICONS[type]}</div>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">${ICONS.error}</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function resetModalScroll(overlay) {
  if (!overlay) return;
  overlay.scrollTop = 0;
  const modalScrolls = overlay.querySelectorAll('.modal, .modal-body, .modal-main-wrap, form, .product-step-panel, .daily-txn-step-panel, .inventory-step-panel');
  modalScrolls.forEach(el => {
    el.scrollTop = 0;
  });
}

/* ── MODAL SYSTEM ────────────────────────────────────── */
function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  if (window.UniversalSearchSelect) window.UniversalSearchSelect.closeAll();
  resetModalScroll(overlay);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  
  // Safety delayed scrolls to cover transition and rendering delay
  setTimeout(() => resetModalScroll(overlay), 50);
  setTimeout(() => resetModalScroll(overlay), 150);
  setTimeout(() => {
    if (window.UniversalSearchSelect) {
      window.UniversalSearchSelect.initAll(overlay);
    }
  }, 80);
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  if (window.UniversalSearchSelect) window.UniversalSearchSelect.closeAll();
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  resetModalScroll(overlay);
  
  // Safety delayed scrolls
  setTimeout(() => resetModalScroll(overlay), 50);
  setTimeout(() => resetModalScroll(overlay), 150);
}

function closeModalOnOverlay(e) {
  // Outside-click backdrop dismissal is permanently disabled across the entire ERP
  // to prevent accidental data loss in data-entry pop-ups, modals, and dialogs.
  // Modals can strictly only be closed via the explicit close (X) button, Cancel button, or form submission.
  if (e && e.target && e.target.classList.contains('modal-overlay')) {
    e.stopPropagation();
  }
  return;
}

/* ── SPINNER ─────────────────────────────────────────── */
function showSpinner() {
  const el = document.getElementById('spinner-overlay');
  el?.classList.add('active');
}

function hideSpinner() {
  const el = document.getElementById('spinner-overlay');
  el?.classList.remove('active');
}

function setButtonLoading(btn, isLoading, loadingText = 'Saving...') {
  const el = typeof btn === 'string' ? document.getElementById(btn) : btn;
  if (!el) return;
  if (isLoading) {
    el.dataset.origHtml = el.innerHTML;
    el.disabled = true;
    el.style.opacity = '0.75';
    el.style.cursor = 'not-allowed';
    el.innerHTML = `<span class="btn-spinner" style="display:inline-block;width:13px;height:13px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;vertical-align:-2px"></span>${loadingText}`;
  } else {
    if (el.dataset.origHtml) {
      el.innerHTML = el.dataset.origHtml;
      delete el.dataset.origHtml;
    }
    el.disabled = false;
    el.style.opacity = '';
    el.style.cursor = '';
  }
}

/* ── USER DROPDOWN ───────────────────────────────────── */
function toggleUserDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  const trigger = document.getElementById('user-avatar-btn');
  const isOpen = dropdown?.classList.toggle('open');
  if (trigger) {
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

function closeUserDropdown() {
  document.getElementById('user-dropdown')?.classList.remove('open');
  document.getElementById('user-avatar-btn')?.setAttribute('aria-expanded', 'false');
}

function openUserProfile() {
  closeUserDropdown();
  window.location.href = 'profile.html';
}

function handleLogout() {
  closeUserDropdown();
  showConfirm('Log out and return to the welcome screen?', async () => {
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('admin_user');
    try {
      if (window.dbClient && window.dbClient.auth) {
        await window.dbClient.auth.signOut();
      }
    } catch (err) {
      console.warn('Logout signOut error:', err);
    }
    showToast('Logged out successfully', 'success', 1800);
    setTimeout(() => {
      window.location.replace(window.location.pathname.includes('/pages/') ? '../login.html' : './login.html');
    }, 300);
  });
}

/* ─── DOUBLE-SUBMISSION PROTECTION ──────────────────────── */
async function guardSubmit(btnOrEl, asyncFn) {
  const el = typeof btnOrEl === 'string' ? document.getElementById(btnOrEl) : btnOrEl;
  if (!el) {
    if (typeof asyncFn === 'function') return await asyncFn();
    return;
  }

  // Prevent duplicate trigger if already submitting
  if (el.dataset.submitting === 'true' || el.disabled) {
    console.warn('[APP.guardSubmit] Duplicate action blocked: transaction is already processing.');
    return;
  }

  el.dataset.submitting = 'true';
  setButtonLoading(el, true);

  try {
    if (typeof asyncFn === 'function') {
      return await asyncFn();
    }
  } catch (err) {
    throw err;
  } finally {
    delete el.dataset.submitting;
    setButtonLoading(el, false);
  }
}

/* ── CONFIRM DIALOG ──────────────────────────────────── */
let confirmCallback = null;
let confirmCancelCallback = null;

function showConfirm(message, onConfirm, options = {}) {
  const titleEl = document.getElementById('confirm-modal-title');
  if (titleEl) titleEl.textContent = options.title || 'Confirm Action';
  const okBtn = document.getElementById('confirm-ok-btn');
  if (okBtn) {
    okBtn.textContent = options.confirmText || 'Confirm';
    if (options.isDanger) {
      okBtn.style.backgroundColor = '#dc2626';
      okBtn.style.borderColor = '#b91c1c';
      okBtn.style.color = '#ffffff';
    } else {
      okBtn.style.backgroundColor = '';
      okBtn.style.borderColor = '';
      okBtn.style.color = '';
    }
  }
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Cancel';
  const el = document.getElementById('confirm-message');
  if (el) el.innerHTML = message;
  confirmCallback = onConfirm;
  confirmCancelCallback = typeof options.onCancel === 'function' ? options.onCancel : null;
  openModal('confirm-modal');
}

async function handleConfirmOk() {
  console.log('handleConfirmOk executed. confirmCallback is:', typeof confirmCallback);
  const cb = confirmCallback;
  confirmCallback = null;
  confirmCancelCallback = null;
  closeModal('confirm-modal');
  if (typeof cb === 'function') {
    try {
      await cb();
    } catch (err) {
      console.error('Error in confirmCallback execution:', err);
    }
  }
}

function handleConfirmCancel() {
  const cancelCb = confirmCancelCallback;
  confirmCallback = null;
  confirmCancelCallback = null;
  closeModal('confirm-modal');
  if (typeof cancelCb === 'function') {
    try {
      cancelCb();
    } catch (err) {
      console.error('Error in confirmCancelCallback execution:', err);
    }
  }
}

function shouldAutoFormatField(field) {
  if (!field || field.readOnly || field.disabled) return false;

  const tagName = (field.tagName || '').toUpperCase();
  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') return false;

  const type = String(field.type || '').toLowerCase();
  if (['number', 'date', 'email', 'search', 'checkbox', 'radio', 'hidden', 'file', 'password'].includes(type)) {
    return false;
  }

  if (field.id === 'search-input' || field.id === 'global-search') return false;
  return true;
}

function formatFieldValue(field) {
  if (!shouldAutoFormatField(field) || !window.UTILS) return;

  if (window.UTILS.isPhoneFieldName(field.name)) {
    field.placeholder = '98765 43210';
    field.setAttribute('inputmode', 'numeric');
    field.setAttribute('maxlength', '11');
  }

  const rawValue = field.value;
  const selectionStart = typeof field.selectionStart === 'number' ? field.selectionStart : rawValue.length;
  const selectionEnd = typeof field.selectionEnd === 'number' ? field.selectionEnd : rawValue.length;
  const formatted = window.UTILS.normalizeTextValue(field.value, field.name);
  if (rawValue !== formatted) {
    let nextCaret = Math.min(formatted.length, selectionEnd);

    // Preserve logical cursor position for phone fields after auto-inserting the space.
    if (window.UTILS.isPhoneFieldName(field.name)) {
      const digitsBeforeStart = rawValue.slice(0, selectionStart).replace(/\D/g, '').length;
      const digitsBeforeEnd = rawValue.slice(0, selectionEnd).replace(/\D/g, '').length;

      const findCaretForDigitCount = digitCount => {
        if (digitCount <= 0) return 0;
        let seenDigits = 0;
        for (let i = 0; i < formatted.length; i += 1) {
          if (/\d/.test(formatted.charAt(i))) {
            seenDigits += 1;
            if (seenDigits === digitCount) return i + 1;
          }
        }
        return formatted.length;
      };

      const nextStart = findCaretForDigitCount(digitsBeforeStart);
      const nextEnd = findCaretForDigitCount(digitsBeforeEnd);
      nextCaret = nextStart === nextEnd ? nextEnd : Math.min(formatted.length, nextEnd);
    }

    field.value = formatted;
    if (typeof field.setSelectionRange === 'function') {
      field.setSelectionRange(nextCaret, nextCaret);
    }
  }
}

function bindGlobalFieldFormatters() {
  if (document.body?.dataset.globalFieldFormattersBound === 'true') return;

  document.addEventListener('input', e => {
    formatFieldValue(e.target);
  }, true);

  document.addEventListener('blur', e => {
    formatFieldValue(e.target);
  }, true);

  document.body.dataset.globalFieldFormattersBound = 'true';
}

function bindNumberInputWheelLock() {
  if (document.body?.dataset.numberWheelLockBound === 'true') return;

  document.addEventListener('wheel', e => {
    const field = e.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (String(field.type).toLowerCase() !== 'number') return;
    if (document.activeElement !== field) return;

    e.preventDefault();
  }, { passive: false, capture: true });

  document.body.dataset.numberWheelLockBound = 'true';
}

async function runPageLoader({ pageName, loader, statusUpdater, onError, onSuccess, showSpinner = false }) {
  const label = pageName || 'Page';
  console.log(`${label}: load start`);
  if (showSpinner) APP.showSpinner();
  if (typeof statusUpdater === 'function') statusUpdater('Loading...', '#0C3925');

  try {
    const result = await loader();
    if (typeof statusUpdater === 'function') statusUpdater('Ready', '#0C3925');
    if (typeof onSuccess === 'function') onSuccess(result);
    console.log(`${label}: load success`);
    return result;
  } catch (err) {
    console.error(`${label}: load failed`, err);
    if (typeof statusUpdater === 'function') statusUpdater('FAILED', '#EF4444');
    if (typeof onError === 'function') onError(err);
    throw err;
  } finally {
    if (showSpinner) APP.hideSpinner();
    console.log(`${label}: load complete`);
  }
}

/* ── GLOBAL EVENTS ───────────────────────────────────── */
function reattachLayoutEvents() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (overlay.dataset.boundOverlay === 'true') return;
    overlay.addEventListener('click', closeModalOnOverlay);
    overlay.dataset.boundOverlay = 'true';
  });

  if (sidebarOverlay) {
    sidebarOverlay.onclick = closeMobileSidebar;
  }

  // Sidebar toggle inside sidebar header (desktop)
  if (sidebarToggleBtn) {
    sidebarToggleBtn.onclick = toggleSidebar;
  }

  // Mobile-only toggle button in topbar
  const mobileToggleBtn = document.getElementById('sidebar-toggle-mobile-btn');
  if (mobileToggleBtn) {
    mobileToggleBtn.onclick = toggleSidebar;
  }

  const userAvatarBtn = document.getElementById('user-avatar-btn');
  if (userAvatarBtn) {
    userAvatarBtn.onclick = (e) => {
      e.stopPropagation();
      toggleUserDropdown();
    };
  }

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.onclick = toggleTheme;
  }

  const userDropdown = document.getElementById('user-dropdown');
  if (userDropdown) {
    userDropdown.onclick = (e) => e.stopPropagation();
  }

  const profileBtn = document.getElementById('user-profile-btn');
  if (profileBtn) {
    profileBtn.onclick = openUserProfile;
  }

  const logoutBtn = document.getElementById('user-logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = handleLogout;
  }

  const profileDashboardBtn = document.getElementById('profile-go-dashboard-btn');
  if (profileDashboardBtn) {
    profileDashboardBtn.onclick = () => {
      closeModal('profile-modal');
      window.location.href = 'dashboard.html';
    };
  }

  // Event handlers for confirmation modal buttons are managed via global document click event delegation

  bindGlobalFieldFormatters();
  bindNumberInputWheelLock();
  document.querySelectorAll('input, textarea').forEach(formatFieldValue);
}

function initializeDefaultDateFields() {
  if (window.UTILS?.applyDefaultDateInputs) {
    window.UTILS.applyDefaultDateInputs(document, { skipFieldNames: ['due_date'] });
  }
}




document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  applySidebarState();
  setActiveNav();
  setupNavClickHandlers();
  restoreSidebarScroll();

  reattachLayoutEvents();
  setupCollapsedHoverPush();
  initializeDefaultDateFields();

  // Load global custom select UI for better dropdown UX across all pages
  if (!document.querySelector('script[src*="search-select.js"]')) {
    const script = document.createElement('script');
    script.src = '../assets/js/components/search-select.js?v=41';
    script.async = false;
    script.onload = () => {
      if (window.UniversalSearchSelect) window.UniversalSearchSelect.initAll();
    };
    document.body.appendChild(script);
  } else if (window.UniversalSearchSelect) {
    window.UniversalSearchSelect.initAll();
  }

  document.addEventListener('click', (e) => {
    const okBtn = e.target.closest('#confirm-ok-btn');
    if (okBtn) {
      console.log('Confirm OK clicked via event delegation');
      handleConfirmOk();
      return;
    }
    const cancelBtn = e.target.closest('#confirm-cancel-btn');
    if (cancelBtn) {
      console.log('Confirm Cancel clicked via event delegation');
      handleConfirmCancel();
      return;
    }
    closeUserDropdown();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMobileSidebar();
    applySidebarState();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const confirmOpen = document.getElementById('confirm-modal')?.classList.contains('open');
      if (confirmOpen) {
        handleConfirmCancel();
      }
      document.querySelectorAll('.modal-overlay.open').forEach(m => {
        m.classList.remove('open');
        document.body.style.overflow = '';
        resetModalScroll(m);
      });
      if (window.UniversalSearchSelect) window.UniversalSearchSelect.closeAll();
      closeUserDropdown();
      closeMobileSidebar();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      toggleSidebar();
    }
  });
});

window.APP = {
  showToast,
  openModal,
  closeModal,
  showSpinner,
  hideSpinner,
  setButtonLoading,
  guardSubmit,
  showConfirm,
  handleConfirmOk,
  handleConfirmCancel,
  openUserProfile,
  handleLogout,
  runPageLoader,
  toggleTheme,
  setTheme
};
