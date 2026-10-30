const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [search, replace] of replacements) {
    if (typeof search === 'string') {
      if (content.includes(search)) {
        content = content.split(search).join(replace);
        changed = true;
      }
    } else if (search instanceof RegExp) {
      if (search.test(content)) {
        content = content.replace(search, replace);
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
    return true;
  }
  return false;
}

console.log('=== Step 1: Manifests & Service Worker ===');
const manifestReplacements = [
  ['"name": "Afield Crop Care ERP"', '"name": "Estimate ERP"'],
  ['"short_name": "Afield ERP"', '"short_name": "Estimate"'],
  ['"description": "Manufacturing, Inventory, Formulation and Operations Management System for Afield Crop Care."', '"description": "Manufacturing, Inventory, Formulation and Operations Management System for Estimate."'],
  ['app=afield-crop-care-erp', 'app=estimate-erp']
];
replaceInFile('manifest.json', manifestReplacements);
replaceInFile('public/manifest.json', manifestReplacements);

const swReplacements = [
  ['// Afield Crop Care ERP', '// Estimate ERP'],
  ["const CACHE_NAME = 'afield-erp-v1.0.1';", "const CACHE_NAME = 'estimate-erp-v1.0.0';"],
  ['afield-erp-', 'estimate-erp-']
];
replaceInFile('sw.js', swReplacements);
replaceInFile('public/sw.js', swReplacements);

console.log('=== Step 2: Core JS Files ===');
replaceInFile('assets/js/tenant-context.js', [
  ["name: c.name === 'Afield Crop Care' ? 'Afield Crop Care' : c.name", "name: c.name === 'Estimate' ? 'Estimate' : (c.name === 'Afield Crop Care' ? 'Estimate' : c.name)"],
  ["// Default to the first authorized company (Afield Crop Care is ID 1)", "// Default to the first authorized company (Estimate is ID 1 / 623)"],
  ["if (matched && matched.name === 'Afield Crop Care') {\n          matched.name = 'Afield Crop Care';\n        }", "if (matched && (matched.name === 'Afield Crop Care' || matched.name === 'Estimate')) {\n          matched.name = 'Estimate';\n        }"],
  ["name: (typeof localStorage !== 'undefined' && (localStorage.getItem('erp_active_company_name') === 'Afield Crop Care' ? 'Afield Crop Care' : (localStorage.getItem('erp_active_company_name') || 'Afield Crop Care')))", "name: (typeof localStorage !== 'undefined' && (localStorage.getItem('erp_active_company_name') === 'Estimate' ? 'Estimate' : (localStorage.getItem('erp_active_company_name') || 'Estimate'))"],
  ["return this._activeCompany || { id: 1, name: 'Afield Crop Care', code: 'ACC' };", "return this._activeCompany || { id: 1, name: 'Estimate', code: 'ACC' };"],
  ["'Afield Crop Care'", "'Estimate'"]
]);

replaceInFile('assets/js/shared-layout.js', [
  ["if (act.name === 'Afield Crop Care') act.name = 'Afield Crop Care';", "if (act.name === 'Afield Crop Care' || act.name === 'Estimate') act.name = 'Estimate';"],
  ["if (stored === 'Afield Crop Care' || !stored) {\n    localStorage.setItem('erp_active_company_name', 'Afield Crop Care');\n    return 'Afield Crop Care';\n  }", "if (stored === 'Afield Crop Care' || stored === 'Estimate' || !stored) {\n    localStorage.setItem('erp_active_company_name', 'Estimate');\n    return 'Estimate';\n  }"],
  ['<div style="font-size:14px;font-weight:700;color:#0C3925">Afield Crop Care</div>', '<div style="font-size:14px;font-weight:700;color:#0C3925">Estimate</div>'],
  ["if (active && (active.name === 'Afield Crop Care' || !active.name)) {\n      active.name = 'Afield Crop Care';\n      if (localStorage.getItem('erp_active_company_name') === 'Afield Crop Care') {\n        localStorage.setItem('erp_active_company_name', 'Afield Crop Care');\n      }\n    }", "if (active && (active.name === 'Afield Crop Care' || active.name === 'Estimate' || !active.name)) {\n      active.name = 'Estimate';\n      localStorage.setItem('erp_active_company_name', 'Estimate');\n    }"],
  ["if (c.name === 'Afield Crop Care') c.name = 'Afield Crop Care';", "if (c.name === 'Afield Crop Care' || c.name === 'Estimate') c.name = 'Estimate';"],
  ["${c.name || 'Afield Crop Care'}", "${c.name || 'Estimate'}"],
  ["'Afield Crop Care'", "'Estimate'"]
]);

replaceInFile('assets/js/app.js', [
  ["if (localStorage.getItem('erp_active_company_name') === 'Afield Crop Care' || !localStorage.getItem('erp_active_company_name')) {\n      localStorage.setItem('erp_active_company_name', 'Afield Crop Care');\n    }", "if (localStorage.getItem('erp_active_company_name') === 'Afield Crop Care' || localStorage.getItem('erp_active_company_name') === 'Estimate' || !localStorage.getItem('erp_active_company_name')) {\n      localStorage.setItem('erp_active_company_name', 'Estimate');\n    }"],
  ["if (localStorage.getItem('active_company_name') === 'Afield Crop Care') {\n      localStorage.setItem('active_company_name', 'Afield Crop Care');\n    }", "if (localStorage.getItem('active_company_name') === 'Afield Crop Care' || localStorage.getItem('active_company_name') === 'Estimate') {\n      localStorage.setItem('active_company_name', 'Estimate');\n    }"]
]);

replaceInFile('assets/js/companies.js', [
  ['Security Rule: Afield Crop Care (ID 1) is the root legal entity and cannot be archived.', 'Security Rule: Estimate (ID 1) is the root legal entity and cannot be archived.'],
  ['Switched active workspace to Afield Crop Care.', 'Switched active workspace to Estimate.'],
  ['Security Rule: Afield Crop Care (ID 1) is the primary manufacturing company and root legal entity, and cannot be deleted.', 'Security Rule: Estimate (ID 1) is the primary manufacturing company and root legal entity, and cannot be deleted.']
]);

replaceInFile('assets/js/dispatch-ui.js', [
  ['<h2 style="font-size:21px; font-weight:800; color:#0C3925; margin:0; letter-spacing:-0.4px;">Afield Crop Care</h2>', '<h2 style="font-size:21px; font-weight:800; color:#0C3925; margin:0; letter-spacing:-0.4px;">Estimate</h2>'],
  ["pdf.text('Afield Crop Care', centerX, y + 6.5, { align: 'center' });", "pdf.text('Estimate', centerX, y + 6.5, { align: 'center' });"],
  ["company: 'Afield Crop Care',", "company: 'Estimate',"],
  ["brand: 'Afield Crop Care',", "brand: 'Estimate',"],
  ['alt="Afield Crop Care"', 'alt="Estimate"'],
  ['<div style="font-size:20px; font-weight:800; color:#0C3925 !important; letter-spacing:-0.4px;">Afield Crop Care</div>', '<div style="font-size:20px; font-weight:800; color:#0C3925 !important; letter-spacing:-0.4px;">Estimate</div>'],
  ['<div style="font-size:13.5px; font-weight:700; color:#0f172a;">Afield Crop Care</div>', '<div style="font-size:13.5px; font-weight:700; color:#0f172a;">Estimate</div>'],
  ["text: `upi://pay?pa=9427213943m@pnb&pn=${encodeURIComponent('Afield Crop Care')}`", "text: `upi://pay?pa=9427213943m@pnb&pn=${encodeURIComponent('Estimate')}`"]
]);

replaceInFile('assets/js/orders.js', [
  ["if (!companies.some(c => c.code === 'ACC' || c.code === 'AAC')) companies.unshift({ id: 1, name: 'Afield Crop Care', code: 'ACC', is_manufacturing: true });", "if (!companies.some(c => c.code === 'ACC' || c.code === 'AAC')) companies.unshift({ id: 1, name: 'Estimate', code: 'ACC', is_manufacturing: true });"]
]);

replaceInFile('assets/js/inventory.js', [
  ["if (!companies.some(c => c.code === 'ACC' || c.code === 'AAC')) companies.unshift({ id: 1, name: 'Afield Crop Care', code: 'ACC' });", "if (!companies.some(c => c.code === 'ACC' || c.code === 'AAC')) companies.unshift({ id: 1, name: 'Estimate', code: 'ACC' });"]
]);

console.log('=== Step 3: Invoice Builder files ===');
const invDirs = ['Invoice Builder', 'apps/Invoice Builder'];
for (const d of invDirs) {
  replaceInFile(path.join(d, 'index.html'), [
    ['<title>Afield ERP - Invoice Builder</title>', '<title>Estimate ERP - Invoice Builder</title>'],
    ['title="Afield Crop Care - Start Fresh Invoice"', 'title="Estimate - Start Fresh Invoice"'],
    ['alt="Afield Crop Care"', 'alt="Estimate"'],
    ['<span class="brand-name" style="font-weight:800;font-size:19px;letter-spacing:-0.3px;color:#08281A;">Afield Crop Care</span>', '<span class="brand-name" style="font-weight:800;font-size:19px;letter-spacing:-0.3px;color:#08281A;">Estimate</span>'],
    ['value="Afield Crop Care"', 'value="Estimate"'],
    ['<div class="paper-company-name" id="p-company" style="color:#08281A !important;">Afield Crop Care</div>', '<div class="paper-company-name" id="p-company" style="color:#08281A !important;">Estimate</div>'],
    ['<div class="to-main" id="p-from-name">Afield Crop Care</div>', '<div class="to-main" id="p-from-name">Estimate</div>']
  ]);

  replaceInFile(path.join(d, 'history.html'), [
    ['<title>Afield ERP - Invoice History</title>', '<title>Estimate ERP - Invoice History</title>'],
    ['content="Invoice History - Afield Crop Care ERP."', 'content="Invoice History - Estimate ERP."'],
    ['<span class="brand-name" style="font-weight:800;font-size:18px;letter-spacing:-0.3px;color:#08281A;">Afield Crop Care</span>', '<span class="brand-name" style="font-weight:800;font-size:18px;letter-spacing:-0.3px;color:#08281A;">Estimate</span>']
  ]);

  replaceInFile(path.join(d, 'master.html'), [
    ['<title>Afield ERP - Master Data Management</title>', '<title>Estimate ERP - Master Data Management</title>'],
    ['<span class="brand-name" style="font-weight:800;font-size:18px;letter-spacing:-0.3px;color:#08281A;">Afield Crop Care</span>', '<span class="brand-name" style="font-weight:800;font-size:18px;letter-spacing:-0.3px;color:#08281A;">Estimate</span>']
  ]);

  replaceInFile(path.join(d, 'js/invoice-pdf.js'), [
    ["companyName || 'Afield Crop Care'", "companyName || 'Estimate'"],
    ["document.getElementById('s-company')?.value || 'Afield Crop Care'", "document.getElementById('s-company')?.value || 'Estimate'"],
    ["payload.business?.company || $('s-company')?.value || $('p-company')?.textContent || 'Afield Crop Care'", "payload.business?.company || $('s-company')?.value || $('p-company')?.textContent || 'Estimate'"],
    ["const compName = companyName || 'Afield Crop Care';", "const compName = companyName || 'Estimate';"],
    ["(Afield Crop Care Primary Theme Green)", "(Estimate Primary Theme Green)"]
  ]);

  replaceInFile(path.join(d, 'js/main.js'), [
    ["if (!value || value === 'AgroChem' || value === 'Agro Chem') return 'Afield Crop Care';", "if (!value || value === 'AgroChem' || value === 'Agro Chem' || value === 'Afield Crop Care') return 'Estimate';"],
    ["const name = ($('s-company')?.value || '').trim() || 'Afield Crop Care';", "const name = ($('s-company')?.value || '').trim() || 'Estimate';"],
    ["const compName = $('s-company')?.value || 'Afield Crop Care';", "const compName = $('s-company')?.value || 'Estimate';"]
  ]);

  replaceInFile(path.join(d, 'js/storage.js'), [
    ["CompanyName: document.getElementById('s-company').value || 'Afield Crop Care',", "CompanyName: document.getElementById('s-company').value || 'Estimate',"],
    ["company: document.getElementById('s-company').value || 'Afield Crop Care',", "company: document.getElementById('s-company').value || 'Estimate',"]
  ]);

  replaceInFile(path.join(d, 'js/api.js'), [
    ["brand: 'Afield Crop Care',", "brand: 'Estimate',"],
    ["company: 'Afield Crop Care',", "company: 'Estimate',"]
  ]);

  replaceInFile(path.join(d, 'db.json'), [
    ['"CompanyName": "Afield Crop Care"', '"CompanyName": "Estimate"'],
    ['"Signatory": "Afield Crop Care"', '"Signatory": "Estimate"'],
    ['"company": "Afield Crop Care"', '"company": "Estimate"']
  ]);
}

console.log('=== Step 4: HTML Page Titles and Meta Tags ===');
const pages = fs.readdirSync('pages');
for (const p of pages) {
  if (p.endsWith('.html')) {
    const fullPath = path.join('pages', p);
    let content = fs.readFileSync(fullPath, 'utf8');
    let mod = false;

    // Titles
    if (content.includes('Afield Crop Care ERP - ')) {
      content = content.replace(/Afield Crop Care ERP - /g, 'Estimate ERP - ');
      mod = true;
    }
    if (content.includes('Afield Crop Care ERP — ')) {
      content = content.replace(/Afield Crop Care ERP — /g, 'Estimate ERP — ');
      mod = true;
    }
    if (content.includes('Afield ERP - ')) {
      content = content.replace(/Afield ERP - /g, 'Estimate ERP - ');
      mod = true;
    }
    if (content.includes('AgroChem ERP')) {
      content = content.replace(/Companies & Branches - AgroChem ERP/g, 'Estimate ERP - Companies & Branches');
      content = content.replace(/Warehouses & Locations - AgroChem ERP/g, 'Estimate ERP - Warehouses & Locations');
      mod = true;
    }

    // Meta apple mobile app title
    if (content.includes('content="Afield ERP"')) {
      content = content.replace(/content="Afield ERP"/g, 'content="Estimate ERP"');
      mod = true;
    }

    // Meta descriptions
    if (content.includes('Afield Crop Care ERP:')) {
      content = content.replace(/Afield Crop Care ERP:/g, 'Estimate ERP:');
      mod = true;
    }

    // Specific page contents
    if (p === 'inventory.html') {
      content = content.replace('ACC (Afield Crop Care - In-House)', 'ACC (Estimate - In-House)');
      mod = true;
    }
    if (p === 'orders.html') {
      content = content.replace('ACC (Afield Crop Care - In-House)', 'ACC (Estimate - In-House)');
      content = content.replace('Afield Crop Care Main Plant Warehouse (Factory Stock)', 'Estimate Main Plant Warehouse (Factory Stock)');
      mod = true;
    }
    if (p === 'companies.html') {
      content = content.replace('placeholder="e.g. Afield Crop Care or Company A"', 'placeholder="e.g. Estimate or Company A"');
      mod = true;
    }
    if (p === 'profile.html') {
      content = content.replace('>Afield Crop Care<', '>Estimate<');
      mod = true;
    }
    if (p === 'reports.html') {
      content = content.replace('Afield Crop Care and trading depot summaries', 'Estimate and trading depot summaries');
      mod = true;
    }

    if (mod) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Updated page: ${fullPath}`);
    }
  }
}

// Root index.html and login.html
replaceInFile('index.html', [
  ['<title>Afield Crop Care ERP - Loading</title>', '<title>Estimate ERP - Loading</title>'],
  ['content="Afield ERP"', 'content="Estimate ERP"'],
  ['alt="Afield Crop Care"', 'alt="Estimate"'],
  ['<span style="font-weight: 700; color: #0C3925;">Afield Crop Care</span>', '<span style="font-weight: 700; color: #0C3925;">Estimate</span>']
]);

replaceInFile('login.html', [
  ['<title>Afield Crop Care ERP - Admin Login</title>', '<title>Estimate ERP - Admin Login</title>'],
  ['content="Afield ERP"', 'content="Estimate ERP"'],
  ['<span style="color: #0C3925; font-weight: 700;">Afield Crop Care</span> ERP System', '<span style="color: #0C3925; font-weight: 700;">Estimate</span> ERP System']
]);

replaceInFile('404.html', [
  ['<title>Afield ERP - Redirecting</title>', '<title>Estimate ERP - Redirecting</title>']
]);

console.log('Rebrand completed.');
