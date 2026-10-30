/* =============================================================================
   main.js — Invoice System
   Production-ready, full-featured invoice management
   ============================================================================= */

'use strict';

// Ensure tax-utils functions are available on global scope (falling back if tax-utils.js is not loaded)
if (typeof globalThis.normalizeTaxType !== 'function') {
  globalThis.normalizeTaxType = (v) => (typeof v === 'string' && v.toUpperCase().includes('12') ? 'GST12' : (typeof v === 'string' && v.toUpperCase().includes('5') ? 'GST5' : (typeof v === 'string' && v.toUpperCase().includes('18') ? 'GST18' : 'NONE')));
}
if (typeof globalThis.getTaxConfig !== 'function') {
  globalThis.getTaxConfig = (v) => ((typeof TAX_TYPE_CONFIG !== 'undefined' && TAX_TYPE_CONFIG[v]) ? TAX_TYPE_CONFIG[v] : { key: 'NONE', label: 'None GST 0%', rate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 });
}
if (typeof globalThis.calculateInvoiceTotals !== 'function') {
  globalThis.calculateInvoiceTotals = (sub, taxType, due) => ({ subtotal: sub, taxType: taxType || 'NONE', cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, grandTotal: sub + (Number(due) || 0), dueAmount: Number(due) || 0 });
}
if (typeof globalThis.formatTaxLabel !== 'function') {
  globalThis.formatTaxLabel = (taxType) => (typeof globalThis.getTaxConfig === 'function' ? globalThis.getTaxConfig(taxType).label : String(taxType || ''));
}
const safeStorage = (typeof window !== 'undefined' && window.safeStorage) ? window.safeStorage : {
  getItem: (k) => { try { return localStorage.getItem(k); } catch(e) { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch(e) {} }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function cleanItemName(name) {
  if (!name) return '';
  let str = String(name).trim();
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => /boxes/i.test(match) ? 'Boxes' : 'Box');
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => /boxes/i.test(match) ? 'Boxes' : 'Box');
  return str.replace(/\s{2,}/g, ' ').trim();
}

function cleanUnitLabel(text) {
  if (!text) return '';
  let str = String(text).trim();
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => /boxes/i.test(match) ? 'Boxes' : 'Box');
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => /boxes/i.test(match) ? 'Boxes' : 'Box');
  str = str.replace(/\b(bottles|bottle)(?:\s+|-)+(?:bottles|bottle)\b/gi, (match) => /bottles/i.test(match) ? 'Bottles' : 'Bottle');
  str = str.replace(/\b(nos|no)(?:\s+|-)+(?:nos|no)\b/gi, 'Nos');
  str = str.replace(/\b(kg|kgs|kilogram|kilograms)(?:\s+|-)+(?:kg|kgs|kilogram|kilograms)\b/gi, 'Kg');
  str = str.replace(/\b(litre|litres|ltr|ltrs)(?:\s+|-)+(?:litre|litres|ltr|ltrs)\b/gi, 'Litre');
  str = str.replace(/\b(ml|milliliters|milliliter)(?:\s+|-)+(?:ml|milliliters|milliliter)\b/gi, 'Ml');
  return str.replace(/\s{2,}/g, ' ').trim();
}

const INR = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeBusinessName(value) {
  if (!value || value === 'AgroChem' || value === 'Agro Chem' || value === 'Afield Crop Care' || value === 'Estimate') return 'Anjani Agri Care';
  return value;
}

function normalizeGSTIN(value) {
  return String(value || '').trim().toUpperCase();
}

function formatClientGSTINForPreview(value) {
  const gstin = normalizeGSTIN(value);
  return gstin ? `GSTIN:\u00A0${gstin}` : '';
}

function formatClientPhoneForPreview(value) {
  const phone = String(value || '').trim();
  if (!phone) return '';
  return /^mo\./i.test(phone) ? phone : `Mo. ${phone}`;
}

function formatPhoneDisplay(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return String(value).trim();
}

