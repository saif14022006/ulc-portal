#!/usr/bin/env node
/**
 * Heavy accuracy test — profiles, awards, teacher roster/marks workspace,
 * student profile+photo workspace round-trips.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = join(dirname(fileURLToPath(import.meta.url)), ".sync-report.json");
const PASS = "LoadTest123!";

const mathCode = readFileSync(join(root, "js", "award-math.js"), "utf8");
const mathSandbox = { module: { exports: {} }, exports: {}, globalThis: {} };
Function("module", "exports", "globalThis", mathCode + "\n;module.exports = globalThis.ULC_MATH || module.exports;")(
  mathSandbox.module, mathSandbox.exports, mathSandbox.globalThis
);
const MATH = mathSandbox.module.exports.calcAwardFrom
  ? mathSandbox.module.exports
  : mathSandbox.globalThis.ULC_MATH;

function loadConfig() {
  const raw = readFileSync(join(root, "js", "config.js"), "utf8");
  const url = raw.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
  const key = raw.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error("missing config");
  return { url, key };
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function tinyJpegDataUrl() {
  // 1x1 JPEG
  const b64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQDxAVFRUVFRUVFRUVFRUVFRUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAMAAAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEADMRAD/2Q==";
  return "data:image/jpeg;base64," + b64;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function untilOk(fn, label) {
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const m = String(err?.message || err || "").toLowerCase();
      const rate = err?.status === 429 || m.includes("rate limit") || m.includes("over_email");
      const net = /fetch|network|timeout|503|502|5\d\d/i.test(m);
      if (!rate && !net) throw err;
      const pause = rate ? Math.min(Math.max(wait, 60000), 120000) : Math.min(wait, 20000);
      console.warn(`  ⏳ ${label} #${attempt}: wait ${Math.round(pause / 1000)}s — ${err.message || err}`);
      await sleep(pause);
      wait = Math.min(Math.floor(wait * 1.4), 120000);
    }
  }
}

async function ensureAccount(sb, { email, roll, name, role }) {
  return untilOk(async () => {
    let login = await sb.auth.signInWithPassword({ email, password: PASS });
    if (login.error) {
      const signup = await sb.auth.signUp({
        email,
        password: PASS,
        options: { data: { roll_no: roll, full_name: name, role } },
      });
      if (signup.error) {
        if (/already|registered|exists/i.test(signup.error.message)) {
          login = await sb.auth.signInWithPassword({ email, password: PASS });
          if (login.error) throw login.error;
        } else {
          const e = new Error(signup.error.message);
          e.status = signup.error.status;
          throw e;
        }
      } else {
        login = await sb.auth.signInWithPassword({ email, password: PASS });
        if (login.error) {
          // email confirm may block — try using signup session
          if (signup.data?.session?.user?.id) {
            const uid = signup.data.session.user.id;
            const { error } = await sb.from("profiles").upsert({
              id: uid, roll_no: roll, full_name: name, contact: email, role,
              current_semester: role === "student" ? 3 : null,
              session: "2025-2029",
              profile_complete: true,
            });
            if (error) throw error;
            return { id: uid, email, roll, name, role };
          }
          const e = new Error(login.error.message);
          e.status = login.error.status;
          throw e;
        }
      }
    }
    const uid = login.data.user.id;
    const { error } = await sb.from("profiles").upsert({
      id: uid,
      roll_no: roll,
      full_name: name,
      contact: email,
      role,
      current_semester: role === "student" ? 3 : null,
      session: "2025-2029",
      profile_complete: true,
    });
    if (error) throw error;
    return { id: uid, email, roll, name, role };
  }, `account ${email}`);
}

async function testTeacherWorkspace(sb, n) {
  const results = [];
  for (let i = 1; i <= n; i++) {
    const meta = {
      email: `ulc.sync.tch.${String(i).padStart(3, "0")}@example.com`,
      roll: `TS${String(i).padStart(3, "0")}`,
      name: `Sync Teacher ${i}`,
      role: "teacher",
    };
    const seed = {
      email: `ulc.load.tch.${String(i).padStart(4, "0")}@example.com`,
      roll: `T${String(i).padStart(4, "0")}`,
      name: `Load Teacher ${i}`,
      role: "teacher",
    };
    console.log(`  teacher ${i}/${n}…`);
    let u;
    try {
      const trySeed = await sb.auth.signInWithPassword({ email: seed.email, password: PASS });
      if (!trySeed.error && trySeed.data?.user?.id) {
        await sb.auth.signOut();
        u = await ensureAccount(sb, seed);
        Object.assign(meta, seed);
      } else {
        u = await ensureAccount(sb, meta);
      }
    } catch {
      u = await ensureAccount(sb, meta);
    }
    const roster = Array.from({ length: 25 }, (_, k) => ({
      roll: String(1000 + k + i),
      name: `STUDENT ${i}-${k + 1}`,
    }));
    const marks = {};
    roster.forEach((s, k) => {
      const sample = MATH.sampleFullAward(i * 100 + k);
      marks[s.roll] = sample;
    });
    const payload = {
      kind: "teacher",
      version: 1,
      officialName: meta.name,
      classes: [
        {
          id: "cls-" + i,
          semester: 3,
          subject: "Law of Contract – I",
          subjectCode: "LLB 215",
          session: "2025-2029",
          creditHours: 3,
          students: roster,
          marks,
          attendance: {},
        },
      ],
      activeClassId: "cls-" + i,
      profileComplete: true,
      syncedAt: Date.now(),
    };
    const up = await sb.from("teacher_workspaces").upsert({
      user_id: u.id,
      official_name: meta.name,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (up.error) throw up.error;

    await sb.auth.signOut();
    await ensureAccount(sb, meta);
    const { data, error } = await sb
      .from("teacher_workspaces")
      .select("official_name,data")
      .eq("user_id", u.id)
      .single();
    if (error) throw error;
    assert(data.official_name === meta.name, "teacher name mismatch");
    assert(data.data.classes[0].students.length === 25, "roster count");
    assert(data.data.classes[0].students[0].name === roster[0].name, "student name");
    assert(data.data.classes[0].marks[roster[0].roll].q1 === marks[roster[0].roll].q1, "marks q1");
    const calc = MATH.calcAwardFrom(data.data.classes[0].marks[roster[5].roll]);
    assert(calc.grand >= 0 && calc.grand <= 100, "calc range");
    results.push({ teacher: meta.roll, students: 25, ok: true, sampleGrade: calc.grade });
    await sb.auth.signOut();
    await sleep(400);
  }
  return results;
}

async function testStudentWorkspace(sb, n) {
  const results = [];
  const photo = tinyJpegDataUrl();
  for (let i = 1; i <= n; i++) {
    const meta = {
      email: `ulc.sync.stu.${String(i).padStart(3, "0")}@example.com`,
      roll: `SS${String(i).padStart(3, "0")}`,
      name: `Sync Student ${i}`,
      role: "student",
    };
    /* Prefer load-test seed accounts when present (no signup) */
    const seed = {
      email: `ulc.load.stu.${String(i).padStart(4, "0")}@example.com`,
      roll: `S${String(i).padStart(4, "0")}`,
      name: `Load Student ${i}`,
      role: "student",
    };
    console.log(`  student ${i}/${n}…`);
    let u;
    try {
      const trySeed = await sb.auth.signInWithPassword({ email: seed.email, password: PASS });
      if (!trySeed.error && trySeed.data?.user?.id) {
        await sb.auth.signOut();
        u = await ensureAccount(sb, seed);
        Object.assign(meta, seed);
      } else {
        u = await ensureAccount(sb, meta);
      }
    } catch {
      u = await ensureAccount(sb, meta);
    }
    const profile = {
      fatherName: `Father ${i}`,
      cnic: `54400-${String(1000000 + i).slice(0, 7)}-${i % 9}`,
      dob: "2005-01-15",
      registrationNo: `REG-${i}`,
      session: "2025-2029",
      program: "LL.B Five Year",
      currentSemester: 3,
      preparedByName: "Prepared By",
      coordinatorName: "Coordinator",
      principalName: "Principal",
      photo,
      updatedAt: Date.now(),
    };
    const semesterRecords = {
      "3": {
        courses: [{ code: "LLB 215", title: "Law of Contract – I", ch: 3, marks: 78, gp: 3.8, grade: "A-" }],
        gpa: 3.8,
        pct: 78,
      },
    };
    const up = await sb.from("teacher_workspaces").upsert({
      user_id: u.id,
      official_name: meta.name,
      data: {
        kind: "student",
        version: 1,
        profile,
        semesterRecords,
        subjectMarks: {},
        syncedAt: Date.now(),
      },
      updated_at: new Date().toISOString(),
    });
    if (up.error) throw up.error;

    await sb.auth.signOut();
    await ensureAccount(sb, meta);
    const { data: prof } = await sb.from("profiles").select("*").eq("id", u.id).single();
    assert(prof.full_name === meta.name, "profile name");
    assert(prof.roll_no === meta.roll, "profile roll");
    assert(prof.role === "student", "profile role");
    assert(+prof.current_semester === 3, "profile semester");

    const { data: ws, error } = await sb
      .from("teacher_workspaces")
      .select("data")
      .eq("user_id", u.id)
      .single();
    if (error) throw error;
    assert(ws.data.kind === "student", "kind");
    assert(ws.data.profile.fatherName === profile.fatherName, "father");
    assert(ws.data.profile.cnic === profile.cnic, "cnic");
    assert(ws.data.profile.photo === photo, "photo exact match");
    assert(ws.data.profile.photo.startsWith("data:image/jpeg"), "photo mime");
    assert(ws.data.semesterRecords["3"].gpa === 3.8, "semester gpa");
    const photoHash = createHash("sha256").update(ws.data.profile.photo).digest("hex");
    results.push({ student: meta.roll, photoHash: photoHash.slice(0, 12), ok: true });
    await sb.auth.signOut();
    await sleep(350);
  }
  return results;
}

