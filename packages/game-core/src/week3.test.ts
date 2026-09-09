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
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';
import type { WeekCtx } from './week';
import { createFixedListing } from './market';
import { acceptJobContract } from './jobs';
import { ActionRejectedError } from './errors';
import {
  isWeek3Enemy,
  isWeek3Location,
  week3Modifiers,
  WEEK3_COMMANDS,
  WEEK3_ENEMIES,
} from './week3';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-week3',
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

interface SeedOpts {
  lantern?: boolean;
  pet?: boolean;
  soldToken?: boolean;
  miraTrust?: number;
  bow?: boolean;
  shield?: boolean;
}

async function seedWeek2Done(opts: SeedOpts = {}) {
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
    'seen_five_seals',
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
  player.level = 10;
  player.xp = 900;
  player.maxHp = 160;
  player.hp = 160;
  player.maxEnergy = 40;
  player.energy = 40;
  player.coins = 120;
  player.currentLocation = 'player_camp';
  player.currentState = 'week2_complete';
  await store.savePlayer(player);
  await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'iron_sword', rarity: 'UNCOMMON' });
  await store.createItem({ playerId: player.id, templateId: 'stone_hoe', rarity: 'COMMON' });
  await store.createItem({ playerId: player.id, templateId: 'bucket', rarity: 'COMMON' });
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

async function clearTangle(
  runtime: GameRuntime,
  vkUserId: string,
  kind: 'logger' | 'miner' | 'crafter' = 'logger',
) {
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'tangle' });
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: `path_${kind}` });
}

async function pack(runtime: GameRuntime, vkUserId: string) {
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'supply' });
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'pack' });
}

async function toDay(day: number, opts: SeedOpts & { path?: 'logger' | 'miner' | 'crafter'; social?: 'sneak' | 'negotiate' | 'pvp' } = {}) {
  const seeded = await seedWeek2Done(opts);
  const { runtime, vkUserId, store, player } = seeded;
  await act(runtime, vkUserId, 'BEGIN_DAY_15');
  if (day === 15) return seeded;
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'inspect' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_15');
  await act(runtime, vkUserId, 'BEGIN_DAY_16');
  if (day === 16) return seeded;
  await clearTangle(runtime, vkUserId, opts.path ?? 'logger');
  await act(runtime, vkUserId, 'COMPLETE_DAY_16');
  await act(runtime, vkUserId, 'BEGIN_DAY_17');
  if (day === 17) return seeded;
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grove' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_17');
  await act(runtime, vkUserId, 'BEGIN_DAY_18');
  if (day === 18) return seeded;
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'examine' });
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'take_part' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_18');
  await act(runtime, vkUserId, 'BEGIN_DAY_19');
  if (day === 19) return seeded;
  await pack(runtime, vkUserId);
  await act(runtime, vkUserId, 'COMPLETE_DAY_19');
  await act(runtime, vkUserId, 'BEGIN_DAY_20');
  if (day === 20) return seeded;
  await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
  await act(runtime, vkUserId, 'WEEK3_ACT', { act: opts.social ?? 'sneak' });
  await act(runtime, vkUserId, 'COMPLETE_DAY_20');
  await act(runtime, vkUserId, 'BEGIN_DAY_21');
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

