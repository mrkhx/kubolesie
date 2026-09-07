import { describe, expect, it } from 'vitest';
import { MemoryGameStore } from '@kubolesie/game-core';
import { loadAppConfig } from './app-config';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { checkAdminAnalyticsAuth, timingSafeEqualString } from './admin-auth';
import { resetMetricsForTests, snapshotMetrics } from './metrics';

const TOKEN = 'analytics-test-token';

function configWithToken() {
  return loadAppConfig({
    NODE_ENV: 'test',
    ADMIN_ANALYTICS_TOKEN: TOKEN,
    VK_GROUP_ID: '111',
    VK_GROUP_TOKEN: 'vk-token',
    VK_CALLBACK_SECRET: 'vk-secret',
    VK_CONFIRMATION_CODE: 'confirm',
  });
}

function fakeRes() {
  const box: { statusCode: number; body: unknown } = { statusCode: 0, body: null };
  const res = {
    status(code: number) {
      box.statusCode = code;
      return res;
    },
    json(body: unknown) {
      box.body = body;
      return res;
    },
  };
  return { res: res as never, box };
}

describe('admin analytics auth', () => {
  it('disables endpoints when the token is missing', () => {
    expect(checkAdminAnalyticsAuth(null, 'Bearer x')).toBe('disabled');
  });

  it('rejects missing and wrong bearer tokens', () => {
    expect(checkAdminAnalyticsAuth(TOKEN, undefined)).toBe('missing');
    expect(checkAdminAnalyticsAuth(TOKEN, 'Bearer nope')).toBe('wrong');
    expect(checkAdminAnalyticsAuth(TOKEN, `Bearer ${TOKEN}`)).toBe('ok');
  });

  it('compares tokens in constant time for equal length', () => {
    expect(timingSafeEqualString('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqualString('abcd', 'abce')).toBe(false);
  });

  it('returns 404 when analytics is disabled and 401 for a bad token', async () => {
    const store = new MemoryGameStore();
    const disabled = new AnalyticsController(
      loadAppConfig({ NODE_ENV: 'test' }),
      store,
      { store, kind: 'memory' },
    );
    const missing = fakeRes();
    await disabled.overview(undefined, missing.res, {} as never);
    expect(missing.box.statusCode).toBe(404);

    const armed = new AnalyticsController(configWithToken(), store, { store, kind: 'memory' });
    const wrong = fakeRes();
    await armed.overview('Bearer wrong-token', wrong.res, {} as never);
    expect(wrong.box.statusCode).toBe(401);
    const none = fakeRes();
    await armed.overview(undefined, none.res, {} as never);
    expect(none.box.statusCode).toBe(401);
  });
});

describe('admin analytics payloads', () => {
  it('returns overview counts without secrets', async () => {
    resetMetricsForTests();
    const store = new MemoryGameStore();
    const now = new Date('2026-09-07T12:00:00Z');
    const fresh = await store.createPlayer({ vkUserId: '1', name: 'А' });
    fresh.lastActiveAt = now;
    await store.savePlayer(fresh);
    await store.setFlag(fresh.id, 'week_1_complete', '1');
    const service = new AnalyticsService(store, { store, kind: 'memory' }, configWithToken());
    const overview = await service.overview(now);
    expect(overview.totalPlayers).toBe(1);
    expect(overview.week1Completed).toBe(1);
    expect(overview.dau).toBe(1);
    expect(overview.active5m).toBe(1);
    const system = await service.system();
    const dumped = JSON.stringify({ overview, system });
    expect(dumped).not.toContain(TOKEN);
    expect(dumped).not.toContain('vk-token');
    expect(dumped).not.toContain('vk-secret');
    expect(dumped).not.toContain('"confirm"');
    expect(system.processMetrics.durable).toBe(false);
    expect(system.vk.groupToken).toBe(true);
  });

  it('builds a progression funnel from flags', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'p1', name: 'А' });
    const b = await store.createPlayer({ vkUserId: 'p2', name: 'Б' });
    await store.setFlag(a.id, 'day_1_complete', '1');
    await store.setFlag(a.id, 'week_1_complete', '1');
    await store.setFlag(b.id, 'day_1_complete', '1');
    const service = new AnalyticsService(store, { store, kind: 'memory' }, configWithToken());
    const funnel = await service.progression();
    expect(funnel.registered.count).toBe(2);
    expect(funnel.days.day1.count).toBe(2);
    expect(funnel.week1Complete.count).toBe(1);
    expect(funnel.pvpUnlocked.count).toBe(1);
  });

  it('does not mutate gameplay while querying', async () => {
    const store = new MemoryGameStore();
    const player = await store.createPlayer({ vkUserId: 'z', name: 'З' });
    await store.addResource(player.id, 'LOG', 3);
    const service = new AnalyticsService(store, { store, kind: 'memory' }, configWithToken());
    await service.overview();
    await service.combat();
    await service.players();
    expect((await store.getResources(player.id)).LOG).toBe(3);
    expect((await store.getRating(player.id)).pvpRating).toBe(1000);
  });

  it('counts activity from last_active_at, not ignored chatter', async () => {
    const store = new MemoryGameStore();
    const idle = await store.createPlayer({ vkUserId: 'idle', name: 'Тихий' });
    idle.lastActiveAt = new Date('2026-01-01T00:00:00Z');
    await store.savePlayer(idle);
    const now = new Date('2026-09-07T12:00:00Z');
    const service = new AnalyticsService(store, { store, kind: 'memory' }, configWithToken());
    const overview = await service.overview(now);
    expect(overview.active5m).toBe(0);
    expect(overview.dau).toBe(0);
    expect(snapshotMetrics().adminEndpointRequests).toBeGreaterThanOrEqual(0);
  });
});
