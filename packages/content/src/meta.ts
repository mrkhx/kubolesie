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

export const CLAN_XP = {
  quest: 8,
  dailyQuest: 3,
  boss: 25,
  pvpWin: 6,
  weekComplete: 40,
} as const;

export const CLAN_LEVEL_XP = [0, 80, 200, 400, 700, 1100, 1600] as const;

export const CLAN_NAME = { min: 2, max: 24 } as const;
export const CLAN_TAG = { min: 2, max: 5 } as const;

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

export const BOSS_IDS = ['stumpfang', 'wenzel_warden', 'smolnik', 'mist_warden'] as const;

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
  const player = finiteNumber(playerRating, PVP_RATING.start);
  const opponent = finiteNumber(opponentRating, PVP_RATING.start);
  const factor = Number.isFinite(k) ? k : PVP_RATING.k;
  const expected = 1 / (1 + 10 ** ((opponent - player) / 400));
  const score = win ? 1 : 0;
  const delta = factor * (score - expected);
  return Number.isFinite(delta) ? Math.round(delta) : 0;
}

export function applyPvpRating(current: number, delta: number): number {
  const base = finiteNumber(current, PVP_RATING.start);
  const change = finiteNumber(delta);
  return Math.min(PVP_RATING.ceiling, Math.max(PVP_RATING.floor, base + change));
}

export function clanLevelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < CLAN_LEVEL_XP.length; i += 1) {
    if (xp >= CLAN_LEVEL_XP[i]!) level = i + 1;
  }
  return level;
}

export function clanLeaderboardScore(xp: number, seasonContribution: number): number {
  return xp + Math.floor(seasonContribution * 0.5);
}

const BANNED_NAME = /^(admin|system|null|undefined|test|vk|id)$/i;

export function normalizeClanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
}

export function validateClanName(raw: string): string {
  const name = normalizeClanName(raw);
  if (name.length < CLAN_NAME.min || name.length > CLAN_NAME.max) {
    throw new Error(`Имя клана: ${CLAN_NAME.min}–${CLAN_NAME.max} символов.`);
  }
  if (BANNED_NAME.test(name) || /https?:|www\./i.test(name)) {
    throw new Error('Такое имя клана нельзя.');
  }
  return name;
}

export function validateClanTag(raw: string): string {
  const tag = raw.replace(/[\u0000-\u001f<>\s]/g, '').trim();
  if (tag.length < CLAN_TAG.min || tag.length > CLAN_TAG.max) {
    throw new Error(`Тег: ${CLAN_TAG.min}–${CLAN_TAG.max} символов.`);
  }
  if (!/^[0-9A-Za-zА-Яа-яЁё]+$/.test(tag)) {
    throw new Error('Тег: только буквы и цифры.');
  }
  return tag.toUpperCase();
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