describe('week 3 content canon', () => {
  it('adds rootwood recipes without a new tool tier and keeps week 2 recipes', () => {
    expect(CRAFT_RECIPES.iron_sword.cost).toEqual({ IRON_INGOT: 2, STICK: 1 });
    expect(CRAFT_RECIPES.bow.cost).toEqual({ STICK: 3, STRING: 3 });
    expect(CRAFT_RECIPES.root_rope.cost).toEqual({ ROOT_FIBER: 4, FIBER: 2 });
    expect(CRAFT_RECIPES.root_brace.cost).toEqual({ LOG: 6, COBBLESTONE: 4, IRON_INGOT: 1 });
    expect(CRAFT_RECIPES.root_torch).toBeUndefined();
    expect(ENEMIES.root_crawler.name).toBe('Корневой ползун');
    expect(ENEMIES.bark_hound.name).toBe('Корявый гончий');
    expect(ENEMIES.sap_stinger.name).toBe('Смоляной жалец');
    expect(ENEMIES.rootlasher.name).toBe('Корнеплёт');
    expect(ENEMIES.vyazen.name).toBe('Вязень');
    expect(ENEMIES.vyazen.hp).toBeGreaterThan(ENEMIES.mist_warden.hp);
    expect(ENEMIES.rootlasher.hp).toBeGreaterThan(ENEMIES.smolnik.hp);
    expect(ENEMIES.vyazen.hp).toBeLessThan(ENEMIES.mist_warden.hp * 1.3);
    expect(LOCATIONS.rootwood_edge.name).toMatch(/чащ/i);
    expect(ITEM_TEMPLATES.root_charm.name).toBe('Корневой оберег');
    expect(ITEM_TEMPLATES.seal_shard_5.questItem).toBe(true);
    expect(QUEST_TEMPLATES.some((quest) => quest.id === 'third_seal')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_15')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_36')).toBe(false);
    expect((GAME_COMMANDS as readonly string[]).includes('WEEK3_ACT')).toBe(true);
    expect(PROTOTYPE_VERSION).toBe('0.0.11');
    expect(BALANCE_VERSION).toBe('0.0.11');
  });
});

describe('week 3 unlock', () => {
  it('gates BEGIN_DAY_15 on week_2_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_15');
    expect(denied.text).toMatch(/нельзя/i);
    const { runtime: rt, vkUserId: vk } = await seedWeek2Done();
    const started = await act(rt, vk, 'BEGIN_DAY_15');
    expect(started.text).toMatch(/чащ|маркер|корн/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
  });
});

describe('day 15 rootwood edge', () => {
  it('inspects the mark, gathers once, Rem/Mira react to week 1–2 flags', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek2Done({ lantern: true, pet: true });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_15');
    expect(started.text).toMatch(/жетон|фонар|питомец|Мира|корн/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const inspect = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'inspect' });
    expect(inspect.text).toMatch(/знак|сеть|провод/i);
    expect((await store.getFlags(player.id)).inspected_root_mark).toBe('1');
    const gather = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'gather_edge' });
    expect((await store.getResources(player.id)).LOG).toBeGreaterThanOrEqual(44);
    expect((await store.getResources(player.id)).ROOT_FIBER).toBe(3);
    const again = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'gather_edge' }, 'edge-once');
    const dup = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'gather_edge' }, 'edge-once');
    expect(again.text).toBe(dup.text);
    expect((await store.getResources(player.id)).ROOT_FIBER).toBe(4);
    const detour = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'detour' });
    expect(detour.text).toMatch(/обход/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_15');
    expect(done.text).toMatch(/завал|топор/i);
    expect((await store.getFlags(player.id)).day_15_complete).toBe('1');
    expect((await store.getFlags(player.id)).week_3_started).toBe('1');
  });

  it('sold token gets a colder rem line and still proceeds', async () => {
    const { runtime, vkUserId } = await seedWeek2Done({ soldToken: true, miraTrust: 0 });
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_15');
    expect(started.text).toMatch(/продан/i);
  });
});

