# Куболесье | Чат-RPG

**Куболесье** — большая чат-RPG для сообщества ВКонтакте.

Это **не** VK Mini App, **не** браузерная игра и **не** обычный сайт.

Игрок взаимодействует через сообщения сообщества: текст, кнопки, callback actions и, при необходимости, карточки.

Текущая версия: **Prototype 0.0.2** — полный игровой День 1 в mock VK-консоли.

## Архитектура

VK является только интерфейсом. Вся игровая логика живёт независимо от VK.

```
VK Messages
    ↓
VK Adapter          apps/vk-bot
    ↓
Command Router      packages/game-core
    ↓
Game Core           packages/game-core + combat-engine + content
    ↓
PostgreSQL          packages/database (Prisma)
```

Дополнительно:

- Redis — lock, rate limit, временный cache. **Не** хранилище прогресса.
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
  vk-bot/       адаптер mock-события → NormalizedIncomingEvent → GameResponse
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
  → каменный нож, сухарь, дерево, камень (ящик один раз)
  → дикая землеройка (бой необязателен)
  → рубка дерева, жетон один раз, осмотр → «Узел 7» / «Не буди шахту»
  → дым без жетона = пустой стан; с активированным жетоном = Рем и затвор
  → закрыть затвор (камни / доски / механизм / вопрос) → существо ??? 
  → квест iron_for_gate (8 IRON_ORE)
  → осыпь: камень руками, падальщик (уйти / ударить / копать / покормить)
  → крафт: топор (2+2), кирка (2+3)
  → штольня (кирка + квест): железо, рельсы, слух, ползун
  → 8 руды → голубой свет → секретный сундук (miner_belt) / синяя жила
  → сдать железо Рему (+40 XP, +25 монет, trust)
  → уровень 2 (порог 40 XP: квест сам по себе поднимает уровень)
  → ночь у Рема или в своём укрытии
  → DAY_1_COMPLETE + Survivor Pack (50 монет, еда ×2)
  → «Начать День 2» → «Продолжение скоро будет доступно.»
```

Level 2: `max_hp +5`, `max_energy +1`, HP заполняется до нового максимума. Trust Рема числом не показывается.

## Local setup

Нужны Node.js 20+ и Docker (для Postgres + Redis). Без Docker ядро поднимается на in-memory store (`GAME_STORE=memory`).

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

`VK_GROUP_TOKEN` **не нужен**.

### Mock playthrough

1. Открой mock-консоль (`GET /`).
2. Нажми `START_GAME` (или напиши `/start`).
3. Жми кнопки ответа: ящик → рубить дерево → осмотреть жетон → к дыму → помочь с затвором → осыпь → кирка → штольня → железо → сдать Рему → ночь.
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
npm test
```

Сохранены тесты 0.0.1 и добавлены сценарии Дня 1: ящик, сухарь, укрытие, жетон, падальщик, штольня, ползун, квест, секрет, trust, уровень 2, ночь, survivor pack, stale callback, идемпотентность, все основные ветки, persist после restart.

## Env

См. `.env.example`. Реальные секреты в git не класть.

| Variable | Назначение |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | locks / rate limit / queues |
| `PORT` | HTTP API |
| `NODE_ENV` | `development` / `production` |
| `VK_GROUP_TOKEN` | пусто для локального ядра |
| `VK_GROUP_ID` | reserved |
| `VK_CALLBACK_SECRET` | reserved |
| `GAME_STORE` | `prisma` или `memory` |
| `MEMORY_STORE_PATH` | JSON-снимок только для dev fallback |
| `ENABLE_MOCK_API` | mock HTTP, выключен в production по умолчанию |

## Game commands

`START_GAME` `EXPLORE` `OPEN_INVENTORY` `OPEN_CAMP` `GATHER_WOOD` `GATHER_STONE` `GATHER_IRON` `CRAFT_ITEM` `EQUIP_ITEM` `USE_ITEM` `TALK_NPC` `START_PVE` `CLAIM_REWARD` `OPEN_CRATE` `DIALOGUE_CHOICE` `INSPECT_TOKEN` `BUILD_TEMP_SHELTER` `FEED_SCAVENGER` `RETURN_IRON` `OPEN_SECRET_CHEST` `MINE_BLUE_MINERAL` `REST_NIGHT` `BEGIN_DAY_2`

`GameResponse` ядра:

```ts
{ text, buttons: [{ label, action, payload }], attachments?, state? }
```

Ядро **не** собирает сырой VK keyboard JSON. Это делает VK Adapter.

## Prototype 0.0.2 содержит

- полный День 1 с развилками без soft-lock
- HUD на старте, consumable `dry_rusk`, укрытие, ржавый жетон / Узел 7
- Рем, затвор, `unknown_node7_creature` (???)
- квест `iron_for_gate`, осыпь, падальщик, affinity один раз
- штольня, обвал, ползун, секретный сундук, синяя жила
- уровень 2, первая ночь, Survivor Pack, заглушка Дня 2
- data-driven диалоги, валидация команд и stale callback
- идемпотентность event_id / reward_claims
- mock VK-консоль для прохождения

Не входит: Mini App, React frontend, браузерная игра, PvP, рынок, кланы, сезоны, платежи, production VK webhook, admin panel, контент Дня 2.
