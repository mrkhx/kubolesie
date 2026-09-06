import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateBattle } from '@kubolesie/combat-engine';
import { ENEMIES, ITEM_TEMPLATES } from '@kubolesie/content';
import { XP_TO_LEVEL_2 } from '@kubolesie/shared';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import type { PlayerRecord } from './store';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-day1',
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

async function choice(
  runtime: GameRuntime,
  vkUserId: string,
  nodeId: string,
  choiceId: string,
) {
  return act(runtime, vkUserId, 'DIALOGUE_CHOICE', { nodeId, choiceId });
}

async function reload(store: MemoryGameStore, playerId: string): Promise<PlayerRecord> {
  return (await store.findPlayerById(playerId))!;
}

async function refill(store: MemoryGameStore, playerId: string) {
  const player = await reload(store, playerId);
  player.energy = Math.max(player.maxEnergy, 20);
  player.hp = Math.max(player.hp, 1);
  await store.savePlayer(player);
}

async function hasItem(store: MemoryGameStore, playerId: string, templateId: string) {
  return (await store.listItems(playerId)).some((item) => item.templateId === templateId);
}

async function craftUntil(
  runtime: GameRuntime,
  store: MemoryGameStore,
  playerId: string,
  vkUserId: string,
  target: 'wooden_pickaxe' | 'stone_pickaxe',
) {
  for (let i = 0; i < 24; i += 1) {
    if (await hasItem(store, playerId, target)) return;
    const resources = await store.getResources(playerId);
    const table = await hasItem(store, playerId, 'crafting_table');
    const log = resources.LOG ?? 0;
    const plank = resources.PLANK ?? 0;
    const stick = resources.STICK ?? 0;
    const cobble = resources.COBBLESTONE ?? 0;

    let recipeId = '';
    if (!table) {
      if (plank >= 4) recipeId = 'crafting_table';
      else if (log >= 1) recipeId = 'planks';
      else recipeId = 'gather';
    } else if (stick < 2) {
      if (plank >= 2) recipeId = 'sticks';
      else if (log >= 1) recipeId = 'planks';
      else recipeId = 'gather';
    } else if (target === 'wooden_pickaxe') {
      if (plank < 3) recipeId = log >= 1 ? 'planks' : 'gather';
      else recipeId = 'wooden_pickaxe';
    } else if (cobble < 3) {
      recipeId = 'cobble';
    } else {
      recipeId = 'stone_pickaxe';
    }

    if (recipeId === 'gather') {
      const player = await reload(store, playerId);
      player.currentLocation = 'rem_camp';
      await store.savePlayer(player);
      await refill(store, playerId);
      await act(runtime, vkUserId, 'GATHER_WOOD');
      continue;
    }
    if (recipeId === 'cobble') {
      const player = await reload(store, playerId);
      player.currentLocation = 'stone_scree';
      await store.savePlayer(player);
      await refill(store, playerId);
      await act(runtime, vkUserId, 'GATHER_STONE');
      continue;
    }
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId });
  }
  expect(await hasItem(store, playerId, target)).toBe(true);
}

type GateHelp = 'stones' | 'boards' | 'mech' | 'ask';
type NightPlace = 'rem' | 'shelter';

interface PlayOptions {
  shrew?: 'fight' | 'flee' | 'distract' | 'skip';
  crate?: boolean;
  eatRuskEarly?: boolean;
  shelter?: boolean;
  feedScavenger?: boolean;
  showToken?: 'show' | 'hide' | 'none';
  gate?: GateHelp;
  loseCrawlerFirst?: boolean;
  secretChamber?: boolean;
  night?: NightPlace;
  nightChoice?: 'listen' | 'sleep';
  vkUserId?: string;
}

