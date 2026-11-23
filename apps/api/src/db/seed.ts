import 'dotenv/config';
import { createDbConnection } from './client';
import { seedDatabaseIfEmpty } from './seed-data';

async function main() {
  const conn = await createDbConnection(process.env.DATABASE_URL);
  try {
    const seeded = await seedDatabaseIfEmpty(conn.db);
    if (seeded === 'superadmin') {
      console.log('Seeded initial Super Admin account only (clean workspace).');
    } else if (seeded === 'demo') {
      console.log('Seeded initial demo users, projects, suites, and test cases successfully.');
    } else {
      console.log('Database already contains data or seeding disabled. Skipping seed.');
    }
  } finally {
    await conn.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
