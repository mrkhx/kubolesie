import {
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  WEEK6_DAY_XP,
  resourceLabel,
  type JobProfession,
} from '@kubolesie/content';
import type { CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError } from './errors';
import type { WeekCtx, WeekHost } from './week';
import { grantMetaAchievement, noteActivity } from './meta';
import { tickCrop } from './week2';

export const WEEK6_MENUS = ['station', 'gallery', 'switch', 'seal6'] as const;
export type Week6MenuId = (typeof WEEK6_MENUS)[number];

export function isWeek6Menu(menu: string): menu is Week6MenuId {
  return (WEEK6_MENUS as readonly string[]).includes(menu);
}

export const WEEK6_COMMANDS = [
  'BEGIN_DAY_36',
  'BEGIN_DAY_37',
  'BEGIN_DAY_38',
  'BEGIN_DAY_39',
  'BEGIN_DAY_40',
  'BEGIN_DAY_41',
  'BEGIN_DAY_42',
  'COMPLETE_DAY_36',
  'COMPLETE_DAY_37',
  'COMPLETE_DAY_38',
  'COMPLETE_DAY_39',
  'COMPLETE_DAY_40',
  'COMPLETE_DAY_41',
  'COMPLETE_DAY_42',
  'WEEK6_ACT',
] as const;

export const WEEK6_ENEMIES = ['rail_scuttler', 'dust_hound', 'ironback_brute', 'skrezhetnik', 'zatvornik'] as const;

export function isWeek6Enemy(id: string): boolean {
  return (WEEK6_ENEMIES as readonly string[]).includes(id);
}

export function isWeek6Location(id: string): boolean {
  return (
    id === 'abandoned_station_edge' ||
    id === 'collapsed_yard' ||
    id === 'old_loading_platform' ||
    id === 'sorting_yard' ||
    id === 'broken_railway' ||
    id === 'counterweight_pass' ||
    id === 'lower_gallery' ||
    id === 'crushed_storage' ||
    id === 'dark_haulway' ||
    id === 'switching_chamber' ||
    id === 'route_control_room' ||
    id === 'skrezhetnik_lair' ||
    id === 'upper_switchyard' ||
    id === 'signal_bridge' ||
    id === 'sealed_service_pass' ||
    id === 'sixth_seal_approach' ||
    id === 'station_depths' ||
    id === 'seal_2_chamber'
  );
}

const QUEST_BY_DAY: Record<number, { id: string; title: string }> = {
  36: { id: 'enter_abandoned_station', title: 'Заброшенный стан' },
  37: { id: 'restore_the_yard', title: 'Старая сортировка' },
  38: { id: 'lower_gallery_hunt', title: 'Нижние галереи' },
  39: { id: 'switching_chamber', title: 'Комната переключений' },
  40: { id: 'skrezhetnik_hunt', title: 'Охота на Скрежетника' },
  41: { id: 'unknown_contact', title: 'Прямой контакт' },
  42: { id: 'sixth_seal', title: 'Шестая печать' },
};

function flagNum(flags: Record<string, string>, key: string): number {
  const raw = flags[key];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function hasItem(ctx: WeekCtx, templateId: string): boolean {
  return ctx.items.some((item) => item.templateId === templateId);
}

function hasBow(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'bow') || Boolean(ctx.flags.has_bow);
}

function hasShield(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'shield') || Boolean(ctx.flags.has_shield);
}

function miraTrust(ctx: WeekCtx): number {
  return flagNum(ctx.flags, 'mira_trust');
}

function remWarm(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.showed_token_to_rem || ctx.flags.rem_revealed_hinge) && !ctx.flags.sold_rusty_token;
}

async function setFlag(host: WeekHost, ctx: WeekCtx, flag: string, value = '1') {
  await host.store.setFlag(ctx.player.id, flag, value);
  ctx.flags[flag] = value;
}

async function jobLevel(host: WeekHost, ctx: WeekCtx, profession: JobProfession): Promise<number> {
  const row = await host.store.getJob(ctx.player.id, profession);
  return row?.level ?? 1;
}

function routePicked(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week6_route_yard || ctx.flags.week6_route_platform || ctx.flags.week6_route_cart);
}

function sortingCleared(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week6_path_clear || ctx.flags.week6_path_weight || ctx.flags.week6_path_catwalk);
}

function switchResolved(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week6_switch_restored || ctx.flags.week6_switch_left);
}

function day41Picked(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week6_unknown_chased || ctx.flags.week6_unknown_mechanism || ctx.flags.week6_unknown_npc);
}

function socialPicked(ctx: WeekCtx): boolean {
  return Boolean(
    ctx.flags.week6_social_help || ctx.flags.week6_social_talk || ctx.flags.week6_social_pass || ctx.flags.week6_social_pvp,
  );
}

async function softCost(host: WeekHost, ctx: WeekCtx, energy: number, food = 0): Promise<string> {
  const bits: string[] = [];
  if (energy && ctx.player.energy >= energy) {
    await host.spend(ctx.player, energy);
    bits.push(`−${energy} энергии`);
  } else if (food && (ctx.resources.FOOD ?? 0) >= food) {
    await host.store.addResource(ctx.player.id, 'FOOD', -food);
    bits.push(`−${food} ${resourceLabel('FOOD')}`);
  } else {
    bits.push('без запаса — просто дольше');
  }
  return bits.join(', ');
}

