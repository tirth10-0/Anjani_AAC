const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const dbCode = fs.readFileSync('assets/js/database.js', 'utf8');
const urlMatch = dbCode.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = dbCode.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

if (urlMatch && keyMatch) {
  const client = createClient(urlMatch[1], keyMatch[1]);
  Promise.all([
    client.from('audit_logs').select('*').limit(5),
    client.from('rbac_audit_logs').select('*').limit(5)
  ]).then(([r1, r2]) => {
    console.log('audit_logs:', r1.data ? r1.data.length : null, 'error:', r1.error);
    console.log('rbac_audit_logs:', r2.data ? r2.data.length : null, 'error:', r2.error);
    if (r1.data && r1.data.length) console.log('sample audit_log:', r1.data[0]);
    if (r2.data && r2.data.length) console.log('sample rbac_audit_log:', r2.data[0]);
    process.exit(0);
  });
}