async function playToDay1Complete(options: PlayOptions = {}) {
  const {
    shrew = 'skip',
    crate = true,
    eatRuskEarly = false,
    shelter = false,
    feedScavenger = false,
    showToken = 'none',
    gate = 'stones',
    loseCrawlerFirst = false,
    secretChamber = false,
    night = 'rem',
    nightChoice = 'listen',
    vkUserId = `vk-${Math.random().toString(16).slice(2)}`,
  } = options;

  const { store, runtime, player, started } = await boot(vkUserId);
  const id = player.id;

  if (shrew === 'fight') {
    await choice(runtime, vkUserId, 'start', 'check_bushes');
    await act(runtime, vkUserId, 'START_PVE', { enemyId: 'wild_shrew' });
  } else if (shrew === 'flee') {
    await choice(runtime, vkUserId, 'start', 'check_bushes');
    await choice(runtime, vkUserId, 'check_bushes', 'flee');
  } else if (shrew === 'distract') {
    await choice(runtime, vkUserId, 'start', 'check_bushes');
    await choice(runtime, vkUserId, 'check_bushes', 'distract');
  }

  if (crate) {
    await act(runtime, vkUserId, 'OPEN_CRATE');
  }

  if (eatRuskEarly) {
    const current = await reload(store, id);
    current.energy = 10;
    await store.savePlayer(current);
    const rusk = (await store.listItems(id)).find((item) => item.templateId === 'dry_rusk');
    if (rusk) await act(runtime, vkUserId, 'USE_ITEM', { itemId: rusk.id });
  }

  const knife = (await store.listItems(id)).find((item) => item.templateId === 'stone_knife');
  if (knife) await act(runtime, vkUserId, 'EQUIP_ITEM', { itemId: knife.id });

  await refill(store, id);
  await act(runtime, vkUserId, 'GATHER_WOOD');
  if (shelter) {
    const logs = (await store.getResources(id)).LOG ?? 0;
    if (logs < 6) await act(runtime, vkUserId, 'GATHER_WOOD');
    await act(runtime, vkUserId, 'BUILD_TEMP_SHELTER');
  }

  await act(runtime, vkUserId, 'INSPECT_TOKEN');
  await choice(runtime, vkUserId, 'inspect_token', 'smoke');
  await choice(runtime, vkUserId, 'rem_gate', gate === 'ask' ? 'ask' : gate === 'mech' ? 'mech' : gate);
  if (gate === 'ask') {
    await choice(runtime, vkUserId, 'rem_help_ask', 'stones');
    await choice(runtime, vkUserId, 'rem_help_stones', 'next');
  } else if (gate === 'mech') {
    await choice(runtime, vkUserId, 'rem_mechanism_1', 'pull');
    await choice(runtime, vkUserId, 'rem_mechanism_2', 'next');
  } else if (gate === 'stones') {
    await choice(runtime, vkUserId, 'rem_help_stones', 'next');
  } else {
    await choice(runtime, vkUserId, 'rem_help_boards', 'next');
  }
  await choice(runtime, vkUserId, 'rem_gate_closed', 'accept');

  if (showToken === 'show') {
    await choice(runtime, vkUserId, 'rem_camp', 'show');
    await choice(runtime, vkUserId, 'rem_show_token', 'back');
  } else if (showToken === 'hide') {
    await choice(runtime, vkUserId, 'rem_camp', 'hide');
    await choice(runtime, vkUserId, 'rem_hide_token', 'back');
  }

  await choice(runtime, vkUserId, 'rem_camp', 'scree');

  if (feedScavenger) {
    await choice(runtime, vkUserId, 'stone_scree', 'scavenger');
    await act(runtime, vkUserId, 'FEED_SCAVENGER');
  }

  await refill(store, id);
  const backToRem = await reload(store, id);
  backToRem.currentLocation = 'rem_camp';
  await store.savePlayer(backToRem);
  await craftUntil(runtime, store, id, vkUserId, 'wooden_pickaxe');
  const toScree = await reload(store, id);
  toScree.currentLocation = 'stone_scree';
  await store.savePlayer(toScree);
  await craftUntil(runtime, store, id, vkUserId, 'stone_pickaxe');
  const currentLoc = await reload(store, id);
  currentLoc.currentLocation = 'rem_camp';
  await store.savePlayer(currentLoc);
  await choice(runtime, vkUserId, 'rem_camp', 'adit');

  await choice(runtime, vkUserId, 'old_adit', 'listen');
  await choice(runtime, vkUserId, 'adit_listen', 'back');

  await refill(store, id);
  if (loseCrawlerFirst) {
    const weak = await reload(store, id);
    weak.hp = 1;
    weak.stats = { ...weak.stats, dodge: 0 };
    await store.savePlayer(weak);
    for (let i = 0; i < 12; i += 1) {
      await refill(store, id);
      const before = await store.listItems(id);
      const fight = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'mine_crawler' }, `lose-crawler-${i}-${vkUserId}`);
      const after = await store.listItems(id);
      expect(after.map((item) => item.templateId).sort()).toEqual(before.map((item) => item.templateId).sort());
      if (fight.text.includes('падаешь') || fight.text.includes('приходишь в себя')) break;
      const again = await reload(store, id);
      again.hp = 1;
      await store.savePlayer(again);
    }
    const healed = await reload(store, id);
    healed.hp = healed.maxHp;
    await store.savePlayer(healed);
  }

  await refill(store, id);
  await act(runtime, vkUserId, 'START_PVE', { enemyId: 'mine_crawler' });

  await refill(store, id);
  let ore = (await store.getResources(id)).IRON_ORE ?? 0;
  let guard = 0;
  let lastIron = { text: '' };
  while (ore < 8 && guard < 10) {
    lastIron = await act(runtime, vkUserId, 'GATHER_IRON');
    ore = (await store.getResources(id)).IRON_ORE ?? 0;
    guard += 1;
  }

  if (secretChamber) {
    if (lastIron.text.includes('голубой свет')) {
      await choice(runtime, vkUserId, 'adit_blue_light', 'check');
    } else {
      await choice(runtime, vkUserId, 'old_adit', 'blue');
    }
    await act(runtime, vkUserId, 'OPEN_SECRET_CHEST');
    await act(runtime, vkUserId, 'MINE_BLUE_MINERAL');
    await choice(runtime, vkUserId, 'secret_blue_fail', 'leave');
  } else if (lastIron.text.includes('голубой свет')) {
    await choice(runtime, vkUserId, 'adit_blue_light', 'leave');
  }

  const beforeReturn = await reload(store, id);
  const oreBefore = (await store.getResources(id)).IRON_ORE ?? 0;
  await act(runtime, vkUserId, 'RETURN_IRON');
  const leftover = (await store.getResources(id)).IRON_ORE ?? 0;
  expect(leftover).toBe(Math.max(0, oreBefore - 8));

  const nightPlace: NightPlace = night === 'shelter' && shelter ? 'shelter' : 'rem';
  await act(runtime, vkUserId, 'REST_NIGHT', { place: nightPlace });
  if (nightPlace === 'rem') {
    await choice(runtime, vkUserId, 'night_rem', nightChoice === 'sleep' ? 'sleep' : 'listen');
    const node = nightChoice === 'sleep' ? 'night_rem_sleep' : 'night_rem_eavesdrop';
    const done = await choice(runtime, vkUserId, node, 'dawn');
    return { store, runtime, player: await reload(store, id), vkUserId, started, last: done, leftover, beforeReturn };
  }
  const nightNode = feedScavenger ? 'night_shelter_gift' : 'night_shelter';
  const done = await choice(runtime, vkUserId, nightNode, 'dawn');
  return { store, runtime, player: await reload(store, id), vkUserId, started, last: done, leftover, beforeReturn };
}

