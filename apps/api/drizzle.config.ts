import { defineConfig } from 'drizzle-kit';

// Mirrors the logic in src/config/env.ts so drizzle-kit CLI commands
// (push, generate, migrate, studio) work in both local and Cloud Run contexts.
const buildDatabaseUrl = (): string => {
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  if (instanceConnectionName) {
    const password = process.env.DB_PASSWORD;
    if (!password) throw new Error('DB_PASSWORD is required when INSTANCE_CONNECTION_NAME is set');
    return `postgresql://postgres:${encodeURIComponent(password)}@/gigsge?host=/cloudsql/${instanceConnectionName}`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return url;
};

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: buildDatabaseUrl(),
  },
});
