import { describe, expect, it } from 'vitest';
import {
  CRAFT_RECIPES,
  ENEMIES,
  FURNACE,
  ITEM_TEMPLATES,
  LOCATIONS,
  QUEST_TEMPLATES,
  TOKEN_SALE_PRICE,
  TRIBUTE_COBBLE,
  TRIBUTE_COINS,
  UNKNOWN_NODE7_CREATURE,
  VEL_BUYS,
  VEL_SELLS,
} from '@kubolesie/content';
import { GAME_COMMANDS, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { isMainHub } from './menus';
import type { PlayerRecord } from './store';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week',
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

async function itemCount(store: MemoryGameStore, playerId: string, templateId: string) {
  return (await store.listItems(playerId)).filter((item) => item.templateId === templateId).length;
}

function labels(response: { buttons: Array<{ label: string }> }) {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: { buttons: Array<{ label: string }> }, part: string) {
  return labels(response).some((label) => label.includes(part));
}

interface SeedOpts {
  feed?: boolean;
  hostile?: boolean;
  showToken?: boolean;
  hideToken?: boolean;
  eavesdrop?: boolean;
  lantern?: boolean;
  blue?: boolean;
  shelter?: boolean;
}

async function seedDay2Done(opts: SeedOpts = {}) {
  const { store, runtime, player, vkUserId } = await boot();
  const flags = [
    'day_1_complete',
    'met_rem',
    'node7_gate_closed',
    'activated_node7_token',
    'found_rusty_token',
    'opened_start_crate',
    'slept_at_rem',
  ];
  if (opts.feed) flags.push('fed_stone_scavenger', 'stone_scavenger_affinity');
  if (opts.hostile) flags.push('defeated_stone_scavenger');
  if (opts.showToken) flags.push('showed_token_to_rem');
  if (opts.hideToken) flags.push('hid_token_from_rem');
  if (opts.eavesdrop) flags.push('night_eavesdropped');
  if (opts.blue) flags.push('unknown_blue_mineral', 'found_blue_light');
  if (opts.shelter) flags.push('temporary_shelter_level', 'slept_at_shelter');
  for (const flag of flags) await store.setFlag(player.id, flag, '1');
  player.level = 2;
  player.xp = 40;
  player.maxHp = 105;
  player.hp = 105;
  player.maxEnergy = 40;
  player.energy = 40;
  player.coins = 80;
  player.currentLocation = 'rem_camp';
  player.currentState = 'day1_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'wooden_pickaxe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_pickaxe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'rusty_token', rarity: 'UNCOMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_knife', rarity: 'COMMON' });
  if (opts.lantern) {
    await store.createItem({ playerId: player.id, templateId: 'broken_lantern', rarity: 'COMMON' });
    await store.setFlag(player.id, 'found_broken_lantern', '1');
  }
  await store.upsertPlayerQuest({
    playerId: player.id,
    questId: 'iron_for_gate',
    status: 'CLAIMED',
    progress: {},
  });
  await store.addResource(player.id, 'LOG', 12);
  await store.addResource(player.id, 'STICK', 12);
  await store.addResource(player.id, 'PLANK', 8);
  await store.addResource(player.id, 'COAL', 8);
  await store.addResource(player.id, 'COBBLESTONE', 16);
  await store.addResource(player.id, 'IRON_ORE', 8);
  await act(runtime, vkUserId, 'BEGIN_DAY_2');
  await act(runtime, vkUserId, 'FOUND_CAMP', { onShelter: Boolean(opts.shelter) });
  await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
  await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_2');
  return { store, runtime, player: await reload(store, player.id), vkUserId };
}

async function tank(store: MemoryGameStore, playerId: string, hp = 800) {
  const player = await reload(store, playerId);
  player.hp = hp;
  player.maxHp = Math.max(player.maxHp, hp);
  player.energy = Math.max(player.energy, 30);
  await store.savePlayer(player);
  const items = await store.listItems(playerId);
  const order = ['iron_sword', 'iron_axe', 'iron_pickaxe', 'stone_sword', 'wooden_sword', 'stone_knife'];
  const weapon = order.map((id) => items.find((item) => item.templateId === id)).find(Boolean);
  if (weapon) {
    const template = ITEM_TEMPLATES[weapon.templateId];
    if (template?.slot) await store.setEquipmentSlot(playerId, template.slot, weapon.id);
  }
}

