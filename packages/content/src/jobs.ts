import type { ResourceType } from '@kubolesie/shared';

export const JOBS = {
  unlockFlag: 'week_1_complete',
  maxLevel: 20,
  dailyFull: 5,
  dailyReduced: 10,
  reducedBps: 5_000,
  slots: 3,
} as const;

export const JOB_PROFESSIONS = [
  'LOGGER',
  'MINER',
  'FARMER',
  'FISHER',
  'HUNTER',
  'CRAFTER',
] as const;

export type JobProfession = (typeof JOB_PROFESSIONS)[number];

/** Cumulative job XP to reach the indexed level. L1=0 … L20=5900. */
export const JOB_XP_THRESHOLDS = [
  0, 0, 50, 120, 220, 350, 510, 700, 920, 1170, 1450, 1760, 2100, 2470, 2870, 3300, 3760, 4250, 4770, 5320, 5900,
] as const;

export const JOB_LABELS: Record<JobProfession, string> = {
  LOGGER: '🪓 Лесоруб',
  MINER: '⛏ Шахтёр',
  FARMER: '🌾 Фермер',
  FISHER: '🎣 Рыбак',
  HUNTER: '🏹 Охотник',
  CRAFTER: '🔨 Ремесленник',
};

export const TOOL_RECIPES = [
  'wooden_pickaxe',
  'wooden_axe',
  'stone_pickaxe',
  'stone_axe',
  'iron_pickaxe',
  'iron_axe',
  'bronze_pickaxe',
  'bronze_axe',
  'deep_pickaxe',
  'stone_hoe',
  'iron_hoe',
] as const;

export const CONSUMABLE_RECIPES = ['torch', 'bread'] as const;

export type JobMetric =
  | { kind: 'gather'; resource: ResourceType }
  | { kind: 'craft'; recipeId: string }
  | { kind: 'craft_group'; group: 'tools' | 'consumable' | 'any' }
  | { kind: 'pve'; enemyId?: string }
  | { kind: 'farm'; act: 'plant' | 'harvest' }
  | { kind: 'furnace'; act: 'cook_fish' };

export interface JobProgressEvent {
  type: 'gather' | 'craft' | 'pve' | 'farm' | 'furnace';
  amount?: number;
  resource?: string;
  recipeId?: string;
  enemyId?: string;
  result?: string;
  act?: string;
}

export interface JobTemplate {
  id: string;
  profession: JobProfession;
  slot: 0 | 1 | 2;
  title: string;
  blurb: string;
  metric: JobMetric;
  target: number;
  coins: number;
  jobXp: number;
  playerXp: number;
}

