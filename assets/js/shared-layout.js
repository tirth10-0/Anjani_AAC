
// Universal Hard Reload & Cache Purge for Mobile & Desktop
window.hardReloadApp = async function() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (err) {
    console.warn('Cache clear error:', err);
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_refresh', Date.now());
  window.location.replace(url.toString());
};

/* Injects sidebar + topbar into every page dynamically   */
(function() {
  localStorage.setItem('sidebar_pinned', 'true');

  let storedTheme = localStorage.getItem('theme');
  if (storedTheme !== 'light') {
    storedTheme = 'light';
    localStorage.setItem('theme', 'light');
  }
  document.documentElement.setAttribute('data-theme', 'light');
})();

function getLogoUrl() {
  const isPagesDir = window.location.pathname.includes('/pages/');
  return isPagesDir ? '../assets/images/logo.jpg' : './assets/images/logo.jpg';
}

function getActiveCompanyName() {
  if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getActiveCompany) {
    const act = window.TENANT_CONTEXT.getActiveCompany();
    if (act && act.name) {
      if (act.name === 'Estimate' || act.name === 'Afield Crop Care') act.name = 'Anjani Agri Care';
      return act.name;
    }
  }
  const stored = localStorage.getItem('erp_active_company_name');
  if (stored === 'Estimate' || stored === 'Afield Crop Care' || !stored) {
    localStorage.setItem('erp_active_company_name', 'Anjani Agri Care');
    return 'Anjani Agri Care';
  }
  return stored;
}

function getActiveCompanyCode() {
  if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getActiveCompany) {
    const act = window.TENANT_CONTEXT.getActiveCompany();
    if (act && act.code) {
      if (act.code === 'E' || act.code === 'ACC') act.code = 'AAC';
      return act.code;
    }
  }
  const stored = localStorage.getItem('erp_active_company_code');
  if (stored === 'E' || stored === 'ACC' || !stored) {
    localStorage.setItem('erp_active_company_code', 'AAC');
    return 'AAC';
  }
  return stored;
}

function getActiveCompanyId() {
  if (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getCompanyId) {
    return window.TENANT_CONTEXT.getCompanyId();
  }
  const stored = localStorage.getItem('erp_active_company_id');
  return stored ? parseInt(stored, 10) : 1;
}

function getInvoiceBuilderUrl() {
  const isPagesDir = window.location.pathname.includes('/pages/');
  return isPagesDir ? '../Invoice Builder/index.html' : './Invoice Builder/index.html';
}

const SIDEBAR_HTML = (logoUrl = getLogoUrl()) => `
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-logo">
      <img src="${logoUrl}" alt="ERP">
    </div>
    <div class="sidebar-brand"><h1 id="sidebar-brand-name">${getActiveCompanyName()}</h1><span>Crop Care Management</span></div>
    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" type="button" aria-label="Toggle sidebar" title="Toggle sidebar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
    </button>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-section-label">Overview</div>
    <a href="dashboard.html" class="nav-item" data-page="dashboard.html" data-tooltip="Dashboard"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span><span class="nav-label">Dashboard</span></a>
    
    <div class="nav-section-label">Masters</div>
    <a href="products.html" class="nav-item" data-page="products.html" data-tooltip="Products"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span><span class="nav-label">Products</span></a>
    <a href="inventory.html" class="nav-item" data-page="inventory.html" data-tooltip="Inventory"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span><span class="nav-label">Inventory</span></a>
    <a href="clients.html" class="nav-item" data-page="clients.html" data-tooltip="Clients"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span class="nav-label">Clients</span></a>
    <a href="suppliers.html" class="nav-item" data-page="suppliers.html" data-tooltip="Suppliers"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></span><span class="nav-label">Suppliers</span></a>

    <div class="nav-section-label">Operations</div>
    <a href="orders.html" class="nav-item" data-page="orders.html" data-tooltip="Orders"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></span><span class="nav-label">Orders</span></a>
    <a href="purchases.html" class="nav-item" data-page="purchases.html" data-tooltip="Purchases"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg></span><span class="nav-label">Purchases</span></a>
    <a href="production.html" class="nav-item" data-page="production.html" data-tooltip="Production"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span><span class="nav-label">Production</span></a>
    <a href="formulations.html" class="nav-item" data-page="formulations.html" data-tooltip="Formulations"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg></span><span class="nav-label">Formulations</span></a>
    <a href="daily-transactions.html" class="nav-item" data-page="daily-transactions.html" data-tooltip="Daily Stock Usage"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg></span><span class="nav-label">Daily Stock Usage</span></a>

    <div class="nav-section-label">Enterprise & Locations</div>
    <a href="companies.html" class="nav-item" data-page="companies.html" data-tooltip="Companies & Branches"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg></span><span class="nav-label">Companies & Branches</span></a>
    <a href="warehouses.html" class="nav-item" data-page="warehouses.html" data-tooltip="Warehouses"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg></span><span class="nav-label">Warehouses</span></a>

    <div class="nav-section-label">Finance & Reports</div>
    <a href="transactions.html" class="nav-item" data-page="transactions.html" data-tooltip="Cash & Bank Ledger"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></span><span class="nav-label">Cash & Bank Ledger</span></a>
    <a href="expenses.html" class="nav-item" data-page="expenses.html" data-tooltip="Expenses"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></span><span class="nav-label">Expenses</span></a>
    <a href="reports.html" class="nav-item" data-page="reports.html" data-tooltip="Business Reports"><span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span class="nav-label">Business Reports</span></a>

    <div class="nav-section-label">System & Tools</div>
    <a href="exports.html" class="nav-item" data-page="exports.html" data-tooltip="Data Backup & Exports">
      <span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
      <span class="nav-label">Data Backup & Exports</span>
    </a>
  </nav>
</aside>
<div class="sidebar-overlay" id="sidebar-overlay"></div>`;

