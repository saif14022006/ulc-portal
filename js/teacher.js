/* ULC Portal — Teacher workspace
   Classes, roster (OCR), attendance, marks, award-list PDF.
   Data stays on the teacher account only (localStorage).
*/
(function (global) {
  const LS_TEACHER = "ulc_teacher_data_v1";
  const LS_SEM_ROSTER = "ulc_semester_rosters_v1";
  const DEFAULT_CLASSES = 30;
  const ORD = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  function semLabel(n) { return n ? ("Semester " + n) : "—"; }

  let pendingOcr = [];

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
    all[key] = data;
    saveJSON(LS_TEACHER, all);
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

  /* Shared semester roster — roll + name only, across teachers of same semester */
  function getSemesterRoster(sem) {
    const all = loadJSON(LS_SEM_ROSTER, {});
    return Array.isArray(all[String(sem)]) ? all[String(sem)] : [];
  }
  function publishSemesterRoster(sem, students) {
    const all = loadJSON(LS_SEM_ROSTER, {});
    const key = String(sem);
    const map = new Map((all[key] || []).map((s) => [s.roll, s]));
    (students || []).forEach((s) => {
      if (!s?.roll || !s?.name) return;
      map.set(s.roll, { roll: String(s.roll).toUpperCase(), name: String(s.name).toUpperCase() });
    });
    all[key] = [...map.values()].sort((a, b) => {
      const na = parseInt(String(a.roll).replace(/\D/g, ""), 10);
      const nb = parseInt(String(b.roll).replace(/\D/g, ""), 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true });
    });
    saveJSON(LS_SEM_ROSTER, all);
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
  function importSemesterRoster(cls) {
    ensureClassMeta(cls);
    const shared = getSemesterRoster(cls.semester);
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
    publishSemesterRoster(c.semester, c.students);
    setStore(st);
    return added;
  }

  function showTeacherPanel(panel) {
    document.querySelectorAll(".t-panel").forEach((p) => p.classList.remove("active"));
    const el = document.getElementById("tp-" + panel);
    if (el) el.classList.add("active");
    document.querySelectorAll(".t-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.panel === panel));
  }

  function refreshClassSelect() {
    const st = getStore();
    const sel = document.getElementById("t-class-sel");
    if (!sel || !st) return;
    sel.innerHTML = st.classes.map((c) =>
      `<option value="${c.id}" ${c.id === st.activeClassId ? "selected" : ""}>Sem ${c.semester} · ${esc(c.subject)}</option>`
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
    document.getElementById("ob-t-subj").value = "";
    document.getElementById("ob-t-code").value = "";
    document.getElementById("ob-t-ch").value = "3";
    document.getElementById("ob-t-session").value = "2025-2029";
    fillTeacherSubjList();
    document.getElementById("teacherSetupOverlay").classList.add("show");
  }
  function closeTeacherSetup() {
    document.getElementById("teacherSetupOverlay").classList.remove("show");
  }
  function fillTeacherSubjList() {
    const n = document.getElementById("ob-t-sem").value;
    const list = (global.SYLLABUS && global.SYLLABUS[n]) || [];
    document.getElementById("ob-t-subj-list").innerHTML = list.map((x) => `<option value="${esc(x[1])}">`).join("");
  }
  function saveTeacherSetup() {
    const st = getStore();
    if (!st) return;
    const name = document.getElementById("ob-t-name").value.trim();
    const semester = +document.getElementById("ob-t-sem").value || 3;
    const subject = document.getElementById("ob-t-subj").value.trim();
    let subjectCode = document.getElementById("ob-t-code").value.trim();
    const creditHours = parseFloat(document.getElementById("ob-t-ch").value) || 3;
    const session = document.getElementById("ob-t-session").value.trim() || "2025-2029";
    if (!name || !subject) { alert("Enter official name and subject."); return; }

    const hit = ((global.SYLLABUS || {})[semester] || []).find((x) => x[1] === subject);
    if (hit && !subjectCode) subjectCode = hit[0];

    const dup = st.classes.some(
      (c) => c.semester === semester && c.subject.toLowerCase() === subject.toLowerCase()
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
    importSemesterRoster(cls);

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
  }

  function addAnotherClass() {
    document.getElementById("teacherSetupOverlay").dataset.mode = "addClass";
    openTeacherSetup(true);
  }

  function addStudentManual() {
    const c = activeClass();
    if (!c) { alert("Create a class first."); return; }
    const roll = document.getElementById("tr-roll").value.trim().toUpperCase();
    const name = document.getElementById("tr-name").value.trim().toUpperCase();
    if (!roll || !name) { alert("Enter roll number and name."); return; }
    const added = addStudentsToClass([{ roll, name }]);
    if (!added) { alert("This roll is already in the class."); return; }
    document.getElementById("tr-roll").value = "";
    document.getElementById("tr-name").value = "";
    renderRoster();
    renderAttendance();
    renderMarks();
  }

  function removeStudent(roll) {
    if (!confirm("Remove " + roll + " from this class?")) return;
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    c.students = c.students.filter((s) => s.roll !== roll);
    delete c.attendance[roll];
    delete c.marks[roll];
    setStore(st);
    renderRoster();
    renderAttendance();
    renderMarks();
  }

  function isHeaderNoise(s) {
    return /WEEK|ATTENDANCE|ROLL|NAME|SERIAL|TOTAL|UNIVERSITY|COLLEGE|SEMESTER|SUBJECT|FATHER|S\/O|D\/O|SIGNATURE|PRESENT|ABSENT|CLASS|CHR/.test(s);
  }
  function looksLikeRoll(tok) {
    return /^(\d{3,6})([A-Za-z])?$/.test(String(tok || "").replace(/\s/g, ""));
  }
  function cleanName(s) {
    return String(s || "")
      .replace(/[^A-Za-z .']/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }
  /** Read only first two data columns: Roll # + Name */
  function parseRosterText(text) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      if (isHeaderNoise(line.toUpperCase())) continue;

      // Prefer tab / multi-space columns (sheet layout)
      let cols = line.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) cols = line.split(/\s+/).filter(Boolean);

      let roll = "";
      let name = "";

      if (cols.length >= 2) {
        // Skip leading serial (1, 2, 01…) when next token is the roll
        let i = 0;
        if (/^\d{1,2}$/.test(cols[0]) && looksLikeRoll(cols[1])) i = 1;
        if (looksLikeRoll(cols[i])) {
          roll = cols[i].replace(/\s/g, "").toUpperCase();
          name = cleanName(cols.slice(i + 1).join(" "));
        }
      }

      if (!roll || !name) {
        const m = line.match(/\b(\d{3,6}[A-Za-z]?)\b\s+([A-Za-z][A-Za-z .']{2,})/);
        if (m) {
          roll = m[1].toUpperCase();
          name = cleanName(m[2]);
        }
      }

      if (!roll || !name || name.length < 3 || seen.has(roll)) continue;
      if (isHeaderNoise(name)) continue;
      // Keep name to first ~5 words (ignore trailing marks columns OCR noise)
      name = name.split(" ").slice(0, 5).join(" ");
      seen.add(roll);
      out.push({ roll, name });
    }
    return out;
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
      `Saved ${added} new student(s). Shared with other teachers of Semester ${activeClass()?.semester}.`;
    clearOcrPreview();
    renderRoster();
    renderAttendance();
    renderMarks();
  }

  async function ocrAttendancePhoto(file) {
    const status = document.getElementById("tr-ocr-status");
    if (!file) return;
    if (typeof Tesseract === "undefined") {
      status.textContent = "OCR library not loaded. Check your internet connection.";
      return;
    }
    status.textContent = "Reading attendance photo (roll + name columns)…";
    clearOcrPreview();
    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress != null) {
            status.textContent = "Reading… " + Math.round(m.progress * 100) + "%";
          }
        },
      });
      const raw = result.data.text || "";
      const parsed = parseRosterText(raw);
      if (!parsed.length) {
        status.textContent = "Could not detect roll/name in the first two columns. Try a clearer photo, or add manually.";
        console.log("OCR raw text:", raw);
        return;
      }
      pendingOcr = parsed;
      status.textContent = `Detected ${parsed.length} student(s) from columns 1–2. Untick any mistakes, then add.`;
      renderOcrPreview(parsed);
    } catch (e) {
      console.error(e);
      status.textContent = "OCR failed. Please add students manually.";
    }
  }

  function renderRoster() {
    const c = activeClass();
    const el = document.getElementById("tr-roster");
    if (!el) return;
    if (!c || !c.students.length) {
      el.innerHTML = '<div class="empty">No students yet. Upload a list photo or add manually.</div>';
      return;
    }
    sortStudentsByRoll(c.students);
    el.innerHTML = c.students.map((s) => `
      <div class="award-item">
        <div><div class="t">${esc(s.roll)}</div><div class="m">${esc(s.name)}</div></div>
        <button type="button" onclick="TeacherApp.removeStudent('${esc(s.roll)}')">Remove</button>
      </div>`).join("");
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

  function awardPdfCss(partial) {
    return `
      body{font-family:Times New Roman,serif;font-size:9px;color:#000;margin:8px}
      .pdf-title{text-align:center;font-size:16px;font-weight:700}
      .pdf-badge{text-align:center;font-weight:700;border:2px solid #000;padding:2px 18px;margin:6px auto;display:block;width:fit-content}
      .meta{width:100%;border-collapse:collapse;margin:8px 0}
      .meta td{border:1px solid #333;padding:3px 6px;font-size:9px}
      .grid{width:100%;border-collapse:collapse}
      .grid th,.grid td{border:1px solid #222;padding:${partial ? "6px 4px" : "2px 1px"};text-align:center;font-size:${partial ? "10px" : "7.2px"}}
      .grid .nm{text-align:left;padding-left:3px;font-size:${partial ? "10px" : "7px"}}
      .h-q{background:#d9d9d9}.h-a{background:#bdd7ee}.h-m{background:#c6efce}.h-f{background:#ffe699}.h-r{background:#f8cbad}
      .avg{background:#eee;font-weight:700}.pct{background:#e2efda}.grand{background:#ddebf7;font-weight:700}.rnd{background:#fce4d6;font-weight:700}
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

  function buildPartialMarksHtml(cols) {
    const st = getStore();
    const c = activeClass();
    if (!c) return "";
    sortStudentsByRoll(c.students);
    const teacher = st.officialName || "";
    const metaCols = cols.map((k) => PDF_COL_META[k]).filter(Boolean);
    if (!metaCols.length) return "";

    const head = metaCols.map((col) =>
      `<th class="${col.cls}">${esc(col.label)}<br>${esc(col.sub)}</th>`
    ).join("");

    const rows = c.students.map((s) => {
      const m = c.marks[s.roll] || emptyMarks();
      const cells = metaCols.map((col) => {
        let v = +m[col.key] || 0;
        if (col.key === "mid") v = Math.min(100, +m.mid || ((+m.mid_obj || 0) + (+m.mid_sub || 0)));
        if (col.key === "final") v = Math.min(100, +m.final || ((+m.fin_obj || 0) + (+m.fin_sub || 0)));
        return `<td>${v.toFixed(1)}</td>`;
      }).join("");
      return `<tr><td>${esc(s.roll)}</td><td class="nm">${esc(s.name)}</td>${cells}</tr>`;
    }).join("");

    const badge = pdfTitleForColumns(cols);
    return `<div class="award-pdf" id="awardPdfSheet">
      <div class="pdf-title">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="pdf-badge">${esc(badge)}</div>
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
            <th>Roll #</th>
            <th>Name of Student</th>
            ${head}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function buildAwardHtml() {
    const st = getStore();
    const c = activeClass();
    if (!c) return "";
    sortStudentsByRoll(c.students);
    const teacher = st.officialName || "";
    const rows = c.students.map((s) => {
      const m = c.marks[s.roll] || emptyMarks();
      const r = calcStudent(m);
      return `<tr>
        <td>${esc(s.roll)}</td><td class="nm">${esc(s.name)}</td>
        <td>${(+m.q1 || 0).toFixed(1)}</td><td>${(+m.q2 || 0).toFixed(1)}</td><td>${(+m.q3 || 0).toFixed(1)}</td><td>${(+m.q4 || 0).toFixed(1)}</td><td>${(+m.q5 || 0).toFixed(1)}</td>
        <td class="avg">${r.quiz.toFixed(1)}</td>
        <td>${(+m.a1 || 0).toFixed(1)}</td><td>${(+m.a2 || 0).toFixed(1)}</td>
        <td class="avg">${r.assn.toFixed(1)}</td>
        <td>${(+m.mid_obj || 0).toFixed(1)}</td><td>${(+m.mid_sub || 0).toFixed(1)}</td><td>${r.midObt.toFixed(2)}</td><td class="pct">${r.mid30.toFixed(2)}</td>
        <td>${(+m.fin_obj || 0).toFixed(1)}</td><td>${(+m.fin_sub || 0).toFixed(1)}</td><td>${r.finObt.toFixed(2)}</td><td class="pct">${r.fin40.toFixed(2)}</td>
        <td class="grand">${r.grand.toFixed(2)}</td><td class="rnd">${r.rounded}</td><td>${r.grade}</td><td>${r.gp.toFixed(2)}</td><td></td>
      </tr>`;
    }).join("");

    return `<div class="award-pdf" id="awardPdfSheet">
      <div class="pdf-title">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="pdf-badge">AWARD LIST</div>
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
          <td><b>Mid Exam Date:</b> ${esc(c.midExamDate || "")}</td>
          <td><b>Fin. Exam Date:</b> ${esc(c.finExamDate || "")}</td>
        </tr>
      </table>
      <table class="grid">
        <thead>
          <tr>
            <th rowspan="3">Roll #</th>
            <th rowspan="3">Name of Student</th>
            <th colspan="17">ASSESSMENT</th>
            <th colspan="5">FINAL RESULT</th>
          </tr>
          <tr>
            <th colspan="6" class="h-q">QUIZZES (15%)</th>
            <th colspan="3" class="h-a">ASSIGNMENTS (15%)</th>
            <th colspan="4" class="h-m">MID SEMESTER (30%)</th>
            <th colspan="4" class="h-f">FINAL SEMESTER (40%)</th>
            <th rowspan="2" class="h-r">Grand Marks<br>(Out of 100)</th>
            <th rowspan="2" class="h-r">Rounded<br>Marks</th>
            <th rowspan="2" class="h-r">Grade</th>
            <th rowspan="2" class="h-r">GP</th>
            <th rowspan="2" class="h-r">Remarks</th>
          </tr>
          <tr>
            <th class="h-q">Q#01<br>/15</th><th class="h-q">Q#02<br>/15</th><th class="h-q">Q#03<br>/15</th><th class="h-q">Q#04<br>/15</th><th class="h-q">Q#05<br>/15</th><th class="h-q">Average<br>(Best 3)</th>
            <th class="h-a">A#01<br>/15</th><th class="h-a">A#02<br>/15</th><th class="h-a">Average</th>
            <th class="h-m">Obj</th><th class="h-m">Sub</th><th class="h-m">Marks Obt<br>/100</th><th class="h-m">30%</th>
            <th class="h-f">Obj</th><th class="h-f">Sub</th><th class="h-f">Marks Obt<br>/100</th><th class="h-f">40%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function pdfFileSlug(cols) {
    const c = activeClass();
    const base = `ULC_${c.subject}_Sem${c.semester}`;
    if (!cols) return `${base}_AwardList`;
    if (cols.length === 1) return `${base}_${cols[0].toUpperCase()}`;
    return `${base}_Marks_${cols.join("-").toUpperCase()}`;
  }

  async function exportAwardPdf() {
    const c = activeClass();
    if (!c || !c.students.length) { alert("Add students and marks first."); return; }
    const cols = selectedPdfColumns();
    if (cols && !cols.length) {
      alert("Select at least one marks column, or choose Full official award list.");
      return;
    }
    const partial = !!(cols && cols.length);
    const html = partial ? buildPartialMarksHtml(cols) : buildAwardHtml();
    const host = document.getElementById("teacherPdfHost");
    host.innerHTML = `<style>${awardPdfCss(partial)}</style>` + html;
    host.style.cssText = "position:fixed;left:-99999px;top:0;width:" + (partial ? "900" : "1400") + "px;background:#fff;";
    const sheet = document.getElementById("awardPdfSheet");
    const btn = document.getElementById("tr-pdf-btn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating PDF…";
    try {
      if (typeof html2canvas === "undefined" || !window.jspdf) throw new Error("libs");
      const canvas = await html2canvas(sheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        width: partial ? 900 : 1400,
        windowWidth: partial ? 900 : 1400,
      });
      const { jsPDF } = window.jspdf;
      const orient = partial && cols.length <= 3 ? "portrait" : "landscape";
      const pdf = new jsPDF({ orientation: orient, unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 10;
      const imgH = (canvas.height * imgW) / canvas.width;
      const useH = Math.min(imgH, pageH - 10);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 5, 5, imgW, useH);
      pdf.save((pdfFileSlug(cols) + ".pdf").replace(/\s+/g, "_"));
    } catch (e) {
      console.error(e);
      const w = window.open("", "_blank");
      w.document.write(`<html><head><title>Marks PDF</title><style>${awardPdfCss(partial)}</style></head><body>${html}</body></html>`);
      w.document.close();
      w.focus();
      w.print();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      host.innerHTML = "";
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
    // Pull shared semester students (roll + name only) + keep roll numbers ascending
    st.classes.forEach((cls) => {
      ensureClassMeta(cls);
      importSemesterRoster(cls);
      sortStudentsByRoll(cls.students);
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
        ? `Semester ${c.semester} · ${c.subject}${c.subjectCode ? " (" + c.subjectCode + ")" : ""} · ${c.students.length} students · ${c.totalClasses || DEFAULT_CLASSES} CHR`
        : "No class configured";
    }
    const mid = document.getElementById("tr-mid-date");
    const fin = document.getElementById("tr-fin-date");
    if (c && mid) mid.value = c.midExamDate || "";
    if (c && fin) fin.value = c.finExamDate || "";
    if (c) {
      document.getElementById("att-tog-daily")?.classList.toggle("active", c.attMode !== "weekly");
      document.getElementById("att-tog-weekly")?.classList.toggle("active", c.attMode === "weekly");
    }
    renderRoster();
    renderAttendance();
    renderMarks();
  }

  function saveClassDates() {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass()?.id);
    if (!c) return;
    c.midExamDate = document.getElementById("tr-mid-date").value;
    c.finExamDate = document.getElementById("tr-fin-date").value;
    setStore(st);
  }

  function initTeacherView() {
    injectPdfStyles();
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
    onClassChange,
    showTeacherPanel,
    addStudentManual,
    removeStudent,
    ocrAttendancePhoto,
    confirmOcrStudents,
    clearOcrPreview,
    setAttMode,
    setTotalClasses,
    cycleDaily,
    setWeeklyPresent,
    setMark,
    renderMarks,
    exportAwardPdf,
    onPdfModeChange,
    initTeacherView,
    renderTeacherHome,
    saveClassDates,
    getStore,
    activeClass,
  };
})(window);
