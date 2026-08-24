/* Student dashboard: profile, semester records, transcript, GPA analysis, FAQ chat */
(function (global) {
  "use strict";

  const LS_PROFILE = "ulc_student_profile_v1";
  const LS_RECORDS = "ulc_semester_records_v1";
  const LS_SUBJECT_MARKS = "ulc_subject_marks_v1";

  let studentCloudTimer = null;
  let studentPullDone = false;

  function cloudUserId() {
    const u = typeof currentUser === "function" ? currentUser() : null;
    return u && u.cloud && u.id ? u.id : null;
  }

  function scheduleStudentCloudSync() {
    const uid = cloudUserId();
    if (!uid || !global.ULC_CLOUD?.saveWorkspace) return;
    clearTimeout(studentCloudTimer);
    studentCloudTimer = setTimeout(() => {
      pushStudentWorkspace().catch((e) => console.warn("[student] cloud sync", e?.message || e));
    }, 700);
  }

  async function pushStudentWorkspace() {
    const u = typeof currentUser === "function" ? currentUser() : null;
    const uid = cloudUserId();
    if (!u || !uid || u.role === "teacher" || !global.ULC_CLOUD?.saveWorkspace) return;
    const profile = getProfile(u);
    const records = getRecords(u);
    const marksAll = loadJSON(LS_SUBJECT_MARKS, {});
    const subjectMarks = marksAll[accountKey(u)] || {};
    await global.ULC_CLOUD.saveWorkspace(uid, {
      email: u.email || null,
      full_name: u.name || "",
      official_name: u.name || "",
      data: {
        kind: "student",
        version: 1,
        profile,
        semesterRecords: records,
        subjectMarks,
        myFiles: global.MyFiles?.exportUserFiles ? global.MyFiles.exportUserFiles() : [],
        syncedAt: Date.now(),
      },
    });
  }

  async function pullStudentWorkspace(force) {
    const u = typeof currentUser === "function" ? currentUser() : null;
    const uid = cloudUserId();
    if (!u || !uid || u.role === "teacher" || !global.ULC_CLOUD?.loadWorkspace) return false;
    if (studentPullDone && !force) return false;
    try {
      const remote = await global.ULC_CLOUD.loadWorkspace(uid, { kind: "student" });
      studentPullDone = true;
      if (!remote || !remote.data || remote.data.kind !== "student") return false;
      const d = remote.data;
      const remoteTs = +d.syncedAt || Date.parse(remote.updated_at) || 0;
      const localP = getProfile(u);
      const localTs = +localP.updatedAt || 0;
      const remotePhoto = d.profile && d.profile.photo;
      const shouldApply =
        force ||
        !localTs ||
        remoteTs >= localTs ||
        (remotePhoto && !localP.photo);
      if (!shouldApply) return false;
      if (d.profile && typeof d.profile === "object") {
        const key = accountKey(u);
        const all = getProfileStore();
        all[key] = { ...(all[key] || {}), ...d.profile, updatedAt: remoteTs || Date.now() };
        saveJSON(LS_PROFILE, all);
      }
      if (d.semesterRecords && typeof d.semesterRecords === "object") {
        setRecords(u, d.semesterRecords);
      }
      if (d.subjectMarks && typeof d.subjectMarks === "object") {
        const allM = loadJSON(LS_SUBJECT_MARKS, {});
        allM[accountKey(u)] = d.subjectMarks;
        saveJSON(LS_SUBJECT_MARKS, allM);
      }
      if (Array.isArray(d.myFiles) && global.MyFiles?.replaceUserFiles) {
        global.MyFiles.replaceUserFiles(d.myFiles);
      }
      return true;
    } catch (e) {
      console.warn("[student] cloud pull", e?.message || e);
      return false;
    }
  }
  const ORD = ["", "1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

  let activeDashTab = "gpa";
  let editingSem = 1;
  let authFlowOpen = false;
  let guestBrowsing = false;
  let editingSubjectMarksId = null;

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
    let points = 0, ch = 0, obtained = 0, counted = 0;
    for (const raw of courses || []) {
      const credits = +raw.ch || 0;
      if (credits <= 0) continue;
      if (raw.marks === "" || raw.marks == null || !Number.isFinite(+raw.marks)) continue;
      const marks = Math.round(Math.min(100, Math.max(0, +raw.marks || 0)));
      const gp = gpFromRounded(marks);
      points += gp * credits;
      ch += credits;
      obtained += marks;
      counted += 1;
    }
    const max = counted * 100;
    return { gpa: ch ? points / ch : 0, pct: max ? (obtained / max) * 100 : 0, obtained, ch, max, counted };
  }

  function accountKey(u) {
    if (!u) return null;
    const email = String(u.email || "").trim().toLowerCase();
    if (email) return email;
    return String(u.roll || "").trim().toUpperCase() || null;
  }

  function getSubjectMarksStore() {
    return loadJSON(LS_SUBJECT_MARKS, {});
  }
  function getSubjectMarksMap(u) {
    const key = accountKey(u);
    if (!key) return {};
    return getSubjectMarksStore()[key] || {};
  }
  function setSubjectMarksMap(u, map) {
    const key = accountKey(u);
    if (!key) return;
    const all = getSubjectMarksStore();
    all[key] = map;
    saveJSON(LS_SUBJECT_MARKS, all);
    scheduleStudentCloudSync();
  }
  function subjectMarksId(sem, code) {
    return String(sem) + "|" + String(code || "").trim().toUpperCase();
  }

  function calcAwardFrom(data) {
    if (global.ULC_MATH?.calcAwardFrom) return ULC_MATH.calcAwardFrom(data);
    const qs = [data.q1, data.q2, data.q3, data.q4, data.q5].map((n) => Math.min(15, Math.max(0, +n || 0)));
    const top = [...qs].sort((a, b) => b - a).slice(0, 3);
    while (top.length < 3) top.push(0);
    const quiz = top.reduce((a, b) => a + b, 0) / 3;
    const assn =
      (Math.min(15, Math.max(0, +data.a1 || 0)) + Math.min(15, Math.max(0, +data.a2 || 0))) / 2;
    const midObt = Math.min(100, Math.max(0, +data.mid || 0));
    const finObt = Math.min(100, Math.max(0, +data.final || 0));
    const mid30 = midObt * 0.3;
    const fin40 = finObt * 0.4;
    const grand = Math.min(100, quiz + assn + mid30 + fin40);
    const rounded = Math.round(grand);
    return {
      quiz,
      assn,
      midObt,
      finObt,
      mid30,
      fin40,
      grand,
      rounded,
      grade: letterFromRounded(rounded),
      gp: gpFromRounded(rounded),
    };
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
    scheduleStudentCloudSync();
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
    scheduleStudentCloudSync();
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

  function openAuthFromLanding(which, role) {
    authFlowOpen = true;
    guestBrowsing = false;
    hideLandingGate();
    if (typeof setAuthTab === "function") setAuthTab(which === "signup" ? "signup" : "login");
    if (which === "signup" && role) {
      const sel = document.getElementById("su-role");
      if (sel) {
        sel.value = role === "teacher" ? "teacher" : "student";
        if (typeof onSignupRoleChange === "function") onSignupRoleChange();
      }
      const title = document.querySelector("#signupCard h3");
      if (title) {
        title.textContent =
          role === "teacher" ? "Create faculty account" : "Create student account";
      }
      const btn = document.querySelector("#signupCard .btn-gold");
      if (btn) {
        btn.textContent =
          role === "teacher" ? "Create faculty account" : "Create student account";
      }
    } else if (which === "signup") {
      const title = document.querySelector("#signupCard h3");
      if (title) title.textContent = "Create account";
      const btn = document.querySelector("#signupCard .btn-gold");
      if (btn) btn.textContent = "Create account";
    }
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
  function refreshHomeShell(opts) {
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
        const st = global.TeacherApp?.getStore?.();
        const cls = global.TeacherApp?.activeClass?.();
        const nm = st?.officialName || u.name;
        if (t) t.textContent = "Welcome " + (nm || "Teacher");
        if (s) {
          s.textContent = cls
            ? `Semester ${cls.semester} · ${cls.subject} · ${cls.students?.length || 0} students`
            : (u.email || "Teacher") + " · Set up your class in Teacher desk.";
        }
        if (global.TeacherApp?.syncHomeOverview) global.TeacherApp.syncHomeOverview();
      }
      return;
    }

    guest.style.display = "none";
    if (teacher) teacher.style.display = "none";
    student.style.display = "";
    const title = document.getElementById("dashWelcomeTitle");
    const sub = document.getElementById("dashWelcomeSub");
    const cgpaVal = document.getElementById("dashCgpaVal");
    const cgpaHint = document.getElementById("dashCgpaHint");
    const p = getProfile(u);
    const name = (u.name || "Student").trim();
    const cgpaInfo = studentCgpaSummary(u);
    if (title) {
      title.textContent = name;
    }
    if (sub) {
      const bits = [];
      if (u.roll) bits.push("Roll " + u.roll);
      else if (u.email) bits.push(u.email);
      const sem = p.currentSemester || u.currentSemester;
      if (sem) bits.push("Semester " + sem);
      if (p.session || u.session) bits.push(p.session || u.session);
      if (cgpaInfo.value != null) bits.push("CGPA " + cgpaInfo.value.toFixed(2));
      sub.textContent = bits.length ? bits.join(" · ") : "Your student dashboard";
    }
    if (cgpaVal) {
      cgpaVal.textContent = cgpaInfo.value != null ? cgpaInfo.value.toFixed(2) : "—";
    }
    if (cgpaHint) {
      cgpaHint.textContent = cgpaInfo.hint;
    }
    const av = document.getElementById("dashProfileAv");
    if (av) {
      if (p.photo) {
        av.innerHTML = `<img src="${p.photo}" alt="">`;
      } else {
        av.textContent = (name.charAt(0) || "?").toUpperCase();
      }
    }
    if (opts && opts.overview) activeDashTab = "gpa";
    if (!activeDashTab || activeDashTab === "profile") activeDashTab = "gpa";
    setDashTab(activeDashTab, true);
  }

  function studentCgpaSummary(u) {
    const records = getRecords(u);
    const keys = Object.keys(records)
      .map(Number)
      .filter((n) => records[n]?.courses)
      .sort((a, b) => a - b);
    if (keys.length) {
      const latest = keys[keys.length - 1];
      const cgpa = cumulativeThrough(records, latest);
      return {
        value: cgpa,
        hint: keys.length === 1 ? "Semester " + latest : keys.length + " semesters",
      };
    }
    const fallback = u.cgpa != null && u.cgpa !== "" ? +u.cgpa : null;
    if (fallback != null && !isNaN(fallback)) {
      return { value: fallback, hint: "from profile" };
    }
    return { value: null, hint: "add records" };
  }

  function setDashTab(tab, force) {
    if (!force && activeDashTab === tab) return;
    activeDashTab = tab === "profile" ? "gpa" : tab || "gpa";
    document.querySelectorAll(".dash-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.dash === activeDashTab);
    });
    document.querySelectorAll(".dash-panel").forEach((p) => {
      p.classList.toggle("active", p.id === "dash-" + activeDashTab);
    });
    if (activeDashTab === "marks") renderSubjectMarks();
    if (activeDashTab === "records") renderRecords();
    if (activeDashTab === "gpa") renderGpaAnalysis();
    if (activeDashTab === "chat") renderChatWelcome();
  }

  function openProfileModal() {
    const u = typeof currentUser === "function" ? currentUser() : null;
    if (!u || u.role === "teacher") {
      alert("Login as a student to edit your profile.");
      return;
    }
    const ov = document.getElementById("profileOverlay");
    if (!ov) {
      alert("Profile popup is missing. Hard-refresh the page (Ctrl+F5), cache v30+.");
      return;
    }
    /* Show sheet first so a fill error cannot block the popup. */
    ov.classList.add("show");
    ov.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    try {
      renderProfile();
    } catch (err) {
      console.error("renderProfile failed", err);
    }
  }
  function closeProfileModal() {
    const ov = document.getElementById("profileOverlay");
    if (ov) {
      ov.classList.remove("show");
      ov.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
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
      const keys = Object.keys(global.SYLLABUS || syllabus() || {})
        .map(Number)
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
      semSel.innerHTML = (keys.length ? keys : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        .map((n) => `<option value="${n}">Semester ${n}</option>`)
        .join("");
      semSel.dataset.ready = "1";
    }
    if (semSel) semSel.value = String(p.currentSemester || u.currentSemester || 1);
    set("sp-prepared", p.preparedByName || "");
    set("sp-coordinator", p.coordinatorName || "");
    set("sp-principal", p.principalName || "");
    const img = document.getElementById("sp-photo-preview");
    if (img) {
      if (p.photo) {
        img.src = p.photo;
        img.style.display = "";
        delete img.dataset.pending;
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
        delete img.dataset.pending;
      }
    }
    const msg = document.getElementById("sp-msg");
    if (msg) msg.className = "msg";
  }

  function persistPhotoNow(dataUrl) {
    const u = typeof currentUser === "function" ? currentUser() : null;
    if (!u || u.role === "teacher" || !dataUrl) return;
    setProfile(u, { photo: dataUrl });
  }

  function onPhotoSelected(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
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
        const data = canvas.toDataURL("image/jpeg", 0.85);
        const preview = document.getElementById("sp-photo-preview");
        if (preview) {
          preview.src = data;
          preview.style.display = "";
          preview.dataset.pending = data;
        }
        persistPhotoNow(data);
        const msg = document.getElementById("sp-msg");
        if (msg) {
          msg.textContent = "Photo saved for your transcript. Fill the rest and tap Save profile.";
          msg.className = "msg show ok";
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
    const pending = preview?.dataset?.pending || "";
    const fromSrc =
      preview?.src && String(preview.src).indexOf("data:image") === 0 ? preview.src : "";
    const photo = pending || fromSrc || getProfile(u).photo || "";
    const data = {
      fatherName: document.getElementById("sp-father")?.value.trim() || "",
      cnic: document.getElementById("sp-cnic")?.value.trim() || "",
      dob: document.getElementById("sp-dob")?.value || "",
      registrationNo: document.getElementById("sp-reg")?.value.trim() || "",
      session: document.getElementById("sp-session")?.value.trim() || "",
      program: document.getElementById("sp-program")?.value.trim() || "LL.B Five Year",
      currentSemester: +document.getElementById("sp-sem")?.value || 1,
      preparedByName: document.getElementById("sp-prepared")?.value.trim() || "",
      coordinatorName: document.getElementById("sp-coordinator")?.value.trim() || "",
      principalName: document.getElementById("sp-principal")?.value.trim() || "",
      photo,
    };
    setProfile(u, data);
    if (preview) delete preview.dataset.pending;
    const msg = document.getElementById("sp-msg");
    if (msg) {
      msg.textContent = photo
        ? "Profile saved to this device and synced to cloud (photo included)."
        : "Profile saved. Upload a photo so it appears on your transcript.";
      msg.className = "msg show ok";
    }
    refreshHomeShell();
    closeProfileModal();
  }

  /* -------- Add your marks (award formula) -------- */
  function numId(id) {
    const el = document.getElementById(id);
    return el ? +el.value || 0 : 0;
  }
  function setNum(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v == null || v === "" ? "0" : v;
  }

  function syllabusKeys() {
    const syl = global.SYLLABUS || {};
    return Object.keys(syl)
      .map(Number)
      .filter((n) => n > 0 && syl[n])
      .sort((a, b) => a - b);
  }

  function renderSubjectMarks() {
    const u = currentUser();
    if (!u || u.role === "teacher") return;
    const semSel = document.getElementById("sm-sem");
    const keys = syllabusKeys();
    if (semSel) {
      const prefer = String(
        getProfile(u).currentSemester || u.currentSemester || keys[0] || 1
      );
      const keep = semSel.value && keys.includes(+semSel.value) ? semSel.value : prefer;
      semSel.innerHTML = keys.length
        ? keys.map((n) => `<option value="${n}">Semester ${n}</option>`).join("")
        : '<option value="">Syllabus not loaded — refresh the page</option>';
      if (keys.length) semSel.value = keep;
      semSel.dataset.ready = keys.length ? "1" : "";
    }
    fillSubjectMarksSubjects();
    renderSavedSubjectMarks();
    liveSubjectMarks();
  }

  function fillSubjectMarksSubjects() {
    const semSel = document.getElementById("sm-sem");
    const sem = +(semSel?.value || syllabusKeys()[0] || 1);
    const subj = document.getElementById("sm-subj");
    if (!subj) return;
    const list = syllabus()[sem] || [];
    const prev = subj.value;
    subj.innerHTML =
      '<option value="">Select subject</option>' +
      list
        .map((x, i) => `<option value="${i}">${esc(x[0])} — ${esc(x[1])}</option>`)
        .join("");
    if (prev && [...subj.options].some((o) => o.value === prev)) subj.value = prev;
    else subj.value = "";
    onSubjectMarksSubjChange();
  }

  function onSubjectMarksSemChange() {
    editingSubjectMarksId = null;
    fillSubjectMarksSubjects();
    resetSubjectMarksInputs();
    liveSubjectMarks();
  }

  function onSubjectMarksSubjChange() {
    const sem = +document.getElementById("sm-sem")?.value || 1;
    const idx = document.getElementById("sm-subj")?.value;
    const list = syllabus()[sem] || [];
    const row = idx === "" || idx == null ? null : list[+idx];
    const codeEl = document.getElementById("sm-code");
    const chEl = document.getElementById("sm-ch");
    if (!row) {
      if (codeEl) codeEl.value = "";
      if (chEl) chEl.value = "";
      return;
    }
    if (codeEl) codeEl.value = row[0];
    if (chEl) chEl.value = (+row[2] || 0).toFixed(2);
    const u = currentUser();
    if (!u) return;
    const id = subjectMarksId(sem, row[0]);
    const saved = getSubjectMarksMap(u)[id];
    if (saved) {
      editingSubjectMarksId = id;
      applySubjectMarksToForm(saved);
    } else if (editingSubjectMarksId !== id) {
      editingSubjectMarksId = null;
      resetSubjectMarksInputs();
    }
    liveSubjectMarks();
  }

  function resetSubjectMarksInputs() {
    ["sm-q1", "sm-q2", "sm-q3", "sm-q4", "sm-q5", "sm-a1", "sm-a2", "sm-mid-obj", "sm-mid-sub", "sm-mid", "sm-fin-obj", "sm-fin-sub", "sm-fin"].forEach(
      (id) => setNum(id, 0)
    );
  }

  function resetSubjectMarksForm() {
    editingSubjectMarksId = null;
    const subj = document.getElementById("sm-subj");
    if (subj) subj.value = "";
    document.getElementById("sm-code") && (document.getElementById("sm-code").value = "");
    document.getElementById("sm-ch") && (document.getElementById("sm-ch").value = "");
    resetSubjectMarksInputs();
    const msg = document.getElementById("sm-msg");
    if (msg) msg.className = "msg";
    liveSubjectMarks();
  }

  function applySubjectMarksToForm(row) {
    setNum("sm-q1", row.q1);
    setNum("sm-q2", row.q2);
    setNum("sm-q3", row.q3);
    setNum("sm-q4", row.q4);
    setNum("sm-q5", row.q5);
    setNum("sm-a1", row.a1);
    setNum("sm-a2", row.a2);
    setNum("sm-mid-obj", row.mid_obj);
    setNum("sm-mid-sub", row.mid_sub);
    setNum("sm-mid", row.mid);
    setNum("sm-fin-obj", row.fin_obj);
    setNum("sm-fin-sub", row.fin_sub);
    setNum("sm-fin", row.final);
  }

  function readSubjectMarksForm() {
    return {
      q1: numId("sm-q1"),
      q2: numId("sm-q2"),
      q3: numId("sm-q3"),
      q4: numId("sm-q4"),
      q5: numId("sm-q5"),
      a1: numId("sm-a1"),
      a2: numId("sm-a2"),
      mid_obj: numId("sm-mid-obj"),
      mid_sub: numId("sm-mid-sub"),
      mid: numId("sm-mid"),
      fin_obj: numId("sm-fin-obj"),
      fin_sub: numId("sm-fin-sub"),
      final: numId("sm-fin"),
    };
  }

  function onSubjectMidParts() {
    const tot = Math.min(100, numId("sm-mid-obj") + numId("sm-mid-sub"));
    setNum("sm-mid", tot);
    liveSubjectMarks();
  }
  function onSubjectFinParts() {
    const tot = Math.min(100, numId("sm-fin-obj") + numId("sm-fin-sub"));
    setNum("sm-fin", tot);
    liveSubjectMarks();
  }

  function liveSubjectMarks() {
    const r = calcAwardFrom(readSubjectMarksForm());
    const setT = (id, t) => {
      const el = document.getElementById(id);
      if (el) el.textContent = t;
    };
    setT("sm-k-quiz", r.quiz.toFixed(2));
    setT("sm-k-assn", r.assn.toFixed(2));
    setT("sm-k-mid", r.mid30.toFixed(2));
    setT("sm-k-fin", r.fin40.toFixed(2));
    setT("sm-k-mid-line", r.mid30.toFixed(2));
    setT("sm-k-fin-line", r.fin40.toFixed(2));
    const tot = document.getElementById("sm-k-total");
    if (tot) tot.innerHTML = r.grand.toFixed(2) + "<small> / 100</small>";
    setT("sm-k-round", String(r.rounded));
    setT("sm-k-grade", r.grade);
    setT("sm-k-gp", r.gp.toFixed(2));
    const brk = document.getElementById("sm-k-brk");
    if (brk) {
      brk.textContent = `Mid paper ${r.midObt.toFixed(1)}/100 · Final ${r.finObt.toFixed(1)}/100 → Grand ${r.grand.toFixed(2)} → rounded ${r.rounded} → Grade ${r.grade} · GP ${r.gp.toFixed(2)}`;
    }
  }

  function syncSubjectMarksToSemesterRecord(u, row, result) {
    const sem = +row.sem;
    const records = getRecords(u);
    let courses = records[sem]?.courses?.length
      ? records[sem].courses.map((c) => ({ ...c }))
      : coursesFromSyllabus(sem);
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
    let hit = false;
    courses = courses.map((c) => {
      if (String(c.code).toUpperCase() !== String(row.code).toUpperCase()) return c;
      hit = true;
      return {
        ...c,
        marks: result.rounded,
        gp: result.gp,
        grade: result.grade,
      };
    });
    if (!hit) {
      courses.push({
        code: row.code,
        title: row.title,
        ch: +row.ch || 0,
        marks: result.rounded,
        gp: result.gp,
        grade: result.grade,
      });
    }
    const filled = courses.filter((c) => c.marks !== "" && c.marks != null);
    const stats = calcSemesterGpa(
      filled.map((c) => ({
        ch: c.ch,
        marks: c.marks,
        gp: gpFromRounded(c.marks),
      }))
    );
    records[sem] = {
      courses,
      gpa: +stats.gpa.toFixed(4),
      pct: +stats.pct.toFixed(2),
      obtained: stats.obtained,
      updatedAt: Date.now(),
    };
    setRecords(u, records);
  }

  function saveSubjectMarks() {
    const u = currentUser();
    if (!u) return;
    const sem = +document.getElementById("sm-sem")?.value || 1;
    const idx = document.getElementById("sm-subj")?.value;
    const list = syllabus()[sem] || [];
    const row = idx === "" || idx == null ? null : list[+idx];
    if (!row) {
      alert("Select a subject first.");
      return;
    }
    const form = readSubjectMarksForm();
    const result = calcAwardFrom(form);
    const id = subjectMarksId(sem, row[0]);
    const map = getSubjectMarksMap(u);
    map[id] = {
      id,
      sem,
      code: row[0],
      title: row[1],
      ch: +row[2] || 0,
      ...form,
      grand: result.grand,
      rounded: result.rounded,
      grade: result.grade,
      gp: result.gp,
      updatedAt: Date.now(),
    };
    setSubjectMarksMap(u, map);
    editingSubjectMarksId = id;
    syncSubjectMarksToSemesterRecord(u, map[id], result);
    const msg = document.getElementById("sm-msg");
    if (msg) {
      msg.textContent = `Saved ${row[0]} · Grand ${result.grand.toFixed(2)} → ${result.rounded} · ${result.grade} · GP ${result.gp.toFixed(2)}. Also updated Semester Records.`;
      msg.className = "msg show ok";
    }
    renderSavedSubjectMarks();
    refreshHomeShell();
  }

  function renderSavedSubjectMarks() {
    const u = currentUser();
    const el = document.getElementById("sm-saved");
    if (!u || !el) return;
    const map = getSubjectMarksMap(u);
    const rows = Object.values(map).sort((a, b) => a.sem - b.sem || String(a.code).localeCompare(String(b.code)));
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No subject marks yet. Fill the form and tap Save marks.</div>';
      return;
    }
    el.innerHTML = rows
      .map((r) => {
        const res = calcAwardFrom(r);
        return `<div class="sr-saved-item">
          <div>
            <div class="t">Sem ${r.sem} · ${esc(r.code)}</div>
            <div class="m">${esc(r.title)} · Grand ${res.grand.toFixed(2)} → ${res.rounded} · ${res.grade} · GP ${res.gp.toFixed(2)}</div>
          </div>
          <div class="sr-saved-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick='StudentDash.editSubjectMarks(${JSON.stringify(r.id)})'>Edit</button>
            <button type="button" class="btn btn-danger btn-sm" onclick='StudentDash.deleteSubjectMarks(${JSON.stringify(r.id)})'>Delete</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function deleteSubjectMarks(id) {
    const u = currentUser();
    if (!u) return;
    const map = getSubjectMarksMap(u);
    const row = map[id];
    if (!row) return;
    if (!confirm(`Delete marks for ${row.code} (Semester ${row.sem})?`)) return;
    delete map[id];
    setSubjectMarksMap(u, map);
    if (editingSubjectMarksId === id) {
      editingSubjectMarksId = null;
      resetSubjectMarksForm();
    }
    const msg = document.getElementById("sm-msg");
    if (msg) {
      msg.textContent = `Deleted ${row.code}.`;
      msg.className = "msg show ok";
    }
    renderSavedSubjectMarks();
    refreshHomeShell();
  }

  function editSubjectMarks(id) {
    const u = currentUser();
    if (!u) return;
    const row = getSubjectMarksMap(u)[id];
    if (!row) return;
    setDashTab("marks");
    const semSel = document.getElementById("sm-sem");
    if (semSel) {
      semSel.value = String(row.sem);
      fillSubjectMarksSubjects();
    }
    const list = syllabus()[row.sem] || [];
    const idx = list.findIndex((x) => String(x[0]).toUpperCase() === String(row.code).toUpperCase());
    const subj = document.getElementById("sm-subj");
    if (subj && idx >= 0) subj.value = String(idx);
    document.getElementById("sm-code") && (document.getElementById("sm-code").value = row.code);
    document.getElementById("sm-ch") && (document.getElementById("sm-ch").value = (+row.ch || 0).toFixed(2));
    editingSubjectMarksId = id;
    applySubjectMarksToForm(row);
    liveSubjectMarks();
  }

  /* -------- Semester records -------- */
  function openRecordsModal(sem) {
    const ov = document.getElementById("srOverlay");
    if (!ov) return;
    if (sem != null) editingSem = +sem;
    const title = document.getElementById("srModalTitle");
    const records = currentUser() ? getRecords(currentUser()) : {};
    if (title) {
      title.textContent = records[editingSem] ? "Edit semester record" : "Add semester record";
    }
    const modalMsg = document.getElementById("sr-modal-msg");
    if (modalMsg) modalMsg.className = "msg";
    renderRecordsForm();
    ov.classList.add("show");
  }

  function closeRecordsModal() {
    document.getElementById("srOverlay")?.classList.remove("show");
  }

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
    if (!editingSem) {
      editingSem = +(p.currentSemester || u.currentSemester || 1);
    }
    renderSavedSemesters();
  }

  function renderRecordsForm() {
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
  }

  function onRecordsSemChange() {
    editingSem = +document.getElementById("sr-sem")?.value || 1;
    const title = document.getElementById("srModalTitle");
    const u = currentUser();
    const records = u ? getRecords(u) : {};
    if (title) {
      title.textContent = records[editingSem] ? "Edit semester record" : "Add semester record";
    }
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
        marks: +c.marks || 0,
        gp: gpFromRounded(c.marks),
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
      filled.map((c) => ({
        ch: c.ch,
        marks: c.marks,
        gp: gpFromRounded(c.marks),
      }))
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
    const modalMsg = document.getElementById("sr-modal-msg");
    if (modalMsg) {
      modalMsg.textContent = `Semester ${sem} saved · GPA ${stats.gpa.toFixed(2)}`;
      modalMsg.className = "msg show ok";
    }
    renderSavedSemesters();
    if (activeDashTab === "gpa") renderGpaAnalysis();
    closeRecordsModal();
    refreshHomeShell();
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
      el.innerHTML = '<div class="empty">No saved semesters yet. Tap <strong>Add semester record</strong> to begin.</div>';
      return;
    }
    el.innerHTML = keys
      .map((n) => {
        const r = records[n];
        return `<div class="sr-saved-item">
          <div>
            <div class="t">Semester ${n}</div>
            <div class="m">GPA ${Number(r.gpa).toFixed(2)} · ${Number(r.pct).toFixed(1)}% · ${r.obtained} marks</div>
          </div>
          <div class="sr-saved-actions">
            <button type="button" class="btn btn-ghost btn-sm" onclick="StudentDash.editSemester(${n})">Edit</button>
            <button type="button" class="btn btn-gold btn-sm" onclick="StudentDash.generateTranscript(${n})">Generate transcript</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="StudentDash.deleteSemester(${n})">Delete record</button>
          </div>
        </div>`;
      })
      .join("");
  }

  function deleteSemester(n) {
    const u = currentUser();
    if (!u) return;
    n = +n;
    if (!confirm(`Delete Semester ${n} record? This cannot be undone.`)) return;
    const records = getRecords(u);
    delete records[n];
    setRecords(u, records);
    if (editingSem === n) editingSem = 1;
    const msg = document.getElementById("sr-msg");
    if (msg) {
      msg.textContent = `Semester ${n} deleted.`;
      msg.className = "msg show ok";
    }
    renderSavedSemesters();
    refreshHomeShell();
  }

  function editSemester(n) {
    editingSem = +n;
    setDashTab("records");
    openRecordsModal(n);
  }

  function cumulativeBefore(records, sem) {
    if (global.ULC_MATH?.calcCgpaThrough) {
      return ULC_MATH.calcCgpaThrough(records, (+sem || 0) - 1);
    }
    let points = 0, ch = 0;
    Object.keys(records)
      .map(Number)
      .filter((n) => n < sem && records[n]?.courses)
      .sort((a, b) => a - b)
      .forEach((n) => {
        (records[n].courses || [])
          .filter((c) => c.marks !== "" && c.marks != null)
          .forEach((c) => {
            const marks = Math.round(Math.min(100, Math.max(0, +c.marks || 0)));
            const gp = gpFromRounded(marks);
            const credits = +c.ch || 0;
            if (credits <= 0) return;
            points += gp * credits;
            ch += credits;
          });
      });
    return ch ? points / ch : 0;
  }

  function cumulativeThrough(records, sem) {
    if (global.ULC_MATH?.calcCgpaThrough) {
      return ULC_MATH.calcCgpaThrough(records, sem);
    }
    let points = 0, ch = 0;
    Object.keys(records)
      .map(Number)
      .filter((n) => n <= sem && records[n]?.courses)
      .sort((a, b) => a - b)
      .forEach((n) => {
        (records[n].courses || [])
          .filter((c) => c.marks !== "" && c.marks != null)
          .forEach((c) => {
            const marks = Math.round(Math.min(100, Math.max(0, +c.marks || 0)));
            const gp = gpFromRounded(marks);
            const credits = +c.ch || 0;
            if (credits <= 0) return;
            points += gp * credits;
            ch += credits;
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
    const stats = calcSemesterGpa(
      courses.map((c) => ({
        ch: c.ch,
        marks: c.marks,
        gp: gpFromRounded(c.marks),
      }))
    );
    const prev = cumulativeBefore(records, sem);
    const curr = cumulativeThrough(records, sem);
    const logo = global.LOGO || "icons/ulc-logo.png";
    const uob = "icons/uob-logo.png";
    const photoSrc = p.photo && String(p.photo).indexOf("data:image") === 0 ? p.photo : "";
    const photo = photoSrc
      ? `<img src="${photoSrc}" alt="Student photo" width="110" height="136">`
      : `<div class="tx-photo-ph">PHOTO</div>`;
    const prepared = (p.preparedByName || "").trim();
    const coordinator = (p.coordinatorName || "").trim();
    const principal = (p.principalName || "").trim();
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
      <div class="tx-watermark" aria-hidden="true">
        <span>UNOFFICIAL COPY</span>
      </div>
      <div class="tx-outer">
        <div class="tx-inner">
          <div class="tx-head">
            <img class="tx-logo" src="${logo}" alt="University Law College">
            <div class="tx-head-text">
              <div class="tx-uni">UNIVERSITY LAW COLLEGE QUETTA</div>
              <div class="tx-unit">EXAMINATION UNIT</div>
              <div class="tx-prog">BACHELOR OF LAW (LL.B FIVE YEAR PROGRAM)</div>
              <div class="tx-sem">${ORD[sem] || ("SEMESTER " + sem)} SEMESTER</div>
              <div class="tx-title">PROVISIONAL CERTIFICATE</div>
            </div>
            <img class="tx-logo" src="${uob}" alt="University of Balochistan">
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
          <div class="tx-sigs">
            <div class="tx-sig">
              <div class="tx-sig-line"></div>
              <div class="tx-sig-role">Prepared By</div>
              <div class="tx-sig-name">${esc(prepared || "—")}</div>
            </div>
            <div class="tx-sig">
              <div class="tx-sig-line"></div>
              <div class="tx-sig-role">Coordinator</div>
              <div class="tx-sig-name">${esc(coordinator || "—")}</div>
            </div>
            <div class="tx-sig">
              <div class="tx-sig-line"></div>
              <div class="tx-sig-role">Principal</div>
              <div class="tx-sig-name">${esc(principal || "—")}</div>
            </div>
          </div>
          <div class="tx-footer">
            Khojak Road Quetta Cantt: Balochistan, Pakistan. Ph: 0092-81-920-3851 · Fax: 0092-81-920-3751 · email: ulc.qta@gmail.com · URL http://www.uob.edu.pk/law college
          </div>
          <div class="tx-disclaimer">Generated by ULC Toolkit — not affiliated with any institution</div>
        </div>
      </div>
    </div>`;
  }

  function waitForImages(root) {
    const imgs = [...(root?.querySelectorAll("img") || [])];
    return Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalWidth) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 1500);
          })
      )
    );
  }

  async function generateTranscript(semArg) {
    const u = currentUser();
    if (!u) {
      alert("Login required.");
      return;
    }
    const profile = getProfile(u);
    if (!profile.photo || String(profile.photo).indexOf("data:image") !== 0) {
      const goPhoto = confirm(
        "No student photo found on your profile. Upload a photo in Profile first?\n\nOK = open Profile · Cancel = generate without photo"
      );
      if (goPhoto) {
        openProfileModal();
        return;
      }
    }
    const records = getRecords(u);
    let sem = semArg != null && semArg !== "" ? +semArg : editingSem;
    if (!records[sem]) {
      const keys = Object.keys(records)
        .map(Number)
        .filter((n) => records[n]?.courses)
        .sort((a, b) => b - a);
      if (!keys.length) {
        alert("Add and save a semester record before generating a transcript.");
        openRecordsModal();
        return;
      }
      sem = keys[0];
    }
    editingSem = sem;
    const filled = (records[sem].courses || []).filter((c) => c.marks !== "" && c.marks != null);
    if (!filled.length) {
      alert("Enter and save marks first.");
      openRecordsModal(sem);
      return;
    }
    const btn = document.getElementById("sr-tx-btn");
    const label = btn ? btn.textContent : "Generate transcript";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating…";
    }
    // Also disable matching saved-row buttons while generating
    document.querySelectorAll(".sr-saved-actions .btn-gold").forEach((b) => {
      b.disabled = true;
    });
    const html = buildTranscriptHtml(sem);
    const holder =
      global.ULC_SAVE && typeof global.ULC_SAVE.prepareCaptureHost === "function"
        ? global.ULC_SAVE.prepareCaptureHost(1122)
        : (() => {
            const d = document.createElement("div");
            d.style.cssText =
              "position:fixed;left:0;top:0;width:1122px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;";
            return d;
          })();
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const cert = holder.querySelector(".tx-cert");
    try {
      await waitForImages(cert);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (typeof html2canvas === "undefined" || !global.jspdf) {
        if (global.ULC_SAVE && global.ULC_SAVE.isNative && global.ULC_SAVE.isNative()) {
          alert("PDF libraries failed to load. Check your connection and reopen the app.");
          return;
        }
        const host = document.getElementById("printhost");
        if (host) {
          host.innerHTML = html;
          host.style.display = "block";
        }
        window.print();
        return;
      }
      const canvas =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureElement === "function"
          ? await global.ULC_SAVE.captureElement(cert, {
              width: 1122,
              windowWidth: 1122,
              imageTimeout: 8000,
            })
          : await html2canvas(
              cert,
              global.ULC_SAVE && global.ULC_SAVE.captureOpts
                ? global.ULC_SAVE.captureOpts({
                    width: 1122,
                    windowWidth: 1122,
                    imageTimeout: 8000,
                  })
                : {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: "#ffffff",
                    logging: false,
                    width: 1122,
                    windowWidth: 1122,
                    imageTimeout: 8000,
                  }
            );
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF("l", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      if (!dataUrl || dataUrl.length < 100) throw new Error("Blank PDF capture (CORS/taint)");
      pdf.addImage(dataUrl, "JPEG", 0, 0, pageW, pageH);
      const safe = String(u.name || "ULC").replace(/\s+/g, "_");
      const fname = `${safe}_Sem${sem}_Provisional.pdf`;
      const saved =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, fname)
          : await pdf.save(fname);
      if (saved && saved.canceled) return;
      try {
        if (global.MyFiles) await global.MyFiles.saveTranscriptAuto(sem, html, saved);
      } catch (_) {}
    } catch (e) {
      console.error(e);
      const diag =
        global.ULC_SAVE && global.ULC_SAVE.diagnose ? "\n\n" + global.ULC_SAVE.diagnose() : "";
      if (global.ULC_SAVE && global.ULC_SAVE.isNative && global.ULC_SAVE.isNative()) {
        if (global.ULC_SAVE.alertPdfFailed) global.ULC_SAVE.alertPdfFailed(e, diag);
        else if (!(e && e.__ulcAlerted)) {
          alert("PDF failed: " + (e && e.message ? e.message : "Try again.") + diag);
        }
      } else {
        const host = document.getElementById("printhost");
        if (host) {
          host.innerHTML = html;
          host.style.display = "block";
        }
        window.print();
      }
    } finally {
      holder.remove();
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
      document.querySelectorAll(".sr-saved-actions .btn-gold").forEach((b) => {
        b.disabled = false;
      });
    }
  }

  /* -------- GPA analysis -------- */
  function renderGpaAnalysis() {
    const u = currentUser();
    const bars = document.getElementById("gpa-bars");
    const summary = document.getElementById("gpa-analysis-summary");
    const latestEl = document.getElementById("dashLatestGpa");
    const latestLbl = document.getElementById("dashLatestGpaLbl");
    const overviewCg = document.getElementById("dashOverviewCgpa");
    const prevCgEl = document.getElementById("dashPrevCgpa");
    if (!u || !bars) return;
    const records = getRecords(u);
    const keys = Object.keys(records)
      .map(Number)
      .filter((n) => records[n]?.gpa != null)
      .sort((a, b) => a - b);
    if (!keys.length) {
      bars.innerHTML = '<div class="empty">Save semester records or subject marks to see your GPA &amp; CGPA chart.</div>';
      if (summary) summary.textContent = "";
      if (latestEl) latestEl.textContent = "—";
      if (overviewCg) overviewCg.textContent = "—";
      if (prevCgEl) prevCgEl.textContent = "—";
      if (latestLbl) latestLbl.textContent = "Latest semester GPA";
      return;
    }
    const maxG = 4;
    const latest = keys[keys.length - 1];
    const currentCgpa = cumulativeThrough(records, latest);
    const previousCgpa = keys.length > 1 ? cumulativeThrough(records, keys[keys.length - 2]) : cumulativeBefore(records, latest);
    const prevFallback =
      previousCgpa > 0
        ? previousCgpa
        : u.prevGpa != null && u.prevGpa !== ""
          ? +u.prevGpa
          : 0;
    bars.innerHTML = keys
      .map((n) => {
        const g = Number(records[n].gpa) || 0;
        const cg = cumulativeThrough(records, n);
        const h = Math.max(4, (g / maxG) * 100);
        const ch = Math.max(4, (cg / maxG) * 100);
        return `<div class="gpa-bar-col">
          <div class="gpa-bar-val">${g.toFixed(2)}</div>
          <div class="gpa-bar-pair">
            <div class="gpa-bar-track" title="Semester GPA"><div class="gpa-bar-fill" style="height:${h}%"></div></div>
            <div class="gpa-bar-track" title="CGPA to date"><div class="gpa-bar-fill cg" style="height:${ch}%"></div></div>
          </div>
          <div class="gpa-bar-lbl">Sem ${n}</div>
          <div class="gpa-bar-lbl" style="font-size:9px;opacity:.85">CG ${cg.toFixed(2)}</div>
        </div>`;
      })
      .join("");

    const latestGpa = Number(records[latest].gpa) || 0;
    if (latestEl) latestEl.textContent = latestGpa.toFixed(2);
    if (latestLbl) latestLbl.textContent = "Latest semester GPA · Sem " + latest;
    if (overviewCg) overviewCg.textContent = currentCgpa.toFixed(2);
    if (prevCgEl) prevCgEl.textContent = Number(prevFallback).toFixed(2);

    let cmp = "equal to";
    if (latestGpa > currentCgpa + 0.01) cmp = "above";
    else if (latestGpa < currentCgpa - 0.01) cmp = "below";
    if (summary) {
      summary.innerHTML = `<p class="hint" style="margin:0">Previous CGPA <b>${Number(prevFallback).toFixed(2)}</b> · Current CGPA <b>${currentCgpa.toFixed(2)}</b>. Latest semester GPA (<b>${latestGpa.toFixed(2)}</b>) is <b>${cmp}</b> your current CGPA.</p>`;
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
        "In Semester Records, tap Add semester record, enter marks, Save, then Generate transcript. The PDF matches the provisional certificate layout (ULC + UoB logos, courses table, GPA bar, and Prepared By / Coordinator / Principal signature places).",
    },
    {
      keys: ["cover", "assignment", "page"],
      answer:
        "Use Cover Page from the menu or More tools. Pick a template, fill subject and details, then Print or Download PDF. From Account you can also “Fill cover form” with your name and roll.",
    },
    {
      keys: ["application", "letter", "leave", "apology", "rechecking", "fee", "shehzad", "id card photocopy"],
      answer:
        "Open Application / Letter Generator from Home or the side menu. Pick a template (Leave, Rechecking, Apology, Fee, etc.), fill To / Subject / body and your details, then Print or Download PDF. Annex a photocopy of your Student ID card and submit the application to Sir Shehzad.",
    },
    {
      keys: ["login", "email", "password", "account", "signup", "sign up", "register", "forgot", "reset", "change password", "change email"],
      answer:
        "Forgot password? Account → Login → Forgot password → enter email. You are greeted by name and shown a new temporary password (old passwords cannot be recovered). Logged in? Tap the Settings gear (top bar or Account → Settings) to change password or email. Create an account with name, roll, email, and password (min. 6 characters).",
    },
    {
      keys: ["syllabus", "subject", "course", "llb", "credit"],
      answer:
        "Open LLB & LLM Syllabus in the menu for the LLB scheme and HEC LL.M. (2006). Semester Records uses the LLB subject list when you pick a semester.",
    },
    {
      keys: ["gpa", "cgpa", "analysis", "grade"],
      answer:
        "GPA Analysis on Home charts your saved semester GPAs and compares the latest semester to overall CGPA. Grade points follow the official ULC table (80+ = 4.00, below 50 = 0.00).",
    },
      {
        keys: ["marks", "quiz", "assignment", "mid", "final", "award", "add your marks"],
        answer:
          "Open Add your marks on Home. Pick semester and subject, enter 5 quizzes (/15), 2 assignments (/15), mid and final (obj + sub or total /100). The toolkit uses the official formula: best-3 quiz avg + assignment avg + mid×30% + final×40% → rounded marks → Grade & GP. Saving also updates Semester Records for that subject.",
      },
      {
        keys: ["photo", "profile", "picture", "cnic", "father"],
      answer:
        "Tap Edit profile on your dashboard (avatar button). Upload a photo, fill father name, CNIC, DOB, registration, session, program, and signature names, then Save.",
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
    openProfileModal,
    closeProfileModal,
    renderProfile,
    onPhotoSelected,
    saveProfile,
    renderSubjectMarks,
    onSubjectMarksSemChange,
    onSubjectMarksSubjChange,
    onSubjectMidParts,
    onSubjectFinParts,
    liveSubjectMarks,
    resetSubjectMarksForm,
    saveSubjectMarks,
    editSubjectMarks,
    deleteSubjectMarks,
    renderRecords,
    openRecordsModal,
    closeRecordsModal,
    onRecordsSemChange,
    onMarksInput,
    saveSemester,
    editSemester,
    deleteSemester,
    generateTranscript,
    renderGpaAnalysis,
    sendChat,
    onChatKey,
    getProfile,
    getRecords,
    patchProfile,
    accountKey,
    pullStudentWorkspace,
    pushStudentWorkspace,
    notifyFilesChanged: scheduleStudentCloudSync,
  };

  global.StudentDash = StudentDash;

  /* Direct binding so Edit profile works even if shell refresh never ran. */
  function bindProfileButton() {
    const btn = document.getElementById("dashProfileBtn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openProfileModal();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindProfileButton);
  } else {
    bindProfileButton();
  }
})(typeof window !== "undefined" ? window : globalThis);
