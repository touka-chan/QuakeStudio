/* =========================================================================
   Local backend switch
   -------------------------------------------------------------------------
   The API exists only for development. Every request is gated on the page
   being served from localhost or 127.0.0.1, so the deployed Vercel app keeps
   its browser-only behaviour and makes no server call.
   ========================================================================= */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const API_PREFIX = '/api/v1';

/** True only for the HTTP dev server, never for Capacitor's https://localhost. */
export function isLocalBackendLocation(location: { protocol: string; hostname: string }): boolean {
  if (location.protocol !== 'http:') return false;
  return LOCAL_HOSTS.has(location.hostname);
}

export function isLocalBackendEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Vitest runs in jsdom at localhost. Unit tests must never reach a real
  // local service or wait on its timeouts.
  if (import.meta.env.MODE === 'test') return false;
  // A production build served for local preview must behave like production,
  // not like the Vite development server.
  if (!import.meta.env.DEV) return false;
  return isLocalBackendLocation(window.location);
}

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // Match the page's hostname spelling so the session cookie stays same-site.
  const host = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  return `http://${host}:8000`;
}
