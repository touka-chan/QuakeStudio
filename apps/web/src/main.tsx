import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Fonts are bundled rather than fetched from a CDN, so the app works offline
 * and makes no third-party request.
 *
 * Both are variable fonts, so one file covers every weight — no separate 400,
 * 500 and 600 downloads.
 *
 * NOTE ON SUBSETS. `@fontsource-variable` has no per-subset entry point; its
 * CSS declares every subset the project covers (Cyrillic, Greek, Vietnamese,
 * extended Latin) inside one file, each with its own `unicode-range`. The
 * browser therefore only ever DOWNLOADS the subsets whose glyphs the page
 * uses — about 87 KB for this English-only app. The unused files are still
 * emitted into `dist`, which costs deploy size but not user bandwidth.
 *
 * This was measured rather than assumed; see docs/performance.md. If deploy
 * size ever matters more than the import staying maintainable, write
 * `@font-face` blocks pointing at the two `*-latin-wght-normal.woff2` files
 * directly — but do not guess the paths, because a wrong path fails SILENTLY
 * and the page simply loses its typography.
 */
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

import App from './App';
import { registerServiceWorker } from './pwa/registerServiceWorker';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Offline support for the PWA. Registered here rather than injected by
 * vite-plugin-pwa so it can be skipped inside the Android APK, where the assets
 * are already bundled and a worker would only serve a stale precache after an
 * update. See src/pwa/registerServiceWorker.ts.
 */
void registerServiceWorker();
