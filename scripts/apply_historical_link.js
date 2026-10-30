const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function applyHistoricalLink() {
  const links = [
    { movementId: 664, batchId: 127 },
    { movementId: 669, batchId: 128 },
    { movementId: 698, batchId: 132 },
    { movementId: 699, batchId: 133 },
    { movementId: 701, batchId: 134 },
    { movementId: 702, batchId: 135 },
    { movementId: 705, batchId: 136 },
    { movementId: 706, batchId: 137 },
    { movementId: 707, batchId: 138 },
    { movementId: 708, batchId: 139 }
  ];

  for (const l of links) {
    const { error } = await client
      .from('stock_movements')
      .update({ batch_id: l.batchId })
      .eq('id', l.movementId);

    if (error) {
      console.error(`Failed to link movement ${l.movementId}:`, error);
    } else {
      console.log(`Linked movement ${l.movementId} -> batch ${l.batchId}`);
    }
  }

  console.log('Historical linking complete!');
}

applyHistoricalLink().catch(console.error);
