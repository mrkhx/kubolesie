# Player Market Foundation

Foundation будущих магазинов игроков и Auction 1.0. **Не** открытый рынок в UI.

Версия прототипа остаётся **0.0.6**. Vel остаётся отдельной NPC-экономикой.

## Что открыто / что нет

| Есть | Нет |
| --- | --- |
| domain API: create / cancel / buy / expire / search | кнопка 🛒 Рынок |
| escrow лота | AUCTION behaviour |
| 5% fee + ledger | передача instance-предметов |
| admin analytics `/v1/admin/analytics/market` | group-chat витрина |

`listing_type` уже содержит `AUCTION`, но `createAuctionListing()` отвергает запрос.

## Tradeability — default deny

Торговать можно только **явно разрешёнными stackable-ресурсами**.

Разрешено:

`LOG`, `PLANK`, `STICK`, `COBBLESTONE`, `COAL`, `IRON_ORE`, `IRON_INGOT`, `HIDE`, `REED`, `CLAY`, `RAW_FISH`, `COOKED_FISH`, `MIST_RESIN`, `WOOD`, `STONE`, `FIBER`, `HERBS`, `RAW_MEAT`, `SHREW_FUR`, `CHITIN_PLATE`, `FOOD`, `SEED`, `WHEAT`, `STRING`.

Запрещено по умолчанию:

- quest/story items (`rusty_token`, `broken_lantern`, `stumpfang_tooth`, `wedge_map_fragment`, `lit_lantern`, `wenzel_plate`, `seal_shard_7`, `seal_shard_6`)
- seal shards / progression keys (`SEAL_SHARD_6`, item `seal_shard_7`)
- уникальные boss/story ресурсы (`BOG_CORE`, `SHINY_STONE`)
- equipment / crafted instance items (текущая inventory model — уникальные строки, экипировка, item_history; безопасный transfer в foundation не открыт)
- bound cosmetics, premium currency, entitlements
- всё, что ломает Week1/Week2 gate

Identity продавца/покупателя — только server-side `player.id`. `peer_id` / клиентский seller id не принимаются.

## Escrow

При создании лота ресурс **атомарно** списывается у продавца и живёт в лоте.

- продавец не может скрафтить / потратить / выставить тот же стек второй раз
- cancel → escrow возвращается **ровно один раз** (`ACTIVE → CANCELLED`)
- sale → escrow переходит покупателю **ровно один раз** (`ACTIVE → SOLD`)
- expire → escrow возвращается продавцу **ровно один раз** (`ACTIVE → EXPIRED`)

Cron нет. Expiry — lazy: при buy/cancel/search/analytics и через `expireListing()`.

## Money flow

Покупатель платит `gross = unit_price * quantity`.

Комиссия: **5%**, канон integer math:

```
fee = floor(gross * 5 / 100)
sellerNet = gross - fee
```

Примеры: 1–19 → fee 0; 20 → 1; 100 → 5.

Fee — economy sink. Монеты никому не зачисляются. Пишутся две строки `currency_transactions` (`market_buy` / `market_sell`) и одна `market_transactions`.

## Limits

| Константа | Значение | Зачем |
| --- | --- | --- |
| `MAX_ACTIVE_LISTINGS_PER_PLAYER` | 5 | узкий escrow, без склада |
| `MAX_LISTING_QUANTITY` | 999 | `price * qty` влезает в int32 |
| `MIN_PRICE` | 1 | нет бесплатных лотов |
| `MAX_PRICE` | 1_000_000 | потолок ниже overflow |
| `LISTING_TTL` | 72 часа | чат-RPG, не недельный lock |

Лимиты не связаны с premium.

## Concurrency

PostgreSQL: `SELECT … FOR UPDATE` + compare-and-set `ACTIVE → SOLD|CANCELLED|EXPIRED`.

Два покупателя → ровно один success, второй rollback (монеты/ресурс не двойные).

Cancel vs buy → ровно одно терминальное состояние.

Memory store сериализует мутации тем же инвариантом.

`request_id` (опционально) делает create/buy идемпотентными.

## Search

Только `ACTIVE` и не истёкшие. Фильтры: asset, min/max price, sort by price/created, pagination ≤ 50.

Индексы: `(status, asset_ref, unit_price)`, `(seller, status)`, `(expires_at)`, `(status, expires_at)`.

## Analytics

`GET /v1/admin/analytics/market` — тот же `ADMIN_ANALYTICS_TOKEN`. Агрегаты, без VK ID.

## Vel

NPC Vel не заменён. Player market его не вызывает.

Замечание по существующему Vel (не меняли): `LOG→4 PLANK` продаются Велу дороже, чем сырое бревно; обратной покупки тех же SKU у Вела нет, бесконечного buy/sell-цикла нет. `PLANK ×8` у Вела стоят 12 (1.5/шт), скупка доски — 1. Это не бесконечный арбитраж.
