import { STORAGE_KEYS } from '@/config/engineeringAssumptions';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Read the stored preference. Defaults to 'system' when absent or invalid. */
export function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    // localStorage can be unavailable (private browsing, SSR, tests).
    return 'system';
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, preference);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
}

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light';
  return preference;
}

/**
 * Apply a theme to <html>.
 *
 * The matching inline script in index.html runs before first paint using the
 * same rules, so there is no flash of the wrong theme. Keep the two in sync.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}
