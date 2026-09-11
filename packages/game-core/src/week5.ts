import {
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  WEEK5_DAY_XP,
  resourceLabel,
  type JobProfession,
} from '@kubolesie/content';
import type { CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError } from './errors';
import type { WeekCtx, WeekHost } from './week';
import { grantMetaAchievement, noteActivity } from './meta';
import { tickCrop } from './week2';
import { pagedButtons } from './paging';

export const WEEK5_MENUS = ['marsh', 'basin', 'outpost', 'seal5'] as const;
export type Week5MenuId = (typeof WEEK5_MENUS)[number];

export function isWeek5Menu(menu: string): menu is Week5MenuId {
  return (WEEK5_MENUS as readonly string[]).includes(menu);
}

export const WEEK5_COMMANDS = [
  'BEGIN_DAY_29',
  'BEGIN_DAY_30',
  'BEGIN_DAY_31',
  'BEGIN_DAY_32',
  'BEGIN_DAY_33',
  'BEGIN_DAY_34',
  'BEGIN_DAY_35',
  'COMPLETE_DAY_29',
  'COMPLETE_DAY_30',
  'COMPLETE_DAY_31',
  'COMPLETE_DAY_32',
  'COMPLETE_DAY_33',
  'COMPLETE_DAY_34',
  'COMPLETE_DAY_35',
  'WEEK5_ACT',
] as const;

export const WEEK5_ENEMIES = ['reed_lurker', 'mire_claw', 'drowned_shell', 'miremaw', 'bezdonnik'] as const;

export function isWeek5Enemy(id: string): boolean {
  return (WEEK5_ENEMIES as readonly string[]).includes(id);
}

export function isWeek5Location(id: string): boolean {
  return (
    id === 'black_marsh_edge' ||
    id === 'sunken_boardwalk' ||
    id === 'reed_crossing' ||
    id === 'black_reed_basin' ||
    id === 'drowned_stones' ||
    id === 'deep_mire' ||
    id === 'sunken_outpost' ||
    id === 'miremaw_lair' ||
    id === 'moving_marker' ||
    id === 'submerged_node' ||
    id === 'black_water_crossing' ||
    id === 'fifth_seal_approach' ||
    id === 'sunken_seal_forecourt' ||
    id === 'seal_3_vault'
  );
}

const QUEST_BY_DAY: Record<number, { id: string; title: string }> = {
  29: { id: 'enter_black_marsh', title: 'Вход в Чёрную топь' },
  30: { id: 'cross_the_marsh', title: 'Три переправы' },
  31: { id: 'black_reed_hunt', title: 'Чаша камыша' },
  32: { id: 'sunken_outpost', title: 'Затопленный стан' },
  33: { id: 'miremaw_hunt', title: 'Охота на Топежора' },
  34: { id: 'follow_changed_marks', title: 'Правка на глазах' },
  35: { id: 'fifth_seal', title: 'Пятая печать' },
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
  return Boolean(ctx.flags.week5_route_boardwalk || ctx.flags.week5_route_islands || ctx.flags.week5_route_reed);
}

function crossingCleared(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week5_path_plank || ctx.flags.week5_path_stone || ctx.flags.week5_path_reed);
}

function outpostResolved(ctx: WeekCtx): boolean {
  if (ctx.flags.week5_outpost_skipped) return true;
  return Boolean(ctx.flags.week5_outpost_examined && (ctx.flags.week5_outpost_looted || ctx.flags.week5_outpost_left));
}

function day34Picked(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week5_chase || ctx.flags.week5_check || ctx.flags.week5_old_route);
}

function socialPicked(ctx: WeekCtx): boolean {
  return Boolean(
    ctx.flags.week5_social_help || ctx.flags.week5_social_talk || ctx.flags.week5_social_pass || ctx.flags.week5_social_pvp,
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
    bits.push('без запаса — просто мокрее');
  }
  return bits.join(', ');
}

export function week5Modifiers(
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
  const boss = enemyId === 'miremaw' || enemyId === 'bezdonnik';
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
  if (ctx.flags.root_barricade || hasItem(ctx, 'root_brace') || ctx.flags.marsh_platform_used || hasItem(ctx, 'marsh_platform')) {
    player.defense = (player.defense ?? 0) + 2;
    bits.push('настил держит воду');
  }
  if (hasItem(ctx, 'path_charm') || ctx.flags.has_path_charm) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('оберег тропы');
  }
  if (hasItem(ctx, 'mire_charm') || ctx.flags.has_mire_charm) {
    player.dodge = (player.dodge ?? 0) + 4;
    bits.push('оберег топи');
  }
  if (hasItem(ctx, 'root_charm')) {
    player.dodge = (player.dodge ?? 0) + 3;
    bits.push('корневой оберег');
  }
  if (ctx.flags.lantern_repaired && boss) {
    enemy.dodge = 0;
    player.critChance = 8;
    bits.push('фонарь: дно видно');
  }
  if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    player.dodge = (player.dodge ?? 0) + 14;
    bits.push('питомец рядом');
  }
  if ((jobs.HUNTER ?? 0) >= 10) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    bits.push('охотник бьёт первым');
  }
  if ((jobs.FISHER ?? 0) >= 10 && boss) {
    player.dodge = (player.dodge ?? 0) + 4;
    player.accuracy = 4;
    bits.push('рыбак читает воду');
  }
  if ((jobs.LOGGER ?? 0) >= 10 && boss) {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('лесоруб видит слабую опору');
  }
  if ((jobs.MINER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('шахтёр: каменный участок');
  }
  if ((jobs.CRAFTER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('настил ремесленника');
  }
  if (ctx.flags.reed_rope_used && enemyId === 'miremaw') {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('связка: короткий угол');
  }
  if (ctx.flags.week5_old_route_copied && boss) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    bits.push('старая схема ещё держится');
  }
  if (enemyId === 'bezdonnik') {
    if (ctx.flags.marsh_heart_used) {
      enemy.hp = -25;
      bits.push('сердце топи гасит глубину');
    }
    if (miraTrust(ctx) >= 2) {
      enemy.defense = (enemy.defense ?? 0) - 1;
      bits.push('Мира: бей ядро пути, не воду');
    }
    if (ctx.flags.network_changed_during_week5) {
      enemy.dodge = enemy.dodge == null ? 0 : Math.max(0, enemy.dodge - 2);
      bits.push('свежая правка звенит');
    }
    if (ctx.flags.week5_clan_shown) bits.push('знак клана не даёт силы — только взгляд');
  }
  return { player, enemy, note: bits.join(', '), playerOpeningHits };
}

