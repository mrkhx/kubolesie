import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BOSS_IDS,
  COMBAT_LOOT,
  CRAFT_RECIPES,
  ENEMIES,
  ITEM_TEMPLATES,
  LOCATIONS,
  QUEST_TEMPLATES,
  STORY_FLAGS,
  TRADEABLE_RESOURCES,
  isTradeableAsset,
  resourceLabel,
} from '@kubolesie/content';
import {
  BALANCE_VERSION,
  GAME_COMMANDS,
  PROTOTYPE_VERSION,
  RESOURCE_TYPES,
  type NormalizedIncomingEvent,
} from '@kubolesie/shared';
import { simulateBattle, type CombatantSnapshot } from '@kubolesie/combat-engine';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';
import type { WeekCtx } from './week';
import { createFixedListing } from './market';
import { acceptJobContract } from './jobs';
import { ActionRejectedError } from './errors';
import {
  isWeek5Enemy,
  isWeek5Location,
  week5Modifiers,
  WEEK5_COMMANDS,
  WEEK5_ENEMIES,
} from './week5';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week5',
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

interface SeedOpts {
  lantern?: boolean;
  pet?: boolean;
  soldToken?: boolean;
  miraTrust?: number;
  bow?: boolean;
  shield?: boolean;
  blue?: boolean;
}

async function seedWeek4Done(opts: SeedOpts = {}) {
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
    'day_8_complete',
    'day_9_complete',
    'day_10_complete',
    'day_11_complete',
    'day_12_complete',
    'day_13_complete',
    'day_14_complete',
    'week_2_complete',
    'day_15_complete',
    'day_16_complete',
    'day_17_complete',
    'day_18_complete',
    'day_19_complete',
    'day_20_complete',
    'day_21_complete',
    'week_3_complete',
    'day_22_complete',
    'day_23_complete',
    'day_24_complete',
    'day_25_complete',
    'day_26_complete',
    'day_27_complete',
    'day_28_complete',
    'week_4_complete',
    'met_rem',
    'met_mira',
    'farming_unlocked',
    'first_harvest',
    'first_string',
    'furnace_placed',
    'furnace_built',
    'first_ingot',
    'wenzel_defeated',
    'defeated_smolnik',
    'mist_warden_defeated',
    'vyazen_defeated',
    'defeated_rootlasher',
    'seen_four_seals',
    'seen_three_seals',
    'tlennik_defeated',
    'defeated_blackroot',
    'warped_network_seen',
    'player_camp_founded',
    'camp_table_placed',
    'camp_fire_built',
    'camp_lit',
    'chose_iron_sword',
    'yara_claim_seen',
    'has_path_charm',
  ];
  if (opts.soldToken) flags.push('sold_rusty_token');
  else flags.push('showed_token_to_rem', 'rem_revealed_hinge');
  if (opts.lantern) flags.push('lantern_repaired', 'found_broken_lantern');
  if (opts.pet) flags.push('scavenger_bonded', 'fed_stone_scavenger');
  if (opts.bow) flags.push('has_bow', 'first_bow');
  if (opts.shield) flags.push('has_shield');
  if (opts.blue) flags.push('unknown_blue_mineral', 'found_blue_light');
  for (const flag of flags) await store.setFlag(player.id, flag, '1');
  if (opts.miraTrust != null) await store.setFlag(player.id, 'mira_trust', String(opts.miraTrust));
  else await store.setFlag(player.id, 'mira_trust', '2');
  player.level = 13;
  player.xp = 1400;
  player.maxHp = 180;
  player.hp = 180;
  player.maxEnergy = 44;
  player.energy = 44;
  player.coins = 200;
  player.currentLocation = 'player_camp';
  player.currentState = 'week4_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'iron_sword', rarity: 'UNCOMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_hoe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'bucket', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'root_charm', rarity: 'RARE' });
  await store.createItem({ playerId: player.id, templateId: 'path_charm', rarity: 'RARE' });
  if (opts.lantern) await store.createItem({ playerId: player.id, templateId: 'lit_lantern', rarity: 'UNCOMMON' });
  if (opts.bow) await store.createItem({ playerId: player.id, templateId: 'bow', rarity: 'UNCOMMON' });
  if (opts.shield) await store.createItem({ playerId: player.id, templateId: 'shield', rarity: 'UNCOMMON' });
  await store.addResource(player.id, 'LOG', 40);
  await store.addResource(player.id, 'STICK', 16);
  await store.addResource(player.id, 'PLANK', 16);
  await store.addResource(player.id, 'COAL', 12);
  await store.addResource(player.id, 'COBBLESTONE', 30);
  await store.addResource(player.id, 'IRON_ORE', 8);
  await store.addResource(player.id, 'IRON_INGOT', 6);
  await store.addResource(player.id, 'FOOD', 12);
  await store.addResource(player.id, 'FIBER', 8);
  await store.addResource(player.id, 'HERBS', 4);
  await store.addResource(player.id, 'ROT_RESIN', 4);
  await store.addResource(player.id, 'BLACK_REED', 4);
  await store.setFlag(player.id, 'furnace_fuel', '8');
  return { store, runtime, player: await reload(store, player.id), vkUserId };
}

