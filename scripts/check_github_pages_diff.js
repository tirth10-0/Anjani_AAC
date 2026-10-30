const fs = require('fs');
const path = require('path');

function checkJsNav(dir) {
  let issues = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.gemini', 'tests'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      issues = issues.concat(checkJsNav(full));
    } else if (/\.(html|js)$/.test(ent.name)) {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      lines.forEach((l, i) => {
        // Matches window.location.href = '/ or location.href = '/ or window.location = '/
        const m = l.match(/(?:location\.href|location\.assign|location\.replace|window\.location)\s*=\s*['"]\/([^'"]+)['"]/i);
        if (m) {
          issues.push({
            file: path.relative(process.cwd(), full).replace(/\\/g, '/'),
            line: i + 1,
            matched: m[0],
            text: l.trim()
          });
        }
      });
    }
  }
  return issues;
}

const res = checkJsNav(process.cwd());
console.log('Total JS root navigation paths found:', res.length);
res.forEach(r => console.log(r.file + ':' + r.line + ' -> ' + r.matched));
