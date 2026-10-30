-- ==============================================================================
-- FIX: Grant missing permissions to anon and authenticated roles
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- This resolves: "permission denied for table inventory_items" and similar errors
-- ==============================================================================

-- 1. Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Grant full access to all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- 3. Grant access to all sequences (needed for INSERT with SERIAL ids)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 4. Ensure future tables automatically get the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload_schema';
