const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'pages', 'orders.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Add Dispatches Tab
if (!html.includes('data-tab="Dispatches"')) {
  html = html.replace(
    '<button class="tab-btn" data-tab="OrderItems">Order Items Detail</button>',
    '<button class="tab-btn" data-tab="OrderItems">Order Items Detail</button>\n        <button class="tab-btn" data-tab="Dispatches">Dispatches & Gate Passes</button>'
  );
}

// 2. Add Prepare Dispatch button to page-header-right
if (!html.includes('openPrepareDispatch()')) {
  html = html.replace(
    '<button class="btn btn-primary" onclick="openAdd()">',
    '<button class="btn btn-secondary" onclick="openPrepareDispatch()" style="margin-right:8px; display:inline-flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/></svg>Prepare Dispatch</button>\n          <button class="btn btn-primary" onclick="openAdd()">'
  );
}

// 3. Update orders-table thead
html = html.replace(
  '<thead><tr><th>Order No</th><th>Client</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>',
  '<thead><tr><th>Order No</th><th>Client</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Dispatch Status</th><th>Order Status</th><th>Actions</th></tr></thead>'
);

// 4. Update order-items-detail-table thead
html = html.replace(
  '<thead><tr><th>Order No</th><th>Client</th><th>Date</th><th>Product</th><th>Pack Size / Unit</th><th>Qty</th><th>Unit Price (₹)</th><th>Total (₹)</th><th>Status</th><th>Actions</th></tr></thead>',
  '<thead><tr><th>Order No</th><th>Client</th><th>Date</th><th>Product</th><th>Pack Size / Unit</th><th>Ordered</th><th>Dispatched</th><th>Remaining</th><th>Unit Price (₹)</th><th>Total (₹)</th><th>Status</th><th>Actions</th></tr></thead>'
);

// 5. Add Dispatches Table Wrap after order-items-table-wrap
const dispatchesTableWrapHtml = `
      <!-- Commercial Dispatches & Gate Passes Table -->
      <div class="table-wrap data-table-wrap-mobile" id="dispatches-table-wrap" style="display:none">
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <div class="table-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="dispatch-search-input" placeholder="Search dispatches, orders, clients, vehicle…">
            </div>
            <div class="table-filters cat-pill-filters" id="dispatch-status-pill-filters">
              <button type="button" class="cat-pill active" data-status="">All</button>
              <button type="button" class="cat-pill" data-status="Pending Verification">Pending Verification</button>
              <button type="button" class="cat-pill" data-status="Verified">Verified</button>
              <button type="button" class="cat-pill" data-status="Approved">Approved</button>
              <button type="button" class="cat-pill" data-status="Dispatched">Dispatched</button>
              <button type="button" class="cat-pill" data-status="Cancelled">Cancelled</button>
            </div>
          </div>
          <div class="table-toolbar-right">
            <span class="text-sm text-muted" id="dispatch-total-info">Loading...</span>
            <button class="btn btn-primary btn-sm" onclick="openPrepareDispatch()" style="margin-left:12px;">+ Prepare Dispatch</button>
          </div>
        </div>
        <table class="data-table" id="dispatches-table">
          <thead>
            <tr>
              <th>Dispatch Slip No</th>
              <th>Order Ref</th>
              <th>Client</th>
              <th>Dispatch Date</th>
              <th>Boxes / Loose</th>
              <th>Total Units</th>
              <th>Vehicle / Logistics</th>
              <th>Status</th>
              <th>Commercial Invoice</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="10"><div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div></td></tr>
          </tbody>
        </table>
        <div class="pagination"></div>
      </div>
`;

if (!html.includes('id="dispatches-table-wrap"')) {
  html = html.replace('</div>\n    </div>\n  </main>', dispatchesTableWrapHtml + '    </div>\n  </main>');
  if (!html.includes('id="dispatches-table-wrap"')) {
    html = html.replace('</div>\r\n    </div>\r\n  </main>', dispatchesTableWrapHtml + '    </div>\r\n  </main>');
  }
}

