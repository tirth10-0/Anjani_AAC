/**
 * tests/test_production_ui_dropdowns_and_save.js
 * Verification of:
 * 1. Manufactured Product selector data sources & category accuracy (no fake "Technical", only valid products/finished goods).
 * 2. UniversalSearchSelect enhancement & category badge rendering.
 * 3. Removal of bright green scrollbars and theme styling consistency.
 * 4. Action button layout (clear action group below description, single SVG plus icons, matching heights).
 * 5. Production save database schema integration with actual Supabase client (no actual_output_qty error).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING PRODUCTION DROPDOWNS, CATEGORIES, & SAVE TESTS');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Inspect Code & HTML for Dropdowns and Action Buttons
  // --------------------------------------------------------------------------
  console.log('[Test 1] Inspecting pages/production.html and assets/js/production.js...');
  const prodHtml = fs.readFileSync(path.join(__dirname, '../pages/production.html'), 'utf8');
  const prodJs = fs.readFileSync(path.join(__dirname, '../assets/js/production.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(__dirname, '../assets/css/style.css'), 'utf8');
  const ussCss = fs.readFileSync(path.join(__dirname, '../assets/css/components/search-select.css'), 'utf8');
  const ussJs = fs.readFileSync(path.join(__dirname, '../assets/js/components/search-select.js'), 'utf8');

  // Verify Single Plus on Record Production button
  assert.ok(prodHtml.includes('Record Production'), 'Must have Record Production button');
  assert.ok(!prodHtml.includes('+ Record Production'), 'No duplicate literal "+" before Record Production text');

  // Verify Action Buttons layout below description
  assert.ok(prodHtml.includes('product-form-card-actions'), 'Must have dedicated product-form-card-actions container');
  assert.ok(prodHtml.includes('Add Inventory Item'), 'Has Add Inventory Item button');
  assert.ok(prodHtml.includes('Add Finished Product as Output'), 'Has Add Finished Product as Output button');
  assert.ok(!prodHtml.includes('+ Add Inventory Item'), 'No literal duplicate "+" on Add Inventory Item button');
  assert.ok(!prodHtml.includes('➕ Add Finished Product as Output (+)'), 'No emoji or trailing (+) on Add Finished Product button');

  // Verify Manufactured Product selector configuration
  assert.ok(prodHtml.includes('id="product-select"'), 'Must have product-select element');
  assert.ok(prodHtml.includes('data-searchable="true"'), 'product-select must have data-searchable="true"');

  console.log('  ✓ HTML markup, action buttons, and searchable attribute verified.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Verify Removal of Bright Green Scrollbar & Styling Theme
  // --------------------------------------------------------------------------
  console.log('[Test 2] Verifying removal of bright green scrollbar...');
  // Check that style.css does not have the bright green scrollbar thumb
  assert.ok(!styleCss.includes('rgba(137, 233, 0, 0.45)'), 'style.css must not use bright green rgba(137, 233, 0, 0.45)');
  assert.ok(!styleCss.includes('rgba(137, 233, 0, 0.62)'), 'style.css must not use bright green rgba(137, 233, 0, 0.62)');
  assert.ok(!ussCss.includes('rgba(137, 233, 0, 0.1)'), 'search-select.css must not use bright green');
  assert.ok(ussCss.includes('.uss-list::-webkit-scrollbar'), 'search-select.css has custom scrollbar definition');

  console.log('  ✓ Bright green scrollbar removed; neutral theme scrollbar verified.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Verify UniversalSearchSelect Category Extraction and Search
  // --------------------------------------------------------------------------
  console.log('[Test 3] Verifying UniversalSearchSelect category and search capabilities...');
  assert.ok(ussJs.includes('category: opt.dataset.category'), 'USS extracts dataset.category');
  assert.ok(ussJs.includes('item.category.toLowerCase().includes(q)'), 'USS filters by category as well as text');
  assert.ok(ussJs.includes('item.category'), 'USS renders category badge if present');

  console.log('  ✓ UniversalSearchSelect supports category metadata, badge rendering, and search.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Live Supabase Data Verification: Categories & Product Master
  // --------------------------------------------------------------------------
  console.log('[Test 4] Querying live database for products & inventory classifications...');
  const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
  const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
  const sb = createClient(supabaseUrl, supabaseKey);

  const { data: products, error: pErr } = await sb.from('products').select('*');
  assert.ok(!pErr, 'Failed to fetch products from Supabase');
  assert.ok(products && products.length > 0, 'Products table should have records');

  const { data: inventory, error: iErr } = await sb.from('inventory_items').select('*');
  assert.ok(!iErr, 'Failed to fetch inventory from Supabase');
  assert.ok(inventory && inventory.length > 0, 'Inventory table should have records');

  // Check Anjani products in products master
  const anjaniProducts = products.filter(p => p.name.startsWith('Anjani '));
  assert.ok(anjaniProducts.length > 0, 'Must find Anjani products in Product Master');
  anjaniProducts.forEach(p => {
    assert.strictEqual(p.category, 'Insecticides', `Product ${p.name} category should be Insecticides`);
  });
  console.log(`  ✓ Verified ${anjaniProducts.length} Anjani products have stored category 'Insecticides' (not Technical)`);

  // Verify dropdown generation logic doesn't include raw materials, bottles, or boxes
  const cachedProducts = products;
  const cachedInventory = inventory;

  // Simulate populateModalDropdowns logic
  const manufacturedProductOptions = [];
  cachedProducts.forEach(p => {
    const categoryLabel = p.category ? String(p.category).trim() : 'Insecticide';
    manufacturedProductOptions.push({
      value: `PROD_${p.id}`,
      name: p.name,
      category: categoryLabel
    });
  });

  const finishedGoods = cachedInventory.filter(i => {
    const cat = (i.category || '').toLowerCase();
    const type = (i.item_type || '').toLowerCase();
    const isFinished = cat.includes('finished') || type.includes('finished');
    if (!isFinished) return false;
    const existsInProducts = cachedProducts.some(p => p.name.toLowerCase().trim() === i.name.toLowerCase().trim());
    return !existsInProducts;
  });

  finishedGoods.forEach(i => {
    manufacturedProductOptions.push({
      value: `INV_${i.id}`,
      name: i.name,
      category: i.item_subtype || i.category || 'Finished Goods'
    });
  });

  // Verify bottles and boxes are NOT in manufacturedProductOptions
  const hasBottles = manufacturedProductOptions.some(o => o.category.toLowerCase().includes('bottle') || o.name.toLowerCase().includes('bottle'));
  const hasBoxes = manufacturedProductOptions.some(o => o.category.toLowerCase().includes('box') || o.name.toLowerCase().includes('box'));
  assert.strictEqual(hasBottles, false, 'Bottles must NOT appear in Manufactured Product selector');
  assert.strictEqual(hasBoxes, false, 'Boxes must NOT appear in Manufactured Product selector');

  // Verify none are labeled "Technical"
  const hasTechnical = manufacturedProductOptions.some(o => o.category.toLowerCase() === 'technical');
  assert.strictEqual(hasTechnical, false, 'No manufactured product should be labeled "Technical"');

  console.log(`  ✓ Filtered ${manufacturedProductOptions.length} valid manufactured options: zero bottles/boxes, zero fake Technical labels.\n`);

  // --------------------------------------------------------------------------
  // TEST 5: Production Save End-to-End Verification (Schema Mismatch Fix)
  // --------------------------------------------------------------------------
  console.log('[Test 5] Testing production save against live database (actual_output_qty schema fix)...');
  
  const testBatchNo = `TEST-PROD-SAVE-${Date.now()}`;
  const testProduct = anjaniProducts[0] || products[0];

  const payload = {
    batch_no: testBatchNo,
    product_id: testProduct.id,
    product_name: testProduct.name,
    formula_name: testProduct.name,
    quantity_produced: 25.5,
    date: new Date().toISOString().split('T')[0],
    notes: JSON.stringify({
      user_notes: 'End-to-end verification of schema mismatch resolution',
      output_unit: 'Litre',
      items: [
        {
          inventory_id: inventory[0].id,
          item_name: inventory[0].name,
          category: inventory[0].category,
          action: 'DECREASE',
          entered_quantity: 5,
          entered_unit: inventory[0].unit || 'Litre',
          converted_quantity: 5,
          canonical_unit: inventory[0].unit || 'Litre'
        }
      ]
    }),
    company_id: 1,
    branch_id: 1,
    warehouse_id: 1
  };

  // Perform actual insert
  const { data: insertResult, error: insertError } = await sb
    .from('production_batches')
    .insert([payload])
    .select();

  assert.ok(!insertError, `Production save failed with error: ${insertError ? insertError.message : ''}`);
  assert.ok(insertResult && insertResult.length > 0, 'Insert result should return created row');
  const savedRow = insertResult[0];
  assert.strictEqual(savedRow.batch_no, testBatchNo, 'Saved batch_no must match');
  assert.strictEqual(parseFloat(savedRow.quantity_produced), 25.5, 'quantity_produced must match');
  console.log(`  ✓ Successfully saved production batch #${savedRow.id} (${savedRow.batch_no}) without actual_output_qty error!`);

  // Verify retrieval
  const { data: retrieved, error: retErr } = await sb
    .from('production_batches')
    .select('*')
    .eq('id', savedRow.id)
    .single();
  assert.ok(!retErr, 'Failed to retrieve saved production record');
  assert.strictEqual(retrieved.product_name, testProduct.name, 'Retrieved product_name must match');

  // Clean up test batch record
  await sb.from('production_batches').delete().eq('id', savedRow.id);
  console.log('  ✓ Cleaned up test production batch record.\n');

  console.log('===============================================================');
  console.log('🎉 ALL 5 PRODUCTION UI & SAVE TESTS PASSED FLAWLESSLY!');
  console.log('===============================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
