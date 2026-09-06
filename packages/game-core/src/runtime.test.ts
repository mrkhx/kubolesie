import { describe, expect, it } from 'vitest';
import { ENERGY_REGEN_INTERVAL_MS } from '@kubolesie/shared';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { regenerateEnergy } from './energy';
import {
  InsufficientCoinsError,
  InsufficientResourcesError,
  ItemNotOwnedError,
  RewardAlreadyClaimedError,
} from './errors';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-1',
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Тестер' },
    command: { type, payload },
  };
}

async function boot() {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle(event('START_GAME', {}, 'start-1'));
  const playerId = started.state!.playerId!;
  const player = (await store.findPlayerById(playerId))!;
  return { store, runtime, player };
}

describe('energy regeneration', () => {
  it('restores 1 energy per 10 minutes lazily', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const lastEnergyAt = new Date(now.getTime() - 30 * 60 * 1000);
    const next = regenerateEnergy(
      { energy: 10, maxEnergy: 20, lastEnergyAt },
      now,
    );
    expect(next.energy).toBe(13);
    expect(next.lastEnergyAt.getTime()).toBe(lastEnergyAt.getTime() + 3 * ENERGY_REGEN_INTERVAL_MS);
  });

  it('does not exceed max energy', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const next = regenerateEnergy(
      {
        energy: 19,
        maxEnergy: 20,
        lastEnergyAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
      now,
    );
    expect(next.energy).toBe(20);
    expect(next.lastEnergyAt.getTime()).toBe(now.getTime());
  });
});

describe('dialogue start', () => {
  it('returns the starting text and three choices', async () => {
    const { runtime } = await boot();
    const response = await runtime.handle(event('START_GAME', {}, 'start-1'));
    expect(response.text).toContain('Ты приходишь в себя на холодной земле.');
    expect(response.buttons.map((button) => button.label)).toEqual([
      'Осмотреть разбитый ящик',
      'Пойти к дыму',
      'Проверить кусты',
    ]);
  });
});

describe('craft', () => {
  it('crafts a stone axe when resources are enough', async () => {
    const { store, runtime, player } = await boot();
    await store.addResource(player.id, 'WOOD', 2);
    await store.addResource(player.id, 'STONE', 2);
    const response = await runtime.handle(
      event('CRAFT_ITEM', { templateId: 'stone_axe' }, 'craft-axe-1'),
    );
    expect(response.text).toContain('Каменный топор');
    const items = await store.listItems(player.id);
    expect(items.some((item) => item.templateId === 'stone_axe')).toBe(true);
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(0);
    expect(resources.STONE).toBe(0);
  });

  it('rejects craft when resources are missing', async () => {
    const { store, runtime, player } = await boot();
    await store.addResource(player.id, 'WOOD', 1);
    await expect(
      runtime.handle(event('CRAFT_ITEM', { templateId: 'stone_axe' }, 'craft-fail-1')),
    ).resolves.toMatchObject({
      text: expect.stringContaining('Не хватает'),
    });
    const items = await store.listItems(player.id);
    expect(items.some((item) => item.templateId === 'stone_axe')).toBe(false);
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(1);
  });
});

describe('idempotency', () => {
  it('does not apply the same event_id twice', async () => {
    const { store, runtime, player } = await boot();
    player.energy = 20;
    await store.savePlayer(player);
    const first = await runtime.handle(event('GATHER_WOOD', {}, 'wood-dup'));
    const second = await runtime.handle(event('GATHER_WOOD', {}, 'wood-dup'));
    expect(second).toEqual(first);
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(6);
    const after = await store.findPlayerById(player.id);
    expect(after?.energy).toBe(18);
  });
});