describe('day 16 tangle paths', () => {
  it('lets a logger-5 bonus spend less wood and never job-gates', async () => {
    const { store, runtime, player, vkUserId } = await toDay(16);
    await store.acceptJobTask({ playerId: player.id, templateId: 'logger_logs' });
    const inner = store as unknown as {
      state: { jobs: Array<{ playerId: string; profession: string; level: number }> };
    };
    const row = inner.state.jobs.find((job) => job.playerId === player.id && job.profession === 'LOGGER');
    if (row) row.level = 5;
    const menu = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'tangle' });
    expect(menu.text).toMatch(/6 брёвен/);
    expect(menu.buttons.length).toBeLessThanOrEqual(5);
    const logs = (await store.getResources(player.id)).LOG ?? 0;
    await store.addResource(player.id, 'LOG', -logs + 5);
    const poor = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'path_logger' });
    expect(poor.text).toMatch(/брёвен|дворы|рынок/i);
    await store.addResource(player.id, 'LOG', 8);
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'path_logger' });
    expect((await store.getFlags(player.id)).tangle_cleared).toBe('1');
    expect((await store.getFlags(player.id)).root_path_logger).toBe('1');
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_16');
    expect(done.text).toMatch(/рощ/i);
  });

  it('miner and crafter routes also clear without a profession', async () => {
    const miner = await toDay(16);
    await act(miner.runtime, miner.vkUserId, 'WEEK3_ACT', { act: 'path_miner' });
    expect((await miner.store.getFlags(miner.player.id)).root_path_miner).toBe('1');
    const crafter = await toDay(16);
    await act(crafter.runtime, crafter.vkUserId, 'WEEK3_ACT', { act: 'path_crafter' });
    expect((await crafter.store.getFlags(crafter.player.id)).root_path_crafter).toBe('1');
  });
});

describe('day 17 grove', () => {
  it('opens repeatable PvE and does not complete without visiting the grove', async () => {
    const { runtime, vkUserId, store, player } = await toDay(17);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_17');
    expect(early.text).toMatch(/рощ|нельзя/i);
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grove' });
    const fight = await fightUntil(runtime, store, player.id, vkUserId, 'root_crawler');
    expect(fight.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).ROOT_FIBER ?? 0).toBeGreaterThan(0);
    const hound = await fightUntil(runtime, store, player.id, vkUserId, 'bark_hound');
    expect(hound.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).HIDE ?? 0).toBeGreaterThan(0);
    const forage = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'forage' });
    expect(forage.text).toMatch(/еды|трав|волокн/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_17');
    expect((await store.getFlags(player.id)).day_17_complete).toBe('1');
  });
});

describe('day 18 buried node', () => {
  it('examines the network, lets Rem and Mira disagree, part is optional', async () => {
    const { store, runtime, player, vkUserId } = await toDay(18);
    const exam = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'examine' });
    expect(exam.text).toMatch(/печат|сеть|нити/i);
    expect(exam.text).toMatch(/Рем|Мира/);
    expect((await store.getFlags(player.id)).root_mechanism_examined).toBe('1');
    const take = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'take_part' });
    expect(take.text).toMatch(/детал/i);
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_18');
    expect((await store.getFlags(player.id)).root_part_taken).toBe('1');
    expect(done.text).toMatch(/припас/i);
  });

  it('skipping the mechanism still closes the day', async () => {
    const { store, runtime, player, vkUserId } = await toDay(18);
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'skip_mech' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_18');
    expect((await store.getFlags(player.id)).root_mechanism_skipped).toBe('1');
    expect((await store.getFlags(player.id)).day_18_complete).toBe('1');
  });
});

describe('day 19 supplies', () => {
  it('packs from inventory and never requires market or farms', async () => {
    const { store, runtime, player, vkUserId } = await toDay(19);
    const menu = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'supply' });
    expect(menu.text).toMatch(/не обязателен|дворов нет|Вел/i);
    expect(menu.buttons.length).toBeLessThanOrEqual(5);
    await pack(runtime, vkUserId);
    expect((await store.getFlags(player.id)).root_pack_ready).toBe('1');
    expect((await store.getResources(player.id)).LOG).toBeLessThan(40);
    await act(runtime, vkUserId, 'COMPLETE_DAY_19');
    expect((await store.getFlags(player.id)).day_19_complete).toBe('1');
  });

  it('Rem and Mira can top up food; Mira stays silent without trust', async () => {
    const cold = await toDay(19, { miraTrust: 0, soldToken: true });
    const mira = await act(cold.runtime, cold.vkUserId, 'WEEK3_ACT', { act: 'mira_help' });
    expect(mira.text).toMatch(/молчит|нельзя|Собери/i);
    const rem = await act(cold.runtime, cold.vkUserId, 'WEEK3_ACT', { act: 'rem_help' });
    expect(rem.text).toMatch(/паёк|еды/i);
    const warm = await toDay(19, { miraTrust: 2 });
    const help = await act(warm.runtime, warm.vkUserId, 'WEEK3_ACT', { act: 'mira_help' });
    expect(help.text).toMatch(/еды/i);
  });
});

