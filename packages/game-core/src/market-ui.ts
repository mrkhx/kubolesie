import {
  AUCTION,
  MARKET,
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
  TRADEABLE_RESOURCES,
  marketFee,
  resourceLabel,
  type TradeableResource,
} from '@kubolesie/content';
import { BACK_LABEL, type GameButton, type GameResponse, type ResourceType } from '@kubolesie/shared';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
} from './errors';
import {
  AWAITING_MARKET_FLAG,
  buyFixedListing,
  buyoutAuction,
  cancelListing,
  createAuctionListing,
  createFixedListing,
  listingFeePreview,
  nextBidMinimum,
  placeBid,
} from './market';
import type {
  GameStore,
  MarketListingRecord,
  MarketListingType,
  PlayerRecord,
} from './store';

export const MARKET_MENUS = ['market', 'market_buy', 'market_sell', 'market_mine', 'market_auc'] as const;
export type MarketMenuId = (typeof MARKET_MENUS)[number];
export const MARKET_COMMANDS = ['MARKET_ACT'] as const;

const PAGE = MARKET.pageSize;

export function isMarketMenu(menu: string): menu is MarketMenuId {
  return (MARKET_MENUS as readonly string[]).includes(menu);
}

export function isMarketUnlocked(flags: Record<string, string>): boolean {
  return Boolean(flags.week_1_complete);
}

export async function openMarketMenu(
  store: GameStore,
  player: PlayerRecord,
  menu: MarketMenuId,
  now: Date,
): Promise<GameResponse> {
  await requireUnlock(store, player);
  await store.expireDueListings(now);
  if (menu === 'market_buy') return buyCategories(player);
  if (menu === 'market_sell') return sellPick(store, player, 0);
  if (menu === 'market_mine') return myListings(store, player, 0, now);
  if (menu === 'market_auc') return auctionHub(player);
  return marketHub(player);
}

