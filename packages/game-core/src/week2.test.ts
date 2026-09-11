import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BOSS_IDS,
  COMBAT_LOOT,
  CRAFT_RECIPES,
  CROP_TICKS_NEEDED,
  ENEMIES,
  FURNACE,
  ITEM_TEMPLATES,
  LOCATIONS,
  QUEST_TEMPLATES,
  STORY_FLAGS,
  resourceLabel,
} from '@kubolesie/content';
import { BALANCE_VERSION, GAME_COMMANDS, PROTOTYPE_VERSION, RESOURCE_TYPES, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';
import type { WeekCtx } from './week';
import { isWeek2Enemy, isWeek2Location, week2Modifiers, WEEK2_COMMANDS, WEEK2_ENEMIES } from './week2';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week2',
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

interface Week1Opts {
  lantern?: boolean;
  pet?: boolean;
  soldToken?: boolean;
  showToken?: boolean;
  ironAxe?: boolean;
}

async function seedWeek1Done(opts: Week1Opts = {}) {
  const { store, runtime, player, vkUserId } = await boot();
  const flags = [
    'day_1_complete',
    'day_2_complete',
    'day_3_complete',
    'day_4_complete',
    'day_5_complete',
    'day_6_complete',
    'day_7_complete',
    'week_1_complete',
    'met_rem',
    'node7_gate_closed',
    'activated_node7_token',
    'found_rusty_token',
    'opened_start_crate',
    'player_camp_founded',
    'camp_table_placed',
    'camp_fire_built',
    'camp_lit',
    'furnace_placed',
    'furnace_built',
    'first_ingot',
    'wenzel_defeated',
    'seen_seven_seals',
    'visited_ashen_wedge',
  ];
  if (opts.showToken) flags.push('showed_token_to_rem');
  if (opts.soldToken) flags.push('sold_rusty_token');
  if (opts.lantern) flags.push('lantern_repaired', 'found_broken_lantern');
  if (opts.pet) flags.push('scavenger_bonded', 'fed_stone_scavenger');
  if (opts.ironAxe) flags.push('chose_iron_axe');
  else flags.push('chose_iron_sword');
  for (const flag of flags) await store.setFlag(player.id, flag, '1');
  player.level = 8;
  player.xp = 640;
  player.maxHp = 140;
  player.hp = 140;
  player.maxEnergy = 40;
  player.energy = 40;
  player.coins = 80;
  player.currentLocation = 'player_camp';
  player.currentState = 'week1_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_pickaxe', rarity: 'COMMON' });
  await store.createItem({
    playerId: player.id,
    templateId: opts.ironAxe ? 'iron_axe' : 'iron_sword',
    rarity: 'UNCOMMON',
  });
  if (opts.lantern) {
    await store.createItem({ playerId: player.id, templateId: 'lit_lantern', rarity: 'UNCOMMON' });
  }
  await store.upsertPlayerQuest({
    playerId: player.id,
    questId: 'iron_for_gate',
    status: 'CLAIMED',
    progress: {},
  });
  await store.addResource(player.id, 'LOG', 16);
  await store.addResource(player.id, 'STICK', 16);
  await store.addResource(player.id, 'PLANK', 16);
  await store.addResource(player.id, 'COAL', 8);
  await store.addResource(player.id, 'COBBLESTONE', 16);
  await store.addResource(player.id, 'IRON_ORE', 8);
  await store.addResource(player.id, 'IRON_INGOT', 6);
  await store.setFlag(player.id, 'furnace_fuel', '8');
  return { store, runtime, player: await reload(store, player.id), vkUserId };
}

async function tank(store: MemoryGameStore, playerId: string, hp = 900) {
  const player = await reload(store, playerId);
  player.hp = hp;
  player.maxHp = Math.max(player.maxHp, hp);
  player.energy = Math.max(player.energy, 30);
  player.stats = { ...player.stats, attack: Math.max(player.stats.attack, 18) };
  await store.savePlayer(player);
  const items = await store.listItems(playerId);
  const order = ['iron_sword', 'bow', 'iron_axe', 'iron_pickaxe', 'stone_sword', 'wooden_sword', 'stone_knife'];
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
    if (want === 'WIN') await tank(store, playerId, 900 + i * 50);
    else {
      const player = await reload(store, playerId);
      player.hp = 1;
      await store.savePlayer(player);
    }
    last = await act(runtime, vkUserId, 'START_PVE', { enemyId, ...payload });
  }
  return last;
}

