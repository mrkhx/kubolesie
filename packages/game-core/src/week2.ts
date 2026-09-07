import {
  BACK_LABEL,
  type GameButton,
  type GameCommand,
  type GameResponse,
} from '@kubolesie/shared';
import {
  CROP_TICKS_NEEDED,
  WEEK2_DAY_XP,
  resourceLabel,
} from '@kubolesie/content';
import type { CombatantSnapshot } from '@kubolesie/combat-engine';
import { ActionRejectedError, InsufficientResourcesError } from './errors';
import { grantMetaAchievement, noteActivity } from './meta';
import type { WeekCtx, WeekHost } from './week';

export const WEEK2_MENUS = ['farm', 'quarry', 'mist', 'lowland', 'seal2'] as const;
export type Week2MenuId = (typeof WEEK2_MENUS)[number];

export function isWeek2Menu(menu: string): menu is Week2MenuId {
  return (WEEK2_MENUS as readonly string[]).includes(menu);
}

export const WEEK2_COMMANDS = [
  'BEGIN_DAY_8',
  'BEGIN_DAY_9',
  'BEGIN_DAY_10',
  'BEGIN_DAY_11',
  'BEGIN_DAY_12',
  'BEGIN_DAY_13',
  'BEGIN_DAY_14',
  'COMPLETE_DAY_8',
  'COMPLETE_DAY_9',
  'COMPLETE_DAY_10',
  'COMPLETE_DAY_11',
  'COMPLETE_DAY_12',
  'COMPLETE_DAY_13',
  'COMPLETE_DAY_14',
  'FARM_ACT',
  'WEEK2_ACT',
] as const;

export const WEEK2_ENEMIES = [
  'threadling',
  'reed_stalker',
  'bog_gnawer',
  'pitch_carapace',
  'smolnik',
  'mist_warden',
] as const;

export function isWeek2Enemy(id: string): boolean {
  return (WEEK2_ENEMIES as readonly string[]).includes(id);
}

export function isWeek2Location(id: string): boolean {
  return id === 'mist_border' || id === 'mist_lowland' || id === 'drowned_quarry' || id === 'second_seal';
}

function flagNum(flags: Record<string, string>, key: string): number {
  const raw = flags[key];
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function hasItem(ctx: WeekCtx, templateId: string): boolean {
  return ctx.items.some((item) => item.templateId === templateId);
}

function hasHoe(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'stone_hoe') || hasItem(ctx, 'iron_hoe') || Boolean(ctx.flags.has_hoe);
}

function hasBow(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'bow') || Boolean(ctx.flags.has_bow);
}

function hasShield(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'shield') || Boolean(ctx.flags.has_shield);
}

function hasBucket(ctx: WeekCtx): boolean {
  return hasItem(ctx, 'bucket') || Boolean(ctx.flags.has_bucket);
}

function miraTrust(ctx: WeekCtx): number {
  return flagNum(ctx.flags, 'mira_trust');
}

async function setFlag(host: WeekHost, ctx: WeekCtx, flag: string, value = '1') {
  await host.store.setFlag(ctx.player.id, flag, value);
  ctx.flags[flag] = value;
}

async function bumpTrust(host: WeekHost, ctx: WeekCtx, delta: number) {
  const next = miraTrust(ctx) + delta;
  await setFlag(host, ctx, 'mira_trust', String(next));
  await host.store.adjustNpcRelation(ctx.player.id, 'mira', delta, 0);
}

export async function tickCrop(host: WeekHost, ctx: WeekCtx, amount = 1): Promise<boolean> {
  if (!ctx.flags.crop_planted || ctx.flags.crop_ready) return Boolean(ctx.flags.crop_ready);
  const next = flagNum(ctx.flags, 'crop_ticks') + amount;
  await setFlag(host, ctx, 'crop_ticks', String(next));
  if (next >= CROP_TICKS_NEEDED) {
    await setFlag(host, ctx, 'crop_ready');
    return true;
  }
  return false;
}

export function week2AfterCraftFlags(recipeId: string): string[] {
  if (recipeId === 'stone_hoe' || recipeId === 'iron_hoe') return ['has_hoe'];
  if (recipeId === 'bow') return ['has_bow', 'first_bow'];
  if (recipeId === 'shield') return ['has_shield'];
  if (recipeId === 'bucket') return ['has_bucket'];
  return [];
}

export function week2Modifiers(
  ctx: WeekCtx,
  enemyId: string,
  payload: Record<string, unknown> = {},
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
  const boss = enemyId === 'smolnik' || enemyId === 'mist_warden';

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
  if (ctx.flags.lantern_repaired && (enemyId === 'mist_warden' || enemyId === 'reed_stalker' || enemyId === 'smolnik')) {
    enemy.dodge = 0;
    player.critChance = 8;
    bits.push('фонарь: силуэт виден');
  }
  if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
    player.dodge = 14;
    bits.push('питомец рядом');
  }
  if (enemyId === 'mist_warden') {
    const move = String(payload.move ?? 'core');
    if (hasBucket(ctx) && (move === 'drain' || ctx.flags.used_bucket_on_warden)) {
      enemy.defense = -2;
      bits.push('ведро: площадка сухая');
    }
    if (ctx.flags.used_bog_core) {
      enemy.hp = -28;
      bits.push('сердцевина гасит туман');
    }
    if (miraTrust(ctx) >= 2) {
      enemy.defense = (enemy.defense ?? 0) - 2;
      bits.push('Мира: бей ядро, не скобы');
    } else {
      bits.push('Мира молчит лишнее');
    }
  }
  if (enemyId === 'smolnik' && hasBow(ctx)) {
    enemy.defense = -2;
    bits.push('смола с дистанции');
  }
  return { player, enemy, note: bits.join(', '), playerOpeningHits };
}

