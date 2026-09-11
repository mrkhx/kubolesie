import {
  BACK_LABEL,
  BALANCE_VERSION,
  type GameButton,
  type GameCommand,
  type GameResponse,
  type ResourceType,
} from '@kubolesie/shared';
import {
  COMBAT_LOOT,
  DAILY_CRAFT_RECIPES,
  FURNACE,
  FURNACE_QUEST_XP,
  IRON_TOOL_RECIPES,
  ITEM_TEMPLATES,
  PVP_MAX,
  PVP_RIVALS,
  PVP_WIN_COINS,
  PVP_WIN_XP,
  SMELT_ORES,
  STONE_SALVAGE_TOOLS,
  TOKEN_SALE_PRICE,
  TOOTH_SALE_PRICE,
  TRIBUTE_COBBLE,
  TRIBUTE_COINS,
  VEL_BUYS,
  WENZEL_QUEST_XP,
  getItemTemplate,
  getPvpRival,
  getVelBuy,
  getVelSell,
  nextPvpRival,
  resourceLabel,
  smeltRowUnlocked,
} from '@kubolesie/content';
import { seededChance, seededRange, simulateBattle, type CombatantSnapshot } from '@kubolesie/combat-engine';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
  RewardAlreadyClaimedError,
} from './errors';
import { formatCombatLog } from './combat-log';
import type { GameStore, InventoryItemRecord, PlayerQuestRecord, PlayerRecord } from './store';
import { grantMetaAchievement, noteActivity } from './meta';
import { noteSmelt } from './mining-metrics';

export const WEEK_MENUS = ['wedge', 'daily', 'furnace', 'trade', 'pvp', 'prep'] as const;
export type WeekMenuId = (typeof WEEK_MENUS)[number];

export function isWeekMenu(menu: string): menu is WeekMenuId {
  return (WEEK_MENUS as readonly string[]).includes(menu);
}

export const WEEK_COMMANDS = [
  'BEGIN_DAY_3',
  'BEGIN_DAY_4',
  'BEGIN_DAY_5',
  'BEGIN_DAY_6',
  'BEGIN_DAY_7',
  'COMPLETE_DAY_3',
  'COMPLETE_DAY_4',
  'COMPLETE_DAY_5',
  'COMPLETE_DAY_6',
  'COMPLETE_DAY_7',
  'FURNACE_ACT',
  'TRADE_ACT',
  'PAY_TRIBUTE',
  'START_PVP',
  'BUILD_BARRICADE',
  'HELP_PET',
  'REPAIR_LANTERN',
  'SALVAGE_ITEM',
] as const;

export interface WeekCtx {
  player: PlayerRecord;
  flags: Record<string, string>;
  items: InventoryItemRecord[];
  resources: Partial<Record<ResourceType, number>>;
  equipment: Partial<Record<string, string>>;
  quests: Record<string, PlayerQuestRecord>;
}

export interface WeekHost {
  store: GameStore;
  now: () => Date;
  respond(player: PlayerRecord, text: string, buttons: GameButton[]): Promise<GameResponse>;
  renderNode(player: PlayerRecord, nodeId: string): Promise<GameResponse>;
  load(player: PlayerRecord): Promise<WeekCtx>;
  addXp(player: PlayerRecord, amount: number): Promise<string>;
  spend(player: PlayerRecord, amount: number): Promise<void>;
  changeCoins(
    player: PlayerRecord,
    amount: number,
    reason: string,
    referenceId?: string,
  ): Promise<PlayerRecord>;
  effectiveStats(ctx: WeekCtx): Promise<{
    attack: number;
    defense: number;
    speed: number;
    critChance: number;
    critDamage: number;
    dodge: number;
    accuracy: number;
    luck: number;
    minDamage: number;
    maxDamage: number;
    woodYieldBonus: number;
    stoneYieldBonus: number;
    oreYieldBonus: number;
  }>;
}

const NAV: GameButton[] = [
  { label: '👁 Осмотреться', action: 'EXPLORE' },
  { label: '🎒 Инвентарь', action: 'OPEN_INVENTORY' },
];

function flagNum(flags: Record<string, string>, key: string): number {
  const raw = flags[key];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function hasItem(ctx: WeekCtx, templateId: string): boolean {
  return ctx.items.some((item) => item.templateId === templateId);
}

function furnaceHome(ctx: WeekCtx): string {
  return ctx.flags.player_camp_founded ? 'player_camp' : 'rem_camp';
}

async function setFlag(host: WeekHost, ctx: WeekCtx, flag: string, value = '1') {
  await host.store.setFlag(ctx.player.id, flag, value);
  ctx.flags[flag] = value;
}

async function bumpDaily(
  host: WeekHost,
  ctx: WeekCtx,
  kind: 'kill' | 'gather' | 'craft',
  note: string[] = [],
) {
  if (!ctx.flags.day_2_complete || ctx.flags.day_4_complete) return;
  const flag = kind === 'kill' ? 'daily_kill_d3' : kind === 'gather' ? 'daily_gather_d3' : 'daily_craft_d3';
  const questId = kind === 'kill' ? 'daily_kill' : kind === 'gather' ? 'daily_gather' : 'daily_craft';
  const quest = ctx.quests[questId];
  const progress = { ...(quest?.progress ?? {}) };
  const count = Number(progress.count ?? 0) + 1;
  progress.count = count;
  const need = kind === 'kill' ? 2 : 1;
  const done = count >= need;
  if (quest) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId,
      status: done ? 'CLAIMED' : 'ACTIVE',
      progress,
    });
  }
  if (done && !ctx.flags[flag]) {
    await setFlag(host, ctx, flag);
    await noteActivity(host.store, ctx.player, { type: 'quest', id: questId, daily: true });
    note.push(`Ежедневка закрыта: ${kind === 'kill' ? 'бой' : kind === 'gather' ? 'добыча' : 'крафт'}.`);
  }
  if (ctx.flags.daily_kill_d3 && ctx.flags.daily_gather_d3 && ctx.flags.daily_craft_d3 && !ctx.flags.daily_crate_d3) {
    const ok = await host.store.tryClaimReward(ctx.player.id, 'crate', 'daily_crate_d3');
    if (ok) {
      await setFlag(host, ctx, 'daily_crate_d3');
      await host.changeCoins(ctx.player, 15, 'daily_crate', 'd3');
      await host.store.addResource(ctx.player.id, 'STICK', 4);
      note.push('Сундук ежедневок: +15 монет, +4 палки.');
    }
  }
}

export async function noteDailyCraft(host: WeekHost, ctx: WeekCtx, recipeId: string): Promise<string[]> {
  const notes: string[] = [];
  if ((DAILY_CRAFT_RECIPES as readonly string[]).includes(recipeId) || recipeId === 'wooden_sword') {
    await bumpDaily(host, ctx, 'craft', notes);
  }
  return notes;
}

export async function noteDailyGather(host: WeekHost, ctx: WeekCtx): Promise<string[]> {
  const notes: string[] = [];
  await bumpDaily(host, ctx, 'gather', notes);
  return notes;
}

export function afterCraftFlags(recipeId: string, flags: Record<string, string>): string[] {
  const extra: string[] = [];
  if (recipeId === 'furnace') extra.push('furnace_placed', 'furnace_built');
  if ((IRON_TOOL_RECIPES as readonly string[]).includes(recipeId)) {
    if (!flags.chose_iron_pickaxe && !flags.chose_iron_axe && !flags.chose_iron_sword) {
      extra.push(
        recipeId === 'iron_pickaxe'
          ? 'chose_iron_pickaxe'
          : recipeId === 'iron_axe'
            ? 'chose_iron_axe'
            : 'chose_iron_sword',
      );
    }
  }
  if (recipeId === 'stone_hoe' || recipeId === 'iron_hoe') extra.push('has_hoe');
  if (recipeId === 'bow') extra.push('has_bow', 'first_bow');
  if (recipeId === 'shield') extra.push('has_shield');
  if (recipeId === 'bucket') extra.push('has_bucket');
  if (recipeId === 'root_rope') extra.push('has_root_rope');
  if (recipeId === 'root_brace') extra.push('root_barricade');
  if (recipeId === 'rot_binding') extra.push('has_rot_binding');
  if (recipeId === 'path_marker') extra.push('has_path_marker');
  if (recipeId === 'reed_rope') extra.push('has_reed_rope');
  if (recipeId === 'marsh_platform') extra.push('has_marsh_platform');
  if (recipeId === 'haul_line') extra.push('has_haul_line');
  if (recipeId === 'mechanical_brace') extra.push('has_mechanical_brace');
  if (recipeId === 'bronze_pickaxe') extra.push('has_bronze_pickaxe');
  if (recipeId === 'deep_pickaxe') extra.push('has_deep_pickaxe');
  return extra;
}

