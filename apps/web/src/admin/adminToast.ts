import toast from 'react-hot-toast';
import type { CSSProperties } from 'react';

/*
 * Toasts match the admin's card language: surface background, hairline border
 * and the same 8px corner radius as buttons. Colour carries the meaning, so
 * only the icon is tinted — a solid green pill would fight the primary button
 * that was just pressed.
 *
 * Every colour is a token, never a literal: the same toast has to read
 * correctly in light and dark mode.
 */
const toastStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 12px 32px -16px rgb(0 0 0 / 0.35)',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  padding: '0.75rem 1rem',
  maxWidth: '26rem',
};

function success(message: string, duration = 3000): void {
  toast.success(message, {
    duration,
    style: toastStyle,
    iconTheme: { primary: 'var(--primary)', secondary: 'var(--surface)' },
  });
}

function failure(message: string, duration = 4500): void {
  toast.error(message, {
    duration,
    style: toastStyle,
    iconTheme: { primary: 'var(--danger)', secondary: 'var(--surface)' },
  });
}

export function showSaved(): void {
  success('Changes saved. Reload the simulator to apply.');
}

export function showDeleted(label: string): void {
  success(`${label} deleted.`, 2500);
}

export function showReset(): void {
  success('Reset complete. Reloading with defaults.');
}

export function showImported(): void {
  success('Content imported. Reload the simulator to apply.');
}

export function showExported(message: string): void {
  success(message, 2500);
}

export function showNotice(message: string): void {
  toast(message, {
    duration: 3000,
    style: toastStyle,
  });
}

export function showError(message: string): void {
  failure(message);
}
