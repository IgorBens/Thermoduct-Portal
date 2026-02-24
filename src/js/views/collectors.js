// ===== COLLECTORS (Fase: Collectoren) =====
//
// Component used within the taskDetail view.
// Fetches collector data from n8n/Odoo and displays them
// with their kringen (circuits) in a collapsible layout.
//
// Not a registered view — mounted inside taskDetail's #collectorContainer.

const Collectors = (() => {
  let projectId = null;
  let allSysteemOptions = [];   // unique systeem values across all collectors

  // ── Fetch collector data ──

  async function fetchCollectors(pid) {
    projectId = pid;
    const container = document.getElementById("collectorContainer");
    if (!container) return;
    container.innerHTML = '<p class="hint">Collectoren laden...</p>';

    try {
      const res = await Api.get(CONFIG.WEBHOOK_COLLECTORS, { project_id: pid });
      const data = await res.json();

      const collectoren = Array.isArray(data)
        ? data
        : (data?.collectoren || data?.data || []);

      if (!collectoren || collectoren.length === 0) {
        container.innerHTML = '<p class="hint">Geen collectoren gevonden.</p>';
        return;
      }

      // Collect unique systeem values for the "set all" dropdowns
      const systeemSet = new Set();
      collectoren.forEach(c =>
        (c.kringen || []).forEach(k => {
          if (k.systeem) systeemSet.add(String(k.systeem));
        })
      );
      allSysteemOptions = [...systeemSet].sort();

      renderCollectors(collectoren, container);
    } catch (err) {
      console.error("[collectors] Fetch error:", err);
      container.innerHTML = '<p class="hint">Fout bij laden collectoren.</p>';
    }
  }

  // ── Render all collectors ──

  function renderCollectors(collectoren, container) {
    container.innerHTML = "";

    // Summary bar
    const summary = document.createElement("div");
    summary.className = "coll-summary";
    const totalM2 = collectoren.reduce((sum, c) => sum + (parseFloat(c.vierkantemeter) || 0), 0);
    const totalKringen = collectoren.reduce((sum, c) => sum + (c.kringen?.length || 0), 0);
    summary.innerHTML = `
      <span class="coll-summary-item">
        <strong>${collectoren.length}</strong> collector${collectoren.length === 1 ? "" : "en"}
      </span>
      <span class="coll-summary-dot">&middot;</span>
      <span class="coll-summary-item">
        <strong>${totalKringen}</strong> kring${totalKringen === 1 ? "" : "en"}
      </span>
      <span class="coll-summary-dot">&middot;</span>
      <span class="coll-summary-item">
        <strong>${totalM2.toFixed(1)}</strong> m&sup2; totaal
      </span>`;
    container.appendChild(summary);

    collectoren.forEach((collector, index) => {
      container.appendChild(buildCollectorCard(collector, index));
    });
  }

  // ── Build a single collector card ──

  function buildCollectorCard(collector, index) {
    const el = document.createElement("div");
    el.className = "coll-card";

    // Header
    const header = document.createElement("div");
    header.className = "coll-card-header";

    const m2 = parseFloat(collector.vierkantemeter) || 0;
    const kringenCount = collector.kringen?.length || 0;
    const naam = collector.naam || collector.name || `Collector ${index + 1}`;

    header.innerHTML = `
      <div class="coll-header-left">
        <span class="coll-chevron">&#9654;</span>
        <div class="coll-header-info">
          <span class="coll-header-naam">${escapeHtml(naam)}</span>
          <span class="coll-header-meta">
            ${collector.blok ? `Blok ${escapeHtml(String(collector.blok))}` : ""}
            ${collector.blok && collector.verdiep ? " &middot; " : ""}
            ${collector.verdiep !== undefined && collector.verdiep !== null ? `Verdiep ${escapeHtml(String(collector.verdiep))}` : ""}
          </span>
        </div>
      </div>
      <div class="coll-header-right">
        <span class="coll-badge">${m2.toFixed(1)} m&sup2;</span>
        <span class="coll-badge coll-badge--accent">${kringenCount} kring${kringenCount === 1 ? "" : "en"}</span>
      </div>`;

    header.addEventListener("click", () => {
      const body = header.nextElementSibling;
      const chevron = header.querySelector(".coll-chevron");
      if (body) body.classList.toggle("open");
      if (chevron) chevron.classList.toggle("open");
    });

    el.appendChild(header);

    // Body (kringen table)
    const body = document.createElement("div");
    body.className = "coll-card-body";

    if (kringenCount > 0) {
      // "Set system for all" dropdown row
      body.appendChild(buildSysteemRow(collector));
      body.appendChild(buildKringenTable(collector.kringen));
    } else {
      body.innerHTML = '<p class="hint" style="margin:0;padding:8px 0">Geen kringen.</p>';
    }

    el.appendChild(body);
    return el;
  }

  // ── "Set system for all" row ──

  function buildSysteemRow(collector) {
    const row = document.createElement("div");
    row.className = "coll-systeem-row";

    const label = document.createElement("label");
    label.className = "coll-systeem-label";
    label.textContent = "System for all circuits";

    const select = document.createElement("select");
    select.className = "coll-systeem-select";

    // Placeholder
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— select —";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    // Options from all unique systeem values
    allSysteemOptions.forEach(val => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      if (!select.value) return;
      updateCollectorSysteem(collector, select.value, row);
    });

    row.appendChild(label);
    row.appendChild(select);
    return row;
  }

  async function updateCollectorSysteem(collector, systeem, row) {
    const select = row.querySelector("select");
    const status = row.querySelector(".coll-systeem-status") || document.createElement("span");
    status.className = "coll-systeem-status";
    if (!row.contains(status)) row.appendChild(status);

    select.disabled = true;
    status.textContent = "Saving…";
    status.classList.remove("error", "success");

    try {
      const collectorId = collector.id || collector.collector_id;
      const res = await Api.post(CONFIG.WEBHOOK_COLLECTOR_UPDATE, {
        collector_id: collectorId,
        project_id: projectId,
        systeem: systeem,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Update kringen table cells visually
      const card = row.closest(".coll-card");
      const cells = card.querySelectorAll(".coll-kringen-table tbody td.coll-systeem-cell");
      cells.forEach(td => { td.textContent = systeem; });

      // Also update the data model so re-renders stay correct
      (collector.kringen || []).forEach(k => { k.systeem = systeem; });

      status.textContent = "Saved!";
      status.classList.add("success");
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch (err) {
      console.error("[collectors] Update systeem error:", err);
      status.textContent = "Error";
      status.classList.add("error");
    } finally {
      select.disabled = false;
    }
  }

  // ── Build kringen table ──

  function buildKringenTable(kringen) {
    const table = document.createElement("table");
    table.className = "coll-kringen-table";

    // Header row
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>#</th>
        <th>Systeem</th>
        <th>Legpatroon</th>
        <th>Lengte</th>
      </tr>`;
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement("tbody");
    kringen.forEach(k => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="coll-kring-nr">${escapeHtml(String(k.kringnummer ?? ""))}</td>
        <td class="coll-systeem-cell">${escapeHtml(String(k.systeem || "-"))}</td>
        <td>${escapeHtml(String(k.legpatroon || "-"))}</td>
        <td class="coll-kring-lengte">${k.kringlengte ? `${k.kringlengte} m` : "-"}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Footer with total length
    const totalLength = kringen.reduce((sum, k) => sum + (parseFloat(k.kringlengte) || 0), 0);
    if (totalLength > 0) {
      const tfoot = document.createElement("tfoot");
      tfoot.innerHTML = `
        <tr>
          <td colspan="3" class="coll-kring-total-label">Totale kringlengte</td>
          <td class="coll-kring-lengte"><strong>${totalLength.toFixed(1)} m</strong></td>
        </tr>`;
      table.appendChild(tfoot);
    }

    return table;
  }

  // ── Public API ──

  return {
    init() {
      projectId = null;
      const container = document.getElementById("collectorContainer");
      if (container) container.innerHTML = '<p class="hint">Collectoren laden...</p>';
    },

    setProjectId(pid) {
      if (!pid) return;
      projectId = pid;
      fetchCollectors(pid);
    },
  };
})();
