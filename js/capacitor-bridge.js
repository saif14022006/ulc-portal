/* Capacitor native polish: status bar, splash, back button, gate install prompts.
 * On Android/iOS, Capacitor injects window.Capacitor before page scripts run.
 * Browser PWA is unaffected (early return).
 */
(function () {
  const Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== "function" || !Cap.isNativePlatform()) {
    window.ULC_IS_NATIVE = false;
    return;
  }

  window.ULC_IS_NATIVE = true;
  document.documentElement.classList.add("ulc-native");

  /* Free WebView storage so PDF download is not blocked by full My Files */
  try {
    var mf = localStorage.getItem("ulc_my_files_v1");
    if (mf && mf.length > 500000) localStorage.removeItem("ulc_my_files_v1");
  } catch (e) {
    try {
      localStorage.removeItem("ulc_my_files_v1");
    } catch (_) {}
  }

  // Suppress browser/PWA "install" / A2HS flows inside the native shell.
  window.addEventListener(
    "beforeinstallprompt",
    (e) => {
      e.preventDefault();
    },
    true
  );
  window.addEventListener(
    "appinstalled",
    (e) => {
      e.stopImmediatePropagation();
    },
    true
  );

  const App = Cap.registerPlugin ? Cap.registerPlugin("App") : Cap.Plugins?.App;
  const StatusBar = Cap.registerPlugin ? Cap.registerPlugin("StatusBar") : Cap.Plugins?.StatusBar;
  const SplashScreen = Cap.registerPlugin
    ? Cap.registerPlugin("SplashScreen")
    : Cap.Plugins?.SplashScreen;

  async function setupStatusBar() {
    if (!StatusBar) return;
    try {
      await StatusBar.setBackgroundColor({ color: "#0b3a6b" });
      await StatusBar.setStyle({ style: "DARK" });
      if (typeof StatusBar.show === "function") await StatusBar.show();
    } catch (_) {
      /* plugin stub / older WebView */
    }
  }

  async function hideSplash() {
    if (!SplashScreen) return;
    try {
      await SplashScreen.hide({ fadeOutDuration: 280 });
    } catch (_) {
      /* already hidden */
    }
  }

  function setupBackButton() {
    if (!App || typeof App.addListener !== "function") return;
    App.addListener("backButton", ({ canGoBack }) => {
      const openOverlay = document.querySelector(
        ".modal.show, .modal.open, .sheet.open, dialog[open], .auth-overlay.open, [aria-modal='true']"
      );
      if (openOverlay) {
        const closer = openOverlay.querySelector(
          "[data-close], .modal-close, .sheet-close, [aria-label='Close'], .btn-close"
        );
        if (closer) {
          closer.click();
          return;
        }
        if (typeof openOverlay.close === "function") {
          openOverlay.close();
          return;
        }
        openOverlay.classList.remove("show", "open");
        return;
      }

      const active = document.querySelector(".view.active");
      const onHome = active && active.id === "v-home";
      if (!onHome && typeof window.go === "function") {
        window.go("home");
        return;
      }

      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }

      if (typeof App.exitApp === "function") App.exitApp();
    });
  }

  setupStatusBar();
  setupBackButton();
  window.addEventListener("load", () => {
    hideSplash();
    if (window.ULC_SAVE && typeof window.ULC_SAVE.patchJsPdf === "function") {
      window.ULC_SAVE.patchJsPdf();
    }
  });
  if (document.readyState === "complete") hideSplash();
})();
