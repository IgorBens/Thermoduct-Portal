// ===== DOCUMENTEN (Photo Upload per Collector) =====
// Uses same n8n flows as the Thermoduct Dashboard:
//   WEBHOOK_FOLDERS, WEBHOOK_FILES, WEBHOOK_SERVE_FILE, WEBHOOK_FILE_DELETE, WEBHOOK_UPLOAD_FORM
// Folder structure: Gebouw > Verdiep > Collector (from thermoduct-folders webhook)

// State
let currentTaskForUpload = null;
let currentProjectId = null;
const docCache = {};

// ===== FOLDER TREE with inline upload/thumbnails =====

function renderDocFolderTree(tree) {
  const container = document.getElementById("docContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!tree || tree.length === 0) {
    container.innerHTML = '<p class="hint">Geen mappenstructuur gevonden voor dit project.</p>';
    return;
  }

  // Clear cache
  Object.keys(docCache).forEach(k => delete docCache[k]);

  tree.forEach(gebouw => {
    const gebouwEl = document.createElement("div");
    gebouwEl.className = "doc-gebouw";

    // Gebouw header
    const gebouwHeader = document.createElement("div");
    gebouwHeader.className = "doc-gebouw-header";
    gebouwHeader.innerHTML = `
      <div class="doc-header-left">
        <span class="doc-chevron open">&#9654;</span>
        <span class="doc-folder-icon">&#127970;</span>
        <strong>Gebouw ${escapeHtml(String(gebouw.name))}</strong>
      </div>
      <span class="doc-count">${gebouw.verdiepen ? gebouw.verdiepen.length : 0} verdiep(en)</span>
    `;
    gebouwHeader.addEventListener("click", () => toggleDocSection(gebouwHeader));
    gebouwEl.appendChild(gebouwHeader);

    // Gebouw body
    const gebouwBody = document.createElement("div");
    gebouwBody.className = "doc-gebouw-body open";

    if (gebouw.verdiepen && gebouw.verdiepen.length > 0) {
      gebouw.verdiepen.forEach(verdiep => {
        const verdiepEl = document.createElement("div");
        verdiepEl.className = "doc-verdiep";

        const verdiepHeader = document.createElement("div");
        verdiepHeader.className = "doc-verdiep-header";
        verdiepHeader.innerHTML = `
          <div class="doc-header-left">
            <span class="doc-chevron open">&#9654;</span>
            <span class="doc-folder-icon">&#128205;</span>
            <strong>Verdiep ${escapeHtml(String(verdiep.name))}</strong>
          </div>
          <span class="doc-count">${verdiep.collectoren ? verdiep.collectoren.length : 0} collector(en)</span>
        `;
        verdiepHeader.addEventListener("click", () => toggleDocSection(verdiepHeader));
        verdiepEl.appendChild(verdiepHeader);

        const verdiepBody = document.createElement("div");
        verdiepBody.className = "doc-verdiep-body open";

        if (verdiep.collectoren && verdiep.collectoren.length > 0) {
          verdiep.collectoren.forEach(collector => {
            const folderPath = collector.path || `${gebouw.name}/${verdiep.name}/${collector.name}`;

            const colEl = document.createElement("div");
            colEl.className = "doc-collector";

            const colHeader = document.createElement("div");
            colHeader.className = "doc-collector-header";
            colHeader.dataset.folderPath = folderPath;
            colHeader.innerHTML = `
              <div class="doc-header-left">
                <span class="doc-chevron">&#9654;</span>
                <span class="doc-folder-icon">&#128247;</span>
                <strong>${escapeHtml(String(collector.name))}</strong>
              </div>
              <div class="doc-header-right">
                <button class="doc-upload-btn" title="Foto's uploaden">&#128247; Upload</button>
              </div>
            `;

            // Upload button opens popup form (same as dashboard)
            const uploadBtn = colHeader.querySelector(".doc-upload-btn");
            uploadBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              openUploadForm(currentProjectId, folderPath);
            });

            colHeader.addEventListener("click", () => {
              toggleDocSection(colHeader);
              const body = colHeader.nextElementSibling;
              // Load files when opening
              if (body.classList.contains("open")) {
                loadDocFiles(folderPath, body.querySelector(".doc-files-list"));
              }
            });
            colEl.appendChild(colHeader);

            const colBody = document.createElement("div");
            colBody.className = "doc-collector-body";

            // Files list container
            const filesList = document.createElement("div");
            filesList.className = "doc-files-list";
            filesList.innerHTML = '<p class="doc-loading" style="color:#868e96;">Klik om bestanden te laden.</p>';
            colBody.appendChild(filesList);

            colEl.appendChild(colBody);
            verdiepBody.appendChild(colEl);
          });
        } else {
          verdiepBody.innerHTML = '<p class="hint" style="margin-left:24px;">Geen collectoren</p>';
        }

        verdiepEl.appendChild(verdiepBody);
        gebouwBody.appendChild(verdiepEl);
      });
    } else {
      gebouwBody.innerHTML = '<p class="hint" style="margin-left:16px;">Geen verdiepen</p>';
    }

    gebouwEl.appendChild(gebouwBody);
    container.appendChild(gebouwEl);
  });
}

// Toggle open/close for any section header
function toggleDocSection(headerEl) {
  const body = headerEl.nextElementSibling;
  const chevron = headerEl.querySelector(".doc-chevron");
  if (body) body.classList.toggle("open");
  if (chevron) chevron.classList.toggle("open");
}

// ===== LOAD FILES =====