const TOPBAR_HTML = (title, breadcrumb, logoUrl = getLogoUrl()) => `
<header class="topbar" id="topbar">
  <div class="topbar-left">
    <button class="sidebar-toggle-btn sidebar-toggle-mobile" id="sidebar-toggle-mobile-btn" type="button" aria-label="Toggle sidebar" title="Toggle sidebar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
    </button>
    <div class="topbar-mobile-brand" onclick="window.location.href='dashboard.html'" role="button" tabindex="0" title="Go to Dashboard" style="cursor:pointer;">
      <div class="topbar-logo" style="width:28px; height:28px; border-radius:8px; overflow:hidden; background:#ffffff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <img src="${logoUrl}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;">
      </div>
      <span class="topbar-mobile-brand-name" id="topbar-mobile-brand-name">${getActiveCompanyName()}</span>
    </div>
    <div class="topbar-brand">
      <span class="topbar-brand-name" id="topbar-brand-name">${getActiveCompanyName()}</span>
    </div>

    <div class="topbar-divider"></div>
    <div class="topbar-breadcrumb">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;opacity:0.5;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      <span>${title}</span>
    </div>
  </div>
  <div class="topbar-right">
    <!-- Multi-Company Switcher Dropdown -->
    <div class="dropdown topbar-company-dropdown">
      <button class="topbar-company-btn" id="company-switcher-btn" type="button" aria-haspopup="menu" aria-expanded="false" title="Switch Active Company">
        <span class="company-badge-icon">🏢</span>
        <span class="company-name-display" id="topbar-company-name">${getActiveCompanyName()}</span>
        <span class="company-code-badge" id="topbar-company-code">${getActiveCompanyCode()}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;opacity:0.6"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="dropdown-menu dropdown-menu-company" id="company-dropdown-menu" role="menu">
        <div class="company-dropdown-header">SWITCH ACTIVE COMPANY</div>
        <div id="company-list-container">
          <button class="company-dropdown-item active" type="button" onclick="window.TENANT_CONTEXT && window.TENANT_CONTEXT.switchCompany ? window.TENANT_CONTEXT.switchCompany(${getActiveCompanyId()}) : null">
            <div class="company-card-header">
              <span class="company-item-name">${getActiveCompanyName()}</span>
              <span class="company-badge-pill mfg">MANUFACTURER</span>
            </div>
            <div class="company-card-sub">
              <span>Rajkot</span>
              <span class="sub-sep">•</span>
              <span>${getActiveCompanyCode()}</span>
              <span class="sub-sep">•</span>
              <span class="status-current-tag">Current</span>
            </div>
          </button>
        </div>
        <div class="dropdown-divider company-menu-divider"></div>
        <a href="companies.html" class="dropdown-item company-nav-item">
          <svg class="company-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M10 6h4"/>
            <path d="M10 10h4"/>
            <path d="M10 14h4"/>
            <path d="M10 18h4"/>
          </svg>
          <span class="company-nav-label">Companies & Branches</span>
        </a>
        <a href="warehouses.html" class="dropdown-item company-nav-item">
          <svg class="company-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/>
            <path d="M6 18h12"/>
            <path d="M6 14h12"/>
            <rect width="12" height="12" x="6" y="10"/>
          </svg>
          <span class="company-nav-label">Warehouses</span>
        </a>
      </div>
    </div>

    <a href="${getInvoiceBuilderUrl()}" class="topbar-invoice-btn" title="Invoice Builder" aria-label="Invoice Builder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      <span class="btn-text">Invoice Builder</span>
    </a>

    <!-- System Notifications Center Dropdown -->
    <div class="dropdown topbar-notif-dropdown" style="position:relative;">
      <button class="topbar-notif-btn" id="notif-center-btn" type="button" aria-haspopup="menu" aria-expanded="false" title="System Notifications" style="position:relative; background:transparent; border:none; padding:8px 10px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; border-radius:6px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span id="notif-badge" class="notif-badge" style="display:none; position:absolute; top:2px; right:2px; background:#EF4444; color:#fff; font-size:10px; font-weight:800; padding:1px 5px; border-radius:10px; line-height:1.2;">0</span>
      </button>
      <div class="dropdown-menu dropdown-menu-notif" id="notif-dropdown-menu" role="menu" style="min-width:340px; max-width:400px; padding:0; border-radius:8px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.15); flex-direction:column;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#0C3925; color:#ffffff !important;">
          <div style="font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px; color:#ffffff !important;">
            <span style="color:#ffffff !important; font-weight:700;">System Notifications</span>
            <span id="notif-count-pill" style="background:rgba(255,255,255,0.25); color:#ffffff !important; padding:1px 6px; border-radius:10px; font-size:10px;">0</span>
          </div>
          <button type="button" id="notif-mark-all-btn" style="background:transparent; border:none; color:rgba(255,255,255,0.85); font-size:11px; cursor:pointer; text-decoration:underline;">Mark all read</button>
        </div>
        <div id="notif-list-container" style="max-height:360px; overflow-y:auto; padding:6px 0; background:var(--card-bg, #fff);">
          <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">Loading notifications...</div>
        </div>
      </div>
    </div>

    <div class="dropdown">
      <button class="user-avatar-btn" id="user-avatar-btn" type="button" aria-haspopup="menu" aria-expanded="false">
        <div class="user-avatar" id="topbar-user-avatar">AAC</div>
        <span class="user-name" id="topbar-user-name">Admin</span>
        <span class="topbar-role-badge" id="topbar-role-badge" style="display:inline-block; margin-left:4px; font-size:10px; font-weight:700; padding:2px 7px; border-radius:12px; background:rgba(12,57,37,0.12); color:#0C3925; text-transform:uppercase;">Super Admin</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--text-muted)"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="dropdown-menu" id="user-dropdown" role="menu" aria-label="User menu" style="min-width: 140px; padding: 4px;">
        <button class="dropdown-item dropdown-item-danger" id="user-logout-btn" type="button" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout
        </button>
      </div>
    </div>
  </div>
</header>`;

