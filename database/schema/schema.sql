-- ==============================================================================
-- AGROCHEM / ANJANI ERP COMPLETE SUPABASE DATABASE SCHEMA
-- Compatible with PostgreSQL / Supabase
-- ==============================================================================

-- Notify PostgREST to reload cache at the end
CREATE OR REPLACE FUNCTION notify_pgrst_reload() RETURNS void AS $$
BEGIN
  NOTIFY pgrst, 'reload_schema';
END;
$$ LANGUAGE plpgsql;

-- 1. CLIENTS TABLE
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

-- 2. SUPPLIERS TABLE
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

-- 3. ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  details TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. MASTER OPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.master_options (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  value VARCHAR(255) NOT NULL,
  parent_value VARCHAR(255) NULL
);

-- 5. INVENTORY ITEMS (Raw materials, packaging, bottles, tech)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NULL,
  unit VARCHAR(50) NULL,
  reorder_level DECIMAL(15,2) DEFAULT 0.00,
  item_subtype VARCHAR(100) NULL,
  item_size VARCHAR(100) NULL,
  description TEXT NULL,
  product_id INT NULL,
  stock DOUBLE PRECISION DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. PRODUCTS (Finished goods catalog)
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
  inventory_item_id INT REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. PRODUCT PACKAGING
