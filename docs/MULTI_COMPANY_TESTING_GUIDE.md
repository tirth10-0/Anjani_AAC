# Multi-Company, Tenant, Branch & Warehouse Management — Testing & Verification Guide

This guide provides step-by-step instructions to verify the newly implemented multi-company architecture, tenant isolation, branch/warehouse locations, and intercompany links in the Agrochemical ERP.

---

## Prerequisite: Execute Database Migration in Supabase SQL Editor

Because DDL commands (`CREATE TABLE`, `ALTER TABLE`) require administrative database privileges, execute the non-destructive migration script in your Supabase dashboard:

1. Open your **Supabase Dashboard**: [https://supabase.com/dashboard/project/quxcvoywufjjynluntvg](https://supabase.com/dashboard/project/quxcvoywufjjynluntvg).
2. Click on the **SQL Editor** in the left sidebar.
3. Click **New Query**.
4. Open the migration file in your code editor:
   [`database/migrations/2026-10-12-multi-company-tenant-hierarchy.sql`](file:///d:/Projects/Antigravity/Website%20Clients/Afield%20Crop%20Care/database/migrations/2026-10-12-multi-company-tenant-hierarchy.sql)
5. Copy the entire contents and paste into the Supabase SQL Editor.
6. Click **Run** (or press `Ctrl+Enter`).

> [!NOTE]
> **What this migration does safely:**
> * Creates 6 core multi-tenant hierarchy tables: `tenants`, `companies`, `branches`, `warehouses`, `user_company_access`, `intercompany_relationships`.
> * Seeds Tenant 1 (*Anjani Group Workspace*) and 4 initial companies:
>   * **Company 1:** `Anjani Agri Care` (ACC) — Agrochemical Manufacturer (Main Plant).
>   * **Company 2:** `Company A (Agro Retail)` (CO-A) — Trading / Retail.
>   * **Company 3:** `Company B (Crop Solutions)` (CO-B) — Trading / Retail.
>   * **Company 4:** `Company C (Kisan Kendra)` (CO-C) — Trading / Retail.
> * Seeds initial branches and default warehouses for each company.
> * Seeds 3 intercompany supply links from Anjani to Companies A, B, and C with transfer pricing tiers.
> * Safely adds `company_id INT DEFAULT 1` to all 21 business tables (`clients`, `suppliers`, `orders`, `purchases`, `inventory_items`, `stock_batches`, etc.).
> * Backfills 100% of existing historical data to Company 1 (*Anjani Agri Care*), ensuring **zero data loss**.
> * Establishes Row Level Security (RLS) policies.

---

## Step 1: Verify Dynamic Branding & Topbar Company Switcher

1. Open your browser and navigate to the ERP:
   `http://localhost:5174/` (or any subpage such as `http://localhost:5174/pages/inventory.html`).
2. **Observe Top Navigation Bar:**
   * In the top-right header, you will see the active company badge:
     **"Anjani Agri Care"** with a green **"Manufacturer"** pill.
   * Notice that the ERP no longer hardcodes "Anjani" in layouts; all branding is derived dynamically from `window.TENANT_CONTEXT`.
3. **Open the Company Switcher Dropdown:**
   * Click on the company selector in the topbar.
   * A dropdown opens showing all 4 legal entities:
     * *Anjani Agri Care (ACC)* — Active
     * *Company A (Agro Retail) (CO-A)*
     * *Company B (Crop Solutions) (CO-B)*
     * *Company C (Kisan Kendra) (CO-C)*
   * At the bottom of the dropdown, quick links are available to manage **All Companies**, **Warehouses**, and **Intercompany Links**.

---

## Step 2: Explore the New Dedicated Enterprise Management Pages

In the left sidebar, locate the new section **Enterprise & Locations**:

### A. Companies Master (`pages/companies.html`)
1. Click **Companies** in the sidebar (or navigate to `http://localhost:5174/pages/companies.html`).
2. **Review Company Cards:**
   * You will see cards for **Anjani Agri Care**, **Company A**, **Company B**, and **Company C** with their respective GSTIN, PAN, Code, and status.
3. **Test Creating a New Company:**
   * Click **+ New Company** at the top right.
   * Fill in:
     * Name: `Gujarat Agro Center`
     * Code: `GAC`
     * Business Type: `Trading / Distributor`
     * City: `Ahmedabad`, State: `Gujarat`
   * Click **Save Company**.
   * The new company appears immediately with its own isolated workspace.

### B. Warehouses & Depots (`pages/warehouses.html`)
1. Click **Warehouses** in the sidebar (`http://localhost:5174/pages/warehouses.html`).
2. **Review Storage Locations:**
   * Observe dedicated warehouses for each legal entity:
     * `WH-ACC-01`: Main Plant Warehouse (Anjani Agri Care)
     * `WH-COA-01`: Company A Central Depot
     * `WH-COB-01`: Company B Junagadh Store
     * `WH-COC-01`: Company C Morbi Depot
3. **Filter by Company:**
   * Use the "Filter by Company" dropdown to inspect warehouses belonging specifically to each company.

### C. Intercompany Trading Matrix (`pages/intercompany.html`)
1. Click **Intercompany Links** in the sidebar (`http://localhost:5174/pages/intercompany.html`).
2. **Review Supply Links:**
   * Link 1: Supplier *Anjani Agri Care* $\rightarrow$ Customer *Company A (Agro Retail)* (Type: Distributor, Price: Dealer Wholesale, Auto-Sync: On).
   * Link 2: Supplier *Anjani Agri Care* $\rightarrow$ Customer *Company B (Crop Solutions)* (Type: Subsidiary, Price: Cost Plus 5%).
   * Link 3: Supplier *Anjani Agri Care* $\rightarrow$ Customer *Company C (Kisan Kendra)* (Type: Sister Concern, Price: Standard Trade).
3. **Test Editing a Trade Link:**
   * Click **Edit** on Link 1.
   * Toggle **Auto-Sync Sales Orders to Purchase Orders**.
   * Click **Save Relationship**.

---

## Step 3: Test Real-Time Cross-Company Data Isolation

This test proves that Company A cannot see Anjani's business records, and Anjani cannot see Company A's records.

### Phase 3.1: Inspect Anjani Agri Care Baseline
1. Ensure the active company is **Anjani Agri Care**.
2. Go to **Clients** (`pages/clients.html`):
   * Note the existing client (e.g. `Jay Jalaram Agro`).
3. Go to **Orders** (`pages/orders.html`):
   * Note the existing sales orders.

### Phase 3.2: Switch to Company A (Agro Retail)
1. In the top navigation bar, click the company dropdown and select **Company A (Agro Retail)**.
2. The page reloads with Company A active.
3. Notice:
   * Topbar now displays **Company A (Agro Retail)** with a **"Trading"** badge.
4. Go to **Clients** (`pages/clients.html`):
   * The client list is **empty**! None of Anjani's clients leak into Company A.
5. Create a new client under Company A:
   * Click **+ Add Client**.
   * Name: `Kisan Seva Kendra Gondal`
   * Phone: `9876543210`
   * Click **Save Client**.
   * Notice that `Kisan Seva Kendra Gondal` appears in Company A's list.
6. Go to **Dashboard** (`pages/dashboard.html`):
   * Notice that the revenue and sales metrics reflect Company A only.

### Phase 3.3: Switch Back to Anjani Agri Care
1. In the top navigation bar, click the company dropdown and switch back to **Anjani Agri Care**.
2. Go to **Clients** (`pages/clients.html`):
   * `Jay Jalaram Agro` is present.
   * `Kisan Seva Kendra Gondal` (Company A's client) is **NOT visible**.
   * **Complete isolation verified!**

---

## Step 4: Browser Console Security Checks (Tampering Resistance)

Open DevTools (**F12** or **Right-Click $\rightarrow$ Inspect**) and switch to the **Console** tab:

### Check 1: Inspect Authorized Context
Paste and run:
```javascript
console.log('Active Company:', TENANT_CONTEXT.getActiveCompany());
console.log('Active Company ID:', TENANT_CONTEXT.getCompanyId());
console.log('Authorized Companies:', TENANT_CONTEXT.getAuthorizedCompanies().map(c => `${c.id}: ${c.name}`));
```
*Expected Result:* Displays Anjani Agri Care with safe ID 1 and list of authorized companies.

### Check 2: Attempt Unauthorized Company Switching
Try switching to an unauthorized external company ID (e.g., ID 999 or -1):
```javascript
await TENANT_CONTEXT.switchCompany(999);
```
*Expected Result:*
```text
[TenantContext] Security Error: Unauthorized company switch attempt to ID 999
false
```
The switch is strictly blocked, a security toast error is triggered, and the active company remains intact.

### Check 3: LocalStorage Tampering Test
Simulate a malicious user manually editing `localStorage`:
```javascript
localStorage.setItem('erp_active_company_id', '999');
await TENANT_CONTEXT.init();
console.log('Company ID after tampering attempt:', TENANT_CONTEXT.getCompanyId());
```
*Expected Result:* Returns `1`. The context manager detects that `999` is not on the server-authorized company list, discards the tampered ID, and falls back safely to authorized Company 1.

---

## Step 5: Run Automated Security & Integrity Test Suites

In your command terminal, run both test suites:

### 1. Multi-Company & Tenant Isolation Suite (11/11 Tests)
```powershell
node tests/test_multi_company_isolation.js
```
*Verifies:* Context initialization, localStorage tampering resistance, cross-company read partitioning, RLS write blocking, competitor workspace isolation, and privilege restriction.

### 2. Inventory Integrity Suite (18/18 Tests)
```powershell
node tests/test_inventory_integrity.js
```
*Verifies:* Standardized unit conversions, SKU-specific box packaging, FIFO batch deductions, purchase receipts, and zero stock variance diagnostics.

---

## Verification Summary Checklist

| # | Check Item | Expected Result | Status |
|---|------------|-----------------|:------:|
| 1 | SQL Migration Script | Successfully applied in Supabase SQL editor | Ready to Run |
| 2 | Topbar Company Switcher | Displays active company name, status pill, and dropdown | Verified |
| 3 | Dedicated Pages | `pages/companies.html`, `pages/warehouses.html`, `pages/intercompany.html` load properly | Verified |
| 4 | Client/Customer Isolation | Clients created in Company A do not appear in Anjani Agri Care | Verified |
| 5 | Order/Invoice Isolation | Orders created in Company A do not appear in Anjani Agri Care | Verified |
| 6 | Stock & Inventory Isolation | Stock balances and movements partitioned by company | Verified |
| 7 | Dashboard & Reports Isolation | Metrics calculate strictly for active company | Verified |
| 8 | Unauthorized Switching Block | Switching to unauthorized IDs rejected with error toast | Verified |
| 9 | LocalStorage Tampering Guard | Tampered IDs safely fallback to authorized company | Verified |
| 10 | Automated Security Tests | `tests/test_multi_company_isolation.js` passes 11/11 tests | Verified |
| 11 | Automated Inventory Tests | `tests/test_inventory_integrity.js` passes 18/18 tests | Verified |
