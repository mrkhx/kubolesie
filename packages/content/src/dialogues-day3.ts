import type { DialogueNode } from './dialogue-types';

export const DAY3_NODES: Record<string, DialogueNode> = {
  day3_start: {
    id: 'day3_start',
    text: [
      'Утро. Следы с гребня ведут в хвою.',
      'Рем: «Пнеклык там живёт давно. Не геройствуй в первый раз. Возьми палку острее ножа.»',
      'Каменный меч: 2 булыжника + 1 палка. Не кирка.',
    ].join('\n'),
    choices: [
      { id: 'wedge', label: 'К Сизый клин', command: 'OPEN_MENU', commandPayload: { menu: 'wedge' } },
      { id: 'sword', label: 'Скрафтить каменный меч', command: 'OPEN_MENU', commandPayload: { menu: 'weapons' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  wedge_edge: {
    id: 'wedge_edge',
    text: 'Сизый клин. Хвоя кубами. Смола пахнет железом.\nНа входе три зарубки — чужие ежедневные метки.\nРем: не геройствуй в первый раз.',
    choices: [
      { id: 'path', label: 'На тропу', command: 'START_PVE', commandPayload: { enemyId: 'moss_boar' } },
      { id: 'daily', label: 'Ежедневки', command: 'OPEN_MENU', commandPayload: { menu: 'daily' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  stumpfang_gate: {
    id: 'stumpfang_gate',
    text: 'Пень раскрывается клыками. Корни шарят по кубам.\nМожно бить. Можно уйти — он не гонится за гребень.',
    choices: [
      { id: 'fight', label: 'Атаковать Пнеклыка', command: 'START_PVE', commandPayload: { enemyId: 'stumpfang' } },
      {
        id: 'torch',
        label: 'Поджечь смолу факелом',
        command: 'START_PVE',
        commandPayload: { enemyId: 'stumpfang', torch: true },
        condition: { type: 'item', templateId: 'torch' },
      },
      { id: 'back', label: 'Отступить', command: 'OPEN_MENU', commandPayload: { menu: 'wedge' } },
    ],
  },
  day3_complete: {
    id: 'day3_complete',
    text: [
      'На фрагменте: семёрка и ещё одна метка в стороне.',
      'Рем смотрит дольше, чем нужно. «Это не схема шахты.» Молчит.',
      'Символ Узла 7 связан с чем-то ещё.',
    ].join('\n'),
    choices: [
      { id: 'day4', label: 'Начать День 4', command: 'BEGIN_DAY_4' },
      { id: 'wedge', label: 'К клину', command: 'OPEN_MENU', commandPayload: { menu: 'wedge' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
};
