import {
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  WEEK4_DAY_XP,
  resourceLabel,
  type JobProfession,
} from '@kubolesie/content';
import type { CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError } from './errors';
import type { WeekCtx, WeekHost } from './week';
import { grantMetaAchievement, noteActivity } from './meta';
import { tickCrop } from './week2';
import { pagedButtons } from './paging';

export const WEEK4_MENUS = ['trail', 'hollow', 'warped', 'seal4'] as const;
export type Week4MenuId = (typeof WEEK4_MENUS)[number];

export function isWeek4Menu(menu: string): menu is Week4MenuId {
  return (WEEK4_MENUS as readonly string[]).includes(menu);
}

export const WEEK4_COMMANDS = [
  'BEGIN_DAY_22',
  'BEGIN_DAY_23',
  'BEGIN_DAY_24',
  'BEGIN_DAY_25',
  'BEGIN_DAY_26',
  'BEGIN_DAY_27',
  'BEGIN_DAY_28',
  'COMPLETE_DAY_22',
  'COMPLETE_DAY_23',
  'COMPLETE_DAY_24',
  'COMPLETE_DAY_25',
  'COMPLETE_DAY_26',
  'COMPLETE_DAY_27',
  'COMPLETE_DAY_28',
  'WEEK4_ACT',
] as const;

export const WEEK4_ENEMIES = ['rot_scuttler', 'mire_stalker', 'bark_reaper', 'blackroot', 'tlennik'] as const;

export function isWeek4Enemy(id: string): boolean {
  return (WEEK4_ENEMIES as readonly string[]).includes(id);
}

export function isWeek4Location(id: string): boolean {
  return (
    id === 'rotten_trail_edge' ||
    id === 'split_path' ||
    id === 'black_bark_marker' ||
    id === 'rot_hollow' ||
    id === 'sinking_ground' ||
    id === 'deadwood_ring' ||
    id === 'missing_camp' ||
    id === 'warped_marker_field' ||
    id === 'buried_crossing' ||
    id === 'corrupted_node' ||
    id === 'rotten_seal_forecourt' ||
    id === 'black_root_vault' ||
    id === 'seal_4'
  );
}

const QUEST_BY_DAY: Record<number, { id: string; title: string }> = {
  22: { id: 'enter_rotten_trail', title: 'Вход на гнилую тропу' },
  23: { id: 'follow_false_marks', title: 'Ложные следы' },
  24: { id: 'rot_hollow_hunt', title: 'Гнилая низина' },
  25: { id: 'missing_camp', title: 'Пропавший лагерь' },
  26: { id: 'blackroot_hunt', title: 'Охота на Чернокорня' },
  27: { id: 'warped_network', title: 'Искажённый узел' },
  28: { id: 'fourth_seal', title: 'Четвёртая печать' },
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
  return Boolean(ctx.flags.week4_route_old || ctx.flags.week4_route_fresh || ctx.flags.week4_route_trees);
}

function falseCleared(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.week4_path_beast || ctx.flags.week4_path_ravine || ctx.flags.week4_path_plank);
}

function campResolved(ctx: WeekCtx): boolean {
  if (ctx.flags.missing_camp_skipped) return true;
  return Boolean(ctx.flags.missing_camp_examined && (ctx.flags.missing_camp_looted || ctx.flags.missing_camp_left));
}

