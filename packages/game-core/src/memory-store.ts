import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { STARTING_ENERGY, STARTING_HP, STARTING_STATS } from '@kubolesie/shared';
import type {
  ApplicationStatus,
  ClanRole,
  EquipmentSlot,
  GameResponse,
  ItemHistoryType,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';
import type {
  ClanApplicationRecord,
  ClanContributionRecord,
  ClanMemberRecord,
  ClanRecord,
  CombatMatchRecord,
  CombatMatchQuery,
  DiscoveryRecord,
  EntitlementRecord,
  GameStore,
  InventoryItemRecord,
  LeaderboardEntry,
  PlayerAchievementRecord,
  PlayerBossStatRecord,
  PlayerCosmeticRecord,
  PlayerQuestRecord,
  PlayerRatingRecord,
  PlayerRecord,
  PlayerStatisticsRecord,
  ProcessedEventRecord,
  PvpCandidate,
  QuestTemplateRecord,
  StatisticsDelta,
  AnalyticsBossRow,
  AnalyticsEnemyRow,
  AnalyticsFlagCount,
  AnalyticsLevelBucket,
  ClanAnalyticsTopRow,
  ClanMemberStats,
  ClanRosterRow,
  ClanTaskProgressRecord,
  CurrencyTransactionRecord,
  MarketAnalyticsSnapshot,
  MarketListingRecord,
  MarketSearchQuery,
  MarketTransactionRecord,
  AuctionBidRecord,
  PlayerNoticeRecord,
} from './store';
import { EMPTY_STATISTICS } from './store';
import {
  applyPvpRating,
  clampLimit,
  clampOffset,
  clanLevelForXp,
  MARKET,
  marketFee,
  AUCTION,
  minBidAmount,
  PVP_RATING,
  QUEST_TEMPLATES,
} from '@kubolesie/content';
import type { BattleEvent } from '@kubolesie/combat-engine';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
  NotFoundError,
  RewardAlreadyClaimedError,
} from './errors';

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
  currencyTx: CurrencyTransactionRecord[];
  itemHistory: {
    itemId: string;
    playerId: string;
    type: ItemHistoryType;
    meta?: Record<string, unknown>;
  }[];
  matches: CombatMatchRecord[];
  matchEvents: { matchId: string; events: BattleEvent[] }[];
  discoveries: DiscoveryRecord[];
  statistics: PlayerStatisticsRecord[];
  ratings: PlayerRatingRecord[];
  bossStats: PlayerBossStatRecord[];
  clans: ClanRecord[];
  clanMembers: ClanMemberRecord[];
  clanApplications: ClanApplicationRecord[];
  contributions: ClanContributionRecord[];
  clanTasks: ClanTaskProgressRecord[];
  entitlements: EntitlementRecord[];
  cosmetics: PlayerCosmeticRecord[];
  achievements: PlayerAchievementRecord[];
  weeklyScores: { playerId: string; periodKey: string; score: number }[];
  listings: MarketListingRecord[];
  marketTx: MarketTransactionRecord[];
  auctionBids: AuctionBidRecord[];
  notices: PlayerNoticeRecord[];
}

