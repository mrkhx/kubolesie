import type {
  ApplicationStatus,
  ClanRole,
  CombatResult,
  CurrencyCode,
  EquipmentSlot,
  GameResponse,
  InviteStatus,
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

export interface PlayerStatisticsRecord {
  playerId: string;
  pveWins: number;
  pveLosses: number;
  pvpWins: number;
  pvpLosses: number;
  bossWins: number;
  bossLosses: number;
  craftedItems: number;
  resourcesGathered: number;
  itemsLooted: number;
  rareItemsFound: number;
  coinsEarned: number;
  coinsSpent: number;
  tradesCompleted: number;
  questsCompleted: number;
  dailyQuestsCompleted: number;
  daysCompleted: number;
}

export type StatisticsDelta = Partial<Omit<PlayerStatisticsRecord, 'playerId'>>;

export interface PlayerRatingRecord {
  playerId: string;
  pvpRating: number;
  lifetimeScore: number;
  weeklyScore: number;
  weeklyPeriod: string;
  seasonId: string;
  weeklyPvpOpponents: string;
}

export interface PlayerBossStatRecord {
  playerId: string;
  bossId: string;
  wins: number;
  losses: number;
}

export interface ClanRecord {
  id: string;
  name: string;
  nameKey: string;
  tag: string;
  tagKey: string;
  description: string;
  leaderPlayerId: string;
  level: number;
  xp: number;
  createdAt: Date;
}

export interface ClanMemberRecord {
  id: string;
  clanId: string;
  playerId: string;
  role: ClanRole;
  joinedAt: Date;
}

export interface ClanApplicationRecord {
  id: string;
  clanId: string;
  playerId: string;
  status: ApplicationStatus;
  createdAt: Date;
}

export interface ClanInviteRecord {
  id: string;
  clanId: string;
  fromPlayerId: string;
  playerId: string;
  status: InviteStatus;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ClanContributionRecord {
  clanId: string;
  playerId: string;
  periodKey: string;
  score: number;
}

export interface EntitlementRecord {
  playerId: string;
  productId: string;
  grantedAt: Date;
  source: string;
  externalTransactionId: string | null;
}

export interface PlayerCosmeticRecord {
  playerId: string;
  profileFrame: string | null;
  title: string | null;
  badge: string | null;
  campTheme: string | null;
  chatBadge: string | null;
}

export interface PlayerAchievementRecord {
  playerId: string;
  achievementId: string;
  grantedAt: Date;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  value: number;
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
  tryBeginProcessedEvent(record: Omit<ProcessedEventRecord, 'response'> & { response?: GameResponse }): Promise<boolean>;
  completeProcessedEvent(eventId: string, response: GameResponse, playerId?: string | null): Promise<void>;
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

  removeItem(itemId: string): Promise<void>;
  listPlayerQuests(playerId: string): Promise<PlayerQuestRecord[]>;
  listDiscoveries(playerId: string): Promise<DiscoveryRecord[]>;
  upsertDiscovery(record: DiscoveryRecord): Promise<void>;

  getStatistics(playerId: string): Promise<PlayerStatisticsRecord>;
  incrementStatistics(playerId: string, delta: StatisticsDelta): Promise<PlayerStatisticsRecord>;
  incrementBossStat(playerId: string, bossId: string, field: 'wins' | 'losses'): Promise<PlayerBossStatRecord>;
  getRating(playerId: string): Promise<PlayerRatingRecord>;
  saveRating(record: PlayerRatingRecord): Promise<PlayerRatingRecord>;
  listScoreboard(
    board: 'score' | 'pvp' | 'weekly',
    periodKey: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]>;
  getScoreboardRank(board: 'score' | 'pvp' | 'weekly', playerId: string, periodKey: string): Promise<number>;
  upsertWeeklyScore(playerId: string, periodKey: string, score: number): Promise<void>;
  incrementWeeklyScore(playerId: string, periodKey: string, delta: number): Promise<number>;
  getWeeklyScore(playerId: string, periodKey: string): Promise<number>;

  createClan(input: {
    name: string;
    tag: string;
    description: string;
    leaderPlayerId: string;
  }): Promise<ClanRecord>;
  getClan(clanId: string): Promise<ClanRecord | null>;
  findClanByNameKey(nameKey: string): Promise<ClanRecord | null>;
  findClanByTagKey(tagKey: string): Promise<ClanRecord | null>;
  getPlayerClan(playerId: string): Promise<{ clan: ClanRecord; member: ClanMemberRecord } | null>;
  listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]>;
  addClanXp(clanId: string, amount: number): Promise<ClanRecord>;
  listClanMembers(clanId: string): Promise<ClanMemberRecord[]>;
  addClanMember(input: { clanId: string; playerId: string; role: ClanRole }): Promise<ClanMemberRecord>;
  removeClanMember(clanId: string, playerId: string): Promise<void>;
  setClanMemberRole(clanId: string, playerId: string, role: ClanRole): Promise<void>;
  setClanLeader(clanId: string, playerId: string): Promise<void>;
  deleteClan(clanId: string): Promise<void>;

  createApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord>;
  getApplication(id: string): Promise<ClanApplicationRecord | null>;
  getPendingApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord | null>;
  listPendingApplications(clanId: string): Promise<ClanApplicationRecord[]>;
  listPlayerApplications(playerId: string): Promise<ClanApplicationRecord[]>;
  setApplicationStatus(id: string, status: ApplicationStatus): Promise<void>;
  cancelPendingApplications(playerId: string): Promise<void>;

  addContribution(clanId: string, playerId: string, periodKey: string, amount: number): Promise<number>;
  getContribution(clanId: string, playerId: string, periodKey: string): Promise<number>;
  clanSeasonContribution(clanId: string, periodKey: string): Promise<number>;
  listClanLeaderboard(periodKey: string, limit: number, offset: number): Promise<LeaderboardEntry[]>;
  getClanLeaderboardRank(clanId: string, periodKey: string): Promise<number>;

  tryGrantEntitlement(
    playerId: string,
    productId: string,
    source: string,
    externalTransactionId?: string,
  ): Promise<boolean>;
  listEntitlements(playerId: string): Promise<EntitlementRecord[]>;
  hasEntitlement(playerId: string, productId: string): Promise<boolean>;
  getCosmetics(playerId: string): Promise<PlayerCosmeticRecord>;
  setCosmetic(
    playerId: string,
    slot: keyof Omit<PlayerCosmeticRecord, 'playerId'>,
    productId: string | null,
  ): Promise<void>;
  tryGrantAchievement(playerId: string, achievementId: string): Promise<boolean>;
  listAchievements(playerId: string): Promise<PlayerAchievementRecord[]>;

  persist?(): Promise<void>;
}

export interface DiscoveryRecord {
  playerId: string;
  discoveryId: string;
  title: string;
  seen: boolean;
  defeated: boolean;
}

export const EMPTY_STATISTICS = {
  pveWins: 0,
  pveLosses: 0,
  pvpWins: 0,
  pvpLosses: 0,
  bossWins: 0,
  bossLosses: 0,
  craftedItems: 0,
  resourcesGathered: 0,
  itemsLooted: 0,
  rareItemsFound: 0,
  coinsEarned: 0,
  coinsSpent: 0,
  tradesCompleted: 0,
  questsCompleted: 0,
  dailyQuestsCompleted: 0,
  daysCompleted: 0,
} as const;
