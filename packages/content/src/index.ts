import type { ResourceType } from '@kubolesie/shared';
import { FOREST_NODES } from './dialogues-forest';
import { REM_NODES } from './dialogues-rem';
import { MINE_NODES } from './dialogues-mine';
import { NIGHT_NODES } from './dialogues-night';
import { DAY2_NODES } from './dialogues-day2';
import type { DialogueNode } from './dialogue-types';

export * from './flags';
export * from './items';
export * from './recipes';
export * from './enemies';
export * from './locations';
export * from './quests';
export * from './rules';
export * from './dialogue-types';

export const DIALOGUE_NODES: Record<string, DialogueNode> = {
  ...FOREST_NODES,
  ...REM_NODES,
  ...MINE_NODES,
  ...NIGHT_NODES,
  ...DAY2_NODES,
};

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
    RAW_MEAT: 'Сырое мясо',
    SHREW_FUR: 'Шкурка землеройки',
    CHITIN_PLATE: 'Хитиновая пластина',
    SHINY_STONE: 'Блестящий камень',
    FOOD: 'Еда',
    LOG: 'Бревно',
    PLANK: 'Доски',
    STICK: 'Палки',
    COBBLESTONE: 'Булыжник',
  };
  return labels[resource];
}
