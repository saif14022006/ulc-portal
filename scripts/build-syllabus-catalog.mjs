/**
 * Build js/syllabus-catalog.js from HEC 4-year CLOs + shared outlines/books.
 * Run: node scripts/build-syllabus-catalog.mjs
 */
import fs from "fs";

const clos = JSON.parse(fs.readFileSync("js/syllabus-data/llb4-clos.json", "utf8"));
const scheme = JSON.parse(fs.readFileSync("js/syllabus-data/llb4-scheme.json", "utf8"));

const books = {
  "Introduction to Law and Legal Systems": [
    "Glanville Williams — Learning the Law",
    "John William Salmond — Jurisprudence (selected chapters)",
    "Constitution of Pakistan, 1973 (introductory reading)",
  ],
  "Law of Torts": [
    "Ratanlal & Dhirajlal — The Law of Torts",
    "Winfield and Jolowicz on Tort",
    "Relevant Pakistani case law compilations",
  ],
  "Criminal Law": [
    "Pakistan Penal Code, 1860 (as amended)",
    "Ratanlal & Dhirajlal — The Indian Penal Code (comparative)",
    "Shaukat Mahmood — The Pakistan Penal Code",
  ],
  "Law of Contract": [
    "Contract Act, 1872 (Pakistan)",
    "Pollock & Mulla — Indian Contract Act",
    "Avtar Singh — Law of Contract",
  ],
  Jurisprudence: [
    "Salmond on Jurisprudence",
    "Lloyd’s Introduction to Jurisprudence",
    "Imran Ahsan Khan Nyazee — Jurisprudence",
  ],
  "Principles of Constitutional Law": [
    "Wheare — Modern Constitutions",
    "Comparative constitutional law texts (UK / US / Pakistan)",
    "Leading Pakistani constitutional cases",
  ],
  "Constitutional Law of Pakistan (Ideology and Constitution of Pakistan)": [
    "Constitution of the Islamic Republic of Pakistan, 1973",
    "Hamīd Khan — Constitutional and Political History of Pakistan",
    "Selected judgments of the Supreme Court of Pakistan",
  ],
  "Equity, Trusts and Specific Relief": [
    "Specific Relief Act, 1877",
    "Snell’s Equity (selected chapters)",
    "Pakistani commentaries on Specific Relief and Trusts",
  ],
  "Law of Property": [
    "Transfer of Property Act, 1882",
    "Registration Act, 1908",
    "Mulla — Transfer of Property Act",
  ],
  "Alternative Dispute Resolution (ADR)": [
    "Arbitration Act / relevant ADR statutes of Pakistan",
    "Brown & Marriott — ADR Principles and Practice (selected)",
    "HEC / PBC materials on mediation and arbitration",
  ],
  "Alternate Dispute Resolution": [
    "Arbitration Act / relevant ADR statutes of Pakistan",
    "Brown & Marriott — ADR Principles and Practice (selected)",
    "HEC / PBC materials on mediation and arbitration",
  ],
  "Islamic Jurisprudence": [
    "Imran Ahsan Khan Nyazee — Islamic Jurisprudence",
    "Abdur Rahim — Principles of Muhammadan Jurisprudence",
    "Qur’an & Hadith collections as primary sources (guided reading)",
  ],
  "Islamic Personal Law-I": [
    "Muslim Family Laws Ordinance, 1961",
    "D.F. Mulla — Principles of Mahomedan Law",
    "Keith Hodkinson — Muslim Family Law (selected)",
  ],
  "Islamic Personal Law-II": [
    "D.F. Mulla — Principles of Mahomedan Law",
    "Pakistan legislation on inheritance, gift, will and waqf",
    "Nyazee — Outlines of Islamic Jurisprudence (inheritance chapters)",
  ],
  "Law of Business Organizations-I": [
    "Partnership Act, 1932",
    "Limited Liability Partnership legislation (as applicable)",
    "Avtar Singh — Company Law (introductory / partnership chapters)",
  ],
  "Law of Business Organizations-II": [
    "Companies Act, 2017 (Pakistan)",
    "Securities laws and SECP materials",
    "Gower / Avtar Singh — Company Law (selected)",
  ],
  "Law of Evidence": [
    "Qanun-e-Shahadat Order, 1984",
    "Munir — Law of Evidence",
    "Ratanlal & Dhirajlal — Law of Evidence (comparative)",
  ],
  "Administrative and Services Law": [
    "Civil Servants Act, 1973 and related rules",
    "Wade & Forsyth — Administrative Law (selected)",
    "Pakistani commentaries on writ jurisdiction and service tribunals",
  ],
  "Land Law": [
    "Land Revenue Act / provincial land revenue laws",
    "Transfer of Property Act (land-related chapters)",
    "Provincial land administration manuals",
  ],
  "Cyber Law": [
    "Prevention of Electronic Crimes Act, 2016 (as amended)",
    "Related PECA rules and amendments",
    "Contemporary cybercrime & digital evidence readings",
  ],
  "Legal Drafting and Pleadings": [
    "CPC Orders relating to pleadings",
    "Ameer Ali / Pakistani drafting manuals",
    "Sample plaints, written statements and petitions",
  ],
  "International Law": [
    "Brownlie’s Principles of Public International Law (selected)",
    "Malcolm Shaw — International Law",
    "UN Charter and selected treaties",
  ],
  "Legal Ethics and Moot Cases": [
    "Legal Practitioners and Bar Councils Act / PBC Canons of Professional Conduct",
    "Moot court manuals and advocacy primers",
    "Ethics case studies for lawyers",
  ],
  "Criminal Procedure Code-I": [
    "Code of Criminal Procedure, 1898",
    "Shaukat Mahmood — Criminal Procedure",
    "Leading CrPC case law digests",
  ],
  "Criminal Procedure Code-II": [
    "Code of Criminal Procedure, 1898",
    "Shaukat Mahmood — Criminal Procedure",
    "Medico-legal / trial practice readings",
  ],
  "Civil Procedure Code-I": [
    "Code of Civil Procedure, 1908",
    "Aamer Raza / Mulla — CPC commentaries",
    "Pleadings and practice manuals",
  ],
  "Civil Procedure Code-II": [
    "Code of Civil Procedure, 1908",
    "Aamer Raza / Mulla — CPC commentaries",
    "Appeals, execution and interim orders practice texts",
  ],
  "Environmental Law": [
    "Pakistan Environmental Protection Act, 1997",
    "International environmental law primers",
    "Shehla Zia and related Pakistani environmental judgments",
  ],
  "Research Methodology": [
    "Mike McConville & Wing Hong Chui — Research Methods for Law",
    "Ian Dobinson / Francis Johns — Legal Research methods texts",
    "HEC / university research writing guides",
  ],
  "Public International Law – I": [
    "Malcolm Shaw — International Law",
    "Brownlie’s Principles of Public International Law",
    "UN Charter",
  ],
  "Public International Law – II": [
    "Malcolm Shaw — International Law",
    "Selected ICJ cases",
    "Law of treaties materials",
  ],
  "Constitutional Law – I (UK)": [
    "Dicey — Introduction to the Study of the Law of the Constitution",
    "Bradley & Ewing — Constitutional and Administrative Law",
  ],
  "Constitutional Law – II (US)": [
    "US Constitution text",
    "Leading US Supreme Court cases (selected)",
  ],
  "Constitutional Law – III (Pakistan)": [
    "Constitution of Pakistan, 1973",
    "Hamīd Khan — Constitutional and Political History of Pakistan",
  ],
  "Human Rights Law": [
    "UDHR, ICCPR, ICESCR (selected)",
    "Pakistani fundamental rights case law",
  ],
  "Law of Torts – I": [
    "Ratanlal & Dhirajlal — The Law of Torts",
    "Winfield and Jolowicz on Tort",
  ],
  "Law of Torts – II": [
    "Ratanlal & Dhirajlal — The Law of Torts",
    "Winfield and Jolowicz on Tort",
  ],
  "Law of Contract – I": [
    "Contract Act, 1872",
    "Pollock & Mulla — Indian Contract Act",
  ],
  "Law of Contract – II": [
    "Contract Act, 1872",
    "Avtar Singh — Law of Contract",
  ],
  "Islamic Jurisprudence - I": [
    "Coulson — A History of Islamic Law",
    "Nyazee — Outlines of Islamic Jurisprudence",
    "Nyazee — Theories of Islamic Law",
    "Abdur Rahim — The Principles of Islamic Jurisprudence",
    "Schacht — An Introduction to Islamic Law",
  ],
  "Islamic Jurisprudence – I": [
    "Coulson — A History of Islamic Law",
    "Nyazee — Outlines of Islamic Jurisprudence",
    "Nyazee — Theories of Islamic Law",
    "Abdur Rahim — The Principles of Islamic Jurisprudence",
    "Schacht — An Introduction to Islamic Law",
  ],
  "Islamic Jurisprudence - II": [
    "Ahmad Hassan — Principles of Islamic Jurisprudence",
    "Mohammad Hashim Kamali — Principles of Islamic Jurisprudence",
    "Nyazee — Outlines of Islamic Jurisprudence",
    "Abdur Rahim — The Principles of Islamic Jurisprudence",
  ],
  "Islamic Jurisprudence – II": [
    "Ahmad Hassan — Principles of Islamic Jurisprudence",
    "Mohammad Hashim Kamali — Principles of Islamic Jurisprudence",
    "Nyazee — Outlines of Islamic Jurisprudence",
    "Abdur Rahim — The Principles of Islamic Jurisprudence",
  ],
  "Islamic Personal Law – I": [
    "Muslim Family Laws Ordinance, 1961",
    "D.F. Mulla — Principles of Mahomedan Law",
  ],
  "Islamic Personal Law – II": [
    "D.F. Mulla — Principles of Mahomedan Law",
    "Inheritance / gift / waqf materials",
  ],
  "Jurisprudence – I": ["Salmond on Jurisprudence", "Lloyd’s Introduction to Jurisprudence"],
  "Jurisprudence – II": ["Salmond on Jurisprudence", "Lloyd’s Introduction to Jurisprudence"],
  "Criminal Law – I": ["Pakistan Penal Code, 1860", "Shaukat Mahmood — PPC"],
  "Criminal Law – II": ["Pakistan Penal Code, 1860", "Shaukat Mahmood — PPC"],
  "Civil Procedure – I": ["Code of Civil Procedure, 1908", "Mulla / Aamer Raza CPC"],
  "Civil Procedure – II": ["Code of Civil Procedure, 1908", "Mulla / Aamer Raza CPC"],
  "Criminal Procedure – I": ["Code of Criminal Procedure, 1898", "Shaukat Mahmood — CrPC"],
  "Criminal Procedure – II": ["Code of Criminal Procedure, 1898", "Shaukat Mahmood — CrPC"],
  "Law of Evidence – I": ["Qanun-e-Shahadat Order, 1984", "Munir — Law of Evidence"],
  "Law of Evidence – II": ["Qanun-e-Shahadat Order, 1984", "Munir — Law of Evidence"],
  "Legal Drafting – I": ["CPC pleadings orders", "Pakistani drafting manuals"],
  "Legal Drafting – II": ["CPC pleadings orders", "Sample pleadings and conveyancing"],
  "Research Methods": ["McConville & Chui — Research Methods for Law", "University research guide"],
  "Research Methodology": ["McConville & Chui — Research Methods for Law", "HEC research writing guides"],
  "Administrative Law": ["Wade & Forsyth — Administrative Law", "Pakistani writ jurisdiction materials"],
  "Equity & Specific Relief": ["Specific Relief Act, 1877", "Snell’s Equity (selected)"],
  "Law of Business Organizations": ["Companies Act, 2017", "Partnership Act, 1932"],
  "Land Laws": ["Provincial Land Revenue Acts", "Transfer of Property Act"],
  "Minor Acts": ["Selected minor acts as prescribed by the university"],
  "Moot Cases & Professional Ethics": ["PBC Canons of Professional Conduct", "Moot advocacy manuals"],
  "Interpretation of Statutes & Legislative Drafting": [
    "Maxwell on Interpretation of Statutes",
    "Craies on Legislation (selected)",
  ],
  "Constitutional Developments in Pakistan": [
    "Hamīd Khan — Constitutional and Political History of Pakistan",
    "Constitution of Pakistan, 1973",
  ],
  "Thesis / Dissertation": ["University LLM thesis guidelines", "Selected research methodology texts"],
  "Introduction to Law": [
    "Glanville Williams — Learning the Law",
    "Constitution of Pakistan, 1973 (introductory reading)",
    "Pakistani legal system overview texts",
  ],
  "Legal System of Pakistan": [
    "Hamīd Khan — Constitutional and Political History of Pakistan",
    "Constitution of Pakistan, 1973",
    "Overview of courts and legal profession in Pakistan",
  ],
  "English – I": ["University English / communication skills syllabus", "Academic writing primers"],
  "English – II": ["University English / communication skills syllabus", "Academic writing primers"],
  "English – III": ["University English / communication skills syllabus", "Legal English / drafting primers"],
  "Pakistan Studies": ["Pakistan Studies textbooks as prescribed", "Ideology of Pakistan readings"],
  "Islamic Studies / Ethics": ["Islamic Studies / Ethics syllabus as prescribed by the university"],
  "Introduction to Sociology": ["Introductory sociology texts as prescribed"],
  "Fundamentals of Economics": ["Introductory economics texts as prescribed"],
  "Skills Development": ["Study skills / soft-skills materials as prescribed"],
  "Principles of Political Science": ["Introductory political science texts as prescribed"],
  "History (South Asia)": ["South Asian history texts as prescribed"],
  "Introduction to Logic & Reasoning": ["Introductory logic / critical reasoning texts"],
  "Introduction to Psychology": ["Introductory psychology texts as prescribed"],
  "Research Project / Dissertation": ["University research / dissertation guidelines", "Legal research methods texts"],
  "Banking Laws": ["Relevant banking statutes of Pakistan", "SECP / SBP regulatory materials"],
  "Intellectual Property Laws": ["Pakistan IP statutes (copyright, patents, trademarks)", "WIPO / comparative IP primers"],
  "Labour Laws": ["Industrial Relations / labour statutes of Pakistan", "Leading labour law commentaries"],
  "Taxation Laws": ["Income Tax Ordinance and related rules", "Pakistani taxation commentaries"],
  "Environmental Laws": ["Pakistan Environmental Protection Act, 1997", "Environmental law case materials"],
  "Company / Corporate Law": ["Companies Act, 2017", "SECP corporate governance materials"],
  "Commercial / Business Laws": ["Contract / commercial statutes", "Avtar Singh — Business Law (selected)"],
  "Western Jurisprudence and Legal Theory": ["Lloyd’s Introduction to Jurisprudence", "Salmond on Jurisprudence"],
  "Comparative Constitutional Law": ["Comparative constitutional law texts", "Selected foreign constitutions"],
  "Islamic Laws": ["Nyazee — Islamic Jurisprudence", "Primary Islamic law sources (guided)"],
  "Law of Taxation": ["Income Tax Ordinance and related rules", "Pakistani taxation commentaries"],
  "Shipping Law": ["Admiralty / shipping law materials as prescribed"],
  "Criminology": ["Introductory criminology texts", "Pakistani criminal justice readings"],
};

