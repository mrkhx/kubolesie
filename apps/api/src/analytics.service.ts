import { BALANCE_VERSION, PROTOTYPE_VERSION } from '@kubolesie/shared';
import { isoWeekKey, utcDayKey } from '@kubolesie/content';
import { pingPrisma, type StoreBundle } from '@kubolesie/database';
import type { GameStore } from '@kubolesie/game-core';
import { describeVkConfig, isVkCallbackReady } from '@kubolesie/vk-bot';
import type { AppConfig } from './app-config';
import { incMetric, processUptimeSec, snapshotMetrics } from './metrics';

const DAY_MS = 86_400_000;
const FUNNEL_FLAGS = [
  'day_1_complete',
  'day_2_complete',
  'day_3_complete',
  'day_4_complete',
  'day_5_complete',
  'day_6_complete',
  'day_7_complete',
  'week_1_complete',
  'day_8_complete',
  'day_9_complete',
  'day_10_complete',
  'day_11_complete',
  'day_12_complete',
  'day_13_complete',
  'day_14_complete',
  'week_2_complete',
  'wenzel_defeated',
  'mist_warden_defeated',
  'emberkit_bonded',
  'scavenger_bonded',
] as const;

function ago(now: Date, ms: number): Date {
  return new Date(now.getTime() - ms);
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function medianLevel(buckets: Array<{ level: number; count: number }>, total: number): number | null {
  if (!total) return null;
  const mid = (total + 1) / 2;
  let seen = 0;
  for (const bucket of buckets) {
    seen += bucket.count;
    if (seen >= mid) return bucket.level;
  }
  return buckets[buckets.length - 1]?.level ?? null;
}

async function pingWithTimeout(bundle: StoreBundle, timeoutMs: number): Promise<'ok' | 'down' | 'memory'> {
  if (!bundle.prisma) return bundle.kind === 'memory' ? 'memory' : 'down';
  try {
    const result = await Promise.race([
      pingPrisma(bundle.prisma).then((ok) => (ok ? 'ok' : 'down')),
      new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), timeoutMs)),
    ]);
    if (result !== 'ok') incMetric('dbErrors');
    return result;
  } catch {
    incMetric('dbErrors');
    return 'down';
  }
}

export class AnalyticsService {
  constructor(
    private readonly store: GameStore,
    private readonly bundle: StoreBundle,
    private readonly config: AppConfig,
    private readonly ephemeralPing?: () => Promise<boolean>,
  ) {}

  async overview(now = new Date()) {
    const today = utcDayStart(now);
    const d7 = ago(now, 7 * DAY_MS);
    const d30 = ago(now, 30 * DAY_MS);
    const [
      totalPlayers,
      registrationsToday,
      registrations7d,
      active5m,
      active15m,
      active60m,
      dau,
      wau,
      mau,
      eventsToday,
      pveToday,
      pvpToday,
      week1,
      week2,
    ] = await Promise.all([
      this.store.countPlayers(),
      this.store.countPlayers({ createdSince: today }),
      this.store.countPlayers({ createdSince: d7 }),
      this.store.countPlayers({ activeSince: ago(now, 5 * 60_000) }),
      this.store.countPlayers({ activeSince: ago(now, 15 * 60_000) }),
      this.store.countPlayers({ activeSince: ago(now, 60 * 60_000) }),
      this.store.countPlayers({ activeSince: today }),
      this.store.countPlayers({ activeSince: d7 }),
      this.store.countPlayers({ activeSince: d30 }),
      this.store.countProcessedEvents(today),
      this.store.countCombatMatches({ mode: 'PVE', since: today }),
      this.store.countCombatMatches({ mode: 'PVP', since: today }),
      this.store.countFlags(['week_1_complete']),
      this.store.countFlags(['week_2_complete']),
    ]);
    return {
      totalPlayers,
      registrationsToday,
      registrations7d,
      active5m,
      active15m,
      active60m,
      dau,
      wau,
      mau,
      totalEventsToday: eventsToday,
      pveBattlesToday: pveToday,
      pvpBattlesToday: pvpToday,
      week1Completed: week1[0]?.count ?? 0,
      week2Completed: week2[0]?.count ?? 0,
      totalClans: await this.store.countClans(),
      clanMembers: await this.store.countClanMembers(),
      activeClans7d: await this.store.countActiveClans(d7),
    };
  }

