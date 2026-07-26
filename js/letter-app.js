/* ULC Toolkit — Application / Letter Generator */
(function (global) {
  "use strict";

  const TEMPLATES = {
    leave: {
      label: "Leave Application",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR LEAVE",
      body:
        "I am a student of this college. I cannot attend classes from __________ to __________ because __________.\n\nPlease grant me leave for these days. Thank you.",
    },
    rechecking: {
      label: "Rechecking Application",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR RECHECKING OF PAPER",
      body:
        "I appeared in the __________ exam (subject) on __________ under Roll No. __________.\n\nI request rechecking of my answer script. I will pay any fee required by the college.\n\nPlease look into this. Thank you.",
    },
    apology: {
      label: "Apology Letter",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "LETTER OF APOLOGY",
      body:
        "I am writing to apologise for __________.\n\nI am sorry for this mistake. It will not happen again. Please accept my apology.\n\nThank you for your understanding.",
    },
    fee: {
      label: "Fee Issue Application",
      to: "The Principal / Accounts Office,\nUniversity Law College, Quetta.",
      subject: "APPLICATION REGARDING FEE ISSUE",
      body:
        "I have a fee problem for session __________.\n\nIssue: __________ (for example: late fee, wrong challan, installment, or refund).\n\nPlease help resolve this as soon as possible. Thank you.",
    },
    character: {
      label: "Character Certificate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR CHARACTER CERTIFICATE",
      body:
        "I am a student of this college. I need a Character Certificate for __________.\n\nPlease issue it. Required documents are attached.\n\nThank you.",
    },
    hostel: {
      label: "Hostel Leave",
      to: "The Hostel Warden / The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR HOSTEL LEAVE",
      body:
        "I live in the college hostel. I need hostel leave from __________ to __________ because __________.\n\nPlease allow me leave. I will return on time and follow hostel rules.\n\nThank you.",
    },
    migration: {
      label: "Migration Certificate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR MIGRATION CERTIFICATE",
      body:
        "I need a Migration Certificate for admission / transfer to __________.\n\nMy dues are cleared. Documents are attached. Please issue the certificate.\n\nThank you.",
    },
    idcard: {
      label: "ID Card Issue / Duplicate",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION FOR STUDENT ID CARD",
      body:
        "Please issue me a new / duplicate Student ID card. Reason: __________ (lost, damaged, or not received).\n\nAny required papers or fee challan are attached.\n\nThank you.",
    },
    general: {
      label: "General Application",
      to: "The Principal,\nUniversity Law College, Quetta.",
      subject: "APPLICATION",
      body:
        "I want to bring to your notice that __________.\n\nI request you to __________.\n\nThank you.",
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