async function fightUntil(
  runtime: GameRuntime,
  store: MemoryGameStore,
  playerId: string,
  vkUserId: string,
  enemyId: string,
  payload: Record<string, unknown> = {},
  want: 'WIN' | 'LOSS' = 'WIN',
) {
  if (want === 'WIN') await tank(store, playerId);
  else {
    const player = await reload(store, playerId);
    player.hp = 1;
    await store.savePlayer(player);
  }
  let last = await act(runtime, vkUserId, 'START_PVE', { enemyId, ...payload });
  for (let i = 0; i < 24; i += 1) {
    const win = last.text.includes('Победа');
    const loss = last.text.includes('приходишь в себя');
    if (want === 'WIN' && win) return last;
    if (want === 'LOSS' && loss) return last;
    if (want === 'WIN') await tank(store, playerId);
    else {
      const player = await reload(store, playerId);
      player.hp = 1;
      await store.savePlayer(player);
    }
    last = await act(runtime, vkUserId, 'START_PVE', { enemyId, ...payload });
  }
  return last;
}

describe('week content canon', () => {
  it('keeps the Day 1 pipeline and rejects WOOD+STONE / smelt-as-craft', () => {
    expect(CRAFT_RECIPES.planks.cost).toEqual({ LOG: 1 });
    expect(CRAFT_RECIPES.wooden_pickaxe.cost).toEqual({ PLANK: 3, STICK: 2 });
    expect(CRAFT_RECIPES.stone_pickaxe.cost).toEqual({ COBBLESTONE: 3, STICK: 2 });
    expect(CRAFT_RECIPES.wooden_sword.cost).toEqual({ PLANK: 2, STICK: 1 });
    expect(CRAFT_RECIPES.stone_sword.cost).toEqual({ COBBLESTONE: 2, STICK: 1 });
    expect(CRAFT_RECIPES.hide_tunic.cost).toEqual({ HIDE: 8 });
    expect(CRAFT_RECIPES.furnace.cost).toEqual({ COBBLESTONE: 8 });
    expect(CRAFT_RECIPES.iron_pickaxe.cost).toEqual({ IRON_INGOT: 3, STICK: 2 });
    expect(CRAFT_RECIPES.iron_axe.cost).toEqual({ IRON_INGOT: 3, STICK: 2 });
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.smelt_iron).toBeUndefined();
    expect(CRAFT_RECIPES.iron_ingot).toBeUndefined();
    expect((CRAFT_RECIPES as Record<string, unknown>).wood_stone).toBeUndefined();
    expect(FURNACE.coalFuel).toBe(8);
    expect(FURNACE.logFuel).toBe(3);
    expect(UNKNOWN_NODE7_CREATURE.name).toBe('???');
    expect(ENEMIES.wenzel_warden.name).toBe('Вензель');
    expect(ENEMIES.stumpfang.name).toBe('Пнеклык');
    expect(ENEMIES.unknown_node7_creature).toBeUndefined();
    expect(LOCATIONS.ashen_wedge.name).toBe('Сизый клин');
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_8')).toBe(false);
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'hold_the_hinges')).toBe(true);
  });
});