describe('day 20 rootlasher and social', () => {
  it('retries without wipe, grants ROOT_CORE once, then requires a social pick', async () => {
    const { store, runtime, player, vkUserId } = await toDay(20, { bow: true, shield: true, lantern: true });
    const knife = await itemCount(store, player.id, 'crafting_table');
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher', {}, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(knife);
    expect((await store.getFlags(player.id)).rootlasher_failed).toBe('1');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
    expect(win.text).toMatch(/Победа/i);
    expect((await store.getResources(player.id)).ROOT_CORE).toBe(1);
    expect(labels(win).some((label) => /Следы/.test(label))).toBe(true);
    await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
    expect((await store.getResources(player.id)).ROOT_CORE).toBe(1);
    const early = await act(runtime, vkUserId, 'COMPLETE_DAY_20');
    expect(early.text).toMatch(/следы|групп/i);
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'sneak' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_20');
    expect((await store.getFlags(player.id)).root_social_sneak).toBe('1');
    expect((await store.getFlags(player.id)).day_20_complete).toBe('1');
  });

  it('negotiate and pvp alternates do not require a clan', async () => {
    const talk = await toDay(20);
    await fightUntil(talk.runtime, talk.store, talk.player.id, talk.vkUserId, 'rootlasher');
    await act(talk.runtime, talk.vkUserId, 'WEEK3_ACT', { act: 'negotiate' });
    expect((await talk.store.getFlags(talk.player.id)).root_social_negotiate).toBe('1');
    await act(talk.runtime, talk.vkUserId, 'COMPLETE_DAY_20');

    const pvp = await toDay(20);
    await fightUntil(pvp.runtime, pvp.store, pvp.player.id, pvp.vkUserId, 'rootlasher');
    const pick = await act(pvp.runtime, pvp.vkUserId, 'WEEK3_ACT', { act: 'pvp' });
    expect(pick.text).toMatch(/спор|стычк/i);
    expect((await pvp.store.getFlags(pvp.player.id)).root_social_pvp).toBe('1');
    await act(pvp.runtime, pvp.vkUserId, 'COMPLETE_DAY_20');
    expect((await pvp.store.getFlags(pvp.player.id)).day_20_complete).toBe('1');
  });

  it('clan flavour is optional and never a gate', async () => {
    const { store, runtime, player, vkUserId } = await toDay(20);
    player.coins = 400;
    await store.savePlayer(player);
    await store.setFlag(player.id, 'week_1_complete', '1');
    const clan = await store.createClan({
      name: 'Корни',
      tag: 'КРН',
      description: '',
      leaderPlayerId: player.id,
    });
    expect(clan.tag).toBe('КРН');
    await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
    const social = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'social' });
    expect(social.text).toMatch(/КРН|клана/i);
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'clan_show' });
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'sneak' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_20');
    expect((await store.getFlags(player.id)).root_clan_shown).toBe('1');
    expect((await store.getFlags(player.id)).day_20_complete).toBe('1');
  });
});

