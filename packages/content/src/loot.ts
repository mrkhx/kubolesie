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
  threadling: {
    xp: 16,
    xpRepeat: 8,
    resources: { STRING: [1, 1], REED: [0, 1] },
    firstFlags: ['first_string'],
    dailyKill: false,
  },
  reed_stalker: {
    xp: 22,
    xpRepeat: 10,
    resources: { STRING: [1, 2], REED: [1, 1] },
    firstFlags: ['first_string'],
  },
  bog_gnawer: {
    xp: 18,
    xpRepeat: 9,
    resources: { RAW_FISH: [1, 1], CLAY: [0, 1] },
  },
  pitch_carapace: {
    xp: 28,
    xpRepeat: 12,
    resources: { MIST_RESIN: [1, 2], STRING: [0, 1] },
  },
  smolnik: {
    xp: 50,
    xpRepeat: 16,
    resources: { MIST_RESIN: [2, 3] },
    firstFlags: ['defeated_smolnik'],
  },
  mist_warden: {
    xp: 90,
    xpRepeat: 20,
    firstItems: ['mist_charm', 'seal_shard_6'],
    firstFlags: ['mist_warden_defeated'],
  },
  root_crawler: {
    xp: 18,
    xpRepeat: 9,
    resources: { ROOT_FIBER: [1, 2], FIBER: [0, 1] },
  },
  bark_hound: {
    xp: 24,
    xpRepeat: 12,
    resources: { HIDE: [1, 2], ROOT_FIBER: [0, 1] },
  },
  sap_stinger: {
    xp: 26,
    xpRepeat: 12,
    resources: { HERBS: [1, 1], MIST_RESIN: [0, 1] },
  },
  rootlasher: {
    xp: 55,
    xpRepeat: 18,
    resources: { ROOT_FIBER: [2, 3] },
    firstFlags: ['defeated_rootlasher'],
  },
  vyazen: {
    xp: 100,
    xpRepeat: 24,
    firstItems: ['root_charm', 'seal_shard_5'],
    firstFlags: ['vyazen_defeated'],
  },
  rot_scuttler: {
    xp: 20,
    xpRepeat: 10,
    resources: { HIDE: [1, 1], ROT_RESIN: [0, 1] },
  },
  mire_stalker: {
    xp: 26,
    xpRepeat: 12,
    resources: { HIDE: [1, 2], HERBS: [0, 1] },
  },
  bark_reaper: {
    xp: 28,
    xpRepeat: 12,
    resources: { FIBER: [1, 1], ROT_RESIN: [1, 2] },
  },
  blackroot: {
    xp: 60,
    xpRepeat: 20,
    resources: { ROT_RESIN: [2, 3] },
    firstFlags: ['defeated_blackroot'],
  },
  tlennik: {
    xp: 110,
    xpRepeat: 26,
    firstItems: ['path_charm', 'seal_shard_4'],
    firstFlags: ['tlennik_defeated'],
  },
  reed_lurker: {
    xp: 22,
    xpRepeat: 11,
    resources: { HIDE: [1, 1], BLACK_REED: [0, 1] },
  },
  mire_claw: {
    xp: 28,
    xpRepeat: 12,
    resources: { HIDE: [1, 2], RAW_FISH: [0, 1] },
  },
  drowned_shell: {
    xp: 30,
    xpRepeat: 14,
    resources: { FIBER: [1, 1], BLACK_REED: [1, 2] },
  },
  miremaw: {
    xp: 65,
    xpRepeat: 22,
    resources: { BLACK_REED: [2, 3] },
    firstFlags: ['defeated_miremaw'],
  },
  bezdonnik: {
    xp: 120,
    xpRepeat: 28,
    firstItems: ['mire_charm', 'seal_shard_3'],
    firstFlags: ['bezdonnik_defeated'],
  },
};

export const WEDGE_STAGE_ENEMIES: Record<string, string> = {
  path: 'moss_boar',
  path_alt: 'needle_runner',
  pitch: 'pitch_mite',
  roots: 'resin_brute',
  stump: 'stumpfang',
};
