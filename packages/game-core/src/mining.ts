import {
  MINING_GROUP_LABELS,
  MINING_HELP_TEXT,
  getMiningSite,
  hasAxe,
  minerRareExtraChance,
  pickaxeLabel,
  pickaxeRank,
  professionManualBonusBps,
  resourceSourceHint,
  siteFullyUnlocked,
  siteLockReason,
  siteProgressUnlocked,
  sitesInGroup,
  jobLevelForXp,
  resourceLabel,
  type MiningGroup,
  type MiningSite,
} from '@kubolesie/content';
import { BACK_LABEL, type GameButton, type GameResponse, type ResourceType } from '@kubolesie/shared';
import { seededChance, seededRange } from '@kubolesie/combat-engine';
import { ActionRejectedError, InsufficientEnergyError } from './errors';
import { noteActivity } from './meta';
import { noteManualMine, noteMiningUnlock } from './mining-metrics';
import { noteDailyGather, type WeekCtx, type WeekHost } from './week';
import { pagedButtons } from './paging';

const PAGE_SIZE = 3;

export interface MiningMenuView {
  currentLocation: string;
  flags: Record<string, string>;
  items: Array<{ templateId: string }>;
  quests: Record<string, { status: string }>;
}

function inventoryRank(ctx: { items: Array<{ templateId: string }> }): number {
  return pickaxeRank(ctx.items.map((item) => item.templateId));
}

function equippedYield(
  stats: { woodYieldBonus: number; stoneYieldBonus: number; oreYieldBonus: number },
  resource: ResourceType,
): number {
  if (resource === 'LOG') return stats.woodYieldBonus;
  if (resource === 'COBBLESTONE') return stats.stoneYieldBonus;
  if (
    resource === 'IRON_ORE' ||
    resource === 'COPPER_ORE' ||
    resource === 'TIN_ORE' ||
    resource === 'SILVER_ORE' ||
    resource === 'GOLD_ORE' ||
    resource === 'COAL' ||
    resource === 'DEEP_CRYSTAL'
  ) {
    return stats.oreYieldBonus;
  }
  return 0;
}

function coalToolBump(ctx: WeekCtx): number {
  return inventoryRank(ctx) >= 2 ? 1 : 0;
}

function forestAxeBump(ctx: WeekCtx): number {
  return hasAxe(ctx.items.map((item) => item.templateId)) ? 1 : 0;
}

async function professionLevel(host: WeekHost, ctx: WeekCtx, profession: MiningSite['profession']): Promise<number> {
  const job = await host.store.getJob(ctx.player.id, profession);
  return jobLevelForXp(job?.xp ?? 0);
}

function paginate(
  buttons: GameButton[],
  page: number,
  makeMore: (next: number) => GameButton,
  back: GameButton,
): GameButton[] {
  return pagedButtons(buttons, page, makeMore, back, PAGE_SIZE);
}

function groupBack(): GameButton {
  return { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'gather' } };
}

function siteButton(site: MiningSite, ctx: MiningMenuView, rank: number): GameButton {
  const unlocked = siteFullyUnlocked(site, ctx.flags, rank);
  if (unlocked) {
    return { label: site.label, action: 'MINE_ACT', payload: { act: 'site', site: site.id } };
  }
  return { label: site.lockedLabel, action: 'MINE_ACT', payload: { act: 'info', site: site.id } };
}

