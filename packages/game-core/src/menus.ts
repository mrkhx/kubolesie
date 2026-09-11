import {
  COMMAND_REQUIREMENTS,
  getLocation,
  getRecipe,
  resourceLabel,
  type CommandRequirement,
  type CraftRecipe,
} from '@kubolesie/content';
import type {
  GameButton,
  GameCommandType,
  ResourceType,
} from '@kubolesie/shared';
import { BACK_LABEL } from '@kubolesie/shared';
import { miningGatherBody } from './mining';
import { pagedButtons } from './paging';

export { pagedButtons } from './paging';

export type ActionMenuId = 'hub' | 'gather' | 'craft' | 'tools' | 'weapons' | 'items' | 'materials' | 'camp' | 'wedge' | 'daily' | 'furnace' | 'trade' | 'pvp' | 'prep' | 'hero' | 'profile' | 'stats' | 'ratings' | 'ratings_global' | 'ratings_pvp' | 'ratings_weekly' | 'ratings_clans' | 'clan' | 'clan_find' | 'clan_manage' | 'clan_members' | 'clan_home' | 'clan_tasks' | 'clan_donate' | 'cosmetics' | 'achievements' | 'farm' | 'quarry' | 'mist' | 'lowland' | 'seal2' | 'pvp_hub' | 'pvp_history' | 'pvp_rewards' | 'market' | 'market_buy' | 'market_sell' | 'market_mine' | 'market_auc' | 'work' | 'jobs' | 'production' | 'rootwood' | 'grove' | 'mechanism' | 'seal3' | 'trail' | 'hollow' | 'warped' | 'seal4' | 'marsh' | 'basin' | 'outpost' | 'seal5' | 'station' | 'gallery' | 'switch' | 'seal6';

export const ACTION_MENUS: readonly ActionMenuId[] = [
  'hub',
  'gather',
  'craft',
  'tools',
  'weapons',
  'items',
  'materials',
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
  'marsh',
  'basin',
  'outpost',
  'seal5',
  'station',
  'gallery',
  'switch',
  'seal6',
];

