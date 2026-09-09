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
import { BACK_LABEL } from '@kubolesie/shared';

export type ActionMenuId = 'hub' | 'gather' | 'craft' | 'tools' | 'weapons' | 'items' | 'camp' | 'wedge' | 'daily' | 'furnace' | 'trade' | 'pvp' | 'prep' | 'hero' | 'profile' | 'stats' | 'ratings' | 'ratings_global' | 'ratings_pvp' | 'ratings_weekly' | 'ratings_clans' | 'clan' | 'clan_find' | 'clan_manage' | 'clan_members' | 'clan_home' | 'clan_tasks' | 'clan_donate' | 'cosmetics' | 'achievements' | 'farm' | 'quarry' | 'mist' | 'lowland' | 'seal2' | 'pvp_hub' | 'pvp_history' | 'pvp_rewards' | 'market' | 'market_buy' | 'market_sell' | 'market_mine' | 'market_auc' | 'work' | 'jobs' | 'production' | 'rootwood' | 'grove' | 'mechanism' | 'seal3' | 'trail' | 'hollow' | 'warped' | 'seal4';

export const ACTION_MENUS: readonly ActionMenuId[] = [
  'hub',
  'gather',
  'craft',
  'tools',
  'weapons',
  'items',
  'camp',
  'wedge',
  'daily',
  'furnace',
  'trade',
  'pvp',
  'prep',
  'hero',
  'profile',
  'stats',
  'ratings',
  'ratings_global',
  'ratings_pvp',
  'ratings_weekly',
  'ratings_clans',
  'clan',
  'clan_find',
  'clan_manage',
  'clan_members',
  'clan_home',
  'clan_tasks',
  'clan_donate',
  'cosmetics',
  'achievements',
  'farm',
  'quarry',
  'mist',
  'lowland',
  'seal2',
  'pvp_hub',
  'pvp_history',
  'pvp_rewards',
  'market',
  'market_buy',
  'market_sell',
  'market_mine',
  'market_auc',
  'work',
  'jobs',
  'production',
  'rootwood',
  'grove',
  'mechanism',
  'seal3',
  'trail',
  'hollow',
  'warped',
  'seal4',
];

export const CRAFT_MENU_GROUPS: Record<'tools' | 'weapons' | 'items', readonly string[]> = {
  tools: [
    'wooden_pickaxe',
    'wooden_axe',
    'stone_pickaxe',
    'stone_axe',
    'iron_pickaxe',
    'iron_axe',
    'stone_hoe',
    'iron_hoe',
  ],
  weapons: ['wooden_sword', 'stone_sword', 'iron_sword', 'bow'],
  items: [
    'planks',
    'sticks',
    'crafting_table',
    'salvage_wood',
    'salvage_stone',
    'chest',
    'torch',
    'hide_tunic',
    'furnace',
    'bucket',
    'shield',
    'bread',
    'root_rope',
    'root_brace',
    'rot_binding',
    'path_marker',
  ],
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
  wooden_sword: '⚔ Деревянный меч',
  stone_sword: '⚔ Каменный меч',
  hide_tunic: '🧥 Туника',
  furnace: '🔥 Печь',
  iron_pickaxe: '⛏ Железная кирка',
  iron_axe: '🪓 Железный топор',
  iron_sword: '⚔ Железный меч',
  stone_hoe: '🌾 Каменная мотыга',
  iron_hoe: '🌾 Железная мотыга',
  bow: '🏹 Лук',
  shield: '🛡 Щит',
  bucket: '🪣 Ведро',
  bread: '🍞 Хлеб',
  root_rope: '🪢 Корневая верёвка',
  root_brace: '🪵 Настил',
  rot_binding: '🪢 Гнилая связка',
  path_marker: '📍 Метка пути',
};