describe('day 3 ashen wedge', () => {
  it('gates BEGIN_DAY_3 on day_2_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_3');
    expect(denied.text).toMatch(/нельзя/i);
  });

  it('opens ashen_wedge and a compact PvE menu', async () => {
    const { runtime, vkUserId, store, player } = await seedDay2Done();
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_3');
    expect(started.text).toMatch(/Пнеклык|клин/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    expect((await reload(store, player.id)).currentLocation).toBe('ashen_wedge');
    const wedge = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'wedge' });
    expect(wedge.text).toMatch(/Сизый клин/i);
    expect(wedge.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(wedge, 'тропу') || hasLabel(wedge, 'Тропа')).toBe(true);
    expect((await store.getFlags(player.id)).visited_ashen_wedge).toBe('1');
  });

  it('repeatable path fight is loss-safe and drops hide', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    const knife = (await store.listItems(player.id)).find((item) => item.templateId === 'stone_knife')!;
    const before = await itemCount(store, player.id, 'stone_knife');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе|приходишь в себя/i);
    expect(await itemCount(store, player.id, 'stone_knife')).toBe(before);
    expect((await store.getFlags(player.id)).wedge_path_cleared).toBeUndefined();
    void knife;
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getFlags(player.id)).wedge_path_cleared).toBe('1');
    expect((await store.getResources(player.id)).HIDE ?? 0).toBeGreaterThan(0);
    const again = await fightUntil(runtime, store, player.id, vkUserId, 'needle_runner', {}, 'WIN');
    expect(again.text).toMatch(/Победа/i);
  });

  it('crafts wooden sword, stone sword and hide tunic with canon costs', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await store.addResource(player.id, 'HIDE', 8);
    const wood = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'wooden_sword' });
    expect(wood.text).toMatch(/Деревянный меч/i);
    expect(await itemCount(store, player.id, 'wooden_sword')).toBe(1);
    const stone = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_sword' });
    expect(stone.text).toMatch(/Каменный меч/i);
    const tunic = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'hide_tunic' });
    expect(tunic.text).toMatch(/Туника/i);
    expect(await itemCount(store, player.id, 'hide_tunic')).toBe(1);
  });

  it('dailies close and grant a crate once', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await fightUntil(runtime, store, player.id, vkUserId, 'needle_runner', {}, 'WIN');
    expect((await store.getFlags(player.id)).daily_kill_d3).toBe('1');
    await act(runtime, vkUserId, 'GATHER_WOOD');
    expect((await store.getFlags(player.id)).daily_gather_d3).toBe('1');
    await store.addResource(player.id, 'COAL', 1);
    await store.addResource(player.id, 'STICK', 1);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'torch' });
    const flags = await store.getFlags(player.id);
    expect(flags.daily_craft_d3).toBe('1');
    expect(flags.daily_crate_d3).toBe('1');
    const coins = (await reload(store, player.id)).coins;
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    expect((await reload(store, player.id)).coins).toBe(coins);
  });

  it('stumpfang is optional, retryable, torch-spendable and first-clear idempotent', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await store.createItem({ playerId: player.id, templateId: 'torch', rarity: 'COMMON' });
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'stumpfang', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).stumpfang_failed).toBe('1');
    expect(await itemCount(store, player.id, 'stumpfang_tooth')).toBe(0);
    const torches = await itemCount(store, player.id, 'torch');
    await tank(store, player.id);
    const burned = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'stumpfang', torch: true });
    expect(await itemCount(store, player.id, 'torch')).toBe(torches - 1);
    expect((await store.getFlags(player.id)).burned_torch_at_stumpfang).toBe('1');
    void burned;
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'stumpfang', {}, 'WIN');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getFlags(player.id)).defeated_stumpfang).toBe('1');
    expect(await itemCount(store, player.id, 'stumpfang_tooth')).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'stumpfang', {}, 'WIN');
    expect(await itemCount(store, player.id, 'stumpfang_tooth')).toBe(1);
  });

  it('completes Day 3 after the path with a poor map fragment', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    expect(early.text).toMatch(/тропу|нельзя/i);
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    const flags = await store.getFlags(player.id);
    expect(flags.day_3_complete).toBe('1');
    expect(flags.wedge_map_fragment_poor).toBe('1');
    expect(await itemCount(store, player.id, 'wedge_map_fragment')).toBe(1);
    expect(done.text).toMatch(/схем|фрагмент|семёрк/i);
    expect(hasLabel(done, 'День 4')).toBe(true);
  });

  it('elite first-clear gives the proper fragment, not the poor one', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await fightUntil(runtime, store, player.id, vkUserId, 'pitch_mite', {}, 'WIN');
    const elite = await fightUntil(runtime, store, player.id, vkUserId, 'resin_brute', {}, 'WIN');
    expect(elite.text).toMatch(/Победа/i);
    expect((await store.getFlags(player.id)).wedge_map_fragment).toBe('1');
    await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    expect((await store.getFlags(player.id)).wedge_map_fragment_poor).toBeUndefined();
  });
});

