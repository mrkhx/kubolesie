import { describe, expect, it } from 'vitest';
import {
  assertDatabaseReady,
  DatabaseConfigError,
  describeDatabaseConfig,
  loadDatabaseConfig,
  redactDatabaseUrl,
  sanitizeDatabaseError,
} from './config';
import { createGameStore } from './index';

describe('database production config', () => {
  it('treats empty DATABASE_URL as unset', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: '  ', NODE_ENV: 'development' });
    expect(config.dbConfigured).toBe(false);
    expect(config.dbProvider).toBeNull();
  });

  it('fails production without DATABASE_URL', () => {
    expect(() => assertDatabaseReady(loadDatabaseConfig({ NODE_ENV: 'production' }))).toThrow(
      DatabaseConfigError,
    );
    expect(() => assertDatabaseReady(loadDatabaseConfig({ NODE_ENV: 'production' }))).toThrow(
      /DATABASE_URL/,
    );
  });

  it('forbids GAME_STORE=memory in production', () => {
    expect(() =>
      assertDatabaseReady(
        loadDatabaseConfig({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://kubolesie:secret@db:5432/kubolesie',
          GAME_STORE: 'memory',
        }),
      ),
    ).toThrow(/memory/i);
  });

  it('accepts production prisma config without logging the password', () => {
    const config = loadDatabaseConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://kubolesie:s3cret-pass@db.internal:5432/kubolesie',
      GAME_STORE: 'prisma',
    });
    expect(() => assertDatabaseReady(config)).not.toThrow();
    const described = JSON.stringify(describeDatabaseConfig(config));
    expect(described).not.toContain('s3cret-pass');
    expect(described).not.toContain('postgresql://');
    expect(redactDatabaseUrl(config.databaseUrl!)).toBe(
      'postgresql://kubolesie:***@db.internal:5432/kubolesie',
    );
  });

  it('strips credentials from Prisma-style errors', () => {
    const message = sanitizeDatabaseError(
      new Error('Can\'t reach database server at postgresql://user:hunter2@localhost:5432/db'),
    );
    expect(message).not.toContain('hunter2');
    expect(message).toContain('postgresql://***');
  });

  it('does not fall back to MemoryStore in production when Postgres is unreachable', async () => {
    await expect(
      createGameStore({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://kubolesie:kubolesie@127.0.0.1:1/kubolesie?connect_timeout=1',
        GAME_STORE: 'prisma',
      }),
    ).rejects.toThrow(/unavailable|DATABASE_URL|production/i);
  });
});
