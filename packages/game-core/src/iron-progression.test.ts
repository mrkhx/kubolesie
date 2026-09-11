import { describe, expect, it } from 'vitest';
import type { GameResponse } from '@kubolesie/shared';
import { Journey } from './fresh-journey';
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

async function seedExactPlayer(session: SimSession): Promise<void> {
  const player = await session.reload();
  player.hp = 105;
  player.maxHp = 105;
  player.energy = 21;
  player.maxEnergy = 21;
  player.coins = 75;
  player.currentLocation = 'forest_clearing';
  await session.store.savePlayer(player);
  await session.store.setFlag(session.playerId, 'player_camp_founded', '1');
  await session.store.setFlag(session.playerId, 'camp_table_placed', '1');
  await session.store.addResource(session.playerId, 'IRON_ORE', 18);
  await session.store.addResource(session.playerId, 'FOOD', 2);
  await session.store.addResource(session.playerId, 'COAL', 61);
  await session.store.addResource(session.playerId, 'COBBLESTONE', 13);
  await session.store.addResource(session.playerId, 'LOG', 110);
  await session.store.addResource(session.playerId, 'PLANK', 13);
  await session.giveItem('stone_knife');
  await session.giveItem('rusty_token', 'UNCOMMON');
  await session.giveItem('crafting_table');
  await session.giveItem('wooden_pickaxe');
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
  }
  throw new Error(`no button "${part}". have: ${labelsOf(session.last).join(', ')}\n${session.last.text}`);
}

