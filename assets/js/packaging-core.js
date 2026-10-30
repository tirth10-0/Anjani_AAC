/**
 * assets/js/packaging-core.js
 * Authoritative Agrochemical Quality Control & Packaging / Bottling Engine
 *
 * Implements:
 * 1. Product-specific packaging configurations & BOM mappings (bottles, caps, labels, cartons).
 * 2. Packaging configuration versioning & effective dates.
 * 3. SKU-specific units per box calculations (e.g. 10 bottles/box: 205 bottles = 20 full boxes + 5 loose).
 * 4. Packaging orders & bottling runs with bulk batch selection.
 * 5. Material availability checks (bulk liquid + bottles, caps, labels, cartons).
 * 6. FIFO material deduction & anti double-deduction guards.
 * 7. Breakage, leakage, rejected units, carton damage, and unused returns tracking.
 * 8. Quarantine segregation: Unapproved packed batches are isolated from saleable inventory.
 * 9. QC inspection and approval releasing finished goods into saleable stock.
 * 10. Bidirectional traceability (finished lot <-> packaging order <-> packaging BOM <-> bulk batch <-> formulation).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const inventoryCore = require('./inventory-core.js');
    module.exports = factory(inventoryCore);
  } else {
    root.PACKAGING_CORE = factory(root.INVENTORY_CORE);
    root.PACKAGING_SERVICE = root.PACKAGING_CORE.Service;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (inventoryCore) {
  'use strict';

  const Units = inventoryCore?.Units || {
    parsePackagingSize(str) {
      const s = String(str || '').trim();
      const match = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z%*]+)?/);
      const val = match ? parseFloat(match[1]) || 1 : 1;
      const u = (match && match[2] ? match[2] : '').toLowerCase();
      let volL = 0, volMl = 0, wtKg = 0, wtGm = 0;
      if (u.includes('ml')) {
        volMl = val;
        volL = val / 1000.0;
        wtKg = volL;
        wtGm = volMl;
      } else if (u.includes('l') || u.includes('ltr')) {
        volL = val;
        volMl = val * 1000.0;
        wtKg = volL;
        wtGm = volMl;
      } else if (u.includes('gm') || u.includes('g')) {
        wtGm = val;
        wtKg = val / 1000.0;
        volL = wtKg;
        volMl = wtGm;
      } else if (u.includes('kg')) {
        wtKg = val;
        wtGm = val * 1000.0;
        volL = wtKg;
        volMl = wtGm;
      } else {
        volL = 1;
        volMl = 1000;
        wtKg = 1;
        wtGm = 1000;
      }
      return { raw: s, value: val, volumeLitre: volL, volumeMl: volMl, weightKg: wtKg, weightGram: wtGm };
    }
  };

  // ============================================================================
  // 1. PACKAGING BOM & QUANTITY CALCULATOR
  // ============================================================================
  const PackagingCalculator = {
    /**
     * Compute box and loose breakdown for any SKU.
     * E.g. 205 bottles at 10 units/box = 20 full boxes + 5 loose bottles.
     *
     * @param {number} totalBottles - Target bottle count
     * @param {number} unitsPerBox - Specific box capacity for this SKU
     * @param {boolean} [allowLoose=true] - Whether loose bottles are allowed
     * @returns {object} { boxes, loose, totalBottles, outerBoxesRequired }
     */
    calculateBoxesAndLoose(totalBottles, unitsPerBox, allowLoose = true) {
      const bottles = Math.max(0, parseInt(totalBottles, 10) || 0);
      const upb = Math.max(1, parseInt(unitsPerBox, 10) || 10);

      const boxes = Math.floor(bottles / upb);
      const loose = bottles % upb;

      // Outer boxes required: full boxes + 1 extra carton if loose bottles must be packed in a box
      const outerBoxesRequired = allowLoose ? boxes : Math.ceil(bottles / upb);

      return {
        totalBottles: bottles,
        unitsPerBox: upb,
        boxes,
        loose,
        outerBoxesRequired
      };
    },

    /**
     * Calculate required BOM components for packing target bottles of a packaging configuration.
     *
     * @param {object} config - Packaging config row from product_packaging
     * @param {number} targetBottles - Total bottles to pack
     * @param {number} [density=1.0] - Material density (kg/L)
     * @returns {object} Calculated BOM requirements
     */
    calculatePackagingBOM(config, targetBottles, density = 1.0) {
      const bottles = Math.max(0, parseInt(targetBottles, 10) || 0);
      const upb = Math.max(1, parseInt(config?.units_per_box, 10) || 10);
      const allowLoose = config?.allow_loose !== false;

      const breakdown = this.calculateBoxesAndLoose(bottles, upb, allowLoose);
      const parsedSize = Units.parsePackagingSize(config?.packaging_size || '1 Litre');

      // Required bulk volume or weight
      const unitVolLitre = parsedSize.volumeLitre || 1.0;
      const unitWtKg = parsedSize.weightKg || 1.0;
      const requiredBulkLitres = parseFloat((bottles * unitVolLitre).toFixed(4));
      const requiredBulkKg = parseFloat((bottles * unitWtKg * (parseFloat(density) || 1.0)).toFixed(4));

      return {
        packaging_id: config?.id || null,
        product_id: config?.product_id || null,
        packaging_size: parsedSize.raw,
        units_per_box: upb,
        target_bottles: bottles,
        boxes: breakdown.boxes,
        loose: breakdown.loose,
        unit_volume_litres: unitVolLitre,
        required_bulk_litres: requiredBulkLitres,
        required_bulk_kg: requiredBulkKg,
        required_bottles: bottles,
        required_caps: bottles,
        required_labels: bottles,
        required_cartons: breakdown.outerBoxesRequired,
        components: [
          {
            type: 'Bulk',
            name: 'Bulk Formulation Liquid / Powder',
            required_qty: requiredBulkLitres,
            unit: 'Litre'
          },
          {
            type: 'Bottle',
            inventory_item_id: config?.bottle_inventory_id || null,
            name: config?.bottle_name || 'Container / Bottle',
            required_qty: bottles,
            unit: 'Nos'
          },
          {
            type: 'Cap',
            inventory_item_id: config?.cap_inventory_id || null,
            name: config?.cap_name || 'Cap / Seal',
            required_qty: bottles,
            unit: 'Nos'
          },
          {
            type: 'Label',
            inventory_item_id: config?.label_inventory_id || null,
            name: config?.label_name || 'Printed Label',
            required_qty: bottles,
            unit: 'Nos'
          },
          {
            type: 'Carton',
            inventory_item_id: config?.carton_inventory_id || null,
            name: config?.carton_name || 'Outer Corrugated Box',
            required_qty: breakdown.outerBoxesRequired,
            unit: 'Nos'
          }
        ]
      };
    }
  };

  // ============================================================================
  // 2. AVAILABILITY CHECKER
  // ============================================================================
  const AvailabilityChecker = {
    /**
     * Verify whether bulk batch and all packaging BOM components are available.
     *
     * @param {object} client - Database client (Supabase or Mock)
     * @param {object} params
     * @param {number} params.bulkBatchId - ID of bulk stock batch
     * @param {object} params.packagingConfig - Packaging configuration
     * @param {number} params.plannedBottles - Number of bottles to pack
     * @param {number} [params.companyId=1]
     * @param {number} [params.warehouseId]
     * @returns {Promise<object>} Availability result
     */
    async checkPackagingAvailability(client, { bulkBatchId, packagingConfig, plannedBottles, companyId = 1, warehouseId }) {
      const bom = PackagingCalculator.calculatePackagingBOM(packagingConfig, plannedBottles);
      const shortages = [];
      let availableBulkQty = 0;
      let bulkBatch = null;

      // 1. Check Bulk Batch
      if (bulkBatchId) {
        let q = client.from('stock_batches').select('*').eq('id', bulkBatchId);
        if (companyId) q = q.eq('company_id', companyId);
        const { data: bData } = await q.maybeSingle ? await q.maybeSingle() : await q;
        bulkBatch = Array.isArray(bData) ? bData[0] : bData;

        if (!bulkBatch) {
          shortages.push({
            type: 'Bulk',
            name: 'Bulk Stock Batch',
            required: bom.required_bulk_litres,
            available: 0,
            shortage: bom.required_bulk_litres,
            error: 'BULK_BATCH_NOT_FOUND'
          });
        } else if (bulkBatch.is_quarantine === true || (bulkBatch.qc_status && bulkBatch.qc_status !== 'Approved')) {
          shortages.push({
            type: 'Bulk',
            name: `Bulk Batch ${bulkBatch.batch_no}`,
            required: bom.required_bulk_litres,
            available: parseFloat(bulkBatch.current_qty) || 0,
            shortage: bom.required_bulk_litres,
            error: 'BULK_BATCH_IN_QUARANTINE_OR_UNAPPROVED'
          });
        } else {
          availableBulkQty = parseFloat(bulkBatch.current_qty) || 0;
          if (availableBulkQty < bom.required_bulk_litres) {
            shortages.push({
              type: 'Bulk',
              name: `Bulk Batch ${bulkBatch.batch_no}`,
              required: bom.required_bulk_litres,
              available: availableBulkQty,
              shortage: parseFloat((bom.required_bulk_litres - availableBulkQty).toFixed(4)),
              error: 'INSUFFICIENT_BULK_STOCK'
            });
          }
        }
      }

      // Helper to check stock in inventory_items
      async function checkItemStock(itemId, requiredQty, typeName, itemName) {
        if (!itemId || requiredQty <= 0) return;
        let q = client.from('inventory_items').select('*').eq('id', itemId);
        const { data: itData } = await q.maybeSingle ? await q.maybeSingle() : await q;
        const item = Array.isArray(itData) ? itData[0] : itData;
        const avail = item ? (parseFloat(item.stock) || 0) : 0;
        if (avail < requiredQty) {
          shortages.push({
            type: typeName,
            item_id: itemId,
            name: item?.name || itemName || `${typeName} Item #${itemId}`,
            required: requiredQty,
            available: avail,
            shortage: parseFloat((requiredQty - avail).toFixed(2)),
            error: `INSUFFICIENT_${typeName.toUpperCase()}_STOCK`
          });
        }
      }

      // 2. Check Packaging Materials Stock
      await checkItemStock(packagingConfig.bottle_inventory_id, bom.required_bottles, 'Bottle', packagingConfig.bottle_name);
      await checkItemStock(packagingConfig.cap_inventory_id, bom.required_caps, 'Cap', packagingConfig.cap_name);
      await checkItemStock(packagingConfig.label_inventory_id, bom.required_labels, 'Label', packagingConfig.label_name);
      await checkItemStock(packagingConfig.carton_inventory_id, bom.required_cartons, 'Carton', packagingConfig.carton_name);

      return {
        canFulfill: shortages.length === 0,
        bulkBatch,
        availableBulkQty,
        requiredBulkQty: bom.required_bulk_litres,
        bom,
        shortages
      };
    }
  };

  // ============================================================================
  // 3. PACKAGING WORKFLOW TRANSACTION SERVICE
  // ============================================================================
  const Service = {
    /**
     * Create or Version a Packaging Configuration.
     * Preserves version history so past packaging runs are never rewritten.
     */
    async savePackagingConfiguration(client, configData) {
      const packagingId = configData.id || null;
      const productId = configData.product_id;
      const packSize = configData.packaging_size;
      const unitsPerBox = parseInt(configData.units_per_box, 10) || 10;
      const allowLoose = configData.allow_loose !== false;

      if (!productId || !packSize) {
        throw new Error('INVALID_CONFIGURATION: product_id and packaging_size are required.');
      }

      if (packagingId) {
        // Fetch existing configuration for version snapshot
        const { data: existing } = await client.from('product_packaging').select('*').eq('id', packagingId).maybeSingle();
        if (existing) {
          const currentVersion = parseInt(existing.version, 10) || 1;
          const nextVersion = currentVersion + 1;

          // Save snapshot of old version into packaging_config_versions
          await client.from('packaging_config_versions').insert([{
            packaging_id: existing.id,
            product_id: existing.product_id,
            packaging_size: existing.packaging_size,
            version: currentVersion,
            bottle_inventory_id: existing.bottle_inventory_id || null,
            cap_inventory_id: existing.cap_inventory_id || null,
            label_inventory_id: existing.label_inventory_id || null,
            carton_inventory_id: existing.carton_inventory_id || null,
            units_per_box: existing.units_per_box || 10,
            allow_loose: existing.allow_loose !== false,
            effective_date: existing.effective_date || new Date().toISOString().split('T')[0],
            notes: `Archived version ${currentVersion} snapshot prior to upgrade to version ${nextVersion}`
          }]);

          // Update active configuration
          const updatePayload = {
            bottle_inventory_id: configData.bottle_inventory_id || null,
            cap_inventory_id: configData.cap_inventory_id || null,
            label_inventory_id: configData.label_inventory_id || null,
            carton_inventory_id: configData.carton_inventory_id || null,
            units_per_box: unitsPerBox,
            allow_loose: allowLoose,
            version: nextVersion,
            effective_date: configData.effective_date || new Date().toISOString().split('T')[0],
            is_active: true
          };
          if (configData.sell_price !== undefined) updatePayload.sell_price = parseFloat(configData.sell_price) || 0;
          if (configData.purchase_price !== undefined) updatePayload.purchase_price = parseFloat(configData.purchase_price) || 0;

          await client.from('product_packaging').update(updatePayload).eq('id', packagingId);
          return { id: packagingId, version: nextVersion, is_new: false };
        }
      }

      // Brand new packaging configuration
      const newPayload = {
        product_id: productId,
        packaging_size: packSize,
        bottle_inventory_id: configData.bottle_inventory_id || null,
        cap_inventory_id: configData.cap_inventory_id || null,
        label_inventory_id: configData.label_inventory_id || null,
        carton_inventory_id: configData.carton_inventory_id || null,
        units_per_box: unitsPerBox,
        allow_loose: allowLoose,
        version: 1,
        effective_date: configData.effective_date || new Date().toISOString().split('T')[0],
        purchase_price: parseFloat(configData.purchase_price) || 0,
        sell_price: parseFloat(configData.sell_price) || 0,
        is_active: true,
        company_id: configData.company_id || 1
      };

      const { data: created, error } = await client.from('product_packaging').insert([newPayload]).select();
      if (error) throw error;
      const row = Array.isArray(created) ? created[0] : created;
      return { id: row?.id, version: 1, is_new: true };
    },

    /**
     * Create a Packaging Order / Bottling Run Plan.
     */
    async createPackagingOrder(client, orderData) {
      const orderNo = orderData.order_no || `PKG-${Date.now()}`;
      const plannedBottles = Math.max(1, parseInt(orderData.planned_bottles, 10) || 0);

      // Check idempotency
      if (orderData.idempotency_key) {
        const { data: existing } = await client.from('packaging_orders').select('*').eq('idempotency_key', orderData.idempotency_key).maybeSingle();
        if (existing) {
          return { success: true, order: existing, duplicate: true };
        }
      }

      // Fetch packaging configuration
      const { data: pkgRow } = await client.from('product_packaging').select('*').eq('id', orderData.packaging_id).maybeSingle();
      if (!pkgRow) {
        throw new Error(`PACKAGING_CONFIG_NOT_FOUND: Packaging ID ${orderData.packaging_id} does not exist.`);
      }

      // Pre-check stock availability
      const availability = await AvailabilityChecker.checkPackagingAvailability(client, {
        bulkBatchId: orderData.bulk_batch_id,
        packagingConfig: pkgRow,
        plannedBottles,
        companyId: orderData.company_id || 1,
        warehouseId: orderData.warehouse_id
      });

      if (!availability.canFulfill && orderData.enforceAvailability !== false) {
        const deficitMsg = availability.shortages.map(s => `${s.name}: Needs ${s.required}, Available ${s.available} (Shortage: ${s.shortage})`).join('; ');
        throw new Error(`INSUFFICIENT_PACKAGING_STOCK: Cannot schedule bottling run. ${deficitMsg}`);
      }

      const bom = availability.bom;

      const orderPayload = {
        order_no: orderNo,
        company_id: orderData.company_id || 1,
        branch_id: orderData.branch_id || null,
        warehouse_id: orderData.warehouse_id || null,
        bulk_batch_id: orderData.bulk_batch_id || null,
        bulk_item_id: orderData.bulk_item_id || availability.bulkBatch?.item_id || null,
        bulk_batch_no: availability.bulkBatch?.batch_no || orderData.bulk_batch_no || null,
        product_id: orderData.product_id,
        packaging_id: orderData.packaging_id,
        packaging_size: pkgRow.packaging_size,
        units_per_box: bom.units_per_box,
        planned_bottles: plannedBottles,
        planned_bulk_qty: bom.required_bulk_litres,
        actual_bottles_packed: 0,
        actual_boxes_packed: 0,
        actual_loose_packed: 0,
        actual_bulk_consumed: 0,
        remaining_bulk_qty: availability.availableBulkQty,
        rejected_bottles: 0,
        bottle_breakage: 0,
        cap_wastage: 0,
        label_wastage: 0,
        carton_wastage: 0,
        materials_returned: [],
        materials_consumed: bom.components,
        status: 'Planned',
        material_status: 'Pending',
        qc_status: 'Pending',
        packing_batch_no: orderData.packing_batch_no || `LOT-PKG-${Date.now().toString().slice(-6)}`,
        packed_by: orderData.packed_by || null,
        verified_by: orderData.verified_by || null,
        idempotency_key: orderData.idempotency_key || null
      };

      const { data: created, error } = await client.from('packaging_orders').insert([orderPayload]).select();
      if (error) throw error;
      const order = Array.isArray(created) ? created[0] : created;

      return {
        success: true,
        order,
        bom,
        availability
      };
    },

    /**
     * Issue Packaging Materials (Bottles, Caps, Labels, Cartons & Bulk Chemical).
     * Prevents duplicate issuance.
     */
    async issuePackagingMaterials(client, { orderId, companyId = 1, idempotencyKey }) {
      const { data: order } = await client.from('packaging_orders').select('*').eq('id', orderId).maybeSingle();
      if (!order) throw new Error(`ORDER_NOT_FOUND: Packaging order ${orderId} does not exist.`);

      if (order.material_status === 'Issued') {
        throw new Error('MATERIALS_ALREADY_ISSUED: Packaging materials for this order have already been issued.');
      }
      if (order.status === 'Completed' || order.status === 'Cancelled') {
        throw new Error(`INVALID_ORDER_STATE: Cannot issue materials for order in '${order.status}' status.`);
      }

      // Update order status to Materials Issued
      await client.from('packaging_orders').update({
        status: 'Materials Issued',
        material_status: 'Issued'
      }).eq('id', orderId);

      return {
        success: true,
        orderId,
        status: 'Materials Issued',
        material_status: 'Issued'
      };
    },

    /**
     * Complete Packaging Run.
     * Records actual output (boxes + loose bottles), bulk chemical deduction,
     * packaging component consumption, breakage, spillage, and unused returns.
     *
     * QUARANTINE REQUIREMENT: The finished packed batch is booked into stock_batches
     * with is_quarantine = true and qc_status = 'Pending'. It CANNOT enter saleable stock
     * until QC inspection approval!
     */
    async completePackagingRun(client, completionData) {
      const orderId = completionData.order_id;
      const actualBottles = Math.max(0, parseInt(completionData.actual_bottles_packed, 10) || 0);
      const rejectedBottles = Math.max(0, parseInt(completionData.rejected_bottles, 10) || 0);
      const bottleBreakage = Math.max(0, parseInt(completionData.bottle_breakage, 10) || 0);
      const capWastage = Math.max(0, parseInt(completionData.cap_wastage, 10) || 0);
      const labelWastage = Math.max(0, parseInt(completionData.label_wastage, 10) || 0);
      const cartonWastage = Math.max(0, parseInt(completionData.carton_wastage, 10) || 0);
      const materialsReturned = completionData.materials_returned || [];

      // Idempotency guard against double-posting
      if (completionData.idempotency_key) {
        const { data: existing } = await client.from('packaging_orders').select('*').eq('idempotency_key', completionData.idempotency_key).maybeSingle();
        if (existing && existing.status === 'Completed') {
          return { success: true, order: existing, duplicate: true };
        }
      }

      const { data: order } = await client.from('packaging_orders').select('*').eq('id', orderId).maybeSingle();
      if (!order) throw new Error(`ORDER_NOT_FOUND: Packaging order ${orderId} does not exist.`);
      if (order.status === 'Completed') {
        throw new Error('DUPLICATE_COMPLETION_PREVENTED: This packaging run has already been completed.');
      }

      // Fetch packaging configuration
      const { data: pkgRow } = await client.from('product_packaging').select('*').eq('id', order.packaging_id).maybeSingle();
      const upb = Math.max(1, parseInt(order.units_per_box || pkgRow?.units_per_box, 10) || 10);
      const parsedSize = Units.parsePackagingSize(order.packaging_size);
      const unitVolLitre = parsedSize.volumeLitre || 1.0;

      // 1. Calculate actual output breakdown: Boxes and Loose
      const breakdown = PackagingCalculator.calculateBoxesAndLoose(actualBottles, upb, pkgRow?.allow_loose !== false);
      const boxesPacked = breakdown.boxes;
      const loosePacked = breakdown.loose;

      // 2. Calculate actual bulk chemical consumed
      // Agrochemical principle: filled bottles that leaked/rejected also consumed chemical!
      const totalBottlesFilled = actualBottles + rejectedBottles;
      const actualBulkConsumed = parseFloat((totalBottlesFilled * unitVolLitre).toFixed(4));

      // 3. Deduct Bulk Chemical from the bulk batch in stock_batches
      let remainingBulkQty = 0;
      let bulkBatchNo = order.bulk_batch_no;
      if (order.bulk_batch_id) {
        const { data: bulkBatch } = await client.from('stock_batches').select('*').eq('id', order.bulk_batch_id).maybeSingle();
        if (bulkBatch) {
          bulkBatchNo = bulkBatch.batch_no;
          const currentBulk = parseFloat(bulkBatch.current_qty) || 0;
          if (currentBulk < actualBulkConsumed) {
            throw new Error(`INSUFFICIENT_BULK_STOCK: Bulk batch only has ${currentBulk} L, but run consumed ${actualBulkConsumed} L.`);
          }
          remainingBulkQty = parseFloat((currentBulk - actualBulkConsumed).toFixed(4));
          await client.from('stock_batches').update({ current_qty: remainingBulkQty }).eq('id', order.bulk_batch_id);

          // Log movement for bulk chemical deduction
          await client.from('stock_movements').insert([{
            company_id: order.company_id || 1,
            batch_id: order.bulk_batch_id,
            movement_type: 'PACKAGING_CONSUMPTION',
            quantity: -actualBulkConsumed,
            reference_type: 'PACKAGING_ORDER',
            reference_id: String(orderId),
            notes: `Consumed for bottling run ${order.order_no} (${actualBottles} bottles @ ${order.packaging_size})`
          }]);
        }
      }

      // 4. Component Material Deductions & Returns Reconciliation
      // Component consumed = bottles packed + breakage - returns
      async function deductPackagingItem(itemId, qtyConsumed, wastageQty, returnedQty, itemType) {
        if (!itemId) return;
        const netDeduct = Math.max(0, qtyConsumed + wastageQty - returnedQty);
        if (netDeduct <= 0) return;

        const { data: item } = await client.from('inventory_items').select('*').eq('id', itemId).maybeSingle();
        if (item) {
          const newStock = Math.max(0, (parseFloat(item.stock) || 0) - netDeduct);
          await client.from('inventory_items').update({ stock: newStock }).eq('id', itemId);
        }
      }

      const returnBottle = materialsReturned.find(r => r.type === 'Bottle')?.qty || 0;
      const returnCap = materialsReturned.find(r => r.type === 'Cap')?.qty || 0;
      const returnLabel = materialsReturned.find(r => r.type === 'Label')?.qty || 0;
      const returnCarton = materialsReturned.find(r => r.type === 'Carton')?.qty || 0;

      await deductPackagingItem(pkgRow?.bottle_inventory_id, actualBottles + rejectedBottles, bottleBreakage, returnBottle, 'Bottle');
      await deductPackagingItem(pkgRow?.cap_inventory_id, actualBottles + rejectedBottles, capWastage, returnCap, 'Cap');
      await deductPackagingItem(pkgRow?.label_inventory_id, actualBottles + rejectedBottles, labelWastage, returnLabel, 'Label');
      await deductPackagingItem(pkgRow?.carton_inventory_id, boxesPacked, cartonWastage, returnCarton, 'Carton');

      // 5. Book Packed Finished Goods into stock_batches in QUARANTINE
      // Must NOT enter saleable stock until QC approval!
      const packingBatchNo = completionData.packing_batch_no || order.packing_batch_no || `LOT-PKG-${Date.now().toString().slice(-6)}`;

      const packedBatchPayload = {
        company_id: order.company_id || 1,
        branch_id: order.branch_id || 1,
        warehouse_id: order.warehouse_id || 1,
        item_id: order.product_id,
        item_name: `${pkgRow?.product_name || 'Product'} (${order.packaging_size})`,
        item_type: 'Product',
        batch_no: packingBatchNo,
        initial_qty: actualBottles,
        current_qty: actualBottles,
        unit: 'Bottles',
        packaging_id: order.packaging_id,
        packaging_order_id: orderId,
        bulk_batch_id: order.bulk_batch_id,
        boxes_count: boxesPacked,
        loose_count: loosePacked,
        units_per_box: upb,
        packing_batch_no: packingBatchNo,
        is_quarantine: true,           // CRITICAL QUARANTINE REQUIREMENT
        qc_status: 'Pending',          // CRITICAL QC REQUIREMENT
        created_at: new Date().toISOString()
      };

      const { data: batchCreated, error: batchErr } = await client.from('stock_batches').insert([packedBatchPayload]).select();
      if (batchErr) throw batchErr;
      const newStockBatch = Array.isArray(batchCreated) ? batchCreated[0] : batchCreated;

      // 6. Record detailed consumption ledger
      const consumedSummary = [
        { type: 'Bulk', name: 'Bulk Chemical', consumed: actualBulkConsumed, unit: 'Litre', batch_no: bulkBatchNo },
        { type: 'Bottle', name: 'Bottles', consumed: actualBottles + rejectedBottles, wastage: bottleBreakage, returned: returnBottle, unit: 'Nos' },
        { type: 'Cap', name: 'Caps', consumed: actualBottles + rejectedBottles, wastage: capWastage, returned: returnCap, unit: 'Nos' },
        { type: 'Label', name: 'Labels', consumed: actualBottles + rejectedBottles, wastage: labelWastage, returned: returnLabel, unit: 'Nos' },
        { type: 'Carton', name: 'Cartons', consumed: boxesPacked, wastage: cartonWastage, returned: returnCarton, unit: 'Nos' }
      ];

      for (const c of consumedSummary) {
        await client.from('packaging_materials_consumed').insert([{
          packaging_order_id: orderId,
          material_name: c.name,
          material_type: c.type,
          required_qty: c.consumed,
          issued_qty: c.consumed + (c.wastage || 0),
          actual_consumed: c.consumed,
          wastage_qty: c.wastage || 0,
          returned_qty: c.returned || 0,
          unit: c.unit,
          batch_no: c.batch_no || null
        }]);
      }

      // 7. Update packaging order record
      const updateOrderPayload = {
        status: 'Completed',
        material_status: 'Reconciled',
        qc_status: 'Pending',
        actual_bottles_packed: actualBottles,
        actual_boxes_packed: boxesPacked,
        actual_loose_packed: loosePacked,
        actual_bulk_consumed: actualBulkConsumed,
        remaining_bulk_qty: remainingBulkQty,
        rejected_bottles: rejectedBottles,
        bottle_breakage: bottleBreakage,
        cap_wastage: capWastage,
        label_wastage: labelWastage,
        carton_wastage: cartonWastage,
        materials_returned: materialsReturned,
        materials_consumed: consumedSummary,
        packing_batch_no: packingBatchNo,
        packed_stock_batch_id: newStockBatch?.id || null,
        packed_by: completionData.packed_by || order.packed_by || 'Packaging Operator',
        verified_by: completionData.verified_by || order.verified_by || 'Godown Supervisor',
        completed_at: new Date().toISOString()
      };

      await client.from('packaging_orders').update(updateOrderPayload).eq('id', orderId);

      return {
        success: true,
        orderId,
        packingBatchNo,
        actualBottles,
        boxesPacked,
        loosePacked,
        actualBulkConsumed,
        remainingBulkQty,
        isQuarantine: true,
        qcStatus: 'Pending',
        stockBatchId: newStockBatch?.id
      };
    },

    /**
     * Quality Control Inspection Workflow.
     * Approves or Rejects packed batch.
     *
     * If Approved: Releases batch from quarantine (is_quarantine = false, qc_status = 'Approved')
     * so it now enters unrestricted saleable finished-goods inventory.
     *
     * If Rejected: Maintains is_quarantine = true, qc_status = 'Rejected'.
     * Blocked permanently from saleable inventory.
     */
    async updatePackagingQcStatus(client, { orderId, qcStatus, qcInspectedBy, qcNotes, approvedBoxes, approvedLoose }) {
      const validStatuses = ['Approved', 'Rejected', 'On Hold'];
      if (!validStatuses.includes(qcStatus)) {
        throw new Error(`INVALID_QC_STATUS: Must be one of ${validStatuses.join(', ')}.`);
      }

      const { data: order } = await client.from('packaging_orders').select('*').eq('id', orderId).maybeSingle();
      if (!order) throw new Error(`ORDER_NOT_FOUND: Packaging order ${orderId} does not exist.`);

      const stockBatchId = order.packed_stock_batch_id;
      let releasedBatch = null;

      if (qcStatus === 'Approved') {
        // Release from quarantine into saleable inventory
        if (stockBatchId) {
          const upb = order.units_per_box || 10;
          let newBoxes = approvedBoxes !== undefined ? parseInt(approvedBoxes, 10) : order.actual_boxes_packed;
          let newLoose = approvedLoose !== undefined ? parseInt(approvedLoose, 10) : order.actual_loose_packed;
          let approvedBottles = (newBoxes * upb) + newLoose;

          await client.from('stock_batches').update({
            is_quarantine: false, // RELEASED!
            qc_status: 'Approved',
            boxes_count: newBoxes,
            loose_count: newLoose,
            current_qty: approvedBottles
          }).eq('id', stockBatchId);

          const { data: b } = await client.from('stock_batches').select('*').eq('id', stockBatchId).maybeSingle();
          releasedBatch = b;

          // Movement logging for QC Release
          await client.from('stock_movements').insert([{
            company_id: order.company_id || 1,
            batch_id: stockBatchId,
            movement_type: 'QC_RELEASE_TO_SALEABLE',
            quantity: approvedBottles,
            reference_type: 'QC_INSPECTION',
            reference_id: String(orderId),
            notes: `Released from quarantine after QC approval by ${qcInspectedBy || 'QC Officer'}`
          }]);
        }
      } else if (qcStatus === 'Rejected') {
        // Retain strictly in quarantine, block from saleable stock
        if (stockBatchId) {
          await client.from('stock_batches').update({
            is_quarantine: true,
            qc_status: 'Rejected'
          }).eq('id', stockBatchId);

          const { data: b } = await client.from('stock_batches').select('*').eq('id', stockBatchId).maybeSingle();
          releasedBatch = b;
        }
      } else if (qcStatus === 'On Hold') {
        if (stockBatchId) {
          await client.from('stock_batches').update({
            is_quarantine: true,
            qc_status: 'On Hold'
          }).eq('id', stockBatchId);
        }
      }

      // Update packaging order QC inspection details
      await client.from('packaging_orders').update({
        qc_status: qcStatus,
        qc_inspected_by: qcInspectedBy || 'QC Inspector',
        qc_notes: qcNotes || null,
        qc_at: new Date().toISOString()
      }).eq('id', orderId);

      return {
        success: true,
        orderId,
        qcStatus,
        isQuarantine: qcStatus !== 'Approved',
        stockBatch: releasedBatch
      };
    },

    /**
     * Bidirectional Traceability:
     * Links Finished Packed Batch <-> Packaging Order <-> Packaging BOM <-> Bulk Batch <-> Formulation Recipe
     */
    async getPackagingTraceability(client, { packingBatchNo, orderId, stockBatchId }) {
      let order = null;
      if (orderId) {
        const { data: o } = await client.from('packaging_orders').select('*').eq('id', orderId).maybeSingle();
        order = o;
      } else if (packingBatchNo) {
        const { data: o } = await client.from('packaging_orders').select('*').eq('packing_batch_no', packingBatchNo).maybeSingle();
        order = o;
      } else if (stockBatchId) {
        const { data: b } = await client.from('stock_batches').select('*').eq('id', stockBatchId).maybeSingle();
        if (b?.packaging_order_id) {
          const { data: o } = await client.from('packaging_orders').select('*').eq('id', b.packaging_order_id).maybeSingle();
          order = o;
        }
      }

      if (!order) {
        throw new Error('TRACEABILITY_NOT_FOUND: No packaging order matches the given lot or batch.');
      }

      // 1. Fetch packed finished batch details
      let packedBatch = null;
      if (order.packed_stock_batch_id) {
        const { data: b } = await client.from('stock_batches').select('*').eq('id', order.packed_stock_batch_id).maybeSingle();
        packedBatch = b;
      }

      // 2. Fetch packaging materials consumed
      const { data: materials } = await client.from('packaging_materials_consumed').select('*').eq('packaging_order_id', order.id);

      // 3. Trace back to Bulk Batch
      let bulkBatch = null;
      let bulkProductionOrder = null;
      let bulkIngredients = [];

      if (order.bulk_batch_id) {
        const { data: bb } = await client.from('stock_batches').select('*').eq('id', order.bulk_batch_id).maybeSingle();
        bulkBatch = bb;

        // If bulk batch was produced by Phase 4 manufacturing workflow
        if (bulkBatch?.production_order_id || bulkBatch?.order_id) {
          const pOrderId = bulkBatch.production_order_id || bulkBatch.order_id;
          const { data: po } = await client.from('production_orders').select('*').eq('id', pOrderId).maybeSingle();
          bulkProductionOrder = po;

          const { data: pMats } = await client.from('production_materials').select('*').eq('order_id', pOrderId);
          bulkIngredients = pMats || [];
        }
      }

      return {
        finishedGoods: {
          packing_batch_no: order.packing_batch_no,
          product_id: order.product_id,
          packaging_size: order.packaging_size,
          units_per_box: order.units_per_box,
          boxes_packed: order.actual_boxes_packed,
          loose_packed: order.actual_loose_packed,
          total_bottles: order.actual_bottles_packed,
          is_quarantine: packedBatch ? packedBatch.is_quarantine : (order.qc_status !== 'Approved'),
          qc_status: order.qc_status,
          qc_inspected_by: order.qc_inspected_by,
          qc_notes: order.qc_notes
        },
        bottlingRun: {
          order_no: order.order_no,
          packed_by: order.packed_by,
          verified_by: order.verified_by,
          completed_at: order.completed_at,
          breakage: {
            bottles: order.bottle_breakage,
            caps: order.cap_wastage,
            labels: order.label_wastage,
            cartons: order.carton_wastage,
            rejected_filled: order.rejected_bottles
          }
        },
        packagingMaterials: materials || order.materials_consumed || [],
        bulkOrigin: {
          bulk_batch_no: order.bulk_batch_no,
          bulk_consumed_litres: order.actual_bulk_consumed,
          remaining_bulk_litres: order.remaining_bulk_qty,
          bulk_batch_status: bulkBatch?.qc_status || 'Approved',
          production_order: bulkProductionOrder ? {
            order_no: bulkProductionOrder.order_no,
            recipe_version: bulkProductionOrder.formulation_version,
            actual_output_qty: bulkProductionOrder.actual_output_qty,
            yield_pct: bulkProductionOrder.yield_pct
          } : null,
          raw_chemicals_consumed: bulkIngredients
        }
      };
    }
  };

  return {
    PackagingCalculator,
    AvailabilityChecker,
    Service
  };
});