async function tank(store: MemoryGameStore, playerId: string, hp = 900) {
  const player = await reload(store, playerId);
  player.hp = hp;
  player.maxHp = Math.max(player.maxHp, hp);
  player.energy = Math.max(player.energy, 30);
  player.stats = { ...player.stats, attack: Math.max(player.stats.attack, 20) };
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
  for (let i = 0; i < 32; i += 1) {
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

async function pickRoute(
  runtime: GameRuntime,
  vkUserId: string,
  kind: 'boardwalk' | 'islands' | 'reed' = 'boardwalk',
) {
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'inspect' });
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: `route_${kind}` });
}

async function toDay(
  day: number,
  opts: SeedOpts & {
    route?: 'boardwalk' | 'islands' | 'reed';
    path?: 'plank' | 'stone' | 'reed';
    social?: 'help' | 'talk' | 'pass' | 'pvp';
    pick?: 'chase' | 'check' | 'old_route';
  } = {},
) {
  const seeded = await seedWeek4Done(opts);
  const { runtime, vkUserId, store, player } = seeded;
  await act(runtime, vkUserId, 'BEGIN_DAY_29');
  if (day === 29) return seeded;
  await pickRoute(runtime, vkUserId, opts.route ?? 'boardwalk');
  await act(runtime, vkUserId, 'COMPLETE_DAY_29');
  await act(runtime, vkUserId, 'BEGIN_DAY_30');
  if (day === 30) return seeded;
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: `path_${opts.path ?? 'plank'}` });
  await act(runtime, vkUserId, 'COMPLETE_DAY_30');
  await act(runtime, vkUserId, 'BEGIN_DAY_31');
  if (day === 31) return seeded;
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'basin' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_31');
  await act(runtime, vkUserId, 'BEGIN_DAY_32');
  if (day === 32) return seeded;
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine_outpost' });
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'take_outpost' });
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'copy_map' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_32');
  await act(runtime, vkUserId, 'BEGIN_DAY_33');
  if (day === 33) return seeded;
  await fightUntil(runtime, store, player.id, vkUserId, 'miremaw');
  await act(runtime, vkUserId, 'COMPLETE_DAY_33');
  await act(runtime, vkUserId, 'BEGIN_DAY_34');
  if (day === 34) return seeded;
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine' });
  await act(runtime, vkUserId, 'WEEK5_ACT', { act: opts.pick ?? 'check' });
  if (opts.social) await act(runtime, vkUserId, 'WEEK5_ACT', { act: opts.social });
  await act(runtime, vkUserId, 'COMPLETE_DAY_34');
  await act(runtime, vkUserId, 'BEGIN_DAY_35');
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

function ironVs(enemyId: 'miremaw' | 'bezdonnik', hp = 900): { player: CombatantSnapshot; enemy: CombatantSnapshot } {
  const enemy = ENEMIES[enemyId];
  return {
    player: {
      id: 'p',
      name: 'Путник',
      hp,
      maxHp: hp,
      attack: 5,
      defense: 0,
      speed: 10,
      critChance: 5,
      critDamage: 150,
      dodge: 3,
      accuracy: 95,
      luck: 0,
      minDamage: 7,
      maxDamage: 10,
    },
    enemy: {
      id: enemy.id,
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.hp,
      attack: enemy.minDamage,
      defense: enemy.defense,
      speed: enemy.speed,
      critChance: enemy.critChance,
      critDamage: enemy.critDamage,
      dodge: enemy.dodge,
      accuracy: enemy.accuracy,
      luck: 0,
      minDamage: enemy.minDamage,
      maxDamage: enemy.maxDamage,
    },
  };
}

