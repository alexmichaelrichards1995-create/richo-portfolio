/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SHOPIFY_API_KEY?: string;
  readonly SHOPIFY_API_SECRET?: string;
  readonly SHOPIFY_APP_URL?: string;
  readonly DATABASE_URL?: string;
  readonly SCOPES?: string;
  readonly RICHO_PRODUCTION_APPROVED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