describe('day 1 crate and consumables', () => {
  it('1. opens crate only once', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'OPEN_CRATE');
    const firstItems = await store.listItems(player.id);
    await act(runtime, vkUserId, 'OPEN_CRATE');
    const secondItems = await store.listItems(player.id);
    expect(secondItems).toHaveLength(firstItems.length);
    const resources = await store.getResources(player.id);
    expect(resources.LOG).toBe(2);
    expect(resources.STONE ?? 0).toBe(0);
    expect(resources.WOOD ?? 0).toBe(0);
  });

  it('2. dry rusk restores energy and does not exceed max', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'OPEN_CRATE');
    const current = await reload(store, player.id);
    current.energy = 12;
    await store.savePlayer(current);
    const rusk = (await store.listItems(player.id)).find((item) => item.templateId === 'dry_rusk')!;
    const used = await act(runtime, vkUserId, 'USE_ITEM', { itemId: rusk.id });
    expect(used.text).toContain('+5 энерг');
    expect((await reload(store, player.id)).energy).toBe(17);
    expect((await store.listItems(player.id)).some((item) => item.id === rusk.id)).toBe(false);

    const extra = await store.createItem({ playerId: player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
    const full = await reload(store, player.id);
    full.energy = full.maxEnergy;
    await store.savePlayer(full);
    const refused = await act(runtime, vkUserId, 'USE_ITEM', { itemId: extra.id });
    expect(refused.text).toContain('максимуме');
    expect((await store.listItems(player.id)).some((item) => item.id === extra.id)).toBe(true);
  });
});

