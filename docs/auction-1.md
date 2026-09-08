# Auction 1.0

Аукцион живёт в тех же `market_listings` (`listing_type = AUCTION`). `expires_at` — конец торгов. История ставок — `auction_bids`.

## Создание

Ресурс из allowlist → количество → стартовая цена → buyout (0 = нет, иначе строго больше старта) → срок 6 / 12 / 24 / 48 / 72 часа.

Escrow ресурса сразу. Активный аукцион считается в общий лимит 5 лотов.

## Минимальная ставка

```
если current_bid отсутствует: min = starting_price
иначе min = current_bid + max(1, ceil(current_bid * 0.05))
```

Ставка ≥ buyout отклоняется: нужен явный **⚡ Купить сразу**.

## Bid escrow

Ставка атомарно держит монеты (`auction_bid_hold`). Если тот же игрок повышает — удерживается только разница. Предыдущему лидеру монеты возвращаются один раз (`auction_bid_release`). Ledger обязателен.

Запрещено: self-bid, ниже минимума, после конца, на inactive, без монет, overflow, duplicate event (requestId).

Cancel продавцом: только если `bid_count = 0`. Иначе отказ.

## Buyout

ACTIVE → SOLD. Покупатель платит buyout. Если он уже лидер — списывается разница. Иначе предыдущий hold возвращается. Seller получает net после 5%. Ресурс переходит покупателю. Одна `market_transaction` на лот.

## Settlement (lazy, без cron)

При открытии рынка / search / my listings / analytics / `settleExpiredAuctions`.

- Есть high bidder → SOLD, asset победителю, seller net, fee sink, hold → settle.
- Ставок нет → EXPIRED, asset продавцу.

Повторный settle идемпотентен.

## Anti-snipe

Ставка в последние 2 минуты продлевает `expires_at` на 2 минуты. Максимум 5 продлений.

## История

До 10 своих ставок: выигран / проигран / лидирует / перебит / buyout / завершён. Без VK ID.

## Уведомления

outbid, sold, won, ended — pending notices, показ при следующей команде.

## Что не входит

Buy orders, equipment trading, clan auction, websocket, background cron.
