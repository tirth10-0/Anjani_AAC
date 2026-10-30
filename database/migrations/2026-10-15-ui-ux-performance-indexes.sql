-- ==============================================================================
-- AGROCHEM / ANJANI ERP: COMPREHENSIVE UI/UX & HIGH-PERFORMANCE DATABASE INDEXES
-- Optimizes query execution speeds, eliminates sequential table scans,
-- and accelerates multi-company tenant filtering, sorting, and reporting.
-- ==============================================================================

-- 1. Orders & Order Items Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_company_date ON public.orders (company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_dispatch_status ON public.orders (company_id, dispatch_status);
CREATE INDEX IF NOT EXISTS idx_order_items_product_pkg ON public.order_items (order_id, product_id, packaging_id);

-- 2. Stock Batches & Movements (FIFO Deduction & Warehouse Isolation)
CREATE INDEX IF NOT EXISTS idx_stock_batches_comp_item_qty ON public.stock_batches (company_id, item_id, current_qty) WHERE current_qty > 0;
CREATE INDEX IF NOT EXISTS idx_stock_batches_warehouse ON public.stock_batches (warehouse_id, current_qty);
CREATE INDEX IF NOT EXISTS idx_stock_movements_comp_item_date ON public.stock_movements (company_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON public.stock_movements (reference_type, reference_id);

-- 3. Production Orders & Production Batches (Manufacturing Phase)
CREATE INDEX IF NOT EXISTS idx_production_batches_comp_status ON public.production_batches (company_id, status);
CREATE INDEX IF NOT EXISTS idx_production_batches_batch_no ON public.production_batches (batch_no);
CREATE INDEX IF NOT EXISTS idx_production_batches_date ON public.production_batches (company_id, production_date DESC);
CREATE INDEX IF NOT EXISTS idx_production_batches_qc ON public.production_batches (company_id, qc_status);

-- 4. Packaging Orders & Bottling Runs (Packaging Phase)
CREATE INDEX IF NOT EXISTS idx_packaging_orders_comp_status ON public.packaging_orders (company_id, status);
CREATE INDEX IF NOT EXISTS idx_packaging_orders_lot_no ON public.packaging_orders (lot_no);
CREATE INDEX IF NOT EXISTS idx_packaging_orders_prod_batch ON public.packaging_orders (production_batch_id);

-- 5. Dispatches & Dispatch Items (Godown Verification & Gate Pass)
CREATE INDEX IF NOT EXISTS idx_dispatches_comp_status ON public.dispatches (company_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatches_order_id ON public.dispatches (order_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_dispatch_no ON public.dispatches (dispatch_no);
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON public.dispatches (company_id, dispatch_date DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch_id ON public.dispatch_items (dispatch_id);

-- 6. Intercompany Transfers (Multi-Entity Reconciliation)
CREATE INDEX IF NOT EXISTS idx_intercompany_transfers_source ON public.intercompany_transfers (source_company_id, status);
CREATE INDEX IF NOT EXISTS idx_intercompany_transfers_dest ON public.intercompany_transfers (destination_company_id, status);
CREATE INDEX IF NOT EXISTS idx_intercompany_transfers_ref ON public.intercompany_transfers (transfer_no);
CREATE INDEX IF NOT EXISTS idx_intercompany_transfers_dates ON public.intercompany_transfers (dispatch_date DESC, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_intercompany_items_transfer_id ON public.intercompany_transfer_items (transfer_id);

-- 7. General Ledger (Double-Entry Financial Transactions)
CREATE INDEX IF NOT EXISTS idx_general_ledger_comp_date ON public.general_ledger (company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_general_ledger_debit_acc ON public.general_ledger (company_id, debit_account_code);
CREATE INDEX IF NOT EXISTS idx_general_ledger_credit_acc ON public.general_ledger (company_id, credit_account_code);
CREATE INDEX IF NOT EXISTS idx_general_ledger_ref ON public.general_ledger (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_general_ledger_reversals ON public.general_ledger (reversed_entry_id) WHERE reversed_entry_id IS NOT NULL;

-- 8. Enterprise Audit Logs (Append-Only Audit Trail)
CREATE INDEX IF NOT EXISTS idx_audit_logs_comp_category ON public.audit_logs (company_id, action_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ref_no ON public.audit_logs (reference_no);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs (table_name, record_id);

-- 9. Role-Based System Notifications
CREATE INDEX IF NOT EXISTS idx_system_notifications_comp_read ON public.system_notifications (company_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_notifications_type ON public.system_notifications (company_id, type);

-- 10. Purchases & Supplier Balances
CREATE INDEX IF NOT EXISTS idx_purchases_comp_supplier ON public.purchases (company_id, supplier_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_comp_status ON public.purchases (company_id, status);

-- Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload_schema';
