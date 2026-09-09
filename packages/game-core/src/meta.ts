import {
  ACHIEVEMENTS,
  BOSS_IDS,
  CLAN_XP,
  COSMETIC_PRODUCTS,
  CURRENT_SEASON,
  LEADERBOARD_PAGE_SIZE,
  PREMIUM_CURRENCY_NAME,
  PVP_RATING,
  WEEKLY_SCORE,
  applyPvpRating,
  computeLifetimeScore,
  dailyContributionKey,
  eloDelta,
  getProduct,
  isoWeekKey,
  utcDayKey,
  type CosmeticSlot,
} from '@kubolesie/content';
import type { GameButton, GameCommand, GameResponse } from '@kubolesie/shared';
import { BACK_LABEL, isDefaultHeroName } from '@kubolesie/shared';
import { ActionRejectedError } from './errors';
import type {
  GameStore,
  PlayerRecord,
  PlayerStatisticsRecord,
} from './store';
import { clanAct as runClanAct, isClanMenu, noteClanTaskProgress, openClanMenu } from './clans';
import { applyJobProgress } from './jobs';

export const META_MENUS = [
  'hero',
  'profile',
  'stats',
  'ratings',
  'ratings_global',
  'ratings_pvp',
  'ratings_weekly',
  'ratings_clans',
  'clan',
  'clan_find',
  'clan_manage',
  'clan_members',
  'clan_home',
  'clan_tasks',
  'clan_donate',
  'cosmetics',
  'achievements',
] as const;

export type MetaMenuId = (typeof META_MENUS)[number];

export const META_COMMANDS = ['OPEN_PROFILE', 'CLAN_ACT', 'COSMETIC_ACT', 'LEADERBOARD_PAGE'] as const;

export function isMetaMenu(menu: string): menu is MetaMenuId {
  return (META_MENUS as readonly string[]).includes(menu);
}

export type MetaEvent =
  | { type: 'pve'; result: 'WIN' | 'LOSS' | 'DRAW'; enemyId: string }
  | { type: 'pvp'; result: 'WIN' | 'LOSS' | 'DRAW'; rivalId: string }
  | { type: 'gather'; amount: number; resource?: string }
  | { type: 'craft'; count: number; recipeId?: string; amount?: number }
  | { type: 'loot'; count: number; rare?: boolean }
  | { type: 'trade' }
  | { type: 'quest'; id: string; daily?: boolean }
  | { type: 'day'; day: number }
  | { type: 'week'; week?: number }
  | { type: 'coins'; amount: number }
  | { type: 'farm'; act: 'plant' | 'harvest'; amount?: number }
  | { type: 'furnace'; act: 'cook_fish'; amount?: number };

const NAV: GameButton[] = [
  { label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } },
  { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
];

