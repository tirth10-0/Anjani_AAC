-- ==============================================================================
-- FIX: Allow Data Saving Across All ERP Tables (Supabase RLS Fix)
-- Run this in your Supabase SQL Editor:
-- Dashboard -> Your Project (quxcvoywufjjynluntvg) -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Disable Row Level Security on all ERP tables
ALTER TABLE IF EXISTS clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_packaging DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS inventory_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS formulations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS formulation_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_transaction_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_transaction_materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS master_options DISABLE ROW LEVEL SECURITY;

-- 2. Grant full CRUD permissions to anon and authenticated roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Reload schema cache in PostgREST
NOTIFY pgrst, 'reload_schema';
