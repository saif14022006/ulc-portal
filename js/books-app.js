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

  function courseLookup(title, program) {
    var catalog = (global.ULC_SYLLABUS_CATALOG || {}).courses || {};
    var t = norm(title);
    var prog = String(program || "").trim();
    if (prog) {
      var exact = catalog[prog + "||" + t];
      if (exact) return exact;
      var prefix = prog + "||";
      var tl = t.toLowerCase();
      var keys = Object.keys(catalog);
      for (var i = 0; i < keys.length; i++) {
        if (!keys[i].startsWith(prefix)) continue;
        var titlePart = keys[i].slice(prefix.length);
        if (titlePart.toLowerCase() === tl) return catalog[keys[i]];
      }
    }
    if (catalog[t]) return catalog[t];
    var all = Object.keys(catalog);
    var tl2 = t.toLowerCase();
    for (var j = 0; j < all.length; j++) {
      var part = all[j].includes("||") ? all[j].split("||").slice(1).join("||") : all[j];
      if (part.toLowerCase() === tl2) return catalog[all[j]];
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

  function gatherSubjects(titles, program) {
    return titles.map(function (t) {
      var c = courseLookup(t, program);
      return { title: t, books: c ? (c.booksWithLinks || []) : [] };
    });
  }

  function renderLlb5() {
    var S = global.SYLLABUS || {};
    var sems = Object.keys(S);
    if (!sems.length) return "";
    return sems.map(function (n) {
      var titles = S[n].map(function (x) { return x[1]; });
      return semAccordion("Semester " + n, n, gatherSubjects(titles, "LLB 5 Years"));
    }).join("");
  }

  function renderLlb4() {
    var llb4 = (global.ULC_SYLLABUS_CATALOG || {}).llb4;
    if (!llb4) return "";
    return Object.keys(llb4.semesters).map(function (n) {
      var titles = llb4.semesters[n].map(function (x) { return x.title; });
      return semAccordion("Semester " + n, n, gatherSubjects(titles, "LLB 4 Years"));
    }).join("");
  }

  function renderLlm() {
    var L = global.LLM_SYLLABUS;
    if (!L) return "";
    var all = [].concat(L.compulsory || [], L.thesis || [], L.optional || []);
    var titles = all.map(function (x) { return x[1]; });
    return semAccordion("All LLM Courses", "LLM", gatherSubjects(titles, "LLM"));
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
    { title: "Anti-Money Laundering Act, 2010", url: "https://pakistancode.gov.pk/pdffiles/administrator47c7a5354061a54634a6246d2046ddcf.pdf" },
    { title: "Anti-Rape (Investigation and Trial) Act, 2021", url: "https://pakistancode.gov.pk/pdffiles/administratordcbf53fa2d37ade990bcaa63630e66ff.pdf" },
    { title: "Anti-Terrorism Act, 1997", url: "https://pakistancode.gov.pk/pdffiles/administrator0c000814bbb1b4188b0855eb6e5dd446.pdf" },
    { title: "Arbitration Act, 1940", url: "https://pakistancode.gov.pk/pdffiles/administrator0a802e3468735238090ceede22ccfd11.pdf" },
    { title: "Arms Act, 1878", url: "https://pakistancode.gov.pk/pdffiles/administrator95dda114739682aed8b784a819634050.pdf" },
    { title: "Bankers' Books Evidence Act, 1891", url: "https://pakistancode.gov.pk/pdffiles/administratorf2659375fe49533f79b277d9a770c645.pdf" },
    { title: "Banking Companies Ordinance, 1962", url: "https://pakistancode.gov.pk/pdffiles/administrator53b33d7c0ff80d13e0b8f5e4bd578970.pdf" },
    { title: "Benami Transactions (Prohibition) Act, 2017", url: "https://pakistancode.gov.pk/pdffiles/administratorc3159176d17a29e713613851233c2845.pdf" },
    { title: "Bonded Labour System (Abolition) Act, 1992", url: "https://pakistancode.gov.pk/pdffiles/administrator193484c31f7b4b5c5cbd0aae5038201e.pdf" },
    { title: "Cantonments Act, 1924", url: "https://pakistancode.gov.pk/pdffiles/administratorab18a09560ff06aef68eb7ef0621c1c7.pdf" },
    { title: "Child Marriage Restraint Act, 1929", url: "https://pakistancode.gov.pk/pdffiles/administrator0cb12b901d4304d7e5463da076d88639.pdf" },
    { title: "Civil Servants Act, 1973", url: "https://pakistancode.gov.pk/pdffiles/administrator09f6f0996bae74d218dd6d1ecedd0318.pdf" },
    { title: "Code of Civil Procedure, 1908 (CPC)", url: "https://pakistancode.gov.pk/pdffiles/administrator6598dabbad120033d4d42d717dcf9755.pdf" },
    { title: "Code of Criminal Procedure, 1898 (CrPC)", url: "https://pakistancode.gov.pk/pdffiles/administrator7db1e56f0f1d39a6e67573ec6b0944e2.pdf" },
    { title: "Companies Act, 2017", url: "https://pakistancode.gov.pk/pdffiles/administrator89de324eeaa53c96ff701820d2e007e4.pdf" },
    { title: "Competition Act, 2010", url: "https://pakistancode.gov.pk/pdffiles/administratore1b5ab79c2c1975670e6aa7fe57e57d6.pdf" },
    { title: "Constitution of the Islamic Republic of Pakistan, 1973", url: "https://pakistancode.gov.pk/pdffiles/administrator9d8e2ecc414c6d3371ac41114b61a2c4.pdf" },
    { title: "Consumer Protection Act (various provincial)", url: "https://www.google.com/search?q=Pakistan+Consumer+Protection+Act+text" },
    { title: "Contempt of Court Ordinance, 2003", url: "https://pakistancode.gov.pk/pdffiles/administratorc5fa23fb5d3bbbcfb48f8fe1f13cd312.pdf" },
    { title: "Contract Act, 1872", url: "https://pakistancode.gov.pk/pdffiles/administrator8332a6df32386960ac7d81a5cf7aade2.pdf" },
    { title: "Control of Narcotic Substances Act, 1997", url: "https://pakistancode.gov.pk/pdffiles/administrator739c7aa745c5afab5decf2e100caf1c5.pdf" },
    { title: "Copyright Ordinance, 1962", url: "https://pakistancode.gov.pk/pdffiles/administratorc8dc84cf91fcedf0a4a00fc2710945a1.pdf" },
    { title: "Court Fees Act, 1870", url: "https://pakistancode.gov.pk/pdffiles/administrator9d60b89fa3dd51147d677e764c8772e3.pdf" },
    { title: "Customs Act, 1969", url: "https://pakistancode.gov.pk/pdffiles/administrator6d344e569c576550c200d66afb7b28f6.pdf" },
    { title: "Defamation Ordinance, 2002", url: "https://pakistancode.gov.pk/pdffiles/administrator741de22e0685408278606962079d12b2.pdf" },
    { title: "Dissolution of Muslim Marriages Act, 1939", url: "https://pakistancode.gov.pk/pdffiles/administratorfb32d6015ae887e6d6b85018961842ea.pdf" },
    { title: "Easements Act, 1882", url: "https://pakistancode.gov.pk/pdffiles/administrator60670d614d75e2e43264070cfeefe0cb.pdf" },
    { title: "Elections Act, 2017", url: "https://pakistancode.gov.pk/pdffiles/administratorf21c97fb85cfdc593f840a4c008caa45.pdf" },
    { title: "Electricity Act, 1910", url: "https://pakistancode.gov.pk/pdffiles/administratorb4d981a750b5ae6c46c9351d22217c0e.pdf" },
    { title: "Electronic Transactions Ordinance, 2002", url: "https://pakistancode.gov.pk/pdffiles/administratordbc98dd49f2df3b1d07bb986dcceb9a3.pdf" },
    { title: "Explosives Act, 1884", url: "https://pakistancode.gov.pk/pdffiles/administrator2f1da8cc107ec077896ca6fc93905fb3.pdf" },
    { title: "Factories Act, 1934", url: "https://pakistancode.gov.pk/pdffiles/administratorf38efe0a6e760531f05b4a29ba4ba215.pdf" },
    { title: "Fatal Accidents Act, 1855", url: "https://pakistancode.gov.pk/pdffiles/administratorce4c3de80f90b28e7c9548a78fb717c2.pdf" },
    { title: "Foreign Exchange Regulation Act, 1947", url: "https://pakistancode.gov.pk/pdffiles/administrator4ef414a2433e9cd3ebe6b05800627920.pdf" },
    { title: "General Clauses Act, 1897", url: "https://pakistancode.gov.pk/pdffiles/administratore8a332cad1093952d0ecb86288b38c75.pdf" },
    { title: "Guardians and Wards Act, 1890", url: "https://pakistancode.gov.pk/pdffiles/administratord265c726d2d564a9377ed7a8e04708ae.pdf" },
    { title: "Income Tax Ordinance, 2001", url: "https://pakistancode.gov.pk/pdffiles/administratorc09ecd376211abe32a7e44510f3fd719.pdf" },
    { title: "Industrial Relations Act, 2012", url: "https://pakistancode.gov.pk/pdffiles/administrator964ce81cc171ed5dcd0960630e922422.pdf" },
    { title: "International Covenant on Civil and Political Rights (ICCPR)", url: "https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-civil-and-political-rights" },
    { title: "International Covenant on Economic, Social and Cultural Rights (ICESCR)", url: "https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-economic-social-and-cultural-rights" },
    { title: "Juvenile Justice System Act, 2018", url: "https://pakistancode.gov.pk/pdffiles/administrator01c49d3cff67abf97e39c2e1d6dacc43.pdf" },
    { title: "Land Acquisition Act, 1894", url: "https://pakistancode.gov.pk/pdffiles/administrator306e16e98dc7d50afe4d3cc18892888b.pdf" },
    { title: "Legal Practitioners and Bar Councils Act, 1973", url: "https://pakistancode.gov.pk/pdffiles/administrator5d15510c6d8f928c6bbc3c27f313e44c.pdf" },
    { title: "Limitation Act, 1908", url: "https://pakistancode.gov.pk/pdffiles/administrator3294e35255f255ea96b3356091fb4844.pdf" },
    { title: "Minimum Wages Ordinance, 1961", url: "https://pakistancode.gov.pk/pdffiles/administrator26a975453aac76e06711066e6c07e718.pdf" },
    { title: "Muslim Family Laws Ordinance, 1961", url: "https://pakistancode.gov.pk/pdffiles/administratoreecaf3b490e2d43d2e3b50c0c068b5d7.pdf" },
    { title: "Muslim Personal Law (Shariat) Application Act, 1962", url: "https://pakistancode.gov.pk/pdffiles/administrator43496aa4c309b625076eccef03abef93.pdf" },
    { title: "National Accountability Ordinance, 1999 (NAB)", url: "https://pakistancode.gov.pk/pdffiles/administrator889746414e53d53e4398264cda458947.pdf" },
    { title: "Negotiable Instruments Act, 1881", url: "https://pakistancode.gov.pk/pdffiles/administrator2bbb145adb573172ec68151f4e70dfb5.pdf" },
    { title: "Notaries Ordinance, 1961", url: "https://pakistancode.gov.pk/pdffiles/administrator1c90220dff082736b76ee7037c41bd8c.pdf" },
    { title: "Oaths Act, 1873", url: "https://pakistancode.gov.pk/pdffiles/administrator0158e1a02138a940073e102386a7525a.pdf" },
    { title: "Official Secrets Act, 1923", url: "https://pakistancode.gov.pk/pdffiles/administrator46c9a3c62acc16428e73999e7d30ba2a.pdf" },
    { title: "Pakistan Citizenship Act, 1951", url: "https://pakistancode.gov.pk/pdffiles/administratora2b6f3407a109a491d47d649f6ff0c01.pdf" },
    { title: "Pakistan Environmental Protection Act, 1997 (PEPA)", url: "https://pakistancode.gov.pk/pdffiles/administrator17094efb999f9a865461eb1498175947.pdf" },
    { title: "Pakistan Penal Code, 1860 (PPC)", url: "https://pakistancode.gov.pk/pdffiles/administratord5622ea3f15bfa00b17d2cf7770a8434.pdf" },
    { title: "Partnership Act, 1932", url: "https://pakistancode.gov.pk/pdffiles/administratorbbc0b5b0d78c35e99e3b94f6b77b69db.pdf" },
    { title: "Patents Ordinance, 2000", url: "https://pakistancode.gov.pk/pdffiles/administrator6b30eb225e07601de7078671e1cc7022.pdf" },
    { title: "Payment of Wages Act, 1936", url: "https://pakistancode.gov.pk/pdffiles/administrator8820e88efaf7eedabf5c1d8c73b3dee5.pdf" },
    { title: "Police Order, 2002", url: "https://pakistancode.gov.pk/pdffiles/administrator91032d4ee5bd880388b96d54d5540865.pdf" },
    { title: "Police Rules, 1934 (Punjab / applicable in Balochistan)", url: "https://punjabpolice.gov.pk/police_rules" },
    { title: "Powers of Attorney Act, 1882", url: "https://pakistancode.gov.pk/pdffiles/administratorb062eb64b9476b2fda4f4609312b273d.pdf" },
    { title: "Prevention of Corruption Act, 1947", url: "https://pakistancode.gov.pk/pdffiles/administrator6b1051bf89aaeb5e9afc3cf2b141fc0b.pdf" },
    { title: "Prevention of Electronic Crimes Act, 2016 (PECA)", url: "https://pakistancode.gov.pk/pdffiles/administrator6a061efe0ed5bd153fa8b79b8eb4cba7.pdf" },
    { title: "Probation of Offenders Ordinance, 1960", url: "https://pakistancode.gov.pk/pdffiles/administratorc59339c610e14042c34043be418621f7.pdf" },
    { title: "Protection against Harassment of Women at the Workplace Act, 2010", url: "https://pakistancode.gov.pk/pdffiles/administratorc22e81f4add9ea3dc023086953ca2b4f.pdf" },
    { title: "Qanun-e-Shahadat Order, 1984 (Law of Evidence)", url: "https://pakistancode.gov.pk/pdffiles/administrator01031a2c8cddc523d08a0df0ec37d7d0.pdf" },
    { title: "Registration Act, 1908", url: "https://pakistancode.gov.pk/pdffiles/administrator0f29bc9f1e3dfed37c0034eed1e29d53.pdf" },
    { title: "Right of Access to Information Act, 2017", url: "https://pakistancode.gov.pk/pdffiles/administrator3599d65bc5ecb2dd1915d04c7db91e8f.pdf" },
    { title: "Sale of Goods Act, 1930", url: "https://pakistancode.gov.pk/pdffiles/administrator03eadfb5474bfa7c9e45ab4558d5a926.pdf" },
    { title: "Sales Tax Act, 1990", url: "https://pakistancode.gov.pk/pdffiles/administratorf6d20932403661e059756ab223d8542b.pdf" },
    { title: "Specific Relief Act, 1877", url: "https://pakistancode.gov.pk/pdffiles/administratorf257754bbb3c6863d879492bc8cd8f6e.pdf" },
    { title: "Stamp Act, 1899", url: "https://pakistancode.gov.pk/pdffiles/administrator999043d9ce6f33fcbb5ecd8a58f5c79d.pdf" },
    { title: "Succession Act, 1925", url: "https://pakistancode.gov.pk/pdffiles/administrator4a6efe2b68e892d437aea98367cf6687.pdf" },
    { title: "Telegraph Act, 1885", url: "https://pakistancode.gov.pk/pdffiles/administratorac6862547a10cdfd7dc5f630b8f32fc3.pdf" },
    { title: "Trade Marks Ordinance, 2001", url: "https://pakistancode.gov.pk/pdffiles/administratora4ef8d40e3d97faef49343d2242e0c3a.pdf" },
    { title: "Transfer of Property Act, 1882", url: "https://pakistancode.gov.pk/pdffiles/administrator77923ce792b475e339e1f46ba0442da3.pdf" },
    { title: "Transgender Persons (Protection of Rights) Act, 2018", url: "https://na.gov.pk/uploads/documents/1526547582_234.pdf" },
    { title: "Trusts Act, 1882", url: "https://pakistancode.gov.pk/pdffiles/administrator097759e0f2a16527881669c6e1435919.pdf" },
    { title: "UN Charter", url: "https://www.un.org/en/about-us/un-charter/full-text" },
    { title: "Universal Declaration of Human Rights (UDHR)", url: "https://www.un.org/en/about-us/universal-declaration-of-human-rights" },
    { title: "West Pakistan Family Courts Act, 1964", url: "https://pakistancode.gov.pk/pdffiles/administratorf08eaec19066a65a1b82cb4ad49feb4d.pdf" },
    { title: "West Pakistan Land Revenue Act, 1967", url: "https://pakistancode.gov.pk/pdffiles/administratore28b1b7332386915d9316d75e71dec83.pdf" },
    { title: "Workmen's Compensation Act, 1923", url: "https://pakistancode.gov.pk/pdffiles/administratorc0a301ae45df31b6a4b3828a5cd57fde.pdf" }
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
