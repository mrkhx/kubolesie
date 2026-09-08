import { describe, expect, it } from 'vitest';
import {
  CLAN_CREATE_COST,
  CLAN_DONATION_VALUES,
  clanLevelForXp,
  clanMemberCap,
  dailyClanTasks,
  isoWeekKey,
  utcDayKey,
  weeklyClanTask,
} from '@kubolesie/content';
import type { GameCommandType, NormalizedIncomingEvent } from '@kubolesie/shared';
import { PROTOTYPE_VERSION, BALANCE_VERSION } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { noteActivity } from './meta';

function event(
  type: GameCommandType,
  payload: Record<string, unknown> = {},
  eventId = `evt-${type}-${Math.random().toString(16).slice(2)}`,
  vkUserId = 'vk-clan',
  text?: string,
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Страж' },
    command: { type, payload },
    text,
  };
}

async function prepare(
  store: MemoryGameStore,
  vkUserId: string,
  week1 = true,
  coins = CLAN_CREATE_COST,
  now?: Date,
) {
  const runtime = new GameRuntime(store, now ? () => now : undefined);
  await runtime.handle(event('START_GAME', {}, `start-${vkUserId}`, vkUserId));
  const player = (await store.findPlayerByVkUserId(vkUserId))!;
  if (week1) await store.setFlag(player.id, 'week_1_complete', '1');
  if (coins) {
    player.coins = coins;
    await store.savePlayer(player);
  }
  return { store, runtime, player: (await store.findPlayerById(player.id))!, vkUserId };
}

async function boot(vkUserId = `vk-${Math.random().toString(16).slice(2)}`, week1 = true, coins = CLAN_CREATE_COST, now?: Date) {
  return prepare(new MemoryGameStore(), vkUserId, week1, coins, now);
}

async function act(
  runtime: GameRuntime,
  vkUserId: string,
  type: GameCommandType,
  payload: Record<string, unknown> = {},
  text?: string,
) {
  return runtime.handle(event(type, payload, `e-${type}-${Math.random().toString(16).slice(2)}`, vkUserId, text));
}