const CONFIRM_MODAL = `
<div class="modal-overlay" id="confirm-modal">
  <div class="modal" style="max-width:420px">
    <div class="modal-header"><span class="modal-title">Confirm Action</span></div>
    <div class="modal-body"><p id="confirm-message">Are you sure?</p></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="confirm-cancel-btn">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok-btn">Confirm</button>
    </div>
  </div>
</div>
<div id="toast-container"></div>
<div class="spinner-overlay" id="spinner-overlay"><div class="spinner"></div></div>
`;

const PROFILE_MODAL = `
<div class="modal-overlay" id="profile-modal">
  <div class="modal" style="max-width:460px">
    <div class="modal-header">
      <span class="modal-title">Profile</span>
      <button class="modal-close" type="button" onclick="APP.closeModal('profile-modal')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div class="user-avatar" style="width:52px;height:52px;font-size:15px;font-weight:800;letter-spacing:-0.5px;">AAC</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text-primary)">Admin</div>
          <div style="font-size:13px;color:var(--text-secondary)">System administrator</div>
        </div>
      </div>
      <div style="display:grid;gap:12px">
        <div style="padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Workspace</div>
          <div style="font-size:14px;font-weight:700;color:#0C3925">Anjani Agri Care</div>
        </div>
        <div style="padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Registered Address</div>
          <div style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1.4">Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.</div>
        </div>
        <div style="padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)">
          <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Access</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">All business modules enabled</div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" type="button" onclick="APP.closeModal('profile-modal')">Close</button>
      <button class="btn btn-primary" type="button" id="profile-go-dashboard-btn">Open Dashboard</button>
    </div>
  </div>
</div>`;

