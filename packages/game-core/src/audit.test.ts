import { describe, expect, it } from 'vitest';
import {
  GAME_COMMANDS,
  PROTOTYPE_VERSION,
  RESOURCE_TYPES,
} from '@kubolesie/shared';
import {
  COMBAT_LOOT,
  CRAFT_RECIPES,
  DIALOGUE_NODES,
  ENEMIES,
  ITEM_TEMPLATES,
  MINING_SITES,
  QUEST_TEMPLATES,
  TRADEABLE_RESOURCES,
  VEL_SELLS,
} from '@kubolesie/content';
import { CRAFT_MENU_GROUPS } from './menus';
import {
  SimSession,
  STORY_FLAGS_WEEK1,
  STORY_FLAGS_WEEK6,
  crawlButtons,
  deadRecipeIds,
  randomWalk,
  seedCamp,
} from './simulation';

function labels(session: SimSession): string[] {
  return session.last.buttons.map((button) => button.label);
}

function hasLabel(session: SimSession, part: string): boolean {
  return labels(session).some((label) => label.includes(part));
}

async function seedExactComplaint(session: SimSession): Promise<void> {
  const player = await session.reload();
  player.hp = 20;
  player.energy = 20;
  player.maxEnergy = 20;
  player.coins = 0;
  await session.store.savePlayer(player);
  await session.store.addResource(session.playerId, 'LOG', 8);
  await session.giveItem('rusty_token', 'UNCOMMON');
  await session.giveItem('stone_knife');
  await session.giveItem('dry_rusk');
}

describe('craftDiscoverability', { timeout: 30_000 }, () => {
  it('LOG=8, no table: player sees planks → sticks → table → wooden pickaxe', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-disc' });
    await seedExactComplaint(session);
    expect(await session.hasItem('crafting_table')).toBe(false);
    expect(await session.resource('LOG')).toBe(8);

    await session.act('OPEN_MENU', { menu: 'craft' });
    expect(labels(session)).toEqual(['🪵 Базовый', '⛏ Инструменты', '⚔ Снаряжение', '🧰 Материалы', '⬅ Назад']);

    await session.press('Базовый');
    expect(session.last.text).not.toMatch(/Пока нечего крафтить/);
    const itemLabels = await session.collectPagedLabels();
    expect(itemLabels.some((label) => label.includes('Доски'))).toBe(true);
    expect(itemLabels.some((label) => label.includes('Палки'))).toBe(true);
    expect(itemLabels.some((label) => label.includes('Верстак'))).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);

    await session.openCraftGroup('tools');
    expect(session.last.text).not.toMatch(/Пока нечего крафтить/);
    expect(hasLabel(session, 'Деревянная кирка')).toBe(true);

    const pickFail = await session.press('Деревянная кирка');
    expect(pickFail.text).toMatch(/верстак/i);
    expect(pickFail.buttons.length).toBeGreaterThanOrEqual(2);
    expect(pickFail.buttons.length).toBeLessThanOrEqual(5);
    expect(pickFail.text).not.toMatch(/undefined|null|NaN|stack/i);

    await session.openCraftGroup('items');
    const stickFail = await session.pressOnPages('Палки');
    expect(stickFail.text).toMatch(/Не хватает/);
    expect(stickFail.buttons.length).toBeLessThanOrEqual(5);

    const planks = await session.craftViaUi('Доски');
    expect(planks.text).toMatch(/Доски/);
    await session.craftViaUi('Доски');
    const table = await session.craftViaUi('Верстак');
    expect(table.text).toMatch(/Верстак/);
    expect(await session.hasItem('crafting_table')).toBe(true);

    await session.craftViaUi('Палки');
    await session.craftViaUi('Доски');
    const pick = await session.craftViaUi('Деревянная кирка');
    expect(pick.text).toMatch(/кирк/i);
    expect(await session.hasItem('wooden_pickaxe')).toBe(true);
    session.assertHealthy();
  });
});

