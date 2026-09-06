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
  dodgeBonus?: number;
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
    description: 'На рукояти выцарабан тот же знак, что на ржавом жетоне.',
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
  torch: {
    id: 'torch',
    name: 'Факел',
    description: 'Уголь и палка. Свет без печи.',
    rarity: 'COMMON',
  },
  chest: {
    id: 'chest',
    name: 'Сундук',
    description: 'Восемь досок. Пока просто стоит на стане.',
    rarity: 'COMMON',
  },
  campfire: {
    id: 'campfire',
    name: 'Костёр',
    description: 'Брёвна, палки, уголь. Ночь становится короче.',
    rarity: 'COMMON',
  },
  wooden_sword: {
    id: 'wooden_sword',
    name: 'Деревянный меч',
    description: 'Две доски и палка. Слабее камня, лучше кирки в бою.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 3,
    minDamage: 3,
    maxDamage: 4,
  },
  stone_sword: {
    id: 'stone_sword',
    name: 'Каменный меч',
    description: 'Рвёт смолу. Заметно лучше ножа.',
    rarity: 'COMMON',
    slot: 'WEAPON',
    attackBonus: 4,
    minDamage: 4,
    maxDamage: 6,
  },
  hide_tunic: {
    id: 'hide_tunic',
    name: 'Туника из шкуры',
    description: 'Восемь шкур. Держит клыки хряка.',
    rarity: 'COMMON',
    slot: 'CHEST',
    defenseBonus: 4,
  },
  stumpfang_tooth: {
    id: 'stumpfang_tooth',
    name: 'Клык Пнеклыка',
    description: 'Трофей мини-босса. Вел его оценит. Рем — нет.',
    rarity: 'UNCOMMON',
    questItem: true,
  },
  wedge_map_fragment: {
    id: 'wedge_map_fragment',
    name: 'Фрагмент карты',
    description: 'Семёрка и ещё одна метка в стороне.',
    rarity: 'UNCOMMON',
    questItem: true,
  },
  furnace: {
    id: 'furnace',
    name: 'Печь',
    description: 'Восемь булыжников. Руда течёт. Синее — нет.',
    rarity: 'COMMON',
  },
  iron_pickaxe: {
    id: 'iron_pickaxe',
    name: 'Железная кирка',
    description: 'Копает жилу глубже каменной.',
    rarity: 'UNCOMMON',
    slot: 'WEAPON',
    attackBonus: 4,
    minDamage: 3,
    maxDamage: 5,
    stoneYieldBonus: 0.4,
    oreYieldBonus: 0.5,
  },
  iron_axe: {
    id: 'iron_axe',
    name: 'Железный топор',
    description: 'Брёвна и баррикады. Ломает деревянную ногу.',
    rarity: 'UNCOMMON',
    slot: 'WEAPON',
    attackBonus: 4,
    minDamage: 4,
    maxDamage: 6,
    woodYieldBonus: 0.4,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Железный меч',
    description: 'Лучший DPS недели до босса.',
    rarity: 'UNCOMMON',
    slot: 'WEAPON',
    attackBonus: 6,
    minDamage: 6,
    maxDamage: 9,
  },
  glass_pane: {
    id: 'glass_pane',
    name: 'Стекло',
    description: 'Вел носит стёкла. Оправа для фонаря.',
    rarity: 'UNCOMMON',
  },
  lit_lantern: {
    id: 'lit_lantern',
    name: 'Зажжённый фонарь',
    description: 'Шарниры видны. Темнота — нет.',
    rarity: 'UNCOMMON',
    questItem: true,
  },
  resin_mail: {
    id: 'resin_mail',
    name: 'Смоляная кольчуга',
    description: 'Редкая. Тяжёлая. Смола гасит удар.',
    rarity: 'RARE',
    slot: 'CHEST',
    defenseBonus: 6,
  },
  wedge_charm: {
    id: 'wedge_charm',
    name: 'Чар клина',
    description: 'Редкий. Уклон в смоле.',
    rarity: 'RARE',
    slot: 'AMULET',
    dodgeBonus: 8,
  },
  pvp_token: {
    id: 'pvp_token',
    name: 'Жетон спора',
    description: 'Мало стоит. Не лучший фарм монет.',
    rarity: 'COMMON',
  },
  wenzel_plate: {
    id: 'wenzel_plate',
    name: 'Пластина Вензеля',
    description: 'Уникальный материал внешнего стража.',
    rarity: 'RARE',
    questItem: true,
  },
  hinge_charm: {
    id: 'hinge_charm',
    name: 'Шарнирный оберег',
    description: 'Def и капля энергии. С петлей затвора.',
    rarity: 'RARE',
    slot: 'AMULET',
    defenseBonus: 2,
    maxEnergyBonus: 2,
  },
  seal_shard_7: {
    id: 'seal_shard_7',
    name: 'Осколок печати',
    description: 'Сюжетный ключ. Один из семи. Не объясняет остальные.',
    rarity: 'EPIC',
    questItem: true,
  },
};

export const STONE_SALVAGE_TOOLS = ['stone_pickaxe', 'stone_axe', 'stone_sword'] as const;

export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES[id];
}
