import type { DialogueNode } from './dialogue-types';

export const DAY2_NODES: Record<string, DialogueNode> = {
  day2_start: {
    id: 'day2_start',
    text: [
      'Утро. Затвор молчит.',
      'Рем уже у клиньев. Не зовёт завтракать.',
      '— Затвор держит. Пока. Не сиди у меня под боком — поставь свой стан.',
      'Верстак на землю, не в карман. И свет. Ночью сюда лезет не только падальщик.',
    ].join('\n'),
    choices: [
      {
        id: 'shelter',
        label: 'Занять клетку у укрытия',
        command: 'FOUND_CAMP',
        commandPayload: { onShelter: true },
        condition: { type: 'flag', flag: 'temporary_shelter_level', exists: true },
      },
      {
        id: 'empty',
        label: 'Занять пустую клетку',
        command: 'FOUND_CAMP',
        commandPayload: { onShelter: false },
      },
      { id: 'ask7', label: 'Спросить про Узел 7', nextNode: 'day2_ask_node7' },
      { id: 'work', label: 'Молча идти к клетке', command: 'FOUND_CAMP', commandPayload: { onShelter: false } },
    ],
  },
  day2_ask_node7: {
    id: 'day2_ask_node7',
    text: 'Рем не поднимает глаз. — Старый подземный объект. Семь — не твоё пока. Держи затвор, не считай цифры.',
    choices: [
      {
        id: 'shelter',
        label: 'Занять клетку у укрытия',
        command: 'FOUND_CAMP',
        commandPayload: { onShelter: true },
        condition: { type: 'flag', flag: 'temporary_shelter_level', exists: true },
      },
      {
        id: 'empty',
        label: 'Занять пустую клетку',
        command: 'FOUND_CAMP',
        commandPayload: { onShelter: false },
      },
    ],
  },
  camp_founded: {
    id: 'camp_founded',
    text: 'Клетка твоя. Пока голо. Поставь верстак на землю и добудь свет — уголь в саже, если найдёшь след.',
    choices: [
      { id: 'hub', label: '🏕 Стан', command: 'OPEN_MENU', commandPayload: { menu: 'camp' } },
      { id: 'look', label: '👁 Осмотреться', command: 'EXPLORE' },
    ],
  },
  soot_notice: {
    id: 'soot_notice',
    text: 'Между корней — чёрный след. Сажа на кубах. Дальше расщелина, пахнет гарью.',
    choices: [
      {
        id: 'go',
        label: 'К расселине',
        nextNode: 'soot_fissure_look',
        actions: [
          { type: 'set_flag', flag: 'seen_soot_fissure', value: '1' },
          { type: 'set_location', locationId: 'soot_fissure' },
          { type: 'visit', locationId: 'soot_fissure' },
        ],
      },
      { id: 'back', label: 'Пока к стану', command: 'EXPLORE' },
    ],
  },
  soot_fissure_look: {
    id: 'soot_fissure_look',
    text: 'Сажевая расселина. Чёрные кубы. Голыми руками уголь не взять — нужна хотя бы деревянная кирка.',
    choices: [
      { id: 'gather', label: '⛏ Добыча', command: 'OPEN_MENU', commandPayload: { menu: 'gather' } },
      {
        id: 'camp',
        label: 'К стану',
        nextNode: 'camp_look',
        actions: [{ type: 'set_location', locationId: 'player_camp' }],
      },
    ],
  },
  ridge_tracks: {
    id: 'ridge_tracks',
    text: [
      'На границе стана — отпечатки крупнее падальщика.',
      'Три куба в ряд, как ступня. Не то, что за решёткой.',
    ].join('\n'),
    choices: [
      {
        id: 'rem',
        label: 'Показать Рему',
        nextNode: 'ridge_tracks_rem',
        actions: [{ type: 'set_flag', flag: 'seen_ridge_tracks', value: '1' }],
      },
      {
        id: 'back',
        label: 'Запомнить и отойти',
        command: 'EXPLORE',
        actions: [{ type: 'set_flag', flag: 'seen_ridge_tracks', value: '1' }],
      },
    ],
  },
  ridge_tracks_rem: {
    id: 'ridge_tracks_rem',
    text: 'Рем смотрит коротко. — Это не то, что за решёткой. Это с гребня. Сизый клин. Завтра. Не сегодня.',
    choices: [
      {
        id: 'camp',
        label: 'К стану',
        command: 'EXPLORE',
        actions: [{ type: 'set_location', locationId: 'player_camp' }],
      },
    ],
  },
  rem_day2: {
    id: 'rem_day2',
    text: 'Рем у затвора ковыряет клин. Печи нет — только обломки глины в стороне. «Потом», — говорит он, если смотреть слишком долго.',
    choices: [
      {
        id: 'what7_shown',
        label: 'Что такое Узел 7?',
        nextNode: 'rem_day2_node7_shown',
        condition: { type: 'flag', flag: 'showed_token_to_rem', exists: true },
      },
      {
        id: 'what7',
        label: 'Что такое Узел 7?',
        nextNode: 'rem_day2_node7',
        condition: { type: 'flag', flag: 'showed_token_to_rem', exists: false },
      },
      { id: 'inside', label: 'Что внутри?', nextNode: 'rem_day2_inside' },
      {
        id: 'night',
        label: 'Спросить про разговор ночью',
        nextNode: 'rem_day2_night',
        condition: [
          { type: 'flag', flag: 'night_eavesdropped', exists: true },
          { type: 'flag', flag: 'pressed_rem_about_night', exists: false },
        ],
      },
      {
        id: 'lantern',
        label: 'Показать сломанный фонарь',
        nextNode: 'rem_day2_lantern',
        condition: { type: 'item', templateId: 'broken_lantern' },
      },
      {
        id: 'camp',
        label: 'К стану',
        command: 'EXPLORE',
        actions: [{ type: 'set_location', locationId: 'player_camp' }],
        condition: { type: 'flag', flag: 'player_camp_founded', exists: true },
      },
    ],
  },
  rem_day2_node7: {
    id: 'rem_day2_node7',
    text: '— Старый подземный объект. Семь — не твоё пока. Держи затвор, не считай цифры.',
    choices: [{ id: 'back', label: 'Отойти', nextNode: 'rem_day2' }],
  },
  rem_day2_node7_shown: {
    id: 'rem_day2_node7_shown',
    text: 'Кивок. — Ты уже видел знак. Семь — не твоё пока. Держи затвор.',
    choices: [{ id: 'back', label: 'Отойти', nextNode: 'rem_day2' }],
  },
  rem_day2_inside: {
    id: 'rem_day2_inside',
    text: '— Не твоё. Не сегодня.',
    choices: [{ id: 'back', label: 'Отойти', nextNode: 'rem_day2' }],
  },
  rem_day2_night: {
    id: 'rem_day2_night',
    text: 'Ты говоришь, что слышал голос. Рем смотрит сквозь тебя. — Сон. Не лезь.',
    choices: [
      {
        id: 'back',
        label: 'Замолчать',
        nextNode: 'rem_day2',
        actions: [{ type: 'set_flag', flag: 'pressed_rem_about_night', value: '1' }],
      },
    ],
  },
  rem_day2_lantern: {
    id: 'rem_day2_lantern',
    text: 'Рем крутит каркас. — Потом. Вел носит стёкла. Не я.',
    choices: [{ id: 'back', label: 'Убрать фонарь', nextNode: 'rem_day2' }],
  },
  scavenger_day2: {
    id: 'scavenger_day2',
    text: 'Каменный падальщик сидит у края стана. Не нападает. Рядом кучка камешков — как будто оставил.',
    choices: [
      {
        id: 'take',
        label: 'Взять тайник',
        command: 'CLAIM_REWARD',
        commandPayload: { rewardType: 'gift', rewardRef: 'scavenger_cache' },
      },
      {
        id: 'shoo',
        label: 'Прогнать',
        nextNode: 'scavenger_day2_shoo',
        actions: [
          { type: 'claim_reward', rewardType: 'gift', rewardRef: 'scavenger_cache' },
          { type: 'set_flag', flag: 'scavenger_cache', value: '1' },
        ],
      },
      { id: 'leave', label: 'Оставить', command: 'EXPLORE' },
    ],
  },
  scavenger_day2_cache: {
    id: 'scavenger_day2_cache',
    text: 'Два булыжника. Падальщик фыркает и отходит. Не питомец. Просто не враг.',
    choices: [{ id: 'look', label: 'Оглядеться', command: 'EXPLORE' }],
  },
  scavenger_day2_feed: {
    id: 'scavenger_day2_feed',
    text: 'Сухаря нет — или он уже сыт. Стоит. Смотрит. Тайник всё ещё у лап.',
    choices: [
      { id: 'take', label: 'Взять тайник', nextNode: 'scavenger_day2_cache' },
      { id: 'leave', label: 'Оставить', command: 'EXPLORE' },
    ],
  },
  scavenger_day2_shoo: {
    id: 'scavenger_day2_shoo',
    text: 'Ты машешь рукой. Тварь уходит в осыпь. Тишина.',
    choices: [{ id: 'look', label: 'Оглядеться', command: 'EXPLORE' }],
  },
  camp_look: {
    id: 'camp_look',
    text: 'Свой стан. Клетка леса. Можно работать.',
    choices: [
      { id: 'camp', label: '🏕 Стан', command: 'OPEN_MENU', commandPayload: { menu: 'camp' } },
      { id: 'hub', label: 'Меню', command: 'OPEN_CAMP' },
      {
        id: 'soot_go',
        label: 'К расселине',
        nextNode: 'soot_fissure_look',
        actions: [
          { type: 'set_flag', flag: 'seen_soot_fissure', value: '1' },
          { type: 'set_location', locationId: 'soot_fissure' },
          { type: 'visit', locationId: 'soot_fissure' },
        ],
      },
      {
        id: 'ridge',
        label: 'Следы на краю',
        nextNode: 'ridge_tracks',
        condition: { type: 'flag', flag: 'seen_ridge_tracks', exists: false },
      },
      {
        id: 'scavenger',
        label: 'Падальщик',
        nextNode: 'scavenger_day2',
        condition: [
          { type: 'flag', flag: 'fed_stone_scavenger', exists: true },
          { type: 'flag', flag: 'defeated_stone_scavenger', exists: false },
          { type: 'flag', flag: 'scavenger_cache', exists: false },
        ],
      },
    ],
  },
  day2_complete: {
    id: 'day2_complete',
    text: [
      'Стан стоит. Костёр держит ночь.',
      'На границе — следы с гребня. Не то, что за решёткой.',
      'Рем знает больше. Молчит.',
      'Продолжение скоро будет доступно.',
    ].join('\n'),
    choices: [
      { id: 'camp', label: 'К стану', command: 'OPEN_CAMP' },
      { id: 'look', label: 'Осмотреться', command: 'EXPLORE' },
    ],
  },
};
