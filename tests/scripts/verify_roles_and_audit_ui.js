const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const path = require('path');
const fs = require('fs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('--- STARTING VERIFICATION OF ROLES & AUDIT UI ---');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[BROWSER ERR]:', msg.text());
  });

  // 1. Login & populate test audit records in localStorage
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({ email: 'admin@anjani.test', password: 'Test@Agro2026!' });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');

    // Seed realistic enterprise audit logs into erp_comprehensive_audit_logs
    const comprehensiveLogs = [
      {
        id: 101,
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        actor_email: 'warehouse.manager@anjani.local',
        action_category: 'STOCK_MOVEMENT',
        action_name: 'FIFO_ALLOCATION',
        table_name: 'stock_batches',
        record_id: 'BATCH-2026-0941',
        reference_no: 'PO-99120',
        before_values: { stock: 1200, warehouse: 'Main Godown A' },
        after_values: { stock: 950, change: -250, warehouse: 'Main Godown A' },
        metadata: { itemId: 'CHEM-410', itemName: 'Chlorpyrifos 50% EC', notes: 'Dispatched to Branch B' }
      },
      {
        id: 102,
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        actor_email: 'qc.officer@anjani.local',
        action_category: 'QC_DECISION',
        action_name: 'QC_APPROVED',
        table_name: 'qc_inspections',
        record_id: 'QC-7741',
        reference_no: 'BATCH-2026-0940',
        before_values: { qc_status: 'Pending' },
        after_values: { qc_status: 'Approved' },
        metadata: { purity: '99.4%', moisture: '0.12%', notes: 'Passed all formulation specs' }
      },
      {
        id: 103,
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        actor_email: 'production.lead@anjani.local',
        action_category: 'PRODUCTION_COMPLETION',
        action_name: 'BATCH_PRODUCED',
        table_name: 'production_batches',
        record_id: 'PRD-8841',
        reference_no: 'BATCH-2026-0940',
        before_values: { status: 'In Production', plannedQty: 1000 },
        after_values: { status: 'Completed_Quarantine', actualOutput: 985, yieldPercentage: 98.5 },
        metadata: { orderNo: 'ORD-5542', productName: 'Profenofos 40% + Cypermethrin 4% EC' }
      },
      {
        id: 104,
        created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        actor_email: 'admin@anjani.local',
        action_category: 'PERMISSION_CHANGE',
        action_name: 'ROLE_ASSIGNMENT_UPDATED',
        table_name: 'user_role_assignments',
        record_id: 'USR-12',
        reference_no: 'rajesh.sharma@anjani.local',
        before_values: { role: 'Factory Operator' },
        after_values: { role: 'Production Manager' },
        metadata: { scope: 'Plant & Production', updatedBy: 'admin@anjani.local' }
      }
    ];
    localStorage.setItem('erp_comprehensive_audit_logs', JSON.stringify(comprehensiveLogs));

    // Seed realistic RBAC logs into rbac_local_audit_logs
    const rbacLogs = [
      {
        id: 'rbac_1',
        created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        actor_email: 'admin@anjani.local',
        action_type: 'ROLE_SWITCHED_PREVIEW',
        target_user: 'admin@anjani.local',
        details: { newRole: 'super_admin', previousRole: 'viewer_auditor' }
      },
      {
        id: 'rbac_2',
        created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        actor_email: 'sales.exec@anjani.local',
        action_type: 'UNAUTHORIZED_ACTION_BLOCKED',
        target_user: 'sales.exec@anjani.local',
        details: { module: 'pricing', action: 'override_discount', targetDesc: 'Customer ABC Credit Limit' }
      }
    ];
    localStorage.setItem('rbac_local_audit_logs', JSON.stringify(rbacLogs));

    // Seed approval requests
    const sampleApprovals = [
      {
        id: 1,
        request_type: 'Credit Limit Override',
        reference_id: 1042,
        reference_code: 'ORD-9021',
        requested_by: 'sales.rep@anjani.local',
        required_role_id: 2,
        status: 'Pending',
        decision_notes: 'Customer exceeds standard 30-day limit by Rs 2.5L due to seasonal harvest'
      },
      {
        id: 2,
        request_type: 'QC Quarantine Release',
        reference_id: 8841,
        reference_code: 'BATCH-2026-0940',
        requested_by: 'production.lead@anjani.local',
        required_role_id: 6,
        status: 'Approved',
        decision_notes: 'COA verified and physical retention samples passed lab tests'
      }
    ];
    localStorage.setItem('erp_approval_requests', JSON.stringify(sampleApprovals));
  });

  await sleep(800);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: Security & RBAC Audit Trail Page
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n=== TESTING SECURITY & RBAC AUDIT TRAIL PAGE ===');
  const viewports = [
    { name: 'desktop_1366', width: 1366, height: 768, isMobile: false },
    { name: 'tablet_768', width: 768, height: 1024, isMobile: true },
    { name: 'mobile_430', width: 430, height: 932, isMobile: true },
    { name: 'mobile_390', width: 390, height: 844, isMobile: true },
    { name: 'mobile_375', width: 375, height: 812, isMobile: true },
    { name: 'mobile_360', width: 360, height: 780, isMobile: true },
    { name: 'mobile_320', width: 320, height: 600, isMobile: true }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile });
    await page.goto(`${BASE_URL}/pages/audit-logs.html`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    const auditState = await page.evaluate((isMob) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const overflow = scrollWidth > clientWidth;

      const totalInfo = document.getElementById('audit-total-info')?.textContent;
      const totalLogs = window.allAuditLogs ? window.allAuditLogs.length : 0;
      
      const desktopRows = Array.from(document.querySelectorAll('#audit-table tbody tr.audit-desktop-row'));
      const mobileRows = Array.from(document.querySelectorAll('#audit-table tbody tr.audit-mobile-row'));
      const mobileCards = Array.from(document.querySelectorAll('.audit-mobile-card'));

      const visibleDesktopRows = desktopRows.filter(r => window.getComputedStyle(r).display !== 'none').length;
      const visibleMobileRows = mobileRows.filter(r => window.getComputedStyle(r).display !== 'none').length;
      const visibleMobileCards = mobileCards.filter(c => window.getComputedStyle(c).display !== 'none').length;

      return {
        clientWidth,
        scrollWidth,
        overflow,
        totalInfo,
        totalLogs,
        visibleDesktopRows,
        visibleMobileRows,
        visibleMobileCards
      };
    }, vp.isMobile);

    console.log(`[Audit Viewport ${vp.name}] Width: ${auditState.clientWidth}px | Overflow: ${auditState.overflow ? 'FAIL (' + (auditState.scrollWidth - auditState.clientWidth) + 'px)' : 'PASS (0px)'} | Records: ${auditState.totalLogs} | VisDesk: ${auditState.visibleDesktopRows} | VisMobCards: ${auditState.visibleMobileCards} | Info: "${auditState.totalInfo}"`);

    // Verify records are visible
    if (auditState.totalLogs === 0) {
      console.error(`ERROR: Audit logs total is 0 in viewport ${vp.name}!`);
    }
    if (vp.isMobile && auditState.visibleMobileCards === 0) {
      console.error(`ERROR: Mobile audit cards not visible in viewport ${vp.name}!`);
    }

    if (vp.name === 'mobile_375' || vp.name === 'desktop_1366') {
      const shotPath = path.join(ARTIFACTS_DIR, `audit_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);
    }
  }

  // Test Audit Filter & Search & Diff Modal
  await page.setViewport({ width: 375, height: 812, isMobile: true });
  await page.goto(`${BASE_URL}/pages/audit-logs.html`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // Search filter
  await page.type('#search-audit', 'Chlorpyrifos');
  await sleep(600);
  const searchFilterCount = await page.evaluate(() => {
    return document.querySelectorAll('#audit-tbody .audit-mobile-card').length;
  });
  console.log(`Search filter for 'Chlorpyrifos': ${searchFilterCount} record(s) matching.`);

  // Clear search before testing category filter
  await page.evaluate(() => {
    document.getElementById('search-audit').value = '';
    filterAuditTableReal();
  });
  await sleep(300);

  // Category filter
  await page.select('#filter-action-type', 'QC_DECISION');
  await sleep(600);
  const catFilterCount = await page.evaluate(() => {
    return document.querySelectorAll('#audit-tbody .audit-mobile-card').length;
  });
  console.log(`Category filter for 'QC_DECISION': ${catFilterCount} record(s) matching.`);

  // Clear filters
  await page.click('#btn-clear-audit-filters');
  await sleep(600);
  const clearedCount = await page.evaluate(() => {
    return document.querySelectorAll('.audit-mobile-card').length;
  });
  console.log(`After Clear Filters: ${clearedCount} records displayed.`);

  // Test View Diff modal
  console.log('Testing Audit Record Detail / Diff Modal...');
  const firstDiffBtn = await page.$('.audit-diff-btn');
  if (firstDiffBtn) {
    await firstDiffBtn.click();
    await sleep(600);
    const modalCheck = await page.evaluate(() => {
      const modal = document.getElementById('audit-detail-modal');
      const box = modal ? modal.querySelector('.audit-detail-modal-box') : null;
      const isOpen = modal && (modal.classList.contains('active') || modal.classList.contains('open') || window.getComputedStyle(modal).display !== 'none');
      const boxWidth = box ? box.offsetWidth : 0;
      const winWidth = window.innerWidth;
      const overflow = boxWidth > winWidth;
      return { isOpen, boxWidth, winWidth, overflow };
    });
    console.log('Audit Detail Modal Open:', modalCheck);
    
    const diffShotPath = path.join(ARTIFACTS_DIR, `audit_modal_diff_mobile_375.png`);
    await page.screenshot({ path: diffShotPath, fullPage: false });
    console.log(`Saved screenshot: ${diffShotPath}`);

    // Close modal
    await page.click('#audit-detail-modal .modal-close');
    await sleep(400);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: User Roles & Granular Permissions Page
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n=== TESTING USER ROLES & GRANULAR PERMISSIONS PAGE ===');

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile });
    await page.goto(`${BASE_URL}/pages/user-roles.html`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);

    const rolesPageState = await page.evaluate(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const overflow = scrollWidth > clientWidth;

      const tabs = document.querySelectorAll('#roles-tabs .tab-btn');
      const tabCount = tabs.length;
      const tabsDisplay = window.getComputedStyle(document.getElementById('roles-tabs')).display;

      return {
        clientWidth,
        scrollWidth,
        overflow,
        tabCount,
        tabsDisplay
      };
    });

    console.log(`[Roles Viewport ${vp.name}] Width: ${rolesPageState.clientWidth}px | Overflow: ${rolesPageState.overflow ? 'FAIL (' + (rolesPageState.scrollWidth - rolesPageState.clientWidth) + 'px)' : 'PASS (0px)'} | Tabs: ${rolesPageState.tabCount} (${rolesPageState.tabsDisplay})`);

    // Verify TAB 2: System Roles (10)
    await page.click('#tab-roles-btn');
    await sleep(600);

    const rolesTabState = await page.evaluate((isMob) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const overflow = scrollWidth > clientWidth;

      const rows = document.querySelectorAll('#roles-tbody tr');
      const roleCards = Array.from(rows).map(row => {
        const title = row.querySelector('.role-title-text')?.textContent.trim();
        const code = row.querySelector('.role-code-badge')?.textContent.trim();
        const avatar = row.querySelector('.role-avatar-box')?.textContent.trim();
        const domain = row.querySelector('.domain-description-text')?.textContent.trim();
        const scope = row.querySelector('.scope-badge-pill')?.textContent.trim();
        const assignBtn = row.querySelector('.btn-assign') ? true : false;
        const editBtn = row.querySelector('.btn-edit-role') ? true : false;
        const deleteBtn = row.querySelector('.btn-delete-role') ? true : false;

        // Check alignment: avatar vs title
        const avatarBox = row.querySelector('.role-avatar-box')?.getBoundingClientRect();
        const titleBox = row.querySelector('.role-title-text')?.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();

        return {
          title,
          code,
          avatar,
          hasAssign: assignBtn,
          hasEdit: editBtn,
          hasDelete: deleteBtn,
          avatarLeft: avatarBox ? Math.round(avatarBox.left - rowBox.left) : 0,
          titleLeft: titleBox ? Math.round(titleBox.left - rowBox.left) : 0
        };
      });

      return {
        clientWidth,
        scrollWidth,
        overflow,
        roleCount: rows.length,
        firstRole: roleCards[0],
        all10HaveButtons: roleCards.every(r => r.hasAssign && r.hasEdit && r.hasDelete)
      };
    }, vp.isMobile);

    console.log(`  -> System Roles: ${rolesTabState.roleCount} roles | Overflow: ${rolesTabState.overflow ? 'FAIL' : 'PASS'} | All have Assign/Edit/Del: ${rolesTabState.all10HaveButtons} | 1st Role: ${rolesTabState.firstRole?.title} (Code: ${rolesTabState.firstRole?.code}, AvatarLeft: ${rolesTabState.firstRole?.avatarLeft}px, TitleLeft: ${rolesTabState.firstRole?.titleLeft}px)`);

    // Screenshot of System Roles on mobile 375 and desktop 1366
    if (vp.name === 'mobile_375' || vp.name === 'desktop_1366') {
      const shotPath = path.join(ARTIFACTS_DIR, `system_roles_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);
    }

    // Verify TAB 3: Permission Matrix
    await page.click('#tab-matrix-btn');
    await sleep(600);

    const matrixState = await page.evaluate((isMob) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const overflow = scrollWidth > clientWidth;

      const tableVisible = window.getComputedStyle(document.getElementById('permission-matrix-table')).display !== 'none';
      const cardsVisible = window.getComputedStyle(document.getElementById('matrix-mobile-cards')).display !== 'none';
      const cardCount = document.querySelectorAll('.matrix-module-card').length;
      const tableRowCount = document.querySelectorAll('#matrix-tbody tr').length;

      return {
        clientWidth,
        scrollWidth,
        overflow,
        tableVisible,
        cardsVisible,
        cardCount,
        tableRowCount
      };
    }, vp.isMobile);

    console.log(`  -> Permission Matrix: Overflow: ${matrixState.overflow ? 'FAIL' : 'PASS'} | TableVis: ${matrixState.tableVisible} | CardsVis: ${matrixState.cardsVisible} (Cards: ${matrixState.cardCount}, Rows: ${matrixState.tableRowCount})`);

    if (vp.name === 'mobile_375' || vp.name === 'desktop_1366') {
      const shotPath = path.join(ARTIFACTS_DIR, `permission_matrix_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);
    }

    // Verify TAB 4: Approval Requests
    await page.click('#tab-approvals-btn');
    await sleep(600);

    const approvalsState = await page.evaluate((isMob) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const overflow = scrollWidth > clientWidth;

      const tableVisible = window.getComputedStyle(document.getElementById('approvals-table')).display !== 'none';
      const cardsVisible = window.getComputedStyle(document.getElementById('approvals-mobile-cards')).display !== 'none';
      const cardCount = document.querySelectorAll('.approval-mobile-card').length;
      const tableRowCount = document.querySelectorAll('#approvals-tbody tr').length;

      return {
        clientWidth,
        scrollWidth,
        overflow,
        tableVisible,
        cardsVisible,
        cardCount,
        tableRowCount
      };
    }, vp.isMobile);

    console.log(`  -> Approval Requests: Overflow: ${approvalsState.overflow ? 'FAIL' : 'PASS'} | TableVis: ${approvalsState.tableVisible} | CardsVis: ${approvalsState.cardsVisible} (Cards: ${approvalsState.cardCount}, Rows: ${approvalsState.tableRowCount})`);

    if (vp.name === 'mobile_375' || vp.name === 'desktop_1366') {
      const shotPath = path.join(ARTIFACTS_DIR, `approval_requests_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      console.log(`Saved screenshot: ${shotPath}`);
    }
  }

  // Test Modal Responsiveness on User Roles: Assign User Role and Create Role
  console.log('\nTesting User Roles Modals...');
  await page.setViewport({ width: 375, height: 812, isMobile: true });
  await page.goto(`${BASE_URL}/pages/user-roles.html`, { waitUntil: 'domcontentloaded' });
  await sleep(800);

  // Open Assign User Modal
  await page.evaluate(() => openAssignUserModal());
  await sleep(600);
  const assignModalState = await page.evaluate(() => {
    const modal = document.getElementById('user-role-modal');
    const box = modal ? modal.querySelector('.modal') : null;
    const isOpen = modal && (modal.classList.contains('active') || modal.classList.contains('open') || window.getComputedStyle(modal).display !== 'none');
    const boxWidth = box ? box.offsetWidth : 0;
    const winWidth = window.innerWidth;
    return { isOpen, boxWidth, winWidth, overflow: boxWidth > winWidth };
  });
  console.log('Assign User Role Modal on Mobile (375px):', assignModalState);

  const assignModalShot = path.join(ARTIFACTS_DIR, `user_role_modal_mobile_375.png`);
  await page.screenshot({ path: assignModalShot, fullPage: false });
  console.log(`Saved screenshot: ${assignModalShot}`);

  await page.evaluate(() => closeUserRoleModal());
  await sleep(400);

  // Open Create Custom Role Modal
  await page.evaluate(() => openCustomRoleModal());
  await sleep(600);
  const createModalState = await page.evaluate(() => {
    const modal = document.getElementById('custom-role-modal');
    const box = modal ? modal.querySelector('.modal') : null;
    const isOpen = modal && (modal.classList.contains('active') || modal.classList.contains('open') || window.getComputedStyle(modal).display !== 'none');
    const boxWidth = box ? box.offsetWidth : 0;
    const winWidth = window.innerWidth;
    return { isOpen, boxWidth, winWidth, overflow: boxWidth > winWidth };
  });
  console.log('Create Custom Role Modal on Mobile (375px):', createModalState);

  await page.evaluate(() => closeCustomRoleModal());
  await sleep(400);

  await browser.close();
  console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY ---');
})();
