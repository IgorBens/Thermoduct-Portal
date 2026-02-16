// ===== DOCUMENTEN (Photo Upload per Collector) =====
// Uses same n8n flows as the Thermoduct Dashboard:
//   WEBHOOK_DOCS_LIST, WEBHOOK_DOCS_UPLOAD, WEBHOOK_DOCS_DELETE, WEBHOOK_DOCS_FILE
// Folder structure: Gebouw > Verdiep > Collector (from thermoduct-folders webhook)

const FOLDERS_WEBHOOK = "http://46.225.76.46:5678/webhook/thermoduct-folders";

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
            const docPath = collector.path || `${gebouw.name}/${verdiep.name}/${collector.name}`;

            const colEl = document.createElement("div");
            colEl.className = "doc-collector";

            const colHeader = document.createElement("div");
            colHeader.className = "doc-collector-header";
            colHeader.dataset.docPath = docPath;
            colHeader.innerHTML = `
              <div class="doc-header-left">
                <span class="doc-chevron">&#9654;</span>
                <span class="doc-folder-icon">&#128247;</span>
                <strong>${escapeHtml(String(collector.name))}</strong>
              </div>
            `;
            colHeader.addEventListener("click", () => {
              toggleDocSection(colHeader);
              const body = colHeader.nextElementSibling;
              // Load files when opening
              if (body.classList.contains("open") && !docCache[docPath]) {
                loadDocFiles(docPath, body.querySelector(".doc-thumbnails"));
              }
            });
            colEl.appendChild(colHeader);

            const colBody = document.createElement("div");
            colBody.className = "doc-collector-body";

            // Upload area
            const uploadArea = document.createElement("div");
            uploadArea.className = "doc-upload-area";
            uploadArea.innerHTML = `
              <label class="doc-upload-btn">
                <input type="file" accept="image/*,.heic,.webp" multiple style="display:none">
                &#128247; Foto's uploaden
              </label>
              <span class="doc-upload-status"></span>
            `;
            const fileInput = uploadArea.querySelector("input[type=file]");
            fileInput.addEventListener("change", () => {
              uploadDocFiles(fileInput, docPath);
            });
            colBody.appendChild(uploadArea);

            // Thumbnails container
            const thumbs = document.createElement("div");
            thumbs.className = "doc-thumbnails";
            thumbs.innerHTML = '<p class="doc-loading" style="color:#868e96;">Klik om foto\'s te laden.</p>';
            colBody.appendChild(thumbs);

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

// ===== LOAD FILES (thumbnails) =====

async function loadDocFiles(path, thumbnailsEl) {
  if (!currentProjectId) return;
  thumbnailsEl.innerHTML = '<p class="doc-loading">Laden...</p>';

  try {
    const res = await fetch(
      `${WEBHOOK_DOCS_LIST}?project_id=${currentProjectId}&path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error("Fout bij laden");
    const files = await res.json();
    docCache[path] = files;
    renderThumbnails(path, files, thumbnailsEl);
  } catch (err) {
    console.error("[docs] Load error:", err);
    thumbnailsEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Geen bestanden of niet verbonden.</p>';
    docCache[path] = [];
  }
}

function renderThumbnails(path, files, thumbnailsEl) {
  if (!files || files.length === 0) {
    thumbnailsEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Nog geen foto\'s geupload.</p>';
    return;
  }

  thumbnailsEl.innerHTML = "";
  files.forEach(file => {
    const thumb = document.createElement("div");
    thumb.className = "doc-thumb";

    const imgSrc = `${WEBHOOK_DOCS_FILE}?project_id=${currentProjectId}&path=${encodeURIComponent(path)}&file=${encodeURIComponent(file.name)}`;

    const img = document.createElement("img");
    img.src = imgSrc;
    img.alt = file.name;
    img.loading = "lazy";
    img.addEventListener("click", () => window.open(imgSrc, "_blank"));
    thumb.appendChild(img);

    const info = document.createElement("div");
    info.className = "doc-thumb-info";

    const nameSpan = document.createElement("span");
    nameSpan.className = "doc-thumb-name";
    nameSpan.title = file.name;
    nameSpan.textContent = file.name;
    info.appendChild(nameSpan);

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-remove doc-thumb-delete";
    delBtn.innerHTML = "&#x2715;";
    delBtn.title = "Verwijderen";
    delBtn.addEventListener("click", () => deleteDocFile(path, file.name, thumb, thumbnailsEl));
    info.appendChild(delBtn);

    thumb.appendChild(info);
    thumbnailsEl.appendChild(thumb);
  });
}

// ===== UPLOAD FILES =====

async function uploadDocFiles(input, path) {
  if (!currentProjectId || !input.files.length) return;

  const collectorBody = input.closest(".doc-collector-body");
  const thumbnailsEl = collectorBody.querySelector(".doc-thumbnails");
  const statusEl = collectorBody.querySelector(".doc-upload-status");
  const files = Array.from(input.files);

  statusEl.textContent = `Uploaden: 0/${files.length}...`;
  statusEl.classList.add("active");

  let uploaded = 0;
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", currentProjectId);
    formData.append("path", path);

    try {
      const res = await fetch(WEBHOOK_DOCS_UPLOAD, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      uploaded++;
      statusEl.textContent = `Uploaden: ${uploaded}/${files.length}...`;
    } catch (err) {
      console.error("[docs] Upload error:", err);
    }
  }

  statusEl.textContent = `${uploaded} bestand(en) geupload.`;
  setTimeout(() => {
    statusEl.classList.remove("active");
    statusEl.textContent = "";
  }, 3000);

  // Refresh file list
  delete docCache[path];
  await loadDocFiles(path, thumbnailsEl);

  // Reset input
  input.value = "";
}

// ===== DELETE FILE =====

async function deleteDocFile(path, fileName, thumbEl, thumbnailsEl) {
  if (!confirm(`"${fileName}" verwijderen?`)) return;
  if (!currentProjectId) return;

  try {
    await fetch(WEBHOOK_DOCS_DELETE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: currentProjectId,
        path: path,
        file: fileName,
      }),
    });

    // Remove from DOM and cache
    thumbEl.remove();
    if (docCache[path]) {
      docCache[path] = docCache[path].filter(f => f.name !== fileName);
      if (docCache[path].length === 0) {
        thumbnailsEl.innerHTML = '<p class="doc-loading" style="color:#868e96;">Nog geen foto\'s geupload.</p>';
      }
    }
  } catch (err) {
    console.error("[docs] Delete error:", err);
  }
}

// ===== FETCH FOLDERS & RENDER =====

async function fetchFoldersForProject(projectId) {
  const { u, p } = getCreds();
  if (!u || !p) return;

  currentProjectId = projectId;

  const container = document.getElementById("docContainer");
  if (!container) return;
  container.innerHTML = '<p class="hint">Mappen laden...</p>';

  try {
    const url = `${FOLDERS_WEBHOOK}?project_id=${encodeURIComponent(projectId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": basicAuthHeader(u, p),
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();

      if (data.success && data.tree) {
        renderDocFolderTree(data.tree);
      } else if (data.exists === false) {
        container.innerHTML = '<p class="hint">Geen mappenstructuur gevonden. Maak eerst mappen aan in het Thermoduct Dashboard.</p>';
      } else {
        container.innerHTML = '<p class="hint">Kon mappenstructuur niet laden.</p>';
      }
    } else {
      console.error("[docs] Folders HTTP error:", res.status);
      container.innerHTML = '<p class="hint">Fout bij laden van mappen.</p>';
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
