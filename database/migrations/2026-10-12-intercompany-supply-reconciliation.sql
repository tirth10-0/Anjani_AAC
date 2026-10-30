-- ==============================================================================
-- Migration: Intercompany Stock Supply & Multi-Entity Reconciliation Engine
-- Date: 2026-10-12
--
-- Features:
-- 1. Intercompany Transfers & Supplies (intercompany_transfers):
--    - Internal stock transfers (same legal entity, no commercial invoice)
--    - Intercompany commercial sales (distinct legal entities, commercial billing)
--    - Consignment supply arrangements (stock physically held at recipient, legally owned by Anjani)
-- 2. Line Items Allocation (intercompany_transfer_items):
--    - Physical batch selection, box + loose quantities, packaging size
--    - Tracking dispatched, received, damaged, shortage, rejected, returned units
-- 3. In-Transit Posting & Single-Counting Guard:
--    - Source stock deducted at dispatch posting
--    - Destination stock credited only upon verified receipt
--    - Zero double-counting while in transit
-- 4. Reconciliation Ledger (intercompany_reconciliations):
--    - Multi-warehouse stock tracking, consignment balances, recipient consumption
-- 5. Ownership attribution on stock_batches:
--    - ownership_company_id column for legal ownership segregation
-- 6. RLS & Performance Indexes
-- ==============================================================================

-- 1. Enhance stock_batches with legal ownership tracking
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS ownership_company_id INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_transfer_id INT NULL;

-- 2. Master Table: intercompany_transfers
CREATE TABLE IF NOT EXISTS public.intercompany_transfers (
  id SERIAL PRIMARY KEY,
  transfer_no VARCHAR(100) UNIQUE NOT NULL,
  transaction_type VARCHAR(50) NOT NULL DEFAULT 'INTERCOMPANY_SALE', -- 'INTERNAL_TRANSFER' or 'INTERCOMPANY_SALE'
  supply_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD_SALE',          -- 'STANDARD_SALE', 'CONSIGNMENT', 'BRANCH_TRANSFER'
  from_company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_warehouse_id INT NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  to_warehouse_id INT NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  ownership_company_id INT NOT NULL DEFAULT 1,                       -- For consignment, stays 1 (Anjani) until sold
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',                       -- Draft, Pending Approval, Approved, In Transit, Partially Received, Received, Rejected, Cancelled
  total_ordered_units INT DEFAULT 0,
  total_dispatched_units INT DEFAULT 0,
  total_received_units INT DEFAULT 0,
  total_damaged_units INT DEFAULT 0,
  total_shortage_units INT DEFAULT 0,
  total_rejected_units INT DEFAULT 0,
  total_returned_units INT DEFAULT 0,
  total_boxes_dispatched INT DEFAULT 0,
  total_loose_dispatched INT DEFAULT 0,
  total_boxes_received INT DEFAULT 0,
  total_loose_received INT DEFAULT 0,
  pricing_terms VARCHAR(100) DEFAULT 'Transfer Price',               -- Transfer Price, Wholesale MRP, At Cost, Consignment Value
  subtotal_amount DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  source_invoice_no VARCHAR(100) NULL,
  destination_purchase_no VARCHAR(100) NULL,
  source_stock_deducted BOOLEAN DEFAULT FALSE,                       -- Single-posting flag at dispatch exit
  destination_stock_credited BOOLEAN DEFAULT FALSE,                  -- Crediting flag upon receipt
  dispatch_date DATE NULL,
  receipt_date DATE NULL,
  dispatched_by VARCHAR(255) NULL,
  received_by VARCHAR(255) NULL,
  approved_by VARCHAR(255) NULL,
  vehicle_no VARCHAR(100) NULL,
  transporter_name VARCHAR(255) NULL,
  eway_bill_no VARCHAR(100) NULL,
  notes TEXT NULL,
  reconciliation_notes TEXT NULL,
  idempotency_key VARCHAR(100) UNIQUE NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Detail Table: intercompany_transfer_items
CREATE TABLE IF NOT EXISTS public.intercompany_transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INT NOT NULL REFERENCES public.intercompany_transfers(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  packaging_size VARCHAR(100) NOT NULL,
  units_per_box INT NOT NULL DEFAULT 10,
  source_stock_batch_id INT NULL REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  source_batch_no VARCHAR(100) NOT NULL,
  destination_stock_batch_id INT NULL REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  destination_batch_no VARCHAR(100) NULL,
  dispatched_units INT NOT NULL DEFAULT 0,
  dispatched_boxes INT NOT NULL DEFAULT 0,
  dispatched_loose INT NOT NULL DEFAULT 0,
  received_units INT NOT NULL DEFAULT 0,
  received_boxes INT NOT NULL DEFAULT 0,
  received_loose INT NOT NULL DEFAULT 0,
  damaged_units INT NOT NULL DEFAULT 0,
  shortage_units INT NOT NULL DEFAULT 0,
  rejected_units INT NOT NULL DEFAULT 0,
  returned_units INT NOT NULL DEFAULT 0,
  unit_price DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  line_status VARCHAR(50) DEFAULT 'In Transit',                       -- In Transit, Received, Damaged, Shortage, Returned
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Reconciliation Snapshots & Audit Ledger: intercompany_reconciliations
CREATE TABLE IF NOT EXISTS public.intercompany_reconciliations (
  id SERIAL PRIMARY KEY,
  reconciliation_no VARCHAR(100) UNIQUE NOT NULL,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_owned_stock INT DEFAULT 0,
  total_dispatched_to_recipients INT DEFAULT 0,
  total_received_by_recipients INT DEFAULT 0,
  total_in_transit INT DEFAULT 0,
  total_consignment_stock INT DEFAULT 0,
  total_reported_consumption INT DEFAULT 0,
  total_damaged INT DEFAULT 0,
  total_shortages INT DEFAULT 0,
  total_discrepancies INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Reconciled',
  reconciled_by VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ict_from_company ON public.intercompany_transfers(from_company_id);
CREATE INDEX IF NOT EXISTS idx_ict_to_company ON public.intercompany_transfers(to_company_id);
CREATE INDEX IF NOT EXISTS idx_ict_status ON public.intercompany_transfers(status);
CREATE INDEX IF NOT EXISTS idx_ict_supply_type ON public.intercompany_transfers(supply_type);
CREATE INDEX IF NOT EXISTS idx_ict_items_transfer_id ON public.intercompany_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_ict_items_source_batch ON public.intercompany_transfer_items(source_stock_batch_id);
CREATE INDEX IF NOT EXISTS idx_ict_items_dest_batch ON public.intercompany_transfer_items(destination_stock_batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_ownership ON public.stock_batches(ownership_company_id);

-- 6. Row Level Security
ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_reconciliations ENABLE ROW LEVEL SECURITY;

-- Permissive policy for authenticated app operations
CREATE POLICY p_ict_access ON public.intercompany_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_ict_items_access ON public.intercompany_transfer_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_ict_recon_access ON public.intercompany_reconciliations FOR ALL USING (true) WITH CHECK (true);
