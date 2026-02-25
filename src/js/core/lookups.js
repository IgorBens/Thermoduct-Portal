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

  // Collect all unique IDs that need resolving from a list of tasks
  function collectIds(tasks) {
    const installerIds  = new Set();
    const salesOrderIds = new Set();
    const addressIds    = new Set();

    tasks.forEach(t => {
      // Installer (x_studio_installateur) — used for "workers" display
      const instId = m2oId(t.x_studio_installateur);
      if (instId) installerIds.add(instId);

      // Project leader (x_studio_projectleider) — also a res.partner
      const leaderId = m2oId(t.x_studio_projectleider);
      if (leaderId) installerIds.add(leaderId);

      // Fallback: worker_ids array or employee_id
      if (Array.isArray(t.worker_ids)) {
        t.worker_ids.forEach(id => { if (id) installerIds.add(id); });
      }
      const empId = m2oId(t.employee_id);
      if (empId) installerIds.add(empId);

      // Sale order ID
      const soId = m2oId(t.sale_order_id);
      if (soId) salesOrderIds.add(soId);

      // Delivery address ID
      const addrId = m2oId(t.x_studio_afleveradres) || m2oId(t.partner_id);
      if (addrId) addressIds.add(addrId);
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

  // Enrich task objects with resolved lookup data (only fills missing fields)
  function enrichTasks(tasks) {
    tasks.forEach(t => {
      // ── Project name from sales order ──
      if (!t.project_name) {
        const soId = m2oId(t.sale_order_id);
        const so = soId ? salesOrders[soId] : null;
        if (so?.project_name) t.project_name = so.project_name;
      }

      // ── Project leader from x_studio_projectleider ──
      if (!t.project_leader) {
        const leaderId = m2oId(t.x_studio_projectleider);
        const leader = leaderId ? installers[leaderId] : null;
        if (leader?.name) t.project_leader = leader.name;
      }

      // ── Address from partner/delivery address ──
      if (!t.address_name && !t.address_full) {
        const addrId = m2oId(t.x_studio_afleveradres) || m2oId(t.partner_id);
        const addr = addrId ? addresses[addrId] : null;
        if (addr) {
          // address_name: bold label (street)
          if (addr.street) t.address_name = addr.street;
          // address_full: street, zip city
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(" ");
          t.address_full = [addr.street, cityLine].filter(Boolean).join(", ");
        }
      }

      // ── Workers from x_studio_installateur ──
      if (!t.workers || t.workers.length === 0) {
        const instId = m2oId(t.x_studio_installateur);
        const inst = instId ? installers[instId] : null;
        if (inst?.name) t.workers = [inst.name];

        // Fallback: worker_ids array
        if (!t.workers || t.workers.length === 0) {
          const wIds = t.worker_ids || [];
          if (wIds.length > 0) {
            const names = wIds.map(id => installers[id]?.name).filter(Boolean);
            if (names.length > 0) t.workers = names;
          }
        }
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
