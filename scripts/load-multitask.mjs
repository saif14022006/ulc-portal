#!/usr/bin/env node
/**
 * Multitask full load suite — runs sharded load workers + sync accuracy in parallel.
 *
 * Usage:
 *   node scripts/load-multitask.mjs
 *   npm run load-test:multi
 */
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const progressPath = join(root, "scripts", ".load-progress.json");
const reportPath = join(root, "scripts", ".load-multitask-report.json");

const STUDENTS = 1000;
const TEACHERS = 1000;
const AWARDS = 200;
const COVERS = 100;
const SHARDS = 4; // parallel processes per role
const CONCURRENCY = 2; // pool size inside each shard
const DELAY = 1500;

function status() {
  if (!existsSync(progressPath)) {
    return { students: 0, teachers: 0, awards: 0, covers: 0, calcFail: 0 };
  }
  const j = JSON.parse(readFileSync(progressPath, "utf8"));
  return {
    students: (j.students || []).length,
    teachers: (j.teachers || []).length,
    awards: (j.awardsDone || []).length,
    covers: j.coversDone || 0,
    calcFail: (j.calcFailures || []).length,
  };
}

function run(cmd, args, label) {
  return new Promise((resolve) => {
    console.log(`▶ spawn ${label}: ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true, // Windows: resolve npm.cmd / node PATH
      env: process.env,
    });
    const prefix = `[${label}] `;
    const onData = (buf, isErr) => {
      String(buf)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          const out = prefix + line;
          if (isErr) console.error(out);
          else console.log(out);
        });
    };
    child.on("error", (err) => {
      console.error(prefix + "spawn error:", err.message || err);
      resolve({ label, code: 1 });
    });
    child.stdout.on("data", (d) => onData(d, false));
    child.stderr.on("data", (d) => onData(d, true));
    child.on("close", (code) => resolve({ label, code: code ?? 1 }));
  });
}

function shardRanges(total, shards) {
  const size = Math.ceil(total / shards);
  const ranges = [];
  for (let i = 0; i < shards; i++) {
    const from = i * size + 1;
    const to = Math.min(total, (i + 1) * size);
    if (from <= to) ranges.push({ from, to, id: i + 1 });
  }
  return ranges;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log("═══ ULC multitask load suite ═══");
  console.log("Before:", status());

  // Bootstrap once: health + math + covers (+ tiny student 1 if needed)
  await run("node", [
    "scripts/load-stress.mjs",
    "--students", String(STUDENTS),
    "--teachers", String(TEACHERS),
    "--awards", String(AWARDS),
    "--covers", String(COVERS),
    "--role", "student",
    "--from", "1",
    "--to", "1",
    "--concurrency", "1",
    "--delay", "1000",
    "--force-concurrency",
    "--worker-id", "bootstrap",
  ], "bootstrap");

  const stuShards = shardRanges(STUDENTS, SHARDS);
  const tchShards = shardRanges(TEACHERS, SHARDS);

  const workers = [];

  // Sync accuracy in parallel with load shards
  workers.push(run("node", ["scripts/sync-accuracy.mjs"], "sync"));

  for (const s of stuShards) {
    workers.push(run("node", [
      "scripts/load-stress.mjs",
      "--students", String(STUDENTS),
      "--teachers", String(TEACHERS),
      "--awards", String(AWARDS),
      "--covers", String(COVERS),
      "--role", "student",
      "--from", String(s.from),
      "--to", String(s.to),
      "--concurrency", String(CONCURRENCY),
      "--delay", String(DELAY),
      "--force-concurrency",
      "--skip-bootstrap",
      "--worker-id", `stu-${s.id}`,
    ], `stu-${s.id}`));
  }

  for (const s of tchShards) {
    workers.push(run("node", [
      "scripts/load-stress.mjs",
      "--students", String(STUDENTS),
      "--teachers", String(TEACHERS),
      "--awards", String(AWARDS),
      "--covers", String(COVERS),
      "--role", "teacher",
      "--from", String(s.from),
      "--to", String(s.to),
      "--concurrency", String(CONCURRENCY),
      "--delay", String(DELAY),
      "--force-concurrency",
      "--skip-bootstrap",
      "--worker-id", `tch-${s.id}`,
    ], `tch-${s.id}`));
  }

  console.log(`\n▶ Multitask: ${workers.length} parallel jobs (${SHARDS}×students + ${SHARDS}×teachers + sync)\n`);
  const results = await Promise.all(workers);

  const final = status();
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    jobs: results,
    progress: final,
    targets: { students: STUDENTS, teachers: TEACHERS, awards: AWARDS, covers: COVERS },
    passed:
      final.students >= STUDENTS &&
      final.teachers >= TEACHERS &&
      final.awards >= Math.min(AWARDS, STUDENTS) &&
      final.covers >= COVERS &&
      final.calcFail === 0,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("\n═══ MULTITASK REPORT ═══");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    console.log("\n✗ Incomplete — re-run npm run load-test:multi (resumes).");
    process.exitCode = 2;
  } else {
    console.log("\n✓ MULTITASK FULL LOAD PASSED");
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
