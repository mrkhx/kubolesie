import {
  COMMAND_REQUIREMENTS,
  getLocation,
  getRecipe,
  type CommandRequirement,
  type CraftRecipe,
} from '@kubolesie/content';
import type {
  GameButton,
  GameCommandType,
  ResourceType,
} from '@kubolesie/shared';

export type ActionMenuId = 'hub' | 'gather' | 'craft' | 'tools' | 'weapons' | 'items' | 'camp';

export const ACTION_MENUS: readonly ActionMenuId[] = [
  'hub',
  'gather',
  'craft',
  'tools',
  'weapons',
  'items',
  'camp',
];

export const CRAFT_MENU_GROUPS: Record<'tools' | 'weapons' | 'items', readonly string[]> = {
  tools: ['wooden_pickaxe', 'wooden_axe', 'stone_pickaxe', 'stone_axe'],
  weapons: [],
  items: ['planks', 'sticks', 'crafting_table', 'salvage_wood', 'salvage_stone', 'chest', 'torch'],
};

const RECIPE_LABELS: Record<string, string> = {
  planks: '🪵 Доски',
  sticks: '🪵 Палки',
  crafting_table: '🛠 Верстак',
  wooden_pickaxe: '⛏ Деревянная кирка',
  wooden_axe: '🪓 Деревянный топор',
  stone_pickaxe: '⛏ Каменная кирка',
  stone_axe: '🪓 Каменный топор',
  salvage_wood: '♻️ Дерево → брёвна',
  salvage_stone: '♻️ Камень → булыжник',
  chest: '📦 Сундук',
  torch: '🔦 Факелы ×4',
  campfire: '🔥 Костёр',
};

const MENU_PARENT: Record<ActionMenuId, ActionMenuId | 'explore'> = {
  hub: 'explore',
  gather: 'hub',
  craft: 'hub',
  tools: 'craft',
  weapons: 'craft',
  items: 'craft',
  camp: 'hub',
};

export interface MenuSnapshot {
  currentLocation: string;
  flags: Record<string, string>;
  items: Array<{ templateId: string }>;
  resources: Partial<Record<ResourceType, number>>;
  quests: Record<string, { status: string }>;
}

export interface BuiltMenu {
  id: ActionMenuId;
  text: string;
  buttons: GameButton[];
}

export function parseMenuId(value: string | undefined): ActionMenuId {
  if (value && (ACTION_MENUS as readonly string[]).includes(value)) return value as ActionMenuId;
  return 'hub';
}

export function requirementMet(req: CommandRequirement, ctx: MenuSnapshot): boolean {
  if (req.locations && !req.locations.includes(ctx.currentLocation)) return false;
  if (req.flagsAll) {
    for (const flag of req.flagsAll) {
      if (ctx.flags[flag] == null) return false;
    }
  }
  if (req.flagsAny && !req.flagsAny.some((flag) => ctx.flags[flag] != null)) return false;
  if (req.itemsAny && !req.itemsAny.some((id) => ctx.items.some((item) => item.templateId === id))) {
    return false;
  }
  if (req.quest) {
    const quest = ctx.quests[req.quest.id];
    if (!quest || !req.quest.statuses.includes(quest.status)) return false;
  }
  return true;
}

export function canUseCommand(type: GameCommandType, ctx: MenuSnapshot): boolean {
  const req = COMMAND_REQUIREMENTS[type];
  if (!req) return true;
  return requirementMet(req, ctx);
}

export function hasCraftingTable(items: Array<{ templateId: string }>): boolean {
  return items.some((item) => item.templateId === 'crafting_table');
}

export function effectiveRecipeCost(
  recipe: CraftRecipe,
  ctx: MenuSnapshot,
): Partial<Record<ResourceType, number>> {
  if (recipe.id === 'campfire' && ctx.flags.camp_on_shelter) {
    return { ...recipe.cost, LOG: 2 };
  }
  return recipe.cost;
}

