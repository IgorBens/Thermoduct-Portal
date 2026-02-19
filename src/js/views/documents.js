// ===== DOCUMENTS (Folder Tree + Photo Upload) =====
//
// Component used within the taskDetail view.
// Folder structure from n8n: Gebouw > Verdiep > Collector
//
// Not a registered view — mounted inside taskDetail's #docContainer.

const Documents = (() => {
  let projectId = null;
  const cache = {};

  // ── Tree rendering ──

  function renderTree(tree) {
    const container = document.getElementById("docContainer");
    if (!container) return;
    container.innerHTML = "";

    if (!tree || tree.length === 0) {
      container.innerHTML = '<p class="hint">No folder structure found.</p>';
      return;
    }

    Object.keys(cache).forEach(k => delete cache[k]);

    tree.forEach(gebouw => {
      const el = document.createElement("div");
      el.className = "doc-gebouw";

      const header = document.createElement("div");
      header.className = "doc-gebouw-header";
      header.innerHTML = `
        <div class="doc-header-left">
          <span class="doc-chevron open">&#9654;</span>
          <span class="doc-folder-icon">&#127970;</span>
          <strong>Building ${escapeHtml(String(gebouw.name))}</strong>
        </div>
        <span class="doc-count">${gebouw.verdiepen?.length || 0} floor(s)</span>`;
      header.addEventListener("click", () => toggleSection(header));
      el.appendChild(header);

      const body = document.createElement("div");
      body.className = "doc-gebouw-body open";

      if (gebouw.verdiepen?.length > 0) {
        gebouw.verdiepen.forEach(v => body.appendChild(buildVerdiep(gebouw, v)));
      } else {
        body.innerHTML = '<p class="hint" style="margin-left:16px">No floors</p>';
      }

      el.appendChild(body);
      container.appendChild(el);
    });
  }

  function buildVerdiep(gebouw, verdiep) {
    const el = document.createElement("div");
    el.className = "doc-verdiep";

    const header = document.createElement("div");
    header.className = "doc-verdiep-header";
    header.innerHTML = `
      <div class="doc-header-left">
        <span class="doc-chevron open">&#9654;</span>
        <span class="doc-folder-icon">&#128205;</span>
        <strong>Floor ${escapeHtml(String(verdiep.name))}</strong>
      </div>
      <span class="doc-count">${verdiep.collectoren?.length || 0} collector(s)</span>`;
    header.addEventListener("click", () => toggleSection(header));
    el.appendChild(header);

    const body = document.createElement("div");
    body.className = "doc-verdiep-body open";

    if (verdiep.collectoren?.length > 0) {
      verdiep.collectoren.forEach(c => body.appendChild(buildCollector(gebouw, verdiep, c)));
    } else {
      body.innerHTML = '<p class="hint" style="margin-left:24px">No collectors</p>';
    }

    el.appendChild(body);
    return el;
  }

  function buildCollector(gebouw, verdiep, collector) {
    const folderPath = collector.path || `${gebouw.name}/${verdiep.name}/${collector.name}`;

    const el = document.createElement("div");
    el.className = "doc-collector";

    const header = document.createElement("div");
    header.className = "doc-collector-header";
    header.dataset.folderPath = folderPath;
    header.innerHTML = `
      <div class="doc-header-left">
        <span class="doc-chevron">&#9654;</span>
        <span class="doc-folder-icon">&#128247;</span>
        <strong>${escapeHtml(String(collector.name))}</strong>
      </div>
      <div class="doc-header-right">
        <button class="doc-upload-btn" title="Upload photos">&#128247; Upload</button>
      </div>`;

    header.querySelector(".doc-upload-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openUploadForm(folderPath);
    });

    header.addEventListener("click", () => {
      toggleSection(header);
      const body = header.nextElementSibling;
      if (body.classList.contains("open")) {
        loadFiles(folderPath, body.querySelector(".doc-files-list"));
      }
    });
    el.appendChild(header);

    const body = document.createElement("div");
    body.className = "doc-collector-body";

    const filesList = document.createElement("div");
    filesList.className = "doc-files-list";
    filesList.innerHTML = '<p class="doc-loading" style="color:#868e96">Click to load files.</p>';
    body.appendChild(filesList);

    el.appendChild(body);
    return el;
  }

  // ── Collapse / expand ──

  function toggleSection(headerEl) {
    const body = headerEl.nextElementSibling;
    const chevron = headerEl.querySelector(".doc-chevron");
    if (body) body.classList.toggle("open");
    if (chevron) chevron.classList.toggle("open");
  }

  // ── File operations ──

  async function loadFiles(folderPath, listEl) {
    if (!projectId) return;
    listEl.innerHTML = '<p class="doc-loading">Loading files...</p>';

    try {
      const res = await Api.get(CONFIG.WEBHOOK_FILES, {
        project_id: projectId,
        folder_path: folderPath,
      });
      const data = await res.json();

      if (!data.success || !data.exists || !data.files?.length) {
        listEl.innerHTML = '<p class="doc-loading" style="color:#868e96">No files yet.</p>';
        cache[folderPath] = [];
        return;
      }

      cache[folderPath] = data.files;
      renderFiles(folderPath, data.files, listEl);
    } catch (err) {
      console.error("[documents] Load error:", err);
      listEl.innerHTML = '<p class="doc-loading" style="color:#868e96">Could not load files.</p>';
    }
  }

  function renderFiles(folderPath, files, listEl) {
    listEl.innerHTML = "";
    if (!files?.length) {
      listEl.innerHTML = '<p class="doc-loading" style="color:#868e96">No files yet.</p>';
      return;
    }

    files.forEach(file => {
      const isImage = /\.(jpg|jpeg|png|webp|heic|gif|bmp)$/i.test(file.name);
      const fileUrl = Api.url(CONFIG.WEBHOOK_SERVE_FILE, {
        project_id: projectId,
        folder_path: folderPath,
        file_name: file.name,
      });
      const sizeKB = file.size ? Math.round(file.size / 1024) : "";

      const item = document.createElement("div");
      item.className = "doc-file-item" + (isImage ? " doc-file-item--image" : "");

      if (isImage) {
        const img = document.createElement("img");
        img.className = "doc-file-thumb";
        img.src = fileUrl;
        img.alt = file.name;
        img.loading = "lazy";
        img.addEventListener("click", () => window.open(fileUrl, "_blank"));
        item.appendChild(img);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "doc-file-name";
      nameSpan.title = file.name;
      nameSpan.textContent = file.name;
      item.appendChild(nameSpan);

      if (sizeKB) {
        const sizeSpan = document.createElement("span");
        sizeSpan.className = "doc-file-size";
        sizeSpan.textContent = `${sizeKB} KB`;
        item.appendChild(sizeSpan);
      }

      const delBtn = document.createElement("button");
      delBtn.className = "doc-file-delete";
      delBtn.innerHTML = "&#x1F5D1;";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteFile(folderPath, file.name, delBtn);
      });
      item.appendChild(delBtn);

      listEl.appendChild(item);
    });
  }

  // ── Upload ──

  function openUploadForm(folderPath) {
    const url = `${CONFIG.WEBHOOK_UPLOAD_FORM}?project_id=${encodeURIComponent(projectId)}&folder_path=${encodeURIComponent(folderPath)}`;
    const popup = window.open(url, "_blank", "width=500,height=400");

    if (popup) {
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          refreshOpenCollectors();
        }
      }, 500);
    }
  }

  function refreshOpenCollectors() {
    document.querySelectorAll(".doc-collector-header").forEach(header => {
      const body = header.nextElementSibling;
      if (body?.classList.contains("open")) {
        const fp = header.dataset.folderPath;
        if (fp) {
          delete cache[fp];
          loadFiles(fp, body.querySelector(".doc-files-list"));
        }
      }
    });
  }

  // ── Delete ──

  async function deleteFile(folderPath, fileName, btnEl) {
    if (!confirm(`Delete "${fileName}"?`)) return;
    if (!projectId) return;

    btnEl.disabled = true;
    btnEl.textContent = "...";

    try {
      const res = await Api.post(CONFIG.WEBHOOK_FILE_DELETE, {
        project_id: projectId,
        folder_path: folderPath,
        file_name: fileName,
      });
      const result = await res.json();

      if (result.success) {
        const fileItem = btnEl.closest(".doc-file-item");
        const filesList = fileItem?.closest(".doc-files-list");
        fileItem?.remove();

        if (cache[folderPath]) {
          cache[folderPath] = cache[folderPath].filter(f => f.name !== fileName);
          if (cache[folderPath].length === 0 && filesList) {
            filesList.innerHTML = '<p class="doc-loading" style="color:#868e96">No files yet.</p>';
          }
        }
      } else {
        btnEl.disabled = false;
        btnEl.innerHTML = "&#x1F5D1;";
      }
    } catch (err) {
      console.error("[documents] Delete error:", err);
      btnEl.disabled = false;
      btnEl.innerHTML = "&#x1F5D1;";
    }
  }

  // ── Fetch folder tree ──

  async function fetchFolders(pid) {
    projectId = pid;
    const container = document.getElementById("docContainer");
    if (!container) return;
    container.innerHTML = '<p class="hint">Loading folders...</p>';

    try {
      const res = await Api.get(CONFIG.WEBHOOK_FOLDERS, { project_id: pid });
      const data = await res.json();

      if (data.success && data.tree) {
        renderTree(data.tree);
      } else if (data.exists === false) {
        container.innerHTML = '<p class="hint">No folder structure found.</p>';
      } else {
        container.innerHTML = '<p class="hint">Could not load folders.</p>';
      }
    } catch (err) {
      console.error("[documents] Folder fetch error:", err);
      container.innerHTML = '<p class="hint">Network error loading folders.</p>';
    }
  }

  // ── Public API ──

  return {
    init(task) {
      projectId = null;
      Object.keys(cache).forEach(k => delete cache[k]);
      const container = document.getElementById("docContainer");
      if (container) container.innerHTML = '<p class="hint">Loading project data...</p>';
    },

    setProjectId(pid) {
      if (!pid) return;
      projectId = pid;
      fetchFolders(pid);
    },
  };
})();