const BOTTOM_NAV_HTML = `
<nav class="mobile-bottom-nav">
  <a href="dashboard.html" class="bottom-nav-item" data-bottom-page="dashboard.html">
    <span class="bottom-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
    <span class="bottom-nav-label">Dashboard</span>
  </a>
  <a href="products.html" class="bottom-nav-item" data-bottom-page="products.html">
    <span class="bottom-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></span>
    <span class="bottom-nav-label">Products</span>
  </a>
  <a href="inventory.html" class="bottom-nav-item" data-bottom-page="inventory.html">
    <span class="bottom-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
    <span class="bottom-nav-label">Inventory</span>
  </a>
  <a href="orders.html" class="bottom-nav-item" data-bottom-page="orders.html">
    <span class="bottom-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg></span>
    <span class="bottom-nav-label">Orders</span>
  </a>
  <button type="button" class="bottom-nav-item" onclick="toggleSidebar(event)">
    <span class="bottom-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg></span>
    <span class="bottom-nav-label">More</span>
  </button>
</nav>
`;

function ensureSingletonMarkup(id, html) {
  const matches = document.querySelectorAll(`#${id}`);
  if (matches.length > 1) {
    matches.forEach((node, index) => {
      if (index > 0) node.remove();
    });
  }

  if (!document.getElementById(id)) {
    document.body.insertAdjacentHTML('beforeend', html);
  }
}

function setActiveBottomNav() {
  const path = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    item.classList.toggle('active', href === path);
  });
}

function setActiveNavFallback() {
  const isInvoiceBuilder = window.location.pathname.includes('Invoice Builder');
  const path = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    const isActive = isInvoiceBuilder ? href.includes('Invoice Builder') : (href === path);
    item.classList.toggle('active', isActive);
  });
}

function applySidebarStateFallback() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth <= 768) {
    sidebar.classList.remove('collapsed', 'pinned');
    document.getElementById('main-content')?.classList.remove('sidebar-collapsed');
    document.getElementById('topbar')?.classList.remove('sidebar-collapsed');
    document.documentElement.classList.remove('sidebar-collapsed-mode');
  } else {
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('pinned');
    document.getElementById('main-content')?.classList.remove('sidebar-collapsed');
    document.getElementById('topbar')?.classList.remove('sidebar-collapsed');
    document.documentElement.classList.remove('sidebar-collapsed-mode');
  }
}

window.toggleSidebar = function(e) {
  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  if (window.innerWidth <= 768) {
    const isOpen = sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active', isOpen);
    document.body.classList.toggle('sidebar-mobile-open', isOpen);
  } else {
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('pinned');
  }
};

window.closeSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
  document.body.classList.remove('sidebar-mobile-open');
};

