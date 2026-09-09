import type { DialogueNode } from './dialogue-types';

export const WEEK5_NODES: Record<string, DialogueNode> = {
  day29_start: {
    id: 'day29_start',
    text: [
      'За гнилой тропой вода стоит чёрная. Деревья по пояс. Настил скрипит и проседает.',
      'Рем останавливается у старого столба сети. Знак четвёртой территории на месте. Стрелка к следующей печати стёрта.',
      '— Царапины свежие. Вода следы не держит. Это делали недавно.',
    ].join('\n'),
    choices: [
      { id: 'edge', label: 'К столбу', command: 'WEEK5_ACT', commandPayload: { act: 'edge' } },
      { id: 'ask', label: 'Спросить Рема', nextNode: 'day29_rem' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day29_rem: {
    id: 'day29_rem',
    text: '— Не древний рез. Дерево вокруг ещё светлое. Кто-то правил путь, пока мы шли сюда. Не спрашивай имя. Я не знаю.',
    choices: [
      { id: 'edge', label: 'К столбу', command: 'WEEK5_ACT', commandPayload: { act: 'edge' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day29_complete: {
    id: 'day29_complete',
    text: [
      'Столб прочитан. Кто-то меняет сеть прямо сейчас. Не след. Не старая правка. Свежая.',
      'Рем: «Дальше три переправы. Одна короче, если умеешь читать воду и дерево.»',
    ].join('\n'),
    choices: [
      { id: 'day30', label: 'Начать День 30', command: 'BEGIN_DAY_30' },
      { id: 'edge', label: 'Ещё к топи', command: 'WEEK5_ACT', commandPayload: { act: 'edge' } },
    ],
  },
  day30_start: {
    id: 'day30_start',
    text: [
      'Глубокая топь. Старый настил, каменные островки, камыш по грудь.',
      'Профессия подскажет. Без профессии — тоже выйдешь, только мокрее и голоднее.',
    ].join('\n'),
    choices: [
      { id: 'cross', label: 'К переправе', command: 'WEEK5_ACT', commandPayload: { act: 'cross' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day30_complete: {
    id: 'day30_complete',
    text: 'Переправа вывела к чаше камыша. Там уже не вода — зубы и ил.',
    choices: [
      { id: 'day31', label: 'Начать День 31', command: 'BEGIN_DAY_31' },
      { id: 'basin', label: 'К чаше', command: 'WEEK5_ACT', commandPayload: { act: 'basin' } },
    ],
  },
  day31_start: {
    id: 'day31_start',
    text: [
      'Чаша чёрного камыша. Камышники, топеклыки, илистые панцирники.',
      'Не бесконечная охота. Шкура, рыба, камыш. Потом — затопленный стан.',
    ].join('\n'),
    choices: [
      { id: 'basin', label: 'В чашу', command: 'WEEK5_ACT', commandPayload: { act: 'basin' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day31_complete: {
    id: 'day31_complete',
    text: 'Дальше крыша над водой. Старый промежуточный стан. Часть уже в топи.',
    choices: [
      { id: 'day32', label: 'Начать День 32', command: 'BEGIN_DAY_32' },
      { id: 'basin', label: 'Ещё чаша', command: 'WEEK5_ACT', commandPayload: { act: 'basin' } },
    ],
  },
  day32_start: {
    id: 'day32_start',
    text: [
      'Затопленный стан. На стене старая схема пути к пятой печати.',
      'Стрелка на схеме не совпадает со свежими метками в топи. Кто-то уводит путь.',
    ].join('\n'),
    choices: [
      { id: 'outpost', label: 'К стану', command: 'WEEK5_ACT', commandPayload: { act: 'outpost' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day32_complete: {
    id: 'day32_complete',
    text: 'Старый путь и новый не одно. Дальше под настилом дышит крупное. Не страж печати. Страж воды.',
    choices: [
      { id: 'day33', label: 'Начать День 33', command: 'BEGIN_DAY_33' },
      { id: 'outpost', label: 'Ещё к стану', command: 'WEEK5_ACT', commandPayload: { act: 'outpost' } },
    ],
  },
  day33_start: {
    id: 'day33_start',
    text: [
      'Топежор. Корни и ил в одной пасти. Живёт под настилом. Не страж печати.',
      'Лук, щит, связка, настил помогают. Без них — можно. Ретрай без потери вещей.',
    ].join('\n'),
    choices: [
      { id: 'boss', label: 'К Топежору', command: 'WEEK5_ACT', commandPayload: { act: 'miremaw' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day33_complete: {
    id: 'day33_complete',
    text: 'Сердце топи тёплое и чёрное. Дальше ориентир, который ты уже видел. Или думал, что видел.',
    choices: [
      { id: 'day34', label: 'Начать День 34', command: 'BEGIN_DAY_34' },
      { id: 'node', label: 'К знаку', command: 'WEEK5_ACT', commandPayload: { act: 'moving' } },
    ],
  },
  day34_start: {
    id: 'day34_start',
    text: [
      'Тот же столб. Утром линия уходила влево. Теперь вырезана вправо.',
      'Срез свежий. На древесине ещё светлая пыль. Кто-то был здесь, пока ты ходил.',
    ].join('\n'),
    choices: [
      { id: 'node', label: 'К знаку', command: 'WEEK5_ACT', commandPayload: { act: 'moving' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day34_complete: {
    id: 'day34_complete',
    text: 'Сеть правят на ходу. Не сломана. Перенастроена. Завтра свод. Пятая печать уже слышит шаг.',
    choices: [
      { id: 'day35', label: 'Начать День 35', command: 'BEGIN_DAY_35' },
      { id: 'prep', label: 'К своду', command: 'WEEK5_ACT', commandPayload: { act: 'prep' } },
    ],
  },
  day35_start: {
    id: 'day35_start',
    text: [
      'Затопленный свод. Пятая печать. Вода неподвижная, как глаз.',
      'Бездонник. Не Тленник. Не Вязень. Камень, корень и глубина вокруг ядра пути.',
    ].join('\n'),
    choices: [
      { id: 'prep', label: 'Подготовиться', command: 'WEEK5_ACT', commandPayload: { act: 'prep' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day35_complete: {
    id: 'day35_complete',
    text: [
      'Пятая печать стихает.',
      'Чёрная вода вокруг становится неподвижной.',
      'Но теперь ты уже знаешь: опаснее самой печати было другое.',
      'Кто-то прошёл здесь совсем недавно.',
      'Кто-то знает, как устроена сеть.',
      'И этот кто-то знает, что ты идёшь следом.',
    ].join('\n'),
    choices: [{ id: 'map', label: 'К карте', nextNode: 'two_seals' }],
  },
  two_seals: {
    id: 'two_seals',
    text: [
      'Пятая печать стихает.',
      'Чёрная вода вокруг становится неподвижной.',
      'Но теперь ты уже знаешь: опаснее самой печати было другое.',
      'Кто-то прошёл здесь совсем недавно.',
      'Кто-то знает, как устроена сеть.',
      'И этот кто-то знает, что ты идёшь следом.',
      'Пять печатей молчат. Две всё ещё зовут.',
      'Осталось: 2',
    ].join('\n'),
    choices: [{ id: 'done', label: 'Отойти', nextNode: 'week5_complete' }],
  },
  week5_complete: {
    id: 'week5_complete',
    text: [
      'Пять печатей молчат. Две всё ещё зовут.',
      'Осталось: 2',
      'Продолжение скоро.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
