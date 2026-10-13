import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/* ==========================================================================
   The PWA manifest.

   A manifest that is subtly wrong fails silently: the browser does not warn,
   the app still works in a browser tab, and the only symptom is that "Install"
   never appears. Nothing in the build or the test suite would notice. So the
   things a browser actually requires are asserted here instead.

   The icon check reads the real pixel dimensions out of each PNG's IHDR chunk.
   A manifest that claims 512x512 while the file is 192x192 still installs — the
   launcher just shows a blurry icon, on a phone, where nobody can file a bug.
   ========================================================================== */

const PUBLIC_DIR = join(process.cwd(), 'apps/web/public');
const INDEX_HTML = join(process.cwd(), 'apps/web/index.html');

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type Manifest = {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
};

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8')) as Manifest;
}

/** Width and height from a PNG's IHDR, without decoding the pixels. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  // 8-byte signature, then a 4-byte length, then "IHDR", then width/height.
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path} has no IHDR`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Alpha of one pixel, by inflating the IDAT and reading the scanline.
 *
 * Only handles filter type 0, which is all `tools/pwa/generate-icons.mjs`
 * emits. The filter byte is checked rather than assumed, so changing the
 * encoder to use real PNG filtering fails this loudly instead of quietly
 * returning a wrong pixel.
 *
 * A full PNG decoder is not warranted to check four corners.
 */
function pngPixelAlpha(path: string, x: number, y: number): number {
  const bytes = readFileSync(path);
  const { width } = pngSize(path);
  if (bytes[25] !== 6) throw new Error(`${path} is not RGBA`);

  // Concatenate every IDAT chunk.
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const rowStart = y * (stride + 1);

  if (raw[rowStart] !== 0) {
    throw new Error(
      `${path} uses PNG filter type ${raw[rowStart]}; this reader only handles filter 0`,
    );
  }

  return raw[rowStart + 1 + x * 4 + 3];
}

describe('the web app manifest', () => {
  it('is valid JSON with the fields a launcher needs', () => {
    const manifest = readManifest();

    expect(manifest.name.length).toBeGreaterThan(0);
    // The home screen truncates this. Chrome allows ~12 characters.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('does not overclaim what the app is', () => {
    /*
     * The description is the first thing a user reads when the install prompt
     * appears, and it is outside the app where the disclaimer cannot reach.
     * "Not a structural safety assessment" has to be in the description itself.
     */
    expect(readManifest().description.toLowerCase()).toContain(
      'not a structural safety assessment',
    );
  });

  it('declares an icon at each size the manifest claims', () => {
    for (const icon of readManifest().icons) {
      const [width, height] = icon.sizes.split('x').map(Number);

      const file = join(PUBLIC_DIR, icon.src.replace(/^\//, ''));
      expect(() => readFileSync(file), `${icon.src} is listed but missing`).not.toThrow();

      const actual = pngSize(file);
      expect(actual.width, `${icon.src} is not ${icon.sizes} wide`).toBe(width);
      expect(actual.height, `${icon.src} is not ${icon.sizes} tall`).toBe(height);
      expect(icon.type).toBe('image/png');
    }
  });

  it('ships a maskable icon whose corners are opaque', () => {
    const maskable = readManifest().icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable.length).toBeGreaterThan(0);

    for (const icon of maskable) {
      const file = join(PUBLIC_DIR, icon.src.replace(/^\//, ''));
      const size = pngSize(file).width;

      /*
       * A maskable icon with transparent corners gets double-rounded: the
       * launcher applies its own mask, and the icon's corners cut away again,
       * leaving green showing where there should be background.
       *
       * Checking the actual corner pixels is the only way to catch that. The
       * manifest can say `purpose: maskable` perfectly correctly while the
       * image underneath is a rounded square.
       */
      for (const [x, y] of [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ]) {
        expect(pngPixelAlpha(file, x, y), `${icon.src} corner ${x},${y} is transparent`).toBe(255);
      }
    }
  });

  it('ships no iOS-only assets', () => {
    /*
     * iOS install support is out of scope — Safari exposes no install API, so
     * the only route is a manual Share-menu action the page cannot perform.
     *
     * A stray `apple-touch-icon.png` would do nothing at all except confuse
     * whoever next reads the manifest and wonders why it is not listed.
     */
    expect(() => readFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'))).toThrow();
  });
});

describe('the document head', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('links the manifest', () => {
    expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
  });

  it('declares a theme colour for light AND dark', () => {
    /*
     * A single <meta name="theme-color"> gives a white status bar in dark
     * mode. The browser takes the first tag whose media query matches, so both
     * have to be present for the app's dark mode to look deliberate.
     */
    const matches = html.match(/<meta name="theme-color"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('(prefers-color-scheme: light)');
    expect(html).toContain('(prefers-color-scheme: dark)');
  });

  it('carries no iOS-only tags', () => {
    /*
     * iOS install support is out of scope, so none of these should be present.
     * Leaving them behind would be worse than removing them: they make the app
     * *look* installable on a platform where it is not, and no button ever
     * appears to explain why. Better to leave no trace of the promise.
     */
    expect(html).not.toContain('apple-mobile-web-app');
    expect(html).not.toContain('apple-touch-icon');
  });

  it('does not set viewport-fit=cover', () => {
    /*
     * That was added for iOS notches. Without the iOS target there is no
     * reason to extend the layout under a display cutout, and on Android it
     * can push content under the status bar.
     */
    expect(html).not.toContain('viewport-fit=cover');
  });
});
