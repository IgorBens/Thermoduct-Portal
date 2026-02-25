// ===== LOOKUP CACHE =====
//
// Batch-fetches and caches installer names, sales order project names,
// and delivery addresses. All data is persisted in localStorage so
// subsequent page loads don't need to re-fetch known IDs.
//
// Usage (from tasks.js after fetching tasks):
//   await Lookups.resolveForTasks(tasks);   // fetches any unknown IDs
//   Lookups.enrichTasks(tasks);             // fills in missing fields
//
// The n8n lookup endpoints:
//   GET {WEBHOOK_LOOKUP_INSTALLERS}?ids=1,2,3    → [{ id, name }]
//   GET {WEBHOOK_LOOKUP_SALES_ORDERS}?ids=1,2,3  → [{ id, project_name }]
//   GET {WEBHOOK_LOOKUP_ADDRESSES}?ids=1,2,3     → [{ id, street, city, zip }]

const Lookups = (() => {
  const CACHE_KEYS = {
    installers:  "lookupInstallers",
    salesOrders: "lookupSalesOrders",
    addresses:   "lookupAddresses",
  };

  // In-memory caches (loaded from localStorage on init)
  let installers  = {};  // id → { id, name }
  let salesOrders = {};  // id → { id, project_name }
  let addresses   = {};  // id → { id, street, city, zip }

  // ── Persistence ──

  function loadAll() {
    try { installers  = JSON.parse(localStorage.getItem(CACHE_KEYS.installers))  || {}; } catch { installers  = {}; }
    try { salesOrders = JSON.parse(localStorage.getItem(CACHE_KEYS.salesOrders)) || {}; } catch { salesOrders = {}; }
    try { addresses   = JSON.parse(localStorage.getItem(CACHE_KEYS.addresses))   || {}; } catch { addresses   = {}; }
  }

  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
  }

  // ── Fetch missing IDs from a lookup endpoint ──

  async function fetchMissing(endpoint, cache, cacheKey, ids) {
    const missing = ids.filter(id => id && !cache[id]);
    if (missing.length === 0) return;

    try {
      const res = await Api.get(endpoint, { ids: missing.join(",") });
      if (!res.ok) return;

      const data = await res.json();
      const items = Array.isArray(data) ? data : (data?.data || []);
      items.forEach(item => {
        if (item.id) cache[item.id] = item;
      });
      save(cacheKey, cache);
    } catch (err) {
      console.warn("[lookups] Fetch error:", err);
    }
  }

  // ── Extract IDs from task objects ──

  // Odoo Many2one fields are [id, display_name] — extract the ID
  function m2oId(field) {
    if (Array.isArray(field)) return field[0] || null;
    if (typeof field === "number") return field;
    return null;
  }

  // Collect all unique IDs that need resolving from a list of tasks.
  // The /tasks-quick Code node already extracts plain numeric IDs:
  //   installateur_id, sale_order_id, address_id
  function collectIds(tasks) {
    const installerIds  = new Set();
    const salesOrderIds = new Set();
    const addressIds    = new Set();

    tasks.forEach(t => {
      // Installer — used for "workers" display
      if (t.installateur_id) installerIds.add(t.installateur_id);

      // Sale order — used for project_name
      if (t.sale_order_id) salesOrderIds.add(t.sale_order_id);

      // Delivery address — used for address_full (street, zip city)
      if (t.address_id) addressIds.add(t.address_id);
    });

    return { installerIds, salesOrderIds, addressIds };
  }

  // ── Public API ──

  // Batch-resolve all lookups needed for a set of tasks
  async function resolveForTasks(tasks) {
    const { installerIds, salesOrderIds, addressIds } = collectIds(tasks);

    await Promise.all([
      installerIds.size  > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_INSTALLERS,   installers,  CACHE_KEYS.installers,  [...installerIds])  : Promise.resolve(),
      salesOrderIds.size > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_SALES_ORDERS, salesOrders, CACHE_KEYS.salesOrders, [...salesOrderIds]) : Promise.resolve(),
      addressIds.size    > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_ADDRESSES,    addresses,   CACHE_KEYS.addresses,   [...addressIds])    : Promise.resolve(),
    ]);
  }

  // Enrich task objects with resolved lookup data.
  // The /tasks-quick Code node already provides:
  //   project_leader (string), address_name (string), order_number (string)
  // Lookups fill in the remaining fields:
  //   project_name, address_full, workers
  function enrichTasks(tasks) {
    tasks.forEach(t => {
      // ── Project name from sales order lookup ──
      if (!t.project_name && t.sale_order_id) {
        const so = salesOrders[t.sale_order_id];
        if (so?.project_name) t.project_name = so.project_name;
      }

      // ── Full address from address lookup (street, zip city) ──
      if (!t.address_full && t.address_id) {
        const addr = addresses[t.address_id];
        if (addr) {
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(" ");
          t.address_full = [addr.street, cityLine].filter(Boolean).join(", ");
          // Also set address_name from lookup if n8n didn't provide one
          if (!t.address_name && addr.street) t.address_name = addr.street;
        }
      }

      // ── Worker name from installer lookup ──
      if ((!t.workers || t.workers.length === 0) && t.installateur_id) {
        const inst = installers[t.installateur_id];
        if (inst?.name) t.workers = [inst.name];
      }
    });
  }

  // Single-item getters (for use outside of task enrichment)
  function getInstaller(id)  { return installers[id]  || null; }
  function getSalesOrder(id) { return salesOrders[id] || null; }
  function getAddress(id)    { return addresses[id]   || null; }

  // Clear all lookup caches
  function clear() {
    installers = {}; salesOrders = {}; addresses = {};
    Object.values(CACHE_KEYS).forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ok */ }
    });
  }

  // Load caches from localStorage on script load
  loadAll();

  return {
    resolveForTasks,
    enrichTasks,
    getInstaller,
    getSalesOrder,
    getAddress,
    clear,
  };
})();