export function furnaceCraftLocationOk(ctx: WeekCtx): boolean {
  if (ctx.flags.player_camp_founded) return ctx.player.currentLocation === 'player_camp';
  return ctx.player.currentLocation === 'rem_camp';
}

export async function dispatchWeek(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_3':
      return beginDay(host, ctx, 3);
    case 'BEGIN_DAY_4':
      return beginDay(host, ctx, 4);
    case 'BEGIN_DAY_5':
      return beginDay(host, ctx, 5);
    case 'BEGIN_DAY_6':
      return beginDay(host, ctx, 6);
    case 'BEGIN_DAY_7':
      return beginDay(host, ctx, 7);
    case 'COMPLETE_DAY_3':
      return completeDay3(host, ctx);
    case 'COMPLETE_DAY_4':
      return completeDay4(host, ctx);
    case 'COMPLETE_DAY_5':
      return completeDay5(host, ctx);
    case 'COMPLETE_DAY_6':
      return completeDay6(host, ctx);
    case 'COMPLETE_DAY_7':
      return completeDay7(host, ctx);
    case 'FURNACE_ACT':
      return furnaceAct(host, ctx, command.payload ?? {});
    case 'TRADE_ACT':
      return tradeAct(host, ctx, command.payload ?? {});
    case 'PAY_TRIBUTE':
      return payTribute(host, ctx, String(command.payload?.with ?? 'coins'));
    case 'START_PVP':
      return startPvp(host, ctx, eventId, String(command.payload?.rivalId ?? ''));
    case 'BUILD_BARRICADE':
      return buildBarricade(host, ctx);
    case 'HELP_PET':
      return helpPet(host, ctx, String(command.payload?.act ?? 'help'));
    case 'REPAIR_LANTERN':
      return repairLantern(host, ctx);
    case 'SALVAGE_ITEM':
      return salvageItem(host, ctx, String(command.payload?.itemId ?? ''));
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  const prev = `day_${day - 1}_complete`;
  const cur = `day_${day}_complete`;
  if (!ctx.flags[prev]) throw new ActionRejectedError('Сначала закрой предыдущий день.');
  if (ctx.flags[cur] || ctx.flags.week_1_complete) {
    return host.renderNode(ctx.player, day === 7 ? 'week1_complete' : `day${day}_complete`);
  }
  if (day === 3) {
    ctx.player.currentLocation = 'ashen_wedge';
    ctx.player.currentState = 'day3_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'visited_ashen_wedge');
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'daily_kill',
      status: 'ACTIVE',
      progress: { count: 0 },
    });
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'daily_gather',
      status: 'ACTIVE',
      progress: { count: 0 },
    });
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'daily_craft',
      status: 'ACTIVE',
      progress: { count: 0 },
    });
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'stumpfang_hunt',
      status: 'AVAILABLE',
      progress: {},
    });
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'ridgewalker_rumor',
      title: 'Слух о гребнеходе',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day3_start');
  }
  if (day === 4) {
    ctx.player.currentLocation = furnaceHome(ctx);
    ctx.player.currentState = 'day4_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'light_the_furnace',
      status: 'ACTIVE',
      progress: {},
    });
    const node = await host.renderNode(ctx.player, 'day4_start');
    if (ctx.flags.unknown_blue_mineral) {
      node.text = `${node.text}\n— Синее в печь не клади. Я проверял. Печь не та.`;
    }
    return node;
  }
  if (day === 5) {
    ctx.player.currentLocation = furnaceHome(ctx);
    ctx.player.currentState = 'day5_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'met_vel');
    await setFlag(host, ctx, 'salvage_unlocked');
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'deal_with_vel',
      status: 'ACTIVE',
      progress: {},
    });
    return host.renderNode(ctx.player, 'day5_start');
  }
  if (day === 6) {
    ctx.player.currentLocation = 'stone_scree';
    ctx.player.currentState = 'day6_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'yara_claim_seen');
    await setFlag(host, ctx, 'pvp_unlocked');
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'yara_claim',
      status: 'ACTIVE',
      progress: {},
    });
    return host.renderNode(ctx.player, 'day6_start');
  }
  ctx.player.currentLocation = 'seal_forecourt';
  ctx.player.currentState = 'day7_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'gate_failing');
  await setFlag(host, ctx, 'wenzel_seen');
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: 'hold_the_hinges',
    status: 'ACTIVE',
    progress: {},
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'wenzel_warden',
    title: 'Вензель',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day7_start');
  if (
    !ctx.flags.sold_rusty_token &&
    !ctx.flags.pressed_rem_about_night &&
    (ctx.flags.showed_token_to_rem || flagNum(ctx.flags, 'rem_trust') >= 1)
  ) {
    await setFlag(host, ctx, 'rem_revealed_hinge');
    node.text = `${node.text}\nРем тихо: «Бей шарниры, не пластины. Семёрка на боку — не сердце.»`;
  }
  return node;
}

async function completeDay3(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.day_3_complete) return host.renderNode(ctx.player, 'day3_complete');
  if (!ctx.flags.visited_ashen_wedge) throw new ActionRejectedError('Сначала Сизый клин.');
  if (!ctx.flags.wedge_path_cleared && !ctx.flags.defeated_stumpfang) {
    throw new ActionRejectedError('Пройди хотя бы тропу клина.');
  }
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', 'day_3');
  if (!ok) {
    await setFlag(host, ctx, 'day_3_complete');
    return host.renderNode(ctx.player, 'day3_complete');
  }
  if (!ctx.flags.wedge_map_fragment && !ctx.flags.wedge_map_fragment_poor) {
    await setFlag(host, ctx, 'wedge_map_fragment_poor');
    const item = await host.store.createItem({
      playerId: ctx.player.id,
      templateId: 'wedge_map_fragment',
      rarity: 'UNCOMMON',
    });
    await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
  }
  await setFlag(host, ctx, 'day_3_complete');
  const xp = await host.addXp(ctx.player, 25);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: 'day_3' });
  await noteActivity(host.store, ctx.player, { type: 'day', day: 3 });
  const node = await host.renderNode(ctx.player, 'day3_complete');
  node.text = `${node.text}\n${xp}`;
  if (ctx.flags.wedge_map_fragment_poor && !ctx.flags.wedge_map_fragment) {
    node.text = `${node.text}\nРем вечером: «Нашли на тропе, пока ты копался.» Обрывок хуже — меньше символов.`;
  }
  return node;
}

async function completeDay4(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.day_4_complete) return host.renderNode(ctx.player, 'day4_complete');
  if (!ctx.flags.furnace_placed) throw new ActionRejectedError('Сначала печь.');
  if (!ctx.flags.first_ingot) throw new ActionRejectedError('Сначала выплави слиток.');
  const hasIron = IRON_TOOL_RECIPES.some((id) => hasItem(ctx, id));
  if (!hasIron) throw new ActionRejectedError('Скрафти одно железное орудие.');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', 'light_the_furnace');
  if (ok) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'light_the_furnace',
      status: 'CLAIMED',
      progress: { ingot: true, tool: true },
    });
    await host.addXp(ctx.player, FURNACE_QUEST_XP);
  }
  await setFlag(host, ctx, 'day_4_complete');
  await noteActivity(host.store, ctx.player, { type: 'quest', id: 'light_the_furnace' });
  await noteActivity(host.store, ctx.player, { type: 'day', day: 4 });
  return host.renderNode(ctx.player, 'day4_complete');
}

async function completeDay5(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.day_5_complete) return host.renderNode(ctx.player, 'day5_complete');
  if (!ctx.flags.met_vel) throw new ActionRejectedError('Сначала встреть Вела.');
  if (!ctx.flags.traded_with_vel && !ctx.flags.vel_declined) {
    throw new ActionRejectedError('Купи, продай или явно откажись.');
  }
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', 'deal_with_vel');
  if (ok) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'deal_with_vel',
      status: 'CLAIMED',
      progress: {},
    });
    await host.addXp(ctx.player, 20);
  }
  await setFlag(host, ctx, 'day_5_complete');
  await noteActivity(host.store, ctx.player, { type: 'quest', id: 'deal_with_vel' });
  await noteActivity(host.store, ctx.player, { type: 'day', day: 5 });
  return host.renderNode(ctx.player, 'day5_complete');
}

