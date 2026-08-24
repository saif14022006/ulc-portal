/* ULC Toolkit — Syllabus browser (5Y LLB, 4Y LLB, LLM) with course detail sheet */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s || "").replace(/[<>&"']/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function norm(t) {
    return String(t || "")
      .replace(/\s+/g, " ")
      .replace(/–/g, "-")
      .trim();
  }

  function stripPart(title) {
    return norm(title)
      .replace(/\s*[-–]\s*[IVX0-9]+$/i, "")
      .replace(/\s*\(.*?\)\s*$/g, "")
      .trim();
  }

  /* Final Curriculum LLB.pdf (5Y) — hard overrides so SW/cache/fuzzy catalog cannot show Western Jurisprudence for Islamic Jurisprudence. */
  const LLB5_PDF_DETAIL = {
    "Islamic Jurisprudence - I": {
      title: "Islamic Jurisprudence - I",
      program: "LLB 5 Years",
      category: "Major / scheme course",
      outcomes: [
        "Explain Islamic legal theories and their philosophical, historical and sociological basis.",
        "Identify the history and growth of the Muslim legal system and the primary and secondary sources of Islamic law (Qur’an, Traditions, Ijma and custom).",
        "Analyse juristic deduction methods including Qiyas, Istehsan, Istedlal, Ijtihad and Taqlid.",
        "Apply source and usul concepts to guided problem questions under the HEC five-year scheme.",
      ],
      outline: [
        "Islamic legal theories: philosophical, historical and sociological basis",
        "History and growth of the Muslim legal system",
        "Primary sources: Qur’an and Traditions (Sunnah)",
        "Secondary sources: Ijma and custom",
        "Juristic deduction: Qiyas, Istehsan, Istedlal, Ijtihad and Taqlid",
      ],
      books: [
        "Coulson — A History of Islamic Law",
        "Nyazee — Outlines of Islamic Jurisprudence",
        "Nyazee — Theories of Islamic Law",
        "Abdur Rahim — The Principles of Islamic Jurisprudence",
        "Schacht — An Introduction to Islamic Law",
      ],
      sourceNote:
        "Course detail from HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Titles and credit hours match that PDF; topics and books follow the official course description.",
    },
    "Islamic Jurisprudence - II": {
      title: "Islamic Jurisprudence - II",
      program: "LLB 5 Years",
      category: "Major / scheme course",
      outcomes: [
        "Explain the practical Islamic legal concepts that continue from Islamic Jurisprudence-I: acts, rights and obligations, legal capacity, ownership and possession.",
        "Analyse Islamic jurisprudence on family laws, torts and crimes, punishments, procedure and evidence.",
        "Examine constitutional and administrative dimensions of Islamic law and the rules regulating relations between Muslims and non-Muslims.",
        "Apply these concepts to problem questions and comparative discussion with Pakistani legal practice as taught.",
      ],
      outline: [
        "Acts, rights and obligations in Islamic law",
        "Legal capacity (ahliyya)",
        "Ownership and possession",
        "Family laws (overview within Islamic jurisprudence)",
        "Torts and crimes; punishments",
        "Procedure and evidence",
        "Constitutional and administrative law in an Islamic framework",
        "Relations between Muslims and non-Muslims",
      ],
      books: [
        "Ahmad Hassan — Principles of Islamic Jurisprudence",
        "Mohammad Hashim Kamali — Principles of Islamic Jurisprudence",
        "Nyazee — Outlines of Islamic Jurisprudence",
        "Abdur Rahim — The Principles of Islamic Jurisprudence",
      ],
      sourceNote:
        "Course detail from HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Titles and credit hours match that PDF; topics and books follow the official course description.",
    },
  };

  function courseLookup(title, program) {
    const catalog = global.ULC_SYLLABUS_CATALOG?.courses || {};
    const t = norm(title);
    const prog = String(program || "").trim();

    if (prog === "LLB 5 Years") {
      const bag = global.ULC_SYLLABUS_CATALOG?.llb5?.details || {};
      const pdf = bag[t] || LLB5_PDF_DETAIL[t];
      if (pdf && (pdf.outline || pdf.outcomes)) {
        return {
          title: t,
          program: prog,
          category: "Major / scheme course",
          outcomes: pdf.outcomes,
          outline: pdf.outline,
          books: pdf.books,
          sourceNote: pdf.sourceNote,
        };
      }
    }

    function matchInProgram(p) {
      if (!p) return null;
      const exact = catalog[p + "||" + t];
      if (exact) return exact;
      const prefix = p + "||";
      const tl = t.toLowerCase();
      for (const k of Object.keys(catalog)) {
        if (!k.startsWith(prefix)) continue;
        const titlePart = k.slice(prefix.length);
        if (titlePart.toLowerCase() === tl) return catalog[k];
      }
      return null;
    }

    // Prefer programme-scoped entry (keeps 4Y HEC 2025 CLOs off 5Y courses).
    const scoped = matchInProgram(prog);
    if (scoped) {
      // Guard: never show bare Western Jurisprudence outline under an Islamic Jurisprudence title.
      const o0 = (scoped.outline && scoped.outline[0]) || "";
      if (/islamic jurisprudence/i.test(t) && /natural law,\s*positivism/i.test(o0)) {
        if (LLB5_PDF_DETAIL[t]) return LLB5_PDF_DETAIL[t];
      }
      return scoped;
    }

    // Legacy flat keys (if any) — exact title only, no fuzzy cross-match.
    if (catalog[t]) return catalog[t];
    const keys = Object.keys(catalog);
    const tl = t.toLowerCase();
    for (const k of keys) {
      const titlePart = k.includes("||") ? k.split("||").slice(1).join("||") : k;
      if (titlePart.toLowerCase() === tl) return catalog[k];
    }

    return {
      title: t,
      program: prog || "",
      outcomes: [
        "Demonstrate understanding of the core principles of this subject as taught under the university scheme.",
        "Analyse key doctrines, statutes and authorities relevant to the course.",
        "Apply learning to problem questions, drafting or advocacy tasks as required.",
      ],
      outline: [
        "Core concepts and statutory / doctrinal framework",
        "Leading authorities and contemporary issues",
        "Practical application as prescribed by the department",
      ],
      books: [
        "Primary statutes and rules prescribed for this course",
        "University / department reading list",
        "Leading case digests relevant to the subject",
      ],
      sourceNote:
        "Detailed syllabi are set by the offering department under HEC guidelines. The topics and books below are general study aids.",
    };
  }

  function ensureSheet() {
    let sheet = document.getElementById("courseDetailSheet");
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "courseDetailSheet";
    sheet.className = "course-sheet";
    sheet.setAttribute("aria-hidden", "true");
    sheet.innerHTML = `
      <div class="course-sheet-bg" data-close="1"></div>
      <div class="course-sheet-card" role="dialog" aria-modal="true" aria-labelledby="courseSheetTitle">
        <div class="course-sheet-head">
          <div>
            <div class="course-sheet-code" id="courseSheetCode"></div>
            <h3 id="courseSheetTitle"></h3>
            <p class="course-sheet-meta" id="courseSheetMeta"></p>
          </div>
          <button type="button" class="course-sheet-x" data-close="1" aria-label="Close">×</button>
        </div>
        <div class="course-sheet-body" id="courseSheetBody"></div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute("data-close") === "1") closeCourse();
    });
    return sheet;
  }

  function syllabusUnlocked() {
    const u = typeof global.currentUser === "function" ? global.currentUser() : null;
    return !!(u && (u.role === "student" || u.role === "teacher" || !u.role));
  }

  function requireSignIn() {
    alert("Sign in first to view course learning outcomes, outlines, and recommended books.");
    if (typeof global.go === "function") global.go("account");
  }

  function openCourse(payload) {
    if (!syllabusUnlocked()) {
      requireSignIn();
      return;
    }
    const { code, title, ch, category, program } = payload;
    const detail = courseLookup(title, program);
    const sheet = ensureSheet();
    document.getElementById("courseSheetCode").textContent = code || "Course";
    document.getElementById("courseSheetTitle").textContent = title || detail.title;
    document.getElementById("courseSheetMeta").textContent = [
      program || "",
      category || detail.category || "",
      ch != null ? ch + " CH" : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const outcomes = (detail.outcomes || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const outline = (detail.outline || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const books = (detail.books || []).map((x) => `<li>${esc(x)}</li>`).join("");

    document.getElementById("courseSheetBody").innerHTML = `
      <p class="course-sheet-note">${esc(detail.sourceNote || "")}</p>
      <section>
        <h4>Learning outcomes</h4>
        <ul>${outcomes || "<li>Not listed in the HEC extract for this title.</li>"}</ul>
      </section>
      <section>
        <h4>Syllabus / outline</h4>
        <ul>${outline}</ul>
      </section>
      <section>
        <h4>Recommended books &amp; materials</h4>
        <ul>${books}</ul>
      </section>`;

    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closeCourse() {
    const sheet = document.getElementById("courseDetailSheet");
    if (!sheet) return;
    sheet.classList.remove("show");
    sheet.setAttribute("aria-hidden", "true");
  }

  function subjBtn(code, title, ch, category, program) {
    const payload = esc(
      JSON.stringify({ code, title, ch, category, program })
    );
    const locked = !syllabusUnlocked();
    const hint = locked
      ? `<span class="subj-hint subj-hint-locked"><svg class="book-lock-ico" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Sign in to view outcomes, outline &amp; books</span>`
      : `<span class="subj-hint">Tap for outcomes, outline &amp; books</span>`;
    return `<button type="button" class="subj subj-btn${locked ? " subj-btn-locked" : ""}" data-course="${payload}">
      <div class="code">${esc(code)}</div>
      <div class="nm">${esc(title)}${hint}</div>
      <div class="ch">${esc(String(ch))} CH</div>
    </button>`;
  }

  function renderLlb5Html() {
    const llb5 = global.ULC_SYLLABUS_CATALOG?.llb5;
    const SYLLABUS = global.SYLLABUS || {};
    const ELECTIVES = (llb5 && llb5.electives) || global.ELECTIVES || [];
    const intern = llb5?.internship;
    const internNote = intern
      ? `<div class="intern"><b>Internship (${esc(String(intern.ch))} CH)</b> — ${esc(intern.note)}.</div>`
      : `<div class="intern"><b>Internship (3 CH)</b> — After Completion of 8th Semester And Before 10th Semester (During Summer Vacations).</div>`;
    return (
      `<p class="syl-note">Scheme locked to <b>Final Curriculum LLB.pdf</b> (HEC LLB 5 Years Revised 2015 · 166 CH). Course titles, codes and credit hours match that PDF and must not be changed. Tap any course for study aids (outcomes/outline/books may still vary by university).</p>
      <div class="sem-acc">` +
      Object.keys(SYLLABUS)
        .map((n) => {
          const subs = SYLLABUS[n];
          const cr = subs.reduce((a, x) => a + x[2], 0);
          let body = subs
            .map((x) => subjBtn(x[0], x[1], x[2], "Major / scheme course", "LLB 5 Years"))
            .join("");
          if (+n === 8) body += internNote;
          if (+n === 9 || +n === 10) {
            body += `<details class="elec-wrap"><summary>Elective courses — choose any four</summary><div class="elec-list">${ELECTIVES.map(
              (e) =>
                `<button type="button" class="elec-link" data-course="${esc(
                  JSON.stringify({
                    code: "LLB XXX",
                    title: e,
                    ch: 3,
                    category: "Elective",
                    program: "LLB 5 Years",
                  })
                )}">• ${esc(e)}</button>`
            ).join("")}</div></details>`;
          }
          return `<details>
        <summary>
          <div class="sem-num">${n}</div>
          <div class="sem-meta"><div class="ttl">Semester ${n}</div><div class="sub">${subs.length} courses · ${cr} credit hours</div></div>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div class="sem-body">${body}</div>
      </details>`;
        })
        .join("") +
      `</div>`
    );
  }

  function renderLlb4Html() {
    const llb4 = global.ULC_SYLLABUS_CATALOG?.llb4;
    if (!llb4) {
      return `<p class="syl-note">4-year LLB data is loading… Refresh the page if this message stays.</p>`;
    }
    const clusters = llb4.electiveClusters || {};
    const clusterHtml = Object.keys(clusters)
      .map((name) => {
        const list = clusters[name] || [];
        return `<details class="elec-wrap"><summary>${esc(name)} (${list.length})</summary><div class="elec-list">${list
          .map(
            (e) =>
              `<button type="button" class="elec-link" data-course="${esc(
                JSON.stringify({
                  code: "Elective",
                  title: e,
                  ch: 3,
                  category: name,
                  program: "LLB 4 Years",
                })
              )}">• ${esc(e)}</button>`
          )
          .join("")}</div></details>`;
      })
      .join("");

    const semHtml = Object.keys(llb4.semesters)
      .map((n) => {
        const subs = llb4.semesters[n] || [];
        const cr = subs.reduce((a, x) => a + (+x.ch || 0), 0);
        const body = subs
          .map((x) => subjBtn(x.code, x.title, x.ch, x.category, "LLB 4 Years"))
          .join("");
        return `<details>
        <summary>
          <div class="sem-num">${n}</div>
          <div class="sem-meta"><div class="ttl">Semester ${n}</div><div class="sub">${subs.length} courses · ${cr} credit hours</div></div>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div class="sem-body">${body}</div>
      </details>`;
      })
      .join("");

    return `<p class="syl-note">${esc(llb4.meta?.source || "HEC LLB Curriculum 2025")} · minimum ${esc(
      String(llb4.meta?.minCredits || 146)
    )} CH · 8 semesters. Tap any course for HEC learning outcomes (where published), outline topics and recommended books. Internship (3 CH) is a mandatory degree requirement in addition to the semester courses.</p>
      <div class="sem-acc">${semHtml}</div>
      <details class="elec-wrap" style="margin-top:12px" open>
        <summary>Elective clusters (choose 6 electives · 18 CH)</summary>
        ${clusterHtml}
      </details>`;
  }

  function renderLlmHtml() {
    const LLM = global.LLM_SYLLABUS;
    if (!LLM) return "";
    const c = LLM.compulsory
      .map((x) => subjBtn(x[0], x[1], x[2], "Compulsory", "LLM"))
      .join("");
    const t = LLM.thesis.map((x) => subjBtn(x[0], x[1], x[2], "Thesis", "LLM")).join("");
    const o = LLM.optional.map((x) => subjBtn(x[0], x[1], x[2], "Optional", "LLM")).join("");
    return `<p class="syl-note">${esc(LLM.note)}</p>
      <div class="sem-acc">
        <details open>
          <summary>
            <div class="sem-num">C</div>
            <div class="sem-meta"><div class="ttl">Compulsory</div><div class="sub">Required for all LL.M. students</div></div>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div class="sem-body">${c}</div>
        </details>
        <details>
          <summary>
            <div class="sem-num">O</div>
            <div class="sem-meta"><div class="ttl">Optional courses</div><div class="sub">${LLM.optional.length} HEC titles · 4 CH each</div></div>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div class="sem-body">${o}</div>
        </details>
        <details>
          <summary>
            <div class="sem-num">T</div>
            <div class="sem-meta"><div class="ttl">Thesis</div><div class="sub">Research component</div></div>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div class="sem-body">${t}</div>
        </details>
      </div>`;
  }

  function render() {
    const el = document.getElementById("sylRoot") || document.getElementById("semAcc");
    if (!el) return;
    el.innerHTML = `
    <details class="syl-prog" id="sylLlb4">
      <summary>
        <div class="syl-badge">4Y</div>
        <div class="syl-meta"><div class="ttl">LLB 4 Years</div><div class="sub">HEC Curriculum 2025 · 8 semesters · 146 CH min</div></div>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="syl-body">${renderLlb4Html()}</div>
    </details>
    <details class="syl-prog" id="sylLlb5">
      <summary>
        <div class="syl-badge">5Y</div>
        <div class="syl-meta"><div class="ttl">LLB 5 Years</div><div class="sub">Final Curriculum LLB.pdf · HEC Revised 2015 · 10 semesters · 166 CH</div></div>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="syl-body">${renderLlb5Html()}</div>
    </details>
    <details class="syl-prog" id="sylLlm">
      <summary>
        <div class="syl-badge">LLM</div>
        <div class="syl-meta"><div class="ttl">LLM Syllabus</div><div class="sub">HEC LL.M. Revised 2006 · coursework + thesis</div></div>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </summary>
      <div class="syl-body">${renderLlmHtml()}</div>
    </details>`;

    if (!el._sylBound) {
      el._sylBound = true;
      el.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-course]");
        if (!btn) return;
        e.preventDefault();
        try {
          openCourse(JSON.parse(btn.getAttribute("data-course")));
        } catch (err) {
          console.warn("[syllabus] bad course payload", err);
        }
      });
    }
  }

  global.SyllabusApp = {
    render,
    openCourse,
    closeCourse,
    courseLookup,
  };

  // Back-compat for index.html helpers
  global.renderSyllabusAcc = render;
  global.renderLlbSemestersHtml = renderLlb5Html;
  global.renderLlmHtml = renderLlmHtml;
})(typeof window !== "undefined" ? window : globalThis);
