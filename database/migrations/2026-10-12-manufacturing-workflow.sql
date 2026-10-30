-- ==============================================================================
-- Migration: Complete Agrochemical Manufacturing Workflow
-- Date: 2026-10-12
--
-- Features:
-- 1. Formulation management with standard quantities, units, batch size, expected yield, and approval status.
-- 2. Formulation versioning (formulation_versions) ensuring historical recipes are never overwritten.
-- 3. Production planning & orders (production_orders) with planned BOM, dates, employees.
-- 4. Material availability, issues, actual consumption, returns, and wastage tracking (production_materials).
-- 5. Production completion with actual output, batch numbers, yield %, and operators.
-- 6. QC status management (Pending, Approved, Rejected, On Hold) and Quarantine segregation.
-- 7. Batch traceability linking finished products to formulations and consumed raw materials.
-- 8. Row Level Security and indexes.
-- ==============================================================================

-- 1. Enhance formulations table with versioning, yield, and approval status
ALTER TABLE public.formulations
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS expected_yield_pct DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS standard_batch_size DECIMAL(15,2) DEFAULT 1000.00,
  ADD COLUMN IF NOT EXISTS standard_unit VARCHAR(50) DEFAULT 'Litre',
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1;

-- Backfill existing formulations as approved with version 1
UPDATE public.formulations
SET
  version = COALESCE(version, 1),
  approval_status = COALESCE(approval_status, 'Approved'),
  expected_yield_pct = COALESCE(expected_yield_pct, 100.00),
  standard_batch_size = COALESCE(standard_batch_size, batch_size, 1000.00),
  standard_unit = COALESCE(standard_unit, batch_unit, 'Litre'),
  company_id = COALESCE(company_id, 1)
WHERE version IS NULL OR approval_status IS NULL;

-- 2. Create formulation_versions table for immutable recipe snapshots
CREATE TABLE IF NOT EXISTS public.formulation_versions (
  id SERIAL PRIMARY KEY,
  formulation_id INT NOT NULL REFERENCES public.formulations(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  product_id INT NULL,
  product_name VARCHAR(255) NULL,
  formula_code VARCHAR(100) NULL,
  batch_size DECIMAL(15,2) DEFAULT 1000.00,
  batch_unit VARCHAR(50) DEFAULT 'Litre',
  expected_yield_pct DECIMAL(5,2) DEFAULT 100.00,
  density DOUBLE PRECISION DEFAULT 1.0,
  ingredients_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_status VARCHAR(50) DEFAULT 'Approved',
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_formulation_version UNIQUE (formulation_id, version)
);

-- 3. Create production_orders table for production planning & job execution
CREATE TABLE IF NOT EXISTS public.production_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100) UNIQUE NOT NULL,
  company_id INT DEFAULT 1,
  branch_id INT NULL,
  warehouse_id INT NULL,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  formulation_id INT NULL REFERENCES public.formulations(id) ON DELETE SET NULL,
  formulation_version INT DEFAULT 1,
  planned_quantity DECIMAL(15,2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'Litre',
  target_start_date DATE NULL,
  target_due_date DATE NULL,
  assigned_operator VARCHAR(255) NULL,
  assigned_supervisor VARCHAR(255) NULL,
  status VARCHAR(50) DEFAULT 'Planned', -- Planned, Materials Issued, In Progress, Completed, Cancelled
  material_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Issued, Reconciled
  qc_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Approved, Rejected, On Hold
  output_batch_no VARCHAR(100) NULL,
  actual_output_qty DECIMAL(15,2) DEFAULT 0.0,
  yield_pct DECIMAL(5,2) DEFAULT 0.0,
  wastage_qty DECIMAL(15,2) DEFAULT 0.0,
  planned_bom JSONB NULL,
  actual_materials JSONB NULL,
  qc_notes TEXT NULL,
  qc_inspected_by VARCHAR(255) NULL,
  qc_inspected_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  idempotency_key VARCHAR(100) UNIQUE NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Enhance production_batches with QC, Orders, Yield, and Quarantine references
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS order_id INT NULL REFERENCES public.production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warehouse_id INT NULL,
  ADD COLUMN IF NOT EXISTS formulation_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS planned_qty DECIMAL(15,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS actual_output_qty DECIMAL(15,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS yield_percentage DECIMAL(5,2) DEFAULT 100.0,
  ADD COLUMN IF NOT EXISTS wastage_qty DECIMAL(15,2) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS qc_status VARCHAR(50) DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS qc_tested_by VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS qc_tested_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS qc_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS operator_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS supervisor_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS is_saleable_posted BOOLEAN DEFAULT false;

-- 5. Enhance stock_batches with Quarantine & QC status segregation
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS is_quarantine BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS qc_status VARCHAR(50) DEFAULT 'Approved',
  ADD COLUMN IF NOT EXISTS production_order_id INT NULL REFERENCES public.production_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_batch_id INT NULL REFERENCES public.production_batches(id) ON DELETE SET NULL;

-- 6. Create production_materials table for tracking issues, actual consumption, returns, and variances
CREATE TABLE IF NOT EXISTS public.production_materials (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  batch_id INT NULL REFERENCES public.production_batches(id) ON DELETE SET NULL,
  inventory_id INT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  inventory_name VARCHAR(255) NULL,
  standard_qty DECIMAL(15,2) DEFAULT 0.0,
  issued_qty DECIMAL(15,2) DEFAULT 0.0,
  consumed_qty DECIMAL(15,2) DEFAULT 0.0,
  returned_qty DECIMAL(15,2) DEFAULT 0.0,
  wastage_qty DECIMAL(15,2) DEFAULT 0.0,
  variance_qty DECIMAL(15,2) DEFAULT 0.0,
  unit VARCHAR(50) NULL,
  consumed_batches JSONB NULL, -- [{batch_id, batch_no, qty_deducted, supplier_name}]
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.formulation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_materials ENABLE ROW LEVEL SECURITY;

-- Permissive policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.formulation_versions;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.formulation_versions;
DROP POLICY IF EXISTS "Enable update for all users" ON public.formulation_versions;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.formulation_versions;
CREATE POLICY "Enable read access for all users" ON public.formulation_versions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.formulation_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.formulation_versions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.formulation_versions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.production_orders;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.production_orders;
DROP POLICY IF EXISTS "Enable update for all users" ON public.production_orders;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.production_orders;
CREATE POLICY "Enable read access for all users" ON public.production_orders FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.production_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.production_orders FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.production_orders FOR DELETE USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.production_materials;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.production_materials;
DROP POLICY IF EXISTS "Enable update for all users" ON public.production_materials;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.production_materials;
CREATE POLICY "Enable read access for all users" ON public.production_materials FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.production_materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.production_materials FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.production_materials FOR DELETE USING (true);

-- 8. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_prod_orders_no ON public.production_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_prod_orders_product_id ON public.production_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_prod_orders_status ON public.production_orders(status);
CREATE INDEX IF NOT EXISTS idx_prod_orders_qc_status ON public.production_orders(qc_status);
CREATE INDEX IF NOT EXISTS idx_prod_materials_order_id ON public.production_materials(order_id);
CREATE INDEX IF NOT EXISTS idx_prod_materials_inv_id ON public.production_materials(inventory_id);
CREATE INDEX IF NOT EXISTS idx_form_versions_form_id ON public.formulation_versions(formulation_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_quarantine ON public.stock_batches(is_quarantine, qc_status);