export async function noteActivity(
  store: GameStore,
  player: PlayerRecord,
  event: MetaEvent,
  now: Date = new Date(),
): Promise<void> {
  const period = isoWeekKey(now);
  await ensurePeriod(store, player.id, period);

  if (event.type === 'pve') {
    if (event.result === 'WIN') {
      await store.incrementStatistics(player.id, { pveWins: 1 });
      if ((BOSS_IDS as readonly string[]).includes(event.enemyId)) {
        await store.incrementStatistics(player.id, { bossWins: 1 });
        await store.incrementBossStat(player.id, event.enemyId, 'wins');
        const once = await store.tryClaimReward(player.id, 'weekly_boss', event.enemyId);
        if (once) await addClanProgress(store, player.id, period, CLAN_XP.boss, WEEKLY_SCORE.bossWin, now);
        await noteClanTaskProgress(store, player.id, 'boss', 1, now);
        await maybeGrant(store, player.id, 'FIRST_BOSS');
      } else {
        await bumpWeekly(store, player.id, WEEKLY_SCORE.pveWin);
        await noteClanTaskProgress(store, player.id, 'pve', 1, now);
      }
    } else if (event.result === 'LOSS') {
      await store.incrementStatistics(player.id, { pveLosses: 1 });
      if ((BOSS_IDS as readonly string[]).includes(event.enemyId)) {
        await store.incrementStatistics(player.id, { bossLosses: 1 });
        await store.incrementBossStat(player.id, event.enemyId, 'losses');
      }
    }
  } else if (event.type === 'pvp') {
    if (event.result === 'WIN') {
      await store.incrementStatistics(player.id, { pvpWins: 1 });
      await addClanProgress(store, player.id, period, CLAN_XP.pvpWin, WEEKLY_SCORE.pvpWin, now);
      await maybeGrant(store, player.id, 'FIRST_PVP_WIN');
    } else if (event.result === 'LOSS') {
      await store.incrementStatistics(player.id, { pvpLosses: 1 });
    }
    if (event.result === 'WIN' || event.result === 'LOSS') {
      await applyPvpElo(store, player.id, event.rivalId, event.result === 'WIN', period);
      await noteClanTaskProgress(store, player.id, 'pvp', 1, now);
    }
  } else if (event.type === 'gather') {
    await store.incrementStatistics(player.id, { resourcesGathered: event.amount });
    if (event.resource === 'LOG') {
      await noteClanTaskProgress(store, player.id, 'gather_log', event.amount, now);
    }
  } else if (event.type === 'craft') {
    await store.incrementStatistics(player.id, { craftedItems: event.count });
    await noteClanTaskProgress(store, player.id, 'craft', event.count, now);
  } else if (event.type === 'loot') {
    await store.incrementStatistics(player.id, {
      itemsLooted: event.count,
      rareItemsFound: event.rare ? event.count : 0,
    });
  } else if (event.type === 'trade') {
    await store.incrementStatistics(player.id, { tradesCompleted: 1 });
  } else if (event.type === 'quest') {
    const once = await store.tryClaimReward(player.id, 'meta_quest', event.id);
    if (once) {
      await store.incrementStatistics(player.id, {
        questsCompleted: 1,
        dailyQuestsCompleted: event.daily ? 1 : 0,
      });
      await addClanProgress(
        store,
        player.id,
        period,
        event.daily ? CLAN_XP.dailyQuest : CLAN_XP.quest,
        WEEKLY_SCORE.quest,
        now,
      );
    }
  } else if (event.type === 'day') {
    const once = await store.tryClaimReward(player.id, 'meta_day', String(event.day));
    if (once) {
      await store.incrementStatistics(player.id, { daysCompleted: 1 });
      await bumpWeekly(store, player.id, WEEKLY_SCORE.day);
    }
  } else if (event.type === 'week') {
    const week = event.week ?? 1;
    const once = await store.tryClaimReward(player.id, 'meta_week', String(week));
    if (once) {
      await addClanProgress(store, player.id, period, CLAN_XP.weekComplete, WEEKLY_SCORE.weekComplete, now);
      if (week === 1) await maybeGrant(store, player.id, 'WEEK_ONE_COMPLETE');
      if (week === 2) await maybeGrant(store, player.id, 'WEEK_TWO_COMPLETE');
      if (week === 3) await maybeGrant(store, player.id, 'WEEK_THREE_COMPLETE');
    }
  } else if (event.type === 'coins') {
    if (event.amount > 0) await store.incrementStatistics(player.id, { coinsEarned: event.amount });
    else if (event.amount < 0) await store.incrementStatistics(player.id, { coinsSpent: -event.amount });
  }

  if (
    event.type === 'gather' ||
    event.type === 'craft' ||
    event.type === 'pve' ||
    event.type === 'farm' ||
    event.type === 'furnace'
  ) {
    await applyJobProgress(
      store,
      player.id,
      event.type === 'craft'
        ? { type: 'craft', recipeId: event.recipeId, amount: event.amount ?? event.count }
        : event,
      now,
    );
  }

  const stats = await store.getStatistics(player.id);
  if (stats.craftedItems >= 100) await maybeGrant(store, player.id, 'CRAFT_100');
  if (stats.resourcesGathered >= 1000) await maybeGrant(store, player.id, 'GATHER_1000');
  await refreshScore(store, player);
}