export function canAffordRecipe(recipe: CraftRecipe, ctx: MenuSnapshot): boolean {
  if (recipe.station === 'crafting_table' && !hasCraftingTable(ctx.items)) return false;
  const cost = effectiveRecipeCost(recipe, ctx);
  return Object.entries(cost).every(
    ([resource, need]) => (ctx.resources[resource as ResourceType] ?? 0) >= (need ?? 0),
  );
}

export function recipeGroup(recipeId: string): 'tools' | 'weapons' | 'items' | undefined {
  if ((CRAFT_MENU_GROUPS.tools as readonly string[]).includes(recipeId)) return 'tools';
  if ((CRAFT_MENU_GROUPS.weapons as readonly string[]).includes(recipeId)) return 'weapons';
  if ((CRAFT_MENU_GROUPS.items as readonly string[]).includes(recipeId)) return 'items';
  return undefined;
}

export function backButton(from: ActionMenuId): GameButton {
  const parent = MENU_PARENT[from];
  if (parent === 'explore') {
    return { label: '👁 Осмотреться', action: 'EXPLORE' };
  }
  return {
    label: '🔙 Назад',
    action: 'OPEN_MENU',
    payload: { menu: parent },
  };
}

function recipeButton(recipeId: string): GameButton | undefined {
  const recipe = getRecipe(recipeId);
  if (!recipe) return undefined;
  return {
    label: RECIPE_LABELS[recipeId] ?? recipe.name,
    action: 'CRAFT_ITEM',
    payload: { recipeId: recipe.id },
  };
}

export function visibleRecipeButtons(group: 'tools' | 'weapons' | 'items', ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [];
  for (const recipeId of CRAFT_MENU_GROUPS[group]) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    if (recipeId === 'crafting_table' && hasCraftingTable(ctx.items)) continue;
    if (recipeId === 'chest' && ctx.flags.camp_chest_built) continue;
    if (recipeId === 'campfire' && ctx.flags.camp_fire_built) continue;
    if (!canAffordRecipe(recipe, ctx)) continue;
    const button = recipeButton(recipeId);
    if (button) buttons.push(button);
  }
  return buttons;
}

export function hubButtons(ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [
    { label: '⛏ Добыча', action: 'OPEN_MENU', payload: { menu: 'gather' } },
    { label: '🔨 Крафт', action: 'OPEN_MENU', payload: { menu: 'craft' } },
    { label: '🎒 Инвентарь', action: 'OPEN_INVENTORY' },
    { label: '👁 Осмотреться', action: 'EXPLORE' },
  ];
  if (ctx.flags.player_camp_founded && ctx.currentLocation === 'player_camp') {
    buttons.push({ label: '🏕 Стан', action: 'OPEN_MENU', payload: { menu: 'camp' } });
  } else if (ctx.flags.met_rem) {
    buttons.push({ label: '👤 К Рему', action: 'TALK_NPC', payload: { npcId: 'rem' } });
  }
  return buttons;
}

export function gatherButtons(ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [];
  if (canUseCommand('GATHER_WOOD', ctx)) {
    buttons.push({ label: '🌲 Рубить дерево', action: 'GATHER_WOOD' });
  }
  if (canUseCommand('GATHER_STONE', ctx)) {
    buttons.push({ label: '🪨 Добывать камень', action: 'GATHER_STONE' });
  }
  if (canUseCommand('GATHER_IRON', ctx)) {
    buttons.push({ label: '⛏ Добывать руду', action: 'GATHER_IRON' });
  }
  if (canUseCommand('GATHER_COAL', ctx)) {
    buttons.push({ label: '🪨 Добывать уголь', action: 'GATHER_COAL' });
  }
  if (canUseCommand('BUILD_TEMP_SHELTER', ctx) && !ctx.flags.temporary_shelter_level) {
    buttons.push({ label: '🏕 Собрать укрытие', action: 'BUILD_TEMP_SHELTER' });
  }
  if (ctx.currentLocation === 'stone_scree') {
    buttons.push({
      label: '🐾 Падальщик',
      action: 'DIALOGUE_CHOICE',
      payload: { nodeId: 'stone_scree', choiceId: 'scavenger' },
    });
  }
  buttons.push(backButton('gather'));
  return buttons;
}

