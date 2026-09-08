# Production / Auto Farms 1.0

Ленивые дворы без cron. Версия прототипа **0.0.8**. Unlock: `week_1_complete`.

## Постройки

| Тип | Выход | Профессия |
|---|---|---|
| WHEAT_FARM | WHEAT + SEED | FARMER |
| SAWMILL | LOG | LOGGER |
| QUARRY | COBBLESTONE | MINER |
| MINE | COAL, с L4 IRON_ORE | MINER |
| FISHERY | RAW_FISH | FISHER |
| PEN | FOOD + HIDE | HUNTER |

Новых ресурсов нет. Сбор пишет в `player_resources`. Tradeable ресурсы идут на существующий Market. Clan donate — как обычно, без двойного счёта job.

Crafter **без** скидки на стоимость построек в 1.0 (усложняет атомарный spend).

## Уровни и скорость

L0 = нет ряда. L1–10. Множитель: 1.0, 1.25, 1.5, 1.75, 2.0, 2.4, 2.8, 3.3, 3.9, **4.6**. Не 20×.

Job-бонус: +5% за каждые 5 уровней профессии, max +20% на L20.

L1 скорость и cap (fill 8–12ч):

| Двор | primary/ч | secondary/ч | cap primary | cap secondary | fill |
|---|---|---|---|---|---|
| Wheat | 1.5 WHEAT | 0.15 SEED | 16 | 3 | ~10.7ч |
| Sawmill | 2 LOG | — | 20 | — | 10ч |
| Quarry | 1.5 COBBLESTONE | — | 16 | — | ~10.7ч |
| Mine | 1.2 COAL | 0.08 IRON с L4 | 14 | 2 | ~11.7ч |
| Fishery | 1 RAW_FISH | — | 12 | — | 12ч |
| Pen | 1 FOOD | 0.5 HIDE | 10 | 5 | 10ч |

Cap и rate масштабируются множителем уровня (L10 = 4.6×). Хранилище заполняется ~8–12 часов. Дальше idle. Offline elapsed hard-cap 36ч; cap всё равно режет выдачу.

## Lazy tick

Никакого cron. Tick на открытии / сборе / upgrade:

`elapsed = clamp(now - last_calculated_at, 0, 36h)`  
`gain = hours * rate`  
milli-accumulator (1/1000)  
`stored = min(cap, whole)`

Отрицательный elapsed → 0.

## Сбор и апгрейд

`📦 Собрать` — атомарно: tick, credit resources, stored=0. Пустое хранилище не пишет COLLECT. `requestId` идемпотентен. Concurrent collect: один побеждает (`withMut` / `SELECT … FOR UPDATE` игрока).

Upgrade: tick, spend, level+1, запас не сгорает, новый cap. Max 10.

## Стоимость L1

| Двор | Ресурсы | Монеты |
|---|---|---|
| Wheat Farm | LOG 20, PLANK 20, COBBLESTONE 10 | 80 |
| Sawmill | LOG 30, COBBLESTONE 20, IRON_INGOT 2 | 120 |
| Quarry | LOG 20, COBBLESTONE 40, IRON_INGOT 3 | 140 |
| Mine | LOG 30, COBBLESTONE 50, IRON_INGOT 5 | 200 |
| Fishery | LOG 25, PLANK 20, IRON_INGOT 2 | 120 |
| Pen | LOG 30, PLANK 30, COBBLESTONE 15 | 120 |

Upgrade: ресурсы × `1.35^fromLevel`, монеты × `1.3^fromLevel`. С шага 5+ добавляется `MIST_RESIN` (`step-4`).

Цифры чуть ниже черновика GDD (100–250), чтобы L1 был достижим после week 1, не ломая Vel.

## Оценка суточной выдачи

Idle (один сбор после заполнения cap, ~8–12ч):

| Двор | primary | secondary |
|---|---|---|
| Wheat | 16 WHEAT | 3 SEED |
| Sawmill | 20 LOG | — |
| Quarry | 16 COBBLESTONE | — |
| Mine L1 | 14 COAL | 0 IRON |
| Fishery | 12 RAW_FISH | — |
| Pen | 10 FOOD | 5 HIDE |

Максимум при частом сборе (rate × 24ч, cap не режет):

| Двор | L1 | L10 + profession 20 |
|---|---|---|
| Wheat | 36 WHEAT + 3.6 SEED | 198.7 WHEAT + 19.9 SEED |
| Sawmill | 48 LOG | 265 LOG |
| Quarry | 36 COBBLESTONE | 198.7 COBBLESTONE |
| Mine | 28.8 COAL, 0 IRON | 159 COAL + 10.6 IRON_ORE |
| Fishery | 24 RAW_FISH | 132.5 RAW_FISH |
| Pen | 24 FOOD + 12 HIDE | 132.5 FOOD + 66.2 HIDE |

Железо шахты — боковой поток (≤10.6/сут на L10+job20), не основной источник руды. Regular-play ориентир ближе к idle/двум сборам, не к теоретическому max.

## Analytics / rate limit

`GET /v1/admin/analytics/production`. `PROD_WRITE` (build/collect/upgrade): 20/мин, burst 6/8с.

## Не в 1.0

Workers/NPC, premium boosts, cron, разрушение, рейды, clan farms, buy orders, real-time таймеры.
