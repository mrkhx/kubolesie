import type { ResourceType } from '@kubolesie/shared';

export const CLAN_CREATE_COST = 200;
export const CLAN_NAME = { min: 3, max: 24 } as const;
export const CLAN_TAG = { min: 2, max: 5 } as const;
export const CLAN_DESC_MAX = 80;

/** Cumulative clan score (xp field) to reach the indexed level. L1=0 … L10=75000. */
export const CLAN_LEVEL_SCORE = [0, 500, 1500, 3500, 7000, 12_000, 20_000, 32_000, 50_000, 75_000] as const;

/** @deprecated use CLAN_LEVEL_SCORE; kept as alias for foundation callers. */
export const CLAN_LEVEL_XP = CLAN_LEVEL_SCORE;

export const CLAN_XP = {
  quest: 8,
  dailyQuest: 3,
  boss: 25,
  pvpWin: 6,
  weekComplete: 40,
} as const;

export const CLAN_DONATION_VALUES: Partial<Record<ResourceType, number>> = {
  LOG: 1,
  COBBLESTONE: 1,
  HIDE: 2,
  IRON_INGOT: 4,
  MIST_RESIN: 5,
  BOG_CORE: 15,
};

export const CLAN_DONATION_RESOURCES = [
  'LOG',
  'COBBLESTONE',
  'HIDE',
  'IRON_INGOT',
  'MIST_RESIN',
  'BOG_CORE',
] as const satisfies readonly ResourceType[];

export const CLAN_TASK_CLAN_SCORE = { daily: 40, weekly: 200 } as const;
export const CLAN_TASK_PLAYER_REWARD = {
  daily: { coins: 15, xp: 8 },
  weekly: { coins: 40, xp: 20 },
} as const;

export type ClanTaskMetric = 'gather_log' | 'pve' | 'pvp' | 'craft' | 'boss' | 'contribution';

export interface ClanTaskDef {
  id: string;
  kind: 'daily' | 'weekly';
  metric: ClanTaskMetric;
  target: number;
  title: string;
}

export const CLAN_DAILY_TASK_POOL: readonly ClanTaskDef[] = [
  { id: 'd_log', kind: 'daily', metric: 'gather_log', target: 100, title: 'Добыть 100 брёвен' },
  { id: 'd_pve', kind: 'daily', metric: 'pve', target: 20, title: 'Победить 20 врагов' },
  { id: 'd_pvp', kind: 'daily', metric: 'pvp', target: 10, title: 'Провести 10 PvP' },
  { id: 'd_craft', kind: 'daily', metric: 'craft', target: 15, title: 'Скрафтить 15 предметов' },
];

export const CLAN_WEEKLY_TASK_POOL: readonly ClanTaskDef[] = [
  { id: 'w_boss', kind: 'weekly', metric: 'boss', target: 5, title: 'Победить 5 боссов' },
  { id: 'w_contrib', kind: 'weekly', metric: 'contribution', target: 500, title: 'Внести 500 вклада' },
  { id: 'w_pvp', kind: 'weekly', metric: 'pvp', target: 50, title: 'Провести 50 PvP' },
  { id: 'w_pve', kind: 'weekly', metric: 'pve', target: 100, title: 'Завершить 100 PvE' },
];

const BANNED_NAME =
  /^(admin|system|null|undefined|test|vk|id|clan|клан|куболесье|kubolesie|official|официал|бот|bot)$/i;

