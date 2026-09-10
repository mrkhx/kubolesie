import { describe, expect, it } from 'vitest';
import {
  CAMP_QUEST_XP,
  CRAFT_RECIPES,
  ITEM_TEMPLATES,
  LOCATIONS,
  QUEST_TEMPLATES,
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
  vkUserId = 'vk-day2',
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

function labels(response: { buttons: Array<{ label: string }> }) {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: { buttons: Array<{ label: string }> }, part: string) {
  return labels(response).some((label) => label.includes(part));
}

interface SeedOpts {
  shelter?: boolean;
  feed?: boolean;
  hostile?: boolean;
  eavesdrop?: boolean;
  sleep?: boolean;
  showToken?: boolean;
  hideToken?: boolean;
  table?: boolean;
  pickaxe?: boolean;
  lantern?: boolean;
  log?: number;
  stick?: number;
  plank?: number;
  coal?: number;
}

async function seedDay1Complete(opts: SeedOpts = {}) {
  const { store, runtime, player, vkUserId, started } = await boot();
  const flags = [
    'day_1_complete',
    'met_rem',
    'node7_gate_closed',
    'activated_node7_token',
    'found_rusty_token',
    'opened_start_crate',
  ];
  if (opts.shelter) flags.push('temporary_shelter_level', 'slept_at_shelter');
  else flags.push('slept_at_rem');
  if (opts.eavesdrop) flags.push('night_eavesdropped');
  if (opts.sleep) flags.push('night_pretended_sleep');
  if (opts.showToken) flags.push('showed_token_to_rem');
  if (opts.hideToken) flags.push('hid_token_from_rem');
  if (opts.feed) flags.push('fed_stone_scavenger', 'stone_scavenger_affinity');
  if (opts.hostile) flags.push('defeated_stone_scavenger');
  for (const flag of flags) await store.setFlag(player.id, flag, '1');

  player.level = 2;
  player.xp = 40;
  player.maxHp = 105;
  player.hp = 105;
  player.maxEnergy = 21;
  player.energy = 21;
  player.coins = 75;
  player.currentLocation = opts.shelter ? 'forest_clearing' : 'rem_camp';
  player.currentState = 'day1_complete';
  await store.savePlayer(player);

  if (opts.table !== false) {
    await store.createItem({ playerId: player.id, templateId: 'crafting_table', rarity: 'COMMON' });
  }
  if (opts.pickaxe !== false) {
    await store.createItem({ playerId: player.id, templateId: 'wooden_pickaxe', rarity: 'COMMON' });
    await store.createItem({ playerId: player.id, templateId: 'stone_pickaxe', rarity: 'COMMON' });
  }
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
  await store.addResource(player.id, 'LOG', opts.log ?? 4);
  await store.addResource(player.id, 'STICK', opts.stick ?? 4);
  await store.addResource(player.id, 'PLANK', opts.plank ?? 2);
  await store.addResource(player.id, 'IRON_ORE', 1);
  if (opts.coal) await store.addResource(player.id, 'COAL', opts.coal);
  return { store, runtime, player: await reload(store, player.id), vkUserId, started };
}

async function startCamp(opts: SeedOpts = {}, onShelter = false) {
  const seeded = await seedDay1Complete(opts);
  await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_2');
  await act(seeded.runtime, seeded.vkUserId, 'FOUND_CAMP', { onShelter });
  seeded.player = await reload(seeded.store, seeded.player.id);
  return seeded;
}

async function itemCount(store: MemoryGameStore, playerId: string, templateId: string) {
  return (await store.listItems(playerId)).filter((item) => item.templateId === templateId).length;
}

describe('day 2 start', () => {
  it('1. BEGIN_DAY_2 is available only after day_1_complete', async () => {
    const { runtime, vkUserId } = await boot();
    const denied = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(denied.text).toContain('нельзя');

    const seeded = await seedDay1Complete();
    const started = await act(seeded.runtime, seeded.vkUserId, 'BEGIN_DAY_2');
    expect(started.text).toMatch(/стан|Затвор держит/i);
  });

  it('2. Day 2 starts instead of the stub', async () => {
    const { runtime, vkUserId } = await seedDay1Complete();
    const day2 = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(day2.text).toContain('Затвор держит');
    expect(day2.text).toContain('свой стан');
    expect(day2.text).not.toContain('Продолжение скоро будет доступно');
    expect(hasLabel(day2, 'клетку') || day2.buttons.some((button) => button.action === 'FOUND_CAMP')).toBe(true);
  });

  it('3. player_camp is created on FOUND_CAMP', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete();
    await act(runtime, vkUserId, 'BEGIN_DAY_2');
    const founded = await act(runtime, vkUserId, 'FOUND_CAMP', { onShelter: false });
    const after = await reload(store, player.id);
    expect(after.currentLocation).toBe('player_camp');
    expect((await store.getFlags(player.id)).player_camp_founded).toBe('1');
    expect((await store.getFlags(player.id)).camp_on_shelter).toBeUndefined();
    expect(founded.text).toMatch(/клетка|стан/i);
    expect(LOCATIONS.player_camp.name).toBe('Свой стан');
  });

  it('4. Day 1 state is preserved', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete({ lantern: true });
    const before = {
      coins: player.coins,
      level: player.level,
      xp: player.xp,
      ore: (await store.getResources(player.id)).IRON_ORE,
      items: (await store.listItems(player.id)).map((item) => item.templateId).sort(),
    };
    await act(runtime, vkUserId, 'BEGIN_DAY_2');
    await act(runtime, vkUserId, 'FOUND_CAMP');
    const after = await reload(store, player.id);
    expect(after.level).toBe(before.level);
    expect(after.xp).toBe(before.xp);
    expect(after.coins).toBe(before.coins);
    expect((await store.getResources(player.id)).IRON_ORE).toBe(before.ore);
    expect((await store.listItems(player.id)).map((item) => item.templateId).sort()).toEqual(before.items);
    const flags = await store.getFlags(player.id);
    expect(flags.day_1_complete).toBe('1');
    expect(flags.node7_gate_closed).toBe('1');
    expect(flags.found_rusty_token).toBe('1');
  });
});

