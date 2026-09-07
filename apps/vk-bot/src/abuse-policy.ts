import type { GameCommand, GameCommandType } from '@kubolesie/shared';
import type { ConsumeWindow } from './ephemeral';

export type CommandClass =
  | 'READ'
  | 'GAMEPLAY'
  | 'EXPENSIVE_READ'
  | 'CLAN_MUTATION'
  | 'PVP'
  | 'SYSTEM';

export interface LimitSpec {
  perMinute: number;
  minuteTtlMs: number;
  burst?: number;
  burstTtlMs?: number;
}

export const RATE_LIMIT_KEY_PREFIX = 'kubolesie:rl:';
export const RATE_LIMIT_LOCK_PREFIX = 'kubolesie:lock:';
export const THROTTLE_TEXT = 'Слишком быстро 🙂 Подожди пару секунд.';
export const PLAYER_LOCK_TTL_MS = 4_000;

export const DEFAULT_LIMITS = {
  GAMEPLAY: { perMinute: 30, minuteTtlMs: 60_000, burst: 8, burstTtlMs: 5_000 },
  READ: { perMinute: 60, minuteTtlMs: 60_000 },
  EXPENSIVE_READ: { perMinute: 15, minuteTtlMs: 60_000 },
  CLAN_MUTATION: { perMinute: 10, minuteTtlMs: 60_000, burst: 3, burstTtlMs: 10_000 },
  PVP: { perMinute: 10, minuteTtlMs: 60_000 },
  SYSTEM: { perMinute: 20, minuteTtlMs: 60_000, burst: 8, burstTtlMs: 5_000 },
  callback: { perMinute: 60, minuteTtlMs: 60_000, burst: 15, burstTtlMs: 5_000 },
  ip: { perMinute: 600, minuteTtlMs: 60_000, burst: 120, burstTtlMs: 5_000 },
} as const satisfies Record<CommandClass | 'callback' | 'ip', LimitSpec>;

const CLAN_MUTATIONS = new Set([
  'create',
  'apply',
  'accept',
  'reject',
  'kick',
  'promote',
  'demote',
  'transfer',
  'disband',
  'confirm_disband',
  'leave',
  'donate',
  'claim_task',
  'set_desc',
  'cancel_app',
]);

const CLAN_EXPENSIVE = new Set(['find', 'search', 'list', 'apps']);

const EXPENSIVE_MENUS = new Set(['ratings']);

const READ_TYPES = new Set<GameCommandType>([
  'OPEN_INVENTORY',
  'OPEN_CAMP',
  'OPEN_MENU',
  'OPEN_PROFILE',
  'EXPLORE',
]);

const GAMEPLAY_TYPES = new Set<GameCommandType>([
  'GATHER_WOOD',
  'GATHER_STONE',
  'GATHER_IRON',
  'GATHER_COAL',
  'CRAFT_ITEM',
  'EQUIP_ITEM',
  'USE_ITEM',
  'TALK_NPC',
  'START_PVE',
  'CLAIM_REWARD',
  'OPEN_CRATE',
  'DIALOGUE_CHOICE',
  'INSPECT_TOKEN',
  'BUILD_TEMP_SHELTER',
  'FEED_SCAVENGER',
  'RETURN_IRON',
  'OPEN_SECRET_CHEST',
  'MINE_BLUE_MINERAL',
  'REST_NIGHT',
  'BEGIN_DAY_2',
  'FOUND_CAMP',
  'PLACE_CAMP_TABLE',
  'LIGHT_CAMP',
  'COMPLETE_DAY_2',
  'BEGIN_DAY_3',
  'BEGIN_DAY_4',
  'BEGIN_DAY_5',
  'BEGIN_DAY_6',
  'BEGIN_DAY_7',
  'COMPLETE_DAY_3',
  'COMPLETE_DAY_4',
  'COMPLETE_DAY_5',
  'COMPLETE_DAY_6',
  'COMPLETE_DAY_7',
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
  'FURNACE_ACT',
  'TRADE_ACT',
  'PAY_TRIBUTE',
  'BUILD_BARRICADE',
  'HELP_PET',
  'REPAIR_LANTERN',
  'SALVAGE_ITEM',
  'COSMETIC_ACT',
]);

