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
    // Proactively refresh the token if it's about to expire.
    // If refresh fails (e.g. refresh_token also expired), bail out
    // immediately instead of sending an expired token to the backend.
    const valid = await Auth.ensureValidToken();
    if (!valid) {
      Auth.clearSession();
      Router.showView("login");
      throw new Error("Session expired — please log in again");
    }

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

    // n8n sub-workflows can't set the HTTP status code, so the auth
    // subflow returns { valid: false, statusCode: 401 } inside a 200.
    // Peek at the body — if it's an auth rejection, treat it as a 401.
    if (res.ok) {
      const clone = res.clone();
      try {
        const body = await clone.json();
        if (body?.valid === false && body?.statusCode === 401) {
          const refreshed = await Auth.refreshAccessToken();
          if (refreshed) {
            headers["Authorization"] = Auth.authHeader();
            res = await fetch(url, { ...options, headers, cache: "no-store" });
            // Check again after retry
            const retryClone = res.clone();
            try {
              const retryBody = await retryClone.json();
              if (retryBody?.valid === false && retryBody?.statusCode === 401) {
                Auth.clearSession();
                Router.showView("login");
                throw new Error("Session expired — please log in again");
              }
            } catch (e) { if (e.message?.includes("Session expired")) throw e; }
          } else {
            Auth.clearSession();
            Router.showView("login");
            throw new Error("Session expired — please log in again");
          }
        }
      } catch (e) {
        // Not JSON or session expired — let it through
        if (e.message?.includes("Session expired")) throw e;
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
