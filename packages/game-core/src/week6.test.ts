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
  WEEK6_NODES,
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
  isWeek6Enemy,
  isWeek6Location,
  week6Modifiers,
  WEEK6_COMMANDS,
  WEEK6_ENEMIES,
} from './week6';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week6',
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

interface SeedOpts {
  lantern?: boolean;
  pet?: boolean;
  soldToken?: boolean;
  miraTrust?: number;
  bow?: boolean;
  shield?: boolean;
  blue?: boolean;
}

async function seedWeek5Done(opts: SeedOpts = {}) {
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
    'day_29_complete',
    'day_30_complete',
    'day_31_complete',
    'day_32_complete',
    'day_33_complete',
    'day_34_complete',
    'day_35_complete',
    'week_5_complete',
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
    'seen_two_seals',
    'tlennik_defeated',
    'defeated_blackroot',
    'warped_network_seen',
    'network_changed_during_week5',
    'week5_distant_watcher_seen',
    'bezdonnik_defeated',
    'defeated_miremaw',
    'player_camp_founded',
    'camp_table_placed',
    'camp_fire_built',
    'camp_lit',
    'chose_iron_sword',
    'yara_claim_seen',
    'has_path_charm',
    'has_mire_charm',
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
  player.level = 15;
  player.xp = 1700;
  player.maxHp = 190;
  player.hp = 190;
  player.maxEnergy = 46;
  player.energy = 46;
  player.coins = 220;
  player.currentLocation = 'player_camp';
  player.currentState = 'week5_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'iron_sword', rarity: 'UNCOMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_hoe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'bucket', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'root_charm', rarity: 'RARE' });
  await store.createItem({ playerId: player.id, templateId: 'path_charm', rarity: 'RARE' });
  await store.createItem({ playerId: player.id, templateId: 'mire_charm', rarity: 'RARE' });
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
  await store.addResource(player.id, 'GEAR_SCRAP', 4);
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
  kind: 'yard' | 'platform' | 'cart' = 'yard',
) {
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'inspect' });
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: `route_${kind}` });
}

async function toDay(
  day: number,
  opts: SeedOpts & {
    route?: 'yard' | 'platform' | 'cart';
    path?: 'clear' | 'weight' | 'catwalk';
    social?: 'help' | 'talk' | 'pass' | 'pvp';
    pick?: 'chase' | 'check_mech' | 'call_npc';
    switchAct?: 'restore_switch' | 'leave_switch';
  } = {},
) {
  const seeded = await seedWeek5Done(opts);
  const { runtime, vkUserId, store, player } = seeded;
  await act(runtime, vkUserId, 'BEGIN_DAY_36');
  if (day === 36) return seeded;
  await pickRoute(runtime, vkUserId, opts.route ?? 'yard');
  await act(runtime, vkUserId, 'COMPLETE_DAY_36');
  await act(runtime, vkUserId, 'BEGIN_DAY_37');
  if (day === 37) return seeded;
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: `path_${opts.path ?? 'clear'}` });
  await act(runtime, vkUserId, 'COMPLETE_DAY_37');
  await act(runtime, vkUserId, 'BEGIN_DAY_38');
  if (day === 38) return seeded;
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gallery' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_38');
  await act(runtime, vkUserId, 'BEGIN_DAY_39');
  if (day === 39) return seeded;
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'examine_switch' });
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: opts.switchAct ?? 'restore_switch' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_39');
  await act(runtime, vkUserId, 'BEGIN_DAY_40');
  if (day === 40) return seeded;
  await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik');
  await act(runtime, vkUserId, 'COMPLETE_DAY_40');
  await act(runtime, vkUserId, 'BEGIN_DAY_41');
  if (day === 41) return seeded;
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'speak' });
  await act(runtime, vkUserId, 'WEEK6_ACT', { act: opts.pick ?? 'check_mech' });
  if (opts.social) await act(runtime, vkUserId, 'WEEK6_ACT', { act: opts.social });
  await act(runtime, vkUserId, 'COMPLETE_DAY_41');
  await act(runtime, vkUserId, 'BEGIN_DAY_42');
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