// 6. Modals for Dispatch Workflow
const dispatchModalsHtml = `
<!-- Modal 1: Prepare Commercial Dispatch Slip -->
<div class="modal-overlay" id="prepare-dispatch-modal">
  <div class="modal modal-xl">
    <div class="modal-header">
      <span class="modal-title">Prepare Commercial Dispatch Slip</span>
      <button class="modal-close" onclick="APP.closeModal('prepare-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body">
      <form id="prepare-dispatch-form" onsubmit="return false">
        <section class="product-form-card">
          <div class="product-form-card-head">
            <h4>Select Sales Order</h4>
            <p>Choose an active customer order with remaining un-dispatched quantities.</p>
          </div>
          <div class="form-grid product-form-grid">
            <div class="form-group form-col-full">
              <label class="form-label">Sales Order <span class="required">*</span></label>
              <select class="form-select" id="disp-order-select" onchange="onDispatchOrderSelected(this.value)">
                <option value="">Select sales order…</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Dispatch Slip No</label>
              <input class="form-input" id="disp-slip-no" readonly style="background:var(--bg); font-weight:700;">
            </div>
            <div class="form-group">
              <label class="form-label">Dispatch Date</label>
              <input class="form-input" id="disp-date" type="date">
            </div>
          </div>
        </section>

        <!-- Order Items Allocation Section -->
        <section class="product-form-card">
          <div class="product-form-card-head">
            <h4>Physical Batch Allocation & Quantity Breakdown</h4>
            <p>Select QC-Approved warehouse batches and specify dispatch units (Boxes + Loose bottles).</p>
          </div>
          <div id="disp-items-container" style="overflow-x:auto;">
            <p style="color:var(--text-muted); font-size:13px;">Please select a sales order above to view order items.</p>
          </div>
        </section>

        <!-- Logistics & Transporter Section -->
        <section class="product-form-card">
          <div class="product-form-card-head">
            <h4>Logistics, Vehicle & Gate Information</h4>
            <p>Enter vehicle registration, transporter details, and government E-Way Bill number.</p>
          </div>
          <div class="form-grid product-form-grid">
            <div class="form-group">
              <label class="form-label">Vehicle Registration No</label>
              <input class="form-input" id="disp-vehicle-no" placeholder="e.g. GJ-01-AB-1234">
            </div>
            <div class="form-group">
              <label class="form-label">Transporter / Logistics Name</label>
              <input class="form-input" id="disp-transporter" placeholder="e.g. Shreeji Logistics">
            </div>
            <div class="form-group">
              <label class="form-label">Driver Contact Phone</label>
              <input class="form-input" id="disp-driver-contact" placeholder="e.g. +91 98765 43210">
            </div>
            <div class="form-group">
              <label class="form-label">Government E-Way Bill No</label>
              <input class="form-input" id="disp-eway-bill" placeholder="e.g. EWB-2026-98124">
            </div>
            <div class="form-group form-col-full">
              <label class="form-label">Dispatch Instructions / Remarks</label>
              <textarea class="form-textarea" id="disp-notes" rows="2" placeholder="Packaging handling, gate notes, client instructions…"></textarea>
            </div>
          </div>
        </section>
      </form>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('prepare-dispatch-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitPrepareDispatch()">Create Commercial Dispatch Slip</button>
    </div>
  </div>
</div>

<!-- Modal 2: Godown Packing Verification -->
<div class="modal-overlay" id="verify-dispatch-modal">
  <div class="modal modal-md">
    <div class="modal-header">
      <span class="modal-title">Godown Packing Completion Verification</span>
      <button class="modal-close" onclick="APP.closeModal('verify-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="verify-dispatch-body">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('verify-dispatch-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitVerifyDispatch()">Confirm Godown Verification</button>
    </div>
  </div>
</div>

<!-- Modal 3: Dispatch Approval -->
<div class="modal-overlay" id="approve-dispatch-modal">
  <div class="modal modal-md">
    <div class="modal-header">
      <span class="modal-title">Dispatch Authorization & Manager Sign-off</span>
      <button class="modal-close" onclick="APP.closeModal('approve-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="approve-dispatch-body">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('approve-dispatch-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitApproveDispatch()">Authorize Commercial Gate Exit</button>
    </div>
  </div>
</div>

<!-- Modal 4: Execute Gate Pass & Physical Stock Deduction -->
<div class="modal-overlay" id="execute-dispatch-modal">
  <div class="modal modal-md">
    <div class="modal-header">
      <span class="modal-title">Confirm Gate Exit & Deduct Stock</span>
      <button class="modal-close" onclick="APP.closeModal('execute-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="execute-dispatch-body">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('execute-dispatch-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitExecuteDispatch()">Confirm Gate Exit (Deduct Stock Exactly Once)</button>
    </div>
  </div>
</div>

<!-- Modal 5: Commercial Invoice Generation -->
<div class="modal-overlay" id="generate-invoice-modal">
  <div class="modal modal-md">
    <div class="modal-header">
      <span class="modal-title">Generate Commercial Tax Invoice</span>
      <button class="modal-close" onclick="APP.closeModal('generate-invoice-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="generate-invoice-body">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('generate-invoice-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitGenerateInvoice()">Generate Tax Invoice (Zero Double-Deduction)</button>
    </div>
  </div>
</div>

<!-- Modal 6: Dispatch Reversal / Customer Return -->
<div class="modal-overlay" id="reverse-dispatch-modal">
  <div class="modal modal-md">
    <div class="modal-header">
      <span class="modal-title">Safe Reversal & Inventory Restoration</span>
      <button class="modal-close" onclick="APP.closeModal('reverse-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="reverse-dispatch-body">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('reverse-dispatch-modal')">Cancel</button>
      <button class="btn btn-danger" onclick="submitReverseDispatch()">Execute Reversal & Restore Stock</button>
    </div>
  </div>
</div>

<!-- Modal 7: View Dispatch Slip -->
<div class="modal-overlay" id="view-dispatch-modal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <span class="modal-title">Commercial Dispatch Slip Details</span>
      <button class="modal-close" onclick="APP.closeModal('view-dispatch-modal')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body" id="view-dispatch-content">
      <!-- Injected dynamically -->
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="APP.closeModal('view-dispatch-modal')">Close</button>
      <button class="btn btn-primary" onclick="printDispatchSlip()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Dispatch Slip</button>
    </div>
  </div>
</div>
`;

if (!html.includes('id="prepare-dispatch-modal"')) {
  html = html.replace('<!-- View Modal -->', dispatchModalsHtml + '\n<!-- View Modal -->');
}

// 7. Include dispatch-core.js and dispatch-ui.js script before orders.js
if (!html.includes('dispatch-core.js')) {
  html = html.replace(
    '<script src="../assets/js/orders.js',
    '<script src="../assets/js/dispatch-core.js"></script>\n<script src="../assets/js/dispatch-ui.js"></script>\n<script src="../assets/js/orders.js'
  );
} else if (!html.includes('dispatch-ui.js')) {
  html = html.replace(
    '<script src="../assets/js/dispatch-core.js"></script>',
    '<script src="../assets/js/dispatch-core.js"></script>\n<script src="../assets/js/dispatch-ui.js"></script>'
  );
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully updated orders.html with Dispatches workflow components!');