async function backUntil(session: SimSession, part: string, trace: TraceStep[]): Promise<GameResponse> {
  for (let i = 0; i < 8; i += 1) {
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

describe('exact production iron player', { timeout: 30_000 }, () => {
  it('OPEN_CAMP → live buttons → furnace → smelt → iron pickaxe', async () => {
    const session = await SimSession.boot({ vkUserId: 'iron-exact' });
    await seedExactPlayer(session);
    expect(await session.hasItem('furnace')).toBe(false);
    expect(await session.flag('camp_fire_built')).toBeUndefined();
    expect(await session.flag('day_3_complete')).toBeUndefined();
    expect(await session.resource('IRON_ORE')).toBe(18);
    expect(await session.resource('COAL')).toBe(61);

    const hub = await session.act('OPEN_CAMP');
    expect(hub.text).toMatch(/костра нет/i);
    expect(hub.text).toMatch(/Печь/);
    expect(hub.text).not.toMatch(/Пока нечего/);
    expect(hasLabel(hub, 'Крафт')).toBe(true);
    expect(hasLabel(hub, 'Стан')).toBe(true);
    expect(hub.buttons.length).toBeLessThanOrEqual(5);

    const trace: TraceStep[] = [
      { n: 0, press: 'OPEN_CAMP', text: hub.text, buttons: labelsOf(hub) },
    ];

    await pressNamed(session, 'Крафт', trace);
    await pressNamed(session, 'Базовый', trace);
    expect(session.last.text).not.toMatch(/Пока нечего/);
    expect(hasLabel(session.last, 'Костёр')).toBe(true);
    await pressNamed(session, 'Ещё', trace);
    expect(hasLabel(session.last, 'Печь')).toBe(true);

    await backUntil(session, 'Стан', trace);
    await pressNamed(session, 'Стан', trace);
    expect(session.last.text).toMatch(/Костёр/);
    expect(session.last.text).toMatch(/Печь/);
    expect(hasLabel(session.last, 'Костёр')).toBe(true);
    expect(hasLabel(session.last, 'Печь')).toBe(true);

    const fireFail = await pressNamed(session, 'Костёр', trace);
    expect(fireFail.text).toMatch(/Не хватает|палки/i);
    expect(hasLabel(fireFail, 'Костёр')).toBe(true);
    expect(hasLabel(fireFail, 'Печь')).toBe(true);

    const made = await pressNamed(session, 'Печь', trace);
    expect(made.text).toMatch(/Печь|Скрафчено/i);
    expect(await session.flag('furnace_placed')).toBe('1');
    expect(await session.resource('COBBLESTONE')).toBe(5);

    const furnace = await pressNamed(session, 'Печь', trace);
    expect(furnace.text).toMatch(/Печь/);
    expect(hasLabel(furnace, 'уголь') || hasLabel(furnace, 'руду')).toBe(true);

    await pressNamed(session, 'уголь', trace);
    expect(await session.resource('COAL')).toBe(60);
    expect(Number((await session.flag('furnace_fuel')) ?? 0)).toBe(8);

    await pressNamed(session, 'руду', trace);
    await pressNamed(session, 'руду', trace);
    await pressNamed(session, 'руду', trace);
    if (!hasLabel(session.last, 'Забрать') && hasLabel(session.last, 'Ещё')) {
      await pressNamed(session, 'Ещё', trace);
    }
    const taken = await pressNamed(session, 'Забрать', trace);
    expect(taken.text).toMatch(/слитк/i);
    expect(await session.resource('IRON_INGOT')).toBe(3);
    expect(await session.resource('IRON_ORE')).toBe(15);

    await backUntil(session, 'Крафт', trace);
    await pressNamed(session, 'Крафт', trace);
    await pressNamed(session, 'Базовый', trace);
    const sticks = await pressNamed(session, 'Палки', trace);
    expect(sticks.text).toMatch(/Палки|Скрафчено/i);
    expect(await session.resource('STICK')).toBeGreaterThanOrEqual(2);

    await backUntil(session, 'Инструменты', trace);
    await pressNamed(session, 'Инструменты', trace);
    const pick = await pressNamed(session, 'Железная кирка', trace);
    expect(pick.text).toMatch(/кирк|Скрафчено/i);
    expect(await session.hasItem('iron_pickaxe')).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    session.assertHealthy();

    // eslint-disable-next-line no-console
    console.info(JSON.stringify({ IRON_BUTTON_TRACE: trace.map((step) => ({
      n: step.n,
      press: step.press,
      buttons: step.buttons,
      textHead: step.text.split('\n').slice(0, 4).join(' | '),
    })) }, null, 2));
  });
});

describe('fresh survival iron press-only', { timeout: 180_000 }, () => {
  it('START_GAME → Day2 camp → furnace → iron tool without Day 3', async () => {
    const journey = await Journey.start('iron-fresh');
    await journey.playDay1();
    await journey.playDay2();
    expect(await journey.flag('day_2_complete')).toBe('1');
    expect(await journey.flag('day_3_complete')).toBeUndefined();
    expect(await journey.flag('player_camp_founded')).toBe('1');

    if (!(await journey.flag('furnace_placed'))) {
      await journey.untilResource('COBBLESTONE', 8, async () => journey.cobble(1));
      await journey.goHub();
      if (journey.has('🏕 Стан')) await journey.click('🏕 Стан');
      if (journey.has('Печь')) await journey.click('Печь');
      else await journey.craft('Печь');
    }
    expect(await journey.flag('furnace_placed')).toBe('1');
    expect(await journey.flag('day_3_complete')).toBeUndefined();

    await journey.needIngots(3);
    expect(await journey.session.resource('IRON_INGOT')).toBeGreaterThanOrEqual(3);
    await journey.needSticks(2);
    if (!(await journey.session.hasItem('iron_pickaxe'))) {
      await journey.craft('Железная кирка');
    }
    expect(await journey.session.hasItem('iron_pickaxe')).toBe(true);
    expect(await journey.flag('day_3_complete')).toBeUndefined();
    journey.session.assertHealthy();
  });
});

describe('bronze next-tier discoverability', { timeout: 30_000 }, () => {
  it('after iron, copper is locked with an explanation until week 1', async () => {
    const session = await SimSession.boot({ vkUserId: 'iron-copper-lock' });
    await seedExactPlayer(session);
    await session.giveItem('iron_pickaxe');
    await session.store.setFlag(session.playerId, 'furnace_placed', '1');
    await session.act('OPEN_MENU', { menu: 'gather' });
    if (hasLabel(session.last, 'Шахты')) await session.press('Шахты');
    else if (hasLabel(session.last, 'Ещё')) {
      await session.press('Ещё');
      if (hasLabel(session.last, 'Шахты')) await session.press('Шахты');
    }
    const seen = await session.collectPagedLabels();
    expect(seen.some((label) => /Медн|медь/i.test(label))).toBe(true);
    const locked = session.last.buttons.find((button) => /Медн|медь/i.test(button.label));
    if (locked) {
      const info = await session.act(locked.action as 'MINE_ACT', locked.payload ?? {});
      expect(info.text).toMatch(/недел|железн|кирк|закро/i);
      expect(info.buttons.length).toBeGreaterThanOrEqual(2);
      expect(info.buttons.length).toBeLessThanOrEqual(5);
    }
    session.assertHealthy();
  });

  it('week 2 player smelts copper/tin and crafts bronze pickaxe via live buttons', async () => {
    const session = await SimSession.boot({ vkUserId: 'bronze-next' });
    const player = await session.reload();
    player.currentLocation = 'player_camp';
    await session.store.savePlayer(player);
    await session.grantFlags([
      'player_camp_founded',
      'camp_table_placed',
      'camp_fire_built',
      'day_2_complete',
      'furnace_placed',
      'furnace_built',
      'first_ingot',
      'week_1_complete',
      'week_2_complete',
    ]);
    await session.giveItem('crafting_table');
    await session.giveItem('iron_pickaxe');
    await session.store.addResource(session.playerId, 'COPPER_ORE', 3);
    await session.store.addResource(session.playerId, 'TIN_ORE', 1);
    await session.store.addResource(session.playerId, 'COAL', 4);
    await session.store.addResource(session.playerId, 'STICK', 2);
    await session.store.setFlag(session.playerId, 'furnace_fuel', '8');

    await session.act('OPEN_CAMP');
    if (hasLabel(session.last, 'Стан')) await session.press('Стан');
    expect(hasLabel(session.last, 'Печь')).toBe(true);
    await session.press('Печь');
    if (hasLabel(session.last, 'Другая руда')) await session.press('Другая руда');
    const orePage = session.last;
    expect(orePage.buttons.length).toBeLessThanOrEqual(5);
    expect(labelsOf(orePage).some((label) => /Медь|Олово|руда/i.test(label))).toBe(true);

    const smeltNamed = async (part: string) => {
      if (!hasLabel(session.last, part)) {
        if (hasLabel(session.last, 'Другая руда')) await session.press('Другая руда');
        else if (hasLabel(session.last, 'Назад')) {
          await session.press('Назад');
          if (hasLabel(session.last, 'Другая руда')) await session.press('Другая руда');
        }
      }
      for (let page = 0; page < 6; page += 1) {
        if (hasLabel(session.last, part)) {
          await session.press(part);
          expect(hasLabel(session.last, 'Выплавить')).toBe(true);
          const melted = await session.press('Выплавить');
          expect(melted.text).toMatch(/Выплавлено|слит/i);
          return;
        }
        if (!hasLabel(session.last, 'Ещё')) break;
        await session.press('Ещё');
      }
      throw new Error(`no ore ${part}: ${labelsOf(session.last).join(', ')}`);
    };
    await smeltNamed('Медь');
    await smeltNamed('Медь');
    await smeltNamed('Медь');
    await smeltNamed('Олово');
    expect(await session.resource('COPPER_INGOT')).toBeGreaterThanOrEqual(3);
    expect(await session.resource('TIN_INGOT')).toBeGreaterThanOrEqual(1);

    await session.act('OPEN_CAMP');
    if (hasLabel(session.last, 'Крафт')) await session.press('Крафт');
    else if (hasLabel(session.last, 'Отойти')) {
      await session.press('Отойти');
      await session.press('Крафт');
    }
    await session.press('Материалы');
    const bronze = await session.pressOnPages('Бронза');
    expect(bronze.text).toMatch(/Бронз|Скрафчено/i);
    expect(await session.resource('BRONZE_INGOT')).toBeGreaterThanOrEqual(3);

    if (hasLabel(session.last, 'Назад')) await session.press('Назад');
    await session.press('Инструменты');
    const pick = await session.pressOnPages('Бронзовая кирка');
    expect(pick.text).toMatch(/кирк|Скрафчено/i);
    expect(await session.hasItem('bronze_pickaxe')).toBe(true);
    session.assertHealthy();
  });
});