function ironVs(enemyId: 'skrezhetnik' | 'zatvornik', hp = 900): { player: CombatantSnapshot; enemy: CombatantSnapshot } {
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

describe('week 6 content canon', () => {
  it('adds station recipes without a new tool tier and keeps week 5 recipes', () => {
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.reed_rope.cost).toEqual({ BLACK_REED: 3, FIBER: 2, STICK: 2 });
    expect(CRAFT_RECIPES.haul_line.cost).toEqual({ FIBER: 3, STICK: 2, GEAR_SCRAP: 2 });
    expect(CRAFT_RECIPES.mechanical_brace.cost).toEqual({ GEAR_SCRAP: 3, PLANK: 3, IRON_INGOT: 1 });
    expect(CRAFT_RECIPES.station_factory).toBeUndefined();
    expect(ENEMIES.rail_scuttler.name).toBe('Шпальник');
    expect(ENEMIES.dust_hound.name).toBe('Пыльник');
    expect(ENEMIES.ironback_brute.name).toBe('Железоспин');
    expect(ENEMIES.skrezhetnik.name).toBe('Скрежетник');
    expect(ENEMIES.zatvornik.name).toBe('Затворник');
    expect(ENEMIES.zatvornik.hp).toBeGreaterThan(ENEMIES.bezdonnik.hp);
    expect(ENEMIES.skrezhetnik.hp).toBeGreaterThan(ENEMIES.miremaw.hp);
    expect(ENEMIES.zatvornik.hp).toBeLessThan(ENEMIES.bezdonnik.hp * 1.2);
    expect(ENEMIES.zatvornik.defense).toBe(5);
    expect(ENEMIES.skrezhetnik.defense).toBe(5);
    expect(LOCATIONS.abandoned_station_edge.name).toMatch(/стан/i);
    expect(ITEM_TEMPLATES.lock_charm.name).toBe('Оберег затвора');
    expect(ITEM_TEMPLATES.seal_shard_2.questItem).toBe(true);
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'sixth_seal')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_36')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('WEEK6_ACT')).toBe(true);
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    expect(BALANCE_VERSION).toBe('0.0.13');
    expect(ENEMIES.unknown_contact).toBeUndefined();
    expect(ENEMIES.watcher).toBeUndefined();
  });
});

describe('week 6 unlock', () => {
  it('gates BEGIN_DAY_36 on week_5_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_36');
    expect(denied.text).toMatch(/нельзя/i);
    const { runtime: rt, vkUserId: vk } = await seedWeek5Done();
    const started = await act(rt, vk, 'BEGIN_DAY_36');
    expect(started.text).toMatch(/стан|рычаг|стружк|платформ/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 36 yard', () => {
  it('requires inspect and a route, gather cache is once', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek5Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_36');
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_36');
    expect(early.text).toMatch(/след|нельзя/i);
    const inspect = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'inspect' });
    expect(inspect.text).toMatch(/недавно|стружк|рычаг|ящик/i);
    expect((await store.getFlags(player.id)).week6_recent_presence).toBe('1');
    const first = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gather_edge' });
    expect(first.text).toMatch(/лом|шестер/i);
    const scrap = (await store.getResources(player.id)).GEAR_SCRAP ?? 0;
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gather_edge' });
    expect((await store.getResources(player.id)).GEAR_SCRAP ?? 0).toBe(scrap + 1);
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'route_yard' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_36');
    expect(done.text).toMatch(/сортиров/i);
  });
});