function socialPicked(ctx: WeekCtx): boolean {
  return Boolean(
    ctx.flags.week4_social_help || ctx.flags.week4_social_talk || ctx.flags.week4_social_pass || ctx.flags.week4_social_pvp,
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

export function week4Modifiers(
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
  const boss = enemyId === 'blackroot' || enemyId === 'tlennik';
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
  if (ctx.flags.root_barricade || hasItem(ctx, 'root_brace')) {
    player.defense = (player.defense ?? 0) + 2;
    bits.push('настил держит корень');
  }
  if (hasItem(ctx, 'path_charm') || ctx.flags.has_path_charm) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('оберег тропы');
  }
  if (hasItem(ctx, 'root_charm')) {
    player.dodge = (player.dodge ?? 0) + 3;
    bits.push('корневой оберег');
  }
  if (ctx.flags.lantern_repaired && boss) {
    enemy.dodge = 0;
    player.critChance = 8;
    bits.push('фонарь: тлен виден');
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
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('лесоруб видит слабую кору');
  }
  if ((jobs.MINER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('шахтёр: устойчивая позиция');
  }
  if ((jobs.CRAFTER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('настил ремесленника');
  }
  if (ctx.flags.rot_binding_used && enemyId === 'blackroot') {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('связка: короткий угол');
  }
  if (ctx.flags.path_marker_used && boss) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    player.accuracy = 4;
    bits.push('метка пути');
  }
  if (ctx.flags.week4_path_adv && boss) bits.push('верный след ещё держится');
  if (enemyId === 'tlennik') {
    if (ctx.flags.used_blackroot_core) {
      enemy.hp = -25;
      bits.push('сердцевина гасит тлен');
    }
    if (miraTrust(ctx) >= 2) {
      enemy.defense = (enemy.defense ?? 0) - 1;
      bits.push('Мира: бей ядро пути, не кору');
    }
    if (ctx.flags.warped_network_seen) {
      enemy.dodge = enemy.dodge == null ? 0 : Math.max(0, enemy.dodge - 2);
      bits.push('правка сети звенит');
    }
    if (ctx.flags.week4_clan_shown) bits.push('знак клана не даёт силы — только взгляд');
  }
  return { player, enemy, note: bits.join(', '), playerOpeningHits };
}

export async function dispatchWeek4(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_22':
      return beginDay(host, ctx, 22);
    case 'BEGIN_DAY_23':
      return beginDay(host, ctx, 23);
    case 'BEGIN_DAY_24':
      return beginDay(host, ctx, 24);
    case 'BEGIN_DAY_25':
      return beginDay(host, ctx, 25);
    case 'BEGIN_DAY_26':
      return beginDay(host, ctx, 26);
    case 'BEGIN_DAY_27':
      return beginDay(host, ctx, 27);
    case 'BEGIN_DAY_28':
      return beginDay(host, ctx, 28);
    case 'COMPLETE_DAY_22':
      return completeDay(host, ctx, 22);
    case 'COMPLETE_DAY_23':
      return completeDay(host, ctx, 23);
    case 'COMPLETE_DAY_24':
      return completeDay(host, ctx, 24);
    case 'COMPLETE_DAY_25':
      return completeDay(host, ctx, 25);
    case 'COMPLETE_DAY_26':
      return completeDay(host, ctx, 26);
    case 'COMPLETE_DAY_27':
      return completeDay(host, ctx, 27);
    case 'COMPLETE_DAY_28':
      return completeDay(host, ctx, 28);
    case 'WEEK4_ACT':
      return week4Act(host, ctx, String(command.payload?.act ?? 'open'), command.payload ?? {}, eventId);
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openWeek4Menu(host: WeekHost, ctx: WeekCtx, menu: Week4MenuId): Promise<GameResponse> {
  if (!ctx.flags.week_3_complete) throw new ActionRejectedError('Гнилая тропа ещё закрыта.');
  if (menu === 'hollow') return hollowMenu(host, ctx);
  if (menu === 'warped') return warpedMenu(host, ctx);
  if (menu === 'seal4') return prepSeal(host, ctx);
  return edgeMenu(host, ctx);
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (day === 22 && !ctx.flags.week_3_complete) {
    throw new ActionRejectedError('Сначала закрой третью неделю.');
  }
  if (day > 22 && !ctx.flags[`day_${day - 1}_complete`]) {
    throw new ActionRejectedError('Сначала закрой предыдущий день.');
  }
  if (ctx.flags.week_4_complete) return host.renderNode(ctx.player, 'week4_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);

  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 2);

  const quest = QUEST_BY_DAY[day]!;
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: quest.id,
    status: 'ACTIVE',
    progress: {},
  });
  await setFlag(host, ctx, 'week_4_started');

  if (day === 22) {
    ctx.player.currentLocation = 'rotten_trail_edge';
    ctx.player.currentState = 'day22_start';
    await host.store.savePlayer(ctx.player);
    const node = await host.renderNode(ctx.player, 'day22_start');
    const extras: string[] = [];
    if (remWarm(ctx)) extras.push('Рем мягче: «Чаща была сетью. Здесь сеть уже правят.»');
    if (ctx.flags.sold_rusty_token) extras.push('Рем коротко: «Жетон продан. Тропа всё равно знает, где ты был.»');
    if (miraTrust(ctx) >= 2) extras.push('Мира: «След обрывается не сам. Его обрывают.»');
    if (ctx.flags.lantern_repaired) extras.push('Фонарь ловит тёмные прожилки раньше глаз.');
    if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) extras.push('Питомец жмётся и не хочет на гниль.');
    if (extras.length) node.text = `${node.text}\n${extras.join('\n')}`;
    return node;
  }
  if (day === 23) {
    ctx.player.currentLocation = 'split_path';
    ctx.player.currentState = 'day23_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day23_start');
  }
  if (day === 24) {
    ctx.player.currentLocation = 'rot_hollow';
    ctx.player.currentState = 'day24_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day24_start');
  }
  if (day === 25) {
    ctx.player.currentLocation = 'missing_camp';
    ctx.player.currentState = 'day25_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day25_start');
  }
  if (day === 26) {
    ctx.player.currentLocation = 'deadwood_ring';
    ctx.player.currentState = 'day26_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'blackroot',
      title: 'Чернокорень',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day26_start');
  }
  if (day === 27) {
    ctx.player.currentLocation = 'warped_marker_field';
    ctx.player.currentState = 'day27_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day27_start');
  }
  ctx.player.currentLocation = 'black_root_vault';
  ctx.player.currentState = 'day28_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'fourth_seal_seen');
  await setFlag(host, ctx, 'tlennik_seen');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'tlennik',
    title: 'Тленник',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'fourth_seal',
    title: 'Четвёртая печать',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day28_start');
  if (miraTrust(ctx) >= 2) {
    node.text = `${node.text}\nМира: «Ядро в пути, не в коре. Если есть сердцевина — брось в щель до удара.»`;
  } else {
    node.text = `${node.text}\nМира держится сзади. «Не стой на жиле. Она врёт.»`;
  }
  return node;
}