export async function dispatchWeek2(
  host: WeekHost,
  ctx: WeekCtx,
  command: GameCommand,
  eventId: string,
): Promise<GameResponse> {
  switch (command.type) {
    case 'BEGIN_DAY_8':
      return beginDay(host, ctx, 8);
    case 'BEGIN_DAY_9':
      return beginDay(host, ctx, 9);
    case 'BEGIN_DAY_10':
      return beginDay(host, ctx, 10);
    case 'BEGIN_DAY_11':
      return beginDay(host, ctx, 11);
    case 'BEGIN_DAY_12':
      return beginDay(host, ctx, 12);
    case 'BEGIN_DAY_13':
      return beginDay(host, ctx, 13);
    case 'BEGIN_DAY_14':
      return beginDay(host, ctx, 14);
    case 'COMPLETE_DAY_8':
      return completeDay(host, ctx, 8);
    case 'COMPLETE_DAY_9':
      return completeDay(host, ctx, 9);
    case 'COMPLETE_DAY_10':
      return completeDay(host, ctx, 10);
    case 'COMPLETE_DAY_11':
      return completeDay(host, ctx, 11);
    case 'COMPLETE_DAY_12':
      return completeDay(host, ctx, 12);
    case 'COMPLETE_DAY_13':
      return completeDay(host, ctx, 13);
    case 'COMPLETE_DAY_14':
      return completeDay(host, ctx, 14);
    case 'FARM_ACT':
      return farmAct(host, ctx, String(command.payload?.act ?? 'open'));
    case 'WEEK2_ACT':
      return week2Act(host, ctx, String(command.payload?.act ?? 'open'), command.payload ?? {}, eventId);
    default:
      throw new ActionRejectedError('Сейчас это сделать нельзя.');
  }
}

export async function openWeek2Menu(host: WeekHost, ctx: WeekCtx, menu: Week2MenuId): Promise<GameResponse> {
  if (menu === 'farm') return farmAct(host, ctx, 'open');
  if (menu === 'quarry') return quarryMenu(host, ctx);
  if (menu === 'lowland') return lowlandMenu(host, ctx);
  if (menu === 'seal2') return sealMenu(host, ctx);
  return borderMenu(host, ctx);
}

async function beginDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (day === 8 && !ctx.flags.week_1_complete) {
    throw new ActionRejectedError('Сначала закрой первую неделю.');
  }
  if (day > 8 && !ctx.flags[`day_${day - 1}_complete`]) {
    throw new ActionRejectedError('Сначала закрой предыдущий день.');
  }
  if (ctx.flags.week_2_complete) return host.renderNode(ctx.player, 'week2_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);

  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 2);

  const questByDay: Record<number, { id: string; title: string }> = {
    8: { id: 'mist_trail', title: 'След низины' },
    9: { id: 'first_plot', title: 'Первая грядка' },
    10: { id: 'string_in_mist', title: 'Нити в тумане' },
    11: { id: 'water_road', title: 'Дорога по воде' },
    12: { id: 'drowned_quarry', title: 'Утонувший карьер' },
    13: { id: 'smolnik_hunt', title: 'Охота на Смольника' },
    14: { id: 'second_seal', title: 'Вторая печать' },
  };
  const quest = questByDay[day]!;
  await host.store.upsertPlayerQuest({
    playerId: ctx.player.id,
    questId: quest.id,
    status: 'ACTIVE',
    progress: {},
  });

  if (day === 8) {
    ctx.player.currentLocation = 'rem_camp';
    ctx.player.currentState = 'day8_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'farming_unlocked');
    const node = await host.renderNode(ctx.player, 'day8_start');
    const extras: string[] = [];
    if (!ctx.flags.sold_rusty_token && (ctx.flags.showed_token_to_rem || flagNum(ctx.flags, 'rem_trust') >= 1)) {
      extras.push('Рем мягче обычного: «Жетон ты мне тогда показал. Низина — не Узел. Но тот же холод.»');
    }
    if (ctx.flags.sold_rusty_token) {
      extras.push('Рем коротко: «Жетон ты продал. Низина всё равно найдёт тебя.»');
    }
    if (ctx.flags.lantern_repaired) {
      extras.push('Зажжённый фонарь ловит кромку тумана раньше глаз.');
    }
    if (ctx.flags.scavenger_bonded || ctx.flags.emberkit_bonded) {
      extras.push('Питомец жмётся к ноге и не хочет вниз.');
    }
    if (ctx.flags.chose_iron_sword) extras.push('Рем кивает на меч: «Режь камыш, не туман.»');
    if (ctx.flags.chose_iron_axe) extras.push('Рем: «Топор для корней. Низина ими полна.»');
    if (ctx.flags.chose_iron_pickaxe) extras.push('Рем: «Кирка пригодится в карьере. Не сейчас.»');
    if (extras.length) node.text = `${node.text}\n${extras.join('\n')}`;
    return node;
  }
  if (day === 9) {
    ctx.player.currentLocation = ctx.flags.player_camp_founded ? 'player_camp' : 'rem_camp';
    ctx.player.currentState = 'day9_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day9_start');
  }
  if (day === 10) {
    ctx.player.currentLocation = 'mist_lowland';
    ctx.player.currentState = 'day10_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'visited_mist_lowland');
    return host.renderNode(ctx.player, 'day10_start');
  }
  if (day === 11) {
    ctx.player.currentLocation = 'mist_lowland';
    ctx.player.currentState = 'day11_start';
    await host.store.savePlayer(ctx.player);
    return host.renderNode(ctx.player, 'day11_start');
  }
  if (day === 12) {
    ctx.player.currentLocation = 'drowned_quarry';
    ctx.player.currentState = 'day12_start';
    await host.store.savePlayer(ctx.player);
    await setFlag(host, ctx, 'visited_drowned_quarry');
    return host.renderNode(ctx.player, 'day12_start');
  }
  if (day === 13) {
    ctx.player.currentLocation = 'drowned_quarry';
    ctx.player.currentState = 'day13_start';
    await host.store.savePlayer(ctx.player);
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'smolnik',
      title: 'Смольник',
      seen: true,
      defeated: false,
    });
    return host.renderNode(ctx.player, 'day13_start');
  }
  ctx.player.currentLocation = 'second_seal';
  ctx.player.currentState = 'day14_start';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_second_seal');
  await setFlag(host, ctx, 'mist_warden_seen');
  await host.store.upsertDiscovery({
    playerId: ctx.player.id,
    discoveryId: 'mist_warden',
    title: 'Туманный сторож',
    seen: true,
    defeated: false,
  });
  const node = await host.renderNode(ctx.player, 'day14_start');
  if (miraTrust(ctx) >= 2) {
    node.text = `${node.text}\nМира близко: «Ядро втягивает. Скобы — ложь. Если есть сердцевина — брось в щель до удара.»`;
  } else {
    node.text = `${node.text}\nМира держится сзади. Говорит только: «Не стой в воде.»`;
  }
  return node;
}