describe('day 37 sorting', () => {
  it('lets logger-5 take extra loot and never job-gates', async () => {
    const { store, runtime, player, vkUserId } = await toDay(37);
    await store.acceptJobTask({ playerId: player.id, templateId: 'logger_logs' });
    const inner = store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === player.id && job.profession === 'LOGGER');
    if (row) row.level = 5;
    const menu = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'sort' });
    expect(menu.text).toMatch(/завал|противовес|мостк/i);
    expect(menu.buttons.length).toBeLessThanOrEqual(5);
    const logBefore = (await store.getResources(player.id)).LOG ?? 0;
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'path_clear' });
    expect((await store.getFlags(player.id)).week6_path_clear).toBe('1');
    expect((await store.getFlags(player.id)).week6_path_adv).toBe('1');
    expect((await store.getResources(player.id)).LOG ?? 0).toBeGreaterThan(logBefore);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_37');
    expect(done.text).toMatch(/галере/i);
  });

  it('mismatch still clears with a soft cost, crafter and hunter routes work', async () => {
    const poor = await toDay(37);
    const energy = (await reload(poor.store, poor.player.id)).energy;
    await act(poor.runtime, poor.vkUserId, 'WEEK6_ACT', { act: 'path_weight' });
    expect((await poor.store.getFlags(poor.player.id)).week6_path_weight).toBe('1');
    expect((await poor.store.getFlags(poor.player.id)).week6_path_adv).toBeUndefined();
    expect((await reload(poor.store, poor.player.id)).energy).toBeLessThanOrEqual(energy);
    const hunter = await toDay(37);
    await hunter.store.acceptJobTask({ playerId: hunter.player.id, templateId: 'hunter_pve' });
    const inner = hunter.store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === hunter.player.id && job.profession === 'HUNTER');
    if (row) row.level = 5;
    const hideBefore = (await hunter.store.getResources(hunter.player.id)).HIDE ?? 0;
    await act(hunter.runtime, hunter.vkUserId, 'WEEK6_ACT', { act: 'path_catwalk' });
    expect((await hunter.store.getFlags(hunter.player.id)).week6_path_catwalk).toBe('1');
    expect((await hunter.store.getFlags(hunter.player.id)).week6_path_adv).toBe('1');
    expect((await hunter.store.getResources(hunter.player.id)).HIDE ?? 0).toBeGreaterThan(hideBefore);
  });
});

describe('day 38 gallery', () => {
  it('opens repeatable PvE and does not complete without visiting', async () => {
    const { runtime, vkUserId, store, player } = await toDay(38);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_38');
    expect(early.text).toMatch(/галере|нельзя/i);
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gallery' });
    expect((await store.getFlags(player.id)).visited_lower_gallery).toBe('1');
    const fight = await fightUntil(runtime, store, player.id, vkUserId, 'rail_scuttler');
    expect(fight.text).toMatch(/Победа|Шпальник/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_38');
    expect(done.text).toMatch(/рычаг|переключ/i);
  });
});

describe('day 39 switch', () => {
  it('examine then restore or leave both complete, restore is optional', async () => {
    const { store, runtime, player, vkUserId } = await toDay(39);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_39');
    expect(early.text).toMatch(/механизм|нельзя/i);
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'examine_switch' });
    expect((await store.getFlags(player.id)).week6_mechanism_examined).toBe('1');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'leave_switch' });
    expect((await store.getFlags(player.id)).week6_switch_left).toBe('1');
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_39');
    expect(done.text).toMatch(/скрежет/i);
    const other = await toDay(39);
    await act(other.runtime, other.vkUserId, 'WEEK6_ACT', { act: 'examine_switch' });
    await act(other.runtime, other.vkUserId, 'WEEK6_ACT', { act: 'restore_switch' });
    expect((await other.store.getFlags(other.player.id)).week6_switch_restored).toBe('1');
  });
});

describe('day 40 skrezhetnik', () => {
  it('loss retries without wipe, core once', async () => {
    const { store, runtime, player, vkUserId } = await toDay(40);
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik', {}, 'LOSS');
    expect(loss.text).toMatch(/себя|ещё/i);
    expect((await store.listItems(player.id)).length).toBeGreaterThan(3);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).STATION_CORE).toBe(1);
    expect((await store.getFlags(player.id)).defeated_skrezhetnik).toBe('1');
    await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik');
    expect((await store.getResources(player.id)).STATION_CORE).toBe(1);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_40');
    expect(done.text).toMatch(/мост/i);
  });
});