  async players(now = new Date()) {
    const today = utcDayStart(now);
    const yesterday = addUtcDays(today, -1);
    const d7ago = addUtcDays(today, -7);
    const [
      total,
      activeToday,
      active7d,
      returnedToday,
      returnedWeek,
      levels,
      week1,
    ] = await Promise.all([
      this.store.countPlayers(),
      this.store.countPlayers({ activeSince: today }),
      this.store.countPlayers({ activeSince: ago(now, 7 * DAY_MS) }),
      this.store.countReturning(yesterday, today, today),
      this.store.countReturning(d7ago, addUtcDays(d7ago, 1), addUtcDays(today, -7)),
      this.store.levelDistribution(),
      this.store.countFlags(['week_1_complete', 'week_2_complete']),
    ]);
    const avgLevel =
      total === 0 ? 0 : levels.reduce((sum, row) => sum + row.level * row.count, 0) / total;
    return {
      total,
      activeToday,
      active7d,
      retentionProxy: {
        registeredYesterdayReturnedToday: returnedToday,
        registered7dAgoActiveInLast7d: returnedWeek,
        note: 'proxy, not classical D1/D7 cohort retention',
      },
      averageLevel: Math.round(avgLevel * 10) / 10,
      medianLevel: medianLevel(levels, total),
      distributionByLevel: levels,
      week1Complete: week1.find((row) => row.flag === 'week_1_complete')?.count ?? 0,
      week2Complete: week1.find((row) => row.flag === 'week_2_complete')?.count ?? 0,
      playersInClan: await this.store.countClanMembers(),
      clanParticipationRate: pct(await this.store.countClanMembers(), total),
    };
  }

