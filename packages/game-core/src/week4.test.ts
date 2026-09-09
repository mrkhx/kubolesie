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
  isWeek4Enemy,
  isWeek4Location,
  week4Modifiers,
  WEEK4_COMMANDS,
  WEEK4_ENEMIES,
} from './week4';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week4',
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
}

async function seedWeek3Done(opts: SeedOpts = {}) {
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
    'player_camp_founded',
    'camp_table_placed',
    'camp_fire_built',
    'camp_lit',
    'chose_iron_sword',
    'yara_claim_seen',
  ];
  if (opts.soldToken) flags.push('sold_rusty_token');
  else flags.push('showed_token_to_rem', 'rem_revealed_hinge');
  if (opts.lantern) flags.push('lantern_repaired', 'found_broken_lantern');
  if (opts.pet) flags.push('scavenger_bonded', 'fed_stone_scavenger');
  if (opts.bow) flags.push('has_bow', 'first_bow');
  if (opts.shield) flags.push('has_shield');
  for (const flag of flags) await store.setFlag(player.id, flag, '1');
  if (opts.miraTrust != null) await store.setFlag(player.id, 'mira_trust', String(opts.miraTrust));
  else await store.setFlag(player.id, 'mira_trust', '2');
  player.level = 12;
  player.xp = 1200;
  player.maxHp = 170;
  player.hp = 170;
  player.maxEnergy = 42;
  player.energy = 42;
  player.coins = 180;
  player.currentLocation = 'player_camp';
  player.currentState = 'week3_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'iron_sword', rarity: 'UNCOMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_hoe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'bucket', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'root_charm', rarity: 'RARE' });
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
  kind: 'old' | 'fresh' | 'trees' = 'old',
) {
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'inspect' });
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: `route_${kind}` });
}

async function toDay(
  day: number,
  opts: SeedOpts & { route?: 'old' | 'fresh' | 'trees'; path?: 'beast' | 'ravine' | 'plank'; social?: 'help' | 'talk' | 'pass' | 'pvp' } = {},
) {
  const seeded = await seedWeek3Done(opts);
  const { runtime, vkUserId, store, player } = seeded;
  await act(runtime, vkUserId, 'BEGIN_DAY_22');
  if (day === 22) return seeded;
  await pickRoute(runtime, vkUserId, opts.route ?? 'old');
  await act(runtime, vkUserId, 'COMPLETE_DAY_22');
  await act(runtime, vkUserId, 'BEGIN_DAY_23');
  if (day === 23) return seeded;
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: `path_${opts.path ?? 'beast'}` });
  await act(runtime, vkUserId, 'COMPLETE_DAY_23');
  await act(runtime, vkUserId, 'BEGIN_DAY_24');
  if (day === 24) return seeded;
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'hollow' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_24');
  await act(runtime, vkUserId, 'BEGIN_DAY_25');
  if (day === 25) return seeded;
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine_camp' });
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'take_camp' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_25');
  await act(runtime, vkUserId, 'BEGIN_DAY_26');
  if (day === 26) return seeded;
  await fightUntil(runtime, store, player.id, vkUserId, 'blackroot');
  await act(runtime, vkUserId, 'COMPLETE_DAY_26');
  await act(runtime, vkUserId, 'BEGIN_DAY_27');
  if (day === 27) return seeded;
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine' });
  await act(runtime, vkUserId, 'WEEK4_ACT', { act: opts.social ?? 'pass' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_27');
  await act(runtime, vkUserId, 'BEGIN_DAY_28');
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

function ironVsTlennik(hp = 900): { player: CombatantSnapshot; enemy: CombatantSnapshot } {
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
      id: 'tlennik',
      name: 'Тленник',
      hp: ENEMIES.tlennik.hp,
      maxHp: ENEMIES.tlennik.hp,
      attack: ENEMIES.tlennik.minDamage,
      defense: ENEMIES.tlennik.defense,
      speed: ENEMIES.tlennik.speed,
      critChance: ENEMIES.tlennik.critChance,
      critDamage: ENEMIES.tlennik.critDamage,
      dodge: ENEMIES.tlennik.dodge,
      accuracy: ENEMIES.tlennik.accuracy,
      luck: 0,
      minDamage: ENEMIES.tlennik.minDamage,
      maxDamage: ENEMIES.tlennik.maxDamage,
    },
  };
}

