const fs = require('fs');
const path = require('path');
const pagesDir = path.join(__dirname, '..', 'pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const filePath = path.join(pagesDir, f);
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('tenant-context.js')) {
    content = content.replace(
      /<script src="(?:\.\.\/)?assets\/js\/shared-layout\.js/i,
      '<script src="../assets/js/tenant-context.js?v=1791791367657"></script>\n  <script src="../assets/js/shared-layout.js'
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Injected tenant-context.js into:', f);
  }
});
console.log('Finished injecting tenant-context.js across all pages.');