export function week6Modifiers(
  ctx: WeekCtx,
  enemyId: string,
  payload: Record<string, unknown> = {},
  jobs: Partial<Record<JobProfession, number>> = {},
): {
  player: Partial<CombatantSnapshot>;
  enemy: Partial<CombatantSnapshot>;
  note: string;
  playerOpeningHits: number;
} {
  const player: Partial<CombatantSnapshot> = {};
  const enemy: Partial<CombatantSnapshot> = {};
  const bits: string[] = [];
  let playerOpeningHits = 0;
  const boss = enemyId === 'skrezhetnik' || enemyId === 'zatvornik';
  void payload;

  if (hasBow(ctx)) {
    playerOpeningHits = 1;
    player.speed = 8;
    bits.push('лук: первый удар');
  }
  if (hasItem(ctx, 'iron_sword') || ctx.flags.chose_iron_sword) {
    player.minDamage = 7;
    player.maxDamage = 10;
  } else if (hasItem(ctx, 'iron_axe') || ctx.flags.chose_iron_axe) {
    player.minDamage = 6;
    player.maxDamage = 9;
  } else if (hasBow(ctx)) {
    player.minDamage = 5;
    player.maxDamage = 8;
  }
  if (hasShield(ctx)) {
    player.defense = boss ? 6 : 4;
    bits.push(boss ? 'щит держит тяжёлый удар' : 'щит');
  }
  if (
    ctx.flags.root_barricade ||
    hasItem(ctx, 'root_brace') ||
    ctx.flags.mechanical_brace_used ||
    hasItem(ctx, 'mechanical_brace') ||
    ctx.flags.marsh_platform_used
  ) {
    player.defense = (player.defense ?? 0) + 2;
    bits.push('распорка держит площадку');
  }
  if (hasItem(ctx, 'path_charm') || ctx.flags.has_path_charm) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('оберег тропы');
  }
  if (hasItem(ctx, 'mire_charm') || ctx.flags.has_mire_charm) {
    player.dodge = (player.dodge ?? 0) + 4;
    bits.push('оберег топи');
  }
  if (hasItem(ctx, 'lock_charm') || ctx.flags.has_lock_charm) {
    player.dodge = (player.dodge ?? 0) + 4;
    bits.push('оберег затвора');
  }
  if (hasItem(ctx, 'root_charm')) {
    player.dodge = (player.dodge ?? 0) + 3;
    bits.push('корневой оберег');
  }
  if (ctx.flags.lantern_repaired && boss) {
    enemy.dodge = 0;
    player.critChance = 8;
    bits.push('фонарь: пазы видны');
  }
  if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    player.dodge = (player.dodge ?? 0) + 14;
    bits.push('питомец рядом');
  }
  if ((jobs.HUNTER ?? 0) >= 10) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    bits.push('охотник бьёт первым');
  }
  if ((jobs.LOGGER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('лесоруб укрепил площадку');
  }
  if ((jobs.MINER ?? 0) >= 10 && boss) {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('шахтёр видит слабый затвор');
  }
  if ((jobs.CRAFTER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('ремесленник читает крепёж');
  }
  if (ctx.flags.haul_line_used && enemyId === 'skrezhetnik') {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('канат: короткий угол');
  }
  if (ctx.flags.week6_switch_restored && boss) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    bits.push('возвращённый рычаг даёт первый ход');
  }
  if (enemyId === 'zatvornik') {
    if (ctx.flags.station_core_used) {
      enemy.hp = -25;
      bits.push('сердечник гасит затвор');
    }
    if (miraTrust(ctx) >= 2) {
      enemy.defense = (enemy.defense ?? 0) - 1;
      bits.push('Мира: бей ядро пути, не рычаг');
    }
    if (ctx.flags.week6_direct_contact) {
      enemy.dodge = enemy.dodge == null ? 0 : Math.max(0, enemy.dodge - 2);
      bits.push('слова с моста не уходят');
    }
    if (ctx.flags.week6_clan_shown) bits.push('знак клана не даёт силы — только взгляд');
  }
  return { player, enemy, note: bits.join(', '), playerOpeningHits };
}

export async function dispatchWeek6(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_36':
      return beginDay(host, ctx, 36);
    case 'BEGIN_DAY_37':
      return beginDay(host, ctx, 37);
    case 'BEGIN_DAY_38':
      return beginDay(host, ctx, 38);
    case 'BEGIN_DAY_39':
      return beginDay(host, ctx, 39);
    case 'BEGIN_DAY_40':
      return beginDay(host, ctx, 40);
    case 'BEGIN_DAY_41':
      return beginDay(host, ctx, 41);
    case 'BEGIN_DAY_42':
      return beginDay(host, ctx, 42);
    case 'COMPLETE_DAY_36':
      return completeDay(host, ctx, 36);
    case 'COMPLETE_DAY_37':
      return completeDay(host, ctx, 37);
    case 'COMPLETE_DAY_38':
      return completeDay(host, ctx, 38);
    case 'COMPLETE_DAY_39':
      return completeDay(host, ctx, 39);
    case 'COMPLETE_DAY_40':
      return completeDay(host, ctx, 40);
    case 'COMPLETE_DAY_41':
      return completeDay(host, ctx, 41);
    case 'COMPLETE_DAY_42':
      return completeDay(host, ctx, 42);
    case 'WEEK6_ACT':
      return week6Act(host, ctx, String(command.payload?.act ?? 'open'), command.payload ?? {}, eventId);
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openWeek6Menu(host: WeekHost, ctx: WeekCtx, menu: Week6MenuId): Promise<GameResponse> {
  if (!ctx.flags.week_5_complete) throw new ActionRejectedError('Заброшенный стан ещё закрыт.');
  if (menu === 'gallery') return galleryMenu(host, ctx);
  if (menu === 'switch') return switchMenu(host, ctx);
  if (menu === 'seal6') return prepSeal(host, ctx);
  return edgeMenu(host, ctx);
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (day === 36 && !ctx.flags.week_5_complete) {
    throw new ActionRejectedError('Сначала закрой пятую неделю.');
  }
  if (day > 36 && !ctx.flags[`day_${day - 1}_complete`]) {
    throw new ActionRejectedError('Сначала закрой предыдущий день.');
  }
  if (ctx.flags.week_6_complete) return host.renderNode(ctx.player, 'week6_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);

  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 2);

  const quest = QUEST_BY_DAY[day]!;
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: quest.id,
    status: 'ACTIVE',
    progress: {},
  });
  await setFlag(host, ctx, 'week_6_started');

  if (day === 36) {
    ctx.player.currentLocation = 'abandoned_station_edge';
    ctx.player.currentState = 'day36_start';
    await host.store.savePlayer(ctx.player);
    const node = await host.renderNode(ctx.player, 'day36_start');
    const extras: string[] = [];
    if (remWarm(ctx)) extras.push('Рем мягче: «Здесь кто-то был. Совсем недавно.»');
    if (ctx.flags.sold_rusty_token) extras.push('Рем коротко: «Жетон продан. Стан всё равно знает, где ты был.»');
    if (miraTrust(ctx) >= 2) extras.push('Мира: «Старые механизмы могли быть частью обслуживания сети. Не вся теория. Кусок.»');
    if (ctx.flags.lantern_repaired) extras.push('Фонарь ловит стружку раньше глаз.');
    if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) extras.push('Питомец жмётся к ноге и не хочет под платформы.');
    if (ctx.flags.network_changed_during_week5) extras.push('Знак тот же, что в топи. Только здесь его двигают руками.');
    if (extras.length) node.text = `${node.text}\n${extras.join('\n')}`;
    return node;
  }
  if (day === 37) {
    ctx.player.currentLocation = 'sorting_yard';
    ctx.player.currentState = 'day37_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day37_start');
  }
  if (day === 38) {
    ctx.player.currentLocation = 'lower_gallery';
    ctx.player.currentState = 'day38_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day38_start');
  }
  if (day === 39) {
    ctx.player.currentLocation = 'switching_chamber';
    ctx.player.currentState = 'day39_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day39_start');
  }
  if (day === 40) {
    ctx.player.currentLocation = 'skrezhetnik_lair';
    ctx.player.currentState = 'day40_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'skrezhetnik',
      title: 'Скрежетник',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day40_start');
  }
  if (day === 41) {
    ctx.player.currentLocation = 'upper_switchyard';
    ctx.player.currentState = 'day41_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day41_start');
  }
  ctx.player.currentLocation = 'seal_2_chamber';
  ctx.player.currentState = 'day42_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'sixth_seal_seen');
  await setFlag(host, ctx, 'zatvornik_seen');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'zatvornik',
    title: 'Затворник',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'sixth_seal',
    title: 'Шестая печать',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day42_start');
  if (miraTrust(ctx) >= 2) {
    node.text = `${node.text}\nМира: «Ядро в пути, не в рычаге. Если есть сердечник — вставь в паз до удара.»`;
  } else {
    node.text = `${node.text}\nМира держится сзади. «Не стой под затвором. Он врёт весом.»`;
  }
  return node;
}

