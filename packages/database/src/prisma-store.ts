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
import type { BattleEvent } from '@kubolesie/combat-engine';
import { clanLeaderboardScore, clanLevelForXp, PVP_RATING, applyPvpRating, clampLimit, clampOffset } from '@kubolesie/content';
import {
  EMPTY_STATISTICS,
  InsufficientResourcesError,
  type ClanApplicationRecord,
  type ClanMemberRecord,
  type ClanRecord,
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
  type QuestTemplateRecord,
  type StatisticsDelta,
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
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
    });
    return {
      ...input,
      id: row.id,
      result: row.result,
    };
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
  }): Promise<ClanRecord> {
    try {
      return await this.withTx(async (tx) => {
        const existing = await tx.clanMember.findUnique({ where: { playerId: input.leaderPlayerId } });
        if (existing) throw new Error('already_in_clan');
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
    return { clan: mapClan(member.clan), member: mapMember(member) };
  }

  async listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]> {
    const needle = query.trim();
    const take = clampLimit(limit, 5);
    const skip = clampOffset(offset);
    const rows = await this.prisma.clan.findMany({
      where: needle
        ? {
            OR: [
              { name: { contains: needle, mode: 'insensitive' } },
              { tag: { contains: needle, mode: 'insensitive' } },
            ],
          }
        : undefined,
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
  }): Promise<ClanMemberRecord> {
    try {
      const row = await this.prisma.clanMember.create({
        data: { clanId: input.clanId, playerId: input.playerId, role: input.role },
      });
      return mapMember(row);
    } catch (error) {
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
    await this.prisma.clan.delete({ where: { id: clanId } });
  }

  async createApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord> {
    const pending = await this.prisma.clanApplication.findFirst({
      where: { clanId, playerId, status: 'PENDING' },
    });
    if (pending) throw new Error('duplicate_application');
    try {
      const row = await this.prisma.clanApplication.create({
        data: { clanId, playerId, status: 'PENDING' },
      });
      return mapApplication(row);
    } catch (error) {
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

  private async clanBoardRows(periodKey: string): Promise<LeaderboardEntry[]> {
    const clans = await this.prisma.clan.findMany({
      select: { id: true, name: true, tag: true, xp: true },
    });
    const sums = await this.prisma.clanContribution.groupBy({
      by: ['clanId'],
      where: { periodKey },
      _sum: { score: true },
    });
    const seasonByClan = new Map(sums.map((row) => [row.clanId, row._sum.score ?? 0]));
    const rows = clans.map((clan) => ({
      id: clan.id,
      name: `${clan.name} [${clan.tag}]`,
      value: clanLeaderboardScore(clan.xp, seasonByClan.get(clan.id) ?? 0),
    }));
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    return rows;
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
