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
  if (t.date) return String(t.date).split(" ")[0];
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

  const [y, m, d] = dateStr.split(" ")[0].split("-").map(Number);
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

// ── File helpers ──

function base64ToBlob(base64, mimetype) {
  const bytes = atob(String(base64 || "").replace(/\s/g, ""));
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimetype || "application/octet-stream" });
}

function downloadFile(base64, filename, mimetype) {
  const url = URL.createObjectURL(base64ToBlob(base64, mimetype));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename || "file" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function viewFile(base64, mimetype) {
  const url = URL.createObjectURL(base64ToBlob(base64, mimetype));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function isImageMime(mimetype) {
  return /^image\//i.test(mimetype);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mime>;base64,AAAA…" — strip the prefix
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Image compression ──

/** Max dimension (px) for uploaded images — keeps quality high enough for field photos */
const COMPRESS_MAX_DIM = 1920;
/** JPEG quality (0–1) */
const COMPRESS_QUALITY = 0.80;

/**
 * Compress an image file via canvas.
 * Returns { base64, filename } where base64 is the raw base64 string (no prefix).
 * PDFs and non-image files are returned as-is (no compression).
 */
function compressImage(file) {
  // Skip non-images (PDFs, etc.)
  if (!/^image\/(jpeg|png|heic|heif|webp)/i.test(file.type)) {
    return fileToBase64(file).then(b64 => ({ base64: b64, filename: file.name }));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if larger than max dimension
      if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
        const ratio = Math.min(COMPRESS_MAX_DIM / width, COMPRESS_MAX_DIM / height);
        width  = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      // Always output as JPEG for smaller size
      const dataUrl = canvas.toDataURL("image/jpeg", COMPRESS_QUALITY);
      const base64  = dataUrl.split(",")[1];

      // Rename extension to .jpg
      const baseName = file.name.replace(/\.[^.]+$/, "");
      resolve({ base64, filename: `${baseName}.jpg` });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: return uncompressed
      fileToBase64(file).then(b64 => resolve({ base64: b64, filename: file.name })).catch(reject);
    };

    img.src = url;
  });
}

// ── Parallel upload helper ──

/**
 * Run async tasks in parallel with a concurrency limit.
 * @param {Array} items - items to process
 * @param {number} concurrency - max parallel workers
 * @param {Function} fn - async function(item, index) to call for each item
 */
async function parallelMap(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
