// ===== CONFIGURATION =====
const WEBHOOK_BASE = "http://46.225.76.46:5678/webhook/c3f563b3-c04f-4b01-820d-11173ba9bd31/thermoduct";
const AUTH_WEBHOOK = "http://46.225.76.46:5678/webhook/auth/login";

// ===== DOM ELEMENTS =====
const pdfsEl = document.getElementById("pdfs");

const uEl = document.getElementById("u");
const pEl = document.getElementById("p");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginStatus = document.getElementById("loginStatus");

const myTasksBtn = document.getElementById("myTasksBtn");
const myTasksStatus = document.getElementById("myTasksStatus");
const myTasksList = document.getElementById("myTasksList");

// ===== AUTH STORAGE =====
function setCreds(u, p) {
  sessionStorage.setItem("u", u);
  sessionStorage.setItem("p", p);
}

function getCreds() {
  return {
    u: sessionStorage.getItem("u") || "",
    p: sessionStorage.getItem("p") || "",
  };
}

function clearCreds() {
  sessionStorage.removeItem("u");
  sessionStorage.removeItem("p");
  sessionStorage.removeItem("installer_id");
}

function basicAuthHeader(u, p) {
  return "Basic " + btoa(`${u}:${p}`);
}

// ===== LOGIN UI =====
function refreshLoginUI() {
  const {u, p} = getCreds();
  if (u && p) {
    loginStatus.textContent = `Logged in as ${u}`;
    logoutBtn.style.display = "";
  } else {
    loginStatus.textContent = "Not logged in.";
    logoutBtn.style.display = "none";
  }
}

async function doLogin() {
  const username = (uEl.value || "").trim().toLowerCase();
  const password = (pEl.value || "");

  if (!username || !password) {
    loginStatus.textContent = "Enter username + password.";
    return;
  }

  loginStatus.textContent = "Logging in…";

  const res = await fetch(AUTH_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  let data = {};
  try { data = await res.json(); } catch {}

  if (!res.ok || !data.ok) {
    loginStatus.textContent = "Login failed.";
    return;
  }

  setCreds(username, password);

  // store installer_id if your auth webhook returns it
  if (data.installer_id !== undefined && data.installer_id !== null) {
    sessionStorage.setItem("installer_id", String(data.installer_id));
  }

  refreshLoginUI();

  // optional: auto-load tasks after login
  // fetchMyTasks();
}

// ===== PDF HELPERS =====
function base64ToPdfBlob(base64) {
  const clean = String(base64 || "").replace(/\s/g, "");
  const byteCharacters = atob(clean);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
}

function downloadPdfFromBase64(base64, filename) {
  const blob = base64ToPdfBlob(base64);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "file.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function viewPdfFromBase64(base64) {
  const blob = base64ToPdfBlob(base64);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function renderPdfsSafe(pdfs) {
  pdfsEl.innerHTML = "";

  if (!pdfs || pdfs.length === 0) {
    pdfsEl.className = "hint";
    pdfsEl.textContent = "No PDFs.";
    return;
  }

  pdfsEl.className = "";

  pdfs.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "pdf-row";

    const left = document.createElement("div");
    const name = p.name || `PDF ${idx + 1}`;
    const mimetype = p.mimetype || "application/pdf";

    left.innerHTML = `
      <div class="pdf-name">${name}</div>
      <div class="pdf-meta">${mimetype}</div>
    `;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";

    const viewBtn = document.createElement("button");
    viewBtn.textContent = "View";
    viewBtn.className = "secondary";
    viewBtn.addEventListener("click", () => viewPdfFromBase64(p.data));

    const dlBtn = document.createElement("button");
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", () => downloadPdfFromBase64(p.data, name));

    right.appendChild(viewBtn);
    right.appendChild(dlBtn);

    row.appendChild(left);
    row.appendChild(right);
    pdfsEl.appendChild(row);
  });
}

// ===== TASK DETAIL =====
function renderTaskDetail(task) {
  const detailEl = document.getElementById("taskDetail");
  if (!detailEl) return;

  detailEl.innerHTML = "";

  if (!task || !task.id) {
    detailEl.innerHTML = '<div class="hint">Geen taak data.</div>';
    return;
  }

  const projectName = task.project_name || "";
  const taskName = task.name || task.display_name || "Task";
  const orderNumber = task.order_number || "";
  const addressName = task.address_name || "";
  const addressFull = task.address_full || "";
  const projectLeader = task.project_leader || "";
  const description = task.description || "";

  let dateStr = task.date || "";
  if (!dateStr && task.planned_date_begin) {
    dateStr = String(task.planned_date_begin).split(' ')[0];
  }
  let dateLabel = dateStr;
  if (dateStr && typeof formatDateLabel === "function") {
    dateLabel = formatDateLabel(dateStr);
  }

  const card = document.createElement("div");
  card.className = "task-detail";

  if (projectName) {
    const projEl = document.createElement("div");
    projEl.className = "task-detail-project";
    projEl.textContent = projectName;
    card.appendChild(projEl);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "task-detail-name";
  nameRow.textContent = taskName;
  if (orderNumber) {
    nameRow.textContent += ` \u2022 ${orderNumber}`;
  }
  card.appendChild(nameRow);

  const grid = document.createElement("div");
  grid.className = "task-detail-grid";

  if (dateLabel) {
    grid.innerHTML += `
      <div class="task-detail-item">
        <span class="detail-label">Datum</span>
        <span class="detail-value">${dateLabel}</span>
      </div>`;
  }

  if (projectLeader) {
    const safeLeader = document.createElement("span");
    safeLeader.textContent = projectLeader;
    grid.innerHTML += `
      <div class="task-detail-item">
        <span class="detail-label">Projectleider</span>
        <span class="detail-value">${safeLeader.innerHTML}</span>
      </div>`;
  }

  if (addressName || addressFull) {
    const safeAddrName = document.createElement("span");
    safeAddrName.textContent = addressName;
    const safeAddrFull = document.createElement("span");
    safeAddrFull.textContent = addressFull;
    grid.innerHTML += `
      <div class="task-detail-item">
        <span class="detail-label">Adres</span>
        <span class="detail-value">
          ${addressName ? `<strong>${safeAddrName.innerHTML}</strong>` : ""}
          ${addressFull ? `<br>${safeAddrFull.innerHTML}` : ""}
        </span>
      </div>`;
  }

  if (grid.children.length > 0) {
    card.appendChild(grid);
  }

  if (description) {
    const descSection = document.createElement("div");
    descSection.className = "task-detail-description";

    const descTitle = document.createElement("div");
    descTitle.className = "detail-label";
    descTitle.textContent = "Omschrijving";
    descSection.appendChild(descTitle);

    const descContent = document.createElement("div");
    descContent.className = "detail-description-content";
    descContent.innerHTML = description;
    descSection.appendChild(descContent);

    card.appendChild(descSection);
  }

  detailEl.appendChild(card);
}
