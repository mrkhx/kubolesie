# Куболесье | Чат-RPG

**Куболесье** — большая чат-RPG для сообщества ВКонтакте.

Это **не** VK Mini App, **не** браузерная игра и **не** обычный сайт.

Игрок взаимодействует через сообщения сообщества: текст, кнопки, callback actions и, при необходимости, карточки.

Текущая версия: **Prototype 0.0.13** — Mining & Crafting 2.0 поверх Week 6, Jobs, дворов, рынка, кланов, PvP и Недели 1–6.

## Архитектура

VK является только интерфейсом. Вся игровая логика живёт независимо от VK.

```
VK Messages
    ↓
VK Adapter          apps/vk-bot  (Callback API POST /vk/callback + mock)
    ↓
Command Router      packages/game-core
    ↓
Game Core           packages/game-core + combat-engine + content
    ↓
PostgreSQL          packages/database (Prisma)
```

Дополнительно:

- Redis — distributed rate limits и короткие locks. **Не** хранилище прогресса. Production без `REDIS_URL` при включённом лимитере не стартует.
- BullMQ worker — фоновые задачи. Энергия регенерируется **лениво**, без cron по всем игрокам.
- `processed_events` — идемпотентность внешних событий.
- `reward_claims` — одноразовые награды (ящик, жетон, сундук, квест, ночь, survivor pack).
- `player_discoveries` — кодекс встреч (`unknown_node7_creature` = `???`).

Идентификатор игрока внутри ядра — `player.id`. `vk_user_id` уникален в таблице `players`, но core не принимает сырой VK JSON и не строит сюжет вокруг VK API.

Сюжет **data-driven**: узлы диалогов в `packages/content/src/dialogues-*.ts`. Ядро не содержит гигантский `switch` по сюжету. Условия кнопок перепроверяются на каждый callback — старый payload отклоняется.

## Структура

```
apps/
  api/          NestJS HTTP: health, mock VK event, inspect player
  vk-bot/       VK Callback API + mock adapter → NormalizedIncomingEvent
  worker/       BullMQ skeleton (без energy cron)
packages/
  game-core/    команды, энергия, инвентарь, диалоги, флаги, квесты, День 1
  combat-engine детерминированный бой (snapshot + seed) + formatCombatLog
  database/     Prisma schema, init + day_one migrations, PrismaGameStore
  content/      предметы, рецепты, враги, локации, квесты, правила, диалоги
  shared/       команды, GameResponse, enums
```

Монорепозиторий на **npm workspaces**.

## День 1 — поток

```
START_GAME (HUD: HP / Energy / Coins / инвентарь)
  → опушка: ящик / дым / кусты
  → ящик один раз: LOG ×2, сухарь, каменный нож (без камня и без готовой кирки)
  → дикая землеройка (бой необязателен)
  → рубка брёвен, жетон один раз, осмотр → «Узел 7» / «Не буди шахту»
  → дым без жетона = пустой стан; с активированным жетоном = Рем и затвор
  → закрыть затвор → существо ???
  → квест iron_for_gate (8 IRON_ORE)
  → крафт: LOG → PLANK → STICK → CRAFTING_TABLE → WOODEN_PICKAXE
  → осыпь: булыжник только деревянной/каменной киркой, падальщик
  → каменная кирка: 3 COBBLESTONE + 2 STICK на верстаке
  → штольня (каменная кирка + квест): железо, рельсы, слух, ползун
  → 8 руды → голубой свет → секретный сундук (miner_belt) / синяя жила
  → сдать железо Рему (+40 XP, +25 монет, trust)
  → уровень 2 (порог 40 XP)
  → ночь у Рема или в своём укрытии
  → DAY_1_COMPLETE + Survivor Pack (50 монет, еда ×2)
  → «Начать День 2» → «Продолжение скоро будет доступно.»
```

Старый shortcut `WOOD + STONE → STONE_PICKAXE` **удалён**. Новые игроки проходят только новую цепочку. `WOOD`/`STONE` остаются в enum, чтобы старые сохранения не ломались; их можно переложить в `LOG`/`COBBLESTONE`, но кирку из них скрафтить нельзя.

