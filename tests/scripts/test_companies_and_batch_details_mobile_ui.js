const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\tirth\\.gemini\\antigravity\\brain\\f96c51f5-083a-43ab-b2cf-e51f633b1bac';
const BASE_URL = 'http://localhost:5174';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('🚀 Starting Companies & Branches + Production Batch Details Mobile UI Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();

  // 1. Authenticate
  console.log('Step 1: Authenticating...');
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dbClient && window.dbClient.auth);
  await page.evaluate(async () => {
    await window.dbClient.auth.signInWithPassword({
      email: 'admin@anjani.test',
      password: 'Test@Agro2026!'
    });
    localStorage.setItem('admin_user', 'admin@anjani.test');
    localStorage.setItem('admin_logged_in', 'true');
    localStorage.setItem('erp_active_company_id', '623');
    localStorage.setItem('active_company_id', '623');
    localStorage.setItem('active_company_code', 'AAC');
  });
  await sleep(1500);

  // ══════════════════════════════════════════════════════════════════
  // TEST SUITE 1: Companies & Branches Page Mobile UI
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- TEST SUITE 1: Companies & Branches Page (Mobile & Desktop) ---');
  const viewports = [
    { name: 'mobile_375', width: 375, height: 667 },
    { name: 'mobile_390', width: 390, height: 844 },
    { name: 'mobile_430', width: 430, height: 932 },
    { name: 'desktop_1280', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/companies.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const compMetrics = await page.evaluate((isMobile) => {
      const toolbar = document.getElementById('companies-table-toolbar');
      const searchWrap = document.getElementById('companies-search-wrap');
      const searchInput = document.getElementById('search-input');
      const filterSelect = document.getElementById('company-status-filter');
      const visibleFilter = document.querySelector('#companies-toolbar-left .uss-container') || filterSelect;
      const totalInfo = document.getElementById('total-info');
      const toolbarRight = document.getElementById('companies-toolbar-right');

      // Metric cards
      const summaryCards = document.querySelectorAll('#companies-summary-grid .summary-metric-card');

      // First company row/card
      const firstRow = document.querySelector('#companies-table tbody tr:not(.empty-row)');
      if (!firstRow) return { error: 'No company rows found' };

      const codeStack = firstRow.querySelector('.comp-code-stack');
      const codeHasActiveBadge = codeStack ? !!codeStack.querySelector('.active-pill-sm, .badge') : false;

      const actions = firstRow.querySelector('.row-actions');
      const actionsHasActiveBadge = actions ? !!actions.querySelector('.action-active-badge') : false;

      // Status column
      const statusCell = firstRow.querySelectorAll('td')[6];
      const statusBadge = statusCell ? statusCell.querySelector('.badge') : null;
      const statusBadgeText = statusBadge ? statusBadge.textContent.trim() : (statusCell ? statusCell.textContent.trim() : '');

      // Location formatting
      const locStack = firstRow.querySelector('.location-stack');
      const locText = locStack ? locStack.textContent.trim() : '';
      const locHasSpaceOrComma = locText.includes(', ') || locText.includes(' ');

      // Branch & Warehouse icons
      const facilityIcons = firstRow.querySelectorAll('.facility-icon');
      const iconSizes = Array.from(facilityIcons).map(icon => {
        const r = icon.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });

      const facilityPillBtns = firstRow.querySelectorAll('.facility-pill-btn');
      const pillSizes = Array.from(facilityPillBtns).map(btn => {
        const r = btn.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });

      const tRect = toolbar ? toolbar.getBoundingClientRect() : null;
      const sRect = searchWrap ? searchWrap.getBoundingClientRect() : null;
      const fRect = visibleFilter ? visibleFilter.getBoundingClientRect() : null;

      return {
        isMobile,
        toolbarWidth: tRect ? Math.round(tRect.width) : 0,
        searchWidth: sRect ? Math.round(sRect.width) : 0,
        filterWidth: fRect ? Math.round(fRect.width) : 0,
        filterAlignedFullWidth: isMobile ? (fRect && sRect && Math.abs(fRect.width - sRect.width) <= 4) : true,
        codeHasActiveBadge,
        actionsHasActiveBadge,
        statusBadgeText,
        locText,
        locHasSpaceOrComma,
        iconSizes,
        pillSizes,
        summaryCardsCount: summaryCards.length
      };
    }, vp.width <= 768);

    console.log(`[${vp.name}] Companies UI Metrics:`, compMetrics);

    // Assertions
    if (vp.width <= 768) {
      if (compMetrics.filterAlignedFullWidth) {
        console.log(`✅ PASS [${vp.name}]: Active Only dropdown matches full width of search bar (${compMetrics.filterWidth}px)`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Filter width ${compMetrics.filterWidth} vs search width ${compMetrics.searchWidth}`);
      }

      if (!compMetrics.codeHasActiveBadge) {
        console.log(`✅ PASS [${vp.name}]: Duplicate Active badge removed from company code`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Duplicate Active badge still beside company code!`);
      }

      if (!compMetrics.actionsHasActiveBadge) {
        console.log(`✅ PASS [${vp.name}]: Duplicate Active badge removed from action buttons`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Duplicate Active badge still in actions!`);
      }

      if (compMetrics.statusBadgeText === 'Active') {
        console.log(`✅ PASS [${vp.name}]: Company status "Active" appears cleanly in the dedicated Status row`);
      } else {
        console.warn(`Note [${vp.name}]: Status badge text: "${compMetrics.statusBadgeText}"`);
      }

      if (compMetrics.locHasSpaceOrComma) {
        console.log(`✅ PASS [${vp.name}]: Location correctly formatted: "${compMetrics.locText}" (not concatenated without space)`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Location words concatenated without space: "${compMetrics.locText}"!`);
      }

      const allIconsCompact = compMetrics.iconSizes.every(s => s.width <= 16 && s.height <= 16);
      if (allIconsCompact && compMetrics.iconSizes.length > 0) {
        console.log(`✅ PASS [${vp.name}]: Branch and Warehouse icons properly sized (approx 13x13px), NOT oversized!`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Oversized facility icons:`, compMetrics.iconSizes);
      }
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'companies_page_fixed_mobile_375.png')
      });
    } else if (vp.name === 'desktop_1280') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'companies_page_fixed_desktop_1280.png')
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // TEST SUITE 2: Production Batch Details Modal (View Details)
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- TEST SUITE 2: Production Batch Details Modal (View Details) ---');
  for (const vp of [viewports[0], viewports[1], viewports[3]]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/pages/production.html`, { waitUntil: 'networkidle2' });
    await sleep(800);

    // Open first batch details or mock one
    await page.evaluate(() => {
      // Find first batch ID
      const firstBatch = (window.allBatches && window.allBatches[0]) || {
        id: 'test-batch-01',
        batch_no: 'B-01',
        product_name: 'Anjani Chlor-20 Ec',
        date: '2026-10-17',
        quantity_produced: 100,
        notes: JSON.stringify({
          items: [
            {
              item_name: 'Anjani Coragen - 80 Ec',
              category: 'Technical',
              action: 'DECREASE',
              entered_quantity: 50,
              entered_unit: 'Litre',
              canonical_unit: 'Kg',
              converted_quantity: 50
            },
            {
              item_name: 'Anjani Chlorpyrifos Technical 97% Min',
              category: 'Technical',
              action: 'DECREASE',
              entered_quantity: 30,
              entered_unit: 'Litre',
              canonical_unit: 'Kg',
              converted_quantity: 30
            },
            {
              item_name: 'Anjani Chlor-20 Ec Final Output Batch Stock',
              category: 'Finished Product',
              action: 'INCREASE',
              entered_quantity: 100,
              entered_unit: 'Litre',
              canonical_unit: 'Litre',
              converted_quantity: 100
            }
          ],
          output_unit: 'Litre',
          user_notes: 'Standard quality inspection passed. Ready for packaging.'
        })
      };

      if (!window.allBatches || !window.allBatches.length) {
        window.allBatches = [firstBatch];
      } else {
        // Ensure first batch has itemized notes for thorough testing
        window.allBatches[0].notes = firstBatch.notes;
      }

      window.viewProductionDetails(window.allBatches[0].id);
    });
    await sleep(600);

    const modalMetrics = await page.evaluate((vpHeight, isMobile) => {
      const modal = document.querySelector('#view-production-modal .modal');
      const header = document.querySelector('#view-production-modal .modal-header');
      const footer = document.querySelector('#view-production-modal .modal-footer');
      const body = document.querySelector('#view-production-modal .modal-body');

      const mRect = modal ? modal.getBoundingClientRect() : null;
      const hRect = header ? header.getBoundingClientRect() : null;
      const fRect = footer ? footer.getBoundingClientRect() : null;

      // Table vs Cards check
      const tableWrap = document.querySelector('#view-production-modal .batch-inventory-table-wrap');
      const cardsList = document.querySelector('#view-production-modal .batch-inventory-cards-list');
      const cards = document.querySelectorAll('#view-production-modal .batch-item-card');

      const tableVisible = tableWrap && window.getComputedStyle(tableWrap).display !== 'none';
      const cardsVisible = cardsList && window.getComputedStyle(cardsList).display !== 'none';

      // Check text wrapping in cards
      let minCardItemWidth = 999;
      cards.forEach(card => {
        const nameEl = card.querySelector('.batch-item-name');
        if (nameEl) {
          const nr = nameEl.getBoundingClientRect();
          if (nr.width < minCardItemWidth) minCardItemWidth = nr.width;
        }
      });

      return {
        fitsInViewport: mRect ? (mRect.top >= 0 && mRect.bottom <= vpHeight + 2) : false,
        top: mRect ? Math.round(mRect.top) : null,
        bottom: mRect ? Math.round(mRect.bottom) : null,
        headerVisible: hRect && hRect.top >= 0,
        footerVisible: fRect && fRect.bottom <= vpHeight + 2,
        bodyScrollable: body ? (body.scrollHeight > body.clientHeight) : false,
        tableVisible,
        cardsVisible,
        cardsCount: cards.length,
        minCardItemWidth: Math.round(minCardItemWidth)
      };
    }, vp.height, vp.width <= 768);

    console.log(`[${vp.name}] Production Details Modal Metrics:`, modalMetrics);

    if (modalMetrics.fitsInViewport) {
      console.log(`✅ PASS [${vp.name}]: Production Details modal fits strictly within viewport`);
    } else {
      console.error(`❌ FAIL [${vp.name}]: Production Details modal exceeded viewport! top: ${modalMetrics.top}, bottom: ${modalMetrics.bottom}`);
    }

    if (vp.width <= 768) {
      if (modalMetrics.cardsVisible && !modalMetrics.tableVisible) {
        console.log(`✅ PASS [${vp.name}]: Mobile stacked cards active (${modalMetrics.cardsCount} cards), desktop table hidden`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Expected stacked cards on mobile, got cardsVisible=${modalMetrics.cardsVisible}, tableVisible=${modalMetrics.tableVisible}`);
      }

      if (modalMetrics.minCardItemWidth > 120) {
        console.log(`✅ PASS [${vp.name}]: Item title has ample width (${modalMetrics.minCardItemWidth}px) — NO letter-by-letter vertical wrapping!`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Item title is too narrow (${modalMetrics.minCardItemWidth}px)!`);
      }
    } else {
      if (modalMetrics.tableVisible && !modalMetrics.cardsVisible) {
        console.log(`✅ PASS [${vp.name}]: Desktop table active on large screen, mobile cards hidden`);
      } else {
        console.error(`❌ FAIL [${vp.name}]: Expected desktop table, got tableVisible=${modalMetrics.tableVisible}`);
      }
    }

    if (vp.name === 'mobile_375') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'production_batch_details_fixed_mobile_375.png')
      });
    } else if (vp.name === 'mobile_390') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'production_batch_details_fixed_mobile_390.png')
      });
    } else if (vp.name === 'desktop_1280') {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'production_batch_details_fixed_desktop_1280.png')
      });
    }
  }

  console.log('\n🎉 ALL TESTS COMPLETED.');
  await browser.close();
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
