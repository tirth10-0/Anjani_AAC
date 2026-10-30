const fs = require('fs');
const path = require('path');

let passed = 0;
let total = 0;

function assert(cond, msg) {
  total++;
  if (cond) {
    passed++;
    console.log(`[PASS] ${msg}`);
  } else {
    console.error(`[FAIL] ${msg}`);
  }
}

// Inspect PNG header and chunks
function checkPngTransparency(filePath) {
  assert(fs.existsSync(filePath), `File exists: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  // PNG signature
  assert(buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a', `${filePath} has valid PNG signature`);
  // Color type is at byte 25 (0 = grayscale, 2 = RGB, 3 = indexed, 4 = grayscale+alpha, 6 = RGBA)
  const colorType = buf[25];
  assert(colorType === 6 || colorType === 3, `${filePath} color type supports transparency (colorType=${colorType})`);
}

console.log('--- AUDITING ROUNDED CORNERS, FAVICONS & MOBILE PWA ICONS ---\n');

// 1. Verify PNG icon files have alpha channel
const iconsToCheck = [
  'favicon.png',
  'public/favicon.png',
  'apple-touch-icon.png',
  'public/apple-touch-icon.png',
  'assets/icons/favicon-16x16.png',
  'assets/icons/favicon-32x32.png',
  'assets/icons/favicon-48x48.png',
  'assets/icons/icon-192x192.png',
  'assets/icons/icon-512x512.png',
  'assets/icons/icon-maskable-192x192.png',
  'assets/icons/icon-maskable-512x512.png',
  'Invoice Builder/public/favicon-32x32.png',
  'Invoice Builder/public/apple-touch-icon.png',
  'Invoice Builder/public/icon-192.png',
  'Invoice Builder/public/icon-512.png'
];

iconsToCheck.forEach(checkPngTransparency);

// 2. Audit PWA Manifest
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert(manifest.name.includes('Anjani Agri Care'), `Manifest name contains Anjani Agri Care: ${manifest.name}`);
assert(manifest.short_name.includes('Anjani') || manifest.short_name.includes('AAC'), `Manifest short_name valid: ${manifest.short_name}`);
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 8, `Manifest has ${manifest.icons.length} icon declarations`);
manifest.icons.forEach(icon => {
  const iconPath = icon.src.replace(/^\.\//, '').replace(/^\//, '');
  assert(fs.existsSync(iconPath), `Manifest icon exists: ${iconPath} (${icon.sizes})`);
});

// 3. Audit CSS No-Double-Border and Rounded Styling
const styleCss = fs.readFileSync('assets/css/style.css', 'utf8');
assert(styleCss.includes('.sidebar-logo') && styleCss.includes('border-radius: 12px'), 'style.css defines rounded .sidebar-logo (12px)');
assert(styleCss.includes('.sidebar-logo img') && styleCss.includes('border: none'), 'style.css ensures .sidebar-logo img has border: none');

const responsiveCss = fs.readFileSync('assets/css/responsive.css', 'utf8');
assert(responsiveCss.includes('.topbar-mobile-brand .topbar-logo') && responsiveCss.includes('border-radius: 8px'), 'responsive.css defines rounded .topbar-logo (8px)');
assert(responsiveCss.includes('.topbar-mobile-brand .topbar-logo') && responsiveCss.includes('border: none'), 'responsive.css enforces border: none on mobile brand logo container');

const ibIndex = fs.readFileSync('Invoice Builder/index.html', 'utf8');
assert(!ibIndex.includes('border: 1px solid var(--border);flex-shrink:0;background:#ffffff;padding:2px;" onerror="this.onerror=null; this.src=\'logo.jpg\';"'), 'Invoice Builder index.html navbar-logo has no double border');

// 4. Audit Removal of "Install App" button across all screen resolutions
const sharedLayoutJs = fs.readFileSync('assets/js/shared-layout.js', 'utf8');
assert(!sharedLayoutJs.includes('id="pwa-install-btn"'), 'Topbar HTML has no pwa-install-btn element');
assert(!sharedLayoutJs.includes('id="user-install-app-btn"'), 'User dropdown has no user-install-app-btn');
assert(!sharedLayoutJs.includes('id="pwa-install-modal"'), 'Layout has no pwa-install-modal overlay');
assert(!sharedLayoutJs.includes('Install App'), 'Layout has no "Install App" button text');
assert(!sharedLayoutJs.includes('setupPwaInstallButton'), 'Layout does not initialize any install buttons');

console.log(`\n========================================`);
console.log(`ROUNDED ICONS AUDIT: ${passed} / ${total} passed (${Math.round(passed/total * 100)}%)`);
console.log(`========================================\n`);

if (passed === total) process.exit(0);
else process.exit(1);
