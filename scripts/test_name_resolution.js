const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://quxcvoywufjjynluntvg.supabase.co';
const supabaseKey = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const client = createClient(supabaseUrl, supabaseKey);

async function testResolution() {
  const [bRes, pRes, iRes, mRes] = await Promise.all([
    client.from('stock_batches').select('*'),
    client.from('products').select('id, name, category, packaging, item_size, purchase_price, unit'),
    client.from('inventory_items').select('id, name, category, item_size, item_subtype, unit'),
    client.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(40)
  ]);

  const pMap = new Map((pRes.data || []).map(p => [p.id, p]));
  const iMap = new Map((iRes.data || []).map(i => [i.id, i]));
  const batchLookup = new Map((bRes.data || []).map(b => [b.id, b]));

  function resolveMovementItemName(m) {
    // 1. Direct batch lookup
    if (m.batch_id && batchLookup.has(m.batch_id)) {
      const b = batchLookup.get(m.batch_id);
      if (b.item_name && b.item_name.trim() && b.item_name !== 'Inventory Item') {
        return b.item_name;
      }
      if (b.item_type === 'Product' && pMap.has(b.item_id)) {
        return pMap.get(b.item_id).name;
      }
      if (iMap.has(b.item_id)) {
        return iMap.get(b.item_id).name;
      }
    }

    // 2. Correlate with batches in the same warehouse by purchase_id / order_id
    if (m.txn_id && m.warehouse_id) {
      const matchedBatches = (bRes.data || []).filter(b => 
        b.warehouse_id === m.warehouse_id && 
        b.purchase_id === m.txn_id
      );
      if (matchedBatches.length > 0) {
        // Try to match by quantity first
        const qtyMatch = matchedBatches.find(b => parseFloat(b.initial_qty) === Math.abs(parseFloat(m.qty)));
        if (qtyMatch && qtyMatch.item_name) return qtyMatch.item_name;
        if (matchedBatches[0].item_name) return matchedBatches[0].item_name;
      }
    }

    // 3. Notes analysis (JSON or plain text)
    if (m.notes) {
      // 3a. JSON payload
      if (m.notes.startsWith('{') && m.notes.endsWith('}')) {
        try {
          const parsed = JSON.parse(m.notes);
          if (parsed.item_name) return parsed.item_name;
          if (parsed.product_name) return parsed.product_name;
        } catch (_) {}
      }

      // 3b. "of [Product Name] into" or "of [Product Name] from"
      const ofMatch = m.notes.match(/\bof\s+([A-Za-z0-9\s\-]+?)\s+(?:into|from|via)\b/i);
      if (ofMatch && ofMatch[1].trim()) {
        return ofMatch[1].trim();
      }

      // 3c. Check if notes contains known product names
      for (const p of pRes.data || []) {
        if (m.notes.toLowerCase().includes(p.name.toLowerCase())) {
          return p.name;
        }
      }
      for (const it of iRes.data || []) {
        if (m.notes.toLowerCase().includes(it.name.toLowerCase())) {
          return it.name;
        }
      }
    }

    // 4. Transaction type specific labels
    if (m.txn_type) {
      if (m.txn_type.includes('DISPATCH_BOTTLES')) return 'Packaging Bottle';
      if (m.txn_type.includes('DISPATCH_BOXES')) return 'Packaging Box';
      if (m.txn_type.includes('DISPATCH_LABELS')) return 'Product Label';
    }

    // 5. Raw item_name if present on movement
    if (m.item_name && m.item_name !== 'Inventory Item') return m.item_name;

    return 'Inventory Item';
  }

  console.log('Testing resolution on latest 40 movements:');
  const results = (mRes.data || []).map(m => ({
    id: m.id,
    wh: m.warehouse_id,
    type: m.txn_type,
    qty: m.qty,
    resolvedName: resolveMovementItemName(m),
    notesSnippet: (m.notes || '').substring(0, 45)
  }));
  console.table(results);
}

testResolution().catch(console.error);
