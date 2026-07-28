/** Excel filename must never become *.xls.pdf or *.xls (1).pdf */
function excelSafeName(filename) {
  let n = String(filename || "ULC_award.xls")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");
  while (/\.pdf$/i.test(n)) n = n.replace(/\.pdf$/i, "");
  if (/\.xlsx?/i.test(n)) {
    n = n.replace(/(\.xlsx?).*$/i, "$1");
  } else {
    n = n.replace(/\.+$/g, "") + ".xls";
  }
  const m = n.match(/(\.xlsx?)$/i);
  const ext = m ? m[1] : ".xls";
  let stem = n.slice(0, n.length - ext.length).replace(/\.+$/g, "");
  if (stem.length > 100) stem = stem.slice(0, 100);
  if (!stem) stem = "ULC_award";
  return stem + ext;
}

const cases = [
  ["ULC_Pakistan_Studies_Sem1_AwardList.xls", "ULC_Pakistan_Studies_Sem1_AwardList.xls"],
  ["ULC_Pakistan_Studies_Sem1_AwardList.xls.pdf", "ULC_Pakistan_Studies_Sem1_AwardList.xls"],
  ["ULC_Pakistan_Studies_Sem1_AwardList.xls (1).pdf", "ULC_Pakistan_Studies_Sem1_AwardList.xls"],
  ["report.pdf", "report.xls"],
  ["sheet", "sheet.xls"],
];

let fail = 0;
for (const [input, want] of cases) {
  const got = excelSafeName(input);
  const ok = got === want;
  console.log(`${ok ? "OK" : "FAIL"}  ${JSON.stringify(input)} => ${got}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