function getUniqueBrands() {
  return [...new Set(inventoryData
    .map(item => (item.brand || item.BrandName || '').toString().trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

window.getAllProducts = getAllProducts;
window.getUniqueBrands = getUniqueBrands;
window.getProductsForBrand = getProductsForBrand;
window.getPackagingForProduct = getPackagingForProduct;

function getAllProducts() {
  return [...new Set(inventoryData
    .map(item => (item.product || item.ProductName || '').toString().trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function getProductsForBrand(brand) {
  const brandKey = normalizeText(brand);
  return [...new Set(inventoryData
    .filter(item => normalizeText(item.brand || item.BrandName) === brandKey)
    .map(item => (item.product || item.ProductName || '').toString().trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function parsePackagingToUnits(pkgStr) {
  if (!pkgStr) return -1;
  const str = String(pkgStr).trim().toLowerCase();
  const match = str.match(/([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)/i);
  if (!match) return -1;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Volume units (Ltr, Litre, L, ML, etc.)
  if (/^(l|ltr|ltrs|liter|litre|litres)$/i.test(unit) || unit.startsWith('l')) {
    return val * 1000;
  }
  if (/^(ml|milliliter|millilitre)$/i.test(unit) || unit.startsWith('m')) {
    return val;
  }

  // Weight units (Kg, Kgs, gm, g, Gram, etc.)
  if (/^(kg|kgs|kilo|kilogram|kilograms)$/i.test(unit) || unit.startsWith('k')) {
    return val * 1000;
  }
  if (/^(g|gm|gms|gram|grams)$/i.test(unit) || unit.startsWith('g')) {
    return val;
  }
  return val;
}

function comparePackagingHigherToLower(a, b) {
  const vA = parsePackagingToUnits(a);
  const vB = parsePackagingToUnits(b);
  if (vA !== vB) return vB - vA; // Higher to lower
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function getPackagingForProduct(brand, product) {
  const brandKey = normalizeText(brand);
  const productKey = normalizeText(product);
  return [...new Set(inventoryData
    .filter(item => normalizeText(item.product || item.ProductName) === productKey && (!brandKey || normalizeText(item.brand || item.BrandName) === brandKey))
    .map(item => (item.packaging || item.PackagingSize || '').toString().trim())
    .filter(Boolean))]
    .sort(comparePackagingHigherToLower);
}

function getPriceForPackaging(brand, product, packaging) {
  const brandKey = normalizeText(brand);
  const productKey = normalizeText(product);
  const packagingKey = normalizeText(packaging);
  const match = inventoryData.find(item =>
    (!brandKey || normalizeText(item.brand || item.BrandName) === brandKey) &&
    normalizeText(item.product || item.ProductName) === productKey &&
    (!packagingKey || normalizeText(item.packaging || item.PackagingSize) === packagingKey)
  );
  if (!match) return '';
  return (match.price || match.Price || '').toString().trim();
}

function parseVolumeOrWeight(pkgStr) {
  if (!pkgStr) return { value: 0, unit: 'Litres', litres: 0 };
  const str = String(pkgStr).trim().toLowerCase();
  const match = str.match(/([0-9]+(?:\.[0-9]+)?)\s*([a-z]+)/i);
  if (!match) return { value: 0, unit: 'Litres', litres: 0 };
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  // Volume
  if (/^(l|ltr|ltrs|liter|litre|litres)$/i.test(unit)) {
    return { value: val, unit: 'Litres', litres: val };
  }
  if (/^(ml|milliliter|millilitre)$/i.test(unit)) {
    return { value: val, unit: 'ml', litres: val / 1000 };
  }

  // Weight
  if (/^(kg|kgs|kilo|kilogram|kilograms)$/i.test(unit)) {
    return { value: val, unit: 'Kg', litres: val };
  }
  if (/^(g|gm|gms|gram|grams)$/i.test(unit)) {
    return { value: val, unit: 'gm', litres: val / 1000 };
  }

  return { value: val, unit: match[2], litres: val };
}

function getPackagingDetailsForProduct(brand, product, packagingSize) {
  const brandKey = normalizeText(brand);
  const prodKey = normalizeText(product);
  const pkgKey = normalizeText(packagingSize);
  const match = inventoryData.find(item =>
    (!brandKey || normalizeText(item.brand || item.BrandName) === brandKey) &&
    normalizeText(item.product || item.ProductName) === prodKey &&
    (!pkgKey || normalizeText(item.packaging || item.PackagingSize) === pkgKey)
  );
  if (!match) return null;
  return {
    unitsPerBox: parseInt(match.units_per_box || match.unitsPerBox || 0, 10) || 0,
    volumeMl: parseFloat(match.volume_ml || match.volumeMl || 0) || 0,
    weightGm: parseFloat(match.weight_gm || match.weightGm || 0) || 0,
    unit: match.unit || 'Bottles',
    sku: match.sku || '',
    price: match.price || match.Price || 0,
    hsn: match.hsn || ''
  };
}

function calculateLineItemQuantities(row) {
  const unitsPerBox = parseInt(row.unitsPerBox, 10) || 0;
  const boxes = parseFloat(row.boxes) || 0;
  const loose = parseFloat(row.loose) || 0;
  let totalUnits = parseFloat(row.totalUnits != null ? row.totalUnits : row.qty) || 0;

  // Preserve explicit totalUnits / qty from loaded document or order!
  // Only calculate totalUnits if it was 0 or unassigned
  if (totalUnits === 0 && (boxes > 0 || loose > 0)) {
    totalUnits = (boxes * (unitsPerBox > 0 ? unitsPerBox : 1)) + loose;
  } else if (totalUnits > 0 && unitsPerBox > 0 && boxes === 0 && loose === 0) {
    row.boxes = Math.floor(totalUnits / unitsPerBox);
    row.loose = totalUnits % unitsPerBox;
  } else if (parseFloat(row.qty) > 0 && totalUnits === 0) {
    totalUnits = parseFloat(row.qty);
    if (unitsPerBox > 0) {
      row.boxes = Math.floor(totalUnits / unitsPerBox);
      row.loose = totalUnits % unitsPerBox;
    }
  }

  // Determine billed quantity based on pricing basis
  let billedQty = totalUnits;
  if (row.priceBasis === 'per_box') {
    billedQty = boxes + (unitsPerBox > 0 ? (loose / unitsPerBox) : 0);
  } else {
    billedQty = totalUnits;
  }

  // Parse equivalent volume/weight
  const parsedVol = parseVolumeOrWeight(row.packaging);
  const totalVolume = parsedVol.litres > 0 ? Math.round(totalUnits * parsedVol.litres * 100) / 100 : 0;
  const volumeUnit = parsedVol.unit === 'Kg' || parsedVol.unit === 'gm' ? 'Kg' : 'Litres';

  // Unit price and discount
  const unitPrice = parseFloat(row.price) || 0;
  const discountPct = parseFloat(row.discountPct) || 0;
  const rawLineValue = Math.round(billedQty * unitPrice * 100) / 100;
  const discountAmt = Math.round(rawLineValue * (discountPct / 100) * 100) / 100;
  const taxableValue = Math.round((rawLineValue - discountAmt) * 100) / 100;

  return {
    boxes: row.boxes || 0,
    loose: row.loose || 0,
    unitsPerBox: unitsPerBox,
    totalUnits: totalUnits,
    billedQty: Math.round(billedQty * 100) / 100,
    totalVolume: totalVolume,
    volumeUnit: volumeUnit,
    unitPrice: unitPrice,
    discountPct: discountPct,
    discountAmt: discountAmt,
    taxableValue: taxableValue
  };
}

function toast(msg, type = '') {
  const t = $('toast');
  if (!t) return;

  const isPdfDownloadObj = typeof msg === 'object' && msg !== null && msg.type === 'download-success';
  const isPdfDownloadStr = typeof msg === 'string' && /pdf download/i.test(msg);

  if (typeof msg === 'string' && msg.toLowerCase().startsWith('loading invoice')) {
    const rawId = msg.replace(/^loading invoice\s*/i, '').replace(/\.*$/, '').trim();
    t.innerHTML = `
      <div class="toast-loading-spinner"></div>
      <div class="toast-content">
        <div class="toast-title">Loading Invoice</div>
        ${rawId ? `<div class="toast-sub" title="${esc(rawId)}">${esc(rawId)}</div>` : ''}
      </div>
    `;
    t.className = 'toast-loading toast-card show';
  } else if (isPdfDownloadObj || isPdfDownloadStr) {
    let nextInv = '';
    if (isPdfDownloadObj) {
      nextInv = (msg.nextInvoice || '').trim();
    } else {
      const match = msg.match(/next invoice\s*(?:number)?\s*(?:is ready\s*)?:?\s*([A-Za-z0-9_-]+)/i);
      if (match && match[1] && !/ready/i.test(match[1])) {
        nextInv = match[1].trim();
      }
    }
    if (!nextInv) {
      const domNext = $('s-inv-num')?.value || $('p-inv-num')?.textContent || '';
      if (domNext && domNext.trim() !== '') nextInv = domNext.trim();
    }

    t.innerHTML = `
      <div class="toast-icon-wrap toast-success-icon">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="10" fill="var(--primary)" opacity="0.16" />
          <circle cx="10" cy="10" r="8" fill="var(--primary)" />
          <path d="M6.5 10.2L8.8 12.5L13.5 7.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="toast-content">
        <div class="toast-title">PDF Downloaded Successfully</div>
        ${nextInv ? `<div class="toast-sub">Next Invoice: <span class="toast-badge" title="${esc(nextInv)}">${esc(nextInv)}</span></div>` : ''}
      </div>
    `;
    t.className = 'toast-success toast-card show';
  } else {
    t.textContent = typeof msg === 'object' && msg !== null ? (msg.title || '') : msg;
    t.className = type === 'error' ? 'error show' : 'show';
  }

  if (t._timer) clearTimeout(t._timer);
  const duration = (t.classList.contains('toast-loading') || t.classList.contains('toast-card')) ? 3200 : 2500;
  t._timer = setTimeout(() => { t.className = ''; }, duration);
}

let fixedInfoOpen = false;
let lastAddItemClickAt = 0;

function toggleFixedInfo() {
  fixedInfoOpen = !fixedInfoOpen;
  const block = $('fixed-info-block');
  const chevron = $('fixed-chevron');
  const banner = $('fixed-info-banner');
  if (block) block.style.display = fixedInfoOpen ? '' : 'none';
  if (chevron) chevron.classList.toggle('open', fixedInfoOpen);
  if (banner) banner.style.borderBottom = fixedInfoOpen ? '1px solid rgba(12, 57, 37, 0.25)' : '1px solid var(--border)';
}

function togglePanel(blockId, chevronId) {
  const block = $(blockId);
  const chevron = $(chevronId);
  if (!block) return;
  const isOpen = block.style.display !== 'none';
  block.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

window.toggleFixedInfo = toggleFixedInfo;
window.togglePanel = togglePanel;

function handleAddItemClick(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const now = Date.now();
  if (now - lastAddItemClickAt < 250) return;
  lastAddItemClickAt = now;
  addRow();
}

window.handleAddItemClick = handleAddItemClick;

function debounce(fn, delay = 300) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const normalized = String(iso).slice(0, 10);
    const date = new Date(`${normalized}T12:00:00+05:30`);
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch { return iso; }
}

function getTodayInIndiaISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const LS_KEY = 'sk_inv_data_v2';
const LS_INV_NUM_KEY = 'sk_inv_num';
var rows = [];
var rowCounter = 0;
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'rows', {
      get() { return rows; },
      set(v) { rows = Array.isArray(v) ? v : []; },
      configurable: true
    });
    Object.defineProperty(window, 'rowCounter', {
      get() { return rowCounter; },
      set(v) { rowCounter = v; },
      configurable: true
    });
  } catch(e) {
    window.rows = rows;
  }
}
let logoDataUrl = null;
let inventoryData = []; // [{brand, product, packaging, price}]
let clientsData = [];   // [{ClientName, Address, Phone, GSTIN}]
let currentAcInput = null;
let qrInstance = null;
window._invoiceSavedOnce = false;
window.currentInvoiceId = null;
window.currentInvoiceFinalized = false;

// Google Sheets CSV URL (Products sheet)
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1axb8I12FZrcSzdEUKrdlO7kpgQ0-BJ6wYSKv32gPQZI/export?format=csv&gid=1301639597';

// ─── USERS ────────────────────────────────────────────────────────────────────
const USERS = [
  { username: 'Tirth', password: 'Tirth', mobile: '9664675227' },
];

function normalizeProductRow(item) {
  return {
    brand: String(item.brand || item.BrandName || item['Brand Name'] || '').trim(),
    product: String(item.product || item.ProductName || item['Product Name'] || item.name || '').trim(),
    sku: String(item.sku || item.SKU || '').trim(),
    packaging: String(item.packaging || item.PackagingSize || item['Packaging Size'] || item.size || '').trim(),
    units_per_box: parseInt(item.units_per_box || item.unitsPerBox || item['Units Per Box'] || 0, 10) || 0,
    volume_ml: parseFloat(item.volume_ml || item.volumeMl || 0) || 0,
    weight_gm: parseFloat(item.weight_gm || item.weightGm || 0) || 0,
    unit: String(item.unit || item.base_unit || item['Unit'] || 'Bottles').trim(),
    price: String(item.price || item.UnitPrice || item['Unit Price'] || '').trim(),
    hsn: String(item.hsn || item.HSN || item['HSN/SAC'] || '').trim(),
  };
}

function normalizeClientRow(item) {
  return {
    ClientID: String(item.ClientID || item.id || '').trim(),
    ClientName: String(item.ClientName || item['Client Name'] || item.client || item.name || '').trim(),
    Address: String(item.Address || item.address || '').trim(),
    City: String(item.City || item.city || '').trim(),
    State: String(item.State || item.state || item.shipping_state || item.billing_state || '').trim(),
    Pincode: String(item.Pincode || item.pincode || item.pin || item.Pin || '').trim(),
    Phone: String(item.Phone || item.phone || item.Mobile || item.mobile || '').trim(),
    GSTIN: String(item.GSTIN || item.gstin || item.gst || item.GST || '').trim(),
    DueAmount: parseFloat(item.DueAmount || item['Due Amount'] || item.dueAmount || item.due || 0) || 0,
  };
}

function updateQR() {
  const qrToggle = $('qr-toggle');
  const qrBlock = $('qr-block');
  const qrCanvas = $('qr-canvas');
  if (!qrToggle || !qrBlock || !qrCanvas) return;

  const show = !!qrToggle.checked;
  qrBlock.style.display = show ? '' : 'none';
  qrCanvas.innerHTML = '';
  qrInstance = null;

  if (!show) {
    autoSave();
    return;
  }

  const upi = ($('s-upi')?.value || '').trim() || '9427213943m@pnb';
  const name = ($('s-company')?.value || '').trim() || 'Anjani Agri Care';

  try {
    qrInstance = new QRCode(qrCanvas, {
      text: `upi://pay?pa=${upi}&pn=${encodeURIComponent(name)}`,
      width: 90,
      height: 90,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: (QRCode.CorrectLevel && QRCode.CorrectLevel.M) != null ? QRCode.CorrectLevel.M : 0,
    });
  } catch (err) {
    console.warn('QR render failed:', err);
  }

  autoSave();
}

window.updateQR = updateQR;

function buildQrDataUrl(upi, companyName) {
  if (!window.QRCode) return '';

  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-10000px';
  wrap.style.top = '0';
  wrap.style.width = '90px';
  wrap.style.height = '90px';
  wrap.style.visibility = 'hidden';
  document.body.appendChild(wrap);

  try {
    new QRCode(wrap, {
      text: `upi://pay?pa=${upi}&pn=${encodeURIComponent(companyName)}`,
      width: 90,
      height: 90,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: (QRCode.CorrectLevel && QRCode.CorrectLevel.M) != null ? QRCode.CorrectLevel.M : 0,
    });

    const qrCanvas = wrap.querySelector('canvas');
    if (qrCanvas) return qrCanvas.toDataURL('image/png');

    const qrImg = wrap.querySelector('img');
    if (qrImg?.src) return qrImg.src;
  } catch (err) {
    console.warn('QR export failed:', err);
  } finally {
    wrap.remove();
  }

  return '';
}

function savePdfBlob(pdf, filename) {
  if (typeof window !== 'undefined') {
    window._lastDownloadedInvoicePdf = filename;
    if (typeof window._onPdfSaved === 'function') {
      try { window._onPdfSaved(filename); } catch (_) {}
    }
  }
  if (window.innerWidth <= 768 && typeof pdf.save === 'function') {
    pdf.save(filename);
    return;
  }

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}
window.savePdfBlob = savePdfBlob;

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
      console.warn('Supabase initialization error in Invoice Builder:', e);
    }
  }
  return null;
}

async function loadDefaultLogo() {
  const isApps = window.location.pathname.includes('/apps/');
  const candidates = isApps
    ? ['../../assets/images/logo.jpg', 'logo.jpg', 'public/logo.jpg']
    : ['../assets/images/logo.jpg', 'logo.jpg', 'public/logo.jpg'];
  const sbImg = $('logo-preview-sb');
  const paperImg = $('paper-logo');
  const navImg = $('navbar-logo');

  [sbImg, paperImg, navImg].forEach(el => {
    if (el) {
      el.onerror = () => { el.onerror = null; el.src = 'logo.jpg'; };
      if (!el.src || el.src.includes('undefined')) el.src = isApps ? '../../assets/images/logo.jpg' : '../assets/images/logo.jpg';
      el.style.display = 'block';
    }
  });

  for (const path of candidates) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) continue;
      const ctype = resp.headers.get('content-type') || '';
      if (ctype.includes('text/html')) continue; // Ignore HTML fallback from Vite
      const blob = await resp.blob();
      await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => {
          logoDataUrl = ev.target.result;
          if (sbImg) sbImg.src = logoDataUrl;
          if (paperImg) paperImg.src = logoDataUrl;
          if (navImg) navImg.src = logoDataUrl;
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(blob);
      });
      if (logoDataUrl) return;
    } catch {
      // try next candidate
    }
  }

  if (!logoDataUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function() {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 200;
          canvas.height = img.naturalHeight || img.height || 200;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          logoDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          if (sbImg) sbImg.src = logoDataUrl;
          if (paperImg) paperImg.src = logoDataUrl;
          if (navImg) navImg.src = logoDataUrl;
        } catch { }
      };
      img.src = '../assets/images/logo.jpg';
    } catch { }
  }
}

async function fetchInventory() {
  let prodData = null;
  let packData = null;

  try {
    const sb = getSupabaseClient();
    if (sb) {
      const [prodRes, packRes] = await Promise.all([
        sb.from('products').select('*'),
        sb.from('product_packaging').select('*')
      ]);

      if (!prodRes.error && Array.isArray(prodRes.data) && prodRes.data.length > 0) {
        prodData = prodRes.data;
      }
      if (!packRes.error && Array.isArray(packRes.data)) {
        packData = packRes.data;
      }
    }
  } catch (err) {
    console.warn('Failed to load inventory from Supabase, attempting fallback:', err);
  }

  if (!prodData || !prodData.length) {
    try {
      const [pDirect, pkDirect] = await Promise.all([
        fetchDirectPublic('products?select=*'),
        fetchDirectPublic('product_packaging?select=*')
      ]);
      if (Array.isArray(pDirect) && pDirect.length > 0) prodData = pDirect;
      if (Array.isArray(pkDirect)) packData = pkDirect;
    } catch (e) {
      console.warn('Direct inventory fetch note:', e);
    }
  }

  if (Array.isArray(prodData) && prodData.length > 0) {
    const pkgByProd = {};
    for (const pkg of (packData || [])) {
      if (!pkgByProd[pkg.product_id]) pkgByProd[pkg.product_id] = [];
      pkgByProd[pkg.product_id].push(pkg);
    }

    const items = [];
    for (const prod of prodData) {
      const pkgs = pkgByProd[prod.id];
      if (pkgs && pkgs.length > 0) {
        for (const pkg of pkgs) {
          items.push({
            ProductID: String(prod.id),
            brand: String(prod.brand || '').trim(),
            product: String(prod.name || '').trim(),
            sku: String(prod.sku || '').trim(),
            packaging: String(pkg.packaging_size || prod.unit || '').trim(),
            units_per_box: parseInt(pkg.units_per_box, 10) || 0,
            volume_ml: parseFloat(pkg.volume_ml) || 0,
            weight_gm: parseFloat(pkg.weight_gm) || 0,
            unit: String(prod.unit || 'Bottles').trim(),
            price: String(pkg.sell_price != null ? pkg.sell_price : (prod.sell_price || 0)),
            hsn: String(prod.gst || '').trim()
          });
        }
      } else {
        items.push({
          ProductID: String(prod.id),
          brand: String(prod.brand || '').trim(),
          product: String(prod.name || '').trim(),
          sku: String(prod.sku || '').trim(),
          packaging: String(prod.unit || '').trim(),
          units_per_box: 0,
          volume_ml: 0,
          weight_gm: 0,
          unit: String(prod.unit || 'Bottles').trim(),
          price: String(prod.sell_price || 0),
          hsn: String(prod.gst || '').trim()
        });
      }
    }
    inventoryData = items.filter(item => item.brand || item.product || item.packaging);
    return inventoryData;
  }

  try {
    const response = await getProducts();
    const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
    inventoryData = data.map(normalizeProductRow).filter(item => item.brand || item.product || item.packaging);
    return inventoryData;
  } catch (err) {
    console.warn('Failed to load products from fallback:', err.message);
    if (!inventoryData.length) inventoryData = [];
    return inventoryData;
  }
}

async function fetchClients() {
  let rawData = null;

  try {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb.from('clients').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        rawData = data;
      }
    }
  } catch (err) {
    console.warn('Failed to load clients from Supabase, attempting fallback:', err);
  }

  if (!rawData || !rawData.length) {
    try {
      const direct = await fetchDirectPublic('clients?select=*');
      if (Array.isArray(direct) && direct.length > 0) rawData = direct;
    } catch (e) {
      console.warn('Direct clients fetch note:', e);
    }
  }

  if (Array.isArray(rawData) && rawData.length > 0) {
    const resolveFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState)
      ? window.resolveClientAddressAndState
      : (typeof resolveClientAddressAndState === 'function' ? resolveClientAddressAndState : null);

    clientsData = rawData.map(c => {
      const res = resolveFn ? resolveFn({
        address: c.address,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        gstin: c.gst
      }) : {
        cleanAddress: c.city || c.address || '',
        state: c.state || '',
        pincode: c.pincode || ''
      };
      return {
        ClientID: String(c.id || '').trim(),
        ClientName: String(c.name || '').trim(),
        Address: res.cleanAddress,
        City: String(c.city || '').trim(),
        State: res.state,
        Pincode: res.pincode,
        Phone: String(c.contact || '').trim(),
        GSTIN: String(c.gst || '').trim().toUpperCase(),
        DueAmount: parseFloat(c.balance) || 0
      };
    }).filter(c => c.ClientName || c.Phone);
    return clientsData;
  }

  try {
    const response = await getClients();
    const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
    clientsData = data.map(normalizeClientRow).filter(item => item.ClientName || item.Phone);
    return clientsData;
  } catch (err) {
    console.warn('Failed to load clients from fallback:', err.message);
    if (!clientsData.length) clientsData = [];
    return clientsData;
  }
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
function doLogin() {
  try {
    const u = ($('l-user').value || '').trim();
    const p = $('l-pass').value || '';
    if (!u || !p) {
      toast('Please enter username and password', 'error');
      return;
    }
    const found = USERS.find(x => x.username.toLowerCase() === u.toLowerCase() && x.password === p);
    if (found) {
      if (typeof safeStorage !== 'undefined' && safeStorage?.setItem) {
        safeStorage.setItem('inv_auth', found.username);
        safeStorage.setItem('inv_user_mobile', found.mobile);
      } else {
        localStorage.setItem('inv_auth', found.username);
        localStorage.setItem('inv_user_mobile', found.mobile);
      }

      const loginScreen = $('login-screen');
      const toolbar = $('toolbar');
      const app = $('app');
      if (loginScreen) loginScreen.style.display = 'none';
      if (toolbar) toolbar.classList.remove('hidden');
      if (app) app.classList.remove('hidden');

      if (typeof showProfileSymbol === 'function') showProfileSymbol();
      if (typeof initMobile === 'function') initMobile();
      if (typeof bootApp === 'function') {
        Promise.resolve(bootApp(found.mobile)).catch((err) => {
          console.error('Boot error after login:', err);
          toast('Signed in, but app initialization failed: ' + (err.message || 'Unknown error'), 'error');
        });
      }
    } else {
      toast('Invalid username or password', 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    toast('Login failed', 'error');
  }
}

function doLogout() {
  try {
    safeStorage.removeItem('inv_auth');
    safeStorage.removeItem('inv_user_mobile');
    safeStorage.removeItem(LS_KEY);
  } catch (err) {
    console.warn('Logout cleanup failed:', err);
  }
  window.location.reload();
}

function togglePasswordVisibility() {
  const input = $('l-pass');
  const icon = $('pass-toggle-icon');
  if (!input) return;
  const isVisible = input.type === 'text';
  input.type = isVisible ? 'password' : 'text';
  if (icon) icon.textContent = isVisible ? 'visibility' : 'visibility_off';
  const btn = $('pass-toggle-btn');
  if (btn) btn.setAttribute('aria-pressed', String(!isVisible));
}

window.doLogin = doLogin;
window.doLogout = doLogout;
window.togglePasswordVisibility = togglePasswordVisibility;

function forceUppercaseValue(el) {
  if (!el) return;
  const apply = () => {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const upper = normalizeGSTIN(el.value);
    if (el.value !== upper) {
      el.value = upper;
      try { el.setSelectionRange(start, end); } catch (err) { }
    }
  };
  el.addEventListener('input', apply);
  apply();
}

function setUserPhone(mobile) {
  const phone = String(mobile || '').trim();
  const phoneInput = $('s-phone');
  if (phoneInput) phoneInput.value = phone;

  const paperPhone = $('p-phone');
  if (paperPhone) paperPhone.textContent = phone || '—';

  const emailPhoneSep = $('p-email-phone-sep');
  if (emailPhoneSep) emailPhoneSep.style.display = phone ? '' : 'none';
  if (phoneInput && phoneInput.parentNode) {
    let info = document.getElementById('user-mobile-info');
    if (!info) {
      info = document.createElement('div');
      info.id = 'user-mobile-info';
      info.style.fontSize = '12px';
      info.style.color = '#334155';
      info.style.marginTop = '2px';
      phoneInput.parentNode.appendChild(info);
    }
    info.textContent = phone ? `Logged-in Mobile: ${phone}` : '';
  }
}

const SYNC_MAP = {
  's-company': ['p-company'],
  's-phone': ['p-phone'],
  's-email': ['p-email'],
  's-gstin': ['p-gstin'],
  's-signatory': ['p-signatory'],
  's-inv-num': ['p-inv-num'],
  's-bank-name': ['p-bank-name'],
  's-bank-acc': ['p-bank-acc'],
  's-bank-ifsc': ['p-bank-ifsc'],
  's-upi': ['p-upi'],
};

function updateBillFromPreview() {
  
  const compName = $('s-company')?.value || 'Anjani Agri Care';
  let addr = $('s-address')?.value || '';
  const state = $('s-company-state')?.value || 'Gujarat';
  const pin = $('s-company-pincode')?.value || '360024';
  const phone = formatPhoneDisplay($('s-phone')?.value || '96646 75227');
  const gstin = ($('s-gstin')?.value || '24AERFS1718Q1ZB').toUpperCase();

  addr = addr.replace(/,?\s*(?:Gujarat)?\s*(?:-\s*)?360024\s*$/i, '').replace(/,?\s*Gujarat\s*$/i, '').trim();

  const pFromName = $('p-from-name');
  if (pFromName) pFromName.textContent = compName;
  const pFromAddr = $('p-from-addr');
  if (pFromAddr) pFromAddr.textContent = addr || 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.';
  const pFromState = $('p-from-state');
  if (pFromState) pFromState.textContent = state;
  const pFromPin = $('p-from-pin');
  if (pFromPin) pFromPin.textContent = pin;
  const pFromPhone = $('p-from-phone');
  if (pFromPhone) pFromPhone.textContent = phone;
  const pFromGstin = $('p-from-gstin');
  if (pFromGstin) pFromGstin.textContent = gstin;
}

function updateBillToPreview() {
  const clientName = $('s-client-name')?.value || 'Client Name';
  let rawAddr = $('s-client-addr')?.value || '';
  let rawState = $('s-client-state')?.value || '';
  let rawPin = $('s-client-pincode')?.value || '';
  const phone = formatPhoneDisplay($('s-client-phone')?.value || '');
  const gstin = ($('s-client-gstin')?.value || '').toUpperCase();

  const resolveFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState)
    ? window.resolveClientAddressAndState
    : (typeof resolveClientAddressAndState === 'function' ? resolveClientAddressAndState : null);

  const res = resolveFn ? resolveFn({
    address: rawAddr,
    state: rawState,
    pincode: rawPin,
    gstin: gstin
  }) : {
    cleanAddress: rawAddr,
    state: rawState,
    pincode: rawPin
  };

  const cleanAddr = res.cleanAddress;
  const state = res.state || '';
  const pin = res.pincode || '';

  const pClientName = $('p-client-name');
  if (pClientName) pClientName.textContent = clientName;

  const pClientAddr = $('p-client-addr-text');
  if (pClientAddr) {
    const dispAddr = cleanAddr || rawAddr;
    pClientAddr.textContent = dispAddr || '';
    pClientAddr.style.display = dispAddr ? 'block' : 'none';
  }

  const pStateText = $('p-client-state-text');
  const pStateRow = $('p-client-state-row');
  if (pStateText) pStateText.textContent = state;
  if (pStateRow) pStateRow.style.display = state ? 'block' : 'none';

  const pPinText = $('p-client-pin-text');
  const pPinRow = $('p-client-pin-row');
  if (pPinText) pPinText.textContent = pin;
  if (pPinRow) pPinRow.style.display = pin ? 'block' : 'none';

  const r1 = $('p-client-row-1');
  if (r1) r1.style.display = (state || pin) ? 'flex' : 'none';

  const pPhoneText = $('p-client-phone-text');
  const pPhoneRow = $('p-client-phone-row');
  if (pPhoneText) pPhoneText.textContent = phone;
  if (pPhoneRow) pPhoneRow.style.display = phone ? 'block' : 'none';

  const pGstinText = $('p-client-gstin-text');
  const pGstinRow = $('p-client-gstin-row');
  if (pGstinText) pGstinText.textContent = gstin;
  if (pGstinRow) pGstinRow.style.display = gstin ? 'block' : 'none';

  const r2 = $('p-client-row-2');
  if (r2) r2.style.display = (phone || gstin) ? 'flex' : 'none';

  const pSub = $('p-client-sub');
  if (pSub) {
    pSub.textContent = [cleanAddr || rawAddr, phone ? `Phone: ${phone}` : '', gstin ? `GSTIN: ${gstin}` : ''].filter(Boolean).join(' | ');
  }
}
window.updateBillFromPreview = updateBillFromPreview;
window.updateBillToPreview = updateBillToPreview;
window.syncClientSub = updateBillToPreview;

function bindSidebarInputs() {
  Object.keys(SYNC_MAP).forEach((srcId) => {
    const el = $(srcId);
    if (!el) return;
    el.addEventListener('input', () => {
      SYNC_MAP[srcId].forEach((destId) => {
        const dest = $(destId);
        if (dest) dest.textContent = el.value || '—';
      });
      if (srcId === 's-company' || srcId === 's-upi') updateQR();
      autoSave();
    });
  });

  ['s-company', 's-address', 's-company-state', 's-company-pincode', 's-phone', 's-gstin'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      updateBillFromPreview();
      autoSave();
    });
  });

  const invDate = $('s-inv-date');
  if (invDate) {
    invDate.addEventListener('change', () => {
      const preview = $('p-inv-date');
      if (preview) preview.textContent = formatDate(invDate.value) || '—';
      autoSave();
    });
  }

  const dueDate = $('s-due-date');
  if (dueDate) {
    dueDate.addEventListener('change', () => {
      const line = $('p-due-line');
      const preview = $('p-due-date');
      const v = dueDate.value;
      if (line) line.style.display = v ? '' : 'none';
      if (preview) preview.textContent = formatDate(v) || '';
      autoSave();
    });
  }

  ['s-client-name', 's-client-addr', 's-client-state', 's-client-pincode', 's-client-phone', 's-client-gstin'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (id === 's-client-gstin') {
        const up = normalizeGSTIN(el.value);
        if (el.value !== up) el.value = up;
        const stateEl = $('s-client-state');
        if (stateEl && !stateEl.value && up.length >= 2) {
          const code = up.slice(0, 2);
          const gstMap = (typeof GST_STATE_MAP !== 'undefined') ? GST_STATE_MAP : (window.GST_STATE_MAP || {});
          if (gstMap[code]) {
            stateEl.value = gstMap[code];
            const posEl = $('s-place-supply');
            if (posEl) posEl.value = gstMap[code];
            const scEl = $('s-client-state-code');
            if (scEl) scEl.value = code;
          }
        }
      }
      if (id === 's-client-state') {
        const val = el.value.trim();
        const getCodeFn = (typeof getStateCodeFromName === 'function') ? getStateCodeFromName : (window.getStateCodeFromName || null);
        const code = getCodeFn ? getCodeFn(val) : '';
        const scEl = $('s-client-state-code');
        if (scEl) scEl.value = code;
        const posEl = $('s-place-supply');
        if (posEl) posEl.value = val;
      }
      if (id === 's-client-addr') {
        const pinInput = $('s-client-pincode');
        if (pinInput && !pinInput.value) {
          const pm = el.value.match(/\b\d{6}\b/);
          if (pm) pinInput.value = pm[0];
        }
      }
      updateBillToPreview();
      autoSave();
    });
  });

  const intro = $('s-intro');
  if (intro) {
    intro.addEventListener('input', () => {
      const target = $('p-intro');
      if (target) target.textContent = intro.value || '';
      autoSave();
    });
  }

  const terms = $('s-terms');
  if (terms) {
    terms.addEventListener('input', () => {
      const target = $('p-terms');
      if (target) {
        const v = terms.value.trim();
        target.textContent = v;
        target.style.display = v ? '' : 'none';
      }
      autoSave();
    });
  }
}