describe('week 4 content canon', () => {
  it('adds trail recipes without a new tool tier and keeps week 3 recipes', () => {
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.root_rope.cost).toEqual({ ROOT_FIBER: 4, FIBER: 2 });
    expect(CRAFT_RECIPES.rot_binding.cost).toEqual({ ROT_RESIN: 3, FIBER: 2, STICK: 2 });
    expect(CRAFT_RECIPES.path_marker.cost).toEqual({ PLANK: 4, COAL: 2, ROT_RESIN: 2 });
    expect(CRAFT_RECIPES.rot_torch).toBeUndefined();
    expect(ENEMIES.rot_scuttler.name).toBe('Гнилуш');
    expect(ENEMIES.mire_stalker.name).toBe('Топник');
    expect(ENEMIES.bark_reaper.name).toBe('Короедник');
    expect(ENEMIES.blackroot.name).toBe('Чернокорень');
    expect(ENEMIES.tlennik.name).toBe('Тленник');
    expect(ENEMIES.tlennik.hp).toBeGreaterThan(ENEMIES.vyazen.hp);
    expect(ENEMIES.blackroot.hp).toBeGreaterThan(ENEMIES.rootlasher.hp);
    expect(ENEMIES.tlennik.hp).toBeLessThan(ENEMIES.vyazen.hp * 1.2);
    expect(ENEMIES.tlennik.defense).toBe(5);
    expect(ENEMIES.blackroot.defense).toBe(5);
    expect(LOCATIONS.rotten_trail_edge.name).toMatch(/троп/i);
    expect(ITEM_TEMPLATES.path_charm.name).toBe('Оберег тропы');
    expect(ITEM_TEMPLATES.seal_shard_4.questItem).toBe(true);
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'fourth_seal')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_22')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('WEEK4_ACT')).toBe(true);
    expect(PROTOTYPE_VERSION).toBe('0.0.12');
    expect(BALANCE_VERSION).toBe('0.0.12');
  });
});

describe('week 4 unlock', () => {
  it('gates BEGIN_DAY_22 on week_3_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_22');
    expect(denied.text).toMatch(/нельзя/i);
    const { runtime: rt, vkUserId: vk } = await seedWeek3Done();
    const started = await act(rt, vk, 'BEGIN_DAY_22');
    expect(started.text).toMatch(/троп|маркер|гни/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 22 marker', () => {
  it('requires inspect and a route, gather cache is once', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek3Done();
    await act(runtime, vkUserId, 'BEGIN_DAY_22');
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_22');
    expect(early.text).toMatch(/знак|нельзя/i);
    const inspect = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'inspect' });
    expect(inspect.text).toMatch(/правк|рез|знак/i);
    const gather = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'gather_edge' });
    expect(gather.text).toMatch(/смол|брёвн/i);
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'gather_edge' }, 'edge-once');
    const dup = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'gather_edge' }, 'edge-once');
    expect(dup.text).toMatch(/уже|склад/i);
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'route_old' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_22');
    expect(done.text).toMatch(/ложн|след/i);
    expect((await store.getFlags(player.id)).week_4_started).toBe('1');
    expect((await store.getFlags(player.id)).week4_marker_examined).toBe('1');
    expect((await store.getFlags(player.id)).week4_route_old).toBe('1');
  });
});

describe('day 23 false trails', () => {
  it('lets hunter-5 take extra loot and never job-gates', async () => {
    const { store, runtime, player, vkUserId } = await toDay(23);
    await store.acceptJobTask({ playerId: player.id, templateId: 'hunter_pve' });
    const inner = store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === player.id && job.profession === 'HUNTER');
    if (row) row.level = 5;
    const menu = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'false' });
    expect(menu.text).toMatch(/охотник|овраг|настил/i);
    expect(menu.buttons.length).toBeLessThanOrEqual(5);
    const hideBefore = (await store.getResources(player.id)).HIDE ?? 0;
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'path_beast' });
    expect((await store.getFlags(player.id)).week4_path_beast).toBe('1');
    expect((await store.getFlags(player.id)).week4_path_adv).toBe('1');
    expect((await store.getResources(player.id)).HIDE ?? 0).toBeGreaterThan(hideBefore);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_23');
    expect(done.text).toMatch(/низин/i);
  });

  it('mismatch still clears with a soft cost, miner and logger routes work', async () => {
    const poor = await toDay(23);
    const energy = (await reload(poor.store, poor.player.id)).energy;
    await act(poor.runtime, poor.vkUserId, 'WEEK4_ACT', { act: 'path_plank' });
    expect((await poor.store.getFlags(poor.player.id)).week4_path_plank).toBe('1');
    expect((await poor.store.getFlags(poor.player.id)).week4_path_adv).toBeUndefined();
    expect((await reload(poor.store, poor.player.id)).energy).toBeLessThanOrEqual(energy);
    const miner = await toDay(23);
    await act(miner.runtime, miner.vkUserId, 'WEEK4_ACT', { act: 'path_ravine' });
    expect((await miner.store.getFlags(miner.player.id)).week4_path_ravine).toBe('1');
  });
});

