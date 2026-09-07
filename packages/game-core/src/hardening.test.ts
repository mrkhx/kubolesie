import { describe, expect, it } from 'vitest';
import {
  applyPvpRating,
  clampLimit,
  clampOffset,
  computeLifetimeScore,
  eloDelta,
  FURNACE,
  isoWeekKey,
  PVP_RATING,
  QUERY_LIMIT_MAX,
  utcDayKey,
  VEL_BUYS,
  VEL_SELLS,
  WEEKLY_SCORE,
} from '@kubolesie/content';
import { GAME_COMMANDS as SHARED_COMMANDS, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { noteActivity } from './meta';
import { InsufficientResourcesError, StaleActionError } from './errors';
import type { PlayerRecord } from './store';

void SHARED_COMMANDS;

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-hard',
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Страж' },
    command: { type, payload },
  };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`, name = 'Страж') {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle({
    eventId: `start-${vkUserId}`,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: name },
    command: { type: 'START_GAME' },
  });
  const player = (await store.findPlayerById(started.state!.playerId!))!;
  return { store, runtime, player, vkUserId, started };
}

async function act(
  runtime: GameRuntime,
  vkUserId: string,
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId?: string,
) {
  return runtime.handle(event(type, payload, eventId ?? `e-${type}-${Math.random().toString(16).slice(2)}`, vkUserId));
}

async function reload(store: MemoryGameStore, playerId: string): Promise<PlayerRecord> {
  return (await store.findPlayerById(playerId))!;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('event idempotency', () => {
  it('replays duplicate gather without a second spend or grant', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const first = await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-once');
    const mid = await store.getResources(player.id);
    const stats = await store.getStatistics(player.id);
    const second = await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-once');
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).LOG).toBe(mid.LOG);
    expect((await store.getStatistics(player.id)).resourcesGathered).toBe(stats.resourcesGathered);
    expect(player.energy).toBeGreaterThanOrEqual((await reload(store, player.id)).energy);
  });

  it('replays duplicate craft with one plank', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 1);
    const first = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' }, 'craft-once');
    expect((await store.getResources(player.id)).PLANK).toBe(4);
    const second = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' }, 'craft-once');
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).PLANK).toBe(4);
    expect((await store.getResources(player.id)).LOG ?? 0).toBe(0);
    expect((await store.getStatistics(player.id)).craftedItems).toBe(1);
  });

  it('replays duplicate trade sell without double coins', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'met_vel', '1');
    await store.addResource(player.id, 'COAL', 1);
    const first = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'coal' }, 'trade-once');
    const coins = (await reload(store, player.id)).coins;
    const second = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'coal' }, 'trade-once');
    expect(second).toEqual(first);
    expect((await reload(store, player.id)).coins).toBe(coins);
    expect((await store.getResources(player.id)).COAL ?? 0).toBe(0);
  });

  it('replays duplicate PvP finish without a second Elo tick', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'yara_claim_seen', '1');
    const first = await act(runtime, vkUserId, 'START_PVP', { rivalId: 'yara_trace' }, 'pvp-once');
    const rating = (await store.getRating(player.id)).pvpRating;
    const skirmishes = (await store.getFlags(player.id)).pvp_skirmishes;
    const second = await act(runtime, vkUserId, 'START_PVP', { rivalId: 'yara_trace' }, 'pvp-once');
    expect(second).toEqual(first);
    expect((await store.getRating(player.id)).pvpRating).toBe(rating);
    expect((await store.getFlags(player.id)).pvp_skirmishes).toBe(skirmishes);
  });

  it('does not re-execute an in-flight stub with empty text', async () => {
    const { store, runtime, vkUserId } = await boot();
    await store.saveProcessedEvent({
      eventId: 'stub-empty',
      playerId: null,
      command: 'GATHER_WOOD',
      response: { text: '', buttons: [] },
      createdAt: new Date(),
    });
    const denied = await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'stub-empty');
    expect(denied.text).toMatch(/нельзя/i);
    expect((await store.getResources((await store.findPlayerByVkUserId(vkUserId))!.id)).LOG ?? 0).toBe(0);
  });

  it('repeats the same event 20 times and matches a single execution', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const first = await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-20');
    const logs = (await store.getResources(player.id)).LOG;
    const energy = (await reload(store, player.id)).energy;
    for (let i = 0; i < 19; i += 1) {
      const again = await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-20');
      expect(again).toEqual(first);
    }
    expect((await store.getResources(player.id)).LOG).toBe(logs);
    expect((await reload(store, player.id)).energy).toBe(energy);
  });
});

describe('stale callbacks', () => {
  it('rejects a craft after the logs are gone', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 1);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    const stale = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    expect(stale.text).toMatch(/хват|бревно|нельзя/i);
    expect((await store.getResources(player.id)).LOG ?? 0).toBe(0);
    expect((await store.getResources(player.id)).PLANK).toBe(4);
  });

  it('blocks CLAIM_REWARD from burning structure, tribute, boss or combat keys', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    for (const [rewardType, rewardRef] of [
      ['structure', 'barricade'],
      ['tribute', 'yara'],
      ['boss', 'wenzel_warden'],
      ['combat_loot', 'stumpfang:first'],
      ['unique_loot', 'stumpfang_tooth'],
      ['quest', 'iron_for_gate'],
    ] as const) {
      const denied = await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType, rewardRef });
      expect(denied.text).toMatch(/не найдена|нельзя/i);
      expect(await store.hasRewardClaim(player.id, rewardType, rewardRef)).toBe(false);
    }
  });

  it('does not teleport Day 1 into Wenzel prep or the wedge', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const prep = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'prep' });
    expect(prep.text).toMatch(/нельзя/i);
    expect((await reload(store, player.id)).currentLocation).not.toBe('seal_forecourt');
    const wedge = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'wedge' });
    expect(wedge.text).toMatch(/нельзя/i);
    expect((await reload(store, player.id)).currentLocation).not.toBe('ashen_wedge');
    const pvp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'pvp' });
    expect(pvp.text).toMatch(/нельзя/i);
  });

  it('rejects START_PVE Wenzel before Day 7 flags', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'wenzel_warden' });
    expect(denied.text).toMatch(/нельзя/i);
  });
});

describe('inventory and coins', () => {
  it('throws on negative resource spend instead of clamping', async () => {
    const { store, player } = await boot();
    await expect(store.addResource(player.id, 'LOG', -1)).rejects.toBeInstanceOf(InsufficientResourcesError);
    expect((await store.getResources(player.id)).LOG ?? 0).toBe(0);
  });

  it('never stores a negative resource after a race of spends', async () => {
    const { store, player } = await boot();
    await store.addResource(player.id, 'COAL', 1);
    const results = await Promise.allSettled([
      store.addResource(player.id, 'COAL', -1),
      store.addResource(player.id, 'COAL', -1),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect((await store.getResources(player.id)).COAL ?? 0).toBe(0);
  });

  it('rejects NaN resource deltas', async () => {
    const { store, player } = await boot();
    await expect(store.addResource(player.id, 'LOG', Number.NaN)).rejects.toBeInstanceOf(InsufficientResourcesError);
  });

  it('refuses to drive coins below zero', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'met_vel', '1');
    const denied = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'buy', sku: 'rusk' });
    expect(denied.text).toMatch(/монет/i);
    expect((await reload(store, player.id)).coins).toBe(0);
  });

  it('keeps quantity >= 0 across 80 seeded resource ops', async () => {
    const { store, player } = await boot();
    const rand = mulberry32(42);
    const kinds = ['LOG', 'COAL', 'COBBLESTONE', 'IRON_ORE'] as const;
    for (let i = 0; i < 80; i += 1) {
      const resource = kinds[Math.floor(rand() * kinds.length)]!;
      const have = (await store.getResources(player.id))[resource] ?? 0;
      const delta = Math.floor(rand() * 5) - 2;
      if (delta < 0 && have + delta < 0) {
        await expect(store.addResource(player.id, resource, delta)).rejects.toBeInstanceOf(InsufficientResourcesError);
        expect((await store.getResources(player.id))[resource] ?? 0).toBe(have);
      } else {
        const next = await store.addResource(player.id, resource, delta);
        expect(next).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('unique loot', () => {
  it('grants unique loot keys only once', async () => {
    const { store, player } = await boot();
    expect(await store.tryClaimReward(player.id, 'unique_loot', 'stumpfang_tooth')).toBe(true);
    expect(await store.tryClaimReward(player.id, 'unique_loot', 'stumpfang_tooth')).toBe(false);
    expect(await store.tryClaimReward(player.id, 'unique_loot', 'wenzel_plate')).toBe(true);
    expect(await store.tryClaimReward(player.id, 'boss', 'wenzel_warden')).toBe(true);
    expect(await store.tryClaimReward(player.id, 'boss', 'wenzel_warden')).toBe(false);
  });

  it('does not let a rematch of a boss inflate weekly or clan score', async () => {
    const { store, player } = await boot();
    const clan = await store.createClan({ name: 'Клык', tag: 'КЛК', description: '', leaderPlayerId: player.id });
    const now = new Date('2026-09-07T12:00:00.000Z');
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'stumpfang' }, now);
    const weekly = (await store.getRating(player.id)).weeklyScore;
    const xp = (await store.getClan(clan.id))!.xp;
    await noteActivity(store, await reload(store, player.id), { type: 'pve', result: 'WIN', enemyId: 'stumpfang' }, now);
    expect((await store.getRating(player.id)).weeklyScore).toBe(weekly);
    expect((await store.getClan(clan.id))!.xp).toBe(xp);
    expect((await store.getStatistics(player.id)).bossWins).toBe(2);
  });
});

describe('pvp rating', () => {
  it('starts at 1000, uses K=16 then K=8, and clamps 100..3000', async () => {
    const { store, player } = await boot();
    const start = (await store.getRating(player.id)).pvpRating;
    expect(start).toBe(1000);
    await noteActivity(store, player, { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' });
    const mid = await store.getRating(player.id);
    expect(mid.pvpRating).toBe(start + eloDelta(start, PVP_RATING.synthetic.yara_trace, true, PVP_RATING.k));
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' });
    const again = await store.getRating(player.id);
    expect(again.pvpRating).toBe(
      mid.pvpRating + eloDelta(mid.pvpRating, PVP_RATING.synthetic.yara_trace, true, PVP_RATING.kRepeat),
    );
    const floor = await store.getRating(player.id);
    floor.pvpRating = 100;
    await store.saveRating(floor);
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'LOSS', rivalId: 'foreign_post' });
    expect((await store.getRating(player.id)).pvpRating).toBeGreaterThanOrEqual(100);
    const cap = await store.getRating(player.id);
    cap.pvpRating = 3000;
    await store.saveRating(cap);
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'WIN', rivalId: 'wedge_scout' });
    expect((await store.getRating(player.id)).pvpRating).toBeLessThanOrEqual(3000);
  });

  it('rejects a client rivalId that is not a PvP rival', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'yara_claim_seen', '1');
    const denied = await act(runtime, vkUserId, 'START_PVP', { rivalId: 'wild_shrew' });
    expect(denied.text).toMatch(/след|нельзя/i);
    expect((await store.getFlags(player.id)).pvp_skirmishes).toBeUndefined();
    expect((await store.getRating(player.id)).pvpRating).toBe(1000);
  });

  it('caps synthetic PvP at 3 skirmishes a day', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'yara_claim_seen', '1');
    await act(runtime, vkUserId, 'START_PVP');
    await act(runtime, vkUserId, 'START_PVP');
    await act(runtime, vkUserId, 'START_PVP');
    const fourth = await act(runtime, vkUserId, 'START_PVP');
    expect(fourth.text).toMatch(/лимит/i);
    expect((await store.getFlags(player.id)).pvp_skirmishes).toBe('3');
  });

  it('keeps 100 random Elo results inside the floor and ceiling', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 100; i += 1) {
      const current = Math.floor(rand() * 4000) - 200;
      const delta = Math.floor(rand() * 80) - 40;
      const next = applyPvpRating(current, delta);
      expect(next).toBeGreaterThanOrEqual(PVP_RATING.floor);
      expect(next).toBeLessThanOrEqual(PVP_RATING.ceiling);
      expect(Number.isFinite(next)).toBe(true);
    }
    expect(applyPvpRating(Number.NaN, 10)).toBeGreaterThanOrEqual(PVP_RATING.floor);
    expect(applyPvpRating(1000, Number.NaN)).toBe(1000);
  });
});

describe('weekly and daily periods', () => {
  it('computes ISO weeks in UTC including 52/53 and year rollover', () => {
    expect(isoWeekKey(new Date('2026-09-07T12:00:00.000Z'))).toBe('2026-W37');
    expect(isoWeekKey(new Date('2026-12-31T23:00:00.000Z'))).toBe('2026-W53');
    expect(isoWeekKey(new Date('2027-01-01T01:00:00.000Z'))).toBe('2026-W53');
    expect(isoWeekKey(new Date('2027-01-04T00:00:00.000Z'))).toBe('2027-W01');
    expect(isoWeekKey(new Date('2021-01-01T00:00:00.000Z'))).toBe('2020-W53');
  });

  it('uses UTC day keys, not the server local calendar', () => {
    expect(utcDayKey(new Date('2026-09-07T23:30:00.000Z'))).toBe('2026-09-07');
    expect(utcDayKey(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');
  });

  it('keeps weekly history across a year boundary and preserves lifetime', async () => {
    const { store, player } = await boot();
    const weekA = new Date('2026-12-31T12:00:00.000Z');
    const weekB = new Date('2027-01-04T12:00:00.000Z');
    expect(isoWeekKey(weekA)).toBe('2026-W53');
    expect(isoWeekKey(weekB)).toBe('2027-W01');
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' }, weekA);
    const afterA = await store.getRating(player.id);
    const lifetime = afterA.lifetimeScore;
    const weeklyA = afterA.weeklyScore;
    expect(weeklyA).toBe(WEEKLY_SCORE.pveWin);
    await noteActivity(store, await reload(store, player.id), { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' }, weekB);
    const afterB = await store.getRating(player.id);
    expect(afterB.weeklyPeriod).toBe('2027-W01');
    expect(afterB.weeklyScore).toBe(WEEKLY_SCORE.pveWin);
    expect(afterB.lifetimeScore).toBeGreaterThan(lifetime);
    expect(await store.getWeeklyScore(player.id, '2026-W53')).toBe(weeklyA);
    expect(await store.getWeeklyScore(player.id, '2027-W01')).toBe(afterB.weeklyScore);
    const oldBoard = await store.listScoreboard('weekly', '2026-W53', 10, 0);
    expect(oldBoard.some((row) => row.id === player.id)).toBe(true);
  });

  it('defaults missing score inputs to zero and never returns NaN', () => {
    const score = computeLifetimeScore({
      level: Number.NaN,
      xp: Number.POSITIVE_INFINITY,
      daysCompleted: Number.NaN,
      weekComplete: false,
      bossWins: Number.NaN,
      pveWins: Number.NaN,
      pvpRating: Number.NaN,
      discoveries: Number.NaN,
      rareItems: Number.NaN,
    });
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('trade', () => {
  it('rejects selling more than the player owns', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'met_vel', '1');
    const denied = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'ore' });
    expect(denied.text).toMatch(/нет|ресурс/i);
    expect((await reload(store, player.id)).coins).toBe(0);
  });

  it('sells a rusty token exactly once', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'met_vel', '1');
    const token = await store.createItem({ playerId: player.id, templateId: 'rusty_token', rarity: 'UNCOMMON' });
    void token;
    const first = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    expect(first.text).toMatch(/жетон/i);
    const coins = (await reload(store, player.id)).coins;
    const second = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    expect(second.text).toMatch(/уже|нет/i);
    expect((await reload(store, player.id)).coins).toBe(coins);
    expect((await store.listItems(player.id)).some((row) => row.templateId === 'rusty_token')).toBe(false);
  });

  it('has no catalog arbitrage on overlapping resources', () => {
    for (const buy of VEL_SELLS) {
      if (!buy.resource) continue;
      const sell = VEL_BUYS.find((row) => row.resource === buy.resource);
      if (!sell) continue;
      const unit = buy.price / (buy.amount ?? 1);
      expect(sell.price).toBeLessThan(unit);
    }
  });

  it('serializes two simultaneous sells of a single coal', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'met_vel', '1');
    await store.addResource(player.id, 'COAL', 1);
    const results = await Promise.all([
      act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'coal' }, 'sell-a'),
      act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'coal' }, 'sell-b'),
    ]);
    const ok = results.filter((row) => row.text.includes('Продано')).length;
    expect(ok).toBe(1);
    expect((await store.getResources(player.id)).COAL ?? 0).toBe(0);
    expect((await reload(store, player.id)).coins).toBeGreaterThan(0);
  });
});

describe('furnace', () => {
  it('keeps GDD log fuel (2 LOG = 3) and coal = 8', () => {
    expect(FURNACE.coalFuel).toBe(8);
    expect(FURNACE.logFuel).toBe(3);
    expect(FURNACE.logCost).toBe(2);
    expect(FURNACE.smeltCost).toBe(1);
  });

  it('smelts with remainder and never stores negative fuel', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'furnace_placed', '1');
    await store.addResource(player.id, 'COAL', 1);
    await store.addResource(player.id, 'IRON_ORE', 10);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    expect((await store.getFlags(player.id)).furnace_fuel).toBe('8');
    for (let i = 0; i < 8; i += 1) await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect(Number((await store.getFlags(player.id)).furnace_fuel)).toBe(0);
    const dry = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect(dry.text).toMatch(/топлив/i);
    expect(Number((await store.getFlags(player.id)).furnace_fuel)).toBe(0);
    await store.addResource(player.id, 'LOG', 2);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_log' });
    expect(Number((await store.getFlags(player.id)).furnace_fuel)).toBe(3);
  });

  it('replays a duplicate smelt without a second ingot', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'furnace_placed', '1');
    await store.setFlag(player.id, 'furnace_fuel', '1');
    await store.addResource(player.id, 'IRON_ORE', 1);
    const first = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' }, 'smelt-once');
    const second = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' }, 'smelt-once');
    expect(second).toEqual(first);
    expect((await store.getFlags(player.id)).furnace_output).toBe('1');
    expect(Number((await store.getFlags(player.id)).furnace_fuel)).toBe(0);
  });

  it('serializes simultaneous smelts against one fuel unit', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'furnace_placed', '1');
    await store.setFlag(player.id, 'furnace_fuel', '1');
    await store.addResource(player.id, 'IRON_ORE', 5);
    const results = await Promise.all([
      act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' }, 'smelt-a'),
      act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' }, 'smelt-b'),
    ]);
    const melted = results.filter((row) => row.text.includes('Плавка')).length;
    expect(melted).toBe(1);
    expect((await store.getFlags(player.id)).furnace_output).toBe('1');
    expect(Number((await store.getFlags(player.id)).furnace_fuel)).toBe(0);
  });
});

describe('clans', () => {
  it('normalizes name/tag so Forest / forest / FOREST collide', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'a', name: 'А' });
    const b = await store.createPlayer({ vkUserId: 'b', name: 'Б' });
    await store.createClan({ name: 'Forest', tag: 'FRS', description: '', leaderPlayerId: a.id });
    await expect(
      store.createClan({ name: 'forest', tag: 'zzz', description: '', leaderPlayerId: b.id }),
    ).rejects.toThrow('name_taken');
    await expect(
      store.createClan({ name: ' Grove ', tag: 'frs', description: '', leaderPlayerId: b.id }),
    ).rejects.toThrow('tag_taken');
  });

  it('blocks a member from officer and leader actions', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'lead', name: 'Лидер' });
    const mem = await store.createPlayer({ vkUserId: 'mem', name: 'Рядовой' });
    const extra = await store.createPlayer({ vkUserId: 'x', name: 'Цель' });
    const clan = await store.createClan({ name: 'Стая', tag: 'СТА', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: mem.id, role: 'MEMBER' });
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-mem', 'mem'));
    for (const payload of [
      { act: 'accept', appId: 'nope' },
      { act: 'kick', targetId: extra.id },
      { act: 'promote', targetId: extra.id },
      { act: 'demote', targetId: extra.id },
      { act: 'transfer', targetId: extra.id },
      { act: 'disband' },
    ]) {
      const denied = await act(runtime, 'mem', 'CLAN_ACT', payload);
      expect(denied.text).toMatch(/прав|лидер|нельзя/i);
    }
    expect((await store.getPlayerClan(lead.id))?.member.role).toBe('LEADER');
  });

  it('stops an officer from kicking the leader, transferring or disbanding', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'l2', name: 'Лидер' });
    const off = await store.createPlayer({ vkUserId: 'o2', name: 'Офицер' });
    const clan = await store.createClan({ name: 'Клин', tag: 'КЛН', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: off.id, role: 'OFFICER' });
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-o2', 'o2'));
    expect((await act(runtime, 'o2', 'CLAN_ACT', { act: 'kick', targetId: lead.id })).text).toMatch(/лидер/i);
    expect((await act(runtime, 'o2', 'CLAN_ACT', { act: 'transfer', targetId: off.id })).text).toMatch(/лидер/i);
    expect((await act(runtime, 'o2', 'CLAN_ACT', { act: 'disband' })).text).toMatch(/лидер/i);
    expect((await store.getPlayerClan(lead.id))?.member.role).toBe('LEADER');
  });

  it('does not let an officer reject another clan application', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'oa', name: 'А' });
    const b = await store.createPlayer({ vkUserId: 'ob', name: 'Б' });
    const applicant = await store.createPlayer({ vkUserId: 'oc', name: 'В' });
    const clanA = await store.createClan({ name: 'Альфа', tag: 'АЛФ', description: '', leaderPlayerId: a.id });
    const clanB = await store.createClan({ name: 'Бета', tag: 'БЕТ', description: '', leaderPlayerId: b.id });
    const off = await store.createPlayer({ vkUserId: 'ood', name: 'Офицер А' });
    await store.addClanMember({ clanId: clanA.id, playerId: off.id, role: 'OFFICER' });
    const app = await store.createApplication(clanB.id, applicant.id);
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-ood', 'ood'));
    const denied = await act(runtime, 'ood', 'CLAN_ACT', { act: 'reject', appId: app.id });
    expect(denied.text).toMatch(/нет|нельзя/i);
    expect((await store.getApplication(app.id))?.status).toBe('PENDING');
  });

  it('treats a second accept of the same application as stale', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'la', name: 'Лидер' });
    const appPlayer = await store.createPlayer({ vkUserId: 'ap', name: 'Заявка' });
    const clan = await store.createClan({ name: 'Узел', tag: 'УЗЛ', description: '', leaderPlayerId: lead.id });
    const app = await store.createApplication(clan.id, appPlayer.id);
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-la', 'la'));
    const first = await act(runtime, 'la', 'CLAN_ACT', { act: 'accept', appId: app.id });
    expect(first.text).toContain('Принят');
    const second = await act(runtime, 'la', 'CLAN_ACT', { act: 'accept', appId: app.id });
    expect(second.text).toMatch(/уже|обработана|нет/i);
    expect((await store.listClanMembers(clan.id)).filter((row) => row.playerId === appPlayer.id)).toHaveLength(1);
  });

  it('keeps a player in at most one clan under concurrent accepts', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'ca', name: 'А' });
    const b = await store.createPlayer({ vkUserId: 'cb', name: 'Б' });
    const target = await store.createPlayer({ vkUserId: 'ct', name: 'Цель' });
    const clanA = await store.createClan({ name: 'Север', tag: 'СВР', description: '', leaderPlayerId: a.id });
    const clanB = await store.createClan({ name: 'Юг', tag: 'ЮГГ', description: '', leaderPlayerId: b.id });
    const results = await Promise.allSettled([
      store.addClanMember({ clanId: clanA.id, playerId: target.id, role: 'MEMBER' }),
      store.addClanMember({ clanId: clanB.id, playerId: target.id, role: 'MEMBER' }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const membership = await store.getPlayerClan(target.id);
    expect(membership).not.toBeNull();
    expect((await store.listClanMembers(clanA.id)).concat(await store.listClanMembers(clanB.id)).filter((row) => row.playerId === target.id)).toHaveLength(1);
  });

  it('clears memberships on disband so the player can join another clan', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'ld', name: 'Лидер' });
    const mem = await store.createPlayer({ vkUserId: 'md', name: 'Член' });
    const other = await store.createPlayer({ vkUserId: 'od', name: 'Другой' });
    const clan = await store.createClan({ name: 'Пыль', tag: 'ПЫЛ', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: mem.id, role: 'MEMBER' });
    const app = await store.createApplication(clan.id, other.id);
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-ld', 'ld'));
    const prompt = await act(runtime, 'ld', 'CLAN_ACT', { act: 'disband' });
    expect(prompt.text).toMatch(/Подтверди|подтвер/i);
    const token = String(prompt.buttons.find((button) => button.payload?.act === 'confirm_disband')?.payload?.token ?? '');
    const gone = await act(runtime, 'ld', 'CLAN_ACT', { act: 'confirm_disband', token });
    expect(gone.text).toMatch(/распущ/i);
    expect(await store.getPlayerClan(lead.id)).toBeNull();
    expect(await store.getPlayerClan(mem.id)).toBeNull();
    expect((await store.getClan(clan.id))?.disbandedAt).toBeTruthy();
    expect((await store.getApplication(app.id))?.status).toBe('CANCELLED');
    const next = await store.createClan({ name: 'Новая', tag: 'НОВ', description: '', leaderPlayerId: mem.id });
    expect(next.leaderPlayerId).toBe(mem.id);
  });

  it('races transfer with leave and still has exactly one leader or a disbanded clan', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'lt', name: 'Лидер' });
    const off = await store.createPlayer({ vkUserId: 'ot', name: 'Офицер' });
    const clan = await store.createClan({ name: 'Гонка', tag: 'ГОН', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: off.id, role: 'OFFICER' });
    const runtimeLead = new GameRuntime(store);
    const runtimeOff = new GameRuntime(store);
    await runtimeLead.handle(event('START_GAME', {}, 's-lt', 'lt'));
    await runtimeOff.handle(event('START_GAME', {}, 's-ot', 'ot'));
    await Promise.all([
      act(runtimeLead, 'lt', 'CLAN_ACT', { act: 'transfer', targetId: off.id }),
      act(runtimeOff, 'ot', 'CLAN_ACT', { act: 'leave' }),
    ]);
    const left = await store.getPlayerClan(off.id);
    const leadRow = await store.getPlayerClan(lead.id);
    if (!left && !leadRow) return;
    const members = left
      ? await store.listClanMembers(left.clan.id)
      : await store.listClanMembers(leadRow!.clan.id);
    expect(members.filter((row) => row.role === 'LEADER')).toHaveLength(1);
  });

  it('races kick with leave without duplicating membership', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'lk', name: 'Лидер' });
    const mem = await store.createPlayer({ vkUserId: 'mk', name: 'Член' });
    const clan = await store.createClan({ name: 'Исход', tag: 'ИСХ', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: mem.id, role: 'MEMBER' });
    const runtimeLead = new GameRuntime(store);
    const runtimeMem = new GameRuntime(store);
    await runtimeLead.handle(event('START_GAME', {}, 's-lk', 'lk'));
    await runtimeMem.handle(event('START_GAME', {}, 's-mk', 'mk'));
    await Promise.all([
      act(runtimeLead, 'lk', 'CLAN_ACT', { act: 'kick', targetId: mem.id }),
      act(runtimeMem, 'mk', 'CLAN_ACT', { act: 'leave' }),
    ]);
    expect(await store.getPlayerClan(mem.id)).toBeNull();
    expect((await store.listClanMembers(clan.id)).filter((row) => row.playerId === mem.id)).toHaveLength(0);
  });

  it('never grants a MEMBER admin powers across random attempts', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'lr', name: 'Лидер' });
    const mem = await store.createPlayer({ vkUserId: 'mr', name: 'Рядовой' });
    const clan = await store.createClan({ name: 'Случай', tag: 'СЛЧ', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: mem.id, role: 'MEMBER' });
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 's-mr', 'mr'));
    const rand = mulberry32(99);
    const acts = ['accept', 'kick', 'promote', 'demote', 'transfer', 'disband'] as const;
    for (let i = 0; i < 24; i += 1) {
      const actName = acts[Math.floor(rand() * acts.length)]!;
      const denied = await act(runtime, 'mr', 'CLAN_ACT', { act: actName, targetId: lead.id, appId: 'x' });
      expect(denied.text).toMatch(/прав|лидер|нельзя|нет/i);
    }
    expect((await store.getPlayerClan(mem.id))?.member.role).toBe('MEMBER');
    expect((await store.getPlayerClan(lead.id))?.member.role).toBe('LEADER');
    void clan;
  });
});

describe('meta entitlements achievements pagination', () => {
  it('keeps achievements and entitlements unique under parallel backfill', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'player_camp_founded', '1');
    await store.setFlag(player.id, 'first_ingot', '1');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await Promise.all([
      act(runtime, vkUserId, 'OPEN_PROFILE'),
      act(runtime, vkUserId, 'OPEN_PROFILE'),
      act(runtime, vkUserId, 'OPEN_MENU', { menu: 'achievements' }),
    ]);
    const owned = await store.listAchievements(player.id);
    const ids = owned.map((row) => row.achievementId);
    expect(ids.filter((id) => id === 'FIRST_CAMP')).toHaveLength(1);
    expect(ids.filter((id) => id === 'FIRST_IRON')).toHaveLength(1);
    expect(ids.filter((id) => id === 'WEEK_ONE_COMPLETE')).toHaveLength(1);
    expect((await store.listEntitlements(player.id)).filter((row) => row.productId === 'title_node_warden')).toHaveLength(1);
  });

  it('refuses to equip an unowned cosmetic', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'COSMETIC_ACT', { act: 'equip', productId: 'frame_ashen' });
    expect(denied.text).toMatch(/не принадлежит/i);
    expect((await store.getCosmetics(player.id)).profileFrame).toBeNull();
  });

  it('does not duplicate an entitlement grant', async () => {
    const { store, player } = await boot();
    expect(await store.tryGrantEntitlement(player.id, 'badge_week1', 'test')).toBe(true);
    expect(await store.tryGrantEntitlement(player.id, 'badge_week1', 'test')).toBe(false);
    expect((await store.listEntitlements(player.id)).filter((row) => row.productId === 'badge_week1')).toHaveLength(1);
  });

  it('clamps leaderboard pagination and ignores NaN pages', async () => {
    const store = new MemoryGameStore();
    for (let i = 0; i < 12; i += 1) {
      const player = await store.createPlayer({ vkUserId: `p${i}`, name: `N${i}` });
      const rating = await store.getRating(player.id);
      rating.lifetimeScore = (12 - i) * 10;
      await store.saveRating(rating);
    }
    const huge = await store.listScoreboard('score', '2026-W37', 9999, -5);
    expect(huge.length).toBe(12);
    expect(huge.length).toBeLessThanOrEqual(QUERY_LIMIT_MAX);
    expect(await store.listScoreboard('score', '2026-W37', Number.NaN, Number.NaN)).toHaveLength(10);
    expect(clampLimit(9999)).toBe(QUERY_LIMIT_MAX);
    expect(clampLimit(Number.NaN)).toBe(10);
    expect(clampOffset(-20)).toBe(0);
    const { runtime, vkUserId } = await boot();
    const page = await act(runtime, vkUserId, 'LEADERBOARD_PAGE', { board: 'score', page: Number.NaN });
    expect(page.text).toMatch(/рейтинг/i);
    expect(page.text).not.toContain('NaN');
  });

  it('has no production BUY, SET_RATING, GRANT_PREMIUM or SET_STATS command', () => {
    expect(SHARED_COMMANDS.some((command) => command.includes('BUY'))).toBe(false);
    expect(SHARED_COMMANDS).not.toContain('GRANT_PREMIUM');
    expect(SHARED_COMMANDS).not.toContain('SET_RATING');
    expect(SHARED_COMMANDS).not.toContain('SET_STATS');
    expect(SHARED_COMMANDS).not.toContain('BEGIN_DAY_15');
  });

  it('does not expose player ids or SQL in a compact hero hub', async () => {
    const { runtime, vkUserId, player } = await boot();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.length).toBeLessThanOrEqual(5);
    expect(hero.text).not.toContain(player.id);
    expect(hero.text).not.toMatch(/prisma|p2002|sql/i);
    const unknown = await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType: 'structure', rewardRef: 'barricade' });
    expect(unknown.text).not.toMatch(/prisma|p2002|constraint/i);
  });
});

describe('pets and tribute ordering', () => {
  it('does not spend coal again if the emberkit is already bonded', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'emberkit_rescued', '1');
    await store.setFlag(player.id, 'emberkit_bonded', '1');
    await store.addResource(player.id, 'COAL', 1);
    const again = await act(runtime, vkUserId, 'HELP_PET', { act: 'tame' });
    expect(again.text).toMatch(/уже/i);
    expect((await store.getResources(player.id)).COAL).toBe(1);
  });

  it('does not spend food again if the scavenger is already bonded', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'scavenger_bonded', '1');
    await store.addResource(player.id, 'RAW_MEAT', 1);
    const again = await act(runtime, vkUserId, 'HELP_PET', { act: 'help' });
    expect(again.text).toMatch(/уже/i);
    expect((await store.getResources(player.id)).RAW_MEAT).toBe(1);
  });

  it('claims tribute before spending coins', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'yara_claim_seen', '1');
    player.coins = 20;
    await store.savePlayer(player);
    const first = await act(runtime, vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    expect(first.text).toMatch(/дань/i);
    expect(await store.hasRewardClaim(player.id, 'tribute', 'yara')).toBe(true);
    const coins = (await reload(store, player.id)).coins;
    const second = await act(runtime, vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    expect(second.text).toMatch(/уже/i);
    expect((await reload(store, player.id)).coins).toBe(coins);
  });
});

describe('createPlayer and domain errors', () => {
  it('returns the existing player instead of throwing on duplicate vkUserId', async () => {
    const store = new MemoryGameStore();
    const first = await store.createPlayer({ vkUserId: 'same', name: 'Один' });
    const second = await store.createPlayer({ vkUserId: 'same', name: 'Два' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Один');
  });

  it('exposes StaleActionError as a domain code', () => {
    const error = new StaleActionError();
    expect(error.code).toBe('STALE_ACTION');
    expect(error.message).not.toMatch(/sql|prisma/i);
  });
});