describe('day 2 camp table and chest', () => {
  it('5. existing crafting table is not duplicated', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(1);
    await store.addResource(player.id, 'PLANK', 8);
    const second = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'crafting_table' });
    expect(second.text).toMatch(/уже есть|Поставь/i);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(1);
  });

  it('6. table can be placed', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    const placed = await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    expect(placed.text).toMatch(/Верстак стоит на земле/i);
    expect((await store.getFlags(player.id)).camp_table_placed).toBe('1');
  });

  it('7. camp_table_placed is idempotent', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    const first = await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    const second = await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    expect(second.text).toMatch(/уже/i);
    expect((await store.getFlags(player.id)).camp_table_placed).toBe('1');
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(1);
    expect(await store.hasRewardClaim(player.id, 'structure', 'camp_table')).toBe(true);
    void first;
  });

  it('8. chest requires 8 PLANK', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ plank: 7 });
    const denied = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'chest' });
    expect(denied.text).toMatch(/Не хватает|доск/i);
    expect((await store.getFlags(player.id)).camp_chest_built).toBeUndefined();
    expect(await itemCount(store, player.id, 'chest')).toBe(0);

    await store.addResource(player.id, 'PLANK', 1);
    const built = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'chest' });
    expect(built.text).toContain('Сундук');
    expect((await store.getFlags(player.id)).camp_chest_built).toBe('1');
    expect((await store.getResources(player.id)).PLANK).toBe(0);
    expect(CRAFT_RECIPES.chest.cost).toEqual({ PLANK: 8 });
  });

  it('9. chest is optional for Day 2', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1 });
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const flags = await store.getFlags(player.id);
    expect(flags.camp_chest_built).toBeUndefined();
    expect(flags.day_2_complete).toBe('1');
    expect(done.text).toMatch(/Стан стоит|Продолжение скоро/i);
  });
});

describe('day 2 coal', () => {
  it('10. coal cannot be mined by hand', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ pickaxe: false });
    player.currentLocation = 'soot_fissure';
    await store.savePlayer(player);
    const energy = (await reload(store, player.id)).energy;
    const denied = await act(runtime, vkUserId, 'GATHER_COAL');
    expect(denied.text).toMatch(/Голыми руками|деревянная кирка/i);
    expect((await store.getResources(player.id)).COAL ?? 0).toBe(0);
    expect((await reload(store, player.id)).energy).toBe(energy);
  });

  it('11. coal can be mined with a wooden pickaxe', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    player.currentLocation = 'soot_fissure';
    await store.savePlayer(player);
    await store.setFlag(player.id, 'seen_soot_fissure', '1');
    const mined = await act(runtime, vkUserId, 'GATHER_COAL');
    expect(mined.text).toMatch(/угля/i);
    expect((await store.getResources(player.id)).COAL ?? 0).toBeGreaterThanOrEqual(2);
    expect((await store.getFlags(player.id)).found_coal).toBe('1');
  });

  it('12. coal yields 2–4', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    player.currentLocation = 'soot_fissure';
    await store.savePlayer(player);
    const amounts: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const before = (await store.getResources(player.id)).COAL ?? 0;
      await act(runtime, vkUserId, 'GATHER_COAL', {}, `coal-range-${i}`);
      const after = (await store.getResources(player.id)).COAL ?? 0;
      amounts.push(after - before);
      const fresh = await reload(store, player.id);
      fresh.energy = 21;
      await store.savePlayer(fresh);
    }
    expect(amounts.every((amount) => amount >= 2 && amount <= 4)).toBe(true);
    expect(new Set(amounts).size).toBeGreaterThan(1);
  });

  it('13. coal spends 2 energy', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    player.currentLocation = 'soot_fissure';
    player.energy = 10;
    await store.savePlayer(player);
    await act(runtime, vkUserId, 'GATHER_COAL');
    expect((await reload(store, player.id)).energy).toBe(8);
  });

  it('14. impossible gather does not spend energy', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ pickaxe: false });
    player.currentLocation = 'soot_fissure';
    player.energy = 9;
    await store.savePlayer(player);
    await act(runtime, vkUserId, 'GATHER_COAL');
    expect((await reload(store, player.id)).energy).toBe(9);

    const withPick = await startCamp();
    withPick.player.currentLocation = 'player_camp';
    withPick.player.energy = 9;
    await withPick.store.savePlayer(withPick.player);
    await act(withPick.runtime, withPick.vkUserId, 'GATHER_COAL');
    expect((await reload(withPick.store, withPick.player.id)).energy).toBe(9);
  });
});