async function completeDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (ctx.flags.week_6_complete && day === 42) return host.renderNode(ctx.player, 'week6_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);
  if (day === 36) {
    if (!ctx.flags.week6_recent_presence) throw new ActionRejectedError('Сначала прочитай свежие следы.');
    if (!routePicked(ctx)) throw new ActionRejectedError('Сначала выбери путь по стану.');
  } else if (day === 37) {
    if (!sortingCleared(ctx)) throw new ActionRejectedError('Сначала пройди один из трёх ходов сортировки.');
  } else if (day === 38) {
    if (!ctx.flags.visited_lower_gallery) throw new ActionRejectedError('Сначала нижние галереи.');
  } else if (day === 39) {
    if (!ctx.flags.week6_mechanism_examined) throw new ActionRejectedError('Сначала осмотри механизм.');
    if (!switchResolved(ctx)) throw new ActionRejectedError('Сначала реши: вернуть рычаг или оставить.');
  } else if (day === 40) {
    if (!ctx.flags.defeated_skrezhetnik) throw new ActionRejectedError('Сначала Скрежетник.');
  } else if (day === 41) {
    if (!ctx.flags.week6_direct_contact) throw new ActionRejectedError('Сначала выйди на мост.');
    if (!day41Picked(ctx)) throw new ActionRejectedError('Сначала реши, куда идти после него.');
  } else if (day === 42) {
    if (!ctx.flags.zatvornik_defeated) throw new ActionRejectedError('Сначала Затворник.');
  }

  const questId = QUEST_BY_DAY[day]!.id;
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', `day_${day}`);
  if (ok) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId,
      status: 'CLAIMED',
      progress: {},
    });
    await host.addXp(ctx.player, WEEK6_DAY_XP[day as keyof typeof WEEK6_DAY_XP]);
  }
  await setFlag(host, ctx, `day_${day}_complete`);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: questId });
  await noteActivity(host.store, ctx.player, { type: 'day', day });

  if (day === 42) {
    await setFlag(host, ctx, 'seen_one_seal');
    await setFlag(host, ctx, 'week_6_complete');
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'one_seal',
      title: 'Одна печать',
      seen: true,
      defeated: false,
    });
    await noteActivity(host.store, ctx.player, { type: 'week', week: 6 });
    await grantMetaAchievement(host.store, ctx.player.id, 'WEEK_SIX_COMPLETE');
    return host.renderNode(ctx.player, 'one_seal');
  }
  return host.renderNode(ctx.player, `day${day}_complete`);
}

async function week6Act(
  host: WeekHost,
  ctx: WeekCtx,
  act: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  if (!ctx.flags.week_5_complete) throw new ActionRejectedError('Заброшенный стан ещё закрыт.');
  if (act === 'edge') return edgeMenu(host, ctx);
  if (act === 'inspect') return inspectYard(host, ctx);
  if (act === 'gather_edge') return gatherEdge(host, ctx);
  if (act === 'routes') return routeMenu(host, ctx);
  if (act === 'route_yard') return pickRoute(host, ctx, 'yard');
  if (act === 'route_platform') return pickRoute(host, ctx, 'platform');
  if (act === 'route_cart') return pickRoute(host, ctx, 'cart');
  if (act === 'sort') return sortMenu(host, ctx);
  if (act === 'path_clear') return falsePath(host, ctx, 'clear');
  if (act === 'path_weight') return falsePath(host, ctx, 'weight');
  if (act === 'path_catwalk') return falsePath(host, ctx, 'catwalk');
  if (act === 'gallery') return galleryMenu(host, ctx);
  if (act === 'forage') return forage(host, ctx, eventId);
  if (act === 'switch') return switchMenu(host, ctx);
  if (act === 'examine_switch') return examineSwitch(host, ctx);
  if (act === 'restore_switch') return restoreSwitch(host, ctx);
  if (act === 'leave_switch') return leaveSwitch(host, ctx);
  if (act === 'skrezhetnik') return skrezhetnikGate(host, ctx);
  if (act === 'use_line') return useLine(host, ctx);
  if (act === 'use_brace') return useBrace(host, ctx);
  if (act === 'contact') return contactMenu(host, ctx);
  if (act === 'speak') return speakUnknown(host, ctx);
  if (act === 'chase') return day41Pick(host, ctx, 'chase');
  if (act === 'check_mech') return day41Pick(host, ctx, 'mech');
  if (act === 'call_npc') return day41Pick(host, ctx, 'npc');
  if (act === 'social') return socialMenu(host, ctx);
  if (act === 'help') return socialPick(host, ctx, 'help');
  if (act === 'talk') return socialPick(host, ctx, 'talk');
  if (act === 'pass') return socialPick(host, ctx, 'pass');
  if (act === 'pvp') return socialPick(host, ctx, 'pvp');
  if (act === 'clan_show') return clanPick(host, ctx, true);
  if (act === 'clan_hide') return clanPick(host, ctx, false);
  if (act === 'clan') return clanMenu(host, ctx);
  if (act === 'use_core') return useStationCore(host, ctx);
  if (act === 'prep') return prepSeal(host, ctx);
  if (act === 'seal') return prepSeal(host, ctx);
  if (act === 'open') return week6Hub(host, ctx);
  void payload;
  return week6Hub(host, ctx);
}

