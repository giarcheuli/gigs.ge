import { defineConfig } from 'drizzle-kit';

// When INSTANCE_CONNECTION_NAME is set (Cloud Run + Cloud SQL Auth Proxy),
// pass connection parameters directly so drizzle-kit never tries to parse
// a unix socket path as a URL — Node.js URL parser rejects it with ERR_INVALID_URL.
// Fall back to DATABASE_URL for local dev and Docker Compose.
export default defineConfig({
  // drizzle-kit's CJS bundler can't resolve `.js` extension re-exports in the barrel
  // index.ts, so point it at the individual schema files directly.
  // In production the source is compiled; use dist/ output there.
  schema: process.env.NODE_ENV === 'production'
    ? './dist/db/schema/*.js'
    : './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: process.env.INSTANCE_CONNECTION_NAME
    ? {
        host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
        user: 'postgres',
        password: process.env.DB_PASSWORD,
        database: 'gigsge',
      }
    : {
        url: process.env.DATABASE_URL!,
      },
});
