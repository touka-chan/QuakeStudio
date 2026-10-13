import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    /*
     * Source maps are OFF by default.
     *
     * With `sourcemap: true` every build emitted ~9 MB of `.map` files into
     * dist. Deploy the folder as-is and they are served to anyone who guesses
     * the URL — nine times the size of the application, for no benefit to a
     * user. The app has no server-side stack to debug in production, and the
     * source is public on GitHub regardless.
     *
     * Opt in when you need to debug a built bundle:
     *     VITE_SOURCEMAP=true npm run build
     *
     * The dev server is unaffected and always has working maps.
     */
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
  },
});
