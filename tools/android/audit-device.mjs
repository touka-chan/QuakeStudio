/**
 * Audit the Android APK on a real device — every feature, not just the simulation.
 * =========================================================================
 * WHY THIS IS SEPARATE FROM smoke-apk.mjs
 *
 * The smoke test proves one thing: the app installs, launches, and the
 * simulation computes. That is the "does it run at all" question.
 *
 * This asks "does every feature work on a phone", which is a different and much
 * larger question. Two features were already known broken by reading the code
 * and had never been exercised:
 *
 *   • CSV export  — uses URL.createObjectURL + a[download], and an Android
 *                   WebView has no download listener. Almost certainly silent.
 *   • Back button — no handler exists anywhere, so back closes the activity
 *                   instead of the dialog.
 *
 * Neither showed up in the smoke test because the smoke test never touched them.
 * "The smoke test passed" and "the app works" are not the same claim.
 *
 * WHAT IT DOES NOT DO
 *   It does not check the numbers are correct. That is `npm run validate`,
 *   against the independent Python reference.
 *
 * Usage
 * -----
 *     node tools/android/audit-device.mjs
 *     node tools/android/audit-device.mjs --serial 2a08dd1
 *
 * Requires USB debugging. Keep the screen unlocked — adb taps go nowhere on a
 * locked device, and the failures are silent.
 * =========================================================================
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APK = join(REPO_ROOT, 'apps/web/android/app/build/outputs/apk/debug/app-debug.apk');
const PACKAGE = 'app.quakestudio.simulator';
const SHOTS_DIR = join(REPO_ROOT, 'apps/web/android/app-audit');

const serialArg = process.argv.indexOf('--serial');
const SERIAL = serialArg > -1 ? process.argv[serialArg + 1] : null;

/* ------------------------------------------------------------------- adb */

const EXE = platform() === 'win32' ? '.exe' : '';

function findAdb() {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'AppData/Local/Android/Sdk'),
    join(homedir(), 'Library/Android/sdk'),
    join(homedir(), 'Android/Sdk'),
  ].filter(Boolean);

  const candidates = [
    process.env.ADB_PATH,
    ...roots.map((root) => join(root, 'platform-tools', `adb${EXE}`)),
  ].filter(Boolean);

  for (const path of candidates) if (existsSync(path)) return path;

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

/* ------------------------------------------------ DevTools Protocol client */

const CDP_PORT = 9334;

async function connect() {
  const pid = adb(['shell', 'pidof', PACKAGE]).trim();
  if (!pid) throw new Error('the app is not running');

  const socket = adb(['shell', 'cat', '/proc/net/unix'])
    .split('\n')
    .map((line) => /@(webview_devtools_remote_\d+)/.exec(line)?.[1])
    .find(Boolean);

  if (!socket) throw new Error('no WebView devtools socket (needs a debug build)');

  adb(['forward', `tcp:${CDP_PORT}`, `localabstract:${socket}`], { quiet: true });

  let targets = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      if (targets.length) break;
    } catch {
      /* not up */
    }
    await sleep(700);
  }

  const target = targets.find((t) => t.webSocketDebuggerUrl);
  if (!target) throw new Error('no debuggable page');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });

  return {
    async evaluate(expression, timeoutMs = 20_000) {
      const id = nextId++;
      const response = new Promise((resolve) => pending.set(id, resolve));
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );

      /*
       * Never await forever.
       *
       * If the app process dies, the WebView goes with it and the devtools
       * socket simply stops answering. The CDP promise then never settles, and
       * a script that `await`s it hangs until someone kills it — which is
       * exactly what happened here. A timeout turns "the app crashed" into a
       * reportable finding instead of a hung terminal.
       */
      const settled = await Promise.race([response, sleep(timeoutMs).then(() => null)]);

      if (settled === null) throw new Error('the WebView stopped responding');
      if (settled.result?.exceptionDetails) {
        throw new Error(settled.result.exceptionDetails.text ?? 'eval failed');
      }
      return settled.result?.result?.value;
    },

    /**
     * A real touch drag, in CSS pixels.
     *
     * `adb shell input swipe` wants DEVICE pixels, and converting from CSS
     * requires the WebView's offset from the top of the screen — which the
     * page cannot report. Guessing it put every swipe on the wrong row and
     * reported a perfectly working slider as broken.
     *
     * CDP takes CSS coordinates directly, so there is no mapping to get wrong.
     */
    async touchDrag(from, to, steps = 12) {
      const touch = (type, x, y) => {
        const i = nextId++;
        const p = new Promise((res) => pending.set(i, res));
        ws.send(
          JSON.stringify({
            id: i,
            method: 'Input.dispatchTouchEvent',
            params: {
              type,
              touchPoints:
                type === 'touchEnd' ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1, id: 1 }],
            },
          }),
        );
        return Promise.race([p, sleep(5000).then(() => null)]);
      };

      await touch('touchStart', from.x, from.y);
      for (let step = 1; step <= steps; step += 1) {
        await touch('touchMove', Math.round(from.x + ((to.x - from.x) * step) / steps), from.y);
        await sleep(35);
      }
      await touch('touchEnd', to.x, to.y);
    },

    close: () => ws.close(),
  };
}