export async function dispatchWeek5(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_29':
      return beginDay(host, ctx, 29);
    case 'BEGIN_DAY_30':
      return beginDay(host, ctx, 30);
    case 'BEGIN_DAY_31':
      return beginDay(host, ctx, 31);
    case 'BEGIN_DAY_32':
      return beginDay(host, ctx, 32);
    case 'BEGIN_DAY_33':
      return beginDay(host, ctx, 33);
    case 'BEGIN_DAY_34':
      return beginDay(host, ctx, 34);
    case 'BEGIN_DAY_35':
      return beginDay(host, ctx, 35);
    case 'COMPLETE_DAY_29':
      return completeDay(host, ctx, 29);
    case 'COMPLETE_DAY_30':
      return completeDay(host, ctx, 30);
    case 'COMPLETE_DAY_31':
      return completeDay(host, ctx, 31);
    case 'COMPLETE_DAY_32':
      return completeDay(host, ctx, 32);
    case 'COMPLETE_DAY_33':
      return completeDay(host, ctx, 33);
    case 'COMPLETE_DAY_34':
      return completeDay(host, ctx, 34);
    case 'COMPLETE_DAY_35':
      return completeDay(host, ctx, 35);
    case 'WEEK5_ACT':
      return week5Act(host, ctx, String(command.payload?.act ?? 'open'), command.payload ?? {}, eventId);
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openWeek5Menu(host: WeekHost, ctx: WeekCtx, menu: Week5MenuId): Promise<GameResponse> {
  if (!ctx.flags.week_4_complete) throw new ActionRejectedError('Чёрная топь ещё закрыта.');
  if (menu === 'basin') return basinMenu(host, ctx);
  if (menu === 'outpost') return outpostMenu(host, ctx);
  if (menu === 'seal5') return prepSeal(host, ctx);
  return edgeMenu(host, ctx);
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (day === 29 && !ctx.flags.week_4_complete) {
    throw new ActionRejectedError('Сначала закрой четвёртую неделю.');
  }
  if (day > 29 && !ctx.flags[`day_${day - 1}_complete`]) {
    throw new ActionRejectedError('Сначала закрой предыдущий день.');
  }
  if (ctx.flags.week_5_complete) return host.renderNode(ctx.player, 'week5_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);

  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 2);

  const quest = QUEST_BY_DAY[day]!;
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: quest.id,
    status: 'ACTIVE',
    progress: {},
  });
  await setFlag(host, ctx, 'week_5_started');

  if (day === 29) {
    ctx.player.currentLocation = 'black_marsh_edge';
    ctx.player.currentState = 'day29_start';
    await host.store.savePlayer(ctx.player);
    const node = await host.renderNode(ctx.player, 'day29_start');
    const extras: string[] = [];
    if (remWarm(ctx)) extras.push('Рем мягче: «Это сделали недавно. Не вчера. Сегодня.»');
    if (ctx.flags.sold_rusty_token) extras.push('Рем коротко: «Жетон продан. Топь всё равно знает, где ты был.»');
    if (miraTrust(ctx) >= 2) extras.push('Мира: «Дерево вокруг царапин ещё светлое. Срез живой.»');
    if (ctx.flags.lantern_repaired) extras.push('Фонарь ловит чёрную воду раньше глаз.');
    if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) extras.push('Питомец жмётся и не хочет в топь.');
    if (ctx.flags.warped_network_seen) extras.push('Знак тот же, что на гнилой тропе. Только свежее.');
    if (extras.length) node.text = `${node.text}\n${extras.join('\n')}`;
    return node;
  }
  if (day === 30) {
    ctx.player.currentLocation = 'sunken_boardwalk';
    ctx.player.currentState = 'day30_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day30_start');
  }
  if (day === 31) {
    ctx.player.currentLocation = 'black_reed_basin';
    ctx.player.currentState = 'day31_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day31_start');
  }
  if (day === 32) {
    ctx.player.currentLocation = 'sunken_outpost';
    ctx.player.currentState = 'day32_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day32_start');
  }
  if (day === 33) {
    ctx.player.currentLocation = 'miremaw_lair';
    ctx.player.currentState = 'day33_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'miremaw',
      title: 'Топежор',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day33_start');
  }
  if (day === 34) {
    ctx.player.currentLocation = 'moving_marker';
    ctx.player.currentState = 'day34_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day34_start');
  }
  ctx.player.currentLocation = 'seal_3_vault';
  ctx.player.currentState = 'day35_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'fifth_seal_seen');
  await setFlag(host, ctx, 'bezdonnik_seen');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'bezdonnik',
    title: 'Бездонник',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'fifth_seal',
    title: 'Пятая печать',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day35_start');
  if (miraTrust(ctx) >= 2) {
    node.text = `${node.text}\nМира: «Ядро в пути, не в воде. Если есть сердце топи — брось в щель до удара.»`;
  } else {
    node.text = `${node.text}\nМира держится сзади. «Не стой на жиле. Она врёт.»`;
  }
  return node;
}

