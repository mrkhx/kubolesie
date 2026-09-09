export const PREMIUM_CURRENCY_KEY = 'PREMIUM';
export const PREMIUM_CURRENCY_NAME = 'Кубы';

export const CURRENT_SEASON = {
  id: 'season_0',
  name: 'Предсезон',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-12-31T23:59:59.000Z',
  status: 'ACTIVE' as const,
};

export const PVP_RATING = {
  start: 1000,
  k: 16,
  kRepeat: 8,
  floor: 100,
  ceiling: 3000,
  synthetic: {
    yara_trace: 1000,
    wedge_scout: 1020,
    foreign_post: 1040,
  } as Record<string, number>,
};

export const SCORE_WEIGHTS = {
  level: 80,
  xp: 0.4,
  day: 50,
  weekComplete: 400,
  bossWin: 140,
  pveWin: 6,
  pvpAboveBase: 0.5,
  discovery: 12,
  rareItem: 20,
} as const;

export const WEEKLY_SCORE = {
  pveWin: 3,
  pvpWin: 8,
  bossWin: 25,
  quest: 5,
  day: 10,
  weekComplete: 40,
} as const;

export {
  CLAN_CREATE_COST,
  CLAN_DAILY_TASK_POOL,
  CLAN_DESC_MAX,
  CLAN_DONATION_RESOURCES,
  CLAN_DONATION_VALUES,
  CLAN_LEVEL_SCORE,
  CLAN_LEVEL_XP,
  CLAN_NAME,
  CLAN_TAG,
  CLAN_TASK_CLAN_SCORE,
  CLAN_TASK_PLAYER_REWARD,
  CLAN_WEEKLY_TASK_POOL,
  CLAN_XP,
  clanLeaderboardScore,
  clanLevelForXp,
  clanMemberCap,
  clanTasksFor,
  dailyClanTasks,
  dailyContributionKey,
  donationValue,
  isWeeklyPeriodKey,
  normalizeClanName,
  parseClanCreateLine,
  taskParticipationKey,
  taskPeriodKey,
  validateClanDescription,
  validateClanName,
  validateClanTag,
  weeklyClanTask,
} from './clans';
export type { ClanTaskDef, ClanTaskMetric } from './clans';

export const LEADERBOARD_PAGE_SIZE = 10;
export const QUERY_LIMIT_MAX = 50;

export function clampLimit(value: number, fallback = 10): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(QUERY_LIMIT_MAX, Math.floor(value)));
}

export function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.floor(value)));
}

export function finiteNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export type CosmeticType =
  | 'PROFILE_FRAME'
  | 'TITLE'
  | 'CAMP_THEME'
  | 'CAMP_DECORATION'
  | 'CHAT_BADGE'
  | 'PET_SKIN'
  | 'PLAYER_BADGE';

export type CosmeticSlot = 'profileFrame' | 'title' | 'badge' | 'campTheme' | 'chatBadge';

export interface CosmeticProduct {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  price: number;
  currency: 'PREMIUM' | 'COINS';
  availability: 'CATALOG' | 'ACHIEVEMENT' | 'SEASON';
  seasonId?: string;
  slot?: CosmeticSlot;
}

