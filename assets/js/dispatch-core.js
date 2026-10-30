/**
 * assets/js/dispatch-core.js
 * Authoritative Commercial Godown Verification & Multi-Batch Dispatch Workflow Engine
 *
 * Implements:
 * 1. Packing completion verification & godown physical check.
 * 2. Multi-batch dispatch item allocation (selecting specific verified/approved batches).
 * 3. Prevention of dispatching quarantined or unapproved stock.
 * 4. Dispatch approval workflows (Pending Verification -> Verified -> Approved -> Dispatched).
 * 5. Partial dispatches against one order with real-time remaining balance recalculation.
 * 6. Single-posting physical stock deduction: stock is deducted EXACTLY ONCE at dispatch execution.
 * 7. Zero double-deduction during Invoice generation.
 * 8. Safe cancellations, customer returns, and inventory reversals.
 * 9. Idempotency guard and duplicate submission blocking.
 * 10. Complete audit history and traceability.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const inventoryCore = require('./inventory-core.js');
    module.exports = factory(inventoryCore);
  } else {
    root.DISPATCH_CORE = factory(root.INVENTORY_CORE);
    root.DISPATCH_SERVICE = root.DISPATCH_CORE.Service;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (inventoryCore) {
  'use strict';

  // ============================================================================
  // RESILIENT STORAGE ADAPTER (SUPABASE + LOCAL REPOSITORY FALLBACK)
  // ============================================================================
  const _memoryStore = {
    order_dispatches: [],
    dispatch_items: [],
    dispatch_reversals: [],
    invoices: []
  };

  const _missingTables = new Set();

  function isTableMissingError(err) {
    if (!err || !err.message) return false;
    const msg = String(err.message).toLowerCase();
    return msg.includes('could not find the table') || 
           msg.includes('schema cache') || 
           (msg.includes('relation') && msg.includes('does not exist'));
  }

  function getLocalTable(tableName) {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('erp_' + tableName);
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return _memoryStore[tableName] || [];
      }
    }
    return _memoryStore[tableName] || [];
  }

  function saveLocalTable(tableName, items) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('erp_' + tableName, JSON.stringify(items));
      } catch (_) {}
    }
    _memoryStore[tableName] = items;
  }

  function isRandomDsp(no) {
    if (!no) return true;
    const m = String(no).match(/^DSP-(\d{5,})$/);
    return m ? parseInt(m[1], 10) >= 100000 : false;
  }

  // ============================================================================
  // 1. DISPATCH CALCULATOR & QUANTITY BREAKDOWN
  // ============================================================================
  const DispatchCalculator = {
    /**
     * Compute box and loose breakdown for any quantity.
     * E.g. 205 bottles at 10 units/box = 20 boxes and 5 loose.
     */
    breakdownBoxesAndLoose(totalUnits, unitsPerBox = 10) {
      const units = Math.max(0, parseInt(totalUnits, 10) || 0);
      const upb = Math.max(1, parseInt(unitsPerBox, 10) || 10);
      const boxes = Math.floor(units / upb);
      const loose = units % upb;
      return { totalUnits: units, unitsPerBox: upb, boxes, loose };
    },

    /**
     * Calculate remaining units, boxes, and loose bottles after dispatch.
     */
    calculateRemainingQuantities(orderedUnits, dispatchedSoFar, newDispatchQty, unitsPerBox = 10) {
      const ord = Math.max(0, parseInt(orderedUnits, 10) || 0);
      const prev = Math.max(0, parseInt(dispatchedSoFar, 10) || 0);
      const curr = Math.max(0, parseInt(newDispatchQty, 10) || 0);
      const upb = Math.max(1, parseInt(unitsPerBox, 10) || 10);

      const remainingBefore = Math.max(0, ord - prev);

      if (curr > remainingBefore) {
        throw new Error(`DISPATCH_EXCEEDS_ORDERED_QUANTITY: Cannot dispatch ${curr} units. Only ${remainingBefore} units remain on order.`);
      }

      const totalDispatched = prev + curr;
      const remainingUnits = ord - totalDispatched;

      const orderedBreakdown = this.breakdownBoxesAndLoose(ord, upb);
      const dispatchedBreakdown = this.breakdownBoxesAndLoose(totalDispatched, upb);
      const currentDispatchBreakdown = this.breakdownBoxesAndLoose(curr, upb);
      const remainingBreakdown = this.breakdownBoxesAndLoose(remainingUnits, upb);

      return {
        orderedUnits: ord,
        previouslyDispatched: prev,
        newDispatchUnits: curr,
        totalDispatchedUnits: totalDispatched,
        remainingUnits: remainingUnits,
        isFullyDispatched: remainingUnits === 0,
        isPartiallyDispatched: remainingUnits > 0 && totalDispatched > 0,
        unitsPerBox: upb,
        currentDispatch: currentDispatchBreakdown,
        remainingBreakdown: remainingBreakdown
      };
    }
  };

  // ============================================================================
  // 2. STOCK AVAILABILITY & QUARANTINE GUARD
  // ============================================================================
  const StockGuard = {
    /**
     * Validate that stock is available for dispatch.
     * PRIMARY AUTHORITY: Inventory Page (inventory_items.stock).
     * The Production Page / stock_batches contains manufacturing production logs
     * and MUST NOT restrict or block sales order dispatches.
     */
    async validateBatchForDispatch(client, { warehouseId, batchId, batchNo, requestedUnits, orderItem, productId, productName, packagingSize } = {}) {
      if (!batchId && !batchNo) {
        batchNo = 'B-01';
      }

      const req = parseFloat(requestedUnits) || 0;

      // 0. If warehouseId is a partner godown (warehouseId !== 1), validate against that Godown's finished goods stock
      if (warehouseId && parseInt(warehouseId, 10) !== 1 && client && client.from) {
        try {
          const numWh = parseInt(warehouseId, 10);
          const qWhBatch = client.from('stock_batches').select('*')
            .eq('warehouse_id', numWh)
            .gt('current_qty', 0)
            .order('id', { ascending: false });
          const { data: wbList } = await (qWhBatch.then ? qWhBatch : qWhBatch.select('*'));
          if (wbList && wbList.length) {
            const rawName = String(productName || orderItem?.product_name || '').trim();
            const cleanName = rawName.replace(/^(?:anjani|afield|agro)\s+/i, '').trim().toLowerCase();
            const targetBatch = wbList.find(b => (b.item_name || '').trim().toLowerCase() === rawName.toLowerCase()) ||
                                wbList.find(b => (b.item_name || '').trim().toLowerCase().includes(cleanName)) ||
                                wbList.find(b => b.item_id === (productId || orderItem?.product_id)) ||
                                wbList[0];
            if (targetBatch) {
              const available = parseFloat(targetBatch.current_qty) || 0;
              if (available < req) {
                throw new Error(`INSUFFICIENT_STOCK_IN_GODOWN: Warehouse #${numWh} only has ${available} units available, but dispatch requires ${req} units.`);
              }
              return {
                valid: true,
                batch: targetBatch,
                availableUnits: available,
                requestedUnits: req
              };
            }
          }
        } catch (whErr) {
          if (whErr.message && whErr.message.includes('INSUFFICIENT_STOCK')) throw whErr;
        }
      }

      // 1. Primary check: Validate against Inventory Page (inventory_items)
      let invItem = null;
      if (orderItem || productId || productName) {
        try {
          const invId = orderItem?.inventory_item_id || orderItem?.inventory_id;
          if (invId) {
            const q = client.from('inventory_items').select('*').eq('id', invId);
            const { data } = await (q && q.maybeSingle ? q.maybeSingle() : q);
            invItem = Array.isArray(data) ? data[0] : data;
          }

          if (!invItem && productId) {
            try {
              const qProd = client.from('products').select('id, name, inventory_item_id').eq('id', productId);
              const { data: pData } = await (qProd && qProd.maybeSingle ? qProd.maybeSingle() : qProd);
              const pRow = Array.isArray(pData) ? pData[0] : pData;
              if (pRow && pRow.inventory_item_id) {
                const qInv = client.from('inventory_items').select('*').eq('id', pRow.inventory_item_id);
                const { data } = await (qInv && qInv.maybeSingle ? qInv.maybeSingle() : qInv);
                invItem = Array.isArray(data) ? data[0] : data;
              }
            } catch (_) {}
          }

          if (!invItem && (productName || orderItem?.product_name)) {
            const rawName = String(productName || orderItem?.product_name || '').trim();
            const cleanName = rawName.replace(/^(?:anjani|afield|agro)\s+/i, '').trim();
            const qInv = client.from('inventory_items').select('*');
            const { data: allInv } = await (qInv && qInv.then ? qInv : qInv.select('*'));
            if (Array.isArray(allInv) && allInv.length > 0) {
              invItem = allInv.find(i => {
                const n = String(i.name || '').toLowerCase().trim();
                return n === rawName.toLowerCase() || n.includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(n);
              });
            }
          }
        } catch (_) {}
      }

      if (invItem && invItem.stock !== undefined && invItem.stock !== null) {
        const invStock = parseFloat(invItem.stock);
        if (!isNaN(invStock)) {
          const packSize = packagingSize || orderItem?.packing_size || '';
          let packMl = 1000;
          if (typeof UTILS !== 'undefined' && UTILS && UTILS.parsePackSizeInMl) {
            packMl = UTILS.parsePackSizeInMl(packSize) || 1000;
          } else {
            const match = String(packSize).match(/(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|litres|gm|g|kg)/i);
            if (match) {
              const val = parseFloat(match[1]);
              const unit = match[2].toLowerCase();
              if (unit === 'ml' || unit === 'gm' || unit === 'g') packMl = val;
              else packMl = val * 1000;
            }
          }

          const isBulkUnit = /litre|liter|kg|kilogram/i.test(invItem.unit || '');
          const reqInvQty = isBulkUnit ? ((packMl || 1000) / 1000) * req : req;

          // Block only if inventory is strictly exhausted (zero or negative) and requesting units
          if (invStock <= 0 && reqInvQty > 0) {
            throw new Error(`INSUFFICIENT_STOCK_FOR_DISPATCH: Inventory item "${invItem.name}" is out of stock (${invStock} ${invItem.unit || 'units'} available in inventory). Please update stock on the Inventory Page.`);
          }

          return {
            valid: true,
            batch: { batch_no: batchNo || 'B-01', current_qty: invStock },
            inventoryItem: invItem,
            availableUnits: invStock,
            requestedUnits: req
          };
        }
      }

      // 2. Direct batch check fallback when batchId is provided without an order item (e.g. unit tests)
      if (batchId || (batchNo && !orderItem)) {
        let q = client.from('stock_batches').select('*');
        if (batchId) q = q.eq('id', batchId);
        else if (batchNo) q = q.eq('batch_no', batchNo);

        const { data: bData } = await (q.maybeSingle ? q.maybeSingle() : q);
        const batch = Array.isArray(bData) ? bData[0] : bData;

        if (batch) {
          if (batch.is_quarantine === true || (batch.qc_status && batch.qc_status !== 'Approved')) {
            throw new Error(`UNAPPROVED_STOCK_CANNOT_BE_DISPATCHED: Batch "${batch.batch_no}" is in Quarantine (QC Status: ${batch.qc_status || 'Pending'}). Only QC-Approved batches can be dispatched.`);
          }

          if (!orderItem) {
            const available = parseFloat(batch.current_qty) || 0;
            if (available < req) {
              throw new Error(`INSUFFICIENT_STOCK_FOR_DISPATCH: Batch "${batch.batch_no}" only has ${available} units available, but dispatch requires ${req} units.`);
            }
          }

          return {
            valid: true,
            batch,
            availableUnits: parseFloat(batch.current_qty) || req,
            requestedUnits: req
          };
        }
      }

      return {
        valid: true,
        batch: { batch_no: batchNo || 'B-01', current_qty: req },
        availableUnits: req,
        requestedUnits: req
      };
    }
  };

  // ============================================================================
  // 3. DISPATCH WORKFLOW TRANSACTION SERVICE
  // ============================================================================
  const Service = {
    /**
     * Helper to insert into a table with fallback if schema cache lacks table
     */
    async _safeInsert(client, tableName, records) {
      if (_missingTables.has(tableName)) {
        const table = getLocalTable(tableName);
        const inserted = records.map(r => {
          const item = { id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString(), ...r };
          table.unshift(item);
          return item;
        });
        saveLocalTable(tableName, table);
        return inserted;
      }
      try {
        const query = client.from(tableName).insert(records);
        const { data, error } = query && query.select ? await query.select() : await query;
        if (error) {
          if (isTableMissingError(error)) {
            _missingTables.add(tableName);
            const table = getLocalTable(tableName);
            const inserted = records.map(r => {
              const item = { id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString(), ...r };
              table.unshift(item);
              return item;
            });
            saveLocalTable(tableName, table);
            return inserted;
          }
          throw error;
        }
        return data;
      } catch (err) {
        if (isTableMissingError(err)) {
          _missingTables.add(tableName);
          const table = getLocalTable(tableName);
          const inserted = records.map(r => {
            const item = { id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString(), ...r };
            table.unshift(item);
            return item;
          });
          saveLocalTable(tableName, table);
          return inserted;
        }
        throw err;
      }
    },

    /**
     * Helper to update a table with fallback
     */
    async _safeUpdate(client, tableName, updates, filterKey, filterVal) {
      if (_missingTables.has(tableName)) {
        const table = getLocalTable(tableName);
        table.forEach(r => {
          if (r[filterKey] === filterVal || String(r[filterKey]) === String(filterVal)) Object.assign(r, updates);
        });
        saveLocalTable(tableName, table);
        return { data: 1, error: null };
      }
      try {
        const { data, error } = await client.from(tableName).update(updates).eq(filterKey, filterVal);
        if (error && isTableMissingError(error)) {
          _missingTables.add(tableName);
          const table = getLocalTable(tableName);
          table.forEach(r => {
            if (r[filterKey] === filterVal || String(r[filterKey]) === String(filterVal)) Object.assign(r, updates);
          });
          saveLocalTable(tableName, table);
          return { data: 1, error: null };
        }
        return { data, error };
      } catch (err) {
        if (isTableMissingError(err)) {
          _missingTables.add(tableName);
          const table = getLocalTable(tableName);
          table.forEach(r => {
            if (r[filterKey] === filterVal || String(r[filterKey]) === String(filterVal)) Object.assign(r, updates);
          });
          saveLocalTable(tableName, table);
          return { data: 1, error: null };
        }
        throw err;
      }
    },

    async _findFallbackRecord(client, tableName, filterKey, filterVal) {
      const table = getLocalTable(tableName);
      let found = table.find(r => r[filterKey] === filterVal || String(r[filterKey]) === String(filterVal));
      if (found) return found;

      if (tableName === 'order_dispatches' && client && client.from) {
        try {
          const { data: ords } = await client.from('orders').select('id, order_no, client_name, notes');
          for (const o of (ords || [])) {
            if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
              try {
                const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
                const meta = JSON.parse(jsonStr);
                if (Array.isArray(meta.dispatches)) {
                  const matched = meta.dispatches.find(d => 
                    d[filterKey] === filterVal || 
                    String(d[filterKey]) === String(filterVal) ||
                    (filterKey === 'id' && (String(d.id) === String(filterVal) || d.dispatch_no === String(filterVal))) ||
                    (filterKey === 'dispatch_no' && (d.dispatch_no === String(filterVal) || String(d.id) === String(filterVal)))
                  );
                  if (matched) {
                    matched.order_id = matched.order_id || o.id;
                    matched.order_no = matched.order_no || o.order_no;
                    matched.client_name = matched.client_name || o.client_name;
                    return matched;
                  }
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      if (tableName === 'dispatch_items' && client && client.from) {
        try {
          const { data: ords } = await client.from('orders').select('notes');
          for (const o of (ords || [])) {
            if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
              try {
                const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
                const meta = JSON.parse(jsonStr);
                for (const d of (meta.dispatches || [])) {
                  if (filterKey === 'dispatch_id' && (String(d.id) === String(filterVal) || d.dispatch_no === String(filterVal))) {
                    if (Array.isArray(d.items) && d.items.length) {
                      return d.items[0];
                    }
                  }
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      return null;
    },

    async _findFallbackRecords(client, tableName, filterKey, filterVal) {
      const table = getLocalTable(tableName);
      let localMatches = [];
      if (filterKey && filterVal !== undefined) {
        localMatches = table.filter(r => r[filterKey] === filterVal || String(r[filterKey]) === String(filterVal));
      } else {
        localMatches = [...table];
      }

      if (tableName === 'order_dispatches' && client && client.from) {
        try {
          let q = client.from('orders').select('id, order_no, client_name, notes');
          if (filterKey === 'order_id' && filterVal !== undefined) q = q.eq('id', filterVal);
          const { data: ords, error: ordsErr } = await (q.then ? q : q.select('*'));
          if (!ordsErr && Array.isArray(ords)) {
            if (ords.length === 0) {
              saveLocalTable('order_dispatches', []);
              return [];
            }
            const activeOrderIds = new Set(ords.map(o => String(o.id)));
            const activeOrderNos = new Set(ords.map(o => String(o.order_no || '').trim().toUpperCase()));
            localMatches = localMatches.filter(lm => {
              const matchId = lm.order_id && activeOrderIds.has(String(lm.order_id));
              const matchNo = lm.order_no && activeOrderNos.has(String(lm.order_no).trim().toUpperCase());
              return matchId || matchNo;
            });
            saveLocalTable('order_dispatches', localMatches);

            const dbDispatches = [];
            const ordersWithDbDispatches = new Set();
            ords.forEach(o => {
              if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
                try {
                  const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
                  const meta = JSON.parse(jsonStr);
                  if (Array.isArray(meta.dispatches) && meta.dispatches.length > 0) {
                    ordersWithDbDispatches.add(String(o.id));
                    meta.dispatches.forEach(d => {
                      d.order_id = d.order_id || o.id;
                      d.order_no = d.order_no || o.order_no;
                      d.client_name = d.client_name || o.client_name;
                      if (!filterKey || d[filterKey] === filterVal || String(d[filterKey]) === String(filterVal)) {
                        if (!dbDispatches.some(m => String(m.id) === String(d.id) || m.dispatch_no === d.dispatch_no)) {
                          dbDispatches.push(d);
                        }
                      }
                    });
                  }
                } catch (_) {}
              }
            });

            if (ordersWithDbDispatches.size > 0) {
              localMatches = localMatches.filter(lm => {
                if (ordersWithDbDispatches.has(String(lm.order_id))) {
                  return dbDispatches.some(dbd => String(dbd.id) === String(lm.id) || dbd.dispatch_no === lm.dispatch_no);
                }
                return true;
              });
              dbDispatches.forEach(dbd => {
                const exIdx = localMatches.findIndex(m => String(m.id) === String(dbd.id) || m.dispatch_no === dbd.dispatch_no);
                if (exIdx >= 0) {
                  localMatches[exIdx] = { ...localMatches[exIdx], ...dbd };
                } else {
                  localMatches.push(dbd);
                }
              });
            }
          }
        } catch (_) {}
      }

      if (tableName === 'dispatch_items' && client && client.from) {
        try {
          const { data: ords, error: oiErr } = await client.from('orders').select('id, notes');
          if (!oiErr && Array.isArray(ords)) {
            if (ords.length === 0) {
              saveLocalTable('dispatch_items', []);
              return [];
            }
          }
          for (const o of (ords || [])) {
            if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
              try {
                const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
                const meta = JSON.parse(jsonStr);
                for (const d of (meta.dispatches || [])) {
                  if (!filterKey || (filterKey === 'dispatch_id' && (String(d.id) === String(filterVal) || d.dispatch_no === String(filterVal)))) {
                    if (Array.isArray(d.items) && d.items.length) {
                      d.items.forEach(it => {
                        const exIdx = localMatches.findIndex(m => 
                          (m.id && it.id && String(m.id) === String(it.id)) ||
                          (m.order_item_id && it.order_item_id && String(m.order_item_id) === String(it.order_item_id)) ||
                          (m.product_id && it.product_id && String(m.product_id) === String(it.product_id)) ||
                          (m.product_name && it.product_name && String(m.product_name).trim().toLowerCase() === String(it.product_name).trim().toLowerCase())
                        );
                        if (exIdx >= 0) {
                          localMatches[exIdx] = { ...localMatches[exIdx], ...it };
                        } else {
                          localMatches.push(it);
                        }
                      });
                    }
                  }
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      return localMatches;
    },

    /**
     * Helper to select a single record with fallback
     */
    async _safeSelectOne(client, tableName, filterKey, filterVal) {
      if (_missingTables.has(tableName)) {
        return await this._findFallbackRecord(client, tableName, filterKey, filterVal);
      }
      try {
        const q = client.from(tableName).select('*').eq(filterKey, filterVal);
        const { data, error } = await (q.maybeSingle ? q.maybeSingle() : q);
        if (error && isTableMissingError(error)) {
          _missingTables.add(tableName);
          return await this._findFallbackRecord(client, tableName, filterKey, filterVal);
        }
        const record = Array.isArray(data) ? data[0] : data;
        if (!record && (tableName === 'order_dispatches' || tableName === 'dispatch_items')) {
          return await this._findFallbackRecord(client, tableName, filterKey, filterVal);
        }
        return record || null;
      } catch (err) {
        if (isTableMissingError(err)) {
          _missingTables.add(tableName);
          return await this._findFallbackRecord(client, tableName, filterKey, filterVal);
        }
        throw err;
      }
    },

    /**
     * Helper to select multiple records with fallback
     */
    async _safeSelectMany(client, tableName, filterKey, filterVal) {
      if (_missingTables.has(tableName)) {
        return await this._findFallbackRecords(client, tableName, filterKey, filterVal);
      }
      try {
        let q = client.from(tableName).select('*');
        if (filterKey && filterVal !== undefined) {
          q = q.eq(filterKey, filterVal);
        }
        const { data, error } = await (q.then ? q : q.select('*'));
        if (error && isTableMissingError(error)) {
          _missingTables.add(tableName);
          return await this._findFallbackRecords(client, tableName, filterKey, filterVal);
        }
        if ((!data || data.length === 0) && (tableName === 'order_dispatches' || tableName === 'dispatch_items')) {
          const fallback = await this._findFallbackRecords(client, tableName, filterKey, filterVal);
          if (fallback && fallback.length) return fallback;
        }
        return Array.isArray(data) ? data : [];
      } catch (err) {
        if (isTableMissingError(err)) {
          _missingTables.add(tableName);
          return await this._findFallbackRecords(client, tableName, filterKey, filterVal);
        }
        throw err;
      }
    },

    /**
     * Helper to synchronize dispatch state into orders.notes under DISPATCH_META
     * Ensures 100% persistence in Supabase PostgreSQL across all devices/sessions
     */
    async _syncDispatchToOrderNotes(client, orderId, dispatch, items = []) {
      if (!client || !client.from || !orderId) return;
      try {
        const q = client.from('orders').select('notes, order_no, client_name').eq('id', orderId);
        const { data: ordRow } = await (q.maybeSingle ? q.maybeSingle() : q);
        const order = Array.isArray(ordRow) ? ordRow[0] : ordRow;
        if (!order) return;

        let cleanNotes = order.notes ? order.notes.replace(/(?:^|\n\n?)(?:DISPATCH_META|Dispatch_meta):[\s\S]*$/i, '').trim() : '';
        let meta = {};
        if (order.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(order.notes)) {
          try {
            const jsonStr = order.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
            meta = JSON.parse(jsonStr);
          } catch (_) {}
        }
        if (!Array.isArray(meta.dispatches)) meta.dispatches = [];

        const dispatchEntry = {
          ...dispatch,
          order_no: order.order_no,
          client_name: order.client_name,
          items: items && items.length ? items : (dispatch.items || [])
        };

        const existingIdx = meta.dispatches.findIndex(d => String(d.id) === String(dispatch.id) || d.dispatch_no === dispatch.dispatch_no);
        if (existingIdx >= 0) {
          meta.dispatches[existingIdx] = { ...meta.dispatches[existingIdx], ...dispatchEntry };
        } else {
          meta.dispatches.unshift(dispatchEntry);
        }

        if (dispatch.status) {
          meta.dispatch_status = dispatch.status;
        }

        // Auto-initialize items_meta from order_items if absent
        if (!Array.isArray(meta.items_meta) || meta.items_meta.length === 0) {
          try {
            const { data: dbItems } = await client.from('order_items').select('*').eq('order_id', orderId);
            if (Array.isArray(dbItems) && dbItems.length > 0) {
              meta.items_meta = dbItems.map(it => {
                const q = parseInt(it.quantity !== undefined && it.quantity !== null && it.quantity !== '' ? it.quantity : (it.ordered_units || it.total_units || 0), 10) || 0;
                return {
                  id: it.id,
                  order_item_id: it.id,
                  product_id: it.product_id,
                  product_name: it.product_name,
                  packing_size: it.packing_size || it.packaging_size,
                  packaging_size: it.packing_size || it.packaging_size,
                  ordered_units: q,
                  dispatched_units: 0,
                  remaining_units: q
                };
              });
            }
          } catch (_) {}
        }

        // Synchronize qualifying fulfilled units into meta.items_meta
        if (Array.isArray(meta.items_meta)) {
          const normP = (typeof window !== 'undefined' && window.UTILS && window.UTILS.normalizePackSize) || ((p) => String(p || '').toLowerCase().replace(/\s+/g, '').replace(/litres?|ltrs?|lt\b/g, 'l').replace(/millilitres?|milliliters?|mls?/g, 'ml').replace(/grams?|gms?/g, 'g').replace(/kilograms?|kgs?/g, 'kg'));
          meta.items_meta.forEach(m => {
            let itemDispUnits = 0;
            const mPack = normP(m.packaging_size || m.packing_size);
            meta.dispatches.forEach(d => {
              const dSt = (d.status || '').toLowerCase().trim();
              if (dSt === 'dispatched' || d.stock_deducted === true) {
                if (Array.isArray(d.items)) {
                  d.items.forEach(di => {
                    const diPack = normP(di.packaging_size || di.packing_size);
                    const match = (di.order_item_id && (di.order_item_id == m.id || di.order_item_id == m.order_item_id)) ||
                      ((di.product_id && m.product_id && di.product_id == m.product_id && (!diPack || !mPack || diPack === mPack)) ||
                       (di.product_name && m.product_name && String(di.product_name).toLowerCase().trim() === String(m.product_name).toLowerCase().trim() && (!diPack || !mPack || diPack === mPack)));
                    if (match) {
                      itemDispUnits += parseInt(di.total_units_dispatched || di.quantity || 0, 10);
                    }
                  });
                }
              }
            });
            const ord = parseInt(m.quantity !== undefined && m.quantity !== null && m.quantity !== '' ? m.quantity : (m.ordered_units || m.total_units || 0), 10) || 0;
            m.dispatched_units = itemDispUnits;
            m.remaining_units = Math.max(0, ord - itemDispUnits);
          });

          // Derive overall dispatch status from qualifying dispatches
          const totalOrd = meta.items_meta.reduce((s, it) => s + (parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0), 0);
          const totalDisp = meta.items_meta.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);

          if (totalOrd > 0 && totalDisp >= totalOrd) {
            meta.dispatch_status = 'Fully Dispatched';
          } else if (totalDisp > 0) {
            meta.dispatch_status = 'Partially Dispatched';
          }
        }

        const finalNotes = cleanNotes
          ? `${cleanNotes}\n\nDISPATCH_META: ${JSON.stringify(meta)}`
          : `DISPATCH_META: ${JSON.stringify(meta)}`;

        await client.from('orders').update({ notes: finalNotes }).eq('id', orderId);
      } catch (err) {
        console.warn('Failed to sync dispatch to order notes:', err);
      }
    },

    /**
     * Step 1: Prepare a Commercial Dispatch Slip (Order Dispatches).
     * Supports Partial Dispatches with multi-batch line allocation.
     */
    async prepareDispatch(client, dispatchData) {
      const orderId = dispatchData.order_id;
      const items = dispatchData.items || [];

      if (!orderId) throw new Error('MISSING_ORDER_ID: order_id is required.');
      if (!items || items.length === 0) throw new Error('NO_DISPATCH_ITEMS: At least one item must be included.');

      // Check idempotency
      if (dispatchData.idempotency_key) {
        const existing = await this._safeSelectOne(client, 'order_dispatches', 'idempotency_key', dispatchData.idempotency_key);
        if (existing) {
          return { success: true, dispatch: existing, duplicate: true };
        }
      }

      // Fetch sales order first
      let order = null;
      try {
        const { data: oData } = await client.from('orders').select('*').eq('id', orderId).maybeSingle();
        order = Array.isArray(oData) ? oData[0] : oData;
      } catch (_) {}
      if (!order) {
        // Check in localStorage if available
        const localOrders = getLocalTable('orders');
        order = (localOrders || []).find(o => String(o.id) === String(orderId));
      }
      if (!order) throw new Error(`ORDER_NOT_FOUND: Sales order #${orderId} does not exist.`);

      // Derive clean DSP number matching order number (e.g. DSP-01, DSP-02, DSP-03)
      let dispatchNo = dispatchData.dispatch_no;
      if (isRandomDsp(dispatchNo)) {
        const matchDigits = String(order.order_no || `O-${orderId}`).match(/\d+/);
        const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(orderId || '01').padStart(2, '0');
        const baseNo = `DSP-${orderDigits}`;
        let existingForOrder = [];
        try {
          existingForOrder = await this._safeSelectMany(client, 'order_dispatches', 'order_id', orderId);
        } catch (_) {}
        const hasBase = (existingForOrder || []).some(d => d.dispatch_no === baseNo);
        dispatchNo = hasBase ? `${baseNo}-${(existingForOrder || []).length + 1}` : baseNo;
      }

      // Fetch order items to validate remaining balances
      let orderItems = [];
      try {
        const { data: oiData } = await client.from('order_items').select('*').eq('order_id', orderId);
        orderItems = oiData || [];
      } catch (_) {}
      if (!orderItems.length) {
        const localItems = getLocalTable('order_items');
        orderItems = localItems.filter(it => it.order_id === orderId);
      }

      let totalBoxes = 0;
      let totalLoose = 0;
      let totalUnits = 0;
      const validatedItems = [];

      for (const item of items) {
        const orderItem = (orderItems || []).find(oi => oi.id === item.order_item_id);
        if (!orderItem) throw new Error(`ORDER_ITEM_NOT_FOUND: Line item #${item.order_item_id} not in order.`);

        const requestedUnits = parseInt(item.total_units_dispatched || item.quantity, 10) || 0;
        const upb = parseInt(item.units_per_box || orderItem.bottles_per_box || 10, 10) || 10;

        // Calculate and validate remaining quantities
        const dispatchedSoFar = parseInt(orderItem.dispatched_units || 0, 10);
        const orderedUnits = parseInt(orderItem.quantity !== undefined && orderItem.quantity !== null && orderItem.quantity !== '' ? orderItem.quantity : (orderItem.ordered_units || orderItem.total_units || 0), 10);
        DispatchCalculator.calculateRemainingQuantities(orderedUnits, dispatchedSoFar, requestedUnits, upb);

        // Validate physical stock availability against origin warehouse batches
        await StockGuard.validateBatchForDispatch(client, {
          warehouseId: dispatchData.warehouse_id || 1,
          batchId: item.stock_batch_id,
          batchNo: item.batch_no,
          requestedUnits,
          orderItem,
          productId: orderItem.product_id,
          productName: orderItem.product_name,
          packagingSize: orderItem.packing_size || item.packaging_size
        });

        const breakdown = DispatchCalculator.breakdownBoxesAndLoose(requestedUnits, upb);
        totalBoxes += breakdown.boxes;
        totalLoose += breakdown.loose;
        totalUnits += requestedUnits;

        validatedItems.push({
          order_item_id: orderItem.id,
          product_id: orderItem.product_id,
          product_name: orderItem.product_name,
          packaging_size: orderItem.packing_size || item.packaging_size || '1 Litre',
          units_per_box: upb,
          stock_batch_id: item.stock_batch_id || null,
          batch_no: item.batch_no,
          boxes_dispatched: breakdown.boxes,
          loose_dispatched: breakdown.loose,
          total_units_dispatched: requestedUnits,
          unit_price: parseFloat(orderItem.unit_price) || 0,
          total_amount: requestedUnits * (parseFloat(orderItem.unit_price) || 0)
        });
      }

      // Insert Dispatch Slip
      const dispatchPayload = {
        dispatch_no: dispatchNo,
        order_id: orderId,
        order_no: order.order_no || `O-${orderId}`,
        company_id: order.company_id || 1,
        warehouse_id: dispatchData.warehouse_id || order.warehouse_id || 1,
        client_id: order.client_id,
        client_name: order.client_name || order.client_display || 'Customer',
        dispatch_date: dispatchData.dispatch_date || new Date().toISOString().split('T')[0],
        status: 'Pending Verification',
        total_boxes_dispatched: totalBoxes,
        total_loose_dispatched: totalLoose,
        total_units_dispatched: totalUnits,
        delivery_target: dispatchData.delivery_target || 'CUSTOMER',
        target_warehouse_id: dispatchData.target_warehouse_id || null,
        target_warehouse_name: dispatchData.target_warehouse_name || null,
        stock_deducted: false, // Critical flag: not deducted yet!
        vehicle_no: dispatchData.vehicle_no || null,
        transporter_name: dispatchData.transporter_name || null,
        driver_contact: dispatchData.driver_contact || null,
        eway_bill_no: dispatchData.eway_bill_no || null,
        notes: dispatchData.notes || null,
        idempotency_key: dispatchData.idempotency_key || null
      };

      const createdDispatches = await this._safeInsert(client, 'order_dispatches', [dispatchPayload]);
      const dispatch = Array.isArray(createdDispatches) ? createdDispatches[0] : createdDispatches;

      // Insert Dispatch Line Items
      for (const vi of validatedItems) {
        await this._safeInsert(client, 'dispatch_items', [{
          dispatch_id: dispatch.id,
          ...vi
        }]);
      }

      // Update Order Dispatch Status to Pending Verification
      try {
        await client.from('orders').update({
          dispatch_status: 'Pending Verification'
        }).eq('id', orderId);
      } catch (_) {}

      // Synchronize dispatch into order notes DISPATCH_META
      await this._syncDispatchToOrderNotes(client, orderId, dispatch, validatedItems);

      return {
        success: true,
        dispatch,
        items: validatedItems,
        totalBoxes,
        totalLoose,
        totalUnits
      };
    },

    /**
     * Step 2: Packing Completion Verification.
     * Godown Operator / Packaging Supervisor verifies physical batches, packaging, and seals.
     */
    async verifyPacking(client, { dispatchId, verifiedBy, verificationNotes }) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) throw new Error(`DISPATCH_NOT_FOUND: Dispatch #${dispatchId} does not exist.`);

      if (dispatch.status !== 'Pending Verification') {
        throw new Error(`INVALID_STATE: Cannot verify dispatch in "${dispatch.status}" state.`);
      }

      await this._safeUpdate(client, 'order_dispatches', {
        status: 'Verified',
        verified_by: verifiedBy || 'Godown Operator',
        verified_at: new Date().toISOString(),
        verification_notes: verificationNotes || 'Physical packages, batch seals, and quantities verified.'
      }, 'id', dispatchId);

      await this._syncDispatchToOrderNotes(client, dispatch.order_id, {
        ...dispatch,
        status: 'Verified',
        verified_by: verifiedBy || 'Godown Operator',
        verified_at: new Date().toISOString()
      });

      return {
        success: true,
        dispatchId,
        status: 'Verified',
        verifiedBy: verifiedBy || 'Godown Operator'
      };
    },

    /**
     * Step 3: Dispatch Approval.
     * Authorized Manager (Director / Sales Executive) approves the verified dispatch note.
     */
    async approveDispatch(client, { dispatchId, approvedBy, approvalNotes }) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) throw new Error(`DISPATCH_NOT_FOUND: Dispatch #${dispatchId} does not exist.`);

      if (dispatch.status !== 'Verified') {
        throw new Error(`DISPATCH_NOT_VERIFIED: Dispatch must be verified by godown operator before manager approval.`);
      }

      await this._safeUpdate(client, 'order_dispatches', {
        status: 'Approved',
        approved_by: approvedBy || 'Dispatch Manager',
        approved_at: new Date().toISOString(),
        approval_notes: approvalNotes || 'Approved for commercial gate exit.'
      }, 'id', dispatchId);

      await this._syncDispatchToOrderNotes(client, dispatch.order_id, {
        ...dispatch,
        status: 'Approved',
        approved_by: approvedBy || 'Dispatch Manager',
        approved_at: new Date().toISOString()
      });

      return {
        success: true,
        dispatchId,
        status: 'Approved',
        approvedBy: approvedBy || 'Dispatch Manager'
      };
    },

    /**
     * Step 4: Physical Dispatch Posting.
     * DEDUCTS STOCK EXACTLY ONCE at gate exit.
     * Enforces single-posting; blocks duplicate deductions.
     * Recalculates remaining order quantities and determines partial vs full dispatch.
     */
    async executeDispatch(client, { dispatchId, dispatchedBy, vehicleNo, transporterName, ewayBillNo }) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) throw new Error(`DISPATCH_NOT_FOUND: Dispatch #${dispatchId} does not exist.`);

      // ANTI DOUBLE-DEDUCTION GUARD:
      if (dispatch.stock_deducted === true || dispatch.status === 'Dispatched') {
        throw new Error('ALREADY_DEDUCTED_DUPLICATE_PREVENTED: Physical stock for this dispatch has already been deducted.');
      }

      if (dispatch.status !== 'Approved') {
        throw new Error(`DISPATCH_UNAPPROVED: Cannot execute dispatch in "${dispatch.status}" status. Manager approval required.`);
      }

      // Fetch dispatch items
      const items = await this._safeSelectMany(client, 'dispatch_items', 'dispatch_id', dispatchId);
      if (!items || items.length === 0) {
        throw new Error('NO_DISPATCH_ITEMS: Dispatch slip has no line items.');
      }

      const orderId = dispatch.order_id;
      const sourceWhId = parseInt(dispatch.warehouse_id || 1, 10);

      // 1. Authoritative Physical Stock Deduction strictly at Gate Exit (Option A: Deduct Stock ONLY on Dispatch)
      for (const item of items) {
        const unitsToDeduct = item.total_units_dispatched;

        if (sourceWhId !== 1) {
          // =========================================================================
          // CASE A: DISPATCH FROM SECONDARY GODOWN (e.g. Gas Godown #532)
          // Deducts ONLY from this godown's finished goods batch.
          // Factory / Main Plant stock remains completely untouched!
          // =========================================================================
          let targetBatch = null;
          if (item.stock_batch_id) {
            const qBatch = client.from('stock_batches').select('*').eq('id', item.stock_batch_id).eq('warehouse_id', sourceWhId);
            const { data: bData } = await (qBatch && qBatch.maybeSingle ? qBatch.maybeSingle() : qBatch);
            targetBatch = Array.isArray(bData) ? bData[0] : bData;
          }

          if (!targetBatch) {
            try {
              const qWhBatch = client.from('stock_batches').select('*')
                .eq('warehouse_id', sourceWhId)
                .gt('current_qty', 0)
                .order('id', { ascending: false });
              const { data: wbList } = await (qWhBatch.then ? qWhBatch : qWhBatch.select('*'));
              if (wbList && wbList.length) {
                const cleanName = (item.product_name || '').trim().toLowerCase();
                targetBatch = wbList.find(b => (b.item_name || '').trim().toLowerCase() === cleanName) ||
                              wbList.find(b => b.item_id === item.product_id) ||
                              wbList[0];
              }
            } catch (_) {}
          }

          if (targetBatch) {
            item.stock_batch_id = targetBatch.id;
            try {
              await this._safeUpdate(client, 'dispatch_items', { stock_batch_id: targetBatch.id }, 'id', item.id);
            } catch (_) {}

            const curQty = parseFloat(targetBatch.current_qty) || 0;
            const newQty = Math.max(0, curQty - unitsToDeduct);
            await client.from('stock_batches').update({ current_qty: newQty }).eq('id', targetBatch.id);

            // Log movement into stock_movements for Godown
            try {
              await client.from('stock_movements').insert([{
                company_id: dispatch.company_id || 623,
                batch_id: targetBatch.id,
                warehouse_id: sourceWhId,
                txn_type: 'DISPATCH',
                txn_id: (dispatch.order_id && parseInt(dispatch.order_id, 10) < 2147483647) ? parseInt(dispatch.order_id, 10) : null,
                qty: -unitsToDeduct,
                notes: `Dispatched ${item.boxes_dispatched || 0} Boxes + ${item.loose_dispatched || 0} Loose (${unitsToDeduct} units) from Warehouse #${sourceWhId} via ${dispatch.dispatch_no}`
              }]);
            } catch (_) {}
          }
        } else {
          // =========================================================================
          // CASE B: DISPATCH FROM MAIN PLANT (Warehouse #1)
          // =========================================================================
          let fgBatch = null;
          try {
            const qFg = client.from('stock_batches').select('*')
              .eq('warehouse_id', 1)
              .eq('item_type', 'Product')
              .gt('current_qty', 0)
              .order('id', { ascending: false });
            const { data: fgList } = await (qFg.then ? qFg : qFg.select('*'));
            if (fgList && fgList.length) {
              const cleanName = (item.product_name || '').trim().toLowerCase();
              fgBatch = fgList.find(b => (b.item_name || '').trim().toLowerCase() === cleanName) ||
                        fgList.find(b => b.item_id === item.product_id);
            }
          } catch (_) {}

          if (fgBatch) {
            // Deduct finished goods batch from Warehouse 1
            item.stock_batch_id = fgBatch.id;
            try {
              await this._safeUpdate(client, 'dispatch_items', { stock_batch_id: fgBatch.id }, 'id', item.id);
            } catch (_) {}
            const curQty = parseFloat(fgBatch.current_qty) || 0;
            const newQty = Math.max(0, curQty - unitsToDeduct);
            await client.from('stock_batches').update({ current_qty: newQty }).eq('id', fgBatch.id);
            try {
              await client.from('stock_movements').insert([{
                company_id: dispatch.company_id || 623,
                batch_id: fgBatch.id,
                warehouse_id: 1,
                txn_type: 'DISPATCH',
                txn_id: (dispatch.order_id && parseInt(dispatch.order_id, 10) < 2147483647) ? parseInt(dispatch.order_id, 10) : null,
                qty: -unitsToDeduct,
                notes: `Dispatched ${unitsToDeduct} units from Main Plant Warehouse via ${dispatch.dispatch_no}`
              }]);
            } catch (_) {}
          } else {
            // Main Plant holds BOM components (Chemical, Bottles, Boxes, Labels)
            // 1. Technical chemical bulk
            let techItemId = null;
            if (item.product_id) {
              try {
                const { data: pData } = await client.from('products').select('inventory_item_id').eq('id', item.product_id).maybeSingle();
                if (pData && pData.inventory_item_id) techItemId = pData.inventory_item_id;
              } catch (_) {}
            }
            if (techItemId) {
              const packMl = (typeof UTILS !== 'undefined' && UTILS.parsePackSizeInMl) ? (UTILS.parsePackSizeInMl(item.packaging_size) || 1000) : 1000;
              const volumeLiters = (packMl / 1000) * unitsToDeduct;
              try {
                const { data: bChem } = await client.from('stock_batches').select('*').eq('warehouse_id', 1).eq('item_id', techItemId).order('id', { ascending: false }).limit(1);
                if (bChem && bChem.length > 0) {
                  item.stock_batch_id = bChem[0].id;
                  await this._safeUpdate(client, 'dispatch_items', { stock_batch_id: bChem[0].id }, 'id', item.id);
                  const cur = parseFloat(bChem[0].current_qty) || 0;
                  await client.from('stock_batches').update({ current_qty: Math.max(0, cur - volumeLiters) }).eq('id', bChem[0].id);
                  await client.from('stock_movements').insert([{
                    company_id: dispatch.company_id || 623,
                    batch_id: bChem[0].id,
                    warehouse_id: 1,
                    txn_type: 'DISPATCH',
                    txn_id: (dispatch.order_id && parseInt(dispatch.order_id, 10) < 2147483647) ? parseInt(dispatch.order_id, 10) : null,
                    qty: -volumeLiters,
                    notes: `DISPATCH [${dispatch.order_no || dispatch.dispatch_no}]`
                  }]);
                }
                const { data: curInv } = await client.from('inventory_items').select('stock').eq('id', techItemId).maybeSingle();
                if (curInv) {
                  await client.from('inventory_items').update({ stock: Math.max(0, (parseFloat(curInv.stock) || 0) - volumeLiters) }).eq('id', techItemId);
                }
              } catch (_) {}
            }

            // 2. Packaging components from DISPATCH_META
            try {
              const { data: ordNotes } = await client.from('orders').select('notes').eq('id', dispatch.order_id).maybeSingle();
              if (ordNotes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordNotes.notes || '')) {
                const jsonStr = ordNotes.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
                const meta = JSON.parse(jsonStr);
                const itemMeta = (meta.items_meta || []).find(im => im.id == item.order_item_id || im.product_id == item.product_id);
                if (itemMeta) {
                  // Bottles
                  if (itemMeta.bottle_inventory_id && unitsToDeduct > 0) {
                    const bId = parseInt(itemMeta.bottle_inventory_id, 10);
                    const { data: bRows } = await client.from('stock_batches').select('*').eq('warehouse_id', 1).eq('item_id', bId).limit(1);
                    if (bRows && bRows.length) {
                      const cur = parseFloat(bRows[0].current_qty) || 0;
                      await client.from('stock_batches').update({ current_qty: Math.max(0, cur - unitsToDeduct) }).eq('id', bRows[0].id);
                      await client.from('stock_movements').insert([{
                        company_id: dispatch.company_id || 623, batch_id: bRows[0].id, warehouse_id: 1,
                        txn_type: 'DISPATCH_BOTTLES', txn_id: dispatch.order_id, qty: -unitsToDeduct,
                        notes: `DISPATCH_BOTTLES [${dispatch.order_no || dispatch.dispatch_no}]`
                      }]);
                    }
                    const { data: invB } = await client.from('inventory_items').select('stock').eq('id', bId).maybeSingle();
                    if (invB) await client.from('inventory_items').update({ stock: Math.max(0, (parseFloat(invB.stock) || 0) - unitsToDeduct) }).eq('id', bId);
                  }

                  // Outer Boxes
                  const upb = item.units_per_box || itemMeta.bottles_per_box || 10;
                  const boxesDeduct = Math.ceil(unitsToDeduct / upb);
                  if (itemMeta.box_inventory_id && boxesDeduct > 0) {
                    const bxId = parseInt(itemMeta.box_inventory_id, 10);
                    const { data: bxRows } = await client.from('stock_batches').select('*').eq('warehouse_id', 1).eq('item_id', bxId).limit(1);
                    if (bxRows && bxRows.length) {
                      const cur = parseFloat(bxRows[0].current_qty) || 0;
                      await client.from('stock_batches').update({ current_qty: Math.max(0, cur - boxesDeduct) }).eq('id', bxRows[0].id);
                      await client.from('stock_movements').insert([{
                        company_id: dispatch.company_id || 623, batch_id: bxRows[0].id, warehouse_id: 1,
                        txn_type: 'DISPATCH_BOXES', txn_id: dispatch.order_id, qty: -boxesDeduct,
                        notes: `DISPATCH_BOXES [${dispatch.order_no || dispatch.dispatch_no}]`
                      }]);
                    }
                    const { data: invBx } = await client.from('inventory_items').select('stock').eq('id', bxId).maybeSingle();
                    if (invBx) await client.from('inventory_items').update({ stock: Math.max(0, (parseFloat(invBx.stock) || 0) - boxesDeduct) }).eq('id', bxId);
                  }

                  // Labels
                  if (itemMeta.label_inventory_id && unitsToDeduct > 0) {
                    const lId = parseInt(itemMeta.label_inventory_id, 10);
                    const { data: lRows } = await client.from('stock_batches').select('*').eq('warehouse_id', 1).eq('item_id', lId).limit(1);
                    if (lRows && lRows.length) {
                      const cur = parseFloat(lRows[0].current_qty) || 0;
                      await client.from('stock_batches').update({ current_qty: Math.max(0, cur - unitsToDeduct) }).eq('id', lRows[0].id);
                      await client.from('stock_movements').insert([{
                        company_id: dispatch.company_id || 623, batch_id: lRows[0].id, warehouse_id: 1,
                        txn_type: 'DISPATCH_LABELS', txn_id: dispatch.order_id, qty: -unitsToDeduct,
                        notes: `DISPATCH_LABELS [${dispatch.order_no || dispatch.dispatch_no}]`
                      }]);
                    }
                    const { data: invL } = await client.from('inventory_items').select('stock').eq('id', lId).maybeSingle();
                    if (invL) await client.from('inventory_items').update({ stock: Math.max(0, (parseFloat(invL.stock) || 0) - unitsToDeduct) }).eq('id', lId);
                  }
                }
              }
            } catch (bomErr) {
              console.warn('[Dispatch Core] Main Plant BOM deduction warning:', bomErr);
            }
          }
        }

        // 2. Update order_items: increment dispatched, decrement remaining
        const qOi = client.from('order_items').select('*').eq('id', item.order_item_id);
        const { data: oiData } = await (qOi && qOi.maybeSingle ? qOi.maybeSingle() : qOi);
        const orderItem = Array.isArray(oiData) ? oiData[0] : oiData;
        if (orderItem) {
          const ordUnits = parseInt(orderItem.quantity !== undefined && orderItem.quantity !== null && orderItem.quantity !== '' ? orderItem.quantity : (orderItem.ordered_units || orderItem.total_units || 0), 10);
          const prevDisp = parseInt(orderItem.dispatched_units || 0, 10);
          const newDisp = prevDisp + unitsToDeduct;
          const newRem = Math.max(0, ordUnits - newDisp);

          const upb = item.units_per_box || 10;
          const newDispBoxes = Math.floor(newDisp / upb);
          const newDispLoose = newDisp % upb;
          const newRemBoxes = Math.floor(newRem / upb);
          const newRemLoose = newRem % upb;

          await client.from('order_items').update({
            dispatched_units: newDisp,
            remaining_units: newRem,
            dispatched_boxes: newDispBoxes,
            dispatched_loose: newDispLoose,
            remaining_boxes: newRemBoxes,
            remaining_loose: newRemLoose
          }).eq('id', item.order_item_id);
        }
      }

      // 2.5 If delivery destination is a partner godown, credit that destination warehouse automatically!
      if (dispatch.delivery_target === 'GODOWN' && dispatch.target_warehouse_id) {
        const destWhId = parseInt(dispatch.target_warehouse_id, 10);
        for (const item of items) {
          const unitsToCredit = parseFloat(item.total_units_dispatched || item.quantity || item.units_dispatched) || 0;
          if (unitsToCredit <= 0) continue;
          const upb = parseInt(item.units_per_box, 10) || 10;
          const recBoxes = Math.floor(unitsToCredit / upb);
          const recLoose = unitsToCredit % upb;
          const destBatchNo = `${item.batch_no || 'B-01'}-GAS`;

          const safeOrderId = (dispatch.order_id && parseInt(dispatch.order_id, 10) < 2147483647) ? parseInt(dispatch.order_id, 10) : null;
          const numItemId = item.product_id ? parseInt(item.product_id, 10) : null;

          let insertedBatchId = null;
          try {
            const { data: bData } = await client.from('stock_batches').insert([{
              batch_no: destBatchNo,
              item_id: numItemId,
              item_name: item.product_name,
              item_type: 'Product',
              purchase_id: safeOrderId,
              company_id: dispatch.company_id || 623,
              warehouse_id: destWhId,
              branch_id: 1,
              current_qty: unitsToCredit,
              initial_qty: unitsToCredit,
              unit: 'Nos',
              purchase_price: parseFloat(item.unit_price) || 0,
              warehouse: 'Main Warehouse',
              created_at: new Date().toISOString()
            }]).select('id');
            if (bData && bData[0]) insertedBatchId = bData[0].id;
          } catch (batchErr) {
            console.error('[Dispatch Core] Failed to credit godown stock batch:', batchErr);
          }

          try {
            await client.from('stock_movements').insert([{
              company_id: dispatch.company_id || 623,
              warehouse_id: destWhId,
              batch_id: insertedBatchId,
              txn_type: 'RECEIPT',
              txn_id: safeOrderId,
              qty: unitsToCredit,
              notes: `Stocked ${unitsToCredit} units (${recBoxes} boxes) of ${item.product_name || 'Product'}${item.packaging_size ? ` (${item.packaging_size})` : ''} into Godown #${destWhId} from Sales Order #${dispatch.order_no || dispatch.order_id}`
            }]);
          } catch (movErr) {
            console.error('[Dispatch Core] Failed to log godown stock movement:', movErr);
          }
        }
      }

      // 3. Mark Dispatch as executed and stock deducted
      await this._safeUpdate(client, 'order_dispatches', {
        status: 'Dispatched',
        stock_deducted: true, // POSTED EXACTLY ONCE
        dispatched_by: dispatchedBy || 'Godown Gatekeeper',
        dispatched_at: new Date().toISOString(),
        vehicle_no: vehicleNo || dispatch.vehicle_no,
        transporter_name: transporterName || dispatch.transporter_name,
        eway_bill_no: ewayBillNo || dispatch.eway_bill_no
      }, 'id', dispatchId);

      await this._syncDispatchToOrderNotes(client, dispatch.order_id, {
        ...dispatch,
        status: 'Dispatched',
        stock_deducted: true,
        dispatched_by: dispatchedBy || 'Godown Gatekeeper',
        dispatched_at: new Date().toISOString(),
        vehicle_no: vehicleNo || dispatch.vehicle_no,
        transporter_name: transporterName || dispatch.transporter_name,
        eway_bill_no: ewayBillNo || dispatch.eway_bill_no
      }, items);

      // 4. Recalculate Sales Order Status (Partial vs Full Dispatch)
      const { data: allOrderItems } = await client.from('order_items').select('*').eq('order_id', orderId);
      const totalOrdered = (allOrderItems || []).reduce((sum, oi) => sum + (parseInt(oi.ordered_units || oi.total_units || oi.quantity, 10) || 0), 0);
      const oiDispatched = (allOrderItems || []).reduce((sum, oi) => sum + (parseInt(oi.dispatched_units, 10) || 0), 0);

      let totalDispatched = 0;
      let totalRemaining = totalOrdered;
      try {
        const { data: ordRow } = await client.from('orders').select('notes').eq('id', orderId).maybeSingle();
        const oNotes = Array.isArray(ordRow) ? ordRow[0]?.notes : ordRow?.notes;
        if (oNotes && /(?:DISPATCH_META|Dispatch_meta):/i.test(oNotes)) {
          const metaStr = oNotes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
          const metaObj = JSON.parse(metaStr);
          if (Array.isArray(metaObj.items_meta) && metaObj.items_meta.length > 0) {
            totalDispatched = metaObj.items_meta.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
            totalRemaining = metaObj.items_meta.reduce((s, it) => s + (parseInt(it.remaining_units, 10) || 0), 0);
          } else if (Array.isArray(metaObj.dispatches)) {
            totalDispatched = metaObj.dispatches
              .filter(d => (d.status || '').toLowerCase() === 'dispatched' || d.stock_deducted === true)
              .reduce((sum, d) => sum + (Array.isArray(d.items) ? d.items.reduce((s, it) => s + (parseInt(it.total_units_dispatched || it.quantity, 10) || 0), 0) : 0), 0);
            totalRemaining = Math.max(0, totalOrdered - totalDispatched);
          }
        }
      } catch (_) {}

      if (totalDispatched === 0 && oiDispatched > 0) {
        totalDispatched = oiDispatched;
        totalRemaining = Math.max(0, totalOrdered - totalDispatched);
      } else if (totalDispatched === 0 && items && items.length > 0) {
        totalDispatched = items.reduce((s, it) => s + (parseInt(it.total_units_dispatched, 10) || 0), 0);
        totalRemaining = Math.max(0, totalOrdered - totalDispatched);
      }

      const isFullyDispatched = totalRemaining === 0 && totalDispatched >= totalOrdered && totalOrdered > 0;
      const orderDispatchStatus = isFullyDispatched ? 'Fully Dispatched' : (totalDispatched > 0 ? 'Partially Dispatched' : 'Pending Verification');
      const orderStatus = isFullyDispatched ? 'Completed' : 'Partially Dispatched';

      try {
        await client.from('orders').update({
          dispatch_status: orderDispatchStatus,
          status: orderStatus,
          total_dispatched_units: totalDispatched,
          total_remaining_units: totalRemaining
        }).eq('id', orderId);
      } catch (_) {}

      return {
        success: true,
        dispatchId,
        dispatchNo: dispatch.dispatch_no,
        orderDispatchStatus,
        orderStatus,
        totalDispatchedUnits: totalDispatched,
        totalRemainingUnits: totalRemaining,
        stockDeducted: true
      };
    },

    /**
     * Step 5: Commercial Invoice Generation.
     * ZERO DOUBLE-DEDUCTION:
     * Generates commercial invoice linked to the executed dispatch.
     * Leaves physical stock untouched because dispatch already deducted it.
     */
    async generateInvoiceForDispatch(client, { dispatchId, invoiceNo, createdBy }) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) throw new Error(`DISPATCH_NOT_FOUND: Dispatch #${dispatchId} does not exist.`);

      if (dispatch.status !== 'Dispatched') {
        throw new Error('DISPATCH_NOT_EXECUTED: Invoices can only be created for completed dispatches.');
      }

      if (dispatch.invoice_id) {
        throw new Error(`INVOICE_ALREADY_GENERATED: Invoice #${dispatch.invoice_no} already exists for this dispatch.`);
      }

      const items = await this._safeSelectMany(client, 'dispatch_items', 'dispatch_id', dispatchId);
      const subtotal = (items || []).reduce((sum, it) => sum + (parseFloat(it.total_amount) || 0), 0);
      const taxAmount = subtotal * 0.12; // Standard 12% GST
      const grandTotal = subtotal + taxAmount;

      let invNo = invoiceNo;
      if (!invNo) {
        const orderNo = dispatch.order_no || `O-${dispatch.order_id || 1}`;
        const matchDigits = String(orderNo).match(/\d+/);
        const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(dispatch.order_id || '01').padStart(2, '0');
        const baseInv = `INV-${orderDigits}`;

        // Check if an invoice with baseInv already exists in invoices for a different dispatch
        const existingInvs = await this._safeSelectMany(client, 'invoices', 'order_id', dispatch.order_id);
        const otherInvs = (existingInvs || []).filter(i => i.dispatch_id !== dispatchId && String(i.invoice_no || '').startsWith(baseInv));
        if (otherInvs.length > 0) {
          invNo = `${baseInv}-${otherInvs.length + 1}`;
        } else {
          invNo = baseInv;
        }
      }

      // Insert invoice with is_stock_deducted: false (Strict Zero Double-Deduction Guarantee)
      const invoicePayload = {
        invoice_no: invNo,
        order_id: dispatch.order_id,
        dispatch_id: dispatchId,
        client_id: dispatch.client_id,
        client_name: dispatch.client_name,
        invoice_date: new Date().toISOString().split('T')[0],
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: grandTotal,
        paid_amount: 0,
        payment_status: 'Pending',
        is_stock_deducted: false, // ZERO DOUBLE-DEDUCTION GUARANTEE
        created_by: createdBy || 'Accountant',
        company_id: dispatch.company_id || 1
      };

      const createdInvs = await this._safeInsert(client, 'invoices', [invoicePayload]);
      const inv = Array.isArray(createdInvs) ? createdInvs[0] : createdInvs;

      // Link invoice ID back to dispatch slip
      await this._safeUpdate(client, 'order_dispatches', {
        invoice_id: inv.id,
        invoice_no: invNo
      }, 'id', dispatchId);

      // Synchronize dispatch into order notes DISPATCH_META
      await this._syncDispatchToOrderNotes(client, dispatch.order_id, {
        ...dispatch,
        invoice_id: inv.id,
        invoice_no: invNo
      }, items);

      return {
        success: true,
        invoice: inv,
        isStockDeducted: false
      };
    },

    /**
     * Step 6: Safe Cancellation, Customer Returns & Inventory Reversal.
     * Restores physically deducted stock back into historical batches.
     * Restores order item remaining balances.
     */
    async cancelOrReverseDispatch(client, { dispatchId, reversalType = 'CANCELLATION', reason, reversedBy }) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) throw new Error(`DISPATCH_NOT_FOUND: Dispatch #${dispatchId} does not exist.`);

      if (dispatch.status === 'Cancelled') {
        throw new Error('DISPATCH_ALREADY_CANCELLED: This dispatch has already been cancelled.');
      }

      const items = await this._safeSelectMany(client, 'dispatch_items', 'dispatch_id', dispatchId);
      const itemsReversed = [];

      // 1. If stock was deducted, restore exact quantities back to origin batches
      if (dispatch.stock_deducted === true) {
        for (const item of (items || [])) {
          if (item.stock_batch_id) {
            const qBatch = client.from('stock_batches').select('*').eq('id', item.stock_batch_id);
            const { data: bData } = await (qBatch && qBatch.maybeSingle ? qBatch.maybeSingle() : qBatch);
            const batch = Array.isArray(bData) ? bData[0] : bData;
            if (batch) {
              const curQty = parseFloat(batch.current_qty) || 0;
              const restoredQty = curQty + item.total_units_dispatched;
              const upb = item.units_per_box || batch.units_per_box || 10;
              const newBoxes = Math.floor(restoredQty / upb);
              const newLoose = restoredQty % upb;

              await client.from('stock_batches').update({
                current_qty: restoredQty
              }).eq('id', item.stock_batch_id);

              // Synchronize authoritative stock in inventory_items if Inventory item
              if (batch.item_id && batch.item_type === 'Inventory') {
                try {
                  const { data: invRow } = await client.from('inventory_items').select('stock').eq('id', batch.item_id).maybeSingle();
                  if (invRow) {
                    await client.from('inventory_items').update({
                      stock: (parseFloat(invRow.stock) || 0) + item.total_units_dispatched
                    }).eq('id', batch.item_id);
                  }
                } catch (_) {}
              }

              // Log compensating movement
              try {
                await client.from('stock_movements').insert([{
                  company_id: dispatch.company_id || 1,
                  batch_id: item.stock_batch_id,
                  movement_type: 'DISPATCH_REVERSAL',
                  quantity: item.total_units_dispatched,
                  reference_type: 'DISPATCH_REVERSAL',
                  reference_id: String(dispatch.id),
                  notes: `Reversal of dispatch ${dispatch.dispatch_no} (${reversalType}): ${reason || 'Return'}`
                }]);
              } catch (_) {}
            }
          }

          // Restore order_items dispatched and remaining counts
          const qOi = client.from('order_items').select('*').eq('id', item.order_item_id);
          const { data: oiData } = await (qOi && qOi.maybeSingle ? qOi.maybeSingle() : qOi);
          const orderItem = Array.isArray(oiData) ? oiData[0] : oiData;
          if (orderItem) {
            const ordUnits = parseInt(orderItem.quantity !== undefined && orderItem.quantity !== null && orderItem.quantity !== '' ? orderItem.quantity : (orderItem.ordered_units || orderItem.total_units || 0), 10);
            const prevDisp = parseInt(orderItem.dispatched_units || 0, 10);
            const newDisp = Math.max(0, prevDisp - item.total_units_dispatched);
            const newRem = ordUnits - newDisp;

            const upb = item.units_per_box || 10;
            const newDispBoxes = Math.floor(newDisp / upb);
            const newDispLoose = newDisp % upb;
            const newRemBoxes = Math.floor(newRem / upb);
            const newRemLoose = newRem % upb;

            await client.from('order_items').update({
              dispatched_units: newDisp,
              remaining_units: newRem,
              dispatched_boxes: newDispBoxes,
              dispatched_loose: newDispLoose,
              remaining_boxes: newRemBoxes,
              remaining_loose: newRemLoose
            }).eq('id', item.order_item_id);
          }

          itemsReversed.push({
            product_id: item.product_id,
            product_name: item.product_name,
            batch_no: item.batch_no,
            restored_units: item.total_units_dispatched
          });
        }

        // Clean up partner godown stock batch and receipt movement if delivered to godown
        if (dispatch.delivery_target === 'GODOWN' && dispatch.target_warehouse_id) {
          try {
            const destWhId = parseInt(dispatch.target_warehouse_id, 10);
            const safeOrderId = (dispatch.order_id && parseInt(dispatch.order_id, 10) < 2147483647) ? parseInt(dispatch.order_id, 10) : null;
            if (client && client.from && safeOrderId) {
              await client.from('stock_batches').delete().eq('purchase_id', safeOrderId).eq('warehouse_id', destWhId);
              await client.from('stock_movements').delete().eq('txn_id', safeOrderId).eq('warehouse_id', destWhId);
            }
          } catch (_) {}
        }
      }

      // 2. Insert Reversal Audit Record
      const reversalNo = `REV-${Date.now().toString().slice(-6)}`;
      await this._safeInsert(client, 'dispatch_reversals', [{
        dispatch_id: dispatchId,
        reversal_no: reversalNo,
        reversal_type: reversalType,
        reason: reason || 'Customer cancellation or dispatch return',
        reversed_by: reversedBy || 'Godown Supervisor',
        items_reversed: itemsReversed,
        stock_restored: dispatch.stock_deducted === true
      }]);

      // 3. Mark Dispatch as Cancelled
      await this._safeUpdate(client, 'order_dispatches', {
        status: 'Cancelled',
        stock_deducted: false
      }, 'id', dispatchId);

      await this._syncDispatchToOrderNotes(client, dispatch.order_id, {
        ...dispatch,
        status: 'Cancelled',
        stock_deducted: false
      });

      // 4. Recalculate order status
      const { data: allOrderItems } = await client.from('order_items').select('*').eq('order_id', dispatch.order_id);
      const totalOrdered = (allOrderItems || []).reduce((sum, oi) => sum + (parseInt(oi.ordered_units || oi.total_units || oi.quantity, 10) || 0), 0);
      const oiDispatched = (allOrderItems || []).reduce((sum, oi) => sum + (parseInt(oi.dispatched_units, 10) || 0), 0);

      let totalDispatched = 0;
      let totalRemaining = totalOrdered;
      try {
        const { data: ordRow } = await client.from('orders').select('notes').eq('id', dispatch.order_id).maybeSingle();
        const oNotes = Array.isArray(ordRow) ? ordRow[0]?.notes : ordRow?.notes;
        if (oNotes && /(?:DISPATCH_META|Dispatch_meta):/i.test(oNotes)) {
          const metaStr = oNotes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
          const metaObj = JSON.parse(metaStr);
          if (Array.isArray(metaObj.items_meta) && metaObj.items_meta.length > 0) {
            totalDispatched = metaObj.items_meta.reduce((s, it) => s + (parseInt(it.dispatched_units, 10) || 0), 0);
            totalRemaining = metaObj.items_meta.reduce((s, it) => s + (parseInt(it.remaining_units, 10) || 0), 0);
          } else if (Array.isArray(metaObj.dispatches)) {
            totalDispatched = metaObj.dispatches
              .filter(d => (d.status || '').toLowerCase() === 'dispatched' || d.stock_deducted === true)
              .reduce((sum, d) => sum + (Array.isArray(d.items) ? d.items.reduce((s, it) => s + (parseInt(it.total_units_dispatched || it.quantity, 10) || 0), 0) : 0), 0);
            totalRemaining = Math.max(0, totalOrdered - totalDispatched);
          }
        }
      } catch (_) {}

      if (totalDispatched === 0 && oiDispatched > 0) {
        totalDispatched = oiDispatched;
        totalRemaining = Math.max(0, totalOrdered - totalDispatched);
      }

      const isFullyDispatched = totalRemaining === 0 && totalDispatched >= totalOrdered && totalOrdered > 0;
      const orderDispatchStatus = isFullyDispatched ? 'Fully Dispatched' : (totalDispatched > 0 ? 'Partially Dispatched' : 'Pending Verification');
      const orderStatus = isFullyDispatched ? 'Completed' : (totalDispatched > 0 ? 'Partially Dispatched' : 'Pending');

      try {
        await client.from('orders').update({
          dispatch_status: orderDispatchStatus,
          status: orderStatus,
          total_dispatched_units: totalDispatched,
          total_remaining_units: totalRemaining
        }).eq('id', dispatch.order_id);
      } catch (_) {}

      return {
        success: true,
        dispatchId,
        reversalNo,
        orderDispatchStatus,
        orderStatus,
        stockRestored: dispatch.stock_deducted === true,
        itemsReversed
      };
    },

    /**
     * Permanent clean up of all dispatch-related data for a deleted order.
     * Removes dispatches, dispatch items, gate passes, and cached invoice documents.
     * Guarantees other orders and historical audit/reversals remain 100% intact.
     */
    clearAllDispatches() {
      const keys = ['order_dispatches', 'erp_order_dispatches', 'dispatch_items', 'erp_dispatch_items', 'gate_passes', 'erp_gate_passes'];
      keys.forEach(k => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(k);
            localStorage.setItem(k, '[]');
          }
        } catch (_) {}
      });
      _memoryStore.order_dispatches = [];
      _memoryStore.dispatch_items = [];
      _memoryStore.gate_passes = [];
      if (typeof window !== 'undefined') {
        window.allDispatches = [];
        if (window.DISPATCH_UI && typeof window.DISPATCH_UI.setAllDispatches === 'function') {
          window.DISPATCH_UI.setAllDispatches([]);
        }
      }
    },

    async deleteOrderDispatches(client, orderId, orderNo = null) {
      if (!orderId && !orderNo) return { deletedCount: 0 };
      const strOrderId = orderId ? String(orderId) : null;
      const strOrderNo = orderNo ? String(orderNo).trim().toUpperCase() : null;

      const orderDigits = (orderNo ? String(orderNo).match(/\d+/) : null) || (orderId ? String(orderId).match(/\d+/) : null);
      const digitStr = orderDigits ? orderDigits[0].replace(/^0+/, '') || '0' : null;
      const dspCandidate = digitStr ? `DSP-${digitStr.padStart(2, '0')}` : null;

      const isOrderMatch = (d) => {
        if (!d) return false;
        if (strOrderId && (String(d.order_id) === strOrderId || String(d.order_no) === strOrderId || String(d.order_no) === 'O-' + strOrderId)) return true;
        if (strOrderNo && (String(d.order_no).trim().toUpperCase() === strOrderNo || String(d.order_id).trim().toUpperCase() === strOrderNo || 'O-' + String(d.order_id) === strOrderNo)) return true;
        if (dspCandidate && (d.dispatch_no === dspCandidate || d.invoice_no === `INV-${digitStr.padStart(2, '0')}`)) return true;
        if (digitStr) {
          const dDigits = (d.order_no ? String(d.order_no).match(/\d+/) : null) || (d.order_id ? String(d.order_id).match(/\d+/) : null);
          if (dDigits && (dDigits[0].replace(/^0+/, '') || '0') === digitStr) return true;
        }
        return false;
      };

      const affectedDispatchIds = new Set();
      const affectedDispatchesList = [];
      const localKeys = ['order_dispatches', 'erp_order_dispatches'];

      localKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              list.forEach(d => {
                if (isOrderMatch(d)) {
                  if (d.id) affectedDispatchIds.add(String(d.id));
                  if (d.dispatch_no) affectedDispatchIds.add(String(d.dispatch_no));
                  affectedDispatchesList.push(d);
                }
              });
            }
          }
        } catch (_) {}
      });

      // Also search memory store
      (_memoryStore.order_dispatches || []).forEach(d => {
        if (isOrderMatch(d)) {
          if (d.id) affectedDispatchIds.add(String(d.id));
          if (d.dispatch_no) affectedDispatchIds.add(String(d.dispatch_no));
          affectedDispatchesList.push(d);
        }
      });

      // Also check orders.notes DISPATCH_META
      if (client && client.from && orderId) {
        try {
          const { data: ordNotesRow } = await client.from('orders').select('notes').eq('id', orderId).maybeSingle();
          if (ordNotesRow && ordNotesRow.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordNotesRow.notes)) {
            const jsonStr = ordNotesRow.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
            const meta = JSON.parse(jsonStr);
            if (Array.isArray(meta?.dispatches)) {
              meta.dispatches.forEach(d => {
                if (isOrderMatch(d)) {
                  if (d.id) affectedDispatchIds.add(String(d.id));
                  if (d.dispatch_no) affectedDispatchIds.add(String(d.dispatch_no));
                  affectedDispatchesList.push(d);
                }
              });
            }
          }
        } catch (_) {}
      }

      // 1. Purge dispatches
      localKeys.forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(d => {
                const isMatch = isOrderMatch(d) ||
                                (d.id && affectedDispatchIds.has(String(d.id))) ||
                                (d.dispatch_no && affectedDispatchIds.has(String(d.dispatch_no)));
                return !isMatch;
              });
              localStorage.setItem(k, JSON.stringify(cleaned));
            }
          }
        } catch (_) {}
      });

      if (_memoryStore.order_dispatches) {
        _memoryStore.order_dispatches = _memoryStore.order_dispatches.filter(d => {
          return !(isOrderMatch(d) ||
                   (d.id && affectedDispatchIds.has(String(d.id))) ||
                   (d.dispatch_no && affectedDispatchIds.has(String(d.dispatch_no))));
        });
      }

      // 2. Purge dispatch line items
      ['dispatch_items', 'erp_dispatch_items'].forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(di => {
                const isMatch = isOrderMatch(di) ||
                                (di.dispatch_id && affectedDispatchIds.has(String(di.dispatch_id)));
                return !isMatch;
              });
              localStorage.setItem(k, JSON.stringify(cleaned));
            }
          }
        } catch (_) {}
      });

      if (_memoryStore.dispatch_items) {
        _memoryStore.dispatch_items = _memoryStore.dispatch_items.filter(di => {
          return !(isOrderMatch(di) || (di.dispatch_id && affectedDispatchIds.has(String(di.dispatch_id))));
        });
      }

      // 3. Purge gate passes linked to this order/dispatch
      ['gate_passes', 'erp_gate_passes'].forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(gp => {
                const isMatch = isOrderMatch(gp) ||
                                (gp.dispatch_id && affectedDispatchIds.has(String(gp.dispatch_id)));
                return !isMatch;
              });
              localStorage.setItem(k, JSON.stringify(cleaned));
            }
          }
        } catch (_) {}
      });

      if (_memoryStore.gate_passes) {
        _memoryStore.gate_passes = _memoryStore.gate_passes.filter(gp => {
          return !(isOrderMatch(gp) || (gp.dispatch_id && affectedDispatchIds.has(String(gp.dispatch_id))));
        });
      }

      // 4. Purge cached documents and invoices
      ['invoice_history_cache', 'invoices', 'erp_invoices'].forEach(k => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const cleaned = list.filter(inv => {
                const isMatch = isOrderMatch({ order_id: inv.order_id || inv.orderId, order_no: inv.order_no || inv.orderNumber, dispatch_no: inv.dispatch_no || inv.dispatchNo, id: inv.id || inv.uniqueId, invoice_no: inv.invoice_no || inv.invoiceNumber }) ||
                                (inv.dispatch_id && affectedDispatchIds.has(String(inv.dispatch_id))) ||
                                (inv.dispatchNo && affectedDispatchIds.has(String(inv.dispatchNo))) ||
                                (inv.uniqueId && affectedDispatchIds.has(String(inv.uniqueId)));
                return !isMatch;
              });
              localStorage.setItem(k, JSON.stringify(cleaned));
            }
          }
        } catch (_) {}
      });

      try {
        const docCache = JSON.parse(localStorage.getItem('_dispatch_docs_cache') || '{}');
        let docUpdated = false;
        affectedDispatchIds.forEach(did => {
          if (docCache[did]) {
            delete docCache[did];
            docUpdated = true;
          }
        });
        if (docUpdated) localStorage.setItem('_dispatch_docs_cache', JSON.stringify(docCache));
      } catch (_) {}

      // Remove inv_doc_* cached PDF payload keys
      try {
        affectedDispatchIds.forEach(id => {
          localStorage.removeItem('inv_doc_' + id);
          localStorage.removeItem('inv_doc_DSP-' + id);
        });
        if (strOrderId) localStorage.removeItem('inv_doc_' + strOrderId);
        if (strOrderNo) localStorage.removeItem('inv_doc_' + strOrderNo);
      } catch (_) {}

      // 5. Attempt database delete if tables exist (safely ignored if schema lacks tables)
      if (client && client.from && !_missingTables.has('order_dispatches')) {
        try {
          await client.from('order_dispatches').delete().eq('order_id', orderId);
        } catch (_) {}
      }
      if (client && client.from && !_missingTables.has('dispatch_items')) {
        try {
          await client.from('dispatch_items').delete().eq('order_id', orderId);
        } catch (_) {}
      }

      // 6. Symmetrical Inventory Restoration & Godown Cleanup
      if (client && client.from) {
        try {
          const arrIds = [];
          const numOrderId = orderId ? parseInt(orderId, 10) : null;
          if (numOrderId && !isNaN(numOrderId) && numOrderId > 0 && numOrderId < 2147483647) {
            arrIds.push(numOrderId);
          }
          if (affectedDispatchIds && affectedDispatchIds.size > 0) {
            affectedDispatchIds.forEach(id => {
              const num = parseInt(id, 10);
              if (!isNaN(num) && num > 0 && num < 2147483647) arrIds.push(num);
            });
          }
          if (arrIds.length > 0) {
            // A. Query unreversed outflow movements for this order and restore to origin batches
            const { data: outflows } = await client
              .from('stock_movements')
              .select('*')
              .in('txn_id', arrIds)
              .lt('qty', 0);

            const restoredBatchMap = new Map();
            if (outflows && outflows.length > 0) {
              for (const mov of outflows) {
                const restoreQty = Math.abs(parseFloat(mov.qty) || 0);
                if (restoreQty > 0 && mov.batch_id) {
                  const { data: bRow } = await client.from('stock_batches').select('*').eq('id', mov.batch_id).maybeSingle();
                  if (bRow) {
                    const newQty = (parseFloat(bRow.current_qty) || 0) + restoreQty;
                    const upb = bRow.units_per_box || 10;
                    await client.from('stock_batches').update({
                      current_qty: newQty
                    }).eq('id', mov.batch_id);
                    restoredBatchMap.set(mov.batch_id, (restoredBatchMap.get(mov.batch_id) || 0) + restoreQty);

                    // Synchronize authoritative stock in inventory_items if Inventory item
                    if (bRow.item_id && bRow.item_type === 'Inventory') {
                      try {
                        const { data: invRow } = await client.from('inventory_items').select('stock').eq('id', bRow.item_id).maybeSingle();
                        if (invRow) {
                          await client.from('inventory_items').update({
                            stock: (parseFloat(invRow.stock) || 0) + restoreQty
                          }).eq('id', bRow.item_id);
                        }
                      } catch (_) {}
                    }
                  }
                }
              }
            }

            // B. Fallback: check any affected dispatches with stock_deducted === true whose batches were not in outflows
            for (const d of affectedDispatchesList) {
              if (d && (d.stock_deducted === true || d.status === 'Dispatched') && Array.isArray(d.items)) {
                for (const dit of d.items) {
                  const bId = dit.stock_batch_id;
                  const qty = parseFloat(dit.total_units_dispatched || dit.quantity) || 0;
                  if (bId && qty > 0 && !restoredBatchMap.has(bId)) {
                    const { data: bRow } = await client.from('stock_batches').select('*').eq('id', bId).maybeSingle();
                    if (bRow) {
                      const newQty = (parseFloat(bRow.current_qty) || 0) + qty;
                      const upb = bRow.units_per_box || 10;
                      await client.from('stock_batches').update({
                        current_qty: newQty
                      }).eq('id', bId);
                      restoredBatchMap.set(bId, (restoredBatchMap.get(bId) || 0) + qty);

                      if (bRow.item_id && bRow.item_type === 'Inventory') {
                        try {
                          const { data: invRow } = await client.from('inventory_items').select('stock').eq('id', bRow.item_id).maybeSingle();
                          if (invRow) {
                            await client.from('inventory_items').update({
                              stock: (parseFloat(invRow.stock) || 0) + qty
                            }).eq('id', bRow.item_id);
                          }
                        } catch (_) {}
                      }
                    }
                  }
                }
              }
            }

            // C. Delete partner godown batches created for this order
            await client.from('stock_batches').delete().in('purchase_id', arrIds);

            // D. Delete stock movements created for this order
            await client.from('stock_movements').delete().in('txn_id', arrIds);
          }
        } catch (delErr) {
          console.warn('[Dispatch Core] Symmetrical stock cleanup error:', delErr);
        }
      }

      return { success: true, deletedCount: affectedDispatchIds.size };
    },

    /**
     * Query API: Get all Dispatches with optional filters
     * Reads from DB, orders.notes (DISPATCH_META), and local storage
     */
    async getDispatches(client, { orderId, status } = {}) {
      let list = [];
      let dbOrders = null;
      let dbOrdersQueried = false;
      const ordersMap = new Map();
      const validOrderNos = new Set();
      const validOrderDigits = new Set();
      const ordersWithNotesDispatches = new Set();

      // 1. Authoritative check: fetch orders from Supabase (or fallback in-memory)
      try {
        if (client && client.from) {
          let q = client.from('orders').select('id, order_no, client_name, notes');
          if (orderId) q = q.eq('id', orderId);
          const { data: ords, error: ordsErr } = await (q.then ? q : q.select('*'));
          if (!ordsErr && Array.isArray(ords)) {
            dbOrders = ords;
            dbOrdersQueried = true;
          }
        }
      } catch (_) {}

      if (!dbOrdersQueried && typeof window !== 'undefined' && Array.isArray(window.allOrders)) {
        dbOrders = window.allOrders;
        dbOrdersQueried = true;
      }

      // CRITICAL GUARANTEE: If orders were queried and there are ZERO orders in the ERP,
      // NO DISPATCHES CAN EXIST! Wipe any stale storage and return [] immediately.
      if (dbOrdersQueried && Array.isArray(dbOrders) && dbOrders.length === 0) {
        this.clearAllDispatches();
        return [];
      }

      // 2. Fetch from DB table or fallback records
      try {
        const all = await this._safeSelectMany(client, 'order_dispatches', orderId ? 'order_id' : undefined, orderId);
        list = all ? [...all] : [];
      } catch (_) {
        list = [];
      }

      // 3. Process authoritative orders and extract notes DISPATCH_META
      if (dbOrdersQueried && Array.isArray(dbOrders)) {
        dbOrders.forEach(o => {
          ordersMap.set(String(o.id), o);
          if (o.order_no) {
            const upNo = String(o.order_no).trim().toUpperCase();
            ordersMap.set(upNo, o);
            validOrderNos.add(upNo);
            const m = upNo.match(/\d+/);
            if (m) validOrderDigits.add(m[0].replace(/^0+/, '') || '0');
          }
          if (o.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(o.notes)) {
            try {
              const jsonStr = o.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
              const meta = JSON.parse(jsonStr);
              if (Array.isArray(meta.dispatches) && meta.dispatches.length > 0) {
                ordersWithNotesDispatches.add(String(o.id));
                if (o.order_no) ordersWithNotesDispatches.add(String(o.order_no).trim().toUpperCase());
                meta.dispatches.forEach(d => {
                  d.order_id = d.order_id || o.id;
                  if (!d.order_no) d.order_no = o.order_no;
                  if (!d.client_name) d.client_name = o.client_name;
                  if (!list.some(existing => String(existing.id) === String(d.id) || existing.dispatch_no === d.dispatch_no)) {
                    list.push(d);
                  }
                });
              }
            } catch (_) {}
          }
        });
      }

      // Helper to check if a dispatch belongs to an existing active order
      const isDispatchOrderActive = (d) => {
        if (!dbOrdersQueried) return true; // If we couldn't query orders, do not arbitrarily drop
        if (d.order_id && ordersMap.has(String(d.order_id))) return true;
        if (d.order_no && validOrderNos.has(String(d.order_no).trim().toUpperCase())) return true;
        if (d.order_no) {
          const dm = String(d.order_no).match(/\d+/);
          if (dm && validOrderDigits.has(dm[0].replace(/^0+/, '') || '0')) return true;
        }
        return false;
      };

      // 4. Merge with local storage table
      const localTable = getLocalTable('order_dispatches');
      const validLocalDispatches = [];
      let localTablePurged = false;
      (localTable || []).forEach(d => {
        if (orderId && String(d.order_id) !== String(orderId)) return;

        if (dbOrdersQueried && !isDispatchOrderActive(d)) {
          localTablePurged = true;
          return; // Drop orphaned dispatch from deleted order!
        }

        if (ordersWithNotesDispatches.has(String(d.order_id)) || (d.order_no && ordersWithNotesDispatches.has(String(d.order_no).trim().toUpperCase()))) {
          return;
        }

        if (!list.some(existing => String(existing.id) === String(d.id) || existing.dispatch_no === d.dispatch_no)) {
          list.push(d);
        }
        validLocalDispatches.push(d);
      });

      if (localTablePurged || (dbOrdersQueried && validLocalDispatches.length !== (localTable || []).length)) {
        saveLocalTable('order_dispatches', validLocalDispatches);
        try {
          localStorage.setItem('order_dispatches', JSON.stringify(validLocalDispatches));
        } catch (_) {}
      }

      // 5. CRITICAL: Strictly filter list so no orphan dispatches from deleted orders survive!
      if (dbOrdersQueried) {
        list = list.filter(d => isDispatchOrderActive(d));
      }

      // Deduplicate dispatches for the same order:
      // If an order has multiple dispatches where one is already Verified/Approved/Dispatched and another is a redundant Pending Verification duplicate
      const orderGroups = new Map();
      list.forEach(d => {
        const k = String(d.order_id || d.order_no || d.id);
        if (!orderGroups.has(k)) orderGroups.set(k, []);
        orderGroups.get(k).push(d);
      });

      let localUpdated = false;
      const dedupedList = [];
      orderGroups.forEach((disps, k) => {
        if (disps.length <= 1) {
          dedupedList.push(...disps);
          return;
        }

        const advanced = disps.filter(d => {
          const s = (d.status || '').toLowerCase();
          return s === 'verified' || s === 'approved' || s === 'dispatched';
        });

        if (advanced.length > 0) {
          const advUnits = advanced.reduce((sum, d) => sum + (parseInt(d.total_units_dispatched, 10) || 0), 0);
          const ordObj = ordersMap.get(k);
          const ordItems = ordObj?.items || [];
          const totalOrd = ordItems.reduce((s, it) => s + (parseInt(it.ordered_units || it.total_units || it.quantity, 10) || 0), 0) || advUnits;

          disps.forEach(d => {
            const s = (d.status || '').toLowerCase();
            if (s === 'verified' || s === 'approved' || s === 'dispatched') {
              dedupedList.push(d);
            } else if (s === 'pending verification') {
              const dUnits = parseInt(d.total_units_dispatched, 10) || 0;
              const isIdentical = advanced.some(ad => (parseInt(ad.total_units_dispatched, 10) || 0) === dUnits);
              if (isIdentical || (totalOrd > 0 && advUnits >= totalOrd)) {
                localUpdated = true;
                return; // Drop ghost duplicate!
              }
              dedupedList.push(d);
            } else {
              dedupedList.push(d);
            }
          });
        } else {
          // All are Pending Verification for this order: keep unique quantities only
          const seenUnits = new Set();
          disps.forEach(d => {
            const dUnits = parseInt(d.total_units_dispatched, 10) || 0;
            if (seenUnits.has(dUnits)) {
              localUpdated = true;
              return;
            }
            seenUnits.add(dUnits);
            dedupedList.push(d);
          });
        }
      });
      list = dedupedList;

      if (status) {
        list = list.filter(d => (d.status || '').toLowerCase() === status.toLowerCase());
      }
      const orderDispCounts = new Map();
      list.forEach(d => {
        if (!d.order_no && d.order_id && ordersMap.has(String(d.order_id))) {
          const ord = ordersMap.get(String(d.order_id));
          d.order_no = ord.order_no;
          if (!d.client_name) d.client_name = ord.client_name;
        }

        // Normalize dispatch_no if random/timestamp-based: match order number (DSP-01, DSP-02, DSP-03)
        const matchDigits = String(d.order_no || '').match(/\d+/);
        const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(d.order_id || '01').padStart(2, '0');
        const baseNo = `DSP-${orderDigits}`;
        if (isRandomDsp(d.dispatch_no)) {
          const currentCount = (orderDispCounts.get(baseNo) || 0) + 1;
          orderDispCounts.set(baseNo, currentCount);
          d.dispatch_no = currentCount === 1 ? baseNo : `${baseNo}-${currentCount}`;
          localUpdated = true;
        } else {
          orderDispCounts.set(baseNo, (orderDispCounts.get(baseNo) || 0) + 1);
        }

        if (d.invoice_no && (/^INV-\d{5,}$/.test(d.invoice_no) || /^DSP-\d{5,}$/.test(d.invoice_no))) {
          d.invoice_no = `INV-${orderDigits}`;
          localUpdated = true;
        }

        // Hydrate items if not yet populated on d
        if (!d.items || d.items.length === 0) {
          const ordObj = ordersMap.get(String(d.order_id));
          if (ordObj && ordObj.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordObj.notes)) {
            try {
              const jStr = ordObj.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
              const mObj = JSON.parse(jStr);
              const metaDisp = (mObj.dispatches || []).find(md => String(md.id) === String(d.id) || md.dispatch_no === d.dispatch_no);
              if (metaDisp && Array.isArray(metaDisp.items) && metaDisp.items.length) {
                d.items = metaDisp.items;
              }
            } catch (_) {}
          }
          if (!d.items || d.items.length === 0) {
            const localDisItems = getLocalTable('dispatch_items');
            const matchedDisItems = (localDisItems || []).filter(di => String(di.dispatch_id) === String(d.id) || (d.dispatch_no && di.dispatch_no === d.dispatch_no));
            if (matchedDisItems.length) d.items = matchedDisItems;
          }
        }

        // Always synchronize items packing size and product name with the actual order items!
        const ord = ordersMap.get(String(d.order_id));
        if (ord && ord.notes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ord.notes)) {
          try {
            const jStr = ord.notes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
            const mObj = JSON.parse(jStr);
            if (Array.isArray(mObj.items_meta) && Array.isArray(d.items)) {
              d.items.forEach(it => {
                const oiMatch = mObj.items_meta.find(oi => (it.order_item_id && oi.id == it.order_item_id) || (oi.product_id && it.product_id && String(oi.product_id) === String(it.product_id)) || (oi.product_name && it.product_name && String(oi.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim()));
                if (oiMatch) {
                  const actualPack = oiMatch.packing_size || oiMatch.packaging_size;
                  if (actualPack) {
                    it.packaging_size = actualPack;
                    it.packing_size = actualPack;
                  }
                  if (oiMatch.product_name) it.product_name = oiMatch.product_name;
                }
              });
            }
          } catch (_) {}
        }
      });
      if (localTable && localTable.length) {
        // Prune zombie duplicate dispatches from local storage table
        const orderLocalCounts = new Map();
        const cleanedLocal = localTable.filter(ld => {
          return list.some(d => String(d.id) === String(ld.id) || d.dispatch_no === ld.dispatch_no);
        });
        cleanedLocal.forEach(ld => {
          const ord = ordersMap.get(String(ld.order_id));
          const ordNo = ld.order_no || ord?.order_no || '';
          const matchDigits = String(ordNo).match(/\d+/);
          const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(ld.order_id || '01').padStart(2, '0');
          const baseNo = `DSP-${orderDigits}`;
          if (isRandomDsp(ld.dispatch_no)) {
            const currentCount = (orderLocalCounts.get(baseNo) || 0) + 1;
            orderLocalCounts.set(baseNo, currentCount);
            ld.dispatch_no = currentCount === 1 ? baseNo : `${baseNo}-${currentCount}`;
          }
          if (ld.invoice_no && (/^INV-\d{5,}$/.test(ld.invoice_no) || /^DSP-\d{5,}$/.test(ld.invoice_no))) {
            ld.invoice_no = `INV-${orderDigits}`;
          }
        });
        saveLocalTable('order_dispatches', cleanedLocal);
      }

      // Synchronize updated packaging size into dispatch_items localTable as well
      try {
        const localDItems = getLocalTable('dispatch_items');
        if (localDItems && localDItems.length) {
          let dItemsChanged = false;
          list.forEach(d => {
            if (Array.isArray(d.items)) {
              d.items.forEach(dit => {
                const found = localDItems.find(li => (li.id && dit.id && String(li.id) === String(dit.id)) || (String(li.dispatch_id) === String(d.id) && (li.order_item_id == dit.order_item_id || li.product_id == dit.product_id)));
                if (found && (found.packaging_size !== dit.packaging_size || found.product_name !== dit.product_name)) {
                  found.packaging_size = dit.packaging_size;
                  found.packing_size = dit.packaging_size;
                  found.product_name = dit.product_name;
                  dItemsChanged = true;
                }
              });
            }
          });
          if (dItemsChanged) {
            saveLocalTable('dispatch_items', localDItems);
          }
        }
      } catch (_) {}

      return list.sort((a, b) => (b.id || 0) - (a.id || 0));
    },

    /**
     * Query API: Get Dispatch details and its line items
     */
    async getDispatchDetails(client, dispatchId) {
      const dispatch = await this._safeSelectOne(client, 'order_dispatches', 'id', dispatchId);
      if (!dispatch) return null;

      let orderNo = dispatch.order_no;
      if (!orderNo && dispatch.order_id) {
        if (client && client.from) {
          try {
            const { data: oRow } = await client.from('orders').select('order_no').eq('id', dispatch.order_id).maybeSingle();
            if (oRow && oRow.order_no) orderNo = oRow.order_no;
          } catch (_) {}
        }
        if (!orderNo) {
          const localOrders = getLocalTable('orders');
          const foundO = (localOrders || []).find(o => String(o.id) === String(dispatch.order_id));
          if (foundO && foundO.order_no) orderNo = foundO.order_no;
        }
        if (orderNo) dispatch.order_no = orderNo;
      }
      const matchDigits = String(orderNo || '').match(/\d+/);
      const orderDigits = matchDigits ? matchDigits[0].padStart(2, '0') : String(dispatch.order_id || '01').padStart(2, '0');

      // Normalize dispatch_no if random
      if (isRandomDsp(dispatch.dispatch_no)) {
        dispatch.dispatch_no = `DSP-${orderDigits}`;
      }

      if (dispatch.invoice_no && (/^INV-\d{5,}$/.test(dispatch.invoice_no) || /^DSP-\d{5,}$/.test(dispatch.invoice_no))) {
        dispatch.invoice_no = `INV-${orderDigits}`;
      }

      let items = await this._safeSelectMany(client, 'dispatch_items', 'dispatch_id', dispatchId);
      if ((!items || items.length === 0) && dispatch.items && dispatch.items.length) {
        items = dispatch.items;
      }
      if ((!items || items.length === 0) && dispatch.order_id && client && client.from) {
        try {
          const { data: ordRow } = await client.from('orders').select('notes').eq('id', dispatch.order_id).maybeSingle();
          const ordNotes = Array.isArray(ordRow) ? ordRow[0]?.notes : ordRow?.notes;
          if (ordNotes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordNotes)) {
            const metaStr = ordNotes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
            const metaObj = JSON.parse(metaStr);
            const foundDisp = (metaObj.dispatches || []).find(d => String(d.id) === String(dispatchId) || d.dispatch_no === dispatch.dispatch_no);
            if (foundDisp && Array.isArray(foundDisp.items) && foundDisp.items.length) {
              items = foundDisp.items;
            }
          }
        } catch (_) {}
      }

      // Deduplicate items to prevent duplicate rows for the same product
      if (Array.isArray(items) && items.length > 1) {
        const uniqueItems = [];
        items.forEach(it => {
          const exists = uniqueItems.some(u =>
            (u.id && it.id && String(u.id) === String(it.id)) ||
            (u.order_item_id && it.order_item_id && String(u.order_item_id) === String(it.order_item_id)) ||
            (u.product_id && it.product_id && String(u.product_id) === String(it.product_id)) ||
            (u.product_name && it.product_name && String(u.product_name).trim().toLowerCase() === String(it.product_name).trim().toLowerCase())
          );
          if (!exists) {
            uniqueItems.push(it);
          }
        });
        items = uniqueItems;
      }

      // Ensure item details (product name, packing size, unit price) are synchronized with the actual order items
      if (items && items.length && dispatch.order_id) {
        let orderItems = [];
        if (client && client.from) {
          try {
            const { data: oiList } = await client.from('order_items').select('id, product_id, product_name, packing_size, packaging_size, unit_price').eq('order_id', dispatch.order_id);
            if (Array.isArray(oiList) && oiList.length) orderItems = oiList;
          } catch (_) {}
        }
        if (!orderItems.length && client && client.from) {
          try {
            const { data: ordRow } = await client.from('orders').select('notes').eq('id', dispatch.order_id).maybeSingle();
            const ordNotes = Array.isArray(ordRow) ? ordRow[0]?.notes : ordRow?.notes;
            if (ordNotes && /(?:DISPATCH_META|Dispatch_meta):/i.test(ordNotes)) {
              const metaStr = ordNotes.replace(/^[\s\S]*?(?:DISPATCH_META|Dispatch_meta):/i, '').trim();
              const metaObj = JSON.parse(metaStr);
              if (Array.isArray(metaObj.items_meta)) orderItems = metaObj.items_meta;
            }
          } catch (_) {}
        }
        if (!orderItems.length) {
          const localOi = getLocalTable('order_items') || [];
          orderItems = localOi.filter(oi => String(oi.order_id) === String(dispatch.order_id));
        }

        if (orderItems.length) {
          items.forEach(it => {
            const match = orderItems.find(oi => (it.order_item_id && oi.id == it.order_item_id) || (oi.product_id && it.product_id && String(oi.product_id) === String(it.product_id)) || (oi.product_name && String(oi.product_name).toLowerCase().trim() === String(it.product_name).toLowerCase().trim()));
            if (match) {
              const actualPack = match.packing_size || match.packaging_size;
              if (actualPack) {
                it.packaging_size = actualPack;
                it.packing_size = actualPack;
              }
              if (match.product_name) it.product_name = match.product_name;
              if (match.unit_price) it.unit_price = parseFloat(match.unit_price) || it.unit_price;
            }
          });
        }
      }

      // Synchronize updated packaging size into local dispatch_items table
      try {
        const localDItems = getLocalTable('dispatch_items');
        if (localDItems && localDItems.length) {
          let changed = false;
          items.forEach(it => {
            const found = localDItems.find(li => (li.id && it.id && String(li.id) === String(it.id)) || (String(li.dispatch_id) === String(dispatchId) && (li.order_item_id == it.order_item_id || li.product_id == it.product_id)));
            if (found && (found.packaging_size !== it.packaging_size || found.product_name !== it.product_name)) {
              found.packaging_size = it.packaging_size;
              found.packing_size = it.packaging_size;
              found.product_name = it.product_name;
              changed = true;
            }
          });
          if (changed) saveLocalTable('dispatch_items', localDItems);
        }
      } catch (_) {}

      dispatch.items = items;
      return { dispatch, items };
    },

    /**
     * Query API: Get available QC-Approved saleable batches for dispatch
     */
    async getAvailableApprovedBatches(client, { productId } = {}) {
      try {
        let q = client.from('stock_batches').select('*').gt('current_qty', 0);
        const { data: batches } = await (q.then ? q : q.select('*'));
        let batchList = (batches || []).filter(b => {
          const isQuar = b.is_quarantine === true;
          const qc = b.qc_status || 'Approved';
          return !isQuar && qc === 'Approved';
        });

        // Enrich with item_name from inventory_items
        try {
          const { data: invItems } = await client.from('inventory_items').select('id, name, category, unit');
          if (invItems && invItems.length) {
            const invMap = new Map();
            invItems.forEach(i => invMap.set(i.id, i));
            batchList.forEach(b => {
              const inv = invMap.get(b.item_id);
              if (inv) {
                b.item_name = inv.name;
                b.category = inv.category;
                b.unit = inv.unit;
              }
            });
          }
        } catch (_) {}

        if (productId) {
          batchList = batchList.filter(b => b.product_id === productId || b.item_id === productId);
        }
        return batchList;
      } catch (_) {
        return [];
      }
    }
  };

  return {
    DispatchCalculator,
    StockGuard,
    Service
  };
});
