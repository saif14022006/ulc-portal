/* Play Store / app update prompt — uses Capacitor App.getInfo on native; fetches version.json */
(function (global) {
  "use strict";
  const LS_DISMISS = "ulc_update_dismiss_v1";
  const LIVE_URL = "https://ulc-student-portal.vercel.app/version.json";
  const PLAY_FALLBACK = "https://play.google.com/store/apps/details?id=pk.edu.ulc.toolkit";

  function esc(s) {
    return String(s || "").replace(/[<>&"']/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function dismissedFor(code) {
    try {
      const d = JSON.parse(localStorage.getItem(LS_DISMISS) || "null");
      if (!d || +d.code !== +code) return false;
      /* Remember "Later" for 48 hours for this versionCode */
      return Date.now() - (+d.at || 0) < 48 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  function dismiss(code) {
    localStorage.setItem(LS_DISMISS, JSON.stringify({ code: +code, at: Date.now() }));
  }

  function ensureModal() {
    let el = document.getElementById("ulcUpdatePrompt");
    if (el) return el;
    el = document.createElement("div");
    el.id = "ulcUpdatePrompt";
    el.className = "ulc-update-prompt";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="ulc-update-prompt-bg" data-update-close="1"></div>
      <div class="ulc-update-prompt-card" role="dialog" aria-modal="true" aria-labelledby="ulcUpdateTitle">
        <h3 id="ulcUpdateTitle">Update available</h3>
        <p id="ulcUpdateMsg"></p>
        <p class="ulc-update-meta" id="ulcUpdateMeta"></p>
        <div class="ulc-update-actions">
          <button type="button" class="btn btn-ghost" data-update-later="1">Later</button>
          <a class="btn btn-gold" id="ulcUpdatePlay" href="${PLAY_FALLBACK}" target="_blank" rel="noopener">Update on Play Store</a>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute("data-update-close") === "1") hide();
      if (t && t.getAttribute("data-update-later") === "1") {
        const code = +el.dataset.remoteCode || 0;
        if (code) dismiss(code);
        hide();
      }
    });
    return el;
  }

  function hide() {
    const el = document.getElementById("ulcUpdatePrompt");
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  }

  function show(remote, local) {
    if (dismissedFor(remote.androidVersionCode)) return;
    const el = ensureModal();
    el.dataset.remoteCode = String(remote.androidVersionCode);
    const msg = document.getElementById("ulcUpdateMsg");
    const meta = document.getElementById("ulcUpdateMeta");
    const link = document.getElementById("ulcUpdatePlay");
    if (msg) msg.textContent = remote.message || "A newer version of ULC Toolkit is on Google Play.";
    if (meta) {
      meta.textContent = `You have ${local.version || "?"} (${local.build || "?"}) · Latest ${remote.androidVersionName || ""} (${remote.androidVersionCode})`;
    }
    if (link) link.href = remote.playStoreUrl || PLAY_FALLBACK;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
  }

  async function fetchJson(url) {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("version " + r.status);
    return r.json();
  }

  async function getLocalInfo() {
    const Cap = global.Capacitor;
    if (Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform()) {
      try {
        const App = Cap.Plugins?.App || (Cap.registerPlugin && Cap.registerPlugin("App"));
        if (App && typeof App.getInfo === "function") {
          const info = await App.getInfo();
          return {
            version: String(info.version || ""),
            build: Number(info.build) || 0,
            native: true,
          };
        }
      } catch (_) {
        /* fall through */
      }
    }
    /* Web / bundled fallback — compare against packaged version.json */
    try {
      const local = await fetchJson("./version.json");
      return {
        version: String(local.androidVersionName || ""),
        build: Number(local.androidVersionCode) || 0,
        native: false,
      };
    } catch {
      return { version: "", build: 0, native: false };
    }
  }

  async function check(opts) {
    const force = !!(opts && opts.force);
    try {
      const local = await getLocalInfo();
      /* Prefer live site so we can raise the latest code without waiting for every user to update first. */
      let remote = null;
      try {
        remote = await fetchJson(LIVE_URL);
      } catch (_) {
        try {
          remote = await fetchJson("./version.json");
        } catch (__) {
          return;
        }
      }
      const remoteCode = Number(remote.androidVersionCode) || 0;
      const localCode = Number(local.build) || 0;
      if (!remoteCode || !localCode) return;
      if (remoteCode <= localCode) return;
      if (!force && !local.native && remoteCode <= localCode) return;
      /* On web, only prompt if clearly behind live (optional soft notice). On native, always when behind. */
      if (!local.native && !(opts && opts.allowWeb)) return;
      show(remote, local);
    } catch (e) {
      console.warn("update-check", e);
    }
  }

  global.ULC_UPDATE = { check, hide };
  global.addEventListener("load", () => {
    setTimeout(() => check({ allowWeb: false }), 1800);
  });
  try {
    const Cap = global.Capacitor;
    if (Cap && Cap.isNativePlatform && Cap.isNativePlatform()) {
      const App = Cap.Plugins?.App || (Cap.registerPlugin && Cap.registerPlugin("App"));
      if (App && App.addListener) {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) setTimeout(() => check({}), 800);
        });
      }
    }
  } catch (_) {
    /* ignore */
  }
})(window);
