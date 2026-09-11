import { describe, expect, it } from 'vitest';
import {
  GAME_COMMANDS,
  PROTOTYPE_VERSION,
} from '@kubolesie/shared';
import { CRAFT_RECIPES, MINING_SITES, TRADEABLE_RESOURCES, isTradeableAsset, isTradeableResource } from '@kubolesie/content';
import {
  SimSession,
  STORY_FLAGS_WEEK1,
  STORY_FLAGS_WEEK6,
  randomWalk,
  seedCamp,
  type EconomySample,
} from './simulation';

const ECONOMY: EconomySample[] = [];

function labels(session: SimSession): string[] {
  return session.last.buttons.map((button) => button.label);
}

function hasLabel(session: SimSession, part: string): boolean {
  return labels(session).some((label) => label.includes(part));
}

async function survivalToWoodenPickaxe(session: SimSession): Promise<void> {
  await session.act('OPEN_CRATE');
  if (!(await session.hasItem('crafting_table'))) {
    await session.ensureResource('PLANK', 9);
    await session.craft('crafting_table');
  }
  expect(await session.hasItem('crafting_table')).toBe(true);
  await session.ensureResource('STICK', 2);
  await session.ensureResource('PLANK', 3);
  const pick = await session.craft('wooden_pickaxe');
  expect(pick.text).toMatch(/кирк/i);
  expect(pick.buttons.length).toBeLessThanOrEqual(5);
  expect(await session.hasItem('wooden_pickaxe')).toBe(true);
  session.assertHealthy();
}

async function craftStonePickaxe(session: SimSession): Promise<void> {
  await session.mineUntil('quarry', 'COBBLESTONE', 3);
  await session.ensureResource('STICK', 2);
  const made = await session.craft('stone_pickaxe');
  expect(made.text).toMatch(/кирк/i);
  expect(await session.hasItem('stone_pickaxe')).toBe(true);
}

async function ensurePlacedFurnace(session: SimSession): Promise<void> {
  if (await session.flag('furnace_placed')) {
    if (!(await session.hasItem('furnace'))) await session.giveItem('furnace');
    await session.moveTo('player_camp', 'camp_look');
    return;
  }
  await placeFurnace(session);
}

async function placeFurnace(session: SimSession): Promise<void> {
  await session.grantFlags(['day_3_complete', 'player_camp_founded']);
  await session.moveTo('player_camp', 'camp_look');
  await session.mineUntil('quarry', 'COBBLESTONE', 8);
  const made = await session.craft('furnace');
  expect(made.text).toMatch(/Печь/i);
  expect(await session.flag('furnace_placed')).toBe('1');
}

async function craftIronPickaxe(session: SimSession): Promise<void> {
  await session.mineUntil('iron', 'IRON_ORE', 3);
  await session.smeltIron(3);
  expect(await session.resource('IRON_INGOT')).toBeGreaterThanOrEqual(3);
  await session.ensureResource('STICK', 2);
  const made = await session.craft('iron_pickaxe');
  expect(made.text).toMatch(/кирк/i);
  expect(await session.hasItem('iron_pickaxe')).toBe(true);
}

async function seedCoins(session: SimSession, coins: number): Promise<void> {
  const player = await session.reload();
  player.coins = coins;
  await session.store.savePlayer(player);
}

describe('gameplay simulation harness', () => {
  it('boots MemoryGameStore + GameRuntime and tracks snapshot after each action', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-harness' });
    expect(session.playerId).toBeTruthy();
    expect(session.last.buttons.length).toBeGreaterThan(0);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    const snap = await session.snapshot();
    expect(snap.energy).toBeGreaterThan(0);
    expect(snap.maxEnergy).toBeGreaterThan(0);
    expect(snap.location).toBe('forest_clearing');
    expect(snap.currentState).toBeTruthy();
    expect(snap.coins).toBeGreaterThanOrEqual(0);
    await session.act('OPEN_INVENTORY');
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    session.assertHealthy();
    expect(session.firstSoftlock().found).toBe(false);
  });
});

