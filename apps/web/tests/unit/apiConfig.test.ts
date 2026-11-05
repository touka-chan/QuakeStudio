import { describe, expect, it } from 'vitest';

import {
  isBackendEnabledFor,
  isLocalBackendLocation,
  resolveConfiguredApiOrigin,
} from '@/api/config';

/*
 * The APK is served from https://localhost, which used to look like the Vite
 * development server by hostname alone. That made every native launch wait on
 * an API probe that could never succeed. Keep the local gate tied to the plain
 * HTTP dev origin, and keep the native shell out of hosted API mode.
 */

const local = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:5173' };
const localIp = { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:5173' };
const production = {
  protocol: 'https:',
  hostname: 'quake-studio.vercel.app',
  origin: 'https://quake-studio.vercel.app',
};
const native = { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost' };

describe('local backend location gate', () => {
  it('accepts the HTTP Vite dev host', () => {
    expect(isLocalBackendLocation(local)).toBe(true);
    expect(isLocalBackendLocation(localIp)).toBe(true);
  });

  it('rejects Capacitor https://localhost', () => {
    expect(isLocalBackendLocation(native)).toBe(false);
  });

  it('rejects deployed origins', () => {
    expect(isLocalBackendLocation(production)).toBe(false);
  });
});

describe('hosted API selection', () => {
  it('enables the API automatically only on the local dev origin', () => {
    expect(isBackendEnabledFor(local, { dev: true })).toBe(true);
    expect(isBackendEnabledFor(production, { dev: false })).toBe(false);
  });

  it('accepts an HTTPS API origin in a production build', () => {
    expect(
      isBackendEnabledFor(production, {
        dev: false,
        configuredApi: 'https://quakestudio-api.onrender.com',
      }),
    ).toBe(true);
  });

  it('accepts a same-origin proxy path', () => {
    expect(resolveConfiguredApiOrigin(production, '/')).toBe('https://quake-studio.vercel.app');
    expect(
      isBackendEnabledFor(production, {
        dev: false,
        configuredApi: '/',
      }),
    ).toBe(true);
  });

  it('never enables the API inside the APK shell', () => {
    expect(
      isBackendEnabledFor(native, {
        dev: false,
        configuredApi: 'https://quakestudio-api.onrender.com',
      }),
    ).toBe(false);
    expect(isBackendEnabledFor(native, { dev: true })).toBe(false);
  });

  it('rejects insecure remote origins', () => {
    expect(
      resolveConfiguredApiOrigin(production, 'http://quakestudio-api.onrender.com'),
    ).toBeNull();
    expect(resolveConfiguredApiOrigin(local, 'http://quakestudio-api.onrender.com')).toBeNull();
  });

  it('allows a local HTTP API only from a local page', () => {
    expect(resolveConfiguredApiOrigin(local, 'http://localhost:8000')).toBe(
      'http://localhost:8000',
    );
  });
});
