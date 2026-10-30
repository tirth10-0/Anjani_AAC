const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function inspectBatches() {
  const ids = [77, 124, 125, 126, 129, 130, 131];
  const { data } = await client.from('stock_batches').select('*').in('id', ids);
  console.log('Batches found:', data?.length);
  data?.forEach(b => {
    console.log({
      id: b.id,
      wh: b.warehouse_id,
      item_name: b.item_name,
      item_type: b.item_type,
      batch_no: b.batch_no,
      unit: b.unit
    });
  });
}

inspectBatches().catch(console.error);
