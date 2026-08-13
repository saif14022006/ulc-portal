/**
 * Resolve Pakistan Code (pakistancode.gov.pk) PDF URLs for statute titles.
 * Usage: node scripts/resolve-pakistan-code-pdfs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://pakistancode.gov.pk";
const INDEX = `${BASE}/english/LGu0xAD.php`;
const OUT = path.join(__dirname, "pakistan-code-pdf-map.json");

const TITLES = [
  "Anti-Money Laundering Act, 2010",
  "Anti-Rape (Investigation and Trial) Act, 2021",
  "Anti-Terrorism Act, 1997",
  "Arbitration Act, 1940",
  "Arms Act, 1878",
  "Bankers' Books Evidence Act, 1891",
  "Banking Companies Ordinance, 1962",
  "Benami Transactions (Prohibition) Act, 2017",
  "Bonded Labour System (Abolition) Act, 1992",
  "Cantonments Act, 1924",
  "Child Marriage Restraint Act, 1929",
  "Civil Servants Act, 1973",
  "Code of Civil Procedure, 1908 (CPC)",
  "Code of Criminal Procedure, 1898 (CrPC)",
  "Companies Act, 2017",
  "Competition Act, 2010",
  "Constitution of the Islamic Republic of Pakistan, 1973",
  "Contempt of Court Ordinance, 2003",
  "Contract Act, 1872",
  "Control of Narcotic Substances Act, 1997",
  "Copyright Ordinance, 1962",
  "Court Fees Act, 1870",
  "Customs Act, 1969",
  "Defamation Ordinance, 2002",
  "Dissolution of Muslim Marriages Act, 1939",
  "Easements Act, 1882",
  "Elections Act, 2017",
  "Electricity Act, 1910",
  "Electronic Transactions Ordinance, 2002",
  "Explosives Act, 1884",
  "Factories Act, 1934",
  "Fatal Accidents Act, 1855",
  "Foreign Exchange Regulation Act, 1947",
  "General Clauses Act, 1897",
  "Guardians and Wards Act, 1890",
  "Income Tax Ordinance, 2001",
  "Industrial Relations Act, 2012",
  "Juvenile Justice System Act, 2018",
  "Land Acquisition Act, 1894",
  "Legal Practitioners and Bar Councils Act, 1973",
  "Limitation Act, 1908",
  "Minimum Wages Ordinance, 1961",
  "Muslim Family Laws Ordinance, 1961",
  "Muslim Personal Law (Shariat) Application Act, 1962",
  "National Accountability Ordinance, 1999 (NAB)",
  "Negotiable Instruments Act, 1881",
  "Notaries Ordinance, 1961",
  "Oaths Act, 1873",
  "Official Secrets Act, 1923",
  "Pakistan Citizenship Act, 1951",
  "Pakistan Environmental Protection Act, 1997 (PEPA)",
  "Pakistan Penal Code, 1860 (PPC)",
  "Partnership Act, 1932",
  "Patents Ordinance, 2000",
  "Payment of Wages Act, 1936",
  "Police Order, 2002",
  "Powers of Attorney Act, 1882",
  "Prevention of Corruption Act, 1947",
  "Prevention of Electronic Crimes Act, 2016 (PECA)",
  "Probation of Offenders Ordinance, 1960",
  "Protection against Harassment of Women at the Workplace Act, 2010",
  "Qanun-e-Shahadat Order, 1984 (Law of Evidence)",
  "Registration Act, 1908",
  "Right of Access to Information Act, 2017",
  "Sale of Goods Act, 1930",
  "Sales Tax Act, 1990",
  "Specific Relief Act, 1877",
  "Stamp Act, 1899",
  "Succession Act, 1925",
  "Telegraph Act, 1885",
  "Trade Marks Act, 1940",
  "Transfer of Property Act, 1882",
  "Transgender Persons (Protection of Rights) Act, 2018",
  "Trusts Act, 1882",
  "West Pakistan Family Courts Act, 1964",
  "West Pakistan Land Revenue Act, 1967",
  "Workmen's Compensation Act, 1923",
];

const ALIASES = {
  "Code of Civil Procedure, 1908 (CPC)": ["Code of Civil Procedure", "1908"],
  "Code of Criminal Procedure, 1898 (CrPC)": ["Code of Criminal Procedure", "1898"],
  "Pakistan Penal Code, 1860 (PPC)": ["Pakistan Penal Code", "1860"],
  "National Accountability Ordinance, 1999 (NAB)": ["National Accountability", "1999"],
  "Pakistan Environmental Protection Act, 1997 (PEPA)": ["Pakistan Environmental Protection", "1997"],
  "Prevention of Electronic Crimes Act, 2016 (PECA)": ["Prevention of Electronic Crimes", "2016"],
  "Qanun-e-Shahadat Order, 1984 (Law of Evidence)": ["Qanun-e-Shahadat", "1984"],
  "Constitution of the Islamic Republic of Pakistan, 1973": [
    "Constitution of the Islamic Republic of Pakistan",
  ],
  "Protection against Harassment of Women at the Workplace Act, 2010": [
    "Protection against Harassment of Women",
    "2010",
  ],
  "West Pakistan Family Courts Act, 1964": ["Family Courts Act", "1964"],
  "West Pakistan Land Revenue Act, 1967": ["Land Revenue Act", "1967"],
  "Workmen's Compensation Act, 1923": ["Workmen", "Compensation", "1923"],
  "Bankers' Books Evidence Act, 1891": ["Bankers", "Books Evidence", "1891"],
  "Muslim Personal Law (Shariat) Application Act, 1962": ["Muslim Personal Law", "1962"],
  "Anti-Rape (Investigation and Trial) Act, 2021": ["Anti-Rape", "2021"],
  "Benami Transactions (Prohibition) Act, 2017": ["Benami", "2017"],
  "Bonded Labour System (Abolition) Act, 1992": ["Bonded Labour", "1992"],
  "Trade Marks Act, 1940": ["Trade Marks Act", "1940"],
  "Right of Access to Information Act, 2017": ["Right of Access to Information", "2017"],
};

function norm(s) {
  return s
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yearOf(title) {
  const m = title.match(/\b(18|19|20)\d{2}\b/);
  return m ? m[0] : null;
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "ULC-Portal-StatuteResolver/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseLawsFromHtml(html, laws, seen) {
  const re = /href=["']([^"']*UY2FqaJw1-apaUY2Fqa-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let added = 0;
  while ((m = re.exec(html))) {
    let href = m[1].replace(/&amp;/g, "&");
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!title || title.length < 3) continue;
    if (href.startsWith("/")) href = BASE + href;
    else if (!href.startsWith("http")) {
      href = `${BASE}/english/${href.replace(/^\.?\/?/, "")}`;
    }
    const key = href.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    laws.push({ title, href: key });
    added++;
  }
  return added;
}

function maxPageFromHtml(html) {
  let max = 1;
  const re = /[?&]page=(\d+)/gi;
  let m;
  while ((m = re.exec(html))) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

async function collectIndex() {
  const laws = [];
  const seen = new Set();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  for (const L of letters) {
    let page = 1;
    let maxPage = 1;
    while (page <= maxPage && page <= 30) {
      const url = `${INDEX}?alp=${L}&page=${page}&action=inactive`;
      await sleep(120);
      let html;
      try {
        html = await fetchText(url);
      } catch (e) {
        console.warn(`\nSkip ${url}: ${e.message}`);
        break;
      }
      if (page === 1) maxPage = maxPageFromHtml(html);
      const added = parseLawsFromHtml(html, laws, seen);
      process.stdout.write(`\rLetter ${L} page ${page}/${maxPage} (+${added}) total=${laws.length}   `);
      if (added === 0 && page > 1) break;
      page++;
    }
  }
  console.log(`\nTotal unique law pages from index: ${laws.length}`);
  return laws;
}

function scoreMatch(ourTitle, lawTitle) {
  const a = norm(ourTitle);
  const b = norm(lawTitle);
  if (a === b) return 1000;

  const year = yearOf(ourTitle);
  if (year && !b.includes(year)) return -1;
  if (/\brepealed\b/i.test(lawTitle) && !/\brepealed\b/i.test(ourTitle)) return -1;

  const alias = ALIASES[ourTitle];
  if (alias) {
    const needles = alias.map(norm);
    if (needles.every((n) => b.includes(n))) {
      // Prefer closer length / exactness among alias hits
      return 900 - Math.abs(b.length - a.length);
    }
  }

  const core = norm(
    ourTitle.replace(/\([^)]*\)/g, " ").replace(/,\s*(18|19|20)\d{2}\b/g, " ")
  );
  const stop = new Set(["the", "and", "act", "of", "order", "at", "for"]);
  const coreWords = core.split(" ").filter((w) => w.length > 2 && !stop.has(w));
  if (coreWords.length === 0) return 0;

  let hit = 0;
  for (const w of coreWords) {
    if (b.includes(w)) hit++;
  }
  const ratio = hit / coreWords.length;
  if (ratio < 0.75) return -1;

  let score = Math.round(ratio * 100);
  if (year && b.includes(year)) score += 50;
  if (b.startsWith(coreWords[0])) score += 10;
  if (/\bordinance\b/i.test(ourTitle) === /\bordinance\b/i.test(lawTitle)) score += 5;
  // Penalize extra distinguishing words in law title (amendment acts etc.)
  const extra = b.split(" ").filter((w) => w.length > 3 && !a.includes(w) && !stop.has(w));
  score -= Math.min(extra.length * 3, 30);
  return score;
}

function pickBest(ourTitle, laws) {
  let best = null;
  let bestScore = 0;
  for (const law of laws) {
    const s = scoreMatch(ourTitle, law.title);
    if (s > bestScore) {
      bestScore = s;
      best = law;
    }
  }
  if (bestScore < 70) return null;
  return { ...best, score: bestScore };
}

async function extractPdf(lawPageUrl) {
  const html = await fetchText(lawPageUrl);
  const m = html.match(/href=["']([^"']*pdffiles\/administrator[^"']+\.pdf)["']/i);
  if (m) {
    let href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("http")) return href;
    if (href.startsWith("/")) return BASE + href;
    return `${BASE}/${href.replace(/^\.\//, "")}`;
  }
  const m2 = html.match(/pdffiles\/administrator[a-f0-9]+\.pdf/i);
  if (!m2) return null;
  return `${BASE}/${m2[0]}`;
}

async function verifyPdf(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return res.status;
    const res2 = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-16" },
      redirect: "follow",
    });
    return res2.status;
  } catch {
    return 0;
  }
}

async function main() {
  const laws = await collectIndex();
  fs.writeFileSync(
    path.join(__dirname, "pakistan-code-index-cache.json"),
    JSON.stringify(laws, null, 2)
  );

  const results = {};
  const missing = [];

  for (const title of TITLES) {
    const match = pickBest(title, laws);
    if (!match) {
      missing.push({ title, reason: "no index match" });
      results[title] = { pdf: null, page: null, matchedTitle: null };
      console.log(`MISS  ${title}`);
      continue;
    }
    await sleep(180);
    let pdf = null;
    try {
      pdf = await extractPdf(match.href);
    } catch (e) {
      missing.push({ title, reason: `page fetch failed: ${e.message}`, page: match.href });
      results[title] = { pdf: null, page: match.href, matchedTitle: match.title };
      console.log(`FAIL  ${title} -> ${match.title}`);
      continue;
    }
    if (!pdf) {
      missing.push({
        title,
        reason: "no pdf on page",
        page: match.href,
        matchedTitle: match.title,
      });
      results[title] = { pdf: null, page: match.href, matchedTitle: match.title };
      console.log(`NOPDF ${title} -> ${match.title}`);
      continue;
    }
    results[title] = {
      pdf,
      page: match.href,
      matchedTitle: match.title,
      score: match.score,
    };
    console.log(`OK    ${title}\n      -> ${match.title}\n      -> ${pdf}`);
  }

  const withPdf = Object.entries(results).filter(([, v]) => v.pdf);
  const sampleIdx = [0, 1, 5, 10, 15, 20, Math.floor(withPdf.length / 2), withPdf.length - 1]
    .filter((i, n, a) => i >= 0 && i < withPdf.length && a.indexOf(i) === n);
  console.log("\nVerifying sample PDFs…");
  for (const i of sampleIdx) {
    const [title, v] = withPdf[i];
    const status = await verifyPdf(v.pdf);
    v.httpStatus = status;
    console.log(`  ${status} ${title}`);
    await sleep(100);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    matched: withPdf.length,
    missing: missing.length,
    missingDetails: missing,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT}`);
  console.log(`Matched ${withPdf.length}/${TITLES.length}; missing ${missing.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
