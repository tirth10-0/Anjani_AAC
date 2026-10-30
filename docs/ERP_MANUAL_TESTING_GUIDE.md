# Agrochemical Manufacturing ERP — Master Testing & Verification Guide

This guide provides a systematic, module-by-module testing protocol for verifying the entire ERP on the running website (`http://localhost:5174/`).

---

## 1. Automated vs. Manual Testing Status

To ensure complete engineering transparency, here is the exact breakdown of what has been verified automatically by executed test scripts versus what you must inspect manually on the live web interface:

| Module / Scope | Automated Test Suite | Manual Testing Required on Website |
|---|:---:|:---:|
| **Unit Conversions (Nos, Gram, Kg, Ml, Litre)** | **100% Passed** (`test_inventory_integrity.js`) | Test UI display format in table & dropdowns |
| **SKU Box vs Loose Packaging Math** | **100% Passed** (`test_inventory_integrity.js`) | Test line item dynamic inputs in Order Modal |
| **Idempotency & Concurrent Click Blocking** | **100% Passed** (`test_inventory_integrity.js`) | Test rapid double-clicking Save buttons |
| **Negative Stock Prevention & Insufficient Guard** | **100% Passed** (`test_inventory_integrity.js`) | Verify toast warning shows when ordering excess stock |
| **FIFO Stock Deduction & Batch Depletion** | **100% Passed** (`test_inventory_integrity.js`) | Verify batch numbers on dispatched orders |
| **Order Cancellation & Stock Restoration** | **100% Passed** (`test_inventory_integrity.js`) | Cancel an order in UI; check stock increases |
| **Stock Diagnostics & Auto-Sync Engine** | **100% Passed** (`test_inventory_integrity.js`) | Click "Health Check" button; check 0 Discrepancies |
| **Multi-Company Data Partitioning** | **100% Passed** (`test_multi_company_isolation.js`) | Switch company in topbar; verify UI table reloads |
| **LocalStorage Tampering Resistance** | **100% Passed** (`test_multi_company_isolation.js`) | Change localStorage in DevTools; check safe fallback |
| **Cross-Company Write Blocking (RLS)** | **100% Passed** (`test_multi_company_isolation.js`) | Verify Company A client is invisible in Anjani |
| **Intercompany Relationship Trading Pairs** | **100% Passed** (`test_multi_company_isolation.js`) | Review trading matrix in `pages/intercompany.html` |
| **UI Rendering, Modals, Forms & Toasts** | *N/A (Browser-only)* | **Must test every modal, input, and button** |
| **Invoice Builder & PDF Generator** | *N/A (Browser-only)* | **Must test preview and print/download** |

---

## 2. Testing Environment & Browser DevTools Setup

Before beginning the manual walkthrough, set up your inspection tools:

1. Open **Google Chrome** or **Edge** and browse to:
   `http://localhost:5174/`
2. Open **Browser Developer Tools**:
   * Press `F12` (or Right-Click $\rightarrow$ **Inspect**).
3. **Console Tab:**
   * Keep the **Console** tab open. Ensure `Errors` and `Warnings` filters are checked.
   * A healthy page will show initialization logs like:
     `[TenantContext] Initialized active company: Anjani Agri Care (ID: 1)`
     and **zero red JavaScript errors**.
4. **Network Tab:**
   * Check **Fetch/XHR** in the Network tab.
   * When saving or querying, Supabase requests will appear as `POST`, `PATCH`, or `GET` to `quxcvoywufjjynluntvg.supabase.co`.
   * Status code should always be `200 OK` or `201 Created` (never `401`, `403`, or `500`).

---

## 3. Module-by-Module Testing Protocols

---

### Module 1: Multi-Company Hierarchy & Header Switcher

#### Test 1.1: Dynamic Topbar Branding & Dropdown Navigation
* **Where to Navigate:** Any page (e.g. `http://localhost:5174/pages/dashboard.html`).
* **Actions:**
  1. Look at the top navigation bar right corner.
  2. Click the company selector badge (`Anjani Agri Care`).
  3. Verify the dropdown items.
