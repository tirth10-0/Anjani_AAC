-- ==============================================================================
-- AGROCHEM ERP - MULTI-COMPANY, TENANT, BRANCH & WAREHOUSE HIERARCHY MIGRATION
-- Date: October 12, 2026
-- Safe, non-destructive migration preserving 100% of existing business data.
-- ==============================================================================

-- 1. CREATE CORE MULTI-TENANT & COMPANY TABLES
-- ------------------------------------------------------------------------------

-- Tenants (Independent customer / business workspace)
CREATE TABLE IF NOT EXISTS public.tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Companies / Legal Entities (With own identity, GSTIN, accounts, sales, stock)
CREATE TABLE IF NOT EXISTS public.companies (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  gstin VARCHAR(50) NULL,
  pan VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(100) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  pincode VARCHAR(20) NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  logo_url TEXT NULL,
  is_manufacturing BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_tenant_code UNIQUE (tenant_id, code)
);

-- Branches (Locations belonging to a company)
CREATE TABLE IF NOT EXISTS public.branches (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  gstin VARCHAR(50) NULL,
  phone VARCHAR(100) NULL,
  is_head_office BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses (Physical stock storage locations belonging to a company / branch)
CREATE TABLE IF NOT EXISTS public.warehouses (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id INT NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  location TEXT NULL,
  warehouse_type VARCHAR(50) DEFAULT 'General',
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- User Company Membership & Authorization
CREATE TABLE IF NOT EXISTS public.user_company_access (
  id SERIAL PRIMARY KEY,
  user_id UUID NULL,
  user_email VARCHAR(255) NULL,
  tenant_id INT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'admin',
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Intercompany Relationships (Configured trading / supply links between companies)
CREATE TABLE IF NOT EXISTS public.intercompany_relationships (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) DEFAULT 'Distributor',
  auto_sync_orders BOOLEAN DEFAULT FALSE,
  price_tier VARCHAR(50) DEFAULT 'Standard',
  status VARCHAR(50) DEFAULT 'Active',
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_intercompany_pair UNIQUE (supplier_company_id, customer_company_id)
);


-- 2. SEED INITIAL TENANT, COMPANIES, BRANCHES & WAREHOUSES
-- ------------------------------------------------------------------------------

-- Default Tenant
INSERT INTO public.tenants (id, name, slug, status)
VALUES (1, 'Anjani Group Workspace', 'anjani-group', 'Active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- Initial Legal Entities (Anjani Agri Care + Company A, B, C)
INSERT INTO public.companies (id, tenant_id, name, code, gstin, pan, address, city, state, is_manufacturing, status)
VALUES 
  (1, 1, 'Anjani Agri Care', 'ACC', '24AAACA0000A1Z5', 'AAACA0000A', 'Plot No. 33, Siddhi Vinayak Ind. Zone, Virva, Lodhika', 'Rajkot', 'Gujarat', TRUE, 'Active'),
  (2, 1, 'Company A (Agro Retail)', 'CO-A', '24AAACB1111B1Z6', 'AAACB1111B', 'Near Market Yard, Gondal Road', 'Rajkot', 'Gujarat', FALSE, 'Active'),
  (3, 1, 'Company B (Crop Solutions)', 'CO-B', '24AAACC2222C1Z7', 'AAACC2222C', 'GIDC Phase II', 'Junagadh', 'Gujarat', FALSE, 'Active'),
  (4, 1, 'Company C (Kisan Kendra)', 'CO-C', '24AAACD3333D1Z8', 'AAACD3333D', 'Highway Junction', 'Morbi', 'Gujarat', FALSE, 'Active')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  is_manufacturing = EXCLUDED.is_manufacturing;

-- Default Branch for Anjani Agri Care
INSERT INTO public.branches (id, company_id, name, code, city, state, is_head_office, status)
VALUES (1, 1, 'Main Plant / Head Office', 'ACC-HO', 'Rajkot', 'Gujarat', TRUE, 'Active')
ON CONFLICT (id) DO NOTHING;

-- Default Warehouses for Companies
INSERT INTO public.warehouses (id, company_id, branch_id, name, code, warehouse_type, is_default, status)
VALUES 
  (1, 1, 1, 'Main Plant Warehouse', 'WH-ACC-01', 'General', TRUE, 'Active'),
  (2, 2, NULL, 'Company A Central Depot', 'WH-COA-01', 'General', TRUE, 'Active'),
  (3, 3, NULL, 'Company B Junagadh Store', 'WH-COB-01', 'General', TRUE, 'Active'),
  (4, 4, NULL, 'Company C Morbi Depot', 'WH-COC-01', 'General', TRUE, 'Active')
ON CONFLICT (id) DO NOTHING;

-- Intercompany Supply Links
INSERT INTO public.intercompany_relationships (id, tenant_id, supplier_company_id, customer_company_id, relationship_type, auto_sync_orders, price_tier, status)
VALUES 
  (1, 1, 1, 2, 'Distributor', TRUE, 'Dealer Wholesale', 'Active'),
  (2, 1, 1, 3, 'Subsidiary', FALSE, 'Cost Plus 5%', 'Active'),
  (3, 1, 1, 4, 'Sister Concern', FALSE, 'Standard Trade', 'Active')
ON CONFLICT (id) DO NOTHING;

-- Default access grant for existing admin / public workspace
INSERT INTO public.user_company_access (id, tenant_id, company_id, role, is_default, status)
VALUES 
  (1, 1, 1, 'owner', TRUE, 'Active'),
  (2, 1, 2, 'admin', FALSE, 'Active'),
  (3, 1, 3, 'admin', FALSE, 'Active'),
  (4, 1, 4, 'admin', FALSE, 'Active')
ON CONFLICT (id) DO NOTHING;


-- 3. ASSOCIATE ALL BUSINESS RECORDS TO COMPANY_ID = 1 (NON-DESTRUCTIVE)
-- ------------------------------------------------------------------------------

-- Clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.clients SET company_id = 1 WHERE company_id IS NULL;

-- Suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.suppliers SET company_id = 1 WHERE company_id IS NULL;

-- Accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.accounts SET company_id = 1 WHERE company_id IS NULL;

-- Master Options
ALTER TABLE public.master_options ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.master_options SET company_id = 1 WHERE company_id IS NULL;

-- Inventory Items
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.inventory_items SET company_id = 1 WHERE company_id IS NULL;

-- Products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.products SET company_id = 1 WHERE company_id IS NULL;

-- Product Packaging
ALTER TABLE public.product_packaging ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.product_packaging SET company_id = 1 WHERE company_id IS NULL;

-- Stock Batches
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS warehouse_id INT DEFAULT 1;
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT 1;
UPDATE public.stock_batches SET company_id = 1 WHERE company_id IS NULL;
UPDATE public.stock_batches SET warehouse_id = 1 WHERE warehouse_id IS NULL;
UPDATE public.stock_batches SET branch_id = 1 WHERE branch_id IS NULL;

-- Stock Movements
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS warehouse_id INT DEFAULT 1;
UPDATE public.stock_movements SET company_id = 1 WHERE company_id IS NULL;

-- Purchases
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT 1;
UPDATE public.purchases SET company_id = 1 WHERE company_id IS NULL;

-- Purchase Items
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.purchase_items SET company_id = 1 WHERE company_id IS NULL;

-- Orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT 1;
UPDATE public.orders SET company_id = 1 WHERE company_id IS NULL;

-- Order Items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.order_items SET company_id = 1 WHERE company_id IS NULL;

-- Expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT 1;
UPDATE public.expenses SET company_id = 1 WHERE company_id IS NULL;

-- Transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.transactions SET company_id = 1 WHERE company_id IS NULL;

-- Formulations
ALTER TABLE public.formulations ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.formulations SET company_id = 1 WHERE company_id IS NULL;

-- Formulation Ingredients
ALTER TABLE public.formulation_ingredients ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.formulation_ingredients SET company_id = 1 WHERE company_id IS NULL;

-- Daily Transactions
ALTER TABLE public.daily_transactions ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.daily_transactions ADD COLUMN IF NOT EXISTS warehouse_id INT DEFAULT 1;
UPDATE public.daily_transactions SET company_id = 1 WHERE company_id IS NULL;

-- Daily Transaction Materials
ALTER TABLE public.daily_transaction_materials ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.daily_transaction_materials SET company_id = 1 WHERE company_id IS NULL;

-- Production Batches
ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS branch_id INT DEFAULT 1;
ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS warehouse_id INT DEFAULT 1;
UPDATE public.production_batches SET company_id = 1 WHERE company_id IS NULL;

-- Production Ingredients
ALTER TABLE public.production_ingredients ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;
UPDATE public.production_ingredients SET company_id = 1 WHERE company_id IS NULL;


-- 4. RESET AUTO-INCREMENT SEQUENCES
-- ------------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('public.tenants', 'id'), COALESCE((SELECT MAX(id) FROM public.tenants), 1), true);
SELECT setval(pg_get_serial_sequence('public.companies', 'id'), COALESCE((SELECT MAX(id) FROM public.companies), 1), true);
SELECT setval(pg_get_serial_sequence('public.branches', 'id'), COALESCE((SELECT MAX(id) FROM public.branches), 1), true);
SELECT setval(pg_get_serial_sequence('public.warehouses', 'id'), COALESCE((SELECT MAX(id) FROM public.warehouses), 1), true);
SELECT setval(pg_get_serial_sequence('public.intercompany_relationships', 'id'), COALESCE((SELECT MAX(id) FROM public.intercompany_relationships), 1), true);
SELECT setval(pg_get_serial_sequence('public.user_company_access', 'id'), COALESCE((SELECT MAX(id) FROM public.user_company_access), 1), true);


-- 5. ROW LEVEL SECURITY & PERMISSIONS
-- ------------------------------------------------------------------------------

-- Grant permissions to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Enable RLS on newly created multi-company tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.tenants;
CREATE POLICY "Public access policy" ON public.tenants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.companies;
CREATE POLICY "Public access policy" ON public.companies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.branches;
CREATE POLICY "Public access policy" ON public.branches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.warehouses;
CREATE POLICY "Public access policy" ON public.warehouses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.user_company_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.user_company_access;
CREATE POLICY "Public access policy" ON public.user_company_access FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.intercompany_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.intercompany_relationships;
CREATE POLICY "Public access policy" ON public.intercompany_relationships FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload_schema';