describe('day 2 campfire and torch', () => {
  it('15. campfire requires 3 LOG + 3 STICK + 1 COAL', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 0 });
    const noCoal = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    expect(noCoal.text).toMatch(/Не хватает/i);
    expect((await store.getFlags(player.id)).camp_fire_built).toBeUndefined();

    await store.addResource(player.id, 'COAL', 1);
    const built = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    expect(built.text).toContain('Костёр');
    const resources = await store.getResources(player.id);
    expect(resources.LOG).toBe(0);
    expect(resources.STICK).toBe(0);
    expect(resources.COAL).toBe(0);
    const flags = await store.getFlags(player.id);
    expect(flags.camp_fire_built).toBe('1');
    expect(flags.camp_lit).toBe('1');
    expect(CRAFT_RECIPES.campfire.cost).toEqual({ LOG: 3, STICK: 3, COAL: 1 });
  });

  it('16. camp_on_shelter campfire costs 2 LOG + 3 STICK + 1 COAL', async () => {
    const { store, runtime, player, vkUserId } = await startCamp(
      { shelter: true, log: 2, stick: 3, coal: 1 },
      true,
    );
    expect((await store.getFlags(player.id)).camp_on_shelter).toBe('1');
    const built = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    expect(built.text).toContain('Костёр');
    const resources = await store.getResources(player.id);
    expect(resources.LOG).toBe(0);
    expect(resources.STICK).toBe(0);
    expect(resources.COAL).toBe(0);
  });

  it('17. torch is 1 COAL + 1 STICK → 4', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ stick: 1, coal: 1 });
    const made = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'torch' });
    expect(made.text).toMatch(/Факел ×4|Факел/i);
    expect(await itemCount(store, player.id, 'torch')).toBe(4);
    const resources = await store.getResources(player.id);
    expect(resources.COAL).toBe(0);
    expect(resources.STICK).toBe(0);
    expect((await store.getFlags(player.id)).camp_lit).toBeUndefined();
    expect(CRAFT_RECIPES.torch).toMatchObject({
      cost: { COAL: 1, STICK: 1 },
      output: { kind: 'item', templateId: 'torch', amount: 4 },
    });
  });

  it('18. broken_lantern is not repaired', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ lantern: true, coal: 4, stick: 4 });
    const lantern = (await store.listItems(player.id)).find((item) => item.templateId === 'broken_lantern')!;
    const used = await act(runtime, vkUserId, 'USE_ITEM', { itemId: lantern.id });
    expect(used.text).toMatch(/Вел носит стёкла/i);
    expect(await itemCount(store, player.id, 'broken_lantern')).toBe(1);
    expect(await itemCount(store, player.id, 'lit_lantern')).toBe(0);
    expect(CRAFT_RECIPES.glass).toBeUndefined();
    expect(CRAFT_RECIPES.smelt_iron).toBeUndefined();
  });

  it('owning coal does not light the camp', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ coal: 4 });
    expect((await store.getFlags(player.id)).camp_lit).toBeUndefined();
    const denied = await act(runtime, vkUserId, 'LIGHT_CAMP');
    expect(denied.text).toMatch(/Нечем светить|костёр или факел/i);
    expect((await store.getFlags(player.id)).camp_lit).toBeUndefined();
  });
});