async function testAwardAccuracy(sb, n) {
  const results = [];
  for (let i = 1; i <= n; i++) {
    const meta = {
      email: `ulc.sync.award.${String(i).padStart(3, "0")}@example.com`,
      roll: `SA${String(i).padStart(3, "0")}`,
      name: `Award Student ${i}`,
      role: "student",
    };
    const u = await ensureAccount(sb, meta);
    await sb.from("award_lists").delete().eq("user_id", u.id);
    const marks = MATH.sampleFullAward(i * 9);
    const expected = MATH.calcAwardFrom(marks);
    const { data, error } = await sb
      .from("award_lists")
      .insert({
        user_id: u.id,
        semester: 3,
        subject_code: "LLB 215",
        subject_name: "Law of Contract – I",
        teacher: "Mr. Test",
        ...marks,
      })
      .select("*")
      .single();
    if (error) throw error;
    const got = MATH.calcAwardFrom(data);
    assert(Math.abs(got.grand - expected.grand) < 0.001, "grand");
    assert(got.rounded === expected.rounded, "rounded");
    assert(got.grade === expected.grade, "grade");
    const { data: fetched } = await sb.from("award_lists").select("*").eq("user_id", u.id);
    assert(fetched.length === 1, "fetch count");
    assert(fetched[0].subject_name === "Law of Contract – I", "subject name");
    results.push({ roll: meta.roll, grade: got.grade, grand: got.grand, ok: true });
    await sb.auth.signOut();
    await sleep(300);
  }
  return results;
}