async function completeDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (ctx.flags.week_4_complete && day === 28) return host.renderNode(ctx.player, 'week4_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);
  if (day === 22) {
    if (!ctx.flags.week4_marker_examined) throw new ActionRejectedError('Сначала прочитай правленый знак.');
    if (!routePicked(ctx)) throw new ActionRejectedError('Сначала выбери путь у маркера.');
  } else if (day === 23) {
    if (!falseCleared(ctx)) throw new ActionRejectedError('Сначала пройди одну из трёх троп.');
  } else if (day === 24) {
    if (!ctx.flags.visited_rot_hollow) throw new ActionRejectedError('Сначала гнилая низина.');
  } else if (day === 25) {
    if (!campResolved(ctx)) throw new ActionRejectedError('Сначала лагерь — осмотри или пройди мимо.');
  } else if (day === 26) {
    if (!ctx.flags.defeated_blackroot) throw new ActionRejectedError('Сначала Чернокорень.');
  } else if (day === 27) {
    if (!ctx.flags.warped_network_seen) throw new ActionRejectedError('Сначала осмотри искажённый узел.');
    if (!socialPicked(ctx)) throw new ActionRejectedError('Сначала реши, как пройти чужую группу.');
  } else if (day === 28) {
    if (!ctx.flags.tlennik_defeated) throw new ActionRejectedError('Сначала Тленник.');
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
    await host.addXp(ctx.player, WEEK4_DAY_XP[day as keyof typeof WEEK4_DAY_XP]);
  }
  await setFlag(host, ctx, `day_${day}_complete`);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: questId });
  await noteActivity(host.store, ctx.player, { type: 'day', day });

  if (day === 28) {
    await setFlag(host, ctx, 'seen_three_seals');
    await setFlag(host, ctx, 'week_4_complete');
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'three_seals',
      title: 'Три печати',
      seen: true,
      defeated: false,
    });
    await noteActivity(host.store, ctx.player, { type: 'week', week: 4 });
    await grantMetaAchievement(host.store, ctx.player.id, 'WEEK_FOUR_COMPLETE');
    return host.renderNode(ctx.player, 'three_seals');
  }
  return host.renderNode(ctx.player, `day${day}_complete`);
}

async function week4Act(
  host: WeekHost,
  ctx: WeekCtx,
  act: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  if (!ctx.flags.week_3_complete) throw new ActionRejectedError('Гнилая тропа ещё закрыта.');
  if (act === 'edge') return edgeMenu(host, ctx);
  if (act === 'inspect') return inspectMark(host, ctx);
  if (act === 'gather_edge') return gatherEdge(host, ctx);
  if (act === 'routes') return routeMenu(host, ctx);
  if (act === 'route_old') return pickRoute(host, ctx, 'old');
  if (act === 'route_fresh') return pickRoute(host, ctx, 'fresh');
  if (act === 'route_trees') return pickRoute(host, ctx, 'trees');
  if (act === 'false') return falseMenu(host, ctx);
  if (act === 'path_beast') return falsePath(host, ctx, 'beast');
  if (act === 'path_ravine') return falsePath(host, ctx, 'ravine');
  if (act === 'path_plank') return falsePath(host, ctx, 'plank');
  if (act === 'hollow') return hollowMenu(host, ctx);
  if (act === 'forage') return forage(host, ctx, eventId);
  if (act === 'camp') return missingCamp(host, ctx);
  if (act === 'examine_camp') return examineCamp(host, ctx);
  if (act === 'skip_camp') return skipCamp(host, ctx);
  if (act === 'take_camp') return takeCamp(host, ctx);
  if (act === 'leave_camp') return leaveCamp(host, ctx);
  if (act === 'blackroot') return blackrootGate(host, ctx);
  if (act === 'use_binding') return useBinding(host, ctx);
  if (act === 'use_marker') return useMarker(host, ctx);
  if (act === 'warped') return warpedMenu(host, ctx);
  if (act === 'examine') return examineNode(host, ctx);
  if (act === 'social') return socialMenu(host, ctx);
  if (act === 'help') return socialPick(host, ctx, 'help');
  if (act === 'talk') return socialPick(host, ctx, 'talk');
  if (act === 'pass') return socialPick(host, ctx, 'pass');
  if (act === 'pvp') return socialPick(host, ctx, 'pvp');
  if (act === 'clan_show') return clanPick(host, ctx, true);
  if (act === 'clan_hide') return clanPick(host, ctx, false);
  if (act === 'clan') return clanMenu(host, ctx);
  if (act === 'use_core') return useBlackrootCore(host, ctx);
  if (act === 'prep') return prepSeal(host, ctx);
  if (act === 'seal') return prepSeal(host, ctx);
  if (act === 'open' || act === 'hub') return week4Hub(host, ctx, Number(payload.page ?? 0));
  void payload;
  return week4Hub(host, ctx, Number(payload.page ?? 0));
}

