/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOGNI_APP_ID: string;
  readonly VITE_SOGNI_ENV: string;
  readonly VITE_TURNSTILE_KEY: string;
  readonly MODE: string;
  readonly APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
