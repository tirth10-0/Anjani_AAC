/* ─── utils.js ────────────────────────────────────────── */
function fmtCurrency(val, symbol = '₹') {
  const n = parseFloat(val) || 0;
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateInput(str) {
  if (!str) return '';
  return str.split('T')[0];
}
function getTodayDateString(timeZone = 'Asia/Kolkata') {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : '';
  } catch (err) {
    return new Date().toISOString().split('T')[0];
  }
}
function todayStr() {
  return getTodayDateString();
}
function setDefaultDateValue(input, fallbackDate = getTodayDateString()) {
  if (!input) return fallbackDate;
  if (input.value) return input.value;
  input.value = fallbackDate;
  return input.value;
}
function applyDefaultDateInputs(root = document, options = {}) {
  const targetRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
  const skipFieldNames = new Set((options.skipFieldNames || []).map(name => String(name).toLowerCase()));
  const skipFieldIds = new Set((options.skipFieldIds || []).map(id => String(id).toLowerCase()));
  const today = getTodayDateString();
  targetRoot.querySelectorAll('input[type="date"]').forEach(input => {
    const name = String(input.name || '').toLowerCase();
    const id = String(input.id || '').toLowerCase();
    if (
      input.disabled || 
      input.readOnly || 
      input.dataset.noDefaultDate === 'true' || 
      skipFieldNames.has(name) || 
      skipFieldIds.has(id) ||
      id.includes('filter') ||
      name.includes('filter') ||
      id.includes('from') ||
      name.includes('from') ||
      id.includes('to') ||
      name.includes('to')
    ) return;
    if (!input.value) input.value = today;
  });
}
function fmtNumber(val, decimals = 2) {
  return (parseFloat(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPercent(val) {
  return (parseFloat(val) || 0).toFixed(1) + '%';
}
function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}
function isPhoneFieldName(name = '') { return /contact|phone|mobile/i.test(String(name || '')); }
function isGstinFieldName(name = '') { return /gst|gstin/i.test(String(name || '')); }
function capitalizeWord(word) {
  const lower = String(word || '').toLowerCase();
  const firstLetterIndex = lower.search(/[a-z]/i);
  if (firstLetterIndex === -1) return lower;
  return `${lower.slice(0, firstLetterIndex)}${lower.charAt(firstLetterIndex).toUpperCase()}${lower.slice(firstLetterIndex + 1)}`;
}
function formatTitleCaseWithPercentRules(value) {
  const parts = String(value || '').split(/(\s+)/);
  let uppercaseUntilPlus = false;
  return parts.map(part => {
    if (!part || /^\s+$/.test(part)) return part;
    if (part === '+') { uppercaseUntilPlus = false; return part; }
    const normalized = uppercaseUntilPlus ? part.toUpperCase() : capitalizeWord(part);
    if (/^\d+(?:\.\d+)?%$/.test(part)) uppercaseUntilPlus = true;
    return normalized;
  }).join('');
}
function normalizeTextValue(value, fieldName = '') {
  if (isPhoneFieldName(fieldName)) return formatPhone(value);
  if (isGstinFieldName(fieldName)) return String(value || '').toUpperCase();
  return formatTitleCaseWithPercentRules(value);
}
function shouldNormalizeFormField(field) {
  if (!field) return false;
  const tagName = (field.tagName || '').toUpperCase();
  if (tagName === 'TEXTAREA') return true;
  if (tagName !== 'INPUT') return false;
  const type = String(field.type || '').toLowerCase();
  return !['number', 'date', 'email', 'search', 'checkbox', 'radio', 'hidden', 'file', 'password'].includes(type);
}
const STATUS_CLASSES = {
  // Completed / Delivered / Paid
  'Delivered': 'badge-completed',
  'Completed': 'badge-completed',
  'Paid': 'badge-completed',
  'Fully Dispatched': 'badge-completed',
  'Active': 'badge-approved',
  'In Stock': 'badge-approved',

  // Approved / Verified
  'Approved': 'badge-approved',
  'Verified': 'badge-approved',

  // Pending / In Review
  'Pending': 'badge-pending',
  'Pending Approval': 'badge-pending',
  'Pending Verification': 'badge-pending',
  'Processing': 'badge-partial',
  'Awaiting': 'badge-pending',

  // Quarantine / Holds
  'Quarantine': 'badge-quarantine',
  'Quarantined': 'badge-quarantine',
  'On Hold': 'badge-onhold',
  'Under Inspection': 'badge-quarantine',

  // Logistics & In-Transit
  'In-Transit': 'badge-intransit',
  'In Transit': 'badge-intransit',
  'Dispatched': 'badge-intransit',
  'Shipped': 'badge-intransit',

  // Partial Fulfillments
  'Partially Dispatched': 'badge-partial',
  'Partially Received': 'badge-partial',
  'Partial': 'badge-partial',
  'Partial Receipt': 'badge-partial',

  // Negative / Problem Statuses
  'Rejected': 'badge-rejected',
  'Overdue': 'badge-danger',
  'Cancelled': 'badge-rejected',
  'Void': 'badge-rejected',
  'Low Stock': 'badge-lowstock',

  // Neutral / Draft / Inactive
  'Out of Stock': 'badge-gray',
  'Draft': 'badge-draft',
  'Inactive': 'badge-inactive',
  'Closed': 'badge-gray',

  // Traceable Reversals
  'Reversed': 'badge-reversed'
};

function statusBadge(status, showDot = true) {
  if (!status) return '—';
  const raw = String(status).trim();
  const cls = STATUS_CLASSES[raw] || 'badge-gray';
  const dotHtml = showDot ? '<span class="badge-dot"></span>' : '';
  return `<span class="badge ${cls}">${dotHtml}${raw}</span>`;
}

function debounce(fn, wait = 250) {
  let timeout = null;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(context, args), wait);
  };
}

