// ===== CONFIGURATION =====
const WEBHOOK_BASE = "http://46.225.76.46:5678/webhook/c3f563b3-c04f-4b01-820d-11173ba9bd31/thermoduct";
const AUTH_WEBHOOK = "http://46.225.76.46:5678/webhook/auth/login";

// ===== DOM ELEMENTS =====

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

// ===== TASK FUNCTIONS =====
// fetchTask() is now in taskSearch.js
// fetchMyTasks() and renderMyTasks() are now in taskList.js
// Event listeners and init are now in init.js
