// ===== TASK LIST (All Tasks) =====
// Fetches all tasks for the logged-in user

function renderMyTasks(tasks) {
  console.log("[taskList] renderMyTasks called with:", tasks);

  myTasksList.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    console.log("[taskList] No tasks to render");
    myTasksStatus.textContent = "No tasks found for you.";
    return;
  }

  // Sort by planned_date_begin (earliest first)
  tasks.sort((a, b) => {
    const dateA = a.planned_date_begin || "";
    const dateB = b.planned_date_begin || "";
    return dateA.localeCompare(dateB);
  });
  console.log("[taskList] Tasks sorted by planned_date_begin");

  myTasksStatus.textContent = `Found ${tasks.length} task(s).`;

  tasks.forEach((t, index) => {
    console.log(`[taskList] Rendering task ${index}:`, t);

    // Extract fields from API format
    const taskName = t.display_name || t.name || "Task";
    const projectName = Array.isArray(t.project_id) ? t.project_id[1] : (t.project || "");
    const address = Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : (t.address || "");

    // Format planned date nicely
    let plannedDate = "";
    if (t.planned_date_begin) {
      const d = new Date(t.planned_date_begin);
      plannedDate = d.toLocaleDateString("nl-BE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } else if (t.date) {
      plannedDate = t.date;
    }

    const row = document.createElement("div");
    row.className = "task-row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="task-title">#${t.id} — ${taskName}</div>
      <div class="task-meta">
        ${plannedDate ? `<strong>📅 ${plannedDate}</strong>` : ""}
        ${projectName ? ` • ${projectName}` : ""}
        ${address ? ` • 📍 ${address}` : ""}
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
  console.log("[taskList] fetchMyTasks called");

  const {u, p} = getCreds();
  console.log("[taskList] Credentials check - user:", u ? "present" : "missing");

  if (!u || !p) {
    myTasksStatus.textContent = "Please login first.";
    return;
  }

  // Check for installer_id in session storage
  const installerId = sessionStorage.getItem("installer_id");
  console.log("[taskList] Installer ID from session:", installerId);

  // This expects you to create a NEW n8n webhook:  GET  thermoduct/tasks
  const url = `${WEBHOOK_BASE}/tasks`;

  console.log("[taskList] Fetching from URL:", url);

  myTasksStatus.textContent = "Loading your tasks…";
  myTasksList.innerHTML = "";

  try {
    const headers = {
      "Accept": "application/json",
      "Authorization": basicAuthHeader(u, p),
    };
    console.log("[taskList] Request headers:", { ...headers, Authorization: "Basic ***" });

    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    console.log("[taskList] Response status:", res.status);
    console.log("[taskList] Response headers:", Object.fromEntries(res.headers.entries()));

    const text = await res.text();
    console.log("[taskList] Raw response text:", text);
    console.log("[taskList] Response length:", text.length);

    let data = [];
    try {
      data = JSON.parse(text);
      console.log("[taskList] Parsed JSON data:", data);
      console.log("[taskList] Data type:", typeof data);
      console.log("[taskList] Is array:", Array.isArray(data));
    } catch (parseErr) {
      console.error("[taskList] JSON parse error:", parseErr);
      console.error("[taskList] Failed to parse text:", text.substring(0, 200));
    }

    if (!res.ok) {
      console.error("[taskList] HTTP error:", res.status);
      myTasksStatus.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
      return;
    }

    // allow: array, {data:[...]}, or single task object
    let tasks;
    if (Array.isArray(data)) {
      tasks = data;
      console.log("[taskList] Data is array, using directly");
    } else if (data && Array.isArray(data.data)) {
      tasks = data.data;
      console.log("[taskList] Data has .data array, using that");
    } else if (data && typeof data === "object" && data.id !== undefined) {
      // Single task object returned - wrap in array
      console.log("[taskList] Data is single task object with id:", data.id);
      tasks = [data];
    } else if (data && typeof data === "object") {
      console.log("[taskList] Data is object but no array or id found. Keys:", Object.keys(data));
      tasks = [];
    } else {
      console.log("[taskList] Unexpected data format");
      tasks = [];
    }

    console.log("[taskList] Final tasks array:", tasks);
    console.log("[taskList] Tasks count:", tasks.length);

    renderMyTasks(tasks);

  } catch (err) {
    console.error("[taskList] Network/fetch error:", err);
    console.error("[taskList] Error stack:", err.stack);
    myTasksStatus.innerHTML = `<span class="error">Network error</span>`;
  }
}
