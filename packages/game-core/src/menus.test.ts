import { describe, expect, it } from 'vitest';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { isMainHub } from './menus';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-menu',
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
  };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`) {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle(event('START_GAME', {}, `start-${vkUserId}`, vkUserId));
  const playerId = started.state!.playerId!;
  const player = (await store.findPlayerById(playerId))!;
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

function labels(response: { buttons: Array<{ label: string }> }) {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: { buttons: Array<{ label: string }> }, part: string) {
  return labels(response).some((label) => label.includes(part));
}

describe('action menus', () => {
  it('1. main hub has at most 5 category buttons', async () => {
    const { runtime, vkUserId } = await boot();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(isMainHub(hub.buttons)).toBe(true);
    expect(labels(hub)).toEqual(['⛏ Добыча', '🔨 Крафт', '🎒 Инвентарь', '👁 Осмотреться', '👤 Герой']);
  });

  it('2. recipe buttons are not on the main hub', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 8);
    await store.addResource(player.id, 'PLANK', 8);
    await store.addResource(player.id, 'STICK', 8);
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(false);
    expect(labels(hub).some((label) => label.startsWith('Крафт:'))).toBe(false);
    expect(hasLabel(hub, 'Доски')).toBe(false);
    expect(hasLabel(hub, 'Палки')).toBe(false);
    expect(hasLabel(hub, 'кирка')).toBe(false);
    expect(hasLabel(hub, 'топор')).toBe(false);
  });

  it('3. добыча opens the gather menu', async () => {
    const { runtime, vkUserId } = await boot();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    const gatherBtn = hub.buttons.find((button) => button.label === '⛏ Добыча');
    expect(gatherBtn).toMatchObject({ action: 'OPEN_MENU', payload: { menu: 'gather' } });
    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'Рубить дерево')).toBe(true);
    expect(hasLabel(gather, 'Назад')).toBe(true);
  });

  it('4. крафт opens craft categories', async () => {
    const { runtime, vkUserId } = await boot();
    const craft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(labels(craft)).toEqual(['🛠 Инструменты', '⚔ Оружие', '🏕 Предметы', '🔙 Назад']);
  });

  it('5–7. craft categories open tools, weapons and items', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 4);
    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(hasLabel(tools, 'Назад')).toBe(true);
    expect(tools.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(false);

    const weapons = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'weapons' });
    expect(weapons.text).toContain('нечего ковать');
    expect(hasLabel(weapons, 'Назад')).toBe(true);

    const items = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    expect(hasLabel(items, 'Доски')).toBe(true);
    expect(items.buttons.find((button) => button.label.includes('Доски'))).toMatchObject({
      action: 'CRAFT_ITEM',
      payload: { recipeId: 'planks' },
    });
  });

  it('8. назад returns to the previous menu', async () => {
    const { runtime, vkUserId } = await boot();
    const items = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    const back = items.buttons.find((button) => button.label === '🔙 Назад');
    expect(back).toMatchObject({ action: 'OPEN_MENU', payload: { menu: 'craft' } });
    const craft = await act(runtime, vkUserId, 'OPEN_MENU', back?.payload);
    expect(hasLabel(craft, 'Инструменты')).toBe(true);
    const toHub = craft.buttons.find((button) => button.label === '🔙 Назад');
    expect(toHub).toMatchObject({ action: 'OPEN_MENU', payload: { menu: 'hub' } });
    const hub = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hub' });
    expect(isMainHub(hub.buttons)).toBe(true);
  });

  it('9. opening menus does not mutate player state', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const before = {
      energy: player.energy,
      location: player.currentLocation,
      state: player.currentState,
      flags: await store.getFlags(player.id),
      resources: await store.getResources(player.id),
    };
    await act(runtime, vkUserId, 'OPEN_CAMP');
    await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hub' });
    const after = (await store.findPlayerById(player.id))!;
    expect(after.energy).toBe(before.energy);
    expect(after.currentLocation).toBe(before.location);
    expect(after.currentState).toBe(before.state);
    expect(await store.getFlags(player.id)).toEqual(before.flags);
    expect(await store.getResources(player.id)).toEqual(before.resources);
  });

  it('10. existing craft still works through the items menu', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 1);
    const crafted = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    expect(crafted.text).toContain('Доски');
    expect((await store.getResources(player.id)).PLANK).toBe(4);
    expect(hasLabel(crafted, 'Назад')).toBe(true);
  });

  it('11. existing gather still works from the gather menu', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const chopped = await act(runtime, vkUserId, 'GATHER_WOOD');
    expect(chopped.text).toContain('+6 бр');
    expect((await store.getResources(player.id)).LOG).toBe(6);
    expect(hasLabel(chopped, 'Рубить дерево')).toBe(true);
    expect(hasLabel(chopped, 'Назад')).toBe(true);
  });

  it('12. gather menu does not bypass tool requirements', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const atScree = await store.findPlayerById(player.id);
    atScree!.currentLocation = 'stone_scree';
    await store.savePlayer(atScree!);
    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'Добывать камень')).toBe(false);
    expect(hasLabel(gather, 'Добывать руду')).toBe(false);
    const denied = await act(runtime, vkUserId, 'GATHER_STONE');
    expect(denied.text).toContain('нельзя');
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);

    await store.createItem({ playerId: player.id, templateId: 'wooden_pickaxe', rarity: 'COMMON' });
    const withWood = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(withWood, 'Добывать камень')).toBe(true);
    expect(hasLabel(withWood, 'Добывать руду')).toBe(false);

    const inAdit = (await store.findPlayerById(player.id))!;
    inAdit.currentLocation = 'old_adit';
    await store.savePlayer(inAdit);
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    const ironDenied = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(ironDenied, 'Добывать руду')).toBe(false);
  });

  it('16. stale menu callbacks do not break state', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 1);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    const stale = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    expect(stale.text).toContain('Не хватает');
    expect((await store.getResources(player.id)).PLANK).toBe(4);
    expect((await store.findPlayerById(player.id))!.currentLocation).toBe('forest_clearing');
    const unknown = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'not-a-menu' });
    expect(isMainHub(unknown.buttons)).toBe(true);
  });

  it('17. repeated OPEN_MENU event_id stays idempotent', async () => {
    const { runtime, vkUserId } = await boot();
    const first = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' }, 'menu-dup');
    const second = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' }, 'menu-dup');
    expect(second).toEqual(first);
  });
});

describe('mock playthrough via nested menus', () => {
  it('walks hub → gather → chop → craft → tools → back → inventory → explore', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(isMainHub(hub.buttons)).toBe(true);

    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'Рубить дерево')).toBe(true);

    const chopped = await act(runtime, vkUserId, 'GATHER_WOOD');
    expect(chopped.text).toContain('брёвен');
    expect((await store.getResources(player.id)).LOG).toBe(6);

    const craft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(hasLabel(craft, 'Инструменты')).toBe(true);

    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(hasLabel(tools, 'Назад')).toBe(true);
    expect(tools.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(false);

    const backToCraft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(hasLabel(backToCraft, 'Предметы')).toBe(true);
    const backToHub = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hub' });
    expect(isMainHub(backToHub.buttons)).toBe(true);

    const inv = await act(runtime, vkUserId, 'OPEN_INVENTORY');
    expect(inv.text).toContain('Инвентарь');
    expect(hasLabel(inv, 'Назад')).toBe(true);

    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(look.text.length).toBeGreaterThan(0);
    expect(look.buttons.length).toBeGreaterThan(0);
  });

  it('day 1 pipeline still crafts wooden pickaxe then cobble then stone pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 4);
    await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'sticks' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'crafting_table' });
    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'wooden_pickaxe' });
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'wooden_pickaxe')).toBe(true);

    const loc = (await store.findPlayerById(player.id))!;
    loc.currentLocation = 'stone_scree';
    await store.savePlayer(loc);
    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'Добывать камень')).toBe(true);
    await act(runtime, vkUserId, 'GATHER_STONE');
    await act(runtime, vkUserId, 'GATHER_STONE');
    await store.addResource(player.id, 'STICK', 2);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_pickaxe' });
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'stone_pickaxe')).toBe(true);
    expect((await store.getResources(player.id)).WOOD ?? 0).toBe(0);
    expect((await store.getResources(player.id)).STONE ?? 0).toBe(0);
  });

  it('day 2 starts instead of the old stub', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'day_1_complete', '1');
    const day2 = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(day2.text).toMatch(/стан|Затвор держит/i);
    expect(day2.text).not.toContain('Продолжение скоро будет доступно');
  });
});