async function advanceWeek2(
  day: number,
  opts: {
    lantern?: boolean;
    pet?: boolean;
    soldToken?: boolean;
    ironAxe?: boolean;
    bow?: boolean;
    shield?: boolean;
    bucket?: boolean;
    mira?: 'help' | 'hide' | 'cautious';
    core?: boolean;
    danger?: boolean;
  } = {},
) {
  const seeded = await seedWeek1Done({
    lantern: opts.lantern,
    pet: opts.pet,
    soldToken: opts.soldToken,
    ironAxe: opts.ironAxe,
    showToken: !opts.soldToken,
  });
  const { store, runtime, player, vkUserId } = seeded;
  if (day < 8) return seeded;
  await act(runtime, vkUserId, 'BEGIN_DAY_8');
  await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
  if (day === 8) return seeded;
  await act(runtime, vkUserId, 'COMPLETE_DAY_8');
  await act(runtime, vkUserId, 'BEGIN_DAY_9');
  await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: opts.ironAxe ? 'iron_hoe' : 'stone_hoe' });
  await act(runtime, vkUserId, 'FARM_ACT', { act: 'prepare' });
  await act(runtime, vkUserId, 'FARM_ACT', { act: 'plant' });
  if (day === 9) return seeded;
  await act(runtime, vkUserId, 'COMPLETE_DAY_9');
  await act(runtime, vkUserId, 'BEGIN_DAY_10');
  await fightUntil(runtime, store, player.id, vkUserId, 'threadling');
  if (opts.bow) {
    await store.addResource(player.id, 'STRING', 3);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bow' });
  }
  if (day === 10) return seeded;
  await act(runtime, vkUserId, 'COMPLETE_DAY_10');
  await act(runtime, vkUserId, 'BEGIN_DAY_11');
  if (opts.bucket !== false) await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
  await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
  const miraAct = opts.mira === 'hide' ? 'mira_hide' : opts.mira === 'cautious' ? 'mira_cautious' : 'mira_help';
  await act(runtime, vkUserId, 'WEEK2_ACT', { act: miraAct });
  if (day === 11) return seeded;
  await act(runtime, vkUserId, 'COMPLETE_DAY_11');
  await act(runtime, vkUserId, 'BEGIN_DAY_12');
  if (opts.danger) await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_danger' });
  if (opts.bucket === false) await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'wade' });
  else await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'drain' });
  await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
  if (day === 12) return seeded;
  await act(runtime, vkUserId, 'COMPLETE_DAY_12');
  await act(runtime, vkUserId, 'BEGIN_DAY_13');
  if (opts.shield) await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'shield' });
  if (day === 13) return seeded;
  await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
  await act(runtime, vkUserId, 'COMPLETE_DAY_13');
  await act(runtime, vkUserId, 'BEGIN_DAY_14');
  if (opts.core) await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'use_core' });
  return seeded;
}

function modsCtx(flags: Record<string, string> = {}, items: string[] = []): WeekCtx {
  return {
    player: { id: 'p' } as PlayerRecord,
    flags,
    items: items.map((templateId, i) => ({
      id: `i${i}`,
      playerId: 'p',
      templateId,
      itemLevel: 1,
      rarity: 'COMMON',
      enhanceLevel: 0,
      createdAt: new Date(),
    })),
    resources: {},
    equipment: {},
    quests: {},
  };
}

describe('week 2 content canon', () => {
  it('keeps week 1 recipes and adds hoe/bow/shield/bucket/bread', () => {
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.stone_hoe.cost).toEqual({ COBBLESTONE: 2, STICK: 2 });
    expect(CRAFT_RECIPES.iron_hoe.cost).toEqual({ IRON_INGOT: 2, STICK: 2 });
    expect(CRAFT_RECIPES.bow.cost).toEqual({ STICK: 3, STRING: 3 });
    expect(CRAFT_RECIPES.shield.cost).toEqual({ PLANK: 6, IRON_INGOT: 1 });
    expect(CRAFT_RECIPES.bucket.cost).toEqual({ IRON_INGOT: 3 });
    expect(CRAFT_RECIPES.bread.cost).toEqual({ WHEAT: 3 });
    expect(FURNACE.coalFuel).toBe(8);
    expect(FURNACE.logFuel).toBe(3);
    expect(FURNACE.cookCost).toBe(1);
    expect(ENEMIES.threadling.name).toBe('Нитник');
    expect(ENEMIES.reed_stalker.name).toBe('Камышовый лазутчик');
    expect(ENEMIES.bog_gnawer.name).toBe('Топяной грызун');
    expect(ENEMIES.pitch_carapace.name).toBe('Смоляной панцирник');
    expect(ENEMIES.smolnik.name).toBe('Смольник');
    expect(ENEMIES.mist_warden.name).toBe('Туманный сторож');
    expect(LOCATIONS.mist_border.name).toBe('Кромка тумана');
    expect(LOCATIONS.drowned_quarry.name).toBe('Утонувший карьер');
    expect(ITEM_TEMPLATES.mist_charm.name).toBe('Туманный оберег');
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'second_seal')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    expect(BALANCE_VERSION).toBe('0.0.13');
  });
});

