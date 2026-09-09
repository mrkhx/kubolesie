import type { DialogueNode } from './dialogue-types';

export const WEEK6_NODES: Record<string, DialogueNode> = {
  day36_start: {
    id: 'day36_start',
    text: [
      'За чёрной топью — заброшенный стан. Деревянные платформы. Каменные основания. Тележечные пути без поездов.',
      'Всё выглядит мёртвым. Пока не видишь стружку. Рычаг ещё тёплый. Ящик сдвинут недавно.',
      'Рем: «Заброшенные места сами рычаги не двигают.»',
    ].join('\n'),
    choices: [
      { id: 'edge', label: 'Во двор', command: 'WEEK6_ACT', commandPayload: { act: 'edge' } },
      { id: 'ask', label: 'Спросить Рема', nextNode: 'day36_rem' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day36_rem: {
    id: 'day36_rem',
    text: '— Кто-то использует стан как путь. Не жильё. След короткий. Не спрашивай имя. Я не знаю.',
    choices: [
      { id: 'edge', label: 'Во двор', command: 'WEEK6_ACT', commandPayload: { act: 'edge' } },
      { id: 'mira', label: 'Спросить Миру', nextNode: 'day36_mira' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day36_mira: {
    id: 'day36_mira',
    text: '— Если стан обслуживал узлы, здесь можно было менять направление нагрузки. Это не доказательство. Это возможность.',
    choices: [
      { id: 'edge', label: 'Во двор', command: 'WEEK6_ACT', commandPayload: { act: 'edge' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day36_complete: {
    id: 'day36_complete',
    text: [
      'Стан не мёртв. Здесь кто-то был. Совсем недавно.',
      'Рем: «Дальше сортировка. Три хода. Один короче, если умеешь читать дерево и камень.»',
    ].join('\n'),
    choices: [
      { id: 'day37', label: 'Начать День 37', command: 'BEGIN_DAY_37' },
      { id: 'edge', label: 'Ещё ко двору', command: 'WEEK6_ACT', commandPayload: { act: 'edge' } },
    ],
  },
  day37_start: {
    id: 'day37_start',
    text: [
      'Сортировочный двор. Завал из балок. Противовес на канате. Обходные мостки.',
      'Профессия подскажет. Без профессии — тоже выйдешь, только дольше и голоднее.',
    ].join('\n'),
    choices: [
      { id: 'sort', label: 'К сортировке', command: 'WEEK6_ACT', commandPayload: { act: 'sort' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day37_complete: {
    id: 'day37_complete',
    text: 'Проход вывел к нижним галереям. Там уже не пыль — зубы и крепёж.',
    choices: [
      { id: 'day38', label: 'Начать День 38', command: 'BEGIN_DAY_38' },
      { id: 'gallery', label: 'К галереям', command: 'WEEK6_ACT', commandPayload: { act: 'gallery' } },
    ],
  },
  day38_start: {
    id: 'day38_start',
    text: [
      'Нижние галереи. Шпальники, пыльники, железоспины.',
      'Не бесконечная охота. Камень, уголь, лом. Потом — комната переключений.',
    ].join('\n'),
    choices: [
      { id: 'gallery', label: 'В галереи', command: 'WEEK6_ACT', commandPayload: { act: 'gallery' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day38_complete: {
    id: 'day38_complete',
    text: 'Дальше каменные каналы и рычаги. Стан правда обслуживал маршруты.',
    choices: [
      { id: 'day39', label: 'Начать День 39', command: 'BEGIN_DAY_39' },
      { id: 'gallery', label: 'Ещё галереи', command: 'WEEK6_ACT', commandPayload: { act: 'gallery' } },
    ],
  },
  day39_start: {
    id: 'day39_start',
    text: [
      'Комната переключений. Не пульт. Каменные каналы, пазы, противовесы, деревянно-железные указатели.',
      'Мира была права хотя бы в одном: стан мог менять нагрузку сети.',
    ].join('\n'),
    choices: [
      { id: 'switch', label: 'К рычагам', command: 'WEEK6_ACT', commandPayload: { act: 'switch' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day39_complete: {
    id: 'day39_complete',
    text: 'Маршрут прочитан. Дальше под настилом скрежет. Не страж печати. Страж механизма.',
    choices: [
      { id: 'day40', label: 'Начать День 40', command: 'BEGIN_DAY_40' },
      { id: 'switch', label: 'Ещё к рычагам', command: 'WEEK6_ACT', commandPayload: { act: 'switch' } },
    ],
  },
  day40_start: {
    id: 'day40_start',
    text: [
      'Скрежетник. На панцире застряли скобы и пластины. Живёт среди лебёдок. Не страж печати.',
      'Лук, щит, канат, распорка помогают. Без них — можно. Ретрай без потери вещей.',
    ].join('\n'),
    choices: [
      { id: 'boss', label: 'К Скрежетнику', command: 'WEEK6_ACT', commandPayload: { act: 'skrezhetnik' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day40_complete: {
    id: 'day40_complete',
    text: 'Сердечник стана тяжёлый и тёплый. Дальше мост. На мосту кто-то есть.',
    choices: [
      { id: 'day41', label: 'Начать День 41', command: 'BEGIN_DAY_41' },
      { id: 'contact', label: 'К мосту', command: 'WEEK6_ACT', commandPayload: { act: 'contact' } },
    ],
  },
  day41_start: {
    id: 'day41_start',
    text: [
      'Верхняя сортировка. Сигнальный мост. За решёткой рычагов — силуэт.',
      'Лица нет. Он заканчивает ход. Противовес ещё качается.',
    ].join('\n'),
    choices: [
      { id: 'contact', label: 'К мосту', command: 'WEEK6_ACT', commandPayload: { act: 'contact' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day41_complete: {
    id: 'day41_complete',
    text: 'Он ушёл. Две реплики. Имени нет. Он знает, что ты закрываешь печати, и считает это ошибкой. Завтра свод. Шестая печать.',
    choices: [
      { id: 'day42', label: 'Начать День 42', command: 'BEGIN_DAY_42' },
      { id: 'prep', label: 'К своду', command: 'WEEK6_ACT', commandPayload: { act: 'prep' } },
    ],
  },
  day42_start: {
    id: 'day42_start',
    text: [
      'Глубина стана. Шестая печать. Каменные затворы вокруг ядра пути.',
      'Затворник. Не Бездонник. Не тот, кто говорил с моста.',
    ].join('\n'),
    choices: [
      { id: 'prep', label: 'Подготовиться', command: 'WEEK6_ACT', commandPayload: { act: 'prep' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day42_complete: {
    id: 'day42_complete',
    text: [
      'Шестая печать стихает.',
      'Старый стан вздрагивает, словно с его механизмов сняли огромный груз.',
      'Но слова незнакомца не уходят.',
      '«Ты ещё думаешь, что спасаешь сеть.»',
    ].join('\n'),
    choices: [{ id: 'map', label: 'К карте', nextNode: 'one_seal' }],
  },
  one_seal: {
    id: 'one_seal',
    text: [
      'Шестая печать стихает.',
      'Старый стан вздрагивает, словно с его механизмов сняли огромный груз.',
      'Но слова незнакомца не уходят.',
      '«Ты ещё думаешь, что спасаешь сеть.»',
      'Впереди осталась одна печать.',
      'И впервые ты не уверен, что именно ждёт тебя за ней.',
      'Шесть печатей молчат. Одна всё ещё зовёт.',
      'Осталось: 1',
    ].join('\n'),
    choices: [{ id: 'done', label: 'Отойти', nextNode: 'week6_complete' }],
  },
  week6_complete: {
    id: 'week6_complete',
    text: [
      'Шесть печатей молчат. Одна всё ещё зовёт.',
      'Осталось: 1',
      'Продолжение скоро.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
