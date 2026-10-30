const fs = require('fs');
const path = require('path');

const TS = '1793361500000';

// 1. Root HTML files
['index.html', 'login.html', '404.html'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let html = fs.readFileSync(f, 'utf8');
  // Remove any old favicon tags
  html = html.replace(/<link rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>\s*/g, '');
  const newTags = `  <link rel="shortcut icon" href="./favicon.ico?v=${TS}">\n  <link rel="icon" type="image/png" sizes="32x32" href="./assets/icons/favicon-32x32.png?v=${TS}">\n  <link rel="icon" type="image/png" sizes="16x16" href="./assets/icons/favicon-16x16.png?v=${TS}">\n  <link rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png?v=${TS}">\n`;
  if (html.includes('<link rel="manifest"')) {
    html = html.replace(/(<link rel="manifest"[^>]*>\s*)/, `$1${newTags}`);
  } else {
    html = html.replace('</head>', `${newTags}</head>`);
  }
  fs.writeFileSync(f, html, 'utf8');
  console.log('Updated favicons in:', f);
});

// 2. Pages HTML files
const pagesDir = 'pages';
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir).forEach(f => {
    if (!f.endsWith('.html')) return;
    const p = path.join(pagesDir, f);
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(/<link rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>\s*/g, '');
    const newTags = `  <link rel="shortcut icon" href="../favicon.ico?v=${TS}">\n  <link rel="icon" type="image/png" sizes="32x32" href="../assets/icons/favicon-32x32.png?v=${TS}">\n  <link rel="icon" type="image/png" sizes="16x16" href="../assets/icons/favicon-16x16.png?v=${TS}">\n  <link rel="apple-touch-icon" sizes="180x180" href="../assets/icons/apple-touch-icon.png?v=${TS}">\n`;
    if (html.includes('<link rel="manifest"')) {
      html = html.replace(/(<link rel="manifest"[^>]*>\s*)/, `$1${newTags}`);
    } else {
      html = html.replace('</head>', `${newTags}</head>`);
    }
    fs.writeFileSync(p, html, 'utf8');
    console.log('Updated favicons in:', p);
  });
}

// 3. Invoice Builder HTML files (both folders)
['Invoice Builder', 'apps/Invoice Builder'].forEach(dir => {
  ['index.html', 'history.html', 'master.html'].forEach(f => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return;
    let html = fs.readFileSync(p, 'utf8');
    html = html.replace(/<link rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>\s*/g, '');
    const newTags = `  <link rel="shortcut icon" href="public/favicon.ico?v=${TS}">\n  <link rel="icon" type="image/png" sizes="32x32" href="public/favicon-32x32.png?v=${TS}">\n  <link rel="icon" type="image/png" sizes="16x16" href="public/favicon-16x16.png?v=${TS}">\n  <link rel="apple-touch-icon" href="public/apple-touch-icon.png?v=${TS}">\n`;
    if (html.includes('<link rel="manifest"')) {
      html = html.replace(/(<link rel="manifest"[^>]*>\s*)/, `$1${newTags}`);
    } else {
      html = html.replace('</head>', `${newTags}</head>`);
    }
    fs.writeFileSync(p, html, 'utf8');
    console.log('Updated favicons in:', p);
  });
});

// 4. apps/Formulations
const formIdx = 'apps/Formulations/index.html';
if (fs.existsSync(formIdx)) {
  let html = fs.readFileSync(formIdx, 'utf8');
  html = html.replace(/<link rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>\s*/g, '');
  const newTags = `  <link rel="shortcut icon" href="../../favicon.ico?v=${TS}">\n  <link rel="icon" type="image/png" sizes="32x32" href="../../assets/icons/favicon-32x32.png?v=${TS}">\n  <link rel="apple-touch-icon" href="../../assets/icons/apple-touch-icon.png?v=${TS}">\n`;
  html = html.replace('</head>', `${newTags}</head>`);
  html = html.replace('<title>Cyber-Agri Formulation System</title>', '<title>Anjani Agri Care - Formulation System</title>');
  fs.writeFileSync(formIdx, html, 'utf8');
  console.log('Updated favicons in:', formIdx);
}

// 5. Service Worker Bump
['sw.js', 'public/sw.js'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let sw = fs.readFileSync(f, 'utf8');
  sw = sw.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'anjani-agri-care-erp-v3.2.0-pwa-fix';`);
  fs.writeFileSync(f, sw, 'utf8');
  console.log('Bumped cache in:', f);
});

console.log('Favicon links and Service Worker cache successfully updated across all pages!');