describe('day 4 furnace and pet', () => {
  async function seedDay3(opts: SeedOpts = {}) {
    const seeded = await seedDay2Done(opts);
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_3');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'moss_boar', {}, 'WIN');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_3');
    seeded.player = await reload(seeded.store, seeded.player.id);
    return seeded;
  }

  it('builds a furnace for 8 cobble and smelts with leftover fuel', async () => {
    const { store, runtime, player, vkUserId } = await seedDay3();
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    const made = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    expect(made.text).toMatch(/Печь/i);
    expect((await store.getFlags(player.id)).furnace_placed).toBe('1');
    expect((await store.getResources(player.id)).COBBLESTONE).toBe(8);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    expect((await store.getFlags(player.id)).furnace_fuel).toBe('8');
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect((await store.getFlags(player.id)).furnace_fuel).toBe('5');
    expect((await store.getFlags(player.id)).furnace_output).toBe('3');
    expect((await store.getFlags(player.id)).first_ingot).toBe('1');
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'take' });
    expect((await store.getResources(player.id)).IRON_INGOT).toBe(3);
    const empty = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect((await store.getFlags(player.id)).furnace_fuel).toBe('4');
    void empty;
  });

  it('rejects blue mineral and log fuel is weaker than coal', async () => {
    const { store, runtime, player, vkUserId } = await seedDay3({ blue: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    const blue = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt_blue' });
    expect(blue.text).toMatch(/не меняется|Синее/i);
    expect((await store.getResources(player.id)).IRON_INGOT ?? 0).toBe(0);
    await store.addResource(player.id, 'LOG', 2);
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_log' });
    expect((await store.getFlags(player.id)).furnace_fuel).toBe(String(FURNACE.logFuel));
    const dry = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect(dry.text).not.toMatch(/Не хватает топлива/);
  });

  it('insufficient fuel is rejected and CRAFT_ITEM cannot smelt', async () => {
    const { store, runtime, player, vkUserId } = await seedDay3();
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    const noFuel = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    expect(noFuel.text).toMatch(/топлива|уголь/i);
    const fake = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'smelt_iron' });
    expect(fake.text).toMatch(/Такого рецепта нет/i);
    expect((await store.getResources(player.id)).IRON_INGOT ?? 0).toBe(0);
  });

  it('first iron tool flags pickaxe, axe or sword without locking the others', async () => {
    const { store, runtime, player, vkUserId } = await seedDay3();
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    for (let i = 0; i < 5; i += 1) await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'take' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_sword' });
    expect((await store.getFlags(player.id)).chose_iron_sword).toBe('1');
    expect((await store.getFlags(player.id)).chose_iron_pickaxe).toBeUndefined();
    await store.addResource(player.id, 'IRON_INGOT', 3);
    await store.addResource(player.id, 'STICK', 2);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_pickaxe' });
    expect(await itemCount(store, player.id, 'iron_pickaxe')).toBe(1);
    expect((await store.getFlags(player.id)).chose_iron_pickaxe).toBeUndefined();
    await act(runtime, vkUserId, 'COMPLETE_DAY_4');
    expect((await store.getFlags(player.id)).day_4_complete).toBe('1');
  });

  it('pet branches: help, reject, emberkit', async () => {
    const fed = await seedDay3({ feed: true });
    await act(fed.runtime, fed.vkUserId, 'BEGIN_DAY_4');
    await fed.store.createItem({ playerId: fed.player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
    const look = await act(fed.runtime, fed.vkUserId, 'EXPLORE');
    expect(look.text).toMatch(/падальщик/i);
    const helped = await act(fed.runtime, fed.vkUserId, 'HELP_PET', { act: 'help' });
    expect(helped.text).toMatch(/Падальщик|смола/i);
    expect((await fed.store.getFlags(fed.player.id)).scavenger_bonded).toBe('1');

    const shoo = await seedDay3({ feed: true });
    await act(shoo.runtime, shoo.vkUserId, 'BEGIN_DAY_4');
    await act(shoo.runtime, shoo.vkUserId, 'HELP_PET', { act: 'reject' });
    expect((await shoo.store.getFlags(shoo.player.id)).scavenger_rejected_d4).toBe('1');

    const hostile = await seedDay3({ hostile: true });
    await act(hostile.runtime, hostile.vkUserId, 'BEGIN_DAY_4');
    const fissure = await reload(hostile.store, hostile.player.id);
    fissure.currentLocation = 'soot_fissure';
    await hostile.store.savePlayer(fissure);
    const notice = await act(hostile.runtime, hostile.vkUserId, 'EXPLORE');
    expect(notice.text).toMatch(/Искрик/i);
    await act(hostile.runtime, hostile.vkUserId, 'HELP_PET', { act: 'rescue' });
    expect((await hostile.store.getFlags(hostile.player.id)).emberkit_rescued).toBe('1');
    await hostile.store.addResource(hostile.player.id, 'COAL', 1);
    await act(hostile.runtime, hostile.vkUserId, 'HELP_PET', { act: 'tame' });
    expect((await hostile.store.getFlags(hostile.player.id)).emberkit_bonded).toBe('1');
  });
});

