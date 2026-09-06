import type { DialogueNode } from './dialogue-types';

export const DAY6_NODES: Record<string, DialogueNode> = {
  day6_start: {
    id: 'day6_start',
    text: [
      'На осыпи — чужая вешка. Записка:',
      '«Осыпь не Рема. Кто копает — делится или уходит. — Я.»',
      'Рем: «Не лезь в живую драку. Оставь ответ на вешке. Они ответят, когда тебя нет.»',
    ].join('\n'),
    choices: [
      { id: 'pvp', label: 'Вызвать след', command: 'START_PVP' },
      { id: 'tribute', label: 'Снести дань', command: 'OPEN_MENU', commandPayload: { menu: 'pvp' } },
      { id: 'rem', label: 'Спросить Рема', command: 'TALK_NPC', commandPayload: { npcId: 'rem' } },
    ],
  },
  yara_edge: {
    id: 'yara_edge',
    text: 'Край стана Яры. Колья. Никого. След отвечает без живого лица.',
    choices: [
      { id: 'pvp', label: 'Вызвать след', command: 'START_PVP' },
      { id: 'back', label: 'К осыпи', command: 'OPEN_MENU', commandPayload: { menu: 'pvp' } },
    ],
  },
  day6_complete: {
    id: 'day6_complete',
    text: [
      'Крик металла с Узла 7. Цепь. Рем бежит. Затвор садится криво.',
      'Из щели — тот же запах, что в День 1, сильнее.',
      '— Не держит. Собирай, что есть. Завтра не урок. Завтра — дверь.',
    ].join('\n'),
    choices: [
      { id: 'day7', label: 'Начать День 7', command: 'BEGIN_DAY_7' },
      { id: 'camp', label: 'Собрать всё', command: 'OPEN_CAMP' },
    ],
  },
};