async function completeDay6(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.day_6_complete) return host.renderNode(ctx.player, 'day6_complete');
  const fights = flagNum(ctx.flags, 'pvp_skirmishes');
  if (!ctx.flags.paid_scree_tribute && fights < 1) {
    throw new ActionRejectedError('Ответь на след или снеси дань.');
  }
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', 'yara_claim');
  if (ok) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'yara_claim',
      status: 'CLAIMED',
      progress: { tribute: Boolean(ctx.flags.paid_scree_tribute), fights },
    });
    await host.addXp(ctx.player, 20);
  }
  await setFlag(host, ctx, 'day_6_complete');
  await setFlag(host, ctx, 'gate_failing');
  await noteActivity(host.store, ctx.player, { type: 'quest', id: 'yara_claim' });
  await noteActivity(host.store, ctx.player, { type: 'day', day: 6 });
  return host.renderNode(ctx.player, 'day6_complete');
}

async function completeDay7(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.week_1_complete) return host.renderNode(ctx.player, 'week1_complete');
  if (!ctx.flags.wenzel_defeated) throw new ActionRejectedError('Сначала Вензель.');
  await setFlag(host, ctx, 'seen_seven_seals');
  await setFlag(host, ctx, 'day_7_complete');
  await setFlag(host, ctx, 'week_1_complete');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'seven_seals',
    title: 'Семь печатей',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'unknown_node7_creature',
    title: '???',
    seen: true,
    defeated: false,
  });
  await noteActivity(host.store, ctx.player, { type: 'day', day: 7 });
  await noteActivity(host.store, ctx.player, { type: 'week' });
  return host.renderNode(ctx.player, 'seven_seals');
}