const MENU_PARENT: Record<ActionMenuId, ActionMenuId | 'explore'> = {
  hub: 'explore',
  gather: 'hub',
  craft: 'hub',
  tools: 'craft',
  weapons: 'craft',
  items: 'craft',
  camp: 'hub',
  wedge: 'hub',
  daily: 'wedge',
  furnace: 'hub',
  trade: 'hub',
  pvp: 'hub',
  prep: 'hub',
  hero: 'hub',
  profile: 'hero',
  stats: 'hero',
  ratings: 'hero',
  ratings_global: 'ratings',
  ratings_pvp: 'ratings',
  ratings_weekly: 'ratings',
  ratings_clans: 'ratings',
  clan: 'hero',
  clan_find: 'clan',
  clan_manage: 'clan',
  clan_members: 'clan',
  clan_home: 'clan',
  clan_tasks: 'clan',
  clan_donate: 'clan',
  cosmetics: 'profile',
  achievements: 'profile',
  farm: 'hub',
  quarry: 'hub',
  mist: 'hub',
  lowland: 'hub',
  seal2: 'hub',
  pvp_hub: 'hero',
  pvp_history: 'pvp_hub',
  pvp_rewards: 'pvp_hub',
  market: 'hero',
  market_buy: 'market',
  market_sell: 'market',
  market_mine: 'market',
  market_auc: 'market',
  work: 'stats',
  jobs: 'work',
  production: 'work',
  rootwood: 'hub',
  grove: 'hub',
  mechanism: 'hub',
  seal3: 'hub',
  trail: 'hub',
  hollow: 'hub',
  warped: 'hub',
  seal4: 'hub',
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
    label: BACK_LABEL,
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
    if (recipeId === 'furnace' && (ctx.flags.furnace_placed || ctx.flags.furnace_built)) continue;
    if (
      (recipeId === 'iron_pickaxe' || recipeId === 'iron_axe' || recipeId === 'iron_sword') &&
      !ctx.flags.first_ingot &&
      !(ctx.resources.IRON_INGOT ?? 0)
    ) {
      continue;
    }
    if (
      (recipeId === 'wooden_sword' || recipeId === 'stone_sword' || recipeId === 'hide_tunic') &&
      !ctx.flags.day_2_complete
    ) {
      continue;
    }
    if (recipeId === 'furnace' && !ctx.flags.day_3_complete) continue;
    if ((recipeId === 'stone_hoe' || recipeId === 'iron_hoe') && !ctx.flags.farming_unlocked) continue;
    if (recipeId === 'bow' && !ctx.flags.first_string && !(ctx.resources.STRING ?? 0)) continue;
    if (recipeId === 'bucket' && !ctx.flags.day_10_complete) continue;
    if (recipeId === 'shield' && !ctx.flags.day_12_complete && !ctx.flags.quarry_chamber) continue;
    if (recipeId === 'bread' && !ctx.flags.first_harvest && !(ctx.resources.WHEAT ?? 0)) continue;
    if ((recipeId === 'root_rope' || recipeId === 'root_brace') && !ctx.flags.week_2_complete) continue;
    if ((recipeId === 'rot_binding' || recipeId === 'path_marker') && !ctx.flags.week_3_complete) continue;
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
  } else if (ctx.currentLocation === 'ashen_wedge') {
    buttons.push({ label: '🌲 Клин', action: 'OPEN_MENU', payload: { menu: 'wedge' } });
  } else {
    buttons.push({ label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } });
  }
  return buttons;
}

export function gatherButtons(ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [];
  if (canUseCommand('GATHER_WOOD', ctx)) {
    buttons.push({ label: '🪓 Рубить дерево', action: 'GATHER_WOOD' });
  }
  if (canUseCommand('GATHER_STONE', ctx)) {
    buttons.push({ label: '🪨 Добыть булыжник', action: 'GATHER_STONE' });
  }
  if (canUseCommand('GATHER_IRON', ctx)) {
    buttons.push({ label: '⛏ Добыть железо', action: 'GATHER_IRON' });
  }
  if (canUseCommand('GATHER_COAL', ctx)) {
    buttons.push({ label: '⚫ Добыть уголь', action: 'GATHER_COAL' });
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
  if (ctx.flags.furnace_placed || ctx.flags.furnace_built) {
    buttons.push({ label: '🔥 Печь', action: 'FURNACE_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.day_3_complete) {
    const recipe = getRecipe('furnace');
    if (recipe && canAffordRecipe(recipe, ctx)) {
      buttons.push({ label: '🔥 Печь', action: 'CRAFT_ITEM', payload: { recipeId: 'furnace' } });
    }
  }
  if (ctx.flags.met_vel && buttons.length < 3) {
    buttons.push({ label: '⚖ Вел', action: 'TALK_NPC', payload: { npcId: 'vel' } });
  }
  if (ctx.flags.farming_unlocked && buttons.length < 4) {
    buttons.push({ label: '🌾 Грядка', action: 'FARM_ACT', payload: { act: 'open' } });
  }
  if (ctx.flags.week_1_complete && buttons.length < 4) {
    buttons.push({ label: '⚒ Хозяйство', action: 'OPEN_MENU', payload: { menu: 'work' } });
  }
  if (ctx.flags.week_3_complete && buttons.length < 4) {
    buttons.push({ label: '🍂 Тропа', action: 'WEEK4_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.week_2_complete && buttons.length < 4) {
    buttons.push({ label: '🌿 Чаща', action: 'WEEK3_ACT', payload: { act: 'open' } });
  }
  if (buttons.length < 4) {
    buttons.push({ label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } });
  }
  buttons.push(backButton('camp'));
  return buttons;
}

export function craftRootButtons(): GameButton[] {
  return [
    { label: '🛠 Инструменты', action: 'OPEN_MENU', payload: { menu: 'tools' } },
    { label: '⚔ Оружие', action: 'OPEN_MENU', payload: { menu: 'weapons' } },
    { label: '📦 Предметы', action: 'OPEN_MENU', payload: { menu: 'items' } },
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
  if (menu === 'wedge' || menu === 'daily' || menu === 'furnace' || menu === 'trade' || menu === 'pvp' || menu === 'prep' || menu === 'hero' || menu === 'profile' || menu === 'stats' || menu === 'ratings' || menu === 'clan' || menu === 'cosmetics' || menu === 'work' || menu === 'jobs' || menu === 'production') {
    return {
      id: menu,
      text: extraText || '…',
      buttons: [backButton(menu)],
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
