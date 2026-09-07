# Deployment — Куболесье

Provider-neutral production setup. VK — только интерфейс. PostgreSQL — source of truth. Redis — только anti-abuse (rate limits / короткие locks).

Canonical Callback URL: `https://<domain>/vk/callback`  
Compatibility alias: `POST /v1/vk/callback`.

## 1. Provision PostgreSQL

PostgreSQL 16+. Один database, schema `public`.

Pooled URL (PgBouncer/transaction pooler) рекомендуется, если хостинг serverless или много инстансов:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kubolesie?schema=public&connection_limit=5
```

Не хардкодить большой pool. `connection_limit` подбирается под лимит provider × число инстансов.

## 2. Provision Redis

Redis 7+ для distributed rate limits и коротких mutation locks. Не класть gameplay truth в Redis.

```
REDIS_URL=redis://HOST:6379
```

Production + `RATE_LIMIT_ENABLED=true` (так по умолчанию) **без** `REDIS_URL` — процесс не стартует. Silent fail-open запрещён.

## 3. Environment

Скопируй `.env.example`. В production обязательны:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `VK_GROUP_ID`
- `VK_GROUP_TOKEN`
- `VK_CALLBACK_SECRET`
- `VK_CONFIRMATION_CODE`

`RATE_LIMIT_ENABLED` по умолчанию `true` в production. Явный `false` снимает Redis-требование и оставляет инстанс без distributed anti-abuse — так не деплоить.

`VK_API_VERSION` по умолчанию `5.199`. `VK_API_TIMEOUT_MS` по умолчанию `4000`.
`REDIS_CONNECT_TIMEOUT_MS` по умолчанию `2000`. `REDIS_COMMAND_TIMEOUT_MS` по умолчанию `1000`.

`PORT` задаёт hosting. Слушаем `HOST=0.0.0.0`.

Опционально `APP_COMMIT_SHA` для health.

Пустой `GAME_STORE=memory` в production — startup error. MemoryStore только для tests/dev.

Worker **не** обязателен для текущего gameplay.

Секреты в git не класть. Image не копирует `.env`. Redis в production image не встраивается.

## 4. Migrate (release step)

Один раз на релиз, не из каждого инстанса:

```bash
npm run db:migrate:deploy
```

Это `prisma migrate deploy`. Не `prisma migrate dev`, не `db push`, не `migrate reset`.

При нескольких инстансах migrate выполняется **до** масштабирования API. Redis-схема не нужна — только TTL keys.

## 5. Build / start

Порядок:

1. PostgreSQL доступен
2. Redis доступен
3. env заполнен
4. `npm run db:migrate:deploy`
5. start API
6. `GET /health`
7. `GET /ready`
8. VK callback

```bash
npm ci
npm run prisma:generate
npm run start:api
```

Или Docker:

```bash
docker build -t kubolesie-api .
docker run --rm -p 8080:3000 --env-file .env kubolesie-api
```

`.env` монтируется снаружи. В image его нет. Redis — отдельный сервис, не слой image.

## 6. Health

- `GET /health` — liveness. Процесс жив. Не ходит в VK и не требует Redis.
- `GET /ready` (alias `/v1/ready`) — PostgreSQL ping + Redis ping, если rate limiting включён. 503, если БД или Redis недоступны.

Платформа должна слать gameplay traffic только на ready instance.

## 7. VK Callback

1. URL: `https://<domain>/vk/callback`
2. События: `message_new`, `message_event`
3. Secret = `VK_CALLBACK_SECRET`
4. Confirmation: VK пришлёт `{ type: "confirmation", group_id, secret }`. Ответ — plain text `VK_CONFIRMATION_CODE`. Confirmation **не** режется узким rate limit.
5. Flood: ACK `200 ok` + сообщение игроку «Слишком быстро 🙂 Подожди пару секунд.» VK **не** получает 429.
6. Проверка одним личным аккаунтом: «начать».

Подробности: [vk-callback-setup.md](vk-callback-setup.md), [rate-limiting.md](rate-limiting.md).

## 8. Mock / debug

В production закрыты:

- `GET /` mock-консоль
- `POST /v1/mock/event`
- `GET /v1/players/:vkUserId`

`ENABLE_MOCK_API=true` production **не** включает.

Local без Redis: `RATE_LIMIT_ENABLED=false` или in-memory limiter.

## 9. Shutdown

SIGTERM/SIGINT: Nest shutdown hooks закрывают Prisma и Redis client. Не режь процесс без grace period.

## 10. Backup

Перед destructive future migrations — [production-database.md](production-database.md). Redis keys истекают по TTL, backup не нужен.

## 11. Что это не делает

- Не выбирает конкретный hosting.
- Не создаёт VK-группу.
- Не подключает payments.
- Не кладёт gameplay truth в Redis.
