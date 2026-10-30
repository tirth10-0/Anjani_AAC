const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://quxcvoywufjjynluntvg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sqlVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function exportAllData() {
  const tables = [
    'companies', 'branches', 'warehouses', 'user_company_access',
    'clients', 'suppliers', 'products', 'product_packaging', 'inventory_items',
    'stock_batches', 'stock_movements', 'orders', 'order_items'
  ];

  let sql = '-- ==============================================================================\n';
  sql += '-- ERP LIVE BUSINESS DATA EXPORT (ID-PRESERVING RESTORATION SCRIPT)\n';
  sql += '-- Generated: ' + new Date().toISOString() + '\n';
  sql += '-- Preserves exact primary keys, foreign keys, timestamps, and stock batches\n';
  sql += '-- ==============================================================================\n\n';
  sql += 'BEGIN;\n\n';

  for (const tbl of tables) {
    const { data, error } = await supabase.from(tbl).select('*').order('id', { ascending: true });
    if (error) {
      console.error('Error fetching ' + tbl + ':', error.message);
      continue;
    }
    if (!data || data.length === 0) continue;

    sql += '-- ------------------------------------------------------------------------------\n';
    sql += '-- TABLE: ' + tbl + ' (' + data.length + ' rows)\n';
    sql += '-- ------------------------------------------------------------------------------\n';

    const cols = Object.keys(data[0]);
    sql += 'INSERT INTO public.' + tbl + ' (' + cols.join(', ') + ') VALUES\n';

    const rowStrings = data.map(row => {
      return '  (' + cols.map(c => sqlVal(row[c])).join(', ') + ')';
    });
    sql += rowStrings.join(',\n') + '\nON CONFLICT (id) DO NOTHING;\n\n';
  }

  sql += '-- ------------------------------------------------------------------------------\n';
  sql += '-- POSTGRESQL SEQUENCE SYNCHRONIZATION (Prevents duplicate key errors on future inserts)\n';
  sql += '-- ------------------------------------------------------------------------------\n';
  for (const tbl of tables) {
    sql += "SELECT setval(pg_get_serial_sequence('public." + tbl + "', 'id'), COALESCE((SELECT MAX(id) FROM public." + tbl + "), 1));\n";
  }

  sql += '\nCOMMIT;\n';

  fs.writeFileSync('database/setup/EXPORTED_LIVE_BUSINESS_DATA.sql', sql, 'utf8');
  console.log('Successfully generated database/setup/EXPORTED_LIVE_BUSINESS_DATA.sql (' + sql.length + ' bytes)');
}

exportAllData();