describe('day 41 direct contact', () => {
  it('requires speak then a route pick, social is optional, identity stays hidden', async () => {
    const { store, runtime, player, vkUserId } = await toDay(41, { blue: true });
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_41');
    expect(early.text).toMatch(/мост|нельзя/i);
    const speak = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'speak' });
    expect(speak.text).toMatch(/спасаешь сеть/i);
    expect(speak.text).toMatch(/Поздний вопрос/i);
    expect(speak.text).not.toMatch(/я злодей|уничтожу мир|создатель сети|вензель|узел 7/i);
    expect(speak.text).toMatch(/знакомым|доказательств нет/i);
    expect((await store.getFlags(player.id)).week6_direct_contact).toBe('1');
    expect(Object.keys(ENEMIES)).not.toContain('unknown');
    expect(WEEK6_NODES.day41_start.text).not.toMatch(/имя его|он — /i);
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'chase' });
    expect((await store.getFlags(player.id)).week6_unknown_chased).toBe('1');
    expect((await store.getFlags(player.id)).week6_marked_fastener).toBe('1');
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_41');
    expect(done.text).toMatch(/печат/i);
  });

  it('chase, mechanism, npc, talk, help, pvp and clan show/hide all complete', async () => {
    const mech = await toDay(41);
    await act(mech.runtime, mech.vkUserId, 'WEEK6_ACT', { act: 'speak' });
    await act(mech.runtime, mech.vkUserId, 'WEEK6_ACT', { act: 'check_mech' });
    expect((await mech.store.getFlags(mech.player.id)).week6_unknown_mechanism).toBe('1');
    await act(mech.runtime, mech.vkUserId, 'COMPLETE_DAY_41');
    const npc = await toDay(41);
    await act(npc.runtime, npc.vkUserId, 'WEEK6_ACT', { act: 'speak' });
    const call = await act(npc.runtime, npc.vkUserId, 'WEEK6_ACT', { act: 'call_npc' });
    expect(call.text).toMatch(/Рем|Мира/i);
    expect((await npc.store.getFlags(npc.player.id)).week6_unknown_npc).toBe('1');
    await act(npc.runtime, npc.vkUserId, 'COMPLETE_DAY_41');
    const social = await toDay(41);
    social.player.coins = 400;
    await social.store.savePlayer(social.player);
    await social.store.createClan({ name: 'Пост', tag: 'ПСТ', description: '', leaderPlayerId: social.player.id });
    await act(social.runtime, social.vkUserId, 'WEEK6_ACT', { act: 'speak' });
    await act(social.runtime, social.vkUserId, 'WEEK6_ACT', { act: 'check_mech' });
    await act(social.runtime, social.vkUserId, 'WEEK6_ACT', { act: 'clan_hide' });
    await act(social.runtime, social.vkUserId, 'WEEK6_ACT', { act: 'pvp' });
    expect((await social.store.getFlags(social.player.id)).week6_social_pvp).toBe('1');
    expect((await social.store.getFlags(social.player.id)).week6_clan_hidden).toBe('1');
    await act(social.runtime, social.vkUserId, 'COMPLETE_DAY_41');
  });
});

describe('day 42 zatvornik', () => {
  it('loss retries, first win grants shard/charm once, ending is Осталось: 1', async () => {
    const { store, runtime, player, vkUserId } = await toDay(42);
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik', {}, 'LOSS');
    expect(loss.text).toMatch(/себя|ещё/i);
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'iron_sword')).toBe(true);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).SEAL_SHARD_2).toBe(1);
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'lock_charm')).toBe(true);
    expect((await store.getFlags(player.id)).zatvornik_defeated).toBe('1');
    const coins = (await reload(store, player.id)).coins;
    await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik');
    expect((await store.getResources(player.id)).SEAL_SHARD_2).toBe(1);
    expect((await reload(store, player.id)).coins).toBe(coins);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    expect(end.text).toContain('Осталось: 1');
    expect(end.text).toMatch(/Шесть печатей молчат/i);
    expect(end.text).toMatch(/спасаешь сеть/i);
    expect(end.text).not.toMatch(/День 43|BEGIN_DAY_43/i);
    expect((await store.getFlags(player.id)).week_6_complete).toBe('1');
    const again = await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    expect(again.text).toContain('Осталось: 1');
  });

  it('minimal melee path without bow, shield, core, pet or lantern still wins', async () => {
    const { store, runtime, player, vkUserId } = await toDay(42, { miraTrust: 0, soldToken: true });
    expect((await store.getFlags(player.id)).has_bow).toBeUndefined();
    expect((await store.getFlags(player.id)).lantern_repaired).toBeUndefined();
    await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik');
    expect((await store.getFlags(player.id)).zatvornik_defeated).toBe('1');
    await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    expect((await store.getFlags(player.id)).week_6_complete).toBe('1');
  });
});

