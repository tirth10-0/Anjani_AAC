/**
 * assets/js/manufacturing-core.js
 * Authoritative Agrochemical Manufacturing Workflow Engine
 *
 * Implements:
 * 1. Formulation management & versioning (immutable historical recipe snapshots).
 * 2. Production planning (production orders, BOM scaling, dates, assigned employees).
 * 3. Raw-material availability checks (available vs required stock).
 * 4. Material issue and FIFO consumption tracking (idempotency, no double-deduction).
 * 5. Returns, wastage, and material variance tracking.
 * 6. Production completion with actual output, batch numbers, yield %, and operators.
 * 7. QC status management (Pending, Approved, Rejected, On Hold) and Quarantine segregation.
 * 8. Finished-goods inventory updates upon QC approval.
 * 9. Bidirectional batch traceability (finished lot <-> formulation version <-> raw material batches).
 * 10. Production variance and yield reports.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const inventoryCore = require('./inventory-core.js');
    module.exports = factory(inventoryCore);
  } else {
    root.MANUFACTURING_CORE = factory(root.INVENTORY_CORE);
    root.MANUFACTURING_SERVICE = root.MANUFACTURING_CORE.Service;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (inventoryCore) {
  'use strict';

  const InventoryService = inventoryCore?.Service || null;

  // ============================================================================
  // 1. CORE FORMULATION & BOM SCALING UTILITIES
  // ============================================================================
  const BomCalculator = {
    /**
     * Scale a formulation recipe to a target production quantity.
     */
    scaleBom(ingredients, standardBatchSize, targetBatchSize) {
      const stdSize = Math.max(0.001, parseFloat(standardBatchSize) || 1000);
      const tgtSize = Math.max(0, parseFloat(targetBatchSize) || 0);
      const ratio = tgtSize / stdSize;

      return (ingredients || []).map(ing => {
        let reqQty = 0;
        const pct = parseFloat(ing.percentage) || 0;
        const stdQty = parseFloat(ing.quantity) || 0;

        if (pct > 0) {
          reqQty = (pct / 100) * tgtSize;
        } else {
          reqQty = stdQty * ratio;
        }

        return {
          inventory_id: parseInt(ing.product_id || ing.inventory_id, 10),
          inventory_name: ing.product_name || ing.inventory_name || 'Ingredient',
          standard_qty: stdQty,
          percentage: pct,
          required_qty: parseFloat(reqQty.toFixed(4)),
          unit: ing.unit || 'Kg',
          cost_per_unit: parseFloat(ing.cost_per_unit) || 0,
          entry_mode: ing.entry_mode || (pct > 0 ? 'percentage' : 'quantity')
        };
      });
    },

    /**
     * Calculate yield percentage and wastage from planned vs actual output.
     */
    calculateYield(plannedQty, actualOutputQty) {
      const planned = Math.max(0, parseFloat(plannedQty) || 0);
      const actual = Math.max(0, parseFloat(actualOutputQty) || 0);

      const yieldPct = planned > 0 ? parseFloat(((actual / planned) * 100).toFixed(2)) : 0;
      const wastageQty = Math.max(0, parseFloat((planned - actual).toFixed(4)));

      return {
        plannedQty: planned,
        actualOutputQty: actual,
        yieldPct: yieldPct,
        wastageQty: wastageQty
      };
    },

    /**
     * Calculate material consumption variances.
     * variance = (actualConsumed + wastage) - standardRequired
     */
    calculateMaterialVariances(reconciliationList) {
      return (reconciliationList || []).map(m => {
        const std = parseFloat(m.standard_qty || m.required_qty) || 0;
        const issued = parseFloat(m.issued_qty) || std;
        const consumed = parseFloat(m.consumed_qty) || issued;
        const returned = Math.max(0, parseFloat(m.returned_qty) || 0);
        const wastage = Math.max(0, parseFloat(m.wastage_qty) || 0);

        const netConsumed = Math.max(0, consumed - returned);
        const variance = parseFloat(((netConsumed + wastage) - std).toFixed(4));
        const variancePct = std > 0 ? parseFloat(((variance / std) * 100).toFixed(2)) : 0;

        return {
          inventory_id: m.inventory_id,
          inventory_name: m.inventory_name,
          standard_qty: std,
          issued_qty: issued,
          consumed_qty: consumed,
          returned_qty: returned,
          wastage_qty: wastage,
          net_consumed: netConsumed,
          variance_qty: variance,
          variance_pct: variancePct,
          unit: m.unit || 'Kg'
        };
      });
    }
  };

  // ============================================================================
  // 2. AUTHORITATIVE MANUFACTURING SERVICE
  // ============================================================================
  const Service = {
    _dbClient: null,

    getDb() {
      if (this._dbClient) return this._dbClient;
      if (typeof window !== 'undefined' && window.dbClient) {
        return window.dbClient;
      }
      return null;
    },

    setDb(client) {
      this._dbClient = client;
    },

    // --------------------------------------------------------------------------
    // A. FORMULATION MANAGEMENT & VERSIONING
    // --------------------------------------------------------------------------

    /**
     * Get formulations with version details and ingredients.
     */
    async getFormulations(options = {}) {
      const db = this.getDb();
      if (!db) return [];

      try {
        let fQuery = db.from('formulations').select('*').neq('status', 'Production').order('id', { ascending: false });
        if (options.companyId) {
          fQuery = fQuery.eq('company_id', options.companyId);
        }

        const [formsRes, ingsRes] = await Promise.all([
          fQuery,
          db.from('formulation_ingredients').select('*')
        ]);

        const forms = formsRes.data || [];
        const ings = ingsRes.data || [];

        return forms.map(f => {
          const fIngs = ings.filter(i => String(i.formulation_id) === String(f.id)).map(i => ({
            id: i.id,
            inventory_id: i.product_id,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: parseFloat(i.quantity) || 0,
            unit: i.unit || 'Kg',
            percentage: parseFloat(i.percentage) || 0,
            cost_per_unit: parseFloat(i.cost_per_unit) || 0,
            entry_mode: i.entry_mode || (parseFloat(i.percentage) > 0 ? 'percentage' : 'quantity')
          }));

          return {
            id: f.id,
            product_id: f.product_id,
            product_name: f.product_name || `Formulation ${f.id}`,
            version: parseInt(f.version, 10) || 1,
            batch_size: parseFloat(f.standard_batch_size || f.batch_size) || 1000,
            batch_unit: f.standard_unit || f.batch_unit || 'Litre',
            expected_yield_pct: parseFloat(f.expected_yield_pct) || 100.0,
            approval_status: f.approval_status || 'Approved',
            status: f.status || 'Draft',
            notes: f.notes || '',
            density: parseFloat(f.density) || 1.0,
            created_by: f.created_by || 'Admin',
            approved_by: f.approved_by || null,
            approved_at: f.approved_at || null,
            ingredients: fIngs
          };
        });
      } catch (err) {
        console.error('[MANUFACTURING_CORE] getFormulations error:', err);
        return [];
      }
    },

    /**
     * Save or revise formulation with automatic versioning.
     * When an approved recipe is modified, previous version is snapshotted to formulation_versions.
     */
    async saveFormulation(formData) {
      const db = this.getDb();
      if (!db) throw new Error('Database client not initialized');

      const isEdit = Boolean(formData.id);
      let formId = formData.id;
      let newVersion = 1;

      if (isEdit) {
        // Fetch current formulation state
        const { data: existingForm } = await db.from('formulations').select('*').eq('id', formId).maybeSingle();
        const { data: existingIngs } = await db.from('formulation_ingredients').select('*').eq('formulation_id', formId);

        if (existingForm) {
          const oldVersion = parseInt(existingForm.version, 10) || 1;
          newVersion = oldVersion + 1;

          // Snapshot existing version to formulation_versions (immutable archive)
          const snapshotPayload = {
            formulation_id: formId,
            version: oldVersion,
            product_id: existingForm.product_id,
            product_name: existingForm.product_name,
            batch_size: existingForm.standard_batch_size || existingForm.batch_size || 1000,
            batch_unit: existingForm.standard_unit || existingForm.batch_unit || 'Litre',
            expected_yield_pct: existingForm.expected_yield_pct || 100.0,
            density: existingForm.density || 1.0,
            ingredients_snapshot: existingIngs || [],
            approval_status: existingForm.approval_status || 'Approved',
            approved_by: existingForm.approved_by || 'Admin',
            approved_at: existingForm.approved_at || new Date().toISOString(),
            notes: `Archived version ${oldVersion} prior to revision`
          };

          try {
            await db.from('formulation_versions').insert([snapshotPayload]);
          } catch (e) {
            console.warn('[MANUFACTURING_CORE] Version snapshot warning:', e.message);
          }
        }
      }

      const formPayload = {
        product_id: parseInt(formData.product_id, 10),
        product_name: formData.product_name,
        version: newVersion,
        standard_batch_size: parseFloat(formData.batch_size) || 1000,
        batch_size: parseFloat(formData.batch_size) || 1000,
        standard_unit: formData.batch_unit || 'Litre',
        batch_unit: formData.batch_unit || 'Litre',
        expected_yield_pct: parseFloat(formData.expected_yield_pct) || 100.0,
        approval_status: formData.approval_status || 'Approved',
        status: 'Draft',
        notes: formData.notes || '',
        density: parseFloat(formData.density) || 1.0,
        created_by: formData.created_by || 'Admin',
        approved_by: formData.approved_by || 'Admin',
        approved_at: new Date().toISOString(),
        company_id: formData.company_id || 1
      };

      if (isEdit) {
        const { error } = await db.from('formulations').update(formPayload).eq('id', formId);
        if (error) throw error;
        await db.from('formulation_ingredients').delete().eq('formulation_id', formId);
      } else {
        const { data, error } = await db.from('formulations').insert([formPayload]).select();
        if (error) throw error;
        formId = data[0].id;
      }

      // Insert ingredients
      const ings = (formData.ingredients || []).map(ing => ({
        formulation_id: formId,
        product_id: parseInt(ing.inventory_id || ing.product_id, 10),
        product_name: ing.product_name || ing.inventory_name || 'Ingredient',
        quantity: parseFloat(ing.quantity) || 0,
        unit: ing.unit || 'Kg',
        percentage: parseFloat(ing.percentage) || 0,
        cost_per_unit: parseFloat(ing.cost_per_unit) || 0,
        entry_mode: ing.entry_mode || (parseFloat(ing.percentage) > 0 ? 'percentage' : 'quantity')
      }));

      if (ings.length > 0) {
        const { error: ingsErr } = await db.from('formulation_ingredients').insert(ings);
        if (ingsErr) throw ingsErr;
      }

      // Log security / RBAC audit if available
      if (typeof window !== 'undefined' && window.RBAC) {
        window.RBAC.logAudit(isEdit ? 'FORMULATION_REVISED' : 'FORMULATION_CREATED', {
          formulation_id: formId,
          version: newVersion,
          product_name: formData.product_name
        });
      }

      return { id: formId, version: newVersion };
    },

    /**
     * Get historical versions for a formulation.
     */
    async getFormulationVersions(formulationId) {
      const db = this.getDb();
      if (!db || !formulationId) return [];

      try {
        const { data, error } = await db
          .from('formulation_versions')
          .select('*')
          .eq('formulation_id', formulationId)
          .order('version', { ascending: false });

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn('[MANUFACTURING_CORE] getFormulationVersions warning:', err.message);
        return [];
      }
    },

    // --------------------------------------------------------------------------
    // B. PRODUCTION PLANNING & AVAILABILITY CHECKS
    // --------------------------------------------------------------------------

    /**
     * Auto-generate sequential production order number (e.g. PO-2026-001).
     */
    async generateProductionOrderNo() {
      const db = this.getDb();
      const year = new Date().getFullYear();
      let maxNum = 0;

      if (db) {
        try {
          const { data } = await db.from('production_orders').select('order_no').order('id', { ascending: false }).limit(50);
          (data || []).forEach(row => {
            if (row.order_no) {
              const match = row.order_no.match(/PO-(\d+)-(\d+)/i);
              if (match) {
                const n = parseInt(match[2], 10);
                if (n > maxNum) maxNum = n;
              }
            }
          });
        } catch (_) {}
      }

      return `PO-${year}-${String(maxNum + 1).padStart(3, '0')}`;
    },

    /**
     * Check raw material availability against current stock before issuing/starting.
     */
    async checkMaterialAvailability(ingredients, standardBatchSize, plannedQty) {
      const scaledBom = BomCalculator.scaleBom(ingredients, standardBatchSize, plannedQty);
      const results = [];
      let isAllSufficient = true;

      for (const item of scaledBom) {
        let available = 0;
        if (InventoryService && typeof InventoryService.getItemStock === 'function') {
          available = await InventoryService.getItemStock(item.inventory_id);
        } else {
          // Fallback direct check
          const db = this.getDb();
          if (db) {
            const { data } = await db.from('inventory_items').select('stock').eq('id', item.inventory_id).maybeSingle();
            available = parseFloat(data?.stock) || 0;
          }
        }

        const isSufficient = available >= item.required_qty;
        if (!isSufficient) isAllSufficient = false;

        results.push({
          inventory_id: item.inventory_id,
          inventory_name: item.inventory_name,
          required_qty: item.required_qty,
          available_qty: available,
          deficit_qty: isSufficient ? 0 : parseFloat((item.required_qty - available).toFixed(4)),
          unit: item.unit,
          isSufficient
        });
      }

      return {
        isSufficient: isAllSufficient,
        items: results,
        deficitCount: results.filter(r => !r.isSufficient).length
      };
    },

    /**
     * Create a production planning order with scaled BOM snapshot.
     */
    async createProductionOrder(orderData) {
      const db = this.getDb();
      if (!db) throw new Error('Database client not initialized');

      const scaledBom = BomCalculator.scaleBom(
        orderData.ingredients,
        orderData.standard_batch_size || 1000,
        orderData.planned_quantity
      );

      const orderNo = orderData.order_no || (await this.generateProductionOrderNo());

      const payload = {
        order_no: orderNo,
        company_id: orderData.company_id || 1,
        branch_id: orderData.branch_id || 1,
        warehouse_id: orderData.warehouse_id || 1,
        product_id: parseInt(orderData.product_id, 10),
        product_name: orderData.product_name,
        formulation_id: parseInt(orderData.formulation_id, 10),
        formulation_version: parseInt(orderData.formulation_version, 10) || 1,
        planned_quantity: parseFloat(orderData.planned_quantity) || 0,
        unit: orderData.unit || 'Litre',
        target_start_date: orderData.target_start_date || new Date().toISOString().split('T')[0],
        target_due_date: orderData.target_due_date || new Date().toISOString().split('T')[0],
        assigned_operator: orderData.assigned_operator || 'Operator',
        assigned_supervisor: orderData.assigned_supervisor || 'Supervisor',
        status: 'Planned',
        material_status: 'Pending',
        qc_status: 'Pending',
        planned_bom: scaledBom,
        notes: orderData.notes || '',
        idempotency_key: `PROD_ORDER_${orderNo}_${Date.now()}`
      };

      const stampedPayload = typeof window !== 'undefined' && window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(payload) : payload;

      const { data, error } = await db.from('production_orders').insert([stampedPayload]).select();
      if (error) throw error;

      const createdOrder = data[0];

      if (typeof window !== 'undefined' && window.RBAC) {
        window.RBAC.logAudit('PRODUCTION_ORDER_CREATED', {
          order_id: createdOrder.id,
          order_no: orderNo,
          product_name: orderData.product_name,
          planned_quantity: orderData.planned_quantity
        });
      }

      return createdOrder;
    },

    // --------------------------------------------------------------------------
    // C. MATERIAL ISSUE (POSTING WORKFLOW STEP 1)
    // --------------------------------------------------------------------------

    /**
     * Issues materials for a production order.
     * Enforces single-posting rule: checks material_status to prevent double deduction.
     */
    async issueMaterials(orderId, options = {}) {
      const db = this.getDb();
      if (!db) throw new Error('Database client not initialized');

      const { data: order, error: orderErr } = await db
        .from('production_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) throw new Error('Production order not found');

      // CRITICAL GUARD: Never deduct same materials twice!
      if (order.material_status === 'Issued') {
        throw new Error(`MATERIALS_ALREADY_ISSUED: Materials for Order #${order.order_no} were already deducted.`);
      }

      const bom = order.planned_bom || [];
      if (bom.length === 0) {
        throw new Error('No bill of materials found on order');
      }

      // Check stock before starting issue
      const availCheck = await this.checkMaterialAvailability(bom, 1, 1);
      if (!availCheck.isSufficient && !options.allowDeficit) {
        const defNames = availCheck.items.filter(i => !i.isSufficient).map(i => `${i.inventory_name} (needs ${i.required_qty}, has ${i.available_qty})`).join(', ');
        throw new Error(`INSUFFICIENT_STOCK: Cannot issue materials due to stock deficit: ${defNames}`);
      }

      const consumedBatchesRecord = [];

      // Deduct each raw material using authoritative FIFO engine
      for (const item of bom) {
        const qtyToDeduct = item.required_qty;
        if (qtyToDeduct <= 0) continue;

        let deductedBatches = [];
        if (InventoryService && typeof InventoryService.deductStockFIFO === 'function') {
          await InventoryService.deductStockFIFO({
            itemId: item.inventory_id,
            quantity: qtyToDeduct,
            movementType: 'MANUFACTURING_ISSUE',
            referenceType: 'production_orders',
            referenceId: order.id,
            referenceNo: order.order_no,
            idempotencyKey: `ISSUE_${order.id}_${item.inventory_id}`,
            notes: `Material issued for production order ${order.order_no}`
          });
        }

        // Query which batch was deducted for traceability recording
        try {
          const { data: recentMovs } = await db
            .from('stock_movements')
            .select('batch_id, qty, stock_batches(batch_no, purchase_date, supplier_id)')
            .eq('txn_id', order.id)
            .order('id', { ascending: false })
            .limit(5);

          deductedBatches = (recentMovs || []).map(m => ({
            batch_id: m.batch_id,
            batch_no: m.stock_batches?.batch_no || 'BATCH',
            qty_deducted: Math.abs(parseFloat(m.qty) || 0)
          }));
        } catch (_) {}

        // Save material tracking line
        const matRecord = {
          order_id: order.id,
          inventory_id: item.inventory_id,
          inventory_name: item.inventory_name,
          standard_qty: item.required_qty,
          issued_qty: item.required_qty,
          consumed_qty: item.required_qty,
          returned_qty: 0,
          wastage_qty: 0,
          variance_qty: 0,
          unit: item.unit,
          consumed_batches: deductedBatches
        };

        try {
          await db.from('production_materials').insert([matRecord]);
        } catch (_) {}

        consumedBatchesRecord.push(matRecord);
      }

      // Update order status
      const { error: updErr } = await db
        .from('production_orders')
        .update({
          status: 'Materials Issued',
          material_status: 'Issued'
        })
        .eq('id', order.id);

      if (updErr) throw updErr;

      if (typeof window !== 'undefined' && window.RBAC) {
        window.RBAC.logAudit('MATERIALS_ISSUED', {
          order_id: order.id,
          order_no: order.order_no,
          ingredients_count: bom.length
        });
      }

      return { success: true, orderId: order.id, material_status: 'Issued' };
    },

    // --------------------------------------------------------------------------
    // D. PRODUCTION COMPLETION & RECONCILIATION (POSTING WORKFLOW STEP 2)
    // --------------------------------------------------------------------------

    /**
     * Complete production: records output batch into Quarantine, returns unused materials, and logs variances.
     */
    async completeProductionOrder(orderId, completionData) {
      const db = this.getDb();
      if (!db) throw new Error('Database client not initialized');

      const { data: order, error: orderErr } = await db
        .from('production_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) throw new Error('Production order not found');

      if (order.status === 'Completed') {
        throw new Error(`ORDER_ALREADY_COMPLETED: Production order #${order.order_no} is already completed.`);
      }

      const actualOutput = parseFloat(completionData.actual_output_qty) || 0;
      if (actualOutput <= 0) {
        throw new Error('Valid actual output quantity is required');
      }

      const { yieldPct, wastageQty } = BomCalculator.calculateYield(order.planned_quantity, actualOutput);
      const outputBatchNo = completionData.batch_no || `B-${String(order.id).padStart(2, '0')}`;
      const completionDate = completionData.date || new Date().toISOString().split('T')[0];

      // 1. Process Material Reconciliation & Unused Returns
      const reconciliation = completionData.reconciliation || [];
      const variances = BomCalculator.calculateMaterialVariances(reconciliation);

      for (const item of variances) {
        // If unused raw materials were returned to warehouse, restock them!
        if (item.returned_qty > 0) {
          if (InventoryService && typeof InventoryService.restoreStock === 'function') {
            await InventoryService.restoreStock(item.inventory_id, item.returned_qty);
            await InventoryService.syncItemStock(item.inventory_id);
          }

          if (InventoryService && typeof InventoryService.logMovement === 'function') {
            await InventoryService.logMovement({
              itemId: item.inventory_id,
              movementType: 'MANUFACTURING_RETURN',
              quantity: item.returned_qty,
              referenceType: 'production_orders',
              referenceId: order.id,
              referenceNo: order.order_no,
              notes: `Unused material returned from production order ${order.order_no}`
            });
          }
        }

        // Update production_materials row with actual consumption, returns, wastage
        try {
          await db
            .from('production_materials')
            .update({
              consumed_qty: item.consumed_qty,
              returned_qty: item.returned_qty,
              wastage_qty: item.wastage_qty,
              variance_qty: item.variance_qty
            })
            .eq('order_id', order.id)
            .eq('inventory_id', item.inventory_id);
        } catch (_) {}
      }

      // 2. Book Finished Output Batch into Quarantine (NOT yet saleable!)
      const quarantineBatchPayload = {
        item_id: order.product_id,
        item_name: order.product_name,
        item_type: 'Inventory',
        batch_no: outputBatchNo,
        initial_qty: actualOutput,
        current_qty: actualOutput,
        unit: order.unit || 'Litre',
        purchase_date: completionDate,
        purchase_price: 0,
        is_quarantine: true, // QUARANTINE: segregated from saleable stock
        qc_status: 'Pending', // QC MUST APPROVE BEFORE DISPATCH
        production_order_id: order.id,
        company_id: order.company_id || 1,
        warehouse: 'Main Warehouse'
      };

      const stampedBatch = typeof window !== 'undefined' && window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(quarantineBatchPayload) : quarantineBatchPayload;

      const { data: bData, error: bErr } = await db.from('stock_batches').insert([stampedBatch]).select();
      if (bErr) throw bErr;
      const createdBatchId = bData && bData[0] ? bData[0].id : null;

      // 3. Log Movement as Quarantined Production Output
      if (InventoryService && typeof InventoryService.logMovement === 'function') {
        await InventoryService.logMovement({
          itemId: order.product_id,
          batchId: createdBatchId,
          movementType: 'PRODUCTION_OUTPUT_QUARANTINE',
          quantity: actualOutput,
          referenceType: 'production_orders',
          referenceId: order.id,
          referenceNo: outputBatchNo,
          notes: `Batch ${outputBatchNo} manufactured, awaiting QC release`
        });
      }

      // 4. Create record in production_batches
      const pbPayload = {
        order_id: order.id,
        batch_no: outputBatchNo,
        product_id: order.product_id,
        product_name: order.product_name,
        formula_name: order.product_name,
        formulation_version: order.formulation_version || 1,
        planned_qty: order.planned_quantity,
        actual_output_qty: actualOutput,
        quantity_produced: actualOutput,
        yield_percentage: yieldPct,
        wastage_qty: wastageQty,
        qc_status: 'Pending',
        operator_name: completionData.operator_name || order.assigned_operator,
        supervisor_name: completionData.supervisor_name || order.assigned_supervisor,
        date: completionDate,
        notes: completionData.notes || '',
        company_id: order.company_id || 1
      };

      const stampedPb = typeof window !== 'undefined' && window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(pbPayload) : pbPayload;

      let savedPbId = null;
      try {
        const { data: pbRes } = await db.from('production_batches').insert([stampedPb]).select();
        savedPbId = pbRes && pbRes[0] ? pbRes[0].id : null;
      } catch (e) {
        console.warn('[MANUFACTURING_CORE] production_batches insert notice:', e.message);
      }

      // 5. Update production order status to Completed
      const { error: updErr } = await db
        .from('production_orders')
        .update({
          status: 'Completed',
          qc_status: 'Pending',
          output_batch_no: outputBatchNo,
          actual_output_qty: actualOutput,
          yield_pct: yieldPct,
          wastage_qty: wastageQty,
          actual_materials: variances
        })
        .eq('id', order.id);

      if (updErr) throw updErr;

      if (typeof window !== 'undefined' && window.RBAC) {
        window.RBAC.logAudit('PRODUCTION_COMPLETED', {
          order_id: order.id,
          order_no: order.order_no,
          batch_no: outputBatchNo,
          actual_output_qty: actualOutput,
          yield_pct: yieldPct
        });
      }

      return {
        success: true,
        orderId: order.id,
        batchNo: outputBatchNo,
        actualOutput,
        yieldPct,
        qcStatus: 'Pending',
        quarantineBatchId: createdBatchId
      };
    },

    // --------------------------------------------------------------------------
    // E. QC STATUS MANAGEMENT & SALEABLE STOCK RELEASE
    // --------------------------------------------------------------------------

    /**
     * QC Inspection & Decision:
     * - Approved: releases quarantined stock to available saleable inventory.
     * - Rejected: marks batch permanently quarantined/rejected.
     * - On Hold: maintains batch in quarantine under investigation.
     */
    async updateQcStatus(orderId, { qcStatus, qcNotes = '', inspectedBy = 'QC Officer' }) {
      const db = this.getDb();
      if (!db) throw new Error('Database client not initialized');

      const validStatuses = ['Approved', 'Rejected', 'On Hold', 'Pending'];
      if (!validStatuses.includes(qcStatus)) {
        throw new Error(`Invalid QC status: ${qcStatus}. Expected one of: ${validStatuses.join(', ')}`);
      }

      const { data: order, error: orderErr } = await db
        .from('production_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderErr || !order) throw new Error('Production order not found');

      const batchNo = order.output_batch_no;
      const isApproved = qcStatus === 'Approved';
      const isQuarantine = !isApproved; // True for Rejected, On Hold, Pending

      // 1. Update stock_batches quarantine flag
      if (batchNo) {
        await db
          .from('stock_batches')
          .update({
            is_quarantine: isQuarantine,
            qc_status: qcStatus
          })
          .eq('batch_no', batchNo);

        // If approved, sync item stock to make it immediately SALEABLE!
        if (isApproved && InventoryService && typeof InventoryService.syncItemStock === 'function') {
          await InventoryService.syncItemStock(order.product_id);

          await InventoryService.logMovement({
            itemId: order.product_id,
            movementType: 'QC_APPROVED_RELEASE',
            quantity: order.actual_output_qty || order.planned_quantity,
            referenceType: 'production_orders',
            referenceId: order.id,
            referenceNo: batchNo,
            notes: `Batch ${batchNo} released from quarantine into saleable inventory`
          });
        }
      }

      // 2. Update production_orders record
      await db
        .from('production_orders')
        .update({
          qc_status: qcStatus,
          qc_notes: qcNotes,
          qc_inspected_by: inspectedBy,
          qc_inspected_at: new Date().toISOString()
        })
        .eq('id', order.id);

      // 3. Update production_batches record
      try {
        await db
          .from('production_batches')
          .update({
            qc_status: qcStatus,
            qc_notes: qcNotes,
            qc_tested_by: inspectedBy,
            qc_tested_at: new Date().toISOString()
          })
          .eq('order_id', order.id);
      } catch (_) {}

      if (typeof window !== 'undefined' && window.RBAC) {
        window.RBAC.logAudit(isApproved ? 'QC_BATCH_APPROVED' : `QC_BATCH_${qcStatus.toUpperCase().replace(/\s+/g, '_')}`, {
          order_id: order.id,
          order_no: order.order_no,
          batch_no: batchNo,
          qc_status: qcStatus,
          inspected_by: inspectedBy
        });
      }

      return {
        success: true,
        orderId: order.id,
        batchNo,
        qcStatus,
        isSaleable: isApproved
      };
    },

    // --------------------------------------------------------------------------
    // F. BIDIRECTIONAL BATCH TRACEABILITY
    // --------------------------------------------------------------------------

    /**
     * Forward & Backward Batch Traceability Inspector.
     * Given a finished batch or raw batch, traces full genealogy.
     */
    async getBatchTraceability(batchNo) {
      const db = this.getDb();
      if (!db || !batchNo) return null;

      try {
        // 1. Check if batchNo is a finished production batch
        let { data: order } = await db
          .from('production_orders')
          .select('*, formulations(*)')
          .eq('output_batch_no', batchNo)
          .maybeSingle();

        if (!order) {
          // Check production_batches
          const { data: pb } = await db
            .from('production_batches')
            .select('*')
            .eq('batch_no', batchNo)
            .maybeSingle();

          if (pb && pb.order_id) {
            const { data: ord } = await db
              .from('production_orders')
              .select('*, formulations(*)')
              .eq('id', pb.order_id)
              .maybeSingle();
            order = ord;
          }
        }

        if (order) {
          // Fetch raw materials consumed for this order
          const { data: mats } = await db
            .from('production_materials')
            .select('*')
            .eq('order_id', order.id);

          // Fetch stock batch info
          const { data: stockBatch } = await db
            .from('stock_batches')
            .select('*')
            .eq('batch_no', batchNo)
            .maybeSingle();

          return {
            type: 'FINISHED_GOOD_FORWARD_TRACE',
            batchNo: batchNo,
            productName: order.product_name,
            productId: order.product_id,
            orderNo: order.order_no,
            manufacturingDate: order.target_start_date,
            actualOutputQty: order.actual_output_qty,
            unit: order.unit,
            yieldPct: order.yield_pct,
            operator: order.assigned_operator,
            supervisor: order.assigned_supervisor,
            qcStatus: order.qc_status,
            qcInspector: order.qc_inspected_by,
            qcTestedAt: order.qc_inspected_at,
            qcNotes: order.qc_notes,
            isQuarantine: stockBatch?.is_quarantine ?? false,
            formulation: {
              id: order.formulation_id,
              name: order.formulations?.product_name || order.product_name,
              version: order.formulation_version || 1,
              expectedYield: order.formulations?.expected_yield_pct || 100
            },
            consumedRawMaterials: (mats || []).map(m => ({
              inventoryId: m.inventory_id,
              inventoryName: m.inventory_name,
              standardQty: m.standard_qty,
              consumedQty: m.consumed_qty,
              returnedQty: m.returned_qty,
              wastageQty: m.wastage_qty,
              varianceQty: m.variance_qty,
              unit: m.unit,
              sourceBatches: m.consumed_batches || []
            }))
          };
        }

        // 2. Otherwise check if batchNo is a Raw Material Batch (Backward Trace)
        const { data: rawBatch } = await db
          .from('stock_batches')
          .select('*, inventory_items(name)')
          .eq('batch_no', batchNo)
          .maybeSingle();

        if (rawBatch) {
          // Find production orders that consumed this item or referenced this batch
          const { data: movements } = await db
            .from('stock_movements')
            .select('*, production_orders(*)')
            .eq('batch_id', rawBatch.id)
            .eq('txn_type', 'MANUFACTURING_ISSUE');

          return {
            type: 'RAW_MATERIAL_BACKWARD_TRACE',
            batchNo: batchNo,
            itemName: rawBatch.item_name || rawBatch.inventory_items?.name,
            supplierId: rawBatch.supplier_id,
            purchaseDate: rawBatch.purchase_date,
            initialQty: rawBatch.initial_qty,
            currentQty: rawBatch.current_qty,
            affectedProductionOrders: (movements || []).map(m => ({
              orderId: m.txn_id,
              movementQty: Math.abs(parseFloat(m.qty) || 0),
              orderNo: m.production_orders?.order_no || `Order #${m.txn_id}`
            }))
          };
        }

        return null;
      } catch (err) {
        console.error('[MANUFACTURING_CORE] getBatchTraceability error:', err);
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // G. PRODUCTION REPORTS & VARIANCE ANALYTICS
    // --------------------------------------------------------------------------

    /**
     * Compile manufacturing variance report comparing planned vs actual quantities,
     * yield, wastage, and raw material variances.
     */
    async getProductionVarianceReport(companyId = null) {
      const db = this.getDb();
      if (!db) return null;

      try {
        let q = db.from('production_orders').select('*').order('id', { ascending: false });
        if (companyId) q = q.eq('company_id', companyId);

        const { data: orders, error } = await q;
        if (error) throw error;

        const allOrders = orders || [];
        const completed = allOrders.filter(o => o.status === 'Completed');

        let totalPlanned = 0;
        let totalOutput = 0;
        let totalWastage = 0;
        let sumYield = 0;

        completed.forEach(o => {
          totalPlanned += parseFloat(o.planned_quantity) || 0;
          totalOutput += parseFloat(o.actual_output_qty) || 0;
          totalWastage += parseFloat(o.wastage_qty) || 0;
          sumYield += parseFloat(o.yield_pct) || 0;
        });

        const avgYield = completed.length > 0 ? parseFloat((sumYield / completed.length).toFixed(2)) : 0;

        return {
          totalOrders: allOrders.length,
          completedBatches: completed.length,
          totalPlannedOutput: totalPlanned,
          totalActualOutput: totalOutput,
          totalWastage: totalWastage,
          averageYieldPct: avgYield,
          ordersList: allOrders.map(o => ({
            id: o.id,
            orderNo: o.order_no,
            productName: o.product_name,
            formulationVersion: o.formulation_version || 1,
            plannedQty: o.planned_quantity,
            actualOutputQty: o.actual_output_qty || 0,
            yieldPct: o.yield_pct || 0,
            wastageQty: o.wastage_qty || 0,
            status: o.status,
            qcStatus: o.qc_status,
            date: o.target_start_date,
            operator: o.assigned_operator,
            supervisor: o.assigned_supervisor,
            materials: o.actual_materials || []
          }))
        };
      } catch (err) {
        console.error('[MANUFACTURING_CORE] getProductionVarianceReport error:', err);
        return null;
      }
    }
  };

  return {
    BomCalculator,
    Service
  };
});
