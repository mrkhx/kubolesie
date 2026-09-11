import { describe, expect, it } from 'vitest';
import { PROTOTYPE_VERSION } from '@kubolesie/shared';
import { Journey, playFresh42, MissingPlayerAction } from './fresh-journey';
import { SimSession } from './simulation';

describe('fresh42DayJourney', { timeout: 360_000 }, () => {
  it('stays on prototype 0.0.13', () => {
    expect(PROTOTYPE_VERSION).toBe('0.0.13');
  });

  it('Day1 crate → rem → table → pickaxe → iron → night via visible buttons', async () => {
    const journey = await Journey.start('fresh-d1');
    await journey.playDay1();
    expect(await journey.flag('day_1_complete')).toBe('1');
    expect(await journey.session.hasItem('crafting_table')).toBe(true);
    expect(await journey.session.hasItem('wooden_pickaxe')).toBe(true);
    expect(journey.session.last.buttons.length).toBeLessThanOrEqual(5);
    expect(journey.labels().some((label) => label.includes('День 2'))).toBe(true);
    journey.session.assertHealthy();
  });

  it('press-only 42-day run from START_GAME to week6_complete', async () => {
    const report = await playFresh42();
    if (!report.ok) {
      throw new MissingPlayerAction(
        [
          `FRESH_42_DAY_PRESS_ONLY failed after days=[${report.days.join(',')}] steps=${report.steps}`,
          report.missing ?? 'unknown',
        ].join('\n'),
      );
    }
    expect(report.ok).toBe(true);
    expect(report.week6Complete).toBe(true);
    expect(report.days).toHaveLength(42);
    expect(report.beginDay43Visible).toBe(false);
    expect(report.overflow).toBe(0);
    expect(report.steps).toBeGreaterThan(40);
  });
});

describe('fresh journey UI leftovers', { timeout: 30_000 }, () => {
  it('camp menu keeps the active week act when furnace+farm+work+vel are all present', async () => {
    const session = await SimSession.boot({ vkUserId: 'fresh-camp' });
    await session.grantFlags([
      'player_camp_founded',
      'camp_table_placed',
      'camp_fire_built',
      'day_2_complete',
      'day_3_complete',
      'furnace_placed',
      'met_vel',
      'farming_unlocked',
      'week_1_complete',
      'week_2_complete',
    ]);
    const player = await session.reload();
    player.currentLocation = 'player_camp';
    await session.store.savePlayer(player);
    await session.act('OPEN_MENU', { menu: 'camp' });
    const seen = await session.collectPagedLabels();
    expect(seen.some((label) => label.includes('Чаща'))).toBe(true);
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    expect(seen.some((label) => label.includes('Назад'))).toBe(true);
    session.assertHealthy();
  });

  it('quarry hub still offers Стан so the furnace stays reachable', async () => {
    const session = await SimSession.boot({ vkUserId: 'fresh-quarry-hub' });
    await session.grantFlags([
      'player_camp_founded',
      'camp_table_placed',
      'camp_fire_built',
      'day_2_complete',
      'day_3_complete',
      'furnace_placed',
      'week_1_complete',
    ]);
    const player = await session.reload();
    player.currentLocation = 'drowned_quarry';
    await session.store.savePlayer(player);
    await session.act('OPEN_CAMP');
    expect(session.last.buttons.length).toBeLessThanOrEqual(5);
    expect(session.last.buttons.some((button) => button.label.includes('Стан'))).toBe(true);
    await session.press('Стан');
    expect(session.last.buttons.some((button) => button.label.includes('Печь'))).toBe(true);
    session.assertHealthy();
  });
});