export function miningGatherBody(ctx: MiningMenuView): GameButton[] {
  const shortcuts: GameButton[] = [];
  const loc = ctx.currentLocation;
  if (
    loc === 'forest_clearing' ||
    loc === 'rem_camp' ||
    loc === 'player_camp' ||
    loc === 'ashen_wedge' ||
    loc === 'mist_border'
  ) {
    shortcuts.push({ label: '🪓 Рубить дерево', action: 'GATHER_WOOD' });
  }
  const rank = inventoryRank(ctx);
  if (loc === 'stone_scree' && rank >= 1) {
    shortcuts.push({ label: '🪨 Добыть булыжник', action: 'GATHER_STONE' });
  }
  if ((loc === 'soot_fissure' || loc === 'old_adit') && rank >= 1) {
    shortcuts.push({ label: '⚫ Добыть уголь', action: 'GATHER_COAL' });
  }
  if (loc === 'old_adit' && rank >= 2) {
    const quest = ctx.quests.iron_for_gate;
    if (quest && ['ACTIVE', 'CLAIMED', 'COMPLETED'].includes(quest.status)) {
      shortcuts.push({ label: '⛏ Добыть железо', action: 'GATHER_IRON' });
    }
  }
  const nested: GameButton[] = [
    { label: MINING_GROUP_LABELS.surface, action: 'MINE_ACT', payload: { act: 'group', group: 'surface' } },
    { label: MINING_GROUP_LABELS.mines, action: 'MINE_ACT', payload: { act: 'group', group: 'mines' } },
  ];
  const showRegion = Boolean(
    ctx.flags.day_2_complete || ctx.flags.week_1_complete || ctx.flags.week_2_complete || ctx.flags.week_3_complete,
  );
  if (showRegion) {
    nested.push({ label: MINING_GROUP_LABELS.region, action: 'MINE_ACT', payload: { act: 'group', group: 'region' } });
  } else {
    nested.push({ label: '📖 Добыча и руды', action: 'MINE_ACT', payload: { act: 'help' } });
  }
  return [...shortcuts, ...nested];
}

export function miningGatherButtons(ctx: MiningMenuView, page = 0): GameButton[] {
  return paginate(
    miningGatherBody(ctx),
    page,
    (next) => ({ label: '➡ Ещё', action: 'MINE_ACT', payload: { act: 'open', page: next } }),
    { label: BACK_LABEL, action: 'OPEN_MENU', payload: { menu: 'hub' } },
  );
}

function viewOf(ctx: WeekCtx): MiningMenuView {
  return {
    currentLocation: ctx.player.currentLocation,
    flags: ctx.flags,
    items: ctx.items,
    quests: ctx.quests,
  };
}

function groupScreen(ctx: WeekCtx, group: MiningGroup, page: number): { text: string; buttons: GameButton[] } {
  const rank = inventoryRank(ctx);
  const sites = sitesInGroup(group);
  const visible = sites
    .filter((site) => {
      if (siteFullyUnlocked(site, ctx.flags, rank)) return true;
      if (siteProgressUnlocked(site, ctx.flags)) return true;
      const index = sites.indexOf(site);
      const earlierLocked = sites.slice(0, index).filter((row) => !siteFullyUnlocked(row, ctx.flags, rank));
      return earlierLocked.length < 2;
    })
    .sort((a, b) => {
      const score = (site: MiningSite) => {
        if (siteFullyUnlocked(site, ctx.flags, rank)) return 0;
        if (siteProgressUnlocked(site, ctx.flags)) return 1;
        return 2;
      };
      return score(a) - score(b) || sites.indexOf(a) - sites.indexOf(b);
    });
  const buttons = visible.map((site) => siteButton(site, viewOf(ctx), rank));
  const title = MINING_GROUP_LABELS[group];
  const pick = pickaxeLabel(rank);
  return {
    text: `${title}.\nКирка: ${pick}.\nЭнергия: ${ctx.player.energy}/${ctx.player.maxEnergy}.`,
    buttons: paginate(
      buttons,
      page,
      (next) => ({ label: '➡ Ещё', action: 'MINE_ACT', payload: { act: 'group', group, page: next } }),
      groupBack(),
    ),
  };
}

