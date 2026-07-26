# Android APK (Capacitor)

ULC Toolkit ships as a Capacitor Android app (`pk.edu.ulc.toolkit`) that embeds the existing web UI.

## Prerequisites

- [Android Studio](https://developer.android.com/studio) (includes Android SDK + a JDK)
- Node.js 18+ (for `npm` scripts)

## One-time setup

```bash
npm install
npm run cap:sync
```

`cap:sync` copies the web shell into `www/`, then syncs it into `android/`.

## Build a debug APK (sideload)

### Option A — Android Studio

1. `npm run cap:open` (or open the `android/` folder in Android Studio)
2. Wait for Gradle sync to finish
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. Install the APK from the IDE notification, or find it at:

`android/app/build/outputs/apk/debug/app-debug.apk`

### Option B — Command line

With Android Studio / SDK installed and `JAVA_HOME` set:

```bash
npm run android:debug
```

Or:

```bash
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

Debug APK path: `android/app/build/outputs/apk/debug/app-debug.apk`

## Signed release (Play Store)

1. Open `android/` in Android Studio
2. **Build → Generate Signed Bundle / APK**
3. Create or select a keystore
4. Prefer an **Android App Bundle (.aab)** for Play Store upload

## Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm run cap:copy` | Copy `index.html`, `js/`, `icons/`, `assets/`, etc. into `www/` |
| `npm run cap:sync` | Copy + `npx cap sync android` |
| `npm run cap:open` | Open the project in Android Studio |
| `npm run android:debug` | Sync then `gradlew assembleDebug` |

## Notes

- App ID: `pk.edu.ulc.toolkit` · App name: **ULC Toolkit**
- Status bar / splash background: `#0b3a6b` (ULC navy); splash uses the ULC logo
- Icons are generated from `icons/` via `npm run cap:icons` (re-run after logo changes, then `npm run cap:sync`)
- Browser “Add to Home Screen” prompts are suppressed inside the native app; hardware back returns to Home before exiting
- Keep `android/` source in git; build outputs (`app/build`, `.gradle`, `local.properties`) are gitignored
- If `gradlew assembleDebug` fails with **JAVA_HOME is not set**, install Android Studio (it bundles a JDK) or set `JAVA_HOME` to a JDK 21+ install, and ensure the Android SDK is installed
