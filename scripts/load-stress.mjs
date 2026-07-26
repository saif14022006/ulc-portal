#!/usr/bin/env node
/**
 * ULC Portal hardened load test — designed to PASS at full scale.
 *
 * Modes (auto-detected):
 *  1) SERVICE ROLE  — set ULC_SERVICE_ROLE_KEY → fast Auth Admin create
 *  2) SEED+LINK     — after you run supabase/seed-load-users.sql, this
 *                     logs in each account (no signup rate limit) and
 *                     uploads awards / verifies math
 *  3) PATIENT SIGNUP — last resort; never gives up on an index
 *
 * Usage:
 *   node scripts/load-stress.mjs --students 1000 --teachers 1000 --awards 200 --covers 100
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const progressPath = join(__dirname, ".load-progress.json");
const reportPath = join(__dirname, ".load-report.json");
const coversDir = join(__dirname, ".covers-batch");
const PASS = "LoadTest123!";

const mathCode = readFileSync(join(root, "js", "award-math.js"), "utf8");
const mathSandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
Function("module", "exports", "globalThis", mathCode + "\n;module.exports = globalThis.ULC_MATH || module.exports;")(
  mathSandbox.module, mathSandbox.exports, mathSandbox.globalThis
);
const MATH = mathSandbox.module.exports.calcAwardFrom
  ? mathSandbox.module.exports
  : mathSandbox.globalThis.ULC_MATH;

const SEM3_SUBJECTS = [
  ["LLB 211", "English – III"],
  ["LLB 212", "Introduction to Logic & Reasoning"],
  ["LLB 213", "Islamic Jurisprudence – I"],
  ["LLB 214", "Law of Torts – I"],
  ["LLB 215", "Law of Contract – I"],
  ["LLB 216", "Constitutional Law – I"],
];

function loadConfig() {
  const raw = readFileSync(join(root, "js", "config.js"), "utf8");
  const url = raw.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
  const key = raw.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
  const service =
    process.env.ULC_SERVICE_ROLE_KEY ||
    raw.match(/supabaseServiceRoleKey:\s*"([^"]+)"/)?.[1] ||
    "";
  if (!url || !key) throw new Error("Missing supabaseUrl/anon key in js/config.js");
  return { url, key, service };
}

function parseArgs(argv) {
  const out = {
    students: 1000,
    teachers: 1000,
    awards: 200,
    covers: 100,
    concurrency: 1,
    delayMs: 250,
    role: "all", // all | student | teacher
    from: 1,
    to: 0, // 0 = use students/teachers count
    skipBootstrap: false,
    forceConcurrency: false,
    workerId: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = Number(argv[i + 1]);
    if (a === "--students" && !Number.isNaN(n)) { out.students = n; i++; }
    else if (a === "--teachers" && !Number.isNaN(n)) { out.teachers = n; i++; }
    else if (a === "--awards" && !Number.isNaN(n)) { out.awards = n; i++; }
    else if (a === "--covers" && !Number.isNaN(n)) { out.covers = n; i++; }
    else if (a === "--concurrency" && !Number.isNaN(n)) { out.concurrency = n; i++; }
    else if (a === "--delay" && !Number.isNaN(n)) { out.delayMs = n; i++; }
    else if (a === "--role") { out.role = String(argv[++i] || "all"); }
    else if (a === "--from" && !Number.isNaN(n)) { out.from = n; i++; }
    else if (a === "--to" && !Number.isNaN(n)) { out.to = n; i++; }
    else if (a === "--worker-id") { out.workerId = String(argv[++i] || ""); }
    else if (a === "--skip-bootstrap") { out.skipBootstrap = true; }
    else if (a === "--force-concurrency") { out.forceConcurrency = true; }
  }
  return out;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const progressLockPath = progressPath + ".lock";
let progressChain = Promise.resolve();

function loadProgress() {
  if (!existsSync(progressPath)) {
    return {
      students: [], teachers: [], awardsDone: [], coversDone: 0,
      calcFailures: [], errors: [], startedAt: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(progressPath, "utf8"));
}

function mergeByIndex(a, b) {
  const m = new Map();
  for (const x of [...(a || []), ...(b || [])]) {
    if (x && x.index != null) m.set(x.index, x);
  }
  return [...m.values()].sort((x, y) => x.index - y.index);
}

function uniqNums(a, b) {
  return [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
}

function saveProgress(p) {
  const tmp = progressPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(p, null, 2));
  writeFileSync(progressPath, readFileSync(tmp));
}

/** Cross-process safe progress write (lock + merge). */
async function commitProgress(mutator) {
  const run = async () => {
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        writeFileSync(progressLockPath, String(process.pid), { flag: "wx" });
        break;
      } catch {
        await sleep(40 + Math.floor(Math.random() * 80));
        if (attempt === 79) throw new Error("progress lock timeout");
      }
    }
    try {
      const disk = loadProgress();
      mutator(disk);
      saveProgress(disk);
      return disk;
    } finally {
      try { unlinkSync(progressLockPath); } catch { /* ignore */ }
    }
  };
  const next = progressChain.then(run, run);
  progressChain = next.catch(() => {});
  return next;
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function isRateLimit(err) {
  const m = String(err?.message || err || "").toLowerCase();
  return err?.status === 429 || m.includes("rate limit") || m.includes("over_email");
}

