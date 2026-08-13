/**
 * Apply pakistan-code-pdf-map.json (+ manual overrides) to js/books-app.js STATUTES.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const booksPath = path.join(__dirname, "..", "js", "books-app.js");
const map = JSON.parse(fs.readFileSync(path.join(__dirname, "pakistan-code-pdf-map.json"), "utf8"));

const MANUAL = {
  "Constitution of the Islamic Republic of Pakistan, 1973":
    "https://pakistancode.gov.pk/pdffiles/administrator9d8e2ecc414c6d3371ac41114b61a2c4.pdf",
  "Oaths Act, 1873":
    "https://pakistancode.gov.pk/pdffiles/administrator0158e1a02138a940073e102386a7525a.pdf",
  "Trusts Act, 1882":
    "https://pakistancode.gov.pk/pdffiles/administrator097759e0f2a16527881669c6e1435919.pdf",
  // 1940 Act repealed; current law is Ordinance 2001
  "Trade Marks Act, 1940":
    "https://pakistancode.gov.pk/pdffiles/administratora4ef8d40e3d97faef49343d2242e0c3a.pdf",
};

const TITLE_RENAMES = {
  "Trade Marks Act, 1940": "Trade Marks Ordinance, 2001",
};

let src = fs.readFileSync(booksPath, "utf8");
const start = src.indexOf("  var STATUTES = [");
const end = src.indexOf("  ];", start);
if (start < 0 || end < 0) throw new Error("STATUTES block not found");

const block = src.slice(start, end + 4);
const entryRe =
  /\{\s*title:\s*"((?:\\.|[^"\\])*)"\s*,\s*url:\s*"((?:\\.|[^"\\])*)"\s*\}/g;

let updated = 0;
let keptOfficial = 0;
let newBlock = block.replace(entryRe, (full, title, url) => {
  let newTitle = TITLE_RENAMES[title] || title;
  let newUrl = null;

  if (MANUAL[title]) {
    newUrl = MANUAL[title];
  } else if (map.results[title]?.pdf) {
    newUrl = map.results[title].pdf;
  }

  if (newUrl) {
    if (url !== newUrl || newTitle !== title) updated++;
    return `{ title: "${newTitle}", url: "${newUrl}" }`;
  }

  // Leave international / non-PC / google / police rules / etc.
  if (url.includes("pakistani.org")) {
    throw new Error(`Still pakistani.org for: ${title}`);
  }
  keptOfficial++;
  return full;
});

src = src.slice(0, start) + newBlock + src.slice(end + 4);
fs.writeFileSync(booksPath, src);
console.log(`Updated ${updated} statute URLs; left ${keptOfficial} non-PC entries unchanged`);

// Sanity: no pakistani.org left in STATUTES
const statutesOnly = src.slice(src.indexOf("var STATUTES"), src.indexOf("];", src.indexOf("var STATUTES")) + 2);
if (statutesOnly.includes("pakistani.org")) {
  console.error("ERROR: pakistani.org still present in STATUTES");
  process.exit(1);
}
console.log("No pakistani.org remaining in STATUTES");