function refreshPaper() {
  Object.keys(SYNC_MAP).forEach((srcId) => {
    const el = $(srcId);
    if (!el) return;
    SYNC_MAP[srcId].forEach((destId) => {
      const dest = $(destId);
      if (dest) dest.textContent = el.value || '—';
    });
  });

  const pInvDate = $('p-inv-date');
  if (pInvDate) pInvDate.textContent = formatDate($('s-inv-date')?.value || '') || '—';

  const due = $('s-due-date')?.value || '';
  const dueLine = $('p-due-line');
  const pDueDate = $('p-due-date');
  if (dueLine) dueLine.style.display = due ? '' : 'none';
  if (pDueDate) pDueDate.textContent = due ? formatDate(due) : '';

  const dispLine = $('p-disp-line');
  const pDispNo = $('p-disp-no');
  if (dispLine && pDispNo) {
    if (window.currentDispatchNo) {
      dispLine.style.display = '';
      pDispNo.textContent = window.currentDispatchNo;
    } else {
      dispLine.style.display = 'none';
    }
  }

  const vehLine = $('p-veh-line');
  const pVehNo = $('p-veh-no');
  if (vehLine && pVehNo) {
    if (window.currentVehicleNo) {
      vehLine.style.display = '';
      pVehNo.textContent = window.currentVehicleNo;
    } else {
      vehLine.style.display = 'none';
    }
  }

  updateBillFromPreview();
  updateBillToPreview();

  const gstin = normalizeGSTIN($('s-client-gstin')?.value || '');
  const gstinEl = $('s-client-gstin');
  if (gstinEl && gstinEl.value !== gstin) gstinEl.value = gstin;
  const pIntro = $('p-intro');
  if (pIntro) pIntro.textContent = $('s-intro')?.value || '';

  const pTerms = $('p-terms');
  if (pTerms) {
    const terms = $('s-terms')?.value?.trim() || '';
    pTerms.textContent = terms;
    pTerms.style.display = terms ? '' : 'none';
  }

  const addressPhoneSep = $('p-email-phone-sep');
  const headerPhone = $('p-phone')?.textContent?.trim() || '';
  if (addressPhoneSep) addressPhoneSep.style.display = headerPhone && headerPhone !== '—' ? '' : 'none';

  if (typeof updateQR === 'function') updateQR();
}

function updateIntro() {
  const pIntro = $('p-intro');
  if (pIntro) pIntro.textContent = $('s-intro')?.value || '';
}

function updateTerms() {
  const pTerms = $('p-terms');
  if (pTerms) {
    const terms = $('s-terms')?.value?.trim() || '';
    pTerms.textContent = terms;
    pTerms.style.display = terms ? '' : 'none';
  }
}

function addRow(data = {}) {
  const rid = 'r' + (++rowCounter);
  const isGstMode = document.body.classList.contains('gst-mode');
  const unitsPerBox = parseInt(data.unitsPerBox, 10) || 0;
  const boxes = parseFloat(data.boxes) || 0;
  const loose = parseFloat(data.loose) || 0;
  let totalUnits = parseFloat(data.totalUnits != null ? data.totalUnits : data.qty) || 0;
  if ((boxes > 0 || loose > 0) && totalUnits === 0) {
    totalUnits = (boxes * (unitsPerBox > 0 ? unitsPerBox : 1)) + loose;
  }

  rows.push({
    id: rid,
    brand: data.brand || '',
    name: data.name || '',
    desc: data.desc || '',
    packaging: data.packaging || '',
    boxes: boxes,
    unitsPerBox: unitsPerBox,
    loose: loose,
    totalUnits: totalUnits,
    qtyUnit: data.qtyUnit || 'Bottles',
    totalVolume: parseFloat(data.totalVolume) || 0,
    volumeUnit: data.volumeUnit || 'Litres',
    priceBasis: data.priceBasis || 'per_unit',
    discountPct: parseFloat(data.discountPct) || 0,
    taxableValue: parseFloat(data.taxableValue) || 0,
    qty: data.qty != null ? data.qty : (totalUnits || ''),
    price: data.price || '',
    total: data.total || 0,
    hsn: data.hsn || '',
    gstRate: data.gstRate != null ? data.gstRate : (isGstMode ? 18 : 0)
  });
  renderRows();
  renderMobItems();
}

function ensureOneBlankItem() {
  if (rows.length) return;
  addRow();
}

function removeRow(rid) {
  if (rows.length <= 1) {
    toast('At least one item is required', 'error');
    return;
  }
  rows = rows.filter(r => r.id !== rid);
  renderRows();
  renderMobItems();
  autoSave();
}

