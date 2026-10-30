// ─── SUPABASE HELPER ──────────────────────────────────────────
async function fetchDirectPublic(endpoint) {
  const supabaseUrl = 'https://galqhecdkeskvgnxjsax.supabase.co';
  const supabaseKey = 'sb_publishable_bSLDWrI4YHYCshblzkiKHw_04XepecY';
  const sep = endpoint.includes('?') ? '&' : '?';
  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}${sep}apikey=${supabaseKey}`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return await res.json();
}
window.fetchDirectPublic = fetchDirectPublic;

function getSupabaseClient() {
  if (window.dbClient) return window.dbClient;
  if (typeof window.supabase !== 'undefined' && window.supabase?.createClient) {
    const supabaseUrl = 'https://galqhecdkeskvgnxjsax.supabase.co';
    const supabaseKey = 'sb_publishable_bSLDWrI4YHYCshblzkiKHw_04XepecY';
    try {
      const fetchFn = (typeof resilientFetch === 'function') ? resilientFetch : (typeof window.resilientFetch === 'function' ? window.resilientFetch : undefined);
      const opts = {
        auth: { storage: window.localStorage, autoRefreshToken: true, persistSession: true }
      };
      if (fetchFn) opts.global = { fetch: fetchFn };
      window.dbClient = window.supabase.createClient(supabaseUrl, supabaseKey, opts);
      return window.dbClient;
    } catch (e) {
      console.warn('Supabase init in api.js error:', e);
    }
  }
  return null;
}

// ─── PRODUCT API ─────────────────────────────────────────
async function getProducts() {
  let prodData = null;
  let packData = null;

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const [prodRes, packRes] = await Promise.all([
        sb.from('products').select('*'),
        sb.from('product_packaging').select('*')
      ]);
      if (!prodRes.error && Array.isArray(prodRes.data)) prodData = prodRes.data;
      if (!packRes.error && Array.isArray(packRes.data)) packData = packRes.data;
    } catch (e) {
      console.warn('getProducts Supabase error:', e);
    }
  }

  if (!prodData || !prodData.length) {
    try {
      const [pDirect, pkDirect] = await Promise.all([
        fetchDirectPublic('products?select=*'),
        fetchDirectPublic('product_packaging?select=*')
      ]);
      if (Array.isArray(pDirect)) prodData = pDirect;
      if (Array.isArray(pkDirect)) packData = pkDirect;
    } catch (e) {
      console.warn('getProducts direct fetch note:', e);
    }
  }

  if (Array.isArray(prodData) && prodData.length > 0) {
    const pkgData = packData || [];
    const pkgByProd = {};
    for (const pk of pkgData) {
      if (!pkgByProd[pk.product_id]) pkgByProd[pk.product_id] = [];
      pkgByProd[pk.product_id].push(pk);
    }

    const list = [];
    for (const p of prodData) {
      const pkgs = pkgByProd[p.id];
      if (pkgs && pkgs.length > 0) {
        for (const pk of pkgs) {
          list.push({
            ProductID: String(p.id),
            id: p.id,
            BrandName: p.brand || '',
            brand: p.brand || '',
            ProductName: p.name || '',
            product: p.name || '',
            name: p.name || '',
            sku: p.sku || '',
            PackagingSize: pk.packaging_size || p.unit || '',
            packaging: pk.packaging_size || p.unit || '',
            units_per_box: parseInt(pk.units_per_box, 10) || 0,
            volume_ml: parseFloat(pk.volume_ml) || 0,
            weight_gm: parseFloat(pk.weight_gm) || 0,
            unit: p.unit || 'Bottles',
            UnitPrice: pk.sell_price != null ? pk.sell_price : (p.sell_price || 0),
            price: pk.sell_price != null ? pk.sell_price : (p.sell_price || 0),
            hsn: p.gst || ''
          });
        }
      } else {
        list.push({
          ProductID: String(p.id),
          id: p.id,
          BrandName: p.brand || '',
          brand: p.brand || '',
          ProductName: p.name || '',
          product: p.name || '',
          name: p.name || '',
          sku: p.sku || '',
          PackagingSize: p.unit || '',
          packaging: p.unit || '',
          units_per_box: 0,
          volume_ml: 0,
          weight_gm: 0,
          unit: p.unit || 'Bottles',
          UnitPrice: p.sell_price || 0,
          price: p.sell_price || 0,
          hsn: p.gst || ''
        });
      }
    }
    return list;
  }
  return [];
}

async function addProduct(product) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const name = (product.ProductName || product.product || product.name || '').trim();
  const brand = (product.BrandName || product.brand || '').trim();
  const packaging = (product.PackagingSize || product.packaging || product.size || '').trim();
  const price = parseFloat(product.UnitPrice || product.price || 0) || 0;

  if (!name) throw new Error('Product name is required');

  let prodId = null;
  const { data: existing } = await sb.from('products').select('id').eq('name', name).limit(1);
  if (existing && existing.length > 0) {
    prodId = existing[0].id;
  } else {
    const prodPayload = {
      name: name,
      brand: brand,
      unit: packaging || 'Kg',
      sell_price: price,
      category: 'Finished Good',
      status: 'Active'
    };
    const { data: ins, error: pErr } = await sb.from('products').insert([prodPayload]).select();
    if (pErr) throw new Error(pErr.message || 'Failed to create product');
    prodId = ins[0].id;
  }

  if (packaging) {
    const { error: pkErr } = await sb.from('product_packaging').insert([{
      product_id: prodId,
      packaging_size: packaging,
      sell_price: price,
      purchase_price: 0
    }]);
    if (pkErr) console.warn('Packaging insert note:', pkErr.message);
  }

  return { success: true, id: prodId };
}

async function updateProduct(product) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const rawId = product.id || product.ProductID;
  const numId = parseInt(String(rawId).replace(/\D/g, ''), 10);
  if (!numId) throw new Error('Valid Product ID is required for update');

  const name = (product.ProductName || product.product || product.name || '').trim();
  const brand = (product.BrandName || product.brand || '').trim();
  const packaging = (product.PackagingSize || product.packaging || product.size || '').trim();
  const price = parseFloat(product.UnitPrice || product.price || 0) || 0;

  const prodPayload = {
    name: name,
    brand: brand,
    sell_price: price
  };
  if (packaging) prodPayload.unit = packaging;

  const { error: pErr } = await sb.from('products').update(prodPayload).eq('id', numId);
  if (pErr) throw new Error(pErr.message || 'Failed to update product');

  if (packaging) {
    const { data: pkgs } = await sb.from('product_packaging').select('id, packaging_size').eq('product_id', numId);
    const existingPkg = (pkgs || []).find(pk => (pk.packaging_size || '').toLowerCase() === packaging.toLowerCase());
    if (existingPkg) {
      await sb.from('product_packaging').update({ sell_price: price }).eq('id', existingPkg.id);
    } else {
      await sb.from('product_packaging').insert([{
        product_id: numId,
        packaging_size: packaging,
        sell_price: price,
        purchase_price: 0
      }]);
    }
  }

  return { success: true };
}

async function deleteProduct(idOrObj) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const rawId = typeof idOrObj === 'object' ? (idOrObj.ProductID || idOrObj.id || idOrObj.productName) : idOrObj;
  const numId = parseInt(String(rawId).replace(/\D/g, ''), 10);
  if (!numId) throw new Error('Valid Product ID is required for deletion');

  await sb.from('product_packaging').delete().eq('product_id', numId);
  const { error } = await sb.from('products').delete().eq('id', numId);
  if (error) throw new Error(error.message || 'Failed to delete product');
  return { success: true };
}

async function searchProduct(query) {
  const prods = await getProducts();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return prods;
  return prods.filter(p => (p.ProductName || '').toLowerCase().includes(q) || (p.BrandName || '').toLowerCase().includes(q));
}

// ─── CLIENT API ──────────────────────────────────────────
async function getClients() {
  let rawData = null;
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb.from('clients').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        rawData = data;
      }
    } catch (e) {
      console.warn('getClients Supabase error:', e);
    }
  }

  if (!rawData || !rawData.length) {
    try {
      rawData = await fetchDirectPublic('clients?select=*');
    } catch (e) {
      console.warn('getClients direct fetch note:', e);
    }
  }

  if (Array.isArray(rawData) && rawData.length > 0) {
    return rawData.map(c => ({
      ClientID: String(c.id || ''),
      id: c.id,
      ClientName: c.name || '',
      name: c.name || '',
      Address: c.address || '',
      address: c.address || '',
      City: c.city || '',
      city: c.city || '',
      State: c.state || '',
      state: c.state || '',
      Pincode: c.pincode || c.pin || '',
      pincode: c.pincode || c.pin || '',
      Phone: c.contact || c.phone || '',
      phone: c.contact || c.phone || '',
      GSTIN: (c.gst || c.gstin || '').toUpperCase(),
      gst: (c.gst || c.gstin || '').toUpperCase(),
      DueAmount: parseFloat(c.balance) || 0,
      due: parseFloat(c.balance) || 0
    }));
  }
  return [];
}

async function addClient(client) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const cname = (client.ClientName || client.name || '').trim();
  if (!cname) throw new Error('Client Name is required');

  const payload = {
    name: cname,
    address: (client.Address || client.address || '').trim(),
    contact: (client.Phone || client.phone || '').trim(),
    gst: (client.GSTIN || client.gstin || '').trim().toUpperCase(),
    balance: parseFloat(client.DueAmount || client.due || 0) || 0,
    type: 'Retailer'
  };

  const { data, error } = await sb.from('clients').insert([payload]).select();
  if (error) throw new Error(error.message || 'Failed to save client');
  return { success: true, data: data ? data[0] : null };
}

async function updateClient(client) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const rawId = client.id || client.ClientID;
  const numId = parseInt(String(rawId).replace(/\D/g, ''), 10);
  if (!numId) throw new Error('Valid Client ID is required for update');

  const payload = {
    name: (client.ClientName || client.name || '').trim(),
    address: (client.Address || client.address || '').trim(),
    contact: (client.Phone || client.phone || '').trim(),
    gst: (client.GSTIN || client.gstin || '').trim().toUpperCase(),
    balance: parseFloat(client.DueAmount || client.due || 0) || 0
  };

  const { error } = await sb.from('clients').update(payload).eq('id', numId);
  if (error) throw new Error(error.message || 'Failed to update client');
  return { success: true };
}

async function deleteClient(idOrObj) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Database connection not available');
  const rawId = typeof idOrObj === 'object' ? (idOrObj.ClientID || idOrObj.id || idOrObj.phone) : idOrObj;
  const numId = parseInt(String(rawId).replace(/\D/g, ''), 10);
  if (!numId) throw new Error('Valid Client ID is required for deletion');

  const { error } = await sb.from('clients').delete().eq('id', numId);
  if (error) throw new Error(error.message || 'Failed to delete client');
  return { success: true };
}

async function searchClient(query) {
  const list = await getClients();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return list;
  return list.filter(c => (c.ClientName || '').toLowerCase().includes(q) || (c.Phone || '').includes(q));
}

// Export API
const api = {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  searchProduct,
  getClients,
  addClient,
  updateClient,
  deleteClient,
  searchClient,
  apiGetInvoices,
  apiGetInvoice,
  apiSaveInvoice,
  apiUpdateInvoice,
  apiDeleteInvoice,
  apiGetNextInvoiceNumber,
};
window.api = api;
/* ==========================================================================
   api.js  —  Google Apps Script backend communication layer
   Invoice System
   All API calls go through this single file.
   To change backend: only update APPS_SCRIPT_URL below.
   ========================================================================== */

'use strict';

// Safe localStorage wrapper to prevent crashes in private windows / disabled cookies
window.safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage.getItem failed for key: ' + key, e);
      return window['__fs_' + key] || null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage.setItem failed for key: ' + key, e);
      window['__fs_' + key] = String(value);
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage.removeItem failed for key: ' + key, e);
      delete window['__fs_' + key];
    }
  }
};

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = window.location.origin.includes(':7890') ? 'http://localhost:8000/api' : window.location.origin + '/api';
const API_SECRET = 'sk_agro_secure_key_2026'; // Added Security Token

// Request timeout in milliseconds
const API_TIMEOUT_MS = 25000;

// ─── CORE FETCH WRAPPER ───────────────────────────────────────────────────────
/**
 * Internal helper: fetch with timeout + JSON parse + error normalization.
 * GET requests: pass params as URLSearchParams.
 * POST requests: pass body as plain JS object (will be JSON-stringified).
 */
async function _apiFetch(params = {}, body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = new URL(APPS_SCRIPT_URL);
    // Attach the security token to every request alongside other params
    url.searchParams.set('apiKey', API_SECRET);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const options = { signal: controller.signal };

    if (body !== null) {
      // POST — Apps Script doesn't support real PUT/DELETE easily,
      // so we tunnel the HTTP method via ?action param.
      options.method = 'POST';
      // To bypass CORS preflight OPTIONS, we use text/plain
      options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      options.body = JSON.stringify(body);
    } else {
      options.method = 'GET';
    }

    const res = await fetch(url.toString(), options);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const json = await res.json();

    if (json.error) throw new Error(json.error);
    return json;

  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your internet connection.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}


// ─── PUBLIC API FUNCTIONS ─────────────────────────────────────────────────────

/**
 * GET /invoices — Load invoice list (summary only, no full JSON for performance).
 * @param {object} filters  Optional: { customer, dateFrom, dateTo, status, limit }
 * @returns {Promise<Array>} Array of invoice summary objects.
 */
async function apiGetInvoices(filters = {}) {
  let list = [];
  try {
    const raw = safeStorage.getItem('invoice_history_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (e) {}

  // Synchronize dispatches from Supabase orders if available
  try {
    const sb = getSupabaseClient();
    let ordersData = null;
    if (sb) {
      try {
        const { data } = await sb.from('orders').select('*');
        if (Array.isArray(data) && data.length > 0) ordersData = data;
      } catch (_) {}
    }
    if (!ordersData) {
      try {
        ordersData = await fetchDirectPublic('orders?select=*');
      } catch (_) {}
    }
    if (Array.isArray(ordersData)) {
        for (const o of ordersData) {
          if (!o.notes || !o.notes.includes('DISPATCH_META')) continue;
          try {
            const rawMeta = o.notes.replace(/^DISPATCH_META:\s*/, '').trim();
            const meta = JSON.parse(rawMeta);
            const dispatches = Array.isArray(meta?.dispatches) ? meta.dispatches : [];
            for (const d of dispatches) {
              if (d.status === 'Dispatched' || d.status === 'Completed' || d.dispatch_no) {
                const matchDigits = String(d.order_no || o.order_no || '').match(/\d+/);
                const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(o.id || '01').padStart(2, '0');
                const invNo = d.invoice_no || `INV-${orderDigits}`;
                const invDate = d.dispatch_date || o.date || new Date().toISOString().substring(0, 10);

                const exists = list.some(item =>
                  String(item.uniqueId).trim() === invNo ||
                  String(item.invoiceNumber).trim() === invNo ||
                  (item.dispatchNo && item.dispatchNo === d.dispatch_no)
                );
                if (!exists) {
                  const totalUnits = (d.items || []).reduce((s, it) => s + (parseFloat(it.total_units_dispatched || it.quantity) || 0), 0);
                  const totalBoxes = (d.items || []).reduce((s, it) => s + (parseFloat(it.boxes_dispatched) || 0), 0);
                  const subtotal = (d.items || []).reduce((s, it) => s + (parseFloat(it.total_amount) || ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))), 0);
                  const grandTotal = subtotal * 1.12;
                  list.push({
                    uniqueId: invNo,
                    invoiceNumber: invNo,
                    customerName: d.client_name || o.client_name || 'Customer',
                    mobile: d.client_phone || o.client_phone || '',
                    date: invDate,
                    totalAmount: grandTotal,
                    totalBoxes: totalBoxes,
                    totalUnits: totalUnits,
                    dispatchNo: d.dispatch_no,
                    source: 'dispatch'
                  });
                }
              }
            }
          } catch (_) {}
        }
      }
  } catch (err) {
    console.warn('apiGetInvoices sync note:', err);
  }

  try {
    safeStorage.setItem('invoice_history_cache', JSON.stringify(list));
  } catch (_) {}

  return list.map(inv => {
    const invNumStr = String(inv.InvoiceNumber || inv.invoiceNumber || inv.inv_num || inv.Number || inv['Invoice #'] || '—').trim();
    const rawDate = String(inv.date || inv.Date || '');
    const cleanDate = rawDate.match(/^\d{4}-\d{2}-\d{2}/) ? rawDate.substring(0, 10) : rawDate;
    const rawDue = String(inv.dueDate || inv.DueDate || '');
    const cleanDue = rawDue.match(/^\d{4}-\d{2}-\d{2}/) ? rawDue.substring(0, 10) : rawDue;

    return {
      ...inv,
      invoiceNumber: invNumStr,
      uniqueId: String(inv.uniqueId || invNumStr),
      customerName: String(inv.customerName || inv.ClientName || 'Unknown'),
      date: cleanDate || '—',
      dueDate: cleanDue || '',
      totalAmount: parseFloat(inv.totalAmount || inv.GrandTotal || 0),
      mobile: String(inv.mobile || inv.Phone || inv.ClientPhone || inv.contact || '')
    };
  }).sort((a, b) => {
    const numA = parseInt(String(a.invoiceNumber || a.uniqueId || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.invoiceNumber || b.uniqueId || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numB - numA;
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });
}

async function apiGetInvoice(uniqueId) {
  if (!uniqueId) throw new Error('Invoice ID is required.');
  const tid = String(uniqueId).trim();
  const decoded = decodeURIComponent(tid);

  // 0. Session storage & localStorage lookup for seamless transition from Orders page
  try {
    const sessRaw = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('current_edit_invoice')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('current_edit_invoice'));
    if (sessRaw) {
      const sessDoc = JSON.parse(sessRaw);
      const sId = sessDoc?.meta?.uniqueId || sessDoc?.meta?.invoiceNumber || sessDoc?.InvoiceNumber || sessDoc?.dispatchNo;
      const numMatch = tid.match(/\d+/);
      const tidDig = numMatch ? numMatch[0].padStart(2, '0') : null;
      if (sId && (
        String(sId).trim().toUpperCase() === tid.toUpperCase() ||
        String(sId).trim().toUpperCase() === decoded.toUpperCase()
      )) {
        return sessDoc;
      }
    }
  } catch (e) {}

  // 1. Direct document lookup by uniqueId or decoded
  try {
    const numMatch = tid.match(/\d+/);
    const dig = numMatch ? numMatch[0] : '';
    const digPad = numMatch ? numMatch[0].padStart(2, '0') : '';
    const raw = safeStorage.getItem('inv_doc_' + tid) ||
      safeStorage.getItem('inv_doc_' + decoded) ||
      safeStorage.getItem('inv_doc_' + tid.toUpperCase()) ||
      safeStorage.getItem('inv_doc_' + decoded.toUpperCase()) ||
      safeStorage.getItem('inv_doc_' + tid.toLowerCase()) ||
      safeStorage.getItem('inv_doc_' + decoded.toLowerCase()) ||
      (digPad && safeStorage.getItem('inv_doc_' + digPad)) ||
      (dig && safeStorage.getItem('inv_doc_' + dig));
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  // 1b. Check if active draft matches tid
  try {
    const draftRaw = safeStorage.getItem('inv_builder_draft');
    if (draftRaw) {
      const draft = JSON.parse(draftRaw);
      const draftId = draft?.meta?.uniqueId || draft?.meta?.invoiceNumber || draft?.InvoiceNumber || draft?.dispatchNo;
      if (draftId && (draftId === tid || draftId === decoded || String(draftId).toUpperCase() === tid.toUpperCase())) {
        return draft;
      }
    }
  } catch (e) {}

  // 2. Check history cache for matching entry with associated doc
  try {
    const history = JSON.parse(safeStorage.getItem('invoice_history_cache') || '[]');
    const match = history.find(i =>
      String(i.uniqueId).trim() === tid ||
      String(i.uniqueId).trim() === decoded ||
      String(i.invoiceNumber).trim() === tid ||
      String(i.invoiceNumber).trim() === decoded ||
      String(i.InvoiceNumber).trim() === tid ||
      String(i.InvoiceNumber).trim() === decoded
    );
    if (match && match.uniqueId) {
      const raw2 = safeStorage.getItem('inv_doc_' + match.uniqueId);
      if (raw2) return JSON.parse(raw2);
    }
  } catch (e) {}

  // 3. Authoritative fallback to orders table in Supabase (with direct REST fallback)
  let ords = null;
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb.from('orders').select('*');
      if (!error && Array.isArray(data) && data.length > 0) ords = data;
    } catch (_) {}
  }
  if (!ords || !ords.length) {
    try {
      ords = await fetchDirectPublic('orders?select=*');
    } catch (e) {
      console.warn('apiGetInvoice direct orders fetch note:', e);
    }
  }

  if (Array.isArray(ords)) {
    for (const o of ords) {
      if (!o.notes || !/(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) continue;
      try {
        const rawMeta = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):\s*/i, '').trim();
        const meta = JSON.parse(rawMeta);
        const dispatches = Array.isArray(meta?.dispatches) ? meta.dispatches : [];
        const matchDigits = String(o.order_no || '').match(/\d+/);
        const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(o.id || '01').padStart(2, '0');
        const defaultInvNo = `INV-${orderDigits}`;

        for (const d of dispatches) {
          const dInvNo = d.invoice_no || defaultInvNo;
          const matchTidDigits = tid.match(/\d+/);
          const tidDigits = matchTidDigits ? matchTidDigits[0].padStart(2, '0') : null;
          const matchesTid = 
            dInvNo === tid || dInvNo === decoded || String(dInvNo).toUpperCase() === tid.toUpperCase() ||
            d.dispatch_no === tid || d.dispatch_no === decoded || String(d.dispatch_no).toUpperCase() === tid.toUpperCase() ||
            String(d.id) === tid || String(o.order_no) === tid || (tidDigits && orderDigits === tidDigits);

          if (matchesTid) {
            // Fetch client details
            let clientRow = null;
            const clientId = d.client_id || o.client_id;
            if (clientId) {
              if (sb) {
                try {
                  const { data: cRow } = await sb.from('clients').select('*').eq('id', clientId).maybeSingle();
                  clientRow = cRow;
                } catch (_) {}
              }
              if (!clientRow) {
                try {
                  const cRows = await fetchDirectPublic(`clients?id=eq.${clientId}`);
                  if (Array.isArray(cRows) && cRows.length > 0) clientRow = cRows[0];
                } catch (_) {}
              }
            }
            if (!clientRow && (d.client_name || o.client_name)) {
              const cName = (d.client_name || o.client_name || '').trim().toLowerCase();
              let allC = null;
              if (sb) {
                try {
                  const { data } = await sb.from('clients').select('*');
                  if (Array.isArray(data)) allC = data;
                } catch (_) {}
              }
              if (!allC) {
                try {
                  allC = await fetchDirectPublic('clients?select=*');
                } catch (_) {}
              }
              if (Array.isArray(allC)) {
                clientRow = allC.find(c => String(c.name || '').trim().toLowerCase() === cName) ||
                  allC.find(c => cName.includes(String(c.name || '').trim().toLowerCase()));
              }
            }

            // Get items
            let items = Array.isArray(d.items) && d.items.length ? d.items : [];
            if (!items.length && Array.isArray(meta.items_meta)) {
              items = meta.items_meta;
            }

            // Build full reconstructed invoice doc
            const invDateIso = d.dispatch_date || o.date || new Date().toISOString().substring(0, 10);
            const clientName = clientRow?.name || d.client_name || o.client_name || 'Customer';
            const clientPhone = clientRow?.phone || clientRow?.contact || clientRow?.mobile || d.client_phone || o.client_phone || '';
            const clientGstin = clientRow?.gst || clientRow?.gstin || '';
            const clientDue = parseFloat(clientRow?.balance || 0);

            const resolveAddrFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState)
              ? window.resolveClientAddressAndState
              : (typeof resolveClientAddressAndState === 'function' ? resolveClientAddressAndState : null);
            const resolvedClient = resolveAddrFn ? resolveAddrFn({
              address: clientRow?.address || d.client_address || o.shipping_address || '',
              city: clientRow?.city || '',
              state: clientRow?.state || '',
              pincode: clientRow?.pincode || clientRow?.pin || '',
              gstin: clientGstin
            }) : {
              cleanAddress: clientRow?.city || clientRow?.address || '',
              state: clientRow?.state || '',
              pincode: clientRow?.pincode || ''
            };

            // Deduplicate items
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

            const formatPackSize = (str) => {
              if (!str) return '—';
              return String(str).replace(/\b(ml|ltr|kg|gm)\b/gi, m => m.toUpperCase());
            };

            let subtotal = 0;
            const rows = uniqueItems.map((it, idx) => {
              const qty = it.total_units_dispatched || it.quantity || 0;
              const boxes = it.boxes_dispatched || 0;
              const packaging = formatPackSize(it.packaging_size || it.packing_size || '1 Litre');
              const unitsPerBox = it.units_per_box ? parseInt(it.units_per_box, 10) : ((boxes > 0 && qty > 0) ? Math.round(qty / boxes) : 10);
              const price = parseFloat(it.unit_price) || (parseFloat(it.total_amount) && qty ? (parseFloat(it.total_amount) / qty) : 0);
              const lineTotal = parseFloat(it.total_amount) || (qty * price);
              subtotal += lineTotal;

              return {
                id: 'r_' + (idx + 1),
                brand: 'Anjani Agri Care',
                name: it.product_name || 'Product',
                desc: it.product_name || '',
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
            });

            const cgst = subtotal * 0.06;
            const sgst = subtotal * 0.06;
            const grandTotal = subtotal + cgst + sgst;

            const fullDoc = {
              Date: invDateIso,
              date: invDateIso,
              DueDate: invDateIso,
              dueDate: invDateIso,
              dispatchNo: d.dispatch_no,
              vehicleNo: d.vehicle_no || '',
              meta: {
                uniqueId: dInvNo,
                invoiceNumber: dInvNo,
                date: invDateIso,
                dueDate: invDateIso,
                dispatchNo: d.dispatch_no,
                vehicleNo: d.vehicle_no || ''
              },
              InvoiceNumber: dInvNo,
              InvoiceType: 'GST',
              business: {
                company: 'Anjani Agri Care',
                address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.',
                phone: '96646 75227',
                email: 'anjaniagricare@gmail.com',
                gstin: '24AERFS1718Q1ZB',
                signatory: 'Tirth'
              },
              bank: {
                name: 'PUNJAB NATIONAL BANK',
                account: '9178002100002019',
                ifsc: 'PUNB0917800',
                upi: '9427213943m@pnb'
              },
              customer: {
                name: clientName,
                address: resolvedClient.cleanAddress,
                city: clientRow?.city || '',
                contact: clientPhone,
                phone: clientPhone,
                mobile: clientPhone,
                gst: clientGstin,
                gstin: clientGstin,
                state: resolvedClient.state || '',
                pincode: resolvedClient.pincode || '',
                pin: resolvedClient.pincode || '',
                stateCode: (typeof getStateCodeFromName === 'function' ? getStateCodeFromName(resolvedClient.state) : '') || '',
                placeOfSupply: resolvedClient.state || '',
                dueAmount: clientDue
              },
              settings: {
                intro: 'Thank you for your business. Please find your commercial tax invoice details below.',
                terms: '',
                showQR: true,
                taxType: 'GST12'
              },
              rows: rows,
              calculations: {
                subtotal: subtotal,
                taxType: 'GST12',
                cgstRate: 6,
                sgstRate: 6,
                igstRate: 0,
                cgstAmount: cgst,
                sgstAmount: sgst,
                igstAmount: 0,
                totalTax: cgst + sgst,
                grandTotal: grandTotal,
                dueAmount: clientDue
              },
              is_stock_deducted: false
            };

            safeStorage.setItem('inv_doc_' + tid, JSON.stringify(fullDoc));
            safeStorage.setItem('inv_doc_' + dInvNo, JSON.stringify(fullDoc));
            safeStorage.setItem('current_edit_invoice', JSON.stringify(fullDoc));
            return fullDoc;
          }
        }
      } catch (_) {}
    }
  }

  // 4. Fallback to Supabase invoices table if present
  let invRow = null;
  if (sb) {
    try {
      const { data } = await sb.from('invoices')
        .select('*')
        .or(`invoice_no.eq.${tid},invoice_no.eq.${decoded},id.eq.${tid}`)
        .maybeSingle();
      invRow = data;
    } catch (_) {}
  }
  if (!invRow) {
    try {
      const invRows = await fetchDirectPublic(`invoices?or=(invoice_no.eq.${encodeURIComponent(tid)},invoice_no.eq.${encodeURIComponent(decoded)})`);
      if (Array.isArray(invRows) && invRows.length > 0) invRow = invRows[0];
    } catch (_) {}
  }

  if (invRow) {
    let dispatchItems = [];
    let dispatchRow = null;
    if (invRow.dispatch_id) {
      if (sb) {
        try {
          const { data: dRow } = await sb.from('order_dispatches').select('*').eq('id', invRow.dispatch_id).maybeSingle();
          dispatchRow = dRow;
          const { data: dItems } = await sb.from('dispatch_items').select('*').eq('dispatch_id', invRow.dispatch_id);
          dispatchItems = dItems || [];
        } catch (_) {}
      }
      if (!dispatchRow) {
        try {
          const dRows = await fetchDirectPublic(`order_dispatches?id=eq.${invRow.dispatch_id}`);
          if (Array.isArray(dRows) && dRows.length > 0) dispatchRow = dRows[0];
          const itRows = await fetchDirectPublic(`dispatch_items?dispatch_id=eq.${invRow.dispatch_id}`);
          if (Array.isArray(itRows)) dispatchItems = itRows;
        } catch (_) {}
      }
    }
    let clientRow = null;
    if (invRow.client_id) {
      if (sb) {
        try {
          const { data: cRow } = await sb.from('clients').select('*').eq('id', invRow.client_id).maybeSingle();
          clientRow = cRow;
        } catch (_) {}
      }
      if (!clientRow) {
        try {
          const cRows = await fetchDirectPublic(`clients?id=eq.${invRow.client_id}`);
          if (Array.isArray(cRows) && cRows.length > 0) clientRow = cRows[0];
        } catch (_) {}
      }
    }

    const reconstructed = _buildInvoiceDocFromRemote(invRow, dispatchRow, dispatchItems, clientRow);
    if (reconstructed) {
      safeStorage.setItem('inv_doc_' + tid, JSON.stringify(reconstructed));
      safeStorage.setItem('current_edit_invoice', JSON.stringify(reconstructed));
      return reconstructed;
    }
  }

  // 5. Return history match if available as fallback
  const history = await apiGetInvoices();
  const match = history.find(i =>
    String(i.uniqueId).trim() === tid ||
    String(i.uniqueId).trim() === decoded ||
    String(i.invoiceNumber).trim() === tid ||
    String(i.invoiceNumber).trim() === decoded
  );
  if (match) return match;
  throw new Error('Invoice not found: ' + uniqueId);
}

function _buildInvoiceDocFromRemote(invRow, dispatchRow, items = [], clientRow = null) {
  const invNo = invRow.invoice_no || `INV-${invRow.id}`;
  const invDate = invRow.invoice_date || new Date().toISOString().substring(0, 10);
  const clientName = clientRow?.name || invRow.client_name || 'Customer';
  const clientAddr = clientRow?.address || '';
  const clientPhone = clientRow?.phone || '';
  const clientGstin = clientRow?.gstin || '';
  const clientDue = parseFloat(clientRow?.balance || 0);
  const clientState = clientRow?.state || (clientAddr.match(/(?:Gujarat|Maharashtra|Rajasthan|Madhya Pradesh|Punjab|Haryana|Delhi)/i)?.[0]) || '';
  let clientPin = clientRow?.pincode || clientRow?.pin || (clientAddr.match(/\b\d{6}\b/)?.[0]) || '';

  const subtotal = parseFloat(invRow.subtotal) || items.reduce((s, it) => s + (parseFloat(it.total_amount) || 0), 0);
  const totalTax = parseFloat(invRow.tax_amount) || (subtotal * 0.12);
  const grandTotal = parseFloat(invRow.total_amount) || (subtotal + totalTax);
  const cgst = totalTax / 2;
  const sgst = totalTax / 2;

  return {
    meta: {
      uniqueId: invNo,
      invoiceNumber: invNo,
      date: invDate,
      dueDate: invDate,
      dispatchNo: dispatchRow?.dispatch_no || ''
    },
    InvoiceNumber: invNo,
    InvoiceType: 'GST',
    business: {
      company: 'Anjani Agri Care',
      address: 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot',
      state: 'Gujarat',
      pincode: '360024',
      phone: '96646 75227',
      email: 'anjaniagricare@gmail.com',
      gstin: '24AERFS1718Q1ZB',
      signatory: 'Tirth'
    },
    bank: {
      name: 'PUNJAB NATIONAL BANK',
      account: '9178002100002019',
      ifsc: 'PUNB0917800',
      upi: '9427213943m@pnb'
    },
    customer: {
      name: clientName,
      address: clientAddr,
      state: clientState,
      pincode: clientPin,
      phone: clientPhone,
      gstin: clientGstin,
      stateCode: (typeof getStateCodeFromName === 'function' ? getStateCodeFromName(clientState) : '') || '',
      placeOfSupply: clientState || '',
      dueAmount: clientDue
    },
    settings: {
      intro: 'Thank you for your business. Please find your commercial tax invoice details below.',
      terms: '',
      showQR: true,
      taxType: 'GST12'
    },
    rows: items.map((it, idx) => {
      const qty = it.total_units_dispatched || it.quantity || 0;
      const boxes = it.boxes_dispatched || 0;
      const packaging = it.packaging_size || '1 Litre';
      const unitsPerBox = (boxes > 0 && qty > 0) ? Math.round(qty / boxes) : 10;
      const price = parseFloat(it.unit_price) || (parseFloat(it.total_amount) && qty ? (parseFloat(it.total_amount) / qty) : 0);
      const lineTotal = parseFloat(it.total_amount) || (qty * price);
      return {
        id: 'r_' + (idx + 1),
        brand: 'Anjani Agri Care',
        name: it.product_name || 'Product',
        desc: it.product_name || 'Product',
        packaging: packaging,
        boxes: boxes,
        unitsPerBox: unitsPerBox,
        loose: 0,
        totalUnits: qty,
        qtyUnit: 'Bottles',
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
      totalTax: totalTax,
      grandTotal: grandTotal,
      dueAmount: clientDue
    },
    is_stock_deducted: false
  };
}

async function apiSaveInvoice(invoiceData) {
  _validateInvoicePayload(invoiceData);
  const uniqueId = invoiceData.meta?.uniqueId || ('INV-' + Date.now().toString(36).toUpperCase());
  invoiceData.meta = invoiceData.meta || {};
  invoiceData.meta.uniqueId = uniqueId;

  // Persist the full document payload in safeStorage
  safeStorage.setItem('inv_doc_' + uniqueId, JSON.stringify(invoiceData));

  // Update history cache list
  let history = [];
  try {
    history = JSON.parse(safeStorage.getItem('invoice_history_cache') || '[]');
  } catch (e) { history = []; }

  const summary = {
    uniqueId: uniqueId,
    invoiceNumber: invoiceData.InvoiceNumber || invoiceData.meta?.invoiceNumber || uniqueId,
    date: invoiceData.meta?.date || new Date().toISOString().substring(0, 10),
    dueDate: invoiceData.meta?.dueDate || '',
    customerName: invoiceData.customer?.name || invoiceData.ClientName || 'Unnamed Client',
    mobile: invoiceData.customer?.phone || invoiceData.Phone || '',
    totalAmount: parseFloat(invoiceData.calculations?.grandTotal || invoiceData.GrandTotal || 0) || 0,
    totalBoxes: (invoiceData.rows || []).reduce((sum, r) => sum + (parseFloat(r.boxes) || 0), 0),
    totalUnits: (invoiceData.rows || []).reduce((sum, r) => sum + (parseFloat(r.totalUnits || r.qty) || 0), 0),
    is_stock_deducted: invoiceData.is_stock_deducted !== undefined ? invoiceData.is_stock_deducted : false
  };

  const existingIdx = history.findIndex(h => h.uniqueId === uniqueId);
  if (existingIdx >= 0) {
    history[existingIdx] = { ...history[existingIdx], ...summary };
  } else {
    history.unshift(summary);
  }
  safeStorage.setItem('invoice_history_cache', JSON.stringify(history));

  return { success: true, uniqueId, invoiceNumber: summary.invoiceNumber, row: 1 };
}

async function apiUpdateInvoice(invoiceData) {
  return await apiSaveInvoice(invoiceData);
}

async function apiDeleteInvoice(uniqueId) {
  if (!uniqueId) throw new Error('Invoice ID is required for deletion.');
  safeStorage.removeItem('inv_doc_' + uniqueId);
  try {
    let history = JSON.parse(safeStorage.getItem('invoice_history_cache') || '[]');
    history = history.filter(i => i.uniqueId !== uniqueId);
    safeStorage.setItem('invoice_history_cache', JSON.stringify(history));
  } catch(e) {}
  return { success: true };
}

async function apiUpdateClientDue(clientName, dueAmount) {
  if (!clientName) return;
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.from('clients').update({ balance: parseFloat(dueAmount) || 0 }).ilike('name', clientName.trim());
    } catch(e) {
      console.warn('apiUpdateClientDue note:', e.message);
    }
  }
}

/**
 * Standard Manual Invoice Number Generator (100, 101, 102...)
 * Ignores commercial dispatch invoices (DSP- prefix) so manual invoices stay clean.
 */
async function apiGetNextInvoiceNumber() {
  const cached = safeStorage.getItem('invoice_history_cache');
  if (cached) {
    try {
      const list = JSON.parse(cached);
      const standardNums = list
        .filter(i => {
          const numStr = String(i.invoiceNumber || i.InvoiceNumber || '').trim();
          return !numStr.startsWith('DSP') && !numStr.startsWith('INV') && !numStr.includes('DSP') && !numStr.includes('INV');
        })
        .map(i => parseInt(String(i.invoiceNumber || i.InvoiceNumber || 0).replace(/[^0-9]/g, ''), 10) || 0);
      const max = Math.max(99, ...standardNums);
      return String(max + 1).padStart(3, '0');
    } catch (e) {}
  }
  return '100';
}

/**
 * Commercial Dispatch Invoice Number Generator (DSP-INV-100, DSP-INV-101...)
 * Starts from 100 with DSP-INV- prefix to keep contexts cleanly separated.
 */
async function apiGetNextDispatchInvoiceNumber() {
  const cached = safeStorage.getItem('invoice_history_cache');
  let max = 99;
  if (cached) {
    try {
      const list = JSON.parse(cached);
      list.forEach(i => {
        const numStr = String(i.invoiceNumber || i.InvoiceNumber || '').trim();
        const match = numStr.match(/DSP-INV-(\d+)/i) || numStr.match(/DSP-(\d+)/i);
        if (match && match[1]) {
          const val = parseInt(match[1], 10);
          if (val > max) max = val;
        }
      });
    } catch (e) {}
  }
  return `DSP-INV-${max + 1}`;
}

// ─── PRIVATE VALIDATION ───────────────────────────────────────────────────────
function _validateInvoicePayload(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid invoice payload.');
  if (!data.meta) throw new Error('Invoice is missing meta block.');
  if (!data.customer) throw new Error('Invoice is missing customer block.');
  if (!Array.isArray(data.rows) || data.rows.length === 0) throw new Error('Invoice must have at least one product row.');
}

// ─── SHARED UI HELPERS (Theme & Profile) ──────────────────────────────────────
function applyTheme(theme = 'light') {
  const current = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', current);
  safeStorage.setItem('theme', current);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  safeStorage.setItem('theme', next);
  localStorage.setItem('theme', next);
}

function showProfileSymbol() {
  const tr = document.getElementById('toolbar-right') || document.getElementById('toolbar-actions');
  if (!tr || document.getElementById('profile-symbol')) return;

  const p = document.createElement('div');
  p.id = 'profile-symbol';
  p.className = 'profile-circle';
  p.textContent = 'AAC';
  p.setAttribute('aria-label', 'Anjani Agri Care');
  const mobile = (typeof safeStorage !== 'undefined' && safeStorage?.getItem('inv_user_mobile')) || '96646 75227';
  p.title = `Anjani Agri Care • ${mobile}`;
  tr.appendChild(p);
}

// Global initialization for all pages
window.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('theme') || 'light');
  showProfileSymbol();

  // ─── GLOBAL TEXT FORMATTING ───────────────────────────────────────────────
  // Apply special formatting to all text-like inputs site-wide
  const handleFormatting = (e) => {
    const el = e.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const skipTypes = ['password', 'date', 'checkbox', 'radio', 'file', 'email'];
      if (skipTypes.includes(el.type)) return;

      // Check if it's a phone field
      const isPhone = el.id.toLowerCase().includes('phone') || (el.placeholder && el.placeholder.toLowerCase().includes('phone'));

      if (el.value) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const originalVal = el.value;

        let formatted = originalVal;

        if (isPhone) {
          formatted = formatPhone(originalVal);
          // Prevent cursor jump on phone replace
          if (originalVal !== formatted) {
            el.value = formatted;
            return; // Let user type naturally, phone formatting handles ends
          }
        } else {
          if (el.type !== 'number' && el.type !== 'tel') {
            formatted = formatText(originalVal);
          }
        }

        if (originalVal !== formatted && !isPhone) {
          el.value = formatted;
          // Restore cursor position for 'input' event to prevent jumping
          if (e.type === 'input') {
            try { el.setSelectionRange(start, end); } catch (ex) { }
          }
        }
      }
    }
  };

  document.addEventListener('input', handleFormatting, true);
  document.addEventListener('blur', handleFormatting, true);
  document.addEventListener('change', handleFormatting, true);
});

/**
 * Custom text formatter:
 * 1. Title Case everything BEFORE the '%' character.
 * 2. Force uppercase for specific units (LTR, ML, KG, GM).
 * 3. UPPERCASE everything AFTER the '%' character.
 * Example: "1 ltr water%batch123" -> "1 LTR Water%BATCH123"
 */
function formatText(str) {
  if (!str && str !== 0) return '';
  str = String(str);

  const parts = str.split('%');

  // Step 1: Processing the first part
  let firstPart = parts[0].toLowerCase().split(' ').map(word => {
    if (!word) return '';

    // Default Title Case (handles leading punctuation like parentheses)
    let res = word.replace(/^([^a-zA-Z]*)([a-zA-Z])(.*)$/, (match, prefix, firstLetter, rest) => {
      return prefix + firstLetter.toUpperCase() + rest;
    });
    if (res === word) {
      res = word.charAt(0).toUpperCase() + word.slice(1);
    }

    // If the word IS exactly one of our units (case-insensitive)
    const specialUnits = ['LTR', 'ML', 'KG', 'GM'];
    if (specialUnits.includes(word.toUpperCase())) {
      return word.toUpperCase();
    }

    // Also catch units attached to numbers (e.g., "500ml" or "1ltr")
    // This regex looks for digits followed by one of our units
    const unitRegex = new RegExp('(\\d+)(ltr|ml|kg|gm)', 'i');
    res = res.replace(unitRegex, (match, num, unit) => {
      return num + unit.toUpperCase();
    });

    return res;
  }).join(' ');

  // Step 2: Processing the part after the '%' if it exists
  if (parts.length > 1) {
    const rest = parts.slice(1).join('%').toUpperCase();
    return firstPart + '%' + rest;
  }
  return firstPart;
}

/**
 * Formats a phone number as "99999 99999" taking only the first 10 digits.
 */
function formatPhone(str) {
  if (!str) return '';
  let digits = String(str).replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) {
    return digits.slice(0, 5) + ' ' + digits.slice(5);
  }
  return digits;
}

window.formatText = formatText;
window.formatPhone = formatPhone;

