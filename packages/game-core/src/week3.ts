import {
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  WEEK3_DAY_XP,
  resourceLabel,
  type JobProfession,
} from '@kubolesie/content';
import type { CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError, InsufficientResourcesError } from './errors';
import type { WeekCtx, WeekHost } from './week';
import { grantMetaAchievement, noteActivity } from './meta';
import { tickCrop } from './week2';
import { pagedButtons } from './paging';

export const WEEK3_MENUS = ['rootwood', 'grove', 'mechanism', 'seal3'] as const;
export type Week3MenuId = (typeof WEEK3_MENUS)[number];

export function isWeek3Menu(menu: string): menu is Week3MenuId {
  return (WEEK3_MENUS as readonly string[]).includes(menu);
}

export const WEEK3_COMMANDS = [
  'BEGIN_DAY_15',
  'BEGIN_DAY_16',
  'BEGIN_DAY_17',
  'BEGIN_DAY_18',
  'BEGIN_DAY_19',
  'BEGIN_DAY_20',
  'BEGIN_DAY_21',
  'COMPLETE_DAY_15',
  'COMPLETE_DAY_16',
  'COMPLETE_DAY_17',
  'COMPLETE_DAY_18',
  'COMPLETE_DAY_19',
  'COMPLETE_DAY_20',
  'COMPLETE_DAY_21',
  'WEEK3_ACT',
] as const;

export const WEEK3_ENEMIES = ['root_crawler', 'bark_hound', 'sap_stinger', 'rootlasher', 'vyazen'] as const;

export function isWeek3Enemy(id: string): boolean {
  return (WEEK3_ENEMIES as readonly string[]).includes(id);
}

export function isWeek3Location(id: string): boolean {
  return (
    id === 'rootwood_edge' ||
    id === 'tangled_path' ||
    id === 'old_marker' ||
    id === 'hollow_grove' ||
    id === 'root_pit' ||
    id === 'buried_mechanism' ||
    id === 'root_chamber' ||
    id === 'root_seal_forecourt' ||
    id === 'deep_root_vault'
  );
}

const QUEST_BY_DAY: Record<number, { id: string; title: string }> = {
  15: { id: 'enter_rootwood', title: 'Вход в чащу' },
  16: { id: 'clear_the_tangle', title: 'Расчистить завал' },
  17: { id: 'hollow_grove', title: 'Полая роща' },
  18: { id: 'buried_network', title: 'Заброшенный узел' },
  19: { id: 'prepare_for_depths', title: 'Припасы вглубь' },
  20: { id: 'rootlasher_hunt', title: 'Охота на Корнеплёта' },
  21: { id: 'third_seal', title: 'Третья печать' },
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

function foodUnits(ctx: WeekCtx): number {
  const fromRes = (ctx.resources.FOOD ?? 0) + (ctx.resources.COOKED_FISH ?? 0);
  const fromItems = ctx.items.filter((item) => item.templateId === 'bread' || item.templateId === 'dry_rusk').length;
  return fromRes + fromItems;
}

function socialPicked(ctx: WeekCtx): boolean {
  return Boolean(ctx.flags.root_social_sneak || ctx.flags.root_social_negotiate || ctx.flags.root_social_pvp);
}

export function week3Modifiers(
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
  const boss = enemyId === 'rootlasher' || enemyId === 'vyazen';
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
  if (ctx.flags.lantern_repaired && (enemyId === 'vyazen' || enemyId === 'sap_stinger' || enemyId === 'rootlasher')) {
    enemy.dodge = 0;
    player.critChance = 8;
    bits.push('фонарь: жила видна');
  }
  if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    player.dodge = 14;
    bits.push('питомец рядом');
  }
  if ((jobs.HUNTER ?? 0) >= 10 || (jobs.LOGGER ?? 0) >= 10) {
    playerOpeningHits = Math.max(playerOpeningHits, 1);
    if ((jobs.LOGGER ?? 0) >= 10) bits.push('лесоруб видит слабый корень');
    if ((jobs.HUNTER ?? 0) >= 10) bits.push('охотник бьёт первым');
  }
  if ((jobs.MINER ?? 0) >= 10 && boss) {
    enemy.defense = (enemy.defense ?? 0) - 2;
    bits.push('шахтёр: слабая опора');
  }
  if ((jobs.CRAFTER ?? 0) >= 10 && boss) {
    player.defense = (player.defense ?? 0) + 1;
    bits.push('настил ремесленника');
  }
  if (ctx.flags.root_pack_ready && boss) {
    player.accuracy = 4;
    bits.push('запас собран');
  }
  if (ctx.flags.root_rope_used && enemyId === 'rootlasher') {
    enemy.defense = (enemy.defense ?? 0) - 1;
    bits.push('верёвка: короткий угол');
  }
  if (enemyId === 'vyazen') {
    if (ctx.flags.used_root_core) {
      enemy.hp = -30;
      bits.push('сердцевина гасит корень');
    }
    if (miraTrust(ctx) >= 2) {
      enemy.defense = (enemy.defense ?? 0) - 1;
      bits.push('Мира: бей узел, не кору');
    }
    if (ctx.flags.root_part_taken) {
      enemy.dodge = enemy.dodge == null ? 0 : Math.max(0, enemy.dodge - 2);
      bits.push('древняя деталь звенит');
    }
    if (ctx.flags.root_clan_shown) bits.push('знак клана не даёт силы — только взгляд');
  }
  return { player, enemy, note: bits.join(', '), playerOpeningHits };
}

