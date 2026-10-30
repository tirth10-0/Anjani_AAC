// tests/test_erp_ui_restoration.js
// Verification suite for ERP UI Restoration across all pages

const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('🧪 RUNNING ERP UI RESTORATION & INTEGRITY AUDIT');
console.log('===============================================================');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

// 1. Verify CSS Syntax & Brace Balancing across all stylesheet files
console.log('\n[Check 1] Validating CSS syntax & brace balancing across all stylesheets...');
const cssDir = path.join(__dirname, '..', 'assets', 'css');
const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));

cssFiles.forEach(file => {
  const filePath = path.join(cssDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  let open = 0;
  let inComment = false;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (!inComment && !inString && c === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && c === '*' && next === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;

    if (!inString && (c === '"' || c === "'")) {
      inString = true;
      stringChar = c;
      continue;
    }
    if (inString && c === stringChar && content[i - 1] !== '\\') {
      inString = false;
      continue;
    }
    if (inString) continue;

    if (c === '{') open++;
    if (c === '}') {
      open--;
      if (open < 0) {
        break;
      }
    }
  }

  assert(open === 0, `${file} syntax has balanced braces (balance=${open})`);
});

// 2. Verify tables.css specifically for data-table rules
console.log('\n[Check 2] Verifying core table styling in tables.css...');
const tablesCss = fs.readFileSync(path.join(cssDir, 'tables.css'), 'utf8');

assert(tablesCss.includes('.data-table th'), 'tables.css contains .data-table th styling');
assert(tablesCss.includes('.data-table td'), 'tables.css contains .data-table td styling');
assert(tablesCss.includes('background-color: #f1f5f9') || tablesCss.includes('background: #f1f5f9'), 'tables.css sets header background #f1f5f9');
assert(tablesCss.includes('.table-search svg'), 'tables.css contains .table-search svg sizing');
assert(tablesCss.includes('.action-btn'), 'tables.css contains .action-btn styling');
assert(tablesCss.includes('.cat-pill-filters'), 'tables.css contains .cat-pill-filters styling');

// 3. Verify style.css defensive fallback rules
console.log('\n[Check 3] Verifying fallback rules in style.css...');
const styleCss = fs.readFileSync(path.join(cssDir, 'style.css'), 'utf8');
assert(styleCss.includes('.table-search svg'), 'style.css includes defensive .table-search svg rule');
assert(styleCss.includes('max-width: 14px') && styleCss.includes('max-height: 14px'), 'style.css constrains search icon dimensions');

// 4. Verify UniversalSearchSelect scope safety
console.log('\n[Check 4] Verifying search-select.js isolation & exclusions...');
const searchSelectJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'components', 'search-select.js'), 'utf8');
assert(searchSelectJs.includes('!idLower.includes(\'unit\')'), 'search-select.js excludes unit selectors');
assert(searchSelectJs.includes('!idLower.includes(\'status\')'), 'search-select.js excludes status selectors');
assert(searchSelectJs.includes('Math.max(10'), 'search-select.js clamps portal within viewport');

// 5. Audit all ERP Table Pages
console.log('\n[Check 5] Auditing all ERP table pages for proper structure...');
const pagesDir = path.join(__dirname, '..', 'pages');
const pages = [
  'products.html',
  'inventory.html',
  'production.html',
  'orders.html',
  'purchases.html',
  'clients.html',
  'warehouses.html',
  'companies.html',
  'daily-transactions.html',
  'expenses.html',
  'user-roles.html',
  'reports.html'
];

pages.forEach(p => {
  const filePath = path.join(pagesDir, p);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️ Skipped ${p} (not found)`);
    return;
  }
  const html = fs.readFileSync(filePath, 'utf8');

  // Check required CSS links
  const hasTablesCss = html.includes('tables.css');
  const hasFormsCss = html.includes('forms.css');
  const hasStyleCss = html.includes('style.css');

  assert(hasTablesCss && hasFormsCss && hasStyleCss, `${p} links required stylesheets (style, forms, tables)`);

  // Check data-table or main content table structure if it's a table page
  if (p !== 'reports.html') {
    const hasTable = html.includes('<table class="data-table"') || html.includes('class="data-table');
    assert(hasTable, `${p} contains structured .data-table component`);
  }
});

// 6. Check products.html specifically
console.log('\n[Check 6] Verifying products.html specific fixes...');
const productsHtml = fs.readFileSync(path.join(pagesDir, 'products.html'), 'utf8');
assert(productsHtml.includes('<svg width="14" height="14"'), 'products.html search SVGs have inline width/height attributes');
assert(productsHtml.includes('cat-pill-filters'), 'products.html has category pill filters');
assert(productsHtml.includes('id="products-table"'), 'products.html has products table element');
assert(productsHtml.includes('>Product Name</th>') && productsHtml.includes('<th>Batch No</th>'), 'products.html has proper table headers');

console.log('\n===============================================================');
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} TOTAL)`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ERP UI RESTORATION & INTEGRITY AUDIT PASSED 100%!');
}
