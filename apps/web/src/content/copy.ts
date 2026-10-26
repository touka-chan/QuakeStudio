import { DEFAULT_COPY } from './copyDefaults';
import { copySchema } from './schema';
import { readStoredContent } from './storage';

const saved = readStoredContent()?.copy;
const parsed = saved === undefined ? null : copySchema.safeParse(saved);

/** The effective copy: compiled defaults with saved overrides on top. */
export const COPY: Record<string, string> = {
  ...DEFAULT_COPY,
  ...(parsed?.success ? parsed.data : {}),
};

type Vars = Record<string, string | number>;

/**
 * Read a copy string, replacing {placeholders}.
 *
 * A key that is not in the document falls back to the caller's fallback and
 * then to the key itself. That keeps a newly added control readable in a stale
 * saved document instead of rendering an empty label.
 */
export function t(key: string, vars?: Vars, fallback?: string): string {
  const value = COPY[key] ?? fallback ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export { DEFAULT_COPY };
