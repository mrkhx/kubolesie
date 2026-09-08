import {
  JOB_LABELS,
  JOB_PROFESSIONS,
  PRODUCTION_BUILDINGS,
  PRODUCTION_DEFS,
  PRODUCTION_LABELS,
  resourceLabel,
  type JobProfession,
  type ProductionBuildingType,
} from '@kubolesie/content';
import { BACK_LABEL, type GameButton, type GameResponse } from '@kubolesie/shared';
import {
  ActionRejectedError,
  InsufficientCoinsError,
  InsufficientResourcesError,
} from './errors';
import {
  acceptJobContract,
  offeredContracts,
  isJobsUnlocked,
} from './jobs';
import {
  assertBuildingType,
  buildBuilding,
  buildingView,
  collectBuilding,
  etaLabel,
  isProductionUnlocked,
  snapshotBuilding,
  upgradeBuilding,
} from './production';
import type {
  GameStore,
  PlayerJobTaskRecord,
  PlayerRecord,
} from './store';

export const WORK_MENUS = ['work', 'jobs', 'production'] as const;
export type WorkMenuId = (typeof WORK_MENUS)[number];
export const JOB_COMMANDS = ['JOB_ACT'] as const;
export const PROD_COMMANDS = ['PROD_ACT'] as const;

const JOB_PAGES: JobProfession[][] = [
  ['LOGGER', 'MINER', 'FARMER'],
  ['FISHER', 'HUNTER', 'CRAFTER'],
];
const PROD_PAGES: ProductionBuildingType[][] = [
  ['WHEAT_FARM', 'SAWMILL', 'QUARRY'],
  ['MINE', 'FISHERY', 'PEN'],
];

export function isWorkMenu(menu: string): menu is WorkMenuId {
  return (WORK_MENUS as readonly string[]).includes(menu);
}

export function isWorkUnlocked(flags: Record<string, string>): boolean {
  return isJobsUnlocked(flags) || isProductionUnlocked(flags);
}

export async function openWorkMenu(
  store: GameStore,
  player: PlayerRecord,
  menu: WorkMenuId,
  now: Date,
): Promise<GameResponse> {
  await requireUnlock(store, player);
  if (menu === 'jobs') return jobsHub(store, player, 0);
  if (menu === 'production') return productionHub(store, player, 0, now);
  return workHub(player);
}

export async function jobAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
  eventId?: string,
): Promise<GameResponse> {
  try {
    await requireUnlock(store, player);
    const act = String(payload.act ?? 'hub');
    if (act === 'hub' || act === 'list') return jobsHub(store, player, Number(payload.page ?? 0));
    if (act === 'prof') return professionScreen(store, player, String(payload.p ?? ''), now);
    if (act === 'accept') {
      return doAccept(store, player, String(payload.id ?? ''), eventId, now);
    }
    throw new ActionRejectedError('Неизвестное действие работы.');
  } catch (error) {
    return workError(player, error);
  }
}

export async function prodAct(
  store: GameStore,
  player: PlayerRecord,
  payload: Record<string, unknown>,
  now: Date,
  eventId?: string,
): Promise<GameResponse> {
  try {
    await requireUnlock(store, player);
    const act = String(payload.act ?? 'hub');
    if (act === 'hub' || act === 'list') return productionHub(store, player, Number(payload.page ?? 0), now);
    if (act === 'view') return buildingScreen(store, player, String(payload.t ?? ''), now);
    if (act === 'build') return doBuild(store, player, String(payload.t ?? ''), eventId, now);
    if (act === 'collect') return doCollect(store, player, String(payload.t ?? ''), eventId, now);
    if (act === 'upgrade') return doUpgrade(store, player, String(payload.t ?? ''), eventId, now);
    throw new ActionRejectedError('Неизвестное действие двора.');
  } catch (error) {
    return workError(player, error);
  }
}

