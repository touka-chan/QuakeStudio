/* =========================================================================
   API switch
   -------------------------------------------------------------------------
   Local development uses the FastAPI service on plain HTTP localhost. A
   hosted build can point at an HTTPS API by setting VITE_API_URL. The APK
   always keeps its browser-only behaviour, even if that variable leaks into
   its build environment.
   ========================================================================= */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const API_PREFIX = '/api/v1';

type LocationLike = { protocol: string; hostname: string; origin: string };

/** True only for the HTTP dev server, never for Capacitor's https://localhost. */
export function isLocalBackendLocation(location: { protocol: string; hostname: string }): boolean {
  if (location.protocol !== 'http:') return false;
  return LOCAL_HOSTS.has(location.hostname);
}

function isNativeShellLocation(location: { protocol: string; hostname: string }): boolean {
  return location.protocol !== 'http:' && LOCAL_HOSTS.has(location.hostname);
}

function isAllowedApiProtocol(url: URL, page: LocationLike): boolean {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) && isLocalBackendLocation(page);
}

/**
 * Turn VITE_API_URL into a bare origin, or null when it is unusable.
 *
 * A relative value such as "/" resolves to the page origin, which is useful
 * when a platform proxy forwards /api to the hosted service.
 */
export function resolveConfiguredApiOrigin(
  location: LocationLike,
  configuredApi: string | undefined,
): string | null {
  const raw = configuredApi?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, location.origin);
    if (!isAllowedApiProtocol(url, location)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isBackendEnabledFor(
  location: LocationLike,
  options: { dev: boolean; configuredApi?: string },
): boolean {
  if (isNativeShellLocation(location)) return false;
  if (resolveConfiguredApiOrigin(location, options.configuredApi)) return true;
  return options.dev && isLocalBackendLocation(location);
}

function configuredApiOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  return resolveConfiguredApiOrigin(window.location, import.meta.env.VITE_API_URL);
}

/** True when this build was deliberately pointed at a hosted API. */
export function isBackendRequired(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.MODE === 'test') return false;
  return isBackendEnabled() && configuredApiOrigin() !== null;
}

export function isBackendEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Vitest runs in jsdom at localhost. Unit tests must never reach a real
  // service or wait on its timeouts.
  if (import.meta.env.MODE === 'test') return false;
  return isBackendEnabledFor(window.location, {
    dev: import.meta.env.DEV,
    configuredApi: import.meta.env.VITE_API_URL,
  });
}

export function apiBaseUrl(): string {
  const configured = configuredApiOrigin();
  if (configured) return configured;

  // Match the page's hostname spelling so the session cookie stays same-site.
  const host = window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
  return `http://${host}:8000`;
}

/** Cold starts on a free host need more patience than a local dev server. */
export function apiRequestTimeoutMs(): number {
  return isBackendRequired() ? 30_000 : 6_000;
}