describe('week 5 content canon', () => {
  it('adds marsh recipes without a new tool tier and keeps week 4 recipes', () => {
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.rot_binding.cost).toEqual({ ROT_RESIN: 3, FIBER: 2, STICK: 2 });
    expect(CRAFT_RECIPES.reed_rope.cost).toEqual({ BLACK_REED: 3, FIBER: 2, STICK: 2 });
    expect(CRAFT_RECIPES.marsh_platform.cost).toEqual({ PLANK: 4, BLACK_REED: 3, IRON_INGOT: 1 });
    expect(CRAFT_RECIPES.marsh_torch).toBeUndefined();
    expect(ENEMIES.reed_lurker.name).toBe('Камышник');
    expect(ENEMIES.mire_claw.name).toBe('Топеклык');
    expect(ENEMIES.drowned_shell.name).toBe('Илистый панцирник');
    expect(ENEMIES.miremaw.name).toBe('Топежор');
    expect(ENEMIES.bezdonnik.name).toBe('Бездонник');
    expect(ENEMIES.bezdonnik.hp).toBeGreaterThan(ENEMIES.tlennik.hp);
    expect(ENEMIES.miremaw.hp).toBeGreaterThan(ENEMIES.blackroot.hp);
    expect(ENEMIES.bezdonnik.hp).toBeLessThan(ENEMIES.tlennik.hp * 1.2);
    expect(ENEMIES.bezdonnik.defense).toBe(5);
    expect(ENEMIES.miremaw.defense).toBe(5);
    expect(LOCATIONS.black_marsh_edge.name).toMatch(/топ/i);
    expect(ITEM_TEMPLATES.mire_charm.name).toBe('Оберег топи');
    expect(ITEM_TEMPLATES.seal_shard_3.questItem).toBe(true);
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'fifth_seal')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_29')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('WEEK5_ACT')).toBe(true);
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    expect(BALANCE_VERSION).toBe('0.0.13');
  });
});

describe('week 5 unlock', () => {
  it('gates BEGIN_DAY_29 on week_4_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_29');
    expect(denied.text).toMatch(/нельзя/i);
    const { runtime: rt, vkUserId: vk } = await seedWeek4Done();
    const started = await act(rt, vk, 'BEGIN_DAY_29');
    expect(started.text).toMatch(/топ|столб|камыш|свеж/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 29 pole', () => {
  it('requires inspect and a route, gather cache is once', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek4Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_29');
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_29');
    expect(early.text).toMatch(/царапин|знак|нельзя/i);
    const inspect = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'inspect' });
    expect(inspect.text).toMatch(/сделали недавно|светл|срез|сегодня/i);
    const gather = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'gather_edge' });
    expect(gather.text).toMatch(/камыш|брёвн/i);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'gather_edge' }, 'edge-once');
    const dup = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'gather_edge' }, 'edge-once');
    expect(dup.text).toMatch(/уже|склад/i);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'route_boardwalk' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_29');
    expect(done.text).toMatch(/переправ|свеж/i);
    expect((await store.getFlags(player.id)).week_5_started).toBe('1');
    expect((await store.getFlags(player.id)).week5_fresh_marks_seen).toBe('1');
    expect((await store.getFlags(player.id)).week5_route_boardwalk).toBe('1');
  });
});

