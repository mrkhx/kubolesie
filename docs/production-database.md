# Production PostgreSQL — Куболесье

PostgreSQL — единственный source of truth прогресса игрока. MemoryStore существует только для unit-тестов и локального mock.

## Migrations

Последовательность (не изменять уже применённые файлы):

1. `20260906120000_init`
2. `20260906180000_day_one`
3. `20260906190000_crafting_pipeline` — `LOG` / `PLANK` / `STICK` / `COBBLESTONE`
4. `20260906200000_week_one` — `IRON_INGOT`
5. `20260906210000_meta_progression`
6. `20260907120000_hardening` — `player_weekly_scores`, CHECK `amount >= 0`
7. `20260907130000_products_premium_default` — `products.currency` default `PREMIUM` after enum commit (PG 55P04)

Production:

```bash
npm run db:migrate:deploy
```

В Docker/Render Free этот же script вызывается из `scripts/start-container.sh` до `npm run start:api`.


`prisma migrate deploy` идемпотентен. Не запускать несколько `migrate dev` параллельно.

`prisma generate` выполняется на install/build. Не рассчитывать на локальный generated client в image.

## Connection

`DATABASE_URL` только из environment. Логируется `dbConfigured=true`, `dbProvider=postgresql`. Пароль и URL не логируются.

Рекомендуемый Postgres 16 (как в `docker-compose.yml`). `ALTER TYPE ... ADD VALUE` в migrations рассчитан на PG 12+.

Pool: не хардкодить. Для serverless — pooled URL провайдера (`connection_limit` на инстанс, обычно 5).

## Test-only suite

Не использует production URL.

```bash
# Docker Postgres 16 на :55432 + migrate deploy + integration tests
npm run test:db:migrations

# или уже поднятый disposable DB
TEST_DATABASE_URL=postgresql://kubolesie:kubolesie@127.0.0.1:5432/kubolesie_test \
  npm run test:db
```

Скрипт отказывается работать, если:

- `NODE_ENV=production`
- URL не localhost и имя БД не содержит `_test`

Нет `migrate reset` / `db push --force-reset` в start/deploy scripts.

## Backup перед destructive migration

Сейчас все migrations additive. Перед будущим destructive изменением снять backup.

Placeholder (подставь свои значения, **не** коммить пароли):

```bash
pg_dump --format=custom --no-owner \
  --dbname=postgresql://USER:PASSWORD@HOST:5432/DBNAME \
  --file=kubolesie-$(date +%Y%m%d).dump

pg_restore --no-owner --dbname=postgresql://USER:PASSWORD@HOST:5432/DBNAME \
  kubolesie-YYYYMMDD.dump
```

Этот репозиторий backup не выполняет.

## Reconnect

Один временный query error не переключает процесс на MemoryStore. В production отсутствие PostgreSQL — startup failure. `/ready` становится 503, `/health` остаётся alive.

Graceful shutdown вызывает `prisma.$disconnect()`.
