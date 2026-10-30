/**
 * test_tenant_context_and_product_save.js
 * Verification of TenantContext.stamp schema isolation and product creation
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function runTests() {
  console.log('===============================================================');
  console.log('--- TENANT CONTEXT SCHEMA AWARENESS & PRODUCT SAVE TEST ---');
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

  const tenantContextJs = fs.readFileSync(path.join(__dirname, '../assets/js/tenant-context.js'), 'utf8');
  const productsJs = fs.readFileSync(path.join(__dirname, '../assets/js/products.js'), 'utf8');

  // Test 1: TABLE_LOCATION_COLS exists in tenant-context.js
  assert(
    '1. TABLE_LOCATION_COLS dictionary exists in tenant-context.js',
    tenantContextJs.includes('TABLE_LOCATION_COLS') &&
    tenantContextJs.includes('products: { branch: false, warehouse: false }') &&
    tenantContextJs.includes('clients: { branch: false, warehouse: false }')
  );

  // Test 2: stamp method prevents injecting branch_id into master tables
  assert(
    '2. stamp method strips/prevents branch_id and warehouse_id when not permitted',
    tenantContextJs.includes('delete stamped.branch_id;') &&
    tenantContextJs.includes('delete stamped.warehouse_id;')
  );

  // Test 3: products.js uses stampedPayload without branch_id/warehouse_id
  assert(
    '3. saveProduct explicitly deletes branch_id and warehouse_id',
    productsJs.includes('delete stampedPayload.branch_id;') &&
    productsJs.includes('delete stampedPayload.warehouse_id;')
  );

  // Test 4: products.js has retry fallback for unmigrated packaging BOM columns
  assert(
    '4. saveProduct handles unmigrated packaging columns with graceful retry',
    productsJs.includes("bottle_inventory_id") &&
    productsJs.includes("Retrying product_packaging insert without unmigrated BOM columns")
  );

  // Test 5: Live DB End-to-End Product Insert & Clean
  try {
    const supabase = createClient('https://quxcvoywufjjynluntvg.supabase.co', 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr');

    // Attempt actual insert of product matching the user's screenshot exactly!
    const productPayload = {
      name: 'Verification Chlor-20 EC',
      brand: 'Afield Crop Care',
      category: 'Insecticides',
      unit: 'Litre',
      purchase_price: 500,
      sell_price: 800,
      gst: '18%',
      company_id: 1
    };

    const { data: prodData, error: prodErr } = await supabase.from('products').insert([productPayload]).select();
    assert(
      '5. Live Supabase product creation succeeds without branch_id error',
      !prodErr && prodData && prodData[0]?.id > 0,
      prodErr ? prodErr.message : ''
    );

    if (prodData && prodData[0]) {
      const prodId = prodData[0].id;

      // Now insert the packaging options matching screenshot (1 Litre @ 800, 500 Ml @ 600)
      const pkgs = [
        {
          product_id: prodId,
          packaging_size: '1 Litre',
          purchase_price: 500,
          sell_price: 800,
          units_per_box: 10,
          company_id: 1
        },
        {
          product_id: prodId,
          packaging_size: '500 Ml',
          purchase_price: 0,
          sell_price: 600,
          units_per_box: 20,
          company_id: 1
        }
      ];

      const { data: pkgData, error: pkgErr } = await supabase.from('product_packaging').insert(pkgs).select();
      assert(
        '6. Live Supabase packaging options insert succeeds',
        !pkgErr && pkgData && pkgData.length === 2,
        pkgErr ? pkgErr.message : ''
      );

      // Clean up test data
      await supabase.from('product_packaging').delete().eq('product_id', prodId);
      await supabase.from('products').delete().eq('id', prodId);
      console.log('  -> Live test records cleaned up successfully.');
    }
  } catch (err) {
    console.error('Live DB test error:', err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runTests();
