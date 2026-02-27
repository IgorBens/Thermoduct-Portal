// ===== TASK DETAIL VIEW =====
// Single task view with PDFs and documents.

const TaskDetailView = (() => {

  let currentProjectId = null;

  const isEasykit = () => Auth.hasRole("easykit");

  function buildTemplate() {
    const easykit = isEasykit();
    return `
    <div class="detail-top-row">
      <button id="backToList" class="secondary">
        &larr; Back to list
      </button>
      <button id="taskRefreshBtn" class="secondary btn-sm">Refresh</button>
    </div>
    <div id="taskDetail"></div>
    ${easykit ? "" : `
    <div class="card" id="teamCard" style="display:none">
      <div class="section-title">Scheduled on this site</div>
      <div id="teamList" class="hint">&mdash;</div>
    </div>`}
    ${easykit ? `
    <div class="card" id="detailMapCard" style="display:none">
      <div class="section-title">Location</div>
      <div id="detailMap" class="detail-map"></div>
    </div>
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">Photos</div>
        <button id="taskPhotoUploadBtn" class="secondary btn-sm">Add file</button>
      </div>
      <div id="taskPhotoStatus"></div>
      <div id="taskPhotoGallery" class="task-photo-gallery hint">&mdash;</div>
    </div>` : `
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">Files</div>
        <div id="pdfUploadArea"></div>
      </div>
      <div id="pdfDropzone"></div>
      <div id="pdfUploadProgress"></div>
      <div id="pdfs" class="hint">&mdash;</div>
    </div>
    <div class="card">
      <div class="section-title">Collectors</div>
      <div id="collectorContainer" class="hint">Loading collectors...</div>
    </div>`}
  `;
  }

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

    // Easykit: bind photo upload button
    const photoBtn = document.getElementById("taskPhotoUploadBtn");
    if (photoBtn) {
      photoBtn.addEventListener("click", () => triggerTaskPhotoUpload());
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
          <strong>Drop files here</strong>
          <span>PDF or photos &mdash; click to browse</span>
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
    input.accept = ".pdf,.jpg,.jpeg,.png,.heic,.heif";
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

    const allowedExts = new Set(["pdf", "jpg", "jpeg", "png", "heic", "heif"]);
    const allowedMime = /^(application\/pdf|image\/(jpeg|png|heic|heif))$/;

    const validFiles = files.filter(file => {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!allowedExts.has(ext) && !allowedMime.test(file.type)) {
        showUploadStatus(file.name, "error", "Unsupported file type");
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const total = validFiles.length;
    let done = 0;
    console.log(`[taskDetail] uploading ${total} files (3 parallel, compressed)`);

    // First file goes alone so Odoo can create the folder, then rest in parallel
    const first = validFiles[0];
    const rest  = validFiles.slice(1);

    console.log(`[taskDetail] uploading first file to ensure folder exists: ${first.name}`);
    try { await uploadPdf(first); } catch { /* handled in uploadPdf */ }
    done++;

    if (rest.length > 0) {
      await parallelMap(rest, 3, async (file) => {
        try {
          await uploadPdf(file);
        } catch { /* handled in uploadPdf */ }
        done++;
      });
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
      const { base64, filename } = await compressImage(file);

      const res = await Api.post(CONFIG.WEBHOOK_PDF_UPLOAD, {
        project_id: currentProjectId,
        filename,
        data:       base64,
      });

      const result = await res.json();

      if (row) row.remove();

      if (res.ok && result.success !== false) {
        showUploadStatus(filename, "success", "Uploaded!");

        // Optimistically add the file to the UI immediately
        const mime = /\.pdf$/i.test(filename) ? "application/pdf" : "image/jpeg";
        appendPdfRow({ name: filename, mimetype: mime, data: base64 });
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

  async function refreshTask() {
    if (!currentTask || !currentProjectId) return;

    const btn = document.getElementById("taskRefreshBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Refreshing\u2026"; }

    setLoadingPdfs();

    const params = { id: currentProjectId, task_id: currentTask?.id };
    const infoPromise = Api.get(`${CONFIG.WEBHOOK_TASKS}/task-info`, params);
    const docsPromise = Api.get(`${CONFIG.WEBHOOK_TASKS}/task-docs`, params);

    // Task info renders immediately
    try {
      const res = await infoPromise;
      if (res.ok) {
        const data = await res.json();
        const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
        if (payload?.description !== undefined) {
          currentTask.description = payload.description;
        }
        render(currentTask);
      }
    } catch (err) {
      console.error("[taskDetail] Task info refresh error:", err);
    }

    // Documents render when ready
    try {
      const res = await docsPromise;
      if (res.ok) {
        const data = await res.json();
        const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
        renderPdfs(payload?.pdfs || []);
      }
    } catch (err) {
      console.error("[taskDetail] Document refresh error:", err);
    }

    // Easykit: also refresh task photos
    if (isEasykit()) loadTaskPhotos();

    // Refresh collectors (projectleider view)
    if (!isEasykit()) Collectors.refresh();

    if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
  }

  async function refreshPdfs() {
    if (!currentProjectId) return;

    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task-docs`, { id: currentProjectId, task_id: currentTask?.id });
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
    el.textContent = "Loading files\u2026";
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

    const taskName = task.name || task.display_name || "Task";
    const easykit = isEasykit();

    // Easykit: task name is the big header, project name is the subtitle
    const headerText = easykit ? taskName : task.project_name;
    const subText    = easykit ? (task.project_name || "") : (taskName + (task.order_number ? ` \u2022 ${task.order_number}` : ""));

    if (headerText) {
      const proj = document.createElement("div");
      proj.className = "task-detail-project";
      proj.textContent = headerText;
      card.appendChild(proj);
    }

    const nameRow = document.createElement("div");
    nameRow.className = "task-detail-name";
    nameRow.textContent = subText;
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

    // Render single-task map for easykit
    if (isEasykit()) renderDetailMap(task);
  }

  // ── Detail map (easykit) ──

  let detailMapInstance = null;

  async function renderDetailMap(task) {
    const mapCard = document.getElementById("detailMapCard");
    const mapEl   = document.getElementById("detailMap");
    if (!mapCard || !mapEl) return;

    const geoQuery = task.address_street && task.address_zip
      ? `${task.address_street}, ${task.address_zip}, Belgium`
      : "";

    if (!geoQuery) { mapCard.style.display = "none"; return; }

    // Geocode using Nominatim (with localStorage cache)
    const GEO_KEY = "geoCache";
    let cache;
    try { cache = JSON.parse(localStorage.getItem(GEO_KEY)) || {}; } catch { cache = {}; }

    let coords = cache[geoQuery] || null;
    if (!coords) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `format=json&countrycodes=be&limit=1&q=${encodeURIComponent(geoQuery)}`,
          { headers: { "Accept-Language": "nl" } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          cache[geoQuery] = coords;
          try { localStorage.setItem(GEO_KEY, JSON.stringify(cache)); } catch { /* ok */ }
        }
      } catch (err) {
        console.warn("[taskDetail] Geocode error:", err);
      }
    }

    if (!coords) { mapCard.style.display = "none"; return; }

    mapCard.style.display = "";

    // Init or reset map
    if (detailMapInstance) {
      detailMapInstance.remove();
      detailMapInstance = null;
    }

    detailMapInstance = L.map(mapEl).setView([coords.lat, coords.lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 18,
    }).addTo(detailMapInstance);

    const display = task.address_full || task.address_name || "";
    L.marker([coords.lat, coords.lng])
      .addTo(detailMapInstance)
      .bindPopup(`<strong>${escapeHtml(task.name || "Task")}</strong><br>${escapeHtml(display)}`)
      .openPopup();

    // Fix tile rendering when map container was hidden
    setTimeout(() => detailMapInstance.invalidateSize(), 200);
  }

  // ── Delete PDF from Odoo ──

  async function deletePdf(filename, btnEl) {
    if (!confirm(`Delete "${filename}"?`)) return;
    if (!currentProjectId) return;

    btnEl.disabled = true;
    btnEl.textContent = "\u2026";

    try {
      const res = await Api.delete(CONFIG.WEBHOOK_PDF_UPLOAD, {
        project_id: currentProjectId,
        filename,
      });
      const result = await res.json();

      if (res.ok && result.success !== false) {
        const row = btnEl.closest(".pdf-row");
        row?.remove();

        // Show "No files." when list is empty
        const el = document.getElementById("pdfs");
        if (el && el.children.length === 0) {
          el.className = "hint";
          el.textContent = "No files.";
        }
      } else {
        btnEl.disabled = false;
        btnEl.textContent = "Delete";
      }
    } catch (err) {
      console.error("[taskDetail] PDF delete error:", err);
      btnEl.disabled = false;
      btnEl.textContent = "Delete";
    }
  }

  // ── Render PDFs ──

  function buildPdfRow(p, index) {
    const mime = p.mimetype || "application/pdf";
    const name = p.name || `File ${index + 1}`;
    const image = isImageMime(mime);

    const row = document.createElement("div");
    row.className = "pdf-row";

    // Show thumbnail for images
    if (image && p.data) {
      const thumb = document.createElement("img");
      thumb.className = "pdf-row-thumb";
      thumb.src = `data:${mime};base64,${p.data}`;
      thumb.alt = name;
      thumb.addEventListener("click", () => viewFile(p.data, mime));
      row.appendChild(thumb);
    }

    const info = document.createElement("div");
    const nameDiv = document.createElement("div");
    nameDiv.className = "pdf-name";
    nameDiv.textContent = name;
    info.appendChild(nameDiv);

    const meta = document.createElement("div");
    meta.className = "pdf-meta";
    meta.textContent = mime;
    info.appendChild(meta);

    row.appendChild(info);

    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px";

    const viewBtn = document.createElement("button");
    viewBtn.textContent = "View";
    viewBtn.className = "secondary btn-sm";
    viewBtn.addEventListener("click", () => viewFile(p.data, mime));
    btns.appendChild(viewBtn);

    const dlBtn = document.createElement("button");
    dlBtn.textContent = "Download";
    dlBtn.className = "btn-sm";
    dlBtn.addEventListener("click", () => downloadFile(p.data, name, mime));
    btns.appendChild(dlBtn);

    if (Auth.hasRole("projectleider")) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.className = "danger btn-sm";
      delBtn.addEventListener("click", () => deletePdf(name, delBtn));
      btns.appendChild(delBtn);
    }

    row.appendChild(btns);
    return row;
  }

  function renderPdfs(pdfs) {
    const el = document.getElementById("pdfs");
    if (!el) return;
    el.innerHTML = "";

    if (!pdfs || pdfs.length === 0) {
      el.className = "hint";
      el.textContent = "No files.";
      return;
    }

    el.className = "";
    pdfs.forEach((p, i) => el.appendChild(buildPdfRow(p, i)));
  }

  // Optimistically add a single file to the PDF list after upload
  function appendPdfRow(fileObj) {
    const el = document.getElementById("pdfs");
    if (!el) return;

    // If the list currently shows the "No files." placeholder, clear it
    if (el.classList.contains("hint")) {
      el.innerHTML = "";
      el.className = "";
    }

    const count = el.querySelectorAll(".pdf-row").length;
    el.appendChild(buildPdfRow(fileObj, count));
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

  // ── Task photos (easykit role) ──

  function triggerTaskPhotoUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf";
    input.multiple = true;
    input.addEventListener("change", () => {
      if (input.files.length > 0) handleTaskPhotoUpload(Array.from(input.files));
    });
    input.click();
  }

  async function handleTaskPhotoUpload(files) {
    const statusEl = document.getElementById("taskPhotoStatus");
    const gallery  = document.getElementById("taskPhotoGallery");
    const btn      = document.getElementById("taskPhotoUploadBtn");

    const validFiles = files.filter(f => /^image\//i.test(f.type) || f.type === "application/pdf");
    if (validFiles.length === 0) {
      showTaskPhotoStatus(statusEl, "error", "Only images and PDFs are allowed.");
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Uploading\u2026"; }

    const total = validFiles.length;
    let done = 0;
    let anySuccess = false;

    showTaskPhotoStatus(statusEl, "uploading", `Uploading 0/${total} files\u2026`);

    await parallelMap(validFiles, 3, async (file) => {
      try {
        const { base64, filename } = await compressImage(file);
        const res = await Api.post(CONFIG.WEBHOOK_TASK_PHOTOS, {
          task_id:  currentTask.id,
          filename,
          data:     base64,
        });
        const result = await res.json();
        done++;
        if (res.ok && result.success !== false) {
          anySuccess = true;
          showTaskPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} files\u2026`);
        } else {
          showTaskPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} files (${file.name} failed)`);
        }
      } catch (err) {
        done++;
        console.error("[taskDetail] Task photo upload error:", err);
        showTaskPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} files (${file.name} failed)`);
      }
    });

    showTaskPhotoStatus(statusEl, anySuccess ? "success" : "error",
      anySuccess ? `${done} files uploaded!` : "Upload failed");

    if (btn) { btn.disabled = false; btn.textContent = "Add file"; }
    if (anySuccess) setTimeout(() => loadTaskPhotos(), 800);
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ""; }, 4000);
  }

  async function loadTaskPhotos() {
    const gallery = document.getElementById("taskPhotoGallery");
    if (!gallery || !currentTask) return;

    gallery.className = "task-photo-gallery hint";
    gallery.textContent = "Loading files\u2026";

    try {
      const res = await Api.get(CONFIG.WEBHOOK_TASK_PHOTOS, { task_id: currentTask.id });
      const raw = await res.json();

      let photos;
      if (Array.isArray(raw)) {
        photos = raw[0]?.photos || raw[0]?.data || raw;
      } else {
        photos = raw?.photos || raw?.data || [];
      }
      renderTaskPhotoGallery(photos, gallery);
    } catch {
      gallery.className = "task-photo-gallery hint";
      gallery.textContent = "No files yet.";
    }
  }

  function renderTaskPhotoGallery(photos, gallery) {
    gallery.innerHTML = "";
    if (!photos || photos.length === 0) {
      gallery.className = "task-photo-gallery hint";
      gallery.textContent = "No files yet.";
      return;
    }

    gallery.className = "task-photo-gallery";
    photos.forEach(photo => {
      const mime = photo.mimetype || "image/jpeg";
      const isPdf = /pdf/i.test(mime);

      const thumb = document.createElement("div");
      thumb.className = "task-photo-thumb";

      const imgWrap = document.createElement("div");
      imgWrap.className = "task-photo-img-wrap";

      if (isPdf) {
        // PDF: show file icon placeholder
        const pdfIcon = document.createElement("div");
        pdfIcon.className = "task-photo-pdf-icon";
        pdfIcon.innerHTML = "&#128196;<span>PDF</span>";
        pdfIcon.addEventListener("click", () => {
          if (photo.data) viewFile(photo.data, mime);
        });
        imgWrap.appendChild(pdfIcon);
      } else {
        // Image: show thumbnail
        const img = document.createElement("img");
        if (photo.data) {
          img.src = `data:${mime};base64,${photo.data}`;
        } else if (photo.url) {
          img.src = photo.url;
        }
        img.alt = photo.name || "Photo";
        img.addEventListener("click", () => {
          const src = photo.data ? `data:${mime};base64,${photo.data}` : photo.url;
          if (src) showTaskPhotoOverlay(src, photo.name || "Photo");
        });
        imgWrap.appendChild(img);
      }

      thumb.appendChild(imgWrap);

      const footer = document.createElement("div");
      footer.className = "task-photo-footer";

      if (photo.name) {
        const label = document.createElement("span");
        label.className = "task-photo-label";
        label.textContent = photo.name;
        label.title = photo.name;
        footer.appendChild(label);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "task-photo-delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteTaskPhoto(photo.name));
      footer.appendChild(deleteBtn);

      thumb.appendChild(footer);
      gallery.appendChild(thumb);
    });
  }

  async function deleteTaskPhoto(filename) {
    if (!confirm(`Delete "${filename}"?`)) return;

    const statusEl = document.getElementById("taskPhotoStatus");
    showTaskPhotoStatus(statusEl, "uploading", `Deleting ${filename}\u2026`);

    try {
      const res = await Api.delete(CONFIG.WEBHOOK_TASK_PHOTOS, {
        task_id: currentTask.id,
        filename,
      });
      const result = await res.json();
      if (res.ok && result.success !== false) {
        showTaskPhotoStatus(statusEl, "success", `${filename} deleted`);
        loadTaskPhotos();
      } else {
        showTaskPhotoStatus(statusEl, "error", result.message || "Delete failed");
      }
    } catch (err) {
      console.error("[taskDetail] Task photo delete error:", err);
      showTaskPhotoStatus(statusEl, "error", "Network error while deleting");
    }
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ""; }, 4000);
  }

  function showTaskPhotoOverlay(src, alt) {
    const overlay = document.createElement("div");
    overlay.className = "coll-photo-overlay";
    overlay.innerHTML = `
      <div class="coll-photo-overlay-top">
        <span class="coll-photo-overlay-title">${escapeHtml(alt)}</span>
        <button class="coll-photo-overlay-close">&times;</button>
      </div>
      <img src="${src}" alt="${escapeHtml(alt)}">
    `;
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.classList.contains("coll-photo-overlay-close")) {
        overlay.remove();
      }
    });
    document.body.appendChild(overlay);
  }

  function showTaskPhotoStatus(el, type, message) {
    if (!el) return;
    el.innerHTML = `<span class="coll-photo-status-msg coll-photo-status--${type}">${escapeHtml(message)}</span>`;
  }

  // ── Set project ID (called from tasks.js) ──

  function setProjectId(pid) {
    currentProjectId = pid;
  }

  // ── Register (no tab — accessed via task list, not nav) ──

  Router.register("taskDetail", {
    get template() { return buildTemplate(); },
    mount,
  });

  return { render, renderPdfs, setLoadingPdfs, setProjectId, renderTeam, loadTaskPhotos };
})();