describe('day 8 mist border', () => {
  it('gates BEGIN_DAY_8 on week_1_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_8');
    expect(denied.text).toMatch(/нельзя/i);
  });

  it('old week 1 save starts day 8 and gathers seed/reed once', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done({ showToken: true, lantern: true, pet: true });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_8');
    expect(started.text).toMatch(/туман|низин/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    expect(started.text).toMatch(/жетон|фонар|питомец/i);
    const gather = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    expect(gather.text).toMatch(/семен|камыш|огонёк/i);
    const res = await store.getResources(player.id);
    expect(res.SEED).toBe(2);
    expect(res.REED).toBe(3);
    const again = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    expect((await store.getResources(player.id)).SEED).toBe(2);
    expect(again.text).toMatch(/камыш/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_8');
    expect(done.text).toMatch(/огонёк|нить|грядк/i);
    expect((await store.getFlags(player.id)).day_8_complete).toBe('1');
    expect((await store.getFlags(player.id)).farming_unlocked).toBe('1');
  });

  it('sold token gets a colder rem line and still proceeds', async () => {
    const { runtime, vkUserId } = await seedWeek1Done({ soldToken: true });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_8');
    expect(started.text).toMatch(/продал/i);
  });
});

describe('day 9 farming', () => {
  async function planted() {
    const seeded = await seedWeek1Done();
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    return seeded;
  }

  it('crafts hoe, plants, rejects instant harvest, then harvests after ticks', async () => {
    const { store, runtime, player, vkUserId } = await planted();
    expect(await itemCount(store, player.id, 'stone_hoe')).toBe(1);
    const instant = await act(runtime, vkUserId, 'FARM_ACT', { act: 'harvest' });
    expect(instant.text).toMatch(/не выросло|нельзя/i);
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'water' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'water' });
    const crop = await act(runtime, vkUserId, 'FARM_ACT', { act: 'harvest' });
    expect(crop.text).toMatch(/урожай|пшениц/i);
    expect((await store.getResources(player.id)).WHEAT).toBeGreaterThanOrEqual(1);
    expect((await store.getFlags(player.id)).first_harvest).toBe('1');
    const dup = await act(runtime, vkUserId, 'FARM_ACT', { act: 'harvest' }, 'harvest-once');
    const again = await act(runtime, vkUserId, 'FARM_ACT', { act: 'harvest' }, 'harvest-once');
    expect(dup.text).toBe(again.text);
    await store.addResource(player.id, 'WHEAT', 3);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bread' });
    expect(await itemCount(store, player.id, 'bread')).toBe(1);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    expect(done.text).toMatch(/нит/i);
    expect((await store.getFlags(player.id)).white_thread_found).toBe('1');
  });

  it('next game day ripens the crop and expand is optional', async () => {
    const { store, runtime, player, vkUserId } = await planted();
    await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    await act(runtime, vkUserId, 'BEGIN_DAY_10');
    expect((await store.getFlags(player.id)).crop_ready).toBe('1');
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'expand' });
    expect((await store.getFlags(player.id)).plot_expanded).toBe('1');
  });
});

describe('day 10 string and bow', () => {
  async function toDay10() {
    const seeded = await seedWeek1Done();
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_10');
    return seeded;
  }

  it('drops STRING, unlocks bow, melee still works', async () => {
    const { store, runtime, player, vkUserId } = await toDay10();
    const fight = await fightUntil(runtime, store, player.id, vkUserId, 'threadling');
    expect(fight.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).STRING).toBeGreaterThanOrEqual(1);
    expect((await store.getFlags(player.id)).first_string).toBe('1');
    await store.addResource(player.id, 'STRING', 3);
    await store.addResource(player.id, 'STICK', 3);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bow' });
    expect(await itemCount(store, player.id, 'bow')).toBe(1);
    expect((await store.getFlags(player.id)).first_bow).toBe('1');
    const stalker = await fightUntil(runtime, store, player.id, vkUserId, 'reed_stalker');
    expect(stalker.text).toMatch(/Победа|лук/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_10');
    expect(done.text).toMatch(/нить|вод/i);
  });
});

describe('day 11 mira and bucket', () => {
  async function toDay11() {
    const seeded = await seedWeek1Done();
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_10');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'threadling');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_10');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_11');
    return seeded;
  }

  it('crafts bucket, meets mira with trust choices, iron recovery stays open', async () => {
    const { store, runtime, player, vkUserId } = await toDay11();
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    expect(await itemCount(store, player.id, 'bucket')).toBe(1);
    const mira = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    expect(mira.text).toMatch(/Мира/i);
    expect(mira.buttons.length).toBeLessThanOrEqual(5);
    const help = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_help' });
    expect(help.text).toMatch(/печат|замк/i);
    expect(Number((await store.getFlags(player.id)).mira_trust)).toBeGreaterThanOrEqual(2);
    const loc = await reload(store, player.id);
    loc.currentLocation = 'old_adit';
    await store.savePlayer(loc);
    const iron = await act(runtime, vkUserId, 'GATHER_IRON');
    expect(iron.text).toMatch(/руд|желез/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_11');
    expect((await store.getFlags(player.id)).met_mira).toBe('1');
  });

  it('hiding seal still completes the day', async () => {
    const { store, runtime, player, vkUserId } = await toDay11();
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_hide' });
    expect((await store.getFlags(player.id)).mira_hid_seal).toBe('1');
    await act(runtime, vkUserId, 'COMPLETE_DAY_11');
    expect((await store.getFlags(player.id)).day_11_complete).toBe('1');
  });
});

