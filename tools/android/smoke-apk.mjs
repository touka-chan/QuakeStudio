/**
 * Smoke-test the built APK on a real Android device or emulator.
 * =========================================================================
 * WHY THIS EXISTS
 *
 * "The APK builds" and "the APK works" are different claims, and only the first
 * is proved by `npm run android:build`. Everything that can go wrong in a
 * Capacitor WebView happens AFTER the build:
 *
 *   • WebGL may not initialise — the 3D viewport would be a blank rectangle
 *   • the Web Worker may not load, so no numbers are ever computed
 *   • the lazy chunks may 404 from the local asset loader
 *   • a crash on launch is invisible until someone installs it on a phone
 *
 * None of that is covered by any other test in this repository.
 *
 * ── WHY IT DRIVES THE DOM, NOT THE SCREEN ──────────────────────────────────
 * The first version of this script tapped hard-coded coordinates. It reported
 * PASS while capturing four screenshots of a stale session: `pm clear` does
 * not kill a running process, so `am start` simply foregrounded the app
 * wherever it already was.
 *
 * The second version force-stopped properly and then tapped coordinates. It
 * also reported PASS — while the taps merely toggled a checkbox, so every
 * "navigation" screenshot was still the first-run dialog. The screens differed,
 * so a "did anything change?" check passed too.
 *
 * A debug APK exposes a WebView devtools socket, so this talks to the Chrome
 * DevTools Protocol instead: real elements, real assertions, no pixel guessing.
 * That removes a whole class of silent, confident, wrong results.
 *
 * It asserts the app RUNS. It does not assert the numbers are correct — that is
 * `npm run validate`, against the independent Python reference.
 *
 * Usage
 * -----
 *     node tools/android/smoke-apk.mjs
 *     node tools/android/smoke-apk.mjs --serial emulator-5554
 *
 * Requires a running device or emulator visible to `adb devices`.
 * =========================================================================
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APK = join(REPO_ROOT, 'apps/web/android/app/build/outputs/apk/debug/app-debug.apk');
const PACKAGE = 'app.quakestudio.simulator';
const SHOTS_DIR = join(REPO_ROOT, 'apps/web/android/app-smoke');

const serialArg = process.argv.indexOf('--serial');
const SERIAL = serialArg > -1 ? process.argv[serialArg + 1] : null;

/* ------------------------------------------------------------------- adb */

const EXE = platform() === 'win32' ? '.exe' : '';

function findAdb() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'AppData/Local/Android/Sdk'),
    join(homedir(), 'Library/Android/sdk'),
    join(homedir(), 'Android/Sdk'),
  ].filter(Boolean);

  const candidates = [
    process.env.ADB_PATH,
    ...sdkRoots.map((root) => join(root, 'platform-tools', `adb${EXE}`)),
  ].filter(Boolean);

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  console.error(`\nerror: adb not found. Looked in:\n  ${candidates.join('\n  ')}\n`);
  process.exit(1);
}

const ADB = findAdb();

