import {
  AUCTION,
  MARKET,
  assertKnownResource,
  auctionDurationMs,
  isTradeableAsset,
  listingExpiresAt,
  marketFee,
  minBidAmount,
  type MarketAssetKind,
  type MarketListingType,
} from '@kubolesie/content';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
  NotFoundError,
} from './errors';
import type {
  AuctionBidRecord,
  GameStore,
  MarketListingRecord,
  MarketSearchQuery,
  MarketTransactionRecord,
} from './store';

export const AWAITING_MARKET_FLAG = 'awaiting_market_input';

export interface CreateListingInput {
  sellerPlayerId: string;
  assetKind?: MarketAssetKind | string;
  assetRef: string;
  quantity: number;
  unitPrice: number;
  requestId?: string;
  now?: Date;
}

export interface CreateAuctionInput {
  sellerPlayerId: string;
  assetRef: string;
  quantity: number;
  startingPrice: number;
  buyoutPrice?: number | null;
  durationHours: number;
  requestId?: string;
  now?: Date;
}

export interface BuyListingInput {
  listingId: string;
  buyerPlayerId: string;
  requestId?: string;
  now?: Date;
}

export interface PlaceBidInput {
  listingId: string;
  bidderPlayerId: string;
  amount: number;
  requestId?: string;
  now?: Date;
}

function asInt(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ActionRejectedError(`${label} некорректен.`);
  return Math.trunc(value);
}

export function validateListingNumbers(quantity: number, unitPrice: number): {
  quantity: number;
  unitPrice: number;
  totalPrice: number;
} {
  const qty = asInt(quantity, 'Количество');
  const price = asInt(unitPrice, 'Цена');
  if (qty <= 0) throw new ActionRejectedError('Количество должно быть больше нуля.');
  if (qty > MARKET.maxListingQuantity) {
    throw new ActionRejectedError(`Не больше ${MARKET.maxListingQuantity} за лот.`);
  }
  if (price < MARKET.minPrice) throw new ActionRejectedError('Цена должна быть не меньше 1.');
  if (price > MARKET.maxPrice) throw new ActionRejectedError('Цена слишком высока.');
  if (qty > MARKET.intMax / price) throw new ActionRejectedError('Сумма лота слишком велика.');
  const totalPrice = qty * price;
  if (totalPrice > MARKET.intMax) throw new ActionRejectedError('Сумма лота слишком велика.');
  return { quantity: qty, unitPrice: price, totalPrice };
}

export function assertTradeable(kind: string, ref: string): asserts kind is MarketAssetKind {
  if (kind === 'PREMIUM' || ref === 'PREMIUM') {
    throw new ActionRejectedError('Премиум нельзя выставлять на рынок.');
  }
  if (kind !== 'RESOURCE') {
    throw new ActionRejectedError('Этот тип актива нельзя выставлять на рынок.');
  }
  if (!assertKnownResource(ref)) {
    throw new ActionRejectedError('Неизвестный ресурс.');
  }
  if (!isTradeableAsset(kind, ref)) {
    throw new ActionRejectedError('Этот товар нельзя выставлять на рынок.');
  }
}

export async function createFixedListing(
  store: GameStore,
  input: CreateListingInput,
): Promise<MarketListingRecord> {
  const kind = String(input.assetKind ?? 'RESOURCE');
  assertTradeable(kind, input.assetRef);
  const nums = validateListingNumbers(input.quantity, input.unitPrice);
  const now = input.now ?? new Date();
  return store.createFixedListing({
    sellerPlayerId: input.sellerPlayerId,
    assetKind: 'RESOURCE',
    assetRef: input.assetRef,
    quantity: nums.quantity,
    unitPrice: nums.unitPrice,
    totalPrice: nums.totalPrice,
    listingType: 'FIXED_PRICE',
    expiresAt: listingExpiresAt(now),
    requestId: input.requestId,
    now,
  });
}