describe('new player from scratch', { timeout: 30_000 }, () => {
  it('farms LOG → table → wooden pickaxe → cobble → stone → coal → iron → furnace → iron pickaxe', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-new' });
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    await survivalToWoodenPickaxe(session);

    const gather = await session.act('OPEN_MENU', { menu: 'gather' });
    expect(gather.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'Поверхность')).toBe(true);
    await session.act('MINE_ACT', { act: 'group', group: 'surface' });
    expect(hasLabel(session, 'Каменоломня')).toBe(true);
    await session.act('MINE_ACT', { act: 'site', site: 'quarry' });
    expect(hasLabel(session, 'Добыть')).toBe(true);

    const before = await session.resource('COBBLESTONE');
    await session.mine('quarry');
    const mid = await session.resource('COBBLESTONE');
    expect(mid).toBeGreaterThan(before);
    await session.mine('quarry');
    expect(await session.resource('COBBLESTONE')).toBeGreaterThan(mid);

    await craftStonePickaxe(session);

    await session.grantFlags(['day_2_complete']);
    await session.mineUntil('coal', 'COAL', 2);
    expect(await session.resource('COAL')).toBeGreaterThanOrEqual(2);

    await placeFurnace(session);
    await craftIronPickaxe(session);

    expect(await session.hasItem('wooden_pickaxe')).toBe(true);
    expect(await session.hasItem('stone_pickaxe')).toBe(true);
    expect(await session.hasItem('iron_pickaxe')).toBe(true);
    expect(await session.hasItem('furnace')).toBe(true);
    expect(await session.resource('COBBLESTONE')).toBeGreaterThan(0);
    expect(await session.resource('COAL')).toBeGreaterThan(0);
    expect(await session.flag('first_ingot')).toBe('1');
    session.assertHealthy();
    expect(session.energySpent).toBeGreaterThan(0);
  });
});

describe('mining 2.0 full progression', { timeout: 60_000 }, () => {
  it('walks cobble → coal → iron → copper → tin → bronze → silver → gold → deep', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-full' });
    await session.grantFlags(STORY_FLAGS_WEEK6);
    await session.moveTo('player_camp', 'camp_look');
    await survivalToWoodenPickaxe(session);
    await craftStonePickaxe(session);
    await session.mineUntil('coal', 'COAL', 4);
    await ensurePlacedFurnace(session);
    await craftIronPickaxe(session);

    await session.mineUntil('copper', 'COPPER_ORE', 9);
    await session.smeltOre('COPPER_ORE', 9);
    expect(await session.resource('COPPER_INGOT')).toBeGreaterThanOrEqual(9);

    await session.mineUntil('tin', 'TIN_ORE', 2);
    await session.smeltOre('TIN_ORE', 2);
    expect(await session.resource('TIN_INGOT')).toBeGreaterThanOrEqual(2);

    const alloy = await session.craft('bronze_ingot');
    expect(alloy.text).toMatch(/бронз/i);
    expect(await session.resource('BRONZE_INGOT')).toBeGreaterThanOrEqual(4);
    await session.ensureResource('STICK', 2);
    const bronzePick = await session.craft('bronze_pickaxe');
    expect(bronzePick.text).toMatch(/кирк/i);
    expect(await session.hasItem('bronze_pickaxe')).toBe(true);

    const lanternFit = await session.craft('copper_fitting');
    expect(lanternFit.text).toMatch(/крепёж|креп/i);
    await session.ensureResource('STICK', 1);
    if ((await session.resource('COAL')) < 1) await session.mineUntil('coal', 'COAL', 1);
    const lantern = await session.craft('miner_lantern');
    expect(lantern.text).toMatch(/фонар/i);
    expect(await session.hasItem('miner_lantern')).toBe(true);

    await session.mineUntil('silver', 'SILVER_ORE', 3);
    await session.smeltOre('SILVER_ORE', 3);
    await session.ensureResource('STICK', 1);
    const charm = await session.craft('silver_charm');
    expect(charm.text).toMatch(/оберег|серебр/i);
    expect(await session.hasItem('silver_charm')).toBe(true);

    await session.mineUntil('gold', 'GOLD_ORE', 3);
    await session.smeltOre('GOLD_ORE', 3);
    if ((await session.resource('COPPER_FITTING')) < 1) {
      if ((await session.resource('COPPER_INGOT')) < 2) {
        await session.mineUntil('copper', 'COPPER_ORE', 2);
        await session.smeltOre('COPPER_ORE', 2);
      }
      await session.craft('copper_fitting');
    }
    const gold = await session.craft('gold_seal');
    expect(gold.text).toMatch(/печат|золот/i);
    expect(await session.hasItem('gold_seal')).toBe(true);

    await session.mineUntil('deep', 'DEEP_CRYSTAL', 2);
    expect(await session.resource('DEEP_CRYSTAL')).toBeGreaterThanOrEqual(2);
    if ((await session.resource('BRONZE_INGOT')) < 3) {
      await session.mineUntil('copper', 'COPPER_ORE', 3);
      await session.smeltOre('COPPER_ORE', 3);
      await session.mineUntil('tin', 'TIN_ORE', 1);
      await session.smeltOre('TIN_ORE', 1);
      await session.craft('bronze_ingot');
    }
    await session.ensureResource('STICK', 2);
    const deep = await session.craft('deep_pickaxe');
    expect(deep.text).toMatch(/кирк|жильн/i);
    expect(await session.hasItem('deep_pickaxe')).toBe(true);

    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    session.assertHealthy();
  });
});

