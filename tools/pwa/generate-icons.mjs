/**
 * Generate the PWA icon set from code.
 * =========================================================================
 * WHY THIS EXISTS, AND WHY IT IS HAND-ROLLED
 * -------------------------------------------------------------------------
 * The obvious move is `@vite-pwa/assets-generator` or `sharp`: both rasterise
 * an SVG, and both are a few hundred megabytes of native binary to install.
 * For a five-shape icon that is the wrong trade in a repository a student team
 * is meant to maintain — `npm install` should stay small, and changing the
 * brand colour should be a two-character edit, not a reinstall.
 *
 * So this draws the icon directly and encodes the PNG with `node:zlib`, which
 * is built in. Nothing to install, nothing to keep up to date, and the whole
 * drawing is readable in one screen.
 *
 * WHAT IT IS NOT
 * -------------------------------------------------------------------------
 * This is not an SVG renderer. It draws filled polygons and thick polylines —
 * exactly the primitives a launcher icon wants — and supersamples 4x to
 * antialias. It cannot follow an arbitrary path, and it is not trying to. The
 * artwork below is a redraw of the mark in `TopBar.tsx`, not a copy of it.
 *
 * If the mark ever needs to change shape, change the geometry in ARTWORK
 * below. Everything else here is plumbing.
 *
 * Usage
 * -----
 *     node tools/pwa/generate-icons.mjs
 *
 * Writes into apps/web/public/. Idempotent — running it twice produces
 * byte-identical files.
 * =========================================================================
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(REPO_ROOT, 'apps', 'web', 'public');

/** Supersampling factor. 4 is enough to smooth edges that stay still at 512px. */
const SS = 4;

/* --------------------------------------------------------------- the artwork */

/**
 * Brand colour, matching `--primary` in `src/styles/tokens.css` (light).
 *
 * Deliberately the light-theme green, not the dark-theme one: a launcher icon
 * sits on wallpaper the user chose, and #4ade80 on white wallpaper is very
 * hard to see. #15803d holds contrast on both light and dark backgrounds.
 */
const BRAND = [0x15, 0x80, 0x3d];
const MARK = [0xff, 0xff, 0xff];

/**
 * The mark, in 0..1 coordinates. A stepped skyline over a ground wave — the
 * same idea as the in-app logo, restated as simple shapes so it survives
 * being rendered 192px wide on a phone home screen.
 *
 * Proportions are chosen for legibility at 32px, not elegance: below about
 * 40px the wave disappears, so it is drawn thicker than looks right large.
 */
const ARTWORK = {
  /** Three building blocks, tallest in the middle. */
  buildings: [
    { x0: 0.18, x1: 0.38, y0: 0.42, y1: 0.72 },
    { x0: 0.4, x1: 0.6, y0: 0.26, y1: 0.72 },
    { x0: 0.62, x1: 0.82, y0: 0.48, y1: 0.72 },
  ],
  /** The ground the buildings stand on. */
  ground: { x0: 0.12, x1: 0.88, y0: 0.72, y1: 0.755 },
  /** A wave under the ground line — the earthquake. */
  wave: { x0: 0.12, x1: 0.88, y: 0.855, amplitude: 0.045, cycles: 2.25, width: 0.05 },
};

/* ------------------------------------------------------------------ canvas */

class Canvas {
  constructor(size) {
    this.size = size;
    // Straight (non-premultiplied) RGBA.
    this.data = new Uint8Array(size * size * 4);
  }

  /** Source-over blend of one pixel. `alpha` is 0..1. */
  blend(x, y, [r, g, b], alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const d = this.data;
    const dstA = d[i + 3] / 255;
    const outA = alpha + dstA * (1 - alpha);
    if (outA <= 0) return;

    for (let c = 0; c < 3; c += 1) {
      const src = [r, g, b][c];
      const dst = d[i + c];
      d[i + c] = Math.round((src * alpha + dst * dstA * (1 - alpha)) / outA);
    }
    d[i + 3] = Math.round(outA * 255);
  }