async function completeDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (ctx.flags.week_5_complete && day === 35) return host.renderNode(ctx.player, 'week5_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);
  if (day === 29) {
    if (!ctx.flags.week5_fresh_marks_seen) throw new ActionRejectedError('Сначала прочитай свежие царапины.');
    if (!routePicked(ctx)) throw new ActionRejectedError('Сначала выбери путь у столба.');
  } else if (day === 30) {
    if (!crossingCleared(ctx)) throw new ActionRejectedError('Сначала пройди одну из трёх переправ.');
  } else if (day === 31) {
    if (!ctx.flags.visited_black_reed) throw new ActionRejectedError('Сначала чаша камыша.');
  } else if (day === 32) {
    if (!outpostResolved(ctx)) throw new ActionRejectedError('Сначала стан — осмотри или пройди мимо.');
  } else if (day === 33) {
    if (!ctx.flags.defeated_miremaw) throw new ActionRejectedError('Сначала Топежор.');
  } else if (day === 34) {
    if (!ctx.flags.network_changed_during_week5) throw new ActionRejectedError('Сначала осмотри изменённый знак.');
    if (!day34Picked(ctx)) throw new ActionRejectedError('Сначала реши, куда идти от знака.');
  } else if (day === 35) {
    if (!ctx.flags.bezdonnik_defeated) throw new ActionRejectedError('Сначала Бездонник.');
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
    await host.addXp(ctx.player, WEEK5_DAY_XP[day as keyof typeof WEEK5_DAY_XP]);
  }
  await setFlag(host, ctx, `day_${day}_complete`);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: questId });
  await noteActivity(host.store, ctx.player, { type: 'day', day });

  if (day === 35) {
    await setFlag(host, ctx, 'seen_two_seals');
    await setFlag(host, ctx, 'week_5_complete');
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'two_seals',
      title: 'Две печати',
      seen: true,
      defeated: false,
    });
    await noteActivity(host.store, ctx.player, { type: 'week', week: 5 });
    await grantMetaAchievement(host.store, ctx.player.id, 'WEEK_FIVE_COMPLETE');
    return host.renderNode(ctx.player, 'two_seals');
  }
  return host.renderNode(ctx.player, `day${day}_complete`);
}

async function week5Act(
  host: WeekHost,
  ctx: WeekCtx,
  act: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  if (!ctx.flags.week_4_complete) throw new ActionRejectedError('Чёрная топь ещё закрыта.');
  if (act === 'edge') return edgeMenu(host, ctx);
  if (act === 'inspect') return inspectPole(host, ctx);
  if (act === 'gather_edge') return gatherEdge(host, ctx);
  if (act === 'routes') return routeMenu(host, ctx);
  if (act === 'route_boardwalk') return pickRoute(host, ctx, 'boardwalk');
  if (act === 'route_islands') return pickRoute(host, ctx, 'islands');
  if (act === 'route_reed') return pickRoute(host, ctx, 'reed');
  if (act === 'cross') return crossMenu(host, ctx);
  if (act === 'path_plank') return falsePath(host, ctx, 'plank');
  if (act === 'path_stone') return falsePath(host, ctx, 'stone');
  if (act === 'path_reed') return falsePath(host, ctx, 'reed');
  if (act === 'basin') return basinMenu(host, ctx);
  if (act === 'forage') return forage(host, ctx, eventId);
  if (act === 'outpost') return outpostMenu(host, ctx);
  if (act === 'examine_outpost') return examineOutpost(host, ctx);
  if (act === 'skip_outpost') return skipOutpost(host, ctx);
  if (act === 'take_outpost') return takeOutpost(host, ctx);
  if (act === 'leave_outpost') return leaveOutpost(host, ctx);
  if (act === 'copy_map') return copyMap(host, ctx);
  if (act === 'miremaw') return miremawGate(host, ctx);
  if (act === 'use_rope') return useRope(host, ctx);
  if (act === 'use_platform') return usePlatform(host, ctx);
  if (act === 'moving') return movingMenu(host, ctx);
  if (act === 'examine') return examineSign(host, ctx);
  if (act === 'chase') return day34Pick(host, ctx, 'chase');
  if (act === 'check') return day34Pick(host, ctx, 'check');
  if (act === 'old_route') return day34Pick(host, ctx, 'old');
  if (act === 'social') return socialMenu(host, ctx);
  if (act === 'help') return socialPick(host, ctx, 'help');
  if (act === 'talk') return socialPick(host, ctx, 'talk');
  if (act === 'pass') return socialPick(host, ctx, 'pass');
  if (act === 'pvp') return socialPick(host, ctx, 'pvp');
  if (act === 'clan_show') return clanPick(host, ctx, true);
  if (act === 'clan_hide') return clanPick(host, ctx, false);
  if (act === 'clan') return clanMenu(host, ctx);
  if (act === 'use_heart') return useMarshHeart(host, ctx);
  if (act === 'prep') return prepSeal(host, ctx);
  if (act === 'seal') return prepSeal(host, ctx);
  if (act === 'open' || act === 'hub') return week5Hub(host, ctx, Number(payload.page ?? 0));
  void payload;
  return week5Hub(host, ctx, Number(payload.page ?? 0));
}

async function edgeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'black_marsh_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_black_marsh');
  const buttons: GameButton[] = [
    { label: 'Осмотреть столб', action: 'WEEK5_ACT', payload: { act: 'inspect' } },
    { label: 'Собрать камыш', action: 'WEEK5_ACT', payload: { act: 'gather_edge' } },
  ];
  if (ctx.flags.week5_fresh_marks_seen && !routePicked(ctx)) {
    buttons.push({ label: 'Выбрать путь', action: 'WEEK5_ACT', payload: { act: 'routes' } });
  }
  if (ctx.flags.week5_fresh_marks_seen && routePicked(ctx) && !ctx.flags.day_29_complete) {
    buttons.push({ label: 'Завершить День 29', action: 'COMPLETE_DAY_29' });
  } else if (ctx.flags.day_29_complete && buttons.length < 4) {
    buttons.push({ label: 'К переправе', action: 'WEEK5_ACT', payload: { act: 'cross' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Край Чёрной топи. Вода стоит. Старый столб несёт знак четвёртой территории — и стёртую стрелку.',
    ctx.flags.week5_fresh_marks_seen ? 'Царапины прочитаны. Срез свежий. Кто-то был здесь недавно.' : 'Столб не прочитан.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function inspectPole(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'black_marsh_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'week5_fresh_marks_seen');
  await setFlag(host, ctx, 'visited_black_marsh');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'fresh_network_marks',
    title: 'Свежие метки сети',
    seen: true,
    defeated: false,
  });
  const mira =
    miraTrust(ctx) >= 2
      ? '\nМира: «Дерево вокруг царапин ещё светлое. Это не рост. Рука. Сегодня.»'
      : '';
  const rem = remWarm(ctx)
    ? '\nРем: «Это сделали недавно. Не вчера. Пока мы шли сюда.»'
    : '\nРем коротко: «Свежий рез. Смотри.»';
  return edgeMenu(
    host,
    await host.load(ctx.player),
    `Поверх старого знака — стёртая стрелка и новый рез. Направление к пятой печати сдвинуто. Срез светлый.${mira}${rem}`,
  );
}