async function edgeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'abandoned_station_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_abandoned_station');
  const buttons: GameButton[] = [
    { label: 'Осмотреть двор', action: 'WEEK6_ACT', payload: { act: 'inspect' } },
    { label: 'Собрать лом', action: 'WEEK6_ACT', payload: { act: 'gather_edge' } },
  ];
  if (ctx.flags.week6_recent_presence && !routePicked(ctx)) {
    buttons.push({ label: 'Выбрать путь', action: 'WEEK6_ACT', payload: { act: 'routes' } });
  }
  if (ctx.flags.week6_recent_presence && routePicked(ctx) && !ctx.flags.day_36_complete) {
    buttons.push({ label: 'Завершить День 36', action: 'COMPLETE_DAY_36' });
  } else if (ctx.flags.day_36_complete && buttons.length < 4) {
    buttons.push({ label: 'К сортировке', action: 'WEEK6_ACT', payload: { act: 'sort' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Край заброшенного стана. Платформы. Камень. Пыль. Рычаг ещё тёплый.',
    ctx.flags.week6_recent_presence ? 'Следы прочитаны. Здесь кто-то был совсем недавно.' : 'Двор не прочитан.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function inspectYard(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'collapsed_yard';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'week6_recent_presence');
  await setFlag(host, ctx, 'visited_abandoned_station');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'recent_station_activity',
    title: 'Свежий след на стане',
    seen: true,
    defeated: false,
  });
  const mira =
    miraTrust(ctx) >= 2
      ? '\nМира: «Стружка светлая. Рычаг двигали сегодня, не в прошлом сезоне.»'
      : '';
  const rem = remWarm(ctx)
    ? '\nРем: «Здесь кто-то был. Совсем недавно.»'
    : '\nРем коротко: «Свежий след. Смотри.»';
  return edgeMenu(
    host,
    await host.load(ctx.player),
    `Ящик сдвинут. На пыли — шаг. Канат натянут. Рычаг тёплый.${mira}${rem}`,
  );
}

async function gatherEdge(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'old_loading_platform';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_abandoned_station');
  await host.spend(ctx.player, 2);
  const first = await host.store.tryClaimReward(ctx.player.id, 'week6', 'edge_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'LOG', 3);
    await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 4);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'GEAR_SCRAP' });
    const buttons: GameButton[] = [{ label: 'Ещё осмотреть', action: 'WEEK6_ACT', payload: { act: 'edge' } }];
    if (ctx.flags.week6_recent_presence && routePicked(ctx) && !ctx.flags.day_36_complete) {
      buttons.push({ label: 'Завершить День 36', action: 'COMPLETE_DAY_36' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(
      ctx.player,
      `Первый склад стана. +3 ${resourceLabel('LOG')}, +4 ${resourceLabel('GEAR_SCRAP')}. Шестерёнки и скобы, не провода.`,
      buttons.slice(0, 5),
    );
  }
  await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'GEAR_SCRAP' });
  return edgeMenu(host, await host.load(ctx.player), `+1 ${resourceLabel('GEAR_SCRAP')}. Первый склад уже взят.`);
}

async function routeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, extra || 'Путь уже выбран. Все сходятся.');
  ctx.player.currentLocation = 'collapsed_yard';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Двор', action: 'WEEK6_ACT', payload: { act: 'route_yard' } },
    { label: 'Платформа', action: 'WEEK6_ACT', payload: { act: 'route_platform' } },
    { label: 'След тележки', action: 'WEEK6_ACT', payload: { act: 'route_cart' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  return host.respond(
    ctx.player,
    extra || 'Три пути по стану. Все сходятся у сортировки. Пыль следы ещё держит.',
    buttons.slice(0, 5),
  );
}

async function pickRoute(host: WeekHost, ctx: WeekCtx, kind: 'yard' | 'platform' | 'cart'): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, 'Путь уже выбран.');
  if (kind === 'yard') await setFlag(host, ctx, 'week6_route_yard');
  else if (kind === 'platform') await setFlag(host, ctx, 'week6_route_platform');
  else await setFlag(host, ctx, 'week6_route_cart');
  const note =
    kind === 'yard'
      ? 'Идёшь двором. Ящики. Пыль. Через час — та же сортировка.'
      : kind === 'platform'
        ? 'Платформа скрипит. Канат ещё держит. Снова сортировка.'
        : 'След тележки. Направляющие ведут к тому же двору.';
  return edgeMenu(host, await host.load(ctx.player), note);
}

async function sortMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'sorting_yard';
  await host.store.savePlayer(ctx.player);
  if (sortingCleared(ctx)) {
    const buttons: GameButton[] = [];
    if (!ctx.flags.day_37_complete) buttons.push({ label: 'Завершить День 37', action: 'COMPLETE_DAY_37' });
    buttons.push({ label: 'В галереи', action: 'WEEK6_ACT', payload: { act: 'gallery' } });
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(ctx.player, extra || 'Сортировка пройдена. Галереи дышат пылью.', buttons.slice(0, 5));
  }
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const crafter = await jobLevel(host, ctx, 'CRAFTER');
  const buttons: GameButton[] = [
    { label: 'Расчистить', action: 'WEEK6_ACT', payload: { act: 'path_clear' } },
    { label: 'Противовес', action: 'WEEK6_ACT', payload: { act: 'path_weight' } },
    { label: 'Мостки', action: 'WEEK6_ACT', payload: { act: 'path_catwalk' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  const text = [
    extra,
    'Три хода. Профессия не запирает — только короче.',
    `Лесоруб L${logger}: ${logger >= 5 ? 'читает балки' : 'завал дольше'}.`,
    `Шахтёр L${miner}: ${miner >= 5 ? 'видит камень' : 'завал сыпет'}.`,
    `Ремесленник L${crafter} / охотник L${hunter}: ${crafter >= 5 || hunter >= 5 ? 'механизм или обход' : 'пойдёт дольше'}.`,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function falsePath(host: WeekHost, ctx: WeekCtx, kind: 'clear' | 'weight' | 'catwalk'): Promise<GameResponse> {
  if (sortingCleared(ctx)) return sortMenu(host, ctx, 'Уже пройдено.');
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const crafter = await jobLevel(host, ctx, 'CRAFTER');
  const match =
    (kind === 'clear' && (logger >= 5 || miner >= 5)) ||
    (kind === 'weight' && crafter >= 5) ||
    (kind === 'catwalk' && hunter >= 5);
  if (kind === 'clear') await setFlag(host, ctx, 'week6_path_clear');
  else if (kind === 'weight') await setFlag(host, ctx, 'week6_path_weight');
  else await setFlag(host, ctx, 'week6_path_catwalk');
  if (match) {
    await setFlag(host, ctx, 'week6_path_adv');
    if (kind === 'clear') {
      await host.store.addResource(ctx.player.id, 'LOG', 3);
      await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'GEAR_SCRAP' });
      if (miner >= 5) {
        await host.store.addResource(ctx.player.id, 'COBBLESTONE', 2);
        await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'COBBLESTONE' });
      }
    } else if (kind === 'weight') {
      await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 3);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'GEAR_SCRAP' });
    } else {
      await host.store.addResource(ctx.player.id, 'HIDE', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'HIDE' });
    }
    const note =
      kind === 'clear'
        ? 'Завал читается. Брёвна и лом без обхода.'
        : kind === 'weight'
          ? 'Противовес садится. Мост опускается. Лом без круга.'
          : 'Мостки держат. Обход короткий. Шкура без круга.';
    return sortMenu(host, await host.load(ctx.player), note);
  }
  const cost = await softCost(host, ctx, 2, 1);
  const note =
    kind === 'clear'
      ? `Завал тяжёлый. Вышел. ${cost}. Не заперто.`
      : kind === 'weight'
        ? `Канат врёт. Вышел. ${cost}. Не заперто.`
        : `Мостки скрипят. Вышел. ${cost}. Не заперто.`;
  return sortMenu(host, await host.load(ctx.player), note);
}