export async function dispatchWeek3(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_15':
      return beginDay(host, ctx, 15);
    case 'BEGIN_DAY_16':
      return beginDay(host, ctx, 16);
    case 'BEGIN_DAY_17':
      return beginDay(host, ctx, 17);
    case 'BEGIN_DAY_18':
      return beginDay(host, ctx, 18);
    case 'BEGIN_DAY_19':
      return beginDay(host, ctx, 19);
    case 'BEGIN_DAY_20':
      return beginDay(host, ctx, 20);
    case 'BEGIN_DAY_21':
      return beginDay(host, ctx, 21);
    case 'COMPLETE_DAY_15':
      return completeDay(host, ctx, 15);
    case 'COMPLETE_DAY_16':
      return completeDay(host, ctx, 16);
    case 'COMPLETE_DAY_17':
      return completeDay(host, ctx, 17);
    case 'COMPLETE_DAY_18':
      return completeDay(host, ctx, 18);
    case 'COMPLETE_DAY_19':
      return completeDay(host, ctx, 19);
    case 'COMPLETE_DAY_20':
      return completeDay(host, ctx, 20);
    case 'COMPLETE_DAY_21':
      return completeDay(host, ctx, 21);
    case 'WEEK3_ACT':
      return week3Act(host, ctx, String(command.payload?.act ?? 'open'), command.payload ?? {}, eventId);
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openWeek3Menu(host: WeekHost, ctx: WeekCtx, menu: Week3MenuId): Promise<GameResponse> {
  if (menu === 'grove') return groveMenu(host, ctx);
  if (menu === 'mechanism') return mechanismMenu(host, ctx);
  if (menu === 'seal3') return prepSeal(host, ctx);
  return edgeMenu(host, ctx);
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (day === 15 && !ctx.flags.week_2_complete) {
    throw new ActionRejectedError('Сначала закрой вторую неделю.');
  }
  if (day > 15 && !ctx.flags[`day_${day - 1}_complete`]) {
    throw new ActionRejectedError('Сначала закрой предыдущий день.');
  }
  if (ctx.flags.week_3_complete) return host.renderNode(ctx.player, 'week3_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);

  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 2);

  const quest = QUEST_BY_DAY[day]!;
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: quest.id,
    status: 'ACTIVE',
    progress: {},
  });
  await setFlag(host, ctx, 'week_3_started');

  if (day === 15) {
    ctx.player.currentLocation = 'rootwood_edge';
    ctx.player.currentState = 'day15_start';
    await host.store.savePlayer(ctx.player);
    const node = await host.renderNode(ctx.player, 'day15_start');
    const extras: string[] = [];
    if (remWarm(ctx)) extras.push('Рем мягче: «Жетон ты мне тогда показал. Чаща — не Узел. Но тот же холод сети.»');
    if (ctx.flags.sold_rusty_token) extras.push('Рем коротко: «Жетон продан. Корни всё равно знают, где ты был.»');
    if (miraTrust(ctx) >= 2) extras.push('Мира сзади: «Корни ведут себя не как растения. Не рви первое, что шевелится.»');
    if (ctx.flags.lantern_repaired) extras.push('Фонарь ловит жилы раньше глаз.');
    if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) extras.push('Питомец жмётся и не хочет под свод.');
    if (extras.length) node.text = `${node.text}\n${extras.join('\n')}`;
    return node;
  }
  if (day === 16) {
    ctx.player.currentLocation = 'tangled_path';
    ctx.player.currentState = 'day16_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day16_start');
  }
  if (day === 17) {
    ctx.player.currentLocation = 'hollow_grove';
    ctx.player.currentState = 'day17_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day17_start');
  }
  if (day === 18) {
    ctx.player.currentLocation = 'buried_mechanism';
    ctx.player.currentState = 'day18_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'buried_mechanism',
      title: 'Заброшенный узел',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day18_start');
  }
  if (day === 19) {
    ctx.player.currentLocation = 'root_pit';
    ctx.player.currentState = 'day19_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day19_start');
  }
  if (day === 20) {
    ctx.player.currentLocation = 'root_pit';
    ctx.player.currentState = 'day20_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'rootlasher',
      title: 'Корнеплёт',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day20_start');
  }
  ctx.player.currentLocation = 'deep_root_vault';
  ctx.player.currentState = 'day21_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_root_seal');
  await setFlag(host, ctx, 'vyazen_seen');
  await setFlag(host, ctx, 'third_seal_seen');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'root_seal_guardian',
    title: 'Корневой страж',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'vyazen',
    title: 'Вязень',
    seen: true,
    defeated: false,
  });
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'third_seal',
    title: 'Третья печать',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day21_start');
  if (miraTrust(ctx) >= 2) {
    node.text = `${node.text}\nМира: «Ядро в корне, не в коре. Если есть сердцевина — брось в щель до удара.»`;
  } else {
    node.text = `${node.text}\nМира держится сзади. Говорит только: «Не стой на жиле.»`;
  }
  return node;
}

