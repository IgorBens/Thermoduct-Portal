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

    // Determine grouping
    const hasBlok = collectoren.some(c => c.blok !== undefined && c.blok !== null && c.blok !== "");
    const hasVerdiep = collectoren.some(c => c.verdiep !== undefined && c.verdiep !== null && c.verdiep !== "");

    if (hasBlok) {
      const blokGroups = groupBy(collectoren, "blok");
      Object.entries(blokGroups).forEach(([blok, blokCollectoren]) => {
        const blokSection = buildGroupSection(`Blok ${blok}`, "coll-group-blok", () => {
          const inner = document.createDocumentFragment();
          if (hasVerdiep) {
            const verdiepGroups = groupBy(blokCollectoren, "verdiep");
            Object.entries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
              inner.appendChild(buildGroupSection(`Verdiep ${verdiep}`, "coll-group-verdiep", () => {
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
      Object.entries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
        container.appendChild(buildGroupSection(`Verdiep ${verdiep}`, "coll-group-verdiep", () => {
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
        : "Onbekend";
      if (!groups[val]) groups[val] = [];
      groups[val].push(item);
    });
    return groups;
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

    // Body (kringen table + photos)
    const body = document.createElement("div");
    body.className = "coll-card-body";

    if (kringenCount > 0) {
      body.appendChild(buildKringenTable(collector.kringen));
    } else {
      body.innerHTML = '<p class="hint" style="margin:0;padding:8px 0">Geen kringen.</p>';
    }

    // Photo section — build unique folder key from blok + verdiep + name
    const photoName = collector.naam || collector.name || `Collector ${index + 1}`;
    const parts = [];
    if (collector.blok !== undefined && collector.blok !== null && collector.blok !== "") {
      parts.push(`Blok ${collector.blok}`);
    }
    if (collector.verdiep !== undefined && collector.verdiep !== null && collector.verdiep !== "") {
      parts.push(`Verdiep ${collector.verdiep}`);
    }
    parts.push(photoName);
    const collectorPhotoId = parts.join(" - ");
    body.appendChild(buildPhotoSection(collectorPhotoId));

    el.appendChild(body);
    return el;
  }

  // ── Photo section per collector ──

  function buildPhotoSection(collectorId) {
    const section = document.createElement("div");
    section.className = "coll-photos";

    // Header row with title + upload button
    const header = document.createElement("div");
    header.className = "coll-photos-header";
    header.innerHTML = `<span class="coll-photos-title">Foto's</span>`;

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "coll-photos-upload-btn";
    uploadBtn.textContent = "Foto toevoegen";
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
    gallery.innerHTML = '<span class="hint" style="font-size:12px">Laden...</span>';
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
      gallery.innerHTML = '<span class="hint" style="font-size:12px">Nog geen foto\'s.</span>';
    }
  }

  function renderPhotoGallery(photos, gallery, collectorId) {
    gallery.innerHTML = "";
    if (!photos || photos.length === 0) {
      gallery.innerHTML = '<span class="hint" style="font-size:12px">Nog geen foto\'s.</span>';
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
      img.alt = photo.name || "Foto";
      img.addEventListener("click", () => {
        let src;
        if (photo.data) {
          src = `data:${mime};base64,${photo.data}`;
        } else if (photo.url) {
          src = photo.url;
        }
        if (src) showPhotoOverlay(src, photo.name || "Foto");
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
      deleteBtn.textContent = "Verwijder";
      deleteBtn.addEventListener("click", () => {
        deletePhoto(photo.name, collectorId, gallery);
      });
      footer.appendChild(deleteBtn);

      thumb.appendChild(footer);
      gallery.appendChild(thumb);
    });
  }

  async function deletePhoto(filename, collectorId, gallery) {
    if (!confirm(`"${filename}" verwijderen?`)) return;

    const statusEl = gallery.parentElement.querySelector(".coll-photos-status");
    showPhotoStatus(statusEl, "uploading", `${filename} verwijderen...`);

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
        showPhotoStatus(statusEl, "success", `${filename} verwijderd`);
        loadPhotos(collectorId, gallery);
      } else {
        showPhotoStatus(statusEl, "error", result.message || "Verwijderen mislukt");
      }
    } catch (err) {
      console.error("[collectors] Photo delete error:", err);
      showPhotoStatus(statusEl, "error", "Netwerkfout bij verwijderen");
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
      showPhotoStatus(statusEl, "error", "Alleen afbeeldingen toegestaan.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Uploaden...";

    let anySuccess = false;
    for (const file of validFiles) {
      showPhotoStatus(statusEl, "uploading", `${file.name} uploaden...`);
      try {
        const base64 = await fileToBase64(file);
        const payload = {
          project_id: projectId,
          collector_id: collectorId,
          filename: file.name,
          data: base64,
        };
        if (projectName) payload.project_name = projectName;
        const res = await Api.post(CONFIG.WEBHOOK_COLLECTOR_PHOTOS, payload);
        const result = await res.json();
        if (res.ok && result.success !== false) {
          showPhotoStatus(statusEl, "success", `${file.name} geupload!`);
          anySuccess = true;
        } else {
          showPhotoStatus(statusEl, "error", result.message || `${file.name} mislukt`);
        }
      } catch (err) {
        console.error("[collectors] Photo upload error:", err);
        showPhotoStatus(statusEl, "error", `${file.name} — netwerkfout`);
      }
    }

    btn.disabled = false;
    btn.textContent = "Foto toevoegen";

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
      projectName = null;
      const container = document.getElementById("collectorContainer");
      if (container) container.innerHTML = '<p class="hint">Collectoren laden...</p>';
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