async function edgeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'rotten_trail_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_rotten_trail');
  const buttons: GameButton[] = [
    { label: 'Осмотреть знак', action: 'WEEK4_ACT', payload: { act: 'inspect' } },
    { label: 'Собрать след', action: 'WEEK4_ACT', payload: { act: 'gather_edge' } },
  ];
  if (ctx.flags.week4_marker_examined && !routePicked(ctx)) {
    buttons.push({ label: 'Выбрать путь', action: 'WEEK4_ACT', payload: { act: 'routes' } });
  }
  if (ctx.flags.week4_marker_examined && routePicked(ctx) && !ctx.flags.day_22_complete) {
    buttons.push({ label: 'Завершить День 22', action: 'COMPLETE_DAY_22' });
  } else if (ctx.flags.day_22_complete && buttons.length < 4) {
    buttons.push({ label: 'К развилке', action: 'WEEK4_ACT', payload: { act: 'false' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Край Гнилой тропы. Кора чёрная. Старый маркер несёт свежий рез поверх знака печатей.',
    ctx.flags.week4_marker_examined ? 'Знак прочитан. Кто-то правил путь после установки.' : 'Знак не прочитан.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function inspectMark(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'black_bark_marker';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'week4_marker_examined');
  await setFlag(host, ctx, 'visited_rotten_trail');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'altered_seal_marker',
    title: 'Правленая метка печати',
    seen: true,
    defeated: false,
  });
  const mira = miraTrust(ctx) >= 2 ? '\nМира: «Рез свежий. Не рост. Рука.»' : '';
  const rem = remWarm(ctx)
    ? '\nРем: «Печать стояла. Потом кто-то сдвинул стрелку. Это правка.»'
    : '\nРем коротко: «Не твоя работа. Но смотри.»';
  return edgeMenu(
    host,
    await host.load(ctx.player),
    `Поверх старого знака — новый рез. Направление к печати сдвинуто на палец. Не трещина.${mira}${rem}`,
  );
}

async function gatherEdge(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'rotten_trail_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_rotten_trail');
  await host.spend(ctx.player, 2);
  const first = await host.store.tryClaimReward(ctx.player.id, 'week4', 'edge_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'LOG', 4);
    await host.store.addResource(ctx.player.id, 'ROT_RESIN', 3);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'ROT_RESIN' });
    const buttons: GameButton[] = [{ label: 'Ещё осмотреть', action: 'WEEK4_ACT', payload: { act: 'edge' } }];
    if (ctx.flags.week4_marker_examined && routePicked(ctx) && !ctx.flags.day_22_complete) {
      buttons.push({ label: 'Завершить День 22', action: 'COMPLETE_DAY_22' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(
      ctx.player,
      `Первый след тропы. +4 ${resourceLabel('LOG')}, +3 ${resourceLabel('ROT_RESIN')}. Смола тёплая и чёрная.`,
      buttons,
    );
  }
  await host.store.addResource(ctx.player.id, 'ROT_RESIN', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'ROT_RESIN' });
  return edgeMenu(host, await host.load(ctx.player), `+1 ${resourceLabel('ROT_RESIN')}. Первый склад уже взят.`);
}

async function routeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, extra || 'Путь уже выбран. Все сходятся.');
  ctx.player.currentLocation = 'split_path';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Старый след', action: 'WEEK4_ACT', payload: { act: 'route_old' } },
    { label: 'Свежие метки', action: 'WEEK4_ACT', payload: { act: 'route_fresh' } },
    { label: 'По деревьям', action: 'WEEK4_ACT', payload: { act: 'route_trees' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  return host.respond(
    ctx.player,
    extra || 'Три пути у маркера. Все сходятся у ложных следов. Выбери, как читать правленый знак.',
    buttons,
  );
}

async function pickRoute(host: WeekHost, ctx: WeekCtx, kind: 'old' | 'fresh' | 'trees'): Promise<GameResponse> {
  if (routePicked(ctx)) return edgeMenu(host, ctx, 'Путь уже выбран.');
  if (kind === 'old') await setFlag(host, ctx, 'week4_route_old');
  else if (kind === 'fresh') await setFlag(host, ctx, 'week4_route_fresh');
  else await setFlag(host, ctx, 'week4_route_trees');
  const note =
    kind === 'old'
      ? 'Идёшь по старому следу. Он обрывается и всё равно выводит к развилке.'
      : kind === 'fresh'
        ? 'Свежие метки ведут в сторону. Через час — та же развилка.'
        : 'Деревья в тёмных прожилках указывают пальцем. Снова развилка.';
  return edgeMenu(host, await host.load(ctx.player), note);
}

async function falseMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'split_path';
  await host.store.savePlayer(ctx.player);
  if (falseCleared(ctx)) {
    const buttons: GameButton[] = [];
    if (!ctx.flags.day_23_complete) buttons.push({ label: 'Завершить День 23', action: 'COMPLETE_DAY_23' });
    buttons.push({ label: 'В низину', action: 'WEEK4_ACT', payload: { act: 'hollow' } });
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(ctx.player, extra || 'Тропа пройдена. Низина дышит гнилью.', buttons);
  }
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const buttons: GameButton[] = [
    { label: 'Звериная', action: 'WEEK4_ACT', payload: { act: 'path_beast' } },
    { label: 'Овраг', action: 'WEEK4_ACT', payload: { act: 'path_ravine' } },
    { label: 'Настилка', action: 'WEEK4_ACT', payload: { act: 'path_plank' } },
    { label: BACK_LABEL, action: 'OPEN_CAMP' },
  ];
  const text = [
    extra,
    'Ложные следы. Профессия не запирает — только короче.',
    `Охотник L${hunter}: ${hunter >= 5 ? 'читает след' : 'пойдёт дольше'}.`,
    `Шахтёр L${miner}: ${miner >= 5 ? 'видит грунт' : 'овраг сыпет'}.`,
    `Лесоруб L${logger}: ${logger >= 5 ? 'узнаёт свежий рез' : 'настилка врёт'}.`,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function falsePath(host: WeekHost, ctx: WeekCtx, kind: 'beast' | 'ravine' | 'plank'): Promise<GameResponse> {
  if (falseCleared(ctx)) return falseMenu(host, ctx, 'Уже пройдено.');
  const hunter = await jobLevel(host, ctx, 'HUNTER');
  const miner = await jobLevel(host, ctx, 'MINER');
  const logger = await jobLevel(host, ctx, 'LOGGER');
  const match =
    (kind === 'beast' && hunter >= 5) || (kind === 'ravine' && miner >= 5) || (kind === 'plank' && logger >= 5);
  if (kind === 'beast') await setFlag(host, ctx, 'week4_path_beast');
  else if (kind === 'ravine') await setFlag(host, ctx, 'week4_path_ravine');
  else await setFlag(host, ctx, 'week4_path_plank');
  if (match) {
    await setFlag(host, ctx, 'week4_path_adv');
    if (kind === 'beast') {
      await host.store.addResource(ctx.player.id, 'HIDE', 2);
      await host.store.addResource(ctx.player.id, 'ROT_RESIN', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'HIDE' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'ROT_RESIN' });
    } else if (kind === 'ravine') {
      await host.store.addResource(ctx.player.id, 'COAL', 2);
      await host.store.addResource(ctx.player.id, 'COBBLESTONE', 3);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'COAL' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'COBBLESTONE' });
    } else {
      await host.store.addResource(ctx.player.id, 'LOG', 3);
      await host.store.addResource(ctx.player.id, 'ROT_RESIN', 2);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'ROT_RESIN' });
    }
    const note =
      kind === 'beast'
        ? 'След читается. Шкура и смола без драки.'
        : kind === 'ravine'
          ? 'Грунт держит. Уголь и камень без обвала.'
          : 'Свежий рез на настилке. Брёвна и смола без обхода.';
    return falseMenu(host, await host.load(ctx.player), note);
  }
  const cost = await softCost(host, ctx, 2, 1);
  const note =
    kind === 'beast'
      ? `След врёт. Вышел. ${cost}. Не заперто.`
      : kind === 'ravine'
        ? `Овраг сыпет. Вышел. ${cost}. Не заперто.`
        : `Настилка ведёт в круг. Вышел. ${cost}. Не заперто.`;
  return falseMenu(host, await host.load(ctx.player), note);
}