describe('real player complaint', { timeout: 30_000 }, () => {
  it('lets a stone-pickaxe player farm cobble, coal and iron 10 times each', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-complaint' });
    await session.grantFlags(['day_2_complete', 'day_4_complete', 'furnace_placed', 'player_camp_founded']);
    await session.giveItem('wooden_pickaxe');
    await session.giveItem('stone_pickaxe');
    await session.moveTo('player_camp', 'camp_look');

    const cobble0 = await session.resource('COBBLESTONE');
    const coal0 = await session.resource('COAL');
    const iron0 = await session.resource('IRON_ORE');
    for (let i = 0; i < 10; i += 1) await session.mine('quarry');
    for (let i = 0; i < 10; i += 1) await session.mine('coal');
    for (let i = 0; i < 10; i += 1) await session.mine('iron');
    expect(await session.resource('COBBLESTONE')).toBeGreaterThanOrEqual(cobble0 + 20);
    expect(await session.resource('COAL')).toBeGreaterThanOrEqual(coal0 + 10);
    expect(await session.resource('IRON_ORE')).toBeGreaterThanOrEqual(iron0 + 10);
    expect(session.mines).toBeGreaterThanOrEqual(30);
    session.assertHealthy();
  });
});

describe('long farm run', { timeout: 60_000 }, () => {
  it('survives 250 mixed actions without NaN, negatives or unique dupes', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-farm' });
    await session.grantFlags([...STORY_FLAGS_WEEK1, 'furnace_placed', 'furnace_built', 'first_ingot']);
    await session.giveItem('crafting_table');
    await session.giveItem('stone_pickaxe');
    await session.giveItem('furnace');
    await session.moveTo('player_camp', 'camp_look');

    const cycle = [
      async () => session.mine('quarry'),
      async () => session.mine('forest'),
      async () => session.mine('coal'),
      async () => session.mine('iron'),
      async () => {
        if ((await session.resource('LOG')) >= 1) return session.craft('planks');
        return session.act('OPEN_INVENTORY');
      },
      async () => session.act('OPEN_CAMP'),
      async () => session.act('OPEN_MENU', { menu: 'hub' }),
      async () => session.act('OPEN_INVENTORY'),
      async () => {
        const fuel = Number((await session.flag('furnace_fuel')) ?? 0);
        if (fuel < 1) {
          if ((await session.resource('COAL')) < 1) await session.mine('coal');
          return session.act('FURNACE_ACT', { act: 'add_coal' });
        }
        if ((await session.resource('IRON_ORE')) >= 1) return session.act('FURNACE_ACT', { act: 'smelt' });
        return session.act('FURNACE_ACT', { act: 'open' });
      },
    ];

    while (session.history.length < 250) {
      const step = cycle[session.history.length % cycle.length]!;
      await step();
      session.assertHealthy();
    }

    const snap = await session.snapshot();
    expect(snap.energy).toBeGreaterThanOrEqual(0);
    expect(snap.coins).toBeGreaterThanOrEqual(0);
    expect(snap.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(snap.energy)).toBe(true);
    expect(snap.currentState).toBeTruthy();
    expect(session.invariantFailures).toEqual([]);
    expect(session.firstSoftlock().found).toBe(false);
  });
});

describe('random walk', { timeout: 60_000 }, () => {
  it.each([
    [11, 120, 'fresh'],
    [42, 160, 'week1'],
    [99, 180, 'week6'],
    [7, 140, 'week6'],
  ] as const)('seed %s / %s steps (%s) does not crash or softlock', async (seed, steps, kind) => {
    const session = await SimSession.boot({ vkUserId: `sim-rw-${seed}` });
    if (kind === 'week1') {
      await session.grantFlags(STORY_FLAGS_WEEK1);
      await session.giveItem('crafting_table');
      await session.giveItem('stone_pickaxe');
      await seedCamp(session);
    }
    if (kind === 'week6') {
      await session.grantFlags(STORY_FLAGS_WEEK6);
      await session.giveItem('crafting_table');
      await session.giveItem('bronze_pickaxe');
      await session.giveItem('iron_pickaxe');
      await seedCamp(session);
    }
    const report = await randomWalk(session, seed, steps);
    if (report.crashes.length) {
      throw new Error(
        `crash seed=${report.seed} loc=${report.location} state=${report.currentState}: ${report.crashes.join('; ')}`,
      );
    }
    if (report.softlock.found) {
      throw new Error(
        `softlock seed=${report.seed} step=${report.softlock.step} ${report.softlock.reason} ${report.softlock.fingerprint}`,
      );
    }
    expect(session.invariantFailures).toEqual([]);
    expect(report.location).toBeTruthy();
    expect(report.currentState).toBeTruthy();
  });

  it('does not treat a normal camp hub loop as a softlock', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-hubloop' });
    await session.grantFlags(STORY_FLAGS_WEEK1);
    await seedCamp(session);
    for (let i = 0; i < 16; i += 1) await session.act('OPEN_CAMP');
    expect(session.firstSoftlock().found).toBe(false);
    session.assertHealthy();
  });
});

