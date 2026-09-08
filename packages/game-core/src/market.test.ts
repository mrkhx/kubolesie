import { describe, expect, it } from 'vitest';
import {
  MARKET,
  TRADEABLE_RESOURCES,
  isTradeableAsset,
  marketFee,
  marketSellerNet,
} from '@kubolesie/content';
import { GAME_COMMANDS, PROTOTYPE_VERSION, BALANCE_VERSION } from '@kubolesie/shared';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
} from './errors';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import {
  buyFixedListing,
  cancelListing,
  createFixedListing,
  expireListing,
  getOwnListings,
  searchActiveListings,
} from './market';
import { ACTION_MENUS } from './menus';
import type { NormalizedIncomingEvent } from '@kubolesie/shared';
import type { PlayerRecord } from './store';

async function player(store: MemoryGameStore, vk: string, name = 'Путник') {
  return store.createPlayer({ vkUserId: vk, name });
}

async function seedResource(store: MemoryGameStore, id: string, resource: 'LOG' | 'COAL' | 'PLANK', amount: number) {
  await store.addResource(id, resource, amount);
}

function event(
  type: NormalizedIncomingEvent['command']['type'],
  vkUserId: string,
  payload: Record<string, unknown> = {},
  eventId = `e-${type}-${Math.random().toString(16).slice(2)}`,
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
  };
}

describe('player market foundation — tradeability', () => {
  it('accepts allowlisted resources and rejects story/seal/premium', () => {
    expect(isTradeableAsset('RESOURCE', 'LOG')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'MIST_RESIN')).toBe(true);
    expect(isTradeableAsset('RESOURCE', 'SEAL_SHARD_6')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'BOG_CORE')).toBe(false);
    expect(isTradeableAsset('RESOURCE', 'SHINY_STONE')).toBe(false);
    expect(isTradeableAsset('ITEM', 'rusty_token')).toBe(false);
    expect(isTradeableAsset('ITEM', 'seal_shard_7')).toBe(false);
    expect(isTradeableAsset('PREMIUM', 'PREMIUM')).toBe(false);
    expect(TRADEABLE_RESOURCES).toContain('CHITIN_PLATE');
    expect(TRADEABLE_RESOURCES).not.toContain('SEAL_SHARD_6');
  });

  it('rejects story item, seal shard and premium at listing time', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's1');
    await expect(
      createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetKind: 'ITEM',
        assetRef: 'rusty_token',
        quantity: 1,
        unitPrice: 10,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'SEAL_SHARD_6',
        quantity: 1,
        unitPrice: 10,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetKind: 'PREMIUM',
        assetRef: 'PREMIUM',
        quantity: 1,
        unitPrice: 10,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });
});

describe('player market foundation — listing + escrow', () => {
  it('creates a listing and moves the resource into escrow', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-escrow');
    await seedResource(store, seller.id, 'LOG', 5);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 3,
      unitPrice: 4,
    });
    expect(listing.status).toBe('ACTIVE');
    expect(listing.listingType).toBe('FIXED_PRICE');
    expect(listing.totalPrice).toBe(12);
    expect((await store.getResources(seller.id)).LOG).toBe(2);
    expect(listing.sellerPlayerId).toBe(seller.id);
  });

  it('validates quantity and price', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-val');
    await seedResource(store, seller.id, 'LOG', 10);
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: 0, unitPrice: 5 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: -1, unitPrice: 5 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: 1, unitPrice: 0 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: 1, unitPrice: -3 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: MARKET.maxListingQuantity + 1,
        unitPrice: 1,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        unitPrice: MARKET.maxPrice + 1,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });

  it('enforces the active listing cap', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-cap');
    await seedResource(store, seller.id, 'LOG', 20);
    for (let i = 0; i < MARKET.maxActiveListingsPerPlayer; i += 1) {
      await createFixedListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        unitPrice: 2,
      });
    }
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: 1, unitPrice: 2 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    expect((await store.getResources(seller.id)).LOG).toBe(20 - MARKET.maxActiveListingsPerPlayer);
  });

  it('rejects insufficient seller assets', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-poor');
    await seedResource(store, seller.id, 'LOG', 1);
    await expect(
      createFixedListing(store, { sellerPlayerId: seller.id, assetRef: 'LOG', quantity: 2, unitPrice: 5 }),
    ).rejects.toBeInstanceOf(InsufficientResourcesError);
    expect((await store.getResources(seller.id)).LOG).toBe(1);
  });

  it('replays a duplicate listing requestId without a second escrow', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-dup');
    await seedResource(store, seller.id, 'COAL', 4);
    const first = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'COAL',
      quantity: 2,
      unitPrice: 10,
      requestId: 'list-1',
    });
    const second = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'COAL',
      quantity: 2,
      unitPrice: 10,
      requestId: 'list-1',
    });
    expect(second.id).toBe(first.id);
    expect((await store.getResources(seller.id)).COAL).toBe(2);
    expect((await getOwnListings(store, seller.id)).filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
  });
});