describe('freshFullJourney', { timeout: 60_000 }, () => {
  it('Day1 crate, token, gather and craft pipeline via visible buttons', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-d1' });
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'ящик')).toBe(true);
    await session.press('ящик');
    expect(await session.hasItem('stone_knife')).toBe(true);
    expect(await session.hasItem('dry_rusk')).toBe(true);
    expect(await session.resource('LOG')).toBeGreaterThanOrEqual(2);

    await session.act('EXPLORE');
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'Добыча') || hasLabel(session, 'Ещё')).toBe(true);
    if (hasLabel(session, 'Добыча')) await session.press('Добыча');
    else await session.act('OPEN_MENU', { menu: 'gather' });
    expect(hasLabel(session, 'Рубить') || hasLabel(session, 'Поверхность')).toBe(true);
    if (hasLabel(session, 'Рубить')) await session.press('Рубить');
    expect(await session.hasItem('rusty_token')).toBe(true);
    expect(await session.resource('LOG')).toBeGreaterThan(2);

    await session.act('OPEN_MENU', { menu: 'craft' });
    await session.press('Базовый');
    const seen = await session.collectPagedLabels();
    expect(seen.some((label) => label.includes('Доски'))).toBe(true);
    session.assertHealthy();
  });
});

describe('day2Ui', { timeout: 30_000 }, () => {
  it('Node 7 → lantern → hide → camp via visible buttons; START_GAME stays at camp', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-d2' });
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
    player.currentLocation = 'rem_camp';
    player.currentState = 'day1_complete';
    await session.store.savePlayer(player);
    await session.giveItem('crafting_table');
    await session.giveItem('wooden_pickaxe');
    await session.giveItem('stone_pickaxe');
    await session.giveItem('rusty_token', 'UNCOMMON');
    await session.giveItem('broken_lantern');

    await session.act('BEGIN_DAY_2');
    if (!(await session.flag('player_camp_founded'))) {
      if (hasLabel(session, 'пустую')) await session.press('пустую');
      else if (hasLabel(session, 'клетку')) await session.press('клетку');
      else await session.act('FOUND_CAMP');
    }
    expect((await session.reload()).currentLocation).toBe('player_camp');

    const rem = await session.act('TALK_NPC', { npcId: 'rem' });
    expect(rem.text).toMatch(/ковыряет клин/);
    expect(hasLabel(session, 'фонарь')).toBe(true);
    await session.press('фонарь');
    expect(hasLabel(session, 'Убрать')).toBe(true);
    await session.press('Убрать');
    expect((await session.reload()).currentState).toBe('rem_day2');
    expect(hasLabel(session, 'лагерю') || hasLabel(session, 'стану')).toBe(true);
    await session.press(hasLabel(session, 'лагерю') ? 'лагерю' : 'стану');
    expect((await session.reload()).currentLocation).toBe('player_camp');
    expect((await session.reload()).currentState).not.toMatch(/^rem_day2/);

    const resume = await session.act('START_GAME');
    expect(resume.text).not.toMatch(/ковыряет клин/);
    expect((await session.reload()).currentLocation).toBe('player_camp');
    session.assertHealthy();
  });
});

