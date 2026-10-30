const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Login
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({ email: 'admin@anjani.test', password: 'Test@Agro2026!' });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await new Promise(r => setTimeout(r, 1200));

  await page.goto(`${BASE_URL}/pages/audit-logs.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  const dbCheck = await page.evaluate(async () => {
    let r1 = null, r2 = null, r3 = null;
    try {
      r1 = await window.dbClient.from('audit_logs').select('*').limit(5);
    } catch(e) { r1 = { error: e.message }; }
    try {
      r2 = await window.dbClient.from('rbac_audit_logs').select('*').limit(5);
    } catch(e) { r2 = { error: e.message }; }
    
    // Check localStorage
    const localKeys = Object.keys(localStorage);
    const auditKeys = localKeys.filter(k => k.toLowerCase().includes('audit'));
    const auditData = {};
    auditKeys.forEach(k => auditData[k] = localStorage.getItem(k));

    return {
      audit_logs: r1,
      rbac_audit_logs: r2,
      auditKeys,
      auditData
    };
  });
  console.log('DB and LocalStorage check:', JSON.stringify(dbCheck, null, 2));

  await browser.close();
})();