function renderRows() {
  const table = $('items-table'); if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = $('items-tbody'); if (!tbody) return;

  const isGst = document.body.classList.contains('gst-mode');
  const taxType = resolveTaxTypeFromInputs();
  const taxConfig = getTaxConfig(taxType);
  const isIgst = taxType.startsWith('IGST');

  tbody.innerHTML = '';

  thead.innerHTML = `
    <tr>
      <th style="width:4%; text-align:center;">No.</th>
      <th style="width:34%; text-align:left;">Products</th>
      <th style="width:14%; text-align:center;">Pack Size</th>
      <th style="width:10%; text-align:center;">Boxes</th>
      <th style="width:12%; text-align:center;">Qty (Units)</th>
      <th style="width:12%; text-align:right;">Rate (&#8377;)</th>
      <th style="width:14%; text-align:right;">Total (&#8377;)</th>
    </tr>
  `;

  rows.forEach((row, i) => {
    const calc = calculateLineItemQuantities(row);
    const boxCount = row.boxes > 0 ? row.boxes : (calc.boxes > 0 ? calc.boxes : 0);
    const totalUnits = calc.totalUnits > 0 ? calc.totalUnits : (row.qty || 0);
    const packSize = row.packaging || '—';

    const rowTotal = calc.taxableValue > 0 ? calc.taxableValue : (parseFloat(row.total) || 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; white-space:nowrap;">${i + 1}</td>
      <td style="word-break:break-word; overflow-wrap:break-word; text-align:left;">
        <div style="font-weight:700; color:var(--paper-text);">${esc(row.name || row.product || 'Product')}</div>
        ${row.brand && row.brand !== row.name ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">Brand: ${esc(row.brand)}</div>` : ''}
        ${row.desc && row.desc !== row.packaging && row.desc !== row.name ? `<div style="font-size:9.5px; color:#64748b; margin-top:1px; line-height:1.3;">${esc(row.desc)}</div>` : ''}
      </td>
      <td style="text-align:center; white-space:nowrap; font-weight:600; color:#0f766e;">${esc(packSize)}</td>
      <td style="text-align:center; white-space:nowrap; font-weight:600;">${boxCount} Boxes</td>
      <td style="text-align:center; white-space:nowrap; font-weight:700; color:#08281A;">${totalUnits}</td>
      <td style="text-align:right; white-space:nowrap; word-break:normal; overflow-wrap:normal;">
        <div>${row.price ? '&#8377;' + INR.format(parseFloat(row.price)) + (row.priceBasis === 'per_box' ? ' / bx' : '') : '&mdash;'}</div>
        ${row.discountPct > 0 ? `<div style="font-size:9.5px; color:#16a34a;">-${row.discountPct}% off</div>` : ''}
      </td>
      <td style="text-align:right; white-space:nowrap; word-break:normal; overflow-wrap:normal;" id="rt_${row.id}">
        <div style="font-weight:700;">${rowTotal > 0 ? '&#8377;' + INR.format(rowTotal) : '&mdash;'}</div>
        ${isGst && row.discountPct > 0 ? `<div style="font-size:9px; color:#64748b;">(Taxable: &#8377;${INR.format(calc.taxableValue)})</div>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
  recalcAll();
}

function renderMobItems() {
  const container = $('mob-items-list'); if (!container) return;
  container.innerHTML = '';
  if (!rows.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">No items yet. Tap "Add Item" below.</div>';
    return;
  }
  rows.forEach((row, i) => {
    const pkOptions = getPackagingForProduct(row.brand, row.name);
    const isGst = document.body.classList.contains('gst-mode');
    const calc = calculateLineItemQuantities(row);
    const card = document.createElement('div');
    card.className = 'mob-item-card';
    card.id = 'mob-card-' + row.id;

    card.innerHTML = `
      <div class="mob-item-card-header">
        <span class="mob-item-num">Item ${i + 1}${i === 0 ? ' <span style="color:#ef4444;font-weight:700;margin-left:4px;">*</span>' : ''}</span>
        ${i === 0 ? '<span style="font-size:10px;color:#94a3b8;font-weight:500">(Required)</span>' : `<button class="mob-item-remove" onclick="removeRow('${row.id}')">✕ Remove</button>`}
      </div>

      ${isGst ? '' : `
      <span class="sb-label">Brand Name</span>
      <input class="sb-input" placeholder="Brand name" value="${esc(row.brand)}"
        data-rid="${row.id}" data-field="brand"
        onclick="event.stopPropagation(); showItemAutocomplete(this, 'brand')"
        onfocus="showItemAutocomplete(this, 'brand')"
        oninput="onItemInput(this); showItemAutocomplete(this,'brand')"
        onkeydown="acKeyDown(event, this)" autocomplete="off" />`}

      <span class="sb-label">Product Name</span>
      <input class="sb-input" placeholder="Product name " value="${esc(row.name)}"
        data-rid="${row.id}" data-field="name"
        onclick="event.stopPropagation(); showItemAutocomplete(this, 'name')"
        onfocus="showItemAutocomplete(this, 'name')"
        oninput="onItemInput(this); showItemAutocomplete(this,'name')"
        onkeydown="acKeyDown(event, this)" autocomplete="off" />

      <span class="sb-label">Packaging Size</span>
      <input class="sb-input select-styled" readonly
        placeholder="— Select Packaging —"
        value="${row.packaging ? esc(row.packaging) : ''}"
        data-rid="${row.id}" data-field="packaging"
        onclick="event.stopPropagation(); showPackagingDropdown(this)" />

      <!-- ── Box & Loose Packaging Tracking Block ── -->
      <div class="packaging-tracking-box" style="margin: 8px 0; padding: 10px; background: rgba(15, 118, 110, 0.05); border: 1px solid rgba(15, 118, 110, 0.2); border-radius: 8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:11px; font-weight:700; color:#0f766e; text-transform:uppercase; letter-spacing:0.4px;">📦 Packaging &amp; Loose Units</span>
          <span id="pack-summary-${row.id}" style="font-size:11px; font-weight:700; color:#0369a1;">
            ${calc.totalVolume > 0 ? `${calc.totalVolume} ${calc.volumeUnit}` : ''}
          </span>
        </div>

        <div class="sb-row" style="gap:6px; margin-bottom:6px;">
          <div style="flex:1;">
            <span class="sb-label" style="font-size:11px;">Boxes / Cartons</span>
            <input class="sb-input" type="number" min="0" placeholder="0" value="${row.boxes || ''}"
              data-rid="${row.id}" data-field="boxes"
              oninput="onBoxLooseInput(this)" onfocus="this.select()" />
          </div>
          <div style="flex:1;">
            <span class="sb-label" style="font-size:11px;">Units / Box</span>
            <input class="sb-input" type="number" min="0" placeholder="e.g. 10" value="${row.unitsPerBox || ''}"
              data-rid="${row.id}" data-field="unitsPerBox"
              oninput="onBoxLooseInput(this)" onfocus="this.select()" />
          </div>
          <div style="flex:1;">
            <span class="sb-label" style="font-size:11px;">Loose Units</span>
            <input class="sb-input" type="number" min="0" placeholder="0" value="${row.loose || ''}"
              data-rid="${row.id}" data-field="loose"
              oninput="onBoxLooseInput(this)" onfocus="this.select()" />
          </div>
        </div>

        <div class="sb-row" style="gap:6px; margin-bottom:6px;">
          <div style="flex:1.2;">
            <span class="sb-label" style="font-size:11px;">Total Units (${row.qtyUnit || 'Bottles'})</span>
            <input class="sb-input" type="number" min="0" placeholder="0" value="${calc.totalUnits || row.qty || ''}"
              data-rid="${row.id}" data-field="totalUnits"
              oninput="onTotalUnitsInput(this)" onfocus="this.select()" style="font-weight:700; background:#ffffff;" />
          </div>
          <div style="flex:1.2;">
            <span class="sb-label" style="font-size:11px;">Pricing Basis</span>
            <select class="sb-input select-styled" data-rid="${row.id}" data-field="priceBasis" onchange="onPriceBasisChange(this)" style="font-size:12px;">
              <option value="per_unit" ${row.priceBasis !== 'per_box' ? 'selected' : ''}>Per Unit (${row.qtyUnit || 'Bottle'})</option>
              <option value="per_box" ${row.priceBasis === 'per_box' ? 'selected' : ''}>Per Box</option>
            </select>
          </div>
          <div style="flex:0.8;">
            <span class="sb-label" style="font-size:11px;">Disc (%)</span>
            <input class="sb-input" type="number" min="0" max="100" step="0.5" placeholder="0" value="${row.discountPct || ''}"
              data-rid="${row.id}" data-field="discountPct"
              oninput="onDiscountInput(this)" onfocus="this.select()" />
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569; padding-top:4px; border-top:1px dashed #cbd5e1;">
          <span>Taxable Qty: <strong id="billed-qty-${row.id}">${cleanUnitLabel(row.priceBasis === 'per_box' ? `${calc.billedQty} Boxes` : `${calc.totalUnits} ${row.qtyUnit || 'Units'}`)}</strong></span>
          <span>Taxable: <strong id="taxable-val-${row.id}">₹${INR.format(calc.taxableValue)}</strong></span>
        </div>
      </div>

      <span class="sb-label">Description <span style="font-weight:400;color:var(--text-muted)">(editable)</span></span>
      <input class="sb-input" placeholder="Description" value="${esc(row.desc)}"
        data-rid="${row.id}" data-field="desc"
        oninput="onItemInput(this)" />

      ${isGst ? `
      <span class="sb-label">HSN Code</span>
      <input class="sb-input" placeholder="Enter HSN code" value="${esc(row.hsn || '')}"
        data-rid="${row.id}" data-field="hsn"
        oninput="onItemInput(this)" />` : ''}

      <div class="sb-row" style="gap:10px;margin-top:4px">
        <div style="flex:1">
          <span class="sb-label">Billed Qty</span>
          <input class="sb-input" type="number" min="0" placeholder="0" value="${row.qty}"
            data-rid="${row.id}" data-field="qty"
            oninput="onQtyPriceInput(this)" onfocus="this.select()" />
        </div>
        <div style="flex:1">
          <span class="sb-label">Unit Price (₹)</span>
          <input class="sb-input" type="number" min="0" step="0.01" placeholder="0.00" value="${row.price}"
            data-rid="${row.id}" data-field="price"
            oninput="onQtyPriceInput(this)" />
        </div>
      </div>
      <div class="mob-item-total">
        <span style="color:var(--text-muted);font-size:12px">Line Total</span>
        <span class="mob-item-total-value" id="mob-rt-${row.id}">${row.total > 0 ? '₹' + INR.format(row.total) : '—'}</span>
      </div>`;
    container.appendChild(card);
  });
}

// ─── ITEM INPUT HANDLERS ──────────────────────────────────────────────────────
function onItemInput(el) {
  const rid = el.dataset.rid, field = el.dataset.field;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row[field] = el.value;

  if (field === 'brand') {
    const exactBrands = getUniqueBrands().filter(b => b.toLowerCase() === row.brand.trim().toLowerCase());
    if (exactBrands.length > 0) {
      row.brand = exactBrands[0];
      const products = getProductsForBrand(row.brand);
      if (products.length > 0) {
        if (!row.name || !products.includes(row.name)) {
          row.name = products[0];
        }
      } else {
        row.name = '';
      }
    } else {
      row.name = '';
    }
    row.packaging = ''; row.price = ''; row.desc = ''; row.total = 0;
  } else if (field === 'name') {
    const allProducts = getAllProducts();
    const exactProducts = allProducts.filter(p => p.toLowerCase() === row.name.trim().toLowerCase());
    if (exactProducts.length > 0) {
      row.name = exactProducts[0];
      const validBrands = inventoryData.filter(x => (x.product || x.ProductName || '').toLowerCase() === row.name.toLowerCase()).map(x => x.brand || x.BrandName || '');
      if (validBrands.length > 0 && (!row.brand || !validBrands.includes(row.brand))) {
        row.brand = validBrands[0];
      }
    }
    row.packaging = ''; row.price = ''; row.desc = ''; row.total = 0;
  }

  if (field === 'brand' || field === 'name') {
    const card = document.getElementById('mob-card-' + rid);
    if (card) {
      const bInp = card.querySelector('[data-field="brand"]');
      if (bInp) bInp.value = row.brand || '';

      const nInp = card.querySelector('[data-field="name"]');
      if (nInp) {
        nInp.value = row.name || '';
        nInp.placeholder = 'Start typing product...';
      }

      const dInp = card.querySelector('[data-field="desc"]');
      if (dInp) dInp.value = row.desc || '';

      const pInp = card.querySelector('[data-field="price"]');
      if (pInp) pInp.value = row.price || '';

      const tSpan = card.querySelector('.mob-item-total-value');
      if (tSpan) tSpan.textContent = '—';

      const packInp = card.querySelector('input[data-field="packaging"]');
      if (packInp) {
        packInp.value = row.packaging || '';
      }
    }
  }

  renderRows();
  autoSave();
}

function onPackagingChange(el, optValue) {
  const rid = el.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;
  const val = optValue !== undefined ? optValue : el.value;
  row.packaging = val;
  if (val) {
    const pkgDetails = getPackagingDetailsForProduct(row.brand, row.name, val);
    if (pkgDetails) {
      if (pkgDetails.unitsPerBox > 0) row.unitsPerBox = pkgDetails.unitsPerBox;
      if (pkgDetails.unit) row.qtyUnit = pkgDetails.unit;
      if (pkgDetails.price && (!row.price || row.price === '0')) row.price = pkgDetails.price;
      if (pkgDetails.hsn && !row.hsn) row.hsn = pkgDetails.hsn;
    } else {
      const price = getPriceForPackaging(row.brand, row.name, val);
      row.price = price !== '' ? price : row.price;
    }
    row.desc = val;
  } else {
    row.packaging = '';
  }

  const calc = calculateLineItemQuantities(row);
  row.totalUnits = calc.totalUnits;
  row.qty = row.priceBasis === 'per_box' ? calc.billedQty : calc.totalUnits;
  row.totalVolume = calc.totalVolume;
  row.volumeUnit = calc.volumeUnit;
  row.taxableValue = calc.taxableValue;
  row.total = calc.taxableValue;

  renderMobItems();
  recalcAll();
  renderRows();
  autoSave();
}

function onBoxLooseInput(el) {
  const rid = el.dataset.rid, field = el.dataset.field;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row[field] = parseFloat(el.value) || 0;

  const upb = parseInt(row.unitsPerBox, 10) || 1;
  const b = parseFloat(row.boxes) || 0;
  const l = parseFloat(row.loose) || 0;
  row.totalUnits = (b * (upb > 0 ? upb : 1)) + l;

  const calc = calculateLineItemQuantities(row);
  row.totalUnits = calc.totalUnits;
  row.qty = row.priceBasis === 'per_box' ? calc.billedQty : calc.totalUnits;
  row.totalVolume = calc.totalVolume;
  row.volumeUnit = calc.volumeUnit;
  row.taxableValue = calc.taxableValue;

  const card = $('mob-card-' + rid);
  if (card) {
    const tuInp = card.querySelector('[data-field="totalUnits"]');
    if (tuInp) tuInp.value = calc.totalUnits || '';
    const qInp = card.querySelector('[data-field="qty"]');
    if (qInp) qInp.value = row.qty || '';
    const billedSpan = card.querySelector('#billed-qty-' + rid);
    if (billedSpan) billedSpan.textContent = cleanUnitLabel(row.priceBasis === 'per_box' ? `${calc.billedQty} Boxes` : `${calc.totalUnits} ${row.qtyUnit || 'Units'}`);
    const taxSpan = card.querySelector('#taxable-val-' + rid);
    if (taxSpan) taxSpan.textContent = '₹' + INR.format(calc.taxableValue);
    const summarySpan = card.querySelector('#pack-summary-' + rid);
    if (summarySpan) summarySpan.textContent = calc.totalVolume > 0 ? `${calc.totalVolume} ${calc.volumeUnit}` : '';
  }

  recalcAll();
  renderRows();
  autoSave();
}

function onTotalUnitsInput(el) {
  const rid = el.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;
  const val = parseFloat(el.value) || 0;
  row.totalUnits = val;
  const unitsPerBox = parseInt(row.unitsPerBox, 10) || 0;
  if (unitsPerBox > 0) {
    row.boxes = Math.floor(val / unitsPerBox);
    row.loose = val % unitsPerBox;
  } else {
    row.boxes = 0;
    row.loose = val;
  }
  const calc = calculateLineItemQuantities(row);
  row.qty = row.priceBasis === 'per_box' ? calc.billedQty : val;
  row.totalVolume = calc.totalVolume;
  row.volumeUnit = calc.volumeUnit;
  row.taxableValue = calc.taxableValue;

  const card = $('mob-card-' + rid);
  if (card) {
    const bInp = card.querySelector('[data-field="boxes"]');
    if (bInp) bInp.value = row.boxes || '';
    const lInp = card.querySelector('[data-field="loose"]');
    if (lInp) lInp.value = row.loose || '';
    const qInp = card.querySelector('[data-field="qty"]');
    if (qInp) qInp.value = row.qty || '';
    const billedSpan = card.querySelector('#billed-qty-' + rid);
    if (billedSpan) billedSpan.textContent = cleanUnitLabel(row.priceBasis === 'per_box' ? `${calc.billedQty} Boxes` : `${calc.totalUnits} ${row.qtyUnit || 'Units'}`);
    const taxSpan = card.querySelector('#taxable-val-' + rid);
    if (taxSpan) taxSpan.textContent = '₹' + INR.format(calc.taxableValue);
    const summarySpan = card.querySelector('#pack-summary-' + rid);
    if (summarySpan) summarySpan.textContent = calc.totalVolume > 0 ? `${calc.totalVolume} ${calc.volumeUnit}` : '';
  }

  recalcAll();
  renderRows();
  autoSave();
}

function onPriceBasisChange(el) {
  const rid = el.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row.priceBasis = el.value || 'per_unit';

  const calc = calculateLineItemQuantities(row);
  row.qty = row.priceBasis === 'per_box' ? calc.billedQty : calc.totalUnits;
  row.taxableValue = calc.taxableValue;

  const card = $('mob-card-' + rid);
  if (card) {
    const qInp = card.querySelector('[data-field="qty"]');
    if (qInp) qInp.value = row.qty || '';
    const billedSpan = card.querySelector('#billed-qty-' + rid);
    if (billedSpan) billedSpan.textContent = cleanUnitLabel(row.priceBasis === 'per_box' ? `${calc.billedQty} Boxes` : `${calc.totalUnits} ${row.qtyUnit || 'Units'}`);
    const taxSpan = card.querySelector('#taxable-val-' + rid);
    if (taxSpan) taxSpan.textContent = '₹' + INR.format(calc.taxableValue);
  }

  recalcAll();
  renderRows();
  autoSave();
}

function onDiscountInput(el) {
  const rid = el.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row.discountPct = Math.max(0, Math.min(100, parseFloat(el.value) || 0));

  const calc = calculateLineItemQuantities(row);
  row.taxableValue = calc.taxableValue;

  const card = $('mob-card-' + rid);
  if (card) {
    const taxSpan = card.querySelector('#taxable-val-' + rid);
    if (taxSpan) taxSpan.textContent = '₹' + INR.format(calc.taxableValue);
  }

  recalcAll();
  renderRows();
  autoSave();
}

function onQtyPriceInput(el) {
  const rid = el.dataset.rid, field = el.dataset.field;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row[field] = el.value !== '' ? parseFloat(el.value) || 0 : '';

  if (field === 'qty') {
    row.totalUnits = parseFloat(el.value) || 0;
    const unitsPerBox = parseInt(row.unitsPerBox, 10) || 0;
    if (unitsPerBox > 0) {
      row.boxes = Math.floor(row.totalUnits / unitsPerBox);
      row.loose = row.totalUnits % unitsPerBox;
    }
  }

  const calc = calculateLineItemQuantities(row);
  row.totalVolume = calc.totalVolume;
  row.volumeUnit = calc.volumeUnit;
  row.taxableValue = calc.taxableValue;

  const card = $('mob-card-' + rid);
  if (card && field === 'qty') {
    const bInp = card.querySelector('[data-field="boxes"]');
    if (bInp) bInp.value = row.boxes || '';
    const lInp = card.querySelector('[data-field="loose"]');
    if (lInp) lInp.value = row.loose || '';
    const tuInp = card.querySelector('[data-field="totalUnits"]');
    if (tuInp) tuInp.value = row.totalUnits || '';
    const billedSpan = card.querySelector('#billed-qty-' + rid);
    if (billedSpan) billedSpan.textContent = cleanUnitLabel(row.priceBasis === 'per_box' ? `${calc.billedQty} Boxes` : `${calc.totalUnits} ${row.qtyUnit || 'Units'}`);
    const taxSpan = card.querySelector('#taxable-val-' + rid);
    if (taxSpan) taxSpan.textContent = '₹' + INR.format(calc.taxableValue);
    const summarySpan = card.querySelector('#pack-summary-' + rid);
    if (summarySpan) summarySpan.textContent = calc.totalVolume > 0 ? `${calc.totalVolume} ${calc.volumeUnit}` : '';
  }

  recalcAll();
  renderRows();
  autoSave();
}

window.addRow = addRow;
window.removeRow = removeRow;
window.renderRows = renderRows;
window.renderMobItems = renderMobItems;
window.refreshPaper = refreshPaper;
window.recalcAll = recalcAll;
window.setClientDue = setClientDue;
window.tryAutoFillClient = tryAutoFillClient;
window.setBillingMode = setBillingMode;
window.updateIntro = updateIntro;
window.updateTerms = updateTerms;
window.onItemInput = onItemInput;
window.onQtyPriceInput = onQtyPriceInput;
window.onBoxLooseInput = onBoxLooseInput;
window.onTotalUnitsInput = onTotalUnitsInput;
window.onPriceBasisChange = onPriceBasisChange;
window.onDiscountInput = onDiscountInput;
window.showItemAutocomplete = showItemAutocomplete;
window.showPackagingDropdown = showPackagingDropdown;
window.acKeyDown = acKeyDown;
window.onPackagingChange = onPackagingChange;
window.calculateLineItemQuantities = calculateLineItemQuantities;
window.getPackagingDetailsForProduct = getPackagingDetailsForProduct;
window.parseVolumeOrWeight = parseVolumeOrWeight;

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────
function resolveTaxTypeFromInputs() {
  const taxTypeInput = $('tax-type')?.value || $('gst-rate-display')?.value;
  if (taxTypeInput) return normalizeTaxType(taxTypeInput);
  const gstRate = parseFloat($('gst-rate')?.value) || 0;
  return normalizeTaxType(gstRate);
}

function setTaxType(taxType) {
  const config = getTaxConfig(taxType);
  const display = $('gst-rate-display'); if (display) display.value = config.key;
  const rateInput = $('gst-rate'); if (rateInput) rateInput.value = config.rate;
  const typeInput = $('tax-type'); if (typeInput) typeInput.value = config.key;
  rows.forEach(row => { row.gstRate = config.rate; });
  renderRows();
}

function recalcAll() {
  const isGst = document.body.classList.contains('gst-mode');
  const taxType = resolveTaxTypeFromInputs();
  const taxConfig = getTaxConfig(taxType);
  const isIgst = taxType.startsWith('IGST');
  const rate = taxConfig.rate;
  const due = parseFloat($('s-client-due')?.value) || 0;

  rows.forEach(r => {
    const calc = calculateLineItemQuantities(r);
    r.boxes = calc.boxes;
    r.loose = calc.loose;
    r.unitsPerBox = calc.unitsPerBox;
    r.totalUnits = calc.totalUnits;
    r.totalVolume = calc.totalVolume;
    r.volumeUnit = calc.volumeUnit;
    r.discountPct = calc.discountPct;
    r.taxableValue = calc.taxableValue;
    r.qty = r.priceBasis === 'per_box' ? calc.billedQty : calc.totalUnits;

    const lineTotal = calc.taxableValue > 0 ? calc.taxableValue : (parseFloat(r.total) || 0);
    r.total = lineTotal;

    const formatted = lineTotal > 0 ? '₹' + INR.format(lineTotal) : '—';
    const rt = $('rt_' + r.id); if (rt) rt.textContent = formatted;
    const mt = $('mob-rt-' + r.id); if (mt) mt.textContent = formatted;
  });

  const sub = rows.reduce((s, r) => s + (parseFloat(r.taxableValue != null ? r.taxableValue : r.total) || 0), 0);
  const totals = calculateInvoiceTotals(sub, taxType, due);
  syncTaxPreviewRows(totals);
  const psub = $('p-subtotal'); if (psub) psub.textContent = '₹' + INR.format(totals.subtotal);
  const pcgst = $('p-cgst'); if (pcgst) pcgst.textContent = '₹' + INR.format(totals.cgstAmount);
  const psgst = $('p-sgst'); if (psgst) psgst.textContent = '₹' + INR.format(totals.sgstAmount);
  const pigst = $('p-igst'); if (pigst) pigst.textContent = '₹' + INR.format(totals.igstAmount);
  const ptot = $('p-totalgst'); if (ptot) ptot.textContent = '₹' + INR.format(totals.totalTax);
  const pgr = $('p-grand'); if (pgr) pgr.textContent = '₹' + INR.format(totals.grandTotal);

  const ptaxtypeRow = $('p-taxtype-row');
  const ptaxtypeLabel = $('p-taxtype-label');
  const pcgstRow = $('p-cgst-row');
  const psgstRow = $('p-sgst-row');
  const pigstRow = $('p-igst-row');
  const ptotRow = $('p-totalgst-row');

  const pcgstLabel = $('p-cgst-label');
  const psgstLabel = $('p-sgst-label');
  const pigstLabel = $('p-igst-label');

  if (isGst) {
    if (ptaxtypeRow) ptaxtypeRow.style.display = 'none';
    if (pcgstRow) pcgstRow.style.display = 'none';
    if (psgstRow) psgstRow.style.display = 'none';
    if (pigstRow) pigstRow.style.display = 'none';
    if (ptotRow) ptotRow.style.display = 'none';

    if (pcgstLabel) pcgstLabel.textContent = `CGST`;
    if (psgstLabel) psgstLabel.textContent = `SGST`;
    if (pigstLabel) pigstLabel.textContent = `IGST`;
  } else {
    if (ptaxtypeRow) ptaxtypeRow.style.display = totals.taxType !== 'NONE' ? '' : 'none';
    if (ptaxtypeLabel) ptaxtypeLabel.textContent = formatTaxLabel(totals.taxType);

    if (pcgstRow) pcgstRow.style.display = totals.cgstAmount > 0 ? '' : 'none';
    if (psgstRow) psgstRow.style.display = totals.sgstAmount > 0 ? '' : 'none';
    if (pigstRow) pigstRow.style.display = totals.igstAmount > 0 ? '' : 'none';
    if (ptotRow) ptotRow.style.display = totals.taxType !== 'NONE' ? '' : 'none';

    if (pcgstLabel) pcgstLabel.textContent = `CGST (${totals.cgstRate}%)`;
    if (psgstLabel) psgstLabel.textContent = `SGST (${totals.sgstRate}%)`;
    if (pigstLabel) pigstLabel.textContent = `IGST (${totals.igstRate}%)`;
  }

  const pdueRow = $('p-due-row');
  const pdueAmt = $('p-due-amount');
  if (pdueRow && pdueAmt) {
    pdueRow.style.display = due > 0 ? '' : 'none';
    pdueAmt.textContent = '₹' + INR.format(due);
  }

  syncTaxPreviewRows(totals);
}

// ─── AUTOCOMPLETE ─────────────────────────────────────────────────────────────
function syncTaxPreviewRows(totals) {
  const ptaxtypeRow = $('p-taxtype-row');
  const ptaxtypeLabel = $('p-taxtype-label');
  const pcgstRow = $('p-cgst-row');
  const psgstRow = $('p-sgst-row');
  const pigstRow = $('p-igst-row');
  const ptotRow = $('p-totalgst-row');
  const pcgstLabel = $('p-cgst-label');
  const psgstLabel = $('p-sgst-label');
  const pigstLabel = $('p-igst-label');
  const psub = $('p-subtotal');
  const pcgst = $('p-cgst');

  if (psub) psub.textContent = '₹' + INR.format(totals.subtotal || 0);
  if (pcgst) pcgst.textContent = '₹' + INR.format(totals.cgstAmount || 0);
  if (ptaxtypeRow) ptaxtypeRow.style.display = totals.taxType !== 'NONE' ? '' : 'none';
  if (ptaxtypeLabel) ptaxtypeLabel.textContent = formatTaxLabel(totals.taxType);
  if (pcgstRow) pcgstRow.style.display = totals.cgstAmount > 0 ? '' : 'none';
  if (psgstRow) psgstRow.style.display = totals.sgstAmount > 0 ? '' : 'none';
  if (pigstRow) pigstRow.style.display = totals.igstAmount > 0 ? '' : 'none';
  if (ptotRow) ptotRow.style.display = totals.taxType !== 'NONE' ? '' : 'none';
  if (pcgstLabel) pcgstLabel.textContent = `CGST (${totals.cgstRate || 0}%)`;
  if (psgstLabel) psgstLabel.textContent = `SGST (${totals.sgstRate || 0}%)`;
  if (pigstLabel) pigstLabel.textContent = `IGST (${totals.igstRate || 0}%)`;
}

let acDropdown = null;
let acCurrentItems = [];

function getOrCreateDropdown() {
  if (!acDropdown) {
    acDropdown = document.getElementById('autocomplete-dropdown');
    if (!acDropdown) {
      acDropdown = document.createElement('div');
      acDropdown.id = 'autocomplete-dropdown';
      acDropdown.className = 'autocomplete-dropdown';
      document.body.appendChild(acDropdown);
    }
  }
  return acDropdown;
}

function showGstDropdown(inputEl) {
  currentAcInput = inputEl;
  const options = [
    { label: 'None GST 0%', value: 'NONE' },
    { label: 'GST 5%', value: 'GST5' },
    { label: 'GST 18%', value: 'GST18' },
    { label: 'IGST 5%', value: 'IGST5' },
    { label: 'IGST 18%', value: 'IGST18' }
  ];
  const matches = options.map(opt => ({
    label: opt.label,
    data: opt.value,
    onSelect: () => {
      inputEl.value = opt.label;
      setTaxType(opt.value);
      recalcAll();
      autoSave();
    }
  }));
  renderDropdown(matches, inputEl, null);
}

function showPackagingDropdown(inputEl) {
  currentAcInput = inputEl;
  const rid = inputEl.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;

  const pkOptions = getPackagingForProduct(row.brand, row.name);
  const options = [...new Set([...pkOptions, row.packaging])].filter(Boolean).sort(comparePackagingHigherToLower);

  const matches = [
    { label: '— Select Packaging —', value: '' },
    ...options.map(pk => ({ label: pk, value: pk }))
  ].map(opt => ({
    label: opt.label,
    data: opt.value,
    onSelect: () => {
      inputEl.value = opt.label || '— Select Packaging —';
      onPackagingChange(inputEl, opt.value);
    }
  }));
  renderDropdown(matches, inputEl, rid);
}

async function showItemAutocomplete(inputEl, fieldType) {
  currentAcInput = inputEl;
  if (!inventoryData || !inventoryData.length) {
    try { await fetchInventory(); } catch (_) {}
  }
  const rid = inputEl.dataset.rid;
  const row = rows.find(r => r.id === rid);
  const val = inputEl.value.toLowerCase().trim();
  let matches = [];

  if (fieldType === 'brand') {
    const brands = getUniqueBrands();
    matches = brands.filter(b => !val || b.toLowerCase().includes(val)).map(b => ({ label: b, type: 'brand', data: { brand: b } }));
  } else if (fieldType === 'name') {
    const products = (row && row.brand) ? getProductsForBrand(row.brand) : getAllProducts();
    matches = products.filter(p => !val || p.toLowerCase().includes(val)).map(p => ({ label: p, type: 'name', data: { product: p } }));
  }

  renderDropdown(matches.slice(0, 12), inputEl, rid);
}

function setClientDue(value) {
  const dueInput = $('s-client-due');
  if (dueInput) dueInput.value = value != null && value !== '' ? value : '';
  recalcAll();
}

window.showClientAutocomplete = showClientAutocomplete;
window.showItemAutocomplete = showItemAutocomplete;
window.fetchClients = fetchClients;
window.fetchInventory = fetchInventory;

function applyClientSelection(client) {
  if (!client) return;
  const name = client.ClientName || client.name || '';
  const resolveFn = (typeof window !== 'undefined' && window.resolveClientAddressAndState)
    ? window.resolveClientAddressAndState
    : (typeof resolveClientAddressAndState === 'function' ? resolveClientAddressAndState : null);

  const res = resolveFn ? resolveFn({
    address: client.Address || client.address || '',
    city: client.City || client.city || '',
    state: client.State || client.state || '',
    pincode: client.Pincode || client.pincode || client.pin || '',
    gstin: client.GSTIN || client.gstin || client.gst || ''
  }) : {
    cleanAddress: client.Address || client.address || '',
    state: client.State || client.state || '',
    pincode: client.Pincode || client.pincode || ''
  };

  const addr = res.cleanAddress;
  const state = res.state || '';
  const pin = res.pincode || '';
  const phone = client.Phone || client.phone || '';
  const gstin = client.GSTIN || client.gstin || '';
  const due = client.DueAmount != null ? client.DueAmount : (client.dueAmount != null ? client.dueAmount : 0);

  const nameEl = $('s-client-name');
  const addrEl = $('s-client-addr');
  const stateEl = $('s-client-state');
  const pinEl = $('s-client-pincode');
  const phoneEl = $('s-client-phone');
  const gstinEl = $('s-client-gstin');
  const stateCodeEl = $('s-client-state-code');
  const posEl = $('s-place-supply');

  if (nameEl) nameEl.value = name;
  if (addrEl) addrEl.value = addr;
  if (stateEl) stateEl.value = state;
  if (pinEl) pinEl.value = pin;
  if (phoneEl) phoneEl.value = phone;
  if (gstinEl) gstinEl.value = gstin;
  if (posEl) posEl.value = state;
  if (stateCodeEl) {
    const getCodeFn = (typeof getStateCodeFromName === 'function') ? getStateCodeFromName : (window.getStateCodeFromName || null);
    stateCodeEl.value = getCodeFn ? getCodeFn(state) : '';
  }
  setClientDue(due);
  updateBillToPreview();
  refreshPaper();
  autoSave();
}

function tryAutoFillClient(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value || !Array.isArray(clientsData) || !clientsData.length) return;
  const match = clientsData.find(client => String(client.ClientName || '').trim().toLowerCase() === value);
  if (match) applyClientSelection(match);
}

async function showClientAutocomplete(inputEl) {
  currentAcInput = inputEl;
  if (!clientsData || !clientsData.length) {
    try { await fetchClients(); } catch (_) {}
  }
  const value = String(inputEl?.value || '').trim().toLowerCase();
  const matches = (clientsData || [])
    .filter(client => {
      const name = String(client.ClientName || '').toLowerCase();
      const phone = String(client.Phone || '').toLowerCase();
      const gstin = String(client.GSTIN || '').toLowerCase();
      return !value || name.includes(value) || phone.includes(value) || gstin.includes(value);
    })
    .slice(0, 12)
    .map(client => ({
      label: client.ClientName || 'Unnamed Client',
      type: 'client',
      data: client
    }));

  renderDropdown(matches, inputEl, null);
}

let dropPosRAF = null;
let lastRenderSignature = '';

function startDropdownTracker(inputEl, dd) {
  function tracker() {
    if (dd.style.display !== 'none' && currentAcInput === inputEl) {
      const rect = inputEl.getBoundingClientRect();

      // If input scrolls totally out of the viewport on Y axis, auto-close for cleanliness
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        closeDropdown();
        return;
      }

      // Fixed positioning keeps it attached flawlessly during scroll without lag
      dd.style.position = 'fixed';
      dd.style.left = rect.left + 'px';
      dd.style.top = (rect.bottom + 4) + 'px';
      dd.style.width = rect.width + 'px';

      // Dynamic max-height if near bottom of screen
      const spaceBelow = window.innerHeight - rect.bottom - 10;
      dd.style.maxHeight = Math.max(spaceBelow, 150) + 'px';

      dropPosRAF = requestAnimationFrame(tracker);
    }
  }
  cancelAnimationFrame(dropPosRAF);
  tracker();
}

function renderDropdown(items, inputEl, rid) {
  acCurrentItems = items;
  const dd = getOrCreateDropdown();

  // Signature check prevents duplicate expensive DOM teardowns when tapping rapidly (fixes '2-3 clicks' bug)
  const sig = inputEl.id + '_' + (rid || '') + '_' + items.map(i => i.label).join('|');
  if (dd.style.display === 'block' && currentAcInput === inputEl && lastRenderSignature === sig) {
    return; // Already rendering this exact list for this focused input
  }
  lastRenderSignature = sig;

  dd.innerHTML = '';

  if (!items.length) { dd.style.display = 'none'; return; }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';

    // Add nice padding and make touch targets larger for mobile
    div.style.padding = '12px 14px';

    div.innerHTML = `<span class="autocomplete-brand">${esc(item.label)}</span>`;
    if (item.data && item.data.product) {
      // It's a product: let's show pack/price if available
      const price = getPriceForPackaging(item.data.brand, item.label, null) || '';
      if (price) {
        div.innerHTML += `<div class="autocomplete-price">₹${price}</div>`;
      }
    } else if (item.type === 'client' && item.data) {
      const parts = [item.data.Phone, item.data.GSTIN, item.data.Address].filter(Boolean);
      if (parts.length) {
        div.innerHTML += `<div class="autocomplete-desc">${esc(parts.join(' | '))}</div>`;
      }
    }

    const handleSelect = (e) => {
      if (e) e.preventDefault();
      selectAutocompleteItem(item, rid);
      closeDropdown();
    };
    div.addEventListener('mousedown', handleSelect);
    div.addEventListener('click', handleSelect);
    dd.appendChild(div);
  });

  dd.classList.add('active');
  dd.style.display = 'block';

  // Attach and start the position tracker
  startDropdownTracker(inputEl, dd);
}

function selectAutocompleteItem(item, rid) {
  if (typeof item.onSelect === 'function') {
    item.onSelect(item);
    return;
  }

  // Handle client sidebar selection
  if (item.type === 'client') {
    applyClientSelection(item.data);
    return;
  }

  const row = rows.find(r => r.id === rid); if (!row) return;

  if (item.type === 'brand') {
    row.brand = item.data.brand;
    const products = getProductsForBrand(row.brand);
    // Auto-fill product even if multiple? Let's check if 1 is best, but user says "automatically fetched"
    // If there's only 1, it's a definite win. If more, let's take the first one or leave it but clear the placeholder.
    if (products.length > 0) {
      // If current row name is not in the new products list, or is empty, pick the first one
      if (!row.name || !products.includes(row.name)) {
        row.name = products[0];
      }

      // After setting product, try to set packaging if it's unique or just pick the first for speed
      const packagings = getPackagingForProduct(row.brand, row.name);
      if (packagings.length === 1) {
        row.packaging = packagings[0];
        row.price = getPriceForPackaging(row.brand, row.name, row.packaging);
        row.desc = row.packaging;
      } else {
        row.packaging = ''; row.price = ''; row.desc = '';
      }
    } else {
      row.name = ''; row.packaging = ''; row.price = ''; row.desc = '';
    }
  } else if (item.type === 'name') {
    row.name = item.data.product;

    const validBrands = inventoryData.filter(x => (x.product || x.ProductName || '').toLowerCase() === row.name.toLowerCase()).map(x => x.brand || x.BrandName || '');
    if (validBrands.length > 0 && (!row.brand || !validBrands.includes(row.brand))) {
      row.brand = validBrands[0];
    }

    row.packaging = ''; row.price = ''; row.desc = '';
    const packagings = getPackagingForProduct(row.brand, row.name);
    if (packagings.length === 1) {
      row.packaging = packagings[0];
      row.price = getPriceForPackaging(row.brand, row.name, row.packaging);
      row.desc = row.packaging;
    }
  }

  row.total = (parseFloat(row.qty) || 0) * (parseFloat(row.price) || 0);

  // Visually update the card elements directly
  const card = document.getElementById('mob-card-' + rid);
  if (card) {
    const brandInp = card.querySelector('[data-field="brand"]');
    if (brandInp) brandInp.value = row.brand || '';

    const nameInp = card.querySelector('[data-field="name"]');
    if (nameInp) {
      nameInp.value = row.name || '';
      nameInp.placeholder = row.brand ? 'Start typing product...' : 'Select brand first...';
    }

    const descInp = card.querySelector('[data-field="desc"]');
    if (descInp) descInp.value = row.desc || '';

    const priceInp = card.querySelector('[data-field="price"]');
    if (priceInp) priceInp.value = row.price || '';

    const tSpan = card.querySelector('.mob-item-total-value');
    if (tSpan) tSpan.textContent = row.total > 0 ? '₹' + INR.format(row.total) : '—';

    const packInp = card.querySelector('input[data-field="packaging"]');
    if (packInp) {
      packInp.value = row.packaging || '';
    }

    const hsnInp = card.querySelector('[data-field="hsn"]');
    if (hsnInp) hsnInp.value = row.hsn || '';

    const gstSel = card.querySelector('[data-field="gstRate"]');
    if (gstSel) gstSel.value = row.gstRate != null ? row.gstRate : '18';
  }

  renderRows(); // Update paper preview only
  autoSave();
}

function closeDropdown() {
  if (acDropdown) {
    acDropdown.style.display = 'none';
    acDropdown.classList.remove('active');
  }
  currentAcInput = null;
  lastRenderSignature = '';
  cancelAnimationFrame(dropPosRAF);
}

document.addEventListener('click', e => {
  if (acDropdown && acDropdown.style.display !== 'none' && !acDropdown.contains(e.target) && e.target !== currentAcInput) {
    closeDropdown();
  }
});

function acKeyDown(e, inputEl) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (acDropdown && acDropdown.style.display === 'block' && acCurrentItems.length > 0) {
      selectAutocompleteItem(acCurrentItems[0], inputEl.dataset.rid);
      closeDropdown();
      inputEl.blur();
    }
  }
}

// Qty inputs: select on focus for fast editing
function selectQtyInput(input) { input.select(); }
function resetQtyIfEmpty(input) { if (input.value === '' || input.value === '0') { input.value = ''; } }

// ─── STORAGE (localStorage) ───────────────────────────────────────────────────
function getFieldValues() {
  const ids = ['s-company', 's-address', 's-company-state', 's-company-pincode', 's-phone', 's-email', 's-gstin', 's-signatory',
    's-inv-num', 's-inv-date', 's-due-date', 'gst-rate', 'tax-type',
    's-client-name', 's-client-addr', 's-client-state', 's-client-pincode', 's-client-phone', 's-client-gstin',
    's-bank-name', 's-bank-acc', 's-bank-ifsc', 's-upi', 's-intro', 's-terms'];
  return ids.reduce((obj, id) => { obj[id] = $(id)?.value || ''; return obj; }, {});
}

function setFieldValues(data) {
  if (!data) return;
  Object.entries(data).forEach(([id, val]) => {
    const el = $(id);
    if (!el) return;
    if (id === 's-company' || id === 's-signatory') {
      el.value = normalizeBusinessName(val) || '';
      return;
    }
    if (id === 's-gstin' || id === 's-client-gstin' || id === 'modal-client-gstin') {
      el.value = normalizeGSTIN(val);
      return;
    }
    el.value = val || '';
  });
}

function autoSave() {
  try {
    // If currently editing an existing invoice (e.g. from Orders Dispatch or History),
    // update the cached document for this specific invoice ID
    if (window.currentInvoiceId) {
      try {
        const editDoc = typeof extractInvoiceJSON === 'function' ? extractInvoiceJSON(window.currentInvoiceId) : null;
        if (editDoc) {
          safeStorage.setItem('inv_doc_' + window.currentInvoiceId, JSON.stringify(editDoc));
          safeStorage.setItem('current_edit_invoice', JSON.stringify(editDoc));
        }
      } catch (_) {}
      return;
    }

    // In new invoice mode:
    // Do NOT write unfinalized drafts to persistent localStorage under LS_KEY.
    // Temporary inputs remain in memory so that a normal page refresh or reopening
    // the standalone builder always initializes a fresh, blank invoice.
  } catch (_) { }
}

window.loadSaved = loadSaved;

function loadSaved() {
  // Automatic draft resurrection is disabled so that refreshing or reopening
  // the Invoice Builder in new-invoice mode always initializes a fresh blank invoice.
  try {
    safeStorage.removeItem(LS_KEY);
    safeStorage.removeItem('inv_builder_draft');
  } catch (_) {}
  return false;
}

function setInvoiceNumberDisplay(invoiceNumber) {
  const value = String(invoiceNumber || '').trim();
  const invInput = $('s-inv-num');
  const invDisplay = $('s-inv-num-display');
  const invPreview = $('p-inv-num');
  if (invInput) invInput.value = value;
  if (invDisplay) invDisplay.textContent = value || '—';
  if (invPreview) invPreview.textContent = value || '—';
}

async function setAutoInvoiceNumber(force = false) {
  if (window.currentInvoiceId && !force) {
    return $('s-inv-num')?.value || '';
  }

  const currentValue = ($('s-inv-num')?.value || '').trim();
  if (currentValue && !force) {
    setInvoiceNumberDisplay(currentValue);
    return currentValue;
  }

  const nextNumber = await apiGetNextInvoiceNumber();
  setInvoiceNumberDisplay(nextNumber);
  return nextNumber;
}

async function prepareNextInvoiceDraft() {
  const mode = document.body.classList.contains('gst-mode') ? 'gst' : 'nongst';
  rows = [];
  rowCounter = 0;
  window.currentInvoiceId = null;
  window._invoiceSavedOnce = false;
  window.currentInvoiceFinalized = false;

  ['s-client-name', 's-client-addr', 's-client-phone', 's-client-gstin', 's-client-due', 's-due-date'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });

  const clientStateEl = $('s-client-state');
  if (clientStateEl) clientStateEl.value = '';
  const clientStateCodeEl = $('s-client-state-code');
  if (clientStateCodeEl) clientStateCodeEl.value = '';
  const placeSupplyEl = $('s-place-supply');
  if (placeSupplyEl) placeSupplyEl.value = '';

  const today = getTodayInIndiaISO();
  const dateEl = $('s-inv-date');
  if (dateEl) dateEl.value = today;

  setBillingMode(mode);
  const nextNumber = await setAutoInvoiceNumber(true);
  renderRows();
  ensureOneBlankItem();
  renderMobItems();
  refreshPaper();
  recalcAll();
  autoSave();
  return nextNumber;
}

// ─── CLOUD SAVE ───────────────────────────────────────────────────────────────
async function saveToCloud(silent = false) {
  if (!silent) { toast('Saving…', ''); }
  try {
    if (!window.currentInvoiceId && !$('s-inv-num').value) {
      await setAutoInvoiceNumber();
    }
    const payload = extractInvoiceJSON(window.currentInvoiceId);
    let result;
    if (window.currentInvoiceId) {
      result = await apiUpdateInvoice(payload);
    } else {
      result = await apiSaveInvoice(payload);
    }

    if (result && result.uniqueId) {
      window.currentInvoiceId = result.uniqueId;
      try {
        history.replaceState(null, '', '#edit=' + encodeURIComponent(result.uniqueId));
      } catch (_) {}
      try {
        safeStorage.removeItem(LS_KEY);
      } catch (_) {}
    }
    if (result && result.invoiceNumber) {
      setInvoiceNumberDisplay(result.invoiceNumber);
    }

    window._invoiceSavedOnce = true;
    try {
      const cache = JSON.parse(safeStorage.getItem('invoice_history_cache') || '[]');
      const existingIdx = cache.findIndex(i => i.uniqueId === window.currentInvoiceId);
      const mappedInvoice = {
        uniqueId: window.currentInvoiceId,
        invoiceNumber: payload.InvoiceNumber,
        date: payload.meta?.date,
        customerName: payload.customer?.name || 'Unknown',
        mobile: payload.customer?.phone || '',
        totalAmount: payload.calculations?.grandTotal || 0,
      };
      if (existingIdx !== -1) cache[existingIdx] = { ...cache[existingIdx], ...mappedInvoice };
      else cache.unshift(mappedInvoice);
      safeStorage.setItem('invoice_history_cache', JSON.stringify(cache));
    } catch(e) {}

    // ── Sync Due Amount back to Clients sheet (fire-and-forget) ──────────────
    // Whenever an invoice is saved, update the client's DueAmount in the Clients
    // sheet so it always reflects the very latest outstanding balance.
    try {
      const clientNameStr = payload.customer?.name || payload.ClientName || '';
      const dueAmtVal = parseFloat($('s-client-due')?.value || payload.dueAmount || 0);
      if (clientNameStr) {
        // Update local clientsData cache immediately so UI reflects new value
        if (Array.isArray(clientsData)) {
          const localMatch = clientsData.find(c =>
            (c.ClientName || '').toLowerCase().trim() === clientNameStr.toLowerCase().trim()
          );
          if (localMatch) localMatch.DueAmount = dueAmtVal;
        }
        // Push to backend asynchronously — does NOT block save
        apiUpdateClientDue(clientNameStr, dueAmtVal);
      }
    } catch(e) { console.warn('Due sync error:', e); }

    if (!silent) toast('Invoice saved ✓');
    return { ...result, payload };
  } catch (err) {
    console.error('Save error:', err);
    if (!silent) toast('Save failed: ' + (err.message || 'Network error'), 'error');
    throw err;
  }
}

// ─── PDF GENERATION ───────────────────────────────────────────────────────────
function pdfMoney(value) {
  return '₹' + INR.format(parseFloat(value) || 0);
}

function pdfWrapLines(pdf, text, maxWidth) {
  const rawLines = String(text || '').split('\n');
  const wrapped = [];
  rawLines.forEach(line => {
    const chunks = pdf.splitTextToSize(line || ' ', maxWidth);
    if (chunks.length) wrapped.push(...chunks);
    else wrapped.push(' ');
  });
  return wrapped;
}

function pdfDrawImageIfReady(pdf, imgEl, format, x, y, w, h) {
  if (!imgEl || imgEl.style.display === 'none') return;
  try {
    pdf.addImage(imgEl, format, x, y, w, h);
  } catch (err) {
    console.warn('Skipping PDF image:', err.message);
  }
}

// High-precision text & vector PDF generation is implemented in js/invoice-pdf.js
// drawA4InvoicePdf and generateAndDownloadInvoicePDF are available globally via invoice-pdf.js

async function incrementInvoiceNumber() {
  const currentNum = parseInt($('s-inv-num')?.value || '0') || 0;
  const nextNum = currentNum + 1;
  const invInput = $('s-inv-num');
  const invDisplay = $('s-inv-num-display');
  if (invInput) invInput.value = nextNum.toString();
  if (invDisplay) invDisplay.textContent = nextNum.toString();
  const invPreview = $('p-inv-num');
  if (invPreview) invPreview.textContent = nextNum.toString();
}

async function advanceToNextInvoiceDraftAfterDownload() {
  window.currentInvoiceFinalized = true;
  return await prepareNextInvoiceDraft();
}

async function downloadPDF() {
  if (typeof generateAndDownloadInvoicePDF === 'function') {
    return await generateAndDownloadInvoicePDF();
  }

  const btn = $('pdf-btn'), mobBtn = $('mob-pdf-btn');
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined" style="animation:spin 1s linear infinite">autorenew</span> Generating…';
    btn.disabled = true;
  }
  if (mobBtn) mobBtn.disabled = true;

  try {
    let saveResult;
    try {
      saveResult = await saveToCloud(true);
    } catch (e) {
      console.warn('Auto-save before PDF failed', e);
    }

    const payload = saveResult?.payload || extractInvoiceJSON(window.currentInvoiceId);
    const invNum = payload.InvoiceNumber || $('s-inv-num')?.value || $('p-inv-num')?.textContent || '01';
    const isDispatch = !!(payload.dispatchNo || window.currentDispatchNo || (payload.type === 'dispatch') || String(invNum || '').startsWith('INV-'));
    const filename = (typeof getStandardInvoicePdfFilename === 'function')
      ? getStandardInvoicePdfFilename(invNum, isDispatch)
      : (window.getStandardInvoicePdfFilename ? window.getStandardInvoicePdfFilename(invNum, isDispatch) : `Invoice_${invNum}.pdf`);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    drawA4InvoicePdf(pdf, payload);
    savePdfBlob(pdf, filename);

    // Always guarantee saving to history cache upon downloading PDF
    try {
      const uniqueId = window.currentInvoiceId || payload.meta?.uniqueId || (saveResult && saveResult.uniqueId) || ('INV-' + Date.now().toString(36).toUpperCase());
      window.currentInvoiceId = uniqueId;
      payload.meta = payload.meta || {};
      payload.meta.uniqueId = uniqueId;
      payload.meta.invoiceNumber = invNum;
      payload.InvoiceNumber = invNum;

      if (typeof safeStorage !== 'undefined') {
        safeStorage.setItem('inv_doc_' + uniqueId, JSON.stringify(payload));
        let history = [];
        try {
          history = JSON.parse(safeStorage.getItem('invoice_history_cache') || '[]');
        } catch (_) { history = []; }

        const summary = {
          uniqueId: uniqueId,
          invoiceNumber: invNum,
          date: payload.meta?.date || payload.Date || new Date().toISOString().substring(0, 10),
          dueDate: payload.meta?.dueDate || payload.DueDate || '',
          customerName: payload.customer?.name || payload.ClientName || 'Unnamed Client',
          mobile: payload.customer?.phone || payload.customer?.contact || payload.ClientPhone || '',
          totalAmount: parseFloat(payload.calculations?.grandTotal || payload.GrandTotal || 0) || 0,
          totalBoxes: (payload.rows || []).reduce((sum, r) => sum + (parseFloat(r.boxes) || 0), 0),
          totalUnits: (payload.rows || []).reduce((sum, r) => sum + (parseFloat(r.totalUnits || r.qty) || 0), 0),
          is_stock_deducted: false
        };

        const existingIdx = history.findIndex(h => h.uniqueId === uniqueId || (h.invoiceNumber && h.invoiceNumber === invNum));
        if (existingIdx >= 0) {
          history[existingIdx] = { ...history[existingIdx], ...summary };
        } else {
          history.unshift(summary);
        }
        safeStorage.setItem('invoice_history_cache', JSON.stringify(history));
      }
    } catch (histErr) {
      console.warn('PDF download history save note:', histErr);
    }

    if (typeof advanceToNextInvoiceDraftAfterDownload === 'function') {
      const nextNum = await advanceToNextInvoiceDraftAfterDownload();
      const displayNext = nextNum || $('s-inv-num')?.value || $('p-inv-num')?.textContent || '';
      toast({
        title: 'PDF Downloaded Successfully',
        nextInvoice: displayNext ? displayNext.trim() : '',
        type: 'download-success'
      });
    } else {
      toast({
        title: 'PDF Downloaded Successfully',
        type: 'download-success'
      });
    }
  } catch (err) {
    console.error('PDF error:', err);
    toast('PDF generation failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined">download</span> Download PDF';
      btn.disabled = false;
    }
    if (mobBtn) mobBtn.disabled = false;
  }
}

const downloadVectorPDF = downloadPDF;

// ─── WHATSAPP PDF SHARING ──────────────────────────────────────────────────
async function shareInvoiceWhatsApp() {
  const rowsList = window.rows || [];
  if (!rowsList.length || !rowsList[0] || !rowsList[0].qty || parseFloat(rowsList[0].qty) <= 0) {
    if (typeof toast === 'function') toast('At least one item with valid quantity is required', 'error');
    return;
  }

  const btn = $('whatsapp-btn');
  const mobBtn = $('mob-whatsapp-btn');
  try {
    if (btn) btn.disabled = true;
    if (mobBtn) mobBtn.disabled = true;

    // Trigger cloud auto-save asynchronously in the background WITHOUT awaiting
    // (Awaiting network requests breaks transient user activation on mobile browsers!)
    if (typeof saveToCloud === 'function') {
      saveToCloud(true).catch(e => console.warn('Background auto-save note:', e));
    }

    const payload = extractInvoiceJSON(window.currentInvoiceId);
    const invNum = payload.InvoiceNumber || $('s-inv-num')?.value || $('p-inv-num')?.textContent || '01';
    const isDispatch = !!(payload.dispatchNo || window.currentDispatchNo || (payload.type === 'dispatch') || String(invNum || '').startsWith('INV-'));

    return await window.shareInvoicePdfOnWhatsApp(payload, {
      isDispatch,
      onToast: (msg, type) => {
        if (typeof toast === 'function') toast(msg, type);
      }
    });

  } catch (err) {
    console.error('WhatsApp share error:', err);
    if (typeof toast === 'function') toast('WhatsApp sharing failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (mobBtn) mobBtn.disabled = false;
  }
}

function closeWhatsAppFallbackModal() {
  const modal = document.getElementById('whatsapp-instructions-modal');
  if (modal) modal.remove();
  document.body.style.overflow = '';
}

window.shareInvoiceWhatsApp = shareInvoiceWhatsApp;
window.closeWhatsAppFallbackModal = closeWhatsAppFallbackModal;
window.closeWhatsAppFallbackModal = closeWhatsAppFallbackModal;

// ─── MOBILE UI ────────────────────────────────────────────────────────────────
function initMobile() {
  const isMob = window.innerWidth <= 768;
  const tabs = $('mobile-tabs');
  if (tabs) {
    tabs.style.display = isMob ? 'flex' : 'none';
    tabs.style.visibility = isMob ? 'visible' : 'hidden';
    tabs.style.opacity = isMob ? '1' : '0';
  }
  if (isMob) showMobilePanel('edit');

  // Wire up mobile PDF and WhatsApp buttons
  const mobPdf = $('mob-pdf-btn');
  if (mobPdf) mobPdf.onclick = downloadPDF;
  const mobWhatsApp = $('mob-whatsapp-btn');
  if (mobWhatsApp) mobWhatsApp.onclick = shareInvoiceWhatsApp;
}

function showMobilePanel(panel) {
  const sidebar = $('sidebar'), main = $('main');
  if (!sidebar || !main) return;
  if (panel === 'edit') {
    sidebar.classList.remove('panel-hidden');
    main.classList.add('panel-hidden');
    main.classList.remove('mob-preview');
  } else {
    sidebar.classList.add('panel-hidden');
    main.classList.remove('panel-hidden');
    main.classList.add('mob-preview');
    if (window.innerWidth <= 768) scalePaperForMobile();
  }
  // Highlight active tab
  document.querySelectorAll('.mob-nav-tab').forEach(t => t.classList.remove('active'));
  const activeTab = panel === 'edit' ? $('mob-edit-tab') : $('mob-preview-tab');
  if (activeTab) activeTab.classList.add('active');
}

function scalePaperForMobile() {
  const paper = $('invoice-paper'), main = $('main');
  if (!paper || !main || window.innerWidth > 768) return;
  requestAnimationFrame(() => {
    const scale = (window.innerWidth - 8) / 794;
    paper.style.transform = `scale(${scale})`;
    paper.style.transformOrigin = 'top left';
    main.style.minHeight = (paper.scrollHeight * scale + 80) + 'px';
  });
}

// ─── EDIT MODE & NEW INVOICE CONTROLS ──────────────────────────────────────────
function updateEditModeBanner() {
  const banner = $('builder-mode-banner');
  const text = $('builder-mode-text');
  if (!banner) return;

  if (window.currentInvoiceId) {
    banner.style.display = 'flex';
    banner.className = 'mode-edit';
    banner.style.background = '#eff6ff';
    banner.style.borderColor = '#bfdbfe';
    banner.style.color = '#1e40af';
    const dispLabel = window.currentDispatchNo ? ' (' + window.currentDispatchNo + ')' : '';
    if (text) text.innerHTML = '<span><strong>Editing Invoice:</strong> ' + window.currentInvoiceId + dispLabel + '</span>';
  } else {
    banner.style.display = 'none';
    banner.className = 'mode-new';
    if (text) text.innerHTML = '';
  }
}
window.updateEditModeBanner = updateEditModeBanner;

async function startNewInvoice(force = false) {
  try {
    if (typeof _currentLoadToken !== "undefined") _currentLoadToken++;
    window.currentInvoiceId = null;
    window.currentDispatchNo = '';
    window.currentVehicleNo = '';
    window.currentInvoiceFinalized = false;
    window._invoiceSavedOnce = false;

    // Clean hash and query params from URL cleanly without page reload
    if (window.location.hash || window.location.search) {
      history.replaceState(null, '', window.location.pathname);
    }

    // Clear temporary edit session storage
    try {
      safeStorage.removeItem('current_edit_invoice');
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('current_edit_invoice');
      }
      safeStorage.removeItem('inv_builder_draft');
      safeStorage.removeItem(LS_KEY); // clear saved draft so fresh blank state is ready
    } catch (_) {}

    // Reset customer and dispatch inputs
    ['s-client-name', 's-client-addr', 's-client-phone', 's-client-gstin', 's-client-due', 's-due-date'].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    const clientStateEl = $('s-client-state');
    if (clientStateEl) clientStateEl.value = '';
    const clientStateCodeEl = $('s-client-state-code');
    if (clientStateCodeEl) clientStateCodeEl.value = '';
    const placeSupplyEl = $('s-place-supply');
    if (placeSupplyEl) placeSupplyEl.value = '';

    const curDateEl = $('s-inv-date');
    if (curDateEl) curDateEl.value = getTodayInIndiaISO();

    // Reset dispatch & vehicle lines on preview
    const dispEl = $('p-disp-line');
    if (dispEl) dispEl.style.display = 'none';
    const vehEl = $('p-veh-line');
    if (vehEl) vehEl.style.display = 'none';

    // Reset client preview text & address rows
    const pcName = $('p-client-name');
    if (pcName) pcName.textContent = 'Client Name';
    const pcAddr = $('p-client-addr-text');
    if (pcAddr) {
      pcAddr.textContent = '';
      pcAddr.style.display = 'none';
    }
    const pcSub = $('p-client-sub');
    if (pcSub) pcSub.textContent = '';
    const pDueLine = $('p-due-line');
    if (pDueLine) pDueLine.style.display = 'none';

    const pStateRow = $('p-client-state-row');
    if (pStateRow) pStateRow.style.display = 'none';
    const pPinRow = $('p-client-pin-row');
    if (pPinRow) pPinRow.style.display = 'none';
    const pPhoneRow = $('p-client-phone-row');
    if (pPhoneRow) pPhoneRow.style.display = 'none';
    const pGstinRow = $('p-client-gstin-row');
    if (pGstinRow) pGstinRow.style.display = 'none';
    const r1 = $('p-client-row-1');
    if (r1) r1.style.display = 'none';
    const r2 = $('p-client-row-2');
    if (r2) r2.style.display = 'none';

    // Reset rows to 1 blank row
    rows = [];
    rowCounter = 0;
    ensureOneBlankItem();

    // Request next invoice number
    await setAutoInvoiceNumber(true);

    // Update edit banner UI
    updateEditModeBanner();

    // Re-render and recalculate
    renderRows();
    renderMobItems();
    refreshPaper();
    recalcAll();

    toast('Ready for new invoice');
    return true;
  } catch (err) {
    console.error('[InvoiceBuilder] Error starting new invoice:', err);
    return false;
  }
}
window.startNewInvoice = startNewInvoice;
window.resetInvoiceBuilderToCleanState = startNewInvoice;

// ─── DEDICATED INVOICE LOADER ──────────────────────────────────────────────────
let _currentLoadToken = 0;
async function loadInvoiceById(editId) {
  if (!editId) return false;
  const thisToken = ++_currentLoadToken;
  console.log('[InvoiceBuilder] Loading invoice:', editId, 'token:', thisToken);
  try {
    toast('Loading invoice ' + editId + '...');
    const invoiceData = await apiGetInvoice(editId);
    if (thisToken !== _currentLoadToken) {
      console.log('[InvoiceBuilder] Stale load response discarded for token:', thisToken);
      return false;
    }
    const restoreFn = (typeof window !== 'undefined' && window.restoreInvoiceUI) ? window.restoreInvoiceUI : (typeof restoreInvoiceUI === 'function' ? restoreInvoiceUI : null);
    if (invoiceData && restoreFn) {
      // 1. Completely reset form and preview state before loading new invoice data
      // This guarantees zero data leakage from previously opened orders, invoices, or dispatches
      ['s-client-name', 's-client-addr', 's-client-phone', 's-client-gstin', 's-client-due', 's-due-date', 's-client-state', 's-client-state-code', 's-place-supply', 's-notes'].forEach(id => {
        const el = $(id);
        if (el) el.value = '';
      });
      window.currentDispatchNo = '';
      window.currentVehicleNo = '';

      // Reset client preview and all optional address rows
      const pcName = $('p-client-name'); if (pcName) pcName.textContent = 'Client Name';
      const pcAddr = $('p-client-addr-text'); if (pcAddr) { pcAddr.textContent = ''; pcAddr.style.display = 'none'; }
      const pcSub = $('p-client-sub'); if (pcSub) pcSub.textContent = '';
      const pDueLine = $('p-due-line'); if (pDueLine) pDueLine.style.display = 'none';
      const dispEl = $('p-disp-line'); if (dispEl) dispEl.style.display = 'none';
      const vehEl = $('p-veh-line'); if (vehEl) vehEl.style.display = 'none';
      const pStateRow = $('p-client-state-row'); if (pStateRow) pStateRow.style.display = 'none';
      const pPinRow = $('p-client-pin-row'); if (pPinRow) pPinRow.style.display = 'none';
      const pPhoneRow = $('p-client-phone-row'); if (pPhoneRow) pPhoneRow.style.display = 'none';
      const pGstinRow = $('p-client-gstin-row'); if (pGstinRow) pGstinRow.style.display = 'none';
      const r1 = $('p-client-row-1'); if (r1) r1.style.display = 'none';
      const r2 = $('p-client-row-2'); if (r2) r2.style.display = 'none';
      const pNotes = $('p-notes'); if (pNotes) { pNotes.textContent = ''; pNotes.style.display = 'none'; }
      const pTerms = $('p-terms'); if (pTerms) { pTerms.textContent = ''; pTerms.style.display = 'none'; }

      rows = [];
      rowCounter = 0;

      // 2. Set currentInvoiceId and restore invoiceData
      window.currentInvoiceId = editId;
      window._invoiceSavedOnce = true;
      window.currentInvoiceFinalized = true;
      restoreFn(invoiceData);
      updateEditModeBanner();
      try {
        safeStorage.setItem('current_edit_invoice', JSON.stringify(invoiceData));
      } catch (_) {}

      // Clean hash from URL so that reloading the website initializes a fresh blank invoice
      if (window.location.hash.startsWith('#edit=')) {
        try {
          history.replaceState(null, '', window.location.pathname);
        } catch (_) {}
      }

      if (typeof renderRows === 'function') renderRows();
      if (typeof renderMobItems === 'function') renderMobItems();
      if (typeof refreshPaper === 'function') refreshPaper();
      if (typeof recalcAll === 'function') recalcAll();
      toast('Invoice ' + editId + ' loaded');
      return true;
    }
  } catch (err) {
    console.error('[InvoiceBuilder] Failed to load invoice:', err);
    toast('Failed to load invoice details: ' + (err.message || 'Not found'), 'error');
  }
  return false;
}
window.loadInvoiceById = loadInvoiceById;

// ─── BOOT ─────────────────────────────────────────────────────────────────────
async function bootApp(loggedInMobile) {
  const today = getTodayInIndiaISO();
  const dateEl = $('s-inv-date');
  if (dateEl) dateEl.value = today;
  if (loggedInMobile) setUserPhone(loggedInMobile);
  initMobile();

  // Load logo
  if (!logoDataUrl && typeof loadDefaultLogo === 'function') loadDefaultLogo();

  // Bind sidebar → paper sync
  bindSidebarInputs();

  const clientNameInput = $('s-client-name');
  if (clientNameInput) {
    clientNameInput.onfocus = () => showClientAutocomplete(clientNameInput);
    clientNameInput.onclick = () => showClientAutocomplete(clientNameInput);
    clientNameInput.oninput = (e) => {
      syncClientSub(e);
      showClientAutocomplete(clientNameInput);
    };
    clientNameInput.onkeydown = (e) => acKeyDown(e, clientNameInput);
  }

  // Wire buttons
  const brandLink = $('brand-home-link');
  if (brandLink) {
    brandLink.onclick = async (e) => {
      e.preventDefault();
      if (window.location.hash || window.location.search) {
        try { history.replaceState(null, '', window.location.pathname); } catch(_) {}
      }
      await startNewInvoice(true);
    };
  }
  const pdfBtn = $('pdf-btn'); if (pdfBtn) pdfBtn.onclick = downloadPDF;
  const whatsappBtn = $('whatsapp-btn'); if (whatsappBtn) whatsappBtn.onclick = shareInvoiceWhatsApp;
  const saveBtn = $('save-cloud-btn'); if (saveBtn) saveBtn.onclick = () => saveToCloud();
  const modeNonGstBtn = $('mode-nongst'); if (modeNonGstBtn) modeNonGstBtn.onclick = () => setBillingMode('nongst');
  const modeGstBtn = $('mode-gst'); if (modeGstBtn) modeGstBtn.onclick = () => setBillingMode('gst');

  // Init mobile
  initMobile();
  window.addEventListener('resize', initMobile);

  // 1. FIRST PRIORITY: CHECK FOR URL HASH OR QUERY PARAM (Edit Mode)
  const hash = window.location.hash || '';
  const urlParams = new URLSearchParams(window.location.search);
  const queryEditId = urlParams.get('inv') || urlParams.get('id') || urlParams.get('edit') || urlParams.get('dsp') || urlParams.get('dispatch');
  let editId = null;

  if (hash.startsWith('#edit=')) {
    editId = decodeURIComponent(hash.replace('#edit=', '').trim());
  } else if (queryEditId) {
    editId = decodeURIComponent(queryEditId.trim());
  }

  let editLoaded = false;
  if (editId) {
    editLoaded = await loadInvoiceById(editId);
    if (!editLoaded) {
      // Clear invalid hash from URL so user is not trapped across reloads
      history.replaceState(null, '', window.location.pathname);
      toast('Could not load invoice ' + editId + '. Starting fresh invoice.', 'error');
    }
  } else if (hash === '#new=gst') {
    history.replaceState(null, '', window.location.pathname);
    setBillingMode('gst');
  } else if (hash === '#new=nongst') {
    history.replaceState(null, '', window.location.pathname);
    setBillingMode('nongst');
  } else if (hash === '#new') {
    history.replaceState(null, '', window.location.pathname);
    await startNewInvoice(true);
    return;
  }

  // 2. In new invoice mode (no valid editId), ALWAYS initialize a fresh blank invoice
  if (!editLoaded) {
    window.currentInvoiceId = null;
    window.currentDispatchNo = '';
    window.currentVehicleNo = '';
    window.currentInvoiceFinalized = false;
    window._invoiceSavedOnce = false;

    // Purge any temporary draft keys so abandoned/temporary data never survives
    try {
      safeStorage.removeItem(LS_KEY);
      safeStorage.removeItem('inv_builder_draft');
      safeStorage.removeItem('current_edit_invoice');
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('current_edit_invoice');
      }
    } catch (_) {}

    // Reset customer and dispatch inputs
    ['s-client-name', 's-client-addr', 's-client-phone', 's-client-gstin', 's-client-due', 's-due-date'].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    const clientStateEl = $('s-client-state');
    if (clientStateEl) clientStateEl.value = '';
    const clientStateCodeEl = $('s-client-state-code');
    if (clientStateCodeEl) clientStateCodeEl.value = '';
    const placeSupplyEl = $('s-place-supply');
    if (placeSupplyEl) placeSupplyEl.value = '';

    const curDateEl = $('s-inv-date');
    if (curDateEl) curDateEl.value = today;

    // Reset dispatch & vehicle lines on preview
    const dispEl = $('p-disp-line');
    if (dispEl) dispEl.style.display = 'none';
    const vehEl = $('p-veh-line');
    if (vehEl) vehEl.style.display = 'none';

    // Reset client preview text & address rows
    const pcName = $('p-client-name');
    if (pcName) pcName.textContent = 'Client Name';
    const pcAddr = $('p-client-addr-text');
    if (pcAddr) {
      pcAddr.textContent = '';
      pcAddr.style.display = 'none';
    }
    const pcSub = $('p-client-sub');
    if (pcSub) pcSub.textContent = '';
    const pDueLine = $('p-due-line');
    if (pDueLine) pDueLine.style.display = 'none';

    const pStateRow = $('p-client-state-row');
    if (pStateRow) pStateRow.style.display = 'none';
    const pPinRow = $('p-client-pin-row');
    if (pPinRow) pPinRow.style.display = 'none';
    const pPhoneRow = $('p-client-phone-row');
    if (pPhoneRow) pPhoneRow.style.display = 'none';
    const pGstinRow = $('p-client-gstin-row');
    if (pGstinRow) pGstinRow.style.display = 'none';
    const r1 = $('p-client-row-1');
    if (r1) r1.style.display = 'none';
    const r2 = $('p-client-row-2');
    if (r2) r2.style.display = 'none';

    // Reset rows to 1 clean blank item
    rows = [];
    rowCounter = 0;
    ensureOneBlankItem();

    // Proactively generate next invoice number
    await setAutoInvoiceNumber(true);

    // Update edit banner UI
    updateEditModeBanner();

    // Re-render and recalculate
    renderRows();
    renderMobItems();
    refreshPaper();
    recalcAll();
  } else {
    updateEditModeBanner();
  }

  // Render and settle preview
  setTimeout(() => {
    renderRows();
    renderMobItems();
    refreshPaper();
    recalcAll();
  }, 50);

  setTimeout(() => {
    if (rows.length > 0) renderMobItems();
  }, 150);

  // 4. Fetch inventory and clients in background (non-blocking!)
  Promise.all([fetchInventory(), fetchClients()]).catch(e => {
    console.warn('Background inventory/clients fetch error:', e);
  });
}
window.bootApp = bootApp;

// ─── BOOT ON LOAD (RESILIENT READY DETECTION) ────────────────────────────────
function bootOnLoad() {
  document.body.classList.add('material-symbols-loaded');

  forceUppercaseValue($('s-gstin'));
  forceUppercaseValue($('s-client-gstin'));
  forceUppercaseValue($('modal-client-gstin'));

  // Boot Invoice Builder immediately without login requirement
  try {
    const mobile = (typeof safeStorage !== 'undefined' && safeStorage?.getItem('inv_user_mobile')) || '9664675227';
    const toolbar = $('toolbar');
    const app = $('app');
    if (toolbar) toolbar.classList.remove('hidden');
    if (app) app.classList.remove('hidden');
    if (typeof initMobile === 'function') initMobile();
    if (typeof bootApp === 'function') {
      Promise.resolve(bootApp(mobile)).catch(err => {
        console.error('Error in bootApp promise:', err);
      });
    }
  } catch (err) {
    console.error('Error during bootApp:', err);
  }
}

let _hasBooted = false;
function safeBootInvoiceBuilder() {
  if (_hasBooted) return;
  _hasBooted = true;
  bootOnLoad();
}

// Guaranteed boot execution regardless of whether DOMContentLoaded already fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeBootInvoiceBuilder);
  window.addEventListener('DOMContentLoaded', safeBootInvoiceBuilder);
  window.addEventListener('load', safeBootInvoiceBuilder);
  setTimeout(safeBootInvoiceBuilder, 50);
} else {
  safeBootInvoiceBuilder();
}

// Listen for dynamic hash changes (e.g. user clicks another invoice while already on builder)
window.addEventListener('hashchange', () => {
  const hash = window.location.hash || '';
  if (hash.startsWith('#edit=')) {
    const editId = decodeURIComponent(hash.replace('#edit=', '').trim());
    if (editId) loadInvoiceById(editId);
  } else if (!hash || hash === '#new') {
    startNewInvoice(true);
  }
});

// ─── GLOBAL CLIENT SUB SYNC ──────────────────────────────────────────────────
function syncClientSub(e) {
  const addr = $('s-client-addr')?.value || '';
  const phone = formatClientPhoneForPreview($('s-client-phone')?.value || '');
  const gstin = formatClientGSTINForPreview($('s-client-gstin')?.value || '');
  const parts = [addr, phone, gstin].filter(Boolean);
  const pcs = $('p-client-sub'); if (pcs) pcs.textContent = parts.join(' | ');
  
  if (e && e.target) {
      tryAutoFillClient(e.target.value);
      showClientAutocomplete(e.target);
  }
  autoSave();
}

// ─── GST BILLING MODE FUNCTIONS ──────────────────────────────────────────────
function setBillingMode(mode) {
  const isGst = mode === 'gst';
  if (isGst) {
    document.body.classList.add('gst-mode');
    const modeGstBtn = $('mode-gst'); if (modeGstBtn) modeGstBtn.classList.add('active');
    const modeNongstBtn = $('mode-nongst'); if (modeNongstBtn) modeNongstBtn.classList.remove('active');
  } else {
    document.body.classList.remove('gst-mode');
    const modeNongstBtn = $('mode-nongst'); if (modeNongstBtn) modeNongstBtn.classList.add('active');
    const modeGstBtn = $('mode-gst'); if (modeGstBtn) modeGstBtn.classList.remove('active');
  }

  if (!isGst) {
    setTaxType('NONE');
  }

  // Update row fields: default gstRate / hsn for all rows
  rows.forEach(r => {
    if (isGst) {
      if (!r.gstRate && r.gstRate !== 0) r.gstRate = getTaxConfig(resolveTaxTypeFromInputs()).rate || 18;
      if (!r.hsn) r.hsn = '';
    } else {
      r.gstRate = 0;
      r.hsn = '';
    }
  });

  if (isGst && resolveTaxTypeFromInputs() === 'NONE') {
    setTaxType('GST18');
  }

  // Re-run client sub display since GST state details may need to appear/disappear
  syncClientSub();

  // GST-only: swap intro/terms shown in preview & saved PDF
  // Backup non-GST values on first switch, then override inputs for GST invoices
  try {
    const introEl = $('s-intro');
    const termsEl = $('s-terms');
    if (introEl && termsEl) {
      if (isGst) {
        if (!document.body.dataset._backupIntro) document.body.dataset._backupIntro = introEl.value || '';
        if (!document.body.dataset._backupTerms) document.body.dataset._backupTerms = termsEl.value || '';
        introEl.value = '';
        termsEl.value = `1. Good once sold will not be taken back\n2. Interest @18% p.a. will be charged if payment is not made within due date.\n3. Our risk and responsibility ceases as soon as the goods leave our premises\n4. "Subject to 'RAJKOT' Jurisdiction only. E.&.O.E"`;
      } else {
        // Restore previous values when leaving GST mode
        if (document.body.dataset._backupIntro !== undefined) {
          introEl.value = document.body.dataset._backupIntro || '';
          delete document.body.dataset._backupIntro;
        }
        if (document.body.dataset._backupTerms !== undefined) {
          termsEl.value = document.body.dataset._backupTerms || '';
          delete document.body.dataset._backupTerms;
        }
      }
    }
  } catch (e) { console.warn('GST intro/terms swap failed:', e); }
  ensureOneBlankItem();
  renderRows();
  renderMobItems();
  refreshPaper();
  // If mobile preview is active, rescale the paper so updated notes/terms are visible
  try { if (document.getElementById('main')?.classList.contains('mob-preview')) scalePaperForMobile(); } catch (e) {}
  recalcAll();
  autoSave();
}

// Legacy startNewInvoice alias redirected to unified startNewInvoice
// (Removed shadowed declaration)

function onClientStateChange() {
  const select = $('s-client-state');
  if (!select) return;
  const selectedOpt = select.options[select.selectedIndex];
  const code = selectedOpt.dataset.code;
  const codeInput = $('s-client-state-code');
  if (codeInput && code) {
    codeInput.value = code;
  }
  
  // Auto sync place of supply
  const placeSelect = $('s-place-supply');
  if (placeSelect) {
    if (select.value === 'Other') {
      placeSelect.value = 'Other';
    } else {
      placeSelect.value = select.value;
    }
  }
  
  // Sync place of supply text in preview
  const pps = $('p-place-supply'); if (pps) pps.textContent = (placeSelect ? placeSelect.value : select.value) || '';

  syncClientSub();
  recalcAll();
  autoSave();
}

function onStateCodeInput() {
  const codeInput = $('s-client-state-code');
  if (!codeInput) return;
  const val = codeInput.value.trim();
  const select = $('s-client-state');
  if (!select) return;
  let found = false;
  for (let opt of select.options) {
    if (opt.dataset.code === val) {
      select.value = opt.value;
      found = true;
      break;
    }
  }
  if (!found && val.length === 2) {
    select.value = 'Other';
  }
  
  // Auto sync place of supply
  const placeSelect = $('s-place-supply');
  if (placeSelect) {
    placeSelect.value = select.value;
  }
  
  // Sync place of supply text in preview
  const pps = $('p-place-supply'); if (pps) pps.textContent = (placeSelect ? placeSelect.value : select.value) || '';

  syncClientSub();
  recalcAll();
  autoSave();
}

function onRowGstRateChange(el) {
  const rid = el.dataset.rid;
  const row = rows.find(r => r.id === rid); if (!row) return;
  row.gstRate = parseFloat(el.value) || 0;
  recalcAll();
  renderRows();
  autoSave();
}



// ─── CLEAR / NEW INVOICE ──────────────────────────────────────────────────────
async function clearAll() {
  return await startNewInvoice(true);
}

// Validation
function validatePhone(p) { return /^\d{10}$/.test(String(p).trim()); }
function validateGST(g) { return /^[A-Z0-9]{15}$/i.test(String(g).trim()); }

// Modals
function openClientModal(c = {}) {
  const m = $('client-modal'); if (!m) return;
  m.dataset.masterType = ''; // Clear master type for standard add
  m.style.display = 'flex';
  $('modal-client-name').value = c.ClientName || '';
  $('modal-client-addr').value = c.Address || '';
  $('modal-client-phone').value = c.Phone || '';
  $('modal-client-gstin').value = normalizeGSTIN(c.GSTIN || '');
}
function openMasterModal(type = 'clients') {
  if (type === 'clients') {
    openClientModal({});
    const modal = $('client-modal');
    if (modal) modal.dataset.masterType = 'clients';
    const dueEl = $('modal-client-due');
    if (dueEl) dueEl.value = '';
    return;
  }
  openClientModal({});
}
function closeClientModal() { const m = $('client-modal'); if (m) m.style.display = 'none'; }

async function saveClientModal() {
  const m = $('client-modal');
  const type = m.dataset.masterType;
  const idValue = m.dataset.entryId;

  // Helper for sequential IDs
  function getNextMasterId(t) {
    const prefix = t === 'products' ? 'P-' : 'C-';
    const data = t === 'products' ? inventoryData : clientsData;
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
    return prefix + String(max + 1).padStart(3, '0');
  }

  if (type === 'products') {
    const brand = formatText($('modal-client-name').value.trim());
    const name = formatText($('modal-client-addr').value.trim());
    const size = formatText($('modal-client-phone').value.trim());
    const price = $('modal-client-gstin').value.trim();

    if (!brand || !name) { toast('Brand and Product Name required', 'error'); return; }

    const p = {
      ProductID: idValue || getNextMasterId('products'),
      id: idValue || getNextMasterId('products'),
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

    try {
      const success = idValue ? await updateProduct(p) : await addProduct(p);
      if (success) { toast('Product saved to database'); fetchInventory(); closeClientModal(); }
    } catch (e) { toast(e.message, 'error'); }

  } else if (type === 'clients') {
    const cname = formatText($('modal-client-name').value.trim());
    const addr = formatText($('modal-client-addr').value.trim());
    const ph = $('modal-client-phone').value.trim();
    const gst = normalizeGSTIN($('modal-client-gstin').value);
    const due = $('modal-client-due')?.value?.trim() || '0';

    if (!cname) { toast('Client Name required', 'error'); return; }

    const c = {
      ClientID: idValue || getNextMasterId('clients'),
      id: idValue || getNextMasterId('clients'),
      ClientName: cname,
      'Client Name': cname,
      client: cname,
      name: cname,
      Address: addr,
      address: addr,
      Phone: ph,
      phone: ph,
      GSTIN: gst,
      gstin: gst,
      DueAmount: parseFloat(due) || 0,
      'Due Amount': parseFloat(due) || 0,
      due: parseFloat(due) || 0
    };

    try {
      const success = idValue ? await updateClient(c) : await addClient(c);
      if (success) { toast('Client saved to database'); fetchClients(); closeClientModal(); }
    } catch (e) { toast(e.message, 'error'); }
  } else {
    // Normal client quick-add (from invoice selection if not found)
    const client = {
      ClientName: formatText($('modal-client-name').value.trim()),
      Address: formatText($('modal-client-addr').value.trim()),
      Phone: $('modal-client-phone').value.trim(),
      GSTIN: $('modal-client-gstin').value.trim(),
    };
    if (client.Phone && !validatePhone(client.Phone)) { toast('Phone must be 10 digits', 'error'); return; }
    if (client.GSTIN && !validateGST(client.GSTIN)) { toast('GSTIN must be 15 chars', 'error'); return; }
    try { await addClient(client); closeClientModal(); toast('Client saved ✓'); } catch (e) { toast('Error: ' + e.message, 'error'); }
  }
}

async function deleteClientModal() {
  const m = $('client-modal');
  const type = m.dataset.masterType;
  const idValue = m.dataset.entryId;

  if (!idValue) { toast('Cannot delete unsaved record', 'error'); return; }
  if (!confirm('Are you sure you want to delete this master record?')) return;

  try {
    let success = false;
    if (type === 'products') success = await deleteProduct({ ProductID: idValue });
    else if (type === 'clients') success = await deleteClient({ ClientID: idValue });

    if (success) { toast('Record deleted'); bootApp(); closeClientModal(); }
  } catch (e) { toast(e.message, 'error'); }
}

// ─── CSS INJECTIONS ──────────────────────────────────────────────────────────
(function () {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .sb-master-row {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-light);
      cursor: pointer;
      transition: background 0.2s;
    }
    .sb-master-row:hover {
      background: var(--bg-hover);
    }
    .sb-master-row:last-child {
      border-bottom: none;
    }
  `;
  document.head.appendChild(style);
})();

// ─── CSS SPIN ANIMATION ───────────────────────────────────────────────────────
(function () {
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
})();