function siteScreen(ctx: WeekCtx, site: MiningSite): { text: string; buttons: GameButton[] } {
  const rank = inventoryRank(ctx);
  const reason = siteLockReason(site, ctx.flags, rank);
  const have = ctx.resources[site.resource] ?? 0;
  const hint = resourceSourceHint(site.resource) ?? '';
  if (reason) {
    return {
      text: `${site.lockedLabel}\n${reason}\n${hint}\nЭнергия: ${ctx.player.energy}/${ctx.player.maxEnergy}.`,
      buttons: [
        { label: MINING_GROUP_LABELS[site.group], action: 'MINE_ACT', payload: { act: 'group', group: site.group } },
        groupBack(),
      ],
    };
  }
  const axeNote = site.id === 'forest' && forestAxeBump(ctx) ? ' Топор на поясе даст бонус.' : '';
  return {
    text: [
      site.blurb,
      `Кирка: ${pickaxeLabel(rank)}.`,
      `Энергия: ${ctx.player.energy}/${ctx.player.maxEnergy}.`,
      `Сейчас: ${resourceLabel(site.resource)} ×${have}.`,
      `Добыча: ${site.minYield}–${site.maxYield + (site.id === 'coal' ? coalToolBump(ctx) : 0) + (site.id === 'forest' ? forestAxeBump(ctx) : 0)}, −${site.energy} энергии.`,
      axeNote,
    ]
      .filter(Boolean)
      .join('\n'),
    buttons: [
      { label: '⛏ Добыть', action: 'MINE_ACT', payload: { act: 'mine', site: site.id } },
      { label: '📦 Что можно найти', action: 'MINE_ACT', payload: { act: 'info', site: site.id } },
      { label: MINING_GROUP_LABELS[site.group], action: 'MINE_ACT', payload: { act: 'group', group: site.group } },
      groupBack(),
    ],
  };
}

function infoScreen(ctx: WeekCtx, site: MiningSite): { text: string; buttons: GameButton[] } {
  const rank = inventoryRank(ctx);
  const reason = siteLockReason(site, ctx.flags, rank);
  const lines = [
    site.label,
    site.blurb,
    `Ресурс: ${resourceLabel(site.resource)}.`,
    `Инструмент: ${site.toolName}.`,
    `Энергия: ${site.energy}. Выход: ${site.minYield}–${site.maxYield}.`,
    resourceSourceHint(site.resource) ?? '',
    reason ? `Сейчас закрыто: ${reason}` : 'Можно добывать.',
  ];
  return {
    text: lines.filter(Boolean).join('\n'),
    buttons: [
      ...(reason
        ? []
        : [{ label: '⛏ Добыть', action: 'MINE_ACT' as const, payload: { act: 'mine', site: site.id } }]),
      { label: MINING_GROUP_LABELS[site.group], action: 'MINE_ACT', payload: { act: 'group', group: site.group } },
      groupBack(),
    ],
  };
}

async function rememberUnlock(host: WeekHost, ctx: WeekCtx, site: MiningSite): Promise<string> {
  const flag = `seen_mine_${site.id}`;
  if (ctx.flags[flag]) return '';
  if (!siteFullyUnlocked(site, ctx.flags, inventoryRank(ctx))) return '';
  await host.store.setFlag(ctx.player.id, flag, '1');
  ctx.flags[flag] = '1';
  noteMiningUnlock(site.id);
  if (site.id === 'copper') return ' Открыты новые жилы: медь. Печь плавит медную руду.';
  if (site.id === 'tin') return ' Открыта оловянная жила. Из меди и олова — бронза.';
  if (site.id === 'silver') return ' Открыта серебряная жила.';
  if (site.id === 'gold') return ' Открыта золотая жила. Не куй из него меч.';
  if (site.id === 'deep') return ' Открыта глубинная шахта. Жильный кристалл — редкий.';
  if (site.id === 'quarry') return ' Каменоломня открыта. Булыжник можно фармить.';
  if (site.id === 'iron') return ' Железная жила открыта. Можно возвращаться.';
  return '';
}