export async function openWeekMenu(host: WeekHost, ctx: WeekCtx, menu: WeekMenuId): Promise<GameResponse> {
  if (menu === 'wedge' || menu === 'daily') {
    if (!ctx.flags.day_2_complete) throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
  if (menu === 'furnace') {
    if (!ctx.flags.furnace_placed && !ctx.flags.furnace_built) {
      throw new ActionRejectedError('Печи нет. Восемь булыжников на стане.');
    }
  }
  if (menu === 'trade') {
    if (!ctx.flags.met_vel) throw new ActionRejectedError('Вела ещё нет.');
  }
  if (menu === 'pvp') {
    if (!ctx.flags.yara_claim_seen) throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
  if (menu === 'prep') {
    if (!ctx.flags.day_6_complete && !ctx.flags.gate_failing && !ctx.flags.wenzel_seen) {
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
    }
  }
  if (menu === 'wedge') {
    if (ctx.player.currentLocation !== 'ashen_wedge') {
      ctx.player.currentLocation = 'ashen_wedge';
      await host.store.savePlayer(ctx.player);
    }
    return wedgeMenu(host, ctx);
  }
  if (menu === 'daily') return dailyMenu(host, ctx);
  if (menu === 'furnace') return furnaceAct(host, ctx, { act: 'open' });
  if (menu === 'trade') return tradeAct(host, ctx, { act: 'open' });
  if (menu === 'pvp') {
    if (ctx.player.currentLocation !== 'stone_scree' && ctx.player.currentLocation !== 'rival_camp_edge') {
      ctx.player.currentLocation = 'stone_scree';
      await host.store.savePlayer(ctx.player);
    }
    return pvpMenu(host, ctx);
  }
  if (ctx.player.currentLocation !== 'seal_forecourt' && ctx.player.currentLocation !== 'node_7') {
    ctx.player.currentLocation = 'seal_forecourt';
    await host.store.savePlayer(ctx.player);
  }
  return prepMenu(host, ctx);
}

function wedgeMenu(_host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  const buttons: GameButton[] = [];
  if (!ctx.flags.wedge_path_cleared) {
    buttons.push({ label: 'На тропу', action: 'START_PVE', payload: { enemyId: 'moss_boar' } });
  } else {
    buttons.push({ label: 'Тропа ещё', action: 'START_PVE', payload: { enemyId: 'needle_runner' } });
  }
  if (ctx.flags.wedge_path_cleared && !ctx.flags.wedge_pitch_cleared) {
    buttons.push({ label: 'Глубже', action: 'START_PVE', payload: { enemyId: 'pitch_mite' } });
  } else if (ctx.flags.wedge_pitch_cleared && !ctx.flags.wedge_roots_cleared) {
    buttons.push({ label: 'Корневая яма', action: 'START_PVE', payload: { enemyId: 'resin_brute' } });
  } else if (ctx.flags.wedge_roots_cleared) {
    buttons.push({ label: 'Элита ещё', action: 'START_PVE', payload: { enemyId: 'resin_brute' } });
  }
  if (ctx.flags.wedge_pitch_cleared || ctx.flags.stumpfang_failed || ctx.flags.defeated_stumpfang) {
    buttons.push({ label: 'Пнеклык', action: 'DIALOGUE_CHOICE', payload: { nodeId: 'stumpfang_gate', choiceId: 'fight' } });
  }
  if (buttons.length < 4) {
    buttons.push({ label: 'Ежедневки', action: 'OPEN_MENU', payload: { menu: 'daily' } });
  }
  if (
    ctx.flags.wedge_path_cleared &&
    !ctx.flags.day_3_complete &&
    buttons.length < 5
  ) {
    buttons.push({ label: 'Завершить День 3', action: 'COMPLETE_DAY_3' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    'Сизый клин. Хвоя кубами. Смола пахнет железом.',
    ctx.flags.defeated_stumpfang ? 'Пнеклык повержен. Фарм открыт.' : 'Пнеклык ждёт в котловине.',
  ].join('\n');
  return _host.respond(ctx.player, text, buttons.slice(0, 5));
}

function dailyMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  const kill = ctx.flags.daily_kill_d3 ? 'закрыта' : `${Number(ctx.quests.daily_kill?.progress?.count ?? 0)}/2`;
  const gather = ctx.flags.daily_gather_d3 ? 'закрыта' : 'открыта';
  const craft = ctx.flags.daily_craft_d3 ? 'закрыта' : 'открыта';
  const crate = ctx.flags.daily_crate_d3 ? 'Сундук получен.' : 'Три из трёх — сундук.';
  return host.respond(
    ctx.player,
    `Ежедневки клина (сутки недели).\nБой: ${kill}\nДобыча: ${gather}\nКрафт: ${craft}\n${crate}`,
    [
      { label: 'На тропу', action: 'START_PVE', payload: { enemyId: 'moss_boar' } },
      { label: 'Клин', action: 'OPEN_MENU', payload: { menu: 'wedge' } },
      { label: BACK_LABEL, action: 'OPEN_CAMP' },
    ],
  );
}

async function furnaceAct(host: WeekHost, ctx: WeekCtx, payload: Record<string, unknown>): Promise<GameResponse> {
  if (!ctx.flags.furnace_placed && !ctx.flags.furnace_built) {
    throw new ActionRejectedError('Печи нет. Восемь булыжников на стане.');
  }
  const act = String(payload.act ?? 'open');
  const fuel = flagNum(ctx.flags, 'furnace_fuel');
  const output = flagNum(ctx.flags, 'furnace_output');
  const ore = ctx.resources.IRON_ORE ?? 0;
  if (act === 'add_coal') {
    if ((ctx.resources.COAL ?? 0) < 1) throw new InsufficientResourcesError('Нужен уголь.');
    await host.store.addResource(ctx.player.id, 'COAL', -1);
    const next = fuel + FURNACE.coalFuel;
    await setFlag(host, ctx, 'furnace_fuel', String(next));
    return furnaceScreen(host, await host.load(ctx.player), `Положен уголь. Топливо +${FURNACE.coalFuel}.`);
  }
  if (act === 'add_log') {
    if ((ctx.resources.LOG ?? 0) < FURNACE.logCost) {
      throw new InsufficientResourcesError(`Нужно ${FURNACE.logCost} брёвен.`);
    }
    await host.store.addResource(ctx.player.id, 'LOG', -FURNACE.logCost);
    const next = fuel + FURNACE.logFuel;
    await setFlag(host, ctx, 'furnace_fuel', String(next));
    return furnaceScreen(host, await host.load(ctx.player), `Дрова. Топливо +${FURNACE.logFuel}. Хуже угля.`);
  }
  if (act === 'smelt_blue' || act === 'blue') {
    return furnaceScreen(
      host,
      ctx,
      'Печь нагревает осколок, но он не меняется. Синее в слиток не течёт.',
    );
  }
  if (act === 'smelt') {
    if (ore < 1) throw new InsufficientResourcesError('Нет железной руды.');
    if (fuel < FURNACE.smeltCost) throw new ActionRejectedError('Не хватает топлива. Положи уголь.');
    await host.store.addResource(ctx.player.id, 'IRON_ORE', -1);
    const nextFuel = Math.max(0, fuel - FURNACE.smeltCost);
    const nextOut = output + 1;
    await setFlag(host, ctx, 'furnace_fuel', String(nextFuel));
    await setFlag(host, ctx, 'furnace_output', String(nextOut));
    if (!ctx.flags.first_ingot) {
      await setFlag(host, ctx, 'first_ingot');
      await grantMetaAchievement(host.store, ctx.player.id, 'FIRST_IRON');
    }
    noteSmelt('IRON_ORE');
    await noteActivity(host.store, ctx.player, { type: 'furnace', act: 'smelt', amount: 1 });
    return furnaceScreen(host, await host.load(ctx.player), `Плавка. Слиток в золе. Топливо ${nextFuel}.`);
  }
  if (act === 'cook_fish' || act === 'cook') {
    if ((ctx.resources.RAW_FISH ?? 0) < 1) throw new InsufficientResourcesError('Нет сырой рыбы.');
    if (fuel < FURNACE.cookCost) throw new ActionRejectedError('Не хватает топлива. Положи уголь.');
    await host.store.addResource(ctx.player.id, 'RAW_FISH', -1);
    const nextFuel = Math.max(0, fuel - FURNACE.cookCost);
    await setFlag(host, ctx, 'furnace_fuel', String(nextFuel));
    await host.store.addResource(ctx.player.id, 'COOKED_FISH', 1);
    await noteActivity(host.store, ctx.player, { type: 'furnace', act: 'cook_fish', amount: 1 });
    return furnaceScreen(host, await host.load(ctx.player), `Рыба готова. Топливо ${nextFuel}.`);
  }
  if (act === 'take') {
    if (output < 1) throw new ActionRejectedError('В золе пусто.');
    await host.store.addResource(ctx.player.id, 'IRON_INGOT', output);
    await setFlag(host, ctx, 'furnace_output', '0');
    const total = (await host.store.getResources(ctx.player.id)).IRON_INGOT ?? 0;
    return furnaceScreen(host, await host.load(ctx.player), `Забрано слитков: ${output} (всего ${total}).`);
  }
  if (act === 'ores') {
    return furnaceOresScreen(host, ctx, Number(payload.page ?? 0));
  }
  if (act === 'ore') {
    return furnaceOreScreen(host, ctx, String(payload.ore ?? ''));
  }
  if (act === 'smelt_ore') {
    return smeltNamedOre(host, ctx, String(payload.ore ?? ''));
  }
  return furnaceScreen(host, ctx);
}

function expandedSmeltRows(ctx: WeekCtx) {
  return SMELT_ORES.filter((row) => smeltRowUnlocked(row, ctx.flags, ctx.resources));
}

function furnaceHasExpanded(ctx: WeekCtx): boolean {
  return expandedSmeltRows(ctx).some((row) => row.ore !== 'IRON_ORE');
}

async function smeltNamedOre(host: WeekHost, ctx: WeekCtx, ore: string): Promise<GameResponse> {
  const row = SMELT_ORES.find((item) => item.ore === ore);
  if (!row) throw new ActionRejectedError('Эту руду печь не берёт.');
  if (!smeltRowUnlocked(row, ctx.flags, ctx.resources)) {
    throw new ActionRejectedError('Эта плавка ещё закрыта.');
  }
  if (row.ore === 'IRON_ORE') {
    return furnaceAct(host, ctx, { act: 'smelt' });
  }
  const have = ctx.resources[row.ore] ?? 0;
  const fuel = flagNum(ctx.flags, 'furnace_fuel');
  if (have < 1) throw new InsufficientResourcesError(`Нет: ${resourceLabel(row.ore)}.`);
  if (fuel < FURNACE.smeltCost) throw new ActionRejectedError('Не хватает топлива. Положи уголь.');
  await host.store.addResource(ctx.player.id, row.ore, -1);
  const nextFuel = Math.max(0, fuel - FURNACE.smeltCost);
  await setFlag(host, ctx, 'furnace_fuel', String(nextFuel));
  const total = await host.store.addResource(ctx.player.id, row.ingot, 1);
  noteSmelt(row.ore);
  await noteActivity(host.store, ctx.player, { type: 'furnace', act: 'smelt', amount: 1 });
  const fresh = await host.load(ctx.player);
  return furnaceOreScreen(
    host,
    fresh,
    row.ore,
    `Выплавлено: ${resourceLabel(row.ingot)} ×1 (всего ${total}). Топливо ${nextFuel}.`,
  );
}

function furnaceOresScreen(host: WeekHost, ctx: WeekCtx, page: number): Promise<GameResponse> {
  const rows = expandedSmeltRows(ctx);
  const fuel = flagNum(ctx.flags, 'furnace_fuel');
  const buttons: GameButton[] = rows.map((row) => ({
    label: `${row.label} (${ctx.resources[row.ore] ?? 0})`,
    action: 'FURNACE_ACT',
    payload: { act: 'ore', ore: row.ore },
  }));
  if ((ctx.resources.RAW_FISH ?? 0) > 0) {
    buttons.push({ label: 'Жарить рыбу', action: 'FURNACE_ACT', payload: { act: 'cook_fish' } });
  }
  buttons.push({ label: 'Дрова', action: 'FURNACE_ACT', payload: { act: 'add_log' } });
  if (ctx.flags.unknown_blue_mineral) {
    buttons.push({ label: 'Синее', action: 'FURNACE_ACT', payload: { act: 'smelt_blue' } });
  }
  const safe = Math.max(0, Math.floor(page));
  const pageSize = 3;
  const slice = buttons.slice(safe * pageSize, safe * pageSize + pageSize);
  const out = [...slice];
  if ((safe + 1) * pageSize < buttons.length) {
    out.push({ label: '➡ Ещё', action: 'FURNACE_ACT', payload: { act: 'ores', page: safe + 1 } });
  }
  out.push({ label: BACK_LABEL, action: 'FURNACE_ACT', payload: { act: 'open' } });
  return host.respond(
    ctx.player,
    `Плавка. Топливо: ${fuel}. 1 руда = 1 слиток. 1 топливо за плавку.`,
    out,
  );
}

function furnaceOreScreen(host: WeekHost, ctx: WeekCtx, ore: string, extra = ''): Promise<GameResponse> {
  const row = SMELT_ORES.find((item) => item.ore === ore);
  if (!row) throw new ActionRejectedError('Эту руду печь не берёт.');
  const fuel = flagNum(ctx.flags, 'furnace_fuel');
  const have = ctx.resources[row.ore] ?? 0;
  const ingots = ctx.resources[row.ingot] ?? 0;
  const can = Math.min(have, fuel);
  const text = [
    extra,
    `${row.label}.`,
    `Руда: ${have}. Топливо: ${fuel}. Слитков сейчас: ${ingots}.`,
    `Получится за эту плавку: ${have && fuel ? 1 : 0} (можно ещё ${can}).`,
    '1 руда = 1 слиток. 1 топливо за плавку.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, [
    { label: 'Выплавить', action: 'FURNACE_ACT', payload: { act: 'smelt_ore', ore: row.ore } },
    { label: 'Другая руда', action: 'FURNACE_ACT', payload: { act: 'ores' } },
    { label: BACK_LABEL, action: 'FURNACE_ACT', payload: { act: 'open' } },
  ]);
}

function furnaceScreen(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  const fuel = flagNum(ctx.flags, 'furnace_fuel');
  const output = flagNum(ctx.flags, 'furnace_output');
  const extraOres = expandedSmeltRows(ctx)
    .filter((row) => row.ore !== 'IRON_ORE')
    .map((row) => `${resourceLabel(row.ore)}: ${ctx.resources[row.ore] ?? 0}`)
    .join(', ');
  const text = [
    extra,
    `Печь. Топливо: ${fuel}. Слитки в золе: ${output}. Руда: ${ctx.resources.IRON_ORE ?? 0}.`,
    extraOres ? `Ещё руда: ${extraOres}.` : '',
    (ctx.resources.RAW_FISH ?? 0) > 0 ? `Сырая рыба: ${ctx.resources.RAW_FISH}.` : '',
    '1 уголь = 8 плавок. 2 бревна = 3. Синее не класть.',
  ]
    .filter(Boolean)
    .join('\n');
  const buttons: GameButton[] = [
    { label: 'Положить руду', action: 'FURNACE_ACT', payload: { act: 'smelt' } },
  ];
  if (furnaceHasExpanded(ctx)) {
    buttons.push({ label: 'Другая руда', action: 'FURNACE_ACT', payload: { act: 'ores' } });
  } else if ((ctx.resources.RAW_FISH ?? 0) > 0) {
    buttons.push({ label: 'Жарить рыбу', action: 'FURNACE_ACT', payload: { act: 'cook_fish' } });
  }
  buttons.push({ label: 'Положить уголь', action: 'FURNACE_ACT', payload: { act: 'add_coal' } });
  buttons.push({ label: 'Забрать слитки', action: 'FURNACE_ACT', payload: { act: 'take' } });
  if (buttons.length < 4 && ctx.flags.unknown_blue_mineral && (ctx.resources.RAW_FISH ?? 0) < 1 && !furnaceHasExpanded(ctx)) {
    buttons.push({ label: 'Синее', action: 'FURNACE_ACT', payload: { act: 'smelt_blue' } });
  } else if (buttons.length < 4) {
    buttons.push({ label: 'Дрова', action: 'FURNACE_ACT', payload: { act: 'add_log' } });
  }
  buttons.push({ label: 'Отойти', action: 'OPEN_CAMP' });
  return host.respond(ctx.player, text, buttons);
}

async function tradeAct(host: WeekHost, ctx: WeekCtx, payload: Record<string, unknown>): Promise<GameResponse> {
  if (!ctx.flags.met_vel) throw new ActionRejectedError('Вела ещё нет.');
  const act = String(payload.act ?? 'open');
  if (act === 'decline') {
    await setFlag(host, ctx, 'vel_declined');
    await setFlag(host, ctx, 'traded_with_vel');
    return host.respond(ctx.player, 'Вел пожимает плечами. — Не все считают. Ладно.', [
      { label: 'Завершить День 5', action: 'COMPLETE_DAY_5' },
      { label: 'К стану', action: 'OPEN_CAMP' },
    ]);
  }
  if (act === 'sell_token') {
    if (!hasItem(ctx, 'rusty_token')) throw new ActionRejectedError('Жетона нет.');
    const token = ctx.items.find((item) => item.templateId === 'rusty_token')!;
    const ok = await host.store.tryClaimReward(ctx.player.id, 'trade', 'rusty_token');
    if (!ok) throw new RewardAlreadyClaimedError('Жетон уже продан.');
    await host.store.removeItem(token.id);
    await host.changeCoins(ctx.player, TOKEN_SALE_PRICE, 'vel_token', 'rusty_token');
    await setFlag(host, ctx, 'sold_rusty_token');
    await setFlag(host, ctx, 'traded_with_vel');
    await host.store.adjustNpcRelation(ctx.player.id, 'rem', -3, 0);
    await noteActivity(host.store, ctx.player, { type: 'trade' });
    return host.respond(
      ctx.player,
      `Вел прячет жетон. +${TOKEN_SALE_PRICE} монет. Рем этого не простит. Узел уже активирован.`,
      tradeButtons(ctx),
    );
  }
  if (act === 'sell_tooth') {
    if (!hasItem(ctx, 'stumpfang_tooth')) throw new ActionRejectedError('Клыка нет.');
    const tooth = ctx.items.find((item) => item.templateId === 'stumpfang_tooth')!;
    const ok = await host.store.tryClaimReward(ctx.player.id, 'trade', 'stumpfang_tooth');
    if (!ok) throw new RewardAlreadyClaimedError();
    await host.store.removeItem(tooth.id);
    await host.changeCoins(ctx.player, TOOTH_SALE_PRICE, 'vel_tooth', 'stumpfang_tooth');
    await setFlag(host, ctx, 'sold_stumpfang_tooth');
    await setFlag(host, ctx, 'traded_with_vel');
    await noteActivity(host.store, ctx.player, { type: 'trade' });
    return host.respond(
      ctx.player,
      `Вел: «Зуб пня. На гребне такие вешают на двери.» +${TOOTH_SALE_PRICE} монет.`,
      tradeButtons(ctx),
    );
  }
  if (act === 'buy') {
    const sku = getVelBuy(String(payload.sku ?? ''));
    if (!sku) throw new ActionRejectedError('Такого нет.');
    if (sku.once && sku.id === 'glass' && ctx.flags.bought_glass) {
      throw new ActionRejectedError('Стекло уже куплено.');
    }
    if (ctx.player.coins < sku.price) throw new InsufficientCoinsError('Не хватает монет.');
    await host.changeCoins(ctx.player, -sku.price, 'vel_buy', sku.id);
    if (sku.kind === 'item' && sku.templateId) {
      const template = getItemTemplate(sku.templateId)!;
      const item = await host.store.createItem({
        playerId: ctx.player.id,
        templateId: template.id,
        rarity: template.rarity,
      });
      await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'CREATED' });
      if (sku.id === 'glass') await setFlag(host, ctx, 'bought_glass');
      if (sku.id === 'resin_mail') await setFlag(host, ctx, 'has_rare_d5');
    } else if (sku.resource) {
      await host.store.addResource(ctx.player.id, sku.resource, sku.amount ?? 1);
    }
    await setFlag(host, ctx, 'traded_with_vel');
    await noteActivity(host.store, ctx.player, { type: 'trade' });
    return host.respond(ctx.player, `Куплено: ${sku.name}. −${sku.price} монет.`, tradeButtons(await host.load(ctx.player)));
  }
  if (act === 'sell') {
    const sku = getVelSell(String(payload.sku ?? payload.resource ?? ''));
    if (!sku) throw new ActionRejectedError('Вел это не берёт.');
    const have = ctx.resources[sku.resource] ?? 0;
    if (have < 1) throw new InsufficientResourcesError(`Нет: ${resourceLabel(sku.resource)}.`);
    await host.store.addResource(ctx.player.id, sku.resource, -1);
    await host.changeCoins(ctx.player, sku.price, 'vel_sell', sku.resource);
    await setFlag(host, ctx, 'traded_with_vel');
    await noteActivity(host.store, ctx.player, { type: 'trade' });
    return host.respond(
      ctx.player,
      `Продано: ${resourceLabel(sku.resource)}. +${sku.price} монет.`,
      tradeButtons(await host.load(ctx.player)),
    );
  }
  if (act === 'sell_menu') {
    const owned = VEL_BUYS.filter((sku) => (ctx.resources[sku.resource] ?? 0) > 0).slice(0, 3);
    const sellBtns: GameButton[] = owned.map((sku) => ({
      label: `${resourceLabel(sku.resource)} (${sku.price})`,
      action: 'TRADE_ACT',
      payload: { act: 'sell', sku: sku.id },
    }));
    sellBtns.push({ label: BACK_LABEL, action: 'TRADE_ACT', payload: { act: 'open' } });
    return host.respond(
      ctx.player,
      owned.length ? 'Что продаёшь? Вел платит меньше, чем берёт за своё.' : 'Нечего продать из его списка.',
      sellBtns.slice(0, 5),
    );
  }
  if (act === 'buy_menu') {
    return host.respond(ctx.player, `Монеты: ${ctx.player.coins}. Купить:`, [
      { label: 'Стекло (15)', action: 'TRADE_ACT', payload: { act: 'buy', sku: 'glass' } },
      { label: 'Сухарь (8)', action: 'TRADE_ACT', payload: { act: 'buy', sku: 'rusk' } },
      { label: 'Палки ×4 (6)', action: 'TRADE_ACT', payload: { act: 'buy', sku: 'sticks' } },
      { label: BACK_LABEL, action: 'TRADE_ACT', payload: { act: 'open' } },
    ]);
  }
  if (act === 'token') return host.renderNode(ctx.player, 'vel_token');
  return host.respond(
    ctx.player,
    `Вел раскладывает весы. Монеты: ${ctx.player.coins}.\nПокупает камень, уголь, шкуру, руду, слитки.\nСегодня: сухарь, стекло, палки, кольчуга.`,
    tradeButtons(ctx),
  );
}

