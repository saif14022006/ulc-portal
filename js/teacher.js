/* ULC Portal — Teacher workspace
   Classes, roster (OCR), attendance, marks, award-list PDF.
   Data stays on the teacher account only (localStorage).
*/
(function (global) {
  const LS_TEACHER = "ulc_teacher_data_v1";
  const WEEKS = 16;
  const ORD = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  function semLabel(n) { return n ? ("Semester " + n) : "—"; }

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
    const o = {};
    for (let i = 1; i <= WEEKS; i++) o["w" + i] = "";
    return o;
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
      students: [],
      attendance: {},
      marks: {},
    };

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
    const st = getStore();
    const cls = st.classes.find((x) => x.id === c.id);
    if (cls.students.some((s) => s.roll === roll)) { alert("This roll is already in the class."); return; }
    cls.students.push({ roll, name });
    cls.students.sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
    cls.attendance[roll] = emptyAttendance();
    cls.marks[roll] = emptyMarks();
    setStore(st);
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

  function parseRosterText(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const line of lines) {
      let m = line.match(/^(\d{3,5}(?:-[A-Za-z])?)\s+([A-Za-z][A-Za-z .']{2,})$/);
      if (!m) m = line.match(/\b(\d{3,5}(?:-[A-Za-z])?)\b.*?([A-Z][A-Z ]{3,})/);
      if (!m) continue;
      const roll = m[1].toUpperCase();
      const name = m[2].replace(/\s+/g, " ").trim().toUpperCase();
      if (seen.has(roll) || name.length < 3) continue;
      if (/WEEK|ATTENDANCE|ROLL|NAME|SERIAL|TOTAL|UNIVERSITY|COLLEGE/.test(name)) continue;
      seen.add(roll);
      out.push({ roll, name });
    }
    return out;
  }

  async function ocrAttendancePhoto(file) {
    const status = document.getElementById("tr-ocr-status");
    if (!file) return;
    if (typeof Tesseract === "undefined") {
      status.textContent = "OCR library not loaded. Check your internet connection.";
      return;
    }
    status.textContent = "Reading attendance photo… this may take a moment.";
    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress != null) {
            status.textContent = "Reading… " + Math.round(m.progress * 100) + "%";
          }
        },
      });
      const parsed = parseRosterText(result.data.text || "");
      if (!parsed.length) {
        status.textContent = "No roll/name pairs found. Try a clearer photo or add students manually.";
        return;
      }
      const st = getStore();
      const c = st.classes.find((x) => x.id === activeClass().id);
      let added = 0;
      for (const s of parsed) {
        if (c.students.some((x) => x.roll === s.roll)) continue;
        c.students.push(s);
        c.attendance[s.roll] = emptyAttendance();
        c.marks[s.roll] = emptyMarks();
        added++;
      }
      c.students.sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
      setStore(st);
      status.textContent = `Found ${parsed.length} · added ${added} new students. Review the list and fix OCR mistakes.`;
      renderRoster();
      renderAttendance();
      renderMarks();
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
      el.innerHTML = '<div class="empty">No students yet. Upload an attendance photo or add manually.</div>';
      return;
    }
    el.innerHTML = c.students.map((s) => `
      <div class="award-item">
        <div><div class="t">${esc(s.roll)}</div><div class="m">${esc(s.name)}</div></div>
        <button type="button" onclick="TeacherApp.removeStudent('${esc(s.roll)}')">Remove</button>
      </div>`).join("");
  }

  function setAtt(roll, week, val) {
    const st = getStore();
    const c = st.classes.find((x) => x.id === activeClass().id);
    if (!c.attendance[roll]) c.attendance[roll] = emptyAttendance();
    c.attendance[roll]["w" + week] = val;
    setStore(st);
  }

  function renderAttendance() {
    const c = activeClass();
    const el = document.getElementById("tr-att-table");
    if (!el) return;
    if (!c || !c.students.length) {
      el.innerHTML = '<div class="empty">Add students first.</div>';
      return;
    }
    const head = Array.from({ length: WEEKS }, (_, i) => `<th>W${i + 1}</th>`).join("");
    const rows = c.students.map((s) => {
      const att = c.attendance[s.roll] || emptyAttendance();
      const cells = Array.from({ length: WEEKS }, (_, i) => {
        const w = i + 1;
        const v = att["w" + w] || "";
        return `<td><select class="att-sel" onchange="TeacherApp.setAtt('${esc(s.roll)}',${w},this.value)">
          <option value="" ${v === "" ? "selected" : ""}>—</option>
          <option value="P" ${v === "P" ? "selected" : ""}>P</option>
          <option value="A" ${v === "A" ? "selected" : ""}>A</option>
          <option value="L" ${v === "L" ? "selected" : ""}>L</option>
        </select></td>`;
      }).join("");
      return `<tr><td class="sticky-col"><b>${esc(s.roll)}</b><br><small>${esc(s.name)}</small></td>${cells}</tr>`;
    }).join("");
    el.innerHTML = `<div class="scroll-x"><table class="data-table"><thead><tr><th class="sticky-col">Student</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint">P = Present · A = Absent · L = Leave · Weeks 1–${WEEKS}</p>`;
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

    el.innerHTML = `<div class="scroll-x"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
      .scroll-x{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
      .data-table{border-collapse:collapse;min-width:900px;width:100%;font-size:12px}
      .data-table th,.data-table td{border-bottom:1px solid #eee;padding:6px 4px;text-align:center;vertical-align:middle}
      .data-table th{background:#f5f2ea;font-size:11px;color:var(--navy)}
      .sticky-col{position:sticky;left:0;background:#fff;text-align:left!important;min-width:110px;z-index:1}
      .att-sel,.mk{width:52px;padding:4px 2px;font-size:12px;border:1px solid #ddd;border-radius:6px;text-align:center}
      .mk{width:58px}
      .res-cell{font-weight:700;color:var(--navy);white-space:nowrap;font-size:11px}
      .t-panel{display:none}.t-panel.active{display:block}
      .t-mode-btn.active{background:var(--navy)!important;color:#fff!important;border-color:var(--navy)!important}
      .teacher-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
    `;
    document.head.appendChild(s);
  }

  function renderTeacherHome() {
    injectPdfStyles();
    const st = getStore();
    const u = global.currentUser && global.currentUser();
    if (!st || !u || u.role !== "teacher") return;
    const welcome = document.getElementById("t-welcome");
    if (welcome) welcome.textContent = "Welcome, " + (st.officialName || u.name);
    refreshClassSelect();
    const c = activeClass();
    const meta = document.getElementById("t-class-meta");
    if (meta) {
      meta.textContent = c
        ? `Semester ${c.semester} · ${c.subject}${c.subjectCode ? " (" + c.subjectCode + ")" : ""} · ${c.students.length} students`
        : "No class configured";
    }
    // dates
    const mid = document.getElementById("tr-mid-date");
    const fin = document.getElementById("tr-fin-date");
    if (c && mid) mid.value = c.midExamDate || "";
    if (c && fin) fin.value = c.finExamDate || "";
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
    setAtt,
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
