import type { ResourceType } from '@kubolesie/shared';
import { jobProfessionBonusBps, type JobProfession } from './jobs';

export const PICKAXE_RANK: Record<string, number> = {
  wooden_pickaxe: 1,
  stone_pickaxe: 2,
  iron_pickaxe: 3,
  bronze_pickaxe: 4,
  deep_pickaxe: 5,
};

export const PICKAXE_IDS = [
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'bronze_pickaxe',
  'deep_pickaxe',
] as const;

export const WOOD_TIER_PICKS = PICKAXE_IDS;
export const STONE_TIER_PICKS = ['stone_pickaxe', 'iron_pickaxe', 'bronze_pickaxe', 'deep_pickaxe'] as const;
export const IRON_TIER_PICKS = ['iron_pickaxe', 'bronze_pickaxe', 'deep_pickaxe'] as const;
export const BRONZE_TIER_PICKS = ['bronze_pickaxe', 'deep_pickaxe'] as const;

export const AXE_IDS = ['wooden_axe', 'stone_axe', 'iron_axe', 'bronze_axe'] as const;

export type MiningGroup = 'surface' | 'mines' | 'region';

export interface MiningSite {
  id: string;
  group: MiningGroup;
  label: string;
  lockedLabel: string;
  blurb: string;
  resource: ResourceType;
  energy: number;
  minYield: number;
  maxYield: number;
  /** Minimum pickaxe rank. 0 = no pickaxe. */
  minPickRank: number;
  toolName: string;
  profession: JobProfession;
  /** Any of these flags (or always if empty). */
  flagsAny: readonly string[];
  lockText: string;
  sourceName: string;
}