describe('day 30 crossings', () => {
  it('lets logger-5 take extra loot and never job-gates', async () => {
    const { store, runtime, player, vkUserId } = await toDay(30);
    await store.acceptJobTask({ playerId: player.id, templateId: 'logger_logs' });
    const inner = store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === player.id && job.profession === 'LOGGER');
    if (row) row.level = 5;
    const menu = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'cross' });
    expect(menu.text).toMatch(/лесоруб|настил|камень|камыш/i);
    expect(menu.buttons.length).toBeLessThanOrEqual(5);
    const logBefore = (await store.getResources(player.id)).LOG ?? 0;
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'path_plank' });
    expect((await store.getFlags(player.id)).week5_path_plank).toBe('1');
    expect((await store.getFlags(player.id)).week5_path_adv).toBe('1');
    expect((await store.getResources(player.id)).LOG ?? 0).toBeGreaterThan(logBefore);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_30');
    expect(done.text).toMatch(/чаш/i);
  });

  it('mismatch still clears with a soft cost, miner and fisher routes work', async () => {
    const poor = await toDay(30);
    const energy = (await reload(poor.store, poor.player.id)).energy;
    await act(poor.runtime, poor.vkUserId, 'WEEK5_ACT', { act: 'path_stone' });
    expect((await poor.store.getFlags(poor.player.id)).week5_path_stone).toBe('1');
    expect((await poor.store.getFlags(poor.player.id)).week5_path_adv).toBeUndefined();
    expect((await reload(poor.store, poor.player.id)).energy).toBeLessThanOrEqual(energy);
    const fisher = await toDay(30);
    await fisher.store.acceptJobTask({ playerId: fisher.player.id, templateId: 'fisher_catch' });
    const inner = fisher.store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === fisher.player.id && job.profession === 'FISHER');
    if (row) row.level = 5;
    const fishBefore = (await fisher.store.getResources(fisher.player.id)).RAW_FISH ?? 0;
    await act(fisher.runtime, fisher.vkUserId, 'WEEK5_ACT', { act: 'path_reed' });
    expect((await fisher.store.getFlags(fisher.player.id)).week5_path_reed).toBe('1');
    expect((await fisher.store.getFlags(fisher.player.id)).week5_path_adv).toBe('1');
    expect((await fisher.store.getResources(fisher.player.id)).RAW_FISH ?? 0).toBeGreaterThan(fishBefore);
  });
});

describe('day 31 basin', () => {
  it('opens repeatable PvE and does not complete without visiting', async () => {
    const { runtime, vkUserId, store, player } = await toDay(31);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_31');
    expect(early.text).toMatch(/чаш|нельзя/i);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'basin' });
    expect((await store.getFlags(player.id)).visited_black_reed).toBe('1');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'reed_lurker');
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_31');
    const forage = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'forage' });
    expect(forage.text).toMatch(/еда|рыб|камыш/i);
    expect(forage.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 32 outpost', () => {
  it('examine then take loots once, skip also completes, copy is optional', async () => {
    const { store, runtime, player, vkUserId } = await toDay(32);
    const exam = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine_outpost' });
    expect(exam.text).toMatch(/схем|стрелк|метк/i);
    const take = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'take_outpost' });
    expect(take.text).toMatch(/паёк|камыш|вещи/i);
    const food = (await store.getResources(player.id)).FOOD ?? 0;
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'take_outpost' });
    expect((await store.getResources(player.id)).FOOD ?? 0).toBe(food);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'copy_map' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_32');
    expect((await store.getFlags(player.id)).week5_outpost_examined).toBe('1');
    expect((await store.getFlags(player.id)).week5_old_route_copied).toBe('1');
    const skip = await toDay(32);
    await act(skip.runtime, skip.vkUserId, 'WEEK5_ACT', { act: 'skip_outpost' });
    await act(skip.runtime, skip.vkUserId, 'COMPLETE_DAY_32');
    expect((await skip.store.getFlags(skip.player.id)).week5_outpost_skipped).toBe('1');
  });
});

describe('day 33 miremaw', () => {
  it('loss retries without wipe, heart once', async () => {
    const { store, runtime, player, vkUserId } = await toDay(33, { bow: true, shield: true });
    const table = await itemCount(store, player.id, 'crafting_table');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'miremaw', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).miremaw_failed).toBe('1');
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'miremaw');
    expect(win.text).toMatch(/Победа/i);
    expect(win.buttons.some((button) => button.label.includes('Завершить День 33'))).toBe(true);
    expect(win.buttons.length).toBeLessThanOrEqual(5);
    expect((await store.getResources(player.id)).MARSH_HEART).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'miremaw');
    expect((await store.getResources(player.id)).MARSH_HEART).toBe(1);
    await act(runtime, vkUserId, 'COMPLETE_DAY_33');
    expect((await store.getFlags(player.id)).defeated_miremaw).toBe('1');
    expect((await store.getFlags(player.id)).marsh_heart_kept).toBe('1');
  });
});