describe('day 2 scavenger, rem, ridge', () => {
  it('19. scavenger visit works only on the fed branch', async () => {
    const fed = await startCamp({ feed: true });
    const visit = await act(fed.runtime, fed.vkUserId, 'EXPLORE');
    expect(visit.text).toMatch(/падальщик/i);
    expect((await fed.store.getFlags(fed.player.id)).scavenger_day2_visit).toBe('1');

    const ignored = await startCamp({ feed: false });
    const look = await act(ignored.runtime, ignored.vkUserId, 'EXPLORE');
    expect(look.text).not.toMatch(/падальщик сидит/i);
    expect((await ignored.store.getFlags(ignored.player.id)).scavenger_day2_visit).toBeUndefined();
    expect(hasLabel(look, 'Падальщик')).toBe(false);
  });

  it('20. scavenger cache cannot be received twice', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ feed: true });
    await act(runtime, vkUserId, 'EXPLORE');
    const first = await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType: 'gift', rewardRef: 'scavenger_cache' });
    expect(first.text).toMatch(/булыжника|тайник/i);
    expect((await store.getResources(player.id)).COBBLESTONE).toBe(2);
    expect((await store.getFlags(player.id)).scavenger_cache).toBe('1');
    const second = await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType: 'gift', rewardRef: 'scavenger_cache' });
    expect(second.text).toMatch(/уже получена/i);
    expect((await store.getResources(player.id)).COBBLESTONE).toBe(2);
  });

  it('21. hostile scavenger does not block Day 2', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({
      hostile: true,
      log: 3,
      stick: 3,
      coal: 1,
    });
    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(look.text).not.toMatch(/падальщик сидит/i);
    const cache = await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType: 'gift', rewardRef: 'scavenger_cache' });
    expect(cache.text).toMatch(/не оставляет|нельзя/i);
    expect((await store.getResources(player.id)).COBBLESTONE ?? 0).toBe(0);
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    expect((await store.getFlags(player.id)).day_2_complete).toBe('1');
    expect(done.text).toMatch(/Стан стоит|Продолжение/i);
  });

  it('22. night_eavesdropped opens the Rem night question', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ eavesdrop: true });
    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(hasLabel(rem, 'разговор ночью')).toBe(true);
    const asked = await choice(runtime, vkUserId, 'rem_day2', 'night');
    expect(asked.text).toMatch(/Сон/i);
    await choice(runtime, vkUserId, 'rem_day2_night', 'back');
    expect((await store.getFlags(player.id)).pressed_rem_about_night).toBe('1');
    const again = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(hasLabel(again, 'разговор ночью')).toBe(false);
  });

  it('23. night_pretended_sleep does not open a false question', async () => {
    const { runtime, vkUserId } = await startCamp({ sleep: true, eavesdrop: false });
    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(hasLabel(rem, 'разговор ночью')).toBe(false);
    expect(rem.text).toMatch(/Рем|затвор|глины/i);
    expect(rem.text).not.toMatch(/печат/i);
  });

  it('24. seen_ridge_tracks is set correctly', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(hasLabel(look, 'Следы')).toBe(true);
    const tracks = await choice(runtime, vkUserId, 'camp_look', 'ridge');
    expect(tracks.text).toMatch(/отпечатки|ступня/i);
    await choice(runtime, vkUserId, 'ridge_tracks', 'back');
    expect((await store.getFlags(player.id)).seen_ridge_tracks).toBe('1');
    const again = await act(runtime, vkUserId, 'EXPLORE');
    expect(hasLabel(again, 'Следы')).toBe(false);
  });
});

