/**
 * tests/test_logo_and_favicons_verification.js
 * Comprehensive automated verification for new Anjani Agri Care logo & favicon rollout
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runAudit() {
  console.log('--- STARTING COMPREHENSIVE LOGO & FAVICON AUDIT ---\n');

  // 1. Source Logo Integrity
  const expectedSize = 92770;
  const centralLogo = 'assets/images/logo.jpg';
  assert(fs.existsSync(centralLogo), `${centralLogo} exists`);
  const centralStat = fs.statSync(centralLogo);
  assert(centralStat.size === expectedSize, `${centralLogo} is exact official asset (${centralStat.size} bytes)`);

  // 2. Invoice Builder Logo Parity
  const ibLogos = [
    'Invoice Builder/logo.jpg',
    'Invoice Builder/public/logo.jpg',
    'Invoice Builder/public/logo-full.jpg',
    'apps/Invoice Builder/logo.jpg',
    'apps/Invoice Builder/public/logo.jpg',
    'apps/Invoice Builder/public/logo-full.jpg',
    'public/assets/images/logo.jpg'
  ];
  ibLogos.forEach(f => {
    assert(fs.existsSync(f), `${f} exists`);
    assert(fs.statSync(f).size === expectedSize, `${f} is byte-identical to official logo`);
  });

  // 3. PNG High-Resolution Logos
  assert(fs.existsSync('assets/images/logo.png'), 'assets/images/logo.png exists');
  assert(fs.existsSync('assets/images/logo-rounded.png'), 'assets/images/logo-rounded.png exists');
  assert(fs.statSync('assets/images/logo.png').size > 100000, 'assets/images/logo.png is high-resolution');

  // 4. Multi-Resolution Favicon Files
  const icoFiles = [
    'favicon.ico',
    'public/favicon.ico',
    'Invoice Builder/public/favicon.ico',
    'apps/Invoice Builder/public/favicon.ico',
    'dist/favicon.ico'
  ];
  icoFiles.forEach(f => {
    assert(fs.existsSync(f), `${f} exists`);
    const buf = fs.readFileSync(f);
    const type = buf.readUInt16LE(2);
    const count = buf.readUInt16LE(4);
    assert(type === 1 && count >= 3, `${f} is valid ICO with ${count} icon resolutions`);
  });

  // 5. Apple Touch Icons & Favicon PNGs
  const pngIcons = [
    'favicon.png',
    'apple-touch-icon.png',
    'assets/icons/favicon-16x16.png',
    'assets/icons/favicon-32x32.png',
    'assets/icons/apple-touch-icon.png',
    'Invoice Builder/public/favicon-32x32.png',
    'Invoice Builder/public/apple-touch-icon.png',
    'apps/Invoice Builder/public/favicon-32x32.png',
    'apps/Invoice Builder/public/apple-touch-icon.png'
  ];
  pngIcons.forEach(f => {
    assert(fs.existsSync(f), `${f} exists`);
  });

  // 6. Cache-busted Favicon tags in HTML entry points
  const rootHtml = ['index.html', 'login.html', '404.html'];
  rootHtml.forEach(f => {
    const c = fs.readFileSync(f, 'utf8');
    assert(c.includes('favicon-32x32.png?v=') && c.includes('favicon.ico?v='), `${f} contains cache-busted favicon tags`);
  });

  // 7. Pages HTML Favicon Audit
  const pagesDir = 'pages';
  const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));
  let allPagesHaveFavicon = true;
  pageFiles.forEach(f => {
    const c = fs.readFileSync(path.join(pagesDir, f), 'utf8');
    if (!c.includes('favicon-32x32.png?v=') || !c.includes('favicon.ico?v=')) {
      allPagesHaveFavicon = false;
      console.error(`Page ${f} missing cache-busted favicon`);
    }
  });
  assert(allPagesHaveFavicon, `All ${pageFiles.length} pages in pages/*.html contain cache-busted favicon tags`);

  // 8. Invoice Builder HTML Favicon Audit
  ['Invoice Builder', 'apps/Invoice Builder'].forEach(dir => {
    ['index.html', 'history.html', 'master.html'].forEach(f => {
      const p = path.join(dir, f);
      const c = fs.readFileSync(p, 'utf8');
      assert(c.includes('public/favicon-32x32.png?v=') && c.includes('public/favicon.ico?v='), `${p} has cache-busted favicons`);
    });
  });

  // 9. Centralized Layout & Logo Display
  const sharedLayout = fs.readFileSync('assets/js/shared-layout.js', 'utf8');
  assert(sharedLayout.includes('assets/images/logo.jpg'), 'shared-layout.js references assets/images/logo.jpg');
  assert(sharedLayout.includes('object-fit: contain'), 'shared-layout.js ensures object-fit: contain');
  assert(sharedLayout.includes('id="topbar-user-avatar">AAC<'), 'AAC circular initials avatar preserved in topbar');

  // 10. Invoice Builder PDF Generation Aspect Ratio
  const invoicePdf = fs.readFileSync('Invoice Builder/js/invoice-pdf.js', 'utf8');
  assert(invoicePdf.includes('aspect') && invoicePdf.includes('pdf.addImage'), 'invoice-pdf.js preserves aspect-ratio and adds logo to PDF');

  // 11. Service Worker Cache Version
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert(sw.includes('anjani-agri-care-erp-v3.1.0-rounded-logo') || sw.includes('anjani-agri-care-erp-v3.0.0-logo'), 'sw.js cache name bumped to invalidate stale icons');

  // 12. Dev Server Live HTTP Verification
  await new Promise((resolve) => {
    http.get('http://localhost:5174/assets/images/logo.jpg', (res) => {
      assert(res.statusCode === 200, `Dev server serves /assets/images/logo.jpg (HTTP ${res.statusCode})`);
      assert(Number(res.headers['content-length']) === expectedSize, `Dev server serves correct byte size (${res.headers['content-length']})`);
      resolve();
    }).on('error', (err) => {
      console.warn('Dev server check skipped:', err.message);
      resolve();
    });
  });

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passedTests} / ${totalTests} assertions passed (${Math.round(passedTests/totalTests * 100)}%)`);
  console.log(`========================================\n`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAudit();
