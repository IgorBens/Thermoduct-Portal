// ===== LOGIN VIEW =====
// No form — redirects to Keycloak's login page.
// Keycloak handles username/password, MFA, etc.

(() => {
  const template = `
    <div class="login-wrapper">
      <img src="img/logo.png" alt="Thermoduct" class="login-logo"
           onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" />
      <div class="login-logo-fallback" style="display:none;"><span>T</span></div>
      <h1 id="loginTitle"></h1>
      <p class="login-subtitle">Installateurportaal</p>
      <div class="card">
        <p style="color:var(--muted);font-size:14px;margin:0 0 16px">
          Log in om verder te gaan.
        </p>
        <button id="loginBtn" class="btn-block">Inloggen</button>
        <div id="loginStatus" class="hint"></div>
      </div>
    </div>
  `;

  function mount() {
    document.getElementById("loginTitle").textContent = CONFIG.APP_TITLE;

    document.getElementById("loginBtn").addEventListener("click", async () => {
      const statusEl = document.getElementById("loginStatus");
      statusEl.textContent = "Redirecting to login\u2026";

      try {
        await Auth.login(); // redirects to Keycloak
      } catch (err) {
        statusEl.textContent = "Could not connect to authentication server.";
        console.error("[login]", err);
      }
    });
  }

  Router.register("login", { template, mount });
})();
