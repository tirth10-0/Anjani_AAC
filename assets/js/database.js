/* assets/js/database.js - Supabase Bridge Config */

const supabaseUrl = 'https://galqhecdkeskvgnxjsax.supabase.co';
const supabaseKey = 'sb_publishable_bSLDWrI4YHYCshblzkiKHw_04XepecY';

// Resilient fetch wrapper to transparently recover from clock skew, expired JWTs, or auth failures
async function resilientFetch(input, init) {
  const defaultFetch = window.fetch.bind(window);
  const pubKey = (typeof import_meta !== 'undefined' && import_meta.env) ? import_meta.env.VITE_SUPABASE_PUBLISHABLE_KEY : supabaseKey;
  let response;
  try {
    response = await defaultFetch(input, init);
  } catch (err) {
    throw err;
  }

  if (!response.ok && (response.status === 401 || response.status === 400 || response.status === 403)) {
    try {
      const cloned = response.clone();
      const body = await cloned.json().catch(() => ({}));
      const msg = String(body?.message || body?.details || body?.error_description || body?.error || '').toLowerCase();
      const isAuthError = response.status === 401 || response.status === 403 || msg.includes('jwt') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('claim') || msg.includes('key');

      if (isAuthError) {
        if (msg.includes('jwt issued at future')) {
          console.warn('[Supabase Bridge] Clock skew detected ("JWT issued at future"). Recovering seamlessly...');
          // 1. Wait 1200ms for timestamp alignment
          await new Promise(r => setTimeout(r, 1200));
          let retryResp = await defaultFetch(input, init);
          if (retryResp.ok) return retryResp;
        }

        console.warn('[Supabase Bridge] Auth failure (' + (body?.message || response.status) + '). Retrying anonymously with pubKey...');
        // Fall back to publishable key if token is expired, invalid, or rejected
        const modifiedInit = { ...(init || {}) };
        const headers = new Headers(modifiedInit.headers || {});
        headers.set('apikey', pubKey);
        headers.set('Authorization', 'Bearer ' + pubKey);
        modifiedInit.headers = headers;

        const anonResp = await defaultFetch(input, modifiedInit);
        if (anonResp.ok) {
          try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i);
              if (k && (k.startsWith('sb-') && k.endsWith('-auth-token'))) {
                localStorage.removeItem(k);
              }
            }
          } catch (_) {}
          return anonResp;
        }
      }
    } catch (_) {}
  }

  return response;
}
window.resilientFetch = resilientFetch;

// Supabase CDN is loaded synchronously before this script
if (window.supabase) {
  const url = (typeof import_meta !== 'undefined' && import_meta.env) ? import_meta.env.VITE_SUPABASE_URL : supabaseUrl;
  const key = (typeof import_meta !== 'undefined' && import_meta.env) ? import_meta.env.VITE_SUPABASE_PUBLISHABLE_KEY : supabaseKey;
  window.dbClient = window.supabase.createClient(url, key, {
    auth: {
      storage: window.localStorage,
      autoRefreshToken: true,
      persistSession: true
    },
    global: {
      fetch: resilientFetch
    }
  });
  if (typeof window !== 'undefined' && window.TENANT_CONTEXT && window.TENANT_CONTEXT.init) {
    window.TENANT_CONTEXT.init(true).catch(() => {});
  }
} else {
  console.error("Supabase CDN script not loaded!");
}

window.DB = {
  initDB: async () => {
    console.log('AgroChem ERP Database Bridge Initialized (Connected to Supabase)');
    return true;
  }
};

