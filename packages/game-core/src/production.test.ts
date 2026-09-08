import { describe, expect, it } from 'vitest';
import {
  PRODUCTION,
  PRODUCTION_DEFS,
  PRODUCTION_LEVEL_MULT,
  dailyPrimaryAt,
  dailySecondaryAt,
  productionCost,
  productionRates,
  tickProduction,
} from '@kubolesie/content';
import { GAME_COMMANDS, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { TRADEABLE_RESOURCES } from '@kubolesie/content';

async function player(store: MemoryGameStore, vk: string) {
  const who = await store.createPlayer({ vkUserId: vk, name: 'Путник' });
  await store.setFlag(who.id, 'week_1_complete', '1');
  return who;
}

function event(
  type: NormalizedIncomingEvent['command']['type'],
  vkUserId: string,
  payload: Record<string, unknown> = {},
): NormalizedIncomingEvent {
  return {
    eventId: `e-${type}-${Math.random().toString(16).slice(2)}`,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
  };
}

async function fund(store: MemoryGameStore, playerId: string) {
  const who = (await store.findPlayerById(playerId))!;
  who.coins = 10_000;
  await store.savePlayer(who);
  for (const [resource, amount] of Object.entries({
    LOG: 200,
    PLANK: 200,
    COBBLESTONE: 200,
    IRON_INGOT: 40,
    COAL: 40,
    MIST_RESIN: 20,
  })) {
    await store.addResource(playerId, resource as never, amount);
  }
}

describe('production content', () => {
  it('keeps L10 at 4.6x and fill around 8–12 hours', () => {
    expect(PRODUCTION_LEVEL_MULT[1]).toBe(1);
    expect(PRODUCTION_LEVEL_MULT[10]).toBe(4.6);
    expect(PRODUCTION.maxLevel).toBe(10);
    for (const type of Object.keys(PRODUCTION_DEFS) as Array<keyof typeof PRODUCTION_DEFS>) {
      const l1 = productionRates(type, 1, 0);
      const hours = l1.capPrimary / l1.primaryPerHour;
      expect(hours).toBeGreaterThanOrEqual(8);
      expect(hours).toBeLessThanOrEqual(12.1);
    }
  });

  it('keeps mine iron as a side stream even at L10 + job 20', () => {
    expect(productionRates('MINE', 3, 20).secondaryPerHour).toBe(0);
    const l10 = productionRates('MINE', 10, 20);
    expect(l10.secondaryPerHour).toBeCloseTo(0.08 * 4.6 * 1.2, 5);
    expect(dailySecondaryAt('MINE', 10, 20)).toBeLessThanOrEqual(l10.capSecondary);
    expect(dailyPrimaryAt('SAWMILL', 1, 0)).toBe(Math.min(20, 2 * 24));
  });

  it('ticks with milli remainder, caps storage and clamps huge elapsed', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const start = {
      level: 1,
      storedPrimary: 0,
      storedSecondary: 0,
      accPrimaryMilli: 0,
      accSecondaryMilli: 0,
      lastCalculatedAt: new Date(now.getTime() - 30 * 60 * 1000),
    };
    const half = tickProduction('SAWMILL', start, now, 0);
    expect(half.producedPrimary).toBe(1);
    expect(half.accPrimaryMilli).toBe(0);
    const later = new Date(now.getTime() + 40 * 24 * 3600 * 1000);
    const long = tickProduction(
      'SAWMILL',
      { ...half, lastCalculatedAt: now },
      later,
      0,
    );
    expect(long.storedPrimary).toBe(productionRates('SAWMILL', 1, 0).capPrimary);
    expect(long.full).toBe(true);
    const neg = tickProduction(
      'SAWMILL',
      { ...start, lastCalculatedAt: new Date(now.getTime() + 60_000) },
      now,
      0,
    );
    expect(neg.producedPrimary).toBe(0);
  });
});

