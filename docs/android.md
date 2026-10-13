# Building the Android app

QuakeStudio ships as **two** things, sharing one codebase:

| | What it is | Needs a server? |
|---|---|---|
| **The web app / PWA** | Installs from a browser on Android and desktop Chromium | Yes, to download it once |
| **The APK** | A file you copy onto a phone and sideload | **No** — everything is inside the package |

Both run the same simulation code. The APK is the one for a lab with a captive
network, or for handing a student a single file.

---

## Building it

```bash
npm run android:build
```

That builds, copies the latest web assets into the APK, runs Gradle, and prints
where the file landed:

```
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

**~4.8 MB. Signed with the debug keystore, so it installs on any phone.**

To install it on a phone:

1. Copy the `.apk` to the phone (USB, Drive, whatever).
2. Open it. Android will refuse the first time until you allow **install from
   unknown sources** for whichever app you opened it with — the Files app, say.
3. It appears on the home screen with the QuakeStudio icon.

Nothing else is needed. It works in aeroplane mode.

---

## Why Capacitor, and not something else

The obvious alternative — React Native, or rewriting for native — would mean
rebuilding the Three.js viewport, the charts and every dialog and control. None
of that carries over.

Capacitor keeps the existing web app and gives it a native shell. The numerical
engine was already pure TypeScript with no DOM dependencies, so the one part
that *could* have needed porting needed nothing.

What this buys:

- **One codebase.** A bug fixed once is fixed on both platforms.
- **Offline by construction.** `cap sync` copies `dist/` into the APK, so the
  app cannot fail to start without a network. There is nothing to cache and
  nothing to go stale.
- **No store account** for sideloading.

---

## Verifying it actually works

Building is not the same as running. Everything that can break in a Capacitor
WebView breaks *after* the build — WebGL failing to initialise, the Web Worker
never loading, a lazy chunk 404ing from the local asset loader. None of that is
visible in any other test in this repository.

```bash
npm run android:smoke     # needs a running device or emulator
```

That installs the APK, launches it, and asserts:

| Check | What it catches |
|---|---|
| Process starts | Crash on launch |
| First-run gate clears | Dialog that cannot be dismissed on a phone |
| `<canvas>` has a live WebGL context | 3D viewport rendering nothing |
| A displacement in mm appears | **The Web Worker not running** |
| Disclaimer and exaggeration caveat present | The honesty copy going missing |
| No fatal or uncaught JS in logcat | Anything above, in a readable form |

Verified on a Pixel 6 AVD (Android 17, 1080×2400):

```
PASS — installed, launched, WebGL live, worker computed, no crashes.
canvas 822x859, WebGL context live
peak displacement 192.6 mm
drift 1.88 %
```

Those figures match the project's documented defaults, which is the useful
part: the engine produced the same numbers inside a phone WebView as it does in
a browser.

**It checks the app RUNS, not that the numbers are right.** Correctness is
`npm run validate`, against the independent Python reference.

### It drives the DOM, not the screen

The first version of this script tapped hard-coded coordinates and reported
PASS while capturing four screenshots of a stale session. `pm clear` wipes data
but does not kill a running process, so `am start` simply foregrounded the app
where it already was.

The second version force-stopped properly, tapped coordinates, and reported
PASS again — because the taps merely toggled a checkbox. Every "navigation"
screenshot was still the first-run dialog. The screens differed, so a "did
anything change?" check passed too.

A debug APK exposes a WebView devtools socket, so the script now speaks the
Chrome DevTools Protocol: it clicks real elements and asserts on the real DOM.
No pixel guessing, and a missed step fails loudly instead of producing four
confident, meaningless screenshots.

---

## Two things that will bite you

### 1. The service worker is switched OFF inside the APK

Inside the APK, Capacitor serves every asset from a local `https://localhost`
scheme. A service worker there buys nothing and actively causes harm:

The worker's precache is keyed to the hashed filenames of whichever APK
installed it. Install a **new** APK and the new hashed filenames are not in the
old precache — but the old precache is still there, still controlling the page,
and still serving the **old** `index.html`, which references the **old** chunks.
The app appears to ignore the update.

So `src/pwa/registerServiceWorker.ts` checks for Capacitor's injected global and
skips registration. The web build is unaffected.

### 2. Gradle needs JDK 21, and JDK 26 breaks it

Two separate failures that look like one:

| Symptom | Cause |
|---|---|
| `error: invalid source release: 21` | `JAVA_HOME` points at a JDK 17 |
| `Failed to transform core-for-system-modules.jar to match attributes {artifactType=_internal_android_jdk_image}` | `JAVA_HOME` points at a JDK **26** |

The second is the nasty one: Android Gradle Plugin cannot yet process JDK 26's
module format, and the error never mentions the JDK version.

`tools/android/build-apk.mjs` handles both by choosing the **lowest** JDK ≥ 21
it can find — 21 works, 26 does not. If only an unsupported JDK is installed it
says so up front instead of letting Gradle fail cryptically.

Android Studio ships a suitable JDK at:

```
C:\Program Files\Android\Android Studio\jbr
```

---

## Release builds (for distribution beyond a few phones)

The debug APK is fine for handing to a class. For anything wider, use a real
keystore:

```bash
npm run android:build:release
```

That produces `app-release-unsigned.apk`, which will **not** install. Sign it:

```bash
keytool -genkey -v -keystore quakestudio.keystore \
        -alias quakestudio -keyalg RSA -keysize 2048 -validity 10000
```

Then configure signing in `apps/web/android/app/build.gradle` — **never commit
the keystore or its passwords.**

### Before any public distribution

`appId` in `capacitor.config.ts` is currently `app.quakestudio.simulator`, a
placeholder. It is **permanent** once published: changing it produces a
different app rather than an update, so users would have to uninstall and
reinstall and lose their saved runs.

Settle on a domain the client controls, reverse-DNS style:

```
com.university.department.quakestudio
```

---

## Changing the app

Edit the web app, then rebuild. The APK embeds a snapshot, so it does **not**
pick up changes on its own.

```bash
npm run build      # rebuild the web app
npm run android:build   # re-sync into the APK and rebuild it
```

Open the native project in Android Studio for debugging:

```bash
npm run android:open    # then run cap:sync --workspace apps/web to re-sync
```

---

## Icons

Capacitor ships its own logo in every density. `tools/pwa/generate-icons.mjs`
overwrites all of it, along with the web app's icons, in one pass:

```bash
npm run pwa:icons
```

Android adaptive icons are two layers, and both must be right:

- **Background** — a flat colour (`ic_launcher_background.xml`)
- **Foreground** — the artwork, transparent, inset to the 72/108 safe zone

The foreground must be **transparent** and must not have rounded corners of its
own. Android applies its own mask on top, so an icon that carries its own
rounding ends up double-rounded with the background showing through the corners.

The brand colour is defined once, in `BRAND` at the top of the generator. Change
it there and re-run; the XML file is regenerated and warns if you edit it
directly.

---

## What this does not change

The app is still an **educational simulation with placeholder engineering
coefficients**. The APK makes it more portable; it does not make it more
correct. See [`assumptions.md`](assumptions.md).