async function completeDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (ctx.flags.week_3_complete && day === 21) return host.renderNode(ctx.player, 'week3_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);
  const need: Record<number, [string, string]> = {
    15: ['inspected_root_mark', 'Сначала прочитай знак на маркере.'],
    16: ['tangle_cleared', 'Сначала расчисти завал.'],
    17: ['visited_hollow_grove', 'Сначала полая роща.'],
    18: ['root_mechanism_examined', 'Сначала узел — осмотри или пройди мимо.'],
    19: ['root_pack_ready', 'Сначала собери припасы.'],
    20: ['defeated_rootlasher', 'Сначала Корнеплёт.'],
    21: ['vyazen_defeated', 'Сначала Вязень.'],
  };
  if (day === 18) {
    if (!ctx.flags.root_mechanism_examined && !ctx.flags.root_mechanism_skipped) {
      throw new ActionRejectedError('Сначала узел — осмотри или пройди мимо.');
    }
  } else if (day === 20) {
    if (!ctx.flags.defeated_rootlasher) throw new ActionRejectedError(need[20]![1]);
    if (!socialPicked(ctx)) throw new ActionRejectedError('Сначала реши, как пройти следы чужой группы.');
  } else {
    const gate = need[day]!;
    if (!ctx.flags[gate[0]]) throw new ActionRejectedError(gate[1]);
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
    await host.addXp(ctx.player, WEEK3_DAY_XP[day as keyof typeof WEEK3_DAY_XP]);
  }
  await setFlag(host, ctx, `day_${day}_complete`);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: questId });
  await noteActivity(host.store, ctx.player, { type: 'day', day });

  if (day === 21) {
    await setFlag(host, ctx, 'seen_four_seals');
    await setFlag(host, ctx, 'week_3_complete');
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'four_seals',
      title: 'Четыре печати',
      seen: true,
      defeated: false,
    });
    await noteActivity(host.store, ctx.player, { type: 'week', week: 3 });
    await grantMetaAchievement(host.store, ctx.player.id, 'WEEK_THREE_COMPLETE');
    return host.renderNode(ctx.player, 'four_seals');
  }
  return host.renderNode(ctx.player, `day${day}_complete`);
}

async function week3Act(
  host: WeekHost,
  ctx: WeekCtx,
  act: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  if (!ctx.flags.week_2_complete) throw new ActionRejectedError('Чаща ещё закрыта.');
  if (act === 'edge') return edgeMenu(host, ctx);
  if (act === 'inspect') return inspectMark(host, ctx);
  if (act === 'gather_edge') return gatherEdge(host, ctx);
  if (act === 'detour') return takeDetour(host, ctx);
  if (act === 'tangle') return tangleMenu(host, ctx);
  if (act === 'path_logger') return clearPath(host, ctx, 'logger');
  if (act === 'path_miner') return clearPath(host, ctx, 'miner');
  if (act === 'path_crafter') return clearPath(host, ctx, 'crafter');
  if (act === 'grove') return groveMenu(host, ctx);
  if (act === 'pit') return pitMenu(host, ctx);
  if (act === 'forage') return forage(host, ctx, eventId);
  if (act === 'mechanism') return mechanismMenu(host, ctx);
  if (act === 'examine') return examineMechanism(host, ctx);
  if (act === 'skip_mech') return skipMechanism(host, ctx);
  if (act === 'take_part') return takePart(host, ctx);
  if (act === 'leave_part') return leavePart(host, ctx);
  if (act === 'supply') return supplyMenu(host, ctx);
  if (act === 'pack') return packSupplies(host, ctx);
  if (act === 'rem_help') return npcHelp(host, ctx, 'rem');
  if (act === 'mira_help') return npcHelp(host, ctx, 'mira');
  if (act === 'rootlasher') return rootlasherGate(host, ctx);
  if (act === 'use_rope') return useRope(host, ctx);
  if (act === 'social') return socialMenu(host, ctx);
  if (act === 'sneak') return socialPick(host, ctx, 'sneak');
  if (act === 'negotiate') return socialPick(host, ctx, 'negotiate');
  if (act === 'pvp') return socialPick(host, ctx, 'pvp');
  if (act === 'clan_show') return clanPick(host, ctx, true);
  if (act === 'clan_hide') return clanPick(host, ctx, false);
  if (act === 'clan') return clanMenu(host, ctx);
  if (act === 'use_core') return useRootCore(host, ctx);
  if (act === 'prep') return prepSeal(host, ctx);
  if (act === 'seal') return prepSeal(host, ctx);
  if (act === 'open' || act === 'hub') return week3Hub(host, ctx, Number(payload.page ?? 0));
  void payload;
  return week3Hub(host, ctx, Number(payload.page ?? 0));
}

async function edgeMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'rootwood_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_rootwood_edge');
  const buttons: GameButton[] = [
    { label: 'Осмотреть знак', action: 'WEEK3_ACT', payload: { act: 'inspect' } },
    { label: 'Собрать след', action: 'WEEK3_ACT', payload: { act: 'gather_edge' } },
  ];
  if (!ctx.flags.found_root_detour && buttons.length < 4) {
    buttons.push({ label: 'Искать обход', action: 'WEEK3_ACT', payload: { act: 'detour' } });
  }
  if (ctx.flags.inspected_root_mark && !ctx.flags.day_15_complete) {
    buttons.push({ label: 'Завершить День 15', action: 'COMPLETE_DAY_15' });
  } else if (ctx.flags.day_15_complete) {
    buttons.push({ label: 'К завалу', action: 'WEEK3_ACT', payload: { act: 'tangle' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Край Корневой чащи. Почва дышит. Старый маркер держит перечёркнутый знак печатей.',
    ctx.flags.inspected_root_mark ? 'Знак прочитан. Корни ведут внутрь, не вокруг.' : 'Знак не прочитан.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function inspectMark(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'old_marker';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'inspected_root_mark');
  await setFlag(host, ctx, 'visited_rootwood_edge');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'ancient_root_marks',
    title: 'Древние корневые метки',
    seen: true,
    defeated: false,
  });
  const mira = miraTrust(ctx) >= 2 ? '\nМира: «Это не рост. Это провод.»' : '';
  return edgeMenu(host, await host.load(ctx.player), `Тот же род, что семёрка и низина. Корни перечёркивают линию, будто сеть сама себя чинит.${mira}`);
}

async function gatherEdge(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'rootwood_edge';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_rootwood_edge');
  await host.spend(ctx.player, 2);
  const first = await host.store.tryClaimReward(ctx.player.id, 'week3', 'edge_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'LOG', 4);
    await host.store.addResource(ctx.player.id, 'ROOT_FIBER', 3);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 4, resource: 'LOG' });
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 3, resource: 'ROOT_FIBER' });
    const buttons: GameButton[] = [{ label: 'Ещё осмотреть', action: 'WEEK3_ACT', payload: { act: 'edge' } }];
    if (ctx.flags.inspected_root_mark && !ctx.flags.day_15_complete) {
      buttons.push({ label: 'Завершить День 15', action: 'COMPLETE_DAY_15' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(
      ctx.player,
      `Первый след чащи. +4 ${resourceLabel('LOG')}, +3 ${resourceLabel('ROOT_FIBER')}. Корни тёплые.`,
      buttons,
    );
  }
  await host.store.addResource(ctx.player.id, 'ROOT_FIBER', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'ROOT_FIBER' });
  return edgeMenu(host, await host.load(ctx.player), `+1 ${resourceLabel('ROOT_FIBER')}. Первый склад уже взят.`);
}

