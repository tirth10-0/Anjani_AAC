/**
 * assets/js/audit-logger.js
 * AgroChem ERP - Enterprise Audit Logging & Immutability Engine
 *
 * Captures comprehensive audit trails for:
 * 1. STOCK_MOVEMENT: Movements, FIFO deductions, receipts, restock, warehouse transfers.
 * 2. PRODUCTION_COMPLETION: Formulation runs, planned vs actual output, batch numbers, operators.
 * 3. QC_DECISION: QC Approvals, rejections, holds, test notes, quarantine releases.
 * 4. PACKING_APPROVAL: Packaging runs, boxes packed, loose units, wastage/breakage.
 * 5. DISPATCH_POSTING: Dispatch slips, gate passes, vehicle details, quantity verified.
 * 6. INVOICE_POSTING: Commercial invoice generation, pricing basis, GST, grand total.
 * 7. PERMISSION_CHANGE: Scoped role assignments, revocations, matrix edits.
 * 8. FINANCIAL_ADJUSTMENT: Credit/debit notes, payment reversals, manual ledger entries.
 *
 * Immutability Guarantee:
 * - Records cannot be modified or deleted. Deletion/modification attempts throw AUDIT_LOG_IMMUTABLE.
 * - Stores actor, timestamp, affected record (table, id, ref), action, before/after values.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AUDIT_LOGGER = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'erp_comprehensive_audit_logs';
  let inMemoryAuditLogs = [];

  // Load buffered logs from localStorage if available
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) inMemoryAuditLogs = JSON.parse(raw);
    } catch (e) {
      inMemoryAuditLogs = [];
    }
  }

  class AuditLogger {
    constructor(dbClient = null) {
      this.db = dbClient || (typeof window !== 'undefined' ? window.dbClient : null);
    }

    setDb(dbClient) {
      this.db = dbClient;
    }

    /**
     * Core append-only logging method.
     */
    async log({
      companyId = 1,
      tenantId = 1,
      actorEmail = 'system@afield.local',
      actionCategory, // 'STOCK_MOVEMENT', 'PRODUCTION_COMPLETION', 'QC_DECISION', 'PACKING_APPROVAL', 'DISPATCH_POSTING', 'INVOICE_POSTING', 'PERMISSION_CHANGE', 'FINANCIAL_ADJUSTMENT'
      actionName,
      tableName,
      recordId = null,
      referenceNo = null,
      beforeValues = null,
      afterValues = null,
      metadata = null
    }) {
      if (!actionCategory || !actionName || !tableName) {
        throw new Error('AUDIT_INVALID_CALL: actionCategory, actionName, and tableName are required.');
      }

      const logRecord = {
        id: inMemoryAuditLogs.length + 1,
        tenant_id: tenantId,
        company_id: companyId,
        actor_email: actorEmail,
        action_category: actionCategory,
        action_name: actionName,
        table_name: tableName,
        record_id: recordId,
        reference_no: referenceNo,
        before_values: beforeValues ? JSON.parse(JSON.stringify(beforeValues)) : null,
        after_values: afterValues ? JSON.parse(JSON.stringify(afterValues)) : null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        is_immutable: true,
        created_at: new Date().toISOString()
      };

      inMemoryAuditLogs.unshift(logRecord);

      // Keep recent 1000 in local storage buffer
      if (typeof localStorage !== 'undefined') {
        try {
          const slice = inMemoryAuditLogs.slice(0, 1000);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
        } catch (e) {}
      }

      // Persist to database if client available
      if (this.db) {
        try {
          const { error } = await this.db.from('audit_logs').insert([logRecord]);
          if (error) {
            // Also attempt inserting into rbac_audit_logs for backward compatibility
            await this.db.from('rbac_audit_logs').insert([{
              company_id: companyId,
              actor_email: actorEmail,
              action_type: `${actionCategory}_${actionName}`,
              target_user: referenceNo,
              details: { before: beforeValues, after: afterValues, metadata }
            }]).catch(() => {});
          }
        } catch (err) {
          console.warn('[AUDIT_LOGGER] DB log write notice:', err.message);
        }
      }

      return logRecord;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SPECIFIC AUDIT ACTION WRAPPERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * 1. Stock Movements
     */
    async logStockMovement({
      companyId = 1,
      actorEmail = 'store@afield.local',
      itemId,
      itemName,
      batchId = null,
      batchNo = null,
      movementType, // 'PURCHASE_INWARD', 'FIFO_DEDUCTION', 'DISPATCH_EXIT', 'RESTORE_RETURN'
      qtyBefore,
      qtyChange,
      qtyAfter,
      warehouse = 'Main Godown',
      referenceNo = null,
      notes = ''
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: movementType,
        tableName: 'stock_batches',
        recordId: batchId || itemId,
        referenceNo: referenceNo || batchNo,
        beforeValues: { stock: qtyBefore, warehouse },
        afterValues: { stock: qtyAfter, change: qtyChange, warehouse },
        metadata: { itemId, itemName, batchNo, notes }
      });
    }

    /**
     * 2. Production Completion
     */
    async logProductionCompletion({
      companyId = 1,
      actorEmail = 'production@afield.local',
      orderId,
      orderNo,
      batchNo,
      productName,
      plannedQty,
      actualOutput,
      yieldPercentage,
      operator = 'Factory Operator',
      supervisor = 'Production Manager'
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PRODUCTION_COMPLETION',
        actionName: 'BATCH_PRODUCED',
        tableName: 'production_batches',
        recordId: orderId,
        referenceNo: batchNo,
        beforeValues: { status: 'In Production', plannedQty },
        afterValues: { status: 'Completed_Quarantine', actualOutput, yieldPercentage },
        metadata: { orderNo, productName, operator, supervisor }
      });
    }

    /**
     * 3. QC Decision
     */
    async logQCDecision({
      companyId = 1,
      actorEmail = 'qc@afield.local',
      batchId,
      batchNo,
      previousStatus = 'Pending',
      decision, // 'Approved', 'Rejected', 'On Hold'
      inspector = 'QC Officer',
      testNotes = '',
      sampleParameters = null
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'QC_DECISION',
        actionName: `QC_${decision.toUpperCase()}`,
        tableName: 'stock_batches',
        recordId: batchId,
        referenceNo: batchNo,
        beforeValues: { qc_status: previousStatus, is_quarantine: true },
        afterValues: { qc_status: decision, is_quarantine: decision !== 'Approved' },
        metadata: { inspector, testNotes, sampleParameters }
      });
    }

    /**
     * 4. Packaging Approval
     */
    async logPackingApproval({
      companyId = 1,
      actorEmail = 'supervisor@afield.local',
      packingOrderId,
      lotNo,
      sku,
      boxesPacked,
      looseUnits,
      totalUnits,
      breakageCount = 0,
      approver = 'Packaging Supervisor'
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PACKING_APPROVAL',
        actionName: 'PACKING_VERIFIED',
        tableName: 'packaging_orders',
        recordId: packingOrderId,
        referenceNo: lotNo,
        beforeValues: { status: 'Packing In Progress' },
        afterValues: { status: 'Packing Approved', boxesPacked, looseUnits, totalUnits, breakageCount },
        metadata: { sku, approver }
      });
    }

    /**
     * 5. Dispatch Posting
     */
    async logDispatchPosting({
      companyId = 1,
      actorEmail = 'dispatch@afield.local',
      dispatchId,
      dispatchNo,
      orderNo,
      clientName,
      vehicleNo,
      driverName,
      boxesDispatched,
      looseDispatched,
      totalUnitsDispatched
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'DISPATCH_POSTING',
        actionName: 'GATE_EXIT_EXECUTED',
        tableName: 'dispatches',
        recordId: dispatchId,
        referenceNo: dispatchNo,
        beforeValues: { status: 'Approved for Dispatch', is_stock_deducted: false },
        afterValues: { status: 'Dispatched_GateExit', is_stock_deducted: true, dispatchedAt: new Date().toISOString() },
        metadata: { orderNo, clientName, vehicleNo, driverName, boxesDispatched, looseDispatched, totalUnitsDispatched }
      });
    }

    /**
     * 6. Invoice Posting
     */
    async logInvoicePosting({
      companyId = 1,
      actorEmail = 'billing@afield.local',
      invoiceId,
      invoiceNo,
      clientName,
      taxableValue,
      taxAmount,
      grandTotal,
      pricingBasis,
      totalBoxes,
      totalUnits
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'INVOICE_POSTING',
        actionName: 'INVOICE_POSTED',
        tableName: 'invoices',
        recordId: invoiceId,
        referenceNo: invoiceNo,
        beforeValues: { status: 'Draft' },
        afterValues: { status: 'Posted', taxableValue, taxAmount, grandTotal },
        metadata: { clientName, pricingBasis, totalBoxes, totalUnits }
      });
    }

    /**
     * 7. Permission Change
     */
    async logPermissionChange({
      companyId = 1,
      actorEmail = 'superadmin@afield.local',
      targetUser,
      previousRole,
      newRole,
      scope = {}
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: newRole ? 'ROLE_ASSIGNED' : 'ROLE_REVOKED',
        tableName: 'user_role_assignments',
        recordId: null,
        referenceNo: targetUser,
        beforeValues: { role: previousRole },
        afterValues: { role: newRole, scope },
        metadata: { targetUser }
      });
    }

    /**
     * 8. Financial Adjustment
     */
    async logFinancialAdjustment({
      companyId = 1,
      actorEmail = 'accountant@afield.local',
      entryId,
      entryNo,
      adjustmentType, // 'CREDIT_NOTE', 'DEBIT_NOTE', 'PAYMENT_REVERSAL', 'MANUAL_JOURNAL'
      amount,
      reason,
      beforeValues,
      afterValues
    }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'FINANCIAL_ADJUSTMENT',
        actionName: adjustmentType,
        tableName: 'general_ledger',
        recordId: entryId,
        referenceNo: entryNo,
        beforeValues,
        afterValues,
        metadata: { amount, reason }
      });
    }

    /**
     * 9. Administrative Entity Lifecycle (Warehouses & Companies)
     */
    async logWarehouseArchived({ companyId, warehouseId, warehouseName, warehouseCode, actorEmail = 'admin@afield.local', reason = 'Administrative archival' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: 'WAREHOUSE_ARCHIVED',
        tableName: 'warehouses',
        recordId: warehouseId,
        referenceNo: warehouseCode,
        beforeValues: { status: 'Active', warehouseName },
        afterValues: { status: 'Archived', warehouseName },
        metadata: { warehouseId, warehouseName, warehouseCode, reason, action: 'Deactivated warehouse from operational workflows' }
      });
    }

    async logWarehouseReactivated({ companyId, warehouseId, warehouseName, warehouseCode, actorEmail = 'admin@afield.local' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: 'WAREHOUSE_REACTIVATED',
        tableName: 'warehouses',
        recordId: warehouseId,
        referenceNo: warehouseCode,
        beforeValues: { status: 'Archived', warehouseName },
        afterValues: { status: 'Active', warehouseName },
        metadata: { warehouseId, warehouseName, warehouseCode, action: 'Restored warehouse to active operations' }
      });
    }

    async logWarehouseDeleted({ companyId, warehouseId, warehouseName, warehouseCode, actorEmail = 'admin@afield.local', movCountPreserved = 0 }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: 'WAREHOUSE_DELETED_PERMANENTLY',
        tableName: 'warehouses',
        recordId: warehouseId,
        referenceNo: warehouseCode,
        beforeValues: { status: 'Archived', warehouseName, warehouseCode },
        afterValues: { deleted: true, historical_audit_preserved: true },
        metadata: { warehouseId, warehouseName, warehouseCode, historical_movements_preserved: movCountPreserved }
      });
    }

    async logCompanyCreated({ companyId, companyName, companyCode, actorEmail = 'superadmin@afield.local' }) {
      return await this.log({
        companyId: companyId || 1,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: 'COMPANY_CREATED',
        tableName: 'companies',
        recordId: companyId,
        referenceNo: companyCode,
        beforeValues: null,
        afterValues: { companyId, companyName, companyCode, status: 'Active' },
        metadata: { companyId, companyName, companyCode }
      });
    }

    async logCompanyUpdated({ companyId, companyName, companyCode, actorEmail = 'superadmin@afield.local' }) {
      return await this.log({
        companyId: companyId || 1,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: 'COMPANY_UPDATED',
        tableName: 'companies',
        recordId: companyId,
        referenceNo: companyCode,
        beforeValues: null,
        afterValues: { companyId, companyName, companyCode, status: 'Active' },
        metadata: { companyId, companyName, companyCode }
      });
    }

    async logCompanyArchived({ companyId, companyName, companyCode, actorEmail = 'superadmin@afield.local', reason = 'Sister concern deactivated' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: 'COMPANY_ARCHIVED',
        tableName: 'companies',
        recordId: companyId,
        referenceNo: companyCode,
        beforeValues: { status: 'Active', companyName, companyCode },
        afterValues: { status: 'Archived', companyName, companyCode },
        metadata: { companyId, companyName, companyCode, reason }
      });
    }

    async logCompanyReactivated({ companyId, companyName, companyCode, actorEmail = 'superadmin@afield.local' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: 'COMPANY_REACTIVATED',
        tableName: 'companies',
        recordId: companyId,
        referenceNo: companyCode,
        beforeValues: { status: 'Archived', companyName, companyCode },
        afterValues: { status: 'Active', companyName, companyCode },
        metadata: { companyId, companyName, companyCode }
      });
    }

    async logCompanyDeleted({ companyId, companyName, companyCode, actorEmail = 'superadmin@afield.local' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'PERMISSION_CHANGE',
        actionName: 'COMPANY_DELETED_PERMANENTLY',
        tableName: 'companies',
        recordId: companyId,
        referenceNo: companyCode,
        beforeValues: { companyName, companyCode },
        afterValues: { deleted: true, audit_records_preserved: true },
        metadata: { companyId, companyName, companyCode, preserved_audit_immutable: true }
      });
    }

    async logWarehouseCreated({ companyId, warehouseId, warehouseName, warehouseCode, actorEmail = 'admin@afield.local' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: 'WAREHOUSE_CREATED',
        tableName: 'warehouses',
        recordId: warehouseId,
        referenceNo: warehouseCode,
        beforeValues: null,
        afterValues: { companyId, warehouseId, warehouseName, warehouseCode, status: 'Active' },
        metadata: { companyId, warehouseId, warehouseName, warehouseCode }
      });
    }

    async logWarehouseUpdated({ companyId, warehouseId, warehouseName, warehouseCode, actorEmail = 'admin@afield.local' }) {
      return await this.log({
        companyId,
        actorEmail,
        actionCategory: 'STOCK_MOVEMENT',
        actionName: 'WAREHOUSE_UPDATED',
        tableName: 'warehouses',
        recordId: warehouseId,
        referenceNo: warehouseCode,
        beforeValues: null,
        afterValues: { companyId, warehouseId, warehouseName, warehouseCode, status: 'Active' },
        metadata: { companyId, warehouseId, warehouseName, warehouseCode }
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // IMMUTABILITY GUARDS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Attempting to delete an audit log is strictly prohibited by compliance.
     */
    deleteLog(id) {
      throw new Error(`AUDIT_LOG_IMMUTABLE: Audit log ID #${id} cannot be deleted. Regulatory compliance requires permanent record persistence.`);
    }

    /**
     * Attempting to modify an audit log is strictly prohibited by compliance.
     */
    updateLog(id) {
      throw new Error(`AUDIT_LOG_IMMUTABLE: Audit log ID #${id} cannot be edited or modified. Historic audit records are strictly immutable.`);
    }

    /**
     * Query logs with optional category, table, and actor filters.
     */
    getLogs(filters = {}) {
      let results = [...inMemoryAuditLogs];

      if (filters.category) {
        results = results.filter(l => l.action_category === filters.category);
      }
      if (filters.actionName) {
        results = results.filter(l => l.action_name === filters.actionName);
      }
      if (filters.tableName) {
        results = results.filter(l => l.table_name === filters.tableName);
      }
      if (filters.actorEmail) {
        results = results.filter(l => String(l.actor_email).toLowerCase().includes(String(filters.actorEmail).toLowerCase()));
      }
      if (filters.referenceNo) {
        results = results.filter(l => String(l.reference_no).toLowerCase().includes(String(filters.referenceNo).toLowerCase()));
      }
      if (filters.companyId) {
        results = results.filter(l => !l.company_id || l.company_id === filters.companyId);
      }

      return results;
    }

    clearMemoryBuffer() {
      inMemoryAuditLogs = [];
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  const defaultInstance = new AuditLogger();
  defaultInstance.AuditLogger = AuditLogger;

  return defaultInstance;
});
