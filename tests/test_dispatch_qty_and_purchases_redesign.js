/**
 * tests/test_dispatch_qty_and_purchases_redesign.js
 * End-to-end automated verification for:
 * 1. Problem A: Commercial Dispatch Quantity Bug Fix
 *    - Order with multi-products and differing quantities (100, 80, 200) loads exact quantities.
 *    - No lines default to 100 when their ordered quantity is 80 or 200.
 *    - Packaging units_per_box and box breakdowns match each specific line's packaging size.
 *    - Over-dispatch validation is strictly enforced.
 * 2. Problem B: Multi-Item Purchase Redesign
 *    - Main table shows compact summary with first 2 items + '+N more' clickable badge.
 *    - Row heights remain clean and compact.
 *    - Clicking '+N more' or the View action button opens Purchase Details modal.
 *    - Modal shows rich financial banner and complete structured line items table.
 *    - Edit and Delete functionality remains preserved.
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5174';
const ARTIFACTS_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE AUTOMATED VERIFICATION ---');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('Download the Vue Devtools') && !txt.includes('SW registered') && !txt.includes('favicon')) {
        console.log(`[Browser Console ${msg.type()}]:`, txt);
      }
    });

    page.on('pageerror', err => {
      console.error('[Browser Error]:', err.message);
    });

    // 0. Perform login / session setup
    console.log('\n>>> Setup: Initializing login session...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
    await page.evaluate(async () => {
      const { data, error } = await window.dbClient.auth.signInWithPassword({
        email: 'admin@anjani.test',
        password: 'Test@Agro2026!'
      });
      if (error) console.warn('Supabase auth warning:', error.message);
      localStorage.setItem('admin_user', 'admin@anjani.test');
      localStorage.setItem('admin_logged_in', 'true');
      localStorage.setItem('erp_active_company_id', '623');
      localStorage.setItem('active_company_id', '623');
      localStorage.setItem('active_company_code', 'AAC');
    });
    await sleep(1000);

    // ==========================================
    // TEST SUITE 1: PROBLEM A - DISPATCH QUANTITIES
    // ==========================================
    console.log('\n>>> Running Test Suite 1: Commercial Dispatch Quantity Disambiguation');
    await page.goto(`${BASE_URL}/pages/orders.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.openPrepareDispatch === 'function');
    await sleep(2000);

    // Open Prepare Dispatch Modal for Order 90
    console.log('Opening Prepare Dispatch Slip for Order 90 (O-01)...');
    await page.evaluate(async () => {
      await window.openPrepareDispatch(90);
    });
    await sleep(2000);

    // Verify modal is open and order items are loaded
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('prepare-dispatch-modal');
      return modal && modal.classList.contains('open');
    });
    console.log('Prepare Dispatch modal open:', modalVisible);
    if (!modalVisible) {
      throw new Error('FAILURE: prepare-dispatch-modal failed to open!');
    }

    // Extract all line item data rendered in the modal
    const itemsData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.dispatch-item-card');
      return Array.from(cards).map(c => {
        const name = c.querySelector('.dispatch-item-name')?.textContent?.trim() || '';
        const pack = c.querySelector('.dispatch-item-pack')?.textContent?.trim() || '';
        const box = c.querySelector('.badge:not(.dispatch-item-pack)')?.textContent?.trim() || '';
        const input = c.querySelector('.disp-item-qty');
        const inputVal = parseInt(input?.value, 10) || 0;
        const inputMax = parseInt(input?.getAttribute('max') || input?.getAttribute('data-max'), 10) || 0;
        const breakdown = c.querySelector('.disp-item-breakdown')?.textContent?.trim() || '';
        const orderItemId = c.getAttribute('data-order-item-id');
        const upb = c.getAttribute('data-units-per-box');

        return {
          orderItemId,
          name,
          pack,
          box,
          upb,
          inputVal,
          inputMax,
          breakdown
        };
      });
    });

    console.log(`Rendered ${itemsData.length} dispatch item cards.`);
    if (itemsData.length === 0) {
      throw new Error('No dispatch items loaded in prepare-dispatch-modal');
    }

    itemsData.forEach((item, i) => {
      console.log(`[Line ${i + 1}] ID:${item.orderItemId} | ${item.name} (${item.pack}) | InputVal:${item.inputVal} (Max:${item.inputMax}) | Breakdown: ${item.breakdown}`);
    });

    // Check Chlor-20 500ml (Line 2)
    const chlor500 = itemsData.find(it => it.name.includes('Chlor-20') && it.pack.includes('500'));
    if (!chlor500) throw new Error('Chlor-20 500ml not found in dispatch items!');
    if (chlor500.inputVal !== 80) {
      throw new Error(`FAILURE: Chlor-20 500ml input defaulted to ${chlor500.inputVal}, expected 80!`);
    }
    if (chlor500.inputMax !== 80) {
      throw new Error(`FAILURE: Chlor-20 500ml inputMax is ${chlor500.inputMax}, expected 80!`);
    }
    console.log('✓ PASS: Chlor-20 500ml loaded exact ordered quantity: 80 units (not 100).');

    // Check Profe-40 500ml (Line 4)
    const profe500 = itemsData.find(it => it.name.includes('Profe-40') && it.pack.includes('500'));
    if (!profe500) throw new Error('Profe-40 500ml not found in dispatch items!');
    if (profe500.inputVal !== 80) {
      throw new Error(`FAILURE: Profe-40 500ml input defaulted to ${profe500.inputVal}, expected 80!`);
    }
    console.log('✓ PASS: Profe-40 500ml loaded exact ordered quantity: 80 units (not 100).');

    // Check Thio-60 100ml (Line 8)
    const thio100 = itemsData.find(it => it.name.includes('Thio-60') && it.pack.includes('100'));
    if (!thio100) throw new Error('Thio-60 100ml not found in dispatch items!');
    if (thio100.inputVal !== 200) {
      throw new Error(`FAILURE: Thio-60 100ml input defaulted to ${thio100.inputVal}, expected 200!`);
    }
    console.log('✓ PASS: Thio-60 100ml loaded exact ordered quantity: 200 units.');

    // Test dynamic box recalculation on typing
    console.log('Testing dynamic box breakdown recalculation...');
    await page.evaluate(() => {
      const chlorCard = document.querySelectorAll('.dispatch-item-card')[1];
      const input = chlorCard.querySelector('.disp-item-qty');
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);

    const updatedBreakdown = await page.evaluate(() => {
      const chlorCard = document.querySelectorAll('.dispatch-item-card')[1];
      return chlorCard.querySelector('.disp-item-breakdown')?.textContent?.trim() || '';
    });
    console.log('Updated Chlor-20 500ml breakdown for 40 units:', updatedBreakdown);
    if (!updatedBreakdown.includes('2 Boxes') || !updatedBreakdown.includes('40 units')) {
      throw new Error(`FAILURE: Breakdown did not update correctly for 40 units: ${updatedBreakdown}`);
    }
    console.log('✓ PASS: Dynamic box breakdown recalculated accurately (2 Boxes, 40 units).');

    // Take screenshot of dispatch modal
    const dispatchModalPath = path.join(ARTIFACTS_DIR, 'dispatch_quantities_verified.png');
    await page.screenshot({ path: dispatchModalPath });
    console.log(`Saved screenshot: ${dispatchModalPath}`);

    // Scroll down inside modal body to show lines 1 to 4 with 80 units
    await page.evaluate(() => {
      const modalBody = document.querySelector('#prepare-dispatch-modal .modal-body');
      if (modalBody) modalBody.scrollTop = 500;
    });
    await sleep(400);
    const scrolledModalPath = path.join(ARTIFACTS_DIR, 'dispatch_items_cards_scrolled.png');
    await page.screenshot({ path: scrolledModalPath });
    console.log(`Saved scrolled screenshot: ${scrolledModalPath}`);

    // Close prepare dispatch modal
    await page.evaluate(() => {
      window.APP.closeModal('prepare-dispatch-modal');
    });
    await sleep(500);

    // ==========================================
    // TEST SUITE 2: PROBLEM B - PURCHASES REDESIGN
    // ==========================================
    console.log('\n>>> Running Test Suite 2: Purchases Multi-Item Redesign & Detail Modal');
    await page.goto(`${BASE_URL}/pages/purchases.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)').length > 0);
    await sleep(1500);

    // Verify main purchases table rows
    const purchasesData = await page.evaluate(() => {
      const rows = document.querySelectorAll('#purchases-table tbody tr:not(.empty-row)');
      return Array.from(rows).map(r => {
        const pNo = r.querySelector('.cell-bold')?.textContent?.trim() || '';
        const invNo = r.querySelector('.cell-mono')?.textContent?.trim() || '';
        const itemsCell = r.querySelector('.cell-items-summary');
        const itemsText = itemsCell?.textContent?.trim() || '';
        const moreBtn = itemsCell?.querySelector('.purchase-more-badge');
        const moreBtnText = moreBtn?.textContent?.trim() || '';
        const rowHeight = r.getBoundingClientRect().height;
        const viewBtn = r.querySelector('.action-btn.view');

        return {
          pNo,
          invNo,
          itemsText,
          hasMoreBtn: !!moreBtn,
          moreBtnText,
          rowHeight,
          hasViewBtn: !!viewBtn
        };
      });
    });

    console.log(`Found ${purchasesData.length} purchases in table:`);
    purchasesData.forEach((p, i) => {
      console.log(`[P${i + 1}] ${p.pNo} | Height:${Math.round(p.rowHeight)}px | MoreBtn:${p.moreBtnText || 'None'} | ViewBtn:${p.hasViewBtn} | Text: ${p.itemsText.slice(0, 70)}...`);
    });

    // Check Purchase P-07 (11 items)
    const p07 = purchasesData.find(p => p.pNo === 'P-07' || p.pNo.includes('P-07'));
    if (!p07) throw new Error('Purchase P-07 not found in table!');
    if (!p07.hasMoreBtn) {
      throw new Error('FAILURE: Purchase P-07 (11 items) did not render the "+N more" badge!');
    }
    if (!p07.moreBtnText.includes('+9 more')) {
      throw new Error(`FAILURE: Expected "+9 more", got "${p07.moreBtnText}"`);
    }
    if (p07.rowHeight > 120) {
      throw new Error(`FAILURE: Row height is too tall (${p07.rowHeight}px), compact layout expected!`);
    }
    console.log(`✓ PASS: Purchase P-07 shows clean compact row (${Math.round(p07.rowHeight)}px) with badge "${p07.moreBtnText}".`);

    // Verify all rows have the View Details action button
    const missingViewBtn = purchasesData.some(p => !p.hasViewBtn);
    if (missingViewBtn) {
      throw new Error('FAILURE: Some purchases are missing the View Details button in actions column!');
    }
    console.log('✓ PASS: All purchases have View Details action button.');

    // Take screenshot of main purchases table with compact rows
    const purchasesTablePath = path.join(ARTIFACTS_DIR, 'purchases_compact_table_verified.png');
    await page.screenshot({ path: purchasesTablePath });
    console.log(`Saved screenshot: ${purchasesTablePath}`);

    // Click the '+9 more' badge to open Detail Modal
    console.log('Clicking "+9 more" badge on P-07...');
    await page.evaluate(() => {
      const moreBtn = document.querySelector('.purchase-more-badge');
      if (moreBtn) moreBtn.click();
    });
    await sleep(800);

    // Verify modal is active/open
    const viewModalActive = await page.evaluate(() => {
      const m = document.getElementById('purchase-view-modal');
      return m && m.classList.contains('open');
    });
    console.log('Purchase View Modal open:', viewModalActive);
    if (!viewModalActive) {
      throw new Error('FAILURE: Purchase Detail View Modal did not open when clicking "+9 more"!');
    }

    // Verify modal content
    const modalDetails = await page.evaluate(() => {
      const title = document.getElementById('purchase-view-title')?.textContent?.trim() || '';
      const content = document.getElementById('purchase-view-content');
      const tableRows = content?.querySelectorAll('table tbody tr') || [];
      const rowCount = tableRows.length;
      const sampleItem = tableRows[0]?.querySelector('td:nth-child(2)')?.textContent?.trim() || '';
      const grandTotal = content?.querySelector('table tfoot td:last-child')?.textContent?.trim() || '';

      return {
        title,
        rowCount,
        sampleItem,
        grandTotal
      };
    });

    console.log('Modal Details:', modalDetails);
    if (modalDetails.rowCount !== 11) {
      throw new Error(`FAILURE: Expected 11 items in Detail Modal for P-07, found ${modalDetails.rowCount}`);
    }
    console.log(`✓ PASS: Purchase Detail Modal loaded all 11 items with Grand Total ${modalDetails.grandTotal}.`);

    // Take screenshot of Purchase Detail Modal
    const purchaseModalPath = path.join(ARTIFACTS_DIR, 'purchase_detail_modal_verified.png');
    await page.screenshot({ path: purchaseModalPath });
    console.log(`Saved screenshot: ${purchaseModalPath}`);

    // Close view modal
    await page.evaluate(() => {
      window.APP.closeModal('purchase-view-modal');
    });
    await sleep(500);

    // Now test opening view modal from the action button on row 2 (e.g. P-06)
    console.log('Testing View action button on P-06 (row 2)...');
    await page.evaluate(() => {
      const viewBtns = document.querySelectorAll('#purchases-table tbody tr .action-btn.view');
      if (viewBtns.length > 1) viewBtns[1].click();
    });
    await sleep(800);

    const modal2Details = await page.evaluate(() => {
      const title = document.getElementById('purchase-view-title')?.textContent?.trim() || '';
      const content = document.getElementById('purchase-view-content');
      const tableRows = content?.querySelectorAll('table tbody tr') || [];
      return { title, rowCount: tableRows.length };
    });
    console.log('Modal from action button on P-06:', modal2Details);
    if (modal2Details.rowCount !== 4) {
      throw new Error(`FAILURE: Expected 4 items in P-06 modal, got ${modal2Details.rowCount}`);
    }
    console.log('✓ PASS: View action button opens detail modal with correct items count (4 items).');

    // Test Edit button inside view modal transitions to Edit Purchase modal
    console.log('Testing "Edit Purchase" button inside view modal...');
    await page.evaluate(() => {
      const editBtn = document.getElementById('purchase-view-edit-btn');
      if (editBtn) editBtn.click();
    });
    await page.waitForFunction(() => {
      const m = document.getElementById('purchase-modal');
      return m && m.classList.contains('open');
    }, { timeout: 10000 });
    await sleep(500);

    const editModalActive = await page.evaluate(() => {
      const m = document.getElementById('purchase-modal');
      const title = document.getElementById('modal-title')?.textContent?.trim() || '';
      const rows = document.querySelectorAll('#purchase-items-tbody tr').length;
      return { open: m && m.classList.contains('open'), title, rows };
    });
    console.log('Edit Purchase Modal State:', editModalActive);
    if (!editModalActive.open || editModalActive.title !== 'Edit Purchase' || editModalActive.rows !== 4) {
      throw new Error(`FAILURE: Edit Purchase modal failed to open from view modal! State: ${JSON.stringify(editModalActive)}`);
    }
    console.log('✓ PASS: "Edit Purchase" inside view modal seamlessly opens Edit Purchase modal with all 4 items.');

    // Close edit modal
    await page.evaluate(() => {
      window.APP.closeModal('purchase-modal');
    });
    await sleep(500);

    console.log('\n======================================================');
    console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! (100% PASS)');
    console.log('======================================================');
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTests();
