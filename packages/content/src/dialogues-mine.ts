import type { DialogueNode } from './dialogue-types';

export const MINE_NODES: Record<string, DialogueNode> = {
  stone_scree: {
    id: 'stone_scree',
    text: 'Каменная осыпь. Серые кубы, осыпающаяся крошка. Чуть в стороне копошится каменный падальщик. Он тебя не атакует.',
    choices: [
      { id: 'gather', label: 'Добывать камень', command: 'GATHER_STONE' },
      { id: 'scavenger', label: 'Подойти к падальщику', nextNode: 'scavenger' },
      { id: 'camp', label: 'Крафт', command: 'OPEN_CAMP' },
      {
        id: 'adit',
        label: 'К штольне',
        nextNode: 'old_adit',
        condition: [
          { type: 'item', templateId: 'stone_pickaxe' },
          { type: 'quest', questId: 'iron_for_gate', statuses: ['ACTIVE'] },
        ],
        actions: [{ type: 'set_location', locationId: 'old_adit' }, { type: 'visit', locationId: 'old_adit' }],
      },
      {
        id: 'rem',
        label: 'К Рему',
        nextNode: 'rem_camp',
        actions: [{ type: 'set_location', locationId: 'rem_camp' }],
      },
    ],
  },
  scavenger: {
    id: 'scavenger',
    text: 'Падальщик щёлкает каменными клешнями, но не наступает. Смотрит на твои руки — не на горло.',
    choices: [
      { id: 'leave', label: 'Уйти', nextNode: 'stone_scree' },
      {
        id: 'fight',
        label: 'Атаковать',
        command: 'START_PVE',
        commandPayload: { enemyId: 'stone_scavenger' },
      },
      { id: 'gather', label: 'Добывать рядом', command: 'GATHER_STONE' },
      {
        id: 'feed',
        label: 'Покормить сухарём',
        command: 'FEED_SCAVENGER',
      },
    ],
  },
  scavenger_fed: {
    id: 'scavenger_fed',
    text: 'Ты бросаешь сухарь. Тварь прижимает его лапой и урчит почти довольно. Кажется, рядом с ней теперь безопаснее копать.',
    choices: [
      { id: 'extra', label: 'Добыть камень рядом', command: 'GATHER_STONE' },
      { id: 'back', label: 'Отойти', nextNode: 'stone_scree' },
    ],
  },
  old_adit: {
    id: 'old_adit',
    text: 'Внутри холодно и сыро.\nДеревянные подпорки давно сгнили.\nГде-то впереди капает вода.',
    choices: [
      { id: 'iron', label: 'Искать железо', command: 'GATHER_IRON' },
      {
        id: 'rails',
        label: 'Осмотреть рельсы',
        nextNode: 'adit_rails',
        condition: { type: 'flag', flag: 'found_broken_lantern', exists: false },
      },
      {
        id: 'listen',
        label: 'Прислушаться',
        nextNode: 'adit_listen',
        condition: { type: 'flag', flag: 'heard_mine_crawler', exists: false },
      },
      {
        id: 'crawler',
        label: 'Идти на шорох',
        command: 'START_PVE',
        commandPayload: { enemyId: 'mine_crawler' },
      },
      {
        id: 'blue',
        label: 'Проверить голубой свет',
        nextNode: 'secret_chamber',
        condition: { type: 'flag', flag: 'found_blue_light', exists: true },
        actions: [
          { type: 'set_location', locationId: 'secret_chamber' },
          { type: 'visit', locationId: 'secret_chamber' },
        ],
      },
      {
        id: 'leave',
        label: 'Выйти',
        nextNode: 'rem_camp',
        actions: [{ type: 'set_location', locationId: 'rem_camp' }],
      },
    ],
  },
  adit_rails: {
    id: 'adit_rails',
    text: 'Между сгнившими шпалами — сломанный фонарь. Стекло выбито, каркас целый.',
    choices: [
      {
        id: 'take',
        label: 'Взять фонарь',
        nextNode: 'old_adit',
        actions: [
          { type: 'give_item', templateId: 'broken_lantern', source: 'LOOTED' },
          { type: 'set_flag', flag: 'found_broken_lantern', value: '1' },
          { type: 'claim_reward', rewardType: 'item', rewardRef: 'broken_lantern' },
        ],
      },
    ],
  },
  adit_listen: {
    id: 'adit_listen',
    text: 'Кап. Пауза. Скрежет хитина о камень — ближе, чем хотелось бы. Теперь ты знаешь, откуда он выйдет.',
    choices: [
      {
        id: 'back',
        label: 'Вернуться в штольню',
        nextNode: 'old_adit',
        actions: [{ type: 'set_flag', flag: 'heard_mine_crawler', value: '1' }],
      },
    ],
  },
  adit_blue_light: {
    id: 'adit_blue_light',
    text: 'Из бокового тоннеля идёт слабый голубой свет.',
    choices: [
      {
        id: 'check',
        label: 'Проверить свет',
        nextNode: 'secret_chamber',
        actions: [
          { type: 'set_location', locationId: 'secret_chamber' },
          { type: 'visit', locationId: 'secret_chamber' },
        ],
      },
      {
        id: 'leave',
        label: 'Возвращаться',
        nextNode: 'old_adit',
        actions: [{ type: 'set_location', locationId: 'old_adit' }],
      },
    ],
  },
  secret_chamber: {
    id: 'secret_chamber',
    text: 'Узкий карман породы. Старый сундук. В стене — жила странного синего минерала.',
    choices: [
      { id: 'chest', label: 'Открыть сундук', command: 'OPEN_SECRET_CHEST' },
      { id: 'blue', label: 'Попытаться добыть синюю породу', command: 'MINE_BLUE_MINERAL' },
      {
        id: 'leave',
        label: 'Уйти',
        nextNode: 'old_adit',
        actions: [{ type: 'set_location', locationId: 'old_adit' }],
      },
    ],
  },
  secret_chest_done: {
    id: 'secret_chest_done',
    text: 'В сундуке — шахтёрский пояс. Тяжёлые карманы, чужая работа.',
    choices: [
      { id: 'equip', label: 'Инвентарь / экипировать', command: 'OPEN_INVENTORY' },
      { id: 'blue', label: 'Синяя порода', command: 'MINE_BLUE_MINERAL' },
      {
        id: 'leave',
        label: 'Уйти',
        nextNode: 'old_adit',
        actions: [{ type: 'set_location', locationId: 'old_adit' }],
      },
    ],
  },
  secret_blue_fail: {
    id: 'secret_blue_fail',
    text: 'Каменная кирка оставляет только царапины. Это не для неё. Ты запоминаешь жилу.',
    choices: [
      {
        id: 'leave',
        label: 'Уйти',
        nextNode: 'old_adit',
        actions: [{ type: 'set_location', locationId: 'old_adit' }],
      },
    ],
  },
};
