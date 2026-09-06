import type { DialogueNode } from './dialogue-types';

export const DAY7_NODES: Record<string, DialogueNode> = {
  day7_start: {
    id: 'day7_start',
    text: [
      'Затвор кривой. Рем не спит.',
      '— Это не шахта. Я врал не словами — молчанием.',
      'Сейчас не исповедь. Сейчас — чтобы оно не вышло сюда. Бей то, что на петлях. Не лезь в щель.',
    ].join('\n'),
    choices: [
      { id: 'prep', label: 'Подготовиться', command: 'OPEN_MENU', commandPayload: { menu: 'prep' } },
      { id: 'look', label: 'Осмотреть Узел', command: 'EXPLORE' },
      { id: 'enter', label: 'К петлям', command: 'OPEN_MENU', commandPayload: { menu: 'prep' } },
    ],
  },
  wenzel_gate: {
    id: 'wenzel_gate',
    text: 'Вензель на петлях. Куб-замок, слишком много ног. Пластины с семёркой. Не то, что за решёткой — внешний страж.',
    choices: [
      { id: 'fight', label: 'Бить шарнир', command: 'START_PVE', commandPayload: { enemyId: 'wenzel_warden', move: 'hinge' } },
      { id: 'plate', label: 'Бить пластину', command: 'START_PVE', commandPayload: { enemyId: 'wenzel_warden', move: 'plate' } },
      { id: 'back', label: 'Отступить', command: 'OPEN_MENU', commandPayload: { menu: 'prep' } },
    ],
  },
  seven_seals: {
    id: 'seven_seals',
    text: [
      'За Вензелем — не шахта. Древняя дверь. Семь символов. Один горит. Тот же, что на жетоне.',
      'Рем, наконец:',
      '— Семь — не номер шахты. Это номер печати. Я думал, если молчать, она не услышит имя. Услышала всё равно.',
      'Пауза.',
      '— Осталось: 6.',
      'Продолжение скоро будет доступно.',
    ].join('\n'),
    choices: [
      { id: 'signs', label: 'Смотреть на знаки', nextNode: 'seven_seals_look' },
      { id: 'silent', label: 'Молчать', nextNode: 'week1_complete' },
    ],
  },
  seven_seals_look: {
    id: 'seven_seals_look',
    text: 'Шесть знаков тусклые. Один горит. За щелью — не Вензель. ??? смотрит. Имени нет.\nОсталось: 6.',
    choices: [{ id: 'done', label: 'Отойти', nextNode: 'week1_complete' }],
  },
  week1_complete: {
    id: 'week1_complete',
    text: [
      'Неделя закрыта. Затвор держит криво, но держит.',
      'Семь печатей. Одна задета. Осталось: 6.',
      '??? за решёткой не побеждён и не назван.',
      'Продолжение скоро будет доступно.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
