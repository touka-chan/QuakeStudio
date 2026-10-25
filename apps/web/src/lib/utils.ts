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

/**
 * Thousands-separated number, e.g. 3888.5 -> "3,888.5".
 *
 * Hand-rolled rather than `toLocaleString`, because the separator must not
 * change with the machine's locale: a thesis screenshot and a test assertion
 * should both see the same string. A trailing zero fraction is dropped, so
 * whole numbers do not read as suspiciously precise.
 */
export function formatGrouped(value: number, decimals = 1): string {
  const fixed = value.toFixed(decimals);
  const negative = fixed.startsWith('-');
  const [whole, fraction] = (negative ? fixed.slice(1) : fixed).split('.');
  const separated = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '−' : '';
  return fraction && Number(fraction) !== 0
    ? `${sign}${separated}.${fraction}`
    : `${sign}${separated}`;
}
