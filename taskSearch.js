// ===== TASK SEARCH (by ID) =====
// Fetches a single task by its ID

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

  console.log("[taskSearch] Fetching task:", id);
  console.log("[taskSearch] URL:", url);

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

    console.log("[taskSearch] Response status:", res.status);

    const text = await res.text();
    console.log("[taskSearch] Raw response:", text);

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

    console.log("[taskSearch] Parsed payload:", payload);

    statusEl.textContent = `Success ✅`;
    renderPdfsSafe(payload?.pdfs || []);
    out.textContent = JSON.stringify(payload, null, 2);

  } catch (err) {
    console.error("[taskSearch] Network error:", err);
    statusEl.innerHTML = `<span class="error">Network error</span>`;
    out.textContent = err.message || String(err);
  }
}