function injectLayout(title, breadcrumb) {
  const layout = document.getElementById('app-layout');
  if (!layout) return;
  const logoUrl = getLogoUrl();
  layout.insertAdjacentHTML('afterbegin', SIDEBAR_HTML(logoUrl) + TOPBAR_HTML(title, breadcrumb, logoUrl) + BOTTOM_NAV_HTML);
  ensureSingletonMarkup('confirm-modal', CONFIRM_MODAL);
  ensureSingletonMarkup('profile-modal', PROFILE_MODAL);
  ensureSingletonMarkup('toast-container', '<div id="toast-container"></div>');
  ensureSingletonMarkup('spinner-overlay', '<div class="spinner-overlay" id="spinner-overlay"><div class="spinner"></div></div>');
  
  // Update element references after layout is injected
  if (typeof updateSidebarReferences === 'function') {
    updateSidebarReferences();
  }
  
  // Initialize sidebar and navigation after layout is injected
  if (typeof applySidebarState === 'function') {
    applySidebarState();
  } else {
    applySidebarStateFallback();
  }

  if (typeof setActiveNav === 'function') {
    setActiveNav();
  } else {
    setActiveNavFallback();
  }

  if (typeof setActiveBottomNav === 'function') {
    setActiveBottomNav();
  }
  
  if (typeof setupNavClickHandlers === 'function') {
    setupNavClickHandlers();
  }
  
  // Re-attach event listeners
  if (typeof reattachLayoutEvents === 'function') {
    reattachLayoutEvents();
  }

  // Preserve and restore vertical scroll position across navigation
  function restoreSidebarScroll() {
    try {
      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return;
      const savedScroll = sessionStorage.getItem('erp_sidebar_scroll_pos');
      if (savedScroll !== null) {
        const pos = parseInt(savedScroll, 10);
        if (!isNaN(pos) && pos >= 0) {
          nav.scrollTop = pos;
        }
      } else {
        const activeItem = nav.querySelector('.nav-item.active');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    } catch (e) {}
  }

  restoreSidebarScroll();
  requestAnimationFrame(restoreSidebarScroll);
  setTimeout(restoreSidebarScroll, 60);

  // Continuous scroll position tracking
  const navEl = document.querySelector('.sidebar-nav');
  if (navEl) {
    let scrollDebounce = null;
    navEl.addEventListener('scroll', () => {
      clearTimeout(scrollDebounce);
      scrollDebounce = setTimeout(() => {
        try {
          sessionStorage.setItem('erp_sidebar_scroll_pos', String(navEl.scrollTop));
        } catch (_) {}
      }, 50);
    }, { passive: true });
  }

  // Ensure overlay and sidebar navigation links close the drawer on mobile and persist scroll
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.onclick = window.closeSidebar;
  }
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = document.querySelector('.sidebar-nav');
      if (nav) {
        try {
          sessionStorage.setItem('erp_sidebar_scroll_pos', String(nav.scrollTop));
        } catch (_) {}
      }
      if (window.innerWidth <= 768) {
        window.closeSidebar();
      }
    });
  });

  if (!window._sidebarBeforeUnloadAttached) {
    window.addEventListener('beforeunload', () => {
      const nav = document.querySelector('.sidebar-nav');
      if (nav) {
        try {
          sessionStorage.setItem('erp_sidebar_scroll_pos', String(nav.scrollTop));
        } catch (_) {}
      }
    });
    window._sidebarBeforeUnloadAttached = true;
  }

  // Setup PWA install button handler
  setupPwaInstallButton();

  // Initialize Multi-Company Switcher Dropdown
  initCompanySwitcher();

  // Initialize System Notification Center
  initNotificationCenter();

  // Initialize User Profile Dropdown
  initUserDropdown();

  // Initialize RBAC Topbar Badge & Navigation Guard
  initRbacControls();
}

const PAGE_MODULE_MAP = {
  'dashboard.html': 'dashboard',
  'products.html': 'products',
  'inventory.html': 'inventory',
  'clients.html': 'clients',
  'suppliers.html': 'suppliers',
  'orders.html': 'orders',
  'purchases.html': 'purchases',
  'production.html': 'production',
  'formulations.html': 'formulations',
  'daily-transactions.html': 'daily_transactions',
  'companies.html': 'companies',
  'warehouses.html': 'warehouses',
  'transactions.html': 'transactions',
  'expenses.html': 'expenses',
  'reports.html': 'reports',
  'exports.html': 'exports'
};

window.reapplyRbacNav = function() {
  if (!window.RBAC) return;

  const navItems = document.querySelectorAll('.sidebar .nav-item');
  navItems.forEach(item => {
    const page = item.getAttribute('data-page');
    const mod = PAGE_MODULE_MAP[page] || page?.replace('.html', '');
    if (mod) {
      const allowed = window.RBAC.canView(mod);
      item.style.display = allowed ? 'flex' : 'none';
    }
  });

  // Hide empty section headers
  document.querySelectorAll('.sidebar-nav').forEach(nav => {
    let currentLabel = null;
    let visibleCount = 0;
    Array.from(nav.children).forEach(child => {
      if (child.classList.contains('nav-section-label')) {
        if (currentLabel) {
          currentLabel.style.display = visibleCount > 0 ? '' : 'none';
        }
        currentLabel = child;
        visibleCount = 0;
      } else if (child.classList.contains('nav-item')) {
        if (child.style.display !== 'none') visibleCount++;
      }
    });
    if (currentLabel) {
      currentLabel.style.display = visibleCount > 0 ? '' : 'none';
    }
  });

  // Apply DOM button guards
  window.RBAC.applyDomPermissions();
};

