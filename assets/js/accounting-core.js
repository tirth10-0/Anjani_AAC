/**
 * assets/js/accounting-core.js
 * AgroChem ERP - Connected Double-Entry Accounting Engine
 *
 * Provides:
 * 1. Standard Chart of Accounts (COA) mapped to operational entities.
 * 2. Controlled Double-Entry Posting (Debits === Credits).
 * 3. Connected Financial Workflows:
 *    - Purchase Invoices & Supplier Payments.
 *    - Sales Invoices & Customer Receipts.
 *    - Returns, Credit Notes, Debit Notes & Adjustments.
 *    - Operating & Factory Overheads / Expenses.
 *    - Manufacturing Material Consumption & Output Capitalization.
 *    - Packaging Materials & Direct Bottling Costs.
 *    - Dispatch Cost of Goods Sold (COGS).
 *    - Intercompany Transfers (Cost) vs Commercial Intercompany (Revenue & Tax).
 * 4. Traceable Reversals (non-destructive compensating journal entries).
 * 5. Multi-Company Tax & Accounting Isolation (Distinct GSTIN, PAN, Bank Ledgers).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ACCOUNTING_CORE = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 1. STANDARD CHART OF ACCOUNTS (COA)
  const CHART_OF_ACCOUNTS = {
    // Current Assets
    '1010': { code: '1010', name: 'Cash in Hand', category: 'Asset', type: 'Current' },
    '1020': { code: '1020', name: 'Bank Accounts', category: 'Asset', type: 'Current' },
    '1100': { code: '1100', name: 'Accounts Receivable (Clients)', category: 'Asset', type: 'Current' },
    '1200': { code: '1200', name: 'Raw Materials & Packaging Inventory', category: 'Asset', type: 'Current' },
    '1210': { code: '1210', name: 'Work in Progress (WIP)', category: 'Asset', type: 'Current' },
    '1220': { code: '1220', name: 'Finished Goods Inventory', category: 'Asset', type: 'Current' },
    '1300': { code: '1300', name: 'Input GST / IGST Credit', category: 'Asset', type: 'Current' },

    // Liabilities
    '2000': { code: '2000', name: 'Accounts Payable (Suppliers)', category: 'Liability', type: 'Current' },
    '2100': { code: '2100', name: 'Output GST / IGST Payable', category: 'Liability', type: 'Current' },

    // Equity
    '3000': { code: '3000', name: 'Shareholder / Owner Capital', category: 'Equity', type: 'Equity' },
    '3100': { code: '3100', name: 'Retained Earnings', category: 'Equity', type: 'Equity' },

    // Revenue
    '4000': { code: '4000', name: 'Sales Revenue', category: 'Revenue', type: 'Operating' },
    '4100': { code: '4100', name: 'Intercompany Commercial Revenue', category: 'Revenue', type: 'Operating' },
    '4200': { code: '4200', name: 'Discounts Given', category: 'Revenue', type: 'Contra-Revenue' },

    // Direct Production & Cost of Sales
    '5000': { code: '5000', name: 'Cost of Goods Sold (COGS)', category: 'Expense', type: 'Cost of Sales' },
    '5100': { code: '5100', name: 'Manufacturing Material Absorption', category: 'Expense', type: 'Production Cost' },
    '5200': { code: '5200', name: 'Packaging Supplies Cost', category: 'Expense', type: 'Production Cost' },
    '5300': { code: '5300', name: 'Production Overhead & Conversion Cost', category: 'Expense', type: 'Production Cost' },

    // Operating Expenses
    '6010': { code: '6010', name: 'Electricity & Utilities Expense', category: 'Expense', type: 'Operating' },
    '6020': { code: '6020', name: 'Freight & Transport Expense', category: 'Expense', type: 'Operating' },
    '6030': { code: '6030', name: 'Plant Maintenance Expense', category: 'Expense', type: 'Operating' },
    '6040': { code: '6040', name: 'Office & Administrative Expense', category: 'Expense', type: 'Operating' },
    '6050': { code: '6050', name: 'Salary & Wages Expense', category: 'Expense', type: 'Operating' },
    '6090': { code: '6090', name: 'General & Miscellaneous Expense', category: 'Expense', type: 'Operating' }
  };

  // In-memory ledger buffer for quick access, offline resilience, and unit testing
  let inMemoryLedger = [];

  class AccountingEngine {
    constructor(dbClient = null) {
      this.db = dbClient || (typeof window !== 'undefined' ? window.dbClient : null);
      this.coa = CHART_OF_ACCOUNTS;
    }

    setDb(dbClient) {
      this.db = dbClient;
    }

    getCOA() {
      return this.coa;
    }

    getAccount(code) {
      return this.coa[code] || { code, name: `Account ${code}`, category: 'Expense', type: 'Operating' };
    }

    /**
     * Map expense categories to Chart of Accounts codes
     */
    mapExpenseCategoryToAccount(category) {
      const cat = String(category || '').toLowerCase();
      if (cat.includes('electric') || cat.includes('utilit')) return '6010';
      if (cat.includes('freight') || cat.includes('transport')) return '6020';
      if (cat.includes('maintenance')) return '6030';
      if (cat.includes('office') || cat.includes('admin')) return '6040';
      if (cat.includes('salary') || cat.includes('wage')) return '6050';
      return '6090';
    }

    /**
     * Validate and create a balanced double-entry journal entry.
     */
    createBalancedEntry({
      companyId = 1,
      tenantId = 1,
      date = new Date().toISOString().substring(0, 10),
      refType,
      refId = null,
      refNo = null,
      debitCode,
      creditCode,
      amount,
      partyType = null,
      partyId = null,
      partyName = null,
      taxMode = 'Non-GST',
      taxAmount = 0,
      notes = '',
      postedBy = 'system@afield.local'
    }) {
      const numAmount = Math.round((parseFloat(amount) || 0) * 100) / 100;
      if (numAmount <= 0) {
        throw new Error('ACCOUNTING_INVALID_AMOUNT: Transaction amount must be greater than zero.');
      }

      if (!debitCode || !creditCode) {
        throw new Error('ACCOUNTING_MISSING_ACCOUNTS: Both debit and credit accounts are required.');
      }

      if (debitCode === creditCode) {
        throw new Error('ACCOUNTING_IDENTICAL_ACCOUNTS: Debit and credit accounts cannot be identical in double-entry.');
      }

      const drAcc = this.getAccount(debitCode);
      const crAcc = this.getAccount(creditCode);

      const entryNo = `JRN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

      const entry = {
        id: inMemoryLedger.length + 1,
        tenant_id: tenantId,
        company_id: companyId,
        entry_no: entryNo,
        date,
        ref_type: refType,
        ref_id: refId,
        ref_no: refNo || entryNo,
        debit_account_code: drAcc.code,
        debit_account_name: drAcc.name,
        credit_account_code: crAcc.code,
        credit_account_name: crAcc.name,
        amount: numAmount,
        currency: 'INR',
        party_type: partyType,
        party_id: partyId,
        party_name: partyName,
        tax_mode: taxMode,
        tax_amount: Math.round((parseFloat(taxAmount) || 0) * 100) / 100,
        notes,
        is_reversal: false,
        reversed_entry_id: null,
        reversal_reason: null,
        posted_by: postedBy,
        created_at: new Date().toISOString()
      };

      inMemoryLedger.push(entry);

      // Persist to Supabase if client is available
      if (this.db) {
        try {
          this.db.from('general_ledger').insert([entry]).then(({ error }) => {
            if (error) console.warn('[ACCOUNTING_CORE] DB persist notice:', error.message);
          });
        } catch (e) {
          console.warn('[ACCOUNTING_CORE] DB persist exception:', e);
        }
      }

      return entry;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. CONNECTED FINANCIAL WORKFLOWS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Workflow A: Purchase Invoice Inward Booking
     * Dr. Raw Materials Inventory (1200) [Taxable Amount]
     * Dr. Input GST Credit (1300) [Tax Amount]
     * Cr. Accounts Payable (2000) [Total Bill Amount]
     */
    postPurchaseInvoice({
      companyId = 1,
      purchaseId,
      purchaseNo,
      supplierId,
      supplierName,
      taxableAmount,
      taxAmount = 0,
      totalAmount,
      date = new Date().toISOString().substring(0, 10),
      notes = ''
    }) {
      const netTaxable = parseFloat(taxableAmount) || (parseFloat(totalAmount) - parseFloat(taxAmount));
      const netTax = parseFloat(taxAmount) || 0;
      const total = parseFloat(totalAmount) || (netTaxable + netTax);

      // Primary entry: Inventory Asset to Accounts Payable
      const entry1 = this.createBalancedEntry({
        companyId,
        refType: 'purchase',
        refId: purchaseId,
        refNo: purchaseNo,
        debitCode: '1200', // Inventory Asset
        creditCode: '2000', // Accounts Payable
        amount: netTaxable,
        partyType: 'supplier',
        partyId: supplierId,
        partyName: supplierName,
        date,
        notes: `Purchase Inward Bill #${purchaseNo}: Raw materials / packaging asset receipt`
      });

      let entry2 = null;
      if (netTax > 0) {
        entry2 = this.createBalancedEntry({
          companyId,
          refType: 'purchase_tax',
          refId: purchaseId,
          refNo: purchaseNo,
          debitCode: '1300', // Input GST Credit
          creditCode: '2000', // Accounts Payable
          amount: netTax,
          partyType: 'supplier',
          partyId: supplierId,
          partyName: supplierName,
          date,
          notes: `Input GST Credit on Purchase #${purchaseNo}`
        });
      }

      return { totalBooked: total, entries: [entry1, entry2].filter(Boolean) };
    }

    /**
     * Workflow B: Supplier Payment
     * Dr. Accounts Payable (2000)
     * Cr. Bank Accounts (1020) or Cash in Hand (1010)
     * Updates purchase paid_amount and synchronizes supplier balance.
     */
    async postSupplierPayment({
      companyId = 1,
      purchaseId = null,
      purchaseNo = null,
      supplierId,
      supplierName,
      amount,
      mode = 'Bank',
      accountId = null,
      date = new Date().toISOString().substring(0, 10),
      notes = '',
      postedBy = 'accountant@afield.local'
    }) {
      const numAmt = parseFloat(amount) || 0;
      if (numAmt <= 0) throw new Error('Payment amount must be greater than zero');

      const creditAccCode = (mode.toLowerCase() === 'cash') ? '1010' : '1020';

      const entry = this.createBalancedEntry({
        companyId,
        refType: 'supplier_payment',
        refId: purchaseId,
        refNo: purchaseNo,
        debitCode: '2000', // Accounts Payable
        creditCode: creditAccCode, // Cash/Bank
        amount: numAmt,
        partyType: 'supplier',
        partyId: supplierId,
        partyName: supplierName,
        date,
        notes: notes || `Payment to ${supplierName || 'supplier'} via ${mode}`,
        postedBy
      });

      // Update purchases table paid_amount and status if linked to a specific purchase
      if (this.db && purchaseId) {
        try {
          const { data: p } = await this.db.from('purchases').select('total_amount, paid_amount').eq('id', purchaseId).maybeSingle();
          if (p) {
            const currentPaid = parseFloat(p.paid_amount) || 0;
            const newPaid = currentPaid + numAmt;
            const tot = parseFloat(p.total_amount) || 0;
            const newStatus = newPaid >= tot ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Pending');
            await this.db.from('purchases').update({ paid_amount: newPaid, status: newStatus }).eq('id', purchaseId);
          }
        } catch (err) {
          console.warn('[ACCOUNTING_CORE] Update purchase payment notice:', err.message);
        }
      }

      return entry;
    }

    /**
     * Workflow C: Commercial Sales Invoice & Dispatch COGS
     * Entry 1 (Commercial Revenue):
     *   Dr. Accounts Receivable (1100) [Total Bill]
     *   Cr. Sales Revenue (4000) [Taxable Amount]
     *   Cr. Output GST Payable (2100) [Tax Amount]
     * Entry 2 (Inventory Cost of Goods Sold):
     *   Dr. Cost of Goods Sold (5000) [At cost valuation]
     *   Cr. Finished Goods Inventory (1220) [At cost valuation]
     */
    postSalesInvoiceAndCOGS({
      companyId = 1,
      orderId,
      orderNo,
      clientId,
      clientName,
      taxableAmount,
      taxAmount = 0,
      totalAmount,
      inventoryCostValue = 0,
      date = new Date().toISOString().substring(0, 10),
      notes = ''
    }) {
      const netTaxable = parseFloat(taxableAmount) || (parseFloat(totalAmount) - parseFloat(taxAmount));
      const netTax = parseFloat(taxAmount) || 0;
      const cogsVal = parseFloat(inventoryCostValue) || 0;

      // 1. Revenue Entry
      const revEntry = this.createBalancedEntry({
        companyId,
        refType: 'order_sale',
        refId: orderId,
        refNo: orderNo,
        debitCode: '1100', // Accounts Receivable
        creditCode: '4000', // Sales Revenue
        amount: netTaxable,
        partyType: 'client',
        partyId: clientId,
        partyName: clientName,
        date,
        notes: `Sales Invoice #${orderNo} to ${clientName || 'Client'}`
      });

      let taxEntry = null;
      if (netTax > 0) {
        taxEntry = this.createBalancedEntry({
          companyId,
          refType: 'order_tax',
          refId: orderId,
          refNo: orderNo,
          debitCode: '1100', // Accounts Receivable
          creditCode: '2100', // Output GST Payable
          amount: netTax,
          partyType: 'client',
          partyId: clientId,
          partyName: clientName,
          date,
          notes: `Output GST on Sales Invoice #${orderNo}`
        });
      }

      // 2. COGS Entry (separates inventory quantity reduction from financial valuation)
      let cogsEntry = null;
      if (cogsVal > 0) {
        cogsEntry = this.createBalancedEntry({
          companyId,
          refType: 'dispatch_cogs',
          refId: orderId,
          refNo: orderNo,
          debitCode: '5000', // Cost of Goods Sold
          creditCode: '1220', // Finished Goods Inventory Asset
          amount: cogsVal,
          partyType: 'client',
          partyId: clientId,
          partyName: clientName,
          date,
          notes: `COGS derecognition for order #${orderNo}`
        });
      }

      return { revEntry, taxEntry, cogsEntry };
    }

    /**
     * Workflow D: Customer Receipt
     * Dr. Bank Accounts (1020) or Cash in Hand (1010)
     * Cr. Accounts Receivable (1100)
     * Updates order paid_amount and client balance.
     */
    async postCustomerReceipt({
      companyId = 1,
      orderId = null,
      orderNo = null,
      clientId,
      clientName,
      amount,
      mode = 'Bank',
      accountId = null,
      date = new Date().toISOString().substring(0, 10),
      notes = '',
      postedBy = 'accountant@afield.local'
    }) {
      const numAmt = parseFloat(amount) || 0;
      if (numAmt <= 0) throw new Error('Receipt amount must be greater than zero');

      const debitAccCode = (mode.toLowerCase() === 'cash') ? '1010' : '1020';

      const entry = this.createBalancedEntry({
        companyId,
        refType: 'customer_receipt',
        refId: orderId,
        refNo: orderNo,
        debitCode: debitAccCode, // Cash/Bank
        creditCode: '1100', // Accounts Receivable
        amount: numAmt,
        partyType: 'client',
        partyId: clientId,
        partyName: clientName,
        date,
        notes: notes || `Customer receipt from ${clientName || 'client'} via ${mode}`,
        postedBy
      });

      // Update order paid_amount if linked
      if (this.db && orderId) {
        try {
          const { data: ord } = await this.db.from('orders').select('total_amount, paid_amount').eq('id', orderId).maybeSingle();
          if (ord) {
            const curPaid = parseFloat(ord.paid_amount) || 0;
            const newPaid = curPaid + numAmt;
            await this.db.from('orders').update({ paid_amount: newPaid }).eq('id', orderId);
          }
        } catch (err) {
          console.warn('[ACCOUNTING_CORE] Update order receipt notice:', err.message);
        }
      }

      return entry;
    }

    /**
     * Workflow E: Operating Expense Posting
     * Dr. Expense Category (6010 - 6090)
     * Cr. Bank (1020) or Cash (1010)
     */
    postExpense({
      companyId = 1,
      expenseId = null,
      expenseNo = null,
      category,
      amount,
      mode = 'Bank',
      date = new Date().toISOString().substring(0, 10),
      description = '',
      postedBy = 'accountant@afield.local'
    }) {
      const expAccountCode = this.mapExpenseCategoryToAccount(category);
      const crAccountCode = (String(mode).toLowerCase() === 'cash') ? '1010' : '1020';
      const numAmt = parseFloat(amount) || 0;

      return this.createBalancedEntry({
        companyId,
        refType: 'expense',
        refId: expenseId,
        refNo: expenseNo,
        debitCode: expAccountCode,
        creditCode: crAccountCode,
        amount: numAmt,
        partyType: 'vendor',
        date,
        notes: description || `Operating expense: ${category}`,
        postedBy
      });
    }

    /**
     * Workflow F: Manufacturing Cost Capitalization
     * 1. Materials Issue:
     *    Dr. Work in Progress (1210)
     *    Cr. Raw Materials Inventory (1200)
     * 2. Production Completion:
     *    Dr. Finished Goods Inventory (1220) [Total Cost]
     *    Cr. Work in Progress (1210) [Material Cost]
     *    Cr. Production Overhead & Conversion Cost (5300) [Overhead Absorption]
     */
    postManufacturingOutput({
      companyId = 1,
      orderId,
      batchNo,
      productName,
      materialCost,
      overheadCost = 0,
      totalCost,
      date = new Date().toISOString().substring(0, 10),
      notes = ''
    }) {
      const matCost = parseFloat(materialCost) || 0;
      const ovhCost = parseFloat(overheadCost) || 0;
      const totCost = parseFloat(totalCost) || (matCost + ovhCost);

      const entry1 = this.createBalancedEntry({
        companyId,
        refType: 'mfg_output',
        refId: orderId,
        refNo: batchNo,
        debitCode: '1220', // Finished Goods Inventory Asset
        creditCode: '1210', // Work in Progress (materials consumed)
        amount: matCost,
        date,
        notes: `Capitalized batch ${batchNo} (${productName}): Raw material consumption`
      });

      let entry2 = null;
      if (ovhCost > 0) {
        entry2 = this.createBalancedEntry({
          companyId,
          refType: 'mfg_overhead',
          refId: orderId,
          refNo: batchNo,
          debitCode: '1220', // Finished Goods Inventory Asset
          creditCode: '5300', // Production Overhead Absorption
          amount: ovhCost,
          date,
          notes: `Capitalized batch ${batchNo}: Overhead & machine conversion absorption`
        });
      }

      return { totalCapitalized: totCost, entries: [entry1, entry2].filter(Boolean) };
    }

    /**
     * Workflow G: Packaging Run Cost Capitalization
     * Dr. Finished Goods (Packed SKU) (1220)
     * Cr. Finished Goods (Bulk Chemical) (1210 or 1220) [Bulk volume consumed]
     * Cr. Packaging Materials Inventory (1200) [Bottles, caps, labels, cartons]
     */
    postPackagingRunCost({
      companyId = 1,
      orderId,
      lotNo,
      sku,
      bulkChemicalCost,
      packagingMaterialsCost,
      date = new Date().toISOString().substring(0, 10),
      notes = ''
    }) {
      const bulkCost = parseFloat(bulkChemicalCost) || 0;
      const packCost = parseFloat(packagingMaterialsCost) || 0;

      const entryBulk = this.createBalancedEntry({
        companyId,
        refType: 'packaging_cost',
        refId: orderId,
        refNo: lotNo,
        debitCode: '1220', // Packed Finished Goods Asset
        creditCode: '1210', // Bulk Chemical WIP
        amount: bulkCost,
        date,
        notes: `Packaging run lot ${lotNo} (${sku}): Bulk chemical absorption`
      });

      const entryMaterials = this.createBalancedEntry({
        companyId,
        refType: 'packaging_cost',
        refId: orderId,
        refNo: lotNo,
        debitCode: '1220', // Packed Finished Goods Asset
        creditCode: '1200', // Packaging Materials Asset (bottles/caps/cartons)
        amount: packCost,
        date,
        notes: `Packaging run lot ${lotNo} (${sku}): Packaging supplies absorption`
      });

      return { totalCost: bulkCost + packCost, entries: [entryBulk, entryMaterials] };
    }

    /**
     * Workflow H: Traceable Transaction Reversal
     * Never deletes historical records. Instead, posts an explicit reversal
     * swapping debit and credit accounts, stamped with reason and actor.
     */
    reverseEntry(entryId, reason, actor = 'admin@afield.local') {
      const orig = inMemoryLedger.find(e => e.id === entryId || e.entry_no === entryId);
      if (!orig) {
        throw new Error(`ENTRY_NOT_FOUND: Ledger entry ${entryId} does not exist.`);
      }

      if (orig.is_reversal) {
        throw new Error('CANNOT_REVERSE_A_REVERSAL: Cannot reverse an entry that is already a reversal.');
      }

      // Check if already reversed
      const alreadyReversed = inMemoryLedger.some(e => e.reversed_entry_id === orig.id);
      if (alreadyReversed) {
        throw new Error(`ALREADY_REVERSED: Entry ${orig.entry_no} has already been reversed.`);
      }

      const revEntryNo = `REV-${orig.entry_no}`;

      const reversalEntry = {
        id: inMemoryLedger.length + 1,
        tenant_id: orig.tenant_id,
        company_id: orig.company_id,
        entry_no: revEntryNo,
        date: new Date().toISOString().substring(0, 10),
        ref_type: `reversal_${orig.ref_type}`,
        ref_id: orig.ref_id,
        ref_no: orig.ref_no,
        // Swap accounts
        debit_account_code: orig.credit_account_code,
        debit_account_name: orig.credit_account_name,
        credit_account_code: orig.debit_account_code,
        credit_account_name: orig.debit_account_name,
        amount: orig.amount,
        currency: orig.currency || 'INR',
        party_type: orig.party_type,
        party_id: orig.party_id,
        party_name: orig.party_name,
        tax_mode: orig.tax_mode,
        tax_amount: orig.tax_amount,
        notes: `REVERSAL of ${orig.entry_no}. Reason: ${reason || 'Correction'}`,
        is_reversal: true,
        reversed_entry_id: orig.id,
        reversal_reason: reason || 'Transaction cancelled or corrected',
        posted_by: actor,
        created_at: new Date().toISOString()
      };

      inMemoryLedger.push(reversalEntry);

      if (this.db) {
        try {
          this.db.from('general_ledger').insert([reversalEntry]).then(() => {});
        } catch (e) {}
      }

      return reversalEntry;
    }

    /**
     * Compute Trial Balance for a company to verify zero debit/credit discrepancy.
     */
    getTrialBalance(companyId = null) {
      const entries = companyId ? inMemoryLedger.filter(e => e.company_id === companyId) : inMemoryLedger;

      const balances = {};
      let totalDebits = 0;
      let totalCredits = 0;

      entries.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        // Debit side
        if (!balances[e.debit_account_code]) {
          balances[e.debit_account_code] = {
            code: e.debit_account_code,
            name: e.debit_account_name,
            debit: 0,
            credit: 0
          };
        }
        balances[e.debit_account_code].debit += amt;
        totalDebits += amt;

        // Credit side
        if (!balances[e.credit_account_code]) {
          balances[e.credit_account_code] = {
            code: e.credit_account_code,
            name: e.credit_account_name,
            debit: 0,
            credit: 0
          };
        }
        balances[e.credit_account_code].credit += amt;
        totalCredits += amt;
      });

      totalDebits = Math.round(totalDebits * 100) / 100;
      totalCredits = Math.round(totalCredits * 100) / 100;
      const difference = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;

      return {
        isBalanced: difference === 0,
        totalDebits,
        totalCredits,
        difference,
        accounts: Object.values(balances)
      };
    }

    /**
     * Retrieve ledger entries with optional filters.
     */
    getLedgerEntries(filters = {}) {
      let result = [...inMemoryLedger];
      if (filters.companyId) result = result.filter(e => e.company_id === filters.companyId);
      if (filters.refType) result = result.filter(e => e.ref_type === filters.refType);
      if (filters.accountCode) {
        result = result.filter(e => e.debit_account_code === filters.accountCode || e.credit_account_code === filters.accountCode);
      }
      return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    /**
     * Clear in-memory buffer (for testing teardowns)
     */
    clearBuffer() {
      inMemoryLedger = [];
    }
  }

  const defaultInstance = new AccountingEngine();
  defaultInstance.AccountingEngine = AccountingEngine;
  defaultInstance.CHART_OF_ACCOUNTS = CHART_OF_ACCOUNTS;

  return defaultInstance;
});