CREATE TABLE IF NOT EXISTS public.product_packaging (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  packaging_size VARCHAR(100) NOT NULL,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  sell_price DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. STOCK BATCHES
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

-- 9. STOCK MOVEMENTS
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

-- 10. PURCHASES TABLE
CREATE TABLE IF NOT EXISTS public.purchases (
  id SERIAL PRIMARY KEY,
  purchase_no VARCHAR(100) UNIQUE NULL,
  invoice_no VARCHAR(100) NULL,
  supplier_id INT REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(255) NULL,
  date DATE NULL,
  due_date DATE NULL,
  status VARCHAR(50) DEFAULT 'Pending',
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

-- 11. PURCHASE ITEMS
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  item_type VARCHAR(100) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  batch_no VARCHAR(100) NULL,
  expiry_date DATE NULL,
  total DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. ORDERS (Sales Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100) UNIQUE NULL,
  client_id INT REFERENCES public.clients(id) ON DELETE SET NULL,
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

-- 13. ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  discount DECIMAL(15,2) DEFAULT 0.00,
  total DECIMAL(15,2) DEFAULT 0.00,
  packaging_size VARCHAR(100) NULL,
  bottle_inventory_id INT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id SERIAL PRIMARY KEY,
  expense_no VARCHAR(100) NULL,
  category VARCHAR(100) NULL,
  amount DECIMAL(15,2) DEFAULT 0.00,
  date DATE NULL,
  payment_mode VARCHAR(100) NULL,
  account_id INT REFERENCES public.accounts(id) ON DELETE SET NULL,
  description TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 15. TRANSACTIONS TABLE (Cash & Bank Ledger)
CREATE TABLE IF NOT EXISTS public.transactions (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'Payment', 'Receipt', etc.
  ref_no VARCHAR(100) NULL,
  ref_type VARCHAR(100) NULL,
  party_id INT NULL,
  party_name VARCHAR(255) NULL,
  amount DECIMAL(15,2) DEFAULT 0.00,
  mode VARCHAR(50) DEFAULT 'Cash',
  date DATE NULL,
  notes TEXT NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  tax_rate DECIMAL(15,2) DEFAULT 0.00,
  account_id INT REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. FORMULATIONS
CREATE TABLE IF NOT EXISTS public.formulations (
  id SERIAL PRIMARY KEY,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  batch_no VARCHAR(100) NULL,
  batch_size DECIMAL(15,2) DEFAULT 0.00,
  batch_unit VARCHAR(50) NULL,
  date DATE NULL,
  status VARCHAR(50) DEFAULT 'Draft',
  notes TEXT NULL,
  bom_template_id INT NULL,
  expected_qty DECIMAL(15,2) DEFAULT 0.00,
  actual_qty DECIMAL(15,2) DEFAULT 0.00,
  loss_qty DECIMAL(15,2) DEFAULT 0.00,
  loss_percent DECIMAL(15,2) DEFAULT 0.00,
  technical_cost DECIMAL(15,2) DEFAULT 0.00,
  packaging_cost DECIMAL(15,2) DEFAULT 0.00,
  label_cost DECIMAL(15,2) DEFAULT 0.00,
  bottle_cost DECIMAL(15,2) DEFAULT 0.00,
  box_cost DECIMAL(15,2) DEFAULT 0.00,
  other_cost DECIMAL(15,2) DEFAULT 0.00,
  total_percentage DECIMAL(15,2) DEFAULT 0.00,
  total_quantity DECIMAL(15,2) DEFAULT 0.00,
  total_cost DECIMAL(15,2) DEFAULT 0.00,
  cost_per_unit DECIMAL(15,2) DEFAULT 0.00,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 17. FORMULATION INGREDIENTS
CREATE TABLE IF NOT EXISTS public.formulation_ingredients (
  id SERIAL PRIMARY KEY,
  formulation_id INT NOT NULL REFERENCES public.formulations(id) ON DELETE CASCADE,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  category VARCHAR(100) NULL,
  percentage DECIMAL(15,2) DEFAULT 0.00,
  cost_per_unit DECIMAL(15,2) DEFAULT 0.00,
  total_cost DECIMAL(15,2) DEFAULT 0.00,
  entry_mode VARCHAR(50) DEFAULT 'percentage',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 18. DAILY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.daily_transactions (
  id SERIAL PRIMARY KEY,
  txn_no VARCHAR(100) NULL,
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
  tax_mode VARCHAR(50) DEFAULT 'Non-GST',
  tax_rate DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  due_date DATE NULL,
  vehicle_number VARCHAR(100) NULL,
  driver_name VARCHAR(100) NULL,
  driver_contact VARCHAR(100) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 19. DAILY TRANSACTION ITEMS
CREATE TABLE IF NOT EXISTS public.daily_transaction_items (
  id SERIAL PRIMARY KEY,
  daily_transaction_id INT NOT NULL REFERENCES public.daily_transactions(id) ON DELETE CASCADE,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) DEFAULT 0.00,
  total DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 20. DAILY TRANSACTION MATERIALS
CREATE TABLE IF NOT EXISTS public.daily_transaction_materials (
  id SERIAL PRIMARY KEY,
  daily_transaction_id INT NOT NULL REFERENCES public.daily_transactions(id) ON DELETE CASCADE,
  item_id INT NULL,
  item_name VARCHAR(255) NULL,
  item_type VARCHAR(100) NULL,
  quantity DECIMAL(15,2) DEFAULT 0.00,
  unit VARCHAR(50) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 21. PRODUCTION BATCHES
CREATE TABLE IF NOT EXISTS public.production_batches (
  id SERIAL PRIMARY KEY,
  batch_no VARCHAR(100) UNIQUE NULL,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NULL,
  formula_name VARCHAR(255) NULL,
  quantity_produced DOUBLE PRECISION DEFAULT 0.0,
  date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 22. PRODUCTION INGREDIENTS
CREATE TABLE IF NOT EXISTS public.production_ingredients (
  id SERIAL PRIMARY KEY,
  production_id INT NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  inventory_id INT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  inventory_name VARCHAR(255) NULL,
  quantity_used DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enables unrestricted read/write for both authenticated users and anon clients
-- ==============================================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'clients', 'suppliers', 'products', 'product_packaging', 'inventory_items',
    'stock_batches', 'stock_movements', 'purchases', 'purchase_items', 'orders',
    'order_items', 'expenses', 'accounts', 'transactions', 'formulations',
    'formulation_ingredients', 'daily_transactions', 'daily_transaction_items',
    'daily_transaction_materials', 'master_options', 'production_batches', 'production_ingredients'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow full access to all" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Allow full access to all" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- PRODUCTION INVENTORY TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION sync_production_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.inventory_items 
    SET stock = COALESCE(stock, 0) - NEW.quantity_used 
    WHERE id = NEW.inventory_id;
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.inventory_id = NEW.inventory_id THEN
      UPDATE public.inventory_items 
      SET stock = COALESCE(stock, 0) + OLD.quantity_used - NEW.quantity_used 
      WHERE id = NEW.inventory_id;
    ELSE
      UPDATE public.inventory_items SET stock = COALESCE(stock, 0) + OLD.quantity_used WHERE id = OLD.inventory_id;
      UPDATE public.inventory_items SET stock = COALESCE(stock, 0) - NEW.quantity_used WHERE id = NEW.inventory_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.inventory_items 
    SET stock = COALESCE(stock, 0) + OLD.quantity_used 
    WHERE id = OLD.inventory_id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_production_inventory ON public.production_ingredients;

CREATE TRIGGER trg_sync_production_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.production_ingredients
FOR EACH ROW EXECUTE FUNCTION sync_production_inventory();

-- ==============================================================================
-- SEED INITIAL MASTER DATA (Safe inserts)
-- ==============================================================================

INSERT INTO public.accounts (id, name, details) VALUES (1, 'Tirth', 'Main Account') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.master_options (category, value, parent_value) VALUES
  ('technical_unit', 'Litre', NULL),
  ('technical_unit', 'Ml', NULL),
  ('technical_unit', 'Kg', NULL),
  ('technical_unit', 'Gram', NULL),
  ('bottle_option', '1 LTR', 'HDPE'),
  ('bottle_option', '500 ML', 'HDPE'),
  ('bottle_option', '250 ML', 'HDPE'),
  ('bottle_option', '100 ML', 'HDPE'),
  ('bottle_option', '1 LTR', 'PET'),
  ('bottle_option', '500 ML', 'PET'),
  ('bottle_option', '100 ML', 'Glass'),
  ('bottle_option', '50 ML', 'Glass'),
  ('box_option', '20 LTR', 'Corrugated'),
  ('box_option', '10 LTR', 'Corrugated'),
  ('box_option', '5 LTR', 'Corrugated'),
  ('box_option', '10 KG', 'Corrugated'),
  ('box_option', '5 KG', 'Corrugated')
ON CONFLICT DO NOTHING;

-- Reload Supabase Schema Cache
NOTIFY pgrst, 'reload_schema';
