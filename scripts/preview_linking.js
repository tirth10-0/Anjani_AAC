const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function previewLinking() {
  const { data: movs } = await client
    .from('stock_movements')
    .select('*')
    .eq('warehouse_id', 532)
    .is('batch_id', null)
    .order('id', { ascending: true });

  const { data: batches } = await client
    .from('stock_batches')
    .select('*')
    .eq('warehouse_id', 532)
    .order('id', { ascending: true });

  console.log(`Found ${movs.length} movements with null batch_id in warehouse 532.`);
  console.log(`Found ${batches.length} batches in warehouse 532.`);

  const pairs = [];
  const usedBatchIds = new Set();

  for (const m of movs) {
    // Find matching batch by purchase_id == txn_id and initial_qty == qty
    const candidate = batches.find(b => 
      !usedBatchIds.has(b.id) && 
      b.purchase_id === m.txn_id && 
      parseFloat(b.initial_qty) === parseFloat(m.qty)
    );
    if (candidate) {
      usedBatchIds.add(candidate.id);
      pairs.push({
        movementId: m.id,
        txn_id: m.txn_id,
        qty: m.qty,
        matchedBatchId: candidate.id,
        itemName: candidate.item_name,
        batchNo: candidate.batch_no
      });
    } else {
      console.log('No candidate found for movement', m.id);
    }
  }

  console.log('Proposed matches:');
  console.table(pairs);
}

previewLinking().catch(console.error);