export const CRAFT_MENU_GROUPS: Record<'tools' | 'weapons' | 'items' | 'materials', readonly string[]> = {
  tools: [
    'wooden_pickaxe',
    'wooden_axe',
    'stone_pickaxe',
    'stone_axe',
    'iron_pickaxe',
    'iron_axe',
    'bronze_pickaxe',
    'bronze_axe',
    'deep_pickaxe',
    'stone_hoe',
    'iron_hoe',
  ],
  weapons: [
    'wooden_sword',
    'stone_sword',
    'iron_sword',
    'bronze_sword',
    'bow',
    'hide_tunic',
    'iron_helmet',
    'iron_chest',
    'iron_boots',
    'bronze_helmet',
    'bronze_chest',
    'bronze_boots',
    'shield',
  ],
  items: [
    'planks',
    'sticks',
    'crafting_table',
    'chest',
    'torch',
    'furnace',
    'bucket',
    'bread',
    'salvage_wood',
    'salvage_stone',
  ],
  materials: [
    'bronze_ingot',
    'copper_fitting',
    'miner_lantern',
    'improved_lantern',
    'silver_charm',
    'gold_seal',
    'gold_band',
    'copper_brace',
    'deep_charm',
    'root_rope',
    'root_brace',
    'rot_binding',
    'path_marker',
    'reed_rope',
    'marsh_platform',
    'haul_line',
    'mechanical_brace',
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
  reed_rope: '🪢 Камышовая связка',
  marsh_platform: '🪵 Топяной настил',
  haul_line: '🪢 Тяговый канат',
  mechanical_brace: '⚙ Механическая распорка',
  bronze_ingot: '🥉 Бронза ×4',
  copper_fitting: '🟠 Медный крепёж ×2',
  bronze_pickaxe: '⛏ Бронзовая кирка',
  bronze_axe: '🪓 Бронзовый топор',
  bronze_sword: '⚔ Бронзовый меч',
  miner_lantern: '🔦 Шахтёрский фонарь',
  improved_lantern: '🔦 Серебряный фонарь',
  iron_helmet: '🪖 Железный шлем',
  iron_chest: '🛡 Железная кираса',
  iron_boots: '🥾 Железные сапоги',
  bronze_helmet: '🪖 Бронзовый шлем',
  bronze_chest: '🛡 Бронзовая кираса',
  bronze_boots: '🥾 Бронзовые сапоги',
  silver_charm: '✨ Серебряный оберег',
  gold_seal: '🟡 Печать стана',
  gold_band: '🟡 Золотой обод',
  copper_brace: '🟠 Медная стяжка',
  deep_pickaxe: '💎 Жильная кирка',
  deep_charm: '💎 Жильный оберег',
};

const MENU_PARENT: Record<ActionMenuId, ActionMenuId | 'explore'> = {
  hub: 'explore',
  gather: 'hub',
  craft: 'hub',
  tools: 'craft',
  weapons: 'craft',
  items: 'craft',
  materials: 'craft',
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
  marsh: 'hub',
  basin: 'hub',
  outpost: 'hub',
  seal5: 'hub',
  station: 'hub',
  gallery: 'hub',
  switch: 'hub',
  seal6: 'hub',
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

export function ownsCraftingTable(ctx: MenuSnapshot): boolean {
  return hasCraftingTable(ctx.items) || Boolean(ctx.flags.camp_table_placed);
}

function stripDecorLabel(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recipeNeedPhrase(recipe: CraftRecipe, ctx: MenuSnapshot): string {
  const cost = effectiveRecipeCost(recipe, ctx);
  return Object.entries(cost)
    .filter(([, need]) => (need ?? 0) > 0)
    .map(([resource, need]) => `${need} ${stripDecorLabel(resourceLabel(resource as ResourceType)).toLowerCase()}`)
    .join(' + ');
}

export function recipeHint(recipe: CraftRecipe, ctx: MenuSnapshot): string {
  const need = recipeNeedPhrase(recipe, ctx);
  const stationMissing = recipe.station === 'crafting_table' && !hasCraftingTable(ctx.items);
  if (stationMissing && need) return `нужен верстак, ${need}`;
  if (stationMissing) return 'нужен верстак';
  return need;
}

export function recipeStationFailMessage(recipe: CraftRecipe, ctx: MenuSnapshot): string {
  const need = recipeNeedPhrase(recipe, ctx);
  return need ? `Нужен верстак. ${need}` : 'Нужен верстак.';
}

const CRAFT_GROUP_TITLES: Record<'tools' | 'weapons' | 'items' | 'materials', string> = {
  tools: 'Инструменты',
  weapons: 'Снаряжение',
  items: 'Базовый крафт',
  materials: 'Материалы',
};

const CRAFT_GROUP_LATER: Record<'tools' | 'weapons' | 'items' | 'materials', string> = {
  tools: 'Инструменты откроются позже — сначала верстак и дерево.',
  weapons: 'Снаряжение откроется позже по мере развития кузницы.',
  items: 'Базовый крафт откроется позже.',
  materials: 'Материалы откроются позже по мере развития кузницы и жил.',
};

export function craftGroupText(
  group: 'tools' | 'weapons' | 'items' | 'materials',
  recipes: GameButton[],
  ctx: MenuSnapshot,
  page = 0,
): string {
  if (!recipes.length) return CRAFT_GROUP_LATER[group];
  const size = 3;
  const maxPage = Math.max(0, Math.ceil(recipes.length / size) - 1);
  const used = Math.min(Math.max(0, Math.floor(page)), maxPage);
  const slice = recipes.slice(used * size, used * size + size);
  const lines = slice.map((button) => {
    const recipeId = String(button.payload?.recipeId ?? '');
    const recipe = getRecipe(recipeId);
    const name = stripDecorLabel(button.label);
    if (!recipe) return name;
    const hint = recipeHint(recipe, ctx);
    return hint ? `${name} — ${hint}` : name;
  });
  return [CRAFT_GROUP_TITLES[group], ...lines].join('\n');
}

function emptyCraftNav(group: 'tools' | 'weapons' | 'items' | 'materials'): GameButton[] {
  const nav: GameButton[] = [];
  if (group !== 'items') nav.push({ label: '🪵 Базовый', action: 'OPEN_MENU', payload: { menu: 'items' } });
  if (group !== 'tools') nav.push({ label: '⛏ Инструменты', action: 'OPEN_MENU', payload: { menu: 'tools' } });
  nav.push(backButton(group));
  return nav.slice(0, 5);
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

export function recipeGroup(recipeId: string): 'tools' | 'weapons' | 'items' | 'materials' | undefined {
  if ((CRAFT_MENU_GROUPS.tools as readonly string[]).includes(recipeId)) return 'tools';
  if ((CRAFT_MENU_GROUPS.weapons as readonly string[]).includes(recipeId)) return 'weapons';
  if ((CRAFT_MENU_GROUPS.items as readonly string[]).includes(recipeId)) return 'items';
  if ((CRAFT_MENU_GROUPS.materials as readonly string[]).includes(recipeId)) return 'materials';
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

export function visibleRecipeButtons(group: 'tools' | 'weapons' | 'items' | 'materials', ctx: MenuSnapshot): GameButton[] {
  const buttons: GameButton[] = [];
  for (const recipeId of CRAFT_MENU_GROUPS[group]) {
    const recipe = getRecipe(recipeId);
    if (!recipe) continue;
    if (recipeId === 'crafting_table' && ownsCraftingTable(ctx)) continue;
    if (recipeId === 'chest' && ctx.flags.camp_chest_built) continue;
    if (recipeId === 'campfire' && ctx.flags.camp_fire_built) continue;
    if (recipeId === 'furnace' && (ctx.flags.furnace_placed || ctx.flags.furnace_built)) continue;
    if (
      (recipeId === 'iron_pickaxe' || recipeId === 'iron_axe' || recipeId === 'iron_sword' ||
        recipeId === 'iron_helmet' || recipeId === 'iron_chest' || recipeId === 'iron_boots') &&
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
    if ((recipeId === 'reed_rope' || recipeId === 'marsh_platform') && !ctx.flags.week_4_complete) continue;
    if ((recipeId === 'haul_line' || recipeId === 'mechanical_brace') && !ctx.flags.week_5_complete) continue;
    if (
      (recipeId === 'bronze_ingot' || recipeId === 'copper_fitting' || recipeId === 'miner_lantern' || recipeId === 'copper_brace') &&
      !ctx.flags.week_1_complete &&
      !(ctx.resources.COPPER_INGOT ?? 0) &&
      !(ctx.resources.COPPER_ORE ?? 0)
    ) {
      continue;
    }
    if (
      (recipeId === 'bronze_pickaxe' || recipeId === 'bronze_axe' || recipeId === 'bronze_sword' ||
        recipeId === 'bronze_helmet' || recipeId === 'bronze_chest' || recipeId === 'bronze_boots') &&
      !ctx.flags.week_2_complete &&
      !(ctx.resources.BRONZE_INGOT ?? 0)
    ) {
      continue;
    }
    if (
      (recipeId === 'improved_lantern' || recipeId === 'silver_charm') &&
      !ctx.flags.week_3_complete &&
      !(ctx.resources.SILVER_INGOT ?? 0)
    ) {
      continue;
    }
    if (
      (recipeId === 'gold_seal' || recipeId === 'gold_band') &&
      !ctx.flags.week_4_complete &&
      !(ctx.resources.GOLD_INGOT ?? 0)
    ) {
      continue;
    }
    if (
      (recipeId === 'deep_pickaxe' || recipeId === 'deep_charm') &&
      !ctx.flags.week_5_complete &&
      !ctx.flags.week_6_complete &&
      !(ctx.resources.DEEP_CRYSTAL ?? 0)
    ) {
      continue;
    }
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
  if (ctx.flags.player_camp_founded) {
    buttons.push({ label: '🏕 Стан', action: 'OPEN_MENU', payload: { menu: 'camp' } });
  } else if (ctx.currentLocation === 'ashen_wedge') {
    buttons.push({ label: '🌲 Клин', action: 'OPEN_MENU', payload: { menu: 'wedge' } });
  } else {
    buttons.push({ label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } });
  }
  return buttons;
}

export function gatherButtons(ctx: MenuSnapshot, page = 0): GameButton[] {
  const extras: GameButton[] = [];
  if (canUseCommand('BUILD_TEMP_SHELTER', ctx) && !ctx.flags.temporary_shelter_level) {
    extras.push({ label: '🏕 Собрать укрытие', action: 'BUILD_TEMP_SHELTER' });
  }
  if (ctx.currentLocation === 'stone_scree') {
    extras.push({
      label: '🐾 Падальщик',
      action: 'DIALOGUE_CHOICE',
      payload: { nodeId: 'stone_scree', choiceId: 'scavenger' },
    });
  }
  return pagedButtons(
    [...extras, ...miningGatherBody(ctx)],
    page,
    (next) => ({ label: '➡ Ещё', action: 'OPEN_MENU', payload: { menu: 'gather', page: next } }),
    backButton('gather'),
  );
}

export function campButtons(ctx: MenuSnapshot, page = 0): GameButton[] {
  const items: GameButton[] = [];
  if (!ctx.flags.camp_table_placed && hasCraftingTable(ctx.items)) {
    items.push({ label: '🛠 Разместить верстак', action: 'PLACE_CAMP_TABLE' });
  }
  if (!ctx.flags.camp_fire_built) {
    items.push({ label: '🔥 Костёр', action: 'CRAFT_ITEM', payload: { recipeId: 'campfire' } });
  }
  if (!ctx.flags.camp_lit && (ctx.flags.camp_fire_built || ctx.items.some((item) => item.templateId === 'torch'))) {
    items.push({ label: '💡 Освещение', action: 'LIGHT_CAMP' });
  }
  if (
    ctx.flags.player_camp_founded &&
    ctx.flags.camp_table_placed &&
    ctx.flags.camp_fire_built &&
    !ctx.flags.day_2_complete
  ) {
    items.push({ label: '✅ Завершить обустройство', action: 'COMPLETE_DAY_2' });
  }
  if (ctx.flags.furnace_placed || ctx.flags.furnace_built) {
    items.push({ label: '🔥 Печь', action: 'FURNACE_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.day_3_complete) {
    items.push({ label: '🔥 Печь', action: 'CRAFT_ITEM', payload: { recipeId: 'furnace' } });
  }
  if (
    ctx.flags.furnace_placed &&
    ctx.flags.first_ingot &&
    !ctx.flags.day_4_complete &&
    ctx.items.some((item) => item.templateId === 'iron_pickaxe' || item.templateId === 'iron_axe' || item.templateId === 'iron_sword')
  ) {
    items.push({ label: '✅ Завершить День 4', action: 'COMPLETE_DAY_4' });
  }
  if (ctx.flags.week_5_complete && !ctx.flags.week_6_complete) {
    items.push({ label: '⛓ Пост', action: 'WEEK6_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.week_4_complete && !ctx.flags.week_5_complete) {
    items.push({ label: '💧 Топь', action: 'WEEK5_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.week_3_complete && !ctx.flags.week_4_complete) {
    items.push({ label: '🍂 Тропа', action: 'WEEK4_ACT', payload: { act: 'open' } });
  } else if (ctx.flags.week_2_complete) {
    items.push({ label: '🌿 Чаща', action: 'WEEK3_ACT', payload: { act: 'open' } });
  }
  if (ctx.flags.met_vel) {
    items.push({ label: '⚖ Вел', action: 'TALK_NPC', payload: { npcId: 'vel' } });
  }
  if (ctx.flags.farming_unlocked) {
    items.push({ label: '🌾 Грядка', action: 'FARM_ACT', payload: { act: 'open' } });
  }
  if (ctx.flags.week_1_complete) {
    items.push({ label: '⚒ Хозяйство', action: 'OPEN_MENU', payload: { menu: 'work' } });
  }
  items.push({ label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } });
  return pagedButtons(
    items,
    page,
    (next) => ({ label: '➡ Ещё', action: 'OPEN_MENU', payload: { menu: 'camp', page: next } }),
    backButton('camp'),
  );
}

export function craftRootButtons(): GameButton[] {
  return [
    { label: '🪵 Базовый', action: 'OPEN_MENU', payload: { menu: 'items' } },
    { label: '⛏ Инструменты', action: 'OPEN_MENU', payload: { menu: 'tools' } },
    { label: '⚔ Снаряжение', action: 'OPEN_MENU', payload: { menu: 'weapons' } },
    { label: '🧰 Материалы', action: 'OPEN_MENU', payload: { menu: 'materials' } },
    backButton('craft'),
  ];
}

export function buildActionMenu(menu: ActionMenuId, ctx: MenuSnapshot, extraText = '', page = 0): BuiltMenu {
  const location = getLocation(ctx.currentLocation)?.name ?? ctx.currentLocation;
  if (menu === 'hub') {
    return {
      id: 'hub',
      text: extraText,
      buttons: hubButtons(ctx),
    };
  }
  if (menu === 'gather') {
    const actions = gatherButtons(ctx, page);
    return {
      id: 'gather',
      text: extraText || `⛏ ДОБЫЧА. ${location}\nЧем лучше кирка — тем более редкие жилы доступны.`,
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
      buttons: campButtons(ctx, page),
    };
  }
  if (menu === 'wedge' || menu === 'daily' || menu === 'furnace' || menu === 'trade' || menu === 'pvp' || menu === 'prep' || menu === 'hero' || menu === 'profile' || menu === 'stats' || menu === 'ratings' || menu === 'clan' || menu === 'cosmetics' || menu === 'work' || menu === 'jobs' || menu === 'production') {
    return {
      id: menu,
      text: extraText || '…',
      buttons: [backButton(menu)],
    };
  }
  const group = menu as 'tools' | 'weapons' | 'items' | 'materials';
  if (group === 'tools' || group === 'weapons' || group === 'items' || group === 'materials') {
    const recipes = visibleRecipeButtons(group, ctx);
    const buttons = recipes.length
      ? pagedButtons(
          recipes,
          page,
          (next) => ({ label: '➡ Ещё', action: 'OPEN_MENU', payload: { menu: group, page: next } }),
          backButton(group),
        )
      : emptyCraftNav(group);
    return {
      id: menu,
      text: extraText || craftGroupText(group, recipes, ctx, page),
      buttons,
    };
  }
  return {
    id: 'hub',
    text: extraText,
    buttons: hubButtons(ctx),
  };
}

export function isMainHub(buttons: GameButton[]): boolean {
  return (
    buttons.length <= 5 &&
    buttons.every((button) => button.action !== 'CRAFT_ITEM') &&
    buttons.every((button) => !String(button.label).startsWith('Крафт:'))
  );
}
