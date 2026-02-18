// ===== TASK DETAIL VIEW =====
// Single task view with PDFs and documents.

const TaskDetailView = (() => {

  let currentProjectId = null;

  const template = `
    <button id="backToList" class="secondary" style="margin-bottom:12px">
      &larr; Back to list
    </button>
    <div id="taskDetail"></div>
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">PDFs</div>
        <div id="pdfUploadArea"></div>
      </div>
      <div id="pdfs" class="hint">&mdash;</div>
    </div>
    <div class="card">
      <div class="section-title">Documents</div>
      <div id="docContainer" class="hint">Loading project data...</div>
    </div>
  `;

  function mount() {
    document.getElementById("backToList").addEventListener("click", () => {
      Router.showView("tasks");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Show upload button only for project leaders
    if (Auth.hasRole("projectleider")) {
      renderUploadButton();
    }
  }

  // ── Upload button (projectleider only) ──

  function renderUploadButton() {
    const area = document.getElementById("pdfUploadArea");
    if (!area) return;

    const btn = document.createElement("button");
    btn.className = "btn-sm";
    btn.textContent = "Upload PDF";
    btn.addEventListener("click", () => triggerUpload());
    area.appendChild(btn);
  }

  function triggerUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.addEventListener("change", () => {
      if (input.files.length > 0) uploadPdf(input.files[0]);
    });
    input.click();
  }

  async function uploadPdf(file) {
    if (!currentProjectId) {
      alert("No project linked — cannot upload.");
      return;
    }

    const area = document.getElementById("pdfUploadArea");
    const origHtml = area.innerHTML;
    area.innerHTML = '<span class="pdf-upload-status">Uploading\u2026</span>';

    try {
      const base64 = await fileToBase64(file);

      const res = await Api.post(CONFIG.WEBHOOK_PDF_UPLOAD, {
        project_id: currentProjectId,
        filename:   file.name,
        data:       base64,
      });

      const result = await res.json();

      if (res.ok && result.success !== false) {
        area.innerHTML = '<span class="pdf-upload-status pdf-upload-ok">Uploaded!</span>';
        // Refresh PDFs
        refreshPdfs();
      } else {
        area.innerHTML = '<span class="pdf-upload-status pdf-upload-err">Upload failed</span>';
      }
    } catch (err) {
      console.error("[taskDetail] PDF upload error:", err);
      area.innerHTML = '<span class="pdf-upload-status pdf-upload-err">Upload failed</span>';
    }

    // Restore upload button after a short delay
    setTimeout(() => {
      area.innerHTML = "";
      if (Auth.hasRole("projectleider")) renderUploadButton();
    }, 2000);
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

  async function refreshPdfs() {
    if (!currentProjectId) return;
    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/task`, { id: currentProjectId });
      if (res.ok) {
        const data = await res.json();
        const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
        renderPdfs(payload?.pdfs || []);
      }
    } catch (err) {
      console.error("[taskDetail] PDF refresh error:", err);
    }
  }

  // ── Render task detail card ──

  function render(task) {
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

  // ── Set project ID (called from tasks.js) ──

  function setProjectId(pid) {
    currentProjectId = pid;
  }

  // ── Register (no tab — accessed via task list, not nav) ──

  Router.register("taskDetail", { template, mount });

  return { render, renderPdfs, setProjectId };
})();
