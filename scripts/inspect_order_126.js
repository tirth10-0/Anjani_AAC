const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function inspectOrder126() {
  const { data: order } = await client.from('orders').select('*').eq('id', 126).single();
  console.log('Order 126:', { id: order?.id, order_no: order?.order_no, notes: order?.notes });

  const { data: items } = await client.from('order_items').select('*').eq('order_id', 126);
  console.log('Order items for 126 count:', items?.length);
  items?.forEach(it => {
    console.log({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      ordered_units: it.ordered_units
    });
  });

  // Check all stock movements for txn_id = 126
  const { data: movs } = await client.from('stock_movements').select('*').eq('txn_id', 126).order('id', { ascending: true });
  console.log('Movements for txn_id 126 count:', movs?.length);
  movs?.forEach(m => {
    console.log({
      id: m.id,
      wh_id: m.warehouse_id,
      batch_id: m.batch_id,
      type: m.txn_type,
      qty: m.qty,
      notes: m.notes
    });
  });

  // Check all batches created with purchase_id = 126
  const { data: batches } = await client.from('stock_batches').select('*').eq('purchase_id', 126);
  console.log('Batches with purchase_id 126 count:', batches?.length);
  batches?.forEach(b => {
    console.log({
      id: b.id,
      wh_id: b.warehouse_id,
      batch_no: b.batch_no,
      item_name: b.item_name,
      item_id: b.item_id,
      current_qty: b.current_qty
    });
  });
}

inspectOrder126().catch(console.error);
