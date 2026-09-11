import type { ResourceType } from '@kubolesie/shared';

export type CraftOutput =
  | { kind: 'item'; templateId: string; amount?: number }
  | { kind: 'resource'; resource: ResourceType; amount: number };

export interface CraftRecipe {
  id: string;
  name: string;
  cost: Partial<Record<ResourceType, number>>;
  station?: 'crafting_table';
  output: CraftOutput;
}

export const CRAFT_RECIPES: Record<string, CraftRecipe> = {
  planks: {
    id: 'planks',
    name: 'Доски',
    cost: { LOG: 1 },
    output: { kind: 'resource', resource: 'PLANK', amount: 4 },
  },
  sticks: {
    id: 'sticks',
    name: 'Палки',
    cost: { PLANK: 2 },
    output: { kind: 'resource', resource: 'STICK', amount: 4 },
  },
  crafting_table: {
    id: 'crafting_table',
    name: 'Верстак',
    cost: { PLANK: 4 },
    output: { kind: 'item', templateId: 'crafting_table' },
  },
  wooden_pickaxe: {
    id: 'wooden_pickaxe',
    name: 'Деревянная кирка',
    cost: { PLANK: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'wooden_pickaxe' },
  },
  wooden_axe: {
    id: 'wooden_axe',
    name: 'Деревянный топор',
    cost: { PLANK: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'wooden_axe' },
  },
  stone_pickaxe: {
    id: 'stone_pickaxe',
    name: 'Каменная кирка',
    cost: { COBBLESTONE: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'stone_pickaxe' },
  },
  stone_axe: {
    id: 'stone_axe',
    name: 'Каменный топор',
    cost: { COBBLESTONE: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'stone_axe' },
  },
  salvage_wood: {
    id: 'salvage_wood',
    name: 'Переложить дерево в брёвна',
    cost: { WOOD: 1 },
    output: { kind: 'resource', resource: 'LOG', amount: 1 },
  },
  salvage_stone: {
    id: 'salvage_stone',
    name: 'Переколоть камень в булыжник',
    cost: { STONE: 1 },
    output: { kind: 'resource', resource: 'COBBLESTONE', amount: 1 },
  },
  chest: {
    id: 'chest',
    name: 'Сундук',
    cost: { PLANK: 8 },
    output: { kind: 'item', templateId: 'chest' },
  },
  torch: {
    id: 'torch',
    name: 'Факелы',
    cost: { COAL: 1, STICK: 1 },
    output: { kind: 'item', templateId: 'torch', amount: 4 },
  },
  campfire: {
    id: 'campfire',
    name: 'Костёр',
    cost: { LOG: 3, STICK: 3, COAL: 1 },
    output: { kind: 'item', templateId: 'campfire' },
  },
  wooden_sword: {
    id: 'wooden_sword',
    name: 'Деревянный меч',
    cost: { PLANK: 2, STICK: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'wooden_sword' },
  },
  stone_sword: {
    id: 'stone_sword',
    name: 'Каменный меч',
    cost: { COBBLESTONE: 2, STICK: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'stone_sword' },
  },
  hide_tunic: {
    id: 'hide_tunic',
    name: 'Туника из шкуры',
    cost: { HIDE: 8 },
    output: { kind: 'item', templateId: 'hide_tunic' },
  },
  furnace: {
    id: 'furnace',
    name: 'Печь',
    cost: { COBBLESTONE: 8 },
    output: { kind: 'item', templateId: 'furnace' },
  },
  iron_pickaxe: {
    id: 'iron_pickaxe',
    name: 'Железная кирка',
    cost: { IRON_INGOT: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_pickaxe' },
  },
  iron_axe: {
    id: 'iron_axe',
    name: 'Железный топор',
    cost: { IRON_INGOT: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_axe' },
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Железный меч',
    cost: { IRON_INGOT: 2, STICK: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_sword' },
  },
  stone_hoe: {
    id: 'stone_hoe',
    name: 'Каменная мотыга',
    cost: { COBBLESTONE: 2, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'stone_hoe' },
  },
  iron_hoe: {
    id: 'iron_hoe',
    name: 'Железная мотыга',
    cost: { IRON_INGOT: 2, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_hoe' },
  },
  bow: {
    id: 'bow',
    name: 'Лук',
    cost: { STICK: 3, STRING: 3 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bow' },
  },
  shield: {
    id: 'shield',
    name: 'Щит',
    cost: { PLANK: 6, IRON_INGOT: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'shield' },
  },
  bucket: {
    id: 'bucket',
    name: 'Ведро',
    cost: { IRON_INGOT: 3 },
    output: { kind: 'item', templateId: 'bucket' },
  },
  bread: {
    id: 'bread',
    name: 'Хлеб',
    cost: { WHEAT: 3 },
    output: { kind: 'item', templateId: 'bread' },
  },
  root_rope: {
    id: 'root_rope',
    name: 'Корневая верёвка',
    cost: { ROOT_FIBER: 4, FIBER: 2 },
    output: { kind: 'item', templateId: 'root_rope' },
  },
  root_brace: {
    id: 'root_brace',
    name: 'Укреплённый настил',
    cost: { LOG: 6, COBBLESTONE: 4, IRON_INGOT: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'root_brace' },
  },
  rot_binding: {
    id: 'rot_binding',
    name: 'Гнилая связка',
    cost: { ROT_RESIN: 3, FIBER: 2, STICK: 2 },
    output: { kind: 'item', templateId: 'rot_binding' },
  },
  path_marker: {
    id: 'path_marker',
    name: 'Метка пути',
    cost: { PLANK: 4, COAL: 2, ROT_RESIN: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'path_marker' },
  },
  reed_rope: {
    id: 'reed_rope',
    name: 'Камышовая связка',
    cost: { BLACK_REED: 3, FIBER: 2, STICK: 2 },
    output: { kind: 'item', templateId: 'reed_rope' },
  },
  marsh_platform: {
    id: 'marsh_platform',
    name: 'Топяной настил',
    cost: { PLANK: 4, BLACK_REED: 3, IRON_INGOT: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'marsh_platform' },
  },
  haul_line: {
    id: 'haul_line',
    name: 'Тяговый канат',
    cost: { FIBER: 3, STICK: 2, GEAR_SCRAP: 2 },
    output: { kind: 'item', templateId: 'haul_line' },
  },
  mechanical_brace: {
    id: 'mechanical_brace',
    name: 'Механическая распорка',
    cost: { GEAR_SCRAP: 3, PLANK: 3, IRON_INGOT: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'mechanical_brace' },
  },
  bronze_ingot: {
    id: 'bronze_ingot',
    name: 'Бронзовый слиток',
    cost: { COPPER_INGOT: 3, TIN_INGOT: 1 },
    output: { kind: 'resource', resource: 'BRONZE_INGOT', amount: 4 },
  },
  copper_fitting: {
    id: 'copper_fitting',
    name: 'Медный крепёж',
    cost: { COPPER_INGOT: 2 },
    output: { kind: 'resource', resource: 'COPPER_FITTING', amount: 2 },
  },
  bronze_pickaxe: {
    id: 'bronze_pickaxe',
    name: 'Бронзовая кирка',
    cost: { BRONZE_INGOT: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_pickaxe' },
  },
  bronze_axe: {
    id: 'bronze_axe',
    name: 'Бронзовый топор',
    cost: { BRONZE_INGOT: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_axe' },
  },
  bronze_sword: {
    id: 'bronze_sword',
    name: 'Бронзовый меч',
    cost: { BRONZE_INGOT: 2, STICK: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_sword' },
  },
  miner_lantern: {
    id: 'miner_lantern',
    name: 'Шахтёрский фонарь',
    cost: { COPPER_FITTING: 2, COAL: 1, STICK: 1 },
    output: { kind: 'item', templateId: 'miner_lantern' },
  },
  improved_lantern: {
    id: 'improved_lantern',
    name: 'Серебряный фонарь',
    cost: { COPPER_FITTING: 1, SILVER_INGOT: 2, COAL: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'improved_lantern' },
  },
  iron_helmet: {
    id: 'iron_helmet',
    name: 'Железный шлем',
    cost: { IRON_INGOT: 5 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_helmet' },
  },
  iron_chest: {
    id: 'iron_chest',
    name: 'Железная кираса',
    cost: { IRON_INGOT: 8 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_chest' },
  },
  iron_boots: {
    id: 'iron_boots',
    name: 'Железные сапоги',
    cost: { IRON_INGOT: 4 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'iron_boots' },
  },
  bronze_helmet: {
    id: 'bronze_helmet',
    name: 'Бронзовый шлем',
    cost: { BRONZE_INGOT: 5 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_helmet' },
  },
  bronze_chest: {
    id: 'bronze_chest',
    name: 'Бронзовая кираса',
    cost: { BRONZE_INGOT: 8 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_chest' },
  },
  bronze_boots: {
    id: 'bronze_boots',
    name: 'Бронзовые сапоги',
    cost: { BRONZE_INGOT: 4 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'bronze_boots' },
  },
  silver_charm: {
    id: 'silver_charm',
    name: 'Серебряный оберег',
    cost: { SILVER_INGOT: 3, STICK: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'silver_charm' },
  },
  gold_seal: {
    id: 'gold_seal',
    name: 'Золотая печать стана',
    cost: { GOLD_INGOT: 3, COPPER_FITTING: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'gold_seal' },
  },
  gold_band: {
    id: 'gold_band',
    name: 'Золотой обод',
    cost: { GOLD_INGOT: 2, COPPER_FITTING: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'gold_band' },
  },
  copper_brace: {
    id: 'copper_brace',
    name: 'Медная стяжка',
    cost: { COPPER_FITTING: 3, TIN_INGOT: 1, PLANK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'copper_brace' },
  },
  deep_pickaxe: {
    id: 'deep_pickaxe',
    name: 'Жильная кирка',
    cost: { DEEP_CRYSTAL: 2, BRONZE_INGOT: 3, STICK: 2 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'deep_pickaxe' },
  },
  deep_charm: {
    id: 'deep_charm',
    name: 'Жильный оберег',
    cost: { DEEP_CRYSTAL: 2, SILVER_INGOT: 1 },
    station: 'crafting_table',
    output: { kind: 'item', templateId: 'deep_charm' },
  },
};

export const CRAFT_PIPELINE = [
  'planks',
  'sticks',
  'crafting_table',
  'wooden_pickaxe',
  'wooden_axe',
  'stone_pickaxe',
  'stone_axe',
] as const;

export const IRON_TOOL_RECIPES = ['iron_pickaxe', 'iron_axe', 'iron_sword'] as const;
export const BRONZE_TOOL_RECIPES = ['bronze_pickaxe', 'bronze_axe', 'bronze_sword'] as const;
export const DAILY_CRAFT_RECIPES = ['torch', 'stone_sword', 'hide_tunic'] as const;

export function getRecipe(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES[id];
}
