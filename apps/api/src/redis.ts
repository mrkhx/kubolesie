import IORedis from 'ioredis';

export interface RedisLock {
  tryLock(key: string, ttlMs: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
  incr(key: string, ttlMs: number): Promise<number>;
  close(): Promise<void>;
}

class NoopLock implements RedisLock {
  async tryLock(): Promise<boolean> {
    return true;
  }
  async unlock(): Promise<void> {}
  async incr(): Promise<number> {
    return 1;
  }
  async close(): Promise<void> {}
}

class IoRedisLock implements RedisLock {
  constructor(private readonly redis: IORedis) {}

  async tryLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async unlock(key: string): Promise<void> {
    await this.redis.del(`lock:${key}`);
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const n = await this.redis.incr(`rl:${key}`);
    if (n === 1) await this.redis.pexpire(`rl:${key}`, ttlMs);
    return n;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createRedisLock(): RedisLock {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[redis] REDIS_URL is not set. Locks/rate-limits are no-ops. Progress still lives in PostgreSQL.');
    return new NoopLock();
  }
  const redis = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.connect().catch((error) => {
    console.warn('[redis] connect failed, using no-op locks:', error.message);
  });
  return new IoRedisLock(redis);
}
