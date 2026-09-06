import { STARTING_ENERGY, STARTING_HP, STARTING_STATS } from '@kubolesie/shared';
import type {
  EquipmentSlot,
  ItemHistoryType,
  QuestStatus,
  Rarity,
  ResourceType,
} from '@kubolesie/shared';
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
} from '@kubolesie/game-core';
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
    const row = await this.prisma.playerResource.upsert({
      where: { playerId_resource: { playerId, resource } },
      update: { amount: { increment: amount } },
      create: { playerId, resource, amount: Math.max(0, amount) },
    });
    if (row.amount < 0) {
      await this.prisma.playerResource.update({
        where: { id: row.id },
        data: { amount: 0 },
      });
      return 0;
    }
    return row.amount;
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
      response: row.response as ProcessedEventRecord['response'],
      createdAt: row.createdAt,
    };
  }

  async saveProcessedEvent(record: ProcessedEventRecord): Promise<void> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          eventId: record.eventId,
          playerId: record.playerId,
          command: record.command,
          response: record.response as Prisma.InputJsonValue,
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
    currency: 'COINS';
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
        playerSnapshot: input.playerSnapshot as Prisma.InputJsonValue,
        enemySnapshot: input.enemySnapshot as Prisma.InputJsonValue,
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
}