async function takeDetour(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'found_root_detour');
  await host.spend(ctx.player, 1);
  return edgeMenu(
    host,
    await host.load(ctx.player),
    'Обход есть: длиннее, суше, без завала. Для сюжета не нужен — но запомнится.',
  );
}

async function tangleMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'tangled_path';
  await host.store.savePlayer(ctx.player);
  if (ctx.flags.tangle_cleared) {
    const buttons: GameButton[] = [{ label: 'В рощу', action: 'WEEK3_ACT', payload: { act: 'grove' } }];
    if (!ctx.flags.day_16_complete) {
      buttons.unshift({ label: 'Завершить День 16', action: 'COMPLETE_DAY_16' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(ctx.player, extra || 'Завал разобран. Тропа дышит, но проходит.', buttons);
  }
  const loggerLv = await jobLevel(host, ctx, 'LOGGER');
  const minerLv = await jobLevel(host, ctx, 'MINER');
  const crafterLv = await jobLevel(host, ctx, 'CRAFTER');
  const buttons: GameButton[] = [
    { label: 'Топор / брёвна', action: 'WEEK3_ACT', payload: { act: 'path_logger' } },
    { label: 'Кирка / жила', action: 'WEEK3_ACT', payload: { act: 'path_miner' } },
    { label: 'Настил', action: 'WEEK3_ACT', payload: { act: 'path_crafter' } },
  ];
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Спутанная тропа. Выбери путь. Профессия снизит цену, не запрёт.',
    `Лесоруб L${loggerLv}: ${loggerLv >= 5 ? '6' : '8'} брёвен.`,
    `Шахтёр L${minerLv}: ${minerLv >= 5 ? '4' : '6'} булыжника.`,
    `Ремесленник L${crafterLv}: 8 брёвен + ${crafterLv >= 5 ? '4' : '6'} булыжника.`,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function clearPath(host: WeekHost, ctx: WeekCtx, kind: 'logger' | 'miner' | 'crafter'): Promise<GameResponse> {
  if (ctx.flags.tangle_cleared) return tangleMenu(host, ctx, 'Уже расчищено.');
  const loggerLv = await jobLevel(host, ctx, 'LOGGER');
  const minerLv = await jobLevel(host, ctx, 'MINER');
  const crafterLv = await jobLevel(host, ctx, 'CRAFTER');
  let logs = 0;
  let cobble = 0;
  if (kind === 'logger') {
    logs = loggerLv >= 5 ? 6 : 8;
  } else if (kind === 'miner') {
    cobble = minerLv >= 5 ? 4 : 6;
  } else {
    logs = 8;
    cobble = crafterLv >= 5 ? 4 : 6;
  }
  if ((ctx.resources.LOG ?? 0) < logs) {
    throw new InsufficientResourcesError(
      `Нужно ${logs} брёвен. Руби сам, дворы или рынок. Профессия не обязательна — только дешевле.`,
    );
  }
  if ((ctx.resources.COBBLESTONE ?? 0) < cobble) {
    throw new InsufficientResourcesError(
      `Нужно ${cobble} булыжника. Штольня, дворы или рынок. Без шахтёра — просто больше камня.`,
    );
  }
  if (logs) await host.store.addResource(ctx.player.id, 'LOG', -logs);
  if (cobble) await host.store.addResource(ctx.player.id, 'COBBLESTONE', -cobble);
  await setFlag(host, ctx, 'tangle_cleared');
  if (kind === 'logger') {
    await setFlag(host, ctx, 'root_path_logger');
    await host.store.addResource(ctx.player.id, 'ROOT_FIBER', loggerLv >= 10 ? 4 : 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: loggerLv >= 10 ? 4 : 2, resource: 'ROOT_FIBER' });
  } else if (kind === 'miner') {
    await setFlag(host, ctx, 'root_path_miner');
    await host.store.addResource(ctx.player.id, 'COAL', minerLv >= 10 ? 3 : 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: minerLv >= 10 ? 3 : 2, resource: 'COAL' });
  } else {
    await setFlag(host, ctx, 'root_path_crafter');
  }
  const note =
    kind === 'logger'
      ? 'Топор берёт живые корни. Волокно остаётся в руках.'
      : kind === 'miner'
        ? 'Кирка бьёт камень под корнем. Уголь сыплется из жилы.'
        : 'Настил лёг. Идти можно, не рвя сеть.';
  return tangleMenu(host, await host.load(ctx.player), note);
}

async function groveMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!ctx.flags.tangle_cleared && !ctx.flags.day_16_complete) {
    throw new ActionRejectedError('Сначала завал.');
  }
  ctx.player.currentLocation = 'hollow_grove';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_hollow_grove');
  const buttons: GameButton[] = [
    { label: 'Ползун', action: 'START_PVE', payload: { enemyId: 'root_crawler' } },
    { label: 'Гончий', action: 'START_PVE', payload: { enemyId: 'bark_hound' } },
    { label: 'Собрать', action: 'WEEK3_ACT', payload: { act: 'forage' } },
  ];
  if (ctx.flags.day_17_complete) {
    buttons.push({ label: 'К яме', action: 'WEEK3_ACT', payload: { act: 'pit' } });
  } else {
    buttons.push({ label: 'Завершить День 17', action: 'COMPLETE_DAY_17' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    extra || 'Полая роща. Повторные бои дают шкуру и волокно. Не ферма опыта.',
    buttons,
  );
}

async function pitMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'root_pit';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_root_pit');
  const buttons: GameButton[] = [
    { label: 'Жалец', action: 'START_PVE', payload: { enemyId: 'sap_stinger' } },
    { label: 'Ползун', action: 'START_PVE', payload: { enemyId: 'root_crawler' } },
  ];
  if (ctx.flags.day_17_complete) {
    buttons.push({ label: 'К узлу', action: 'WEEK3_ACT', payload: { act: 'mechanism' } });
  }
  if (ctx.flags.day_19_complete && !ctx.flags.defeated_rootlasher) {
    buttons.push({ label: 'Корнеплёт', action: 'WEEK3_ACT', payload: { act: 'rootlasher' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, 'Корневая яма. Дно дышит. Жалец капает смолой.', buttons);
}

async function forage(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  if (!ctx.flags.visited_hollow_grove && !ctx.flags.tangle_cleared) {
    throw new ActionRejectedError('Собирать негде.');
  }
  await host.spend(ctx.player, 2);
  await host.store.addResource(ctx.player.id, 'FOOD', 1);
  await host.store.addResource(ctx.player.id, 'HERBS', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1, resource: 'FOOD' });
  const daily = await host.store.tryClaimReward(ctx.player.id, 'week3', `forage:${host.now().toISOString().slice(0, 10)}`);
  if (daily) {
    await host.store.addResource(ctx.player.id, 'ROOT_FIBER', 2);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 2, resource: 'ROOT_FIBER' });
  }
  void eventId;
  const next = await host.load(ctx.player);
  const note = daily
    ? `Собрано: +1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('HERBS')}, +2 ${resourceLabel('ROOT_FIBER')} (раз в сутки).`
    : `+1 ${resourceLabel('FOOD')}, +1 ${resourceLabel('HERBS')}. Суточный пучок волокна уже снят.`;
  if (next.flags.day_18_complete && !next.flags.day_19_complete) {
    return supplyMenu(host, next, note);
  }
  return groveMenu(host, next, note);
}

