/**
 * Generate Android launcher icons + splash PNGs from icons/.
 * Launcher icons: logo only (no navy plate). Splash still uses ULC navy.
 * Usage: node scripts/cap-android-assets.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android", "app", "src", "main", "res");
const logoSrc = path.join(root, "icons", "ulc-logo.png");
const NAVY = { r: 11, g: 58, b: 107, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
/** Adaptive icon plate — white (Android requires a solid background; not navy). */
const ICON_BG = "#FFFFFF";

const densities = [
  { name: "mdpi", icon: 48, fg: 108, splash: 320 },
  { name: "hdpi", icon: 72, fg: 162, splash: 480 },
  { name: "xhdpi", icon: 96, fg: 216, splash: 720 },
  { name: "xxhdpi", icon: 144, fg: 324, splash: 1080 },
  { name: "xxxhdpi", icon: 192, fg: 432, splash: 1440 }
];

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

/** Logo centered on transparent canvas (legacy mipmap PNGs). */
async function makeLauncher(size, outPath) {
  const pad = Math.round(size * 0.08);
  const logoSize = size - pad * 2;
  const logo = await sharp(logoSrc)
    .resize(logoSize, logoSize, { fit: "contain", background: CLEAR })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: CLEAR }
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(outPath);
}

async function makeForeground(size, outPath) {
  // Adaptive icon foreground: logo centered with padding on transparent canvas
  const pad = Math.round(size * 0.18);
  const logoSize = size - pad * 2;
  const logo = await sharp(logoSrc)
    .resize(logoSize, logoSize, { fit: "contain", background: CLEAR })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: CLEAR }
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(outPath);
}

async function makeSplash(w, h, outPath) {
  const logoMax = Math.round(Math.min(w, h) * 0.42);
  const logo = await sharp(logoSrc)
    .resize(logoMax, logoMax, { fit: "contain", background: CLEAR })
    .png()
    .toBuffer();
  await sharp({
    create: { width: w, height: h, channels: 4, background: NAVY }
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(outPath);
}

// Adaptive icon background: white (no navy / teal plate behind the logo)
await fs.writeFile(
  path.join(res, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${ICON_BG}</color>
</resources>
`
);

await fs.writeFile(
  path.join(res, "drawable", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${ICON_BG}"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`
);

// Flat drawable splash (used by AppTheme.NoActionBarLaunch)
await ensureDir(path.join(res, "drawable"));
await makeSplash(480, 800, path.join(res, "drawable", "splash.png"));

for (const d of densities) {
  const mip = path.join(res, `mipmap-${d.name}`);
  await ensureDir(mip);
  await makeLauncher(d.icon, path.join(mip, "ic_launcher.png"));
  await makeLauncher(d.icon, path.join(mip, "ic_launcher_round.png"));
  await makeForeground(d.fg, path.join(mip, "ic_launcher_foreground.png"));

  const port = path.join(res, `drawable-port-${d.name}`);
  const land = path.join(res, `drawable-land-${d.name}`);
  await ensureDir(port);
  await ensureDir(land);
  await makeSplash(d.splash, Math.round(d.splash * 1.78), path.join(port, "splash.png"));
  await makeSplash(Math.round(d.splash * 1.78), d.splash, path.join(land, "splash.png"));
}

console.log("Android icons + splash generated (launcher: logo on white/transparent, no navy plate)");