describe('weekHubsUi', { timeout: 30_000 }, () => {
  it('week2 hub keeps Back and every destination via pages [fixture week1+]', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-w2hub' });
    await session.grantFlags([
      ...STORY_FLAGS_WEEK1,
      'farming_unlocked',
      'day_8_complete',
      'day_11_complete',
      'day_13_complete',
    ]);
    await seedCamp(session);
    const hub = await session.act('WEEK2_ACT', { act: 'open' });
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'Назад')).toBe(true);
    const seen = new Set(await session.collectPagedLabels());
    expect([...seen].some((label) => label.includes('Кромка'))).toBe(true);
    expect([...seen].some((label) => label.includes('Низина'))).toBe(true);
    expect([...seen].some((label) => label.includes('Карьер'))).toBe(true);
    expect([...seen].some((label) => label.includes('Печать'))).toBe(true);
    expect([...seen].some((label) => label.includes('Назад'))).toBe(true);
    session.assertHealthy();
  });

  it('wedge menu keeps Back, dailies and complete via pages [fixture day2+]', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-wedge' });
    await session.grantFlags([
      'day_2_complete',
      'player_camp_founded',
      'wedge_path_cleared',
      'wedge_pitch_cleared',
      'wedge_roots_cleared',
      'visited_ashen_wedge',
    ]);
    await seedCamp(session);
    await session.moveTo('ashen_wedge', 'wedge');
    const wedge = await session.act('OPEN_MENU', { menu: 'wedge' });
    expect(wedge.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(session, 'Назад')).toBe(true);
    const seen = new Set(await session.collectPagedLabels());
    expect([...seen].some((label) => label.includes('Назад'))).toBe(true);
    expect([...seen].some((label) => label.includes('Ежедневки'))).toBe(true);
    expect([...seen].some((label) => label.includes('Пнеклык'))).toBe(true);
    expect([...seen].some((label) => /Завершить День 3|Тропа|Элита/.test(label))).toBe(true);
    session.assertHealthy();
  });

  it.each([
    ['week1', STORY_FLAGS_WEEK1, 'WEEK2_ACT', /Низина|Кромка|грядк/i],
    ['week6', STORY_FLAGS_WEEK6, 'WEEK6_ACT', /стан|лагер|Добыча|Герой|Хозяйство|Рынок|Галере|Свод|Сортиров/i],
  ] as const)('%s hub via UI has 2–5 buttons and no Day 43 [fixture]', async (name, flags, act, hint) => {
    const session = await SimSession.boot({ vkUserId: `audit-${name}` });
    await session.grantFlags(flags);
    await seedCamp(session);
    const open = await session.act(act as 'WEEK2_ACT', { act: 'open' });
    expect(open.buttons.length).toBeGreaterThanOrEqual(2);
    expect(open.buttons.length).toBeLessThanOrEqual(5);
    expect(open.text + labels(session).join(' ')).toMatch(hint);
    expect(labels(session).join(' ')).not.toMatch(/День 43|Week 7|неделя 7/i);
    const day43 = await session.act('BEGIN_DAY_43' as never, {});
    expect(day43.text).toMatch(/нельзя|Неизвестн/i);
    session.assertHealthy();
  });
});

describe('miningProgressionUi', { timeout: 60_000 }, () => {
  it('wooden pickaxe via UI unlocks quarry, then stone pickaxe via UI', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-mine' });
    await session.store.addResource(session.playerId, 'LOG', 8);
    await session.craftViaUi('Доски');
    await session.craftViaUi('Доски');
    await session.craftViaUi('Верстак');
    await session.craftViaUi('Палки');
    await session.craftViaUi('Доски');
    await session.craftViaUi('Деревянная кирка');
    expect(await session.hasItem('wooden_pickaxe')).toBe(true);

    await session.act('OPEN_MENU', { menu: 'gather' });
    await session.pressOnPages('Поверхность');
    expect(hasLabel(session, 'Каменоломня') || session.last.text.match(/каменол/i)).toBeTruthy();
    await session.pressOnPages('Каменоломня');
    expect(hasLabel(session, 'Добыть')).toBe(true);
    const before = await session.resource('COBBLESTONE');
    await session.press('Добыть');
    expect(await session.resource('COBBLESTONE')).toBeGreaterThan(before);

    await session.mineUntil('quarry', 'COBBLESTONE', 3);
    await session.craftViaUi('Каменная кирка');
    expect(await session.hasItem('stone_pickaxe')).toBe(true);
    session.assertHealthy();
  });
});

