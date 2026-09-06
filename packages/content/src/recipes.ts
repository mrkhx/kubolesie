import type { ResourceType } from '@kubolesie/shared';

export type CraftOutput =
  | { kind: 'item'; templateId: string }
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

export function getRecipe(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES[id];
}