const outlines = {
  "Introduction to Law and Legal Systems": [
    "Meaning, nature and classification of law",
    "Sources of law and legal systems",
    "Law, ethics, morality and religion",
    "Courts and legal institutions in Pakistan",
    "Rule of law and fundamental rights (introduction)",
  ],
  "Law of Torts": [
    "Nature of tort; distinction from contract and crime",
    "General principles of liability; intention and negligence",
    "Torts against persons and property",
    "Defences and remedies",
    "Selected Pakistani and common-law authorities",
  ],
  "Criminal Law": [
    "General principles of criminal liability (actus reus, mens rea)",
    "General exceptions / defences under PPC",
    "Selected offences against person and property",
    "Punishment and Islamic criminal law concepts (overview)",
    "Case analysis and application",
  ],
  "Law of Contract": [
    "Formation: offer, acceptance, consideration, capacity, free consent",
    "Void and voidable agreements",
    "Performance and discharge",
    "Breach and remedies",
    "Drafting and problem-solving exercises",
  ],
  /* Exact keys first — findOutline must not let bare "Jurisprudence" steal Islamic Jurisprudence. */
  "Islamic Jurisprudence - I": [
    "Islamic legal theories: philosophical, historical and sociological basis",
    "History and growth of the Muslim legal system",
    "Primary sources: Qur’an and Traditions (Sunnah)",
    "Secondary sources: Ijma and custom",
    "Juristic deduction: Qiyas, Istehsan, Istedlal, Ijtihad and Taqlid",
  ],
  "Islamic Jurisprudence - II": [
    "Acts, rights and obligations in Islamic law",
    "Legal capacity (ahliyya)",
    "Ownership and possession",
    "Family laws (overview within Islamic jurisprudence)",
    "Torts and crimes; punishments",
    "Procedure and evidence",
    "Constitutional and administrative law in an Islamic framework",
    "Relations between Muslims and non-Muslims",
  ],
  "Islamic Jurisprudence": [
    "Primary sources: Qur’an, Sunnah, Ijma and Qiyas",
    "History and schools of Islamic legal thought",
    "Rights, obligations and legal capacity",
    "Application of usul al-fiqh to contemporary issues",
  ],
  Jurisprudence: [
    "Natural law, positivism, realism and sociological approaches",
    "Key jurists and theories of law",
    "Law, morality and justice",
    "Application of theory to statutes and judgments",
  ],
  "Jurisprudence - I": [
    "Natural law, positivism, realism and sociological approaches",
    "Key jurists and theories of law",
    "Law, morality and justice",
    "Application of theory to statutes and judgments",
  ],
  "Jurisprudence - II": [
    "Advanced schools of legal theory",
    "Law, rights and the state",
    "Critical and sociological approaches",
    "Application of theory to statutes and judgments",
  ],
  "Principles of Constitutional Law": [
    "Constitutional design and structures",
    "Separation of powers and judicial review",
    "Comparative constitutional themes",
    "Selected Pakistani constitutional landmarks",
  ],
  "Law of Evidence": [
    "Relevancy and admissibility under QSO 1984",
    "Types of evidence; witnesses; burden of proof",
    "Examination of witnesses; privilege; estoppel",
    "Modern / electronic evidence trends",
  ],
  "Civil Procedure Code-I": [
    "Jurisdiction and institution of suits",
    "Summons, pleadings and appearance",
    "Framing of issues and trial process",
    "Practice drafting exercises",
  ],
  "Civil Procedure Code-II": [
    "Judgment, decree and execution (as taught)",
    "Appeals, review and revision overview",
    "Interim orders and selected special procedures",
    "Case strategy and problem questions",
  ],
  "Criminal Procedure Code-I": [
    "Courts and powers under CrPC",
    "Arrest, investigation and FIR",
    "Pre-trial mechanisms",
    "Fair trial comparisons (overview)",
  ],
  "Criminal Procedure Code-II": [
    "Charge, trial and evidence in criminal cases",
    "Bail, appeals and disposal",
    "Medico-legal aspects in trials",
    "Clinical / simulated applications",
  ],
  defaultMajor: [
    "Core concepts and statutory framework",
    "Doctrines and leading authorities",
    "Critical analysis and contemporary issues",
    "Practical application / problem questions",
  ],
  defaultGe: [
    "As per HEC Undergraduate Education Policy model course",
    "Learning outcomes and contents set by the offering department / HEC model outline",
    "Assessment and reading list as notified by the university",
  ],
};