export interface AbusePolicy {
  limits: Record<CommandClass, LimitSpec>;
  callback: LimitSpec;
  ip: LimitSpec;
  playerLockTtlMs: number;
}

export const DEFAULT_ABUSE_POLICY: AbusePolicy = {
  limits: {
    GAMEPLAY: { ...DEFAULT_LIMITS.GAMEPLAY },
    READ: { ...DEFAULT_LIMITS.READ },
    EXPENSIVE_READ: { ...DEFAULT_LIMITS.EXPENSIVE_READ },
    CLAN_MUTATION: { ...DEFAULT_LIMITS.CLAN_MUTATION },
    PVP: { ...DEFAULT_LIMITS.PVP },
    SYSTEM: { ...DEFAULT_LIMITS.SYSTEM },
  },
  callback: { ...DEFAULT_LIMITS.callback },
  ip: { ...DEFAULT_LIMITS.ip },
  playerLockTtlMs: PLAYER_LOCK_TTL_MS,
};

function envInt(
  env: NodeJS.Dict<string>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function loadAbusePolicy(env: NodeJS.Dict<string> = process.env): AbusePolicy {
  return {
    limits: {
      GAMEPLAY: {
        perMinute: envInt(env, 'RATE_LIMIT_GAMEPLAY_PER_MIN', DEFAULT_LIMITS.GAMEPLAY.perMinute, 1, 10_000),
        minuteTtlMs: 60_000,
        burst: envInt(env, 'RATE_LIMIT_GAMEPLAY_BURST', DEFAULT_LIMITS.GAMEPLAY.burst, 1, 1_000),
        burstTtlMs: envInt(env, 'RATE_LIMIT_GAMEPLAY_BURST_MS', DEFAULT_LIMITS.GAMEPLAY.burstTtlMs, 200, 60_000),
      },
      READ: {
        perMinute: envInt(env, 'RATE_LIMIT_READ_PER_MIN', DEFAULT_LIMITS.READ.perMinute, 1, 10_000),
        minuteTtlMs: 60_000,
      },
      EXPENSIVE_READ: {
        perMinute: envInt(
          env,
          'RATE_LIMIT_EXPENSIVE_READ_PER_MIN',
          DEFAULT_LIMITS.EXPENSIVE_READ.perMinute,
          1,
          10_000,
        ),
        minuteTtlMs: 60_000,
      },
      CLAN_MUTATION: {
        perMinute: envInt(
          env,
          'RATE_LIMIT_CLAN_MUTATION_PER_MIN',
          DEFAULT_LIMITS.CLAN_MUTATION.perMinute,
          1,
          10_000,
        ),
        minuteTtlMs: 60_000,
        burst: envInt(env, 'RATE_LIMIT_CLAN_MUTATION_BURST', DEFAULT_LIMITS.CLAN_MUTATION.burst, 1, 1_000),
        burstTtlMs: envInt(
          env,
          'RATE_LIMIT_CLAN_MUTATION_BURST_MS',
          DEFAULT_LIMITS.CLAN_MUTATION.burstTtlMs,
          200,
          60_000,
        ),
      },
      PVP: {
        perMinute: envInt(env, 'RATE_LIMIT_PVP_PER_MIN', DEFAULT_LIMITS.PVP.perMinute, 1, 10_000),
        minuteTtlMs: 60_000,
      },
      SYSTEM: {
        perMinute: envInt(env, 'RATE_LIMIT_SYSTEM_PER_MIN', DEFAULT_LIMITS.SYSTEM.perMinute, 1, 10_000),
        minuteTtlMs: 60_000,
        burst: envInt(env, 'RATE_LIMIT_SYSTEM_BURST', DEFAULT_LIMITS.SYSTEM.burst, 1, 1_000),
        burstTtlMs: envInt(env, 'RATE_LIMIT_SYSTEM_BURST_MS', DEFAULT_LIMITS.SYSTEM.burstTtlMs, 200, 60_000),
      },
    },
    callback: {
      perMinute: envInt(env, 'RATE_LIMIT_CALLBACK_PER_MIN', DEFAULT_LIMITS.callback.perMinute, 1, 10_000),
      minuteTtlMs: 60_000,
      burst: envInt(env, 'RATE_LIMIT_CALLBACK_BURST', DEFAULT_LIMITS.callback.burst, 1, 1_000),
      burstTtlMs: envInt(env, 'RATE_LIMIT_CALLBACK_BURST_MS', DEFAULT_LIMITS.callback.burstTtlMs, 200, 60_000),
    },
    ip: {
      perMinute: envInt(env, 'RATE_LIMIT_IP_PER_MIN', DEFAULT_LIMITS.ip.perMinute, 10, 100_000),
      minuteTtlMs: 60_000,
      burst: envInt(env, 'RATE_LIMIT_IP_BURST', DEFAULT_LIMITS.ip.burst, 10, 10_000),
      burstTtlMs: envInt(env, 'RATE_LIMIT_IP_BURST_MS', DEFAULT_LIMITS.ip.burstTtlMs, 200, 60_000),
    },
    playerLockTtlMs: envInt(env, 'RATE_LIMIT_PLAYER_LOCK_MS', PLAYER_LOCK_TTL_MS, 500, 15_000),
  };
}

export function classifyCommand(command: GameCommand): CommandClass {
  const type = command.type;
  if (type === 'START_GAME') return 'SYSTEM';
  if (type === 'START_PVP') return 'PVP';
  if (type === 'PVP_ACT') {
    const act = String(command.payload?.act ?? '');
    if (act === 'find' || act === 'claim') return 'PVP';
    return 'EXPENSIVE_READ';
  }
  if (type === 'LEADERBOARD_PAGE') return 'EXPENSIVE_READ';
  if (type === 'CLAN_ACT') {
    const act = String(command.payload?.act ?? '');
    if (CLAN_MUTATIONS.has(act)) return 'CLAN_MUTATION';
    if (CLAN_EXPENSIVE.has(act)) return 'EXPENSIVE_READ';
    return 'READ';
  }
  if (type === 'OPEN_MENU') {
    const menu = String(command.payload?.menu ?? '');
    if (EXPENSIVE_MENUS.has(menu)) return 'EXPENSIVE_READ';
    return 'READ';
  }
  if (READ_TYPES.has(type)) return 'READ';
  if (GAMEPLAY_TYPES.has(type)) return 'GAMEPLAY';
  return 'SYSTEM';
}

export function commandNeedsLock(command: GameCommand): boolean {
  const klass = classifyCommand(command);
  return klass === 'GAMEPLAY' || klass === 'CLAN_MUTATION' || klass === 'PVP' || klass === 'SYSTEM';
}

export function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 64);
  return cleaned.length ? cleaned : 'unknown';
}

