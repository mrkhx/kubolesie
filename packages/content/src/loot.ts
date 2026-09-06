import type { ResourceType } from '@kubolesie/shared';

export interface CombatLootSpec {
  xp: number;
  xpRepeat: number;
  coins?: number;
  resources?: Partial<Record<ResourceType, [number, number]>>;
  firstItems?: string[];
  firstFlags?: string[];
  rare?: { templateId: string; percent: number; flag: string };
  dailyKill?: boolean;
}

export const COMBAT_LOOT: Record<string, CombatLootSpec> = {
  moss_boar: {
    xp: 16,
    xpRepeat: 8,
    resources: { HIDE: [1, 2] },
    dailyKill: true,
  },
  needle_runner: {
    xp: 14,
    xpRepeat: 7,
    resources: { HIDE: [1, 1] },
    dailyKill: true,
  },
  pitch_mite: {
    xp: 20,
    xpRepeat: 10,
    resources: { HIDE: [1, 1] },
    dailyKill: true,
  },
  resin_brute: {
    xp: 28,
    xpRepeat: 12,
    resources: { HIDE: [2, 2] },
    firstItems: ['wedge_map_fragment'],
    firstFlags: ['wedge_map_fragment', 'wedge_roots_cleared'],
    rare: { templateId: 'resin_mail', percent: 12, flag: 'has_rare_d5' },
    dailyKill: true,
  },
  stumpfang: {
    xp: 40,
    xpRepeat: 12,
    firstItems: ['stumpfang_tooth'],
    firstFlags: ['defeated_stumpfang', 'has_stumpfang_tooth'],
    dailyKill: true,
  },
  soot_mite: {
    xp: 8,
    xpRepeat: 4,
    resources: { COAL: [0, 1] },
  },
  mine_crawler: {
    xp: 24,
    xpRepeat: 8,
    coins: 14,
    resources: { CHITIN_PLATE: [1, 1] },
  },
};

export const WEDGE_STAGE_ENEMIES: Record<string, string> = {
  path: 'moss_boar',
  path_alt: 'needle_runner',
  pitch: 'pitch_mite',
  roots: 'resin_brute',
  stump: 'stumpfang',
};