* **Expected Result:**
  * Displays **"Anjani Agri Care"** with a green **"Manufacturer"** pill.
  * Dropdown lists all 4 companies:
    1. *Anjani Agri Care (ACC)* — marked with an active checkmark.
    2. *Company A (Agro Retail) (CO-A)* — marked with "Trading" pill.
    3. *Company B (Crop Solutions) (CO-B)* — marked with "Trading" pill.
    4. *Company C (Kisan Kendra) (CO-C)* — marked with "Trading" pill.
  * Footer of dropdown includes shortcuts: *All Companies*, *Warehouses*, and *Intercompany Links*.
* **Bug Indicators:** Dropdown fails to open; text is blank; company name remains hardcoded after switching.

#### Test 1.2: Companies Master & Branch Management
* **Where to Navigate:** Sidebar $\rightarrow$ **Enterprise & Locations** $\rightarrow$ **Companies** (`pages/companies.html`).
* **Actions:**
  1. Inspect the company metric counters at the top (Total Companies, Manufacturing Plants, Trading Entities).
  2. Click **+ New Company** at top-right.
  3. Fill in the modal form:
     * Company Name: `Saurashtra Agro Distributors`
     * Company Code: `SAD-01`
     * GSTIN: `24ABCDE1234F1Z5`
     * Business Type: `Trading / Retail`
     * City: `Rajkot`, State: `Gujarat`
  4. Click **Save Company**.
* **Expected Result:**
  * Toast displays: *"Company created successfully!"*.
  * The modal closes and `Saurashtra Agro Distributors` appears in the company grid.
  * Switching to the new company via the topbar allows access to its new isolated workspace.
* **Bug Indicators:** Modal freezes; form inputs reset without saving; error toast appears.

#### Test 1.3: Warehouses & Depots Master
* **Where to Navigate:** Sidebar $\rightarrow$ **Enterprise & Locations** $\rightarrow$ **Warehouses** (`pages/warehouses.html`).
* **Actions:**
  1. Review existing warehouses:
     * `WH-ACC-01`: Main Plant Warehouse (*Anjani Agri Care*)
     * `WH-COA-01`: Central Depot (*Company A*)
  2. Click **+ New Warehouse**.
  3. Fill in:
     * Warehouse Name: `Virva Raw Material Storage`
     * Code: `WH-ACC-RM`
     * Storage Type: `Raw Material`
     * Check "Set as Default Warehouse for this Company".
  4. Click **Save Warehouse**.
* **Expected Result:**
  * Warehouse is created and tagged to the active company.
* **Bug Indicators:** Storage type dropdown is empty; company assignment fails.

#### Test 1.4: Intercompany Trading Links Matrix
* **Where to Navigate:** Sidebar $\rightarrow$ **Enterprise & Locations** $\rightarrow$ **Intercompany Links** (`pages/intercompany.html`).
* **Actions:**
  1. Verify the 3 pre-seeded links from Anjani Agri Care to Company A, B, and C.
  2. Click **Edit** on Link 1 (*Anjani $\rightarrow$ Company A*).
  3. Change Price Tier to `Dealer Wholesale (Special)` and toggle **Auto-Sync Orders** ON.
  4. Click **Save Relationship**.
* **Expected Result:**
  * Table row updates immediately without page reload.
* **Bug Indicators:** Edit modal shows empty fields; pricing tier resets to blank.

---

### Module 2: Inventory, Technicals & Stock Verification

#### Test 2.1: Inventory Listing & Category Filtering
* **Where to Navigate:** Sidebar $\rightarrow$ **Inventory** (`pages/inventory.html`).
* **Actions:**
  1. Click through the category tabs: **Technical**, **Formulation / Raw**, **Packaging (Bottles/Boxes)**, and **All Items**.
  2. Use the search bar to search for `Chlorpyrifos`.
* **Expected Result:**
  * Table displays Item Name, Subtype, Unit, Total Stock, Average Cost, and Total Stock Value.
  * Category tabs filter rows accurately.
  * Search responds instantly.
* **Bug Indicators:** Loading skeleton stays stuck forever; stock shows `NaN` or `undefined`.

