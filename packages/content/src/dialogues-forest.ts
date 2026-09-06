import type { DialogueNode } from './dialogue-types';

export const FOREST_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    text: [
      'Ты приходишь в себя на холодной земле.',
      'Вокруг — густой кубический лес.',
      'Между деревьями уже темнеет.',
      'Рядом валяется разбитый деревянный ящик,',
      'а чуть дальше виден дым —',
      'похоже, там когда-то был чей-то лагерь.',
      'Из кустов справа доносится шорох.',
    ].join('\n'),
    choices: [
      { id: 'open_crate', label: 'Осмотреть разбитый ящик', command: 'OPEN_CRATE' },
      {
        id: 'go_smoke_early',
        label: 'Пойти к дыму',
        nextNode: 'abandoned_camp',
        condition: { type: 'flag', flag: 'activated_node7_token', exists: false },
        actions: [
          { type: 'set_location', locationId: 'forest_clearing' },
          { type: 'visit', locationId: 'forest_clearing' },
        ],
      },
      {
        id: 'go_smoke_token',
        label: 'Пойти к дыму',
        nextNode: 'rem_gate',
        condition: { type: 'flag', flag: 'activated_node7_token', exists: true },
        actions: [
          { type: 'set_location', locationId: 'node_7' },
          { type: 'visit', locationId: 'node_7' },
        ],
      },
      { id: 'check_bushes', label: 'Проверить кусты', nextNode: 'check_bushes' },
    ],
  },
  forest_hub: {
    id: 'forest_hub',
    text: 'Опушка. Ящик, кусты, дым вдалеке. Скоро совсем стемнеет.',
    choices: [
      {
        id: 'crate',
        label: 'Осмотреть ящик',
        command: 'OPEN_CRATE',
        condition: { type: 'flag', flag: 'opened_start_crate', exists: false },
      },
      {
        id: 'bushes',
        label: 'К кустам',
        nextNode: 'check_bushes',
        condition: { type: 'flag', flag: 'defeated_wild_shrew', exists: false },
      },
      { id: 'gather', label: 'Рубить дерево', command: 'GATHER_WOOD' },
      {
        id: 'shelter',
        label: 'Собрать временное укрытие',
        command: 'BUILD_TEMP_SHELTER',
        condition: { type: 'flag', flag: 'temporary_shelter_level', exists: false },
      },
      {
        id: 'token',
        label: 'Осмотреть жетон',
        command: 'INSPECT_TOKEN',
        condition: { type: 'item', templateId: 'rusty_token' },
      },
      {
        id: 'smoke',
        label: 'К дыму',
        nextNode: 'abandoned_camp',
        condition: { type: 'flag', flag: 'activated_node7_token', exists: false },
      },
      {
        id: 'to_rem_gate',
        label: 'К дыму / Узлу 7',
        nextNode: 'rem_gate',
        condition: [
          { type: 'flag', flag: 'activated_node7_token', exists: true },
          { type: 'flag', flag: 'node7_gate_closed', exists: false },
        ],
        actions: [{ type: 'set_location', locationId: 'node_7' }, { type: 'visit', locationId: 'node_7' }],
      },
      {
        id: 'to_rem',
        label: 'В лагерь Рема',
        command: 'TALK_NPC',
        commandPayload: { npcId: 'rem' },
        condition: { type: 'flag', flag: 'met_rem', exists: true },
      },
      { id: 'inv', label: 'Инвентарь', command: 'OPEN_INVENTORY' },
      { id: 'camp', label: 'Лагерь / крафт', command: 'OPEN_CAMP' },
    ],
  },
  check_bushes: {
    id: 'check_bushes',
    text: 'Кусты дрожат. Между стеблями мелькает тварь — дикая землеройка. Бой не обязателен.',
    choices: [
      {
        id: 'fight',
        label: 'Схватить ветку и драться',
        command: 'START_PVE',
        commandPayload: { enemyId: 'wild_shrew' },
      },
      {
        id: 'flee',
        label: 'Отступить к ящику',
        nextNode: 'bushes_flee',
        actions: [{ type: 'spend_energy', amount: 1 }],
      },
      { id: 'distract', label: 'Попробовать отвлечь', nextNode: 'bushes_distract' },
      {
        id: 'food',
        label: 'Бросить еду',
        nextNode: 'bushes_food',
        actions: [{ type: 'consume_item', templateId: 'dry_rusk', elseNode: 'bushes_food', thenNode: 'bushes_distract' }],
      },
      { id: 'back', label: 'Отойти', nextNode: 'forest_hub' },
    ],
  },
  bushes_flee: {
    id: 'bushes_flee',
    text: 'Ты отступаешь к ящику. Землеройка не гонится. Чуть сбилось дыхание.',
    choices: [
      { id: 'crate', label: 'Осмотреть ящик', command: 'OPEN_CRATE' },
      { id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' },
    ],
  },
  bushes_distract: {
    id: 'bushes_distract',
    text: 'Ты швыряешь камень в сторону. Тварь срывается в чащу. Живая — и ты тоже.',
    choices: [{ id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' }],
  },
  bushes_food: {
    id: 'bushes_food',
    text: 'Ты хлопаешь себя по карманам. Еды нет. Землеройка смотрит с осуждением. Почти по-человечески.',
    choices: [
      {
        id: 'fight',
        label: 'Схватить ветку и драться',
        command: 'START_PVE',
        commandPayload: { enemyId: 'wild_shrew' },
      },
      { id: 'flee', label: 'Отступить к ящику', nextNode: 'bushes_flee' },
      { id: 'distract', label: 'Попробовать отвлечь', nextNode: 'bushes_distract' },
    ],
  },
  open_crate: {
    id: 'open_crate',
    text: 'В ящике — два бревна, сухарь и каменный нож. На рукояти выцарапан странный знак.',
    choices: [
      { id: 'knife', label: 'Осмотреть нож', nextNode: 'inspect_knife' },
      { id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' },
      { id: 'gather', label: 'Рубить дерево', command: 'GATHER_WOOD' },
    ],
  },
  open_crate_empty: {
    id: 'open_crate_empty',
    text: 'Ящик пуст. Ты уже забрал всё, что можно было унести.',
    choices: [{ id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' }],
  },
  inspect_knife: {
    id: 'inspect_knife',
    text: 'На рукояти выцарапан тот же символ, что позже окажется на ржавом жетоне. Нож бьёт сильнее топора.',
    choices: [
      { id: 'equip', label: 'Экипировать нож', command: 'OPEN_INVENTORY' },
      { id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' },
    ],
  },
  inspect_token: {
    id: 'inspect_token',
    text: [
      'На жетоне выбито: «Узел 7».',
      'С другой стороны царапина: «Не буди шахту».',
      'Жетон дрожит в ладони. Где-то под землёй отвечает глухой гул.',
    ].join('\n'),
    choices: [
      {
        id: 'smoke',
        label: 'Пойти к дыму',
        nextNode: 'rem_gate',
        actions: [{ type: 'set_location', locationId: 'node_7' }, { type: 'visit', locationId: 'node_7' }],
      },
      { id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' },
    ],
  },
  gather_wood: {
    id: 'gather_wood',
    text: 'Ты рубишь кубические стволы на опушке.',
    choices: [
      { id: 'again', label: 'Рубить ещё', command: 'GATHER_WOOD' },
      {
        id: 'shelter',
        label: 'Собрать укрытие',
        command: 'BUILD_TEMP_SHELTER',
        condition: { type: 'flag', flag: 'temporary_shelter_level', exists: false },
      },
      { id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' },
    ],
  },
  abandoned_camp: {
    id: 'abandoned_camp',
    text: 'Погасший костёр и следы. Кто-то ушёл недавно. Без причины лучше не звать хозяина.',
    choices: [
      { id: 'hub', label: 'Вернуться на опушку', nextNode: 'forest_hub' },
      {
        id: 'token',
        label: 'Осмотреть жетон',
        command: 'INSPECT_TOKEN',
        condition: { type: 'item', templateId: 'rusty_token' },
      },
    ],
  },
  shelter_built: {
    id: 'shelter_built',
    text: 'Из шести брёвен и упрямства получается крыша. Ночью здесь можно пережить холод.',
    choices: [{ id: 'hub', label: 'Оглядеться', nextNode: 'forest_hub' }],
  },
};