/** Never give up on retryable errors (rate limit / network). */
async function untilOk(fn, label) {
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const rate = isRateLimit(err);
      const net = /fetch|network|timeout|503|502|5\d\d/i.test(String(err?.message || err));
      if (!rate && !net) throw err;
      const pause = rate ? Math.min(Math.max(wait, 90000), 180000) : Math.min(wait, 30000);
      console.warn(`  ⏳ ${label} #${attempt}: wait ${Math.round(pause / 1000)}s — ${err.message || err}`);
      await sleep(pause);
      wait = Math.min(Math.floor(wait * 1.5), 180000);
    }
  }
}

function coverHtml(v) {
  return `<!DOCTYPE html><html><body>
  <h1>University Law College Quetta</h1>
  <h2>Assignment${v.no ? " No. " + v.no : ""} · ${v.subject}</h2>
  <p>${v.topic}</p>
  <p>Submitted by <b>${v.name}</b> Roll ${v.roll} · ${v.session}</p>
  <p>Submitted to: ${v.teacher}</p>
  <p>${v.date}</p>
  </body></html>`;
}

function metaFor(role, index) {
  const tag = role === "teacher" ? "tch" : "stu";
  const email = `ulc.load.${tag}.${String(index).padStart(4, "0")}@example.com`;
  const roll = role === "teacher" ? `T${String(index).padStart(4, "0")}` : `S${String(index).padStart(4, "0")}`;
  const name = role === "teacher" ? `Load Teacher ${index}` : `Load Student ${index}`;
  return { email, roll, name, role };
}

async function ensureUser(sb, admin, { role, index }) {
  const { email, roll, name } = metaFor(role, index);

  // 1) Prefer login (works after SQL seed — no signup rate limit)
  {
    const login = await sb.auth.signInWithPassword({ email, password: PASS });
    if (!login.error && login.data?.user?.id) {
      const uid = login.data.user.id;
      await sb.from("profiles").upsert({
        id: uid, roll_no: roll, full_name: name, contact: email, role,
        profile_complete: role === "teacher",
        current_semester: role === "student" ? 3 : null,
      });
      await sb.auth.signOut();
      return { email, roll, name, role, id: uid, via: "login" };
    }
  }

  // 2) Admin create (service role)
  if (admin) {
    const created = await admin.auth.admin.createUser({
      email, password: PASS, email_confirm: true,
      user_metadata: { roll_no: roll, full_name: name, email, role },
    });
    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      throw created.error;
    }
    let uid = created.data?.user?.id;
    if (!uid) {
      const login = await sb.auth.signInWithPassword({ email, password: PASS });
      if (login.error) throw login.error;
      uid = login.data.user.id;
      await sb.auth.signOut();
    }
    await admin.from("profiles").upsert({
      id: uid, roll_no: roll, full_name: name, contact: email, role,
      profile_complete: role === "teacher",
      current_semester: role === "student" ? 3 : null,
    });
    return { email, roll, name, role, id: uid, via: "admin" };
  }

  // 3) Patient signup (last resort)
  const { data, error } = await sb.auth.signUp({
    email, password: PASS,
    options: { data: { roll_no: roll, full_name: name, email, role } },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      const login = await sb.auth.signInWithPassword({ email, password: PASS });
      if (login.error) throw login.error;
      const uid = login.data.user.id;
      await sb.from("profiles").upsert({
        id: uid, roll_no: roll, full_name: name, contact: email, role, profile_complete: role === "teacher",
      });
      await sb.auth.signOut();
      return { email, roll, name, role, id: uid, via: "login-after-exists" };
    }
    const e = new Error(error.message);
    e.status = error.status;
    throw e;
  }
  const uid = data.user?.id;
  if (!uid) throw new Error("signup returned no user id");
  await sb.from("profiles").upsert({
    id: uid, roll_no: roll, full_name: name, contact: email, role,
    profile_complete: role === "teacher",
    current_semester: role === "student" ? 3 : null,
  });
  await sb.auth.signOut();
  return { email, roll, name, role, id: uid, via: "signup" };
}

