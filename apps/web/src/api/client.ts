import {
  API_PREFIX,
  apiBaseUrl,
  apiRequestTimeoutMs,
  isBackendEnabled,
  isBackendRequired,
} from './config';

/* =========================================================================
   Small fetch wrapper for the content API
   -------------------------------------------------------------------------
   Explicit credentials, a timeout, and structured errors. No retry loop: a
   slider moving 20 times a second must not turn a missing API into a queue of
   doomed requests.
   ========================================================================= */

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

type ApiOptions = RequestInit & { timeoutMs?: number };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { timeoutMs = apiRequestTimeoutMs(), ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${apiBaseUrl()}${API_PREFIX}${path}`, {
      credentials: 'include',
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new ApiError(response.status, messageFor(response.status, detail), detail);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(0, 'The API did not respond in time.');
    }
    throw new ApiError(0, 'The API is not reachable.');
  } finally {
    clearTimeout(timer);
  }
}

let backendAvailable: boolean | null = null;
let backendProbe: Promise<boolean> | null = null;

/**
 * One cheap probe per page load, used to choose the admin auth path.
 *
 * A single timeout used to be enough to send the admin to demo mode while the
 * API was merely busy. Two short attempts and a shared promise keep that
 * fallback deliberate rather than a race, without making a dead API block for
 * long. A hosted API gets one longer attempt because a free host may be waking
 * from sleep.
 */
export async function isBackendAvailable(): Promise<boolean> {
  if (!isBackendEnabled()) return false;
  if (backendAvailable !== null) return backendAvailable;
  if (!backendProbe) {
    const hosted = isBackendRequired();
    const attempts = hosted ? 1 : 2;
    const timeoutMs = hosted ? 20_000 : 2_000;
    backendProbe = (async () => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          await apiFetch('/health', { timeoutMs });
          backendAvailable = true;
          return true;
        } catch {
          // Try once more locally; a dev server restart is common.
        }
      }
      backendAvailable = false;
      return false;
    })();
  }
  try {
    return await backendProbe;
  } finally {
    backendProbe = null;
  }
}

export function resetBackendAvailability(): void {
  backendAvailable = null;
}

async function readErrorDetail(response: Response): Promise<unknown> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === 'object' && 'detail' in payload) {
      return (payload as { detail: unknown }).detail;
    }
    return payload;
  } catch {
    return undefined;
  }
}

function messageFor(status: number, detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (status === 401) return 'Sign in to continue.';
  if (status === 403) return 'The API refused this request.';
  if (status === 422) return 'The content did not pass validation.';
  return `The API returned ${status}.`;
}