  /**
   * Fill an axis-aligned rectangle, antialiased on every edge.
   *
   * Edges get a fractional coverage rather than a hard cut, because the
   * downsampler will not save a staircase that is already jagged.
   */
  fillRect(x0, y0, x1, y1, colour, alpha = 1) {
    const px0 = Math.max(0, Math.floor(x0));
    const py0 = Math.max(0, Math.floor(y0));
    const px1 = Math.min(this.size - 1, Math.ceil(x1));
    const py1 = Math.min(this.size - 1, Math.ceil(y1));

    for (let y = py0; y <= py1; y += 1) {
      // Vertical coverage of this pixel by [y0, y1).
      const cy = Math.min(y + 1, y1) - Math.max(y, y0);
      if (cy <= 0) continue;
      for (let x = px0; x <= px1; x += 1) {
        const cx = Math.min(x + 1, x1) - Math.max(x, x0);
        if (cx <= 0) continue;
        this.blend(x, y, colour, Math.min(1, cx) * Math.min(1, cy) * alpha);
      }
    }
  }

  /** Fill a convex polygon by scanline. */
  fillPolygon(points, colour, alpha = 1) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of points) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.size - 1, Math.ceil(maxY));

    for (let y = yStart; y <= yEnd; y += 1) {
      // Sample the middle of the pixel row for a stable edge.
      const sy = y + 0.5;
      const crossings = [];

      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if (y1 === y2) continue;
        if (sy < Math.min(y1, y2) || sy >= Math.max(y1, y2)) continue;
        crossings.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
      }

      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        this.fillRect(crossings[i], sy - 0.5, crossings[i + 1], sy + 0.5, colour, alpha);
      }
    }
  }

  /** Stroke a polyline with round joins and caps. */
  strokePolyline(points, width, colour, alpha = 1) {
    const half = width / 2;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;

      // The segment as a rectangle, perpendicular offsets at each end.
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      this.fillPolygon(
        [
          [x0 + nx, y0 + ny],
          [x1 + nx, y1 + ny],
          [x1 - nx, y1 - ny],
          [x0 - nx, y0 - ny],
        ],
        colour,
        alpha,
      );
    }

    // Round the joints and caps, or a thick polyline shows visible notches.
    for (const [x, y] of points) {
      this.fillCircle(x, y, half, colour, alpha);
    }
  }

  fillCircle(cx, cy, radius, colour, alpha = 1) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.size - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.size - 1, Math.ceil(cy + radius));
    const r2 = radius * radius;

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        // One pixel of feather so the downsampler has something to average.
        const edge = Math.min(1, radius - Math.sqrt(d2) + 0.5);
        this.blend(x, y, colour, alpha * edge);
      }
    }
  }

  /**
   * Rounded rectangle, the standard launcher-icon silhouette.
   *
   * Android's "any" icon type. Maskable icons use a full bleed instead — see
   * `renderIcon`.
   */
  fillRoundedRect(x0, y0, x1, y1, radius, colour) {
    this.fillRect(x0 + radius, y0, x1 - radius, y1, colour);
    this.fillRect(x0, y0 + radius, x1, y1 - radius, colour);

    for (const [cx, cy] of [
      [x0 + radius, y0 + radius],
      [x1 - radius, y0 + radius],
      [x0 + radius, y1 - radius],
      [x1 - radius, y1 - radius],
    ]) {
      this.fillCircle(cx, cy, radius, colour);
    }
  }

  /** Box-filter down to `size`. This is where the antialiasing happens. */
  downsample(factor) {
    // The OUTPUT is one `factor`th of the source on each side. Indexing the
    // output with source dimensions does not throw and does not look obviously
    // wrong in a file listing — it produces a sheared slice of the image that
    // still decodes cleanly.
    const outSize = this.size / factor;
    const out = new Uint8Array(outSize * outSize * 4);
    const area = factor * factor;

    for (let y = 0; y < outSize; y += 1) {
      for (let x = 0; x < outSize; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < factor; dy += 1) {
          for (let dx = 0; dx < factor; dx += 1) {
            const i = ((y * factor + dy) * this.size + (x * factor + dx)) * 4;
            // Weight colour by alpha so transparent pixels do not drag the
            // edges toward black.
            const sa = this.data[i + 3] / 255;
            r += this.data[i] * sa;
            g += this.data[i + 1] * sa;
            b += this.data[i + 2] * sa;
            a += sa;
          }
        }
        const o = (y * outSize + x) * 4;
        const meanA = a / area;
        if (meanA > 0) {
          out[o] = Math.round(r / a);
          out[o + 1] = Math.round(g / a);
          out[o + 2] = Math.round(b / a);
        }
        out[o + 3] = Math.round(meanA * 255);
      }
    }

    return { size: outSize, data: out };
  }
}

