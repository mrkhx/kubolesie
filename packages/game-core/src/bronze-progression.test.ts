import {
  PRODUCTION_DEFS,
  TRADEABLE_RESOURCES,
  isTradeableAsset,
  isTradeableResource,
} from '@kubolesie/content';
import type { GameButton, GameCommandType, GameResponse } from '@kubolesie/shared';
import { GAME_COMMANDS, PROTOTYPE_VERSION } from '@kubolesie/shared';
import { describe, expect, it } from 'vitest';
import { acceptJobContract } from './jobs';
import { SimSession } from './simulation';

interface TraceStep {
  n: number;
  press: string;
  text: string;
  buttons: string[];
}

function labelsOf(response: GameResponse): string[] {
  return response.buttons.map((button) => button.label);
}

function hasLabel(response: GameResponse, part: string): boolean {
  return labelsOf(response).some((label) => label.includes(part));
}

function dumpTrace(name: string, trace: TraceStep[]): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify(
      {
        [name]: trace.map((step) => ({
          n: step.n,
          press: step.press,
          buttons: step.buttons,
          textHead: step.text.split('\n').slice(0, 6).join(' | '),
        })),
      },
      null,
      2,
    ),
  );
}

async function seedIronPickWeek2(session: SimSession): Promise<void> {
  const player = await session.reload();
  player.hp = 40;
  player.maxHp = 40;
  player.energy = 20;
  player.maxEnergy = 20;
  player.currentLocation = 'player_camp';
  await session.store.savePlayer(player);
  await session.grantFlags([
    'player_camp_founded',
    'camp_table_placed',
    'camp_fire_built',
    'day_2_complete',
    'day_4_complete',
    'furnace_placed',
    'furnace_built',
    'first_ingot',
    'week_1_complete',
    'week_2_complete',
    'farming_unlocked',
  ]);
  await session.giveItem('crafting_table');
  await session.giveItem('iron_pickaxe');
  await session.store.addResource(session.playerId, 'COAL', 8);
  await session.store.addResource(session.playerId, 'STICK', 2);
}

async function pressNamed(session: SimSession, part: string, trace: TraceStep[]): Promise<GameResponse> {
  for (let page = 0; page < 8; page += 1) {
    if (hasLabel(session.last, part)) {
      trace.push({
        n: trace.length + 1,
        press: part,
        text: session.last.text,
        buttons: labelsOf(session.last),
      });
      const next = await session.press(part);
      expect(next.buttons.length).toBeGreaterThanOrEqual(2);
      expect(next.buttons.length).toBeLessThanOrEqual(5);
      expect(next.text).not.toMatch(/Пока нечего/);
      return next;
    }
    if (!hasLabel(session.last, 'Ещё')) break;
    trace.push({
      n: trace.length + 1,
      press: 'Ещё',
      text: session.last.text,
      buttons: labelsOf(session.last),
    });
    await session.press('Ещё');
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
  }
  throw new Error(`no button "${part}". have: ${labelsOf(session.last).join(', ')}\n${session.last.text}`);
}

async function backUntil(session: SimSession, part: string, trace: TraceStep[]): Promise<GameResponse> {
  for (let i = 0; i < 10; i += 1) {
    if (hasLabel(session.last, part)) return session.last;
    if (hasLabel(session.last, 'Отойти')) {
      await pressNamed(session, 'Отойти', trace);
      continue;
    }
    if (hasLabel(session.last, 'Назад')) {
      await pressNamed(session, 'Назад', trace);
      continue;
    }
    break;
  }
  throw new Error(`cannot reach "${part}". have: ${labelsOf(session.last).join(', ')}\n${session.last.text}`);
}

async function restIfNeeded(session: SimSession, need: number, trace: TraceStep[]): Promise<void> {
  const player = await session.reload();
  if (player.energy >= need) return;
  session.clock.advanceTicks(need - player.energy + 4);
  if (hasLabel(session.last, 'Что можно найти')) {
    await pressNamed(session, 'Что можно найти', trace);
    return;
  }
  if (hasLabel(session.last, 'Инвентарь')) {
    await pressNamed(session, 'Инвентарь', trace);
    return;
  }
  throw new Error(`need ${need} energy, have ${(await session.reload()).energy}, no rest button`);
}

