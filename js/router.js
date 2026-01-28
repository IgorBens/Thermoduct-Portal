/**
 * Simple URL Router for Thermoduct Portal
 *
 * Handles URL patterns:
 * - /                          → Landing/login page
 * - /installer/{slug}          → Installer dashboard
 * - /installer/{slug}/task/{id} → Task detail
 * - /contractor/{id}           → Subcontractor dashboard
 * - ?task={token}              → Legacy task token (redirect)
 */

const Router = {
    routes: {},
    currentRoute: null,

    /**
     * Initialize the router
     */
    async init() {
        // Define routes
        this.routes = {
            'home': {
                pattern: /^\/$/,
                handler: this.showHome
            },
            'installer-dashboard': {
                pattern: /^\/installer\/([a-z0-9-]+)\/?$/,
                handler: this.showInstallerDashboard
            },
            'installer-task': {
                pattern: /^\/installer\/([a-z0-9-]+)\/task\/(\d+)\/?$/,
                handler: this.showTaskDetail
            },
            'contractor-dashboard': {
                pattern: /^\/contractor\/([a-z0-9-]+)\/?$/,
                handler: this.showContractorDashboard
            },
            'legacy-task': {
                pattern: /^\?task=([a-f0-9-]+)$/,
                handler: this.handleLegacyTask
            }
        };

        // Parse current URL
        await this.navigate(window.location.pathname + window.location.search);

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            this.navigate(window.location.pathname, false);
        });
    },

    /**
     * Navigate to a route
     */
    async navigate(path, pushState = true) {
        console.log('Navigating to:', path);

        // Check for legacy task token in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('task')) {
            return this.handleLegacyTask(urlParams.get('task'));
        }

        // Check for stored installer slug
        const storedSlug = localStorage.getItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);

        // If at root and have stored slug, redirect to dashboard
        if ((path === '/' || path === '/index.html') && storedSlug) {
            return this.navigate(`/installer/${storedSlug}`);
        }

        // Find matching route
        for (const [name, route] of Object.entries(this.routes)) {
            const match = path.match(route.pattern);
            if (match) {
                this.currentRoute = name;

                if (pushState) {
                    window.history.pushState({}, '', path);
                }

                // Extract params from regex groups
                const params = match.slice(1);
                await route.handler.call(this, ...params);
                return;
            }
        }

        // No match - show home/login
        await this.showHome();
    },

    /**
     * Show home/login page
     */
    async showHome() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="login-screen">
                <div class="login-card">
                    <img src="assets/logo.png" alt="Thermoduct" class="logo" onerror="this.style.display='none'">
                    <h1>Thermoduct Portal</h1>
                    <p>Voer je persoonlijke code in om je taken te bekijken</p>

                    <form id="login-form">
                        <input
                            type="text"
                            id="installer-slug"
                            placeholder="bijv. jan-de-vries"
                            autocomplete="off"
                            autocapitalize="none"
                            required
                        >
                        <button type="submit">Bekijk taken</button>
                    </form>

                    <p class="hint">Vraag je code aan je projectleider</p>
                </div>
            </div>
        `;
        app.className = '';

        // Handle login form
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const slug = document.getElementById('installer-slug').value.trim().toLowerCase();

            if (slug) {
                // Store for next time
                localStorage.setItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG, slug);
                await this.navigate(`/installer/${slug}`);
            }
        });
    },

    /**
     * Show installer dashboard with all tasks
     */
    async showInstallerDashboard(slug) {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="dashboard">
                <header class="header">
                    <h1>Mijn Taken</h1>
                    <button class="refresh-btn" onclick="Router.refresh()">Verversen</button>
                </header>
                <div id="tasks-container" class="tasks-container">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Taken laden...</p>
                    </div>
                </div>
            </div>
        `;
        app.className = '';

        // Store slug
        localStorage.setItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG, slug);

        // Load tasks
        try {
            const tasks = await API.getInstallerTasks(slug);
            this.renderTasks(tasks);
        } catch (error) {
            this.renderError(error);
        }
    },

    /**
     * Show single task detail
     */
    async showTaskDetail(slug, taskId) {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="task-detail">
                <header class="header">
                    <a href="/installer/${slug}" class="back-btn">&larr; Terug</a>
                    <h1>Taak Details</h1>
                </header>
                <div id="task-container" class="task-container">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Taak laden...</p>
                    </div>
                </div>
            </div>
        `;
        app.className = '';

        // Load task details
        try {
            const task = await API.getTaskDetails(taskId);
            this.renderTaskDetail(task, slug);
        } catch (error) {
            this.renderError(error);
        }
    },

    /**
     * Show subcontractor dashboard
     */
    async showContractorDashboard(contractorId) {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="contractor-dashboard">
                <header class="header">
                    <h1>Projecten Overzicht</h1>
                </header>
                <div id="projects-container">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Projecten laden...</p>
                    </div>
                </div>
            </div>
        `;
        app.className = '';

        // Load contractor tasks
        try {
            const tasks = await API.getContractorTasks(contractorId);
            this.renderContractorTasks(tasks);
        } catch (error) {
            this.renderError(error);
        }
    },

    /**
     * Handle legacy task token URLs
     */
    async handleLegacyTask(token) {
        // For now, show message about new portal
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="legacy-notice">
                <h2>Nieuw Portal</h2>
                <p>We hebben een nieuw portal! Vraag je projectleider om je persoonlijke link.</p>
                <a href="/" class="btn">Naar login</a>
            </div>
        `;
        app.className = '';
    },

    /**
     * Render tasks grouped by date
     */
    renderTasks(data) {
        const container = document.getElementById('tasks-container');

        if (!data.tasks || data.tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>${CONFIG.MESSAGES.NO_TASKS}</p>
                    <p class="hint">Trek de pagina omlaag om te verversen</p>
                </div>
            `;
            return;
        }

        // Group tasks by date
        const tasksByDate = {};
        data.tasks.forEach(task => {
            const date = task.date || 'Ongepland';
            if (!tasksByDate[date]) {
                tasksByDate[date] = [];
            }
            tasksByDate[date].push(task);
        });

        let html = '';

        Object.entries(tasksByDate).forEach(([date, tasks]) => {
            const dateFormatted = this.formatDate(date);
            const isToday = this.isToday(date);

            html += `
                <div class="date-group ${isToday ? 'today' : ''}">
                    <h2 class="date-header">${dateFormatted}${isToday ? ' (Vandaag)' : ''}</h2>
                    <div class="tasks-list">
                        ${tasks.map(task => this.renderTaskCard(task, data.installer?.slug || '')).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Add click handlers
        container.querySelectorAll('.task-card').forEach(card => {
            card.addEventListener('click', () => {
                const taskId = card.dataset.taskId;
                const slug = localStorage.getItem(CONFIG.SETTINGS.STORAGE_KEYS.INSTALLER_SLUG);
                this.navigate(`/installer/${slug}/task/${taskId}`);
            });
        });
    },

    /**
     * Render single task card
     */
    renderTaskCard(task, slug) {
        const progress = task.collectors_total > 0
            ? Math.round((task.collectors_completed / task.collectors_total) * 100)
            : 0;

        return `
            <div class="task-card" data-task-id="${task.id}">
                <div class="task-header">
                    <h3>${task.project || task.name}</h3>
                    ${task.has_pdfs ? '<span class="pdf-badge">PDF</span>' : ''}
                </div>
                <div class="task-info">
                    <p class="address">${task.address || 'Geen adres'}</p>
                    <p class="time">${task.start_time || ''} - ${task.end_time || ''}</p>
                </div>
                ${task.collectors_total > 0 ? `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <p class="progress-text">${task.collectors_completed}/${task.collectors_total} collectors</p>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render task detail view
     */
    renderTaskDetail(task, slug) {
        const container = document.getElementById('task-container');

        // This will be expanded with full collector forms
        container.innerHTML = `
            <div class="task-info-full">
                <h2>${task.project?.name || task.name}</h2>
                <p class="address">${task.address?.name || ''}</p>

                <div class="task-meta">
                    <p><strong>Datum:</strong> ${this.formatDate(task.date)}</p>
                    <p><strong>Tijd:</strong> ${task.time_start} - ${task.time_end}</p>
                </div>

                <div class="pdf-section">
                    <h3>PDF Plans</h3>
                    <div id="pdf-list">
                        <button onclick="TaskHandler.loadPDFs(${task.id})">Laad PDF's</button>
                    </div>
                </div>

                <div class="collectors-section">
                    <h3>Collectors (${task.collectors_total || 0})</h3>
                    <div id="collectors-list">
                        <!-- Collector forms will be rendered here -->
                        <p>Collector formulieren worden hier geladen...</p>
                    </div>
                </div>
            </div>
        `;

        // Load collectors if available
        if (task.collectors_total > 0) {
            this.renderCollectorForms(task);
        }
    },

    /**
     * Render collector forms based on collector count
     */
    renderCollectorForms(task) {
        const container = document.getElementById('collectors-list');
        const collectorStatus = task.collector_status || {};

        let html = '';

        for (let i = 1; i <= task.collectors_total; i++) {
            const status = collectorStatus[i] || {};
            const isCompleted = status.completed || false;

            html += `
                <div class="collector-form ${isCompleted ? 'completed' : ''}" data-collector="${i}">
                    <div class="collector-header">
                        <h4>Collector ${i}</h4>
                        ${isCompleted ? '<span class="status-badge">Afgerond</span>' : ''}
                    </div>

                    <div class="form-group">
                        <label>Verantwoordelijke</label>
                        <select id="responsible-${i}" ${isCompleted ? 'disabled' : ''}>
                            <option value="">Selecteer...</option>
                            ${(task.installers || []).map(inst =>
                                `<option value="${inst.id}" ${status.responsible_id === inst.id ? 'selected' : ''}>${inst.name}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Manometer foto (druktest)</label>
                        <div class="photo-upload" id="manometer-upload-${i}">
                            ${status.manometer_photo_id
                                ? '<span class="upload-done">Geupload</span>'
                                : `<input type="file" accept="image/*" capture="environment"
                                    onchange="PhotoHandler.upload(this, ${task.id}, ${i}, 'manometer')">`
                            }
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Leidingwerk foto's</label>
                        <div class="photo-upload multi" id="pipe-upload-${i}">
                            ${(status.pipe_photo_ids || []).length > 0
                                ? `<span class="upload-done">${status.pipe_photo_ids.length} foto's geupload</span>`
                                : ''
                            }
                            <input type="file" accept="image/*" capture="environment" multiple
                                onchange="PhotoHandler.uploadMultiple(this, ${task.id}, ${i}, 'pipe')">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Opmerkingen / Wijzigingen</label>
                        <textarea id="notes-${i}" placeholder="Noteer hier eventuele afwijkingen of problemen..."
                            ${isCompleted ? 'disabled' : ''}>${status.notes || ''}</textarea>
                    </div>

                    ${!isCompleted ? `
                        <button class="complete-btn" onclick="CollectorHandler.complete(${task.id}, ${i})">
                            Collector ${i} afronden
                        </button>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = html;
    },

    /**
     * Render contractor tasks view
     */
    renderContractorTasks(data) {
        const container = document.getElementById('projects-container');
        // Implementation for contractor view
        container.innerHTML = `<p>Onderaannemer view wordt nog ontwikkeld...</p>`;
    },

    /**
     * Render error state
     */
    renderError(error) {
        const container = document.getElementById('tasks-container')
            || document.getElementById('task-container')
            || document.getElementById('projects-container');

        container.innerHTML = `
            <div class="error-state">
                <p>${error.message || CONFIG.MESSAGES.UNKNOWN_ERROR}</p>
                <button onclick="Router.refresh()">Opnieuw proberen</button>
            </div>
        `;
    },

    /**
     * Refresh current view
     */
    async refresh() {
        await this.navigate(window.location.pathname, false);
    },

    /**
     * Format date to Dutch locale
     */
    formatDate(dateStr) {
        if (!dateStr || dateStr === 'Ongepland') return dateStr;

        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString(CONFIG.DATE_LOCALE, CONFIG.DATE_OPTIONS);
        } catch {
            return dateStr;
        }
    },

    /**
     * Check if date is today
     */
    isToday(dateStr) {
        if (!dateStr) return false;

        const today = new Date().toISOString().split('T')[0];
        return dateStr === today;
    }
};
