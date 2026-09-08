import type {
  ApplicationStatus,
  ClanRole,
  CombatMode,
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
  lastActiveAt: Date;
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
  mode: CombatMode;
  enemyId: string;
  opponentPlayerId?: string | null;
  seasonId?: string;
  seed: string;
  balanceVersion: string;
  result: CombatResult | null;
  playerSnapshot: CombatantSnapshot;
  enemySnapshot: CombatantSnapshot;
  attackerRatingBefore?: number | null;
  attackerRatingAfter?: number | null;
  defenderRatingBefore?: number | null;
  defenderRatingAfter?: number | null;
  rewardTier?: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface PvpCandidate {
  playerId: string;
  name: string;
  level: number;
  pvpRating: number;
  lastActiveAt: Date;
}

export interface CombatMatchQuery {
  playerId?: string;
  opponentPlayerId?: string;
  mode?: CombatMode;
  enemyId?: string;
  result?: CombatResult;
  since?: Date;
  until?: Date;
  seasonId?: string;
}

export interface AnalyticsFlagCount {
  flag: string;
  count: number;
}

export interface AnalyticsLevelBucket {
  level: number;
  count: number;
}

export interface AnalyticsBossRow {
  bossId: string;
  wins: number;
  losses: number;
}

export interface AnalyticsEnemyRow {
  enemyId: string;
  count: number;
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
  disbandedAt: Date | null;
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

export interface ClanTaskProgressRecord {
  clanId: string;
  periodKey: string;
  taskId: string;
  progress: number;
  target: number;
  completedAt: Date | null;
  completedNow?: boolean;
}

export interface ClanRosterRow {
  member: ClanMemberRecord;
  name: string;
  level: number;
  lastActiveAt: Date;
  weeklyContribution: number;
}

export interface ClanMemberStats {
  averageMembers: number;
  medianMembers: number | null;
}

export interface ClanAnalyticsTopRow {
  id: string;
  name: string;
  tag: string;
  level: number;
  weeklyScore: number;
  members: number;
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

export type MarketListingType = 'FIXED_PRICE' | 'AUCTION';
export type MarketListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';
export type MarketAssetKind = 'RESOURCE';

export interface MarketListingRecord {
  id: string;
  sellerPlayerId: string;
  listingType: MarketListingType;
  assetKind: MarketAssetKind;
  assetRef: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: MarketListingStatus;
  createdAt: Date;
  expiresAt: Date;
  buyerPlayerId: string | null;
  soldAt: Date | null;
  cancelledAt: Date | null;
  requestId: string | null;
  startingPrice: number | null;
  currentBid: number | null;
  currentBidderPlayerId: string | null;
  buyoutPrice: number | null;
  bidCount: number;
  extensionCount: number;
}

export type AuctionBidStatus = 'HOLD' | 'REFUNDED' | 'SETTLED' | 'SUPERSEDED';

export interface AuctionBidRecord {
  id: string;
  listingId: string;
  bidderPlayerId: string;
  amount: number;
  status: AuctionBidStatus;
  createdAt: Date;
  requestId: string | null;
}

export interface PlayerNoticeRecord {
  id: string;
  playerId: string;
  kind: string;
  body: string;
  listingId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface MarketTransactionRecord {
  id: string;
  listingId: string;
  sellerPlayerId: string;
  buyerPlayerId: string;
  assetKind: MarketAssetKind;
  assetRef: string;
  quantity: number;
  grossPrice: number;
  fee: number;
  sellerNet: number;
  createdAt: Date;
  requestId: string | null;
}

export interface CurrencyTransactionRecord {
  playerId: string;
  currency: CurrencyCode;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  referenceId?: string;
  createdAt: Date;
}

export interface MarketSearchQuery {
  assetRef?: string;
  assetRefs?: string[];
  listingType?: MarketListingType | 'ALL';
  sellerPlayerId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'created_desc' | 'ending_soon';
  limit: number;
  offset?: number;
}

export interface MarketAnalyticsSnapshot {
  activeListings: number;
  listingsCreatedToday: number;
  listingsCreated7d: number;
  completedTradesToday: number;
  completedTrades7d: number;
  grossVolumeToday: number;
  grossVolume7d: number;
  feesBurnedToday: number;
  feesBurned7d: number;
  uniqueSellers7d: number;
  uniqueBuyers7d: number;
  fixedActive: number;
  auctionActive: number;
  auctionsWithBids: number;
  auctionsSold: number;
  auctionsExpired: number;
  bidsToday: number;
  bids7d: number;
  auctionGrossVolume: number;
  buyoutCount: number;
  feesBurned: number;
  uniqueSellers: number;
  uniqueBuyers: number;
  topTradedResources: Array<{ assetRef: string; volume: number; count: number }>;
  averageSalePrice: Array<{ assetRef: string; avg: number }>;
  suspiciousTradeSignals: number;
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
  listCombatMatches(query: CombatMatchQuery & { limit: number; offset?: number }): Promise<CombatMatchRecord[]>;
  countCombatMatches(query: CombatMatchQuery): Promise<number>;
  listPvpCandidates(input: {
    excludePlayerId: string;
    minRating: number;
    maxRating: number;
    targetRating: number;
    unlockFlag: string;
    limit: number;
  }): Promise<PvpCandidate[]>;
  countPlayers(filter?: { createdSince?: Date; createdUntil?: Date; activeSince?: Date }): Promise<number>;
  countProcessedEvents(since?: Date): Promise<number>;
  countFlags(flags: string[]): Promise<AnalyticsFlagCount[]>;
  countPlayersWithAnyFlag(flags: string[]): Promise<number>;
  countPlayersWithStat(field: keyof Omit<PlayerStatisticsRecord, 'playerId'>, min: number): Promise<number>;
  averagePvpRating(): Promise<number>;
  countPvpActivePlayers(since?: Date): Promise<number>;
  levelDistribution(): Promise<AnalyticsLevelBucket[]>;
  bossAggregates(): Promise<AnalyticsBossRow[]>;
  topPveEnemies(since: Date, limit: number): Promise<AnalyticsEnemyRow[]>;
  countReturning(createdFrom: Date, createdTo: Date, activeSince: Date): Promise<number>;

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
    cost?: number;
  }): Promise<ClanRecord>;
  getClan(clanId: string): Promise<ClanRecord | null>;
  findClanByNameKey(nameKey: string): Promise<ClanRecord | null>;
  findClanByTagKey(tagKey: string): Promise<ClanRecord | null>;
  getPlayerClan(playerId: string): Promise<{ clan: ClanRecord; member: ClanMemberRecord } | null>;
  listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]>;
  addClanXp(clanId: string, amount: number): Promise<ClanRecord>;
  listClanMembers(clanId: string): Promise<ClanMemberRecord[]>;
  addClanMember(input: {
    clanId: string;
    playerId: string;
    role: ClanRole;
    maxMembers?: number;
  }): Promise<ClanMemberRecord>;
  removeClanMember(clanId: string, playerId: string): Promise<void>;
  setClanMemberRole(clanId: string, playerId: string, role: ClanRole): Promise<void>;
  setClanLeader(clanId: string, playerId: string): Promise<void>;
  deleteClan(clanId: string): Promise<void>;
  disbandClan(clanId: string): Promise<void>;
  setClanDescription(clanId: string, description: string): Promise<ClanRecord>;
  listClanRoster(clanId: string, periodKey: string): Promise<ClanRosterRow[]>;
  incrementClanTask(
    clanId: string,
    periodKey: string,
    taskId: string,
    target: number,
    amount: number,
  ): Promise<ClanTaskProgressRecord>;
  getClanTask(clanId: string, periodKey: string, taskId: string): Promise<ClanTaskProgressRecord | null>;
  listClanTasks(clanId: string, periodKeys: string[]): Promise<ClanTaskProgressRecord[]>;
  donateToClan(input: {
    clanId: string;
    playerId: string;
    resource: ResourceType;
    amount: number;
    score: number;
    weekKey: string;
    dayKey: string;
  }): Promise<{ remaining: number; contribution: number; clan: ClanRecord }>;

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
  countClans(filter?: { createdSince?: Date; createdUntil?: Date; excludeDisbanded?: boolean }): Promise<number>;
  countClanMembers(): Promise<number>;
  countActiveClans(since: Date): Promise<number>;
  clanMemberStats(): Promise<ClanMemberStats>;
  sumContribution(periodKey: string): Promise<number>;
  countClanTaskCompletions(since?: Date, until?: Date): Promise<number>;
  listTopClansWeekly(periodKey: string, limit: number): Promise<ClanAnalyticsTopRow[]>;

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

  createFixedListing(input: {
    sellerPlayerId: string;
    assetKind: MarketAssetKind;
    assetRef: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    listingType: MarketListingType;
    expiresAt: Date;
    requestId?: string;
    now?: Date;
    startingPrice?: number | null;
    buyoutPrice?: number | null;
    currentBid?: number | null;
    bidCount?: number;
  }): Promise<MarketListingRecord>;
  cancelListing(input: { listingId: string; sellerPlayerId: string; now?: Date }): Promise<MarketListingRecord>;
  buyFixedListing(input: {
    listingId: string;
    buyerPlayerId: string;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }>;
  placeAuctionBid(input: {
    listingId: string;
    bidderPlayerId: string;
    amount: number;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; bid: AuctionBidRecord }>;
  buyoutAuction(input: {
    listingId: string;
    buyerPlayerId: string;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }>;
  settleExpiredAuctions(now?: Date, limit?: number): Promise<number>;
  listAuctionBids(listingId: string): Promise<AuctionBidRecord[]>;
  listPlayerBids(playerId: string, limit?: number): Promise<AuctionBidRecord[]>;
  enqueueNotice(input: {
    playerId: string;
    kind: string;
    body: string;
    listingId?: string | null;
  }): Promise<void>;
  consumeNotices(playerId: string, limit?: number): Promise<PlayerNoticeRecord[]>;
  averageSalePrices(since: Date, assetRef?: string): Promise<Array<{ assetRef: string; avg: number; count: number }>>;
  countPairTrades(sellerPlayerId: string, buyerPlayerId: string, since: Date): Promise<number>;
  countSuspiciousSignals(now?: Date): Promise<number>;
  expireListing(listingId: string, now?: Date): Promise<MarketListingRecord>;
  expireDueListings(now?: Date): Promise<number>;
  getListing(listingId: string): Promise<MarketListingRecord | null>;
  getOwnListings(sellerPlayerId: string): Promise<MarketListingRecord[]>;
  searchActiveListings(query: MarketSearchQuery, now?: Date): Promise<MarketListingRecord[]>;
  listMarketTransactions(listingId: string): Promise<MarketTransactionRecord[]>;
  listCurrencyTransactions(playerId: string, referenceId?: string): Promise<CurrencyTransactionRecord[]>;
  getMarketAnalytics(now?: Date): Promise<MarketAnalyticsSnapshot>;

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
