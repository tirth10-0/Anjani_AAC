/**
 * assets/js/notification-service.js
 * AgroChem ERP - Role-Based Notification Center
 *
 * Provides real-time alerts and actionable notifications:
 * 1. LOW_STOCK: Inventory items or raw materials at or below reorder level.
 * 2. PENDING_APPROVAL: Orders, formulations, packaging, dispatches awaiting supervisor authorization.
 * 3. QC_HOLD: Chemical bulk batches or packed lots placed in quarantine or pending inspection.
 * 4. PENDING_RECEIPT: In-transit intercompany transfers or purchase orders awaiting inward arrival.
 * 5. DISPATCH_DELAY: Approved dispatches delayed past scheduled date or pending gate pass exit.
 * 6. STOCK_DISCREPANCY: Negative batch clamps or physical discrepancies detected by diagnostics.
 *
 * RBAC Scoping:
 * - Automatically filters notifications based on active role permissions.
 * - Software Super Admin & Company Owner receive full visibility.
 * - Specialized roles (QC, Store, Accountant, Sales, Production) receive alerts strictly within their purview.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NOTIFICATION_SERVICE = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'erp_notifications_cache';

  // Role permissions mapping for notification categories
  const ROLE_NOTIFICATION_MAP = {
    super_admin: ['LOW_STOCK', 'PENDING_APPROVAL', 'QC_HOLD', 'PENDING_RECEIPT', 'DISPATCH_DELAY', 'STOCK_DISCREPANCY', 'FINANCIAL_ALERT'],
    company_owner: ['LOW_STOCK', 'PENDING_APPROVAL', 'QC_HOLD', 'PENDING_RECEIPT', 'DISPATCH_DELAY', 'STOCK_DISCREPANCY', 'FINANCIAL_ALERT'],
    production_manager: ['LOW_STOCK', 'PENDING_APPROVAL', 'QC_HOLD', 'STOCK_DISCREPANCY'],
    factory_operator: ['QC_HOLD'],
    godown_operator: ['LOW_STOCK', 'PENDING_RECEIPT', 'DISPATCH_DELAY'],
    qc_officer: ['QC_HOLD', 'PENDING_APPROVAL'],
    accountant: ['PENDING_APPROVAL', 'FINANCIAL_ALERT'],
    store_manager: ['LOW_STOCK', 'PENDING_RECEIPT', 'STOCK_DISCREPANCY'],
    sales_executive: ['DISPATCH_DELAY', 'PENDING_APPROVAL'],
    viewer_auditor: ['STOCK_DISCREPANCY', 'FINANCIAL_ALERT']
  };

  let inMemoryNotifications = [];

  // No initial mock notifications: clean-slate testing starts with an empty inbox
  const INITIAL_SEED_NOTIFICATIONS = [];

  class NotificationService {
    constructor(dbClient = null) {
      this.db = dbClient || (typeof window !== 'undefined' ? window.dbClient : null);
      this.loadCache();
    }

    setDb(dbClient) {
      this.db = dbClient;
    }

    loadCache() {
      if (typeof localStorage !== 'undefined') {
        const NOTIF_CLEAN_SLATE_KEY = 'erp_notif_clean_slate_2026_10_16_v3';
        if (localStorage.getItem(NOTIF_CLEAN_SLATE_KEY) !== 'purged') {
          try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(NOTIF_CLEAN_SLATE_KEY, 'purged');
          } catch (_) {}
        }

        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            const mockCodes = ['RM-TECH-01', 'BAT-2026-002', 'DSP-2026-005', 'ICT-2026-001', 'B-OLD-99'];
            const mockTitles = [
              'Raw Material Below Reorder Threshold',
              'Quarantine Batch Awaiting Inspection',
              'Commercial Dispatch Awaiting Gate Exit Approval',
              'In-Transit Intercompany Transfer En Route',
              'Diagnostic Reconciled Negative Batch'
            ];
            inMemoryNotifications = Array.isArray(parsed)
              ? parsed.filter(n => !mockCodes.includes(n.reference_code) && !mockTitles.includes(n.title))
              : [];
            this.saveCache();
          } else {
            inMemoryNotifications = [];
          }
        } catch (e) {
          inMemoryNotifications = [];
        }
      } else {
        inMemoryNotifications = [];
      }
    }

    saveCache() {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryNotifications));
        } catch (e) {}
      }
    }

    clearAll() {
      inMemoryNotifications = [];
      this.saveCache();
      if (typeof window !== 'undefined' && typeof window.renderTopbarNotifications === 'function') {
        window.renderTopbarNotifications();
      }
    }

    /**
     * Create and broadcast a system notification.
     */
    async createNotification({
      companyId = 1,
      type, // 'LOW_STOCK', 'PENDING_APPROVAL', 'QC_HOLD', 'PENDING_RECEIPT', 'DISPATCH_DELAY', 'STOCK_DISCREPANCY', 'FINANCIAL_ALERT'
      priority = 'Normal', // 'Urgent', 'Warning', 'Normal', 'Info'
      title,
      message,
      referenceType = null,
      referenceId = null,
      referenceCode = null,
      targetRoles = null,
      actionUrl = null
    }) {
      if (!type || !title || !message) {
        throw new Error('NOTIFICATION_INVALID_ARGS: type, title, and message are required.');
      }

      // Default target roles if unspecified
      let roles = targetRoles;
      if (!Array.isArray(roles) || roles.length === 0) {
        roles = Object.keys(ROLE_NOTIFICATION_MAP).filter(r => ROLE_NOTIFICATION_MAP[r].includes(type));
      }

      const notif = {
        id: inMemoryNotifications.length + 1,
        company_id: companyId,
        type,
        priority,
        title,
        message,
        reference_type: referenceType,
        reference_id: referenceId,
        reference_code: referenceCode,
        target_roles: roles,
        is_read: false,
        read_by: [],
        action_url: actionUrl,
        created_at: new Date().toISOString()
      };

      inMemoryNotifications.unshift(notif);
      this.saveCache();

      // Dispatch event for UI reactivity
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('newNotification', { detail: notif }));
        } catch (e) {}
      }

      return notif;
    }

    /**
     * Retrieve notifications filtered by user role and authorized company.
     */
    getNotificationsForUser({ roleCode = 'super_admin', companyId = 1, unreadOnly = false }) {
      const allowedCategories = ROLE_NOTIFICATION_MAP[roleCode] || [];

      return inMemoryNotifications.filter(n => {
        // Company scoping
        if (n.company_id && companyId && n.company_id !== companyId) return false;

        // Read status filter
        if (unreadOnly && n.is_read) return false;

        // Super Admin & Company Owner see all
        if (roleCode === 'super_admin' || roleCode === 'company_owner') return true;

        // Targeted role check
        if (Array.isArray(n.target_roles) && n.target_roles.includes(roleCode)) return true;

        // Category check
        return allowedCategories.includes(n.type);
      });
    }

    /**
     * Mark a notification as read.
     */
    markAsRead(notificationId, userEmail = 'user@afield.local') {
      const notif = inMemoryNotifications.find(n => n.id === notificationId);
      if (notif) {
        notif.is_read = true;
        if (!Array.isArray(notif.read_by)) notif.read_by = [];
        if (!notif.read_by.includes(userEmail)) notif.read_by.push(userEmail);
        this.saveCache();
        return true;
      }
      return false;
    }

    /**
     * Mark all notifications as read for current view.
     */
    markAllAsRead(roleCode = 'super_admin', companyId = 1) {
      const list = this.getNotificationsForUser({ roleCode, companyId });
      list.forEach(n => { n.is_read = true; });
      this.saveCache();
      return list.length;
    }

    /**
     * Get count of unread notifications for active user.
     */
    getUnreadCount(roleCode = 'super_admin', companyId = 1) {
      return this.getNotificationsForUser({ roleCode, companyId, unreadOnly: true }).length;
    }

    /**
     * Reset notification cache (for unit testing)
     */
    reset() {
      inMemoryNotifications = [...INITIAL_SEED_NOTIFICATIONS];
      this.saveCache();
    }
  }

  const defaultInstance = new NotificationService();
  defaultInstance.NotificationService = NotificationService;
  defaultInstance.ROLE_NOTIFICATION_MAP = ROLE_NOTIFICATION_MAP;

  return defaultInstance;
});
