/* ULC Portal — Teacher workspace
   Classes, roster (OCR), attendance, marks, award-list PDF / Excel.
   Session rosters (roll + name ONLY) are shared across teachers of the same session.
   Marks, attendance, and award records stay private in each teacher's account/workspace.
*/
(function (global) {
  const LS_TEACHER = "ulc_teacher_data_v1";
  const LS_SESSION_ROSTER = "ulc_session_rosters_v1";
  const LS_SEM_ROSTER_LEGACY = "ulc_semester_rosters_v1";
  const DEFAULT_CLASSES = 30;
  const ORD = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  function semLabel(n) { return n ? ("Semester " + n) : "—"; }

  /** Standard session form: 2025-29 (not 2025-2029). */
  function normalizeSession(raw) {
    const s = String(raw || "").trim().replace(/\s+/g, "");
    if (!s) return "";
    const m = s.match(/^(\d{4})\s*[-–—/]\s*(\d{2}|\d{4})$/);
    if (!m) return "";
    const start = m[1];
    let end = m[2];
    if (end.length === 4) end = end.slice(-2);
    return start + "-" + end;
  }
  function isValidSession(raw) {
    return /^\d{4}-\d{2}$/.test(normalizeSession(raw));
  }

  let pendingOcr = [];
  let editingStudentRoll = null;
  let pendingRosterFile = null;
  let analyzeAfterPick = false;

  function loadJSON(k, fb) {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
  }
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function esc(s) {
    return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function best3Avg(qs) {
    const top = [...qs].map((n) => +n || 0).sort((a, b) => b - a).slice(0, 3);
    return top.reduce((a, b) => a + b, 0) / 3;
  }
  function gpFromRounded(m) {
    m = Math.round(+m || 0);
    if (m >= 80) return 4.0;
    if (m < 50) return 0.0;
    return Math.round((m - 40) * 10) / 100;
  }
  function letterFromRounded(m) {
    m = Math.round(+m || 0);
    if (m >= 90) return "A";
    if (m >= 80) return "A-";
    if (m >= 75) return "B+";
    if (m >= 70) return "B";
    if (m >= 65) return "B-";
    if (m >= 60) return "C+";
    if (m >= 55) return "C";
    if (m >= 50) return "D";
    return "F";
  }
  function calcStudent(m) {
    const qs = [m.q1, m.q2, m.q3, m.q4, m.q5].map((n) => +n || 0);
    const quiz = best3Avg(qs);
    const assn = ((+m.a1 || 0) + (+m.a2 || 0)) / 2;
    const midObt = Math.min(100, +m.mid || ((+m.mid_obj || 0) + (+m.mid_sub || 0)));
    const finObt = Math.min(100, +m.final || ((+m.fin_obj || 0) + (+m.fin_sub || 0)));
    const mid30 = midObt * 0.3;
    const fin40 = finObt * 0.4;
    const grand = quiz + assn + mid30 + fin40;
    const rounded = Math.round(grand);
    return {
      quiz, assn, midObt, finObt, mid30, fin40, grand, rounded,
      grade: letterFromRounded(rounded),
      gp: gpFromRounded(rounded),
    };
  }

  function teacherKey() {
    const u = global.currentUser && global.currentUser();
    return u ? u.roll : null;
  }

  let cloudSyncTimer = null;
  let cloudPullDone = false;

  function cloudUserId() {
    const u = global.currentUser && global.currentUser();
    return u && u.cloud && u.id ? u.id : null;
  }

  function scheduleTeacherCloudSync(st) {
    const uid = cloudUserId();
    if (!uid || !global.ULC_CLOUD?.saveWorkspace) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      pushTeacherWorkspace(st).catch((e) => console.warn("[teacher] cloud sync", e?.message || e));
    }, 700);
  }

  async function pushTeacherWorkspace(st) {
    const uid = cloudUserId();
    if (!uid || !global.ULC_CLOUD?.saveWorkspace) return;
    const data = st || getStore();
    if (!data) return;
    await global.ULC_CLOUD.saveWorkspace(uid, {
      official_name: data.officialName || "",
      data: {
        kind: "teacher",
        version: 1,
        officialName: data.officialName || "",
        classes: data.classes || [],
        activeClassId: data.activeClassId || null,
        profileComplete: !!data.profileComplete,
        myFiles: global.MyFiles?.exportUserFiles ? global.MyFiles.exportUserFiles() : [],
        syncedAt: Date.now(),
      },
    });
  }

  async function pullTeacherWorkspace(force) {
    const uid = cloudUserId();
    if (!uid || !global.ULC_CLOUD?.loadWorkspace) return false;
    if (cloudPullDone && !force) return false;
    try {
      const remote = await global.ULC_CLOUD.loadWorkspace(uid);
      cloudPullDone = true;
      if (!remote || !remote.data) return false;
      const d = remote.data;
      if (d.kind && d.kind !== "teacher") return false;
      const local = getStore();
      const remoteTs = +d.syncedAt || Date.parse(remote.updated_at) || 0;
      const localTs = +local?.cloudSyncedAt || 0;
      const remoteHasClasses = Array.isArray(d.classes) && d.classes.length;
      if (!remoteHasClasses) return false;
      if (localTs && remoteTs && localTs > remoteTs && (local.classes || []).length) return false;
      const merged = {
        officialName: d.officialName || remote.official_name || local.officialName || "",
        classes: d.classes || [],
        activeClassId: d.activeClassId || (d.classes && d.classes[0] && d.classes[0].id) || null,
        profileComplete: d.profileComplete != null ? !!d.profileComplete : !!(d.classes && d.classes.length),
        cloudSyncedAt: remoteTs || Date.now(),
      };
      const key = teacherKey();
      if (!key) return false;
      const all = loadJSON(LS_TEACHER, {});
      all[key] = merged;
      saveJSON(LS_TEACHER, all);
      if (Array.isArray(d.myFiles) && global.MyFiles?.replaceUserFiles) {
        global.MyFiles.replaceUserFiles(d.myFiles);
      }
      return true;
    } catch (e) {
      console.warn("[teacher] cloud pull", e?.message || e);
      return false;
    }
  }

  function getStore() {
    const all = loadJSON(LS_TEACHER, {});
    const key = teacherKey();
    if (!key) return null;
    if (!all[key]) {
      all[key] = { officialName: "", classes: [], activeClassId: null, profileComplete: false };
      saveJSON(LS_TEACHER, all);
    }
    return all[key];
  }
  function setStore(data) {
    const key = teacherKey();
    if (!key) return;
    const all = loadJSON(LS_TEACHER, {});
    data.cloudSyncedAt = Date.now();
    all[key] = data;
    saveJSON(LS_TEACHER, all);
    scheduleTeacherCloudSync(data);
  }

  function activeClass() {
    const st = getStore();
    if (!st || !st.classes.length) return null;
    let c = st.classes.find((x) => x.id === st.activeClassId);
    if (!c) {
      c = st.classes[0];
      st.activeClassId = c.id;
      setStore(st);
    }
    return c;
  }

  function emptyMarks() {
    return { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, a1: 0, a2: 0, mid_obj: 0, mid_sub: 0, mid: 0, fin_obj: 0, fin_sub: 0, final: 0, remarks: "" };
  }
  function emptyAttendance() {
    return { daily: {}, presentCount: null };
  }
  function ensureClassMeta(c) {
    if (!c) return;
    if (!c.totalClasses || c.totalClasses < 1) c.totalClasses = DEFAULT_CLASSES;
    if (c.attMode !== "weekly" && c.attMode !== "daily") c.attMode = "daily";
    if (!c.students) c.students = [];
    if (!c.attendance) c.attendance = {};
    if (!c.marks) c.marks = {};
    if (c.session) {
      const norm = normalizeSession(c.session);
      if (norm) c.session = norm;
    }
  }
  function normalizeAtt(att) {
    if (!att || typeof att !== "object") return emptyAttendance();
    if (att.daily) return { daily: att.daily || {}, presentCount: att.presentCount ?? null };
    // migrate old W1–W16 style
    const daily = {};
    Object.keys(att).forEach((k) => {
      if (/^w\d+$/i.test(k) && att[k]) daily["d" + k.slice(1)] = att[k];
    });
    return { daily, presentCount: att.presentCount ?? null };
  }
  function presentFromDaily(att, total) {
    const a = normalizeAtt(att);
    let n = 0;
    for (let i = 1; i <= total; i++) if (a.daily["d" + i] === "P") n++;
    return n;
  }
  function effectivePresent(att, total, mode) {
    const a = normalizeAtt(att);
    if (mode === "weekly" && a.presentCount != null && a.presentCount !== "") return Math.min(total, Math.max(0, +a.presentCount || 0));
    return presentFromDaily(a, total);
  }

  /* Shared session roster — roll + name only (never marks/attendance), across teachers of the same session */
  function rosterMapFromList(list) {
    const map = new Map();
    (list || []).forEach((s) => {
      if (!s?.roll || !s?.name) return;
      const roll = String(s.roll).trim().toUpperCase();
      const name = String(s.name).trim().toUpperCase();
      if (!roll || !name) return;
      /* Strip any accidental extra fields — shared store must stay roll+name only */
      const prev = map.get(roll);
      if (!prev || name.length > prev.name.length) map.set(roll, { roll, name });
    });
    return map;
  }
  function sortRosterList(list) {
    return [...list].sort((a, b) => {
      const na = parseInt(String(a.roll).replace(/\D/g, ""), 10);
      const nb = parseInt(String(b.roll).replace(/\D/g, ""), 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true });
    });
  }
  function collectSessionStudents(sessionRaw) {
    const key = normalizeSession(sessionRaw);
    if (!key) return [];
    const map = rosterMapFromList([]);
    const stored = loadJSON(LS_SESSION_ROSTER, {});
    rosterMapFromList(stored[key] || []).forEach((s, roll) => map.set(roll, s));
    /* Also harvest from every teacher workspace on this device */
    const allTeachers = loadJSON(LS_TEACHER, {});
    Object.values(allTeachers || {}).forEach((st) => {
      (st?.classes || []).forEach((cls) => {
        if (normalizeSession(cls.session) !== key) return;
        rosterMapFromList(cls.students).forEach((s, roll) => map.set(roll, s));
      });
    });
    return sortRosterList([...map.values()]);
  }
  function getSessionRoster(sessionRaw) {
    return collectSessionStudents(sessionRaw);
  }
  function publishSessionRoster(sessionRaw, students) {
    const key = normalizeSession(sessionRaw);
    if (!key) return;
    const all = loadJSON(LS_SESSION_ROSTER, {});
    const map = rosterMapFromList(all[key] || []);
    rosterMapFromList(students).forEach((s, roll) => map.set(roll, s));
    all[key] = sortRosterList([...map.values()]);
    saveJSON(LS_SESSION_ROSTER, all);
  }
  /* Back-compat aliases used during migration */
  function getSemesterRoster(sem) {
    const legacy = loadJSON(LS_SEM_ROSTER_LEGACY, {});
    return Array.isArray(legacy[String(sem)]) ? legacy[String(sem)] : [];
  }
  function publishSemesterRoster(sem, students) {
    /* Legacy no-op publisher — session roster is the source of truth */
    void sem;
    void students;
  }
  function sortStudentsByRoll(students) {
    if (!Array.isArray(students)) return [];
    students.sort((a, b) => {
      const ra = String(a?.roll || "").trim().toUpperCase();
      const rb = String(b?.roll || "").trim().toUpperCase();
      const na = parseInt(ra.replace(/\D/g, ""), 10);
      const nb = parseInt(rb.replace(/\D/g, ""), 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: "base" });
    });
    return students;
  }
  function importSessionRoster(cls) {
    ensureClassMeta(cls);
    const sessionKey = normalizeSession(cls.session);
    let shared = sessionKey ? getSessionRoster(sessionKey) : [];
    /* One-time bridge: if session store empty, seed from legacy semester roster */
    if (!shared.length && cls.semester != null) {
      shared = getSemesterRoster(cls.semester);
      if (shared.length && sessionKey) publishSessionRoster(sessionKey, shared);
    }
    let added = 0;
    shared.forEach((s) => {
      if (cls.students.some((x) => x.roll === s.roll)) return;
      cls.students.push({ roll: s.roll, name: s.name });
      cls.attendance[s.roll] = emptyAttendance();
      cls.marks[s.roll] = emptyMarks();
      added++;
    });
    sortStudentsByRoll(cls.students);
    return added;
  }
  function importSemesterRoster(cls) {
    return importSessionRoster(cls);
  }
  function addStudentsToClass(list) {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass()?.id);
    if (!c) return 0;
    ensureClassMeta(c);
    let added = 0;
    for (const s of list) {
      const roll = String(s.roll || "").trim().toUpperCase();
      const name = String(s.name || "").trim().toUpperCase();
      if (!roll || !name) continue;
      if (c.students.some((x) => x.roll === roll)) {
        const hit = c.students.find((x) => x.roll === roll);
        if (hit && name.length > hit.name.length) hit.name = name;
        continue;
      }
      c.students.push({ roll, name });
      c.attendance[roll] = emptyAttendance();
      c.marks[roll] = emptyMarks();
      added++;
    }
    sortStudentsByRoll(c.students);
    publishSessionRoster(c.session, c.students);
    setStore(st);
    return added;
  }

  function showTeacherPanel(panel) {
    const allowed = ["overview", "roster", "attendance", "marks", "pdf"];
    if (!allowed.includes(panel)) panel = "overview";
    document.querySelectorAll(".t-panel").forEach((p) => p.classList.remove("active"));
    const el = document.getElementById("tp-" + panel);
    if (el) el.classList.add("active");
    document.querySelectorAll(".t-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.panel === panel));
    if (panel === "overview") renderOverview();
    if (panel === "roster") renderRoster();
    if (panel === "attendance") renderAttendance();
    if (panel === "marks") renderMarks();
  }

  function renderOverview() {
    const grid = document.getElementById("t-overview-grid");
    if (!grid) return;
    const st = getStore();
    const c = activeClass();
    if (!st || !c) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Set up a class to see your overview.</div>';
      return;
    }
    const shared = getSessionRoster(c.session).length;
    grid.innerHTML = `
      <div class="t-ov-stat wide"><div class="lbl">Teacher name</div><div class="val">${esc(st.officialName || "—")}</div></div>
      <div class="t-ov-stat"><div class="lbl">Semester / class</div><div class="val">Semester ${c.semester}</div></div>
      <div class="t-ov-stat"><div class="lbl">Session</div><div class="val">${esc(normalizeSession(c.session) || c.session || "—")}</div></div>
      <div class="t-ov-stat wide"><div class="lbl">Subject</div><div class="val">${esc(c.subject)}${c.subjectCode ? " · " + esc(c.subjectCode) : ""}</div></div>
      <div class="t-ov-stat"><div class="lbl">Credit hours</div><div class="val">${(+c.creditHours || 3).toFixed(0)}</div></div>
      <div class="t-ov-stat"><div class="lbl">Students in roster</div><div class="val">${c.students.length}</div></div>
      <div class="t-ov-stat"><div class="lbl">Total classes (CHR)</div><div class="val">${c.totalClasses || DEFAULT_CLASSES}</div></div>
      <div class="t-ov-stat"><div class="lbl">Shared session rolls</div><div class="val">${shared}</div></div>
    `;
  }

  function syncHomeOverview() {
    const box = document.getElementById("homeTeacherOverview");
    if (!box) return;
    const st = getStore();
    const u = global.currentUser && global.currentUser();
    if (!st || !u || u.role !== "teacher") {
      box.innerHTML = "";
      return;
    }
    const c = activeClass();
    if (!c) {
      box.innerHTML = `<div class="t-ov-stat wide"><div class="lbl">Setup needed</div><div class="val">Open Teacher desk to create your class.</div></div>`;
      return;
    }
    box.innerHTML = `
      <div class="t-overview-grid">
        <div class="t-ov-stat wide"><div class="lbl">Your name</div><div class="val">${esc(st.officialName || u.name || "—")}</div></div>
        <div class="t-ov-stat"><div class="lbl">Session</div><div class="val">${esc(normalizeSession(c.session) || c.session || "—")}</div></div>
        <div class="t-ov-stat"><div class="lbl">Students</div><div class="val">${c.students.length}</div></div>
        <div class="t-ov-stat wide"><div class="lbl">Subject</div><div class="val">${esc(c.subject)} · Sem ${c.semester}</div></div>
      </div>`;
  }

  function refreshClassSelect() {
    const st = getStore();
    const sel = document.getElementById("t-class-sel");
    if (!sel || !st) return;
    sel.innerHTML = st.classes.map((c) =>
      `<option value="${c.id}" ${c.id === st.activeClassId ? "selected" : ""}>${esc(normalizeSession(c.session) || c.session || "Session")} · Sem ${c.semester} · ${esc(c.subject)}</option>`
    ).join("") || '<option value="">No class yet</option>';
  }

  function onClassChange() {
    const st = getStore();
    if (!st) return;
    st.activeClassId = document.getElementById("t-class-sel").value;
    setStore(st);
    renderTeacherHome();
  }

  function openTeacherSetup(force) {
    const st = getStore();
    if (!st) return;
    if (!force && st.profileComplete && st.classes.length) return;
    document.getElementById("ob-t-name").value = st.officialName || (global.currentUser()?.name || "");
    document.getElementById("ob-t-sem").innerHTML = Object.keys(global.SYLLABUS || {}).map((n) =>
      `<option value="${n}">Semester ${n}</option>`
    ).join("");
    document.getElementById("ob-t-code").value = "";
    document.getElementById("ob-t-ch").value = "3";
    document.getElementById("ob-t-session").value = "2025-29";
    fillTeacherSubjList();
    document.getElementById("ob-t-subj").value = "";
    onTeacherSubjChange();
    document.getElementById("teacherSetupOverlay").classList.add("show");
  }
  function closeTeacherSetup() {
    document.getElementById("teacherSetupOverlay").classList.remove("show");
  }
  function fillTeacherSubjList() {
    const n = document.getElementById("ob-t-sem").value;
    const list = (global.SYLLABUS && global.SYLLABUS[n]) || [];
    const sel = document.getElementById("ob-t-subj");
    const prev = sel.value;
    sel.innerHTML =
      '<option value="">Select subject</option>' +
      list
        .map(
          (x) =>
            `<option value="${esc(x[1])}" data-code="${esc(x[0])}" data-ch="${x[2] || 3}">${esc(x[1])}</option>`
        )
        .join("");
    if (prev && list.some((x) => x[1] === prev)) sel.value = prev;
    else sel.value = "";
    onTeacherSubjChange();
  }
  function onTeacherSubjChange() {
    const sel = document.getElementById("ob-t-subj");
    const opt = sel && sel.options[sel.selectedIndex];
    const codeEl = document.getElementById("ob-t-code");
    const chEl = document.getElementById("ob-t-ch");
    if (opt && opt.value && opt.dataset.code) {
      codeEl.value = opt.dataset.code;
      if (opt.dataset.ch) chEl.value = opt.dataset.ch;
    } else if (!opt || !opt.value) {
      codeEl.value = "";
    }
  }
  function saveTeacherSetup() {
    const st = getStore();
    if (!st) return;
    const name = document.getElementById("ob-t-name").value.trim();
    const semester = +document.getElementById("ob-t-sem").value || 3;
    const subject = document.getElementById("ob-t-subj").value.trim();
    let subjectCode = document.getElementById("ob-t-code").value.trim();
    const creditHours = parseFloat(document.getElementById("ob-t-ch").value) || 3;
    const sessionRaw = document.getElementById("ob-t-session").value.trim();
    if (!name || !subject) { alert("Enter official name and select a subject."); return; }
    if (!isValidSession(sessionRaw)) {
      alert("Session is required in the standard form YYYY-YY.\nExample: 2025-29 (not 2025-2029).");
      document.getElementById("ob-t-session")?.focus();
      return;
    }
    const session = normalizeSession(sessionRaw);

    const hit = ((global.SYLLABUS || {})[semester] || []).find((x) => x[1] === subject);
    if (hit && !subjectCode) subjectCode = hit[0];

    const dup = st.classes.some(
      (c) =>
        c.semester === semester &&
        normalizeSession(c.session) === session &&
        c.subject.toLowerCase() === subject.toLowerCase()
    );
    if (dup) {
      alert("You already have this class. Pick another subject or use + Class for a different one.");
      return;
    }

    const cls = {
      id: uid(),
      semester, subject, subjectCode, creditHours, session,
      midExamDate: "", finExamDate: "",
      totalClasses: DEFAULT_CLASSES,
      attMode: "daily",
      students: [],
      attendance: {},
      marks: {},
    };
    const imported = importSessionRoster(cls);

    st.officialName = name;
    st.profileComplete = true;
    st.classes.push(cls);
    st.activeClassId = cls.id;
    setStore(st);
    if (typeof global.publishInstructorName === "function") global.publishInstructorName(name);
    document.getElementById("teacherSetupOverlay").dataset.mode = "";
    closeTeacherSetup();
    renderTeacherHome();
    if (global.go) global.go("teacher");
    if (imported > 0) {
      alert(`Class saved. ${imported} student(s) from session ${session} were added automatically from the shared roster.`);
    }
  }

  function addAnotherClass() {
    document.getElementById("teacherSetupOverlay").dataset.mode = "addClass";
    openTeacherSetup(true);
  }

  function setStudentFormMode(editing) {
    const saveBtn = document.getElementById("tr-student-save-btn");
    const cancelBtn = document.getElementById("tr-student-cancel-btn");
    const hint = document.getElementById("tr-student-edit-hint");
    if (saveBtn) saveBtn.textContent = editing ? "Save changes" : "Add student";
    if (cancelBtn) cancelBtn.style.display = editing ? "" : "none";
    if (hint) {
      hint.style.display = editing ? "" : "none";
      hint.textContent = editing
        ? "Editing roll " + editingStudentRoll + ". Change roll/name then tap Save changes."
        : "";
    }
  }

  function cancelEditStudent() {
    editingStudentRoll = null;
    const rollEl = document.getElementById("tr-roll");
    const nameEl = document.getElementById("tr-name");
    if (rollEl) rollEl.value = "";
    if (nameEl) nameEl.value = "";
    setStudentFormMode(false);
  }

  function editStudent(roll) {
    const c = activeClass();
    if (!c) return;
    const s = c.students.find((x) => x.roll === roll);
    if (!s) return;
    editingStudentRoll = roll;
    const rollEl = document.getElementById("tr-roll");
    const nameEl = document.getElementById("tr-name");
    if (rollEl) rollEl.value = s.roll;
    if (nameEl) nameEl.value = s.name;
    setStudentFormMode(true);
    showTeacherPanel("roster");
    rollEl?.focus();
  }

  function addStudentManual() {
    const c = activeClass();
    if (!c) { alert("Create a class first."); return; }
    const roll = document.getElementById("tr-roll").value.trim().toUpperCase();
    const name = document.getElementById("tr-name").value.trim().toUpperCase();
    if (!roll || !name) { alert("Enter roll number and name."); return; }

    if (editingStudentRoll) {
      const st = getStore();
      const cls = st.classes.find((x) => x.id === activeClass()?.id);
      if (!cls) return;
      const oldRoll = editingStudentRoll;
      const student = cls.students.find((x) => x.roll === oldRoll);
      if (!student) {
        cancelEditStudent();
        return;
      }
      if (roll !== oldRoll && cls.students.some((x) => x.roll === roll)) {
        alert("Another student already has roll " + roll + ".");
        return;
      }
      student.roll = roll;
      student.name = name;
      if (roll !== oldRoll) {
        cls.attendance[roll] = cls.attendance[oldRoll] || emptyAttendance();
        cls.marks[roll] = cls.marks[oldRoll] || emptyMarks();
        delete cls.attendance[oldRoll];
        delete cls.marks[oldRoll];
      }
      sortStudentsByRoll(cls.students);
      publishSessionRoster(cls.session, cls.students);
      setStore(st);
      cancelEditStudent();
      renderOverview();
      renderRoster();
      renderAttendance();
      renderMarks();
      syncHomeOverview();
      return;
    }

    const added = addStudentsToClass([{ roll, name }]);
    if (!added) { alert("This roll is already in the class."); return; }
    document.getElementById("tr-roll").value = "";
    document.getElementById("tr-name").value = "";
    renderOverview();
    renderRoster();
    renderAttendance();
    renderMarks();
    syncHomeOverview();
  }

  function removeStudent(roll) {
    if (!confirm("Delete " + roll + " from this class roster?")) return;
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    c.students = c.students.filter((s) => s.roll !== roll);
    delete c.attendance[roll];
    delete c.marks[roll];
    if (editingStudentRoll === roll) cancelEditStudent();
    setStore(st);
    renderOverview();
    renderRoster();
    renderAttendance();
    renderMarks();
    syncHomeOverview();
  }

  function isHeaderNoise(s) {
    return /WEEK|ATTENDANCE|SERIAL|TOTAL|UNIVERSITY|COLLEGE|SEMESTER|SUBJECT|SIGNATURE|PRESENT|ABSENT|SESSION|SECTION|PRINCIPAL|FATHER\s*NAME|CONTACT\s*NO|DATE\s*OF|ADMISSION|CNIC/.test(
      String(s || "").toUpperCase()
    );
  }
  function looksLikeRoll(tok) {
    return /^(\d{3,6})([A-Za-z])?$/.test(String(tok || "").replace(/\s/g, ""));
  }

  /**
   * Guide: after Roll on the same row, read the next column.
   * Take every character there, but stop once 20 non-space characters
   * (letters / ' / .) have been collected. Spaces are not counted toward 20
   * but are kept between words in the saved name.
   */
  function nameFromTextAfterRoll(afterRoll) {
    let src = String(afterRoll || "");
    /* If the row has clear columns (tab / wide gap / |), use ONLY the next column cell */
    if (/\t/.test(src) || /\s{2,}/.test(src) || /\|/.test(src)) {
      const parts = src
        .split(/\t+|\s{2,}|\s*\|\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length) src = parts[0];
    }

    let i = 0;
    while (i < src.length && /[\s|:\-_]/.test(src[i])) i++;

    let out = "";
    let nonSpace = 0;
    while (i < src.length && nonSpace < 20) {
      const ch = src[i];
      const ahead = src.slice(i).replace(/[\s\-]/g, "");

      /* Next columns: CNIC, mobile, month of admission */
      if (/^\d{5}\d{7}/.test(ahead)) break;
      if (/^03\d{9}/.test(ahead)) break;
      if (/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)/i.test(src.slice(i))) break;

      if (/\s/.test(ch) || ch === "|" || ch === "\t") {
        if (out.length && !out.endsWith(" ") && nonSpace > 0) out += " ";
        i++;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        if (nonSpace > 0) break;
        i++;
        continue;
      }
      if (!/[A-Za-z.']/.test(ch)) {
        if (nonSpace > 0) break;
        i++;
        continue;
      }
      out += ch.toUpperCase();
      nonSpace++;
      i++;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /** Same row: find Roll, then Name = next 20 non-space characters. */
  function extractRollAndNameFromLine(line) {
    const raw = String(line || "").trim();
    if (!raw) return null;
    if (isHeaderNoise(raw) && !/\d{3,4}/.test(raw)) return null;

    /* Roll is usually 1001–1050 style at the start (or after a tiny serial). */
    let m = raw.match(/^(\d{3,4})\b(.*)$/);
    if (!m) {
      m = raw.match(/^(?:\d{1,2}[\s.|]+)+(\d{3,4})\b(.*)$/);
    }
    if (!m) {
      m = raw.match(/(?:^|[\s|\t])(\d{3,4})\b(.*)$/);
    }
    if (!m) return null;

    const roll = String(m[1]).replace(/\s/g, "").toUpperCase();
    if (!looksLikeRoll(roll)) return null;

    const after = m[2] != null ? m[2] : "";
    const name = nameFromTextAfterRoll(after);
    if (!name || name.length < 2) return null;
    if (isHeaderNoise(name)) return null;
    return { roll, name };
  }

  /** Extract Roll + Name (next column, max 20 non-space characters) from every row. */
  function parseRosterText(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      const hit = extractRollAndNameFromLine(line);
      if (!hit || seen.has(hit.roll)) continue;
      seen.add(hit.roll);
      out.push(hit);
    }
    return out;
  }

  function applyParsedRoster(list, statusMsg) {
    const status = document.getElementById("tr-ocr-status");
    if (!list.length) {
      if (status) status.textContent = "Could not find a Roll column with names. Use a clearer list, or add manually.";
      return;
    }
    pendingOcr = list;
    if (status) {
      status.textContent =
        statusMsg ||
        `Extracted ${list.length} row(s): Roll + next column name (up to 20 letters). Untick mistakes, then Add selected students.`;
    }
    renderOcrPreview(list);
  }

  function onRosterFileChosen(file) {
    pendingRosterFile = file || null;
    const nameEl = document.getElementById("tr-file-name");
    const status = document.getElementById("tr-ocr-status");
    clearOcrPreview();
    if (!file) {
      if (nameEl) nameEl.textContent = "No file selected yet.";
      if (status) status.textContent = "";
      return;
    }
    const kb = Math.max(1, Math.round(file.size / 1024));
    if (nameEl) nameEl.textContent = `Selected: ${file.name} (${kb} KB)`;
    if (status) status.textContent = "File ready — analyzing Roll + Name columns…";
    const shouldRun = analyzeAfterPick;
    analyzeAfterPick = false;
    /* Always analyze after a file is chosen so the button never feels “stuck off”. */
    setTimeout(() => analyzeRosterFile(), shouldRun ? 0 : 30);
  }

  async function analyzeRosterFile() {
    const input = document.getElementById("tr-photo");
    let file = pendingRosterFile || (input && input.files && input.files[0]) || null;
    if (!file) {
      analyzeAfterPick = true;
      if (input) {
        input.value = "";
        input.click();
      } else {
        alert("File picker not found. Hard-refresh the page (Ctrl+F5).");
      }
      return;
    }
    if (analyzeRosterFile._busy) return;
    analyzeRosterFile._busy = true;
    const btn = document.getElementById("tr-analyze-btn");
    const label = "Analyze file — extract roll & names";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Analyzing…";
    }
    try {
      await uploadRosterFile(file);
    } catch (e) {
      console.error(e);
      const status = document.getElementById("tr-ocr-status");
      if (status) status.textContent = "Analyze failed. Try another PDF/image or add manually.";
    } finally {
      analyzeRosterFile._busy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  async function uploadRosterFile(file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) return extractRosterFromPdf(file);
    return ocrAttendancePhoto(file);
  }

  async function extractTextFromPdf(file) {
    const pdfjs = global.pdfjsLib || global["pdfjs-dist/build/pdf"] || null;
    if (!pdfjs) throw new Error("PDF.js not loaded");
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    let text = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const lineMap = new Map();
      content.items.forEach((item) => {
        const str = item.str || "";
        if (!str.trim()) return;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        const x = item.transform ? item.transform[4] : 0;
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y).push({ x, str });
      });
      const lines = [...lineMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => {
          parts.sort((a, b) => a.x - b.x);
          if (parts.length === 1) return parts[0].str;
          /* Insert tabs between cells when X gap is large → preserves full Name column */
          let row = parts[0].str;
          for (let i = 1; i < parts.length; i++) {
            const gap = parts[i].x - parts[i - 1].x;
            const prevLen = String(parts[i - 1].str || "").length;
            row += gap > Math.max(18, prevLen * 3.2) ? "\t" : " ";
            row += parts[i].str;
          }
          return row;
        });
      text += lines.join("\n") + "\n";
    }
    return { text, doc };
  }

  async function ocrPdfPages(doc, status) {
    if (typeof Tesseract === "undefined") return "";
    let text = "";
    const maxPages = Math.min(doc.numPages, 3);
    for (let p = 1; p <= maxPages; p++) {
      if (status) status.textContent = `OCR PDF page ${p}/${maxPages}…`;
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const result = await Tesseract.recognize(canvas, "eng");
      text += (result.data.text || "") + "\n";
    }
    return text;
  }

  async function extractRosterFromPdf(file) {
    const status = document.getElementById("tr-ocr-status");
    clearOcrPreview();
    if (status) status.textContent = "Reading PDF…";
    try {
      const { text, doc } = await extractTextFromPdf(file);
      let parsed = parseRosterText(text);
      if (parsed.length < 3) {
        if (status) status.textContent = "Little text in PDF — running OCR on pages…";
        const ocrText = await ocrPdfPages(doc, status);
        parsed = parseRosterText(text + "\n" + ocrText);
      }
      applyParsedRoster(parsed, `Detected ${parsed.length} student(s) from PDF. Untick mistakes, then add.`);
    } catch (e) {
      console.error(e);
      if (status) status.textContent = "PDF read failed. Try exporting as image, or add students manually.";
    }
  }

  function renderOcrPreview(list) {
    const box = document.getElementById("tr-ocr-preview");
    if (!box) return;
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="ocr-preview">
        ${list.map((s, i) => `
          <label class="ocr-row">
            <input type="checkbox" data-ocr-i="${i}" checked>
            <span class="roll">${esc(s.roll)}</span>
            <span class="nm">${esc(s.name)}</span>
          </label>`).join("")}
      </div>
      <button class="btn btn-primary" type="button" style="margin-top:10px" onclick="TeacherApp.confirmOcrStudents()">Add selected students</button>
      <button class="btn btn-ghost" type="button" style="margin-top:8px" onclick="TeacherApp.clearOcrPreview()">Cancel</button>`;
  }
  function clearOcrPreview() {
    pendingOcr = [];
    const box = document.getElementById("tr-ocr-preview");
    if (box) box.innerHTML = "";
    const st = document.getElementById("tr-ocr-status");
    if (st) st.textContent = "";
  }
  function confirmOcrStudents() {
    const checks = [...document.querySelectorAll("#tr-ocr-preview input[data-ocr-i]:checked")];
    const picked = checks.map((el) => pendingOcr[+el.dataset.ocrI]).filter(Boolean);
    if (!picked.length) { alert("Select at least one student."); return; }
    const added = addStudentsToClass(picked);
    document.getElementById("tr-ocr-status").textContent =
      `Saved ${added} new student(s). Shared with other teachers of session ${normalizeSession(activeClass()?.session) || activeClass()?.session || "—"}.`;
    clearOcrPreview();
    renderOverview();
    renderRoster();
    renderAttendance();
    renderMarks();
    syncHomeOverview();
  }

  async function ocrAttendancePhoto(file) {
    const status = document.getElementById("tr-ocr-status");
    if (!file) return;
    if (typeof Tesseract === "undefined") {
      if (status) status.textContent = "OCR library not loaded. Check your internet connection.";
      return;
    }
    if (status) status.textContent = "Reading list (roll + name)…";
    clearOcrPreview();
    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress != null && status) {
            status.textContent = "Reading… " + Math.round(m.progress * 100) + "%";
          }
        },
      });
      const raw = result.data.text || "";
      const parsed = parseRosterText(raw);
      if (!parsed.length) {
        if (status) status.textContent = "Could not detect roll/name. Try a clearer photo/PDF, or add manually.";
        console.log("OCR raw text:", raw);
        return;
      }
      applyParsedRoster(parsed);
    } catch (e) {
      console.error(e);
      if (status) status.textContent = "OCR failed. Please add students manually.";
    }
  }

  function renderRoster() {
    const c = activeClass();
    const el = document.getElementById("tr-roster");
    if (!el) return;
    if (!c || !c.students.length) {
      el.innerHTML = '<div class="empty">No students yet. Upload a PDF or photo of the official list, or add manually.</div>';
      return;
    }
    sortStudentsByRoll(c.students);
    el.innerHTML = c.students.map((s) => {
      const rollJs = JSON.stringify(s.roll);
      return `<div class="tr-student-row">
        <div class="tr-student-meta">
          <div class="roll-chip">${esc(s.roll)}</div>
          <div class="t">${esc(s.name)}</div>
        </div>
        <div class="sr-saved-actions">
          <button type="button" class="btn btn-ghost btn-sm" onclick='TeacherApp.editStudent(${rollJs})'>Edit</button>
          <button type="button" class="btn btn-danger btn-sm" onclick='TeacherApp.removeStudent(${rollJs})'>Delete</button>
        </div>
      </div>`;
    }).join("");
  }

  function setAttMode(mode) {
    const st = getStore();
    const c = st?.classes.find((x) => x.id === activeClass()?.id);
    if (!c) return;
    ensureClassMeta(c);
    c.attMode = mode === "weekly" ? "weekly" : "daily";
    setStore(st);
    document.getElementById("att-tog-daily")?.classList.toggle("active", c.attMode === "daily");
    document.getElementById("att-tog-weekly")?.classList.toggle("active", c.attMode === "weekly");
    const hint = document.getElementById("tr-att-hint");
    if (hint) {
      hint.textContent = c.attMode === "daily"
        ? "Daily: tap each class P / A / L. Present counts roll into weekly automatically."
        : "Weekly: enter how many classes each student attended (out of total CHR).";
    }
    renderAttendance();
  }
  function setTotalClasses(val) {
    const st = getStore();
    const c = st?.classes.find((x) => x.id === activeClass()?.id);
    if (!c) return;
    ensureClassMeta(c);
    c.totalClasses = Math.min(60, Math.max(1, parseInt(val, 10) || DEFAULT_CLASSES));
    setStore(st);
    renderAttendance();
  }
  function cycleDaily(roll, day) {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    ensureClassMeta(c);
    if (!c.attendance[roll]) c.attendance[roll] = emptyAttendance();
    c.attendance[roll] = normalizeAtt(c.attendance[roll]);
    const cur = c.attendance[roll].daily["d" + day] || "";
    const next = cur === "" ? "P" : cur === "P" ? "A" : cur === "A" ? "L" : "";
    c.attendance[roll].daily["d" + day] = next;
    // keep weekly number in sync from daily
    c.attendance[roll].presentCount = presentFromDaily(c.attendance[roll], c.totalClasses);
    setStore(st);
    renderAttendance();
  }
  function setWeeklyPresent(roll, value) {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    ensureClassMeta(c);
    if (!c.attendance[roll]) c.attendance[roll] = emptyAttendance();
    c.attendance[roll] = normalizeAtt(c.attendance[roll]);
    const n = value === "" ? null : Math.min(c.totalClasses, Math.max(0, parseInt(value, 10) || 0));
    c.attendance[roll].presentCount = n;
    setStore(st);
    updateAttSummary();
  }
  function updateAttSummary() {
    const c = activeClass();
    const el = document.getElementById("tr-att-summary");
    if (!el || !c) return;
    ensureClassMeta(c);
    const total = c.totalClasses;
    const mode = c.attMode;
    let sum = 0;
    c.students.forEach((s) => { sum += effectivePresent(c.attendance[s.roll], total, mode); });
    const avg = c.students.length ? (sum / c.students.length) : 0;
    el.textContent = `${c.students.length} students · ${total} CHR · avg ${avg.toFixed(1)} present`;
  }

  function renderAttendance() {
    const c = activeClass();
    const el = document.getElementById("tr-att-table");
    if (!el) return;
    if (!c) { el.innerHTML = '<div class="empty">Create a class first.</div>'; return; }
    ensureClassMeta(c);
    const total = c.totalClasses || DEFAULT_CLASSES;
    const mode = c.attMode || "daily";
    const totInput = document.getElementById("tr-total-classes");
    if (totInput) totInput.value = total;
    document.getElementById("att-tog-daily")?.classList.toggle("active", mode === "daily");
    document.getElementById("att-tog-weekly")?.classList.toggle("active", mode === "weekly");

    if (!c.students.length) {
      el.innerHTML = '<div class="empty">Add students first.</div>';
      updateAttSummary();
      return;
    }
    sortStudentsByRoll(c.students);

    if (mode === "weekly") {
      const rows = c.students.map((s) => {
        const att = normalizeAtt(c.attendance[s.roll]);
        const fromDaily = presentFromDaily(att, total);
        const val = att.presentCount != null ? att.presentCount : fromDaily;
        return `<tr>
          <td class="sticky-col"><b>${esc(s.roll)}</b><br><small>${esc(s.name)}</small></td>
          <td><input class="att-num" type="number" min="0" max="${total}" value="${val}"
            onchange="TeacherApp.setWeeklyPresent('${esc(s.roll)}',this.value)"></td>
          <td>${total}</td>
          <td>${total ? Math.round((val / total) * 100) : 0}%</td>
        </tr>`;
      }).join("");
      el.innerHTML = `<div class="scroll-x"><table class="data-table">
        <thead><tr><th class="sticky-col">Student</th><th>Attended</th><th>CHR</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <p class="hint">Enter attended classes yourself (0–${total}). Daily marks still keep a running count if you switch back.</p>`;
    } else {
      const head = Array.from({ length: total }, (_, i) => `<th>C${i + 1}</th>`).join("");
      const rows = c.students.map((s) => {
        const att = normalizeAtt(c.attendance[s.roll]);
        const cells = Array.from({ length: total }, (_, i) => {
          const d = i + 1;
          const v = att.daily["d" + d] || "";
          return `<td><button type="button" class="att-chip ${v ? "on-" + v : ""}" title="Tap to cycle"
            onclick="TeacherApp.cycleDaily('${esc(s.roll)}',${d})">${v || "·"}</button></td>`;
        }).join("");
        const p = presentFromDaily(att, total);
        return `<tr><td class="sticky-col"><b>${esc(s.roll)}</b><br><small>${esc(s.name)}</small><br><small>${p}/${total}</small></td>${cells}</tr>`;
      }).join("");
      el.innerHTML = `<div class="scroll-x"><table class="data-table"><thead><tr><th class="sticky-col">Student</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hint">Tap a cell: · → P → A → L. Scroll sideways for all ${total} classes. Present totals feed weekly automatically.</p>`;
    }
    updateAttSummary();
  }

  function setMark(roll, field, value) {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    if (!c.marks[roll]) c.marks[roll] = emptyMarks();
    c.marks[roll][field] = value === "" ? 0 : parseFloat(value) || 0;
    if (field === "mid_obj" || field === "mid_sub") {
      c.marks[roll].mid = Math.min(100, (+c.marks[roll].mid_obj || 0) + (+c.marks[roll].mid_sub || 0));
    }
    if (field === "fin_obj" || field === "fin_sub") {
      c.marks[roll].final = Math.min(100, (+c.marks[roll].fin_obj || 0) + (+c.marks[roll].fin_sub || 0));
    }
    setStore(st);
    const r = calcStudent(c.marks[roll]);
    const gpEl = document.getElementById("gp-" + roll);
    if (gpEl) gpEl.textContent = `${r.rounded} · ${r.grade} · ${r.gp.toFixed(2)}`;
  }

  function renderMarks(mode) {
    mode = mode || document.getElementById("tr-marks-mode")?.value || "all";
    const c = activeClass();
    const el = document.getElementById("tr-marks-table");
    if (!el) return;
    if (!c || !c.students.length) {
      el.innerHTML = '<div class="empty">Add students first.</div>';
      return;
    }
    sortStudentsByRoll(c.students);
    const showQ = mode === "all" || mode === "quiz";
    const showA = mode === "all" || mode === "assn";
    const showM = mode === "all" || mode === "mid" || mode === "overall";
    const showF = mode === "all" || mode === "final" || mode === "overall";

    let head = `<th class="sticky-col">Student</th>`;
    if (showQ) head += `<th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Q5</th>`;
    if (showA) head += `<th>A1</th><th>A2</th>`;
    if (showM) head += `<th>Mid Obj</th><th>Mid Sub</th><th>Mid/100</th>`;
    if (showF) head += `<th>Fin Obj</th><th>Fin Sub</th><th>Fin/100</th>`;
    head += `<th>Result</th>`;

    const rows = c.students.map((s) => {
      const m = c.marks[s.roll] || emptyMarks();
      const r = calcStudent(m);
      const inp = (field, max) =>
        `<td><input class="mk" type="number" min="0" max="${max}" step="0.5" value="${m[field] || 0}" onchange="TeacherApp.setMark('${esc(s.roll)}','${field}',this.value)"></td>`;
      let cells = "";
      if (showQ) cells += inp("q1", 15) + inp("q2", 15) + inp("q3", 15) + inp("q4", 15) + inp("q5", 15);
      if (showA) cells += inp("a1", 15) + inp("a2", 15);
      if (showM) cells += inp("mid_obj", 100) + inp("mid_sub", 100) + inp("mid", 100);
      if (showF) cells += inp("fin_obj", 100) + inp("fin_sub", 100) + inp("final", 100);
      cells += `<td id="gp-${esc(s.roll)}" class="res-cell">${r.rounded} · ${r.grade} · ${r.gp.toFixed(2)}</td>`;
      return `<tr><td class="sticky-col"><b>${esc(s.roll)}</b><br><small>${esc(s.name)}</small></td>${cells}</tr>`;
    }).join("");

    el.innerHTML = `<div class="scroll-x"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">Scroll sideways if needed. Sticky student column stays visible.</p>`;
  }

  function semOrdinal(n) {
    n = +n || 0;
    const map = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th", 10: "10th" };
    return map[n] || (n ? n + "th" : "—");
  }

  /** Official ULC award-list sheet — A4 landscape, matches college template. */
  function awardPdfCss(partial) {
    if (partial) {
      return `
        *{box-sizing:border-box}
        body{font-family:"Times New Roman",Times,serif;color:#000;margin:0;background:#fff}
        .award-pdf{width:1122px;padding:16px 18px;background:#fff}
        .pdf-title{text-align:center;font-size:18px;font-weight:700;margin:0 0 4px}
        .pdf-badge{text-align:center;font-weight:700;border:1.5px solid #000;padding:2px 22px;margin:6px auto 10px;display:block;width:fit-content;font-size:13px}
        .pdf-page{text-align:right;font-size:9px;margin:0 0 4px}
        .meta{width:100%;border-collapse:collapse;margin:0 0 8px}
        .meta td{border:1px solid #333;padding:4px 6px;font-size:10px}
        .grid{width:100%;border-collapse:collapse;table-layout:fixed}
        .grid th,.grid td{border:1px solid #000;padding:5px 4px;text-align:center;font-size:10px}
        .grid .nm{text-align:left;padding-left:4px}
        .grid .roll{font-weight:700;white-space:nowrap}
        .h-q{background:#d9d9d9}.h-a{background:#bdd7ee}.h-m{background:#fff2cc}.h-f{background:#c6efce}.h-r{background:#f8cbad}
        .avg{background:#d9d9d9;font-weight:700}.avg-a{background:#bdd7ee;font-weight:700}
        .pct{background:#fff2cc}.pct-f{background:#c6efce}.grand{background:#ddebf7;font-weight:700}
        .rnd{background:#fce4d6;font-weight:700}.grd{background:#e8d5f2}.gp{background:#fff2cc;font-weight:700}
      `;
    }
    /* Full official award list — sized for one A4 landscape page (~25 rows) */
    return `
      *{box-sizing:border-box}
      body{font-family:"Times New Roman",Times,serif;color:#000;margin:0;background:#fff}
      .award-pdf{
        width:1122px;height:793px;padding:7px 9px 5px;background:#fff;
        display:flex;flex-direction:column;overflow:hidden;
      }
      .pdf-title{
        text-align:center;font-size:20px;font-weight:700;letter-spacing:.04em;
        margin:0;line-height:1.2;text-transform:uppercase;
        border:2.5px solid #000;padding:5px 10px;
      }
      .pdf-badge{
        text-align:center;font-weight:700;border:1.5px solid #000;
        padding:2px 40px;margin:5px auto 6px;display:block;width:fit-content;
        font-size:13px;letter-spacing:.1em;line-height:1.35;
      }
      .pdf-page{display:none}
      .meta-lines{width:100%;margin:0 0 6px;font-size:10px;line-height:1.5}
      .meta-lines .row{display:flex;flex-wrap:nowrap;gap:14px;margin-bottom:3px;align-items:baseline}
      .meta-lines .field{white-space:nowrap}
      .meta-lines .field.grow{flex:1 1 auto;min-width:0}
      .meta-lines .lab{font-weight:700}
      .meta-lines .val{
        display:inline-block;min-width:3.5em;border-bottom:1px solid #000;
        padding:0 4px 1px 2px;font-weight:400;vertical-align:baseline;
      }
      .meta-lines .val.wide{min-width:9em}
      .meta-lines .val.mid{min-width:5.5em}
      .grid-wrap{flex:0 0 auto;width:100%}
      .grid{
        width:100%;height:auto;border-collapse:collapse;table-layout:fixed;
        border:2.5px solid #000;
      }
      .grid col.roll{width:4%}
      .grid col.nm{width:13.9%}
      .grid col.c-q{width:3.2%}
      .grid col.c-qa{width:4.4%}
      .grid col.c-a{width:3.4%}
      .grid col.c-aa{width:3.7%}
      .grid col.c-m{width:3.9%}
      .grid col.c-f{width:3.9%}
      .grid col.c-g{width:4.4%}
      .grid col.c-r{width:4.1%}
      .grid col.c-gr{width:3.1%}
      .grid col.c-gp{width:2.9%}
      .grid col.c-rm{width:5.5%}
      .grid th,.grid td{
        border:1px solid #000;text-align:center;vertical-align:middle;
        padding:0;line-height:1.08;overflow:hidden;
      }
      .grid thead th{
        font-size:7.5px;font-weight:700;padding:1px 0;line-height:1.1;
      }
      .grid thead th.roll,.grid thead th.nm{
        font-size:10px;line-height:1.15;padding:3px 2px;vertical-align:middle;
      }
      .grid thead th.nm{text-align:center}
      .grid thead .top{
        font-size:10.5px;letter-spacing:.05em;padding:3px 0;height:18px;
      }
      .grid thead .sub{
        font-size:8px;padding:2px 1px;height:15px;white-space:nowrap;
      }
      .grid thead .lab{
        font-size:7.5px;padding:2px 0;height:20px;line-height:1.1;vertical-align:middle;
      }
      .grid thead .leaf{
        font-size:6.5px;padding:1px 0;height:13px;line-height:1.05;vertical-align:middle;
        font-weight:600;
      }
      .grid thead .h-r{
        font-size:7.5px;padding:2px 1px;line-height:1.12;vertical-align:middle;
      }
      .grid tbody tr{height:18px}
      .grid tbody td{
        font-size:9px;height:18px;max-height:18px;min-height:18px;
        padding:0 1px;line-height:18px;background:#fff;
      }
      .grid tbody td.tint{background:#e4eaf3}
      .grid tbody td.avg{background:#d0d7de;font-weight:700}
      .grid tbody td.avg-a{background:#c5d7ea;font-weight:700}
      .grid tbody td.grand{background:#fff8dc;font-weight:700}
      .grid tbody td.rnd{background:#fce4d6;font-weight:700}
      .grid tbody td.grd{background:#fce4ec;font-weight:700}
      .grid tbody td.gp{background:#ddebf7;font-weight:700}
      .grid tbody tr:nth-child(even) td{background:#eef3f8}
      .grid tbody tr:nth-child(even) td.tint{background:#d9e2ef}
      .grid tbody tr:nth-child(even) td.avg{background:#c8d2dc}
      .grid tbody tr:nth-child(even) td.avg-a{background:#b8cce0}
      .grid tbody tr:nth-child(even) td.grand{background:#f5eec8}
      .grid tbody tr:nth-child(even) td.rnd{background:#f5d9c8}
      .grid tbody tr:nth-child(even) td.grd{background:#f5d0e0}
      .grid tbody tr:nth-child(even) td.gp{background:#c8d9ea}
      .grid tbody td.roll{
        font-weight:700;white-space:nowrap;font-size:9px;padding:0 2px;text-align:center;
      }
      .grid tbody td.nm{
        text-align:left;padding-left:3px;font-size:8.5px;
        font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:clip;
      }
      .h-q{background:#d9d9d9}
      .h-a{background:#bdd7ee}
      .h-m{background:#ffffff}
      .h-f{background:#ffffff}
      .h-r{background:#f8cbad}
      .obt{background:#fff}
      .pct{background:#fff}
      .pct-f{background:#fff}
      .rem{background:#fff}
    `;
  }

  const PDF_COL_META = {
    q1: { key: "q1", label: "Quiz 1", sub: "/15", cls: "h-q", max: 15 },
    q2: { key: "q2", label: "Quiz 2", sub: "/15", cls: "h-q", max: 15 },
    q3: { key: "q3", label: "Quiz 3", sub: "/15", cls: "h-q", max: 15 },
    q4: { key: "q4", label: "Quiz 4", sub: "/15", cls: "h-q", max: 15 },
    q5: { key: "q5", label: "Quiz 5", sub: "/15", cls: "h-q", max: 15 },
    a1: { key: "a1", label: "Assignment 1", sub: "/15", cls: "h-a", max: 15 },
    a2: { key: "a2", label: "Assignment 2", sub: "/15", cls: "h-a", max: 15 },
    mid: { key: "mid", label: "Mid exam", sub: "/100", cls: "h-m", max: 100 },
    final: { key: "final", label: "Final exam", sub: "/100", cls: "h-f", max: 100 },
  };

  const PDF_PRESETS = {
    full: null,
    q1: ["q1"],
    q2: ["q2"],
    q3: ["q3"],
    q4: ["q4"],
    q5: ["q5"],
    quizzes: ["q1", "q2", "q3", "q4", "q5"],
    a1: ["a1"],
    a2: ["a2"],
    assn: ["a1", "a2"],
    mid: ["mid"],
    final: ["final"],
    papers: ["mid", "final"],
  };

  function onPdfModeChange() {
    const mode = document.getElementById("tr-pdf-mode")?.value || "full";
    const box = document.getElementById("tr-pdf-custom");
    if (box) box.style.display = mode === "custom" ? "block" : "none";
  }

  function selectedPdfColumns() {
    const mode = document.getElementById("tr-pdf-mode")?.value || "full";
    if (mode === "full") return null;
    if (mode === "custom") {
      return [...document.querySelectorAll("#tr-pdf-custom input:checked")].map((el) => el.value);
    }
    return PDF_PRESETS[mode] || null;
  }

  function pdfTitleForColumns(cols) {
    if (!cols || !cols.length) return "AWARD LIST";
    if (cols.length === 1) return (PDF_COL_META[cols[0]]?.label || cols[0]).toUpperCase() + " MARKS";
    if (cols.join() === "q1,q2,q3,q4,q5") return "QUIZ MARKS";
    if (cols.join() === "a1,a2") return "ASSIGNMENT MARKS";
    if (cols.join() === "mid,final") return "MID & FINAL MARKS";
    return "MARKS SHEET";
  }

  function buildPartialMarksHtml(cols, students, pageInfo) {
    const st = getStore();
    const c = activeClass();
    if (!c) return "";
    const list = Array.isArray(students) ? students : c.students;
    sortStudentsByRoll(list);
    const teacher = st.officialName || "";
    const metaCols = cols.map((k) => PDF_COL_META[k]).filter(Boolean);
    if (!metaCols.length) return "";

    const head = metaCols.map((col) =>
      `<th class="${col.cls}">${esc(col.label)}<br>${esc(col.sub)}</th>`
    ).join("");

    const rows = list.map((s) => {
      const m = c.marks[s.roll] || emptyMarks();
      const cells = metaCols.map((col) => {
        let v = +m[col.key] || 0;
        if (col.key === "mid") v = Math.min(100, +m.mid || ((+m.mid_obj || 0) + (+m.mid_sub || 0)));
        if (col.key === "final") v = Math.min(100, +m.final || ((+m.fin_obj || 0) + (+m.fin_sub || 0)));
        return `<td>${v.toFixed(1)}</td>`;
      }).join("");
      return `<tr><td class="roll">${esc(s.roll)}</td><td class="nm">${esc(s.name)}</td>${cells}</tr>`;
    }).join("");

    const badge = pdfTitleForColumns(cols);
    const pageLabel = pageInfo
      ? `<div class="pdf-page">Page ${pageInfo.page} of ${pageInfo.pages}</div>`
      : "";
    return `<div class="award-pdf" id="awardPdfSheet">
      <div class="pdf-title">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="pdf-badge">${esc(badge)}</div>
      ${pageLabel}
      <table class="meta">
        <tr>
          <td><b>Program Title:</b> LL.B. (Five Years) Degree Program</td>
          <td><b>Session:</b> ${esc(c.session || "")}</td>
          <td><b>Semester:</b> ${c.semester}</td>
        </tr>
        <tr>
          <td><b>Course Code:</b> ${esc(c.subjectCode || "")}</td>
          <td><b>Credit Hours:</b> ${(+c.creditHours || 3).toFixed(2)}</td>
          <td><b>Course Title:</b> ${esc(c.subject)}</td>
        </tr>
        <tr>
          <td><b>Teacher:</b> ${esc(teacher)}</td>
          <td><b>Contents:</b> ${esc(metaCols.map((x) => x.label).join(", "))}</td>
          <td><b>Students:</b> ${c.students.length}</td>
        </tr>
      </table>
      <table class="grid">
        <thead>
          <tr>
            <th class="roll">Roll #</th>
            <th>Name of Student</th>
            ${head}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function buildAttendanceHtml() {
    const st = getStore();
    const c = activeClass();
    if (!c) return "";
    ensureClassMeta(c);
    sortStudentsByRoll(c.students);
    const total = c.totalClasses || DEFAULT_CLASSES;
    const teacher = st.officialName || "";
    const mode = c.attMode === "weekly" ? "Weekly" : "Daily";
    const rows = c.students.map((s, i) => {
      const present = effectivePresent(c.attendance[s.roll], total, c.attMode);
      const pct = total ? ((present / total) * 100).toFixed(1) : "0.0";
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(s.roll)}</td>
        <td class="nm">${esc(s.name)}</td>
        <td>${present}</td>
        <td>${total}</td>
        <td>${pct}%</td>
      </tr>`;
    }).join("");
    /* Inline styles so My Files preview/print also shows ruled row lines. */
    return `<div class="award-pdf" id="attendancePdfSheet">
      <style>
        #attendancePdfSheet{width:794px;padding:16px 18px;background:#fff;font-family:"Times New Roman",Times,serif;color:#000}
        #attendancePdfSheet .pdf-title{text-align:center;font-size:18px;font-weight:700;margin:0 0 4px}
        #attendancePdfSheet .pdf-badge{text-align:center;font-weight:700;border:1.5px solid #000;padding:2px 22px;margin:6px auto 10px;display:block;width:fit-content;font-size:13px}
        #attendancePdfSheet .meta{width:100%;border-collapse:collapse;margin:0 0 10px}
        #attendancePdfSheet .meta td{border:1px solid #333;padding:4px 6px;font-size:10px}
        #attendancePdfSheet .grid{width:100%;border-collapse:collapse;table-layout:fixed}
        #attendancePdfSheet .grid th{border:none;border-bottom:1.5px solid #000;padding:6px 4px;text-align:center;font-size:10px;font-weight:700}
        #attendancePdfSheet .grid td{border:none;border-bottom:0.6pt solid #555;padding:5px 4px;text-align:center;font-size:10px}
        #attendancePdfSheet .grid .nm{text-align:left;padding-left:4px}
      </style>
      <div class="pdf-title">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="pdf-badge">ATTENDANCE SHEET</div>
      <table class="meta">
        <tr>
          <td><b>Teacher:</b> ${esc(teacher)}</td>
          <td><b>Session:</b> ${esc(c.session || "")}</td>
          <td><b>Semester:</b> ${c.semester}</td>
        </tr>
        <tr>
          <td><b>Course:</b> ${esc(c.subject)}</td>
          <td><b>Code:</b> ${esc(c.subjectCode || "")}</td>
          <td><b>Mode:</b> ${mode} · CHR ${total}</td>
        </tr>
      </table>
      <table class="grid">
        <thead>
          <tr>
            <th>#</th>
            <th>Roll #</th>
            <th>Name of Student</th>
            <th>Present</th>
            <th>Total classes</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  async function exportAttendancePdf() {
    const c = activeClass();
    if (!c || !c.students.length) {
      alert("Add students before downloading attendance.");
      return;
    }
    const btn = document.getElementById("tr-att-pdf-btn");
    const label = btn ? btn.textContent : "Download attendance PDF";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating PDF…";
    }
    try {
      const jspdfNS = global.jspdf || window.jspdf;
      if (!jspdfNS || !jspdfNS.jsPDF) throw new Error("jsPDF missing");
      const { jsPDF } = jspdfNS;
      const st = getStore();
      ensureClassMeta(c);
      sortStudentsByRoll(c.students);
      const total = c.totalClasses || DEFAULT_CLASSES;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const left = 14;
      const right = 196;
      let y = 16;

      pdf.setFont("times", "bold");
      pdf.setFontSize(14);
      pdf.text("UNIVERSITY LAW COLLEGE, QUETTA", 105, y, { align: "center" });
      y += 7;
      pdf.setFontSize(12);
      pdf.text("ATTENDANCE SHEET", 105, y, { align: "center" });
      y += 8;

      pdf.setDrawColor(11, 58, 107);
      pdf.setLineWidth(0.4);
      pdf.line(left, y, right, y);
      y += 6;

      pdf.setFont("times", "normal");
      pdf.setFontSize(9);
      const metaLines = [
        "Teacher: " + (st.officialName || ""),
        "Subject: " + (c.subject || "") + (c.subjectCode ? " (" + c.subjectCode + ")" : ""),
        "Semester: " + c.semester + "   Session: " + (c.session || "") + "   CHR: " + total,
        "Mode: " + (c.attMode === "weekly" ? "Weekly" : "Daily") + "   Students: " + c.students.length,
      ];
      metaLines.forEach((line) => {
        pdf.text(line, left, y);
        y += 5;
      });
      y += 3;

      const drawHeader = () => {
        pdf.setFont("times", "bold");
        pdf.setFontSize(9);
        pdf.text("#", left, y);
        pdf.text("Roll", left + 10, y);
        pdf.text("Name of Student", left + 28, y);
        pdf.text("Present", left + 118, y);
        pdf.text("Total", left + 140, y);
        pdf.text("%", left + 162, y);
        y += 2;
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.35);
        pdf.line(left, y, right, y);
        y += 5;
        pdf.setFont("times", "normal");
      };
      drawHeader();

      c.students.forEach((s, i) => {
        if (y > 285) {
          pdf.addPage();
          y = 16;
          drawHeader();
        }
        const present = effectivePresent(c.attendance[s.roll], total, c.attMode);
        const pct = total ? ((present / total) * 100).toFixed(1) : "0.0";
        const name = String(s.name || "").slice(0, 44);
        pdf.text(String(i + 1), left, y);
        pdf.text(String(s.roll || ""), left + 10, y);
        pdf.text(name, left + 28, y);
        pdf.text(String(present), left + 118, y);
        pdf.text(String(total), left + 140, y);
        pdf.text(pct + "%", left + 162, y);
        /* Thin ruled line under each student row (formal register style). */
        y += 1.4;
        pdf.setDrawColor(90, 90, 90);
        pdf.setLineWidth(0.15);
        pdf.line(left, y, right, y);
        y += 4.6;
      });

      const slug = ("ULC_" + (c.subject || "Class") + "_Sem" + c.semester + "_Attendance").replace(/\s+/g, "_");
      const fname = slug + ".pdf";
      const savedAtt =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, fname)
          : await pdf.save(fname);
      if (savedAtt && savedAtt.canceled) return;
      try {
        if (global.MyFiles) {
          const title = (c.subject || "Class") + " · Sem " + c.semester + " · Attendance";
          await global.MyFiles.saveAttendanceAuto(title, "", savedAtt);
        }
      } catch (_) {}
    } catch (e) {
      console.error(e);
      const diag =
        global.ULC_SAVE && global.ULC_SAVE.diagnose ? "\n\n" + global.ULC_SAVE.diagnose() : "";
      if (global.ULC_SAVE && typeof global.ULC_SAVE.alertPdfFailed === "function") {
        global.ULC_SAVE.alertPdfFailed(e, diag);
      } else if (!(e && e.__ulcAlerted)) {
        alert("PDF failed: " + (e && e.message ? e.message : "Try again.") + diag);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  function buildAwardHtml(students, pageInfo, cols) {
    const st = getStore();
    const c = activeClass();
    if (!c) return "";
    const list = Array.isArray(students) ? students : c.students;
    sortStudentsByRoll(list);
    const teacher = st.officialName || "";
    const full = !cols || !cols.length;
    const set = full ? null : new Set(cols);
    const show = (keys) => {
      if (full) return true;
      return keys.some((k) => set.has(k));
    };
    const showQuizAvg = full || ["q1", "q2", "q3", "q4", "q5"].every((k) => set.has(k));
    const showAssnAvg = full || (set.has("a1") && set.has("a2"));
    const showMidBlock = show(["mid"]);
    const showFinBlock = show(["final"]);
    const showResult = full;
    const blank = "";
    const num = (on, v, d) => (on ? (+v || 0).toFixed(d) : blank);

    const rows = list
      .map((s) => {
        const m = c.marks[s.roll] || emptyMarks();
        const r = calcStudent(m);
        return `<tr>
        <td class="roll">${esc(s.roll)}</td>
        <td class="nm">${esc(String(s.name || "").toUpperCase())}</td>
        <td class="tint">${num(show(["q1"]), m.q1, 1)}</td>
        <td class="tint">${num(show(["q2"]), m.q2, 1)}</td>
        <td class="tint">${num(show(["q3"]), m.q3, 1)}</td>
        <td class="tint">${num(show(["q4"]), m.q4, 1)}</td>
        <td class="tint">${num(show(["q5"]), m.q5, 1)}</td>
        <td class="avg">${num(showQuizAvg, r.quiz, 1)}</td>
        <td class="tint">${num(show(["a1"]), m.a1, 1)}</td>
        <td class="tint">${num(show(["a2"]), m.a2, 1)}</td>
        <td class="avg-a">${num(showAssnAvg, r.assn, 1)}</td>
        <td>${num(showMidBlock, m.mid_obj, 1)}</td>
        <td>${num(showMidBlock, m.mid_sub, 1)}</td>
        <td class="obt">${num(showMidBlock, r.midObt, 2)}</td>
        <td class="pct">${num(showMidBlock, r.mid30, 2)}</td>
        <td>${num(showFinBlock, m.fin_obj, 1)}</td>
        <td>${num(showFinBlock, m.fin_sub, 1)}</td>
        <td class="obt">${num(showFinBlock, r.finObt, 2)}</td>
        <td class="pct-f">${num(showFinBlock, r.fin40, 2)}</td>
        <td class="grand">${num(showResult, r.grand, 2)}</td>
        <td class="rnd">${showResult ? r.rounded : blank}</td>
        <td class="grd">${showResult ? esc(r.grade) : blank}</td>
        <td class="gp">${num(showResult, r.gp, 2)}</td>
        <td class="rem"></td>
      </tr>`;
      })
      .join("");

    /* Pad empty rows so row height matches official sheet density on the page */
    const targetRows = 25;
    let pad = "";
    for (let i = list.length; i < targetRows; i++) {
      pad += `<tr>${"<td>&nbsp;</td>".repeat(24)}</tr>`;
    }

    const sessionLabel = normalizeSession(c.session) || c.session || "";

    return `<div class="award-pdf" id="awardPdfSheet">
      <div class="pdf-title">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="pdf-badge">AWARD LIST</div>
      <div class="meta-lines">
        <div class="row">
          <span class="field grow"><span class="lab">Program Title:</span> <span class="val wide">LL.B. (Five Years) Degree Program</span></span>
          <span class="field"><span class="lab">Session:</span> <span class="val mid">${esc(sessionLabel)}</span></span>
          <span class="field"><span class="lab">Semester:</span> <span class="val">${esc(semOrdinal(c.semester))}</span></span>
          <span class="field"><span class="lab">Course Code:</span> <span class="val mid">${esc(c.subjectCode || "")}</span></span>
          <span class="field"><span class="lab">Credit Hours:</span> <span class="val">${esc(String((+c.creditHours || 3).toFixed(0)))}</span></span>
        </div>
        <div class="row">
          <span class="field grow"><span class="lab">Course Title:</span> <span class="val wide">${esc(c.subject || "")}</span></span>
          <span class="field grow"><span class="lab">Teacher:</span> <span class="val wide">${esc(teacher)}</span></span>
          <span class="field"><span class="lab">Mid Exam Date:</span> <span class="val mid">${esc(c.midExamDate || "")}</span></span>
          <span class="field"><span class="lab">Fin. Exam Date:</span> <span class="val mid">${esc(c.finExamDate || "")}</span></span>
        </div>
      </div>
      <div class="grid-wrap">
      <table class="grid">
        <colgroup>
          <col class="roll"><col class="nm">
          <col class="c-q"><col class="c-q"><col class="c-q"><col class="c-q"><col class="c-q"><col class="c-qa">
          <col class="c-a"><col class="c-a"><col class="c-aa">
          <col class="c-m"><col class="c-m"><col class="c-m"><col class="c-m">
          <col class="c-f"><col class="c-f"><col class="c-f"><col class="c-f">
          <col class="c-g"><col class="c-r"><col class="c-gr"><col class="c-gp"><col class="c-rm">
        </colgroup>
        <thead>
          <tr>
            <th rowspan="4" class="roll">Roll #</th>
            <th rowspan="4" class="nm">Name of Student</th>
            <th colspan="17" class="top">ASSESSMENT</th>
            <th colspan="5" class="top">FINAL RESULT</th>
          </tr>
          <tr>
            <th colspan="6" class="h-q sub">QUIZZES (15%)</th>
            <th colspan="3" class="h-a sub">ASSIGNMENTS (15%)</th>
            <th colspan="4" class="h-m sub">MID SEMESTER (30%)</th>
            <th colspan="4" class="h-f sub">FINAL SEMESTER (40%)</th>
            <th rowspan="3" class="h-r">Grand Marks<br>Out of 100</th>
            <th rowspan="3" class="h-r">Rounded up<br>Makrs</th>
            <th rowspan="3" class="h-r">Grade</th>
            <th rowspan="3" class="h-r">GP</th>
            <th rowspan="3" class="h-r">Remarks</th>
          </tr>
          <tr>
            <th class="h-q lab">Q. 01</th>
            <th class="h-q lab">Q. 02</th>
            <th class="h-q lab">Q. 03</th>
            <th class="h-q lab">Q. 04</th>
            <th class="h-q lab">Q. 05</th>
            <th class="h-q lab">Average</th>
            <th class="h-a lab">A.# 01</th>
            <th class="h-a lab">A.# 02</th>
            <th class="h-a lab">Average</th>
            <th class="h-m lab">Obj<br>Marks</th>
            <th class="h-m lab">Sub<br>Marks</th>
            <th class="h-m lab">Marks Obt.</th>
            <th class="h-m lab">30%<br>Marks</th>
            <th class="h-f lab">Obj<br>Marks</th>
            <th class="h-f lab">Sub<br>Marks</th>
            <th class="h-f lab">Marks Obt.</th>
            <th class="h-f lab">40%<br>Marks</th>
          </tr>
          <tr>
            <th class="h-q leaf">Marks 15</th>
            <th class="h-q leaf">Marks 15</th>
            <th class="h-q leaf">Marks 15</th>
            <th class="h-q leaf">Marks 15</th>
            <th class="h-q leaf">Marks 15</th>
            <th class="h-q leaf">(Of Best Three)</th>
            <th class="h-a leaf">Marks 15</th>
            <th class="h-a leaf">Marks 15</th>
            <th class="h-a leaf"></th>
            <th class="h-m leaf"></th>
            <th class="h-m leaf"></th>
            <th class="h-m leaf">(Out of 100)</th>
            <th class="h-m leaf"></th>
            <th class="h-f leaf"></th>
            <th class="h-f leaf"></th>
            <th class="h-f leaf">(Out of 100)</th>
            <th class="h-f leaf"></th>
          </tr>
        </thead>
        <tbody>${rows}${pad}</tbody>
      </table>
      </div>
    </div>`;
  }

  function pdfFileSlug(cols) {
    const c = activeClass();
    const base = `ULC_${c.subject}_Sem${c.semester}`;
    if (!cols) return `${base}_AwardList`;
    if (cols.length === 1) return `${base}_${cols[0].toUpperCase()}`;
    return `${base}_Marks_${cols.join("-").toUpperCase()}`;
  }

  function chunkStudents(students, size) {
    const list = [...(students || [])];
    sortStudentsByRoll(list);
    if (!list.length) return [[]];
    const chunks = [];
    for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
    return chunks;
  }

  /** Draw canvas onto A4 pages at natural aspect ratio (no row/column stretch). */
  function addCanvasToPdfPages(pdf, canvas, marginMm) {
    const margin = marginMm == null ? 8 : marginMm;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const imgW = usableW;
    const pxPerMm = canvas.width / imgW;
    const pageHeightPx = usableH * pxPerMm;
    let srcY = 0;
    let first = true;
    while (srcY < canvas.height - 0.5) {
      if (!first) pdf.addPage();
      first = false;
      const slicePx = Math.min(pageHeightPx, canvas.height - srcY);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.max(1, Math.ceil(slicePx));
      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, srcY, canvas.width, slicePx,
        0, 0, canvas.width, slicePx
      );
      const sliceHmm = slicePx / pxPerMm;
      pdf.addImage(
        sliceCanvas.toDataURL("image/jpeg", 0.86),
        "JPEG",
        margin,
        margin,
        imgW,
        sliceHmm
      );
      srcY += slicePx;
    }
  }

  async function renderSheetToCanvas(html, partial) {
    const host = document.getElementById("teacherPdfHost");
    /* Official sheet = A4 landscape at 96dpi (297×210mm → 1122×793px) */
    const widthPx = 1122;
    const heightPx = partial ? undefined : 793;
    host.innerHTML = `<style>${awardPdfCss(partial)}</style>` + html;
    host.style.cssText =
      "position:fixed;left:0;top:0;width:" +
      widthPx +
      "px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;overflow:visible;";
    const sheet = document.getElementById("awardPdfSheet");
    if (!sheet) throw new Error("sheet missing");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const opts =
      global.ULC_SAVE && global.ULC_SAVE.captureOpts
        ? global.ULC_SAVE.captureOpts({
            scale: global.ULC_SAVE.captureScale ? global.ULC_SAVE.captureScale(2) : 2,
            width: widthPx,
            windowWidth: widthPx,
            scrollX: 0,
            scrollY: 0,
          })
        : {
            scale: 2,
            backgroundColor: "#ffffff",
            logging: false,
            width: widthPx,
            windowWidth: widthPx,
            scrollX: 0,
            scrollY: 0,
            useCORS: true,
            allowTaint: false,
          };
    if (heightPx) {
      opts.height = heightPx;
      opts.windowHeight = heightPx;
    }
    return global.ULC_SAVE && typeof global.ULC_SAVE.captureElement === "function"
      ? global.ULC_SAVE.captureElement(sheet, opts)
      : global.ULC_SAVE && typeof global.ULC_SAVE.withTimeout === "function"
        ? global.ULC_SAVE.withTimeout(html2canvas(sheet, opts), 45000)
        : html2canvas(sheet, opts);
  }

  function placeCanvasOnA4Landscape(pdf, canvas, marginMm) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const m = marginMm == null ? 8 : marginMm;
    const usableW = pageW - m * 2;
    const usableH = pageH - m * 2;
    const ar = canvas.width / canvas.height;
    let imgW = usableW;
    let imgH = imgW / ar;
    if (imgH > usableH) {
      imgH = usableH;
      imgW = imgH * ar;
    }
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.86), "JPEG", x, y, imgW, imgH);
  }

  async function exportAwardPdf() {
    const c = activeClass();
    if (!c || !c.students.length) {
      alert("Add students and marks first.");
      return;
    }
    const cols = selectedPdfColumns();
    if (cols && !cols.length) {
      alert("Select at least one marks column, or choose Full official award list.");
      return;
    }
    const btn = document.getElementById("tr-pdf-btn");
    const label = btn ? btn.textContent : "Download award list PDF";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating PDF…";
    }
    const host = document.getElementById("teacherPdfHost");
    try {
      if (typeof html2canvas === "undefined" || !(window.jspdf || global.jspdf)) {
        throw new Error("libs");
      }
      const { jsPDF } = window.jspdf || global.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const rowsPerPage = 25;
      const chunks = chunkStudents(c.students, rowsPerPage);
      const pages = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        if (btn) btn.textContent = "Generating PDF… " + (i + 1) + "/" + pages;
        const pageInfo = { page: i + 1, pages };
        const html = buildAwardHtml(chunks[i], pageInfo, cols);
        const canvas = await renderSheetToCanvas(html, false);
        if (i > 0) pdf.addPage();
        placeCanvasOnA4Landscape(pdf, canvas, 8);
      }

      if (global.ULC_SAVE && typeof global.ULC_SAVE.patchJsPdf === "function") {
        global.ULC_SAVE.patchJsPdf();
      }
      const awardName = (pdfFileSlug(cols) + ".pdf").replace(/\s+/g, "_");
      const savedAward =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, awardName)
          : await pdf.save(awardName);
      if (savedAward && savedAward.canceled) return;
      try {
        if (global.MyFiles) {
          const c2 = activeClass();
          const title =
            ((c2 && c2.subject) || "Class") +
            " · " +
            (normalizeSession((c2 && c2.session) || "") || "Session") +
            " · Award list";
          await global.MyFiles.saveAwardAuto(title, "", savedAward);
        }
      } catch (_) {}
    } catch (e) {
      console.error(e);
      const diag =
        global.ULC_SAVE && global.ULC_SAVE.diagnose ? "\n\n" + global.ULC_SAVE.diagnose() : "";
      if (global.ULC_SAVE && typeof global.ULC_SAVE.alertPdfFailed === "function") {
        global.ULC_SAVE.alertPdfFailed(e, diag);
      } else if (!(e && e.__ulcAlerted)) {
        alert("PDF failed: " + (e && e.message ? e.message : "Try again.") + diag);
      }
      if (!(global.ULC_SAVE && global.ULC_SAVE.isNative && global.ULC_SAVE.isNative())) {
        const html = buildAwardHtml(undefined, undefined, cols);
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(
            "<html><head><title>Award List</title><style>" +
              awardPdfCss(false) +
              "@page{size:A4 landscape;margin:8mm}@media print{html,body{margin:0;padding:0}.award-pdf{width:100%!important;height:auto!important;max-width:none}}</style></head><body>" +
              html +
              "</body></html>"
          );
          w.document.close();
          w.focus();
          w.print();
        }
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
      if (host) host.innerHTML = "";
    }
  }

  function awardExcelRows(cols) {
    const st = getStore();
    const c = activeClass();
    if (!c) return { meta: {}, headers: [], rows: [] };
    const full = !cols || !cols.length;
    const set = full ? null : new Set(cols);
    const show = (keys) => (full ? true : keys.some((k) => set.has(k)));
    const showQuizAvg = full || ["q1", "q2", "q3", "q4", "q5"].every((k) => set.has(k));
    const showAssnAvg = full || (set.has("a1") && set.has("a2"));
    const showMid = show(["mid"]);
    const showFin = show(["final"]);
    const showResult = full;
    const cell = (on, v) => (on ? v : "");
    const list = [...c.students];
    sortStudentsByRoll(list);
    const headers = [
      "Roll #", "Name of Student", "Q.01", "Q.02", "Q.03", "Q.04", "Q.05", "Quiz Average (Best 3)",
      "A.#01", "A.#02", "Assignment Average", "Mid Obj", "Mid Sub", "Mid Marks Obt.", "Mid 30%",
      "Fin Obj", "Fin Sub", "Fin Marks Obt.", "Fin 40%", "Grand Marks", "Rounded", "Grade", "GP", "Remarks",
    ];
    const rows = list.map((s) => {
      const m = c.marks[s.roll] || emptyMarks();
      const r = calcStudent(m);
      return [
        s.roll, String(s.name || "").toUpperCase(),
        cell(show(["q1"]), (+m.q1 || 0).toFixed(1)),
        cell(show(["q2"]), (+m.q2 || 0).toFixed(1)),
        cell(show(["q3"]), (+m.q3 || 0).toFixed(1)),
        cell(show(["q4"]), (+m.q4 || 0).toFixed(1)),
        cell(show(["q5"]), (+m.q5 || 0).toFixed(1)),
        cell(showQuizAvg, r.quiz.toFixed(1)),
        cell(show(["a1"]), (+m.a1 || 0).toFixed(1)),
        cell(show(["a2"]), (+m.a2 || 0).toFixed(1)),
        cell(showAssnAvg, r.assn.toFixed(1)),
        cell(showMid, (+m.mid_obj || 0).toFixed(1)),
        cell(showMid, (+m.mid_sub || 0).toFixed(1)),
        cell(showMid, r.midObt.toFixed(2)),
        cell(showMid, r.mid30.toFixed(2)),
        cell(showFin, (+m.fin_obj || 0).toFixed(1)),
        cell(showFin, (+m.fin_sub || 0).toFixed(1)),
        cell(showFin, r.finObt.toFixed(2)),
        cell(showFin, r.fin40.toFixed(2)),
        cell(showResult, r.grand.toFixed(2)),
        cell(showResult, r.rounded),
        cell(showResult, r.grade),
        cell(showResult, r.gp.toFixed(2)),
        "",
      ];
    });
    return {
      meta: {
        program: "LL.B. (Five Years) Degree Program",
        session: normalizeSession(c.session) || c.session || "",
        semester: semOrdinal(c.semester),
        code: c.subjectCode || "",
        ch: String((+c.creditHours || 3).toFixed(0)),
        subject: c.subject || "",
        teacher: st.officialName || "",
        mid: c.midExamDate || "",
        fin: c.finExamDate || "",
      },
      headers,
      rows,
    };
  }

  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function exportAwardExcel() {
    const c = activeClass();
    if (!c || !c.students.length) {
      alert("Add students and marks first.");
      return;
    }
    const cols = selectedPdfColumns();
    if (cols && !cols.length) {
      alert("Select at least one marks column, or choose Full official award list.");
      return;
    }
    const btn = document.getElementById("tr-xls-btn");
    const label = btn ? btn.textContent : "Download Excel";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Preparing Excel…";
    }
    try {
      const data = awardExcelRows(cols);
      const metaRows = [
        ["UNIVERSITY LAW COLLEGE, QUETTA — AWARD LIST"],
        ["Program Title", data.meta.program, "Session", data.meta.session, "Semester", data.meta.semester],
        ["Course Code", data.meta.code, "Credit Hours", data.meta.ch, "Course Title", data.meta.subject],
        ["Teacher", data.meta.teacher, "Mid Exam Date", data.meta.mid, "Fin. Exam Date", data.meta.fin],
        [],
      ];
      const allRows = metaRows.concat([data.headers], data.rows);
      const table = allRows
        .map(function (row) {
          return "<tr>" + row.map(function (cell) { return "<td>" + xmlEsc(cell) + "</td>"; }).join("") + "</tr>";
        })
        .join("");
      const html =
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1">' +
        table +
        "</table></body></html>";
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const fname = (pdfFileSlug(cols) + ".xls").replace(/\s+/g, "_");
      if (global.ULC_SAVE && typeof global.ULC_SAVE.saveBlob === "function") {
        const saved = await global.ULC_SAVE.saveBlob(blob, fname);
        if (saved && saved.canceled) return;
      } else if (global.ULC_SAVE && typeof global.ULC_SAVE.triggerBrowserDownload === "function") {
        global.ULC_SAVE.triggerBrowserDownload(blob, fname);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fname;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      }
    } catch (e) {
      console.error(e);
      alert("Excel export failed: " + (e && e.message ? e.message : "Try again."));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  function injectPdfStyles() {
    if (document.getElementById("teacherUiStyles")) return;
    const s = document.createElement("style");
    s.id = "teacherUiStyles";
    s.textContent = `
      .res-cell{font-weight:700;color:var(--navy);white-space:nowrap;font-size:10px}
      .t-panel{display:none}.t-panel.active{display:block}
      .t-mode-btn.active{background:var(--navy)!important;color:#fff!important;border-color:var(--navy)!important}
    `;
    document.head.appendChild(s);
  }

  function renderTeacherHome() {
    injectPdfStyles();
    const st = getStore();
    const u = global.currentUser && global.currentUser();
    if (!st || !u || u.role !== "teacher") return;
    // Pull shared session students (roll + name only) + keep roll numbers ascending
    st.classes.forEach((cls) => {
      ensureClassMeta(cls);
      importSessionRoster(cls);
      sortStudentsByRoll(cls.students);
      if (cls.session) publishSessionRoster(cls.session, cls.students);
    });
    setStore(st);

    const welcome = document.getElementById("t-welcome");
    if (welcome) welcome.textContent = "Welcome, " + (st.officialName || u.name);
    refreshClassSelect();
    const c = activeClass();
    if (c) ensureClassMeta(c);
    const meta = document.getElementById("t-class-meta");
    if (meta) {
      meta.textContent = c
        ? `Session ${normalizeSession(c.session) || c.session || "—"} · Semester ${c.semester} · ${c.subject}${c.subjectCode ? " (" + c.subjectCode + ")" : ""} · ${c.students.length} students · ${c.totalClasses || DEFAULT_CLASSES} CHR`
        : "No class configured";
    }
    const mid = document.getElementById("tr-mid-date");
    const fin = document.getElementById("tr-fin-date");
    if (c && mid) mid.value = c.midExamDate || "";
    if (c && fin) fin.value = c.finExamDate || "";
    const tc = document.getElementById("tr-total-classes");
    if (c && tc) tc.value = c.totalClasses || DEFAULT_CLASSES;
    if (c) {
      document.getElementById("att-tog-daily")?.classList.toggle("active", c.attMode !== "weekly");
      document.getElementById("att-tog-weekly")?.classList.toggle("active", c.attMode === "weekly");
    }
    renderOverview();
    renderRoster();
    renderAttendance();
    renderMarks();
    syncHomeOverview();
    showTeacherPanel("overview");
  }

  function saveClassDates() {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass()?.id);
    if (!c) return;
    c.midExamDate = document.getElementById("tr-mid-date").value;
    c.finExamDate = document.getElementById("tr-fin-date").value;
    setStore(st);
  }

  async function initTeacherView() {
    injectPdfStyles();
    await pullTeacherWorkspace(false);
    const st = getStore();
    if (!st) return;
    if (!st.profileComplete || !st.classes.length) openTeacherSetup(false);
    else renderTeacherHome();
  }

  global.TeacherApp = {
    openTeacherSetup,
    closeTeacherSetup,
    saveTeacherSetup,
    addAnotherClass,
    fillTeacherSubjList,
    onTeacherSubjChange,
    onClassChange,
    showTeacherPanel,
    addStudentManual,
    editStudent,
    cancelEditStudent,
    removeStudent,
    ocrAttendancePhoto,
    uploadRosterFile,
    onRosterFileChosen,
    analyzeRosterFile,
    confirmOcrStudents,
    clearOcrPreview,
    setAttMode,
    setTotalClasses,
    cycleDaily,
    setWeeklyPresent,
    setMark,
    renderMarks,
    exportAwardPdf,
    exportAwardExcel,
    exportAttendancePdf,
    onPdfModeChange,
    initTeacherView,
    renderTeacherHome,
    pullTeacherWorkspace,
    pushTeacherWorkspace,
    syncHomeOverview,
    saveClassDates,
    getStore,
    activeClass,
    resetSession: function () { cloudPullDone = false; },
    notifyFilesChanged: () => scheduleTeacherCloudSync(getStore()),
  };
})(window);