export async function marketAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
  eventId?: string,
): Promise<GameResponse> {
  try {
    await requireUnlock(store, player);
    await store.expireDueListings(now);
    const act = String(payload.act ?? 'hub');
    if (act === 'cancel_input') {
      await clearMarketInput(store, player.id);
      return marketHub(player);
    }
    if (act === 'hub') return marketHub(player);
    if (act === 'buy_cats') return buyCategories(player);
    if (act === 'buy_cat') return typeFilter(player, String(payload.cat ?? 'all'));
    if (act === 'browse') {
      return browse(store, player, {
        cat: String(payload.cat ?? 'all'),
        kind: String(payload.kind ?? 'all'),
        sort: String(payload.sort ?? 'price_asc'),
        page: Number(payload.page ?? 0),
      }, now);
    }
    if (act === 'view') return viewListing(store, player, String(payload.id ?? ''), now);
    if (act === 'buy') {
      return doBuy(store, player, String(payload.id ?? ''), eventId, now);
    }
    if (act === 'shop') {
      return sellerShop(store, player, String(payload.sid ?? ''), Number(payload.page ?? 0), now);
    }
    if (act === 'price') return priceHistory(store, player, String(payload.ref ?? ''), now);
    if (act === 'sell') return sellPick(store, player, Number(payload.page ?? 0));
    if (act === 'sell_res') return promptQty(store, player, String(payload.ref ?? ''), 'sell');
    if (act === 'confirm_sell') {
      return confirmSell(
        store,
        player,
        String(payload.ref ?? ''),
        Number(payload.qty ?? 0),
        Number(payload.price ?? 0),
        eventId,
        now,
      );
    }
    if (act === 'mine') return myListings(store, player, Number(payload.page ?? 0), now);
    if (act === 'mine_view') return myListingCard(store, player, String(payload.id ?? ''), now);
    if (act === 'cancel') return doCancel(store, player, String(payload.id ?? ''), now);
    if (act === 'auc') return auctionHub(player);
    if (act === 'auc_new') return sellPick(store, player, Number(payload.page ?? 0), 'auc');
    if (act === 'auc_res') return promptQty(store, player, String(payload.ref ?? ''), 'auc');
    if (act === 'auc_dur') {
      return confirmAuction(
        player,
        String(payload.ref ?? ''),
        Number(payload.qty ?? 0),
        Number(payload.start ?? 0),
        Number(payload.buy ?? 0),
        Number(payload.h ?? 24),
      );
    }
    if (act === 'auc_confirm') {
      return doCreateAuction(
        store,
        player,
        String(payload.ref ?? ''),
        Number(payload.qty ?? 0),
        Number(payload.start ?? 0),
        Number(payload.buy ?? 0),
        Number(payload.h ?? 24),
        eventId,
        now,
      );
    }
    if (act === 'bid_prompt') return promptBid(store, player, String(payload.id ?? ''));
    if (act === 'bid') {
      return doBid(store, player, String(payload.id ?? ''), Number(payload.amount ?? 0), eventId, now);
    }
    if (act === 'buyout') return doBuyout(store, player, String(payload.id ?? ''), eventId, now);
    if (act === 'bids') return bidHistory(store, player, String(payload.id ?? ''));
    if (act === 'hist') return playerBidHistory(store, player, Number(payload.page ?? 0));
    if (act === 'auc_watch') {
      return browse(store, player, { cat: 'all', kind: 'auc', sort: 'ending_soon', page: Number(payload.page ?? 0) }, now);
    }
    throw new ActionRejectedError('Неизвестное действие рынка.');
  } catch (error) {
    if (
      error instanceof ActionRejectedError ||
      error instanceof InsufficientCoinsError ||
      error instanceof InsufficientResourcesError
    ) {
      return respond(player, error.message, [
        { label: '🛒 Рынок', action: 'OPEN_MENU', payload: { menu: 'market' } },
        { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
      ]);
    }
    throw error;
  }
}

export async function handleMarketTextInput(
  store: GameStore,
  player: PlayerRecord,
  text: string,
  now: Date,
): Promise<GameResponse> {
  const flags = await store.getFlags(player.id);
  const mode = flags[AWAITING_MARKET_FLAG] ?? '';
  const raw = text.trim();
  const n = Number.parseInt(raw, 10);
  try {
    if (mode.startsWith('sell_qty:')) {
      const ref = mode.slice('sell_qty:'.length);
      if (!Number.isFinite(n) || n <= 0) {
        return respond(player, 'Напиши целое количество больше нуля.', cancelBtns());
      }
      await store.setFlag(player.id, AWAITING_MARKET_FLAG, `sell_price:${ref}:${n}`);
      return respond(player, `Сколько монет за штуку?\n${lotName(ref)} ×${n}`, cancelBtns());
    }
    if (mode.startsWith('sell_price:')) {
      const [, ref, qtyRaw] = mode.split(':');
      if (!Number.isFinite(n) || n <= 0) {
        return respond(player, 'Напиши цену за штуку — целое число от 1.', cancelBtns());
      }
      await clearMarketInput(store, player.id);
      return sellSummary(player, String(ref), Number(qtyRaw), n);
    }
    if (mode.startsWith('auc_qty:')) {
      const ref = mode.slice('auc_qty:'.length);
      if (!Number.isFinite(n) || n <= 0) {
        return respond(player, 'Напиши целое количество больше нуля.', cancelBtns());
      }
      await store.setFlag(player.id, AWAITING_MARKET_FLAG, `auc_start:${ref}:${n}`);
      return respond(player, `Стартовая цена (монеты)?\n${lotName(ref)} ×${n}`, cancelBtns());
    }
    if (mode.startsWith('auc_start:')) {
      const parts = mode.split(':');
      const ref = parts[1] ?? '';
      const qty = Number(parts[2] ?? 0);
      if (!Number.isFinite(n) || n <= 0) {
        return respond(player, 'Стартовая цена — целое число от 1.', cancelBtns());
      }
      await store.setFlag(player.id, AWAITING_MARKET_FLAG, `auc_buyout:${ref}:${qty}:${n}`);
      return respond(
        player,
        `Выкуп (необязательно). Напиши цену выше ${n} или 0, если без выкупа.`,
        cancelBtns(),
      );
    }
    if (mode.startsWith('auc_buyout:')) {
      const parts = mode.split(':');
      const ref = parts[1] ?? '';
      const qty = Number(parts[2] ?? 0);
      const start = Number(parts[3] ?? 0);
      const buy = !Number.isFinite(n) || n <= 0 ? 0 : n;
      if (buy > 0 && buy <= start) {
        return respond(player, 'Выкуп должен быть выше стартовой цены, либо 0.', cancelBtns());
      }
      await clearMarketInput(store, player.id);
      return durationPick(player, ref, qty, start, buy);
    }
    if (mode.startsWith('bid:')) {
      const id = mode.slice('bid:'.length);
      await clearMarketInput(store, player.id);
      if (!Number.isFinite(n) || n <= 0) {
        return respond(player, 'Ставка — целое число больше нуля.', cancelBtns());
      }
      return doBid(store, player, id, n, undefined, now);
    }
  } catch (error) {
    if (
      error instanceof ActionRejectedError ||
      error instanceof InsufficientCoinsError ||
      error instanceof InsufficientResourcesError
    ) {
      await clearMarketInput(store, player.id);
      return respond(player, error.message, [
        { label: '🛒 Рынок', action: 'OPEN_MENU', payload: { menu: 'market' } },
      ]);
    }
    throw error;
  }
  await clearMarketInput(store, player.id);
  return marketHub(player);
}

async function requireUnlock(store: GameStore, player: PlayerRecord): Promise<void> {
  const flags = await store.getFlags(player.id);
  if (!isMarketUnlocked(flags)) {
    throw new ActionRejectedError('Рынок откроется после первой печати. Сначала закрой Неделю 1.');
  }
}

function marketHub(player: PlayerRecord): GameResponse {
  return respond(
    player,
    ['🛒 Рынок', 'Торговля между путниками Куболесья.', `Монеты: ${player.coins}`].join('\n'),
    [
      { label: '🔎 Купить', action: 'MARKET_ACT', payload: { act: 'buy_cats' } },
      { label: '➕ Продать', action: 'MARKET_ACT', payload: { act: 'sell' } },
      { label: '📦 Мои лоты', action: 'MARKET_ACT', payload: { act: 'mine' } },
      { label: '🔨 Аукцион', action: 'MARKET_ACT', payload: { act: 'auc' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ],
  );
}

function buyCategories(player: PlayerRecord): GameResponse {
  return respond(player, 'Что ищешь?', [
    { label: MARKET_CATEGORY_LABELS.wood, action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: 'wood' } },
    { label: MARKET_CATEGORY_LABELS.stone, action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: 'stone' } },
    { label: MARKET_CATEGORY_LABELS.food, action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: 'food' } },
    { label: MARKET_CATEGORY_LABELS.mats, action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: 'mats' } },
    { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
  ]);
}

