// ===== TASK LIST (All Tasks) =====
// Fetches all tasks for the logged-in user

// Store all tasks globally for filtering
let allTasks = [];
const dateFilterEl = document.getElementById("dateFilter");
const showPastDatesEl = document.getElementById("showPastDates");

// Get today's date string (YYYY-MM-DD) in local timezone
function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      if (showPast || d >= todayStr) {
        dates.add(d);
      }
    }
  });

  const sortedDates = Array.from(dates).sort();

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
    filtered = allTasks.filter(t => getTaskDate(t) === selectedDate);
  } else if (!showPast) {
    filtered = allTasks.filter(t => {
      const d = getTaskDate(t);
      return d >= todayStr;
    });
  }

  renderMyTasks(filtered);
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
    const taskName = t.name || t.display_name || "Task";
    const projectName = t.project_name || "";
    const orderNumber = t.order_number || "";
    const addressName = t.address_name || (Array.isArray(t.x_studio_afleveradres) ? t.x_studio_afleveradres[1] : (t.address || ""));
    const addressFull = t.address_full || "";
    const projectLeader = t.project_leader || "";

    // Format date
    const dateStr = getTaskDate(t);
    let plannedDate = "";
    if (dateStr) {
      plannedDate = formatDateLabel(dateStr);
    }

    const row = document.createElement("div");
    row.className = "task-card";

    // Header: project name + date badge
    const header = document.createElement("div");
    header.className = "task-card-header";

    const titleSection = document.createElement("div");
    titleSection.className = "task-card-title-section";

    if (projectName) {
      const projEl = document.createElement("div");
      projEl.className = "task-card-project";
      projEl.textContent = projectName;
      titleSection.appendChild(projEl);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "task-card-name";
    nameEl.textContent = taskName;
    if (orderNumber) {
      nameEl.textContent += ` \u2022 ${orderNumber}`;
    }
    titleSection.appendChild(nameEl);

    header.appendChild(titleSection);

    if (plannedDate) {
      const badge = document.createElement("span");
      badge.className = "task-card-date";
      if (dateStr === getTodayString()) {
        badge.classList.add("today");
      } else if (isDateInPast(dateStr)) {
        badge.classList.add("past");
      }
      badge.textContent = plannedDate;
      header.appendChild(badge);
    }

    row.appendChild(header);

    // Details row: address + project leader
    const details = document.createElement("div");
    details.className = "task-card-details";

    if (addressName || addressFull) {
      const addrEl = document.createElement("div");
      addrEl.className = "task-card-detail";
      addrEl.innerHTML = `<span class="detail-icon">&#128205;</span>`;
      const addrText = document.createElement("span");
      if (addressName) {
        const nameSpan = document.createElement("strong");
        nameSpan.textContent = addressName;
        addrText.appendChild(nameSpan);
      }
      if (addressFull) {
        if (addressName) {
          addrText.appendChild(document.createElement("br"));
        }
        const fullSpan = document.createTextNode(addressFull);
        addrText.appendChild(fullSpan);
      }
      addrEl.appendChild(addrText);
      details.appendChild(addrEl);
    }

    if (projectLeader) {
      const leaderEl = document.createElement("div");
      leaderEl.className = "task-card-detail";
      leaderEl.innerHTML = `<span class="detail-icon">&#128100;</span><span>${escapeHtml(projectLeader)}</span>`;
      details.appendChild(leaderEl);
    }

    if (details.children.length > 0) {
      row.appendChild(details);
    }

    // Footer: open button
    const footer = document.createElement("div");
    footer.className = "task-card-footer";

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "secondary";
    openBtn.addEventListener("click", async () => {
      const detailView = document.getElementById("taskDetailView");
      const listEl = document.getElementById("myTasksList");

      // Show detail, hide list
      renderTaskDetail(t);
      renderPdfsSafe([]);
      if (typeof initPhotoUploadForTask === "function") {
        initPhotoUploadForTask(t);
      }
      detailView.style.display = "";
      listEl.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Back button
      document.getElementById("backToList").onclick = () => {
        detailView.style.display = "none";
        listEl.style.display = "";
      };

      // Fetch full task data for PDFs
      const {u, p} = getCreds();
      if (!u || !p) return;
      try {
        const url = `${WEBHOOK_BASE}/task/${encodeURIComponent(t.id)}`;
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
          const payload = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
          renderPdfsSafe(payload?.pdfs || []);
        }
      } catch (err) {
        console.error("[taskList] PDF fetch error:", err);
      }
    });

    footer.appendChild(openBtn);
    row.appendChild(footer);

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

  myTasksStatus.textContent = "Taken laden\u2026";
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