export const MINING_SITES: Record<string, MiningSite> = {
  forest: {
    id: 'forest',
    group: 'surface',
    label: '🌲 Лес',
    lockedLabel: '🔒 Лес',
    blurb: 'Кубы леса. Брёвна берутся руками. Топор даёт больше.',
    resource: 'LOG',
    energy: 1,
    minYield: 2,
    maxYield: 4,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'LOGGER',
    flagsAny: [],
    lockText: '',
    sourceName: 'Лес',
  },
  quarry: {
    id: 'quarry',
    group: 'surface',
    label: '🪨 Каменоломня',
    lockedLabel: '🔒 Каменоломня',
    blurb: 'Открытая каменная жила. Кирка берёт булыжник снова и снова.',
    resource: 'COBBLESTONE',
    energy: 1,
    minYield: 2,
    maxYield: 4,
    minPickRank: 1,
    toolName: 'деревянная кирка или лучше',
    profession: 'MINER',
    flagsAny: [],
    lockText: 'Нужна деревянная кирка.',
    sourceName: 'Каменоломня',
  },
  coal: {
    id: 'coal',
    group: 'mines',
    label: '⚫ Угольная жила',
    lockedLabel: '🔒 Угольная жила',
    blurb: 'Чёрная сажа. Деревянная кирка берёт уголь. Каменная — больше.',
    resource: 'COAL',
    energy: 1,
    minYield: 1,
    maxYield: 3,
    minPickRank: 1,
    toolName: 'деревянная кирка или лучше',
    profession: 'MINER',
    flagsAny: ['day_2_complete', 'found_coal', 'seen_soot_fissure'],
    lockText: 'Откроется на второй день — сажевая расселина.',
    sourceName: 'Угольная жила',
  },
  iron: {
    id: 'iron',
    group: 'mines',
    label: '⛏ Железная жила',
    lockedLabel: '🔒 Железная жила',
    blurb: 'Серая жила. Каменная кирка берёт руду. Можно возвращаться.',
    resource: 'IRON_ORE',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 2,
    toolName: 'каменная кирка или лучше',
    profession: 'MINER',
    flagsAny: ['day_4_complete', 'furnace_placed', 'furnace_built', 'first_ingot', 'iron_ready', 'week_1_complete'],
    lockText: 'Откроется после печи. Нужна каменная кирка.',
    sourceName: 'Железная жила',
  },
  copper: {
    id: 'copper',
    group: 'mines',
    label: '🟠 Медная жила',
    lockedLabel: '🔒 Медная жила',
    blurb: 'Рыжая порода. Железная кирка. Медь — крепёж и бронза, не второе железо.',
    resource: 'COPPER_ORE',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 3,
    toolName: 'железная кирка или лучше',
    profession: 'MINER',
    flagsAny: ['week_1_complete'],
    lockText: 'Откроется после первой недели. Нужна железная кирка.',
    sourceName: 'Медная жила',
  },
  tin: {
    id: 'tin',
    group: 'mines',
    label: '⚪ Оловянная жила',
    lockedLabel: '🔒 Оловянная жила',
    blurb: 'Светлая жила. Нужна для бронзы.',
    resource: 'TIN_ORE',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 3,
    toolName: 'железная кирка или лучше',
    profession: 'MINER',
    flagsAny: ['week_2_complete'],
    lockText: 'Откроется после Туманной низины. Нужна железная кирка.',
    sourceName: 'Оловянная жила',
  },
  silver: {
    id: 'silver',
    group: 'mines',
    label: '✨ Серебряная жила',
    lockedLabel: '🔒 Серебряная жила',
    blurb: 'Редкая светлая жила. Бронзовая кирка. Не сюжет.',
    resource: 'SILVER_ORE',
    energy: 2,
    minYield: 1,
    maxYield: 1,
    minPickRank: 4,
    toolName: 'бронзовая кирка или лучше',
    profession: 'MINER',
    flagsAny: ['week_3_complete'],
    lockText: 'Откроется после Корневой чащи. Нужна бронзовая кирка.',
    sourceName: 'Серебряная жила',
  },
  gold: {
    id: 'gold',
    group: 'mines',
    label: '🟡 Золотая жила',
    lockedLabel: '🔒 Золотая жила',
    blurb: 'Мягкий металл. Для торговли и дорогих вещей, не для меча.',
    resource: 'GOLD_ORE',
    energy: 2,
    minYield: 1,
    maxYield: 1,
    minPickRank: 4,
    toolName: 'бронзовая кирка или лучше',
    profession: 'MINER',
    flagsAny: ['week_4_complete'],
    lockText: 'Откроется после Гнилой тропы. Нужна бронзовая кирка.',
    sourceName: 'Золотая жила',
  },
  deep: {
    id: 'deep',
    group: 'mines',
    label: '💎 Глубинная шахта',
    lockedLabel: '🔒 Глубинная шахта',
    blurb: 'Жильный кристалл Куболесья. Дорого по энергии. Выход маленький и верный.',
    resource: 'DEEP_CRYSTAL',
    energy: 3,
    minYield: 1,
    maxYield: 1,
    minPickRank: 4,
    toolName: 'бронзовая кирка или лучше',
    profession: 'MINER',
    flagsAny: ['week_5_complete', 'week_6_complete'],
    lockText: 'Откроется в глубине — после Чёрной топи. Нужна бронзовая кирка.',
    sourceName: 'Глубинная шахта',
  },
  hunt: {
    id: 'hunt',
    group: 'region',
    label: '🏹 Охота',
    lockedLabel: '🔒 Охота',
    blurb: 'Короткая петля по опушке. Шкура без нового движка охоты.',
    resource: 'HIDE',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'HUNTER',
    flagsAny: ['day_2_complete'],
    lockText: 'Откроется после стана.',
    sourceName: 'Охота',
  },
  fish: {
    id: 'fish',
    group: 'region',
    label: '🎣 Рыбалка',
    lockedLabel: '🔒 Рыбалка',
    blurb: 'Тихая вода у стана. Удочка не нужна — руки и терпение.',
    resource: 'RAW_FISH',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'FISHER',
    flagsAny: ['week_1_complete', 'farming_unlocked'],
    lockText: 'Откроется после первой недели.',
    sourceName: 'Рыбалка',
  },
  root: {
    id: 'root',
    group: 'region',
    label: '🌿 Корневое волокно',
    lockedLabel: '🔒 Корневое волокно',
    blurb: 'Чаща оставляет жилы. Можно снимать снова.',
    resource: 'ROOT_FIBER',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'LOGGER',
    flagsAny: ['week_3_complete'],
    lockText: 'Откроется после Корневой чащи.',
    sourceName: 'Корневая чаща',
  },
  rot: {
    id: 'rot',
    group: 'region',
    label: '🖤 Гнилая смола',
    lockedLabel: '🔒 Гнилая смола',
    blurb: 'Тропа пахнет тленом. Смола снимается с коры.',
    resource: 'ROT_RESIN',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'CRAFTER',
    flagsAny: ['week_4_complete'],
    lockText: 'Откроется после Гнилой тропы.',
    sourceName: 'Гнилая тропа',
  },
  reed: {
    id: 'reed',
    group: 'region',
    label: '🌾 Чёрный камыш',
    lockedLabel: '🔒 Чёрный камыш',
    blurb: 'Топь держит камыш. Резать можно снова.',
    resource: 'BLACK_REED',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'FISHER',
    flagsAny: ['week_5_complete'],
    lockText: 'Откроется после Чёрной топи.',
    sourceName: 'Чёрная топь',
  },
  scrap: {
    id: 'scrap',
    group: 'region',
    label: '⚙ Механический лом',
    lockedLabel: '🔒 Механический лом',
    blurb: 'Стан сыплет крепёж. Не шахта — сбор.',
    resource: 'GEAR_SCRAP',
    energy: 2,
    minYield: 1,
    maxYield: 2,
    minPickRank: 0,
    toolName: 'не нужна',
    profession: 'CRAFTER',
    flagsAny: ['week_6_complete'],
    lockText: 'Откроется на Заброшенном стане.',
    sourceName: 'Заброшенный стан',
  },
};