export const COSMETIC_PRODUCTS: Record<string, CosmeticProduct> = {
  title_pathfinder: {
    id: 'title_pathfinder',
    type: 'TITLE',
    name: 'Первопроходец',
    description: 'Занял свою клетку леса.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'title',
  },
  title_wedge_hunter: {
    id: 'title_wedge_hunter',
    type: 'TITLE',
    name: 'Охотник Сизого клина',
    description: 'Первый крупный зверь пал.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'title',
  },
  title_node_warden: {
    id: 'title_node_warden',
    type: 'TITLE',
    name: 'Страж Узла',
    description: 'Неделя удержана. Печать задета.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'title',
  },
  badge_week1: {
    id: 'badge_week1',
    type: 'PLAYER_BADGE',
    name: 'Печать 7',
    description: 'Знак первой недели.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_week2: {
    id: 'badge_week2',
    type: 'PLAYER_BADGE',
    name: 'Печать 6',
    description: 'Знак второй недели. Низина.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_week3: {
    id: 'badge_week3',
    type: 'PLAYER_BADGE',
    name: 'Печать 5',
    description: 'Знак третьей недели. Корневая чаща.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_week4: {
    id: 'badge_week4',
    type: 'PLAYER_BADGE',
    name: 'Печать 4',
    description: 'Знак четвёртой недели. Гнилая тропа.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_week5: {
    id: 'badge_week5',
    type: 'PLAYER_BADGE',
    name: 'Печать 3',
    description: 'Знак пятой недели. Чёрная топь.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_pvp: {
    id: 'badge_pvp',
    type: 'PLAYER_BADGE',
    name: 'След на осыпи',
    description: 'Первая стычка выиграна.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'badge',
  },
  badge_clan: {
    id: 'badge_clan',
    type: 'CHAT_BADGE',
    name: 'Клеймо стаи',
    description: 'Вступил в клан.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'chatBadge',
  },
  camp_ember: {
    id: 'camp_ember',
    type: 'CAMP_THEME',
    name: 'Угольный стан',
    description: 'Тема стана. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'ACHIEVEMENT',
    slot: 'campTheme',
  },
  frame_ashen: {
    id: 'frame_ashen',
    type: 'PROFILE_FRAME',
    name: 'Сизая рамка',
    description: 'Каталог оформления. Без силы.',
    price: 40,
    currency: 'PREMIUM',
    availability: 'CATALOG',
    slot: 'profileFrame',
  },
  title_pvp_1100: {
    id: 'title_pvp_1100',
    type: 'TITLE',
    name: 'Искатель следа',
    description: 'PvP 1100. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'title',
  },
  badge_pvp_1250: {
    id: 'badge_pvp_1250',
    type: 'PLAYER_BADGE',
    name: 'Знак осыпи',
    description: 'PvP 1250. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'badge',
  },
  title_pvp_1400: {
    id: 'title_pvp_1400',
    type: 'TITLE',
    name: 'Клинковый',
    description: 'PvP 1400. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'title',
  },
  badge_pvp_1600: {
    id: 'badge_pvp_1600',
    type: 'PLAYER_BADGE',
    name: 'Жетон 1600',
    description: 'PvP 1600. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'badge',
  },
  frame_pvp_1800: {
    id: 'frame_pvp_1800',
    type: 'PROFILE_FRAME',
    name: 'Рамка арены',
    description: 'PvP 1800. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'profileFrame',
  },
  title_pvp_2000: {
    id: 'title_pvp_2000',
    type: 'TITLE',
    name: 'Хозяин осыпи',
    description: 'PvP 2000. Только вид.',
    price: 0,
    currency: 'COINS',
    availability: 'SEASON',
    seasonId: 'season_0',
    slot: 'title',
  },
  frame_seal: {
    id: 'frame_seal',
    type: 'PROFILE_FRAME',
    name: 'Рамка печати',
    description: 'Каталог оформления. Без силы.',
    price: 60,
    currency: 'PREMIUM',
    availability: 'CATALOG',
    slot: 'profileFrame',
  },
  pet_emberkit_ash: {
    id: 'pet_emberkit_ash',
    type: 'PET_SKIN',
    name: 'Пепельный Искрик',
    description: 'Скин питомца. Не урон.',
    price: 80,
    currency: 'PREMIUM',
    availability: 'CATALOG',
  },
};

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  rewardProductIds: string[];
}

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  FIRST_CAMP: {
    id: 'FIRST_CAMP',
    name: 'Свой стан',
    description: 'Занять клетку леса.',
    rewardProductIds: ['title_pathfinder'],
  },
  FIRST_IRON: {
    id: 'FIRST_IRON',
    name: 'Первый слиток',
    description: 'Выплавить железо.',
    rewardProductIds: [],
  },
  FIRST_BOSS: {
    id: 'FIRST_BOSS',
    name: 'Первый зверь',
    description: 'Победить Пнеклыка или Вензеля.',
    rewardProductIds: ['title_wedge_hunter'],
  },
  WEEK_ONE_COMPLETE: {
    id: 'WEEK_ONE_COMPLETE',
    name: 'Неделя у затвора',
    description: 'Закрыть первую неделю.',
    rewardProductIds: ['title_node_warden', 'badge_week1', 'camp_ember'],
  },
  FIRST_BOW: {
    id: 'FIRST_BOW',
    name: 'Первый дальний бой',
    description: 'Собрать лук из нити низины.',
    rewardProductIds: [],
  },
  WEEK_TWO_COMPLETE: {
    id: 'WEEK_TWO_COMPLETE',
    name: 'Низина молчит',
    description: 'Закрыть вторую неделю. Осталось: 5.',
    rewardProductIds: ['badge_week2'],
  },
  WEEK_THREE_COMPLETE: {
    id: 'WEEK_THREE_COMPLETE',
    name: 'Чаща держит сеть',
    description: 'Закрыть третью неделю. Осталось: 4.',
    rewardProductIds: ['badge_week3'],
  },
  WEEK_FOUR_COMPLETE: {
    id: 'WEEK_FOUR_COMPLETE',
    name: 'Тропа врёт под ногой',
    description: 'Закрыть четвёртую неделю. Осталось: 3.',
    rewardProductIds: ['badge_week4'],
  },
  WEEK_FIVE_COMPLETE: {
    id: 'WEEK_FIVE_COMPLETE',
    name: 'Топь правит на ходу',
    description: 'Закрыть пятую неделю. Осталось: 2.',
    rewardProductIds: ['badge_week5'],
  },
  FIRST_PVP_WIN: {
    id: 'FIRST_PVP_WIN',
    name: 'Первый след',
    description: 'Выиграть асинхронную стычку.',
    rewardProductIds: ['badge_pvp'],
  },
  CRAFT_100: {
    id: 'CRAFT_100',
    name: 'Стол мастера',
    description: 'Изготовить 100 предметов.',
    rewardProductIds: [],
  },
  GATHER_1000: {
    id: 'GATHER_1000',
    name: 'Лесной запас',
    description: 'Добыть 1000 единиц ресурса.',
    rewardProductIds: [],
  },
  CLAN_MEMBER: {
    id: 'CLAN_MEMBER',
    name: 'Стая',
    description: 'Вступить в клан.',
    rewardProductIds: ['badge_clan'],
  },
};

