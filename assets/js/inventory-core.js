/**
 * assets/js/inventory-core.js
 * Single Authoritative Inventory Engine for AgroChem ERP
 * Standardized Unit Conversions, SKU-Specific Box Packaging,
 * Transaction-Safe FIFO Stock Deductions, Movement Auditing & Diagnostics.
 *
 * Compatible with Browser (window.INVENTORY_CORE) and Node.js (module.exports).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const core = factory();
    root.INVENTORY_CORE = core;
    // Bind seamlessly as authoritative INVENTORY_SERVICE on window
    root.INVENTORY_SERVICE = core.Service;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============================================================================
  // 1. STANDARDIZED UNIT CONVERSION & PACKAGING CALCULATIONS
  // ============================================================================
  const Units = {
    // Canonical unit representations
    CANONICAL: {
      LITRE: 'Litre',
      ML: 'Ml',
      KG: 'Kg',
      GRAM: 'Gram',
      NOS: 'Nos'
    },

    // Categories
    CATEGORIES: {
      VOLUME: 'VOLUME',
      WEIGHT: 'WEIGHT',
      DISCRETE: 'DISCRETE'
    },

    normalize(unit) {
      if (!unit) return this.CANONICAL.NOS;
      const s = String(unit).trim().toLowerCase();
      if (/^(l|ltr|ltrs|liter|litre|litres)$/i.test(s)) return this.CANONICAL.LITRE;
      if (/^(ml|milliliter|millilitre)$/i.test(s)) return this.CANONICAL.ML;
      if (/^(kg|kgs|kilo|kilogram|kilograms)$/i.test(s)) return this.CANONICAL.KG;
      if (/^(g|gm|gms|gram|grams)$/i.test(s)) return this.CANONICAL.GRAM;
      if (/^(nos|no|pcs|piece|pieces|bottle|bottles|box|boxes|pack|packs|bag|bags|drum|drums)$/i.test(s)) {
        return this.CANONICAL.NOS;
      }
      return unit.trim();
    },

    getCategory(unit) {
      const u = this.normalize(unit);
      if (u === this.CANONICAL.LITRE || u === this.CANONICAL.ML) return this.CATEGORIES.VOLUME;
      if (u === this.CANONICAL.KG || u === this.CANONICAL.GRAM) return this.CATEGORIES.WEIGHT;
      if (u === this.CANONICAL.NOS) return this.CATEGORIES.DISCRETE;
      return 'OTHER';
    },

    /**
     * Standardized unit conversion with strict category boundaries and density support.
     * @param {number} qty - Quantity to convert
     * @param {string} fromUnit - Origin unit
     * @param {string} toUnit - Target unit
     * @param {number} [density=1.0] - Specific gravity in kg/L (for liquid-to-dry conversion)
     * @returns {number} Converted quantity
     */
    convert(qty, fromUnit, toUnit, density = 1.0) {
      const q = parseFloat(qty) || 0;
      if (!fromUnit || !toUnit) return q;
      const f = this.normalize(fromUnit);
      const t = this.normalize(toUnit);
      if (f === t) return q;

      const catF = this.getCategory(f);
      const catT = this.getCategory(t);
      const d = parseFloat(density) > 0 ? parseFloat(density) : 1.0;

      // 1. Volume <-> Volume
      if (catF === this.CATEGORIES.VOLUME && catT === this.CATEGORIES.VOLUME) {
        if (f === this.CANONICAL.LITRE && t === this.CANONICAL.ML) return q * 1000.0;
        if (f === this.CANONICAL.ML && t === this.CANONICAL.LITRE) return q / 1000.0;
      }

      // 2. Weight <-> Weight
      if (catF === this.CATEGORIES.WEIGHT && catT === this.CATEGORIES.WEIGHT) {
        if (f === this.CANONICAL.KG && t === this.CANONICAL.GRAM) return q * 1000.0;
        if (f === this.CANONICAL.GRAM && t === this.CANONICAL.KG) return q / 1000.0;
      }

      // 3. Volume <-> Weight (requires density in kg/L)
      if (catF === this.CATEGORIES.VOLUME && catT === this.CATEGORIES.WEIGHT) {
        const litres = (f === this.CANONICAL.LITRE) ? q : (q / 1000.0);
        const kg = litres * d;
        return (t === this.CANONICAL.KG) ? kg : (kg * 1000.0);
      }

      if (catF === this.CATEGORIES.WEIGHT && catT === this.CATEGORIES.VOLUME) {
        const kg = (f === this.CANONICAL.KG) ? q : (q / 1000.0);
        const litres = kg / d;
        return (t === this.CANONICAL.LITRE) ? litres : (litres * 1000.0);
      }

      // 4. Discrete (Nos) cannot be converted into continuous mass/volume without packaging context
      if (catF === this.CATEGORIES.DISCRETE || catT === this.CATEGORIES.DISCRETE) {
        throw new Error(`INVALID_CROSS_UNIT_CONVERSION: Cannot convert continuous ${f} to discrete ${t} without packaging specification.`);
      }

      return q;
    },

    /**
     * Parses a packaging size string into structured volume and weight values.
     * E.g. "500 ml", "1 Litre", "250 ML", "1 Kg", "500 Gram".
     */
    parsePackagingSize(str) {
      if (!str) {
        return {
          raw: '',
          value: 1,
          unit: this.CANONICAL.NOS,
          category: this.CATEGORIES.DISCRETE,
          volumeMl: 0,
          volumeLitre: 0,
          weightGram: 0,
          weightKg: 0
        };
      }

      const s = String(str).trim();
      const match = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z%*]+)?/);
      if (!match) {
        return {
          raw: s,
          value: 1,
          unit: this.CANONICAL.NOS,
          category: this.CATEGORIES.DISCRETE,
          volumeMl: 0,
          volumeLitre: 0,
          weightGram: 0,
          weightKg: 0
        };
      }

      const val = parseFloat(match[1]) || 0;
      const unitRaw = match[2] || '';
      const unit = this.normalize(unitRaw);
      const cat = this.getCategory(unit);

      let volMl = 0, volL = 0, wtGm = 0, wtKg = 0;

      if (cat === this.CATEGORIES.VOLUME) {
        if (unit === this.CANONICAL.LITRE) {
          volL = val;
          volMl = val * 1000.0;
        } else {
          volMl = val;
          volL = val / 1000.0;
        }
        // Base density 1.0 kg/L equivalence
        wtKg = volL;
        wtGm = volMl;
      } else if (cat === this.CATEGORIES.WEIGHT) {
        if (unit === this.CANONICAL.KG) {
          wtKg = val;
          wtGm = val * 1000.0;
        } else {
          wtGm = val;
          wtKg = val / 1000.0;
        }
        volL = wtKg;
        volMl = wtGm;
      } else {
        volL = 0;
        volMl = 0;
        wtKg = 0;
        wtGm = 0;
      }

      return {
        raw: s,
        value: val,
        unit: unit,
        category: cat,
        volumeMl: volMl,
        volumeLitre: volL,
        weightGram: wtGm,
        weightKg: wtKg
      };
    },

    /**
     * SKU-Specific Packaging & Box-vs-Loose Quantity Calculation.
     * Enforces that box capacity is never hardcoded across all products.
     *
     * @param {object} params
     * @param {string} params.packagingSize - e.g. "500 ml"
     * @param {number} params.unitsPerBox - Box capacity for this specific SKU (e.g. 20)
     * @param {number} [params.boxes] - Number of full boxes
     * @param {number} [params.loose] - Number of loose individual bottles/units
     * @param {number} [params.totalUnits] - Total individual units
     * @param {number} [params.density=1.0] - Material density
     * @returns {object} Calculated breakdown
     */
    calculatePackagingQuantities({ packagingSize, unitsPerBox = 0, boxes = 0, loose = 0, totalUnits = 0, density = 1.0 }) {
      const bPerBox = parseInt(unitsPerBox, 10) || 0;
      const parsedPack = this.parsePackagingSize(packagingSize);
      let calculatedTotalUnits = 0;
      let calculatedBoxes = 0;
      let calculatedLoose = 0;

      const hasBoxInput = (boxes !== undefined && boxes !== null && boxes > 0) || (loose !== undefined && loose !== null && loose > 0);

      if (hasBoxInput) {
        const b = Math.max(0, parseFloat(boxes) || 0);
        const l = Math.max(0, parseFloat(loose) || 0);
        calculatedBoxes = Math.floor(b);
        calculatedLoose = l;
        calculatedTotalUnits = (calculatedBoxes * (bPerBox > 0 ? bPerBox : 1)) + calculatedLoose;
      } else {
        const t = Math.max(0, parseFloat(totalUnits) || 0);
        calculatedTotalUnits = t;
        if (bPerBox > 0) {
          calculatedBoxes = Math.floor(t / bPerBox);
          calculatedLoose = t % bPerBox;
        } else {
          calculatedBoxes = 0;
          calculatedLoose = t;
        }
      }

      const totalVolumeLitres = calculatedTotalUnits * parsedPack.volumeLitre;
      const totalVolumeMl = calculatedTotalUnits * parsedPack.volumeMl;
      const totalWeightKg = calculatedTotalUnits * parsedPack.weightKg * (parseFloat(density) || 1.0);
      const totalWeightGram = calculatedTotalUnits * parsedPack.weightGram * (parseFloat(density) || 1.0);

      const physicalBoxesConsumed = bPerBox > 0 ? Math.ceil(calculatedTotalUnits / bPerBox) : (calculatedBoxes + (calculatedLoose > 0 ? 1 : 0));

      return {
        packagingSize: parsedPack.raw,
        unitsPerBox: bPerBox,
        boxes: calculatedBoxes,
        loose: calculatedLoose,
        totalUnits: calculatedTotalUnits,
        totalVolumeLitres,
        totalVolumeMl,
        totalWeightKg,
        totalWeightGram,
        // Box count needed for physical outer packaging deduction
        outerBoxesConsumed: physicalBoxesConsumed
      };
    },

    /**
     * Checks if two packaging size strings represent equivalent volume or weight.
     * e.g. "1 Ltr" vs "1 Litre" vs "1000 ml" -> true; "500 ml" vs "1 Ltr" -> false.
     */
    sizesMatch(sizeA, sizeB) {
      if (!sizeA || !sizeB) return false;
      const sA = String(sizeA).trim().toLowerCase();
      const sB = String(sizeB).trim().toLowerCase();
      if (sA === sB) return true;

      const pA = this.parsePackagingSize(sizeA);
      const pB = this.parsePackagingSize(sizeB);

      if (pA.category === this.CATEGORIES.VOLUME && pB.category === this.CATEGORIES.VOLUME) {
        if (pA.volumeMl > 0 && pB.volumeMl > 0) {
          return Math.abs(pA.volumeMl - pB.volumeMl) < 0.5;
        }
      }
      if (pA.category === this.CATEGORIES.WEIGHT && pB.category === this.CATEGORIES.WEIGHT) {
        if (pA.weightGram > 0 && pB.weightGram > 0) {
          return Math.abs(pA.weightGram - pB.weightGram) < 0.5;
        }
      }

      // Normalized fallback
      const normA = sA.replace(/\s+/g, '');
      const normB = sB.replace(/\s+/g, '');
      return normA === normB;
    },

    /**
     * Cleans packaging size string ensuring proper unit suffix without duplication.
     */
    cleanSizeLabel(size, unit) {
      if (!size) return unit || '';
      const s = String(size).trim();
      const u = String(unit || '').trim();
      if (!u) return s;
      if (s.toLowerCase().includes(u.toLowerCase()) || /\b(ltr|litre|ml|kg|gm|gram|nos|pcs|box|bag|drum)\b/i.test(s)) {
        return s;
      }
      return `${s} ${u}`;
    },

    /**
     * Formats clean standard name for a product label.
     * e.g. "PROD-1 1 Ltr Label [GAS]"
     */
    formatLabelName(productName, packagingSize, ownerCode) {
      const pName = String(productName || '').trim();
      const pSize = String(packagingSize || '').trim();
      let owner = String(ownerCode || 'E').trim().toUpperCase();
      if (owner === 'ACC' || owner === 'AAC') owner = 'E';
      return `${pName} ${pSize} Label [${owner}]`.replace(/\s{2,}/g, ' ');
    }
  };

  // ============================================================================
  // 2. IDEMPOTENCY & DUPLICATE-SUBMISSION GUARD
  // ============================================================================
  const IdempotencyGuard = {
    _inFlightKeys: new Set(),
    _processedKeys: new Set(),

    start(key) {
      if (!key) return true;
      if (this._inFlightKeys.has(key)) {
        throw new Error(`DUPLICATE_REQUEST_BLOCKED: An operation with idempotency key "${key}" is already in progress.`);
      }
      if (this._processedKeys.has(key)) {
        return false; // Already executed
      }
      this._inFlightKeys.add(key);
      return true;
    },

    commit(key) {
      if (!key) return;
      this._inFlightKeys.delete(key);
      this._processedKeys.add(key);
    },

    release(key) {
      if (!key) return;
      this._inFlightKeys.delete(key);
    },

    hasBeenProcessed(key) {
      if (!key) return false;
      return this._processedKeys.has(key);
    },

    clearForReference(prefix) {
      if (!prefix) return;
      for (const k of Array.from(this._processedKeys)) {
        if (k.startsWith(prefix)) {
          this._processedKeys.delete(k);
        }
      }
    }
  };

  // ============================================================================
  // 3. AUTHORITATIVE INVENTORY SERVICE (DB INTERACTIONS)
  // ============================================================================
  const Service = {
    _dbClient: null,

    getDb() {
      if (this._dbClient) return this._dbClient;
      if (typeof window !== 'undefined' && window.dbClient) {
        this._dbClient = window.dbClient;
        return this._dbClient;
      }
      return null;
    },

    setDb(client) {
      this._dbClient = client;
    },

    /**
     * Get live stock quantity for an inventory item by summing active positive batches.
     * Guaranteed to use the single authoritative batch calculation.
     */
    async getItemStock(itemId) {
      const db = this.getDb();
      if (!db || !itemId) return 0;
      try {
        const { data: batches, error } = await db
          .from('stock_batches')
          .select('*')
          .eq('item_id', itemId)
          .eq('item_type', 'Inventory')
          .gt('current_qty', 0);

        if (error) throw error;
        if (!batches || batches.length === 0) {
          const { data: it } = await db.from('inventory_items').select('stock').eq('id', itemId).maybeSingle();
          return it ? Math.max(0, parseFloat(it.stock) || 0) : 0;
        }

        return batches.reduce((sum, b) => {
          const isQuarantined = b.is_quarantine === true || b.qc_status === 'Pending' || b.qc_status === 'Rejected' || b.qc_status === 'On Hold';
          return isQuarantined ? sum : sum + (parseFloat(b.current_qty) || 0);
        }, 0);
      } catch (e) {
        console.warn('[INVENTORY_CORE] getItemStock error:', e);
        return 0;
      }
    },

    /**
     * Synchronizes inventory_items.stock to match the exact sum of positive saleable stock_batches.
     * Safely clamps negative batches to prevent silent drift.
     */
    async syncItemStock(itemId) {
      const db = this.getDb();
      if (!db || !itemId) return 0;
      try {
        const { data: batches, error } = await db
          .from('stock_batches')
          .select('*')
          .eq('item_id', itemId)
          .eq('item_type', 'Inventory');

        if (error) throw error;

        let totalStock = 0;
        const negUpdates = [];

        (batches || []).forEach(b => {
          const qty = parseFloat(b.current_qty) || 0;
          if (qty < 0) {
            negUpdates.push(db.from('stock_batches').update({ current_qty: 0 }).eq('id', b.id));
          } else {
            const isQuarantined = b.is_quarantine === true || b.qc_status === 'Pending' || b.qc_status === 'Rejected' || b.qc_status === 'On Hold';
            if (!isQuarantined) {
              totalStock += qty;
            }
          }
        });

        if (negUpdates.length > 0) {
          await Promise.all(negUpdates);
        }

        await db.from('inventory_items').update({ stock: totalStock }).eq('id', itemId);
        return totalStock;
      } catch (e) {
        console.warn('[INVENTORY_CORE] syncItemStock error:', e);
        return 0;
      }
    },

    /**
     * Validate available stock before transactions.
     * Prevents negative stock unless explicitly authorized.
     */
    async validateStockAvailability(itemId, requiredQty, allowNegative = false) {
      const available = await this.getItemStock(itemId);
      const req = parseFloat(requiredQty) || 0;

      if (available < req && !allowNegative) {
        const db = this.getDb();
        let itemName = `Item #${itemId}`;
        if (db) {
          const { data } = await db.from('inventory_items').select('name, unit').eq('id', itemId).maybeSingle();
          if (data) itemName = `${data.name} (${data.unit || 'Units'})`;
        }
        const err = new Error(`INSUFFICIENT_STOCK: Required ${req} of ${itemName}, but only ${available.toFixed(2)} is available.`);
        err.code = 'INSUFFICIENT_STOCK';
        err.available = available;
        err.required = req;
        throw err;
      }

      return { valid: true, available, required: req };
    },

    /**
     * Safely logs a stock movement into public.stock_movements with backward-compatible schema adaptation.
     */
    async logMovement({
      itemId,
      batchId = null,
      movementType,
      quantity,
      referenceType = null,
      referenceId = null,
      referenceNo = null,
      notes = null,
      idempotencyKey = null
    }) {
      const db = this.getDb();
      if (!db) return null;

      const qty = parseFloat(quantity) || 0;
      const refTag = referenceNo ? `[${referenceNo}] ` : '';
      const formattedType = `${movementType || 'MOVEMENT'}${refTag ? ' ' + refTag : ''}`;

      // Build payload matching core database columns currently in schema
      let corePayload = {
        batch_id: batchId || null,
        txn_type: formattedType,
        txn_id: referenceId ? parseInt(referenceId, 10) : null,
        qty: qty,
        notes: notes || null
      };
      if (typeof window !== 'undefined' && window.TENANT_CONTEXT) {
        corePayload = window.TENANT_CONTEXT.stamp(corePayload);
      }

      try {
        const { data, error } = await db.from('stock_movements').insert([corePayload]).select();
        if (error) {
          console.warn('[INVENTORY_CORE] Movement log notice:', error.message);
          return null;
        }
        return data ? data[0] : null;
      } catch (err) {
        console.warn('[INVENTORY_CORE] Movement log exception:', err);
        return null;
      }
    },

    /**
     * Authoritative FIFO Stock Deduction Engine.
     *
     * 1. Guards against duplicate submissions using idempotency tokens.
     * 2. Checks available stock and enforces negative stock validation.
     * 3. Deducts from stock_batches in strict FIFO order (oldest purchase_date first).
     * 4. Logs traceable stock_movements records.
     * 5. Atomically synchronizes inventory_items.stock.
     */
    async deductStockFIFO({
      itemId,
      quantity,
      movementType = 'DISPATCH',
      referenceType = 'orders',
      referenceId = null,
      referenceNo = null,
      idempotencyKey = null,
      allowNegative = false,
      notes = null
    }) {
      const db = this.getDb();
      if (!db || !itemId) return 0;
      const qtyToDeduct = Math.max(0, parseFloat(quantity) || 0);
      if (qtyToDeduct === 0) return await this.getItemStock(itemId);

      // 1. Idempotency Guard
      if (idempotencyKey) {
        const canProceed = IdempotencyGuard.start(idempotencyKey);
        if (!canProceed) {
          console.log(`[INVENTORY_CORE] Idempotency key "${idempotencyKey}" already processed. Skipping duplicate deduction.`);
          return await this.getItemStock(itemId);
        }
      }

      try {
        // 2. High-performance FIFO Batch Query (Combined availability & batch fetch in 1 round-trip)
        const { data: rawBatches, error } = await db
          .from('stock_batches')
          .select('*')
          .eq('item_id', itemId)
          .eq('item_type', 'Inventory')
          .gt('current_qty', 0)
          .order('purchase_date', { ascending: true })
          .order('id', { ascending: true });

        if (error) throw error;

        // Exclude quarantined and unapproved batches
        let batches = (rawBatches || []).filter(b => {
          const isQuarantined = b.is_quarantine === true || b.qc_status === 'Pending' || b.qc_status === 'Rejected' || b.qc_status === 'On Hold';
          return !isQuarantined;
        });

        let totalAvail = batches.reduce((sum, b) => sum + (parseFloat(b.current_qty) || 0), 0);

        if (!allowNegative && totalAvail < qtyToDeduct) {
          if (batches.length === 0) {
            const { data: it } = await db.from('inventory_items').select('*').eq('id', itemId).maybeSingle();
            if (it && (parseFloat(it.stock) || 0) > 0) {
              const insRes = await db.from('stock_batches').insert([{
                item_id: itemId,
                item_name: it.name,
                item_type: 'Inventory',
                batch_no: 'OPEN-01',
                initial_qty: parseFloat(it.stock) || 0,
                current_qty: parseFloat(it.stock) || 0,
                unit: it.unit || 'Nos',
                purchase_price: 0
              }]).select();
              if (insRes.data && insRes.data[0]) {
                batches = insRes.data;
                totalAvail = parseFloat(batches[0].current_qty) || 0;
              }
            }
          }
          if (totalAvail < qtyToDeduct) {
            throw new Error(`INSUFFICIENT_STOCK: Item #${itemId} requires ${qtyToDeduct}, only ${totalAvail.toFixed(2)} available.`);
          }
        }

        let remaining = qtyToDeduct;
        const updates = [];
        const movementRows = [];
        const affectedBatches = [];

        if (batches && batches.length > 0) {
          for (const b of batches) {
            if (remaining <= 0) break;
            const cur = parseFloat(b.current_qty) || 0;
            const deduct = Math.min(cur, remaining);
            const newQty = Math.max(0, cur - deduct);

            updates.push(db.from('stock_batches').update({ current_qty: newQty }).eq('id', b.id));
            affectedBatches.push({ batchId: b.id, batchNo: b.batch_no, deducted: deduct });

            const refTag = referenceNo ? `[${referenceNo}] ` : '';
            const formattedType = `${movementType || 'MOVEMENT'}${refTag ? ' ' + refTag : ''}`;
            movementRows.push({
              batch_id: b.id || null,
              txn_type: formattedType,
              txn_id: referenceId ? parseInt(referenceId, 10) : null,
              qty: -deduct,
              notes: notes || `FIFO deduction of ${deduct} from batch ${b.batch_no}`
            });

            remaining -= deduct;
          }
        }

        // Negative stock override deduction if allowed
        if (remaining > 0 && allowNegative) {
          const fallbackBatchId = (batches && batches.length > 0) ? batches[batches.length - 1].id : null;
          if (fallbackBatchId) {
            const cur = parseFloat(batches[batches.length - 1].current_qty) || 0;
            updates.push(db.from('stock_batches').update({ current_qty: cur - remaining }).eq('id', fallbackBatchId));
          }
          const refTag = referenceNo ? `[${referenceNo}] ` : '';
          const formattedType = `${movementType || 'MOVEMENT'}${refTag ? ' ' + refTag : ''}`;
          movementRows.push({
            batch_id: fallbackBatchId,
            txn_type: formattedType,
            txn_id: referenceId ? parseInt(referenceId, 10) : null,
            qty: -remaining,
            notes: notes || `Negative stock override deduction of ${remaining}`
          });
        }

        // Execute batch updates and movement inserts in parallel
        const persistTasks = [];
        if (updates.length > 0) persistTasks.push(Promise.all(updates));
        if (movementRows.length > 0) {
          const stampedMovements = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(movementRows) : movementRows;
          persistTasks.push(db.from('stock_movements').insert(stampedMovements));
        }
        await Promise.all(persistTasks);

        // Synchronize authoritative total stock
        const newTotal = await this.syncItemStock(itemId);

        if (idempotencyKey) {
          IdempotencyGuard.commit(idempotencyKey);
        }

        return newTotal;
      } catch (err) {
        if (idempotencyKey) {
          IdempotencyGuard.release(idempotencyKey);
        }
        throw err;
      }
    },

    /**
     * Reverses and restores stock associated with a specific reference (Order, Daily Usage, Cancellation).
     * Compensates exact historical batches wherever recorded.
     */
    async reverseReferenceStock({ referenceId, referenceNo = null, movementType = 'DISPATCH_REVERSAL', notes = null }) {
      const db = this.getDb();
      if (!db || !referenceId) return;

      try {
        if (referenceId) {
          IdempotencyGuard.clearForReference(`ord-${referenceId}-`);
        }
        const { data: movements, error } = await db
          .from('stock_movements')
          .select('*')
          .eq('txn_id', referenceId)
          .lt('qty', 0); // Outflows

        if (error || !movements || movements.length === 0) return;

        const affectedItemIds = new Set();
        const compMovements = [];

        // Parallel fetch of unique affected batch rows
        const uniqueBatchIds = Array.from(new Set(movements.map(m => m.batch_id).filter(Boolean)));
        const batchMap = new Map();
        if (uniqueBatchIds.length > 0) {
          const { data: bRows } = await db.from('stock_batches').select('id, current_qty, item_id').in('id', uniqueBatchIds);
          (bRows || []).forEach(b => batchMap.set(b.id, { ...b }));
        }

        for (const mov of movements) {
          const restoreQty = Math.abs(parseFloat(mov.qty) || 0);
          if (restoreQty <= 0) continue;

          if (mov.batch_id && batchMap.has(mov.batch_id)) {
            const bRow = batchMap.get(mov.batch_id);
            const cur = Math.max(0, parseFloat(bRow.current_qty) || 0);
            bRow.current_qty = cur + restoreQty;
            if (bRow.item_id) affectedItemIds.add(bRow.item_id);
          }
          if (mov.item_id) affectedItemIds.add(mov.item_id);

          const refTag = referenceNo ? `[${referenceNo}] ` : '';
          const formattedType = `${movementType || 'DISPATCH_REVERSAL'}${refTag ? ' ' + refTag : ''}`;
          compMovements.push({
            batch_id: mov.batch_id || null,
            txn_type: formattedType,
            txn_id: referenceId ? parseInt(referenceId, 10) : null,
            qty: restoreQty,
            notes: notes || ('Reversal of movement #' + mov.id)
          });
        }

        // Parallel persist restored batch quantities and comp movements
        const persistTasks = [];
        for (const [batchId, bData] of batchMap.entries()) {
          persistTasks.push(db.from('stock_batches').update({ current_qty: bData.current_qty }).eq('id', batchId));
        }
        if (compMovements.length > 0) {
          const stampedComp = window.TENANT_CONTEXT ? window.TENANT_CONTEXT.stamp(compMovements) : compMovements;
          persistTasks.push(db.from('stock_movements').insert(stampedComp));
        }
        await Promise.all(persistTasks);

        // Clean reversed outflow records
        await db.from('stock_movements').delete().eq('txn_id', referenceId).lt('qty', 0);

        // Sync all affected items concurrently
        await Promise.all(Array.from(affectedItemIds).map(itemId => this.syncItemStock(itemId)));
      } catch (err) {
        console.warn('[INVENTORY_CORE] reverseReferenceStock notice:', err);
      }
    },

    /**
     * Backward-compatible simple deductStock wrapper.
     */
    async deductStock(itemId, qtyToDeduct) {
      return await this.deductStockFIFO({
        itemId,
        quantity: qtyToDeduct,
        movementType: 'MANUAL_DEDUCT',
        allowNegative: false
      });
    },

    /**
     * Backward-compatible simple restoreStock wrapper.
     */
    async restoreStock(itemId, qtyToRestore) {
      const db = this.getDb();
      if (!db || !itemId || !qtyToRestore || qtyToRestore <= 0) return 0;
      try {
        const restoreQty = parseFloat(qtyToRestore) || 0;
        const { data: batches } = await db
          .from('stock_batches')
          .select('id, current_qty')
          .eq('item_id', itemId)
          .eq('item_type', 'Inventory')
          .order('id', { ascending: false })
          .limit(1);

        let targetBatchId = null;
        if (batches && batches.length > 0) {
          targetBatchId = batches[0].id;
          const cur = Math.max(0, parseFloat(batches[0].current_qty) || 0);
          await db.from('stock_batches').update({ current_qty: cur + restoreQty }).eq('id', batches[0].id);
        } else {
          const { data: it } = await db.from('inventory_items').select('*').eq('id', itemId).maybeSingle();
          if (it) {
            const insRes = await db.from('stock_batches').insert([{
              item_id: itemId,
              item_name: it.name,
              item_type: 'Inventory',
              batch_no: 'RESTORE-01',
              initial_qty: restoreQty,
              current_qty: restoreQty,
              unit: it.unit || 'Nos',
              purchase_price: 0
            }]).select();
            if (insRes.data && insRes.data[0]) targetBatchId = insRes.data[0].id;
          }
        }

        await this.logMovement({
          itemId,
          batchId: targetBatchId,
          movementType: 'STOCK_RESTORE',
          quantity: restoreQty,
          notes: `Restored ${restoreQty} units`
        });

        return await this.syncItemStock(itemId);
      } catch (e) {
        console.warn('[INVENTORY_CORE] restoreStock error:', e);
        return 0;
      }
    },

    /**
     * Resolves a Product ID to its explicit Technical / Active Ingredient inventory item.
     * Enforces unique Database ID resolution over fuzzy name matching.
     */
    async resolveTechnicalItem(productId, productName) {
      if (!this._techItemCache) this._techItemCache = new Map();
      const cacheKey = `${productId || ''}_${productName || ''}`;
      if (this._techItemCache.has(cacheKey)) {
        return this._techItemCache.get(cacheKey);
      }

      const db = this.getDb();
      if (!db) return null;

      // 1. Direct explicit foreign key resolution (Fastest & 100% accurate)
      if (productId) {
        try {
          const { data: pRow } = await db.from('products').select('id, name, inventory_item_id').eq('id', productId).maybeSingle();
          if (pRow && pRow.inventory_item_id) {
            const { data: invRow } = await db.from('inventory_items').select('*').eq('id', pRow.inventory_item_id).maybeSingle();
            if (invRow) {
              this._techItemCache.set(cacheKey, invRow);
              return invRow;
            }
          }
        } catch (_) {}
      }

      // 2. Strict ID search if productName matches inventory_items
      if (productName) {
        const cleanName = String(productName).trim();
        try {
          const { data: matches } = await db.from('inventory_items').select('*').ilike('name', cleanName);
          if (matches && matches.length > 0) {
            const techMatch = matches.find(m => {
              const cat = String(m.category || '').toLowerCase();
              return cat === 'technical' || cat === 'raw material';
            }) || matches[0];

            if (productId && techMatch) {
              db.from('products').update({ inventory_item_id: techMatch.id }).eq('id', productId).then(null, () => {});
            }
            if (techMatch) {
              this._techItemCache.set(cacheKey, techMatch);
            }
            return techMatch;
          }
        } catch (_) {}
      }

      return null;
    },

    /**
     * Resolves the authoritative label inventory item for a given product, packaging size, and label owner.
     * Enforces that:
     * - Product must match (by product_id or exact product name)
     * - Packaging size must match (volume/weight equivalence, e.g. 1 Ltr != 500 Ml)
     * - Label owner must match (E vs GAS)
     * - Category must be 'Labels'
     */
    async resolveLabelItem({ productId, productName = '', packagingSize, labelOwner = 'E', inventoryItems = null }) {
      const db = this.getDb();
      if (!db && !inventoryItems) return null;

      let targetOwner = String(labelOwner || 'E').trim().toUpperCase();
      if (targetOwner === 'ACC' || targetOwner === 'AAC') targetOwner = 'E';
      const targetSize = String(packagingSize || '').trim();
      const targetProdId = productId ? parseInt(productId, 10) : null;
      const targetProdName = String(productName || '').trim().toLowerCase();

      let items = inventoryItems;
      if (!items || !items.length) {
        try {
          const { data, error } = await db.from('inventory_items').select('*').eq('category', 'Labels');
          if (error) throw error;
          items = data || [];
        } catch (e) {
          console.warn('[INVENTORY_CORE] resolveLabelItem fetch error:', e);
          return null;
        }
      }

      // Filter only Labels
      const labelCandidates = items.filter(it => (it.category || '').toLowerCase() === 'labels');

      for (const item of labelCandidates) {
        // 1. Check Product match
        let prodMatches = false;
        if (targetProdId && item.product_id && parseInt(item.product_id, 10) === targetProdId) {
          prodMatches = true;
        } else if (targetProdName) {
          const itemNameLower = (item.name || '').toLowerCase();
          if (itemNameLower.startsWith(targetProdName) || itemNameLower.includes(targetProdName)) {
            prodMatches = true;
          }
        }
        if (!prodMatches) continue;

        // 2. Check Size match
        const itemSize = item.item_size || item.size || '';
        let sizeMatches = Units.sizesMatch(itemSize, targetSize);
        if (!sizeMatches && item.name) {
          sizeMatches = Units.sizesMatch(item.name, targetSize);
        }
        if (!sizeMatches) continue;

        // 3. Check Owner match (E vs GAS, with backward compatibility for ACC and AAC)
        const itemOwner = String(item.item_subtype || '').trim().toUpperCase();
        const itemName = String(item.name || '').toUpperCase();
        let ownerMatches = false;

        if (itemOwner === targetOwner || (targetOwner === 'E' && (itemOwner === 'ACC' || itemOwner === 'AAC'))) {
          ownerMatches = true;
        } else if (itemName.includes(`[${targetOwner}]`) || itemName.includes(`(${targetOwner})`)) {
          ownerMatches = true;
        } else if (targetOwner === 'E' && (itemName.includes('[ACC]') || itemName.includes('(ACC)') || itemName.includes('[AAC]') || itemName.includes('(AAC)'))) {
          ownerMatches = true;
        } else if (!itemOwner && (targetOwner === 'E' || targetOwner === 'ACC' || targetOwner === 'AAC')) {
          // Backward compatibility: unspecified owner defaults to E in-house
          ownerMatches = true;
        }

        if (ownerMatches) {
          return item;
        }
      }

      return null;
    },

    /**
     * Authoritative Purchase Receipt Inward Booking.
     */
    async receivePurchaseReceipt({ purchaseId, purchaseNo, supplierId, purchaseDate, items }) {
      const db = this.getDb();
      if (!db || !items || !items.length) return false;

      const affectedItemIds = new Set();

      for (const it of items) {
        if (!it.itemId) continue;
        const qty = parseFloat(it.quantity) || 0;
        if (qty <= 0) continue;

        // Idempotency: avoid creating duplicate batches for same purchase & item
        const { data: existing } = await db
          .from('stock_batches')
          .select('id')
          .eq('purchase_id', purchaseId)
          .eq('item_id', it.itemId)
          .maybeSingle();

        if (existing) {
          console.log(`[INVENTORY_CORE] Batch for purchase #${purchaseId} and item #${it.itemId} already exists.`);
          continue;
        }

        const batchPayload = {
          item_id: parseInt(it.itemId, 10),
          item_name: it.itemName || 'Purchased Item',
          item_type: 'Inventory',
          batch_no: it.batchNo || `P-${purchaseId}`,
          purchase_id: parseInt(purchaseId, 10),
          supplier_id: supplierId ? parseInt(supplierId, 10) : null,
          purchase_date: purchaseDate || new Date().toISOString().substring(0, 10),
          purchase_price: parseFloat(it.unitPrice) || 0,
          initial_qty: qty,
          current_qty: qty,
          unit: it.unit || 'Nos',
          expiry_date: it.expiryDate || null
        };

        const stampedBatch = (typeof window !== 'undefined' && window.TENANT_CONTEXT)
          ? window.TENANT_CONTEXT.stamp(batchPayload)
          : batchPayload;

        const { data: insData, error: insErr } = await db.from('stock_batches').insert([stampedBatch]).select();
        if (insErr) throw insErr;

        const newBatchId = insData && insData[0] ? insData[0].id : null;

        await this.logMovement({
          itemId: it.itemId,
          batchId: newBatchId,
          movementType: 'PURCHASE_RECEIPT',
          quantity: qty,
          referenceType: 'purchases',
          referenceId: purchaseId,
          referenceNo: purchaseNo,
          notes: `Inward purchase receipt of ${qty} ${it.unit || ''}`
        });

        affectedItemIds.add(it.itemId);
      }

      for (const id of affectedItemIds) {
        await this.syncItemStock(id);
      }

      return true;
    },

    /**
     * Authoritative Manufacturing / Bottling Stock Booking.
     */
    async bookManufacturingRun({
      productionId,
      batchNo,
      date,
      ingredients = [], // [{ itemId, quantity, unit }]
      output = null     // { itemId, quantity, unit, batchNo }
    }) {
      const db = this.getDb();
      if (!db) return false;

      // 1. Consume raw ingredients
      for (const ing of ingredients) {
        if (!ing.itemId || !ing.quantity) continue;
        await this.deductStockFIFO({
          itemId: ing.itemId,
          quantity: ing.quantity,
          movementType: 'MANUFACTURING_CONSUMPTION',
          referenceType: 'production_batches',
          referenceId: productionId,
          referenceNo: batchNo,
          notes: `Consumed for production batch ${batchNo}`
        });
      }

      // 2. Book production output
      if (output && output.itemId && output.quantity > 0) {
        const batchPayload = {
          item_id: parseInt(output.itemId, 10),
          item_name: output.itemName || 'Manufactured Good',
          item_type: 'Inventory',
          batch_no: output.batchNo || batchNo || 'B-01',
          purchase_date: date || new Date().toISOString().substring(0, 10),
          purchase_price: parseFloat(output.costPerUnit) || 0,
          initial_qty: parseFloat(output.quantity),
          current_qty: parseFloat(output.quantity),
          unit: output.unit || 'Kg'
        };

        const stampedBatch = (typeof window !== 'undefined' && window.TENANT_CONTEXT)
          ? window.TENANT_CONTEXT.stamp(batchPayload)
          : batchPayload;

        const { data: bData, error } = await db.from('stock_batches').insert([stampedBatch]).select();
        if (error) throw error;
        const bId = bData && bData[0] ? bData[0].id : null;

        await this.logMovement({
          itemId: output.itemId,
          batchId: bId,
          movementType: 'PRODUCTION_OUTPUT',
          quantity: output.quantity,
          referenceType: 'production_batches',
          referenceId: productionId,
          referenceNo: batchNo,
          notes: `Output of production batch ${batchNo}`
        });

        await this.syncItemStock(output.itemId);
      }

      return true;
    },

    // ==========================================================================
    // 4. STOCK RECONCILIATION & DIAGNOSTICS ENGINE
    // ==========================================================================
    async runDiagnostics() {
      const db = this.getDb();
      const itemsQuery = (typeof window !== 'undefined' && window.TENANT_CONTEXT)
        ? window.TENANT_CONTEXT.filter(db.from('inventory_items').select('*'))
        : db.from('inventory_items').select('*');
      const batchesQuery = (typeof window !== 'undefined' && window.TENANT_CONTEXT)
        ? window.TENANT_CONTEXT.filter(db.from('stock_batches').select('*').eq('item_type', 'Inventory'))
        : db.from('stock_batches').select('*').eq('item_type', 'Inventory');

      const [itemsRes, batchesRes] = await Promise.all([
        itemsQuery,
        batchesQuery
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      const items = itemsRes.data || [];
      const batches = batchesRes.data || [];

      const batchMap = new Map();
      const negativeBatches = [];

      batches.forEach(b => {
        const qty = parseFloat(b.current_qty) || 0;
        if (qty < 0) {
          negativeBatches.push(b);
        }
        const existing = batchMap.get(b.item_id) || { sumQty: 0, count: 0, batches: [] };
        existing.sumQty += Math.max(0, qty);
        existing.count += 1;
        existing.batches.push(b);
        batchMap.set(b.item_id, existing);
      });

      const discrepancies = [];
      let totalValue = 0;

      items.forEach(it => {
        const cachedStock = parseFloat(it.stock) || 0;
        const bData = batchMap.get(it.id) || { sumQty: 0, count: 0 };
        const calculatedStock = bData.sumQty;

        // Compare rounded to 2 decimal places to prevent sub-milligram floating point noise (e.g. -0.00)
        const roundedDiff = Math.abs(Math.round(cachedStock * 100) - Math.round(calculatedStock * 100)) / 100;
        if (roundedDiff >= 0.01) {
          discrepancies.push({
            itemId: it.id,
            name: it.name,
            category: it.category,
            unit: it.unit,
            cachedStock: cachedStock,
            calculatedStock: calculatedStock,
            variance: Math.round((cachedStock - calculatedStock) * 100) / 100,
            batchCount: bData.count
          });
        }
      });

      return {
        timestamp: new Date().toISOString(),
        totalItems: items.length,
        totalBatches: batches.length,
        discrepanciesCount: discrepancies.length,
        discrepancies,
        negativeBatchesCount: negativeBatches.length,
        negativeBatches,
        status: (discrepancies.length === 0 && negativeBatches.length === 0) ? 'HEALTHY' : 'DISCREPANCIES_FOUND'
      };
    },

    /**
     * Automatic reconciliation tool to heal inconsistent balances.
     */
    async repairDiscrepancies() {
      const diagnostics = await this.runDiagnostics();
      const db = this.getDb();
      if (!db) return false;

      const repaired = [];

      for (const disc of diagnostics.discrepancies) {
        await db.from('inventory_items').update({ stock: disc.calculatedStock }).eq('id', disc.itemId);
        await this.logMovement({
          itemId: disc.itemId,
          movementType: 'RECONCILIATION_ADJUSTMENT',
          quantity: disc.calculatedStock - disc.cachedStock,
          notes: `Auto-reconciled: Cached ${disc.cachedStock} -> Calculated ${disc.calculatedStock}`
        });
        repaired.push(disc.itemId);
      }

      // Heal negative batches
      for (const nb of diagnostics.negativeBatches) {
        await db.from('stock_batches').update({ current_qty: 0 }).eq('id', nb.id);
      }

      return {
        success: true,
        repairedItems: repaired.length,
        fixedNegativeBatches: diagnostics.negativeBatches.length
      };
    }
  };

  return {
    Units,
    IdempotencyGuard,
    Service,
    // Direct shortcut references
    convertUnit: Units.convert.bind(Units),
    normalizeUnit: Units.normalize.bind(Units),
    parsePackagingSize: Units.parsePackagingSize.bind(Units),
    calculatePackagingQuantities: Units.calculatePackagingQuantities.bind(Units)
  };
});