describe('day 12 drowned quarry', () => {
  async function toDay12() {
    const seeded = await seedWeek1Done();
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_10');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'threadling');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_10');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'mira_help' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_12');
    return seeded;
  }

  it('drains, gathers clay/fish, reaches chamber once', async () => {
    const { store, runtime, player, vkUserId } = await toDay12();
    const quarry = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry' });
    expect(quarry.buttons.length).toBeLessThanOrEqual(5);
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'drain' });
    const clay = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_clay' });
    expect(clay.text).toMatch(/Глина/i);
    await fightUntil(runtime, store, player.id, vkUserId, 'bog_gnawer');
    expect((await store.getResources(player.id)).RAW_FISH).toBeGreaterThanOrEqual(1);
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_12');
    expect(done.text).toMatch(/символ|печат/i);
    expect((await store.getFlags(player.id)).quarry_chamber).toBe('1');
    await store.setFlag(player.id, 'furnace_fuel', '8');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    await store.savePlayer(loc);
    const cook = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'cook_fish' });
    expect(cook.text).toMatch(/Рыба/i);
    expect((await store.getResources(player.id)).COOKED_FISH).toBe(1);
  });

  it('wade works without bucket and flood path is one-time', async () => {
    const { store, runtime, player, vkUserId } = await toDay12();
    const items = await store.listItems(player.id);
    const bucket = items.find((item) => item.templateId === 'bucket');
    if (bucket) await store.removeItem(bucket.id);
    await store.setFlag(player.id, 'has_bucket', '');
    const wade = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'wade' });
    expect(wade.text).toMatch(/−8 HP|Холод/i);
    expect((await store.getFlags(player.id)).quarry_drained).toBe('1');
  });
});

describe('day 13 smolnik', () => {
  async function toDay13(withGear = true) {
    const seeded = await seedWeek1Done({ lantern: true, pet: true });
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_10');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'threadling');
    await seeded.store.addResource(seeded.player.id, 'STRING', 3);
    if (withGear) await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'bow' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_10');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'mira_help' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_12');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'drain' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_12');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_13');
    if (withGear) await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'shield' });
    return seeded;
  }

  it('retries without wipe and grants BOG_CORE once', async () => {
    const { store, runtime, player, vkUserId } = await toDay13(true);
    const knife = await itemCount(store, player.id, 'crafting_table');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'smolnik', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(knife);
    expect((await store.getFlags(player.id)).smolnik_failed).toBe('1');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).BOG_CORE).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    expect((await store.getResources(player.id)).BOG_CORE).toBe(1);
    await act(runtime, vkUserId, 'COMPLETE_DAY_13');
    expect((await store.getFlags(player.id)).defeated_smolnik).toBe('1');
  });
});

describe('day 14 mist warden', () => {
  async function toDay14(opts: { core?: boolean; gear?: boolean; trust?: boolean } = {}) {
    const seeded = await seedWeek1Done({ lantern: true, pet: Boolean(opts.trust), showToken: true });
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_8');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(seeded.runtime, seeded.vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_9');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_10');
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'threadling');
    if (opts.gear) {
      await seeded.store.addResource(seeded.player.id, 'STRING', 3);
      await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'bow' });
    }
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_10');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(seeded.runtime, seeded.vkUserId, opts.trust === false ? 'WEEK2_ACT' : 'WEEK2_ACT', {
      act: opts.trust === false ? 'mira_hide' : 'mira_help',
    });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_11');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_12');
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'drain' });
    await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_12');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_13');
    if (opts.gear) await act(seeded.runtime, seeded.vkUserId, 'CRAFT_ITEM', { recipeId: 'shield' });
    await fightUntil(seeded.runtime, seeded.store, seeded.player.id, seeded.vkUserId, 'smolnik');
    await act(seeded.runtime, seeded.vkUserId, 'COMPLETE_DAY_13');
    await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_14');
    if (opts.core) await act(seeded.runtime, seeded.vkUserId, 'WEEK2_ACT', { act: 'use_core' });
    return seeded;
  }

  it('prepared path wins, rewards once, closes week with Осталось: 5', async () => {
    const { store, runtime, player, vkUserId } = await toDay14({ core: true, gear: true, trust: true });
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'core' }, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'core' });
    expect(win.text).toMatch(/Победа/i);
    expect(await itemCount(store, player.id, 'mist_charm')).toBe(1);
    expect(await itemCount(store, player.id, 'seal_shard_6')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_6).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'core' });
    expect(await itemCount(store, player.id, 'mist_charm')).toBe(1);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_14');
    expect(end.text).toContain('Осталось: 5');
    expect(end.text).toMatch(/Две печати молчат/i);
    expect((await store.getFlags(player.id)).week_2_complete).toBe('1');
    const again = await act(runtime, vkUserId, 'BEGIN_DAY_14');
    expect(again.text).toContain('Осталось: 5');
  });

  it('minimal melee path without bow/shield/core still wins', async () => {
    const { store, runtime, player, vkUserId } = await toDay14({ core: false, gear: false, trust: false });
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'core' });
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_14');
    expect((await store.getFlags(player.id)).week_2_complete).toBe('1');
  });
});

