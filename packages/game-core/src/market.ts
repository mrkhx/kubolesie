import {
  MARKET,
  assertKnownResource,
  isTradeableAsset,
  listingExpiresAt,
  marketFee,
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
  GameStore,
  MarketListingRecord,
  MarketSearchQuery,
  MarketTransactionRecord,
} from './store';

export interface CreateListingInput {
  sellerPlayerId: string;
  assetKind?: MarketAssetKind | string;
  assetRef: string;
  quantity: number;
  unitPrice: number;
  requestId?: string;
  now?: Date;
}

export interface BuyListingInput {
  listingId: string;
  buyerPlayerId: string;
  requestId?: string;
  now?: Date;
}

function asInt(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ActionRejectedError(`${label} некорректен.`);
  const n = Math.trunc(value);
  if (n !== value && !Number.isInteger(value)) {
    /* still accept trunc of floats like 3.0 */
  }
  return n;
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

export async function createAuctionListing(): Promise<never> {
  throw new ActionRejectedError('Аукцион ещё не открыт.');
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

export function listingFeePreview(totalPrice: number): { fee: number; sellerNet: number } {
  const fee = marketFee(totalPrice);
  return { fee, sellerNet: totalPrice - fee };
}

export const MARKET_LISTING_TYPE_FIXED: MarketListingType = 'FIXED_PRICE';

export {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
  NotFoundError,
};
