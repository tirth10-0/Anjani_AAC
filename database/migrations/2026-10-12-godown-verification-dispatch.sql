-- ==============================================================================
-- Migration: Godown Verification & Multi-Batch Commercial Dispatch Workflow
-- Date: 2026-10-12
--
-- Features:
-- 1. Order enhancement: tracking ordered, dispatched, remaining units, boxes, and loose quantities.
-- 2. Commercial Dispatch Slips (order_dispatches) linking customer orders to warehouse dispatches.
-- 3. Multi-batch dispatch items (dispatch_items) selecting verified physical batches.
-- 4. Single-posting stock deduction with strict anti double-deduction flag (stock_deducted).
-- 5. Dispatch approval workflows (Pending Verification -> Verified -> Approved -> Dispatched).
-- 6. Partial dispatches against one order with real-time remaining balance recalculation.
-- 7. Cloud-unified Invoice linking with ZERO double-deduction (invoices table).
-- 8. Safe cancellations, customer returns, and inventory reversals (dispatch_reversals).
-- 9. Row Level Security and performance indexes.
-- ==============================================================================

-- 1. Enhance orders table with dispatch tracking columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(50) DEFAULT 'Pending Verification',
  ADD COLUMN IF NOT EXISTS total_ordered_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_dispatched_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_remaining_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_boxes_dispatched INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_loose_dispatched INT DEFAULT 0;

-- 2. Enhance order_items table with partial dispatch balances
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS ordered_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_units INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ordered_boxes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched_boxes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_boxes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ordered_loose INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatched_loose INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_loose INT DEFAULT 0;

-- Backfill existing order items if remaining_units is 0
UPDATE public.order_items
SET
  ordered_units = COALESCE(NULLIF(ordered_units, 0), NULLIF(total_units, 0), quantity::int, 1),
  remaining_units = COALESCE(NULLIF(ordered_units, 0), NULLIF(total_units, 0), quantity::int, 1) - COALESCE(dispatched_units, 0),
  ordered_boxes = COALESCE(NULLIF(ordered_boxes, 0), box_quantity, 0),
  remaining_boxes = COALESCE(NULLIF(ordered_boxes, 0), box_quantity, 0) - COALESCE(dispatched_boxes, 0),
  ordered_loose = COALESCE(NULLIF(ordered_loose, 0), loose_quantity, 0),
  remaining_loose = COALESCE(NULLIF(ordered_loose, 0), loose_quantity, 0) - COALESCE(dispatched_loose, 0)
WHERE remaining_units IS NULL OR remaining_units = 0;

-- 3. Create order_dispatches table (Commercial Dispatch Slips)
CREATE TABLE IF NOT EXISTS public.order_dispatches (
  id SERIAL PRIMARY KEY,
  dispatch_no VARCHAR(100) UNIQUE NOT NULL,
  order_id INT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no VARCHAR(100) NOT NULL,
  company_id INT DEFAULT 1,
  warehouse_id INT NULL,
  client_id INT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(50) DEFAULT 'Pending Verification', -- Pending Verification, Verified, Approved, Dispatched, Cancelled
  verified_by VARCHAR(255) NULL,
  verified_at TIMESTAMPTZ NULL,
  verification_notes TEXT NULL,
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMPTZ NULL,
  approval_notes TEXT NULL,
  dispatched_by VARCHAR(255) NULL,
  dispatched_at TIMESTAMPTZ NULL,
  vehicle_no VARCHAR(100) NULL,
  transporter_name VARCHAR(255) NULL,
  driver_contact VARCHAR(100) NULL,
  eway_bill_no VARCHAR(100) NULL,
  invoice_id INT NULL,
  invoice_no VARCHAR(100) NULL,
  delivery_reference VARCHAR(100) NULL,
  total_boxes_dispatched INT DEFAULT 0,
  total_loose_dispatched INT DEFAULT 0,
  total_units_dispatched INT DEFAULT 0,
  stock_deducted BOOLEAN DEFAULT FALSE, -- ANTI DOUBLE-DEDUCTION GUARD
  idempotency_key VARCHAR(100) UNIQUE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create dispatch_items table (Itemized batches dispatched)
CREATE TABLE IF NOT EXISTS public.dispatch_items (
  id SERIAL PRIMARY KEY,
  dispatch_id INT NOT NULL REFERENCES public.order_dispatches(id) ON DELETE CASCADE,
  order_item_id INT NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  packaging_size VARCHAR(100) NOT NULL,
  units_per_box INT NOT NULL DEFAULT 10,
  stock_batch_id INT NULL REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  batch_no VARCHAR(100) NOT NULL,
  boxes_dispatched INT NOT NULL DEFAULT 0,
  loose_dispatched INT NOT NULL DEFAULT 0,
  total_units_dispatched INT NOT NULL,
  unit_price DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create dispatch_reversals table (Returns & Cancellations Audit Ledger)
CREATE TABLE IF NOT EXISTS public.dispatch_reversals (
  id SERIAL PRIMARY KEY,
  dispatch_id INT NOT NULL REFERENCES public.order_dispatches(id) ON DELETE CASCADE,
  reversal_no VARCHAR(100) UNIQUE NOT NULL,
  reversal_type VARCHAR(50) NOT NULL, -- CANCELLATION, CUSTOMER_RETURN, DAMAGED_IN_TRANSIT
  reason TEXT NOT NULL,
  reversal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reversed_by VARCHAR(255) NOT NULL,
  items_reversed JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_restored BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create or enhance invoices table (Accounting Billing with Zero Double-Deduction)
CREATE TABLE IF NOT EXISTS public.invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(100) UNIQUE NOT NULL,
  order_id INT NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  dispatch_id INT NULL REFERENCES public.order_dispatches(id) ON DELETE SET NULL,
  client_id INT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_name VARCHAR(255) NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NULL,
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  payment_status VARCHAR(50) DEFAULT 'Pending',
  is_stock_deducted BOOLEAN DEFAULT FALSE, -- ZERO DOUBLE-DEDUCTION: Always FALSE when generated from dispatch
  created_by VARCHAR(255) NULL,
  company_id INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_dispatches_order_id ON public.order_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_company_id ON public.order_dispatches(company_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_status ON public.order_dispatches(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch_id ON public.dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_batch_id ON public.dispatch_items(stock_batch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_dispatch_id ON public.invoices(dispatch_id);

-- 8. Row Level Security for Dispatches & Invoices
ALTER TABLE public.order_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_dispatches' AND policyname = 'order_dispatches_tenant_isolation'
  ) THEN
    CREATE POLICY order_dispatches_tenant_isolation ON public.order_dispatches
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::integer OR current_setting('app.current_company_id', true) IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'invoices_tenant_isolation'
  ) THEN
    CREATE POLICY invoices_tenant_isolation ON public.invoices
      USING (company_id = NULLIF(current_setting('app.current_company_id', true), '')::integer OR current_setting('app.current_company_id', true) IS NULL);
  END IF;
END $$;
