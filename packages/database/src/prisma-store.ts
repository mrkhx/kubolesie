import { randomUUID } from 'node:crypto';
import { STARTING_ENERGY, STARTING_HP, STARTING_STATS } from '@kubolesie/shared';
import type {
  ApplicationStatus,
  ClanRole,
  CurrencyCode,
  EquipmentSlot,
  ItemHistoryType,
  QuestStatus,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';
import type { CombatantSnapshot, BattleEvent } from '@kubolesie/combat-engine';
import { clanLevelForXp, PVP_RATING, applyPvpRating, clampLimit, clampOffset, MARKET, marketFee } from '@kubolesie/content';
import {
  ActionRejectedError,
  EMPTY_STATISTICS,
  InsufficientCoinsError,
  InsufficientResourcesError,
  NotFoundError,
  type ClanAnalyticsTopRow,
  type ClanApplicationRecord,
  type ClanMemberRecord,
  type ClanMemberStats,
  type ClanRecord,
  type ClanRosterRow,
  type ClanTaskProgressRecord,
  type CombatMatchQuery,
  type CombatMatchRecord,
  type DiscoveryRecord,
  type EntitlementRecord,
  type GameStore,
  type InventoryItemRecord,
  type LeaderboardEntry,
  type PlayerAchievementRecord,
  type PlayerBossStatRecord,
  type PlayerCosmeticRecord,
  type PlayerQuestRecord,
  type PlayerRatingRecord,
  type PlayerRecord,
  type PlayerStatisticsRecord,
  type ProcessedEventRecord,
  type PvpCandidate,
  type QuestTemplateRecord,
  type StatisticsDelta,
  type AnalyticsBossRow,
  type AnalyticsEnemyRow,
  type AnalyticsFlagCount,
  type AnalyticsLevelBucket,
  type CurrencyTransactionRecord,
  type MarketAnalyticsSnapshot,
  type MarketListingRecord,
  type MarketSearchQuery,
  type MarketTransactionRecord,
} from '@kubolesie/game-core';
import type { GameResponse } from '@kubolesie/shared';
import { Prisma, type PrismaClient } from './generated/client';

type Client = PrismaClient | Prisma.TransactionClient;

function mapPlayer(
  row: Prisma.PlayerGetPayload<{ include: { stats: true } }>,
): PlayerRecord {
  return {
    id: row.id,
    vkUserId: row.vkUserId,
    name: row.name,
    level: row.level,
    xp: row.xp,
    hp: row.hp,
    maxHp: row.maxHp,
    energy: row.energy,
    maxEnergy: row.maxEnergy,
    coins: row.coins,
    currentLocation: row.currentLocation,
    currentState: row.currentState,
    lastEnergyAt: row.lastEnergyAt,
    lastDailyReset: row.lastDailyReset,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stats: row.stats
      ? {
          attack: row.stats.attack,
          defense: row.stats.defense,
          speed: row.stats.speed,
          critChance: row.stats.critChance,
          critDamage: row.stats.critDamage,
          dodge: row.stats.dodge,
          accuracy: row.stats.accuracy,
          luck: row.stats.luck,
        }
      : { ...STARTING_STATS },
  };
}

export class PrismaGameStore implements GameStore {
  constructor(private readonly prisma: Client) {}

  async findPlayerById(id: string): Promise<PlayerRecord | null> {
    const row = await this.prisma.player.findUnique({
      where: { id },
      include: { stats: true },
    });
    return row ? mapPlayer(row) : null;
  }

  async findPlayerByVkUserId(vkUserId: string): Promise<PlayerRecord | null> {
    const row = await this.prisma.player.findUnique({
      where: { vkUserId },
      include: { stats: true },
    });
    return row ? mapPlayer(row) : null;
  }

  async createPlayer(input: { vkUserId: string; name: string }): Promise<PlayerRecord> {
    try {
      const row = await this.prisma.player.create({
        data: {
          vkUserId: input.vkUserId,
          name: input.name,
          hp: STARTING_HP,
          maxHp: STARTING_HP,
          energy: STARTING_ENERGY,
          maxEnergy: STARTING_ENERGY,
          stats: { create: { ...STARTING_STATS } },
        },
        include: { stats: true },
      });
      return mapPlayer(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findPlayerByVkUserId(input.vkUserId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async savePlayer(player: PlayerRecord): Promise<PlayerRecord> {
    const row = await this.prisma.player.update({
      where: { id: player.id },
      data: {
        name: player.name,
        level: player.level,
        xp: player.xp,
        hp: player.hp,
        maxHp: player.maxHp,
        energy: player.energy,
        maxEnergy: player.maxEnergy,
        coins: player.coins,
        currentLocation: player.currentLocation,
        currentState: player.currentState,
        lastEnergyAt: player.lastEnergyAt,
        lastDailyReset: player.lastDailyReset,
        lastActiveAt: player.lastActiveAt,
        stats: {
          update: {
            attack: player.stats.attack,
            defense: player.stats.defense,
            speed: player.stats.speed,
            critChance: player.stats.critChance,
            critDamage: player.stats.critDamage,
            dodge: player.stats.dodge,
            accuracy: player.stats.accuracy,
            luck: player.stats.luck,
          },
        },
      },
      include: { stats: true },
    });
    return mapPlayer(row);
  }

  async getResources(playerId: string) {
    const rows = await this.prisma.playerResource.findMany({ where: { playerId } });
    const result: Partial<Record<ResourceType, number>> = {};
    for (const row of rows) result[row.resource] = row.amount;
    return result;
  }

  async addResource(playerId: string, resource: ResourceType, amount: number): Promise<number> {
    if (!Number.isFinite(amount)) throw new InsufficientResourcesError();
    const delta = Math.trunc(amount);
    if (delta === 0) {
      const current = await this.prisma.playerResource.findUnique({
        where: { playerId_resource: { playerId, resource } },
      });
      return current?.amount ?? 0;
    }
    if (delta > 0) {
      const row = await this.prisma.playerResource.upsert({
        where: { playerId_resource: { playerId, resource } },
        update: { amount: { increment: delta } },
        create: { playerId, resource, amount: delta },
      });
      return row.amount;
    }
    const spend = -delta;
    const updated = await this.prisma.playerResource.updateMany({
      where: { playerId, resource, amount: { gte: spend } },
      data: { amount: { decrement: spend } },
    });
    if (updated.count !== 1) throw new InsufficientResourcesError();
    const row = await this.prisma.playerResource.findUnique({
      where: { playerId_resource: { playerId, resource } },
    });
    return row?.amount ?? 0;
  }

  async createItem(input: {
    playerId: string;
    templateId: string;
    rarity: Rarity;
    itemLevel?: number;
  }): Promise<InventoryItemRecord> {
    return this.prisma.inventoryItem.create({
      data: {
        playerId: input.playerId,
        templateId: input.templateId,
        rarity: input.rarity,
        itemLevel: input.itemLevel ?? 1,
      },
    });
  }

  async getItem(itemId: string): Promise<InventoryItemRecord | null> {
    return this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
  }

  async listItems(playerId: string): Promise<InventoryItemRecord[]> {
    return this.prisma.inventoryItem.findMany({ where: { playerId } });
  }

  async recordItemHistory(input: {
    itemId: string;
    playerId: string;
    type: ItemHistoryType;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.itemHistory.create({
      data: {
        itemId: input.itemId,
        playerId: input.playerId,
        type: input.type,
        meta: (input.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  async getEquipment(playerId: string) {
    const rows = await this.prisma.playerEquipment.findMany({ where: { playerId } });
    const result: Partial<Record<EquipmentSlot, string>> = {};
    for (const row of rows) result[row.slot] = row.itemId;
    return result;
  }

  async setEquipmentSlot(playerId: string, slot: EquipmentSlot, itemId: string | null): Promise<void> {
    if (!itemId) {
      await this.prisma.playerEquipment.deleteMany({ where: { playerId, slot } });
      return;
    }
    await this.prisma.playerEquipment.upsert({
      where: { playerId_slot: { playerId, slot } },
      update: { itemId },
      create: { playerId, slot, itemId },
    });
  }

  async getFlags(playerId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.playerFlag.findMany({ where: { playerId } });
    const flags: Record<string, string> = {};
    for (const row of rows) flags[row.flag] = row.value;
    return flags;
  }

  async setFlag(playerId: string, flag: string, value: string): Promise<void> {
    await this.prisma.playerFlag.upsert({
      where: { playerId_flag: { playerId, flag } },
      update: { value },
      create: { playerId, flag, value },
    });
  }

  async getNpcRelation(playerId: string, npcId: string) {
    const row = await this.prisma.npcRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    });
    return row ? { trust: row.trust, reputation: row.reputation } : { trust: 0, reputation: 0 };
  }

  async adjustNpcRelation(
    playerId: string,
    npcId: string,
    trustDelta: number,
    reputationDelta: number,
  ) {
    const row = await this.prisma.npcRelation.upsert({
      where: { playerId_npcId: { playerId, npcId } },
      update: { trust: { increment: trustDelta }, reputation: { increment: reputationDelta } },
      create: { playerId, npcId, trust: trustDelta, reputation: reputationDelta },
    });
    return { trust: row.trust, reputation: row.reputation };
  }

  async listQuestTemplates(): Promise<QuestTemplateRecord[]> {
    const rows = await this.prisma.questTemplate.findMany();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      defaultStatus: row.defaultStatus,
    }));
  }

  async upsertQuestTemplate(template: QuestTemplateRecord): Promise<void> {
    await this.prisma.questTemplate.upsert({
      where: { id: template.id },
      update: {
        title: template.title,
        description: template.description,
        defaultStatus: template.defaultStatus,
      },
      create: template,
    });
  }

  async getPlayerQuest(playerId: string, questId: string): Promise<PlayerQuestRecord | null> {
    const row = await this.prisma.playerQuest.findUnique({
      where: { playerId_questId: { playerId, questId } },
    });
    if (!row) return null;
    return {
      playerId: row.playerId,
      questId: row.questId,
      status: row.status,
      progress: (row.progress ?? {}) as Record<string, unknown>,
    };
  }

  async upsertPlayerQuest(record: PlayerQuestRecord): Promise<void> {
    await this.prisma.playerQuest.upsert({
      where: { playerId_questId: { playerId: record.playerId, questId: record.questId } },
      update: { status: record.status, progress: record.progress as Prisma.InputJsonValue },
      create: {
        playerId: record.playerId,
        questId: record.questId,
        status: record.status as QuestStatus,
        progress: record.progress as Prisma.InputJsonValue,
      },
    });
  }

  async findProcessedEvent(eventId: string): Promise<ProcessedEventRecord | null> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (!row) return null;
    return {
      eventId: row.eventId,
      playerId: row.playerId,
      command: row.command,
      response: row.response as unknown as ProcessedEventRecord['response'],
      createdAt: row.createdAt,
    };
  }

  async tryBeginProcessedEvent(
    record: Omit<ProcessedEventRecord, 'response'> & { response?: GameResponse },
  ): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          eventId: record.eventId,
          playerId: record.playerId,
          command: record.command,
          response: (record.response ?? { text: '', buttons: [] }) as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async completeProcessedEvent(
    eventId: string,
    response: GameResponse,
    playerId?: string | null,
  ): Promise<void> {
    await this.prisma.processedEvent
      .update({
        where: { eventId },
        data: {
          response: response as unknown as Prisma.InputJsonValue,
          ...(playerId !== undefined ? { playerId } : {}),
        },
      })
      .catch(() => undefined);
  }

  async saveProcessedEvent(record: ProcessedEventRecord): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          eventId: record.eventId,
          playerId: record.playerId,
          command: record.command,
          response: record.response as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      throw error;
    }
  }

  async tryClaimReward(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    try {
      await this.prisma.rewardClaim.create({ data: { playerId, rewardType, rewardRef } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async hasRewardClaim(playerId: string, rewardType: string, rewardRef: string): Promise<boolean> {
    const row = await this.prisma.rewardClaim.findUnique({
      where: {
        playerId_rewardType_rewardRef: { playerId, rewardType, rewardRef },
      },
    });
    return Boolean(row);
  }

  async addCurrencyTransaction(input: {
    playerId: string;
    currency: CurrencyCode;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reason: string;
    referenceId?: string;
  }): Promise<void> {
    await this.prisma.currencyTransaction.create({ data: input });
  }

  async createCombatMatch(
    input: Omit<CombatMatchRecord, 'id'> & { id?: string },
  ): Promise<CombatMatchRecord> {
    const row = await this.prisma.combatMatch.create({
      data: {
        id: input.id,
        playerId: input.playerId,
        mode: input.mode,
        enemyId: input.enemyId,
        seed: input.seed,
        balanceVersion: input.balanceVersion,
        result: input.result ?? undefined,
        playerSnapshot: input.playerSnapshot as unknown as Prisma.InputJsonValue,
        enemySnapshot: input.enemySnapshot as unknown as Prisma.InputJsonValue,
        opponentPlayerId: input.opponentPlayerId ?? null,
        seasonId: input.seasonId ?? 'season_0',
        attackerRatingBefore: input.attackerRatingBefore ?? null,
        attackerRatingAfter: input.attackerRatingAfter ?? null,
        defenderRatingBefore: input.defenderRatingBefore ?? null,
        defenderRatingAfter: input.defenderRatingAfter ?? null,
        rewardTier: input.rewardTier ?? null,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
    });
    return mapMatch(row);
  }

  async addCombatEvents(matchId: string, events: BattleEvent[]): Promise<void> {
    if (!events.length) return;
    await this.prisma.combatEvent.createMany({
      data: events.map((event) => ({
        matchId,
        turn: event.turn,
        actor: event.actor,
        type: event.type,
        value: event.value,
      })),
    });
  }

  async listCombatMatches(
    query: CombatMatchQuery & { limit: number; offset?: number },
  ): Promise<CombatMatchRecord[]> {
    const rows = await this.prisma.combatMatch.findMany({
      where: combatWhere(query),
      orderBy: { startedAt: 'desc' },
      skip: clampOffset(query.offset ?? 0),
      take: clampLimit(query.limit, 10),
    });
    return rows.map(mapMatch);
  }

  async countCombatMatches(query: CombatMatchQuery): Promise<number> {
    return this.prisma.combatMatch.count({ where: combatWhere(query) });
  }

  async listPvpCandidates(input: {
    excludePlayerId: string;
    minRating: number;
    maxRating: number;
    targetRating: number;
    unlockFlag: string;
    limit: number;
  }): Promise<PvpCandidate[]> {
    const take = clampLimit(input.limit, 24);
    const rows = await this.prisma.playerRating.findMany({
      where: {
        playerId: { not: input.excludePlayerId },
        pvpRating: { gte: input.minRating, lte: input.maxRating },
        player: { flags: { some: { flag: input.unlockFlag } } },
      },
      take: Math.min(48, take * 2),
      include: { player: { select: { id: true, name: true, level: true, lastActiveAt: true } } },
    });
    const mapped: PvpCandidate[] = rows.map((row) => ({
      playerId: row.playerId,
      name: row.player.name,
      level: row.player.level,
      pvpRating: row.pvpRating,
      lastActiveAt: row.player.lastActiveAt,
    }));
    mapped.sort(
      (a, b) =>
        Math.abs(a.pvpRating - input.targetRating) - Math.abs(b.pvpRating - input.targetRating) ||
        b.lastActiveAt.getTime() - a.lastActiveAt.getTime() ||
        a.playerId.localeCompare(b.playerId),
    );
    return mapped.slice(0, take);
  }

  async countPlayers(filter?: {
    createdSince?: Date;
    createdUntil?: Date;
    activeSince?: Date;
  }): Promise<number> {
    return this.prisma.player.count({
      where: {
        createdAt: {
          gte: filter?.createdSince,
          lt: filter?.createdUntil,
        },
        lastActiveAt: filter?.activeSince ? { gte: filter.activeSince } : undefined,
      },
    });
  }

  async countProcessedEvents(since?: Date): Promise<number> {
    return this.prisma.processedEvent.count({
      where: since ? { createdAt: { gte: since } } : undefined,
    });
  }

  async countFlags(flags: string[]): Promise<AnalyticsFlagCount[]> {
    if (!flags.length) return [];
    const rows = await this.prisma.playerFlag.groupBy({
      by: ['flag'],
      where: { flag: { in: flags } },
      _count: { _all: true },
    });
    const map = new Map(rows.map((row) => [row.flag, row._count._all]));
    return flags.map((flag) => ({ flag, count: map.get(flag) ?? 0 }));
  }

  async countPlayersWithAnyFlag(flags: string[]): Promise<number> {
    if (!flags.length) return 0;
    const rows = await this.prisma.playerFlag.findMany({
      where: { flag: { in: flags } },
      distinct: ['playerId'],
      select: { playerId: true },
    });
    return rows.length;
  }

  async countPlayersWithStat(
    field: keyof Omit<PlayerStatisticsRecord, 'playerId'>,
    min: number,
  ): Promise<number> {
    return this.prisma.playerStatistics.count({
      where: { [field]: { gte: min } },
    });
  }

  async averagePvpRating(): Promise<number> {
    const agg = await this.prisma.playerRating.aggregate({ _avg: { pvpRating: true } });
    return agg._avg.pvpRating ?? 0;
  }

  async countPvpActivePlayers(since?: Date): Promise<number> {
    const rows = await this.prisma.combatMatch.findMany({
      where: { mode: 'PVP', startedAt: since ? { gte: since } : undefined },
      select: { playerId: true, opponentPlayerId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.playerId);
      if (row.opponentPlayerId) ids.add(row.opponentPlayerId);
    }
    return ids.size;
  }

  async levelDistribution(): Promise<AnalyticsLevelBucket[]> {
    const rows = await this.prisma.player.groupBy({
      by: ['level'],
      _count: { _all: true },
      orderBy: { level: 'asc' },
    });
    return rows.map((row) => ({ level: row.level, count: row._count._all }));
  }

  async bossAggregates(): Promise<AnalyticsBossRow[]> {
    const rows = await this.prisma.playerBossStat.groupBy({
      by: ['bossId'],
      _sum: { wins: true, losses: true },
    });
    return rows.map((row) => ({
      bossId: row.bossId,
      wins: row._sum.wins ?? 0,
      losses: row._sum.losses ?? 0,
    }));
  }

  async topPveEnemies(since: Date, limit: number): Promise<AnalyticsEnemyRow[]> {
    const rows = await this.prisma.combatMatch.groupBy({
      by: ['enemyId'],
      where: { mode: 'PVE', startedAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { enemyId: 'desc' } },
      take: clampLimit(limit, 5),
    });
    return rows.map((row) => ({ enemyId: row.enemyId, count: row._count._all }));
  }

  async countReturning(createdFrom: Date, createdTo: Date, activeSince: Date): Promise<number> {
    return this.prisma.player.count({
      where: {
        createdAt: { gte: createdFrom, lt: createdTo },
        lastActiveAt: { gte: activeSince },
      },
    });
  }

  async removeItem(itemId: string): Promise<void> {
    await this.prisma.playerEquipment.deleteMany({ where: { itemId } });
    await this.prisma.inventoryItem.delete({ where: { id: itemId } }).catch(() => undefined);
  }

  async listPlayerQuests(playerId: string): Promise<PlayerQuestRecord[]> {
    const rows = await this.prisma.playerQuest.findMany({ where: { playerId } });
    return rows.map((row) => ({
      playerId: row.playerId,
      questId: row.questId,
      status: row.status,
      progress: (row.progress ?? {}) as Record<string, unknown>,
    }));
  }

  async listDiscoveries(playerId: string): Promise<DiscoveryRecord[]> {
    const rows = await this.prisma.playerDiscovery.findMany({ where: { playerId } });
    return rows.map((row) => ({
      playerId: row.playerId,
      discoveryId: row.discoveryId,
      title: row.title,
      seen: row.seen,
      defeated: row.defeated,
    }));
  }

  async upsertDiscovery(record: DiscoveryRecord): Promise<void> {
    await this.prisma.playerDiscovery.upsert({
      where: {
        playerId_discoveryId: { playerId: record.playerId, discoveryId: record.discoveryId },
      },
      update: { title: record.title, seen: record.seen, defeated: record.defeated },
      create: record,
    });
  }

  async getStatistics(playerId: string): Promise<PlayerStatisticsRecord> {
    const row = await this.prisma.playerStatistics.upsert({
      where: { playerId },
      update: {},
      create: { playerId, ...EMPTY_STATISTICS },
    });
    return mapStatistics(row);
  }

  async incrementStatistics(playerId: string, delta: StatisticsDelta): Promise<PlayerStatisticsRecord> {
    const update: Prisma.PlayerStatisticsUpdateInput = {};
    for (const [key, value] of Object.entries(delta) as [keyof StatisticsDelta, number | undefined][]) {
      if (typeof value === 'number' && value) {
        update[key] = { increment: value };
      }
    }
    const row = await this.prisma.playerStatistics.upsert({
      where: { playerId },
      update,
      create: { playerId, ...EMPTY_STATISTICS, ...sanitizeDelta(delta) },
    });
    return mapStatistics(row);
  }

  async incrementBossStat(
    playerId: string,
    bossId: string,
    field: 'wins' | 'losses',
  ): Promise<PlayerBossStatRecord> {
    const row = await this.prisma.playerBossStat.upsert({
      where: { playerId_bossId: { playerId, bossId } },
      update: { [field]: { increment: 1 } },
      create: { playerId, bossId, wins: field === 'wins' ? 1 : 0, losses: field === 'losses' ? 1 : 0 },
    });
    return { playerId: row.playerId, bossId: row.bossId, wins: row.wins, losses: row.losses };
  }

  async getRating(playerId: string): Promise<PlayerRatingRecord> {
    const row = await this.prisma.playerRating.upsert({
      where: { playerId },
      update: {},
      create: {
        playerId,
        pvpRating: PVP_RATING.start,
        lifetimeScore: 0,
        weeklyScore: 0,
        weeklyPeriod: '',
        seasonId: 'season_0',
        weeklyPvpOpponents: '',
      },
    });
    return mapRating(row);
  }

  async saveRating(record: PlayerRatingRecord): Promise<PlayerRatingRecord> {
    const clamped = {
      pvpRating: applyPvpRating(record.pvpRating, 0),
      lifetimeScore: Math.max(0, Number.isFinite(record.lifetimeScore) ? Math.floor(record.lifetimeScore) : 0),
      weeklyScore: Math.max(0, Number.isFinite(record.weeklyScore) ? Math.floor(record.weeklyScore) : 0),
      weeklyPeriod: record.weeklyPeriod,
      seasonId: record.seasonId,
      weeklyPvpOpponents: record.weeklyPvpOpponents,
    };
    const row = await this.prisma.playerRating.upsert({
      where: { playerId: record.playerId },
      update: clamped,
      create: {
        playerId: record.playerId,
        ...clamped,
      },
    });
    return mapRating(row);
  }

  async listScoreboard(
    board: 'score' | 'pvp' | 'weekly',
    periodKey: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]> {
    const take = clampLimit(limit);
    const skip = clampOffset(offset);
    if (board === 'weekly') {
      const rows = await this.prisma.playerWeeklyScore.findMany({
        where: { periodKey, score: { gt: 0 } },
        orderBy: [{ score: 'desc' }, { player: { name: 'asc' } }],
        skip,
        take,
        include: { player: { select: { name: true } } },
      });
      return rows.map((row) => ({
        id: row.playerId,
        name: row.player.name,
        value: row.score,
      }));
    }
    const field = board === 'pvp' ? 'pvpRating' : 'lifetimeScore';
    const rows = await this.prisma.playerRating.findMany({
      orderBy: [{ [field]: 'desc' }, { player: { name: 'asc' } }],
      skip,
      take,
      include: { player: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.playerId,
      name: row.player.name,
      value: row[field],
    }));
  }

  async getScoreboardRank(
    board: 'score' | 'pvp' | 'weekly',
    playerId: string,
    periodKey: string,
  ): Promise<number> {
    if (board === 'weekly') {
      const value = await this.getWeeklyScore(playerId, periodKey);
      if (value <= 0) return 0;
      const player = await this.findPlayerById(playerId);
      const name = player?.name ?? '';
      const higher = await this.prisma.playerWeeklyScore.count({
        where: {
          periodKey,
          OR: [
            { score: { gt: value } },
            { AND: [{ score: value }, { player: { name: { lt: name } } }] },
          ],
        },
      });
      return higher + 1;
    }
    const mine = await this.getRating(playerId);
    const field = board === 'pvp' ? 'pvpRating' : 'lifetimeScore';
    const value = mine[field];
    const player = await this.findPlayerById(playerId);
    const name = player?.name ?? '';
    const higher = await this.prisma.playerRating.count({
      where: {
        OR: [
          { [field]: { gt: value } },
          { AND: [{ [field]: value }, { player: { name: { lt: name } } }] },
        ],
      },
    });
    return higher + 1;
  }

  async upsertWeeklyScore(playerId: string, periodKey: string, score: number): Promise<void> {
    const safe = Math.max(0, Number.isFinite(score) ? Math.floor(score) : 0);
    await this.prisma.playerWeeklyScore.upsert({
      where: { playerId_periodKey: { playerId, periodKey } },
      update: { score: safe },
      create: { playerId, periodKey, score: safe },
    });
  }

  async incrementWeeklyScore(playerId: string, periodKey: string, delta: number): Promise<number> {
    const safe = Math.max(0, Number.isFinite(delta) ? Math.floor(delta) : 0);
    const rows = await this.prisma.$queryRaw<Array<{ score: number }>>`
      INSERT INTO "player_weekly_scores" ("id", "player_id", "period_key", "score")
      VALUES (${randomUUID()}, ${playerId}, ${periodKey}, ${safe})
      ON CONFLICT ("player_id", "period_key")
      DO UPDATE SET "score" = "player_weekly_scores"."score" + EXCLUDED."score"
      RETURNING "score"
    `;
    return rows[0]?.score ?? safe;
  }

  async getWeeklyScore(playerId: string, periodKey: string): Promise<number> {
    const row = await this.prisma.playerWeeklyScore.findUnique({
      where: { playerId_periodKey: { playerId, periodKey } },
    });
    return row?.score ?? 0;
  }

  async createClan(input: {
    name: string;
    tag: string;
    description: string;
    leaderPlayerId: string;
    cost?: number;
  }): Promise<ClanRecord> {
    try {
      return await this.withTx(async (tx) => {
        const existing = await tx.clanMember.findUnique({ where: { playerId: input.leaderPlayerId } });
        if (existing) throw new Error('already_in_clan');
        const cost = Number.isFinite(input.cost) ? Math.max(0, Math.floor(input.cost ?? 0)) : 0;
        if (cost) {
          const paid = await tx.player.updateMany({
            where: { id: input.leaderPlayerId, coins: { gte: cost } },
            data: { coins: { decrement: cost } },
          });
          if (paid.count !== 1) throw new Error('insufficient_coins');
          const player = await tx.player.findUnique({ where: { id: input.leaderPlayerId } });
          if (player) {
            await tx.currencyTransaction.create({
              data: {
                playerId: player.id,
                currency: 'COINS',
                amount: -cost,
                balanceBefore: player.coins + cost,
                balanceAfter: player.coins,
                reason: 'clan_create',
              },
            });
          }
        }
        const clan = await tx.clan.create({
          data: {
            name: input.name,
            nameKey: input.name.toLowerCase(),
            tag: input.tag,
            tagKey: input.tag.toLowerCase(),
            description: input.description,
            leaderPlayerId: input.leaderPlayerId,
            members: {
              create: { playerId: input.leaderPlayerId, role: 'LEADER' },
            },
          },
        });
        return mapClan(clan);
      });
    } catch (error) {
      throw mapClanError(error);
    }
  }

  async getClan(clanId: string): Promise<ClanRecord | null> {
    const row = await this.prisma.clan.findUnique({ where: { id: clanId } });
    return row ? mapClan(row) : null;
  }

  async findClanByNameKey(nameKey: string): Promise<ClanRecord | null> {
    const row = await this.prisma.clan.findUnique({ where: { nameKey } });
    return row ? mapClan(row) : null;
  }

  async findClanByTagKey(tagKey: string): Promise<ClanRecord | null> {
    const row = await this.prisma.clan.findUnique({ where: { tagKey } });
    return row ? mapClan(row) : null;
  }

  async getPlayerClan(playerId: string): Promise<{ clan: ClanRecord; member: ClanMemberRecord } | null> {
    const member = await this.prisma.clanMember.findUnique({
      where: { playerId },
      include: { clan: true },
    });
    if (!member) return null;
    const clan = mapClan(member.clan);
    if (clan.disbandedAt) return null;
    return { clan, member: mapMember(member) };
  }

  async listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]> {
    const needle = query.trim();
    const take = clampLimit(limit, 5);
    const skip = clampOffset(offset);
    const rows = await this.prisma.clan.findMany({
      where: {
        disbandedAt: null,
        ...(needle
          ? {
              OR: [
                { name: { contains: needle, mode: 'insensitive' } },
                { tag: { contains: needle, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { xp: 'desc' },
      skip,
      take,
    });
    return rows.map(mapClan);
  }

  async addClanXp(clanId: string, amount: number): Promise<ClanRecord> {
    const add = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    const row = await this.prisma.clan.update({
      where: { id: clanId },
      data: { xp: { increment: add } },
    });
    const level = clanLevelForXp(row.xp);
    if (row.level === level) return mapClan(row);
    const next = await this.prisma.clan.update({
      where: { id: clanId },
      data: { level },
    });
    return mapClan(next);
  }

  async listClanMembers(clanId: string): Promise<ClanMemberRecord[]> {
    const rows = await this.prisma.clanMember.findMany({ where: { clanId } });
    return rows.map(mapMember);
  }

  async addClanMember(input: {
    clanId: string;
    playerId: string;
    role: ClanRole;
    maxMembers?: number;
  }): Promise<ClanMemberRecord> {
    try {
      return await this.withTx(async (tx) => {
        await tx.$queryRaw`SELECT id FROM clans WHERE id = ${input.clanId} FOR UPDATE`;
        if (input.maxMembers) {
          const count = await tx.clanMember.count({ where: { clanId: input.clanId } });
          if (count >= input.maxMembers) throw new Error('clan_full');
        }
        const row = await tx.clanMember.create({
          data: { clanId: input.clanId, playerId: input.playerId, role: input.role },
        });
        return mapMember(row);
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'clan_full') throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('already_in_clan');
      }
      throw error;
    }
  }

  async removeClanMember(clanId: string, playerId: string): Promise<void> {
    await this.prisma.clanMember.deleteMany({ where: { clanId, playerId } });
  }

  async setClanMemberRole(clanId: string, playerId: string, role: ClanRole): Promise<void> {
    const result = await this.prisma.clanMember.updateMany({
      where: { clanId, playerId },
      data: { role },
    });
    if (result.count === 0) throw new Error('not_member');
  }

  async setClanLeader(clanId: string, playerId: string): Promise<void> {
    await this.withTx(async (tx) => {
      const clan = await tx.clan.findUnique({ where: { id: clanId } });
      if (!clan) throw new Error('clan_missing');
      const next = await tx.clanMember.findFirst({ where: { clanId, playerId } });
      if (!next) throw new Error('not_member');
      await tx.clanMember.updateMany({
        where: { clanId, playerId: clan.leaderPlayerId },
        data: { role: 'OFFICER' },
      });
      await tx.clanMember.update({ where: { playerId }, data: { role: 'LEADER' } });
      await tx.clan.update({ where: { id: clanId }, data: { leaderPlayerId: playerId } });
    });
  }

  async deleteClan(clanId: string): Promise<void> {
    await this.disbandClan(clanId);
  }

  async disbandClan(clanId: string): Promise<void> {
    await this.withTx(async (tx) => {
      await tx.clan.update({ where: { id: clanId }, data: { disbandedAt: new Date() } });
      await tx.clanMember.deleteMany({ where: { clanId } });
      await tx.clanApplication.updateMany({
        where: { clanId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
  }

  async createApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord> {
    try {
      return await this.withTx(async (tx) => {
        const pending = await tx.clanApplication.findFirst({
          where: { playerId, status: 'PENDING' },
        });
        if (pending) throw new Error('duplicate_application');
        const row = await tx.clanApplication.create({
          data: { clanId, playerId, status: 'PENDING' },
        });
        return mapApplication(row);
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'duplicate_application') throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('duplicate_application');
      }
      throw error;
    }
  }

  async getApplication(id: string): Promise<ClanApplicationRecord | null> {
    const row = await this.prisma.clanApplication.findUnique({ where: { id } });
    return row ? mapApplication(row) : null;
  }

  async getPendingApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord | null> {
    const row = await this.prisma.clanApplication.findFirst({
      where: { clanId, playerId, status: 'PENDING' },
    });
    return row ? mapApplication(row) : null;
  }

  async listPendingApplications(clanId: string): Promise<ClanApplicationRecord[]> {
    const rows = await this.prisma.clanApplication.findMany({
      where: { clanId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapApplication);
  }

  async listPlayerApplications(playerId: string): Promise<ClanApplicationRecord[]> {
    const rows = await this.prisma.clanApplication.findMany({ where: { playerId } });
    return rows.map(mapApplication);
  }

  async setApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
    await this.prisma.clanApplication.update({ where: { id }, data: { status } });
  }

  async cancelPendingApplications(playerId: string): Promise<void> {
    await this.prisma.clanApplication.updateMany({
      where: { playerId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  }

  async addContribution(
    clanId: string,
    playerId: string,
    periodKey: string,
    amount: number,
  ): Promise<number> {
    const row = await this.prisma.clanContribution.upsert({
      where: { clanId_playerId_periodKey: { clanId, playerId, periodKey } },
      update: { score: { increment: amount } },
      create: { clanId, playerId, periodKey, score: amount },
    });
    return row.score;
  }

  async getContribution(clanId: string, playerId: string, periodKey: string): Promise<number> {
    const row = await this.prisma.clanContribution.findUnique({
      where: { clanId_playerId_periodKey: { clanId, playerId, periodKey } },
    });
    return row?.score ?? 0;
  }

  async clanSeasonContribution(clanId: string, periodKey: string): Promise<number> {
    const agg = await this.prisma.clanContribution.aggregate({
      where: { clanId, periodKey },
      _sum: { score: true },
    });
    return agg._sum.score ?? 0;
  }

  async listClanLeaderboard(
    periodKey: string,
    limit: number,
    offset: number,
  ): Promise<LeaderboardEntry[]> {
    const take = clampLimit(limit);
    const skip = clampOffset(offset);
    const rows = await this.clanBoardRows(periodKey);
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
    try {
      await this.prisma.playerEntitlement.create({
        data: {
          playerId,
          productId,
          source,
          externalTransactionId: externalTransactionId ?? null,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async listEntitlements(playerId: string): Promise<EntitlementRecord[]> {
    const rows = await this.prisma.playerEntitlement.findMany({ where: { playerId } });
    return rows.map((row) => ({
      playerId: row.playerId,
      productId: row.productId,
      grantedAt: row.grantedAt,
      source: row.source,
      externalTransactionId: row.externalTransactionId,
    }));
  }

  async hasEntitlement(playerId: string, productId: string): Promise<boolean> {
    const row = await this.prisma.playerEntitlement.findUnique({
      where: { playerId_productId: { playerId, productId } },
    });
    return Boolean(row);
  }

  async getCosmetics(playerId: string): Promise<PlayerCosmeticRecord> {
    const row = await this.prisma.playerCosmetic.upsert({
      where: { playerId },
      update: {},
      create: { playerId },
    });
    return {
      playerId: row.playerId,
      profileFrame: row.profileFrame,
      title: row.title,
      badge: row.badge,
      campTheme: row.campTheme,
      chatBadge: row.chatBadge,
    };
  }

  async setCosmetic(
    playerId: string,
    slot: keyof Omit<PlayerCosmeticRecord, 'playerId'>,
    productId: string | null,
  ): Promise<void> {
    await this.getCosmetics(playerId);
    await this.prisma.playerCosmetic.update({
      where: { playerId },
      data: { [slot]: productId },
    });
  }

  async tryGrantAchievement(playerId: string, achievementId: string): Promise<boolean> {
    try {
      await this.prisma.playerAchievement.create({ data: { playerId, achievementId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async listAchievements(playerId: string): Promise<PlayerAchievementRecord[]> {
    const rows = await this.prisma.playerAchievement.findMany({ where: { playerId } });
    return rows.map((row) => ({
      playerId: row.playerId,
      achievementId: row.achievementId,
      grantedAt: row.grantedAt,
    }));
  }

  async setClanDescription(clanId: string, description: string): Promise<ClanRecord> {
    const row = await this.prisma.clan.update({ where: { id: clanId }, data: { description } });
    return mapClan(row);
  }

  async listClanRoster(clanId: string, periodKey: string): Promise<ClanRosterRow[]> {
    const members = await this.prisma.clanMember.findMany({
      where: { clanId },
      include: { player: { select: { name: true, level: true, lastActiveAt: true } } },
    });
    const sums = await this.prisma.clanContribution.groupBy({
      by: ['playerId'],
      where: { clanId, periodKey },
      _sum: { score: true },
    });
    const weekly = new Map(sums.map((row) => [row.playerId, row._sum.score ?? 0]));
    const rows = members.map((row) => ({
      member: mapMember(row),
      name: row.player.name,
      level: row.player.level,
      lastActiveAt: row.player.lastActiveAt,
      weeklyContribution: weekly.get(row.playerId) ?? 0,
    }));
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
    const existing = await this.prisma.clanTaskProgress.findUnique({
      where: { clanId_periodKey_taskId: { clanId, periodKey, taskId } },
    });
    if (existing?.completedAt) return { ...mapTask(existing), completedNow: false };
    const row = await this.prisma.clanTaskProgress.upsert({
      where: { clanId_periodKey_taskId: { clanId, periodKey, taskId } },
      update: {
        target,
        progress: { increment: add },
      },
      create: { clanId, periodKey, taskId, progress: add, target },
    });
    if (!row.completedAt && row.progress >= target) {
      const done = await this.prisma.clanTaskProgress.updateMany({
        where: { id: row.id, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (done.count) {
        return { ...mapTask(row), progress: row.progress, completedAt: new Date(), completedNow: true };
      }
    }
    return { ...mapTask(row), completedNow: false };
  }

  async getClanTask(clanId: string, periodKey: string, taskId: string): Promise<ClanTaskProgressRecord | null> {
    const row = await this.prisma.clanTaskProgress.findUnique({
      where: { clanId_periodKey_taskId: { clanId, periodKey, taskId } },
    });
    return row ? mapTask(row) : null;
  }

  async listClanTasks(clanId: string, periodKeys: string[]): Promise<ClanTaskProgressRecord[]> {
    const rows = await this.prisma.clanTaskProgress.findMany({
      where: { clanId, periodKey: { in: periodKeys } },
    });
    return rows.map(mapTask);
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
    return this.withTx(async (tx) => {
      const spend = input.amount;
      const updated = await tx.playerResource.updateMany({
        where: { playerId: input.playerId, resource: input.resource, amount: { gte: spend } },
        data: { amount: { decrement: spend } },
      });
      if (updated.count !== 1) throw new InsufficientResourcesError();
      const remainingRow = await tx.playerResource.findUnique({
        where: { playerId_resource: { playerId: input.playerId, resource: input.resource } },
      });
      const remaining = remainingRow?.amount ?? 0;
      const week = await tx.clanContribution.upsert({
        where: {
          clanId_playerId_periodKey: { clanId: input.clanId, playerId: input.playerId, periodKey: input.weekKey },
        },
        update: { score: { increment: input.score } },
        create: { clanId: input.clanId, playerId: input.playerId, periodKey: input.weekKey, score: input.score },
      });
      await tx.clanContribution.upsert({
        where: {
          clanId_playerId_periodKey: {
            clanId: input.clanId,
            playerId: input.playerId,
            periodKey: `d:${input.dayKey}`,
          },
        },
        update: { score: { increment: input.score } },
        create: {
          clanId: input.clanId,
          playerId: input.playerId,
          periodKey: `d:${input.dayKey}`,
          score: input.score,
        },
      });
      const clanRow = await tx.clan.update({
        where: { id: input.clanId },
        data: { xp: { increment: input.score } },
      });
      const level = clanLevelForXp(clanRow.xp);
      const clan =
        clanRow.level === level
          ? clanRow
          : await tx.clan.update({ where: { id: input.clanId }, data: { level } });
      return { remaining, contribution: week.score, clan: mapClan(clan) };
    });
  }

  async countClans(filter?: { createdSince?: Date; createdUntil?: Date; excludeDisbanded?: boolean }): Promise<number> {
    return this.prisma.clan.count({
      where: {
        disbandedAt: filter?.excludeDisbanded === false ? undefined : null,
        createdAt: { gte: filter?.createdSince, lt: filter?.createdUntil },
      },
    });
  }

  async countClanMembers(): Promise<number> {
    return this.prisma.clanMember.count();
  }

  async countActiveClans(since: Date): Promise<number> {
    return this.prisma.clan.count({
      where: {
        disbandedAt: null,
        members: { some: { player: { lastActiveAt: { gte: since } } } },
      },
    });
  }

  async clanMemberStats(): Promise<ClanMemberStats> {
    const groups = await this.prisma.clanMember.groupBy({ by: ['clanId'], _count: { _all: true } });
    const clanCount = await this.prisma.clan.count({ where: { disbandedAt: null } });
    const values = groups.map((row) => row._count._all).sort((a, b) => a - b);
    while (values.length < clanCount) values.unshift(0);
    if (!values.length) return { averageMembers: 0, medianMembers: null };
    const averageMembers = Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
    const mid = Math.floor(values.length / 2);
    const medianMembers = values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
    return { averageMembers, medianMembers };
  }

  async sumContribution(periodKey: string): Promise<number> {
    const agg = await this.prisma.clanContribution.aggregate({
      where: { periodKey },
      _sum: { score: true },
    });
    return agg._sum.score ?? 0;
  }

  async countClanTaskCompletions(since?: Date, until?: Date): Promise<number> {
    return this.prisma.clanTaskProgress.count({
      where: {
        completedAt: since || until ? { gte: since, lt: until } : { not: null },
      },
    });
  }

  async listTopClansWeekly(periodKey: string, limit: number): Promise<ClanAnalyticsTopRow[]> {
    const rows = await this.clanBoardRows(periodKey);
    const take = clampLimit(limit);
    const top = rows.slice(0, take);
    const ids = top.map((row) => row.id);
    if (!ids.length) return [];
    const clans = await this.prisma.clan.findMany({ where: { id: { in: ids } } });
    const counts = await this.prisma.clanMember.groupBy({
      by: ['clanId'],
      where: { clanId: { in: ids } },
      _count: { _all: true },
    });
    const byId = new Map(clans.map((clan) => [clan.id, clan]));
    const members = new Map(counts.map((row) => [row.clanId, row._count._all]));
    return top.map((row) => {
      const clan = byId.get(row.id)!;
      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        level: clan.level,
        weeklyScore: row.value,
        members: members.get(clan.id) ?? 0,
      };
    });
  }

  private async clanBoardRows(periodKey: string): Promise<LeaderboardEntry[]> {
    const clans = await this.prisma.clan.findMany({
      where: { disbandedAt: null },
      select: { id: true, name: true, tag: true, level: true, createdAt: true },
    });
    const sums = await this.prisma.clanContribution.groupBy({
      by: ['clanId'],
      where: { periodKey },
      _sum: { score: true },
    });
    const weekly = new Map(sums.map((row) => [row.clanId, row._sum.score ?? 0]));
    const rows = clans.map((clan) => ({
      id: clan.id,
      name: `${clan.name} [${clan.tag}] · ур.${clan.level}`,
      value: weekly.get(clan.id) ?? 0,
      level: clan.level,
      createdAt: clan.createdAt,
    }));
    rows.sort(
      (a, b) =>
        b.value - a.value ||
        b.level - a.level ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    return rows.map(({ id, name, value }) => ({ id, name, value }));
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
  }): Promise<MarketListingRecord> {
    if (input.listingType !== 'FIXED_PRICE') {
      throw new ActionRejectedError('Аукцион ещё не открыт.');
    }
    const now = input.now ?? new Date();
    try {
      return await this.withTx(async (tx) => {
        await expireDueInTx(tx, now);
        if (input.requestId) {
          const existing = await tx.marketListing.findFirst({ where: { requestId: input.requestId } });
          if (existing) return mapListing(existing);
        }
        const seller = await tx.player.findUnique({ where: { id: input.sellerPlayerId } });
        if (!seller) throw new NotFoundError('Игрок не найден.');
        const active = await tx.marketListing.count({
          where: { sellerPlayerId: input.sellerPlayerId, status: 'ACTIVE' },
        });
        if (active >= MARKET.maxActiveListingsPerPlayer) {
          throw new ActionRejectedError(`Не больше ${MARKET.maxActiveListingsPerPlayer} активных лотов.`);
        }
        await debitResourceInTx(tx, input.sellerPlayerId, input.assetRef as ResourceType, input.quantity);
        const row = await tx.marketListing.create({
          data: {
            sellerPlayerId: input.sellerPlayerId,
            listingType: 'FIXED_PRICE',
            assetKind: 'RESOURCE',
            assetRef: input.assetRef,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            totalPrice: input.totalPrice,
            status: 'ACTIVE',
            createdAt: now,
            expiresAt: input.expiresAt,
            requestId: input.requestId,
          },
        });
        return mapListing(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && input.requestId) {
        const existing = await this.prisma.marketListing.findFirst({ where: { requestId: input.requestId } });
        if (existing) return mapListing(existing);
      }
      throw error;
    }
  }

  async cancelListing(input: {
    listingId: string;
    sellerPlayerId: string;
    now?: Date;
  }): Promise<MarketListingRecord> {
    const now = input.now ?? new Date();
    return this.withTx(async (tx) => {
      await lockListing(tx, input.listingId);
      await expireDueInTx(tx, now, input.listingId);
      const listing = await tx.marketListing.findUnique({ where: { id: input.listingId } });
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.sellerPlayerId !== input.sellerPlayerId) {
        throw new ActionRejectedError('Это не твой лот.');
      }
      if (listing.status === 'CANCELLED') return mapListing(listing);
      if (listing.status !== 'ACTIVE') throw new ActionRejectedError('Лот уже закрыт.');
      await creditResourceInTx(tx, listing.sellerPlayerId, listing.assetRef as ResourceType, listing.quantity);
      const updated = await tx.marketListing.updateMany({
        where: { id: listing.id, status: 'ACTIVE' },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      if (updated.count !== 1) throw new ActionRejectedError('Лот уже закрыт.');
      const row = await tx.marketListing.findUnique({ where: { id: listing.id } });
      return mapListing(row!);
    });
  }

  async buyFixedListing(input: {
    listingId: string;
    buyerPlayerId: string;
    requestId?: string;
    now?: Date;
  }): Promise<{ listing: MarketListingRecord; transaction: MarketTransactionRecord }> {
    const now = input.now ?? new Date();
    try {
      return await this.withTx(async (tx) => {
        if (input.requestId) {
          const existingTx = await tx.marketTransaction.findFirst({ where: { requestId: input.requestId } });
          if (existingTx) {
            const listing = await tx.marketListing.findUnique({ where: { id: existingTx.listingId } });
            return { listing: mapListing(listing!), transaction: mapMarketTx(existingTx) };
          }
        }
        await lockListing(tx, input.listingId);
        await expireDueInTx(tx, now, input.listingId);
        const listing = await tx.marketListing.findUnique({ where: { id: input.listingId } });
        if (!listing) throw new NotFoundError('Лот не найден.');
        if (listing.status === 'EXPIRED') throw new ActionRejectedError('Лот истёк.');
        if (listing.status !== 'ACTIVE') throw new ActionRejectedError('Лот уже закрыт.');
        if (listing.sellerPlayerId === input.buyerPlayerId) {
          throw new ActionRejectedError('Нельзя купить свой лот.');
        }
        const buyer = await tx.player.findUnique({ where: { id: input.buyerPlayerId } });
        const seller = await tx.player.findUnique({ where: { id: listing.sellerPlayerId } });
        if (!buyer || !seller) throw new NotFoundError('Игрок не найден.');
        const gross = listing.totalPrice;
        const fee = marketFee(gross);
        const net = gross - fee;
        if (seller.coins + net > MARKET.intMax) throw new ActionRejectedError('Переполнение монет.');
        const paid = await tx.player.updateMany({
          where: { id: buyer.id, coins: { gte: gross } },
          data: { coins: { decrement: gross } },
        });
        if (paid.count !== 1) throw new InsufficientCoinsError('Не хватает монет.');
        await tx.player.update({ where: { id: seller.id }, data: { coins: { increment: net } } });
        await creditResourceInTx(tx, buyer.id, listing.assetRef as ResourceType, listing.quantity);
        const claimed = await tx.marketListing.updateMany({
          where: { id: listing.id, status: 'ACTIVE' },
          data: { status: 'SOLD', buyerPlayerId: buyer.id, soldAt: now },
        });
        if (claimed.count !== 1) throw new ActionRejectedError('Лот уже закрыт.');
        const transaction = await tx.marketTransaction.create({
          data: {
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
            requestId: input.requestId,
          },
        });
        await tx.currencyTransaction.create({
          data: {
            playerId: buyer.id,
            currency: 'COINS',
            amount: -gross,
            balanceBefore: buyer.coins,
            balanceAfter: buyer.coins - gross,
            reason: 'market_buy',
            referenceId: listing.id,
          },
        });
        await tx.currencyTransaction.create({
          data: {
            playerId: seller.id,
            currency: 'COINS',
            amount: net,
            balanceBefore: seller.coins,
            balanceAfter: seller.coins + net,
            reason: 'market_sell',
            referenceId: listing.id,
          },
        });
        await tx.playerStatistics.upsert({
          where: { playerId: buyer.id },
          update: { tradesCompleted: { increment: 1 }, coinsSpent: { increment: gross } },
          create: { playerId: buyer.id, tradesCompleted: 1, coinsSpent: gross },
        });
        await tx.playerStatistics.upsert({
          where: { playerId: seller.id },
          update: { tradesCompleted: { increment: 1 }, coinsEarned: { increment: net } },
          create: { playerId: seller.id, tradesCompleted: 1, coinsEarned: net },
        });
        const sold = await tx.marketListing.findUnique({ where: { id: listing.id } });
        return { listing: mapListing(sold!), transaction: mapMarketTx(transaction) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && input.requestId) {
        const existingTx = await this.prisma.marketTransaction.findFirst({ where: { requestId: input.requestId } });
        if (existingTx) {
          const listing = await this.prisma.marketListing.findUnique({ where: { id: existingTx.listingId } });
          if (listing) return { listing: mapListing(listing), transaction: mapMarketTx(existingTx) };
        }
      }
      throw error;
    }
  }

  async expireListing(listingId: string, now?: Date): Promise<MarketListingRecord> {
    const at = now ?? new Date();
    return this.withTx(async (tx) => {
      await lockListing(tx, listingId);
      const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!listing) throw new NotFoundError('Лот не найден.');
      if (listing.status === 'EXPIRED') return mapListing(listing);
      if (listing.status !== 'ACTIVE') throw new ActionRejectedError('Лот уже закрыт.');
      if (listing.expiresAt > at) throw new ActionRejectedError('Срок лота ещё не вышел.');
      await expireOneInTx(tx, listing, at);
      const row = await tx.marketListing.findUnique({ where: { id: listingId } });
      return mapListing(row!);
    });
  }

  async expireDueListings(now?: Date): Promise<number> {
    const at = now ?? new Date();
    return this.withTx(async (tx) => expireDueInTx(tx, at));
  }

  async getListing(listingId: string): Promise<MarketListingRecord | null> {
    const row = await this.prisma.marketListing.findUnique({ where: { id: listingId } });
    return row ? mapListing(row) : null;
  }

  async getOwnListings(sellerPlayerId: string): Promise<MarketListingRecord[]> {
    await this.expireDueListings();
    const rows = await this.prisma.marketListing.findMany({
      where: { sellerPlayerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapListing);
  }

  async searchActiveListings(query: MarketSearchQuery, now?: Date): Promise<MarketListingRecord[]> {
    const at = now ?? new Date();
    await this.expireDueListings(at);
    const limit = clampLimit(query.limit);
    const offset = clampOffset(query.offset ?? 0);
    const orderBy =
      query.sort === 'price_desc'
        ? [{ unitPrice: 'desc' as const }, { createdAt: 'asc' as const }]
        : query.sort === 'created_desc'
          ? [{ createdAt: 'desc' as const }]
          : [{ unitPrice: 'asc' as const }, { createdAt: 'asc' as const }];
    const rows = await this.prisma.marketListing.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: at },
        assetRef: query.assetRef,
        unitPrice: {
          gte: Number.isFinite(query.minPrice) ? query.minPrice : undefined,
          lte: Number.isFinite(query.maxPrice) ? query.maxPrice : undefined,
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    });
    return rows.map(mapListing);
  }

  async listMarketTransactions(listingId: string): Promise<MarketTransactionRecord[]> {
    const rows = await this.prisma.marketTransaction.findMany({ where: { listingId } });
    return rows.map(mapMarketTx);
  }

  async listCurrencyTransactions(playerId: string, referenceId?: string): Promise<CurrencyTransactionRecord[]> {
    const rows = await this.prisma.currencyTransaction.findMany({
      where: { playerId, referenceId: referenceId ?? undefined },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      playerId: row.playerId,
      currency: row.currency,
      amount: row.amount,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      referenceId: row.referenceId ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  async getMarketAnalytics(now?: Date): Promise<MarketAnalyticsSnapshot> {
    const at = now ?? new Date();
    await this.expireDueListings(at);
    const today = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const d7 = new Date(at.getTime() - 7 * 86_400_000);
    const [activeListings, listingsCreatedToday, listingsCreated7d, todayAgg, weekAgg, sellers, buyers] =
      await Promise.all([
        this.prisma.marketListing.count({ where: { status: 'ACTIVE', expiresAt: { gt: at } } }),
        this.prisma.marketListing.count({ where: { createdAt: { gte: today } } }),
        this.prisma.marketListing.count({ where: { createdAt: { gte: d7 } } }),
        this.prisma.marketTransaction.aggregate({
          where: { createdAt: { gte: today } },
          _count: { _all: true },
          _sum: { grossPrice: true, fee: true },
        }),
        this.prisma.marketTransaction.aggregate({
          where: { createdAt: { gte: d7 } },
          _count: { _all: true },
          _sum: { grossPrice: true, fee: true },
        }),
        this.prisma.marketTransaction.findMany({
          where: { createdAt: { gte: d7 } },
          select: { sellerPlayerId: true },
          distinct: ['sellerPlayerId'],
        }),
        this.prisma.marketTransaction.findMany({
          where: { createdAt: { gte: d7 } },
          select: { buyerPlayerId: true },
          distinct: ['buyerPlayerId'],
        }),
      ]);
    return {
      activeListings,
      listingsCreatedToday,
      listingsCreated7d,
      completedTradesToday: todayAgg._count._all,
      completedTrades7d: weekAgg._count._all,
      grossVolumeToday: todayAgg._sum.grossPrice ?? 0,
      grossVolume7d: weekAgg._sum.grossPrice ?? 0,
      feesBurnedToday: todayAgg._sum.fee ?? 0,
      feesBurned7d: weekAgg._sum.fee ?? 0,
      uniqueSellers7d: sellers.length,
      uniqueBuyers7d: buyers.length,
    };
  }

  private async withTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if ('$transaction' in this.prisma && typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction((tx) => fn(tx));
    }
    return fn(this.prisma as Prisma.TransactionClient);
  }
}

function mapStatistics(row: {
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
}): PlayerStatisticsRecord {
  return {
    playerId: row.playerId,
    pveWins: row.pveWins,
    pveLosses: row.pveLosses,
    pvpWins: row.pvpWins,
    pvpLosses: row.pvpLosses,
    bossWins: row.bossWins,
    bossLosses: row.bossLosses,
    craftedItems: row.craftedItems,
    resourcesGathered: row.resourcesGathered,
    itemsLooted: row.itemsLooted,
    rareItemsFound: row.rareItemsFound,
    coinsEarned: row.coinsEarned,
    coinsSpent: row.coinsSpent,
    tradesCompleted: row.tradesCompleted,
    questsCompleted: row.questsCompleted,
    dailyQuestsCompleted: row.dailyQuestsCompleted,
    daysCompleted: row.daysCompleted,
  };
}

function mapRating(row: {
  playerId: string;
  pvpRating: number;
  lifetimeScore: number;
  weeklyScore: number;
  weeklyPeriod: string;
  seasonId: string;
  weeklyPvpOpponents: string;
}): PlayerRatingRecord {
  return {
    playerId: row.playerId,
    pvpRating: row.pvpRating,
    lifetimeScore: row.lifetimeScore,
    weeklyScore: row.weeklyScore,
    weeklyPeriod: row.weeklyPeriod,
    seasonId: row.seasonId,
    weeklyPvpOpponents: row.weeklyPvpOpponents,
  };
}

function mapClan(row: {
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
  disbandedAt?: Date | null;
}): ClanRecord {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.nameKey,
    tag: row.tag,
    tagKey: row.tagKey,
    description: row.description,
    leaderPlayerId: row.leaderPlayerId,
    level: row.level,
    xp: row.xp,
    createdAt: row.createdAt,
    disbandedAt: row.disbandedAt ?? null,
  };
}

function mapTask(row: {
  clanId: string;
  periodKey: string;
  taskId: string;
  progress: number;
  target: number;
  completedAt: Date | null;
}): ClanTaskProgressRecord {
  return {
    clanId: row.clanId,
    periodKey: row.periodKey,
    taskId: row.taskId,
    progress: row.progress,
    target: row.target,
    completedAt: row.completedAt,
  };
}

function mapMember(row: {
  id: string;
  clanId: string;
  playerId: string;
  role: ClanRole;
  joinedAt: Date;
}): ClanMemberRecord {
  return {
    id: row.id,
    clanId: row.clanId,
    playerId: row.playerId,
    role: row.role,
    joinedAt: row.joinedAt,
  };
}

function mapApplication(row: {
  id: string;
  clanId: string;
  playerId: string;
  status: ApplicationStatus;
  createdAt: Date;
}): ClanApplicationRecord {
  return {
    id: row.id,
    clanId: row.clanId,
    playerId: row.playerId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function sanitizeDelta(delta: StatisticsDelta): StatisticsDelta {
  const clean: StatisticsDelta = {};
  for (const [key, value] of Object.entries(delta) as [keyof StatisticsDelta, number | undefined][]) {
    if (typeof value === 'number' && value) clean[key] = value;
  }
  return clean;
}

function mapClanError(error: unknown): Error {
  if (error instanceof Error && error.message === 'already_in_clan') return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta?.target ?? '');
    if (target.includes('name_key')) return new Error('name_taken');
    if (target.includes('tag_key')) return new Error('tag_taken');
    if (target.includes('player_id')) return new Error('already_in_clan');
  }
  return error instanceof Error ? error : new Error('clan_error');
}

function combatWhere(query: CombatMatchQuery): Prisma.CombatMatchWhereInput {
  return {
    playerId: query.playerId,
    opponentPlayerId: query.opponentPlayerId,
    mode: query.mode,
    enemyId: query.enemyId,
    result: query.result,
    seasonId: query.seasonId,
    startedAt:
      query.since || query.until
        ? {
            gte: query.since,
            lt: query.until,
          }
        : undefined,
  };
}

function mapMatch(row: {
  id: string;
  playerId: string;
  mode: CombatMatchRecord['mode'];
  enemyId: string;
  opponentPlayerId?: string | null;
  seasonId?: string;
  seed: string;
  balanceVersion: string;
  result: CombatMatchRecord['result'];
  playerSnapshot: Prisma.JsonValue;
  enemySnapshot: Prisma.JsonValue;
  attackerRatingBefore?: number | null;
  attackerRatingAfter?: number | null;
  defenderRatingBefore?: number | null;
  defenderRatingAfter?: number | null;
  rewardTier?: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): CombatMatchRecord {
  return {
    id: row.id,
    playerId: row.playerId,
    mode: row.mode,
    enemyId: row.enemyId,
    opponentPlayerId: row.opponentPlayerId ?? null,
    seasonId: row.seasonId ?? 'season_0',
    seed: row.seed,
    balanceVersion: row.balanceVersion,
    result: row.result,
    playerSnapshot: row.playerSnapshot as unknown as CombatantSnapshot,
    enemySnapshot: row.enemySnapshot as unknown as CombatantSnapshot,
    attackerRatingBefore: row.attackerRatingBefore ?? null,
    attackerRatingAfter: row.attackerRatingAfter ?? null,
    defenderRatingBefore: row.defenderRatingBefore ?? null,
    defenderRatingAfter: row.defenderRatingAfter ?? null,
    rewardTier: row.rewardTier ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

type ListingRow = {
  id: string;
  sellerPlayerId: string;
  listingType: MarketListingRecord['listingType'];
  assetKind: MarketListingRecord['assetKind'];
  assetRef: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: MarketListingRecord['status'];
  createdAt: Date;
  expiresAt: Date;
  buyerPlayerId: string | null;
  soldAt: Date | null;
  cancelledAt: Date | null;
  requestId: string | null;
};

type MarketTxRow = {
  id: string;
  listingId: string;
  sellerPlayerId: string;
  buyerPlayerId: string;
  assetKind: MarketListingRecord['assetKind'];
  assetRef: string;
  quantity: number;
  grossPrice: number;
  fee: number;
  sellerNet: number;
  createdAt: Date;
  requestId: string | null;
};

function mapListing(row: ListingRow): MarketListingRecord {
  return {
    id: row.id,
    sellerPlayerId: row.sellerPlayerId,
    listingType: row.listingType,
    assetKind: row.assetKind,
    assetRef: row.assetRef,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    buyerPlayerId: row.buyerPlayerId,
    soldAt: row.soldAt,
    cancelledAt: row.cancelledAt,
    requestId: row.requestId,
  };
}

function mapMarketTx(row: MarketTxRow): MarketTransactionRecord {
  return {
    id: row.id,
    listingId: row.listingId,
    sellerPlayerId: row.sellerPlayerId,
    buyerPlayerId: row.buyerPlayerId,
    assetKind: row.assetKind,
    assetRef: row.assetRef,
    quantity: row.quantity,
    grossPrice: row.grossPrice,
    fee: row.fee,
    sellerNet: row.sellerNet,
    createdAt: row.createdAt,
    requestId: row.requestId,
  };
}

async function lockListing(tx: Prisma.TransactionClient, listingId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "market_listings" WHERE id = ${listingId} FOR UPDATE`;
}

async function debitResourceInTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  resource: ResourceType,
  amount: number,
): Promise<void> {
  const updated = await tx.playerResource.updateMany({
    where: { playerId, resource, amount: { gte: amount } },
    data: { amount: { decrement: amount } },
  });
  if (updated.count !== 1) throw new InsufficientResourcesError();
}

async function creditResourceInTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  resource: ResourceType,
  amount: number,
): Promise<void> {
  await tx.playerResource.upsert({
    where: { playerId_resource: { playerId, resource } },
    update: { amount: { increment: amount } },
    create: { playerId, resource, amount },
  });
}

async function expireOneInTx(tx: Prisma.TransactionClient, listing: ListingRow, now: Date): Promise<void> {
  if (listing.status !== 'ACTIVE') return;
  const claimed = await tx.marketListing.updateMany({
    where: { id: listing.id, status: 'ACTIVE' },
    data: { status: 'EXPIRED' },
  });
  if (claimed.count !== 1) return;
  await creditResourceInTx(tx, listing.sellerPlayerId, listing.assetRef as ResourceType, listing.quantity);
  void now;
}

async function expireDueInTx(tx: Prisma.TransactionClient, now: Date, listingId?: string): Promise<number> {
  const due = await tx.marketListing.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: now },
      id: listingId,
    },
  });
  for (const listing of due) {
    await expireOneInTx(tx, listing, now);
  }
  return due.length;
}
