import type { DialogueNode } from './dialogue-types';

export const WEEK3_NODES: Record<string, DialogueNode> = {
  day15_start: {
    id: 'day15_start',
    text: [
      'За низиной лес густеет. Корни лежат поперёк троп, как живые балки.',
      'Рем не идёт вперёд. Смотрит на старый деревянный маркер: тот же знак, что на печатях. Часть символа перечёркнута корнями.',
      '— Это не низина. Чаща держит что-то глубже. Не лезь сразу под свод.',
    ].join('\n'),
    choices: [
      { id: 'edge', label: 'К маркеру', command: 'WEEK3_ACT', commandPayload: { act: 'edge' } },
      { id: 'ask', label: 'Спросить Рема', nextNode: 'day15_rem' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day15_rem: {
    id: 'day15_rem',
    text: '— Печати не по одной живут. Я думал — замки. Теперь кажется — сеть. Кто ставил — не скажу. Не знаю.',
    choices: [
      { id: 'edge', label: 'К маркеру', command: 'WEEK3_ACT', commandPayload: { act: 'edge' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day15_complete: {
    id: 'day15_complete',
    text: [
      'Знак прочитан. Корни не растение. Они ведут.',
      'Рем: «Завтра завал. Топор, кирка или настил. Как умеешь.»',
    ].join('\n'),
    choices: [
      { id: 'day16', label: 'Начать День 16', command: 'BEGIN_DAY_16' },
      { id: 'edge', label: 'Ещё к чаще', command: 'WEEK3_ACT', commandPayload: { act: 'edge' } },
    ],
  },
  day16_start: {
    id: 'day16_start',
    text: [
      'Спутанная тропа. Корни и камень срослись.',
      'Три пути. Профессия облегчит. Без профессии — тоже пройдёшь, только дольше.',
    ].join('\n'),
    choices: [
      { id: 'tangle', label: 'К завалу', command: 'WEEK3_ACT', commandPayload: { act: 'tangle' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day16_complete: {
    id: 'day16_complete',
    text: 'Тропа дышит. Дальше — полая роща. Там уже не завал, а зубы.',
    choices: [
      { id: 'day17', label: 'Начать День 17', command: 'BEGIN_DAY_17' },
      { id: 'grove', label: 'К роще', command: 'WEEK3_ACT', commandPayload: { act: 'grove' } },
    ],
  },
  day17_start: {
    id: 'day17_start',
    text: [
      'Полая роща. Деревья внутри пустые. Ползуны по жилам, гончие из коры, жальцы капают смолой.',
      'Не бесконечная охота. След, шкура, волокно. Потом — яма.',
    ].join('\n'),
    choices: [
      { id: 'grove', label: 'В рощу', command: 'WEEK3_ACT', commandPayload: { act: 'grove' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day17_complete: {
    id: 'day17_complete',
    text: 'В яме — не зверь. Камень и дерево срослись узлом. Мира уже там, если веришь ей. Рем — если нет.',
    choices: [
      { id: 'day18', label: 'Начать День 18', command: 'BEGIN_DAY_18' },
      { id: 'grove', label: 'Ещё роща', command: 'WEEK3_ACT', commandPayload: { act: 'grove' } },
    ],
  },
  day18_start: {
    id: 'day18_start',
    text: [
      'Заброшенный узел. Не машина из другого мира. Древняя клетка Куболесья.',
      'На своде нити между знаками. Печатей несколько. Они связаны.',
    ].join('\n'),
    choices: [
      { id: 'mech', label: 'К узлу', command: 'WEEK3_ACT', commandPayload: { act: 'mechanism' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day18_complete: {
    id: 'day18_complete',
    text: 'Сеть есть. Кто ставил — молчит. Завтра припасы. Без еды и угля свод не пустит далеко.',
    choices: [
      { id: 'day19', label: 'Начать День 19', command: 'BEGIN_DAY_19' },
      { id: 'mech', label: 'Ещё к узлу', command: 'WEEK3_ACT', commandPayload: { act: 'mechanism' } },
    ],
  },
  day19_start: {
    id: 'day19_start',
    text: [
      'Глубокий проход просит запас: еда, брёвна, булыжник, уголь.',
      'Собери сам. Дворы, если есть. Рынок. Вел. Или попроси Рема и Миру — если они ещё отвечают.',
      'Рынок не обязателен. Дворы не обязательны.',
    ].join('\n'),
    choices: [
      { id: 'pack', label: 'К припасам', command: 'WEEK3_ACT', commandPayload: { act: 'supply' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day19_complete: {
    id: 'day19_complete',
    text: 'Запас собран. В яме плетёт что-то крупное. Не страж печати. Страж тропы.',
    choices: [
      { id: 'day20', label: 'Начать День 20', command: 'BEGIN_DAY_20' },
      { id: 'pit', label: 'К яме', command: 'WEEK3_ACT', commandPayload: { act: 'pit' } },
    ],
  },
  day20_start: {
    id: 'day20_start',
    text: [
      'Корнеплёт. Кора, живые корни, не печать.',
      'Лук, щит, настил, верёвка помогают. Без них — можно. Ретрай без потери вещей.',
    ].join('\n'),
    choices: [
      { id: 'boss', label: 'К Корнеплёту', command: 'WEEK3_ACT', commandPayload: { act: 'rootlasher' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day20_complete: {
    id: 'day20_complete',
    text: 'Сердцевина корня тёплая. Дальше — свод. Следы чужой группы на глине. Можно пройти тихо, договориться или вызвать на спор.',
    choices: [
      { id: 'day21', label: 'Начать День 21', command: 'BEGIN_DAY_21' },
      { id: 'social', label: 'Следы', command: 'WEEK3_ACT', commandPayload: { act: 'social' } },
    ],
  },
  day21_start: {
    id: 'day21_start',
    text: [
      'Глубокий свод. Третья печать втягивает не туман — почву.',
      'Вязень. Не Вензель. Не Туманный сторож. Корни вокруг ядра, как петли.',
    ].join('\n'),
    choices: [
      { id: 'prep', label: 'Подготовиться', command: 'WEEK3_ACT', commandPayload: { act: 'prep' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day21_complete: {
    id: 'day21_complete',
    text: [
      'Третья печать стихает.',
      'На миг кажется, что весь лес задержал дыхание.',
      'Где-то далеко отвечает другой глухой удар.',
      'Не один. Не два. Сеть всё ещё держится.',
    ].join('\n'),
    choices: [{ id: 'map', label: 'К карте', nextNode: 'four_seals' }],
  },
  four_seals: {
    id: 'four_seals',
    text: [
      'Три печати молчат. Четыре всё ещё зовут.',
      'Осталось: 4',
    ].join('\n'),
    choices: [{ id: 'done', label: 'Отойти', nextNode: 'week3_complete' }],
  },
  week3_complete: {
    id: 'week3_complete',
    text: [
      'Три печати молчат. Четыре всё ещё зовут.',
      'Осталось: 4',
      'Продолжение скоро.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
