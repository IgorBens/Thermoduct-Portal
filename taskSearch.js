// ===== TASK SEARCH (by ID) =====
// Fetches a single task by its ID and renders the detail view

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

  // Format date
  let dateStr = task.date || "";
  if (!dateStr && task.planned_date_begin) {
    dateStr = String(task.planned_date_begin).split(' ')[0];
  }
  let dateLabel = dateStr;
  if (dateStr && typeof formatDateLabel === "function") {
    dateLabel = formatDateLabel(dateStr);
  }

  // Build detail card
  const card = document.createElement("div");
  card.className = "task-detail";

  // Project name as main title
  if (projectName) {
    const projEl = document.createElement("div");
    projEl.className = "task-detail-project";
    projEl.textContent = projectName;
    card.appendChild(projEl);
  }

  // Task name + order number
  const nameRow = document.createElement("div");
  nameRow.className = "task-detail-name";
  nameRow.textContent = taskName;
  if (orderNumber) {
    nameRow.textContent += ` \u2022 S${orderNumber}`;
  }
  card.appendChild(nameRow);

  // Info grid
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

  // Description (HTML from Odoo)
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

  statusEl.textContent = `Fetching task ${id}\u2026`;
  out.textContent = "\u2014";
  renderPdfsSafe([]);

  const detailEl = document.getElementById("taskDetail");
  if (detailEl) detailEl.innerHTML = "";

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
    try { data = JSON.parse(text); } catch (e) {
      console.error("[taskSearch] JSON parse error:", e);
    }

    if (!res.ok) {
      statusEl.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
      out.textContent = text;
      return;
    }

    const payload =
      Array.isArray(data) ? data[0] :
      (data && Array.isArray(data.data)) ? data.data[0] :
      data;

    statusEl.textContent = "Success";
    renderTaskDetail(payload);
    renderPdfsSafe(payload?.pdfs || []);
    out.textContent = JSON.stringify(payload, null, 2);

  } catch (err) {
    console.error("[taskSearch] Network error:", err);
    statusEl.innerHTML = `<span class="error">Network error</span>`;
    out.textContent = err.message || String(err);
  }
}
