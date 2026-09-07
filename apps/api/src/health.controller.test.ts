import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { loadAppConfig } from './app-config';
import { StoreLifecycle } from './lifecycle';
import type { StoreBundle } from '@kubolesie/database';

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://kubolesie:s3cret@db:5432/kubolesie',
  VK_GROUP_ID: '111',
  VK_GROUP_TOKEN: 'test-token',
  VK_CALLBACK_SECRET: 'test-secret',
  VK_CONFIRMATION_CODE: 'confirm-code',
};

function bundle(over: Partial<StoreBundle> = {}): StoreBundle {
  return {
    store: {} as StoreBundle['store'],
    kind: 'memory',
    ...over,
  };
}

describe('health and readiness', () => {
  it('keeps /health alive without querying the database or leaking secrets', () => {
    const controller = new HealthController(loadAppConfig(PROD), bundle());
    const body = controller.health();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ok');
    expect(body.prototypeVersion).toBe('0.0.3');
    expect(body.balanceVersion).toBe('0.0.3');
    expect(body.vkConfigured).toBe(true);
    expect(body.database.configured).toBe(true);
    expect(body.database.provider).toBe('postgresql');
    const dumped = JSON.stringify(body);
    expect(dumped).not.toContain('test-token');
    expect(dumped).not.toContain('test-secret');
    expect(dumped).not.toContain('confirm-code');
    expect(dumped).not.toContain('s3cret');
  });

  it('reports ready when Prisma ping succeeds', async () => {
    const prisma = { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) };
    const controller = new HealthController(
      loadAppConfig(PROD),
      bundle({ kind: 'prisma', prisma: prisma as never }),
    );
    const ready = await controller.ready();
    expect(ready).toMatchObject({ ready: true, database: 'ok', store: 'prisma' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('returns 503 readiness when PostgreSQL is down', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => {
        throw new Error('ECONNREFUSED postgresql://kubolesie:s3cret@db/kubolesie');
      }),
    };
    const controller = new HealthController(
      loadAppConfig(PROD),
      bundle({ kind: 'prisma', prisma: prisma as never }),
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(controller.health().ok).toBe(true);
  });

  it('is not ready in production without a Prisma client', async () => {
    const controller = new HealthController(loadAppConfig(PROD), bundle({ kind: 'memory' }));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('allows memory-store readiness only outside production', async () => {
    const controller = new HealthController(
      loadAppConfig({ NODE_ENV: 'test' }),
      bundle({ kind: 'memory' }),
    );
    await expect(controller.ready()).resolves.toMatchObject({ ready: true, database: 'memory' });
  });

  it('does not leak VK secrets from /v1/health/vk', () => {
    const controller = new HealthController(loadAppConfig(PROD), bundle());
    const dumped = JSON.stringify(controller.vkHealth());
    expect(dumped).not.toContain('test-token');
    expect(dumped).not.toContain('test-secret');
    expect(controller.vkHealth().vkConfigured).toBe(true);
  });
});

describe('graceful shutdown', () => {
  it('disconnects Prisma on module destroy', async () => {
    const prisma = { $disconnect: vi.fn(async () => undefined) };
    const life = new StoreLifecycle(bundle({ kind: 'prisma', prisma: prisma as never }));
    await life.onModuleDestroy();
    expect(prisma.$disconnect).toHaveBeenCalledOnce();
  });

  it('is a no-op when the process used MemoryStore', async () => {
    const life = new StoreLifecycle(bundle());
    await expect(life.onModuleDestroy()).resolves.toBeUndefined();
  });
});
