# Куболесье | Чат-RPG

**Куболесье** — большая чат-RPG для сообщества ВКонтакте.

Это **не** VK Mini App, **не** браузерная игра и **не** обычный сайт.

Игрок взаимодействует через сообщения сообщества: текст, кнопки, callback actions и, при необходимости, карточки.

Текущая версия: **Prototype 0.0.1** — рабочий фундамент, не полноценный игровой день.

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

Идентификатор игрока внутри ядра — `player.id`. `vk_user_id` уникален в таблице `players`, но core не принимает сырой VK JSON и не строит сюжет вокруг VK API.

## Структура

```
apps/
  api/          NestJS HTTP: health, mock VK event, inspect player
  vk-bot/       адаптер mock-события → NormalizedIncomingEvent → GameResponse
  worker/       BullMQ skeleton (без energy cron)
packages/
  game-core/    команды, энергия, инвентарь, диалоги, флаги, квесты
  combat-engine детерминированный бой (snapshot + seed)
  database/     Prisma schema, migration, PrismaGameStore
  content/      предметы, рецепты, враги, локации, диалоги Дня 1 (каркас)
  shared/       команды, GameResponse, enums
```

Монорепозиторий на **npm workspaces**.

## Local setup

Нужны Node.js 20+ и Docker (для Postgres + Redis).

```bash
cp .env.example .env
npm install
npm run docker:up
npm run prisma:migrate
npm run prisma:seed
npm run start:api
```

API по умолчанию слушает `PORT` из `.env` (3000).

Локально `GET /` отдаёт **mock VK-консоль** — это не игровой клиент и не Mini App, а стенд для mock-событий.

`VK_GROUP_TOKEN` **не нужен** для локального запуска ядра.

Mock-событие:

```bash
curl -s localhost:3000/v1/mock/event \
  -H 'content-type: application/json' \
  -d '{"event_id":"e1","vk_user_id":"1001","action":"START_GAME"}'
```

Ожидаемый ответ: стартовый текст и три кнопки — «Осмотреть ящик», «Пойти к дыму», «Проверить кусты».

Дальше:

```bash
# ящик → rusty_token + flag found_rusty_token
curl -s localhost:3000/v1/mock/event -H 'content-type: application/json' \
  -d '{"event_id":"e2","vk_user_id":"1001","action":"OPEN_CRATE"}'

# рубка дерева: −2 energy, +6 WOOD
curl -s localhost:3000/v1/mock/event -H 'content-type: application/json' \
  -d '{"event_id":"e3","vk_user_id":"1001","action":"GATHER_WOOD"}'

curl -s localhost:3000/v1/players/1001
```

Перезапуск API при `GAME_STORE=prisma` и живом Postgres сохраняет прогресс.

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

Первая миграция: `packages/database/prisma/migrations/20260906120000_init`

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

Сидит квест `iron_for_gate`. Предметы, враги, локации и диалоги живут в `packages/content` (template layer).

## Tests

```bash
npm test
```

Покрыто:

1. ленивая регенерация энергии (1 / 10 минут)
2. крафт `stone_axe`
3. отказ в крафте при нехватке ресурсов
4. повторный `event_id` не выполняет действие дважды
5. повторный claim награды
6. детерминированный бой при одинаковых snapshot + seed
7. нельзя экипировать чужой предмет
8. монеты не уходят ниже 0

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

Нормализованные команды ядра (VK payload позже мапится сюда):

`START_GAME` `EXPLORE` `OPEN_INVENTORY` `OPEN_CAMP` `GATHER_WOOD` `CRAFT_ITEM` `EQUIP_ITEM` `USE_ITEM` `TALK_NPC` `START_PVE` `CLAIM_REWARD` `OPEN_CRATE` `DIALOGUE_CHOICE`

`GameResponse` ядра:

```ts
{ text, buttons: [{ label, action, payload }], attachments?, state? }
```

Ядро **не** собирает сырой VK keyboard JSON. Это делает VK Adapter.

## Prototype 0.0.1 содержит

- backend skeleton (NestJS)
- database layer (Prisma + PostgreSQL)
- player, stats, energy (lazy), resources, inventory instances, equipment
- story flags, NPC relations (`rem`), quests (`iron_for_gate`)
- dialogue/state engine
- command router
- combat-engine + combat_matches/events
- content layer (предметы, рецепты, враги, локации, каркас Дня 1)
- VK adapter skeleton (mock events)
- idempotency (`processed_events`)
- reward claims, currency ledger, item history
- Docker local environment
- tests + README

Не входит в этот патч: Mini App, React frontend, браузерная игра, PvP, рынок, кланы, сезоны, платежи, production VK webhook, admin panel.