export const BOSS_IDS = ['stumpfang', 'wenzel_warden', 'smolnik', 'mist_warden', 'rootlasher', 'vyazen', 'blackroot', 'tlennik', 'miremaw', 'bezdonnik'] as const;

export function isoWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function computeLifetimeScore(input: {
  level: number;
  xp: number;
  daysCompleted: number;
  weekComplete: boolean;
  bossWins: number;
  pveWins: number;
  pvpRating: number;
  discoveries: number;
  rareItems: number;
}): number {
  const level = finiteNumber(input.level);
  const xp = finiteNumber(input.xp);
  const daysCompleted = finiteNumber(input.daysCompleted);
  const bossWins = finiteNumber(input.bossWins);
  const pveWins = finiteNumber(input.pveWins);
  const pvpRating = finiteNumber(input.pvpRating, PVP_RATING.start);
  const discoveries = finiteNumber(input.discoveries);
  const rareItems = finiteNumber(input.rareItems);
  return Math.max(
    0,
    Math.floor(
      level * SCORE_WEIGHTS.level +
        xp * SCORE_WEIGHTS.xp +
        daysCompleted * SCORE_WEIGHTS.day +
        (input.weekComplete ? SCORE_WEIGHTS.weekComplete : 0) +
        bossWins * SCORE_WEIGHTS.bossWin +
        pveWins * SCORE_WEIGHTS.pveWin +
        Math.max(0, pvpRating - PVP_RATING.start) * SCORE_WEIGHTS.pvpAboveBase +
        discoveries * SCORE_WEIGHTS.discovery +
        rareItems * SCORE_WEIGHTS.rareItem,
    ),
  );
}

export function eloDelta(playerRating: number, opponentRating: number, win: boolean, k: number): number {
  return eloScoreDelta(playerRating, opponentRating, win ? 1 : 0, k);
}

export function eloScoreDelta(
  playerRating: number,
  opponentRating: number,
  score: number,
  k: number,
): number {
  const player = finiteNumber(playerRating, PVP_RATING.start);
  const opponent = finiteNumber(opponentRating, PVP_RATING.start);
  const factor = Number.isFinite(k) ? k : PVP_RATING.k;
  const outcome = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  const expected = 1 / (1 + 10 ** ((opponent - player) / 400));
  const delta = factor * (outcome - expected);
  return Number.isFinite(delta) ? Math.round(delta) : 0;
}

export function applyPvpRating(current: number, delta: number): number {
  const base = finiteNumber(current, PVP_RATING.start);
  const change = finiteNumber(delta);
  return Math.min(PVP_RATING.ceiling, Math.max(PVP_RATING.floor, base + change));
}

export function getProduct(id: string): CosmeticProduct | undefined {
  return COSMETIC_PRODUCTS[id];
}

export function catalogHasCombatStats(): boolean {
  return Object.values(COSMETIC_PRODUCTS).some((product) =>
    ['attack', 'defense', 'hp', 'damage', 'speed', 'drop'].some((key) =>
      JSON.stringify(product).toLowerCase().includes(`"${key}"`),
    ),
  );
}
