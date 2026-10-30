const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function checkAllNullBatches() {
  const { data: nullMovs } = await client
    .from('stock_movements')
    .select('*')
    .is('batch_id', null);
  
  console.log('Total stock_movements with null batch_id:', nullMovs?.length);
  nullMovs?.forEach(m => {
    console.log({
      id: m.id,
      wh: m.warehouse_id,
      type: m.txn_type,
      txn_id: m.txn_id,
      qty: m.qty,
      notes: m.notes,
      created_at: m.created_at
    });
  });
}

checkAllNullBatches().catch(console.error);
