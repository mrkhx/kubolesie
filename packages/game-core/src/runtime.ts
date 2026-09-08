import { randomUUID } from 'node:crypto';
import {
  BALANCE_VERSION,
  STARTING_ENERGY,
  STARTING_STATS,
  XP_THRESHOLDS,
  XP_TO_LEVEL_2,
  type GameButton,
  type GameCommand,
  type GameCommandType,
  type GameResponse,
  type GameStateView,
  type NormalizedIncomingEvent,
  type ResourceType,
  presentGameResponse,
  BACK_LABEL,
  AWAITING_NAME_FLAG,
  DEFAULT_HERO_NAME,
  INVALID_NAME_TEXT,
  NAME_PROMPT_TEXT,
  formatItemLine,
  isDefaultHeroName,
  isStartAlias,
  validateHeroName,
} from '@kubolesie/shared';
import {
  COMBAT_REQUIREMENTS,
  COMMAND_REQUIREMENTS,
  DIALOGUE_NODES,
  ENEMIES,
  GATHER_IRON,
  GATHER_COAL,
  GATHER_STONE,
  GATHER_WOOD,
  IRON_FOR_GATE_TARGET,
  CAMP_QUEST_XP,
  QUEST_TEMPLATES,
  ITEM_TEMPLATES,
  LEVEL_UP,
  LOCATIONS,
  NIGHT_REST,
  SHELTER,
  START_CRATE,
  getDialogueNode,
  getEnemy,
  getItemTemplate,
  getLocation,
  getRecipe,
  resourceLabel,
  type CommandRequirement,
  type DialogueAction,
  type DialogueChoice,
  type DialogueCondition,
  type DialogueNode,
} from '@kubolesie/content';
import {
  seededChance,
  seededRange,
  simulateBattle,
  type CombatantSnapshot,
} from '@kubolesie/combat-engine';
import { regenerateEnergy } from './energy';
import {
  ActionRejectedError,
  GameError,
  InsufficientCoinsError,
  InsufficientEnergyError,
  InsufficientResourcesError,
  ItemNotOwnedError,
  RewardAlreadyClaimedError,
  UnknownCommandError,
} from './errors';
import { formatCombatLog } from './combat-log';
import {
  buildActionMenu,
  effectiveRecipeCost,
  hasCraftingTable as playerHasTable,
  parseMenuId,
  recipeGroup,
  requirementMet,
  type ActionMenuId,
  type MenuSnapshot,
} from './menus';
import type {
  DiscoveryRecord,
  GameStore,
  InventoryItemRecord,
  PlayerQuestRecord,
  PlayerRecord,
} from './store';
import {
  afterCraftFlags,
  afterWenzelMoveFlags,
  applyWeekLoot,
  applyWenzelVictory,
  dispatchWeek,
  furnaceCraftLocationOk,
  isWeekMenu,
  noteDailyCraft,
  noteDailyGather,
  openWeekMenu,
  WEEK_COMMANDS,
  wenzelModifiers,
  type WeekHost,
} from './week';
import {
  applyWeek2Victory,
  dispatchWeek2,
  isWeek2Enemy,
  isWeek2Location,
  isWeek2Menu,
  openWeek2Menu,
  talkMira,
  WEEK2_COMMANDS,
  week2Modifiers,
} from './week2';
import {
  applyWeek3Victory,
  dispatchWeek3,
  isWeek3Enemy,
  isWeek3Location,
  isWeek3Menu,
  loadWeek3JobLevels,
  openWeek3Menu,
  WEEK3_COMMANDS,
  week3Modifiers,
} from './week3';
import { dispatchMeta, grantMetaAchievement, isMetaMenu, META_COMMANDS, noteActivity, openMetaMenu } from './meta';
import { AWAITING_CLAN_FLAG, handleClanTextInput } from './clans';
import { dispatchPvp, isPvpMenu, openPvpMenu, PVP_COMMANDS } from './pvp';
import { AWAITING_MARKET_FLAG } from './market';
import {
  handleMarketTextInput,
  isMarketMenu,
  marketAct,
  MARKET_COMMANDS,
  openMarketMenu,
} from './market-ui';
import { isWorkMenu, jobAct, JOB_COMMANDS, openWorkMenu, prodAct, PROD_COMMANDS } from './work-ui';
import { MARKET } from '@kubolesie/content';

const NAV: GameButton[] = [
  { label: '👁 Осмотреться', action: 'EXPLORE' },
  { label: '🎒 Инвентарь', action: 'OPEN_INVENTORY' },
];

interface Ctx {
  player: PlayerRecord;
  flags: Record<string, string>;
  items: InventoryItemRecord[];
  resources: Partial<Record<ResourceType, number>>;
  equipment: Partial<Record<string, string>>;
  quests: Record<string, PlayerQuestRecord>;
  discoveries: DiscoveryRecord[];
}

export class GameRuntime {
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: GameStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(event: NormalizedIncomingEvent): Promise<GameResponse> {
    return this.serialize(`event:${event.eventId}`, async () => {
      const existing = await this.store.findProcessedEvent(event.eventId);
      if (existing?.response?.text) return presentGameResponse(existing.response);
      if (existing) {
        return presentGameResponse({ text: 'Сейчас это сделать нельзя.', buttons: NAV });
      }
      return this.serialize(`player:${event.identity.providerUserId}`, async () => {
        const again = await this.store.findProcessedEvent(event.eventId);
        if (again?.response?.text) return presentGameResponse(again.response);
        const claimed = await this.store.tryBeginProcessedEvent({
          eventId: event.eventId,
          playerId: null,
          command: event.command.type,
          createdAt: this.now(),
        });
        if (!claimed) {
          const won = await this.store.findProcessedEvent(event.eventId);
          if (won?.response?.text) return presentGameResponse(won.response);
          return presentGameResponse({ text: 'Сейчас это сделать нельзя.', buttons: NAV });
        }
        try {
          const response = presentGameResponse(await this.execute(event));
          await this.store.completeProcessedEvent(
            event.eventId,
            response,
            response.state?.playerId ?? null,
          );
          return response;
        } catch (error) {
          const response = presentGameResponse({
            text: error instanceof GameError ? error.message : 'Сейчас это сделать нельзя.',
            buttons: NAV,
          });
          await this.store.completeProcessedEvent(event.eventId, response, null);
          return response;
        }
      });
    });
  }

  /** Adapter-only: replay check before command rate-limit. Does not mutate. */
  async peekProcessed(eventId: string): Promise<GameResponse | null> {
    const existing = await this.store.findProcessedEvent(eventId);
    if (existing?.response?.text) return presentGameResponse(existing.response);
    return null;
  }