async function galleryMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!sortingCleared(ctx) && !ctx.flags.day_37_complete) {
    throw new ActionRejectedError('Сначала сортировка.');
  }
  ctx.player.currentLocation = 'lower_gallery';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_lower_gallery');
  const buttons: GameButton[] = [
    { label: 'Шпальник', action: 'START_PVE', payload: { enemyId: 'rail_scuttler' } },
    { label: 'Пыльник', action: 'START_PVE', payload: { enemyId: 'dust_hound' } },
    { label: 'Железоспин', action: 'START_PVE', payload: { enemyId: 'ironback_brute' } },
  ];
  if (ctx.flags.day_38_complete) {
    buttons.push({ label: 'Собрать', action: 'WEEK6_ACT', payload: { act: 'forage' } });
  } else {
    buttons.push({ label: 'Завершить День 38', action: 'COMPLETE_DAY_38' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    extra || 'Нижние галереи. Повторные бои дают камень, уголь и лом. Не ферма опыта.',
    buttons.slice(0, 5),
  );
}

async function forage(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  if (!ctx.flags.visited_lower_gallery && !sortingCleared(ctx)) {
    throw new ActionRejectedError('Собирать негде.');
  }
  await host.spend(ctx.player, 2);
  await host.store.addResource(ctx.player.id, 'FOOD', 1);
  await host.store.addResource(ctx.player.id, 'COBBLESTONE', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'FOOD' });
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'COBBLESTONE' });
  const daily = await host.store.tryClaimReward(
    ctx.player.id,
    'week6',
    `forage:${host.now().toISOString().slice(0, 10)}`,
  );
  if (daily) {
    await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'GEAR_SCRAP' });
  }
  void eventId;
  const next = await host.load(ctx.player);
  const note = daily
    ? `Собрано: +1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('COBBLESTONE')}, +2 ${resourceLabel('GEAR_SCRAP')} (раз в сутки).`
    : `+1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('COBBLESTONE')}. Суточный лом уже снят.`;
  return galleryMenu(host, next, note);
}

async function switchMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'switching_chamber';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.week6_mechanism_examined) {
    buttons.push({ label: 'Изучить механизм', action: 'WEEK6_ACT', payload: { act: 'examine_switch' } });
  } else if (!switchResolved(ctx)) {
    buttons.push({ label: 'Вернуть рычаг', action: 'WEEK6_ACT', payload: { act: 'restore_switch' } });
    buttons.push({ label: 'Не трогать', action: 'WEEK6_ACT', payload: { act: 'leave_switch' } });
  }
  if (switchResolved(ctx) && !ctx.flags.day_39_complete) {
    buttons.push({ label: 'Завершить День 39', action: 'COMPLETE_DAY_39' });
  }
  if (ctx.flags.day_39_complete) {
    buttons.push({ label: 'К логову', action: 'WEEK6_ACT', payload: { act: 'skrezhetnik' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const rem = remWarm(ctx)
    ? 'Рем: «Это путь обслуживания. Кто-то ходил здесь, чтобы менять направление.»'
    : 'Рем коротко: «Рычаги не сами.»';
  const mira =
    miraTrust(ctx) >= 2
      ? 'Мира: «Стан обслуживал узлы. Здесь можно было менять нагрузку сети. Это уже не догадка.»'
      : 'Мира даёт мало. «Указатели врут сильнее стрелок в топи. Не спрашивай, кто.»';
  const text = [
    extra,
    'Комната переключений. Каменные каналы. Пазы. Противовесы. Дерево и железо. Не пульт.',
    rem,
    mira,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function examineSwitch(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'week6_mechanism_examined');
  ctx.player.currentLocation = 'route_control_room';
  await host.store.savePlayer(ctx.player);
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'station_network_interface',
    title: 'Интерфейс сети на стане',
    seen: true,
    defeated: false,
  });
  return switchMenu(
    host,
    await host.load(ctx.player),
    'Указатели сети сходятся в пазах. Старое положение — влево, к шестой печати. Свежий ход сдвинут вправо. Кто-то правил маршрут после того, как стан бросили.',
  );
}

async function restoreSwitch(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.week6_mechanism_examined) throw new ActionRejectedError('Сначала изучи механизм.');
  if (switchResolved(ctx)) return switchMenu(host, ctx, 'Уже решено.');
  await setFlag(host, ctx, 'week6_switch_restored');
  if ((ctx.resources.STATION_CORE ?? 0) >= 1 || ctx.flags.has_station_core) {
    if ((ctx.resources.STATION_CORE ?? 0) >= 1) {
      await host.store.addResource(ctx.player.id, 'STATION_CORE', -1);
    }
    await setFlag(host, ctx, 'station_core_used');
    await host.store.setFlag(ctx.player.id, 'station_core_kept', '');
    delete ctx.flags.station_core_kept;
    return switchMenu(
      host,
      await host.load(ctx.player),
      'Сердечник сел в паз. Рычаг вернулся влево. Старый маршрут к печати снова читается.',
    );
  }
  if ((ctx.resources.GEAR_SCRAP ?? 0) >= 2) {
    await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', -2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'GEAR_SCRAP' });
    return switchMenu(
      host,
      await host.load(ctx.player),
      'Лом держит паз. Рычаг тяжёлый, но встаёт. Старый маршрут читается без сердечника.',
    );
  }
  const cost = await softCost(host, ctx, 2, 1);
  return switchMenu(
    host,
    await host.load(ctx.player),
    `Рычаг возвращаешь руками. ${cost}. Старый маршрут читается. Не заперто.`,
  );
}

async function leaveSwitch(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.week6_mechanism_examined) throw new ActionRejectedError('Сначала изучи механизм.');
  if (switchResolved(ctx)) return switchMenu(host, ctx, 'Уже решено.');
  await setFlag(host, ctx, 'week6_switch_left');
  return switchMenu(host, await host.load(ctx.player), 'Не трогаешь. Свежий ход остаётся врать вправо. Путь открыт.');
}