export const MINING_SITE_ORDER = [
  'forest',
  'quarry',
  'coal',
  'iron',
  'copper',
  'tin',
  'silver',
  'gold',
  'deep',
  'hunt',
  'fish',
  'root',
  'rot',
  'reed',
  'scrap',
] as const;

export const MINING_GROUP_LABELS: Record<MiningGroup, string> = {
  surface: '🌲 Поверхность',
  mines: '🕳 Шахты',
  region: '🌿 Региональная добыча',
};

export const MINING_HELP_TEXT = [
  'Добыча зависит от инструмента и прогресса.',
  'Чем лучше кирка — тем более редкие жилы доступны.',
  'Дерево: руками. Булыжник: деревянная кирка. Уголь: деревянная. Железо: каменная.',
  'Медь и олово: железная. Серебро, золото и глубина: бронзовая.',
  'Печь плавит руду в слитки. Бронза — 3 меди и 1 олово → 4 бронзы.',
  'Энергия ограничивает фарм. Профессия шахтёра слегка поднимает выход.',
].join('\n');

export function pickaxeRank(templateIds: readonly string[]): number {
  let best = 0;
  for (const id of templateIds) {
    const rank = PICKAXE_RANK[id] ?? 0;
    if (rank > best) best = rank;
  }
  return best;
}

export function pickaxeLabel(rank: number): string {
  if (rank >= 5) return 'глубинная';
  if (rank >= 4) return 'бронзовая';
  if (rank >= 3) return 'железная';
  if (rank >= 2) return 'каменная';
  if (rank >= 1) return 'деревянная';
  return 'нет';
}

export function hasAxe(templateIds: readonly string[]): boolean {
  return templateIds.some((id) => (AXE_IDS as readonly string[]).includes(id));
}

export function siteProgressUnlocked(site: MiningSite, flags: Record<string, string>): boolean {
  if (!site.flagsAny.length) return true;
  return site.flagsAny.some((flag) => flags[flag] != null);
}

export function siteToolUnlocked(site: MiningSite, rank: number): boolean {
  return rank >= site.minPickRank;
}

export function siteFullyUnlocked(site: MiningSite, flags: Record<string, string>, rank: number): boolean {
  return siteProgressUnlocked(site, flags) && siteToolUnlocked(site, rank);
}

export function siteLockReason(site: MiningSite, flags: Record<string, string>, rank: number): string | null {
  if (siteFullyUnlocked(site, flags, rank)) return null;
  if (!siteToolUnlocked(site, rank) && !siteProgressUnlocked(site, flags)) {
    return site.lockText;
  }
  if (!siteToolUnlocked(site, rank)) return `Нужна ${site.toolName}.`;
  return site.lockText;
}

export function sitesInGroup(group: MiningGroup): MiningSite[] {
  return MINING_SITE_ORDER.map((id) => MINING_SITES[id]!).filter((site) => site.group === group);
}

export function getMiningSite(id: string): MiningSite | undefined {
  return MINING_SITES[id];
}

export function minerManualBonusBps(level: number, resource: ResourceType): number {
  const lv = Math.max(0, Math.floor(level));
  if (resource === 'COBBLESTONE' || resource === 'COAL') {
    return lv >= 5 ? 1_000 : 0;
  }
  const ores: ResourceType[] = [
    'IRON_ORE',
    'COPPER_ORE',
    'TIN_ORE',
    'SILVER_ORE',
    'GOLD_ORE',
    'DEEP_CRYSTAL',
  ];
  if (!ores.includes(resource)) return 0;
  if (lv >= 20) return 1_500;
  if (lv >= 10) return 1_000;
  return 0;
}

export function minerRareExtraChance(level: number, resource: ResourceType): number {
  if (level < 15) return 0;
  if (resource === 'SILVER_ORE' || resource === 'GOLD_ORE' || resource === 'DEEP_CRYSTAL') return 10;
  return 0;
}