#### Test 2.2: Adding a New Inventory Technical Item
* **Where to Navigate:** `pages/inventory.html`.
* **Actions:**
  1. Click **+ Add Item**.
  2. Fill in:
     * Name: `Profenofos Technical 98%`
     * Category: `Technical`
     * Unit: `Kg`
     * Reorder Level: `50`
     * Initial Opening Stock: `100`
     * Opening Cost per Unit: `450`
     * Opening Batch No: `BATCH-PROF-01`
  3. Click **Save Item**.
* **Expected Result:**
  * Toast displays: *"Item added!"*.
  * `Profenofos Technical 98%` appears with Total Stock = `100 Kg`, Avg Cost = `₹450`, Stock Value = `₹45,000`.
  * An inward batch `BATCH-PROF-01` is recorded in `stock_batches`.
* **Bug Indicators:** Stock shows 0 instead of 100; batch number is missing.

#### Test 2.3: Stock Verification & Health Check (Diagnostics)
* **Where to Navigate:** `pages/inventory.html`.
* **Actions:**
  1. Click the **Stock Verification & Health Check** button (top-right next to Add Item).
  2. The diagnostics modal opens and audits every item:
     * Column 1: Item Name
     * Column 2: Display Stock (cached summary)
     * Column 3: Batch Total (sum of active batches)
     * Column 4: Difference
     * Column 5: Status
* **Expected Result:**
  * Modal header shows: **"Status: HEALTHY — 0 Discrepancies"**.
  * All differences show `0.00` with green `MATCHED` badges.
  * The button **Fix & Sync Stock** is disabled because stock is 100% aligned.
* **Bug Indicators:** False discrepancies flagged with `-0.00` difference; modal does not load.

---

### Module 3: Products Master & Packaging Configurations

#### Test 3.1: Viewing Products & Packaging Sizes
* **Where to Navigate:** Sidebar $\rightarrow$ **Products Master** (`pages/products.html`).
* **Actions:**
  1. View product cards/table.
  2. Observe packaging configurations listed under each product (e.g. 250 ml, 500 ml, 1 Litre, 5 Litre).
* **Expected Result:**
  * Shows Finished Goods with Technical association, Unit, Box capacities, and Selling Prices.

#### Test 3.2: Creating a Finished Product with SKU Packaging
* **Where to Navigate:** `pages/products.html`.
* **Actions:**
  1. Click **+ Add Product**.
  2. Fill in:
     * Product Name: `Profenofos 50% EC`
     * Technical Formulation: Select `Profenofos Technical 98%`
     * Base Unit: `Litre`
     * GST Rate: `18%`
  3. Under Packaging Sizes, add 2 packaging options:
     * **Option 1:** Size: `500 ml`, Sell Price: `₹320`, Units per Box: `20`, Base Item: Checked.
     * **Option 2:** Size: `1 Litre`, Sell Price: `₹600`, Units per Box: `10`.
  4. Click **Save Product**.
* **Expected Result:**
  * Product is created with both packaging rows stored in `product_packaging`.
  * Box capacities (20 for 500ml, 10 for 1L) are stored accurately.
* **Bug Indicators:** Packaging rows fail to save; units per box resets to 0.

---

### Module 4: Purchases & Inward Stock

#### Test 4.1: Creating a Purchase with Multiple Items
* **Where to Navigate:** Sidebar $\rightarrow$ **Purchases** (`pages/purchases.html`).
* **Actions:**
  1. Click **+ New Purchase**.
  2. Fill in:
     * Supplier: Select an existing supplier (e.g., *Gujarat Chem Trading*).
     * Date: Today's date.
     * Status: `Pending`.
  3. Add Line Item:
     * Item: `Profenofos Technical 98%`
     * Quantity: `200 Kg`
     * Unit Price: `₹440`
     * Batch No: `PUR-PROF-02`
  4. Click **Save Purchase**.
* **Expected Result:**
  * Purchase `P-02` (or latest sequential number) is saved with status `Pending`.
  * Total amount shows `₹88,000`.
  * **Critical Check:** Go to **Inventory** (`pages/inventory.html`). Total Stock of Profenofos Technical must **STILL be 100 Kg** (because Pending purchases must NOT increase inventory).
* **Bug Indicators:** Stock increases while purchase is still Pending.

