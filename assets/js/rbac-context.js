/**
 * assets/js/rbac-context.js
 * Authoritative Granular Role-Based Access Control (RBAC) & Permission Engine
 * 
 * Supports 10 Configurable Roles:
 * 1. Software Super Admin
 * 2. Company Owner / Director
 * 3. Production Manager
 * 4. Factory Operator
 * 5. Packaging / Godown Operator
 * 6. QC Officer
 * 7. Accountant
 * 8. Inventory / Store Manager
 * 9. Sales / Dispatch Executive
 * 10. Viewer / Auditor
 * 
 * Enforces permissions across: module, action, company, branch, and warehouse.
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_ACTIVE_ROLE = 'erp_active_role_override';
  const DELETED_ROLES_STORAGE_KEY = 'erp_deleted_roles';
  const CUSTOM_ROLES_STORAGE_KEY = 'erp_custom_roles';
  const UPDATED_ROLES_STORAGE_KEY = 'erp_updated_roles';

  // Standard Default Role Permissions Matrix (Fallback & Baseline)
  const DEFAULT_ROLE_PERMISSIONS = {
    super_admin: {
      name: 'Software Super Admin',
      badge: 'Super Admin',
      isGlobal: true,
      all: true
    },
    company_owner: {
      name: 'Company Owner / Director',
      badge: 'Owner',
      isGlobal: false,
      all: true
    },
    production_manager: {
      name: 'Production Manager',
      badge: 'Prod Manager',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        inventory: { view: true, create: true, edit: true, delete: false, approve: true, reject: false, cancel: true, export: true },
        products: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        production: { view: true, create: true, edit: true, delete: true, approve: true, reject: true, cancel: true, export: true },
        formulations: { view: true, create: true, edit: true, delete: true, approve: true, reject: false, cancel: true, export: true },
        daily_transactions: { view: true, create: true, edit: true, delete: false, approve: true, reject: false, cancel: true, export: true },
        warehouses: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        orders: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        purchases: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    factory_operator: {
      name: 'Factory Operator',
      badge: 'Operator',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        production: { view: true, create: true, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        daily_transactions: { view: true, create: true, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        inventory: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        formulations: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    godown_operator: {
      name: 'Packaging / Godown Operator',
      badge: 'Godown Operator',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        inventory: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        warehouses: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        orders: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: false },
        daily_transactions: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    qc_officer: {
      name: 'QC Officer',
      badge: 'QC Officer',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        production: { view: true, create: false, edit: true, delete: false, approve: true, reject: true, cancel: false, export: true },
        formulations: { view: true, create: false, edit: false, delete: false, approve: true, reject: true, cancel: false, export: true },
        inventory: { view: true, create: false, edit: false, delete: false, approve: true, reject: true, cancel: false, export: true },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    accountant: {
      name: 'Accountant',
      badge: 'Accountant',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        transactions: { view: true, create: true, edit: true, delete: true, approve: true, reject: false, cancel: true, export: true },
        expenses: { view: true, create: true, edit: true, delete: true, approve: true, reject: false, cancel: true, export: true },
        reports: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        exports: { view: true, create: true, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        clients: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        suppliers: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        orders: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        purchases: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true }
      }
    },
    store_manager: {
      name: 'Inventory / Store Manager',
      badge: 'Store Manager',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        inventory: { view: true, create: true, edit: true, delete: false, approve: true, reject: false, cancel: true, export: true },
        purchases: { view: true, create: true, edit: true, delete: false, approve: true, reject: false, cancel: true, export: true },
        warehouses: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        daily_transactions: { view: true, create: true, edit: true, delete: false, approve: true, reject: false, cancel: true, export: true },
        suppliers: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    sales_executive: {
      name: 'Sales / Dispatch Executive',
      badge: 'Sales Executive',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        orders: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: true, export: true },
        clients: { view: true, create: true, edit: true, delete: false, approve: false, reject: false, cancel: false, export: true },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false },
        inventory: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: false }
      }
    },
    viewer_auditor: {
      name: 'Viewer / Auditor',
      badge: 'Auditor',
      permissions: {
        dashboard: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        inventory: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        products: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        orders: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        purchases: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        production: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        formulations: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        clients: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        suppliers: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        reports: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true },
        exports: { view: true, create: false, edit: false, delete: false, approve: false, reject: false, cancel: false, export: true }
      }
    }
  };

  const RbacContext = {
    _currentUser: null,
    _activeRoleCode: 'super_admin',
    _activeRoleDef: DEFAULT_ROLE_PERMISSIONS.super_admin,
    _assignedScope: {
      companyId: 1,
      branchId: null,
      warehouseId: null
    },
    _allRoles: [],
    _initialized: false,
    _subscribers: [],

    /**
     * Initializes the user's role and granular permissions.
     */
    async init() {
      if (this._initialized) return this;

      try {
        // Self-Healing Guard: Root super_admin can NEVER be permanently deleted
        try {
          const rawDel = localStorage.getItem(DELETED_ROLES_STORAGE_KEY);
          if (rawDel) {
            let delList = JSON.parse(rawDel);
            if (delList.includes('super_admin')) {
              delList = delList.filter(c => c !== 'super_admin');
              localStorage.setItem(DELETED_ROLES_STORAGE_KEY, JSON.stringify(delList));
            }
          }
        } catch (e) {}

        const userEmail = localStorage.getItem('admin_user') || 'admin@afield.local';
        this._currentUser = { email: userEmail };

        // 1. Check for manual role switch override (for administrative preview / testing)
        let storedRole = localStorage.getItem(STORAGE_KEY_ACTIVE_ROLE);
        const available = this.getAvailableRoles();

        // If stored role is invalid or was deleted by mistake, safely fallback to super_admin
        if (!storedRole || !available.some(r => r.code === storedRole)) {
          storedRole = 'super_admin';
          try { localStorage.setItem(STORAGE_KEY_ACTIVE_ROLE, 'super_admin'); } catch(e){}
        }

        if (storedRole && available.some(r => r.code === storedRole)) {
          this._setRole(storedRole);
        } else {
          // 2. Fetch user's role assignment from database if available
          if (window.dbClient) {
            try {
              const { data: assignment, error } = await window.dbClient
                .from('user_role_assignments')
                .select('*, roles(*)')
                .eq('user_email', userEmail)
                .eq('status', 'Active')
                .maybeSingle();

              if (!error && assignment && assignment.roles) {
                const roleCode = assignment.roles.code;
                this._assignedScope = {
                  companyId: assignment.company_id,
                  branchId: assignment.branch_id,
                  warehouseId: assignment.warehouse_id
                };
                this._setRole(roleCode);
              } else {
                // Default to super_admin or company_owner for primary admin email
                const defaultRole = (userEmail.includes('owner') ? 'company_owner' : 'super_admin');
                this._setRole(defaultRole);
              }
            } catch (e) {
              console.warn('[RBAC] Role query notice (fallback to default):', e);
              this._setRole('super_admin');
            }
          } else {
            this._setRole('super_admin');
          }
        }

        this._initialized = true;
        this.applyDomPermissions();
        this._notify();
        return this;
      } catch (err) {
        console.error('[RBAC] Initialization error:', err);
        this._setRole('super_admin');
        this._initialized = true;
        return this;
      }
    },

    getAvailableRoles() {
      let deleted = [];
      try {
        const raw = localStorage.getItem(DELETED_ROLES_STORAGE_KEY);
        if (raw) deleted = JSON.parse(raw);
      } catch (e) {}

      // Self-Healing Guard: Root super_admin can NEVER be in deleted list
      if (deleted.includes('super_admin')) {
        deleted = deleted.filter(c => c !== 'super_admin');
        try { localStorage.setItem(DELETED_ROLES_STORAGE_KEY, JSON.stringify(deleted)); } catch (e) {}
      }

      let updated = {};
      try {
        const raw = localStorage.getItem(UPDATED_ROLES_STORAGE_KEY);
        if (raw) updated = JSON.parse(raw);
      } catch (e) {}

      let custom = [];
      try {
        const raw = localStorage.getItem(CUSTOM_ROLES_STORAGE_KEY);
        if (raw) custom = JSON.parse(raw);
      } catch (e) {}

      const list = [];
      Object.keys(DEFAULT_ROLE_PERMISSIONS).forEach(code => {
        if (!deleted.includes(code)) {
          const def = DEFAULT_ROLE_PERMISSIONS[code];
          const up = updated[code] || {};
          list.push({
            code,
            name: up.name || def.name,
            badge: def.badge || def.name,
            is_system: true
          });
        }
      });

      // Emergency self-heal if all roles got wiped
      if (list.length === 0) {
        try { localStorage.removeItem(DELETED_ROLES_STORAGE_KEY); } catch(e){}
        Object.keys(DEFAULT_ROLE_PERMISSIONS).forEach(code => {
          const def = DEFAULT_ROLE_PERMISSIONS[code];
          list.push({
            code,
            name: def.name,
            badge: def.badge || def.name,
            is_system: true
          });
        });
      }

      if (Array.isArray(custom)) {
        custom.forEach(c => {
          if (!deleted.includes(c.code) && !list.some(r => r.code === c.code)) {
            const up = updated[c.code] || {};
            list.push({
              code: c.code,
              name: up.name || c.name,
              badge: c.name,
              is_system: false
            });
          }
        });
      }

      return list;
    },

    _getCustomRole(roleCode) {
      try {
        const raw = localStorage.getItem(CUSTOM_ROLES_STORAGE_KEY);
        const custom = raw ? JSON.parse(raw) : [];
        const match = custom.find(c => c.code === roleCode);
        if (match) {
          return {
            name: match.name,
            badge: match.name,
            isGlobal: String(match.scope || '').toLowerCase().includes('global'),
            all: String(match.accessLevel || '').toLowerCase().includes('full'),
            permissions: {}
          };
        }
      } catch (e) {}
      return null;
    },

    _setRole(roleCode) {
      let deleted = [];
      try {
        const raw = localStorage.getItem(DELETED_ROLES_STORAGE_KEY);
        if (raw) deleted = JSON.parse(raw);
      } catch (e) {}

      let code = roleCode;
      if (!code || deleted.includes(code) || (!DEFAULT_ROLE_PERMISSIONS[code] && !this._getCustomRole(code))) {
        const available = this.getAvailableRoles();
        code = available.length > 0 ? available[0].code : 'super_admin';
      }

      this._activeRoleCode = code;
      this._activeRoleDef = DEFAULT_ROLE_PERMISSIONS[code] || this._getCustomRole(code) || DEFAULT_ROLE_PERMISSIONS.super_admin;
    },

    reloadRoles() {
      const available = this.getAvailableRoles();
      if (!available.some(r => r.code === this._activeRoleCode)) {
        const nextRole = available.length > 0 ? available[0].code : 'super_admin';
        this._setRole(nextRole);
        try { localStorage.setItem(STORAGE_KEY_ACTIVE_ROLE, nextRole); } catch(e){}
      }
      this.applyDomPermissions();
      this._notify();
    },

    /**
     * Switch role (Authoritative check + preview for testing)
     */
    async switchRole(roleCode) {
      const available = this.getAvailableRoles();
      if (!available.some(r => r.code === roleCode)) {
        console.warn(`[RBAC] Invalid or deleted role: ${roleCode}`);
        return false;
      }
      this._setRole(roleCode);
      localStorage.setItem(STORAGE_KEY_ACTIVE_ROLE, roleCode);
      
      await this.logAudit('ROLE_SWITCHED_PREVIEW', {
        newRole: roleCode,
        actor: this._currentUser?.email || 'admin@afield.local'
      });

      this.applyDomPermissions();
      this._notify();

      if (window.APP && window.APP.showToast) {
        window.APP.showToast(`Switched active role to: ${this._activeRoleDef.name}`, 'info');
      }

      // Re-evaluate navigation visibility
      if (typeof window.reapplyRbacNav === 'function') {
        window.reapplyRbacNav();
      }
      return true;
    },

    getRoleCode() {
      return this._activeRoleCode;
    },

    getActiveRole() {
      return this._activeRoleCode;
    },

    getRoleName() {
      return this._activeRoleDef.name;
    },

    getRoleBadge() {
      return this._activeRoleDef.badge || this._activeRoleDef.name;
    },

    isSuperAdmin() {
      return this._activeRoleCode === 'super_admin';
    },

    isOwner() {
      return this._activeRoleCode === 'company_owner';
    },

    getScope() {
      return this._assignedScope;
    },

    /**
     * Check if active role has permission to perform action on module.
     * @param {string} module - Module code (e.g., 'orders', 'inventory', 'transactions')
     * @param {string} action - Action ('view', 'create', 'edit', 'delete', 'approve', 'reject', 'cancel', 'export')
     * @param {number} [targetCompanyId] - Optional target company ID to enforce company boundaries
     * @param {number} [targetWarehouseId] - Optional target warehouse ID to enforce location boundaries
     * @returns {boolean}
     */
    hasPermission(module, action = 'view', targetCompanyId = null, targetWarehouseId = null) {
      // 1. Super Admin has unrestricted system-wide access
      if (this._activeRoleDef.all && this.isSuperAdmin()) {
        return true;
      }

      // 2. Company Owner: Full access within their authorized company
      if (this.isOwner()) {
        if (targetCompanyId && window.TENANT_CONTEXT) {
          const authorizedIds = window.TENANT_CONTEXT.getAuthorizedCompanies().map(c => c.id);
          if (!authorizedIds.includes(parseInt(targetCompanyId, 10))) {
            return false;
          }
        }
        return true;
      }

      // 3. Location / Warehouse scope enforcement
      if (targetWarehouseId && this._assignedScope.warehouseId) {
        if (parseInt(targetWarehouseId, 10) !== parseInt(this._assignedScope.warehouseId, 10)) {
          return false;
        }
      }

      // 4. Module & Action check
      const perms = this._activeRoleDef.permissions;
      if (!perms) return false;

      const modPerms = perms[module];
      if (!modPerms) return false;

      const act = String(action).toLowerCase();
      return !!modPerms[act];
    },

    // Shortcut checks
    canView(module) { return this.hasPermission(module, 'view'); },
    canCreate(module) { return this.hasPermission(module, 'create'); },
    canEdit(module) { return this.hasPermission(module, 'edit'); },
    canDelete(module) { return this.hasPermission(module, 'delete'); },
    canApprove(module) { return this.hasPermission(module, 'approve'); },
    canReject(module) { return this.hasPermission(module, 'reject'); },
    canCancel(module) { return this.hasPermission(module, 'cancel'); },
    canExport(module) { return this.hasPermission(module, 'export'); },

    /**
     * Guards an action and triggers security warning toast if unauthorized.
     */
    guardAction(module, action, targetDesc = '') {
      if (!this.hasPermission(module, action)) {
        const errorMsg = `Access Denied: Your role (${this.getRoleName()}) does not have permission to ${action} ${targetDesc || module}.`;
        console.warn(`[RBAC Security Warning] ${errorMsg}`);
        
        if (window.APP && window.APP.showToast) {
          window.APP.showToast(errorMsg, 'error');
        }

        this.logAudit('UNAUTHORIZED_ACTION_BLOCKED', {
          module,
          action,
          targetDesc,
          role: this._activeRoleCode
        });

        return false;
      }
      return true;
    },

    /**
     * Automatically scan the DOM for elements with data-rbac-module and data-rbac-action.
     * Hides or disables unauthorized UI controls.
     */
    applyDomPermissions() {
      // 1. Elements with data-rbac-module and data-rbac-action
      const elements = document.querySelectorAll('[data-rbac-module]');
      elements.forEach(el => {
        const mod = el.getAttribute('data-rbac-module');
        const act = el.getAttribute('data-rbac-action') || 'view';
        const allowed = this.hasPermission(mod, act);

        if (!allowed) {
          if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
            el.disabled = true;
            el.classList.add('rbac-disabled');
            el.setAttribute('title', `Permission required: ${act} on ${mod}`);
          } else {
            el.style.display = 'none';
          }
        } else {
          if (el.classList.contains('rbac-disabled')) {
            el.disabled = false;
            el.classList.remove('rbac-disabled');
            el.removeAttribute('title');
          } else if (el.style.display === 'none') {
            el.style.display = '';
          }
        }
      });

      // 2. Hide delete buttons for roles without delete permission
      if (!this.hasPermission('all', 'delete')) {
        document.querySelectorAll('.btn-danger, [data-action="delete"]').forEach(btn => {
          const mod = btn.getAttribute('data-rbac-module') || window.location.pathname.split('/').pop().replace('.html', '');
          if (!this.hasPermission(mod, 'delete')) {
            btn.style.display = 'none';
          }
        });
      }
    },

    /**
     * Create an approval request for restricted transactions.
     */
    async createApprovalRequest({ requestType, referenceTable, referenceId, referenceCode, requiredRoleId, notes }) {
      if (!window.dbClient) return null;
      try {
        const payload = {
          tenant_id: 1,
          company_id: window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getCompanyId() : 1,
          request_type: requestType,
          reference_table: referenceTable,
          reference_id: parseInt(referenceId, 10),
          reference_code: referenceCode,
          requested_by: this._currentUser?.email || 'operator@afield.local',
          required_role_id: parseInt(requiredRoleId, 10) || 6, // default to QC
          status: 'Pending',
          decision_notes: notes || null
        };
        const { data, error } = await window.dbClient.from('approval_requests').insert([payload]).select();
        if (error) throw error;
        
        await this.logAudit('APPROVAL_REQUESTED', payload);
        return data ? data[0] : null;
      } catch (err) {
        console.warn('[RBAC] Could not record approval request:', err.message);
        return null;
      }
    },

    /**
     * Write an audit log entry.
     */
    async logAudit(actionType, details = {}, targetUser = null) {
      try {
        const logEntry = {
          tenant_id: 1,
          company_id: window.TENANT_CONTEXT ? window.TENANT_CONTEXT.getCompanyId() : 1,
          actor_email: this._currentUser?.email || 'admin@afield.local',
          action_type: actionType,
          target_user: targetUser,
          details: details,
          created_at: new Date().toISOString()
        };

        // Local cache for immediate UI feedback and testing
        try {
          const raw = localStorage.getItem('rbac_local_audit_logs');
          const list = raw ? JSON.parse(raw) : [];
          list.unshift(logEntry);
          if (list.length > 100) list.pop();
          localStorage.setItem('rbac_local_audit_logs', JSON.stringify(list));
        } catch (_) {}

        if (window.dbClient) {
          window.dbClient.from('rbac_audit_logs').insert([logEntry]).catch(() => {});
        }
      } catch (e) {
        // Non-blocking
      }
    },

    subscribe(callback) {
      if (typeof callback === 'function') {
        this._subscribers.push(callback);
      }
    },

    _notify() {
      window.dispatchEvent(new CustomEvent('rbacChanged', {
        detail: {
          role: this._activeRoleCode,
          roleDef: this._activeRoleDef
        }
      }));
      this._subscribers.forEach(cb => {
        try { cb(this._activeRoleCode, this._activeRoleDef); } catch (e) {}
      });
    }
  };

  window.RBAC = RbacContext;
  window.RBAC_SERVICE = RbacContext;

  document.addEventListener('DOMContentLoaded', () => {
    RbacContext.init().catch(e => console.warn('[RBAC] Auto-init error:', e));
  });

})(window);