describe('production domain', () => {
  it('locks before the gate and builds L1 atomically', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const raw = await store.createPlayer({ vkUserId: 'prod-lock', name: 'Путник' });
    const locked = await runtime.handle(event('OPEN_MENU', raw.vkUserId, { menu: 'production' }));
    expect(locked.text).toMatch(/Недел/);
    const who = await player(store, 'prod-build');
    await expect(store.buildProductionBuilding({ playerId: who.id, buildingType: 'SAWMILL' })).rejects.toThrow();
    await fund(store, who.id);
    const coinsBefore = (await store.findPlayerById(who.id))!.coins;
    const logsBefore = (await store.getResources(who.id)).LOG ?? 0;
    const built = await store.buildProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: new Date('2026-09-08T12:00:00Z'),
    });
    expect(built.level).toBe(1);
    const cost = productionCost('SAWMILL', 0);
    expect((await store.findPlayerById(who.id))!.coins).toBe(coinsBefore - cost.coins);
    expect((await store.getResources(who.id)).LOG).toBe(logsBefore - (cost.resources.LOG ?? 0));
    await expect(
      store.buildProductionBuilding({ playerId: who.id, buildingType: 'SAWMILL' }),
    ).rejects.toThrow(/уже/i);
  });

  it('lazy-produces, caps, collects once and is duplicate-safe', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'prod-tick');
    await fund(store, who.id);
    const now = new Date('2026-09-08T00:00:00Z');
    await store.buildProductionBuilding({ playerId: who.id, buildingType: 'SAWMILL', now });
    const later = new Date(now.getTime() + 5 * 3600 * 1000);
    const ticked = await store.tickProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: later,
    });
    expect(ticked!.storedPrimary).toBe(10);
    const logsBefore = (await store.getResources(who.id)).LOG ?? 0;
    const collect = await store.collectProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: later,
      requestId: 'c1',
    });
    expect(collect.primary).toBe(10);
    expect((await store.getResources(who.id)).LOG).toBe(logsBefore + 10);
    const again = await store.collectProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: later,
      requestId: 'c1',
    });
    expect(again.primary).toBe(10);
    expect((await store.getResources(who.id)).LOG).toBe(logsBefore + 10);
    const empty = await store.collectProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: later,
      requestId: 'c2',
    });
    expect(empty.empty).toBe(true);
  });

  it('upgrades without losing storage and stops at L10', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'prod-up');
    await fund(store, who.id);
    const now = new Date('2026-09-08T00:00:00Z');
    await store.buildProductionBuilding({ playerId: who.id, buildingType: 'WHEAT_FARM', now });
    const later = new Date(now.getTime() + 4 * 3600 * 1000);
    await store.tickProductionBuilding({ playerId: who.id, buildingType: 'WHEAT_FARM', now: later });
    const stored = (await store.getProductionBuilding(who.id, 'WHEAT_FARM'))!.storedPrimary;
    expect(stored).toBeGreaterThan(0);
    const up = await store.upgradeProductionBuilding({
      playerId: who.id,
      buildingType: 'WHEAT_FARM',
      now: later,
    });
    expect(up.level).toBe(2);
    expect(up.storedPrimary).toBe(stored);
    const inner = store as unknown as { state: { productionBuildings: Array<{ level: number }> } };
    inner.state.productionBuildings[0]!.level = 10;
    await expect(
      store.upgradeProductionBuilding({ playerId: who.id, buildingType: 'WHEAT_FARM', now: later }),
    ).rejects.toThrow(/Максимальный/);
  });

  it('does not count fishery collect as fisher gather progress', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'prod-fish');
    await fund(store, who.id);
    const now = new Date('2026-09-08T00:00:00Z');
    await store.acceptJobTask({ playerId: who.id, templateId: 'fisher_catch', now });
    await store.buildProductionBuilding({ playerId: who.id, buildingType: 'FISHERY', now });
    const later = new Date(now.getTime() + 12 * 3600 * 1000);
    await store.collectProductionBuilding({ playerId: who.id, buildingType: 'FISHERY', now: later });
    expect((await store.getAcceptedJobTask(who.id, 'FISHER'))!.progress).toBe(0);
    expect(((await store.getResources(who.id)).RAW_FISH ?? 0) > 0).toBe(true);
  });

  it('keeps collected resources as ordinary tradeable stock', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'prod-mkt');
    await fund(store, who.id);
    const now = new Date('2026-09-08T00:00:00Z');
    await store.buildProductionBuilding({ playerId: who.id, buildingType: 'SAWMILL', now });
    await store.collectProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: new Date(now.getTime() + 3 * 3600 * 1000),
    });
    expect((TRADEABLE_RESOURCES as readonly string[]).includes('LOG')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('PROD_ACT')).toBe(true);
    expect(PRODUCTION.unlockFlag).toBe('week_1_complete');
  });

  it('applies profession bonus and concurrent collects stay atomic', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'prod-race');
    await fund(store, who.id);
    const now = new Date('2026-09-08T00:00:00Z');
    await store.buildProductionBuilding({ playerId: who.id, buildingType: 'SAWMILL', now });
    const later = new Date(now.getTime() + 2 * 3600 * 1000);
    const ticked = await store.tickProductionBuilding({
      playerId: who.id,
      buildingType: 'SAWMILL',
      now: later,
      jobLevel: 20,
    });
    expect(ticked!.accPrimaryMilli).toBeGreaterThan(0);
    const [a, b] = await Promise.all([
      store.collectProductionBuilding({
        playerId: who.id,
        buildingType: 'SAWMILL',
        now: later,
        requestId: 'ca',
      }),
      store.collectProductionBuilding({
        playerId: who.id,
        buildingType: 'SAWMILL',
        now: later,
        requestId: 'cb',
      }),
    ]);
    const gained = [a, b].filter((row) => !row.empty);
    expect(gained).toHaveLength(1);
  });

  it('opens a compact production hub after week 1', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const who = await player(store, 'prod-ui');
    const hub = await runtime.handle(event('OPEN_MENU', who.vkUserId, { menu: 'production' }));
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hub.text).toContain('Дворы');
    expect(hub.buttons.some((row) => row.label.includes('Пшеничная'))).toBe(true);
  });
});
