/**
 * assets/js/tenant-context.js
 * Authoritative Multi-Company & Tenant Context Manager
 * 
 * Provides secure, server-validated tenant, legal entity (company), branch,
 * and warehouse context across the entire ERP.
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_COMPANY = 'erp_active_company_id';
  const STORAGE_KEY_BRANCH = 'erp_active_branch_id';
  const STORAGE_KEY_WAREHOUSE = 'erp_active_warehouse_id';

  const TenantContext = {
    _tenant: null,
    _activeCompany: null,
    _authorizedCompanies: [],
    _branches: [],
    _warehouses: [],
    _subscribers: [],
    _initialized: false,

    /**
     * Initializes the tenant context from the backend database.
     * Ensures company selection is strictly validated against server authorization.
     */
    async init(force = false) {
      if (!force && this._initialized && this._activeCompany) {
        return this._activeCompany;
      }

      try {
        if (!window.dbClient) {
          console.warn('[TenantContext] dbClient not yet available, using fallback active company.');
          this._fallbackInit();
          // Poll briefly for dbClient if it is currently loading
          if (!this._dbClientPoll) {
            this._dbClientPoll = setInterval(() => {
              if (window.dbClient) {
                clearInterval(this._dbClientPoll);
                this._dbClientPoll = null;
                this.init(true).catch(() => {});
              }
            }, 100);
            setTimeout(() => {
              if (this._dbClientPoll) {
                clearInterval(this._dbClientPoll);
                this._dbClientPoll = null;
              }
            }, 4000);
          }
          return this._activeCompany;
        }

        // 1. Fetch all companies for the tenant
        const { data: companies, error: compErr } = await window.dbClient
          .from('companies')
          .select('*')
          .eq('status', 'Active')
          .order('id', { ascending: true });

        if (compErr) {
          // If table not yet migrated, fall back gracefully to default company
          console.warn('[TenantContext] Companies query warning (migration pending):', compErr.message);
          this._hasMultiCompanySchema = false;
          this._fallbackInit();
          return this._activeCompany;
        }

        this._hasMultiCompanySchema = true;
        this._authorizedCompanies = (companies && companies.length > 0) ? companies.map(c => ({
          ...c,
          name: (c.name === 'Estimate' || c.name === 'Afield Crop Care') ? 'Anjani Agri Care' : c.name,
          code: (c.code === 'E' || c.code === 'ACC') ? 'AAC' : c.code
        })) : [];

        // 2. Determine active company from localStorage, validated against authorized list
        const storedCompanyId = parseInt(localStorage.getItem(STORAGE_KEY_COMPANY), 10);
        let matched = this._authorizedCompanies.find(c => c.id === storedCompanyId);

        if (!matched && this._authorizedCompanies.length > 0) {
          // Default to the first authorized company (Anjani Agri Care is ID 623 / 1)
          matched = this._authorizedCompanies.find(c => c.id === 623 || c.id === 1) || this._authorizedCompanies[0];
          localStorage.setItem(STORAGE_KEY_COMPANY, matched.id);
        }

        if (matched && (matched.name === 'Estimate' || matched.name === 'Afield Crop Care')) {
          matched.name = 'Anjani Agri Care';
        }
        this._activeCompany = matched || {
          id: 1,
          name: (typeof localStorage !== 'undefined' && localStorage.getItem('erp_active_company_name')) || 'Anjani Agri Care',
          code: (typeof localStorage !== 'undefined' && localStorage.getItem('erp_active_company_code')) || 'AAC',
          is_manufacturing: true,
          currency: 'INR'
        };

        // Guarantee that _authorizedCompanies contains at least the active company
        if (!this._authorizedCompanies || this._authorizedCompanies.length === 0) {
          this._authorizedCompanies = [this._activeCompany];
        }

        // 3. Fetch branches and warehouses for the active company
        await this._loadLocations(this._activeCompany.id);

        this._initialized = true;
        this._notifyChange();
        return this._activeCompany;
      } catch (err) {
        console.error('[TenantContext] Initialization failed:', err);
        this._fallbackInit();
        return this._activeCompany;
      }
    },

    _fallbackInit() {
      const defaultCompany = {
        id: 1,
        name: (typeof localStorage !== 'undefined' && localStorage.getItem('erp_active_company_name')) || 'Anjani Agri Care',
        code: (typeof localStorage !== 'undefined' && localStorage.getItem('erp_active_company_code')) || 'AAC',
        is_manufacturing: true,
        currency: 'INR'
      };
      this._authorizedCompanies = [defaultCompany];
      this._activeCompany = defaultCompany;
      this._initialized = true;
      this._notifyChange();
    },

    async _loadLocations(companyId) {
      try {
        const [branchRes, whRes] = await Promise.all([
          window.dbClient.from('branches').select('*').eq('company_id', companyId).eq('status', 'Active'),
          window.dbClient.from('warehouses').select('*').eq('company_id', companyId).eq('status', 'Active')
        ]);

        this._branches = branchRes.data || [];
        this._warehouses = whRes.data || [];
      } catch (e) {
        console.warn('[TenantContext] Could not load locations:', e);
      }
    },

    /**
     * Get the active company ID (Safe integer).
     */
    getCompanyId() {
      return this._activeCompany ? this._activeCompany.id : 1;
    },

    /**
     * Alias for getCompanyId() to support callers expecting getActiveCompanyId()
     */
    getActiveCompanyId() {
      return this.getCompanyId();
    },

    /**
     * Get the active company object.
     */
    getActiveCompany() {
      return this._activeCompany || { id: 623, name: 'Anjani Agri Care', code: 'AAC' };
    },

    /**
     * Get list of authorized companies for current user.
     */
    getAuthorizedCompanies() {
      return this._authorizedCompanies || [];
    },

    /**
     * Get branches belonging to the active company.
     */
    getBranches() {
      return this._branches || [];
    },

    /**
     * Get warehouses belonging to the active company.
     */
    getWarehouses() {
      return this._warehouses || [];
    },

    /**
     * Whether the active company is a manufacturing plant.
     */
    isManufacturing() {
      return !!(this._activeCompany && this._activeCompany.is_manufacturing);
    },

    /**
     * Filter a query by active company.
     * Safely applies company_id filter if multi-company schema is active.
     */
    filter(query, companyId = null) {
      const cId = companyId || this.getCompanyId();
      if (this._hasMultiCompanySchema) {
        // For the primary manufacturing parent entity (E), support active ID (623), legacy ID (1), and null
        const activeComp = this.getActiveCompany();
        const isPrimaryComp = (activeComp && (activeComp.code === 'AAC' || activeComp.code === 'E' || activeComp.code === 'ACC' || activeComp.id === 623 || activeComp.id === 1 || activeComp.is_manufacturing));
        if (isPrimaryComp && (cId === 623 || cId === 1)) {
          return query.or(`company_id.eq.${cId},company_id.eq.1,company_id.is.null`);
        }
        return query.eq('company_id', cId);
      }
      return query;
    },

    /**
     * Attach company_id and optional warehouse_id / branch_id to a record payload or array of payloads.
     * Safely prevents injecting non-existent location columns into master tables like products, clients, etc.
     */
    stamp(payload, targetOrCompanyId = null, options = {}) {
      if (!this._hasMultiCompanySchema) {
        return Array.isArray(payload) ? payload.map(p => ({ ...p })) : { ...payload };
      }

      const TABLE_LOCATION_COLS = {
        // Both branch and warehouse
        stock_batches: { branch: true, warehouse: true },
        production_batches: { branch: true, warehouse: true },
        packaging_orders: { branch: true, warehouse: true },
        order_dispatches: { branch: true, warehouse: true },
        invoices: { branch: true, warehouse: true },
        intercompany_transfers: { branch: true, warehouse: true },
        general_ledger: { branch: true, warehouse: true },
        audit_logs: { branch: true, warehouse: true },
        system_notifications: { branch: true, warehouse: true },
        user_role_assignments: { branch: true, warehouse: true },
        warehouses: { branch: true, warehouse: false },

        // Branch only
        orders: { branch: true, warehouse: false },
        purchases: { branch: true, warehouse: false },
        expenses: { branch: true, warehouse: false },

        // Warehouse only
        daily_transactions: { branch: false, warehouse: true },
        stock_movements: { branch: false, warehouse: true },

        // Master / entity tables without physical branch or warehouse columns
        products: { branch: false, warehouse: false },
        product_packaging: { branch: false, warehouse: false },
        clients: { branch: false, warehouse: false },
        suppliers: { branch: false, warehouse: false },
        inventory_items: { branch: false, warehouse: false },
        order_items: { branch: false, warehouse: false },
        purchase_items: { branch: false, warehouse: false },
        formulations: { branch: false, warehouse: false },
        formulation_ingredients: { branch: false, warehouse: false },
        transactions: { branch: false, warehouse: false },
        accounts: { branch: false, warehouse: false },
        daily_transaction_materials: { branch: false, warehouse: false }
      };

      let cId = this.getCompanyId();
      let targetTable = null;
      let opts = { ...options };

      if (typeof targetOrCompanyId === 'number') {
        cId = targetOrCompanyId;
      } else if (typeof targetOrCompanyId === 'string') {
        targetTable = targetOrCompanyId.toLowerCase();
      } else if (typeof targetOrCompanyId === 'object' && targetOrCompanyId !== null) {
        opts = { ...targetOrCompanyId, ...options };
        if (opts.companyId) cId = opts.companyId;
        if (opts.table) targetTable = opts.table.toLowerCase();
      }

      const defaultWh = this._warehouses.find(w => w.is_default) || this._warehouses[0];
      const defaultBr = this._branches.find(b => b.is_head_office) || this._branches[0];

      let allowBranch = false;
      let allowWarehouse = false;

      if (targetTable && TABLE_LOCATION_COLS[targetTable]) {
        allowBranch = !!TABLE_LOCATION_COLS[targetTable].branch;
        allowWarehouse = !!TABLE_LOCATION_COLS[targetTable].warehouse;
      } else if (opts.withLocation || opts.withBranch || opts.withWarehouse) {
        allowBranch = !!(opts.withLocation || opts.withBranch);
        allowWarehouse = !!(opts.withLocation || opts.withWarehouse);
      }

      const stampSingle = (p) => {
        const stamped = { ...p, company_id: cId };

        if (allowWarehouse && defaultWh && !stamped.warehouse_id) {
          stamped.warehouse_id = defaultWh.id;
        } else if (!allowWarehouse && !('warehouse_id' in p)) {
          delete stamped.warehouse_id;
        }

        if (allowBranch && defaultBr && !stamped.branch_id) {
          stamped.branch_id = defaultBr.id;
        } else if (!allowBranch && !('branch_id' in p)) {
          delete stamped.branch_id;
        }

        return stamped;
      };

      return Array.isArray(payload) ? payload.map(stampSingle) : stampSingle(payload);
    },

    /**
     * Securely switch the active company.
     * Prevents switching to company IDs not in the authorized list.
     */
    async switchCompany(newCompanyId) {
      const targetId = parseInt(newCompanyId, 10);
      const target = this._authorizedCompanies.find(c => c.id === targetId);

      if (!target) {
        console.error(`[TenantContext] Security Error: Unauthorized company switch attempt to ID ${newCompanyId}`);
        if (window.APP && window.APP.showToast) {
          window.APP.showToast('Unauthorized company switch request.', 'error');
        }
        return false;
      }

      this._activeCompany = target;
      localStorage.setItem(STORAGE_KEY_COMPANY, target.id);

      // Reload locations for newly selected company
      await this._loadLocations(target.id);

      this._notifyChange();

      // Trigger automatic reload of current page to refresh all data tables
      window.location.reload();
      return true;
    },

    /**
     * Force reloads the tenant context from the backend database.
     */
    async reload() {
      this._initialized = false;
      return await this.init(true);
    },

    subscribe(callback) {
      if (typeof callback === 'function') {
        this._subscribers.push(callback);
      }
    },

    _notifyChange() {
      // Dispatch browser custom event
      window.dispatchEvent(new CustomEvent('companyChanged', {
        detail: {
          company: this._activeCompany,
          companyId: this._activeCompany.id
        }
      }));

      // Call subscribers
      this._subscribers.forEach(cb => {
        try { cb(this._activeCompany); } catch (e) { console.error(e); }
      });
    }
  };

  window.TENANT_CONTEXT = TenantContext;

  // Auto initialize when database bridge is ready
  document.addEventListener('DOMContentLoaded', () => {
    TenantContext.init().catch(err => console.warn('[TenantContext] Auto-init:', err));
  });

})(window);
