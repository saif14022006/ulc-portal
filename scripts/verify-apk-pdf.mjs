/**
 * Verify release APK contains the PDF share/archive fix.
 * Usage: node scripts/verify-apk-pdf.mjs [path-to-apk]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apk =
  process.argv[2] ||
  path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");

if (!fs.existsSync(apk)) {
  console.error("APK missing:", apk);
  process.exit(1);
}

const tmp = path.join(root, "scripts", ".apk-verify");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const AdmZip = null;
try {
  // unzip via PowerShell on Windows
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${apk.replace(
        /'/g,
        "''"
      )}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
      { stdio: "pipe" }
    );
  } else {
    execSync(`unzip -oq "${apk}" -d "${tmp}"`, { stdio: "pipe" });
  }
} catch (e) {
  // Expand-Archive may fail on .apk; use jar or tar
  try {
    execSync(`tar -xf "${apk}" -C "${tmp}"`, { stdio: "pipe" });
  } catch (e2) {
    console.error("Could not extract APK", e2.message);
    process.exit(1);
  }
}

const checks = [
  ["native-save.js", "assets/public/js/native-save.js", ["ULC-PDF-2.0.1", "finishAndShare", "captureOpts", "no encoding", "saveJsPdf"]],
  ["my-files.js", "assets/public/js/my-files.js", ["pdfPath", "shareArchivedPdf"]],
  ["index.html", "assets/public/index.html", ["downloadPDF", "native-save.js", "allowTaint:false"]],
  ["build stamp", "assets/public/ULC_BUILD.txt", ["ULC-PDF-2.0.1"]],
];

let pass = 0;
let fail = 0;
const results = [];

for (const [label, rel, needles] of checks) {
  const p = path.join(tmp, rel);
  const okFile = fs.existsSync(p);
  let text = okFile ? fs.readFileSync(p, "utf8") : "";
  const missing = needles.filter((n) => !text.includes(n));
  const ok = okFile && missing.length === 0;
  if (ok) pass++;
  else fail++;
  results.push({ label, ok, missing, exists: okFile });
}

// DEX class names
let dexOk = false;
const dexFiles = [];
function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const full = path.join(d, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith(".dex")) dexFiles.push(full);
  }
}
walk(tmp);
for (const dex of dexFiles) {
  const buf = fs.readFileSync(dex);
  const ascii = buf.toString("binary");
  if (ascii.includes("UlcPdfSaverPlugin") && ascii.includes("shareAppFile") && ascii.includes("finishAndShare")) {
    dexOk = true;
    break;
  }
}
if (dexOk) pass++;
else fail++;
results.push({ label: "DEX UlcPdfSaver+shareAppFile", ok: dexOk, missing: dexOk ? [] : ["shareAppFile/finishAndShare"] });

const st = fs.statSync(apk);
console.log(
  JSON.stringify(
    {
      apk,
      size: st.size,
      mtime: st.mtime.toISOString(),
      pass,
      fail,
      verdict: fail === 0 ? "PASS" : "FAIL",
      results,
    },
    null,
    2
  )
);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
