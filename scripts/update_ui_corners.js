const fs = require('fs');

// 1. login.html
let login = fs.readFileSync('login.html', 'utf8');
login = login.replace(
  /style="background:#ffffff; border:1px solid #e2e8f0;[^"]*"/,
  'style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:3px; box-shadow:0 2px 8px rgba(0,0,0,0.06);"'
);
login = login.replace(
  /style="width: 100%; height: 100%; object-fit: contain; border-radius: 10px;"/,
  'style="width: 100%; height: 100%; object-fit: contain; border-radius: 12px;"'
);
fs.writeFileSync('login.html', login, 'utf8');
console.log('Updated login.html');

// 2. index.html loading logo
let idx = fs.readFileSync('index.html', 'utf8');
idx = idx.replace(
  /border-radius:22px;/,
  'border-radius:22px;'
);
idx = idx.replace(
  /style="width: 100%; height: 100%; object-fit: contain; border-radius: 18px;"/,
  'style="width: 100%; height: 100%; object-fit: contain; border-radius: 18px;"'
);
fs.writeFileSync('index.html', idx, 'utf8');
console.log('Updated index.html');

// 3. Invoice Builder index.html, history.html, master.html navbar logo
['Invoice Builder', 'apps/Invoice Builder'].forEach(dir => {
  ['index.html', 'history.html', 'master.html'].forEach(f => {
    const p = `${dir}/${f}`;
    if (!fs.existsSync(p)) return;
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(
      /border-radius:10px;border:1px solid var\(--border\);/g,
      'border-radius:12px;border:1px solid var(--border);'
    );
    html = html.replace(
      /border-radius:14px;border:1.5px solid var\(--border\);/g,
      'border-radius:16px;border:1.5px solid var(--border);'
    );
    fs.writeFileSync(p, html, 'utf8');
    console.log(`Updated ${p}`);
  });
});
