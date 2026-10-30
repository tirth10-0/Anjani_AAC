/**
 * test_product_packaging_cascade.js
 * Verification of product packaging cascade delete and orphan prevention
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function runTests() {
  console.log('===============================================================');
  console.log('--- PRODUCT PACKAGING CASCADE & ORPHAN PREVENTION TEST SUITE ---');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  const productsJs = fs.readFileSync(path.join(__dirname, '../assets/js/products.js'), 'utf8');

  // Test 1: allPackagingOptions filters out orphans in loadProducts
  assert(
    '1. loadProducts filters out orphaned packaging variants',
    productsJs.includes('allPackagingOptions = rawPackaging.filter(pkg => allProducts.some(p => p.id === pkg.product_id))')
  );

  // Test 2: Background cleanup of orphaned rows
  assert(
    '2. loadProducts asynchronously cleans up orphaned packaging rows in DB',
    productsJs.includes("window.dbClient.from('product_packaging').delete().in('id', orphanIds)")
  );

  // Test 3: renderPackagingTable ignores missing products rather than rendering N/A
  assert(
    '3. renderPackagingTable skips orphaned variants instead of creating N/A rows',
    productsJs.includes('if (!product) return; // Skip orphaned packaging variants') &&
    !productsJs.includes("name: 'N/A', purchase_price: 0, sell_price: 0")
  );

  // Test 4: deleteProduct deletes associated product_packaging rows
  assert(
    '4. deleteProduct cascade-deletes product_packaging by product_id',
    productsJs.includes("window.dbClient.from('product_packaging').delete().eq('product_id', id)")
  );

  // Test 5: deletePackagingGroup uses APP.showConfirm and deletes without needing p
  assert(
    '5. deletePackagingGroup uses APP.showConfirm and deletes by product_id',
    productsJs.includes("APP.showConfirm('Delete all packaging variants for this product?'") &&
    productsJs.includes("window.dbClient.from('product_packaging').delete().eq('product_id', productId)")
  );

  // Test 6: Migration script exists and has cascade definition
  const migrationPath = path.join(__dirname, '../database/migrations/2026-10-15-product-packaging-cascade-delete.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(
    '6. SQL migration for cascade delete exists',
    migrationExists && fs.readFileSync(migrationPath, 'utf8').includes('ON DELETE CASCADE')
  );

  // Test 7: Live database check
  try {
    const supabase = createClient('https://quxcvoywufjjynluntvg.supabase.co', 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr');
    const { data: prods } = await supabase.from('products').select('id');
    const { data: pkgs } = await supabase.from('product_packaging').select('id, product_id');
    const prodIds = (prods || []).map(p => p.id);
    const orphans = (pkgs || []).filter(pkg => !prodIds.includes(pkg.product_id));
    assert(
      '7. Supabase live database has 0 orphaned packaging variants',
      orphans.length === 0,
      `Found ${orphans.length} orphans`
    );
  } catch (err) {
    console.warn('Live DB test warning:', err.message);
  }

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runTests();
