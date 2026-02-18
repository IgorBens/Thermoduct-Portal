// ===== TASKS VIEW =====
// Task list with date filtering. Opens TaskDetailView on click.

const TaskList = (() => {
  let allTasks = [];
  // Cached filter state (survives mount/unmount when navigating to detail and back)
  let savedDateFilter = "";
  let savedShowPast   = false;

  const template = `
    <div class="card">
      <div class="section-title">Taken</div>
      <div class="filter-row">
        <select id="dateFilter">
          <option value="">Alle datums</option>
        </select>
        <label class="checkbox-label">
          <input type="checkbox" id="showPastDates" /> Toon verleden
        </label>
      </div>
      <div id="taskStatus" class="hint">&mdash;</div>
      <div id="taskList"></div>
    </div>
  `;

  // ── Mount / Unmount ──

  function mount() {
    // Restore filter state
    document.getElementById("dateFilter").value = savedDateFilter;
    document.getElementById("showPastDates").checked = savedShowPast;

    // Bind filter events
    document.getElementById("dateFilter").addEventListener("change", filterAndRender);
    document.getElementById("showPastDates").addEventListener("change", () => {
      populateDateFilter(allTasks);
      filterAndRender();
    });

    if (allTasks.length > 0) {
      // Returning from detail view — render from cache, no re-fetch
      populateDateFilter(allTasks);
      filterAndRender();
    } else {
      fetchTasks();
    }
  }

  function unmount() {
    savedDateFilter = document.getElementById("dateFilter")?.value || "";
    savedShowPast   = document.getElementById("showPastDates")?.checked || false;
  }

  // ── Date filter ──

  function populateDateFilter(tasks) {
    const filterEl = document.getElementById("dateFilter");
    const showPast = document.getElementById("showPastDates").checked;
    const todayStr = getTodayString();

    const dates = new Set();
    tasks.forEach(t => {
      const d = getTaskDate(t);
      if (d && (showPast || d >= todayStr)) dates.add(d);
    });

    const prev = filterEl.value;
    filterEl.innerHTML = '<option value="">Alle datums</option>';
    Array.from(dates).sort().forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = formatDateLabel(d);
      filterEl.appendChild(opt);
    });
    filterEl.value = prev;
  }

  function filterAndRender() {
    const selected = document.getElementById("dateFilter").value;
    const showPast = document.getElementById("showPastDates").checked;
    const todayStr = getTodayString();

    let filtered = allTasks;
    if (selected) {
      filtered = allTasks.filter(t => getTaskDate(t) === selected);
    } else if (!showPast) {
      filtered = allTasks.filter(t => getTaskDate(t) >= todayStr);
    }

    render(filtered);
  }

  // ── Render task cards ──

  function render(tasks) {
    const listEl   = document.getElementById("taskList");
    const statusEl = document.getElementById("taskStatus");
    listEl.innerHTML = "";

    if (!tasks?.length) {
      statusEl.textContent = "Geen taken gevonden.";
      return;
    }

    tasks.sort((a, b) => getTaskDate(a).localeCompare(getTaskDate(b)));
    statusEl.textContent = `${tasks.length} ta${tasks.length === 1 ? "ak" : "ken"} gevonden.`;

    tasks.forEach(t => {
      const taskName    = t.name || t.display_name || "Task";
      const dateStr     = getTaskDate(t);
      const addressName = t.address_name
        || (Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : "")
        || t.address || "";

      const card = document.createElement("div");
      card.className = "task-card";

      // Header
      const header = document.createElement("div");
      header.className = "task-card-header";

      const titleSection = document.createElement("div");
      titleSection.className = "task-card-title-section";

      if (t.project_name) {
        const proj = document.createElement("div");
        proj.className = "task-card-project";
        proj.textContent = t.project_name;
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
      listEl.appendChild(card);
    });
  }

  // ── Open single task ──

  async function openTask(task) {
    Router.showView("taskDetail");
    TaskDetailView.render(task);
    TaskDetailView.renderPdfs([]);
    Documents.init(task);

    // Fetch full task data (PDFs + project_id for documents)
    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task/${encodeURIComponent(task.id)}`);
      if (res.ok) {
        const data = await res.json();
        const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
        TaskDetailView.renderPdfs(payload?.pdfs || []);
        if (payload?.project_id) Documents.setProjectId(payload.project_id);
      }
    } catch (err) {
      console.error("[tasks] Detail fetch error:", err);
    }
  }

  // ── Fetch tasks ──

  async function fetchTasks() {
    const listEl   = document.getElementById("taskList");
    const statusEl = document.getElementById("taskStatus");

    if (!Auth.isAuthenticated()) {
      statusEl.textContent = "Log eerst in.";
      return;
    }

    statusEl.textContent = "Taken laden\u2026";
    listEl.innerHTML = "";

    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/tasks`);
      const text = await res.text();

      let data = [];
      try { data = JSON.parse(text); } catch { /* empty */ }

      if (!res.ok) {
        statusEl.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
        return;
      }

      let tasks;
      if (Array.isArray(data)) tasks = data;
      else if (data?.data && Array.isArray(data.data)) tasks = data.data;
      else if (data?.id !== undefined) tasks = [data];
      else tasks = [];

      allTasks = tasks;
      populateDateFilter(tasks);
      filterAndRender();
    } catch (err) {
      console.error("[tasks] Network error:", err);
      statusEl.innerHTML = '<span class="error">Netwerkfout</span>';
    }
  }

  // ── Register view ──

  Router.register("tasks", {
    template,
    mount,
    unmount,
    tab: { label: "Taken", roles: ["*"] },
  });

  // Export for external use (e.g. Router could call fetch on refresh)
  return { fetch: fetchTasks };
})();