async function completeDay(host: WeekHost, ctx: WeekCtx, day: number): Promise<GameResponse> {
  if (ctx.flags.week_2_complete && day === 14) return host.renderNode(ctx.player, 'week2_complete');
  if (ctx.flags[`day_${day}_complete`]) return host.renderNode(ctx.player, `day${day}_complete`);
  const need: Record<number, [string, string]> = {
    8: ['visited_mist_border', 'Сначала кромка тумана.'],
    9: ['crop_planted', 'Сначала посади семена.'],
    10: ['first_string', 'Сначала добудь нить.'],
    11: ['met_mira', 'Сначала встреть Миру.'],
    12: ['quarry_chamber', 'Сначала нижняя камера карьера.'],
    13: ['defeated_smolnik', 'Сначала Смольник.'],
    14: ['mist_warden_defeated', 'Сначала Туманный сторож.'],
  };
  if (day === 9) {
    if (!ctx.flags.crop_planted && !ctx.flags.first_harvest) {
      throw new ActionRejectedError('Сначала посади семена.');
    }
  } else {
    const gate = need[day]!;
    if (!ctx.flags[gate[0]]) throw new ActionRejectedError(gate[1]);
  }

  const questId =
    day === 8
      ? 'mist_trail'
      : day === 9
        ? 'first_plot'
        : day === 10
          ? 'string_in_mist'
          : day === 11
            ? 'water_road'
            : day === 12
              ? 'drowned_quarry'
              : day === 13
                ? 'smolnik_hunt'
                : 'second_seal';
  const ok = await host.store.tryClaimReward(ctx.player.id, 'quest', `day_${day}`);
  if (ok) {
    await host.store.upsertPlayerQuest({
      playerId: ctx.player.id,
      questId,
      status: 'CLAIMED',
      progress: {},
    });
    await host.addXp(ctx.player, WEEK2_DAY_XP[day as keyof typeof WEEK2_DAY_XP]);
  }
  await setFlag(host, ctx, `day_${day}_complete`);
  await noteActivity(host.store, ctx.player, { type: 'quest', id: questId });
  await noteActivity(host.store, ctx.player, { type: 'day', day });

  if (day === 8) await setFlag(host, ctx, 'seen_mist_light');
  if (day === 9) await setFlag(host, ctx, 'white_thread_found');
  if (day === 14) {
    await setFlag(host, ctx, 'seen_five_seals');
    await setFlag(host, ctx, 'week_2_complete');
    await host.store.upsertDiscovery({
      playerId: ctx.player.id,
      discoveryId: 'five_seals',
      title: 'Пять печатей',
      seen: true,
      defeated: false,
    });
    await noteActivity(host.store, ctx.player, { type: 'week', week: 2 });
    return host.renderNode(ctx.player, 'five_seals');
  }
  return host.renderNode(ctx.player, `day${day}_complete`);
}