function normalizeTitle(t) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .replace(/–/g, "-")
    .trim();
}

/** Exact / alias CLO match only — never fuzzy-match "Criminal Law – I" onto 4Y "Criminal Law". */
function findClos(title) {
  const t = normalizeTitle(title);
  if (clos[t]) return clos[t].outcomes;
  const aliases = {
    "Alternative Dispute Resolution (ADR)": "Alternate Dispute Resolution",
    "Law of Business Organizations -I": "Law of Business Organizations-I",
    "Law of Business Organizations -II": "Law of Business Organizations-II",
    "Islamic Personal Law- II": "Islamic Personal Law-II",
  };
  const a = aliases[t];
  if (a && clos[a]) return clos[a].outcomes;
  for (const k of Object.keys(clos)) {
    if (t.toLowerCase() === k.toLowerCase()) return clos[k].outcomes;
  }
  return null;
}

function courseKey(program, title) {
  return `${program}||${normalizeTitle(title)}`;
}

function stripPart(title) {
  return normalizeTitle(title)
    .replace(/\s*[-–]\s*[IVX0-9]+$/i, "")
    .replace(/\s*\(.*?\)\s*$/g, "")
    .trim();
}

function findBooks(title) {
  const t = normalizeTitle(title);
  if (books[t]) return books[t];
  const base = stripPart(t);
  if (books[base]) return books[base];
  for (const k of Object.keys(books)) {
    const kl = k.toLowerCase();
    const tl = t.toLowerCase();
    const bl = base.toLowerCase();
    if (tl === kl || bl === kl || tl.includes(kl) || kl.includes(bl)) {
      return books[k];
    }
  }
  return [
    "Primary statutes and rules as prescribed for this course",
    "University / department reading list",
    "Leading case digests relevant to the subject",
  ];
}

