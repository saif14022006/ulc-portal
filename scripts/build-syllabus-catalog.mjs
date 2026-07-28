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
  "Islamic Jurisprudence – I": [
    "Imran Ahsan Khan Nyazee — Islamic Jurisprudence",
    "Abdur Rahim — Principles of Muhammadan Jurisprudence",
  ],
  "Islamic Jurisprudence – II": [
    "Imran Ahsan Khan Nyazee — Islamic Jurisprudence",
    "Nyazee — Outlines of Islamic Jurisprudence",
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
  Jurisprudence: [
    "Natural law, positivism, realism and sociological approaches",
    "Key jurists and theories of law",
    "Law, morality and justice",
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

function findClos(title) {
  const t = normalizeTitle(title);
  if (clos[t]) return clos[t].outcomes;
  // fuzzy aliases
  const aliases = {
    "Alternative Dispute Resolution (ADR)": "Alternate Dispute Resolution",
    "Introduction to Law and Legal Systems": "Introduction to Law and Legal Systems",
    "Law of Business Organizations -I": "Law of Business Organizations-I",
    "Law of Business Organizations -II": "Law of Business Organizations-II",
    "Islamic Personal Law- II": "Islamic Personal Law-II",
  };
  const a = aliases[t];
  if (a && clos[a]) return clos[a].outcomes;
  for (const k of Object.keys(clos)) {
    if (t.toLowerCase() === k.toLowerCase()) return clos[k].outcomes;
    if (t.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(t.toLowerCase())) {
      return clos[k].outcomes;
    }
  }
  return null;
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
  for (const k of Object.keys(outlines)) {
    if (k === "defaultMajor" || k === "defaultGe") continue;
    if (t.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(t.toLowerCase())) {
      return outlines[k];
    }
  }
  if (/general education|interdisciplinary|elective|capstone|ids-/i.test(category + " " + t)) {
    return outlines.defaultGe;
  }
  return outlines.defaultMajor;
}

const byTitle = {};
function ensureCourse(title, category) {
  const key = normalizeTitle(title);
  if (byTitle[key]) return;
  const outcomes = findClos(key);
  byTitle[key] = {
    title: key,
    category: category || "",
    outcomes: outcomes || [
      "Demonstrate understanding of the core principles of this subject as taught under the HEC / university scheme.",
      "Analyse key doctrines, statutes and authorities relevant to the course.",
      "Apply learning to problem questions, drafting or advocacy tasks as required.",
    ],
    outline: findOutline(key, category || ""),
    books: findBooks(key),
    sourceNote: outcomes
      ? "Course Learning Outcomes from HEC LLB Curriculum 2025. Outline topics and books are study aids commonly used for Pakistani LLB courses; your university may prescribe a different list."
      : "HEC requires departments to prepare detailed syllabi. Outcomes below are generalised study aims; outline topics and books are common references for Pakistani legal education and may differ by university.",
  };
}

/** LLB 5 Years (HEC Revised 2015 scheme titles used in the app) */
const LLB5 = {
  1: ["English – I", "Pakistan Studies", "Introduction to Sociology", "Fundamentals of Economics", "Introduction to Law", "Skills Development"],
  2: ["English – II", "Islamic Studies / Ethics", "Principles of Political Science", "Legal System of Pakistan", "History (South Asia)", "Law of Torts – I"],
  3: ["English – III", "Introduction to Logic & Reasoning", "Islamic Jurisprudence – I", "Law of Torts – II", "Law of Contract – I", "Constitutional Law – I (UK)"],
  4: ["Human Rights Law", "Constitutional Law – II (US)", "Law of Contract – II", "Islamic Jurisprudence – II", "Introduction to Psychology"],
  5: ["Jurisprudence – I", "Constitutional Law – III (Pakistan)", "Islamic Personal Law – I", "Criminal Law – I", "Law of Property"],
  6: ["Jurisprudence – II", "Law of Business Organizations", "Islamic Personal Law – II", "Criminal Law – II", "Land Laws"],
  7: ["Public International Law – I", "Constitutional Developments in Pakistan", "Civil Procedure – I", "Criminal Procedure – I", "Law of Evidence – I", "Legal Drafting – I"],
  8: ["Public International Law – II", "Equity & Specific Relief", "Civil Procedure – II", "Criminal Procedure – II", "Law of Evidence – II", "Legal Drafting – II"],
  9: ["Research Methods", "Minor Acts", "Elective – I", "Elective – II", "Moot Cases & Professional Ethics"],
  10: ["Administrative Law", "Interpretation of Statutes & Legislative Drafting", "Research Project / Dissertation", "Elective – III", "Elective – IV"],
};

const LLB5_ELECTIVES = [
  "Alternate Dispute Resolution", "Banking Laws", "Conflict of Laws", "Consumer Protection Laws",
  "Custom & Tariff Laws", "e-Commerce Law", "Election Laws", "Environmental Laws", "Gender and Law",
  "Insurance Laws", "Intellectual Property Laws", "International Economic Law", "International Humanitarian Law",
  "International Institutions", "International Trade Law", "Islamic Commercial Laws", "Labour Laws",
  "Law and Development", "Law and Energy", "Law and Society in Pakistan", "Local & Special Laws",
  "Media Laws", "Medical & Forensic Law", "Mergers & Acquisitions", "Islamic Legal Maxims",
  "Public Interest Litigation", "Securities Regulation", "Shipping & Admiralty Laws", "Taxation Laws",
  "Telecommunication Laws",
];

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
  for (const c of sem) ensureCourse(c.title, c.category);
}
for (const k of Object.keys(clos)) ensureCourse(k, "Major");
for (const titles of Object.values(LLB5)) {
  for (const t of titles) ensureCourse(t, "LLB 5 Years");
}
for (const t of LLB5_ELECTIVES) ensureCourse(t, "LLB 5 Years Elective");
for (const t of LLM_TITLES) ensureCourse(t, "LLM");
for (const list of Object.values(scheme.electiveClusters || {})) {
  for (const t of list) ensureCourse(t, "LLB 4 Years Elective");
}

const out = `/* Auto-generated — HEC LLB 4Y (2025) + 5Y scheme + LLM study aids. Run: node scripts/build-syllabus-catalog.mjs */
window.ULC_SYLLABUS_CATALOG = ${JSON.stringify(
  {
    llb4: scheme,
    courses: byTitle,
  },
  null,
  0
)};
`;
fs.writeFileSync("js/syllabus-catalog.js", out);
console.log("courses", Object.keys(byTitle).length, "bytes", out.length);
