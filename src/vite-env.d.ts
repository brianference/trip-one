/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * CARTO basemap API key. Required on CARTO's raster basemaps since their
   * free tier moved behind a key; without it the tiles render with an
   * "API key required" watermark. Set in `.env.local` (gitignored) so it is
   * injected at build time. Browser-visible by design — it travels in the
   * tile URL — and rate-limited per account, not a server credential.
   */
  readonly VITE_CARTO_BASEMAP_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
