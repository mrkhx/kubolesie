import type { DialogueNode } from './dialogue-types';

export const WEEK4_NODES: Record<string, DialogueNode> = {
  day22_start: {
    id: 'day22_start',
    text: [
      'За чащей тропа чернеет. Деревья в тёмных прожилках. Следы зверей обрываются на полушаге.',
      'Рем останавливается у чёрной коры. На маркере тот же знак печатей — и поверх него свежий рез.',
      '— Это не рост. Кто-то резал после того, как печать уже стояла.',
    ].join('\n'),
    choices: [
      { id: 'edge', label: 'К маркеру', command: 'WEEK4_ACT', commandPayload: { act: 'edge' } },
      { id: 'ask', label: 'Спросить Рема', nextNode: 'day22_rem' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day22_rem: {
    id: 'day22_rem',
    text: '— Печати держат путь. Если знак правят — путь тоже правят. Не спрашивай, кто. Я не знаю. Знаю только: это не трещина.',
    choices: [
      { id: 'edge', label: 'К маркеру', command: 'WEEK4_ACT', commandPayload: { act: 'edge' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day22_complete: {
    id: 'day22_complete',
    text: [
      'Знак прочитан. Кто-то меняет сеть, не ломая её.',
      'Рем: «Дальше ложные следы. Три тропы. Одна короче, если умеешь читать.»',
    ].join('\n'),
    choices: [
      { id: 'day23', label: 'Начать День 23', command: 'BEGIN_DAY_23' },
      { id: 'edge', label: 'Ещё к тропе', command: 'WEEK4_ACT', commandPayload: { act: 'edge' } },
    ],
  },
  day23_start: {
    id: 'day23_start',
    text: [
      'Ложные следы. Звериная тропа, сухой овраг, старая настилка.',
      'Профессия подскажет. Без профессии — тоже выйдешь, только дольше и голоднее.',
    ].join('\n'),
    choices: [
      { id: 'false', label: 'К развилке', command: 'WEEK4_ACT', commandPayload: { act: 'false' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day23_complete: {
    id: 'day23_complete',
    text: 'Тропа вывела к низине. Там уже не следы — зубы и смола.',
    choices: [
      { id: 'day24', label: 'Начать День 24', command: 'BEGIN_DAY_24' },
      { id: 'hollow', label: 'К низине', command: 'WEEK4_ACT', commandPayload: { act: 'hollow' } },
    ],
  },
  day24_start: {
    id: 'day24_start',
    text: [
      'Гнилая низина. Почва проседает. Гнилуши, топники, короедники.',
      'Не бесконечная охота. Шкура, смола, трава. Потом — чужой лагерь, которого нет.',
    ].join('\n'),
    choices: [
      { id: 'hollow', label: 'В низину', command: 'WEEK4_ACT', commandPayload: { act: 'hollow' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day24_complete: {
    id: 'day24_complete',
    text: 'Дальше кострище без людей. Лагерь будто сняли с места. Все сразу.',
    choices: [
      { id: 'day25', label: 'Начать День 25', command: 'BEGIN_DAY_25' },
      { id: 'hollow', label: 'Ещё низина', command: 'WEEK4_ACT', commandPayload: { act: 'hollow' } },
    ],
  },
  day25_start: {
    id: 'day25_start',
    text: [
      'Пропавший лагерь. Кострище тёплое. Вещи на местах. Следов людей нет.',
      'Записка на коре: стрелка к печати перечёркнута. Рядом новый рез — тот же, что на маркере.',
    ].join('\n'),
    choices: [
      { id: 'camp4', label: 'К остаткам', command: 'WEEK4_ACT', commandPayload: { act: 'camp' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day25_complete: {
    id: 'day25_complete',
    text: 'Группа шла к печати и разом свернула. Дальше в кольце — не страж. Чёрная масса коры и корня.',
    choices: [
      { id: 'day26', label: 'Начать День 26', command: 'BEGIN_DAY_26' },
      { id: 'camp4', label: 'Ещё к лагерю', command: 'WEEK4_ACT', commandPayload: { act: 'camp' } },
    ],
  },
  day26_start: {
    id: 'day26_start',
    text: [
      'Чернокорень. Кора, гниль и живые корни в одной массе. Не страж печати. Страж кольца.',
      'Лук, щит, связка, настил помогают. Без них — можно. Ретрай без потери вещей.',
    ].join('\n'),
    choices: [
      { id: 'boss', label: 'К Чернокорню', command: 'WEEK4_ACT', commandPayload: { act: 'blackroot' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day26_complete: {
    id: 'day26_complete',
    text: 'Сердцевина тёплая и чёрная. Дальше поле знаков: старые линии и новые поверх. Кто-то правил сеть.',
    choices: [
      { id: 'day27', label: 'Начать День 27', command: 'BEGIN_DAY_27' },
      { id: 'node', label: 'К узлу', command: 'WEEK4_ACT', commandPayload: { act: 'warped' } },
    ],
  },
  day27_start: {
    id: 'day27_start',
    text: [
      'Искажённый узел. Старые нити сети. Поверх — свежий рез. Направление к четвёртой печати сдвинуто руками.',
      'Рем: «Это не трещина. Это правка.»',
    ].join('\n'),
    choices: [
      { id: 'node', label: 'К узлу', command: 'WEEK4_ACT', commandPayload: { act: 'warped' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day27_complete: {
    id: 'day27_complete',
    text: 'Сеть перенастроена. Не сломана. Завтра свод. Четвёртая печать уже слышит шаг.',
    choices: [
      { id: 'day28', label: 'Начать День 28', command: 'BEGIN_DAY_28' },
      { id: 'prep', label: 'К своду', command: 'WEEK4_ACT', commandPayload: { act: 'prep' } },
    ],
  },
  day28_start: {
    id: 'day28_start',
    text: [
      'Чёрный свод. Четвёртая печать. Почва пахнет тленом, не туманом.',
      'Тленник. Не Вязень. Не Корнеплёт. Масса гнили вокруг ядра пути.',
    ].join('\n'),
    choices: [
      { id: 'prep', label: 'Подготовиться', command: 'WEEK4_ACT', commandPayload: { act: 'prep' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day28_complete: {
    id: 'day28_complete',
    text: [
      'Четвёртая печать стихает.',
      'Но вместо тишины приходит другое ощущение.',
      'Путь позади кажется знакомым — и всё же ты точно знаешь: ещё вчера он шёл иначе.',
      'Кто-то трогает сеть. Не ломает. Не рвёт. Перестраивает.',
    ].join('\n'),
    choices: [{ id: 'map', label: 'К карте', nextNode: 'three_seals' }],
  },
  three_seals: {
    id: 'three_seals',
    text: [
      'Четыре печати молчат. Три всё ещё зовут.',
      'Осталось: 3',
    ].join('\n'),
    choices: [{ id: 'done', label: 'Отойти', nextNode: 'week4_complete' }],
  },
  week4_complete: {
    id: 'week4_complete',
    text: [
      'Четыре печати молчат. Три всё ещё зовут.',
      'Осталось: 3',
      'Продолжение скоро.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
