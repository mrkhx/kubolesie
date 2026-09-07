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
  eloDelta,
  getProduct,
  isoWeekKey,
  validateClanName,
  validateClanTag,
  type CosmeticSlot,
} from '@kubolesie/content';
import type { GameButton, GameCommand, GameResponse } from '@kubolesie/shared';
import { BACK_LABEL, isDefaultHeroName } from '@kubolesie/shared';
import {
  ActionRejectedError,
  StaleActionError,
} from './errors';
import type {
  ClanRecord,
  GameStore,
  PlayerRecord,
  PlayerStatisticsRecord,
} from './store';

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
  | { type: 'gather'; amount: number }
  | { type: 'craft'; count: number }
  | { type: 'loot'; count: number; rare?: boolean }
  | { type: 'trade' }
  | { type: 'quest'; id: string; daily?: boolean }
  | { type: 'day'; day: number }
  | { type: 'week'; week?: number }
  | { type: 'coins'; amount: number };

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
        if (once) await addClanProgress(store, player.id, period, CLAN_XP.boss, WEEKLY_SCORE.bossWin);
        await maybeGrant(store, player.id, 'FIRST_BOSS');
      } else {
        await bumpWeekly(store, player.id, WEEKLY_SCORE.pveWin);
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
      await addClanProgress(store, player.id, period, CLAN_XP.pvpWin, WEEKLY_SCORE.pvpWin);
      await maybeGrant(store, player.id, 'FIRST_PVP_WIN');
    } else if (event.result === 'LOSS') {
      await store.incrementStatistics(player.id, { pvpLosses: 1 });
    }
    if (event.result === 'WIN' || event.result === 'LOSS') {
      await applyPvpElo(store, player.id, event.rivalId, event.result === 'WIN', period);
    }
  } else if (event.type === 'gather') {
    await store.incrementStatistics(player.id, { resourcesGathered: event.amount });
  } else if (event.type === 'craft') {
    await store.incrementStatistics(player.id, { craftedItems: event.count });
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
      await addClanProgress(store, player.id, period, CLAN_XP.weekComplete, WEEKLY_SCORE.weekComplete);
      if (week === 1) await maybeGrant(store, player.id, 'WEEK_ONE_COMPLETE');
      if (week === 2) await maybeGrant(store, player.id, 'WEEK_TWO_COMPLETE');
    }
  } else if (event.type === 'coins') {
    if (event.amount > 0) await store.incrementStatistics(player.id, { coinsEarned: event.amount });
    else if (event.amount < 0) await store.incrementStatistics(player.id, { coinsSpent: -event.amount });
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
): Promise<void> {
  await bumpWeekly(store, playerId, weekly);
  const membership = await store.getPlayerClan(playerId);
  if (!membership) return;
  await store.addClanXp(membership.clan.id, clanXp);
  await store.addContribution(membership.clan.id, playerId, period, clanXp);
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
  for (let day = 1; day <= 14; day += 1) {
    if (flags[`day_${day}_complete`]) {
      days += 1;
      await store.tryClaimReward(player.id, 'meta_day', String(day));
    }
  }
  if (flags.week_1_complete) await store.tryClaimReward(player.id, 'meta_week', '1');
  if (flags.week_2_complete) await store.tryClaimReward(player.id, 'meta_week', '2');
  if (stats.daysCompleted < days) {
    await store.incrementStatistics(player.id, { daysCompleted: days - stats.daysCompleted });
  }
  if (flags.player_camp_founded) await maybeGrant(store, player.id, 'FIRST_CAMP');
  if (flags.first_ingot) await maybeGrant(store, player.id, 'FIRST_IRON');
  if (flags.defeated_stumpfang || flags.wenzel_defeated) await maybeGrant(store, player.id, 'FIRST_BOSS');
  if (flags.week_1_complete) await maybeGrant(store, player.id, 'WEEK_ONE_COMPLETE');
  if (flags.week_2_complete) await maybeGrant(store, player.id, 'WEEK_TWO_COMPLETE');
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
      return clanAct(store, player, command.payload ?? {}, now);
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
  if (menu === 'clan') return clanHome(store, player, now);
  if (menu === 'clan_find') return clanFind(store, '');
  if (menu === 'clan_manage') return clanManage(store, player);
  if (menu === 'clan_members') return clanMembers(store, player);
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
  } else {
    buttons.push({ label: '📊 Статистика', action: 'OPEN_MENU', payload: { menu: 'stats' } });
  }
  buttons.push(
    { label: '🏆 Рейтинги', action: 'OPEN_MENU', payload: { menu: 'ratings' } },
    { label: '🛡 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
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
  const week = flags.week_2_complete
    ? 'Неделя 2 закрыта'
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
  const text = `${player.name}\n${formatStats(stats)}`;
  return respond(player, text, [
    { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ]);
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
    clan: 'Кланы',
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

async function clanHome(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) {
    return respond(player, 'Клана нет. Можно создать или подать заявку.', [
      { label: '🔎 Найти клан', action: 'OPEN_MENU', payload: { menu: 'clan_find' } },
      { label: '➕ Создать клан', action: 'CLAN_ACT', payload: { act: 'prompt_create' } },
      { label: '📨 Мои заявки', action: 'CLAN_ACT', payload: { act: 'my_apps' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ]);
  }
  const period = isoWeekKey(now);
  const contrib = await store.getContribution(membership.clan.id, player.id, period);
  const rank = await store.getClanLeaderboardRank(membership.clan.id, period);
  const text = [
    `🛡 ${membership.clan.name} [${membership.clan.tag}]`,
    membership.clan.description || 'Без девиза.',
    `Ур. ${membership.clan.level} · XP ${membership.clan.xp} · роль ${roleLabel(membership.member.role)}`,
    `Твой вклад (неделя): ${contrib}`,
    rank ? `Место клана: #${rank}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const buttons: GameButton[] = [
    { label: '👥 Участники', action: 'OPEN_MENU', payload: { menu: 'clan_members' } },
    { label: '🏆 Рейтинг', action: 'OPEN_MENU', payload: { menu: 'ratings_clans' } },
    { label: '📊 Мой вклад', action: 'CLAN_ACT', payload: { act: 'contribution' } },
  ];
  if (membership.member.role === 'LEADER' || membership.member.role === 'OFFICER') {
    buttons.push({ label: '⚙ Управление', action: 'OPEN_MENU', payload: { menu: 'clan_manage' } });
  } else {
    buttons.push({ label: '🚪 Покинуть', action: 'CLAN_ACT', payload: { act: 'leave' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } });
  return respond(player, text, buttons.slice(0, 5));
}

async function clanFind(store: GameStore, query: string): Promise<GameResponse> {
  const clans = await store.listClans(query, 5, 0);
  const buttons: GameButton[] = clans.map((clan) => ({
    label: `${clan.name} [${clan.tag}]`,
    action: 'CLAN_ACT',
    payload: { act: 'apply', clanId: clan.id },
  }));
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return {
    text: clans.length ? 'Найденные стаи. Заявка — одна на клан.' : 'Стаи не найдены.',
    buttons: buttons.slice(0, 5),
  };
}

async function clanMembers(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) return clanHome(store, player, new Date());
  const members = await store.listClanMembers(membership.clan.id);
  const lines = [];
  for (const member of members) {
    const who = await store.findPlayerById(member.playerId);
    lines.push(`• ${who?.name ?? 'Путник'} — ${roleLabel(member.role)}`);
  }
  return respond(player, `Участники ${membership.clan.name}:\n${lines.join('\n')}`, [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function clanManage(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership || (membership.member.role !== 'LEADER' && membership.member.role !== 'OFFICER')) {
    throw new ActionRejectedError('Нет прав.');
  }
  const apps = await store.listPendingApplications(membership.clan.id);
  const buttons: GameButton[] = [
    { label: `✅ Заявки (${apps.length})`, action: 'CLAN_ACT', payload: { act: 'apps' } },
  ];
  if (membership.member.role === 'LEADER') {
    buttons.push({ label: '👑 Передать', action: 'CLAN_ACT', payload: { act: 'prompt_transfer' } });
    buttons.push({ label: '🚪 Распустить', action: 'CLAN_ACT', payload: { act: 'disband' } });
  } else {
    buttons.push({ label: '🚪 Покинуть', action: 'CLAN_ACT', payload: { act: 'leave' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(player, 'Управление стаей. Боевых бонусов нет.', buttons.slice(0, 5));
}

async function clanAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
): Promise<GameResponse> {
  const act = String(payload.act ?? '');
  if (act === 'prompt_create') {
    return respond(
      player,
      'Создать клан: имя 2–24 и тег 2–5. Боевых бонусов клан не даёт.',
      [
        { label: 'Создать', action: 'CLAN_ACT', payload: { act: 'create', name: payload.name, tag: payload.tag, description: payload.description } },
        { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
      ],
    );
  }
  if (act === 'create') {
    return createClan(store, player, payload);
  }
  if (act === 'apply') {
    return applyClan(store, player, String(payload.clanId ?? ''));
  }
  if (act === 'my_apps') {
    const apps = await store.listPlayerApplications(player.id);
    const pending = apps.filter((row) => row.status === 'PENDING');
    const lines = [];
    for (const app of pending) {
      const clan = await store.getClan(app.clanId);
      lines.push(`• ${clan?.name ?? 'стая'} — ждёт`);
    }
    return respond(player, lines.length ? lines.join('\n') : 'Заявок нет.', [
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
    ]);
  }
  if (act === 'apps') return reviewApps(store, player);
  if (act === 'accept') return acceptApp(store, player, String(payload.appId ?? ''));
  if (act === 'reject') return rejectApp(store, player, String(payload.appId ?? ''));
  if (act === 'leave') return leaveClan(store, player);
  if (act === 'kick') return kickMember(store, player, String(payload.targetId ?? ''));
  if (act === 'promote') return setRole(store, player, String(payload.targetId ?? ''), 'OFFICER');
  if (act === 'demote') return setRole(store, player, String(payload.targetId ?? ''), 'MEMBER');
  if (act === 'transfer') return transferLead(store, player, String(payload.targetId ?? ''));
  if (act === 'prompt_transfer') return pickMember(store, player, 'transfer', 'Кому передать лидерство?');
  if (act === 'disband') return disbandClan(store, player);
  if (act === 'contribution') {
    const membership = await store.getPlayerClan(player.id);
    if (!membership) throw new ActionRejectedError('Нет клана.');
    const score = await store.getContribution(membership.clan.id, player.id, isoWeekKey(now));
    return respond(player, `Вклад за неделю: ${score}. Не монеты — дела.`, [
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
    ]);
  }
  if (act === 'search') return clanFind(store, String(payload.query ?? ''));
  throw new ActionRejectedError('Неизвестное действие клана.');
}

async function createClan(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
): Promise<GameResponse> {
  if (await store.getPlayerClan(player.id)) throw new ActionRejectedError('Ты уже в клане.');
  let name: string;
  let tag: string;
  try {
    name = validateClanName(String(payload.name ?? ''));
    tag = validateClanTag(String(payload.tag ?? ''));
  } catch (error) {
    throw new ActionRejectedError((error as Error).message);
  }
  try {
    const clan = await store.createClan({
      name,
      tag,
      description: String(payload.description ?? '').slice(0, 80),
      leaderPlayerId: player.id,
    });
    await maybeGrant(store, player.id, 'CLAN_MEMBER');
    return respond(player, `Клан ${clan.name} [${clan.tag}] создан. Ты лидер.`, [
      { label: '🛡 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
    ]);
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'name_taken') throw new ActionRejectedError('Имя занято.');
    if (code === 'tag_taken') throw new ActionRejectedError('Тег занят.');
    if (code === 'already_in_clan') throw new ActionRejectedError('Ты уже в клане.');
    throw new ActionRejectedError('Нельзя создать клан.');
  }
}

async function applyClan(store: GameStore, player: PlayerRecord, clanId: string): Promise<GameResponse> {
  if (await store.getPlayerClan(player.id)) throw new ActionRejectedError('Ты уже в клане.');
  const clan = await store.getClan(clanId);
  if (!clan) throw new ActionRejectedError('Клан не найден.');
  try {
    await store.createApplication(clanId, player.id);
  } catch (error) {
    if ((error as Error).message === 'duplicate_application') {
      throw new ActionRejectedError('Заявка уже висит.');
    }
    throw error;
  }
  return respond(player, `Заявка в ${clan.name} отправлена.`, [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function reviewApps(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const apps = await store.listPendingApplications(membership.clan.id);
  if (!apps.length) {
    return respond(player, 'Заявок нет.', [
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
    ]);
  }
  const app = apps[0]!;
  const who = await store.findPlayerById(app.playerId);
  return respond(player, `Заявка: ${who?.name ?? 'Путник'}`, [
    { label: 'Принять', action: 'CLAN_ACT', payload: { act: 'accept', appId: app.id } },
    { label: 'Отклонить', action: 'CLAN_ACT', payload: { act: 'reject', appId: app.id } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function acceptApp(store: GameStore, player: PlayerRecord, appId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const app = await store.getApplication(appId);
  if (!app || app.clanId !== membership.clan.id) throw new ActionRejectedError('Заявки нет.');
  if (app.status !== 'PENDING') throw new StaleActionError('Заявка уже обработана.');
  const already = await store.getPlayerClan(app.playerId);
  if (already) {
    await store.setApplicationStatus(app.id, 'CANCELLED');
    throw new ActionRejectedError('Игрок уже в другом клане.');
  }
  try {
    await store.addClanMember({ clanId: membership.clan.id, playerId: app.playerId, role: 'MEMBER' });
  } catch (error) {
    if ((error as Error).message === 'already_in_clan') {
      await store.setApplicationStatus(app.id, 'CANCELLED');
      throw new ActionRejectedError('Игрок уже в клане.');
    }
    throw error;
  }
  await store.setApplicationStatus(app.id, 'ACCEPTED');
  await store.cancelPendingApplications(app.playerId);
  await maybeGrant(store, app.playerId, 'CLAN_MEMBER');
  return respond(player, 'Принят в стаю.', [
    { label: 'Ещё заявки', action: 'CLAN_ACT', payload: { act: 'apps' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function rejectApp(store: GameStore, player: PlayerRecord, appId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const app = await store.getApplication(appId);
  if (!app || app.clanId !== membership.clan.id) throw new ActionRejectedError('Заявки нет.');
  if (app.status !== 'PENDING') throw new StaleActionError('Заявка уже обработана.');
  await store.setApplicationStatus(app.id, 'REJECTED');
  return respond(player, 'Заявка отклонена.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function leaveClan(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) throw new ActionRejectedError('Нет клана.');
  if (membership.member.role === 'LEADER') {
    const members = await store.listClanMembers(membership.clan.id);
    if (members.length > 1) {
      throw new ActionRejectedError('Лидер передаёт стаю или распускает.');
    }
    await store.deleteClan(membership.clan.id);
    return respond(player, 'Стая распущена.', NAV);
  }
  await store.removeClanMember(membership.clan.id, player.id);
  return respond(player, 'Ты вышел из клана.', NAV);
}

async function disbandClan(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  await store.deleteClan(membership.clan.id);
  return respond(player, 'Стая распущена.', NAV);
}

async function kickMember(store: GameStore, player: PlayerRecord, targetId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Себя не выгнать так.');
  const members = await store.listClanMembers(membership.clan.id);
  const target = members.find((row) => row.playerId === targetId);
  if (!target) throw new ActionRejectedError('Не в клане.');
  if (target.role === 'LEADER') throw new ActionRejectedError('Лидера не выгнать.');
  if (membership.member.role !== 'LEADER' && target.role === 'OFFICER') {
    throw new ActionRejectedError('Офицера исключает только лидер.');
  }
  await store.removeClanMember(membership.clan.id, targetId);
  return respond(player, 'Исключён.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function setRole(
  store: GameStore,
  player: PlayerRecord,
  targetId: string,
  role: 'OFFICER' | 'MEMBER',
): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Себе роль так не сменить.');
  await store.setClanMemberRole(membership.clan.id, targetId, role);
  return respond(player, role === 'OFFICER' ? 'Повышен.' : 'Понижен.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function transferLead(store: GameStore, player: PlayerRecord, targetId: string): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Уже лидер.');
  await store.setClanLeader(membership.clan.id, targetId);
  return respond(player, 'Лидерство передано.', [
    { label: '🛡 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function pickMember(
  store: GameStore,
  player: PlayerRecord,
  act: string,
  title: string,
): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  const members = (await store.listClanMembers(membership.clan.id)).filter((row) => row.playerId !== player.id);
  const buttons: GameButton[] = [];
  for (const member of members.slice(0, 3)) {
    const who = await store.findPlayerById(member.playerId);
    buttons.push({
      label: who?.name ?? 'Путник',
      action: 'CLAN_ACT',
      payload: { act, targetId: member.playerId },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } });
  return respond(player, title, buttons.slice(0, 5));
}

async function requireOfficer(
  store: GameStore,
  player: PlayerRecord,
): Promise<{ clan: ClanRecord; member: { role: string; playerId: string } }> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership || (membership.member.role !== 'LEADER' && membership.member.role !== 'OFFICER')) {
    throw new ActionRejectedError('Нет прав.');
  }
  return membership;
}

async function requireLeader(store: GameStore, player: PlayerRecord) {
  const membership = await store.getPlayerClan(player.id);
  if (!membership || membership.member.role !== 'LEADER') throw new ActionRejectedError('Только лидер.');
  return membership;
}

function roleLabel(role: string): string {
  if (role === 'LEADER') return 'лидер';
  if (role === 'OFFICER') return 'офицер';
  return 'член';
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