async function farmAct(host: WeekHost, ctx: WeekCtx, act: string): Promise<GameResponse> {
  if (!ctx.flags.farming_unlocked && !ctx.flags.week_1_complete) {
    throw new ActionRejectedError('Грядки ещё нет.');
  }
  if (act === 'prepare') {
    if (!hasHoe(ctx)) throw new ActionRejectedError('Нужна мотыга. Камень или железо.');
    if (ctx.flags.plot_prepared) return farmScreen(host, ctx, 'Грядка уже готова.');
    await host.spend(ctx.player, 2);
    await setFlag(host, ctx, 'plot_prepared');
    return farmScreen(host, await host.load(ctx.player), 'Клетка вскопана. Квадрат земли слушается.');
  }
  if (act === 'plant') {
    if (!ctx.flags.plot_prepared) throw new ActionRejectedError('Сначала вскопай грядку.');
    if (ctx.flags.crop_planted && !ctx.flags.crop_ready) {
      throw new ActionRejectedError('Уже посажено. Жди.');
    }
    if ((ctx.resources.SEED ?? 0) < 1) throw new InsufficientResourcesError('Нет семян.');
    await host.store.addResource(ctx.player.id, 'SEED', -1);
    await setFlag(host, ctx, 'crop_planted');
    await setFlag(host, ctx, 'crop_ticks', '0');
    await host.store.setFlag(ctx.player.id, 'crop_ready', '');
    delete ctx.flags.crop_ready;
    return farmScreen(host, await host.load(ctx.player), 'Семена в клетке. Не сейчас. Нужен день или дело.');
  }
  if (act === 'water') {
    if (!ctx.flags.crop_planted) throw new ActionRejectedError('Нечего поливать.');
    if (ctx.flags.crop_ready) return farmScreen(host, ctx, 'Уже можно снимать.');
    const amount = hasBucket(ctx) ? 2 : 1;
    const ready = await tickCrop(host, ctx, amount);
    return farmScreen(
      host,
      await host.load(ctx.player),
      ready ? 'Колосья. Можно снимать.' : hasBucket(ctx) ? 'Ведро: полито щедро.' : 'Полито. Ещё рано.',
    );
  }
  if (act === 'harvest') {
    if (!ctx.flags.crop_ready) throw new ActionRejectedError('Ещё не выросло.');
    const cycle = flagNum(ctx.flags, 'crop_cycle');
    const ok = await host.store.tryClaimReward(ctx.player.id, 'farm', `harvest:${cycle}`);
    if (!ok) throw new ActionRejectedError('Этот урожай уже снят.');
    const amount = ctx.flags.plot_expanded ? 2 : 1;
    const firstHarvest = !ctx.flags.first_harvest;
    await host.store.addResource(ctx.player.id, 'WHEAT', amount);
    await setFlag(host, ctx, 'crop_cycle', String(cycle + 1));
    await host.store.setFlag(ctx.player.id, 'crop_planted', '');
    await host.store.setFlag(ctx.player.id, 'crop_ready', '');
    await host.store.setFlag(ctx.player.id, 'crop_ticks', '0');
    delete ctx.flags.crop_planted;
    delete ctx.flags.crop_ready;
    ctx.flags.crop_ticks = '0';
    if (firstHarvest) {
      await setFlag(host, ctx, 'first_harvest');
      await host.addXp(ctx.player, 12);
    }
    const note = firstHarvest
      ? `Первый урожай. Пшеница ×${amount}. Можно печь хлеб.`
      : `Снято пшеницы: ${amount}. Хлеб: три пшеницы.`;
    return farmScreen(host, await host.load(ctx.player), note);
  }
  if (act === 'expand') {
    if (!ctx.flags.plot_prepared) throw new ActionRejectedError('Сначала грядка.');
    if (ctx.flags.plot_expanded) return farmScreen(host, ctx, 'Расширять больше некуда.');
    if ((ctx.resources.COBBLESTONE ?? 0) < 4) throw new InsufficientResourcesError('Нужно 4 булыжника на бордюр.');
    await host.store.addResource(ctx.player.id, 'COBBLESTONE', -4);
    await setFlag(host, ctx, 'plot_expanded');
    return farmScreen(host, await host.load(ctx.player), 'Грядка шире. Урожай будет двойной. Для сюжета не нужно.');
  }
  if (act === 'eat_fish') {
    if ((ctx.resources.COOKED_FISH ?? 0) < 1) throw new InsufficientResourcesError('Нет жареной рыбы.');
    await host.store.addResource(ctx.player.id, 'COOKED_FISH', -1);
    ctx.player.energy = Math.min(ctx.player.maxEnergy, ctx.player.energy + 6);
    await host.store.savePlayer(ctx.player);
    return farmScreen(host, await host.load(ctx.player), 'Жареная рыба. +6 энергии.');
  }
  return farmScreen(host, ctx);
}

