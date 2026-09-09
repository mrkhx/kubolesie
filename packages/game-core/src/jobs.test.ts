import { describe, expect, it } from 'vitest';
import {
  JOBS,
  JOB_PROFESSIONS,
  JOB_TEMPLATES,
  JOB_XP_THRESHOLDS,
  jobCoinPayout,
  jobLevelForXp,
  jobMetricDelta,
  jobProfessionBonusBps,
  scaledJobCoins,
  scaledJobTarget,
} from '@kubolesie/content';
import { GAME_COMMANDS, PROTOTYPE_VERSION, BALANCE_VERSION, type NormalizedIncomingEvent } from '@kubolesie/shared';
import { MemoryGameStore } from './memory-store';
import { GameRuntime } from './runtime';
import { ACTION_MENUS } from './menus';
import { acceptJobContract, applyJobProgress, grantPlayerXp } from './jobs';
import type { PlayerRecord } from './store';

async function player(store: MemoryGameStore, vk: string) {
  return store.createPlayer({ vkUserId: vk, name: 'Путник' });
}

function event(
  type: NormalizedIncomingEvent['command']['type'],
  vkUserId: string,
  payload: Record<string, unknown> = {},
  eventId = `e-${type}-${Math.random().toString(16).slice(2)}`,
): NormalizedIncomingEvent {
  return {
    eventId,
    identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
    command: { type, payload },
  };
}

async function unlock(store: MemoryGameStore, who: PlayerRecord) {
  await store.setFlag(who.id, 'week_1_complete', '1');
}

describe('jobs content', () => {
  it('has six professions, 18 templates and a gentle XP curve to L20', () => {
    expect(JOB_PROFESSIONS).toHaveLength(6);
    expect(JOB_TEMPLATES).toHaveLength(18);
    expect(JOB_XP_THRESHOLDS[1]).toBe(0);
    expect(JOB_XP_THRESHOLDS[2]).toBe(50);
    expect(JOB_XP_THRESHOLDS[20]).toBe(5900);
    expect(jobLevelForXp(0)).toBe(1);
    expect(jobLevelForXp(50)).toBe(2);
    expect(jobLevelForXp(5899)).toBe(19);
    expect(jobLevelForXp(5900)).toBe(20);
    expect(jobLevelForXp(99_999)).toBe(20);
  });

  it('pays full/half/zero coins on the daily ladder', () => {
    expect(jobCoinPayout(18, 1)).toBe(18);
    expect(jobCoinPayout(18, 5)).toBe(18);
    expect(jobCoinPayout(18, 6)).toBe(9);
    expect(jobCoinPayout(18, 10)).toBe(9);
    expect(jobCoinPayout(18, 11)).toBe(0);
  });

  it('matches only the intended real actions', () => {
    const logs = JOB_TEMPLATES.find((row) => row.id === 'logger_logs')!;
    expect(jobMetricDelta(logs.metric, { type: 'gather', resource: 'LOG', amount: 4 })).toBe(4);
    expect(jobMetricDelta(logs.metric, { type: 'gather', resource: 'COAL', amount: 4 })).toBe(0);
    expect(jobMetricDelta(logs.metric, { type: 'craft', recipeId: 'planks', amount: 4 })).toBe(0);
    const planks = JOB_TEMPLATES.find((row) => row.id === 'logger_planks')!;
    expect(jobMetricDelta(planks.metric, { type: 'craft', recipeId: 'planks', amount: 4 })).toBe(4);
    const tools = JOB_TEMPLATES.find((row) => row.id === 'crafter_tools')!;
    expect(jobMetricDelta(tools.metric, { type: 'craft', recipeId: 'wooden_axe', amount: 1 })).toBe(1);
    expect(jobMetricDelta(tools.metric, { type: 'craft', recipeId: 'planks', amount: 4 })).toBe(0);
    const pve = JOB_TEMPLATES.find((row) => row.id === 'hunter_pve')!;
    expect(jobMetricDelta(pve.metric, { type: 'pve', result: 'WIN', enemyId: 'wild_shrew' })).toBe(1);
    expect(jobMetricDelta(pve.metric, { type: 'pve', result: 'LOSS', enemyId: 'wild_shrew' })).toBe(0);
    const farm = JOB_TEMPLATES.find((row) => row.id === 'farmer_plant')!;
    expect(jobMetricDelta(farm.metric, { type: 'farm', act: 'plant', amount: 1 })).toBe(1);
    expect(jobMetricDelta(farm.metric, { type: 'farm', act: 'harvest', amount: 2 })).toBe(0);
    expect(jobProfessionBonusBps(4)).toBe(0);
    expect(jobProfessionBonusBps(5)).toBe(500);
    expect(jobProfessionBonusBps(20)).toBe(2000);
    expect(scaledJobTarget(12, 1)).toBe(12);
    expect(scaledJobCoins(18, 1)).toBe(18);
  });
});

