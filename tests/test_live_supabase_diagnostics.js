/**
 * tests/test_live_supabase_diagnostics.js
 * Read-only health check & stock diagnostics test against the live Supabase instance.
 * Does not modify or delete any live data.
 */

const { createClient } = require('@supabase/supabase-js');
const inventoryCore = require('../assets/js/inventory-core.js');

const SUPABASE_URL = 'https://jtbettizhwwqmuyofapm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kSf8e6RD96lT40di2YqxxQ_gJ3WS6ve';

async function main() {
  console.log('Connecting to live Supabase instance...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  inventoryCore.Service.setDb(supabase);

  console.log('Running authoritative diagnostics against live database...');
  const report = await inventoryCore.Service.runDiagnostics();

  console.log('\n--- LIVE INVENTORY DIAGNOSTICS REPORT ---');
  console.log(`Status:                  ${report.status}`);
  console.log(`Total Inventory Items:   ${report.totalItems}`);
  console.log(`Total Stock Batches:     ${report.totalBatches}`);
  console.log(`Discrepancies Count:     ${report.discrepanciesCount}`);
  console.log(`Negative Batches Count:  ${report.negativeBatchesCount}`);

  if (report.discrepanciesCount > 0) {
    console.log('\nDiscrepancies found:');
    report.discrepancies.forEach(d => {
      console.log(`  - Item #${d.itemId} "${d.name}": Cached Stock = ${d.cachedStock}, True Calculated = ${d.calculatedStock} (Variance: ${d.variance})`);
    });
  }

  if (report.negativeBatchesCount > 0) {
    console.log('\nNegative batches found:');
    report.negativeBatches.forEach(b => {
      console.log(`  - Batch #${b.id} (${b.batch_no}): Qty = ${b.current_qty}`);
    });
  }

  console.log('-----------------------------------------\n');
}

main().catch(err => {
  console.error('Error running live diagnostics:', err);
  process.exit(1);
});
