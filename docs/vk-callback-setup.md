# VK Callback API — Куболесье

VK — только интерфейс. Игровая логика живёт в Game Core.

## 1. Переменные окружения

Скопируй `.env.example` и заполни:

```
VK_GROUP_ID=
VK_GROUP_TOKEN=
VK_CALLBACK_SECRET=
VK_CONFIRMATION_CODE=
VK_API_VERSION=5.199
```

Пустые значения — mock-режим. Реальные секреты в git не коммитить.

Production без полного набора — fail-closed: callback отвечает 503, Game Core не вызывается.

Валидный callback при превышении rate limit всё равно ACK `200 ok`; игрок получает «Слишком быстро 🙂 Подожди пару секунд.» VK не получает HTTP 429. Confirmation не режется узким лимитом. См. [rate-limiting.md](rate-limiting.md).

## 2. Endpoint

```
POST /vk/callback
```

Дубль: `POST /v1/vk/callback`.

Ответ всегда `text/plain`:

- `confirmation` → строка из `VK_CONFIRMATION_CODE`
- остальные обработанные события → `ok`
- sendMessage временно упал после commit → HTTP 503 `retry` (VK повторит; `processed_events` не даст второй мутации)

JSON `GameResponse` в HTTP-теле callback **не** возвращается.

Тело запроса ограничено 32 КБ.

## 3. Какие события включить

В управлении сообществом → Работа с API → Callback API:

- `message_new`
- `message_event`

Остальные типы сервер игнорирует и отвечает `ok` без Game Core.

Политика peer: только личные сообщения сообщества (`peer_id === from_id`, `from_id > 0`, не чаты `2e9+`). Групповые чаты, исходящие, служебные и сообщения от имени сообщества игнорируются.

## 4. Confirmation

1. Canonical URL: `https://<host>/vk/callback` (alias `/v1/vk/callback`).
2. VK пришлёт `{ "type": "confirmation", "group_id": ..., "secret": "..." }`.
3. Если в сообществе задан секретный ключ (обязателен в production), поле `secret` **проверяется до** возврата кода. Запрос только с `group_id` confirmation code не получит.
4. Сервер вернёт `VK_CONFIRMATION_CODE` (plain text).
5. Код меняется при пересоздании сервера — обнови env.

Фактическое поведение VK Callback API: при настроенном секретном ключе **все** уведомления, включая `confirmation`, содержат `secret`. Без ключа в кабинете VK historically шлёт только `{ type, group_id }`. Production всегда требует секрет — confirmation без него → HTTP 403.

## 5. Secret и group_id

- В настройках Callback задай секретный ключ = `VK_CALLBACK_SECRET`.
- `group_id` в payload должен совпасть с `VK_GROUP_ID`.
- Неверный secret / чужая группа → HTTP 403, Game Core не вызывается.
- В production нет fallback «принять без секрета».

## 6. Event id (идемпотентность)

Внутренний `event_id` стабилен при retry VK и различен для разных сообщений. `Date.now()` / UUID не используются.

1. Если в корне payload есть `event_id` — `vk:<type>:<event_id>`.
2. Иначе `message_new` — `vk:message_new:<peer_id>:<conversation_message_id|id>`.
3. Иначе `message_event` — `vk:message_event:<object.event_id>`.

Namespace не даёт столкнуть `message_new` и `message_event`. Повтор той же доставки идёт в `processed_events` (claim-first): ответ можно переслать, state не мутирует второй раз.

`random_id` для `messages.send` — детерминированный int32 от внутреннего event id.

## 7. Локальная проверка

Mock-консоль (`GET /`, `POST /v1/mock/event`) работает отдельно и **не** удаляется.

Callback без реальной VK сети:

```bash
# confirmation (secret required when VK_CALLBACK_SECRET is set)
curl -s localhost:3000/vk/callback \
  -H 'content-type: application/json' \
  -d '{"type":"confirmation","group_id":111,"secret":"<VK_CALLBACK_SECRET>"}'
```

Для `message_new` нужны заполненные env. Фикстуры в тестах используют только fake-значения (`test-token`, `test-secret`).

## 8. Что нельзя коммитить

- `VK_GROUP_TOKEN`
- `VK_CALLBACK_SECRET`
- `VK_CONFIRMATION_CODE`
- сырые логи с текстом игрока и raw payload

Health (`GET /health`) — liveness, без секретов. Readiness (`GET /ready`) проверяет PostgreSQL и не ходит в VK.

Production: [docs/deployment.md](deployment.md), [docs/production-database.md](production-database.md).
