/**
 * Parse assets/hec-llb-5year-extract.txt into js/syllabus-data/llb5-details.json
 * keyed by scheme titles (normalizeTitle: en-dash → hyphen).
 */
import fs from "fs";

const extractFull = fs.readFileSync("assets/hec-llb-5year-extract.txt", "utf8");
const startAt = extractFull.indexOf("YEAR-1 SEMESTER-I");
if (startAt < 0) throw new Error("Could not find YEAR-1 SEMESTER-I");
const extract = extractFull.slice(startAt);

function cleanWs(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function collapseLines(s) {
  return cleanWs(s)
    .replace(/\n(\d+|th|nd|rd|st)\n/gi, " ")
    .replace(/\b(th|nd|rd|st)\s+edn\.?/gi, "")
    .replace(/\b(I\s+rpt\.?|rpt\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

function dropPageNums(s) {
  return s
    .split("\n")
    .filter((line) => !/^\s*\d{1,3}\s*$/.test(line))
    .join("\n");
}

function parseBooks(block) {
  let start = block.search(
    /Recommended\s+(Reading|Books)|Reading\s+List|Useful\s+Websites/i
  );
  if (start < 0) start = block.search(/(?:^|\n)\s*1\.\s+[A-Za-z]/);
  if (start < 0) return [];
  let rest = dropPageNums(block.slice(start));
  rest = rest.replace(/^(Recommended\s+(Reading|Books)|Reading\s+List|Useful\s+Websites)[^\n]*/i, "");
  const items = [];
  const re = /(?:^|\n)\s*(\d+)\.\s+/g;
  const idxs = [];
  let m;
  while ((m = re.exec(rest))) idxs.push({ n: m[1], i: m.index, len: m[0].length });
  for (let i = 0; i < idxs.length; i++) {
    const from = idxs[i].i + idxs[i].len;
    const to = i + 1 < idxs.length ? idxs[i + 1].i : rest.length;
    let     item = collapseLines(rest.slice(from, to));
    item = item.replace(/^\d+\.\s*/, "").replace(/^https?:\S+\s*/i, "").trim();
    item = item.replace(/\s+\d{1,3}\s*$/, "").trim();
    if (item.length < 8) continue;
    if (/^(YEAR-|LLB\s|ANNEXURE|INTERNSHIP)/i.test(item)) continue;
    if (item.length > 220) item = item.slice(0, 217).replace(/\s+\S*$/, "") + "…";
    items.push(item);
  }
  const seen = new Set();
  return items.filter((b) => {
    const k = b.toLowerCase().slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

function parseDescription(block) {
  const cut = block.search(
    /Recommended\s+(Reading|Books)|Reading\s+List|Useful\s+Websites|/i
  );
  let desc = cut >= 0 ? block.slice(0, cut) : block;
  desc = dropPageNums(desc);
  desc = desc.replace(/^LLB[^\n]*\n+/i, "");
  desc = desc.replace(/^[A-Z][A-Z\s,&'()\-]{8,}\n+/, "");
  desc = collapseLines(desc);
  desc = desc.replace(/^[-–]+\s*/, "");
  if (/\bLLB\s+\d{3}\b/.test(desc) && desc.length > 400) {
    desc = desc.replace(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHT|NINTH|TENTH)\b[\s\S]*/i, "").trim();
  }
  return desc;
}

function outlineFromDesc(desc) {
  if (!desc) return [];
  if (/please see annexure/i.test(desc)) return [];
  return desc
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/[.]+$/, ""))
    .filter((s) => s.length > 35 && s.length < 280 && !/recommended/i.test(s) && !/\bLLB\s+\d{3}\b/.test(s))
    .slice(0, 6);
}

function outcomesFrom(desc, outline, title) {
  const sentences = (desc || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 35 && !/\bLLB\s+\d{3}\b/.test(s));
  const o = [];
  if (sentences[0]) o.push(sentences[0]);
  if (sentences[1] && sentences[1] !== sentences[0]) o.push(sentences[1]);
  if (o.length < 2 && outline[0]) o.push(outline[0] + ".");
  o.push(
    `Apply ${title} as taught under HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015).`
  );
  return o.slice(0, 4);
}

/** PDF header snippet → scheme title (index.html / llb5-scheme.json). */
const MARKERS = [
  ["LLB 111         ENGLISH-I", "English-I"],
  ["LLB 112  PAKISTAN STUDIES", "Pakistan Studies"],
  ["LLB 113       INTRODUCTION TO SOCIOLOGY", "Introduction to Sociology"],
  ["LLB 114 FUNDAMENTALS OF ECONOMICS", "Fundamentals of Economics"],
  ["LLB 115 INTRODUCTION TO LAW", "Introduction to Law"],
  ["LLB 116 SKILLS DEVELOPMENT", "Skills Development"],
  ["LLB 121            ENGLISH-II", "English - II"],
  ["LLB 122            ISLAMIC STUDIES", "Islamic Studies/Ethics"],
  ["LLB 123            PRINCIPLES OF POLITICAL SCIENCE", "Principles of Political Science"],
  ["LLB 124            LEGAL SYSTEM OF PAKISTAN", "Legal System of Pakistan"],
  ["LLB 125 HISTORY (South-Asia)", "History (South Asia)"],
  ["LLB 126     LAW OF TORTS-I", "Law of Torts- I"],
  ["LLB 211           ENGLISH-III", "English-III"],
  ["LLB  212          INTRODUCTION TO LOGIC", "Introduction to Logic and Reasoning"],
  ["LLB 213         ISLAMIC JURISPRUDENCE-I", "Islamic Jurisprudence - I"],
  ["LLB 214  LAW OF TORTS-II", "Law of Torts-II"],
  ["LLB 215 LAW OF CONTRACT-I", "Law of Contract - I"],
  ["LLB 216 CONSTITUTIONAL LAW-I (UK)", "Constitutional Law-I (UK)"],
  ["LLB 222    HUMAN RIGHTS LAW", "Human Rights Law"],
  ["LLB 223 CONSTITUTIONAL LAW-II (US)", "Constitutional Law-II (US)"],
  ["LLB 224    LAW OF CONTRACT-II", "Law of Contract-II"],
  ["LLB 225 ISLAMIC JURISPRUDENCE-II", "Islamic Jurisprudence - II"],
  ["LLB 226 INTRODUCTION TO PSYCHOLOGY", "Introduction to Psychology"],
  ["LLB  311 JURISPRUDENCE-I", "Jurisprudence - I"],
  ["LLB  312 CONSTITUTIONAL LAW-III", "Constitutional Law-III (Pakistan)"],
  ["LLB 313 ISLAMIC PERSONAL LAW-I", "Islamic Personal Law - I"],
  ["LLB 314     CRIMINAL LAW-I", "Criminal Law-I"],
  ["LLB 315 LAW OF PROPERTY", "Law of Property"],
  ["LLB 321 JURISPRUDENCE-II", "Jurisprudence - II"],
  ["LLB 322 LAW OF BUSINESS ORGANIZATIONS", "Law of Business Organizations"],
  ["LLB 323 ISLAMIC PERSONAL LAW-II", "Islamic Personal Law - II"],
  ["LLB 324     CRIMINAL LAW-II", "Criminal Law - II"],
  ["LLB 325 LAND LAWS", "Land Laws"],
  ["LLB 411 PUBLIC INTERNATIONAL LAW-I", "Public International Law - I"],
  ["LLB 412 CONSTITUTIONAL DEVELOPMENTS IN PAKISTAN", "Constitutional Developments in Pakistan"],
  ["LLB 413  CIVIL PROCEDURE-I", "Civil Procedure-I"],
  ["LLB 414 CRIMINAL PROCEDURE-I", "Criminal Procedure - I"],
  ["LLB 415 LAW OF EVIDENCE-I", "Law of Evidence - I"],
  ["LLB 416 LEGAL DRAFTING-I", "Legal Drafting - I"],
  ["LLB 421      PUBLIC INTERNATIONAL LAW-II", "Public International Law - II"],
  ["LLB 422 EQUITY AND SPECIFIC RELIEF", "Equity and Specific Relief"],
  ["LLB 423 CIVIL PROCEDURE-II", "Civil Procedure - II"],
  ["LLB 424 CRIMINAL PROCEDURE-II", "Criminal Procedure - II"],
  ["LLB 425 LAW OF EVIDENCE-II", "Law of Evidence - II"],
  ["LLB 426 LEGAL DRAFTING-II", "Legal Drafting - II"],
  ["LLB 511 RESEARCH METHODS", "Research Methods"],
  ["LLB 512 MINOR ACTS", "Minor Acts"],
  ["LLB XXX ELECTIVE-I", "Elective - I"],
  ["LLB XXX ELECTIVE-II", "Elective - II"],
  ["LLB 515 MOOT CASES AND PROFESSIONAL ETHICS", "Moot Cases and Professional Ethics"],
  ["LLB 521 ADMINISTRATIVE LAW", "Administrative Law"],
  ["LLB 522 INTERPRETATION OF STATUTES AND", "Interpretation of Statutes and Legislative Drafting"],
  ["LLB 523 RESEARCH PROJECT", "Research Project"],
  ["LLB XXX ELECTIVE-III", "Elective - III"],
  ["LLB XXX ELECTIVE-IV", "Elective - IV"],
  ["INTERNSHIP", "Internship"],
];

const ANNEX = {
  "English-I": {
    outcomes: [
      "Enhance language skills and develop critical thinking (HEC Functional English).",
      "Use grammar, sentence structure, comprehension, paragraph writing and presentation skills as prescribed in Annexure-A.",
      "Apply Functional English to legal studies and everyday academic communication.",
    ],
    outline: [
      "Basics of grammar; parts of speech and articles",
      "Sentence structure; active and passive voice",
      "Phrase, clause and sentence analysis; punctuation and spelling",
      "Comprehension; discussion and listening",
      "Translation (Urdu to English); paragraph writing; presentation skills",
    ],
    books: [
      "A.J. Thomson & A.V. Martinet — Practical English Grammar (Exercises 1 & 2)",
      "Marie-Christine Boutin et al. — Writing. Intermediate (Oxford Supplementary Skills)",
      "Brian Tomlinson & Rod Ellis — Reading. Upper Intermediate",
    ],
  },
  "English - II": {
    outcomes: [
      "Meet real-life communication needs as set out in HEC English II (Communication Skills).",
      "Write coherent paragraphs and essays, CVs and applications, and use study/academic skills.",
      "Present with attention to content, style and pronunciation.",
    ],
    outline: [
      "Paragraph writing: unified and coherent paragraphs",
      "Essay writing; CV and job application",
      "Translation skills (Urdu to English)",
      "Study skills: skimming, scanning, summary, précis and comprehension",
      "Academic skills: letters, memos, minutes, library and internet",
      "Presentation skills and personality development",
    ],
    books: [
      "A.J. Thomson & A.V. Martinet — Practical English Grammar (Exercises 2)",
      "Marie-Christine Boutin et al. — Writing. Intermediate",
      "Rob Nolasco — Writing. Upper-Intermediate",
      "John Langan — Reading and Study Skills",
    ],
  },
  "English-III": {
    outcomes: [
      "Enhance language skills and critical thinking through technical writing and presentation (HEC English III).",
      "Write essays, research proposals, term papers, technical and progress reports.",
      "Deliver presentations with academic clarity and consistency of form.",
    ],
    outline: [
      "Presentation skills",
      "Essay writing: descriptive, narrative, discursive, argumentative",
      "Academic writing: research/term paper proposal and paper",
      "Technical report writing",
      "Progress report writing",
    ],
    books: [
      "Ron White — Writing. Advanced (Oxford Supplementary Skills)",
      "John Langan — College Writing Skills",
      "Laurie G. Kirszner & Stephen R. Mandell — Patterns of College Writing",
    ],
  },
  "Pakistan Studies": {
    outcomes: [
      "Develop a vision of historical perspective, government, politics, contemporary Pakistan and ideological background (HEC Annexure-B).",
      "Study governance, national development and issues posing challenges to Pakistan.",
      "Apply this framework to constitutional and civic questions relevant to law students.",
    ],
    outline: [
      "Ideological rationale: Sir Syed, Iqbal and Quaid-e-Azam; Muslim separatism; people and land",
      "Government and politics in Pakistan: 1947–58 through 1999 onward",
      "Contemporary Pakistan: economy, society, ethnicity, foreign policy and futuristic outlook",
    ],
    books: [
      "Shahid Javed Burki — State & Society in Pakistan",
      "S. Akbar Zaidi — Issues in Pakistan’s Economy",
      "S.M. Burke & Lawrence Ziring — Pakistan’s Foreign Policy",
      "Safdar Mehmood — Pakistan Political Roots & Development",
      "Khalid Bin Sayeed — The Political System of Pakistan",
    ],
  },
  "Islamic Studies/Ethics": {
    outcomes: [
      "Provide basic information about Islamic Studies and Islamic civilization (HEC Annexure-C).",
      "Improve understanding of worship, faith and religious life, including selected Qur’anic and Hadith texts.",
      "Introduce Islamic law & jurisprudence, culture, and contemporary issues as prescribed.",
    ],
    outline: [
      "Introduction to Quranic Studies; selected verses (Al-Baqara, Al-Hujrat, Al-Muminoon, Al-Furqan, Al-An’am, Al-Ahzab, Al-Hashr, Al-Saf)",
      "Seerat of the Holy Prophet (S.A.W.) in Makkah and Madina",
      "Introduction to Sunnah and selected Hadith",
      "Islamic Law & Jurisprudence: concepts, history, sources, sectarianism",
      "Islamic culture & civilization; Islam & science (as in Annexure-C)",
    ],
    books: [
      "HEC Islamic Studies (Compulsory) reading list as notified with Annexure-C",
      "Selected Qur’an and Hadith texts as prescribed",
    ],
  },
};

const details = {};
const positions = MARKERS.map(([needle, title]) => {
  const i = extract.indexOf(needle);
  if (i < 0) {
    console.warn("MISSING MARKER", needle);
  }
  return { i, needle, title };
}).filter((x) => x.i >= 0);

positions.sort((a, b) => a.i - b.i);

for (let n = 0; n < positions.length; n++) {
  const { i, title } = positions[n];
  const end = n + 1 < positions.length ? positions[n + 1].i : extract.indexOf("ANNEXURE - A");
  const block = extract.slice(i, end > i ? end : i + 4000);
  if (ANNEX[title]) {
    details[title] = {
      ...ANNEX[title],
      sourceNote:
        "Course detail from HEC Final Curriculum LLB.pdf (Annexure / compulsory HEC course). Scheme titles and credit hours match the 5-year table.",
    };
    continue;
  }
  const desc = parseDescription(block);
  let books = parseBooks(block);
  let outline = outlineFromDesc(desc);
  if (/^Elective/i.test(title)) {
    outline = [
      "Choose one course from the HEC elective list offered by the university",
      "If a course is taught in two modules, the second module of the same course is compulsory",
    ];
    books = ["Reading list as prescribed by the offering department for the chosen elective"];
  }
  if (title === "Internship") {
    outline = [
      "Compulsory 10 to 12 weeks after Semester 8 and before Semester 10 (summer vacations)",
      "Placement with law firms, courts, companies, government offices, NGOs, banks or other recognised entities",
      "Assessed by report, self-assessment, faculty assessment and host organisation assessment",
    ];
    books = ["Internship report guidelines as notified by the university"];
  }
  if (title === "Research Project") {
    outline = [
      "Compulsory research project after successful completion of 9th semester",
      "Long dissertation of about 8,000–10,000 words on an assigned legal topic",
      "Individual or group work under an allotted supervisor; proposal after 8th semester",
    ];
  }
  if (title === "Law of Evidence - II" && outline.length < 2) {
    outline = [
      "Second module of Law of Evidence-I",
      "Substantive and procedural rules of evidence; admissibility, modes of proof, production and effect of evidence",
      "Qanun-e-Shahadat Order, 1984 as prescribed",
    ];
  }
  if (title === "Civil Procedure - II") {
    outline = [
      "Continuation of Civil Procedure-I (CPC 1908: jurisdiction, suits, orders, decrees, execution, appeal, review, revision)",
      "Limitation period for civil suits under the Limitation Act, 1908",
    ];
  }
  if (!books.length && desc) {
    books = ["Reading list as prescribed in HEC Final Curriculum LLB.pdf for this course"];
  }
  details[title] = {
    outcomes: outcomesFrom(desc, outline, title),
    outline: outline.length ? outline : [desc.slice(0, 180) || "As prescribed in HEC Final Curriculum LLB.pdf"],
    books: books.length ? books : ["University / HEC prescribed reading list"],
    sourceNote:
      "Course detail from HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Outline and books follow the official course description.",
  };
}

const scheme = JSON.parse(fs.readFileSync("js/syllabus-data/llb5-scheme.json", "utf8"));
const missing = [];
for (const sem of Object.values(scheme.semesters)) {
  for (const c of sem) {
    const key = c.title.replace(/–/g, "-");
    if (!details[key] && !/^Elective/i.test(c.title)) missing.push(c.title);
  }
}

if (details["Law of Evidence - II"] && details["Law of Evidence - I"]?.books?.length) {
  details["Law of Evidence - II"].books = details["Law of Evidence - I"].books;
}
if (details["Skills Development"]) {
  details["Skills Development"].books = [
    "Universities/institutions develop reading material in accordance with the course description (HEC Final Curriculum).",
  ];
  details["Skills Development"].outline = [
    "Introduction to Information Technology and computer systems",
    "e-Commerce, computer graphics, computer security and controls",
    "MS Office, internet browsers and databases",
    "Information systems in business; e-Banking",
  ];
}

fs.writeFileSync("js/syllabus-data/llb5-details.json", JSON.stringify(details, null, 2));

for (const e of scheme.electives) {
  const key = e.replace(/–/g, "-");
  if (details[key]) continue;
  details[key] = {
    outcomes: [
      `${e} is an elective on the HEC LLB (5 Years) list. Students take any four electives in Semesters 9 and 10.`,
      "If the university teaches this subject in two modules, both modules of the same course are compulsory.",
      "Detailed weekly syllabus is set by the offering department under HEC guidelines.",
    ],
    outline: [
      "Content as offered by the university for this HEC elective",
      "If split into two modules, complete both",
    ],
    books: ["Department / university reading list for this elective"],
    sourceNote:
      "Listed as an elective in HEC Final Curriculum LLB.pdf (LLB 5 Years Revised 2015). Detailed outline is set by the offering university.",
  };
}
fs.writeFileSync("js/syllabus-data/llb5-details.json", JSON.stringify(details, null, 2));
console.log("with electives", Object.keys(details).length);