describe('day 2 rem regression', () => {
  it('Node 7 → lantern → hide → camp; START_GAME does not return to Rem', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-rem' });
    await session.grantFlags([
      'day_1_complete',
      'met_rem',
      'node7_gate_closed',
      'activated_node7_token',
      'found_rusty_token',
      'opened_start_crate',
      'slept_at_rem',
      'showed_token_to_rem',
      'found_broken_lantern',
    ]);
    const player = await session.reload();
    player.level = 2;
    player.xp = 40;
    player.maxHp = 105;
    player.hp = 105;
    player.currentLocation = 'rem_camp';
    player.currentState = 'day1_complete';
    await session.store.savePlayer(player);
    await session.giveItem('crafting_table');
    await session.giveItem('wooden_pickaxe');
    await session.giveItem('stone_pickaxe');
    await session.giveItem('rusty_token', 'UNCOMMON');
    await session.giveItem('broken_lantern');

    await session.act('BEGIN_DAY_2');
    await session.act('FOUND_CAMP');
    expect((await session.reload()).currentLocation).toBe('player_camp');

    const rem = await session.act('TALK_NPC', { npcId: 'rem' });
    expect(rem.text).toMatch(/ковыряет клин/);
    expect(hasLabel(session, 'Узел 7')).toBe(true);
    expect(hasLabel(session, 'фонарь')).toBe(true);

    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'what7_shown' });
    expect(session.last.text).toContain('Кивок');
    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2_node7_shown', choiceId: 'back' });
    expect((await session.reload()).currentState).toBe('rem_day2');

    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'lantern' });
    expect(session.last.text).toMatch(/Вел/);
    expect(hasLabel(session, 'Убрать')).toBe(true);
    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2_lantern', choiceId: 'back' });
    expect((await session.reload()).currentState).toBe('rem_day2');

    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'camp' });
    const afterCamp = await session.reload();
    expect(afterCamp.currentState).not.toMatch(/^rem_day2/);
    expect(afterCamp.currentLocation).toBe('player_camp');

    const resume = await session.act('START_GAME');
    expect(resume.text).not.toMatch(/ковыряет клин/);
    expect((await session.reload()).currentState).not.toMatch(/^rem_day2/);
    expect((await session.reload()).currentLocation).toBe('player_camp');

    const inv = await session.act('OPEN_INVENTORY');
    expect(inv.buttons.length).toBeGreaterThan(0);
    expect(inv.text).toMatch(/инвентар|фонарь|кирк/i);
    const look = await session.act('EXPLORE');
    expect(look.buttons.length).toBeGreaterThan(0);
    expect((await session.reload()).currentState).not.toMatch(/^rem_day2/);
    session.assertHealthy();
  });
});

describe('legacy player', () => {
  it('resumes a 0.0.12-style save without reset and sees mining 2.0', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-legacy' });
    await session.grantFlags([
      ...STORY_FLAGS_WEEK1,
      'furnace_placed',
      'furnace_built',
      'first_ingot',
      'chose_iron_pickaxe',
    ]);
    await session.giveItem('crafting_table');
    await session.giveItem('wooden_pickaxe');
    await session.giveItem('stone_pickaxe');
    await session.giveItem('iron_pickaxe');
    await session.giveItem('furnace');
    await session.store.addResource(session.playerId, 'LOG', 8);
    await session.store.addResource(session.playerId, 'COBBLESTONE', 6);
    await session.store.addResource(session.playerId, 'IRON_INGOT', 2);
    const player = await session.reload();
    player.currentLocation = 'player_camp';
    player.currentState = 'week1_complete';
    player.coins = 90;
    await session.store.savePlayer(player);

    const before = await session.snapshot();
    const resume = await session.act('START_GAME');
    const after = await session.snapshot();
    expect(after.items.sort()).toEqual(before.items.sort());
    expect(after.flags.week_1_complete).toBe('1');
    expect(after.flags.day_2_complete).toBe('1');
    expect(after.resources.IRON_INGOT).toBe(before.resources.IRON_INGOT);
    expect(after.coins).toBe(before.coins);
    expect(resume.text).not.toMatch(/приходишь в себя на холодной земле/i);

    const mines = await session.act('MINE_ACT', { act: 'group', group: 'mines' });
    expect(mines.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'Уголь') || mines.text.match(/угол/i)).toBeTruthy();
    expect(hasLabel(session, 'Железн') || hasLabel(session, 'Медн')).toBe(true);
    await session.mine('quarry');
    expect(await session.resource('COBBLESTONE')).toBeGreaterThan(6);
    await session.mine('copper');
    expect(await session.resource('COPPER_ORE')).toBeGreaterThan(0);
    const gold = await session.act('MINE_ACT', { act: 'info', site: 'gold' });
    expect(gold.text).toMatch(/Откроется|кирк|бронз/i);
    session.assertHealthy();
  });
});