async function ensurePeriod(store: GameStore, playerId: string, period: string): Promise<void> {
  const rating = await store.getRating(playerId);
  if (rating.weeklyPeriod === period) return;
  if (rating.weeklyPeriod) {
    await store.upsertWeeklyScore(playerId, rating.weeklyPeriod, rating.weeklyScore);
  }
  const historic = await store.getWeeklyScore(playerId, period);
  rating.weeklyPeriod = period;
  rating.weeklyScore = historic;
  rating.weeklyPvpOpponents = '';
  rating.seasonId = CURRENT_SEASON.id;
  await store.saveRating(rating);
}

async function bumpWeekly(store: GameStore, playerId: string, amount: number): Promise<void> {
  const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const rating = await store.getRating(playerId);
  rating.weeklyScore += delta;
  await store.saveRating(rating);
  if (rating.weeklyPeriod) {
    await store.incrementWeeklyScore(playerId, rating.weeklyPeriod, delta);
  }
}

async function addClanProgress(
  store: GameStore,
  playerId: string,
  period: string,
  clanXp: number,
  weekly: number,
  now: Date = new Date(),
): Promise<void> {
  await bumpWeekly(store, playerId, weekly);
  const membership = await store.getPlayerClan(playerId);
  if (!membership || membership.clan.disbandedAt) return;
  await store.addClanXp(membership.clan.id, clanXp);
  await store.addContribution(membership.clan.id, playerId, period, clanXp);
  await store.addContribution(membership.clan.id, playerId, dailyContributionKey(utcDayKey(now)), clanXp);
}

async function applyPvpElo(
  store: GameStore,
  playerId: string,
  rivalId: string,
  win: boolean,
  period: string,
): Promise<void> {
  const rating = await store.getRating(playerId);
  const seen = rating.weeklyPvpOpponents.split(',').filter(Boolean);
  const repeat = seen.includes(rivalId);
  const k = repeat ? PVP_RATING.kRepeat : PVP_RATING.k;
  const opponent = PVP_RATING.synthetic[rivalId] ?? PVP_RATING.start;
  const delta = eloDelta(rating.pvpRating, opponent, win, k);
  rating.pvpRating = applyPvpRating(rating.pvpRating, delta);
  if (!repeat) rating.weeklyPvpOpponents = [...seen, rivalId].join(',');
  rating.weeklyPeriod = period;
  await store.saveRating(rating);
}

async function refreshScore(store: GameStore, player: PlayerRecord): Promise<void> {
  const [stats, rating, discoveries, flags] = await Promise.all([
    store.getStatistics(player.id),
    store.getRating(player.id),
    store.listDiscoveries(player.id),
    store.getFlags(player.id),
  ]);
  rating.lifetimeScore = computeLifetimeScore({
    level: player.level,
    xp: player.xp,
    daysCompleted: stats.daysCompleted,
    weekComplete: Boolean(flags.week_1_complete),
    bossWins: stats.bossWins,
    pveWins: stats.pveWins,
    pvpRating: rating.pvpRating,
    discoveries: discoveries.length,
    rareItems: stats.rareItemsFound,
  });
  await store.saveRating(rating);
}

async function maybeGrant(store: GameStore, playerId: string, achievementId: string): Promise<void> {
  const ok = await store.tryGrantAchievement(playerId, achievementId);
  if (!ok) return;
  const def = ACHIEVEMENTS[achievementId];
  if (!def) return;
  for (const productId of def.rewardProductIds) {
    await store.tryGrantEntitlement(playerId, productId, `achievement:${achievementId}`);
  }
}

export async function grantMetaAchievement(
  store: GameStore,
  playerId: string,
  achievementId: string,
): Promise<void> {
  await maybeGrant(store, playerId, achievementId);
}