async function gatherEdge(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'black_marsh_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_black_marsh');
  await host.spend(ctx.player, 2);
  const first = await host.store.tryClaimReward(ctx.player.id, 'week5', 'edge_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'LOG', 3);
    await host.store.addResource(ctx.player.id, 'BLACK_REED', 4);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'BLACK_REED' });
    const buttons: GameButton[] = [{ label: 'Ещё осмотреть', action: 'WEEK5_ACT', payload: { act: 'edge' } }];
    if (ctx.flags.week5_fresh_marks_seen && routePicked(ctx) && !ctx.flags.day_29_complete) {
      buttons.push({ label: 'Завершить День 29', action: 'COMPLETE_DAY_29' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(
      ctx.player,
      `Первый пучок топи. +3 ${resourceLabel('LOG')}, +4 ${resourceLabel('BLACK_REED')}. Камыш чёрный и жёсткий.`,
      buttons,
    );
  }
  await host.store.addResource(ctx.player.id, 'BLACK_REED', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'BLACK_REED' });
  return edgeMenu(host, await host.load(ctx.player), `+1 ${resourceLabel('BLACK_REED')}. Первый склад уже взят.`);
}

async function routeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, extra || 'Путь уже выбран. Все сходятся.');
  ctx.player.currentLocation = 'sunken_boardwalk';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Настил', action: 'WEEK5_ACT', payload: { act: 'route_boardwalk' } },
    { label: 'Островки', action: 'WEEK5_ACT', payload: { act: 'route_islands' } },
    { label: 'Камыш', action: 'WEEK5_ACT', payload: { act: 'route_reed' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  return host.respond(
    ctx.player,
    extra || 'Три пути у столба. Все сходятся у переправ. Вода следы не держит — читай столб.',
    buttons,
  );
}

async function pickRoute(host: WeekHost, ctx: WeekCtx, kind: 'boardwalk' | 'islands' | 'reed'): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, 'Путь уже выбран.');
  if (kind === 'boardwalk') await setFlag(host, ctx, 'week5_route_boardwalk');
  else if (kind === 'islands') await setFlag(host, ctx, 'week5_route_islands');
  else await setFlag(host, ctx, 'week5_route_reed');
  const note =
    kind === 'boardwalk'
      ? 'Идёшь по старому настилу. Он проседает и всё равно выводит к переправе.'
      : kind === 'islands'
        ? 'Каменные островки. Через час — та же переправа.'
        : 'Камыш по грудь. Снова переправа.';
  return edgeMenu(host, await host.load(ctx.player), note);
}

async function crossMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'reed_crossing';
  await host.store.savePlayer(ctx.player);
  if (crossingCleared(ctx)) {
    const buttons: GameButton[] = [];
    if (!ctx.flags.day_30_complete) buttons.push({ label: 'Завершить День 30', action: 'COMPLETE_DAY_30' });
    buttons.push({ label: 'В чашу', action: 'WEEK5_ACT', payload: { act: 'basin' } });
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(ctx.player, extra || 'Переправа пройдена. Чаша дышит камышом.', buttons);
  }
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const fisher = await jobLevel(host, ctx, 'FISHER');
  const buttons: GameButton[] = [
    { label: 'Настил', action: 'WEEK5_ACT', payload: { act: 'path_plank' } },
    { label: 'Камень', action: 'WEEK5_ACT', payload: { act: 'path_stone' } },
    { label: 'Камыш', action: 'WEEK5_ACT', payload: { act: 'path_reed' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  const text = [
    extra,
    'Три переправы. Профессия не запирает — только короче.',
    `Лесоруб L${logger}: ${logger >= 5 ? 'читает настил' : 'пойдёт дольше'}.`,
    `Шахтёр L${miner}: ${miner >= 5 ? 'видит опоры' : 'островки сыпят'}.`,
    `Охотник L${hunter} / рыбак L${fisher}: ${hunter >= 5 || fisher >= 5 ? 'читает воду' : 'камыш врёт'}.`,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function falsePath(host: WeekHost, ctx: WeekCtx, kind: 'plank' | 'stone' | 'reed'): Promise<GameResponse> {
  if (crossingCleared(ctx)) return crossMenu(host, ctx, 'Уже пройдено.');
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const fisher = await jobLevel(host, ctx, 'FISHER');
  const match =
    (kind === 'plank' && logger >= 5) ||
    (kind === 'stone' && miner >= 5) ||
    (kind === 'reed' && (hunter >= 5 || fisher >= 5));
  if (kind === 'plank') await setFlag(host, ctx, 'week5_path_plank');
  else if (kind === 'stone') await setFlag(host, ctx, 'week5_path_stone');
  else await setFlag(host, ctx, 'week5_path_reed');
  if (match) {
    await setFlag(host, ctx, 'week5_path_adv');
    if (kind === 'plank') {
      await host.store.addResource(ctx.player.id, 'LOG', 3);
      await host.store.addResource(ctx.player.id, 'BLACK_REED', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'BLACK_REED' });
    } else if (kind === 'stone') {
      await host.store.addResource(ctx.player.id, 'COAL', 2);
      await host.store.addResource(ctx.player.id, 'COBBLESTONE', 3);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'COAL' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'COBBLESTONE' });
    } else {
      await host.store.addResource(ctx.player.id, 'BLACK_REED', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'BLACK_REED' });
      if (hunter >= 5) {
        await host.store.addResource(ctx.player.id, 'HIDE', 2);
        await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'HIDE' });
      }
      if (fisher >= 5) {
        await host.store.addResource(ctx.player.id, 'RAW_FISH', 2);
        await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'RAW_FISH' });
      }
    }
    const note =
      kind === 'plank'
        ? 'Настил читается. Брёвна и камыш без обхода.'
        : kind === 'stone'
          ? 'Опоры держат. Уголь и камень без обвала.'
          : 'Вода читается. Камыш и добыча без круга.';
    return crossMenu(host, await host.load(ctx.player), note);
  }
  const cost = await softCost(host, ctx, 2, 1);
  const note =
    kind === 'plank'
      ? `Настил проседает. Вышел. ${cost}. Не заперто.`
      : kind === 'stone'
        ? `Островки сыпят. Вышел. ${cost}. Не заперто.`
        : `Камыш ведёт в круг. Вышел. ${cost}. Не заперто.`;
  return crossMenu(host, await host.load(ctx.player), note);
}

