import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./apps/web/tests/setup.ts'],
    include: ['apps/web/tests/unit/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    reporters: ['default'],

    /*
     * Generous timeouts, and the reason is worth keeping.
     *
     * The accessibility suite runs axe over the whole app shell and over each
     * dialog. That is real work on a real DOM: measured at ~1.2s for the
     * assumptions dialog on an idle machine, which is already a quarter of
     * vitest's 5s default before four workers start competing for the CPU.
     *
     * Under load it timed out, and the report read "Test timed out in 5000ms"
     * next to a test name about accessibility. That is the worst kind of
     * failure: it looks like the product broke when nothing was wrong with it,
     * and the reflex is to re-run rather than to read. Reproduced deliberately
     * with 16 busy processes — 2 to 4 of these tests failed, never the others.
     *
     * 20s keeps a genuine hang visible while giving an idle-machine cost of
     * 1.2s room to survive a busy one.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
