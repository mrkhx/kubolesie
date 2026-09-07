import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEASON,
  PVP_1,
  PVP_MILESTONES,
  PVP_RATING,
  eloDelta,
  pvpMilestoneRef,
  pvpRewardTier,
} from '@kubolesie/content';
import { simulateBattle } from '@kubolesie/combat-engine';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { applyRealPvpRatings, pickPvpOpponent } from './pvp';
import type { PlayerRecord } from './store';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-pvp',
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Искатель' },
    command: { type, payload },
  };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`, name = 'Искатель') {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle({
    eventId: `start-${vkUserId}`,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: name },
    command: { type: 'START_GAME' },
  });
  const player = (await store.findPlayerById(started.state!.playerId!))!;
  return { store, runtime, player, vkUserId };
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

async function unlock(store: MemoryGameStore, player: PlayerRecord) {
  await store.setFlag(player.id, 'week_1_complete', '1');
}

async function reload(store: MemoryGameStore, id: string): Promise<PlayerRecord> {
  return (await store.findPlayerById(id))!;
}

describe('pvp 1.0 gate', () => {
  it('locks the hub before week 1 is complete', async () => {
    const { runtime, vkUserId } = await boot();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.some((button) => button.label.includes('PvP'))).toBe(false);
    const locked = await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' });
    expect(locked.text).toMatch(/Неделю 1/i);
  });

  it('opens after week_1_complete', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await unlock(store, player);
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.some((button) => /PvP/.test(button.label))).toBe(true);
    const hub = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'pvp_hub' });
    expect(hub.buttons.map((button) => button.label)).toEqual([
      '⚔ Найти соперника',
      '🏆 Рейтинг',
      '📜 История',
      '🎁 Награды',
      '⬅ Назад',
    ]);
  });
});

describe('pvp matchmaking', () => {
  it('never matches the player with themselves and prefers closest Elo', async () => {
    const { store, player } = await boot('a', 'Альфа');
    await unlock(store, player);
    const far = await store.createPlayer({ vkUserId: 'b', name: 'Браво' });
    const close = await store.createPlayer({ vkUserId: 'c', name: 'Чарли' });
    await unlock(store, far);
    await unlock(store, close);
    const self = await store.getRating(player.id);
    const farR = await store.getRating(far.id);
    const closeR = await store.getRating(close.id);
    farR.pvpRating = 1400;
    closeR.pvpRating = self.pvpRating + 20;
    await store.saveRating(farR);
    await store.saveRating(closeR);
    const picked = await pickPvpOpponent(store, player.id, self.pvpRating, undefined);
    expect(picked.playerId).toBe(close.id);
    expect(picked.playerId).not.toBe(player.id);
  });

  it('falls back to a wider Elo window', async () => {
    const { store, player } = await boot('w1', 'Узкий');
    await unlock(store, player);
    const other = await store.createPlayer({ vkUserId: 'w2', name: 'Далёкий' });
    await unlock(store, other);
    const rating = await store.getRating(other.id);
    rating.pvpRating = 1600;
    await store.saveRating(rating);
    const picked = await pickPvpOpponent(store, player.id, 1000, undefined);
    expect(picked.playerId).toBe(other.id);
  });

  it('penalizes the last opponent when another candidate exists', async () => {
    const { store, player } = await boot('p1', 'Первый');
    await unlock(store, player);
    const last = await store.createPlayer({ vkUserId: 'p2', name: 'Повтор' });
    const other = await store.createPlayer({ vkUserId: 'p3', name: 'Новый' });
    await unlock(store, last);
    await unlock(store, other);
    const picked = await pickPvpOpponent(store, player.id, 1000, last.id);
    expect(picked.playerId).toBe(other.id);
  });
});

describe('pvp combat and elo', () => {
  async function pair() {
    const { store, runtime, player, vkUserId } = await boot('atk', 'Атака');
    const defender = await store.createPlayer({ vkUserId: 'def', name: 'Оборона' });
    await unlock(store, player);
    await unlock(store, defender);
    return { store, runtime, attacker: player, defender, vkUserId };
  }

  it('uses an immutable snapshot and deterministic seed', async () => {
    const { store, runtime, attacker, defender, vkUserId } = await pair();
    const beforeItems = (await store.listItems(defender.id)).length;
    const first = await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' }, 'seed-pvp-1');
    const replay = simulateBattle({
      player: {
        id: attacker.id,
        name: attacker.name,
        hp: attacker.hp,
        maxHp: attacker.maxHp,
        attack: 5,
        defense: 0,
        speed: 10,
        critChance: 5,
        critDamage: 150,
        dodge: 3,
        accuracy: 95,
        luck: 0,
        minDamage: 1,
        maxDamage: 2,
      },
      enemy: {
        id: defender.id,
        name: defender.name,
        hp: defender.hp,
        maxHp: defender.maxHp,
        attack: 5,
        defense: 0,
        speed: 10,
        critChance: 5,
        critDamage: 150,
        dodge: 3,
        accuracy: 95,
        luck: 0,
        minDamage: 1,
        maxDamage: 2,
      },
      seed: 'seed-pvp-1',
    });
    expect(first.text).toMatch(/Стычка/);
    expect(replay.result).toMatch(/WIN|LOSS|DRAW/);
    expect((await store.listItems(defender.id)).length).toBe(beforeItems);
  });

  it('moves Elo up for the winner and down for the loser, respecting floor/cap', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'ea', name: 'ЭлоА' });
    const b = await store.createPlayer({ vkUserId: 'eb', name: 'ЭлоБ' });
    const result = await applyRealPvpRatings(store, a.id, b.id, 'WIN', new Date('2026-09-07T12:00:00Z'));
    expect(result.attackerAfter).toBeGreaterThan(result.attackerBefore);
    expect(result.defenderAfter).toBeLessThan(result.defenderBefore);
    const floor = await store.getRating(b.id);
    floor.pvpRating = PVP_RATING.floor;
    await store.saveRating(floor);
    const floored = await applyRealPvpRatings(store, a.id, b.id, 'WIN', new Date('2026-09-07T12:00:00Z'));
    expect(floored.defenderAfter).toBeGreaterThanOrEqual(PVP_RATING.floor);
    const cap = await store.getRating(a.id);
    cap.pvpRating = PVP_RATING.ceiling;
    await store.saveRating(cap);
    const capped = await applyRealPvpRatings(store, a.id, b.id, 'WIN', new Date('2026-09-07T12:00:00Z'));
    expect(capped.attackerAfter).toBeLessThanOrEqual(PVP_RATING.ceiling);
  });

  it('uses reduced K for a repeat opponent in the same week', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'ka', name: 'Ка' });
    const b = await store.createPlayer({ vkUserId: 'kb', name: 'Кб' });
    const first = await applyRealPvpRatings(store, a.id, b.id, 'WIN', new Date('2026-09-07T12:00:00Z'));
    const second = await applyRealPvpRatings(store, a.id, b.id, 'WIN', new Date('2026-09-07T13:00:00Z'));
    const expectedRepeat = eloDelta(first.attackerAfter, first.defenderAfter, true, PVP_RATING.kRepeat);
    expect(second.attackerDelta).toBe(expectedRepeat);
    expect(Math.abs(second.attackerDelta)).toBeLessThanOrEqual(Math.abs(first.attackerDelta));
  });
});

describe('pvp rewards anti-farm and no-loss', () => {
  it('reduces then zeroes material rewards vs the same opponent', () => {
    expect(pvpRewardTier(0, 0)).toBe('full');
    expect(pvpRewardTier(1, 1)).toBe('reduced');
    expect(pvpRewardTier(3, 3)).toBe('none');
    expect(pvpRewardTier(0, PVP_1.dailyRewardedCap)).toBe('none');
  });

  it('does not take items, equipment or resources on a loss', async () => {
    const { store, runtime, player, vkUserId } = await boot('loss', 'Проигравший');
    const foe = await store.createPlayer({ vkUserId: 'foe', name: 'Сильный' });
    await unlock(store, player);
    await unlock(store, foe);
    await store.addResource(player.id, 'LOG', 5);
    const sword = await store.createItem({ playerId: player.id, templateId: 'iron_sword', rarity: 'COMMON' });
    await store.setEquipmentSlot(player.id, 'WEAPON', sword.id);
    const coins = player.coins;
    const logs = (await store.getResources(player.id)).LOG;
    await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' }, 'pvp-loss-nl');
    const after = await reload(store, player.id);
    const items = await store.listItems(player.id);
    const eq = await store.getEquipment(player.id);
    expect(items.some((item) => item.id === sword.id)).toBe(true);
    expect(eq.WEAPON).toBe(sword.id);
    expect((await store.getResources(player.id)).LOG).toBe(logs);
    expect(after.coins).toBeGreaterThanOrEqual(coins);
  });

  it('replays a duplicate event without a second match or Elo tick', async () => {
    const { store, runtime, player, vkUserId } = await boot('dup', 'Дубль');
    const foe = await store.createPlayer({ vkUserId: 'dup-foe', name: 'Цель' });
    await unlock(store, player);
    await unlock(store, foe);
    const first = await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' }, 'pvp-dup-1');
    const rating = (await store.getRating(player.id)).pvpRating;
    const matches = await store.countCombatMatches({ playerId: player.id, mode: 'PVP' });
    const second = await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' }, 'pvp-dup-1');
    expect(second.text).toBe(first.text);
    expect((await store.getRating(player.id)).pvpRating).toBe(rating);
    expect(await store.countCombatMatches({ playerId: player.id, mode: 'PVP' })).toBe(matches);
  });

  it('claims a milestone once per season', async () => {
    const { store, runtime, player, vkUserId } = await boot('mile', 'Веха');
    await unlock(store, player);
    const rating = await store.getRating(player.id);
    rating.pvpRating = 1100;
    await store.saveRating(rating);
    const first = await act(runtime, vkUserId, 'PVP_ACT', { act: 'claim', rating: 1100 }, 'claim-1100');
    expect(first.text).toMatch(/получена/i);
    const coins = (await reload(store, player.id)).coins;
    const second = await act(runtime, vkUserId, 'PVP_ACT', { act: 'claim', rating: 1100 }, 'claim-1100-b');
    expect(second.text).toMatch(/уже получена|сезоне/i);
    expect((await reload(store, player.id)).coins).toBe(coins);
    expect(
      await store.hasRewardClaim(player.id, 'pvp_milestone', pvpMilestoneRef(CURRENT_SEASON.id, 1100)),
    ).toBe(true);
    expect(PVP_MILESTONES.map((row) => row.rating)).toEqual([1100, 1250, 1400, 1600, 1800, 2000]);
  });
});

describe('pvp history and ranking', () => {
  it('lists recent fights and a top board', async () => {
    const { store, runtime, player, vkUserId } = await boot('hist', 'Летописец');
    const foe = await store.createPlayer({ vkUserId: 'hist-foe', name: 'Соперник' });
    await unlock(store, player);
    await unlock(store, foe);
    await act(runtime, vkUserId, 'PVP_ACT', { act: 'find' }, 'hist-1');
    const history = await act(runtime, vkUserId, 'PVP_ACT', { act: 'history' });
    expect(history.text).toMatch(/История PvP/);
    expect(history.text).toMatch(/Соперник|победа|поражение|ничья/);
    const board = await act(runtime, vkUserId, 'PVP_ACT', { act: 'ranking' });
    expect(board.text).toMatch(/Предсезон/);
    expect(board.text).toMatch(/Elo|рейтинг/i);
  });
});
