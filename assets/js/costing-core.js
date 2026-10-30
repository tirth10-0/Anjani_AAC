/**
 * assets/js/costing-core.js
 * AgroChem ERP - Inventory Costing, Valuation & Manufacturing Cost Absorption Engine
 *
 * Provides:
 * 1. Documented Inventory Costing Methods:
 *    - FIFO (First-In, First-Out) Costing based on active stock batches.
 *    - Weighted Average Cost (WAC) based on active batches.
 * 2. Strict Separation of Physical Inventory Quantities vs Financial Valuation:
 *    - Physical quantity: tracked in inventory_items.stock / stock_batches.current_qty.
 *    - Financial valuation: evaluated strictly using historical batch purchase costs.
 * 3. Historical Purchase Price Protection:
 *    - Entering new purchase orders or editing product master catalog prices
 *      NEVER modifies historical closed batches, historical production runs, or posted costs.
 * 4. Documented Manufacturing Cost Calculation:
 *    - Real-time material absorption: sum(consumed_qty * batch_purchase_price).
 *    - Machine runtime, direct labor, and utility overhead allowance.
 *    - Output cost per unit based on actual yield and wastage.
 * 5. Documented Packaging Cost Calculation:
 *    - Bulk chemical cost per Litre/Kg.
 *    - Components consumed: bottles/containers, caps, labels, cartons/boxes.
 *    - Breakage and wastage absorption into sound packed units.
 *    - SKU-specific box cost and unit cost calculations.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.COSTING_CORE = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class CostingEngine {
    constructor(dbClient = null) {
      this.db = dbClient || (typeof window !== 'undefined' ? window.dbClient : null);
      // Standard overhead configuration defaults
      this.overheadConfig = {
        laborRatePerHour: 250.00,       // Rs. 250 / hour
        machineRatePerHour: 450.00,     // Rs. 450 / hour (power + wear)
        standardUtilityCostPerUnit: 1.50 // Rs. 1.50 / Litre or Kg
      };
    }

    setDb(dbClient) {
      this.db = dbClient;
    }

    setOverheadRates({ laborRate = 250, machineRate = 450, utilityRate = 1.5 }) {
      this.overheadConfig.laborRatePerHour = parseFloat(laborRate) || 250;
      this.overheadConfig.machineRatePerHour = parseFloat(machineRate) || 450;
      this.overheadConfig.standardUtilityCostPerUnit = parseFloat(utilityRate) || 1.5;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. INVENTORY VALUATION & COSTING METHODS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Compute Item Valuation using Weighted Average Cost (WAC).
     * WAC = Sum(current_qty * purchase_price) / Sum(current_qty)
     */
    calculateWeightedAverageCost(batches) {
      if (!Array.isArray(batches) || batches.length === 0) {
        return { averageCost: 0, totalQty: 0, totalValuation: 0 };
      }

      let totalQty = 0;
      let totalValuation = 0;

      batches.forEach(b => {
        const qty = Math.max(0, parseFloat(b.current_qty) || 0);
        const price = Math.max(0, parseFloat(b.purchase_price) || 0);
        totalQty += qty;
        totalValuation += (qty * price);
      });

      const averageCost = totalQty > 0 ? (totalValuation / totalQty) : 0;

      return {
        averageCost: Math.round(averageCost * 100) / 100,
        totalQty: Math.round(totalQty * 100) / 100,
        totalValuation: Math.round(totalValuation * 100) / 100
      };
    }

    /**
     * Compute Item Valuation using FIFO Costing.
     * Evaluates active stock batches in chronological purchase order.
     */
    calculateFIFOCost(batches, requestedQty = null) {
      if (!Array.isArray(batches) || batches.length === 0) {
        return { totalCost: 0, unitCost: 0, evaluatedQty: 0, batchBreakdown: [] };
      }

      // Sort batches oldest first
      const sorted = [...batches].sort((a, b) => {
        const da = a.purchase_date || a.created_at || '';
        const db = b.purchase_date || b.created_at || '';
        return new Date(da) - new Date(db);
      });

      let remaining = requestedQty !== null ? parseFloat(requestedQty) : Infinity;
      let totalCost = 0;
      let evaluatedQty = 0;
      const breakdown = [];

      for (const b of sorted) {
        const cur = Math.max(0, parseFloat(b.current_qty) || 0);
        if (cur <= 0) continue;

        const take = Math.min(cur, remaining);
        const unitPrice = Math.max(0, parseFloat(b.purchase_price) || 0);
        const lineCost = take * unitPrice;

        totalCost += lineCost;
        evaluatedQty += take;
        remaining -= take;

        breakdown.push({
          batchId: b.id,
          batchNo: b.batch_no,
          qtyEvaluated: take,
          unitPrice,
          lineCost: Math.round(lineCost * 100) / 100
        });

        if (remaining <= 0) break;
      }

      const effectiveUnitCost = evaluatedQty > 0 ? (totalCost / evaluatedQty) : 0;

      return {
        totalCost: Math.round(totalCost * 100) / 100,
        unitCost: Math.round(effectiveUnitCost * 100) / 100,
        evaluatedQty: Math.round(evaluatedQty * 100) / 100,
        batchBreakdown: breakdown
      };
    }

    /**
     * Compute Complete Enterprise Inventory Valuation.
     * Explicitly separates physical stock counts from financial asset values.
     */
    computeInventoryValuation(stockBatches, method = 'FIFO') {
      const batches = Array.isArray(stockBatches) ? stockBatches : [];

      let totalPhysicalUnits = 0;
      let totalRawMaterialValuation = 0;
      let totalPackagingValuation = 0;
      let totalBulkProductValuation = 0;
      let totalFinishedGoodsValuation = 0;
      const itemsMap = new Map();

      batches.forEach(b => {
        const qty = Math.max(0, parseFloat(b.current_qty) || 0);
        const price = Math.max(0, parseFloat(b.purchase_price) || 0);
        const lineValuation = qty * price;
        totalPhysicalUnits += qty;

        const key = b.item_name || `Item-${b.item_id}`;
        if (!itemsMap.has(key)) {
          itemsMap.set(key, {
            itemId: b.item_id,
            name: key,
            type: b.item_type || 'Inventory',
            unit: b.unit || 'Nos',
            batches: []
          });
        }
        itemsMap.get(key).batches.push(b);

        // Classify category valuation
        const typeStr = String(b.item_type || '').toLowerCase();
        const nameStr = String(b.item_name || '').toLowerCase();

        if (nameStr.includes('bottle') || nameStr.includes('cap') || nameStr.includes('label') || nameStr.includes('carton') || nameStr.includes('box')) {
          totalPackagingValuation += lineValuation;
        } else if (typeStr === 'catalog' || typeStr === 'finished good' || b.packaging_size) {
          totalFinishedGoodsValuation += lineValuation;
        } else if (nameStr.includes('bulk') || nameStr.includes('formulation')) {
          totalBulkProductValuation += lineValuation;
        } else {
          totalRawMaterialValuation += lineValuation;
        }
      });

      const itemsReport = [];
      for (const item of itemsMap.values()) {
        const wac = this.calculateWeightedAverageCost(item.batches);
        const fifo = this.calculateFIFOCost(item.batches);

        itemsReport.push({
          itemId: item.itemId,
          name: item.name,
          type: item.type,
          unit: item.unit,
          physicalStock: wac.totalQty,
          wacUnitCost: wac.averageCost,
          wacValuation: wac.totalValuation,
          fifoValuation: fifo.totalCost,
          batchesCount: item.batches.length
        });
      }

      const totalValuation = totalRawMaterialValuation + totalPackagingValuation + totalBulkProductValuation + totalFinishedGoodsValuation;

      return {
        valuationDate: new Date().toISOString().substring(0, 10),
        costingMethod: method,
        totalPhysicalUnits: Math.round(totalPhysicalUnits * 100) / 100,
        totalValuation: Math.round(totalValuation * 100) / 100,
        categorySummary: {
          rawMaterials: Math.round(totalRawMaterialValuation * 100) / 100,
          packagingMaterials: Math.round(totalPackagingValuation * 100) / 100,
          bulkChemicals: Math.round(totalBulkProductValuation * 100) / 100,
          packedFinishedGoods: Math.round(totalFinishedGoodsValuation * 100) / 100
        },
        items: itemsReport
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. DOCUMENTED MANUFACTURING COST CALCULATION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Calculates the exact manufacturing production cost of a batch.
     * Considers:
     * - Raw materials consumed (based on actual FIFO batch purchase prices).
     * - Production overheads (direct labor hours, machine hours, utility allowance).
     * - Yield variance and wastage percentage.
     */
    calculateManufacturingCost({
      orderNo,
      productName,
      batchNo,
      plannedQty,
      actualYield,
      consumedIngredients = [], // [{ name, quantity, unit, batchPurchasePrice }]
      laborHours = 4,
      machineHours = 4,
      customOverhead = 0
    }) {
      const planQ = Math.max(0, parseFloat(plannedQty) || 0);
      const actYield = Math.max(0, parseFloat(actualYield) || 0);

      // 1. Raw Materials Cost Absorption
      let totalMaterialCost = 0;
      const ingredientDetails = [];

      consumedIngredients.forEach(ing => {
        const qty = Math.max(0, parseFloat(ing.quantity) || 0);
        const unitPrice = Math.max(0, parseFloat(ing.batchPurchasePrice || ing.unitPrice) || 0);
        const cost = qty * unitPrice;
        totalMaterialCost += cost;

        ingredientDetails.push({
          name: ing.name,
          quantity: qty,
          unit: ing.unit || 'Litre',
          unitCost: unitPrice,
          totalCost: Math.round(cost * 100) / 100
        });
      });

      // 2. Production Overhead & Conversion Cost
      const laborCost = (parseFloat(laborHours) || 0) * this.overheadConfig.laborRatePerHour;
      const machineCost = (parseFloat(machineHours) || 0) * this.overheadConfig.machineRatePerHour;
      const utilityCost = actYield * this.overheadConfig.standardUtilityCostPerUnit;
      const totalOverheadCost = laborCost + machineCost + utilityCost + (parseFloat(customOverhead) || 0);

      // 3. Total Production Cost
      const totalManufacturingCost = totalMaterialCost + totalOverheadCost;

      // 4. Yield Variance & Unit Cost
      const lossQty = Math.max(0, planQ - actYield);
      const yieldPercentage = planQ > 0 ? (actYield / planQ) * 100 : 100;
      const costPerUnit = actYield > 0 ? (totalManufacturingCost / actYield) : 0;

      return {
        orderNo,
        batchNo,
        productName,
        plannedQty: planQ,
        actualYield: actYield,
        lossQty: Math.round(lossQty * 100) / 100,
        yieldPercentage: Math.round(yieldPercentage * 100) / 100,
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        overheadBreakdown: {
          laborCost: Math.round(laborCost * 100) / 100,
          machineCost: Math.round(machineCost * 100) / 100,
          utilityCost: Math.round(utilityCost * 100) / 100,
          totalOverhead: Math.round(totalOverheadCost * 100) / 100
        },
        totalManufacturingCost: Math.round(totalManufacturingCost * 100) / 100,
        costPerUnit: Math.round(costPerUnit * 100) / 100,
        ingredientBreakdown: ingredientDetails
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. DOCUMENTED PACKAGING COST CALCULATION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Calculates the exact packaging and bottling cost per SKU.
     * Considers:
     * - Bulk chemical consumed (at bulk unit cost).
     * - Packaging materials (bottles, caps, labels, cartons, boxes).
     * - Breakage and rejected units (absorbed into finished product cost).
     * - Dynamic box and unit breakdown.
     */
    calculatePackagingCost({
      lotNo,
      sku,
      packagingSize,
      unitsPerBox = 10,
      plannedBottles,
      approvedSoundBottles,
      brokenOrRejectedBottles = 0,
      bulkChemicalCostPerLitre,
      bulkVolumePerBottleLitres = 0.5,
      bottleCost = 12.00,
      capCost = 3.50,
      labelCost = 2.00,
      cartonBoxCost = 35.00,
      packagingLaborAllowancePerUnit = 2.00
    }) {
      const soundUnits = Math.max(0, parseInt(approvedSoundBottles, 10) || 0);
      const brokenUnits = Math.max(0, parseInt(brokenOrRejectedBottles, 10) || 0);
      const totalBottlesProcessed = soundUnits + brokenUnits;
      const perBox = Math.max(1, parseInt(unitsPerBox, 10) || 10);

      // 1. Bulk Chemical Cost Consumed
      const bulkVolPerUnit = parseFloat(bulkVolumePerBottleLitres) || 0.5;
      const totalBulkLitresConsumed = totalBottlesProcessed * bulkVolPerUnit;
      const bulkUnitPrice = parseFloat(bulkChemicalCostPerLitre) || 0;
      const totalBulkCost = totalBulkLitresConsumed * bulkUnitPrice;

      // 2. Packaging Components Consumed
      const bPrice = parseFloat(bottleCost) || 0;
      const cPrice = parseFloat(capCost) || 0;
      const lPrice = parseFloat(labelCost) || 0;
      const bxPrice = parseFloat(cartonBoxCost) || 0;
      const laborAllowance = parseFloat(packagingLaborAllowancePerUnit) || 0;

      const totalBottlesCost = totalBottlesProcessed * bPrice;
      const totalCapsCost = totalBottlesProcessed * cPrice;
      const totalLabelsCost = totalBottlesProcessed * lPrice;

      // Boxes required for sound units
      const totalBoxes = Math.ceil(soundUnits / perBox);
      const totalCartonsCost = totalBoxes * bxPrice;
      const totalPackagingLabor = soundUnits * laborAllowance;

      const totalPackagingMaterialsCost = totalBottlesCost + totalCapsCost + totalLabelsCost + totalCartonsCost + totalPackagingLabor;

      // 3. Breakage Absorption
      // Cost of broken components is fully absorbed into sound saleable units
      const brokenUnitsDirectLoss = brokenUnits * (bPrice + cPrice + (bulkVolPerUnit * bulkUnitPrice));

      // 4. Total Packaging Run Cost & Unit Metrics
      const totalRunCost = totalBulkCost + totalPackagingMaterialsCost;
      const finalCostPerUnit = soundUnits > 0 ? (totalRunCost / soundUnits) : 0;
      const finalCostPerBox = finalCostPerUnit * perBox;

      const boxesPacked = Math.floor(soundUnits / perBox);
      const looseUnits = soundUnits % perBox;

      return {
        lotNo,
        sku,
        packagingSize,
        unitsPerBox: perBox,
        soundUnitsPacked: soundUnits,
        boxesPacked,
        looseUnits,
        totalBoxesRequired: totalBoxes,
        brokenUnitsDeducted: brokenUnits,
        totalBulkLitresConsumed: Math.round(totalBulkLitresConsumed * 100) / 100,
        bulkCostAbsorption: Math.round(totalBulkCost * 100) / 100,
        packagingComponentsBreakdown: {
          bottlesCost: Math.round(totalBottlesCost * 100) / 100,
          capsCost: Math.round(totalCapsCost * 100) / 100,
          labelsCost: Math.round(totalLabelsCost * 100) / 100,
          cartonsCost: Math.round(totalCartonsCost * 100) / 100,
          packagingLabor: Math.round(totalPackagingLabor * 100) / 100,
          totalPackagingMaterials: Math.round(totalPackagingMaterialsCost * 100) / 100
        },
        brokenUnitsLossAbsorbed: Math.round(brokenUnitsDirectLoss * 100) / 100,
        totalRunCost: Math.round(totalRunCost * 100) / 100,
        costPerSoundUnit: Math.round(finalCostPerUnit * 100) / 100,
        costPerBox: Math.round(finalCostPerBox * 100) / 100
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. HISTORICAL PRICE PRESERVATION GUARANTEE
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Validates that historical closed batches and transactions are protected.
     * Throws an error if any operation attempts to mutate closed historical prices.
     */
    verifyHistoricalPriceImmutability(historicalBatch, proposedPrice) {
      if (!historicalBatch) return true;
      const originalPrice = parseFloat(historicalBatch.purchase_price);

      // If batch is historical (already has stock movements or was created previously), price is immutable
      if (historicalBatch.id && historicalBatch.purchase_price !== undefined) {
        if (Math.abs(originalPrice - parseFloat(proposedPrice)) > 0.001) {
          throw new Error(`HISTORICAL_PRICE_PROTECTED: Cannot alter closed batch ${historicalBatch.batch_no || historicalBatch.id} historical purchase price (Rs. ${originalPrice}) to Rs. ${proposedPrice}. Historical transaction values must remain unchanged.`);
        }
      }
      return true;
    }
  }

  const defaultInstance = new CostingEngine();
  defaultInstance.CostingEngine = CostingEngine;

  return defaultInstance;
});