describe('week 2 playthroughs', () => {
  it('A. bow + shield + mira trust + bog core', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done({ lantern: true, pet: true, showToken: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_8');
    await act(runtime, vkUserId, 'BEGIN_DAY_9');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    await act(runtime, vkUserId, 'BEGIN_DAY_10');
    await fightUntil(runtime, store, player.id, vkUserId, 'threadling');
    await store.addResource(player.id, 'STRING', 3);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bow' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_10');
    await act(runtime, vkUserId, 'BEGIN_DAY_11');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_help' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_11');
    await act(runtime, vkUserId, 'BEGIN_DAY_12');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_danger' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'flood_path' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_12');
    await act(runtime, vkUserId, 'BEGIN_DAY_13');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'shield' });
    await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_13');
    await act(runtime, vkUserId, 'BEGIN_DAY_14');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'use_core' });
    await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'drain' });
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_14');
    expect(end.text).toContain('Осталось: 5');
    const flags = await store.getFlags(player.id);
    expect(flags.week_2_complete).toBe('1');
    expect(flags.first_bow).toBe('1');
    expect(flags.has_shield).toBe('1');
    expect(flags.used_bog_core).toBe('1');
    expect(flags.week_1_complete).toBe('1');
    const ach = (await store.listAchievements(player.id)).map((row) => row.achievementId);
    expect(ach).toContain('FIRST_BOW');
    expect(ach).toContain('WEEK_TWO_COMPLETE');
  });

  it('B. melee, hidden mira, no expand still finishes', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done({ soldToken: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_8');
    await act(runtime, vkUserId, 'BEGIN_DAY_9');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'stone_hoe' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    await act(runtime, vkUserId, 'BEGIN_DAY_10');
    await fightUntil(runtime, store, player.id, vkUserId, 'reed_stalker');
    await act(runtime, vkUserId, 'COMPLETE_DAY_10');
    await act(runtime, vkUserId, 'BEGIN_DAY_11');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_hide' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_11');
    await act(runtime, vkUserId, 'BEGIN_DAY_12');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'wade' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_12');
    await act(runtime, vkUserId, 'BEGIN_DAY_13');
    await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_13');
    await act(runtime, vkUserId, 'BEGIN_DAY_14');
    await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden');
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_14');
    expect(end.text).toContain('Осталось: 5');
    const flags = await store.getFlags(player.id);
    expect(flags.first_bow).toBeUndefined();
    expect(flags.mira_hid_seal).toBe('1');
    expect(flags.week_2_complete).toBe('1');
  });

  it('C. iron hoe + cautious mira + keep bog core', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done({ ironAxe: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_8');
    await act(runtime, vkUserId, 'BEGIN_DAY_9');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'iron_hoe' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'prepare' });
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'plant' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    await act(runtime, vkUserId, 'BEGIN_DAY_10');
    await fightUntil(runtime, store, player.id, vkUserId, 'threadling');
    await act(runtime, vkUserId, 'COMPLETE_DAY_10');
    await act(runtime, vkUserId, 'BEGIN_DAY_11');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'bucket' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'meet_mira' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'mira_cautious' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_11');
    await act(runtime, vkUserId, 'BEGIN_DAY_12');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'drain' });
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry_chamber' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_12');
    await act(runtime, vkUserId, 'BEGIN_DAY_13');
    await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    expect((await store.getResources(player.id)).BOG_CORE).toBe(1);
    await act(runtime, vkUserId, 'COMPLETE_DAY_13');
    await act(runtime, vkUserId, 'BEGIN_DAY_14');
    await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden');
    await act(runtime, vkUserId, 'COMPLETE_DAY_14');
    const flags = await store.getFlags(player.id);
    expect(flags.used_bog_core).toBeUndefined();
    expect(flags.mira_cautious).toBe('1');
    expect(flags.week_2_complete).toBe('1');
    expect(flags.week_1_complete).toBe('1');
  });
});

describe('week 2 security and menus', () => {
  it('duplicate event_id does not double border loot', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' }, 'border-once');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border' }, 'border-once');
    expect((await store.getResources(player.id)).SEED).toBe(2);
  });

  it('hub stays compact after week 2 opens', async () => {
    const { runtime, vkUserId } = await seedWeek1Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
  });

  it('does not start day 22 or mention payments', async () => {
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    const { runtime, vkUserId } = await seedWeek1Done();
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_8');
    expect(started.text).not.toMatch(/donat|premium|mini app/i);
  });
});

