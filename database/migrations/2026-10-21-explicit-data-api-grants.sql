-- ==============================================================================
-- Migration: 2026-10-21-explicit-data-api-grants.sql (Fail-Safe Version)
-- Purpose: Prepare ERP for Supabase October 30, 2026 Data API breaking change.
-- Explicitly grants least-privilege Data API permissions to 'authenticated' role
-- across all existing ERP tables using dynamic schema checking to prevent 42P01 errors.
-- ==============================================================================

DO $$
DECLARE
  tbl text;
  -- Full CRUD operational tables
  op_tables text[] := ARRAY[
    'tenants', 'companies', 'branches', 'warehouses', 'user_company_access',
    'products', 'product_packaging', 'master_options', 'suppliers', 'clients',
    'inventory_items', 'stock_batches', 'stock_movements',
    'orders', 'order_items', 'order_dispatches', 'dispatch_items', 'dispatch_reversals', 'invoices',
    'purchases', 'purchase_items',
    'formulations', 'formulation_ingredients', 'formulation_versions',
    'production_orders', 'production_materials', 'production_batches', 'production_ingredients',
    'packaging_orders', 'packaging_config_versions', 'packaging_materials_consumed',
    'daily_transactions', 'daily_transaction_items', 'daily_transaction_materials',
    'accounts', 'transactions', 'expenses',
    'intercompany_relationships', 'intercompany_transfers', 'intercompany_transfer_items', 'intercompany_reconciliations',
    'roles', 'modules', 'role_permissions', 'user_profiles', 'user_role_assignments',
    'approval_requests', 'system_notifications'
  ];
  -- Append-only audit & ledger tables (Strict Immutability: SELECT, INSERT only)
  audit_tables text[] := ARRAY[
    'audit_logs', 'rbac_audit_logs', 'general_ledger', 'inventory_valuation_snapshots'
  ];
  granted_count int := 0;
  skipped_count int := 0;
BEGIN
  -- 1. Grant schema usage
  GRANT USAGE ON SCHEMA public TO anon, authenticated;

  -- 2. Safely grant operational tables if they exist
  FOREACH tbl IN ARRAY op_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', tbl);
      granted_count := granted_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  -- 3. Safely grant append-only audit tables if they exist
  FOREACH tbl IN ARRAY audit_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO authenticated;', tbl);
      granted_count := granted_count + 1;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;

  -- 4. Grant access to all auto-increment sequences
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

  -- 5. Safe grant for master_options to anon role (if table exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'master_options'
  ) THEN
    GRANT SELECT ON TABLE public.master_options TO anon;
  END IF;

  RAISE NOTICE 'Data API Grants completed successfully. Granted: % tables, Skipped: % non-existent tables.', granted_count, skipped_count;
END $$;

-- 6. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload_schema';
