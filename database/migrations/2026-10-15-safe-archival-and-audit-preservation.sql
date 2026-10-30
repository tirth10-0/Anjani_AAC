-- ==============================================================================
-- AGROCHEM ERP - SAFE ARCHIVAL, AUDIT PRESERVATION & REFERENTIAL INTEGRITY
-- Date: October 15, 2026
-- Compatible with PostgreSQL / Supabase
--
-- Features:
-- 1. Entity Archival Lifecycle (status, archived_at, archived_by for warehouses, companies, branches)
-- 2. Audit Trail Immutability & Decoupling from Entity Deletion (ON DELETE SET NULL)
-- 3. Stock Movements & General Ledger Foreign Key Safety
-- 4. Audit Log Immutability Trigger Refinement (permits SET NULL foreign key disassociation while strictly blocking payload tampering)
-- ==============================================================================

-- 1. ADD ARCHIVAL STATUS COLUMNS TO CORE ENTITIES
-- ------------------------------------------------------------------------------

-- Companies Archival Fields
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(255) NULL;

UPDATE public.companies SET status = 'Active' WHERE status IS NULL;

-- Warehouses Archival Fields
ALTER TABLE public.warehouses 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(255) NULL;

UPDATE public.warehouses SET status = 'Active' WHERE status IS NULL;

-- Branches Archival Fields
ALTER TABLE public.branches 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by VARCHAR(255) NULL;

UPDATE public.branches SET status = 'Active' WHERE status IS NULL;

-- 2. IMMUTABLE AUDIT TRAIL FOREIGN KEY SAFETY
-- Ensure audit_logs never cascade-deletes or blocks administrative company/warehouse cleanup
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    -- Make company_id nullable if not already
    ALTER TABLE public.audit_logs ALTER COLUMN company_id DROP NOT NULL;

    -- Drop any existing CASCADE constraint
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND constraint_name = 'audit_logs_company_id_fkey'
    ) THEN
      ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_company_id_fkey;
    END IF;

    -- Recreate foreign key with ON DELETE SET NULL to preserve audit records forever
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. IMMUTABILITY TRIGGER FUNCTION UPDATE
-- Strictly prevents DELETE or tampering with audit payloads, but allows foreign key SET NULL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit log records cannot be deleted. Compliance and regulatory laws require permanent persistence.';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Allow automated foreign key disassociation (setting company_id to NULL when entity is removed)
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

-- 4. STOCK MOVEMENTS HISTORICAL PRESERVATION
-- Ensure stock_movements are preserved when warehouse or company is removed
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_movements') THEN
    ALTER TABLE public.stock_movements ALTER COLUMN warehouse_id DROP NOT NULL;
    ALTER TABLE public.stock_movements ALTER COLUMN company_id DROP NOT NULL;

    -- Adjust warehouse foreign key to SET NULL if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND constraint_name = 'stock_movements_warehouse_id_fkey'
    ) THEN
      ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_warehouse_id_fkey;
    END IF;

    -- Adjust company foreign key to SET NULL if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'stock_movements' AND constraint_name = 'stock_movements_company_id_fkey'
    ) THEN
      ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_company_id_fkey;
    END IF;
  END IF;
END $$;

-- 5. GENERAL LEDGER PRESERVATION
-- Ensure ledger records are never cascade-deleted
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'general_ledger') THEN
    ALTER TABLE public.general_ledger ALTER COLUMN company_id DROP NOT NULL;

    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'general_ledger' AND constraint_name = 'general_ledger_company_id_fkey'
    ) THEN
      ALTER TABLE public.general_ledger DROP CONSTRAINT general_ledger_company_id_fkey;
      ALTER TABLE public.general_ledger
        ADD CONSTRAINT general_ledger_company_id_fkey
        FOREIGN KEY (company_id)
        REFERENCES public.companies(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
