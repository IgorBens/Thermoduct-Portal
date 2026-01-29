// ===== TASK LIST (All Tasks) =====
// Fetches all tasks for the logged-in user

// Store all tasks globally for filtering
let allTasks = [];
const dateFilterEl = document.getElementById("dateFilter");
const showPastDatesEl = document.getElementById("showPastDates");

// Get today's date string (YYYY-MM-DD)
function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Check if a date is in the past (before today)
function isDateInPast(dateStr) {
  const today = getTodayString();
  return dateStr < today;
}

// Extract date string (YYYY-MM-DD) from task
function getTaskDate(t) {
  if (t.date) return t.date;
  if (t.planned_date_begin) {
    return String(t.planned_date_begin).split(' ')[0];
  }
  return "";
}

// Format date for dropdown display
function formatDateLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Parse the date string (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (date.getTime() === yesterday.getTime()) {
    return "Gisteren";
  } else if (date.getTime() === today.getTime()) {
    return "Vandaag";
  } else if (date.getTime() === tomorrow.getTime()) {
    return "Morgen";
  } else {
    return date.toLocaleDateString("nl-BE", {
      weekday: "short",
      day: "numeric",
      month: "short"
    });
  }
}

// Populate date dropdown with unique dates
function populateDateFilter(tasks) {
  const showPast = showPastDatesEl.checked;
  const todayStr = getTodayString();

  const dates = new Set();
  tasks.forEach(t => {
    const d = getTaskDate(t);
    if (d) {
      // Include date if: showing past OR date is today or future
      if (showPast || d >= todayStr) {
        dates.add(d);
      }
    }
  });

  // Sort dates chronologically
  const sortedDates = Array.from(dates).sort();

  // Reset dropdown
  dateFilterEl.innerHTML = '<option value="">Alle datums</option>';

  sortedDates.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = formatDateLabel(d);
    dateFilterEl.appendChild(opt);
  });
}

// Filter and render tasks
function filterAndRenderTasks() {
  const selectedDate = dateFilterEl.value;
  const showPast = showPastDatesEl.checked;
  const todayStr = getTodayString();

  let filtered = allTasks;

  if (selectedDate) {
    // Filter by specific date
    filtered = allTasks.filter(t => getTaskDate(t) === selectedDate);
  } else if (!showPast) {
    // Filter out past dates when "Alle datums" is selected and showPast is unchecked
    filtered = allTasks.filter(t => {
      const d = getTaskDate(t);
      return d >= todayStr;
    });
  }

  renderMyTasks(filtered);
}

function renderMyTasks(tasks) {
  myTasksList.innerHTML = "";

  if (!tasks || tasks.length === 0) {
    myTasksStatus.textContent = "Geen taken gevonden.";
    return;
  }

  // Sort by date (earliest first)
  tasks.sort((a, b) => {
    const dateA = getTaskDate(a);
    const dateB = getTaskDate(b);
    return dateA.localeCompare(dateB);
  });

  myTasksStatus.textContent = `${tasks.length} ta${tasks.length === 1 ? 'ak' : 'ken'} gevonden.`;

  tasks.forEach((t) => {
    // Extract fields from API format
    const taskName = t.display_name || t.name || "Task";
    const projectName = Array.isArray(t.project_id) ? t.project_id[1] : (t.project || "");
    const address = Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : (t.address || "");

    // Format date nicely
    const dateStr = getTaskDate(t);
    let plannedDate = "";
    if (dateStr) {
      plannedDate = formatDateLabel(dateStr);
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
  const {u, p} = getCreds();
  if (!u || !p) {
    myTasksStatus.textContent = "Log eerst in.";
    return;
  }

  const url = `${WEBHOOK_BASE}/tasks`;

  myTasksStatus.textContent = "Taken laden…";
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

    // Store globally and populate filter
    allTasks = tasks;
    populateDateFilter(tasks);

    // Render tasks (filtered by default - no past dates)
    filterAndRenderTasks();

  } catch (err) {
    console.error("[taskList] Network error:", err);
    myTasksStatus.innerHTML = `<span class="error">Netwerkfout</span>`;
  }
}

// Listen for date filter changes
dateFilterEl.addEventListener("change", filterAndRenderTasks);

// Listen for checkbox changes - repopulate dropdown and refilter
showPastDatesEl.addEventListener("change", () => {
  populateDateFilter(allTasks);
  filterAndRenderTasks();
});