async function skrezhetnikGate(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'skrezhetnik_lair';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [{ label: 'Бить Скрежетника', action: 'START_PVE', payload: { enemyId: 'skrezhetnik' } }];
  if (hasItem(ctx, 'haul_line') && !ctx.flags.haul_line_used) {
    buttons.push({ label: 'Канат', action: 'WEEK6_ACT', payload: { act: 'use_line' } });
  }
  if (hasItem(ctx, 'mechanical_brace') && !ctx.flags.mechanical_brace_used && buttons.length < 3) {
    buttons.push({ label: 'Распорка', action: 'WEEK6_ACT', payload: { act: 'use_brace' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({ label: 'С дистанции', action: 'START_PVE', payload: { enemyId: 'skrezhetnik', move: 'bow' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Скрежетник среди лебёдок. На панцире скобы и пластины. Не механизм. Не страж печати. Лук, щит, канат, распорка помогают. Без них — можно.',
    buttons.slice(0, 5),
  );
}

async function useLine(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'haul_line')) {
    throw new ActionRejectedError('Каната нет. Волокно, палка и лом.');
  }
  if (ctx.flags.haul_line_used) return skrezhetnikGate(host, ctx);
  await setFlag(host, ctx, 'haul_line_used');
  await setFlag(host, ctx, 'has_haul_line');
  if (!ctx.flags.defeated_skrezhetnik) return skrezhetnikGate(host, await host.load(ctx.player));
  return prepSeal(host, await host.load(ctx.player));
}

async function useBrace(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'mechanical_brace')) {
    throw new ActionRejectedError('Распорки нет. Лом, доски и слиток.');
  }
  if (ctx.flags.mechanical_brace_used) {
    if (!ctx.flags.defeated_skrezhetnik) return skrezhetnikGate(host, ctx);
    return prepSeal(host, ctx);
  }
  await setFlag(host, ctx, 'mechanical_brace_used');
  await setFlag(host, ctx, 'has_mechanical_brace');
  if (!ctx.flags.defeated_skrezhetnik) return skrezhetnikGate(host, await host.load(ctx.player));
  return prepSeal(host, await host.load(ctx.player));
}

const UNKNOWN_LINES = [
  'Силуэт на той стороне моста. За решёткой рычагов. Лица нет. Он заканчивает ход — противовес падает, указатель сети сдвигается.',
  '— Стой. Это ты двигаешь рычаги?',
  'Он не оборачивается сразу.',
  '— Ты ещё думаешь, что спасаешь сеть.',
  '— Кто ты?',
  '— Поздний вопрос.',
  'Механизм срабатывает. Проход разделяет вас. Он уходит в тень сортировки. Имени нет. Лица нет.',
].join('\n');

async function contactMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'upper_switchyard';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.week6_direct_contact) {
    buttons.push({ label: 'Окликнуть', action: 'WEEK6_ACT', payload: { act: 'speak' } });
  } else if (!day41Picked(ctx)) {
    buttons.push({ label: 'Догнать', action: 'WEEK6_ACT', payload: { act: 'chase' } });
    buttons.push({ label: 'Проверить механизм', action: 'WEEK6_ACT', payload: { act: 'check_mech' } });
    buttons.push({ label: 'Позвать Рема', action: 'WEEK6_ACT', payload: { act: 'call_npc' } });
  }
  if (ctx.flags.week6_direct_contact && day41Picked(ctx) && !socialPicked(ctx) && buttons.length < 3) {
    buttons.push({ label: 'Путники', action: 'WEEK6_ACT', payload: { act: 'social' } });
  }
  if (ctx.flags.week6_direct_contact && day41Picked(ctx) && !ctx.flags.day_41_complete) {
    buttons.push({ label: 'Завершить День 41', action: 'COMPLETE_DAY_41' });
  }
  if (ctx.flags.day_41_complete) {
    buttons.push({ label: 'К своду', action: 'WEEK6_ACT', payload: { act: 'prep' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    ctx.flags.week6_direct_contact
      ? 'Мост пуст. Две реплики остались в воздухе. Он знает, что ты закрываешь печати.'
      : 'Силуэт за решёткой. Лица нет. Он заканчивает ход.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function speakUnknown(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'week6_direct_contact');
  ctx.player.currentLocation = 'signal_bridge';
  await host.store.savePlayer(ctx.player);
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'direct_unknown_contact',
    title: 'Прямой контакт',
    seen: true,
    defeated: false,
  });
  const known =
    ctx.flags.unknown_blue_mineral || ctx.flags.found_blue_light || ctx.flags.week5_distant_watcher_seen
      ? '\nРост. Манера стоять. Что-то кажется знакомым. Доказательств нет.'
      : '\nСилуэт человеческий. Или достаточно близко, чтобы назвать его разумным. Не больше.';
  return contactMenu(host, await host.load(ctx.player), `${UNKNOWN_LINES}${known}`);
}

async function day41Pick(host: WeekHost, ctx: WeekCtx, kind: 'chase' | 'mech' | 'npc'): Promise<GameResponse> {
  if (!ctx.flags.week6_direct_contact) throw new ActionRejectedError('Сначала окликни его.');
  if (day41Picked(ctx)) return contactMenu(host, ctx, 'Путь после него уже выбран.');
  if (kind === 'chase') {
    await setFlag(host, ctx, 'week6_unknown_chased');
    await setFlag(host, ctx, 'week6_marked_fastener');
    const first = await host.store.tryClaimReward(ctx.player.id, 'week6', 'chase');
    if (first) {
      await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 2);
      await host.changeCoins(ctx.player, 6, 'week6_chase', 'clue');
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'GEAR_SCRAP' });
    }
    ctx.player.currentLocation = 'sealed_service_pass';
    await host.store.savePlayer(ctx.player);
    return contactMenu(
      host,
      await host.load(ctx.player),
      'Гнался. Не догнал. На пазу — меченая скоба, ещё тёплая. Лица нет. Имени нет.',
    );
  }
  if (kind === 'mech') {
    await setFlag(host, ctx, 'week6_unknown_mechanism');
    return contactMenu(
      host,
      await host.load(ctx.player),
      'Рычаг ещё качается. Свежий ход уводит нагрузку в сторону от печати. Он правил сеть, пока ты стоял на мосту. Это не древний след.',
    );
  }
  await setFlag(host, ctx, 'week6_unknown_npc');
  const rem = remWarm(ctx)
    ? 'Рем: «Он говорит, как человек, который уже решил. Не как зверь.»'
    : 'Рем коротко: «Разумный. Знает, что ты идёшь.»';
  const mira =
    miraTrust(ctx) >= 2
      ? 'Мира: «Он знает, что печати закрываются. И считает это ошибкой. Не зови его врагом, пока не знаешь, какую.»'
      : 'Мира почти молчит. «Две фразы. Этого мало для имени. Достаточно, чтобы не спать.»';
  return contactMenu(host, await host.load(ctx.player), `${rem}\n${mira}`);
}