export function campButtons(ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [];
  if (!ctx.flags.camp_table_placed && hasCraftingTable(ctx.items)) {
    buttons.push({ label: '🛠 Разместить верстак', action: 'PLACE_CAMP_TABLE' });
  }
  if (!ctx.flags.camp_fire_built) {
    const recipe = getRecipe('campfire');
    if (recipe && canAffordRecipe(recipe, ctx)) {
      buttons.push({ label: '🔥 Костёр', action: 'CRAFT_ITEM', payload: { recipeId: 'campfire' } });
    }
  }
  if (!ctx.flags.camp_lit && (ctx.flags.camp_fire_built || ctx.items.some((item) => item.templateId === 'torch'))) {
    buttons.push({ label: '💡 Освещение', action: 'LIGHT_CAMP' });
  }
  if (
    ctx.flags.player_camp_founded &&
    ctx.flags.camp_table_placed &&
    ctx.flags.camp_fire_built &&
    !ctx.flags.day_2_complete
  ) {
    buttons.push({ label: '✅ Завершить обустройство', action: 'COMPLETE_DAY_2' });
  }
  buttons.push(backButton('camp'));
  return buttons;
}

export function craftRootButtons(): GameButton[] {
  return [
    { label: '🛠 Инструменты', action: 'OPEN_MENU', payload: { menu: 'tools' } },
    { label: '⚔ Оружие', action: 'OPEN_MENU', payload: { menu: 'weapons' } },
    { label: '🏕 Предметы', action: 'OPEN_MENU', payload: { menu: 'items' } },
    backButton('craft'),
  ];
}

export function buildActionMenu(menu: ActionMenuId, ctx: MenuSnapshot, extraText = ''): BuiltMenu {
  const location = getLocation(ctx.currentLocation)?.name ?? ctx.currentLocation;
  if (menu === 'hub') {
    return {
      id: 'hub',
      text: extraText,
      buttons: hubButtons(ctx),
    };
  }
  if (menu === 'gather') {
    const actions = gatherButtons(ctx);
    const hasGather = actions.some((button) =>
      ['GATHER_WOOD', 'GATHER_STONE', 'GATHER_IRON', 'GATHER_COAL'].includes(button.action),
    );
    return {
      id: 'gather',
      text: extraText || (hasGather ? `Добыча. ${location}` : `Здесь нечего добывать. ${location}`),
      buttons: actions,
    };
  }
  if (menu === 'craft') {
    return {
      id: 'craft',
      text: extraText || 'Что скрафтить?',
      buttons: craftRootButtons(),
    };
  }
  if (menu === 'camp') {
    return {
      id: 'camp',
      text: extraText || 'Стан. Только нужное.',
      buttons: campButtons(ctx),
    };
  }
  const group = menu as 'tools' | 'weapons' | 'items';
  const recipes = visibleRecipeButtons(group, ctx);
  const titles: Record<'tools' | 'weapons' | 'items', string> = {
    tools: 'Инструменты',
    weapons: 'Оружие',
    items: 'Предметы',
  };
  const empty = group === 'weapons' ? 'Пока нечего ковать.' : 'Пока нечего крафтить.';
  return {
    id: menu,
    text: extraText || (recipes.length ? titles[group] : empty),
    buttons: [...recipes, backButton(menu)],
  };
}

export function isMainHub(buttons: GameButton[]): boolean {
  return (
    buttons.length <= 5 &&
    buttons.every((button) => button.action !== 'CRAFT_ITEM') &&
    buttons.every((button) => !String(button.label).startsWith('Крафт:'))
  );
}