async function main() {
  const { url, key } = loadConfig();
  const sb = client(url, key);
  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  assert(health.ok, "auth health");

  const report = {
    startedAt: new Date().toISOString(),
    health: await health.json(),
    teachers: [],
    students: [],
    awards: [],
    errors: [],
    ok: false,
  };

  try {
    console.log("▶ Teacher workspace heavy test (8 teachers × 25 students)…");
    report.teachers = await testTeacherWorkspace(sb, 8);
    console.log("  ✓", report.teachers.length, "teachers OK");

    console.log("▶ Student profile + photo workspace (12 students)…");
    report.students = await testStudentWorkspace(sb, 12);
    console.log("  ✓", report.students.length, "students OK");

    console.log("▶ Award list accuracy (15 inserts + verify)…");
    report.awards = await testAwardAccuracy(sb, 15);
    console.log("  ✓", report.awards.length, "awards OK");

    report.ok = true;
    report.finishedAt = new Date().toISOString();
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log("\nPASS — all sync accuracy checks passed.");
    console.log("Report:", reportPath);
  } catch (err) {
    report.ok = false;
    report.errors.push(String(err?.message || err));
    report.finishedAt = new Date().toISOString();
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.error("\nFAIL:", err?.message || err);
    process.exitCode = 1;
  }
}

main();