describe('day 5 vel', () => {
  async function seedDay4(opts: SeedOpts = {}) {
    const seeded = await seedDay2Done(opts);
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_3');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'moss_boar', {}, 'WIN');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_3');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(seeded.store, seeded.player.id);
    loc.currentLocation = 'player_camp';
    loc.coins = 80;
    await seeded.store.savePlayer(loc);
    await seeded.store.addResource(seeded.player.id, 'COBBLESTONE', 8);
    await seeded.store.addResource(seeded.player.id, 'COAL', 4);
    await seeded.store.addResource(seeded.player.id, 'IRON_ORE', 8);
    await seeded.store.addResource(seeded.player.id, 'STICK', 4);
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    for (let i = 0; i < 3; i += 1) await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'take' });
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_sword' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_4');
    seeded.player = await reload(seeded.store, seeded.player.id);
    return seeded;
  }

  it('unlocks Vel, buy, sell, decline and forbids buy/sell loops', async () => {
    const { store, runtime, player, vkUserId } = await seedDay4();
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_5');
    expect(started.text).toMatch(/Вел/i);
    expect((await store.getFlags(player.id)).met_vel).toBe('1');
    const trade = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'open' });
    expect(trade.buttons.length).toBeLessThanOrEqual(5);
    await store.addResource(player.id, 'COAL', 2);
    const sold = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell', sku: 'coal' });
    expect(sold.text).toMatch(/Продано/i);
    const bought = await act(runtime, vkUserId, 'TRADE_ACT', { act: 'buy', sku: 'rusk' });
    expect(bought.text).toMatch(/Куплено/i);
    expect(await itemCount(store, player.id, 'dry_rusk')).toBe(1);
    for (const buy of VEL_SELLS) {
      if (buy.kind !== 'resource' || !buy.resource) continue;
      const sell = VEL_BUYS.find((row) => row.resource === buy.resource);
      if (!sell) continue;
      expect(sell.price * (buy.amount ?? 1)).toBeLessThan(buy.price);
    }
    const declined = await seedDay4();
    await act(declined.runtime, declined.vkUserId, 'BEGIN_DAY_5');
    await act(declined.runtime, declined.vkUserId, 'TRADE_ACT', { act: 'decline' });
    await act(declined.runtime, declined.vkUserId, 'COMPLETE_DAY_5');
    expect((await declined.store.getFlags(declined.player.id)).day_5_complete).toBe('1');
  });

  it('repairs the lantern, sells the token and salvages stone tools', async () => {
    const { store, runtime, player, vkUserId } = await seedDay4({ lantern: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_5');
    const loc = await reload(store, player.id);
    loc.coins = 80;
    await store.savePlayer(loc);
    await act(runtime, vkUserId, 'TRADE_ACT', { act: 'buy', sku: 'glass' });
    expect((await store.getFlags(player.id)).bought_glass).toBe('1');
    await store.addResource(player.id, 'COAL', 1);
    const repaired = await act(runtime, vkUserId, 'REPAIR_LANTERN');
    expect(repaired.text).toMatch(/Фонарь горит/i);
    expect((await store.getFlags(player.id)).lantern_repaired).toBe('1');
    expect(await itemCount(store, player.id, 'lit_lantern')).toBe(1);
    expect(await itemCount(store, player.id, 'broken_lantern')).toBe(0);

    const tokenSale = await seedDay4();
    await act(tokenSale.runtime, tokenSale.vkUserId, 'BEGIN_DAY_5');
    const beforeCoins = (await reload(tokenSale.store, tokenSale.player.id)).coins;
    const sold = await act(tokenSale.runtime, tokenSale.vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    expect(sold.text).toMatch(/жетон/i);
    expect((await tokenSale.store.getFlags(tokenSale.player.id)).sold_rusty_token).toBe('1');
    expect(await itemCount(tokenSale.store, tokenSale.player.id, 'rusty_token')).toBe(0);
    expect((await reload(tokenSale.store, tokenSale.player.id)).coins).toBe(beforeCoins + TOKEN_SALE_PRICE);
    const again = await act(tokenSale.runtime, tokenSale.vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    expect(again.text).toMatch(/уже|нет/i);

    const salvage = await seedDay4();
    await act(salvage.runtime, salvage.vkUserId, 'BEGIN_DAY_5');
    const cobble = (await salvage.store.getResources(salvage.player.id)).COBBLESTONE ?? 0;
    await act(salvage.runtime, salvage.vkUserId, 'SALVAGE_ITEM', {});
    expect((await salvage.store.getResources(salvage.player.id)).COBBLESTONE).toBe(cobble + 1);
    expect(await itemCount(salvage.store, salvage.player.id, 'stone_pickaxe')).toBe(0);
    await act(salvage.runtime, salvage.vkUserId, 'TRADE_ACT', { act: 'decline' });
    await act(salvage.runtime, salvage.vkUserId, 'COMPLETE_DAY_5');
    expect((await salvage.store.getFlags(salvage.player.id)).day_5_complete).toBe('1');
  });
});

describe('day 6 async pvp', () => {
  async function seedDay5(opts: SeedOpts = {}) {
    const seeded = await seedDay2Done(opts);
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_3');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'moss_boar', {}, 'WIN');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_3');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(seeded.store, seeded.player.id);
    loc.currentLocation = 'player_camp';
    loc.coins = 90;
    await seeded.store.savePlayer(loc);
    await seeded.store.addResource(seeded.player.id, 'COBBLESTONE', 12);
    await seeded.store.addResource(seeded.player.id, 'COAL', 4);
    await seeded.store.addResource(seeded.player.id, 'IRON_ORE', 8);
    await seeded.store.addResource(seeded.player.id, 'STICK', 4);
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    for (let i = 0; i < 3; i += 1) await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'take' });
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_sword' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_4');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_5');
    await act(seeded.runtime, seeded.vkUserId, 'TRADE_ACT', { act: 'decline' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_5');
    seeded.player = await reload(seeded.store, seeded.player.id);
    return seeded;
  }

  it('runs snapshot PvP without item loss and caps at 3', async () => {
    const { store, runtime, player, vkUserId } = await seedDay5();
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_6');
    expect(started.text).toMatch(/Я|вешка|осып/i);
    const knife = await itemCount(store, player.id, 'stone_knife');
    const coins = (await reload(store, player.id)).coins;
    await tank(store, player.id, 1);
    const loss = await act(runtime, vkUserId, 'START_PVP', {});
    expect(loss.text).toMatch(/Вещи при тебе/i);
    expect(await itemCount(store, player.id, 'stone_knife')).toBe(knife);
    expect((await reload(store, player.id)).coins).toBe(coins);
    await tank(store, player.id);
    const win = await act(runtime, vkUserId, 'START_PVP', {});
    expect(win.text).toMatch(/Победа|Рейтинг|Жетон спора|Вещи при тебе/i);
    await tank(store, player.id);
    await act(runtime, vkUserId, 'START_PVP', {});
    const fourth = await act(runtime, vkUserId, 'START_PVP', {});
    expect(fourth.text).toMatch(/Лимит/i);
    expect((await store.getFlags(player.id)).pvp_skirmishes).toBe('3');
    await act(runtime, vkUserId, 'COMPLETE_DAY_6');
    expect((await store.getFlags(player.id)).day_6_complete).toBe('1');
    expect((await store.getFlags(player.id)).gate_failing).toBe('1');
  });

  it('tribute completes Day 6 without PvP', async () => {
    const { store, runtime, player, vkUserId } = await seedDay5();
    await act(runtime, vkUserId, 'BEGIN_DAY_6');
    const paid = await act(runtime, vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    expect(paid.text).toMatch(/Дань/i);
    expect((await store.getFlags(player.id)).paid_scree_tribute).toBe('1');
    const pvp = await act(runtime, vkUserId, 'START_PVP', {});
    expect(pvp.text).toMatch(/Дань уже|Войны нет/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_6');
    expect((await store.getFlags(player.id)).day_6_complete).toBe('1');

    const cobble = await seedDay5();
    await act(cobble.runtime, cobble.vkUserId, 'BEGIN_DAY_6');
    await cobble.store.addResource(cobble.player.id, 'COBBLESTONE', TRIBUTE_COBBLE);
    await act(cobble.runtime, cobble.vkUserId, 'PAY_TRIBUTE', { with: 'cobble' });
    expect((await cobble.store.getFlags(cobble.player.id)).paid_scree_tribute).toBe('1');
    expect(TRIBUTE_COINS).toBe(20);
    expect(TRIBUTE_COBBLE).toBe(10);
  });
});

describe('day 7 wenzel and seals', () => {
  async function seedDay6(opts: SeedOpts & { sellToken?: boolean; bond?: boolean; lanternOn?: boolean } = {}) {
    const seeded = await seedDay2Done(opts);
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_3');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'moss_boar', {}, 'WIN');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_3');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_4');
    const loc = await reload(seeded.store, seeded.player.id);
    loc.currentLocation = 'player_camp';
    loc.coins = 90;
    await seeded.store.savePlayer(loc);
    await seeded.store.addResource(seeded.player.id, 'COBBLESTONE', 16);
    await seeded.store.addResource(seeded.player.id, 'COAL', 6);
    await seeded.store.addResource(seeded.player.id, 'IRON_ORE', 8);
    await seeded.store.addResource(seeded.player.id, 'LOG', 8);
    await seeded.store.addResource(seeded.player.id, 'STICK', 6);
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    for (let i = 0; i < 3; i += 1) await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(seeded.runtime, seeded.vkUserId, 'FURNACE_ACT', { act: 'take' });
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_sword' });
    if (opts.bond && opts.feed) {
      await seeded.store.createItem({ playerId: seeded.player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
      await act(seeded.runtime, seeded.vkUserId, 'HELP_PET', { act: 'help' });
    }
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_4');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_5');
    if (opts.sellToken) {
      await act(seeded.runtime, seeded.vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    } else if (opts.lanternOn && opts.lantern) {
      const rich = await reload(seeded.store, seeded.player.id);
      rich.coins = 90;
      await seeded.store.savePlayer(rich);
      await act(seeded.runtime, seeded.vkUserId, 'TRADE_ACT', { act: 'buy', sku: 'glass' });
      await seeded.store.addResource(seeded.player.id, 'COAL', 1);
      await act(seeded.runtime, seeded.vkUserId, 'REPAIR_LANTERN');
    } else {
      await act(seeded.runtime, seeded.vkUserId, 'TRADE_ACT', { act: 'decline' });
    }
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_5');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_6');
    await act(seeded.runtime, seeded.vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_6');
    seeded.player = await reload(seeded.store, seeded.player.id);
    return seeded;
  }

  it('prep hub reads the week and stays compact', async () => {
    const { runtime, vkUserId, store, player } = await seedDay6({
      feed: true,
      showToken: true,
      lantern: true,
      lanternOn: true,
      bond: true,
    });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_7');
    expect(started.text).toMatch(/петл|Вензель|затвор/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const prep = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'prep' });
    expect(prep.buttons.length).toBeLessThanOrEqual(5);
    expect(prep.text).toMatch(/баррикад|фонар|питомец|шарнир/i);
    expect((await store.getFlags(player.id)).wenzel_seen).toBe('1');
    expect((await reload(store, player.id)).currentLocation).toBe('seal_forecourt');
  });

  it('Wenzel is retryable without item wipe and first-clear is idempotent', async () => {
    const { store, runtime, player, vkUserId } = await seedDay6();
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    const knife = await itemCount(store, player.id, 'stone_knife');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'hinge' }, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе|Подготовиться/i);
    expect(await itemCount(store, player.id, 'stone_knife')).toBe(knife);
    expect((await store.getFlags(player.id)).wenzel_failed_attempt).toBe('1');
    expect((await store.getFlags(player.id)).week_1_complete).toBeUndefined();
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'hinge' }, 'WIN');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getFlags(player.id)).wenzel_defeated).toBe('1');
    expect(await itemCount(store, player.id, 'wenzel_plate')).toBe(1);
    expect(await itemCount(store, player.id, 'hinge_charm')).toBe(1);
    expect(await itemCount(store, player.id, 'seal_shard_7')).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'hinge' }, 'WIN');
    expect(await itemCount(store, player.id, 'wenzel_plate')).toBe(1);
  });

  it('reveals seven seals, keeps ??? unnamed and closes the week', async () => {
    const { store, runtime, player, vkUserId } = await seedDay6({ showToken: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'hinge' }, 'WIN');
    const seals = await act(runtime, vkUserId, 'COMPLETE_DAY_7');
    expect(seals.text).toContain('Осталось: 6');
    expect(seals.text).toMatch(/печат/i);
    expect(seals.text).not.toMatch(/Вензель за решёткой/);
    expect((await store.getFlags(player.id)).seen_seven_seals).toBe('1');
    expect((await store.getFlags(player.id)).week_1_complete).toBe('1');
    expect((await store.getFlags(player.id)).day_7_complete).toBe('1');
    const look = await act(runtime, vkUserId, 'DIALOGUE_CHOICE', { nodeId: 'seven_seals', choiceId: 'signs' });
    expect(look.text).toContain('???');
    expect(look.text).toContain('Осталось: 6');
    expect(look.text).not.toMatch(/Вензель смотрит/);
    expect(UNKNOWN_NODE7_CREATURE.name).toBe('???');
    const done = await act(runtime, vkUserId, 'BEGIN_DAY_7');
    expect(done.text).toMatch(/Продолжение скоро будет доступно/i);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_8')).toBe(false);
  });

  it('builds a cheaper barricade with an axe/shelter and accepts the blue optional move', async () => {
    const { store, runtime, player, vkUserId } = await seedDay6({ shelter: true, blue: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    await store.createItem({ playerId: player.id, templateId: 'iron_axe', rarity: 'UNCOMMON' });
    await store.addResource(player.id, 'LOG', 3);
    await store.addResource(player.id, 'COBBLESTONE', 3);
    const built = await act(runtime, vkUserId, 'BUILD_BARRICADE');
    expect(built.text).toMatch(/Баррикада/i);
    expect((await store.getFlags(player.id)).barricade_built).toBe('1');
    const fight = await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'blue' }, 'WIN');
    expect((await store.getFlags(player.id)).used_blue_on_wenzel).toBe('1');
    expect(fight.text).toMatch(/Победа|синее/i);
  });

  it('duplicate event_id and stale callbacks do not break Week 1', async () => {
    const { store, runtime, player, vkUserId } = await seedDay2Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_3', {}, 'd3-dup');
    const loc = (await reload(store, player.id)).currentLocation;
    await act(runtime, vkUserId, 'BEGIN_DAY_3', {}, 'd3-dup');
    expect((await reload(store, player.id)).currentLocation).toBe(loc);
    const stale = await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    expect(stale.text).toMatch(/тропу|нельзя/i);
    expect((await store.getFlags(player.id)).day_3_complete).toBeUndefined();
    const earlyFurnace = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    expect(earlyFurnace.text).toMatch(/клин|нельзя|Печь — после/i);
  });

  it('compact hub stays at most 5 buttons after the week opens', async () => {
    const { runtime, vkUserId } = await seedDay2Done();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(isMainHub(hub.buttons)).toBe(true);
  });
});