window.INVENTORY_SERVICE = {
  _techCache: new Map(),

  async getItemStock(itemId) {
    if (!itemId) return 0;
    try {
      const { data: batches, error } = await window.dbClient
        .from('stock_batches')
        .select('current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .gt('current_qty', 0);
      if (error) throw error;
      if (!batches || batches.length === 0) {
        const { data: it } = await window.dbClient.from('inventory_items').select('stock').eq('id', itemId).single();
        return it ? Math.max(0, parseFloat(it.stock) || 0) : 0;
      }
      return batches.reduce((sum, b) => sum + (parseFloat(b.current_qty) || 0), 0);
    } catch (e) {
      console.warn('INVENTORY_SERVICE.getItemStock error:', e);
      return 0;
    }
  },

  async syncItemStock(itemId) {
    if (!itemId) return 0;
    try {
      // Optimized: single query for all batches instead of two separate round-trips
      const { data: batches, error } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory');

      if (error) throw error;

      let totalStock = 0;
      const negUpdates = [];

      (batches || []).forEach(b => {
        const qty = parseFloat(b.current_qty) || 0;
        if (qty < 0) {
          negUpdates.push(window.dbClient.from('stock_batches').update({ current_qty: 0 }).eq('id', b.id));
        } else {
          totalStock += qty;
        }
      });

      if (negUpdates.length > 0) {
        await Promise.all(negUpdates);
      }

      await window.dbClient.from('inventory_items').update({ stock: totalStock }).eq('id', itemId);
      return totalStock;
    } catch (e) {
      console.warn('INVENTORY_SERVICE.syncItemStock error:', e);
      return 0;
    }
  },

  async deductStock(itemId, qtyToDeduct) {
    if (!itemId || !qtyToDeduct || qtyToDeduct <= 0) return 0;
    try {
      let remaining = parseFloat(qtyToDeduct) || 0;
      const { data: batches } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .gt('current_qty', 0)
        .order('id', { ascending: true }); // FIFO: oldest batch first

      const updates = [];
      let newTotalStock = 0;

      if (batches && batches.length > 0) {
        for (const b of batches) {
          const cur = parseFloat(b.current_qty) || 0;
          if (remaining > 0) {
            const deduct = Math.min(cur, remaining);
            const newQty = Math.max(0, cur - deduct);
            updates.push(window.dbClient.from('stock_batches').update({ current_qty: newQty }).eq('id', b.id));
            newTotalStock += newQty;
            remaining -= deduct;
          } else {
            newTotalStock += cur;
          }
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      // Update inventory_items directly without an extra fetch round-trip
      await window.dbClient.from('inventory_items').update({ stock: newTotalStock }).eq('id', itemId);
      return newTotalStock;
    } catch (e) {
      console.warn('INVENTORY_SERVICE.deductStock error:', e);
      return 0;
    }
  },

  async restoreStock(itemId, qtyToRestore) {
    if (!itemId || !qtyToRestore || qtyToRestore <= 0) return 0;
    try {
      const restoreQty = parseFloat(qtyToRestore) || 0;
      const { data: batches } = await window.dbClient
        .from('stock_batches')
        .select('id, current_qty')
        .eq('item_id', itemId)
        .eq('item_type', 'Inventory')
        .order('id', { ascending: false }) // add back to latest batch
        .limit(1);

      if (batches && batches.length > 0) {
        const cur = Math.max(0, parseFloat(batches[0].current_qty) || 0);
        await window.dbClient.from('stock_batches').update({ current_qty: cur + restoreQty }).eq('id', batches[0].id);
      } else {
        const { data: it } = await window.dbClient.from('inventory_items').select('*').eq('id', itemId).single();
        if (it) {
          await window.dbClient.from('stock_batches').insert([{
            item_id: itemId,
            item_name: it.name,
            item_type: 'Inventory',
            batch_no: 'RESTORE-01',
            initial_qty: restoreQty,
            current_qty: restoreQty,
            unit: it.unit || 'Nos',
            purchase_price: 0
          }]);
        }
      }
      return await this.syncItemStock(itemId);
    } catch (e) {
      console.warn('INVENTORY_SERVICE.restoreStock error:', e);
      return 0;
    }
  },

  async resolveTechnicalItem(productId, productName) {
    let pName = (productName || '').trim();
    const cacheKey = `${productId || ''}_${pName.toLowerCase()}`;
    if (this._techCache.has(cacheKey)) {
      return this._techCache.get(cacheKey);
    }

    let candidateId = null;

    if (productId) {
      try {
        const { data: pRow } = await window.dbClient
          .from('products')
          .select('id, name, inventory_item_id')
          .eq('id', productId)
          .maybeSingle();
        if (pRow) {
          if (!pName) pName = (pRow.name || '').trim();
          candidateId = pRow.inventory_item_id;
        }
      } catch (err) {
        console.warn('resolveTechnicalItem product lookup error:', err);
      }
    }

    // 1. If candidateId exists, check whether that item actually exists in inventory_items
    if (candidateId) {
      try {
        const { data: invRow } = await window.dbClient
          .from('inventory_items')
          .select('id, name, unit, category, item_subtype')
          .eq('id', candidateId)
          .maybeSingle();
        if (invRow) {
          this._techCache.set(cacheKey, invRow);
          return invRow;
        }
      } catch (err) {
        console.warn('resolveTechnicalItem candidateId lookup error:', err);
      }
    }

    // 2. If candidateId is invalid or missing, search by product name in inventory_items
    if (pName) {
      try {
        const techSubtypes = ['insecticide', 'herbicide', 'fungicide', 'pgr', 'solvent', 'technical'];

        // Direct name match (case-insensitive)
        const { data: matches } = await window.dbClient
          .from('inventory_items')
          .select('id, name, unit, category, item_subtype')
          .ilike('name', pName);

        if (matches && matches.length > 0) {
          const techMatch = matches.find(m => {
            const cat = String(m.category || '').toLowerCase().trim();
            const sub = String(m.item_subtype || '').toLowerCase().trim();
            return cat === 'technical' || techSubtypes.includes(sub) || techSubtypes.includes(cat);
          }) || matches[0];

          if (techMatch && productId) {
            window.dbClient.from('products').update({ inventory_item_id: techMatch.id }).eq('id', productId).then(null, () => {});
          }
          this._techCache.set(cacheKey, techMatch);
          return techMatch;
        }

        // Fuzzy/fallback name match
        const { data: allItems } = await window.dbClient
          .from('inventory_items')
          .select('id, name, unit, category, item_subtype');

        if (allItems && allItems.length > 0) {
          const normTarget = pName.toLowerCase().replace(/\s+/g, '');
          const fuzzyMatches = allItems.filter(it => {
            const normName = String(it.name || '').toLowerCase().replace(/\s+/g, '');
            return normName === normTarget || normName.includes(normTarget) || normTarget.includes(normName);
          });
          if (fuzzyMatches.length > 0) {
            const bestMatch = fuzzyMatches.find(m => {
              const cat = String(m.category || '').toLowerCase().trim();
              const sub = String(m.item_subtype || '').toLowerCase().trim();
              return cat === 'technical' || techSubtypes.includes(sub) || techSubtypes.includes(cat);
            }) || fuzzyMatches[0];

            if (bestMatch && productId) {
              window.dbClient.from('products').update({ inventory_item_id: bestMatch.id }).eq('id', productId).then(null, () => {});
            }
            this._techCache.set(cacheKey, bestMatch);
            return bestMatch;
          }
        }
      } catch (err) {
        console.warn('resolveTechnicalItem name lookup error:', err);
      }
    }

    return null;
  },

  async reconcileAllStock() {
    try {
      const [{ data: items }, { data: batches }] = await Promise.all([
        window.dbClient.from('inventory_items').select('id'),
        window.dbClient.from('stock_batches').select('item_id, current_qty').eq('item_type', 'Inventory')
      ]);

      if (!items || items.length === 0) return true;

      const totalsMap = {};
      (batches || []).forEach(b => {
        const qty = parseFloat(b.current_qty) || 0;
        if (qty > 0) {
          totalsMap[b.item_id] = (totalsMap[b.item_id] || 0) + qty;
        }
      });

      const updates = items.map(it => {
        const stock = totalsMap[it.id] || 0;
        return window.dbClient.from('inventory_items').update({ stock }).eq('id', it.id);
      });

      await Promise.all(updates);
      return true;
    } catch (e) {
      console.warn('INVENTORY_SERVICE.reconcileAllStock error:', e);
      return false;
    }
  }
};
