import type { ResourceType } from '@kubolesie/shared';
import { RESOURCE_TYPES } from '@kubolesie/shared';

/** 5% sale fee, integer floor. Fee is an economy sink. */
export const MARKET_FEE_BPS = 500;
export const MARKET_FEE_BPS_DENOM = 10_000;

export const MARKET = {
  maxActiveListingsPerPlayer: 5,
  /** Stack cap that still fits unitPrice * quantity in signed 32-bit. */
  maxListingQuantity: 999,
  minPrice: 1,
  maxPrice: 1_000_000,
  /** 72h: chat-RPG listings should not lock escrow for a week. */
  listingTtlMs: 72 * 60 * 60 * 1000,
  intMax: 2_147_483_647,
  searchLimitMax: 50,
  pageSize: 3,
  noticeBatch: 5,
} as const;

/**
 * Default-deny tradeability. Only stackable resources on this allowlist
 * can enter escrow. Equipment/instance items, quest keys, seal shards,
 * premium and bound cosmetics stay non-tradeable in this foundation.
 */
export const TRADEABLE_RESOURCES = [
  'LOG',
  'PLANK',
  'STICK',
  'COBBLESTONE',
  'COAL',
  'IRON_ORE',
  'IRON_INGOT',
  'HIDE',
  'REED',
  'CLAY',
  'RAW_FISH',
  'COOKED_FISH',
  'MIST_RESIN',
  'WOOD',
  'STONE',
  'FIBER',
  'HERBS',
  'RAW_MEAT',
  'SHREW_FUR',
  'CHITIN_PLATE',
  'FOOD',
  'SEED',
  'WHEAT',
  'STRING',
  'ROOT_FIBER',
  'ROT_RESIN',
  'BLACK_REED',
] as const satisfies readonly ResourceType[];

export const NON_TRADEABLE_RESOURCES = [
  'SEAL_SHARD_6',
  'SEAL_SHARD_5',
  'SEAL_SHARD_4',
  'BOG_CORE',
  'ROOT_CORE',
  'BLACKROOT_CORE',
  'SHINY_STONE',
  'MARSH_HEART',
  'SEAL_SHARD_3',
] as const satisfies readonly ResourceType[];

export type TradeableResource = (typeof TRADEABLE_RESOURCES)[number];
export type MarketAssetKind = 'RESOURCE';
export type MarketListingType = 'FIXED_PRICE' | 'AUCTION';
export type MarketListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';

const TRADEABLE_SET = new Set<string>(TRADEABLE_RESOURCES);

export function isTradeableResource(resource: string): resource is TradeableResource {
  return TRADEABLE_SET.has(resource);
}

export function isTradeableAsset(kind: string, ref: string): boolean {
  if (kind !== 'RESOURCE') return false;
  return isTradeableResource(ref);
}

export function assertKnownResource(ref: string): ref is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(ref);
}

/** Canonical integer fee: floor(gross * 5 / 100). 1–19 → 0. */
export function marketFee(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  const safe = Math.trunc(gross);
  return Math.floor((safe * MARKET_FEE_BPS) / MARKET_FEE_BPS_DENOM);
}

export function marketSellerNet(gross: number): number {
  return Math.trunc(gross) - marketFee(gross);
}

export function listingExpiresAt(createdAt: Date, ttlMs = MARKET.listingTtlMs): Date {
  return new Date(createdAt.getTime() + ttlMs);
}

export const AUCTION = {
  durationsMs: {
    h6: 6 * 60 * 60 * 1000,
    h12: 12 * 60 * 60 * 1000,
    h24: 24 * 60 * 60 * 1000,
    h48: 48 * 60 * 60 * 1000,
    h72: 72 * 60 * 60 * 1000,
  },
  durationHours: [6, 12, 24, 48, 72] as const,
  maxDurationMs: 72 * 60 * 60 * 1000,
  minBidBps: 500,
  antiSnipeWindowMs: 2 * 60 * 1000,
  antiSnipeExtendMs: 2 * 60 * 1000,
  maxExtensions: 5,
} as const;

export const MARKET_CATEGORIES: Record<string, readonly TradeableResource[]> = {
  wood: ['LOG', 'PLANK', 'STICK', 'WOOD'],
  stone: ['COBBLESTONE', 'STONE', 'COAL', 'IRON_ORE', 'IRON_INGOT'],
  food: ['RAW_FISH', 'COOKED_FISH', 'RAW_MEAT', 'FOOD', 'WHEAT', 'SEED'],
  mats: ['HIDE', 'REED', 'CLAY', 'FIBER', 'HERBS', 'SHREW_FUR', 'CHITIN_PLATE', 'MIST_RESIN', 'STRING', 'ROOT_FIBER', 'ROT_RESIN', 'BLACK_REED'],
};

export const MARKET_CATEGORY_LABELS: Record<string, string> = {
  wood: '🪵 Дерево',
  stone: '🪨 Камень/руда',
  food: '🍖 Еда',
  mats: '🌿 Материалы',
  all: '📋 Все',
};

export function minBidAmount(currentBid: number | null | undefined, startingPrice: number): number {
  const base = currentBid && currentBid > 0 ? currentBid : 0;
  if (!base) return Math.max(1, Math.trunc(startingPrice));
  const step = Math.max(1, Math.ceil((base * AUCTION.minBidBps) / 10_000));
  return base + step;
}

export function auctionDurationMs(hours: number): number {
  if (!(AUCTION.durationHours as readonly number[]).includes(hours)) {
    return AUCTION.durationsMs.h24;
  }
  return hours * 60 * 60 * 1000;
}