function formatPackagingBreakdown({
  boxes = 0,
  unitsPerBox = 1,
  looseUnits = 0,
  totalUnits = 0,
  unit = 'Bottles',
  volumeOrWeight = null,
  compact = false
} = {}) {
  const b = parseInt(boxes, 10) || 0;
  const upb = parseInt(unitsPerBox, 10) || 1;
  const l = parseInt(looseUnits, 10) || 0;
  const tot = parseInt(totalUnits, 10) || ((b * upb) + l);

  if (compact) {
    let text = `${tot} ${unit}`;
    if (b > 0 && l > 0) text = `${b} Bx + ${l} ls (${tot} ${unit})`;
    else if (b > 0) text = `${b} Bx (${tot} ${unit})`;
    return `<span class="pkg-breakdown-tag pkg-compact">${text}</span>`;
  }

  let html = '<div class="pkg-breakdown-tag">';
  if (b > 0) {
    html += `<span class="pkg-pill box" title="Cartons / Boxes">📦 ${b} Bx ${upb > 1 ? `(${upb}/bx)` : ''}</span>`;
  }
  if (l > 0 || b === 0) {
    html += `<span class="pkg-pill loose" title="Loose Units">+ ${l} Loose</span>`;
  }
  html += `<span class="pkg-pill total" title="Total Equivalent Units">= ${tot} ${unit}</span>`;
  if (volumeOrWeight) {
    html += `<span class="pkg-pill vol" title="Net Volume or Mass">(${volumeOrWeight})</span>`;
  }
  html += '</div>';
  return html;
}
function applyMobileTableLabels(tableOrId) {
  const table = typeof tableOrId === 'string' ? document.getElementById(tableOrId) : tableOrId;
  if (!table) return;
  const wrap = table.closest('.table-wrap');
  if (wrap) wrap.classList.add('data-table-wrap-mobile');
  const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
  table.querySelectorAll('tbody tr').forEach(tr => {
    if (tr.classList.contains('empty-row')) return;
    Array.from(tr.querySelectorAll('td')).forEach((td, i) => {
      if (td.hasAttribute('colspan') || td.querySelector('.empty-state')) return;
      const label = headers[i] || '';
      td.setAttribute('data-label', label);
      if (isPhoneFieldName(label)) {
        const rawText = td.textContent.trim();
        if (rawText && rawText !== '—' && rawText !== 'â€"') td.textContent = formatPhone(rawText);
      }
      if (label && !td.querySelector('.mobile-label') && label !== 'Actions' && label !== 'Select') {
        const lbl = document.createElement('div');
        lbl.className = 'mobile-label'; lbl.textContent = label; td.prepend(lbl);
      }
    });
  });
}

function renderTableSkeleton(tableOrId, rows = 6, force = false) {
  const table = typeof tableOrId === 'string' ? document.getElementById(tableOrId) : tableOrId;
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const headCount = table.querySelectorAll('thead th').length || 1;
  if (!tbody) return;
  if (!force && tbody.children.length > 0 && !tbody.querySelector('.skeleton-table-row')) return;
  tbody.innerHTML = Array.from({ length: rows }).map(() => `<tr class="skeleton-table-row">${Array.from({ length: headCount }).map(() => `<td><div class="skeleton-line ${Math.random() > 0.5 ? 'w-80' : 'w-60'}"></div></td>`).join('')}</tr>`).join('');
}
function setSkeletonText(elOrId, widthClass = 'w-60', large = false, force = false) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  if (!force && el.textContent.trim() !== '' && !el.querySelector('.skeleton-line')) return;
  el.innerHTML = `<div class="skeleton-line ${large ? 'lg ' : ''}${widthClass}"></div>`;
}
function renderListSkeleton(containerOrId, count = 5) {
  const container = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
  if (!container) return;
  container.innerHTML = Array.from({ length: count }).map(() => `<div class="skeleton-list-item"><div class="skeleton-dot"></div><div class="skeleton-stack" style="flex:1"><div class="skeleton-line w-50"></div><div class="skeleton-line sm w-80"></div></div><div class="skeleton-badge"></div></div>`).join('');
}
function getFormData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};
  const data = {};
  new FormData(form).forEach((val, key) => {
    let field = form.elements[key];
    if (field && field.length && !field.type) field = field[0];
    let finalVal = shouldNormalizeFormField(field) ? normalizeTextValue(val, key) : val;
    
    if (finalVal === '') {
      finalVal = null; // Convert empty strings to null to satisfy Postgres strict types
    } else if (field && field.type === 'number') {
      finalVal = parseFloat(finalVal);
    }
    
    data[key] = finalVal;
  });
  return data;
}
function populateForm(formId, data) {
  const form = document.getElementById(formId);
  if (!form) return;
  Object.entries(data).forEach(([k, v]) => {
    const el = form.elements[k];
    if (el) {
      el.value = shouldNormalizeFormField(el) ? normalizeTextValue(v ?? '', k) : (v ?? '');
      if (el.tagName && el.tagName.toUpperCase() === 'SELECT') {
        el.dispatchEvent(new Event('change'));
      }
    }
  });
}
function destroyChart(chartRef) { if (chartRef && typeof chartRef.destroy === 'function') chartRef.destroy(); }
function initAllAutocompleteSelects() { if (window.UniversalSearchSelect) UniversalSearchSelect.initAll(); }