function tradeButtons(ctx: WeekCtx): GameButton[] {
  const buttons: GameButton[] = [
    { label: 'Продать', action: 'TRADE_ACT', payload: { act: 'sell_menu' } },
    { label: 'Купить', action: 'TRADE_ACT', payload: { act: 'buy_menu' } },
  ];
  if (hasItem(ctx, 'rusty_token') && !ctx.flags.sold_rusty_token) {
    buttons.push({ label: 'Продать жетон', action: 'TRADE_ACT', payload: { act: 'token' } });
  } else if (hasItem(ctx, 'stumpfang_tooth') && !ctx.flags.sold_stumpfang_tooth) {
    buttons.push({ label: 'Продать клык', action: 'TRADE_ACT', payload: { act: 'sell_tooth' } });
  } else {
    buttons.push({ label: 'Спросить про символы', action: 'DIALOGUE_CHOICE', payload: { nodeId: 'vel_symbols', choiceId: 'trade' } });
  }
  if (!ctx.flags.traded_with_vel && !ctx.flags.day_5_complete) {
    buttons.push({ label: 'Отказаться', action: 'TRADE_ACT', payload: { act: 'decline' } });
  } else if (ctx.flags.traded_with_vel && !ctx.flags.day_5_complete) {
    buttons.push({ label: 'Завершить День 5', action: 'COMPLETE_DAY_5' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return buttons.slice(0, 5);
}

function pvpMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  const used = flagNum(ctx.flags, 'pvp_skirmishes');
  const standing = flagNum(ctx.flags, 'scree_standing');
  const buttons: GameButton[] = [];
  if (used < PVP_MAX && !ctx.flags.paid_scree_tribute) {
    buttons.push({ label: 'Вызвать след', action: 'START_PVP' });
  }
  if (!ctx.flags.paid_scree_tribute && used === 0) {
    buttons.push({ label: 'Дань монетами', action: 'PAY_TRIBUTE', payload: { with: 'coins' } });
    buttons.push({ label: 'Дань булыжником', action: 'PAY_TRIBUTE', payload: { with: 'cobble' } });
  }
  if ((used >= 1 || ctx.flags.paid_scree_tribute) && !ctx.flags.day_6_complete) {
    buttons.push({ label: 'Завершить День 6', action: 'COMPLETE_DAY_6' });
  }
  buttons.push({
    label: 'Край стана Яры',
    action: 'DIALOGUE_CHOICE',
    payload: { nodeId: 'yara_edge', choiceId: 'back' },
  });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    `Осыпь. Вешка Яры.\nСтычек: ${used}/${PVP_MAX}. Рейтинг: ${standing}.\nМонет с PvP мало — так и задумано.`,
    buttons.slice(0, 5),
  );
}

async function startPvp(host: WeekHost, ctx: WeekCtx, eventId: string, rivalId: string): Promise<GameResponse> {
  const used = flagNum(ctx.flags, 'pvp_skirmishes');
  if (used >= PVP_MAX) throw new ActionRejectedError('Лимит стычек на сутки.');
  if (ctx.flags.paid_scree_tribute) throw new ActionRejectedError('Дань уже снесена. Войны нет.');
  if (rivalId && !PVP_RIVALS.some((row) => row.id === rivalId)) {
    throw new ActionRejectedError('След рассеялся.');
  }
  const rival = rivalId ? getPvpRival(rivalId) : nextPvpRival(used);
  if (!rival) throw new ActionRejectedError('След рассеялся.');
  await setFlag(host, ctx, 'pvp_skirmishes', String(used + 1));
  ctx.player.currentLocation = 'stone_scree';
  await host.store.savePlayer(ctx.player);
  const stats = await host.effectiveStats(ctx);
  const playerSnap: CombatantSnapshot = {
    id: ctx.player.id,
    name: ctx.player.name,
    hp: ctx.player.hp,
    maxHp: ctx.player.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    dodge: stats.dodge + (ctx.flags.scavenger_bonded ? 4 : 0),
    accuracy: stats.accuracy,
    luck: stats.luck,
    minDamage: stats.minDamage,
    maxDamage: stats.maxDamage,
  };
  const enemySnap: CombatantSnapshot = {
    id: rival.id,
    name: rival.name,
    hp: rival.hp,
    maxHp: rival.hp,
    attack: rival.minDamage,
    defense: rival.defense,
    speed: rival.speed,
    critChance: rival.critChance,
    critDamage: rival.critDamage,
    dodge: rival.dodge,
    accuracy: rival.accuracy,
    luck: 0,
    minDamage: rival.minDamage,
    maxDamage: rival.maxDamage,
  };
  const battle = simulateBattle({
    player: playerSnap,
    enemy: enemySnap,
    seed: eventId,
    balanceVersion: BALANCE_VERSION,
  });
  const match = await host.store.createCombatMatch({
    playerId: ctx.player.id,
    mode: 'PVE',
    enemyId: rival.id,
    seed: String(battle.seed),
    balanceVersion: battle.balanceVersion,
    result: battle.result,
    playerSnapshot: battle.playerSnapshot,
    enemySnapshot: battle.enemySnapshot,
    startedAt: host.now(),
    finishedAt: host.now(),
  });
  await host.store.addCombatEvents(match.id, battle.events);
  await noteActivity(host.store, ctx.player, {
    type: 'pvp',
    result: battle.result,
    rivalId: rival.id,
  });
  if (battle.result === 'LOSS') ctx.player.hp = Math.max(1, Math.floor(ctx.player.maxHp * 0.2));
  else ctx.player.hp = Math.max(1, battle.playerHp);
  await host.store.savePlayer(ctx.player);
  let extra = '\nВещи при тебе. База цела. Монеты на месте.';
  let standing = flagNum(ctx.flags, 'scree_standing');
  if (battle.result === 'WIN') {
    standing += 1;
    await setFlag(host, ctx, 'scree_standing', String(standing));
    const token = await host.store.createItem({
      playerId: ctx.player.id,
      templateId: 'pvp_token',
      rarity: 'COMMON',
    });
    await host.store.recordItemHistory({ itemId: token.id, playerId: ctx.player.id, type: 'LOOTED' });
    await host.changeCoins(ctx.player, PVP_WIN_COINS, 'pvp', rival.id);
    extra += `\n${await host.addXp(ctx.player, PVP_WIN_XP)} Рейтинг +1. Жетон спора. +${PVP_WIN_COINS} монет.`;
  } else {
    standing = Math.max(0, standing - 1);
    await setFlag(host, ctx, 'scree_standing', String(standing));
    extra += '\nРейтинг −1. Можно ответить снова.';
  }
  const log = formatCombatLog(battle, ctx.player.id, ctx.player.name, rival.name);
  const left = PVP_MAX - (used + 1);
  const buttons: GameButton[] = [];
  if (left > 0) buttons.push({ label: `Ещё след (осталось ${left})`, action: 'START_PVP' });
  if (!ctx.flags.day_6_complete) buttons.push({ label: 'Завершить День 6', action: 'COMPLETE_DAY_6' });
  buttons.push({ label: 'К стану', action: 'OPEN_CAMP' });
  return host.respond(ctx.player, `${log}${extra}`, buttons.slice(0, 5));
}

async function payTribute(host: WeekHost, ctx: WeekCtx, withWhat: string): Promise<GameResponse> {
  if (ctx.flags.paid_scree_tribute) throw new RewardAlreadyClaimedError('Дань уже снесена.');
  if (withWhat === 'cobble') {
    if ((ctx.resources.COBBLESTONE ?? 0) < TRIBUTE_COBBLE) {
      throw new InsufficientResourcesError(`Нужно ${TRIBUTE_COBBLE} булыжника.`);
    }
  } else if (ctx.player.coins < TRIBUTE_COINS) {
    throw new InsufficientCoinsError(`Нужно ${TRIBUTE_COINS} монет.`);
  }
  const ok = await host.store.tryClaimReward(ctx.player.id, 'tribute', 'yara');
  if (!ok) throw new RewardAlreadyClaimedError();
  if (withWhat === 'cobble') {
    await host.store.addResource(ctx.player.id, 'COBBLESTONE', -TRIBUTE_COBBLE);
  } else {
    await host.changeCoins(ctx.player, -TRIBUTE_COINS, 'tribute', 'yara');
  }
  await setFlag(host, ctx, 'paid_scree_tribute');
  await host.store.adjustNpcRelation(ctx.player.id, 'rem', 1, 0);
  return host.respond(
    ctx.player,
    'Дань оставлена на вешке. Яра нейтральна. Рем кивает: не начал войну.',
    [
      { label: 'Завершить День 6', action: 'COMPLETE_DAY_6' },
      { label: 'К стану', action: 'OPEN_CAMP' },
    ],
  );
}

async function buildBarricade(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.barricade_built) return prepMenu(host, ctx);
  const cheap =
    ctx.flags.camp_on_shelter || hasItem(ctx, 'iron_axe') || ctx.flags.chose_iron_axe;
  const logNeed = cheap ? 3 : 4;
  const cobbleNeed = cheap ? 3 : 4;
  if ((ctx.resources.LOG ?? 0) < logNeed || (ctx.resources.COBBLESTONE ?? 0) < cobbleNeed) {
    throw new InsufficientResourcesError(`Нужно ${logNeed} брёвен и ${cobbleNeed} булыжника.`);
  }
  const ok = await host.store.tryClaimReward(ctx.player.id, 'structure', 'barricade');
  if (!ok) {
    await setFlag(host, ctx, 'barricade_built');
    return prepMenu(host, await host.load(ctx.player));
  }
  await host.store.addResource(ctx.player.id, 'LOG', -logNeed);
  await host.store.addResource(ctx.player.id, 'COBBLESTONE', -cobbleNeed);
  await setFlag(host, ctx, 'barricade_built');
  return host.respond(ctx.player, 'Баррикада стоит у петель. Первая фаза будет мягче.', [
    { label: 'К петлям', action: 'START_PVE', payload: { enemyId: 'wenzel_warden', move: 'hinge' } },
    { label: 'Подготовка', action: 'OPEN_MENU', payload: { menu: 'prep' } },
  ]);
}

