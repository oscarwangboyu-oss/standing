import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite (the embedded Postgres used locally) ships WASM and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Type checking runs through `npm run typecheck` so the build does not depend on it.
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
};

export default config;