function findOutline(title, category) {
  const t = normalizeTitle(title);
  if (outlines[t]) return outlines[t];
  const base = stripPart(t);
  if (outlines[base]) return outlines[base];
  // Longest key wins so "Islamic Jurisprudence" is not stolen by bare "Jurisprudence".
  let best = null;
  let bestLen = 0;
  for (const k of Object.keys(outlines)) {
    if (k === "defaultMajor" || k === "defaultGe") continue;
    const kn = normalizeTitle(k).toLowerCase();
    const tl = t.toLowerCase();
    if (tl === kn || tl.startsWith(kn + " ") || tl.startsWith(kn + "-") || kn === base.toLowerCase()) {
      if (kn.length > bestLen) {
        best = outlines[k];
        bestLen = kn.length;
      }
    }
  }
  if (best) return best;
  if (/general education|interdisciplinary|elective|capstone|ids-/i.test(category + " " + t)) {
    return outlines.defaultGe;
  }
  return outlines.defaultMajor;
}

/** Course detail from Final Curriculum LLB.pdf — js/syllabus-data/llb5-details.json */
const llb5DetailsFile = JSON.parse(fs.readFileSync("js/syllabus-data/llb5-details.json", "utf8"));
function findLlb5Detail(title) {
  const t = normalizeTitle(title);
  if (llb5DetailsFile[t]) return llb5DetailsFile[t];
  const tl = t.toLowerCase();
  for (const k of Object.keys(llb5DetailsFile)) {
    if (normalizeTitle(k).toLowerCase() === tl) return llb5DetailsFile[k];
  }
  return null;
}