async function helpPet(host: WeekHost, ctx: WeekCtx, act: string): Promise<GameResponse> {
  if (act === 'rescue') {
    if (ctx.flags.emberkit_rescued) return host.respond(ctx.player, 'Искрик уже спасён.', NAV);
    if (!hasItem(ctx, 'wooden_pickaxe') && !hasItem(ctx, 'stone_pickaxe') && !hasItem(ctx, 'iron_pickaxe')) {
      throw new ActionRejectedError('Нужна кирка.');
    }
    await host.spend(ctx.player, 1);
    await setFlag(host, ctx, 'emberkit_rescued');
    return host.respond(
      ctx.player,
      'Угольный зверёк вытащен. Не пет за клик. День 5 — еда или уголь.',
      NAV,
    );
  }
  if (act === 'tame') {
    if (ctx.flags.emberkit_bonded) return host.respond(ctx.player, 'Искрик уже с тобой.', NAV);
    if (!ctx.flags.emberkit_rescued) throw new ActionRejectedError('Некого приручать.');
    if ((ctx.resources.COAL ?? 0) < 1) throw new InsufficientResourcesError('Нужен уголь.');
    await host.store.addResource(ctx.player.id, 'COAL', -1);
    await setFlag(host, ctx, 'emberkit_bonded');
    return host.respond(ctx.player, 'Искрик берёт уголь из ладони. Слот companion. Не танк.', NAV);
  }
  if (act === 'reject') {
    await setFlag(host, ctx, 'scavenger_rejected_d4');
    return host.respond(ctx.player, 'Тварь уходит. Тишина. Неделя без пета валидна.', NAV);
  }
  if (act === 'leave') {
    await setFlag(host, ctx, 'scavenger_left_d4');
    return host.respond(ctx.player, 'Падальщик остаётся в пыли. Неделя без него валидна. На расселине ещё может пискнуть Искрик.', NAV);
  }
  if (ctx.flags.scavenger_bonded) return host.respond(ctx.player, 'Падальщик уже с тобой.', NAV);
  const food =
    ctx.items.find((item) => item.templateId === 'dry_rusk') ||
    ((ctx.resources.RAW_MEAT ?? 0) > 0 ? 'meat' : null) ||
    ((ctx.resources.FOOD ?? 0) > 0 ? 'food' : null);
  if (!food) throw new ActionRejectedError('Нужен сухарь или мясо.');
  if (food !== 'meat' && food !== 'food') await host.store.removeItem(food.id);
  else await host.store.addResource(ctx.player.id, food === 'meat' ? 'RAW_MEAT' : 'FOOD', -1);
  await setFlag(host, ctx, 'scavenger_bonded');
  return host.respond(
    ctx.player,
    'Смола счищена. Падальщик дышит ровнее. Не танк. В День 7 может отвлечь.',
    NAV,
  );
}

