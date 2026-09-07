import {
  ACHIEVEMENTS,
  CLAN_CREATE_COST,
  CLAN_DONATION_RESOURCES,
  CLAN_TASK_CLAN_SCORE,
  CLAN_TASK_PLAYER_REWARD,
  LEVEL_UP,
  clanMemberCap,
  clanTasksFor,
  donationValue,
  isoWeekKey,
  parseClanCreateLine,
  resourceLabel,
  taskParticipationKey,
  taskPeriodKey,
  utcDayKey,
  validateClanDescription,
  validateClanName,
  validateClanTag,
  type ClanTaskDef,
} from '@kubolesie/content';
import { XP_THRESHOLDS, type GameButton, type GameResponse, type ResourceType } from '@kubolesie/shared';
import { BACK_LABEL } from '@kubolesie/shared';
import { ActionRejectedError, InsufficientCoinsError, InsufficientResourcesError, StaleActionError } from './errors';
import type {
  ClanRecord,
  ClanRosterRow,
  GameStore,
  PlayerRecord,
} from './store';

export const AWAITING_CLAN_FLAG = 'awaiting_clan_input';
export const CLAN_DRAFT_NAME_FLAG = 'clan_draft_name';
export const CLAN_DISBAND_TOKEN_FLAG = 'clan_disband_token';

export const CLAN_MENUS = [
  'clan',
  'clan_find',
  'clan_manage',
  'clan_members',
  'clan_home',
  'clan_tasks',
  'clan_donate',
] as const;

export type ClanMenuId = (typeof CLAN_MENUS)[number];

