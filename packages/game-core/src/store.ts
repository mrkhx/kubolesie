import type {
  CombatResult,
  CurrencyCode,
  EquipmentSlot,
  GameResponse,
  ItemHistoryType,
  QuestStatus,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';
import type { CombatantSnapshot, BattleEvent } from '@kubolesie/combat-engine';

export interface PlayerStatsRecord {
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  critDamage: number;
  dodge: number;
  accuracy: number;
  luck: number;
}

export interface PlayerRecord {
  id: string;
  vkUserId: string;
  name: string;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  coins: number;
  currentLocation: string;
  currentState: string;
  lastEnergyAt: Date;
  lastDailyReset: Date;
  createdAt: Date;
  updatedAt: Date;
  stats: PlayerStatsRecord;
}

export interface InventoryItemRecord {
  id: string;
  playerId: string;
  templateId: string;
  itemLevel: number;
  rarity: Rarity;
  enhanceLevel: number;
  createdAt: Date;
}

export interface ProcessedEventRecord {
  eventId: string;
  playerId: string | null;
  command: string;
  response: GameResponse;
  createdAt: Date;
}

export interface PlayerQuestRecord {
  playerId: string;
  questId: string;
  status: QuestStatus;
  progress: Record<string, unknown>;
}

export interface QuestTemplateRecord {
  id: string;
  title: string;
  description: string;
  defaultStatus: QuestStatus;
}

export interface CombatMatchRecord {
  id: string;
  playerId: string;
  mode: 'PVE';
  enemyId: string;
  seed: string;
  balanceVersion: string;
  result: CombatResult | null;
  playerSnapshot: CombatantSnapshot;
  enemySnapshot: CombatantSnapshot;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface GameStore {
  findPlayerById(id: string): Promise<PlayerRecord | null>;
  findPlayerByVkUserId(vkUserId: string): Promise<PlayerRecord | null>;
  createPlayer(input: { vkUserId: string; name: string }): Promise<PlayerRecord>;
  savePlayer(player: PlayerRecord): Promise<PlayerRecord>;

  getResources(playerId: string): Promise<Partial<Record<ResourceType, number>>>;
  addResource(playerId: string, resource: ResourceType, amount: number): Promise<number>;

  createItem(input: {
    playerId: string;
    templateId: string;
    rarity: Rarity;
    itemLevel?: number;
  }): Promise<InventoryItemRecord>;
  getItem(itemId: string): Promise<InventoryItemRecord | null>;
  listItems(playerId: string): Promise<InventoryItemRecord[]>;
  recordItemHistory(input: {
    itemId: string;
    playerId: string;
    type: ItemHistoryType;
    meta?: Record<string, unknown>;
  }): Promise<void>;

  getEquipment(playerId: string): Promise<Partial<Record<EquipmentSlot, string>>>;
  setEquipmentSlot(playerId: string, slot: EquipmentSlot, itemId: string | null): Promise<void>;

  getFlags(playerId: string): Promise<Record<string, string>>;
  setFlag(playerId: string, flag: string, value: string): Promise<void>;

  getNpcRelation(playerId: string, npcId: string): Promise<{ trust: number; reputation: number }>;
  adjustNpcRelation(
    playerId: string,
    npcId: string,
    trustDelta: number,
    reputationDelta: number,
  ): Promise<{ trust: number; reputation: number }>;

  listQuestTemplates(): Promise<QuestTemplateRecord[]>;
  upsertQuestTemplate(template: QuestTemplateRecord): Promise<void>;
  getPlayerQuest(playerId: string, questId: string): Promise<PlayerQuestRecord | null>;
  upsertPlayerQuest(record: PlayerQuestRecord): Promise<void>;

  findProcessedEvent(eventId: string): Promise<ProcessedEventRecord | null>;
  saveProcessedEvent(record: ProcessedEventRecord): Promise<void>;

  tryClaimReward(playerId: string, rewardType: string, rewardRef: string): Promise<boolean>;
  hasRewardClaim(playerId: string, rewardType: string, rewardRef: string): Promise<boolean>;

  addCurrencyTransaction(input: {
    playerId: string;
    currency: CurrencyCode;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string;
    referenceId?: string;
  }): Promise<void>;

  createCombatMatch(input: Omit<CombatMatchRecord, 'id'> & { id?: string }): Promise<CombatMatchRecord>;
  addCombatEvents(matchId: string, events: BattleEvent[]): Promise<void>;

  persist?(): Promise<void>;
}