function typeFilter(player: PlayerRecord, cat: string): GameResponse {
  const title = MARKET_CATEGORY_LABELS[cat] ?? MARKET_CATEGORY_LABELS.all;
  return respond(player, `${title}\nКак смотреть лоты?`, [
    { label: '💰 Фикс. цена', action: 'MARKET_ACT', payload: { act: 'browse', cat, kind: 'fixed', sort: 'price_asc', page: 0 } },
    { label: '🔨 Аукцион', action: 'MARKET_ACT', payload: { act: 'browse', cat, kind: 'auc', sort: 'ending_soon', page: 0 } },
    { label: '📋 Все', action: 'MARKET_ACT', payload: { act: 'browse', cat, kind: 'all', sort: 'price_asc', page: 0 } },
    { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'buy_cats' } },
  ]);
}

async function browse(
  store: GameStore,
  player: PlayerRecord,
  query: { cat: string; kind: string; sort: string; page: number },
  now: Date,
): Promise<GameResponse> {
  const page = Math.max(0, Math.trunc(query.page) || 0);
  const listingType: MarketListingType | 'ALL' =
    query.kind === 'fixed' ? 'FIXED_PRICE' : query.kind === 'auc' ? 'AUCTION' : 'ALL';
  const sort =
    query.sort === 'price_desc'
      ? 'price_desc'
      : query.sort === 'created_desc'
        ? 'created_desc'
        : query.sort === 'ending_soon'
          ? 'ending_soon'
          : 'price_asc';
  const assetRefs = categoryRefs(query.cat);
  const rows = await store.searchActiveListings(
    {
      listingType,
      assetRefs: assetRefs.length ? assetRefs : undefined,
      sort,
      limit: PAGE + 1,
      offset: page * PAGE,
    },
    now,
  );
  const title = MARKET_CATEGORY_LABELS[query.cat] ?? MARKET_CATEGORY_LABELS.all;
  const kindLabel = listingType === 'AUCTION' ? 'аукцион' : listingType === 'FIXED_PRICE' ? 'фикс' : 'все';
  if (!rows.length) {
    return respond(player, `${title} · ${kindLabel}\nСейчас пусто.`, [
      { label: '↕ Сортировка', action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: query.cat } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'buy_cats' } },
    ]);
  }
  const pageRows = rows.slice(0, PAGE);
  const buttons: GameButton[] = pageRows.map((row) => ({
    label: lotButton(row),
    action: 'MARKET_ACT',
    payload: { act: 'view', id: row.id },
  }));
  if (rows.length > PAGE) {
    buttons.push({
      label: '▶ Ещё',
      action: 'MARKET_ACT',
      payload: { act: 'browse', cat: query.cat, kind: query.kind, sort: query.sort, page: page + 1 },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'buy_cat', cat: query.cat } });
  const lines = [
    `${title} · ${kindLabel} · ${sortLabel(sort)}`,
    ...pageRows.map((row) => lotLine(row, now)),
  ];
  return respond(player, lines.join('\n'), buttons.slice(0, 5));
}