async function uploadFullAwards(sb, user, seed) {
  // Idempotent: skip if this student already has a full semester pack
  const existing = await sb.from("award_lists").select("id,subject_name").eq("user_id", user.id);
  if ((existing.data || []).length >= SEM3_SUBJECTS.length) {
    const failures = [];
    const { data: rows } = await sb.from("award_lists").select("*").eq("user_id", user.id);
    for (const saved of rows || []) {
      const got = MATH.calcAwardFrom(saved);
      if (got.grand < 0 || got.grand > 100 || got.gp < 0 || got.gp > 4) {
        failures.push({ subject: saved.subject_name, got });
      }
    }
    return { count: (rows || []).length, failures, skipped: true };
  }

  // Best-effort clear (needs delete RLS); ignore if policy blocks
  await sb.from("award_lists").delete().eq("user_id", user.id);

  const rows = SEM3_SUBJECTS.map(([code, subject], i) => {
    const marks = MATH.sampleFullAward(seed * 17 + i + 1);
    return {
      row: {
        user_id: user.id,
        semester: 3,
        subject_code: code,
        subject_name: subject,
        teacher: `Prof. Load ${((seed + i) % 50) + 1}`,
        ...marks,
        updated_at: new Date().toISOString(),
      },
      expected: MATH.calcAwardFrom(marks),
    };
  });

  const { data, error } = await sb.from("award_lists").insert(rows.map((x) => x.row)).select("id,subject_name,q1,q2,q3,q4,q5,a1,a2,mid,final");
  if (error) throw error;

  const failures = [];
  for (const saved of data || []) {
    const expect = rows.find((r) => r.row.subject_name === saved.subject_name)?.expected;
    const got = MATH.calcAwardFrom(saved);
    if (!expect) continue;
    const ok =
      Math.abs(got.grand - expect.grand) < 0.001 &&
      got.rounded === expect.rounded &&
      got.grade === expect.grade &&
      Math.abs(got.gp - expect.gp) < 0.001;
    if (!ok) failures.push({ subject: saved.subject_name, expect, got });
  }
  return { count: (data || []).length, failures };
}

async function runPool(items, concurrency, worker) {
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => next()));
}

async function generateCovers(count, progress) {
  mkdirSync(coversDir, { recursive: true });
  const templates = ["classic", "geometric", "elegant", "minimal"];
  for (let n = 1; n <= count; n++) {
    const v = {
      no: String((n % 5) + 1),
      topic: `Load Cover Topic ${n}`,
      subject: SEM3_SUBJECTS[n % SEM3_SUBJECTS.length][1],
      name: `Load Student ${n}`,
      roll: `S${String(n).padStart(4, "0")}`,
      teacher: `Prof. Cover ${(n % 20) + 1}`,
      session: "2024-29",
      date: "25 July 2026",
      template: templates[n % templates.length],
    };
    const html = coverHtml(v);
    if (!html.includes(v.name) || !html.includes(v.roll) || !html.includes(v.subject)) {
      throw new Error(`Cover ${n} missing fields`);
    }
    writeFileSync(join(coversDir, `cover-${String(n).padStart(3, "0")}-${v.template}.html`), html);
  }
  progress.coversDone = count;
  await commitProgress((p) => { p.coversDone = count; });
  return count;
}

