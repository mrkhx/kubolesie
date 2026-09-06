import type { DialogueNode } from './dialogue-types';

export const DAY5_NODES: Record<string, DialogueNode> = {
  day5_start: {
    id: 'day5_start',
    text: [
      'К стану приходит Вел: куб-рюкзак, весы, запах пыли дорог.',
      '— Живые. Хорошо. Покупаю лишнее. Продаю нужное.',
      'Сегодня — стёкла и один странный клинок. Завтра клинок уйдёт в другой клин.',
    ].join('\n'),
    choices: [
      { id: 'trade', label: 'Торговать', command: 'TRADE_ACT', commandPayload: { act: 'open' } },
      { id: 'ask', label: 'Спросить про символы', nextNode: 'vel_symbols' },
      { id: 'leave', label: 'Позже', command: 'OPEN_CAMP' },
    ],
  },
  vel_symbols: {
    id: 'vel_symbols',
    text: '— Ваши семёрки я видел на камнях далеко отсюда. Не одна дорога. Не один замок. Я не носильщик тайн Рема — я носильщик груза.',
    choices: [
      { id: 'trade', label: 'К весам', command: 'TRADE_ACT', commandPayload: { act: 'open' } },
      { id: 'back', label: 'Отойти', command: 'OPEN_CAMP' },
    ],
  },
  vel_token: {
    id: 'vel_token',
    text: 'Вел крутит жетон. — Дорого. Рем этого не увидит. Или увидит.\nПродажа не отменяет активацию Узла. Но Рем похолодеет.',
    choices: [
      { id: 'sell', label: 'Продать жетон', command: 'TRADE_ACT', commandPayload: { act: 'sell_token' } },
      { id: 'keep', label: 'Оставить', command: 'TRADE_ACT', commandPayload: { act: 'open' } },
    ],
  },
  day5_complete: {
    id: 'day5_complete',
    text: [
      'Вел, уходя: «Груз с теми знаками тяжёлый.»',
      'Символы есть далеко от лагеря.',
    ].join('\n'),
    choices: [
      { id: 'day6', label: 'Начать День 6', command: 'BEGIN_DAY_6' },
      { id: 'trade', label: 'К Велу', command: 'TRADE_ACT', commandPayload: { act: 'open' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
};