async function repairLantern(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.lantern_repaired || hasItem(ctx, 'lit_lantern')) {
    return host.respond(ctx.player, 'Фонарь уже горит.', NAV);
  }
  if (!hasItem(ctx, 'broken_lantern')) throw new ActionRejectedError('Сломанного фонаря нет.');
  if (!hasItem(ctx, 'glass_pane')) throw new ActionRejectedError('Нужно стекло Вела.');
  if ((ctx.resources.COAL ?? 0) < 1) throw new InsufficientResourcesError('Нужен 1 уголь.');
  const broken = ctx.items.find((item) => item.templateId === 'broken_lantern')!;
  const glass = ctx.items.find((item) => item.templateId === 'glass_pane')!;
  await host.store.removeItem(broken.id);
  await host.store.removeItem(glass.id);
  await host.store.addResource(ctx.player.id, 'COAL', -1);
  const item = await host.store.createItem({
    playerId: ctx.player.id,
    templateId: 'lit_lantern',
    rarity: 'UNCOMMON',
  });
  await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'CREATED' });
  await setFlag(host, ctx, 'lantern_repaired');
  return host.respond(ctx.player, 'Стекло село. Уголь вспыхнул. Фонарь горит. Шарниры будут видны.', NAV);
}

async function salvageItem(host: WeekHost, ctx: WeekCtx, itemId: string): Promise<GameResponse> {
  const item =
    (itemId ? ctx.items.find((row) => row.id === itemId) : undefined) ??
    ctx.items.find((row) => (STONE_SALVAGE_TOOLS as readonly string[]).includes(row.templateId));
  if (!item || !(STONE_SALVAGE_TOOLS as readonly string[]).includes(item.templateId)) {
    throw new ActionRejectedError('Разбирается только каменное орудие.');
  }
  const equipped = Object.values(ctx.equipment).includes(item.id);
  if (equipped) await host.store.setEquipmentSlot(ctx.player.id, ITEM_TEMPLATES[item.templateId]!.slot!, null);
  await host.store.removeItem(item.id);
  await host.store.addResource(ctx.player.id, 'COBBLESTONE', 1);
  await host.store.recordItemHistory({
    itemId: item.id,
    playerId: ctx.player.id,
    type: 'SALVAGED',
  }).catch(() => undefined);
  return host.respond(
    ctx.player,
    `Разобрано. +1 булыжник. Железо не разбираем — рано.`,
    [{ label: BACK_LABEL, action: 'OPEN_INVENTORY' }, ...NAV],
  );
}

function prepMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  const lines = [
    'Цепь стонет. Затвор кривой.',
    'Рем: бей то, что на петлях. В щель — нет.',
    ctx.flags.barricade_built ? 'Баррикада стоит.' : 'Баррикады нет.',
    ctx.flags.lantern_repaired ? 'Фонарь горит.' : 'Фонаря нет — бой длиннее, но честный.',
    ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded ? 'Питомец рядом.' : 'Без пета.',
    ctx.flags.sold_rusty_token ? 'Рем молчит про шарниры.' : ctx.flags.rem_revealed_hinge ? 'Рем шепнул про шарниры.' : 'Рем на баррикаде.',
  ];
  const buttons: GameButton[] = [];
  if (!ctx.flags.barricade_built) {
    buttons.push({ label: 'Укрепить баррикаду', action: 'BUILD_BARRICADE' });
  }
  buttons.push({
    label: 'Бить шарнир',
    action: 'START_PVE',
    payload: { enemyId: 'wenzel_warden', move: 'hinge' },
  });
  if (ctx.flags.chose_iron_pickaxe || hasItem(ctx, 'iron_pickaxe')) {
    buttons.push({
      label: 'Выбить клин киркой',
      action: 'START_PVE',
      payload: { enemyId: 'wenzel_warden', move: 'pickaxe' },
    });
  } else if (ctx.flags.chose_iron_axe || hasItem(ctx, 'iron_axe')) {
    buttons.push({
      label: 'Топор по опоре',
      action: 'START_PVE',
      payload: { enemyId: 'wenzel_warden', move: 'axe' },
    });
  } else if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    buttons.push({
      label: 'Приказать питомцу',
      action: 'START_PVE',
      payload: { enemyId: 'wenzel_warden', move: 'pet' },
    });
  }
  if (ctx.flags.unknown_blue_mineral && !ctx.flags.used_blue_on_wenzel && buttons.length < 4) {
    buttons.push({
      label: 'Поднести синий осколок',
      action: 'START_PVE',
      payload: { enemyId: 'wenzel_warden', move: 'blue' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons.slice(0, 5));
}

export async function applyWeekLoot(
  host: WeekHost,
  ctx: WeekCtx,
  enemyId: string,
  eventId: string,
  first: boolean,
): Promise<string[]> {
  const notes: string[] = [];
  const spec = COMBAT_LOOT[enemyId];
  if (enemyId === 'moss_boar' || enemyId === 'needle_runner') {
    await setFlag(host, ctx, 'wedge_path_cleared');
  }
  if (enemyId === 'pitch_mite') await setFlag(host, ctx, 'wedge_pitch_cleared');
  if (enemyId === 'resin_brute') await setFlag(host, ctx, 'wedge_roots_cleared');
  if (enemyId === 'stumpfang') {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'stumpfang_hunt',
      status: 'CLAIMED',
      progress: { win: true },
    });
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'stumpfang',
      title: 'Пнеклык',
      seen: true,
      defeated: true,
    });
  }
  if (!spec) return notes;
  notes.push(await host.addXp(ctx.player, first ? spec.xp : spec.xpRepeat));
  if (spec.coins && first) {
    await host.changeCoins(ctx.player, spec.coins, 'combat_loot', enemyId);
    notes.push(`+${spec.coins} монет.`);
  }
  if (spec.resources) {
    for (const [resource, range] of Object.entries(spec.resources)) {
      const amount = seededRange(eventId, range[0], range[1], resource);
      if (amount > 0) {
        await host.store.addResource(ctx.player.id, resource as ResourceType, amount);
        notes.push(`+${amount} ${resourceLabel(resource as ResourceType)}.`);
        await noteActivity(host.store, ctx.player, {
          type: 'gather',
          amount,
          resource,
        });
      }
    }
  }
  if (first && spec.firstItems) {
    for (const templateId of spec.firstItems) {
      const unique = await host.store.tryClaimReward(ctx.player.id, 'unique_loot', templateId);
      if (!unique || hasItem(ctx, templateId)) continue;
      const template = getItemTemplate(templateId);
      if (!template) continue;
      const item = await host.store.createItem({
        playerId: ctx.player.id,
        templateId,
        rarity: template.rarity,
      });
      await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
      notes.push(`Получено: ${template.name}.`);
      await noteActivity(host.store, ctx.player, {
        type: 'loot',
        count: 1,
        rare: template.rarity === 'RARE' || template.rarity === 'EPIC' || template.rarity === 'LEGENDARY' || template.rarity === 'MYTHIC',
      });
    }
  }
  if (first && spec.firstFlags) {
    for (const flag of spec.firstFlags) await setFlag(host, ctx, flag);
  }
  if (spec.rare && !ctx.flags[spec.rare.flag] && seededChance(eventId, spec.rare.percent, spec.rare.templateId)) {
    const template = getItemTemplate(spec.rare.templateId);
    if (template) {
      const item = await host.store.createItem({
        playerId: ctx.player.id,
        templateId: template.id,
        rarity: template.rarity,
      });
      await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
      await setFlag(host, ctx, spec.rare.flag);
      notes.push(`Редкое: ${template.name}!`);
      await noteActivity(host.store, ctx.player, { type: 'loot', count: 1, rare: true });
    }
  }
  if (spec.dailyKill) await bumpDaily(host, ctx, 'kill', notes);
  if (enemyId === 'stumpfang' && first) {
    await noteActivity(host.store, ctx.player, { type: 'quest', id: 'stumpfang_hunt' });
  }
  return notes;
}

export async function applyWenzelVictory(host: WeekHost, ctx: WeekCtx): Promise<string[]> {
  const notes: string[] = [];
  const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'wenzel_warden');
  await setFlag(host, ctx, 'wenzel_defeated');
  if (first) {
    for (const templateId of ['wenzel_plate', 'hinge_charm', 'seal_shard_7']) {
      const unique = await host.store.tryClaimReward(ctx.player.id, 'unique_loot', templateId);
      if (!unique) continue;
      const template = getItemTemplate(templateId)!;
      const item = await host.store.createItem({
        playerId: ctx.player.id,
        templateId,
        rarity: template.rarity,
      });
      await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
      notes.push(template.name);
    }
    await host.changeCoins(ctx.player, 40, 'wenzel', 'first');
    notes.push(await host.addXp(ctx.player, WENZEL_QUEST_XP));
    notes.push('+40 монет.');
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'hold_the_hinges',
      status: 'CLAIMED',
      progress: { win: true },
    });
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'wenzel_warden',
      title: 'Вензель',
      seen: true,
      defeated: true,
    });
    await noteActivity(host.store, ctx.player, { type: 'loot', count: 3, rare: true });
    await noteActivity(host.store, ctx.player, { type: 'quest', id: 'hold_the_hinges' });
  } else {
    notes.push('Сюжетный лут уже получен.');
  }
  return notes;
}

export function wenzelModifiers(ctx: WeekCtx, move: string): {
  player: Partial<CombatantSnapshot>;
  enemy: Partial<CombatantSnapshot>;
  note: string;
} {
  const player: Partial<CombatantSnapshot> = {};
  const enemy: Partial<CombatantSnapshot> = {};
  const bits: string[] = [];
  if (ctx.flags.barricade_built) {
    player.defense = 3;
    bits.push('баррикада');
  }
  if (ctx.flags.lantern_repaired) {
    player.critChance = 12;
    enemy.dodge = 0;
    bits.push('фонарь: шарниры видны');
  }
  if (ctx.flags.has_stumpfang_tooth && !ctx.flags.sold_stumpfang_tooth) {
    player.defense = (player.defense ?? 0) + 1;
  }
  if (move === 'hinge' && (ctx.flags.lantern_repaired || ctx.flags.rem_revealed_hinge)) {
    enemy.defense = -2;
    bits.push('удар по шарниру');
  }
  if (move === 'plate') {
    enemy.defense = 2;
    bits.push('пластины глухие');
  }
  if (move === 'pickaxe') {
    enemy.defense = -3;
    player.minDamage = 6;
    player.maxDamage = 9;
    bits.push('клин выбит');
  }
  if (move === 'axe') {
    enemy.defense = -2;
    player.minDamage = 6;
    player.maxDamage = 9;
    bits.push('опора сломана');
  }
  if (move === 'pet' || ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    player.dodge = 18;
    bits.push('питомец отвлекает');
  }
  if (move === 'blue') {
    enemy.hp = 30;
    bits.push('синее злит стража');
  }
  if (ctx.flags.chose_iron_sword || ctx.items.some((item) => item.templateId === 'iron_sword')) {
    player.minDamage = 7;
    player.maxDamage = 10;
  } else if (ctx.flags.chose_iron_axe || ctx.items.some((item) => item.templateId === 'iron_axe')) {
    player.minDamage = player.minDamage ?? 6;
    player.maxDamage = player.maxDamage ?? 9;
  } else if (ctx.flags.chose_iron_pickaxe || ctx.items.some((item) => item.templateId === 'iron_pickaxe')) {
    player.minDamage = player.minDamage ?? 6;
    player.maxDamage = player.maxDamage ?? 8;
  }
  return { player, enemy, note: bits.join(', ') };
}

export function afterWenzelMoveFlags(move: string): string[] {
  if (move === 'pet') return ['pet_in_wenzel_fight'];
  if (move === 'blue') return ['used_blue_on_wenzel'];
  return [];
}


