import IORedis from 'ioredis';
import type { ConsumeWindow, EphemeralStore } from '@kubolesie/vk-bot';
import { MemoryEphemeralStore } from '@kubolesie/vk-bot';
import type { RateLimitConfig } from './app-config';

/**
 * Lua: increment every window atomically. Hits over the limit still count.
 * PEXPIRE is set on first INCR and repaired if a key lost its TTL.
 * Never DECR — concurrency 100 / limit 10 yields exactly 10 allows, never negative.
 */
const CONSUME_LUA = `
local allowed = 1
for i = 1, #KEYS do
  local limit = tonumber(ARGV[(i - 1) * 2 + 1])
  local ttl = tonumber(ARGV[(i - 1) * 2 + 2])
  local n = redis.call('INCR', KEYS[i])
  if n == 1 then
    redis.call('PEXPIRE', KEYS[i], ttl)
  elseif redis.call('PTTL', KEYS[i]) < 0 then
    redis.call('PEXPIRE', KEYS[i], ttl)
  end
  if n > limit then
    allowed = 0
  end
end
return allowed
`;

const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export class RedisEphemeralStore implements EphemeralStore {
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly redis: IORedis) {}

  async consume(windows: ConsumeWindow[]): Promise<boolean> {
    if (windows.length === 0) return true;
    await this.ensureReady();
    const keys = windows.map((window) => window.key);
    const args = windows.flatMap((window) => [String(window.limit), String(window.ttlMs)]);
    const result = await this.redis.eval(CONSUME_LUA, keys.length, ...keys, ...args);
    return result === 1;
  }

  async tryLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    await this.ensureReady();
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async unlock(key: string, token: string): Promise<void> {
    await this.ensureReady();
    await this.redis.eval(UNLOCK_LUA, 1, key, token);
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureReady();
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.redis.status === 'ready') return;
    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        try {
          if (this.redis.status === 'ready') return;
          await this.redis.connect();
        } catch (error) {
          if (this.redis.status === 'ready') return;
          throw error;
        }
      })().catch((error) => {
        this.connectPromise = null;
        throw error;
      });
    }
    await this.connectPromise;
  }
}

export function createRedisEphemeralStore(config: RateLimitConfig): RedisEphemeralStore {
  if (!config.redisUrl) {
    throw new Error('[redis] REDIS_URL is required for the Redis ephemeral store');
  }
  const redis = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: config.connectTimeoutMs,
    commandTimeout: config.commandTimeoutMs,
    enableOfflineQueue: false,
  });
  return new RedisEphemeralStore(redis);
}

export function createEphemeralStore(config: RateLimitConfig): EphemeralStore {
  if (config.backend === 'redis' && config.redisUrl) {
    return createRedisEphemeralStore(config);
  }
  if (config.enabled && process.env.NODE_ENV !== 'test') {
    console.warn('[redis] rate limits are in-memory (not shared across instances)');
  }
  return new MemoryEphemeralStore();
}

/** @deprecated Prefer EphemeralStore. Kept so mock HTTP can share the same client. */
export interface RedisLock {
  tryLock(key: string, ttlMs: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
  incr(key: string, ttlMs: number): Promise<number>;
  close(): Promise<void>;
}

export class EphemeralLockAdapter implements RedisLock {
  constructor(private readonly store: EphemeralStore) {}

  async tryLock(key: string, ttlMs: number): Promise<boolean> {
    return this.store.tryLock(`kubolesie:lock:legacy:${key.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 64)}`, 'legacy', ttlMs);
  }

  async unlock(key: string): Promise<void> {
    await this.store.unlock(`kubolesie:lock:legacy:${key.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 64)}`, 'legacy');
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const windowKey = `kubolesie:rl:mock:${key.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80)}:m`;
    const allowed = await this.store.consume([{ key: windowKey, limit: Number.MAX_SAFE_INTEGER, ttlMs }]);
    return allowed ? 1 : Number.MAX_SAFE_INTEGER;
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

export function createRedisLock(config?: RateLimitConfig): RedisLock {
  if (!config) {
    const url = process.env.REDIS_URL;
    if (!url) return new EphemeralLockAdapter(new MemoryEphemeralStore());
    return new EphemeralLockAdapter(
      createRedisEphemeralStore({
        enabled: true,
        backend: 'redis',
        redisUrl: url,
        redisConfigured: true,
        connectTimeoutMs: 2_000,
        commandTimeoutMs: 1_000,
      }),
    );
  }
  return new EphemeralLockAdapter(createEphemeralStore(config));
}