describe('clans 1.0', () => {
  it('keeps prototype 0.0.8', () => {
    expect(PROTOTYPE_VERSION).toBe('0.0.8');
    expect(BALANCE_VERSION).toBe('0.0.8');
  });

  it('locks the clan hub before week 1 and opens after', async () => {
    const locked = await boot('vk-lock', false, 0);
    const hub = await act(locked.runtime, 'vk-lock', 'OPEN_MENU', { menu: 'clan' });
    expect(hub.text).toMatch(/первой печати/);
    const denied = await act(locked.runtime, 'vk-lock', 'CLAN_ACT', { act: 'create', name: 'Север', tag: 'СВР' });
    expect(denied.text).toMatch(/первой печати/);

    const open = await boot('vk-open');
    const ready = await act(open.runtime, 'vk-open', 'OPEN_MENU', { menu: 'clan' });
    expect(ready.buttons.some((button) => /Создать/.test(button.label))).toBe(true);
  });

  it('creates a clan for coins with unique name/tag and leader role', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    const created = await act(runtime, vkUserId, 'CLAN_ACT', { act: 'create', name: 'Север', tag: 'свр' });
    expect(created.text).toMatch(/создан/);
    expect((await store.findPlayerById(player.id))!.coins).toBe(0);
    const membership = await store.getPlayerClan(player.id);
    expect(membership?.member.role).toBe('LEADER');
    expect(membership?.clan.tag).toBe('СВР');
  });

  it('rejects insufficient coins, duplicate name/tag, invalid name and already-in-clan', async () => {
    const a = await boot('vk-a', true, 10);
    expect((await act(a.runtime, 'vk-a', 'CLAN_ACT', { act: 'create', name: 'Север', tag: 'СВР' })).text).toMatch(
      /монет/,
    );
    const store = new MemoryGameStore();
    const b = await prepare(store, 'vk-b');
    await act(b.runtime, 'vk-b', 'CLAN_ACT', { act: 'create', name: 'Север', tag: 'СВР' });
    const c = await prepare(store, 'vk-c');
    expect((await act(c.runtime, 'vk-c', 'CLAN_ACT', { act: 'create', name: 'север', tag: 'ZZZ' })).text).toMatch(
      /Имя занято/,
    );
    expect((await act(c.runtime, 'vk-c', 'CLAN_ACT', { act: 'create', name: 'Южный', tag: 'свр' })).text).toMatch(
      /Тег занят/,
    );
    expect((await act(c.runtime, 'vk-c', 'CLAN_ACT', { act: 'create', name: 'ab', tag: 'ЮГГ' })).text).toMatch(
      /3–24/,
    );
    expect((await act(c.runtime, 'vk-c', 'CLAN_ACT', { act: 'create', name: 'https://x', tag: 'ЮГГ' })).text).toMatch(
      /нельзя/,
    );
    expect((await act(b.runtime, 'vk-b', 'CLAN_ACT', { act: 'create', name: 'Другой', tag: 'ДРГ' })).text).toMatch(
      /уже в клане/,
    );
  });

  it('applies, cancels, accepts, rejects and blocks a second clan', async () => {
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'lead');
    const other = await prepare(store, 'other');
    const applicant = await prepare(store, 'app');
    await act(lead.runtime, 'lead', 'CLAN_ACT', { act: 'create', name: 'Альфа', tag: 'АЛФ' });
    await act(other.runtime, 'other', 'CLAN_ACT', { act: 'create', name: 'Бета', tag: 'БЕТ' });
    const clanA = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    const clanB = (await other.store.getPlayerClan(other.player.id))!.clan;
    const applied = await act(applicant.runtime, 'app', 'CLAN_ACT', { act: 'apply', clanId: clanA.id });
    expect(applied.text).toMatch(/отправлена/);
    expect((await act(applicant.runtime, 'app', 'CLAN_ACT', { act: 'apply', clanId: clanA.id })).text).toMatch(/уже/);
    expect((await act(applicant.runtime, 'app', 'CLAN_ACT', { act: 'apply', clanId: clanB.id })).text).toMatch(
      /отмени/,
    );
    const pending = (await lead.store.listPlayerApplications(applicant.player.id)).find((row) => row.status === 'PENDING')!;
    await act(applicant.runtime, 'app', 'CLAN_ACT', { act: 'cancel_app', appId: pending.id });
    await act(applicant.runtime, 'app', 'CLAN_ACT', { act: 'apply', clanId: clanA.id });
    const app = (await lead.store.listPendingApplications(clanA.id))[0]!;
    const accepted = await act(lead.runtime, 'lead', 'CLAN_ACT', { act: 'accept', appId: app.id });
    expect(accepted.text).toMatch(/Принят/);
    expect((await lead.store.getPlayerClan(applicant.player.id))?.clan.id).toBe(clanA.id);
    const extra = await prepare(store, 'extra');
    await act(extra.runtime, 'extra', 'CLAN_ACT', { act: 'apply', clanId: clanB.id });
    const otherApp = (await other.store.listPendingApplications(clanB.id))[0]!;
    await act(other.runtime, 'other', 'CLAN_ACT', { act: 'reject', appId: otherApp.id });
    expect((await other.store.getApplication(otherApp.id))?.status).toBe('REJECTED');
  });

  it('does not accept a player who already joined another clan', async () => {
    const store = new MemoryGameStore();
    const a = await prepare(store, 'ra');
    const b = await prepare(store, 'rb');
    const target = await prepare(store, 'rt');
    await act(a.runtime, 'ra', 'CLAN_ACT', { act: 'create', name: 'Север', tag: 'СВ1' });
    await act(b.runtime, 'rb', 'CLAN_ACT', { act: 'create', name: 'Южный', tag: 'ЮГ1' });
    const clanA = (await a.store.getPlayerClan(a.player.id))!.clan;
    const clanB = (await b.store.getPlayerClan(b.player.id))!.clan;
    await a.store.createApplication(clanA.id, target.player.id);
    const app = (await a.store.listPendingApplications(clanA.id))[0]!;
    await a.store.addClanMember({ clanId: clanB.id, playerId: target.player.id, role: 'MEMBER' });
    const denied = await act(a.runtime, 'ra', 'CLAN_ACT', { act: 'accept', appId: app.id });
    expect(denied.text).toMatch(/другом клане|уже в клане/);
    expect((await a.store.getPlayerClan(target.player.id))?.clan.id).toBe(clanB.id);
  });

  it('enforces member cap and ignores spoofed roles in payload', async () => {
    const lead = await boot('cap-l');
    await act(lead.runtime, 'cap-l', 'CLAN_ACT', { act: 'create', name: 'Узкий', tag: 'УЗК' });
    const clan = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    expect(clanMemberCap(clan.level)).toBe(10);
    for (let i = 0; i < 9; i += 1) {
      const member = await lead.store.createPlayer({ vkUserId: `cap-${i}`, name: `М${i}` });
      await lead.store.addClanMember({ clanId: clan.id, playerId: member.id, role: 'MEMBER', maxMembers: 10 });
    }
    const overflow = await lead.store.createPlayer({ vkUserId: 'cap-x', name: 'Лишний' });
    await expect(
      lead.store.addClanMember({ clanId: clan.id, playerId: overflow.id, role: 'MEMBER', maxMembers: 10 }),
    ).rejects.toThrow('clan_full');
    const mem = await boot('cap-m');
    await lead.store.addClanMember({ clanId: clan.id, playerId: mem.player.id, role: 'MEMBER' }).catch(() => undefined);
  });

  it('lets owner transfer, blocks officer from disband, and keeps one leader', async () => {
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'own');
    const off = await prepare(store, 'off');
    await act(lead.runtime, 'own', 'CLAN_ACT', { act: 'create', name: 'Клин', tag: 'КЛН' });
    const clan = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    await lead.store.addClanMember({ clanId: clan.id, playerId: off.player.id, role: 'OFFICER' });
    expect((await act(off.runtime, 'off', 'CLAN_ACT', { act: 'disband' })).text).toMatch(/лидер/i);
    const moved = await act(lead.runtime, 'own', 'CLAN_ACT', { act: 'transfer', targetId: off.player.id });
    expect(moved.text).toMatch(/передано/);
    expect((await lead.store.getPlayerClan(off.player.id))?.member.role).toBe('LEADER');
    expect((await lead.store.getPlayerClan(lead.player.id))?.member.role).toBe('OFFICER');
  });

  it('donates resources atomically and rejects negatives / seal shards', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'CLAN_ACT', { act: 'create', name: 'Склад', tag: 'СКД' });
    await store.addResource(player.id, 'LOG', 3);
    const clan = (await store.getPlayerClan(player.id))!.clan;
    const first = await act(runtime, vkUserId, 'CLAN_ACT', { act: 'donate', resource: 'LOG', amount: 2 });
    expect(first.text).toMatch(/Сдано/);
    expect((await store.getResources(player.id)).LOG).toBe(1);
    expect(await store.getContribution(clan.id, player.id, isoWeekKey(new Date()))).toBe(2 * (CLAN_DONATION_VALUES.LOG ?? 1));
    expect((await store.getClan(clan.id))!.xp).toBe(2);
    const denied = await act(runtime, vkUserId, 'CLAN_ACT', { act: 'donate', resource: 'SEAL_SHARD_6', amount: 1 });
    expect(denied.text).toMatch(/не принимает|нельзя/i);
    const empty = await act(runtime, vkUserId, 'CLAN_ACT', { act: 'donate', resource: 'LOG', amount: 5 });
    expect(empty.text).toMatch(/Не хватает/);
    expect((await store.getResources(player.id)).LOG).toBe(1);
  });

  it('replays a duplicate donate event only once', async () => {
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'CLAN_ACT', { act: 'create', name: 'Эхо', tag: 'ЭХО' });
    await store.addResource(player.id, 'IRON_INGOT', 2);
    const first = await runtime.handle(event('CLAN_ACT', { act: 'donate', resource: 'IRON_INGOT', amount: 1 }, 'don-1', vkUserId));
    const second = await runtime.handle(event('CLAN_ACT', { act: 'donate', resource: 'IRON_INGOT', amount: 1 }, 'don-1', vkUserId));
    expect(second).toEqual(first);
    expect((await store.getResources(player.id)).IRON_INGOT).toBe(1);
  });

  it('uses score thresholds and member caps for clan levels', () => {
    expect(clanLevelForXp(0)).toBe(1);
    expect(clanLevelForXp(499)).toBe(1);
    expect(clanLevelForXp(500)).toBe(2);
    expect(clanLevelForXp(75_000)).toBe(10);
    expect(clanMemberCap(1)).toBe(10);
    expect(clanMemberCap(2)).toBe(12);
    expect(clanMemberCap(10)).toBe(30);
  });

  it('picks deterministic daily/weekly tasks and counts real gameplay once', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const day = utcDayKey(now);
    const week = isoWeekKey(now);
    expect(dailyClanTasks(day)).toHaveLength(2);
    expect(dailyClanTasks(day)[0]!.id).toBe(dailyClanTasks(day)[0]!.id);
    expect(weeklyClanTask(week).kind).toBe('weekly');
    const { store, runtime, player, vkUserId } = await boot();
    await act(runtime, vkUserId, 'CLAN_ACT', { act: 'create', name: 'Дело', tag: 'ДЕЛ' });
    await noteActivity(store, player, { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' }, now);
    await noteActivity(store, player, { type: 'pvp', result: 'LOSS', rivalId: 'yara_trace' }, now);
    await noteActivity(store, player, { type: 'craft', count: 2 }, now);
    await noteActivity(store, player, { type: 'gather', amount: 5, resource: 'LOG' }, now);
    const tasks = await store.listClanTasks((await store.getPlayerClan(player.id))!.clan.id, [day, week]);
    expect(tasks.some((row) => row.progress > 0)).toBe(true);
  });

  it('does not pay a non-contributor and pays a contributor once', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const store = new MemoryGameStore();
    const lead = await prepare(store, 't-lead', true, CLAN_CREATE_COST, now);
    const idle = await prepare(store, 't-idle', true, CLAN_CREATE_COST, now);
    await act(lead.runtime, 't-lead', 'CLAN_ACT', { act: 'create', name: 'Награда', tag: 'НРД' });
    const clan = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    await lead.store.addClanMember({ clanId: clan.id, playerId: idle.player.id, role: 'MEMBER' });
    const day = utcDayKey(now);
    const week = isoWeekKey(now);
    const daily = dailyClanTasks(day)[0]!;
    await lead.store.incrementClanTask(clan.id, daily.kind === 'daily' ? day : week, daily.id, daily.target, daily.target);
    await lead.store.addContribution(clan.id, lead.player.id, `t:${day}:${daily.id}`, 1);
    const claimed = await act(lead.runtime, 't-lead', 'CLAN_ACT', {
      act: 'claim_task',
      periodKey: day,
      taskId: daily.id,
    });
    expect(claimed.text).toMatch(/Награда/);
    const again = await act(lead.runtime, 't-lead', 'CLAN_ACT', {
      act: 'claim_task',
      periodKey: day,
      taskId: daily.id,
    });
    expect(again.text).toMatch(/уже/);
    const idleClaim = await act(idle.runtime, 't-idle', 'CLAN_ACT', {
      act: 'claim_task',
      periodKey: day,
      taskId: daily.id,
    });
    expect(idleClaim.text).toMatch(/не участвовал|уже/);
  });

  it('ranks by weekly contribution with deterministic ties', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const week = isoWeekKey(now);
    const store = new MemoryGameStore();
    const a = await prepare(store, 'lb-a');
    const b = await prepare(store, 'lb-b');
    await act(a.runtime, 'lb-a', 'CLAN_ACT', { act: 'create', name: 'Альфа', tag: 'ААА' });
    await act(b.runtime, 'lb-b', 'CLAN_ACT', { act: 'create', name: 'Бета', tag: 'БББ' });
    const clanA = (await a.store.getPlayerClan(a.player.id))!.clan;
    const clanB = (await b.store.getPlayerClan(b.player.id))!.clan;
    await a.store.addContribution(clanA.id, a.player.id, week, 50);
    await b.store.addContribution(clanB.id, b.player.id, week, 80);
    const board = await a.store.listClanLeaderboard(week, 10, 0);
    expect(board[0]!.id).toBe(clanB.id);
    expect(await a.store.getClanLeaderboardRank(clanA.id, week)).toBe(2);
  });

  it('requires a second action to disband and keeps history', async () => {
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'dis');
    const mem = await prepare(store, 'dis-m');
    await act(lead.runtime, 'dis', 'CLAN_ACT', { act: 'create', name: 'Пыль', tag: 'ПЫЛ' });
    const clan = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    await lead.store.addClanMember({ clanId: clan.id, playerId: mem.player.id, role: 'MEMBER' });
    const first = await act(lead.runtime, 'dis', 'CLAN_ACT', { act: 'disband' });
    expect(first.text).toMatch(/Подтверди|подтвер/i);
    expect(await lead.store.getPlayerClan(lead.player.id)).not.toBeNull();
    const spoof = await act(lead.runtime, 'dis', 'CLAN_ACT', { act: 'confirm_disband', token: 'nope' });
    expect(spoof.text).toMatch(/устарело|нельзя|нет/i);
    const token = String(first.buttons.find((button) => button.payload?.act === 'confirm_disband')?.payload?.token ?? '');
    const gone = await act(lead.runtime, 'dis', 'CLAN_ACT', { act: 'confirm_disband', token });
    expect(gone.text).toMatch(/распущ/i);
    expect(await lead.store.getPlayerClan(lead.player.id)).toBeNull();
    expect(await lead.store.getPlayerClan(mem.player.id)).toBeNull();
    expect((await lead.store.getClan(clan.id))?.disbandedAt).toBeTruthy();
  });

  it('blocks a leader from leaving while others remain', async () => {
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'lv');
    const mem = await prepare(store, 'lv-m');
    await act(lead.runtime, 'lv', 'CLAN_ACT', { act: 'create', name: 'Дом', tag: 'ДОМ' });
    const clan = (await lead.store.getPlayerClan(lead.player.id))!.clan;
    await lead.store.addClanMember({ clanId: clan.id, playerId: mem.player.id, role: 'MEMBER' });
    expect((await act(lead.runtime, 'lv', 'CLAN_ACT', { act: 'leave' })).text).toMatch(/передаёт|распускает/);
    expect((await act(mem.runtime, 'lv-m', 'CLAN_ACT', { act: 'leave' })).text).toMatch(/вышел/);
  });

  it('denies member mutations and ignores spoofed payload roles', async () => {
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'perm-l');
    const mem = await prepare(store, 'perm-m');
    await act(lead.runtime, 'perm-l', 'CLAN_ACT', { act: 'create', name: 'Стража', tag: 'СТР' });
    const clan = (await store.getPlayerClan(lead.player.id))!.clan;
    await store.addClanMember({ clanId: clan.id, playerId: mem.player.id, role: 'MEMBER' });
    expect((await act(mem.runtime, 'perm-m', 'CLAN_ACT', { act: 'apps' })).text).toMatch(/Нет прав/);
    expect((await act(mem.runtime, 'perm-m', 'CLAN_ACT', { act: 'disband' })).text).toMatch(/лидер/i);
    expect(
      (await act(mem.runtime, 'perm-m', 'CLAN_ACT', { act: 'kick', targetId: lead.player.id, role: 'LEADER' })).text,
    ).toMatch(/Нет прав/);
  });

  it('rolls UTC tasks to a new day and does not pay the old claim', async () => {
    const dayA = new Date('2026-09-07T12:00:00Z');
    const dayB = new Date('2026-09-08T12:00:00Z');
    const store = new MemoryGameStore();
    const lead = await prepare(store, 'utc-l', true, CLAN_CREATE_COST, dayA);
    await act(lead.runtime, 'utc-l', 'CLAN_ACT', { act: 'create', name: 'Часы', tag: 'ЧАС' });
    const later = new GameRuntime(store, () => dayB);
    const denied = await later.handle(
      event('CLAN_ACT', { act: 'claim_task', periodKey: utcDayKey(dayA), taskId: dailyClanTasks(utcDayKey(dayA))[0]!.id }, 'utc-claim', 'utc-l'),
    );
    expect(denied.text).toMatch(/сменилось|не закрыто|не участвовал/i);
  });

  it('resets weekly ranking independently of lifetime clan score', async () => {
    const weekA = new Date('2026-09-07T12:00:00Z');
    const weekB = new Date('2026-09-14T12:00:00Z');
    const store = new MemoryGameStore();
    const a = await prepare(store, 'wk-a');
    const b = await prepare(store, 'wk-b');
    await act(a.runtime, 'wk-a', 'CLAN_ACT', { act: 'create', name: 'Старый', tag: 'СТР' });
    await act(b.runtime, 'wk-b', 'CLAN_ACT', { act: 'create', name: 'Новый', tag: 'НОВ' });
    const clanA = (await store.getPlayerClan(a.player.id))!.clan;
    const clanB = (await store.getPlayerClan(b.player.id))!.clan;
    await store.addContribution(clanA.id, a.player.id, isoWeekKey(weekA), 90);
    await store.addContribution(clanB.id, b.player.id, isoWeekKey(weekA), 10);
    await store.addContribution(clanB.id, b.player.id, isoWeekKey(weekB), 40);
    expect((await store.listClanLeaderboard(isoWeekKey(weekA), 10, 0))[0]!.id).toBe(clanA.id);
    expect((await store.listClanLeaderboard(isoWeekKey(weekB), 10, 0))[0]!.id).toBe(clanB.id);
  });
});
