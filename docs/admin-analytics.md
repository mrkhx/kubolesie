# Admin Analytics 1.0

Защищённые server-only HTTP endpoints. Не Mini App, не публичная админка.

## Auth

Переменная окружения: `ADMIN_ANALYTICS_TOKEN`.

```
Authorization: Bearer <token>
```

- токен не задан → endpoints **404** (выключены)
- нет заголовка / неверный токен → **401**
- сравнение constant-time при равной длине
- токен не логируется и не возвращается в JSON

Пример (подставьте свой токен, не коммитьте его):

```bash
curl -sS -H "Authorization: Bearer $ADMIN_ANALYTICS_TOKEN" \
  https://<host>/v1/admin/analytics/overview
```

## Endpoints

| Method | Path | Содержание |
| --- | --- | --- |
| GET | `/v1/admin/analytics/overview` | игроки, регистрации, active5/15/60, DAU/WAU/MAU, бои за сутки, Week1/Week2, кланы |
| GET | `/v1/admin/analytics/players` | активность, proxy retention, уровни, playersInClan |
| GET | `/v1/admin/analytics/progression` | воронка по флагам дней/недель, PvP unlock, босс, питомец |
| GET | `/v1/admin/analytics/combat` | PvE/PvP counts, боссы, Wenzel / Mist Warden |
| GET | `/v1/admin/analytics/system` | version, uptime, store, db/redis ping, vk configured, process-local counters |
| GET | `/v1/admin/analytics/clans` | totalClans, activeClans7d, members, contribution, task completions, top 10 weekly |

## Активность

`players.last_active_at` обновляется на валидной команде Game Core.

Игнорируемый group chatter **не** доходит до ядра и **не** считается активностью.

DAU/WAU/MAU — игроки с `last_active_at` за сегодня / 7д / 30д (UTC). Это proxy, не классический D1/D7.

Retention proxy:

- зарегистрированы вчера и активны сегодня
- зарегистрированы 7 дней назад и активны за последние 7 дней

## Privacy

Только агрегаты и counts. Нет сырых сообщений, нет массовой выдачи VK ID / имён.

`system` отдаёт булевы флаги VK (`groupToken: true/false`), не сами секреты.

## Performance

Агрегации через `count` / `groupBy` / узкие индексы (`created_at`, `last_active_at`, `combat_matches (mode, started_at)`, `player_flags.flag`). Без выгрузки всей `combat_events`. Ping БД/Redis с timeout ~800 мс.

## Process-local counters

`vkCallbackErrors`, `vkSendErrors`, `dbErrors`, `rateLimitedRequests`, `adminEndpointRequests`.

Сбрасываются при рестарте. Это не durable analytics.