describe('day 21 vyazen', () => {
  it('loss retries, first win grants shard/charm once, ending is Осталось: 4', async () => {
    const { store, runtime, player, vkUserId } = await toDay(21, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      miraTrust: 2,
    });
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'use_core' });
    const loss = await fightUntil(runtime, store, player.id, vkUserId, 'vyazen', { move: 'core' }, 'LOSS');
    expect(loss.text).toMatch(/предметы при тебе/i);
    expect((await store.getFlags(player.id)).vyazen_failed).toBe('1');
    const table = await itemCount(store, player.id, 'crafting_table');
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'vyazen', { move: 'core' });
    expect(win.text).toMatch(/Победа/i);
    expect(await itemCount(store, player.id, 'root_charm')).toBe(1);
    expect(await itemCount(store, player.id, 'seal_shard_5')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_5).toBe(1);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(table);
    await fightUntil(runtime, store, player.id, vkUserId, 'vyazen', { move: 'core' });
    expect(await itemCount(store, player.id, 'root_charm')).toBe(1);
    expect((await store.getResources(player.id)).SEAL_SHARD_5).toBe(1);
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_21');
    expect(end.text).toContain('Осталось: 4');
    expect(end.text).toMatch(/Три печати молчат/i);
    expect(end.text).not.toMatch(/День 22|BEGIN_DAY_22/i);
    const flags = await store.getFlags(player.id);
    expect(flags.week_3_complete).toBe('1');
    expect(flags.vyazen_defeated).toBe('1');
    const again = await act(runtime, vkUserId, 'BEGIN_DAY_21');
    expect(again.text).toContain('Осталось: 4');
    const ach = (await store.listAchievements(player.id)).map((row) => row.achievementId);
    expect(ach).toContain('WEEK_THREE_COMPLETE');
  });

  it('minimal melee path without bow, shield, core, pet or lantern still wins', async () => {
    const { store, runtime, player, vkUserId } = await toDay(21, {
      lantern: false,
      pet: false,
      bow: false,
      shield: false,
      miraTrust: 0,
      soldToken: true,
    });
    const win = await fightUntil(runtime, store, player.id, vkUserId, 'vyazen');
    expect(win.text).toMatch(/Победа/i);
    await act(runtime, vkUserId, 'COMPLETE_DAY_21');
    expect((await store.getFlags(player.id)).week_3_complete).toBe('1');
    expect((await store.getFlags(player.id)).used_root_core).toBeUndefined();
  });
});

