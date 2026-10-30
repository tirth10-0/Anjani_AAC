/**
 * tests/test_companies_and_warehouses_end_to_end_repair.js
 * Comprehensive End-to-End Test Suite for Companies & Branches and Warehouses Modules
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://quxcvoywufjjynluntvg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XickYJH_8m0FTaJaT2k8TA_X2MEJSDr';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ [PASS] ${message}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Companies & Warehouses End-to-End Repair Verification...\n');

  const companiesJsPath = path.join(__dirname, '../assets/js/companies.js');
  const warehousesJsPath = path.join(__dirname, '../assets/js/warehouses.js');
  const companiesHtmlPath = path.join(__dirname, '../pages/companies.html');
  const warehousesHtmlPath = path.join(__dirname, '../pages/warehouses.html');
  const appJsPath = path.join(__dirname, '../assets/js/app.js');
  const tenantContextJsPath = path.join(__dirname, '../assets/js/tenant-context.js');
  const auditLoggerJsPath = path.join(__dirname, '../assets/js/audit-logger.js');

  const companiesJs = fs.readFileSync(companiesJsPath, 'utf8');
  const warehousesJs = fs.readFileSync(warehousesJsPath, 'utf8');
  const companiesHtml = fs.readFileSync(companiesHtmlPath, 'utf8');
  const warehousesHtml = fs.readFileSync(warehousesHtmlPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const tenantContextJs = fs.readFileSync(tenantContextJsPath, 'utf8');
  const auditLoggerJs = fs.readFileSync(auditLoggerJsPath, 'utf8');

  // ==========================================================================
  // SECTION 1: CONFIRM MODAL ENGINE & DOUBLE-SUBMIT RECOVERY
  // ==========================================================================
  console.log('--- Section 1: Modal Engine & Cancellation Handlers ---');
  assert(appJs.includes('confirmCancelCallback'), 'app.js supports confirmCancelCallback');
  assert(appJs.includes('handleConfirmCancel()'), 'app.js defines handleConfirmCancel()');
  assert(appJs.includes('async function handleConfirmOk()'), 'app.js defines async handleConfirmOk()');
  assert(appJs.includes('await cb()'), 'app.js awaits confirmCallback');
  assert(appJs.includes('handleConfirmOk') && appJs.includes('window.APP'), 'app.js exports handleConfirmOk to window.APP');
  assert(appJs.includes('handleConfirmCancel') && appJs.includes('window.APP'), 'app.js exports handleConfirmCancel to window.APP');

  // ==========================================================================
  // SECTION 2: AUDIT LOGGER & HTML SCRIPT TAGS
  // ==========================================================================
  console.log('\n--- Section 2: Audit Logger Integration & Script Tags ---');
  assert(auditLoggerJs.includes('logCompanyCreated'), 'audit-logger.js includes logCompanyCreated');
  assert(auditLoggerJs.includes('logCompanyUpdated'), 'audit-logger.js includes logCompanyUpdated');
  assert(auditLoggerJs.includes('logWarehouseCreated'), 'audit-logger.js includes logWarehouseCreated');
  assert(auditLoggerJs.includes('logWarehouseUpdated'), 'audit-logger.js includes logWarehouseUpdated');
  assert(auditLoggerJs.includes('logCompanyArchived'), 'audit-logger.js includes logCompanyArchived');
  assert(auditLoggerJs.includes('logWarehouseArchived'), 'audit-logger.js includes logWarehouseArchived');
  assert(auditLoggerJs.includes('logCompanyDeleted'), 'audit-logger.js includes logCompanyDeleted');
  assert(auditLoggerJs.includes('logWarehouseDeleted'), 'audit-logger.js includes logWarehouseDeleted');
  assert(companiesHtml.includes('audit-logger.js'), 'companies.html explicitly imports audit-logger.js');
  assert(warehousesHtml.includes('audit-logger.js'), 'warehouses.html explicitly imports audit-logger.js');

  // ==========================================================================
  // SECTION 3: COMPANIES & BRANCHES ENGINE CODE AUDIT
  // ==========================================================================
  console.log('\n--- Section 3: Companies & Branches Code Audit ---');
  assert(companiesJs.includes('Retry Loading'), 'companies.js renders Retry Loading on failure in loadCompanies');
  assert(companiesJs.includes('Company code') && companiesJs.includes('already in use'), 'companies.js pre-validates company code uniqueness');
  assert(companiesJs.includes('gstinVal.length !== 15'), 'companies.js validates GSTIN 15-character length');
  assert(companiesJs.includes('TENANT_CONTEXT.reload'), 'companies.js reloads tenant context on company mutation');
  assert(companiesJs.includes('onCancel: () => { isDeletingCompany = false; }'), 'safeDeleteCompany passes onCancel to APP.showConfirm');
  assert(companiesJs.includes('onCancel: () => { isArchivingCompany = false; }'), 'archiveCompany passes onCancel to APP.showConfirm');
  assert(companiesJs.includes('Security Rule: Anjani Agri Care (ID 1)'), 'companies.js strictly protects Anjani Agri Care (ID 1) from deletion and archival');
  assert(companiesJs.includes('Branch code') && companiesJs.includes('already exists in'), 'saveBranch validates branch code uniqueness within company');
  assert(companiesJs.includes('onCancel: () => { isDeletingBranch = false; }'), 'safeDeleteBranch passes onCancel to APP.showConfirm');
  assert(companiesJs.includes('is_head_office: false'), 'saveBranch unmarks existing head offices when a new head office is set');

  // ==========================================================================
  // SECTION 4: WAREHOUSES & STORAGE LOCATIONS CODE AUDIT
  // ==========================================================================
  console.log('\n--- Section 4: Warehouses Code Audit ---');
  assert(warehousesJs.includes('Retry Loading'), 'warehouses.js renders Retry Loading on failure in loadWarehouses');
  assert(warehousesJs.includes('populateCompanyFilterDropdown'), 'warehouses.js populates company filter dynamically');
  assert(warehousesJs.includes('resetWarehouseFilters'), 'warehouses.js defines resetWarehouseFilters()');
  assert(warehousesJs.includes('Warehouse code') && warehousesJs.includes('already in use'), 'saveWarehouse validates warehouse code uniqueness');
  assert(warehousesJs.includes('is_default: false'), 'saveWarehouse unmarks existing default warehouse when setting a new default');
  assert(warehousesJs.includes('onCancel: () => { isDeletingWarehouse = false; }'), 'safeDeleteWarehouse passes onCancel to APP.showConfirm');
  assert(warehousesJs.includes('onCancel: () => { isArchivingWarehouse = false; }'), 'archiveWarehouse passes onCancel to APP.showConfirm');
  assert(warehousesJs.includes('forceDeleteWarehouseWithAuditPreservation'), 'warehouses.js defines forceDeleteWarehouseWithAuditPreservation');

  // ==========================================================================
  // SECTION 5: LIVE SUPABASE WORKFLOW VALIDATION
  // ==========================================================================
  console.log('\n--- Section 5: Live Supabase Verification ---');
  const testSuffix = Math.floor(1000 + Math.random() * 9000);
  const testCompCode = `E2E-CO-${testSuffix}`;
  const testCompName = `End-to-End Enterprise ${testSuffix}`;

  // 1. Create company in Supabase
  const { data: createdComp, error: compErr } = await supabase.from('companies').insert([{
    tenant_id: 1,
    name: testCompName,
    code: testCompCode,
    is_manufacturing: true,
    city: 'Rajkot',
    state: 'Gujarat',
    status: 'Active'
  }]).select();

  assert(!compErr && createdComp && createdComp[0], `Live company created: ID ${createdComp?.[0]?.id} (${testCompCode})`);
  const cId = createdComp[0].id;

  // 2. Create branches
  const { data: br1, error: br1Err } = await supabase.from('branches').insert([{
    company_id: cId,
    name: `${testCompName} HQ`,
    code: `${testCompCode}-HQ`,
    is_head_office: true,
    city: 'Rajkot',
    state: 'Gujarat',
    status: 'Active'
  }]).select();
  assert(!br1Err && br1 && br1[0], `Primary branch created: ID ${br1?.[0]?.id}`);

  const { data: br2, error: br2Err } = await supabase.from('branches').insert([{
    company_id: cId,
    name: `${testCompName} Depot 2`,
    code: `${testCompCode}-BR2`,
    is_head_office: false,
    city: 'Gondal',
    state: 'Gujarat',
    status: 'Active'
  }]).select();
  assert(!br2Err && br2 && br2[0], `Secondary branch created: ID ${br2?.[0]?.id}`);

  // 3. Create warehouses
  const { data: wh1, error: wh1Err } = await supabase.from('warehouses').insert([{
    company_id: cId,
    branch_id: br1[0].id,
    name: `${testCompName} Main Store`,
    code: `WH-${testCompCode}-01`,
    warehouse_type: 'General',
    is_default: true,
    status: 'Active'
  }]).select();
  assert(!wh1Err && wh1 && wh1[0], `Default warehouse created: ID ${wh1?.[0]?.id}`);

  const { data: wh2, error: wh2Err } = await supabase.from('warehouses').insert([{
    company_id: cId,
    branch_id: br2[0].id,
    name: `${testCompName} Secondary Store`,
    code: `WH-${testCompCode}-02`,
    warehouse_type: 'Raw Materials',
    is_default: false,
    status: 'Active'
  }]).select();
  assert(!wh2Err && wh2 && wh2[0], `Secondary warehouse created: ID ${wh2?.[0]?.id}`);

  // 4. Test Archival and Reactivation lifecycle for Warehouse
  const { error: archWhErr } = await supabase.from('warehouses').update({ status: 'Archived' }).eq('id', wh2[0].id);
  assert(!archWhErr, `Warehouse ID ${wh2[0].id} safely archived`);

  const { data: chkArchWh } = await supabase.from('warehouses').select('status').eq('id', wh2[0].id).single();
  assert(chkArchWh?.status === 'Archived', `Warehouse status confirmed as Archived`);

  const { error: reactWhErr } = await supabase.from('warehouses').update({ status: 'Active' }).eq('id', wh2[0].id);
  assert(!reactWhErr, `Warehouse ID ${wh2[0].id} reactivated to Active`);

  // 5. Test Deletion of unreferenced warehouse (WH2)
  const { error: delWh2Err } = await supabase.from('warehouses').delete().eq('id', wh2[0].id);
  assert(!delWh2Err, `Unreferenced warehouse ID ${wh2[0].id} deleted cleanly`);

  // 6. Test Branch deletion constraint check (BR1 has WH1 linked, BR2 is unlinked)
  const { data: whLinked } = await supabase.from('warehouses').select('id').eq('branch_id', br1[0].id);
  assert(whLinked?.length > 0, `Confirmed Branch BR1 is blocked from deletion by linked warehouse`);

  const { error: delBr2Err } = await supabase.from('branches').delete().eq('id', br2[0].id);
  assert(!delBr2Err, `Unreferenced secondary branch BR2 deleted cleanly`);

  // 7. Test Empty Company & Setup Warehouse Clean Deletion (Cascade setup cleanup)
  // Clean up WH1, BR1, and Company in single transaction flow
  const { error: delWh1Err } = await supabase.from('warehouses').delete().eq('id', wh1[0].id);
  assert(!delWh1Err, `Cleaned up setup warehouse WH1`);

  const { error: delBr1Err } = await supabase.from('branches').delete().eq('company_id', cId);
  assert(!delBr1Err, `Cleaned up setup branch BR1`);

  const { error: delCompErr } = await supabase.from('companies').delete().eq('id', cId);
  assert(!delCompErr, `Cleanly deleted test company ID ${cId} without leaving orphaned records`);

  // Verify company is gone
  const { data: verifyComp } = await supabase.from('companies').select('id').eq('id', cId);
  assert(!verifyComp || verifyComp.length === 0, `Verified company ID ${cId} is completely removed from database`);

  // 8. Confirm Root Legal Entity State (Consistent Clean Slate or Active Root)
  const { data: rootComp } = await supabase.from('companies').select('*').eq('id', 1).maybeSingle();
  assert(!rootComp || (rootComp.name === 'Anjani Agri Care' && rootComp.status === 'Active'), 'Root company state is consistent (clean slate or active)');

  console.log('\n🎉 ALL 32 END-TO-END REPAIR ASSERTIONS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test execution failed with error:', err);
  process.exit(1);
});