function farmScreen(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  const ticks = flagNum(ctx.flags, 'crop_ticks');
  const state = !ctx.flags.plot_prepared
    ? 'Пустая клетка.'
    : ctx.flags.crop_ready
      ? 'Урожай готов.'
      : ctx.flags.crop_planted
        ? `Растёт (${ticks}/${CROP_TICKS_NEEDED}).`
        : 'Вскопано, пусто.';
  const text = [
    extra,
    `Грядка. ${state}${ctx.flags.plot_expanded ? ' Расширена.' : ''}`,
    `Семена: ${ctx.resources.SEED ?? 0}. Пшеница: ${ctx.resources.WHEAT ?? 0}.`,
  ]
    .filter(Boolean)
    .join('\n');
  const buttons: GameButton[] = [];
  if (!ctx.flags.plot_prepared) {
    buttons.push({ label: 'Вскопать', action: 'FARM_ACT', payload: { act: 'prepare' } });
  } else if (!ctx.flags.crop_planted || (ctx.flags.plot_prepared && !ctx.flags.crop_planted && !ctx.flags.crop_ready)) {
    buttons.push({ label: 'Посадить', action: 'FARM_ACT', payload: { act: 'plant' } });
  }
  if (ctx.flags.crop_planted && !ctx.flags.crop_ready) {
    buttons.push({ label: 'Полить', action: 'FARM_ACT', payload: { act: 'water' } });
  }
  if (ctx.flags.crop_ready) {
    buttons.push({ label: 'Собрать урожай', action: 'FARM_ACT', payload: { act: 'harvest' } });
  }
  if (ctx.flags.plot_prepared && !ctx.flags.plot_expanded && buttons.length < 3) {
    buttons.push({ label: 'Расширить', action: 'FARM_ACT', payload: { act: 'expand' } });
  }
  if (!ctx.flags.day_9_complete && ctx.flags.crop_planted && buttons.length < 4) {
    buttons.push({ label: 'Завершить День 9', action: 'COMPLETE_DAY_9' });
  }
  if (buttons.length < 4) {
    buttons.push({ label: '🔨 Крафт', action: 'OPEN_MENU', payload: { menu: 'craft' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function week2Act(
  host: WeekHost,
  ctx: WeekCtx,
  act: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  if (act === 'border') return borderMenu(host, ctx);
  if (act === 'gather_border') return gatherBorder(host, ctx);
  if (act === 'lowland') return lowlandMenu(host, ctx);
  if (act === 'quarry') return quarryMenu(host, ctx);
  if (act === 'quarry_shore') return quarryStage(host, ctx, 'shore');
  if (act === 'quarry_flood') return quarryStage(host, ctx, 'flood');
  if (act === 'quarry_workings') return quarryStage(host, ctx, 'workings');
  if (act === 'quarry_chamber') return quarryStage(host, ctx, 'chamber');
  if (act === 'drain') return drainPassage(host, ctx);
  if (act === 'wade') return wadePassage(host, ctx);
  if (act === 'gather_clay') return gatherClay(host, ctx);
  if (act === 'mira_help') return miraChoice(host, ctx, 'help');
  if (act === 'mira_cautious') return miraChoice(host, ctx, 'cautious');
  if (act === 'mira_hide') return miraChoice(host, ctx, 'hide');
  if (act === 'mira_danger') return miraPath(host, ctx, 'danger');
  if (act === 'mira_safe') return miraPath(host, ctx, 'safe');
  if (act === 'flood_path') return floodShortcut(host, ctx, eventId);
  if (act === 'use_core') return useBogCore(host, ctx);
  if (act === 'smolnik') return smolnikGate(host, ctx);
  if (act === 'seal') return sealMenu(host, ctx);
  if (act === 'prep') return prepSeal(host, ctx);
  if (act === 'eat_fish') return farmAct(host, ctx, 'eat_fish');
  if (act === 'open') return week2Hub(host, ctx);
  if (act === 'meet_mira') return meetMira(host, ctx);
  void payload;
  return week2Hub(host, ctx);
}

async function gatherBorder(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'mist_border';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_mist_border');
  await host.spend(ctx.player, 2);
  const first = await host.store.tryClaimReward(ctx.player.id, 'week2', 'border_cache');
  if (first) {
    await host.store.addResource(ctx.player.id, 'SEED', 2);
    await host.store.addResource(ctx.player.id, 'REED', 3);
    await noteActivity(host.store, ctx.player, { type: 'gather', amount: 5 });
    const buttons: GameButton[] = [
      { label: 'Ещё осмотреть', action: 'WEEK2_ACT', payload: { act: 'border' } },
    ];
    if (!ctx.flags.day_8_complete) {
      buttons.push({ label: 'Завершить День 8', action: 'COMPLETE_DAY_8' });
    }
    buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
    return host.respond(
      ctx.player,
      'На кромке — семена в иле и камыш кубами. +2 семени, +3 камыша.\nВ тумане далёкий огонёк идёт против ветра.',
      buttons.slice(0, 5),
    );
  }
  await host.store.addResource(ctx.player.id, 'REED', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1 });
  return borderMenu(host, await host.load(ctx.player), '+1 камыш. Первый след уже взят.');
}

async function borderMenu(host: WeekHost, ctx: WeekCtx, extra = ''): Promise<GameResponse> {
  ctx.player.currentLocation = 'mist_border';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_mist_border');
  const buttons: GameButton[] = [
    { label: 'Собрать след', action: 'WEEK2_ACT', payload: { act: 'gather_border' } },
    { label: 'Нитник', action: 'START_PVE', payload: { enemyId: 'threadling' } },
  ];
  if (ctx.flags.day_8_complete) {
    buttons.push({ label: 'В низину', action: 'WEEK2_ACT', payload: { act: 'lowland' } });
  } else {
    buttons.push({ label: 'Завершить День 8', action: 'COMPLETE_DAY_8' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const text = [
    extra,
    'Кромка тумана. Холод стоит стеной. Ручьи вышли.',
    ctx.flags.seen_mist_light || ctx.flags.day_8_complete ? 'Огонёк против ветра ещё мерцает.' : 'Где-то внутри движется свет.',
  ]
    .filter(Boolean)
    .join('\n');
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}

async function lowlandMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'mist_lowland';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_mist_lowland');
  if (ctx.flags.day_10_complete && !ctx.flags.met_mira && ctx.flags.day_10_complete) {
    /* meet on day 11 via explicit act */
  }
  const buttons: GameButton[] = [
    { label: 'Нитник', action: 'START_PVE', payload: { enemyId: 'threadling' } },
    { label: 'Лазутчик', action: 'START_PVE', payload: { enemyId: 'reed_stalker' } },
  ];
  if (!ctx.flags.met_mira && ctx.flags.day_10_complete) {
    buttons.push({ label: 'К силуэту', action: 'WEEK2_ACT', payload: { act: 'meet_mira' } });
  } else if (ctx.flags.met_mira) {
    buttons.push({ label: 'К Мире', action: 'TALK_NPC', payload: { npcId: 'mira' } });
  }
  if (ctx.flags.day_11_complete) {
    buttons.push({ label: 'К карьеру', action: 'WEEK2_ACT', payload: { act: 'quarry' } });
  } else if (ctx.flags.first_string && !ctx.flags.day_10_complete) {
    buttons.push({ label: 'Завершить День 10', action: 'COMPLETE_DAY_10' });
  } else if (ctx.flags.met_mira && !ctx.flags.day_11_complete) {
    buttons.push({ label: 'Завершить День 11', action: 'COMPLETE_DAY_11' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  const bow = ctx.flags.first_string ? 'Нить есть. Лук: 3 палки + 3 нити.' : 'Ищи нить на нитнике.';
  return host.respond(
    ctx.player,
    `Туманная низина. Вода по щиколотку. ${bow}`,
    buttons.slice(0, 5),
  );
}

async function meetMira(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'mist_lowland';
  await host.store.savePlayer(ctx.player);
  return host.renderNode(ctx.player, 'day11_mira');
}

async function miraChoice(host: WeekHost, ctx: WeekCtx, kind: 'help' | 'cautious' | 'hide'): Promise<GameResponse> {
  if (!ctx.flags.met_mira) await setFlag(host, ctx, 'met_mira');
  if (kind === 'help') {
    await setFlag(host, ctx, 'mira_helped');
    await bumpTrust(host, ctx, 2);
    return host.respond(
      ctx.player,
      'Мира кивает. — Хорошо. Печати — не сказки. Это замки. Я ищу, что они держат. Пойдём вместе, но я не твоя тень.',
      [
        { label: 'Завершить День 11', action: 'COMPLETE_DAY_11' },
        { label: 'Низина', action: 'WEEK2_ACT', payload: { act: 'lowland' } },
      ],
    );
  }
  if (kind === 'hide') {
    await setFlag(host, ctx, 'mira_hid_seal');
    await bumpTrust(host, ctx, -1);
    return host.respond(
      ctx.player,
      'Мира смотрит сквозь. — Врёшь плохо. Низина и так знает, где ты был. Ладно. Минимум слов.',
      [
        { label: 'Завершить День 11', action: 'COMPLETE_DAY_11' },
        { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'lowland' } },
      ],
    );
  }
  await setFlag(host, ctx, 'mira_cautious');
  return host.respond(
    ctx.player,
    'Мира не обижается. — Правильно. Я тоже не верю с ходу. Держи дистанцию. Факты — потом.',
    [
      { label: 'Завершить День 11', action: 'COMPLETE_DAY_11' },
      { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'lowland' } },
    ],
  );
}

async function miraPath(host: WeekHost, ctx: WeekCtx, kind: 'danger' | 'safe'): Promise<GameResponse> {
  if (kind === 'danger') {
    await setFlag(host, ctx, 'mira_danger_path');
    await bumpTrust(host, ctx, 2);
    return quarryMenu(host, ctx);
  }
  await setFlag(host, ctx, 'mira_safe_path');
  return quarryMenu(host, ctx);
}

async function quarryMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'drowned_quarry';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'visited_drowned_quarry');
  const buttons: GameButton[] = [
    { label: 'Берег', action: 'WEEK2_ACT', payload: { act: 'quarry_shore' } },
  ];
  if (ctx.flags.quarry_drained) {
    buttons.push({ label: 'Выработка', action: 'WEEK2_ACT', payload: { act: 'quarry_workings' } });
  } else {
    buttons.push({ label: 'Затопленный проход', action: 'WEEK2_ACT', payload: { act: 'quarry_flood' } });
  }
  if (ctx.flags.quarry_workings) {
    buttons.push({ label: 'Нижняя камера', action: 'WEEK2_ACT', payload: { act: 'quarry_chamber' } });
  }
  if (ctx.flags.day_12_complete && !ctx.flags.defeated_smolnik) {
    buttons.push({ label: 'Смольник', action: 'WEEK2_ACT', payload: { act: 'smolnik' } });
  }
  if (ctx.flags.quarry_chamber && !ctx.flags.day_12_complete && buttons.length < 4) {
    buttons.push({ label: 'Завершить День 12', action: 'COMPLETE_DAY_12' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Утонувший карьер. Не клин. Вода стоит в проходе. Глина пахнет железом.',
    buttons.slice(0, 5),
  );
}

async function quarryStage(host: WeekHost, ctx: WeekCtx, stage: 'shore' | 'flood' | 'workings' | 'chamber'): Promise<GameResponse> {
  ctx.player.currentLocation = 'drowned_quarry';
  await host.store.savePlayer(ctx.player);
  if (stage === 'shore') {
    await setFlag(host, ctx, 'quarry_shore');
    await tickCrop(host, ctx, 1);
    return host.respond(ctx.player, 'Берег карьера. Нитники тянут нить по воде. Рыба плещется в кубах.', [
      { label: 'Нитник', action: 'START_PVE', payload: { enemyId: 'threadling' } },
      { label: 'Грызун', action: 'START_PVE', payload: { enemyId: 'bog_gnawer' } },
      { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } },
    ]);
  }
  if (stage === 'flood') {
    const buttons: GameButton[] = [];
    if (hasBucket(ctx)) {
      buttons.push({ label: 'Слить ведром', action: 'WEEK2_ACT', payload: { act: 'drain' } });
    } else {
      buttons.push({ label: 'Скрафтить ведро', action: 'OPEN_MENU', payload: { menu: 'items' } });
    }
    buttons.push({ label: 'Вброд', action: 'WEEK2_ACT', payload: { act: 'wade' } });
    if (hasBucket(ctx) && ctx.flags.mira_danger_path) {
      buttons.push({ label: 'Короткий путь', action: 'WEEK2_ACT', payload: { act: 'flood_path' } });
    }
    buttons.push({ label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } });
    return host.respond(
      ctx.player,
      hasBucket(ctx)
        ? 'Проход по пояс. Ведро снимет воду с клетки. Вброд — можно, но кусает холод.'
        : 'Проход затоплен. Ведро: 3 слитка. Или вброд — минус здоровье, плюс проход. Железо — в штольне.',
      buttons.slice(0, 5),
    );
  }
  if (stage === 'workings') {
    if (!ctx.flags.quarry_drained) throw new ActionRejectedError('Сначала проход.');
    await setFlag(host, ctx, 'quarry_workings');
    await tickCrop(host, ctx, 1);
    return host.respond(ctx.player, 'Старая выработка. Глина, смола, рыба в лужах.', [
      { label: 'Панцирник', action: 'START_PVE', payload: { enemyId: 'pitch_carapace' } },
      { label: 'Лазутчик', action: 'START_PVE', payload: { enemyId: 'reed_stalker' } },
      { label: 'Глина', action: 'WEEK2_ACT', payload: { act: 'gather_clay' } },
      { label: 'Камера', action: 'WEEK2_ACT', payload: { act: 'quarry_chamber' } },
      { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } },
    ]);
  }
  await setFlag(host, ctx, 'quarry_chamber');
  const buttons: GameButton[] = [{ label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } }];
  if (!ctx.flags.day_12_complete) {
    buttons.unshift({ label: 'Завершить День 12', action: 'COMPLETE_DAY_12' });
  }
  return host.respond(
    ctx.player,
    'Нижняя камера. На стене — символ Второй печати. Тот же род, что семёрка. Путь дальше закрыт камнем и водой.',
    buttons.slice(0, 5),
  );
}

async function drainPassage(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!hasBucket(ctx)) throw new ActionRejectedError('Нужно ведро. Три слитка. Руда — в штольне.');
  await setFlag(host, ctx, 'quarry_drained');
  await tickCrop(host, ctx, 1);
  return quarryStage(host, ctx, 'workings');
}

async function wadePassage(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.hp = Math.max(1, ctx.player.hp - 8);
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'quarry_drained');
  await tickCrop(host, ctx, 1);
  const next = await quarryStage(host, ctx, 'workings');
  next.text = `Холод кусает. −8 HP. Проход позади.\n${next.text}`;
  return next;
}

async function gatherClay(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (!ctx.flags.quarry_workings && !ctx.flags.quarry_drained) {
    throw new ActionRejectedError('Глина глубже прохода.');
  }
  await host.spend(ctx.player, 2);
  await host.store.addResource(ctx.player.id, 'CLAY', 1);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount: 1 });
  return host.respond(ctx.player, `Глина. Пока без печи для чаш. Просто есть. +1 ${resourceLabel('CLAY')}.`, [
    { label: 'Ещё глину', action: 'WEEK2_ACT', payload: { act: 'gather_clay' } },
    { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } },
  ]);
}