async function requireUnlock(store: GameStore, player: PlayerRecord): Promise<void> {
  const flags = await store.getFlags(player.id);
  if (!isWorkUnlocked(flags)) {
    throw new ActionRejectedError('Хозяйство откроется после первой печати. Сначала закрой Неделю 1.');
  }
}

function workHub(player: PlayerRecord): GameResponse {
  return respond(player, '⚒ Хозяйство Куболесья.\nКонтракты за обычные дела. Дворы копят сами — но не вместо рук.', [
    { label: '💼 Работы', action: 'OPEN_MENU', payload: { menu: 'jobs' } },
    { label: '🏗 Дворы', action: 'OPEN_MENU', payload: { menu: 'production' } },
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'stats' } },
  ]);
}

async function jobsHub(store: GameStore, player: PlayerRecord, page: number): Promise<GameResponse> {
  const safe = page <= 0 ? 0 : 1;
  const jobs = await store.listJobs(player.id);
  const byProf = new Map(jobs.map((row) => [row.profession, row]));
  const accepted = await store.listAcceptedJobTasks(player.id);
  const active = new Set(accepted.map((row) => row.profession));
  const lines = ['💼 Работы. Три контракта на профессию в сутки.', 'Прогресс — только живыми действиями.'];
  const buttons: GameButton[] = JOB_PAGES[safe]!.map((profession) => {
    const job = byProf.get(profession);
    const mark = active.has(profession) ? '● ' : '';
    const lv = job?.level ?? 1;
    return {
      label: `${mark}${JOB_LABELS[profession]} · ${lv}`,
      action: 'JOB_ACT',
      payload: { act: 'prof', p: profession },
    };
  });
  if (safe === 0) {
    buttons.push({ label: '➡ Ещё', action: 'JOB_ACT', payload: { act: 'list', page: 1 } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'work' } });
  return respond(player, lines.join('\n'), buttons);
}

async function professionScreen(
  store: GameStore,
  player: PlayerRecord,
  raw: string,
  now: Date,
): Promise<GameResponse> {
  if (!(JOB_PROFESSIONS as readonly string[]).includes(raw)) {
    throw new ActionRejectedError('Нет такой профессии.');
  }
  const profession = raw as JobProfession;
  const job = await store.getJob(player.id, profession);
  const level = job?.level ?? 1;
  const accepted = await store.getAcceptedJobTask(player.id, profession);
  const period = now.toISOString().slice(0, 10);
  const today = (await store.listJobTasks(player.id, profession, period)).filter((row) => row.status === 'COMPLETED');
  const taken = new Set(today.map((row) => row.templateId));
  if (accepted) taken.add(accepted.templateId);
  const offers = offeredContracts(profession, level);
  const lines = [
    `${JOB_LABELS[profession]} · уровень ${level}`,
    job ? `XP ${job.xp} · закрыто ${job.completedCount}` : 'Ещё без закрытых контрактов.',
    `Сегодня: ${job && job.dailyPeriod === period ? job.dailyCompleted : 0} (полные монеты — первые 5).`,
  ];
  if (accepted) {
    lines.push('', `В работе: ${contractTitle(accepted)}`, `${accepted.progress}/${accepted.target}`);
  }
  const buttons: GameButton[] = [];
  for (const offer of offers) {
    const done = taken.has(offer.id) && (!accepted || accepted.templateId !== offer.id);
    const current = accepted?.templateId === offer.id;
    const prefix = current ? '▶ ' : done ? '✓ ' : `${offer.slot + 1}. `;
    lines.push(
      `${offer.slot + 1}. ${offer.title}`,
      `${offer.blurb} ${offer.target}`,
      `Награда: ${offer.coins} монет + ${offer.jobXp} XP профессии`,
    );
    if (!accepted && !done) {
      buttons.push({
        label: `${prefix}${offer.title}`,
        action: 'JOB_ACT',
        payload: { act: 'accept', id: offer.id },
      });
    } else {
      buttons.push({
        label: `${prefix}${offer.title}`,
        action: 'JOB_ACT',
        payload: { act: 'prof', p: profession },
      });
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'JOB_ACT', payload: { act: 'hub' } });
  return respond(player, lines.join('\n'), buttons.slice(0, 4));
}

