"use strict";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let selectedFiles = [];   // FileList → Array of File objects
let batchZipData  = null; // { blob, filename } for multi-file download

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const dropZone   = document.getElementById("dropZone");
const fileInput  = document.getElementById("fileInput");
const fileList   = document.getElementById("fileList");
const submitBtn  = document.getElementById("submitBtn");
const statusEl   = document.getElementById("status");
const resultsEl  = document.getElementById("results");
const resultCards= document.getElementById("resultCards");
const resultsSummary = document.getElementById("resultsSummary");

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function setStatus(message, type = "info") {
  statusEl.hidden  = false;
  statusEl.className = "status " + type;
  statusEl.innerHTML = type === "loading"
    ? `<div class="spinner"></div><span>${message}</span>`
    : `<span>${message}</span>`;
}

function clearStatus() {
  statusEl.hidden = true;
  statusEl.className = "status";
  statusEl.innerHTML = "";
}

// ---------------------------------------------------------------------------
// File management
// ---------------------------------------------------------------------------
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"]);
const MAX_BYTES = 50 * 1024 * 1024;

function addFiles(files) {
  let totalAdded = 0;
  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      setStatus(`"${file.name}" is not a supported image format.`, "error");
      continue;
    }
    if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
      selectedFiles.push(file);
      totalAdded++;
    }
  }
  if (totalAdded) clearStatus();
  renderFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  if (!selectedFiles.length) {
    fileList.hidden = true;
    submitBtn.disabled = true;
    return;
  }
  fileList.hidden = false;
  submitBtn.disabled = false;

  fileList.innerHTML = selectedFiles.map((file, i) => {
    const objUrl = URL.createObjectURL(file);
    return `
      <div class="file-item" data-index="${i}">
        <img class="file-thumb" src="${objUrl}" alt="" loading="lazy" />
        <div class="file-info">
          <div class="file-name">${escHtml(file.name)}</div>
          <div class="file-size">${humanSize(file.size)}</div>
        </div>
        <button class="file-remove" type="button" aria-label="Remove ${escHtml(file.name)}" data-index="${i}">✕</button>
      </div>`;
  }).join("");

  fileList.querySelectorAll(".file-remove").forEach(btn => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.index)));
  });
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ---------------------------------------------------------------------------
// Drag-and-drop
// ---------------------------------------------------------------------------
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = "";
});

dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

// ---------------------------------------------------------------------------
// Form submit
// ---------------------------------------------------------------------------
document.getElementById("uploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!selectedFiles.length) return;

  const mode = document.querySelector('input[name="mode"]:checked').value;

  // Check total size
  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_BYTES) {
    setStatus(`Total file size (${humanSize(totalSize)}) exceeds 50 MB limit.`, "error");
    return;
  }

  // Reset results
  resultsEl.hidden = true;
  resultCards.innerHTML = "";
  batchZipData = null;

  const fd = new FormData();
  fd.append("mode", mode);
  for (const f of selectedFiles) fd.append("photos", f);

  setStatus("Processing… this may take a few seconds.", "loading");
  submitBtn.disabled = true;

  try {
    const resp = await fetch("/process", { method: "POST", body: fd });

    if (!resp.ok) {
      let msg = "Server error";
      try { const j = await resp.json(); msg = j.error || msg; } catch (_) {}
      setStatus(msg, "error");
      submitBtn.disabled = false;
      return;
    }

    const faceCount = Number(resp.headers.get("X-Face-Count") || 0);
    const fileCount = Number(resp.headers.get("X-File-Count") || 1);
    const contentType = resp.headers.get("Content-Type") || "";

    if (contentType.includes("application/zip")) {
      // Multiple files returned as ZIP
      const blob = await resp.blob();
      const cd   = resp.headers.get("Content-Disposition") || "";
      const name = cd.match(/filename="?([^";\n]+)"?/)?.[1] || "anonymised_photos.zip";
      batchZipData = { blob, filename: name };

      clearStatus();
      showBatchResult(fileCount, faceCount, blob, name);
    } else {
      // Single file
      const blob = await resp.blob();
      const cd   = resp.headers.get("Content-Disposition") || "";
      const name = cd.match(/filename="?([^";\n]+)"?/)?.[1] || "anonymised.jpg";

      clearStatus();
      showSingleResult(selectedFiles[0], blob, name, faceCount);
    }
  } catch (err) {
    setStatus("Network error: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Results rendering
// ---------------------------------------------------------------------------
function showSingleResult(originalFile, processedBlob, outName, faceCount) {
  const originalUrl  = URL.createObjectURL(originalFile);
  const processedUrl = URL.createObjectURL(processedBlob);

  const faceText = faceCount === 0
    ? "No faces detected"
    : `${faceCount} face${faceCount > 1 ? "s" : ""} anonymised`;

  resultCards.innerHTML = `
    <div class="result-card">
      <div class="before-after">
        <div class="ba-panel">
          <span class="ba-label">Before</span>
          <img class="ba-img" src="${originalUrl}" alt="Original photo" />
        </div>
        <div class="ba-panel">
          <span class="ba-label">After</span>
          <img class="ba-img" src="${processedUrl}" alt="Processed photo" />
        </div>
      </div>
      <div class="card-footer">
        <div class="card-filename">${escHtml(outName)}</div>
        <div class="card-faces">${faceText}</div>
        <a class="btn-download" href="${processedUrl}" download="${escHtml(outName)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
          </svg>
          Download
        </a>
      </div>
    </div>`;

  resultsSummary.textContent = `1 photo processed · ${faceText}`;
  resultsEl.hidden = false;
}

function showBatchResult(fileCount, faceCount, zipBlob, zipName) {
  const zipUrl   = URL.createObjectURL(zipBlob);
  const faceText = faceCount === 0 ? "No faces detected" : `${faceCount} face${faceCount !== 1 ? "s" : ""} anonymised`;

  resultCards.innerHTML = `
    <div class="result-card" style="grid-column: 1/-1;">
      <div class="card-footer" style="padding: 1.5rem;">
        <div style="font-size:1.1rem; font-weight:600; margin-bottom:.25rem;">
          ${fileCount} photo${fileCount > 1 ? "s" : ""} processed
        </div>
        <div class="card-faces">${faceText} across all photos</div>
        <a class="btn-download" href="${zipUrl}" download="${escHtml(zipName)}" style="margin-top:.5rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
          </svg>
          Download ZIP (all ${fileCount} photos)
        </a>
      </div>
    </div>`;

  resultsSummary.textContent = `${fileCount} photos processed · ${faceText}`;
  resultsEl.hidden = false;
}
