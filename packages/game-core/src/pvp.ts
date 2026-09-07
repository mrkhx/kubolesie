import {
  BACK_LABEL,
  BALANCE_VERSION,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  CURRENT_SEASON,
  PVP_1,
  PVP_MILESTONES,
  PVP_RATING,
  applyPvpRating,
  eloScoreDelta,
  getProduct,
  isoWeekKey,
  pvpMilestoneRef,
  pvpRewardTier,
  utcDayKey,
  type PvpRewardTier,
} from '@kubolesie/content';
import { simulateBattle, type CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError, RewardAlreadyClaimedError } from './errors';
import { formatCombatLog } from './combat-log';
import { grantMetaAchievement, noteActivity } from './meta';
import type { GameStore, PvpCandidate } from './store';
import type { WeekCtx, WeekHost } from './week';

export const PVP_MENUS = ['pvp_hub', 'pvp_history', 'pvp_rewards'] as const;
export type PvpMenuId = (typeof PVP_MENUS)[number];
export const PVP_COMMANDS = ['PVP_ACT'] as const;

export function isPvpMenu(menu: string): menu is PvpMenuId {
  return (PVP_MENUS as readonly string[]).includes(menu);
}

export function isPvpUnlocked(flags: Record<string, string>): boolean {
  return Boolean(flags[PVP_1.unlockFlag]);
}

function utcDayStart(now: Date): Date {
  return new Date(`${utcDayKey(now)}T00:00:00.000Z`);
}

export async function dispatchPvp(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  const act = String(command.payload?.act ?? 'hub');
  if (act === 'hub') return pvpHub(host, ctx);
  if (act === 'find') return findMatch(host, ctx, eventId);
  if (act === 'history') return pvpHistory(host, ctx, Number(command.payload?.page ?? 0));
  if (act === 'ranking') return pvpRanking(host, ctx);
  if (act === 'rewards') return pvpRewards(host, ctx);
  if (act === 'claim') return claimMilestone(host, ctx, Number(command.payload?.rating ?? 0));
  return pvpHub(host, ctx);
}

export async function openPvpMenu(host: WeekHost, ctx: WeekCtx, menu: PvpMenuId): Promise<GameResponse> {
  if (menu === 'pvp_history') return pvpHistory(host, ctx, 0);
  if (menu === 'pvp_rewards') return pvpRewards(host, ctx);
  return pvpHub(host, ctx);
}

async function assertUnlocked(ctx: WeekCtx): Promise<void> {
  if (!isPvpUnlocked(ctx.flags)) {
    throw new ActionRejectedError('PvP откроется после первой печати. Сначала закрой Неделю 1.');
  }
}

