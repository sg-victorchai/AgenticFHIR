/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMART_CLIENT_ID?: string;
  readonly VITE_FHIR_BASE_URL?: string;
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