describe('smeltingUi', { timeout: 30_000 }, () => {
  it('smelts iron through furnace UI and rejects empty ore/fuel in Russian', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-smelt' });
    await session.grantFlags(['day_3_complete', 'player_camp_founded', 'furnace_placed', 'furnace_built']);
    await session.giveItem('furnace');
    await session.giveItem('stone_pickaxe');
    await seedCamp(session);
    const open = await session.act('FURNACE_ACT', { act: 'open' });
    expect(open.buttons.length).toBeLessThanOrEqual(5);
    const dry = await session.act('FURNACE_ACT', { act: 'smelt' });
    expect(dry.text).toMatch(/топлива|уголь|руд/i);
    expect(dry.buttons.length).toBeGreaterThanOrEqual(2);
    await session.store.addResource(session.playerId, 'COAL', 1);
    await session.store.addResource(session.playerId, 'IRON_ORE', 1);
    await session.act('FURNACE_ACT', { act: 'add_coal' });
    const smelt = await session.act('FURNACE_ACT', { act: 'smelt' });
    expect(smelt.text).toMatch(/Выплавлено|слиток|желез/i);
    session.assertHealthy();
  });
});

describe('systemsUi', { timeout: 30_000 }, () => {
  it('jobs, production, market, pvp, clan menus stay within 5 buttons [fixture week1]', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-sys' });
    await session.grantFlags(STORY_FLAGS_WEEK1);
    await seedCamp(session);
    await session.store.savePlayer(Object.assign(await session.reload(), { coins: 400 }));
    for (const [type, payload] of [
      ['OPEN_MENU', { menu: 'work' }],
      ['JOB_ACT', { act: 'hub' }],
      ['PROD_ACT', { act: 'hub' }],
      ['MARKET_ACT', { act: 'hub' }],
      ['OPEN_MENU', { menu: 'hero' }],
      ['OPEN_PROFILE', {}],
      ['PVP_ACT', { act: 'hub' }],
      ['OPEN_MENU', { menu: 'clan' }],
    ] as const) {
      const response = await session.act(type as 'OPEN_MENU', payload as Record<string, unknown>);
      expect(response.buttons.length, `${type} ${JSON.stringify(payload)}`).toBeLessThanOrEqual(5);
      expect(response.buttons.length).toBeGreaterThanOrEqual(1);
      expect(response.text).not.toMatch(/undefined|TypeError|stack/i);
    }
    session.assertHealthy();
  });
});

describe('buttonCrawler', { timeout: 60_000 }, () => {
  it.each(['fresh', 'week1', 'week6'] as const)('crawls %s menus without crash or overflow', async (kind) => {
    const session = await SimSession.boot({ vkUserId: `audit-crawl-${kind}` });
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
      await seedCamp(session);
    }
    const report = await crawlButtons(session, 28);
    if (report.errors.length) {
      throw new Error(`${kind} crawler errors:\n${report.errors.slice(0, 8).join('\n')}`);
    }
    expect(report.overflows).toBe(0);
    expect(report.screens).toBeGreaterThan(3);
    session.assertHealthy();
  });
});

describe('deadContentAudit', () => {
  it('every recipe is in a craft group or the camp campfire slot', () => {
    expect(deadRecipeIds()).toEqual([]);
    const grouped = [
      ...CRAFT_MENU_GROUPS.tools,
      ...CRAFT_MENU_GROUPS.weapons,
      ...CRAFT_MENU_GROUPS.items,
      ...CRAFT_MENU_GROUPS.materials,
    ];
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(Object.keys(CRAFT_RECIPES)).toHaveLength(grouped.length + 1);
    expect(CRAFT_RECIPES.campfire).toBeTruthy();
  });

  it('does not implement Week 7 / BEGIN_DAY_43', () => {
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect(Object.keys(DIALOGUE_NODES).some((id) => /day43|week7/i.test(id))).toBe(false);
  });

  it('loot, recipes and shops only reference known item templates', () => {
    const known = new Set(Object.keys(ITEM_TEMPLATES));
    const used = new Set<string>();
    for (const recipe of Object.values(CRAFT_RECIPES)) {
      if (recipe.output.kind === 'item') used.add(recipe.output.templateId);
    }
    for (const loot of Object.values(COMBAT_LOOT)) {
      for (const id of loot.firstItems ?? []) used.add(id);
      if (loot.rare) used.add(loot.rare.templateId);
    }
    for (const sku of VEL_SELLS) {
      if ('templateId' in sku && sku.templateId) used.add(String(sku.templateId));
    }
    const missing = [...used].filter((id) => !known.has(id));
    expect(missing).toEqual([]);
  });

  it('mining sites and quests exist', () => {
    expect(Object.keys(MINING_SITES).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(ENEMIES).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(QUEST_TEMPLATES).length).toBeGreaterThanOrEqual(40);
    expect(TRADEABLE_RESOURCES).toContain('COPPER_ORE');
    expect(TRADEABLE_RESOURCES).not.toContain('SEAL_SHARD_6');
    expect(RESOURCE_TYPES).toContain('DEEP_CRYSTAL');
  });
});