async function floodShortcut(host: WeekHost, ctx: WeekCtx, eventId: string): Promise<GameResponse> {
  if (!hasBucket(ctx)) throw new ActionRejectedError('Без ведра короткий путь — просто утонуть.');
  const ok = await host.store.tryClaimReward(ctx.player.id, 'week2', 'flood_pearl');
  await setFlag(host, ctx, 'took_flood_path');
  await setFlag(host, ctx, 'quarry_drained');
  if (ok && !hasItem(ctx, 'drowned_pearl')) {
    const item = await host.store.createItem({
      playerId: ctx.player.id,
      templateId: 'drowned_pearl',
      rarity: 'RARE',
    });
    await host.store.recordItemHistory({ itemId: item.id, playerId: ctx.player.id, type: 'LOOTED' });
    await noteActivity(host.store, ctx.player, { type: 'loot', count: 1, rare: true });
    void eventId;
    return host.respond(ctx.player, 'Короткий путь. В иле — топяная жемчужина. Редкая, не сильная.', [
      { label: 'Выработка', action: 'WEEK2_ACT', payload: { act: 'quarry_workings' } },
      { label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } },
    ]);
  }
  return quarryStage(host, ctx, 'workings');
}

async function smolnikGate(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'drowned_quarry';
  await host.store.savePlayer(ctx.player);
  const buttons: GameButton[] = [
    { label: 'Бить Смольника', action: 'START_PVE', payload: { enemyId: 'smolnik' } },
  ];
  if (hasBow(ctx)) {
    buttons.push({ label: 'С дистанции', action: 'START_PVE', payload: { enemyId: 'smolnik', move: 'bow' } });
  }
  if (!hasShield(ctx) && buttons.length < 3) {
    buttons.push({ label: 'Щит', action: 'OPEN_MENU', payload: { menu: 'items' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'WEEK2_ACT', payload: { act: 'quarry' } });
  return host.respond(
    ctx.player,
    'Смольник в котловине. Смола, корни, не печать. Лук помогает. Щит держит. Без них — можно, дольше.',
    buttons.slice(0, 5),
  );
}

async function useBogCore(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.used_bog_core) return prepSeal(host, ctx);
  if ((ctx.resources.BOG_CORE ?? 0) < 1 && !ctx.flags.has_bog_core) {
    throw new ActionRejectedError('Сердцевины нет. Смольник ещё или уже потрачена.');
  }
  if ((ctx.resources.BOG_CORE ?? 0) >= 1) {
    await host.store.addResource(ctx.player.id, 'BOG_CORE', -1);
  }
  await setFlag(host, ctx, 'used_bog_core');
  return prepSeal(host, await host.load(ctx.player));
}

async function prepSeal(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'second_seal';
  await host.store.savePlayer(ctx.player);
  await setFlag(host, ctx, 'mist_warden_seen');
  const lines = [
    'Впадина. Туман втягивается в щель.',
    hasBow(ctx) ? 'Лук: внешний узел с дистанции.' : 'Без лука — вплотную.',
    hasShield(ctx) ? 'Щит: тяжёлый удар слабее.' : 'Без щита — принимай удар.',
    hasBucket(ctx) ? 'Ведро: одна площадка без воды.' : 'Ведро не обязательно.',
    ctx.flags.lantern_repaired ? 'Фонарь показывает ядро.' : 'Без фонаря силуэт плывёт.',
    ctx.flags.used_bog_core ? 'Сердцевина уже в щели.' : ctx.flags.has_bog_core ? 'Сердцевину можно бросить сейчас.' : 'Без сердцевины — просто дольше.',
    miraTrust(ctx) >= 2 ? 'Мира: бей ядро.' : 'Мира почти молчит.',
  ];
  const buttons: GameButton[] = [
    { label: 'Бить ядро', action: 'START_PVE', payload: { enemyId: 'mist_warden', move: 'core' } },
  ];
  if (hasBucket(ctx) && !ctx.flags.used_bucket_on_warden) {
    buttons.push({
      label: 'Слить площадку',
      action: 'START_PVE',
      payload: { enemyId: 'mist_warden', move: 'drain' },
    });
  }
  if ((ctx.flags.has_bog_core || (ctx.resources.BOG_CORE ?? 0) > 0) && !ctx.flags.used_bog_core) {
    buttons.push({ label: 'Бросить сердцевину', action: 'WEEK2_ACT', payload: { act: 'use_core' } });
  }
  if (hasBow(ctx) && buttons.length < 4) {
    buttons.push({
      label: 'Узел с дистанции',
      action: 'START_PVE',
      payload: { enemyId: 'mist_warden', move: 'bow' },
    });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, lines.join('\n'), buttons.slice(0, 5));
}

async function sealMenu(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.week_2_complete) return host.renderNode(ctx.player, 'week2_complete');
  return prepSeal(host, ctx);
}