Level 2: `max_hp +5`, `max_energy +1`, HP заполняется до нового максимума. Trust Рема числом не показывается.

## Local setup

Нужны Node.js 20+ и Docker (для Postgres + Redis). Без Docker ядро поднимается на in-memory store (`GAME_STORE=memory`) **только в development**. Production без `DATABASE_URL` не стартует.

```bash
cp .env.example .env
npm install
npm run docker:up          # опционально
npm run prisma:migrate     # если есть Postgres
npm run prisma:seed
npm run start:api
```

API слушает `PORT` из `.env` (локально часто 3000; в sandbox preview — 8080).

`GET /` отдаёт **mock VK-консоль** — это не игровой клиент и не Mini App, а стенд для mock-событий.

Для локальной разработки `VK_GROUP_TOKEN` **не нужен**.

Боевой вход сообщества: `POST /vk/callback` (VK Callback API). Настройка — [docs/vk-callback-setup.md](docs/vk-callback-setup.md), деплой — [docs/deployment.md](docs/deployment.md).

### Личка и беседа

В **личных сообщениях** сообщества идёт весь персональный gameplay (`Старт` / `Начать`, инвентарь, бой, сюжет).

В **групповой беседе** бот — только вход. Примеры:

- `Куболесье, начать` — короткое «отправляется в Куболесье» + кнопка «✉ Продолжить в личке»; игра продолжается в личке
- `Куболесье, профиль` — профиль уходит в личку
- `Помощь`
- `@kubolesie начать`

Обычные реплики в чате («кто сегодня играет?») игнорируются. Старые игровые кнопки в истории беседы больше не пишут сюжет в общий чат — ответ идёт в DM. Прогресс считается по `from_id`.

Чтобы сообщество появилось в чате, в VK UI нужно разрешить добавлять сообщество в беседы и добавить его в разговор. Чтобы бот писал в личку, пользователь открывает диалог с сообществом. Backend это не включает. Подробности — [docs/vk-callback-setup.md](docs/vk-callback-setup.md).

### Mock playthrough

1. Открой mock-консоль (`GET /`).
2. Нажми `START_GAME` (или напиши `/start`).
3. Жми кнопки ответа: ящик → рубить брёвна → доски → палки → верстак → деревянная кирка → осыпь / булыжник → каменная кирка → штольня → железо → сдать Рему → ночь.
4. Текст и кнопки — это `GameResponse`. Текущее состояние видно в панели справа (`GET /v1/players/:vkUserId`).
5. Отладка (флаги, квесты, discoveries, trust) **не** входит в обычный `GameResponse`.

```bash
curl -s localhost:3000/v1/mock/event \
  -H 'content-type: application/json' \
  -d '{"event_id":"e1","vk_user_id":"1001","action":"START_GAME"}'
```

Ожидаемый ответ: HUD, стартовый текст и три кнопки — «Осмотреть разбитый ящик», «Пойти к дыму», «Проверить кусты».

Повтор того же `event_id` ничего не делает второй раз.

## Docker Compose

`docker-compose.yml`:

- `postgres:16-alpine` — healthcheck `pg_isready`
- `redis:7-alpine` — healthcheck `redis-cli ping`

```bash
docker compose up -d
docker compose ps
```

## Migration

Prisma schema: `packages/database/prisma/schema.prisma`

- `packages/database/prisma/migrations/20260906120000_init` — фундамент 0.0.1 (не переписывать)
- `packages/database/prisma/migrations/20260906180000_day_one` — enum-ресурсы Дня 1 + `player_discoveries`
- `packages/database/prisma/migrations/20260906190000_crafting_pipeline` — `LOG`, `PLANK`, `STICK`, `COBBLESTONE`

```bash
npm run prisma:generate
npm run prisma:migrate          # deploy committed migrations
npm run prisma:migrate:dev      # local development
```

PostgreSQL — source of truth. Redis не хранит прогресс игрока.

## Seed

```bash
npm run prisma:seed
```

Сидит квест `iron_for_gate`. Предметы, враги, локации и диалоги живут в `packages/content`.

## Tests

