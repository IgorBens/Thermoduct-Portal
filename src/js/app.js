// ===== APP INITIALIZATION =====
// Loaded last — sets title and starts the router.

document.addEventListener("DOMContentLoaded", () => {
  document.title = CONFIG.APP_TITLE;

  Router.init();

  console.log("[app] Thermoduct Portal initialized");
});