describe('week 3 playthroughs', () => {
  it('A. logger path, examined node, kept core, sneak, prepared boss', async () => {
    const { store, runtime, player, vkUserId } = await toDay(21, {
      lantern: true,
      pet: true,
      bow: true,
      shield: true,
      path: 'logger',
    });
    expect((await store.getFlags(player.id)).root_path_logger).toBe('1');
    expect((await store.getFlags(player.id)).root_core_kept).toBe('1');
    await fightUntil(runtime, store, player.id, vkUserId, 'vyazen', { move: 'core' });
    const end = await act(runtime, vkUserId, 'COMPLETE_DAY_21');
    expect(end.text).toContain('Осталось: 4');
    expect((await store.getFlags(player.id)).week_2_complete).toBe('1');
    expect((await store.getFlags(player.id)).week_1_complete).toBe('1');
  });

  it('B. miner path, skip mechanism, negotiate, no core spend', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek2Done({ soldToken: true, miraTrust: 0 });
    await act(runtime, vkUserId, 'BEGIN_DAY_15');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_15');
    await act(runtime, vkUserId, 'BEGIN_DAY_16');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'path_miner' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_16');
    await act(runtime, vkUserId, 'BEGIN_DAY_17');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grove' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_17');
    await act(runtime, vkUserId, 'BEGIN_DAY_18');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'skip_mech' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_18');
    await act(runtime, vkUserId, 'BEGIN_DAY_19');
    await pack(runtime, vkUserId);
    await act(runtime, vkUserId, 'COMPLETE_DAY_19');
    await act(runtime, vkUserId, 'BEGIN_DAY_20');
    await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'negotiate' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_20');
    await act(runtime, vkUserId, 'BEGIN_DAY_21');
    await fightUntil(runtime, store, player.id, vkUserId, 'vyazen');
    await act(runtime, vkUserId, 'COMPLETE_DAY_21');
    const flags = await store.getFlags(player.id);
    expect(flags.root_path_miner).toBe('1');
    expect(flags.root_mechanism_skipped).toBe('1');
    expect(flags.root_social_negotiate).toBe('1');
    expect(flags.used_root_core).toBeUndefined();
    expect(flags.week_3_complete).toBe('1');
  });

  it('C. crafter path, leave part, pvp challenge, hide clan', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek2Done();
    player.coins = 400;
    await store.savePlayer(player);
    await store.createClan({ name: 'Чаща', tag: 'ЧЩА', description: '', leaderPlayerId: player.id });
    await act(runtime, vkUserId, 'BEGIN_DAY_15');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_15');
    await act(runtime, vkUserId, 'BEGIN_DAY_16');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'path_crafter' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_16');
    await act(runtime, vkUserId, 'BEGIN_DAY_17');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grove' });
    await fightUntil(runtime, store, player.id, vkUserId, 'sap_stinger');
    await act(runtime, vkUserId, 'COMPLETE_DAY_17');
    await act(runtime, vkUserId, 'BEGIN_DAY_18');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'examine' });
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'leave_part' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_18');
    await act(runtime, vkUserId, 'BEGIN_DAY_19');
    await pack(runtime, vkUserId);
    await act(runtime, vkUserId, 'COMPLETE_DAY_19');
    await act(runtime, vkUserId, 'BEGIN_DAY_20');
    await fightUntil(runtime, store, player.id, vkUserId, 'rootlasher');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'clan_hide' });
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'pvp' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_20');
    await act(runtime, vkUserId, 'BEGIN_DAY_21');
    await fightUntil(runtime, store, player.id, vkUserId, 'vyazen');
    await act(runtime, vkUserId, 'COMPLETE_DAY_21');
    const flags = await store.getFlags(player.id);
    expect(flags.root_path_crafter).toBe('1');
    expect(flags.root_part_left).toBe('1');
    expect(flags.root_social_pvp).toBe('1');
    expect(flags.root_clan_hidden).toBe('1');
    expect(flags.week_3_complete).toBe('1');
  });
});