describe('day 24 hollow', () => {
  it('opens repeatable PvE and does not complete without visiting', async () => {
    const { runtime, vkUserId, store, player } = await toDay(24);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_24');
    expect(early.text).toMatch(/низин|нельзя/i);
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'hollow' });
    expect((await store.getFlags(player.id)).visited_rot_hollow).toBe('1');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'rot_scuttler');
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_24');
    const forage = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'forage' });
    expect(forage.text).toMatch(/еда|смол|трав/i);
    expect(forage.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 25 missing camp', () => {
  it('examine then take loots once, skip also completes', async () => {
    const { store, runtime, player, vkUserId } = await toDay(25);
    const exam = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine_camp' });
    expect(exam.text).toMatch(/стрелк|знак|правк/i);
    const take = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'take_camp' });
    expect(take.text).toMatch(/паёк|смол|вещи/i);
    const food = (await store.getResources(player.id)).FOOD ?? 0;
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'take_camp' });
    expect((await store.getResources(player.id)).FOOD ?? 0).toBe(food);
    await act(runtime, vkUserId, 'COMPLETE_DAY_25');
    expect((await store.getFlags(player.id)).missing_camp_examined).toBe('1');
    const skip = await toDay(25);
    await act(skip.runtime, skip.vkUserId, 'WEEK4_ACT', { act: 'skip_camp' });
    await act(skip.runtime, skip.vkUserId, 'COMPLETE_DAY_25');
    expect((await skip.store.getFlags(skip.player.id)).missing_camp_skipped).toBe('1');
  });
});

describe('day 26 blackroot', () => {
  it('loss retries without wipe, core once', async () => {
    const { store, runtime, player, vkUserId } = await toDay(26, { bow: true, shield: true });
    const table = await itemCount(store, player.id, 'crafting_table');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'blackroot', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).blackroot_failed).toBe('1');
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'blackroot');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).BLACKROOT_CORE).toBe(1);
    await fightUntil(runtime, store, player.id, vkUserId, 'blackroot');
    expect((await store.getResources(player.id)).BLACKROOT_CORE).toBe(1);
    await act(runtime, vkUserId, 'COMPLETE_DAY_26');
    expect((await store.getFlags(player.id)).defeated_blackroot).toBe('1');
  });
});

describe('day 27 warped node', () => {
  it('requires examine then a social pick, peaceful works without clan or pvp', async () => {
    const { store, runtime, player, vkUserId } = await toDay(27, { soldToken: true, miraTrust: 0 });
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_27');
    expect(early.text).toMatch(/узел|нельзя/i);
    const exam = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine' });
    expect(exam.text).toMatch(/правка|перенастраив|трещина/i);
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'pass' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_27');
    expect((await store.getFlags(player.id)).warped_network_seen).toBe('1');
    expect((await store.getFlags(player.id)).week4_social_pass).toBe('1');
  });

  it('talk, help, pvp and clan show/hide all complete', async () => {
    const talk = await toDay(27);
    await act(talk.runtime, talk.vkUserId, 'WEEK4_ACT', { act: 'examine' });
    await act(talk.runtime, talk.vkUserId, 'WEEK4_ACT', { act: 'talk' });
    await act(talk.runtime, talk.vkUserId, 'COMPLETE_DAY_27');
    expect((await talk.store.getFlags(talk.player.id)).week4_social_talk).toBe('1');
    const help = await toDay(27);
    await act(help.runtime, help.vkUserId, 'WEEK4_ACT', { act: 'examine' });
    await act(help.runtime, help.vkUserId, 'WEEK4_ACT', { act: 'help' });
    await act(help.runtime, help.vkUserId, 'COMPLETE_DAY_27');
    expect((await help.store.getFlags(help.player.id)).week4_social_help).toBe('1');
    const pvp = await toDay(27);
    await act(pvp.runtime, pvp.vkUserId, 'WEEK4_ACT', { act: 'examine' });
    const pick = await act(pvp.runtime, pvp.vkUserId, 'WEEK4_ACT', { act: 'pvp' });
    expect(pick.text).toMatch(/стычк|спор/i);
    await act(pvp.runtime, pvp.vkUserId, 'COMPLETE_DAY_27');
    expect((await pvp.store.getFlags(pvp.player.id)).week4_social_pvp).toBe('1');
    const clan = await toDay(27);
    clan.player.coins = 400;
    await clan.store.savePlayer(clan.player);
    await clan.store.createClan({
      name: 'Тлен',
      tag: 'ТЛН',
      description: '',
      leaderPlayerId: clan.player.id,
    });
    await act(clan.runtime, clan.vkUserId, 'WEEK4_ACT', { act: 'examine' });
    const social = await act(clan.runtime, clan.vkUserId, 'WEEK4_ACT', { act: 'social' });
    expect(social.text).toMatch(/ТЛН|клан/i);
    await act(clan.runtime, clan.vkUserId, 'WEEK4_ACT', { act: 'clan_show' });
    await act(clan.runtime, clan.vkUserId, 'WEEK4_ACT', { act: 'pass' });
    await act(clan.runtime, clan.vkUserId, 'COMPLETE_DAY_27');
    expect((await clan.store.getFlags(clan.player.id)).week4_clan_shown).toBe('1');
  });
});

