// ===== PHOTO UPLOAD =====
// Handles photo selection, preview, and upload to backend
// Folder structure is fetched from the thermoduct dashboard backend

const UPLOAD_WEBHOOK = WEBHOOK_BASE + "/upload-photo";
const FOLDERS_WEBHOOK = WEBHOOK_BASE + "/folders";

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
let selectedFolder = null;
let currentTaskForUpload = null;

// ===== FOLDER STRUCTURE =====

function renderFolderSelector(folders, task) {
  folderStructureEl.innerHTML = "";
  folderStructureEl.className = "";

  if (!folders || folders.length === 0) {
    folderStructureEl.className = "hint";
    folderStructureEl.textContent = "Geen mappen beschikbaar.";
    photoDropzone.style.display = "none";
    return;
  }

  const label = document.createElement("div");
  label.className = "folder-label";
  label.textContent = "Selecteer een map:";
  folderStructureEl.appendChild(label);

  const list = document.createElement("div");
  list.className = "folder-list";

  folders.forEach(folder => {
    const btn = document.createElement("button");
    btn.className = "folder-btn";
    btn.innerHTML = `<span class="folder-icon">&#128193;</span> ${escapeHtml(folder.name || folder)}`;
    btn.addEventListener("click", () => {
      // Deselect all
      list.querySelectorAll(".folder-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedFolder = folder.path || folder.name || folder;
      photoDropzone.style.display = "";
      photoUploadStatus.textContent = `Map: ${selectedFolder}`;
    });
    list.appendChild(btn);
  });

  folderStructureEl.appendChild(list);
}

async function fetchFolders(task) {
  const { u, p } = getCreds();
  if (!u || !p) return;

  folderStructureEl.className = "hint";
  folderStructureEl.textContent = "Mappen laden...";

  try {
    const params = new URLSearchParams();
    if (task.project_name) params.set("project", task.project_name);
    if (task.id) params.set("task_id", task.id);

    const url = `${FOLDERS_WEBHOOK}?${params.toString()}`;
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
      const folders = Array.isArray(data) ? data : (data.folders || []);
      renderFolderSelector(folders, task);
    } else {
      // Fallback: generate default folders based on task info
      const defaultFolders = generateDefaultFolders(task);
      renderFolderSelector(defaultFolders, task);
    }
  } catch (err) {
    console.error("[photoUpload] Folder fetch error:", err);
    // Fallback: generate default folders
    const defaultFolders = generateDefaultFolders(task);
    renderFolderSelector(defaultFolders, task);
  }
}

function generateDefaultFolders(task) {
  const folders = [];
  const projectName = task.project_name || "Onbekend project";
  const taskName = task.name || task.display_name || `Taak ${task.id}`;

  folders.push({
    name: `${projectName} / ${taskName} / Voor installatie`,
    path: `${projectName}/${taskName}/voor-installatie`
  });
  folders.push({
    name: `${projectName} / ${taskName} / Tijdens installatie`,
    path: `${projectName}/${taskName}/tijdens-installatie`
  });
  folders.push({
    name: `${projectName} / ${taskName} / Na installatie`,
    path: `${projectName}/${taskName}/na-installatie`
  });
  folders.push({
    name: `${projectName} / ${taskName} / Overig`,
    path: `${projectName}/${taskName}/overig`
  });

  return folders;
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
      (selectedFolder ? ` — Map: ${selectedFolder}` : "");
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
    photoUploadStatus.textContent = "Selecteer eerst een map.";
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
