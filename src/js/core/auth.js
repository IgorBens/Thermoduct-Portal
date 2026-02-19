// ===== AUTHENTICATION — Keycloak OIDC with PKCE =====
//
// Uses the PKCE (Proof Key for Code Exchange) flow — the only
// secure way to do OIDC from a plain JS app with no backend.
// No client secret is needed or used. Security comes from:
//   1. PKCE — prevents auth code interception
//   2. HTTPS — protects all traffic
//   3. sessionStorage — tokens cleared when tab closes
//
// Flow:
//   1. Auth.login() → redirect to Keycloak login page
//   2. Keycloak redirects to /callback.html with auth code
//   3. Auth.handleCallback() → exchanges code for tokens (PKCE)
//   4. Tokens stored in sessionStorage
//   5. Api module sends access_token as Bearer header
//   6. Roles come from the access_token JWT payload
//
// All config comes from CONFIG (generated from .env).

// ── Token storage ──
// sessionStorage is per-tab and cleared when the tab closes.
// Keycloak's SSO cookie makes re-auth seamless — no login prompt.
const Storage = {
  set:    (key, value) => sessionStorage.setItem(key, value),
  get:    (key)        => sessionStorage.getItem(key),
  remove: (key)        => sessionStorage.removeItem(key),
  clear:  ()           => {
    ["access_token", "id_token", "refresh_token",
     "code_verifier", "auth_state"].forEach(k => sessionStorage.removeItem(k));
  },
};

// ── PKCE helpers ──
// Generate random string for code_verifier and state.
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join("");
}

// SHA-256 hash the verifier into a code_challenge (base64url encoded).
async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g,  "");
}

