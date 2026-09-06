import type { ResourceType } from '@kubolesie/shared';

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

export function getRecipe(templateId: string): CraftRecipe | undefined {
  return CRAFT_RECIPES[templateId];
}