async function viewListing(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  now: Date,
): Promise<GameResponse> {
  await store.expireDueListings(now);
  const listing = await store.getListing(listingId);
  if (!listing || listing.status !== 'ACTIVE') {
    throw new ActionRejectedError('Лот уже закрыт.');
  }
  const seller = await store.findPlayerById(listing.sellerPlayerId);
  const sellerName = seller?.name ?? 'Путник';
  const buttons: GameButton[] = [];
  if (listing.listingType === 'AUCTION') {
    buttons.push({
      label: '💰 Сделать ставку',
      action: 'MARKET_ACT',
      payload: { act: 'bid_prompt', id: listing.id },
    });
    if (listing.buyoutPrice) {
      buttons.push({
        label: '⚡ Купить сразу',
        action: 'MARKET_ACT',
        payload: { act: 'buyout', id: listing.id },
        color: 'positive',
      });
    }
    buttons.push({ label: '📜 Ставки', action: 'MARKET_ACT', payload: { act: 'bids', id: listing.id } });
  } else {
    buttons.push({
      label: '✅ Купить',
      action: 'MARKET_ACT',
      payload: { act: 'buy', id: listing.id },
      color: 'positive',
    });
    buttons.push({ label: '📊 Цена', action: 'MARKET_ACT', payload: { act: 'price', ref: listing.assetRef } });
  }
  buttons.push({
    label: '🏪 Товары продавца',
    action: 'MARKET_ACT',
    payload: { act: 'shop', sid: listing.sellerPlayerId, page: 0 },
  });
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'buy_cats' } });
  return respond(player, cardText(listing, sellerName, now), buttons.slice(0, 5));
}

async function doBuy(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  const result = await buyFixedListing(store, {
    listingId,
    buyerPlayerId: fresh.id,
    requestId: eventId,
    now,
  });
  const updated = (await store.findPlayerById(fresh.id)) ?? fresh;
  return respond(
    updated,
    [
      `Куплено: ${lotName(result.listing.assetRef)} ×${result.listing.quantity}.`,
      `Списано ${result.transaction.grossPrice} монет.`,
      `Монеты: ${updated.coins}`,
    ].join('\n'),
    [
      { label: '🔎 Ещё', action: 'MARKET_ACT', payload: { act: 'buy_cats' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ],
  );
}

async function sellerShop(
  store: GameStore,
  player: PlayerRecord,
  sellerId: string,
  page: number,
  now: Date,
): Promise<GameResponse> {
  const seller = await store.findPlayerById(sellerId);
  const name = seller?.name ?? 'Путник';
  const offset = Math.max(0, Math.trunc(page) || 0) * PAGE;
  const rows = await store.searchActiveListings(
    { sellerPlayerId: sellerId, limit: PAGE + 1, offset, sort: 'created_desc' },
    now,
  );
  if (!rows.length) {
    return respond(player, `🏪 ${name}\nСейчас ничего не продаёт.`, [
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ]);
  }
  const pageRows = rows.slice(0, PAGE);
  const buttons: GameButton[] = pageRows.map((row) => ({
    label: lotButton(row),
    action: 'MARKET_ACT',
    payload: { act: 'view', id: row.id },
  }));
  if (rows.length > PAGE) {
    buttons.push({
      label: '▶ Ещё',
      action: 'MARKET_ACT',
      payload: { act: 'shop', sid: sellerId, page: offset / PAGE + 1 },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } });
  return respond(player, [`🏪 ${name}`, ...pageRows.map((row) => lotLine(row, now))].join('\n'), buttons.slice(0, 5));
}

async function priceHistory(
  store: GameStore,
  player: PlayerRecord,
  assetRef: string,
  now: Date,
): Promise<GameResponse> {
  const day = await store.averageSalePrices(new Date(now.getTime() - 86_400_000), assetRef);
  const week = await store.averageSalePrices(new Date(now.getTime() - 7 * 86_400_000), assetRef);
  const d = day.find((row) => row.assetRef === assetRef);
  const w = week.find((row) => row.assetRef === assetRef);
  const line = (label: string, row: { avg: number; count: number } | undefined) =>
    row && row.count > 0 ? `${label}: ${row.avg} монет/шт (${row.count})` : `${label}: недостаточно данных`;
  return respond(
    player,
    [`📊 ${lotName(assetRef)}`, line('24ч', d), line('7д', w)].join('\n'),
    [{ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'buy_cats' } }],
  );
}

async function sellPick(
  store: GameStore,
  player: PlayerRecord,
  page: number,
  kind: 'sell' | 'auc' = 'sell',
): Promise<GameResponse> {
  const resources = await store.getResources(player.id);
  const owned = TRADEABLE_RESOURCES.filter((ref) => (resources[ref] ?? 0) > 0);
  if (!owned.length) {
    return respond(player, 'Нечего выставлять. Собери разрешённый ресурс.', [
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ]);
  }
  const offset = Math.max(0, Math.trunc(page) || 0) * PAGE;
  const slice = owned.slice(offset, offset + PAGE);
  const act = kind === 'auc' ? 'auc_res' : 'sell_res';
  const buttons: GameButton[] = slice.map((ref) => ({
    label: `${lotName(ref)} ×${resources[ref]}`,
    action: 'MARKET_ACT',
    payload: { act, ref },
  }));
  if (owned.length > offset + PAGE) {
    buttons.push({
      label: '▶ Ещё',
      action: 'MARKET_ACT',
      payload: { act: kind === 'auc' ? 'auc_new' : 'sell', page: offset / PAGE + 1 },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: kind === 'auc' ? 'auc' : 'hub' } });
  return respond(
    player,
    kind === 'auc' ? 'Что выставить на аукцион?' : 'Что продать?',
    buttons.slice(0, 5),
  );
}

async function promptQty(
  store: GameStore,
  player: PlayerRecord,
  ref: string,
  kind: 'sell' | 'auc',
): Promise<GameResponse> {
  const resources = await store.getResources(player.id);
  const have = resources[ref as ResourceType] ?? 0;
  if (have <= 0) throw new ActionRejectedError('Нет этого ресурса.');
  await store.setFlag(player.id, AWAITING_MARKET_FLAG, `${kind}_qty:${ref}`);
  return respond(
    player,
    `Сколько выставить?\n${lotName(ref)}: ${have} у тебя.\nНапиши число сообщением.`,
    cancelBtns(),
  );
}

function sellSummary(player: PlayerRecord, ref: string, qty: number, price: number): GameResponse {
  const total = qty * price;
  const fee = marketFee(total);
  return respond(
    player,
    [
      `📦 ${lotName(ref)} ×${qty}`,
      `💰 ${price} монет за штуку`,
      `Итого: ${total}`,
      `Комиссия при продаже: 5% (${fee})`,
      'Срок: 72 часа',
    ].join('\n'),
    [
      {
        label: '✅ Выставить',
        action: 'MARKET_ACT',
        payload: { act: 'confirm_sell', ref, qty, price },
        color: 'positive',
      },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'sell' } },
    ],
  );
}