// ── JWT parsing ──
// Decode the payload of a JWT (header.payload.signature).
// We don't verify the signature — the token came directly from
// Keycloak over HTTPS, so we trust it.
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// ── Auth object ──
const Auth = {
  // Cache the OIDC discovery document (fetched once per page load).
  _endpoints: null,

  async getEndpoints() {
    if (this._endpoints) return this._endpoints;
    const res = await fetch(`${CONFIG.AUTH_ISSUER}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error("Kan Keycloak niet bereiken");
    this._endpoints = await res.json();
    return this._endpoints;
  },

  // ── login() ──
  // Generates PKCE pair and redirects to Keycloak's login page.
  async login() {
    const endpoints = await this.getEndpoints();

    const verifier  = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    Storage.set("code_verifier", verifier);

    const state = generateRandomString(16);
    Storage.set("auth_state", state);

    const params = new URLSearchParams({
      response_type:         "code",
      client_id:             CONFIG.AUTH_CLIENT_ID,
      redirect_uri:          CONFIG.AUTH_REDIRECT_URI,
      scope:                 CONFIG.AUTH_SCOPES,
      state:                 state,
      code_challenge:        challenge,
      code_challenge_method: "S256",
    });

    window.location.href = `${endpoints.authorization_endpoint}?${params}`;
  },

  // ── handleCallback() ──
  // Called from callback.html after Keycloak redirects back.
  async handleCallback() {
    const params        = new URLSearchParams(window.location.search);
    const code          = params.get("code");
    const returnedState = params.get("state");
    const error         = params.get("error");

    if (error) {
      console.error("Keycloak error:", params.get("error_description"));
      window.location.href = "/index.html";
      return;
    }

    const savedState = Storage.get("auth_state");
    if (!code || returnedState !== savedState) {
      console.error("State mismatch — possible CSRF, aborting");
      window.location.href = "/index.html";
      return;
    }

    const verifier  = Storage.get("code_verifier");
    const endpoints = await this.getEndpoints();

    const response = await fetch(endpoints.token_endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     CONFIG.AUTH_CLIENT_ID,
        redirect_uri:  CONFIG.AUTH_REDIRECT_URI,
        code:          code,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      console.error("Token exchange failed:", await response.text());
      window.location.href = "/index.html";
      return;
    }

    const tokens = response.json ? await response.json() : {};

    Storage.set("access_token",  tokens.access_token);
    Storage.set("id_token",      tokens.id_token);
    if (tokens.refresh_token) {
      Storage.set("refresh_token", tokens.refresh_token);
    }

    // Clean up PKCE state
    Storage.remove("code_verifier");
    Storage.remove("auth_state");

    // Go to the main app
    window.location.href = "/index.html";
  },

  // ── isAuthenticated() ──
  // True if we have a valid, non-expired access token.
  isAuthenticated() {
    const token = Storage.get("access_token");
    if (!token) return false;
    const payload = parseJwt(token);
    if (!payload) return false;
    if (payload.exp * 1000 < Date.now()) {
      Storage.clear();
      return false;
    }
    return true;
  },

  // ── getUser() ──
  // Returns user profile from the id_token.
  // Fields: name, preferred_username, email, sub (user ID)
  getUser() {
    const token = Storage.get("id_token");
    if (!token) return null;
    return parseJwt(token);
  },

  // ── getRoles() ──
  // Returns custom realm roles from the access_token.
  // Filters out Keycloak's built-in roles (offline_access, uma_authorization, default-roles-*)
  // e.g. ["installer"] or ["admin", "installer"]
  getRoles() {
    const token = Storage.get("access_token");
    if (!token) return [];
    const payload = parseJwt(token);
    const allRoles = payload?.roles ?? [];
    return allRoles.filter(r => {
      const lower = r.toLowerCase();
      return lower !== "offline_access"
          && lower !== "uma_authorization"
          && !lower.startsWith("default-roles-");
    });
  },

  // ── hasRole() ──
  hasRole(role) {
    return this.getRoles().includes(role);
  },

  // ── authHeader() ──
  // Returns the Bearer header value for the Api module.
  authHeader() {
    const token = Storage.get("access_token");
    return token ? `Bearer ${token}` : "";
  },

  // ── isTokenExpired() ──
  // Check if the access token is expired (or will expire within 30s).
  isTokenExpired() {
    const token = Storage.get("access_token");
    if (!token) return true;
    const payload = parseJwt(token);
    if (!payload) return true;
    return payload.exp * 1000 < Date.now() + 30000; // 30s buffer
  },

  // ── refreshAccessToken() ──
  // Uses the stored refresh_token to get a new access_token from Keycloak.
  // Returns true on success, false on failure.
  _refreshing: null,
  async refreshAccessToken() {
    // Deduplicate: if a refresh is already in-flight, wait for it
    if (this._refreshing) return this._refreshing;

    this._refreshing = (async () => {
      const refreshToken = Storage.get("refresh_token");
      if (!refreshToken) return false;

      try {
        const endpoints = await this.getEndpoints();
        const res = await fetch(endpoints.token_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "refresh_token",
            client_id:     CONFIG.AUTH_CLIENT_ID,
            refresh_token: refreshToken,
          }),
        });

        if (!res.ok) {
          console.warn("[auth] Token refresh failed:", res.status);
          return false;
        }

        const tokens = await res.json();
        Storage.set("access_token", tokens.access_token);
        if (tokens.id_token) Storage.set("id_token", tokens.id_token);
        if (tokens.refresh_token) Storage.set("refresh_token", tokens.refresh_token);
        console.log("[auth] Token refreshed successfully");
        return true;
      } catch (err) {
        console.error("[auth] Token refresh error:", err);
        return false;
      }
    })();

    try { return await this._refreshing; }
    finally { this._refreshing = null; }
  },

  // ── ensureValidToken() ──
  // Refreshes the token if it's expired. Returns true if we have a valid token.
  async ensureValidToken() {
    if (!this.isTokenExpired()) return true;
    return this.refreshAccessToken();
  },

  // ── clearSession() ──
  // Clear local tokens without Keycloak logout redirect.
  // Used by the Api module on 401 (expired token).
  clearSession() {
    Storage.clear();
  },

  // ── logout() ──
  // Full logout: clear local tokens + kill Keycloak SSO session.
  async logout() {
    const endpoints = await this.getEndpoints();
    const idToken   = Storage.get("id_token");
    Storage.clear();

    const params = new URLSearchParams({
      post_logout_redirect_uri: CONFIG.AUTH_POST_LOGOUT_URI,
      id_token_hint:            idToken,
      client_id:                CONFIG.AUTH_CLIENT_ID,
    });

    window.location.href = `${endpoints.end_session_endpoint}?${params}`;
  },
};
