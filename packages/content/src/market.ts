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
] as const satisfies readonly ResourceType[];

export const NON_TRADEABLE_RESOURCES = [
  'SEAL_SHARD_6',
  'BOG_CORE',
  'SHINY_STONE',
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
