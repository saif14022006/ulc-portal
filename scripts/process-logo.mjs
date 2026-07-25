import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "icons", "ulc-logo-raw.png");

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const out = Buffer.from(data);

// Sample corner pixels to get background color
const corners = [
  0,
  (width - 1) * channels,
  (height - 1) * width * channels,
  ((height - 1) * width + (width - 1)) * channels,
];
let br = 0, bg = 0, bb = 0;
for (const i of corners) {
  br += out[i]; bg += out[i + 1]; bb += out[i + 2];
}
br = Math.round(br / 4); bg = Math.round(bg / 4); bb = Math.round(bb / 4);

const thresh = 55; // distance from bg → transparent
for (let i = 0; i < out.length; i += channels) {
  const r = out[i], g = out[i + 1], b = out[i + 2];
  const dist = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
  if (dist < thresh) {
    // Soft edge
    const a = dist < thresh * 0.55 ? 0 : Math.round(255 * ((dist - thresh * 0.55) / (thresh * 0.45)));
    out[i + 3] = Math.min(out[i + 3], a);
  }
}

// Crop to opaque content with small padding
let minX = width, minY = height, maxX = 0, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const a = out[(y * width + x) * channels + 3];
    if (a > 20) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}
const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const side = Math.max(cw, ch);
const cropped = Buffer.alloc(side * side * 4, 0);
const ox = Math.floor((side - cw) / 2);
const oy = Math.floor((side - ch) / 2);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const si = ((minY + y) * width + (minX + x)) * channels;
    const di = ((oy + y) * side + (ox + x)) * 4;
    cropped[di] = out[si];
    cropped[di + 1] = out[si + 1];
    cropped[di + 2] = out[si + 2];
    cropped[di + 3] = out[si + 3];
  }
}

const logoPath = join(root, "icons", "ulc-logo.png");
await sharp(cropped, { raw: { width: side, height: side, channels: 4 } })
  .png()
  .toFile(logoPath);

async function makeIcon(size, file, { maskable = false } = {}) {
  const pad = maskable ? Math.round(size * 0.18) : Math.round(size * 0.08);
  const logoSize = size - pad * 2;
  const bg = { r: 11, g: 58, b: 107, alpha: 1 }; // navy
  const logo = await sharp(logoPath).resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toFile(join(root, "icons", file));
}

await makeIcon(192, "icon-192.png");
await makeIcon(512, "icon-512.png");
await makeIcon(512, "icon-maskable-512.png", { maskable: true });
await makeIcon(180, "apple-touch-icon.png");

// favicon
await sharp(logoPath).resize(64, 64).png().toFile(join(root, "favicon.png"));

// base64 for logo.js (PDF export)
const b64 = readFileSync(logoPath).toString("base64");
writeFileSync(
  join(root, "logo.js"),
  `window.LOGO="data:image/png;base64,${b64}";\n`
);

console.log(`Done. bg≈(${br},${bg},${bb}) size=${side}px`);