describe('day 28 tlennik', () => {
  it('loss retries, first win grants shard/charm once, ending is Осталось: 3', async () => {
    const { store, runtime, player, vkUserId } = await toDay(28, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      miraTrust: 2,
    });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'use_core' });
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'tlennik', { move: 'core' }, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).tlennik_failed).toBe('1');
    const table = await itemCount(store, player.id, 'crafting_table');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'tlennik', { move: 'core' });
    expect(win.text).toMatch(/Победа/i);
    expect(await itemCount(store, player.id, 'path_charm')).toBe(1);
    expect(await itemCount(store, player.id, 'seal_shard_4')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_4).toBe(1);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    await fightUntil(runtime, store, player.id, vkUserId, 'tlennik', { move: 'core' });
    expect(await itemCount(store, player.id, 'path_charm')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_4).toBe(1);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_28');
    expect(end.text).toContain('Осталось: 3');
    expect(end.text).toMatch(/Четыре печати молчат/i);
    expect(end.text).not.toMatch(/День 29|BEGIN_DAY_29/i);
    const flags = await store.getFlags(player.id);
    expect(flags.week_4_complete).toBe('1');
    expect(flags.tlennik_defeated).toBe('1');
    const again = await act(runtime, vkUserId, 'BEGIN_DAY_28');
    expect(again.text).toContain('Осталось: 3');
    const ach = (await store.listAchievements(player.id)).map((row) => row.achievementId);
    expect(ach).toContain('WEEK_FOUR_COMPLETE');
  });

  it('minimal melee path without bow, shield, core, pet or lantern still wins', async () => {
    const { store, runtime, player, vkUserId } = await toDay(28, {
      lantern: false,
      pet: false,
      bow: false,
      shield: false,
      miraTrust: 0,
      soldToken: true,
    });
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'tlennik');
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_28');
    expect((await store.getFlags(player.id)).week_4_complete).toBe('1');
    expect((await store.getFlags(player.id)).used_blackroot_core).toBeUndefined();
  });
});

