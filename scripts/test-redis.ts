#!/usr/bin/env npx tsx
/**
 * TEST-ONLY. Runs Redis anti-abuse integration tests against localhost Redis.
 * Never targets production. Never FLUSHALL / FLUSHDB.
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6379 npm run test:redis
 *
 * Optional: if docker is on PATH and TEST_REDIS_URL is unset, starts
 * redis:7-alpine on localhost:56379.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function fail(message: string, code = 1): never {
  console.error(`[test:redis] ${message}`);
  process.exit(code);
}

if (process.env.NODE_ENV === 'production') {
  fail('refusing to run against NODE_ENV=production', 1);
}

function isSafeRedisUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  } catch {
    return false;
  }
}

function dockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.status === 0;
}

async function waitForRedis(url: string, attempts = 30): Promise<void> {
  const IORedis = (await import('ioredis')).default;
  for (let i = 0; i < attempts; i += 1) {
    const redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      commandTimeout: 1_000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      if (pong === 'PONG') return;
    } catch {
      try {
        redis.disconnect();
      } catch {
        /* ignore */
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  fail('redis did not become ready');
}

async function main(): Promise<void> {
  let url = process.env.TEST_REDIS_URL?.trim() || '';
  let container: string | null = null;

  if (url && !isSafeRedisUrl(url)) {
    fail('refusing non-localhost Redis URL. Use 127.0.0.1 / localhost.');
  }

  if (!url) {
    if (!dockerAvailable()) {
      fail(
        'TEST_REDIS_URL is unset and docker is unavailable. Start Redis and pass redis://127.0.0.1:6379.',
        2,
      );
    }
    container = 'kubolesie-redis-test';
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    const run = spawnSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        container,
        '-p',
        '56379:6379',
        'redis:7-alpine',
        'redis-server',
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { encoding: 'utf8' },
    );
    if (run.status !== 0) {
      fail(`failed to start redis container: ${run.stderr || run.stdout}`);
    }
    url = 'redis://127.0.0.1:56379';
  }

  try {
    await waitForRedis(url);
    const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.redis.config.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, TEST_REDIS_URL: url, NODE_ENV: 'test' },
    });
    if (result.status !== 0) fail('redis integration tests failed', result.status ?? 1);
  } finally {
    if (container) {
      spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    }
  }
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