export function professionManualBonusBps(profession: JobProfession, level: number, resource: ResourceType): number {
  if (profession === 'MINER') return minerManualBonusBps(level, resource);
  if (profession === 'LOGGER' && resource === 'LOG') return jobProfessionBonusBps(level);
  if (profession === 'HUNTER' && resource === 'HIDE') return jobProfessionBonusBps(level);
  if (profession === 'FISHER' && resource === 'RAW_FISH') return jobProfessionBonusBps(level);
  if (profession === 'CRAFTER' && (resource === 'ROT_RESIN' || resource === 'GEAR_SCRAP')) {
    return jobProfessionBonusBps(level);
  }
  return 0;
}

export function resourceSourceHint(resource: ResourceType): string | undefined {
  const site = Object.values(MINING_SITES).find((row) => row.resource === resource);
  if (!site) {
    if (resource === 'COPPER_INGOT') return 'Источник: плавка медной руды.';
    if (resource === 'TIN_INGOT') return 'Источник: плавка оловянной руды.';
    if (resource === 'BRONZE_INGOT') return 'Крафт: 3 медных + 1 оловянный слиток → 4 бронзы.';
    if (resource === 'SILVER_INGOT') return 'Источник: плавка серебряной руды.';
    if (resource === 'GOLD_INGOT') return 'Источник: плавка золотой руды.';
    if (resource === 'IRON_INGOT') return 'Источник: печь. 1 железная руда + топливо.';
    if (resource === 'COPPER_FITTING') return 'Крафт из медных слитков.';
    if (resource === 'COBBLESTONE') return 'Источник: Каменоломня. Нужна деревянная кирка или лучше.';
    if (resource === 'IRON_ORE') return 'Источник: Железная жила. Нужна каменная кирка или лучше.';
    if (resource === 'COAL') return 'Источник: Угольная жила. Нужна деревянная кирка или лучше.';
    if (resource === 'LOG') return 'Источник: Лес. Топор даёт больше.';
    return undefined;
  }
  return `Источник: ${site.sourceName}. Нужна: ${site.toolName}.`;
}

export const SMELT_ORES: Array<{
  ore: ResourceType;
  ingot: ResourceType;
  label: string;
  flagsAny: readonly string[];
}> = [
  { ore: 'IRON_ORE', ingot: 'IRON_INGOT', label: '⛓ Железо', flagsAny: [] },
  { ore: 'COPPER_ORE', ingot: 'COPPER_INGOT', label: '🟠 Медь', flagsAny: ['week_1_complete'] },
  { ore: 'TIN_ORE', ingot: 'TIN_INGOT', label: '⚪ Олово', flagsAny: ['week_2_complete'] },
  { ore: 'SILVER_ORE', ingot: 'SILVER_INGOT', label: '✨ Серебро', flagsAny: ['week_3_complete'] },
  { ore: 'GOLD_ORE', ingot: 'GOLD_INGOT', label: '🟡 Золото', flagsAny: ['week_4_complete'] },
];

export function smeltRowUnlocked(
  row: (typeof SMELT_ORES)[number],
  flags: Record<string, string>,
  resources: Partial<Record<ResourceType, number>>,
): boolean {
  if (!row.flagsAny.length) return true;
  if (row.flagsAny.some((flag) => flags[flag] != null)) return true;
  if ((resources[row.ore] ?? 0) > 0) return true;
  if ((resources[row.ingot] ?? 0) > 0) return true;
  return false;
}

export function craftUnlockNote(recipeId: string, flags: Record<string, string>): string {
  if (recipeId === 'bronze_ingot' && !flags.seen_bronze_recipes) {
    return ' Открыты новые рецепты: бронзовые инструменты.';
  }
  if (recipeId === 'bronze_pickaxe' && !flags.seen_deep_veins) {
    return ' Бронзовая кирка открывает серебро, золото и глубинную шахту.';
  }
  if (recipeId === 'copper_fitting' && !flags.seen_copper_recipes) {
    return ' Открыты новые рецепты: шахтёрский фонарь, медная стяжка.';
  }
  return '';
}

export function craftUnlockFlags(recipeId: string): string[] {
  if (recipeId === 'bronze_ingot') return ['seen_bronze_recipes'];
  if (recipeId === 'bronze_pickaxe') return ['seen_deep_veins', 'has_bronze_pickaxe'];
  if (recipeId === 'copper_fitting') return ['seen_copper_recipes'];
  if (recipeId === 'deep_pickaxe') return ['has_deep_pickaxe'];
  return [];
}