describe('day 1 shelter and token', () => {
  it('3. shelter cannot be built twice', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 12);
    const first = await act(runtime, vkUserId, 'BUILD_TEMP_SHELTER');
    expect(first.text).toContain('крыша');
    const second = await act(runtime, vkUserId, 'BUILD_TEMP_SHELTER');
    expect(second.text).toMatch(/уже/);
    expect((await store.getResources(player.id)).LOG).toBe(6);
  });

  it('4. rusty token is granted only once', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const first = await act(runtime, vkUserId, 'GATHER_WOOD');
    expect(first.text).toContain('ржавый жетон');
    const second = await act(runtime, vkUserId, 'GATHER_WOOD');
    expect(second.text).not.toContain('ржавый жетон');
    const items = (await store.listItems(player.id)).filter((item) => item.templateId === 'rusty_token');
    expect(items).toHaveLength(1);
  });

  it('5. inspect token sets activated_node7_token', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'GATHER_WOOD');
    const inspected = await act(runtime, vkUserId, 'INSPECT_TOKEN');
    expect(inspected.text).toContain('Узел 7');
    expect(inspected.text).toContain('Не буди шахту');
    const flags = await store.getFlags(player.id);
    expect(flags.activated_node7_token).toBe('1');
    expect(flags.found_rusty_token).toBe('1');
  });
});

describe('day 1 scavenger', () => {
  it('6-7. feeding works once and affinity does not farm', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'stone_scree';
    await store.savePlayer(player);
    const rusk = await store.createItem({ playerId: player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
    const extra = await store.createItem({ playerId: player.id, templateId: 'dry_rusk', rarity: 'COMMON' });
    void rusk;
    const fed = await act(runtime, vkUserId, 'FEED_SCAVENGER');
    expect(fed.text).toContain('сухарь');
    const flags = await store.getFlags(player.id);
    expect(flags.fed_stone_scavenger).toBe('1');
    expect(flags.stone_scavenger_affinity).toBe('1');
    const again = await act(runtime, vkUserId, 'FEED_SCAVENGER');
    expect(again.text).toContain('сыт');
    expect((await store.listItems(player.id)).filter((item) => item.templateId === 'dry_rusk')).toHaveLength(1);
    expect((await store.listItems(player.id)).some((item) => item.id === extra.id)).toBe(true);
  });
});

describe('day 1 mine', () => {
  it('8. old adit is locked before pickaxe and quest', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'GATHER_IRON');
    expect(denied.text).toContain('нельзя');
  });

  it('9. mine crawler combat is deterministic for the same seed', () => {
    const playerSnap = {
      id: 'p',
      name: 'Путник',
      hp: 100,
      maxHp: 100,
      attack: 8,
      defense: 0,
      speed: 15,
      critChance: 5,
      critDamage: 150,
      dodge: 13,
      accuracy: 95,
      luck: 0,
      minDamage: 3,
      maxDamage: 5,
    };
    const enemy = ENEMIES.mine_crawler;
    const enemySnap = {
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
    };
    const a = simulateBattle({ player: playerSnap, enemy: enemySnap, seed: 'crawler-seed', balanceVersion: '0.0.2' });
    const b = simulateBattle({ player: playerSnap, enemy: enemySnap, seed: 'crawler-seed', balanceVersion: '0.0.2' });
    expect(a).toEqual(b);
    expect(a.events.length).toBeGreaterThan(0);
  });

  it('10. mine crawler defeat does not delete items', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'old_adit';
    player.hp = 1;
    player.stats = { ...player.stats, dodge: 0 };
    await store.savePlayer(player);
    await store.createItem({ playerId: player.id, templateId: 'stone_pickaxe', rarity: 'COMMON' });
    await store.createItem({ playerId: player.id, templateId: 'stone_knife', rarity: 'COMMON' });
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    const before = (await store.listItems(player.id)).map((item) => item.templateId).sort();
    let lost = false;
    for (let i = 0; i < 15; i += 1) {
      const weak = await reload(store, player.id);
      weak.hp = 1;
      weak.energy = Math.max(weak.maxEnergy, 4);
      await store.savePlayer(weak);
      const fight = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'mine_crawler' }, `defeat-${i}`);
      const after = (await store.listItems(player.id)).map((item) => item.templateId).sort();
      expect(after).toEqual(before);
      if (fight.text.includes('падаешь') || fight.text.includes('приходишь в себя')) {
        lost = true;
        expect(fight.text).toContain('Предметы при тебе');
        break;
      }
    }
    expect(lost).toBe(true);
  });
});

