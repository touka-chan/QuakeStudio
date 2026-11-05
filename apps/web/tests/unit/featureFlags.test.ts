import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_FEATURES } from '@/content/brandingDefaults';

/*
 * Every switch on the admin Features page must reach the simulator.
 *
 * The first version of that page offered seven capabilities, but three of them
 * were never read outside the admin: `compareEnabled`, `welcomeEnabled` and
 * `tourEnabled` could be switched off and the simulator still offered the
 * feature. The admin looked authoritative and the switch did nothing, which is
 * worse than not offering the switch at all.
 *
 * This test reads the capability keys from the admin page and insists every
 * key in the feature contract is read as `FEATURES.<key>` somewhere outside
 * `src/admin`. A new switch with no consumer fails here rather than in a
 * usability session.
 */

const SRC = join(process.cwd(), 'apps/web/src');
const ADMIN_FEATURES = join(SRC, 'admin/pages/AdminFeatures.tsx');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'admin') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

describe('admin feature switches', () => {
  const simulatorSource = sourceFiles(SRC)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  it('lists only capabilities that exist in the feature contract', () => {
    const admin = readFileSync(ADMIN_FEATURES, 'utf8');
    const keys = [...admin.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(DEFAULT_FEATURES, `${key} should exist in DEFAULT_FEATURES`).toHaveProperty(key);
    }
  });

  it('reads every feature key outside the admin workspace', () => {
    const missing = Object.keys(DEFAULT_FEATURES).filter(
      (key) => !simulatorSource.includes(`FEATURES.${key}`),
    );
    expect(missing, `feature keys with no simulator consumer: ${missing.join(', ')}`).toEqual([]);
  });
});
