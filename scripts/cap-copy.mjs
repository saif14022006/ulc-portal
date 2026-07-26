/**
 * Copy the static PWA shell into www/ for Capacitor (webDir).
 * Usage: npm run cap:copy
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "www");

const files = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "logo.js",
  "favicon.png"
];

const dirs = ["js", "icons", "assets"];

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyFile(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function copyDir(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  await fs.cp(from, to, { recursive: true });
}

await rmrf(dest);
await fs.mkdir(dest, { recursive: true });

for (const f of files) {
  await copyFile(f);
}
for (const d of dirs) {
  await copyDir(d);
}

console.log(`Copied app shell → ${path.relative(root, dest)}/`);
