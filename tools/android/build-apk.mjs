/**
 * Build the Android APK.
 * =========================================================================
 * This script exists because two requirements are invisible until Gradle fails
 * with something unhelpful:
 *
 *   1. JDK 21 or newer. Capacitor 8 compiles `sourceCompatibility 21`. The JDK
 *      that ships inside Android Studio's bundled JBR is usually fine, but a
 *      developer whose `JAVA_HOME` points at a JDK 17 gets:
 *
 *          error: invalid source release: 21
 *
 *      which reads like a Gradle problem and is not one. This finds a suitable
 *      JDK instead of making each person discover that for themselves.
 *
 *   2. An Android SDK, located via ANDROID_HOME / ANDROID_SDK_ROOT or the
 *      standard per-user install path. Gradle will not find it on its own.
 *
 * Usage
 * -----
 *     node tools/android/build-apk.mjs              # debug APK
 *     node tools/android/build-apk.mjs --release    # unsigned release APK
 *     node tools/android/build-apk.mjs --sync       # re-copy web assets first
 *
 * The debug APK is signed with the auto-generated debug keystore and installs
 * on any phone with "unknown sources" enabled, which is what a sideload needs.
 * A release APK needs a real keystore — see docs/android.md.
 * =========================================================================
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANDROID_DIR = join(REPO_ROOT, 'apps', 'web', 'android');

const args = process.argv.slice(2);
const release = args.includes('--release');
const sync = args.includes('--sync');

/* ------------------------------------------------------------------ JDK 21+ */

/**
 * The major version of the JDK in `binDir`, or 0 if it cannot be read.
 *
 * Uses `java -version` rather than parsing the `release` file: that file's
 * format varies between vendors (`21.0.11`, `1.8.0_392`), and this is exactly
 * what Gradle will run, so it answers the real question.
 */
function javaMajor(binDir) {
  if (!existsSync(join(binDir, 'bin'))) return 0;

  const exe = platform() === 'win32' ? 'java.exe' : 'java';
  const result = spawnSync(join(binDir, 'bin', exe), ['-version'], { encoding: 'utf8' });

  // `java -version` writes to stderr; some older vendors wrote to stdout.
  const output = `${result.stderr ?? ''}${result.stdout ?? ''}`;
  const match = output.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return 0;

  const major = Number(match[1]);
  // 1.8 is written as "1.8" — everything that old is below 21 anyway.
  return major === 1 ? Number(match[2] ?? 0) : major;
}

/**
 * Candidate JDK homes.
 *
 * JAVA_HOME first — if the developer set it deliberately, respect that. Then
 * every JetBrains Runtime under ~/.jdks, which is where Android Studio and
 * IntelliJ install theirs.
 */
function candidateJdks() {
  const list = [];
  if (process.env.JAVA_HOME) list.push(process.env.JAVA_HOME);

  const jdks = join(homedir(), '.jdks');
  if (existsSync(jdks)) {
    for (const name of readdirSync(jdks)) list.push(join(jdks, name));
  }

  if (platform() === 'win32') {
    list.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  } else if (platform() === 'darwin') {
    list.push('/Applications/Android Studio.app/Contents/jbr');
  } else {
    list.push('/opt/android-studio/jbr');
  }

  return [...new Set(list)];
}

/**
 * The LOWEST major version at or above 21, not the newest.
 *
 * This is the whole trick, and getting it wrong fails in a way that looks like
 * a project bug. Android Gradle Plugin compiles against a `jlink`ed JDK image,
 * and it cannot yet process the module format of JDK 26 — a JDK 26 build dies
 * with:
 *
 *     Failed to transform core-for-system-modules.jar to match attributes
 *       {artifactType=_internal_android_jdk_image}
 *
 * which mentions nothing about the JDK version. Meanwhile JDK 21, which is what
 * Capacitor 8 targets, builds cleanly. So: take the oldest thing that works.
 */