describe('longRun', { timeout: 120_000 }, () => {
  it('survives 1000 sequential actions on a week6 player', async () => {
    const session = await SimSession.boot({ vkUserId: 'audit-long' });
    await session.grantFlags(STORY_FLAGS_WEEK6);
    await session.giveItem('crafting_table');
    await session.giveItem('stone_pickaxe');
    await session.giveItem('iron_pickaxe');
    await session.giveItem('furnace');
    await seedCamp(session, ['furnace_placed', 'furnace_built', 'first_ingot']);
    const cycle = [
      async () => session.mine('quarry'),
      async () => session.mine('forest'),
      async () => session.mine('coal'),
      async () => session.act('OPEN_INVENTORY'),
      async () => session.act('OPEN_MENU', { menu: 'hub' }),
      async () => session.act('OPEN_MENU', { menu: 'craft' }),
      async () => session.act('OPEN_MENU', { menu: 'items' }),
      async () => session.act('FURNACE_ACT', { act: 'open' }),
      async () => session.act('OPEN_PROFILE'),
      async () => session.act('MARKET_ACT', { act: 'hub' }),
    ];
    while (session.history.length < 1000) {
      const step = cycle[session.history.length % cycle.length]!;
      await step();
      if (session.history.length % 50 === 0) session.assertHealthy();
    }
    session.assertHealthy();
    const snap = await session.snapshot();
    expect(snap.energy).toBeGreaterThanOrEqual(0);
    expect(snap.hp).toBeGreaterThanOrEqual(0);
    expect(snap.coins).toBeGreaterThanOrEqual(0);
  });
});

describe('randomWalk', { timeout: 180_000 }, () => {
  it.each(
    [
      [2, 200, 'fresh'],
      [4, 200, 'fresh'],
      [6, 200, 'fresh'],
      [8, 200, 'fresh'],
      [12, 220, 'week1'],
      [14, 220, 'week1'],
      [18, 220, 'week1'],
      [22, 220, 'week1'],
      [26, 220, 'week3'],
      [28, 220, 'week3'],
      [32, 240, 'week6'],
      [34, 240, 'week6'],
      [38, 240, 'week6'],
      [44, 240, 'week6'],
      [46, 200, 'fresh'],
      [52, 220, 'week1'],
      [54, 240, 'week6'],
      [58, 200, 'fresh'],
      [62, 220, 'week1'],
      [66, 240, 'week6'],
    ] as const,
  )('seed %s / %s steps (%s)', async (seed, steps, kind) => {
    const session = await SimSession.boot({ vkUserId: `audit-rw-${seed}` });
    if (kind === 'week1' || kind === 'week3') {
      await session.grantFlags(
        kind === 'week3'
          ? [...STORY_FLAGS_WEEK1, 'week_2_complete', 'day_14_complete', 'farming_unlocked']
          : STORY_FLAGS_WEEK1,
      );
      await session.giveItem('crafting_table');
      await session.giveItem('stone_pickaxe');
      await seedCamp(session);
    }
    if (kind === 'week6') {
      await session.grantFlags(STORY_FLAGS_WEEK6);
      await session.giveItem('crafting_table');
      await session.giveItem('bronze_pickaxe');
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
    session.assertHealthy();
  });
});