function initRbacControls() {
  const updateBadge = () => {
    if (!window.RBAC) return;
    const badgeEl = document.getElementById('topbar-role-badge');
    const selectEl = document.getElementById('rbac-role-select');
    if (selectEl && typeof window.RBAC.getAvailableRoles === 'function') {
      const availableRoles = window.RBAC.getAvailableRoles();
      const currentRole = window.RBAC.getRoleCode();
      if (availableRoles.length === 0) {
        selectEl.innerHTML = `<option value="" disabled selected>(No roles configured)</option>`;
      } else {
        selectEl.innerHTML = availableRoles.map(r => `
          <option value="${r.code}">${r.name}</option>
        `).join('');
        if (currentRole && availableRoles.some(r => r.code === currentRole)) {
          selectEl.value = currentRole;
        } else if (availableRoles.length > 0) {
          selectEl.value = availableRoles[0].code;
          window.RBAC.switchRole(availableRoles[0].code);
        }
      }
    } else if (selectEl) {
      selectEl.value = window.RBAC.getRoleCode();
    }
    if (badgeEl) {
      badgeEl.textContent = window.RBAC.getRoleBadge();
      badgeEl.title = `Active Role: ${window.RBAC.getRoleName()}`;
    }
    window.reapplyRbacNav();
  };

  updateBadge();

  if (window.RBAC) {
    window.RBAC.init().then(updateBadge).catch(() => {});
    window.RBAC.subscribe(updateBadge);
  }
}

async function initCompanySwitcher() {
  const btn = document.getElementById('company-switcher-btn');
  const menu = document.getElementById('company-dropdown-menu');
  const listContainer = document.getElementById('company-list-container');
  if (!btn || !menu) return;

  const positionMenu = () => {
    if (!menu.classList.contains('open')) return;
    if (window.innerWidth <= 768) {
      const rect = btn.getBoundingClientRect();
      const topPos = Math.round(rect.bottom + 8);
      menu.style.position = 'fixed';
      menu.style.top = topPos + 'px';
      menu.style.left = '0px';
      menu.style.right = '0px';
      menu.style.marginLeft = 'auto';
      menu.style.marginRight = 'auto';
      menu.style.width = 'calc(100vw - 32px)';
      menu.style.maxWidth = '320px';
    } else {
      menu.style.position = '';
      menu.style.top = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.marginLeft = '';
      menu.style.marginRight = '';
      menu.style.width = '';
      menu.style.maxWidth = '';
    }
  };

  btn.onclick = (e) => {
    e.stopPropagation();
    document.getElementById('notif-dropdown-menu')?.classList.remove('open');
    document.getElementById('notif-center-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('user-dropdown')?.classList.remove('open');
    document.getElementById('user-avatar-btn')?.setAttribute('aria-expanded', 'false');
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      positionMenu();
    }
  };

  window.addEventListener('resize', positionMenu);

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // Populate companies list
  const updateDropdown = () => {
    let active = (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getActiveCompany)
      ? window.TENANT_CONTEXT.getActiveCompany()
      : { id: getActiveCompanyId(), name: getActiveCompanyName(), code: getActiveCompanyCode(), is_manufacturing: true };
    if (active && (active.name === 'Estimate' || active.name === 'Afield Crop Care' || !active.name)) {
      active.name = 'Anjani Agri Care';
      localStorage.setItem('erp_active_company_name', 'Anjani Agri Care');
    }
    const companies = (window.TENANT_CONTEXT && window.TENANT_CONTEXT.getAuthorizedCompanies)
      ? window.TENANT_CONTEXT.getAuthorizedCompanies()
      : [active];
    if (companies && Array.isArray(companies)) {
      companies.forEach(c => {
        if (c.name === 'Estimate' || c.name === 'Afield Crop Care') c.name = 'Anjani Agri Care';
      });
    }

    const nameEl = document.getElementById('topbar-company-name');
    const codeEl = document.getElementById('topbar-company-code');
    const sidebarBrand = document.getElementById('sidebar-brand-name');
    const mobileBrand = document.getElementById('topbar-mobile-brand-name');
    if (nameEl && active) nameEl.textContent = active.name;
    if (codeEl && active) codeEl.textContent = active.code;
    if (sidebarBrand && active) sidebarBrand.textContent = active.name;
    if (mobileBrand && active) mobileBrand.textContent = active.name;

    if (listContainer) {
      const renderItem = (c, isCurrent) => {
        const isMfg = c.is_manufacturing !== false;
        const city = c.city || (c.code === 'E' || c.code === 'ACC' || c.code === 'AAC' || (c.name && (c.name.toLowerCase().includes('afield') || c.name.toLowerCase().includes('anjani') || c.name.toLowerCase().includes('estimate'))) ? 'Rajkot' : '');
        const code = c.code || 'AAC';
        const badgeLabel = isMfg ? 'MANUFACTURER' : 'TRADING';
        return `
          <button class="company-dropdown-item ${isCurrent ? 'active' : ''}" type="button" onclick="window.TENANT_CONTEXT && window.TENANT_CONTEXT.switchCompany ? window.TENANT_CONTEXT.switchCompany(${c.id}) : null">
            <div class="company-card-header">
              <span class="company-item-name">${c.name || 'Anjani Agri Care'}</span>
              <span class="company-badge-pill ${isMfg ? 'mfg' : 'dist'}">${badgeLabel}</span>
            </div>
            <div class="company-card-sub">
              ${city ? `<span>${city}</span><span class="sub-sep">•</span>` : ''}
              <span>${code}</span>
              ${isCurrent ? `<span class="sub-sep">•</span><span class="status-current-tag">Current</span>` : ''}
            </div>
          </button>
        `;
      };

      if (companies && companies.length > 0) {
        listContainer.innerHTML = companies.map(c => renderItem(c, c.id === (active ? active.id : 1))).join('');
      } else if (active) {
        listContainer.innerHTML = renderItem(active, true);
      }
    }
  };

  updateDropdown();

  if (window.TENANT_CONTEXT) {
    window.TENANT_CONTEXT.init().then(updateDropdown).catch(() => {});
    window.TENANT_CONTEXT.subscribe(updateDropdown);
  }
  window.addEventListener('companyChanged', updateDropdown);
}

