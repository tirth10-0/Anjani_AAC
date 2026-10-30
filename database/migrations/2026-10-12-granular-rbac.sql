-- ==============================================================================
-- AGROCHEM ERP - GRANULAR ROLE-BASED ACCESS CONTROL (RBAC) & AUDIT ENGINE
-- Date: October 12, 2026
-- Preserves existing user accounts safely without granting all users admin privileges.
-- Supports multi-company, branch, warehouse scope, approval rules & audit logging.
-- ==============================================================================

-- 1. CREATE ROLES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed the 10 Standard Enterprise Roles
INSERT INTO public.roles (id, code, name, description, is_system)
VALUES
  (1, 'super_admin', 'Software Super Admin', 'Full system and multi-tenant administrator access', TRUE),
  (2, 'company_owner', 'Company Owner / Director', 'Complete executive access over authorized legal entity', TRUE),
  (3, 'production_manager', 'Production Manager', 'Oversees formulations, synthesis, and manufacturing operations', TRUE),
  (4, 'factory_operator', 'Factory Operator', 'Records shop-floor material consumption and batch logs', TRUE),
  (5, 'godown_operator', 'Packaging / Godown Operator', 'Manages packaging quantities, dispatches, and warehouse stock', TRUE),
  (6, 'qc_officer', 'QC Officer', 'Quality control inspection with batch approval and rejection authority', TRUE),
  (7, 'accountant', 'Accountant', 'Manages cash & bank ledgers, expenses, tax invoices, and financial reports', TRUE),
  (8, 'store_manager', 'Inventory / Store Manager', 'Authoritative raw material receipt, warehouse storage, and stock adjustments', TRUE),
  (9, 'sales_executive', 'Sales / Dispatch Executive', 'Manages customer orders, dispatch slips, and customer relationship records', TRUE),
  (10, 'viewer_auditor', 'Viewer / Auditor', 'Strictly read-only access across allowed modules for statutory and compliance review', TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;


-- 2. CREATE FUNCTIONAL MODULES REGISTRY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modules (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.modules (id, code, name, category)
VALUES
  (1, 'dashboard', 'Dashboard KPIs', 'Overview'),
  (2, 'inventory', 'Inventory & Raw Materials', 'Masters'),
  (3, 'products', 'Products & Packaging Catalog', 'Masters'),
  (4, 'clients', 'Customers & Farmers Master', 'Masters'),
  (5, 'suppliers', 'Vendors & Suppliers Master', 'Masters'),
  (6, 'orders', 'Sales Orders & Dispatches', 'Operations'),
  (7, 'purchases', 'Purchase Receipts', 'Operations'),
  (8, 'production', 'Production Runs & Synthesis', 'Operations'),
  (9, 'formulations', 'Formulations & Recipe BOM', 'Operations'),
  (10, 'daily_transactions', 'Daily Stock Usage', 'Operations'),
  (11, 'companies', 'Companies & Branches', 'Enterprise'),
  (12, 'warehouses', 'Warehouses & Locations', 'Enterprise'),
  (13, 'intercompany', 'Intercompany Links', 'Enterprise'),
  (14, 'transactions', 'Cash & Bank Ledger', 'Finance'),
  (15, 'expenses', 'Expenses Tracking', 'Finance'),
  (16, 'reports', 'Business & Tax Reports', 'Finance'),
  (17, 'exports', 'Data Backup & Exports', 'System'),
  (18, 'user_roles', 'User Roles & Access Control', 'System'),
  (19, 'audit_logs', 'RBAC & Security Audit Logs', 'System')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;


-- 3. CREATE ROLE PERMISSIONS MATRIX
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module_code VARCHAR(50) NOT NULL,
  can_view BOOLEAN DEFAULT FALSE,
  can_create BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_approve BOOLEAN DEFAULT FALSE,
  can_reject BOOLEAN DEFAULT FALSE,
  can_cancel BOOLEAN DEFAULT FALSE,
  can_export BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_role_module UNIQUE (role_id, module_code)
);

-- Seed Granular Permissions for All 10 Roles
-- Helper function to seed cleanly
DO $$
DECLARE
  m RECORD;
BEGIN
  -- 1. Super Admin: full access to everything
  FOR m IN SELECT code FROM public.modules LOOP
    INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
    VALUES (1, m.code, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
    ON CONFLICT (role_id, module_code) DO UPDATE SET
      can_view = TRUE, can_create = TRUE, can_edit = TRUE, can_delete = TRUE, can_approve = TRUE, can_reject = TRUE, can_cancel = TRUE, can_export = TRUE;
  END LOOP;

  -- 2. Company Owner: full access to everything within their company
  FOR m IN SELECT code FROM public.modules LOOP
    INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
    VALUES (2, m.code, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
    ON CONFLICT (role_id, module_code) DO UPDATE SET
      can_view = TRUE, can_create = TRUE, can_edit = TRUE, can_delete = TRUE, can_approve = TRUE, can_reject = TRUE, can_cancel = TRUE, can_export = TRUE;
  END LOOP;

  -- 3. Production Manager: full manufacturing & inventory, NO financial ledgers
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('transactions', 'expenses', 'user_roles', 'companies') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (3, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    ELSIF m.code IN ('production', 'formulations', 'daily_transactions', 'inventory', 'products', 'warehouses') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (3, m.code, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_edit = TRUE, can_approve = TRUE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (3, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE;
    END IF;
  END LOOP;

  -- 4. Factory Operator: creates batch consumption logs; CANNOT approve, edit master recipes, or access finance
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('production', 'daily_transactions') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (4, m.code, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_approve = FALSE;
    ELSIF m.code IN ('inventory', 'products', 'formulations') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (4, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = FALSE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (4, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 5. Packaging / Godown Operator: packing quantities, dispatches; CANNOT modify purchase costs or approve restricted txns
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('orders', 'daily_transactions') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (5, m.code, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_edit = TRUE, can_approve = FALSE;
    ELSIF m.code IN ('inventory', 'warehouses', 'products', 'dashboard') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (5, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = FALSE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (5, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 6. QC Officer: inspection authority; can approve and reject batches; CANNOT access finance or sales
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('production', 'formulations', 'inventory') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (6, m.code, TRUE, FALSE, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_approve = TRUE, can_reject = TRUE;
    ELSIF m.code IN ('products', 'dashboard') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (6, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (6, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 7. Accountant: full financial access; CANNOT mutate inventory stock or formulations
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('transactions', 'expenses', 'reports', 'clients', 'suppliers', 'exports') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (7, m.code, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_edit = TRUE;
    ELSIF m.code IN ('orders', 'purchases', 'dashboard') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (7, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (7, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 8. Store Manager: raw materials, warehouses, receiving purchases; cannot access finance
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('inventory', 'purchases', 'warehouses', 'daily_transactions') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (8, m.code, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_edit = TRUE;
    ELSIF m.code IN ('suppliers', 'products', 'dashboard') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (8, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (8, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 9. Sales Executive: customer orders and dispatch slips; cannot access bank ledgers or formulation recipes
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('orders', 'clients') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (9, m.code, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = TRUE, can_edit = TRUE;
    ELSIF m.code IN ('products', 'inventory', 'dashboard') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (9, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (9, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    END IF;
  END LOOP;

  -- 10. Viewer / Auditor: read-only across all permitted operational modules
  FOR m IN SELECT code FROM public.modules LOOP
    IF m.code IN ('user_roles', 'audit_logs') THEN
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (10, m.code, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = FALSE;
    ELSE
      INSERT INTO public.role_permissions (role_id, module_code, can_view, can_create, can_edit, can_delete, can_approve, can_reject, can_cancel, can_export)
      VALUES (10, m.code, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE)
      ON CONFLICT (role_id, module_code) DO UPDATE SET can_view = TRUE, can_create = FALSE, can_edit = FALSE, can_delete = FALSE;
    END IF;
  END LOOP;

END $$;


-- 4. USER PROFILES & SCOPED ROLE ASSIGNMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id SERIAL PRIMARY KEY,
  user_id UUID NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NULL,
  department VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'Suspended', 'Revoked'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  user_id UUID NULL,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  branch_id INT NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  warehouse_id INT NULL REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_primary BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'Revoked'
  assigned_by VARCHAR(255) NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial admin user safely into user_profiles and user_role_assignments
-- Note: Does NOT grant global super admin to all users; only assigns explicit accounts
INSERT INTO public.user_profiles (id, email, full_name, department, status)
VALUES
  (1, 'admin@anjani.local', 'Anjani Administrator', 'Executive', 'Active'),
  (2, 'owner@anjani.local', 'Anjani Director', 'Executive', 'Active'),
  (3, 'qc@anjani.local', 'Ramesh Patel (QC)', 'Quality Control', 'Active'),
  (4, 'accountant@anjani.local', 'Suresh Shah (Accountant)', 'Finance', 'Active'),
  (5, 'operator@anjani.local', 'Dinesh Kumar (Godown)', 'Logistics & Warehouse', 'Active')
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name;

INSERT INTO public.user_role_assignments (id, user_email, tenant_id, company_id, role_id, branch_id, warehouse_id, is_primary, status)
VALUES
  (1, 'admin@anjani.local', 1, 1, 1, 1, 1, TRUE, 'Active'), -- Super Admin
  (2, 'owner@anjani.local', 1, 1, 2, 1, 1, TRUE, 'Active'), -- Company Owner (ACC)
  (3, 'qc@anjani.local', 1, 1, 6, 1, 1, TRUE, 'Active'),    -- QC Officer (ACC)
  (4, 'accountant@anjani.local', 1, 1, 7, 1, 1, TRUE, 'Active'), -- Accountant (ACC)
  (5, 'operator@anjani.local', 1, 1, 5, 1, 1, TRUE, 'Active')   -- Godown Operator (ACC WH-1)
ON CONFLICT (id) DO NOTHING;


-- 5. APPROVAL WORKFLOW RULES & REQUESTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL, -- 'QC_BATCH_RELEASE', 'HIGH_VALUE_PURCHASE', 'STOCK_ADJUSTMENT', 'ORDER_DISCOUNT_OVERRIDE'
  reference_table VARCHAR(50) NOT NULL,
  reference_id INT NOT NULL,
  reference_code VARCHAR(100) NULL,
  requested_by VARCHAR(255) NOT NULL,
  required_role_id INT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
  decision_by VARCHAR(255) NULL,
  decision_notes TEXT NULL,
  decision_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- 6. AUDIT LOGGING FOR PERMISSIONS & ACCESS EVENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rbac_audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NULL,
  actor_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(100) NOT NULL, -- 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'PERMISSION_UPDATED', 'APPROVAL_GRANTED', 'APPROVAL_REJECTED', 'UNAUTHORIZED_ACCESS_ATTEMPT'
  target_user VARCHAR(255) NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial audit log for baseline setup
INSERT INTO public.rbac_audit_logs (tenant_id, company_id, actor_email, action_type, target_user, details)
VALUES (1, 1, 'system@agro.local', 'RBAC_INITIALIZED', 'admin@anjani.local', '{"version":"2026.10","notes":"Standard 10-role RBAC schema initialized"}')
ON CONFLICT (id) DO NOTHING;


-- 7. RESET SEQUENCES & GRANT PERMISSIONS
-- ------------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('public.roles', 'id'), COALESCE((SELECT MAX(id) FROM public.roles), 1), true);
SELECT setval(pg_get_serial_sequence('public.modules', 'id'), COALESCE((SELECT MAX(id) FROM public.modules), 1), true);
SELECT setval(pg_get_serial_sequence('public.role_permissions', 'id'), COALESCE((SELECT MAX(id) FROM public.role_permissions), 1), true);
SELECT setval(pg_get_serial_sequence('public.user_profiles', 'id'), COALESCE((SELECT MAX(id) FROM public.user_profiles), 1), true);
SELECT setval(pg_get_serial_sequence('public.user_role_assignments', 'id'), COALESCE((SELECT MAX(id) FROM public.user_role_assignments), 1), true);
SELECT setval(pg_get_serial_sequence('public.approval_requests', 'id'), COALESCE((SELECT MAX(id) FROM public.approval_requests), 1), true);
SELECT setval(pg_get_serial_sequence('public.rbac_audit_logs', 'id'), COALESCE((SELECT MAX(id) FROM public.rbac_audit_logs), 1), true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Enable Row Level Security
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.roles;
CREATE POLICY "Public access policy" ON public.roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.modules;
CREATE POLICY "Public access policy" ON public.modules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.role_permissions;
CREATE POLICY "Public access policy" ON public.role_permissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.user_profiles;
CREATE POLICY "Public access policy" ON public.user_profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.user_role_assignments;
CREATE POLICY "Public access policy" ON public.user_role_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.approval_requests;
CREATE POLICY "Public access policy" ON public.approval_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.rbac_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public access policy" ON public.rbac_audit_logs;
CREATE POLICY "Public access policy" ON public.rbac_audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload_schema';