describe('week 1 mock playthroughs', () => {
  async function walkToDay3(opts: SeedOpts = {}) {
    return seedDay2Done(opts);
  }

  async function ironAtCamp(
    runtime: GameRuntime,
    store: MemoryGameStore,
    playerId: string,
    vkUserId: string,
    tool: 'iron_sword' | 'iron_axe' | 'iron_pickaxe',
  ) {
    const loc = await reload(store, playerId);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    await store.addResource(playerId, 'COBBLESTONE', 8);
    await store.addResource(playerId, 'COAL', 4);
    await store.addResource(playerId, 'IRON_ORE', 8);
    await store.addResource(playerId, 'STICK', 4);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'furnace' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'add_coal' });
    const need = tool === 'iron_sword' ? 2 : 3;
    for (let i = 0; i < need; i += 1) await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'smelt' });
    await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'take' });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: tool });
  }

  it('A. Rem trust + bonded pet + lantern still beats Wenzel', async () => {
    const { store, runtime, player, vkUserId } = await walkToDay3({
      feed: true,
      showToken: true,
      lantern: true,
    });
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    await store.createItem({ playerId: player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
    await act(runtime, vkUserId, 'HELP_PET', { act: 'help' });
    await ironAtCamp(runtime, store, player.id, vkUserId, 'iron_sword');
    await act(runtime, vkUserId, 'COMPLETE_DAY_4');
    await act(runtime, vkUserId, 'BEGIN_DAY_5');
    const rich = await reload(store, player.id);
    rich.coins = 90;
    await store.savePlayer(rich);
    await act(runtime, vkUserId, 'TRADE_ACT', { act: 'buy', sku: 'glass' });
    await store.addResource(player.id, 'COAL', 1);
    await act(runtime, vkUserId, 'REPAIR_LANTERN');
    await act(runtime, vkUserId, 'COMPLETE_DAY_5');
    await act(runtime, vkUserId, 'BEGIN_DAY_6');
    await tank(store, player.id);
    await act(runtime, vkUserId, 'START_PVP', {});
    await act(runtime, vkUserId, 'COMPLETE_DAY_6');
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    const prep = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'prep' });
    expect(prep.text).toMatch(/Фонарь|питомец|шарнир/i);
    await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'pet' }, 'WIN');
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_7');
    expect(end.text).toContain('Осталось: 6');
    const flags = await store.getFlags(player.id);
    expect(flags.scavenger_bonded).toBe('1');
    expect(flags.lantern_repaired).toBe('1');
    expect(flags.week_1_complete).toBe('1');
    expect(flags.sold_rusty_token).toBeUndefined();
  });

  it('B. sold token, no pet, no lantern still finishes the week', async () => {
    const { store, runtime, player, vkUserId } = await walkToDay3({ hideToken: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    await ironAtCamp(runtime, store, player.id, vkUserId, 'iron_sword');
    await act(runtime, vkUserId, 'COMPLETE_DAY_4');
    await act(runtime, vkUserId, 'BEGIN_DAY_5');
    await act(runtime, vkUserId, 'TRADE_ACT', { act: 'sell_token' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_5');
    await act(runtime, vkUserId, 'BEGIN_DAY_6');
    const rich = await reload(store, player.id);
    rich.coins = 90;
    await store.savePlayer(rich);
    await act(runtime, vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_6');
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    const prep = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'prep' });
    expect(prep.text).toMatch(/Рем молчит|Без пета|Фонаря нет/i);
    await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'hinge' }, 'WIN');
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_7');
    expect(end.text).toContain('Осталось: 6');
    const flags = await store.getFlags(player.id);
    expect(flags.sold_rusty_token).toBe('1');
    expect(flags.scavenger_bonded).toBeUndefined();
    expect(flags.lantern_repaired).toBeUndefined();
    expect(flags.week_1_complete).toBe('1');
  });

  it('C. iron axe + tribute + emberkit still beats Wenzel', async () => {
    const { store, runtime, player, vkUserId } = await walkToDay3({ hostile: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_3');
    await fightUntil(runtime, store, player.id, vkUserId, 'moss_boar', {}, 'WIN');
    await act(runtime, vkUserId, 'COMPLETE_DAY_3');
    await act(runtime, vkUserId, 'BEGIN_DAY_4');
    const fissure = await reload(store, player.id);
    fissure.currentLocation = 'soot_fissure';
    await store.savePlayer(fissure);
    await act(runtime, vkUserId, 'EXPLORE');
    await act(runtime, vkUserId, 'HELP_PET', { act: 'rescue' });
    await store.addResource(player.id, 'COAL', 1);
    await act(runtime, vkUserId, 'HELP_PET', { act: 'tame' });
    await ironAtCamp(runtime, store, player.id, vkUserId, 'iron_axe');
    await act(runtime, vkUserId, 'COMPLETE_DAY_4');
    await act(runtime, vkUserId, 'BEGIN_DAY_5');
    await act(runtime, vkUserId, 'TRADE_ACT', { act: 'decline' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_5');
    await act(runtime, vkUserId, 'BEGIN_DAY_6');
    const rich = await reload(store, player.id);
    rich.coins = 90;
    await store.savePlayer(rich);
    await act(runtime, vkUserId, 'PAY_TRIBUTE', { with: 'coins' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_6');
    await act(runtime, vkUserId, 'BEGIN_DAY_7');
    await fightUntil(runtime, store, player.id, vkUserId, 'wenzel_warden', { move: 'axe' }, 'WIN');
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_7');
    expect(end.text).toContain('Осталось: 6');
    const flags = await store.getFlags(player.id);
    expect(flags.chose_iron_axe).toBe('1');
    expect(flags.emberkit_bonded).toBe('1');
    expect(flags.paid_scree_tribute).toBe('1');
    expect(flags.week_1_complete).toBe('1');
    expect(UNKNOWN_NODE7_CREATURE.name).toBe('???');
  });
});