const NAV: GameButton[] = [
  { label: '🏕 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
  { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
];

export type ClanSocialKind = 'clan_created' | 'clan_level_up' | 'clan_weekly_complete' | 'clan_join';
export interface ClanSocialEvent {
  kind: ClanSocialKind;
  clanId: string;
  clanName: string;
  clanTag: string;
  summary: string;
}

type SocialListener = (event: ClanSocialEvent) => void;
let socialListener: SocialListener | null = null;

export function setClanSocialListener(listener: SocialListener | null): void {
  socialListener = listener;
}

export function emitClanSocial(event: ClanSocialEvent): void {
  socialListener?.(event);
}

export function isClanMenu(menu: string): menu is ClanMenuId {
  return (CLAN_MENUS as readonly string[]).includes(menu);
}

export function isClanUnlocked(flags: Record<string, string>): boolean {
  return Boolean(flags.week_1_complete);
}

export async function openClanMenu(
  store: GameStore,
  player: PlayerRecord,
  menu: ClanMenuId,
  now: Date = new Date(),
): Promise<GameResponse> {
  if (menu === 'clan_find') return clanFind(store, player, '');
  if (menu === 'clan_manage') return clanManage(store, player);
  if (menu === 'clan_members') return clanMembers(store, player, now);
  if (menu === 'clan_home') return clanCard(store, player, now);
  if (menu === 'clan_tasks') return clanTasks(store, player, now);
  if (menu === 'clan_donate') return donateScreen(store, player, now);
  return clanHub(store, player, now);
}

export async function clanAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) await requireUnlock(store, player);
  const act = String(payload.act ?? '');
  if (act === 'cancel_input') {
    await clearClanInput(store, player.id);
    return clanHub(store, player, now);
  }
  if (act === 'prompt_create') {
    if (payload.name && payload.tag) return createClan(store, player, payload, now);
    await store.setFlag(player.id, AWAITING_CLAN_FLAG, 'create');
    return respond(
      player,
      `Создание клана стоит ${CLAN_CREATE_COST} монет.\nНапиши сообщением: название и тег.\nПример: Север СВР`,
      [
        { label: '❌ Отмена', action: 'CLAN_ACT', payload: { act: 'cancel_input' } },
        { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
      ],
    );
  }
  if (act === 'create') return createClan(store, player, payload, now);
  if (act === 'prompt_search') {
    await store.setFlag(player.id, AWAITING_CLAN_FLAG, 'search');
    return respond(player, 'Напиши название или тег клана сообщением.', [
      { label: '❌ Отмена', action: 'CLAN_ACT', payload: { act: 'cancel_input' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
    ]);
  }
  if (act === 'search') return clanFind(store, player, String(payload.query ?? ''));
  if (act === 'view') return viewClan(store, player, String(payload.clanId ?? ''), now);
  if (act === 'apply') return applyClan(store, player, String(payload.clanId ?? ''));
  if (act === 'cancel_app') return cancelOwnApp(store, player, String(payload.appId ?? ''));
  if (act === 'my_apps') return myApps(store, player);
  if (act === 'apps') return reviewApps(store, player);
  if (act === 'accept') return acceptApp(store, player, String(payload.appId ?? ''));
  if (act === 'reject') return rejectApp(store, player, String(payload.appId ?? ''));
  if (act === 'leave') return leaveClan(store, player);
  if (act === 'kick') return kickMember(store, player, String(payload.targetId ?? ''));
  if (act === 'promote') return setRole(store, player, String(payload.targetId ?? ''), 'OFFICER');
  if (act === 'demote') return setRole(store, player, String(payload.targetId ?? ''), 'MEMBER');
  if (act === 'transfer') return transferLead(store, player, String(payload.targetId ?? ''));
  if (act === 'prompt_transfer') return pickMember(store, player, 'transfer', 'Кому передать лидерство?');
  if (act === 'prompt_kick') return pickMember(store, player, 'kick', 'Кого исключить?');
  if (act === 'prompt_promote') return pickMember(store, player, 'promote', 'Кого назначить офицером?');
  if (act === 'prompt_demote') return pickMember(store, player, 'demote', 'С кого снять офицера?');
  if (act === 'prompt_officers') return pickOfficers(store, player);
  if (act === 'prompt_desc') {
    await store.setFlag(player.id, AWAITING_CLAN_FLAG, 'description');
    return respond(player, 'Напиши новое описание клана сообщением.', [
      { label: '❌ Отмена', action: 'CLAN_ACT', payload: { act: 'cancel_input' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
    ]);
  }
  if (act === 'set_desc') return setDescription(store, player, String(payload.description ?? ''));
  if (act === 'disband') return promptDisband(store, player);
  if (act === 'confirm_disband') return confirmDisband(store, player, String(payload.token ?? ''));
  if (act === 'donate') {
    return donate(
      store,
      player,
      String(payload.resource ?? ''),
      Number(payload.amount ?? 1),
      now,
    );
  }
  if (act === 'claim_task') {
    return claimTask(store, player, String(payload.periodKey ?? ''), String(payload.taskId ?? ''), now);
  }
  if (act === 'contribution' || act === 'donate_menu') return donateScreen(store, player, now);
  throw new ActionRejectedError('Неизвестное действие клана.');
}

export async function handleClanTextInput(
  store: GameStore,
  player: PlayerRecord,
  text: string,
  now: Date,
): Promise<GameResponse> {
  const flags = await store.getFlags(player.id);
  const mode = flags[AWAITING_CLAN_FLAG] ?? '';
  const raw = text.trim();
  if (mode === 'create') {
    try {
      const parsed = parseClanCreateLine(raw);
      await clearClanInput(store, player.id);
      return createClan(store, player, parsed, now);
    } catch (error) {
      return respond(player, (error as Error).message, [
        { label: '❌ Отмена', action: 'CLAN_ACT', payload: { act: 'cancel_input' } },
      ]);
    }
  }
  if (mode === 'search') {
    await clearClanInput(store, player.id);
    return clanFind(store, player, raw);
  }
  if (mode === 'description') {
    await clearClanInput(store, player.id);
    return setDescription(store, player, raw);
  }
  await clearClanInput(store, player.id);
  return clanHub(store, player, now);
}

export async function noteClanTaskProgress(
  store: GameStore,
  playerId: string,
  metric: ClanTaskDef['metric'] | 'gather_log' | 'pve' | 'pvp' | 'craft' | 'boss' | 'contribution',
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (!amount) return;
  const membership = await store.getPlayerClan(playerId);
  if (!membership || membership.clan.disbandedAt) return;
  const dayKey = utcDayKey(now);
  const weekKey = isoWeekKey(now);
  const tasks = clanTasksFor(now, dayKey, weekKey).filter((task) => task.metric === metric);
  for (const task of tasks) {
    const periodKey = taskPeriodKey(task, dayKey, weekKey);
    const row = await store.incrementClanTask(membership.clan.id, periodKey, task.id, task.target, amount);
    await store.addContribution(
      membership.clan.id,
      playerId,
      taskParticipationKey(periodKey, task.id),
      amount,
    );
    if (row.completedNow) {
      const add = task.kind === 'weekly' ? CLAN_TASK_CLAN_SCORE.weekly : CLAN_TASK_CLAN_SCORE.daily;
      const updated = await store.addClanXp(membership.clan.id, add);
      if (updated.level > membership.clan.level) {
        emitClanSocial({
          kind: 'clan_level_up',
          clanId: updated.id,
          clanName: updated.name,
          clanTag: updated.tag,
          summary: `Клан ${updated.name} достиг уровня ${updated.level}.`,
        });
      }
      if (task.kind === 'weekly') {
        emitClanSocial({
          kind: 'clan_weekly_complete',
          clanId: membership.clan.id,
          clanName: membership.clan.name,
          clanTag: membership.clan.tag,
          summary: `Клан ${membership.clan.name} закрыл недельное задание.`,
        });
      }
    }
  }
}

async function requireUnlock(store: GameStore, player: PlayerRecord): Promise<void> {
  const flags = await store.getFlags(player.id);
  if (!isClanUnlocked(flags)) {
    throw new ActionRejectedError('Кланы откроются после первой печати.');
  }
}

async function clanHub(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const flags = await store.getFlags(player.id);
  if (!isClanUnlocked(flags)) {
    return respond(player, 'Кланы откроются после первой печати.', [
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ]);
  }
  const membership = await store.getPlayerClan(player.id);
  if (!membership) {
    return respond(player, 'Стая ещё не собрана. Найди клан или создай свой.', [
      { label: '🔎 Найти клан', action: 'OPEN_MENU', payload: { menu: 'clan_find' } },
      { label: '➕ Создать клан', action: 'CLAN_ACT', payload: { act: 'prompt_create' } },
      { label: '📩 Заявки', action: 'CLAN_ACT', payload: { act: 'my_apps' } },
      { label: '🏆 Рейтинг', action: 'OPEN_MENU', payload: { menu: 'ratings_clans' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ]);
  }
  return respond(player, `🏕 ${membership.clan.name} [${membership.clan.tag}]`, [
    { label: '🏕 Мой клан', action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
    { label: '🎯 Задания', action: 'OPEN_MENU', payload: { menu: 'clan_tasks' } },
    { label: '📦 Вклад', action: 'OPEN_MENU', payload: { menu: 'clan_donate' } },
    { label: '🏆 Рейтинг', action: 'OPEN_MENU', payload: { menu: 'ratings_clans' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hero' } },
  ]);
}

async function clanCard(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) return clanHub(store, player, now);
  const period = isoWeekKey(now);
  const [contrib, rank, roster] = await Promise.all([
    store.getContribution(membership.clan.id, player.id, period),
    store.getClanLeaderboardRank(membership.clan.id, period),
    store.listClanRoster(membership.clan.id, period),
  ]);
  const cap = clanMemberCap(membership.clan.level);
  const text = [
    `🏕 ${membership.clan.name} [${membership.clan.tag}]`,
    membership.clan.description || 'Без девиза.',
    `Уровень ${membership.clan.level} · очки ${membership.clan.xp}`,
    `Участники ${roster.length} / ${cap}`,
    `Место за неделю: ${rank ? `#${rank}` : '—'}`,
    `Ваш вклад: ${contrib} · роль ${roleLabel(membership.member.role)}`,
  ].join('\n');
  const buttons: GameButton[] = [
    { label: '👥 Участники', action: 'OPEN_MENU', payload: { menu: 'clan_members' } },
  ];
  if (membership.member.role === 'LEADER' || membership.member.role === 'OFFICER') {
    buttons.push({ label: '📩 Заявки', action: 'CLAN_ACT', payload: { act: 'apps' } });
  }
  if (membership.member.role === 'LEADER') {
    buttons.push({ label: '⚙ Управление', action: 'OPEN_MENU', payload: { menu: 'clan_manage' } });
  } else {
    buttons.push({ label: '🚪 Покинуть', action: 'CLAN_ACT', payload: { act: 'leave' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(player, text, buttons.slice(0, 5));
}

async function clanFind(store: GameStore, player: PlayerRecord, query: string): Promise<GameResponse> {
  await requireUnlock(store, player);
  const clans = await store.listClans(query, 4, 0);
  const buttons: GameButton[] = clans.map((clan) => ({
    label: `${clan.name} [${clan.tag}]`.slice(0, 40),
    action: 'CLAN_ACT',
    payload: { act: 'view', clanId: clan.id },
  }));
  buttons.push({ label: '🔎 Поиск', action: 'CLAN_ACT', payload: { act: 'prompt_search' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(
    player,
    clans.length ? 'Найденные стаи. Открой карточку, потом подай заявку.' : 'Стаи не найдены.',
    buttons.slice(0, 6),
  );
}

async function viewClan(store: GameStore, player: PlayerRecord, clanId: string, now: Date): Promise<GameResponse> {
  const clan = await store.getClan(clanId);
  if (!clan || clan.disbandedAt) throw new ActionRejectedError('Клан не найден.');
  const period = isoWeekKey(now);
  const [roster, rank, pending] = await Promise.all([
    store.listClanRoster(clan.id, period),
    store.getClanLeaderboardRank(clan.id, period),
    store.getPendingApplication(clan.id, player.id),
  ]);
  const cap = clanMemberCap(clan.level);
  const text = [
    `🏕 ${clan.name} [${clan.tag}]`,
    clan.description || 'Без девиза.',
    `Уровень ${clan.level} · участники ${roster.length} / ${cap}`,
    rank ? `Место за неделю: #${rank}` : 'Пока вне рейтинга.',
  ].join('\n');
  const buttons: GameButton[] = [];
  const mine = await store.getPlayerClan(player.id);
  if (!mine) {
    if (pending) {
      buttons.push({ label: '↩ Отменить заявку', action: 'CLAN_ACT', payload: { act: 'cancel_app', appId: pending.id } });
    } else {
      buttons.push({ label: '📩 Подать заявку', action: 'CLAN_ACT', payload: { act: 'apply', clanId: clan.id } });
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_find' } });
  return respond(player, text, buttons);
}

async function clanMembers(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) return clanHub(store, player, now);
  const roster = await store.listClanRoster(membership.clan.id, isoWeekKey(now));
  const lines = roster.map((row) => {
    return `• ${row.name} · ур.${row.level} · ${roleLabel(row.member.role)} · вклад ${row.weeklyContribution} · ${roughActive(row.lastActiveAt, now)}`;
  });
  const buttons: GameButton[] = [];
  if (membership.member.role === 'LEADER' || membership.member.role === 'OFFICER') {
    buttons.push({ label: '🚪 Исключить', action: 'CLAN_ACT', payload: { act: 'prompt_kick' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } });
  return respond(player, `Участники ${membership.clan.name}:\n${lines.join('\n')}`, buttons);
}

async function clanManage(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  void membership;
  return respond(player, 'Управление стаей. Боевых бонусов нет.', [
    { label: '👑 Передать', action: 'CLAN_ACT', payload: { act: 'prompt_transfer' } },
    { label: '⭐ Офицер', action: 'CLAN_ACT', payload: { act: 'prompt_officers' } },
    { label: '✍ Описание', action: 'CLAN_ACT', payload: { act: 'prompt_desc' } },
    { label: '🚪 Распустить', action: 'CLAN_ACT', payload: { act: 'disband' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function clanTasks(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) return clanHub(store, player, now);
  const dayKey = utcDayKey(now);
  const weekKey = isoWeekKey(now);
  const defs = clanTasksFor(now, dayKey, weekKey);
  const rows = await store.listClanTasks(membership.clan.id, [dayKey, weekKey]);
  const lines: string[] = [];
  const buttons: GameButton[] = [];
  for (const def of defs) {
    const periodKey = taskPeriodKey(def, dayKey, weekKey);
    const row = rows.find((entry) => entry.taskId === def.id && entry.periodKey === periodKey);
    const progress = row?.progress ?? 0;
    const done = Boolean(row?.completedAt) || progress >= def.target;
    const mark = done ? '✅' : '◻';
    lines.push(`${mark} ${def.title} · ${Math.min(progress, def.target)}/${def.target}`);
    if (done) {
      const claimed = await store.hasRewardClaim(player.id, 'clan_task', `${membership.clan.id}:${periodKey}:${def.id}`);
      const part = await store.getContribution(
        membership.clan.id,
        player.id,
        taskParticipationKey(periodKey, def.id),
      );
      if (!claimed && part > 0) {
        buttons.push({
          label: `🎁 ${def.kind === 'weekly' ? 'Неделя' : 'День'}`,
          action: 'CLAN_ACT',
          payload: { act: 'claim_task', periodKey, taskId: def.id },
        });
      }
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(player, `Задания клана\n${lines.join('\n')}`, buttons.slice(0, 5));
}

async function donateScreen(store: GameStore, player: PlayerRecord, now: Date): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) return clanHub(store, player, now);
  const resources = await store.getResources(player.id);
  const week = isoWeekKey(now);
  const mine = await store.getContribution(membership.clan.id, player.id, week);
  const lines = [`Вклад за неделю: ${mine}.`, 'Сдать в общий запас:'];
  const buttons: GameButton[] = [];
  for (const resource of CLAN_DONATION_RESOURCES) {
    const have = resources[resource] ?? 0;
    const value = donationValue(resource) ?? 0;
    lines.push(`${resourceLabel(resource)} ×${have} · ${value} оч.`);
    if (have > 0 && buttons.length < 4) {
      buttons.push({
        label: `${resourceLabel(resource)} +1`,
        action: 'CLAN_ACT',
        payload: { act: 'donate', resource, amount: 1 },
      });
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(player, lines.join('\n'), buttons.slice(0, 5));
}

async function createClan(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
): Promise<GameResponse> {
  await requireUnlock(store, player);
  if (await store.getPlayerClan(player.id)) throw new ActionRejectedError('Ты уже в клане.');
  let name: string;
  let tag: string;
  try {
    name = validateClanName(String(payload.name ?? ''));
    tag = validateClanTag(String(payload.tag ?? ''));
  } catch (error) {
    throw new ActionRejectedError((error as Error).message);
  }
  const description = String(payload.description ?? '').slice(0, 80);
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  if (fresh.coins < CLAN_CREATE_COST) {
    throw new InsufficientCoinsError(`Нужно ${CLAN_CREATE_COST} монет.`);
  }
  try {
    const clan = await store.createClan({
      name,
      tag,
      description,
      leaderPlayerId: player.id,
      cost: CLAN_CREATE_COST,
    });
    await grantClanMember(store, player.id);
    emitClanSocial({
      kind: 'clan_created',
      clanId: clan.id,
      clanName: clan.name,
      clanTag: clan.tag,
      summary: `Создан клан ${clan.name} [${clan.tag}].`,
    });
    void now;
    return respond(player, `Клан ${clan.name} [${clan.tag}] создан. Ты лидер. −${CLAN_CREATE_COST} монет.`, [
      { label: '🏕 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
    ]);
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'name_taken') throw new ActionRejectedError('Имя занято.');
    if (code === 'tag_taken') throw new ActionRejectedError('Тег занят.');
    if (code === 'already_in_clan') throw new ActionRejectedError('Ты уже в клане.');
    if (code === 'insufficient_coins') throw new InsufficientCoinsError(`Нужно ${CLAN_CREATE_COST} монет.`);
    throw new ActionRejectedError('Нельзя создать клан.');
  }
}

async function applyClan(store: GameStore, player: PlayerRecord, clanId: string): Promise<GameResponse> {
  if (await store.getPlayerClan(player.id)) throw new ActionRejectedError('Ты уже в клане.');
  const clan = await store.getClan(clanId);
  if (!clan || clan.disbandedAt) throw new ActionRejectedError('Клан не найден.');
  const existing = (await store.listPlayerApplications(player.id)).filter((row) => row.status === 'PENDING');
  if (existing.some((row) => row.clanId !== clanId)) {
    throw new ActionRejectedError('Сначала отмени текущую заявку.');
  }
  try {
    await store.createApplication(clanId, player.id);
  } catch (error) {
    if ((error as Error).message === 'duplicate_application') {
      throw new ActionRejectedError('Заявка уже висит.');
    }
    throw error;
  }
  return respond(player, `Заявка в ${clan.name} отправлена.`, [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function cancelOwnApp(store: GameStore, player: PlayerRecord, appId: string): Promise<GameResponse> {
  const app = await store.getApplication(appId);
  if (!app || app.playerId !== player.id) throw new ActionRejectedError('Заявки нет.');
  if (app.status !== 'PENDING') throw new StaleActionError('Заявка уже обработана.');
  await store.setApplicationStatus(app.id, 'CANCELLED');
  return respond(player, 'Заявка отменена.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function myApps(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const apps = (await store.listPlayerApplications(player.id)).filter((row) => row.status === 'PENDING');
  const buttons: GameButton[] = [];
  const lines = [];
  for (const app of apps) {
    const clan = await store.getClan(app.clanId);
    lines.push(`• ${clan?.name ?? 'стая'} — ждёт`);
    buttons.push({
      label: `↩ ${clan?.tag ?? 'заявка'}`,
      action: 'CLAN_ACT',
      payload: { act: 'cancel_app', appId: app.id },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } });
  return respond(player, lines.length ? lines.join('\n') : 'Заявок нет.', buttons.slice(0, 5));
}

async function reviewApps(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const apps = await store.listPendingApplications(membership.clan.id);
  if (!apps.length) {
    return respond(player, 'Заявок нет.', [
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
    ]);
  }
  const app = apps[0]!;
  const who = await store.findPlayerById(app.playerId);
  return respond(player, `Заявка: ${who?.name ?? 'Путник'} · ур.${who?.level ?? 1}`, [
    { label: 'Принять', action: 'CLAN_ACT', payload: { act: 'accept', appId: app.id } },
    { label: 'Отклонить', action: 'CLAN_ACT', payload: { act: 'reject', appId: app.id } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function acceptApp(store: GameStore, player: PlayerRecord, appId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const app = await store.getApplication(appId);
  if (!app || app.clanId !== membership.clan.id) throw new ActionRejectedError('Заявки нет.');
  if (app.status !== 'PENDING') throw new StaleActionError('Заявка уже обработана.');
  const already = await store.getPlayerClan(app.playerId);
  if (already) {
    await store.setApplicationStatus(app.id, 'CANCELLED');
    throw new ActionRejectedError('Игрок уже в другом клане.');
  }
  const cap = clanMemberCap(membership.clan.level);
  try {
    await store.addClanMember({
      clanId: membership.clan.id,
      playerId: app.playerId,
      role: 'MEMBER',
      maxMembers: cap,
    });
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'already_in_clan') {
      await store.setApplicationStatus(app.id, 'CANCELLED');
      throw new ActionRejectedError('Игрок уже в клане.');
    }
    if (code === 'clan_full') throw new ActionRejectedError('В клане нет мест.');
    throw error;
  }
  await store.setApplicationStatus(app.id, 'ACCEPTED');
  await store.cancelPendingApplications(app.playerId);
  await grantClanMember(store, app.playerId);
  emitClanSocial({
    kind: 'clan_join',
    clanId: membership.clan.id,
    clanName: membership.clan.name,
    clanTag: membership.clan.tag,
    summary: `В ${membership.clan.name} принят новый участник.`,
  });
  return respond(player, 'Принят в стаю.', [
    { label: 'Ещё заявки', action: 'CLAN_ACT', payload: { act: 'apps' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function rejectApp(store: GameStore, player: PlayerRecord, appId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  const app = await store.getApplication(appId);
  if (!app || app.clanId !== membership.clan.id) throw new ActionRejectedError('Заявки нет.');
  if (app.status !== 'PENDING') throw new StaleActionError('Заявка уже обработана.');
  await store.setApplicationStatus(app.id, 'REJECTED');
  return respond(player, 'Заявка отклонена.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function leaveClan(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) throw new ActionRejectedError('Нет клана.');
  if (membership.member.role === 'LEADER') {
    const members = await store.listClanMembers(membership.clan.id);
    if (members.length > 1) {
      throw new ActionRejectedError('Лидер передаёт стаю или распускает.');
    }
    await store.disbandClan(membership.clan.id);
    return respond(player, 'Стая распущена.', NAV);
  }
  await store.removeClanMember(membership.clan.id, player.id);
  return respond(player, 'Ты вышел из клана.', NAV);
}

async function promptDisband(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  await requireLeader(store, player);
  const token = `${Date.now().toString(36)}${player.id.slice(-4)}`;
  await store.setFlag(player.id, CLAN_DISBAND_TOKEN_FLAG, token);
  return respond(player, 'Распустить клан? Ресурсы не вернутся. Подтверди вторым шагом.', [
    { label: 'Подтвердить', action: 'CLAN_ACT', payload: { act: 'confirm_disband', token } },
    { label: '❌ Отмена', action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function confirmDisband(store: GameStore, player: PlayerRecord, token: string): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  const flags = await store.getFlags(player.id);
  const expected = flags[CLAN_DISBAND_TOKEN_FLAG];
  if (!expected || !token || token !== expected) {
    throw new ActionRejectedError('Подтверждение устарело.');
  }
  await store.setFlag(player.id, CLAN_DISBAND_TOKEN_FLAG, '');
  await store.disbandClan(membership.clan.id);
  return respond(player, 'Стая распущена.', NAV);
}

async function kickMember(store: GameStore, player: PlayerRecord, targetId: string): Promise<GameResponse> {
  const membership = await requireOfficer(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Себя не выгнать так.');
  const members = await store.listClanMembers(membership.clan.id);
  const target = members.find((row) => row.playerId === targetId);
  if (!target) throw new ActionRejectedError('Не в клане.');
  if (target.role === 'LEADER') throw new ActionRejectedError('Лидера не выгнать.');
  if (membership.member.role !== 'LEADER' && target.role === 'OFFICER') {
    throw new ActionRejectedError('Офицера исключает только лидер.');
  }
  await store.removeClanMember(membership.clan.id, targetId);
  return respond(player, 'Исключён.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function setRole(
  store: GameStore,
  player: PlayerRecord,
  targetId: string,
  role: 'OFFICER' | 'MEMBER',
): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Себе роль так не сменить.');
  const members = await store.listClanMembers(membership.clan.id);
  if (!members.some((row) => row.playerId === targetId)) throw new ActionRejectedError('Не в клане.');
  await store.setClanMemberRole(membership.clan.id, targetId, role);
  return respond(player, role === 'OFFICER' ? 'Повышен.' : 'Понижен.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } },
  ]);
}

async function transferLead(store: GameStore, player: PlayerRecord, targetId: string): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  if (targetId === player.id) throw new ActionRejectedError('Уже лидер.');
  await store.setClanLeader(membership.clan.id, targetId);
  return respond(player, 'Лидерство передано.', [
    { label: '🏕 Клан', action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function setDescription(store: GameStore, player: PlayerRecord, raw: string): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  let description: string;
  try {
    description = validateClanDescription(raw);
  } catch (error) {
    throw new ActionRejectedError((error as Error).message);
  }
  await store.setClanDescription(membership.clan.id, description);
  return respond(player, 'Описание обновлено.', [
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_home' } },
  ]);
}

async function pickOfficers(store: GameStore, player: PlayerRecord): Promise<GameResponse> {
  const membership = await requireLeader(store, player);
  const members = await store.listClanMembers(membership.clan.id);
  const buttons: GameButton[] = [];
  for (const member of members) {
    if (member.playerId === player.id) continue;
    const who = await store.findPlayerById(member.playerId);
    const name = who?.name ?? 'Путник';
    if (member.role === 'MEMBER' && buttons.length < 3) {
      buttons.push({
        label: `⭐ ${name}`.slice(0, 40),
        action: 'CLAN_ACT',
        payload: { act: 'promote', targetId: member.playerId },
      });
    } else if (member.role === 'OFFICER' && buttons.length < 3) {
      buttons.push({
        label: `▼ ${name}`.slice(0, 40),
        action: 'CLAN_ACT',
        payload: { act: 'demote', targetId: member.playerId },
      });
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan_manage' } });
  return respond(
    player,
    buttons.length > 1 ? 'Назначить или снять офицера.' : 'Нет подходящих участников.',
    buttons.slice(0, 5),
  );
}

async function pickMember(
  store: GameStore,
  player: PlayerRecord,
  act: string,
  title: string,
): Promise<GameResponse> {
  const membership =
    act === 'kick' ? await requireOfficer(store, player) : await requireLeader(store, player);
  const members = (await store.listClanMembers(membership.clan.id)).filter((row) => {
    if (row.playerId === player.id) return false;
    if (act === 'promote') return row.role === 'MEMBER';
    if (act === 'demote') return row.role === 'OFFICER';
    if (act === 'kick' && membership.member.role !== 'LEADER') return row.role === 'MEMBER';
    if (act === 'kick') return row.role !== 'LEADER';
    return true;
  });
  const buttons: GameButton[] = [];
  for (const member of members.slice(0, 3)) {
    const who = await store.findPlayerById(member.playerId);
    buttons.push({
      label: who?.name ?? 'Путник',
      action: 'CLAN_ACT',
      payload: { act, targetId: member.playerId },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: act === 'kick' ? 'clan_members' : 'clan_manage' } });
  return respond(player, members.length ? title : 'Нет подходящих участников.', buttons.slice(0, 5));
}

async function donate(
  store: GameStore,
  player: PlayerRecord,
  resource: string,
  amount: number,
  now: Date,
): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) throw new ActionRejectedError('Нет клана.');
  const value = donationValue(resource);
  if (value === null) throw new ActionRejectedError('Этот ресурс клан не принимает.');
  const qty = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
  const weekKey = isoWeekKey(now);
  const dayKey = utcDayKey(now);
  const beforeLevel = membership.clan.level;
  try {
    const result = await store.donateToClan({
      clanId: membership.clan.id,
      playerId: player.id,
      resource: resource as ResourceType,
      amount: qty,
      score: value * qty,
      weekKey,
      dayKey,
    });
    await noteClanTaskProgress(store, player.id, 'contribution', value * qty, now);
    if (result.clan.level > beforeLevel) {
      emitClanSocial({
        kind: 'clan_level_up',
        clanId: result.clan.id,
        clanName: result.clan.name,
        clanTag: result.clan.tag,
        summary: `Клан ${result.clan.name} достиг уровня ${result.clan.level}.`,
      });
    }
    return respond(
      player,
      `Сдано ${resourceLabel(resource as ResourceType)} ×${qty}. Вклад +${value * qty}. Осталось ${result.remaining}.`,
      [
        { label: '📦 Ещё', action: 'OPEN_MENU', payload: { menu: 'clan_donate' } },
        { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
      ],
    );
  } catch (error) {
    if (error instanceof InsufficientResourcesError || (error as Error).message === 'insufficient_resources') {
      throw new ActionRejectedError('Не хватает ресурса.');
    }
    throw error;
  }
}

async function claimTask(
  store: GameStore,
  player: PlayerRecord,
  periodKey: string,
  taskId: string,
  now: Date,
): Promise<GameResponse> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership) throw new ActionRejectedError('Нет клана.');
  const dayKey = utcDayKey(now);
  const weekKey = isoWeekKey(now);
  const def = clanTasksFor(now, dayKey, weekKey).find((task) => task.id === taskId);
  if (!def || taskPeriodKey(def, dayKey, weekKey) !== periodKey) {
    throw new ActionRejectedError('Задание уже сменилось.');
  }
  const row = await store.getClanTask(membership.clan.id, periodKey, taskId);
  if (!row?.completedAt && (row?.progress ?? 0) < def.target) {
    throw new ActionRejectedError('Задание ещё не закрыто.');
  }
  const part = await store.getContribution(
    membership.clan.id,
    player.id,
    taskParticipationKey(periodKey, taskId),
  );
  if (part <= 0) throw new ActionRejectedError('Ты не участвовал в этом задании.');
  const ok = await store.tryClaimReward(player.id, 'clan_task', `${membership.clan.id}:${periodKey}:${taskId}`);
  if (!ok) throw new ActionRejectedError('Награда уже получена.');
  const reward = def.kind === 'weekly' ? CLAN_TASK_PLAYER_REWARD.weekly : CLAN_TASK_PLAYER_REWARD.daily;
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  fresh.coins += reward.coins;
  fresh.xp += reward.xp;
  while (fresh.level < XP_THRESHOLDS.length - 1 && fresh.xp >= XP_THRESHOLDS[fresh.level + 1]!) {
    fresh.level += 1;
    fresh.maxHp += LEVEL_UP.maxHpGain;
    fresh.maxEnergy += LEVEL_UP.maxEnergyGain;
  }
  await store.savePlayer(fresh);
  await store.addCurrencyTransaction({
    playerId: fresh.id,
    currency: 'COINS',
    amount: reward.coins,
    balanceBefore: fresh.coins - reward.coins,
    balanceAfter: fresh.coins,
    reason: 'clan_task',
    referenceId: `${periodKey}:${taskId}`,
  });
  return respond(player, `Награда задания: +${reward.coins} монет, +${reward.xp} XP.`, [
    { label: '🎯 Задания', action: 'OPEN_MENU', payload: { menu: 'clan_tasks' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'clan' } },
  ]);
}

async function requireOfficer(
  store: GameStore,
  player: PlayerRecord,
): Promise<{ clan: ClanRecord; member: { role: string; playerId: string } }> {
  const membership = await store.getPlayerClan(player.id);
  if (!membership || (membership.member.role !== 'LEADER' && membership.member.role !== 'OFFICER')) {
    throw new ActionRejectedError('Нет прав.');
  }
  return membership;
}

async function requireLeader(store: GameStore, player: PlayerRecord) {
  const membership = await store.getPlayerClan(player.id);
  if (!membership || membership.member.role !== 'LEADER') throw new ActionRejectedError('Только лидер.');
  return membership;
}

function roleLabel(role: string): string {
  if (role === 'LEADER') return 'лидер';
  if (role === 'OFFICER') return 'офицер';
  return 'член';
}

function roughActive(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days < 1) return 'сегодня';
  if (days < 2) return 'вчера';
  if (days < 7) return `${days} дн.`;
  if (days < 30) return `${Math.floor(days / 7)} нед.`;
  return 'давно';
}

function respond(player: PlayerRecord, text: string, buttons: GameButton[]): GameResponse {
  void player;
  return { text, buttons };
}

async function clearClanInput(store: GameStore, playerId: string): Promise<void> {
  await store.setFlag(playerId, AWAITING_CLAN_FLAG, '0');
  await store.setFlag(playerId, CLAN_DRAFT_NAME_FLAG, '');
}

async function grantClanMember(store: GameStore, playerId: string): Promise<void> {
  const ok = await store.tryGrantAchievement(playerId, 'CLAN_MEMBER');
  if (!ok) return;
  const def = ACHIEVEMENTS.CLAN_MEMBER;
  for (const productId of def?.rewardProductIds ?? []) {
    await store.tryGrantEntitlement(playerId, productId, 'achievement:CLAN_MEMBER');
  }
}

export function formatRosterLine(row: ClanRosterRow, now: Date): string {
  return `${row.name} · ур.${row.level} · ${roleLabel(row.member.role)} · ${row.weeklyContribution} · ${roughActive(row.lastActiveAt, now)}`;
}
