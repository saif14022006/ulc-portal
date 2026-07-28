/** Quick check: Excel names must never become *.xls.pdf */
function hasKnownExt(n) {
  return /\.(pdf|xls|xlsx|csv|doc|docx|txt|png|jpg|jpeg|webp|zip)$/i.test(String(n || ""));
}
function safeName(filename, fallback) {
  const fb = fallback || "ULC_file.pdf";
  let n = String(filename || fb)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
  n = n.replace(/\.(xls|xlsx|csv)\.pdf$/i, ".$1");
  if (!hasKnownExt(n)) {
    const fbExt = (String(fb).match(/\.[a-z0-9]+$/i) || [".pdf"])[0];
    n += fbExt;
  }
  return n;
}

const cases = [
  ["Award_List.xls", "ULC_file.pdf", "Award_List.xls"],
  ["Award_List.xls.pdf", "ULC_file.pdf", "Award_List.xls"],
  ["marks.xlsx", "ULC.pdf", "marks.xlsx"],
  ["report", "ULC.pdf", "report.pdf"],
  ["sheet", "ULC_award.xls", "sheet.xls"],
];

let fail = 0;
for (const [input, fb, want] of cases) {
  const got = safeName(input, fb);
  const ok = got === want;
  console.log(`${ok ? "OK" : "FAIL"}  ${input} + ${fb} => ${got} (want ${want})`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