describe('day 1 quest chest mineral trust xp', () => {
  it('11. iron quest accepts exactly once and keeps leftover', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    await store.addResource(player.id, 'IRON_ORE', 10);
    const first = await act(runtime, vkUserId, 'RETURN_IRON');
    expect(first.text).toContain('восемь');
    expect((await store.getResources(player.id)).IRON_ORE).toBe(2);
    expect((await store.getPlayerQuest(player.id, 'iron_for_gate'))?.status).toBe('CLAIMED');
    const second = await act(runtime, vkUserId, 'RETURN_IRON');
    expect(second.text).toMatch(/уже|нельзя/);
    expect((await store.getResources(player.id)).IRON_ORE).toBe(2);
  });

  it('12. secret chest only once', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'secret_chamber';
    await store.savePlayer(player);
    await store.setFlag(player.id, 'found_blue_light', '1');
    const first = await act(runtime, vkUserId, 'OPEN_SECRET_CHEST');
    expect(first.text).toContain('пояс');
    const belts = (await store.listItems(player.id)).filter((item) => item.templateId === 'miner_belt');
    expect(belts).toHaveLength(1);
    expect(belts[0]?.rarity).toBe('UNCOMMON');
    const second = await act(runtime, vkUserId, 'OPEN_SECRET_CHEST');
    expect(second.text).toMatch(/пуст|уже/);
    expect((await store.listItems(player.id)).filter((item) => item.templateId === 'miner_belt')).toHaveLength(1);
  });

  it('13. blue mineral cannot be mined with stone pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'secret_chamber';
    await store.savePlayer(player);
    await store.setFlag(player.id, 'found_blue_light', '1');
    await store.createItem({ playerId: player.id, templateId: 'stone_pickaxe', rarity: 'COMMON' });
    const mined = await act(runtime, vkUserId, 'MINE_BLUE_MINERAL');
    expect(mined.text).toContain('царапины');
    const flags = await store.getFlags(player.id);
    expect(flags.unknown_blue_mineral).toBe('1');
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'blue_mineral')).toBe(false);
  });

  it('14. rem trust changes on show and hide', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'found_rusty_token', '1');
    await store.setFlag(player.id, 'met_rem', '1');
    await store.setFlag(player.id, 'activated_node7_token', '1');
    await store.setFlag(player.id, 'node7_gate_closed', '1');
    player.currentLocation = 'rem_camp';
    player.currentState = 'rem_camp';
    await store.savePlayer(player);
    await choice(runtime, vkUserId, 'rem_camp', 'show');
    await choice(runtime, vkUserId, 'rem_show_token', 'back');
    expect((await store.getNpcRelation(player.id, 'rem')).trust).toBe(1);
    expect((await store.getFlags(player.id)).showed_token_to_rem).toBe('1');

    const other = await boot();
    await other.store.setFlag(other.player.id, 'found_rusty_token', '1');
    await other.store.setFlag(other.player.id, 'met_rem', '1');
    await other.store.setFlag(other.player.id, 'activated_node7_token', '1');
    await other.store.setFlag(other.player.id, 'node7_gate_closed', '1');
    other.player.currentLocation = 'rem_camp';
    other.player.currentState = 'rem_camp';
    await other.store.savePlayer(other.player);
    await choice(other.runtime, other.vkUserId, 'rem_camp', 'hide');
    await choice(other.runtime, other.vkUserId, 'rem_hide_token', 'back');
    expect((await other.store.getNpcRelation(other.player.id, 'rem')).trust).toBe(-1);
  });

  it('15. level 2 is reached from iron quest XP alone', async () => {
    expect(XP_TO_LEVEL_2).toBe(40);
    const { store, runtime, player, vkUserId } = await boot();
    expect(player.level).toBe(1);
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    await store.addResource(player.id, 'IRON_ORE', 8);
    const done = await act(runtime, vkUserId, 'RETURN_IRON');
    expect(done.text).toContain('Уровень 2');
    const after = await reload(store, player.id);
    expect(after.level).toBe(2);
    expect(after.maxHp).toBe(105);
    expect(after.maxEnergy).toBe(21);
    expect(after.hp).toBe(105);
    expect(after.xp).toBeGreaterThanOrEqual(40);
  });
});

