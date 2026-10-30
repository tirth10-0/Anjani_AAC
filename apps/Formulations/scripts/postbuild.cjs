const fs = require('fs');
const path = require('path');

const srcHtml = path.join(__dirname, '../dist/index.html');
const destHtml = path.join(__dirname, '../../../pages/formulations.html');
const srcAssetsDir = path.join(__dirname, '../dist/assets');
const destAssetsDir = path.join(__dirname, '../../../assets/formulations-build');

console.log('Running postbuild copy script...');

// 1. Copy index.html to pages/formulations.html
if (fs.existsSync(srcHtml)) {
  let html = fs.readFileSync(srcHtml, 'utf8');
  
  // Extract script and css paths from dist/index.html
  const jsMatch = html.match(/src="[^"]*\/assets\/([^"]+\.js)"/);
  const cssMatch = html.match(/href="[^"]*\/assets\/([^"]+\.css)"/);
  
  const jsFileName = jsMatch ? jsMatch[1] : 'index.js';
  const cssFileName = cssMatch ? cssMatch[1] : 'index.css';

  const fullHtml = `<!doctype html>
<html lang="en">
  <head>
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <style id="anti-fouc">
    /* Anti-FOUC: hide body until local CSS fully paints */
    html { visibility: hidden; }
    html.css-ready { visibility: visible; }
    /* Safety fallback: always show after 600ms no matter what */
  </style>
  <script>
    (function(){
      /* Reveal as soon as all local stylesheets are done loading */
      function reveal(){ document.documentElement.classList.add('css-ready'); }
      /* Wait for every local link[rel=stylesheet] in this document */
      window.addEventListener('load', reveal);
      /* Fallback: 700ms hard cap so network issues don't freeze the screen */
      setTimeout(reveal, 700);
    })();
  </script>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Anjani Agri Care ERP - Formulations</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="../assets/js/database.js?v=1791036879151"></script>
    <script src="../assets/js/react-interceptor.js?v=1791036879151"></script>
    <link rel="manifest" href="../manifest.json">
    <meta name="theme-color" content="#0C3925">
    <script type="module" crossorigin src="../assets/formulations-build/${jsFileName}"></script>
    <link rel="stylesheet" href="../assets/formulations-build/${cssFileName}?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/style.css?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/dashboard.css?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/forms.css?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/tables.css?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/responsive.css?v=1791036879151">
    <link rel="stylesheet" href="../assets/css/components/search-select.css?v=1791036879151">
    <link rel="icon" type="image/png" href="../assets/images/logo.png">
    <link rel="apple-touch-icon" href="../assets/images/logo.png">
</head>
  <body>
  <div class="app-layout" id="app-layout">
    <script src="../assets/js/shared-layout.js?v=1791036879151"></script>
    <script>
      function initFormulationsLayout() {
        if (window.LAYOUT && typeof window.LAYOUT.injectLayout === 'function') {
          LAYOUT.injectLayout('Formulations', 'Operations / Formulations');
          const path = window.location.pathname.split('/').pop() || 'dashboard.html';
          document.querySelectorAll('.nav-item').forEach(item => {
            const href = item.getAttribute('href') || '';
            item.classList.toggle('active', href === path);
          });
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormulationsLayout);
      } else {
        initFormulationsLayout();
      }
    </script>
    <main class="main-content" id="main-content">
      <div class="page-body">
    <div id="root"></div>
      </div>
    </main>
  </div>
  <script src="../assets/js/utils.js?v=1791036879151"></script>
  <script src="../assets/js/app.js?v=1791036879151"></script>
  </body>
</html>
`;

  fs.writeFileSync(destHtml, fullHtml);
  console.log(`✓ Injected ERP layouts, stylesheets, and copied index.html to pages/formulations.html`);
} else {
  console.error(`Error: dist/index.html not found!`);
  process.exit(1);
}

// 2. Ensure destAssetsDir exists and clean it
if (fs.existsSync(destAssetsDir)) {
  fs.rmSync(destAssetsDir, { recursive: true, force: true });
}
fs.mkdirSync(destAssetsDir, { recursive: true });

// 3. Copy assets files
if (fs.existsSync(srcAssetsDir)) {
  const files = fs.readdirSync(srcAssetsDir);
  files.forEach(file => {
    fs.copyFileSync(path.join(srcAssetsDir, file), path.join(destAssetsDir, file));
  });
  console.log(`✓ Copied ${files.length} assets to assets/formulations-build`);
} else {
  console.warn(`Warning: dist/assets not found.`);
}