async function mechanismMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'buried_mechanism';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [];
  if (!ctx.flags.root_mechanism_examined && !ctx.flags.root_mechanism_skipped) {
    buttons.push({ label: 'Осмотреть узел', action: 'WEEK3_ACT', payload: { act: 'examine' } });
    buttons.push({ label: 'Пройти мимо', action: 'WEEK3_ACT', payload: { act: 'skip_mech' } });
  } else if (ctx.flags.root_mechanism_examined && !ctx.flags.root_part_taken && !ctx.flags.root_part_left) {
    buttons.push({ label: 'Взять деталь', action: 'WEEK3_ACT', payload: { act: 'take_part' } });
    buttons.push({ label: 'Оставить', action: 'WEEK3_ACT', payload: { act: 'leave_part' } });
  }
  if (
    (ctx.flags.root_mechanism_examined || ctx.flags.root_mechanism_skipped) &&
    !ctx.flags.day_18_complete &&
    (ctx.flags.root_part_taken || ctx.flags.root_part_left || ctx.flags.root_mechanism_skipped)
  ) {
    buttons.push({ label: 'Завершить День 18', action: 'COMPLETE_DAY_18' });
  }
  if (ctx.flags.day_18_complete) {
    buttons.push({ label: 'К припасам', action: 'WEEK3_ACT', payload: { act: 'supply' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const remLine = remWarm(ctx)
    ? 'Рем: «Сеть. Замки, связанные жилами. Кто ставил — старше нас. Не спрашивай имя.»'
    : 'Рем молчит про сеть. Только: «Не трогай, если не понимаешь.»';
  const miraLine =
    miraTrust(ctx) >= 2
      ? 'Мира: «Это физика удержания. Не дух. Нити между печатями — как арматура.»'
      : 'Мира даёт мало. «Узел держит. Не ломай без нужды.»';
  const text = [
    extra,
    'Заброшенный узел. Камень и дерево срослись. Не современная машина.',
    remLine,
    miraLine,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function examineMechanism(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'root_mechanism_examined');
  ctx.player.currentLocation = 'root_chamber';
  await host.store.savePlayer(ctx.player);
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'root_network',
    title: 'Корневая сеть',
    seen: true,
    defeated: false,
  });
  return mechanismMenu(
    host,
    await host.load(ctx.player),
    'На своде — нити между знаками. Печатей несколько, и они держат одно. Кто создал сеть — не сказано. Зачем — тоже.',
  );
}

async function skipMechanism(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  await setFlag(host, ctx, 'root_mechanism_skipped');
  return mechanismMenu(host, await host.load(ctx.player), 'Ты проходишь мимо. Узел гудит в спину. Сюжет не запирает.');
}

async function takePart(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.root_mechanism_examined) throw new ActionRejectedError('Сначала осмотри узел.');
  await setFlag(host, ctx, 'root_part_taken');
  return mechanismMenu(host, await host.load(ctx.player), 'Древняя деталь ложится в карман. Тёплая. Не оружие.');
}

async function leavePart(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.root_mechanism_examined) throw new ActionRejectedError('Сначала осмотри узел.');
  await setFlag(host, ctx, 'root_part_left');
  return mechanismMenu(host, await host.load(ctx.player), 'Деталь остаётся в гнезде. Сеть не обижается. Пока.');
}