async function pvpHub(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const rating = await host.store.getRating(ctx.player.id);
  const stats = await host.store.getStatistics(ctx.player.id);
  const today = utcDayStart(host.now());
  const rewarded = await host.store.countCombatMatches({
    playerId: ctx.player.id,
    mode: 'PVP',
    since: today,
  });
  const rank = await host.store.getScoreboardRank('pvp', ctx.player.id, isoWeekKey(host.now()));
  const text = [
    '⚔ PvP — асинхронная стычка.',
    `${CURRENT_SEASON.name}. Рейтинг ${rating.pvpRating}${rank ? ` · #${rank}` : ''}.`,
    `Победы ${stats.pvpWins} / поражения ${stats.pvpLosses}.`,
    `Сегодня матчей: ${rewarded}. Полная награда — первые ${PVP_1.dailyRewardedCap}.`,
    'Вещи, экипировка и база не теряются.',
  ].join('\n');
  return host.respond(ctx.player, text, [
    { label: '⚔ Найти соперника', action: 'PVP_ACT', payload: { act: 'find' } },
    { label: '🏆 Рейтинг', action: 'PVP_ACT', payload: { act: 'ranking' } },
    { label: '📜 История', action: 'PVP_ACT', payload: { act: 'history' } },
    { label: '🎁 Награды', action: 'PVP_ACT', payload: { act: 'rewards' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ]);
}

export async function pickPvpOpponent(
  store: GameStore,
  playerId: string,
  rating: number,
  lastOpponentId: string | undefined,
): Promise<PvpCandidate> {
  for (const window of PVP_1.eloWindows) {
    const found = await store.listPvpCandidates({
      excludePlayerId: playerId,
      minRating: rating - window,
      maxRating: rating + window,
      targetRating: rating,
      unlockFlag: PVP_1.unlockFlag,
      limit: PVP_1.candidateLimit,
    });
    const preferred = lastOpponentId
      ? found.filter((row) => row.playerId !== lastOpponentId)
      : found;
    const pool = preferred.length ? preferred : found;
    const chosen = pool[0];
    if (chosen && chosen.playerId !== playerId) return chosen;
  }
  throw new ActionRejectedError('Пока нет подходящего соперника. Загляни позже.');
}

async function fighterSnapshot(host: WeekHost, ctx: WeekCtx): Promise<CombatantSnapshot> {
  const stats = await host.effectiveStats(ctx);
  const equipment: Record<string, string> = {};
  for (const [slot, itemId] of Object.entries(ctx.equipment)) {
    if (!itemId) continue;
    const item = ctx.items.find((row) => row.id === itemId);
    if (item) equipment[slot] = item.templateId;
  }
  const combatFlags = ['scavenger_bonded', 'has_bow', 'has_shield', 'emberkit_bonded'].filter(
    (flag) => ctx.flags[flag],
  );
  return {
    id: ctx.player.id,
    name: ctx.player.name,
    hp: ctx.player.hp,
    maxHp: ctx.player.maxHp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    dodge: stats.dodge + (ctx.flags.scavenger_bonded ? 4 : 0),
    accuracy: stats.accuracy,
    luck: stats.luck,
    minDamage: stats.minDamage,
    maxDamage: stats.maxDamage,
    level: ctx.player.level,
    equipment,
    flags: combatFlags,
  } as CombatantSnapshot & { level: number; equipment: Record<string, string>; flags: string[] };
}

async function findMatch(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const now = host.now();
  const selfRating = await host.store.getRating(ctx.player.id);
  const lastOpponent = ctx.flags.pvp_last_opponent;
  const opponent = await pickPvpOpponent(host.store, ctx.player.id, selfRating.pvpRating, lastOpponent);
  const defenderPlayer = await host.store.findPlayerById(opponent.playerId);
  if (!defenderPlayer || defenderPlayer.id === ctx.player.id) {
    throw new ActionRejectedError('Пока нет подходящего соперника. Загляни позже.');
  }
  const defenderCtx = await host.load(defenderPlayer);
  const attackerSnap = await fighterSnapshot(host, ctx);
  const defenderSnap = await fighterSnapshot(host, defenderCtx);
  const dayStart = utcDayStart(now);
  const vsToday = await host.store.countCombatMatches({
    playerId: ctx.player.id,
    opponentPlayerId: defenderPlayer.id,
    mode: 'PVP',
    since: dayStart,
  });
  const rewardedToday = await host.store.countCombatMatches({
    playerId: ctx.player.id,
    mode: 'PVP',
    since: dayStart,
  });
  const tier = pvpRewardTier(vsToday, rewardedToday);
  const battle = simulateBattle({
    player: attackerSnap,
    enemy: defenderSnap,
    seed: eventId,
    balanceVersion: BALANCE_VERSION,
  });
  const ratings = await applyRealPvpRatings(
    host.store,
    ctx.player.id,
    defenderPlayer.id,
    battle.result,
    now,
  );
  const match = await host.store.createCombatMatch({
    playerId: ctx.player.id,
    mode: 'PVP',
    enemyId: defenderPlayer.id,
    opponentPlayerId: defenderPlayer.id,
    seasonId: CURRENT_SEASON.id,
    seed: String(battle.seed),
    balanceVersion: battle.balanceVersion,
    result: battle.result,
    playerSnapshot: attackerSnap,
    enemySnapshot: defenderSnap,
    attackerRatingBefore: ratings.attackerBefore,
    attackerRatingAfter: ratings.attackerAfter,
    defenderRatingBefore: ratings.defenderBefore,
    defenderRatingAfter: ratings.defenderAfter,
    rewardTier: tier,
    startedAt: now,
    finishedAt: now,
  });
  await host.store.addCombatEvents(match.id, battle.events);
  await host.store.setFlag(ctx.player.id, 'pvp_last_opponent', defenderPlayer.id);
  ctx.flags.pvp_last_opponent = defenderPlayer.id;
  if (battle.result === 'WIN') {
    await host.store.incrementStatistics(ctx.player.id, { pvpWins: 1 });
    await host.store.incrementStatistics(defenderPlayer.id, { pvpLosses: 1 });
    await grantMetaAchievement(host.store, ctx.player.id, 'FIRST_PVP_WIN');
  } else if (battle.result === 'LOSS') {
    await host.store.incrementStatistics(ctx.player.id, { pvpLosses: 1 });
    await host.store.incrementStatistics(defenderPlayer.id, { pvpWins: 1 });
    await grantMetaAchievement(host.store, defenderPlayer.id, 'FIRST_PVP_WIN');
  }
  const rewardNote = await grantPvpReward(host, ctx, battle.result, tier, match.id);
  if (battle.result === 'LOSS') ctx.player.hp = Math.max(1, Math.floor(ctx.player.maxHp * 0.2));
  else ctx.player.hp = Math.max(1, battle.playerHp);
  await host.store.savePlayer(ctx.player);
  const log = formatPvpLog(
    battle,
    ctx.player.id,
    ctx.player.name,
    defenderPlayer.name,
    ratings.attackerBefore,
    ratings.attackerAfter,
  );
  const buttons: GameButton[] = [
    { label: '⚔ Ещё бой', action: 'PVP_ACT', payload: { act: 'find' } },
    { label: '📜 История', action: 'PVP_ACT', payload: { act: 'history' } },
    { label: '⚔ PvP', action: 'PVP_ACT', payload: { act: 'hub' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ];
  void noteActivity;
  return host.respond(ctx.player, `${log}${rewardNote}`, buttons.slice(0, 5));
}

export async function applyRealPvpRatings(
  store: GameStore,
  attackerId: string,
  defenderId: string,
  result: 'WIN' | 'LOSS' | 'DRAW',
  now: Date,
): Promise<{
  attackerBefore: number;
  attackerAfter: number;
  defenderBefore: number;
  defenderAfter: number;
  attackerDelta: number;
  defenderDelta: number;
}> {
  const period = isoWeekKey(now);
  const attacker = await store.getRating(attackerId);
  const defender = await store.getRating(defenderId);
  const seenA = attacker.weeklyPvpOpponents.split(',').filter(Boolean);
  const seenB = defender.weeklyPvpOpponents.split(',').filter(Boolean);
  const kA = seenA.includes(defenderId) ? PVP_RATING.kRepeat : PVP_RATING.k;
  const kB = seenB.includes(attackerId) ? PVP_RATING.kRepeat : PVP_RATING.k;
  const scoreA = result === 'WIN' ? 1 : result === 'LOSS' ? 0 : 0.5;
  const scoreB = result === 'WIN' ? 0 : result === 'LOSS' ? 1 : 0.5;
  const attackerDelta = eloScoreDelta(attacker.pvpRating, defender.pvpRating, scoreA, kA);
  const defenderDelta = eloScoreDelta(defender.pvpRating, attacker.pvpRating, scoreB, kB);
  const attackerBefore = attacker.pvpRating;
  const defenderBefore = defender.pvpRating;
  attacker.pvpRating = applyPvpRating(attacker.pvpRating, attackerDelta);
  defender.pvpRating = applyPvpRating(defender.pvpRating, defenderDelta);
  if (!seenA.includes(defenderId)) attacker.weeklyPvpOpponents = [...seenA, defenderId].join(',');
  if (!seenB.includes(attackerId)) defender.weeklyPvpOpponents = [...seenB, attackerId].join(',');
  attacker.weeklyPeriod = period;
  defender.weeklyPeriod = period;
  attacker.seasonId = CURRENT_SEASON.id;
  defender.seasonId = CURRENT_SEASON.id;
  await store.saveRating(attacker);
  await store.saveRating(defender);
  return {
    attackerBefore,
    attackerAfter: attacker.pvpRating,
    defenderBefore,
    defenderAfter: defender.pvpRating,
    attackerDelta,
    defenderDelta,
  };
}

async function grantPvpReward(
  host: WeekHost,
  ctx: WeekCtx,
  result: 'WIN' | 'LOSS' | 'DRAW',
  tier: PvpRewardTier,
  matchId: string,
): Promise<string> {
  const lines = ['Вещи при тебе. Экипировка и база целы.'];
  if (tier === 'none') {
    lines.push('Награда за этот бой исчерпана — только рейтинг.');
    return `\n${lines.join(' ')}`;
  }
  const table =
    result === 'WIN'
      ? tier === 'full'
        ? PVP_1.win
        : PVP_1.winReduced
      : result === 'LOSS'
        ? tier === 'full'
          ? PVP_1.loss
          : PVP_1.lossReduced
        : { coins: 0, xp: 0, token: 0 };
  const claimed = await host.store.tryClaimReward(ctx.player.id, 'pvp_match', matchId);
  if (!claimed) return `\n${lines.join(' ')}`;
  if (table.coins) {
    await host.changeCoins(ctx.player, table.coins, 'pvp', matchId);
    lines.push(`+${table.coins} монет.`);
  }
  if (table.xp) {
    lines.push(await host.addXp(ctx.player, table.xp));
  }
  if (table.token) {
    for (let i = 0; i < table.token; i += 1) {
      const token = await host.store.createItem({
        playerId: ctx.player.id,
        templateId: 'pvp_token',
        rarity: 'COMMON',
      });
      await host.store.recordItemHistory({ itemId: token.id, playerId: ctx.player.id, type: 'LOOTED' });
    }
    lines.push(table.token > 1 ? `Жетоны спора ×${table.token}.` : 'Жетон спора.');
  }
  if (tier === 'reduced') lines.push('Повтор с этим соперником: награда снижена.');
  return `\n${lines.join(' ')}`;
}

function formatPvpLog(
  battle: ReturnType<typeof simulateBattle>,
  playerId: string,
  playerName: string,
  enemyName: string,
  ratingBefore: number,
  ratingAfter: number,
): string {
  const delta = ratingAfter - ratingBefore;
  const deltaText = delta >= 0 ? `+${delta}` : String(delta);
  const header = [
    `⚔ Стычка с ${enemyName}`,
    `Рейтинг ${ratingBefore} → ${ratingAfter} (${deltaText})`,
  ];
  const body = formatCombatLog(battle, playerId, playerName, enemyName)
    .split('\n')
    .slice(1)
    .filter((line) => !/кусает/i.test(line) || true)
    .map((line) => line.replace('кусает тебя', `бьёт тебя`));
  return [...header, ...body].join('\n');
}

async function pvpHistory(host: WeekHost, ctx: WeekCtx, page: number): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const safePage = Number.isFinite(page) ? Math.max(0, Math.min(100, Math.floor(page))) : 0;
  const limit = PVP_1.historyPageSize;
  const offset = safePage * limit;
  const rows = await host.store.listCombatMatches({
    playerId: ctx.player.id,
    mode: 'PVP',
    limit,
    offset,
  });
  const lines = rows.map((row) => {
    const name = row.enemySnapshot.name || 'Соперник';
    const outcome =
      row.result === 'WIN' ? 'победа' : row.result === 'LOSS' ? 'поражение' : 'ничья';
    const before = row.attackerRatingBefore ?? 0;
    const after = row.attackerRatingAfter ?? before;
    const delta = after - before;
    const deltaText = delta >= 0 ? `+${delta}` : String(delta);
    const when = row.startedAt.toISOString().slice(0, 16).replace('T', ' ');
    return `• ${outcome} vs ${name} · ${deltaText} (${after}) · ${when}`;
  });
  const text = ['📜 История PvP', lines.length ? lines.join('\n') : 'Пока пусто.'].join('\n');
  const buttons: GameButton[] = [];
  if (safePage > 0) {
    buttons.push({
      label: '◀ Ранее',
      action: 'PVP_ACT',
      payload: { act: 'history', page: safePage - 1 },
    });
  }
  if (rows.length === limit) {
    buttons.push({
      label: 'Ещё ▶',
      action: 'PVP_ACT',
      payload: { act: 'history', page: safePage + 1 },
    });
  }
  buttons.push({ label: '⚔ PvP', action: 'PVP_ACT', payload: { act: 'hub' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } });
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function pvpRanking(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const now = host.now();
  const rating = await host.store.getRating(ctx.player.id);
  const stats = await host.store.getStatistics(ctx.player.id);
  const rank = await host.store.getScoreboardRank('pvp', ctx.player.id, isoWeekKey(now));
  const top = await host.store.listScoreboard('pvp', isoWeekKey(now), 10, 0);
  const streak = await pvpStreak(host.store, ctx.player.id);
  const lines = top.map((row, index) => `${index + 1}. ${row.name} — ${row.value}`);
  const text = [
    `🏆 PvP · ${CURRENT_SEASON.name}`,
    `Твой Elo ${rating.pvpRating}${rank ? ` · место #${rank}` : ''}`,
    `Победы ${stats.pvpWins} / поражения ${stats.pvpLosses}${streak ? ` · серия ${streak}` : ''}`,
    lines.length ? lines.join('\n') : 'Таблица пуста.',
  ].join('\n');
  return host.respond(ctx.player, text, [
    { label: '📜 История', action: 'PVP_ACT', payload: { act: 'history' } },
    { label: '⚔ PvP', action: 'PVP_ACT', payload: { act: 'hub' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ]);
}

async function pvpStreak(store: GameStore, playerId: string): Promise<string> {
  const rows = await store.listCombatMatches({ playerId, mode: 'PVP', limit: 12, offset: 0 });
  if (!rows.length || rows[0]?.result === 'DRAW' || !rows[0]?.result) return '';
  const kind = rows[0]!.result;
  let n = 0;
  for (const row of rows) {
    if (row.result !== kind) break;
    n += 1;
  }
  if (n < 2) return '';
  return kind === 'WIN' ? `W${n}` : `L${n}`;
}

async function pvpRewards(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const rating = await host.store.getRating(ctx.player.id);
  const seasonId = CURRENT_SEASON.id;
  const buttons: GameButton[] = [];
  const lines = [`🎁 Вехи PvP · ${CURRENT_SEASON.name}`, `Текущий Elo ${rating.pvpRating}.`];
  for (const mile of PVP_MILESTONES) {
    const claimed = await host.store.hasRewardClaim(
      ctx.player.id,
      'pvp_milestone',
      pvpMilestoneRef(seasonId, mile.rating),
    );
    const product = getProduct(mile.productId);
    const label = product?.name ?? `веха ${mile.rating}`;
    if (claimed) {
      lines.push(`• ${mile.rating} — получено (${label})`);
      continue;
    }
    if (rating.pvpRating >= mile.rating) {
      lines.push(`• ${mile.rating} — можно забрать`);
      if (buttons.length < 3) {
        buttons.push({
          label: `Забрать ${mile.rating}`,
          action: 'PVP_ACT',
          payload: { act: 'claim', rating: mile.rating },
        });
      }
    } else {
      lines.push(`• ${mile.rating} — ещё нет`);
    }
  }
  buttons.push({ label: '⚔ PvP', action: 'PVP_ACT', payload: { act: 'hub' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } });
  return host.respond(ctx.player, lines.join('\n'), buttons.slice(0, 5));
}

async function claimMilestone(host: WeekHost, ctx: WeekCtx, rating: number): Promise<GameResponse> {
  await assertUnlocked(ctx);
  const mile = PVP_MILESTONES.find((row) => row.rating === rating);
  if (!mile) throw new ActionRejectedError('Такой вехи нет.');
  const current = await host.store.getRating(ctx.player.id);
  if (current.pvpRating < mile.rating) throw new ActionRejectedError('Рейтинг ещё не дотянул.');
  const ok = await host.store.tryClaimReward(
    ctx.player.id,
    'pvp_milestone',
    pvpMilestoneRef(CURRENT_SEASON.id, mile.rating),
  );
  if (!ok) throw new RewardAlreadyClaimedError('Эта веха уже получена в этом сезоне.');
  if (mile.coins) await host.changeCoins(ctx.player, mile.coins, 'pvp_milestone', String(mile.rating));
  const notes = [];
  if (mile.xp) notes.push(await host.addXp(ctx.player, mile.xp));
  if (mile.coins) notes.push(`+${mile.coins} монет.`);
  for (let i = 0; i < mile.token; i += 1) {
    const token = await host.store.createItem({
      playerId: ctx.player.id,
      templateId: 'pvp_token',
      rarity: 'COMMON',
    });
    await host.store.recordItemHistory({ itemId: token.id, playerId: ctx.player.id, type: 'LOOTED' });
  }
  if (mile.token) notes.push(mile.token > 1 ? `Жетоны ×${mile.token}.` : 'Жетон спора.');
  if (mile.productId) {
    await host.store.tryGrantEntitlement(ctx.player.id, mile.productId, `pvp_milestone:${mile.rating}`);
    const product = getProduct(mile.productId);
    if (product) notes.push(`Оформление: ${product.name}.`);
  }
  const fresh = await host.load(ctx.player);
  const screen = await pvpRewards(host, fresh);
  screen.text = `Веха ${mile.rating} получена.\n${notes.join(' ')}\n\n${screen.text}`;
  return screen;
}

export function pvpHubButton(): GameButton {
  return { label: '⚔ PvP', action: 'OPEN_MENU', payload: { menu: 'pvp_hub' } };
}
