# Deployment — Куболесье

Provider-neutral production setup. VK — только интерфейс. PostgreSQL — source of truth.

Canonical Callback URL: `https://<domain>/vk/callback`  
Compatibility alias: `POST /v1/vk/callback`.

## 1. Provision PostgreSQL

PostgreSQL 16+. Один database, schema `public`.

Pooled URL (PgBouncer/transaction pooler) рекомендуется, если хостинг serverless или много инстансов:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kubolesie?schema=public&connection_limit=5
```

Не хардкодить большой pool. `connection_limit` подбирается под лимит provider × число инстансов.

## 2. Environment

Скопируй `.env.example`. В production обязательны:

- `NODE_ENV=production`
- `DATABASE_URL`
- `VK_GROUP_ID`
- `VK_GROUP_TOKEN`
- `VK_CALLBACK_SECRET`
- `VK_CONFIRMATION_CODE`

`VK_API_VERSION` по умолчанию `5.199`. `VK_API_TIMEOUT_MS` по умолчанию `4000`.

`PORT` задаёт hosting. Слушаем `HOST=0.0.0.0`.

Опционально `APP_COMMIT_SHA` для health.

Пустой `GAME_STORE=memory` в production — startup error. MemoryStore только для tests/dev.

Worker **не** обязателен для текущего gameplay. Redis — locks/rate-limit; отсутствие Redis не ломает API (no-op locks).

Секреты в git не класть. Image не копирует `.env`.

## 3. Migrate (release step)

Один раз на релиз, не из каждого инстанса:

```bash
npm run db:migrate:deploy
```

Это `prisma migrate deploy`. Не `prisma migrate dev`, не `db push`, не `migrate reset`.

При нескольких инстансах migrate выполняется **до** масштабирования API.

## 4. Build / start

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

`.env` монтируется снаружи. В image его нет.

## 5. Health

- `GET /health` — liveness. Процесс жив. Не ходит в VK.
- `GET /ready` (alias `/v1/ready`) — PostgreSQL ping. 503, если БД недоступна.

Платформа должна слать gameplay traffic только на ready instance.

## 6. VK Callback

1. URL: `https://<domain>/vk/callback`
2. События: `message_new`, `message_event`
3. Secret = `VK_CALLBACK_SECRET`
4. Confirmation: VK пришлёт `{ type: "confirmation", group_id, secret }`. Ответ — plain text `VK_CONFIRMATION_CODE`.
5. Проверка одним личным аккаунтом: «начать».

Подробности: [vk-callback-setup.md](vk-callback-setup.md).

## 7. Mock / debug

В production закрыты:

- `GET /` mock-консоль
- `POST /v1/mock/event`
- `GET /v1/players/:vkUserId`

`ENABLE_MOCK_API=true` production **не** включает.

## 8. Shutdown

SIGTERM/SIGINT: Nest shutdown hooks закрывают Prisma. Не режь процесс без grace period.

## 9. Backup

Перед destructive future migrations — [production-database.md](production-database.md).

## 10. Что это не делает

- Не выбирает конкретный hosting.
- Не создаёт VK-группу.
- Не подключает payments.
- Не добавляет Redis rate limiter (следующий этап).