describe('week 4 playthroughs', () => {
  it('A. old route, hunter path, examined camp, kept core, pass, prepared boss', async () => {
    const { store, runtime, player, vkUserId } = await toDay(28, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      route: 'old',
      path: 'beast',
    });
    expect((await store.getFlags(player.id)).week4_route_old).toBe('1');
    expect((await store.getFlags(player.id)).blackroot_core_kept).toBe('1');
    await fightUntil(runtime, store, player.id, vkUserId, 'tlennik', { move: 'core' });
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_28');
    expect(end.text).toContain('Осталось: 3');
    expect((await store.getFlags(player.id)).week_3_complete).toBe('1');
    expect((await store.getFlags(player.id)).week_2_complete).toBe('1');
  });

  it('B. fresh route, ravine, skip camp, talk, no core spend', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek3Done({ soldToken: true, miraTrust: 0 });
    await act(runtime, vkUserId, 'BEGIN_DAY_22');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'route_fresh' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_22');
    await act(runtime, vkUserId, 'BEGIN_DAY_23');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'path_ravine' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_23');
    await act(runtime, vkUserId, 'BEGIN_DAY_24');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'hollow' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_24');
    await act(runtime, vkUserId, 'BEGIN_DAY_25');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'skip_camp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_25');
    await act(runtime, vkUserId, 'BEGIN_DAY_26');
    await fightUntil(runtime, store, player.id, vkUserId, 'blackroot');
    await act(runtime, vkUserId, 'COMPLETE_DAY_26');
    await act(runtime, vkUserId, 'BEGIN_DAY_27');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'talk' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_27');
    await act(runtime, vkUserId, 'BEGIN_DAY_28');
    await fightUntil(runtime, store, player.id, vkUserId, 'tlennik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_28');
    const flags = await store.getFlags(player.id);
    expect(flags.week4_route_fresh).toBe('1');
    expect(flags.week4_path_ravine).toBe('1');
    expect(flags.missing_camp_skipped).toBe('1');
    expect(flags.week4_social_talk).toBe('1');
    expect(flags.used_blackroot_core).toBeUndefined();
    expect(flags.week_4_complete).toBe('1');
  });

  it('C. trees route, plank, leave camp, pvp, hide clan', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek3Done();
    player.coins = 400;
    await store.savePlayer(player);
    await store.createClan({ name: 'Тропа', tag: 'ТРП', description: '', leaderPlayerId: player.id });
    await act(runtime, vkUserId, 'BEGIN_DAY_22');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'route_trees' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_22');
    await act(runtime, vkUserId, 'BEGIN_DAY_23');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'path_plank' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_23');
    await act(runtime, vkUserId, 'BEGIN_DAY_24');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'hollow' });
    await fightUntil(runtime, store, player.id, vkUserId, 'bark_reaper');
    await act(runtime, vkUserId, 'COMPLETE_DAY_24');
    await act(runtime, vkUserId, 'BEGIN_DAY_25');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine_camp' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'leave_camp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_25');
    await act(runtime, vkUserId, 'BEGIN_DAY_26');
    await fightUntil(runtime, store, player.id, vkUserId, 'blackroot');
    await act(runtime, vkUserId, 'COMPLETE_DAY_26');
    await act(runtime, vkUserId, 'BEGIN_DAY_27');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'examine' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'clan_hide' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'pvp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_27');
    await act(runtime, vkUserId, 'BEGIN_DAY_28');
    await fightUntil(runtime, store, player.id, vkUserId, 'tlennik');
    await act(runtime, vkUserId, 'COMPLETE_DAY_28');
    const flags = await store.getFlags(player.id);
    expect(flags.week4_route_trees).toBe('1');
    expect(flags.week4_path_plank).toBe('1');
    expect(flags.missing_camp_left).toBe('1');
    expect(flags.week4_social_pvp).toBe('1');
    expect(flags.week4_clan_hidden).toBe('1');
    expect(flags.week_4_complete).toBe('1');
  });
});

