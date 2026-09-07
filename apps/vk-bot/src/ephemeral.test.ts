import { describe, expect, it } from 'vitest';
import { createMemoryBacking, MemoryEphemeralStore } from './memory-ephemeral';
import { lockKey, RATE_LIMIT_KEY_PREFIX, RATE_LIMIT_LOCK_PREFIX, rlKey } from './abuse-policy';

describe('memory ephemeral store', () => {
  it('allows traffic below the limit', async () => {
    const store = new MemoryEphemeralStore();
    for (let i = 0; i < 3; i += 1) {
      expect(await store.consume([{ key: 'k', limit: 3, ttlMs: 60_000 }])).toBe(true);
    }
  });

  it('allows the exact limit and rejects the next hit', async () => {
    const store = new MemoryEphemeralStore();
    const window = { key: 'exact', limit: 2, ttlMs: 60_000 };
    expect(await store.consume([window])).toBe(true);
    expect(await store.consume([window])).toBe(true);
    expect(await store.consume([window])).toBe(false);
  });

  it('never goes negative when over limit', async () => {
    const backing = createMemoryBacking();
    const store = new MemoryEphemeralStore(backing);
    const window = { key: 'neg', limit: 1, ttlMs: 60_000 };
    await store.consume([window]);
    await store.consume([window]);
    await store.consume([window]);
    expect(backing.counters.get('neg')!.count).toBe(3);
    expect(backing.counters.get('neg')!.count).toBeGreaterThan(0);
  });

  it('resets the window after TTL', async () => {
    let now = 1_000_000;
    const store = new MemoryEphemeralStore(createMemoryBacking(), () => now);
    const window = { key: 'ttl', limit: 1, ttlMs: 1_000 };
    expect(await store.consume([window])).toBe(true);
    expect(await store.consume([window])).toBe(false);
    now += 1_001;
    expect(await store.consume([window])).toBe(true);
  });

  it('isolates independent users', async () => {
    const store = new MemoryEphemeralStore();
    expect(await store.consume([{ key: rlKey('gameplay', 'vk:1', 'm'), limit: 1, ttlMs: 60_000 }])).toBe(true);
    expect(await store.consume([{ key: rlKey('gameplay', 'vk:1', 'm'), limit: 1, ttlMs: 60_000 }])).toBe(false);
    expect(await store.consume([{ key: rlKey('gameplay', 'vk:2', 'm'), limit: 1, ttlMs: 60_000 }])).toBe(true);
  });

  it('isolates independent categories', async () => {
    const store = new MemoryEphemeralStore();
    expect(await store.consume([{ key: rlKey('gameplay', 'vk:1', 'm'), limit: 1, ttlMs: 60_000 }])).toBe(true);
    expect(await store.consume([{ key: rlKey('read', 'vk:1', 'm'), limit: 1, ttlMs: 60_000 }])).toBe(true);
  });

  it('enforces burst independently of the minute window', async () => {
    const store = new MemoryEphemeralStore();
    const minute = { key: rlKey('gameplay', 'vk:9', 'm'), limit: 30, ttlMs: 60_000 };
    const burst = { key: rlKey('gameplay', 'vk:9', 'b'), limit: 2, ttlMs: 5_000 };
    expect(await store.consume([minute, burst])).toBe(true);
    expect(await store.consume([minute, burst])).toBe(true);
    expect(await store.consume([minute, burst])).toBe(false);
  });

  it('lets exactly 10 of 100 concurrent consumes through a limit of 10', async () => {
    const store = new MemoryEphemeralStore();
    const window = { key: 'race', limit: 10, ttlMs: 60_000 };
    const results = await Promise.all(Array.from({ length: 100 }, () => store.consume([window])));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results.filter((ok) => !ok)).toHaveLength(90);
  });

  it('shares one limit across two store instances with the same backing', async () => {
    const backing = createMemoryBacking();
    const a = new MemoryEphemeralStore(backing);
    const b = new MemoryEphemeralStore(backing);
    const window = { key: 'shared', limit: 10, ttlMs: 60_000 };
    const left = await Promise.all(Array.from({ length: 50 }, () => a.consume([window])));
    const right = await Promise.all(Array.from({ length: 50 }, () => b.consume([window])));
    expect([...left, ...right].filter(Boolean)).toHaveLength(10);
  });

  it('does not share a limit across isolated backings', async () => {
    const a = new MemoryEphemeralStore();
    const b = new MemoryEphemeralStore();
    const window = { key: 'isolated', limit: 1, ttlMs: 60_000 };
    expect(await a.consume([window])).toBe(true);
    expect(await b.consume([window])).toBe(true);
  });

  it('acquires a lock once and blocks the second holder', async () => {
    const store = new MemoryEphemeralStore();
    expect(await store.tryLock('lock', 'token-a', 4_000)).toBe(true);
    expect(await store.tryLock('lock', 'token-b', 4_000)).toBe(false);
  });

  it('releases only with the matching token', async () => {
    const store = new MemoryEphemeralStore();
    expect(await store.tryLock('lock', 'token-a', 4_000)).toBe(true);
    await store.unlock('lock', 'token-b');
    expect(await store.tryLock('lock', 'token-c', 4_000)).toBe(false);
    await store.unlock('lock', 'token-a');
    expect(await store.tryLock('lock', 'token-d', 4_000)).toBe(true);
  });

  it('expires a crashed holder by TTL', async () => {
    let now = 5_000;
    const store = new MemoryEphemeralStore(createMemoryBacking(), () => now);
    expect(await store.tryLock('lock', 'token-a', 1_000)).toBe(true);
    now += 1_001;
    expect(await store.tryLock('lock', 'token-b', 1_000)).toBe(true);
  });

  it('namespaces keys with kubolesie prefixes and never embeds secrets', () => {
    const key = rlKey('gameplay', 'vk:9001', 'm');
    const lock = lockKey('player', 'vk:9001');
    expect(key.startsWith(RATE_LIMIT_KEY_PREFIX)).toBe(true);
    expect(lock.startsWith(RATE_LIMIT_LOCK_PREFIX)).toBe(true);
    expect(key).not.toMatch(/token|secret|password/i);
    expect(lock).not.toMatch(/token|secret|password/i);
    expect(key).not.toContain('начать');
  });
});