describe('day 2 quest, menus, safety', () => {
  it('25. found_a_camp completes without a chest', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1, plank: 0 });
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const quest = (await store.listPlayerQuests(player.id)).find((row) => row.questId === 'found_a_camp');
    expect(quest?.status).toBe('CLAIMED');
    expect((await store.getFlags(player.id)).camp_chest_built).toBeUndefined();
    expect(QUEST_TEMPLATES.some((questTemplate) => questTemplate.id === 'found_a_camp')).toBe(true);
    expect(CAMP_QUEST_XP).toBe(30);
  });

  it('26. day_2_complete is set and grants XP once', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1 });
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const xpBefore = (await reload(store, player.id)).xp;
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    expect((await store.getFlags(player.id)).day_2_complete).toBe('1');
    expect(done.text).toContain(`+${CAMP_QUEST_XP} XP`);
    expect((await reload(store, player.id)).xp).toBe(xpBefore + CAMP_QUEST_XP);
    const again = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    expect((await reload(store, player.id)).xp).toBe(xpBefore + CAMP_QUEST_XP);
    expect(again.text).toMatch(/Продолжение скоро будет доступно/i);
  });

  it('27. Day 3 is gated until Day 2 is complete', async () => {
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_3')).toBe(true);
    expect(LOCATIONS.ashen_wedge).toBeDefined();
    expect(ITEM_TEMPLATES.wooden_sword).toBeDefined();
    expect(CRAFT_RECIPES.furnace).toBeDefined();
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1 });
    const early = await act(runtime, vkUserId, 'BEGIN_DAY_3');
    expect(early.text).toMatch(/нельзя|Сначала закрой/i);
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    expect(done.text).toContain('Продолжение скоро будет доступно');
    expect(hasLabel(done, 'День 3')).toBe(true);
    expect((await store.getFlags(player.id)).day_3_complete).toBeUndefined();
    expect((await store.getFlags(player.id)).day_2_complete).toBe('1');
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
  });

  it('28. compact hub stays at most 5 buttons', async () => {
    const { runtime, vkUserId } = await startCamp();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(isMainHub(hub.buttons)).toBe(true);
    expect(labels(hub)).toEqual(['⛏ Добыча', '🔨 Крафт', '🎒 Инвентарь', '👁 Осмотреться', '🏕 Стан']);
    expect(hub.buttons.some((button) => button.action === 'CRAFT_ITEM')).toBe(false);
  });

  it('29. camp menu hides completed actions', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1 });
    const before = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(hasLabel(before, 'Разместить верстак')).toBe(true);
    expect(hasLabel(before, 'Костёр')).toBe(true);
    expect(before.buttons.length).toBeLessThanOrEqual(5);

    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    const afterTable = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(hasLabel(afterTable, 'Разместить верстак')).toBe(false);

    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const afterFire = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(hasLabel(afterFire, 'Костёр')).toBe(false);
    expect(hasLabel(afterFire, 'Освещение')).toBe(false);
    expect(hasLabel(afterFire, 'Завершить')).toBe(true);

    await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const afterDone = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    expect(hasLabel(afterDone, 'Завершить')).toBe(false);
    expect(hasLabel(afterDone, 'Назад')).toBe(true);
    void player;
    void store;
  });

  it('30. Day 1 recipes and pipeline stay intact', async () => {
    expect(CRAFT_RECIPES.planks.cost).toEqual({ LOG: 1 });
    expect(CRAFT_RECIPES.sticks.cost).toEqual({ PLANK: 2 });
    expect(CRAFT_RECIPES.crafting_table.cost).toEqual({ PLANK: 4 });
    expect(CRAFT_RECIPES.wooden_pickaxe.cost).toEqual({ PLANK: 3, STICK: 2 });
    expect(CRAFT_RECIPES.stone_pickaxe.cost).toEqual({ COBBLESTONE: 3, STICK: 2 });
    expect(CRAFT_RECIPES.wooden_sword.cost).toEqual({ PLANK: 2, STICK: 1 });
    expect(CRAFT_RECIPES.iron_ingot).toBeUndefined();
    expect(CRAFT_RECIPES.smelt_iron).toBeUndefined();
    const { store, runtime, player, vkUserId } = await boot();
    await store.addResource(player.id, 'LOG', 1);
    const planks = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    expect(planks.text).toContain('Доски');
    expect((await store.getResources(player.id)).PLANK).toBe(4);
  });

  it('31. duplicate event_id does not duplicate Day 2 rewards', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    player.currentLocation = 'soot_fissure';
    await store.savePlayer(player);
    const first = await act(runtime, vkUserId, 'GATHER_COAL', {}, 'coal-dup');
    const coal = (await store.getResources(player.id)).COAL ?? 0;
    const energy = (await reload(store, player.id)).energy;
    const second = await act(runtime, vkUserId, 'GATHER_COAL', {}, 'coal-dup');
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).COAL).toBe(coal);
    expect((await reload(store, player.id)).energy).toBe(energy);

    const camp = await startCamp({ log: 3, stick: 3, coal: 1 });
    await act(camp.runtime, camp.vkUserId, 'PLACE_CAMP_TABLE', {}, 'place-dup');
    await act(camp.runtime, camp.vkUserId, 'PLACE_CAMP_TABLE', {}, 'place-dup');
    expect(await itemCount(camp.store, camp.player.id, 'crafting_table')).toBe(1);
    await act(camp.runtime, camp.vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' }, 'fire-dup');
    await act(camp.runtime, camp.vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' }, 'fire-dup');
    expect(await itemCount(camp.store, camp.player.id, 'campfire')).toBe(1);
    const xpBefore = (await reload(camp.store, camp.player.id)).xp;
    await act(camp.runtime, camp.vkUserId, 'COMPLETE_DAY_2', {}, 'done-dup');
    await act(camp.runtime, camp.vkUserId, 'COMPLETE_DAY_2', {}, 'done-dup');
    expect((await reload(camp.store, camp.player.id)).xp).toBe(xpBefore + CAMP_QUEST_XP);
  });

  it('32. stale callback does not break state', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 1, stick: 1, coal: 0, plank: 1 });
    const staleFire = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    expect(staleFire.text).toMatch(/Не хватает/i);
    expect((await store.getFlags(player.id)).camp_fire_built).toBeUndefined();
    expect(await store.hasRewardClaim(player.id, 'structure', 'campfire')).toBe(false);

    const staleChest = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'chest' });
    expect(staleChest.text).toMatch(/Не хватает/i);
    expect((await store.getFlags(player.id)).camp_chest_built).toBeUndefined();

    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    const stalePlace = await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    expect(stalePlace.text).toMatch(/уже/i);
    expect(await itemCount(store, player.id, 'crafting_table')).toBe(1);

    const earlyDone = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    expect(earlyDone.text).toMatch(/верстак на земле и костёр|нельзя/i);
    expect((await store.getFlags(player.id)).day_2_complete).toBeUndefined();
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
  });
});

