import { randomUUID } from 'node:crypto';
import {
  BALANCE_VERSION,
  STARTING_STATS,
  type EquipmentSlot,
  type GameButton,
  type GameCommand,
  type GameResponse,
  type GameStateView,
  type NormalizedIncomingEvent,
  type ResourceType,
} from '@kubolesie/shared';
import {
  CAMP_BUTTONS,
  CRAFT_RECIPES,
  DIALOGUE_NODES,
  ENEMIES,
  GATHER_WOOD,
  ITEM_TEMPLATES,
  LOCATIONS,
  getDialogueNode,
  getEnemy,
  getItemTemplate,
  getLocation,
  getRecipe,
  resourceLabel,
  type DialogueAction,
  type DialogueChoice,
  type DialogueCondition,
} from '@kubolesie/content';
import { simulateBattle, type CombatantSnapshot } from '@kubolesie/combat-engine';
import { regenerateEnergy } from './energy';
import {
  GameError,
  InsufficientCoinsError,
  InsufficientEnergyError,
  InsufficientResourcesError,
  ItemNotOwnedError,
  RewardAlreadyClaimedError,
  UnknownCommandError,
} from './errors';
import type { GameStore, InventoryItemRecord, PlayerRecord } from './store';

const NAV_BUTTONS: GameButton[] = [
  { label: 'Лагерь', action: 'OPEN_CAMP' },
  { label: 'Инвентарь', action: 'OPEN_INVENTORY' },
];

