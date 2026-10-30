const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function listGodownBatches() {
  const { data: batches } = await client
    .from('stock_batches')
    .select('*')
    .eq('warehouse_id', 532)
    .order('id', { ascending: true });

  console.log('All batches in Gas Godown (532):', batches.length);
  batches.forEach(b => {
    console.log({
      id: b.id,
      batch_no: b.batch_no,
      item_name: b.item_name,
      item_id: b.item_id,
      purchase_id: b.purchase_id,
      initial_qty: b.initial_qty,
      current_qty: b.current_qty,
      created_at: b.created_at
    });
  });
}

listGodownBatches().catch(console.error);