async function supplyMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  const buildings = await host.store.listProductionBuildings(ctx.player.id);
  const farmLine = buildings.length ? 'Твои дворы уже работают на тебя.' : 'Дворов нет — соберёшь руками.';
  const have = `Еда ${foodUnits(ctx)}/8 · брёвна ${ctx.resources.LOG ?? 0}/10 · булыжник ${ctx.resources.COBBLESTONE ?? 0}/8 · уголь ${ctx.resources.COAL ?? 0}/4`;
  const buttons: GameButton[] = [];
  if (!ctx.flags.root_pack_ready) {
    buttons.push({ label: 'Собрать запас', action: 'WEEK3_ACT', payload: { act: 'pack' } });
  }
  if (!ctx.flags.rem_week3_helped) {
    buttons.push({ label: 'Попросить Рема', action: 'WEEK3_ACT', payload: { act: 'rem_help' } });
  }
  if (!ctx.flags.mira_week3_helped && miraTrust(ctx) >= 1) {
    buttons.push({ label: 'Попросить Миру', action: 'WEEK3_ACT', payload: { act: 'mira_help' } });
  }
  if (buttons.length < 4) {
    buttons.push({ label: 'Собрать в роще', action: 'WEEK3_ACT', payload: { act: 'forage' } });
  }
  if (ctx.flags.root_pack_ready && !ctx.flags.day_19_complete) {
    buttons.push({ label: 'Завершить День 19', action: 'COMPLETE_DAY_19' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Припасы вглубь. Рынок не обязателен. Вел продаёт сухарь. Грядка и рыба считаются.',
    farmLine,
    have,
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons);
}

async function packSupplies(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.root_pack_ready) return supplyMenu(host, ctx, 'Запас уже собран.');
  if (foodUnits(ctx) < 8) {
    throw new InsufficientResourcesError('Нужно 8 еды: FOOD, жареная рыба, хлеб или сухарь. Собери, дворы, Вел, рынок или попроси.');
  }
  if ((ctx.resources.LOG ?? 0) < 10) throw new InsufficientResourcesError('Нужно 10 брёвен. Руби, дворы или рынок.');
  if ((ctx.resources.COBBLESTONE ?? 0) < 8) throw new InsufficientResourcesError('Нужно 8 булыжника. Штольня, дворы или рынок.');
  if ((ctx.resources.COAL ?? 0) < 4) throw new InsufficientResourcesError('Нужно 4 угля. Расселина, дворы или рынок.');
  await host.store.addResource(ctx.player.id, 'LOG', -10);
  await host.store.addResource(ctx.player.id, 'COBBLESTONE', -8);
  await host.store.addResource(ctx.player.id, 'COAL', -4);
  let need = 8;
  const food = Math.min(ctx.resources.FOOD ?? 0, need);
  if (food) {
    await host.store.addResource(ctx.player.id, 'FOOD', -food);
    need -= food;
  }
  const fish = Math.min(ctx.resources.COOKED_FISH ?? 0, need);
  if (fish) {
    await host.store.addResource(ctx.player.id, 'COOKED_FISH', -fish);
    need -= fish;
  }
  if (need > 0) {
    const meals = ctx.items.filter((item) => item.templateId === 'bread' || item.templateId === 'dry_rusk');
    for (const meal of meals.slice(0, need)) {
      await host.store.removeItem(meal.id);
    }
  }
  await setFlag(host, ctx, 'root_pack_ready');
  return supplyMenu(host, await host.load(ctx.player), 'Запас связан. Хватит на свод.');
}

async function npcHelp(host: WeekHost, ctx: WeekCtx, who: 'rem' | 'mira'): Promise<GameResponse> {
  if (who === 'rem') {
    if (ctx.flags.rem_week3_helped) return supplyMenu(host, ctx, 'Рем уже отдал паёк.');
    if (ctx.flags.sold_rusty_token && !remWarm(ctx)) {
      await host.store.addResource(ctx.player.id, 'FOOD', 2);
      await setFlag(host, ctx, 'rem_week3_helped');
      return supplyMenu(host, await host.load(ctx.player), 'Рем бросает сухой паёк. Мало. «Сам виноват, что жетон продал.» +2 еды.');
    }
    await host.store.addResource(ctx.player.id, 'FOOD', 4);
    await setFlag(host, ctx, 'rem_week3_helped');
    return supplyMenu(host, await host.load(ctx.player), 'Рем отсыпает из котла. +4 еды. «Не геройство. Просто чтобы дошёл.»');
  }
  if (ctx.flags.mira_week3_helped) return supplyMenu(host, ctx, 'Мира уже помогла.');
  if (miraTrust(ctx) < 1) {
    throw new ActionRejectedError('Мира почти молчит. Собери сам, дворы, Вел или рынок.');
  }
  await host.store.addResource(ctx.player.id, 'FOOD', 4);
  await setFlag(host, ctx, 'mira_week3_helped');
  return supplyMenu(host, await host.load(ctx.player), 'Мира даёт сушёную рыбу и корень. +4 еды. «Это не дар. Это чтобы ты не свалился в яму.»');
}

