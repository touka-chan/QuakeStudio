import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vitest runs from the repo root (where vitest.config.ts lives).
const TOKENS_PATH = join(process.cwd(), 'apps/web/src/styles/tokens.css');
const INDEX_HTML_PATH = join(process.cwd(), 'apps/web/index.html');

const tokens = readFileSync(TOKENS_PATH, 'utf8');

/** Every colour token the spec §5 defines, and that the app must always have. */
const REQUIRED_TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--text',
  '--text-muted',
  '--primary',
  '--primary-fg',
  '--accent-yellow',
  '--accent-yellow-text',
  '--info-blue',
  '--warning',
  '--danger',
  '--viewport-bg',
  '--series-a',
  '--series-b',
  '--series-c',
  '--series-ground',
  '--drift-1',
  '--drift-2',
  '--drift-3',
  '--drift-4',
  '--drift-5',
  '--drift-top',
  '--drift-1-side',
  '--drift-2-side',
  '--drift-3-side',
  '--drift-4-side',
  '--drift-5-side',
  '--ground-slab',
  '--grid-line',
  '--undeformed',
  '--shaking-arrow',
  '--selection',
];

describe('tokens.css', () => {
  it.each(REQUIRED_TOKENS)('defines %s', (token) => {
    expect(tokens).toContain(`${token}:`);
  });

  it('defines every token in both light and dark themes', () => {
    // Only the .dark block itself — not the shadcn alias :root that follows it.
    const darkStart = tokens.indexOf('.dark {');
    const darkEnd = tokens.indexOf('\n}', darkStart);
    const darkBlock = tokens.slice(darkStart, darkEnd);
    expect(darkEnd).toBeGreaterThan(darkStart);

    // Tokens deliberately identical in both themes. Hue carries meaning for
    // data, so it must not shift with the theme.
    const fixedAcrossThemes = REQUIRED_TOKENS.filter(
      (token) => token.startsWith('--drift-') || token.startsWith('--series-'),
    ).concat('--undeformed');

    // Tokens defined as var(--other-token): they follow the theme for free and
    // restating them in .dark would create two sources of truth.
    const derivedFromThemedToken = ['--selection'];

    for (const token of REQUIRED_TOKENS) {
      if (fixedAcrossThemes.includes(token) || derivedFromThemedToken.includes(token)) continue;
      expect(darkBlock, `${token} should have a dark variant`).toContain(`${token}:`);
    }
  });

  it('keeps the drift scale identical in both themes', () => {
    const darkStart = tokens.indexOf('.dark {');
    const darkEnd = tokens.indexOf('\n}', darkStart);
    const darkBlock = tokens.slice(darkStart, darkEnd);
    expect(darkBlock, 'drift colours must not be restated for dark').not.toMatch(/--drift-/);
  });

  it('keeps the drift scale hue order blue -> green -> yellow -> orange', () => {
    const order = ['--drift-1', '--drift-2', '--drift-3', '--drift-4', '--drift-5'];
    const positions = order.map((token) => tokens.indexOf(`${token}:`));
    expect(
      positions.every((p) => p >= 0),
      'all drift tokens present',
    ).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('maps shadcn names onto our tokens instead of duplicating hex values', () => {
    const aliasBlock = tokens.slice(tokens.indexOf('shadcn/ui compatibility layer'));
    expect(aliasBlock).toContain('--card: var(--surface)');
    expect(aliasBlock).toContain('--background: var(--bg)');
    expect(aliasBlock).toContain('--muted-foreground: var(--text-muted)');
    // A duplicated hex here would mean two sources of truth.
    expect(aliasBlock).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('ships the light and dark palettes from spec section 5', () => {
    expect(tokens).toContain('--bg: #f8fafc;');
    expect(tokens).toContain('--bg: #0b1220;');
    expect(tokens).toContain('--primary: #15803d;');
    expect(tokens).toContain('--primary: #4ade80;');
    expect(tokens).toContain('--accent-yellow: #ca8a04;');
    expect(tokens).toContain('--accent-yellow: #facc15;');
    expect(tokens).toContain('--info-blue: #0072b2;');
    expect(tokens).toContain('--info-blue: #56b4e9;');
  });

  it('uses the 8-point spacing scale and the specified radii', () => {
    expect(tokens).toContain('--space-1: 0.25rem');
    expect(tokens).toContain('--space-8: 2rem');
    expect(tokens).toContain('--radius: 8px');
    expect(tokens).toContain('--radius-card: 12px');
  });
});

describe('index.html', () => {
  const html = readFileSync(INDEX_HTML_PATH, 'utf8');

  it('sets the theme before first paint, so the page cannot flash', () => {
    // The script must appear before the stylesheet/module script is evaluated.
    const themeScriptIndex = html.indexOf('quakestudio.theme');
    const rootScriptIndex = html.indexOf('/src/main.tsx');

    expect(themeScriptIndex).toBeGreaterThan(-1);
    expect(rootScriptIndex).toBeGreaterThan(-1);
    expect(themeScriptIndex).toBeLessThan(rootScriptIndex);
    expect(html).toContain("classList.toggle('dark'");
  });

  it('uses the same storage key as the theme module', () => {
    expect(html).toContain('quakestudio.theme');
  });

  it('describes the app without implying structural safety', () => {
    expect(html.toLowerCase()).toContain('not a structural safety assessment');
  });
});