function findJdk() {
  const candidates = candidateJdks();

  const usable = candidates
    .map((dir) => ({ dir, major: javaMajor(dir) }))
    .filter((jdk) => jdk.major >= 21);

  if (usable.length === 0) {
    console.error('\nerror: no JDK 21 or newer found.\n');
    console.error('Capacitor 8 compiles with sourceCompatibility 21, so a JDK 21+ is required.');
    console.error(`Looked in:\n  ${candidates.join('\n  ')}\n`);
    console.error('Android Studio ships a suitable one at:');
    console.error('  C:\\Program Files\\Android\\Android Studio\\jbr\n');
    process.exit(1);
  }

  const fromEnv = usable.find((jdk) => jdk.dir === process.env.JAVA_HOME);
  const chosen =
    fromEnv ?? usable.reduce((lowest, jdk) => (jdk.major < lowest.major ? jdk : lowest));

  if (chosen.major >= 26) {
    console.warn(
      `\nwarning: only JDK ${chosen.major} was found. Android Gradle Plugin does not` +
        '\n         yet handle its module format, and the build will probably fail in' +
        '\n         jlink. Install a JDK 21 (Android Studio bundles one).',
    );
  }

  return chosen;
}

/* -------------------------------------------------------------- Android SDK */

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    platform() === 'win32'
      ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
      : join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'), // macOS
    join(homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const dir of [...new Set(candidates)]) {
    if (existsSync(dir)) return dir;
  }

  console.error('\nerror: no Android SDK found.\n');
  console.error(`Looked in:\n  ${[...new Set(candidates)].join('\n  ')}\n`);
  console.error('Install Android Studio, or set ANDROID_HOME to an existing SDK.');
  process.exit(1);
}

/* ------------------------------------------------------------------- run it */

const jdk = findJdk();
const sdk = findAndroidSdk();

console.log(`JDK   ${jdk.major}  ${jdk.dir}`);
console.log(`SDK        ${sdk}`);

// Gradle reads the SDK path from here and will not discover it itself.
writeFileSync(join(ANDROID_DIR, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
mkdirSync(ANDROID_DIR, { recursive: true });

if (sync) {
  // Copy the latest web build into the APK. Needed after any change to the
  // app, and harmless otherwise.
  const result = spawnSync('npx', ['cap', 'sync', 'android'], {
    cwd: join(REPO_ROOT, 'apps', 'web'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const task = release ? 'assembleRelease' : 'assembleDebug';

/*
 * Windows needs a shell to execute a `.bat`.
 *
 * Node 20 hardened `child_process` so batch files are no longer spawned
 * directly — `spawn('gradlew.bat')` now fails rather than working. Without
 * this the build "fails" instantly having run no Gradle at all, which is a
 * genuinely confusing way to lose twenty minutes.
 */
const isWindows = platform() === 'win32';
const command = isWindows ? 'gradlew.bat' : './gradlew';

console.log(`\n> ${task}\n`);

const build = spawnSync(command, [task, '--no-daemon'], {
  cwd: ANDROID_DIR,
  stdio: 'inherit',
  // `shell: true` puts cmd.exe in front of the command, which is what lets a
  // `.bat` run at all. No `/c` argument — cmd is already the interpreter, and
  // passing one makes Gradle read "/c" as the task name.
  shell: isWindows,
  env: {
    ...process.env,
    JAVA_HOME: jdk.dir,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
  },
});

if (build.status !== 0) {
  console.error(`\nBuild failed. See the Gradle output above.`);
  process.exit(build.status ?? 1);
}

const apk = join(
  ANDROID_DIR,
  'app',
  'build',
  'outputs',
  'apk',
  release ? 'release' : 'debug',
  release ? 'app-release-unsigned.apk' : 'app-debug.apk',
);

console.log('\nAPK built:\n  ' + apk.replace(REPO_ROOT + '\\', ''));
if (!release) {
  console.log(
    '\nSigned with the debug keystore. Copy it to a phone and allow\n' +
      '"install from unknown sources" to sideload it.',
  );
} else {
  console.log('\nUnsigned. Sign it with a real keystore before distributing — see docs/android.md');
}