function normalizeUnit(unitStr) {
  if (typeof window !== 'undefined' && window.INVENTORY_CORE && window.INVENTORY_CORE.normalizeUnit) {
    return window.INVENTORY_CORE.normalizeUnit(unitStr);
  }
  if (!unitStr) return 'Nos';
  const u = String(unitStr).trim().toLowerCase();
  if (['kg', 'kilogram', 'kilograms', 'kilo'].includes(u)) return 'Kg';
  if (['gram', 'grams', 'g', 'gm'].includes(u)) return 'Gram';
  if (['litre', 'litres', 'ltr', 'ltr.', 'l'].includes(u)) return 'Litre';
  if (['ml', 'milliliter', 'milliliters'].includes(u)) return 'Ml';
  if (['nos', 'pcs', 'box', 'bag', 'drum', 'piece', 'pieces', 'no'].includes(u)) return 'Nos';
  return 'Nos';
}

function formatCategoryLabel(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (!s) return '';
  const words = s.replace(/[-_]/g, ' ').split(/\s+/);
  return words.map(w => {
    const lower = w.toLowerCase();
    if (['pgr', 'ec', 'sc', 'wp', 'sl', 'gr', 'sg', 'fs', 'wg'].includes(lower)) {
      return lower.toUpperCase();
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

function convertUnit(qty, fromUnit, toUnit, density = 1.0) {
  if (typeof window !== 'undefined' && window.INVENTORY_CORE && window.INVENTORY_CORE.convertUnit) {
    try {
      return window.INVENTORY_CORE.convertUnit(qty, fromUnit, toUnit, density);
    } catch (_) {}
  }
  const q = parseFloat(qty) || 0;
  if (!fromUnit || !toUnit) return q;
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);
  if (f === t) return q;
  
  if ((f === 'Litre' || f === 'Kg') && (t === 'Ml' || t === 'Gram')) return q * 1000;
  if ((f === 'Ml' || f === 'Gram') && (t === 'Litre' || t === 'Kg')) return q / 1000;
  if ((f === 'Litre' && t === 'Kg') || (f === 'Kg' && t === 'Litre')) return q;
  
  return q;
}

function exportToCSV(data, label) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Headers row
  csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));
  
  // Data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const val = row[header];
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });
  
  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${label.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToExcel(data, label) {
  if (!data || !data.length) return;
  if (window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31)); // sheet names limited to 31 chars
    XLSX.writeFile(wb, `${label.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  } else {
    // Fallback to CSV if SheetJS isn't available
    exportToCSV(data, label);
  }
}

function parsePackSizeInMl(str) {
  if (!str) return 0;
  const s = String(str).toLowerCase().trim();
  const match = s.match(/([\d.]+)\s*([a-zA-Z.]+)?/);
  if (!match) return 0;
  const val = parseFloat(match[1]) || 0;
  const unit = normalizeUnit(match[2] || '');
  if (unit === 'Litre' || unit === 'Kg') {
    return val * 1000;
  }
  return val;
}

function sortPackSizesDescending(items, sizeGetter = (x => x.packaging_size || x.size || x)) {
  return [...items].sort((a, b) => {
    const sizeA = parsePackSizeInMl(sizeGetter(a));
    const sizeB = parsePackSizeInMl(sizeGetter(b));
    return sizeB - sizeA;
  });
}

function extractNumericPart(val) {
  if (val === null || val === undefined) return -1;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  // Find last contiguous digits in string, e.g. "O-10" -> 10, "DTXN-1001" -> 1001, "EXP-05" -> 5
  const match = str.match(/(\d+)(?!.*\d)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? -1 : num;
  }
  return -1;
}

function parseTimestamp(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number' && val > 100000) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const t = Date.parse(trimmed);
    return isNaN(t) ? null : t;
  }
  return null;
}

function sortLatestFirst(items, getter = null) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? [...items] : [];
  }

  // Preserve initial relative arrival index to reliably reverse natural addition order (A, B, C -> C, B, A)
  // even if items lack IDs, timestamps, or sequence codes.
  const indexed = items.map((item, originalIndex) => ({ item, originalIndex }));

  indexed.sort((aObj, bObj) => {
    const a = aObj.item;
    const b = bObj.item;
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    // 1. If explicit getter provided, evaluate it first
    if (typeof getter === 'function') {
      const valA = getter(a);
      const valB = getter(b);
      const numA = extractNumericPart(valA);
      const numB = extractNumericPart(valB);
      if (numA !== -1 && numB !== -1 && numA !== numB) {
        return numB - numA;
      }
      const tA = parseTimestamp(valA);
      const tB = parseTimestamp(valB);
      if (tA !== null && tB !== null && tA !== tB) {
        return tB - tA;
      }
      if (valA && valB && typeof valA === 'string' && typeof valB === 'string' && valA !== valB) {
        const cmp = valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp;
      }
    }

    // 2. Direct sequence / reference code comparison (order_no, purchase_no, txn_no, batch_no, ref_no, invoice_no)
    const refA = a.order_no || a.purchase_no || a.txn_no || a.batch_no || a.ref_no || a.invoice_no;
    const refB = b.order_no || b.purchase_no || b.txn_no || b.batch_no || b.ref_no || b.invoice_no;
    if (refA || refB) {
      const numRefA = extractNumericPart(refA);
      const numRefB = extractNumericPart(refB);
      if (numRefA !== -1 && numRefB !== -1 && numRefA !== numRefB) {
        return numRefB - numRefA;
      }
    }

    // 3. Numeric ID comparison (id, _id, item_id) -> 10 -> 9 -> 8
    const idA = extractNumericPart(a.id ?? a._id ?? a.item_id);
    const idB = extractNumericPart(b.id ?? b._id ?? b.item_id);
    if (idA !== -1 && idB !== -1 && idA !== idB) {
      return idB - idA;
    }

    // 4. Exact created_at / timestamp comparison
    const timeA = parseTimestamp(a.created_at || a.createdAt || a.timestamp);
    const timeB = parseTimestamp(b.created_at || b.createdAt || b.timestamp);
    if (timeA !== null && timeB !== null && timeA !== timeB) {
      return timeB - timeA;
    }

    // 5. Business date comparison (date, purchase_date, order_date, txn_date)
    const dateA = parseTimestamp(a.date || a.purchase_date || a.order_date || a.txn_date);
    const dateB = parseTimestamp(b.date || b.purchase_date || b.order_date || b.txn_date);
    if (dateA !== null && dateB !== null && dateA !== dateB) {
      return dateB - dateA;
    }

    // 6. Natural addition sequence fallback:
    // If records A, B, C were added in that order, originalIndex is 0, 1, 2.
    // Higher originalIndex means added later -> C (2) -> B (1) -> A (0).
    return bObj.originalIndex - aObj.originalIndex;
  });

  return indexed.map(obj => obj.item);
}

function sortByNumericIdDesc(items, getter = null) {
  return sortLatestFirst(items, getter);
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

function cleanItemName(name) {
  if (!name) return '';
  let str = String(name).trim();
  // 1. Remove duplicate/repeated "Box Box", "Boxes Box", "Box Boxes", "Boxes Boxes"
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => {
    return /boxes/i.test(match) ? 'Boxes' : 'Box';
  });
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => {
    return /boxes/i.test(match) ? 'Boxes' : 'Box';
  });
  // 2. Remove duplicate/repeated "Bottle Bottle", "Bottles Bottle"
  str = str.replace(/\b(bottles|bottle)(?:\s+|-)+(?:bottles|bottle)\b/gi, (match) => {
    return /bottles/i.test(match) ? 'Bottles' : 'Bottle';
  });
  str = str.replace(/\b(bottles|bottle)(?:\s+|-)+(?:bottles|bottle)\b/gi, (match) => {
    return /bottles/i.test(match) ? 'Bottles' : 'Bottle';
  });
  return str.replace(/\s{2,}/g, ' ').trim();
}

function cleanUnitLabel(text) {
  if (!text) return '';
  let str = String(text).trim();
  // Deduplicate repeated units e.g. "10 Box Box" -> "10 Box", "Box Box" -> "Box"
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => {
    return /boxes/i.test(match) ? 'Boxes' : 'Box';
  });
  str = str.replace(/\b(boxes|box)(?:\s+|-)+(?:boxes|box)\b/gi, (match) => {
    return /boxes/i.test(match) ? 'Boxes' : 'Box';
  });
  str = str.replace(/\b(bottles|bottle)(?:\s+|-)+(?:bottles|bottle)\b/gi, (match) => {
    return /bottles/i.test(match) ? 'Bottles' : 'Bottle';
  });
  str = str.replace(/\b(nos|no)(?:\s+|-)+(?:nos|no)\b/gi, 'Nos');
  str = str.replace(/\b(kg|kgs|kilogram|kilograms)(?:\s+|-)+(?:kg|kgs|kilogram|kilograms)\b/gi, 'Kg');
  str = str.replace(/\b(litre|litres|ltr|ltrs)(?:\s+|-)+(?:litre|litres|ltr|ltrs)\b/gi, 'Litre');
  str = str.replace(/\b(ml|milliliters|milliliter)(?:\s+|-)+(?:ml|milliliters|milliliter)\b/gi, 'Ml');
  return str.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Standardized Concise Packaging Display Name Formatter:
 * Formats Bottles and Boxes to "Type Size" (e.g. "Imida 1 LTR", "Regular 500 ML").
 * Removes redundant "Bottle" / "Box" wording and strips "(... avail)" stock tags.
 * Preserves all underlying inventory IDs, SKUs, and data integrity.
 */
function formatPackagingDisplayName(itemOrName, category = '') {
  if (!itemOrName) return '';

  let name = '';
  let subtype = '';
  let itemSize = '';
  let cat = category || '';

  if (typeof itemOrName === 'object' && itemOrName !== null) {
    name = itemOrName.name || '';
    subtype = itemOrName.item_subtype || '';
    itemSize = itemOrName.item_size || '';
    cat = cat || itemOrName.category || '';
  } else {
    name = String(itemOrName);
  }

  const isBottle = /bottle/i.test(cat) || /bottle/i.test(name);
  const isBox = /box/i.test(cat) || /box/i.test(name);

  // 1. Extract and standardize packaging size (e.g., 100 ML, 250 ML, 500 ML, 1 LTR, 50 ML)
  let sizeStr = '';
  const rawSize = itemSize || name;
  const sizeMatch = rawSize.match(/(\d+(?:\.\d+)?)\s*(litre|litres|ltr|ltrs|l|ml|kg|kgs|gm|g|nos|pcs)\b/i);

  if (sizeMatch) {
    const num = sizeMatch[1];
    let unit = sizeMatch[2].toUpperCase();
    if (['LITRE', 'LITRES', 'LTR', 'LTRS', 'L'].includes(unit)) {
      unit = 'LTR';
    } else if (['ML', 'MILLILITER', 'MILLILITERS'].includes(unit)) {
      unit = 'ML';
    } else if (['KG', 'KGS', 'KILOGRAM'].includes(unit)) {
      unit = 'KG';
    } else if (['GM', 'G', 'GRAM', 'GRAMS'].includes(unit)) {
      unit = 'GM';
    }
    sizeStr = `${num} ${unit}`;
  }

  // 2. Extract base packaging type
  let type = subtype ? String(subtype).trim() : '';

  if (!type || type.toLowerCase() === 'bottles' || type.toLowerCase() === 'boxes') {
    type = name;
  }

  // Remove size from type if present
  if (sizeMatch) {
    type = type.replace(new RegExp(`\\b${sizeMatch[1]}\\s*(?:litre|litres|ltr|ltrs|l|ml|kg|kgs|gm|g|nos|pcs)\\b`, 'gi'), '');
  }

  // Clean redundant packaging words
  if (isBottle) {
    type = type.replace(/\b(bottle|bottles)\b/gi, '');
  }
  if (isBox) {
    type = type.replace(/\b(box|boxes)\b/gi, '');
  }

  // Remove stock tags if present in name like "(850 avail)"
  type = type.replace(/\([^)]*avail[^)]*\)/gi, '');
  type = type.replace(/[()]/g, '');

  // Collapse whitespaces
  type = type.replace(/\s+/g, ' ').trim();

  // If type became empty, fallback to clean name
  if (!type) {
    type = isBottle ? 'Bottle' : (isBox ? 'Box' : 'Packaging');
  }

  return sizeStr ? `${type} ${sizeStr}` : type;
}

/**
 * Formats bottle and box inventory items cleanly for display.
 * Separates item identity (type/brand) from packaging capacity (size),
 * placing the size into the Unit column.
 * e.g., "Imida Bottle 1 Ltr" -> displayName: "Imida", category: "Imida", unit: "1 Litre"
 * e.g., "Regular Box 500 Ml" -> displayName: "Regular", category: "Regular", unit: "500 ML"
 * Preserves underlying database records, stock quantities, and units.
 */
function formatPackagingItemDisplay(itemOrName, category = '') {
  if (!itemOrName) return { displayName: '', category: '', unit: 'Nos', isBottle: false, isBox: false };

  let rawName = '';
  let subtype = '';
  let itemSize = '';
  let cat = category || '';
  let rawUnit = 'Nos';

  if (typeof itemOrName === 'object' && itemOrName !== null) {
    rawName = itemOrName.rawName || itemOrName.name || '';
    subtype = itemOrName.item_subtype || '';
    itemSize = itemOrName.item_size || '';
    cat = cat || itemOrName.category || '';
    rawUnit = itemOrName.unit || 'Nos';
  } else {
    rawName = String(itemOrName);
  }

  const isBottle = /bottle/i.test(cat) || /bottle/i.test(rawName);
  const isBox = /box/i.test(cat) || /box/i.test(rawName);

  // 1. Extract packaging size (e.g., 100 ML, 250 ML, 500 ML, 1 LTR, 1 Litre)
  let sizeStr = '';
  const rawSize = itemSize || rawName;
  const sizeMatch = rawSize.match(/(\d+(?:\.\d+)?)\s*(litre|litres|ltr|ltrs|l|ml|milliliter|milliliters|kg|kgs|kilogram|gm|g|gram|nos|pcs)\b/i);

  if (sizeMatch) {
    const num = sizeMatch[1];
    let u = sizeMatch[2];
    if (/^(litre|litres|ltr|ltrs|l)$/i.test(u)) sizeStr = `${num} Litre`;
    else if (/^(ml|milliliter|milliliters)$/i.test(u)) sizeStr = `${num} ML`;
    else if (/^(kg|kgs|kilogram)$/i.test(u)) sizeStr = `${num} KG`;
    else if (/^(gm|g|gram)$/i.test(u)) sizeStr = `${num} GM`;
    else sizeStr = `${num} ${u}`;
  } else if (itemSize) {
    sizeStr = itemSize;
  }

  // Standardize size string formatting
  if (sizeStr) {
    sizeStr = sizeStr.replace(/\bml\b/gi, 'ML')
                     .replace(/\bmilliliters?\b/gi, 'ML')
                     .replace(/\blitres?\b/gi, 'Litre')
                     .replace(/\bltrs?\b/gi, 'Litre')
                     .replace(/\bkgs?\b/gi, 'KG')
                     .replace(/\bgms?\b/gi, 'GM');
  }

  // 2. Extract base type/brand without size
  let cleanName = subtype ? String(subtype).trim() : '';

  if (!cleanName || cleanName.toLowerCase() === 'bottles' || cleanName.toLowerCase() === 'boxes') {
    cleanName = rawName;
  }

  // Remove size portion from cleanName
  if (sizeMatch) {
    cleanName = cleanName.replace(new RegExp('\\s*' + sizeMatch[1] + '\\s*(?:litre|litres|ltr|ltrs|l|ml|milliliter|milliliters|kg|kgs|kilogram|gm|g|gram|nos|pcs)\\b', 'gi'), '');
  } else if (itemSize) {
    cleanName = cleanName.replace(new RegExp('\\s*' + itemSize.trim() + '\\b', 'gi'), '');
  }

  // Remove redundant words "Bottle", "Bottles", "Box", "Boxes"
  cleanName = cleanName.replace(/\b(bottle|bottles)\b/gi, '');
  cleanName = cleanName.replace(/\b(box|boxes)\b/gi, '');

  // Remove stock tags like "(850 avail)"
  cleanName = cleanName.replace(/\([^)]*avail[^)]*\)/gi, '');
  cleanName = cleanName.replace(/[()]/g, '');

  // Standardize common brand typos
  cleanName = cleanName.replace(/\bSygenta\b/gi, 'Syngenta');

  // Collapse whitespaces
  cleanName = cleanName.replace(/\s+/g, ' ').trim();

  if (!cleanName) {
    cleanName = subtype || (isBottle ? 'Bottle' : (isBox ? 'Box' : 'Packaging'));
  }

  // Category
  let categoryDisplay = subtype ? String(subtype).trim() : (isBottle ? 'Bottles' : (isBox ? 'Boxes' : 'Packaging'));
  categoryDisplay = categoryDisplay.replace(/\bSygenta\b/gi, 'Syngenta');

  // Display Unit: packaging size if known, else rawUnit or 'Nos'
  const displayUnit = sizeStr || rawUnit || 'Nos';

  return {
    rawName,
    displayName: cleanName,
    category: categoryDisplay,
    unit: displayUnit,
    isBottle,
    isBox
  };
}

/**
 * Formats label inventory items cleanly for display.
 * Strips redundant brand code and the word 'Label' from the title, standardizes formulation acronyms (e.g. EC),
 * and moves packaging size into the Unit column.
 * Preserves underlying database records and integrity.
 */
function formatLabelItemDisplay(itemOrName) {
  if (!itemOrName) return { displayName: '', productName: '', brand: 'AAC', packaging: '—', unit: '—' };

  let rawName = '';
  let rawSize = '';
  let subtype = '';
  let rawUnit = 'Nos';

  if (typeof itemOrName === 'object' && itemOrName !== null) {
    rawName = String(itemOrName.rawName || itemOrName.name || '').trim();
    rawSize = String(itemOrName.item_size || '').trim();
    subtype = String(itemOrName.item_subtype || '').trim();
    rawUnit = itemOrName.unit || 'Nos';
  } else {
    rawName = String(itemOrName).trim();
  }

  // 1. Extract packaging size
  let packaging = rawSize;
  const sizeMatch = rawName.match(/(\d+(?:\.\d+)?)\s*(litre|litres|ltr|ltrs|l|ml|milliliter|milliliters|kg|kgs|kilogram|gm|g|gram|nos|pcs)\b/i);
  if (!packaging && sizeMatch) {
    const num = sizeMatch[1];
    let unit = sizeMatch[2];
    if (/^(litre|litres|ltr|ltrs|l)$/i.test(unit)) packaging = `${num} Litre`;
    else if (/^(ml|milliliter|milliliters)$/i.test(unit)) packaging = `${num} ML`;
    else if (/^(kg|kgs|kilogram)$/i.test(unit)) packaging = `${num} KG`;
    else if (/^(gm|g|gram)$/i.test(unit)) packaging = `${num} GM`;
    else packaging = `${num} ${unit}`;
  }
  // Standardize packaging capitalization: e.g. '500 Ml' -> '500 ML', '1 litre' -> '1 Litre'
  if (packaging) {
    packaging = packaging.replace(/\bml\b/gi, 'ML')
                         .replace(/\bmilliliters?\b/gi, 'ML')
                         .replace(/\blitres?\b/gi, 'Litre')
                         .replace(/\bltrs?\b/gi, 'Litre')
                         .replace(/\bkgs?\b/gi, 'KG')
                         .replace(/\bgms?\b/gi, 'GM');
  }

  // 2. Extract brand / company code
  let brand = subtype;
  const brandMatch = rawName.match(/\[([A-Za-z0-9_-]+)\]/);
  if (!brand && brandMatch) {
    brand = brandMatch[1].toUpperCase();
  }
  if (!brand) brand = 'AAC';
  if (brand === 'ACC' || brand === 'E') brand = 'AAC';

  // 3. Clean Product Name:
  // Remove brand brackets e.g. [AAC]
  let cleanName = rawName.replace(/\[[A-Za-z0-9_-]+\]/g, '');

  // Remove the word 'Label' (case-insensitive)
  cleanName = cleanName.replace(/\blabels?\b/gi, '');

  // Remove the packaging size portion (e.g. '1 Litre', '500 Ml') from cleanName
  if (sizeMatch) {
    cleanName = cleanName.replace(new RegExp('\\s*' + sizeMatch[1] + '\\s*(?:litre|litres|ltr|ltrs|l|ml|milliliter|milliliters|kg|kgs|kilogram|gm|g|gram|nos|pcs)\\b', 'gi'), '');
  } else if (rawSize) {
    cleanName = cleanName.replace(new RegExp('\\s*' + rawSize.trim() + '\\b', 'gi'), '');
  }

  // Standardize EC / SC / WP / SL formulations (e.g. -20 Ec -> -20 EC)
  cleanName = cleanName.replace(/(-?\d+)\s*ec\b/gi, (m, g1) => `${g1} EC`)
                       .replace(/(-?\d+)\s*sc\b/gi, (m, g1) => `${g1} SC`)
                       .replace(/(-?\d+)\s*sl\b/gi, (m, g1) => `${g1} SL`)
                       .replace(/(-?\d+)\s*wp\b/gi, (m, g1) => `${g1} WP`)
                       .replace(/(-?\d+)\s*sp\b/gi, (m, g1) => `${g1} SP`);

  // Clean up any extra trailing/leading hyphens, dashes, and collapse whitespace
  cleanName = cleanName.replace(/[\s\-_—]+$/, '').replace(/^[\s\-_—]+/, '').replace(/\s+/g, ' ').trim();

  // Unit column display: packaging size if known, else rawUnit or 'Nos'
  const displayUnit = packaging || rawUnit || 'Nos';

  return {
    rawName,
    productName: cleanName,
    displayName: cleanName,
    packaging: packaging || '—',
    unit: displayUnit,
    brand
  };
}

function normalizePackSize(val) {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/litres?|ltrs?|lt\b/g, 'l')
    .replace(/millilitres?|milliliters?|mls?/g, 'ml')
    .replace(/grams?|gms?/g, 'g')
    .replace(/kilograms?|kgs?/g, 'kg');
}

function matchOrderItemWithMeta(item, itemsMeta, itemIndex) {
  if (!item || !Array.isArray(itemsMeta) || itemsMeta.length === 0) return null;

  // 1. Exact ID match (database id or order_item_id)
  if (item.id !== undefined && item.id !== null) {
    const idMatch = itemsMeta.find(m => (m.id !== undefined && String(m.id) === String(item.id)) || (m.order_item_id !== undefined && String(m.order_item_id) === String(item.id)));
    if (idMatch) return idMatch;
  }

  const itPack = normalizePackSize(item.packing_size || item.packaging_size);
  const itProdId = item.product_id ? String(item.product_id) : '';
  const itProdName = item.product_name ? String(item.product_name).toLowerCase().trim() : '';

  // 2. Match by Product ID AND Pack Size
  if (itProdId && itPack) {
    const match = itemsMeta.find(m => String(m.product_id) === itProdId && normalizePackSize(m.packing_size || m.packaging_size) === itPack);
    if (match) return match;
  }

  // 3. Match by Product Name AND Pack Size
  if (itProdName && itPack) {
    const match = itemsMeta.find(m => m.product_name && String(m.product_name).toLowerCase().trim() === itProdName && normalizePackSize(m.packing_size || m.packaging_size) === itPack);
    if (match) return match;
  }

  // 4. Match by index if provided and valid
  if (typeof itemIndex === 'number' && itemsMeta[itemIndex]) {
    const candidate = itemsMeta[itemIndex];
    const candProdId = candidate.product_id ? String(candidate.product_id) : '';
    const candProdName = candidate.product_name ? String(candidate.product_name).toLowerCase().trim() : '';
    const candPack = normalizePackSize(candidate.packing_size || candidate.packaging_size);
    if (((itProdId && candProdId === itProdId) || (itProdName && candProdName === itProdName)) && (!itPack || !candPack || itPack === candPack)) {
      return candidate;
    }
  }

  // 5. If only 1 item in itemsMeta has this product ID, it's safe to match
  if (itProdId) {
    const matches = itemsMeta.filter(m => String(m.product_id) === itProdId);
    if (matches.length === 1) return matches[0];
  }

  return null;
}

/**
 * Canonical Invoice PDF Filename Formatter across ERP and Invoice Builder
 *
 * Rules:
 * - Regular invoices:  "Invoice_NN.pdf" (e.g. 1 -> Invoice_01.pdf, 104 -> Invoice_104.pdf)
 * - Dispatch invoices: "INV_NN.pdf"     (e.g. 1 -> INV_01.pdf, INV-02 -> INV_02.pdf, 104 -> INV_104.pdf)
 * - Numbers below 10 padded to at least 2 digits (e.g. "01", "02")
 * - Single .pdf extension
 * - Zero captions, timestamps, or customer names in filename
 */
function getStandardInvoicePdfFilename(invoiceNumber, isDispatch = false) {
  let raw = String(invoiceNumber || '').trim();
  raw = raw.replace(/\.pdf$/i, '').trim();

  // Strip commercial tax invoice / tax invoice / commercial invoice prefixes
  raw = raw.replace(/^(?:commercial[-_ ]*tax[-_ ]*invoice|commercial[-_ ]*invoice|tax[-_ ]*invoice)[-_ ]*/i, '').trim();

  // If isDispatch is not explicitly boolean false, check if prefix is inv
  let isDisp = isDispatch === true;
  if (isDispatch === null || isDispatch === undefined) {
    isDisp = /^inv[-_ ]/i.test(raw);
  }

  // Strip invoice / inv / dsp prefix
  let numPart = raw.replace(/^(?:invoice|inv|dsp)[-_ ]*/i, '').trim();
  if (!numPart) numPart = '01';

  // Format number part: numbers below 10 are padded to 2 digits; numbers >= 10 retain digits
  if (/^\d+$/.test(numPart)) {
    const val = parseInt(numPart, 10);
    if (!isNaN(val)) {
      numPart = val < 10 ? String(val).padStart(2, '0') : String(val);
    } else {
      numPart = numPart.length < 2 ? numPart.padStart(2, '0') : numPart;
    }
  } else {
    const m = numPart.match(/^(\d+)(.*)$/);
    if (m) {
      const val = parseInt(m[1], 10);
      const digits = (!isNaN(val) && val < 10) ? String(val).padStart(2, '0') : (isNaN(val) ? m[1] : String(val));
      const rest = m[2].replace(/[^a-zA-Z0-9_-]/g, '_');
      numPart = digits + rest;
    } else {
      numPart = numPart.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
  }

  const prefix = isDisp ? 'INV_' : 'Invoice_';
  return `${prefix}${numPart}.pdf`;
}

/**
 * Unified WhatsApp PDF Sharing Service for ERP and Invoice Builder
 */
async function shareInvoicePdfOnWhatsApp(docOrPayload, options = {}) {
  if (!docOrPayload) {
    const err = new Error('Invoice data is not available for WhatsApp sharing.');
    if (options.onToast) options.onToast(err.message, 'error');
    throw err;
  }

  const payload = docOrPayload;
  const invNum = payload.InvoiceNumber || payload.invoice_no || payload.inv_number || payload.order_no || '01';
  const isDispatch = (options.isDispatch !== undefined)
    ? options.isDispatch
    : !!(payload.dispatchNo || payload.dispatch_no || (typeof window !== 'undefined' && window.currentDispatchNo) || (payload.type === 'dispatch') || String(invNum || '').startsWith('INV-'));

  const filename = options.filename || getStandardInvoicePdfFilename(invNum, isDispatch);

  // 1. Synchronously render vector PDF in memory (pure CPU, ~15ms, preserves user activation)
  const jsPdfLib = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
    ? window.jspdf.jsPDF
    : (typeof jsPDF !== 'undefined' ? jsPDF : null);

  const drawFn = (typeof window !== 'undefined' && window.drawA4InvoicePdf)
    ? window.drawA4InvoicePdf
    : (typeof drawA4InvoicePdf === 'function' ? drawA4InvoicePdf : null);

  if (!jsPdfLib || !drawFn) {
    const err = new Error('PDF generator engine is not ready.');
    if (options.onToast) options.onToast(err.message, 'error');
    throw err;
  }

  const pdf = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawFn(pdf, payload);
  const pdfBlob = pdf.output('blob');

  if (!pdfBlob || pdfBlob.size === 0) {
    const err = new Error('Could not produce invoice PDF.');
    if (options.onToast) options.onToast(err.message, 'error');
    throw err;
  }

  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf', lastModified: Date.now() });

  // 2. Test native Web Share API Level 2 file sharing capability
  let canShareFile = false;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      canShareFile = navigator.canShare({ files: [pdfFile] });
    } catch (_) {
      canShareFile = false;
    }
  }

  // 3. Native File Sharing (Supported on mobile devices, Android, iOS, Windows Share)
  if (canShareFile) {
    try {
      // PDF-ONLY SHARING: Share strictly the actual PDF file without any caption, text, or title
      await navigator.share({
        files: [pdfFile]
      });

      const notify = options.onToast || (typeof window !== 'undefined' && (window.toast || (window.APP && window.APP.showToast)));
      if (typeof notify === 'function') {
        notify(`"${filename}" shared via WhatsApp.`, 'success');
      }
      return { success: true, method: 'native', filename };
    } catch (shareErr) {
      const isCancelled = !shareErr ||
        shareErr.name === 'AbortError' ||
        shareErr.name === 'NotAllowedError' ||
        String(shareErr).toLowerCase().includes('cancel') ||
        String(shareErr).toLowerCase().includes('abort') ||
        String(shareErr).toLowerCase().includes('dismiss');

      if (isCancelled) {
        console.log('Native share sheet dismissed by user.');
        return { success: false, cancelled: true };
      }
      console.warn('Native sharing encountered an issue, falling back to download:', shareErr);
    }
  }

  // 4. Honest Fallback for Unsupported Browsers / Insecure HTTP Contexts:
  const isMobile = ((typeof navigator !== 'undefined') && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) ||
                   ((typeof window !== 'undefined') && (
                     window.innerWidth <= 768 ||
                     (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
                   ));

  const isSecure = typeof window !== 'undefined' && window.isSecureContext;

  // On mobile devices: Do NOT trigger a browser download dialog when user clicked "Send on WhatsApp".
  // The user clicked "Send on WhatsApp", not "Download PDF". Inform the user clearly why native share
  // is unavailable (requires HTTPS) and direct them to open via HTTPS or use the explicit "Download PDF" button.
  if (isMobile) {
    let fallbackMsg = `Direct WhatsApp sharing is not supported in this browser. Please use the "Download PDF" button to download and attach it manually.`;
    if (!isSecure) {
      fallbackMsg = `Direct WhatsApp sharing requires a secure (HTTPS) connection. Please open the site via HTTPS, or use "Download PDF" to attach manually.`;
    }

    const notify = options.onToast || (typeof window !== 'undefined' && (window.toast || (window.APP && window.APP.showToast)));
    if (typeof notify === 'function') {
      notify(fallbackMsg, 'warning', 8000);
    }
    return { success: false, method: 'unsupported_insecure', filename };
  }

  // Desktop only: on unsupported desktop browsers, download PDF and open WhatsApp Web
  const saveBlobFn = (typeof window !== 'undefined' && window.savePdfBlob)
    ? window.savePdfBlob
    : (typeof savePdfBlob === 'function' ? savePdfBlob : null);

  if (saveBlobFn) {
    saveBlobFn(pdf, filename);
  } else {
    pdf.save(filename);
  }

  if (typeof window !== 'undefined') {
    window._lastDownloadedInvoicePdf = filename;
    if (typeof window._onPdfSaved === 'function') {
      try { window._onPdfSaved(filename); } catch (_) {}
    }
  }

  const waUrl = 'https://web.whatsapp.com';
  if (typeof window !== 'undefined') {
    window._lastOpenedWhatsAppUrl = waUrl;
    if (Array.isArray(window._openedUrls)) window._openedUrls.push(waUrl);
    if (Array.isArray(window._erpOpenedUrls)) window._erpOpenedUrls.push(waUrl);
  }
  try {
    window.open(waUrl, '_blank');
  } catch (_) {}

  const notify = options.onToast || (typeof window !== 'undefined' && (window.toast || (window.APP && window.APP.showToast)));
  if (typeof notify === 'function') {
    notify(`Downloaded "${filename}". Opening WhatsApp Web — attach the file manually.`, 'info', 7000);
  }

  return { success: true, method: 'download_fallback', filename };
}

const utilsObj = { fmtCurrency, fmtDate, fmtDateInput, todayStr, getTodayDateString, setDefaultDateValue, applyDefaultDateInputs, fmtNumber, fmtPercent, formatPhone, isPhoneFieldName, isGstinFieldName, normalizeTextValue, formatTitleCaseWithPercentRules, formatCategoryLabel, statusBadge, debounce, formatPackagingBreakdown, applyMobileTableLabels, renderTableSkeleton, setSkeletonText, renderListSkeleton, getFormData, populateForm, destroyChart, initAllAutocompleteSelects, normalizeUnit, convertUnit, parsePackSizeInMl, sortPackSizesDescending, extractNumericPart, sortByNumericIdDesc, sortLatestFirst, exportToCSV, exportToExcel, escapeHtml, cleanItemName, cleanUnitLabel, formatPackagingDisplayName, formatPackagingItemDisplay, formatLabelItemDisplay, normalizePackSize, matchOrderItemWithMeta, getStandardInvoicePdfFilename, shareInvoicePdfOnWhatsApp };

if (typeof window !== 'undefined') {
  window.UTILS = utilsObj;
  window.escapeHtml = escapeHtml;
  window.cleanItemName = cleanItemName;
  window.cleanUnitLabel = cleanUnitLabel;
  window.formatPackagingDisplayName = formatPackagingDisplayName;
  window.formatPackagingItemDisplay = formatPackagingItemDisplay;
  window.formatLabelItemDisplay = formatLabelItemDisplay;
  window.normalizePackSize = normalizePackSize;
  window.matchOrderItemWithMeta = matchOrderItemWithMeta;
  window.getStandardInvoicePdfFilename = getStandardInvoicePdfFilename;
  window.shareInvoicePdfOnWhatsApp = shareInvoicePdfOnWhatsApp;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = utilsObj;
}

 