const byTitle = {};
function ensureCourse(title, category, program) {
  const prog = program || "General";
  const key = courseKey(prog, title);
  if (byTitle[key]) return;
  const bare = normalizeTitle(title);
  const d5 =
    prog === "LLB 5 Years" || prog === "LLB 5 Years Elective" ? findLlb5Detail(bare) : null;
  const outcomes = prog === "LLB 4 Years" ? findClos(bare) : d5?.outcomes || null;
  let sourceNote;
  if (prog === "LLB 4 Years" && outcomes) {
    sourceNote =
      "Course Learning Outcomes from HEC LLB Curriculum 2025 (4-year). Outline topics and books are study aids; your university may prescribe a different list.";
  } else if (d5) {
    sourceNote =
      d5.sourceNote ||
      "Course detail from HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Titles and credit hours match that PDF; topics and books follow the official course description.";
  } else if (prog === "LLB 5 Years" || prog === "LLB 5 Years Elective") {
    sourceNote =
      "Scheme of studies from HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Course titles and credit hours match that PDF exactly. Detailed outcomes are set by the university; outline topics and books below are common study aids and may differ by campus.";
  } else if (prog === "LLM") {
    sourceNote =
      "HEC LL.M. (Revised 2006). Detailed syllabi are set by the offering university; topics and books below are study aids.";
  } else {
    sourceNote =
      "HEC requires departments to prepare detailed syllabi. Outcomes below are generalised study aims; outline topics and books are common references and may differ by university.";
  }
  byTitle[key] = {
    title: bare,
    program: prog,
    category: category || "",
    outcomes: outcomes || [
      "Demonstrate understanding of the core principles of this subject as taught under the HEC / university scheme.",
      "Analyse key doctrines, statutes and authorities relevant to the course.",
      "Apply learning to problem questions, drafting or advocacy tasks as required.",
    ],
    outline: d5?.outline || findOutline(bare, category || ""),
    books: d5?.books || findBooks(bare),
    sourceNote,
  };
}

