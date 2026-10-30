# Supabase Migration Standards (Effective October 30, 2026 Onward)

## Context & Breaking Change Overview

Beginning **October 30, 2026**, Supabase will no longer automatically grant PostgREST Data API permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on newly created tables in the `public` schema.

Historically, Supabase projects inherited default privileges (`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`). Moving forward, Supabase enforces an explicit least-privilege security model.

**If a new migration creates a table without explicit `GRANT` statements, PostgREST will omit the table from its OpenAPI schema cache and clients will receive error code `PGRST205: Could not find the table 'public.<table_name>' in the schema cache`.**

---

## Required Future Table Migration Template

Whenever a new table is added to this ERP in `database/migrations/`, the migration SQL **MUST** follow this standard pattern:

```sql
-- ==============================================================================
-- Migration: YYYY-MM-DD-<feature-name>.sql
-- Description: Standard Supabase table creation template with explicit Data API grants
-- ==============================================================================

-- 1. Create Table
CREATE TABLE IF NOT EXISTS public.example_feature (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL DEFAULT 1,
  company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_name VARCHAR(150) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Active',
  metadata JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_example_feature_company ON public.example_feature(company_id);
CREATE INDEX IF NOT EXISTS idx_example_feature_status ON public.example_feature(status);

-- 3. Enable Row Level Security (RLS) - NEVER DISABLE RLS
ALTER TABLE public.example_feature ENABLE ROW LEVEL SECURITY;

-- 4. Explicit Data API Grants (Required post Oct 30, 2026)
-- Operational/Transactional Tables:
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.example_feature TO authenticated;

-- For Serial Sequence Primary Keys:
GRANT USAGE, SELECT ON SEQUENCE public.example_feature_id_seq TO authenticated;

-- (For append-only / immutable audit logs, only grant SELECT and INSERT):
-- GRANT SELECT, INSERT ON TABLE public.example_feature TO authenticated;

-- 5. RLS Policies (Company / Tenant Isolation)
CREATE POLICY "authenticated_company_access" ON public.example_feature
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_company_access
      WHERE user_email = auth.jwt()->>'email'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments
      WHERE user_email = auth.jwt()->>'email' AND role_name = 'super_admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_company_access
      WHERE user_email = auth.jwt()->>'email'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments
      WHERE user_email = auth.jwt()->>'email' AND role_name = 'super_admin'
    )
  );

-- 6. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload_schema';
```

---

## Rules & Security Invariants

1. **Never use blanket `GRANT ALL ON ALL TABLES` to solve permission errors.**
2. **Never disable RLS (`DISABLE ROW LEVEL SECURITY`).**
3. **Always grant sequence permissions (`USAGE, SELECT ON SEQUENCE ...`) whenever `SERIAL` or `BIGSERIAL` primary keys are used.**
4. **Always include `NOTIFY pgrst, 'reload_schema';` at the end of DDL migrations so PostgREST immediately discovers the new table.**
5. **Differentiate roles**:
   - `authenticated`: The logged-in ERP user session possessing a verified Supabase Auth JWT.
   - `anon`: Unauthenticated traffic. Anon must never have write access to business records.
