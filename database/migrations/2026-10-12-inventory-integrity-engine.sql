-- ==============================================================================
-- AGROCHEM ERP MIGRATION: INVENTORY INTEGRITY & PACKAGING ENGINE
-- Date: 2026-10-12
-- Safe & Idempotent Migration: Uses IF NOT EXISTS, preserving all existing data
-- ==============================================================================

-- 1. Extend PRODUCT_PACKAGING table with SKU-specific box capacities & packaging links
ALTER TABLE public.product_packaging 
  ADD COLUMN IF NOT EXISTS units_per_box INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS box_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS box_inventory_id INT REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bottle_inventory_id INT REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS volume_ml DOUBLE PRECISION DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS weight_gm DOUBLE PRECISION DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS density DOUBLE PRECISION DEFAULT 1.0;

-- 2. Extend ORDER_ITEMS table with box, loose, and volume tracking
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS box_quantity DECIMAL(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS loose_quantity DECIMAL(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS bottles_per_box INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_inventory_id INT REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS box_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS total_units DECIMAL(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_volume DECIMAL(15,3) DEFAULT 0.00;

-- 3. Extend INVENTORY_ITEMS with density and negative stock guard override policy
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS density DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN DEFAULT FALSE;

-- 4. Extend STOCK_MOVEMENTS for rich audit trails and duplicate-click prevention
ALTER TABLE public.stock_movements 
  ADD COLUMN IF NOT EXISTS item_id INT REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS movement_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS previous_stock DECIMAL(15,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS new_stock DECIMAL(15,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS reference_id INT NULL,
  ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS user_name VARCHAR(255) NULL;

-- 5. Create PRODUCTION_BATCHES & PRODUCTION_INGREDIENTS if not already present
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

CREATE TABLE IF NOT EXISTS public.production_ingredients (
  id SERIAL PRIMARY KEY,
  production_id INT NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  inventory_id INT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  inventory_name VARCHAR(255) NULL,
  quantity_used DOUBLE PRECISION DEFAULT 0.0,
  unit VARCHAR(50) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on production tables if not already enabled
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_ingredients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batches' AND policyname = 'Allow access to all production_batches') THEN
    CREATE POLICY "Allow access to all production_batches" ON public.production_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_ingredients' AND policyname = 'Allow access to all production_ingredients') THEN
    CREATE POLICY "Allow access to all production_ingredients" ON public.production_ingredients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Performance Indexes for Lightning Fast Lookups
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch_id ON public.stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON public.stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_idemp ON public.stock_movements(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_product_packaging_box_inv ON public.product_packaging(box_inventory_id);
CREATE INDEX IF NOT EXISTS idx_product_packaging_bottle_inv ON public.product_packaging(bottle_inventory_id);

-- 7. Backfill Packaging Volume & Weight Constants based on existing strings
UPDATE public.product_packaging
SET volume_ml = 1000.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 10 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%1%lit%' AND (volume_ml = 0 OR volume_ml IS NULL);

UPDATE public.product_packaging
SET volume_ml = 500.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 20 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%500%ml%' AND (volume_ml = 0 OR volume_ml IS NULL);

UPDATE public.product_packaging
SET volume_ml = 250.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 40 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%250%ml%' AND (volume_ml = 0 OR volume_ml IS NULL);

UPDATE public.product_packaging
SET volume_ml = 100.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 100 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%100%ml%' AND (volume_ml = 0 OR volume_ml IS NULL);

UPDATE public.product_packaging
SET weight_gm = 1000.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 10 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%1%kg%' AND (weight_gm = 0 OR weight_gm IS NULL);

UPDATE public.product_packaging
SET weight_gm = 500.0, units_per_box = CASE WHEN units_per_box <= 0 THEN 20 ELSE units_per_box END
WHERE lower(packaging_size) LIKE '%500%g%' AND (weight_gm = 0 OR weight_gm IS NULL);

-- 8. Backfill existing order items total_units if missing
UPDATE public.order_items
SET total_units = quantity
WHERE (total_units IS NULL OR total_units = 0) AND quantity > 0;

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload_schema';
