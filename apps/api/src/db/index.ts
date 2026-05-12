import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

// When INSTANCE_CONNECTION_NAME is set (Cloud Run + Cloud SQL Auth Proxy),
// use a config object with a unix socket host — the postgres driver cannot
// parse the socket path from a connection string reliably.
// Fall back to DATABASE_URL for local dev and Docker Compose.
const client = process.env.INSTANCE_CONNECTION_NAME
  ? postgres({
      host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
      user: 'postgres',
      password: process.env.DB_PASSWORD,
      database: 'gigsge',
      max: 10,
    })
  : postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export type Database = typeof db;