#### Test 4.2: Inward Stock Receipt (Delivered Status)
* **Where to Navigate:** `pages/purchases.html`.
* **Actions:**
  1. Click **Edit** on the purchase created above.
  2. Change Status from `Pending` to **`Delivered`**.
  3. Click **Save Purchase**.
* **Expected Result:**
  * Purchase status updates to `Delivered`.
  * **Critical Check:** Navigate to **Inventory** (`pages/inventory.html`).
  * Profenofos Technical stock is now **300 Kg** (100 opening + 200 inward).
  * Run **Stock Health Check**: All items show `MATCHED` with 0 discrepancies.
* **Bug Indicators:** Stock does not update; double-counting causes stock to jump to 500 Kg.

---

### Module 5: Sales Orders, Box-vs-Loose Calculations & Dispatches

#### Test 5.1: Packaging Size Conversion & Box-vs-Loose Math
* **Where to Navigate:** Sidebar $\rightarrow$ **Orders** (`pages/orders.html`).
* **Actions:**
  1. Click **+ New Order**.
  2. Select Customer (e.g. *Jay Jalaram Agro*).
  3. Select Product: `Profenofos 50% EC`.
  4. Select Packaging: `500 ml (Box capacity: 20 units)`.
  5. Test the Box and Loose quantity inputs:
     * Enter **Boxes:** `5`
     * Enter **Loose:** `6`
* **Expected Result:**
  * **Total Units** automatically calculates as:
    $$\text{Total Bottles} = (5 \times 20) + 6 = 106\text{ bottles}$$
  * **Total Volume** calculates as:
    $$\text{Total Litres} = 106 \times 0.500\text{ L} = 53.0\text{ Litres}$$
  * Total Price calculates accurately based on 106 units $\times$ unit price.
* **Bug Indicators:** Total units shows NaN; loose quantity is ignored; total volume uses 1000ml instead of 500ml.

#### Test 5.2: Insufficient Stock Validation (Negative Stock Guard)
* **Where to Navigate:** `pages/orders.html`.
* **Actions:**
  1. In the Order Modal, select an item with low stock (e.g., an item with only 5 units available).
  2. Attempt to order **100 Boxes** (2,000 units).
  3. Click **Save Order**.
* **Expected Result:**
  * The system **blocks submission**.
  * An alert or toast displays: *"Insufficient stock available for this item"*.
  * No order record is created; database stock is preserved.
* **Bug Indicators:** Order succeeds and stock drops into negative numbers (e.g. -1,995).

#### Test 5.3: Dispatched Order Stock Deduction (FIFO)
* **Where to Navigate:** `pages/orders.html`.
* **Actions:**
  1. Create an order with realistic available stock (e.g., 2 boxes of 20 = 40 bottles = 20 Litres).
  2. Set Status to **`Dispatched`** (or `Delivered`).
  3. Click **Save Order**.
* **Expected Result:**
  * Order is saved successfully.
  * In `pages/inventory.html`, the technical formulation stock decreases by exactly 20 Litres.
  * If a bottle inventory item was selected, 40 bottles are deducted.
  * The oldest stock batch is depleted first (FIFO principle).
* **Bug Indicators:** Stock decreases by 40 Litres instead of 20; negative batch created.

#### Test 5.4: Order Cancellation & Traceable Reversal
* **Where to Navigate:** `pages/orders.html`.
* **Actions:**
  1. Locate the Dispatched order created in Test 5.3.
  2. Click **Delete** (or Edit and change status to `Cancelled`).
  3. Confirm the action.
* **Expected Result:**
  * Order is deleted or marked Cancelled.
  * Navigate to `pages/inventory.html`.
  * The deducted stock is **restored back** to inventory.
  * Open **Stock Health Check**: Discrepancies count is **0**.
* **Bug Indicators:** Stock remains depleted after cancellation; stock increases twice.

---

### Module 6: Manufacturing & Formulations

#### Test 6.1: Formulation Recipe Master (BOM Template)
* **Where to Navigate:** Sidebar $\rightarrow$ **Formulations** (`pages/formulations.html`).
* **Actions:**
  1. Inspect existing formulation recipes.
  2. Click **+ New Formulation**.
  3. Name: `Chlorpyrifos 20% EC Standard Recipe`.
  4. Batch Size: `1,000 Litres`.
  5. Add Ingredients:
     * `Chlorpyrifos Technical`: `215 Kg`
     * `Solvent Xylene`: `735 Litres`
     * `Emulsifier 101`: `50 Kg`
  6. Click **Save Formulation**.