describe('week 6 player', () => {
  it('has mining 2.0 tiers, no Week 7, and keeps jobs/market/production', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-w6' });
    await session.grantFlags(STORY_FLAGS_WEEK6);
    await session.giveItem('crafting_table');
    await session.giveItem('bronze_pickaxe');
    await session.giveItem('iron_pickaxe');
    await seedCamp(session);

    const mines = await session.act('MINE_ACT', { act: 'group', group: 'mines' });
    expect(mines.buttons.length).toBeLessThanOrEqual(5);
    const seen = new Set(labels(session));
    for (let page = 0; page < 4 && hasLabel(session, 'Ещё'); page += 1) {
      await session.press('Ещё');
      expect(session.last.buttons.length).toBeLessThanOrEqual(5);
      for (const label of labels(session)) seen.add(label);
    }
    expect([...seen].some((label) => /Серебр|Золот|Глубин/.test(label))).toBe(true);
    await session.act('MINE_ACT', { act: 'site', site: 'deep' });
    expect(hasLabel(session, 'Добыть')).toBe(true);
    await session.mine('deep');
    expect(await session.resource('DEEP_CRYSTAL')).toBeGreaterThanOrEqual(1);
    await session.mine('silver');
    await session.mine('gold');
    expect(await session.resource('SILVER_ORE')).toBeGreaterThanOrEqual(1);
    expect(await session.resource('GOLD_ORE')).toBeGreaterThanOrEqual(1);

    const day43 = await session.act('BEGIN_DAY_43' as never, {});
    expect(day43.text).toMatch(/нельзя|Неизвестн/i);
    expect(session.last.text).not.toMatch(/День 43|неделя 7|Week 7/i);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);

    const work = await session.act('OPEN_MENU', { menu: 'work' });
    expect(work.buttons.length).toBeLessThanOrEqual(5);
    expect(work.text).toMatch(/Работ|Двор/i);
    const market = await session.act('MARKET_ACT', { act: 'hub' });
    expect(market.buttons.length).toBeLessThanOrEqual(5);
    expect(market.text).not.toMatch(/Недел 1|закрой первую/i);
    const prod = await session.act('PROD_ACT', { act: 'hub' });
    expect(prod.buttons.length).toBeLessThanOrEqual(5);
    session.assertHealthy();
  });
});