async function week2Hub(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  if (ctx.flags.week_2_complete) return host.renderNode(ctx.player, 'week2_complete');
  const buttons: GameButton[] = [];
  if (ctx.flags.farming_unlocked) {
    buttons.push({ label: 'Грядка', action: 'FARM_ACT', payload: { act: 'open' } });
  }
  buttons.push({ label: 'Кромка', action: 'WEEK2_ACT', payload: { act: 'border' } });
  if (ctx.flags.day_8_complete) {
    buttons.push({ label: 'Низина', action: 'WEEK2_ACT', payload: { act: 'lowland' } });
  }
  if (ctx.flags.day_11_complete) {
    buttons.push({ label: 'Карьер', action: 'WEEK2_ACT', payload: { act: 'quarry' } });
  }
  if (ctx.flags.day_13_complete) {
    buttons.push({ label: 'Печать', action: 'WEEK2_ACT', payload: { act: 'seal' } });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(
    ctx.player,
    'Низина дышит. Две печати ещё не молчат. Одна уже.',
    buttons.slice(0, 5),
  );
}

export async function applyWeek2Victory(host: WeekHost, ctx: WeekCtx, enemyId: string): Promise<string[]> {
  const notes: string[] = [];
  if (ctx.flags.crop_planted) await tickCrop(host, ctx, 1);
  if ((ctx.resources.STRING ?? 0) > 0 || ctx.flags.first_string) {
    if (!ctx.flags.first_string) await setFlag(host, ctx, 'first_string');
  }
  if (enemyId === 'smolnik') {
    await setFlag(host, ctx, 'defeated_smolnik');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'smolnik');
    if (first) {
      await host.store.addResource(ctx.player.id, 'BOG_CORE', 1);
      await setFlag(host, ctx, 'has_bog_core');
      notes.push(`+1 ${resourceLabel('BOG_CORE')}.`);
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'smolnik_hunt',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'smolnik_hunt' });
    } else {
      notes.push('Смольник уже отдал сердцевину.');
    }
  }
  if (enemyId === 'mist_warden') {
    await setFlag(host, ctx, 'mist_warden_defeated');
    const first = await host.store.tryClaimReward(ctx.player.id, 'boss', 'mist_warden');
    if (first) {
      await host.store.addResource(ctx.player.id, 'SEAL_SHARD_6', 1);
      notes.push(`+1 ${resourceLabel('SEAL_SHARD_6')}.`);
      await host.changeCoins(ctx.player, 50, 'mist_warden', 'first');
      notes.push('+50 монет.');
      await host.store.upsertPlayerQuest({
        playerId: ctx.player.id,
        questId: 'second_seal',
        status: 'CLAIMED',
        progress: { win: true },
      });
      await noteActivity(host.store, ctx.player, { type: 'quest', id: 'second_seal' });
    } else {
      notes.push('Сюжетный лут уже получен.');
    }
  }
  return notes;
}