function adb(args, { quiet = false } = {}) {
  const result = spawnSync(ADB, SERIAL ? ['-s', SERIAL, ...args] : args, {
    encoding: 'utf8',
    shell: platform() === 'win32',
    ...(quiet ? { stdio: 'ignore' } : {}),
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const step = (label) => console.log(`\n-- ${label}`);

/* ------------------------------------------------- DevTools Protocol plumbing */

const CDP_PORT = 9333;

/** Find the WebView's devtools socket and forward a local port to it. */
async function connectToWebView() {
  const pid = adb(['shell', 'pidof', PACKAGE]).trim();
  if (!pid) throw new Error('the app is not running');

  const unix = adb(['shell', 'cat', '/proc/net/unix']);
  const socket = unix
    .split('\n')
    .map((line) => /@(webview_devtools_remote_\d+)/.exec(line)?.[1])
    .find(Boolean);

  if (!socket) {
    throw new Error(
      'no WebView devtools socket — is this a debug build? A release APK is not debuggable.',
    );
  }

  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:${socket}`], { quiet: true });

  // The page list appears a moment after the socket does.
  let targets = [];
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      targets = await response.json();
      if (targets.length > 0) break;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }

  const page = targets.find((t) => t.webSocketDebuggerUrl);
  if (!page) throw new Error('no debuggable page in the WebView');

  const socketConnection = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socketConnection.addEventListener('open', resolve, { once: true });
    socketConnection.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();

  socketConnection.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });

  /** Evaluate an expression in the page and return its value. */
  async function evaluate(expression) {
    const id = nextId++;
    const response = new Promise((resolve) => pending.set(id, resolve));

    socketConnection.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );

    const { result } = await response;
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'evaluation failed');
    }
    return result?.result?.value;
  }

  return { evaluate, close: () => socketConnection.close() };
}

/* ---------------------------------------------------------- page helpers */

/** Click the first element matching a selector whose text contains `text`. */
const clickByText = (selector, text) => `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((e) => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
  if (!el) return 'not found';
  el.click();
  return 'clicked';
})()`;

const bodyText = 'document.body.innerText';

/* ------------------------------------------------------------------ run it */

if (!existsSync(APK)) {
  console.error(`\nerror: no APK at ${APK}\nRun: npm run android:build\n`);
  process.exit(1);
}

const devices = adb(['devices'])
  .split('\n')
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => line.endsWith('\tdevice'));

if (devices.length === 0) {
  console.error('\nerror: no device or emulator is connected.\n');
  process.exit(1);
}

console.log(`APK      ${APK.replace(`${REPO_ROOT}\\`, '')}`);
console.log(`device   ${SERIAL ?? devices.join(', ')}`);

const failures = [];
const screenshots = [];
mkdirSync(SHOTS_DIR, { recursive: true });

function screenshot(name) {
  adb(['shell', 'screencap', '-p', `/sdcard/${name}`], { quiet: true });
  const target = join(SHOTS_DIR, name);
  if (!/1 file pulled/.test(adb(['pull', `/sdcard/${name}`, target]))) {
    failures.push(`could not capture ${name}`);
    return;
  }
  screenshots.push(name);

  // A failed render is one flat colour — and a screenshot-only check sails
  // straight past that.
  const bytes = readFileSync(target);
  const colours = new Set();
  for (let i = 0; i < bytes.length - 3; i += 4 * 97) colours.add(bytes[i]);
  if (colours.size < 4) {
    failures.push(`${name} is a blank screen`);
    console.log(`  ${name}  <-- BLANK`);
    return;
  }
  console.log(`  ${name}`);
}

/* 1. Install --------------------------------------------------------------- */
step('Installing');
const install = adb(['install', '-r', APK]);
if (!/Success/.test(install)) {
  console.error(install);
  process.exit(1);
}
console.log('installed');

/* 2. Launch ---------------------------------------------------------------- */
step('Launching');
// Force-stop BEFORE clearing: `pm clear` wipes data but does not kill a running
// process, so without this the app is simply foregrounded where it already was.
adb(['shell', 'am', 'force-stop', PACKAGE], { quiet: true });
adb(['shell', 'pm', 'clear', PACKAGE], { quiet: true });
adb(['logcat', '-c'], { quiet: true });
adb(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`], { quiet: true });

let page;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await sleep(2000);
  try {
    page = await connectToWebView();
    break;
  } catch {
    /* not up yet */
  }
}

if (!page) {
  console.error('\nerror: the app never exposed a WebView — it may have crashed on launch.');
  const logs = adb(['logcat', '-d', '-v', 'brief']);
  console.error(
    logs
      .split('\n')
      .filter((l) => /FATAL|AndroidRuntime/.test(l))
      .slice(0, 8)
      .join('\n'),
  );
  process.exit(1);
}

console.log('WebView attached');

/* 3. First-run gate ------------------------------------------------------- */
step('First-run gate');
await page.evaluate(clickByText('button, [role="checkbox"]', 'I understand'));
await sleep(800);
await page.evaluate(clickByText('button', 'Start exploring'));
await sleep(3000);