async function confirmSell(
  store: GameStore,
  player: PlayerRecord,
  ref: string,
  qty: number,
  price: number,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const listing = await createFixedListing(store, {
    sellerPlayerId: player.id,
    assetRef: ref,
    quantity: qty,
    unitPrice: price,
    requestId: eventId,
    now,
  });
  const fee = listingFeePreview(listing.totalPrice);
  return respond(
    player,
    [
      `Лот выставлен: ${lotName(ref)} ×${qty} за ${listing.unitPrice}/шт.`,
      `Итого ${listing.totalPrice}. Комиссия при продаже ${fee.fee}.`,
      'Ресурс в залоге на 72 часа.',
    ].join('\n'),
    [
      { label: '📦 Мои лоты', action: 'MARKET_ACT', payload: { act: 'mine' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ],
  );
}

async function myListings(
  store: GameStore,
  player: PlayerRecord,
  page: number,
  now: Date,
): Promise<GameResponse> {
  const all = await store.getOwnListings(player.id);
  const rank = (row: MarketListingRecord) => (row.status === 'ACTIVE' ? 0 : 1);
  all.sort((a, b) => rank(a) - rank(b) || b.createdAt.getTime() - a.createdAt.getTime());
  if (!all.length) {
    return respond(player, 'Лотов пока нет.', [
      { label: '➕ Продать', action: 'MARKET_ACT', payload: { act: 'sell' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ]);
  }
  const offset = Math.max(0, Math.trunc(page) || 0) * PAGE;
  const slice = all.slice(offset, offset + PAGE);
  const more = all.length > offset + PAGE;
  const buttons: GameButton[] = slice.map((row) => ({
    label: `${statusMark(row)} ${lotButton(row)}`,
    action: 'MARKET_ACT',
    payload: { act: 'mine_view', id: row.id },
  }));
  if (more) {
    buttons.push({
      label: '▶ Ещё',
      action: 'MARKET_ACT',
      payload: { act: 'mine', page: offset / PAGE + 1 },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } });
  const lines = ['📦 Мои лоты', ...slice.map((row) => `${statusLabel(row)} · ${lotLine(row, now)}`)];
  return respond(player, lines.join('\n'), buttons.slice(0, 5));
}

async function myListingCard(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  now: Date,
): Promise<GameResponse> {
  const listing = await store.getListing(listingId);
  if (!listing || listing.sellerPlayerId !== player.id) throw new ActionRejectedError('Лот не найден.');
  const buttons: GameButton[] = [];
  if (listing.status === 'ACTIVE' && (listing.listingType !== 'AUCTION' || listing.bidCount === 0)) {
    buttons.push({
      label: '↩ Отменить',
      action: 'MARKET_ACT',
      payload: { act: 'cancel', id: listing.id },
      color: 'negative',
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'mine' } });
  const extra: string[] = [];
  if (listing.status === 'SOLD') {
    const txs = await store.listMarketTransactions(listing.id);
    const tx = txs[0];
    if (tx) extra.push(`Продано за ${tx.grossPrice}. Комиссия ${tx.fee}. Тебе ${tx.sellerNet}.`);
    if (listing.buyerPlayerId) {
      const buyer = await store.findPlayerById(listing.buyerPlayerId);
      if (buyer) extra.push(`Покупатель: ${buyer.name}`);
    }
  }
  if (listing.status === 'EXPIRED') extra.push('Срок вышел. Залог возвращён.');
  if (listing.status === 'CANCELLED') extra.push('Отменён. Залог возвращён.');
  if (listing.listingType === 'AUCTION' && listing.status === 'ACTIVE' && listing.bidCount > 0) {
    extra.push('Есть ставки — отменить нельзя.');
  }
  return respond(player, [cardText(listing, player.name, now), ...extra].filter(Boolean).join('\n'), buttons);
}

async function doCancel(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  now: Date,
): Promise<GameResponse> {
  const listing = await cancelListing(store, listingId, player.id, now);
  return respond(
    player,
    `Лот снят. ${lotName(listing.assetRef)} ×${listing.quantity} вернулись.`,
    [
      { label: '📦 Мои лоты', action: 'MARKET_ACT', payload: { act: 'mine' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ],
  );
}

function auctionHub(player: PlayerRecord): GameResponse {
  return respond(player, '🔨 Аукцион\nСтавка держит монеты до конца.', [
    { label: '🔎 Смотреть', action: 'MARKET_ACT', payload: { act: 'auc_watch', page: 0 } },
    { label: '➕ Выставить', action: 'MARKET_ACT', payload: { act: 'auc_new' } },
    { label: '📜 Мои ставки', action: 'MARKET_ACT', payload: { act: 'hist' } },
    { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
  ]);
}

function durationPick(
  player: PlayerRecord,
  ref: string,
  qty: number,
  start: number,
  buy: number,
): GameResponse {
  const buttons: GameButton[] = AUCTION.durationHours.slice(0, 4).map((hours) => ({
    label: `${hours} ч`,
    action: 'MARKET_ACT',
    payload: { act: 'auc_dur', ref, qty, start, buy, h: hours },
  }));
  buttons.push({
    label: '72 ч',
    action: 'MARKET_ACT',
    payload: { act: 'auc_dur', ref, qty, start, buy, h: 72 },
  });
  return respond(
    player,
    [`Срок аукциона?`, `${lotName(ref)} ×${qty}`, `Старт ${start}${buy ? ` · выкуп ${buy}` : ''}`].join('\n'),
    buttons.slice(0, 5),
  );
}

function confirmAuction(
  player: PlayerRecord,
  ref: string,
  qty: number,
  start: number,
  buy: number,
  hours: number,
): GameResponse {
  return respond(
    player,
    [
      `🔨 ${lotName(ref)} ×${qty}`,
      `Старт: ${start}`,
      buy ? `Выкуп: ${buy}` : 'Без выкупа',
      `Срок: ${hours} ч`,
      'Комиссия при продаже: 5%',
    ].join('\n'),
    [
      {
        label: '✅ Выставить',
        action: 'MARKET_ACT',
        payload: { act: 'auc_confirm', ref, qty, start, buy, h: hours },
        color: 'positive',
      },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'auc' } },
    ],
  );
}

async function doCreateAuction(
  store: GameStore,
  player: PlayerRecord,
  ref: string,
  qty: number,
  start: number,
  buy: number,
  hours: number,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const listing = await createAuctionListing(store, {
    sellerPlayerId: player.id,
    assetRef: ref,
    quantity: qty,
    startingPrice: start,
    buyoutPrice: buy > 0 ? buy : null,
    durationHours: hours,
    requestId: eventId,
    now,
  });
  return respond(
    player,
    `Аукцион выставлен: ${lotName(ref)} ×${qty}. Старт ${listing.startingPrice}. Срок ${hours} ч.`,
    [
      { label: '📦 Мои лоты', action: 'MARKET_ACT', payload: { act: 'mine' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'auc' } },
    ],
  );
}

async function promptBid(store: GameStore, player: PlayerRecord, listingId: string): Promise<GameResponse> {
  const listing = await store.getListing(listingId);
  if (!listing || listing.listingType !== 'AUCTION' || listing.status !== 'ACTIVE') {
    throw new ActionRejectedError('Аукцион уже закрыт.');
  }
  const min = nextBidMinimum(listing);
  await store.setFlag(player.id, AWAITING_MARKET_FLAG, `bid:${listing.id}`);
  return respond(
    player,
    [
      `${lotName(listing.assetRef)} ×${listing.quantity}`,
      `Текущая ставка: ${listing.currentBid ?? 'нет'}`,
      `Следующая минимум: ${min}`,
      'Напиши сумму сообщением.',
    ].join('\n'),
    cancelBtns(),
  );
}

async function doBid(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  amount: number,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const result = await placeBid(store, {
    listingId,
    bidderPlayerId: player.id,
    amount,
    requestId: eventId,
    now,
  });
  const updated = (await store.findPlayerById(player.id)) ?? player;
  return respond(
    updated,
    `Ставка ${result.bid.amount} принята. Монеты удерживаются. Осталось ${updated.coins}.`,
    [
      { label: '🔨 Лот', action: 'MARKET_ACT', payload: { act: 'view', id: listingId } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'auc' } },
    ],
  );
}

async function doBuyout(
  store: GameStore,
  player: PlayerRecord,
  listingId: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const result = await buyoutAuction(store, {
    listingId,
    buyerPlayerId: player.id,
    requestId: eventId,
    now,
  });
  const updated = (await store.findPlayerById(player.id)) ?? player;
  return respond(
    updated,
    [
      `Выкуп: ${lotName(result.listing.assetRef)} ×${result.listing.quantity}.`,
      `Списано ${result.transaction.grossPrice}. Монеты: ${updated.coins}.`,
    ].join('\n'),
    [
      { label: '🔨 Аукцион', action: 'MARKET_ACT', payload: { act: 'auc' } },
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
    ],
  );
}

async function bidHistory(store: GameStore, player: PlayerRecord, listingId: string): Promise<GameResponse> {
  const listing = await store.getListing(listingId);
  if (!listing) throw new ActionRejectedError('Лот не найден.');
  const bids = (await store.listAuctionBids(listingId)).slice(0, 10);
  const names = new Map<string, string>();
  const lines = await Promise.all(
    bids.map(async (bid) => {
      if (!names.has(bid.bidderPlayerId)) {
        const bidder = await store.findPlayerById(bid.bidderPlayerId);
        names.set(bid.bidderPlayerId, bidder?.name ?? 'Путник');
      }
      return `${names.get(bid.bidderPlayerId)} · ${bid.amount} · ${bidStatus(bid.status, listing, bid.bidderPlayerId)}`;
    }),
  );
  return respond(
    player,
    [`📜 Ставки · ${lotName(listing.assetRef)} ×${listing.quantity}`, ...(lines.length ? lines : ['Ставок нет.'])].join(
      '\n',
    ),
    [{ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'view', id: listingId } }],
  );
}

async function playerBidHistory(store: GameStore, player: PlayerRecord, page: number): Promise<GameResponse> {
  const bids = await store.listPlayerBids(player.id, 10);
  if (!bids.length) {
    return respond(player, 'Ставок пока нет.', [
      { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'auc' } },
    ]);
  }
  const offset = Math.max(0, Math.trunc(page) || 0) * PAGE;
  const slice = bids.slice(offset, offset + PAGE);
  const lines: string[] = [];
  for (const bid of slice) {
    const listing = await store.getListing(bid.listingId);
    const label = listing ? `${lotName(listing.assetRef)} ×${listing.quantity}` : 'лот';
    lines.push(`${label} · ${bid.amount} · ${ownBidStatus(bid.status, listing, player.id)}`);
  }
  const buttons: GameButton[] = [];
  if (bids.length > offset + PAGE) {
    buttons.push({ label: '▶ Ещё', action: 'MARKET_ACT', payload: { act: 'hist', page: offset / PAGE + 1 } });
  }
  buttons.push({ label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'auc' } });
  return respond(player, ['📜 Мои ставки', ...lines].join('\n'), buttons);
}

function cardText(listing: MarketListingRecord, sellerName: string, now: Date): string {
  const remain = formatRemain(listing.expiresAt.getTime() - now.getTime());
  if (listing.listingType === 'AUCTION') {
    const min = nextBidMinimum(listing);
    return [
      `🔨 ${lotName(listing.assetRef)} ×${listing.quantity}`,
      `Текущая ставка: ${listing.currentBid ?? 'нет'}`,
      `Следующая минимум: ${min}`,
      listing.buyoutPrice ? `Buyout: ${listing.buyoutPrice}` : 'Без выкупа',
      `Ставок: ${listing.bidCount}`,
      `Осталось: ${remain}`,
      `Продавец: ${sellerName}`,
    ].join('\n');
  }
  return [
    `${lotName(listing.assetRef)} ×${listing.quantity}`,
    `${listing.unitPrice} монет за штуку`,
    `Итого: ${listing.totalPrice}`,
    `Продавец: ${sellerName}`,
    `Осталось: ${remain}`,
  ].join('\n');
}

function lotLine(row: MarketListingRecord, now: Date): string {
  const remain = formatRemain(row.expiresAt.getTime() - now.getTime());
  if (row.listingType === 'AUCTION') {
    return `🔨 ${lotName(row.assetRef)} ×${row.quantity} · ${row.currentBid ?? row.startingPrice} · ${remain}`;
  }
  return `${lotName(row.assetRef)} ×${row.quantity} · ${row.unitPrice}🪙/шт · ${remain}`;
}

function lotButton(row: MarketListingRecord): string {
  if (row.listingType === 'AUCTION') {
    return `🔨 ${shortName(row.assetRef)} ×${row.quantity} · ${row.currentBid ?? row.startingPrice}`;
  }
  return `${shortName(row.assetRef)} ×${row.quantity} · ${row.unitPrice}`;
}

function lotName(ref: string): string {
  return resourceLabel(ref as ResourceType) ?? ref;
}

function shortName(ref: string): string {
  return lotName(ref).replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 14);
}

