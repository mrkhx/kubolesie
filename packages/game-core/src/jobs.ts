import {
  JOBS,
  JOB_LABELS,
  JOB_TEMPLATES,
  LEVEL_UP,
  getJobTemplate,
  isJobProfession,
  jobMetricDelta,
  scaledJobCoins,
  scaledJobTarget,
  scaledJobXp,
  templatesFor,
  type JobProfession,
  type JobProgressEvent as ContentJobProgressEvent,
  type JobTemplate,
} from '@kubolesie/content';
import { XP_THRESHOLDS } from '@kubolesie/shared';
import { ActionRejectedError, NotFoundError } from './errors';
import type {
  GameStore,
  JobProgressEvent,
  JobProgressUpdate,
  PlayerJobRecord,
  PlayerJobTaskRecord,
} from './store';

export { isJobProfession, JOB_LABELS, JOBS };

export function isJobsUnlocked(flags: Record<string, string>): boolean {
  return Boolean(flags[JOBS.unlockFlag]);
}

export function grantPlayerXp<
  T extends { xp: number; level: number; hp: number; maxHp: number; energy: number; maxEnergy: number },
>(player: T, amount: number): T {
  const add = Math.max(0, Math.floor(amount));
  if (add <= 0) return player;
  player.xp += add;
  while (player.level < XP_THRESHOLDS.length - 1 && player.xp >= XP_THRESHOLDS[player.level + 1]!) {
    player.level += 1;
    player.maxHp += LEVEL_UP.maxHpGain;
    player.maxEnergy += LEVEL_UP.maxEnergyGain;
    if (LEVEL_UP.fillHpToMax) player.hp = player.maxHp;
    player.energy = Math.min(player.maxEnergy, player.energy + LEVEL_UP.maxEnergyGain);
  }
  return player;
}

export function scaledContract(template: JobTemplate, level: number): {
  target: number;
  coins: number;
  jobXp: number;
  playerXp: number;
} {
  return {
    target: scaledJobTarget(template.target, level),
    coins: scaledJobCoins(template.coins, level),
    jobXp: scaledJobXp(template.jobXp, level),
    playerXp: scaledJobXp(template.playerXp, level),
  };
}

export function offeredContracts(profession: JobProfession, level: number): Array<JobTemplate & {
  target: number;
  coins: number;
  jobXp: number;
  playerXp: number;
}> {
  return templatesFor(profession).map((row) => ({ ...row, ...scaledContract(row, level) }));
}

export async function acceptJobContract(
  store: GameStore,
  playerId: string,
  templateId: string,
  now: Date,
  requestId?: string,
): Promise<PlayerJobTaskRecord> {
  const template = getJobTemplate(templateId);
  if (!template) throw new ActionRejectedError('Нет такого контракта.');
  return store.acceptJobTask({ playerId, templateId, now, requestId });
}

export async function applyJobProgress(
  store: GameStore,
  playerId: string,
  event: JobProgressEvent,
  now: Date = new Date(),
): Promise<JobProgressUpdate[]> {
  return store.progressJobTasks({ playerId, event, now });
}

export function toContentEvent(event: JobProgressEvent): ContentJobProgressEvent {
  return event;
}

export function jobDeltaFor(template: JobTemplate, event: JobProgressEvent): number {
  return jobMetricDelta(template.metric, toContentEvent(event));
}

export async function jobSnapshot(
  store: GameStore,
  playerId: string,
  profession: JobProfession,
): Promise<{ job: PlayerJobRecord | null; accepted: PlayerJobTaskRecord | null; completedToday: PlayerJobTaskRecord[] }> {
  const [job, accepted, tasks] = await Promise.all([
    store.getJob(playerId, profession),
    store.getAcceptedJobTask(playerId, profession),
    store.listJobTasks(playerId, profession),
  ]);
  const today = tasks.filter((row) => row.status === 'COMPLETED');
  return { job, accepted, completedToday: today };
}

export function dailyJobNote(dailyCompletedAfter: number, coins: number): string {
  if (dailyCompletedAfter <= JOBS.dailyFull) return `+${coins} монет.`;
  if (dailyCompletedAfter <= JOBS.dailyReduced) return `+${coins} монет (половина — лимит дня).`;
  return 'Монеты за этот контракт не выданы — дневной лимит.';
}

export function assertJobProfession(value: string): JobProfession {
  if (!isJobProfession(value)) throw new ActionRejectedError('Нет такой профессии.');
  return value;
}

export function requireJobTemplate(id: string): JobTemplate {
  const template = getJobTemplate(id);
  if (!template) throw new NotFoundError('Контракт не найден.');
  return template;
}

export const ALL_JOB_TEMPLATES = JOB_TEMPLATES;
