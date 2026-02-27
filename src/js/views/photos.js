// ===== PHOTOS VIEW (Projectleider — review collector photos) =====
//
// Standalone tab for project leaders to browse and review photos
// uploaded by installers per collector.
//
// Hierarchy:  Projects → Blokken → Verdiepingen → Collectors → Photos
//
// Reuses existing webhooks:
//   - WEBHOOK_TASKS  (tasks-quick)       → list projects for the logged-in leader
//   - WEBHOOK_COLLECTORS                 → collectors per project (blok/verdiep)
//   - WEBHOOK_COLLECTOR_PHOTOS           → photos per collector

const PhotosView = (() => {
  let allProjects = [];
  let currentProject = null;

  // ── Template ──

  const listTemplate = `
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">Photos</div>
        <button id="photosRefreshBtn" class="secondary btn-sm">Refresh</button>
      </div>
      <div id="photosStatus" class="hint">&mdash;</div>
      <div id="photosList"></div>
    </div>`;

  function detailTemplate(project) {
    return `
    <div class="detail-top-row">
      <button id="photosBackBtn" class="secondary">&larr; Back to projects</button>
    </div>
    <div class="card">
      <div class="section-title-row">
        <div class="section-title" style="margin-bottom:0">${escapeHtml(project.name)}</div>
      </div>
      <div id="photosCollectorStatus" class="hint">Loading collectors...</div>
      <div id="photosCollectorTree"></div>
    </div>`;
  }

  // ── Mount / Unmount ──

  function mount() {
    if (currentProject) {
      mountDetail();
    } else {
      mountList();
    }
  }

  function mountList() {
    document.getElementById("photosRefreshBtn").addEventListener("click", () => {
      allProjects = [];
      fetchProjects();
    });

    if (allProjects.length > 0) {
      renderProjects(allProjects);
    } else {
      fetchProjects();
    }
  }

  function mountDetail() {
    document.getElementById("photosBackBtn").addEventListener("click", () => {
      currentProject = null;
      Router.showView("photos");
    });
    fetchCollectors(currentProject);
  }

  // ── Fetch projects ──

  async function fetchProjects() {
    const statusEl = document.getElementById("photosStatus");
    const listEl = document.getElementById("photosList");

    statusEl.textContent = "Loading projects\u2026";
    listEl.innerHTML = "";

    try {
      const res = await Api.get(`${CONFIG.WEBHOOK_TASKS}/tasks-quick`, { past_days: "7" });
      const text = await res.text();
      if (!res.ok) {
        statusEl.innerHTML = `<span class="error">HTTP ${res.status}</span>`;
        return;
      }

      let data = [];
      try { data = JSON.parse(text); } catch { /* empty */ }

      let tasks;
      if (Array.isArray(data)) tasks = data;
      else if (data?.data && Array.isArray(data.data)) tasks = data.data;
      else if (data?.id !== undefined) tasks = [data];
      else tasks = [];

      // Enrich with lookup data (project names)
      Lookups.enrichTasks(tasks);
      try {
        await Lookups.resolveForTasks(tasks);
        Lookups.enrichTasks(tasks);
      } catch { /* non-fatal */ }

      // Group by project
      const projectMap = {};
      tasks.forEach(t => {
        const pid = Array.isArray(t.project_id) ? t.project_id[0] : t.project_id;
        if (!pid) return;
        if (!projectMap[pid]) {
          projectMap[pid] = {
            id: pid,
            name: t.project_name || `Project ${pid}`,
            leader: t.project_leader || "",
            tasks: [],
          };
        }
        projectMap[pid].tasks.push(t);
        // Keep the best name
        if (t.project_name && !projectMap[pid].name.startsWith("Project ")) {
          // already set
        } else if (t.project_name) {
          projectMap[pid].name = t.project_name;
        }
      });

      allProjects = Object.values(projectMap);
      allProjects.sort((a, b) => a.name.localeCompare(b.name));

      renderProjects(allProjects);
    } catch (err) {
      if (err.message?.includes("Session expired")) return;
      console.error("[photos] Fetch error:", err);
      statusEl.innerHTML = '<span class="error">Network error</span>';
    }
  }

  // ── Render project list ──

  function renderProjects(projects) {
    const listEl = document.getElementById("photosList");
    const statusEl = document.getElementById("photosStatus");
    if (!listEl || !statusEl) return;

    listEl.innerHTML = "";

    if (projects.length === 0) {
      statusEl.textContent = "No projects found.";
      return;
    }

    statusEl.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"} found.`;

    projects.forEach(project => {
      const card = document.createElement("div");
      card.className = "photos-project-card";

      const header = document.createElement("div");
      header.className = "photos-project-header";

      const info = document.createElement("div");
      info.className = "photos-project-info";

      const name = document.createElement("div");
      name.className = "photos-project-name";
      name.textContent = project.name;
      info.appendChild(name);

      if (project.leader) {
        const leader = document.createElement("div");
        leader.className = "photos-project-leader";
        leader.textContent = project.leader;
        info.appendChild(leader);
      }

      header.appendChild(info);

      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.className = "secondary btn-sm";
      openBtn.addEventListener("click", () => openProject(project));
      header.appendChild(openBtn);

      card.appendChild(header);
      listEl.appendChild(card);
    });
  }

  // ── Open project → show collectors tree ──

  function openProject(project) {
    currentProject = project;
    Router.showView("photos");
  }

  // ── Fetch collectors for a project ──

  async function fetchCollectors(project) {
    const statusEl = document.getElementById("photosCollectorStatus");
    const treeEl = document.getElementById("photosCollectorTree");
    if (!statusEl || !treeEl) return;

    statusEl.textContent = "Loading collectors\u2026";
    treeEl.innerHTML = "";

    try {
      const res = await Api.get(CONFIG.WEBHOOK_COLLECTORS, { project_id: project.id });
      const text = await res.text();
      if (!text) {
        statusEl.textContent = "No collectors found.";
        return;
      }
      const data = JSON.parse(text);

      const collectoren = Array.isArray(data)
        ? data
        : (data?.collectoren || data?.data || []);

      if (!collectoren || collectoren.length === 0) {
        statusEl.textContent = "No collectors found.";
        return;
      }

      statusEl.textContent = `${collectoren.length} collector${collectoren.length === 1 ? "" : "s"}`;
      renderCollectorTree(collectoren, treeEl, project);
    } catch (err) {
      console.error("[photos] Collectors fetch error:", err);
      statusEl.textContent = "Error loading collectors.";
    }
  }

  // ── Render collector tree (blok → verdiep → collector → photos) ──

  function renderCollectorTree(collectoren, container, project) {
    container.innerHTML = "";

    const hasBlok = collectoren.some(c => c.blok !== undefined && c.blok !== null && c.blok !== "");
    const hasVerdiep = collectoren.some(c => c.verdiep !== undefined && c.verdiep !== null && c.verdiep !== "");

    if (hasBlok) {
      const blokGroups = groupBy(collectoren, "blok");
      sortedEntries(blokGroups).forEach(([blok, blokCollectoren]) => {
        container.appendChild(buildGroupSection(`Block ${blok}`, "photos-group-blok", () => {
          const inner = document.createDocumentFragment();
          if (hasVerdiep) {
            const verdiepGroups = groupBy(blokCollectoren, "verdiep");
            sortedEntries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
              inner.appendChild(buildGroupSection(`Floor ${verdiep}`, "photos-group-verdiep", () => {
                const frag = document.createDocumentFragment();
                vCollectoren.forEach((c, i) => frag.appendChild(buildCollectorSection(c, i, project)));
                return frag;
              }));
            });
          } else {
            blokCollectoren.forEach((c, i) => inner.appendChild(buildCollectorSection(c, i, project)));
          }
          return inner;
        }));
      });
    } else if (hasVerdiep) {
      const verdiepGroups = groupBy(collectoren, "verdiep");
      sortedEntries(verdiepGroups).forEach(([verdiep, vCollectoren]) => {
        container.appendChild(buildGroupSection(`Floor ${verdiep}`, "photos-group-verdiep", () => {
          const frag = document.createDocumentFragment();
          vCollectoren.forEach((c, i) => frag.appendChild(buildCollectorSection(c, i, project)));
          return frag;
        }));
      });
    } else {
      collectoren.forEach((c, i) => container.appendChild(buildCollectorSection(c, i, project)));
    }
  }

  // ── Helpers ──

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
    section.className = `photos-group ${className}`;

    const header = document.createElement("div");
    header.className = "photos-group-header";
    header.innerHTML = `
      <span class="photos-group-chevron">&#9654;</span>
      <span class="photos-group-title">${escapeHtml(title)}</span>`;

    const body = document.createElement("div");
    body.className = "photos-group-body open";
    body.appendChild(buildContent());

    header.addEventListener("click", () => {
      body.classList.toggle("open");
      header.querySelector(".photos-group-chevron").classList.toggle("open");
    });

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  // ── Collector section with photos ──

  function buildCollectorSection(collector, index, project) {
    const naam = collector.naam || collector.name || `Collector ${index + 1}`;

    // Build collector photo ID (same logic as collectors.js)
    const parts = [];
    if (collector.blok !== undefined && collector.blok !== null && collector.blok !== "") {
      parts.push(`Block ${collector.blok}`);
    }
    if (collector.verdiep !== undefined && collector.verdiep !== null && collector.verdiep !== "") {
      parts.push(`Floor ${collector.verdiep}`);
    }
    parts.push(naam);
    const collectorPhotoId = parts.join(" - ");

    const section = document.createElement("div");
    section.className = "photos-collector";

    const header = document.createElement("div");
    header.className = "photos-collector-header";

    header.innerHTML = `
      <div class="photos-collector-left">
        <span class="photos-collector-chevron">&#9654;</span>
        <span class="photos-collector-name">${escapeHtml(naam)}</span>
      </div>`;

    const body = document.createElement("div");
    body.className = "photos-collector-body";

    const gallery = document.createElement("div");
    gallery.className = "photos-gallery";
    gallery.innerHTML = '<span class="hint" style="font-size:12px">Click to load photos...</span>';
    body.appendChild(gallery);

    let loaded = false;
    header.addEventListener("click", () => {
      body.classList.toggle("open");
      header.querySelector(".photos-collector-chevron").classList.toggle("open");

      if (!loaded && body.classList.contains("open")) {
        loaded = true;
        loadCollectorPhotos(project, collectorPhotoId, gallery);
      }
    });

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  // ── Load photos for a collector ──

  async function loadCollectorPhotos(project, collectorId, gallery) {
    gallery.innerHTML = '<span class="hint" style="font-size:12px">Loading...</span>';

    try {
      const params = { project_id: project.id, collector_id: collectorId };
      if (project.name) params.project_name = project.name;
      const res = await Api.get(CONFIG.WEBHOOK_COLLECTOR_PHOTOS, params);
      const raw = await res.json();

      let photos;
      if (Array.isArray(raw)) {
        photos = raw[0]?.photos || raw[0]?.data || raw;
      } else {
        photos = raw?.photos || raw?.data || [];
      }

      renderPhotoGallery(photos, gallery, project, collectorId);
    } catch {
      gallery.innerHTML = '<span class="hint" style="font-size:12px">No photos yet.</span>';
    }
  }

  // ── Render photos with approve/reject buttons ──

  function renderPhotoGallery(photos, gallery, project, collectorId) {
    gallery.innerHTML = "";

    if (!photos || photos.length === 0) {
      gallery.innerHTML = '<span class="hint" style="font-size:12px">No photos yet.</span>';
      return;
    }

    photos.forEach(photo => {
      const thumb = document.createElement("div");
      thumb.className = "photos-thumb";

      const mime = photo.mimetype || "image/jpeg";

      // Image wrapper
      const imgWrap = document.createElement("div");
      imgWrap.className = "photos-img-wrap";

      const img = document.createElement("img");
      if (photo.data) {
        img.src = `data:${mime};base64,${photo.data}`;
      } else if (photo.url) {
        img.src = photo.url;
      }
      img.alt = photo.name || "Photo";
      img.addEventListener("click", () => {
        let src;
        if (photo.data) src = `data:${mime};base64,${photo.data}`;
        else if (photo.url) src = photo.url;
        if (src) showPhotoOverlay(src, photo.name || "Photo");
      });
      imgWrap.appendChild(img);
      thumb.appendChild(imgWrap);

      // Photo name
      if (photo.name) {
        const label = document.createElement("span");
        label.className = "photos-label";
        label.textContent = photo.name;
        label.title = photo.name;
        thumb.appendChild(label);
      }

      // Approve / Reject buttons
      const actions = document.createElement("div");
      actions.className = "photos-actions";

      const approveBtn = document.createElement("button");
      approveBtn.className = "photos-approve-btn";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", () => {
        // Mark as approved visually (backend later)
        thumb.classList.remove("photos-thumb--rejected");
        thumb.classList.add("photos-thumb--approved");
        approveBtn.disabled = true;
        rejectBtn.disabled = false;
      });
      actions.appendChild(approveBtn);

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "photos-reject-btn";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => {
        // Mark as rejected visually (backend later)
        thumb.classList.remove("photos-thumb--approved");
        thumb.classList.add("photos-thumb--rejected");
        rejectBtn.disabled = true;
        approveBtn.disabled = false;
      });
      actions.appendChild(rejectBtn);

      thumb.appendChild(actions);
      gallery.appendChild(thumb);
    });
  }

  // ── Photo overlay / lightbox ──

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

  // ── Register view ──

  Router.register("photos", {
    get template() {
      return currentProject ? detailTemplate(currentProject) : listTemplate;
    },
    mount,
    tab: { label: "Photos", roles: ["projectleider"] },
  });

  return {};
})();