describe('day 1 night and rewards', () => {
  it('16-19. night branches, scavenger gift and no gift otherwise', async () => {
    const withGift = await playToDay1Complete({
      crate: true,
      shelter: true,
      feedScavenger: true,
      night: 'shelter',
    });
    expect(withGift.last.text).toContain('Первый день окончен');
    expect((await withGift.store.getFlags(withGift.player.id)).slept_at_shelter).toBe('1');
    expect((await withGift.store.getResources(withGift.player.id)).SHINY_STONE).toBe(1);

    const noGift = await playToDay1Complete({
      crate: true,
      shelter: true,
      feedScavenger: false,
      night: 'shelter',
    });
    expect((await noGift.store.getResources(noGift.player.id)).SHINY_STONE ?? 0).toBe(0);
    expect((await noGift.store.getFlags(noGift.player.id)).slept_at_shelter).toBe('1');

    const remNight = await playToDay1Complete({
      crate: true,
      shelter: false,
      night: 'rem',
      nightChoice: 'listen',
    });
    const remFlags = await remNight.store.getFlags(remNight.player.id);
    expect(remFlags.slept_at_rem).toBe('1');
    expect(remFlags.night_eavesdropped).toBe('1');
    expect(remNight.last.text).toContain('Первый день окончен');
    expect((await remNight.store.getResources(remNight.player.id)).SHINY_STONE ?? 0).toBe(0);
  });

  it('17. night without shelter hides the shelter option', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'CLAIMED',
      progress: {},
    });
    await store.setFlag(player.id, 'met_rem', '1');
    player.currentLocation = 'rem_camp';
    player.currentState = 'rem_quest_done';
    await store.savePlayer(player);
    const node = await act(runtime, vkUserId, 'EXPLORE');
    const labels = node.buttons.map((button) => button.label);
    expect(labels.some((label) => label.includes('укрытие'))).toBe(false);
  });

  it('20. Day 1 survivor pack is granted only once', async () => {
    const run = await playToDay1Complete({ crate: true, night: 'rem' });
    const coinsAfter = (await reload(run.store, run.player.id)).coins;
    expect(run.last.text).toContain('+50 монет');
    expect((await run.store.getResources(run.player.id)).FOOD).toBe(2);
    expect(await run.store.hasRewardClaim(run.player.id, 'day1', 'survivor_pack')).toBe(true);
    const again = await act(run.runtime, run.vkUserId, 'START_GAME');
    expect(again.text).toContain('Первый день окончен');
    expect((await reload(run.store, run.player.id)).coins).toBe(coinsAfter);
  });
});

