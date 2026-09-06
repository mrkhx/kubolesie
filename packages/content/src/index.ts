import type {
  EquipmentSlot,
  GameButton,
  GameCommandType,
  QuestStatus,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';

export const STORY_FLAGS = [
  'found_rusty_token',
  'activated_node7_token',
  'met_rem',
  'node7_gate_closed',
  'fed_stone_scavenger',
  'showed_token_to_rem',
] as const;

export type StoryFlag = (typeof STORY_FLAGS)[number];

export interface ItemTemplate {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  slot?: EquipmentSlot;
  questItem?: boolean;
  attackBonus?: number;
  defenseBonus?: number;
  woodYieldBonus?: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  stone_knife: {
    id: 'stone_knife',
    name: 'Каменный нож',
    description: 'Обломок камня, обмотанный волокном.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
  },
  stone_axe: {
    id: 'stone_axe',
    name: 'Каменный топор',
    description: 'Грубый топор. Лучше рубит дерево.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 3,
    woodYieldBonus: 0.25,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe',
    name: 'Каменная кирка',
    description: 'Для камня и жилы.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
  },
  worn_gloves: {
    id: 'worn_gloves',
    name: 'Потёртые перчатки',
    description: 'Едва держатся на руках.',
    rarity: 'COMMON',
    slot: 'HANDS',
    defenseBonus: 1,
  },
  miner_belt: {
    id: 'miner_belt',
    name: 'Шахтёрский пояс',
    description: 'Карманы для руды и клиньев.',
    rarity: 'COMMON',
    slot: 'CHEST',
    defenseBonus: 1,
  },
  rusty_token: {
    id: 'rusty_token',
    name: 'Ржавый жетон',
    description: 'Жетон с выбитой семёркой. Квестовый предмет.',
    rarity: 'UNCOMMON',
    questItem: true,
  },
};

export interface CraftRecipe {
  templateId: string;
  cost: Partial<Record<ResourceType, number>>;
}

export const CRAFT_RECIPES: Record<string, CraftRecipe> = {
  stone_axe: {
    templateId: 'stone_axe',
    cost: { WOOD: 2, STONE: 2 },
  },
  stone_pickaxe: {
    templateId: 'stone_pickaxe',
    cost: { WOOD: 2, STONE: 3 },
  },
};

export interface EnemyTemplate {
  id: string;
  name: string;
  hp: number;
  minDamage: number;
  maxDamage: number;
  defense: number;
  speed: number;
  dodge: number;
  accuracy: number;
  critChance: number;
  critDamage: number;
}

export const ENEMIES: Record<string, EnemyTemplate> = {
  wild_shrew: {
    id: 'wild_shrew',
    name: 'Дикая землеройка',
    hp: 32,
    minDamage: 4,
    maxDamage: 7,
    defense: 0,
    speed: 8,
    dodge: 5,
    accuracy: 90,
    critChance: 3,
    critDamage: 150,
  },
  mine_crawler: {
    id: 'mine_crawler',
    name: 'Шахтный ползун',
    hp: 55,
    minDamage: 4,
    maxDamage: 7,
    defense: 2,
    speed: 6,
    dodge: 2,
    accuracy: 88,
    critChance: 4,
    critDamage: 150,
  },
};

export interface LocationTemplate {
  id: string;
  name: string;
  text: string;
}

export const LOCATIONS: Record<string, LocationTemplate> = {
  forest_clearing: {
    id: 'forest_clearing',
    name: 'Лесная поляна',
    text: 'Холодная поляна в кубическом лесу. Разбитый ящик, дым вдали, шорох в кустах.',
  },
  rem_camp: {
    id: 'rem_camp',
    name: 'Лагерь Рема',
    text: 'Небольшой костёр, навес из веток. Рем смотрит на лес и молчит.',
  },
  stone_scree: {
    id: 'stone_scree',
    name: 'Каменная осыпь',
    text: 'Склон из серых кубов. Здесь добывают камень.',
  },
  old_adit: {
    id: 'old_adit',
    name: 'Старая штольня',
    text: 'Тёмный вход в породу. Пахнет сыростью и железом.',
  },
  node_7: {
    id: 'node_7',
    name: 'Узел 7',
    text: 'Массивные ворота. На замке выбита семёрка.',
  },
};

export const DEFAULT_LOCATION = 'forest_clearing';
export const DEFAULT_STATE = 'start';

export interface NpcTemplate {
  id: string;
  name: string;
  locationId: string;
}

export const NPCS: Record<string, NpcTemplate> = {
  rem: { id: 'rem', name: 'Рем', locationId: 'rem_camp' },
};

export interface QuestTemplateContent {
  id: string;
  title: string;
  description: string;
  defaultStatus: QuestStatus;
}

export const QUEST_TEMPLATES: QuestTemplateContent[] = [
  {
    id: 'iron_for_gate',
    title: 'Железо для ворот',
    description: 'Добыть железо, чтобы Рем мог поднять затвор у Узла 7.',
    defaultStatus: 'LOCKED',
  },
];

export interface DialogueCondition {
  type: 'flag' | 'item' | 'resource' | 'always';
  flag?: string;
  equals?: string;
  exists?: boolean;
  templateId?: string;
  resource?: ResourceType;
  min?: number;
}

export type DialogueAction =
  | { type: 'set_flag'; flag: string; value?: string }
  | { type: 'add_resource'; resource: ResourceType; amount: number }
  | { type: 'give_item'; templateId: string; rarity?: Rarity; source?: 'CREATED' | 'LOOTED' }
  | { type: 'set_relation'; npcId: string; trustDelta?: number; reputationDelta?: number }
  | { type: 'set_location'; locationId: string }
  | { type: 'set_state'; state: string }
  | { type: 'claim_reward'; rewardType: string; rewardRef: string }
  | { type: 'start_quest'; questId: string };

export interface DialogueChoice {
  id: string;
  label: string;
  nextNode?: string;
  condition?: DialogueCondition | DialogueCondition[];
  actions?: DialogueAction[];
  command?: GameCommandType;
  commandPayload?: Record<string, unknown>;
}

export interface DialogueNode {
  id: string;
  text: string;
  choices: DialogueChoice[];
}

export const DIALOGUE_NODES: Record<string, DialogueNode> = {
  start: {
    id: 'start',
    text: [
      'Ты приходишь в себя на холодной земле.',
      'Вокруг густой кубический лес.',
      'Рядом разбитый деревянный ящик,',
      'а вдали поднимается дым.',
      'Из кустов справа слышится шорох.',
    ].join('\n'),
    choices: [
      { id: 'open_crate', label: 'Осмотреть ящик', command: 'OPEN_CRATE' },
      {
        id: 'go_smoke',
        label: 'Пойти к дыму',
        nextNode: 'meet_rem',
        actions: [
          { type: 'set_location', locationId: 'rem_camp' },
          { type: 'set_state', state: 'meet_rem' },
          { type: 'set_flag', flag: 'met_rem', value: '1' },
          { type: 'set_relation', npcId: 'rem', trustDelta: 1 },
        ],
      },
      { id: 'check_bushes', label: 'Проверить кусты', nextNode: 'check_bushes' },
    ],
  },
  check_bushes: {
    id: 'check_bushes',
    text: 'Кусты дрожат. Между стеблями мелькает тварь — дикая землеройка.',
    choices: [
      {
        id: 'fight_shrew',
        label: 'Атаковать',
        command: 'START_PVE',
        commandPayload: { enemyId: 'wild_shrew' },
      },
      { id: 'back', label: 'Отойти', nextNode: 'start' },
    ],
  },
  open_crate: {
    id: 'open_crate',
    text: 'В ящике — ржавый жетон с выбитой семёркой. Остальное сгнило.',
    choices: [
      { id: 'inspect_token', label: 'Осмотреть жетон', nextNode: 'inspect_token' },
      { id: 'back', label: 'Оглядеться', nextNode: 'start' },
    ],
  },
  open_crate_empty: {
    id: 'open_crate_empty',
    text: 'Ящик пуст. Ты уже забрал ржавый жетон.',
    choices: [{ id: 'back', label: 'Оглядеться', nextNode: 'start' }],
  },
  gather_wood: {
    id: 'gather_wood',
    text: 'Ты рубишь кубические стволы на поляне.',
    choices: [
      { id: 'again', label: 'Рубить ещё', command: 'GATHER_WOOD' },
      { id: 'camp', label: 'В лагерь', command: 'OPEN_CAMP' },
    ],
  },
  inspect_token: {
    id: 'inspect_token',
    text: 'На жетоне едва читается NODE-7. Металл чуть тёплый.',
    choices: [
      { id: 'back', label: 'Убрать жетон', nextNode: 'start' },
      {
        id: 'show_rem',
        label: 'Показать Рему',
        nextNode: 'meet_rem',
        condition: { type: 'flag', flag: 'met_rem', exists: true },
        actions: [{ type: 'set_flag', flag: 'showed_token_to_rem', value: '1' }],
      },
    ],
  },
  meet_rem: {
    id: 'meet_rem',
    text: 'У костра стоит человек в заплатанной куртке.\n— Живой? Я Рем. К Узлу 7 без жетона не ходи.',
    choices: [
      {
        id: 'show_token',
        label: 'Показать жетон',
        condition: { type: 'flag', flag: 'found_rusty_token', exists: true },
        nextNode: 'rem_token',
        actions: [
          { type: 'set_flag', flag: 'showed_token_to_rem', value: '1' },
          { type: 'set_relation', npcId: 'rem', trustDelta: 2, reputationDelta: 1 },
        ],
      },
      { id: 'camp', label: 'Осмотреть лагерь', command: 'OPEN_CAMP' },
      { id: 'leave', label: 'Вернуться на поляну', nextNode: 'start', actions: [{ type: 'set_location', locationId: 'forest_clearing' }] },
    ],
  },
  rem_token: {
    id: 'rem_token',
    text: 'Рем вертит жетон углями пальцев.\n— Седьмой узел. Ворота пока закрыты. Принеси железо — поговорим.',
    choices: [
      {
        id: 'accept',
        label: 'Кивнуть',
        nextNode: 'meet_rem',
        actions: [
          { type: 'start_quest', questId: 'iron_for_gate' },
          { type: 'set_flag', flag: 'node7_gate_closed', value: '1' },
        ],
      },
    ],
  },
};

export const GATHER_WOOD = {
  energyCost: 2,
  baseYield: 6,
  axeBonus: 0.25,
} as const;

export const CAMP_BUTTONS: GameButton[] = [
  { label: 'Рубить дерево', action: 'GATHER_WOOD' },
  { label: 'Инвентарь', action: 'OPEN_INVENTORY' },
  { label: 'Крафт: топор', action: 'CRAFT_ITEM', payload: { templateId: 'stone_axe' } },
  { label: 'Крафт: кирка', action: 'CRAFT_ITEM', payload: { templateId: 'stone_pickaxe' } },
  { label: 'Говорить с Ремом', action: 'TALK_NPC', payload: { npcId: 'rem' } },
  { label: 'Оглядеться', action: 'EXPLORE' },
];

export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES[id];
}

export function getRecipe(templateId: string): CraftRecipe | undefined {
  return CRAFT_RECIPES[templateId];
}

export function getEnemy(id: string): EnemyTemplate | undefined {
  return ENEMIES[id];
}

export function getLocation(id: string): LocationTemplate | undefined {
  return LOCATIONS[id];
}

export function getDialogueNode(id: string): DialogueNode | undefined {
  return DIALOGUE_NODES[id];
}

export function resourceLabel(resource: ResourceType): string {
  const labels: Record<ResourceType, string> = {
    WOOD: 'Дерево',
    STONE: 'Камень',
    IRON_ORE: 'Железная руда',
    FIBER: 'Волокно',
    HIDE: 'Шкура',
    HERBS: 'Травы',
    COAL: 'Уголь',
  };
  return labels[resource];
}