async function doMine(host: WeekHost, ctx: WeekCtx, site: MiningSite, eventId: string): Promise<GameResponse> {
  const rank = inventoryRank(ctx);
  const reason = siteLockReason(site, ctx.flags, rank);
  if (reason) throw new ActionRejectedError(reason);
  if (ctx.player.energy < site.energy) {
    throw new InsufficientEnergyError(`Нужно ${site.energy} энергии. Сейчас ${ctx.player.energy}.`);
  }
  await host.spend(ctx.player, site.energy);
  const stats = await host.effectiveStats(ctx);
  let minY = site.minYield;
  let maxY = site.maxYield;
  if (site.id === 'coal') maxY += coalToolBump(ctx);
  if (site.id === 'forest') maxY += forestAxeBump(ctx);
  let amount = seededRange(eventId, minY, maxY, site.id);
  const toolBonus = Math.min(0.8, equippedYield(stats, site.resource));
  const jobLv = await professionLevel(host, ctx, site.profession);
  const jobBps = professionManualBonusBps(site.profession, jobLv, site.resource);
  const jobMult = 1 + jobBps / 10_000;
  amount = Math.max(site.minYield, Math.floor(amount * (1 + toolBonus) * jobMult));
  const rare = minerRareExtraChance(jobLv, site.resource);
  if (rare > 0 && seededChance(eventId, rare, 'rare')) amount += 1;
  const total = await host.store.addResource(ctx.player.id, site.resource, amount);
  await noteActivity(host.store, ctx.player, { type: 'gather', amount, resource: site.resource });
  const daily = await noteDailyGather(host, ctx);
  const dailyNote = daily.length ? ` ${daily.join(' ')}` : '';
  noteManualMine(site.resource, amount, site.id);
  const fresh = await host.load(ctx.player);
  const screen = siteScreen(fresh, site);
  const bonusNotes: string[] = [];
  if (toolBonus > 0) bonusNotes.push('инструмент');
  if (jobBps > 0) bonusNotes.push(site.profession === 'MINER' ? 'шахтёр' : 'профессия');
  const bonus = bonusNotes.length ? ` Бонус: ${bonusNotes.join(', ')}.` : '';
  const unlock = await rememberUnlock(host, fresh, site);
  const verb =
    site.group === 'region'
      ? 'Ты собрал ресурс.'
      : site.id === 'forest'
        ? 'Ты рубишь дерево.'
        : 'Ты отколол несколько пластов.';
  return host.respond(
    ctx.player,
    `${verb}\n+${amount} ${resourceLabel(site.resource)} (всего ${total}). −${site.energy} энергия.${bonus}${unlock}${dailyNote}`,
    screen.buttons,
  );
}

export async function mineAct(
  host: WeekHost,
  ctx: WeekCtx,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<GameResponse> {
  const act = String(payload.act ?? 'open');
  const page = Number(payload.page ?? 0);
  if (act === 'open' || act === 'hub') {
    return host.respond(
      ctx.player,
      `⛏ ДОБЫЧА\nКирка: ${pickaxeLabel(inventoryRank(ctx))}. Энергия: ${ctx.player.energy}/${ctx.player.maxEnergy}.\nЧем лучше кирка — тем более редкие жилы доступны.`,
      miningGatherButtons(viewOf(ctx), page),
    );
  }
  if (act === 'help') {
    return host.respond(ctx.player, MINING_HELP_TEXT, [
      { label: MINING_GROUP_LABELS.surface, action: 'MINE_ACT', payload: { act: 'group', group: 'surface' } },
      { label: MINING_GROUP_LABELS.mines, action: 'MINE_ACT', payload: { act: 'group', group: 'mines' } },
      groupBack(),
    ]);
  }
  if (act === 'group') {
    const group = String(payload.group ?? 'surface') as MiningGroup;
    if (group !== 'surface' && group !== 'mines' && group !== 'region') {
      throw new ActionRejectedError('Нет такого участка.');
    }
    const screen = groupScreen(ctx, group, page);
    const extra: string[] = [];
    for (const site of sitesInGroup(group)) {
      const note = await rememberUnlock(host, ctx, site);
      if (note) extra.push(note.trim());
    }
    const text = extra.length ? `${extra.join(' ')}\n${screen.text}` : screen.text;
    return host.respond(ctx.player, text, screen.buttons);
  }
  const site = getMiningSite(String(payload.site ?? ''));
  if (!site) throw new ActionRejectedError('Нет такой жилы.');
  if (act === 'site') {
    const screen = siteScreen(ctx, site);
    const unlock = await rememberUnlock(host, ctx, site);
    return host.respond(ctx.player, `${unlock}${unlock ? '\n' : ''}${screen.text}`, screen.buttons);
  }
  if (act === 'info') {
    const screen = infoScreen(ctx, site);
    return host.respond(ctx.player, screen.text, screen.buttons);
  }
  if (act === 'mine') {
    return doMine(host, ctx, site, eventId);
  }
  return host.respond(ctx.player, '⛏ ДОБЫЧА', miningGatherButtons(viewOf(ctx), page));
}

export function isMineCommand(type: string): boolean {
  return type === 'MINE_ACT';
}
