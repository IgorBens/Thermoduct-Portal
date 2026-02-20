// ===== UTILITIES =====

// ── Date helpers ──

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isDateInPast(dateStr) {
  return dateStr < getTodayString();
}

function getNextWorkDay() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 6=Sat
  const add = day === 5 ? 3 : day === 6 ? 2 : 1; // Fri→Mon, Sat→Mon, else tomorrow
  d.setDate(d.getDate() + add);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTaskDate(t) {
  if (t.date) return t.date;
  if (t.planned_date_begin) return String(t.planned_date_begin).split(" ")[0];
  return "";
}

function formatDateLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  if (date.getTime() === today.getTime())     return "Today";
  if (date.getTime() === tomorrow.getTime())  return "Tomorrow";

  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ── HTML helpers ──

function escapeHtml(str) {
  const el = document.createElement("div");
  el.textContent = str;
  return el.innerHTML;
}

// ── PDF helpers ──

function base64ToPdfBlob(base64) {
  const bytes = atob(String(base64 || "").replace(/\s/g, ""));
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: "application/pdf" });
}

function downloadPdf(base64, filename) {
  const url = URL.createObjectURL(base64ToPdfBlob(base64));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename || "file.pdf" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function viewPdf(base64) {
  const url = URL.createObjectURL(base64ToPdfBlob(base64));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
