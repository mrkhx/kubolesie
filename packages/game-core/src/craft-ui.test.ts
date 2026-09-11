import { describe, expect, it } from 'vitest';
import { getRecipe } from '@kubolesie/content';
import type { GameResponse } from '@kubolesie/shared';
import {
  CRAFT_MENU_GROUPS,
  canAffordRecipe,
  hasCraftingTable,
  visibleRecipeButtons,
  type MenuSnapshot,
} from './menus';
import {
  SimSession,
  STORY_FLAGS_WEEK1,
  STORY_FLAGS_WEEK6,
} from './simulation';

function labelsOf(response: GameResponse): string[] {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: GameResponse, part: string): boolean {
  return labelsOf(response).some((label) => label.includes(part));
}

function recipeLabels(response: GameResponse): string[] {
  return labelsOf(response).filter((label) => !/Назад|Ещё/.test(label));
}

function emptyCraftCopy(text: string): boolean {
  return /Пока нечего (крафтить|ковать)/.test(text);
}

function emptySnapshot(): MenuSnapshot {
  return {
    currentLocation: 'forest_clearing',
    flags: {},
    items: [],
    resources: {},
    quests: {},
  };
}

/** Player whose live screenshot was Доски / Палки / Сундук + empty tools. */
function screenshotSnapshot(): MenuSnapshot {
  return {
    currentLocation: 'forest_clearing',
    flags: {},
    items: [
      { templateId: 'crafting_table' },
      { templateId: 'rusty_token' },
      { templateId: 'stone_knife' },
      { templateId: 'dry_rusk' },
    ],
    resources: { LOG: 8, PLANK: 8 },
    quests: {},
  };
}

const LEGACY_ITEMS = [
  'planks',
  'sticks',
  'crafting_table',
  'salvage_wood',
  'salvage_stone',
  'chest',
  'torch',
  'furnace',
  'bucket',
  'bread',
] as const;

function legacyVisible(group: 'tools' | 'weapons' | 'items' | 'materials', ctx: MenuSnapshot): string[] {
  const ids = group === 'items' ? LEGACY_ITEMS : CRAFT_MENU_GROUPS[group];
  const names: string[] = [];
  for (const recipeId of ids) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    if (recipeId === 'crafting_table' && hasCraftingTable(ctx.items)) continue;
    if (recipeId === 'chest' && ctx.flags.camp_chest_built) continue;
    if (recipeId === 'furnace' && !ctx.flags.day_3_complete) continue;
    if (
      (recipeId === 'wooden_sword' || recipeId === 'stone_sword' || recipeId === 'hide_tunic') &&
      !ctx.flags.day_2_complete
    ) {
      continue;
    }
    if (!canAffordRecipe(recipe, ctx)) continue;
    names.push(recipe.name);
  }
  return names;
}

async function openCraft(session: SimSession): Promise<GameResponse> {
  const root = await session.act('OPEN_MENU', { menu: 'craft' });
  expect(hasLabel(root, 'Базовый')).toBe(true);
  expect(hasLabel(root, 'Инструменты')).toBe(true);
  expect(root.buttons.length).toBeLessThanOrEqual(5);
  return root;
}

async function pressCategory(
  session: SimSession,
  part: 'Базовый' | 'Инструменты' | 'Снаряжение' | 'Материалы',
): Promise<GameResponse> {
  await openCraft(session);
  const page = await session.press(part);
  expect(page.buttons.length).toBeGreaterThanOrEqual(2);
  expect(page.buttons.length).toBeLessThanOrEqual(5);
  expect(hasLabel(page, 'Назад')).toBe(true);
  return page;
}

async function seedScreenshotPlayer(session: SimSession): Promise<void> {
  const player = await session.reload();
  player.hp = 20;
  player.energy = 20;
  player.maxEnergy = 20;
  player.coins = 0;
  await session.store.savePlayer(player);
  await session.store.addResource(session.playerId, 'LOG', 8);
  await session.store.addResource(session.playerId, 'PLANK', 8);
  await session.giveItem('crafting_table');
  await session.giveItem('rusty_token', 'UNCOMMON');
  await session.giveItem('stone_knife');
  await session.giveItem('dry_rusk');
}