describe('week 6 playthroughs', () => {
  it('A. yard, clear, restored switch, used core, chase, prepared boss', async () => {
    const { store, runtime, player, vkUserId } = await toDay(42, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      route: 'yard',
      path: 'clear',
      pick: 'chase',
      switchAct: 'restore_switch',
    });
    expect((await store.getFlags(player.id)).week6_route_yard).toBe('1');
    expect((await store.getFlags(player.id)).week6_switch_restored).toBe('1');
    expect((await store.getFlags(player.id)).station_core_kept).toBe('1');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'use_core' });
    await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik', { move: 'core' });
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    expect(end.text).toContain('Осталось: 1');
    expect((await store.getFlags(player.id)).week_5_complete).toBe('1');
    expect((await store.getFlags(player.id)).station_core_used).toBe('1');
  });

  it('B. platform, weight, leave switch, talk, no core spend', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek5Done({ soldToken: true, miraTrust: 0 });
    await act(runtime, vkUserId, 'BEGIN_DAY_36');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'route_platform' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_36');
    await act(runtime, vkUserId, 'BEGIN_DAY_37');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'path_weight' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_37');
    await act(runtime, vkUserId, 'BEGIN_DAY_38');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gallery' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_38');
    await act(runtime, vkUserId, 'BEGIN_DAY_39');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'examine_switch' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'leave_switch' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_39');
    await act(runtime, vkUserId, 'BEGIN_DAY_40');
    await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_40');
    await act(runtime, vkUserId, 'BEGIN_DAY_41');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'speak' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'call_npc' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'talk' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_41');
    await act(runtime, vkUserId, 'BEGIN_DAY_42');
    await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    const flags = await store.getFlags(player.id);
    expect(flags.week6_route_platform).toBe('1');
    expect(flags.week6_path_weight).toBe('1');
    expect(flags.week6_switch_left).toBe('1');
    expect(flags.week6_social_talk).toBe('1');
    expect(flags.station_core_used).toBeUndefined();
    expect(flags.week_6_complete).toBe('1');
  });

  it('C. cart, catwalk, restore, pvp, hide clan', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek5Done();
    player.coins = 400;
    await store.savePlayer(player);
    await store.createClan({ name: 'Пост', tag: 'ПСТ', description: '', leaderPlayerId: player.id });
    await act(runtime, vkUserId, 'BEGIN_DAY_36');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'route_cart' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_36');
    await act(runtime, vkUserId, 'BEGIN_DAY_37');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'path_catwalk' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_37');
    await act(runtime, vkUserId, 'BEGIN_DAY_38');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gallery' });
    await fightUntil(runtime, store, player.id, vkUserId, 'ironback_brute');
    await act(runtime, vkUserId, 'COMPLETE_DAY_38');
    await act(runtime, vkUserId, 'BEGIN_DAY_39');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'examine_switch' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'restore_switch' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_39');
    await act(runtime, vkUserId, 'BEGIN_DAY_40');
    await fightUntil(runtime, store, player.id, vkUserId, 'skrezhetnik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_40');
    await act(runtime, vkUserId, 'BEGIN_DAY_41');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'speak' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'chase' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'clan_hide' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'pvp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_41');
    await act(runtime, vkUserId, 'BEGIN_DAY_42');
    await fightUntil(runtime, store, player.id, vkUserId, 'zatvornik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_42');
    const flags = await store.getFlags(player.id);
    expect(flags.week6_route_cart).toBe('1');
    expect(flags.week6_path_catwalk).toBe('1');
    expect(flags.week6_social_pvp).toBe('1');
    expect(flags.week6_clan_hidden).toBe('1');
    expect(flags.week_6_complete).toBe('1');
  });
});