/** LLB 5 Years — locked to Final Curriculum LLB.pdf (HEC Revised 2015). Source: js/syllabus-data/llb5-scheme.json */
const llb5Scheme = JSON.parse(fs.readFileSync("js/syllabus-data/llb5-scheme.json", "utf8"));
const LLB5 = Object.fromEntries(
  Object.entries(llb5Scheme.semesters).map(([sem, courses]) => [
    sem,
    courses.map((c) => c.title),
  ])
);
const LLB5_ELECTIVES = llb5Scheme.electives;

const LLM_TITLES = [
  "Research Methodology",
  "Thesis / Dissertation",
  "Administrative Law", "Alternate Dispute Resolution", "Banking Laws", "Commercial / Business Laws",
  "Company / Corporate Law", "Comparative Constitutional Law", "Comparative Environmental Law",
  "Comparative Human Rights Law", "Comparative Study of Islamic and Western Jurisprudence",
  "Constitutional Law of Pakistan", "Criminology", "Intellectual Property Laws", "International Economic Law",
  "International Trade Law", "Islamic Laws", "Labour Laws", "Law and Politics", "Law and Society in South Asia",
  "Law of Evidence", "Law of International Institutions", "Law of Taxation",
  "Legal History of Pakistan and India", "Shipping Law", "Western Jurisprudence and Legal Theory",
];

for (const sem of Object.values(scheme.semesters)) {
  for (const c of sem) ensureCourse(c.title, c.category, "LLB 4 Years");
}
for (const k of Object.keys(clos)) ensureCourse(k, "Major", "LLB 4 Years");
for (const titles of Object.values(LLB5)) {
  for (const t of titles) {
    if (/^Elective\s*[–-]/i.test(t)) continue;
    ensureCourse(t, "Major / scheme course", "LLB 5 Years");
  }
}
for (const t of LLB5_ELECTIVES) ensureCourse(t, "Elective", "LLB 5 Years");
for (const t of LLM_TITLES) ensureCourse(t, "LLM", "LLM");
for (const list of Object.values(scheme.electiveClusters || {})) {
  for (const t of list) ensureCourse(t, "Elective", "LLB 4 Years");
}