function categoryRefs(cat: string): TradeableResource[] {
  if (cat === 'all' || !MARKET_CATEGORIES[cat]) return [];
  return [...MARKET_CATEGORIES[cat]];
}

function sortLabel(sort: string): string {
  if (sort === 'price_desc') return 'дороже';
  if (sort === 'created_desc') return 'новые';
  if (sort === 'ending_soon') return 'скоро конец';
  return 'дешевле';
}

function statusMark(row: MarketListingRecord): string {
  if (row.status === 'ACTIVE') return '●';
  if (row.status === 'SOLD') return '✓';
  if (row.status === 'CANCELLED') return '✕';
  return '◌';
}

function statusLabel(row: MarketListingRecord): string {
  if (row.status === 'ACTIVE') return 'активен';
  if (row.status === 'SOLD') return 'продан';
  if (row.status === 'CANCELLED') return 'отменён';
  return 'истёк';
}

function bidStatus(
  status: string,
  listing: MarketListingRecord,
  bidderId: string,
): string {
  if (listing.status === 'SOLD' && listing.buyerPlayerId === bidderId) return 'выигран';
  if (listing.status === 'SOLD') return 'buyout/проигран';
  if (status === 'HOLD' && listing.currentBidderPlayerId === bidderId) return 'лидирует';
  if (status === 'REFUNDED' || status === 'SUPERSEDED') return 'перебит';
  if (status === 'SETTLED') return 'выигран';
  return status.toLowerCase();
}