async function hollowMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!falseCleared(ctx) && !ctx.flags.day_23_complete) {
    throw new ActionRejectedError('Сначала ложные следы.');
  }
  ctx.player.currentLocation = 'rot_hollow';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_rot_hollow');
  const buttons: GameButton[] = [
    { label: 'Гнилуш', action: 'START_PVE', payload: { enemyId: 'rot_scuttler' } },
    { label: 'Топник', action: 'START_PVE', payload: { enemyId: 'mire_stalker' } },
    { label: 'Короедник', action: 'START_PVE', payload: { enemyId: 'bark_reaper' } },
  ];
  if (ctx.flags.day_24_complete) {
    buttons.push({ label: 'Собрать', action: 'WEEK4_ACT', payload: { act: 'forage' } });
  } else {
    buttons.push({ label: 'Завершить День 24', action: 'COMPLETE_DAY_24' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    extra || 'Гнилая низина. Повторные бои дают шкуру и смолу. Не ферма опыта.',
    buttons,
  );
}

async function forage(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  if (!ctx.flags.visited_rot_hollow && !falseCleared(ctx)) {
    throw new ActionRejectedError('Собирать негде.');
  }
  await host.spend(ctx.player, 2);
  await host.store.addResource(ctx.player.id, 'FOOD', 1);
  await host.store.addResource(ctx.player.id, 'HERBS', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'FOOD' });
  const daily = await host.store.tryClaimReward(
    ctx.player.id,
    'week4',
    `forage:${host.now().toISOString().slice(0, 10)}`,
  );
  if (daily) {
    await host.store.addResource(ctx.player.id, 'ROT_RESIN', 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'ROT_RESIN' });
  }
  void eventId;
  const next = await host.load(ctx.player);
  const note = daily
    ? `Собрано: +1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('HERBS')}, +2 ${resourceLabel('ROT_RESIN')} (раз в сутки).`
    : `+1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('HERBS')}. Суточный пучок смолы уже снят.`;
  return hollowMenu(host, next, note);
}

async function missingCamp(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'missing_camp';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.missing_camp_examined && !ctx.flags.missing_camp_skipped) {
    buttons.push({ label: 'Осмотреть остатки', action: 'WEEK4_ACT', payload: { act: 'examine_camp' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK4_ACT', payload: { act: 'skip_camp' } });
  } else if (ctx.flags.missing_camp_examined && !ctx.flags.missing_camp_looted && !ctx.flags.missing_camp_left) {
    buttons.push({ label: 'Забрать вещи', action: 'WEEK4_ACT', payload: { act: 'take_camp' } });
    buttons.push({ label: 'Оставить', action: 'WEEK4_ACT', payload: { act: 'leave_camp' } });
  }
  if (campResolved(ctx) && !ctx.flags.day_25_complete) {
    buttons.push({ label: 'Завершить День 25', action: 'COMPLETE_DAY_25' });
  }
  if (ctx.flags.day_25_complete) {
    buttons.push({ label: 'К кольцу', action: 'WEEK4_ACT', payload: { act: 'blackroot' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Кострище есть. Вещи есть. Людей нет. Лагерь сняли с места — все сразу.',
    'Не кровь. Пустота и перечёркнутая стрелка к печати.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function examineCamp(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'missing_camp_examined');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'missing_camp',
    title: 'Пропавший лагерь',
    seen: true,
    defeated: false,
  });
  return missingCamp(
    host,
    await host.load(ctx.player),
    'На коре — короткий рез: стрелка к печати перечёркнута, рядом тот же свежий знак, что на маркере. Группа свернула разом. Не убийство. Правка пути.',
  );
}

async function skipCamp(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'missing_camp_skipped');
  return missingCamp(host, await host.load(ctx.player), 'Проходишь мимо. Кострище остывает в спину. Сюжет не запирает.');
}

async function takeCamp(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.missing_camp_examined) throw new ActionRejectedError('Сначала осмотри лагерь.');
  await setFlag(host, ctx, 'missing_camp_looted');
  const first = await host.store.tryClaimReward(ctx.player.id, 'week4', 'camp_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'FOOD', 4);
    await host.store.addResource(ctx.player.id, 'LOG', 3);
    await host.store.addResource(ctx.player.id, 'ROT_RESIN', 2);
    await host.changeCoins(ctx.player, 8, 'week4_camp', 'loot');
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'FOOD' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'ROT_RESIN' });
  }
  return missingCamp(host, await host.load(ctx.player), 'Паёк, брёвна, смола. Вещи ничьи. Один раз.');
}