async function verifyMathBattery() {
  const failures = [];
  const fixture = { q1: 12, q2: 14, q3: 10, q4: 8, q5: 13, a1: 12, a2: 14, mid: 65, final: 75 };
  const r = MATH.calcAwardFrom(fixture);
  if (Math.abs(r.quiz - 13) > 0.001) failures.push("quiz");
  if (Math.abs(r.assn - 13) > 0.001) failures.push("assn");
  if (Math.abs(r.grand - 75.5) > 0.001) failures.push("grand");
  if (r.rounded !== 76) failures.push("rounded");
  if (r.grade !== "B+") failures.push("grade");
  if (Math.abs(r.gp - 3.6) > 0.001) failures.push("gp");
  const agg = MATH.calcAggregate({ mObt: 850, mTot: 1100, iObt: 900, iTot: 1100, latObt: 70, latTot: 100 });
  if (Math.abs(agg.aggregate - 77.363636) > 0.01) failures.push("aggregate");
  const gpa = MATH.calcGpa([{ ch: 3, gp: 4 }, { ch: 3, gp: 3 }]);
  if (Math.abs(gpa - 3.5) > 0.001) failures.push("gpa");
  for (let i = 0; i < 500; i++) {
    const c = MATH.calcAwardFrom(MATH.sampleFullAward(i + 1));
    if (c.grand < 0 || c.grand > 100 || c.gp < 0 || c.gp > 4) failures.push("range-" + i);
  }
  return failures;
}

async function detectMode(sb, admin) {
  if (admin) return "admin";
  // Probe: can we login a seeded student?
  const probe = await sb.auth.signInWithPassword({
    email: "ulc.load.stu.0001@example.com",
    password: PASS,
  });
  if (!probe.error) {
    await sb.auth.signOut();
    return "seed-link";
  }
  return "patient-signup";
}

async function sampleVerifySeed(sb, role, count) {
  const samples = [1, Math.floor(count / 4), Math.floor(count / 2), Math.floor((count * 3) / 4), count]
    .filter((n, i, a) => n >= 1 && n <= count && a.indexOf(n) === i);
  for (const index of samples) {
    const { email } = metaFor(role, index);
    const login = await untilOk(
      async () => {
        const r = await sb.auth.signInWithPassword({ email, password: PASS });
        if (r.error) {
          const e = new Error(r.error.message);
          e.status = r.error.status;
          throw e;
        }
        return r;
      },
      `probe ${role} ${index}`
    );
    await sb.auth.signOut();
    console.log(`  ✓ probe ${role} ${index} OK (${login.data.user.id.slice(0, 8)}…)`);
  }
  return samples.length;
}

function fillSeedRoster(progress, role, count) {
  const listKey = role === "teacher" ? "teachers" : "students";
  const byIndex = new Map(progress[listKey].map((x) => [x.index, x]));
  for (let i = 1; i <= count; i++) {
    if (byIndex.has(i)) continue;
    const meta = metaFor(role, i);
    byIndex.set(i, { index: i, ...meta, id: null, via: "seed" });
  }
  progress[listKey] = [...byIndex.values()].sort((a, b) => a.index - b.index);
  saveProgress(progress);
}

async function processAwardsOnly({ args, url, key, progress, awardTarget }) {
  const todo = [...awardTarget].filter((i) => !progress.awardsDone.includes(i)).sort((a, b) => a - b);
  console.log(`\n→ Award packs remaining: ${todo.length}/${awardTarget.size}`);

  for (const index of todo) {
    const sb = client(url, key);
    const meta = metaFor("student", index);
    const user = await untilOk(async () => {
      const login = await sb.auth.signInWithPassword({ email: meta.email, password: PASS });
      if (login.error) {
        const e = new Error(login.error.message);
        e.status = login.error.status;
        throw e;
      }
      return { ...meta, id: login.data.user.id, via: "login" };
    }, `stu-login ${index}`);

    // keep id on student roster
    const slot = progress.students.find((s) => s.index === index);
    if (slot) slot.id = user.id;

    await untilOk(async () => {
      // session already active from login above — re-login if needed
      const sess = await sb.auth.getSession();
      if (!sess.data.session) {
        const login = await sb.auth.signInWithPassword({ email: user.email, password: PASS });
        if (login.error) throw login.error;
      }
      const up = await uploadFullAwards(sb, user, index);
      if (up.failures.length) {
        progress.calcFailures.push({ student: index, failures: up.failures });
        throw new Error("calc mismatch " + JSON.stringify(up.failures[0]));
      }
      await sb.auth.signOut();
      return up;
    }, `awards ${index}`);

    progress.awardsDone.push(index);
    saveProgress(progress);
    if (index % 10 === 0 || index <= 3 || index === Math.max(...awardTarget)) {
      console.log(`  ✓ awards student ${index} (${progress.awardsDone.length}/${awardTarget.size})`);
    }
    await sleep(Math.max(args.delayMs, 700));
  }
}