describe('negative scenarios', { timeout: 20_000 }, () => {
  it('rejects mining without a pickaxe and does not grant cobble', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-neg-pick' });
    const denied = await session.act('MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(denied.text).toMatch(/кирк/i);
    expect(await session.resource('COBBLESTONE')).toBe(0);
    session.assertHealthy();
  });

  it('rejects mining without energy and does not yield', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-neg-en' });
    await session.giveItem('wooden_pickaxe');
    while ((await session.reload()).energy >= 1) {
      const before = (await session.reload()).energy;
      await session.act('MINE_ACT', { act: 'mine', site: 'quarry' });
      if ((await session.reload()).energy >= before) break;
    }
    const cobble = await session.resource('COBBLESTONE');
    const empty = await session.act('MINE_ACT', { act: 'mine', site: 'quarry' });
    expect(empty.text).toMatch(/энерг/i);
    expect(await session.resource('COBBLESTONE')).toBe(cobble);
    session.assertHealthy();
  });

  it('rejects craft/smelt/locked vein/duplicate/stale actions without negative balances', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-neg-misc' });
    const noCraft = await session.act('CRAFT_ITEM', { recipeId: 'wooden_pickaxe' });
    expect(noCraft.text).toMatch(/верстак|Не хватает/i);

    await session.grantFlags(['furnace_placed', 'day_3_complete', 'player_camp_founded']);
    await session.moveTo('player_camp', 'camp_look');
    const noFuel = await session.act('FURNACE_ACT', { act: 'smelt' });
    expect(noFuel.text).toMatch(/топлива|уголь|руды/i);
    await session.act('FURNACE_ACT', { act: 'add_coal' });
    const noOre = await session.act('FURNACE_ACT', { act: 'smelt' });
    expect(noOre.text).toMatch(/руд|Нет/i);
    const dryCopper = await session.act('FURNACE_ACT', { act: 'smelt_ore', ore: 'COPPER_ORE' });
    expect(dryCopper.text).toMatch(/Нет|закрыт|руды|топлива/i);

    const gold = await session.act('MINE_ACT', { act: 'mine', site: 'gold' });
    expect(gold.text).toMatch(/кирк|Откроется|нельзя/i);
    expect(await session.resource('GOLD_ORE')).toBe(0);
    const deep = await session.act('MINE_ACT', { act: 'mine', site: 'deep' });
    expect(deep.text).toMatch(/кирк|Откроется|нельзя/i);

    await session.giveItem('wooden_pickaxe');
    const first = await session.act('MINE_ACT', { act: 'mine', site: 'quarry' }, 'dup-mine');
    const cobble = await session.resource('COBBLESTONE');
    const energy = (await session.reload()).energy;
    const dup = await session.act('MINE_ACT', { act: 'mine', site: 'quarry' }, 'dup-mine');
    expect(dup.text).toBe(first.text);
    expect(await session.resource('COBBLESTONE')).toBe(cobble);
    expect((await session.reload()).energy).toBe(energy);

    await session.grantFlags(['day_1_complete', 'found_broken_lantern', 'showed_token_to_rem']);
    await session.giveItem('broken_lantern');
    await session.act('TALK_NPC', { npcId: 'rem' });
    await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'lantern' });
    const stale = await session.act('DIALOGUE_CHOICE', { nodeId: 'rem_day2', choiceId: 'what7_shown' });
    expect(stale.skipSend === true || (await session.reload()).currentState === 'rem_day2_lantern').toBe(true);

    const snap = await session.snapshot();
    expect(snap.energy).toBeGreaterThanOrEqual(0);
    expect(snap.coins).toBeGreaterThanOrEqual(0);
    for (const amount of Object.values(snap.resources)) {
      expect(amount ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('economy sanity', { timeout: 60_000 }, () => {
  it('measures real actions/energy against GDD targets', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-econ' });
    await session.grantFlags(STORY_FLAGS_WEEK6);
    await session.moveTo('player_camp', 'camp_look');
    await survivalToWoodenPickaxe(session);

    const cobbleMark = session.beginEconomy();
    const cobble0 = await session.resource('COBBLESTONE');
    await session.mineUntil('quarry', 'COBBLESTONE', cobble0 + 20);
    ECONOMY.push(session.endEconomy('20 COBBLESTONE', cobbleMark));

    await craftStonePickaxe(session);
    if (!(await session.hasItem('furnace'))) {
      await session.mineUntil('quarry', 'COBBLESTONE', 8);
      await session.craft('furnace');
    }

    const ironMark = session.beginEconomy();
    const iron0 = await session.resource('IRON_INGOT');
    await session.mineUntil('iron', 'IRON_ORE', 10);
    await session.smeltIron(10);
    expect(await session.resource('IRON_INGOT')).toBeGreaterThanOrEqual(iron0 + 10);
    ECONOMY.push(session.endEconomy('10 IRON_INGOT', ironMark));

    if (!(await session.hasItem('iron_pickaxe'))) {
      await session.ensureResource('STICK', 2);
      await session.craft('iron_pickaxe');
    }

    const bronzeMark = session.beginEconomy();
    await session.mineUntil('copper', 'COPPER_ORE', 3);
    await session.smeltOre('COPPER_ORE', 3);
    await session.mineUntil('tin', 'TIN_ORE', 1);
    await session.smeltOre('TIN_ORE', 1);
    await session.craft('bronze_ingot');
    await session.ensureResource('STICK', 2);
    await session.craft('bronze_pickaxe');
    expect(await session.hasItem('bronze_pickaxe')).toBe(true);
    ECONOMY.push(session.endEconomy('BRONZE_PICKAXE', bronzeMark));

    const silverMark = session.beginEconomy();
    await session.mineUntil('silver', 'SILVER_ORE', 3);
    await session.smeltOre('SILVER_ORE', 3);
    await session.ensureResource('STICK', 1);
    await session.craft('silver_charm');
    expect(await session.hasItem('silver_charm')).toBe(true);
    ECONOMY.push(session.endEconomy('SILVER recipe', silverMark));

    const goldMark = session.beginEconomy();
    await session.mineUntil('gold', 'GOLD_ORE', 3);
    await session.smeltOre('GOLD_ORE', 3);
    if ((await session.resource('COPPER_FITTING')) < 1) {
      await session.mineUntil('copper', 'COPPER_ORE', 2);
      await session.smeltOre('COPPER_ORE', 2);
      await session.craft('copper_fitting');
    }
    await session.craft('gold_seal');
    expect(await session.hasItem('gold_seal')).toBe(true);
    ECONOMY.push(session.endEconomy('GOLD recipe', goldMark));

    const deepMark = session.beginEconomy();
    await session.mineUntil('deep', 'DEEP_CRYSTAL', 2);
    if ((await session.resource('BRONZE_INGOT')) < 3) {
      await session.mineUntil('copper', 'COPPER_ORE', 3);
      await session.smeltOre('COPPER_ORE', 3);
      await session.mineUntil('tin', 'TIN_ORE', 1);
      await session.smeltOre('TIN_ORE', 1);
      await session.craft('bronze_ingot');
    }
    await session.ensureResource('STICK', 2);
    await session.craft('deep_pickaxe');
    expect(await session.hasItem('deep_pickaxe')).toBe(true);
    ECONOMY.push(session.endEconomy('DEEP_PICKAXE', deepMark));

    const cobble = ECONOMY.find((row) => row.goal === '20 COBBLESTONE')!;
    expect(cobble.energySpent).toBeGreaterThanOrEqual(5);
    expect(cobble.energySpent).toBeLessThanOrEqual(16);
    expect(cobble.mines).toBeGreaterThanOrEqual(5);
    expect(cobble.mines).toBeLessThanOrEqual(12);

    const iron = ECONOMY.find((row) => row.goal === '10 IRON_INGOT')!;
    expect(iron.energySpent).toBeGreaterThanOrEqual(10);
    expect(iron.energySpent).toBeLessThanOrEqual(50);
    expect(iron.smelts).toBeGreaterThanOrEqual(10);

    const bronze = ECONOMY.find((row) => row.goal === 'BRONZE_PICKAXE')!;
    expect(bronze.energySpent).toBeGreaterThanOrEqual(6);
    expect(bronze.energySpent).toBeLessThanOrEqual(80);

    const silver = ECONOMY.find((row) => row.goal === 'SILVER recipe')!;
    expect(silver.energySpent).toBeGreaterThanOrEqual(6);
    expect(silver.energySpent).toBeLessThanOrEqual(24);

    const gold = ECONOMY.find((row) => row.goal === 'GOLD recipe')!;
    expect(gold.energySpent).toBeGreaterThanOrEqual(6);
    expect(gold.energySpent).toBeLessThanOrEqual(40);

    const deep = ECONOMY.find((row) => row.goal === 'DEEP_PICKAXE')!;
    expect(deep.energySpent).toBeGreaterThanOrEqual(6);
    expect(deep.energySpent).toBeLessThanOrEqual(40);

    for (const row of ECONOMY) {
      // eslint-disable-next-line no-console
      console.log(
        `[economy] ${row.goal}: actions=${row.actions} energy=${row.energySpent} mines=${row.mines} smelts=${row.smelts} crafts=${row.crafts}`,
      );
    }
    session.assertHealthy();
  });
});

describe('jobs and production', { timeout: 30_000 }, () => {
  it('progresses miner/logger/crafter from real actions; collect does not count as gather', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-jobs' });
    await session.grantFlags(STORY_FLAGS_WEEK1);
    await session.giveItem('crafting_table');
    await session.giveItem('wooden_pickaxe');
    await seedCamp(session);
    await seedCoins(session, 400);
    await session.store.addResource(session.playerId, 'LOG', 40);
    await session.store.addResource(session.playerId, 'COBBLESTONE', 60);
    await session.store.addResource(session.playerId, 'IRON_INGOT', 6);
    await session.store.addResource(session.playerId, 'PLANK', 8);
    await session.store.addResource(session.playerId, 'STICK', 4);

    await session.act('JOB_ACT', { act: 'accept', id: 'miner_cobble' });
    const miner0 = (await session.store.getAcceptedJobTask(session.playerId, 'MINER'))!.progress;
    await session.mine('quarry');
    const miner1 = (await session.store.getAcceptedJobTask(session.playerId, 'MINER'))!.progress;
    expect(miner1).toBeGreaterThan(miner0);

    await session.act('JOB_ACT', { act: 'accept', id: 'logger_logs' });
    const logger0 = (await session.store.getAcceptedJobTask(session.playerId, 'LOGGER'))!.progress;
    await session.mine('forest');
    const logger1 = (await session.store.getAcceptedJobTask(session.playerId, 'LOGGER'))!.progress;
    expect(logger1).toBeGreaterThan(logger0);

    await session.act('JOB_ACT', { act: 'accept', id: 'crafter_tools' });
    const crafter0 = (await session.store.getAcceptedJobTask(session.playerId, 'CRAFTER'))!.progress;
    const axe = await session.craft('wooden_axe');
    expect(axe.buttons.length).toBeLessThanOrEqual(5);
    const crafter1 = (await session.store.getAcceptedJobTask(session.playerId, 'CRAFTER'))!.progress;
    expect(crafter1).toBeGreaterThan(crafter0);

    const cobbleTask = await session.store.getAcceptedJobTask(session.playerId, 'MINER');
    expect(cobbleTask?.templateId).toBe('miner_cobble');
    const minerBeforeCollect = cobbleTask!.progress;
    await session.act('PROD_ACT', { act: 'build', t: 'MINE' });
    session.clock.advance(12 * 60 * 60 * 1000);
    const collected = await session.act('PROD_ACT', { act: 'collect', t: 'MINE' });
    expect(collected.text).toMatch(/Собрано|Пусто/i);
    const minerAfterCollect = (await session.store.getAcceptedJobTask(session.playerId, 'MINER'))!.progress;
    expect(minerAfterCollect).toBe(minerBeforeCollect);
    session.assertHealthy();
  });
});

