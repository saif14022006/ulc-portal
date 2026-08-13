/* ULC Toolkit — HEC Recommended Books browser */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s || "").replace(/[<>&"']/g, function (c) {
      return ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function norm(t) {
    return String(t || "").replace(/\s+/g, " ").replace(/–/g, "-").trim();
  }

  function stripPart(title) {
    return norm(title).replace(/\s*[-–]\s*[IVX0-9]+$/i, "").replace(/\s*\(.*?\)\s*$/g, "").trim();
  }

  function courseLookup(title) {
    var catalog = (global.ULC_SYLLABUS_CATALOG || {}).courses || {};
    var t = norm(title);
    if (catalog[t]) return catalog[t];
    var keys = Object.keys(catalog);
    var tl = t.toLowerCase(), base = stripPart(t).toLowerCase();
    for (var i = 0; i < keys.length; i++) { if (keys[i].toLowerCase() === tl) return catalog[keys[i]]; }
    for (var i = 0; i < keys.length; i++) { if (stripPart(keys[i]).toLowerCase() === base) return catalog[keys[i]]; }
    for (var i = 0; i < keys.length; i++) {
      var a = keys[i].toLowerCase();
      if (a.includes(tl) || tl.includes(a) || a.includes(base) || base.includes(a)) return catalog[keys[i]];
    }
    return null;
  }

  function booksUnlocked() {
    var u = typeof global.currentUser === "function" ? global.currentUser() : null;
    return !!(u && (u.role === "student" || u.role === "teacher" || !u.role));
  }

  function requireSignIn(e) {
    if (e && e.preventDefault) e.preventDefault();
    alert("Sign in first to view, download, or search HEC books and statutes.");
    if (typeof global.go === "function") global.go("account");
  }

  var LOCK_SVG =
    '<svg class="book-lock-ico" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
    '<rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>";

  function lockedControl() {
    return (
      '<button type="button" class="book-link book-locked" title="Sign in to unlock" aria-label="Sign in to unlock">' +
      LOCK_SVG +
      " Sign in" +
      "</button>"
    );
  }

  function bookHtml(b) {
    var action;
    if (!booksUnlocked()) {
      action = lockedControl();
    } else {
      var cls, label;
      if (b.drive) {
        cls = "book-link book-drive";
        label = "Download";
      } else if (b.free) {
        cls = "book-link book-free";
        label = "View";
      } else {
        cls = "book-link book-search";
        label = "Search";
      }
      action =
        '<a class="' + cls + '" href="' + esc(b.url) + '" target="_blank" rel="noopener">' +
        label +
        "</a>";
    }
    return (
      '<div class="book-item">' +
      '<span class="book-title">' +
      esc(b.title) +
      "</span>" +
      action +
      "</div>"
    );
  }

  function subjectCard(title, booksWithLinks) {
    var bks = (booksWithLinks || []).map(bookHtml).join("");
    return '<div class="book-subj"><div class="book-subj-title">' + esc(title) + '</div>' + bks + '</div>';
  }

  function semAccordion(label, badge, subjects) {
    var body = subjects.map(function (s) { return subjectCard(s.title, s.books); }).join("");
    return '<details>' +
      '<summary>' +
      '<div class="sem-num">' + esc(badge) + '</div>' +
      '<div class="sem-meta"><div class="ttl">' + esc(label) + '</div><div class="sub">' + subjects.length + ' subjects</div></div>' +
      '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
      '</summary>' +
      '<div class="sem-body">' + body + '</div>' +
      '</details>';
  }

  function gatherSubjects(titles) {
    return titles.map(function (t) {
      var c = courseLookup(t);
      return { title: t, books: c ? (c.booksWithLinks || []) : [] };
    });
  }

  function renderLlb5() {
    var S = global.SYLLABUS || {};
    var sems = Object.keys(S);
    if (!sems.length) return "";
    return sems.map(function (n) {
      var titles = S[n].map(function (x) { return x[1]; });
      return semAccordion("Semester " + n, n, gatherSubjects(titles));
    }).join("");
  }

  function renderLlb4() {
    var llb4 = (global.ULC_SYLLABUS_CATALOG || {}).llb4;
    if (!llb4) return "";
    return Object.keys(llb4.semesters).map(function (n) {
      var titles = llb4.semesters[n].map(function (x) { return x.title; });
      return semAccordion("Semester " + n, n, gatherSubjects(titles));
    }).join("");
  }

  function renderLlm() {
    var L = global.LLM_SYLLABUS;
    if (!L) return "";
    var all = [].concat(L.compulsory || [], L.thesis || [], L.optional || []);
    var titles = all.map(function (x) { return x[1]; });
    return semAccordion("All LLM Courses", "LLM", gatherSubjects(titles));
  }

  function progAccordion(badge, title, sub, innerHtml, opts) {
    var body = (opts && opts.flat)
      ? '<div class="syl-body">' + innerHtml + '</div>'
      : '<div class="syl-body"><div class="sem-acc">' + innerHtml + '</div></div>';
    return '<details class="syl-prog">' +
      '<summary>' +
      '<div class="syl-badge">' + esc(badge) + '</div>' +
      '<div class="syl-meta"><div class="ttl">' + esc(title) + '</div><div class="sub">' + esc(sub) + '</div></div>' +
      '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
      '</summary>' +
      body +
      '</details>';
  }

  var STATUTES = [
    { title: "Anti-Money Laundering Act, 2010", url: "https://www.pakistani.org/pakistan/legislation/2010/actVIIof2010.html" },
    { title: "Anti-Rape (Investigation and Trial) Act, 2021", url: "https://na.gov.pk/uploads/documents/1638262992_952.pdf" },
    { title: "Anti-Terrorism Act, 1997", url: "https://www.pakistani.org/pakistan/legislation/1997/actXXVIIof1997.html" },
    { title: "Arbitration Act, 1940", url: "https://www.pakistani.org/pakistan/legislation/1940/actXof1940.html" },
    { title: "Arms Act, 1878", url: "https://www.pakistani.org/pakistan/legislation/1878/actXIof1878.html" },
    { title: "Bankers' Books Evidence Act, 1891", url: "https://www.pakistani.org/pakistan/legislation/1891/actXVIIIof1891.html" },
    { title: "Banking Companies Ordinance, 1962", url: "https://www.pakistani.org/pakistan/legislation/1962/ordinanceLVIIof1962.html" },
    { title: "Benami Transactions (Prohibition) Act, 2017", url: "https://na.gov.pk/uploads/documents/1487147685_166.pdf" },
    { title: "Bonded Labour System (Abolition) Act, 1992", url: "https://www.pakistani.org/pakistan/legislation/1992/actIIIof1992.html" },
    { title: "Cantonments Act, 1924", url: "https://www.pakistani.org/pakistan/legislation/1924/actIIof1924.html" },
    { title: "Child Marriage Restraint Act, 1929", url: "https://www.pakistani.org/pakistan/legislation/1929/actXIXof1929.html" },
    { title: "Civil Servants Act, 1973", url: "https://www.pakistani.org/pakistan/legislation/1973/actLXXIof1973.html" },
    { title: "Code of Civil Procedure, 1908 (CPC)", url: "https://www.pakistani.org/pakistan/legislation/1908/actVof1908.html" },
    { title: "Code of Criminal Procedure, 1898 (CrPC)", url: "https://www.pakistani.org/pakistan/legislation/1898/actVof1898.html" },
    { title: "Companies Act, 2017", url: "https://www.secp.gov.pk/document/companies-act-2017/" },
    { title: "Competition Act, 2010", url: "https://www.pakistani.org/pakistan/legislation/2010/actXIXof2010.html" },
    { title: "Constitution of the Islamic Republic of Pakistan, 1973", url: "https://na.gov.pk/uploads/documents/1333523681_951.pdf" },
    { title: "Consumer Protection Act (various provincial)", url: "https://www.google.com/search?q=Pakistan+Consumer+Protection+Act+text" },
    { title: "Contempt of Court Ordinance, 2003", url: "https://www.pakistani.org/pakistan/legislation/2003/ordinanceLVof2003.html" },
    { title: "Contract Act, 1872", url: "https://www.pakistani.org/pakistan/legislation/1872/actIXof1872.html" },
    { title: "Control of Narcotic Substances Act, 1997", url: "https://www.pakistani.org/pakistan/legislation/1997/actXXVof1997.html" },
    { title: "Copyright Ordinance, 1962", url: "https://www.pakistani.org/pakistan/legislation/1962/ordinanceXXXIVof1962.html" },
    { title: "Court Fees Act, 1870", url: "https://www.pakistani.org/pakistan/legislation/1870/actVIIof1870.html" },
    { title: "Customs Act, 1969", url: "https://www.pakistani.org/pakistan/legislation/1969/actIVof1969.html" },
    { title: "Defamation Ordinance, 2002", url: "https://www.pakistani.org/pakistan/legislation/2002/ordinanceLVIIof2002.html" },
    { title: "Dissolution of Muslim Marriages Act, 1939", url: "https://www.pakistani.org/pakistan/legislation/1939/actVIIIof1939.html" },
    { title: "Easements Act, 1882", url: "https://www.pakistani.org/pakistan/legislation/1882/actVof1882.html" },
    { title: "Elections Act, 2017", url: "https://na.gov.pk/uploads/documents/1506961151_781.pdf" },
    { title: "Electricity Act, 1910", url: "https://www.pakistani.org/pakistan/legislation/1910/actIXof1910.html" },
    { title: "Electronic Transactions Ordinance, 2002", url: "https://www.pakistani.org/pakistan/legislation/2002/ordinanceLIof2002.html" },
    { title: "Explosives Act, 1884", url: "https://www.pakistani.org/pakistan/legislation/1884/actIVof1884.html" },
    { title: "Factories Act, 1934", url: "https://www.pakistani.org/pakistan/legislation/1934/actXXVof1934.html" },
    { title: "Fatal Accidents Act, 1855", url: "https://www.pakistani.org/pakistan/legislation/1855/actXIIIof1855.html" },
    { title: "Foreign Exchange Regulation Act, 1947", url: "https://www.pakistani.org/pakistan/legislation/1947/actVIIof1947.html" },
    { title: "General Clauses Act, 1897", url: "https://www.pakistani.org/pakistan/legislation/1897/actXof1897.html" },
    { title: "Guardians and Wards Act, 1890", url: "https://www.pakistani.org/pakistan/legislation/1890/actVIIIof1890.html" },
    { title: "Income Tax Ordinance, 2001", url: "https://www.pakistani.org/pakistan/legislation/2001/ordinanceXLIXof2001.html" },
    { title: "Industrial Relations Act, 2012", url: "https://na.gov.pk/uploads/documents/1340089051_958.pdf" },
    { title: "International Covenant on Civil and Political Rights (ICCPR)", url: "https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-civil-and-political-rights" },
    { title: "International Covenant on Economic, Social and Cultural Rights (ICESCR)", url: "https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-economic-social-and-cultural-rights" },
    { title: "Juvenile Justice System Act, 2018", url: "https://na.gov.pk/uploads/documents/1532935527_123.pdf" },
    { title: "Land Acquisition Act, 1894", url: "https://www.pakistani.org/pakistan/legislation/1894/actIof1894.html" },
    { title: "Legal Practitioners and Bar Councils Act, 1973", url: "https://www.pakistani.org/pakistan/legislation/1973/actXXXVof1973.html" },
    { title: "Limitation Act, 1908", url: "https://www.pakistani.org/pakistan/legislation/1908/actIXof1908.html" },
    { title: "Minimum Wages Ordinance, 1961", url: "https://www.pakistani.org/pakistan/legislation/1961/ordinanceXXXIXof1961.html" },
    { title: "Muslim Family Laws Ordinance, 1961", url: "https://www.pakistani.org/pakistan/legislation/1961/actVIIIof1961.html" },
    { title: "Muslim Personal Law (Shariat) Application Act, 1962", url: "https://www.pakistani.org/pakistan/legislation/1962/actVof1962.html" },
    { title: "National Accountability Ordinance, 1999 (NAB)", url: "https://www.pakistani.org/pakistan/legislation/1999/18-99.html" },
    { title: "Negotiable Instruments Act, 1881", url: "https://www.pakistani.org/pakistan/legislation/1881/actXXVIof1881.html" },
    { title: "Notaries Ordinance, 1961", url: "https://www.pakistani.org/pakistan/legislation/1961/ordinanceXIXof1961.html" },
    { title: "Oaths Act, 1873", url: "https://www.pakistani.org/pakistan/legislation/1873/actXof1873.html" },
    { title: "Official Secrets Act, 1923", url: "https://www.pakistani.org/pakistan/legislation/1923/actXIXof1923.html" },
    { title: "Pakistan Citizenship Act, 1951", url: "https://www.pakistani.org/pakistan/legislation/1951/actIIof1951.html" },
    { title: "Pakistan Environmental Protection Act, 1997 (PEPA)", url: "https://www.pakistani.org/pakistan/legislation/1997/xxxivof1997.html" },
    { title: "Pakistan Penal Code, 1860 (PPC)", url: "https://www.pakistani.org/pakistan/legislation/1860/actXLVof1860.html" },
    { title: "Partnership Act, 1932", url: "https://www.pakistani.org/pakistan/legislation/1932/actIXof1932.html" },
    { title: "Patents Ordinance, 2000", url: "https://www.pakistani.org/pakistan/legislation/2000/ordinanceLXIof2000.html" },
    { title: "Payment of Wages Act, 1936", url: "https://www.pakistani.org/pakistan/legislation/1936/actIVof1936.html" },
    { title: "Police Order, 2002", url: "https://www.pakistani.org/pakistan/legislation/2002/ordinance22of2002.html" },
    { title: "Police Rules, 1934 (Punjab / applicable in Balochistan)", url: "https://punjabpolice.gov.pk/police_rules" },
    { title: "Powers of Attorney Act, 1882", url: "https://www.pakistani.org/pakistan/legislation/1882/actVIIof1882.html" },
    { title: "Prevention of Corruption Act, 1947", url: "https://www.pakistani.org/pakistan/legislation/1947/actIIof1947.html" },
    { title: "Prevention of Electronic Crimes Act, 2016 (PECA)", url: "https://na.gov.pk/uploads/documents/1472635250_246.pdf" },
    { title: "Probation of Offenders Ordinance, 1960", url: "https://www.pakistani.org/pakistan/legislation/1960/ordinanceXLVof1960.html" },
    { title: "Protection against Harassment of Women at the Workplace Act, 2010", url: "https://www.pakistani.org/pakistan/legislation/2010/actIVof2010.html" },
    { title: "Qanun-e-Shahadat Order, 1984 (Law of Evidence)", url: "https://www.pakistani.org/pakistan/legislation/1984/pres_order10of1984.html" },
    { title: "Registration Act, 1908", url: "https://www.pakistani.org/pakistan/legislation/1908/actXVIof1908.html" },
    { title: "Right of Access to Information Act, 2017", url: "https://na.gov.pk/uploads/documents/1507906039_943.pdf" },
    { title: "Sale of Goods Act, 1930", url: "https://www.pakistani.org/pakistan/legislation/1930/actIIIof1930.html" },
    { title: "Sales Tax Act, 1990", url: "https://www.pakistani.org/pakistan/legislation/1990/actIIIof1990.html" },
    { title: "Specific Relief Act, 1877", url: "https://www.pakistani.org/pakistan/legislation/1877/actIof1877.html" },
    { title: "Stamp Act, 1899", url: "https://www.pakistani.org/pakistan/legislation/1899/actIIof1899.html" },
    { title: "Succession Act, 1925", url: "https://www.pakistani.org/pakistan/legislation/1925/actXXXIXof1925.html" },
    { title: "Telegraph Act, 1885", url: "https://www.pakistani.org/pakistan/legislation/1885/actXIIIof1885.html" },
    { title: "Trade Marks Act, 1940", url: "https://www.pakistani.org/pakistan/legislation/1940/actVof1940.html" },
    { title: "Transfer of Property Act, 1882", url: "https://www.pakistani.org/pakistan/legislation/1882/actIVof1882.html" },
    { title: "Transgender Persons (Protection of Rights) Act, 2018", url: "https://na.gov.pk/uploads/documents/1526547582_234.pdf" },
    { title: "Trusts Act, 1882", url: "https://www.pakistani.org/pakistan/legislation/1882/actIIof1882.html" },
    { title: "UN Charter", url: "https://www.un.org/en/about-us/un-charter/full-text" },
    { title: "Universal Declaration of Human Rights (UDHR)", url: "https://www.un.org/en/about-us/universal-declaration-of-human-rights" },
    { title: "West Pakistan Family Courts Act, 1964", url: "https://www.pakistani.org/pakistan/legislation/1964/wpactXXXVof1964.html" },
    { title: "West Pakistan Land Revenue Act, 1967", url: "https://www.pakistani.org/pakistan/legislation/1967/actXVIIof1967.html" },
    { title: "Workmen's Compensation Act, 1923", url: "https://www.pakistani.org/pakistan/legislation/1923/actVIIIof1923.html" }
  ];

  function renderGeneral() {
    var id = "genStatuteSearch";
    var listId = "genStatuteList";
    var html =
      '<input type="text" id="' + id + '" class="gen-search" placeholder="Search statutes & acts\u2026" autocomplete="off">' +
      '<div class="gen-count" id="genStatuteCount">' + STATUTES.length + ' statutes & acts</div>' +
      '<div id="' + listId + '">' + statuteListHtml(STATUTES) + '</div>';

    setTimeout(function () {
      var inp = document.getElementById(id);
      if (!inp || inp._bound) return;
      inp._bound = true;
      inp.addEventListener("input", function () {
        var q = inp.value.toLowerCase().trim();
        var filtered = q ? STATUTES.filter(function (s) {
          return s.title.toLowerCase().includes(q);
        }) : STATUTES;
        document.getElementById(listId).innerHTML = statuteListHtml(filtered);
        document.getElementById("genStatuteCount").textContent =
          filtered.length + (filtered.length === STATUTES.length
            ? " statutes & acts"
            : " of " + STATUTES.length + " statutes & acts");
      });
    }, 0);

    return html;
  }

  function statuteListHtml(list) {
    if (!list.length) {
      return '<div class="empty" style="padding:16px;text-align:center;color:var(--slate)">No matching statutes found.</div>';
    }
    var unlocked = booksUnlocked();
    return list.map(function (s) {
      var action = unlocked
        ? '<a class="book-link book-free" href="' + esc(s.url) + '" target="_blank" rel="noopener">View</a>'
        : lockedControl();
      return (
        '<div class="book-item">' +
        '<span class="book-title">' +
        esc(s.title) +
        "</span>" +
        action +
        "</div>"
      );
    }).join("");
  }

  function render() {
    var el = document.getElementById("booksRoot");
    if (!el) return;
    el.innerHTML =
      progAccordion("\u2696\uFE0F", "General Law Books & Statutes", "Essential Pakistani statutes, codes & international instruments", renderGeneral(), { flat: true }) +
      progAccordion("4Y", "LLB 4 Years", "HEC Curriculum 2025", renderLlb4()) +
      progAccordion("5Y", "LLB 5 Years", "HEC Revised 2015 scheme", renderLlb5()) +
      progAccordion("LLM", "LLM Programme", "HEC LL.M. Revised 2006", renderLlm());

    if (!el._booksLockBound) {
      el._booksLockBound = true;
      el.addEventListener("click", function (e) {
        var btn = e.target.closest(".book-locked");
        if (!btn) return;
        requireSignIn(e);
      });
    }
  }

  global.BooksApp = { render: render, requireSignIn: requireSignIn };
})(typeof window !== "undefined" ? window : globalThis);
