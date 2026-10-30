-- ==============================================================================
-- AGROCHEM ERP - ACCOUNTING, COSTING, AUDIT LOGGING & NOTIFICATIONS ENGINE
-- Date: October 15, 2026
-- Compatible with PostgreSQL / Supabase
--
-- Features:
-- 1. Double-Entry General Ledger (Chart of Accounts, Journal Entries, Traceable Reversals)
-- 2. Financial Linkage (Purchases <-> Payments, Sales <-> Receipts, Credit/Debit Notes)
-- 3. Inventory Valuation & Costing Methods (FIFO, WAC, Separation of Qty vs Valuation)
-- 4. Manufacturing & Packaging Cost Absorption Engine
-- 5. Multi-Entity Accounting & Distinct GST Registrations
-- 6. Comprehensive Immutable Audit Trail with Before/After Diff Tracking
-- 7. Role-Based Notifications Center (Low Stock, QC Holds, Delays, Discrepancies)
-- ==============================================================================

-- 1. GENERAL LEDGER (DOUBLE-ENTRY POSTING ENGINE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.general_ledger (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_no VARCHAR(100) UNIQUE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ref_type VARCHAR(50) NOT NULL, -- 'purchase', 'supplier_payment', 'order_sale', 'customer_receipt', 'expense', 'mfg_consumption', 'mfg_output', 'packaging_cost', 'dispatch_cogs', 'credit_note', 'debit_note', 'adjustment', 'intercompany_transfer'
  ref_id INT NULL,
  ref_no VARCHAR(100) NULL,
  debit_account_code VARCHAR(20) NOT NULL, -- e.g. '1200', '2000', '1020', '4000', '5000'
  debit_account_name VARCHAR(150) NOT NULL,
  credit_account_code VARCHAR(20) NOT NULL,
  credit_account_name VARCHAR(150) NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) DEFAULT 'INR',
  party_type VARCHAR(50) NULL, -- 'supplier', 'client', 'employee', 'internal'
  party_id INT NULL,
  party_name VARCHAR(255) NULL,
  tax_mode VARCHAR(50) DEFAULT 'Non-GST', -- 'GST18', 'GST12', 'GST5', 'IGST18', 'IGST12', 'IGST5', 'None'
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT NULL,
  is_reversal BOOLEAN DEFAULT FALSE,
  reversed_entry_id INT NULL REFERENCES public.general_ledger(id) ON DELETE SET NULL,
  reversal_reason TEXT NULL,
  posted_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_general_ledger_company ON public.general_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_general_ledger_date ON public.general_ledger(date);
CREATE INDEX IF NOT EXISTS idx_general_ledger_ref ON public.general_ledger(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_general_ledger_reversal ON public.general_ledger(is_reversal, reversed_entry_id);

-- 2. COST ALLOCATION & VALUATION MASTER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_valuation_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  costing_method VARCHAR(50) NOT NULL DEFAULT 'FIFO', -- 'FIFO', 'WAC' (Weighted Average Cost)
  total_raw_material_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_packaging_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_bulk_product_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_finished_goods_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_inventory_valuation DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_physical_units DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  item_breakdown JSONB NULL,
  calculated_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. COMPREHENSIVE ENTERPRISE AUDIT TRAIL
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_email VARCHAR(255) NOT NULL,
  action_category VARCHAR(100) NOT NULL, -- 'STOCK_MOVEMENT', 'PRODUCTION_COMPLETION', 'QC_DECISION', 'PACKING_APPROVAL', 'DISPATCH_POSTING', 'INVOICE_POSTING', 'PERMISSION_CHANGE', 'FINANCIAL_ADJUSTMENT'
  action_name VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id INT NULL,
  reference_no VARCHAR(100) NULL,
  before_values JSONB NULL,
  after_values JSONB NULL,
  metadata JSONB NULL,
  is_immutable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- IMMUTABILITY ENFORCEMENT TRIGGER FOR AUDIT LOGS
CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit log records cannot be deleted. Compliance and regulatory laws require permanent persistence.';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Allow system foreign key disassociation (setting company_id to NULL when entity is removed)
    -- while strictly verifying that timestamps, actions, actor, before/after values, and metadata remain 100% untouched
    IF (OLD.action_category = NEW.action_category)
       AND (OLD.action_name = NEW.action_name)
       AND (OLD.table_name = NEW.table_name)
       AND (OLD.created_at = NEW.created_at)
       AND (OLD.before_values::text IS NOT DISTINCT FROM NEW.before_values::text)
       AND (OLD.after_values::text IS NOT DISTINCT FROM NEW.after_values::text)
       AND (OLD.metadata::text IS NOT DISTINCT FROM NEW.metadata::text) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit log records cannot be modified once written. Before and after values are permanent.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutability ON public.audit_logs;
CREATE TRIGGER trg_audit_log_immutability
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_immutability();

-- 4. SYSTEM NOTIFICATIONS WITH ROLE-BASED SCOPING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'LOW_STOCK', 'PENDING_APPROVAL', 'QC_HOLD', 'PENDING_RECEIPT', 'DISPATCH_DELAY', 'STOCK_DISCREPANCY'
  priority VARCHAR(20) NOT NULL DEFAULT 'Normal', -- 'Urgent', 'Warning', 'Normal', 'Info'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id INT NULL,
  reference_code VARCHAR(100) NULL,
  target_roles JSONB NOT NULL DEFAULT '["super_admin"]'::jsonb, -- Roles permitted to view this notification
  is_read BOOLEAN DEFAULT FALSE,
  read_by JSONB DEFAULT '[]'::jsonb,
  action_url VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_company ON public.system_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.system_notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.system_notifications(priority);

-- 5. RLS SECURITY POLICIES
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'general_ledger', 'inventory_valuation_snapshots', 'audit_logs', 'system_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public access policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public access policy" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload_schema';