describe('market tradeability', () => {
  it('lists ordinary ores/ingots/crystal and denies shards and equipment', async () => {
    const session = await SimSession.boot({ vkUserId: 'sim-mkt' });
    await session.grantFlags(STORY_FLAGS_WEEK1);
    await seedCamp(session);
    await session.store.addResource(session.playerId, 'COBBLESTONE', 8);
    await session.store.addResource(session.playerId, 'COPPER_ORE', 4);
    await session.store.addResource(session.playerId, 'DEEP_CRYSTAL', 2);
    await session.store.addResource(session.playerId, 'SEAL_SHARD_6', 1);
    await session.giveItem('bronze_pickaxe');

    for (const resource of [
      'COBBLESTONE',
      'COAL',
      'IRON_ORE',
      'IRON_INGOT',
      'COPPER_ORE',
      'BRONZE_INGOT',
      'SILVER_INGOT',
      'GOLD_INGOT',
      'DEEP_CRYSTAL',
    ] as const) {
      expect(isTradeableResource(resource)).toBe(true);
      expect(TRADEABLE_RESOURCES).toContain(resource);
    }
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_6')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_2')).toBe(false);
    expect(isTradeableAsset('ITEM', 'bronze_pickaxe')).toBe(false);
    expect(isTradeableAsset('ITEM', 'iron_chest')).toBe(false);

    const cobble = await session.act('MARKET_ACT', {
      act: 'confirm_sell',
      ref: 'COBBLESTONE',
      qty: 2,
      price: 4,
    });
    expect(cobble.text).toMatch(/Лот выставлен/i);
    expect(await session.resource('COBBLESTONE')).toBe(6);

    const crystal = await session.act('MARKET_ACT', {
      act: 'confirm_sell',
      ref: 'DEEP_CRYSTAL',
      qty: 1,
      price: 20,
    });
    expect(crystal.text).toMatch(/Лот выставлен/i);

    const shard = await session.act('MARKET_ACT', {
      act: 'confirm_sell',
      ref: 'SEAL_SHARD_6',
      qty: 1,
      price: 50,
    });
    expect(shard.text).toMatch(/нельзя выставлять/i);
    expect(await session.resource('SEAL_SHARD_6')).toBe(1);

    const gear = await session.act('MARKET_ACT', {
      act: 'confirm_sell',
      ref: 'bronze_pickaxe',
      qty: 1,
      price: 50,
    });
    expect(gear.text).toMatch(/нельзя|Неизвестн/i);
    expect(await session.hasItem('bronze_pickaxe')).toBe(true);
    session.assertHealthy();
  });
});

describe('content contracts used by simulation', () => {
  it('keeps recipe costs and site energy that economy samples depend on', () => {
    expect(CRAFT_RECIPES.wooden_pickaxe.cost).toEqual({ PLANK: 3, STICK: 2 });
    expect(CRAFT_RECIPES.stone_pickaxe.cost).toEqual({ COBBLESTONE: 3, STICK: 2 });
    expect(CRAFT_RECIPES.iron_pickaxe.cost).toEqual({ IRON_INGOT: 3, STICK: 2 });
    expect(CRAFT_RECIPES.bronze_ingot.output).toEqual({ kind: 'resource', resource: 'BRONZE_INGOT', amount: 4 });
    expect(CRAFT_RECIPES.deep_pickaxe.cost).toEqual({ DEEP_CRYSTAL: 2, BRONZE_INGOT: 3, STICK: 2 });
    expect(MINING_SITES.quarry.energy).toBe(1);
    expect(MINING_SITES.iron.energy).toBe(2);
    expect(MINING_SITES.deep.energy).toBe(3);
  });
});
