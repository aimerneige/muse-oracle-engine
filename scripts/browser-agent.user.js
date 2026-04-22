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
        const ts = Date.now();
        log(`[HTTP] ${method} ${url}${body ? ` body=${JSON.stringify(body).substring(0, 100)}` : ""}`);
        const options = {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          data: body ? JSON.stringify(body) : undefined,
          responseType: "json",
          timeout: 30000,
          onload(res) {
            const elapsed = Date.now() - ts;
            log(`[HTTP] ${method} ${path} → status=${res.status} (${elapsed}ms)`);
            // Log raw response text for debugging
            if (res.status === 204) {
              log(`[HTTP]   → 204 No Content (no tasks)`);
              resolve(null);
              return;
            }
            if (res.status >= 200 && res.status < 300) {
              let data = res.response;
              if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) {}
              }
              log(`[HTTP]   → OK: ${typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data}`);
              resolve(data);
            } else {
              const errMsg = `HTTP ${res.status}: ${(res.response && res.response.error) || res.statusText}`;
              logError(`[HTTP]   → ERROR: ${errMsg}`);
              reject(new Error(errMsg));
            }
          },
          onerror(err) {
            const elapsed = Date.now() - ts;
            logError(`[HTTP] ${method} ${path} → NETWORK ERROR after ${elapsed}ms: ${err?.message || err}`);
            reject(new Error(`Network error: ${err}`));
          },
          ontimeout() {
            logError(`[HTTP] ${method} ${path} → TIMEOUT`);
            reject(new Error("Request timeout"));
          },
        };
        try {
          GM_xmlhttpRequest(options);
        } catch (e) {
          logError(`[HTTP] GM_xmlhttpRequest threw: ${e.message}`);
          reject(e);
        }
      });
    },

    /** Poll for next pending task (acquires atomically) */
    async poll() {
      try {
        log("[Poll] Checking for tasks...");
        const resp = await this._request("GET", "/api/v1/browser/tasks/poll");
        if (!resp) {
          log("[Poll] Server returned no tasks (null/empty)");
          return null;
        }
        log(`[Poll] Got task! id=${resp.id}, status=${resp.status}`);
        return resp;
      } catch (err) {
        if (err.message.includes("204") || err.message.includes("No Content")) {
          log("[Poll] No tasks available (204/No Content)");
          return null;
        }
        logError(`[Poll] Error polling: ${err.message}`);
        throw err;
      }
    },

    /** Upload image as multipart/form-data */
    async uploadImage(taskId, imageDataBlob) {
      return new Promise((resolve, reject) => {
        const url = `${SERVER_BASE}/api/v1/browser/tasks/${taskId}/image`;
        log(`[Upload] POST ${url} size=${(imageDataBlob.size / 1024).toFixed(1)}KB`);
        const fd = new FormData();
        fd.append("image", imageDataBlob, `${taskId}.png`);
        GM_xmlhttpRequest({
          method: "POST",
          url,
          data: fd,
          responseType: "json",
          timeout: 120000,
          onload(res) {
            log(`[Upload] → status=${res.status}`);
            if (res.status >= 200 && res.status < 300) {
              log(`[Upload] → OK: ${JSON.stringify(res.response).substring(0, 200)}`);
              resolve(res.response);
            } else {
              reject(new Error(`Upload HTTP ${res.status}: ${(res.response && res.response.error) || ""}`));
            }
          },
          onerror(err) {
            logError(`[Upload] → Network error: ${err}`);
            reject(new Error(`Upload network error: ${err}`));
          },
        });
      });
    },

    /** Report task failure */
    async reportFail(taskId, errorMsg) {
      log(`[Fail] Reporting failure for task=${taskId}: ${errorMsg.substring(0, 100)}`);
      return this._request("POST", `/api/v1/browser/tasks/${taskId}/fail`, { error: errorMsg });
    },
  };

  // ========================
  // DOM Interaction Helpers
  // (adapted from demo.js with improvements)
  // ========================

  function deepQuerySelector(selector, root = document) {
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift();
      const el = node.querySelector(selector);
      if (el) return el;
      const elements = node.querySelectorAll('*');
      for (const element of elements) {
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }
    return null;
  }

  function deepQuerySelectorAll(selector, root = document) {
    let results = [];
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift();
      results = results.concat(Array.from(node.querySelectorAll(selector)));
      const elements = node.querySelectorAll('*');
      for (const element of elements) {
        if (element.shadowRoot) queue.push(element.shadowRoot);
      }
    }
    return results;
  }
  function findPromptEditor() {
    // Gemini-specific selectors first (most likely)
    const selectors = [
      // Gemini's main prompt input — rich text editor
      '.ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      'rich-textarea',
      '[data-testid="prompt-input"]',
      '[data-placeholder*="Enter a prompt" i]',
      // Generic contenteditable
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'p[contenteditable="true"]',
      // Fallback textarea
      'textarea[placeholder*="Enter" i]',
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="message" i]',
      'textarea[aria-label*="Ask" i]',
      "textarea",
    ];
    const found = [];
    for (const sel of selectors) {
      const el = deepQuerySelector(sel);
      if (el) found.push({ el, sel });
    }
    if (found.length > 0) {
      const best = found[0];
      log(`[Editor] Found via "${best.sel}" tag=${best.el.tagName} class=${String(best.el.className).substring(0, 60)} id=${best.el.id}`);
      return best.el;
    }
    return null;
  }

  function setEditorValue(editor, text) {
    if (!editor) { logError("[Editor] setEditorValue called with null!"); return false; }
    log(`[Editor] Setting value (${text.length} chars), tag=${editor.tagName}, ce=${editor.contentEditable}`);

    editor.focus();
    // Small delay after focus to ensure Angular processes the event
    editor.dispatchEvent(new Event("focus", { bubbles: true, composed: true }));
    editor.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));

    // Strategy 1: For textarea elements
    if (editor.tagName === "TEXTAREA") {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(editor, text);
      } else {
        editor.value = text;
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: text, inputType: "insertText" }));
      editor.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      log(`[Editor] Textarea set OK`);
      return true;
    }

    // Strategy 2: For contenteditable divs — try multiple approaches
    // 2a: Use native setter for innerText if available
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);

      // Insert text char-by-char simulation via insertText command
      document.execCommand("insertText", false, text);

      // Fire comprehensive event chain for Angular detection
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true, composed: true, cancelable: true,
        data: text, inputType: "insertText"
      }));
      editor.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      // Also try keyboard-style events
      editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key: text[text.length - 1] || "" }));
      editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, composed: true, key: text[text.length - 1] || "" }));

      log(`[Editor] ContentEditable set via execCommand(insertText), current text length=${editor.textContent?.length || editor.innerText?.length}`);
      return true;
    } catch (e) {
      logError(`[Editor] execCommand approach failed: ${e.message}`);
    }

    // Strategy 3: Direct innerText + manual events
    try {
      editor.innerText = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, data: text, inputType: "insertText" }));
      editor.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      log(`[Editor] ContentEditable set via innerText fallback`);
      return true;
    } catch (e2) {
      logError(`[Editor] All strategies failed: ${e2.message}`);
      return false;
    }
  }

  async function clickSendButton() {
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="\u53d1\u9001"]',     // 发送
      'button[aria-label*="\u63d0\u4ea4"]',     // 提交
      'button[type="submit"]',
      // Gemini-specific send button patterns
      'button.mat-icon-button[aria-label*="send" i]',
      'button[aria-label*="Submit" i]',
      'button[aria-label*="Create" i]',
      'button[aria-label*="Generate" i]',
      '.send-button',
      '[data-testid="send-button"]'
    ];

    log("[Send] Looking for send button...");
    for (let i = 0; i < 60; i++) {
      for (const sel of selectors) {
        const btn = deepQuerySelector(sel);
        if (btn && !btn.disabled) {
          btn.click();
          log(`[Send] Clicked! selector="${sel}" tag=${btn.tagName} ariaLabel="${btn.getAttribute('aria-label') || ''}" disabled=${btn.disabled}`);
          return true;
        }
      }

      // Log what buttons we CAN see (diagnostic)
      if (i === 0) {
        const allBtns = deepQuerySelectorAll('button, [role="button"]');
        const visibleBtns = [];
        allBtns.forEach(b => {
          if (b.offsetParent !== null) visibleBtns.push(`tag=${b.tagName} role=${b.getAttribute('role')} ariaLabel="${b.getAttribute('aria-label') || ''}" class="${String(b.className).substring(0, 40)}"`);
        });
        log(`[Send] Visible buttons on page (${visibleBtns.length}): ${visibleBtns.slice(0, 8).join(" | ")}`);
      }

      await sleep(250);
    }
    logError("[Send] Could not find/click send button after 15s");
    return false;
  }

  async function waitForEditor(timeoutMs = 45000) {
    const start = Date.now();
    log(`[Editor] Waiting up to ${timeoutMs / 1000}s for editor...`);
    let attempts = 0;
    while (Date.now() - start < timeoutMs) {
      attempts++;
      const ed = findPromptEditor();
      if (ed) {
        log(`[Editor] Found after ${attempts} attempts (${Math.round((Date.now() - start) / 1000)}s)`);
        return ed;
      }
      // Log progress every 10s
      if (attempts % 40 === 0 && attempts > 0) {
        log(`[Editor] Still searching... (${Math.round((Date.now() - start) / 1000)}s elapsed, ${attempts} attempts)`);
      }
      await sleep(250);
    }
    logError(`[Editor] Not found after ${attempts} attempts / ${timeoutMs / 1000}s`);
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
    const downloadIcons = deepQuerySelectorAll('mat-icon[data-mat-icon-name="download"], mat-icon[fonticon="download"]');
    for (const icon of downloadIcons) {
      // Walk up to find the clickable ancestor (button / [role=button])
      let el = icon.parentElement || (icon.getRootNode && icon.getRootNode().host);
      while (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === "button" || el.getAttribute("role") === "button") return el;
        if (el.tagName === "BODY") break;
        el = el.parentElement || (el.getRootNode && el.getRootNode().host);
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
      const btn = deepQuerySelector(sel);
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
    let container = downloadBtn.parentElement || (downloadBtn.getRootNode && downloadBtn.getRootNode().host);
    for (let depth = 0; depth < 15 && container; depth++) {
      const tag = container.tagName;
      if (tag === "BODY") break;

      // Look for images inside this container
      const imgs = deepQuerySelectorAll("img", container);
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
      container = container.parentElement || (container.getRootNode && container.getRootNode().host);
    }

    // Strategy 2: Sibling-based search — look at nearby elements
    const parent = downloadBtn.closest ? downloadBtn.closest(".response-container, .message-content, [class*=response], [class*=message], .model-response") : null;
    if (parent) {
      const imgs = deepQuerySelectorAll("img", parent);
      for (const img of imgs) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w >= 200 && h >= 200) return img;
      }
    }

    // Strategy 3: Last resort — scan entire page for the largest image not previously seen
    log("Falling back to global image scan...");
    const allImgs = deepQuerySelectorAll("img");
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
  /** Timestamp when current processing started (ms) */
  let processStartTime = 0;
  /** Max time a single task can take before force-reset (10 min) */
  const PROCESS_TIMEOUT_MS = 600_000;

  /** Safety watchdog: if stuck in isProcessing for too long, force release */
  function checkProcessingStuck() {
    if (isProcessing && processStartTime > 0) {
      const elapsed = Date.now() - processStartTime;
      if (elapsed > PROCESS_TIMEOUT_MS) {
        logError(`[WATCHDOG] Task stuck for ${Math.round(elapsed / 1000)}s — FORCE RESETTING isProcessing!`);
        isProcessing = false;
        processStartTime = 0;
      }
    }
  }

  /**
   * Main task processing loop.
   * This is the core logic: poll → execute → download → upload → report.
   */
  async function processNextTask() {
    if (isProcessing) {
      log("[Loop] Skipping — previous task still in progress.");
      return;
    }
    isProcessing = true;
    processStartTime = Date.now();
    const taskStartStr = new Date().toLocaleTimeString();
    log(`[Task] === STARTED at ${taskStartStr} ===`);

    try {
      log("Polling for tasks...");
      let task = await api.poll();

      if (!task) {
        log("No pending tasks.");
        return;
      }
      
      if (typeof task === "string") {
        try { task = JSON.parse(task); } catch(e) {}
      }

      if (!task || !task.id || !task.prompt) {
        logError("Invalid task format received");
        return;
      }

      log(`\n========== NEW TASK ==========\n  ID: ${task.id}\n  Prompt length: ${task.prompt.length}\n  Status: ${task.status}\n  Preview: ${task.prompt.substring(0, 100)}...\n===============================`);

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
      log(`Prompt typed. Verifying editor content...`);
      const verifyText = editor.textContent || editor.innerText || editor.value || "";
      log(`[Verify] Editor now contains ${verifyText.length} chars (first 80: "${verifyText.substring(0, 80)}")`);

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
      const elapsed = Math.round((Date.now() - processStartTime) / 1000);
      log(`[Task] === FINISHED in ${elapsed}s ===`);
      isProcessing = false;
      processStartTime = 0;
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

  function $(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "textContent" || k === "innerHTML") el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else if (c) el.appendChild(c);
    }
    return el;
  }

  function createControlPanel() {
    injectCSS();

    // Floating toggle button
    const btn = $("div", { id: "mo-agent-btn" }, [
      $("span", { id: "mo-agent-dot" }),
      document.createTextNode("Muse Agent"),
    ]);

    // Panel
    const panel = $("div", { id: "mo-agent-panel" }, [
      $("div", { class: "mo-panel-header" }, [
        $("span", { class: "mo-panel-title", textContent: "Muse Oracle Browser Agent" }),
        $("button", { class: "mo-panel-close", textContent: "\u00d7" }),
      ]),
      $("div", { class: "mo-panel-row" }, [
        $("label", { class: "mo-label", textContent: "Server URL" }),
        $("input", { id: "mo-server-url", class: "mo-input", value: SERVER_BASE, placeholder: "http://localhost:8080" }),
      ]),
      $("div", { class: "mo-panel-row" }, [
        $("label", { class: "mo-label", textContent: "Task Statistics" }),
        $("div", { id: "mo-stats", class: "mo-stats", textContent: "Loading..." }),
      ]),
      $("div", { class: "mo-panel-row" }, [
        $("label", { class: "mo-label", textContent: "Activity Log" }),
        $("div", { id: "mo-log", class: "mo-status-box", textContent: "Agent initialized.\nWaiting for tasks..." }),
      ]),
      $("div", { class: "mo-btn-row" }, [
        $("button", { id: "mo-btn-save", class: "mo-btn", textContent: "Save Config" }),
        $("button", { id: "mo-btn-poll", class: "mo-btn mo-btn-primary", textContent: "Poll Now" }),
      ]),
    ]);

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

      log("[Stats] Fetching /api/v1/browser/stats...");
      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${SERVER_BASE}/api/v1/browser/stats`,
          responseType: "json",
          timeout: 10000,
          onload(res) {
            log(`[Stats] → status=${res.status} data=${JSON.stringify(res.response).substring(0, 200)}`);
            resolve(res.response);
          },
          onerror: (err) => {
            logError(`[Stats] → Error: ${err?.message || err}`);
            reject(err);
          },
        });
      });

      statsEl.textContent = "";
      const chips = [
        { cls: "pending", label: "Pending", val: resp["pending"] || 0 },
        { cls: "running", label: "Running", val: resp["running"] || 0 },
        { cls: "done", label: "Done", val: resp["completed"] || 0 },
        { cls: "fail", label: "Failed", val: resp["failed"] || 0 },
      ];
      for (const c of chips) {
        const span = document.createElement("span");
        span.className = `mo-stat-chip ${c.cls}`;
        span.textContent = `${c.label}: ${c.val}`;
        statsEl.appendChild(span);
      }
    } catch (e) {
      const statsEl = document.getElementById("mo-stats");
      if (statsEl) {
        statsEl.textContent = "Server unreachable";
        statsEl.style.color = "var(--mo-danger)";
      }
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

    // Test server connectivity
    log(`[Init] Testing connectivity to ${SERVER_BASE}...`);
    try {
      const testResp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${SERVER_BASE}/api/v1/browser/stats`,
          responseType: "json",
          timeout: 5000,
          onload(res) { resolve({ status: res.status, data: res.response }); },
          onerror(err) { reject(err); },
          ontimeout() { reject(new Error("Timeout")); },
        });
      });
      log(`[Init] Server reachable! status=${testResp.status} data=${JSON.stringify(testResp.data || {}).substring(0, 200)}`);
    } catch (e) {
      logError(`[Init] Server UNREACHABLE at ${SERVER_BASE}: ${e?.message || e}`);
      logError("[Init] Check that CLI/server is running and port is correct.");
      logError("[Init] The agent will continue polling but will not be able to fetch tasks.");
    }

    // Initial stats
    await refreshStats();

    log("Browser agent started.");
    log(`Server: ${SERVER_BASE}`);
    log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

    // Start polling loop
    log("[Loop] Starting poll timer, interval=" + POLL_INTERVAL_MS + "ms");
    let tick = 0;
    setInterval(async () => {
      tick++;
      log(`[Loop] Tick #${tick} — checking for tasks...`);
      // Safety watchdog: detect stuck processing
      if (isProcessing) {
        const stuckFor = Math.round((Date.now() - processStartTime) / 1000);
        log(`[Loop] Task in progress for ${stuckFor}s (timeout=${PROCESS_TIMEOUT_MS / 1000}s)`);
        checkProcessingStuck();
      }
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