function ownBidStatus(
  status: string,
  listing: MarketListingRecord | null,
  playerId: string,
): string {
  if (!listing) return status === 'HOLD' ? 'активна' : status.toLowerCase();
  if (listing.status === 'SOLD' && listing.buyerPlayerId === playerId) return 'выигран';
  if (listing.status === 'SOLD') return listing.buyoutPrice === listing.totalPrice ? 'buyout' : 'проигран';
  if (listing.status === 'EXPIRED') return 'завершён';
  if (status === 'HOLD' && listing.currentBidderPlayerId === playerId) return 'лидирует';
  if (status === 'REFUNDED' || status === 'SUPERSEDED') return 'перебит';
  return status.toLowerCase();
}

function formatRemain(ms: number): string {
  if (ms <= 0) return 'истёк';
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}д ${hours}ч`;
  if (hours) return `${hours}ч ${mins}м`;
  return `${mins}м`;
}

function cancelBtns(): GameButton[] {
  return [
    { label: '❌ Отмена', action: 'MARKET_ACT', payload: { act: 'cancel_input' } },
    { label: BACK_LABEL, action: 'MARKET_ACT', payload: { act: 'hub' } },
  ];
}

function respond(player: PlayerRecord, text: string, buttons: GameButton[]): GameResponse {
  void player;
  return { text, buttons };
}

async function clearMarketInput(store: GameStore, playerId: string): Promise<void> {
  await store.setFlag(playerId, AWAITING_MARKET_FLAG, '0');
}