export async function backfillMeta(store: GameStore, player: PlayerRecord): Promise<void> {
  const flags = await store.getFlags(player.id);
  const stats = await store.getStatistics(player.id);
  let days = 0;
  for (let day = 1; day <= 35; day += 1) {
    if (flags[`day_${day}_complete`]) {
      days += 1;
      await store.tryClaimReward(player.id, 'meta_day', String(day));
    }
  }
  if (flags.week_1_complete) await store.tryClaimReward(player.id, 'meta_week', '1');
  if (flags.week_2_complete) await store.tryClaimReward(player.id, 'meta_week', '2');
  if (flags.week_3_complete) await store.tryClaimReward(player.id, 'meta_week', '3');
  if (flags.week_4_complete) await store.tryClaimReward(player.id, 'meta_week', '4');
  if (flags.week_5_complete) await store.tryClaimReward(player.id, 'meta_week', '5');
  if (stats.daysCompleted < days) {
    await store.incrementStatistics(player.id, { daysCompleted: days - stats.daysCompleted });
  }
  if (flags.player_camp_founded) await maybeGrant(store, player.id, 'FIRST_CAMP');
  if (flags.first_ingot) await maybeGrant(store, player.id, 'FIRST_IRON');
  if (flags.defeated_stumpfang || flags.wenzel_defeated) await maybeGrant(store, player.id, 'FIRST_BOSS');
  if (flags.week_1_complete) await maybeGrant(store, player.id, 'WEEK_ONE_COMPLETE');
  if (flags.week_2_complete) await maybeGrant(store, player.id, 'WEEK_TWO_COMPLETE');
  if (flags.week_3_complete) await maybeGrant(store, player.id, 'WEEK_THREE_COMPLETE');
  if (flags.week_4_complete) await maybeGrant(store, player.id, 'WEEK_FOUR_COMPLETE');
  if (flags.week_5_complete) await maybeGrant(store, player.id, 'WEEK_FIVE_COMPLETE');
  if (flags.first_bow) await maybeGrant(store, player.id, 'FIRST_BOW');
  const fresh = await store.getStatistics(player.id);
  if (fresh.pvpWins >= 1) await maybeGrant(store, player.id, 'FIRST_PVP_WIN');
  if (fresh.craftedItems >= 100) await maybeGrant(store, player.id, 'CRAFT_100');
  if (fresh.resourcesGathered >= 1000) await maybeGrant(store, player.id, 'GATHER_1000');
  if (await store.getPlayerClan(player.id)) await maybeGrant(store, player.id, 'CLAN_MEMBER');
  const current = await store.findPlayerById(player.id);
  if (current) await refreshScore(store, current);
}

