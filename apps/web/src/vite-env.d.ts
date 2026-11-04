/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the local-only API. Ignored outside localhost. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