describe('craft UI production screenshot', { timeout: 30_000 }, () => {
  it('reproduces the screenshot only under the legacy affordability filter', () => {
    const ctx = screenshotSnapshot();
    const items = legacyVisible('items', ctx).slice(0, 3);
    const tools = legacyVisible('tools', ctx);
    const weapons = legacyVisible('weapons', ctx);
    const materials = legacyVisible('materials', ctx);
    expect(items).toEqual(['Доски', 'Палки', 'Сундук']);
    expect(tools).toEqual([]);
    expect(weapons).toEqual([]);
    expect(materials).toEqual([]);
  });

  it('acceptance: OPEN_CRAFTING → Базовый / Инструменты on the screenshot player', async () => {
    const session = await SimSession.boot({ vkUserId: 'craft-ui-shot' });
    await seedScreenshotPlayer(session);

    const items = await pressCategory(session, 'Базовый');
    expect(emptyCraftCopy(items.text)).toBe(false);
    expect(recipeLabels(items).some((label) => label.includes('Доски'))).toBe(true);
    expect(recipeLabels(items).some((label) => label.includes('Палки'))).toBe(true);
    expect(recipeLabels(items).some((label) => label.includes('Сундук'))).toBe(true);
    expect(items.buttons.length).toBeLessThanOrEqual(5);

    const tools = await pressCategory(session, 'Инструменты');
    expect(emptyCraftCopy(tools.text)).toBe(false);
    expect(tools.text).not.toMatch(/Пока нечего/);
    expect(recipeLabels(tools).length).toBeGreaterThan(0);
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    expect(tools.text).toMatch(/кирка/i);
    expect(tools.buttons.length).toBeLessThanOrEqual(5);

    const denied = await session.press('Деревянная кирка');
    expect(denied.text).toMatch(/верстак|доск|палки/i);
    expect(denied.buttons.length).toBeGreaterThanOrEqual(2);
    expect(denied.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(denied, 'кирка') || hasLabel(denied, 'Назад')).toBe(true);

    const weapons = await pressCategory(session, 'Снаряжение');
    expect(emptyCraftCopy(weapons.text)).toBe(false);
    if (!recipeLabels(weapons).length) {
      expect(weapons.text).toMatch(/откроется позже/i);
    }

    const materials = await pressCategory(session, 'Материалы');
    expect(emptyCraftCopy(materials.text)).toBe(false);
    if (!recipeLabels(materials).length) {
      expect(materials.text).toMatch(/откроются позже/i);
    }
    session.assertHealthy();
  });
});

