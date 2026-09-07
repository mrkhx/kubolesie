# Anti-abuse — Куболесье

PostgreSQL остаётся единственным source of truth прогресса. Redis — только ephemeral: rate limits, короткие distributed locks, anti-abuse counters.

Redis **не** хранит:

- inventory, energy, coins, quests, ratings, clans
- `processed_events`, rewards, player progression

Game Core не знает про Redis. Лимиты живут в adapter/API (`apps/vk-bot` + `apps/api/src/redis.ts`).

## Порядок на callback

1. JSON 32 КБ / malformed → ACK `ok` (дешёвый отказ).
2. `confirmation` — **не** режется узким лимитом. Secret **не** требуется (реальный VK его не шлёт). Проверяется `group_id`.
3. Secret + `group_id`. Невалидный секрет **не** пишет player keys.
4. Parse. Tampered → безопасный текст, без Game Core.
5. Coarse IP (emergency, высокий порог — VK шарит egress).
6. Per-user callback ingress.
7. Exact duplicate `processed_events` → ACK + replay, **без** command quota.
8. Per-command class limit.
9. Короткий per-player mutation lock (3–5 с). Read commands lock не берут. Busy → сразу ответ, без wait.
10. Game Core + `processed_events` / DB constraints — последний рубеж.

VK callback **никогда не получает HTTP 429**. Throttle: ACK `200 ok` + сообщение игроку:

«Слишком быстро 🙂 Подожди пару секунд.»

## Категории и лимиты (defaults)

| Класс | Команды | Лимит |
|---|---|---|
| GAMEPLAY | gather / craft / trade / furnace / PvE / сюжетные мутации | 30 / мин, burst 8 / 5 с |
| READ | profile, inventory, camp, menu, explore | 60 / мин |
| EXPENSIVE_READ | leaderboard, ratings, clan find/apps | 15 / мин |
| CLAN_MUTATION | create/apply/accept/reject/kick/promote/demote/transfer/disband/leave | 10 / мин, burst 3 / 10 с |
| PVP | `START_PVP` (дневной cap 3 стычки — Game Core) | 10 попыток / мин |
| SYSTEM | `START_GAME`, неизвестный текст после parser | 20 / мин, burst 8 / 5 с |
| callback | каждый валидный user event | 60 / мин, burst 15 / 5 с |
| ip | emergency, не identity | 600 / мин, burst 120 / 5 с |

Цифры централизованы в `apps/vk-bot/src/abuse-policy.ts` и перекрываются env `RATE_LIMIT_*`.

Неизвестный текст лимитируется как SYSTEM и **не** тратит gameplay energy. `START_GAME` спам не создаёт второго игрока и не ресетит прогресс: unique `vk_user_id` в PostgreSQL.

Premium/VIP **не** обходит лимитер. Публичного admin bypass через payload/header нет.

## Алгоритм

Fixed window + optional burst window. Atomic Lua `INCR` + `PEXPIRE` (без `DECR`). 100 параллельных consume при limit 10 → ровно 10 allow, без отрицательных счётчиков. Два API instance на одном Redis делят один лимит.

## Ключи

```
kubolesie:rl:{kind}:{id}:{window}   window = m | b
kubolesie:lock:{kind}:{id}
```

TTL обязателен. Нет `KEYS *`, `FLUSHALL`, `FLUSHDB` в runtime. В ключах нет token/secret/raw text.

Identity: `vk:{vk_user_id}` на adapter boundary. IP ключи отдельные (`kind=ip`) и не смешиваются с player keys.

## Locks

`GameRuntime.serialize` — in-process. Для нескольких инстансов mutation берёт короткий Redis lock (`SET NX PX` + compare-and-delete). Read пропускает. Busy → «Слишком быстро 🙂 Подожди пару секунд.»

## Production policy

- `NODE_ENV=production` → `RATE_LIMIT_ENABLED` по умолчанию `true`.
- production + enabled + нет `REDIS_URL` → **startup fail**. Нет silent fail-open.
- Redis down + enabled → `/health` жив, `/ready` 503. Gameplay не выполняется «как будто лимитов нет».
- Local/tests: `RATE_LIMIT_ENABLED=false` (default вне production) или in-memory store. `npm test` Redis не требует.

## Dev / test

```bash
RATE_LIMIT_ENABLED=false npm run start:api   # без Redis
RATE_LIMIT_ENABLED=true REDIS_URL=redis://localhost:6379 npm run start:api
npm test                                     # in-memory
TEST_REDIS_URL=redis://127.0.0.1:6379 npm run test:redis
```

Только localhost Redis. Не гонять suite против production URL.
