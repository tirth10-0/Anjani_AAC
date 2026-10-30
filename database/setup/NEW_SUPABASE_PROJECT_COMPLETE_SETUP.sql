-- ==============================================================================
-- AGROCHEM / ANJANI ERP - COMPLETE NEW SUPABASE PROJECT SETUP & RESTORATION
-- Run this entire script in Supabase Dashboard -> SQL Editor -> Run
-- This creates all tables, enables RLS, restores all business data & sets sequences.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. CLEANUP ANY PARTIALLY CREATED TABLES FROM PREVIOUS FAILED RUNS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.production_ingredients CASCADE;
DROP TABLE IF EXISTS public.production_batches CASCADE;
DROP TABLE IF EXISTS public.daily_transaction_materials CASCADE;
DROP TABLE IF EXISTS public.daily_transactions CASCADE;
DROP TABLE IF EXISTS public.formulation_ingredients CASCADE;
DROP TABLE IF EXISTS public.formulations CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.purchase_items CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;
DROP TABLE IF EXISTS public.stock_batches CASCADE;
DROP TABLE IF EXISTS public.product_packaging CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.master_options CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- 1. CREATE ALL TABLES (Clean, verified schema with 100% column parity)
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100) NULL,
  bank_name VARCHAR(255) NULL,
  branch VARCHAR(255) NULL,
  ifsc VARCHAR(50) NULL,
  balance DECIMAL(15,2) DEFAULT 0.00,
  details TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.master_options (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  value VARCHAR(255) NOT NULL,
  parent_value VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NULL,
  unit VARCHAR(50) NULL,
  reorder_level DECIMAL(15,2) DEFAULT 0.00,
  stock DOUBLE PRECISION DEFAULT 0.00,
  item_subtype VARCHAR(100) NULL,
  item_size VARCHAR(100) NULL,
  description TEXT NULL,
  product_id INT NULL,
  density DOUBLE PRECISION DEFAULT 1.0,
  allow_negative BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  batch_no VARCHAR(100) NULL,
  brand VARCHAR(255) NULL,
  category VARCHAR(100) NULL,
  item_type VARCHAR(100) DEFAULT 'Finished Good',
  unit VARCHAR(50) DEFAULT 'LITRE',
  composition TEXT NULL,
  packaging VARCHAR(255) NULL,
  item_subtype VARCHAR(100) NULL,
  item_size VARCHAR(100) NULL,
  reorder_level DECIMAL(15,2) DEFAULT 0.00,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  sell_price DECIMAL(15,2) DEFAULT 0.00,
  gst VARCHAR(50) DEFAULT '',
  status VARCHAR(50) DEFAULT 'Active',
  description TEXT NULL,
  cibrc_reg_no VARCHAR(100) NULL,
  toxicity_triangle VARCHAR(50) DEFAULT 'Green',
  antidote_statement TEXT NULL,
  inventory_item_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.product_packaging (
  id SERIAL PRIMARY KEY,
  product_id INT NULL,
  packaging_size VARCHAR(100) NOT NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  sell_price DECIMAL(15,2) DEFAULT 0.00,
  units_per_box INT DEFAULT 1,
  box_type VARCHAR(100) DEFAULT NULL,
  box_inventory_id INT NULL,
  volume_ml DOUBLE PRECISION DEFAULT 0.0,
  weight_gm DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.stock_batches (
  id SERIAL PRIMARY KEY,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  item_type VARCHAR(100) NULL,
  batch_no VARCHAR(100) NULL,
  purchase_id INT NULL,
  supplier_id INT NULL,
  purchase_date DATE NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  initial_qty DECIMAL(15,2) DEFAULT 0.00,
  current_qty DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  expiry_date DATE NULL,
  warehouse VARCHAR(100) DEFAULT 'Main Warehouse',
  inventory_item_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id SERIAL PRIMARY KEY,
  batch_id INT NULL,
  txn_type VARCHAR(100) NULL,
  txn_id INT NULL,
  qty DECIMAL(15,2) DEFAULT 0.00,
  previous_stock DECIMAL(15,2) DEFAULT 0.00,
  new_stock DECIMAL(15,2) DEFAULT 0.00,
  user_name VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id SERIAL PRIMARY KEY,
  purchase_no VARCHAR(100) UNIQUE NULL,
  invoice_no VARCHAR(100) NULL,
  supplier_id INT NULL,
  supplier_name VARCHAR(255) NULL,
  date DATE NULL,
  due_date DATE NULL,
  status VARCHAR(50) DEFAULT 'Pending',
  payment_status VARCHAR(50) DEFAULT 'Unpaid',
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  inventory_sync_status VARCHAR(50) DEFAULT 'Pending',
  inventory_sync_issues INT DEFAULT 0,
  inventory_sync_notes TEXT NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  tax_rate DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NULL,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  item_type VARCHAR(100) NULL,
  batch_no VARCHAR(100) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  total DECIMAL(15,2) DEFAULT 0.00,
  expiry_date DATE NULL,
  warehouse VARCHAR(100) DEFAULT 'Main Warehouse',
  base_quantity DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100) UNIQUE NULL,
  client_id INT NULL,
  client_name VARCHAR(255) NULL,
  date DATE NULL,
  due_date DATE NULL,
  status VARCHAR(50) DEFAULT 'Completed',
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  tax DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NULL,
  product_id INT NULL,
  inventory_item_id INT NULL,
  product_name VARCHAR(255) NULL,
  packing_size VARCHAR(100) NULL,
  bottle_inventory_id INT NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  total DECIMAL(15,2) DEFAULT 0.00,
  box_quantity INT DEFAULT 0,
  loose_quantity DOUBLE PRECISION DEFAULT 0.0,
  bottles_per_box INT DEFAULT 0,
  total_units DOUBLE PRECISION DEFAULT 0.0,
  total_volume DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NULL,
  title VARCHAR(255) NULL,
  amount DECIMAL(15,2) DEFAULT 0.00,
  date DATE NULL,
  payee VARCHAR(255) NULL,
  payment_mode VARCHAR(50) DEFAULT 'Cash',
  payment_method VARCHAR(50) DEFAULT 'Cash',
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NULL,
  ref_id VARCHAR(100) NULL,
  ref_type VARCHAR(100) NULL,
  party_type VARCHAR(50) NULL,
  party_id INT NULL,
  party_name VARCHAR(255) NULL,
  txn_type VARCHAR(50) NULL,
  amount DECIMAL(15,2) DEFAULT 0.00,
  mode VARCHAR(50) DEFAULT 'Cash',
  payment_method VARCHAR(50) DEFAULT 'Cash',
  account_id INT NULL,
  account_name VARCHAR(255) NULL,
  reference_no VARCHAR(100) NULL,
  date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.formulations (
  id SERIAL PRIMARY KEY,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  batch_no VARCHAR(100) NULL,
  batch_size DECIMAL(15,2) DEFAULT 0.00,
  batch_unit VARCHAR(50) DEFAULT 'Litre',
  date DATE NULL,
  status VARCHAR(50) DEFAULT 'Draft',
  notes TEXT NULL,
  total_percentage DECIMAL(15,2) DEFAULT 0.00,
  total_quantity DECIMAL(15,2) DEFAULT 0.00,
  total_cost DECIMAL(15,2) DEFAULT 0.00,
  cost_per_unit DECIMAL(15,2) DEFAULT 0.00,
  density DOUBLE PRECISION DEFAULT 1.0,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.formulation_ingredients (
  id SERIAL PRIMARY KEY,
  formulation_id INT NULL,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  percentage DECIMAL(15,2) DEFAULT 0.00,
  cost_per_unit DECIMAL(15,2) DEFAULT 0.00,
  total_cost DECIMAL(15,2) DEFAULT 0.00,
  entry_mode VARCHAR(50) DEFAULT 'quantity',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.daily_transactions (
  id SERIAL PRIMARY KEY,
  txn_no VARCHAR(100) UNIQUE NULL,
  date DATE NULL,
  client_id INT NULL,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  item_summary TEXT NULL,
  material_summary TEXT NULL,
  material_count INT DEFAULT 0,
  linked_order_id INT NULL,
  linked_receipt_txn_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.daily_transaction_materials (
  id SERIAL PRIMARY KEY,
  daily_transaction_id INT NULL,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  item_type VARCHAR(100) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.production_batches (
  id SERIAL PRIMARY KEY,
  batch_no VARCHAR(100) UNIQUE NULL,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  formula_name VARCHAR(255) NULL,
  quantity_produced DOUBLE PRECISION DEFAULT 0.0,
  date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.production_ingredients (
  id SERIAL PRIMARY KEY,
  production_id INT NULL,
  inventory_id INT NULL,
  inventory_name VARCHAR(255) NULL,
  quantity_used DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. ENABLE ROW LEVEL SECURITY & PERMISSIVE ACCESS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.clients;
CREATE POLICY "Public access policy" ON public.clients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.suppliers;
CREATE POLICY "Public access policy" ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.accounts;
CREATE POLICY "Public access policy" ON public.accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.master_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.master_options;
CREATE POLICY "Public access policy" ON public.master_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.inventory_items;
CREATE POLICY "Public access policy" ON public.inventory_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.products;
CREATE POLICY "Public access policy" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.product_packaging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.product_packaging;
CREATE POLICY "Public access policy" ON public.product_packaging FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.stock_batches;
CREATE POLICY "Public access policy" ON public.stock_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.stock_movements;
CREATE POLICY "Public access policy" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.purchases;
CREATE POLICY "Public access policy" ON public.purchases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.purchase_items;
CREATE POLICY "Public access policy" ON public.purchase_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.orders;
CREATE POLICY "Public access policy" ON public.orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.order_items;
CREATE POLICY "Public access policy" ON public.order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.expenses;
CREATE POLICY "Public access policy" ON public.expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.transactions;
CREATE POLICY "Public access policy" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.formulations;
CREATE POLICY "Public access policy" ON public.formulations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.formulation_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.formulation_ingredients;
CREATE POLICY "Public access policy" ON public.formulation_ingredients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.daily_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.daily_transactions;
CREATE POLICY "Public access policy" ON public.daily_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.daily_transaction_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.daily_transaction_materials;
CREATE POLICY "Public access policy" ON public.daily_transaction_materials FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.production_batches;
CREATE POLICY "Public access policy" ON public.production_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.production_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.production_ingredients;
CREATE POLICY "Public access policy" ON public.production_ingredients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. RESTORE PRODUCTION BUSINESS DATA (100% PRESERVED)
-- ------------------------------------------------------------------------------
-- Restore clients (1 rows)
INSERT INTO public.clients ("id", "name", "contact", "email", "address", "city", "gst", "type", "credit_limit", "balance", "created_at")
VALUES
  (8, 'First Client', '98765 43210', NULL, 'Rajkot', NULL, '', 'Retailer', 0, 0, '2026-10-05T07:39:01.483546')
ON CONFLICT DO NOTHING;

-- Restore suppliers (1 rows)
INSERT INTO public.suppliers ("id", "name", "company_name", "contact", "email", "address", "city", "gst", "category", "payment_terms", "balance", "status", "created_at")
VALUES
  (1, 'New Supplier', NULL, '98675 43210', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'Active', '2026-09-16T13:22:34.517484')
ON CONFLICT DO NOTHING;

-- Restore accounts (2 rows)
INSERT INTO public.accounts ("id", "name", "account_number", "bank_name", "branch", "ifsc", "balance", "created_at")
VALUES
  (3, 'Tirth', NULL, NULL, NULL, NULL, 0, '2026-09-23T11:41:28.163524'),
  (4, 'New', NULL, NULL, NULL, NULL, 0, '2026-10-03T11:30:15.342075')
ON CONFLICT DO NOTHING;

-- Restore master_options (9 rows)
INSERT INTO public.master_options ("id", "category", "value", "parent_value")
VALUES
  (2, 'bottle_option', '1 Ltr', 'Imida'),
  (3, 'bottle_option', '500 Ml', 'Imida'),
  (4, 'bottle_option', '250 Ml', 'Imida'),
  (5, 'bottle_option', '100 Ml', 'Imida'),
  (6, 'bottle_option', '1 Ltr', 'Sygenta'),
  (8, 'bottle_option', '1 Kg', 'Dibba'),
  (9, 'bottle_option', '500 Gm', 'Dibba'),
  (7, 'box_option', '10*10*10', 'Common Box'),
  (10, 'box_option', '500 Ml', 'New Box')
ON CONFLICT DO NOTHING;

-- Restore inventory_items (12 rows)
INSERT INTO public.inventory_items ("id", "name", "category", "unit", "reorder_level", "stock", "item_subtype", "item_size", "description", "created_at")
VALUES
  (6, 'Imida Bottle 500 Ml', 'Bottles', 'Nos', 0, 500, 'Imida', '500 Ml', NULL, '2026-09-16T13:32:34.98925'),
  (7, 'Imida Bottle 250 Ml', 'Bottles', 'Nos', 0, 500, 'Imida', '250 Ml', NULL, '2026-09-16T13:32:56.755234'),
  (13, 'Abamectin 1.9% EC', 'Technical', 'Litre', 0, 800, 'Insecticide', NULL, NULL, '2026-10-05T04:01:55.838448'),
  (17, 'Dibba Bottle 1 Kg', 'Bottles', 'Nos', 0, 2000, 'Dibba', '1 Kg', NULL, '2026-10-05T04:45:26.174067'),
  (3, 'Xylene', 'Technical', 'Kg', 0, 417.025862068966, 'Solvent', NULL, NULL, '2026-09-16T13:22:11.422384'),
  (4, 'Dmf', 'Technical', 'Kg', 0, 0, 'Solvent', NULL, NULL, '2026-09-16T13:22:24.31471'),
  (19, 'Emamectin Benzoate 5% SG', 'Technical', 'Kg', 0, 1000, 'Insecticide', NULL, NULL, '2026-10-05T07:42:14.640275'),
  (14, 'Imida Bottle 1 Ltr', 'Bottles', 'Nos', 0, 800, 'Imida', '1 Ltr', NULL, '2026-10-05T04:02:06.397683'),
  (15, 'Common Box Box 10*10*10', 'Boxes', 'Nos', 0, 880, 'Common Box', '10*10*10', NULL, '2026-10-05T04:02:16.833425'),
  (2, 'Chlorantraniliprole 18.5% SC', 'Technical', 'Litre', 0, 2710, 'Insecticide', NULL, NULL, '2026-09-16T13:21:57.034401'),
  (18, 'Dibba Bottle 500 Gm', 'Bottles', 'Nos', 0, 1000, 'Dibba', '500 Gm', NULL, '2026-10-05T04:45:36.555558'),
  (9, 'New One', 'Technical', 'Litre', 0, 1000, 'Insecticide', NULL, NULL, '2026-10-04T10:48:00.778649')
ON CONFLICT DO NOTHING;

-- Restore products (4 rows)
INSERT INTO public.products ("id", "name", "batch_no", "brand", "category", "item_type", "unit", "composition", "packaging", "item_subtype", "item_size", "reorder_level", "purchase_price", "sell_price", "gst", "status", "description", "cibrc_reg_no", "toxicity_triangle", "antidote_statement", "inventory_item_id", "created_at")
VALUES
  (2, 'Chlorantraniliprole 18.5% SC', NULL, 'Korvan', 'Insecticides', 'Finished Good', 'Litre', '', NULL, NULL, NULL, 0, 0, 2100, '', 'Active', '', NULL, NULL, NULL, 2, '2026-09-16T13:21:00.523915'),
  (5, 'Emamectin 1.9% EC', NULL, 'Emamex', 'Insecticides', 'Finished Good', 'Litre', '', NULL, NULL, NULL, 0, 1500, 2300, '', 'Active', '', NULL, NULL, NULL, NULL, '2026-10-03T11:15:53.157127'),
  (1, 'Abamectin 1.9% EC', NULL, 'Mivora', 'Insecticides', 'Finished Good', 'Litre', '', NULL, NULL, NULL, 0, 0, 850, '', 'Active', '', NULL, NULL, NULL, 13, '2026-09-16T13:20:21.408733'),
  (7, 'Emamectin Benzoate 5% SG', NULL, 'Emasev', 'Insecticides', 'Finished Good', 'Kg', '', NULL, NULL, NULL, 0, 450, 710, '', 'Active', '', NULL, NULL, NULL, 19, '2026-10-05T04:44:22.812054')
ON CONFLICT DO NOTHING;

-- Restore product_packaging (11 rows)
INSERT INTO public.product_packaging ("id", "product_id", "packaging_size", "purchase_price", "sell_price", "created_at")
VALUES
  (1, 1, '1 Litre', 0, 850, '2026-09-16T13:20:21.857253'),
  (2, 1, '500 Ml', 0, 650, '2026-09-16T13:20:21.857253'),
  (3, 1, '250 Ml', 0, 450, '2026-09-16T13:20:21.857253'),
  (4, 1, '100 Ml', 0, 250, '2026-09-16T13:20:21.857253'),
  (5, 2, '1 Litre', 0, 2100, '2026-09-16T13:21:01.358193'),
  (6, 2, '500 Ml', 0, 1900, '2026-09-16T13:21:01.358193'),
  (8, 5, '1 Litre', 1500, 2300, '2026-10-03T11:15:53.411552'),
  (9, 5, '500 Ml', 0, 1600, '2026-10-03T11:15:53.411552'),
  (10, 6, '1 Litre', 1600, 2500, '2026-10-04T10:47:06.367795'),
  (11, 7, '1 Kg', 450, 710, '2026-10-05T04:44:23.208269'),
  (12, 7, '500 Gram', 0, 450, '2026-10-05T04:44:23.208269')
ON CONFLICT DO NOTHING;

-- Restore stock_batches (14 rows)
INSERT INTO public.stock_batches ("id", "item_id", "item_name", "item_type", "batch_no", "purchase_id", "supplier_id", "purchase_date", "purchase_price", "initial_qty", "current_qty", "unit", "expiry_date", "warehouse", "created_at")
VALUES
  (28, 13, 'Abamectin 1.9% EC', 'Inventory', 'Open-10', NULL, NULL, NULL, 1500, 1000, 800, 'Litre', NULL, NULL, '2026-10-05T04:01:55.965492'),
  (40, 17, 'Dibba Bottle 1 Kg', 'Inventory', 'P-01', 10, 1, '2026-10-06', 20, 1000, 2000, 'Nos', NULL, NULL, '2026-10-06T14:18:13.027958'),
  (36, 19, 'Emamectin Benzoate 5% SG', 'Inventory', 'P-01', 8, 1, '2026-10-05', 450, 1000, 1000, 'Kg', NULL, NULL, '2026-10-05T07:42:42.509365'),
  (29, 14, 'Imida Bottle 1 Ltr', 'Inventory', 'Open-11', NULL, NULL, NULL, 20, 1000, 800, 'Nos', NULL, NULL, '2026-10-05T04:02:06.559463'),
  (30, 15, 'Common Box Box 10*10*10', 'Inventory', 'Open-12', NULL, NULL, NULL, 15, 1000, 880, 'Nos', NULL, NULL, '2026-10-05T04:02:17.073063'),
  (2, 2, 'Chlorantraniliprole 18.5% SC', 'Inventory', 'OPEN-02', NULL, NULL, NULL, 1500, 3500, 2710, 'Litre', NULL, NULL, '2026-09-16T13:21:57.168227'),
  (24, 9, 'New One', 'Inventory', 'Open-09', NULL, NULL, NULL, 1600, 1000, 1000, 'Litre', NULL, NULL, '2026-10-04T10:48:00.910614'),
  (33, 18, 'Dibba Bottle 500 Gm', 'Inventory', 'Open-15', NULL, NULL, NULL, 8, 1000, 1000, 'Nos', NULL, NULL, '2026-10-05T04:45:36.702577'),
  (4, 4, 'Dmf', 'Inventory', 'Open-04', NULL, NULL, NULL, 100, 10, 0, 'Kg', NULL, NULL, '2026-09-16T13:22:24.444881'),
  (3, 3, 'Xylene', 'Inventory', 'OPEN-03', NULL, NULL, NULL, 150, 500, 417.025862068966, 'Kg', NULL, NULL, '2026-09-16T13:22:11.563933'),
  (7, 6, 'Imida Bottle 500 Ml', 'Inventory', 'OPEN-06', NULL, NULL, NULL, 18, 500, 500, 'Nos', NULL, NULL, '2026-09-16T13:32:35.103734'),
  (8, 7, 'Imida Bottle 250 Ml', 'Inventory', 'OPEN-07', NULL, NULL, NULL, 15, 500, 500, 'Nos', NULL, NULL, '2026-09-16T13:32:56.885516'),
  (37, 5, 'Emamectin 1.9% EC', 'Catalog', 'P-01', 9, 1, '2026-10-05', 450, 150, 150, 'Litre', NULL, NULL, '2026-10-05T07:43:07.393385'),
  (32, 17, 'Dibba Bottle 1 Kg', 'Inventory', 'Open-14', NULL, NULL, NULL, 12, 1000, 0, 'Nos', NULL, NULL, '2026-10-05T04:45:26.466363')
ON CONFLICT DO NOTHING;

-- Restore purchases (3 rows)
INSERT INTO public.purchases ("id", "purchase_no", "supplier_id", "supplier_name", "date", "total_amount", "paid_amount", "status", "payment_status", "notes", "created_at", "invoice_no", "due_date")
VALUES
  (8, 'P-01', 1, 'New Supplier', '2026-10-05', 450000, 0, 'Delivered', 'Pending', '', '2026-10-05T07:42:42.22693', '', NULL),
  (9, 'P-02', 1, 'New Supplier', '2026-10-05', 67500, 0, 'Delivered', 'Pending', '', '2026-10-05T07:43:07.097655', '', NULL),
  (10, 'P-03', 1, 'New Supplier', '2026-10-06', 20000, 0, 'Delivered', 'Pending', '', '2026-10-06T14:17:47.405397', '', NULL)
ON CONFLICT DO NOTHING;

-- Restore purchase_items (3 rows)
INSERT INTO public.purchase_items ("id", "purchase_id", "item_id", "item_name", "item_type", "batch_no", "quantity", "unit", "unit_price", "total", "expiry_date", "warehouse", "base_quantity")
VALUES
  (8, 8, 19, 'Emamectin Benzoate 5% SG', 'Inventory', 'P-01', 1000, NULL, 450, 450000, NULL, NULL, NULL),
  (9, 9, 5, 'Emamectin 1.9% EC', 'Catalog', 'P-01', 150, NULL, 450, 67500, NULL, NULL, NULL),
  (12, 10, 17, 'Dibba Bottle 1 Kg', 'Inventory', 'P-01', 1000, NULL, 20, 20000, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Restore orders (1 rows)
INSERT INTO public.orders ("id", "order_no", "client_id", "client_name", "date", "due_date", "status", "total_amount", "paid_amount", "discount", "tax", "notes", "created_at")
VALUES
  (17, 'O-01', 8, 'First Client', '2026-10-10', NULL, 'Completed', 105000, 400000, 0, 0, NULL, '2026-10-10T06:19:43.524549')
ON CONFLICT DO NOTHING;

-- Restore order_items (1 rows)
INSERT INTO public.order_items ("id", "order_id", "product_id", "inventory_item_id", "product_name", "packing_size", "bottle_inventory_id", "quantity", "unit_price", "discount", "total")
VALUES
  (30, 17, 2, NULL, 'Chlorantraniliprole 18.5% SC', '1 Litre', 14, 50, 2100, 0, 105000)
ON CONFLICT DO NOTHING;

-- Restore expenses (2 rows)
INSERT INTO public.expenses ("id", "category", "amount", "date", "payee", "payment_mode", "notes", "created_at")
VALUES
  (3, 'Electricity & Utilities', 1500, '2026-09-23', NULL, 'Cash', 'Light Bill', '2026-09-23T11:42:16.314635'),
  (4, 'Freight & Transport', 2400, '2026-10-03', NULL, 'Cash', '', '2026-10-03T11:31:44.803365')
ON CONFLICT DO NOTHING;

-- Restore transactions (2 rows)
INSERT INTO public.transactions ("id", "type", "ref_id", "ref_type", "party_id", "party_name", "amount", "mode", "date", "notes", "account_id", "created_at")
VALUES
  (2, 'Receipt', NULL, 'Manual', NULL, '', 50000, 'Cash', '2026-09-23', '[Ref: Txn-2]', 3, '2026-09-23T11:41:40.358379'),
  (3, 'Payment', NULL, 'Manual', NULL, '', 20000, 'Cash', '2026-10-03', '[Ref: Txn-3]', 4, '2026-10-03T11:30:29.809643')
ON CONFLICT DO NOTHING;

-- Restore formulations (3 rows)
INSERT INTO public.formulations ("id", "product_id", "product_name", "batch_no", "batch_size", "batch_unit", "date", "status", "notes", "total_percentage", "total_quantity", "total_cost", "cost_per_unit", "created_by", "created_at")
VALUES
  (8, 1, 'Abamectin 1.9% EC', 'B-01', 100, 'L', NULL, 'Draft', '', 0, 0, 0, 0, NULL, '2026-10-05T08:45:38.488566'),
  (9, 2, 'Chlorantraniliprole 18.5% SC', 'B-02', 100, 'L', NULL, 'Draft', '', 0, 0, 0, 0, NULL, '2026-10-05T08:47:19.797635'),
  (11, 5, 'Emamectin 1.9% EC', 'B-03', 100, 'L', NULL, 'Draft', '', 0, 0, 0, 0, NULL, '2026-10-09T10:16:01.744303')
ON CONFLICT DO NOTHING;

-- Restore formulation_ingredients (15 rows)
INSERT INTO public.formulation_ingredients ("id", "formulation_id", "product_id", "product_name", "quantity", "unit", "percentage", "cost_per_unit", "total_cost", "entry_mode", "created_at")
VALUES
  (1, 1, NULL, 'Xylene', 10, 'KG', 0, 0, 0, 'quantity', '2026-09-16T13:26:08.312908'),
  (2, 1, NULL, 'Dmf', 10, 'KG', 0, 0, 0, 'quantity', '2026-09-16T13:26:08.312908'),
  (3, 1, NULL, 'Abamectin Technical', 100, 'KG', 0, 0, 0, 'quantity', '2026-09-16T13:26:08.312908'),
  (27, 6, 1, 'Abamectin 1.9% EC', -116, 'Kg', 0, 0, 0, 'percentage', '2026-09-16T15:58:18.743998'),
  (28, 6, 4, 'Dmf', 50, 'Kg', 0, 0, 0, 'percentage', '2026-09-16T15:58:18.743998'),
  (29, 6, 3, 'Xylene', 50, 'Kg', 0, 0, 0, 'percentage', '2026-09-16T15:58:18.743998'),
  (30, 7, 2, 'Chlorantraniliprole 18.5% SC', 20, 'Litre', 0, 0, 0, 'percentage', '2026-09-24T11:38:42.227077'),
  (31, 8, 13, 'Abamectin 1.9% EC', 90, 'L', 0, 0, 0, 'quantity', '2026-10-05T08:45:38.733116'),
  (32, 8, 3, 'Xylene', 10, 'KG', 0, 0, 0, 'quantity', '2026-10-05T08:45:38.733116'),
  (33, 9, 2, 'Chlorantraniliprole 18.5% SC', 85, 'L', 0, 0, 0, 'quantity', '2026-10-05T08:47:20.062785'),
  (34, 9, 3, 'Xylene', 15, 'KG', 0, 0, 0, 'quantity', '2026-10-05T08:47:20.062785'),
  (35, 10, 2, 'Chlorantraniliprole 18.5% SC', 80, 'L', 0, 0, 0, 'quantity', '2026-10-08T17:50:59.369376'),
  (36, 10, 13, 'Abamectin 1.9% EC', 10, 'L', 0, 0, 0, 'quantity', '2026-10-08T17:50:59.369376'),
  (37, 11, 19, 'Emamectin Benzoate 5% SG', 90, 'KG', 0, 0, 0, 'quantity', '2026-10-09T10:16:02.201838'),
  (38, 11, 3, 'Xylene', 10, 'KG', 0, 0, 0, 'quantity', '2026-10-09T10:16:02.201838')
ON CONFLICT DO NOTHING;

-- Restore daily_transactions (2 rows)
INSERT INTO public.daily_transactions ("id", "txn_no", "date", "client_id", "total_amount", "paid_amount", "notes", "item_summary", "material_summary", "material_count", "linked_order_id", "linked_receipt_txn_id", "created_at")
VALUES
  (6, 'D-01', '2026-10-05', NULL, 0, 0, '', NULL, 'Common Box Box 10*10*10', 1, NULL, NULL, '2026-10-05T04:04:12.161481'),
  (7, 'D-02', '2026-10-06', NULL, 0, 0, '', NULL, 'Abamectin 1.9% EC', 1, NULL, NULL, '2026-10-06T05:11:45.775559')
ON CONFLICT DO NOTHING;

-- Restore daily_transaction_materials (9 rows)
INSERT INTO public.daily_transaction_materials ("id", "daily_transaction_id", "item_id", "item_name", "item_type", "quantity", "unit", "created_at")
VALUES
  (2, 1, 6, 'Imida Bottle 500 Ml', 'Bottles', 175, 'Nos', '2026-09-17T03:39:56.491498'),
  (3, 1, 1, 'Abamectin 1.9% EC', 'Technical', 1000, 'Litre', '2026-09-17T03:39:56.491498'),
  (4, 2, 1, 'Abamectin 1.9% EC', 'Technical', 480, 'Litre', '2026-10-03T11:29:39.732726'),
  (5, 2, 5, 'Imida Bottle 1 Ltr', 'Bottles', 250, 'Nos', '2026-10-03T11:29:39.732726'),
  (6, 3, 2, 'Chlorantraniliprole 18.5% SC', 'Technical', 570, 'Litre', '2026-10-04T06:47:58.091433'),
  (7, 4, 10, 'Common Box Box 10*10*10', 'Boxes', 20, 'Nos', '2026-10-04T13:51:37.377413'),
  (8, 5, 10, 'Common Box Box 10*10*10', 'Boxes', 100, 'Nos', '2026-10-05T03:43:21.874131'),
  (9, 6, 15, 'Common Box Box 10*10*10', 'Boxes', 100, 'Nos', '2026-10-05T04:04:12.316529'),
  (10, 7, 13, 'Abamectin 1.9% EC', 'Technical', 100, 'Litre', '2026-10-06T05:11:46.199092')
ON CONFLICT DO NOTHING;

-- 4. RESET PRIMARY KEY SERIAL SEQUENCES
-- ------------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('public.clients', 'id'), COALESCE((SELECT MAX(id) FROM public.clients), 1), true);
SELECT setval(pg_get_serial_sequence('public.suppliers', 'id'), COALESCE((SELECT MAX(id) FROM public.suppliers), 1), true);
SELECT setval(pg_get_serial_sequence('public.accounts', 'id'), COALESCE((SELECT MAX(id) FROM public.accounts), 1), true);
SELECT setval(pg_get_serial_sequence('public.master_options', 'id'), COALESCE((SELECT MAX(id) FROM public.master_options), 1), true);
SELECT setval(pg_get_serial_sequence('public.inventory_items', 'id'), COALESCE((SELECT MAX(id) FROM public.inventory_items), 1), true);
SELECT setval(pg_get_serial_sequence('public.products', 'id'), COALESCE((SELECT MAX(id) FROM public.products), 1), true);
SELECT setval(pg_get_serial_sequence('public.product_packaging', 'id'), COALESCE((SELECT MAX(id) FROM public.product_packaging), 1), true);
SELECT setval(pg_get_serial_sequence('public.stock_batches', 'id'), COALESCE((SELECT MAX(id) FROM public.stock_batches), 1), true);
SELECT setval(pg_get_serial_sequence('public.stock_movements', 'id'), COALESCE((SELECT MAX(id) FROM public.stock_movements), 1), true);
SELECT setval(pg_get_serial_sequence('public.purchases', 'id'), COALESCE((SELECT MAX(id) FROM public.purchases), 1), true);
SELECT setval(pg_get_serial_sequence('public.purchase_items', 'id'), COALESCE((SELECT MAX(id) FROM public.purchase_items), 1), true);
SELECT setval(pg_get_serial_sequence('public.orders', 'id'), COALESCE((SELECT MAX(id) FROM public.orders), 1), true);
SELECT setval(pg_get_serial_sequence('public.order_items', 'id'), COALESCE((SELECT MAX(id) FROM public.order_items), 1), true);
SELECT setval(pg_get_serial_sequence('public.expenses', 'id'), COALESCE((SELECT MAX(id) FROM public.expenses), 1), true);
SELECT setval(pg_get_serial_sequence('public.transactions', 'id'), COALESCE((SELECT MAX(id) FROM public.transactions), 1), true);
SELECT setval(pg_get_serial_sequence('public.formulations', 'id'), COALESCE((SELECT MAX(id) FROM public.formulations), 1), true);
SELECT setval(pg_get_serial_sequence('public.formulation_ingredients', 'id'), COALESCE((SELECT MAX(id) FROM public.formulation_ingredients), 1), true);
SELECT setval(pg_get_serial_sequence('public.daily_transactions', 'id'), COALESCE((SELECT MAX(id) FROM public.daily_transactions), 1), true);
SELECT setval(pg_get_serial_sequence('public.daily_transaction_materials', 'id'), COALESCE((SELECT MAX(id) FROM public.daily_transaction_materials), 1), true);
SELECT setval(pg_get_serial_sequence('public.production_batches', 'id'), COALESCE((SELECT MAX(id) FROM public.production_batches), 1), true);
SELECT setval(pg_get_serial_sequence('public.production_ingredients', 'id'), COALESCE((SELECT MAX(id) FROM public.production_ingredients), 1), true);

-- 5. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload_schema';