export function rlKey(kind: string, id: string, window: 'm' | 'b'): string {
  return `${RATE_LIMIT_KEY_PREFIX}${sanitizeId(kind)}:${sanitizeId(id)}:${window}`;
}

export function lockKey(kind: string, id: string): string {
  return `${RATE_LIMIT_LOCK_PREFIX}${sanitizeId(kind)}:${sanitizeId(id)}`;
}

export function windowsFor(kind: string, id: string, spec: LimitSpec): ConsumeWindow[] {
  const windows: ConsumeWindow[] = [
    { key: rlKey(kind, id, 'm'), limit: spec.perMinute, ttlMs: spec.minuteTtlMs },
  ];
  if (spec.burst && spec.burstTtlMs) {
    windows.push({ key: rlKey(kind, id, 'b'), limit: spec.burst, ttlMs: spec.burstTtlMs });
  }
  return windows;
}

export function classKind(klass: CommandClass): string {
  switch (klass) {
    case 'EXPENSIVE_READ':
      return 'expensive_read';
    case 'CLAN_MUTATION':
      return 'clan_mutation';
    default:
      return klass.toLowerCase();
  }
}

export function assertNoSecretInKey(key: string): void {
  const lower = key.toLowerCase();
  if (lower.includes('token') || lower.includes('secret') || lower.includes('password')) {
    throw new Error('rate-limit key must not contain secrets');
  }
}