describe('day 1 validation idempotency branches persist', () => {
  it('21. stale and invalid actions are rejected', async () => {
    const { runtime, vkUserId } = await boot();
    const iron = await act(runtime, vkUserId, 'GATHER_IRON');
    expect(iron.text).toContain('нельзя');
    const ret = await act(runtime, vkUserId, 'RETURN_IRON');
    expect(ret.text).toContain('нельзя');
    const chest = await act(runtime, vkUserId, 'OPEN_SECRET_CHEST');
    expect(chest.text).toContain('нельзя');
    const day2 = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(day2.text).toContain('нельзя');

    const afterToken = await boot();
    await act(afterToken.runtime, afterToken.vkUserId, 'GATHER_WOOD');
    await act(afterToken.runtime, afterToken.vkUserId, 'INSPECT_TOKEN');
    const stale = await choice(afterToken.runtime, afterToken.vkUserId, 'start', 'go_smoke_early');
    expect(stale.text).toContain('недоступен');
  });

  it('22. duplicate callback remains idempotent', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    await store.addResource(player.id, 'IRON_ORE', 8);
    const first = await act(runtime, vkUserId, 'RETURN_IRON', {}, 'return-dup');
    const second = await act(runtime, vkUserId, 'RETURN_IRON', {}, 'return-dup');
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).IRON_ORE).toBe(0);
  });

  it('23. all main Day 1 branches can finish', async () => {
    const variants: PlayOptions[] = [
      { shrew: 'fight', crate: true, night: 'rem', gate: 'stones' },
      { shrew: 'flee', crate: true, night: 'rem', gate: 'boards' },
      { shrew: 'skip', crate: true, eatRuskEarly: true, feedScavenger: false, night: 'rem', gate: 'mech' },
      { shrew: 'skip', crate: true, shelter: false, showToken: 'hide', secretChamber: false, night: 'rem' },
      { shrew: 'skip', crate: true, shelter: true, feedScavenger: true, showToken: 'show', secretChamber: true, night: 'shelter' },
      { shrew: 'skip', crate: true, loseCrawlerFirst: true, night: 'rem' },
    ];
    for (const variant of variants) {
      const run = await playToDay1Complete(variant);
      const flags = await run.store.getFlags(run.player.id);
      expect(flags.day_1_complete).toBe('1');
      expect(run.player.level).toBe(2);
      expect(run.last.text).toContain('Первый день окончен');
      const day2 = await act(run.runtime, run.vkUserId, 'BEGIN_DAY_2');
      expect(day2.text).toMatch(/стан|Затвор держит/i);
      expect(day2.text).not.toContain('Продолжение скоро будет доступно');
    }
  });

  it('24. progress persists after restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kubolesie-'));
    const filePath = join(dir, 'memory-store.json');
    try {
      const store = await MemoryGameStore.load(filePath);
      const runtime = new GameRuntime(store);
      const vkUserId = 'vk-persist';
      await runtime.handle(event('START_GAME', {}, 'p-start', vkUserId));
      const player = (await store.findPlayerByVkUserId(vkUserId))!;
      await runtime.handle(event('OPEN_CRATE', {}, 'p-crate', vkUserId));
      await runtime.handle(event('GATHER_WOOD', {}, 'p-wood', vkUserId));
      await runtime.handle(event('INSPECT_TOKEN', {}, 'p-token', vkUserId));
      await store.persist();

      const restored = await MemoryGameStore.load(filePath);
      const again = new GameRuntime(restored);
      const loaded = (await restored.findPlayerByVkUserId(vkUserId))!;
      const flags = await restored.getFlags(loaded.id);
      expect(flags.opened_start_crate).toBe('1');
      expect(flags.found_rusty_token).toBe('1');
      expect(flags.activated_node7_token).toBe('1');
      expect((await restored.getResources(loaded.id)).LOG).toBeGreaterThanOrEqual(6);
      expect((await restored.listItems(loaded.id)).some((item) => item.templateId === 'stone_knife')).toBe(true);
      const resumed = await again.handle(event('START_GAME', {}, 'p-resume', vkUserId));
      expect(resumed.state?.playerId).toBe(loaded.id);
      expect(resumed.text).not.toContain('Ты приходишь в себя на холодной земле.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('day 1 crafting pipeline', () => {
  it('cannot gather cobblestone without a wooden pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'stone_scree';
    await store.savePlayer(player);
    const denied = await act(runtime, vkUserId, 'GATHER_STONE');
    expect(denied.text).toContain('нельзя');
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);
    expect((await store.getResources(player.id)).STONE ?? 0).toBe(0);
  });

  it('wooden pickaxe cannot mine iron', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    player.currentLocation = 'old_adit';
    await store.savePlayer(player);
    await store.createItem({ playerId: player.id, templateId: 'wooden_pickaxe', rarity: 'COMMON' });
    await store.upsertPlayerQuest({
      playerId: player.id,
      questId: 'iron_for_gate',
      status: 'ACTIVE',
      progress: {},
    });
    const denied = await act(runtime, vkUserId, 'GATHER_IRON');
    expect(denied.text).toContain('нельзя');
    expect((await store.getResources(player.id)).IRON_ORE ?? 0).toBe(0);
  });

  it('WOOD + STONE never crafts a stone pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'WOOD', 20);
    await store.addResource(player.id, 'STONE', 20);
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
    const attempt = await act(runtime, vkUserId, 'CRAFT_ITEM', { templateId: 'stone_pickaxe' });
    expect(attempt.text).toMatch(/Не хватает|верстак/);
    expect((await store.listItems(player.id)).some((item) => item.templateId === 'stone_pickaxe')).toBe(false);
  });

  it('walks LOG → PLANK → STICK → table → wooden pickaxe → cobble → stone pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 3);
    await craftUntil(runtime, store, player.id, vkUserId, 'wooden_pickaxe');
    expect(await hasItem(store, player.id, 'crafting_table')).toBe(true);
    expect(await hasItem(store, player.id, 'wooden_pickaxe')).toBe(true);
    const afterWood = await store.getResources(player.id);
    expect(afterWood.WOOD ?? 0).toBe(0);
    expect(afterWood.STONE ?? 0).toBe(0);

    const loc = await reload(store, player.id);
    loc.currentLocation = 'stone_scree';
    await store.savePlayer(loc);
    await craftUntil(runtime, store, player.id, vkUserId, 'stone_pickaxe');
    expect(await hasItem(store, player.id, 'stone_pickaxe')).toBe(true);
    const afterStone = await store.getResources(player.id);
    expect(afterStone.COBBLESTONE ?? 0).toBeGreaterThanOrEqual(0);
    expect(afterStone.STONE ?? 0).toBe(0);
  });
});

