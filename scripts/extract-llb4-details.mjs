/**
 * Build js/syllabus-data/llb4-details.json from HEC LLB 2025 CLOs + scheme titles.
 * Source PDF: assets/hec-llb-4year-curriculum.pdf (Hec LL. B 4 Years Curriculum.pdf)
 */
import fs from "fs";

const scheme = JSON.parse(fs.readFileSync("js/syllabus-data/llb4-scheme.json", "utf8"));
const clos = JSON.parse(fs.readFileSync("js/syllabus-data/llb4-clos.json", "utf8"));

function norm(t) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .replace(/–/g, "-")
    .trim();
}

const CLO_ALIASES = {
  "Alternative Dispute Resolution (ADR)": "Alternate Dispute Resolution",
  "Law of Business Organizations -I": "Law of Business Organizations-I",
  "Law of Business Organizations -II": "Law of Business Organizations-II",
  "Islamic Personal Law- II": "Islamic Personal Law-II",
};

function findClos(title) {
  const t = norm(title);
  if (clos[t]?.outcomes) return clos[t].outcomes;
  if (clos[title]?.outcomes) return clos[title].outcomes;
  const a = CLO_ALIASES[t] || CLO_ALIASES[title];
  if (a && clos[a]?.outcomes) return clos[a].outcomes;
  const tl = t.toLowerCase();
  for (const k of Object.keys(clos)) {
    if (norm(k).toLowerCase() === tl) return clos[k].outcomes;
  }
  return null;
}

function outlineFromClos(outcomes) {
  return (outcomes || []).map((o) => String(o).replace(/\.$/, "").trim());
}

const SOURCE_MAJOR =
  "Course Learning Outcomes from HEC LLB Curriculum 2025 (Hec LL. B 4 Years Curriculum.pdf). The PDF requires departments to write full weekly syllabi; books below are study aids.";
const SOURCE_GE =
  "HEC LLB Curriculum 2025: university may use HEC Undergraduate Education Policy V 1.1 model courses for this general-education / IDS slot. Detailed CLOs are set by the offering department.";
const SOURCE_ELEC =
  "HEC LLB Curriculum 2025 elective cluster. Departments develop CLOs and reading lists for advanced electives they offer.";

const details = {};

function put(title, rec) {
  details[norm(title)] = rec;
  if (title !== norm(title)) details[title] = rec;
}

for (const sem of Object.values(scheme.semesters)) {
  for (const c of sem) {
    const outcomes = findClos(c.title);
    if (outcomes) {
      put(c.title, {
        outcomes,
        outline: outlineFromClos(outcomes),
        sourceNote: SOURCE_MAJOR,
      });
      continue;
    }
    if (/^Elective-/i.test(c.title)) {
      put(c.title, {
        outcomes: [
          "Complete an advanced LLB elective offered by the university (HEC 2025: six electives, 18 CH).",
          "If a subject is taught in two modules, complete both modules of the same course.",
          "Meet the department’s CLOs and assessment for the chosen elective.",
        ],
        outline: [
          "Advanced course from the HEC 2025 elective clusters, as offered by the department",
          "Content, CLOs and books are set by the offering university",
        ],
        books: ["Department reading list for the chosen elective"],
        sourceNote: SOURCE_ELEC,
      });
      continue;
    }
    if (/^Capstone/i.test(c.title)) {
      put(c.title, {
        outcomes: [
          "Complete a capstone project (3 CH) as required for the HEC LLB 2025 degree award.",
          "Apply legal research and analysis to an assigned problem under faculty supervision.",
        ],
        outline: [
          "Capstone project of 3 credit hours",
          "Cannot replace the separate internship requirement",
        ],
        books: ["University capstone / research guidelines"],
        sourceNote: SOURCE_MAJOR,
      });
      continue;
    }
    if (/^IDS-/i.test(c.title)) {
      put(c.title, {
        outcomes: [
          "Complete an interdisciplinary course that complements the LLB major (HEC 2025 recommended list includes Economics, Sociology, Psychology, Political Science, Gender Studies, Media, Public Policy, History).",
          "ADR and Research Methodology are mandatory IDS courses in the scheme where placed.",
        ],
        outline: [
          "Interdisciplinary course as approved by the university statutory body",
          "Recommended HEC list: Economics, Sociology, Psychology, Political Science, Gender Studies, Media, Public Policy, History",
        ],
        books: ["As prescribed for the IDS course offered"],
        sourceNote: SOURCE_GE,
      });
      continue;
    }
    put(c.title, {
      outcomes: [
        "Complete this general-education course as prescribed under HEC Undergraduate Education Policy V 1.1 (2023).",
        "The university may use HEC-designed model courses for starred GE slots in the LLB 2025 scheme.",
      ],
      outline: [
        "HEC model course / department syllabus for this GE slot",
        "Credits and category as in the HEC LLB 2025 scheme of studies",
      ],
      books: ["HEC model-course reading list or department list"],
      sourceNote: SOURCE_GE,
    });
  }
}

for (const [cluster, list] of Object.entries(scheme.electiveClusters || {})) {
  for (const t of list) {
    if (details[norm(t)] || details[t]) continue;
    put(t, {
      outcomes: [
        `${t} is listed in the HEC LLB 2025 elective cluster “${cluster}”.`,
        "Departments develop CLOs and course content for electives they offer.",
        "Six electives (18 CH) must be completed for the degree.",
      ],
      outline: [
        `Advanced elective in ${cluster}`,
        "Weekly topics and assessment as notified by the offering department",
      ],
      books: ["Department reading list for this elective"],
      sourceNote: SOURCE_ELEC,
    });
  }
}

put("Internship", {
  outcomes: [
    "Complete an internship of three (03) credit hours in accordance with HEC Undergraduate Education Policy V 1.1.",
    "This requirement cannot be substituted with additional coursework, capstone, research, or project work.",
  ],
  outline: [
    "Internship: 3 credit hours (mandatory degree requirement)",
    "Not replaceable by extra courses, capstone, or research",
  ],
  books: ["University internship report guidelines"],
  sourceNote: SOURCE_MAJOR,
});

fs.writeFileSync("js/syllabus-data/llb4-details.json", JSON.stringify(details, null, 2));
const withClo = Object.values(details).filter((d) =>
  (d.outcomes || [])[0]?.startsWith("Identify") || (d.outcomes || [])[0]?.startsWith("Possess") || (d.outcomes || [])[0]?.startsWith("possess")
).length;
console.log("llb4-details keys", Object.keys(details).length, "major-style CLO entries ~", withClo);
