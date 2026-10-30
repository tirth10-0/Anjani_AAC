const fs = require('fs');
const path = require('path');

function searchInserts(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') searchInserts(full);
    } else if (f.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n');
      lines.forEach((l, i) => {
        if (l.includes("from('stock_movements').insert") || l.includes('from("stock_movements").insert')) {
          console.log(`\n=== ${full}:${i + 1} ===`);
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length - 1, i + 25);
          console.log(lines.slice(start, end).join('\n'));
        }
      });
    }
  }
}

searchInserts('.');
