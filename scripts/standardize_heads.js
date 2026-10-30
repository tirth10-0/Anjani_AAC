const fs = require('fs');
const path = require('path');

const rootPages = ['index.html', 'login.html'];
const subPages = fs.readdirSync('pages').filter(f => f.endsWith('.html')).map(f => 'pages/' + f);

function cleanHead(filePath, isRoot) {
  let content = fs.readFileSync(filePath, 'utf8');
  const relPrefix = isRoot ? '.' : '..';

  const pwaBlock = `  <meta name="theme-color" content="#0C3925">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Afield ERP">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="${relPrefix}/manifest.json">
  <link rel="icon" type="image/png" sizes="32x32" href="${relPrefix}/assets/icons/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${relPrefix}/assets/icons/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="${relPrefix}/assets/icons/apple-touch-icon.png">`;

  // Remove existing manifest, theme-color, mobile-web-app-capable, apple-touch-icon, and icon tags
  content = content.replace(/[ \t]*<link[^>]+rel=["']manifest["'][^>]*>\r?\n?/gi, '');
  content = content.replace(/[ \t]*<meta[^>]+name=["']theme-color["'][^>]*>\r?\n?/gi, '');
  content = content.replace(/[ \t]*<meta[^>]+name=["']mobile-web-app-capable["'][^>]*>\r?\n?/gi, '');
  content = content.replace(/[ \t]*<meta[^>]+name=["']apple-mobile-web-app-[^"']+["'][^>]*>\r?\n?/gi, '');
  content = content.replace(/[ \t]*<link[^>]+rel=["']apple-touch-icon["'][^>]*>\r?\n?/gi, '');
  content = content.replace(/[ \t]*<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\r?\n?/gi, '');

  // Insert pwaBlock just before </head>
  content = content.replace('</head>', `${pwaBlock}\n</head>`);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Standardized PWA tags in:', filePath);
}

rootPages.forEach(p => cleanHead(p, true));
subPages.forEach(p => cleanHead(p, false));
