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
export const DAILY_CRAFT_RECIPES = ['torch', 'stone_sword', 'hide_tunic'] as const;

export function getRecipe(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES[id];
}