async function loadDocFiles(folderPath, filesListEl) {
  if (!currentProjectId) return;
  filesListEl.innerHTML = '<p class="doc-loading">Bestanden laden...</p>';

  try {
    const res = await fetch(
      `${WEBHOOK_FILES}?project_id=${currentProjectId}&folder_path=${encodeURIComponent(folderPath)}`
    );
    const data = await res.json();

    if (!data.success || !data.exists || !data.files || data.files.length === 0) {
      filesListEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Nog geen bestanden.</p>';
      docCache[folderPath] = [];
      return;
    }

    docCache[folderPath] = data.files;
    renderFilesList(folderPath, data.files, filesListEl);
  } catch (err) {
    console.error("[docs] Load error:", err);
    filesListEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Kan bestanden niet laden.</p>';
    docCache[folderPath] = [];
  }
}

function renderFilesList(folderPath, files, filesListEl) {
  if (!files || files.length === 0) {
    filesListEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Nog geen bestanden.</p>';
    return;
  }

  filesListEl.innerHTML = "";
  files.forEach(file => {
    const isImage = /\.(jpg|jpeg|png|webp|heic|gif|bmp)$/i.test(file.name);
    const fileUrl = `${WEBHOOK_SERVE_FILE}?project_id=${currentProjectId}&folder_path=${encodeURIComponent(folderPath)}&file_name=${encodeURIComponent(file.name)}`;
    const sizeKB = file.size ? Math.round(file.size / 1024) : "";

    const item = document.createElement("div");
    item.className = "doc-file-item" + (isImage ? " doc-file-item--image" : "");
    if (isImage) item.style.cursor = "pointer";

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
    delBtn.title = "Verwijder bestand";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDocFile(folderPath, file.name, delBtn);
    });
    item.appendChild(delBtn);

    filesListEl.appendChild(item);
  });
}

// ===== UPLOAD (popup form, same as dashboard) =====

function openUploadForm(projectId, folderPath) {
  const url = `${WEBHOOK_UPLOAD_FORM}?project_id=${encodeURIComponent(projectId)}&folder_path=${encodeURIComponent(folderPath)}`;
  const popup = window.open(url, "_blank", "width=500,height=400");

  // When popup closes, reload files for all open collectors
  if (popup) {
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        document.querySelectorAll(".doc-collector-header").forEach(header => {
          const body = header.nextElementSibling;
          if (body && body.classList.contains("open")) {
            const fp = header.dataset.folderPath;
            if (fp) {
              delete docCache[fp];
              loadDocFiles(fp, body.querySelector(".doc-files-list"));
            }
          }
        });
      }
    }, 500);
  }
}

// ===== DELETE FILE =====

async function deleteDocFile(folderPath, fileName, btnEl) {
  if (!confirm(`"${fileName}" verwijderen?`)) return;
  if (!currentProjectId) return;

  btnEl.disabled = true;
  btnEl.textContent = "...";

  try {
    const res = await fetch(WEBHOOK_FILE_DELETE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: currentProjectId,
        folder_path: folderPath,
        file_name: fileName,
      }),
    });

    const result = await res.json();
    if (result.success) {
      // Remove from DOM
      const fileItem = btnEl.closest(".doc-file-item");
      const filesList = fileItem?.closest(".doc-files-list");
      fileItem?.remove();

      // Update cache
      if (docCache[folderPath]) {
        docCache[folderPath] = docCache[folderPath].filter(f => f.name !== fileName);
        if (docCache[folderPath].length === 0 && filesList) {
          filesList.innerHTML = '<p class="doc-loading" style="color:#868e96;">Nog geen bestanden.</p>';
        }
      }
    } else {
      btnEl.disabled = false;
      btnEl.textContent = "\u{1F5D1}";
    }
  } catch (err) {
    console.error("[docs] Delete error:", err);
    btnEl.disabled = false;
    btnEl.textContent = "\u{1F5D1}";
  }
}

// ===== FETCH FOLDERS & RENDER =====

async function fetchFoldersForProject(projectId) {
  currentProjectId = projectId;

  const container = document.getElementById("docContainer");
  if (!container) return;
  container.innerHTML = '<p class="hint">Mappen laden...</p>';

  try {
    const res = await fetch(
      `${WEBHOOK_FOLDERS}?project_id=${encodeURIComponent(projectId)}`
    );
    const data = await res.json();

    if (data.success && data.tree) {
      renderDocFolderTree(data.tree);
    } else if (data.exists === false) {
      container.innerHTML = '<p class="hint">Geen mappenstructuur gevonden. Maak eerst mappen aan in het Thermoduct Dashboard.</p>';
    } else {
      container.innerHTML = '<p class="hint">Kon mappenstructuur niet laden.</p>';
    }
  } catch (err) {
    console.error("[docs] Folder fetch error:", err);
    container.innerHTML = '<p class="hint">Netwerkfout bij laden van mappen.</p>';
  }
}

// ===== PUBLIC: called when a task detail is opened =====

function initPhotoUploadForTask(task) {
  currentTaskForUpload = task;
  currentProjectId = null;

  // Clear cache
  Object.keys(docCache).forEach(k => delete docCache[k]);

  const container = document.getElementById("docContainer");
  if (container) {
    container.innerHTML = '<p class="hint">Project gegevens laden...</p>';
  }
}

// Called from taskList.js after full task detail is fetched
function updatePhotoUploadProjectId(projectId) {
  if (!projectId) return;
  console.log("[docs] Got project_id:", projectId);
  currentProjectId = projectId;
  fetchFoldersForProject(projectId);
}
