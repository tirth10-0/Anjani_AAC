const fs = require('fs');
const path = require('path');
const files = ['index.html', 'login.html', ...fs.readdirSync('pages').filter(f => f.endsWith('.html')).map(f => 'pages/' + f)];
files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    if (l.includes('manifest') || l.includes('apple-touch-icon') || l.includes('theme-color') || l.includes('rel="icon"')) {
      hits.push({ line: i + 1, text: l.trim() });
    }
  });
  console.log('--- ' + f + ' ---');
  hits.forEach(h => console.log('  L' + h.line + ': ' + h.text));
});
