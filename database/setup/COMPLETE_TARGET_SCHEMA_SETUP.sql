-- ==============================================================================
-- AGROCHEM / ESTIMATE ERP - COMPLETE TARGET SUPABASE PROJECT SCHEMA SETUP
-- Target Database: New Supabase PostgreSQL Project
-- Run this script in the New Supabase Project: Dashboard -> SQL Editor -> Run
-- Creates all tables, foreign keys, performance indexes, triggers, and grants.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. MULTI-COMPANY & TENANT HIERARCHY TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.companies (
  id SERIAL PRIMARY KEY,
  tenant_id INT DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  gstin VARCHAR(50) NULL,
  pan VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  pincode VARCHAR(20) NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  logo_url TEXT NULL,
  is_manufacturing BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.branches (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  gstin VARCHAR(50) NULL,
  phone VARCHAR(50) NULL,
  is_head_office BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.warehouses (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id INT NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  location TEXT NULL,
  warehouse_type VARCHAR(50) DEFAULT 'Finished Goods',
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_company_access (
  id SERIAL PRIMARY KEY,
  user_id UUID NULL,
  user_email VARCHAR(255) NULL,
  tenant_id INT DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'admin',
  is_default BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id SERIAL PRIMARY KEY,
  role_key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  badge VARCHAR(50) NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  all_permissions BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id INT NULL,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  performed_by VARCHAR(255) NULL,
  details JSONB NULL,
  ip_address VARCHAR(50) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. PARTIES: CLIENTS & SUPPLIERS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  gst VARCHAR(50) NULL,
  type VARCHAR(50) DEFAULT 'Retailer',
  credit_limit DECIMAL(15,2) DEFAULT 0.00,
  balance DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NULL,
  contact VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  gst VARCHAR(50) NULL,
  category VARCHAR(100) NULL,
  payment_terms INT DEFAULT 30,
  balance DECIMAL(15,2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 3. PRODUCTS & PACKAGING
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  batch_no VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  category VARCHAR(100) NULL,
  item_type VARCHAR(50) NULL,
  unit VARCHAR(50) DEFAULT 'Nos',
  composition TEXT NULL,
  packaging VARCHAR(100) NULL,
  item_subtype VARCHAR(50) NULL,
  item_size VARCHAR(50) NULL,
  reorder_level INT DEFAULT 0,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  sell_price DECIMAL(15,2) DEFAULT 0.00,
  gst DECIMAL(5,2) DEFAULT 18.00,
  status VARCHAR(50) DEFAULT 'Active',
  description TEXT NULL,
  cibrc_reg_no VARCHAR(100) NULL,
  toxicity_triangle VARCHAR(50) NULL,
  antidote_statement TEXT NULL,
  inventory_item_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.product_packaging (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  packaging_size VARCHAR(100) NOT NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  sell_price DECIMAL(15,2) DEFAULT 0.00,
  units_per_box INT DEFAULT 1,
  box_type VARCHAR(100) NULL,
  box_inventory_id INT NULL,
  volume_ml DECIMAL(10,2) NULL,
  weight_gm DECIMAL(10,2) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 4. RAW MATERIALS & PACKAGING INVENTORY
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Nos',
  reorder_level INT DEFAULT 0,
  stock DECIMAL(15,2) DEFAULT 0.00,
  item_subtype VARCHAR(50) NULL,
  item_size VARCHAR(50) NULL,
  description TEXT NULL,
  product_id INT NULL REFERENCES public.products(id) ON DELETE SET NULL,
  density DECIMAL(8,4) NULL,
  allow_negative BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 5. WAREHOUSE STOCK BATCHES & AUDIT MOVEMENTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_batches (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  batch_no VARCHAR(100) NOT NULL,
  purchase_id INT NULL,
  supplier_id INT NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_date DATE NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  initial_qty DECIMAL(15,2) NOT NULL,
  current_qty DECIMAL(15,2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Nos',
  expiry_date DATE NULL,
  warehouse VARCHAR(100) DEFAULT 'Main Warehouse',
  inventory_item_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  warehouse_id INT NULL REFERENCES public.warehouses(id) ON DELETE SET NULL,
  branch_id INT NULL REFERENCES public.branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id SERIAL PRIMARY KEY,
  batch_id INT NULL,
  txn_type VARCHAR(50) NOT NULL,
  txn_id INT NULL,
  qty DECIMAL(15,2) NOT NULL,
  previous_stock DECIMAL(15,2) DEFAULT 0.00,
  new_stock DECIMAL(15,2) DEFAULT 0.00,
  user_name VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  warehouse_id INT NULL REFERENCES public.warehouses(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 6. SALES ORDERS & ORDER DISPATCHES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100) NOT NULL UNIQUE,
  client_id INT NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name VARCHAR(255) NULL,
  date DATE NOT NULL,
  due_date DATE NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  tax DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  branch_id INT NULL REFERENCES public.branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id INT NULL REFERENCES public.products(id) ON DELETE SET NULL,
  inventory_item_id INT NULL,
  product_name VARCHAR(255) NULL,
  packing_size VARCHAR(100) NULL,
  bottle_inventory_id INT NULL,
  quantity DECIMAL(15,2) NOT NULL,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  total DECIMAL(15,2) DEFAULT 0.00,
  box_quantity INT DEFAULT 0,
  loose_quantity INT DEFAULT 0,
  bottles_per_box INT DEFAULT 0,
  total_units DECIMAL(15,2) DEFAULT 0.00,
  total_volume DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 7. PURCHASES, INVOICES, PRODUCTION, EXPENSES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchases (
  id SERIAL PRIMARY KEY,
  purchase_no VARCHAR(100) NOT NULL UNIQUE,
  supplier_id INT NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255) NULL,
  date DATE NOT NULL,
  due_date DATE NULL,
  status VARCHAR(50) DEFAULT 'Received',
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(15,2) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  warehouse VARCHAR(100) DEFAULT 'Main Warehouse',
  batch_no VARCHAR(100) NULL,
  expiry_date DATE NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.production_records (
  id SERIAL PRIMARY KEY,
  batch_no VARCHAR(100) NOT NULL,
  product_id INT NULL REFERENCES public.products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  output_qty DECIMAL(15,2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Ltr',
  status VARCHAR(50) DEFAULT 'Completed',
  start_date DATE NULL,
  end_date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.production_logs (
  id SERIAL PRIMARY KEY,
  production_id INT NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL,
  ingredient_name VARCHAR(255) NOT NULL,
  required_qty DECIMAL(15,2) NOT NULL,
  consumed_qty DECIMAL(15,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  date DATE NOT NULL,
  description TEXT NULL,
  reference_no VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'Paid',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.daily_transactions (
  id SERIAL PRIMARY KEY,
  txn_no VARCHAR(100) NOT NULL UNIQUE,
  txn_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(100) NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_mode VARCHAR(50) DEFAULT 'Cash',
  notes TEXT NULL,
  status VARCHAR(50) DEFAULT 'Completed',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(100) NOT NULL UNIQUE,
  order_id INT NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  client_id INT NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  subtotal DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'Unpaid',
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id INT NULL REFERENCES public.products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(15,2) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 18.00,
  total DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.intercompany_transfers (
  id SERIAL PRIMARY KEY,
  transfer_no VARCHAR(100) NOT NULL UNIQUE,
  source_company_id INT NOT NULL REFERENCES public.companies(id),
  dest_company_id INT NOT NULL REFERENCES public.companies(id),
  source_warehouse_id INT NULL REFERENCES public.warehouses(id),
  dest_warehouse_id INT NULL REFERENCES public.warehouses(id),
  status VARCHAR(50) DEFAULT 'Pending',
  transfer_date DATE NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.intercompany_settings (
  id SERIAL PRIMARY KEY,
  company_a_id INT NOT NULL REFERENCES public.companies(id),
  company_b_id INT NOT NULL REFERENCES public.companies(id),
  relationship_type VARCHAR(100) DEFAULT 'Co-Marketing',
  auto_dispatch_inward BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.formulations (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  standard_batch_size DECIMAL(15,2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Ltr',
  status VARCHAR(50) DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.formulation_items (
  id SERIAL PRIMARY KEY,
  formulation_id INT NOT NULL REFERENCES public.formulations(id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity DECIMAL(15,4) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  percentage DECIMAL(8,4) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id SERIAL PRIMARY KEY,
  entry_no VARCHAR(100) NOT NULL,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  account_id INT NULL REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  debit DECIMAL(15,2) DEFAULT 0.00,
  credit DECIMAL(15,2) DEFAULT 0.00,
  narration TEXT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 8. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_stock_batches_wh ON public.stock_batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_comp ON public.stock_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_item ON public.stock_batches(item_id, item_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_wh ON public.stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_company ON public.orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders(client_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_pkg_product ON public.product_packaging(product_id);

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOG IMMUTABILITY TRIGGER
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit log entries cannot be deleted to ensure forensic compliance.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutability ON public.audit_logs;
CREATE TRIGGER trg_audit_log_immutability
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_immutability();

-- ------------------------------------------------------------------------------
-- 10. POSTGREST SCHEMA RELOAD & EXPLICIT API GRANTS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
  all_tables text[] := ARRAY[
    'tenants', 'companies', 'branches', 'warehouses', 'user_company_access', 'user_roles', 'audit_logs',
    'clients', 'suppliers', 'products', 'product_packaging', 'inventory_items',
    'stock_batches', 'stock_movements', 'orders', 'order_items', 'purchases', 'purchase_items',
    'production_records', 'production_logs', 'expenses', 'daily_transactions', 'invoices',
    'invoice_items', 'intercompany_transfers', 'intercompany_settings', 'formulations',
    'formulation_items', 'chart_of_accounts', 'ledger_entries'
  ];
BEGIN
  FOR i IN 1..array_length(all_tables, 1) LOOP
    tbl := all_tables[i];
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated, service_role', tbl);
      -- Disable RLS for standard ERP client direct access
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload_schema';