async function socialMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!ctx.flags.week6_direct_contact) throw new ActionRejectedError('Сначала мост.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const buttons: GameButton[] = [];
  if (!socialPicked(ctx)) {
    buttons.push({ label: 'Помочь', action: 'WEEK6_ACT', payload: { act: 'help' } });
    buttons.push({ label: 'Обменяться', action: 'WEEK6_ACT', payload: { act: 'talk' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK6_ACT', payload: { act: 'pass' } });
  }
  if (clan && !ctx.flags.week6_clan_shown && !ctx.flags.week6_clan_hidden && buttons.length < 4) {
    buttons.push({ label: 'Знак клана', action: 'WEEK6_ACT', payload: { act: 'clan' } });
  }
  if (socialPicked(ctx) && !ctx.flags.day_41_complete) {
    buttons.push({ label: 'Завершить День 41', action: 'COMPLETE_DAY_41' });
  }
  if (ctx.flags.week6_social_pvp && buttons.length < 4) {
    buttons.push({ label: 'Стычка', action: 'START_PVP' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const clanLine = clan
    ? `Знак ${clan.clan.tag} здесь уже знают. Можно показать. Не обязательно.`
    : 'Клана нет — нейтральный путь открыт.';
  return host.respond(
    ctx.player,
    [extra, 'Сборщики лома сбились со свежих меток. Три пути, все ведут дальше. Это не тот, кто на мосту.', clanLine]
      .filter(Boolean)
      .join('\n'),
    buttons.slice(0, 5),
  );
}

async function socialPick(
  host: WeekHost,
  ctx: WeekCtx,
  kind: 'help' | 'talk' | 'pass' | 'pvp',
): Promise<GameResponse> {
  if (!ctx.flags.week6_direct_contact) throw new ActionRejectedError('Сначала мост.');
  if (socialPicked(ctx)) return socialMenu(host, ctx, 'Группа уже пройдена.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const discount = Boolean(clan && ctx.flags.week6_clan_shown);
  if (kind === 'help') {
    await setFlag(host, ctx, 'week6_social_help');
    const cost = await softCost(host, ctx, 1, discount ? 0 : 1);
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week6', 'social');
    if (ok) {
      await host.changeCoins(ctx.player, 6, 'week6_social', 'help');
      await host.store.addResource(ctx.player.id, 'FOOD', discount ? 3 : 2);
    }
    return socialMenu(host, await host.load(ctx.player), `Помог пройти сортировку. ${cost}. Паёк. +6 монет.`);
  }
  if (kind === 'talk') {
    await setFlag(host, ctx, 'week6_social_talk');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week6', 'social');
    if (ok) {
      await host.store.addResource(ctx.player.id, 'GEAR_SCRAP', 1);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'GEAR_SCRAP' });
    }
    return socialMenu(
      host,
      await host.load(ctx.player),
      'Слова вместо клинка. Они тоже видели силуэт на мосту. Лом за карту. Стычка не нужна.',
    );
  }
  if (kind === 'pass') {
    await setFlag(host, ctx, 'week6_social_pass');
    return socialMenu(host, await host.load(ctx.player), 'Проходишь мимо. Они не зовут. Путь открыт.');
  }
  await setFlag(host, ctx, 'week6_social_pvp');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'week6', 'social');
  if (ok) await host.changeCoins(ctx.player, 8, 'week6_social', 'pvp');
  return socialMenu(
    host,
    await host.load(ctx.player),
    'Спор объявлен. Асинхронная стычка — по желанию. Вещи не сгорят. +8 монет за вызов.',
  );
}

async function clanMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  const clan = await host.store.getPlayerClan(ctx.player.id);
  if (!clan) throw new ActionRejectedError('Клана нет. Нейтральный путь и так открыт.');
  const buttons: GameButton[] = [];
  if (!ctx.flags.week6_clan_shown && !ctx.flags.week6_clan_hidden) {
    buttons.push({ label: 'Показать', action: 'WEEK6_ACT', payload: { act: 'clan_show' } });
    buttons.push({ label: 'Скрыть', action: 'WEEK6_ACT', payload: { act: 'clan_hide' } });
  }
  buttons.push({ label: 'Группа', action: 'WEEK6_ACT', payload: { act: 'social' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    `Знак ${clan.clan.tag} здесь уже знают. Показать или скрыть — не сила удара. Показанный знак чуть дешевле пайка.`,
    buttons.slice(0, 5),
  );
}

async function clanPick(host: WeekHost, ctx: WeekCtx, show: boolean): Promise<GameResponse> {
  const clan = await host.store.getPlayerClan(ctx.player.id);
  if (!clan) throw new ActionRejectedError('Клана нет. Нейтральный путь и так открыт.');
  if (show) await setFlag(host, ctx, 'week6_clan_shown');
  else await setFlag(host, ctx, 'week6_clan_hidden');
  return socialMenu(
    host,
    await host.load(ctx.player),
    show ? `Знак ${clan.clan.tag} виден. Это не сила удара. Только взгляд и паёк.` : 'Знак скрыт. Стан не спрашивает стаю.',
  );
}

async function useStationCore(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.station_core_used) return prepSeal(host, ctx);
  if ((ctx.resources.STATION_CORE ?? 0) < 1 && !ctx.flags.has_station_core) {
    throw new ActionRejectedError('Сердечника нет. Скрежетник ещё или уже потрачено.');
  }
  if ((ctx.resources.STATION_CORE ?? 0) >= 1) {
    await host.store.addResource(ctx.player.id, 'STATION_CORE', -1);
  }
  await setFlag(host, ctx, 'station_core_used');
  await host.store.setFlag(ctx.player.id, 'station_core_kept', '');
  delete ctx.flags.station_core_kept;
  return prepSeal(host, await host.load(ctx.player));
}

async function prepSeal(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'seal_2_chamber';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'zatvornik_seen');
  const jobs = {
    LOGGER: await jobLevel(host, ctx, 'LOGGER'),
    MINER: await jobLevel(host, ctx, 'MINER'),
    HUNTER: await jobLevel(host, ctx, 'HUNTER'),
    CRAFTER: await jobLevel(host, ctx, 'CRAFTER'),
  };
  const lines = [
    'Глубина стана. Шестая печать. Каменные затворы. Затворник держит ядро — не правит сеть. Не тот, кто говорил с моста.',
    hasBow(ctx) ? 'Лук: внешний узел с дистанции.' : 'Без лука — вплотную.',
    hasShield(ctx) ? 'Щит: тяжёлый удар слабее.' : 'Без щита — принимай удар.',
    ctx.flags.lantern_repaired ? 'Фонарь показывает пазы.' : 'Без фонаря силуэт плывёт. Проход есть.',
    ctx.flags.station_core_used
      ? 'Сердечник уже в пазу.'
      : ctx.flags.has_station_core
        ? 'Сердечник можно вставить сейчас.'
        : 'Без сердечника — просто дольше.',
    miraTrust(ctx) >= 2 ? 'Мира: бей ядро пути.' : 'Мира почти молчит.',
    jobs.HUNTER >= 10 ? 'Охотник бьёт первым.' : '',
    jobs.LOGGER >= 10 ? 'Лесоруб укрепил площадку.' : '',
    jobs.MINER >= 10 ? 'Шахтёр видит слабый затвор.' : '',
    jobs.CRAFTER >= 10 ? 'Ремесленник читает крепёж.' : '',
    ctx.flags.mechanical_brace_used ? 'Распорка уже стоит.' : hasItem(ctx, 'mechanical_brace') ? 'Распорку можно поставить.' : '',
    ctx.flags.week6_switch_restored ? 'Возвращённый рычаг даёт первый ход.' : '',
    ctx.flags.week6_direct_contact ? 'Слова с моста не уходят.' : '',
  ].filter(Boolean);
  const buttons: GameButton[] = [
    { label: 'Бить ядро', action: 'START_PVE', payload: { enemyId: 'zatvornik', move: 'core' } },
  ];
  if ((ctx.flags.has_station_core || (ctx.resources.STATION_CORE ?? 0) > 0) && !ctx.flags.station_core_used) {
    buttons.push({ label: 'Вставить сердечник', action: 'WEEK6_ACT', payload: { act: 'use_core' } });
  }
  if (hasItem(ctx, 'mechanical_brace') && !ctx.flags.mechanical_brace_used && buttons.length < 4) {
    buttons.push({ label: 'Поставить распорку', action: 'WEEK6_ACT', payload: { act: 'use_brace' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({
      label: 'Ядро с дистанции',
      action: 'START_PVE',
      payload: { enemyId: 'zatvornik', move: 'bow' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons.slice(0, 5));
}

async function week6Hub(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.week_6_complete) return host.renderNode(ctx.player, 'week6_complete');
  const buttons: GameButton[] = [];
  if (!ctx.flags.day_36_complete) {
    buttons.push({ label: 'Край стана', action: 'WEEK6_ACT', payload: { act: 'edge' } });
  } else if (!ctx.flags.day_37_complete) {
    buttons.push({ label: 'Сортировка', action: 'WEEK6_ACT', payload: { act: 'sort' } });
  } else if (!ctx.flags.day_38_complete) {
    buttons.push({ label: 'Галереи', action: 'WEEK6_ACT', payload: { act: 'gallery' } });
  } else if (!ctx.flags.day_39_complete) {
    buttons.push({ label: 'Рычаги', action: 'WEEK6_ACT', payload: { act: 'switch' } });
  } else if (!ctx.flags.day_40_complete) {
    buttons.push({ label: 'Скрежетник', action: 'WEEK6_ACT', payload: { act: 'skrezhetnik' } });
  } else if (!ctx.flags.day_41_complete) {
    buttons.push({ label: 'Мост', action: 'WEEK6_ACT', payload: { act: 'contact' } });
  } else {
    buttons.push({ label: 'Свод', action: 'WEEK6_ACT', payload: { act: 'prep' } });
  }
  if (ctx.flags.day_37_complete && buttons.length < 3) {
    buttons.push({ label: 'Галереи', action: 'WEEK6_ACT', payload: { act: 'gallery' } });
  }
  if (ctx.flags.day_36_complete && buttons.length < 3) {
    buttons.push({ label: 'Край стана', action: 'WEEK6_ACT', payload: { act: 'edge' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Заброшенный стан. Шесть печатей ещё не молчат. Пять уже. Одна близко. На мосту кто-то говорит.',
    buttons.slice(0, 5),
  );
}

export async function applyWeek6Victory(host: WeekHost, ctx: WeekCtx, enemyId: string): Promise<string[]> {
  const notes: string[] = [];
  if (enemyId === 'skrezhetnik') {
    await setFlag(host, ctx, 'defeated_skrezhetnik');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'skrezhetnik');
    if (first) {
      await host.store.addResource(ctx.player.id, 'STATION_CORE', 1);
      await setFlag(host, ctx, 'has_station_core');
      await setFlag(host, ctx, 'station_core_kept');
      notes.push(`+1 ${resourceLabel('STATION_CORE')}.`);
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'skrezhetnik_hunt',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'skrezhetnik_hunt' });
    } else {
      notes.push('Скрежетник уже отдал сердечник.');
    }
  }
  if (enemyId === 'zatvornik') {
    await setFlag(host, ctx, 'zatvornik_defeated');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'zatvornik');
    if (first) {
      await host.store.addResource(ctx.player.id, 'SEAL_SHARD_2', 1);
      notes.push(`+1 ${resourceLabel('SEAL_SHARD_2')}.`);
      await host.changeCoins(ctx.player, 90, 'zatvornik', 'first');
      notes.push('+90 монет.');
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'sixth_seal',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'sixth_seal' });
    } else {
      notes.push('Сюжетный лут уже получен.');
    }
  }
  return notes;
}

export async function loadWeek6JobLevels(
  host: WeekHost,
  ctx: WeekCtx,
): Promise<Partial<Record<JobProfession, number>>> {
  const [logger, miner, hunter, crafter] = await Promise.all([
    jobLevel(host, ctx, 'LOGGER'),
    jobLevel(host, ctx, 'MINER'),
    jobLevel(host, ctx, 'HUNTER'),
    jobLevel(host, ctx, 'CRAFTER'),
  ]);
  return { LOGGER: logger, MINER: miner, HUNTER: hunter, CRAFTER: crafter };
}