async function leaveCamp(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.missing_camp_examined) throw new ActionRejectedError('Сначала осмотри лагерь.');
  await setFlag(host, ctx, 'missing_camp_left');
  return missingCamp(host, await host.load(ctx.player), 'Вещи остаются. Пустота не обижается. Пока.');
}

async function blackrootGate(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'deadwood_ring';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Бить Чернокорня', action: 'START_PVE', payload: { enemyId: 'blackroot' } },
  ];
  if (ctx.flags.defeated_blackroot && !ctx.flags.day_26_complete) {
    buttons.unshift({ label: 'Завершить День 26', action: 'COMPLETE_DAY_26' });
  }
  if (hasItem(ctx, 'rot_binding') && !ctx.flags.rot_binding_used) {
    buttons.push({ label: 'Связка', action: 'WEEK4_ACT', payload: { act: 'use_binding' } });
  }
  if (hasItem(ctx, 'path_marker') && !ctx.flags.path_marker_used && buttons.length < 3) {
    buttons.push({ label: 'Метка', action: 'WEEK4_ACT', payload: { act: 'use_marker' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({ label: 'С дистанции', action: 'START_PVE', payload: { enemyId: 'blackroot', move: 'bow' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Чернокорень в кольце. Кора и гниль срослись. Не страж печати. Лук, щит, связка, настил помогают. Без них — можно.',
    buttons,
  );
}

async function useBinding(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'rot_binding')) {
    throw new ActionRejectedError('Связки нет. Гнилая смола, волокно и палка.');
  }
  if (ctx.flags.rot_binding_used) return blackrootGate(host, ctx);
  await setFlag(host, ctx, 'rot_binding_used');
  await setFlag(host, ctx, 'has_rot_binding');
  return blackrootGate(host, await host.load(ctx.player));
}

async function useMarker(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'path_marker')) {
    throw new ActionRejectedError('Метки нет. Доски, уголь и гнилая смола.');
  }
  if (ctx.flags.path_marker_used) return prepSeal(host, ctx);
  await setFlag(host, ctx, 'path_marker_used');
  await setFlag(host, ctx, 'has_path_marker');
  if (!ctx.flags.defeated_blackroot) return blackrootGate(host, await host.load(ctx.player));
  return prepSeal(host, await host.load(ctx.player));
}

async function warpedMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'corrupted_node';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.warped_network_seen) {
    buttons.push({ label: 'Осмотреть узел', action: 'WEEK4_ACT', payload: { act: 'examine' } });
  } else if (!socialPicked(ctx)) {
    buttons.push({ label: 'Чужая группа', action: 'WEEK4_ACT', payload: { act: 'social' } });
  }
  if (ctx.flags.warped_network_seen && socialPicked(ctx) && !ctx.flags.day_27_complete) {
    buttons.push({ label: 'Завершить День 27', action: 'COMPLETE_DAY_27' });
  }
  if (ctx.flags.day_27_complete) {
    buttons.push({ label: 'К своду', action: 'WEEK4_ACT', payload: { act: 'prep' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const remLine = remWarm(ctx)
    ? 'Рем: «Это не трещина. Это правка. Кто-то знает, как сеть держит путь.»'
    : 'Рем молчит лишнее. Только: «Не ломай. Смотри, куда сдвинули.»';
  const miraLine =
    miraTrust(ctx) >= 2
      ? 'Мира: «Кто-то не ломал систему. Он её перенастраивал.»'
      : 'Мира даёт мало. «Направление врали. Не спрашивай имя.»';
  const text = [
    extra,
    'Искажённый узел. Старые нити. Поверх — свежий рез. Путь к четвёртой печати сдвинут руками.',
    remLine,
    miraLine,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function examineNode(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'warped_network_seen');
  ctx.player.currentLocation = 'buried_crossing';
  await host.store.savePlayer(ctx.player);
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'warped_network',
    title: 'Искажённая сеть',
    seen: true,
    defeated: false,
  });
  return warpedMenu(
    host,
    await host.load(ctx.player),
    'На своде видно: старые линии сети и новые отметки поверх. Направление к печати изменено вручную. Это не трещина. Это правка. Кто — не сказано. Зачем — тоже. Знает устройство. Умеет вмешиваться.',
  );
}

async function socialMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!ctx.flags.warped_network_seen) throw new ActionRejectedError('Сначала узел.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const buttons: GameButton[] = [];
  if (!socialPicked(ctx)) {
    buttons.push({ label: 'Помочь', action: 'WEEK4_ACT', payload: { act: 'help' } });
    buttons.push({ label: 'Обменяться', action: 'WEEK4_ACT', payload: { act: 'talk' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK4_ACT', payload: { act: 'pass' } });
  }
  if (clan && !ctx.flags.week4_clan_shown && !ctx.flags.week4_clan_hidden && buttons.length < 4) {
    buttons.push({ label: 'Знак клана', action: 'WEEK4_ACT', payload: { act: 'clan' } });
  }
  if (socialPicked(ctx) && !ctx.flags.day_27_complete) {
    buttons.push({ label: 'Завершить День 27', action: 'COMPLETE_DAY_27' });
  }
  if (ctx.flags.week4_social_pvp && buttons.length < 4) {
    buttons.push({ label: 'Стычка', action: 'START_PVP' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const clanLine = clan
    ? `Знак ${clan.clan.tag} здесь уже знают. Можно показать. Не обязательно. Скидки на паёк — если покажешь.`
    : 'Клана нет — нейтральный путь открыт.';
  return host.respond(
    ctx.player,
    [extra, 'Следы чужой группы у узла. Не клановая война. Три пути, все ведут дальше.', clanLine]
      .filter(Boolean)
      .join('\n'),
    buttons,
  );
}

async function socialPick(
  host: WeekHost,
  ctx: WeekCtx,
  kind: 'help' | 'talk' | 'pass' | 'pvp',
): Promise<GameResponse> {
  if (!ctx.flags.warped_network_seen) throw new ActionRejectedError('Сначала узел.');
  if (socialPicked(ctx)) return socialMenu(host, ctx, 'Группа уже пройдена.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const discount = Boolean(clan && ctx.flags.week4_clan_shown);
  if (kind === 'help') {
    await setFlag(host, ctx, 'week4_social_help');
    const cost = await softCost(host, ctx, 1, discount ? 0 : 1);
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week4', 'social');
    if (ok) {
      await host.changeCoins(ctx.player, 6, 'week4_social', 'help');
      await host.store.addResource(ctx.player.id, 'FOOD', discount ? 3 : 2);
    }
    return socialMenu(host, await host.load(ctx.player), `Помог пройти правленый знак. ${cost}. Паёк на двоих. +6 монет.`);
  }
  if (kind === 'talk') {
    await setFlag(host, ctx, 'week4_social_talk');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week4', 'social');
    if (ok) {
      await host.store.addResource(ctx.player.id, 'ROT_RESIN', 1);
      await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'ROT_RESIN' });
    }
    return socialMenu(
      host,
      await host.load(ctx.player),
      'Слова вместо клинка. Они тоже видели свежий рез. Смола за карту. Стычка не нужна.',
    );
  }
  if (kind === 'pass') {
    await setFlag(host, ctx, 'week4_social_pass');
    return socialMenu(host, await host.load(ctx.player), 'Проходишь мимо. Они не зовут. Путь открыт.');
  }
  await setFlag(host, ctx, 'week4_social_pvp');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'week4', 'social');
  if (ok) await host.changeCoins(ctx.player, 8, 'week4_social', 'pvp');
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
  if (!ctx.flags.week4_clan_shown && !ctx.flags.week4_clan_hidden) {
    buttons.push({ label: 'Показать', action: 'WEEK4_ACT', payload: { act: 'clan_show' } });
    buttons.push({ label: 'Скрыть', action: 'WEEK4_ACT', payload: { act: 'clan_hide' } });
  }
  buttons.push({ label: 'Группа', action: 'WEEK4_ACT', payload: { act: 'social' } });
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
  if (show) await setFlag(host, ctx, 'week4_clan_shown');
  else await setFlag(host, ctx, 'week4_clan_hidden');
  return socialMenu(
    host,
    await host.load(ctx.player),
    show ? `Знак ${clan.clan.tag} виден. Это не сила удара. Только взгляд и паёк.` : 'Знак скрыт. Тропа не спрашивает стаю.',
  );
}

async function useBlackrootCore(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.used_blackroot_core) return prepSeal(host, ctx);
  if ((ctx.resources.BLACKROOT_CORE ?? 0) < 1 && !ctx.flags.has_blackroot_core) {
    throw new ActionRejectedError('Сердцевины нет. Чернокорень ещё или уже потрачена.');
  }
  if ((ctx.resources.BLACKROOT_CORE ?? 0) >= 1) {
    await host.store.addResource(ctx.player.id, 'BLACKROOT_CORE', -1);
  }
  await setFlag(host, ctx, 'used_blackroot_core');
  await host.store.setFlag(ctx.player.id, 'blackroot_core_kept', '');
  delete ctx.flags.blackroot_core_kept;
  return prepSeal(host, await host.load(ctx.player));
}

async function prepSeal(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'black_root_vault';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'tlennik_seen');
  const jobs = {
    LOGGER: await jobLevel(host, ctx, 'LOGGER'),
    MINER: await jobLevel(host, ctx, 'MINER'),
    HUNTER: await jobLevel(host, ctx, 'HUNTER'),
    CRAFTER: await jobLevel(host, ctx, 'CRAFTER'),
  };
  const lines = [
    'Чёрный свод. Четвёртая печать. Путь под ногами врёт на палец.',
    hasBow(ctx) ? 'Лук: внешний узел с дистанции.' : 'Без лука — вплотную.',
    hasShield(ctx) ? 'Щит: тяжёлый удар слабее.' : 'Без щита — принимай удар.',
    ctx.flags.lantern_repaired ? 'Фонарь показывает тлен.' : 'Без фонаря силуэт плывёт. Проход есть.',
    ctx.flags.used_blackroot_core
      ? 'Сердцевина уже в щели.'
      : ctx.flags.has_blackroot_core
        ? 'Сердцевину можно бросить сейчас.'
        : 'Без сердцевины — просто дольше.',
    miraTrust(ctx) >= 2 ? 'Мира: бей ядро пути.' : 'Мира почти молчит.',
    jobs.HUNTER >= 10 ? 'Охотник бьёт первым.' : '',
    jobs.LOGGER >= 10 ? 'Лесоруб видит слабую кору.' : '',
    jobs.MINER >= 10 ? 'Шахтёр стоит устойчиво.' : '',
    ctx.flags.path_marker_used ? 'Метка пути уже лежит.' : hasItem(ctx, 'path_marker') ? 'Метку можно положить.' : '',
  ].filter(Boolean);
  const buttons: GameButton[] = [
    { label: 'Бить ядро', action: 'START_PVE', payload: { enemyId: 'tlennik', move: 'core' } },
  ];
  if ((ctx.flags.has_blackroot_core || (ctx.resources.BLACKROOT_CORE ?? 0) > 0) && !ctx.flags.used_blackroot_core) {
    buttons.push({ label: 'Бросить сердцевину', action: 'WEEK4_ACT', payload: { act: 'use_core' } });
  }
  if (hasItem(ctx, 'path_marker') && !ctx.flags.path_marker_used && buttons.length < 4) {
    buttons.push({ label: 'Положить метку', action: 'WEEK4_ACT', payload: { act: 'use_marker' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({
      label: 'Ядро с дистанции',
      action: 'START_PVE',
      payload: { enemyId: 'tlennik', move: 'bow' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons);
}

async function week4Hub(host: WeekHost, ctx: WeekCtx, page = 0): Promise<GameResponse> {
  if (ctx.flags.week_4_complete) return host.renderNode(ctx.player, 'week4_complete');
  const items: GameButton[] = [];
  if (!ctx.flags.day_22_complete) {
    items.push({ label: 'Край тропы', action: 'WEEK4_ACT', payload: { act: 'edge' } });
  } else if (!ctx.flags.day_23_complete) {
    items.push({ label: 'Развилка', action: 'WEEK4_ACT', payload: { act: 'false' } });
  } else if (!ctx.flags.day_24_complete) {
    items.push({ label: 'Низина', action: 'WEEK4_ACT', payload: { act: 'hollow' } });
  } else if (!ctx.flags.day_25_complete) {
    items.push({ label: 'Лагерь', action: 'WEEK4_ACT', payload: { act: 'camp' } });
  } else if (!ctx.flags.day_26_complete) {
    items.push({ label: 'Чернокорень', action: 'WEEK4_ACT', payload: { act: 'blackroot' } });
  } else if (!ctx.flags.day_27_complete) {
    if (ctx.flags.warped_network_seen && !socialPicked(ctx)) {
      items.push({ label: 'Группа', action: 'WEEK4_ACT', payload: { act: 'social' } });
    } else {
      items.push({ label: 'Узел', action: 'WEEK4_ACT', payload: { act: 'warped' } });
    }
  } else {
    items.push({ label: 'Свод', action: 'WEEK4_ACT', payload: { act: 'prep' } });
  }
  if (ctx.flags.day_23_complete && items.every((row) => row.payload?.act !== 'hollow')) {
    items.push({ label: 'Низина', action: 'WEEK4_ACT', payload: { act: 'hollow' } });
  }
  if (ctx.flags.day_22_complete && items.every((row) => row.payload?.act !== 'edge')) {
    items.push({ label: 'Край тропы', action: 'WEEK4_ACT', payload: { act: 'edge' } });
  }
  return host.respond(
    ctx.player,
    'Гнилая тропа. Четыре печати ещё не молчат. Три уже. Одна близко. Путь под ногами врёт.',
    pagedButtons(
      items,
      page,
      (next) => ({ label: '➡ Ещё', action: 'WEEK4_ACT', payload: { act: 'hub', page: next } }),
      { label: BACK_LABEL, action: 'OPEN_CAMP' },
    ),
  );
}

export async function applyWeek4Victory(host: WeekHost, ctx: WeekCtx, enemyId: string): Promise<string[]> {
  const notes: string[] = [];
  if (enemyId === 'blackroot') {
    await setFlag(host, ctx, 'defeated_blackroot');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'blackroot');
    if (first) {
      await host.store.addResource(ctx.player.id, 'BLACKROOT_CORE', 1);
      await setFlag(host, ctx, 'has_blackroot_core');
      await setFlag(host, ctx, 'blackroot_core_kept');
      notes.push(`+1 ${resourceLabel('BLACKROOT_CORE')}.`);
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'blackroot_hunt',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'blackroot_hunt' });
    } else {
      notes.push('Чернокорень уже отдал сердцевину.');
    }
  }
  if (enemyId === 'tlennik') {
    await setFlag(host, ctx, 'tlennik_defeated');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'tlennik');
    if (first) {
      await host.store.addResource(ctx.player.id, 'SEAL_SHARD_4', 1);
      notes.push(`+1 ${resourceLabel('SEAL_SHARD_4')}.`);
      await host.changeCoins(ctx.player, 70, 'tlennik', 'first');
      notes.push('+70 монет.');
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'fourth_seal',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'fourth_seal' });
    } else {
      notes.push('Сюжетный лут уже получен.');
    }
  }
  return notes;
}

export async function loadWeek4JobLevels(
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
