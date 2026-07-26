/* ULC Toolkit — My Files library + mobile tools drawer */
(function (global) {
  "use strict";

  const LS_FILES = "ulc_my_files_v1";
  const MAX_FILES = 40;
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
  function saveJSON(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
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
  function setStore(all) {
    saveJSON(LS_FILES, all);
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
      html: entry.html || "",
      orientation: entry.orientation || "p",
      meta: entry.meta || {},
      payload: entry.payload || null,
    };
    /* Keep HTML under ~1.2MB per file to protect localStorage */
    if (row.html && row.html.length > 1200000) {
      row.html = row.html.slice(0, 1200000);
      row.meta = { ...(row.meta || {}), truncated: true };
    }
    list.unshift(row);
    all[key] = list.slice(0, MAX_FILES);
    setStore(all);
    notifyCloud();
    if (document.getElementById("v-files")?.classList.contains("active")) renderFilesView();
    return row;
  }

  function removeFile(id) {
    const u = currentUser();
    const key = accountKey(u);
    if (!key) return;
    const all = getStore();
    all[key] = (all[key] || []).filter((f) => f.id !== id);
    setStore(all);
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
  function saveCoverAuto(v, tpl, html) {
    if (!currentUser()) return null;
    const title = (v.topic || "Cover") + (v.subject ? " · " + v.subject : "");
    return addFile({
      type: "cover",
      title,
      html: html || "",
      orientation: "p",
      meta: { tpl: tpl || "classic" },
      payload: { ...(v || {}), tpl: tpl || "classic" },
    });
  }

  function saveLetterAuto(values, tplKey, html) {
    if (!currentUser()) return null;
    return addFile({
      type: "letter",
      title: values?.subject || "Application",
      html: html || "",
      orientation: "p",
      meta: { tpl: tplKey || "general" },
      payload: { ...(values || {}), tpl: tplKey || "general" },
    });
  }

  function saveTranscriptAuto(sem, html) {
    if (!currentUser()) return null;
    return addFile({
      type: "transcript",
      title: "Provisional transcript · Sem " + sem,
      html: html || "",
      orientation: "l",
      meta: { semester: sem },
      payload: { semester: sem },
    });
  }

  function saveAwardAuto(title, html) {
    if (!currentUser()) return null;
    return addFile({
      type: "award",
      title: title || "Award list",
      html: html || "",
      orientation: "l",
      meta: {},
    });
  }

  function saveAttendanceAuto(title, html) {
    if (!currentUser()) return null;
    return addFile({
      type: "attendance",
      title: title || "Attendance sheet",
      html: html || "",
      orientation: "p",
      meta: {},
    });
  }

  function saveCurrentCover() {
    if (!requireLogin("Saving this cover")) return;
    const v = typeof global.V === "function" ? global.V() : {};
    const tpl = global.currentTpl || "classic";
    const preview = document.getElementById("coverPreview");
    const inner = preview ? preview.innerHTML : "";
    const html = `<div class="cover tpl-${tpl}" style="width:794px">${inner}</div>`;
    const row = saveCoverAuto(v, tpl, html);
    if (row) alert("Cover saved to My Files.");
  }

  function saveCurrentLetter() {
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
    const row = saveLetterAuto(values, tpl, html);
    if (row) alert("Application saved to My Files.");
  }

  /* -------- Restore / open -------- */
  function setInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : value;
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
    previewFile(id);
  }

  function previewFile(id) {
    const f = getFile(id);
    if (!f || !f.html) {
      alert("No preview available for this file.");
      return;
    }
    const overlay = document.getElementById("filesPreviewOverlay");
    const host = document.getElementById("filesPreviewHost");
    const title = document.getElementById("filesPreviewTitle");
    if (!overlay || !host) return;
    if (title) title.textContent = f.title || TYPE_LABELS[f.type] || "Preview";
    host.innerHTML = f.html;
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

  async function downloadSavedFile(id) {
    const f = getFile(id);
    if (!f || !f.html) {
      alert("Nothing to download.");
      return;
    }
    if (typeof html2canvas === "undefined" || !global.jspdf) {
      const host = document.getElementById("printhost");
      if (host) {
        host.innerHTML = f.html;
        host.style.display = "block";
      }
      window.print();
      return;
    }
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;";
    const wrap = document.createElement("div");
    wrap.innerHTML = f.html;
    const sheet = wrap.firstElementChild || wrap;
    const landscape = f.orientation === "l";
    sheet.style.width = landscape ? "1122px" : "794px";
    sheet.style.boxShadow = "none";
    sheet.style.border = "none";
    holder.appendChild(sheet);
    document.body.appendChild(holder);
    try {
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: landscape ? 1122 : 794,
        windowWidth: landscape ? 1122 : 794,
      });
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF(landscape ? "l" : "p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, pageW, pageH);
      const safe = String(f.title || f.type || "ULC").replace(/[^\w\-]+/g, "_").slice(0, 60);
      pdf.save(safe + ".pdf");
    } catch (e) {
      console.error(e);
      window.print();
    } finally {
      holder.remove();
    }
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
        const canEdit = f.type === "cover" || f.type === "letter";
        return `<article class="file-card" data-id="${esc(f.id)}">
          <div class="file-card-top">
            <span class="file-type">${esc(TYPE_LABELS[f.type] || f.type)}</span>
            <span class="file-when">${esc(fmtWhen(f.createdAt))}</span>
          </div>
          <h4 class="file-title">${esc(f.title)}</h4>
          <div class="file-actions">
            ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" onclick="MyFiles.openFile('${f.id}')">Open / edit</button>` : ""}
            <button type="button" class="btn btn-ghost btn-sm" onclick="MyFiles.previewFile('${f.id}')">Preview</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="MyFiles.downloadSavedFile('${f.id}')">PDF</button>
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
    const items = [
      { t: "home", label: "Home" },
      { t: "cover", label: "Cover Page" },
      { t: "letter", label: "Applications" },
      { t: "files", label: "My Files" },
    ];
    if (teacher) items.push({ t: "teacher", label: "Teacher desk" });
    else items.push({ t: "award", label: "Award List" });
    items.push(
      { t: "syllabus", label: "Syllabus" },
      { t: "aggregate", label: "Admission Aggregate" },
      { t: "gpa", label: "GPA Tracker" },
      { t: "timetable", label: "Timetable" },
      { t: "account", label: "Account" }
    );
    return items;
  }

  function syncToolsDrawer() {
    const nav = document.getElementById("toolsDrawerNav");
    if (!nav) return;
    const active = document.querySelector(".view.active");
    const cur = active ? String(active.id || "").replace(/^v-/, "") : "home";
    nav.innerHTML = toolsForUser()
      .map((item) => {
        const on = item.t === cur ? " active" : "";
        return `<button type="button" class="tools-drawer-item${on}" data-t="${item.t}" onclick="MyFiles.goTool('${item.t}')">${esc(item.label)}</button>`;
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
})(typeof window !== "undefined" ? window : globalThis);
