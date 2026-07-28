/* ULC Toolkit — My Files library + mobile tools drawer */
(function (global) {
  "use strict";

  const LS_FILES = "ulc_my_files_v1";
  const MAX_FILES = 20;
  const MAX_HTML_CHARS = 120000; /* keep previews small — PDFs live in IndexedDB */
  const IDB_NAME = "ulc_my_files_pdf_v1";
  const IDB_STORE = "pdfs";
  const TYPE_LABELS = {
    cover: "Cover Page",
    letter: "Application",
    transcript: "Transcript",
    award: "Award List",
    attendance: "Attendance",
  };
  const STUDENT_TYPES = ["cover", "letter", "transcript"];
  const TEACHER_TYPES = ["cover", "letter", "award", "attendance"];

  function loadJSON(k, fb) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fb;
    } catch {
      return fb;
    }
  }

  function isQuotaError(err) {
    if (!err) return false;
    if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    return /quota|exceeded|setItem/i.test(String(err.message || err));
  }

  /** Never throw — PDF download must not die because My Files is full. */
  function saveJSON(k, v) {
    const raw = JSON.stringify(v);
    try {
      localStorage.setItem(k, raw);
      return true;
    } catch (err) {
      if (!isQuotaError(err)) {
        console.warn("[MyFiles] save failed", err);
        return false;
      }
      /* Prune aggressively, then retry */
      try {
        localStorage.removeItem(k);
        const slim = pruneStoreForQuota(typeof v === "object" && v ? v : {});
        localStorage.setItem(k, JSON.stringify(slim));
        return true;
      } catch (err2) {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
        console.warn("[MyFiles] quota exceeded — cleared library so PDF download can continue");
        return false;
      }
    }
  }

  function pruneStoreForQuota(all) {
    const out = {};
    const keys = Object.keys(all || {});
    keys.forEach((key) => {
      const list = Array.isArray(all[key]) ? all[key] : [];
      out[key] = list.slice(0, 8).map((f) => ({
        id: f.id,
        type: f.type,
        title: String(f.title || "").slice(0, 80),
        createdAt: f.createdAt,
        orientation: f.orientation || "p",
        meta: { ...(f.meta || {}), previewCleared: true },
        payload: f.payload || null,
        pdfPath: f.pdfPath || null,
        pdfDir: f.pdfDir || null,
        pdfName: f.pdfName || null,
        /* Drop heavy HTML on quota pressure — PDF blobs stay in IndexedDB */
        html: "",
      }));
    });
    return out;
  }

  function clearLibraryIfNeeded() {
    try {
      const raw = localStorage.getItem(LS_FILES);
      if (raw && raw.length > 800_000) {
        localStorage.removeItem(LS_FILES);
        console.warn("[MyFiles] cleared oversized library");
      }
    } catch (_) {
      try {
        localStorage.removeItem(LS_FILES);
      } catch (__) {}
    }
  }

  /* -------- IndexedDB PDF blobs (avoids localStorage quota) -------- */
  function idbAvailable() {
    try {
      return typeof indexedDB !== "undefined" && !!indexedDB;
    } catch (_) {
      return false;
    }
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!idbAvailable()) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IDB open failed"));
    });
  }

  function blobToIdbValue(blob) {
    const type = (blob && blob.type) || "application/pdf";
    if (blob && typeof blob.arrayBuffer === "function") {
      return blob.arrayBuffer().then((buf) => ({ buf: buf, type: type }));
    }
    return new Response(blob).arrayBuffer().then((buf) => ({ buf: buf, type: type }));
  }

  function idbValueToBlob(value) {
    if (!value) return null;
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return value.size ? value : null;
    }
    if (value && value.buf) {
      const blob = new Blob([value.buf], { type: value.type || "application/pdf" });
      return blob.size ? blob : null;
    }
    if (value instanceof ArrayBuffer) {
      const blob = new Blob([value], { type: "application/pdf" });
      return blob.size ? blob : null;
    }
    if (value instanceof Uint8Array) {
      const blob = new Blob([value], { type: "application/pdf" });
      return blob.size ? blob : null;
    }
    return null;
  }

  function storePdfBlob(id, blob) {
    if (!id || !blob) return Promise.resolve(false);
    return blobToIdbValue(blob)
      .then((record) => {
        if (!record || !record.buf || !record.buf.byteLength) return false;
        return idbOpen().then(
          (db) =>
            new Promise((resolve, reject) => {
              const tx = db.transaction(IDB_STORE, "readwrite");
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error);
              tx.objectStore(IDB_STORE).put(record, id);
            })
        );
      })
      .catch((err) => {
        console.warn("[MyFiles] PDF IDB store failed", err);
        return false;
      });
  }

  function getPdfBlob(id) {
    if (!id) return Promise.resolve(null);
    return idbOpen()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readonly");
            const req = tx.objectStore(IDB_STORE).get(id);
            req.onsuccess = () => resolve(idbValueToBlob(req.result));
            req.onerror = () => reject(req.error);
          })
      )
      .catch(() => null);
  }

  function deletePdfBlob(id) {
    if (!id) return Promise.resolve(false);
    return idbOpen()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.objectStore(IDB_STORE).delete(id);
          })
      )
      .catch(() => false);
  }

  function clipHtml(html) {
    const h = String(html || "");
    if (!h) return "";
    if (h.length <= MAX_HTML_CHARS) return h;
    return h.slice(0, MAX_HTML_CHARS);
  }

  function markFilePdfReady(fileId, patch) {
    try {
      const u = currentUser();
      const key = accountKey(u);
      if (!key || !fileId) return;
      const all = getStore();
      const list = all[key] || [];
      const idx = list.findIndex((x) => x.id === fileId);
      if (idx < 0) return;
      list[idx] = {
        ...list[idx],
        ...(patch || {}),
        meta: { ...(list[idx].meta || {}), ...(patch && patch.meta), hasPdf: true, hasPdfBlob: true },
      };
      all[key] = list;
      setStore(all);
      if (document.getElementById("v-files")?.classList.contains("active")) renderFilesView();
    } catch (_) {}
  }

  /** Call after PDF download — metadata in localStorage, PDF bytes in IndexedDB / native archive. */
  async function saveAfterPdf(type, title, html, extra, savedResult) {
    try {
      if (!currentUser()) return null;
      if (savedResult && savedResult.canceled) return null;
      const pdfPath = savedResult && savedResult.archivePath;
      const pdfDir = (savedResult && savedResult.archiveDirectory) || "DATA";
      const pdfName = (savedResult && savedResult.filename) || null;
      const hasBlob = !!(savedResult && savedResult.blob && savedResult.blob.size);
      const previewHtml = clipHtml(html);
      const row = addFile({
        type,
        title: title || TYPE_LABELS[type] || "File",
        /* Compact HTML for Preview; PDF lives outside localStorage */
        html: previewHtml,
        orientation: (extra && extra.orientation) || "p",
        meta: {
          ...(extra && extra.meta),
          pdfDownloaded: true,
          hasPdf: !!(pdfPath || hasBlob),
          /* Blob flag set only after IndexedDB write succeeds */
          hasPdfBlob: false,
          truncated: !!(html && String(html).length > MAX_HTML_CHARS),
        },
        payload: (extra && extra.payload) || null,
        pdfPath: pdfPath || null,
        pdfDir: pdfPath ? pdfDir : null,
        pdfName: pdfName,
      });
      if (row && hasBlob) {
        const ok = await storePdfBlob(row.id, savedResult.blob);
        if (ok) markFilePdfReady(row.id, { pdfName: pdfName || row.pdfName });
        else console.warn("[MyFiles] PDF blob not stored for", row.id);
      }
      return row;
    } catch (err) {
      console.warn("[MyFiles] saveAfterPdf skipped", err);
      return null;
    }
  }
  function esc(s) {
    return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  }
  function uid() {
    return "mf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function currentUser() {
    return typeof global.currentUser === "function" ? global.currentUser() : null;
  }
  function accountKey(u) {
    if (!u) return null;
    if (u.email) return String(u.email).toLowerCase();
    if (u.roll) return "roll:" + String(u.roll);
    if (u.id) return "id:" + u.id;
    return null;
  }
  function allowedTypes(u) {
    if (!u) return [];
    return u.role === "teacher" ? TEACHER_TYPES.slice() : STUDENT_TYPES.slice();
  }

  function getStore() {
    return loadJSON(LS_FILES, {});
  }

  function listFiles(filterType) {
    const u = currentUser();
    const key = accountKey(u);
    if (!key) return [];
    const allowed = allowedTypes(u);
    let items = (getStore()[key] || []).filter((f) => allowed.includes(f.type));
    if (filterType && filterType !== "all") items = items.filter((f) => f.type === filterType);
    return items.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function getFile(id) {
    const u = currentUser();
    const key = accountKey(u);
    if (!key) return null;
    return (getStore()[key] || []).find((f) => f.id === id) || null;
  }

  function notifyCloud() {
    const u = currentUser();
    if (!u) return;
    if (u.role === "teacher" && global.TeacherApp?.notifyFilesChanged) {
      global.TeacherApp.notifyFilesChanged();
    } else if (u.role !== "teacher" && global.StudentDash?.notifyFilesChanged) {
      global.StudentDash.notifyFilesChanged();
    }
  }

  function addFile(entry) {
    try {
      clearLibraryIfNeeded();
      const u = currentUser();
      const key = accountKey(u);
      if (!key) return null;
      if (!allowedTypes(u).includes(entry.type)) return null;
      const all = getStore();
      const list = all[key] || [];
      const row = {
        id: entry.id || uid(),
        type: entry.type,
        title: String(entry.title || TYPE_LABELS[entry.type] || "File").slice(0, 120),
        createdAt: entry.createdAt || new Date().toISOString(),
        html: clipHtml(entry.html || ""),
        orientation: entry.orientation || "p",
        meta: entry.meta || {},
        payload: entry.payload || null,
        pdfPath: entry.pdfPath || null,
        pdfDir: entry.pdfDir || null,
        pdfName: entry.pdfName || null,
      };
      if (entry.html && String(entry.html).length > MAX_HTML_CHARS) {
        row.meta = { ...(row.meta || {}), truncated: true };
      }
      list.unshift(row);
      /* Strip older HTML to keep localStorage small — PDFs stay in IndexedDB */
      all[key] = list.slice(0, MAX_FILES).map((f, idx) => {
        if (idx === 0) return f;
        if (f.html && f.html.length > 24000) {
          return { ...f, html: "", meta: { ...(f.meta || {}), previewDropped: true } };
        }
        return f;
      });
      const ok = setStore(all);
      if (!ok) {
        /* Last resort: metadata + payload + pdf refs (no HTML) */
        all[key] = [
          {
            ...row,
            html: "",
            meta: { ...(row.meta || {}), noPreview: true },
          },
        ].concat(
          (list.slice(1, 6) || []).map((f) => ({
            id: f.id,
            type: f.type,
            title: f.title,
            createdAt: f.createdAt,
            orientation: f.orientation,
            meta: f.meta || {},
            payload: f.payload || null,
            pdfPath: f.pdfPath || null,
            pdfDir: f.pdfDir || null,
            pdfName: f.pdfName || null,
            html: "",
          }))
        );
        setStore(all);
      }
      notifyCloud();
      if (document.getElementById("v-files")?.classList.contains("active")) renderFilesView();
      return row;
    } catch (err) {
      console.warn("[MyFiles] addFile ignored", err);
      return null;
    }
  }

  function setStore(all) {
    return saveJSON(LS_FILES, all);
  }

  function removeFile(id) {
    const u = currentUser();
    const key = accountKey(u);
    if (!key) return;
    const all = getStore();
    all[key] = (all[key] || []).filter((f) => f.id !== id);
    setStore(all);
    deletePdfBlob(id);
    notifyCloud();
    renderFilesView();
  }

  function replaceUserFiles(files) {
    const u = currentUser();
    const key = accountKey(u);
    if (!key || !Array.isArray(files)) return;
    const all = getStore();
    all[key] = files.slice(0, MAX_FILES);
    setStore(all);
  }

  function exportUserFiles() {
    const u = currentUser();
    const key = accountKey(u);
    if (!key) return [];
    return (getStore()[key] || []).slice(0, MAX_FILES);
  }

  function requireLogin(action) {
    const u = currentUser();
    if (u) return true;
    const goLogin = confirm(
      (action || "Saving to My Files") + " needs a login.\n\nOK = Account · Cancel = stay here"
    );
    if (goLogin && typeof global.go === "function") global.go("account");
    return false;
  }

  /* -------- Save helpers (called from generators) -------- */
  /** Auto-save after PDF — never throws (quota must not block downloads). */
  function safeAuto(fn) {
    try {
      return fn();
    } catch (err) {
      console.warn("[MyFiles] auto-save skipped", err);
      return null;
    }
  }

  function saveCoverAuto(v, tpl, html, savedResult) {
    const title = ((v && v.topic) || "Cover") + (v && v.subject ? " · " + v.subject : "");
    return saveAfterPdf(
      "cover",
      title,
      html,
      {
        orientation: "p",
        meta: { tpl: tpl || "classic" },
        payload: { ...(v || {}), tpl: tpl || "classic" },
      },
      savedResult
    );
  }

  function saveLetterAuto(values, tplKey, html, savedResult) {
    return saveAfterPdf(
      "letter",
      (values && values.subject) || "Application",
      html,
      {
        orientation: "p",
        meta: { tpl: tplKey || "general" },
        payload: { ...(values || {}), tpl: tplKey || "general" },
      },
      savedResult
    );
  }

  function saveTranscriptAuto(sem, html, savedResult) {
    return saveAfterPdf(
      "transcript",
      "Provisional transcript · Sem " + sem,
      html,
      {
        orientation: "l",
        meta: { semester: sem },
        payload: { semester: sem },
      },
      savedResult
    );
  }

  function saveAwardAuto(title, html, savedResult) {
    return saveAfterPdf("award", title || "Award list", html, { orientation: "l" }, savedResult);
  }

  function saveAttendanceAuto(title, html, savedResult) {
    return saveAfterPdf(
      "attendance",
      title || "Attendance sheet",
      html,
      { orientation: "p" },
      savedResult
    );
  }

  async function saveCurrentCover() {
    if (!requireLogin("Saving this cover")) return;
    const tpl = global.currentTpl || "classic";
    const raw = {
      no: (document.getElementById("f-assignmentno") || {}).value || "",
      topic: (document.getElementById("f-topic") || {}).value || "Assignment Title",
      subject: (document.getElementById("f-subject") || {}).value || "Subject",
      name: (document.getElementById("f-name") || {}).value || "—",
      roll: (document.getElementById("f-roll") || {}).value || "—",
      teacher: (document.getElementById("f-teacher") || {}).value || "—",
      session: (document.getElementById("f-session") || {}).value || "—",
      date:
        typeof global.fmtDate === "function"
          ? global.fmtDate((document.getElementById("f-date") || {}).value)
          : (document.getElementById("f-date") || {}).value || "",
      tpl,
    };
    const html =
      typeof global.TPL === "object" && global.TPL && typeof global.TPL[tpl] === "function"
        ? `<div class="cover tpl-${tpl} ulc-cover-cap" style="width:794px">${global.TPL[tpl](raw)}</div>`
        : `<div class="cover tpl-${tpl}" style="width:794px">${(document.getElementById("coverPreview") || {}).innerHTML || ""}</div>`;
    const row = await saveCoverAuto(raw, tpl, html);
    if (row) alert("Cover saved to My Files. Download from My Files rebuilds a full PDF.");
  }

  async function saveCurrentLetter() {
    if (!requireLogin("Saving this application")) return;
    if (!global.LetterApp) return;
    global.LetterApp.drawLetter();
    const preview = document.getElementById("letterPreview");
    const html = preview ? preview.innerHTML : "";
    const values =
      typeof global.LetterApp.letterValues === "function"
        ? global.LetterApp.letterValues()
        : {};
    const tpl =
      typeof global.LetterApp.currentTplKey === "function"
        ? global.LetterApp.currentTplKey()
        : "general";
    const row = await saveLetterAuto(values, tpl, html);
    if (row) alert("Application saved to My Files.");
  }

  /* -------- Restore / open -------- */
  function setInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
  }

  function canEditFile(f) {
    return !!(f && (f.type === "cover" || f.type === "letter") && (f.payload || f.html));
  }

  function canPreviewFile(f) {
    if (!f) return false;
    if (f.html) return true;
    /* Cover / letter can rebuild a preview from editor payload */
    return (f.type === "cover" || f.type === "letter") && !!f.payload;
  }

  function fileHasPdf(f) {
    if (!f) return false;
    return !!(f.pdfPath || (f.meta && (f.meta.hasPdf || f.meta.hasPdfBlob)) || f.html);
  }

  function decodePayloadText(s) {
    return String(s == null ? "" : s)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }

  /** Build capture CSS: convert cover template cqw rules to px so html2canvas stays sharp. */
  function buildCoverCaptureCss(widthPx) {
    const w = widthPx || 794;
    const unit = w / 100;
    const root = getComputedStyle(document.documentElement);
    const varNames = [
      "--navy",
      "--navy-2",
      "--gold",
      "--gold-lt",
      "--gold-deep",
      "--slate",
      "--ink",
      "--serif",
      "--sans",
      "--display",
      "--line",
    ];
    const vars = varNames
      .map((n) => {
        const v = root.getPropertyValue(n).trim();
        return v ? n + ":" + v + ";" : "";
      })
      .join("");
    let rules = "";
    try {
      for (const sheet of Array.from(document.styleSheets || [])) {
        let cssRules;
        try {
          cssRules = sheet.cssRules;
        } catch (_) {
          continue;
        }
        if (!cssRules) continue;
        for (const rule of Array.from(cssRules)) {
          const sel = rule.selectorText || "";
          if (!sel) continue;
          if (
            sel.includes(".tpl-") ||
            sel === ".cover" ||
            sel.startsWith(".cover ") ||
            sel.includes(".cover.")
          ) {
            rules += rule.cssText + "\n";
          }
        }
      }
    } catch (_) {}
    rules = rules
      .replace(/([\d.]+)cqw/g, (_, n) => (parseFloat(n) * unit).toFixed(3) + "px")
      .replace(/\.cover\b/g, ".ulc-cover-cap")
      .replace(/container-type\s*:[^;]+;/g, "");
    return (
      ".ulc-cover-cap{" +
      vars +
      "position:relative;width:" +
      w +
      "px;height:" +
      Math.round(w * 1.414) +
      "px;background:#fff;overflow:hidden;font-family:var(--serif);color:var(--navy);box-sizing:border-box;border:none;box-shadow:none;aspect-ratio:auto;}" +
      ".ulc-cover-cap *,.ulc-cover-cap *::before,.ulc-cover-cap *::after{box-sizing:border-box;}" +
      rules
    );
  }

  function coverValuesFromPayload(payload) {
    const p = payload || {};
    return {
      no: decodePayloadText(p.no || ""),
      topic: decodePayloadText(p.topic || "Assignment Title"),
      subject: decodePayloadText(p.subject || "Subject"),
      name: decodePayloadText(p.name || "—"),
      roll: decodePayloadText(p.roll || "—"),
      teacher: decodePayloadText(p.teacher || "—"),
      session: decodePayloadText(p.session || "—"),
      date: decodePayloadText(p.date || "—"),
      tpl: p.tpl || "classic",
    };
  }

  function rebuildCoverPreviewHtml(payload) {
    const v = coverValuesFromPayload(payload);
    const tpl = v.tpl || "classic";
    if (typeof global.TPL === "object" && global.TPL && typeof global.TPL[tpl] === "function") {
      return `<div class="cover tpl-${esc(tpl)} ulc-cover-cap" style="width:794px">${global.TPL[tpl](v)}</div>`;
    }
    return `<div class="cover tpl-${esc(tpl)} ulc-cover-cap" style="width:794px;padding:24px;font-family:Georgia,serif">
      <h3 style="margin:0 0 8px">${esc(v.topic || "Cover")}</h3>
      <p style="margin:0;color:#444">${esc(v.subject || "")}</p>
      <p style="margin:12px 0 0">${esc(v.name || "")} · ${esc(v.roll || "")}</p>
      <p style="margin:4px 0 0;color:#666">Submitted to ${esc(v.teacher || "—")}</p>
    </div>`;
  }

  async function waitForImages(root) {
    const imgs = Array.from((root && root.querySelectorAll && root.querySelectorAll("img")) || []);
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = img.onerror = () => resolve();
                setTimeout(resolve, 2500);
              })
      )
    );
  }

  async function regenerateCoverPdf(f, pdfName) {
    if (typeof html2canvas === "undefined" || !global.jspdf) {
      throw new Error("PDF_LIBS_MISSING");
    }
    const w = 794;
    const holder =
      global.ULC_SAVE && typeof global.ULC_SAVE.prepareCaptureHost === "function"
        ? global.ULC_SAVE.prepareCaptureHost(w)
        : (() => {
            const d = document.createElement("div");
            d.style.cssText =
              "position:fixed;left:0;top:0;width:" +
              w +
              "px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;";
            return d;
          })();
    const style = document.createElement("style");
    style.textContent = buildCoverCaptureCss(w);
    holder.appendChild(style);

    let sheet;
    if (f.payload && typeof global.TPL === "object" && global.TPL) {
      const v = coverValuesFromPayload(f.payload);
      const tpl = v.tpl || "classic";
      const fn = global.TPL[tpl] || global.TPL.classic;
      sheet = document.createElement("div");
      sheet.className = "cover tpl-" + tpl + " ulc-cover-cap";
      sheet.style.cssText =
        "width:" + w + "px;height:" + Math.round(w * 1.414) + "px;border:none;box-shadow:none;";
      sheet.innerHTML = typeof fn === "function" ? fn(v) : "";
    } else {
      const wrap = document.createElement("div");
      wrap.innerHTML = resolveFileHtml(f);
      sheet = wrap.firstElementChild || wrap;
      sheet.classList.add("ulc-cover-cap");
      sheet.style.width = w + "px";
      sheet.style.height = Math.round(w * 1.414) + "px";
      sheet.style.boxShadow = "none";
      sheet.style.border = "none";
    }
    holder.appendChild(sheet);
    document.body.appendChild(holder);
    try {
      await waitForImages(sheet);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sharpOpts =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureScale === "function"
          ? { width: w, windowWidth: w, scale: global.ULC_SAVE.captureScale(2), scrollX: 0, scrollY: 0 }
          : { width: w, windowWidth: w, scale: 2, scrollX: 0, scrollY: 0 };
      const canvas =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureElement === "function"
          ? await global.ULC_SAVE.captureElement(sheet, sharpOpts)
          : await html2canvas(
              sheet,
              global.ULC_SAVE && global.ULC_SAVE.captureOpts
                ? global.ULC_SAVE.captureOpts(sharpOpts)
                : {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: "#ffffff",
                    logging: false,
                    width: w,
                    windowWidth: w,
                    scrollX: 0,
                    scrollY: 0,
                  }
            );
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const img =
        global.ULC_SAVE && typeof global.ULC_SAVE.canvasToPdfImage === "function"
          ? global.ULC_SAVE.canvasToPdfImage(canvas, 0.86)
          : { dataUrl: canvas.toDataURL("image/jpeg", 0.86), format: "JPEG" };
      if (!img.dataUrl || img.dataUrl.length < 100) throw new Error("Blank PDF capture (CORS/taint)");
      pdf.addImage(img.dataUrl, img.format, 0, 0, pageW, pageH);
      if (global.ULC_SAVE && typeof global.ULC_SAVE.patchJsPdf === "function") {
        global.ULC_SAVE.patchJsPdf();
      }
      const saved =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, pdfName)
          : await pdf.save(pdfName);
      if (saved && saved.canceled) return saved;
      try {
        const u = currentUser();
        const key = accountKey(u);
        if (key) {
          const all = getStore();
          const list = all[key] || [];
          const idx = list.findIndex((x) => x.id === f.id);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              pdfPath: (saved && saved.archivePath) || list[idx].pdfPath || null,
              pdfDir: (saved && saved.archiveDirectory) || list[idx].pdfDir || "DATA",
              pdfName: (saved && saved.filename) || pdfName,
              meta: {
                ...(list[idx].meta || {}),
                hasPdf: true,
                hasPdfBlob: !!(saved && saved.blob),
              },
            };
            all[key] = list;
            setStore(all);
          }
        }
        if (saved && saved.blob) await storePdfBlob(f.id, saved.blob);
      } catch (_) {}
      return saved;
    } finally {
      holder.remove();
    }
  }

  function rebuildLetterPreviewHtml(payload) {
    const p = payload || {};
    if (global.LetterApp && typeof global.LetterApp.buildLetterHtml === "function") {
      return global.LetterApp.buildLetterHtml(p);
    }
    return `<div class="letter-sheet" style="width:794px;padding:28px;font-family:Georgia,serif;line-height:1.5;background:#fff">
      <p>${esc(p.to || "")}</p>
      <p><strong>Subject:</strong> ${esc(p.subject || "")}</p>
      <p>${esc(p.salutation || "")}</p>
      <div style="white-space:pre-wrap">${esc(p.body || "")}</div>
      <p style="margin-top:18px">${esc(p.closing || "")}</p>
      <p>${esc(p.name || "")}<br>${esc(p.roll || "")}</p>
    </div>`;
  }

  function openFile(id) {
    const f = getFile(id);
    if (!f) return;
    if (f.type === "cover" && f.payload) {
      const p = f.payload;
      if (p.tpl && typeof global.setTpl === "function") global.setTpl(p.tpl);
      else if (p.tpl) global.currentTpl = p.tpl;
      /* V() reads escaped values from inputs — set raw text */
      const map = {
        "f-assignmentno": p.no,
        "f-topic": p.topic,
        "f-subject": p.subject,
        "f-name": p.name,
        "f-roll": p.roll,
        "f-teacher": p.teacher,
        "f-session": p.session,
      };
      Object.keys(map).forEach((k) => {
        if (map[k] != null && map[k] !== "—") setInput(k, String(map[k]).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      });
      if (typeof global.drawCover === "function") global.drawCover();
      if (typeof global.go === "function") global.go("cover");
      return;
    }
    if (f.type === "letter" && f.payload) {
      const p = f.payload;
      if (p.tpl && global.LetterApp?.pickTemplate) global.LetterApp.pickTemplate(p.tpl);
      setInput("lt-to", p.to);
      setInput("lt-subject", p.subject);
      setInput("lt-salutation", p.salutation);
      setInput("lt-body", p.body);
      setInput("lt-closing", p.closing);
      setInput("lt-name", p.name);
      setInput("lt-roll", p.roll);
      setInput("lt-sem", p.semester);
      setInput("lt-contact", p.contact);
      if (global.LetterApp?.drawLetter) global.LetterApp.drawLetter();
      if (typeof global.go === "function") global.go("letter");
      return;
    }
    if (canPreviewFile(f)) {
      previewFile(id);
      return;
    }
    alert(
      "This item has no editor data left.\n\nGenerate the document again and tap Download PDF — it will be saved here with Edit/Preview and a local PDF copy."
    );
  }

  function previewFile(id) {
    const f = getFile(id);
    if (!f) return;
    const html = resolveFileHtml(f);
    if (!html) {
      if (fileHasPdf(f)) {
        alert("No HTML preview for this item. Use Share PDF / Download to open the stored PDF.");
      } else {
        alert("No preview available for this file.");
      }
      return;
    }
    const overlay = document.getElementById("filesPreviewOverlay");
    const host = document.getElementById("filesPreviewHost");
    const title = document.getElementById("filesPreviewTitle");
    if (!overlay || !host) return;
    if (title) title.textContent = f.title || TYPE_LABELS[f.type] || "Preview";
    if (f.type === "cover") {
      host.innerHTML = "<style>" + buildCoverCaptureCss(794) + "</style>" + html;
    } else {
      host.innerHTML = html;
    }
    host.dataset.fileId = f.id;
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closePreview() {
    const overlay = document.getElementById("filesPreviewOverlay");
    const host = document.getElementById("filesPreviewHost");
    if (overlay) {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
    }
    if (host) {
      host.innerHTML = "";
      delete host.dataset.fileId;
    }
  }

  function resolveFileHtml(f) {
    if (!f) return "";
    if (f.html) return f.html;
    if (f.type === "cover" && f.payload) return rebuildCoverPreviewHtml(f.payload);
    if (f.type === "letter" && f.payload) return rebuildLetterPreviewHtml(f.payload);
    return "";
  }

  async function deliverPdfBlob(blob, pdfName, fileId, existing) {
    if (!blob || !blob.size) throw new Error("Nothing to download");
    let saved = null;
    if (global.ULC_SAVE && typeof global.ULC_SAVE.saveBlob === "function") {
      saved = await global.ULC_SAVE.saveBlob(blob, pdfName);
    } else if (global.ULC_SAVE && typeof global.ULC_SAVE.triggerBrowserDownload === "function") {
      global.ULC_SAVE.triggerBrowserDownload(blob, pdfName);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1500);
    }
    if (saved && saved.canceled) return saved;
    if (fileId) {
      markFilePdfReady(fileId, {
        pdfName: (saved && saved.filename) || pdfName,
        pdfPath: (saved && saved.archivePath) || (existing && existing.pdfPath) || null,
        pdfDir: (saved && saved.archiveDirectory) || (existing && existing.pdfDir) || "DATA",
      });
      if (saved && saved.blob) await storePdfBlob(fileId, saved.blob);
      else await storePdfBlob(fileId, blob);
    }
    return saved;
  }

  async function regeneratePdfFromHtml(f, html, pdfName) {
    if (!html) throw new Error("No HTML to regenerate from");
    if (typeof html2canvas === "undefined" || !global.jspdf) {
      throw new Error("PDF_LIBS_MISSING");
    }
    const landscape = f.orientation === "l";
    const w = landscape ? 1122 : 794;
    const holder =
      global.ULC_SAVE && typeof global.ULC_SAVE.prepareCaptureHost === "function"
        ? global.ULC_SAVE.prepareCaptureHost(w)
        : (() => {
            const d = document.createElement("div");
            d.style.cssText =
              "position:fixed;left:0;top:0;width:" +
              w +
              "px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;";
            return d;
          })();
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const sheet = wrap.firstElementChild || wrap;
    sheet.style.width = w + "px";
    sheet.style.boxShadow = "none";
    sheet.style.border = "none";
    holder.appendChild(sheet);
    document.body.appendChild(holder);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sharpOpts =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureScale === "function"
          ? { width: w, windowWidth: w, scale: global.ULC_SAVE.captureScale(2), scrollX: 0, scrollY: 0 }
          : { width: w, windowWidth: w, scale: 2, scrollX: 0, scrollY: 0 };
      const canvas =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureElement === "function"
          ? await global.ULC_SAVE.captureElement(sheet, sharpOpts)
          : await html2canvas(
              sheet,
              global.ULC_SAVE && global.ULC_SAVE.captureOpts
                ? global.ULC_SAVE.captureOpts(sharpOpts)
                : {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: "#ffffff",
                    logging: false,
                    width: w,
                    windowWidth: w,
                    scrollX: 0,
                    scrollY: 0,
                  }
            );
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF(landscape ? "l" : "p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const img =
        global.ULC_SAVE && typeof global.ULC_SAVE.canvasToPdfImage === "function"
          ? global.ULC_SAVE.canvasToPdfImage(canvas, 0.86)
          : { dataUrl: canvas.toDataURL("image/jpeg", 0.86), format: "JPEG" };
      if (!img.dataUrl || img.dataUrl.length < 100) throw new Error("Blank PDF capture (CORS/taint)");
      pdf.addImage(img.dataUrl, img.format, 0, 0, pageW, pageH);
      if (global.ULC_SAVE && typeof global.ULC_SAVE.patchJsPdf === "function") {
        global.ULC_SAVE.patchJsPdf();
      }
      const saved =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, pdfName)
          : await pdf.save(pdfName);
      if (saved && saved.canceled) return saved;
      try {
        const u = currentUser();
        const key = accountKey(u);
        if (key) {
          const all = getStore();
          const list = all[key] || [];
          const idx = list.findIndex((x) => x.id === f.id);
          if (idx >= 0) {
            list[idx] = {
              ...list[idx],
              pdfPath: (saved && saved.archivePath) || list[idx].pdfPath || null,
              pdfDir: (saved && saved.archiveDirectory) || list[idx].pdfDir || "DATA",
              pdfName: (saved && saved.filename) || pdfName,
              meta: {
                ...(list[idx].meta || {}),
                hasPdf: true,
                hasPdfBlob: !!(saved && saved.blob),
              },
            };
            all[key] = list;
            setStore(all);
          }
        }
        if (saved && saved.blob) await storePdfBlob(f.id, saved.blob);
      } catch (_) {}
      return saved;
    } finally {
      holder.remove();
    }
  }

  function downloadHtmlFallback(f, html) {
    const name =
      String(f.title || f.type || "ULC").replace(/[^\w\-]+/g, "_").slice(0, 60) + ".html";
    const blob = new Blob(
      [
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
          esc(f.title || "ULC") +
          "</title></head><body>" +
          html +
          "</body></html>",
      ],
      { type: "text/html;charset=utf-8" }
    );
    if (global.ULC_SAVE && typeof global.ULC_SAVE.triggerBrowserDownload === "function") {
      global.ULC_SAVE.triggerBrowserDownload(blob, name);
    } else if (global.ULC_SAVE && typeof global.ULC_SAVE.saveBlob === "function") {
      return global.ULC_SAVE.saveBlob(blob, name);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  }

  async function downloadSavedFile(id) {
    const f = getFile(id);
    if (!f) {
      alert("File not found.");
      return;
    }

    const pdfName =
      f.pdfName ||
      String(f.title || f.type || "ULC").replace(/[^\w\-]+/g, "_").slice(0, 60) + ".pdf";

    /* 1) Preferred: re-share archived PDF from app storage (APK) */
    if (f.pdfPath && global.ULC_SAVE && typeof global.ULC_SAVE.shareArchivedPdf === "function") {
      try {
        await global.ULC_SAVE.shareArchivedPdf(f.pdfPath, pdfName, f.pdfDir || "DATA");
        return;
      } catch (err) {
        if (/cancel/i.test(String((err && err.message) || err || ""))) return;
        console.warn("[MyFiles] archive share failed", err);
      }
    }

    /* 2) Covers: rebuild from template payload (fixes blank PDFs from cqw/CSS capture) */
    if (f.type === "cover" && f.payload) {
      try {
        await regenerateCoverPdf(f, pdfName);
        return;
      } catch (e) {
        if (/cancel/i.test(String((e && e.message) || e || ""))) return;
        console.warn("[MyFiles] cover rebuild failed", e);
      }
    }

    /* 3) IndexedDB local PDF copy (web + native) */
    try {
      const blob = await getPdfBlob(f.id);
      if (blob && blob.size) {
        await deliverPdfBlob(blob, pdfName, f.id, f);
        return;
      }
    } catch (err) {
      if (/cancel/i.test(String((err && err.message) || err || ""))) return;
      console.warn("[MyFiles] IDB PDF read/share failed", err);
    }

    /* 4) Regenerate from stored / rebuilt HTML (older items + letter with payload) */
    const html = resolveFileHtml(f);
    if (html) {
      try {
        if (f.type === "cover") {
          await regenerateCoverPdf(f, pdfName);
          return;
        }
        await regeneratePdfFromHtml(f, html, pdfName);
        return;
      } catch (e) {
        if (/cancel/i.test(String((e && e.message) || e || ""))) return;
        if (e && e.message === "PDF_LIBS_MISSING") {
          if (global.ULC_SAVE && global.ULC_SAVE.isNative && global.ULC_SAVE.isNative()) {
            alert("PDF libraries failed to load. Check your connection and reopen the app.");
            return;
          }
          downloadHtmlFallback(f, html);
          return;
        }
        console.error(e);
        try {
          downloadHtmlFallback(f, html);
          return;
        } catch (_) {}
        const diag =
          global.ULC_SAVE && global.ULC_SAVE.diagnose ? "\n\n" + global.ULC_SAVE.diagnose() : "";
        alert("Could not rebuild this PDF." + diag);
        return;
      }
    }

    /* 5) Cover / letter with payload only — reopen editor so user can Download PDF again */
    if ((f.type === "cover" || f.type === "letter") && f.payload) {
      openFile(id);
      alert(
        "No local PDF copy was found for this item.\n\nIt was opened in the editor — tap Download PDF to generate one. It will stay available in My Files."
      );
      return;
    }

    alert(
      "No PDF copy is stored for this item yet.\n\nOpen the tool, generate the document again, and tap Download PDF once — a local copy will appear here."
    );
  }

  function fmtWhen(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso || "";
    }
  }

  function renderFilesView() {
    const gate = document.getElementById("filesGate");
    const app = document.getElementById("filesApp");
    const listEl = document.getElementById("filesList");
    const empty = document.getElementById("filesEmpty");
    const filter = document.getElementById("filesFilter");
    const u = currentUser();
    if (!gate || !app || !listEl) return;
    if (!u) {
      gate.style.display = "block";
      app.style.display = "none";
      return;
    }
    gate.style.display = "none";
    app.style.display = "block";
    const allowed = allowedTypes(u);
    if (filter) {
      const cur = filter.value || "all";
      filter.innerHTML =
        '<option value="all">All files</option>' +
        allowed.map((t) => `<option value="${t}">${TYPE_LABELS[t]}</option>`).join("");
      filter.value = allowed.includes(cur) || cur === "all" ? cur : "all";
    }
    const items = listFiles(filter ? filter.value : "all");
    if (empty) empty.style.display = items.length ? "none" : "block";
    listEl.innerHTML = items
      .map((f) => {
        const showEdit = canEditFile(f);
        const showPreview = canPreviewFile(f);
        const hasPdf = fileHasPdf(f);
        const ready = !!(f.pdfPath || (f.meta && f.meta.hasPdfBlob));
        return `<article class="file-card" data-id="${esc(f.id)}">
          <div class="file-card-top">
            <span class="file-type">${esc(TYPE_LABELS[f.type] || f.type)}${ready ? " · PDF ready" : ""}</span>
            <span class="file-when">${esc(fmtWhen(f.createdAt))}</span>
          </div>
          <h4 class="file-title">${esc(f.title)}</h4>
          <div class="file-actions">
            ${showEdit ? `<button type="button" class="btn btn-ghost btn-sm" onclick="MyFiles.openFile('${f.id}')">Edit</button>` : ""}
            ${showPreview ? `<button type="button" class="btn btn-ghost btn-sm" onclick="MyFiles.previewFile('${f.id}')">Preview</button>` : ""}
            <button type="button" class="btn btn-primary btn-sm" onclick="MyFiles.downloadSavedFile('${f.id}')">${hasPdf ? "Download PDF" : "PDF"}</button>
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="MyFiles.confirmRemove('${f.id}')">Delete</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function confirmRemove(id) {
    if (!confirm("Delete this file from My Files?")) return;
    removeFile(id);
  }

  function initFilesView() {
    renderFilesView();
  }

  /* -------- Mobile tools drawer -------- */
  function toolsForUser() {
    const u = currentUser();
    const teacher = u && u.role === "teacher";
    const ico = {
      home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
      cover: '<svg viewBox="0 0 24 24"><path d="M6 2h9l3 3v17H6z"/><path d="M15 2v4h4"/></svg>',
      letter: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
      files: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
      teacher: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      award: '<svg viewBox="0 0 24 24"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v8a5 5 0 0 1-10 0V4z"/><path d="M5 8H3a2 2 0 0 0 2 2"/><path d="M19 8h2a2 2 0 0 1-2 2"/></svg>',
      syllabus: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/><path d="M8 7h8M8 11h6"/></svg>',
      aggregate: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>',
      gpa: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg>',
      timetable: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
      account: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4-5 8-5s6.5 1.5 8 5"/></svg>',
      developer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4-5 8-5s6.5 1.5 8 5"/></svg>',
    };
    const items = [
      { t: "home", label: "Dashboard" },
      { t: "cover", label: "Cover Page" },
      { t: "letter", label: "Applications" },
      { t: "files", label: "My Files" },
    ];
    if (teacher) items.push({ t: "teacher", label: "Teacher desk" });
    else items.push({ t: "award", label: "Award List" });
    items.push(
      { t: "syllabus", label: "LLB & LLM Syllabus" },
      { t: "aggregate", label: "Admission Aggregate" },
      { t: "gpa", label: "GPA Tracker" },
      { t: "timetable", label: "Timetable" },
      { t: "account", label: "Account" },
      { t: "developer", label: "About the developer" }
    );
    return items.map((item) => ({ ...item, icon: ico[item.t] || ico.home }));
  }

  function syncToolsDrawer() {
    const nav = document.getElementById("toolsDrawerNav");
    if (!nav) return;
    const active = document.querySelector(".view.active");
    const cur = active ? String(active.id || "").replace(/^v-/, "") : "home";
    nav.innerHTML = toolsForUser()
      .map((item) => {
        const on = item.t === cur ? " active" : "";
        return `<button type="button" class="tools-drawer-item${on}" data-t="${item.t}" onclick="MyFiles.goTool('${item.t}')"><span class="tools-drawer-ico" aria-hidden="true">${item.icon}</span><span>${esc(item.label)}</span></button>`;
      })
      .join("");
  }

  function openToolsMenu() {
    syncToolsDrawer();
    document.body.classList.add("tools-drawer-open");
    const d = document.getElementById("toolsDrawer");
    const bg = document.getElementById("toolsDrawerBg");
    if (d) d.setAttribute("aria-hidden", "false");
    if (bg) bg.setAttribute("aria-hidden", "false");
  }

  function closeToolsMenu() {
    document.body.classList.remove("tools-drawer-open");
    const d = document.getElementById("toolsDrawer");
    const bg = document.getElementById("toolsDrawerBg");
    if (d) d.setAttribute("aria-hidden", "true");
    if (bg) bg.setAttribute("aria-hidden", "true");
  }

  function goTool(t) {
    closeToolsMenu();
    if (typeof global.go === "function") global.go(t);
  }

  function syncFilesNav() {
    const u = currentUser();
    document.querySelectorAll("[data-files-only]").forEach((el) => {
      el.style.display = u ? "" : "none";
    });
    const tabFiles = document.getElementById("tabFiles");
    if (tabFiles) tabFiles.style.display = u ? "" : "none";
    syncToolsDrawer();
  }

  global.MyFiles = {
    listFiles,
    getFile,
    addFile,
    removeFile,
    replaceUserFiles,
    exportUserFiles,
    saveCoverAuto,
    saveLetterAuto,
    saveTranscriptAuto,
    saveAwardAuto,
    saveAttendanceAuto,
    saveCurrentCover,
    saveCurrentLetter,
    openFile,
    previewFile,
    closePreview,
    downloadSavedFile,
    confirmRemove,
    renderFilesView,
    initFilesView,
    openToolsMenu,
    closeToolsMenu,
    goTool,
    syncToolsDrawer,
    syncFilesNav,
    TYPE_LABELS,
  };

  /* Free space once on load so the next Download PDF is not blocked */
  try {
    clearLibraryIfNeeded();
  } catch (_) {}
})(typeof window !== "undefined" ? window : globalThis);
