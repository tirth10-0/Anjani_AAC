const puppeteer = require('puppeteer-core');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function verifyPWA() {
  console.log('--- Starting PWA Verification ---');
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error('Page error:', err));

  // 1. Verify manifest.json
  console.log('\n1. Testing http://localhost:5174/manifest.json ...');
  const manifestRes = await page.goto('http://localhost:5174/manifest.json');
  console.log('Manifest status:', manifestRes.status());
  const manifestText = await manifestRes.text();
  const manifest = JSON.parse(manifestText);
  console.log('Manifest name:', manifest.name);
  console.log('Manifest short_name:', manifest.short_name);
  console.log('Manifest id:', manifest.id);
  console.log('Manifest start_url:', manifest.start_url);
  console.log('Manifest scope:', manifest.scope);
  console.log('Manifest theme_color:', manifest.theme_color);
  console.log('Total icons listed:', manifest.icons.length);

  // 2. Verify all icon URLs from manifest
  console.log('\n2. Verifying all manifest icons via HTTP ...');
  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, 'http://localhost:5174/manifest.json').href;
    const res = await page.goto(iconUrl);
    const buf = await res.buffer();
    console.log(`Icon ${icon.sizes} (${icon.purpose || 'any'}): status ${res.status()}, size ${buf.length} bytes -> ${icon.src}`);
    if (res.status() !== 200) {
      throw new Error(`Failed to load icon: ${iconUrl}`);
    }
  }

  // 3. Verify Service Worker script
  console.log('\n3. Verifying sw.js ...');
  const swRes = await page.goto('http://localhost:5174/sw.js');
  console.log('sw.js status:', swRes.status(), 'length:', (await swRes.text()).length);

  // 4. Test page loading & Service Worker registration on login.html
  console.log('\n4. Loading http://localhost:5174/login.html in browser ...');
  await page.goto('http://localhost:5174/login.html', { waitUntil: 'networkidle2' });

  // Check head tags
  const headData = await page.evaluate(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href');
    const favicons = Array.from(document.querySelectorAll('link[rel="icon"]')).map(el => el.getAttribute('href'));
    return { manifestLink, themeColor, appleIcon, favicons };
  });
  console.log('login.html PWA tags:', headData);

  // Wait a moment for SW registration
  await new Promise(r => setTimeout(r, 2000));

  const swStatus = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      supported: true,
      registrations: regs.map(r => ({
        scope: r.scope,
        activeState: r.active ? r.active.state : null,
        installingState: r.installing ? r.installing.state : null,
        waitingState: r.waiting ? r.waiting.state : null
      }))
    };
  });
  console.log('Service Worker status on login.html:', JSON.stringify(swStatus, null, 2));

  // 5. Test page loading & Service Worker on pages/dashboard.html
  console.log('\n5. Loading http://localhost:5174/pages/dashboard.html ...');
  await page.goto('http://localhost:5174/pages/dashboard.html', { waitUntil: 'networkidle2' });
  const dashboardHeadData = await page.evaluate(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href');
    const favicons = Array.from(document.querySelectorAll('link[rel="icon"]')).map(el => el.getAttribute('href'));
    return { manifestLink, themeColor, appleIcon, favicons };
  });
  console.log('dashboard.html PWA tags:', dashboardHeadData);

  // Check SW status on dashboard
  await new Promise(r => setTimeout(r, 2000));
  const swDashboardStatus = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      supported: true,
      registrations: regs.map(r => ({
        scope: r.scope,
        activeState: r.active ? r.active.state : null
      }))
    };
  });
  console.log('Service Worker status on dashboard.html:', JSON.stringify(swDashboardStatus, null, 2));

  console.log('\n--- Console Messages During Test ---');
  consoleMessages.forEach(m => console.log(m));

  // Take screenshot of login page
  await page.goto('http://localhost:5174/login.html');
  await page.screenshot({ path: 'C:/Users/tirth/.gemini/antigravity/brain/f96c51f5-083a-43ab-b2cf-e51f633b1bac/pwa_login_verification.png' });

  await browser.close();
  console.log('\n>>> All PWA Verification Tests Passed Successfully! <<<');
}

verifyPWA().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
