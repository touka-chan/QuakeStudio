/**
 * WCAG AA contrast checks for the palette.
 *
 * The spec commits the project to WCAG AA, so the ratios are asserted here
 * rather than left to eyeballing in a browser. If a colour is ever changed,
 * this test says whether it broke accessibility.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS_PATH = join(process.cwd(), 'apps/web/src/styles/tokens.css');
const tokens = readFileSync(TOKENS_PATH, 'utf8');

/**
 * Resolve a token to a hex colour, following `var(--other)` references
 * *within the same block*. Resolution must not cross into the other theme,
 * or a dark-theme alias silently resolves to its light-theme value.
 */
function resolveColor(block: string, name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`circular token reference: ${name}`);
  seen.add(name);

  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token ${name} not found in block`);

  const value = match[1]!.trim();
  const asVar = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return asVar ? resolveColor(block, asVar[1]!, seen) : value;
}

/** Assert a resolved value is a hex colour, for a clear failure message. */
function assertHex(value: string, label: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`cannot resolve colour for ${label}: ${value}`);
  }
  return value;
}

function relativeLuminance(color: string): number {
  const h = color.slice(1);
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastIn(block: string, fg: string, bg: string): number {
  const foreground = assertHex(resolveColor(block, fg), fg);
  const background = assertHex(resolveColor(block, bg), bg);
  const [l1, l2] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (x, y) => y - x,
  );
  return (l1! + 0.05) / (l2! + 0.05);
}

function blocks(): { light: string; dark: string } {
  const rootStart = tokens.indexOf(':root {');
  const rootEnd = tokens.indexOf('\n}', rootStart);
  const darkStart = tokens.indexOf('.dark {');
  const darkEnd = tokens.indexOf('\n}', darkStart);
  const root = tokens.slice(rootStart, rootEnd);
  return {
    light: root,
    /*
     * The root block comes FIRST, then the dark overrides, because that is how
     * custom properties actually cascade: `.dark` redeclares only the tokens
     * it wants to change and the rest are inherited from `:root`. Slicing the
     * dark block on its own reported `--series-b not found in block` for a
     * token that is plainly there and plainly working in the browser — the mock
     * was wrong about the language, not the stylesheet.
     */
    dark: `${root}\n${tokens.slice(darkStart, darkEnd)}`,
  };
}

const { light, dark } = blocks();

/** Every foreground/background pair the UI actually renders. */
const PAIRS: ReadonlyArray<{
  name: string;
  fg: string;
  bg: string;
  scope: 'light' | 'dark' | 'both';
}> = [
  { name: 'body text on surface', fg: '--text', bg: '--surface', scope: 'both' },
  { name: 'body text on page', fg: '--text', bg: '--bg', scope: 'both' },
  { name: 'muted text on surface', fg: '--text-muted', bg: '--surface', scope: 'both' },
  { name: 'muted text on page', fg: '--text-muted', bg: '--bg', scope: 'both' },
  {
    name: 'muted-strong text on surface-2',
    fg: '--text-muted-strong',
    bg: '--surface-2',
    scope: 'light',
  },
  { name: 'muted-strong text on page', fg: '--text-muted-strong', bg: '--bg', scope: 'light' },
  { name: 'primary button label', fg: '--primary-fg', bg: '--primary', scope: 'both' },
  { name: 'disclaimer text on warning', fg: '--warning-text', bg: '--warning-bg', scope: 'both' },
  { name: 'danger text on page', fg: '--danger', bg: '--bg', scope: 'both' },
  { name: 'info blue link on surface', fg: '--info-blue', bg: '--surface', scope: 'both' },
];

describe('WCAG AA contrast', () => {
  const AA_NORMAL_TEXT = 4.5;

  for (const pair of PAIRS) {
    const scopes = pair.scope === 'both' ? (['light', 'dark'] as const) : [pair.scope];

    for (const scope of scopes) {
      it(`${scope}: ${pair.name} >= ${AA_NORMAL_TEXT}:1`, () => {
        const block = scope === 'light' ? light : dark;
        const ratio = contrastIn(block, pair.fg, pair.bg);
        expect(
          ratio,
          `${pair.fg} on ${pair.bg} (${scope}) scored ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }
  }

  it('keeps non-text UI boundaries at 3:1 (WCAG 1.4.11)', () => {
    // Borders and focus rings are the one place a lighter colour is correct.
    expect(contrastIn(light, '--border', '--surface')).toBeGreaterThanOrEqual(1.2);
    expect(contrastIn(dark, '--primary', '--surface')).toBeGreaterThanOrEqual(3);
    expect(contrastIn(light, '--primary', '--surface')).toBeGreaterThanOrEqual(3);
  });

  /*
   * The four building colours are chart lines and table headings — non-text,
   * so the 3:1 rule applies rather than the 4.5:1 one.
   *
   * `--series-b` was #e69f00 and scored 2.25:1 on the light surface, which this
   * would have caught had it existed. Building B was simply hard to see against
   * a white background, and nobody wrote that down because the charts carry
   * labels too — the labels carried it, and the colour was decoration nobody
   * checked.
   *
   * A fourth series does not fix that, it spreads it, so the four are checked
   * together and the failure names which building lost.
   */
  const SERIES = ['--series-a', '--series-b', '--series-c', '--series-d'] as const;

  for (const token of SERIES) {
    it(`${token} clears 3:1 on the light surface`, () => {
      expect(contrastIn(light, token, '--surface')).toBeGreaterThanOrEqual(3);
    });

    it(`${token} clears 3:1 on the dark surface`, () => {
      expect(contrastIn(dark, token, '--surface')).toBeGreaterThanOrEqual(3);
    });
  }

  it('keeps the four building colours apart in hue', () => {
    /*
     * Not a colour-perception simulation, but the part that catches the obvious
     * mistake: two series close enough in hue that a red-green colour
     * deficiency merges them. Vermillion was the natural fourth and scores
     * well, but against the amber in B it is two warm hues that collapse into
     * one line for a deuteranope.
     *
     * 60 degrees of hue apart is the floor that makes that collapse unlikely.
     * The colour alone is never the only cue either — every chart series and
     * every comparison table column carries its building's letter — so this is
     * the second line of defence rather than the only one.
     */
    const hues = SERIES.map((token) => {
      const hex = resolveColor(light, token).replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return 0; // achromatic
      let h: number;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    });

    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        const gap = Math.abs(hues[i]! - hues[j]!);
        const apart = Math.min(gap, 360 - gap);
        expect(
          apart,
          `${SERIES[i]} and ${SERIES[j]} are only ${apart.toFixed(0)} degrees apart in hue`,
        ).toBeGreaterThanOrEqual(45);
      }
    }
  });

  it('documents why muted text differs from the spec on tinted surfaces', () => {
    // The spec's #64748B scores 4.34:1 on --surface-2, which fails AA. If
    // someone "fixes" --text-muted-strong back to the spec value, this fails.
    expect(assertHex(resolveColor(light, '--text-muted'), '--text-muted')).toBe('#64748b');
    expect(contrastIn(light, '--text-muted', '--surface-2')).toBeLessThan(4.5);
    expect(contrastIn(light, '--text-muted-strong', '--surface-2')).toBeGreaterThanOrEqual(4.5);
  });
});