const afterGate = await page.evaluate(
  'document.body.innerText.includes("START FROM A TEMPLATE") || document.body.innerText.includes("Floors")',
);
if (!afterGate) {
  failures.push('the first-run gate did not clear — the app is still showing the welcome dialog');
} else {
  console.log('cleared');
}
screenshot('1-build.png');

/* 4. The 3D viewport — WebGL in a WebView --------------------------------- */
step('3D viewport (WebGL)');
await page.evaluate(clickByText('button, [role="tab"]', 'Simulate'));
await sleep(6000);

const canvas = await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  if (!c) return { found: false };
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return { found: true, width: c.width, height: c.height, hasContext: Boolean(gl) };
})()`);

if (!canvas.found) failures.push('no <canvas> — the 3D viewport did not render');
else if (!canvas.hasContext) failures.push('the canvas has no WebGL context');
else console.log(`canvas ${canvas.width}x${canvas.height}, WebGL context live`);

/*
 * Read the exaggeration caveat HERE, while the Simulate tab is showing.
 *
 * It lives in the playback bar, so asserting it later from the Results tab
 * fails against a perfectly correct app. That is the check being wrong rather
 * than the software — which is exactly what trains people to ignore a red test.
 */
const simulateText = await page.evaluate(bodyText);
screenshot('2-viewport.png');

/* 5. The simulation — does the Worker produce numbers? --------------------- */
step('Simulation results');
await page.evaluate(clickByText('button, [role="tab"]', 'Results'));
await sleep(5000);

const results = await page.evaluate(`(() => {
  const text = document.body.innerText;
  const mm = text.match(/(\\d+(?:\\.\\d+)?)\\s*mm/);
  const pct = text.match(/(\\d+(?:\\.\\d+)?)\\s*%/);
  return { displacement: mm ? mm[1] : null, drift: pct ? pct[1] : null, length: text.length };
})()`);

if (!results.displacement) {
  failures.push('no displacement in mm — the simulation worker produced nothing');
} else {
  console.log(`peak displacement ${results.displacement} mm`);
  if (results.drift) console.log(`drift ${results.drift} %`);
}
screenshot('3-results.png');

/* 6. Disclaimers still present -------------------------------------------- */
step('Honesty about results');
const resultsText = await page.evaluate(bodyText);

if (!/not a structural safety assessment/i.test(resultsText)) {
  failures.push('the "not a structural safety assessment" disclaimer is missing');
} else {
  console.log('disclaimer present (results)');
}

// Checked on the tab where it actually appears — see the note in step 4.
if (!/exaggerat/i.test(simulateText)) {
  failures.push('the motion-exaggeration caveat is missing from the playback bar');
} else {
  console.log('exaggeration caveat present (viewport)');
}

/* 7. Crash watch ---------------------------------------------------------- */
step('Watching for crashes');
const logs = adb(['logcat', '-d', '-v', 'brief']);
const fatal = logs.split('\n').filter((line) => /FATAL EXCEPTION/.test(line));
const jsErrors = logs.split('\n').filter((line) => /Uncaught|TypeError|ReferenceError/.test(line));

if (fatal.length) failures.push(`${fatal.length} fatal exception(s) in logcat`);
else console.log('no fatal exceptions');
if (jsErrors.length) failures.push(`${jsErrors.length} uncaught JavaScript error(s)`);
else console.log('no uncaught JavaScript errors');

page.close();

/* 8. Verdict -------------------------------------------------------------- */
console.log('');
if (failures.length === 0) {
  console.log('PASS — installed, launched, WebGL live, worker computed, no crashes.');
  console.log(`Screenshots: ${SHOTS_DIR.replace(`${REPO_ROOT}\\`, '')}`);
  console.log(
    '\nNOTE: this checks the app RUNS, not that the numbers are right.\n' +
      'Correctness is `npm run validate`, against the Python reference.',
  );
  process.exit(0);
}

console.error('FAIL\n');
for (const failure of failures) console.error(`  - ${failure}`);
process.exit(1);