describe('day 34 moving marker', () => {
  it('requires examine then a route pick, social is optional', async () => {
    const { store, runtime, player, vkUserId } = await toDay(34, { soldToken: true, miraTrust: 0, blue: true });
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_34');
    expect(early.text).toMatch(/знак|нельзя/i);
    const exam = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine' });
    expect(exam.text).toMatch(/утрен|влево|вправо|свеж|знакомым/i);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'check' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_34');
    expect((await store.getFlags(player.id)).network_changed_during_week5).toBe('1');
    expect((await store.getFlags(player.id)).week5_check).toBe('1');
    expect((await store.getFlags(player.id)).week5_social_pass).toBeUndefined();
  });

  it('chase, old route, talk, help, pvp and clan show/hide all complete', async () => {
    const chase = await toDay(34);
    await act(chase.runtime, chase.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(chase.runtime, chase.vkUserId, 'WEEK5_ACT', { act: 'chase' });
    await act(chase.runtime, chase.vkUserId, 'COMPLETE_DAY_34');
    expect((await chase.store.getFlags(chase.player.id)).week5_chase).toBe('1');
    const old = await toDay(34);
    await act(old.runtime, old.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(old.runtime, old.vkUserId, 'WEEK5_ACT', { act: 'old_route' });
    await act(old.runtime, old.vkUserId, 'COMPLETE_DAY_34');
    expect((await old.store.getFlags(old.player.id)).week5_old_route).toBe('1');
    const talk = await toDay(34);
    await act(talk.runtime, talk.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(talk.runtime, talk.vkUserId, 'WEEK5_ACT', { act: 'check' });
    await act(talk.runtime, talk.vkUserId, 'WEEK5_ACT', { act: 'talk' });
    await act(talk.runtime, talk.vkUserId, 'COMPLETE_DAY_34');
    expect((await talk.store.getFlags(talk.player.id)).week5_social_talk).toBe('1');
    const help = await toDay(34);
    await act(help.runtime, help.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(help.runtime, help.vkUserId, 'WEEK5_ACT', { act: 'check' });
    await act(help.runtime, help.vkUserId, 'WEEK5_ACT', { act: 'help' });
    await act(help.runtime, help.vkUserId, 'COMPLETE_DAY_34');
    expect((await help.store.getFlags(help.player.id)).week5_social_help).toBe('1');
    const pvp = await toDay(34);
    await act(pvp.runtime, pvp.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(pvp.runtime, pvp.vkUserId, 'WEEK5_ACT', { act: 'check' });
    const pick = await act(pvp.runtime, pvp.vkUserId, 'WEEK5_ACT', { act: 'pvp' });
    expect(pick.text).toMatch(/стычк|спор/i);
    await act(pvp.runtime, pvp.vkUserId, 'COMPLETE_DAY_34');
    expect((await pvp.store.getFlags(pvp.player.id)).week5_social_pvp).toBe('1');
    const clan = await toDay(34);
    clan.player.coins = 400;
    await clan.store.savePlayer(clan.player);
    await clan.store.createClan({
      name: 'Топь',
      tag: 'ТПЬ',
      description: '',
      leaderPlayerId: clan.player.id,
    });
    await act(clan.runtime, clan.vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(clan.runtime, clan.vkUserId, 'WEEK5_ACT', { act: 'check' });
    const social = await act(clan.runtime, clan.vkUserId, 'WEEK5_ACT', { act: 'social' });
    expect(social.text).toMatch(/ТПЬ|клан/i);
    await act(clan.runtime, clan.vkUserId, 'WEEK5_ACT', { act: 'clan_show' });
    await act(clan.runtime, clan.vkUserId, 'WEEK5_ACT', { act: 'pass' });
    await act(clan.runtime, clan.vkUserId, 'COMPLETE_DAY_34');
    expect((await clan.store.getFlags(clan.player.id)).week5_clan_shown).toBe('1');
  });
});

describe('day 35 bezdonnik', () => {
  it('loss retries, first win grants shard/charm once, ending is Осталось: 2', async () => {
    const { store, runtime, player, vkUserId } = await toDay(35, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      miraTrust: 2,
    });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'use_heart' });
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik', { move: 'core' }, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).bezdonnik_failed).toBe('1');
    const table = await itemCount(store, player.id, 'crafting_table');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik', { move: 'core' });
    expect(win.text).toMatch(/Победа/i);
    expect(await itemCount(store, player.id, 'mire_charm')).toBe(1);
    expect(await itemCount(store, player.id, 'seal_shard_3')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_3).toBe(1);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik', { move: 'core' });
    expect(await itemCount(store, player.id, 'mire_charm')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_3).toBe(1);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_35');
    expect(end.text).toContain('Осталось: 2');
    expect(end.text).toMatch(/Пять печатей молчат/i);
    expect(end.text).not.toMatch(/День 36|BEGIN_DAY_36/i);
    const flags = await store.getFlags(player.id);
    expect(flags.week_5_complete).toBe('1');
    expect(flags.bezdonnik_defeated).toBe('1');
    expect(flags.marsh_heart_used).toBe('1');
    const again = await act(runtime, vkUserId, 'BEGIN_DAY_35');
    expect(again.text).toContain('Осталось: 2');
    expect(again.text).toMatch(/Продолжение открыто/);
    expect(again.buttons.some((row) => row.action === 'BEGIN_DAY_36')).toBe(true);
    const ach = (await store.listAchievements(player.id)).map((row) => row.achievementId);
    expect(ach).toContain('WEEK_FIVE_COMPLETE');
  });

  it('minimal melee path without bow, shield, heart, pet or lantern still wins', async () => {
    const { store, runtime, player, vkUserId } = await toDay(35, {
      lantern: false,
      pet: false,
      bow: false,
      shield: false,
      miraTrust: 0,
      soldToken: true,
    });
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik');
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_35');
    expect((await store.getFlags(player.id)).week_5_complete).toBe('1');
    expect((await store.getFlags(player.id)).marsh_heart_used).toBeUndefined();
  });
});

describe('week 5 playthroughs', () => {
  it('A. boardwalk, plank, copied map, kept then used heart, chase, prepared boss', async () => {
    const { store, runtime, player, vkUserId } = await toDay(35, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      route: 'boardwalk',
      path: 'plank',
      pick: 'chase',
    });
    expect((await store.getFlags(player.id)).week5_route_boardwalk).toBe('1');
    expect((await store.getFlags(player.id)).week5_old_route_copied).toBe('1');
    expect((await store.getFlags(player.id)).marsh_heart_kept).toBe('1');
    await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik', { move: 'core' });
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_35');
    expect(end.text).toContain('Осталось: 2');
    expect((await store.getFlags(player.id)).week_4_complete).toBe('1');
    expect((await store.getFlags(player.id)).week_3_complete).toBe('1');
  });

  it('B. islands, stone, skip outpost, talk, no heart spend', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek4Done({ soldToken: true, miraTrust: 0 });
    await act(runtime, vkUserId, 'BEGIN_DAY_29');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'route_islands' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_29');
    await act(runtime, vkUserId, 'BEGIN_DAY_30');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'path_stone' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_30');
    await act(runtime, vkUserId, 'BEGIN_DAY_31');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'basin' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_31');
    await act(runtime, vkUserId, 'BEGIN_DAY_32');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'skip_outpost' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_32');
    await act(runtime, vkUserId, 'BEGIN_DAY_33');
    await fightUntil(runtime, store, player.id, vkUserId, 'miremaw');
    await act(runtime, vkUserId, 'COMPLETE_DAY_33');
    await act(runtime, vkUserId, 'BEGIN_DAY_34');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'check' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'talk' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_34');
    await act(runtime, vkUserId, 'BEGIN_DAY_35');
    await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_35');
    const flags = await store.getFlags(player.id);
    expect(flags.week5_route_islands).toBe('1');
    expect(flags.week5_path_stone).toBe('1');
    expect(flags.week5_outpost_skipped).toBe('1');
    expect(flags.week5_social_talk).toBe('1');
    expect(flags.marsh_heart_used).toBeUndefined();
    expect(flags.week_5_complete).toBe('1');
  });

  it('C. reed, reed path, leave supplies, pvp, hide clan', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek4Done();
    player.coins = 400;
    await store.savePlayer(player);
    await store.createClan({ name: 'Топь', tag: 'ТПЬ', description: '', leaderPlayerId: player.id });
    await act(runtime, vkUserId, 'BEGIN_DAY_29');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'route_reed' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_29');
    await act(runtime, vkUserId, 'BEGIN_DAY_30');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'path_reed' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_30');
    await act(runtime, vkUserId, 'BEGIN_DAY_31');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'basin' });
    await fightUntil(runtime, store, player.id, vkUserId, 'drowned_shell');
    await act(runtime, vkUserId, 'COMPLETE_DAY_31');
    await act(runtime, vkUserId, 'BEGIN_DAY_32');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine_outpost' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'leave_outpost' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_32');
    await act(runtime, vkUserId, 'BEGIN_DAY_33');
    await fightUntil(runtime, store, player.id, vkUserId, 'miremaw');
    await act(runtime, vkUserId, 'COMPLETE_DAY_33');
    await act(runtime, vkUserId, 'BEGIN_DAY_34');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'examine' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'old_route' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'clan_hide' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'pvp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_34');
    await act(runtime, vkUserId, 'BEGIN_DAY_35');
    await fightUntil(runtime, store, player.id, vkUserId, 'bezdonnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_35');
    const flags = await store.getFlags(player.id);
    expect(flags.week5_route_reed).toBe('1');
    expect(flags.week5_path_reed).toBe('1');
    expect(flags.week5_outpost_left).toBe('1');
    expect(flags.week5_social_pvp).toBe('1');
    expect(flags.week5_clan_hidden).toBe('1');
    expect(flags.week_5_complete).toBe('1');
  });
});

