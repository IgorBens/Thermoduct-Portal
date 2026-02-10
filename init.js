// ===== EVENT LISTENERS =====
// This file loads last to ensure all functions are defined

loginBtn.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", () => {
  clearCreds();
  refreshLoginUI();
  myTasksList.innerHTML = "";
  myTasksStatus.textContent = "—";
});

myTasksBtn.addEventListener("click", fetchMyTasks);

// ===== INIT =====
refreshLoginUI();

console.log("[init] Portal initialized");
console.log("[init] Available functions:", {
  fetchTask: typeof fetchTask,
  fetchMyTasks: typeof fetchMyTasks,
  renderMyTasks: typeof renderMyTasks
});
