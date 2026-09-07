import type { EnemyTemplate } from './enemies';
import { CURRENT_SEASON } from './meta';

export const PVP_RIVALS: EnemyTemplate[] = [
  {
    id: 'yara_trace',
    name: 'След Яры',
    hp: 70,
    minDamage: 6,
    maxDamage: 9,
    defense: 2,
    speed: 9,
    dodge: 6,
    accuracy: 90,
    critChance: 6,
    critDamage: 150,
  },
  {
    id: 'wedge_scout',
    name: 'Разведчик клина',
    hp: 62,
    minDamage: 5,
    maxDamage: 8,
    defense: 1,
    speed: 11,
    dodge: 8,
    accuracy: 88,
    critChance: 5,
    critDamage: 150,
  },
  {
    id: 'foreign_post',
    name: 'Чужой заступ',
    hp: 80,
    minDamage: 6,
    maxDamage: 10,
    defense: 3,
    speed: 7,
    dodge: 4,
    accuracy: 90,
    critChance: 4,
    critDamage: 150,
  },
];

export function getPvpRival(id: string): EnemyTemplate | undefined {
  return PVP_RIVALS.find((row) => row.id === id);
}

export function nextPvpRival(index: number): EnemyTemplate {
  return PVP_RIVALS[index % PVP_RIVALS.length]!;
}

/** Real-player PvP 1.0. Day 6 synthetic traces stay on START_PVP + PVP_MAX. */
export const PVP_1 = {
  unlockFlag: 'week_1_complete',
  seasonId: CURRENT_SEASON.id,
  dailyRewardedCap: 10,
  vsOpponentReducedAfter: 1,
  vsOpponentZeroAfter: 3,
  eloWindows: [100, 150, 300, 800, 10_000],
  candidateLimit: 24,
  historyPageSize: 8,
  win: { coins: 4, xp: 12, token: 1 },
  winReduced: { coins: 2, xp: 5, token: 0 },
  loss: { coins: 0, xp: 3, token: 0 },
  lossReduced: { coins: 0, xp: 1, token: 0 },
} as const;

export interface PvpMilestone {
  rating: number;
  coins: number;
  xp: number;
  token: number;
  productId: string;
}

export const PVP_MILESTONES: readonly PvpMilestone[] = [
  { rating: 1100, coins: 15, xp: 20, token: 1, productId: 'title_pvp_1100' },
  { rating: 1250, coins: 25, xp: 30, token: 1, productId: 'badge_pvp_1250' },
  { rating: 1400, coins: 40, xp: 40, token: 1, productId: 'title_pvp_1400' },
  { rating: 1600, coins: 55, xp: 50, token: 2, productId: 'badge_pvp_1600' },
  { rating: 1800, coins: 70, xp: 60, token: 2, productId: 'frame_pvp_1800' },
  { rating: 2000, coins: 90, xp: 80, token: 3, productId: 'title_pvp_2000' },
];

export function pvpMilestoneRef(seasonId: string, rating: number): string {
  return `${seasonId}:${rating}`;
}

export type PvpRewardTier = 'full' | 'reduced' | 'none';

export function pvpRewardTier(vsOpponentToday: number, rewardedToday: number): PvpRewardTier {
  if (rewardedToday >= PVP_1.dailyRewardedCap) return 'none';
  if (vsOpponentToday >= PVP_1.vsOpponentZeroAfter) return 'none';
  if (vsOpponentToday >= PVP_1.vsOpponentReducedAfter) return 'reduced';
  return 'full';
}
