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
  QuestTemplateRecord,
  StatisticsDelta,
} from './store';
import { EMPTY_STATISTICS } from './store';
import {
  applyPvpRating,
  clampLimit,
  clampOffset,
  clanLeaderboardScore,
  clanLevelForXp,
  PVP_RATING,
  QUEST_TEMPLATES,
} from '@kubolesie/content';
import type { BattleEvent } from '@kubolesie/combat-engine';
import { InsufficientResourcesError, RewardAlreadyClaimedError } from './errors';

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
  statistics: PlayerStatisticsRecord[];
  ratings: PlayerRatingRecord[];
  bossStats: PlayerBossStatRecord[];
  clans: ClanRecord[];
  clanMembers: ClanMemberRecord[];
  clanApplications: ClanApplicationRecord[];
  contributions: ClanContributionRecord[];
  entitlements: EntitlementRecord[];
  cosmetics: PlayerCosmeticRecord[];
  achievements: PlayerAchievementRecord[];
  weeklyScores: { playerId: string; periodKey: string; score: number }[];
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
      parsed.statistics = parsed.statistics ?? [];
      parsed.ratings = parsed.ratings ?? [];
      parsed.bossStats = parsed.bossStats ?? [];
      parsed.clans = parsed.clans ?? [];
      parsed.clanMembers = parsed.clanMembers ?? [];
      parsed.clanApplications = parsed.clanApplications ?? [];
      parsed.contributions = parsed.contributions ?? [];
      parsed.entitlements = parsed.entitlements ?? [];
      parsed.cosmetics = parsed.cosmetics ?? [];
      parsed.achievements = parsed.achievements ?? [];
      parsed.weeklyScores = parsed.weeklyScores ?? [];
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
  }): Promise<ClanRecord> {
    return this.withClanLock(async () => {
      if (this.state.clanMembers.some((row) => row.playerId === input.leaderPlayerId)) {
        throw new Error('already_in_clan');
      }
      const nameKey = input.name.toLowerCase();
      const tagKey = input.tag.toLowerCase();
      if (this.state.clans.some((clan) => clan.nameKey === nameKey)) throw new Error('name_taken');
      if (this.state.clans.some((clan) => clan.tagKey === tagKey)) throw new Error('tag_taken');
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
    if (!clan) return null;
    return { clan, member };
  }

  async listClans(query: string, limit: number, offset: number): Promise<ClanRecord[]> {
    const needle = query.trim().toLowerCase().slice(0, 24);
    const rows = needle
      ? this.state.clans.filter(
          (clan) => clan.nameKey.includes(needle) || clan.tagKey.includes(needle),
        )
      : [...this.state.clans];
    rows.sort((a, b) => b.xp - a.xp);
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
  }): Promise<ClanMemberRecord> {
    return this.withClanLock(async () => {
      if (this.state.clanMembers.some((row) => row.playerId === input.playerId)) {
        throw new Error('already_in_clan');
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
    return this.withClanLock(async () => {
      this.state.clans = this.state.clans.filter((row) => row.id !== clanId);
      this.state.clanMembers = this.state.clanMembers.filter((row) => row.clanId !== clanId);
      this.state.clanApplications = this.state.clanApplications.filter((row) => row.clanId !== clanId);
      this.state.contributions = this.state.contributions.filter((row) => row.clanId !== clanId);
      await this.persist();
    });
  }

  async createApplication(clanId: string, playerId: string): Promise<ClanApplicationRecord> {
    return this.withClanLock(async () => {
      const existing = this.state.clanApplications.find(
        (row) => row.clanId === clanId && row.playerId === playerId && row.status === 'PENDING',
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

  private async clanBoardRows(periodKey: string): Promise<LeaderboardEntry[]> {
    const rows: LeaderboardEntry[] = [];
    for (const clan of this.state.clans) {
      const season = await this.clanSeasonContribution(clan.id, periodKey);
      rows.push({
        id: clan.id,
        name: `${clan.name} [${clan.tag}]`,
        value: clanLeaderboardScore(clan.xp, season),
      });
    }
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    return rows;
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
    statistics: [],
    ratings: [],
    bossStats: [],
    clans: [],
    clanMembers: [],
    clanApplications: [],
    contributions: [],
    entitlements: [],
    cosmetics: [],
    achievements: [],
    weeklyScores: [],
  };
}

export { RewardAlreadyClaimedError };
