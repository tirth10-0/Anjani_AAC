-- ==============================================================================
-- ERP LIVE BUSINESS DATA EXPORT (ID-PRESERVING RESTORATION SCRIPT)
-- Generated: 2026-10-25T08:06:37.797Z
-- Preserves exact primary keys, foreign keys, timestamps, and stock batches
-- ==============================================================================

BEGIN;

-- Temporarily bypass replication / foreign-key checks during bulk restoration if permitted
DO $$
BEGIN
  BEGIN
    SET session_replication_role = 'replica';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- ------------------------------------------------------------------------------
-- TABLE: companies (1 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.companies (id, tenant_id, name, code, gstin, pan, email, phone, address, city, state, pincode, currency, logo_url, is_manufacturing, status, created_at) VALUES
  (623, 1, 'Anjani Agri Care', 'AAC', '24AAACA1234A1Z5', 'AAACA1234A', 'anjaniagricare@gmail.com', '96646 75227', 'Sr. No. 67 and 68, Plot No. 33, Siddhi Vinayak Industrial Zone, At: Virva, Tal: Lodhika, Dist: Rajkot, Gujarat.', 'Rajkot', 'Gujarat', NULL, 'INR', NULL, TRUE, 'Active', '2026-10-20T15:39:13.68832+00:00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: branches (1 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.branches (id, company_id, name, code, address, city, state, gstin, phone, is_head_office, status, created_at) VALUES
  (209, 623, 'Anjani Agri Care Head Office', 'AAC-HQ', NULL, 'Rajkot', 'Gujarat', NULL, NULL, FALSE, 'Active', '2026-10-20T15:39:14.02141+00:00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: warehouses (2 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.warehouses (id, company_id, branch_id, name, code, location, warehouse_type, is_default, status, created_at) VALUES
  (1, 623, NULL, 'Anjani Agri Care Main Plant Warehouse', 'WH-AAC-01', NULL, 'Finished Goods', TRUE, 'Active', '2026-10-22T04:55:30.156649+00:00'),
  (532, 623, NULL, 'Gas Godown', 'WH-AAC-GAS', NULL, 'Finished Goods', FALSE, 'Active', '2026-10-22T04:50:46.121167+00:00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: user_company_access (1 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.user_company_access (id, user_id, user_email, tenant_id, company_id, role, is_default, status, created_at) VALUES
  (9, NULL, NULL, 1, 623, 'admin', FALSE, 'Active', '2026-10-20T15:39:14.520557+00:00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: clients (1 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.clients (id, name, contact, email, address, city, gst, type, credit_limit, balance, created_at, company_id) VALUES
  (9, 'Kisan Agro Agency', '98745 63210', NULL, 'Gujarat', 'Rajkot', '24AAAFK1122D1Z5', 'Retailer', NULL, 0, '2026-10-16T10:08:42.072266+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: suppliers (1 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.suppliers (id, name, company_name, contact, email, address, city, gst, category, payment_terms, balance, status, created_at, company_id) VALUES
  (5, 'Sample Data', NULL, '74102 55893', NULL, NULL, NULL, NULL, NULL, NULL, 0, 'Active', '2026-10-24T09:29:38.408591+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: products (4 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.products (id, name, batch_no, brand, category, item_type, unit, composition, packaging, item_subtype, item_size, reorder_level, purchase_price, sell_price, gst, status, description, cibrc_reg_no, toxicity_triangle, antidote_statement, inventory_item_id, created_at, company_id) VALUES
  (63, 'Afield Chlor-20 Ec', NULL, 'Anjchlor', 'Insecticides', 'Finished Good', 'Litre', '', '1 Litre', NULL, '1 Litre', 0, 520, 650, 0, 'Active', '', NULL, 'Green', NULL, 74, '2026-10-16T09:57:27.042182+00:00', 623),
  (64, 'Afield Profe-40 Ec', NULL, 'Anjpro', 'Insecticides', 'Finished Good', 'Litre', '', '1 Litre', NULL, '1 Litre', 0, 500, 950, 0, 'Active', '', NULL, 'Green', NULL, 77, '2026-10-16T09:58:20.913966+00:00', 623),
  (65, 'Afield Thio-60 Ec', NULL, 'Anjthio', 'Insecticides', 'Finished Good', 'Litre', '', '1 Litre', NULL, '1 Litre', 0, 440, 870, 0, 'Active', '', NULL, 'Green', NULL, 78, '2026-10-16T09:59:29.77755+00:00', 623),
  (66, 'Afield Coragen-80 Ec', NULL, 'Anjcora', 'Insecticides', 'Finished Good', 'Litre', '', '1 Litre', NULL, '1 Litre', 0, 1100, 2400, 0, 'Active', '', NULL, 'Green', NULL, 76, '2026-10-16T10:00:44.848922+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: product_packaging (15 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.product_packaging (id, product_id, packaging_size, purchase_price, sell_price, units_per_box, box_type, box_inventory_id, volume_ml, weight_gm, created_at, company_id) VALUES
  (126, 63, '1 Litre', 520, 650, 10, NULL, NULL, 0, 0, '2026-10-16T09:58:32.261674+00:00', 623),
  (127, 63, '500 Ml', 0, 350, 20, NULL, NULL, 0, 0, '2026-10-16T09:58:32.261674+00:00', 623),
  (128, 65, '1 Litre', 440, 870, 10, NULL, NULL, 0, 0, '2026-10-16T09:59:30.141516+00:00', 623),
  (129, 65, '500 Ml', 0, 490, 20, NULL, NULL, 0, 0, '2026-10-16T09:59:30.141516+00:00', 623),
  (130, 65, '250 Ml', 0, 250, 40, NULL, NULL, 0, 0, '2026-10-16T09:59:30.141516+00:00', 623),
  (131, 65, '100 Ml', 0, 110, 100, NULL, NULL, 0, 0, '2026-10-16T09:59:30.141516+00:00', 623),
  (132, 66, '1 Litre', 1100, 2400, 10, NULL, NULL, 0, 0, '2026-10-16T10:00:45.062759+00:00', 623),
  (133, 66, '500 Ml', 0, 2200, 20, NULL, NULL, 0, 0, '2026-10-16T10:00:45.062759+00:00', 623),
  (134, 66, '250 Ml', 0, 2000, 40, NULL, NULL, 0, 0, '2026-10-16T10:00:45.062759+00:00', 623),
  (135, 66, '100 Ml', 0, 1800, 100, NULL, NULL, 0, 0, '2026-10-16T10:00:45.062759+00:00', 623),
  (136, 66, '50 Ml', 0, 1600, 100, NULL, NULL, 0, 0, '2026-10-16T10:00:45.062759+00:00', 623),
  (137, 64, '1 Litre', 500, 950, 10, NULL, NULL, 0, 0, '2026-10-16T10:02:17.543379+00:00', 623),
  (138, 64, '500 Ml', 0, 700, 20, NULL, NULL, 0, 0, '2026-10-16T10:02:17.543379+00:00', 623),
  (139, 64, '5 Litre', 0, 2100, 1, NULL, NULL, 0, 0, '2026-10-16T10:02:17.543379+00:00', 623),
  (140, 64, '10 Litre', 0, 5200, 1, NULL, NULL, 0, 0, '2026-10-16T10:02:17.543379+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: inventory_items (16 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.inventory_items (id, name, category, unit, reorder_level, stock, item_subtype, item_size, description, product_id, density, allow_negative, created_at, company_id) VALUES
  (50, 'Imida Bottle 1 Ltr', 'Bottles', 'Nos', 0, 30, 'Imida', '1 Ltr', NULL, NULL, 1, FALSE, '2026-10-21T05:39:29.948398+00:00', 623),
  (51, 'Imida Bottle 500 Ml', 'Bottles', 'Nos', 0, 1000, 'Imida', '500 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:39:44.913976+00:00', 623),
  (52, 'Sygenta Bottle 1 Ltr', 'Bottles', 'Nos', 0, 0, 'Sygenta', '1 Ltr', NULL, NULL, 1, FALSE, '2026-10-21T05:39:54.273659+00:00', 623),
  (53, 'Imida Bottle 250 Ml', 'Bottles', 'Nos', 0, 1000, 'Imida', '250 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:40:04.772988+00:00', 623),
  (54, 'Imida Bottle 100 Ml', 'Bottles', 'Nos', 0, 0, 'Imida', '100 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:40:13.50761+00:00', 623),
  (55, 'Regular Box 1 Ltr', 'Boxes', 'Nos', 0, 903, 'Regular', '1 Ltr', NULL, NULL, 1, FALSE, '2026-10-21T05:41:01.325201+00:00', 623),
  (56, 'Regular Box 500 Ml', 'Boxes', 'Nos', 0, 0, 'Regular', '500 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:41:09.472971+00:00', 623),
  (57, 'Regular Box 250 Ml', 'Boxes', 'Nos', 0, 0, 'Regular', '250 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:41:17.278685+00:00', 623),
  (58, 'Regular Box 100 Ml', 'Boxes', 'Nos', 0, 0, 'Regular', '100 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:41:26.187333+00:00', 623),
  (59, 'Color Box 1 Ltr', 'Boxes', 'Nos', 0, 0, 'Color', '1 Ltr', NULL, NULL, 1, FALSE, '2026-10-21T05:41:34.799659+00:00', 623),
  (60, 'Color Box 500 Ml', 'Boxes', 'Nos', 0, 1000, 'Color', '500 Ml', NULL, NULL, 1, FALSE, '2026-10-21T05:41:45.196824+00:00', 623),
  (74, 'Afield Chlor-20 Ec', 'Technical', 'Litre', 0, 630, 'Insecticide', NULL, NULL, NULL, 1, FALSE, '2026-10-24T08:08:17.491059+00:00', 623),
  (75, 'Afield Chlor-20 Ec 1 Litre Label [ACC]', 'Labels', 'Nos', 0, 630, 'ACC', '1 Litre', 'Label for Afield Chlor-20 Ec (1 Litre) - Brand: ACC', 63, 1, FALSE, '2026-10-24T08:09:04.218223+00:00', 623),
  (76, 'Afield Coragen-80 Ec', 'Technical', 'Litre', 0, 800, 'Insecticide', NULL, NULL, NULL, 1, FALSE, '2026-10-24T11:24:07.342727+00:00', 623),
  (77, 'Afield Profe-40 Ec', 'Technical', 'Litre', 0, 800, 'Insecticide', NULL, NULL, NULL, 1, FALSE, '2026-10-24T11:24:20.416973+00:00', 623),
  (78, 'Afield Thio-60 Ec', 'Technical', 'Litre', 0, 800, 'Insecticide', NULL, NULL, NULL, 1, FALSE, '2026-10-24T11:24:32.673174+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: stock_batches (20 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.stock_batches (id, item_id, item_name, item_type, batch_no, purchase_id, supplier_id, purchase_date, purchase_price, initial_qty, current_qty, unit, expiry_date, warehouse, inventory_item_id, created_at, company_id, warehouse_id, branch_id) VALUES
  (75, 51, 'Imida Bottle 500 Ml', 'Inventory', 'Open-02', NULL, NULL, NULL, 18, 1000, 1000, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-21T05:39:45.075678+00:00', 623, 1, 209),
  (76, 53, 'Imida Bottle 250 Ml', 'Inventory', 'Open-03', NULL, NULL, NULL, 16, 1000, 1000, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-21T05:40:05.035203+00:00', 623, 1, 209),
  (77, 55, 'Regular Box 1 Ltr', 'Inventory', 'Open-04', NULL, NULL, NULL, 20, 1000, 903, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-21T05:41:01.498483+00:00', 623, 1, 209),
  (78, 60, 'Color Box 500 Ml', 'Inventory', 'Open-05', NULL, NULL, NULL, 18, 1000, 1000, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-21T05:41:45.383259+00:00', 623, 1, 209),
  (124, 74, 'Afield Chlor-20 Ec', 'Inventory', 'OPEN-01', NULL, NULL, NULL, 520, 1000, 630, 'Litre', NULL, 'Main Warehouse', NULL, '2026-10-24T08:08:17.578389+00:00', 623, 1, 209),
  (125, 50, 'Imida Bottle 1 Ltr', 'Inventory', 'OPEN-06', NULL, NULL, NULL, 20, 1000, 30, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T08:08:30.348187+00:00', 623, 1, 209),
  (126, 75, 'Afield Chlor-20 Ec 1 Litre Label [ACC]', 'Inventory', 'OPEN-01', NULL, NULL, NULL, 2, 1000, 630, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T08:09:04.305333+00:00', 623, 1, 209),
  (127, 63, 'Afield Chlor-20 Ec', 'Product', 'B-01-GAS', 122, NULL, NULL, 650, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T09:30:37.119+00:00', 623, 532, 209),
  (128, 63, 'Afield Chlor-20 Ec', 'Product', 'B-01-GAS', 123, NULL, NULL, 650, 50, 30, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T09:56:25.524+00:00', 623, 532, 209),
  (129, 76, 'Afield Coragen-80 Ec', 'Inventory', 'OPEN-01', NULL, NULL, NULL, 520, 1000, 800, 'Litre', NULL, 'Main Warehouse', NULL, '2026-10-24T11:24:07.519982+00:00', 623, 1, 209),
  (130, 77, 'Afield Profe-40 Ec', 'Inventory', 'OPEN-01', NULL, NULL, NULL, 600, 1000, 800, 'Litre', NULL, 'Main Warehouse', NULL, '2026-10-24T11:24:20.532012+00:00', 623, 1, 209),
  (131, 78, 'Afield Thio-60 Ec', 'Inventory', 'OPEN-01', NULL, NULL, NULL, 650, 1000, 800, 'Litre', NULL, 'Main Warehouse', NULL, '2026-10-24T11:24:32.781287+00:00', 623, 1, 209),
  (132, 63, 'Afield Chlor-20 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 650, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:08.212+00:00', 623, 532, 209),
  (133, 65, 'Afield Thio-60 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 870, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:08.528+00:00', 623, 532, 209),
  (134, 64, 'Afield Profe-40 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 950, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:08.744+00:00', 623, 532, 209),
  (135, 66, 'Afield Coragen-80 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 2400, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:08.941+00:00', 623, 532, 209),
  (136, 63, 'Afield Chlor-20 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 650, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:10.111+00:00', 623, 532, 209),
  (137, 65, 'Afield Thio-60 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 870, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:10.267+00:00', 623, 532, 209),
  (138, 64, 'Afield Profe-40 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 950, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:10.435+00:00', 623, 532, 209),
  (139, 66, 'Afield Coragen-80 Ec', 'Product', 'B-01-GAS', 126, NULL, NULL, 2400, 100, 100, 'Nos', NULL, 'Main Warehouse', NULL, '2026-10-24T11:26:10.633+00:00', 623, 532, 209)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: stock_movements (133 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.stock_movements (id, batch_id, txn_type, txn_id, qty, previous_stock, new_stock, user_name, notes, created_at, company_id, warehouse_id) VALUES
  (20, 50, 'PRODUCTION_CONSUME [PROD-TEST-001] ', NULL, -10, 0, 0, NULL, NULL, '2026-10-17T04:07:09.094614+00:00', 623, 1),
  (21, NULL, 'RECONCILIATION_ADJUSTMENT', NULL, 500, 0, 0, NULL, NULL, '2026-10-17T04:07:46.137641+00:00', 623, 1),
  (22, NULL, 'RECONCILIATION_ADJUSTMENT', NULL, 500, 0, 0, NULL, NULL, '2026-10-17T04:07:46.671331+00:00', 623, 1),
  (23, NULL, 'RECONCILIATION_ADJUSTMENT', NULL, 600, 0, 0, NULL, NULL, '2026-10-17T04:07:47.140435+00:00', 623, 1),
  (24, NULL, 'RECONCILIATION_ADJUSTMENT', NULL, 400, 0, 0, NULL, NULL, '2026-10-17T04:07:47.810356+00:00', 623, 1),
  (103, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T08:56:19.980897+00:00', 623, 1),
  (104, 53, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-20T09:06:30.723204+00:00', 623, 1),
  (105, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T09:06:31.742509+00:00', 623, 1),
  (106, 53, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-20T09:08:52.644429+00:00', 623, 1),
  (107, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T09:08:53.688344+00:00', 623, 1),
  (108, 53, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-20T09:11:09.179558+00:00', 623, 1),
  (109, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T09:11:10.2078+00:00', 623, 1),
  (110, 53, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-20T09:12:34.735427+00:00', 623, 1),
  (111, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T09:12:36.769773+00:00', 623, 1),
  (112, 43, 'STOCK_RESTORE', NULL, 15, 0, 0, NULL, NULL, '2026-10-20T09:14:46.644181+00:00', 623, 1),
  (113, 46, 'MANUAL_DEDUCT', NULL, -70, 0, 0, NULL, NULL, '2026-10-20T09:28:42.121858+00:00', 623, 1),
  (114, 55, 'MANUAL_DEDUCT', NULL, -70, 0, 0, NULL, NULL, '2026-10-20T09:28:42.688949+00:00', 623, 1),
  (115, 59, 'MANUAL_DEDUCT', NULL, -140, 0, 0, NULL, NULL, '2026-10-20T09:28:43.156453+00:00', 623, 1),
  (116, 46, 'STOCK_RESTORE', NULL, 70, 0, 0, NULL, NULL, '2026-10-20T09:29:41.134336+00:00', 623, 1),
  (117, 55, 'STOCK_RESTORE', NULL, 70, 0, 0, NULL, NULL, '2026-10-20T09:29:41.584892+00:00', 623, 1),
  (118, 59, 'STOCK_RESTORE', NULL, 140, 0, 0, NULL, NULL, '2026-10-20T09:29:42.108445+00:00', 623, 1),
  (119, 46, 'MANUAL_DEDUCT', NULL, -80, 0, 0, NULL, NULL, '2026-10-20T09:29:42.784787+00:00', 623, 1),
  (120, 55, 'MANUAL_DEDUCT', NULL, -70, 0, 0, NULL, NULL, '2026-10-20T09:29:43.208386+00:00', 623, 1),
  (121, 59, 'MANUAL_DEDUCT', NULL, -140, 0, 0, NULL, NULL, '2026-10-20T09:29:43.656748+00:00', 623, 1),
  (122, 46, 'STOCK_RESTORE', NULL, 80, 0, 0, NULL, NULL, '2026-10-20T09:30:24.865761+00:00', 623, 1),
  (123, 55, 'STOCK_RESTORE', NULL, 70, 0, 0, NULL, NULL, '2026-10-20T09:30:25.349999+00:00', 623, 1),
  (124, 59, 'STOCK_RESTORE', NULL, 140, 0, 0, NULL, NULL, '2026-10-20T09:30:25.696809+00:00', 623, 1),
  (125, 46, 'MANUAL_DEDUCT', NULL, -80, 0, 0, NULL, NULL, '2026-10-20T09:30:26.180605+00:00', 623, 1),
  (126, 55, 'MANUAL_DEDUCT', NULL, -80, 0, 0, NULL, NULL, '2026-10-20T09:30:26.552939+00:00', 623, 1),
  (127, 59, 'MANUAL_DEDUCT', NULL, -4, 0, 0, NULL, NULL, '2026-10-20T09:30:26.891602+00:00', 623, 1),
  (128, 53, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-20T09:34:54.915779+00:00', 623, 1),
  (129, 53, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-20T09:34:56.865199+00:00', 623, 1),
  (130, 46, 'STOCK_RESTORE', NULL, 80, 0, 0, NULL, NULL, '2026-10-20T15:35:30.274448+00:00', 623, 1),
  (131, 55, 'STOCK_RESTORE', NULL, 80, 0, 0, NULL, NULL, '2026-10-20T15:35:31.072114+00:00', 623, 1),
  (132, 59, 'STOCK_RESTORE', NULL, 4, 0, 0, NULL, NULL, '2026-10-20T15:35:31.87991+00:00', 623, 1),
  (355, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:46.775057+00:00', 623, 1),
  (356, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:47.304206+00:00', 623, 1),
  (357, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:48.030716+00:00', 623, 1),
  (358, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:48.595121+00:00', 623, 1),
  (359, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:49.024866+00:00', 623, 1),
  (360, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:49.57823+00:00', 623, 1),
  (361, 53, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:50.49979+00:00', 623, 1),
  (362, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:50.967801+00:00', 623, 1),
  (363, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:51.398689+00:00', 623, 1),
  (364, 46, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:52.220471+00:00', 623, 1),
  (365, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:52.733619+00:00', 623, 1),
  (366, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:53.219612+00:00', 623, 1),
  (367, 45, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:54.386103+00:00', 623, 1),
  (368, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:54.916313+00:00', 623, 1),
  (369, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:55.449009+00:00', 623, 1),
  (370, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:55.901246+00:00', 623, 1),
  (371, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:52:56.358557+00:00', 623, 1),
  (395, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:09.096717+00:00', 623, 1),
  (396, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:09.840861+00:00', 623, 1),
  (397, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:10.286852+00:00', 623, 1),
  (398, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:10.810986+00:00', 623, 1),
  (399, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:14.276808+00:00', 623, 1),
  (400, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:14.917774+00:00', 623, 1),
  (401, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:15.33719+00:00', 623, 1),
  (402, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:15.882335+00:00', 623, 1),
  (403, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:19.623781+00:00', 623, 1),
  (404, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:20.070252+00:00', 623, 1),
  (405, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:20.530657+00:00', 623, 1),
  (406, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:21.161368+00:00', 623, 1),
  (407, 54, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:29.29922+00:00', 623, 1),
  (408, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:29.761257+00:00', 623, 1),
  (409, 43, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:30.288211+00:00', 623, 1),
  (410, 68, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:30.74142+00:00', 623, 1),
  (439, 54, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-21T04:54:58.445483+00:00', 623, 1),
  (440, 58, 'STOCK_RESTORE', NULL, 1, 0, 0, NULL, NULL, '2026-10-21T04:54:58.907159+00:00', 623, 1),
  (441, 43, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-21T04:54:59.346964+00:00', 623, 1),
  (442, 68, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-21T04:54:59.79823+00:00', 623, 1),
  (570, 83, 'STOCK_RESTORE', NULL, 100, 0, 0, NULL, NULL, '2026-10-22T07:00:34.046273+00:00', 623, 1),
  (571, 77, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-22T07:00:34.530591+00:00', 623, 1),
  (572, 82, 'STOCK_RESTORE', NULL, 100, 0, 0, NULL, NULL, '2026-10-22T07:00:35.168122+00:00', 623, 1),
  (573, 97, 'STOCK_RESTORE', NULL, 100, 0, 0, NULL, NULL, '2026-10-22T07:00:35.642623+00:00', 623, 1),
  (578, 83, 'STOCK_RESTORE', NULL, 100, 0, 0, NULL, NULL, '2026-10-22T07:06:43.729427+00:00', 623, 1),
  (579, 77, 'STOCK_RESTORE', NULL, 10, 0, 0, NULL, NULL, '2026-10-22T07:06:44.279119+00:00', 623, 1),
  (652, NULL, 'STOCK_RESTORE', NULL, 50, 0, 0, NULL, NULL, '2026-10-24T07:32:04.736774+00:00', 623, 1),
  (653, NULL, 'STOCK_RESTORE', NULL, 30, 0, 0, NULL, NULL, '2026-10-24T07:32:05.316799+00:00', 623, 1),
  (654, NULL, 'STOCK_RESTORE', NULL, 20, 0, 0, NULL, NULL, '2026-10-24T07:32:05.872767+00:00', 623, 1),
  (657, NULL, 'ICT_TRANSFER_SYNC_intercompany_transfers', 1792831511, 0, 0, 0, NULL, '{"id":1792829957254,"transfer_no":"ICT-O-01","transaction_type":"INTERNAL_TRANSFER","supply_type":"CONSIGNMENT","from_company_id":623,"from_warehouse_id":1,"to_company_id":623,"to_warehouse_id":532,"ownership_company_id":623,"status":"Received","total_ordered_units":100,"total_dispatched_units":100,"total_boxes_dispatched":10,"total_loose_dispatched":0,"pricing_terms":"Cost Plus Margin","subtotal_amount":65000,"tax_amount":0,"total_amount":65000,"vehicle_no":"GJ 03 AB 1512","dispatch_date":"2026-10-24","approved_by":"Supply Chain Manager","source_stock_deducted":true,"source_invoice_no":null,"dispatched_by":"Plant Gate Officer","total_received_units":100,"total_damaged_units":0,"total_shortage_units":0,"total_rejected_units":0,"total_returned_units":0,"total_boxes_received":10,"total_loose_received":0,"destination_stock_credited":true,"destination_purchase_no":null,"receipt_date":"2026-10-24","received_by":"Warehouse Inward Officer"}', '2026-10-24T08:45:10.176733+00:00', 623, 1),
  (658, NULL, 'ICT_TRANSFER_SYNC_intercompany_transfer_items', 1792831520, 0, 0, 0, NULL, '{"id":101,"transfer_id":1792829957254,"product_id":63,"product_name":"Afield Chlor-20 EC","packaging_size":"500 ml","units_per_box":10,"dispatched_units":100,"dispatched_boxes":10,"dispatched_loose":0,"unit_price":650,"total_amount":65000,"line_status":"Received","destination_stock_batch_id":1792831918988,"destination_batch_no":"undefined-CO623","received_units":100,"received_boxes":10,"received_loose":0,"damaged_units":0,"shortage_units":0,"rejected_units":0,"returned_units":0}', '2026-10-24T08:45:19.703969+00:00', 623, 1),
  (659, NULL, 'ICT_TRANSFER_SYNC_stock_batches', 1792831918, 0, 0, 0, NULL, '{"id":1792831918988,"created_at":"2026-10-24T08:51:58.734Z","batch_no":"undefined-CO623","item_id":63,"item_name":"Afield Chlor-20 EC","item_type":"Product","company_id":623,"warehouse_id":532,"ownership_company_id":623,"is_consignment":true,"source_transfer_id":1792829957254,"initial_qty":100,"current_qty":100,"boxes_count":10,"loose_count":0,"units_per_box":10,"qc_status":"Approved","is_quarantine":false,"unit":"Nos","purchase_price":650,"packaging_size":"500 ml"}', '2026-10-24T08:51:57.590057+00:00', 623, 1),
  (660, 124, 'DISPATCH', 122, -100, 0, 0, NULL, 'DISPATCH [O-01]', '2026-10-24T09:30:33.612913+00:00', 623, 1),
  (661, 125, 'DISPATCH_BOTTLES', 122, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-01]', '2026-10-24T09:30:34.237369+00:00', 623, 1),
  (662, 77, 'DISPATCH_BOXES', 122, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-01]', '2026-10-24T09:30:34.787692+00:00', 623, 1),
  (663, 126, 'DISPATCH_LABELS', 122, -100, 0, 0, NULL, 'DISPATCH_LABELS [O-01]', '2026-10-24T09:30:35.355771+00:00', 623, 1),
  (664, 127, 'RECEIPT', 122, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-01', '2026-10-24T09:30:36.147916+00:00', 623, 532),
  (665, 124, 'DISPATCH', 123, -50, 0, 0, NULL, 'DISPATCH [O-02]', '2026-10-24T09:56:24.365875+00:00', 623, 1),
  (666, 125, 'DISPATCH_BOTTLES', 123, -50, 0, 0, NULL, 'DISPATCH_BOTTLES [O-02]', '2026-10-24T09:56:25.349589+00:00', 623, 1),
  (667, 77, 'DISPATCH_BOXES', 123, -5, 0, 0, NULL, 'DISPATCH_BOXES [O-02]', '2026-10-24T09:56:26.133397+00:00', 623, 1),
  (668, 126, 'DISPATCH_LABELS', 123, -50, 0, 0, NULL, 'DISPATCH_LABELS [O-02]', '2026-10-24T09:56:26.863551+00:00', 623, 1),
  (669, 128, 'RECEIPT', 123, 50, 0, 0, NULL, 'Stocked 50 units (5 boxes) into Godown #532 from Sales Order #O-02', '2026-10-24T09:56:27.845995+00:00', 623, 532),
  (670, 124, 'DISPATCH', 124, -20, 0, 0, NULL, 'DISPATCH [O-03]', '2026-10-24T10:11:57.857949+00:00', 623, 1),
  (671, 125, 'DISPATCH_BOTTLES', 124, -20, 0, 0, NULL, 'DISPATCH_BOTTLES [O-03]', '2026-10-24T10:11:58.898623+00:00', 623, 1),
  (672, 77, 'DISPATCH_BOXES', 124, -2, 0, 0, NULL, 'DISPATCH_BOXES [O-03]', '2026-10-24T10:11:59.797237+00:00', 623, 1),
  (673, 126, 'DISPATCH_LABELS', 124, -20, 0, 0, NULL, 'DISPATCH_LABELS [O-03]', '2026-10-24T10:12:00.660893+00:00', 623, 1),
  (674, 128, 'DISPATCH', 125, -20, 0, 0, NULL, 'Dispatched 2 Boxes + 0 Loose (20 units) from Warehouse #532 via DSP-04', '2026-10-24T11:00:50.562057+00:00', 623, 532),
  (675, 124, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:00.100504+00:00', 623, 1),
  (676, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:00.920589+00:00', 623, 1),
  (677, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:01.820766+00:00', 623, 1),
  (678, 126, 'DISPATCH_LABELS', 126, -100, 0, 0, NULL, 'DISPATCH_LABELS [O-05]', '2026-10-24T11:26:02.65198+00:00', 623, 1),
  (679, 131, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:04.174756+00:00', 623, 1),
  (680, 124, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:04.706598+00:00', 623, 1),
  (681, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:04.750221+00:00', 623, 1),
  (682, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:05.212931+00:00', 623, 1),
  (683, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:05.258269+00:00', 623, 1),
  (684, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:05.703314+00:00', 623, 1),
  (685, 126, 'DISPATCH_LABELS', 126, -100, 0, 0, NULL, 'DISPATCH_LABELS [O-05]', '2026-10-24T11:26:06.159888+00:00', 623, 1),
  (686, 130, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:06.374031+00:00', 623, 1),
  (687, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:07.013218+00:00', 623, 1),
  (688, 131, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:07.092953+00:00', 623, 1),
  (689, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:07.421203+00:00', 623, 1),
  (690, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:07.653506+00:00', 623, 1),
  (691, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:08.109564+00:00', 623, 1),
  (692, 129, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:08.611427+00:00', 623, 1),
  (693, 130, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:09.018224+00:00', 623, 1),
  (694, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:09.26563+00:00', 623, 1),
  (695, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:09.532155+00:00', 623, 1),
  (696, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:09.733049+00:00', 623, 1),
  (697, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:09.971094+00:00', 623, 1),
  (698, 132, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:10.516317+00:00', 623, 532),
  (699, 133, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:10.728723+00:00', 623, 532),
  (700, 129, 'DISPATCH', 126, -100, 0, 0, NULL, 'DISPATCH [O-05]', '2026-10-24T11:26:10.796292+00:00', 623, 1),
  (701, 134, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:10.931581+00:00', 623, 532),
  (702, 135, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:11.096437+00:00', 623, 532),
  (703, 125, 'DISPATCH_BOTTLES', 126, -100, 0, 0, NULL, 'DISPATCH_BOTTLES [O-05]', '2026-10-24T11:26:11.286108+00:00', 623, 1),
  (704, 77, 'DISPATCH_BOXES', 126, -10, 0, 0, NULL, 'DISPATCH_BOXES [O-05]', '2026-10-24T11:26:11.730533+00:00', 623, 1),
  (705, 136, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:12.253249+00:00', 623, 532),
  (706, 137, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:12.413153+00:00', 623, 532),
  (707, 138, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:12.613675+00:00', 623, 532),
  (708, 139, 'RECEIPT', 126, 100, 0, 0, NULL, 'Stocked 100 units (10 boxes) into Godown #532 from Sales Order #O-05', '2026-10-24T11:26:12.810649+00:00', 623, 532)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: orders (5 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.orders (id, order_no, client_id, client_name, date, due_date, status, total_amount, paid_amount, discount, tax, notes, tax_mode, created_at, company_id, branch_id) VALUES
  (122, 'O-01', 9, 'Kisan Agro Agency', '2026-10-24', NULL, 'Completed', 65000, 0, 0, 0, 'DISPATCH_META: {"label_owner":"ACC","items_meta":[{"id":173,"order_item_id":173,"product_id":"63","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"outer_boxes_consumed":10,"ordered_units":100,"dispatched_units":100,"remaining_units":0,"label_inventory_id":75,"label_name":"Afield Chlor-20 Ec 1 Litre Label [ACC]","label_owner":"ACC"}],"dispatches":[{"id":1792834224730,"created_at":"2026-10-24T09:30:24.652Z","dispatch_no":"DSP-01","order_id":122,"order_no":"O-01","company_id":623,"warehouse_id":1,"client_id":9,"client_name":"Kisan Agro Agency","dispatch_date":"2026-10-24","status":"Dispatched","total_boxes_dispatched":10,"total_loose_dispatched":0,"total_units_dispatched":100,"delivery_target":"GODOWN","target_warehouse_id":532,"target_warehouse_name":"Gas Godown (WH-ACC-GAS)","stock_deducted":true,"vehicle_no":null,"transporter_name":null,"driver_contact":null,"eway_bill_no":null,"notes":null,"idempotency_key":"DSP-PREP-DSP-01-122","items":[{"id":1792834225032,"created_at":"2026-10-24T09:30:24.835Z","dispatch_id":1792834224730,"order_item_id":173,"product_id":63,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":124,"batch_no":"B-01","boxes_dispatched":10,"loose_dispatched":0,"total_units_dispatched":100,"unit_price":650,"total_amount":65000}],"verified_by":"Godown Operator","verified_at":"2026-10-24T09:30:29.835Z","verification_notes":"Physical corrugated cartons, batch seal intact, bottle count and labeling verified.","approved_by":"Dispatch Manager","approved_at":"2026-10-24T09:30:32.178Z","approval_notes":"Authorized for commercial logistics and gate exit.","dispatched_by":"Security Gatekeeper","dispatched_at":"2026-10-24T09:30:37.403Z","invoice_id":1792834240460,"invoice_no":"INV-01"}],"dispatch_status":"Fully Dispatched"}', 'Non-GST', '2026-10-24T09:30:08.01458+00:00', 623, 209),
  (123, 'O-02', 9, 'Kisan Agro Agency', '2026-10-24', NULL, 'Completed', 32500, 0, 0, 0, 'DISPATCH_META: {"label_owner":"ACC","items_meta":[{"id":174,"order_item_id":174,"product_id":"63","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":50,"total_units":50,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":5,"loose_quantity":0,"outer_boxes_consumed":5,"ordered_units":50,"dispatched_units":50,"remaining_units":0,"label_inventory_id":75,"label_name":"Afield Chlor-20 Ec 1 Litre Label [ACC]","label_owner":"ACC"}],"dispatches":[{"id":1792835600683,"created_at":"2026-10-24T09:53:20.367Z","dispatch_no":"DSP-02","order_id":123,"order_no":"O-02","company_id":623,"warehouse_id":1,"client_id":9,"client_name":"Kisan Agro Agency","dispatch_date":"2026-10-24","status":"Dispatched","total_boxes_dispatched":5,"total_loose_dispatched":0,"total_units_dispatched":50,"delivery_target":"GODOWN","target_warehouse_id":532,"target_warehouse_name":"Gas Godown (WH-ACC-GAS)","stock_deducted":true,"vehicle_no":null,"transporter_name":null,"driver_contact":null,"eway_bill_no":null,"notes":null,"idempotency_key":"DSP-PREP-DSP-02-123","items":[{"id":1792835600534,"created_at":"2026-10-24T09:53:20.514Z","dispatch_id":1792835600683,"order_item_id":174,"product_id":63,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":124,"batch_no":"B-01","boxes_dispatched":5,"loose_dispatched":0,"total_units_dispatched":50,"unit_price":650,"total_amount":32500}],"verified_by":"Godown Operator","verified_at":"2026-10-24T09:55:06.143Z","verification_notes":"Physical corrugated cartons, batch seal intact, bottle count and labeling verified.","approved_by":"Dispatch Manager","approved_at":"2026-10-24T09:55:36.871Z","approval_notes":"Authorized for commercial logistics and gate exit.","dispatched_by":"Security Gatekeeper","dispatched_at":"2026-10-24T09:56:25.890Z","invoice_id":1792835870556,"invoice_no":"INV-02"}],"dispatch_status":"Fully Dispatched"}', 'Non-GST', '2026-10-24T09:53:13.391096+00:00', 623, 209),
  (124, 'O-03', 9, 'Kisan Agro Agency', '2026-10-24', NULL, 'Completed', 13000, 0, 0, 0, 'DISPATCH_META: {"label_owner":"ACC","items_meta":[{"id":175,"order_item_id":175,"product_id":"63","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":20,"total_units":20,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":2,"loose_quantity":0,"outer_boxes_consumed":2,"ordered_units":20,"dispatched_units":20,"remaining_units":0,"label_inventory_id":75,"label_name":"Afield Chlor-20 Ec 1 Litre Label [ACC]","label_owner":"ACC"}],"dispatches":[{"id":1792836696844,"created_at":"2026-10-24T10:11:35.854Z","dispatch_no":"DSP-03","order_id":124,"order_no":"O-03","company_id":623,"warehouse_id":1,"client_id":9,"client_name":"Kisan Agro Agency","dispatch_date":"2026-10-24","status":"Dispatched","total_boxes_dispatched":2,"total_loose_dispatched":0,"total_units_dispatched":20,"delivery_target":"CUSTOMER","target_warehouse_id":null,"target_warehouse_name":null,"stock_deducted":true,"vehicle_no":null,"transporter_name":null,"driver_contact":null,"eway_bill_no":null,"notes":null,"idempotency_key":"DSP-PREP-DSP-03-124","items":[{"id":1792836696630,"created_at":"2026-10-24T10:11:36.043Z","dispatch_id":1792836696844,"order_item_id":175,"product_id":63,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":124,"batch_no":"B-01","boxes_dispatched":2,"loose_dispatched":0,"total_units_dispatched":20,"unit_price":650,"total_amount":13000}],"verified_by":"Godown Operator","verified_at":"2026-10-24T10:11:45.187Z","verification_notes":"Physical corrugated cartons, batch seal intact, bottle count and labeling verified.","approved_by":"Dispatch Manager","approved_at":"2026-10-24T10:11:49.931Z","approval_notes":"Authorized for commercial logistics and gate exit.","dispatched_by":"Security Gatekeeper","dispatched_at":"2026-10-24T10:11:59.419Z","invoice_id":1792836725766,"invoice_no":"INV-03"}],"dispatch_status":"Fully Dispatched"}', 'Non-GST', '2026-10-24T10:11:25.125094+00:00', 623, 209),
  (125, 'O-04', 9, 'Kisan Agro Agency', '2026-10-24', NULL, 'Completed', 13000, 0, 0, 0, 'DISPATCH_META: {"label_owner":"ACC","items_meta":[{"id":176,"order_item_id":176,"product_id":"63","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":20,"total_units":20,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":2,"loose_quantity":0,"outer_boxes_consumed":2,"ordered_units":20,"dispatched_units":20,"remaining_units":0,"label_inventory_id":75,"label_name":"Afield Chlor-20 Ec 1 Litre Label [ACC]","label_owner":"ACC"}],"dispatches":[{"id":1792839641528,"created_at":"2026-10-24T11:00:40.643Z","dispatch_no":"DSP-04","order_id":125,"order_no":"O-04","company_id":623,"warehouse_id":532,"client_id":9,"client_name":"Kisan Agro Agency","dispatch_date":"2026-10-24","status":"Dispatched","total_boxes_dispatched":2,"total_loose_dispatched":0,"total_units_dispatched":20,"delivery_target":"CUSTOMER","target_warehouse_id":null,"target_warehouse_name":null,"stock_deducted":true,"vehicle_no":null,"transporter_name":null,"driver_contact":null,"eway_bill_no":null,"notes":null,"idempotency_key":"DSP-PREP-DSP-04-125","items":[{"id":1792839641638,"created_at":"2026-10-24T11:00:40.782Z","dispatch_id":1792839641528,"order_item_id":176,"product_id":63,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":128,"batch_no":"B-01","boxes_dispatched":2,"loose_dispatched":0,"total_units_dispatched":20,"unit_price":650,"total_amount":13000}],"verified_by":"Godown Operator","verified_at":"2026-10-24T11:00:46.070Z","verification_notes":"Physical corrugated cartons, batch seal intact, bottle count and labeling verified.","approved_by":"Dispatch Manager","approved_at":"2026-10-24T11:00:48.111Z","approval_notes":"Authorized for commercial logistics and gate exit.","dispatched_by":"Security Gatekeeper","dispatched_at":"2026-10-24T11:00:51.248Z"}],"dispatch_status":"Fully Dispatched"}', 'Non-GST', '2026-10-24T11:00:28.414772+00:00', 623, 209),
  (126, 'O-05', 9, 'Kisan Agro Agency', '2026-10-24', NULL, 'Completed', 487000, 0, 0, 0, 'DISPATCH_META: {"label_owner":"ACC","items_meta":[{"id":177,"order_item_id":177,"product_id":"66","product_name":"Afield Coragen-80 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"outer_boxes_consumed":10,"ordered_units":100,"dispatched_units":100,"remaining_units":0,"label_inventory_id":null,"label_name":null,"label_owner":"ACC"},{"id":178,"order_item_id":178,"product_id":"64","product_name":"Afield Profe-40 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"outer_boxes_consumed":10,"ordered_units":100,"dispatched_units":100,"remaining_units":0,"label_inventory_id":null,"label_name":null,"label_owner":"ACC"},{"id":179,"order_item_id":179,"product_id":"65","product_name":"Afield Thio-60 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"outer_boxes_consumed":10,"ordered_units":100,"dispatched_units":100,"remaining_units":0,"label_inventory_id":null,"label_name":null,"label_owner":"ACC"},{"id":180,"order_item_id":180,"product_id":"63","product_name":"Afield Chlor-20 Ec","packing_size":"1 Litre","packaging_size":"1 Litre","quantity":100,"total_units":100,"bottle_inventory_id":50,"box_inventory_id":55,"box_name":"Regular Box 1 Ltr","bottles_per_box":10,"box_quantity":10,"loose_quantity":0,"outer_boxes_consumed":10,"ordered_units":100,"dispatched_units":100,"remaining_units":0,"label_inventory_id":75,"label_name":"Afield Chlor-20 Ec 1 Litre Label [ACC]","label_owner":"ACC"}],"dispatches":[{"id":1792841126272,"created_at":"2026-10-24T11:25:25.658Z","dispatch_no":"DSP-05","order_id":126,"order_no":"O-05","company_id":623,"warehouse_id":1,"client_id":9,"client_name":"Kisan Agro Agency","dispatch_date":"2026-10-24","status":"Dispatched","total_boxes_dispatched":40,"total_loose_dispatched":0,"total_units_dispatched":400,"delivery_target":"GODOWN","target_warehouse_id":532,"target_warehouse_name":"Gas Godown (WH-ACC-GAS)","stock_deducted":true,"vehicle_no":null,"transporter_name":null,"driver_contact":null,"eway_bill_no":null,"notes":null,"idempotency_key":"DSP-PREP-DSP-05-126","items":[{"id":1792841126051,"created_at":"2026-10-24T11:25:25.803Z","dispatch_id":1792841126272,"order_item_id":180,"product_id":63,"product_name":"Afield Chlor-20 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":124,"batch_no":"B-01","boxes_dispatched":10,"loose_dispatched":0,"total_units_dispatched":100,"unit_price":650,"total_amount":65000},{"id":1792841125831,"created_at":"2026-10-24T11:25:25.803Z","dispatch_id":1792841126272,"order_item_id":179,"product_id":65,"product_name":"Afield Thio-60 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":131,"batch_no":"B-01","boxes_dispatched":10,"loose_dispatched":0,"total_units_dispatched":100,"unit_price":870,"total_amount":87000},{"id":1792841126683,"created_at":"2026-10-24T11:25:25.802Z","dispatch_id":1792841126272,"order_item_id":178,"product_id":64,"product_name":"Afield Profe-40 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":130,"batch_no":"B-01","boxes_dispatched":10,"loose_dispatched":0,"total_units_dispatched":100,"unit_price":950,"total_amount":95000},{"id":1792841126099,"created_at":"2026-10-24T11:25:25.802Z","dispatch_id":1792841126272,"order_item_id":177,"product_id":66,"product_name":"Afield Coragen-80 Ec","packaging_size":"1 Litre","units_per_box":10,"stock_batch_id":129,"batch_no":"B-01","boxes_dispatched":10,"loose_dispatched":0,"total_units_dispatched":100,"unit_price":2400,"total_amount":240000}],"verified_by":"Godown Operator","verified_at":"2026-10-24T11:25:50.107Z","verification_notes":"Physical corrugated cartons, batch seal intact, bottle count and labeling verified.","approved_by":"Dispatch Manager","approved_at":"2026-10-24T11:25:54.295Z","approval_notes":"Authorized for commercial logistics and gate exit.","dispatched_by":"Security Gatekeeper","dispatched_at":"2026-10-24T11:26:10.828Z","invoice_id":1792841176500,"invoice_no":"INV-05"}],"dispatch_status":"Fully Dispatched"}', 'Non-GST', '2026-10-24T11:25:15.006658+00:00', 623, 209)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- TABLE: order_items (8 rows)
-- ------------------------------------------------------------------------------
INSERT INTO public.order_items (id, order_id, product_id, inventory_item_id, product_name, packing_size, bottle_inventory_id, quantity, unit_price, discount, total, box_quantity, loose_quantity, bottles_per_box, total_units, total_volume, created_at, company_id) VALUES
  (173, 122, 63, 74, 'Afield Chlor-20 Ec', '1 Litre', 50, 100, 650, 0, 65000, 0, 0, 0, 0, 0, '2026-10-24T09:30:08.157979+00:00', 623),
  (174, 123, 63, 74, 'Afield Chlor-20 Ec', '1 Litre', 50, 50, 650, 0, 32500, 0, 0, 0, 0, 0, '2026-10-24T09:53:13.584443+00:00', 623),
  (175, 124, 63, 74, 'Afield Chlor-20 Ec', '1 Litre', 50, 20, 650, 0, 13000, 0, 0, 0, 0, 0, '2026-10-24T10:11:25.309622+00:00', 623),
  (176, 125, 63, 74, 'Afield Chlor-20 Ec', '1 Litre', 50, 20, 650, 0, 13000, 0, 0, 0, 0, 0, '2026-10-24T11:00:28.780579+00:00', 623),
  (177, 126, 66, 76, 'Afield Coragen-80 Ec', '1 Litre', 50, 100, 2400, 0, 240000, 0, 0, 0, 0, 0, '2026-10-24T11:25:15.217356+00:00', 623),
  (178, 126, 64, 77, 'Afield Profe-40 Ec', '1 Litre', 50, 100, 950, 0, 95000, 0, 0, 0, 0, 0, '2026-10-24T11:25:15.217356+00:00', 623),
  (179, 126, 65, 78, 'Afield Thio-60 Ec', '1 Litre', 50, 100, 870, 0, 87000, 0, 0, 0, 0, 0, '2026-10-24T11:25:15.217356+00:00', 623),
  (180, 126, 63, 74, 'Afield Chlor-20 Ec', '1 Litre', 50, 100, 650, 0, 65000, 0, 0, 0, 0, 0, '2026-10-24T11:25:15.217356+00:00', 623)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- POSTGRESQL SEQUENCE SYNCHRONIZATION (Prevents duplicate key errors on future inserts)
-- ------------------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('public.companies', 'id'), COALESCE((SELECT MAX(id) FROM public.companies), 1));
SELECT setval(pg_get_serial_sequence('public.branches', 'id'), COALESCE((SELECT MAX(id) FROM public.branches), 1));
SELECT setval(pg_get_serial_sequence('public.warehouses', 'id'), COALESCE((SELECT MAX(id) FROM public.warehouses), 1));
SELECT setval(pg_get_serial_sequence('public.user_company_access', 'id'), COALESCE((SELECT MAX(id) FROM public.user_company_access), 1));
SELECT setval(pg_get_serial_sequence('public.clients', 'id'), COALESCE((SELECT MAX(id) FROM public.clients), 1));
SELECT setval(pg_get_serial_sequence('public.suppliers', 'id'), COALESCE((SELECT MAX(id) FROM public.suppliers), 1));
SELECT setval(pg_get_serial_sequence('public.products', 'id'), COALESCE((SELECT MAX(id) FROM public.products), 1));
SELECT setval(pg_get_serial_sequence('public.product_packaging', 'id'), COALESCE((SELECT MAX(id) FROM public.product_packaging), 1));
SELECT setval(pg_get_serial_sequence('public.inventory_items', 'id'), COALESCE((SELECT MAX(id) FROM public.inventory_items), 1));
SELECT setval(pg_get_serial_sequence('public.stock_batches', 'id'), COALESCE((SELECT MAX(id) FROM public.stock_batches), 1));
SELECT setval(pg_get_serial_sequence('public.stock_movements', 'id'), COALESCE((SELECT MAX(id) FROM public.stock_movements), 1));
SELECT setval(pg_get_serial_sequence('public.orders', 'id'), COALESCE((SELECT MAX(id) FROM public.orders), 1));
SELECT setval(pg_get_serial_sequence('public.order_items', 'id'), COALESCE((SELECT MAX(id) FROM public.order_items), 1));

-- Restore standard replication / trigger role
DO $$
BEGIN
  BEGIN
    SET session_replication_role = 'origin';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

COMMIT;
