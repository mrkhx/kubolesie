import type { DialogueNode } from './dialogue-types';

export const WEEK2_NODES: Record<string, DialogueNode> = {
  day8_start: {
    id: 'day8_start',
    text: [
      'Туман впервые стоит у кольев стана. Холодный. Пахнет сырой глиной, не дымом.',
      'Рем не смотрит на Узел. Смотрит вниз, где лес проседает.',
      '— После того, у печати, вода в низинах поднялась. Старые звери уходят. Ночью слышал гул. Не шахта. Ниже.',
    ].join('\n'),
    choices: [
      { id: 'border', label: 'К кромке тумана', command: 'WEEK2_ACT', commandPayload: { act: 'border' } },
      { id: 'ask', label: 'Спросить про гул', nextNode: 'day8_rem' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day8_rem: {
    id: 'day8_rem',
    text: '— След низины. Не лезь сразу к печати. Сначала пойми, чем кормить стан. Добыча кончается. Грядка — нет.',
    choices: [
      { id: 'border', label: 'К кромке тумана', command: 'WEEK2_ACT', commandPayload: { act: 'border' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day8_complete: {
    id: 'day8_complete',
    text: [
      'В тумане — далёкий огонёк. Движется против ветра.',
      'Рем: «Завтра грядка. Семена не для кармана.»',
    ].join('\n'),
    choices: [
      { id: 'day9', label: 'Начать День 9', command: 'BEGIN_DAY_9' },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day9_start: {
    id: 'day9_start',
    text: [
      'Рем чертит квадрат у костра.',
      '— Мотыга. Грядка. Семена. Не ферма на три поля. Одна клетка, чтобы не голодать.',
    ].join('\n'),
    choices: [
      { id: 'farm', label: 'К грядке', command: 'FARM_ACT', commandPayload: { act: 'open' } },
      { id: 'craft', label: 'Мотыга', command: 'OPEN_MENU', commandPayload: { menu: 'tools' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day9_complete: {
    id: 'day9_complete',
    text: [
      'На грядке — странная белая нить. Не паутина. Тянется к низине.',
      'Рем не трогает. — Это не наше. Но след ясный.',
    ].join('\n'),
    choices: [
      { id: 'day10', label: 'Начать День 10', command: 'BEGIN_DAY_10' },
      { id: 'farm', label: 'Грядка', command: 'FARM_ACT', commandPayload: { act: 'open' } },
    ],
  },
  day10_start: {
    id: 'day10_start',
    text: [
      'Нить ведёт в низину. Вода по щиколотку. Камыш щёлкает, как зубы.',
      'Рем: «Если найдёшь нить живую — можно лук. Можно и ножом. Низина не спрашивает.»',
    ].join('\n'),
    choices: [
      { id: 'lowland', label: 'В низину', command: 'WEEK2_ACT', commandPayload: { act: 'lowland' } },
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
    ],
  },
  day10_complete: {
    id: 'day10_complete',
    text: 'Нить есть. Лук — если хватит рук и палок. Завтра вода станет дороже земли.',
    choices: [
      { id: 'day11', label: 'Начать День 11', command: 'BEGIN_DAY_11' },
      { id: 'lowland', label: 'Ещё в низину', command: 'WEEK2_ACT', commandPayload: { act: 'lowland' } },
    ],
  },
  day11_start: {
    id: 'day11_start',
    text: [
      'Проходы низины затоплены по пояс. Дальше — нет, если не убрать воду.',
      'Ведро: три слитка. Не океан. Один проход, одна грядка, один короткий путь.',
    ].join('\n'),
    choices: [
      { id: 'lowland', label: 'В низину', command: 'WEEK2_ACT', commandPayload: { act: 'lowland' } },
      { id: 'craft', label: 'Ведро', command: 'OPEN_MENU', commandPayload: { menu: 'items' } },
      { id: 'iron', label: 'За рудой', command: 'DIALOGUE_CHOICE', commandPayload: { nodeId: 'day11_iron', choiceId: 'go' } },
    ],
  },
  day11_iron: {
    id: 'day11_iron',
    text: 'Штольня на месте. Каменная или железная кирка. Печь. Слитки. Ведро не выпросить у тумана.',
    choices: [
      { id: 'go', label: 'К штольне', command: 'EXPLORE' },
      { id: 'back', label: 'Назад', command: 'WEEK2_ACT', commandPayload: { act: 'lowland' } },
    ],
  },
  day11_mira: {
    id: 'day11_mira',
    text: [
      'Женщина в промасленном плаще стоит на кочке. Не Рем. Не Яра.',
      '— Мира. Ищу, откуда туман. Не из легенд — из воды и камня.',
      'Смотрит на тебя. — Ты был у первой печати. Видно по тому, как туман тебя обходит.',
    ].join('\n'),
    choices: [
      { id: 'help', label: 'Помочь', command: 'WEEK2_ACT', commandPayload: { act: 'mira_help' } },
      { id: 'careful', label: 'Держаться настороженно', command: 'WEEK2_ACT', commandPayload: { act: 'mira_cautious' } },
      { id: 'hide', label: 'Скрыть печать', command: 'WEEK2_ACT', commandPayload: { act: 'mira_hide' } },
    ],
  },
  day11_complete: {
    id: 'day11_complete',
    text: 'Мира кивает на старый карьер. — Там символ. Не Смольник. Ниже. Завтра — если жив.',
    choices: [
      { id: 'day12', label: 'Начать День 12', command: 'BEGIN_DAY_12' },
      { id: 'mira', label: 'К Мире', command: 'TALK_NPC', commandPayload: { npcId: 'mira' } },
    ],
  },
  day12_start: {
    id: 'day12_start',
    text: [
      'Утонувший карьер. Не клин. Берег, затопленный проход, выработка, нижняя камера.',
      'Мира: «Смольник здесь живёт по краю. К печати не ходит. Запомни.»',
    ].join('\n'),
    choices: [
      { id: 'quarry', label: 'В карьер', command: 'WEEK2_ACT', commandPayload: { act: 'quarry' } },
      { id: 'path', label: 'Спросить путь', nextNode: 'day12_path' },
    ],
  },
  day12_path: {
    id: 'day12_path',
    text: 'Мира чертит палкой: берег, вода, выработка, камера. Короткий путь — под водой. Редко, опасно.',
    choices: [
      { id: 'danger', label: 'Идти опасным', command: 'WEEK2_ACT', commandPayload: { act: 'mira_danger' } },
      { id: 'safe', label: 'Безопасный путь', command: 'WEEK2_ACT', commandPayload: { act: 'mira_safe' } },
    ],
  },
  day12_complete: {
    id: 'day12_complete',
    text: [
      'В нижней камере — символ Второй печати. Тот же род, что семёрка. Путь дальше закрыт камнем и водой.',
      'Мира тихо: «Это не источник. Это замок.»',
    ].join('\n'),
    choices: [
      { id: 'day13', label: 'Начать День 13', command: 'BEGIN_DAY_13' },
      { id: 'quarry', label: 'Карьер ещё', command: 'WEEK2_ACT', commandPayload: { act: 'quarry' } },
    ],
  },
  day13_start: {
    id: 'day13_start',
    text: [
      'Смольник — смола и корни размером с сарай. Не хранитель. Региональный зверь, который сам держится от центра.',
      'Лук бьёт смолу издалека. Щит держит тяжёлый удар. Без них — дольше, но можно.',
    ].join('\n'),
    choices: [
      { id: 'fight', label: 'К Смольнику', command: 'WEEK2_ACT', commandPayload: { act: 'smolnik' } },
      { id: 'shield', label: 'Щит', command: 'OPEN_MENU', commandPayload: { menu: 'items' } },
      { id: 'back', label: 'К карьеру', command: 'WEEK2_ACT', commandPayload: { act: 'quarry' } },
    ],
  },
  day13_complete: {
    id: 'day13_complete',
    text: [
      'Смольник пал. Сердцевина топи тяжёлая, тёплая.',
      'Мира смотрит не на трофей — на следы. — Он убегал от центра. Туман не он. Завтра — впадина.',
    ].join('\n'),
    choices: [
      { id: 'day14', label: 'Начать День 14', command: 'BEGIN_DAY_14' },
      { id: 'core', label: 'Сердцевина', command: 'WEEK2_ACT', commandPayload: { act: 'open' } },
    ],
  },
  day14_start: {
    id: 'day14_start',
    text: [
      'Глубокая впадина. Туман не выходит — втягивается внутрь, в щель печати.',
      'Мира: «Печать не источник. Она держит то, что глубже. Внешний страж — из мокрого камня, корней и ржавых скоб. Ядро — туман.»',
    ].join('\n'),
    choices: [
      { id: 'seal', label: 'К печати', command: 'WEEK2_ACT', commandPayload: { act: 'seal' } },
      { id: 'prep', label: 'Подготовиться', command: 'WEEK2_ACT', commandPayload: { act: 'prep' } },
    ],
  },
  week2_complete: {
    id: 'week2_complete',
    text: [
      'Две печати молчат.',
      'Пять всё ещё зовут.',
      'Осталось: 5.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
  five_seals: {
    id: 'five_seals',
    text: [
      'Мира кладёт ладонь на остывший символ. Линии складываются в карту.',
      'Две точки погасли. Пять горят.',
      '— Две печати молчат. Пять всё ещё зовут.',
      'Осталось: 5.',
    ].join('\n'),
    choices: [
      { id: 'done', label: 'Отойти', nextNode: 'week2_complete' },
    ],
  },
};
