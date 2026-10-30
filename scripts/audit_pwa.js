const fs = require('fs');
const path = require('path');

const files = ['index.html', 'login.html', ...fs.readdirSync('pages').filter(f => f.endsWith('.html')).map(f => 'pages/' + f)];
console.log('Total HTML pages:', files.length);

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const manifests = content.match(/<link[^>]+rel=["']manifest["'][^>]*>/gi) || [];
  const icons = content.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi) || [];
  const appleIcons = content.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/gi) || [];
  const themeColors = content.match(/<meta[^>]+name=["']theme-color["'][^>]*>/gi) || [];
  
  console.log(file.padEnd(30), `manifests: ${manifests.length}, icons: ${icons.length}, appleIcons: ${appleIcons.length}, themeColor: ${themeColors.length}`);
  if (manifests.length > 1) {
    console.log('  -> Duplicate manifests in', file, manifests);
  }
});
