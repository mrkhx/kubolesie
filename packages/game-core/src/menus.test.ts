import { describe, expect, it } from 'vitest';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { isMainHub, pagedButtons } from './menus';

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
    expect(labels(craft)).toEqual(['🪵 Базовый', '⛏ Инструменты', '⚔ Снаряжение', '🧰 Материалы', '⬅ Назад']);
  });

  it('5–7. craft categories open tools, weapons and items', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 4);
    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(hasLabel(tools, 'Назад')).toBe(true);
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    expect(tools.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(true);
    expect(tools.buttons.length).toBeLessThanOrEqual(5);

    const weapons = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'weapons' });
    expect(weapons.text).toContain('нечего ковать');
    expect(hasLabel(weapons, 'Назад')).toBe(true);

    const items = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    expect(hasLabel(items, 'Доски')).toBe(true);
    expect(hasLabel(items, 'Палки') || hasLabel(items, 'Ещё')).toBe(true);
    expect(items.buttons.find((button) => button.label.includes('Доски'))).toMatchObject({
      action: 'CRAFT_ITEM',
      payload: { recipeId: 'planks' },
    });
    expect(items.buttons.length).toBeLessThanOrEqual(5);
  });

  it('8. назад returns to the previous menu', async () => {
    const { runtime, vkUserId } = await boot();
    const items = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    const back = items.buttons.find((button) => button.label === '⬅ Назад');
    expect(back).toMatchObject({ action: 'OPEN_MENU', payload: { menu: 'craft' } });
    const craft = await act(runtime, vkUserId, 'OPEN_MENU', back?.payload);
    expect(hasLabel(craft, 'Инструменты')).toBe(true);
    const toHub = craft.buttons.find((button) => button.label === '⬅ Назад');
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
    expect(hasLabel(gather, 'Добыть булыжник')).toBe(false);
    expect(hasLabel(gather, 'Добыть железо')).toBe(false);
    const denied = await act(runtime, vkUserId, 'GATHER_STONE');
    expect(denied.text).toContain('нельзя');
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);

    await store.createItem({ playerId: player.id, templateId: 'wooden_pickaxe', rarity: 'COMMON' });
    const withWood = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(withWood, 'Добыть булыжник')).toBe(true);
    expect(hasLabel(withWood, 'Добыть железо')).toBe(false);

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
    expect(hasLabel(ironDenied, 'Добыть железо')).toBe(false);
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
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    expect(tools.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(true);

    const backToCraft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(hasLabel(backToCraft, 'Базовый')).toBe(true);
    const backToHub = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hub' });
    expect(isMainHub(backToHub.buttons)).toBe(true);

    const inv = await act(runtime, vkUserId, 'OPEN_INVENTORY');
    expect(inv.text).toContain('Инвентарь');
    expect(hasLabel(inv, 'Назад')).toBe(true);
    expect(inv.buttons.some((button) => button.label === '⬅ Назад')).toBe(true);
    expect(inv.text).not.toMatch(/COMMON|UNCOMMON|BACK/);

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
    expect(hasLabel(gather, 'Добыть булыжник')).toBe(true);
    await act(runtime, vkUserId, 'GATHER_STONE');
    await act(runtime, vkUserId, 'GATHER_STONE');
    await store.addResource(player.id, 'STICK', 2);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_pickaxe' });
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'stone_pickaxe')).toBe(true);
    expect((await store.getResources(player.id)).WOOD ?? 0).toBe(0);
    expect((await store.getResources(player.id)).STONE ?? 0).toBe(0);
  });

  it('shows unlocked survival recipes even without ingredients or a table', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.hp = 20;
    player.energy = 20;
    player.coins = 0;
    await store.savePlayer(player);
    await store.addResource(player.id, 'LOG', 8);
    await store.createItem({ playerId: player.id, templateId: 'rusty_token', rarity: 'UNCOMMON' });
    await store.createItem({ playerId: player.id, templateId: 'stone_knife', rarity: 'COMMON' });
    await store.createItem({ playerId: player.id, templateId: 'dry_rusk', rarity: 'COMMON' });

    const craft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(labels(craft)).toEqual(['🪵 Базовый', '⛏ Инструменты', '⚔ Снаряжение', '🧰 Материалы', '⬅ Назад']);

    const items = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'items' });
    expect(items.text).not.toMatch(/Пока нечего крафтить/);
    const itemLabels = new Set(labels(items));
    let page = items;
    for (let i = 0; i < 6; i += 1) {
      expect(page.buttons.length).toBeLessThanOrEqual(5);
      expect(hasLabel(page, 'Назад')).toBe(true);
      for (const label of labels(page)) itemLabels.add(label);
      const more = page.buttons.find((button) => button.label.includes('Ещё'));
      if (!more) break;
      page = await act(runtime, vkUserId, 'OPEN_MENU', more.payload);
    }
    expect([...itemLabels].some((label) => label.includes('Доски'))).toBe(true);
    expect([...itemLabels].some((label) => label.includes('Палки'))).toBe(true);
    expect([...itemLabels].some((label) => label.includes('Верстак'))).toBe(true);

    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(tools.text).not.toMatch(/Пока нечего крафтить/);
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    const pick = tools.buttons.find((button) => button.label.includes('Деревянная кирка'))!;
    const denied = await act(runtime, vkUserId, 'CRAFT_ITEM', pick.payload ?? {});
    expect(denied.text).toMatch(/верстак/i);
    expect(denied.buttons.length).toBeGreaterThanOrEqual(2);
    expect(denied.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(denied, 'Назад') || hasLabel(denied, 'кирка') || hasLabel(denied, 'Ещё')).toBe(true);

    const sticks = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'sticks' });
    expect(sticks.text).toMatch(/Не хватает/);
    expect(sticks.buttons.length).toBeGreaterThanOrEqual(2);
    expect(sticks.buttons.length).toBeLessThanOrEqual(5);
  });

  it('day 2 starts instead of the old stub', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'day_1_complete', '1');
    const day2 = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(day2.text).toMatch(/стан|Затвор держит/i);
    expect(day2.text).not.toContain('Продолжение скоро будет доступно');
  });

  it('paginates a long inventory instead of emitting more than 5 buttons', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    for (const templateId of [
      'wooden_pickaxe',
      'stone_pickaxe',
      'iron_pickaxe',
      'wooden_axe',
      'stone_axe',
      'wooden_sword',
      'hide_tunic',
    ]) {
      await store.createItem({ playerId: player.id, templateId, rarity: 'COMMON' });
    }
    const page0 = await act(runtime, vkUserId, 'OPEN_INVENTORY');
    expect(page0.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(page0, 'Назад')).toBe(true);
    expect(hasLabel(page0, 'Ещё')).toBe(true);
    const more = page0.buttons.find((button) => button.label.includes('Ещё'));
    expect(more).toMatchObject({ action: 'OPEN_INVENTORY' });
    const page1 = await act(runtime, vkUserId, 'OPEN_INVENTORY', more?.payload);
    expect(page1.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(page1, 'Назад')).toBe(true);
    expect(page1.buttons.some((button) => button.action === 'EQUIP_ITEM')).toBe(true);
  });
});

