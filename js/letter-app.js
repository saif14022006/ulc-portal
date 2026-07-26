/* ULC Toolkit — Application / Letter Generator */
(function (global) {
  "use strict";

  const TEMPLATES = {
    leave: {
      label: "Leave Application",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR LEAVE",
      body:
        "Most respectfully, it is stated that I am a student of this college. Due to some urgent personal/family reasons, I am unable to attend my classes from __________ to __________.\n\nI therefore request you to kindly grant me leave for the said period. I shall be highly obliged.",
    },
    rechecking: {
      label: "Rechecking Application",
      to: "The Controller of Examinations /\nThe Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR RECHECKING OF PAPER",
      body:
        "Most respectfully, it is stated that I appeared in the examination of __________ (subject) held on __________ under Roll No. __________.\n\nI am not satisfied with the marks awarded to me. I therefore request you to kindly arrange for rechecking / re-evaluation of my answer script. The required fee (if any) will be deposited as per college rules.\n\nI shall be highly obliged for your kind consideration.",
    },
    apology: {
      label: "Apology Letter",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "LETTER OF APOLOGY",
      body:
        "Most respectfully, it is stated that I sincerely apologise for __________ (mention the matter, e.g. absence / late submission / misconduct).\n\nI assure you that such an act will not be repeated in future. I kindly request you to forgive me and accept this apology.\n\nI shall remain grateful for your kind consideration.",
    },
    fee: {
      label: "Fee Issue Application",
      to: "The Principal /\nAccounts Office,\nUniversity Law College, Quetta.",
      subject: "APPLICATION REGARDING FEE ISSUE",
      body:
        "Most respectfully, it is stated that I am facing a difficulty regarding my college fee / dues for the session __________.\n\nDetails of the issue: __________ (e.g. late fee, challan error, installment request, fee refund).\n\nI therefore request you to kindly look into the matter and guide / resolve it at the earliest. I shall be highly obliged.",
    },
    character: {
      label: "Character Certificate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR CHARACTER CERTIFICATE",
      body:
        "Most respectfully, it is stated that I am / was a bonafide student of this college. I require a Character Certificate for __________ (purpose).\n\nI therefore request you to kindly issue me a Character Certificate at the earliest. All required documents are attached.\n\nI shall be highly obliged.",
    },
    hostel: {
      label: "Hostel Leave",
      to: "The Hostel Warden /\nThe Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR HOSTEL LEAVE",
      body:
        "Most respectfully, it is stated that I am a hostel resident of this college. Due to __________ (reason), I request leave from the hostel from __________ to __________.\n\nI therefore kindly request you to grant me hostel leave for the said period. I shall return on time and abide by hostel rules.\n\nI shall be highly obliged.",
    },
    migration: {
      label: "Migration Certificate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR MIGRATION CERTIFICATE",
      body:
        "Most respectfully, it is stated that I require a Migration Certificate for admission / transfer to __________.\n\nI therefore request you to kindly issue my Migration Certificate. I have cleared all dues and attached the required documents.\n\nI shall be highly obliged.",
    },
    idcard: {
      label: "ID Card Issue / Duplicate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR STUDENT ID CARD",
      body:
        "Most respectfully, it is stated that I request issuance of a new / duplicate Student Identity Card because __________ (lost / damaged / not received).\n\nI therefore kindly request you to issue my Student ID Card. FIR / affidavit / fee challan (if required) is attached.\n\nI shall be highly obliged.",
    },
    general: {
      label: "General Application",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION",
      body:
        "Most respectfully, it is stated that __________.\n\nI therefore request you to kindly __________.\n\nI shall be highly obliged for your kind consideration.",
    },
  };

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
    return raw("lt-tpl") || "leave";
  }

  function applyTemplate(key, forceBody) {
    const t = TEMPLATES[key] || TEMPLATES.general;
    setVal("lt-tpl", key);
    document.querySelectorAll(".lt-tpl-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tpl === key);
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
    const toLines = esc(v.to).replace(/\n/g, "<br>");
    const bodyParas = String(v.body || "")
      .split(/\n\n+/)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("");
    return `<div class="letter-sheet">
      <div class="lt-college">UNIVERSITY LAW COLLEGE, QUETTA</div>
      <div class="lt-affil">Affiliated with the University of Balochistan</div>
      <div class="lt-date">Date: ${esc(v.date)}</div>
      <div class="lt-to">${toLines}</div>
      <div class="lt-subject">SUBJECT: ${esc(v.subject)}</div>
      <div class="lt-salutation">${esc(v.salutation)}</div>
      <div class="lt-body">${bodyParas}</div>
      <div class="lt-closing">
        <div class="lt-close-line">${esc(v.closing)}</div>
        <div class="lt-applicant">
          <div class="lt-name">${esc(v.name)}</div>
          <div>Roll No.: ${esc(v.roll)}</div>
          <div>Semester: ${esc(v.semester)}</div>
          <div>Contact: ${esc(v.contact)}</div>
        </div>
      </div>
      <div class="lt-note">Annex / staple a photocopy of your Student ID card · Submit to Sir Shehzad</div>
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
      printLetter();
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating…";
    }
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;";
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
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: 794,
        windowWidth: 794,
      });
      const { jsPDF } = global.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, imgW, imgH);
      } else {
        /* scale to fit height */
        const h = pageH;
        const w = (canvas.width * h) / canvas.height;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageW - w) / 2, 0, w, h);
      }
      const name = (raw("lt-name") || "ULC").replace(/\s+/g, "_");
      const kind = currentTplKey();
      pdf.save(`${name}_${kind}_application.pdf`);
    } catch (e) {
      console.error(e);
      printLetter();
    } finally {
      holder.remove();
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  function initLetterView() {
    const dateEl = document.getElementById("lt-date");
    if (dateEl && !dateEl.value) {
      const d = new Date();
      dateEl.value = d.toISOString().slice(0, 10);
    }
    const key = currentTplKey() || "leave";
    applyTemplate(key, !raw("lt-body"));
    drawLetter();
  }

  function pickTemplate(key) {
    applyTemplate(key, true);
  }

  global.LetterApp = {
    TEMPLATES,
    applyTemplate,
    pickTemplate,
    drawLetter,
    printLetter,
    downloadLetterPdf,
    initLetterView,
    showSubmitGuide,
  };
})(typeof window !== "undefined" ? window : globalThis);
