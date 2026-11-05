/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional HTTPS origin or same-origin path for the hosted API, for example
   * `https://quakestudio-api.onrender.com` or `/`. Unset disables API use in
   * production; the APK never uses it.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
