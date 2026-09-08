import { describe, expect, it } from 'vitest';
import {
  AUCTION,
  MARKET,
  minBidAmount,
  marketFee,
} from '@kubolesie/content';
import { GAME_COMMANDS, type NormalizedIncomingEvent } from '@kubolesie/shared';
import {
  ActionRejectedError,
  InsufficientCoinsError,
} from './errors';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import {
  buyoutAuction,
  cancelListing,
  createAuctionListing,
  createFixedListing,
  expireListing,
  placeBid,
  settleExpiredAuctions,
} from './market';
import { ACTION_MENUS } from './menus';
import type { PlayerRecord } from './store';

async function player(store: MemoryGameStore, vk: string, name = 'Путник') {
  return store.createPlayer({ vkUserId: vk, name });
}

function event(
  type: NormalizedIncomingEvent['command']['type'],
  vkUserId: string,
  payload: Record<string, unknown> = {},
  eventId = `e-${type}-${Math.random().toString(16).slice(2)}`,
  text?: string,
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
    text,
  };
}

async function coins(store: MemoryGameStore, who: PlayerRecord, amount: number) {
  who.coins = amount;
  await store.savePlayer(who);
}

describe('auction 1.0 — create', () => {
  it('creates an auction, escrows the resource and accepts allowed durations', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-auc');
    await store.addResource(seller.id, 'LOG', 50);
    const now = new Date('2026-09-08T12:00:00Z');
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 20,
      startingPrice: 10,
      buyoutPrice: 40,
      durationHours: 12,
      now,
    });
    expect(listing.listingType).toBe('AUCTION');
    expect(listing.status).toBe('ACTIVE');
    expect(listing.startingPrice).toBe(10);
    expect(listing.buyoutPrice).toBe(40);
    expect(listing.currentBid).toBeNull();
    expect(listing.expiresAt.getTime() - now.getTime()).toBe(12 * 60 * 60 * 1000);
    expect((await store.getResources(seller.id)).LOG).toBe(30);
  });

  it('rejects invalid start, buyout, duration and the active cap', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-bad');
    await store.addResource(seller.id, 'LOG', 40);
    await expect(
      createAuctionListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        startingPrice: 0,
        durationHours: 24,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createAuctionListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        startingPrice: 10,
        buyoutPrice: 10,
        durationHours: 24,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    await expect(
      createAuctionListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        startingPrice: 10,
        durationHours: 8,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    for (let i = 0; i < MARKET.maxActiveListingsPerPlayer; i += 1) {
      await createAuctionListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        startingPrice: 2,
        durationHours: 6,
      });
    }
    await expect(
      createAuctionListing(store, {
        sellerPlayerId: seller.id,
        assetRef: 'LOG',
        quantity: 1,
        startingPrice: 2,
        durationHours: 6,
      }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
  });
});