describe('week 6 systems', () => {
  it('progresses existing jobs from real gather/PvE once and ignores production collect', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek5Done();
    await acceptJobContract(store, player.id, 'logger_logs', new Date());
    await acceptJobContract(store, player.id, 'hunter_pve', new Date());
    await act(runtime, vkUserId, 'BEGIN_DAY_36');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gather_edge' });
    const logger = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(logger?.progress).toBe(3);
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'route_yard' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_36');
    await act(runtime, vkUserId, 'BEGIN_DAY_37');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'path_clear' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_37');
    await act(runtime, vkUserId, 'BEGIN_DAY_38');
    await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'gallery' });
    await fightUntil(runtime, store, player.id, vkUserId, 'dust_hound');
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

  it('lets Week6 scrap list on the existing market and blocks core/shard', async () => {
    expect(isTradeableAsset('RESOURCE', 'GEAR_SCRAP')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'STATION_CORE')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_2')).toBe(false);
    expect(TRADEABLE_RESOURCES).toContain('GEAR_SCRAP');
    const { store, player } = await seedWeek5Done();
    await store.addResource(player.id, 'GEAR_SCRAP', 4);
    await store.addResource(player.id, 'STATION_CORE', 1);
    await store.addResource(player.id, 'SEAL_SHARD_2', 1);
    const listing = await createFixedListing(store, {
      sellerPlayerId: player.id,
      assetRef: 'GEAR_SCRAP',
      quantity: 2,
      unitPrice: 5,
    });
    expect(listing.assetRef).toBe('GEAR_SCRAP');
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'STATION_CORE',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'SEAL_SHARD_2',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });

  it('keeps the hero hub and does not start day 43 or mention payments', async () => {
    const { runtime, vkUserId } = await seedWeek5Done();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.map((row) => row.label)).toEqual(['👤 Профиль', '⚔ PvP', '🛒 Рынок', '🏕 Клан', '⬅ Назад']);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_36');
    expect(started.text).not.toMatch(/donat|premium|mini app|minecraft/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
    expect(camp.buttons.some((row) => row.label.includes('Пост'))).toBe(true);
  });

  it('rejects forged loot, early bosses and week6 acts before week 5', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    const early = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'edge' });
    expect(early.text).toMatch(/нельзя|закрыт/i);
    const boss = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'zatvornik', hp: 1 });
    expect(boss.text).toMatch(/нельзя/i);
    await store.setFlag(player.id, 'week_5_complete', '1');
    const forged = await act(runtime, vkUserId, 'WEEK6_ACT', { act: 'grant_all', STATION_CORE: 99 });
    expect((await store.getResources(player.id)).STATION_CORE ?? 0).toBe(0);
    expect(forged.buttons.length).toBeLessThanOrEqual(5);
  });

  it('lists week 6 content without leaking English ids in player labels', () => {
    expect(RESOURCE_TYPES).toEqual(expect.arrayContaining(['GEAR_SCRAP', 'STATION_CORE', 'SEAL_SHARD_2']));
    expect(resourceLabel('GEAR_SCRAP')).toMatch(/лом/i);
    expect(resourceLabel('STATION_CORE')).toMatch(/сердечник/i);
    expect(resourceLabel('SEAL_SHARD_2')).toMatch(/печат/i);
    expect(STORY_FLAGS).toEqual(
      expect.arrayContaining([
        'week_6_complete',
        'week6_direct_contact',
        'defeated_skrezhetnik',
        'zatvornik_defeated',
      ]),
    );
    expect(BOSS_IDS).toEqual(expect.arrayContaining(['skrezhetnik', 'zatvornik', 'bezdonnik']));
    expect(ACHIEVEMENTS.WEEK_SIX_COMPLETE.id).toBe('WEEK_SIX_COMPLETE');
    expect(WEEK6_COMMANDS).toHaveLength(15);
    expect(WEEK6_ENEMIES.every(isWeek6Enemy)).toBe(true);
    expect(isWeek6Location('seal_2_chamber')).toBe(true);
    expect(isWeek6Location('ashen_wedge')).toBe(false);
    expect(COMBAT_LOOT.zatvornik.firstItems).toEqual(['lock_charm', 'seal_shard_2']);
    expect(ITEM_TEMPLATES.haul_line.name).toMatch(/канат/i);
  });
});

describe('week 6 combat modifiers', () => {
  it('gives optional bonuses without requiring any of them', () => {
    const bare = week6Modifiers(modsCtx(), 'zatvornik');
    expect(bare.playerOpeningHits).toBe(0);
    const loaded = week6Modifiers(
      modsCtx(
        {
          lantern_repaired: '1',
          scavenger_bonded: '1',
          station_core_used: '1',
          mechanical_brace_used: '1',
          week6_direct_contact: '1',
          week6_switch_restored: '1',
          mira_trust: '2',
        },
        ['bow', 'shield', 'iron_sword', 'mechanical_brace', 'lock_charm'],
      ),
      'zatvornik',
      {},
      { LOGGER: 10, MINER: 10, HUNTER: 10, CRAFTER: 10 },
    );
    expect(loaded.playerOpeningHits).toBe(1);
    expect(loaded.note).toMatch(/лук|щит|фонарь|питомец|сердечник/i);
    expect((loaded.enemy.hp ?? 0) < 0 || (loaded.enemy.defense ?? 0) <= 0).toBe(true);
  });

  it('canonical iron sword vs skrezhetnik and zatvornik is not a guaranteed DRAW', () => {
    for (const id of ['skrezhetnik', 'zatvornik'] as const) {
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