describe('week 4 systems', () => {
  it('progresses existing jobs from real gather/PvE once and ignores production collect', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek3Done();
    await acceptJobContract(store, player.id, 'logger_logs', new Date());
    await acceptJobContract(store, player.id, 'hunter_pve', new Date());
    await act(runtime, vkUserId, 'BEGIN_DAY_22');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'gather_edge' });
    const logger = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(logger?.progress).toBe(4);
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'route_old' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_22');
    await act(runtime, vkUserId, 'BEGIN_DAY_23');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'path_beast' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_23');
    await act(runtime, vkUserId, 'BEGIN_DAY_24');
    await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'hollow' });
    await fightUntil(runtime, store, player.id, vkUserId, 'mire_stalker');
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

  it('lets Week4 resin list on the existing market and blocks core/shard', async () => {
    expect(isTradeableAsset('RESOURCE', 'ROT_RESIN')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'BLACKROOT_CORE')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_4')).toBe(false);
    expect(TRADEABLE_RESOURCES).toContain('ROT_RESIN');
    const { store, player } = await seedWeek3Done();
    await store.addResource(player.id, 'ROT_RESIN', 4);
    await store.addResource(player.id, 'BLACKROOT_CORE', 1);
    await store.addResource(player.id, 'SEAL_SHARD_4', 1);
    const listing = await createFixedListing(store, {
      sellerPlayerId: player.id,
      assetRef: 'ROT_RESIN',
      quantity: 2,
      unitPrice: 5,
    });
    expect(listing.assetRef).toBe('ROT_RESIN');
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'BLACKROOT_CORE',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'SEAL_SHARD_4',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });

  it('keeps the hero hub and does not start day 29 or mention payments', async () => {
    const { runtime, vkUserId } = await seedWeek3Done();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.map((row) => row.label)).toEqual(['👤 Профиль', '⚔ PvP', '🛒 Рынок', '🏕 Клан', '⬅ Назад']);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_22');
    expect(started.text).not.toMatch(/donat|premium|mini app|minecraft/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
    expect(camp.buttons.some((row) => row.label.includes('Тропа'))).toBe(true);
  });

  it('rejects forged loot, early bosses and week4 acts before week 3', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    const early = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'edge' });
    expect(early.text).toMatch(/нельзя|закрыта/i);
    const boss = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'tlennik', hp: 1 });
    expect(boss.text).toMatch(/нельзя/i);
    await store.setFlag(player.id, 'week_3_complete', '1');
    const forged = await act(runtime, vkUserId, 'WEEK4_ACT', { act: 'grant_all', BLACKROOT_CORE: 99 });
    expect((await store.getResources(player.id)).BLACKROOT_CORE ?? 0).toBe(0);
    expect(forged.buttons.length).toBeLessThanOrEqual(5);
  });

  it('lists week 4 content without leaking English ids in player labels', () => {
    expect(RESOURCE_TYPES).toEqual(expect.arrayContaining(['ROT_RESIN', 'BLACKROOT_CORE', 'SEAL_SHARD_4']));
    expect(resourceLabel('ROT_RESIN')).toMatch(/смол/i);
    expect(resourceLabel('BLACKROOT_CORE')).toMatch(/сердцевин/i);
    expect(resourceLabel('SEAL_SHARD_4')).toMatch(/печат/i);
    expect(STORY_FLAGS).toEqual(
      expect.arrayContaining(['week_4_complete', 'warped_network_seen', 'defeated_blackroot', 'tlennik_defeated']),
    );
    expect(BOSS_IDS).toEqual(expect.arrayContaining(['blackroot', 'tlennik', 'vyazen']));
    expect(ACHIEVEMENTS.WEEK_FOUR_COMPLETE.id).toBe('WEEK_FOUR_COMPLETE');
    expect(WEEK4_COMMANDS).toHaveLength(15);
    expect(WEEK4_ENEMIES.every(isWeek4Enemy)).toBe(true);
    expect(isWeek4Location('black_root_vault')).toBe(true);
    expect(isWeek4Location('ashen_wedge')).toBe(false);
    expect(COMBAT_LOOT.tlennik.firstItems).toEqual(['path_charm', 'seal_shard_4']);
    expect(ITEM_TEMPLATES.rot_binding.name).toMatch(/связк/i);
  });
});

describe('week 4 combat modifiers', () => {
  it('gives optional bonuses without requiring any of them', () => {
    const bare = week4Modifiers(modsCtx(), 'tlennik');
    expect(bare.playerOpeningHits).toBe(0);
    const loaded = week4Modifiers(
      modsCtx(
        {
          lantern_repaired: '1',
          scavenger_bonded: '1',
          used_blackroot_core: '1',
          path_marker_used: '1',
          warped_network_seen: '1',
          mira_trust: '2',
        },
        ['bow', 'shield', 'iron_sword', 'root_brace', 'path_charm'],
      ),
      'tlennik',
      {},
      { LOGGER: 10, MINER: 10, HUNTER: 10, CRAFTER: 10 },
    );
    expect(loaded.playerOpeningHits).toBe(1);
    expect(loaded.note).toMatch(/лук|щит|фонарь|питомец|сердцевин/i);
    expect((loaded.enemy.hp ?? 0) < 0 || (loaded.enemy.defense ?? 0) <= 0).toBe(true);
  });

  it('canonical iron sword vs tlennik is not a guaranteed DRAW', () => {
    const tallies = { WIN: 0, LOSS: 0, DRAW: 0 };
    for (let seed = 1; seed <= 40; seed += 1) {
      const { player, enemy } = ironVsTlennik(900);
      const result = simulateBattle({ player, enemy, seed, balanceVersion: BALANCE_VERSION });
      tallies[result.result] += 1;
    }
    expect(tallies.DRAW).toBeLessThan(tallies.WIN);
    expect(tallies.WIN).toBeGreaterThan(30);
    const { player, enemy } = ironVsTlennik(900);
    const sample = simulateBattle({ player, enemy, seed: 7, balanceVersion: BALANCE_VERSION });
    expect(sample.result).toBe('WIN');
    expect(ENEMIES.tlennik.hp).toBeLessThanOrEqual(64 * 4);
    expect(ENEMIES.tlennik.defense).toBe(5);
  });
});