export async function createAuctionListing(
  store: GameStore,
  input: CreateAuctionInput,
): Promise<MarketListingRecord> {
  assertTradeable('RESOURCE', input.assetRef);
  const qty = asInt(input.quantity, 'Количество');
  const start = asInt(input.startingPrice, 'Стартовая цена');
  if (qty <= 0) throw new ActionRejectedError('Количество должно быть больше нуля.');
  if (qty > MARKET.maxListingQuantity) {
    throw new ActionRejectedError(`Не больше ${MARKET.maxListingQuantity} за лот.`);
  }
  if (start < MARKET.minPrice) throw new ActionRejectedError('Стартовая цена должна быть не меньше 1.');
  if (start > MARKET.maxPrice) throw new ActionRejectedError('Цена слишком высока.');
  const hours = asInt(input.durationHours, 'Срок');
  if (!(AUCTION.durationHours as readonly number[]).includes(hours)) {
    throw new ActionRejectedError('Срок аукциона: 6, 12, 24, 48 или 72 часа.');
  }
  let buyout: number | null = null;
  if (input.buyoutPrice != null && Number(input.buyoutPrice) > 0) {
    buyout = asInt(input.buyoutPrice, 'Выкуп');
    if (buyout <= start) throw new ActionRejectedError('Выкуп должен быть выше стартовой цены.');
    if (buyout > MARKET.maxPrice) throw new ActionRejectedError('Цена слишком высока.');
  }
  const now = input.now ?? new Date();
  const ttl = auctionDurationMs(hours);
  return store.createFixedListing({
    sellerPlayerId: input.sellerPlayerId,
    assetKind: 'RESOURCE',
    assetRef: input.assetRef,
    quantity: qty,
    unitPrice: start,
    totalPrice: start,
    listingType: 'AUCTION',
    expiresAt: new Date(now.getTime() + ttl),
    requestId: input.requestId,
    now,
    startingPrice: start,
    buyoutPrice: buyout,
    currentBid: null,
    bidCount: 0,
  });
}

export async function cancelListing(
  store: GameStore,
  listingId: string,
  sellerPlayerId: string,
  now?: Date,
): Promise<MarketListingRecord> {
  if (!listingId || !sellerPlayerId) throw new ActionRejectedError('Некорректный лот.');
  return store.cancelListing({ listingId, sellerPlayerId, now });
}

export async function buyFixedListing(
  store: GameStore,
  input: BuyListingInput,
): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }> {
  if (!input.listingId || !input.buyerPlayerId) throw new ActionRejectedError('Некорректная покупка.');
  return store.buyFixedListing(input);
}

export async function placeBid(
  store: GameStore,
  input: PlaceBidInput,
): Promise<{ listing: MarketListingRecord; bid: AuctionBidRecord }> {
  if (!input.listingId || !input.bidderPlayerId) throw new ActionRejectedError('Некорректная ставка.');
  const amount = asInt(input.amount, 'Ставка');
  if (amount <= 0) throw new ActionRejectedError('Ставка должна быть больше нуля.');
  if (amount > MARKET.maxPrice) throw new ActionRejectedError('Ставка слишком высока.');
  return store.placeAuctionBid({ ...input, amount });
}

export async function buyoutAuction(
  store: GameStore,
  input: BuyListingInput,
): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }> {
  if (!input.listingId || !input.buyerPlayerId) throw new ActionRejectedError('Некорректный выкуп.');
  return store.buyoutAuction(input);
}

export async function expireListing(
  store: GameStore,
  listingId: string,
  now?: Date,
): Promise<MarketListingRecord> {
  if (!listingId) throw new NotFoundError('Лот не найден.');
  return store.expireListing(listingId, now);
}

export async function getOwnListings(
  store: GameStore,
  sellerPlayerId: string,
): Promise<MarketListingRecord[]> {
  await store.expireDueListings();
  return store.getOwnListings(sellerPlayerId);
}

export async function searchActiveListings(
  store: GameStore,
  query: MarketSearchQuery,
  now?: Date,
): Promise<MarketListingRecord[]> {
  return store.searchActiveListings(query, now);
}

export async function settleExpiredAuctions(store: GameStore, now?: Date, limit?: number): Promise<number> {
  return store.settleExpiredAuctions(now, limit);
}

export function listingFeePreview(totalPrice: number): { fee: number; sellerNet: number } {
  const fee = marketFee(totalPrice);
  return { fee, sellerNet: totalPrice - fee };
}

export function nextBidMinimum(listing: MarketListingRecord): number {
  const start = listing.startingPrice ?? listing.unitPrice;
  return minBidAmount(listing.currentBid, start);
}

export const MARKET_LISTING_TYPE_FIXED: MarketListingType = 'FIXED_PRICE';

export {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
  NotFoundError,
};