describe('week 3 systems', () => {
  it('progresses existing jobs from real gather/PvE once and ignores production collect', async () => {
    const { store, runtime, player, vkUserId } = await seedWeek2Done();
    await acceptJobContract(store, player.id, 'logger_logs', new Date());
    await acceptJobContract(store, player.id, 'hunter_pve', new Date());
    await act(runtime, vkUserId, 'BEGIN_DAY_15');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'inspect' });
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'gather_edge' });
    const logger = await store.getAcceptedJobTask(player.id, 'LOGGER');
    expect(logger?.progress).toBe(4);
    await act(runtime, vkUserId, 'COMPLETE_DAY_15');
    await act(runtime, vkUserId, 'BEGIN_DAY_16');
    await clearTangle(runtime, vkUserId, 'logger');
    await act(runtime, vkUserId, 'COMPLETE_DAY_16');
    await act(runtime, vkUserId, 'BEGIN_DAY_17');
    await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grove' });
    await fightUntil(runtime, store, player.id, vkUserId, 'bark_hound');
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

  it('lets Week3 materials list on the existing market and blocks seal/core', async () => {
    expect(isTradeableAsset('RESOURCE', 'ROOT_FIBER')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'ROOT_CORE')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_5')).toBe(false);
    expect(TRADEABLE_RESOURCES).toContain('ROOT_FIBER');
    const { store, player } = await seedWeek2Done();
    await store.addResource(player.id, 'ROOT_FIBER', 4);
    await store.addResource(player.id, 'ROOT_CORE', 1);
    await store.addResource(player.id, 'SEAL_SHARD_5', 1);
    const listing = await createFixedListing(store, {
      sellerPlayerId: player.id,
      assetRef: 'ROOT_FIBER',
      quantity: 2,
      unitPrice: 5,
    });
    expect(listing.assetRef).toBe('ROOT_FIBER');
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'ROOT_CORE',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: player.id,
        assetRef: 'SEAL_SHARD_5',
        quantity: 1,
        unitPrice: 20,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });

  it('keeps the hero hub and does not start day 22 or mention payments', async () => {
    const { runtime, vkUserId } = await seedWeek2Done();
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.map((row) => row.label)).toEqual(['👤 Профиль', '⚔ PvP', '🛒 Рынок', '🏕 Клан', '⬅ Назад']);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_36')).toBe(false);
    const started = await act(runtime, vkUserId, 'BEGIN_DAY_15');
    expect(started.text).not.toMatch(/donat|premium|mini app|minecraft/i);
    expect(started.buttons.length).toBeLessThanOrEqual(5);
    const camp = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(camp.buttons.length).toBeLessThanOrEqual(5);
  });

  it('rejects forged loot, early bosses and week3 acts before week 2', async () => {
    const { runtime, vkUserId, store, player } = await boot();
    const early = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'edge' });
    expect(early.text).toMatch(/нельзя|закрыта/i);
    const boss = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'vyazen', hp: 1 });
    expect(boss.text).toMatch(/нельзя/i);
    await store.setFlag(player.id, 'week_2_complete', '1');
    const forged = await act(runtime, vkUserId, 'WEEK3_ACT', { act: 'grant_all', ROOT_CORE: 99 });
    expect((await store.getResources(player.id)).ROOT_CORE ?? 0).toBe(0);
    expect(forged.buttons.length).toBeLessThanOrEqual(5);
  });

  it('lists week 3 content without leaking English ids in player labels', () => {
    expect(RESOURCE_TYPES).toEqual(expect.arrayContaining(['ROOT_FIBER', 'ROOT_CORE', 'SEAL_SHARD_5']));
    expect(resourceLabel('ROOT_FIBER')).toMatch(/волокн/i);
    expect(resourceLabel('ROOT_CORE')).toMatch(/сердцевин/i);
    expect(resourceLabel('SEAL_SHARD_5')).toMatch(/печат/i);
    expect(STORY_FLAGS).toEqual(
      expect.arrayContaining(['week_3_complete', 'tangle_cleared', 'defeated_rootlasher', 'vyazen_defeated']),
    );
    expect(BOSS_IDS).toEqual(expect.arrayContaining(['rootlasher', 'vyazen', 'mist_warden']));
    expect(ACHIEVEMENTS.WEEK_THREE_COMPLETE.id).toBe('WEEK_THREE_COMPLETE');
    expect(WEEK3_COMMANDS).toHaveLength(15);
    expect(WEEK3_ENEMIES.every(isWeek3Enemy)).toBe(true);
    expect(isWeek3Location('deep_root_vault')).toBe(true);
    expect(isWeek3Location('ashen_wedge')).toBe(false);
    expect(COMBAT_LOOT.vyazen.firstItems).toEqual(['root_charm', 'seal_shard_5']);
    expect(ITEM_TEMPLATES.root_rope.name).toMatch(/верёвк/i);
  });
});

describe('week 3 combat modifiers', () => {
  it('gives optional bonuses without requiring any of them', () => {
    const bare = week3Modifiers(modsCtx(), 'vyazen');
    expect(bare.playerOpeningHits).toBe(0);
    const loaded = week3Modifiers(
      modsCtx(
        {
          lantern_repaired: '1',
          scavenger_bonded: '1',
          used_root_core: '1',
          root_pack_ready: '1',
          mira_trust: '2',
        },
        ['bow', 'shield', 'iron_sword', 'root_brace'],
      ),
      'vyazen',
      {},
      { LOGGER: 10, MINER: 10, HUNTER: 10, CRAFTER: 10 },
    );
    expect(loaded.playerOpeningHits).toBe(1);
    expect(loaded.note).toMatch(/лук|щит|фонарь|питомец|корень/i);
    expect((loaded.enemy.hp ?? 0) < 0 || (loaded.enemy.defense ?? 0) <= 0).toBe(true);
  });
});