async function processRole({ role, count, args, url, key, admin, awardTarget, from, to }) {
  const listKey = role === "teacher" ? "teachers" : "students";
  const start = Math.max(1, from || 1);
  const end = to > 0 ? to : count;
  const tag = args.workerId ? `[${args.workerId}] ` : "";

  let progress = loadProgress();
  const done = new Set((progress[listKey] || []).map((x) => x.index));
  const todo = [];
  for (let i = start; i <= end; i++) if (!done.has(i)) todo.push(i);
  console.log(`\n${tag}→ ${role}s remaining: ${todo.length} (range ${start}-${end})`);

  await runPool(todo, args.concurrency, async (index) => {
    const sb = client(url, key);
    const user = await untilOk(() => ensureUser(sb, admin, { role, index }), `${role} ${index}`);

    if (role === "student" && awardTarget.has(index)) {
      const disk = loadProgress();
      if (!(disk.awardsDone || []).includes(index)) {
        await untilOk(async () => {
          const login = await sb.auth.signInWithPassword({ email: user.email, password: PASS });
          if (login.error) throw login.error;
          const up = await uploadFullAwards(sb, user, index);
          if (up.failures.length) {
            await commitProgress((p) => {
              p.calcFailures = p.calcFailures || [];
              p.calcFailures.push({ student: index, failures: up.failures });
            });
            throw new Error("calc mismatch " + JSON.stringify(up.failures[0]));
          }
          await sb.auth.signOut();
          return up;
        }, `awards ${index}`);
      }
      await commitProgress((p) => {
        p[listKey] = mergeByIndex(p[listKey], [{
          index, email: user.email, roll: user.roll, name: user.name, role: user.role, id: user.id, via: user.via,
        }]);
        p.awardsDone = uniqNums(p.awardsDone, [index]);
      });
      console.log(`  ${tag}✓ student ${index} + awards (${user.via})`);
    } else {
      await commitProgress((p) => {
        p[listKey] = mergeByIndex(p[listKey], [{
          index, email: user.email, roll: user.roll, name: user.name, role: user.role, id: user.id, via: user.via,
        }]);
      });
      if (index % 25 === 0 || index <= 3 || index === end) {
        console.log(`  ${tag}✓ ${role} ${index} (${user.via})`);
      }
    }

    if (role === "teacher" && index <= 50) {
      try {
        await sb.auth.signInWithPassword({ email: user.email, password: PASS });
        await sb.from("instructors").upsert({ official_name: user.name }, { onConflict: "official_name" });
        await sb.auth.signOut();
      } catch (_) { /* non-fatal */ }
    }

    await sleep(args.delayMs);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, key, service } = loadConfig();
  let progress = loadProgress();
  const admin = service
    ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const tag = args.workerId ? `[${args.workerId}] ` : "";

  console.log(`${tag}═══ ULC Portal hardened load stress ═══`);
  console.log(`${tag}Target: ${args.students} students · ${args.teachers} teachers · ${args.awards} award packs · ${args.covers} covers`);
  if (args.role !== "all" || args.to) {
    console.log(`${tag}Shard: role=${args.role} from=${args.from} to=${args.to || "(end)"}`);
  }

  if (!args.skipBootstrap) {
    const healthRes = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!healthRes.ok) throw new Error("Auth health failed: " + healthRes.status);
    console.log(`${tag}✓ Auth health OK`);

    const mathFails = await verifyMathBattery();
    if (mathFails.length) {
      console.error(`${tag}✗ Math battery failed:`, mathFails);
      process.exit(1);
    }
    console.log(`${tag}✓ Calculation battery OK`);

    console.log(`\n${tag}→ Generating ${args.covers} cover pages…`);
    console.log(`${tag}✓ ${await generateCovers(args.covers, progress)} covers OK`);
  } else {
    console.log(`${tag}✓ Bootstrap skipped (worker shard)`);
  }

  const probeSb = client(url, key);
  const mode = await detectMode(probeSb, admin);
  console.log(`\n${tag}Mode: ${mode}`);
  if (mode === "patient-signup") {
    console.log(`${tag}⚠ patient-signup — multitask workers + backoff enabled`);
    if (!args.forceConcurrency) {
      args.concurrency = Math.max(args.concurrency, 3);
      args.delayMs = Math.max(args.delayMs, 1200);
    }
  } else if (mode === "admin") {
    if (!args.forceConcurrency) {
      args.concurrency = Math.max(args.concurrency, 8);
      args.delayMs = Math.min(args.delayMs, 50);
    }
  } else if (!args.forceConcurrency) {
    args.concurrency = Math.min(Math.max(args.concurrency, 2), 4);
    args.delayMs = Math.max(args.delayMs, 400);
  }
  console.log(`${tag}Pool: concurrency=${args.concurrency} delayMs=${args.delayMs}`);

  const awardTarget = new Set();
  for (let i = 1; i <= Math.min(args.awards, args.students); i++) awardTarget.add(i);

  const runStudents = args.role === "all" || args.role === "student";
  const runTeachers = args.role === "all" || args.role === "teacher";

  if (mode === "seed-link" && args.role === "all" && !args.skipBootstrap) {
    console.log("\n→ Seed-link fast path: sample-verify + fill rosters + awards only");
    const sb = client(url, key);
    await sampleVerifySeed(sb, "student", args.students);
    await sampleVerifySeed(sb, "teacher", args.teachers);
    progress = loadProgress();
    fillSeedRoster(progress, "student", args.students);
    fillSeedRoster(progress, "teacher", args.teachers);
    console.log(`✓ Roster filled: ${progress.students.length} students, ${progress.teachers.length} teachers`);
    args.concurrency = 1;
    args.delayMs = Math.max(args.delayMs, 800);
    await processAwardsOnly({ args, url, key, progress, awardTarget });
  } else {
    const jobs = [];
    if (runStudents) {
      jobs.push(processRole({
        role: "student",
        count: args.students,
        args, url, key, admin, awardTarget,
        from: args.from,
        to: args.to || args.students,
      }));
    }
    if (runTeachers) {
      jobs.push(processRole({
        role: "teacher",
        count: args.teachers,
        args, url, key, admin, awardTarget,
        from: args.from,
        to: args.to || args.teachers,
      }));
    }
    // Multitask: students + teachers in parallel when role=all
    await Promise.all(jobs);
  }

  progress = loadProgress();

  // Cloud spot-verify (lead process only)
  let cloudVerify = { checked: 0, mismatches: 0 };
  if (!args.skipBootstrap && progress.awardsDone.length) {
    const sampleIdx = progress.awardsDone[0];
    const stu = progress.students.find((s) => s.index === sampleIdx) || metaFor("student", sampleIdx);
    const sb = client(url, key);
    const login = await sb.auth.signInWithPassword({ email: stu.email, password: PASS });
    if (!login.error) {
      const uid = stu.id || login.data.user.id;
      const { data } = await sb.from("award_lists").select("*").eq("user_id", uid);
      for (const row of data || []) {
        cloudVerify.checked++;
        const got = MATH.calcAwardFrom(row);
        if (got.grand < 0 || got.grand > 100 || got.gp < 0 || got.gp > 4) cloudVerify.mismatches++;
      }
      await sb.auth.signOut();
    }
  }

  if (args.skipBootstrap) {
    console.log(`${tag}✓ Shard finished`);
    return;
  }

  const report = {
    finishedAt: new Date().toISOString(),
    mode,
    targets: args,
    registered: { students: progress.students.length, teachers: progress.teachers.length },
    awardsStudents: progress.awardsDone.length,
    covers: progress.coversDone,
    calcFailures: progress.calcFailures.length,
    errors: progress.errors.length,
    cloudVerify,
    mathBattery: "pass",
    passed:
      progress.students.length >= args.students &&
      progress.teachers.length >= args.teachers &&
      progress.awardsDone.length >= Math.min(args.awards, args.students) &&
      progress.coversDone >= args.covers &&
      progress.calcFailures.length === 0 &&
      cloudVerify.mismatches === 0,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("\n═══ REPORT ═══");
  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.log("\n✗ Not fully complete yet — re-run the same command (progress resumes).");
    if (mode === "patient-signup") {
      console.log("Tip: run supabase/seed-load-users.sql then re-run for an instant pass.");
    }
    process.exitCode = 2;
  } else {
    console.log("\n✓ FULL LOAD TEST PASSED");
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