async function mineUntil(
  session: SimSession,
  resource: 'COPPER_ORE' | 'TIN_ORE',
  need: number,
  trace: TraceStep[],
): Promise<void> {
  for (let guard = 0; guard < 24; guard += 1) {
    if ((await session.resource(resource)) >= need) return;
    await restIfNeeded(session, 2, trace);
    expect(hasLabel(session.last, 'Добыть')).toBe(true);
    const before = await session.resource(resource);
    const mined = await pressNamed(session, 'Добыть', trace);
    expect(mined.text).toMatch(/\+\d+/);
    expect(await session.resource(resource)).toBeGreaterThan(before);
  }
  throw new Error(`could not reach ${need} ${resource}; have ${await session.resource(resource)}`);
}

async function replaySameEvent(session: SimSession, button: GameButton, eventId: string): Promise<void> {
  const beforeOre = await session.snapshot();
  await session.act(button.action as GameCommandType, button.payload ?? {}, eventId);
  const mid = await session.snapshot();
  await session.act(button.action as GameCommandType, button.payload ?? {}, eventId);
  const after = await session.snapshot();
  expect(after.resources).toEqual(mid.resources);
  expect(after.energy).toBe(mid.energy);
  expect(after.items.sort()).toEqual(mid.items.sort());
  expect(beforeOre.energy).toBeGreaterThanOrEqual(after.energy);
}