  private serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.chains.set(key, next.catch(() => undefined));
    return next;
  }

  private async execute(event: NormalizedIncomingEvent): Promise<GameResponse> {
    try {
      const player = await this.ensurePlayer(event);
      const refreshed = regenerateEnergy(player, this.now());
      if (refreshed.energy !== player.energy || refreshed.lastEnergyAt.getTime() !== player.lastEnergyAt.getTime()) {
        await this.store.savePlayer(refreshed);
      }
      const current = (await this.store.findPlayerById(player.id)) ?? refreshed;
      current.lastActiveAt = this.now();
      await this.store.savePlayer(current);
      const response = await this.dispatch(current, event.command, event.eventId, event.text);
      return this.withNotices(current.id, response);
    } catch (error) {
      if (error instanceof GameError) {
        return { text: error.message, buttons: NAV };
      }
      return { text: 'Сейчас это сделать нельзя.', buttons: NAV };
    }
  }

  private async ensurePlayer(event: NormalizedIncomingEvent): Promise<PlayerRecord> {
    const existing = await this.store.findPlayerByVkUserId(event.identity.providerUserId);
    if (existing) return existing;
    const created = await this.store.createPlayer({
      vkUserId: event.identity.providerUserId,
      name: event.identity.displayName?.trim() || DEFAULT_HERO_NAME,
    });
    await this.store.setFlag(created.id, 'visited_forest_clearing', '1');
    return created;
  }

  private async load(player: PlayerRecord): Promise<Ctx> {
    const [flags, items, resources, equipment, quests, discoveries] = await Promise.all([
      this.store.getFlags(player.id),
      this.store.listItems(player.id),
      this.store.getResources(player.id),
      this.store.getEquipment(player.id),
      this.store.listPlayerQuests(player.id),
      this.store.listDiscoveries(player.id),
    ]);
    return {
      player,
      flags,
      items,
      resources,
      equipment,
      quests: Object.fromEntries(quests.map((quest) => [quest.questId, quest])),
      discoveries,
    };
  }

  private async dispatch(
    player: PlayerRecord,
    command: GameCommand,
    eventId: string,
    text?: string,
    ignoreNameMode = false,
  ): Promise<GameResponse> {
    const ctx = await this.load(player);
    if (!ignoreNameMode && ctx.flags[AWAITING_NAME_FLAG] === '1') {
      return this.handleNameInput(ctx, command, eventId, text);
    }
    const clanAwait = ctx.flags[AWAITING_CLAN_FLAG];
    if (!ignoreNameMode && clanAwait && clanAwait !== '0') {
      return this.handleClanInput(ctx, command, eventId, text);
    }
    const marketAwait = ctx.flags[AWAITING_MARKET_FLAG];
    if (!ignoreNameMode && marketAwait && marketAwait !== '0') {
      return this.handleMarketInput(ctx, command, eventId, text);
    }
    this.assertAllowed(command, ctx);
    switch (command.type) {
      case 'START_GAME':
        return this.startGame(ctx);
      case 'EXPLORE':
        return this.explore(ctx);
      case 'OPEN_INVENTORY':
        return this.openInventory(ctx);
      case 'OPEN_CAMP':
        return this.openCamp(ctx);
      case 'OPEN_MENU':
        return this.openMenu(ctx, parseMenuId(String(command.payload?.menu ?? 'hub')));
      case 'GATHER_WOOD':
        return this.gatherWood(ctx, eventId);
      case 'GATHER_STONE':
        return this.gatherStone(ctx, eventId);
      case 'GATHER_IRON':
        return this.gatherIron(ctx, eventId);
      case 'GATHER_COAL':
        return this.gatherCoal(ctx, eventId);
      case 'CRAFT_ITEM':
        return this.craftItem(
          ctx,
          String(command.payload?.recipeId ?? command.payload?.templateId ?? ''),
        );
      case 'EQUIP_ITEM':
        return this.equipItem(ctx, String(command.payload?.itemId ?? ''));
      case 'USE_ITEM':
        return this.useItem(ctx, String(command.payload?.itemId ?? ''));
      case 'TALK_NPC':
        return this.talkNpc(ctx, String(command.payload?.npcId ?? 'rem'));
      case 'START_PVE':
        return this.startPve(
          ctx,
          String(command.payload?.enemyId ?? 'wild_shrew'),
          eventId,
          command.payload,
        );
      case 'CLAIM_REWARD':
        return this.claimReward(ctx, String(command.payload?.rewardType ?? ''), String(command.payload?.rewardRef ?? ''));
      case 'OPEN_CRATE':
        return this.openCrate(ctx);
      case 'DIALOGUE_CHOICE':
        return this.dialogueChoice(
          ctx,
          String(command.payload?.nodeId ?? player.currentState),
          String(command.payload?.choiceId ?? ''),
        );
      case 'INSPECT_TOKEN':
        return this.inspectToken(ctx);
      case 'BUILD_TEMP_SHELTER':
        return this.buildShelter(ctx);
      case 'FEED_SCAVENGER':
        return this.feedScavenger(ctx);
      case 'RETURN_IRON':
        return this.returnIron(ctx);
      case 'OPEN_SECRET_CHEST':
        return this.openSecretChest(ctx);
      case 'MINE_BLUE_MINERAL':
        return this.mineBlue(ctx);
      case 'REST_NIGHT':
        return this.restNight(ctx, String(command.payload?.place ?? 'rem'));
      case 'BEGIN_DAY_2':
        return this.beginDay2(ctx);
      case 'FOUND_CAMP':
        return this.foundCamp(ctx, Boolean(command.payload?.onShelter));
      case 'PLACE_CAMP_TABLE':
        return this.placeCampTable(ctx);
      case 'LIGHT_CAMP':
        return this.lightCamp(ctx);
      case 'COMPLETE_DAY_2':
        return this.completeDay2(ctx);
      case 'PROMPT_HERO_NAME':
        return this.promptHeroName(ctx);
      case 'CANCEL_HERO_NAME':
        return this.openMenu(ctx, 'profile');
      default:
        if ((META_COMMANDS as readonly string[]).includes(command.type)) {
          return dispatchMeta(this.store, player, command, this.now());
        }
        if ((PVP_COMMANDS as readonly string[]).includes(command.type)) {
          return dispatchPvp(this.weekHost(), ctx, command, eventId);
        }
        if ((MARKET_COMMANDS as readonly string[]).includes(command.type)) {
          return marketAct(this.store, player, command.payload ?? {}, this.now(), eventId);
        }
        if ((JOB_COMMANDS as readonly string[]).includes(command.type)) {
          return jobAct(this.store, player, command.payload ?? {}, this.now(), eventId);
        }
        if ((PROD_COMMANDS as readonly string[]).includes(command.type)) {
          return prodAct(this.store, player, command.payload ?? {}, this.now(), eventId);
        }
        if ((WEEK_COMMANDS as readonly string[]).includes(command.type)) {
          return dispatchWeek(this.weekHost(), ctx, command, eventId);
        }
        if ((WEEK2_COMMANDS as readonly string[]).includes(command.type)) {
          return dispatchWeek2(this.weekHost(), ctx, command, eventId);
        }
        if ((WEEK3_COMMANDS as readonly string[]).includes(command.type)) {
          return dispatchWeek3(this.weekHost(), ctx, command, eventId);
        }
        throw new UnknownCommandError((command as GameCommand).type);
    }
  }

  private weekHost(): WeekHost {
    return {
      store: this.store,
      now: this.now,
      respond: this.respond.bind(this),
      renderNode: this.renderNode.bind(this),
      load: (player) => this.load(player),
      addXp: this.addXp.bind(this),
      spend: this.spend.bind(this),
      changeCoins: this.changeCoins.bind(this),
      effectiveStats: (weekCtx) => this.effectiveStats(weekCtx as Ctx),
    };
  }

  private assertAllowed(command: GameCommand, ctx: Ctx): void {
    const type = command.type;
    const nightAllowed: GameCommandType[] = [
      'START_GAME',
      'EXPLORE',
      'DIALOGUE_CHOICE',
      'OPEN_INVENTORY',
      'OPEN_MENU',
      'BEGIN_DAY_2',
      'BEGIN_DAY_3',
      'BEGIN_DAY_4',
      'BEGIN_DAY_5',
      'BEGIN_DAY_6',
      'BEGIN_DAY_7',
      'BEGIN_DAY_8',
      'BEGIN_DAY_9',
      'BEGIN_DAY_10',
      'BEGIN_DAY_11',
      'BEGIN_DAY_12',
      'BEGIN_DAY_13',
      'BEGIN_DAY_14',
      'BEGIN_DAY_15',
      'BEGIN_DAY_16',
      'BEGIN_DAY_17',
      'BEGIN_DAY_18',
      'BEGIN_DAY_19',
      'BEGIN_DAY_20',
      'BEGIN_DAY_21',
      'EQUIP_ITEM',
      'USE_ITEM',
      'OPEN_PROFILE',
      'CLAN_ACT',
      'COSMETIC_ACT',
      'LEADERBOARD_PAGE',
      'PVP_ACT',
      'MARKET_ACT',
      'JOB_ACT',
      'PROD_ACT',
      'WEEK3_ACT',
      'PROMPT_HERO_NAME',
      'CANCEL_HERO_NAME',
    ];
    if (ctx.player.currentState.startsWith('night_') && !nightAllowed.includes(type)) {
      throw new ActionRejectedError('Сейчас ночь. Дождись утра.');
    }
    if (type === 'START_PVE') {
      const enemyId = String(command.payload?.enemyId ?? '');
      const req = COMBAT_REQUIREMENTS[enemyId];
      if (req) this.assertRequirement(req, ctx);
      return;
    }
    const req = COMMAND_REQUIREMENTS[type as GameCommandType];
    if (req) this.assertRequirement(req, ctx, type);
  }

  private assertRequirement(req: CommandRequirement, ctx: Ctx, type?: GameCommandType): void {
    if (!requirementMet(req, this.snapshot(ctx))) {
      if (type === 'GATHER_COAL' && req.itemsAny && !req.itemsAny.some((id) => ctx.items.some((item) => item.templateId === id))) {
        throw new ActionRejectedError('Голыми руками уголь не взять. Нужна хотя бы деревянная кирка.');
      }
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
    }
  }

  private snapshot(ctx: Ctx): MenuSnapshot {
    return {
      currentLocation: ctx.player.currentLocation,
      flags: ctx.flags,
      items: ctx.items,
      resources: ctx.resources,
      quests: ctx.quests,
    };
  }

  private async startGame(ctx: Ctx): Promise<GameResponse> {
    const nodeId = ctx.player.currentState || 'start';
    const rendered = await this.renderNode(ctx.player, nodeId === 'gather_wood' ? 'forest_hub' : nodeId);
    if (nodeId === 'start' || getDialogueNode(nodeId)?.id === 'start') {
      rendered.text = `${this.hud(ctx)}\n\n${rendered.text}`;
      if (isDefaultHeroName(ctx.player.name) && rendered.buttons.length < 5) {
        rendered.buttons.push({
          label: '✏ Назвать героя',
          action: 'PROMPT_HERO_NAME',
        });
      }
    }
    return rendered;
  }

  private hud(ctx: Ctx): string {
    const cap = this.energyCap(ctx);
    const names = ctx.items.map((item) => getItemTemplate(item.templateId)?.name ?? item.templateId);
    const inv = names.length ? names.slice(0, 4).join(', ') : 'пусто';
    return `❤️ HP ${ctx.player.hp}/${ctx.player.maxHp} · ⚡ Энергия ${ctx.player.energy}/${cap} · 🪙 Монеты ${ctx.player.coins}\n🎒 Инвентарь: ${inv}`;
  }

  private energyCap(ctx: Ctx): number {
    let bonus = 0;
    for (const itemId of Object.values(ctx.equipment)) {
      if (!itemId) continue;
      const item = ctx.items.find((row) => row.id === itemId);
      const template = item ? getItemTemplate(item.templateId) : undefined;
      bonus += template?.maxEnergyBonus ?? 0;
    }
    return ctx.player.maxEnergy + bonus;
  }

  private async explore(ctx: Ctx): Promise<GameResponse> {
    if (ctx.player.currentState.startsWith('night_') && !ctx.flags.day_1_complete) {
      return this.renderNode(ctx.player, ctx.player.currentState);
    }
    const loc = ctx.player.currentLocation;
    if (loc === 'player_camp' && ctx.flags.player_camp_founded) {
      return this.exploreCamp(ctx);
    }
    if (loc === 'soot_fissure') {
      if (
        ctx.flags.day_3_complete &&
        !ctx.flags.emberkit_rescued &&
        !ctx.flags.scavenger_bonded &&
        !ctx.flags.emberkit_notice_seen &&
        (ctx.flags.defeated_stone_scavenger || ctx.flags.scavenger_left_d4)
      ) {
        await this.store.setFlag(ctx.player.id, 'emberkit_notice_seen', '1');
        return this.renderNode(ctx.player, 'emberkit_notice');
      }
      return this.renderNode(ctx.player, 'soot_fissure_look');
    }
    if (loc === 'ashen_wedge') return openWeekMenu(this.weekHost(), ctx, 'wedge');
    if (loc === 'seal_forecourt') return openWeekMenu(this.weekHost(), ctx, 'prep');
    if (loc === 'mist_border') return openWeek2Menu(this.weekHost(), ctx, 'mist');
    if (loc === 'mist_lowland') return openWeek2Menu(this.weekHost(), ctx, 'lowland');
    if (loc === 'drowned_quarry') return openWeek2Menu(this.weekHost(), ctx, 'quarry');
    if (loc === 'second_seal') return openWeek2Menu(this.weekHost(), ctx, 'seal2');
    if (loc === 'rootwood_edge' || loc === 'tangled_path' || loc === 'old_marker') {
      return openWeek3Menu(this.weekHost(), ctx, 'rootwood');
    }
    if (loc === 'hollow_grove' || loc === 'root_pit') return openWeek3Menu(this.weekHost(), ctx, 'grove');
    if (loc === 'buried_mechanism' || loc === 'root_chamber') {
      return openWeek3Menu(this.weekHost(), ctx, 'mechanism');
    }
    if (loc === 'root_seal_forecourt' || loc === 'deep_root_vault') {
      return openWeek3Menu(this.weekHost(), ctx, 'seal3');
    }
    if (loc === 'rival_camp_edge') return this.renderNode(ctx.player, 'yara_edge');
    if (loc === 'rem_camp' && ctx.flags.met_rem) {
      if (ctx.flags.week_3_complete) return this.renderNode(ctx.player, 'week3_complete');
      if (ctx.flags.week_2_complete && !ctx.flags.day_15_complete) {
        return this.renderNode(ctx.player, 'week2_complete');
      }
      if (ctx.flags.week_2_complete) return openWeek3Menu(this.weekHost(), ctx, 'rootwood');
      if (ctx.flags.week_1_complete && !ctx.flags.day_8_complete) {
        return this.renderNode(ctx.player, 'week1_complete');
      }
      if (ctx.flags.week_1_complete) return openWeek2Menu(this.weekHost(), ctx, 'mist');
      if (ctx.flags.day_1_complete && !ctx.flags.day_2_complete) {
        return this.renderNode(ctx.player, 'rem_day2');
      }
      return this.renderNode(ctx.player, 'rem_camp');
    }
    if (loc === 'stone_scree') {
      if (ctx.flags.yara_claim_seen && !ctx.flags.day_6_complete) {
        return openWeekMenu(this.weekHost(), ctx, 'pvp');
      }
      return this.renderNode(ctx.player, 'stone_scree');
    }
    if (loc === 'old_adit') return this.renderNode(ctx.player, 'old_adit');
    if (loc === 'secret_chamber') return this.renderNode(ctx.player, 'secret_chamber');
    if (loc === 'node_7' && !ctx.flags.node7_gate_closed && ctx.flags.activated_node7_token) {
      return this.renderNode(ctx.player, 'rem_gate');
    }
    if (ctx.flags.week_3_complete) return this.renderNode(ctx.player, 'week3_complete');
    if (ctx.flags.week_2_complete && !ctx.flags.day_15_complete) {
      return this.renderNode(ctx.player, 'week2_complete');
    }
    if (ctx.flags.week_2_complete) return openWeek3Menu(this.weekHost(), ctx, 'rootwood');
    if (ctx.flags.week_1_complete && !ctx.flags.day_8_complete) {
      return this.renderNode(ctx.player, 'week1_complete');
    }
    if (ctx.flags.week_1_complete) return openWeek2Menu(this.weekHost(), ctx, 'mist');
    if (ctx.flags.day_2_complete) return this.renderNode(ctx.player, 'day2_complete');
    if (ctx.flags.player_camp_founded) {
      ctx.player.currentLocation = 'player_camp';
      await this.store.savePlayer(ctx.player);
      return this.exploreCamp(ctx);
    }
    if (ctx.flags.day_1_complete && ctx.player.currentState.startsWith('day2')) {
      return this.renderNode(ctx.player, 'day2_start');
    }
    return this.renderNode(ctx.player, ctx.flags.day_1_complete ? 'day1_complete' : 'forest_hub');
  }

  private campLookText(ctx: Ctx): string {
    const table = ctx.flags.camp_table_placed ? 'Верстак на земле.' : 'Верстак ещё в кармане.';
    const fire = ctx.flags.camp_fire_built ? 'Костёр есть.' : 'Костра нет.';
    const light = ctx.flags.camp_lit ? 'Светло.' : 'Темно.';
    const roof = ctx.flags.camp_on_shelter ? 'Крыша укрытия скрипит над головой.' : 'Пустая клетка леса.';
    return `Свой стан. ${roof}\n${table} ${fire} ${light}`;
  }

  private async exploreCamp(ctx: Ctx): Promise<GameResponse> {
    if (
      ctx.flags.day_3_complete &&
      !ctx.flags.day_4_complete &&
      ctx.flags.fed_stone_scavenger &&
      !ctx.flags.defeated_stone_scavenger &&
      !ctx.flags.scavenger_bonded &&
      !ctx.flags.scavenger_rejected_d4 &&
      !ctx.flags.scavenger_left_d4
    ) {
      return this.renderNode(ctx.player, 'scavenger_wounded');
    }
    if (
      ctx.flags.fed_stone_scavenger &&
      !ctx.flags.defeated_stone_scavenger &&
      !ctx.flags.scavenger_day2_visit &&
      !ctx.flags.day_3_complete
    ) {
      await this.store.setFlag(ctx.player.id, 'scavenger_day2_visit', '1');
      return this.renderNode(ctx.player, 'scavenger_day2');
    }
    const buttons: GameButton[] = [];
    if (!ctx.flags.seen_soot_fissure) {
      buttons.push({
        label: 'След сажи',
        action: 'DIALOGUE_CHOICE',
        payload: { nodeId: 'soot_notice', choiceId: 'go' },
      });
    } else {
      buttons.push({
        label: 'К расселине',
        action: 'DIALOGUE_CHOICE',
        payload: { nodeId: 'camp_look', choiceId: 'soot_go' },
      });
    }
    if (!ctx.flags.seen_ridge_tracks) {
      buttons.push({
        label: 'Следы на краю',
        action: 'DIALOGUE_CHOICE',
        payload: { nodeId: 'camp_look', choiceId: 'ridge' },
      });
    }
    if (ctx.flags.met_rem) {
      buttons.push({ label: 'К Рему', action: 'TALK_NPC', payload: { npcId: 'rem' } });
    }
    if (ctx.flags.scavenger_day2_visit && !ctx.flags.scavenger_cache && !ctx.flags.defeated_stone_scavenger) {
      buttons.push({
        label: 'Падальщик',
        action: 'DIALOGUE_CHOICE',
        payload: { nodeId: 'camp_look', choiceId: 'scavenger' },
      });
    }
    if (buttons.length < 5 && ctx.flags.day_2_complete && !ctx.flags.week_1_complete) {
      buttons.push({ label: '🌲 Клин', action: 'OPEN_MENU', payload: { menu: 'wedge' } });
    }
    if (buttons.length < 5 && ctx.flags.week_2_complete && !ctx.flags.week_3_complete) {
      buttons.push({ label: '🌿 Чаща', action: 'WEEK3_ACT', payload: { act: 'open' } });
    }
    if (buttons.length < 5 && ctx.flags.week_1_complete && !ctx.flags.week_2_complete) {
      if (ctx.flags.farming_unlocked) {
        buttons.push({ label: '🌾 Грядка', action: 'FARM_ACT', payload: { act: 'open' } });
      } else {
        buttons.push({ label: '🌫 Кромка', action: 'WEEK2_ACT', payload: { act: 'border' } });
      }
    }
    if (buttons.length < 5) {
      buttons.push({ label: '🏕 Стан', action: 'OPEN_MENU', payload: { menu: 'camp' } });
    }
    ctx.player.currentState = 'camp_look';
    await this.store.savePlayer(ctx.player);
    return this.respond(ctx.player, this.campLookText(ctx), buttons.slice(0, 5));
  }

  private hasCraftingTable(ctx: Ctx): boolean {
    return playerHasTable(ctx.items);
  }

  private async openMenu(ctx: Ctx, menu: ActionMenuId, extraText?: string): Promise<GameResponse> {
    if (isPvpMenu(menu)) return openPvpMenu(this.weekHost(), ctx, menu);
    if (isMarketMenu(menu)) return openMarketMenu(this.store, ctx.player, menu, this.now());
    if (isWorkMenu(menu)) return openWorkMenu(this.store, ctx.player, menu, this.now());
    if (isMetaMenu(menu)) return openMetaMenu(this.store, ctx.player, menu, this.now());
    if (isWeek3Menu(menu)) return openWeek3Menu(this.weekHost(), ctx, menu);
    if (isWeek2Menu(menu)) return openWeek2Menu(this.weekHost(), ctx, menu);
    if (isWeekMenu(menu)) return openWeekMenu(this.weekHost(), ctx, menu);
    const built = buildActionMenu(menu, this.snapshot(ctx));
    const text = extraText ?? (menu === 'hub' ? this.hubCampText(ctx) : built.text);
    return this.respond(ctx.player, text, built.buttons);
  }

  private hubCampText(ctx: Ctx): string {
    const resourceLines = Object.entries(ctx.resources)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([key, amount]) => `• ${resourceLabel(key as ResourceType)}: ${amount}`)
      .join('\n');
    const location = getLocation(ctx.player.currentLocation)?.name ?? ctx.player.currentLocation;
    return [
      `Лагерь. ${location}`,
      this.hud(ctx),
      resourceLines ? `Ресурсы:\n${resourceLines}` : 'Ресурсов пока нет.',
      'Цепочка: бревно → доски → палки → верстак → деревянная кирка → булыжник → каменная кирка → железо.',
      this.hasCraftingTable(ctx) ? 'Верстак стоит.' : 'Верстака нет — сначала доски.',
      ctx.flags.player_camp_founded
        ? `Стан: ${ctx.flags.camp_table_placed ? 'стол на земле' : 'стол не поставлен'}, ${ctx.flags.camp_fire_built ? 'костёр есть' : 'костра нет'}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async openCamp(ctx: Ctx): Promise<GameResponse> {
    return this.openMenu(ctx, 'hub');
  }

  private async openInventory(ctx: Ctx): Promise<GameResponse> {
    const equipped = new Set(Object.values(ctx.equipment));
    if (!ctx.items.length) {
      return this.respond(ctx.player, 'Инвентарь пуст.', [
        { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
        { label: '👁 Осмотреться', action: 'EXPLORE' },
      ]);
    }
    const lines = ctx.items.map((item) => {
      const template = getItemTemplate(item.templateId);
      return `• ${formatItemLine(template?.name ?? item.templateId, item.rarity, equipped.has(item.id))}`;
    });
    const buttons: GameButton[] = [];
    for (const item of ctx.items) {
      const template = getItemTemplate(item.templateId);
      if (template?.slot && !equipped.has(item.id)) {
        buttons.push({
          label: `Надеть: ${template.name}`,
          action: 'EQUIP_ITEM',
          payload: { itemId: item.id },
        });
      }
      if (template?.consumable) {
        buttons.push({ label: `Съесть: ${template.name}`, action: 'USE_ITEM', payload: { itemId: item.id } });
      }
      if (item.templateId === 'rusty_token') {
        buttons.push({ label: 'Осмотреть жетон', action: 'INSPECT_TOKEN' });
      }
    }
    return this.respond(ctx.player, `Инвентарь:\n${lines.join('\n')}`, [
      ...buttons,
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
      { label: '👁 Осмотреться', action: 'EXPLORE' },
    ]);
  }

  private async gatherWood(ctx: Ctx, eventId: string): Promise<GameResponse> {
    await this.spend(ctx.player, GATHER_WOOD.energyCost);
    const stats = await this.effectiveStats(ctx);
    const amount = Math.floor(GATHER_WOOD.baseYield * (1 + stats.woodYieldBonus));
    const total = await this.store.addResource(ctx.player.id, 'LOG', amount);
    ctx.player.currentState = 'gather_wood';
    if (ctx.player.currentLocation !== 'rem_camp' && ctx.player.currentLocation !== 'player_camp') {
      ctx.player.currentLocation = 'forest_clearing';
    }
    await this.store.savePlayer(ctx.player);
    const tokenNote = await this.tryGrantToken(ctx);
    const axeNote = stats.woodYieldBonus > 0 ? ' Топор дал бонус.' : '';
    void eventId;
    const daily = await noteDailyGather(this.weekHost(), ctx);
    const dailyNote = daily.length ? ` ${daily.join(' ')}` : '';
    await noteActivity(this.store, ctx.player, { type: 'gather', amount, resource: 'LOG' });
    const fresh = await this.load(ctx.player);
    const menu = buildActionMenu('gather', this.snapshot(fresh));
    return this.respond(
      ctx.player,
      `Ты рубишь дерево. +${amount} брёвен (всего ${total}). −${GATHER_WOOD.energyCost} энергии.${axeNote}${tokenNote}${dailyNote}`,
      menu.buttons,
    );
  }

  private async gatherStone(ctx: Ctx, eventId: string): Promise<GameResponse> {
    await this.spend(ctx.player, GATHER_STONE.energyCost);
    const stats = await this.effectiveStats(ctx);
    let amount = seededRange(eventId, GATHER_STONE.minYield, GATHER_STONE.maxYield, 'stone');
    amount = Math.max(1, Math.floor(amount * (1 + stats.stoneYieldBonus)));
    let extraNote = '';
    if (ctx.flags.fed_stone_scavenger && !ctx.flags.scavenger_extra_stone) {
      amount += 1;
      await this.store.setFlag(ctx.player.id, 'scavenger_extra_stone', '1');
      ctx.flags.scavenger_extra_stone = '1';
      extraNote = ' Падальщик не мешает: +1 булыжник.';
    }
    const total = await this.store.addResource(ctx.player.id, 'COBBLESTONE', amount);
    await this.store.savePlayer(ctx.player);
    const tokenNote = await this.tryGrantToken(ctx);
    const daily = await noteDailyGather(this.weekHost(), ctx);
    const dailyNote = daily.length ? ` ${daily.join(' ')}` : '';
    await noteActivity(this.store, ctx.player, { type: 'gather', amount, resource: 'COBBLESTONE' });
    const fresh = await this.load(ctx.player);
    const menu = buildActionMenu('gather', this.snapshot(fresh));
    return this.respond(ctx.player, `Ты ломаешь булыжник. +${amount} (всего ${total}).${extraNote}${tokenNote}${dailyNote}`, menu.buttons);
  }

  private async gatherIron(ctx: Ctx, eventId: string): Promise<GameResponse> {
    await this.spend(ctx.player, GATHER_IRON.energyCost);
    const stats = await this.effectiveStats(ctx);
    let amount = seededRange(eventId, GATHER_IRON.minYield, GATHER_IRON.maxYield, 'iron');
    amount = Math.max(1, Math.floor(amount * (1 + stats.oreYieldBonus)));
    const total = await this.store.addResource(ctx.player.id, 'IRON_ORE', amount);
    let extra = `+${amount} железной руды (всего ${total}).`;
    if (seededChance(eventId, GATHER_IRON.collapseChance, 'collapse')) {
      const loss = seededRange(eventId, GATHER_IRON.collapseMinHp, GATHER_IRON.collapseMaxHp, 'hp');
      ctx.player.hp = Math.max(1, ctx.player.hp - loss);
      extra += `\nОбвал! −${loss} HP. Ты успеваешь отскочить.`;
    }
    await this.store.savePlayer(ctx.player);
    if (total >= IRON_FOR_GATE_TARGET) {
      await this.store.setFlag(ctx.player.id, 'iron_ready', '1');
    }
    const quest = ctx.quests.iron_for_gate;
    if (quest && quest.status === 'ACTIVE') {
      await this.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'iron_for_gate',
        status: 'ACTIVE',
        progress: { iron: total, target: IRON_FOR_GATE_TARGET, ready: total >= IRON_FOR_GATE_TARGET },
      });
    }
    if (total >= IRON_FOR_GATE_TARGET && !ctx.flags.found_blue_light) {
      await this.store.setFlag(ctx.player.id, 'found_blue_light', '1');
      await noteActivity(this.store, ctx.player, { type: 'gather', amount, resource: 'IRON_ORE' });
      const node = await this.renderNode(ctx.player, 'adit_blue_light');
      node.text = `${extra}\n\n${node.text}`;
      return node;
    }
    await noteActivity(this.store, ctx.player, { type: 'gather', amount, resource: 'IRON_ORE' });
    return this.respond(ctx.player, extra, [
      { label: '⛏ Искать ещё', action: 'GATHER_IRON' },
      { label: 'Штольня', action: 'DIALOGUE_CHOICE', payload: { nodeId: 'old_adit', choiceId: 'leave' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'gather' } },
    ]);
  }

  private async gatherCoal(ctx: Ctx, eventId: string): Promise<GameResponse> {
    await this.spend(ctx.player, GATHER_COAL.energyCost);
    const amount = seededRange(eventId, GATHER_COAL.minYield, GATHER_COAL.maxYield, 'coal');
    const total = await this.store.addResource(ctx.player.id, 'COAL', amount);
    if (!ctx.flags.found_coal) {
      await this.store.setFlag(ctx.player.id, 'found_coal', '1');
      ctx.flags.found_coal = '1';
    }
    const daily = await noteDailyGather(this.weekHost(), ctx);
    const dailyNote = daily.length ? ` ${daily.join(' ')}` : '';
    await noteActivity(this.store, ctx.player, { type: 'gather', amount, resource: 'COAL' });
    const fresh = await this.load(ctx.player);
    const menu = buildActionMenu('gather', this.snapshot(fresh));
    return this.respond(
      ctx.player,
      `Ты ломаешь сажу. +${amount} угля (всего ${total}). −${GATHER_COAL.energyCost} энергии.${dailyNote}`,
      menu.buttons,
    );
  }

  private async craftItem(ctx: Ctx, recipeId: string): Promise<GameResponse> {
    const recipe = getRecipe(recipeId);
    if (!recipe) return this.respond(ctx.player, 'Такого рецепта нет.', NAV);
    if (recipe.station === 'crafting_table' && !this.hasCraftingTable(ctx)) {
      throw new ActionRejectedError('Нужен верстак.');
    }
    if (recipe.id === 'crafting_table' && this.hasCraftingTable(ctx)) {
      throw new ActionRejectedError('Верстак уже есть. Поставь его на стан, не делай второй.');
    }
    if (recipe.id === 'campfire' || recipe.id === 'chest') {
      if (ctx.player.currentLocation !== 'player_camp' || !ctx.flags.player_camp_founded) {
        throw new ActionRejectedError('Это ставится на своём стане.');
      }
    }
    if (recipe.id === 'campfire' && ctx.flags.camp_fire_built) {
      throw new ActionRejectedError('Костёр уже стоит.');
    }
    if (recipe.id === 'chest' && ctx.flags.camp_chest_built) {
      throw new ActionRejectedError('Сундук уже есть.');
    }
    if (recipe.id === 'furnace') {
      if (!ctx.flags.day_3_complete) {
        throw new ActionRejectedError('Печь — после Сизого клина. Сначала День 3.');
      }
      if (!furnaceCraftLocationOk(ctx)) {
        throw new ActionRejectedError('Печь ставится на своём стане. Или у костра Рема, если стана нет.');
      }
      if (ctx.flags.furnace_placed || ctx.flags.furnace_built) {
        throw new ActionRejectedError('Печь уже стоит.');
      }
    }
    if (
      (recipe.id === 'wooden_sword' || recipe.id === 'stone_sword' || recipe.id === 'hide_tunic') &&
      !ctx.flags.day_2_complete
    ) {
      throw new ActionRejectedError('Это оружие — после стана. Сначала День 2.');
    }
    if (
      (recipe.id === 'iron_pickaxe' || recipe.id === 'iron_axe' || recipe.id === 'iron_sword') &&
      !ctx.flags.first_ingot
    ) {
      throw new ActionRejectedError('Сначала выплави слиток в печи.');
    }
    if ((recipe.id === 'stone_hoe' || recipe.id === 'iron_hoe') && !ctx.flags.farming_unlocked) {
      throw new ActionRejectedError('Грядка ещё не открыта.');
    }
    if (recipe.id === 'bow' && !ctx.flags.first_string && !(ctx.resources.STRING ?? 0)) {
      throw new ActionRejectedError('Сначала добудь нить в низине.');
    }
    if (recipe.id === 'bucket' && !ctx.flags.day_10_complete) {
      throw new ActionRejectedError('Ведро — когда вода станет дорогой.');
    }
    if (recipe.id === 'shield' && !ctx.flags.day_12_complete && !ctx.flags.quarry_chamber) {
      throw new ActionRejectedError('Щит — к Смольнику.');
    }
    if (recipe.id === 'bread' && !ctx.flags.first_harvest && !(ctx.resources.WHEAT ?? 0)) {
      throw new ActionRejectedError('Сначала урожай.');
    }
    const cost = effectiveRecipeCost(recipe, this.snapshot(ctx));
    for (const [resource, need] of Object.entries(cost)) {
      const have = ctx.resources[resource as ResourceType] ?? 0;
      if (have < (need ?? 0)) {
        throw new InsufficientResourcesError(
          `Не хватает ${resourceLabel(resource as ResourceType)}: нужно ${need}, есть ${have}.`,
        );
      }
    }
    if (recipe.id === 'campfire') {
      const ok = await this.store.tryClaimReward(ctx.player.id, 'structure', 'campfire');
      if (!ok) throw new RewardAlreadyClaimedError('Костёр уже стоит.');
    }
    if (recipe.id === 'chest') {
      const ok = await this.store.tryClaimReward(ctx.player.id, 'structure', 'camp_chest');
      if (!ok) throw new RewardAlreadyClaimedError('Сундук уже есть.');
    }
    for (const [resource, need] of Object.entries(cost)) {
      await this.store.addResource(ctx.player.id, resource as ResourceType, -(need ?? 0));
    }
    if (recipe.output.kind === 'resource') {
      const total = await this.store.addResource(
        ctx.player.id,
        recipe.output.resource,
        recipe.output.amount,
      );
      const fresh = await this.load(ctx.player);
      const group = recipeGroup(recipe.id) ?? 'items';
      const menu = buildActionMenu(group, this.snapshot(fresh));
      await noteActivity(this.store, ctx.player, {
        type: 'craft',
        count: 1,
        recipeId: recipe.id,
        amount: recipe.output.amount,
      });
      return this.respond(
        ctx.player,
        `Скрафчено: ${recipe.name}. +${recipe.output.amount} ${resourceLabel(recipe.output.resource)} (всего ${total}).`,
        menu.buttons,
      );
    }
    const template = getItemTemplate(recipe.output.templateId);
    if (!template) return this.respond(ctx.player, 'Такого рецепта нет.', NAV);
    const amount = recipe.output.amount ?? 1;
    let lastItem: InventoryItemRecord | null = null;
    for (let i = 0; i < amount; i += 1) {
      const item = await this.store.createItem({
        playerId: ctx.player.id,
        templateId: template.id,
        rarity: template.rarity,
      });
      await this.store.recordItemHistory({
        itemId: item.id,
        playerId: ctx.player.id,
        type: 'CREATED',
        meta: { recipe: recipe.id },
      });
      lastItem = item;
    }
    if (recipe.id === 'campfire') {
      await this.store.setFlag(ctx.player.id, 'camp_fire_built', '1');
      await this.store.setFlag(ctx.player.id, 'camp_lit', '1');
    }
    if (recipe.id === 'chest') {
      await this.store.setFlag(ctx.player.id, 'camp_chest_built', '1');
    }
    for (const flag of afterCraftFlags(recipe.id, ctx.flags)) {
      await this.store.setFlag(ctx.player.id, flag, '1');
      ctx.flags[flag] = '1';
    }
    if (recipe.id === 'bow') {
      await grantMetaAchievement(this.store, ctx.player.id, 'FIRST_BOW');
    }
    const dailyNotes = await noteDailyCraft(this.weekHost(), ctx, recipe.id);
    await noteActivity(this.store, ctx.player, { type: 'craft', count: amount, recipeId: recipe.id, amount });
    const fresh = await this.load(ctx.player);
    const group = recipe.id === 'campfire' ? 'camp' : recipeGroup(recipe.id) ?? 'items';
    const menu = buildActionMenu(group, this.snapshot(fresh));
    const buttons: GameButton[] = [];
    if (template.slot && lastItem) {
      buttons.push({ label: 'Надеть', action: 'EQUIP_ITEM', payload: { itemId: lastItem.id } });
    }
    buttons.push(...menu.buttons);
    const made = amount > 1 ? `Скрафчено: ${template.name} ×${amount}.` : `Скрафчено: ${template.name}.`;
    const extra = dailyNotes.length ? ` ${dailyNotes.join(' ')}` : '';
    return this.respond(ctx.player, `${made}${extra}`, buttons);
  }

  private async equipItem(ctx: Ctx, itemId: string): Promise<GameResponse> {
    const item = await this.store.getItem(itemId);
    if (!item || item.playerId !== ctx.player.id) throw new ItemNotOwnedError();
    const template = getItemTemplate(item.templateId);
    if (!template?.slot) return this.respond(ctx.player, 'Этот предмет нельзя надеть.', NAV);
    await this.store.setEquipmentSlot(ctx.player.id, template.slot, item.id);
    await this.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'EQUIPPED' });
    const previousId = ctx.equipment[template.slot];
    if (previousId && previousId !== item.id) {
      const previous = ctx.items.find((row) => row.id === previousId);
      const prevTemplate = previous ? getItemTemplate(previous.templateId) : undefined;
      if (prevTemplate?.maxEnergyBonus) {
        ctx.player.maxEnergy = Math.max(STARTING_ENERGY, ctx.player.maxEnergy - prevTemplate.maxEnergyBonus);
      }
    }
    if (template.maxEnergyBonus && previousId !== item.id) {
      ctx.player.maxEnergy += template.maxEnergyBonus;
    }
    ctx.equipment[template.slot] = item.id;
    ctx.player.energy = Math.min(ctx.player.energy, this.energyCap(ctx));
    await this.store.savePlayer(ctx.player);
    return this.respond(ctx.player, `Надето: ${template.name} (${template.slot}).`, NAV);
  }

  private async useItem(ctx: Ctx, itemId: string): Promise<GameResponse> {
    const item = await this.store.getItem(itemId);
    if (!item || item.playerId !== ctx.player.id) throw new ItemNotOwnedError();
    if (item.templateId === 'rusty_token') return this.inspectToken(ctx);
    if (item.templateId === 'broken_lantern') {
      return this.respond(ctx.player, 'Стекло выбито. Потом. Вел носит стёкла — не сегодня.', NAV);
    }
    const template = getItemTemplate(item.templateId);
    if (template?.consumable && template.energyRestore) {
      const cap = this.energyCap(ctx);
      if (ctx.player.energy >= cap) {
        return this.respond(ctx.player, 'Энергия уже на максимуме. Тратить еду незачем.', NAV);
      }
      ctx.player.energy = Math.min(cap, ctx.player.energy + template.energyRestore);
      await this.store.savePlayer(ctx.player);
      await this.store.removeItem(item.id);
      return this.respond(ctx.player, `Ты съедаешь ${template.name}. +${template.energyRestore} энергии.`, NAV);
    }
    return this.respond(ctx.player, 'Пока неясно, как это использовать.', NAV);
  }

  private async talkNpc(ctx: Ctx, npcId: string): Promise<GameResponse> {
    if (npcId === 'vel') {
      if (!ctx.flags.met_vel) throw new ActionRejectedError('Вела ещё нет.');
      return openWeekMenu(this.weekHost(), ctx, 'trade');
    }
    if (npcId === 'yara') {
      ctx.player.currentLocation = 'rival_camp_edge';
      await this.store.savePlayer(ctx.player);
      await this.store.setFlag(ctx.player.id, 'seen_yara_camp', '1');
      await this.store.upsertDiscovery({
        playerId: ctx.player.id,
        discoveryId: 'yara_camp',
        title: 'Стан Яры',
        seen: true,
        defeated: false,
      });
      return this.renderNode(ctx.player, 'yara_edge');
    }
    if (npcId === 'mira') {
      if (!ctx.flags.week_1_complete) throw new ActionRejectedError('Миры ещё нет.');
      return talkMira(this.weekHost(), ctx);
    }
    if (npcId !== 'rem') return this.respond(ctx.player, 'Здесь никого нет.', NAV);
    if (ctx.flags.day_1_complete) {
      ctx.player.currentLocation = 'rem_camp';
      await this.store.savePlayer(ctx.player);
      if (ctx.flags.week_3_complete) return this.renderNode(ctx.player, 'week3_complete');
      if (ctx.flags.week_2_complete && !ctx.flags.day_15_complete) {
        return this.renderNode(ctx.player, 'week2_complete');
      }
      if (ctx.flags.week_2_complete) return openWeek3Menu(this.weekHost(), ctx, 'rootwood');
      if (ctx.flags.week_1_complete && !ctx.flags.day_8_complete) {
        return this.renderNode(ctx.player, 'week1_complete');
      }
      if (ctx.flags.week_1_complete) return openWeek2Menu(this.weekHost(), ctx, 'mist');
      if (ctx.flags.day_6_complete) return this.renderNode(ctx.player, 'day7_start');
      if (!ctx.flags.day_2_complete) return this.renderNode(ctx.player, 'rem_day2');
      return this.renderNode(ctx.player, 'rem_day2');
    }
    if (!ctx.flags.activated_node7_token) return this.renderNode(ctx.player, 'abandoned_camp');
    if (!ctx.flags.node7_gate_closed) {
      ctx.player.currentLocation = 'node_7';
      await this.store.savePlayer(ctx.player);
      return this.renderNode(ctx.player, 'rem_gate');
    }
    ctx.player.currentLocation = 'rem_camp';
    await this.store.setFlag(ctx.player.id, 'met_rem', '1');
    await this.store.savePlayer(ctx.player);
    return this.renderNode(ctx.player, 'rem_camp');
  }

  private async inspectToken(ctx: Ctx): Promise<GameResponse> {
    if (!ctx.items.some((item) => item.templateId === 'rusty_token')) {
      throw new ActionRejectedError('Жетона нет.');
    }
    await this.store.setFlag(ctx.player.id, 'activated_node7_token', '1');
    return this.renderNode(ctx.player, 'inspect_token');
  }

  private async buildShelter(ctx: Ctx): Promise<GameResponse> {
    if (ctx.flags.temporary_shelter_level) throw new ActionRejectedError('Укрытие уже стоит.');
    const logs = ctx.resources.LOG ?? 0;
    const legacyWood = ctx.resources.WOOD ?? 0;
    if (logs + legacyWood < SHELTER.woodCost) {
      throw new InsufficientResourcesError(`Нужно ${SHELTER.woodCost} брёвен, есть ${logs + legacyWood}.`);
    }
    const ok = await this.store.tryClaimReward(ctx.player.id, 'structure', 'temp_shelter');
    if (!ok) throw new RewardAlreadyClaimedError('Укрытие уже построено.');
    let remaining = SHELTER.woodCost;
    const takeLogs = Math.min(logs, remaining);
    if (takeLogs > 0) {
      await this.store.addResource(ctx.player.id, 'LOG', -takeLogs);
      remaining -= takeLogs;
    }
    if (remaining > 0) {
      await this.store.addResource(ctx.player.id, 'WOOD', -remaining);
    }
    await this.store.setFlag(ctx.player.id, 'temporary_shelter_level', '1');
    return this.renderNode(ctx.player, 'shelter_built');
  }

  private async feedScavenger(ctx: Ctx): Promise<GameResponse> {
    const rusk = ctx.items.find((item) => item.templateId === 'dry_rusk');
    if (!rusk) {
      return this.respond(
        ctx.player,
        'Ты протягиваешь пустую ладонь. Падальщик фыркает камешками. Почти смешно.',
        [
          { label: 'Уйти', action: 'DIALOGUE_CHOICE', payload: { nodeId: 'scavenger', choiceId: 'leave' } },
          { label: 'Атаковать', action: 'START_PVE', payload: { enemyId: 'stone_scavenger' } },
        ],
      );
    }
    const first = await this.store.tryClaimReward(ctx.player.id, 'affinity', 'stone_scavenger');
    if (!first) {
      return this.respond(ctx.player, 'Он сыт и смотрит в сторону. Ещё один сухарь ничего не изменит.', NAV);
    }
    await this.store.removeItem(rusk.id);
    await this.store.setFlag(ctx.player.id, 'fed_stone_scavenger', '1');
    await this.store.setFlag(ctx.player.id, 'stone_scavenger_affinity', '1');
    ctx.flags.fed_stone_scavenger = '1';
    ctx.flags.stone_scavenger_affinity = '1';
    return this.renderNode(ctx.player, 'scavenger_fed');
  }

  private async openCrate(ctx: Ctx): Promise<GameResponse> {
    const claimed = await this.store.hasRewardClaim(ctx.player.id, 'crate', 'start_crate');
    if (claimed) return this.renderNode(ctx.player, 'open_crate_empty');
    const ok = await this.store.tryClaimReward(ctx.player.id, 'crate', 'start_crate');
    if (!ok) throw new RewardAlreadyClaimedError();
    await this.store.addResource(ctx.player.id, 'LOG', START_CRATE.log);
    const knife = await this.store.createItem({
      playerId: ctx.player.id,
      templateId: 'stone_knife',
      rarity: 'COMMON',
    });
    await this.store.recordItemHistory({ itemId: knife.id, playerId: ctx.player.id, type: 'LOOTED' });
    const rusk = await this.store.createItem({
      playerId: ctx.player.id,
      templateId: 'dry_rusk',
      rarity: 'COMMON',
    });
    await this.store.recordItemHistory({ itemId: rusk.id, playerId: ctx.player.id, type: 'LOOTED' });
    await this.store.setFlag(ctx.player.id, 'opened_start_crate', '1');
    ctx.player.currentState = 'open_crate';
    await this.store.savePlayer(ctx.player);
    return this.respond(
      ctx.player,
      `${DIALOGUE_NODES.open_crate.text}\n\nПолучено: бревно ×${START_CRATE.log}, сухарь, каменный нож.`,
      this.choicesToButtons('open_crate', DIALOGUE_NODES.open_crate.choices),
    );
  }

  private async openSecretChest(ctx: Ctx): Promise<GameResponse> {
    const ok = await this.store.tryClaimReward(ctx.player.id, 'chest', 'adit_secret');
    if (!ok) throw new RewardAlreadyClaimedError('Сундук уже пуст.');
    const item = await this.store.createItem({
      playerId: ctx.player.id,
      templateId: 'miner_belt',
      rarity: 'UNCOMMON',
    });
    await this.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
    return this.renderNode(ctx.player, 'secret_chest_done');
  }

  private async mineBlue(ctx: Ctx): Promise<GameResponse> {
    await this.store.setFlag(ctx.player.id, 'unknown_blue_mineral', '1');
    return this.renderNode(ctx.player, 'secret_blue_fail');
  }

  private async returnIron(ctx: Ctx): Promise<GameResponse> {
    const ore = ctx.resources.IRON_ORE ?? 0;
    if (ore < IRON_FOR_GATE_TARGET) {
      throw new InsufficientResourcesError(`Нужно ${IRON_FOR_GATE_TARGET} руды, есть ${ore}.`);
    }
    const ok = await this.store.tryClaimReward(ctx.player.id, 'quest', 'iron_for_gate');
    if (!ok) throw new RewardAlreadyClaimedError('Железо уже сдано.');
    await this.store.addResource(ctx.player.id, 'IRON_ORE', -IRON_FOR_GATE_TARGET);
    await this.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'iron_for_gate',
      status: 'CLAIMED',
      progress: { delivered: IRON_FOR_GATE_TARGET },
    });
    await this.store.adjustNpcRelation(ctx.player.id, 'rem', 1, 0);
    const xpNote = await this.addXp(ctx.player, 40);
    await this.changeCoins(ctx.player, 25, 'quest_iron_for_gate', 'iron_for_gate');
    const node = await this.renderNode(ctx.player, 'rem_quest_done');
    node.text = `${node.text}\n+25 монет. ${xpNote}`;
    return node;
  }

  private async restNight(ctx: Ctx, place: string): Promise<GameResponse> {
    if (ctx.flags.day_1_complete) throw new ActionRejectedError('Первая ночь уже прожита.');
    if (place === 'shelter' && !ctx.flags.temporary_shelter_level) {
      throw new ActionRejectedError('Укрытия нет.');
    }
    const claimed = await this.store.tryClaimReward(ctx.player.id, 'night', 'day_1');
    if (!claimed) throw new ActionRejectedError('Первая ночь уже началась.');
    const cap = this.energyCap(ctx);
    const bonus = place === 'shelter' ? SHELTER.nightEnergyBonus : 0;
    ctx.player.energy = Math.min(cap, ctx.player.energy + NIGHT_REST.energyBase + bonus);
    if (NIGHT_REST.hpToFull) ctx.player.hp = ctx.player.maxHp;
    ctx.player.currentLocation = place === 'shelter' ? 'forest_clearing' : 'rem_camp';
    await this.store.savePlayer(ctx.player);
    if (place === 'shelter' && ctx.flags.fed_stone_scavenger) {
      const gift = await this.store.tryClaimReward(ctx.player.id, 'gift', 'scavenger_shiny');
      if (gift) {
        await this.store.addResource(ctx.player.id, 'SHINY_STONE', 1);
        return this.renderNode(ctx.player, 'night_shelter_gift');
      }
    }
    if (place === 'shelter') return this.renderNode(ctx.player, 'night_shelter');
    return this.renderNode(ctx.player, 'night_rem');
  }

  private async beginDay2(ctx: Ctx): Promise<GameResponse> {
    if (!ctx.flags.day_1_complete) throw new ActionRejectedError();
    if (ctx.flags.day_2_complete) return this.renderNode(ctx.player, 'day2_complete');
    if (ctx.flags.player_camp_founded) {
      ctx.player.currentLocation = 'player_camp';
      await this.store.savePlayer(ctx.player);
      return this.exploreCamp(await this.load(ctx.player));
    }
    ctx.player.currentLocation = ctx.flags.slept_at_shelter ? 'forest_clearing' : 'rem_camp';
    ctx.player.currentState = 'day2_start';
    await this.store.savePlayer(ctx.player);
    return this.renderNode(ctx.player, 'day2_start');
  }

  private async foundCamp(ctx: Ctx, onShelter: boolean): Promise<GameResponse> {
    if (!ctx.flags.day_1_complete) throw new ActionRejectedError();
    if (ctx.flags.player_camp_founded) {
      ctx.player.currentLocation = 'player_camp';
      await this.store.savePlayer(ctx.player);
      return this.exploreCamp(await this.load(ctx.player));
    }
    const useShelter = onShelter && Boolean(ctx.flags.temporary_shelter_level);
    await this.store.setFlag(ctx.player.id, 'player_camp_founded', '1');
    if (useShelter) await this.store.setFlag(ctx.player.id, 'camp_on_shelter', '1');
    await this.store.setFlag(ctx.player.id, 'visited_player_camp', '1');
    await this.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'found_a_camp',
      status: 'ACTIVE',
      progress: {},
    });
    ctx.player.currentLocation = 'player_camp';
    ctx.player.currentState = 'camp_founded';
    await this.store.savePlayer(ctx.player);
    await grantMetaAchievement(this.store, ctx.player.id, 'FIRST_CAMP');
    const roof = useShelter
      ? 'Ты ставишь стан на укрытие. Крыша уже есть — костру нужно меньше брёвен.'
      : 'Пустая клетка. Всё с нуля. Костёр возьмёт полный набор брёвен.';
    return this.renderNode(ctx.player, 'camp_founded').then((node) => {
      node.text = `${roof}\n\n${node.text}`;
      return node;
    });
  }

  private async placeCampTable(ctx: Ctx): Promise<GameResponse> {
    if (ctx.flags.camp_table_placed) {
      return this.openMenu(ctx, 'camp', 'Верстак уже на земле.');
    }
    if (!this.hasCraftingTable(ctx)) {
      throw new ActionRejectedError('Верстака нет. Скрафти стол — тот же рецепт, что вчера.');
    }
    const ok = await this.store.tryClaimReward(ctx.player.id, 'structure', 'camp_table');
    if (!ok) {
      await this.store.setFlag(ctx.player.id, 'camp_table_placed', '1');
      return this.openMenu(await this.load(ctx.player), 'camp', 'Верстак уже на земле.');
    }
    await this.store.setFlag(ctx.player.id, 'camp_table_placed', '1');
    const fresh = await this.load(ctx.player);
    return this.openMenu(fresh, 'camp', 'Верстак стоит на земле. Не в кармане. Второй не нужен.');
  }

  private async lightCamp(ctx: Ctx): Promise<GameResponse> {
    if (ctx.flags.camp_lit) {
      return this.openMenu(ctx, 'camp', 'Уже светло.');
    }
    if (ctx.flags.camp_fire_built) {
      await this.store.setFlag(ctx.player.id, 'camp_lit', '1');
      return this.openMenu(await this.load(ctx.player), 'camp', 'Костёр даёт свет.');
    }
    const torch = ctx.items.find((item) => item.templateId === 'torch');
    if (!torch) {
      throw new ActionRejectedError('Нечем светить. Нужен костёр или факел.');
    }
    await this.store.removeItem(torch.id);
    await this.store.setFlag(ctx.player.id, 'camp_lit', '1');
    const claim = await this.store.tryClaimReward(ctx.player.id, 'light', 'camp_torch');
    void claim;
    return this.openMenu(await this.load(ctx.player), 'camp', 'Факел шипит. Стан виден.');
  }

  private async completeDay2(ctx: Ctx): Promise<GameResponse> {
    if (ctx.flags.day_2_complete) return this.renderNode(ctx.player, 'day2_complete');
    if (!ctx.flags.player_camp_founded || !ctx.flags.camp_table_placed || !ctx.flags.camp_fire_built) {
      throw new ActionRejectedError('Сначала верстак на земле и костёр.');
    }
    const ok = await this.store.tryClaimReward(ctx.player.id, 'quest', 'found_a_camp');
    if (!ok) {
      await this.store.setFlag(ctx.player.id, 'day_2_complete', '1');
      return this.renderNode(ctx.player, 'day2_complete');
    }
    await this.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId: 'found_a_camp',
      status: 'CLAIMED',
      progress: { table: true, fire: true, chest: Boolean(ctx.flags.camp_chest_built) },
    });
    await this.store.setFlag(ctx.player.id, 'day_2_complete', '1');
    const xpNote = await this.addXp(ctx.player, CAMP_QUEST_XP);
    await noteActivity(this.store, ctx.player, { type: 'quest', id: 'found_a_camp' });
    await noteActivity(this.store, ctx.player, { type: 'day', day: 2 });
    const node = await this.renderNode(ctx.player, 'day2_complete');
    node.text = `${node.text}\n${xpNote}`;
    return node;
  }

  private async startPve(
    ctx: Ctx,
    enemyId: string,
    eventId: string,
    payload: Record<string, unknown> = {},
  ): Promise<GameResponse> {
    const enemy = getEnemy(enemyId) ?? ENEMIES.wild_shrew;
    if (enemyId === 'mine_crawler') await this.spend(ctx.player, 2);
    if (enemyId === 'stumpfang' && payload.torch) {
      const torch = ctx.items.find((item) => item.templateId === 'torch');
      if (!torch) throw new ActionRejectedError('Факела нет.');
      await this.store.removeItem(torch.id);
      await this.store.setFlag(ctx.player.id, 'burned_torch_at_stumpfang', '1');
      ctx.flags.burned_torch_at_stumpfang = '1';
      ctx.items = ctx.items.filter((item) => item.id !== torch.id);
    }
    if (enemyId === 'wenzel_warden') {
      ctx.player.currentLocation = 'seal_forecourt';
      await this.store.savePlayer(ctx.player);
      const move = String(payload.move ?? 'hinge');
      for (const flag of afterWenzelMoveFlags(move)) {
        await this.store.setFlag(ctx.player.id, flag, '1');
        ctx.flags[flag] = '1';
      }
    }
    if (isWeek2Enemy(enemyId)) {
      if (enemyId === 'mist_warden') ctx.player.currentLocation = 'second_seal';
      else if (enemyId === 'smolnik' || enemyId === 'bog_gnawer' || enemyId === 'pitch_carapace') {
        ctx.player.currentLocation = 'drowned_quarry';
      } else if (enemyId === 'reed_stalker') {
        if (!isWeek2Location(ctx.player.currentLocation)) ctx.player.currentLocation = 'mist_lowland';
      } else if (!isWeek2Location(ctx.player.currentLocation)) {
        ctx.player.currentLocation = 'mist_border';
      }
      await this.store.savePlayer(ctx.player);
      if (enemyId === 'mist_warden' && String(payload.move ?? '') === 'drain') {
        await this.store.setFlag(ctx.player.id, 'used_bucket_on_warden', '1');
        ctx.flags.used_bucket_on_warden = '1';
      }
    }
    if (isWeek3Enemy(enemyId)) {
      if (enemyId === 'vyazen') ctx.player.currentLocation = 'deep_root_vault';
      else if (enemyId === 'rootlasher' || enemyId === 'sap_stinger') {
        ctx.player.currentLocation = 'root_pit';
      } else if (!isWeek3Location(ctx.player.currentLocation)) {
        ctx.player.currentLocation = 'hollow_grove';
      }
      await this.store.savePlayer(ctx.player);
    }
    const stats = await this.effectiveStats(ctx);
    const week2Mods = isWeek2Enemy(enemyId) ? week2Modifiers(ctx, enemyId, payload) : null;
    const week3Mods = isWeek3Enemy(enemyId)
      ? week3Modifiers(ctx, enemyId, payload, await loadWeek3JobLevels(this.weekHost(), ctx))
      : null;
    const weekMods = week2Mods ?? week3Mods;
    const mods = enemyId === 'wenzel_warden' ? wenzelModifiers(ctx, String(payload.move ?? 'hinge')) : weekMods;
    const playerSnap: CombatantSnapshot = {
      id: ctx.player.id,
      name: ctx.player.name,
      hp: ctx.player.hp,
      maxHp: ctx.player.maxHp,
      attack: stats.attack,
      defense: stats.defense + (mods?.player.defense ?? 0),
      speed: stats.speed + (mods?.player.speed ?? 0) + (enemyId === 'mine_crawler' && ctx.flags.heard_mine_crawler ? 5 : 0),
      critChance: stats.critChance + (mods?.player.critChance ?? 0),
      critDamage: stats.critDamage,
      dodge: stats.dodge + (mods?.player.dodge ?? 0) + (enemyId === 'mine_crawler' && ctx.flags.heard_mine_crawler ? 10 : 0),
      accuracy: stats.accuracy,
      luck: stats.luck,
      minDamage: mods?.player.minDamage ?? stats.minDamage,
      maxDamage: mods?.player.maxDamage ?? stats.maxDamage,
    };
    let enemyHp = enemy.hp;
    let enemyDef = enemy.defense;
    let enemyDodge = enemy.dodge;
    if (enemyId === 'stumpfang' && ctx.flags.burned_torch_at_stumpfang) {
      enemyHp = Math.floor(enemy.hp * 0.75);
      enemyDef = Math.max(0, enemy.defense - 3);
    }
    if (mods) {
      enemyHp += mods.enemy.hp ?? 0;
      enemyDef = Math.max(0, enemyDef + (mods.enemy.defense ?? 0));
      if (mods.enemy.dodge != null) enemyDodge = mods.enemy.dodge;
    }
    const enemySnap: CombatantSnapshot = {
      id: enemy.id,
      name: enemy.name,
      hp: enemyHp,
      maxHp: enemyHp,
      attack: enemy.minDamage,
      defense: enemyDef,
      speed: enemy.speed,
      critChance: enemy.critChance,
      critDamage: enemy.critDamage,
      dodge: enemyDodge,
      accuracy: enemy.accuracy - (enemyId === 'mine_crawler' && ctx.flags.heard_mine_crawler ? 15 : 0),
      luck: 0,
      minDamage: enemy.minDamage,
      maxDamage: enemy.maxDamage,
    };
    const battle = simulateBattle({
      player: playerSnap,
      enemy: enemySnap,
      seed: eventId,
      balanceVersion: BALANCE_VERSION,
      playerOpeningHits: weekMods?.playerOpeningHits ?? 0,
    });
    const match = await this.store.createCombatMatch({
      playerId: ctx.player.id,
      mode: 'PVE',
      enemyId: enemy.id,
      seed: String(battle.seed),
      balanceVersion: battle.balanceVersion,
      result: battle.result,
      playerSnapshot: battle.playerSnapshot,
      enemySnapshot: battle.enemySnapshot,
      startedAt: this.now(),
      finishedAt: this.now(),
    });
    await this.store.addCombatEvents(match.id, battle.events);
    await noteActivity(this.store, ctx.player, {
      type: 'pve',
      result: battle.result,
      enemyId: enemy.id,
    });
    if (battle.result === 'LOSS') {
      ctx.player.hp = Math.max(1, Math.floor(ctx.player.maxHp * 0.2));
    } else {
      ctx.player.hp = Math.max(1, battle.playerHp);
    }
    await this.store.savePlayer(ctx.player);
    const log = formatCombatLog(battle, ctx.player.id, ctx.player.name, enemy.name);
    let extra = mods?.note ? `\n${mods.note}.` : '';
    const buttons: GameButton[] = [...NAV];
    if (battle.result === 'WIN') {
      extra += await this.applyCombatLoot(ctx, enemyId, eventId, buttons);
      await this.store.upsertDiscovery({
        playerId: ctx.player.id,
        discoveryId: enemy.id,
        title: enemy.name,
        seen: true,
        defeated: true,
      });
      if (enemyId === 'wenzel_warden') {
        const winNotes = await applyWenzelVictory(this.weekHost(), ctx);
        extra += `\n${winNotes.join(' ')}`;
        buttons.unshift({ label: 'К двери', action: 'COMPLETE_DAY_7' });
      }
      if (isWeek2Enemy(enemyId)) {
        const winNotes = await applyWeek2Victory(this.weekHost(), ctx, enemyId);
        if (winNotes.length) extra += `\n${winNotes.join(' ')}`;
        if (enemyId === 'smolnik') {
          buttons.unshift({ label: 'Завершить День 13', action: 'COMPLETE_DAY_13' });
        } else if (enemyId === 'mist_warden') {
          buttons.unshift({ label: 'К карте', action: 'COMPLETE_DAY_14' });
        } else if (enemyId === 'threadling' || enemyId === 'reed_stalker') {
          buttons.unshift({ label: 'Низина', action: 'WEEK2_ACT', payload: { act: 'lowland' } });
        } else {
          buttons.unshift({ label: 'Карьер', action: 'WEEK2_ACT', payload: { act: 'quarry' } });
        }
      }
      if (isWeek3Enemy(enemyId)) {
        const winNotes = await applyWeek3Victory(this.weekHost(), ctx, enemyId);
        if (winNotes.length) extra += `\n${winNotes.join(' ')}`;
        if (enemyId === 'rootlasher') {
          buttons.unshift({ label: 'Следы', action: 'WEEK3_ACT', payload: { act: 'social' } });
        } else if (enemyId === 'vyazen') {
          buttons.unshift({ label: 'К карте', action: 'COMPLETE_DAY_21' });
        } else {
          buttons.unshift({ label: 'Роща', action: 'WEEK3_ACT', payload: { act: 'grove' } });
        }
      }
      if (enemyId === 'stumpfang' || enemyId === 'moss_boar' || enemyId === 'resin_brute') {
        buttons.unshift({ label: 'Клин', action: 'OPEN_MENU', payload: { menu: 'wedge' } });
      }
    } else {
      extra += '\nПредметы при тебе. Можно восстановиться и попробовать снова.';
      if (enemyId === 'stumpfang') {
        await this.store.setFlag(ctx.player.id, 'stumpfang_failed', '1');
        extra += ' Рем не смеётся.';
        buttons.unshift({ label: 'Край клина', action: 'OPEN_MENU', payload: { menu: 'wedge' } });
      }
      if (enemyId === 'wenzel_warden') {
        await this.store.setFlag(ctx.player.id, 'wenzel_failed_attempt', '1');
        buttons.unshift({ label: 'Подготовиться', action: 'OPEN_MENU', payload: { menu: 'prep' } });
      }
      if (enemyId === 'smolnik') {
        await this.store.setFlag(ctx.player.id, 'smolnik_failed', '1');
        buttons.unshift({ label: 'Ещё раз', action: 'WEEK2_ACT', payload: { act: 'smolnik' } });
      }
      if (enemyId === 'mist_warden') {
        await this.store.setFlag(ctx.player.id, 'mist_warden_failed', '1');
        buttons.unshift({ label: 'Подготовиться', action: 'WEEK2_ACT', payload: { act: 'prep' } });
      }
      if (enemyId === 'rootlasher') {
        await this.store.setFlag(ctx.player.id, 'rootlasher_failed', '1');
        buttons.unshift({ label: 'Ещё раз', action: 'WEEK3_ACT', payload: { act: 'rootlasher' } });
      }
      if (enemyId === 'vyazen') {
        await this.store.setFlag(ctx.player.id, 'vyazen_failed', '1');
        buttons.unshift({ label: 'Подготовиться', action: 'WEEK3_ACT', payload: { act: 'prep' } });
      }
    }
    return this.respond(ctx.player, `${log}${extra}`, buttons);
  }

  private async applyCombatLoot(
    ctx: Ctx,
    enemyId: string,
    eventId: string,
    buttons: GameButton[],
  ): Promise<string> {
    const notes: string[] = [];
    if (enemyId === 'wild_shrew') {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', 'wild_shrew');
      if (first) {
        await this.store.addResource(ctx.player.id, 'RAW_MEAT', 1);
        await this.store.addResource(ctx.player.id, 'SHREW_FUR', 1);
        await this.store.setFlag(ctx.player.id, 'defeated_wild_shrew', '1');
        notes.push(await this.addXp(ctx.player, 18));
        notes.push('+1 сырое мясо, +1 шкурка.');
      }
    }
    if (enemyId === 'mine_crawler') {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', 'mine_crawler');
      if (first) {
        await this.store.addResource(ctx.player.id, 'CHITIN_PLATE', 1);
        await this.changeCoins(ctx.player, 14, 'combat_loot', 'mine_crawler');
        await this.store.setFlag(ctx.player.id, 'defeated_mine_crawler', '1');
        notes.push(await this.addXp(ctx.player, 24));
        notes.push('+14 монет, хитиновая пластина.');
        if (seededChance(eventId, 20, 'gloves')) {
          const gloves = await this.store.createItem({
            playerId: ctx.player.id,
            templateId: 'worn_gloves',
            rarity: 'COMMON',
          });
          await this.store.recordItemHistory({ itemId: gloves.id, playerId: ctx.player.id, type: 'LOOTED' });
          await noteActivity(this.store, ctx.player, { type: 'loot', count: 1 });
          notes.push('Потёртые перчатки!');
          buttons.unshift({ label: 'Надеть перчатки', action: 'EQUIP_ITEM', payload: { itemId: gloves.id } });
        }
      }
    }
    if (enemyId === 'stone_scavenger') {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', 'stone_scavenger');
      if (first) {
        await this.store.setFlag(ctx.player.id, 'defeated_stone_scavenger', '1');
        notes.push(await this.addXp(ctx.player, 12));
      }
    }
    if (['moss_boar', 'needle_runner', 'pitch_mite', 'resin_brute', 'stumpfang', 'soot_mite'].includes(enemyId)) {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', `${enemyId}:first`);
      const weekNotes = await applyWeekLoot(this.weekHost(), ctx, enemyId, eventId, first);
      notes.push(...weekNotes);
    }
    if (isWeek2Enemy(enemyId)) {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', `${enemyId}:first`);
      const weekNotes = await applyWeekLoot(this.weekHost(), ctx, enemyId, eventId, first);
      notes.push(...weekNotes);
      const fresh = await this.store.getResources(ctx.player.id);
      if ((fresh.STRING ?? 0) > 0 && !ctx.flags.first_string) {
        await this.store.setFlag(ctx.player.id, 'first_string', '1');
        ctx.flags.first_string = '1';
      }
    }
    if (isWeek3Enemy(enemyId)) {
      const first = await this.store.tryClaimReward(ctx.player.id, 'combat_loot', `${enemyId}:first`);
      const weekNotes = await applyWeekLoot(this.weekHost(), ctx, enemyId, eventId, first);
      notes.push(...weekNotes);
    }
    return notes.length ? `\n${notes.filter(Boolean).join(' ')}` : '';
  }

  private async claimReward(ctx: Ctx, rewardType: string, rewardRef: string): Promise<GameResponse> {
    if (!rewardType || !rewardRef) return this.respond(ctx.player, 'Награда не найдена.', NAV);
    const allowed =
      (rewardType === 'coins' && rewardRef === 'demo_coins') ||
      (rewardType === 'gift' && rewardRef === 'scavenger_cache');
    if (!allowed) throw new ActionRejectedError('Награда не найдена.');
    if (rewardType === 'gift' && rewardRef === 'scavenger_cache') {
      if (!ctx.flags.fed_stone_scavenger || ctx.flags.defeated_stone_scavenger) {
        throw new ActionRejectedError('Падальщик не оставляет тебе ничего.');
      }
    }
    const ok = await this.store.tryClaimReward(ctx.player.id, rewardType, rewardRef);
    if (!ok) throw new RewardAlreadyClaimedError();
    if (rewardType === 'coins' && rewardRef === 'demo_coins') {
      await this.changeCoins(ctx.player, 10, 'claim_reward', rewardRef);
      return this.respond(ctx.player, 'Получено 10 монет.', NAV);
    }
    await this.store.addResource(ctx.player.id, 'COBBLESTONE', 2);
    await this.store.setFlag(ctx.player.id, 'scavenger_cache', '1');
    await this.store.setFlag(ctx.player.id, 'scavenger_day2_visit', '1');
    return this.renderNode(ctx.player, 'scavenger_day2_cache');
  }

  async changeCoins(player: PlayerRecord, amount: number, reason: string, referenceId?: string): Promise<PlayerRecord> {
    const next = player.coins + amount;
    if (next < 0) throw new InsufficientCoinsError();
    await this.store.addCurrencyTransaction({
      playerId: player.id,
      currency: 'COINS',
      amount,
      balanceBefore: player.coins,
      balanceAfter: next,
      reason,
      referenceId,
    });
    player.coins = next;
    await this.store.savePlayer(player);
    await noteActivity(this.store, player, { type: 'coins', amount });
    return player;
  }

  private async addXp(player: PlayerRecord, amount: number): Promise<string> {
    player.xp += amount;
    let note = `+${amount} XP.`;
    while (player.level < XP_THRESHOLDS.length - 1 && player.xp >= XP_THRESHOLDS[player.level + 1]!) {
      player.level += 1;
      player.maxHp += LEVEL_UP.maxHpGain;
      player.maxEnergy += LEVEL_UP.maxEnergyGain;
      if (LEVEL_UP.fillHpToMax) player.hp = player.maxHp;
      player.energy = Math.min(player.maxEnergy, player.energy + LEVEL_UP.maxEnergyGain);
      note += ` Уровень ${player.level}! Макс. HP +${LEVEL_UP.maxHpGain}, макс. энергия +${LEVEL_UP.maxEnergyGain}.`;
      if (player.level === 2) note += ' HP восстановлено.';
    }
    await this.store.savePlayer(player);
    return note;
  }

  private async spend(player: PlayerRecord, amount: number): Promise<void> {
    const refreshed = regenerateEnergy(player, this.now());
    Object.assign(player, refreshed);
    if (player.energy < amount) {
      throw new InsufficientEnergyError(`Нужно ${amount} энергии. Сейчас ${player.energy}.`);
    }
    player.energy -= amount;
    await this.store.savePlayer(player);
  }

  private async tryGrantToken(ctx: Ctx): Promise<string> {
    if (ctx.items.some((item) => item.templateId === 'rusty_token') || ctx.flags.found_rusty_token) return '';
    const ok = await this.store.tryClaimReward(ctx.player.id, 'item', 'rusty_token');
    if (!ok) return '';
    const item = await this.store.createItem({
      playerId: ctx.player.id,
      templateId: 'rusty_token',
      rarity: 'UNCOMMON',
    });
    await this.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
    await this.store.setFlag(ctx.player.id, 'found_rusty_token', '1');
    ctx.items.push(item);
    ctx.flags.found_rusty_token = '1';
    return '\nПод корнями — ржавый жетон. Один. Больше таких не будет.';
  }

  private async effectiveStats(ctx: Ctx) {
    const stats = {
      ...STARTING_STATS,
      ...ctx.player.stats,
      woodYieldBonus: 0,
      stoneYieldBonus: 0,
      oreYieldBonus: 0,
      minDamage: 1,
      maxDamage: 2,
    };
    for (const itemId of Object.values(ctx.equipment)) {
      if (!itemId) continue;
      const item = ctx.items.find((row) => row.id === itemId) ?? (await this.store.getItem(itemId));
      if (!item) continue;
      const template = getItemTemplate(item.templateId);
      if (!template) continue;
      stats.attack += template.attackBonus ?? 0;
      stats.defense += template.defenseBonus ?? 0;
      stats.woodYieldBonus += template.woodYieldBonus ?? 0;
      stats.stoneYieldBonus += template.stoneYieldBonus ?? 0;
      stats.oreYieldBonus += template.oreYieldBonus ?? 0;
      stats.dodge += template.dodgeBonus ?? 0;
      if (template.minDamage != null && template.maxDamage != null) {
        stats.minDamage = template.minDamage;
        stats.maxDamage = template.maxDamage;
      }
    }
    return stats;
  }

  private matchesCondition(
    condition: DialogueCondition | DialogueCondition[] | undefined,
    ctx: Ctx,
  ): boolean {
    if (!condition) return true;
    const list = Array.isArray(condition) ? condition : [condition];
    return list.every((rule) => {
      if (rule.type === 'always') return true;
      if (rule.type === 'flag') {
        const value = ctx.flags[rule.flag ?? ''];
        if (rule.exists === false) return value == null;
        if (rule.equals != null) return value === rule.equals;
        return value != null;
      }
      if (rule.type === 'item') return ctx.items.some((item) => item.templateId === rule.templateId);
      if (rule.type === 'resource') return (ctx.resources[rule.resource!] ?? 0) >= (rule.min ?? 0);
      if (rule.type === 'quest') {
        const quest = ctx.quests[rule.questId ?? ''];
        if (!quest) return false;
        return (rule.statuses ?? []).includes(quest.status);
      }
      if (rule.type === 'location') return ctx.player.currentLocation === rule.locationId;
      if (rule.type === 'equipped') {
        return Object.values(ctx.equipment).some((id) => {
          const item = ctx.items.find((row) => row.id === id);
          return item?.templateId === rule.templateId;
        });
      }
      return true;
    });
  }

  private choicesToButtons(nodeId: string, choices: DialogueChoice[]): GameButton[] {
    return choices.map((choice) => {
      if (choice.command) {
        return { label: choice.label, action: choice.command, payload: choice.commandPayload };
      }
      return { label: choice.label, action: 'DIALOGUE_CHOICE', payload: { nodeId, choiceId: choice.id } };
    });
  }

  private async applyActions(
    player: PlayerRecord,
    actions: DialogueAction[] | undefined,
    ctx: Ctx,
  ): Promise<{ notes: string[]; nextOverride?: string }> {
    if (!actions?.length) return { notes: [] };
    const notes: string[] = [];
    let nextOverride: string | undefined;
    for (const action of actions) {
      switch (action.type) {
        case 'set_flag':
          await this.store.setFlag(player.id, action.flag, action.value ?? '1');
          ctx.flags[action.flag] = action.value ?? '1';
          break;
        case 'add_resource': {
          const amount = await this.store.addResource(player.id, action.resource, action.amount);
          notes.push(`${resourceLabel(action.resource)}: ${amount}`);
          break;
        }
        case 'give_item': {
          const template = getItemTemplate(action.templateId);
          if (!template) break;
          if (action.templateId === 'broken_lantern') {
            const claimed = await this.store.hasRewardClaim(player.id, 'item', 'broken_lantern');
            if (claimed) break;
          }
          const item = await this.store.createItem({
            playerId: player.id,
            templateId: template.id,
            rarity: action.rarity ?? template.rarity,
          });
          await this.store.recordItemHistory({
            itemId: item.id,
            playerId: player.id,
            type: action.source ?? 'CREATED',
          });
          ctx.items.push(item);
          notes.push(`Получено: ${template.name}`);
          break;
        }
        case 'set_relation':
          await this.store.adjustNpcRelation(
            player.id,
            action.npcId,
            action.trustDelta ?? 0,
            action.reputationDelta ?? 0,
          );
          break;
        case 'set_location':
          player.currentLocation = action.locationId;
          break;
        case 'set_state':
          player.currentState = action.state;
          break;
        case 'claim_reward':
          await this.store.tryClaimReward(player.id, action.rewardType, action.rewardRef);
          break;
        case 'start_quest': {
          await this.store.upsertPlayerQuest({
            playerId: player.id,
            questId: action.questId,
            status: 'ACTIVE',
            progress: {},
          });
          const title = QUEST_TEMPLATES.find((quest) => quest.id === action.questId)?.title ?? action.questId;
          notes.push(`Задание: ${title}.`);
          break;
        }
        case 'set_discovery':
          await this.store.upsertDiscovery({
            playerId: player.id,
            discoveryId: action.discoveryId,
            title: action.title,
            seen: action.seen ?? true,
            defeated: action.defeated ?? false,
          });
          break;
        case 'spend_energy':
          player.energy = Math.max(0, player.energy - action.amount);
          break;
        case 'visit':
          await this.store.setFlag(player.id, `visited_${action.locationId}`, '1');
          ctx.flags[`visited_${action.locationId}`] = '1';
          break;
        case 'consume_item': {
          const found = ctx.items.find((item) => item.templateId === action.templateId);
          if (!found) {
            nextOverride = action.elseNode;
            break;
          }
          await this.store.removeItem(found.id);
          ctx.items = ctx.items.filter((item) => item.id !== found.id);
          nextOverride = action.thenNode ?? nextOverride;
          break;
        }
        default:
          break;
      }
    }
    await this.store.savePlayer(player);
    return { notes, nextOverride };
  }

  private async dialogueChoice(ctx: Ctx, nodeId: string, choiceId: string): Promise<GameResponse> {
    const node = getDialogueNode(nodeId);
    const choice = node?.choices.find((entry) => entry.id === choiceId);
    if (!choice) return this.renderNode(ctx.player, ctx.player.currentState || 'start');
    if (!this.matchesCondition(choice.condition, ctx)) {
      throw new ActionRejectedError('Этот выбор уже недоступен.');
    }
    const applied = await this.applyActions(ctx.player, choice.actions, ctx);
    const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
    if (choice.command) {
      const inner = await this.dispatch(fresh, { type: choice.command, payload: choice.commandPayload }, `inner:${randomUUID()}`);
      if (applied.notes.length) inner.text = `${inner.text}\n\n${applied.notes.join('\n')}`;
      return inner;
    }
    const nextId = applied.nextOverride ?? choice.nextNode ?? nodeId;
    const rendered = await this.renderNode(fresh, nextId);
    if (applied.notes.length) rendered.text = `${rendered.text}\n\n${applied.notes.join('\n')}`;
    return rendered;
  }

  private async renderNode(player: PlayerRecord, nodeId: string): Promise<GameResponse> {
    let node: DialogueNode | undefined = getDialogueNode(nodeId) ?? DIALOGUE_NODES.start;
    if (node.id === 'day1_complete' || nodeId === 'day1_complete') {
      return this.completeDay1(player);
    }
    player.currentState = node.id;
    await this.store.savePlayer(player);
    const ctx = await this.load(player);
    let text = node.text;
    if (node.id === 'abandoned_camp' || node.id === 'check_bushes') {
      const tokenNote = await this.tryGrantToken(ctx);
      if (tokenNote) text = `${text}${tokenNote}`;
    }
    const choices = node.choices.filter((choice) => this.matchesCondition(choice.condition, ctx));
    return this.respond(player, text, this.choicesToButtons(node.id, choices));
  }

  private async completeDay1(player: PlayerRecord): Promise<GameResponse> {
    await this.store.setFlag(player.id, 'day_1_complete', '1');
    player.currentState = 'day1_complete';
    await this.store.savePlayer(player);
    await noteActivity(this.store, player, { type: 'day', day: 1 });
    const ctx = await this.load(player);
    const pack = await this.store.tryClaimReward(player.id, 'day1', 'survivor_pack');
    let packNote = '';
    if (pack) {
      await this.changeCoins(player, 50, 'day1_survivor', 'survivor_pack');
      await this.store.addResource(player.id, 'FOOD', 2);
      for (let i = 0; i < 2; i += 1) {
        const food = await this.store.createItem({
          playerId: player.id,
          templateId: 'dry_rusk',
          rarity: 'COMMON',
        });
        await this.store.recordItemHistory({ itemId: food.id, playerId: player.id, type: 'LOOTED' });
      }
      packNote = '\nНаграда выжившего: +50 монет, еда ×2.';
    }
    const locations = ['forest_clearing', 'rem_camp', 'stone_scree', 'old_adit', 'node_7', 'secret_chamber']
      .filter((id) => ctx.flags[`visited_${id}`])
      .map((id) => LOCATIONS[id]?.name ?? id);
    const killed = [];
    if (ctx.flags.defeated_wild_shrew) killed.push('дикая землеройка');
    if (ctx.flags.defeated_mine_crawler) killed.push('шахтный ползун');
    if (ctx.flags.defeated_stone_scavenger) killed.push('каменный падальщик');
    const discoveries = [];
    if (ctx.flags.found_rusty_token) discoveries.push('ржавый жетон');
    if (ctx.discoveries.some((row) => row.discoveryId === 'unknown_node7_creature')) discoveries.push('существо Узла 7 (???)');
    if (ctx.flags.unknown_blue_mineral) discoveries.push('неизвестный синий минерал');
    if (ctx.flags.found_broken_lantern) discoveries.push('сломанный фонарь');
    const summary = [
      DIALOGUE_NODES.day1_complete.text,
      packNote.trim(),
      `Уровень: ${player.level}`,
      `Локации: ${locations.join(', ') || 'опушка'}`,
      `Побеждённые: ${killed.join(', ') || 'никто'}`,
      `Находки: ${discoveries.join(', ') || '—'}`,
    ]
      .filter(Boolean)
      .join('\n');
    return this.respond(player, summary, [{ label: '▶ День 2', action: 'BEGIN_DAY_2' }]);
  }

  private async handleClanInput(
    ctx: Ctx,
    command: GameCommand,
    eventId: string,
    text?: string,
  ): Promise<GameResponse> {
    const raw = (text ?? '').trim();
    if (command.type === 'START_GAME' && raw && !isStartAlias(raw)) {
      return handleClanTextInput(this.store, ctx.player, raw, this.now());
    }
    await this.store.setFlag(ctx.player.id, AWAITING_CLAN_FLAG, '0');
    const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
    return this.dispatch(fresh, command, eventId, text, true);
  }

  private async handleMarketInput(
    ctx: Ctx,
    command: GameCommand,
    eventId: string,
    text?: string,
  ): Promise<GameResponse> {
    const raw = (text ?? '').trim();
    if (command.type === 'MARKET_ACT' && String(command.payload?.act ?? '') === 'cancel_input') {
      return marketAct(this.store, ctx.player, command.payload ?? {}, this.now(), eventId);
    }
    if (command.type === 'START_GAME' && raw && !isStartAlias(raw)) {
      return handleMarketTextInput(this.store, ctx.player, raw, this.now());
    }
    await this.store.setFlag(ctx.player.id, AWAITING_MARKET_FLAG, '0');
    const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
    return this.dispatch(fresh, command, eventId, text, true);
  }

  private async handleNameInput(
    ctx: Ctx,
    command: GameCommand,
    eventId: string,
    text?: string,
  ): Promise<GameResponse> {
    if (command.type === 'CANCEL_HERO_NAME') {
      await this.store.setFlag(ctx.player.id, AWAITING_NAME_FLAG, '0');
      const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
      return this.openMenu(await this.load(fresh), 'profile');
    }
    if (command.type === 'PROMPT_HERO_NAME') {
      return this.promptHeroName(ctx);
    }
    const raw = (text ?? '').trim();
    if (command.type === 'START_GAME' && (isStartAlias(raw) || !raw)) {
      await this.store.setFlag(ctx.player.id, AWAITING_NAME_FLAG, '0');
      const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
      return this.startGame(await this.load(fresh));
    }
    if (command.type === 'START_GAME' && raw) {
      return this.applyHeroName(ctx, raw);
    }
    await this.store.setFlag(ctx.player.id, AWAITING_NAME_FLAG, '0');
    const fresh = (await this.store.findPlayerById(ctx.player.id)) ?? ctx.player;
    return this.dispatch(fresh, command, eventId, text, true);
  }

  private async promptHeroName(ctx: Ctx): Promise<GameResponse> {
    await this.store.setFlag(ctx.player.id, AWAITING_NAME_FLAG, '1');
    const current = isDefaultHeroName(ctx.player.name) ? DEFAULT_HERO_NAME : ctx.player.name;
    const prompt = isDefaultHeroName(ctx.player.name)
      ? NAME_PROMPT_TEXT
      : `Сейчас тебя зовут ${current}.\n${NAME_PROMPT_TEXT}`;
    return this.respond(ctx.player, prompt, [
      { label: '❌ Отмена', action: 'CANCEL_HERO_NAME' },
      { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
    ]);
  }

  private async applyHeroName(ctx: Ctx, raw: string): Promise<GameResponse> {
    const parsed = validateHeroName(raw);
    if (!parsed.ok) {
      return this.respond(ctx.player, INVALID_NAME_TEXT, [
        { label: '❌ Отмена', action: 'CANCEL_HERO_NAME' },
        { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
      ]);
    }
    ctx.player.name = parsed.name;
    await this.store.savePlayer(ctx.player);
    await this.store.setFlag(ctx.player.id, AWAITING_NAME_FLAG, '0');
    return this.respond(ctx.player, `Готово. В Куболесье тебя знают как ${parsed.name}.`, [
      { label: '👤 Профиль', action: 'OPEN_MENU', payload: { menu: 'profile' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
    ]);
  }

  private async respond(player: PlayerRecord, text: string, buttons: GameButton[]): Promise<GameResponse> {
    const state: GameStateView = {
      playerId: player.id,
      location: player.currentLocation,
      node: player.currentState,
      hp: player.hp,
      maxHp: player.maxHp,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      coins: player.coins,
      level: player.level,
      xp: player.xp,
    };
    return { text, buttons, state };
  }

  private async withNotices(playerId: string, response: GameResponse): Promise<GameResponse> {
    const notices = await this.store.consumeNotices(playerId, MARKET.noticeBatch);
    if (!notices.length) return response;
    const prefix = notices.map((row) => `🔔 ${row.body}`).join('\n');
    return { ...response, text: `${prefix}\n\n${response.text}` };
  }
}

export { ITEM_TEMPLATES };