describe('auction 1.0 — bids', () => {
  it('holds coins, refunds the previous bidder once and applies the 5% step', async () => {
    expect(minBidAmount(null, 100)).toBe(100);
    expect(minBidAmount(100, 100)).toBe(105);
    expect(minBidAmount(1, 1)).toBe(2);
    const store = new MemoryGameStore();
    const seller = await player(store, 's-bid');
    const a = await player(store, 'a-bid', 'Анна');
    const b = await player(store, 'b-bid', 'Борис');
    await store.addResource(seller.id, 'COAL', 5);
    await coins(store, a, 200);
    await coins(store, b, 200);
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'COAL',
      quantity: 5,
      startingPrice: 20,
      buyoutPrice: 80,
      durationHours: 24,
    });
    const first = await placeBid(store, { listingId: listing.id, bidderPlayerId: a.id, amount: 20 });
    expect(first.bid.status).toBe('HOLD');
    expect((await store.findPlayerById(a.id))!.coins).toBe(180);
    await expect(
      placeBid(store, { listingId: listing.id, bidderPlayerId: a.id, amount: 20 }),
    ).rejects.toBeInstanceOf(ActionRejectedError);
    const second = await placeBid(store, { listingId: listing.id, bidderPlayerId: b.id, amount: 22 });
    expect(second.listing.currentBidderPlayerId).toBe(b.id);
    expect((await store.findPlayerById(a.id))!.coins).toBe(200);
    expect((await store.findPlayerById(b.id))!.coins).toBe(178);
    const ledgerA = await store.listCurrencyTransactions(a.id, listing.id);
    expect(ledgerA.some((row) => row.reason === 'auction_bid_hold')).toBe(true);
    expect(ledgerA.some((row) => row.reason === 'auction_bid_release')).toBe(true);
    await expect(
      placeBid(store, { listingId: listing.id, bidderPlayerId: seller.id, amount: 30 }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/свой/) });
    await expect(
      placeBid(store, { listingId: listing.id, bidderPlayerId: a.id, amount: 80 }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/Купить сразу/) });
    const poor = await player(store, 'poor');
    await coins(store, poor, 1);
    await expect(
      placeBid(store, { listingId: listing.id, bidderPlayerId: poor.id, amount: 30 }),
    ).rejects.toBeInstanceOf(InsufficientCoinsError);
  });

  it('self-raise holds only the difference and replays duplicate requestId', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-raise');
    const bidder = await player(store, 'b-raise');
    await store.addResource(seller.id, 'PLANK', 2);
    await coins(store, bidder, 100);
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'PLANK',
      quantity: 2,
      startingPrice: 10,
      durationHours: 6,
    });
    await placeBid(store, { listingId: listing.id, bidderPlayerId: bidder.id, amount: 10, requestId: 'bid-1' });
    const again = await placeBid(store, {
      listingId: listing.id,
      bidderPlayerId: bidder.id,
      amount: 10,
      requestId: 'bid-1',
    });
    expect(again.bid.amount).toBe(10);
    expect((await store.findPlayerById(bidder.id))!.coins).toBe(90);
    await placeBid(store, { listingId: listing.id, bidderPlayerId: bidder.id, amount: 12 });
    expect((await store.findPlayerById(bidder.id))!.coins).toBe(88);
  });

  it('serializes concurrent bids so only one high bidder remains', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-race');
    const a = await player(store, 'a-race');
    const b = await player(store, 'b-race');
    await store.addResource(seller.id, 'HIDE', 1);
    await coins(store, a, 50);
    await coins(store, b, 50);
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'HIDE',
      quantity: 1,
      startingPrice: 10,
      durationHours: 6,
    });
    const results = await Promise.allSettled([
      placeBid(store, { listingId: listing.id, bidderPlayerId: a.id, amount: 10 }),
      placeBid(store, { listingId: listing.id, bidderPlayerId: b.id, amount: 12 }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    const fresh = await store.getListing(listing.id);
    expect(fresh?.currentBidderPlayerId === a.id || fresh?.currentBidderPlayerId === b.id).toBe(true);
    const coinsA = (await store.findPlayerById(a.id))!.coins;
    const coinsB = (await store.findPlayerById(b.id))!.coins;
    if (fresh?.currentBidderPlayerId === a.id) {
      expect(coinsA).toBe(40);
      expect(coinsB).toBe(50);
    } else {
      expect(coinsB).toBe(38);
      expect(coinsA).toBe(50);
    }
  });
});

