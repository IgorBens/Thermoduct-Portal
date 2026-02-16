// ===== PHOTO UPLOAD =====
// Handles photo selection, preview, and upload to backend
// Folder structure: Gebouw > Verdiep > Collector (from thermoduct dashboard)

const FOLDERS_WEBHOOK = "http://46.225.76.46:5678/webhook/thermoduct-folders";
const UPLOAD_WEBHOOK = "http://46.225.76.46:5678/webhook/thermoduct-upload";

// DOM elements
const folderStructureEl = document.getElementById("folderStructure");
const photoDropzone = document.getElementById("photoDropzone");
const photoFileInput = document.getElementById("photoFileInput");
const selectPhotosBtn = document.getElementById("selectPhotosBtn");
const photoPreview = document.getElementById("photoPreview");
const photoUploadStatus = document.getElementById("photoUploadStatus");
const photoUploadActions = document.getElementById("photoUploadActions");
const uploadPhotosBtn = document.getElementById("uploadPhotosBtn");
const clearPhotosBtn = document.getElementById("clearPhotosBtn");

// State
let selectedPhotos = [];
let selectedFolder = null; // full collector path e.g. "1/+00/collector_1"
let currentTaskForUpload = null;
let currentProjectId = null;

// ===== FOLDER TREE (Gebouw > Verdiep > Collector) =====

function renderFolderTree(tree) {
  folderStructureEl.innerHTML = "";
  folderStructureEl.className = "";

  if (!tree || tree.length === 0) {
    folderStructureEl.className = "hint";
    folderStructureEl.textContent = "Geen mappenstructuur gevonden voor dit project.";
    photoDropzone.style.display = "none";
    return;
  }

  const container = document.createElement("div");
  container.className = "folder-tree";

  tree.forEach(gebouw => {
    const gebouwEl = document.createElement("div");
    gebouwEl.className = "folder-gebouw";

    // Gebouw header
    const gebouwHeader = document.createElement("div");
    gebouwHeader.className = "folder-gebouw-header";
    gebouwHeader.innerHTML = `<span class="folder-icon">&#127970;</span> Gebouw ${escapeHtml(String(gebouw.name))}`;
    gebouwHeader.addEventListener("click", () => {
      gebouwEl.classList.toggle("collapsed");
    });
    gebouwEl.appendChild(gebouwHeader);

    // Verdiepen
    const verdiepenContainer = document.createElement("div");
    verdiepenContainer.className = "folder-verdiepen";

    if (gebouw.verdiepen && gebouw.verdiepen.length > 0) {
      gebouw.verdiepen.forEach(verdiep => {
        const verdiepEl = document.createElement("div");
        verdiepEl.className = "folder-verdiep";

        const verdiepHeader = document.createElement("div");
        verdiepHeader.className = "folder-verdiep-header";
        verdiepHeader.innerHTML = `<span class="folder-icon">&#128205;</span> Verdiep ${escapeHtml(String(verdiep.name))}`;
        verdiepHeader.addEventListener("click", () => {
          verdiepEl.classList.toggle("collapsed");
        });
        verdiepEl.appendChild(verdiepHeader);

        // Collectoren
        const collectorenContainer = document.createElement("div");
        collectorenContainer.className = "folder-collectoren";

        if (verdiep.collectoren && verdiep.collectoren.length > 0) {
          verdiep.collectoren.forEach(collector => {
            const btn = document.createElement("button");
            btn.className = "folder-collector-btn";
            btn.innerHTML = `<span class="folder-icon">&#128193;</span> ${escapeHtml(String(collector.name))}`;
            btn.addEventListener("click", () => {
              // Deselect all collector buttons
              container.querySelectorAll(".folder-collector-btn").forEach(b => b.classList.remove("active"));
              btn.classList.add("active");
              selectedFolder = collector.path;
              photoDropzone.style.display = "";
              photoUploadStatus.textContent = `Map: Gebouw ${gebouw.name} / Verdiep ${verdiep.name} / ${collector.name}`;
            });
            collectorenContainer.appendChild(btn);
          });
        } else {
          const hint = document.createElement("div");
          hint.className = "hint";
          hint.style.marginLeft = "24px";
          hint.textContent = "Geen collectoren";
          collectorenContainer.appendChild(hint);
        }

        verdiepEl.appendChild(collectorenContainer);
        verdiepenContainer.appendChild(verdiepEl);
      });
    } else {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.style.marginLeft = "16px";
      hint.textContent = "Geen verdiepen";
      verdiepenContainer.appendChild(hint);
    }

    gebouwEl.appendChild(verdiepenContainer);
    container.appendChild(gebouwEl);
  });

  folderStructureEl.appendChild(container);
}

async function fetchFolders(task) {
  const { u, p } = getCreds();
  if (!u || !p) return;

  folderStructureEl.className = "hint";
  folderStructureEl.textContent = "Mappen laden...";

  // Use project_id from task data
  const projectId = task.project_id || task.id;
  currentProjectId = projectId;

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
        renderFolderTree(data.tree);
      } else if (data.exists === false) {
        folderStructureEl.className = "hint";
        folderStructureEl.textContent = "Geen mappenstructuur gevonden voor dit project. Maak eerst mappen aan in het Thermoduct Dashboard.";
      } else {
        folderStructureEl.className = "hint";
        folderStructureEl.textContent = "Kon mappenstructuur niet laden.";
      }
    } else {
      console.error("[photoUpload] Folders HTTP error:", res.status);
      folderStructureEl.className = "hint";
      folderStructureEl.textContent = "Fout bij laden van mappen.";
    }
  } catch (err) {
    console.error("[photoUpload] Folder fetch error:", err);
    folderStructureEl.className = "hint";
    folderStructureEl.textContent = "Netwerkfout bij laden van mappen.";
  }
}

