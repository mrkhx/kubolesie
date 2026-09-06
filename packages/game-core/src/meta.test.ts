import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  catalogHasCombatStats,
  COSMETIC_PRODUCTS,
  CURRENT_SEASON,
  eloDelta,
  isoWeekKey,
  ITEM_TEMPLATES,
  PVP_RATING,
  validateClanName,
  validateClanTag,
} from '@kubolesie/content';
import { GAME_COMMANDS, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { noteActivity } from './meta';
import type { PlayerRecord } from './store';

function event(
  type: NormalizedIncomingEvent['command']['type'],
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-meta',
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
  };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`, name = 'Путник') {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const started = await runtime.handle(
    {
      eventId: `start-${vkUserId}`,
      identity: { provider: 'vk', providerUserId: vkUserId, displayName: name },
      command: { type: 'START_GAME' },
    },
  );
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

function labels(response: { buttons: Array<{ label: string }> }) {
  return response.buttons.map((button) => button.label);
}

describe('statistics', () => {
  it('increments PvE win once and ignores DRAW for win/loss', async () => {
    const { store, player } = await boot();
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' });
    await noteActivity(store, player, { type: 'pve', result: 'DRAW', enemyId: 'wild_shrew' });
    const stats = await store.getStatistics(player.id);
    expect(stats.pveWins).toBe(1);
    expect(stats.pveLosses).toBe(0);
  });

  it('duplicate event_id does not increment gather twice', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-dup');
    const mid = await store.getStatistics(player.id);
    expect(mid.resourcesGathered).toBeGreaterThan(0);
    await act(runtime, vkUserId, 'GATHER_WOOD', {}, 'gather-dup');
    expect((await store.getStatistics(player.id)).resourcesGathered).toBe(mid.resourcesGathered);
    expect((await store.getResources(player.id)).LOG).toBe(6);
  });

  it('records PvE loss, PvP win/loss, boss clear, gather, craft, trade, quest', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await noteActivity(store, player, { type: 'pve', result: 'LOSS', enemyId: 'wild_shrew' });
    await noteActivity(store, player, { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' });
    await noteActivity(store, player, { type: 'pvp', result: 'LOSS', rivalId: 'wedge_scout' });
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'stumpfang' });
    await act(runtime, vkUserId, 'GATHER_WOOD');
    await store.addResource(player.id, 'LOG', 1);
    await act(runtime, vkUserId, 'CRAFT_ITEM', { recipeId: 'planks' });
    await noteActivity(store, await reload(store, player.id), { type: 'trade' });
    await noteActivity(store, await reload(store, player.id), { type: 'quest', id: 'found_a_camp' });
    const stats = await store.getStatistics(player.id);
    expect(stats.pveLosses).toBe(1);
    expect(stats.pvpWins).toBe(1);
    expect(stats.pvpLosses).toBe(1);
    expect(stats.bossWins).toBe(1);
    expect(stats.pveWins).toBe(1);
    expect(stats.resourcesGathered).toBeGreaterThan(0);
    expect(stats.craftedItems).toBe(1);
    expect(stats.tradesCompleted).toBe(1);
    expect(stats.questsCompleted).toBe(1);
  });

  it('backfills Week 1 flags without inventing kill counts', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await store.setFlag(player.id, 'player_camp_founded', '1');
    await store.setFlag(player.id, 'first_ingot', '1');
    await store.setFlag(player.id, 'defeated_stumpfang', '1');
    await store.setFlag(player.id, 'wenzel_defeated', '1');
    await store.setFlag(player.id, 'week_1_complete', '1');
    for (let day = 1; day <= 7; day += 1) await store.setFlag(player.id, `day_${day}_complete`, '1');
    const profile = await act(runtime, vkUserId, 'OPEN_PROFILE');
    expect(profile.text).toContain('Неделя 1 закрыта');
    expect(profile.text).not.toContain(player.id);
    expect(profile.text).not.toContain(vkUserId);
    const stats = await store.getStatistics(player.id);
    expect(stats.daysCompleted).toBe(7);
    expect(stats.pveWins).toBe(0);
    expect(stats.bossWins).toBe(0);
    const owned = (await store.listAchievements(player.id)).map((row) => row.achievementId);
    expect(owned).toEqual(
      expect.arrayContaining(['FIRST_CAMP', 'FIRST_IRON', 'FIRST_BOSS', 'WEEK_ONE_COMPLETE']),
    );
    expect(await store.hasEntitlement(player.id, 'title_node_warden')).toBe(true);
    expect(await store.hasEntitlement(player.id, 'badge_week1')).toBe(true);
  });
});

describe('ratings', () => {
  it('orders global top 10 in the store and reports own rank', async () => {
    const store = new MemoryGameStore();
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const player = await store.createPlayer({ vkUserId: `vk-board-${i}`, name: `Игрок ${String(i).padStart(2, '0')}` });
      ids.push(player.id);
      const rating = await store.getRating(player.id);
      rating.lifetimeScore = (12 - i) * 100;
      rating.pvpRating = 1000 + (12 - i);
      await store.saveRating(rating);
    }
    const top = await store.listScoreboard('score', '2026-W37', 10, 0);
    expect(top).toHaveLength(10);
    expect(top[0]!.value).toBe(1200);
    expect(top[9]!.value).toBe(300);
    expect(top.every((row, index) => index === 0 || row.value <= top[index - 1]!.value)).toBe(true);
    expect(await store.getScoreboardRank('score', ids[0]!, '2026-W37')).toBe(1);
    expect(await store.getScoreboardRank('score', ids[11]!, '2026-W37')).toBe(12);
    const page2 = await store.listScoreboard('score', '2026-W37', 10, 10);
    expect(page2).toHaveLength(2);
  });

  it('updates PvP Elo, floors/ceils, and is idempotent on event replay', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const before = (await store.getRating(player.id)).pvpRating;
    expect(before).toBe(PVP_RATING.start);
    await noteActivity(store, player, { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' });
    const mid = await store.getRating(player.id);
    const expected = before + eloDelta(before, PVP_RATING.synthetic.yara_trace, true, PVP_RATING.k);
    expect(mid.pvpRating).toBe(expected);
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' });
    const repeat = await store.getRating(player.id);
    expect(repeat.pvpRating).toBe(
      mid.pvpRating + eloDelta(mid.pvpRating, PVP_RATING.synthetic.yara_trace, true, PVP_RATING.kRepeat),
    );
    await store.setFlag(player.id, 'yara_claim_seen', '1');
    const first = await act(runtime, vkUserId, 'START_PVP', { rivalId: 'yara_trace' }, 'pvp-dup');
    const ratingAfter = (await store.getRating(player.id)).pvpRating;
    const second = await act(runtime, vkUserId, 'START_PVP', { rivalId: 'yara_trace' }, 'pvp-dup');
    expect(second).toEqual(first);
    expect((await store.getRating(player.id)).pvpRating).toBe(ratingAfter);
    const floor = await store.getRating(player.id);
    floor.pvpRating = PVP_RATING.floor;
    await store.saveRating(floor);
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'LOSS', rivalId: 'foreign_post' });
    expect((await store.getRating(player.id)).pvpRating).toBeGreaterThanOrEqual(PVP_RATING.floor);
  });

  it('isolates weekly score and keeps lifetime after period change', async () => {
    const { store, player } = await boot();
    const weekA = new Date('2026-09-07T12:00:00.000Z');
    const weekB = new Date('2026-09-14T12:00:00.000Z');
    expect(isoWeekKey(weekA)).toBe('2026-W37');
    expect(isoWeekKey(weekB)).toBe('2026-W38');
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' }, weekA);
    const afterA = await store.getRating(player.id);
    expect(afterA.weeklyPeriod).toBe('2026-W37');
    expect(afterA.weeklyScore).toBeGreaterThan(0);
    expect(afterA.lifetimeScore).toBeGreaterThan(0);
    const lifetime = afterA.lifetimeScore;
    const weeklyA = afterA.weeklyScore;
    await noteActivity(store, await reload(store, player.id), { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' }, weekB);
    const afterB = await store.getRating(player.id);
    expect(afterB.weeklyPeriod).toBe('2026-W38');
    expect(afterB.weeklyScore).toBe(weeklyA);
    expect(afterB.lifetimeScore).toBeGreaterThan(lifetime);
    const weeklyBoard = await store.listScoreboard('weekly', '2026-W37', 10, 0);
    expect(weeklyBoard.every((row) => row.id !== player.id)).toBe(true);
    const currentWeekly = await store.listScoreboard('weekly', '2026-W38', 10, 0);
    expect(currentWeekly.some((row) => row.id === player.id)).toBe(true);
  });

  it('season foundation is config-only Предсезон without auto-rotation', () => {
    expect(CURRENT_SEASON.id).toBe('season_0');
    expect(CURRENT_SEASON.name).toBe('Предсезон');
    expect(CURRENT_SEASON.status).toBe('ACTIVE');
  });
});

describe('clans', () => {
  it('creates a clan with unique case-insensitive name and tag', async () => {
    const store = new MemoryGameStore();
    const runtimeA = new GameRuntime(store);
    const runtimeB = new GameRuntime(store);
    await runtimeA.handle(event('START_GAME', {}, 's-a', 'vk-a'));
    await runtimeB.handle(event('START_GAME', {}, 's-b', 'vk-b'));
    const created = await act(runtimeA, 'vk-a', 'CLAN_ACT', {
      act: 'create',
      name: 'Сизый Клин',
      tag: 'клн',
      description: 'Стая',
    });
    expect(created.text).toContain('Сизый Клин');
    expect(created.text).toContain('[КЛН]');
    const already = await act(runtimeA, 'vk-a', 'CLAN_ACT', { act: 'create', name: 'сизый клин', tag: 'zzz' });
    expect(already.text).toMatch(/уже в клане/i);
    const taken = await act(runtimeB, 'vk-b', 'CLAN_ACT', {
      act: 'create',
      name: 'СИЗЫЙ КЛИН',
      tag: 'aaa',
    });
    expect(taken.text).toMatch(/Имя занято/i);
    const tagTaken = await act(runtimeB, 'vk-b', 'CLAN_ACT', {
      act: 'create',
      name: 'Другая стая',
      tag: 'клн',
    });
    expect(tagTaken.text).toMatch(/Тег занят/i);
    expect(() => validateClanName(' ')).toThrow();
    expect(() => validateClanName('<admin>')).toThrow();
    expect(() => validateClanTag('x')).toThrow();
    expect(validateClanTag('ab')).toBe('AB');
  });

  it('enforces one clan per player and application flow', async () => {
    const store = new MemoryGameStore();
    const runtimeLead = new GameRuntime(store);
    const runtimeApp = new GameRuntime(store);
    await runtimeLead.handle(event('START_GAME', {}, 's-lead', 'vk-lead'));
    await runtimeApp.handle(event('START_GAME', {}, 's-app', 'vk-app'));
    const lead = (await store.findPlayerByVkUserId('vk-lead'))!;
    const applicant = (await store.findPlayerByVkUserId('vk-app'))!;
    await act(runtimeLead, 'vk-lead', 'CLAN_ACT', { act: 'create', name: 'Узел', tag: 'узел' });
    const clan = (await store.getPlayerClan(lead.id))!.clan;
    const already = await act(runtimeLead, 'vk-lead', 'CLAN_ACT', {
      act: 'create',
      name: 'Второй',
      tag: 'вт',
    });
    expect(already.text).toMatch(/уже в клане/i);
    const apply = await act(runtimeApp, 'vk-app', 'CLAN_ACT', { act: 'apply', clanId: clan.id });
    expect(apply.text).toContain('Заявка');
    await expect(store.createApplication(clan.id, applicant.id)).rejects.toThrow('duplicate_application');
    const apps = await store.listPendingApplications(clan.id);
    expect(apps).toHaveLength(1);
    const accept = await act(runtimeLead, 'vk-lead', 'CLAN_ACT', { act: 'accept', appId: apps[0]!.id });
    expect(accept.text).toContain('Принят');
    expect((await store.getPlayerClan(applicant.id))?.clan.id).toBe(clan.id);
    const again = await act(runtimeLead, 'vk-lead', 'CLAN_ACT', { act: 'accept', appId: apps[0]!.id });
    expect(again.text).toMatch(/нет|клане/i);
  });

  it('rejects applications, leave/kick/promote/transfer and blocks leader escape', async () => {
    const store = new MemoryGameStore();
    const lead = await store.createPlayer({ vkUserId: 'l', name: 'Лидер' });
    const off = await store.createPlayer({ vkUserId: 'o', name: 'Офицер' });
    const mem = await store.createPlayer({ vkUserId: 'm', name: 'Рядовой' });
    const extra = await store.createPlayer({ vkUserId: 'e', name: 'Лишний' });
    const clan = await store.createClan({ name: 'Стая', tag: 'СТАЯ', description: '', leaderPlayerId: lead.id });
    await store.addClanMember({ clanId: clan.id, playerId: off.id, role: 'OFFICER' });
    await store.addClanMember({ clanId: clan.id, playerId: mem.id, role: 'MEMBER' });
    const runtimeLead = new GameRuntime(store);
    const runtimeMem = new GameRuntime(store);
    const runtimeOff = new GameRuntime(store);
    await runtimeLead.handle(event('START_GAME', {}, 's-l', 'l'));
    await runtimeMem.handle(event('START_GAME', {}, 's-m', 'm'));
    await runtimeOff.handle(event('START_GAME', {}, 's-o', 'o'));
    const leaveLead = await act(runtimeLead, 'l', 'CLAN_ACT', { act: 'leave' });
    expect(leaveLead.text).toMatch(/передаёт|распускает/i);
    const kickFail = await act(runtimeMem, 'm', 'CLAN_ACT', { act: 'kick', targetId: off.id });
    expect(kickFail.text).toMatch(/Нет прав/i);
    await store.addClanMember({ clanId: clan.id, playerId: extra.id, role: 'MEMBER' });
    const kickLead = await act(runtimeOff, 'o', 'CLAN_ACT', { act: 'kick', targetId: lead.id });
    expect(kickLead.text).toMatch(/Лидера не выгнать/i);
    const kickExtra = await act(runtimeOff, 'o', 'CLAN_ACT', { act: 'kick', targetId: extra.id });
    expect(kickExtra.text).toContain('Исключён');
    const app = await store.createApplication(clan.id, extra.id);
    const reject = await act(runtimeOff, 'o', 'CLAN_ACT', { act: 'reject', appId: app.id });
    expect(reject.text).toContain('отклонена');
    const promote = await act(runtimeLead, 'l', 'CLAN_ACT', { act: 'promote', targetId: mem.id });
    expect(promote.text).toContain('Повышен');
    const demote = await act(runtimeLead, 'l', 'CLAN_ACT', { act: 'demote', targetId: mem.id });
    expect(demote.text).toContain('Понижен');
    const transfer = await act(runtimeLead, 'l', 'CLAN_ACT', { act: 'transfer', targetId: off.id });
    expect(transfer.text).toContain('передано');
    expect((await store.getPlayerClan(off.id))?.member.role).toBe('LEADER');
    expect((await store.getPlayerClan(lead.id))?.member.role).toBe('OFFICER');
    const leave = await act(runtimeMem, 'm', 'CLAN_ACT', { act: 'leave' });
    expect(leave.text).toContain('вышел');
    expect(await store.getPlayerClan(mem.id)).toBeNull();
  });

  it('serializes duplicate accept so a player joins only one clan', async () => {
    const store = new MemoryGameStore();
    const a = await store.createPlayer({ vkUserId: 'a', name: 'А' });
    const b = await store.createPlayer({ vkUserId: 'b', name: 'Б' });
    const target = await store.createPlayer({ vkUserId: 't', name: 'Цель' });
    const clanA = await store.createClan({ name: 'Альфа', tag: 'АЛФ', description: '', leaderPlayerId: a.id });
    const clanB = await store.createClan({ name: 'Бета', tag: 'БЕТ', description: '', leaderPlayerId: b.id });
    const results = await Promise.allSettled([
      store.addClanMember({ clanId: clanA.id, playerId: target.id, role: 'MEMBER' }),
      store.addClanMember({ clanId: clanB.id, playerId: target.id, role: 'MEMBER' }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    const membership = await store.getPlayerClan(target.id);
    expect(membership).not.toBeNull();
    expect([clanA.id, clanB.id]).toContain(membership!.clan.id);
  });

  it('grants clan XP and contribution from quests/boss/pvp/week, not gather/craft', async () => {
    const { store, player } = await boot();
    const clan = await store.createClan({ name: 'Вклад', tag: 'ВКЛ', description: '', leaderPlayerId: player.id });
    const period = isoWeekKey(new Date('2026-09-07T12:00:00.000Z'));
    const now = new Date('2026-09-07T12:00:00.000Z');
    await noteActivity(store, player, { type: 'gather', amount: 50 }, now);
    await noteActivity(store, await reload(store, player.id), { type: 'craft', count: 10 }, now);
    expect((await store.getClan(clan.id))!.xp).toBe(0);
    expect(await store.getContribution(clan.id, player.id, period)).toBe(0);
    await noteActivity(store, await reload(store, player.id), { type: 'quest', id: 'hold_the_hinges' }, now);
    await noteActivity(store, await reload(store, player.id), { type: 'pve', result: 'WIN', enemyId: 'stumpfang' }, now);
    await noteActivity(store, await reload(store, player.id), { type: 'pvp', result: 'WIN', rivalId: 'yara_trace' }, now);
    await store.setFlag(player.id, 'week_1_complete', '1');
    await noteActivity(store, await reload(store, player.id), { type: 'week' }, now);
    const fresh = (await store.getClan(clan.id))!;
    expect(fresh.xp).toBeGreaterThan(0);
    expect(fresh.level).toBeGreaterThanOrEqual(1);
    expect(await store.getContribution(clan.id, player.id, period)).toBe(fresh.xp);
    const board = await store.listClanLeaderboard(period, 10, 0);
    expect(board[0]!.id).toBe(clan.id);
    expect(board[0]!.value).toBeGreaterThan(0);
    expect(await store.getClanLeaderboardRank(clan.id, period)).toBe(1);
  });
});

describe('monetization foundation', () => {
  it('loads a cosmetic catalog with no combat stats', () => {
    expect(Object.keys(COSMETIC_PRODUCTS).length).toBeGreaterThan(0);
    expect(catalogHasCombatStats()).toBe(false);
    for (const product of Object.values(COSMETIC_PRODUCTS)) {
      expect(ITEM_TEMPLATES[product.id]).toBeUndefined();
      expect(JSON.stringify(product).toLowerCase()).not.toMatch(/"attack"|"defense"|"hp"|"damage"/);
    }
    expect(Object.keys(ACHIEVEMENTS)).toHaveLength(8);
  });

  it('keeps entitlements unique and blocks unequipped cosmetics', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    expect(await store.tryGrantEntitlement(player.id, 'title_pathfinder', 'test')).toBe(true);
    expect(await store.tryGrantEntitlement(player.id, 'title_pathfinder', 'test')).toBe(false);
    const denied = await act(runtime, vkUserId, 'COSMETIC_ACT', { act: 'equip', productId: 'frame_ashen' });
    expect(denied.text).toMatch(/не принадлежит/i);
    const equipped = await act(runtime, vkUserId, 'COSMETIC_ACT', { act: 'equip', productId: 'title_pathfinder' });
    expect(equipped.text).toContain('Первопроходец');
    expect((await store.getCosmetics(player.id)).title).toBe('title_pathfinder');
    const stats = { ...(await reload(store, player.id)).stats };
    expect(stats.attack).toBe(5);
  });

  it('has no production purchase command and premium is unused in combat', async () => {
    expect(GAME_COMMANDS.some((command) => command.includes('BUY'))).toBe(false);
    expect(GAME_COMMANDS).not.toContain('GRANT_PREMIUM');
    expect(GAME_COMMANDS).not.toContain('SET_RATING');
    expect(GAME_COMMANDS).not.toContain('SET_STATS');
    expect(GAME_COMMANDS).not.toContain('BEGIN_DAY_8');
    const { store, runtime, player, vkUserId } = await boot();
    const before = await reload(store, player.id);
    await act(runtime, vkUserId, 'START_PVE', { enemyId: 'wild_shrew' });
    const after = await reload(store, player.id);
    expect(after.stats).toEqual(before.stats);
    expect('premium' in after).toBe(false);
  });
});

describe('hub and playthrough', () => {
  it('keeps a compact Герой hub without exposing ids', async () => {
    const { runtime, vkUserId, player } = await boot();
    const hub = await act(runtime, vkUserId, 'OPEN_CAMP');
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(labels(hub)).toContain('👤 Герой');
    const hero = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'hero' });
    expect(hero.buttons.length).toBeLessThanOrEqual(5);
    expect(labels(hero)).toEqual(['👤 Профиль', '📊 Статистика', '🏆 Рейтинги', '🛡 Клан', '🔙 Назад']);
    const profile = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'profile' });
    expect(profile.text).toContain(player.name);
    expect(profile.text).not.toContain(player.id);
    expect(profile.text).toMatch(/Уровень/);
    const stats = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'stats' });
    expect(stats.text).toContain('считает сервер');
    const ratings = await act(runtime, vkUserId, 'OPEN_MENU', { menu: 'ratings' });
    expect(ratings.buttons.length).toBeLessThanOrEqual(5);
    expect(labels(ratings)).toEqual(['🌍 Общий', '⚔ PvP', '📅 Недельный', '🛡 Кланы', '🔙 Назад']);
  });

  it('mock playthrough: profile, clan join, contribution, week-1 title, no power', async () => {
    const store = new MemoryGameStore();
    const runtimeA = new GameRuntime(store);
    const runtimeB = new GameRuntime(store);
    await runtimeA.handle(event('START_GAME', {}, 's-a', 'vk-a'));
    await runtimeB.handle(event('START_GAME', {}, 's-b', 'vk-b'));
    const a = (await store.findPlayerByVkUserId('vk-a'))!;
    const b = (await store.findPlayerByVkUserId('vk-b'))!;
    const profile = await act(runtimeA, 'vk-a', 'OPEN_PROFILE');
    expect(profile.text).toContain(a.name);
    expect(profile.text).toContain('Score');
    await act(runtimeA, 'vk-a', 'OPEN_MENU', { menu: 'stats' });
    await act(runtimeA, 'vk-a', 'OPEN_MENU', { menu: 'ratings' });
    await act(runtimeA, 'vk-a', 'CLAN_ACT', { act: 'create', name: 'Печать', tag: 'ПЧТ' });
    const clan = (await store.getPlayerClan(a.id))!.clan;
    await store.createApplication(clan.id, b.id);
    const app = (await store.listPendingApplications(clan.id))[0]!;
    await act(runtimeA, 'vk-a', 'CLAN_ACT', { act: 'accept', appId: app.id });
    expect((await store.getPlayerClan(b.id))?.clan.id).toBe(clan.id);
    const beforeXp = (await store.getClan(clan.id))!.xp;
    await noteActivity(store, await reload(store, b.id), { type: 'quest', id: 'yara_claim' });
    const afterXp = (await store.getClan(clan.id))!.xp;
    expect(afterXp).toBeGreaterThan(beforeXp);
    const period = isoWeekKey(new Date());
    expect(await store.getContribution(clan.id, b.id, period)).toBeGreaterThan(0);
    expect((await store.listClanLeaderboard(period, 10, 0))[0]!.id).toBe(clan.id);

    await store.setFlag(a.id, 'week_1_complete', '1');
    await store.setFlag(a.id, 'player_camp_founded', '1');
    await store.setFlag(a.id, 'wenzel_defeated', '1');
    const backfill = await act(runtimeA, 'vk-a', 'OPEN_PROFILE');
    expect(backfill.text).toContain('Неделя 1 закрыта');
    expect(await store.hasEntitlement(a.id, 'title_node_warden')).toBe(true);
    const statsBefore = { ...(await reload(store, a.id)).stats };
    await act(runtimeA, 'vk-a', 'COSMETIC_ACT', { act: 'equip', productId: 'title_node_warden' });
    expect((await store.getCosmetics(a.id)).title).toBe('title_node_warden');
    expect((await reload(store, a.id)).stats).toEqual(statsBefore);
    expect(catalogHasCombatStats()).toBe(false);
  });
});