describe('craft UI survival path', { timeout: 30_000 }, () => {
  it('table is visible before ownership and chest does not take its slot', async () => {
    const session = await SimSession.boot({ vkUserId: 'craft-ui-table' });
    const player = await session.reload();
    player.hp = 20;
    player.energy = 20;
    player.coins = 0;
    await session.store.savePlayer(player);
    await session.store.addResource(session.playerId, 'LOG', 8);
    await session.store.addResource(session.playerId, 'PLANK', 8);
    await session.giveItem('rusty_token', 'UNCOMMON');
    await session.giveItem('stone_knife');
    await session.giveItem('dry_rusk');
    expect(await session.hasItem('crafting_table')).toBe(false);

    const items = await pressCategory(session, 'Базовый');
    expect(emptyCraftCopy(items.text)).toBe(false);
    const first = recipeLabels(items);
    expect(first.some((label) => label.includes('Доски'))).toBe(true);
    expect(first.some((label) => label.includes('Палки'))).toBe(true);
    expect(first.some((label) => label.includes('Верстак'))).toBe(true);
    expect(first.some((label) => label.includes('Сундук'))).toBe(false);
    expect(items.text).toMatch(/Верстак/);
    expect(items.text).toMatch(/4 доски/i);

    const all = await session.collectPagedLabels();
    expect(all.some((label) => label.includes('Сундук'))).toBe(true);
    expect(all.some((label) => label.includes('Верстак'))).toBe(true);
    session.assertHealthy();
  });

  it('wooden pick is visible before a table and missing station does not hide it', async () => {
    const session = await SimSession.boot({ vkUserId: 'craft-ui-pick' });
    await session.store.addResource(session.playerId, 'LOG', 8);
    expect(await session.hasItem('crafting_table')).toBe(false);

    const tools = await pressCategory(session, 'Инструменты');
    expect(emptyCraftCopy(tools.text)).toBe(false);
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    expect(tools.text).toMatch(/нужен верстак/i);
    expect(tools.text).toMatch(/3 доски/i);
    expect(tools.text).toMatch(/2 палки/i);

    const denied = await session.press('Деревянная кирка');
    expect(denied.text).toMatch(/Нужен верстак/);
    expect(denied.text).toMatch(/3 доски/);
    expect(denied.text).toMatch(/2 палки/);
    expect(denied.buttons.length).toBeGreaterThanOrEqual(2);
    expect(denied.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(denied, 'Деревянная кирка') || hasLabel(denied, 'Назад')).toBe(true);
    session.assertHealthy();
  });

  it('missing materials do not hide planks or sticks', async () => {
    const session = await SimSession.boot({ vkUserId: 'craft-ui-mats' });
    const items = await pressCategory(session, 'Базовый');
    expect(hasLabel(items, 'Доски')).toBe(true);
    expect(hasLabel(items, 'Палки')).toBe(true);

    const sticks = await session.press('Палки');
    expect(sticks.text).toMatch(/Не хватает/);
    expect(sticks.buttons.length).toBeGreaterThanOrEqual(2);
    expect(sticks.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(sticks, 'Палки') || hasLabel(sticks, 'Доски') || hasLabel(sticks, 'Назад')).toBe(true);
    session.assertHealthy();
  });

  it('survival group order keeps table before chest', () => {
    expect(CRAFT_MENU_GROUPS.items.slice(0, 4)).toEqual(['planks', 'sticks', 'crafting_table', 'chest']);
    const noTable = visibleRecipeButtons('items', {
      ...emptySnapshot(),
      resources: { LOG: 8, PLANK: 8 },
    }).map((button) => button.payload?.recipeId);
    expect(noTable.slice(0, 3)).toEqual(['planks', 'sticks', 'crafting_table']);
    expect(noTable.indexOf('crafting_table')).toBeLessThan(noTable.indexOf('chest'));
  });
});

describe('fresh survival craft via live buttons', { timeout: 30_000 }, () => {
  it('START_GAME → crate → logs → planks → sticks → table → wooden pick → quarry → stone pick', async () => {
    const session = await SimSession.boot({ vkUserId: 'craft-ui-fresh' });
    expect(hasLabel(session.last, 'ящик')).toBe(true);
    await session.press('ящик');
    expect(await session.resource('LOG')).toBeGreaterThanOrEqual(2);

    if (hasLabel(session.last, 'Рубить')) await session.press('Рубить');
    expect(await session.resource('LOG')).toBeGreaterThanOrEqual(4);

    if (hasLabel(session.last, 'Назад')) await session.press('Назад');
    else await session.act('OPEN_MENU', { menu: 'hub' });
    if (hasLabel(session.last, 'Крафт')) await session.press('Крафт');
    else await session.act('OPEN_MENU', { menu: 'craft' });
    expect(hasLabel(session.last, 'Базовый')).toBe(true);
    const items = await session.press('Базовый');
    expect(recipeLabels(items).slice(0, 3).join(' ')).toMatch(/Доски/);
    expect(recipeLabels(items).slice(0, 3).join(' ')).toMatch(/Палки/);
    expect(recipeLabels(items).slice(0, 3).join(' ')).toMatch(/Верстак/);

    for (let i = 0; i < 4; i += 1) {
      const made = await session.pressOnPages('Доски');
      expect(made.text).toMatch(/Доски|Скрафчено/i);
      expect(made.buttons.length).toBeLessThanOrEqual(5);
    }
    const sticks = await session.pressOnPages('Палки');
    expect(sticks.text).toMatch(/Палки|Скрафчено/i);
    const table = await session.pressOnPages('Верстак');
    expect(table.text).toMatch(/Верстак/i);
    expect(await session.hasItem('crafting_table')).toBe(true);

    const tools = await pressCategory(session, 'Инструменты');
    expect(hasLabel(tools, 'Деревянная кирка')).toBe(true);
    const pick = await session.press('Деревянная кирка');
    expect(pick.text).toMatch(/кирк/i);
    expect(await session.hasItem('wooden_pickaxe')).toBe(true);

    await session.act('OPEN_MENU', { menu: 'gather' });
    if (hasLabel(session.last, 'Поверхность')) await session.press('Поверхность');
    expect(hasLabel(session.last, 'Каменоломня')).toBe(true);
    await session.press('Каменоломня');
    while ((await session.resource('COBBLESTONE')) < 3) {
      if (!hasLabel(session.last, 'Добыть')) break;
      await session.ensureEnergy(2);
      await session.press('Добыть');
    }
    expect(await session.resource('COBBLESTONE')).toBeGreaterThanOrEqual(3);

    if ((await session.resource('STICK')) < 2) {
      await pressCategory(session, 'Базовый');
      if ((await session.resource('PLANK')) < 2) await session.pressOnPages('Доски');
      await session.pressOnPages('Палки');
    }
    const stoneTools = await pressCategory(session, 'Инструменты');
    if (!hasLabel(stoneTools, 'Каменная кирка')) {
      const all = await session.collectPagedLabels();
      expect(all.some((label) => label.includes('Каменная кирка'))).toBe(true);
    }
    const stone = await session.pressOnPages('Каменная кирка');
    expect(stone.text).toMatch(/кирк/i);
    expect(await session.hasItem('stone_pickaxe')).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    session.assertHealthy();
  });
});

