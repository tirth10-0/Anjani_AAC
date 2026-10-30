const fs = require('fs');
const path = require('path');

const newTs = Date.now();

function updateHtmlFiles(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git' && item !== 'dist' && item !== 'apps') {
        updateHtmlFiles(full);
      }
    } else if (item.endsWith('.html')) {
      let content = fs.readFileSync(full, 'utf8');
      const updated = content.replace(/(\.(?:css|js))\?v=\d+/g, (match, p1) => `${p1}?v=${newTs}`);
      if (content !== updated) {
        fs.writeFileSync(full, updated, 'utf8');
        console.log(`Updated cache timestamp in ${path.relative(process.cwd(), full)}`);
      }
    }
  }
}

updateHtmlFiles(process.cwd());

// Mirror Invoice Builder to apps/Invoice Builder to maintain exact sync
const srcIb = path.join(process.cwd(), 'Invoice Builder');
const destIb = path.join(process.cwd(), 'apps', 'Invoice Builder');
if (fs.existsSync(srcIb) && fs.existsSync(destIb)) {
  ['index.html', 'history.html', 'master.html'].forEach(f => {
    const srcFile = path.join(srcIb, f);
    const destFile = path.join(destIb, f);
    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      console.log(`Synchronized apps/Invoice Builder/${f}`);
    }
  });
}

console.log(`Cache buster finished successfully with timestamp: ${newTs}`);
