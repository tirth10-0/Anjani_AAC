const fs = require('fs');
const path = require('path');

const newVersion = Date.now();
console.log('Applying new cache-buster version:', newVersion);

function updateHtmlFiles(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.gemini'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      updateHtmlFiles(full);
    } else if (ent.name.endsWith('.html')) {
      let content = fs.readFileSync(full, 'utf8');
      const updated = content.replace(/(\.(?:css|js))\?v=\d+/g, `$1?v=${newVersion}`);
      if (updated !== content) {
        fs.writeFileSync(full, updated, 'utf8');
        console.log('Updated cache busters in:', path.relative(process.cwd(), full));
      }
    }
  }
}

updateHtmlFiles(process.cwd());
console.log('Finished updating cache busters.');
