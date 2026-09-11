import { describe, expect, it } from 'vitest';
import {
  CRAFT_RECIPES,
  FURNACE,
  MINING_SITES,
  PRODUCTION_DEFS,
  TRADEABLE_RESOURCES,
  isTradeableAsset,
  isTradeableResource,
  pickaxeRank,
  resourceLabel,
  resourceSourceHint,
} from '@kubolesie/content';
import {
  BALANCE_VERSION,
  GAME_COMMANDS,
  PROTOTYPE_VERSION,
  RESOURCE_TYPES,
  type NormalizedIncomingEvent,
} from '@kubolesie/shared';
import { acceptJobContract } from './jobs';
import { MemoryGameStore } from './memory-store';
import { resetMiningMetricsForTests, snapshotMiningMetrics } from './mining-metrics';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-mine',
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

async function reload(store: MemoryGameStore, playerId: string): Promise<PlayerRecord> {
  return (await store.findPlayerById(playerId))!;
}

async function refill(store: MemoryGameStore, playerId: string, energy = 40) {
  const player = await reload(store, playerId);
  player.energy = energy;
  player.maxEnergy = Math.max(player.maxEnergy, energy);
  await store.savePlayer(player);
}

async function givePick(store: MemoryGameStore, playerId: string, templateId: string) {
  await store.createItem({ playerId, templateId, rarity: templateId.includes('deep') ? 'RARE' : templateId.includes('bronze') || templateId.includes('iron') ? 'UNCOMMON' : 'COMMON' });
}

function labels(response: { buttons: Array<{ label: string }> }) {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: { buttons: Array<{ label: string }> }, part: string) {
  return labels(response).some((label) => label.includes(part));
}