describe('day 2 soft-locks and lighting', () => {
  it('can chop more wood at player_camp', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 0 });
    const chopped = await act(runtime, vkUserId, 'GATHER_WOOD');
    expect(chopped.text).toMatch(/брёвен/i);
    expect((await store.getResources(player.id)).LOG).toBeGreaterThanOrEqual(6);
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
  });

  it('can finish the Day 1 pickaxe pipeline if incomplete', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({
      pickaxe: false,
      table: true,
      log: 4,
      stick: 2,
      plank: 3,
    });
    const crafted = await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'wooden_pickaxe' });
    expect(crafted.text).toContain('кирка');
    expect(await itemCount(store, player.id, 'wooden_pickaxe')).toBe(1);
  });

  it('place table without a table hints to craft', async () => {
    const { runtime, vkUserId } = await startCamp({ table: false });
    const denied = await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    expect(denied.text).toMatch(/Верстака нет|Скрафти стол/i);
  });

  it('lighting a torch sets camp_lit', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ coal: 1, stick: 1 });
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'torch' });
    expect((await store.getFlags(player.id)).camp_lit).toBeUndefined();
    const lit = await act(runtime, vkUserId, 'LIGHT_CAMP');
    expect(lit.text).toMatch(/Факел|свет/i);
    expect((await store.getFlags(player.id)).camp_lit).toBe('1');
    expect(await itemCount(store, player.id, 'torch')).toBe(3);
  });

  it('soot fissure is discovered through look, not the hub', async () => {
    const { runtime, vkUserId } = await startCamp();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hasLabel(hub, 'расселине')).toBe(false);
    expect(hasLabel(hub, 'саж')).toBe(false);
    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(hasLabel(look, 'сажи') || hasLabel(look, 'расселине')).toBe(true);
    const gone = await choice(runtime, vkUserId, 'soot_notice', 'go');
    expect(gone.text).toMatch(/Сажевая расселина/i);
    expect(gone.state?.location).toBe('soot_fissure');
  });

  it('menus cost no energy even at zero', async () => {
    const { store, runtime, player, vkUserId } = await startCamp();
    player.energy = 0;
    await store.savePlayer(player);
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    const camp = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'camp' });
    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hub.buttons.length).toBeGreaterThan(0);
    expect(camp.buttons.length).toBeGreaterThan(0);
    expect(gather.buttons.length).toBeGreaterThan(0);
    expect((await reload(store, player.id)).energy).toBe(0);
  });
});

describe('day 2 mock playthrough', () => {
  it('walks min path: camp → table → soot → coal → fire → torch → rem → ridge → complete', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete({
      eavesdrop: true,
      lantern: true,
      log: 3,
      stick: 4,
      plank: 0,
    });
    const begin = await act(runtime, vkUserId, 'BEGIN_DAY_2');
    expect(begin.text).toContain('Затвор держит');

    const founded = await act(runtime, vkUserId, 'FOUND_CAMP', { onShelter: false });
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
    expect(founded.text).toMatch(/Пустая клетка|стан/i);

    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(hub, 'Стан')).toBe(true);

    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    expect((await store.getFlags(player.id)).camp_table_placed).toBe('1');

    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(hasLabel(look, 'сажи') || hasLabel(look, 'расселине')).toBe(true);
    await choice(runtime, vkUserId, 'soot_notice', 'go');
    expect((await reload(store, player.id)).currentLocation).toBe('soot_fissure');

    const gather = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(gather, 'уголь')).toBe(true);
    await act(runtime, vkUserId, 'GATHER_COAL');
    expect((await store.getResources(player.id)).COAL ?? 0).toBeGreaterThanOrEqual(2);
    expect((await store.getFlags(player.id)).found_coal).toBe('1');

    const back = await choice(runtime, vkUserId, 'soot_fissure_look', 'camp');
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
    void back;

    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    expect((await store.getFlags(player.id)).camp_fire_built).toBe('1');
    expect((await store.getFlags(player.id)).camp_lit).toBe('1');

    await store.addResource(player.id, 'COAL', 1);
    await store.addResource(player.id, 'STICK', 1);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'torch' });
    expect(await itemCount(store, player.id, 'torch')).toBe(4);

    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(hasLabel(rem, 'Узел 7')).toBe(true);
    expect(hasLabel(rem, 'разговор ночью')).toBe(true);
    await choice(runtime, vkUserId, 'rem_day2', 'night');
    await choice(runtime, vkUserId, 'rem_day2_night', 'back');
    expect((await store.getFlags(player.id)).pressed_rem_about_night).toBe('1');

    const lantern = (await store.listItems(player.id)).find((item) => item.templateId === 'broken_lantern')!;
    const shown = await act(runtime, vkUserId, 'USE_ITEM', { itemId: lantern.id });
    expect(shown.text).toMatch(/Вел/i);

    await act(runtime, vkUserId, 'EXPLORE');
    await choice(runtime, vkUserId, 'camp_look', 'ridge');
    await choice(runtime, vkUserId, 'ridge_tracks', 'rem');
    expect((await store.getFlags(player.id)).seen_ridge_tracks).toBe('1');

    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const flags = await store.getFlags(player.id);
    expect(flags.day_2_complete).toBe('1');
    expect(flags.camp_chest_built).toBeUndefined();
    expect(flags.day_1_complete).toBe('1');
    expect(done.text).toContain('Продолжение скоро будет доступно');
    expect(hasLabel(done, 'День 3')).toBe(true);
    expect((await store.getFlags(player.id)).day_3_complete).toBeUndefined();
  });

  it('shelter + scavenger path still completes without a chest', async () => {
    const { store, runtime, player, vkUserId } = await startCamp(
      { shelter: true, feed: true, log: 2, stick: 3, coal: 1 },
      true,
    );
    expect((await store.getFlags(player.id)).camp_on_shelter).toBe('1');
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    const visit = await act(runtime, vkUserId, 'EXPLORE');
    expect(visit.text).toMatch(/падальщик/i);
    await act(runtime, vkUserId, 'CLAIM_REWARD', { rewardType: 'gift', rewardRef: 'scavenger_cache' });
    expect((await store.getResources(player.id)).COBBLESTONE).toBe(2);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    const done = await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const flags = await store.getFlags(player.id);
    expect(flags.day_2_complete).toBe('1');
    expect(flags.scavenger_cache).toBe('1');
    expect(flags.camp_chest_built).toBeUndefined();
    expect(done.buttons.length).toBeGreaterThan(0);
  });
});