/* -------------------------------------------------------------- PNG encoder */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode straight RGBA to PNG.
 *
 * Only what a launcher icon needs: 8-bit, colour type 6 (truecolour with
 * alpha), no interlacing, filter type 0 on every scanline. Filter 0 costs a
 * little size and saves a great deal of code, and these files are a few KB.
 */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    // subarray, not a byteOffset into `.buffer` — the latter silently ignores
    // the view's own offset.
    Buffer.from(rgba.subarray(y * stride, y * stride + stride)).copy(raw, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ drawing */

/**
 * Draw the mark into a canvas of `size` device pixels.
 *
 * `safeScale` shrinks the artwork toward the centre. Maskable icons need this:
 * Android crops a maskable icon to whatever shape the launcher uses, and
 * anything outside the central 80% can be cut off entirely.
 */
function renderIcon(size, { rounded = true, safeScale = 1 } = {}) {
  // The canvas is `size` device pixels times the supersampling factor. Getting
  // this wrong in either direction produces an icon that is mostly empty or
  // mostly clipped, and both look plausible in a file listing.
  const px = size * SS;
  const canvas = new Canvas(px);

  // Background, filling the whole canvas.
  if (rounded) {
    canvas.fillRoundedRect(0, 0, px, px, px * 0.22, BRAND);
  } else {
    canvas.fillRect(0, 0, px, px, BRAND);
  }

  // Map artwork coordinates (0..1) into canvas pixels. With safeScale = 1 the
  // artwork spans the canvas edge to edge; below 1 it is inset and centred,
  // which is what a maskable icon needs to survive the launcher's crop.
  const scale = px * safeScale;
  const offset = (px - scale) / 2;
  const X = (v) => offset + v * scale;
  const Y = (v) => offset + v * scale;

  // Skyline.
  for (const b of ARTWORK.buildings) {
    canvas.fillRect(X(b.x0), Y(b.y0), X(b.x1), Y(b.y1), MARK);
  }

  // Ground.
  canvas.fillRect(
    X(ARTWORK.ground.x0),
    Y(ARTWORK.ground.y0),
    X(ARTWORK.ground.x1),
    Y(ARTWORK.ground.y1),
    MARK,
  );

  // Wave. Sampled finely enough that the curve is smooth, not faceted.
  const { x0, x1, y, amplitude, cycles, width } = ARTWORK.wave;
  const steps = 96;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const v = x0 + (x1 - x0) * t;
    points.push([X(v), Y(y + Math.sin(t * cycles * Math.PI * 2) * amplitude)]);
  }
  canvas.strokePolyline(points, width * scale, MARK);

  return canvas.downsample(SS);
}

/* --------------------------------------------------------------------- main */

/**
 * The icon set.
 *
 * `maskable` icons need `purpose: "maskable"` in the manifest, the artwork
 * inset to survive the launcher's crop, AND a full-bleed square background.
 * Giving a maskable icon rounded corners of its own double-rounds it: the
 * launcher mask clips its own shape, and the icon's corners cut away again,
 * leaving green where there should be background.
 *
 * `any` icons carry the rounded square, because nothing crops them.
 */
const TARGETS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  // Android adaptive icon: full bleed, artwork inside the 80% safe zone.
  {
    file: 'icon-maskable-512.png',
    size: 512,
    purpose: 'maskable',
    safeScale: 0.72,
    rounded: false,
  },
  { file: 'favicon-32.png', size: 32, purpose: 'any' },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const { size, data } = renderIcon(target.size, {
    rounded: target.rounded !== false,
    safeScale: target.safeScale ?? 1,
  });
  const png = encodePng(size, data);
  writeFileSync(join(OUT_DIR, target.file), png);
  console.log(
    `  ${target.file.padEnd(24)} ${String(size).padStart(3)}px  ${String(png.length).padStart(6)} bytes  (${target.purpose})`,
  );
}

console.log(`\nWrote ${TARGETS.length} icons to apps/web/public/`);