async function basinMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!crossingCleared(ctx) && !ctx.flags.day_30_complete) {
    throw new ActionRejectedError('Сначала переправы.');
  }
  ctx.player.currentLocation = 'black_reed_basin';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_black_reed');
  const buttons: GameButton[] = [
    { label: 'Камышник', action: 'START_PVE', payload: { enemyId: 'reed_lurker' } },
    { label: 'Топеклык', action: 'START_PVE', payload: { enemyId: 'mire_claw' } },
    { label: 'Панцирник', action: 'START_PVE', payload: { enemyId: 'drowned_shell' } },
  ];
  if (ctx.flags.day_31_complete) {
    buttons.push({ label: 'Собрать', action: 'WEEK5_ACT', payload: { act: 'forage' } });
  } else {
    buttons.push({ label: 'Завершить День 31', action: 'COMPLETE_DAY_31' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    extra || 'Чаша чёрного камыша. Повторные бои дают шкуру, рыбу и камыш. Не ферма опыта.',
    buttons,
  );
}

async function forage(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  if (!ctx.flags.visited_black_reed && !crossingCleared(ctx)) {
    throw new ActionRejectedError('Собирать негде.');
  }
  await host.spend(ctx.player, 2);
  await host.store.addResource(ctx.player.id, 'FOOD', 1);
  await host.store.addResource(ctx.player.id, 'RAW_FISH', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'FOOD' });
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'RAW_FISH' });
  const daily = await host.store.tryClaimReward(
    ctx.player.id,
    'week5',
    `forage:${host.now().toISOString().slice(0, 10)}`,
  );
  if (daily) {
    await host.store.addResource(ctx.player.id, 'BLACK_REED', 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'BLACK_REED' });
  }
  void eventId;
  const next = await host.load(ctx.player);
  const note = daily
    ? `Собрано: +1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('RAW_FISH')}, +2 ${resourceLabel('BLACK_REED')} (раз в сутки).`
    : `+1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('RAW_FISH')}. Суточный пучок камыша уже снят.`;
  return basinMenu(host, next, note);
}

async function outpostMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'sunken_outpost';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.week5_outpost_examined && !ctx.flags.week5_outpost_skipped) {
    buttons.push({ label: 'Осмотреть стан', action: 'WEEK5_ACT', payload: { act: 'examine_outpost' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK5_ACT', payload: { act: 'skip_outpost' } });
  } else if (ctx.flags.week5_outpost_examined && !ctx.flags.week5_outpost_looted && !ctx.flags.week5_outpost_left) {
    buttons.push({ label: 'Забрать припасы', action: 'WEEK5_ACT', payload: { act: 'take_outpost' } });
    buttons.push({ label: 'Оставить', action: 'WEEK5_ACT', payload: { act: 'leave_outpost' } });
    if (!ctx.flags.week5_old_route_copied) {
      buttons.push({ label: 'Скопировать схему', action: 'WEEK5_ACT', payload: { act: 'copy_map' } });
    }
  } else if (ctx.flags.week5_outpost_examined && !ctx.flags.week5_old_route_copied && buttons.length < 3) {
    buttons.push({ label: 'Скопировать схему', action: 'WEEK5_ACT', payload: { act: 'copy_map' } });
  }
  if (outpostResolved(ctx) && !ctx.flags.day_32_complete) {
    buttons.push({ label: 'Завершить День 32', action: 'COMPLETE_DAY_32' });
  }
  if (ctx.flags.day_32_complete) {
    buttons.push({ label: 'К логову', action: 'WEEK5_ACT', payload: { act: 'miremaw' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const rem = remWarm(ctx)
    ? 'Рем: «Старый путь здесь. Значит, кто-то уводит людей в сторону.»'
    : 'Рем коротко: «Схема старая. Метки новые. Не одно.»';
  const mira =
    miraTrust(ctx) >= 2
      ? 'Мира: «Не обязательно людей. Возможно, он перенаправляет саму нагрузку сети.»'
      : 'Мира даёт мало. «Стрелки врут. Не спрашивай, кто.»';
  const text = [
    extra,
    'Затопленный стан. Часть крыши в воде. На стене схема к пятой печати — не та, что на свежих столбах.',
    rem,
    mira,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function examineOutpost(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'week5_outpost_examined');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'sunken_route_map',
    title: 'Старая схема пути',
    seen: true,
    defeated: false,
  });
  return outpostMenu(
    host,
    await host.load(ctx.player),
    'Старая схема: стрелка к печати уходит влево, к каменному броду. Свежие метки в топи ведут вправо, в камыш. Кто-то сменил направление после того, как стан бросили.',
  );
}

async function skipOutpost(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'week5_outpost_skipped');
  return outpostMenu(host, await host.load(ctx.player), 'Проходишь мимо. Крыша остывает в спину. Сюжет не запирает.');
}

async function takeOutpost(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.week5_outpost_examined) throw new ActionRejectedError('Сначала осмотри стан.');
  await setFlag(host, ctx, 'week5_outpost_looted');
  const first = await host.store.tryClaimReward(ctx.player.id, 'week5', 'outpost_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'FOOD', 4);
    await host.store.addResource(ctx.player.id, 'LOG', 3);
    await host.store.addResource(ctx.player.id, 'BLACK_REED', 3);
    await host.changeCoins(ctx.player, 8, 'week5_outpost', 'loot');
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'FOOD' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'BLACK_REED' });
  }
  return outpostMenu(host, await host.load(ctx.player), 'Паёк, брёвна, камыш. Вещи ничьи. Один раз.');
}

async function leaveOutpost(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.week5_outpost_examined) throw new ActionRejectedError('Сначала осмотри стан.');
  await setFlag(host, ctx, 'week5_outpost_left');
  return outpostMenu(host, await host.load(ctx.player), 'Вещи остаются. Топь не обижается. Пока.');
}

async function copyMap(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.week5_outpost_examined) throw new ActionRejectedError('Сначала осмотри стан.');
  if (ctx.flags.week5_old_route_copied) return outpostMenu(host, ctx, 'Схема уже с тобой.');
  await setFlag(host, ctx, 'week5_old_route_copied');
  return outpostMenu(
    host,
    await host.load(ctx.player),
    'Схема на куске коры. Старый брод влево. Пригодится, когда свежие метки снова соврут.',
  );
}

