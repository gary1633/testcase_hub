import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createDbConnection, type AppDb, type DbConnection } from './client';
import { resolveSeedMode, seedDatabaseIfEmpty } from './seed-data';
import {
  backfillMissingVersions,
  backfillRunExecutionHistory,
  seedPhase2SampleIfEmpty,
} from './bootstrap';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connection!: DbConnection;

  get db(): AppDb {
    return this.connection.db;
  }

  get driver(): 'postgres' | 'pglite' {
    return this.connection.driver;
  }

  async onModuleInit(): Promise<void> {
    this.connection = await createDbConnection(process.env.DATABASE_URL);
    const seedMode = resolveSeedMode();
    this.logger.log(
      `Database connected using PostgreSQL driver mode: ${this.connection.driver.toUpperCase()} (SEED_MODE=${seedMode})`,
    );
    const seeded = await seedDatabaseIfEmpty(this.connection.db, seedMode);
    if (seeded === 'superadmin') {
      this.logger.log(
        'Clean bootstrap: seeded initial Super Admin account only (no demo projects or data).',
      );
    } else if (seeded === 'demo') {
      this.logger.log('Initial demo users and projects seeded automatically.');
    }

    const backfilled = await backfillMissingVersions(this.connection.db);
    if (backfilled > 0) {
      this.logger.log(`Backfilled v1 version history for ${backfilled} existing test cases.`);
    }

    if (seedMode === 'demo') {
      const seededP2 = await seedPhase2SampleIfEmpty(this.connection.db);
      if (seededP2) {
        this.logger.log('Initial Phase 2 sample Test Plan, Test Run, and Defect seeded.');
      }
    }

    const backfilledRunHist = await backfillRunExecutionHistory(this.connection.db);
    if (backfilledRunHist > 0) {
      this.logger.log(`Backfilled execution history for ${backfilledRunHist} run results.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
    }
  }
}
