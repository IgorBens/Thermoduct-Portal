// ===== CONFIGURATION =====
const WEBHOOK_BASE = "https://thermoduct.app.n8n.cloud/webhook/c3f563b3-c04f-4b01-820d-11173ba9bd31/thermoduct";
const AUTH_WEBHOOK = "https://thermoduct.app.n8n.cloud/webhook/auth/login";

// ===== DOM ELEMENTS =====
const out = document.getElementById("out");
const statusEl = document.getElementById("status");
const taskIdInput = document.getElementById("taskId");
const btn = document.getElementById("btn");
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

// ===== TASK FETCH (by ID) =====
async function fetchTask() {
  const id = String(taskIdInput.value || "").trim();
  if (!id) {
    statusEl.textContent = "Enter a task ID.";
    return;
  }

  const {u, p} = getCreds();
  if (!u || !p) {
    statusEl.textContent = "Please login first.";
    return;
  }

  const url = `${WEBHOOK_BASE}/task/${encodeURIComponent(id)}`;
  statusEl.textContent = `Fetching task ${id}…`;
  out.textContent = "—";
  renderPdfsSafe([]);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": basicAuthHeader(u, p),
      },
      cache: "no-store",
    });

    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) {
      statusEl.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
      out.textContent = text;
      return;
    }

    const payload =
      Array.isArray(data) ? data[0] :
      (data && Array.isArray(data.data)) ? data.data[0] :
      data;

    statusEl.textContent = `Success ✅`;
    renderPdfsSafe(payload?.pdfs || []);
    out.textContent = JSON.stringify(payload, null, 2);

  } catch (err) {
    statusEl.innerHTML = `<span class="error">Network error</span>`;
    out.textContent = err.message || String(err);
  }
}

// ===== MY TASKS =====
function renderMyTasks(tasks) {
  myTasksList.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    myTasksStatus.textContent = "No tasks found for you.";
    return;
  }

  myTasksStatus.textContent = `Found ${tasks.length} task(s).`;

  tasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "task-row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="task-title">#${t.id} — ${t.name || "Task"}</div>
      <div class="task-meta">
        ${t.date || ""}
        ${t.project ? " • " + t.project : ""}
        ${t.address ? " • " + t.address : ""}
      </div>
    `;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "8px";

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "secondary";
    openBtn.addEventListener("click", async () => {
      taskIdInput.value = t.id;
      await fetchTask();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    right.appendChild(openBtn);

    row.appendChild(left);
    row.appendChild(right);
    myTasksList.appendChild(row);
  });
}

async function fetchMyTasks() {
  const {u, p} = getCreds();
  if (!u || !p) {
    myTasksStatus.textContent = "Please login first.";
    return;
  }

  // This expects you to create a NEW n8n webhook:  GET  thermoduct/tasks
  const url = `${WEBHOOK_BASE}/tasks`;

  myTasksStatus.textContent = "Loading your tasks…";
  myTasksList.innerHTML = "";

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": basicAuthHeader(u, p),
      },
      cache: "no-store",
    });

    const text = await res.text();
    let data = [];
    try { data = JSON.parse(text); } catch {}

    if (!res.ok) {
      myTasksStatus.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
      return;
    }

    // allow either array or {data:[...]}
    const tasks = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    renderMyTasks(tasks);

  } catch (err) {
    myTasksStatus.innerHTML = `<span class="error">Network error</span>`;
  }
}

// ===== EVENT LISTENERS =====
loginBtn.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", () => {
  clearCreds();
  refreshLoginUI();
  myTasksList.innerHTML = "";
  myTasksStatus.textContent = "—";
});

btn.addEventListener("click", fetchTask);
taskIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchTask();
});

myTasksBtn.addEventListener("click", fetchMyTasks);

// ===== INIT =====
refreshLoginUI();
