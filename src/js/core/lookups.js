// ===== LOOKUP CACHE =====
//
// Batch-fetches and caches installer names, sales order project names,
// and delivery addresses via n8n lookup webhooks (proxied through API_BASE_URL).
//
// Caches are persisted in localStorage with a TTL.  While the TTL is
// valid, no network request is made — the in-memory data is used as-is.
// Only genuinely missing IDs (never seen before) trigger a fetch.
//
// Usage (from tasks.js after fetching tasks):
//   await Lookups.resolveForTasks(tasks);
//   Lookups.enrichTasks(tasks);

const Lookups = (() => {
  const CACHE_KEYS = {
    installers:  "lookupInstallers",
    salesOrders: "lookupSalesOrders",
    addresses:   "lookupAddresses",
  };

  // How long each cache stays valid (ms)
  const TTL = {
    installers:  4 * 60 * 60 * 1000,  // 4 hours — names rarely change
    salesOrders: 2 * 60 * 60 * 1000,  // 2 hours
    addresses:   2 * 60 * 60 * 1000,  // 2 hours
  };

  let installers  = {};
  let salesOrders = {};
  let addresses   = {};

  // Timestamps (epoch ms) of the last successful fetch per type
  let timestamps = { installers: 0, salesOrders: 0, addresses: 0 };

  function loadAll() {
    try {
      const raw = localStorage.getItem("lookupTimestamps");
      if (raw) timestamps = JSON.parse(raw);
    } catch { timestamps = { installers: 0, salesOrders: 0, addresses: 0 }; }

    try { installers  = JSON.parse(localStorage.getItem(CACHE_KEYS.installers))  || {}; } catch { installers  = {}; }
    try { salesOrders = JSON.parse(localStorage.getItem(CACHE_KEYS.salesOrders)) || {}; } catch { salesOrders = {}; }
    try { addresses   = JSON.parse(localStorage.getItem(CACHE_KEYS.addresses))   || {}; } catch { addresses   = {}; }
  }

  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
  }

  function saveTimestamps() {
    try { localStorage.setItem("lookupTimestamps", JSON.stringify(timestamps)); } catch { /* ok */ }
  }

  function isFresh(type) {
    return Date.now() - (timestamps[type] || 0) < TTL[type];
  }

  async function fetchMissing(endpoint, cache, cacheKey, type, ids) {
    const missing = ids.filter(id => id && !cache[id]);

    // Nothing missing at all — skip
    if (missing.length === 0) return;

    // Always fetch genuinely missing IDs — even if the cache TTL is fresh.
    // This ensures new installers / addresses / sales orders added in Odoo
    // show up immediately on the next browser refresh.
    try {
      const res = await Api.get(endpoint, { ids: missing.join(",") });
      if (!res.ok) return;

      const data = await res.json();
      const items = Array.isArray(data) ? data : (data?.data || []);
      items.forEach(item => {
        if (item.id) cache[item.id] = item;
      });
      save(cacheKey, cache);
      timestamps[type] = Date.now();
      saveTimestamps();
    } catch (err) {
      console.warn("[lookups] Fetch error:", err);
    }
  }

  function collectIds(tasks) {
    const installerIds  = new Set();
    const salesOrderIds = new Set();
    const addressIds    = new Set();

    tasks.forEach(t => {
      const iid = t.installateur_id;
      if (Array.isArray(iid)) {
        iid.forEach(id => { if (id) installerIds.add(id); });
      } else if (iid) {
        installerIds.add(iid);
      }
      if (t.sale_order_id) salesOrderIds.add(t.sale_order_id);
      if (t.address_id) addressIds.add(t.address_id);
    });

    return { installerIds, salesOrderIds, addressIds };
  }

  async function resolveForTasks(tasks) {
    const { installerIds, salesOrderIds, addressIds } = collectIds(tasks);

    await Promise.all([
      installerIds.size  > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_INSTALLERS,   installers,  CACHE_KEYS.installers,  "installers",  [...installerIds])  : Promise.resolve(),
      salesOrderIds.size > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_SALES_ORDERS, salesOrders, CACHE_KEYS.salesOrders, "salesOrders", [...salesOrderIds]) : Promise.resolve(),
      addressIds.size    > 0 ? fetchMissing(CONFIG.WEBHOOK_LOOKUP_ADDRESSES,    addresses,   CACHE_KEYS.addresses,   "addresses",   [...addressIds])    : Promise.resolve(),
    ]);
  }

  function enrichTasks(tasks) {
    tasks.forEach(t => {
      if (t.sale_order_id) {
        const so = salesOrders[t.sale_order_id];
        if (so?.project_name) t.project_name = so.project_name;
      }

      if (!t.address_full && t.address_id) {
        const addr = addresses[t.address_id];
        if (addr) {
          const cityLine = [addr.zip, addr.city].filter(Boolean).join(" ");
          t.address_full = [addr.street, cityLine].filter(Boolean).join(", ");
          if (!t.address_name && addr.street) t.address_name = addr.street;
        }
      }

      if ((!t.workers || t.workers.length === 0) && t.installateur_id) {
        const ids = Array.isArray(t.installateur_id) ? t.installateur_id : [t.installateur_id];
        const names = ids
          .map(id => installers[id]?.name)
          .filter(Boolean);
        if (names.length > 0) t.workers = names;
      }
    });
  }

  function clear() {
    installers = {}; salesOrders = {}; addresses = {};
    timestamps = { installers: 0, salesOrders: 0, addresses: 0 };
    Object.values(CACHE_KEYS).forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ok */ }
    });
    try { localStorage.removeItem("lookupTimestamps"); } catch { /* ok */ }
  }

  loadAll();

  return { resolveForTasks, enrichTasks, clear };
})();