// ------------------------------------------------------------------------------
// DYNAMIC CORE ENGINES LOADER (Accounting, Costing, Audit Logs, Notifications)
// ------------------------------------------------------------------------------
(function() {
  // Purge any stale mock notifications from browser localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('erp_system_notifications');
      if (raw && (raw.includes('RM-TECH-01') || raw.includes('BAT-2026-002') || raw.includes('Chlorpyrifos Technical stock') || raw.includes('Quarantine Batch') || raw.includes('Commercial Dispatch'))) {
        localStorage.removeItem('erp_system_notifications');
        localStorage.setItem('erp_notif_clean_slate_2026_10_16_v3', 'purged');
      }
    } catch (_) {}
  }

  function loadCoreScript(filename) {
    if (typeof document === 'undefined') return;
    const isPagesDir = window.location.pathname.includes('/pages/');
    const src = isPagesDir ? `../assets/js/${filename}` : `./assets/js/${filename}`;
    if (!document.querySelector(`script[src*="${filename}"]`)) {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      document.head.appendChild(s);
    }
  }
  loadCoreScript('accounting-core.js');
  loadCoreScript('costing-core.js');
  loadCoreScript('audit-logger.js');
  loadCoreScript('notification-service.js');
  loadCoreScript('components/table-enhancer.js');
})();

