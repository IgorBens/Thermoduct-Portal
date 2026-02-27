// ===== COLLECTORS (Fase: Collectoren) =====
//
// Component used within the taskDetail view.
// Fetches collector data from n8n/Odoo and displays them
// with their kringen (circuits) in a collapsible layout.
//
// Not a registered view — mounted inside taskDetail's #collectorContainer.

const Collectors = (() => {
  let projectId = null;
  let projectName = null;
  let taskId = null;

  // ── Fetch collector data ──

  async function fetchCollectors(pid) {
    projectId = pid;
    const container = document.getElementById("collectorContainer");
    if (!container) return;
    container.innerHTML = '<p class="hint">Loading collectors...</p>';

    try {
      const res = await Api.get(CONFIG.WEBHOOK_COLLECTORS, { project_id: pid });
      const text = await res.text();
      if (!text) {
        container.innerHTML = '<p class="hint">No collectors found.</p>';
        return;
      }
      const data = JSON.parse(text);

      const collectoren = Array.isArray(data)
        ? data
        : (data?.collectoren || data?.data || []);

      if (!collectoren || collectoren.length === 0) {
        container.innerHTML = '<p class="hint">No collectors found.</p>';
        return;
      }

      renderCollectors(collectoren, container);
    } catch (err) {
      console.error("[collectors] Fetch error:", err);
      container.innerHTML = '<p class="hint">Error loading collectors.</p>';
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
        <strong>${collectoren.length}</strong> collector${collectoren.length === 1 ? "" : "s"}
      </span>
      <span class="coll-summary-dot">&middot;</span>
      <span class="coll-summary-item">
        <strong>${totalKringen}</strong> circuit${totalKringen === 1 ? "" : "s"}
      </span>
      <span class="coll-summary-dot">&middot;</span>
      <span class="coll-summary-item">
        <strong>${totalM2.toFixed(1)}</strong> m&sup2; total
      </span>`;
    container.appendChild(summary);

    // Determine grouping
    const hasBlok = collectoren.some(c => c.blok !== undefined && c.blok !== null && c.blok !== "");
    const hasVerdiep = collectoren.some(c => c.verdiep !== undefined && c.verdiep !== null && c.verdiep !== "");

    if (hasBlok) {
      const blokGroups = groupBy(collectoren, "blok");
      sortedEntries(blokGroups).forEach(([blok, blokCollectoren]) => {
        const blokSection = buildGroupSection(`Block ${blok}`, "coll-group-blok", () => {
          const inner = document.createDocumentFragment();
          if (hasVerdiep) {
            const verdiepGroups = groupBy(blokCollectoren, "verdiep");
            sortedEntries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
              inner.appendChild(buildGroupSection(`Floor ${verdiep}`, "coll-group-verdiep", () => {
                const frag = document.createDocumentFragment();
                vCollectoren.forEach((c, i) => frag.appendChild(buildCollectorCard(c, i)));
                return frag;
              }));
            });
          } else {
            blokCollectoren.forEach((c, i) => inner.appendChild(buildCollectorCard(c, i)));
          }
          return inner;
        });
        container.appendChild(blokSection);
      });
    } else if (hasVerdiep) {
      const verdiepGroups = groupBy(collectoren, "verdiep");
      sortedEntries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
        container.appendChild(buildGroupSection(`Floor ${verdiep}`, "coll-group-verdiep", () => {
          const frag = document.createDocumentFragment();
          vCollectoren.forEach((c, i) => frag.appendChild(buildCollectorCard(c, i)));
          return frag;
        }));
      });
    } else {
      collectoren.forEach((collector, index) => {
        container.appendChild(buildCollectorCard(collector, index));
      });
    }
  }

  // ── Helpers: groupBy + collapsible group section ──

  function groupBy(arr, key) {
    const groups = {};
    arr.forEach(item => {
      const val = item[key] !== undefined && item[key] !== null && item[key] !== ""
        ? String(item[key])
        : "Unknown";
      if (!groups[val]) groups[val] = [];
      groups[val].push(item);
    });
    return groups;
  }

  /** Sort group entries so numeric keys go low→high, non-numeric alphabetically. */
  function sortedEntries(groups) {
    return Object.entries(groups).sort(([a], [b]) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }

  function buildGroupSection(title, className, buildContent) {
    const section = document.createElement("div");
    section.className = `coll-group ${className}`;

    const header = document.createElement("div");
    header.className = "coll-group-header";
    header.innerHTML = `
      <span class="coll-group-chevron">&#9654;</span>
      <span class="coll-group-title">${escapeHtml(title)}</span>`;

    const body = document.createElement("div");
    body.className = "coll-group-body open";
    body.appendChild(buildContent());

    header.addEventListener("click", () => {
      body.classList.toggle("open");
      header.querySelector(".coll-group-chevron").classList.toggle("open");
    });

    section.appendChild(header);
    section.appendChild(body);
    return section;
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
            ${collector.blok ? `Block ${escapeHtml(String(collector.blok))}` : ""}
            ${collector.blok && collector.verdiep ? " &middot; " : ""}
            ${collector.verdiep !== undefined && collector.verdiep !== null ? `Floor ${escapeHtml(String(collector.verdiep))}` : ""}
          </span>
        </div>
      </div>
      <div class="coll-header-right">
        <span class="coll-badge">${m2.toFixed(1)} m&sup2;</span>
        <span class="coll-badge coll-badge--accent">${kringenCount} circuit${kringenCount === 1 ? "" : "s"}</span>
      </div>`;

    header.addEventListener("click", () => {
      const body = header.nextElementSibling;
      const chevron = header.querySelector(".coll-chevron");
      if (body) body.classList.toggle("open");
      if (chevron) chevron.classList.toggle("open");
    });

    el.appendChild(header);

    // Body (kringen table + photos)
    const body = document.createElement("div");
    body.className = "coll-card-body";

    if (kringenCount > 0) {
      body.appendChild(buildKringenTable(collector.kringen));
    } else {
      body.innerHTML = '<p class="hint" style="margin:0;padding:8px 0">No circuits.</p>';
    }

    // Photo section — build unique folder key from blok + verdiep + name
    const photoName = collector.naam || collector.name || `Collector ${index + 1}`;
    const parts = [];
    if (collector.blok !== undefined && collector.blok !== null && collector.blok !== "") {
      parts.push(`Block ${collector.blok}`);
    }
    if (collector.verdiep !== undefined && collector.verdiep !== null && collector.verdiep !== "") {
      parts.push(`Floor ${collector.verdiep}`);
    }
    parts.push(photoName);
    const collectorPhotoId = parts.join(" - ");

    // Status section (Collector op Druk + Foto's Uitvoering) — between kringen and photos
    body.appendChild(buildStatusSection(collector, collectorPhotoId));

    body.appendChild(buildPhotoSection(collectorPhotoId));

    el.appendChild(body);
    return el;
  }

  // ── Status section per collector (Collector op Druk + Foto's Uitvoering) ──

  function buildStatusSection(collector, collectorId) {
    const section = document.createElement("div");
    section.className = "coll-status";

    // ── Checkbox: Collector op Druk ──
    const drukRow = document.createElement("div");
    drukRow.className = "coll-status-row";

    const drukLabel = document.createElement("label");
    drukLabel.className = "coll-status-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!collector.collector_op_druk;

    const labelText = document.createElement("span");
    labelText.className = "coll-status-check-text";
    labelText.textContent = "Collector op Druk";

    drukLabel.appendChild(checkbox);
    drukLabel.appendChild(labelText);
    drukRow.appendChild(drukLabel);

    // Show installateur name next to the checkbox
    const installateurSpan = document.createElement("span");
    installateurSpan.className = "coll-status-installateur";
    if (collector.collector_op_druk && collector.collector_installateur) {
      installateurSpan.textContent = collector.collector_installateur;
    }
    drukRow.appendChild(installateurSpan);

    checkbox.addEventListener("change", async () => {
      const user = Auth.getUser();
      const userName = user?.name || user?.preferred_username || "";

      if (checkbox.checked) {
        installateurSpan.textContent = userName;
      } else {
        installateurSpan.textContent = "";
      }

      try {
        await Api.post(CONFIG.WEBHOOK_COLLECTOR_STATUS, {
          project_id: projectId,
          task_id: taskId,
          collector_id: collectorId,
          odoo_id: collector.id || null,
          collector_op_druk: checkbox.checked,
          user_name: userName,
          user_email: user?.email || "",
        });
      } catch (err) {
        console.error("[collectors] Pressure status update error:", err);
      }
    });

    section.appendChild(drukRow);

    // ── Selection: Foto's Uitvoering ──
    const fotosRow = document.createElement("div");
    fotosRow.className = "coll-status-row";

    const fotosLabel = document.createElement("span");
    fotosLabel.className = "coll-status-label";
    fotosLabel.textContent = "Foto\u2019s Uitvoering";
    fotosRow.appendChild(fotosLabel);

    const fotosSelect = document.createElement("select");
    fotosSelect.className = "coll-status-select";

    [
      { value: "",                  label: "Geen Foto\u2019s" },
      { value: "fotos_geupload",    label: "Foto\u2019s Ge\u00fcpload" },
      { value: "fotos_goedgekeurd", label: "Foto\u2019s Goedgekeurd" },
    ].forEach(opt => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      fotosSelect.appendChild(el);
    });

    if (collector.fotos_uitvoering) {
      fotosSelect.value = collector.fotos_uitvoering;
    }

    fotosSelect.addEventListener("change", async () => {
      try {
        await Api.post(CONFIG.WEBHOOK_COLLECTOR_STATUS, {
          project_id: projectId,
          task_id: taskId,
          collector_id: collectorId,
          odoo_id: collector.id || null,
          fotos_uitvoering: fotosSelect.value,
        });
      } catch (err) {
        console.error("[collectors] Photo status update error:", err);
      }
    });

    fotosRow.appendChild(fotosSelect);
    section.appendChild(fotosRow);

    return section;
  }

  // ── Photo section per collector ──

  function buildPhotoSection(collectorId) {
    const section = document.createElement("div");
    section.className = "coll-photos";

    // Header row with title + upload button
    const header = document.createElement("div");
    header.className = "coll-photos-header";
    header.innerHTML = `<span class="coll-photos-title">Photos</span>`;

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "coll-photos-upload-btn";
    uploadBtn.textContent = "Add photo";
    uploadBtn.addEventListener("click", () => triggerPhotoUpload(collectorId, gallery, uploadBtn));
    header.appendChild(uploadBtn);

    section.appendChild(header);

    // Status area for upload feedback
    const status = document.createElement("div");
    status.className = "coll-photos-status";
    section.appendChild(status);

    // Gallery grid
    const gallery = document.createElement("div");
    gallery.className = "coll-photos-gallery";
    gallery.innerHTML = '<span class="hint" style="font-size:12px">Loading...</span>';
    section.appendChild(gallery);

    // Fetch existing photos
    loadPhotos(collectorId, gallery);

    return section;
  }

  async function loadPhotos(collectorId, gallery) {
    try {
      const params = { project_id: projectId, collector_id: collectorId };
      if (projectName) params.project_name = projectName;
      const res = await Api.get(CONFIG.WEBHOOK_COLLECTOR_PHOTOS, params);
      const raw = await res.json();
      // n8n may return [{"photos":[…]}] or {"photos":[…]} or [{name,data},…]
      let photos;
      if (Array.isArray(raw)) {
        photos = raw[0]?.photos || raw[0]?.data || raw;
      } else {
        photos = raw?.photos || raw?.data || [];
      }
      renderPhotoGallery(photos, gallery, collectorId);
    } catch {
      // Silently show empty state (webhook may not be configured yet)
      gallery.innerHTML = '<span class="hint" style="font-size:12px">No photos yet.</span>';
    }
  }

  function renderPhotoGallery(photos, gallery, collectorId) {
    gallery.innerHTML = "";
    if (!photos || photos.length === 0) {
      gallery.innerHTML = '<span class="hint" style="font-size:12px">No photos yet.</span>';
      return;
    }

    photos.forEach(photo => {
      const thumb = document.createElement("div");
      thumb.className = "coll-photo-thumb";

      const img = document.createElement("img");
      const mime = photo.mimetype || "image/jpeg";
      if (photo.data) {
        img.src = `data:${mime};base64,${photo.data}`;
      } else if (photo.url) {
        img.src = photo.url;
      }
      img.alt = photo.name || "Photo";
      img.addEventListener("click", () => {
        let src;
        if (photo.data) {
          src = `data:${mime};base64,${photo.data}`;
        } else if (photo.url) {
          src = photo.url;
        }
        if (src) showPhotoOverlay(src, photo.name || "Photo");
      });

      const imgWrap = document.createElement("div");
      imgWrap.className = "coll-photo-img-wrap";
      imgWrap.appendChild(img);
      thumb.appendChild(imgWrap);

      // Footer row: label + delete button side by side
      const footer = document.createElement("div");
      footer.className = "coll-photo-footer";

      if (photo.name) {
        const label = document.createElement("span");
        label.className = "coll-photo-label";
        label.textContent = photo.name;
        label.title = photo.name;
        footer.appendChild(label);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "coll-photo-delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        deletePhoto(photo.name, collectorId, gallery);
      });
      footer.appendChild(deleteBtn);

      thumb.appendChild(footer);
      gallery.appendChild(thumb);
    });
  }

  async function deletePhoto(filename, collectorId, gallery) {
    if (!confirm(`Delete "${filename}"?`)) return;

    const statusEl = gallery.parentElement.querySelector(".coll-photos-status");
    showPhotoStatus(statusEl, "uploading", `Deleting ${filename}...`);

    try {
      const payload = {
        project_id: projectId,
        collector_id: collectorId,
        filename,
      };
      if (projectName) payload.project_name = projectName;
      const res = await Api.delete(CONFIG.WEBHOOK_COLLECTOR_PHOTOS, payload);
      const result = await res.json();
      if (res.ok && result.success !== false) {
        showPhotoStatus(statusEl, "success", `${filename} deleted`);
        loadPhotos(collectorId, gallery);
      } else {
        showPhotoStatus(statusEl, "error", result.message || "Delete failed");
      }
    } catch (err) {
      console.error("[collectors] Photo delete error:", err);
      showPhotoStatus(statusEl, "error", "Network error while deleting");
    }
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ""; }, 4000);
  }

  function showPhotoOverlay(src, alt) {
    const overlay = document.createElement("div");
    overlay.className = "coll-photo-overlay";
    overlay.innerHTML = `
      <div class="coll-photo-overlay-top">
        <span class="coll-photo-overlay-title">${escapeHtml(alt)}</span>
        <button class="coll-photo-overlay-close">&times;</button>
      </div>
      <img src="${src}" alt="${escapeHtml(alt)}">
    `;
    overlay.addEventListener("click", e => {
      if (e.target === overlay || e.target.classList.contains("coll-photo-overlay-close")) {
        overlay.remove();
      }
    });
    document.body.appendChild(overlay);
  }

  function triggerPhotoUpload(collectorId, gallery, btn) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      if (input.files.length > 0) {
        handlePhotoUpload(Array.from(input.files), collectorId, gallery, btn);
      }
    });
    input.click();
  }

  async function handlePhotoUpload(files, collectorId, gallery, btn) {
    const statusEl = gallery.parentElement.querySelector(".coll-photos-status");

    // Validate: only images
    const validFiles = files.filter(f => /^image\//i.test(f.type));
    if (validFiles.length === 0) {
      showPhotoStatus(statusEl, "error", "Only images are allowed.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploading...";

    const total = validFiles.length;
    let done = 0;
    let anySuccess = false;

    showPhotoStatus(statusEl, "uploading", `Uploading 0/${total} photos...`);

    await parallelMap(validFiles, 3, async (file) => {
      try {
        const { base64, filename } = await compressImage(file);
        const payload = {
          project_id: projectId,
          collector_id: collectorId,
          filename,
          data: base64,
        };
        if (projectName) payload.project_name = projectName;
        const res = await Api.post(CONFIG.WEBHOOK_COLLECTOR_PHOTOS, payload);
        const result = await res.json();
        done++;
        if (res.ok && result.success !== false) {
          anySuccess = true;
          showPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} photos...`);
        } else {
          showPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} photos (${file.name} failed)`);
        }
      } catch (err) {
        done++;
        console.error("[collectors] Photo upload error:", err);
        showPhotoStatus(statusEl, "uploading", `Uploaded ${done}/${total} photos (${file.name} failed)`);
      }
    });

    showPhotoStatus(statusEl, anySuccess ? "success" : "error",
      anySuccess ? `${done} photos uploaded!` : "Upload failed");

    btn.disabled = false;
    btn.textContent = "Add photo";

    // Refresh gallery after uploads
    if (anySuccess) {
      setTimeout(() => loadPhotos(collectorId, gallery), 800);
    }

    // Clear status after a few seconds
    setTimeout(() => { if (statusEl) statusEl.innerHTML = ""; }, 4000);
  }

  function showPhotoStatus(el, type, message) {
    if (!el) return;
    el.innerHTML = `<span class="coll-photo-status-msg coll-photo-status--${type}">${escapeHtml(message)}</span>`;
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
        <th>System</th>
        <th>Pattern</th>
        <th>Length</th>
      </tr>`;
    table.appendChild(thead);

    // Body rows
    const tbody = document.createElement("tbody");
    kringen.forEach(k => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="coll-kring-nr">${escapeHtml(String(k.kringnummer ?? ""))}</td>
        <td>${escapeHtml(String(k.systeem || "-"))}</td>
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
          <td colspan="3" class="coll-kring-total-label">Total circuit length</td>
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
      projectName = null;
      taskId = null;
      const container = document.getElementById("collectorContainer");
      if (container) container.innerHTML = '<p class="hint">Loading collectors...</p>';
    },

    setTaskId(id) {
      if (id) taskId = id;
    },

    setProjectId(pid) {
      if (!pid) return;
      projectId = pid;
      fetchCollectors(pid);
    },

    setProjectName(name) {
      if (name) projectName = name;
    },

    /** Re-fetch collectors + photos for the current project. */
    refresh() {
      if (projectId) fetchCollectors(projectId);
    },
  };
})();