// ===== PHOTO SELECTION & PREVIEW =====

function handlePhotoSelect(files) {
  if (!files || files.length === 0) return;

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    selectedPhotos.push(file);
  }

  renderPhotoPreview();
  updateUploadActions();
}

function renderPhotoPreview() {
  photoPreview.innerHTML = "";

  selectedPhotos.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "photo-preview-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(img.src);

    const removeBtn = document.createElement("button");
    removeBtn.className = "photo-remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => {
      selectedPhotos.splice(idx, 1);
      renderPhotoPreview();
      updateUploadActions();
    });

    const name = document.createElement("div");
    name.className = "photo-preview-name";
    name.textContent = file.name;

    item.appendChild(img);
    item.appendChild(removeBtn);
    item.appendChild(name);
    photoPreview.appendChild(item);
  });
}

function updateUploadActions() {
  if (selectedPhotos.length > 0) {
    photoUploadActions.style.display = "";
    photoUploadStatus.textContent = `${selectedPhotos.length} foto${selectedPhotos.length === 1 ? "" : "'s"} geselecteerd` +
      (selectedFolder ? ` \u2014 Map: ${selectedFolder}` : "");
  } else {
    photoUploadActions.style.display = "none";
    photoUploadStatus.textContent = selectedFolder ? `Map: ${selectedFolder}` : "";
  }
}

function clearPhotos() {
  selectedPhotos = [];
  photoPreview.innerHTML = "";
  photoFileInput.value = "";
  updateUploadActions();
}

// ===== UPLOAD =====

async function uploadPhotos() {
  if (selectedPhotos.length === 0) {
    photoUploadStatus.textContent = "Geen foto's geselecteerd.";
    return;
  }
  if (!selectedFolder) {
    photoUploadStatus.textContent = "Selecteer eerst een collector map.";
    return;
  }

  const { u, p } = getCreds();
  if (!u || !p) {
    photoUploadStatus.textContent = "Log eerst in.";
    return;
  }

  uploadPhotosBtn.disabled = true;
  const total = selectedPhotos.length;
  let uploaded = 0;
  let failed = 0;

  photoUploadStatus.textContent = `Uploaden: 0/${total}...`;

  for (const file of selectedPhotos) {
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("folder", selectedFolder);
      formData.append("project_id", String(currentProjectId || ""));
      if (currentTaskForUpload) {
        formData.append("task_id", String(currentTaskForUpload.id || ""));
        formData.append("project_name", currentTaskForUpload.project_name || "");
      }

      const res = await fetch(UPLOAD_WEBHOOK, {
        method: "POST",
        headers: {
          "Authorization": basicAuthHeader(u, p),
        },
        body: formData,
      });

      if (res.ok) {
        uploaded++;
      } else {
        failed++;
        console.error(`[photoUpload] Upload failed for ${file.name}: HTTP ${res.status}`);
      }
    } catch (err) {
      failed++;
      console.error(`[photoUpload] Upload error for ${file.name}:`, err);
    }

    photoUploadStatus.textContent = `Uploaden: ${uploaded + failed}/${total}...`;
  }

  uploadPhotosBtn.disabled = false;

  if (failed === 0) {
    photoUploadStatus.innerHTML = `<span style="color:var(--success);">${uploaded} foto${uploaded === 1 ? "" : "'s"} succesvol ge\u00fcpload!</span>`;
    clearPhotos();
  } else {
    photoUploadStatus.innerHTML = `<span style="color:var(--warning);">${uploaded} ge\u00fcpload, ${failed} mislukt.</span>`;
  }
}

// ===== DRAG & DROP =====

function initDropzone() {
  photoDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    photoDropzone.classList.add("dragover");
  });

  photoDropzone.addEventListener("dragleave", () => {
    photoDropzone.classList.remove("dragover");
  });

  photoDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    photoDropzone.classList.remove("dragover");
    handlePhotoSelect(e.dataTransfer.files);
  });

  selectPhotosBtn.addEventListener("click", () => {
    photoFileInput.click();
  });

  photoFileInput.addEventListener("change", () => {
    handlePhotoSelect(photoFileInput.files);
    photoFileInput.value = "";
  });

  uploadPhotosBtn.addEventListener("click", uploadPhotos);
  clearPhotosBtn.addEventListener("click", clearPhotos);
}

// ===== PUBLIC: called when a task detail is opened =====

function initPhotoUploadForTask(task) {
  currentTaskForUpload = task;
  currentProjectId = null;
  selectedPhotos = [];
  selectedFolder = null;
  photoPreview.innerHTML = "";
  photoUploadActions.style.display = "none";
  photoUploadStatus.textContent = "";
  photoDropzone.style.display = "none";

  fetchFolders(task);
}

// Initialize dropzone listeners
initDropzone();