export const JOB_TEMPLATES: readonly JobTemplate[] = [
  {
    id: 'logger_logs',
    profession: 'LOGGER',
    slot: 0,
    title: 'Заготовщик',
    blurb: 'Собери брёвна.',
    metric: { kind: 'gather', resource: 'LOG' },
    target: 12,
    coins: 18,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'logger_planks',
    profession: 'LOGGER',
    slot: 1,
    title: 'Плотник',
    blurb: 'Сделай доски.',
    metric: { kind: 'craft', recipeId: 'planks' },
    target: 20,
    coins: 22,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'logger_clearcut',
    profession: 'LOGGER',
    slot: 2,
    title: 'Большая вырубка',
    blurb: 'Собери много брёвен.',
    metric: { kind: 'gather', resource: 'LOG' },
    target: 35,
    coins: 40,
    jobXp: 22,
    playerXp: 6,
  },
  {
    id: 'miner_cobble',
    profession: 'MINER',
    slot: 0,
    title: 'Каменотёс',
    blurb: 'Добудь булыжник.',
    metric: { kind: 'gather', resource: 'COBBLESTONE' },
    target: 15,
    coins: 16,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'miner_coal',
    profession: 'MINER',
    slot: 1,
    title: 'Угольщик',
    blurb: 'Добудь уголь.',
    metric: { kind: 'gather', resource: 'COAL' },
    target: 12,
    coins: 20,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'miner_iron',
    profession: 'MINER',
    slot: 2,
    title: 'Железная жила',
    blurb: 'Добудь железную руду.',
    metric: { kind: 'gather', resource: 'IRON_ORE' },
    target: 10,
    coins: 36,
    jobXp: 20,
    playerXp: 6,
  },
  {
    id: 'farmer_plant',
    profession: 'FARMER',
    slot: 0,
    title: 'Сеятель',
    blurb: 'Посади семена на грядке.',
    metric: { kind: 'farm', act: 'plant' },
    target: 3,
    coins: 14,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'farmer_wheat',
    profession: 'FARMER',
    slot: 1,
    title: 'Жнец',
    blurb: 'Собери пшеницу.',
    metric: { kind: 'farm', act: 'harvest' },
    target: 6,
    coins: 20,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'farmer_bread',
    profession: 'FARMER',
    slot: 2,
    title: 'Пекарь',
    blurb: 'Испеки хлеб.',
    metric: { kind: 'craft', recipeId: 'bread' },
    target: 3,
    coins: 32,
    jobXp: 18,
    playerXp: 5,
  },
  {
    id: 'fisher_catch',
    profession: 'FISHER',
    slot: 0,
    title: 'Удочка',
    blurb: 'Добудь сырую рыбу.',
    metric: { kind: 'gather', resource: 'RAW_FISH' },
    target: 6,
    coins: 16,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'fisher_cook',
    profession: 'FISHER',
    slot: 1,
    title: 'Коптильня',
    blurb: 'Зажарь рыбу в печи.',
    metric: { kind: 'furnace', act: 'cook_fish' },
    target: 6,
    coins: 22,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'fisher_haul',
    profession: 'FISHER',
    slot: 2,
    title: 'Большой улов',
    blurb: 'Добудь много рыбы.',
    metric: { kind: 'gather', resource: 'RAW_FISH' },
    target: 14,
    coins: 38,
    jobXp: 20,
    playerXp: 6,
  },
  {
    id: 'hunter_pve',
    profession: 'HUNTER',
    slot: 0,
    title: 'Следопыт',
    blurb: 'Победи врагов в PvE.',
    metric: { kind: 'pve' },
    target: 5,
    coins: 16,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'hunter_hide',
    profession: 'HUNTER',
    slot: 1,
    title: 'Скорняк',
    blurb: 'Добудь шкуру.',
    metric: { kind: 'gather', resource: 'HIDE' },
    target: 8,
    coins: 22,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'hunter_shrew',
    profession: 'HUNTER',
    slot: 2,
    title: 'Землеройки',
    blurb: 'Победи диких землероек.',
    metric: { kind: 'pve', enemyId: 'wild_shrew' },
    target: 8,
    coins: 34,
    jobXp: 18,
    playerXp: 5,
  },
  {
    id: 'crafter_tools',
    profession: 'CRAFTER',
    slot: 0,
    title: 'Инструментальщик',
    blurb: 'Скрафти инструменты.',
    metric: { kind: 'craft_group', group: 'tools' },
    target: 3,
    coins: 18,
    jobXp: 10,
    playerXp: 3,
  },
  {
    id: 'crafter_food',
    profession: 'CRAFTER',
    slot: 1,
    title: 'Запасы',
    blurb: 'Скрафти расходники.',
    metric: { kind: 'craft_group', group: 'consumable' },
    target: 8,
    coins: 20,
    jobXp: 12,
    playerXp: 4,
  },
  {
    id: 'crafter_bulk',
    profession: 'CRAFTER',
    slot: 2,
    title: 'Мастерская',
    blurb: 'Скрафти много вещей.',
    metric: { kind: 'craft_group', group: 'any' },
    target: 12,
    coins: 36,
    jobXp: 20,
    playerXp: 6,
  },
];

