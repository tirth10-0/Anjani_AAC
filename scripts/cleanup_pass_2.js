const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [search, replace] of replacements) {
    if (typeof search === 'string') {
      if (content.includes(search)) {
        content = content.split(search).join(replace);
        changed = true;
      }
    } else if (search instanceof RegExp) {
      if (search.test(content)) {
        content = content.replace(search, replace);
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
    return true;
  }
  return false;
}

replaceInFile('index.html', [
  ['Afield Crop Care ERP: Internal Inventory & Business Management.', 'Estimate ERP: Internal Inventory & Business Management.']
]);

const cssFiles = [
  'apps/Invoice Builder/css/main.css',
  'apps/Invoice Builder/css/override.css',
  'Invoice Builder/css/main.css',
  'Invoice Builder/css/override.css',
  'assets/css/tables.css'
];
cssFiles.forEach(f => {
  replaceInFile(f, [
    [/AFIELD CROP CARE UI COMPONENT SYSTEM/g, 'ESTIMATE UI COMPONENT SYSTEM'],
    [/AFIELD CROP CARE OFFICIAL PALETTE/g, 'ESTIMATE OFFICIAL PALETTE']
  ]);
});

const invDirs = ['Invoice Builder', 'apps/Invoice Builder'];
for (const d of invDirs) {
  replaceInFile(path.join(d, 'db.json'), [
    ['\\"CompanyName\\":\\"Afield Crop Care\\"', '\\"CompanyName\\":\\"Estimate\\"'],
    ['\\"company\\":\\"Afield Crop Care\\"', '\\"company\\":\\"Estimate\\"'],
    ['\\"Signatory\\":\\"Afield Crop Care\\"', '\\"Signatory\\":\\"Estimate\\"'],
    ['\\"signatory\\":\\"Afield Crop Care\\"', '\\"signatory\\":\\"Estimate\\"']
  ]);
  replaceInFile(path.join(d, 'js/history.js'), [
    ['* Afield Crop Care ERP', '* Estimate ERP']
  ]);
  replaceInFile(path.join(d, 'js/master.js'), [
    ['* Afield Crop Care ERP', '* Estimate ERP']
  ]);
  replaceInFile(path.join(d, 'package.json'), [
    ['Invoice Builder Backend for Afield Crop Care', 'Invoice Builder Backend for Estimate']
  ]);
  replaceInFile(path.join(d, 'server.js'), [
    ['Afield Crop Care Invoice Server', 'Estimate Invoice Server']
  ]);
}

console.log('Pass 2 completed.');