describe('player market foundation — cancel', () => {
  it('returns escrow once and ignores duplicate cancel', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-cancel');
    await seedResource(store, seller.id, 'LOG', 3);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 3,
      unitPrice: 5,
    });
    expect((await store.getResources(seller.id)).LOG).toBe(0);
    const cancelled = await cancelListing(store, listing.id, seller.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect((await store.getResources(seller.id)).LOG).toBe(3);
    const again = await cancelListing(store, listing.id, seller.id);
    expect(again.status).toBe('CANCELLED');
    expect((await store.getResources(seller.id)).LOG).toBe(3);
  });
});

describe('player market foundation — purchase', () => {
  it('rejects self-buy and insufficient coins', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-self');
    await seedResource(store, seller.id, 'LOG', 2);
    seller.coins = 100;
    await store.savePlayer(seller);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 2,
      unitPrice: 7,
    });
    await expect(buyFixedListing(store, { listingId: listing.id, buyerPlayerId: seller.id })).rejects.toBeInstanceOf(
      ActionRejectedError,
    );
    const buyer = await player(store, 'b-poor');
    buyer.coins = 5;
    await store.savePlayer(buyer);
    await expect(buyFixedListing(store, { listingId: listing.id, buyerPlayerId: buyer.id })).rejects.toBeInstanceOf(
      InsufficientCoinsError,
    );
    expect((await store.getListing(listing.id))?.status).toBe('ACTIVE');
  });

  it('transfers asset once, pays exact gross, credits net, burns fee, writes both ledgers', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-ok', 'Продавец');
    const buyer = await player(store, 'b-ok', 'Покупатель');
    await store.addResource(seller.id, 'IRON_ORE', 4);
    seller.coins = 10;
    buyer.coins = 100;
    await store.savePlayer(seller);
    await store.savePlayer(buyer);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'IRON_ORE',
      quantity: 4,
      unitPrice: 5,
    });
    expect(listing.totalPrice).toBe(20);
    expect(marketFee(20)).toBe(1);
    expect(marketSellerNet(20)).toBe(19);
    const { transaction } = await buyFixedListing(store, { listingId: listing.id, buyerPlayerId: buyer.id });
    expect(transaction.grossPrice).toBe(20);
    expect(transaction.fee).toBe(1);
    expect(transaction.sellerNet).toBe(19);
    expect((await store.findPlayerById(buyer.id))!.coins).toBe(80);
    expect((await store.findPlayerById(seller.id))!.coins).toBe(29);
    expect((await store.getResources(buyer.id)).IRON_ORE).toBe(4);
    expect((await store.getResources(seller.id)).IRON_ORE).toBe(0);
    const txs = await store.listMarketTransactions(listing.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.fee).toBe(1);
    const buyerLedger = await store.listCurrencyTransactions(buyer.id, listing.id);
    const sellerLedger = await store.listCurrencyTransactions(seller.id, listing.id);
    expect(buyerLedger).toEqual([
      expect.objectContaining({ amount: -20, reason: 'market_buy', balanceBefore: 100, balanceAfter: 80 }),
    ]);
    expect(sellerLedger).toEqual([
      expect.objectContaining({ amount: 19, reason: 'market_sell', balanceBefore: 10, balanceAfter: 29 }),
    ]);
    const sold = await store.getListing(listing.id);
    expect(sold?.status).toBe('SOLD');
    expect(sold?.buyerPlayerId).toBe(buyer.id);
  });

  it('replays a duplicate buy requestId without a second transfer', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-bdup');
    const buyer = await player(store, 'b-bdup');
    await store.addResource(seller.id, 'HIDE', 1);
    buyer.coins = 40;
    await store.savePlayer(buyer);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'HIDE',
      quantity: 1,
      unitPrice: 20,
    });
    const first = await buyFixedListing(store, {
      listingId: listing.id,
      buyerPlayerId: buyer.id,
      requestId: 'buy-1',
    });
    const second = await buyFixedListing(store, {
      listingId: listing.id,
      buyerPlayerId: buyer.id,
      requestId: 'buy-1',
    });
    expect(second.transaction.id).toBe(first.transaction.id);
    expect((await store.findPlayerById(buyer.id))!.coins).toBe(20);
    expect((await store.getResources(buyer.id)).HIDE).toBe(1);
    expect(await store.listMarketTransactions(listing.id)).toHaveLength(1);
  });

  it('uses floor 5% fee: 1–19 → 0, 20 → 1, 100 → 5', () => {
    expect(marketFee(1)).toBe(0);
    expect(marketFee(19)).toBe(0);
    expect(marketFee(20)).toBe(1);
    expect(marketFee(21)).toBe(1);
    expect(marketFee(100)).toBe(5);
    expect(marketSellerNet(100)).toBe(95);
  });
});