async function initNotificationCenter() {
  const btn = document.getElementById('notif-center-btn');
  const menu = document.getElementById('notif-dropdown-menu');
  const markAllBtn = document.getElementById('notif-mark-all-btn');
  if (!btn || !menu) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    document.getElementById('company-dropdown-menu')?.classList.remove('open');
    document.getElementById('company-switcher-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('user-dropdown')?.classList.remove('open');
    document.getElementById('user-avatar-btn')?.setAttribute('aria-expanded', 'false');
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) window.renderTopbarNotifications();
  };

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  if (markAllBtn) {
    markAllBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.NOTIFICATION_SERVICE) {
        const role = window.RBAC ? window.RBAC.getRoleCode() : 'super_admin';
        const companyId = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getActiveCompanyId() : 1;
        window.NOTIFICATION_SERVICE.markAllAsRead(role, companyId);
        window.renderTopbarNotifications();
      }
    };
  }

  window.renderTopbarNotifications = function() {
    if (!window.NOTIFICATION_SERVICE) return;
    const role = window.RBAC ? window.RBAC.getRoleCode() : 'super_admin';
    const companyId = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getActiveCompanyId() : 1;
    const notifs = window.NOTIFICATION_SERVICE.getNotificationsForUser({ roleCode: role, companyId });
    const unreadCount = window.NOTIFICATION_SERVICE.getUnreadCount(role, companyId);

    const badgeEl = document.getElementById('notif-badge');
    const countPill = document.getElementById('notif-count-pill');
    const container = document.getElementById('notif-list-container');

    if (badgeEl) {
      badgeEl.textContent = unreadCount;
      badgeEl.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
    if (countPill) countPill.textContent = unreadCount;

    if (container) {
      if (!notifs || notifs.length === 0) {
        container.innerHTML = '<div style="padding:24px 16px; text-align:center; color:var(--text-muted); font-size:12px;"><div style="font-weight:600; margin-bottom:4px; color:var(--text-primary);">No active notifications</div><div>System alerts and workflow updates will appear here automatically.</div></div>';
        return;
      }

      container.innerHTML = notifs.map(n => {
        let pColor = '#3B82F6';
        if (n.priority === 'Urgent') pColor = '#EF4444';
        else if (n.priority === 'Warning') pColor = '#F59E0B';
        else if (n.priority === 'Info') pColor = '#10B981';

        const timeStr = n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const isUnread = !n.is_read;

        return `
          <div class="notif-item" style="padding:10px 14px; border-bottom:1px solid var(--border); display:flex; gap:10px; align-items:flex-start; background:${isUnread ? 'rgba(12, 57, 37, 0.04)' : 'transparent'}; cursor:pointer;" onclick="if(window.NOTIFICATION_SERVICE){window.NOTIFICATION_SERVICE.markAsRead(${n.id}); window.renderTopbarNotifications(); if('${n.action_url || ''}') window.location.href='${n.action_url}';}">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${isUnread ? pColor : 'transparent'}; margin-top:5px; flex-shrink:0;"></span>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span style="font-size:10px; font-weight:700; color:${pColor}; text-transform:uppercase; letter-spacing:0.5px;">${n.type.replace(/_/g, ' ')}</span>
                <span style="font-size:10px; color:var(--text-muted);">${timeStr}</span>
              </div>
              <div style="font-size:12px; font-weight:600; color:var(--text-primary); margin-bottom:2px;">${n.title}</div>
              <div style="font-size:11px; color:var(--text-secondary); line-height:1.35;">${n.message}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  // Initial render
  setTimeout(() => {
    if (typeof window.renderTopbarNotifications === 'function') {
      window.renderTopbarNotifications();
    }
  }, 200);

  // Subscribe to changes
  window.addEventListener('newNotification', () => window.renderTopbarNotifications && window.renderTopbarNotifications());
  window.addEventListener('rbacChanged', () => window.renderTopbarNotifications && window.renderTopbarNotifications());
  window.addEventListener('tenantChanged', () => window.renderTopbarNotifications && window.renderTopbarNotifications());
}

function initUserDropdown() {
  const btn = document.getElementById('user-avatar-btn');
  const menu = document.getElementById('user-dropdown');
  if (!btn || !menu) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    document.getElementById('company-dropdown-menu')?.classList.remove('open');
    document.getElementById('company-switcher-btn')?.setAttribute('aria-expanded', 'false');
    document.getElementById('notif-dropdown-menu')?.classList.remove('open');
    document.getElementById('notif-center-btn')?.setAttribute('aria-expanded', 'false');
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  const logoutBtn = document.getElementById('user-logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.remove('open');
      const doLogout = async () => {
        localStorage.removeItem('admin_logged_in');
        localStorage.removeItem('admin_user');
        try {
          if (window.dbClient?.auth) await window.dbClient.auth.signOut();
        } catch (_) {}
        const isPagesDir = window.location.pathname.includes('/pages/');
        window.location.href = isPagesDir ? '../index.html' : './index.html';
      };

      if (window.APP?.showConfirm) {
        window.APP.showConfirm('Log out and return to the welcome screen?', doLogout);
      } else if (confirm('Log out and return to the welcome screen?')) {
        doLogout();
      }
    };
  }
}

let deferredPwaPrompt = null;
function setupPwaInstallButton() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (!installBtn) return;

  if (deferredPwaPrompt) {
    installBtn.style.display = 'inline-flex';
  }

  installBtn.onclick = async () => {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const choice = await deferredPwaPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPwaPrompt = null;
    } else {
      alert('To install, you can also click the Install icon in your browser address bar.');
    }
  };
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

window.addEventListener('appinstalled', () => {
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.style.display = 'none';
  deferredPwaPrompt = null;
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  const registerSW = () => {
    const isPagesDir = window.location.pathname.includes('/pages/');
    const swPath = isPagesDir ? '../sw.js' : './sw.js';
    navigator.serviceWorker.register(swPath).catch(err => {
      console.warn('PWA ServiceWorker registration note:', err);
    });
  };

  if (document.readyState === 'complete') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW);
  }
}

window.LAYOUT = { injectLayout };
