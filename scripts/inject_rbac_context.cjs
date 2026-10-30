const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pagesDir = path.join(rootDir, 'pages');

function processFile(filePath, isRoot = false) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('rbac-context.js')) return;

  const scriptTag = isRoot
    ? '<script src="assets/js/rbac-context.js?v=1791792900858"></script>'
    : '<script src="../assets/js/rbac-context.js?v=1791792900858"></script>';

  if (content.includes('tenant-context.js')) {
    content = content.replace(/(<script src="[^"]*tenant-context\.js[^"]*"><\/script>)/i, `$1\n  ${scriptTag}`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Injected rbac-context.js into:', path.basename(filePath));
  } else if (content.includes('shared-layout.js')) {
    content = content.replace(/(<script src="[^"]*shared-layout\.js[^"]*")/i, `${scriptTag}\n  $1`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Injected rbac-context.js before shared-layout in:', path.basename(filePath));
  }
}

// Process pages
fs.readdirSync(pagesDir).filter(f => f.endsWith('.html')).forEach(f => {
  processFile(path.join(pagesDir, f), false);
});

// Process root pages
['index.html'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) processFile(p, true);
});

console.log('Finished injecting rbac-context.js.');