describe('jobs domain', () => {
  it('locks before week 1 and opens after', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const who = await player(store, 'job-lock');
    const locked = await runtime.handle(event('OPEN_MENU', who.vkUserId, { menu: 'work' }));
    expect(locked.text).toMatch(/Недел/);
    await unlock(store, who);
    const open = await runtime.handle(event('OPEN_MENU', who.vkUserId, { menu: 'work' }));
    expect(open.buttons.map((row) => row.label)).toEqual(['💼 Работы', '🏗 Дворы', '⬅ Назад']);
    expect(open.buttons.length).toBeLessThanOrEqual(5);
  });

  it('accepts one contract per profession and progresses from real gather', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'job-acc');
    await unlock(store, who);
    const task = await acceptJobContract(store, who.id, 'logger_logs', new Date('2026-09-08T12:00:00Z'));
    expect(task.target).toBe(12);
    expect(task.status).toBe('ACCEPTED');
    await expect(acceptJobContract(store, who.id, 'logger_planks', new Date('2026-09-08T12:00:00Z'))).rejects.toThrow(
      /активный контракт/,
    );
    const miner = await acceptJobContract(store, who.id, 'miner_cobble', new Date('2026-09-08T12:00:00Z'));
    expect(miner.profession).toBe('MINER');
    const none = await applyJobProgress(store, who.id, { type: 'gather', resource: 'COAL', amount: 20 });
    expect(none.filter((row) => row.task.id === task.id)).toHaveLength(0);
    const step = await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: 5 });
    expect(step[0]!.task.progress).toBe(5);
    expect(step[0]!.completed).toBe(false);
    const done = await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: 10 });
    expect(done[0]!.completed).toBe(true);
    expect(done[0]!.coins).toBe(18);
    expect(done[0]!.task.status).toBe('COMPLETED');
    const fresh = (await store.findPlayerById(who.id))!;
    expect(fresh.coins).toBe(18);
    const job = (await store.getJob(who.id, 'LOGGER'))!;
    expect(job.xp).toBe(10);
    expect(job.completedCount).toBe(1);
    const again = await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: 10 });
    expect(again).toHaveLength(0);
  });

  it('counts plank crafts by output amount and ignores unrelated crafts', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'job-plank');
    await unlock(store, who);
    await acceptJobContract(store, who.id, 'logger_planks', new Date('2026-09-08T12:00:00Z'));
    await applyJobProgress(store, who.id, { type: 'craft', recipeId: 'sticks', amount: 4 });
    expect((await store.getAcceptedJobTask(who.id, 'LOGGER'))!.progress).toBe(0);
    await applyJobProgress(store, who.id, { type: 'craft', recipeId: 'planks', amount: 4 });
    expect((await store.getAcceptedJobTask(who.id, 'LOGGER'))!.progress).toBe(4);
  });

  it('applies daily full / reduced / zero coin payouts', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'job-daily');
    await unlock(store, who);
    const now = new Date('2026-09-08T12:00:00Z');
    const job = await store.acceptJobTask({ playerId: who.id, templateId: 'logger_logs', now });
    const inner = store as unknown as { state: { jobs: Array<{ dailyCompleted: number; dailyPeriod: string }> } };
    inner.state.jobs[0]!.dailyCompleted = 5;
    inner.state.jobs[0]!.dailyPeriod = '2026-09-08';
    await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: job.target }, now);
    const afterFive = (await store.findPlayerById(who.id))!;
    expect(afterFive.coins).toBe(9);
    const nextDay = new Date('2026-09-09T12:00:00Z');
    const again = await store.acceptJobTask({ playerId: who.id, templateId: 'logger_logs', now: nextDay });
    inner.state.jobs[0]!.dailyCompleted = 10;
    inner.state.jobs[0]!.dailyPeriod = '2026-09-09';
    await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: again.target }, nextDay);
    expect((await store.findPlayerById(who.id))!.coins).toBe(9);
  });

  it('rolls daily counters on UTC day change', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'job-utc');
    await unlock(store, who);
    const day1 = new Date('2026-09-08T23:00:00Z');
    await acceptJobContract(store, who.id, 'logger_logs', day1);
    await applyJobProgress(store, who.id, { type: 'gather', resource: 'LOG', amount: 12 }, day1);
    expect((await store.getJob(who.id, 'LOGGER'))!.dailyCompleted).toBe(1);
    const day2 = new Date('2026-09-09T00:30:00Z');
    await acceptJobContract(store, who.id, 'logger_planks', day2);
    await applyJobProgress(store, who.id, { type: 'craft', recipeId: 'planks', amount: 20 }, day2);
    expect((await store.getJob(who.id, 'LOGGER'))!.dailyPeriod).toBe('2026-09-09');
    expect((await store.getJob(who.id, 'LOGGER'))!.dailyCompleted).toBe(1);
  });

  it('does not grant premium and keeps compact menus', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const who = await player(store, 'job-ui');
    await unlock(store, who);
    const hub = await runtime.handle(event('JOB_ACT', who.vkUserId, { act: 'hub' }));
    expect(hub.buttons.length).toBeLessThanOrEqual(5);
    expect(hub.text).not.toMatch(/PREMIUM|premium/i);
    const prof = await runtime.handle(event('JOB_ACT', who.vkUserId, { act: 'prof', p: 'LOGGER' }));
    expect(prof.buttons.length).toBeLessThanOrEqual(5);
    expect(prof.text).toContain('Лесоруб');
    expect(prof.text).not.toContain('logger_logs');
    expect((GAME_COMMANDS as readonly string[]).includes('JOB_ACT')).toBe(true);
    expect((ACTION_MENUS as readonly string[]).includes('work')).toBe(true);
    expect(PROTOTYPE_VERSION).toBe('0.0.11');
    expect(BALANCE_VERSION).toBe('0.0.11');
    expect(JOBS.unlockFlag).toBe('week_1_complete');
  });

  it('progresses from runtime gather after accept', async () => {
    const store = new MemoryGameStore();
    const runtime = new GameRuntime(store);
    const started = await runtime.handle(event('START_GAME', 'job-rt'));
    const who = (await store.findPlayerById(started.state!.playerId!))!;
    await unlock(store, who);
    await store.setFlag(who.id, 'day_1_complete', '1');
    await acceptJobContract(store, who.id, 'logger_logs', new Date());
    await runtime.handle(event('GATHER_WOOD', who.vkUserId));
    const task = await store.getAcceptedJobTask(who.id, 'LOGGER');
    expect(task!.progress).toBeGreaterThan(0);
  });

  it('accept is idempotent on requestId', async () => {
    const store = new MemoryGameStore();
    const who = await player(store, 'job-idemp');
    await unlock(store, who);
    const now = new Date('2026-09-08T12:00:00Z');
    const a = await store.acceptJobTask({ playerId: who.id, templateId: 'logger_logs', now, requestId: 'r1' });
    const b = await store.acceptJobTask({ playerId: who.id, templateId: 'logger_logs', now, requestId: 'r1' });
    expect(a.id).toBe(b.id);
  });

  it('grants player XP without overflowing max job level', () => {
    const who = {
      xp: 0,
      level: 1,
      hp: 100,
      maxHp: 100,
      energy: 20,
      maxEnergy: 20,
    };
    grantPlayerXp(who, 3);
    expect(who.xp).toBe(3);
    expect(jobLevelForXp(5900)).toBe(20);
  });
});
