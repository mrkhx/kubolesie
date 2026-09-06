import type { EquipmentSlot, Rarity } from '@kubolesie/shared';

export interface ItemTemplate {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  slot?: EquipmentSlot;
  questItem?: boolean;
  consumable?: boolean;
  energyRestore?: number;
  attackBonus?: number;
  defenseBonus?: number;
  maxEnergyBonus?: number;
  woodYieldBonus?: number;
  stoneYieldBonus?: number;
  oreYieldBonus?: number;
  minDamage?: number;
  maxDamage?: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  stone_knife: {
    id: 'stone_knife',
    name: 'Каменный нож',
    description: 'На рукояти выцарапан тот же знак, что на ржавом жетоне.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 3,
    minDamage: 3,
    maxDamage: 5,
  },
  crafting_table: {
    id: 'crafting_table',
    name: 'Верстак',
    description: 'Грубый кубический стол. Без него кирку не сколотить.',
    rarity: 'COMMON',
  },
  wooden_axe: {
    id: 'wooden_axe',
    name: 'Деревянный топор',
    description: 'Лучше рубит брёвна, чем голые руки.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
    minDamage: 2,
    maxDamage: 3,
    woodYieldBonus: 0.25,
  },
  wooden_pickaxe: {
    id: 'wooden_pickaxe',
    name: 'Деревянная кирка',
    description: 'Берёт булыжник. Железо ей не по зубам.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
    minDamage: 2,
    maxDamage: 3,
    stoneYieldBonus: 0.15,
  },
  stone_axe: {
    id: 'stone_axe',
    name: 'Каменный топор',
    description: 'Топор из булыжника. Лучше рубит дерево.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
    minDamage: 2,
    maxDamage: 4,
    woodYieldBonus: 0.25,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe',
    name: 'Каменная кирка',
    description: 'Для булыжника и железной жилы.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 2,
    minDamage: 2,
    maxDamage: 3,
    stoneYieldBonus: 0.3,
    oreYieldBonus: 0.3,
  },
  worn_gloves: {
    id: 'worn_gloves',
    name: 'Потёртые перчатки',
    description: 'Едва держатся на руках.',
    rarity: 'COMMON',
    slot: 'HANDS',
    defenseBonus: 2,
  },
  miner_belt: {
    id: 'miner_belt',
    name: 'Шахтёрский пояс',
    description: 'Карманы для руды и клиньев.',
    rarity: 'UNCOMMON',
    slot: 'CHEST',
    defenseBonus: 3,
    maxEnergyBonus: 2,
  },
  rusty_token: {
    id: 'rusty_token',
    name: 'Ржавый жетон',
    description: 'Жетон с выбитой семёркой. Квестовый предмет.',
    rarity: 'UNCOMMON',
    questItem: true,
  },
  dry_rusk: {
    id: 'dry_rusk',
    name: 'Сухой сухарь',
    description: 'Жёсткий, но восстанавливает силы.',
    rarity: 'COMMON',
    consumable: true,
    energyRestore: 5,
  },
  broken_lantern: {
    id: 'broken_lantern',
    name: 'Сломанный фонарь',
    description: 'Стекло выбито. Ещё пригодится.',
    rarity: 'COMMON',
    questItem: true,
  },
};

export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES[id];
}
