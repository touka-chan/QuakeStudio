import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a millimetre value for display, e.g. 31.84 -> "31.8".
 * Keeps student-facing readouts short and consistent.
 */
export function formatMm(mm: number, decimals = 1): string {
  return mm.toFixed(decimals);
}

/** Format a percentage value, e.g. 0.34 -> "0.34". */
export function formatPct(pct: number, decimals = 2): string {
  return pct.toFixed(decimals);
}
