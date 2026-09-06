import type { DialogueNode } from './dialogue-types';

export const NIGHT_NODES: Record<string, DialogueNode> = {
  night_rem: {
    id: 'night_rem',
    text: 'Ты ложишься у костра. Сквозь дрёму слышно, как Рем говорит с кем-то, кого не видно:\n«Нет. Он пока ничего не знает.»',
    choices: [
      {
        id: 'listen',
        label: 'Подслушать',
        nextNode: 'night_rem_eavesdrop',
      },
      {
        id: 'sleep',
        label: 'Сделать вид, что спишь',
        nextNode: 'night_rem_sleep',
      },
    ],
  },
  night_rem_eavesdrop: {
    id: 'night_rem_eavesdrop',
    text: 'Тишина. Только угли. Имя не называют. Ты запоминаешь фразу — и больше ничего.',
    choices: [
      {
        id: 'dawn',
        label: 'Дождаться утра',
        nextNode: 'day1_complete',
        actions: [
          { type: 'set_flag', flag: 'night_eavesdropped', value: '1' },
          { type: 'set_flag', flag: 'slept_at_rem', value: '1' },
        ],
      },
    ],
  },
  night_rem_sleep: {
    id: 'night_rem_sleep',
    text: 'Ты дышишь ровно. Разговор обрывается. Утро приходит без объяснений.',
    choices: [
      {
        id: 'dawn',
        label: 'Дождаться утра',
        nextNode: 'day1_complete',
        actions: [
          { type: 'set_flag', flag: 'night_pretended_sleep', value: '1' },
          { type: 'set_flag', flag: 'slept_at_rem', value: '1' },
        ],
      },
    ],
  },
  night_shelter: {
    id: 'night_shelter',
    text: 'Временное укрытие скрипит, но держит ветер. Где-то в осыпи кто-то шуршит камнями.',
    choices: [
      {
        id: 'dawn',
        label: 'Дождаться утра',
        nextNode: 'day1_complete',
        actions: [{ type: 'set_flag', flag: 'slept_at_shelter', value: '1' }],
      },
    ],
  },
  night_shelter_gift: {
    id: 'night_shelter_gift',
    text: 'Утром у входа лежит блестящий камень. Никто не объясняет, откуда он. Падальщик вчера ел твой сухарь.',
    choices: [
      {
        id: 'dawn',
        label: 'Взять камень и встретить утро',
        nextNode: 'day1_complete',
        actions: [{ type: 'set_flag', flag: 'slept_at_shelter', value: '1' }],
      },
    ],
  },
  day1_complete: {
    id: 'day1_complete',
    text: [
      '🌅 Первый день окончен.',
      'Ты пережил первую ночь.',
      'Но под землёй что-то проснулось.',
      'И Рем явно знает об Узле 7 гораздо больше, чем говорит.',
    ].join('\n'),
    choices: [
      {
        id: 'day2',
        label: 'Начать День 2',
        command: 'BEGIN_DAY_2',
      },
    ],
  },
  day2_locked: {
    id: 'day2_locked',
    text: 'Продолжение скоро будет доступно.',
    choices: [{ id: 'hub', label: 'Оглядеться', command: 'EXPLORE' }],
  },
};