describe('auction 1.0 — buyout / settle / cancel / anti-snipe', () => {
  it('buyout pays the difference, refunds the other bidder and is idempotent', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-bo');
    const a = await player(store, 'a-bo');
    const b = await player(store, 'b-bo');
    await store.addResource(seller.id, 'REED', 3);
    await coins(store, seller, 0);
    await coins(store, a, 100);
    await coins(store, b, 100);
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'REED',
      quantity: 3,
      startingPrice: 10,
      buyoutPrice: 40,
      durationHours: 24,
    });
    await placeBid(store, { listingId: listing.id, bidderPlayerId: a.id, amount: 10 });
    const sold = await buyoutAuction(store, { listingId: listing.id, buyerPlayerId: b.id, requestId: 'bo-1' });
    expect(sold.listing.status).toBe('SOLD');
    expect(sold.transaction.grossPrice).toBe(40);
    expect(sold.transaction.fee).toBe(marketFee(40));
    expect(sold.transaction.sellerNet).toBe(40 - marketFee(40));
    expect((await store.findPlayerById(a.id))!.coins).toBe(100);
    expect((await store.findPlayerById(b.id))!.coins).toBe(60);
    expect((await store.findPlayerById(seller.id))!.coins).toBe(40 - marketFee(40));
    expect((await store.getResources(b.id)).REED).toBe(3);
    const again = await buyoutAuction(store, { listingId: listing.id, buyerPlayerId: b.id, requestId: 'bo-1' });
    expect(again.transaction.id).toBe(sold.transaction.id);
    expect((await store.findPlayerById(b.id))!.coins).toBe(60);
  });

  it('high bidder buyout spends only the remaining difference', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-diff');
    const bidder = await player(store, 'b-diff');
    await store.addResource(seller.id, 'CLAY', 1);
    await coins(store, seller, 0);
    await coins(store, bidder, 50);
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'CLAY',
      quantity: 1,
      startingPrice: 10,
      buyoutPrice: 30,
      durationHours: 6,
    });
    await placeBid(store, { listingId: listing.id, bidderPlayerId: bidder.id, amount: 10 });
    await buyoutAuction(store, { listingId: listing.id, buyerPlayerId: bidder.id });
    expect((await store.findPlayerById(bidder.id))!.coins).toBe(20);
    expect((await store.getResources(bidder.id)).CLAY).toBe(1);
  });

  it('settles with a winner or returns escrow when there are no bids', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-set');
    const winner = await player(store, 'w-set');
    await store.addResource(seller.id, 'LOG', 4);
    await coins(store, seller, 0);
    await coins(store, winner, 40);
    const now = new Date('2026-09-08T00:00:00Z');
    const withBid = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 2,
      startingPrice: 8,
      durationHours: 6,
      now,
    });
    const empty = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 2,
      startingPrice: 8,
      durationHours: 6,
      now,
    });
    await placeBid(store, { listingId: withBid.id, bidderPlayerId: winner.id, amount: 8, now });
    const later = new Date('2026-09-08T07:00:00Z');
    expect((await settleExpiredAuctions(store, later, 10)) >= 1).toBe(true);
    const sold = await store.getListing(withBid.id);
    const expired = await store.getListing(empty.id);
    expect(sold?.status).toBe('SOLD');
    expect(expired?.status).toBe('EXPIRED');
    expect((await store.getResources(winner.id)).LOG).toBe(2);
    expect((await store.getResources(seller.id)).LOG).toBe(2);
    expect((await store.findPlayerById(seller.id))!.coins).toBe(8 - marketFee(8));
    expect((await store.findPlayerById(winner.id))!.coins).toBe(32);
    const again = await expireListing(store, withBid.id, later);
    expect(again.status).toBe('SOLD');
    expect((await store.findPlayerById(seller.id))!.coins).toBe(8 - marketFee(8));
  });

  it('forbids cancel after a bid and allows cancel with no bids', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-can');
    const bidder = await player(store, 'b-can');
    await store.addResource(seller.id, 'STICK', 4);
    await coins(store, bidder, 20);
    const open = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'STICK',
      quantity: 2,
      startingPrice: 3,
      durationHours: 6,
    });
    const live = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'STICK',
      quantity: 2,
      startingPrice: 3,
      durationHours: 6,
    });
    await placeBid(store, { listingId: live.id, bidderPlayerId: bidder.id, amount: 3 });
    await expect(cancelListing(store, live.id, seller.id)).rejects.toMatchObject({
      message: expect.stringMatching(/ставк/),
    });
    const cancelled = await cancelListing(store, open.id, seller.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect((await store.getResources(seller.id)).STICK).toBe(2);
    const again = await cancelListing(store, open.id, seller.id);
    expect(again.status).toBe('CANCELLED');
    expect((await store.getResources(seller.id)).STICK).toBe(2);
  });

  it('extends in the last 2 minutes at most 5 times', async () => {
    const store = new MemoryGameStore();
    const seller = await player(store, 's-snipe');
    const a = await player(store, 'a-snipe');
    const b = await player(store, 'b-snipe');
    await store.addResource(seller.id, 'WOOD', 1);
    await coins(store, a, 500);
    await coins(store, b, 500);
    const start = new Date('2026-09-08T12:00:00Z');
    const listing = await createAuctionListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'WOOD',
      quantity: 1,
      startingPrice: 10,
      durationHours: 6,
      now: start,
    });
    const early = new Date(listing.expiresAt.getTime() - 10 * 60_000);
    const first = await placeBid(store, {
      listingId: listing.id,
      bidderPlayerId: a.id,
      amount: 10,
      now: early,
    });
    expect(first.listing.expiresAt.getTime()).toBe(listing.expiresAt.getTime());
    let current = first.listing;
    let amount = 10;
    let bidder = b.id;
    for (let i = 0; i < AUCTION.maxExtensions + 1; i += 1) {
      amount = minBidAmount(amount, 10);
      const at = new Date(current.expiresAt.getTime() - 30_000);
      const next = await placeBid(store, {
        listingId: listing.id,
        bidderPlayerId: bidder,
        amount,
        now: at,
      });
      if (i < AUCTION.maxExtensions) {
        expect(next.listing.expiresAt.getTime()).toBe(current.expiresAt.getTime() + AUCTION.antiSnipeExtendMs);
      } else {
        expect(next.listing.expiresAt.getTime()).toBe(current.expiresAt.getTime());
        expect(next.listing.extensionCount).toBe(AUCTION.maxExtensions);
      }
      current = next.listing;
      bidder = bidder === a.id ? b.id : a.id;
    }
  });
});