describe('week 5 systems', () => {
  it('progresses existing jobs from real gather/PvE once and ignores production collect', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek4Done();
    await acceptJobContract(store, player.id, 'logger_logs', new Date());
    await acceptJobContract(store, player.id, 'hunter_pve', new Date());
    await act(runtime, vkUserId, 'BEGIN_DAY_29');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'gather_edge' });
    const logger = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(logger?.progress).toBe(3);
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'route_boardwalk' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_29');
    await act(runtime, vkUserId, 'BEGIN_DAY_30');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'path_plank' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_30');
    await act(runtime, vkUserId, 'BEGIN_DAY_31');
    await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'basin' });
    await fightUntil(runtime, store, player.id, vkUserId, 'mire_claw');
    const hunter = await store.getAcceptedJobTask(player.id, 'HUNTER');
    expect(hunter?.progress).toBe(1);
    player.coins = 10_000;
    await store.savePlayer(player);
    await store.addResource(player.id, 'LOG', 80);
    await store.addResource(player.id, 'PLANK', 80);
    await store.addResource(player.id, 'COBBLESTONE', 80);
    await store.addResource(player.id, 'IRON_INGOT', 20);
    await store.buildProductionBuilding({ playerId: player.id, buildingType: 'SAWMILL' });
    const inner = store as unknown as {
      state: { productionBuildings: Array<{ storedPrimary: number; lastCalculatedAt: Date }> };
    };
    inner.state.productionBuildings[0]!.storedPrimary = 6;
    const before = (await store.getAcceptedJobTask(player.id, 'LOGGER'))?.progress ?? 0;
    await store.collectProductionBuilding({ playerId: player.id, buildingType: 'SAWMILL' });
    const after = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(after?.progress).toBe(before);
  });

  it('lets Week5 reed list on the existing market and blocks heart/shard', async () => {
    expect(isTradeableAsset('RESOURCE', 'BLACK_REED')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'MARSH_HEART')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_3')).toBe(false);
    expect(TRADEABLE_RESOURCES).toContain('BLACK_REED');
    const { store, player } = await seedWeek4Done();
    await store.addResource(player.id, 'BLACK_REED', 4);
    await store.addResource(player.id, 'MARSH_HEART', 1);
    await store.addResource(player.id, 'SEAL_SHARD_3', 1);
    const listing = await createFixedListing(store, {
      sellerPlayerId: player.id,
      assetRef: 'BLACK_REED',
      quantity: 2,
      unitPrice: 5,
    });
    expect(listing.assetRef).toBe('BLACK_REED');
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'MARSH_HEART',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'SEAL_SHARD_3',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });

  it('keeps the hero hub and does not start day 36 or mention payments', async () => {
    const { runtime, vkUserId } = await seedWeek4Done();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.map((row) => row.label)).toEqual(['👤 Профиль', '⚔ PvP', '🛒 Рынок', '🏕 Клан', '⬅ Назад']);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_29');
    expect(started.text).not.toMatch(/donat|premium|mini app|minecraft/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
    expect(camp.buttons.some((row) => row.label.includes('Топь'))).toBe(true);
  });

  it('rejects forged loot, early bosses and week5 acts before week 4', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    const early = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'edge' });
    expect(early.text).toMatch(/нельзя|закрыта/i);
    const boss = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'bezdonnik', hp: 1 });
    expect(boss.text).toMatch(/нельзя/i);
    await store.setFlag(player.id, 'week_4_complete', '1');
    const forged = await act(runtime, vkUserId, 'WEEK5_ACT', { act: 'grant_all', MARSH_HEART: 99 });
    expect((await store.getResources(player.id)).MARSH_HEART ?? 0).toBe(0);
    expect(forged.buttons.length).toBeLessThanOrEqual(5);
  });

  it('lists week 5 content without leaking English ids in player labels', () => {
    expect(RESOURCE_TYPES).toEqual(expect.arrayContaining(['BLACK_REED', 'MARSH_HEART', 'SEAL_SHARD_3']));
    expect(resourceLabel('BLACK_REED')).toMatch(/камыш/i);
    expect(resourceLabel('MARSH_HEART')).toMatch(/сердц/i);
    expect(resourceLabel('SEAL_SHARD_3')).toMatch(/печат/i);
    expect(STORY_FLAGS).toEqual(
      expect.arrayContaining([
        'week_5_complete',
        'network_changed_during_week5',
        'defeated_miremaw',
        'bezdonnik_defeated',
      ]),
    );
    expect(BOSS_IDS).toEqual(expect.arrayContaining(['miremaw', 'bezdonnik', 'tlennik']));
    expect(ACHIEVEMENTS.WEEK_FIVE_COMPLETE.id).toBe('WEEK_FIVE_COMPLETE');
    expect(WEEK5_COMMANDS).toHaveLength(15);
    expect(WEEK5_ENEMIES.every(isWeek5Enemy)).toBe(true);
    expect(isWeek5Location('seal_3_vault')).toBe(true);
    expect(isWeek5Location('ashen_wedge')).toBe(false);
    expect(COMBAT_LOOT.bezdonnik.firstItems).toEqual(['mire_charm', 'seal_shard_3']);
    expect(ITEM_TEMPLATES.reed_rope.name).toMatch(/связк/i);
  });
});