  async progression() {
    const total = await this.store.countPlayers();
    const flags = await this.store.countFlags([...FUNNEL_FLAGS]);
    const flagMap = Object.fromEntries(flags.map((row) => [row.flag, row.count]));
    const pvpUnlocked = flagMap.week_1_complete ?? 0;
    const firstPvp = await this.store.countPlayersWithStat('pvpWins', 1);
    const firstPvpLoss = await this.store.countPlayersWithStat('pvpLosses', 1);
    const firstBoss = await this.store.countPlayersWithStat('bossWins', 1);
    const pet = await this.store.countPlayersWithAnyFlag(['emberkit_bonded', 'scavenger_bonded']);
    const step = (count: number) => ({ count, percent: pct(count, total) });
    return {
      registered: step(total),
      startedGame: step(total),
      days: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((day) => [
          `day${day}`,
          step(flagMap[`day_${day}_complete`] ?? 0),
        ]),
      ),
      week1Complete: step(flagMap.week_1_complete ?? 0),
      week2Complete: step(flagMap.week_2_complete ?? 0),
      pvpUnlocked: step(pvpUnlocked),
      firstPvp: step(Math.max(firstPvp, firstPvpLoss)),
      firstBoss: step(firstBoss),
      petAcquired: step(pet),
      wenzelWins: step(flagMap.wenzel_defeated ?? 0),
      mistWardenWins: step(flagMap.mist_warden_defeated ?? 0),
      clansCreatedToday: await this.store.countClans({ createdSince: utcDayStart(new Date()) }),
      clansCreated7d: await this.store.countClans({ createdSince: ago(new Date(), 7 * DAY_MS) }),
    };
  }

  async clans(now = new Date()) {
    const today = utcDayStart(now);
    const d7 = ago(now, 7 * DAY_MS);
    const dayKey = `d:${utcDayKey(now)}`;
    const weekKey = isoWeekKey(now);
    const dayKeys = [];
    for (let i = 0; i < 7; i += 1) {
      dayKeys.push(`d:${utcDayKey(new Date(now.getTime() - i * DAY_MS))}`);
    }
    const [
      totalClans,
      activeClans7d,
      memberStats,
      contribToday,
      taskToday,
      task7d,
      top,
      createdToday,
      created7d,
    ] = await Promise.all([
      this.store.countClans(),
      this.store.countActiveClans(d7),
      this.store.clanMemberStats(),
      this.store.sumContribution(dayKey),
      this.store.countClanTaskCompletions(today),
      this.store.countClanTaskCompletions(d7),
      this.store.listTopClansWeekly(weekKey, 10),
      this.store.countClans({ createdSince: today }),
      this.store.countClans({ createdSince: d7 }),
    ]);
    let totalContribution7d = 0;
    for (const key of dayKeys) totalContribution7d += await this.store.sumContribution(key);
    return {
      totalClans,
      activeClans7d,
      averageMembers: memberStats.averageMembers,
      medianMembers: memberStats.medianMembers,
      totalContributionToday: contribToday,
      totalContribution7d,
      clanTaskCompletionsToday: taskToday,
      clanTaskCompletions7d: task7d,
      clansCreatedToday: createdToday,
      clansCreated7d: created7d,
      topWeekly: top.map((row) => ({
        name: row.name,
        tag: row.tag,
        level: row.level,
        weeklyScore: row.weeklyScore,
        members: row.members,
      })),
    };
  }

  async market(now = new Date()) {
    return this.store.getMarketAnalytics(now);
  }

  async jobs(now = new Date()) {
    return this.store.getJobsAnalytics(now);
  }

  async production(now = new Date()) {
    return this.store.getProductionAnalytics(now);
  }

  async combat(now = new Date()) {
    const today = utcDayStart(now);
    const d7 = ago(now, 7 * DAY_MS);
    const [
      pveToday,
      pve7d,
      pvpToday,
      pvp7d,
      pvpWins,
      pvpLosses,
      avgRating,
      pvpActive,
      bosses,
      topEnemies,
      wenzel,
      mist,
    ] = await Promise.all([
      this.store.countCombatMatches({ mode: 'PVE', since: today }),
      this.store.countCombatMatches({ mode: 'PVE', since: d7 }),
      this.store.countCombatMatches({ mode: 'PVP', since: today }),
      this.store.countCombatMatches({ mode: 'PVP', since: d7 }),
      this.store.countCombatMatches({ mode: 'PVP', result: 'WIN' }),
      this.store.countCombatMatches({ mode: 'PVP', result: 'LOSS' }),
      this.store.averagePvpRating(),
      this.store.countPvpActivePlayers(d7),
      this.store.bossAggregates(),
      this.store.topPveEnemies(d7, 5),
      this.store.countCombatMatches({ mode: 'PVE', enemyId: 'wenzel_warden' }),
      this.store.countCombatMatches({ mode: 'PVE', enemyId: 'mist_warden' }),
    ]);
    const wenzelRow = bosses.find((row) => row.bossId === 'wenzel_warden');
    const mistRow = bosses.find((row) => row.bossId === 'mist_warden');
    return {
      pveMatchesToday: pveToday,
      pveMatches7d: pve7d,
      pvpMatchesToday: pvpToday,
      pvpMatches7d: pvp7d,
      pvpWins,
      pvpLosses,
      averagePvpRating: Math.round(avgRating * 10) / 10,
      pvpActivePlayers7d: pvpActive,
      bossAttempts: bosses.map((row) => ({
        bossId: row.bossId,
        wins: row.wins,
        losses: row.losses,
        attempts: row.wins + row.losses,
      })),
      mostFoughtPveEnemies7d: topEnemies,
      wenzel: {
        matches: wenzel,
        wins: wenzelRow?.wins ?? 0,
        losses: wenzelRow?.losses ?? 0,
      },
      mistWarden: {
        matches: mist,
        wins: mistRow?.wins ?? 0,
        losses: mistRow?.losses ?? 0,
      },
    };
  }

  async system() {
    const db = await pingWithTimeout(this.bundle, 800);
    let redis: 'ok' | 'down' | 'memory' | 'disabled' = 'disabled';
    if (this.config.rateLimit.enabled) {
      if (this.config.rateLimit.backend !== 'redis') redis = 'memory';
      else if (!this.ephemeralPing) redis = 'down';
      else redis = (await Promise.race([
        this.ephemeralPing().then((ok) => (ok ? 'ok' : 'down')),
        new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), 800)),
      ])) as 'ok' | 'down';
    }
    return {
      appVersion: this.config.version,
      prototypeVersion: PROTOTYPE_VERSION,
      balanceVersion: BALANCE_VERSION,
      commit: this.config.commitSha,
      uptimeSec: processUptimeSec(),
      nodeEnv: this.config.nodeEnv,
      gameStore: this.bundle.kind,
      database: {
        configured: this.config.database.dbConfigured,
        status: db,
      },
      redis: {
        configured: this.config.rateLimit.redisConfigured,
        backend: this.config.rateLimit.backend,
        status: redis,
      },
      rateLimitEnabled: this.config.rateLimit.enabled,
      vkConfigured: isVkCallbackReady(this.config.vk),
      vk: describeVkConfig(this.config.vk),
      processMetrics: snapshotMetrics(),
    };
  }
}