describe('player market foundation — races', () => {
  it('lets exactly one of two buyers succeed', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-race');
    const a = await player(store, 'b-a');
    const b = await player(store, 'b-b');
    await store.addResource(seller.id, 'PLANK', 2);
    a.coins = 50;
    b.coins = 50;
    await store.savePlayer(a);
    await store.savePlayer(b);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'PLANK',
      quantity: 2,
      unitPrice: 10,
    });
    const results = await Promise.allSettled([
      buyFixedListing(store, { listingId: listing.id, buyerPlayerId: a.id }),
      buyFixedListing(store, { listingId: listing.id, buyerPlayerId: b.id }),
    ]);
    const ok = results.filter((row) => row.status === 'fulfilled');
    const fail = results.filter((row) => row.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    const sold = (await store.getListing(listing.id))!;
    expect(sold.status).toBe('SOLD');
    const winnerId = sold.buyerPlayerId!;
    const loserId = winnerId === a.id ? b.id : a.id;
    expect((await store.getResources(winnerId)).PLANK).toBe(2);
    expect((await store.getResources(loserId)).PLANK ?? 0).toBe(0);
    expect((await store.findPlayerById(winnerId))!.coins).toBe(30);
    expect((await store.findPlayerById(loserId))!.coins).toBe(50);
    expect((await store.getResources(seller.id)).PLANK ?? 0).toBe(0);
    expect((await store.listMarketTransactions(listing.id))).toHaveLength(1);
  });

  it('cancel vs buy yields exactly one terminal result and no duplicated assets/coins', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-cvb');
    const buyer = await player(store, 'b-cvb');
    await store.addResource(seller.id, 'STICK', 3);
    buyer.coins = 40;
    seller.coins = 0;
    await store.savePlayer(buyer);
    await store.savePlayer(seller);
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'STICK',
      quantity: 3,
      unitPrice: 8,
    });
    const results = await Promise.allSettled([
      buyFixedListing(store, { listingId: listing.id, buyerPlayerId: buyer.id }),
      cancelListing(store, listing.id, seller.id),
    ]);
    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const final = (await store.getListing(listing.id))!;
    expect(['SOLD', 'CANCELLED']).toContain(final.status);
    const sellerLogs = (await store.getResources(seller.id)).STICK ?? 0;
    const buyerLogs = (await store.getResources(buyer.id)).STICK ?? 0;
    expect(sellerLogs + buyerLogs).toBe(3);
    if (final.status === 'SOLD') {
      expect(buyerLogs).toBe(3);
      expect((await store.findPlayerById(buyer.id))!.coins).toBe(16);
      expect((await store.findPlayerById(seller.id))!.coins).toBe(marketSellerNet(24));
    } else {
      expect(sellerLogs).toBe(3);
      expect((await store.findPlayerById(buyer.id))!.coins).toBe(40);
      expect((await store.findPlayerById(seller.id))!.coins).toBe(0);
    }
  });
});