describe('week 5 combat modifiers', () => {
  it('gives optional bonuses without requiring any of them', () => {
    const bare = week5Modifiers(modsCtx(), 'bezdonnik');
    expect(bare.playerOpeningHits).toBe(0);
    const loaded = week5Modifiers(
      modsCtx(
        {
          lantern_repaired: '1',
          scavenger_bonded: '1',
          marsh_heart_used: '1',
          marsh_platform_used: '1',
          network_changed_during_week5: '1',
          week5_old_route_copied: '1',
          mira_trust: '2',
        },
        ['bow', 'shield', 'iron_sword', 'marsh_platform', 'mire_charm'],
      ),
      'bezdonnik',
      {},
      { LOGGER: 10, MINER: 10, HUNTER: 10, FISHER: 10, CRAFTER: 10 },
    );
    expect(loaded.playerOpeningHits).toBe(1);
    expect(loaded.note).toMatch(/лук|щит|фонарь|питомец|сердц/i);
    expect((loaded.enemy.hp ?? 0) < 0 || (loaded.enemy.defense ?? 0) <= 0).toBe(true);
  });

  it('canonical iron sword vs miremaw and bezdonnik is not a guaranteed DRAW', () => {
    for (const id of ['miremaw', 'bezdonnik'] as const) {
      const tallies = { WIN: 0, LOSS: 0, DRAW: 0 };
      for (let seed = 1; seed <= 40; seed += 1) {
        const { player, enemy } = ironVs(id, 900);
        const result = simulateBattle({ player, enemy, seed, balanceVersion: BALANCE_VERSION });
        tallies[result.result] += 1;
      }
      expect(tallies.DRAW).toBeLessThan(tallies.WIN);
      expect(tallies.WIN).toBeGreaterThan(30);
      expect(ENEMIES[id].hp).toBeLessThanOrEqual(64 * 4);
      expect(ENEMIES[id].defense).toBe(5);
    }
  });
});
