# Adding New Views / Modules

## Quick Steps

1. **JS** — Create `src/js/views/yourview.js`
2. **CSS** — Create `src/css/yourview.css`
3. **HTML** — Add `<link>` and `<script>` tags in `src/index.html`

No other files need editing. The router auto-discovers tabs from registered views.


## View Template

```js
// src/js/views/yourview.js
(() => {
  const template = `
    <div class="card">
      <div class="section-title">Your Title</div>
      <!-- your HTML here -->
    </div>
  `;

  function mount() {
    // Called after template HTML is injected into #viewContainer.
    // Bind events, fetch data, etc.
  }

  function unmount() {
    // Called before switching to another view (optional).
    // Save filter state, scroll position, etc.
  }

  Router.register("yourview", {
    template,
    mount,
    unmount,   // optional
    tab: {
      label: "Tab Name",           // shown in the nav bar
      roles: ["*"],                 // "*" = everyone, or ["admin", "projectleider"]
    },
  });
})();
```


## Add to index.html

```html
<!-- In <head>, after the other CSS files: -->
<link rel="stylesheet" href="css/yourview.css" />

<!-- In the script section, before app.js: -->
<script src="js/views/yourview.js"></script>
```


## Roles (Keycloak)

Roles come from Keycloak's access token. Use these in your views:

```js
Auth.getRoles()          // ["installer", "admin"]
Auth.hasRole("admin")    // true/false
Auth.getUser()           // { name, preferred_username, email, sub, ... }
```

Tab visibility is role-filtered automatically:
```js
tab: { label: "Dashboard", roles: ["admin", "projectleider"] }
```


## API Calls

Always use the `Api` module — it attaches the JWT Bearer token and handles 401:

```js
// GET with query params
const res = await Api.get(CONFIG.WEBHOOK_FILES, { project_id: 123 });
const data = await res.json();

// POST with body
const res = await Api.post(CONFIG.WEBHOOK_FILE_DELETE, {
  project_id: 123,
  file_name: "photo.jpg",
});

// Build a URL (for <img src>, download links — no fetch)
const url = Api.url(CONFIG.WEBHOOK_SERVE_FILE, { project_id: 123 });
```


## Views vs Components

- **View** = registered with Router, gets a nav tab, has template + mount.
  Examples: tasks, dashboard, settings.

- **Component** = used inside a view, NOT registered with Router.
  Example: `documents.js` (folder tree, mounted inside taskDetail).

Components don't need `Router.register()`. They just export functions
that a view calls (e.g. `Documents.init()`, `Documents.setProjectId()`).


## Adding a New Webhook / Env Var

1. Add to `.env.example` with a description
2. Add to `src/js/core/config.js.template`
3. Add the `${VAR_NAME}` to the envsubst list in `docker-entrypoint.sh`
4. Use it in your code as `CONFIG.YOUR_VAR`


## File Structure

```
src/
  index.html                ← shell (header + empty <main>), add tags here
  callback.html             ← Keycloak OIDC redirect (don't touch)
  css/
    variables.css            ← :root color vars
    base.css                 ← buttons, cards, forms, utility classes
    layout.css               ← header, nav tabs, responsive
    login.css                ← login page
    tasks.css                ← task cards, task detail, PDFs
    documents.css            ← folder tree, thumbnails
    yourview.css             ← add your CSS here
  js/
    core/                    ← infrastructure (rarely changes)
      config.js.template     ← env var placeholders
      auth.js                ← Keycloak OIDC (PKCE flow)
      api.js                 ← fetch wrapper (auto auth + 401)
      utils.js               ← date formatting, escapeHtml, PDF helpers
      router.js              ← view registration + role-based nav
    views/                   ← one file per feature
      login.js               ← Keycloak login redirect
      tasks.js               ← task list with date filtering
      taskDetail.js          ← single task + PDFs
      documents.js           ← folder tree component (used by taskDetail)
      yourview.js            ← add your views here
    app.js                   ← init (11 lines, don't touch)

.env.example                 ← all config + pathway overview
docker-compose.yml           ← docker compose up
Dockerfile                   ← nginx:alpine + envsubst
docker-entrypoint.sh         ← generates config.js from .env
nginx/default.conf           ← static file serving
```
