-- ==============================================================================
-- Migration: Complete Agrochemical QC and Packaging / Bottling Workflow
-- Date: 2026-10-12
--
-- Features:
-- 1. Product-specific packaging configurations & BOM mappings (bottles, caps, labels, cartons).
-- 2. Packaging configuration versioning (packaging_config_versions) & effective dates.
-- 3. Configurable units per box for each SKU (e.g. 10 bottles/box: 205 bottles = 20 boxes + 5 loose).
-- 4. Packaging orders & bottling runs (packaging_orders) with bulk batch selection.
-- 5. Material availability checks & FIFO material deduction.
-- 6. Breakage, leakage, rejected units, carton damage, and unused returns tracking.
-- 7. Quarantine segregation: Unapproved packed batches cannot enter saleable stock.
-- 8. QC approval/rejection workflows releasing finished goods to saleable inventory.
-- 9. Bidirectional traceability (bulk batch <-> packing order <-> finished SKU lot <-> packaging materials).
-- ==============================================================================

-- 1. Enhance product_packaging with BOM references, units_per_box, versioning, and effective dates
ALTER TABLE public.product_packaging
  ADD COLUMN IF NOT EXISTS bottle_inventory_id INT NULL,
  ADD COLUMN IF NOT EXISTS cap_inventory_id INT NULL,
  ADD COLUMN IF NOT EXISTS label_inventory_id INT NULL,
  ADD COLUMN IF NOT EXISTS carton_inventory_id INT NULL,
  ADD COLUMN IF NOT EXISTS units_per_box INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_loose BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS density DOUBLE PRECISION DEFAULT 1.0;

-- 2. Create packaging_config_versions for immutable audit tracking of packaging recipes
CREATE TABLE IF NOT EXISTS public.packaging_config_versions (
  id SERIAL PRIMARY KEY,
  packaging_id INT NOT NULL REFERENCES public.product_packaging(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  packaging_size VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  bottle_inventory_id INT NULL,
  cap_inventory_id INT NULL,
  label_inventory_id INT NULL,
  carton_inventory_id INT NULL,
  units_per_box INT NOT NULL DEFAULT 10,
  allow_loose BOOLEAN DEFAULT TRUE,
  density DOUBLE PRECISION DEFAULT 1.0,
  effective_date DATE DEFAULT CURRENT_DATE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_packaging_config_version UNIQUE (packaging_id, version)
);

-- 3. Create packaging_orders table for bottling and packing runs
CREATE TABLE IF NOT EXISTS public.packaging_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100) UNIQUE NOT NULL,
  company_id INT DEFAULT 1,
  branch_id INT NULL,
  warehouse_id INT NULL,
  bulk_batch_id INT NULL REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  bulk_item_id INT NULL,
  bulk_batch_no VARCHAR(100) NULL,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  packaging_id INT NOT NULL REFERENCES public.product_packaging(id) ON DELETE CASCADE,
  packaging_size VARCHAR(100) NOT NULL,
  units_per_box INT NOT NULL DEFAULT 10,
  planned_bottles INT NOT NULL,
  planned_bulk_qty DECIMAL(15,3) NOT NULL,
  actual_bottles_packed INT DEFAULT 0,
  actual_boxes_packed INT DEFAULT 0,
  actual_loose_packed INT DEFAULT 0,
  actual_bulk_consumed DECIMAL(15,3) DEFAULT 0,
  remaining_bulk_qty DECIMAL(15,3) DEFAULT 0,
  rejected_bottles INT DEFAULT 0,
  bottle_breakage INT DEFAULT 0,
  cap_wastage INT DEFAULT 0,
  label_wastage INT DEFAULT 0,
  carton_wastage INT DEFAULT 0,
  materials_returned JSONB DEFAULT '[]'::jsonb,
  materials_consumed JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'Planned', -- Planned, Materials Issued, In Progress, Completed, Cancelled
  material_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Issued, Reconciled
  qc_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Approved, Rejected, On Hold
  packing_batch_no VARCHAR(100) NULL,
  packed_stock_batch_id INT NULL,
  packed_by VARCHAR(255) NULL,
  verified_by VARCHAR(255) NULL,
  qc_inspected_by VARCHAR(255) NULL,
  qc_notes TEXT NULL,
  idempotency_key VARCHAR(100) UNIQUE NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ NULL,
  qc_at TIMESTAMPTZ NULL
);

-- 4. Enhance stock_batches with packaging specifics & bulk linkage
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS packaging_id INT NULL REFERENCES public.product_packaging(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS packaging_order_id INT NULL REFERENCES public.packaging_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bulk_batch_id INT NULL REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS boxes_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loose_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packing_batch_no VARCHAR(100) NULL;

-- 5. Create packaging_materials_consumed for detailed material traceability
CREATE TABLE IF NOT EXISTS public.packaging_materials_consumed (
  id SERIAL PRIMARY KEY,
  packaging_order_id INT NOT NULL REFERENCES public.packaging_orders(id) ON DELETE CASCADE,
  inventory_item_id INT NULL,
  material_name VARCHAR(255) NOT NULL,
  material_type VARCHAR(50) NOT NULL, -- Bulk, Bottle, Cap, Label, Carton, Other
  required_qty DECIMAL(15,3) NOT NULL,
  issued_qty DECIMAL(15,3) NOT NULL,
  actual_consumed DECIMAL(15,3) NOT NULL,
  wastage_qty DECIMAL(15,3) DEFAULT 0,
  returned_qty DECIMAL(15,3) DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  batch_no VARCHAR(100) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indexes for high performance lookup
CREATE INDEX IF NOT EXISTS idx_pkg_orders_company ON public.packaging_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_pkg_orders_status ON public.packaging_orders(status);
CREATE INDEX IF NOT EXISTS idx_pkg_orders_qc ON public.packaging_orders(qc_status);
CREATE INDEX IF NOT EXISTS idx_pkg_orders_product ON public.packaging_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_pkg_orders_bulk_batch ON public.packaging_orders(bulk_batch_id);
CREATE INDEX IF NOT EXISTS idx_pkg_mat_consumed_order ON public.packaging_materials_consumed(packaging_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_pkg_order ON public.stock_batches(packaging_order_id);

-- 7. Row Level Security for packaging_orders
ALTER TABLE public.packaging_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_materials_consumed ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'packaging_orders' AND policyname = 'packaging_orders_tenant_isolation'
  ) THEN
    CREATE POLICY packaging_orders_tenant_isolation ON public.packaging_orders
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::integer OR current_setting('app.current_company_id', true) IS NULL);
  END IF;
END $$;
