// ===== TASK LIST (All Tasks) =====
// Fetches all tasks for the logged-in user

// Store all tasks globally for filtering
let allTasks = [];
const dateFilterEl = document.getElementById("dateFilter");

// Extract date string (YYYY-MM-DD) from task
function getTaskDate(t) {
  if (t.date) return t.date;
  if (t.planned_date_begin) {
    return String(t.planned_date_begin).split(' ')[0];
  }
  return "";
}

// Populate date dropdown with unique dates
function populateDateFilter(tasks) {
  console.log("[taskList] populateDateFilter called with", tasks.length, "tasks");

  const dates = new Set();
  tasks.forEach((t, i) => {
    const d = getTaskDate(t);
    if (i < 3) console.log("[taskList] Task", i, "date:", d, "raw:", t.date, t.planned_date_begin);
    if (d) dates.add(d);
  });

  // Sort dates
  const sortedDates = Array.from(dates).sort();
  console.log("[taskList] Found unique dates:", sortedDates.length, sortedDates.slice(0, 5));

  // Reset dropdown
  dateFilterEl.innerHTML = '<option value="">All dates</option>';

  sortedDates.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    // Show date in YYYY-MM-DD format for clarity
    opt.textContent = d;
    dateFilterEl.appendChild(opt);
  });

  console.log("[taskList] Dropdown now has", dateFilterEl.options.length, "options");
}

// Filter and render tasks
function filterAndRenderTasks() {
  const selectedDate = dateFilterEl.value;
  console.log("[taskList] Filtering by date:", selectedDate || "(all)");

  let filtered = allTasks;
  if (selectedDate) {
    filtered = allTasks.filter(t => getTaskDate(t) === selectedDate);
  }

  renderMyTasks(filtered);
}

function renderMyTasks(tasks) {
  console.log("[taskList] renderMyTasks called with:", tasks.length, "tasks");

  myTasksList.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    console.log("[taskList] No tasks to render");
    myTasksStatus.textContent = "No tasks found.";
    return;
  }

  // Sort by date (earliest first)
  tasks.sort((a, b) => {
    const dateA = getTaskDate(a);
    const dateB = getTaskDate(b);
    return dateA.localeCompare(dateB);
  });

  myTasksStatus.textContent = `Showing ${tasks.length} task(s).`;

  tasks.forEach((t, index) => {
    // Extract fields from API format
    const taskName = t.display_name || t.name || "Task";
    const projectName = Array.isArray(t.project_id) ? t.project_id[1] : (t.project || "");
    const address = Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : (t.address || "");

    // Format date nicely
    const dateStr = getTaskDate(t);
    let plannedDate = "";
    if (dateStr) {
      const d = new Date(dateStr);
      plannedDate = d.toLocaleDateString("nl-BE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
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
  if (!u || !p) {
    myTasksStatus.textContent = "Please login first.";
    return;
  }

  const url = `${WEBHOOK_BASE}/tasks`;
  console.log("[taskList] Fetching from URL:", url);

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

    console.log("[taskList] Response status:", res.status);

    const text = await res.text();
    console.log("[taskList] Raw response length:", text.length);

    let data = [];
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("[taskList] JSON parse error:", parseErr);
    }

    if (!res.ok) {
      myTasksStatus.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
      return;
    }

    // allow: array, {data:[...]}, or single task object
    let tasks;
    if (Array.isArray(data)) {
      tasks = data;
    } else if (data && Array.isArray(data.data)) {
      tasks = data.data;
    } else if (data && typeof data === "object" && data.id !== undefined) {
      tasks = [data];
    } else {
      tasks = [];
    }

    console.log("[taskList] Loaded", tasks.length, "tasks");

    // Store globally and populate filter
    allTasks = tasks;
    populateDateFilter(tasks);

    // Render all tasks initially
    renderMyTasks(tasks);

  } catch (err) {
    console.error("[taskList] Network error:", err);
    myTasksStatus.innerHTML = `<span class="error">Network error</span>`;
  }
}

// Listen for date filter changes
dateFilterEl.addEventListener("change", filterAndRenderTasks);
