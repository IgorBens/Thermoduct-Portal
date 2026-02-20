// ===== API CLIENT =====
//
// Centralized fetch wrapper. All webhook calls go through here so:
//   - JWT Bearer token is always attached
//   - 401 responses auto-logout and redirect to login
//   - URL building is consistent
//
// Usage:
//   const res = await Api.get(CONFIG.WEBHOOK_TASKS + "/tasks");
//   const res = await Api.get(CONFIG.WEBHOOK_FILES, { project_id: 123 });
//   const res = await Api.post(CONFIG.WEBHOOK_FILE_DELETE, { ... });
//   const url = Api.url(CONFIG.WEBHOOK_SERVE_FILE, { project_id: 123 });

const Api = (() => {

  function buildUrl(endpoint, params) {
    const base = endpoint.startsWith("http")
      ? endpoint
      : `${CONFIG.API_BASE_URL}${endpoint}`;

    if (!params || Object.keys(params).length === 0) return base;
    return `${base}?${new URLSearchParams(params)}`;
  }

  async function request(url, options = {}) {
    // Proactively refresh the token if it's about to expire
    await Auth.ensureValidToken();

    const headers = {
      "Accept": "application/json",
      "Authorization": Auth.authHeader(),
      ...options.headers,
    };

    let res = await fetch(url, { ...options, headers, cache: "no-store" });

    // On 401, try refreshing the token once before giving up
    if (res.status === 401) {
      const refreshed = await Auth.refreshAccessToken();
      if (refreshed) {
        headers["Authorization"] = Auth.authHeader();
        res = await fetch(url, { ...options, headers, cache: "no-store" });
      }

      if (res.status === 401) {
        Auth.clearSession();
        Router.showView("login");
        throw new Error("Session expired — please log in again");
      }
    }

    return res;
  }

  return {
    async get(endpoint, params = {}) {
      return request(buildUrl(endpoint, params));
    },

    async post(endpoint, body, params = {}) {
      return request(buildUrl(endpoint, params), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },

    // Build a URL without fetching (for <img src>, download links, etc.)
    url(endpoint, params = {}) {
      return buildUrl(endpoint, params);
    },
  };
})();
