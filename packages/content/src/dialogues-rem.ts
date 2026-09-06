import type { DialogueNode } from './dialogue-types';

export const REM_NODES: Record<string, DialogueNode> = {
  rem_gate: {
    id: 'rem_gate',
    text: [
      'У старого затвора шахты работает человек в заплатанной куртке.',
      'Он видит жетон — и замирает.',
      '— Ты его уже активировал?.. Ладно. Помоги закрыть. Сейчас не до разговоров.',
    ].join('\n'),
    choices: [
      { id: 'stones', label: 'Завалить дверь камнями', nextNode: 'rem_help_stones' },
      { id: 'boards', label: 'Укрепить досками', nextNode: 'rem_help_boards' },
      { id: 'mech', label: 'Запустить старый механизм', nextNode: 'rem_mechanism_1' },
      { id: 'ask', label: 'Спросить, что внутри', nextNode: 'rem_help_ask' },
    ],
  },
  rem_help_ask: {
    id: 'rem_help_ask',
    text: '— Не твоё дело, — Рем не поднимает глаз. — Помоги закрыть. Потом поговорим.',
    choices: [
      { id: 'stones', label: 'Завалить дверь камнями', nextNode: 'rem_help_stones' },
      { id: 'boards', label: 'Укрепить досками', nextNode: 'rem_help_boards' },
      { id: 'mech', label: 'Запустить старый механизм', nextNode: 'rem_mechanism_1' },
    ],
  },
  rem_help_stones: {
    id: 'rem_help_stones',
    text: 'Вы заваливаете проём камнями. Рем добивает клином. Цепь стонет — и затвор садится.',
    choices: [{ id: 'next', label: 'Смотреть на решётку', nextNode: 'rem_gate_closed' }],
  },
  rem_help_boards: {
    id: 'rem_help_boards',
    text: 'Доски Рема, твои руки. Затвор скрипит и встаёт на место.',
    choices: [{ id: 'next', label: 'Смотреть на решётку', nextNode: 'rem_gate_closed' }],
  },
  rem_mechanism_1: {
    id: 'rem_mechanism_1',
    text: 'Ржавая лебёдка. Рычаг тяжёлый, цепь слиплась. Рем кивает: — Держи. Я поставлю клин.',
    choices: [{ id: 'pull', label: 'Потянуть рычаг', nextNode: 'rem_mechanism_2' }],
  },
  rem_mechanism_2: {
    id: 'rem_mechanism_2',
    text: 'Цепь срывается и встаёт. Затвор падает с гулом, от которого ноет зуб. Механизм сделал своё.',
    choices: [{ id: 'next', label: 'Смотреть на решётку', nextNode: 'rem_gate_closed' }],
  },
  rem_gate_closed: {
    id: 'rem_gate_closed',
    text: [
      'За решёткой шевелится что-то большое. Слишком много ног. Имени у этого нет.',
      'Рем отступает на шаг.',
      '— Сначала верстак. Деревянной киркой возьмёшь булыжник на осыпи. Потом каменную. Мне нужно железо. Восемь жил. Иначе это снова откроется.',
    ].join('\n'),
    choices: [
      {
        id: 'accept',
        label: 'Кивнуть',
        nextNode: 'rem_camp',
        actions: [
          { type: 'set_flag', flag: 'met_rem', value: '1' },
          { type: 'set_flag', flag: 'node7_gate_closed', value: '1' },
          { type: 'set_flag', flag: 'visited_node_7', value: '1' },
          { type: 'set_discovery', discoveryId: 'unknown_node7_creature', title: '???' },
          { type: 'start_quest', questId: 'iron_for_gate' },
          { type: 'set_location', locationId: 'rem_camp' },
          { type: 'visit', locationId: 'rem_camp' },
        ],
      },
    ],
  },
  rem_camp: {
    id: 'rem_camp',
    text: 'Лагерь Рема. Костёр, навес, запах смолы. Рем точит клин и не смотрит на жетон — пока ты сам не решишь.',
    choices: [
      {
        id: 'show',
        label: 'Показать жетон',
        nextNode: 'rem_show_token',
        condition: [
          { type: 'flag', flag: 'found_rusty_token', exists: true },
          { type: 'flag', flag: 'showed_token_to_rem', exists: false },
          { type: 'flag', flag: 'hid_token_from_rem', exists: false },
        ],
      },
      {
        id: 'hide',
        label: 'Скрыть жетон',
        nextNode: 'rem_hide_token',
        condition: [
          { type: 'flag', flag: 'found_rusty_token', exists: true },
          { type: 'flag', flag: 'showed_token_to_rem', exists: false },
          { type: 'flag', flag: 'hid_token_from_rem', exists: false },
        ],
      },
      {
        id: 'scree',
        label: 'Идти на каменную осыпь',
        nextNode: 'stone_scree',
        condition: { type: 'quest', questId: 'iron_for_gate', statuses: ['ACTIVE'] },
        actions: [{ type: 'set_location', locationId: 'stone_scree' }, { type: 'visit', locationId: 'stone_scree' }],
      },
      {
        id: 'adit',
        label: 'К старой штольне',
        nextNode: 'old_adit',
        condition: [
          { type: 'item', templateId: 'stone_pickaxe' },
          { type: 'quest', questId: 'iron_for_gate', statuses: ['ACTIVE'] },
        ],
        actions: [{ type: 'set_location', locationId: 'old_adit' }, { type: 'visit', locationId: 'old_adit' }],
      },
      {
        id: 'return_iron',
        label: 'Отдать железо',
        command: 'RETURN_IRON',
        condition: { type: 'resource', resource: 'IRON_ORE', min: 8 },
      },
      {
        id: 'night_rem',
        label: 'Остаться на ночь у Рема',
        command: 'REST_NIGHT',
        commandPayload: { place: 'rem' },
        condition: { type: 'quest', questId: 'iron_for_gate', statuses: ['CLAIMED'] },
      },
      {
        id: 'night_shelter',
        label: 'Вернуться в своё укрытие',
        command: 'REST_NIGHT',
        commandPayload: { place: 'shelter' },
        condition: [
          { type: 'quest', questId: 'iron_for_gate', statuses: ['CLAIMED'] },
          { type: 'flag', flag: 'temporary_shelter_level', exists: true },
        ],
      },
      { id: 'gather', label: 'Рубить дерево', command: 'GATHER_WOOD' },
      { id: 'camp', label: 'Крафт / запасы', command: 'OPEN_CAMP' },
      { id: 'inv', label: 'Инвентарь', command: 'OPEN_INVENTORY' },
      {
        id: 'forest',
        label: 'На опушку',
        nextNode: 'forest_hub',
        actions: [{ type: 'set_location', locationId: 'forest_clearing' }],
      },
    ],
  },
  rem_show_token: {
    id: 'rem_show_token',
    text: 'Рем берёт жетон двумя пальцами, как горячий уголь. Кивает коротко. Больше ничего не говорит.',
    choices: [
      {
        id: 'back',
        label: 'Отойти к костру',
        nextNode: 'rem_camp',
        actions: [
          { type: 'set_flag', flag: 'showed_token_to_rem', value: '1' },
          { type: 'set_relation', npcId: 'rem', trustDelta: 1 },
        ],
      },
    ],
  },
  rem_hide_token: {
    id: 'rem_hide_token',
    text: 'Ты прячешь кулак. Рем это видит — и делает вид, что нет. Воздух становится чуть холоднее.',
    choices: [
      {
        id: 'back',
        label: 'Отойти к костру',
        nextNode: 'rem_camp',
        actions: [
          { type: 'set_flag', flag: 'hid_token_from_rem', value: '1' },
          { type: 'set_relation', npcId: 'rem', trustDelta: -1 },
        ],
      },
    ],
  },
  rem_quest_done: {
    id: 'rem_quest_done',
    text: 'Рем принимает ровно восемь жил. Остальное оставляет тебе. — Хватит до утра. Спи, где хочешь.',
    choices: [
      {
        id: 'night_rem',
        label: 'Остаться в лагере Рема',
        command: 'REST_NIGHT',
        commandPayload: { place: 'rem' },
      },
      {
        id: 'night_shelter',
        label: 'Вернуться в своё укрытие',
        command: 'REST_NIGHT',
        commandPayload: { place: 'shelter' },
        condition: { type: 'flag', flag: 'temporary_shelter_level', exists: true },
      },
    ],
  },
};