describe('pagedButtons helper', () => {
  const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    label: `Item ${n}`,
    action: 'OPEN_MENU' as const,
    payload: { n },
  }));
  const back = { label: '⬅ Назад', action: 'OPEN_MENU' as const, payload: { menu: 'hub' } };

  it('keeps three items plus more and back on the first page', () => {
    const page0 = pagedButtons(
      items,
      0,
      (next) => ({ label: '➡ Ещё', action: 'OPEN_INVENTORY', payload: { page: next } }),
      back,
    );
    expect(page0).toHaveLength(5);
    expect(page0.map((button) => button.label)).toEqual(['Item 1', 'Item 2', 'Item 3', '➡ Ещё', '⬅ Назад']);
  });

  it('clamps an out-of-range page and never drops back', () => {
    const last = pagedButtons(
      items,
      99,
      (next) => ({ label: '➡ Ещё', action: 'OPEN_INVENTORY', payload: { page: next } }),
      back,
    );
    expect(last.length).toBeLessThanOrEqual(5);
    expect(last.at(-1)).toEqual(back);
    expect(last.some((button) => button.label === '➡ Ещё')).toBe(false);
    expect(last.some((button) => button.label.startsWith('Item'))).toBe(true);
  });
});

describe('campButtons week-act visibility', () => {
  it('does not hide WEEK3_ACT behind furnace+farm+work+vel', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    for (const flag of [
      'player_camp_founded',
      'camp_table_placed',
      'camp_fire_built',
      'day_2_complete',
      'day_3_complete',
      'furnace_placed',
      'met_vel',
      'farming_unlocked',
      'week_1_complete',
      'week_2_complete',
    ]) {
      await store.setFlag(player.id, flag, '1');
    }
    player.currentLocation = 'player_camp';
    await store.savePlayer(player);
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
    const labels = new Set(camp.buttons.map((button) => button.label));
    let page = camp;
    for (let i = 0; i < 6 && page.buttons.some((button) => button.label.includes('Ещё')); i += 1) {
      const more = page.buttons.find((button) => button.label.includes('Ещё'))!;
      page = await act(runtime, vkUserId, more.action as never, more.payload ?? {});
      for (const label of page.buttons.map((button) => button.label)) labels.add(label);
    }
    expect([...labels].some((label) => label.includes('Чаща'))).toBe(true);
    expect([...labels].some((label) => label.includes('Назад'))).toBe(true);
  });

  it('hub keeps 🏕 Стан after camp is founded even away from player_camp', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    for (const flag of [
      'player_camp_founded',
      'camp_table_placed',
      'camp_fire_built',
      'day_2_complete',
      'day_3_complete',
      'furnace_placed',
    ]) {
      await store.setFlag(player.id, flag, '1');
    }
    player.currentLocation = 'drowned_quarry';
    await store.savePlayer(player);
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(hub, 'Стан')).toBe(true);
    expect(isMainHub(hub.buttons)).toBe(true);
    const campBtn = hub.buttons.find((button) => button.label.includes('Стан'));
    expect(campBtn).toMatchObject({ action: 'OPEN_MENU', payload: { menu: 'camp' } });
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(hasLabel(camp, 'Печь')).toBe(true);
  });
});
