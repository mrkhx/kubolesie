#!/usr/bin/env npx tsx
/**
 * TEST-ONLY. Applies prisma migrate deploy to a disposable database and runs
 * PostgreSQL integration tests. Never targets production.
 *
 *   TEST_DATABASE_URL=postgresql://..._test npm run test:db:migrations
 *
 * Optional: if docker is on PATH and TEST_DATABASE_URL is unset, starts
 * postgres:16-alpine on localhost:55432.
 */
import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function fail(message: string, code = 1): never {
  console.error(`[test:db:migrations] ${message}`);
  process.exit(code);
}

if (process.env.NODE_ENV === 'production') {
  fail('refusing to run against NODE_ENV=production', 1);
}

function isSafeTestUrl(url: string): boolean {
  return /_test\b/i.test(url) || /localhost|127\.0\.0\.1/i.test(url);
}

function dockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.status === 0;
}

async function waitForPostgres(url: string, attempts = 30): Promise<void> {
  const { Client } = await import('pg');
  for (let i = 0; i < attempts; i += 1) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  fail('postgres did not become ready');
}

async function main(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL?.trim() || '';
  let container: string | null = null;

  if (!url) {
    if (!dockerAvailable()) {
      fail(
        'TEST_DATABASE_URL is unset and docker is unavailable. Start Postgres 16 and pass a *_test URL.',
        2,
      );
    }
    container = 'kubolesie-pg-test';
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    const run = spawnSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        container,
        '-e',
        'POSTGRES_USER=kubolesie',
        '-e',
        'POSTGRES_PASSWORD=kubolesie',
        '-e',
        'POSTGRES_DB=kubolesie_test',
        '-p',
        '55432:5432',
        'postgres:16-alpine',
      ],
      { encoding: 'utf8' },
    );
    if (run.status !== 0) {
      fail(`docker run failed: ${run.stderr || run.stdout}`);
    }
    url = 'postgresql://kubolesie:kubolesie@127.0.0.1:55432/kubolesie_test';
    console.log('[test:db:migrations] started disposable postgres:16 on :55432');
  }

  if (!isSafeTestUrl(url)) {
    fail('TEST_DATABASE_URL must be localhost or a database name containing _test', 3);
  }

  try {
    await waitForPostgres(url);
    console.log('[test:db:migrations] prisma migrate deploy');
    execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
      cwd: join(ROOT, 'packages/database'),
      env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
      stdio: 'inherit',
    });
    console.log('[test:db:migrations] integration tests');
    execSync('npx vitest run --config vitest.integration.config.ts', {
      cwd: ROOT,
      env: { ...process.env, TEST_DATABASE_URL: url, NODE_ENV: 'test' },
      stdio: 'inherit',
    });
  } finally {
    if (container) {
      spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    }
  }
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
