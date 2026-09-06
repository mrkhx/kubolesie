import type { DialogueNode } from './dialogue-types';

export const DAY4_NODES: Record<string, DialogueNode> = {
  day4_start: {
    id: 'day4_start',
    text: [
      'Рем у обломков глиняного короба.',
      '— Ты таскал мне сырую жилу. Для затвора хватает. Для тебя — нет.',
      'Восемь булыжников — печь. Уголь жжёт. Руда течёт.',
      'Потом решишь, что важнее: копать, рубить или резать. На всё не хватит.',
    ].join('\n'),
    choices: [
      { id: 'furnace', label: 'Скрафтить печь', command: 'OPEN_MENU', commandPayload: { menu: 'items' } },
      { id: 'craft', label: 'Крафт', command: 'OPEN_MENU', commandPayload: { menu: 'craft' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  scavenger_wounded: {
    id: 'scavenger_wounded',
    text: 'Каменный падальщик валится у сундука.\nСмола на боку. Дышит.',
    choices: [
      { id: 'help', label: 'Вычистить смолу и покормить', command: 'HELP_PET', commandPayload: { act: 'help' } },
      { id: 'shoo', label: 'Прогнать', command: 'HELP_PET', commandPayload: { act: 'reject' } },
      { id: 'leave', label: 'Оставить', command: 'HELP_PET', commandPayload: { act: 'leave' } },
    ],
  },
  emberkit_notice: {
    id: 'emberkit_notice',
    text: 'В обвале расселины — угольный зверёк. Искрик. Не падальщик.\nКирка и капля энергии — или оставить.',
    choices: [
      { id: 'rescue', label: 'Вытащить', command: 'HELP_PET', commandPayload: { act: 'rescue' } },
      { id: 'leave', label: 'Оставить', command: 'EXPLORE' },
    ],
  },
  day4_complete: {
    id: 'day4_complete',
    text: [
      'Первое железо легло в руку.',
      'Рем у карты: «Не один. Не спрашивай сколько.»',
      'Существует не один Узел.',
    ].join('\n'),
    choices: [
      { id: 'day5', label: 'Начать День 5', command: 'BEGIN_DAY_5' },
      { id: 'furnace', label: 'К печи', command: 'FURNACE_ACT', commandPayload: { act: 'open' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
};
