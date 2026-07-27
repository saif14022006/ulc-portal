/**
 * Stress-test the Android PDF save path 100× (mock UlcPdfSaver → real files).
 * Mirrors js/native-save.js: blob → base64 → Downloads/ULC Toolkit write.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "scripts", ".pdf-stress-out", "Downloads", "ULC Toolkit");
const RUNS = Number(process.argv[2] || 100);

function minimalPdf(label) {
  const body = `%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%% ULC stress ${label}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

async function main() {
  await fs.rm(path.join(root, "scripts", ".pdf-stress-out"), { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const nativeSrc = await fs.readFile(path.join(root, "js", "native-save.js"), "utf8");
  const saves = [];

  const mockSaver = {
    async saveToDownloads({ filename, data }) {
      if (!data) throw new Error("Missing PDF data");
      let b64 = String(data);
      const comma = b64.indexOf(",");
      if (b64.startsWith("data:") && comma >= 0) b64 = b64.slice(comma + 1);
      const bytes = Buffer.from(b64, "base64");
      if (!bytes.length) throw new Error("Empty PDF data");
      const safe = String(filename || "ULC.pdf").replace(/[\\/:*?"<>|]+/g, "_");
      const name = /\.pdf$/i.test(safe) ? safe : safe + ".pdf";
      const dest = path.join(outDir, name);
      await fs.writeFile(dest, bytes);
      saves.push(dest);
      return {
        uri: "content://downloads/ulc/" + name,
        path: "Downloads/ULC Toolkit/" + name,
        filename: name,
      };
    },
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Blob: globalThis.Blob,
    FileReader: class FileReader {
      constructor() {
        this.result = null;
        this.error = null;
        this.onload = null;
        this.onerror = null;
      }
      readAsDataURL(blob) {
        Promise.resolve()
          .then(async () => {
            const ab = await blob.arrayBuffer();
            const b64 = Buffer.from(ab).toString("base64");
            this.result = "data:application/pdf;base64," + b64;
            if (this.onload) this.onload();
          })
          .catch((err) => {
            this.error = err;
            if (this.onerror) this.onerror();
          });
      }
    },
    URL: {
      createObjectURL() {
        return "blob:mock";
      },
      revokeObjectURL() {},
    },
    document: {
      createElement() {
        return { style: {}, click() {}, remove() {} };
      },
      body: { appendChild() {} },
    },
    navigator: { userAgent: "Android" },
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: { UlcPdfSaver: mockSaver },
      registerPlugin(name) {
        if (name === "UlcPdfSaver") return mockSaver;
        return null;
      },
    },
    alert() {},
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    Uint8Array,
    Promise,
  };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.ULC_IS_NATIVE = true;

  vm.runInNewContext(nativeSrc, sandbox, { filename: "native-save.js" });
  const ULC_SAVE = sandbox.ULC_SAVE;
  if (!ULC_SAVE || typeof ULC_SAVE.saveBlob !== "function") {
    throw new Error("ULC_SAVE.saveBlob not exported");
  }

  let pass = 0;
  let fail = 0;
  const errors = [];

  for (let i = 1; i <= RUNS; i++) {
    const name = `ULC_Stress_${String(i).padStart(3, "0")}.pdf`;
    try {
      const buf = minimalPdf(String(i));
      const blob = new Blob([buf], { type: "application/pdf" });
      const result = await ULC_SAVE.saveBlob(blob, name);
      if (!result || !result.downloaded) throw new Error("not marked downloaded: " + JSON.stringify(result));
      const filePath = path.join(outDir, result.filename || name);
      const st = await fs.stat(filePath);
      if (st.size < 20) throw new Error("file too small: " + st.size);
      const head = Buffer.alloc(5);
      const fh = await fs.open(filePath, "r");
      await fh.read(head, 0, 5, 0);
      await fh.close();
      if (head.toString("utf8") !== "%PDF-") throw new Error("bad PDF header");
      pass++;
    } catch (err) {
      fail++;
      errors.push({ i, message: err.message || String(err) });
    }
  }

  // Also confirm APK-packaged native-save still has Downloads path
  const apkNative = await fs.readFile(
    path.join(root, "android", "app", "src", "main", "assets", "public", "js", "native-save.js"),
    "utf8"
  );
  const apkOk =
    apkNative.includes("UlcPdfSaver") && apkNative.includes("saveToDownloads") && apkNative.includes("downloaded");

  console.log(
    JSON.stringify(
      {
        runs: RUNS,
        pass,
        fail,
        apkNativeSaveOk: apkOk,
        outDir,
        sampleErrors: errors.slice(0, 5),
        verdict: fail === 0 && apkOk ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  process.exit(fail === 0 && apkOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
