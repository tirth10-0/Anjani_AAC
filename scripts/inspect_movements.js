const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: movements, error: mErr } = await client
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (mErr) {
    console.error('Movement query error:', mErr);
  } else {
    console.log('--- Latest 20 stock_movements ---');
    if (movements.length > 0) {
      console.log('Columns in stock_movements:', Object.keys(movements[0]));
    }
    movements.forEach(m => {
      console.log({
        id: m.id,
        warehouse_id: m.warehouse_id,
        batch_id: m.batch_id,
        item_id: m.item_id,
        item_name: m.item_name,
        product_id: m.product_id,
        txn_type: m.txn_type,
        qty: m.qty,
        txn_id: m.txn_id,
        notes: m.notes,
        created_at: m.created_at
      });
    });
  }

  // Also inspect gas godown warehouse
  const { data: whs } = await client.from('warehouses').select('id, name, code');
  console.log('Warehouses:', whs);

  const gasGodown = whs?.find(w => w.name.toLowerCase().includes('gas'));
  if (gasGodown) {
    const { data: batches } = await client
      .from('stock_batches')
      .select('*')
      .eq('warehouse_id', gasGodown.id);
    console.log(`--- Batches in ${gasGodown.name} (${gasGodown.id}) count: ${batches?.length} ---`);
    batches?.slice(0, 5).forEach(b => {
      console.log({
        id: b.id,
        batch_no: b.batch_no,
        item_name: b.item_name,
        item_id: b.item_id,
        purchase_id: b.purchase_id,
        current_qty: b.current_qty,
        created_at: b.created_at
      });
    });
  }
}

check().catch(console.error);