export function isJobProfession(value: string): value is JobProfession {
  return (JOB_PROFESSIONS as readonly string[]).includes(value);
}

export function jobLevelForXp(xp: number): number {
  const safe = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  for (let i = JOBS.maxLevel; i >= 1; i -= 1) {
    if (safe >= JOB_XP_THRESHOLDS[i]!) {
      level = i;
      break;
    }
  }
  return Math.min(JOBS.maxLevel, level);
}

export function jobXpToNext(xp: number): { level: number; current: number; next: number | null } {
  const level = jobLevelForXp(xp);
  const current = JOB_XP_THRESHOLDS[level] ?? 0;
  const next = level >= JOBS.maxLevel ? null : (JOB_XP_THRESHOLDS[level + 1] ?? null);
  return { level, current, next };
}

export function jobCoinPayout(baseCoins: number, dailyCompletedAfter: number): number {
  const coins = Math.max(0, Math.floor(baseCoins));
  if (dailyCompletedAfter <= JOBS.dailyFull) return coins;
  if (dailyCompletedAfter <= JOBS.dailyReduced) {
    return Math.floor((coins * JOBS.reducedBps) / 10_000);
  }
  return 0;
}

export function scaledJobTarget(base: number, level: number): number {
  const lv = Math.min(JOBS.maxLevel, Math.max(1, Math.floor(level)));
  return Math.max(1, Math.ceil(base * (1 + 0.08 * (lv - 1))));
}

export function scaledJobCoins(base: number, level: number): number {
  const lv = Math.min(JOBS.maxLevel, Math.max(1, Math.floor(level)));
  return Math.max(1, Math.floor(base * (1 + 0.04 * (lv - 1))));
}

export function scaledJobXp(base: number, level: number): number {
  const lv = Math.min(JOBS.maxLevel, Math.max(1, Math.floor(level)));
  return Math.max(1, base + (lv - 1));
}

export function templatesFor(profession: JobProfession): JobTemplate[] {
  return JOB_TEMPLATES.filter((row) => row.profession === profession).sort((a, b) => a.slot - b.slot);
}

export function getJobTemplate(id: string): JobTemplate | undefined {
  return JOB_TEMPLATES.find((row) => row.id === id);
}

export function jobProfessionBonusBps(level: number): number {
  const lv = Math.min(JOBS.maxLevel, Math.max(0, Math.floor(level)));
  return Math.min(2_000, Math.floor(lv / 5) * 500);
}

export function jobMetricDelta(metric: JobMetric, event: JobProgressEvent): number {
  const amount = Math.max(0, Math.floor(event.amount ?? 1));
  if (metric.kind === 'gather') {
    if (event.type !== 'gather' || event.resource !== metric.resource) return 0;
    return amount;
  }
  if (metric.kind === 'craft') {
    if (event.type !== 'craft' || event.recipeId !== metric.recipeId) return 0;
    return amount;
  }
  if (metric.kind === 'craft_group') {
    if (event.type !== 'craft') return 0;
    const recipeId = event.recipeId ?? '';
    if (metric.group === 'any') return amount;
    if (metric.group === 'tools') {
      return (TOOL_RECIPES as readonly string[]).includes(recipeId) ? amount : 0;
    }
    return (CONSUMABLE_RECIPES as readonly string[]).includes(recipeId) ? amount : 0;
  }
  if (metric.kind === 'pve') {
    if (event.type !== 'pve' || event.result !== 'WIN') return 0;
    if (metric.enemyId && event.enemyId !== metric.enemyId) return 0;
    return 1;
  }
  if (metric.kind === 'farm') {
    if (event.type !== 'farm' || event.act !== metric.act) return 0;
    return amount;
  }
  if (metric.kind === 'furnace') {
    if (event.type !== 'furnace' || event.act !== metric.act) return 0;
    return amount;
  }
  return 0;
}