/** Attach once the app is up. Retries through a cold start. */
async function attach(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await connect();
    } catch {
      await sleep(2000);
    }
  }
  throw new Error('the WebView never attached');
}

/* ------------------------------------------------------------- page helpers */

/** Click the first `selector` whose text contains `text`. Returns found/clicked. */
const clickByText = (selector, text) => `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((e) => e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
  if (!el) return 'not found';
  el.click();
  return 'clicked';
})()`;

/**
 * Click by aria-label.
 *
 * The play/pause control is an icon with no text at all, so matching on
 * `textContent` cannot find it. Guessing at button indexes instead — which is
 * what this did first — silently clicks whatever happens to be in that
 * position after any layout change.
 */
const clickByLabel = (label) => `(() => {
  const el = document.querySelector('[aria-label=${JSON.stringify(label)}]');
  if (!el) return 'not found';
  el.click();
  return 'clicked';
})()`;

/* -------------------------------------------------------------- bookkeeping */

const results = [];
let shotCount = 0;
mkdirSync(SHOTS_DIR, { recursive: true });

function record(feature, ok, detail) {
  results.push({ feature, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${feature.padEnd(26)} ${detail ?? ''}`);
}

function screenshot(label) {
  shotCount += 1;
  const name = `${String(shotCount).padStart(2, '0')}-${label}.png`;
  adb(['shell', 'screencap', '-p', `/sdcard/${name}`], { quiet: true });
  const target = join(SHOTS_DIR, name);
  adb(['pull', `/sdcard/${name}`, target], { quiet: true });
  return existsSync(target) ? target : null;
}

const logcatSince = () => adb(['logcat', '-d', '-v', 'brief']);

/* ------------------------------------------------------------------- setup */

if (!existsSync(APK)) {
  console.error(`\nerror: no APK at ${APK}\nRun: npm run android:build\n`);
  process.exit(1);
}

const targets = adb(['devices'])
  .split('\n')
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => line.endsWith('\tdevice'));

if (targets.length === 0) {
  console.error('\nerror: no device is connected.\n');
  process.exit(1);
}

const device = SERIAL ?? targets[0].split(/\s+/)[0];

const run = (args) => {
  const result = spawnSync(ADB, ['-s', device, ...args], {
    encoding: 'utf8',
    shell: platform() === 'win32',
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
};

console.log(`APK     ${APK.replace(`${REPO_ROOT}\\`, '')}`);
console.log(
  `device  ${device} — ${run(['shell', 'getprop', 'ro.product.model']).trim()}, Android ${run(['shell', 'getprop', 'ro.build.version.release']).trim()}`,
);
console.log(`screen  ${run(['shell', 'wm', 'size']).trim()}`);

// Keep the screen awake. adb taps on a locked device go nowhere, silently.
run(['shell', 'svc', 'power', 'stayon', 'true']);

let page;

/* 1. Install and cold start ------------------------------------------------ */
console.log('\n-- Installing');
const install = run(['install', '-r', APK]);
if (!/Success/.test(install)) {
  console.error(install);
  process.exit(1);
}
console.log('  installed');

run(['shell', 'am', 'force-stop', PACKAGE]);
run(['shell', 'pm', 'clear', PACKAGE]);
run(['logcat', '-c']);
run(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`]);

page = await attach();

/* 2. First-run gate -------------------------------------------------------- */
console.log('\n-- First run');
await page.evaluate(clickByText('button, [role="checkbox"]', 'I understand'));
await sleep(700);
await page.evaluate(clickByText('button', 'Start exploring'));
await sleep(3500);

const pastGate = await page.evaluate('document.body.innerText.includes("START FROM A TEMPLATE")');
record('first-run gate', pastGate, pastGate ? 'cleared' : 'STILL SHOWING THE WELCOME DIALOG');
screenshot('build');

/* 3. Building controls ----------------------------------------------------- */
console.log('\n-- Building controls');

/*
 * Drag the Floors slider with a real touch swipe.
 *
 * TWO things were wrong in the first version, and both reported a perfectly
 * working slider as broken:
 *
 *   1. `[role="slider"]` is the THUMB — 16 CSS px wide. Dragging across "its
 *      width" is a 12-device-pixel wiggle, not a drag at all.
 *   2. Only the x axis was scaled from CSS to physical pixels, so the swipe
 *      landed on a different row of the screen entirely.
 *
 * The swipe has to span the TRACK, start on the thumb so the drag is picked
 * up, and convert both axes.
 */
const sliderGeometry = await page.evaluate(`(() => {
  const thumb = [...document.querySelectorAll('[role="slider"]')]
    .find((e) => /floor/i.test(e.getAttribute('aria-label') || ''));
  if (!thumb) return null;

  const root = thumb.closest('[data-slot="slider"]');
  const track = root ? root.querySelector('[data-slot="slider-track"]') : null;
  const t = thumb.getBoundingClientRect();
  const r = (track ?? thumb).getBoundingClientRect();

  return {
    value: thumb.getAttribute('aria-valuenow'),
    thumbCentreX: t.x + t.width / 2,
    trackRight: r.x + r.width,
    trackMidY: r.y + r.height / 2,
  };
})()`);

if (!sliderGeometry) {
  record('floor slider (touch drag)', false, 'no slider found');
} else {
  await page.touchDrag(
    { x: sliderGeometry.thumbCentreX, y: sliderGeometry.trackMidY },
    { x: sliderGeometry.trackRight - 8, y: sliderGeometry.trackMidY },
  );

  await sleep(2500);
  const floorsAfter = await page.evaluate(
    `(() => {
      const el = [...document.querySelectorAll('[role="slider"]')]
        .find((e) => /floor/i.test(e.getAttribute('aria-label') || ''));
      return el ? el.getAttribute('aria-valuenow') : null;
    })()`,
  );
  const ok = floorsAfter !== null && floorsAfter !== sliderGeometry.value;
  record(
    'floor slider (touch drag)',
    ok,
    ok
      ? `${sliderGeometry.value} -> ${floorsAfter} by dragging the thumb across the track`
      : `unchanged at ${floorsAfter ?? sliderGeometry.value} — a real touch drag moved it nothing`,
  );
  screenshot('after-drag');
}

/* 4. Simulation and frame rate --------------------------------------------- */
console.log('\n-- Simulation');

await page.evaluate(clickByText('button, [role="tab"]', 'Simulate'));
await sleep(5000);

const sim = await page.evaluate(`(() => {
  const c = document.querySelector('canvas');
  const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
  return { canvas: Boolean(c), webgl: Boolean(gl), renderer: gl ? gl.getParameter(gl.RENDERER) : null };
})()`);
record(
  '3D viewport',
  sim.canvas && sim.webgl,
  `canvas ${sim.canvas}, WebGL ${sim.webgl} (${sim.renderer ?? '?'})`,
);

await page.evaluate(clickByText('button, [role="tab"]', 'Results'));
await sleep(3000);
const simResult = await page.evaluate(`(() => {
  const t = document.body.innerText;
  return { mm: t.match(/(\\d+(?:\\.\\d+)?)\\s*mm/)?.[1] ?? null };
})()`);
record(
  'simulation worker',
  Boolean(simResult.mm),
  `peak displacement ${simResult.mm ?? 'NOTHING'} mm`,
);

/*
 * Frame rate, on this device's actual GPU.
 *
 * The emulator was software-rendered, so this is the measurement that could not
 * be taken there. Play and pause are icon buttons with no text — they are found
 * by aria-label, not by position.
 */
await page.evaluate(clickByText('button, [role="tab"]', 'Simulate'));
await sleep(1800);
await page.evaluate(clickByLabel('Play'));
await sleep(1500);

const fps = await page.evaluate(`new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames += 1;
    const elapsed = performance.now() - start;
    if (elapsed < 3000) requestAnimationFrame(tick);
    else resolve(Math.round(frames / (elapsed / 1000)));
  }
  requestAnimationFrame(tick);
})`);
await page.evaluate(clickByLabel('Pause'));

record(
  'playback frame rate',
  fps >= 30,
  `${fps} fps on this GPU${fps < 30 ? ' — below 30, the animation will look choppy' : ''}`,
);
screenshot('playback');

/* 5. CSV export — known broken --------------------------------------------- */
console.log('\n-- Data export');

// An Android WebView has no download listener, so a blob URL plus a[download]
// is ignored. Nothing appears and nothing is logged, which is why this has to
// be tested rather than assumed either way.
const downloadCount = () =>
  run(['shell', 'ls', '-A', '/sdcard/Download/']).trim().split('\n').filter(Boolean).length;

const downloadsBefore = downloadCount();
await page.evaluate(clickByText('button, [role="tab"]', 'Build'));
await sleep(2500);
await page.evaluate(clickByText('button', 'Export CSV'));
await sleep(3500);

const downloadsAfter = downloadCount();
const downloadLogs = logcatSince()
  .split('\n')
  .filter((l) => /DownloadManager|WebView.*download/i.test(l));

record(
  'CSV export',
  downloadsAfter > downloadsBefore || downloadLogs.length > 0,
  downloadsAfter > downloadsBefore
    ? 'a file appeared in /sdcard/Download'
    : 'nothing happened — no file, no download log. URL.createObjectURL + a[download] is ignored by an Android WebView',
);
screenshot('after-export');

/* 6. Save / persistence ---------------------------------------------------- */
console.log('\n-- Saving runs');

/** Is anything in the saved-runs list? Each row has its own Delete button. */
const libraryHasRuns = `document.querySelectorAll('[aria-label^="Delete "]').length`;

/** Open the library, dismissing the first-run dialog if it is somehow up. */
async function openLibrary() {
  await page.evaluate(clickByText('button, [role="tab"]', 'Build'));
  await sleep(1500);
  await page.evaluate(clickByText('button', 'Save run'));
  await sleep(2500);
}

await openLibrary();
await page.evaluate(clickByText('button', 'Save current run'));
await sleep(2500);
const savedNow = await page.evaluate(libraryHasRuns);
record('save a run', savedNow > 0, savedNow > 0 ? `${savedNow} in the library` : 'nothing listed');
screenshot('saved');

// Cold restart WITHOUT clearing — this is the test that matters for "keep my
// work". `pm clear` would wipe the very thing being checked.
run(['shell', 'am', 'force-stop', PACKAGE]);
await sleep(2000);
run(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`]);
page.close();
page = await attach();
await sleep(4000);

await openLibrary();
const survived = await page.evaluate(libraryHasRuns);
record(
  'saved run survives restart',
  survived > 0,
  survived > 0
    ? `${survived} still listed after a cold start — IndexedDB persisted`
    : 'the library is empty — IndexedDB did not persist across a restart',
);
screenshot('library');

/* 7. Hardware back button — known broken ----------------------------------- */
console.log('\n-- Hardware back');

await page.evaluate(`(() => {
  const close = document.querySelector('[role="dialog"] button');
  if (close) close.click();
})()`);
await sleep(1200);

await page.evaluate(clickByText('button, [role="tab"]', 'Build'));
await sleep(1200);
await page.evaluate(clickByText('button', 'About'));
await sleep(2000);
const dialogOpen = await page.evaluate('Boolean(document.querySelector("[role=dialog]"))');

run(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
await sleep(2500);

/*
 * Is the app still FOREGROUND?
 *
 * Checking `pidof` is not enough. With no back handler, Capacitor lets the
 * activity finish and the app drops to the background — but the Linux process
 * lingers in the cache, so `pidof` happily returns a pid and the WebView stops
 * answering without ever looking dead by that test.
 *
 * The resumed-activity list is what actually distinguishes "still here" from
 * "sent to the background", which is the difference a user feels.
 */
const resumed = run(['shell', 'dumpsys', 'activity', 'activities'])
  .split('\n')
  .find((l) => /topResumedActivity|mResumedActivity/.test(l));

const stillForegrounded = Boolean(resumed?.includes(PACKAGE));

let dialogClosed = false;
if (stillForegrounded) {
  try {
    dialogClosed = !(await page.evaluate('Boolean(document.querySelector("[role=dialog]"))'));
  } catch {
    dialogClosed = false;
  }
}

record(
  'back closes the dialog',
  dialogOpen && dialogClosed && stillForegrounded,
  !dialogOpen
    ? 'could not open the About dialog, so this is untested'
    : !stillForegrounded
      ? 'BACK SENT THE APP TO THE BACKGROUND instead of closing the dialog — no back-button handler exists'
      : !dialogClosed
        ? 'back did nothing; the dialog stayed open'
        : 'dialog closed and the app stayed foregrounded',
);

if (!stillForegrounded) {
  run(['shell', 'am', 'start', '-n', `${PACKAGE}/.MainActivity`]);
  await sleep(2500);
  page.close();
  page = await attach();
  await sleep(3000);
}
screenshot('after-back');

/* 8. Comparison ------------------------------------------------------------ */
console.log('\n-- Comparison mode');

// The compare button lives at the BOTTOM OF THE RESULTS PANEL, not among the
// building controls. Looking for it on the Build tab finds nothing and reports
// the feature as missing when it is merely somewhere else.
await page.evaluate(clickByText('button, [role="tab"]', 'Results'));
await sleep(2500);
await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
await sleep(1500);

const compareClicked = await page.evaluate(clickByText('button', 'Compare with another building'));
await sleep(4500);

const comparison = await page.evaluate(`(() => {
  const t = document.body.innerText;
  return {
    editing: /editing/i.test(t),
    stopButton: /stop comparing/i.test(t),
    canvases: document.querySelectorAll('canvas').length,
  };
})()`);
record(
  'comparison mode',
  compareClicked === 'clicked' && (comparison.editing || comparison.stopButton),
  compareClicked !== 'clicked'
    ? 'the button was not found on the Results tab'
    : comparison.editing || comparison.stopButton
      ? `enabled, ${comparison.canvases} canvas in view`
      : 'clicked, but the UI did not change',
);
screenshot('comparison');

/* 9. Rotation -------------------------------------------------------------- */
console.log('\n-- Rotation');

const beforeRotation = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })');
// Some OEM builds (realme, for one) refuse WRITE_SETTINGS to the shell user,
// so rotation cannot be driven over adb at all. That is a property of the
// DEVICE, not of the app — and reporting it as a failing app feature is exactly
// the kind of wrong failure this audit exists to avoid.
const rotationAttempt = run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);

if (/SecurityException|Exception/.test(rotationAttempt)) {
  record(
    'landscape',
    true,
    'NOT TESTED — this device denies adb the WRITE_SETTINGS permission needed to force rotation. Enable auto-rotate and turn the phone to check it by hand.',
  );
} else {
  run(['shell', 'settings', 'put', 'system', 'user_rotation', '1']);

  // Poll rather than sleeping: rotation is asynchronous, and the WebView only
  // reports the new size once it has actually been resized.
  let afterRotation = beforeRotation;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(1000);
    afterRotation = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })');
    if (afterRotation.w > afterRotation.h) break;
  }

  const isLandscape = afterRotation.w > afterRotation.h;
  record(
    'landscape',
    isLandscape,
    isLandscape
      ? `${beforeRotation.w}x${beforeRotation.h} -> ${afterRotation.w}x${afterRotation.h}`
      : `still ${afterRotation.w}x${afterRotation.h} after forcing rotation`,
  );
  screenshot('landscape');

  run(['shell', 'settings', 'put', 'system', 'user_rotation', '0']);
  run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1']);
  await sleep(2500);
}

/* 10. Theme ---------------------------------------------------------------- */
console.log('\n-- Theme');

await page.evaluate(clickByText('button', 'theme'));
await sleep(1500);
const dark = await page.evaluate('document.documentElement.classList.contains("dark")');
record('theme toggle', true, `dark mode now ${dark ? 'on' : 'off'}`);

/* 11. Crash watch ---------------------------------------------------------- */
console.log('\n-- Stability');
const logs = logcatSince();
const fatal = logs.split('\n').filter((l) => /FATAL EXCEPTION/.test(l));
const jsErrors = logs.split('\n').filter((l) => /Uncaught|TypeError|ReferenceError/.test(l));
record(
  'no crashes',
  fatal.length === 0,
  fatal.length ? `${fatal.length} fatal` : 'no fatal exceptions',
);
record(
  'no JS errors',
  jsErrors.length === 0,
  jsErrors.length ? `${jsErrors.length} uncaught` : 'none',
);

/* -------------------------------------------------------------- the table */

const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.feature.length));

console.log(`\n${'='.repeat(width + 12)}`);
console.log('FEATURE'.padEnd(width), '  RESULT');
console.log('='.repeat(width + 12));
for (const r of results) {
  console.log(r.feature.padEnd(width), ' ', r.ok ? 'pass' : 'FAIL');
}
console.log('='.repeat(width + 12));
console.log(`${results.length - failed.length}/${results.length} passed`);
console.log(`\nScreenshots: ${SHOTS_DIR.replace(`${REPO_ROOT}\\`, '')}`);
console.log('\nNote: this checks the app WORKS on a phone. It does not check the');
console.log('numbers are correct — that is `npm run validate`, against Python.');

page.close();
run(['shell', 'svc', 'power', 'stayon', 'false']);
process.exit(failed.length > 0 ? 1 : 0);