export async function talkMira(host: WeekHost, ctx: WeekCtx): Promise<GameResponse> {
  ctx.player.currentLocation = 'mist_lowland';
  await host.store.savePlayer(ctx.player);
  if (!ctx.flags.met_mira) return host.renderNode(ctx.player, 'day11_mira');
  const trust = miraTrust(ctx);
  const text =
    trust >= 2
      ? 'Мира проверяет воду ладонью. — Печати — замки. Смольник не ключ. Не лезь в щель без подготовки, но без меня тоже пройдёшь.'
      : trust < 0
        ? 'Мира отвечает коротко. — Низина втягивает. Бей то, что из камня и скоб. Остальное сама.'
        : 'Мира: «Карьер, потом зверь по краю, потом впадина. Не путай порядок.»';
  const buttons: GameButton[] = [
    { label: 'Низина', action: 'WEEK2_ACT', payload: { act: 'lowland' } },
  ];
  if (ctx.flags.day_11_complete) {
    buttons.push({ label: 'Карьер', action: 'WEEK2_ACT', payload: { act: 'quarry' } });
  }
  if (!ctx.flags.day_11_complete) {
    buttons.push({ label: 'Завершить День 11', action: 'COMPLETE_DAY_11' });
  }
  buttons.push({ label: BACK_LABEL, action: 'OPEN_CAMP' });
  return host.respond(ctx.player, text, buttons.slice(0, 5));
}