function fnv(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickUnique<T>(pool: readonly T[], seed: string, count: number): T[] {
  const used = new Set<number>();
  const out: T[] = [];
  let hash = fnv(seed);
  while (out.length < count && out.length < pool.length) {
    const index = hash % pool.length;
    if (!used.has(index)) {
      used.add(index);
      out.push(pool[index]!);
    }
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  }
  return out;
}

export function dailyClanTasks(dayKey: string): ClanTaskDef[] {
  return pickUnique(CLAN_DAILY_TASK_POOL, `d:${dayKey}`, 2);
}

export function weeklyClanTask(weekKey: string): ClanTaskDef {
  return pickUnique(CLAN_WEEKLY_TASK_POOL, `w:${weekKey}`, 1)[0]!;
}

export function clanTasksFor(now: Date, dayKey: string, weekKey: string): ClanTaskDef[] {
  void now;
  return [...dailyClanTasks(dayKey), weeklyClanTask(weekKey)];
}

export function clanLevelForXp(xp: number): number {
  const score = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  for (let i = 1; i < CLAN_LEVEL_SCORE.length; i += 1) {
    if (score >= CLAN_LEVEL_SCORE[i]!) level = i + 1;
  }
  return Math.min(10, level);
}

export function clanMemberCap(level: number): number {
  const lvl = Math.max(1, Math.min(10, Number.isFinite(level) ? Math.floor(level) : 1));
  if (lvl >= 10) return 30;
  return 10 + (lvl - 1) * 2;
}

export function clanLeaderboardScore(_xp: number, weeklyContribution: number): number {
  return Number.isFinite(weeklyContribution) ? Math.max(0, Math.floor(weeklyContribution)) : 0;
}

export function donationValue(resource: string): number | null {
  const value = CLAN_DONATION_VALUES[resource as ResourceType];
  return typeof value === 'number' ? value : null;
}

export function normalizeClanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
}

export function validateClanName(raw: string): string {
  const name = normalizeClanName(raw);
  if (name.length < CLAN_NAME.min || name.length > CLAN_NAME.max) {
    throw new Error(`Имя клана: ${CLAN_NAME.min}–${CLAN_NAME.max} символов.`);
  }
  if (BANNED_NAME.test(name) || /https?:|www\./i.test(name)) {
    throw new Error('Такое имя клана нельзя.');
  }
  if (/[{}\[\]<>"'`\\]|<.*>/.test(name) || name.startsWith('{') || name.startsWith('[')) {
    throw new Error('Такое имя клана нельзя.');
  }
  return name;
}

export function validateClanTag(raw: string): string {
  const tag = raw.replace(/[\u0000-\u001f\u007f<>\s]/g, '').trim();
  if (tag.length < CLAN_TAG.min || tag.length > CLAN_TAG.max) {
    throw new Error(`Тег: ${CLAN_TAG.min}–${CLAN_TAG.max} символов.`);
  }
  if (!/^[0-9A-Za-zА-Яа-яЁё]+$/.test(tag)) {
    throw new Error('Тег: только буквы и цифры.');
  }
  if (BANNED_NAME.test(tag)) {
    throw new Error('Такой тег нельзя.');
  }
  return tag.toUpperCase();
}

export function validateClanDescription(raw: string): string {
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > CLAN_DESC_MAX) {
    throw new Error(`Описание: до ${CLAN_DESC_MAX} символов.`);
  }
  if (/https?:|www\.|<.*>|[{}\[\]\\]/.test(text)) {
    throw new Error('Такое описание нельзя.');
  }
  return text;
}

export function parseClanCreateLine(raw: string): { name: string; tag: string } {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const parts = collapsed.split(' ');
  if (parts.length < 2) {
    throw new Error('Напиши название и тег через пробел. Например: Север СВР');
  }
  const tag = parts[parts.length - 1]!;
  const name = parts.slice(0, -1).join(' ');
  return { name: validateClanName(name), tag: validateClanTag(tag) };
}

export function taskPeriodKey(task: ClanTaskDef, dayKey: string, weekKey: string): string {
  return task.kind === 'daily' ? dayKey : weekKey;
}

export function taskParticipationKey(periodKey: string, taskId: string): string {
  return `t:${periodKey}:${taskId}`;
}

export function dailyContributionKey(dayKey: string): string {
  return `d:${dayKey}`;
}

export function isWeeklyPeriodKey(periodKey: string): boolean {
  return /^\d{4}-W\d{2}$/.test(periodKey);
}