describe('player market foundation — expiry + search', () => {
  it('cannot buy an expired listing and returns escrow once', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-exp');
    const buyer = await player(store, 'b-exp');
    await store.addResource(seller.id, 'CLAY', 2);
    buyer.coins = 50;
    await store.savePlayer(buyer);
    const created = new Date('2026-09-01T00:00:00Z');
    const listing = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'CLAY',
      quantity: 2,
      unitPrice: 6,
      now: created,
    });
    const expired = await expireListing(store, listing.id, new Date('2026-09-05T00:00:00Z'));
    expect(expired.status).toBe('EXPIRED');
    expect((await store.getResources(seller.id)).CLAY).toBe(2);
    await expect(
      buyFixedListing(store, {
        listingId: listing.id,
        buyerPlayerId: buyer.id,
        now: new Date('2026-09-05T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    const again = await expireListing(store, listing.id, new Date('2026-09-06T00:00:00Z'));
    expect(again.status).toBe('EXPIRED');
    expect((await store.getResources(seller.id)).CLAY).toBe(2);
  });

  it('search returns only ACTIVE, respects filters/sort and bounds pagination', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-search');
    await store.addResource(seller.id, 'LOG', 10);
    await store.addResource(seller.id, 'COAL', 4);
    await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 1,
      unitPrice: 9,
    });
    await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 1,
      unitPrice: 3,
    });
    await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'COAL',
      quantity: 1,
      unitPrice: 4,
    });
    const cheapLog = await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 1,
      unitPrice: 2,
    });
    await cancelListing(store, cheapLog.id, seller.id);
    const page = await searchActiveListings(store, {
      assetRef: 'LOG',
      minPrice: 1,
      maxPrice: 10,
      sort: 'price_asc',
      limit: 50,
      offset: 0,
    });
    expect(page.map((row) => row.unitPrice)).toEqual([3, 9]);
    expect(page.every((row) => row.status === 'ACTIVE')).toBe(true);
    const bounded = await searchActiveListings(store, { limit: 999, offset: 0 });
    expect(bounded.length).toBeLessThanOrEqual(50);
  });
});

describe('player market foundation — auction + UI stay closed until 1.0 wiring', () => {
  it('does not expose a player-facing market button before Week 1', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const started = await runtime.handle(event('START_GAME', 'vk-ui'));
    expect(JSON.stringify(started.buttons)).not.toMatch(/Рынок/);
    const hero = await runtime.handle(event('OPEN_MENU', 'vk-ui', { menu: 'hero' }));
    expect(JSON.stringify(hero.buttons)).not.toMatch(/Рынок/);
    const camp = await runtime.handle(event('OPEN_CAMP', 'vk-ui'));
    expect(JSON.stringify(camp.buttons)).not.toMatch(/Рынок/);
  });

  it('bumps prototype to 0.0.7', () => {
    expect(PROTOTYPE_VERSION).toBe('0.0.7');
    expect(BALANCE_VERSION).toBe('0.0.7');
    expect((GAME_COMMANDS as readonly string[]).includes('MARKET_ACT')).toBe(true);
    expect((ACTION_MENUS as readonly string[]).includes('market')).toBe(true);
  });
});