async function doAccept(
  store: GameStore,
  player: PlayerRecord,
  templateId: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const task = await acceptJobContract(store, player.id, templateId, now, eventId);
  const title = contractTitle(task);
  return professionScreen(
    store,
    (await store.findPlayerById(player.id)) ?? player,
    task.profession,
    now,
  ).then((screen) => ({
    ...screen,
    text: `Контракт принят: ${title}.\n${task.progress}/${task.target}\n\n${screen.text}`,
  }));
}

async function productionHub(
  store: GameStore,
  player: PlayerRecord,
  page: number,
  now: Date,
): Promise<GameResponse> {
  const safe = page <= 0 ? 0 : 1;
  const buildings = await store.listProductionBuildings(player.id);
  const jobs = await store.listJobs(player.id);
  const jobLv = new Map(jobs.map((row) => [row.profession, row.level]));
  for (const row of buildings) {
    const def = PRODUCTION_DEFS[row.buildingType];
    const lv = def.profession ? (jobLv.get(def.profession) ?? 0) : 0;
    await snapshotBuilding(store, player.id, row.buildingType, now, lv);
  }
  const fresh = await store.listProductionBuildings(player.id);
  const byType = new Map(fresh.map((row) => [row.buildingType, row]));
  const lines = ['🏗 Дворы. Копят сами, пока есть место.', 'Сбор — в инвентарь. На рынок — как обычный ресурс.'];
  const buttons: GameButton[] = PROD_PAGES[safe]!.map((type) => {
    const row = byType.get(type);
    const lv = row ? `Ур.${row.level}` : 'не построен';
    return {
      label: `${PRODUCTION_LABELS[type]} · ${lv}`,
      action: 'PROD_ACT',
      payload: { act: 'view', t: type },
    };
  });
  if (safe === 0) {
    buttons.push({ label: '➡ Ещё', action: 'PROD_ACT', payload: { act: 'list', page: 1 } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'work' } });
  return respond(player, lines.join('\n'), buttons);
}

async function buildingScreen(
  store: GameStore,
  player: PlayerRecord,
  raw: string,
  now: Date,
): Promise<GameResponse> {
  const type = assertBuildingType(raw);
  const def = PRODUCTION_DEFS[type];
  const jobLevel = def.profession ? ((await store.getJob(player.id, def.profession))?.level ?? 0) : 0;
  const building = await snapshotBuilding(store, player.id, type, now, jobLevel);
  const view = buildingView(type, building, jobLevel);
  const rates = view.rates;
  const full = Boolean(building && rates.capPrimary > 0 && building.storedPrimary >= rates.capPrimary);
  const fillLeft =
    building && rates.primaryPerHour > 0
      ? Math.max(0, (rates.capPrimary - building.storedPrimary) / rates.primaryPerHour)
      : null;
  const lines = [
    `${PRODUCTION_LABELS[type]} · ${building ? `Ур.${building.level}` : 'не построен'}`,
  ];
  if (!building) {
    lines.push('Ещё не стоит. Постройка — sink ресурсов и монет.');
    lines.push(formatCost(view.cost.resources, view.cost.coins));
  } else {
    lines.push(`Хранилище: ${building.storedPrimary} / ${rates.capPrimary} ${resourceLabel(def.primary)}`);
    if (def.secondary && rates.capSecondary > 0) {
      lines.push(`Ещё: ${building.storedSecondary} / ${rates.capSecondary} ${resourceLabel(def.secondary)}`);
    }
    lines.push(`Производство: ${fmtRate(rates.primaryPerHour)}/ч`);
    lines.push(etaLabel(fillLeft, full));
    if (building.level < 10 && view.nextCost) {
      lines.push(`Улучшение: ${formatCost(view.nextCost.resources, view.nextCost.coins)}`);
    } else if (building.level >= 10) {
      lines.push('Максимум. Дальше не растёт.');
    }
  }
  const buttons: GameButton[] = [];
  if (!building) {
    buttons.push({ label: '🛠 Построить', action: 'PROD_ACT', payload: { act: 'build', t: type } });
  } else {
    buttons.push({ label: '📦 Собрать', action: 'PROD_ACT', payload: { act: 'collect', t: type } });
    if (building.level < 10) {
      buttons.push({ label: '⬆ Улучшить', action: 'PROD_ACT', payload: { act: 'upgrade', t: type } });
    }
  }
  buttons.push({ label: BACK_LABEL, action: 'PROD_ACT', payload: { act: 'hub' } });
  return respond(player, lines.join('\n'), buttons);
}