export class GameRuntime {
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: GameStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(event: NormalizedIncomingEvent): Promise<GameResponse> {
    return this.serialize(`event:${event.eventId}`, async () => {
      const existing = await this.store.findProcessedEvent(event.eventId);
      if (existing) {
        return existing.response;
      }

      const playerKey = event.identity.providerUserId;
      return this.serialize(`player:${playerKey}`, async () => {
        const again = await this.store.findProcessedEvent(event.eventId);
        if (again) return again.response;

        const response = await this.execute(event);
        await this.store.saveProcessedEvent({
          eventId: event.eventId,
          playerId: response.state?.playerId ?? null,
          command: event.command.type,
          response,
          createdAt: this.now(),
        });
        return response;
      });
    });
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
      return await this.dispatch(current, event.command, event.eventId);
    } catch (error) {
      if (error instanceof GameError) {
        return {
          text: error.message,
          buttons: NAV_BUTTONS,
        };
      }
      throw error;
    }
  }

  private async ensurePlayer(event: NormalizedIncomingEvent): Promise<PlayerRecord> {
    const existing = await this.store.findPlayerByVkUserId(event.identity.providerUserId);
    if (existing) return existing;
    return this.store.createPlayer({
      vkUserId: event.identity.providerUserId,
      name: event.identity.displayName?.trim() || 'Путник',
    });
  }

  private async dispatch(
    player: PlayerRecord,
    command: GameCommand,
    eventId: string,
  ): Promise<GameResponse> {
    switch (command.type) {
      case 'START_GAME':
        return this.renderNode(player, player.currentState || 'start');
      case 'EXPLORE':
        return this.explore(player);
      case 'OPEN_INVENTORY':
        return this.openInventory(player);
      case 'OPEN_CAMP':
        return this.openCamp(player);
      case 'GATHER_WOOD':
        return this.gatherWood(player);
      case 'CRAFT_ITEM':
        return this.craftItem(player, String(command.payload?.templateId ?? ''));
      case 'EQUIP_ITEM':
        return this.equipItem(player, String(command.payload?.itemId ?? ''));
      case 'USE_ITEM':
        return this.useItem(player, String(command.payload?.itemId ?? ''));
      case 'TALK_NPC':
        return this.talkNpc(player, String(command.payload?.npcId ?? 'rem'));
      case 'START_PVE':
        return this.startPve(player, String(command.payload?.enemyId ?? 'wild_shrew'), eventId);
      case 'CLAIM_REWARD':
        return this.claimReward(
          player,
          String(command.payload?.rewardType ?? ''),
          String(command.payload?.rewardRef ?? ''),
        );
      case 'OPEN_CRATE':
        return this.openCrate(player);
      case 'DIALOGUE_CHOICE':
        return this.dialogueChoice(
          player,
          String(command.payload?.nodeId ?? player.currentState),
          String(command.payload?.choiceId ?? ''),
        );
      default:
        throw new UnknownCommandError((command as GameCommand).type);
    }
  }

  private async renderNode(player: PlayerRecord, nodeId: string): Promise<GameResponse> {
    const node = getDialogueNode(nodeId) ?? DIALOGUE_NODES.start;
    player.currentState = node.id;
    await this.store.savePlayer(player);
    const flags = await this.store.getFlags(player.id);
    const items = await this.store.listItems(player.id);
    const resources = await this.store.getResources(player.id);
    const choices = node.choices.filter((choice) =>
      this.matchesCondition(choice.condition, flags, items, resources),
    );
    return this.respond(player, node.text, this.choicesToButtons(node.id, choices));
  }

  private choicesToButtons(nodeId: string, choices: DialogueChoice[]): GameButton[] {
    return choices.map((choice) => {
      if (choice.command) {
        return {
          label: choice.label,
          action: choice.command,
          payload: choice.commandPayload,
        };
      }
      return {
        label: choice.label,
        action: 'DIALOGUE_CHOICE',
        payload: { nodeId, choiceId: choice.id },
      };
    });
  }

  private matchesCondition(
    condition: DialogueCondition | DialogueCondition[] | undefined,
    flags: Record<string, string>,
    items: InventoryItemRecord[],
    resources: Partial<Record<ResourceType, number>>,
  ): boolean {
    if (!condition) return true;
    const list = Array.isArray(condition) ? condition : [condition];
    return list.every((rule) => {
      if (rule.type === 'always') return true;
      if (rule.type === 'flag') {
        const value = flags[rule.flag ?? ''];
        if (rule.exists === false) return value == null;
        if (rule.equals != null) return value === rule.equals;
        return value != null;
      }
      if (rule.type === 'item') {
        return items.some((item) => item.templateId === rule.templateId);
      }
      if (rule.type === 'resource') {
        return (resources[rule.resource!] ?? 0) >= (rule.min ?? 0);
      }
      return true;
    });
  }

  private async applyActions(player: PlayerRecord, actions: DialogueAction[] | undefined): Promise<string[]> {
    if (!actions?.length) return [];
    const notes: string[] = [];
    for (const action of actions) {
      switch (action.type) {
        case 'set_flag':
          await this.store.setFlag(player.id, action.flag, action.value ?? '1');
          break;
        case 'add_resource': {
          const amount = await this.store.addResource(player.id, action.resource, action.amount);
          notes.push(`${resourceLabel(action.resource)}: ${amount}`);
          break;
        }
        case 'give_item': {
          const template = getItemTemplate(action.templateId);
          if (!template) break;
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
          const templates = await this.store.listQuestTemplates();
          const template = templates.find((row) => row.id === action.questId);
          if (template) {
            await this.store.upsertPlayerQuest({
              playerId: player.id,
              questId: action.questId,
              status: 'ACTIVE',
              progress: {},
            });
            notes.push(`Задание: ${template.title}`);
          }
          break;
        }
        default:
          break;
      }
    }
    await this.store.savePlayer(player);
    return notes;
  }

  private async dialogueChoice(player: PlayerRecord, nodeId: string, choiceId: string): Promise<GameResponse> {
    const node = getDialogueNode(nodeId);
    const choice = node?.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return this.renderNode(player, player.currentState || 'start');
    }
    const notes = await this.applyActions(player, choice.actions);
    if (choice.command) {
      const inner = await this.dispatch(
        (await this.store.findPlayerById(player.id)) ?? player,
        { type: choice.command, payload: choice.commandPayload },
        `inner:${randomUUID()}`,
      );
      if (notes.length) inner.text = `${inner.text}\n\n${notes.join('\n')}`;
      return inner;
    }
    const nextId = choice.nextNode ?? nodeId;
    const rendered = await this.renderNode((await this.store.findPlayerById(player.id)) ?? player, nextId);
    if (notes.length) rendered.text = `${rendered.text}\n\n${notes.join('\n')}`;
    return rendered;
  }

  private async explore(player: PlayerRecord): Promise<GameResponse> {
    const location = getLocation(player.currentLocation) ?? LOCATIONS.forest_clearing;
    const extra =
      player.currentLocation === 'node_7'
        ? '\nВорота закрыты.'
        : '';
    return this.respond(player, `${location.name}\n${location.text}${extra}`, [
      { label: 'Начать сцену', action: 'START_GAME' },
      ...CAMP_BUTTONS.filter((button) => button.action !== 'EXPLORE'),
    ]);
  }

  private async openInventory(player: PlayerRecord): Promise<GameResponse> {
    const items = await this.store.listItems(player.id);
    const equipment = await this.store.getEquipment(player.id);
    const equipped = new Set(Object.values(equipment));
    if (!items.length) {
      return this.respond(player, 'Инвентарь пуст.', NAV_BUTTONS);
    }
    const lines = items.map((item) => {
      const template = getItemTemplate(item.templateId);
      const mark = equipped.has(item.id) ? ' [экип.]' : '';
      return `• ${template?.name ?? item.templateId} (${item.rarity})${mark}`;
    });
    const buttons: GameButton[] = items
      .filter((item) => {
        const template = getItemTemplate(item.templateId);
        return Boolean(template?.slot) && !equipped.has(item.id);
      })
      .map((item) => ({
        label: `Надеть: ${getItemTemplate(item.templateId)?.name ?? item.templateId}`,
        action: 'EQUIP_ITEM',
        payload: { itemId: item.id },
      }));
    return this.respond(player, `Инвентарь:\n${lines.join('\n')}`, [...buttons, ...NAV_BUTTONS]);
  }

  private async openCamp(player: PlayerRecord): Promise<GameResponse> {
    const resources = await this.store.getResources(player.id);
    const resourceLines = Object.entries(resources)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([key, amount]) => `• ${resourceLabel(key as ResourceType)}: ${amount}`)
      .join('\n');
    const location = getLocation(player.currentLocation)?.name ?? player.currentLocation;
    const text = [
      `Лагерь. Локация: ${location}`,
      `HP ${player.hp}/${player.maxHp} · Энергия ${player.energy}/${player.maxEnergy} · Монеты ${player.coins}`,
      resourceLines ? `Ресурсы:\n${resourceLines}` : 'Ресурсов пока нет.',
    ].join('\n');
    return this.respond(player, text, CAMP_BUTTONS);
  }

  private async gatherWood(player: PlayerRecord): Promise<GameResponse> {
    const refreshed = regenerateEnergy(player, this.now());
    if (refreshed.energy < GATHER_WOOD.energyCost) {
      throw new InsufficientEnergyError(
        `Нужно ${GATHER_WOOD.energyCost} энергии. Сейчас ${refreshed.energy}.`,
      );
    }
    refreshed.energy -= GATHER_WOOD.energyCost;
    const equipped = await this.effectiveStats(refreshed);
    const multiplier = 1 + equipped.woodYieldBonus;
    const yieldAmount = Math.floor(GATHER_WOOD.baseYield * multiplier);
    const total = await this.store.addResource(refreshed.id, 'WOOD', yieldAmount);
    refreshed.currentState = 'gather_wood';
    await this.store.savePlayer(refreshed);
    const axeNote = equipped.woodYieldBonus > 0 ? ' Каменный топор дал бонус.' : '';
    return this.respond(
      refreshed,
      `Ты рубишь дерево. +${yieldAmount} дерево (всего ${total}). −${GATHER_WOOD.energyCost} энергии.${axeNote}`,
      [
        { label: 'Рубить ещё', action: 'GATHER_WOOD' },
        { label: 'Лагерь', action: 'OPEN_CAMP' },
        { label: 'Инвентарь', action: 'OPEN_INVENTORY' },
      ],
    );
  }

  private async craftItem(player: PlayerRecord, templateId: string): Promise<GameResponse> {
    const recipe = getRecipe(templateId);
    const template = getItemTemplate(templateId);
    if (!recipe || !template) {
      return this.respond(player, 'Такого рецепта нет.', CAMP_BUTTONS);
    }
    const resources = await this.store.getResources(player.id);
    for (const [resource, need] of Object.entries(recipe.cost)) {
      const have = resources[resource as ResourceType] ?? 0;
      if (have < (need ?? 0)) {
        throw new InsufficientResourcesError(
          `Не хватает ${resourceLabel(resource as ResourceType)}: нужно ${need}, есть ${have}.`,
        );
      }
    }
    for (const [resource, need] of Object.entries(recipe.cost)) {
      await this.store.addResource(player.id, resource as ResourceType, -(need ?? 0));
    }
    const item = await this.store.createItem({
      playerId: player.id,
      templateId,
      rarity: template.rarity,
    });
    await this.store.recordItemHistory({
      itemId: item.id,
      playerId: player.id,
      type: 'CREATED',
      meta: { recipe: templateId },
    });
    return this.respond(player, `Скрафчено: ${template.name}.`, [
      { label: 'Надеть', action: 'EQUIP_ITEM', payload: { itemId: item.id } },
      ...CAMP_BUTTONS,
    ]);
  }

  private async equipItem(player: PlayerRecord, itemId: string): Promise<GameResponse> {
    const item = await this.store.getItem(itemId);
    if (!item || item.playerId !== player.id) {
      throw new ItemNotOwnedError();
    }
    const template = getItemTemplate(item.templateId);
    if (!template?.slot) {
      return this.respond(player, 'Этот предмет нельзя надеть.', NAV_BUTTONS);
    }
    await this.store.setEquipmentSlot(player.id, template.slot, item.id);
    await this.store.recordItemHistory({
      itemId: item.id,
      playerId: player.id,
      type: 'EQUIPPED',
    });
    return this.respond(player, `Надето: ${template.name} (${template.slot}).`, NAV_BUTTONS);
  }

  private async useItem(player: PlayerRecord, itemId: string): Promise<GameResponse> {
    const item = await this.store.getItem(itemId);
    if (!item || item.playerId !== player.id) {
      throw new ItemNotOwnedError();
    }
    if (item.templateId === 'rusty_token') {
      return this.renderNode(player, 'inspect_token');
    }
    return this.respond(player, 'Пока неясно, как это использовать.', NAV_BUTTONS);
  }

  private async talkNpc(player: PlayerRecord, npcId: string): Promise<GameResponse> {
    if (npcId === 'rem') {
      player.currentLocation = 'rem_camp';
      await this.store.setFlag(player.id, 'met_rem', '1');
      await this.store.adjustNpcRelation(player.id, 'rem', 0, 0);
      return this.renderNode(player, 'meet_rem');
    }
    return this.respond(player, 'Здесь никого нет.', NAV_BUTTONS);
  }

  private async openCrate(player: PlayerRecord): Promise<GameResponse> {
    const claimed = await this.store.hasRewardClaim(player.id, 'crate', 'start_crate');
    if (claimed) {
      return this.renderNode(player, 'open_crate_empty');
    }
    const ok = await this.store.tryClaimReward(player.id, 'crate', 'start_crate');
    if (!ok) {
      throw new RewardAlreadyClaimedError();
    }
    const template = ITEM_TEMPLATES.rusty_token;
    const item = await this.store.createItem({
      playerId: player.id,
      templateId: template.id,
      rarity: template.rarity,
    });
    await this.store.recordItemHistory({
      itemId: item.id,
      playerId: player.id,
      type: 'LOOTED',
      meta: { source: 'start_crate' },
    });
    await this.store.setFlag(player.id, 'found_rusty_token', '1');
    player.currentState = 'open_crate';
    await this.store.savePlayer(player);
    return this.respond(
      player,
      `${DIALOGUE_NODES.open_crate.text}\n\nПолучено: ${template.name}.`,
      this.choicesToButtons('open_crate', DIALOGUE_NODES.open_crate.choices),
    );
  }

  private async startPve(player: PlayerRecord, enemyId: string, eventId: string): Promise<GameResponse> {
    const enemy = getEnemy(enemyId) ?? ENEMIES.wild_shrew;
    const stats = await this.effectiveStats(player);
    const playerSnap: CombatantSnapshot = {
      id: player.id,
      name: player.name,
      hp: player.hp,
      maxHp: player.maxHp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      critChance: stats.critChance,
      critDamage: stats.critDamage,
      dodge: stats.dodge,
      accuracy: stats.accuracy,
      luck: stats.luck,
    };
    const enemySnap: CombatantSnapshot = {
      id: enemy.id,
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.hp,
      attack: enemy.minDamage,
      defense: enemy.defense,
      speed: enemy.speed,
      critChance: enemy.critChance,
      critDamage: enemy.critDamage,
      dodge: enemy.dodge,
      accuracy: enemy.accuracy,
      luck: 0,
      minDamage: enemy.minDamage,
      maxDamage: enemy.maxDamage,
    };
    const seed = eventId;
    const battle = simulateBattle({
      player: playerSnap,
      enemy: enemySnap,
      seed,
      balanceVersion: BALANCE_VERSION,
    });
    const match = await this.store.createCombatMatch({
      playerId: player.id,
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
    player.hp = Math.max(1, battle.playerHp);
    await this.store.savePlayer(player);
    const log = battle.events
      .slice(0, 12)
      .map((event) => `ход ${event.turn}: ${event.actor} ${event.type}${event.value ? ` ${event.value}` : ''}`)
      .join('\n');
    const ending =
      battle.result === 'WIN'
        ? `\nПобеда над: ${enemy.name}.`
        : battle.result === 'LOSS'
          ? `\nТы падаешь, но приходишь в себя с 1 HP.`
          : '\nБой затягивается в ничью.';
    return this.respond(player, `Бой с ${enemy.name}.\n${log}${ending}`, NAV_BUTTONS);
  }

  private async claimReward(
    player: PlayerRecord,
    rewardType: string,
    rewardRef: string,
  ): Promise<GameResponse> {
    if (!rewardType || !rewardRef) {
      return this.respond(player, 'Награда не найдена.', NAV_BUTTONS);
    }
    const ok = await this.store.tryClaimReward(player.id, rewardType, rewardRef);
    if (!ok) {
      throw new RewardAlreadyClaimedError();
    }
    if (rewardType === 'coins') {
      // Amount is never taken from the payload — only from known refs.
      const amount = rewardRef === 'demo_coins' ? 10 : 0;
      if (amount > 0) {
        await this.changeCoins(player, amount, 'claim_reward', rewardRef);
      }
      return this.respond(player, amount ? `Получено ${amount} монет.` : 'Пустая награда.', NAV_BUTTONS);
    }
    return this.respond(player, 'Награда отмечена.', NAV_BUTTONS);
  }

  async changeCoins(player: PlayerRecord, amount: number, reason: string, referenceId?: string): Promise<PlayerRecord> {
    const next = player.coins + amount;
    if (next < 0) {
      throw new InsufficientCoinsError();
    }
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
    return player;
  }

  private async effectiveStats(player: PlayerRecord) {
    const stats = { ...STARTING_STATS, ...player.stats, woodYieldBonus: 0 };
    const equipment = await this.store.getEquipment(player.id);
    for (const itemId of Object.values(equipment)) {
      if (!itemId) continue;
      const item = await this.store.getItem(itemId);
      if (!item) continue;
      const template = getItemTemplate(item.templateId);
      if (!template) continue;
      stats.attack += template.attackBonus ?? 0;
      stats.defense += template.defenseBonus ?? 0;
      stats.woodYieldBonus += template.woodYieldBonus ?? 0;
    }
    return stats;
  }

  private async respond(
    player: PlayerRecord,
    text: string,
    buttons: GameButton[],
  ): Promise<GameResponse> {
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
    };
    return { text, buttons, state };
  }
}

export type { EquipmentSlot };
