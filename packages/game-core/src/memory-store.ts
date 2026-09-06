import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STARTING_ENERGY, STARTING_HP, STARTING_STATS } from '@kubolesie/shared';
import type {
  EquipmentSlot,
  ItemHistoryType,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';
import { QUEST_TEMPLATES } from '@kubolesie/content';
import type { BattleEvent } from '@kubolesie/combat-engine';
import type {
  CombatMatchRecord,
  DiscoveryRecord,
  GameStore,
  InventoryItemRecord,
  PlayerQuestRecord,
  PlayerRecord,
  ProcessedEventRecord,
  QuestTemplateRecord,
} from './store';
import { RewardAlreadyClaimedError } from './errors';

interface MemoryState {
  players: PlayerRecord[];
  resources: { playerId: string; resource: ResourceType; amount: number }[];
  items: InventoryItemRecord[];
  equipment: { playerId: string; slot: EquipmentSlot; itemId: string }[];
  flags: { playerId: string; flag: string; value: string }[];
  relations: { playerId: string; npcId: string; trust: number; reputation: number }[];
  questTemplates: QuestTemplateRecord[];
  playerQuests: PlayerQuestRecord[];
  processedEvents: ProcessedEventRecord[];
  rewardClaims: { playerId: string; rewardType: string; rewardRef: string }[];
  currencyTx: unknown[];
  itemHistory: {
    itemId: string;
    playerId: string;
    type: ItemHistoryType;
    meta?: Record<string, unknown>;
  }[];
  matches: CombatMatchRecord[];
  matchEvents: { matchId: string; events: BattleEvent[] }[];
  discoveries: DiscoveryRecord[];
}

function reviveDates(player: PlayerRecord): PlayerRecord {
  return {
    ...player,
    lastEnergyAt: new Date(player.lastEnergyAt),
    lastDailyReset: new Date(player.lastDailyReset),
    createdAt: new Date(player.createdAt),
    updatedAt: new Date(player.updatedAt),
  };
}

export class MemoryGameStore implements GameStore {
  private state: MemoryState;

  constructor(private readonly filePath?: string) {
    this.state = emptyState();
  }

  static async load(filePath?: string): Promise<MemoryGameStore> {
    const store = new MemoryGameStore(filePath);
    if (!filePath) return store;
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as MemoryState;
      parsed.players = parsed.players.map(reviveDates);
      parsed.processedEvents = parsed.processedEvents.map((event) => ({
        ...event,
        createdAt: new Date(event.createdAt),
      }));
      parsed.matches = parsed.matches.map((match) => ({
        ...match,
        startedAt: new Date(match.startedAt),
        finishedAt: match.finishedAt ? new Date(match.finishedAt) : null,
      }));
      parsed.discoveries = parsed.discoveries ?? [];
      store.state = parsed;
    } catch {
      store.state = emptyState();
    }
    return store;
  }

  async persist(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state), 'utf8');
  }

  async findPlayerById(id: string): Promise<PlayerRecord | null> {
    return this.state.players.find((player) => player.id === id) ?? null;
  }

  async findPlayerByVkUserId(vkUserId: string): Promise<PlayerRecord | null> {
    return this.state.players.find((player) => player.vkUserId === vkUserId) ?? null;
  }

  async createPlayer(input: { vkUserId: string; name: string }): Promise<PlayerRecord> {
    const now = new Date();
    const player: PlayerRecord = {
      id: randomUUID(),
      vkUserId: input.vkUserId,
      name: input.name,
      level: 1,
      xp: 0,
      hp: STARTING_HP,
      maxHp: STARTING_HP,
      energy: STARTING_ENERGY,
      maxEnergy: STARTING_ENERGY,
      coins: 0,
      currentLocation: 'forest_clearing',
      currentState: 'start',
      lastEnergyAt: now,
      lastDailyReset: now,
      createdAt: now,
      updatedAt: now,
      stats: { ...STARTING_STATS },
    };
    this.state.players.push(player);
    await this.persist();
    return player;
  }

  async savePlayer(player: PlayerRecord): Promise<PlayerRecord> {
    const next = { ...player, updatedAt: new Date() };
    const index = this.state.players.findIndex((row) => row.id === player.id);
    if (index >= 0) this.state.players[index] = next;
    else this.state.players.push(next);
    await this.persist();
    return next;
  }

  async getResources(playerId: string) {
    const result: Partial<Record<ResourceType, number>> = {};
    for (const row of this.state.resources) {
      if (row.playerId === playerId) result[row.resource] = row.amount;
    }
    return result;
  }

  async addResource(playerId: string, resource: ResourceType, amount: number): Promise<number> {
    const row = this.state.resources.find(
      (entry) => entry.playerId === playerId && entry.resource === resource,
    );
    if (!row) {
      const next = Math.max(0, amount);
      this.state.resources.push({ playerId, resource, amount: next });
      await this.persist();
      return next;
    }
    row.amount = Math.max(0, row.amount + amount);
    await this.persist();
    return row.amount;
  }

  async createItem(input: {
    playerId: string;
    templateId: string;
    rarity: Rarity;
    itemLevel?: number;
  }): Promise<InventoryItemRecord> {
    const item: InventoryItemRecord = {
      id: randomUUID(),
      playerId: input.playerId,
      templateId: input.templateId,
      itemLevel: input.itemLevel ?? 1,
      rarity: input.rarity,
      enhanceLevel: 0,
      createdAt: new Date(),
    };
    this.state.items.push(item);
    await this.persist();
    return item;
  }

  async getItem(itemId: string): Promise<InventoryItemRecord | null> {
    return this.state.items.find((item) => item.id === itemId) ?? null;
  }

  async listItems(playerId: string): Promise<InventoryItemRecord[]> {
    return this.state.items.filter((item) => item.playerId === playerId);
  }

  async recordItemHistory(input: {
    itemId: string;
    playerId: string;
    type: ItemHistoryType;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    this.state.itemHistory.push(input);
    await this.persist();
  }

  async getEquipment(playerId: string) {
    const result: Partial<Record<EquipmentSlot, string>> = {};
    for (const row of this.state.equipment) {
      if (row.playerId === playerId) result[row.slot] = row.itemId;
    }
    return result;
  }

  async setEquipmentSlot(playerId: string, slot: EquipmentSlot, itemId: string | null): Promise<void> {
    this.state.equipment = this.state.equipment.filter(
      (row) => !(row.playerId === playerId && row.slot === slot),
    );
    if (itemId) {
      this.state.equipment.push({ playerId, slot, itemId });
    }
    await this.persist();
  }

  async getFlags(playerId: string): Promise<Record<string, string>> {
    const flags: Record<string, string> = {};
    for (const row of this.state.flags) {
      if (row.playerId === playerId) flags[row.flag] = row.value;
    }
    return flags;
  }

  async setFlag(playerId: string, flag: string, value: string): Promise<void> {
    const existing = this.state.flags.find((row) => row.playerId === playerId && row.flag === flag);
    if (existing) existing.value = value;
    else this.state.flags.push({ playerId, flag, value });
    await this.persist();
  }

  async getNpcRelation(playerId: string, npcId: string) {
    const row = this.state.relations.find((entry) => entry.playerId === playerId && entry.npcId === npcId);
    return row ? { trust: row.trust, reputation: row.reputation } : { trust: 0, reputation: 0 };
  }

  async adjustNpcRelation(
    playerId: string,
    npcId: string,
    trustDelta: number,
    reputationDelta: number,
  ) {
    let row = this.state.relations.find((entry) => entry.playerId === playerId && entry.npcId === npcId);
    if (!row) {
      row = { playerId, npcId, trust: 0, reputation: 0 };
      this.state.relations.push(row);
    }
    row.trust += trustDelta;
    row.reputation += reputationDelta;
    await this.persist();
    return { trust: row.trust, reputation: row.reputation };
  }

  async listQuestTemplates(): Promise<QuestTemplateRecord[]> {
    return this.state.questTemplates;
  }

  async upsertQuestTemplate(template: QuestTemplateRecord): Promise<void> {
    const index = this.state.questTemplates.findIndex((row) => row.id === template.id);
    if (index >= 0) this.state.questTemplates[index] = template;
    else this.state.questTemplates.push(template);
    await this.persist();
  }

  async getPlayerQuest(playerId: string, questId: string): Promise<PlayerQuestRecord | null> {
    return (
      this.state.playerQuests.find((row) => row.playerId === playerId && row.questId === questId) ??
      null
    );
  }

  async upsertPlayerQuest(record: PlayerQuestRecord): Promise<void> {
    const index = this.state.playerQuests.findIndex(
      (row) => row.playerId === record.playerId && row.questId === record.questId,
    );
    if (index >= 0) this.state.playerQuests[index] = record;
    else this.state.playerQuests.push(record);
    await this.persist();
  }

  async findProcessedEvent(eventId: string): Promise<ProcessedEventRecord | null> {
    return this.state.processedEvents.find((row) => row.eventId === eventId) ?? null;
  }

  async saveProcessedEvent(record: ProcessedEventRecord): Promise<void> {
    if (this.state.processedEvents.some((row) => row.eventId === record.eventId)) return;
    this.state.processedEvents.push(record);
    await this.persist();
  }

  async tryClaimReward(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    const exists = this.state.rewardClaims.some(
      (row) => row.playerId === playerId && row.rewardType === rewardType && row.rewardRef === rewardRef,
    );
    if (exists) return false;
    this.state.rewardClaims.push({ playerId, rewardType, rewardRef });
    await this.persist();
    return true;
  }

  async hasRewardClaim(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    return this.state.rewardClaims.some(
      (row) => row.playerId === playerId && row.rewardType === rewardType && row.rewardRef === rewardRef,
    );
  }

  async addCurrencyTransaction(): Promise<void> {
    this.state.currencyTx.push({});
    await this.persist();
  }

  async createCombatMatch(input: Omit<CombatMatchRecord, 'id'> & { id?: string }): Promise<CombatMatchRecord> {
    const record: CombatMatchRecord = { ...input, id: input.id ?? randomUUID() };
    this.state.matches.push(record);
    await this.persist();
    return record;
  }

  async addCombatEvents(matchId: string, events: BattleEvent[]): Promise<void> {
    this.state.matchEvents.push({ matchId, events });
    await this.persist();
  }

  async removeItem(itemId: string): Promise<void> {
    this.state.equipment = this.state.equipment.filter((row) => row.itemId !== itemId);
    this.state.items = this.state.items.filter((item) => item.id !== itemId);
    await this.persist();
  }

  async listPlayerQuests(playerId: string): Promise<PlayerQuestRecord[]> {
    return this.state.playerQuests.filter((row) => row.playerId === playerId);
  }

  async listDiscoveries(playerId: string): Promise<DiscoveryRecord[]> {
    return this.state.discoveries.filter((row) => row.playerId === playerId);
  }

  async upsertDiscovery(record: DiscoveryRecord): Promise<void> {
    const index = this.state.discoveries.findIndex(
      (row) => row.playerId === record.playerId && row.discoveryId === record.discoveryId,
    );
    if (index >= 0) this.state.discoveries[index] = record;
    else this.state.discoveries.push(record);
    await this.persist();
  }
}

function emptyState(): MemoryState {
  return {
    players: [],
    resources: [],
    items: [],
    equipment: [],
    flags: [],
    relations: [],
    questTemplates: QUEST_TEMPLATES.map((quest) => ({
      id: quest.id,
      title: quest.title,
      description: quest.description,
      defaultStatus: quest.defaultStatus,
    })),
    playerQuests: [],
    processedEvents: [],
    rewardClaims: [],
    currencyTx: [],
    itemHistory: [],
    matches: [],
    matchEvents: [],
    discoveries: [],
  };
}

export { RewardAlreadyClaimedError };