export async function dispatchMeta(
  store: GameStore,
  player: PlayerRecord,
  command: GameCommand,
  now: Date,
): Promise<GameResponse> {
  await backfillMeta(store, player);
  switch (command.type) {
    case 'OPEN_PROFILE':
      return openMetaMenu(store, player, 'profile', now);
    case 'LEADERBOARD_PAGE':
      return leaderboard(
        store,
        player,
        String(command.payload?.board ?? 'score'),
        Number(command.payload?.page ?? 0),
        now,
      );
    case 'CLAN_ACT':
      return runClanAct(store, player, command.payload ?? {}, now);
    case 'COSMETIC_ACT':
      return cosmeticAct(store, player, command.payload ?? {});
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openMetaMenu(
  store: GameStore,
  player: PlayerRecord,
  menu: MetaMenuId,
  now: Date = new Date(),
): Promise<GameResponse> {
  await backfillMeta(store, player);
  if (menu === 'hero') return heroMenu(store, player);
  if (menu === 'profile') return profileScreen(store, player);
  if (menu === 'stats') return statsScreen(store, player);
  if (menu === 'ratings') return ratingsRoot();
  if (menu === 'ratings_global') return leaderboard(store, player, 'score', 0, now);
  if (menu === 'ratings_pvp') return leaderboard(store, player, 'pvp', 0, now);
  if (menu === 'ratings_weekly') return leaderboard(store, player, 'weekly', 0, now);
  if (menu === 'ratings_clans') return leaderboard(store, player, 'clan', 0, now);
  if (isClanMenu(menu)) return openClanMenu(store, player, menu, now);
  if (menu === 'cosmetics') return cosmeticsScreen(store, player);
  return achievementsScreen(store, player);
}

async function heroMenu(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const cosmetics = await store.getCosmetics(player.id);
  const flags = await store.getFlags(player.id);
  const title = cosmetics.title ? getProduct(cosmetics.title)?.name : null;
  const buttons: GameButton[] = [
    { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
  ];
  if (flags.week_1_complete) {
    buttons.push({ label: '⚔ PvP', action: 'OPEN_MENU', payload: { menu: 'pvp_hub' } });
    buttons.push({ label: '🛒 Рынок', action: 'OPEN_MENU', payload: { menu: 'market' } });
  } else {
    buttons.push({ label: '📊 Статистика', action: 'OPEN_MENU', payload: { menu: 'stats' } });
    buttons.push({ label: '🏆 Рейтинги', action: 'OPEN_MENU', payload: { menu: 'ratings' } });
  }
  buttons.push(
    { label: '🏕 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
  );
  return respond(
    player,
    [title ? `${player.name} · ${title}` : player.name, 'Герой Куболесья. Не сила — след.'].join('\n'),
    buttons,
  );
}

async function profileScreen(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const [stats, rating, membership, cosmetics, flags] = await Promise.all([
    store.getStatistics(player.id),
    store.getRating(player.id),
    store.getPlayerClan(player.id),
    store.getCosmetics(player.id),
    store.getFlags(player.id),
  ]);
  const title = cosmetics.title ? getProduct(cosmetics.title)?.name : null;
  const clan = membership ? `${membership.clan.name} [${membership.clan.tag}]` : 'нет';
  const week = flags.week_5_complete
    ? 'Неделя 5 закрыта'
    : flags.week_4_complete
    ? currentDayLabel(flags)
    : flags.week_3_complete
    ? currentDayLabel(flags)
    : flags.week_2_complete
    ? currentDayLabel(flags)
    : flags.week_1_complete
      ? currentDayLabel(flags)
      : currentDayLabel(flags);
  const started = player.createdAt.toISOString().slice(0, 10);
  const text = [
    title ? `${player.name} · «${title}»` : player.name,
    `Уровень ${player.level} · XP ${player.xp} · Монеты ${player.coins}`,
    week,
    `Клан: ${clan}`,
    `PvP ${rating.pvpRating} · Очки ${rating.lifetimeScore}`,
    `В Куболесье с ${started}`,
    `Победы PvE ${stats.pveWins} / PvP ${stats.pvpWins} · боссы ${stats.bossWins}`,
  ].join('\n');
  return respond(player, text, [
    { label: isDefaultHeroName(player.name) ? '✏ Назвать героя' : '✏ Сменить имя', action: 'PROMPT_HERO_NAME' },
    { label: '🎨 Оформление', action: 'OPEN_MENU', payload: { menu: 'cosmetics' } },
    { label: '🏅 Достижения', action: 'OPEN_MENU', payload: { menu: 'achievements' } },
    { label: '📊 Статистика', action: 'OPEN_MENU', payload: { menu: 'stats' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ]);
}

function currentDayLabel(flags: Record<string, string>): string {
  if (flags.week_5_complete) return 'Неделя 5 закрыта';
  for (let day = 35; day >= 29; day -= 1) {
    if (flags[`day_${day}_complete`]) return `День ${day} закрыт`;
  }
  if (flags.week_4_complete) return 'Неделя 4 закрыта';
  for (let day = 28; day >= 22; day -= 1) {
    if (flags[`day_${day}_complete`]) return `День ${day} закрыт`;
  }
  if (flags.week_3_complete) return 'Неделя 3 закрыта';
  for (let day = 21; day >= 15; day -= 1) {
    if (flags[`day_${day}_complete`]) return `День ${day} закрыт`;
  }
  if (flags.week_2_complete) return 'Неделя 2 закрыта';
  for (let day = 14; day >= 8; day -= 1) {
    if (flags[`day_${day}_complete`]) return `День ${day} закрыт`;
  }
  if (flags.week_1_complete) return 'Неделя 1 закрыта';
  for (let day = 7; day >= 1; day -= 1) {
    if (flags[`day_${day}_complete`]) return `День ${day} закрыт`;
  }
  return 'День 1';
}

async function statsScreen(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const stats = await store.getStatistics(player.id);
  const flags = await store.getFlags(player.id);
  const text = `${player.name}\n${formatStats(stats)}`;
  const buttons: GameButton[] = [];
  if (flags.week_1_complete) {
    buttons.push({ label: '⚒ Хозяйство', action: 'OPEN_MENU', payload: { menu: 'work' } });
  }
  buttons.push(
    { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
    { label: '🏆 Рейтинги', action: 'OPEN_MENU', payload: { menu: 'ratings' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  );
  return respond(player, text, buttons);
}

export function formatStats(stats: PlayerStatisticsRecord): string {
  return [
    'Статистика (считает сервер).',
    `PvE ${stats.pveWins}/${stats.pveLosses} · PvP ${stats.pvpWins}/${stats.pvpLosses}`,
    `Боссы ${stats.bossWins}/${stats.bossLosses}`,
    `Крафт ${stats.craftedItems} · добыча ${stats.resourcesGathered}`,
    `Лут ${stats.itemsLooted} · редкое ${stats.rareItemsFound}`,
    `Монеты +${stats.coinsEarned} / −${stats.coinsSpent}`,
    `Сделки ${stats.tradesCompleted} · квесты ${stats.questsCompleted}`,
    `Сутки ${stats.daysCompleted} · ежедневки ${stats.dailyQuestsCompleted}`,
  ].join('\n');
}

function ratingsRoot(): Promise<GameResponse> {
  return Promise.resolve({
    text: 'Рейтинги. TOP 10 на экран. Место своё — отдельно.',
    buttons: [
      { label: '🌍 Общий', action: 'OPEN_MENU', payload: { menu: 'ratings_global' } },
      { label: '⚔ PvP', action: 'OPEN_MENU', payload: { menu: 'ratings_pvp' } },
      { label: '📅 Недельный', action: 'OPEN_MENU', payload: { menu: 'ratings_weekly' } },
      { label: '🛡 Кланы', action: 'OPEN_MENU', payload: { menu: 'ratings_clans' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ],
  });
}

async function leaderboard(
  store: GameStore,
  player: PlayerRecord,
  board: string,
  page: number,
  now: Date,
): Promise<GameResponse> {
  const period = isoWeekKey(now);
  const rawPage = Number(page);
  const safePage = Number.isFinite(rawPage) ? Math.max(0, Math.min(1000, Math.floor(rawPage))) : 0;
  const offset = safePage * LEADERBOARD_PAGE_SIZE;
  const titles: Record<string, string> = {
    score: 'Общий рейтинг',
    pvp: 'PvP рейтинг',
    weekly: `Неделя ${period}`,
    clan: 'Кланы за неделю',
  };
  let rows;
  let rank: number;
  if (board === 'clan') {
    rows = await store.listClanLeaderboard(period, LEADERBOARD_PAGE_SIZE, offset);
    const membership = await store.getPlayerClan(player.id);
    rank = membership ? await store.getClanLeaderboardRank(membership.clan.id, period) : 0;
  } else {
    const key = board === 'pvp' || board === 'weekly' ? board : 'score';
    rows = await store.listScoreboard(key, period, LEADERBOARD_PAGE_SIZE, offset);
    rank = await store.getScoreboardRank(key, player.id, period);
  }
  const lines = rows.map(
    (row, index) => `${offset + index + 1}. ${row.name} — ${row.value.toLocaleString('ru-RU')}`,
  );
  const text = [
    titles[board] ?? 'Рейтинг',
    lines.length ? lines.join('\n') : 'Пока пусто.',
    rank ? `Твоё место: #${rank}` : 'Тебя ещё нет в таблице.',
  ].join('\n');
  const buttons: GameButton[] = [];
  if (safePage > 0) {
    buttons.push({
      label: '◀ Ранее',
      action: 'LEADERBOARD_PAGE',
      payload: { board, page: safePage - 1 },
    });
  }
  if (rows.length === LEADERBOARD_PAGE_SIZE) {
    buttons.push({
      label: 'Ещё ▶',
      action: 'LEADERBOARD_PAGE',
      payload: { board, page: safePage + 1 },
    });
  }
  buttons.push({ label: '🏆 Рейтинги', action: 'OPEN_MENU', payload: { menu: 'ratings' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } });
  return respond(player, text, buttons.slice(0, 5));
}

async function cosmeticsScreen(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const [owned, equipped] = await Promise.all([store.listEntitlements(player.id), store.getCosmetics(player.id)]);
  const lines = owned.map((row) => {
    const product = getProduct(row.productId);
    return `• ${product?.name ?? row.productId}`;
  });
  const buttons: GameButton[] = [];
  for (const row of owned) {
    const product = getProduct(row.productId);
    if (!product?.slot) continue;
    const current = equipped[slotKey(product.slot)];
    if (current === product.id) continue;
    buttons.push({
      label: `Надеть: ${product.name}`.slice(0, 40),
      action: 'COSMETIC_ACT',
      payload: { act: 'equip', productId: product.id },
    });
    if (buttons.length >= 3) break;
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'profile' } });
  return respond(
    player,
    [
      'Оформление. Не урон, не HP, не дроп.',
      `${PREMIUM_CURRENCY_NAME} в бою не участвуют.`,
      lines.length ? lines.join('\n') : 'Пока пусто — заработай титул делом.',
    ].join('\n'),
    buttons.slice(0, 5),
  );
}

function slotKey(slot: CosmeticSlot): 'profileFrame' | 'title' | 'badge' | 'campTheme' | 'chatBadge' {
  return slot;
}

async function cosmeticAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
): Promise<GameResponse> {
  const act = String(payload.act ?? 'equip');
  const productId = String(payload.productId ?? '');
  const product = getProduct(productId);
  if (!product?.slot) throw new ActionRejectedError('Такого оформления нет.');
  if (act === 'unequip') {
    await store.setCosmetic(player.id, product.slot, null);
    return cosmeticsScreen(store, player);
  }
  if (!(await store.hasEntitlement(player.id, productId))) {
    throw new ActionRejectedError('Это оформление тебе не принадлежит.');
  }
  await store.setCosmetic(player.id, product.slot, productId);
  return respond(player, `Надето: ${product.name}. Боевые статы те же.`, [
    { label: '🎨 Оформление', action: 'OPEN_MENU', payload: { menu: 'cosmetics' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'profile' } },
  ]);
}

async function achievementsScreen(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const owned = await store.listAchievements(player.id);
  const ids = new Set(owned.map((row) => row.achievementId));
  const lines = Object.values(ACHIEVEMENTS).map((row) => `${ids.has(row.id) ? '✔' : '·'} ${row.name}`);
  return respond(player, `Достижения.\n${lines.join('\n')}`, [
    { label: '🎨 Оформление', action: 'OPEN_MENU', payload: { menu: 'cosmetics' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'profile' } },
  ]);
}

function respond(player: PlayerRecord, text: string, buttons: GameButton[]): GameResponse {
  return {
    text,
    buttons,
    state: {
      playerId: player.id,
      location: player.currentLocation,
      node: player.currentState,
      hp: player.hp,
      maxHp: player.maxHp,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      coins: player.coins,
      level: player.level,
      xp: player.xp,
    },
  };
}

void COSMETIC_PRODUCTS;
