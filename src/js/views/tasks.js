// ===== TASKS VIEW =====
// Task list with date filtering. Opens TaskDetailView on click.
//
// Sends `past_days` param to the API so n8n/Odoo only returns
// tasks from (today - past_days) → (today + 3). Default is 0
// (no past). User picks how far back via a dropdown.
//
// Performance: Uses stale-while-revalidate — cached tasks are shown
// instantly from localStorage, then the API is called in the background.
// If the response differs, the view silently re-renders.

const TaskList = (() => {
  let allTasks = [];

  // Cached filter state (survives mount/unmount when navigating to detail and back)
  let savedDateFilter    = "";
  let savedLeaderFilter  = "";
  let savedPastDays      = "0";
  let roleDefaultDate    = null; // next-work-day default for projectleider/warehouse

  // ── localStorage cache helpers ──
  const CACHE_KEY = "tasksCache";

  function readCache(pastDays) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      if (cache.pastDays !== pastDays) return null; // wrong scope
      return cache.tasks || null;
    } catch { return null; }
  }

  function writeCache(pastDays, tasks) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ pastDays, tasks }));
    } catch { /* quota exceeded — ignore */ }
  }

  function buildListTemplate() {
    const easykit = Auth.hasRole("easykit");
    return `
    ${easykit ? '<div class="card" id="routeMapCard" style="display:none"><div class="section-title">Delivery route</div><div id="routeMap" class="route-map"></div></div>' : ""}
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">Tasks</div>
        <button id="tasksRefreshBtn" class="secondary btn-sm">Refresh</button>
      </div>
      <div class="filter-row">
        <select id="dateFilter">
          ${easykit ? "" : '<option value="">All dates</option>'}
        </select>
        <select id="leaderFilter" style="display:none">
          <option value="">All project leaders</option>
        </select>
        <select id="pastDaysFilter">
          <option value="0">Upcoming only</option>
          <option value="7">+ last 7 days</option>
          <option value="14">+ last 14 days</option>
          <option value="30">+ last 30 days</option>
        </select>
      </div>
      <div id="taskStatus" class="hint">&mdash;</div>
      <div id="taskList"></div>
    </div>
  `;
  }

  // ── Mount / Unmount ──

  function mount() {
    // Role-based date defaults (first load only)
    if (!savedDateFilter) {
      if (Auth.hasRole("easykit")) {
        roleDefaultDate = getTodayString();
      } else if (Auth.hasRole("projectleider") || Auth.hasRole("warehouse")) {
        roleDefaultDate = getNextWorkDay();
      }
    }

    // Restore filter state
    document.getElementById("dateFilter").value = savedDateFilter;
    document.getElementById("pastDaysFilter").value = savedPastDays;

    // Show project leader filter for warehouse (and projectleider/admin — useful when seeing all tasks)
    const leaderEl = document.getElementById("leaderFilter");
    if (Auth.hasRole("warehouse") || Auth.hasRole("projectleider") || Auth.hasRole("admin")) {
      leaderEl.style.display = "";
      leaderEl.value = savedLeaderFilter;
    }

    // Refresh button — full reset: clears task + lookup caches, re-fetches everything
    document.getElementById("tasksRefreshBtn").addEventListener("click", () => {
      allTasks = [];
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ok */ }
      Lookups.clear();
      fetchTasks();
    });

    // Bind filter events
    document.getElementById("dateFilter").addEventListener("change", filterAndRender);
    document.getElementById("leaderFilter").addEventListener("change", filterAndRender);
    document.getElementById("pastDaysFilter").addEventListener("change", () => {
      // Different scope — clear in-memory tasks and re-fetch
      // (localStorage cache is keyed by pastDays so stale data won't show)
      allTasks = [];
      fetchTasks();
    });

    if (allTasks.length > 0) {
      // Returning from detail view — render from cache, no re-fetch
      populateDateFilter(allTasks);
      populateLeaderFilter(allTasks);
      filterAndRender();
    } else {
      fetchTasks();
    }
  }

  function unmount() {
    savedDateFilter   = document.getElementById("dateFilter")?.value || "";
    savedLeaderFilter = document.getElementById("leaderFilter")?.value || "";
    savedPastDays     = document.getElementById("pastDaysFilter")?.value || "0";

    // Clean up Leaflet map instance
    if (routeMap) { routeMap.remove(); routeMap = null; }
  }

  // ── Date filter ──

  function populateDateFilter(tasks) {
    const filterEl = document.getElementById("dateFilter");
    if (!filterEl) return;

    const dates = new Set();
    tasks.forEach(t => {
      const d = getTaskDate(t);
      if (d) dates.add(d);
    });

    const prev = filterEl.value;
    const easykit = Auth.hasRole("easykit");

    // Easykit: no "All dates" — always filter by a specific day
    filterEl.innerHTML = easykit ? "" : '<option value="">All dates</option>';
    Array.from(dates).sort().forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = formatDateLabel(d);
      filterEl.appendChild(opt);
    });

    // Apply role-based default on first load, then normal restore
    if (!prev && roleDefaultDate) {
      filterEl.value = roleDefaultDate;
      roleDefaultDate = null;
    } else {
      filterEl.value = prev;
    }

    // Easykit: if the selected value didn't stick (e.g. today has no tasks), pick the first available
    if (easykit && !filterEl.value && filterEl.options.length > 0) {
      filterEl.value = filterEl.options[0].value;
    }
  }

  function populateLeaderFilter(tasks) {
    const filterEl = document.getElementById("leaderFilter");
    if (!filterEl || filterEl.style.display === "none") return;

    const leaders = new Set();
    tasks.forEach(t => {
      if (t.project_leader) leaders.add(t.project_leader);
    });

    const prev = filterEl.value;
    filterEl.innerHTML = '<option value="">All project leaders</option>';
    Array.from(leaders).sort().forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      filterEl.appendChild(opt);
    });
    filterEl.value = prev;
  }

  // Check if a task belongs to "Easykit VOLZET" (catch-all project, not a real delivery)
  function isEasykitVolzet(task) {
    const pid = task.project_id;
    const pName = (Array.isArray(pid) ? pid[1] : "") || task.project_name || "";
    return pName.toLowerCase().includes("easykit volzet");
  }

  function filterAndRender() {
    const selected = document.getElementById("dateFilter").value;
    const leader   = document.getElementById("leaderFilter").value;

    let filtered = allTasks;
    if (selected) {
      filtered = filtered.filter(t => getTaskDate(t) === selected);
    }
    if (leader) {
      filtered = filtered.filter(t => t.project_leader === leader);
    }

    // Easykit: hide "Easykit VOLZET" tasks (not real deliveries)
    if (Auth.hasRole("easykit")) {
      filtered = filtered.filter(t => !isEasykitVolzet(t));
    }

    render(filtered);
  }

  // ── Render task cards ──

  function render(tasks) {
    const listEl   = document.getElementById("taskList");
    const statusEl = document.getElementById("taskStatus");
    listEl.innerHTML = "";

    if (!tasks?.length) {
      statusEl.textContent = "No tasks found.";
      return;
    }

    statusEl.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} found.`;

    // Easykit role: keep the exact order from Odoo planning (no sort) + show route map
    if (Auth.hasRole("easykit")) {
      tasks.forEach(t => listEl.appendChild(buildTaskCard(t)));
      renderRouteMap(tasks);
      return;
    }

    tasks.sort((a, b) => getTaskDate(a).localeCompare(getTaskDate(b)));

    tasks.forEach(t => listEl.appendChild(buildTaskCard(t)));
  }

  // ── Easykit route map ──

  let routeMap = null;       // Leaflet map instance
  let mapGeneration = 0;     // Cancel stale async renders

  const GEO_CACHE_KEY = "geoCache";

  function readGeoCache() {
    try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {}; } catch { return {}; }
  }
  function writeGeoCache(cache) {
    try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch { /* ok */ }
  }

  async function geocodeAddress(address, cache) {
    if (cache[address]) return cache[address];

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&countrycodes=be&limit=1&q=${encodeURIComponent(address)}`,
        { headers: { "Accept-Language": "nl" } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        cache[address] = coords;
        writeGeoCache(cache);
        return coords;
      }
    } catch (err) {
      console.warn("[tasks] Geocode error for:", address, err);
    }
    return null;
  }

  async function renderRouteMap(tasks) {
    const gen = ++mapGeneration; // Mark this render generation

    const mapCard = document.getElementById("routeMapCard");
    const mapEl   = document.getElementById("routeMap");
    if (!mapCard || !mapEl) return;

    // Only render when address lookups have resolved (address_street is set by Lookups)
    // If not resolved yet, skip — we'll be called again after enrichment
    const hasEnrichedAddresses = tasks.some(t => t.address_street);
    if (!hasEnrichedAddresses) return;

    // Collect addresses with their task order
    // Use street + zip for geocoding (reliable), full address for display
    const stops = tasks
      .map((t, i) => {
        const display = t.address_full || t.address_name || "";
        // Build a clean geocoding query: "Street, Zip, Belgium"
        const geoQuery = t.address_street && t.address_zip
          ? `${t.address_street}, ${t.address_zip}, Belgium`
          : "";
        return {
          index: i + 1,
          name: t.name || t.display_name || "Task",
          address: display,
          geoQuery,
        };
      })
      .filter(s => s.geoQuery);

    if (stops.length === 0) {
      mapCard.style.display = "none";
      return;
    }

    mapCard.style.display = "";

    // Init or reset map
    if (routeMap) {
      routeMap.remove();
      routeMap = null;
    }
    routeMap = L.map(mapEl).setView([50.85, 4.35], 8); // Belgium center
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 18,
    }).addTo(routeMap);

    // Geocode all addresses (with 1s delay between to respect Nominatim policy)
    const geoCache = readGeoCache();
    const coords = [];

    for (let i = 0; i < stops.length; i++) {
      if (gen !== mapGeneration) return; // Stale — a newer render started

      const stop = stops[i];
      // Small delay between uncached requests to respect Nominatim rate limit
      if (i > 0 && !geoCache[stop.geoQuery]) {
        await new Promise(r => setTimeout(r, 1100));
      }
      if (gen !== mapGeneration) return; // Check again after wait

      const c = await geocodeAddress(stop.geoQuery, geoCache);
      if (c) {
        coords.push({ ...stop, ...c });
      }
    }

    if (gen !== mapGeneration) return; // Final stale check

    if (coords.length === 0) {
      mapCard.style.display = "none";
      return;
    }

    // Add numbered markers
    coords.forEach(stop => {
      const icon = L.divIcon({
        className: "route-marker",
        html: `<span>${stop.index}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<strong>${stop.index}. ${escapeHtml(stop.name)}</strong><br>${escapeHtml(stop.address)}`)
        .addTo(routeMap);
    });

    // Draw route line
    if (coords.length > 1) {
      const latlngs = coords.map(c => [c.lat, c.lng]);
      L.polyline(latlngs, { color: "#0097A7", weight: 3, opacity: 0.7, dashArray: "8 4" }).addTo(routeMap);
    }

    // Fit map to show all markers
    const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lng]));
    routeMap.fitBounds(bounds, { padding: [30, 30] });
  }

  // ── Build a single task card element ──

  function buildTaskCard(t) {
    const taskName    = t.name || t.display_name || "Task";
    const dateStr     = getTaskDate(t);
    const addressName = t.address_name
      || (Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : "")
      || t.address || "";

    const projectName = t.project_name || "";

    const card = document.createElement("div");
    card.className = "task-card";

    // Header
    const header = document.createElement("div");
    header.className = "task-card-header";

    const titleSection = document.createElement("div");
    titleSection.className = "task-card-title-section";

    // Easykit: task name is the header, project name is the subtitle
    const easykit = Auth.hasRole("easykit");
    const headerText = easykit ? taskName : projectName;
    const subText    = easykit ? projectName : (taskName + (t.order_number ? ` \u2022 ${t.order_number}` : ""));

    if (headerText) {
      const proj = document.createElement("div");
      proj.className = "task-card-project";
      proj.textContent = headerText;
      titleSection.appendChild(proj);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "task-card-name";
    nameEl.textContent = easykit ? subText : subText;
    titleSection.appendChild(nameEl);

    header.appendChild(titleSection);

    if (dateStr) {
      const badge = document.createElement("span");
      badge.className = "task-card-date";
      if (dateStr === getTodayString()) badge.classList.add("today");
      else if (isDateInPast(dateStr)) badge.classList.add("past");
      badge.textContent = formatDateLabel(dateStr);
      header.appendChild(badge);
    }

    card.appendChild(header);

    // Details
    const details = document.createElement("div");
    details.className = "task-card-details";

    if (addressName || t.address_full) {
      const addr = document.createElement("div");
      addr.className = "task-card-detail";
      addr.innerHTML = '<span class="detail-icon">&#128205;</span>';
      const text = document.createElement("span");
      if (addressName) {
        const b = document.createElement("strong");
        b.textContent = addressName;
        text.appendChild(b);
      }
      if (t.address_full) {
        if (addressName) text.appendChild(document.createElement("br"));
        text.appendChild(document.createTextNode(t.address_full));
      }
      addr.appendChild(text);
      details.appendChild(addr);
    }

    if (t.project_leader) {
      const leader = document.createElement("div");
      leader.className = "task-card-detail";
      leader.innerHTML = `<span class="detail-icon">&#128100;</span><span>${escapeHtml(t.project_leader)}</span>`;
      details.appendChild(leader);
    }

    const workers = t.workers || [];
    if (workers.length > 0) {
      const row = document.createElement("div");
      row.className = "task-card-detail";
      row.innerHTML = '<span class="detail-icon">&#128119;</span>';
      const list = document.createElement("span");
      list.className = "task-card-workers";
      list.textContent = workers.join(", ");
      row.appendChild(list);
      details.appendChild(row);
    }

    if (details.children.length > 0) card.appendChild(details);

    // Footer
    const footer = document.createElement("div");
    footer.className = "task-card-footer";

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "secondary btn-sm";
    openBtn.addEventListener("click", () => openTask(t));
    footer.appendChild(openBtn);

    card.appendChild(footer);
    return card;
  }

  // ── Open single task ──

  async function openTask(task) {
    const easykit = Auth.hasRole("easykit");

    Router.showView("taskDetail");
    TaskDetailView.render(task);
    TaskDetailView.setLoadingPdfs();

    if (!easykit) {
      TaskDetailView.renderTeam(allTasks);
      Collectors.init();
    }

    // Easykit: load task photos
    if (easykit) {
      TaskDetailView.loadTaskPhotos();
    }

    // project_id is already in the task list response
    const hasPid = !!task.project_id;
    const pid = hasPid
      ? (Array.isArray(task.project_id) ? task.project_id[0] : task.project_id)
      : null;

    if (pid) TaskDetailView.setProjectId(pid);

    if (!easykit && pid) {
      // Pass project name so collector photos use a readable directory name
      if (task.project_name) Collectors.setProjectName(task.project_name);
      Collectors.setProjectId(pid);
    }

    // Fetch task info (description) — always fetch for all roles using task_id
    const infoParams = { task_id: task.id };
    if (pid) infoParams.id = pid;
    const infoPromise = Api.get(`${CONFIG.WEBHOOK_TASKS}/task-info`, infoParams);

    // Fetch documents (PDFs) — needs project_id
    const docsPromise = pid
      ? Api.get(`${CONFIG.WEBHOOK_TASKS}/task-docs`, { id: pid, task_id: task.id })
      : null;

    // Task info comes back fast — render description immediately
    try {
      const res = await infoPromise;
      if (res.ok) {
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text);
          const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
          if (payload?.description !== undefined) {
            task.description = payload.description;
            TaskDetailView.render(task);
          }
        }
      }
    } catch (err) {
      console.error("[tasks] Task info fetch error:", err);
    }

    // Documents come back slower — render PDFs when ready
    if (docsPromise) {
      try {
        const res = await docsPromise;
        if (res.ok) {
          const text = await res.text();
          if (text) {
            const data = JSON.parse(text);
            const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
            TaskDetailView.renderPdfs(payload?.pdfs || []);
          }
        }
      } catch (err) {
        console.error("[tasks] Document fetch error:", err);
      }
    } else {
      TaskDetailView.renderPdfs([]);
    }
  }

  // ── Fetch tasks (stale-while-revalidate) ──

  async function fetchTasks() {
    const listEl   = document.getElementById("taskList");
    const statusEl = document.getElementById("taskStatus");

    if (!Auth.isAuthenticated()) {
      statusEl.textContent = "Please log in first.";
      return;
    }

    const pastDays = document.getElementById("pastDaysFilter")?.value || "0";

    // 1) Show cached data instantly (if available for this pastDays scope)
    const cached = readCache(pastDays);
    if (cached && cached.length > 0) {
      Lookups.enrichTasks(cached);
      allTasks = cached;
      populateDateFilter(cached);
      populateLeaderFilter(cached);
      filterAndRender();
      statusEl.textContent = `${cached.length} task${cached.length === 1 ? "" : "s"} (updating\u2026)`;
    } else {
      statusEl.textContent = pastDays === "0"
        ? "Loading tasks\u2026"
        : `Loading tasks (+ last ${pastDays} days)\u2026`;
      listEl.innerHTML = "";
    }

    // 2) Fetch fresh data in background
    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/tasks-quick`, {
        past_days: pastDays,
      });
      const text = await res.text();

      if (!res.ok) {
        if (!cached) statusEl.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
        return;
      }

      let data = [];
      try { data = JSON.parse(text); } catch { /* empty */ }

      let tasks;
      if (Array.isArray(data)) tasks = data;
      else if (data?.data && Array.isArray(data.data)) tasks = data.data;
      else if (data?.id !== undefined) tasks = [data];
      else tasks = [];

      // 3) Enrich from in-memory lookup cache first (instant, no network)
      Lookups.enrichTasks(tasks);

      // Render immediately with whatever names we already have cached
      allTasks = tasks;
      populateDateFilter(tasks);
      populateLeaderFilter(tasks);
      filterAndRender();

      // Snapshot before lookups so we can detect new data
      const beforeLookups = JSON.stringify(tasks);

      // 4) Fetch any missing lookups (skipped entirely when TTL is fresh)
      try {
        await Lookups.resolveForTasks(tasks);
        Lookups.enrichTasks(tasks);
      } catch (err) {
        console.warn("[tasks] Lookup enrichment failed (non-fatal):", err);
      }

      // 5) Re-render if lookups added new data (e.g. project names)
      if (JSON.stringify(tasks) !== beforeLookups) {
        allTasks = tasks;
        populateDateFilter(tasks);
        populateLeaderFilter(tasks);
        filterAndRender();
      }
      statusEl.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} found.`;

      writeCache(pastDays, tasks);
    } catch (err) {
      // Session expired — api.js already redirected to login
      if (err.message?.includes("Session expired")) return;

      console.error("[tasks] Network error:", err);
      if (!cached) statusEl.innerHTML = '<span class="error">Network error</span>';
    }
  }

  // ── Register view ──

  Router.register("tasks", {
    get template() { return buildListTemplate(); },
    mount,
    unmount,
    tab: { label: "Tasks", roles: ["*"] },
  });

  // Export for external use (e.g. Router could call fetch on refresh)
  return { fetch: fetchTasks };
})();