async function rootlasherGate(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'root_pit';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Бить Корнеплёта', action: 'START_PVE', payload: { enemyId: 'rootlasher' } },
  ];
  if (hasItem(ctx, 'root_rope') && !ctx.flags.root_rope_used) {
    buttons.push({ label: 'Верёвка', action: 'WEEK3_ACT', payload: { act: 'use_rope' } });
  }
  if (hasBow(ctx) && buttons.length < 3) {
    buttons.push({ label: 'С дистанции', action: 'START_PVE', payload: { enemyId: 'rootlasher', move: 'bow' } });
  }
  if (!hasItem(ctx, 'root_brace') && buttons.length < 4) {
    buttons.push({ label: 'Настил', action: 'OPEN_MENU', payload: { menu: 'materials' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Корнеплёт в яме. Кора и живые корни. Не страж печати. Лук, щит, настил помогают. Без них — можно.',
    buttons,
  );
}

async function useRope(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasItem(ctx, 'root_rope')) throw new ActionRejectedError('Верёвки нет. 4 корневых волокна и 2 волокна.');
  if (ctx.flags.root_rope_used) return rootlasherGate(host, ctx);
  await setFlag(host, ctx, 'root_rope_used');
  await setFlag(host, ctx, 'has_root_rope');
  return rootlasherGate(host, await host.load(ctx.player));
}

async function socialMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  if (!ctx.flags.defeated_rootlasher) throw new ActionRejectedError('Сначала Корнеплёт.');
  const clan = await host.store.getPlayerClan(ctx.player.id);
  const buttons: GameButton[] = [];
  if (!socialPicked(ctx)) {
    buttons.push({ label: 'Пройти тихо', action: 'WEEK3_ACT', payload: { act: 'sneak' } });
    buttons.push({ label: 'Договориться', action: 'WEEK3_ACT', payload: { act: 'negotiate' } });
    buttons.push({ label: 'Вызвать на спор', action: 'WEEK3_ACT', payload: { act: 'pvp' } });
  }
  if (clan && !ctx.flags.root_clan_shown && !ctx.flags.root_clan_hidden && buttons.length < 4) {
    buttons.push({ label: 'Знак клана', action: 'WEEK3_ACT', payload: { act: 'clan' } });
  }
  if (socialPicked(ctx) && !ctx.flags.day_20_complete) {
    buttons.push({ label: 'Завершить День 20', action: 'COMPLETE_DAY_20' });
  }
  if (ctx.flags.root_social_pvp && buttons.length < 4) {
    buttons.push({ label: 'Стычка', action: 'START_PVP' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const clanLine = clan ? `Знак ${clan.clan.tag} здесь уже знают. Можно показать или скрыть. Не обязательно.` : 'Клана нет — нейтральный путь открыт.';
  return host.respond(
    ctx.player,
    [extra, 'Следы чужой группы. Не клановая война. Три пути, все ведут дальше.', clanLine].filter(Boolean).join('\n'),
    buttons,
  );
}

async function socialPick(host: WeekHost, ctx: WeekCtx, kind: 'sneak' | 'negotiate' | 'pvp'): Promise<GameResponse> {
  if (!ctx.flags.defeated_rootlasher) throw new ActionRejectedError('Сначала Корнеплёт.');
  if (socialPicked(ctx)) return socialMenu(host, ctx, 'Следы уже пройдены.');
  if (kind === 'sneak') {
    ctx.player.hp = Math.max(1, ctx.player.hp - 4);
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'root_social_sneak');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week3', 'social');
    if (ok) await host.changeCoins(ctx.player, 6, 'week3_social', 'sneak');
    return socialMenu(host, await host.load(ctx.player), 'Тихо. −4 HP. Они не заметили. +6 монет на дорогу.');
  }
  if (kind === 'negotiate') {
    await setFlag(host, ctx, 'root_social_negotiate');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'week3', 'social');
    if (ok) {
      if (ctx.player.coins >= 10) await host.changeCoins(ctx.player, -10, 'week3_social', 'negotiate');
      await host.store.addResource(ctx.player.id, 'FOOD', 2);
    }
    return socialMenu(
      host,
      await host.load(ctx.player),
      'Слова вместо клинка. Паёк на двоих. Стычка не нужна.',
    );
  }
  await setFlag(host, ctx, 'root_social_pvp');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'week3', 'social');
  if (ok) await host.changeCoins(ctx.player, 8, 'week3_social', 'pvp');
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
  if (!ctx.flags.root_clan_shown && !ctx.flags.root_clan_hidden) {
    buttons.push({ label: 'Показать', action: 'WEEK3_ACT', payload: { act: 'clan_show' } });
    buttons.push({ label: 'Скрыть', action: 'WEEK3_ACT', payload: { act: 'clan_hide' } });
  }
  buttons.push({ label: 'Следы', action: 'WEEK3_ACT', payload: { act: 'social' } });
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    `Знак ${clan.clan.tag} здесь уже знают. Показать или скрыть — не сила удара.`,
    buttons,
  );
}

async function clanPick(host: WeekHost, ctx: WeekCtx, show: boolean): Promise<GameResponse> {
  const clan = await host.store.getPlayerClan(ctx.player.id);
  if (!clan) throw new ActionRejectedError('Клана нет. Нейтральный путь и так открыт.');
  if (show) await setFlag(host, ctx, 'root_clan_shown');
  else await setFlag(host, ctx, 'root_clan_hidden');
  return socialMenu(
    host,
    await host.load(ctx.player),
    show ? `Знак ${clan.clan.tag} виден. Это не сила удара. Только взгляд.` : 'Знак скрыт. Чаща не спрашивает стаю.',
  );
}

async function useRootCore(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.used_root_core) return prepSeal(host, ctx);
  if ((ctx.resources.ROOT_CORE ?? 0) < 1 && !ctx.flags.has_root_core) {
    throw new ActionRejectedError('Сердцевины нет. Корнеплёт ещё или уже потрачена.');
  }
  if ((ctx.resources.ROOT_CORE ?? 0) >= 1) {
    await host.store.addResource(ctx.player.id, 'ROOT_CORE', -1);
  }
  await setFlag(host, ctx, 'used_root_core');
  await host.store.setFlag(ctx.player.id, 'root_core_kept', '');
  delete ctx.flags.root_core_kept;
  return prepSeal(host, await host.load(ctx.player));
}