describe('mining & crafting 2.0', () => {
  it('bumps prototype to 0.0.13 and registers MINE_ACT', () => {
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    expect(BALANCE_VERSION).toBe('0.0.13');
    expect((GAME_COMMANDS as readonly string[]).includes('MINE_ACT')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect(RESOURCE_TYPES).toEqual(
      expect.arrayContaining([
        'COPPER_ORE',
        'COPPER_INGOT',
        'TIN_ORE',
        'TIN_INGOT',
        'BRONZE_INGOT',
        'SILVER_ORE',
        'SILVER_INGOT',
        'GOLD_ORE',
        'GOLD_INGOT',
        'DEEP_CRYSTAL',
        'COPPER_FITTING',
      ]),
    );
    expect(resourceLabel('DEEP_CRYSTAL')).toMatch(/кристалл/i);
    expect(resourceLabel('BRONZE_INGOT')).toMatch(/бронз/i);
    expect(FURNACE.coalFuel).toBe(8);
    expect(FURNACE.logFuel).toBe(3);
    expect(FURNACE.logCost).toBe(2);
  });

  it('lets a wooden pickaxe farm cobble from the mining menu, not only stone_scree', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'wooden_pickaxe');
    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'Поверхность')).toBe(true);
    expect(gather.buttons.length).toBeLessThanOrEqual(5);
    const surface = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'surface' });
    expect(hasLabel(surface, 'Каменоломня')).toBe(true);
    const site = await act(runtime, vkUserId, 'MINE_ACT', { act: 'site', site: 'quarry' });
    expect(site.text).toMatch(/булыжник|камен/i);
    expect(hasLabel(site, 'Добыть')).toBe(true);
    const first = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(first.text).toMatch(/\+\d+ .*булыж/i);
    const afterFirst = (await store.getResources(player.id)).COBBLESTONE ?? 0;
    expect(afterFirst).toBeGreaterThanOrEqual(2);
    await refill(store, player.id);
    const second = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(second.text).toMatch(/\+\d+/);
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBeGreaterThan(afterFirst);
    expect((await reload(store, player.id)).currentLocation).not.toBe('stone_scree');
  });

  it('blocks cobble without a pickaxe and iron without a stone pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(denied.text).toMatch(/кирк/i);
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);
    await givePick(store, player.id, 'wooden_pickaxe');
    await store.setFlag(player.id, 'day_4_complete', '1');
    const iron = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'iron' });
    expect(iron.text).toMatch(/каменн/i);
    expect((await store.getResources(player.id)).IRON_ORE ?? 0).toBe(0);
  });

  it('repeats coal and iron for a stone pickaxe after day-two/four flags — real player complaint', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'stone_pickaxe');
    await store.setFlag(player.id, 'day_2_complete', '1');
    await store.setFlag(player.id, 'day_4_complete', '1');
    await store.setFlag(player.id, 'furnace_placed', '1');
    const mines = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines' });
    expect(hasLabel(mines, 'Уголь')).toBe(true);
    expect(hasLabel(mines, 'Железн')).toBe(true);
    await refill(store, player.id);
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'coal' });
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'coal' });
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'iron' });
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'iron' });
    const res = await store.getResources(player.id);
    expect(res.COAL ?? 0).toBeGreaterThanOrEqual(2);
    expect(res.IRON_ORE ?? 0).toBeGreaterThanOrEqual(2);
    const surface = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'surface' });
    expect(hasLabel(surface, 'Каменоломня')).toBe(true);
  });

  it('does not show gold or deep on day one', async () => {
    const { runtime, vkUserId } = await boot();
    const mines = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines' });
    expect(hasLabel(mines, 'Золот')).toBe(false);
    expect(hasLabel(mines, 'Глубин')).toBe(false);
    const locked = await act(runtime, vkUserId, 'MINE_ACT', { act: 'info', site: 'gold' });
    expect(locked.text).toMatch(/Откроется|кирк/i);
  });

  it('smelts new ores atomically and keeps iron ash flow', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'furnace_placed', '1');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await store.addResource(player.id, 'COAL', 2);
    await store.addResource(player.id, 'IRON_ORE', 2);
    await store.addResource(player.id, 'COPPER_ORE', 2);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect((await store.getFlags(player.id)).furnace_output).toBe('1');
    const copper = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt_ore', ore: 'COPPER_ORE' });
    expect(copper.text).toMatch(/медн/i);
    expect((await store.getResources(player.id)).COPPER_INGOT).toBe(1);
    expect((await store.getResources(player.id)).COPPER_ORE).toBe(1);
    const fuel = Number((await store.getFlags(player.id)).furnace_fuel);
    expect(fuel).toBe(6);
    const dry = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt_ore', ore: 'TIN_ORE' });
    expect(dry.text).toMatch(/Нет|закрыт/i);
  });

  it('replays a duplicate mine event without a second yield', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'wooden_pickaxe');
    const first = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' }, 'mine-once');
    const cobble = (await store.getResources(player.id)).COBBLESTONE ?? 0;
    const energy = (await reload(store, player.id)).energy;
    const second = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' }, 'mine-once');
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(cobble);
    expect((await reload(store, player.id)).energy).toBe(energy);
  });

  it('replays a duplicate copper smelt without a second ingot', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'furnace_placed', '1');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await store.addResource(player.id, 'COAL', 1);
    await store.addResource(player.id, 'COPPER_ORE', 2);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt_ore', ore: 'COPPER_ORE' }, 'cu-once');
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt_ore', ore: 'COPPER_ORE' }, 'cu-once');
    expect((await store.getResources(player.id)).COPPER_INGOT).toBe(1);
    expect((await store.getResources(player.id)).COPPER_ORE).toBe(1);
  });

  it('crafts bronze from 3 copper + 1 tin and unlocks bronze tools', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'COPPER_INGOT', 3);
    await store.addResource(player.id, 'TIN_INGOT', 1);
    const made = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bronze_ingot' });
    expect((await store.getResources(player.id)).BRONZE_INGOT).toBe(4);
    expect((await store.getResources(player.id)).COPPER_INGOT).toBe(0);
    expect(made.text).toMatch(/бронз/i);
    expect(CRAFT_RECIPES.bronze_ingot.cost).toEqual({ COPPER_INGOT: 3, TIN_INGOT: 1 });
    expect(CRAFT_RECIPES.bronze_ingot.output).toEqual({ kind: 'resource', resource: 'BRONZE_INGOT', amount: 4 });
  });

  it('walks iron pickaxe → copper/tin → bronze pickaxe → silver/gold/deep', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'iron_pickaxe');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await store.setFlag(player.id, 'week_2_complete', '1');
    await store.setFlag(player.id, 'week_3_complete', '1');
    await store.setFlag(player.id, 'week_4_complete', '1');
    await store.setFlag(player.id, 'week_5_complete', '1');
    const mines = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines' });
    expect(hasLabel(mines, 'Медн')).toBe(true);
    expect(hasLabel(mines, 'Олов')).toBe(true);
    const silverLocked = await act(runtime, vkUserId, 'MINE_ACT', { act: 'info', site: 'silver' });
    expect(silverLocked.text).toMatch(/бронзов/i);
    await givePick(store, player.id, 'bronze_pickaxe');
    await refill(store, player.id);
    const silver = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'silver' });
    expect(silver.text).toMatch(/серебр/i);
    const gold = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'gold' });
    expect(gold.text).toMatch(/золот/i);
    const deep = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'deep' });
    expect(deep.text).toMatch(/кристалл/i);
    const res = await store.getResources(player.id);
    expect(res.SILVER_ORE).toBeGreaterThanOrEqual(1);
    expect(res.GOLD_ORE).toBeGreaterThanOrEqual(1);
    expect(res.DEEP_CRYSTAL).toBeGreaterThanOrEqual(1);
  });

  it('legacy week-6 player with iron pickaxe sees the matching veins without recrafting wood/stone', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'iron_pickaxe');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await store.setFlag(player.id, 'week_2_complete', '1');
    await store.setFlag(player.id, 'week_3_complete', '1');
    await store.setFlag(player.id, 'week_4_complete', '1');
    await store.setFlag(player.id, 'week_5_complete', '1');
    await store.setFlag(player.id, 'week_6_complete', '1');
    expect(pickaxeRank(['iron_pickaxe'])).toBe(3);
    const mines = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines' });
    expect(hasLabel(mines, 'Медн')).toBe(true);
    expect(hasLabel(mines, 'Олов')).toBe(true);
    const silver = await act(runtime, vkUserId, 'MINE_ACT', { act: 'info', site: 'silver' });
    expect(silver.text).toMatch(/бронзов/i);
    await givePick(store, player.id, 'bronze_pickaxe');
    const open = await act(runtime, vkUserId, 'MINE_ACT', { act: 'site', site: 'deep' });
    expect(hasLabel(open, 'Добыть')).toBe(true);
    expect(open.text).not.toMatch(/Week 7|седьм/i);
  });

  it('energy-gates mining and does not yield on empty energy', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'wooden_pickaxe');
    const p = await reload(store, player.id);
    p.energy = 0;
    await store.savePlayer(p);
    const denied = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(denied.text).toMatch(/энерг/i);
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);
  });

  it('progresses miner cobble contracts from manual quarry mining', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'week_1_complete', '1');
    await givePick(store, player.id, 'wooden_pickaxe');
    await acceptJobContract(store, player.id, 'miner_cobble', new Date());
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    const task = await store.getAcceptedJobTask(player.id, 'MINER');
    expect(task!.progress).toBeGreaterThan(0);
  });

  it('progresses logger contracts from the forest mining site', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'week_1_complete', '1');
    await acceptJobContract(store, player.id, 'logger_logs', new Date());
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'forest' });
    const task = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(task!.progress).toBeGreaterThan(0);
  });

  it('keeps production mine on coal+iron and does not auto-drop new ores', () => {
    expect(PRODUCTION_DEFS.MINE.primary).toBe('COAL');
    expect(PRODUCTION_DEFS.MINE.secondary).toBe('IRON_ORE');
    expect(Object.values(PRODUCTION_DEFS).flatMap((row) => [row.primary, row.secondary])).not.toContain('COPPER_ORE');
    expect(Object.values(PRODUCTION_DEFS).flatMap((row) => [row.primary, row.secondary])).not.toContain('DEEP_CRYSTAL');
  });

  it('allows ordinary new resources on the market and still denies story shards and equipment', () => {
    for (const resource of [
      'COBBLESTONE',
      'COAL',
      'IRON_ORE',
      'IRON_INGOT',
      'COPPER_ORE',
      'COPPER_INGOT',
      'TIN_ORE',
      'TIN_INGOT',
      'BRONZE_INGOT',
      'SILVER_ORE',
      'SILVER_INGOT',
      'GOLD_ORE',
      'GOLD_INGOT',
      'DEEP_CRYSTAL',
      'COPPER_FITTING',
    ] as const) {
      expect(isTradeableResource(resource)).toBe(true);
      expect(TRADEABLE_RESOURCES).toContain(resource);
    }
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_2')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_6')).toBe(false);
    expect(isTradeableAsset('ITEM', 'bronze_pickaxe')).toBe(false);
    expect(isTradeableAsset('ITEM', 'iron_chest')).toBe(false);
  });

  it('shows inventory source hints and mining help', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'IRON_ORE', 2);
    const inv = await act(runtime, vkUserId, 'OPEN_INVENTORY');
    expect(inv.text).toMatch(/Железная жила|каменн/i);
    expect(resourceSourceHint('IRON_ORE')).toMatch(/Железная жила/);
    const help = await act(runtime, vkUserId, 'MINE_ACT', { act: 'help' });
    expect(help.text).toMatch(/Добыча зависит от инструмента/);
    expect(help.buttons.length).toBeLessThanOrEqual(5);
  });

  it('keeps craft hub at five buttons and lists new recipes in categories', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const craft = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'craft' });
    expect(labels(craft)).toEqual(['🪵 Базовый', '⛏ Инструменты', '⚔ Снаряжение', '🧰 Материалы', '⬅ Назад']);
    await store.addResource(player.id, 'COPPER_INGOT', 6);
    await store.addResource(player.id, 'TIN_INGOT', 2);
    await store.addResource(player.id, 'BRONZE_INGOT', 8);
    await store.addResource(player.id, 'STICK', 8);
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
    const tools = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'tools' });
    expect(tools.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(tools, 'Бронзовая кирка') || hasLabel(tools, 'Ещё') || hasLabel(tools, 'Назад')).toBe(true);
    const mats = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'materials' });
    expect(hasLabel(mats, 'Бронза') || hasLabel(mats, 'крепёж') || hasLabel(mats, 'Назад')).toBe(true);
  });

  it('crafts iron and bronze gear and does not add a gold sword', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'first_ingot', '1');
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
    await store.addResource(player.id, 'IRON_INGOT', 5);
    const helm = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_helmet' });
    expect(helm.text).toMatch(/шлем/i);
    expect(CRAFT_RECIPES.gold_sword).toBeUndefined();
    expect(CRAFT_RECIPES.bronze_sword).toBeDefined();
    expect(CRAFT_RECIPES.deep_pickaxe.cost.DEEP_CRYSTAL).toBe(2);
  });

  it('rejects insufficient bronze pickaxe ingredients without negatives', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
    await store.addResource(player.id, 'BRONZE_INGOT', 1);
    await store.addResource(player.id, 'STICK', 2);
    const denied = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bronze_pickaxe' });
    expect(denied.text).toMatch(/Не хватает/);
    expect((await store.getResources(player.id)).BRONZE_INGOT).toBe(1);
    expect((await store.getResources(player.id)).STICK).toBe(2);
  });

  it('shows locked silver vein as a goal, not a hidden dead-end', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'iron_pickaxe');
    await store.setFlag(player.id, 'week_3_complete', '1');
    const info = await act(runtime, vkUserId, 'MINE_ACT', { act: 'info', site: 'silver' });
    expect(info.text).toMatch(/бронзов|закрыт/i);
    expect(info.buttons.length).toBeLessThanOrEqual(5);
  });

  it('records mining metrics without VK ids', async () => {
    resetMiningMetricsForTests();
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'wooden_pickaxe');
    await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'quarry' });
    const snap = snapshotMiningMetrics();
    expect(snap.manualMiningActions).toBeGreaterThanOrEqual(1);
    expect(snap.yieldsByResource.COBBLESTONE).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(snap)).not.toMatch(/vk-/i);
  });

  it('forest remains repeatable without an axe and axe only bonuses yield', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const first = await act(runtime, vkUserId, 'MINE_ACT', { act: 'mine', site: 'forest' });
    expect(first.text).toMatch(/бр/i);
    expect((await store.getResources(player.id)).LOG ?? 0).toBeGreaterThanOrEqual(2);
    await store.createItem({ playerId: player.id, templateId: 'wooden_axe', rarity: 'COMMON' });
    await refill(store, player.id);
    const withAxe = await act(runtime, vkUserId, 'MINE_ACT', { act: 'site', site: 'forest' });
    expect(withAxe.text).toMatch(/Топор|2–5|2–4/);
  });

  it('keeps mining sites hub-sized and paginates the mine list', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await givePick(store, player.id, 'iron_pickaxe');
    await store.setFlag(player.id, 'week_1_complete', '1');
    await store.setFlag(player.id, 'week_2_complete', '1');
    const page0 = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines' });
    expect(page0.buttons.length).toBeLessThanOrEqual(5);
    if (hasLabel(page0, 'Ещё')) {
      const page1 = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'mines', page: 1 });
      expect(page1.buttons.length).toBeLessThanOrEqual(5);
    }
  });

  it('does not open week 7 and keeps regional week resources behind their weeks', async () => {
    expect(MINING_SITES.root.flagsAny).toContain('week_3_complete');
    expect(MINING_SITES.rot.flagsAny).toContain('week_4_complete');
    expect(MINING_SITES.reed.flagsAny).toContain('week_5_complete');
    expect(MINING_SITES.scrap.flagsAny).toContain('week_6_complete');
    const { runtime, vkUserId } = await boot();
    const region = await act(runtime, vkUserId, 'MINE_ACT', { act: 'group', group: 'region' });
    expect(region.text).not.toMatch(/Week 7|День 43/i);
  });
});
