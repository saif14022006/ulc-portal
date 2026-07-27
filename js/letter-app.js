/* ULC Toolkit — Application / Letter Generator */
(function (global) {
  "use strict";

  const KEY_ALIASES = {
    fee_issue: "fee",
    character_certificate: "character",
    hostel_leave: "hostel",
    id_card: "idcard",
  };

  /** Fallback if JSON fetch fails — same content as js/letter-templates.json */
  const FALLBACK_JSON = {
    leave: {
      title: "Leave",
      subject: "APPLICATION FOR LEAVE",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I will not be able to attend my classes from [start date] to [end date] due to [reason]. This matter is beyond my control, and I will make sure to cover any lessons or work that I miss during these days.",
        "I therefore request you to kindly grant me leave for the mentioned period so that I may attend to this matter without affecting my studies.",
        "I will be very thankful to you for your kind consideration. Your support in this regard will be highly appreciated.",
      ],
    },
    rechecking: {
      title: "Rechecking",
      subject: "APPLICATION FOR RECHECKING OF PAPER",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I appeared in the [subject/paper name] examination held on [date]. After receiving my result, I am not fully satisfied with the marks awarded, as I believe my performance in the paper was better and there may be an error in the marking or totaling.",
        "I therefore request you to kindly allow the rechecking of my paper so that any mistake, if present, can be corrected. I am ready to complete any formalities or pay any fee required for this purpose.",
        "I will be very thankful to you for your kind attention to my request. Your fair consideration in this matter will mean a lot to me.",
      ],
    },
    apology: {
      title: "Apology",
      subject: "LETTER OF APOLOGY",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I sincerely apologize for [mistake, e.g. my absence / late submission / misconduct] on [date]. It was not intentional, and I deeply regret any inconvenience or disturbance that may have been caused as a result.",
        "I assure you that I have understood my mistake and that it will not be repeated in the future. I therefore request you to kindly accept my apology and give me a chance to improve.",
        "I will be very thankful to you for your kindness and understanding. Your consideration in this matter will be greatly valued.",
      ],
    },
    fee: {
      title: "Fee Issue",
      subject: "APPLICATION REGARDING FEE ISSUE",
      to: "The Principal / Accounts Office,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I am facing a problem regarding my fee [e.g. late payment / incorrect amount / installment request]. Due to [reason], I am currently unable to [pay on time / clear the full amount], although I am fully willing to fulfill my responsibility.",
        "I therefore request you to kindly [grant me extra time / correct the amount / allow me to pay in installments] so that I may continue my studies without any difficulty.",
        "I will be very thankful to you for your kind support in this matter. Your cooperation will help me a great deal during this time.",
      ],
    },
    character: {
      title: "Character Certificate",
      subject: "APPLICATION FOR CHARACTER CERTIFICATE",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I am a student of [class/semester/program] at this institution. I am in need of a character certificate, which is required for [purpose, e.g. admission / job / scholarship].",
        "I therefore request you to kindly issue me a character certificate at your earliest convenience. If any formalities or fee are required, I am fully ready to complete them.",
        "I will be very thankful to you for your kind help in this regard. Your prompt assistance will be greatly appreciated.",
      ],
    },
    hostel: {
      title: "Hostel Leave",
      subject: "APPLICATION FOR HOSTEL LEAVE",
      to: "The Hostel Warden / The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I am a resident of the college hostel, room number [room no]. I need to leave the hostel from [start date] to [end date] due to [reason], and I will return as soon as the matter is settled.",
        "I therefore request you to kindly grant me hostel leave for the mentioned period so that I may attend to this matter without any concern.",
        "I will be very thankful to you for your kind consideration. Your support in this regard will be highly appreciated.",
      ],
    },
    migration: {
      title: "Migration",
      subject: "APPLICATION FOR MIGRATION CERTIFICATE",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I am a student of [class/semester/program] at this institution. Due to [reason], I am no longer able to continue my studies here and wish to migrate to [name of institution/city].",
        "I therefore request you to kindly issue me a migration certificate along with any other required documents. I am ready to complete all necessary formalities and clear any dues for this purpose.",
        "I will be very thankful to you for your kind cooperation. Your timely help will be of great importance to me.",
      ],
    },
    idcard: {
      title: "ID Card",
      subject: "APPLICATION FOR STUDENT ID CARD",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that my student ID card has been [lost / damaged / expired]. As the ID card is necessary for using the college facilities and for my identification, I am facing difficulty without it.",
        "I therefore request you to kindly issue me a new ID card at your earliest convenience. If any fee is required for this, I am fully ready to pay it.",
        "I will be very thankful to you for your kind help in this matter. Your prompt assistance will be greatly appreciated.",
      ],
    },
    general: {
      title: "General",
      subject: "APPLICATION",
      to: "The Principal,\nUniversity Law College, Quetta.",
      body: [
        "It is stated that I wish to bring to your kind attention the following matter: [state your matter clearly]. Due to [reason], this issue requires your consideration and support.",
        "I therefore request you to kindly [state what you need] so that my concern may be resolved without any further difficulty.",
        "I will be very thankful to you for your kind consideration. Your support in this regard will be highly appreciated.",
      ],
    },
  };

  function bodyFromArray(arr) {
    return (Array.isArray(arr) ? arr : [String(arr || "")]).filter(Boolean).join("\n\n");
  }

  function normalizeKey(key) {
    return KEY_ALIASES[key] || key;
  }

  function buildTemplatesFromJson(data) {
    const out = {};
    Object.keys(data || {}).forEach((rawKey) => {
      const key = normalizeKey(rawKey);
      const item = data[rawKey] || {};
      out[key] = {
        label: item.title || key,
        to: item.to || "The Principal,\nUniversity Law College, Quetta.",
        subject: item.subject || String(item.title || "APPLICATION").toUpperCase(),
        body: bodyFromArray(item.body),
      };
    });
    return out;
  }

  let TEMPLATES = buildTemplatesFromJson(FALLBACK_JSON);
  let templatesReady = false;

  async function loadTemplatesFromJson() {
    try {
      const res = await fetch("js/letter-templates.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("templates " + res.status);
      const data = await res.json();
      const next = buildTemplatesFromJson(data);
      Object.keys(TEMPLATES).forEach((k) => delete TEMPLATES[k]);
      Object.assign(TEMPLATES, next);
      templatesReady = true;
      return TEMPLATES;
    } catch (e) {
      console.warn("[letter] using embedded templates", e?.message || e);
      const next = buildTemplatesFromJson(FALLBACK_JSON);
      Object.keys(TEMPLATES).forEach((k) => delete TEMPLATES[k]);
      Object.assign(TEMPLATES, next);
      templatesReady = true;
      return TEMPLATES;
    }
  }

  const GUIDE =
    "Before submitting:\n\n1. Print this application.\n2. Annex / staple a photocopy of your Student ID card with the application.\n3. Submit it to Sir Shehzad.\n\nDo not forget the ID card photocopy.";

  function esc(s) {
    return String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  }
  function raw(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v == null ? "" : v;
  }

  function currentTplKey() {
    return normalizeKey(raw("lt-tpl") || "leave");
  }

  function applyTemplate(key, forceBody) {
    key = normalizeKey(key);
    const t = TEMPLATES[key] || TEMPLATES.general;
    setVal("lt-tpl", key);
    document.querySelectorAll(".lt-tpl-btn").forEach((b) => {
      b.classList.toggle("active", normalizeKey(b.dataset.tpl) === key);
    });
    if (!raw("lt-to") || forceBody) setVal("lt-to", t.to);
    setVal("lt-subject", t.subject);
    if (forceBody || !raw("lt-body") || Object.keys(TEMPLATES).some((k) => TEMPLATES[k].body === raw("lt-body"))) {
      setVal("lt-body", t.body);
    }
    const u = typeof global.currentUser === "function" ? global.currentUser() : null;
    if (u && u.role !== "teacher") {
      if (!raw("lt-name")) setVal("lt-name", u.name || "");
      if (!raw("lt-roll")) setVal("lt-roll", u.roll || "");
      if (!raw("lt-sem") && u.currentSemester) setVal("lt-sem", String(u.currentSemester));
    }
    drawLetter();
  }

  function letterValues() {
    const subject = raw("lt-subject").toUpperCase() || "APPLICATION";
    return {
      to: raw("lt-to") || "The Principal,\nUniversity Law College, Quetta.",
      subject,
      salutation: raw("lt-salutation") || "Respected Sir,",
      body: raw("lt-body") || "",
      closing: raw("lt-closing") || "Yours obediently,",
      name: raw("lt-name") || "—",
      roll: raw("lt-roll") || "—",
      semester: raw("lt-sem") || "—",
      contact: raw("lt-contact") || "—",
      date: raw("lt-date")
        ? new Date(raw("lt-date") + "T00:00").toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
    };
  }

  function buildLetterHtml(v) {
    const toRaw = String(v.to || "")
      .replace(/^\s*To[,:]?\s*/i, "")
      .trim();
    const indentLab = "Subject:     "; /* label + exactly 5 spaces */
    const addrRows = esc(toRaw)
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(
        (line) =>
          `<span class="lt-meta-lab lt-ghost" aria-hidden="true">${indentLab}</span><span class="lt-meta-val">${line}</span>`
      )
      .join("");
    const bodyParas = String(v.body || "")
      .split(/\n\n+/)
      .filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    return `<div class="letter-sheet">
      <div class="lt-header">UNIVERSITY LAW COLLEGE QUETTA</div>
      <div class="lt-meta">
        <div class="lt-to-label">To,</div>
        ${addrRows || `<span class="lt-meta-lab lt-ghost" aria-hidden="true">${indentLab}</span><span class="lt-meta-val">&nbsp;</span>`}
        <span class="lt-meta-lab">${indentLab}</span><span class="lt-meta-val lt-subject-text">${esc(v.subject)}</span>
      </div>
      <div class="lt-salutation">${esc(v.salutation)}</div>
      <div class="lt-body">${bodyParas}</div>
      <div class="lt-closing">
        <div class="lt-close-line">${esc(v.closing)}</div>
        <div class="lt-applicant">
          <div class="lt-name">${esc(v.name)}</div>
          <div>Roll No.: ${esc(v.roll)}</div>
          <div>Semester: ${esc(v.semester)}</div>
          <div>Contact No.: ${esc(v.contact)}</div>
        </div>
      </div>
    </div>`;
  }

  function drawLetter() {
    const el = document.getElementById("letterPreview");
    if (!el) return;
    el.innerHTML = buildLetterHtml(letterValues());
  }

  function showSubmitGuide() {
    alert(GUIDE);
  }

  function printLetter() {
    drawLetter();
    const host = document.getElementById("printhost");
    if (!host) return;
    host.innerHTML = `<div class="print-letter" style="width:794px">${buildLetterHtml(letterValues())}</div>`;
    showSubmitGuide();
    window.print();
  }

  async function downloadLetterPdf() {
    drawLetter();
    const btn = document.getElementById("lt-pdf-btn");
    const label = btn ? btn.textContent : "Download PDF";
    showSubmitGuide();
    if (typeof html2canvas === "undefined" || !global.jspdf) {
      if (global.ULC_SAVE && global.ULC_SAVE.isNative && global.ULC_SAVE.isNative()) {
        alert("PDF libraries failed to load. Check your connection and reopen the app.");
        return;
      }
      printLetter();
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating…";
    }
    const holder =
      global.ULC_SAVE && typeof global.ULC_SAVE.prepareCaptureHost === "function"
        ? global.ULC_SAVE.prepareCaptureHost(794)
        : (() => {
            const d = document.createElement("div");
            d.style.cssText =
              "position:fixed;left:0;top:0;width:794px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;";
            return d;
          })();
    const wrap = document.createElement("div");
    wrap.innerHTML = buildLetterHtml(letterValues());
    const sheet = wrap.firstElementChild;
    sheet.style.width = "794px";
    sheet.style.minHeight = "1123px";
    sheet.style.boxShadow = "none";
    sheet.style.border = "none";
    holder.appendChild(sheet);
    document.body.appendChild(holder);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas =
        global.ULC_SAVE && typeof global.ULC_SAVE.captureElement === "function"
          ? await global.ULC_SAVE.captureElement(sheet, { width: 794, windowWidth: 794 })
          : await html2canvas(
              sheet,
              global.ULC_SAVE && global.ULC_SAVE.captureOpts
                ? global.ULC_SAVE.captureOpts({ width: 794, windowWidth: 794 })
                : {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: "#ffffff",
                    logging: false,
                    width: 794,
                    windowWidth: 794,
                  }
            );
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      if (!dataUrl || dataUrl.length < 100) throw new Error("Blank PDF capture (CORS/taint)");
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pageH) {
        pdf.addImage(dataUrl, "JPEG", 0, 0, imgW, imgH);
      } else {
        const h = pageH;
        const w = (canvas.width * h) / canvas.height;
        pdf.addImage(dataUrl, "JPEG", (pageW - w) / 2, 0, w, h);
      }
      const name = (raw("lt-name") || "ULC").replace(/\s+/g, "_");
      const kind = currentTplKey();
      const fname = `${name}_${kind}_application.pdf`;
      const saved =
        global.ULC_SAVE && typeof global.ULC_SAVE.saveJsPdf === "function"
          ? await global.ULC_SAVE.saveJsPdf(pdf, fname)
          : await pdf.save(fname);
      if (saved && saved.canceled) return;
      try {
        if (global.MyFiles) {
          const previewHtml =
            (document.getElementById("letterPreview") && document.getElementById("letterPreview").innerHTML) ||
            buildLetterHtml(letterValues());
          await global.MyFiles.saveLetterAuto(letterValues(), kind, previewHtml, saved);
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
      holder.remove();
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  async function initLetterView() {
    await loadTemplatesFromJson();
    const dateEl = document.getElementById("lt-date");
    if (dateEl && !dateEl.value) {
      const d = new Date();
      dateEl.value = d.toISOString().slice(0, 10);
    }
    const key = currentTplKey() || "leave";
    applyTemplate(key, true);
    drawLetter();
  }

  function pickTemplate(key) {
    applyTemplate(key, true);
  }

  global.LetterApp = {
    get TEMPLATES() { return TEMPLATES; },
    loadTemplatesFromJson,
    applyTemplate,
    pickTemplate,
    drawLetter,
    printLetter,
    downloadLetterPdf,
    initLetterView,
    showSubmitGuide,
    letterValues,
    currentTplKey,
    buildLetterHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