describe('week 2 sequential gates', () => {
  it('rejects skipping to day 9 and completing day 8 without the border', async () => {
    const { runtime, vkUserId } = await seedWeek1Done();
    const skip = await act(runtime, vkUserId, 'BEGIN_DAY_9');
    expect(skip.text).toMatch(/нельзя/i);
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_8');
    expect(early.text).toMatch(/нельзя|кромк/i);
  });

  it('rejects day 10 complete without string and day 13 without smolnik', async () => {
    const day9 = await advanceWeek2(9);
    await act(day9.runtime, day9.vkUserId, 'COMPLETE_DAY_9');
    await act(day9.runtime, day9.vkUserId, 'BEGIN_DAY_10');
    const noString = await act(day9.runtime, day9.vkUserId, 'COMPLETE_DAY_10');
    expect(noString.text).toMatch(/нельзя|нить/i);
    const late = await advanceWeek2(13);
    const noBoss = await act(late.runtime, late.vkUserId, 'COMPLETE_DAY_13');
    expect(noBoss.text).toMatch(/нельзя|Смольник/i);
  });

  it('iron axe rem line still opens farming', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done({ ironAxe: true });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_8');
    expect(started.text).toMatch(/топор/i);
    expect((await store.getFlags(player.id)).farming_unlocked).toBe('1');
  });
});

describe('week 2 farming edges', () => {
  it('requires a hoe and rejects planting without a plot or seeds', async () => {
    const { runtime, vkUserId } = await seedWeek1Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    const noHoe = await act(runtime, vkUserId, 'FARM_ACT', { act: 'prepare' });
    expect(noHoe.text).toMatch(/мотыг/i);
    const { runtime: rt, vkUserId: vk, store, player } = await advanceWeek2(9);
    await rt.handle(event('FARM_ACT', { act: 'plant' }, 'plant-again', vk));
    const twice = await act(rt, vk, 'FARM_ACT', { act: 'plant' });
    expect(twice.text).toMatch(/уже|жди|нельзя/i);
    await store.addResource(player.id, 'SEED', -((await store.getResources(player.id)).SEED ?? 0));
    const loc = await reload(store, player.id);
    loc.currentState = 'day9_start';
    await store.savePlayer(loc);
    await store.setFlag(player.id, 'crop_planted', '');
    await store.setFlag(player.id, 'crop_ready', '');
    const noSeed = await act(rt, vk, 'FARM_ACT', { act: 'plant' });
    expect(noSeed.text).toMatch(/семен|нельзя|Нет/i);
  });

  it('bucket watering ripens in one pour and expand doubles wheat', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(9);
    await store.createItem({ playerId: player.id, templateId: 'bucket', rarity: 'COMMON' });
    await store.setFlag(player.id, 'has_bucket', '1');
    const watered = await act(runtime, vkUserId, 'FARM_ACT', { act: 'water' });
    expect(watered.text).toMatch(/Колосья|снимать|Ведро/i);
    expect((await store.getFlags(player.id)).crop_ready).toBe('1');
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'expand' });
    const crop = await act(runtime, vkUserId, 'FARM_ACT', { act: 'harvest' });
    expect(crop.text).toMatch(/пшениц|урожай/i);
    expect((await store.getResources(player.id)).WHEAT).toBeGreaterThanOrEqual(2);
  });

  it('crop ripens from next game day ticks', async () => {
    expect(CROP_TICKS_NEEDED).toBe(2);
    const { store, player, vkUserId, runtime } = await advanceWeek2(9);
    expect((await store.getFlags(player.id)).crop_ready).toBeFalsy();
    await act(runtime, vkUserId, 'COMPLETE_DAY_9');
    await act(runtime, vkUserId, 'BEGIN_DAY_10');
    expect((await store.getFlags(player.id)).crop_ready).toBe('1');
  });
});

describe('week 2 combat modifiers', () => {
  it('gives bow a first strike and leaves unarmed week2 opening at zero', () => {
    const bow = week2Modifiers(modsCtx({ has_bow: '1' }, ['bow']), 'threadling');
    expect(bow.playerOpeningHits).toBe(1);
    expect(bow.player.speed).toBe(8);
    expect(bow.note).toMatch(/лук/i);
    const melee = week2Modifiers(modsCtx({ chose_iron_sword: '1' }, ['iron_sword']), 'threadling');
    expect(melee.playerOpeningHits).toBe(0);
    expect(melee.player.minDamage).toBe(7);
  });

  it('shields bosses harder and smolnik loses defense to a bow', () => {
    const shield = week2Modifiers(modsCtx({}, ['shield']), 'smolnik');
    expect(shield.player.defense).toBe(6);
    const trash = week2Modifiers(modsCtx({}, ['shield']), 'threadling');
    expect(trash.player.defense).toBe(4);
    const ranged = week2Modifiers(modsCtx({}, ['bow']), 'smolnik');
    expect(ranged.enemy.defense).toBe(-2);
  });

  it('mist warden respects bucket, bog core, mira trust and lantern', () => {
    const stacked = week2Modifiers(
      modsCtx(
        {
          has_bucket: '1',
          used_bog_core: '1',
          mira_trust: '2',
          lantern_repaired: '1',
          scavenger_bonded: '1',
        },
        ['bucket', 'bow', 'shield'],
      ),
      'mist_warden',
      { move: 'drain' },
    );
    expect(stacked.playerOpeningHits).toBe(1);
    expect(stacked.enemy.hp).toBe(-28);
    expect(stacked.enemy.dodge).toBe(0);
    expect(stacked.enemy.defense).toBe(-4);
    expect(stacked.player.dodge).toBe(14);
    expect(stacked.note).toMatch(/ядро|сердцевина|ведро|фонарь/i);
    const quiet = week2Modifiers(modsCtx({ mira_trust: '0' }, ['iron_sword']), 'mist_warden');
    expect(quiet.note).toMatch(/молчит/i);
    expect(quiet.enemy.hp).toBeUndefined();
  });
});

