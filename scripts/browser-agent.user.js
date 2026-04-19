// ==UserScript==
// @name         Muse Oracle Browser Agent
// @namespace    https://muse-oracle.local/
// @version      1.0.0
// @description  Browser agent for Muse Oracle Engine — polls local server, executes image generation prompts on Gemini web, downloads and uploads results.
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ========================
  // Configuration
  // ========================

  /**
   * Base URL of the local Muse Oracle backend server.
   * Change this if your server runs on a different port.
   */
  const SERVER_BASE = (() => {
    // Try reading from localStorage first
    const stored = localStorage.getItem("MO_AGENT_SERVER_URL");
    if (stored) return stored;
    return "http://localhost:8080";
  })();

  /** Polling interval in ms — how often to check for new tasks */
  const POLL_INTERVAL_MS = 8000;

  /** Max time to wait for an image to appear after sending prompt (ms) */
  const IMAGE_WAIT_TIMEOUT_MS = 300_000; // 5 minutes

  /** How frequently to check DOM for generated images while waiting (ms) */
  const IMAGE_CHECK_INTERVAL_MS = 2000;

  /** Delay range (ms) between operations to simulate human behavior [min, max] */
  const RANDOM_DELAY_RANGE = [3000, 8000];

  // ========================
  // Utilities
  // ========================

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Returns a random integer in [min, max] */
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  /** Random human-like delay */
  async function randomDelay() {
    const ms = randInt(RANDOM_DELAY_RANGE[0], RANDOM_DELAY_RANGE[1]);
    console.log(`[Agent] Sleeping ${Math.round(ms / 1000)}s...`);
    await sleep(ms);
  }

  function safeJsonParse(str, fallback = null) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function log(msg) {
    console.log(`[Agent] ${new Date().toLocaleTimeString()} | ${msg}`);
  }

  function logError(msg) {
    console.error(`[Agent] ERROR | ${msg}`);
  }

  // ========================
  // Server API Client
  // ========================

  const api = {
    _request(method, path, body) {
      return new Promise((resolve, reject) => {
        const url = SERVER_BASE + path;
        const options = {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          data: body ? JSON.stringify(body) : undefined,
          responseType: "json",
          onload(res) {
            if (res.status >= 200 && res.status < 300) {
              resolve(res.response);
            } else {
              reject(new Error(`HTTP ${res.status}: ${(res.response && res.response.error) || res.statusText}`));
            }
          },
          onerror(err) {
            reject(new Error(`Network error: ${err}`));
          },
        };
        try { GM_xmlhttpRequest(options); } catch (e) { reject(e); }
      });
    },

    /** Poll for next pending task (acquires atomically) */
    async poll() {
      try {
        const resp = await this._request("GET", "/api/v1/browser/tasks/poll");
        return resp;
      } catch (err) {
        if (err.message.includes("204") || err.message.includes("No Content")) return null;
        throw err;
      }
    },

    /** Upload image as multipart/form-data */
    async uploadImage(taskId, imageDataBlob) {
      return new Promise((resolve, reject) => {
        const url = `${SERVER_BASE}/api/v1/browser/tasks/${taskId}/image`;
        const fd = new FormData();
        fd.append("image", imageDataBlob, `${taskId}.png`);
        GM_xmlhttpRequest({
          method: "POST",
          url,
          data: fd,
          responseType: "json",
          onload(res) {
            if (res.status >= 200 && res.status < 300) resolve(res.response);
            else reject(new Error(`Upload HTTP ${res.status}: ${(res.response && res.response.error) || ""}`));
          },
          onerror(err) { reject(new Error(`Upload network error: ${err}`)); },
        });
      });
    },

    /** Report task failure */
    async reportFail(taskId, errorMsg) {
      return this._request("POST", `/api/v1/browser/tasks/${taskId}/fail`, { error: errorMsg });
    },
  };

  // ========================
  // DOM Interaction Helpers
  // (adapted from demo.js with improvements)
  // ========================

  function findPromptEditor() {
    const selectors = [
      'div[contenteditable="true"]',
      "textarea",
      "rich-textarea textarea",
      'div.ql-editor[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setEditorValue(editor, text) {
    if (!editor) return false;

    editor.focus();

    if (editor.tagName === "TEXTAREA") {
      editor.value = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // contenteditable div
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch {
      editor.innerText = text;
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
  }

  async function clickSendButton() {
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="\u53d1\u9001"]',     // 发送
      'button[aria-label*="\u63d0\u4ea4"]',     // 提交
      'button[type="submit"]',
    ];

    for (let i = 0; i < 60; i++) {
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          log("Send button clicked");
          return true;
        }
      }
      await sleep(250);
    }
    logError("Could not find/click send button after 15s");
    return false;
  }

  async function waitForEditor(timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ed = findPromptEditor();
      if (ed) return ed;
      await sleep(250);
    }
    return null;
  }

  // ========================
  // Image Detection & Download via Native Button
  // ========================

  /**
   * Finds the Gemini-native download button in the page.
   * The button structure (Angular Material + mdc):
   *   button > .mdc-button__label > .button-icon-wrapper > mat-icon[fonticon="download"]
   *
   * @returns {HTMLElement|null} the download button element, or null
   */
  function findDownloadButton() {
    // Primary selector: mat-icon with fonticon="download"
    const downloadIcons = document.querySelectorAll('mat-icon[data-mat-icon-name="download"], mat-icon[fonticon="download"]');
    for (const icon of downloadIcons) {
      // Walk up to find the clickable ancestor (button / [role=button])
      let el = icon.parentElement;
      while (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === "button" || el.getAttribute("role") === "button") return el;
        if (el.tagName === "BODY") break;
        el = el.parentElement;
      }
    }

    // Fallback: aria-label contains "Download" or "下载"
    const ariaSelectors = [
      'button[aria-label*="Download" i]',
      'button[aria-label*="\u4e0b\u8f7d" i]',     // 下载
      '[role="button"][aria-label*="Download" i]',
      '[role="button"][aria-label*="\u4e0b\u8f7d" i]',
      'button .mat-icon-download',
    ];
    for (const sel of ariaSelectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }

    return null;
  }

  /**
   * Checks whether a download button exists on the page.
   * Used as the signal that image generation has completed.
   */
  function hasDownloadButton() {
    return findDownloadButton() !== null;
  }

  /**
   * Locates the image element that belongs to the same response container as the download button.
   * Walks up from the download button to find the nearest large image.
   *
   * @param {HTMLElement} downloadBtn - the download button element
   * @returns {HTMLImageElement|null} the target image element, or null
   */
  function findImageNearDownload(downloadBtn) {
    if (!downloadBtn) return null;

    // Strategy 1: Find the closest common container (usually a response/message block)
    // and look for images within it
    let container = downloadBtn.parentElement;
    for (let depth = 0; depth < 15 && container; depth++) {
      const tag = container.tagName;
      if (tag === "BODY") break;

      // Look for images inside this container
      const imgs = container.querySelectorAll("img");
      let bestImg = null;
      let bestSize = 0;

      for (const img of imgs) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;

        // Skip tiny decorative images
        if (w < 128 || h < 128) continue;
        if (w === h && w <= 80) continue; // small square icon

        // Skip avatar-like images
        const cls = (img.className || "").toLowerCase();
        if (cls.includes("avatar") || cls.includes("user-photo")) continue;

        const size = w * h;
        if (size > bestSize) {
          bestSize = size;
          bestImg = img;
        }
      }

      if (bestImg) return bestImg;
      container = container.parentElement;
    }

    // Strategy 2: Sibling-based search — look at nearby elements
    const parent = downloadBtn.closest(".response-container, .message-content, [class*=response], [class*=message], .model-response");
    if (parent) {
      const imgs = parent.querySelectorAll("img");
      for (const img of imgs) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w >= 200 && h >= 200) return img;
      }
    }

    // Strategy 3: Last resort — scan entire page for the largest image not previously seen
    log("Falling back to global image scan...");
    const allImgs = document.querySelectorAll("img");
    let bestGlobalImg = null;
    let bestGlobalSize = 0;
    for (const img of allImgs) {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w < 200 || h < 200) continue;
      const cls = (img.className || "").toLowerCase();
      if (cls.includes("avatar") || cls.includes("logo") || cls.includes("icon")) continue;
      if (w * h > bestGlobalSize) {
        bestGlobalSize = w * h;
        bestGlobalImg = img;
      }
    }
    return bestGlobalImg;
  }

  /**
   * Converts an HTMLImageElement to a Blob by fetching its source.
   * Handles blob:, data:, and regular HTTP(S) URLs.
   *
   * @param {HTMLImageElement} imgEl - the image element
   * @returns {Promise<Blob|null>} image blob or null on failure
   */
  async function imageElementToBlob(imgEl) {
    const src = imgEl.src;
    if (!src) return null;

    log(`Converting image to blob (${imgEl.naturalWidth}x${imgEl.naturalHeight}), src type: ${src.substring(0, 30)}...`);

    try {
      if (src.startsWith("data:image/")) {
        const resp = await fetch(src);
        return await resp.blob();
      }

      // For blob: URLs (common in SPA apps like Gemini after rendering)
      if (src.startsWith("blob:")) {
        const resp = await fetch(src);
        if (!resp.ok) return null;
        return await resp.blob();
      }

      // Regular HTTP(S) URL
      const resp = await fetch(src, { credentials: "include", cache: "no-store" });
      if (!resp.ok) return null;
      const contentType = resp.headers.get("content-type") || "";

      // Verify it looks like an image
      if (!contentType.startsWith("image/") && contentType !== "") {
        logWarning(`Response content-type is "${contentType}", may not be an image`);
      }
      return await resp.blob();
    } catch (e) {
      logError(`Failed to convert image to blob: ${e.message}`);

      // Last-ditch effort: canvas extraction
      try {
        return await canvasExtract(imgEl);
      } catch (_) {}
      return null;
    }
  }

  /**
   * Canvas-based fallback extraction for cross-origin restricted images.
   */
  function canvasExtract(imgEl) {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth || imgEl.width || 512;
      canvas.height = imgEl.naturalHeight || imgEl.height || 512;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  /**
   * Main image acquisition flow using Gemini's native download button as trigger:
   *
   * 1. Poll until download button appears → image ready
   * 2. Locate image element adjacent to download button
   * 3. Convert image element to Blob
   * 4. Return Blob for upload
   *
   * @returns {Promise<Blob|null>} the image blob, or null if failed/timed out
   */
  async function waitForAndDownloadImage() {
    const startTime = Date.now();

    // Phase 1: Wait for download button to appear (signals image generation done)
    log("Waiting for download button to appear (image ready indicator)...");
    let dlBtn = null;

    while (Date.now() - startTime < IMAGE_WAIT_TIMEOUT_MS) {
      dlBtn = findDownloadButton();
      if (dlBtn) break;
      await sleep(IMAGE_CHECK_INTERVAL_MS);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 15 === 0 && elapsed > 0) {
        log(`Still waiting for download button... (${elapsed}s)`);
      }
    }

    if (!dlBtn) {
      logError("Timeout: download button did not appear within the time limit.");
      return null;
    }

    log("Download button detected! Image generation appears complete.");
    await randomDelay(); // brief pause before reading the image

    // Phase 2: Locate the actual image element relative to the download button
    const imageEl = findImageNearDownload(dlBtn);
    if (!imageEl) {
      logError("Could not find image element near the download button.");
      return null;
    }

    log(`Target image found: ${imageEl.naturalWidth || "?"}x${imageEl.naturalHeight || "?"}`);

    // Phase 3: Convert to Blob
    const blob = await imageElementToBlob(imageEl);
    if (!blob || blob.size < 5000) {
      logError(`Image conversion failed or result too small (${blob ? blob.size : 0} bytes).`);
      return null;
    }

    log(`Image captured! Size: ${(blob.size / 1024).toFixed(1)} KB`);
    return blob;
  }

  function logWarning(msg) {
    console.warn(`[Agent] WARN | ${msg}`);
    addToLogPanel(`⚠ ${msg}`);
  }

  // ========================
  // Task Execution Engine
  // ========================

  /** Current execution state */
  let isProcessing = false;

  /**
   * Main task processing loop.
   * This is the core logic: poll → execute → download → upload → report.
   */
  async function processNextTask() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      log("Polling for tasks...");
      const task = await api.poll();

      if (!task) {
        log("No pending tasks.");
        return;
      }

      log(`\n========== NEW TASK ==========\n  ID: ${task.id}\n  Prompt length: ${task.prompt.length}\n  Status: ${task.status}\n===============================`);

      // --- Step 1: Wait for editor ready ---
      log("Waiting for Gemini UI to be ready...");
      const editor = await waitForEditor(60000);
      if (!editor) {
        logError("Editor not found after 60s — reporting failure.");
        await api.reportFail(task.id, "Editor not found: Gemini page not ready or structure changed");
        await randomDelay();
        return;
      }
      log("Editor found.");

      await randomDelay(); // human pause before typing

      // --- Step 2: Type prompt ---
      log(`Typing prompt (${task.prompt.length} chars)...`);
      const typeSuccess = setEditorValue(editor, task.prompt);
      if (!typeSuccess) {
        logError("Failed to set editor value — reporting failure.");
        await api.reportFail(task.id, "Failed to set prompt in editor");
        await randomDelay();
        return;
      }
      log("Prompt typed.");

      await randomDelay();

      // --- Step 3: Click send ---
      log("Clicking send...");
      const sent = await clickSendButton();
      if (!sent) {
        logError("Could not click send — reporting failure.");
        await api.reportFail(task.id, "Send button not found or disabled");
        await randomDelay();
        return;
      }

      // --- Step 4: Wait for download button (image ready) and capture image ---
      log("Waiting for image generation via download button indicator...");
      const imageBlob = await waitForAndDownloadImage();

      if (!imageBlob) {
        logError(`Timeout: download button / image not ready within ${IMAGE_WAIT_TIMEOUT_MS / 1000}s — reporting failure.`);
        await api.reportFail(task.id, `Timeout: image not generated within ${IMAGE_WAIT_TIMEOUT_MS / 1000}s`);
        await randomDelay();
        return;
      }

      // --- Step 5: Upload image to server ---
      log("Uploading image to local server...");
      try {
        const uploadResult = await api.uploadImage(task.id, imageBlob);
        log(`Image uploaded successfully! Path: ${uploadResult.file_path}`);
      } catch (uploadErr) {
        logError(`Upload failed: ${uploadErr.message}`);
        // Try reporting failure so the task isn't stuck in "running"
        try {
          await api.reportFail(task.id, `Upload failed: ${uploadErr.message}`);
        } catch (_) {}
        await randomDelay();
        return;
      }

      // --- Step 6: Cooldown before next task ---
      log("\n✓ TASK COMPLETE ✓");
      await randomDelay();

    } catch (err) {
      logError(`Unexpected error during task processing: ${err.message}`);
      console.error(err);
    } finally {
      isProcessing = false;
    }
  }

  // ========================
  // UI: Floating Control Panel
  // ========================

  function injectCSS() {
    if (document.getElementById("mo-agent-theme")) return;

    const css = `
:root{
  --mo-bg:#ffffff;--mo-fg:#111827;--mo-muted:#6b7280;--mo-border:rgba(0,0,0,.14);
  --mo-card:rgba(255,255,255,.92);--mo-overlay:rgba(0,0,0,.42);
  --mo-primary:#1a73e8;--mo-primary-fg:#ffffff;--mo-danger:#ef4444;
  --mo-shadow:0 16px 48px rgba(0,0,0,.22);--mo-success:#22c55e;
}
@media(prefers-color-scheme:dark){
  :root{--mo-bg:#0b1220;--mo-fg:#e5e7eb;--mo-muted:#9ca3af;
  --mo-border:rgba(255,255,255,.14);--mo-card:rgba(17,24,39,.88);
  --mo-overlay:rgba(0,0,0,.60);--mo-primary:#60a5fa;--mo-danger:#f87171;
  --mo-shadow:0 20px 64px rgba(0,0,0,.52);--mo-success:#4ade80;}
}
#mo-agent-btn{
  position:fixed;right:16px;top:50%;transform:translateY(-50%);
  z-index:999999;padding:8px 14px;border-radius:999px;
  border:1px solid var(--mo-border);background:var(--mo-card);color:var(--mo-fg);
  cursor:pointer;font-size:12px;font-weight:600;backdrop-filter:blur(10px);
  box-shadow:var(--mo-shadow);display:flex;align-items:center;gap:6px;
  transition:transform .2s;
}
#mo-agent-btn:hover{transform:translateY(-50%) scale(1.05);}
#mo-agent-dot{width:8px;height:8px;border-radius:50%;background:var(--mo-muted);
  transition:background .3s;
}
#mo-agent-dot.running{background:var(--mo-primary);animation:mo-pulse 1.5s infinite;}
@keyframes mo-pulse{0%,100%{opacity:1}50%{opacity:.4}}
#mo-agent-panel{
  position:fixed;right:16px;top:80px;z-index:999999;
  width:340px;max-height:70vh;overflow:auto;
  background:var(--mo-card);color:var(--mo-fg);border:1px solid var(--mo-border);
  border-radius:14px;box-shadow:var(--mo-shadow);padding:16px;
  backdrop-filter:blur(12px);display:none;
}
#mo-agent-panel.visible{display:block;}
.mo-panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.mo-panel-title{font-size:14px;font-weight:700;}
.mo-panel-close{cursor:pointer;background:none;border:none;color:var(--mo-muted);font-size:18px;padding:2px 6px;}
.mo-panel-row{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
.mo-label{font-size:11px;color:var(--mo-muted);text-transform:uppercase;letter-spacing:.05em;}
.mo-input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--mo-border);
  background:var(--mo-bg);color:var(--mo-fg);font-size:13px;box-sizing:border-box;outline:none;}
.mo-input:focus{border-color:var(--mo-primary);}
.mo-status-box{padding:10px;border-radius:8px;background:rgba(0,0,0,.04);
  font-family:monospace;font-size:11px;white-space:pre-wrap;max-height:180px;
  overflow:auto;margin-top:8px;line-height:1.55;border:1px solid var(--mo-border);}
.mo-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.mo-stat-chip{padding:4px 10px;border-radius:99px;font-size:11px;font-weight:600;
  background:rgba(0,0,0,.06);border:1px solid var(--mo-border);}
.mo-stat-chip.pending{background:#fef3c7;color:#92400e;border-color:#fcd34d;}
.mo-stat-chip.running{background:#dbeafe;color:#1e40af;border-color:#bfdbfe;}
.mo-stat-chip.done{background:#dcfce7;color:#166534;border-color:#bbf7d0;}
.mo-stat-chip.fail{background:#fee2e2;color:#991b1b;border-color:#fecaca;}
.mo-btn-row{display:flex;gap:8px;margin-top:10px;}
.mo-btn{
  flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--mo-border);
  background:var(--mo-bg);color:var(--mo-fg);cursor:pointer;font-size:12px;font-weight:500;
}
.mo-btn:hover{filter:brightness(.95);}
.mo-btn-primary{border-color:var(--mo-primary);background:var(--mo-primary);color:var(--mo-primary-fg);}
`;
    const style = document.createElement("style");
    style.id = "mo-agent-theme";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createControlPanel() {
    injectCSS();

    // Floating toggle button
    const btn = document.createElement("div");
    btn.id = "mo-agent-btn";
    btn.innerHTML = '<span id="mo-agent-dot"></span><span>Muse Agent</span>';

    // Panel
    const panel = document.createElement("div");
    panel.id = "mo-agent-panel";

    panel.innerHTML = `
<div class="mo-panel-header">
  <span class="mo-panel-title">Muse Oracle Browser Agent</span>
  <button class="mo-panel-close">&times;</button>
</div>

<div class="mo-panel-row">
  <label class="mo-label">Server URL</label>
  <input id="mo-server-url" class="mo-input" value="${SERVER_BASE}" placeholder="http://localhost:8080">
</div>

<div class="mo-panel-row">
  <label class="mo-label">Task Statistics</label>
  <div id="mo-stats" class="mo-stats">Loading...</div>
</div>

<div class="mo-panel-row">
  <label class="mo-label">Activity Log</label>
  <div id="mo-log" class="mo-status-box">Agent initialized.\nWaiting for tasks...</div>
</div>

<div class="mo-btn-row">
  <button id="mo-btn-save" class="mo-btn">Save Config</button>
  <button id="mo-btn-poll" class="mo-btn mo-btn-primary">Poll Now</button>
</div>
`;

    // Event wiring
    btn.addEventListener("click", () => {
      panel.classList.toggle("visible");
      refreshStats();
    });

    panel.querySelector(".mo-panel-close").addEventListener("click", () => {
      panel.classList.remove("visible");
    });

    panel.querySelector("#mo-btn-save").addEventListener("click", () => {
      const urlInput = panel.querySelector("#mo-server-url");
      localStorage.setItem("MO_AGENT_SERVER_URL", urlInput.value.trim());
      alert("Config saved! Reload page for changes to take effect.");
    });

    panel.querySelector("#mo-btn-poll").addEventListener("click", () => {
      processNextTask().then(() => refreshStats());
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    return { panel, dotEl: document.getElementById("mo-agent-dot") };
  }

  // Expose log to panel
  const originalLog = log;
  const logBuffer = [];
  const MAX_LOG_LINES = 50;

  function addToLogPanel(msg) {
    const ts = new Date().toLocaleTimeString();
    logBuffer.push(`[${ts}] ${msg}`);
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();

    const logEl = document.getElementById("mo-log");
    if (logEl) logEl.textContent = logBuffer.join("\n");
  }

  log = function (msg) {
    originalLog(msg);
    addToLogPanel(msg);
  };
  logError = function (msg) {
    console.error(`[Agent] ERROR | ${msg}`);
    addToLogPanel(`❌ ERROR: ${msg}`);
    updateDot(false);
  };

  async function refreshStats() {
    try {
      const statsEl = document.getElementById("mo-stats");
      if (!statsEl) return;

      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${SERVER_BASE}/api/v1/browser/stats`,
          responseType: "json",
          onload(res) { resolve(res.response); },
          onerror(err) { reject(err); },
        });
      });

      statsEl.innerHTML =
        `<span class="mo-stat-chip pending">Pending: ${resp["pending"] || 0}</span>` +
        `<span class="mo-stat-chip running">Running: ${resp["running"] || 0}</span>` +
        `<span class="mo-stat-chip done">Done: ${resp["completed"] || 0}</span>` +
        `<span class="mo-stat-chip fail">Failed: ${resp["failed"] || 0}</span>`;
    } catch (e) {
      const statsEl = document.getElementById("mo-stats");
      if (statsEl) statsEl.innerHTML = `<span style="color:var(--mo-danger)">Server unreachable</span>`;
    }
  }

  function updateDot(isRunning) {
    const dot = document.getElementById("mo-agent-dot");
    if (!dot) return;
    if (isRunning) dot.classList.add("running");
    else dot.classList.remove("running");
  }

  // ========================
  // Initialization & Main Loop
  // ========================

  async function main() {
    // Inject control panel
    createControlPanel();

    // Initial stats
    await refreshStats();

    log("Browser agent started.");
    log(`Server: ${SERVER_BASE}`);
    log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

    // Start polling loop
    setInterval(async () => {
      updateDot(true);
      try {
        await processNextTask();
      } catch (loopErr) {
        logError(`Loop error: ${loopErr.message}`);
      } finally {
        updateDot(false);
        await refreshStats();
      }
    }, POLL_INTERVAL_MS);
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

})();