describe('craft UI stage snapshots', { timeout: 30_000 }, () => {
  const stages: Array<{ name: string; flags: readonly string[]; extras?: string[] }> = [
    { name: 'fresh', flags: [] },
    { name: 'Day1', flags: ['day_1_complete'] },
    { name: 'Day2', flags: ['day_1_complete', 'day_2_complete', 'player_camp_founded', 'camp_table_placed'] },
    { name: 'Week1', flags: STORY_FLAGS_WEEK1 },
    {
      name: 'Week2',
      flags: [...STORY_FLAGS_WEEK1, 'week_2_complete', 'day_14_complete'],
    },
    {
      name: 'Week3',
      flags: [...STORY_FLAGS_WEEK1, 'week_2_complete', 'week_3_complete'],
    },
    {
      name: 'Week4',
      flags: [...STORY_FLAGS_WEEK1, 'week_2_complete', 'week_3_complete', 'week_4_complete'],
    },
    {
      name: 'Week5',
      flags: [...STORY_FLAGS_WEEK1, 'week_2_complete', 'week_3_complete', 'week_4_complete', 'week_5_complete'],
    },
    { name: 'Week6', flags: STORY_FLAGS_WEEK6 },
  ];

  it('records visible craft labels at each stage and never uses empty-крафтить copy', async () => {
    const report: Record<string, Record<string, string[]>> = {};
    for (const stage of stages) {
      const session = await SimSession.boot({ vkUserId: `craft-ui-${stage.name}` });
      await session.grantFlags(stage.flags);
      if (stage.name !== 'fresh') {
        if (!(await session.hasItem('crafting_table'))) await session.giveItem('crafting_table');
      } else {
        await session.store.addResource(session.playerId, 'LOG', 8);
      }
      report[stage.name] = {};
      for (const name of ['Базовый', 'Инструменты', 'Снаряжение', 'Материалы'] as const) {
        const page = await pressCategory(session, name);
        expect(page.buttons.length).toBeLessThanOrEqual(5);
        expect(emptyCraftCopy(page.text)).toBe(false);
        const seen = (await session.collectPagedLabels()).filter((label) => !/Назад|Ещё/.test(label));
        report[stage.name][name] = seen;
      }
      if (stage.name === 'fresh') {
        expect(report.fresh.Базовый.some((label) => label.includes('Верстак'))).toBe(true);
        expect(report.fresh.Инструменты.some((label) => label.includes('Деревянная кирка'))).toBe(true);
      }
      session.assertHealthy();
    }
    expect(Object.keys(report)).toEqual(stages.map((stage) => stage.name));
  });
});
