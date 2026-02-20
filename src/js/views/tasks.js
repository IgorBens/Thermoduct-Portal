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

  const template = `
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">Tasks</div>
        <button id="tasksRefreshBtn" class="secondary btn-sm">Refresh</button>
      </div>
      <div class="filter-row">
        <select id="dateFilter">
          <option value="">All dates</option>
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

  // ── Mount / Unmount ──

  function mount() {
    // For projectleider/warehouse: default to next work day (tomorrow / Monday)
    if (!savedDateFilter && (Auth.hasRole("projectleider") || Auth.hasRole("warehouse"))) {
      roleDefaultDate = getNextWorkDay();
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

    // Refresh button — clears cache so it's a true fresh load
    document.getElementById("tasksRefreshBtn").addEventListener("click", () => {
      allTasks = [];
      try { localStorage.removeItem(CACHE_KEY); } catch { /* ok */ }
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
  }

  // ── Date filter ──

  function populateDateFilter(tasks) {
    const filterEl = document.getElementById("dateFilter");

    const dates = new Set();
    tasks.forEach(t => {
      const d = getTaskDate(t);
      if (d) dates.add(d);
    });

    const prev = filterEl.value;
    filterEl.innerHTML = '<option value="">All dates</option>';
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
  }

  function populateLeaderFilter(tasks) {
    const filterEl = document.getElementById("leaderFilter");
    if (filterEl.style.display === "none") return;

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

    tasks.sort((a, b) => getTaskDate(a).localeCompare(getTaskDate(b)));
    statusEl.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} found.`;

    // Warehouse role: group by worker, Hendrika tasks → "Easykit" at bottom
    if (Auth.hasRole("warehouse")) {
      renderWarehouseGrouped(tasks, listEl);
      return;
    }

    tasks.forEach(t => listEl.appendChild(buildTaskCard(t)));
  }

  // ── Warehouse grouped render ──

  function renderWarehouseGrouped(tasks, listEl) {
    const easykitTasks = [];
    const workerTasks  = []; // non-easykit

    tasks.forEach(t => {
      const leader  = (t.project_leader || "").toLowerCase();
      const workers = (t.workers || []).map(w => w.toLowerCase());
      if (leader.includes("hendrika") || workers.some(w => w.startsWith("dries "))) {
        easykitTasks.push(t);
      } else {
        workerTasks.push(t);
      }
    });

    // Group non-easykit tasks by worker name
    const groups = new Map(); // worker name → [task, …]
    workerTasks.forEach(t => {
      const workers = t.workers || [];
      if (workers.length === 0) {
        // No workers assigned — put under "Unassigned"
        if (!groups.has("Unassigned")) groups.set("Unassigned", []);
        groups.get("Unassigned").push(t);
      } else {
        workers.forEach(w => {
          if (!groups.has(w)) groups.set(w, []);
          groups.get(w).push(t);
        });
      }
    });

    // Render worker groups (sorted alphabetically)
    const sortedWorkers = Array.from(groups.keys()).sort();
    sortedWorkers.forEach(worker => {
      const header = document.createElement("div");
      header.className = "task-group-header";
      header.textContent = worker;
      listEl.appendChild(header);

      groups.get(worker).forEach(t => listEl.appendChild(buildTaskCard(t)));
    });

    // Render Easykit section at the bottom
    if (easykitTasks.length > 0) {
      const header = document.createElement("div");
      header.className = "task-group-header task-group-header--easykit";
      header.textContent = "Easykit";
      listEl.appendChild(header);

      easykitTasks.forEach(t => listEl.appendChild(buildTaskCard(t)));
    }
  }

  // ── Build a single task card element ──

  function buildTaskCard(t) {
    const taskName    = t.name || t.display_name || "Task";
    const dateStr     = getTaskDate(t);
    const addressName = t.address_name
      || (Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : "")
      || t.address || "";

    let projectName = t.project_name || "";
    if (!projectName && Array.isArray(t.project_id) && t.project_id[1]) {
      const raw = t.project_id[1];
      const sep = raw.indexOf(" - S");
      projectName = sep > 0 ? raw.substring(0, sep) : raw;
    }

    const card = document.createElement("div");
    card.className = "task-card";

    // Header
    const header = document.createElement("div");
    header.className = "task-card-header";

    const titleSection = document.createElement("div");
    titleSection.className = "task-card-title-section";

    if (projectName) {
      const proj = document.createElement("div");
      proj.className = "task-card-project";
      proj.textContent = projectName;
      titleSection.appendChild(proj);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "task-card-name";
    nameEl.textContent = taskName + (t.order_number ? ` \u2022 ${t.order_number}` : "");
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
    Router.showView("taskDetail");
    TaskDetailView.render(task);
    TaskDetailView.renderTeam(allTasks);
    TaskDetailView.setLoadingPdfs();
    Documents.init(task);

    // project_id is already in the task list response
    if (task.project_id) {
      TaskDetailView.setProjectId(task.project_id);
      Documents.setProjectId(task.project_id);

      // Fetch documents/PDFs by project_id
      try {
        const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task`, { id: task.project_id });
        if (res.ok) {
          const data = await res.json();
          const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
          TaskDetailView.renderPdfs(payload?.pdfs || []);
        }
      } catch (err) {
        console.error("[tasks] Document fetch error:", err);
      }
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
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/tasks`, {
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

      // 3) Only re-render if data actually changed
      const fresh = JSON.stringify(tasks);
      const stale = JSON.stringify(allTasks);
      if (fresh !== stale) {
        allTasks = tasks;
        populateDateFilter(tasks);
        populateLeaderFilter(tasks);
        filterAndRender();
      } else {
        // Data unchanged — just clear the "updating…" hint
        statusEl.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"} found.`;
      }

      writeCache(pastDays, tasks);
    } catch (err) {
      console.error("[tasks] Network error:", err);
      if (!cached) statusEl.innerHTML = '<span class="error">Network error</span>';
    }
  }

  // ── Register view ──

  Router.register("tasks", {
    template,
    mount,
    unmount,
    tab: { label: "Tasks", roles: ["*"] },
  });

  // Export for external use (e.g. Router could call fetch on refresh)
  return { fetch: fetchTasks };
})();