```bash
npm test                 # unit tests (без PostgreSQL и без Redis)
npm run typecheck
npm run db:migrate:deploy   # production: prisma migrate deploy
npm run test:db:migrations  # TEST-ONLY, disposable Postgres
npm run test:redis          # TEST-ONLY, localhost Redis
```

Деплой: [docs/deployment.md](docs/deployment.md). PostgreSQL: [docs/production-database.md](docs/production-database.md). Anti-abuse: [docs/rate-limiting.md](docs/rate-limiting.md). PvP: [docs/pvp-1.md](docs/pvp-1.md). Analytics: [docs/admin-analytics.md](docs/admin-analytics.md).

Сохранены тесты 0.0.1/0.0.2 и добавлены проверки цепочки: ящик без камня, отказ WOOD+STONE→кирка, булыжник только с деревянной киркой, деревянная кирка не берёт железо, полный путь до каменной кирки.

## Env

См. `.env.example`. Реальные секреты в git не класть.

| Variable | Назначение |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | locks / rate limit / queues |
| `PORT` | HTTP API |
| `NODE_ENV` | `development` / `production` |
| `HOST` | bind address, default `0.0.0.0` |
| `VK_GROUP_TOKEN` | токен сообщества; пусто = mock |
| `VK_GROUP_ID` | id сообщества для callback |
| `VK_CALLBACK_SECRET` | секрет Callback API |
| `VK_CONFIRMATION_CODE` | строка confirmation |
| `VK_API_VERSION` | версия VK API, по умолчанию 5.199 |
| `VK_API_TIMEOUT_MS` | timeout `messages.send`, по умолчанию 4000 |
| `APP_COMMIT_SHA` | опционально в `/health`; если пусто — `RENDER_GIT_COMMIT` |
| `GAME_STORE` | `prisma` или `memory` (memory запрещён в production) |
| `MEMORY_STORE_PATH` | JSON-снимок только для dev fallback |
| `ENABLE_MOCK_API` | mock HTTP; в production всегда выключен |
| `ADMIN_ANALYTICS_TOKEN` | Bearer для `/v1/admin/analytics/*`; пусто = 404 |

## Game commands

`START_GAME` `EXPLORE` `OPEN_INVENTORY` `OPEN_CAMP` `GATHER_WOOD` `GATHER_STONE` `GATHER_IRON` `MINE_ACT` `CRAFT_ITEM` `EQUIP_ITEM` `USE_ITEM` `TALK_NPC` `START_PVE` `START_PVP` `PVP_ACT` `CLAIM_REWARD` `OPEN_CRATE` `DIALOGUE_CHOICE` `INSPECT_TOKEN` `BUILD_TEMP_SHELTER` `FEED_SCAVENGER` `RETURN_IRON` `OPEN_SECRET_CHEST` `MINE_BLUE_MINERAL` `REST_NIGHT` `BEGIN_DAY_2`

`GameResponse` ядра:

```ts
{ text, buttons: [{ label, action, payload }], attachments?, state? }
```

Ядро **не** собирает сырой VK keyboard JSON. Это делает VK Adapter.

## Prototype 0.0.13 содержит

- Mining & Crafting 2.0: повторяемая добыча, новые руды, бронза, жильный кристалл
- additive migration `20260911120000_mining_crafting_2`
- docs: `docs/gdd/mining-crafting-2.md`

## Prototype 0.0.12 содержит

- Week 6 «Заброшенный стан»: дни 36–42, шестая печать, Затворник
- мини-босс Скрежетник, прямой контакт с неизвестным, optional Jobs/Production/Market/Clan/PvP слой
- `SEAL_SHARD_2`, оберег затвора, «Осталось: 1»
- additive migration `20260909180000_week_six`
- docs: `docs/gdd/week-6.md`

## Prototype 0.0.11 содержит

- Week 5 «Чёрная топь»: дни 29–35, пятая печать, Бездонник
- мини-босс Топежор, optional Jobs/Production/Market/Clan/PvP слой
- `SEAL_SHARD_3`, оберег топи, «Осталось: 2»
- additive migration `20260909140000_week_five`
- docs: `docs/gdd/week-5.md`

## Prototype 0.0.10 содержит