function reviveDates(player: PlayerRecord): PlayerRecord {
  return {
    ...player,
    lastEnergyAt: new Date(player.lastEnergyAt),
    lastDailyReset: new Date(player.lastDailyReset),
    lastActiveAt: new Date(player.lastActiveAt ?? player.updatedAt ?? player.createdAt),
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
      parsed.statistics = parsed.statistics ?? [];
      parsed.ratings = parsed.ratings ?? [];
      parsed.bossStats = parsed.bossStats ?? [];
      parsed.clans = parsed.clans ?? [];
      parsed.clanMembers = parsed.clanMembers ?? [];
      parsed.clanApplications = parsed.clanApplications ?? [];
      parsed.contributions = parsed.contributions ?? [];
      parsed.clanTasks = parsed.clanTasks ?? [];
      parsed.clans = parsed.clans.map((clan) => ({
        ...clan,
        disbandedAt: clan.disbandedAt ? new Date(clan.disbandedAt) : null,
      }));
      parsed.entitlements = parsed.entitlements ?? [];
      parsed.cosmetics = parsed.cosmetics ?? [];
      parsed.achievements = parsed.achievements ?? [];
      parsed.weeklyScores = parsed.weeklyScores ?? [];
      parsed.listings = (parsed.listings ?? []).map(reviveListing);
      parsed.marketTx = (parsed.marketTx ?? []).map(reviveMarketTx);
      parsed.auctionBids = (parsed.auctionBids ?? []).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt),
      }));
      parsed.notices = (parsed.notices ?? []).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt),
        readAt: row.readAt ? new Date(row.readAt) : null,
      }));
      parsed.currencyTx = (parsed.currencyTx ?? []).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt ?? 0),
      }));
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
    return this.withMut(async () => {
      const existing = this.state.players.find((player) => player.vkUserId === input.vkUserId);
      if (existing) return existing;
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
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
        stats: { ...STARTING_STATS },
      };
      this.state.players.push(player);
      await this.persist();
      return player;
    });
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
    return this.withMut(async () => {
      if (!Number.isFinite(amount)) throw new InsufficientResourcesError();
      const row = this.state.resources.find(
        (entry) => entry.playerId === playerId && entry.resource === resource,
      );
      if (amount < 0 && (!row || row.amount + amount < 0)) {
        throw new InsufficientResourcesError();
      }
      if (!row) {
        const next = Math.max(0, amount);
        this.state.resources.push({ playerId, resource, amount: next });
        await this.persist();
        return next;
      }
      row.amount += amount;
      if (row.amount < 0) throw new InsufficientResourcesError();
      await this.persist();
      return row.amount;
    });
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

  async tryBeginProcessedEvent(
    record: Omit<ProcessedEventRecord, 'response'> & { response?: GameResponse },
  ): Promise<boolean> {
    return this.withMut(async () => {
      if (this.state.processedEvents.some((row) => row.eventId === record.eventId)) return false;
      this.state.processedEvents.push({
        eventId: record.eventId,
        playerId: record.playerId,
        command: record.command,
        response: record.response ?? { text: '', buttons: [] },
        createdAt: record.createdAt,
      });
      await this.persist();
      return true;
    });
  }

  async completeProcessedEvent(
    eventId: string,
    response: GameResponse,
    playerId?: string | null,
  ): Promise<void> {
    const row = this.state.processedEvents.find((entry) => entry.eventId === eventId);
    if (!row) return;
    row.response = response;
    if (playerId !== undefined) row.playerId = playerId;
    await this.persist();
  }

  async saveProcessedEvent(record: ProcessedEventRecord): Promise<void> {
    const existing = this.state.processedEvents.find((row) => row.eventId === record.eventId);
    if (existing) {
      existing.response = record.response;
      existing.playerId = record.playerId;
      await this.persist();
      return;
    }
    this.state.processedEvents.push(record);
    await this.persist();
  }

  async tryClaimReward(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    return this.withMut(async () => {
      const exists = this.state.rewardClaims.some(
        (row) => row.playerId === playerId && row.rewardType === rewardType && row.rewardRef === rewardRef,
      );
      if (exists) return false;
      this.state.rewardClaims.push({ playerId, rewardType, rewardRef });
      await this.persist();
      return true;
    });
  }

  async hasRewardClaim(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    return this.state.rewardClaims.some(
      (row) => row.playerId === playerId && row.rewardType === rewardType && row.rewardRef === rewardRef,
    );
  }

  async addCurrencyTransaction(input: {
    playerId: string;
    currency: CurrencyTransactionRecord['currency'];
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string;
    referenceId?: string;
  }): Promise<void> {
    this.state.currencyTx.push({
      playerId: input.playerId,
      currency: input.currency,
      amount: input.amount,
      balanceBefore: input.balanceBefore,
      balanceAfter: input.balanceAfter,
      reason: input.reason,
      referenceId: input.referenceId,
      createdAt: new Date(),
    });
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

  async listCombatMatches(
    query: CombatMatchQuery & { limit: number; offset?: number },
  ): Promise<CombatMatchRecord[]> {
    const filtered = this.state.matches.filter((row) => matchQuery(row, query));
    filtered.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const offset = query.offset ?? 0;
    return filtered.slice(offset, offset + query.limit);
  }

  async countCombatMatches(query: CombatMatchQuery): Promise<number> {
    return this.state.matches.filter((row) => matchQuery(row, query)).length;
  }

  async listPvpCandidates(input: {
    excludePlayerId: string;
    minRating: number;
    maxRating: number;
    targetRating: number;
    unlockFlag: string;
    limit: number;
  }): Promise<PvpCandidate[]> {
    const unlocked = new Set(
      this.state.flags.filter((row) => row.flag === input.unlockFlag).map((row) => row.playerId),
    );
    const rows: PvpCandidate[] = [];
    for (const player of this.state.players) {
      if (player.id === input.excludePlayerId) continue;
      if (!unlocked.has(player.id)) continue;
      const rating = this.ensureRating(player.id);
      if (rating.pvpRating < input.minRating || rating.pvpRating > input.maxRating) continue;
      rows.push({
        playerId: player.id,
        name: player.name,
        level: player.level,
        pvpRating: rating.pvpRating,
        lastActiveAt: player.lastActiveAt ?? player.updatedAt,
      });
    }
    rows.sort(
      (a, b) =>
        Math.abs(a.pvpRating - input.targetRating) - Math.abs(b.pvpRating - input.targetRating) ||
        b.lastActiveAt.getTime() - a.lastActiveAt.getTime() ||
        a.playerId.localeCompare(b.playerId),
    );
    return rows.slice(0, input.limit);
  }

  async countPlayers(filter?: {
    createdSince?: Date;
    createdUntil?: Date;
    activeSince?: Date;
  }): Promise<number> {
    return this.state.players.filter((player) => {
      if (filter?.createdSince && player.createdAt < filter.createdSince) return false;
      if (filter?.createdUntil && player.createdAt >= filter.createdUntil) return false;
      if (filter?.activeSince && (player.lastActiveAt ?? player.updatedAt) < filter.activeSince) {
        return false;
      }
      return true;
    }).length;
  }

  async countProcessedEvents(since?: Date): Promise<number> {
    if (!since) return this.state.processedEvents.length;
    return this.state.processedEvents.filter((row) => row.createdAt >= since).length;
  }

  async countFlags(flags: string[]): Promise<AnalyticsFlagCount[]> {
    const wanted = new Set(flags);
    const counts = new Map<string, Set<string>>();
    for (const flag of flags) counts.set(flag, new Set());
    for (const row of this.state.flags) {
      if (!wanted.has(row.flag)) continue;
      counts.get(row.flag)?.add(row.playerId);
    }
    return flags.map((flag) => ({ flag, count: counts.get(flag)?.size ?? 0 }));
  }

  async countPlayersWithAnyFlag(flags: string[]): Promise<number> {
    const wanted = new Set(flags);
    const ids = new Set<string>();
    for (const row of this.state.flags) {
      if (wanted.has(row.flag)) ids.add(row.playerId);
    }
    return ids.size;
  }

  async countPlayersWithStat(
    field: keyof Omit<PlayerStatisticsRecord, 'playerId'>,
    min: number,
  ): Promise<number> {
    return this.state.statistics.filter((row) => (row[field] ?? 0) >= min).length;
  }

  async averagePvpRating(): Promise<number> {
    if (!this.state.ratings.length) return 0;
    const sum = this.state.ratings.reduce((acc, row) => acc + row.pvpRating, 0);
    return sum / this.state.ratings.length;
  }

  async countPvpActivePlayers(since?: Date): Promise<number> {
    const ids = new Set<string>();
    for (const match of this.state.matches) {
      if (match.mode !== 'PVP') continue;
      if (since && match.startedAt < since) continue;
      ids.add(match.playerId);
      if (match.opponentPlayerId) ids.add(match.opponentPlayerId);
    }
    return ids.size;
  }

  async levelDistribution(): Promise<AnalyticsLevelBucket[]> {
    const counts = new Map<number, number>();
    for (const player of this.state.players) {
      counts.set(player.level, (counts.get(player.level) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, count]) => ({ level, count }));
  }

  async bossAggregates(): Promise<AnalyticsBossRow[]> {
    const map = new Map<string, AnalyticsBossRow>();
    for (const row of this.state.bossStats) {
      const current = map.get(row.bossId) ?? { bossId: row.bossId, wins: 0, losses: 0 };
      current.wins += row.wins;
      current.losses += row.losses;
      map.set(row.bossId, current);
    }
    return [...map.values()];
  }

  async topPveEnemies(since: Date, limit: number): Promise<AnalyticsEnemyRow[]> {
    const counts = new Map<string, number>();
    for (const match of this.state.matches) {
      if (match.mode !== 'PVE' || match.startedAt < since) continue;
      counts.set(match.enemyId, (counts.get(match.enemyId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([enemyId, count]) => ({ enemyId, count }));
  }

  async countReturning(createdFrom: Date, createdTo: Date, activeSince: Date): Promise<number> {
    return this.state.players.filter((player) => {
      if (player.createdAt < createdFrom || player.createdAt >= createdTo) return false;
      return (player.lastActiveAt ?? player.updatedAt) >= activeSince;
    }).length;
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

  async getStatistics(playerId: string): Promise<PlayerStatisticsRecord> {
    return this.ensureStats(playerId);
  }

  async incrementStatistics(playerId: string, delta: StatisticsDelta): Promise<PlayerStatisticsRecord> {
    const row = this.ensureStats(playerId);
    for (const [key, value] of Object.entries(delta) as [keyof StatisticsDelta, number | undefined][]) {
      if (typeof value === 'number' && value) row[key] = (row[key] ?? 0) + value;
    }
    await this.persist();
    return row;
  }

  async incrementBossStat(
    playerId: string,
    bossId: string,
    field: 'wins' | 'losses',
  ): Promise<PlayerBossStatRecord> {
    let row = this.state.bossStats.find((entry) => entry.playerId === playerId && entry.bossId === bossId);
    if (!row) {
      row = { playerId, bossId, wins: 0, losses: 0 };
      this.state.bossStats.push(row);
    }
    row[field] += 1;
    await this.persist();
    return row;
  }

  async getRating(playerId: string): Promise<PlayerRatingRecord> {
    return this.ensureRating(playerId);
  }

  async saveRating(record: PlayerRatingRecord): Promise<PlayerRatingRecord> {
    const clamped: PlayerRatingRecord = {
      ...record,
      pvpRating: applyPvpRating(record.pvpRating, 0),
      lifetimeScore: Math.max(0, Number.isFinite(record.lifetimeScore) ? Math.floor(record.lifetimeScore) : 0),
      weeklyScore: Math.max(0, Number.isFinite(record.weeklyScore) ? Math.floor(record.weeklyScore) : 0),
    };
    const index = this.state.ratings.findIndex((row) => row.playerId === clamped.playerId);
    if (index >= 0) this.state.ratings[index] = { ...clamped };
    else this.state.ratings.push({ ...clamped });
    await this.persist();
    return clamped;
  }

  async listScoreboard(
    board: 'score' | 'pvp' | 'weekly',
    periodKey: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]> {
    const rows = this.boardRows(board, periodKey);
    const take = clampLimit(limit);
    const skip = clampOffset(offset);
    return rows.slice(skip, skip + take);
  }

  async getScoreboardRank(
    board: 'score' | 'pvp' | 'weekly',
    playerId: string,
    periodKey: string,
  ): Promise<number> {
    const rows = this.boardRows(board, periodKey);
    const index = rows.findIndex((row) => row.id === playerId);
    return index >= 0 ? index + 1 : 0;
  }

  async upsertWeeklyScore(playerId: string, periodKey: string, score: number): Promise<void> {
    const safe = Math.max(0, Number.isFinite(score) ? Math.floor(score) : 0);
    const row = this.state.weeklyScores.find((entry) => entry.playerId === playerId && entry.periodKey === periodKey);
    if (row) row.score = safe;
    else this.state.weeklyScores.push({ playerId, periodKey, score: safe });
    await this.persist();
  }

  async incrementWeeklyScore(playerId: string, periodKey: string, delta: number): Promise<number> {
    return this.withMut(async () => {
      const add = Math.max(0, Number.isFinite(delta) ? Math.floor(delta) : 0);
      const row = this.state.weeklyScores.find(
        (entry) => entry.playerId === playerId && entry.periodKey === periodKey,
      );
      if (row) {
        row.score += add;
        await this.persist();
        return row.score;
      }
      this.state.weeklyScores.push({ playerId, periodKey, score: add });
      await this.persist();
      return add;
    });
  }

  async getWeeklyScore(playerId: string, periodKey: string): Promise<number> {
    return (
      this.state.weeklyScores.find((row) => row.playerId === playerId && row.periodKey === periodKey)?.score ?? 0
    );
  }

  async createClan(input: {
    name: string;
    tag: string;
    description: string;
    leaderPlayerId: string;
    cost?: number;
  }): Promise<ClanRecord> {
    return this.withClanLock(async () => {
      if (this.state.clanMembers.some((row) => row.playerId === input.leaderPlayerId)) {
        throw new Error('already_in_clan');
      }
      const nameKey = input.name.toLowerCase();
      const tagKey = input.tag.toLowerCase();
      if (this.state.clans.some((clan) => clan.nameKey === nameKey)) throw new Error('name_taken');
      if (this.state.clans.some((clan) => clan.tagKey === tagKey)) throw new Error('tag_taken');
      const cost = Number.isFinite(input.cost) ? Math.max(0, Math.floor(input.cost ?? 0)) : 0;
      const leader = this.state.players.find((row) => row.id === input.leaderPlayerId);
      if (!leader) throw new Error('player_missing');
      if (leader.coins < cost) throw new Error('insufficient_coins');
      if (cost) {
        this.state.currencyTx.push({
          playerId: leader.id,
          currency: 'COINS',
          amount: -cost,
          balanceBefore: leader.coins,
          balanceAfter: leader.coins - cost,
          reason: 'clan_create',
          createdAt: new Date(),
        });
        leader.coins -= cost;
      }
      const clan: ClanRecord = {
        id: randomUUID(),
        name: input.name,
        nameKey,
        tag: input.tag,
        tagKey,
        description: input.description,
        leaderPlayerId: input.leaderPlayerId,
        level: 1,
        xp: 0,
        createdAt: new Date(),
        disbandedAt: null,
      };
      this.state.clans.push(clan);
      this.state.clanMembers.push({
        id: randomUUID(),
        clanId: clan.id,
        playerId: input.leaderPlayerId,
        role: 'LEADER',
        joinedAt: new Date(),
      });
      await this.persist();
      return clan;
    });
  }

  async getClan(clanId: string): Promise<ClanRecord | null> {
    return this.state.clans.find((clan) => clan.id === clanId) ?? null;
  }

  async findClanByNameKey(nameKey: string): Promise<ClanRecord | null> {
    return this.state.clans.find((clan) => clan.nameKey === nameKey) ?? null;
  }

  async findClanByTagKey(tagKey: string): Promise<ClanRecord | null> {
    return this.state.clans.find((clan) => clan.tagKey === tagKey) ?? null;
  }

  async getPlayerClan(playerId: string): Promise<{ clan: ClanRecord; member: ClanMemberRecord } | null> {
    const member = this.state.clanMembers.find((row) => row.playerId === playerId);
    if (!member) return null;
    const clan = this.state.clans.find((row) => row.id === member.clanId);
    if (!clan || clan.disbandedAt) return null;
    return { clan, member };
  }

  async listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]> {
    const needle = query.trim().toLowerCase().slice(0, 24);
    const active = this.state.clans.filter((clan) => !clan.disbandedAt);
    const rows = needle
      ? active.filter((clan) => clan.nameKey.includes(needle) || clan.tagKey.includes(needle))
      : [...active];
    rows.sort((a, b) => b.xp - a.xp || a.createdAt.getTime() - b.createdAt.getTime());
    const take = clampLimit(limit, 5);
    const skip = clampOffset(offset);
    return rows.slice(skip, skip + take);
  }

  async addClanXp(clanId: string, amount: number): Promise<ClanRecord> {
    const clan = this.state.clans.find((row) => row.id === clanId);
    if (!clan) throw new Error('clan_missing');
    const add = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    clan.xp += add;
    clan.level = clanLevelForXp(clan.xp);
    await this.persist();
    return clan;
  }

  async listClanMembers(clanId: string): Promise<ClanMemberRecord[]> {
    return this.state.clanMembers.filter((row) => row.clanId === clanId);
  }

  async addClanMember(input: {
    clanId: string;
    playerId: string;
    role: ClanRole;
    maxMembers?: number;
  }): Promise<ClanMemberRecord> {
    return this.withClanLock(async () => {
      if (this.state.clanMembers.some((row) => row.playerId === input.playerId)) {
        throw new Error('already_in_clan');
      }
      if (input.maxMembers) {
        const count = this.state.clanMembers.filter((row) => row.clanId === input.clanId).length;
        if (count >= input.maxMembers) throw new Error('clan_full');
      }
      const member: ClanMemberRecord = {
        id: randomUUID(),
        clanId: input.clanId,
        playerId: input.playerId,
        role: input.role,
        joinedAt: new Date(),
      };
      this.state.clanMembers.push(member);
      await this.persist();
      return member;
    });
  }

  async removeClanMember(clanId: string, playerId: string): Promise<void> {
    return this.withClanLock(async () => {
      this.state.clanMembers = this.state.clanMembers.filter(
        (row) => !(row.clanId === clanId && row.playerId === playerId),
      );
      await this.persist();
    });
  }

  async setClanMemberRole(clanId: string, playerId: string, role: ClanRole): Promise<void> {
    const member = this.state.clanMembers.find((row) => row.clanId === clanId && row.playerId === playerId);
    if (!member) throw new Error('not_member');
    member.role = role;
    await this.persist();
  }

  async setClanLeader(clanId: string, playerId: string): Promise<void> {
    return this.withClanLock(async () => {
      const clan = this.state.clans.find((row) => row.id === clanId);
      if (!clan) throw new Error('clan_missing');
      const next = this.state.clanMembers.find((row) => row.clanId === clanId && row.playerId === playerId);
      if (!next) throw new Error('not_member');
      const prev = this.state.clanMembers.find(
        (row) => row.clanId === clanId && row.playerId === clan.leaderPlayerId,
      );
      if (prev) prev.role = 'OFFICER';
      next.role = 'LEADER';
      clan.leaderPlayerId = playerId;
      await this.persist();
    });
  }

  async deleteClan(clanId: string): Promise<void> {
    return this.disbandClan(clanId);
  }

  async disbandClan(clanId: string): Promise<void> {
    return this.withClanLock(async () => {
      const clan = this.state.clans.find((row) => row.id === clanId);
      if (!clan) return;
      clan.disbandedAt = new Date();
      this.state.clanMembers = this.state.clanMembers.filter((row) => row.clanId !== clanId);
      for (const row of this.state.clanApplications) {
        if (row.clanId === clanId && row.status === 'PENDING') row.status = 'CANCELLED';
      }
      await this.persist();
    });
  }

  async createApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord> {
    return this.withClanLock(async () => {
      const existing = this.state.clanApplications.find(
        (row) => row.playerId === playerId && row.status === 'PENDING',
      );
      if (existing) throw new Error('duplicate_application');
      const record: ClanApplicationRecord = {
        id: randomUUID(),
        clanId,
        playerId,
        status: 'PENDING',
        createdAt: new Date(),
      };
      this.state.clanApplications.push(record);
      await this.persist();
      return record;
    });
  }

  async getApplication(id: string): Promise<ClanApplicationRecord | null> {
    return this.state.clanApplications.find((row) => row.id === id) ?? null;
  }

  async getPendingApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord | null> {
    return (
      this.state.clanApplications.find(
        (row) => row.clanId === clanId && row.playerId === playerId && row.status === 'PENDING',
      ) ?? null
    );
  }

  async listPendingApplications(clanId: string): Promise<ClanApplicationRecord[]> {
    return this.state.clanApplications.filter((row) => row.clanId === clanId && row.status === 'PENDING');
  }

  async listPlayerApplications(playerId: string): Promise<ClanApplicationRecord[]> {
    return this.state.clanApplications.filter((row) => row.playerId === playerId);
  }

  async setApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
    const row = this.state.clanApplications.find((entry) => entry.id === id);
    if (row) row.status = status;
    await this.persist();
  }

  async cancelPendingApplications(playerId: string): Promise<void> {
    for (const row of this.state.clanApplications) {
      if (row.playerId === playerId && row.status === 'PENDING') row.status = 'CANCELLED';
    }
    await this.persist();
  }

  async addContribution(
    clanId: string,
    playerId: string,
    periodKey: string,
    amount: number,
  ): Promise<number> {
    let row = this.state.contributions.find(
      (entry) => entry.clanId === clanId && entry.playerId === playerId && entry.periodKey === periodKey,
    );
    if (!row) {
      row = { clanId, playerId, periodKey, score: 0 };
      this.state.contributions.push(row);
    }
    row.score += amount;
    await this.persist();
    return row.score;
  }

  async getContribution(clanId: string, playerId: string, periodKey: string): Promise<number> {
    return (
      this.state.contributions.find(
        (row) => row.clanId === clanId && row.playerId === playerId && row.periodKey === periodKey,
      )?.score ?? 0
    );
  }

  async clanSeasonContribution(clanId: string, periodKey: string): Promise<number> {
    return this.state.contributions
      .filter((row) => row.clanId === clanId && row.periodKey === periodKey)
      .reduce((sum, row) => sum + row.score, 0);
  }

  async listClanLeaderboard(
    periodKey: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.clanBoardRows(periodKey);
    const take = clampLimit(limit);
    const skip = clampOffset(offset);
    return rows.slice(skip, skip + take);
  }

  async getClanLeaderboardRank(clanId: string, periodKey: string): Promise<number> {
    const rows = await this.clanBoardRows(periodKey);
    const index = rows.findIndex((row) => row.id === clanId);
    return index >= 0 ? index + 1 : 0;
  }

  async tryGrantEntitlement(
    playerId: string,
    productId: string,
    source: string,
    externalTransactionId?: string,
  ): Promise<boolean> {
    return this.withMut(async () => {
      if (this.state.entitlements.some((row) => row.playerId === playerId && row.productId === productId)) {
        return false;
      }
      this.state.entitlements.push({
        playerId,
        productId,
        grantedAt: new Date(),
        source,
        externalTransactionId: externalTransactionId ?? null,
      });
      await this.persist();
      return true;
    });
  }

  async listEntitlements(playerId: string): Promise<EntitlementRecord[]> {
    return this.state.entitlements.filter((row) => row.playerId === playerId);
  }

  async hasEntitlement(playerId: string, productId: string): Promise<boolean> {
    return this.state.entitlements.some((row) => row.playerId === playerId && row.productId === productId);
  }

  async getCosmetics(playerId: string): Promise<PlayerCosmeticRecord> {
    let row = this.state.cosmetics.find((entry) => entry.playerId === playerId);
    if (!row) {
      row = {
        playerId,
        profileFrame: null,
        title: null,
        badge: null,
        campTheme: null,
        chatBadge: null,
      };
      this.state.cosmetics.push(row);
    }
    return row;
  }

  async setCosmetic(
    playerId: string,
    slot: keyof Omit<PlayerCosmeticRecord, 'playerId'>,
    productId: string | null,
  ): Promise<void> {
    const row = await this.getCosmetics(playerId);
    row[slot] = productId;
    await this.persist();
  }

  async tryGrantAchievement(playerId: string, achievementId: string): Promise<boolean> {
    return this.withMut(async () => {
      if (this.state.achievements.some((row) => row.playerId === playerId && row.achievementId === achievementId)) {
        return false;
      }
      this.state.achievements.push({ playerId, achievementId, grantedAt: new Date() });
      await this.persist();
      return true;
    });
  }

  async listAchievements(playerId: string): Promise<PlayerAchievementRecord[]> {
    return this.state.achievements.filter((row) => row.playerId === playerId);
  }

  async createFixedListing(input: {
    sellerPlayerId: string;
    assetKind: MarketListingRecord['assetKind'];
    assetRef: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    listingType: MarketListingRecord['listingType'];
    expiresAt: Date;
    requestId?: string;
    now?: Date;
    startingPrice?: number | null;
    buyoutPrice?: number | null;
    currentBid?: number | null;
    bidCount?: number;
  }): Promise<MarketListingRecord> {
    return this.withMut(async () => {
      const now = input.now ?? new Date();
      this.expireDueUnlocked(now);
      if (input.requestId) {
        const existing = this.state.listings.find((row) => row.requestId === input.requestId);
        if (existing) return cloneListing(existing);
      }
      const seller = this.state.players.find((row) => row.id === input.sellerPlayerId);
      if (!seller) throw new NotFoundError('Игрок не найден.');
      const active = this.state.listings.filter(
        (row) => row.sellerPlayerId === input.sellerPlayerId && row.status === 'ACTIVE',
      );
      if (active.length >= MARKET.maxActiveListingsPerPlayer) {
        throw new ActionRejectedError(`Не больше ${MARKET.maxActiveListingsPerPlayer} активных лотов.`);
      }
      this.debitResourceUnlocked(input.sellerPlayerId, input.assetRef as ResourceType, input.quantity);
      const listing: MarketListingRecord = {
        id: randomUUID(),
        sellerPlayerId: input.sellerPlayerId,
        listingType: input.listingType,
        assetKind: 'RESOURCE',
        assetRef: input.assetRef,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalPrice: input.totalPrice,
        status: 'ACTIVE',
        createdAt: now,
        expiresAt: input.expiresAt,
        buyerPlayerId: null,
        soldAt: null,
        cancelledAt: null,
        requestId: input.requestId ?? null,
        startingPrice: input.startingPrice ?? (input.listingType === 'AUCTION' ? input.unitPrice : null),
        currentBid: input.currentBid ?? null,
        currentBidderPlayerId: null,
        buyoutPrice: input.buyoutPrice ?? null,
        bidCount: input.bidCount ?? 0,
        extensionCount: 0,
      };
      this.state.listings.push(listing);
      await this.persist();
      return cloneListing(listing);
    });
  }

  async cancelListing(input: {
    listingId: string;
    sellerPlayerId: string;
    now?: Date;
  }): Promise<MarketListingRecord> {
    return this.withMut(async () => {
      const now = input.now ?? new Date();
      this.expireDueUnlocked(now);
      const listing = this.state.listings.find((row) => row.id === input.listingId);
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.sellerPlayerId !== input.sellerPlayerId) {
        throw new ActionRejectedError('Это не твой лот.');
      }
      if (listing.status === 'CANCELLED') return cloneListing(listing);
      if (listing.status !== 'ACTIVE') {
        throw new ActionRejectedError('Лот уже закрыт.');
      }
      if (listing.listingType === 'AUCTION' && listing.bidCount > 0) {
        throw new ActionRejectedError('Аукцион со ставками отменить нельзя.');
      }
      listing.status = 'CANCELLED';
      listing.cancelledAt = now;
      this.creditResourceUnlocked(listing.sellerPlayerId, listing.assetRef as ResourceType, listing.quantity);
      await this.persist();
      return cloneListing(listing);
    });
  }

  async buyFixedListing(input: {
    listingId: string;
    buyerPlayerId: string;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }> {
    return this.withMut(async () => {
      const now = input.now ?? new Date();
      if (input.requestId) {
        const existingTx = this.state.marketTx.find((row) => row.requestId === input.requestId);
        if (existingTx) {
          const listing = this.state.listings.find((row) => row.id === existingTx.listingId);
          if (listing) return { listing: cloneListing(listing), transaction: { ...existingTx } };
        }
      }
      this.expireDueUnlocked(now);
      const listing = this.state.listings.find((row) => row.id === input.listingId);
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.status === 'EXPIRED') throw new ActionRejectedError('Лот истёк.');
      if (listing.status !== 'ACTIVE') throw new ActionRejectedError('Лот уже закрыт.');
      if (listing.listingType !== 'FIXED_PRICE') throw new ActionRejectedError('Это аукцион.');
      if (listing.sellerPlayerId === input.buyerPlayerId) {
        throw new ActionRejectedError('Нельзя купить свой лот.');
      }
      const buyer = this.state.players.find((row) => row.id === input.buyerPlayerId);
      const seller = this.state.players.find((row) => row.id === listing.sellerPlayerId);
      if (!buyer || !seller) throw new NotFoundError('Игрок не найден.');
      const gross = listing.totalPrice;
      const fee = marketFee(gross);
      const net = gross - fee;
      if (buyer.coins < gross) throw new InsufficientCoinsError('Не хватает монет.');
      if (seller.coins + net > MARKET.intMax) throw new ActionRejectedError('Переполнение монет.');
      buyer.coins -= gross;
      seller.coins += net;
      this.creditResourceUnlocked(buyer.id, listing.assetRef as ResourceType, listing.quantity);
      listing.status = 'SOLD';
      listing.buyerPlayerId = buyer.id;
      listing.soldAt = now;
      const transaction: MarketTransactionRecord = {
        id: randomUUID(),
        listingId: listing.id,
        sellerPlayerId: seller.id,
        buyerPlayerId: buyer.id,
        assetKind: listing.assetKind,
        assetRef: listing.assetRef,
        quantity: listing.quantity,
        grossPrice: gross,
        fee,
        sellerNet: net,
        createdAt: now,
        requestId: input.requestId ?? null,
      };
      this.state.marketTx.push(transaction);
      this.state.currencyTx.push({
        playerId: buyer.id,
        currency: 'COINS',
        amount: -gross,
        balanceBefore: buyer.coins + gross,
        balanceAfter: buyer.coins,
        reason: 'market_buy',
        referenceId: listing.id,
        createdAt: now,
      });
      this.state.currencyTx.push({
        playerId: seller.id,
        currency: 'COINS',
        amount: net,
        balanceBefore: seller.coins - net,
        balanceAfter: seller.coins,
        reason: 'market_sell',
        referenceId: listing.id,
        createdAt: now,
      });
      const buyerStats = this.ensureStats(buyer.id);
      buyerStats.tradesCompleted += 1;
      buyerStats.coinsSpent += gross;
      const sellerStats = this.ensureStats(seller.id);
      sellerStats.tradesCompleted += 1;
      sellerStats.coinsEarned += net;
      this.enqueueNoticeUnlocked(seller.id, 'sold', 'Ваш товар продан.', listing.id);
      await this.persist();
      return { listing: cloneListing(listing), transaction: { ...transaction } };
    });
  }

  async placeAuctionBid(input: {
    listingId: string;
    bidderPlayerId: string;
    amount: number;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; bid: AuctionBidRecord }> {
    return this.withMut(async () => {
      const now = input.now ?? new Date();
      if (input.requestId) {
        const existing = this.state.auctionBids.find((row) => row.requestId === input.requestId);
        if (existing) {
          const listing = this.state.listings.find((row) => row.id === existing.listingId)!;
          return { listing: cloneListing(listing), bid: { ...existing } };
        }
      }
      this.expireDueUnlocked(now);
      const listing = this.state.listings.find((row) => row.id === input.listingId);
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.listingType !== 'AUCTION') throw new ActionRejectedError('Это не аукцион.');
      if (listing.status !== 'ACTIVE' || listing.expiresAt <= now) {
        throw new ActionRejectedError('Аукцион уже закрыт.');
      }
      if (listing.sellerPlayerId === input.bidderPlayerId) {
        throw new ActionRejectedError('Нельзя ставить на свой лот.');
      }
      const min = minBidAmount(listing.currentBid, listing.startingPrice ?? listing.unitPrice);
      if (input.amount < min) throw new ActionRejectedError(`Минимальная ставка: ${min}.`);
      if (listing.buyoutPrice && input.amount >= listing.buyoutPrice) {
        throw new ActionRejectedError('Для выкупа нажми «Купить сразу».');
      }
      const bidder = this.state.players.find((row) => row.id === input.bidderPlayerId);
      if (!bidder) throw new NotFoundError('Игрок не найден.');
      const previousId = listing.currentBidderPlayerId;
      const previousBid = listing.currentBid ?? 0;
      let debit = input.amount;
      if (previousId === bidder.id) debit = input.amount - previousBid;
      if (debit < 0) debit = 0;
      if (bidder.coins < debit) throw new InsufficientCoinsError('Не хватает монет.');
      this.debitCoinsUnlocked(bidder, debit, 'auction_bid_hold', listing.id, now);
      if (previousId && previousId !== bidder.id && previousBid > 0) {
        const prev = this.state.players.find((row) => row.id === previousId);
        if (prev) {
          this.creditCoinsUnlocked(prev, previousBid, 'auction_bid_release', listing.id, now);
          this.enqueueNoticeUnlocked(prev.id, 'outbid', 'Вашу ставку перебили.', listing.id);
        }
        for (const row of this.state.auctionBids) {
          if (row.listingId === listing.id && row.bidderPlayerId === previousId && row.status === 'HOLD') {
            row.status = 'REFUNDED';
          }
        }
      }
      if (previousId === bidder.id) {
        for (const row of this.state.auctionBids) {
          if (row.listingId === listing.id && row.bidderPlayerId === bidder.id && row.status === 'HOLD') {
            row.status = 'SUPERSEDED';
          }
        }
      }
      const bid: AuctionBidRecord = {
        id: randomUUID(),
        listingId: listing.id,
        bidderPlayerId: bidder.id,
        amount: input.amount,
        status: 'HOLD',
        createdAt: now,
        requestId: input.requestId ?? null,
      };
      this.state.auctionBids.push(bid);
      listing.currentBid = input.amount;
      listing.currentBidderPlayerId = bidder.id;
      listing.bidCount += 1;
      listing.unitPrice = input.amount;
      listing.totalPrice = input.amount;
      if (
        listing.expiresAt.getTime() - now.getTime() <= AUCTION.antiSnipeWindowMs &&
        listing.extensionCount < AUCTION.maxExtensions
      ) {
        listing.expiresAt = new Date(listing.expiresAt.getTime() + AUCTION.antiSnipeExtendMs);
        listing.extensionCount += 1;
      }
      await this.persist();
      return { listing: cloneListing(listing), bid: { ...bid } };
    });
  }

  async buyoutAuction(input: {
    listingId: string;
    buyerPlayerId: string;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }> {
    return this.withMut(async () => {
      const now = input.now ?? new Date();
      if (input.requestId) {
        const existingTx = this.state.marketTx.find((row) => row.requestId === input.requestId);
        if (existingTx) {
          const listing = this.state.listings.find((row) => row.id === existingTx.listingId)!;
          return { listing: cloneListing(listing), transaction: { ...existingTx } };
        }
      }
      this.expireDueUnlocked(now);
      const listing = this.state.listings.find((row) => row.id === input.listingId);
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.listingType !== 'AUCTION') throw new ActionRejectedError('Это не аукцион.');
      if (listing.status === 'SOLD' && listing.buyerPlayerId === input.buyerPlayerId) {
        const tx = this.state.marketTx.find((row) => row.listingId === listing.id);
        if (tx) return { listing: cloneListing(listing), transaction: { ...tx } };
      }
      if (listing.status !== 'ACTIVE' || listing.expiresAt <= now) {
        throw new ActionRejectedError('Аукцион уже закрыт.');
      }
      if (!listing.buyoutPrice) throw new ActionRejectedError('Выкупа нет.');
      if (listing.sellerPlayerId === input.buyerPlayerId) {
        throw new ActionRejectedError('Нельзя купить свой лот.');
      }
      const buyer = this.state.players.find((row) => row.id === input.buyerPlayerId);
      const seller = this.state.players.find((row) => row.id === listing.sellerPlayerId);
      if (!buyer || !seller) throw new NotFoundError('Игрок не найден.');
      const buyout = listing.buyoutPrice;
      const held = listing.currentBidderPlayerId === buyer.id ? listing.currentBid ?? 0 : 0;
      const debit = buyout - held;
      if (buyer.coins < debit) throw new InsufficientCoinsError('Не хватает монет.');
      if (listing.currentBidderPlayerId && listing.currentBidderPlayerId !== buyer.id) {
        const prev = this.state.players.find((row) => row.id === listing.currentBidderPlayerId);
        if (prev && listing.currentBid) {
          this.creditCoinsUnlocked(prev, listing.currentBid, 'auction_bid_release', listing.id, now);
          this.enqueueNoticeUnlocked(prev.id, 'outbid', 'Аукцион выкупили сразу. Ставка возвращена.', listing.id);
        }
        for (const row of this.state.auctionBids) {
          if (row.listingId === listing.id && row.status === 'HOLD') row.status = 'REFUNDED';
        }
      } else {
        for (const row of this.state.auctionBids) {
          if (row.listingId === listing.id && row.bidderPlayerId === buyer.id && row.status === 'HOLD') {
            row.status = 'SETTLED';
          }
        }
      }
      this.debitCoinsUnlocked(buyer, debit, held ? 'auction_settle' : 'auction_bid_hold', listing.id, now);
      const sold = this.finishAuctionSaleUnlocked(listing, buyer, seller, buyout, now, input.requestId, 'buyout');
      await this.persist();
      return sold;
    });
  }

  async settleExpiredAuctions(now?: Date, limit = 50): Promise<number> {
    return this.withMut(async () => {
      const at = now ?? new Date();
      const due = this.state.listings
        .filter((row) => row.listingType === 'AUCTION' && row.status === 'ACTIVE' && row.expiresAt <= at)
        .slice(0, Math.max(1, limit));
      for (const listing of due) this.expireOneUnlocked(listing, at);
      await this.persist();
      return due.length;
    });
  }

  async listAuctionBids(listingId: string): Promise<AuctionBidRecord[]> {
    return this.state.auctionBids
      .filter((row) => row.listingId === listingId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({ ...row }));
  }

  async listPlayerBids(playerId: string, limit = 10): Promise<AuctionBidRecord[]> {
    return this.state.auctionBids
      .filter((row) => row.bidderPlayerId === playerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, clampLimit(limit, 10))
      .map((row) => ({ ...row }));
  }

  async enqueueNotice(input: {
    playerId: string;
    kind: string;
    body: string;
    listingId?: string | null;
  }): Promise<void> {
    this.enqueueNoticeUnlocked(input.playerId, input.kind, input.body, input.listingId ?? null);
    await this.persist();
  }

  async consumeNotices(playerId: string, limit = 5): Promise<PlayerNoticeRecord[]> {
    const unread = this.state.notices
      .filter((row) => row.playerId === playerId && !row.readAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, clampLimit(limit, 5));
    const now = new Date();
    for (const row of unread) row.readAt = now;
    await this.persist();
    return unread.map((row) => ({ ...row }));
  }

  async averageSalePrices(
    since: Date,
    assetRef?: string,
  ): Promise<Array<{ assetRef: string; avg: number; count: number }>> {
    const groups = new Map<string, { sum: number; qty: number; count: number }>();
    for (const tx of this.state.marketTx) {
      if (tx.createdAt < since) continue;
      if (assetRef && tx.assetRef !== assetRef) continue;
      const row = groups.get(tx.assetRef) ?? { sum: 0, qty: 0, count: 0 };
      row.sum += tx.grossPrice;
      row.qty += tx.quantity;
      row.count += 1;
      groups.set(tx.assetRef, row);
    }
    return [...groups.entries()].map(([ref, row]) => ({
      assetRef: ref,
      avg: row.qty ? Math.round(row.sum / row.qty) : 0,
      count: row.count,
    }));
  }

  async countPairTrades(sellerPlayerId: string, buyerPlayerId: string, since: Date): Promise<number> {
    return this.state.marketTx.filter(
      (row) =>
        row.sellerPlayerId === sellerPlayerId &&
        row.buyerPlayerId === buyerPlayerId &&
        row.createdAt >= since,
    ).length;
  }

  async countSuspiciousSignals(now?: Date): Promise<number> {
    const at = now ?? new Date();
    const week = new Date(at.getTime() - 7 * 86_400_000);
    const avgs = await this.averageSalePrices(week);
    const avgMap = new Map(avgs.map((row) => [row.assetRef, row.avg]));
    let signals = 0;
    const pairs = new Map<string, number>();
    for (const tx of this.state.marketTx) {
      if (tx.createdAt < week) continue;
      const key = `${tx.sellerPlayerId}:${tx.buyerPlayerId}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      const avg = avgMap.get(tx.assetRef) ?? 0;
      const unit = tx.quantity ? tx.grossPrice / tx.quantity : tx.grossPrice;
      if (avg > 0 && unit > avg * 3) signals += 1;
    }
    for (const count of pairs.values()) if (count >= 5) signals += 1;
    const tenMin = new Date(at.getTime() - 10 * 60_000);
    const relist = new Map<string, number>();
    for (const listing of this.state.listings) {
      if (listing.createdAt < tenMin) continue;
      relist.set(listing.sellerPlayerId, (relist.get(listing.sellerPlayerId) ?? 0) + 1);
    }
    for (const count of relist.values()) if (count >= 5) signals += 1;
    return signals;
  }

  async expireListing(listingId: string, now?: Date): Promise<MarketListingRecord> {
    return this.withMut(async () => {
      const at = now ?? new Date();
      const listing = this.state.listings.find((row) => row.id === listingId);
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.status === 'EXPIRED' || listing.status === 'SOLD') return cloneListing(listing);
      if (listing.status !== 'ACTIVE') throw new ActionRejectedError('Лот уже закрыт.');
      if (listing.expiresAt > at) throw new ActionRejectedError('Срок лота ещё не вышел.');
      this.expireOneUnlocked(listing, at);
      await this.persist();
      return cloneListing(listing);
    });
  }

  async expireDueListings(now?: Date): Promise<number> {
    return this.withMut(async () => {
      const count = this.expireDueUnlocked(now ?? new Date());
      await this.persist();
      return count;
    });
  }

  async getListing(listingId: string): Promise<MarketListingRecord | null> {
    const listing = this.state.listings.find((row) => row.id === listingId);
    return listing ? cloneListing(listing) : null;
  }

  async getOwnListings(sellerPlayerId: string): Promise<MarketListingRecord[]> {
    this.expireDueUnlocked(new Date());
    return this.state.listings
      .filter((row) => row.sellerPlayerId === sellerPlayerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(cloneListing);
  }

  async searchActiveListings(query: MarketSearchQuery, now?: Date): Promise<MarketListingRecord[]> {
    const at = now ?? new Date();
    this.expireDueUnlocked(at);
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset ?? 0);
    let rows = this.state.listings.filter((row) => row.status === 'ACTIVE' && row.expiresAt > at);
    if (query.listingType && query.listingType !== 'ALL') {
      rows = rows.filter((row) => row.listingType === query.listingType);
    }
    if (query.sellerPlayerId) rows = rows.filter((row) => row.sellerPlayerId === query.sellerPlayerId);
    if (query.assetRef) rows = rows.filter((row) => row.assetRef === query.assetRef);
    if (query.assetRefs?.length) {
      const wanted = new Set(query.assetRefs);
      rows = rows.filter((row) => wanted.has(row.assetRef));
    }
    const priceOf = (row: MarketListingRecord) =>
      row.listingType === 'AUCTION' ? (row.currentBid ?? row.startingPrice ?? row.unitPrice) : row.unitPrice;
    if (Number.isFinite(query.minPrice)) {
      rows = rows.filter((row) => priceOf(row) >= (query.minPrice as number));
    }
    if (Number.isFinite(query.maxPrice)) {
      rows = rows.filter((row) => priceOf(row) <= (query.maxPrice as number));
    }
    const sort = query.sort ?? 'price_asc';
    rows.sort((a, b) => {
      if (sort === 'price_desc') return priceOf(b) - priceOf(a) || a.createdAt.getTime() - b.createdAt.getTime();
      if (sort === 'created_desc') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sort === 'ending_soon') return a.expiresAt.getTime() - b.expiresAt.getTime();
      return priceOf(a) - priceOf(b) || a.createdAt.getTime() - b.createdAt.getTime();
    });
    return rows.slice(offset, offset + limit).map(cloneListing);
  }

  async listMarketTransactions(listingId: string): Promise<MarketTransactionRecord[]> {
    return this.state.marketTx.filter((row) => row.listingId === listingId).map((row) => ({ ...row }));
  }

  async listCurrencyTransactions(playerId: string, referenceId?: string): Promise<CurrencyTransactionRecord[]> {
    return this.state.currencyTx
      .filter((row) => row.playerId === playerId && (!referenceId || row.referenceId === referenceId))
      .map((row) => ({ ...row }));
  }

  async getMarketAnalytics(now?: Date): Promise<MarketAnalyticsSnapshot> {
    const at = now ?? new Date();
    this.expireDueUnlocked(at);
    const today = utcDayStart(at);
    const d7 = new Date(at.getTime() - 7 * 86_400_000);
    const created = (since: Date) => this.state.listings.filter((row) => row.createdAt >= since).length;
    const sold = this.state.marketTx;
    const soldSince = (since: Date) => sold.filter((row) => row.createdAt >= since);
    const todaySold = soldSince(today);
    const weekSold = soldSince(d7);
    const sum = (rows: MarketTransactionRecord[], key: 'grossPrice' | 'fee') =>
      rows.reduce((acc, row) => acc + row[key], 0);
    const unique = (rows: MarketTransactionRecord[], key: 'sellerPlayerId' | 'buyerPlayerId') =>
      new Set(rows.map((row) => row[key])).size;
    return {
      activeListings: this.state.listings.filter((row) => row.status === 'ACTIVE' && row.expiresAt > at).length,
      listingsCreatedToday: created(today),
      listingsCreated7d: created(d7),
      completedTradesToday: todaySold.length,
      completedTrades7d: weekSold.length,
      grossVolumeToday: sum(todaySold, 'grossPrice'),
      grossVolume7d: sum(weekSold, 'grossPrice'),
      feesBurnedToday: sum(todaySold, 'fee'),
      feesBurned7d: sum(weekSold, 'fee'),
      uniqueSellers7d: unique(weekSold, 'sellerPlayerId'),
      uniqueBuyers7d: unique(weekSold, 'buyerPlayerId'),
      ...this.marketAnalyticsExtras(at, weekSold),
    };
  }

  private expireDueUnlocked(now: Date): number {
    let count = 0;
    for (const listing of this.state.listings) {
      if (listing.status === 'ACTIVE' && listing.expiresAt <= now) {
        this.expireOneUnlocked(listing, now);
        count += 1;
      }
    }
    return count;
  }

  private expireOneUnlocked(listing: MarketListingRecord, now: Date): void {
    if (listing.status !== 'ACTIVE') return;
    if (listing.listingType === 'AUCTION' && listing.currentBidderPlayerId && (listing.currentBid ?? 0) > 0) {
      const winner = this.state.players.find((row) => row.id === listing.currentBidderPlayerId);
      const seller = this.state.players.find((row) => row.id === listing.sellerPlayerId);
      if (winner && seller) {
        this.finishAuctionSaleUnlocked(
          listing,
          winner,
          seller,
          listing.currentBid ?? listing.unitPrice,
          now,
          undefined,
          'settle',
        );
        return;
      }
    }
    if (listing.listingType === 'AUCTION') {
      for (const row of this.state.auctionBids) {
        if (row.listingId === listing.id && row.status === 'HOLD') {
          row.status = 'REFUNDED';
          const bidder = this.state.players.find((player) => player.id === row.bidderPlayerId);
          if (bidder) this.creditCoinsUnlocked(bidder, row.amount, 'auction_bid_release', listing.id, now);
        }
      }
      this.enqueueNoticeUnlocked(
        listing.sellerPlayerId,
        'ended',
        'Аукцион завершён без ставок. Товар возвращён.',
        listing.id,
      );
    }
    listing.status = 'EXPIRED';
    this.creditResourceUnlocked(listing.sellerPlayerId, listing.assetRef as ResourceType, listing.quantity);
  }

  private finishAuctionSaleUnlocked(
    listing: MarketListingRecord,
    buyer: PlayerRecord,
    seller: PlayerRecord,
    gross: number,
    now: Date,
    requestId: string | undefined,
    kind: 'buyout' | 'settle',
  ): { listing: MarketListingRecord; transaction: MarketTransactionRecord } {
    const existingTx = this.state.marketTx.find((row) => row.listingId === listing.id);
    if (existingTx) {
      listing.status = 'SOLD';
      return { listing: cloneListing(listing), transaction: { ...existingTx } };
    }
    const fee = marketFee(gross);
    const net = gross - fee;
    if (seller.coins + net > MARKET.intMax) throw new ActionRejectedError('Переполнение монет.');
    seller.coins += net;
    this.creditResourceUnlocked(buyer.id, listing.assetRef as ResourceType, listing.quantity);
    listing.status = 'SOLD';
    listing.buyerPlayerId = buyer.id;
    listing.soldAt = now;
    listing.totalPrice = gross;
    const transaction: MarketTransactionRecord = {
      id: randomUUID(),
      listingId: listing.id,
      sellerPlayerId: seller.id,
      buyerPlayerId: buyer.id,
      assetKind: listing.assetKind,
      assetRef: listing.assetRef,
      quantity: listing.quantity,
      grossPrice: gross,
      fee,
      sellerNet: net,
      createdAt: now,
      requestId: requestId ?? null,
    };
    this.state.marketTx.push(transaction);
    this.state.currencyTx.push({
      playerId: seller.id,
      currency: 'COINS',
      amount: net,
      balanceBefore: seller.coins - net,
      balanceAfter: seller.coins,
      reason: 'auction_settle',
      referenceId: listing.id,
      createdAt: now,
    });
    for (const row of this.state.auctionBids) {
      if (row.listingId !== listing.id) continue;
      if (row.bidderPlayerId === buyer.id && row.status === 'HOLD') row.status = 'SETTLED';
      else if (row.status === 'HOLD') {
        row.status = 'REFUNDED';
        const other = this.state.players.find((player) => player.id === row.bidderPlayerId);
        if (other) this.creditCoinsUnlocked(other, row.amount, 'auction_bid_release', listing.id, now);
      }
    }
    const buyerStats = this.ensureStats(buyer.id);
    buyerStats.tradesCompleted += 1;
    buyerStats.coinsSpent += gross;
    const sellerStats = this.ensureStats(seller.id);
    sellerStats.tradesCompleted += 1;
    sellerStats.coinsEarned += net;
    this.enqueueNoticeUnlocked(
      seller.id,
      'sold',
      kind === 'buyout' ? 'Ваш аукцион выкупили сразу.' : 'Ваш аукцион завершён. Товар продан.',
      listing.id,
    );
    this.enqueueNoticeUnlocked(buyer.id, 'won', 'Вы выиграли аукцион.', listing.id);
    return { listing: cloneListing(listing), transaction: { ...transaction } };
  }

  private debitCoinsUnlocked(
    player: PlayerRecord,
    amount: number,
    reason: string,
    referenceId: string,
    now: Date,
  ): void {
    if (amount <= 0) return;
    if (player.coins < amount) throw new InsufficientCoinsError('Не хватает монет.');
    const before = player.coins;
    player.coins -= amount;
    this.state.currencyTx.push({
      playerId: player.id,
      currency: 'COINS',
      amount: -amount,
      balanceBefore: before,
      balanceAfter: player.coins,
      reason,
      referenceId,
      createdAt: now,
    });
  }

  private creditCoinsUnlocked(
    player: PlayerRecord,
    amount: number,
    reason: string,
    referenceId: string,
    now: Date,
  ): void {
    if (amount <= 0) return;
    if (player.coins + amount > MARKET.intMax) throw new ActionRejectedError('Переполнение монет.');
    const before = player.coins;
    player.coins += amount;
    this.state.currencyTx.push({
      playerId: player.id,
      currency: 'COINS',
      amount,
      balanceBefore: before,
      balanceAfter: player.coins,
      reason,
      referenceId,
      createdAt: now,
    });
  }

  private enqueueNoticeUnlocked(
    playerId: string,
    kind: string,
    body: string,
    listingId: string | null,
  ): void {
    this.state.notices.push({
      id: randomUUID(),
      playerId,
      kind,
      body,
      listingId,
      createdAt: new Date(),
      readAt: null,
    });
  }

  private marketAnalyticsExtras(
    at: Date,
    weekSold: MarketTransactionRecord[],
  ): Pick<
    MarketAnalyticsSnapshot,
    | 'fixedActive'
    | 'auctionActive'
    | 'auctionsWithBids'
    | 'auctionsSold'
    | 'auctionsExpired'
    | 'bidsToday'
    | 'bids7d'
    | 'auctionGrossVolume'
    | 'buyoutCount'
    | 'feesBurned'
    | 'uniqueSellers'
    | 'uniqueBuyers'
    | 'topTradedResources'
    | 'averageSalePrice'
    | 'suspiciousTradeSignals'
  > {
    const today = utcDayStart(at);
    const d7 = new Date(at.getTime() - 7 * 86_400_000);
    const active = (type: MarketListingRecord['listingType']) =>
      this.state.listings.filter(
        (row) => row.listingType === type && row.status === 'ACTIVE' && row.expiresAt > at,
      );
    const auctionListings = this.state.listings.filter((row) => row.listingType === 'AUCTION');
    const auctionIds = new Set(auctionListings.map((row) => row.id));
    const auctionSoldTx = this.state.marketTx.filter((row) => auctionIds.has(row.listingId));
    const listingById = new Map(this.state.listings.map((row) => [row.id, row]));
    const groups = new Map<string, { volume: number; count: number; sum: number; qty: number }>();
    for (const tx of weekSold) {
      const row = groups.get(tx.assetRef) ?? { volume: 0, count: 0, sum: 0, qty: 0 };
      row.volume += tx.grossPrice;
      row.count += 1;
      row.sum += tx.grossPrice;
      row.qty += tx.quantity;
      groups.set(tx.assetRef, row);
    }
    const top = [...groups.entries()]
      .sort((a, b) => b[1].volume - a[1].volume || b[1].count - a[1].count)
      .slice(0, 8)
      .map(([assetRef, row]) => ({ assetRef, volume: row.volume, count: row.count }));
    const averages = [...groups.entries()].map(([assetRef, row]) => ({
      assetRef,
      avg: row.qty ? Math.round(row.sum / row.qty) : 0,
    }));
    return {
      fixedActive: active('FIXED_PRICE').length,
      auctionActive: active('AUCTION').length,
      auctionsWithBids: active('AUCTION').filter((row) => row.bidCount > 0).length,
      auctionsSold: auctionListings.filter((row) => row.status === 'SOLD').length,
      auctionsExpired: auctionListings.filter((row) => row.status === 'EXPIRED').length,
      bidsToday: this.state.auctionBids.filter((row) => row.createdAt >= today).length,
      bids7d: this.state.auctionBids.filter((row) => row.createdAt >= d7).length,
      auctionGrossVolume: auctionSoldTx.reduce((acc, row) => acc + row.grossPrice, 0),
      buyoutCount: auctionSoldTx.filter((row) => {
        const listing = listingById.get(row.listingId);
        return Boolean(listing?.buyoutPrice && row.grossPrice === listing.buyoutPrice);
      }).length,
      feesBurned: this.state.marketTx.reduce((acc, row) => acc + row.fee, 0),
      uniqueSellers: new Set(this.state.marketTx.map((row) => row.sellerPlayerId)).size,
      uniqueBuyers: new Set(this.state.marketTx.map((row) => row.buyerPlayerId)).size,
      topTradedResources: top,
      averageSalePrice: averages,
      suspiciousTradeSignals: this.countSuspiciousSignalsSync(at),
    };
  }

  private countSuspiciousSignalsSync(at: Date): number {
    const week = new Date(at.getTime() - 7 * 86_400_000);
    const groups = new Map<string, { sum: number; qty: number }>();
    for (const tx of this.state.marketTx) {
      if (tx.createdAt < week) continue;
      const row = groups.get(tx.assetRef) ?? { sum: 0, qty: 0 };
      row.sum += tx.grossPrice;
      row.qty += tx.quantity;
      groups.set(tx.assetRef, row);
    }
    const avgMap = new Map(
      [...groups.entries()].map(([ref, row]) => [ref, row.qty ? row.sum / row.qty : 0]),
    );
    let signals = 0;
    const pairs = new Map<string, number>();
    for (const tx of this.state.marketTx) {
      if (tx.createdAt < week) continue;
      const key = `${tx.sellerPlayerId}:${tx.buyerPlayerId}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      const avg = avgMap.get(tx.assetRef) ?? 0;
      const unit = tx.quantity ? tx.grossPrice / tx.quantity : tx.grossPrice;
      if (avg > 0 && unit > avg * 3) signals += 1;
    }
    for (const count of pairs.values()) if (count >= 5) signals += 1;
    const tenMin = new Date(at.getTime() - 10 * 60_000);
    const relist = new Map<string, number>();
    for (const listing of this.state.listings) {
      if (listing.createdAt < tenMin) continue;
      relist.set(listing.sellerPlayerId, (relist.get(listing.sellerPlayerId) ?? 0) + 1);
    }
    for (const count of relist.values()) if (count >= 5) signals += 1;
    return signals;
  }

  private debitResourceUnlocked(playerId: string, resource: ResourceType, amount: number): number {
    const row = this.state.resources.find((entry) => entry.playerId === playerId && entry.resource === resource);
    if (!row || row.amount < amount) throw new InsufficientResourcesError();
    row.amount -= amount;
    return row.amount;
  }

  private creditResourceUnlocked(playerId: string, resource: ResourceType, amount: number): number {
    const row = this.state.resources.find((entry) => entry.playerId === playerId && entry.resource === resource);
    if (!row) {
      this.state.resources.push({ playerId, resource, amount });
      return amount;
    }
    row.amount += amount;
    return row.amount;
  }

  private clanChain: Promise<unknown> = Promise.resolve();

  private withClanLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.clanChain.then(fn, fn);
    this.clanChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private mutChain: Promise<unknown> = Promise.resolve();

  private withMut<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutChain.then(fn, fn);
    this.mutChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private ensureStats(playerId: string): PlayerStatisticsRecord {
    let row = this.state.statistics.find((entry) => entry.playerId === playerId);
    if (!row) {
      row = { playerId, ...EMPTY_STATISTICS };
      this.state.statistics.push(row);
    }
    return row;
  }

  private ensureRating(playerId: string): PlayerRatingRecord {
    let row = this.state.ratings.find((entry) => entry.playerId === playerId);
    if (!row) {
      row = {
        playerId,
        pvpRating: PVP_RATING.start,
        lifetimeScore: 0,
        weeklyScore: 0,
        weeklyPeriod: '',
        seasonId: 'season_0',
        weeklyPvpOpponents: '',
      };
      this.state.ratings.push(row);
    }
    return row;
  }

  private boardRows(board: 'score' | 'pvp' | 'weekly', periodKey: string): LeaderboardEntry[] {
    if (board === 'weekly') {
      return this.state.weeklyScores
        .filter((row) => row.periodKey === periodKey && row.score > 0)
        .map((row) => {
          const player = this.state.players.find((entry) => entry.id === row.playerId);
          return { id: row.playerId, name: player?.name ?? 'Путник', value: row.score };
        })
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    }
    const valueOf = (row: PlayerRatingRecord) => (board === 'pvp' ? row.pvpRating : row.lifetimeScore);
    return this.state.ratings
      .map((row) => {
        const player = this.state.players.find((entry) => entry.id === row.playerId);
        return { id: row.playerId, name: player?.name ?? 'Путник', value: valueOf(row) };
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }

  async setClanDescription(clanId: string, description: string): Promise<ClanRecord> {
    const clan = this.state.clans.find((row) => row.id === clanId);
    if (!clan || clan.disbandedAt) throw new Error('clan_missing');
    clan.description = description;
    await this.persist();
    return clan;
  }

  async listClanRoster(clanId: string, periodKey: string): Promise<ClanRosterRow[]> {
    const members = this.state.clanMembers.filter((row) => row.clanId === clanId);
    const rows: ClanRosterRow[] = [];
    for (const member of members) {
      const player = this.state.players.find((row) => row.id === member.playerId);
      const weekly = await this.getContribution(clanId, member.playerId, periodKey);
      rows.push({
        member,
        name: player?.name ?? 'Путник',
        level: player?.level ?? 1,
        lastActiveAt: player?.lastActiveAt ?? player?.updatedAt ?? new Date(0),
        weeklyContribution: weekly,
      });
    }
    rows.sort((a, b) => b.weeklyContribution - a.weeklyContribution || a.name.localeCompare(b.name, 'ru'));
    return rows;
  }

  async incrementClanTask(
    clanId: string,
    periodKey: string,
    taskId: string,
    target: number,
    amount: number,
  ): Promise<ClanTaskProgressRecord> {
    const add = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    let row = this.state.clanTasks.find(
      (entry) => entry.clanId === clanId && entry.periodKey === periodKey && entry.taskId === taskId,
    );
    if (!row) {
      row = { clanId, periodKey, taskId, progress: 0, target, completedAt: null };
      this.state.clanTasks.push(row);
    }
    row.target = target;
    let completedNow = false;
    if (!row.completedAt) {
      row.progress += add;
      if (row.progress >= target) {
        row.completedAt = new Date();
        completedNow = true;
      }
    }
    await this.persist();
    return { ...row, completedNow };
  }

  async getClanTask(clanId: string, periodKey: string, taskId: string): Promise<ClanTaskProgressRecord | null> {
    return (
      this.state.clanTasks.find(
        (row) => row.clanId === clanId && row.periodKey === periodKey && row.taskId === taskId,
      ) ?? null
    );
  }

  async listClanTasks(clanId: string, periodKeys: string[]): Promise<ClanTaskProgressRecord[]> {
    const wanted = new Set(periodKeys);
    return this.state.clanTasks.filter((row) => row.clanId === clanId && wanted.has(row.periodKey));
  }

  async donateToClan(input: {
    clanId: string;
    playerId: string;
    resource: ResourceType;
    amount: number;
    score: number;
    weekKey: string;
    dayKey: string;
  }): Promise<{ remaining: number; contribution: number; clan: ClanRecord }> {
    return this.withClanLock(async () => {
      const remaining = await this.addResource(input.playerId, input.resource, -input.amount);
      const contribution = await this.addContribution(input.clanId, input.playerId, input.weekKey, input.score);
      await this.addContribution(input.clanId, input.playerId, `d:${input.dayKey}`, input.score);
      const clan = await this.addClanXp(input.clanId, input.score);
      return { remaining, contribution, clan };
    });
  }

  async countClans(filter?: { createdSince?: Date; createdUntil?: Date; excludeDisbanded?: boolean }): Promise<number> {
    return this.state.clans.filter((clan) => {
      if (filter?.excludeDisbanded !== false && clan.disbandedAt) return false;
      if (filter?.createdSince && clan.createdAt < filter.createdSince) return false;
      if (filter?.createdUntil && clan.createdAt >= filter.createdUntil) return false;
      return true;
    }).length;
  }

  async countClanMembers(): Promise<number> {
    return this.state.clanMembers.length;
  }

  async countActiveClans(since: Date): Promise<number> {
    const ids = new Set<string>();
    for (const member of this.state.clanMembers) {
      const clan = this.state.clans.find((row) => row.id === member.clanId);
      if (!clan || clan.disbandedAt) continue;
      const player = this.state.players.find((row) => row.id === member.playerId);
      if (player && (player.lastActiveAt ?? player.updatedAt) >= since) ids.add(member.clanId);
    }
    return ids.size;
  }

  async clanMemberStats(): Promise<ClanMemberStats> {
    const counts = new Map<string, number>();
    for (const clan of this.state.clans) {
      if (!clan.disbandedAt) counts.set(clan.id, 0);
    }
    for (const member of this.state.clanMembers) {
      if (counts.has(member.clanId)) counts.set(member.clanId, (counts.get(member.clanId) ?? 0) + 1);
    }
    const values = [...counts.values()].sort((a, b) => a - b);
    if (!values.length) return { averageMembers: 0, medianMembers: null };
    const averageMembers = Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
    const mid = Math.floor(values.length / 2);
    const medianMembers = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
    return { averageMembers, medianMembers };
  }

  async sumContribution(periodKey: string): Promise<number> {
    return this.state.contributions
      .filter((row) => row.periodKey === periodKey)
      .reduce((sum, row) => sum + row.score, 0);
  }

  async countClanTaskCompletions(since?: Date, until?: Date): Promise<number> {
    return this.state.clanTasks.filter((row) => {
      if (!row.completedAt) return false;
      if (since && row.completedAt < since) return false;
      if (until && row.completedAt >= until) return false;
      return true;
    }).length;
  }

  async listTopClansWeekly(periodKey: string, limit: number): Promise<ClanAnalyticsTopRow[]> {
    const rows = await this.clanBoardRows(periodKey);
    return rows.slice(0, clampLimit(limit)).map((row) => {
      const clan = this.state.clans.find((entry) => entry.id === row.id)!;
      const members = this.state.clanMembers.filter((entry) => entry.clanId === clan.id).length;
      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        level: clan.level,
        weeklyScore: row.value,
        members,
      };
    });
  }

  private async clanBoardRows(periodKey: string): Promise<LeaderboardEntry[]> {
    const active = this.state.clans.filter((clan) => !clan.disbandedAt);
    const decorated = [];
    for (const clan of active) {
      const weekly = await this.clanSeasonContribution(clan.id, periodKey);
      decorated.push({
        id: clan.id,
        name: `${clan.name} [${clan.tag}] · ур.${clan.level}`,
        value: weekly,
        level: clan.level,
        createdAt: clan.createdAt,
      });
    }
    decorated.sort(
      (a, b) =>
        b.value - a.value ||
        b.level - a.level ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    return decorated.map(({ id, name, value }) => ({ id, name, value }));
  }
}

function matchQuery(row: CombatMatchRecord, query: CombatMatchQuery): boolean {
  if (query.playerId && row.playerId !== query.playerId) return false;
  if (query.opponentPlayerId && row.opponentPlayerId !== query.opponentPlayerId) return false;
  if (query.mode && row.mode !== query.mode) return false;
  if (query.enemyId && row.enemyId !== query.enemyId) return false;
  if (query.result && row.result !== query.result) return false;
  if (query.seasonId && (row.seasonId ?? 'season_0') !== query.seasonId) return false;
  if (query.since && row.startedAt < query.since) return false;
  if (query.until && row.startedAt >= query.until) return false;
  return true;
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
    statistics: [],
    ratings: [],
    bossStats: [],
    clans: [],
    clanMembers: [],
    clanApplications: [],
    contributions: [],
    clanTasks: [],
    entitlements: [],
    cosmetics: [],
    achievements: [],
    weeklyScores: [],
    listings: [],
    marketTx: [],
    auctionBids: [],
    notices: [],
  };
}

function cloneListing(listing: MarketListingRecord): MarketListingRecord {
  return {
    ...listing,
    createdAt: new Date(listing.createdAt),
    expiresAt: new Date(listing.expiresAt),
    soldAt: listing.soldAt ? new Date(listing.soldAt) : null,
    cancelledAt: listing.cancelledAt ? new Date(listing.cancelledAt) : null,
  };
}

function reviveListing(listing: MarketListingRecord): MarketListingRecord {
  return cloneListing({
    ...listing,
    requestId: listing.requestId ?? null,
    startingPrice: listing.startingPrice ?? null,
    currentBid: listing.currentBid ?? null,
    currentBidderPlayerId: listing.currentBidderPlayerId ?? null,
    buyoutPrice: listing.buyoutPrice ?? null,
    bidCount: listing.bidCount ?? 0,
    extensionCount: listing.extensionCount ?? 0,
  });
}

function reviveMarketTx(row: MarketTransactionRecord): MarketTransactionRecord {
  return { ...row, createdAt: new Date(row.createdAt), requestId: row.requestId ?? null };
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export { RewardAlreadyClaimedError };
