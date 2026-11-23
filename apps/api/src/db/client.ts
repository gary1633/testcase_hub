import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { ensureSchema } from './bootstrap';

export type AppDb = NodePgDatabase<typeof schema>;

export interface DbConnection {
  db: AppDb;
  driver: 'postgres' | 'pglite';
  close: () => Promise<void>;
}

export async function createDbConnection(rawUrl?: string): Promise<DbConnection> {
  const databaseUrl = rawUrl || process.env.DATABASE_URL || 'pglite://./data/pgdata';

  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzlePg(pool, { schema });
    await ensureSchema(db);
    return {
      db,
      driver: 'postgres',
      close: async () => {
        await pool.end();
      },
    };
  }

  const relativePath = databaseUrl.replace(/^pglite:\/\//, '') || './data/pgdata';
  const resolvedPath = path.resolve(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const pglite = new PGlite(resolvedPath);
  await pglite.waitReady;
  const db = drizzlePglite(pglite, { schema }) as unknown as AppDb;
  await ensureSchema(db);

  return {
    db,
    driver: 'pglite',
    close: async () => {
      await pglite.close();
    },
  };
}
