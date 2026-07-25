#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "js", "config.js"), "utf8");
const url = raw.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const key = raw.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1];
if (!url || !key) throw new Error("missing config");

const sb = createClient(url, key, { auth: { persistSession: false } });

const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log("auth health", health.status, await health.text());

for (const t of ["profiles", "award_lists", "teacher_workspaces", "instructors", "student_workspaces"]) {
  const r = await sb.from(t).select("*").limit(1);
  if (r.error) console.log(t, "ERR", r.error.code, r.error.message);
  else console.log(t, "OK", "sampleKeys=", Object.keys(r.data?.[0] || {}));
}

/* Try signup+roundtrip for a probe account */
const email = `ulc.probe.${Date.now()}@example.com`;
const pass = "ProbeTest123!";
const signup = await sb.auth.signUp({
  email,
  password: pass,
  options: { data: { roll_no: "P9999", full_name: "Probe User", role: "student" } },
});
if (signup.error) {
  console.log("signup", signup.error.message);
} else {
  const uid = signup.data.user?.id;
  console.log("signup ok", uid);
  if (uid) {
    const up = await sb.from("profiles").upsert({
      id: uid,
      roll_no: "P" + String(Date.now()).slice(-6),
      full_name: "Probe User",
      contact: email,
      role: "student",
      current_semester: 3,
      session: "2025-2029",
      profile_complete: true,
    }).select("*").single();
    console.log("profile upsert", up.error?.message || "OK", up.data && {
      roll: up.data.roll_no, name: up.data.full_name, role: up.data.role, sem: up.data.current_semester
    });

    const tw = await sb.from("teacher_workspaces").upsert({
      user_id: uid,
      official_name: "Probe Teacher Name",
      data: { classes: [{ id: "c1", students: [{ roll: "1001", name: "TEST" }] }] },
      updated_at: new Date().toISOString(),
    }).select("user_id,official_name,data").single();
    console.log("teacher_workspaces", tw.error?.message || "OK", tw.data?.official_name, "students=", tw.data?.data?.classes?.[0]?.students?.length);

    const fetchTw = await sb.from("teacher_workspaces").select("*").eq("user_id", uid).maybeSingle();
    console.log("teacher_workspaces fetch", fetchTw.error?.message || "OK match=",
      JSON.stringify(fetchTw.data?.data?.classes?.[0]?.students?.[0]));

    const aw = await sb.from("award_lists").insert({
      user_id: uid, semester: 3, subject_code: "LLB 215", subject_name: "Law of Contract – I",
      teacher: "Probe", q1: 12, q2: 14, q3: 10, a1: 12, a2: 14, mid: 70, final: 80,
    }).select("id,subject_name").single();
    console.log("award insert", aw.error?.message || "OK", aw.data?.subject_name);

    const list = await sb.from("award_lists").select("id,subject_name,q1,mid,final").eq("user_id", uid);
    console.log("award fetch", list.error?.message || "OK count=", list.data?.length);

    /* cleanup best-effort */
    await sb.from("award_lists").delete().eq("user_id", uid);
    await sb.from("teacher_workspaces").delete().eq("user_id", uid);
  }
  await sb.auth.signOut();
}
