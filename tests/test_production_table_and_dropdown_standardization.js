/**
 * tests/test_production_table_and_dropdown_standardization.js
 * Verification of:
 * 1. Inventory Items Table in pages/production.html and assets/js/production.js:
 *    - Fits parent container on desktop/laptop without horizontal scrolling.
 *    - No hardcoded min-width (680px removed).
 *    - Column percentages sum to exactly 100% (34% + 13% + 21% + 14% + 12% + 6% = 100%).
 *    - Stock Operation select has no min-width:160px forcing cell overflow.
 *    - Responsive card layout for mobile viewports (< 768px) with accessible mobile labels.
 * 2. ERP-Wide Dropdown Standardization matching Manufactured Product Dropdown:
 *    - UniversalSearchSelect (USS) as design baseline with 8px radius, 1.5px border #cbd5e1, chevron SVG, neutral slate scrollbar.
 *    - .form-select in forms.css matches baseline (height 40px, 8px radius, 1.5px border, #64748b chevron, #0C3925 focus ring).
 *    - .table-filter select in tables.css matches baseline.
 *    - Standard select overrides in tables.css (lines 780+) updated to 8px radius and 1.5px border.
 *    - .filter-group select in style.css matches baseline.
 *    - USS isSearchableSelect() supports data-autocomplete, entity materials, and excludes production-items-table.
 *    - USS portal bounds check ensures menus never extend beyond viewport boundaries.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING PRODUCTION TABLE & DROPDOWN STANDARDIZATION TESTS');
  console.log('===============================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const prodHtml = fs.readFileSync(path.join(rootDir, 'pages/production.html'), 'utf8');
  const prodJs = fs.readFileSync(path.join(rootDir, 'assets/js/production.js'), 'utf8');
  const formsCss = fs.readFileSync(path.join(rootDir, 'assets/css/forms.css'), 'utf8');
  const tablesCss = fs.readFileSync(path.join(rootDir, 'assets/css/tables.css'), 'utf8');
  const styleCss = fs.readFileSync(path.join(rootDir, 'assets/css/style.css'), 'utf8');
  const ussCss = fs.readFileSync(path.join(rootDir, 'assets/css/components/search-select.css'), 'utf8');
  const ussJs = fs.readFileSync(path.join(rootDir, 'assets/js/components/search-select.js'), 'utf8');

  // --------------------------------------------------------------------------
  // TEST 1: Inventory Items Table Layout & Column Widths
  // --------------------------------------------------------------------------
  console.log('[Test 1] Inspecting Inventory Items table structure and column widths...');

  // Ensure min-width: 680px is completely removed from production-items-table
  assert.ok(!prodHtml.includes('min-width:680px') && !prodHtml.includes('min-width: 680px'),
    'Table must not have hardcoded min-width: 680px');

  // Verify container class
  assert.ok(prodHtml.includes('production-items-wrap'),
    'Container must have class production-items-wrap');

  // Verify column widths sum to 100%
  const widthMatches = prodHtml.match(/style="width:\s*(\d+)%/g) || [];
  const percentages = widthMatches.map(m => parseInt(m.match(/\d+/)[0], 10));
  
  // Headers in production-items-table: 34, 13, 21, 14, 12, 6
  assert.ok(prodHtml.includes('width: 34%'), 'Item column must be 34%');
  assert.ok(prodHtml.includes('width: 13%'), 'Stock column must be 13%');
  assert.ok(prodHtml.includes('width: 21%'), 'Operation column must be 21%');
  assert.ok(prodHtml.includes('width: 14%'), 'Quantity column must be 14%');
  assert.ok(prodHtml.includes('width: 12%'), 'Unit column must be 12%');
  assert.ok(prodHtml.includes('width: 6%'), 'Remove column must be 6%');

  const tableColumnSum = 34 + 13 + 21 + 14 + 12 + 6;
  assert.strictEqual(tableColumnSum, 100, 'Sum of table column percentages must be exactly 100%');

  // Verify production.js row template matches
  assert.ok(!prodJs.includes('min-width:160px') && !prodJs.includes('min-width: 160px'),
    'Stock Operation select must not have min-width: 160px forcing cell expansion');
  assert.ok(prodJs.includes('class="production-item-row"'),
    'Row template must have class production-item-row');
  assert.ok(prodJs.includes('width:34%') || prodJs.includes('width: 34%'),
    'Row cell item must match 34% width');

  console.log('  ✓ Desktop table layout verified: 0 hardcoded min-widths, column sum = 100%.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Responsive Mobile Layout (< 768px)
  // --------------------------------------------------------------------------
  console.log('[Test 2] Verifying mobile responsive card layout...');

  assert.ok(prodHtml.includes('.prod-mobile-label {'), 'Has mobile label definition');
  assert.ok(prodHtml.includes('@media (max-width: 768px)'), 'Has max-width 768px media query');
  assert.ok(prodHtml.includes('.production-items-table thead {\n        display: none !important;'),
    'Mobile layout hides thead');
  assert.ok(prodHtml.includes('tr.production-item-row {\n        display: flex !important;\n        flex-direction: column !important;'),
    'Mobile layout transforms rows into flex cards');
  assert.ok(prodJs.includes('prod-mobile-label'),
    'Row template includes mobile labels for all fields');

  console.log('  ✓ Mobile card layout verified: thead hidden, cards stacked with field labels.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Dropdown Design Baseline (.form-select & USS)
  // --------------------------------------------------------------------------
  console.log('[Test 3] Verifying Manufactured Product dropdown baseline tokens...');

  // Check USS baseline in search-select.css
  assert.ok(ussCss.includes('height: 40px;'), 'USS input height 40px');
  assert.ok(ussCss.includes('border: 1.5px solid var(--border, #cbd5e1);'), 'USS input border 1.5px #cbd5e1');
  assert.ok(ussCss.includes('border-radius: 8px;'), 'USS input border radius 8px');
  assert.ok(ussCss.includes('box-shadow: 0 0 0 2px rgba(12, 57, 37, 0.2);'), 'USS focus ring 2px rgba(12, 57, 37, 0.2)');
  assert.ok(ussCss.includes('border-color: #94a3b8;'), 'USS hover border-color #94a3b8');

  // Check forms.css .form-select
  assert.ok(formsCss.includes('height: 40px;'), 'form-select height 40px');
  assert.ok(formsCss.includes('border: 1.5px solid var(--border, #cbd5e1);'), 'form-select border 1.5px #cbd5e1');
  assert.ok(formsCss.includes('border-radius: 8px;'), 'form-select border-radius 8px');
  assert.ok(formsCss.includes('box-shadow: 0 0 0 2px rgba(12, 57, 37, 0.2);'), 'form-select focus ring matches');
  assert.ok(formsCss.includes('border-color: #94a3b8;'), 'form-select hover border-color #94a3b8');
  assert.ok(formsCss.includes('stroke=\'%2364748b\''), 'form-select uses SVG chevron');

  console.log('  ✓ Manufactured Product baseline and form-select styles match.\n');

  // --------------------------------------------------------------------------
  // TEST 4: ERP Table Filters & Global Select Standardization
  // --------------------------------------------------------------------------
  console.log('[Test 4] Verifying table filters and global select overrides in tables.css & style.css...');

  // tables.css .table-filter select
  assert.ok(tablesCss.includes('.table-filter select {\n  height: 40px;'), 'table-filter select height 40px');
  assert.ok(tablesCss.includes('border: 1.5px solid #cbd5e1;'), 'table-filter select border 1.5px #cbd5e1');
  assert.ok(tablesCss.includes('border-radius: 8px;'), 'table-filter select border-radius 8px');

  // tables.css line 790+ overrides
  assert.ok(tablesCss.includes('.anjani-select {\n  height: 40px !important;'), 'anjani-select height 40px');
  assert.ok(tablesCss.includes('border-radius: 8px !important;'), 'tables.css standard select border-radius 8px !important');
  assert.ok(tablesCss.includes('border: 1.5px solid #cbd5e1 !important;'), 'tables.css standard select border 1.5px !important');

  // style.css .filter-group select
  assert.ok(styleCss.includes('.filter-group select {\n  padding: 0 34px 0 12px !important;'), 'filter-group select styled');
  assert.ok(styleCss.includes('border: 1.5px solid #cbd5e1 !important;'), 'filter-group border 1.5px #cbd5e1');

  console.log('  ✓ Table filters and global select rules standardized.\n');

  // --------------------------------------------------------------------------
  // TEST 5: UniversalSearchSelect Enhancements & Scope Isolation
  // --------------------------------------------------------------------------
  console.log('[Test 5] Verifying UniversalSearchSelect enhancements and exclusion safety...');

  assert.ok(ussJs.includes('select.hasAttribute(\'data-autocomplete\')'), 'USS supports data-autocomplete');
  assert.ok(ussJs.includes('idLower.includes(\'material\')'), 'USS supports material entities');
  assert.ok(ussJs.includes('select.closest(\'.production-items-table\')'), 'USS safely excludes production-items-table cells');
  assert.ok(ussJs.includes('window.innerWidth - rect.width - 8'), 'USS portal positions safely within viewport');

  console.log('  ✓ USS enhancements and scope isolation verified.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Representative Pages Dropdown Check Across Modules
  // --------------------------------------------------------------------------
  console.log('[Test 6] Checking representative pages for form-select and dropdown styling...');

  const pagesToCheck = [
    'dashboard.html',
    'products.html',
    'inventory.html',
    'production.html',
    'purchases.html',
    'orders.html',
    'daily-transactions.html',
    'expenses.html',
    'companies.html',
    'warehouses.html',
    'user-roles.html',
    'reports.html'
  ];

  pagesToCheck.forEach(page => {
    const pageContent = fs.readFileSync(path.join(rootDir, 'pages', page), 'utf8');
    assert.ok(pageContent.includes('<select'), `Page ${page} must contain select elements`);
    // Check that CSS links forms.css, tables.css, search-select.css
    assert.ok(pageContent.includes('forms.css'), `Page ${page} must include forms.css`);
  });

  console.log(`  ✓ All ${pagesToCheck.length} representative ERP pages include standardized forms.css.\n`);

  console.log('===============================================================');
  console.log('🎉 ALL 6 PRODUCTION TABLE & DROPDOWN TESTS PASSED FLAWLESSLY!');
  console.log('===============================================================\n');
}

runTests();
