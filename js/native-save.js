/* Native PDF save for Capacitor Android (build: ULC-PDF-2.0.2).
 *
 * Rules applied:
 * 1) Always cap:sync before APK rebuild (see npm run android:release)
 * 2) Filesystem.writeFile: NEVER pass encoding — Cap treats bare data as base64
 * 3) Strip data:…;base64, prefix before write
 * 4) UlcPdfSaver must be registered in MainActivity (checked via ping)
 * 5) All saves await + surface errors with alert('PDF failed: …')
 * 6) html2canvas: useCORS true, allowTaint false (avoids blank/tainted canvas)
 * 7) Prefer UlcPdfSaver → ULCNative → Filesystem+Share (never bare <a download> on native)
 */
(function (global) {
  var BUILD_ID = "ULC-PDF-2.0.2";
  var CHUNK_CHARS = 200000;
  var CAPTURE_TIMEOUT_MS = 45000;

  function isNative() {
    try {
      if (global.ULC_IS_NATIVE === true) return true;
      var Cap = global.Capacitor;
      return !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
    } catch (_) {
      return false;
    }
  }

  function getPlugin(name) {
    var Cap = global.Capacitor;
    if (!Cap) return null;
    try {
      if (Cap.Plugins && Cap.Plugins[name]) return Cap.Plugins[name];
    } catch (_) {}
    if (typeof Cap.registerPlugin === "function") {
      try {
        return Cap.registerPlugin(name);
      } catch (_) {}
    }
    return null;
  }

  function safeName(filename, fallback) {
    var n = String(filename || fallback || "ULC_file.pdf")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120);
    if (!/\.pdf$/i.test(n)) n += ".pdf";
    return n;
  }

  function errMsg(err) {
    if (!err) return "unknown error";
    if (typeof err === "string") return err;
    var m = err.message || err.errorMessage || String(err);
    if (/not implemented|plugin.*missing|is not implemented/i.test(m)) {
      return m + " (UlcPdfSaver not registered — rebuild APK with cap:sync)";
    }
    return m;
  }

  function isCancelError(err) {
    return /cancel/i.test(errMsg(err));
  }

  /** Strip data-URI prefix — only bare base64 for Filesystem / native plugins. */
  function stripBase64(data) {
    var s = String(data || "");
    var i = s.indexOf(",");
    if (s.indexOf("data:") === 0 && i >= 0) return s.slice(i + 1);
    return s;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(stripBase64(reader.result));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("FileReader failed"));
      };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, mime) {
    var clean = stripBase64(b64);
    var bin = atob(clean);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || "application/pdf" });
  }

  function triggerBrowserDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "download.bin";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }

  function ensureFileUri(uri) {
    var s = String(uri || "");
    if (s.indexOf("file:") === 0) return s;
    if (s.indexOf("/") === 0) return "file://" + s;
    return "";
  }

  /**
   * Filesystem write for PDF bytes as base64.
   * CRITICAL: do NOT pass `encoding` — Capacitor only treats data as base64 when encoding is omitted.
   */
  async function writePdfBase64Chunks(Filesystem, path, directory, base64) {
    var data = stripBase64(base64);
    if (!data) throw new Error("Empty base64 PDF");

    if (data.length <= CHUNK_CHARS) {
      await Filesystem.writeFile({
        path: path,
        data: data,
        directory: directory,
        recursive: true,
        /* no encoding field — required for binary PDF */
      });
      return;
    }

    var first = true;
    for (var i = 0; i < data.length; i += CHUNK_CHARS) {
      await Filesystem.writeFile({
        path: path,
        data: data.slice(i, i + CHUNK_CHARS),
        directory: directory,
        recursive: first,
        append: !first,
        /* no encoding field */
      });
      first = false;
    }
  }

  async function saveViaUlcPdfSaver(blob, filename) {
    var Saver = getPlugin("UlcPdfSaver");
    if (!Saver || typeof Saver.start !== "function") {
      throw new Error("UlcPdfSaver plugin is not implemented on android");
    }

    var data = await blobToBase64(blob);
    if (!data) throw new Error("Empty PDF");

    if (typeof Saver.ping === "function") {
      try {
        var pong = await Saver.ping();
        if (pong && pong.ok === false) throw new Error("ping rejected");
      } catch (e) {
        throw new Error("UlcPdfSaver ping failed: " + errMsg(e));
      }
    }

    var started = await Saver.start({});
    var id = started && started.id;
    if (!id) throw new Error("UlcPdfSaver.start failed");

    for (var i = 0; i < data.length; i += CHUNK_CHARS) {
      await Saver.writeChunk({ id: id, data: data.slice(i, i + CHUNK_CHARS) });
    }

    var finish =
      typeof Saver.finishAndShare === "function"
        ? Saver.finishAndShare
        : Saver.finishToDownloads;
    if (typeof finish !== "function") {
      throw new Error("UlcPdfSaver.finishAndShare missing — reinstall APK after cap:sync");
    }

    var result = await finish.call(Saver, { id: id, filename: filename });
    return {
      uri: result && result.uri,
      path: result && result.path,
      filename: (result && result.filename) || filename,
      downloaded: !!(result && (result.downloaded || result.shared || result.ok)),
      shared: !!(result && result.shared),
      archivePath: result && result.archivePath,
      archiveDirectory: (result && result.archiveDirectory) || "DATA",
      blob: blob,
      via: "UlcPdfSaver",
      build: BUILD_ID,
    };
  }

  async function shareArchivedPdf(archivePath, filename, directory) {
    var Saver = getPlugin("UlcPdfSaver");
    if (!Saver || typeof Saver.shareAppFile !== "function") {
      throw new Error("shareAppFile missing — uninstall app and install fresh APK after cap:sync");
    }
    var result = await Saver.shareAppFile({
      path: archivePath,
      filename: safeName(filename, "ULC.pdf"),
      directory: directory || "DATA",
    });
    return {
      shared: true,
      downloaded: true,
      filename: (result && result.filename) || filename,
      via: "archive",
      build: BUILD_ID,
    };
  }

  async function saveViaFilesystemShare(blob, filename) {
    var Filesystem = getPlugin("Filesystem");
    var Share = getPlugin("Share");
    if (!Filesystem || typeof Filesystem.writeFile !== "function") {
      throw new Error("Filesystem plugin missing");
    }
    var path = "ulc-exports/" + filename;
    var data = await blobToBase64(blob);
    await writePdfBase64Chunks(Filesystem, path, "CACHE", data);

    var got = await Filesystem.getUri({ path: path, directory: "CACHE" });
    var uri = ensureFileUri(got && got.uri);
    if (!uri) throw new Error("No file URI from Filesystem.getUri");

    if (Share && typeof Share.share === "function") {
      await Share.share({
        title: filename,
        files: [uri],
        dialogTitle: "Save or share PDF",
      });
      return {
        uri: uri,
        shared: true,
        downloaded: true,
        blob: blob,
        archivePath: path,
        archiveDirectory: "CACHE",
        via: "Share",
        build: BUILD_ID,
      };
    }
    return {
      uri: uri,
      savedLocal: true,
      downloaded: true,
      blob: blob,
      archivePath: path,
      archiveDirectory: "CACHE",
      via: "Filesystem",
      build: BUILD_ID,
    };
  }

  async function saveViaULCNative(blob, filename) {
    var Native = global.ULCNative;
    if (!Native || typeof Native.startSave !== "function") {
      throw new Error("ULCNative missing");
    }
    var data = await blobToBase64(blob);
    var id = Native.startSave();
    if (!id || String(id).indexOf("ERR:") === 0) throw new Error(String(id));
    for (var i = 0; i < data.length; i += CHUNK_CHARS) {
      var w = Native.writeChunk(id, data.slice(i, i + CHUNK_CHARS));
      if (w !== "ok") throw new Error(String(w));
    }
    var raw = Native.finishSave(id, filename);
    var finished = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!finished || finished.ok === false) {
      throw new Error((finished && finished.error) || "finishSave failed");
    }
    return {
      filename: finished.filename || filename,
      downloaded: true,
      pending: !!finished.pending,
      blob: blob,
      via: "ULCNative",
      build: BUILD_ID,
    };
  }

  async function saveBlobNative(blob, filename) {
    var safe = safeName(filename, "ULC_file.pdf");
    var errors = [];

    try {
      return await saveViaUlcPdfSaver(blob, safe);
    } catch (err) {
      errors.push("plugin: " + errMsg(err));
      console.warn("[ulc-save]", errors[errors.length - 1]);
    }

    try {
      return await saveViaULCNative(blob, safe);
    } catch (err) {
      errors.push("native: " + errMsg(err));
      console.warn("[ulc-save]", errors[errors.length - 1]);
    }

    try {
      return await saveViaFilesystemShare(blob, safe);
    } catch (err) {
      if (isCancelError(err)) return { canceled: true };
      errors.push("share: " + errMsg(err));
      console.warn("[ulc-save]", errors[errors.length - 1]);
    }

    throw new Error(errors.join(" | "));
  }

  async function saveBlob(blob, filename) {
    if (!blob || !blob.size) throw new Error("Nothing to download");
    var name = safeName(filename, "ULC_file.pdf");

    if (isNative()) {
      var result = await saveBlobNative(blob, name);
      if (result && result.canceled) return result;
      if (result && !result.blob) result.blob = blob;
      return result;
    }

    triggerBrowserDownload(blob, name);
    return { browser: true, blob: blob, filename: name, build: BUILD_ID };
  }

  function pdfToBlob(pdf) {
    if (!pdf || typeof pdf.output !== "function") {
      return Promise.reject(new Error("Invalid jsPDF instance"));
    }
    try {
      var blobOut = pdf.output("blob");
      if (blobOut && typeof Blob !== "undefined" && blobOut instanceof Blob) {
        return Promise.resolve(blobOut);
      }
    } catch (_) {}
    try {
      var ab = pdf.output("arraybuffer");
      if (ab) return Promise.resolve(new Blob([ab], { type: "application/pdf" }));
    } catch (_) {}
    try {
      /* datauristring includes prefix — strip before binary use */
      var dataUri = pdf.output("datauristring");
      return Promise.resolve(base64ToBlob(stripBase64(dataUri), "application/pdf"));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async function saveJsPdf(pdf, filename) {
    var name = safeName(filename, "ULC.pdf");
    patchJsPdf();
    var blob = await pdfToBlob(pdf);
    if (!blob || !blob.size) throw new Error("Generated PDF is empty (blank capture?)");
    /* Web + native: always go through saveBlob so My Files gets a Blob back */
    return saveBlob(blob, name);
  }

  function markAlerted(err) {
    if (err && typeof err === "object") err.__ulcAlerted = true;
    return err;
  }

  function wasAlerted(err) {
    return !!(err && err.__ulcAlerted);
  }

  function alertSaveHelp(detail) {
    alert(
      "PDF failed: " +
        (detail || "unknown") +
        "\n\nFix: uninstall app → install fresh APK after npm run android:release\n" +
        "(cap:sync + assembleRelease)\n\n" +
        "Build: " +
        BUILD_ID
    );
  }

  /** Single place for user-facing PDF errors (avoids silent Generating… hangs). */
  function alertPdfFailed(err, extra) {
    if (wasAlerted(err)) return;
    var detail = errMsg(err) + (extra ? String(extra) : "");
    if (isNative()) alertSaveHelp(detail);
    else alert("PDF failed: " + detail);
    markAlerted(err);
  }

  function withTimeout(promise, ms, message) {
    var msN = ms == null ? CAPTURE_TIMEOUT_MS : ms;
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error(message || "PDF preview timed out on this phone. Try again."));
        }, msN);
      }),
    ]);
  }

  /** html2canvas with native-safe opts + hard timeout so UI never sticks on Generating… */
  function captureElement(el, extraOpts) {
    if (typeof global.html2canvas !== "function") {
      return Promise.reject(new Error("html2canvas missing"));
    }
    var opts = captureOpts(extraOpts || {});
    return withTimeout(global.html2canvas(el, opts), CAPTURE_TIMEOUT_MS);
  }

  function patchJsPdf() {
    var ns = global.jspdf || global.jsPDF;
    var Ctor = ns && ns.jsPDF ? ns.jsPDF : typeof ns === "function" ? ns : null;
    if (!Ctor || !Ctor.prototype) return false;
    if (Ctor.prototype.__ulcSavePatchedV6) return true;

    var orig = Ctor.prototype.save;
    Ctor.prototype.__ulcOrigSave = orig;
    Ctor.prototype.save = function ulcSave(filename) {
      var self = this;
      return saveJsPdf(self, filename).catch(function (err) {
        if (isCancelError(err)) return { canceled: true };
        console.error("[ulc-save] PDF failed", err);
        alertPdfFailed(err);
        throw err;
      });
    };
    Ctor.prototype.__ulcSavePatched = true;
    Ctor.prototype.__ulcSavePatchedV4 = true;
    Ctor.prototype.__ulcSavePatchedV5 = true;
    Ctor.prototype.__ulcSavePatchedV6 = true;
    console.info("[ulc-save] patched", BUILD_ID);
    return true;
  }

  function prepareCaptureHost(widthPx) {
    var holder = document.createElement("div");
    holder.setAttribute("data-ulc-capture", "1");
    holder.style.cssText =
      "position:fixed;left:0;top:0;width:" +
      (widthPx || 794) +
      "px;opacity:0.01;pointer-events:none;z-index:-1;background:#fff;overflow:visible;";
    return holder;
  }

  function captureScale(fallback) {
    if (isNative()) return Math.max(2, fallback == null ? 2 : Math.min(fallback, 2.5));
    return fallback == null ? 2 : fallback;
  }

  /** Safe html2canvas defaults — useCORS, no taint (blank PDF trap). */
  function captureOpts(extra) {
    var base = {
      scale: captureScale(2),
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 8000,
      removeContainer: true,
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
      }
    }
    return base;
  }

  function diagnose() {
    var bits = [];
    bits.push("build=" + BUILD_ID);
    bits.push("native=" + isNative());
    bits.push("ULCNative=" + !!(global.ULCNative && global.ULCNative.ping));
    var Saver = getPlugin("UlcPdfSaver");
    bits.push("UlcPdfSaver=" + !!(Saver && Saver.start));
    bits.push("jspdf=" + !!(global.jspdf && global.jspdf.jsPDF));
    bits.push("html2canvas=" + typeof global.html2canvas);
    return bits.join(", ");
  }

  function schedulePatches() {
    patchJsPdf();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", patchJsPdf);
    }
    [0, 300, 1000, 3000, 8000].forEach(function (ms) {
      setTimeout(patchJsPdf, ms);
    });
  }

  schedulePatches();

  global.ULC_SAVE = {
    BUILD_ID: BUILD_ID,
    saveBlob: saveBlob,
    saveJsPdf: saveJsPdf,
    patchJsPdf: patchJsPdf,
    isNative: isNative,
    pdfToBlob: pdfToBlob,
    base64ToBlob: base64ToBlob,
    blobToBase64: blobToBase64,
    prepareCaptureHost: prepareCaptureHost,
    captureScale: captureScale,
    captureOpts: captureOpts,
    captureElement: captureElement,
    withTimeout: withTimeout,
    alertPdfFailed: alertPdfFailed,
    wasAlerted: wasAlerted,
    diagnose: diagnose,
    shareArchivedPdf: shareArchivedPdf,
    stripBase64: stripBase64,
    triggerBrowserDownload: triggerBrowserDownload,
  };
})(typeof window !== "undefined" ? window : globalThis);