- Week 4 «Гнилая тропа»: дни 22–28, четвёртая печать, Тленник
- мини-босс Чернокорень, optional Jobs/Production/Market/Clan/PvP слой
- `SEAL_SHARD_4`, оберег тропы, «Осталось: 3»
- additive migration `20260909120000_week_four`
- docs: `docs/gdd/week-4.md`

## Prototype 0.0.9 содержит

- Week 3 «Корневая чаща»: дни 15–21, третья печать, Вязень
- мини-босс Корнеплёт, optional Jobs/Production/Market/Clan/PvP слой
- `SEAL_SHARD_5`, корневой оберег, «Осталось: 4»
- additive migration `20260908210000_week_three`
- docs: `docs/gdd/week-3.md`

## Prototype 0.0.8 содержит

- Jobs 1.0: 6 профессий, 3 контракта/день, прогресс от реальных действий, daily coin 5/10
- Auto Farms 1.0: 6 дворов, lazy tick без cron, storage cap ~8–12ч, upgrade 1–10
- хаб ⚒ Хозяйство (статистика / стан), `JOB_ACT` / `PROD_ACT`, DM-only
- additive migration `20260908200000_jobs_production_1`
- admin analytics `/v1/admin/analytics/jobs` и `/production`
- docs: `docs/jobs-1.md`, `docs/production-1.md`

## Prototype 0.0.7 содержит

- Player Market 1.0: unlock `week_1_complete`, DM-хаб, фикс-цена, витрина продавца
- Auction 1.0: ставки с hold монет, buyout, anti-snipe 2 мин ×5, lazy settle
- fee 5%, allowlist ресурсов, без buy orders и без торговли экипировкой
- additive migration `20260908180000_market_auction_1`
- admin analytics `/v1/admin/analytics/market` расширен
- docs: `docs/player-market-1.md`, `docs/auction-1.md`

## Prototype 0.0.6 содержит

- Clans 1.0: создание/заявки/роли/вклад/уровни/задания/рейтинг
- unlock: `week_1_complete`; стоимость создания 200 монет
- member cap 10→30, без боевых бонусов
- additive migration `20260907210000_clans_1`
- admin analytics `/v1/admin/analytics/clans`
- Player Market Foundation: escrow, 5% fee, allowlist ресурсов, без UI рынка и без auction behaviour (`docs/player-market-foundation.md`)

## Prototype 0.0.5 содержит

- PvP 1.0: реальные соперники, snapshot, Elo K16/K8, антифарм, вехи сезона
- Admin Analytics 1.0: `/v1/admin/analytics/*` за `ADMIN_ANALYTICS_TOKEN`
- gate PvP: `week_1_complete`; group chat не публикует боевой лог
- additive migration `20260907200000_pvp_analytics`

## Prototype 0.0.4 содержит

- весь канон Недели 1 (дни 1–7), без ломки старых сохранений
- Неделя 2 / дни 8–14: Туманная низина, вторая печать
- фермерство флагами, лук, щит, ведро, новая еда
- Утонувший карьер, Смольник, Туманный сторож
- Мира и trust, «Осталось: 5»

## Prototype 0.0.3 содержит

- полный День 1 с развилками без soft-lock
- HUD на старте, consumable `dry_rusk`, укрытие, ржавый жетон / Узел 7
- стартовый ящик: `LOG ×2`, сухарь, каменный нож — **без** `STONE` shortcut
- крафт: `LOG → PLANK → STICK → CRAFTING_TABLE → WOODEN_PICKAXE → COBBLESTONE → STONE_PICKAXE → IRON_ORE`
- старый путь `WOOD + STONE → STONE_PICKAXE` удалён
- Рем, затвор, `unknown_node7_creature` (???)
- квест `iron_for_gate`, осыпь, падальщик, affinity один раз
- штольня, обвал, ползун, секретный сундук, синяя жила
- уровень 2, первая ночь, Survivor Pack, заглушка Дня 2
- data-driven диалоги, валидация команд и stale callback
- идемпотентность event_id / reward_claims
- mock VK-консоль для прохождения

Не входит: Mini App, React frontend, браузерная игра, PvP, рынок, кланы, сезоны, платежи, production VK webhook, admin panel, контент Дня 2.