async function doBuild(
  store: GameStore,
  player: PlayerRecord,
  raw: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const type = assertBuildingType(raw);
  await buildBuilding(store, player.id, type, now, eventId);
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  const screen = await buildingScreen(store, fresh, type, now);
  return { ...screen, text: `Построено: ${PRODUCTION_LABELS[type]}.\n\n${screen.text}` };
}

async function doCollect(
  store: GameStore,
  player: PlayerRecord,
  raw: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const type = assertBuildingType(raw);
  const def = PRODUCTION_DEFS[type];
  const jobLevel = def.profession ? ((await store.getJob(player.id, def.profession))?.level ?? 0) : 0;
  const result = await collectBuilding(store, player.id, type, now, jobLevel, eventId);
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  const screen = await buildingScreen(store, fresh, type, now);
  if (result.empty) {
    return { ...screen, text: `Пусто. Нечего забирать.\n\n${screen.text}` };
  }
  const bits = [`+${result.primary} ${resourceLabel(def.primary)}`];
  if (def.secondary && result.secondary > 0) bits.push(`+${result.secondary} ${resourceLabel(def.secondary)}`);
  return { ...screen, text: `Собрано: ${bits.join(', ')}.\n\n${screen.text}` };
}

async function doUpgrade(
  store: GameStore,
  player: PlayerRecord,
  raw: string,
  eventId: string | undefined,
  now: Date,
): Promise<GameResponse> {
  const type = assertBuildingType(raw);
  const def = PRODUCTION_DEFS[type];
  const jobLevel = def.profession ? ((await store.getJob(player.id, def.profession))?.level ?? 0) : 0;
  const building = await upgradeBuilding(store, player.id, type, now, jobLevel, eventId);
  const fresh = (await store.findPlayerById(player.id)) ?? player;
  const screen = await buildingScreen(store, fresh, type, now);
  return { ...screen, text: `Улучшено до ур.${building.level}. Запас на месте.\n\n${screen.text}` };
}

function contractTitle(task: PlayerJobTaskRecord): string {
  const template = offeredContracts(task.profession, 1).find((row) => row.id === task.templateId);
  return template?.title ?? task.templateId;
}

function formatCost(resources: Partial<Record<string, number>>, coins: number): string {
  const parts = Object.entries(resources)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([key, amount]) => `${resourceLabel(key as never)} ×${amount}`);
  parts.push(`${coins} монет`);
  return parts.join(', ');
}

function fmtRate(value: number): string {
  if (value >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function workError(player: PlayerRecord, error: unknown): GameResponse {
  if (
    error instanceof ActionRejectedError ||
    error instanceof InsufficientCoinsError ||
    error instanceof InsufficientResourcesError
  ) {
    return respond(player, error.message, [
      { label: '⚒ Хозяйство', action: 'OPEN_MENU', payload: { menu: 'work' } },
      { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'stats' } },
    ]);
  }
  throw error;
}

function respond(player: PlayerRecord, text: string, buttons: GameButton[]): GameResponse {
  return {
    text,
    buttons,
    state: {
      playerId: player.id,
      location: player.currentLocation,
      node: player.currentState,
      hp: player.hp,
      maxHp: player.maxHp,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      coins: player.coins,
      level: player.level,
      xp: player.xp,
    },
  };
}
