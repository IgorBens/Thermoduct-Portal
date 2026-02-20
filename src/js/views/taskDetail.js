// ===== TASK DETAIL VIEW =====
// Single task view with PDFs and documents.

const TaskDetailView = (() => {

  let currentProjectId = null;

  const template = `
    <div class="detail-top-row">
      <button id="backToList" class="secondary">
        &larr; Back to list
      </button>
      <button id="taskRefreshBtn" class="secondary btn-sm">Refresh</button>
    </div>
    <div id="taskDetail"></div>
    <div class="card" id="teamCard" style="display:none">
      <div class="section-title">Ingepland op deze werf</div>
      <div id="teamList" class="hint">&mdash;</div>
    </div>
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">PDFs</div>
        <div id="pdfUploadArea"></div>
      </div>
      <div id="pdfDropzone"></div>
      <div id="pdfUploadProgress"></div>
      <div id="pdfs" class="hint">&mdash;</div>
    </div>
    <div class="card">
      <div class="section-title">Documents</div>
      <div id="docContainer" class="hint">Loading project data...</div>
    </div>
  `;

  let currentTask = null;

  function mount() {
    document.getElementById("backToList").addEventListener("click", () => {
      Router.showView("tasks");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Task refresh button (re-fetches task detail, PDFs + docs)
    document.getElementById("taskRefreshBtn").addEventListener("click", () => refreshTask());

    // Show dropzone only for project leaders
    if (Auth.hasRole("projectleider")) {
      renderDropzone();
    }
  }

  // ── PDF drag-and-drop zone (projectleider only) ──

  function renderDropzone() {
    const container = document.getElementById("pdfDropzone");
    if (!container) return;

    const zone = document.createElement("div");
    zone.className = "pdf-dropzone";
    zone.innerHTML = `
      <div class="pdf-dropzone-content">
        <div class="pdf-dropzone-icon">&#128196;</div>
        <div class="pdf-dropzone-text">
          <strong>Drop PDF files here</strong>
          <span>or click to browse</span>
        </div>
      </div>`;

    // Click to browse
    zone.addEventListener("click", () => triggerUpload());

    // Drag events
    zone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add("pdf-dropzone--active");
    });

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add("pdf-dropzone--active");
    });

    zone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove("pdf-dropzone--active");
      }
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("pdf-dropzone--active");

      const files = Array.from(e.dataTransfer.files);
      handlePdfFiles(files);
    });

    container.appendChild(zone);
  }

  function triggerUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.multiple = true;
    input.addEventListener("change", () => {
      if (input.files.length > 0) handlePdfFiles(Array.from(input.files));
    });
    input.click();
  }

  // ── File handling & validation ──

  async function handlePdfFiles(files) {
    if (!currentProjectId) {
      alert("No project linked — cannot upload.");
      return;
    }

    const validFiles = files.filter(file => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext !== "pdf" && file.type !== "application/pdf") {
        showUploadStatus(file.name, "error", "Not a PDF file");
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Upload all files and wait for every one to finish
    const results = await Promise.allSettled(
      validFiles.map(file => uploadPdf(file))
    );

    const anySuccess = results.some(r => r.status === "fulfilled" && r.value === true);

    // Single refresh after all uploads complete (with a small delay for backend processing)
    if (anySuccess) {
      setTimeout(() => refreshPdfs(), 800);
    }
  }

  function showUploadStatus(fileName, status, message) {
    const container = document.getElementById("pdfUploadProgress");
    if (!container) return null;

    const row = document.createElement("div");
    row.className = `pdf-upload-row pdf-upload-row--${status}`;

    const name = document.createElement("span");
    name.className = "pdf-upload-row-name";
    name.textContent = fileName;
    name.title = fileName;
    row.appendChild(name);

    const msg = document.createElement("span");
    msg.className = "pdf-upload-row-status";
    msg.textContent = message || status;
    row.appendChild(msg);

    container.appendChild(row);

    if (status === "success" || status === "error") {
      setTimeout(() => row.remove(), 4000);
    }

    return row;
  }

  async function uploadPdf(file) {
    const row = showUploadStatus(file.name, "uploading", "Uploading\u2026");

    try {
      const base64 = await fileToBase64(file);

      const res = await Api.post(CONFIG.WEBHOOK_PDF_UPLOAD, {
        project_id: currentProjectId,
        filename:   file.name,
        data:       base64,
      });

      const result = await res.json();

      if (row) row.remove();

      if (res.ok && result.success !== false) {
        showUploadStatus(file.name, "success", "Uploaded!");
        return true;
      } else {
        showUploadStatus(file.name, "error", result.message || "Upload failed");
        return false;
      }
    } catch (err) {
      console.error("[taskDetail] PDF upload error:", err);
      if (row) row.remove();
      showUploadStatus(file.name, "error", "Network error");
      return false;
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // result is "data:application/pdf;base64,AAAA…" — strip the prefix
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function refreshTask() {
    if (!currentTask) return;

    const btn = document.getElementById("taskRefreshBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Refreshing\u2026"; }

    setLoadingPdfs();

    try {
      // Re-fetch task list to get fresh task data (description, dates, etc.)
      // past_days=0 keeps it scoped to upcoming only (task detail refresh)
      const tasksRes = await Api.get(`${CONFIG.WEBHOOK_TASKS}/tasks`, { past_days: 0 });
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        const tasks = Array.isArray(tasksData) ? tasksData
          : (tasksData?.data && Array.isArray(tasksData.data)) ? tasksData.data
          : [];
        // Match by id + date to avoid picking a different day's task
        // for the same project (e.g. yesterday vs today)
        const currentDate = getTaskDate(currentTask);
        const fresh = tasks.find(t => t.id === currentTask.id && getTaskDate(t) === currentDate)
          || tasks.find(t => t.id === currentTask.id);
        if (fresh) {
          currentTask = fresh;
          render(fresh);
        }
        renderTeam(tasks);
      }

      // Re-fetch PDFs + docs
      if (currentProjectId) {
        const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task`, { id: currentProjectId });
        if (res.ok) {
          const data = await res.json();
          const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
          renderPdfs(payload?.pdfs || []);
        }
      }
    } catch (err) {
      console.error("[taskDetail] Task refresh error:", err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
    }
  }

  async function refreshPdfs() {
    if (!currentProjectId) return;

    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task`, { id: currentProjectId });
      const text = await res.text();

      let data;
      try { data = JSON.parse(text); } catch { return; }

      const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
      renderPdfs(payload?.pdfs || []);
    } catch (err) {
      console.error("[taskDetail] PDF refresh error:", err);
    }
  }

  // ── PDF loading state ──

  function setLoadingPdfs() {
    const el = document.getElementById("pdfs");
    if (!el) return;
    el.className = "hint";
    el.textContent = "Loading PDFs\u2026";
  }

  // ── Render task detail card ──

  function render(task) {
    currentTask = task;
    const el = document.getElementById("taskDetail");
    if (!el) return;
    el.innerHTML = "";

    if (!task || !task.id) {
      el.innerHTML = '<div class="hint">No task data.</div>';
      return;
    }

    const card = document.createElement("div");
    card.className = "task-detail";

    if (task.project_name) {
      const proj = document.createElement("div");
      proj.className = "task-detail-project";
      proj.textContent = task.project_name;
      card.appendChild(proj);
    }

    const nameRow = document.createElement("div");
    nameRow.className = "task-detail-name";
    nameRow.textContent = task.name || task.display_name || "Task";
    if (task.order_number) nameRow.textContent += ` \u2022 ${task.order_number}`;
    card.appendChild(nameRow);

    const grid = document.createElement("div");
    grid.className = "task-detail-grid";

    let dateStr = task.date || "";
    if (!dateStr && task.planned_date_begin) {
      dateStr = String(task.planned_date_begin).split(" ")[0];
    }

    if (dateStr) {
      grid.innerHTML += `
        <div class="task-detail-item">
          <span class="detail-label">Date</span>
          <span class="detail-value">${formatDateLabel(dateStr)}</span>
        </div>`;
    }

    if (task.project_leader) {
      grid.innerHTML += `
        <div class="task-detail-item">
          <span class="detail-label">Project leader</span>
          <span class="detail-value">${escapeHtml(task.project_leader)}</span>
        </div>`;
    }

    if (task.address_name || task.address_full) {
      grid.innerHTML += `
        <div class="task-detail-item">
          <span class="detail-label">Address</span>
          <span class="detail-value">
            ${task.address_name ? `<strong>${escapeHtml(task.address_name)}</strong>` : ""}
            ${task.address_full ? `<br>${escapeHtml(task.address_full)}` : ""}
          </span>
        </div>`;
    }

    if (grid.children.length > 0) card.appendChild(grid);

    if (task.description) {
      const desc = document.createElement("div");
      desc.className = "task-detail-description";

      const label = document.createElement("div");
      label.className = "detail-label";
      label.textContent = "Description";
      desc.appendChild(label);

      const content = document.createElement("div");
      content.className = "detail-description-content";
      content.innerHTML = task.description;
      desc.appendChild(content);

      card.appendChild(desc);
    }

    el.appendChild(card);
  }

  // ── Render PDFs ──

  function renderPdfs(pdfs) {
    const el = document.getElementById("pdfs");
    if (!el) return;
    el.innerHTML = "";

    if (!pdfs || pdfs.length === 0) {
      el.className = "hint";
      el.textContent = "No PDFs.";
      return;
    }

    el.className = "";

    pdfs.forEach((p, i) => {
      const name = p.name || `PDF ${i + 1}`;

      const row = document.createElement("div");
      row.className = "pdf-row";

      const info = document.createElement("div");
      const nameDiv = document.createElement("div");
      nameDiv.className = "pdf-name";
      nameDiv.textContent = name;
      info.appendChild(nameDiv);

      const meta = document.createElement("div");
      meta.className = "pdf-meta";
      meta.textContent = p.mimetype || "application/pdf";
      info.appendChild(meta);

      row.appendChild(info);

      const btns = document.createElement("div");
      btns.style.cssText = "display:flex;gap:8px";

      const viewBtn = document.createElement("button");
      viewBtn.textContent = "View";
      viewBtn.className = "secondary btn-sm";
      viewBtn.addEventListener("click", () => viewPdf(p.data));
      btns.appendChild(viewBtn);

      const dlBtn = document.createElement("button");
      dlBtn.textContent = "Download";
      dlBtn.className = "btn-sm";
      dlBtn.addEventListener("click", () => downloadPdf(p.data, name));
      btns.appendChild(dlBtn);

      row.appendChild(btns);
      el.appendChild(row);
    });
  }

  // ── Team / co-workers ──

  // Extract a comparable project ID (handle Odoo Many2one arrays)
  function getProjectIdValue(task) {
    return Array.isArray(task.project_id) ? task.project_id[0] : task.project_id;
  }

  // Extract worker/employee name from a task (Odoo planning slot)
  function getWorkerName(task) {
    if (task.employee_name) return task.employee_name;
    if (task.worker_name) return task.worker_name;
    if (Array.isArray(task.resource_id) && task.resource_id[1]) return task.resource_id[1];
    if (Array.isArray(task.employee_id) && task.employee_id[1]) return task.employee_id[1];
    if (Array.isArray(task.user_id) && task.user_id[1]) return task.user_id[1];
    if (typeof task.resource_id === "string" && task.resource_id) return task.resource_id;
    if (typeof task.employee_id === "string" && task.employee_id) return task.employee_id;
    return "";
  }

  // Render all workers planned on the same project + date
  function renderTeam(allTasks) {
    const card = document.getElementById("teamCard");
    const el = document.getElementById("teamList");
    if (!el || !card || !currentTask) return;

    const names = new Set();

    // 1) Check for a "workers" field on the task itself (from n8n)
    const taskWorkers = currentTask.workers || currentTask.team_members || [];
    taskWorkers.forEach(w => {
      const name = typeof w === "string" ? w
        : (w?.name || (Array.isArray(w) ? w[1] : ""));
      if (name) names.add(name);
    });

    // 2) Find co-tasks in the full task list (same project + same date)
    if (allTasks && allTasks.length > 0) {
      const pid = getProjectIdValue(currentTask);
      const date = getTaskDate(currentTask);
      allTasks.forEach(t => {
        if (getProjectIdValue(t) === pid && getTaskDate(t) === date) {
          const name = getWorkerName(t);
          if (name) names.add(name);
        }
      });
    }

    if (names.size === 0) {
      card.style.display = "none";
      return;
    }

    card.style.display = "";
    el.className = "team-list";
    el.innerHTML = "";

    names.forEach(name => {
      const chip = document.createElement("span");
      chip.className = "team-chip";
      // Initials avatar
      const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      chip.innerHTML = `<span class="team-chip-avatar">${escapeHtml(initials)}</span>${escapeHtml(name)}`;
      el.appendChild(chip);
    });
  }

  // ── Set project ID (called from tasks.js) ──

  function setProjectId(pid) {
    currentProjectId = pid;
  }

  // ── Register (no tab — accessed via task list, not nav) ──

  Router.register("taskDetail", { template, mount });

  return { render, renderPdfs, setLoadingPdfs, setProjectId, renderTeam };
})();