async function miremawGate(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'miremaw_lair';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [{ label: 'Бить Топежора', action: 'START_PVE', payload: { enemyId: 'miremaw' } }];
  if (ctx.flags.defeated_miremaw && !ctx.flags.day_33_complete) {
    buttons.unshift({ label: 'Завершить День 33', action: 'COMPLETE_DAY_33' });
  }
  if (hasItem(ctx, 'reed_rope') && !ctx.flags.reed_rope_used) {
    buttons.push({ label: 'Связка', action: 'WEEK5_ACT', payload: { act: 'use_rope' } });
  }
  if (hasItem(ctx, 'marsh_platform') && !ctx.flags.marsh_platform_used && buttons.length < 3) {
    buttons.push({ label: 'Настил', action: 'WEEK5_ACT', payload: { act: 'use_platform' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({ label: 'С дистанции', action: 'START_PVE', payload: { enemyId: 'miremaw', move: 'bow' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Топежор под настилом. Ил и корни в одной пасти. Не страж печати. Лук, щит, связка, настил помогают. Без них — можно.',
    buttons,
  );
}

async function useRope(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'reed_rope')) {
    throw new ActionRejectedError('Связки нет. Чёрный камыш, волокно и палка.');
  }
  if (ctx.flags.reed_rope_used) return miremawGate(host, ctx);
  await setFlag(host, ctx, 'reed_rope_used');
  await setFlag(host, ctx, 'has_reed_rope');
  if (!ctx.flags.defeated_miremaw) return miremawGate(host, await host.load(ctx.player));
  return prepSeal(host, await host.load(ctx.player));
}

async function usePlatform(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'marsh_platform')) {
    throw new ActionRejectedError('Настила нет. Доски, камыш и слиток.');
  }
  if (ctx.flags.marsh_platform_used) {
    if (!ctx.flags.defeated_miremaw) return miremawGate(host, ctx);
    return prepSeal(host, ctx);
  }
  await setFlag(host, ctx, 'marsh_platform_used');
  await setFlag(host, ctx, 'has_marsh_platform');
  if (!ctx.flags.defeated_miremaw) return miremawGate(host, await host.load(ctx.player));
  return prepSeal(host, await host.load(ctx.player));
}

async function movingMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'moving_marker';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.network_changed_during_week5) {
    buttons.push({ label: 'Осмотреть знак', action: 'WEEK5_ACT', payload: { act: 'examine' } });
  } else if (!day34Picked(ctx)) {
    buttons.push({ label: 'За силуэтом', action: 'WEEK5_ACT', payload: { act: 'chase' } });
    buttons.push({ label: 'Проверить рез', action: 'WEEK5_ACT', payload: { act: 'check' } });
    buttons.push({ label: 'Старый путь', action: 'WEEK5_ACT', payload: { act: 'old_route' } });
  }
  if (ctx.flags.network_changed_during_week5 && day34Picked(ctx) && !socialPicked(ctx) && buttons.length < 3) {
    buttons.push({ label: 'Путники', action: 'WEEK5_ACT', payload: { act: 'social' } });
  }
  if (ctx.flags.network_changed_during_week5 && day34Picked(ctx) && !ctx.flags.day_34_complete) {
    buttons.push({ label: 'Завершить День 34', action: 'COMPLETE_DAY_34' });
  }
  if (ctx.flags.day_34_complete) {
    buttons.push({ label: 'К своду', action: 'WEEK5_ACT', payload: { act: 'prep' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const copied = ctx.flags.week5_old_route_copied
    ? 'Схема со стана ещё в кармане. Старый брод — влево. Свежий рез — вправо.'
    : '';
  const text = [
    extra,
    'Тот же столб. Утром линия уходила влево. Теперь вырезана вправо. Срез свежий. На древесине ещё светлая пыль.',
    copied,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function examineSign(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'network_changed_during_week5');
  await setFlag(host, ctx, 'week5_distant_watcher_seen');
  ctx.player.currentLocation = 'submerged_node';
  await host.store.savePlayer(ctx.player);
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'active_network_interference',
    title: 'Правка на ходу',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'distant_watcher',
    title: 'Дальний силуэт',
    seen: true,
    defeated: false,
  });
  const known = ctx.flags.unknown_blue_mineral || ctx.flags.found_blue_light
    ? '\nНа секунду силуэт кажется знакомым. Но расстояние слишком велико.'
    : '\nПлеск. Треск ветки. Силуэт между деревьями — слишком далеко, чтобы назвать.';
  return movingMenu(
    host,
    await host.load(ctx.player),
    `Ты уже видел этот знак. Утром линия уходила влево. Теперь она вырезана вправо. Срез свежий. На древесине ещё выступает светлая пыль. Тот, кто меняет сеть, ещё здесь.${known}`,
  );
}

async function day34Pick(host: WeekHost, ctx: WeekCtx, kind: 'chase' | 'check' | 'old'): Promise<GameResponse> {
  if (!ctx.flags.network_changed_during_week5) throw new ActionRejectedError('Сначала знак.');
  if (day34Picked(ctx)) return movingMenu(host, ctx, 'Путь от знака уже выбран.');
  if (kind === 'chase') {
    await setFlag(host, ctx, 'week5_chase');
    const first = await host.store.tryClaimReward(ctx.player.id, 'week5', 'chase');
    if (first) {
      await host.store.addResource(ctx.player.id, 'BLACK_REED', 2);
      await host.changeCoins(ctx.player, 6, 'week5_chase', 'clue');
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'BLACK_REED' });
    }
    return movingMenu(
      host,
      await host.load(ctx.player),
      'Гнался. Не догнал. На коре — тот же свежий рез и обрывок чёрного камыша. Лица нет. Имени нет.',
    );
  }
  if (kind === 'check') {
    await setFlag(host, ctx, 'week5_check');
    return movingMenu(
      host,
      await host.load(ctx.player),
      'Рез ещё тёплый. Стружка светлая. Кто-то правил сеть, пока ты ходил к Топежору. Это не древний след.',
    );
  }
  await setFlag(host, ctx, 'week5_old_route');
  const copied = ctx.flags.week5_old_route_copied;
  if (copied) {
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week5', 'old_route');
    if (ok) {
      await host.store.addResource(ctx.player.id, 'FOOD', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'FOOD' });
    }
    return movingMenu(
      host,
      await host.load(ctx.player),
      'Схема ведёт влево, на каменный брод. Коротко и сухо. Свежие метки остаются врать вправо.',
    );
  }
  const cost = await softCost(host, ctx, 1, 1);
  return movingMenu(
    host,
    await host.load(ctx.player),
    `Идёшь влево без схемы. Брод есть, только дольше. ${cost}. Свежие метки остаются врать.`,
  );
}

