const fs = require('fs');
const path = require('path');

function walk(dir) {
  let files = [];
  try {
    for (const item of fs.readdirSync(dir)) {
      if (item === 'node_modules' || item === '.git' || item === 'dist' || item === '.gemini') continue;
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
      else if (full.endsWith('.html') || full.endsWith('.js')) files.push(full);
    }
  } catch (e) {}
  return files;
}

const files = walk('.');
console.log('--- LOGO IMAGES IN HTML/JS ---');
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const lines = c.split('\n');
  lines.forEach((l, idx) => {
    const lower = l.toLowerCase();
    if ((lower.includes('<img') || lower.includes('logo') || lower.includes('.jpg') || lower.includes('.png')) && (lower.includes('src=') || lower.includes('logo') || lower.includes('brand'))) {
      if (!l.includes('svg') && !f.includes('date-fns')) {
        console.log(`${f}:${idx+1} -> ${l.trim().substring(0, 140)}`);
      }
    }
  });
}

console.log('\n--- ERP DASHBOARD LINKS ---');
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const lines = c.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('ERP Dashboard') || l.includes('Dashboard') && l.includes('href')) {
      console.log(`${f}:${idx+1} -> ${l.trim().substring(0, 140)}`);
    }
  });
}