describe('day 2 rem dialogue is not replayed from stale buttons', () => {
  it('duplicate Node 7 event_id does not change state twice', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    const first = await act(
      runtime,
      vkUserId,
      'DIALOGUE_CHOICE',
      { nodeId: 'rem_day2', choiceId: 'what7_shown' },
      'node7-once',
    );
    expect(first.text).toContain('Кивок');
    expect(first.skipSend).toBeUndefined();
    const second = await act(
      runtime,
      vkUserId,
      'DIALOGUE_CHOICE',
      { nodeId: 'rem_day2', choiceId: 'what7_shown' },
      'node7-once',
    );
    expect(second.text).toBe(first.text);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_node7_shown');
  });

  it('a second Node 7 click after the first is a no-op send', async () => {
    const { runtime, player, store, vkUserId } = await seedDay1Complete({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    await act(runtime, vkUserId, 'DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'what7_shown' });
    const again = await act(runtime, vkUserId, 'DIALOGUE_CHOICE', {
      nodeId: 'rem_day2',
      choiceId: 'what7_shown',
    });
    expect(again.skipSend).toBe(true);
    expect(again.text).toContain('Кивок');
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_node7_shown');
  });

  it('showing the lantern then a stale Node 7 payload stays on the lantern', async () => {
    const { runtime, player, store, vkUserId } = await seedDay1Complete({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    const shown = await act(runtime, vkUserId, 'DIALOGUE_CHOICE', {
      nodeId: 'rem_day2',
      choiceId: 'lantern',
    });
    expect(shown.text).toMatch(/Вел/i);
    expect(hasLabel(shown, 'Убрать')).toBe(true);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_lantern');
    const stale = await act(runtime, vkUserId, 'DIALOGUE_CHOICE', {
      nodeId: 'rem_day2',
      choiceId: 'what7_shown',
    });
    expect(stale.skipSend).toBe(true);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_lantern');
    const hide = await act(runtime, vkUserId, 'DIALOGUE_CHOICE', {
      nodeId: 'rem_day2_lantern',
      choiceId: 'back',
    });
    expect(hide.skipSend).toBeUndefined();
    expect(hide.text).toMatch(/затвора/i);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2');
  });

  it('inventory and explore still work from Rem', async () => {
    const { runtime, vkUserId, player, store } = await seedDay1Complete({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_2');
    await act(runtime, vkUserId, 'FOUND_CAMP');
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    await act(runtime, vkUserId, 'DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'lantern' });
    const inv = await act(runtime, vkUserId, 'OPEN_INVENTORY');
    expect(inv.text).toMatch(/инвентар|сломанный фонарь/i);
    expect(inv.skipSend).toBeUndefined();
    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(look.buttons.length).toBeGreaterThan(0);
    expect((await reload(store, player.id)).currentState).not.toMatch(/^rem_day2/);
    expect(look.text).not.toMatch(/ковыряет клин/);
  });
});

describe('day 2 rem softlock recovery', () => {
  it('renders «К стану» as a dialogue choice so location actually changes', async () => {
    const { runtime, vkUserId } = await startCamp({ showToken: true, lantern: true });
    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    const camp = rem.buttons.find((button) => /стан|лагер/i.test(button.label));
    expect(camp).toBeDefined();
    expect(camp!.action).toBe('DIALOGUE_CHOICE');
    expect(camp!.payload).toEqual({ nodeId: 'rem_day2', choiceId: 'camp' });
    expect(hasLabel(rem, 'галере')).toBe(false);
  });

  it('Node 7 → lantern → hide → current camp button leaves rem_day2', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ showToken: true, lantern: true });
    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(rem.text).toMatch(/ковыряет клин/);
    expect(hasLabel(rem, 'Узел 7')).toBe(true);
    expect(hasLabel(rem, 'внутри')).toBe(true);
    expect(hasLabel(rem, 'фонарь')).toBe(true);
    expect(hasLabel(rem, 'стан') || hasLabel(rem, 'лагер')).toBe(true);

    const asked = await choice(runtime, vkUserId, 'rem_day2', 'what7_shown');
    expect(asked.text).toContain('Кивок');
    const back = await choice(runtime, vkUserId, 'rem_day2_node7_shown', 'back');
    expect(back.text).toMatch(/затвора/);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2');

    const shown = await choice(runtime, vkUserId, 'rem_day2', 'lantern');
    expect(shown.text).toMatch(/Вел/);
    expect(hasLabel(shown, 'Убрать')).toBe(true);
    const hide = await choice(runtime, vkUserId, 'rem_day2_lantern', 'back');
    expect(hide.skipSend).toBeUndefined();
    expect(hide.text).toMatch(/затвора/);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2');

    const left = await choice(runtime, vkUserId, 'rem_day2', 'camp');
    expect(left.skipSend).toBeUndefined();
    expect(left.text).not.toMatch(/ковыряет клин/);
    const after = await reload(store, player.id);
    expect(after.currentState).not.toMatch(/^rem_day2/);
    expect(after.currentLocation).toBe('player_camp');
    expect(left.text).toMatch(/стан/i);

    const resumed = await act(runtime, vkUserId, 'START_GAME');
    expect(resumed.text).not.toMatch(/ковыряет клин/);
    expect((await reload(store, player.id)).currentState).not.toMatch(/^rem_day2/);
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
  });

  it('legacy EXPLORE from rem_camp with a founded camp leaves Rem', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect((await reload(store, player.id)).currentLocation).toBe('rem_camp');
    const look = await act(runtime, vkUserId, 'EXPLORE');
    expect(look.text).not.toMatch(/ковыряет клин/);
    const after = await reload(store, player.id);
    expect(after.currentLocation).toBe('player_camp');
    expect(after.currentState).toBe('camp_look');
  });

  it('START_GAME recovers a stuck rem_day2 player into camp', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    const stuck = await reload(store, player.id);
    expect(stuck.currentState).toBe('rem_day2');
    const start = await act(runtime, vkUserId, 'START_GAME');
    expect(start.text).not.toMatch(/ковыряет клин/);
    expect((await reload(store, player.id)).currentState).toBe('camp_look');
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
  });

  it('START_GAME recovers rem_day2 without a camp back to day2_start', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete({ lantern: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_2');
    player.currentState = 'rem_day2';
    player.currentLocation = 'rem_camp';
    await store.savePlayer(player);
    const start = await act(runtime, vkUserId, 'START_GAME');
    expect(start.text).toMatch(/Затвор держит|стан/i);
    expect(hasLabel(start, 'клетку') || start.buttons.some((button) => button.action === 'FOUND_CAMP')).toBe(
      true,
    );
    expect((await reload(store, player.id)).currentState).toBe('day2_start');
  });

  it('rem_day2 without a camp offers a found-camp exit', async () => {
    const { store, runtime, player, vkUserId } = await seedDay1Complete({ lantern: true });
    await act(runtime, vkUserId, 'BEGIN_DAY_2');
    player.currentState = 'rem_day2';
    player.currentLocation = 'rem_camp';
    await store.savePlayer(player);
    const rem = await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    expect(hasLabel(rem, 'Поставить стан')).toBe(true);
    expect(hasLabel(rem, 'лагер') || hasLabel(rem, 'стану')).toBe(false);
    const found = await choice(runtime, vkUserId, 'rem_day2', 'found');
    expect(found.text).toMatch(/Затвор держит|стан/i);
    expect((await reload(store, player.id)).currentState).toBe('day2_start');
  });

  it('current rem_day2 camp button transitions; stale rem buttons after leaving are no-ops', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    const left = await choice(runtime, vkUserId, 'rem_day2', 'camp');
    expect(left.skipSend).toBeUndefined();
    expect((await reload(store, player.id)).currentState).toBe('camp_look');

    const staleCamp = await choice(runtime, vkUserId, 'rem_day2', 'camp');
    expect(staleCamp.skipSend).toBe(true);
    expect((await reload(store, player.id)).currentState).toBe('camp_look');

    const staleNode7 = await choice(runtime, vkUserId, 'rem_day2', 'what7_shown');
    expect(staleNode7.skipSend).toBe(true);
    expect((await reload(store, player.id)).currentState).toBe('camp_look');

    const staleLantern = await choice(runtime, vkUserId, 'rem_day2', 'lantern');
    expect(staleLantern.skipSend).toBe(true);
    expect((await reload(store, player.id)).currentLocation).toBe('player_camp');
    expect((await reload(store, player.id)).currentState).toBe('camp_look');
  });

  it('rem_day2_lantern + stale rem_day2 camp payload stays on the lantern', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ showToken: true, lantern: true });
    await act(runtime, vkUserId, 'TALK_NPC', { npcId: 'rem' });
    await choice(runtime, vkUserId, 'rem_day2', 'lantern');
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_lantern');
    const stale = await choice(runtime, vkUserId, 'rem_day2', 'camp');
    expect(stale.skipSend).toBe(true);
    expect((await reload(store, player.id)).currentState).toBe('rem_day2_lantern');
  });

  it('START_GAME after day 2 complete does not reopen rem_day2', async () => {
    const { store, runtime, player, vkUserId } = await startCamp({ log: 3, stick: 3, coal: 1 });
    await act(runtime, vkUserId, 'PLACE_CAMP_TABLE');
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'campfire' });
    await act(runtime, vkUserId, 'COMPLETE_DAY_2');
    const row = await reload(store, player.id);
    row.currentState = 'rem_day2';
    row.currentLocation = 'rem_camp';
    await store.savePlayer(row);
    const start = await act(runtime, vkUserId, 'START_GAME');
    expect(start.text).toMatch(/Продолжение скоро будет доступно|Стан стоит/);
    expect((await reload(store, player.id)).currentState).toBe('day2_complete');
  });
});