async function socialMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!ctx.flags.network_changed_during_week5) throw new ActionRejectedError('Сначала знак.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const buttons: GameButton[] = [];
  if (!socialPicked(ctx)) {
    buttons.push({ label: 'Помочь', action: 'WEEK5_ACT', payload: { act: 'help' } });
    buttons.push({ label: 'Обменяться', action: 'WEEK5_ACT', payload: { act: 'talk' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK5_ACT', payload: { act: 'pass' } });
  }
  if (clan && !ctx.flags.week5_clan_shown && !ctx.flags.week5_clan_hidden && buttons.length < 4) {
    buttons.push({ label: 'Знак клана', action: 'WEEK5_ACT', payload: { act: 'clan' } });
  }
  if (socialPicked(ctx) && !ctx.flags.day_34_complete) {
    buttons.push({ label: 'Завершить День 34', action: 'COMPLETE_DAY_34' });
  }
  if (ctx.flags.week5_social_pvp && buttons.length < 4) {
    buttons.push({ label: 'Стычка', action: 'START_PVP' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const clanLine = clan
    ? `Знак ${clan.clan.tag} здесь уже знают. Можно показать. Не обязательно.`
    : 'Клана нет — нейтральный путь открыт.';
  return host.respond(
    ctx.player,
    [extra, 'Путники сбились со свежих меток. Три пути, все ведут дальше.', clanLine].filter(Boolean).join('\n'),
    buttons,
  );
}

async function socialPick(
  host: WeekHost,
  ctx: WeekCtx,
  kind: 'help' | 'talk' | 'pass' | 'pvp',
): Promise<GameResponse> {
  if (!ctx.flags.network_changed_during_week5) throw new ActionRejectedError('Сначала знак.');
  if (socialPicked(ctx)) return socialMenu(host, ctx, 'Группа уже пройдена.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const discount = Boolean(clan && ctx.flags.week5_clan_shown);
  if (kind === 'help') {
    await setFlag(host, ctx, 'week5_social_help');
    const cost = await softCost(host, ctx, 1, discount ? 0 : 1);
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week5', 'social');
    if (ok) {
      await host.changeCoins(ctx.player, 6, 'week5_social', 'help');
      await host.store.addResource(ctx.player.id, 'FOOD', discount ? 3 : 2);
    }
    return socialMenu(host, await host.load(ctx.player), `Помог пройти правленый знак. ${cost}. Паёк. +6 монет.`);
  }
  if (kind === 'talk') {
    await setFlag(host, ctx, 'week5_social_talk');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week5', 'social');
    if (ok) {
      await host.store.addResource(ctx.player.id, 'BLACK_REED', 1);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'BLACK_REED' });
    }
    return socialMenu(
      host,
      await host.load(ctx.player),
      'Слова вместо клинка. Они тоже видели свежий рез. Камыш за карту. Стычка не нужна.',
    );
  }
  if (kind === 'pass') {
    await setFlag(host, ctx, 'week5_social_pass');
    return socialMenu(host, await host.load(ctx.player), 'Проходишь мимо. Они не зовут. Путь открыт.');
  }
  await setFlag(host, ctx, 'week5_social_pvp');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'week5', 'social');
  if (ok) await host.changeCoins(ctx.player, 8, 'week5_social', 'pvp');
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
  if (!ctx.flags.week5_clan_shown && !ctx.flags.week5_clan_hidden) {
    buttons.push({ label: 'Показать', action: 'WEEK5_ACT', payload: { act: 'clan_show' } });
    buttons.push({ label: 'Скрыть', action: 'WEEK5_ACT', payload: { act: 'clan_hide' } });
  }
  buttons.push({ label: 'Группа', action: 'WEEK5_ACT', payload: { act: 'social' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    `Знак ${clan.clan.tag} здесь уже знают. Показать или скрыть — не сила удара. Показанный знак чуть дешевле пайка.`,
    buttons,
  );
}

async function clanPick(host: WeekHost, ctx: WeekCtx, show: boolean): Promise<GameResponse> {
  const clan = await host.store.getPlayerClan(ctx.player.id);
  if (!clan) throw new ActionRejectedError('Клана нет. Нейтральный путь и так открыт.');
  if (show) await setFlag(host, ctx, 'week5_clan_shown');
  else await setFlag(host, ctx, 'week5_clan_hidden');
  return socialMenu(
    host,
    await host.load(ctx.player),
    show ? `Знак ${clan.clan.tag} виден. Это не сила удара. Только взгляд и паёк.` : 'Знак скрыт. Топь не спрашивает стаю.',
  );
}

async function useMarshHeart(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.marsh_heart_used) return prepSeal(host, ctx);
  if ((ctx.resources.MARSH_HEART ?? 0) < 1 && !ctx.flags.has_marsh_heart) {
    throw new ActionRejectedError('Сердца топи нет. Топежор ещё или уже потрачено.');
  }
  if ((ctx.resources.MARSH_HEART ?? 0) >= 1) {
    await host.store.addResource(ctx.player.id, 'MARSH_HEART', -1);
  }
  await setFlag(host, ctx, 'marsh_heart_used');
  await host.store.setFlag(ctx.player.id, 'marsh_heart_kept', '');
  delete ctx.flags.marsh_heart_kept;
  return prepSeal(host, await host.load(ctx.player));
}

async function prepSeal(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'seal_3_vault';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'bezdonnik_seen');
  const jobs = {
    LOGGER: await jobLevel(host, ctx, 'LOGGER'),
    MINER: await jobLevel(host, ctx, 'MINER'),
    HUNTER: await jobLevel(host, ctx, 'HUNTER'),
    FISHER: await jobLevel(host, ctx, 'FISHER'),
    CRAFTER: await jobLevel(host, ctx, 'CRAFTER'),
  };
  const lines = [
    'Затопленный свод. Пятая печать. Вода неподвижная, как глаз. Бездонник держит ядро — не правит сеть.',
    hasBow(ctx) ? 'Лук: внешний узел с дистанции.' : 'Без лука — вплотную.',
    hasShield(ctx) ? 'Щит: тяжёлый удар слабее.' : 'Без щита — принимай удар.',
    ctx.flags.lantern_repaired ? 'Фонарь показывает дно.' : 'Без фонаря силуэт плывёт. Проход есть.',
    ctx.flags.marsh_heart_used
      ? 'Сердце топи уже в щели.'
      : ctx.flags.has_marsh_heart
        ? 'Сердце топи можно бросить сейчас.'
        : 'Без сердца — просто дольше.',
    miraTrust(ctx) >= 2 ? 'Мира: бей ядро пути.' : 'Мира почти молчит.',
    jobs.HUNTER >= 10 ? 'Охотник бьёт первым.' : '',
    jobs.FISHER >= 10 ? 'Рыбак читает воду.' : '',
    jobs.LOGGER >= 10 ? 'Лесоруб видит слабую опору.' : '',
    jobs.MINER >= 10 ? 'Шахтёр стоит на камне.' : '',
    ctx.flags.marsh_platform_used ? 'Настил уже лежит.' : hasItem(ctx, 'marsh_platform') ? 'Настил можно положить.' : '',
    ctx.flags.week5_old_route_copied ? 'Старая схема держит брод.' : '',
  ].filter(Boolean);
  const buttons: GameButton[] = [
    { label: 'Бить ядро', action: 'START_PVE', payload: { enemyId: 'bezdonnik', move: 'core' } },
  ];
  if ((ctx.flags.has_marsh_heart || (ctx.resources.MARSH_HEART ?? 0) > 0) && !ctx.flags.marsh_heart_used) {
    buttons.push({ label: 'Бросить сердце', action: 'WEEK5_ACT', payload: { act: 'use_heart' } });
  }
  if (hasItem(ctx, 'marsh_platform') && !ctx.flags.marsh_platform_used && buttons.length < 4) {
    buttons.push({ label: 'Положить настил', action: 'WEEK5_ACT', payload: { act: 'use_platform' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({
      label: 'Ядро с дистанции',
      action: 'START_PVE',
      payload: { enemyId: 'bezdonnik', move: 'bow' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons);
}

async function week5Hub(host: WeekHost, ctx: WeekCtx, page = 0): Promise<GameResponse> {
  if (ctx.flags.week_5_complete) return host.renderNode(ctx.player, 'week5_complete');
  const items: GameButton[] = [];
  if (!ctx.flags.day_29_complete) {
    items.push({ label: 'Край топи', action: 'WEEK5_ACT', payload: { act: 'edge' } });
  } else if (!ctx.flags.day_30_complete) {
    items.push({ label: 'Переправа', action: 'WEEK5_ACT', payload: { act: 'cross' } });
  } else if (!ctx.flags.day_31_complete) {
    items.push({ label: 'Чаша', action: 'WEEK5_ACT', payload: { act: 'basin' } });
  } else if (!ctx.flags.day_32_complete) {
    items.push({ label: 'Стан', action: 'WEEK5_ACT', payload: { act: 'outpost' } });
  } else if (!ctx.flags.day_33_complete) {
    items.push({ label: 'Топежор', action: 'WEEK5_ACT', payload: { act: 'miremaw' } });
  } else if (!ctx.flags.day_34_complete) {
    items.push({ label: 'Знак', action: 'WEEK5_ACT', payload: { act: 'moving' } });
  } else {
    items.push({ label: 'Свод', action: 'WEEK5_ACT', payload: { act: 'prep' } });
  }
  if (ctx.flags.day_30_complete && items.every((row) => row.payload?.act !== 'basin')) {
    items.push({ label: 'Чаша', action: 'WEEK5_ACT', payload: { act: 'basin' } });
  }
  if (ctx.flags.day_29_complete && items.every((row) => row.payload?.act !== 'edge')) {
    items.push({ label: 'Край топи', action: 'WEEK5_ACT', payload: { act: 'edge' } });
  }
  return host.respond(
    ctx.player,
    'Чёрная топь. Пять печатей ещё не молчат. Четыре уже. Одна близко. Кто-то правит сеть на ходу.',
    pagedButtons(
      items,
      page,
      (next) => ({ label: '➡ Ещё', action: 'WEEK5_ACT', payload: { act: 'hub', page: next } }),
      { label: BACK_LABEL, action: 'OPEN_CAMP' },
    ),
  );
}

export async function applyWeek5Victory(host: WeekHost, ctx: WeekCtx, enemyId: string): Promise<string[]> {
  const notes: string[] = [];
  if (enemyId === 'miremaw') {
    await setFlag(host, ctx, 'defeated_miremaw');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'miremaw');
    if (first) {
      await host.store.addResource(ctx.player.id, 'MARSH_HEART', 1);
      await setFlag(host, ctx, 'has_marsh_heart');
      await setFlag(host, ctx, 'marsh_heart_kept');
      notes.push(`+1 ${resourceLabel('MARSH_HEART')}.`);
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'miremaw_hunt',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'miremaw_hunt' });
    } else {
      notes.push('Топежор уже отдал сердце.');
    }
  }
  if (enemyId === 'bezdonnik') {
    await setFlag(host, ctx, 'bezdonnik_defeated');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'bezdonnik');
    if (first) {
      await host.store.addResource(ctx.player.id, 'SEAL_SHARD_3', 1);
      notes.push(`+1 ${resourceLabel('SEAL_SHARD_3')}.`);
      await host.changeCoins(ctx.player, 80, 'bezdonnik', 'first');
      notes.push('+80 монет.');
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'fifth_seal',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'fifth_seal' });
    } else {
      notes.push('Сюжетный лут уже получен.');
    }
  }
  return notes;
}

export async function loadWeek5JobLevels(
  host: WeekHost,
  ctx: WeekCtx,
): Promise<Partial<Record<JobProfession, number>>> {
  const [logger, miner, hunter, fisher, crafter] = await Promise.all([
    jobLevel(host, ctx, 'LOGGER'),
    jobLevel(host, ctx, 'MINER'),
    jobLevel(host, ctx, 'HUNTER'),
    jobLevel(host, ctx, 'FISHER'),
    jobLevel(host, ctx, 'CRAFTER'),
  ]);
  return { LOGGER: logger, MINER: miner, HUNTER: hunter, FISHER: fisher, CRAFTER: crafter };
}