describe('day 1 content contracts', () => {
  it('stone knife is the strongest starting weapon', () => {
    expect(ITEM_TEMPLATES.stone_knife.minDamage).toBe(3);
    expect(ITEM_TEMPLATES.stone_knife.maxDamage).toBe(5);
    expect(ITEM_TEMPLATES.stone_axe.maxDamage).toBe(4);
    expect(ITEM_TEMPLATES.stone_pickaxe.maxDamage).toBe(3);
    expect(ITEM_TEMPLATES.wooden_pickaxe.oreYieldBonus ?? 0).toBe(0);
    expect(ITEM_TEMPLATES.stone_pickaxe.oreYieldBonus).toBe(0.3);
  });

  it('START_GAME shows HUD and three start choices', async () => {
    const { started } = await boot();
    expect(started.text).toContain('HP ');
    expect(started.text).toContain('Энергия');
    expect(started.text).toContain('Монеты');
    expect(started.text).toContain('Ты приходишь в себя на холодной земле.');
    expect(started.buttons.map((button) => button.label)).toEqual([
      'Осмотреть разбитый ящик',
      'Пойти к дыму',
      'Проверить кусты',
    ]);
  });

  it('combat response includes a short readable log', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const fight = await act(runtime, vkUserId, 'START_PVE', { enemyId: 'wild_shrew' });
    expect(fight.text).toContain('Бой начался');
    expect(fight.text.length).toBeLessThan(1200);
    void store;
    void player;
  });
});
