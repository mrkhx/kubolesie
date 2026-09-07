import type { ResourceType } from '@kubolesie/shared';
import { FOREST_NODES } from './dialogues-forest';
import { REM_NODES } from './dialogues-rem';
import { MINE_NODES } from './dialogues-mine';
import { NIGHT_NODES } from './dialogues-night';
import { DAY2_NODES } from './dialogues-day2';
import { DAY3_NODES } from './dialogues-day3';
import { DAY4_NODES } from './dialogues-day4';
import { DAY5_NODES } from './dialogues-day5';
import { DAY6_NODES } from './dialogues-day6';
import { DAY7_NODES } from './dialogues-day7';
import { WEEK2_NODES } from './dialogues-week2';
import type { DialogueNode } from './dialogue-types';

export * from './flags';
export * from './items';
export * from './recipes';
export * from './enemies';
export * from './locations';
export * from './quests';
export * from './rules';
export * from './dialogue-types';
export * from './furnace';
export * from './trade';
export * from './pvp';
export * from './loot';
export * from './meta';

export { WEEK2_NODES } from './dialogues-week2';

export const DIALOGUE_NODES: Record<string, DialogueNode> = {
  ...FOREST_NODES,
  ...REM_NODES,
  ...MINE_NODES,
  ...NIGHT_NODES,
  ...DAY2_NODES,
  ...DAY3_NODES,
  ...DAY4_NODES,
  ...DAY5_NODES,
  ...DAY6_NODES,
  ...DAY7_NODES,
  ...WEEK2_NODES,
};

export function getDialogueNode(id: string): DialogueNode | undefined {
  return DIALOGUE_NODES[id];
}

export function resourceLabel(resource: ResourceType): string {
  const labels: Record<ResourceType, string> = {
    WOOD: '🪵 Дерево',
    STONE: '🪨 Камень',
    IRON_ORE: '⛏ Железная руда',
    FIBER: '🌿 Волокно',
    HIDE: '🦌 Шкура',
    HERBS: '🌿 Травы',
    COAL: '⚫ Уголь',
    RAW_MEAT: '🍖 Сырое мясо',
    SHREW_FUR: '🐀 Шкурка землеройки',
    CHITIN_PLATE: '🪲 Хитиновая пластина',
    SHINY_STONE: '✨ Блестящий камень',
    FOOD: '🍖 Еда',
    LOG: '🪵 Бревно',
    PLANK: '🪵 Доски',
    STICK: '🪵 Палки',
    COBBLESTONE: '🪨 Булыжник',
    IRON_INGOT: '⛓ Железный слиток',
    SEED: '🌱 Семена',
    WHEAT: '🌾 Пшеница',
    STRING: '🧵 Нить',
    REED: '🌾 Камыш',
    CLAY: '🧱 Глина',
    RAW_FISH: '🐟 Сырая рыба',
    COOKED_FISH: '🐟 Жареная рыба',
    MIST_RESIN: '🌫 Туманная смола',
    BOG_CORE: '💚 Сердцевина топи',
    SEAL_SHARD_6: '🔷 Осколок второй печати',
  };
  return labels[resource];
}