describe('player market UI + notices', () => {
  it('unlocks the compact market hub after week_1_complete', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', 'vk-m'));
    const locked = await runtime.handle(event('OPEN_MENU', 'vk-m', { menu: 'market' }));
    expect(locked.text).toMatch(/Неделю 1|печать/);
    const playerRow = (await store.findPlayerByVkUserId('vk-m'))!;
    await store.setFlag(playerRow.id, 'week_1_complete', '1');
    await store.addResource(playerRow.id, 'LOG', 20);
    await coins(store, playerRow, 80);
    const hero = await runtime.handle(event('OPEN_MENU', 'vk-m', { menu: 'hero' }));
    expect(hero.buttons.map((row) => row.label)).toEqual(['👤 Профиль', '⚔ PvP', '🛒 Рынок', '🏕 Клан', '⬅ Назад']);
    const hub = await runtime.handle(event('OPEN_MENU', 'vk-m', { menu: 'market' }));
    expect(hub.text).toMatch(/Рынок/);
    expect(hub.buttons).toHaveLength(5);
    expect(hub.buttons.map((row) => row.label)).toEqual([
      '🔎 Купить',
      '➕ Продать',
      '📦 Мои лоты',
      '🔨 Аукцион',
      '⬅ Назад',
    ]);
    expect((ACTION_MENUS as readonly string[]).includes('market')).toBe(true);
    expect((GAME_COMMANDS as readonly string[]).includes('MARKET_ACT')).toBe(true);
  });

  it('creates a listing from the sell flow and buys it from another player', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', 'vk-sell'));
    await runtime.handle(event('START_GAME', 'vk-buy'));
    const seller = (await store.findPlayerByVkUserId('vk-sell'))!;
    const buyer = (await store.findPlayerByVkUserId('vk-buy'))!;
    await store.setFlag(seller.id, 'week_1_complete', '1');
    await store.setFlag(buyer.id, 'week_1_complete', '1');
    await store.addResource(seller.id, 'LOG', 20);
    await coins(store, buyer, 80);
    const pick = await runtime.handle(event('MARKET_ACT', 'vk-sell', { act: 'sell_res', ref: 'LOG' }));
    expect(pick.text).toMatch(/Сколько/);
    const price = await runtime.handle(event('START_GAME', 'vk-sell', {}, 'qty-1', '20'));
    expect(price.text).toMatch(/за штуку/);
    const summary = await runtime.handle(event('START_GAME', 'vk-sell', {}, 'price-1', '3'));
    expect(summary.text).toMatch(/Итого: 60/);
    const confirm = summary.buttons.find((row) => row.label.includes('Выставить'))!;
    const listed = await runtime.handle(event('MARKET_ACT', 'vk-sell', confirm.payload ?? {}));
    expect(listed.text).toMatch(/выставлен/);
    expect((await store.getResources(seller.id)).LOG).toBe(0);
    const lots = await store.getOwnListings(seller.id);
    const buy = await runtime.handle(event('MARKET_ACT', 'vk-buy', { act: 'buy', id: lots[0]!.id }));
    expect(buy.text).toMatch(/Куплено/);
    expect((await store.getResources(buyer.id)).LOG).toBe(20);
    const ping = await runtime.handle(event('OPEN_MENU', 'vk-sell', { menu: 'hero' }));
    expect(ping.text).toMatch(/продан/i);
    const ping2 = await runtime.handle(event('OPEN_MENU', 'vk-sell', { menu: 'hero' }));
    expect(ping2.text).not.toMatch(/продан/i);
  });

  it('opens a seller shop without VK ids and keeps menus compact', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    await runtime.handle(event('START_GAME', 'vk-shop-s'));
    await runtime.handle(event('START_GAME', 'vk-shop-b'));
    const seller = (await store.findPlayerByVkUserId('vk-shop-s'))!;
    const buyer = (await store.findPlayerByVkUserId('vk-shop-b'))!;
    await store.setFlag(seller.id, 'week_1_complete', '1');
    await store.setFlag(buyer.id, 'week_1_complete', '1');
    await store.addResource(seller.id, 'LOG', 2);
    await createFixedListing(store, {
      sellerPlayerId: seller.id,
      assetRef: 'LOG',
      quantity: 1,
      unitPrice: 4,
    });
    const shop = await runtime.handle(event('MARKET_ACT', 'vk-shop-b', { act: 'shop', sid: seller.id }));
    expect(shop.text).toContain(seller.name);
    expect(shop.text).not.toContain(seller.vkUserId);
    expect(shop.buttons.length).toBeLessThanOrEqual(5);
    const price = await runtime.handle(event('MARKET_ACT', 'vk-shop-b', { act: 'price', ref: 'LOG' }));
    expect(price.text).toMatch(/недостаточно данных|монет/);
  });
});
