import { describe, expect, it } from 'vitest';

import { isLocalBackendLocation } from '@/api/config';

/*
 * The APK is served from https://localhost, which used to look like the Vite
 * development server by hostname alone. That made every native launch wait on
 * an API probe that could never succeed. Keep the gate tied to the plain HTTP
 * dev origin.
 */
describe('local backend location gate', () => {
  it('accepts the HTTP Vite dev host', () => {
    expect(isLocalBackendLocation({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(isLocalBackendLocation({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
  });

  it('rejects Capacitor https://localhost', () => {
    expect(isLocalBackendLocation({ protocol: 'https:', hostname: 'localhost' })).toBe(false);
  });

  it('rejects deployed origins', () => {
    expect(
      isLocalBackendLocation({ protocol: 'https:', hostname: 'quake-studio.vercel.app' }),
    ).toBe(false);
  });
});