/* ── Google Drive book PDFs ── */
const driveBooks = {
  "Fundamentals of Economics": [
    { title: "Mankiw — Principles of Economics (PDF)", url: "https://drive.google.com/file/d/14WD3T8v1-FAYdQHYxloqhrSUI7TbQA3a/view?usp=sharing", free: true, drive: true },
  ],
  "Islamic Jurisprudence": [
    { title: "Islamic Jurisprudence — Usul al-Fiqh (PDF)", url: "https://drive.google.com/file/d/18vTxkzgJRHcV8BkWbbEAMkhPYQg5kRbs/view?usp=sharing", free: true, drive: true },
  ],
  "Introduction to Sociology": [
    { title: "Sociology — Chapters 4, 5, 6 (PDF)", url: "https://drive.google.com/file/d/1IxQlQajzJH5-QugylBYmwzfRX_hLNMEe/view?usp=sharing", free: true, drive: true },
    { title: "Sociology — 3 Chapters (PDF)", url: "https://drive.google.com/file/d/1tm3LSHJ9KbSfD5h7OOmX9AaDr0qOYECp/view?usp=sharing", free: true, drive: true },
  ],
  "Introduction to Logic & Reasoning": [
    { title: "A Concise Introduction to Logic (PDF)", url: "https://drive.google.com/file/d/1J4o-Rchx2IqgeTjokt10vypuiuIDhCmJ/view?usp=sharing", free: true, drive: true },
  ],
  "Skills Development": [
    { title: "Presentation Skills (PDF)", url: "https://drive.google.com/file/d/1S7cBy2u7i6fXdWeT1INfOnW3grKJAKZV/view?usp=sharing", free: true, drive: true },
  ],
  "English": [
    { title: "McGraw-Hill Handbook — Shaw (PDF)", url: "https://drive.google.com/file/d/1WJ8ZqCie2UQPXHX3k_mLipYFUH6-VH8Q/view?usp=sharing", free: true, drive: true },
    { title: "English Grammar — Wren & Martin (PDF)", url: "https://drive.google.com/file/d/1n29gRA--TZcDcPaATzeqgpTrfBpUuHrM/view?usp=sharing", free: true, drive: true },
  ],
  "Introduction to Law": [
    { title: "Phil Harris — Introduction to Law (PDF)", url: "https://drive.google.com/file/d/1g1IxBhusT2AytUWaMCK_bXRrGN3o6L4f/view?usp=sharing", free: true, drive: true },
    { title: "CS Foundation — Introduction to Law (PDF)", url: "https://drive.google.com/file/d/1vmm-DBxlaNE_kFntBHL5p19dtSqK5TSi/view?usp=sharing", free: true, drive: true },
    { title: "Keenan & Riches — Business Law (PDF)", url: "https://drive.google.com/file/d/144yx87pSivXoaQm5AhaLJibw5Ib3OaX_/view?usp=sharing", free: true, drive: true },
  ],
  "Jurisprudence": [
    { title: "H.L.A. Hart — The Concept of Law (PDF)", url: "https://drive.google.com/file/d/1pzjdNzeTXy6W6qMB4yjVmA1Bq-LyYQ0l/view?usp=sharing", free: true, drive: true },
    { title: "Dworkin — Taking Rights Seriously (PDF)", url: "https://drive.google.com/file/d/1guIPV17jhvZs7TfSjiq6mUl0HQZ3QnAi/view?usp=sharing", free: true, drive: true },
  ],
  "Human Rights Law": [
    { title: "Dworkin — Taking Rights Seriously (PDF)", url: "https://drive.google.com/file/d/1guIPV17jhvZs7TfSjiq6mUl0HQZ3QnAi/view?usp=sharing", free: true, drive: true },
  ],
  "History (South Asia)": [
    { title: "Modern South Asia — History, Culture (PDF)", url: "https://drive.google.com/file/d/1gyQkQiSlrX7OP01nFUnBIDPClMUJO6l6/view?usp=sharing", free: true, drive: true },
  ],
  "Legal System of Pakistan": [
    { title: "History of Legal System in Subcontinent & Pakistan (PDF)", url: "https://drive.google.com/file/d/1l28brhsV0J56qQLBnR8K3GscfGPZdSfn/view?usp=sharing", free: true, drive: true },
  ],
  "Law of Torts": [
    { title: "Law of Torts — Lecture Notes (PDF)", url: "https://drive.google.com/file/d/1I6z2aa4Sl0EznuCr7kshAdRv_fb69gh_/view?usp=sharing", free: true, drive: true },
  ],
};

function findDriveBooks(title) {
  const t = normalizeTitle(title);
  const tl = t.toLowerCase();
  const base = stripPart(t).toLowerCase();
  for (const [pattern, books] of Object.entries(driveBooks)) {
    const pl = pattern.toLowerCase();
    if (tl === pl || tl.includes(pl) || pl.includes(tl) || base === pl || base.includes(pl) || pl.includes(base)) {
      return books;
    }
  }
  return [];
}