* **Expected Result:**
  * Formulation template saves with status `Draft` or `Template`.
  * **Critical:** Recipe templates must NOT touch inventory balances.
* **Bug Indicators:** Stock batches are deducted upon saving a draft formulation recipe.

#### Test 6.2: Production Execution & Finished Goods Inward
* **Where to Navigate:** Sidebar $\rightarrow$ **Production Runs** (`pages/production.html`).
* **Actions:**
  1. Click **+ New Production Run**.
  2. Select Product: `Chlorpyrifos 20% EC`.
  3. Batch No: `PROD-2026-01`.
  4. Quantity Produced: `1,000 Litres`.
  5. Enter consumed raw materials:
     * Chlorpyrifos Technical: `215 Kg`
     * Solvent Xylene: `735 Litres`
  6. Click **Save Production Run**.
* **Expected Result:**
  * Production run is saved.
  * Raw materials (Technical + Xylene) decrease FIFO in Inventory.
  * A new finished goods batch `PROD-2026-01` of 1,000 Litres is booked.
* **Bug Indicators:** Database error on insert; production output has 0 quantity.

---

### Module 7: Accounting, Expenses & Financial Transactions

#### Test 7.1: Customers Master (Clients)
* **Where to Navigate:** Sidebar $\rightarrow$ **Clients** (`pages/clients.html`).
* **Actions:**
  1. Click **+ Add Client**.
  2. Name: `Kisan Fertilizer & Agro Stores`.
  3. Phone: `9898112233`, City: `Junagadh`.
  4. Click **Save Client**.
* **Expected Result:**
  * Client appears in table with total orders = `0` and outstanding balance = `₹0`.
* **Bug Indicators:** Error saving client; search does not find the new client.

#### Test 7.2: Expenses Logging
* **Where to Navigate:** Sidebar $\rightarrow$ **Expenses** (`pages/expenses.html`).
* **Actions:**
  1. Click **+ Add Expense**.
  2. Category: `Plant Maintenance`.
  3. Amount: `₹3,500`.
  4. Payment Mode: `Bank Transfer`.
  5. Notes: `Reactor vessel gasket replacement`.
  6. Click **Save Expense**.
* **Expected Result:**
  * Expense record is logged and aggregate monthly expenses update.
* **Bug Indicators:** Amount formatted as `₹NaN`; category dropdown empty.

#### Test 7.3: Bank Accounts & Financial Ledger
* **Where to Navigate:** Sidebar $\rightarrow$ **Transactions** (`pages/transactions.html`).
* **Actions:**
  1. Check bank account balances (e.g. *HDFC Current Account*, *Cash in Hand*).
  2. Record a Transaction:
     * Type: `Income / Customer Payment`
     * Amount: `₹15,000`
     * Account: `HDFC Current Account`
  3. Click **Save Transaction**.
* **Expected Result:**
  * HDFC balance increases by ₹15,000.
* **Bug Indicators:** Balance decreases instead of increasing; transaction history blank.

---

### Module 8: Analytics, Reports & Exports

#### Test 8.1: Real-Time Dashboard KPI Cards
* **Where to Navigate:** Sidebar $\rightarrow$ **Dashboard** (`pages/dashboard.html`).
* **Actions:**
  1. Review the 4 KPI cards:
     * Total Revenue
     * Active Orders
     * Low Stock Alerts
     * Total Purchases
  2. Review the Recent Orders table.
* **Expected Result:**
  * Numbers match the records created in Modules 4, 5, and 7.
* **Bug Indicators:** KPI cards show loading spinners indefinitely.

#### Test 8.2: Date-Range Business Reports
* **Where to Navigate:** Sidebar $\rightarrow$ **Reports** (`pages/reports.html`).
* **Actions:**
  1. Select Date Range: From `First day of current month` to `Today`.
  2. Click **Apply Filter**.
* **Expected Result:**
  * Displays Net Sales, Total Purchases, Total Expenses, and Net Operating Margin.