describe('copper / tin / bronze live-button survival', { timeout: 60_000 }, () => {
  it('IRON_PICKAXE → mine copper/tin → smelt → bronze → bronze pickaxe', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-live' });
    await seedIronPickWeek2(session);
    await acceptJobContract(session.store, session.playerId, 'miner_iron', session.clock.now());
    await acceptJobContract(session.store, session.playerId, 'crafter_tools', session.clock.now());

    expect(await session.hasItem('iron_pickaxe')).toBe(true);
    expect(await session.hasItem('bronze_pickaxe')).toBe(false);
    expect(await session.resource('COPPER_ORE')).toBe(0);
    expect(await session.resource('TIN_ORE')).toBe(0);
    expect(await session.resource('COPPER_INGOT')).toBe(0);
    expect(await session.resource('TIN_INGOT')).toBe(0);
    expect(await session.resource('BRONZE_INGOT')).toBe(0);
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect(PROTOTYPE_VERSION).toBe('0.0.13');

    const economy = session.beginEconomy();
    const hub = await session.act('OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(hub, 'Добыча')).toBe(true);
    expect(hasLabel(hub, 'Крафт')).toBe(true);
    expect(hasLabel(hub, 'Стан')).toBe(true);
    expect(hub.text).toMatch(/медь\/олово → бронза/i);

    const trace: TraceStep[] = [{ n: 0, press: 'OPEN_CAMP', text: hub.text, buttons: labelsOf(hub) }];
    const copperTrace: TraceStep[] = [trace[0]!];
    const tinTrace: TraceStep[] = [];
    const copperIngotTrace: TraceStep[] = [];
    const tinIngotTrace: TraceStep[] = [];
    const bronzeTrace: TraceStep[] = [];
    const pickTrace: TraceStep[] = [];

    const gather = await pressNamed(session, 'Добыча', trace);
    expect(hasLabel(gather, 'Шахты')).toBe(true);
    await pressNamed(session, 'Шахты', trace);
    expect(hasLabel(session.last, 'Медн')).toBe(true);
    copperTrace.push(...trace.slice(1));

    const copperSite = await pressNamed(session, 'Медн', trace);
    expect(copperSite.text).toMatch(/железн/i);
    expect(hasLabel(copperSite, 'Добыть')).toBe(true);
    expect(copperSite.buttons.length).toBeLessThanOrEqual(5);

    const mineButton = session.last.buttons.find((button) => button.label.includes('Добыть'));
    expect(mineButton).toBeDefined();
    await replaySameEvent(session, mineButton!, 'bronze-cu-dup');
    await mineUntil(session, 'COPPER_ORE', 3, trace);
    const copperEnd = await session.resource('COPPER_ORE');
    expect(copperEnd).toBeGreaterThanOrEqual(3);
    const minerAfterCopper = await session.store.getAcceptedJobTask(session.playerId, 'MINER');
    expect(minerAfterCopper?.progress ?? 0).toBe(0);
    copperTrace.push(...trace.slice(copperTrace.length));

    await pressNamed(session, 'Шахты', trace);
    const tinSite = await pressNamed(session, 'Олов', trace);
    expect(tinSite.text).toMatch(/бронз|железн/i);
    expect(hasLabel(tinSite, 'Добыть')).toBe(true);
    tinTrace.push(...trace);
    await mineUntil(session, 'TIN_ORE', 1, trace);
    const tinEnd = await session.resource('TIN_ORE');
    expect(tinEnd).toBeGreaterThanOrEqual(1);
    tinTrace.push(...trace.slice(tinTrace.length));

    await backUntil(session, 'Стан', trace);
    await pressNamed(session, 'Стан', trace);
    await pressNamed(session, 'Печь', trace);
    expect(hasLabel(session.last, 'Другая руда') || hasLabel(session.last, 'Ещё')).toBe(true);
    if (!hasLabel(session.last, 'Другая руда')) await pressNamed(session, 'Ещё', trace);
    expect(session.last.text).toMatch(/Ещё руда:|медн|оловян/i);

    if (hasLabel(session.last, 'уголь')) {
      await pressNamed(session, 'уголь', trace);
    }
    await pressNamed(session, 'Другая руда', trace);
    expect(hasLabel(session.last, 'Медь')).toBe(true);
    expect(hasLabel(session.last, 'Олово')).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);

    copperIngotTrace.push(...trace);
    await pressNamed(session, 'Медь', trace);
    expect(hasLabel(session.last, 'Выплавить')).toBe(true);
    const smeltButton = session.last.buttons.find((button) => button.label.includes('Выплавить'));
    expect(smeltButton).toBeDefined();
    await replaySameEvent(session, smeltButton!, 'bronze-cu-smelt-dup');
    while ((await session.resource('COPPER_INGOT')) < 3) {
      const melted = await pressNamed(session, 'Выплавить', trace);
      expect(melted.text).toMatch(/Выплавлено|слит/i);
    }
    expect(await session.resource('COPPER_INGOT')).toBeGreaterThanOrEqual(3);
    copperIngotTrace.push(...trace.slice(copperIngotTrace.length));

    tinIngotTrace.push(...trace);
    await pressNamed(session, 'Другая руда', trace);
    await pressNamed(session, 'Олово', trace);
    const tinMelt = await pressNamed(session, 'Выплавить', trace);
    expect(tinMelt.text).toMatch(/Выплавлено|слит/i);
    expect(await session.resource('TIN_INGOT')).toBeGreaterThanOrEqual(1);
    tinIngotTrace.push(...trace.slice(tinIngotTrace.length));

    await backUntil(session, 'Крафт', trace);
    bronzeTrace.push(...trace);
    await pressNamed(session, 'Крафт', trace);
    await pressNamed(session, 'Материалы', trace);
    expect(session.last.text).not.toMatch(/Пока нечего/);
    expect(hasLabel(session.last, 'Бронза')).toBe(true);
    expect(session.last.text).toMatch(/медн|оловян/i);
    const bronze = await pressNamed(session, 'Бронза', trace);
    expect(bronze.text).toMatch(/Бронз|Скрафчено/i);
    expect(await session.resource('BRONZE_INGOT')).toBeGreaterThanOrEqual(4);
    bronzeTrace.push(...trace.slice(bronzeTrace.length));

    pickTrace.push(...trace);
    if (hasLabel(session.last, 'Назад')) await pressNamed(session, 'Назад', trace);
    await pressNamed(session, 'Инструменты', trace);
    expect(session.last.text).not.toMatch(/Пока нечего/);
    const pick = await pressNamed(session, 'Бронзовая кирка', trace);
    expect(pick.text).toMatch(/кирк|Скрафчено/i);
    expect(await session.hasItem('bronze_pickaxe')).toBe(true);
    const crafter = await session.store.getAcceptedJobTask(session.playerId, 'CRAFTER');
    expect(crafter?.progress ?? 0).toBe(1);
    pickTrace.push(...trace.slice(pickTrace.length));

    await backUntil(session, 'Добыча', trace);
    await pressNamed(session, 'Добыча', trace);
    await pressNamed(session, 'Шахты', trace);
    const mineLabels = await session.collectPagedLabels();
    expect(mineLabels.some((label) => /Серебр/.test(label))).toBe(true);
    expect(mineLabels.some((label) => /Золот/.test(label))).toBe(true);
    expect(mineLabels.some((label) => /Глубин/.test(label))).toBe(false);
    await session.act('MINE_ACT', { act: 'group', group: 'mines' });
    const lockedSilver = await pressNamed(session, 'Серебр', trace);
    expect(lockedSilver.text).toMatch(/Корнев|бронзов|Откроется/i);
    expect(hasLabel(lockedSilver, 'Добыть')).toBe(false);
    const lockedGold = await session.act('MINE_ACT', { act: 'info', site: 'gold' });
    expect(lockedGold.text).toMatch(/Гнил|бронзов|Откроется/i);
    const lockedDeep = await session.act('MINE_ACT', { act: 'info', site: 'deep' });
    expect(lockedDeep.text).toMatch(/глубин|топи|бронзов|Откроется/i);

    const sample = session.endEconomy('bronze_pickaxe', economy);
    expect(sample.mines).toBeGreaterThanOrEqual(3);
    expect(sample.smelts).toBeGreaterThanOrEqual(4);
    expect(sample.crafts).toBeGreaterThanOrEqual(2);
    expect(sample.energySpent).toBeGreaterThanOrEqual(6);
    session.assertHealthy();

    dumpTrace('BRONZE_FULL_TRACE', trace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_COPPER', copperTrace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_TIN', tinTrace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_COPPER_INGOT', copperIngotTrace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_TIN_INGOT', tinIngotTrace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_BRONZE', bronzeTrace);
    dumpTrace('EXACT_BUTTON_TRACE_TO_BRONZE_PICKAXE', pickTrace);
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        BRONZE_ECONOMY: sample,
        COPPER_ORE_END: copperEnd,
        TIN_ORE_END: tinEnd,
        COPPER_INGOT_END: await session.resource('COPPER_INGOT'),
        TIN_INGOT_END: await session.resource('TIN_INGOT'),
        BRONZE_INGOT_END: await session.resource('BRONZE_INGOT'),
        MINER_PROGRESS: minerAfterCopper?.progress ?? 0,
        CRAFTER_PROGRESS: crafter?.progress ?? 0,
      }),
    );
  });

  it('shows copper locked with an explanation until week 1, even with an iron pickaxe', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-cu-lock' });
    const player = await session.reload();
    player.currentLocation = 'player_camp';
    await session.store.savePlayer(player);
    await session.grantFlags(['player_camp_founded', 'furnace_placed', 'day_2_complete']);
    await session.giveItem('iron_pickaxe');
    await session.act('OPEN_MENU', { menu: 'gather' });
    await session.pressOnPages('Шахты');
    const seen = await session.collectPagedLabels();
    expect(seen.some((label) => /Медн/.test(label))).toBe(true);
    await session.act('MINE_ACT', { act: 'group', group: 'mines' });
    const info = await session.pressOnPages('Медн');
    expect(info.text).toMatch(/недел|железн|Откроется/i);
    expect(info.buttons.length).toBeGreaterThanOrEqual(2);
    expect(info.buttons.length).toBeLessThanOrEqual(5);
    expect(hasLabel(info, 'Добыть')).toBe(false);
    expect(await session.resource('COPPER_ORE')).toBe(0);
    session.assertHealthy();
  });

  it('shows copper and tin veins with an iron pick once their week gates are done', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-veins' });
    await seedIronPickWeek2(session);
    await session.act('OPEN_MENU', { menu: 'hub' });
    await session.press('Добыча');
    await session.press('Шахты');
    expect(hasLabel(session.last, 'Медн')).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    const copper = await session.press('Медн');
    expect(hasLabel(copper, 'Добыть')).toBe(true);
    await session.press('Шахты');
    const tin = await session.pressOnPages('Олов');
    expect(hasLabel(tin, 'Добыть')).toBe(true);
    expect(tin.text).toMatch(/бронз|железн/i);
    session.assertHealthy();
  });

  it('keeps bronze recipes visible without full ingredients and smelts via furnace UI', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-visible' });
    await seedIronPickWeek2(session);
    expect(await session.resource('COPPER_INGOT')).toBe(0);
    expect(await session.resource('TIN_INGOT')).toBe(0);
    expect(await session.resource('BRONZE_INGOT')).toBe(0);

    await session.act('OPEN_MENU', { menu: 'materials' });
    expect(session.last.text).not.toMatch(/Пока нечего/);
    expect(hasLabel(session.last, 'Бронза')).toBe(true);
    expect(session.last.text).toMatch(/медн|оловян/i);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    const missing = await session.press('Бронза');
    expect(missing.text).toMatch(/Не хватает/i);
    expect(hasLabel(missing, 'Бронза')).toBe(true);

    await session.act('OPEN_MENU', { menu: 'tools' });
    expect(session.last.text).not.toMatch(/Пока нечего/);
    const pickPage = await session.pressOnPages('Бронзовая кирка');
    expect(pickPage.text).toMatch(/кирк|Не хватает|бронз|палк/i);
    expect(await session.hasItem('bronze_pickaxe')).toBe(false);

    await session.store.addResource(session.playerId, 'COPPER_ORE', 1);
    await session.store.addResource(session.playerId, 'TIN_ORE', 1);
    await session.act('FURNACE_ACT', { act: 'open' });
    if (hasLabel(session.last, 'уголь')) await session.press('уголь');
    expect(hasLabel(session.last, 'Другая руда') || hasLabel(session.last, 'Ещё')).toBe(true);
    if (!hasLabel(session.last, 'Другая руда')) await session.press('Ещё');
    await session.press('Другая руда');
    expect(hasLabel(session.last, 'Медь')).toBe(true);
    expect(hasLabel(session.last, 'Олово')).toBe(true);
    await session.press('Медь');
    const copper = await session.press('Выплавить');
    expect(copper.text).toMatch(/Выплавлено|слит/i);
    expect(await session.resource('COPPER_INGOT')).toBe(1);
    await session.press('Другая руда');
    await session.press('Олово');
    const tin = await session.press('Выплавить');
    expect(tin.text).toMatch(/Выплавлено|слит/i);
    expect(await session.resource('TIN_INGOT')).toBe(1);
    session.assertHealthy();
  });

  it('keeps market allowlist, production mine, and week-7 absent', () => {
    for (const resource of ['COPPER_ORE', 'COPPER_INGOT', 'TIN_ORE', 'TIN_INGOT', 'BRONZE_INGOT'] as const) {
      expect(isTradeableResource(resource)).toBe(true);
      expect(TRADEABLE_RESOURCES).toContain(resource);
    }
    expect(isTradeableAsset('ITEM', 'bronze_pickaxe')).toBe(false);
    expect(isTradeableAsset('ITEM', 'iron_pickaxe')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_2')).toBe(false);
    expect(PRODUCTION_DEFS.MINE.primary).toBe('COAL');
    expect(PRODUCTION_DEFS.MINE.secondary).toBe('IRON_ORE');
    const produced = Object.values(PRODUCTION_DEFS).flatMap((row) => [row.primary, row.secondary]);
    expect(produced).not.toContain('COPPER_ORE');
    expect(produced).not.toContain('TIN_ORE');
    expect(produced).not.toContain('BRONZE_INGOT');
    expect((GAME_COMMANDS as readonly string[]).includes('BEGIN_DAY_43')).toBe(false);
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
  });

  it('does not count production mine collect as miner or copper yield', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-prod' });
    await seedIronPickWeek2(session);
    const now = session.clock.now();
    await acceptJobContract(session.store, session.playerId, 'miner_iron', now);
    await session.store.addResource(session.playerId, 'LOG', 80);
    await session.store.addResource(session.playerId, 'COBBLESTONE', 80);
    await session.store.addResource(session.playerId, 'IRON_INGOT', 8);
    const player = await session.reload();
    player.coins = 500;
    await session.store.savePlayer(player);
    await session.store.buildProductionBuilding({ playerId: session.playerId, buildingType: 'MINE', now });
    const later = new Date(now.getTime() + 12 * 3600 * 1000);
    await session.store.collectProductionBuilding({ playerId: session.playerId, buildingType: 'MINE', now: later });
    const res = await session.store.getResources(session.playerId);
    expect(res.COPPER_ORE ?? 0).toBe(0);
    expect(res.TIN_ORE ?? 0).toBe(0);
    expect((await session.store.getAcceptedJobTask(session.playerId, 'MINER'))!.progress).toBe(0);
  });
});