describe('week 2 quarry and bosses extra', () => {
  it('flood shortcut grants drowned pearl once', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(12, { danger: true, bucket: true });
    const pearl = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'flood_path' });
    expect(pearl.text).toMatch(/жемчужин/i);
    expect(await itemCount(store, player.id, 'drowned_pearl')).toBe(1);
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'flood_path' });
    expect(await itemCount(store, player.id, 'drowned_pearl')).toBe(1);
    expect((await store.getFlags(player.id)).took_flood_path).toBe('1');
  });

  it('repeatable quarry drops clay/resin/fish without a second bog core', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(12);
    const clay = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_clay' });
    expect(clay.text).toMatch(/Глина/i);
    await fightUntil(runtime, store, player.id, vkUserId, 'pitch_carapace');
    expect((await store.getResources(player.id)).MIST_RESIN).toBeGreaterThanOrEqual(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'bog_gnawer');
    expect((await store.getResources(player.id)).RAW_FISH).toBeGreaterThanOrEqual(1);
    expect((await store.getResources(player.id)).BOG_CORE ?? 0).toBe(0);
    const quarry = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'quarry' });
    expect(quarry.buttons.length).toBeLessThanOrEqual(5);
    expect(quarry.buttons.some((btn) => /COMMON|BACK|Score/i.test(btn.label))).toBe(false);
  });

  it('smolnik melee without bow or shield still wins and keeps inventory', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(13, { bow: false, shield: false });
    expect(await itemCount(store, player.id, 'bow')).toBe(0);
    expect(await itemCount(store, player.id, 'shield')).toBe(0);
    const table = await itemCount(store, player.id, 'crafting_table');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'smolnik');
    expect(win.text).toMatch(/Победа/i);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    expect((await store.getResources(player.id)).BOG_CORE).toBe(1);
  });

  it('cooked fish restores energy and duplicate day 14 complete is stable', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(14, {
      bow: true,
      shield: true,
      core: true,
      lantern: true,
      pet: true,
    });
    await store.addResource(player.id, 'RAW_FISH', 1);
    await store.setFlag(player.id, 'furnace_fuel', '8');
    const loc = await reload(store, player.id);
    loc.currentLocation = 'player_camp';
    loc.energy = 4;
    await store.savePlayer(loc);
    const cook = await act(runtime, vkUserId, 'FURNACE_ACT', { act: 'cook_fish' });
    expect(cook.text).toMatch(/Рыба/i);
    expect((await store.getResources(player.id)).COOKED_FISH).toBe(1);
    await act(runtime, vkUserId, 'FARM_ACT', { act: 'eat_fish' });
    expect((await reload(store, player.id)).energy).toBeGreaterThan(4);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden', { move: 'drain' });
    expect(win.text).toMatch(/Победа/i);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_14', {}, 'end-14');
    const again = await act(runtime, vkUserId, 'COMPLETE_DAY_14', {}, 'end-14');
    expect(end.text).toBe(again.text);
    expect(end.text).toContain('Осталось: 5');
    expect(await itemCount(store, player.id, 'mist_charm')).toBe(1);
  });
});