* **Bug Indicators:** Date filter throws error; query returns all historical data ignoring range.

---

### Module 9: Cross-Company Data Isolation & Security Verification

This is the ultimate verification of multi-company commercial readiness:

#### Step 9.1: Baseline Check in Anjani Agri Care
1. In top navigation bar, ensure company is **Anjani Agri Care**.
2. Go to **Clients** (`pages/clients.html`). Count total clients (e.g. 2 clients).
3. Go to **Orders** (`pages/orders.html`). Note order numbers (`ORD-ACC-...`).

#### Step 9.2: Switch to Company A (Agro Retail)
1. In the top navigation bar, click the company selector and pick **Company A (Agro Retail)**.
2. The page reloads.
3. Observe:
   * Topbar badge shows **Company A (Agro Retail)** with a **Trading** pill.
4. Go to **Clients** (`pages/clients.html`):
   * **Verification:** The client table is **EMPTY** (or shows only Company A clients). None of Anjani's clients are visible!
5. Create a client for Company A:
   * Name: `Morbi Kisan Agro Hub`
   * Phone: `9123456780`
   * Click **Save Client**.
   * Client is saved successfully in Company A.
6. Go to **Orders** (`pages/orders.html`):
   * Anjani's orders are completely invisible.

#### Step 9.3: Switch Back to Anjani Agri Care
1. In the top navigation bar, switch back to **Anjani Agri Care**.
2. Go to **Clients** (`pages/clients.html`):
   * Anjani's original clients are intact.
   * **`Morbi Kisan Agro Hub` (Company A's client) is NOT present.**
   * **Verification:** Data isolation is 100% airtight in both directions!

---

## 4. Practical Manual Testing Checklist

Print or follow this checklist while testing the website:

- [ ] **1. Setup & Pre-check**
  - [ ] Migration script executed in Supabase SQL Editor
  - [ ] Dev server running at `http://localhost:5174/`
  - [ ] Browser DevTools open with 0 console errors on page load

- [ ] **2. Multi-Company & Hierarchy**
  - [ ] Topbar displays dynamic company name and badge
  - [ ] Switcher dropdown lists all 4 companies
  - [ ] `pages/companies.html` loads and allows creating a new company
  - [ ] `pages/warehouses.html` displays storage locations by company
  - [ ] `pages/intercompany.html` displays trading links and pricing tiers

- [ ] **3. Inventory & Diagnostics**
  - [ ] Inventory table loads all categories (Technical, Packaging, Raw)
  - [ ] New item with opening batch saves correctly
  - [ ] Stock Verification modal opens and reports **0 Discrepancies**

- [ ] **4. Products Master**
  - [ ] Finished goods catalog loads with packaging options
  - [ ] New product with box capacity (e.g. 20 units/box) saves cleanly

- [ ] **5. Purchases & Inward Stock**
  - [ ] New purchase in `Pending` status does **NOT** increase stock
  - [ ] Changing status to `Delivered` automatically creates inward batches
  - [ ] Inventory balance increases by the exact purchase quantity

- [ ] **6. Orders, Dispatches & Cancellations**
  - [ ] Box + Loose calculation correctly computes Total Bottles & Volume
  - [ ] Insufficient stock is blocked with a warning toast
  - [ ] Dispatched order deducts bulk technical and bottle inventory
  - [ ] Cancelled or deleted order restores stock back to batches

- [ ] **7. Manufacturing & Production**
  - [ ] Recipe template saves without altering live stock
  - [ ] Production run consumes raw materials FIFO and books output batch

- [ ] **8. Accounting & Expenses**
  - [ ] New client and supplier records save and appear in dropdowns
  - [ ] Expense entry logs under proper category
  - [ ] Bank transaction updates account balance correctly

- [ ] **9. Analytics & Reports**
  - [ ] Dashboard KPI cards match database records
  - [ ] Reports date filter calculates sales, purchases, and expenses

- [ ] **10. Cross-Company Data Isolation**
  - [ ] Switching to Company A isolates customers, orders, and inventory
  - [ ] Data created in Company A is completely invisible in Anjani Agri Care
  - [ ] Attempting unauthorized company switch in console returns `false`