async function prepSeal(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'deep_root_vault';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'vyazen_seen');
  const jobs = {
    LOGGER: await jobLevel(host, ctx, 'LOGGER'),
    MINER: await jobLevel(host, ctx, 'MINER'),
    HUNTER: await jobLevel(host, ctx, 'HUNTER'),
    CRAFTER: await jobLevel(host, ctx, 'CRAFTER'),
  };
  const lines = [
    'Глубокий свод. Почва втягивается в щель.',
    hasBow(ctx) ? 'Лук: внешний узел с дистанции.' : 'Без лука — вплотную.',
    hasShield(ctx) ? 'Щит: тяжёлый удар слабее.' : 'Без щита — принимай удар.',
    ctx.flags.lantern_repaired ? 'Фонарь показывает жилу.' : 'Без фонаря силуэт плывёт. Проход есть.',
    ctx.flags.used_root_core
      ? 'Сердцевина уже в щели.'
      : ctx.flags.has_root_core
        ? 'Сердцевину можно бросить сейчас.'
        : 'Без сердцевины — просто дольше.',
    miraTrust(ctx) >= 2 ? 'Мира: бей узел.' : 'Мира почти молчит.',
    jobs.LOGGER >= 10 ? 'Лесоруб видит слабый корень.' : '',
    jobs.MINER >= 10 ? 'Шахтёр видит опору.' : '',
    ctx.flags.root_pack_ready ? 'Запас собран. Не сила — выносливость.' : '',
  ].filter(Boolean);
  const buttons: GameButton[] = [
    { label: 'Бить узел', action: 'START_PVE', payload: { enemyId: 'vyazen', move: 'core' } },
  ];
  if ((ctx.flags.has_root_core || (ctx.resources.ROOT_CORE ?? 0) > 0) && !ctx.flags.used_root_core) {
    buttons.push({ label: 'Бросить сердцевину', action: 'WEEK3_ACT', payload: { act: 'use_core' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({
      label: 'Узел с дистанции',
      action: 'START_PVE',
      payload: { enemyId: 'vyazen', move: 'bow' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons);
}

async function week3Hub(host: WeekHost, ctx: WeekCtx, page = 0): Promise<GameResponse> {
  if (ctx.flags.week_3_complete) return host.renderNode(ctx.player, 'week3_complete');
  const items: GameButton[] = [];
  if (!ctx.flags.day_15_complete) {
    items.push({ label: 'Край чащи', action: 'WEEK3_ACT', payload: { act: 'edge' } });
  } else if (!ctx.flags.day_16_complete) {
    items.push({ label: 'Завал', action: 'WEEK3_ACT', payload: { act: 'tangle' } });
  } else if (!ctx.flags.day_17_complete) {
    items.push({ label: 'Роща', action: 'WEEK3_ACT', payload: { act: 'grove' } });
  } else if (!ctx.flags.day_18_complete) {
    items.push({ label: 'Узел', action: 'WEEK3_ACT', payload: { act: 'mechanism' } });
  } else if (!ctx.flags.day_19_complete) {
    items.push({ label: 'Припасы', action: 'WEEK3_ACT', payload: { act: 'supply' } });
  } else if (!ctx.flags.day_20_complete) {
    if (ctx.flags.defeated_rootlasher) {
      items.push({ label: 'Следы', action: 'WEEK3_ACT', payload: { act: 'social' } });
    } else {
      items.push({ label: 'Корнеплёт', action: 'WEEK3_ACT', payload: { act: 'rootlasher' } });
    }
  } else {
    items.push({ label: 'Свод', action: 'WEEK3_ACT', payload: { act: 'prep' } });
  }
  if (ctx.flags.day_16_complete && items.every((row) => row.payload?.act !== 'grove')) {
    items.push({ label: 'Роща', action: 'WEEK3_ACT', payload: { act: 'grove' } });
  }
  if (ctx.flags.day_15_complete && items.every((row) => row.payload?.act !== 'edge')) {
    items.push({ label: 'Край чащи', action: 'WEEK3_ACT', payload: { act: 'edge' } });
  }
  return host.respond(
    ctx.player,
    'Корневая чаща. Три печати ещё не молчат. Две уже. Одна близко.',
    pagedButtons(
      items,
      page,
      (next) => ({ label: '➡ Ещё', action: 'WEEK3_ACT', payload: { act: 'hub', page: next } }),
      { label: BACK_LABEL, action: 'OPEN_CAMP' },
    ),
  );
}

export async function applyWeek3Victory(host: WeekHost, ctx: WeekCtx, enemyId: string): Promise<string[]> {
  const notes: string[] = [];
  if (enemyId === 'rootlasher') {
    await setFlag(host, ctx, 'defeated_rootlasher');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'rootlasher');
    if (first) {
      await host.store.addResource(ctx.player.id, 'ROOT_CORE', 1);
      await setFlag(host, ctx, 'has_root_core');
      await setFlag(host, ctx, 'root_core_kept');
      notes.push(`+1 ${resourceLabel('ROOT_CORE')}.`);
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'rootlasher_hunt',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'rootlasher_hunt' });
    } else {
      notes.push('Корнеплёт уже отдал сердцевину.');
    }
  }
  if (enemyId === 'vyazen') {
    await setFlag(host, ctx, 'vyazen_defeated');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'vyazen');
    if (first) {
      await host.store.addResource(ctx.player.id, 'SEAL_SHARD_5', 1);
      notes.push(`+1 ${resourceLabel('SEAL_SHARD_5')}.`);
      await host.changeCoins(ctx.player, 60, 'vyazen', 'first');
      notes.push('+60 монет.');
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'third_seal',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'third_seal' });
    } else {
      notes.push('Сюжетный лут уже получен.');
    }
  }
  return notes;
}

export async function loadWeek3JobLevels(
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