describe('week 2 recovery, security, localization', () => {
  it('keeps iron and coal gathering as recovery after spending ingots', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek1Done();
    await store.addResource(player.id, 'IRON_INGOT', -((await store.getResources(player.id)).IRON_INGOT ?? 0));
    const loc = await reload(store, player.id);
    loc.currentLocation = 'old_adit';
    await store.savePlayer(loc);
    const iron = await act(runtime, vkUserId, 'GATHER_IRON');
    expect(iron.text).toMatch(/руд|желез/i);
    const coal = await act(runtime, vkUserId, 'GATHER_COAL');
    expect(coal.text).toMatch(/угл/i);
  });

  it('rejects payload-forged loot, early bosses and week2 acts before week 1', async () => {
    const fresh = await boot();
    const earlyAct = await act(fresh.runtime, fresh.vkUserId, 'WEEK2_ACT', { act: 'gather_border' });
    expect(earlyAct.text).toMatch(/нельзя/i);
    const { store, runtime, player, vkUserId } = await seedWeek1Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_8');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'gather_border', SEED: 99, amount: 999, reward: 'BOG_CORE' });
    expect((await store.getResources(player.id)).SEED).toBe(2);
    expect((await store.getResources(player.id)).BOG_CORE ?? 0).toBe(0);
    const warden = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'mist_warden', hp: 1, damage: 999 });
    expect(warden.text).toMatch(/нельзя/i);
    const smolnik = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'smolnik' });
    expect(smolnik.text).toMatch(/нельзя/i);
    const unknown = await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'grant_all', location: 'second_seal' });
    expect((await store.getResources(player.id)).SEAL_SHARD_6 ?? 0).toBe(0);
    expect(unknown.buttons.length).toBeLessThanOrEqual(5);
  });

  it('profile says Очки, menus stay Russian, clans and week 1 stay intact', async () => {
    const { runtime, vkUserId } = await seedWeek1Done();
    const profile = await act(runtime, vkUserId, 'OPEN_PROFILE');
    expect(profile.text).toContain('Очки');
    expect(profile.text).not.toMatch(/\bScore\b/);
    expect(profile.buttons.length).toBeLessThanOrEqual(5);
    expect(labels(profile).some((label) => /COMMON|UNCOMMON|BACK/.test(label))).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('CLAN_ACT')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('CLAN_WAR')).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    const camp = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
    const { runtime: rt, vkUserId: vk } = await boot();
    const day1 = await act(rt, vk, 'EXPLORE');
    expect(day1.text).toMatch(/лес|ящик|поляна|Рем/i);
    expect(day1.text).not.toMatch(/Вторая печать/i);
  });

  it('lists week 2 content without English resource ids in labels', () => {
    expect(RESOURCE_TYPES).toEqual(expect.arrayContaining(['SEED', 'WHEAT', 'STRING', 'REED', 'CLAY', 'RAW_FISH', 'COOKED_FISH', 'MIST_RESIN', 'BOG_CORE', 'SEAL_SHARD_6']));
    expect(resourceLabel('SEED')).toMatch(/Семена/);
    expect(resourceLabel('BOG_CORE')).toMatch(/Сердцевина/);
    expect(resourceLabel('SEAL_SHARD_6')).toMatch(/печат/);
    expect(STORY_FLAGS).toEqual(expect.arrayContaining(['week_2_complete', 'farming_unlocked', 'met_mira', 'defeated_smolnik']));
    expect(BOSS_IDS).toEqual(expect.arrayContaining(['smolnik', 'mist_warden', 'wenzel_warden']));
    expect(ACHIEVEMENTS.FIRST_BOW.id).toBe('FIRST_BOW');
    expect(ACHIEVEMENTS.WEEK_TWO_COMPLETE.id).toBe('WEEK_TWO_COMPLETE');
    expect(WEEK2_COMMANDS).toHaveLength(16);
    expect(WEEK2_ENEMIES.every(isWeek2Enemy)).toBe(true);
    expect(isWeek2Location('drowned_quarry')).toBe(true);
    expect(isWeek2Location('ashen_wedge')).toBe(false);
    expect(COMBAT_LOOT.threadling.resources?.STRING).toEqual([1, 1]);
    expect(ITEM_TEMPLATES.bow.name).toBe('Лук');
    expect(ITEM_TEMPLATES.shield.name).toBe('Щит');
    expect(ITEM_TEMPLATES.bucket.name).toBe('Ведро');
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(FURNACE.coalFuel).toBe(8);
    expect(LOCATIONS.mist_lowland.name).toBe('Туманная низина');
    expect(LOCATIONS.second_seal.name).toBe('Вторая печать');
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'mist_trail')).toBe(true);
    expect(ENEMIES.wenzel_warden.name).not.toBe(ENEMIES.mist_warden.name);
  });

  it('mira cautious and hide never block week 2 and trust stays a modifier', async () => {
    const cautious = await advanceWeek2(14, { mira: 'cautious', bow: false, shield: false, core: false });
    const win = await fightUntil(
      cautious.runtime,
      cautious.store,
      cautious.player.id,
      cautious.vkUserId,
      'mist_warden',
    );
    expect(win.text).toMatch(/Победа/i);
    await act(cautious.runtime, cautious.vkUserId, 'COMPLETE_DAY_14');
    expect((await cautious.store.getFlags(cautious.player.id)).week_2_complete).toBe('1');
    expect((await cautious.store.getFlags(cautious.player.id)).mira_cautious).toBe('1');
    const hidden = await advanceWeek2(11, { mira: 'hide', bucket: false });
    await act(hidden.runtime, hidden.vkUserId, 'COMPLETE_DAY_11');
    expect((await hidden.store.getFlags(hidden.player.id)).day_11_complete).toBe('1');
    expect((await hidden.store.getFlags(hidden.player.id)).mira_hid_seal).toBe('1');
  });

  it('bog core spend is optional and cannot be double-spent', async () => {
    const { store, runtime, player, vkUserId } = await advanceWeek2(14, { core: false, bow: true });
    expect((await store.getResources(player.id)).BOG_CORE).toBe(1);
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'use_core' }, 'core-once');
    expect((await store.getResources(player.id)).BOG_CORE).toBe(0);
    expect((await store.getFlags(player.id)).used_bog_core).toBe('1');
    await act(runtime, vkUserId, 'WEEK2_ACT', { act: 'use_core' }, 'core-once');
    expect((await store.getResources(player.id)).BOG_CORE).toBe(0);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'mist_warden');
    expect(win.text).toMatch(/Победа/i);
  });
});