/* ── Book link resolution ── */
const bookLinks = {
  "Constitution of Pakistan": { url: "https://pakistancode.gov.pk/pdffiles/administrator9d8e2ecc414c6d3371ac41114b61a2c4.pdf", free: true },
  "Constitution of the Islamic Republic of Pakistan": { url: "https://pakistancode.gov.pk/pdffiles/administrator9d8e2ecc414c6d3371ac41114b61a2c4.pdf", free: true },
  "Pakistan Penal Code": { url: "https://pakistancode.gov.pk/pdffiles/administratord5622ea3f15bfa00b17d2cf7770a8434.pdf", free: true },
  "PPC": { url: "https://pakistancode.gov.pk/pdffiles/administratord5622ea3f15bfa00b17d2cf7770a8434.pdf", free: true },
  "Code of Criminal Procedure, 1898": { url: "https://pakistancode.gov.pk/pdffiles/administrator7db1e56f0f1d39a6e67573ec6b0944e2.pdf", free: true },
  "CrPC": { url: "https://pakistancode.gov.pk/pdffiles/administrator7db1e56f0f1d39a6e67573ec6b0944e2.pdf", free: true },
  "Code of Civil Procedure, 1908": { url: "https://pakistancode.gov.pk/pdffiles/administrator6598dabbad120033d4d42d717dcf9755.pdf", free: true },
  "Contract Act, 1872": { url: "https://pakistancode.gov.pk/pdffiles/administrator8332a6df32386960ac7d81a5cf7aade2.pdf", free: true },
  "Qanun-e-Shahadat Order, 1984": { url: "https://pakistancode.gov.pk/pdffiles/administrator01031a2c8cddc523d08a0df0ec37d7d0.pdf", free: true },
  "Transfer of Property Act, 1882": { url: "https://pakistancode.gov.pk/pdffiles/administrator77923ce792b475e339e1f46ba0442da3.pdf", free: true },
  "Registration Act, 1908": { url: "https://pakistancode.gov.pk/pdffiles/administrator0f29bc9f1e3dfed37c0034eed1e29d53.pdf", free: true },
  "Specific Relief Act, 1877": { url: "https://pakistancode.gov.pk/pdffiles/administratorf257754bbb3c6863d879492bc8cd8f6e.pdf", free: true },
  "Partnership Act, 1932": { url: "https://pakistancode.gov.pk/pdffiles/administratorbbc0b5b0d78c35e99e3b94f6b77b69db.pdf", free: true },
  "Companies Act, 2017": { url: "https://pakistancode.gov.pk/pdffiles/administrator89de324eeaa53c96ff701820d2e007e4.pdf", free: true },
  "Muslim Family Laws Ordinance, 1961": { url: "https://pakistancode.gov.pk/pdffiles/administratoreecaf3b490e2d43d2e3b50c0c068b5d7.pdf", free: true },
  "Prevention of Electronic Crimes Act, 2016": { url: "https://pakistancode.gov.pk/pdffiles/administrator6a061efe0ed5bd153fa8b79b8eb4cba7.pdf", free: true },
  "PECA": { url: "https://pakistancode.gov.pk/pdffiles/administrator6a061efe0ed5bd153fa8b79b8eb4cba7.pdf", free: true },
  "Pakistan Environmental Protection Act, 1997": { url: "https://pakistancode.gov.pk/pdffiles/administrator17094efb999f9a865461eb1498175947.pdf", free: true },
  "PEPA": { url: "https://pakistancode.gov.pk/pdffiles/administrator17094efb999f9a865461eb1498175947.pdf", free: true },
  "UN Charter": { url: "https://www.un.org/en/about-us/un-charter/full-text", free: true },
  "UDHR": { url: "https://www.un.org/en/about-us/universal-declaration-of-human-rights", free: true },
  "US Constitution": { url: "https://constitution.congress.gov/constitution/", free: true },
  "Civil Servants Act, 1973": { url: "https://pakistancode.gov.pk/pdffiles/administrator09f6f0996bae74d218dd6d1ecedd0318.pdf", free: true },
};

function resolveBookLink(bookTitle) {
  const t = bookTitle;
  const tl = t.toLowerCase();
  const hasAuthor = /—|–/.test(t) || /\b(by|ed\.|edited)\b/i.test(t);
  for (const [key, val] of Object.entries(bookLinks)) {
    if (tl.includes(key.toLowerCase())) {
      if (hasAuthor && !tl.startsWith(key.toLowerCase())) continue;
      return { title: t, url: val.url, free: val.free };
    }
  }
  return {
    title: t,
    url: "https://www.google.com/search?tbm=bks&q=" + encodeURIComponent(t),
    free: false,
  };
}

for (const entry of Object.values(byTitle)) {
  entry.booksWithLinks = (entry.books || []).map(resolveBookLink);
  const drive = findDriveBooks(entry.title);
  if (drive.length) entry.booksWithLinks.push(...drive);
}

const out = `/* Auto-generated — HEC LLB 4Y (2025) + 5Y Final Curriculum (Revised 2015) + LLM study aids. Run: node scripts/build-syllabus-catalog.mjs */
window.ULC_SYLLABUS_CATALOG = ${JSON.stringify(
  {
    llb4: scheme,
    llb5: { ...llb5Scheme, details: llb5DetailsFile },
    courses: byTitle,
  },
  null,
  0
)};
`;
fs.writeFileSync("js/syllabus-catalog.js", out);
console.log("courses", Object.keys(byTitle).length, "bytes", out.length);
