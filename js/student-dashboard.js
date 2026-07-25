/* Student dashboard: profile, semester records, transcript, GPA analysis, FAQ chat */
(function (global) {
  "use strict";

  const LS_PROFILE = "ulc_student_profile_v1";
  const LS_RECORDS = "ulc_semester_records_v1";
  const ORD = ["", "1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

  let activeDashTab = "profile";
  let editingSem = 1;
  let authFlowOpen = false;
  let guestBrowsing = false;

  function esc(s) {
    return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  }
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
  function gpFromRounded(m) {
    if (global.ULC_MATH?.gpFromRounded) return ULC_MATH.gpFromRounded(m);
    m = Math.round(+m || 0);
    if (m >= 80) return 4.0;
    if (m < 50) return 0.0;
    return Math.round((m - 40) * 10) / 100;
  }
  function letterFromRounded(m) {
    if (global.ULC_MATH?.letterFromRounded) return ULC_MATH.letterFromRounded(m);
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
  function calcSemesterGpa(courses) {
    if (global.ULC_MATH?.calcSemesterGpa) return ULC_MATH.calcSemesterGpa(courses);
    let points = 0, ch = 0, obtained = 0;
    for (const c of courses || []) {
      points += (+c.gp || 0) * (+c.ch || 0);
      ch += +c.ch || 0;
      obtained += +c.marks || 0;
    }
    const max = (courses || []).length * 100;
    return { gpa: ch ? points / ch : 0, pct: max ? (obtained / max) * 100 : 0, obtained, ch, max };
  }

  function accountKey(u) {
    if (!u) return null;
    const email = String(u.email || "").trim().toLowerCase();
    if (email) return email;
    return String(u.roll || "").trim().toUpperCase() || null;
  }

  function getProfileStore() {
    return loadJSON(LS_PROFILE, {});
  }
  function getRecordStore() {
    return loadJSON(LS_RECORDS, {});
  }
  function getProfile(u) {
    const key = accountKey(u);
    if (!key) return {};
    return getProfileStore()[key] || {};
  }
  function setProfile(u, data) {
    const key = accountKey(u);
    if (!key) return;
    const all = getProfileStore();
    all[key] = { ...(all[key] || {}), ...data, updatedAt: Date.now() };
    saveJSON(LS_PROFILE, all);
  }
  function patchProfile(data) {
    const u = typeof currentUser === "function" ? currentUser() : null;
    if (!u || u.role === "teacher") return;
    setProfile(u, data);
  }
  function getRecords(u) {
    const key = accountKey(u);
    if (!key) return {};
    return getRecordStore()[key] || {};
  }
  function setRecords(u, data) {
    const key = accountKey(u);
    if (!key) return;
    const all = getRecordStore();
    all[key] = data;
    saveJSON(LS_RECORDS, all);
  }

  function syllabus() {
    return global.SYLLABUS || {};
  }

  function coursesFromSyllabus(sem) {
    const list = syllabus()[sem] || [];
    return list.map((x) => ({
      code: x[0],
      title: x[1],
      ch: x[2],
      marks: "",
      gp: null,
      grade: "",
    }));
  }

  /* -------- Landing -------- */
  function hideLandingGate() {
    const gate = document.getElementById("landingGate");
    if (!gate) return;
    gate.classList.remove("show");
    gate.setAttribute("aria-hidden", "true");
    document.body.classList.remove("landing-open");
  }

  function markGuestBrowsing() {
    guestBrowsing = true;
    authFlowOpen = false;
  }

  function syncLanding() {
    const gate = document.getElementById("landingGate");
    if (!gate) return;
    const u = typeof currentUser === "function" ? currentUser() : null;
    if (u) {
      authFlowOpen = false;
      guestBrowsing = false;
      hideLandingGate();
      return;
    }
    const onHome = document.getElementById("v-home")?.classList.contains("active");
    /* Guest home → scrollable landing (hero + features). Any other view keeps app chrome. */
    const show = onHome && !authFlowOpen && !guestBrowsing;
    if (show) {
      gate.classList.add("show");
      gate.setAttribute("aria-hidden", "false");
      document.body.classList.add("landing-open");
      gate.scrollTop = 0;
    } else {
      hideLandingGate();
    }
  }

  function openAuthFromLanding(which) {
    authFlowOpen = true;
    guestBrowsing = false;
    hideLandingGate();
    if (typeof setAuthTab === "function") setAuthTab(which === "signup" ? "signup" : "login");
    if (typeof go === "function") go("account");
  }

  function openToolFromLanding(tool) {
    markGuestBrowsing();
    hideLandingGate();
    if (typeof go === "function") go(tool || "syllabus");
  }

  function resetLandingForGuestHome() {
    authFlowOpen = false;
    guestBrowsing = false;
    syncLanding();
  }

  /* -------- Home shell -------- */
  function refreshHomeShell() {
    const u = typeof currentUser === "function" ? currentUser() : null;
    const guest = document.getElementById("homeGuest");
    const student = document.getElementById("homeStudent");
    const teacher = document.getElementById("homeTeacher");
    if (!guest || !student) return;

    if (!u) {
      guest.style.display = "";
      student.style.display = "none";
      if (teacher) teacher.style.display = "none";
      return;
    }
    if (u.role === "teacher") {
      guest.style.display = "none";
      student.style.display = "none";
      if (teacher) {
        teacher.style.display = "";
        const t = document.getElementById("homeTeacherTitle");
        const s = document.getElementById("homeTeacherSub");
        if (t) t.textContent = "Welcome " + u.name;
        if (s) s.textContent = (u.email || "Teacher") + " · Open Teacher desk for classes and award lists.";
      }
      return;
    }

    guest.style.display = "none";
    if (teacher) teacher.style.display = "none";
    student.style.display = "";
    const title = document.getElementById("dashWelcomeTitle");
    const sub = document.getElementById("dashWelcomeSub");
    if (title) title.textContent = "Welcome, " + (u.name || "Student");
    if (sub) {
      const p = getProfile(u);
      const sem = p.currentSemester || u.currentSemester;
      sub.textContent =
        (u.email || "Roll " + u.roll) +
        (sem ? " · Semester " + sem : "") +
        " · Your student dashboard";
    }
    setDashTab(activeDashTab, true);
  }

  function setDashTab(tab, force) {
    if (!force && activeDashTab === tab) return;
    activeDashTab = tab || "profile";
    document.querySelectorAll(".dash-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.dash === activeDashTab);
    });
    document.querySelectorAll(".dash-panel").forEach((p) => {
      p.classList.toggle("active", p.id === "dash-" + activeDashTab);
    });
    if (activeDashTab === "profile") renderProfile();
    if (activeDashTab === "records") renderRecords();
    if (activeDashTab === "gpa") renderGpaAnalysis();
    if (activeDashTab === "chat") renderChatWelcome();
  }

  /* -------- Profile -------- */
  function renderProfile() {
    const u = currentUser();
    if (!u || u.role === "teacher") return;
    const p = getProfile(u);
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? "" : v;
    };
    set("sp-name", u.name || "");
    set("sp-roll", u.roll || "");
    set("sp-father", p.fatherName || "");
    set("sp-cnic", p.cnic || "");
    set("sp-dob", p.dob || "");
    set("sp-reg", p.registrationNo || "");
    set("sp-session", p.session || u.session || "");
    set("sp-program", p.program || "LL.B Five Year");
    const semSel = document.getElementById("sp-sem");
    if (semSel && !semSel.dataset.ready) {
      semSel.innerHTML = Object.keys(syllabus())
        .map((n) => `<option value="${n}">Semester ${n}</option>`)
        .join("");
      semSel.dataset.ready = "1";
    }
    if (semSel) semSel.value = String(p.currentSemester || u.currentSemester || 1);
    const img = document.getElementById("sp-photo-preview");
    if (img) {
      if (p.photo) {
        img.src = p.photo;
        img.style.display = "";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
      }
    }
    const msg = document.getElementById("sp-msg");
    if (msg) msg.className = "msg";
  }

  function onPhotoSelected(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        let w = img.width,
          h = img.height;
        if (w > h && w > max) {
          h = Math.round((h * max) / w);
          w = max;
        } else if (h > max) {
          w = Math.round((w * max) / h);
          h = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL("image/jpeg", 0.72);
        const preview = document.getElementById("sp-photo-preview");
        if (preview) {
          preview.src = data;
          preview.style.display = "";
          preview.dataset.pending = data;
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    const u = currentUser();
    if (!u || u.role === "teacher") return;
    const preview = document.getElementById("sp-photo-preview");
    const pending = preview?.dataset?.pending || preview?.src || "";
    const photo =
      pending && pending.indexOf("data:image") === 0
        ? pending
        : getProfile(u).photo || "";
    const data = {
      fatherName: document.getElementById("sp-father")?.value.trim() || "",
      cnic: document.getElementById("sp-cnic")?.value.trim() || "",
      dob: document.getElementById("sp-dob")?.value || "",
      registrationNo: document.getElementById("sp-reg")?.value.trim() || "",
      session: document.getElementById("sp-session")?.value.trim() || "",
      program: document.getElementById("sp-program")?.value.trim() || "LL.B Five Year",
      currentSemester: +document.getElementById("sp-sem")?.value || 1,
      photo,
    };
    setProfile(u, data);
    if (preview) delete preview.dataset.pending;
    const msg = document.getElementById("sp-msg");
    if (msg) {
      msg.textContent = "Profile saved on this device.";
      msg.className = "msg show ok";
    }
    refreshHomeShell();
  }

  /* -------- Semester records -------- */
  function renderRecords() {
    const u = currentUser();
    if (!u || u.role === "teacher") return;
    const sel = document.getElementById("sr-sem");
    if (sel && !sel.dataset.ready) {
      sel.innerHTML = Object.keys(syllabus())
        .map((n) => `<option value="${n}">Semester ${n}</option>`)
        .join("");
      sel.dataset.ready = "1";
    }
    const p = getProfile(u);
    if (sel) {
      const prefer = editingSem || p.currentSemester || u.currentSemester || 1;
      sel.value = String(prefer);
      editingSem = +sel.value;
    }
    loadSemesterForm(editingSem);
    renderSavedSemesters();
  }

  function onRecordsSemChange() {
    editingSem = +document.getElementById("sr-sem")?.value || 1;
    loadSemesterForm(editingSem);
  }

  function loadSemesterForm(sem) {
    const u = currentUser();
    if (!u) return;
    const records = getRecords(u);
    const saved = records[sem];
    let courses = saved?.courses?.length
      ? saved.courses.map((c) => ({ ...c }))
      : coursesFromSyllabus(sem);
    // Merge any new syllabus subjects if code missing
    const syl = coursesFromSyllabus(sem);
    if (courses.length !== syl.length) {
      const byCode = Object.fromEntries(courses.map((c) => [c.code, c]));
      courses = syl.map((s) => ({
        ...s,
        marks: byCode[s.code]?.marks ?? "",
        gp: byCode[s.code]?.gp ?? null,
        grade: byCode[s.code]?.grade ?? "",
      }));
    }
    const host = document.getElementById("sr-courses");
    if (!host) return;
    host.innerHTML = courses
      .map((c, i) => {
        const marks = c.marks === "" || c.marks == null ? "" : c.marks;
        const gp = marks === "" ? "—" : (+c.gp || gpFromRounded(marks)).toFixed(2);
        const grade = marks === "" ? "—" : c.grade || letterFromRounded(marks);
        return `<div class="sr-row" data-i="${i}">
          <div class="sr-meta"><span class="code">${esc(c.code)}</span><span class="ttl">${esc(c.title)}</span><span class="ch">${(+c.ch).toFixed(2)} CH</span></div>
          <div class="sr-marks">
            <input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="/100" value="${esc(marks)}" data-i="${i}" oninput="StudentDash.onMarksInput(this)">
            <span class="sr-gp" id="sr-gp-${i}">${gp}</span>
            <span class="sr-gr" id="sr-gr-${i}">${grade}</span>
          </div>
        </div>`;
      })
      .join("");
    host.dataset.courses = JSON.stringify(courses);
    updateSemesterLive();
  }

  function onMarksInput(input) {
    const host = document.getElementById("sr-courses");
    if (!host) return;
    const courses = JSON.parse(host.dataset.courses || "[]");
    const i = +input.dataset.i;
    const raw = input.value.trim();
    if (raw === "") {
      courses[i].marks = "";
      courses[i].gp = null;
      courses[i].grade = "";
      document.getElementById("sr-gp-" + i).textContent = "—";
      document.getElementById("sr-gr-" + i).textContent = "—";
    } else {
      const marks = Math.min(100, Math.max(0, Math.round(+raw || 0)));
      courses[i].marks = marks;
      courses[i].gp = gpFromRounded(marks);
      courses[i].grade = letterFromRounded(marks);
      document.getElementById("sr-gp-" + i).textContent = courses[i].gp.toFixed(2);
      document.getElementById("sr-gr-" + i).textContent = courses[i].grade;
    }
    host.dataset.courses = JSON.stringify(courses);
    updateSemesterLive();
  }

  function updateSemesterLive() {
    const host = document.getElementById("sr-courses");
    const live = document.getElementById("sr-live");
    if (!host || !live) return;
    const courses = JSON.parse(host.dataset.courses || "[]").filter((c) => c.marks !== "" && c.marks != null);
    if (!courses.length) {
      live.textContent = "Enter marks to see semester GPA.";
      return;
    }
    const stats = calcSemesterGpa(
      courses.map((c) => ({
        ch: c.ch,
        gp: c.gp != null ? c.gp : gpFromRounded(c.marks),
        marks: +c.marks || 0,
      }))
    );
    live.textContent = `GPA ${stats.gpa.toFixed(2)} · ${stats.pct.toFixed(2)}% · Obtained ${stats.obtained}`;
  }

  function saveSemester() {
    const u = currentUser();
    if (!u) return;
    const host = document.getElementById("sr-courses");
    if (!host) return;
    const courses = JSON.parse(host.dataset.courses || "[]").map((c) => {
      if (c.marks === "" || c.marks == null) {
        return { code: c.code, title: c.title, ch: c.ch, marks: "", gp: null, grade: "" };
      }
      const marks = Math.min(100, Math.max(0, Math.round(+c.marks || 0)));
      return {
        code: c.code,
        title: c.title,
        ch: +c.ch || 0,
        marks,
        gp: gpFromRounded(marks),
        grade: letterFromRounded(marks),
      };
    });
    const filled = courses.filter((c) => c.marks !== "" && c.marks != null);
    if (!filled.length) {
      alert("Enter at least one subject mark before saving.");
      return;
    }
    const stats = calcSemesterGpa(
      filled.map((c) => ({ ch: c.ch, gp: c.gp, marks: c.marks }))
    );
    const sem = editingSem;
    const records = getRecords(u);
    records[sem] = {
      courses,
      gpa: +stats.gpa.toFixed(4),
      pct: +stats.pct.toFixed(2),
      obtained: stats.obtained,
      updatedAt: Date.now(),
    };
    setRecords(u, records);
    const msg = document.getElementById("sr-msg");
    if (msg) {
      msg.textContent = `Semester ${sem} saved · GPA ${stats.gpa.toFixed(2)}`;
      msg.className = "msg show ok";
    }
    renderSavedSemesters();
    if (activeDashTab === "gpa") renderGpaAnalysis();
  }

  function renderSavedSemesters() {
    const u = currentUser();
    const el = document.getElementById("sr-saved");
    if (!u || !el) return;
    const records = getRecords(u);
    const keys = Object.keys(records)
      .map(Number)
      .filter((n) => records[n]?.courses)
      .sort((a, b) => a - b);
    if (!keys.length) {
      el.innerHTML = '<div class="empty">No saved semesters yet.</div>';
      return;
    }
    el.innerHTML = keys
      .map((n) => {
        const r = records[n];
        return `<button type="button" class="sr-saved-item" onclick="StudentDash.editSemester(${n})">
          <div><div class="t">Semester ${n}</div><div class="m">GPA ${Number(r.gpa).toFixed(2)} · ${Number(r.pct).toFixed(1)}% · ${r.obtained} marks</div></div>
          <span class="pill">Edit</span>
        </button>`;
      })
      .join("");
  }

  function editSemester(n) {
    editingSem = +n;
    const sel = document.getElementById("sr-sem");
    if (sel) sel.value = String(n);
    setDashTab("records");
    loadSemesterForm(n);
  }

  function cumulativeBefore(records, sem) {
    let points = 0, ch = 0;
    Object.keys(records)
      .map(Number)
      .filter((n) => n < sem && records[n]?.courses)
      .sort((a, b) => a - b)
      .forEach((n) => {
        (records[n].courses || [])
          .filter((c) => c.marks !== "" && c.marks != null)
          .forEach((c) => {
            points += (+c.gp || 0) * (+c.ch || 0);
            ch += +c.ch || 0;
          });
      });
    return ch ? points / ch : 0;
  }

  function cumulativeThrough(records, sem) {
    let points = 0, ch = 0;
    Object.keys(records)
      .map(Number)
      .filter((n) => n <= sem && records[n]?.courses)
      .sort((a, b) => a - b)
      .forEach((n) => {
        (records[n].courses || [])
          .filter((c) => c.marks !== "" && c.marks != null)
          .forEach((c) => {
            points += (+c.gp || 0) * (+c.ch || 0);
            ch += +c.ch || 0;
          });
      });
    return ch ? points / ch : 0;
  }

  function fmtDob(v) {
    if (!v) return "—";
    const d = new Date(v + "T00:00");
    if (isNaN(d)) return v;
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  function buildTranscriptHtml(sem) {
    const u = currentUser();
    if (!u) return "";
    const p = getProfile(u);
    const records = getRecords(u);
    const rec = records[sem];
    if (!rec) return "";
    const courses = (rec.courses || []).filter((c) => c.marks !== "" && c.marks != null);
    const stats = calcSemesterGpa(courses.map((c) => ({ ch: c.ch, gp: c.gp, marks: c.marks })));
    const prev = cumulativeBefore(records, sem);
    const curr = cumulativeThrough(records, sem);
    const logo = global.LOGO || "icons/ulc-logo.png";
    const photo = p.photo
      ? `<img src="${p.photo}" alt="">`
      : `<div class="tx-photo-ph">PHOTO</div>`;
    const rows = courses
      .map(
        (c) => `<tr>
        <td>${esc(c.code)}</td>
        <td class="left">${esc(String(c.title).toUpperCase())}</td>
        <td>${(+c.ch).toFixed(2)}</td>
        <td>${Math.round(+c.marks)}</td>
        <td>${(+c.gp).toFixed(2)}</td>
        <td>${esc(c.grade)}</td>
      </tr>`
      )
      .join("");
    return `<div class="tx-cert">
      <div class="tx-outer">
        <div class="tx-inner">
          <div class="tx-head">
            <img class="tx-logo" src="${logo}" alt="">
            <div class="tx-head-text">
              <div class="tx-uni">UNIVERSITY LAW COLLEGE QUETTA</div>
              <div class="tx-unit">EXAMINATION UNIT</div>
              <div class="tx-prog">BACHELOR OF LAW (LL.B FIVE YEAR PROGRAM)</div>
              <div class="tx-sem">${ORD[sem] || ("SEMESTER " + sem)} SEMESTER</div>
              <div class="tx-title">PROVISIONAL CERTIFICATE</div>
            </div>
            <div class="tx-logo tx-logo-uob" aria-hidden="true"><span>UoB</span></div>
          </div>
          <div class="tx-student">
            <div class="tx-grid">
              <div class="tx-cell"><label>Roll No:</label><span>${esc(u.roll || "—")}</span></div>
              <div class="tx-cell"><label>Date of Birth:</label><span>${esc(fmtDob(p.dob))}</span></div>
              <div class="tx-cell"><label>Name:</label><span>${esc((u.name || "").toUpperCase())}</span></div>
              <div class="tx-cell"><label>Registration No:</label><span>${esc(p.registrationNo || "N/L")}</span></div>
              <div class="tx-cell"><label>Father Name:</label><span>${esc((p.fatherName || "—").toUpperCase())}</span></div>
              <div class="tx-cell"><label>Session:</label><span>${esc(p.session || u.session || "—")}</span></div>
              <div class="tx-cell"><label>CNIC No:</label><span>${esc(p.cnic || "—")}</span></div>
              <div class="tx-cell"><label>Program:</label><span>${esc((p.program || "LL.B FIVE YEAR DEGREE").toUpperCase())}</span></div>
            </div>
            <div class="tx-photo">${photo}</div>
          </div>
          <table class="tx-table">
            <thead>
              <tr class="tx-table-banner"><th colspan="6">COURSES STUDIES</th></tr>
              <tr>
                <th>Course Code</th>
                <th>Course Title</th>
                <th>Credit Hour</th>
                <th>Marks (100)</th>
                <th>Grade Point</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="tx-summary">
            <span>GPA: ${stats.gpa.toFixed(2)}</span>
            <span>Percentage: ${stats.pct.toFixed(2)} %</span>
            <span>Obtained Marks: ${stats.obtained}</span>
            <span>Previous CGPA: ${prev.toFixed(2)}</span>
            <span>Current CGPA: ${curr.toFixed(2)}</span>
          </div>
          <div class="tx-footer">
            Khojak Road Quetta Cantt: Balochistan, Pakistan. Ph: 0092-81-920-3851 · Fax: 0092-81-920-3751 · email: ulc.qta@gmail.com · URL http://www.uob.edu.pk/law college
          </div>
        </div>
      </div>
    </div>`;
  }

  async function generateTranscript() {
    const u = currentUser();
    if (!u) {
      alert("Login required.");
      return;
    }
    const sem = editingSem;
    const records = getRecords(u);
    if (!records[sem]) {
      alert("Save this semester before generating a transcript.");
      return;
    }
    const filled = (records[sem].courses || []).filter((c) => c.marks !== "" && c.marks != null);
    if (!filled.length) {
      alert("Enter and save marks first.");
      return;
    }
    const btn = document.getElementById("sr-tx-btn");
    const label = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating…";
    }
    const html = buildTranscriptHtml(sem);
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-99999px;top:0;width:1122px;background:#fff;";
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const cert = holder.querySelector(".tx-cert");
    try {
      if (typeof html2canvas === "undefined" || !global.jspdf) {
        const host = document.getElementById("printhost");
        if (host) {
          host.innerHTML = html;
          host.style.display = "block";
        }
        window.print();
        return;
      }
      const canvas = await html2canvas(cert, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: 1122,
        windowWidth: 1122,
      });
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF("l", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageW, pageH);
      const safe = String(u.name || "ULC").replace(/\s+/g, "_");
      pdf.save(`${safe}_Sem${sem}_Provisional.pdf`);
    } catch (e) {
      console.error(e);
      const host = document.getElementById("printhost");
      if (host) {
        host.innerHTML = html;
        host.style.display = "block";
      }
      window.print();
    } finally {
      holder.remove();
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  /* -------- GPA analysis -------- */
  function renderGpaAnalysis() {
    const u = currentUser();
    const bars = document.getElementById("gpa-bars");
    const summary = document.getElementById("gpa-analysis-summary");
    if (!u || !bars) return;
    const records = getRecords(u);
    const keys = Object.keys(records)
      .map(Number)
      .filter((n) => records[n]?.gpa != null)
      .sort((a, b) => a - b);
    if (!keys.length) {
      bars.innerHTML = '<div class="empty">Save semester records to see GPA over time.</div>';
      if (summary) summary.textContent = "";
      return;
    }
    const maxG = 4;
    bars.innerHTML = keys
      .map((n) => {
        const g = Number(records[n].gpa) || 0;
        const h = Math.max(4, (g / maxG) * 100);
        return `<div class="gpa-bar-col">
          <div class="gpa-bar-val">${g.toFixed(2)}</div>
          <div class="gpa-bar-track"><div class="gpa-bar-fill" style="height:${h}%"></div></div>
          <div class="gpa-bar-lbl">Sem ${n}</div>
        </div>`;
      })
      .join("");

    const latest = keys[keys.length - 1];
    const latestGpa = Number(records[latest].gpa) || 0;
    const cgpa = cumulativeThrough(records, latest);
    let cmp = "equal to";
    if (latestGpa > cgpa + 0.01) cmp = "above";
    else if (latestGpa < cgpa - 0.01) cmp = "below";
    if (summary) {
      summary.innerHTML = `<div class="gpa-stats" style="margin-bottom:10px">
        <div class="stat"><div class="n">${latestGpa.toFixed(2)}</div><div class="l">Latest · Sem ${latest}</div></div>
        <div class="stat"><div class="n">${cgpa.toFixed(2)}</div><div class="l">Overall CGPA</div></div>
      </div>
      <p class="hint">Your latest semester GPA is <b>${cmp}</b> your cumulative CGPA across ${keys.length} saved semester${keys.length > 1 ? "s" : ""}.</p>`;
    }
  }

  /* -------- FAQ chat -------- */
  const FAQ = [
    {
      keys: ["semester", "record", "marks", "result", "fill", "enter", "subject"],
      answer:
        "Open Semester Records on Home. Pick a semester — subjects load from the LLB syllabus automatically. Enter marks out of 100; GP and grade calculate instantly. Tap Save semester, then Generate transcript when ready.",
    },
    {
      keys: ["transcript", "certificate", "pdf", "download", "provisional", "print"],
      answer:
        "In Semester Records, save your marks first, then tap Generate transcript. You’ll get a provisional certificate–style PDF (no signature blocks). Fill Profile (photo, father name, CNIC, etc.) so the header is complete.",
    },
    {
      keys: ["cover", "assignment", "page"],
      answer:
        "Use Cover Page from the menu or More tools. Pick a template, fill subject and details, then Print or Download PDF. From Account you can also “Fill cover form” with your name and roll.",
    },
    {
      keys: ["login", "email", "password", "account", "signup", "sign up", "register"],
      answer:
        "Create an account with name, roll, email, and password (min. 6 characters). Login needs only email and password. Your profile and semester records stay on this device, keyed to your account.",
    },
    {
      keys: ["syllabus", "subject", "course", "llb", "credit"],
      answer:
        "Open LLB Syllabus in the menu for all ten semesters (HEC scheme). Semester Records uses the same subject list when you pick a semester.",
    },
    {
      keys: ["gpa", "cgpa", "analysis", "grade"],
      answer:
        "GPA Analysis on Home charts your saved semester GPAs and compares the latest semester to overall CGPA. Grade points follow the official ULC table (80+ = 4.00, below 50 = 0.00).",
    },
    {
      keys: ["photo", "profile", "picture", "cnic", "father"],
      answer:
        "Open the Profile tab on Home. Upload a photo (it is compressed on device), fill father name, CNIC, DOB, registration, session, and program, then Save profile.",
    },
    {
      keys: ["teacher", "desk", "attendance"],
      answer:
        "Teacher desk is for teacher accounts only. Students use Award List for personal marks tracking. Teachers sign up with role Teacher from Create account.",
    },
    {
      keys: ["hello", "hi", "help", "ulc"],
      answer:
        "Hi — I’m the ULC helper. Ask about semester records, transcripts, cover pages, login, syllabus, or GPA. I answer from built-in FAQs (no internet AI).",
    },
  ];

  function renderChatWelcome() {
    const log = document.getElementById("chatLog");
    if (!log || log.dataset.ready === "1") return;
    log.innerHTML =
      '<div class="chat-bubble bot">Ask about semester results, transcripts, cover pages, login, or the syllabus. I use built-in FAQs only — no external AI.</div>';
    log.dataset.ready = "1";
  }

  function chatReply(q) {
    const text = String(q || "").toLowerCase();
    if (!text.trim()) return "Type a short question, e.g. “how do I download my transcript?”";
    let best = null;
    let score = 0;
    for (const item of FAQ) {
      let s = 0;
      for (const k of item.keys) {
        if (text.includes(k)) s += 1;
      }
      if (s > score) {
        score = s;
        best = item;
      }
    }
    if (!best || score === 0) {
      return "I didn’t catch that. Try asking about: filling semester marks, downloading a transcript, cover page, login/email, syllabus, or GPA analysis.";
    }
    return best.answer;
  }

  function sendChat() {
    const input = document.getElementById("chatInput");
    const log = document.getElementById("chatLog");
    if (!input || !log) return;
    const q = input.value.trim();
    if (!q) return;
    renderChatWelcome();
    log.innerHTML += `<div class="chat-bubble user">${esc(q)}</div>`;
    log.innerHTML += `<div class="chat-bubble bot">${esc(chatReply(q))}</div>`;
    input.value = "";
    log.scrollTop = log.scrollHeight;
  }

  function onChatKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  }

  const StudentDash = {
    syncLanding,
    openAuthFromLanding,
    openToolFromLanding,
    markGuestBrowsing,
    resetLandingForGuestHome,
    refreshHomeShell,
    setDashTab,
    renderProfile,
    onPhotoSelected,
    saveProfile,
    renderRecords,
    onRecordsSemChange,
    onMarksInput,
    saveSemester,
    editSemester,
    generateTranscript,
    renderGpaAnalysis,
    sendChat,
    onChatKey,
    getProfile,
    getRecords,
    patchProfile,
    accountKey,
  };

  global.StudentDash = StudentDash;
})(typeof window !== "undefined" ? window : globalThis);