describe('reward claims', () => {
  it('cannot claim the same reward twice', async () => {
    const { runtime } = await boot();
    const first = await runtime.handle(
      event('CLAIM_REWARD', { rewardType: 'coins', rewardRef: 'demo_coins' }, 'claim-1'),
    );
    expect(first.text).toContain('10');
    const second = await runtime.handle(
      event('CLAIM_REWARD', { rewardType: 'coins', rewardRef: 'demo_coins' }, 'claim-2'),
    );
    expect(second.text).toContain('уже получена');
    await expect(
      Promise.resolve(new RewardAlreadyClaimedError().code),
    ).resolves.toBe('REWARD_ALREADY_CLAIMED');
  });
});

describe('equipment ownership', () => {
  it('rejects equipping an item owned by another player', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', {}, 'p1-start', 'vk-1'));
    await runtime.handle(event('START_GAME', {}, 'p2-start', 'vk-2'));
    const owner = (await store.findPlayerByVkUserId('vk-1'))!;
    const thief = (await store.findPlayerByVkUserId('vk-2'))!;
    const item = await store.createItem({
      playerId: owner.id,
      templateId: 'stone_axe',
      rarity: 'COMMON',
    });
    const response = await runtime.handle(
      event('EQUIP_ITEM', { itemId: item.id }, 'equip-stolen', thief.vkUserId),
    );
    expect(response.text).toContain('не принадлежит');
    const equipment = await store.getEquipment(thief.id);
    expect(equipment.WEAPON).toBeUndefined();
    expect(() => {
      throw new ItemNotOwnedError();
    }).toThrow(ItemNotOwnedError);
  });
});

describe('coins', () => {
  it('never lets player coins go below 0', async () => {
    const { runtime, player } = await boot();
    expect(player.coins).toBe(0);
    await expect(runtime.changeCoins(player, -1, 'test_debit')).rejects.toBeInstanceOf(
      InsufficientCoinsError,
    );
    expect(player.coins).toBe(0);
  });
});

describe('gather and crate', () => {
  it('gathers wood and spends energy', async () => {
    const { store, runtime, player } = await boot();
    const response = await runtime.handle(event('GATHER_WOOD', {}, 'wood-1'));
    expect(response.text).toContain('+6 дерево');
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(6);
  });

  it('opens the crate once and grants knife, rusk, wood and stone', async () => {
    const { store, runtime, player } = await boot();
    const first = await runtime.handle(event('OPEN_CRATE', {}, 'crate-1'));
    expect(first.text).toContain('каменный нож');
    expect(first.text).toContain('дерево ×6');
    const flags = await store.getFlags(player.id);
    expect(flags.opened_start_crate).toBe('1');
    expect(flags.found_rusty_token).toBeUndefined();
    const items = await store.listItems(player.id);
    expect(items.some((item) => item.templateId === 'stone_knife')).toBe(true);
    expect(items.some((item) => item.templateId === 'dry_rusk')).toBe(true);
    expect(items.some((item) => item.templateId === 'rusty_token')).toBe(false);
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(6);
    expect(resources.STONE).toBe(3);
    const second = await runtime.handle(event('OPEN_CRATE', {}, 'crate-2'));
    expect(second.text).toContain('уже забрал');
  });

  it('adds 25% wood yield with a stone axe equipped', async () => {
    const { store, runtime, player } = await boot();
    await store.addResource(player.id, 'WOOD', 2);
    await store.addResource(player.id, 'STONE', 2);
    await runtime.handle(event('CRAFT_ITEM', { templateId: 'stone_axe' }, 'axe-for-wood'));
    const items = await store.listItems(player.id);
    const axe = items.find((item) => item.templateId === 'stone_axe')!;
    await runtime.handle(event('EQUIP_ITEM', { itemId: axe.id }, 'equip-axe'));
    await runtime.handle(event('GATHER_WOOD', {}, 'wood-axe'));
    const resources = await store.getResources(player.id);
    expect(resources.WOOD).toBe(7);
  });
});

describe('errors', () => {
  it('exposes insufficient resources error class', () => {
    expect(new InsufficientResourcesError().code).toBe('INSUFFICIENT_RESOURCES');
  });
});
