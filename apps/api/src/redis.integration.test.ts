import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import IORedis from 'ioredis';
import { lockKey, RATE_LIMIT_KEY_PREFIX, rlKey } from '@kubolesie/vk-bot';
import { RedisEphemeralStore } from './redis';

function isSafeRedisUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  } catch {
    return false;
  }
}

const url = (process.env.TEST_REDIS_URL ?? '').trim();
const describeRedis = url && isSafeRedisUrl(url) && process.env.NODE_ENV !== 'production' ? describe : describe.skip;

describeRedis('redis ephemeral store', () => {
  const prefix = `${RATE_LIMIT_KEY_PREFIX}test:${randomUUID().slice(0, 8)}`;
  const clients: RedisEphemeralStore[] = [];

  function store(): RedisEphemeralStore {
    const redis = new IORedis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      enableOfflineQueue: false,
    });
    const created = new RedisEphemeralStore(redis);
    clients.push(created);
    return created;
  }

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
  });

  it('pings a reachable Redis', async () => {
    expect(await store().ping()).toBe(true);
  });

  it('lets exactly 10 of 100 concurrent consumes through', async () => {
    const a = store();
    const key = `${prefix}:race:m`;
    const results = await Promise.all(
      Array.from({ length: 100 }, () => a.consume([{ key, limit: 10, ttlMs: 30_000 }])),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it('shares one limit across two clients (two instances)', async () => {
    const a = store();
    const b = store();
    const key = `${prefix}:shared:m`;
    const results = await Promise.all([
      ...Array.from({ length: 50 }, () => a.consume([{ key, limit: 10, ttlMs: 30_000 }])),
      ...Array.from({ length: 50 }, () => b.consume([{ key, limit: 10, ttlMs: 30_000 }])),
    ]);
    expect(results.filter(Boolean)).toHaveLength(10);
  });

  it('sets a TTL on every rate-limit key', async () => {
    const a = store();
    const key = rlKey('gameplay', `test-${randomUUID().slice(0, 6)}`, 'm');
    expect(key.startsWith(RATE_LIMIT_KEY_PREFIX)).toBe(true);
    expect(await a.consume([{ key, limit: 3, ttlMs: 8_000 }])).toBe(true);
    const redis = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await redis.connect();
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(8_000);
    } finally {
      await redis.quit();
    }
  });

  it('compare-and-deletes locks and expires crashed holders', async () => {
    const a = store();
    const key = lockKey('player', `test-${randomUUID().slice(0, 6)}`);
    expect(await a.tryLock(key, 'token-a', 8_000)).toBe(true);
    expect(await a.tryLock(key, 'token-b', 8_000)).toBe(false);
    await a.unlock(key, 'wrong');
    expect(await a.tryLock(key, 'token-c', 8_000)).toBe(false);
    await a.unlock(key, 'token-a');
    expect(await a.tryLock(key, 'token-d', 250)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await a.tryLock(key, 'token-e', 1_000)).toBe(true);
  });
});
