import type { GameCommand } from '@kubolesie/shared';
import type { EphemeralStore } from './ephemeral';
import {
  classKind,
  classifyCommand,
  commandNeedsLock,
  DEFAULT_ABUSE_POLICY,
  lockKey,
  windowsFor,
  type AbusePolicy,
  type CommandClass,
} from './abuse-policy';

export type AbuseReason = 'rate_limit' | 'lock_busy' | 'store_error';

export type AbuseDecision = { allowed: true } | { allowed: false; reason: AbuseReason };

export interface AbuseMetrics {
  callbackReceived: number;
  rateLimitRejected: number;
  duplicateCallback: number;
  redisError: number;
}

export class AbuseGuard {
  readonly metrics: AbuseMetrics = {
    callbackReceived: 0,
    rateLimitRejected: 0,
    duplicateCallback: 0,
    redisError: 0,
  };

  constructor(
    private readonly store: EphemeralStore,
    readonly policy: AbusePolicy = DEFAULT_ABUSE_POLICY,
    readonly enabled = true,
  ) {}

  classify(command: GameCommand): CommandClass {
    return classifyCommand(command);
  }

  needsLock(command: GameCommand): boolean {
    return commandNeedsLock(command);
  }

  async allowCallbackUser(vkUserId: string): Promise<AbuseDecision> {
    this.metrics.callbackReceived += 1;
    return this.consumeKind('callback', `vk:${vkUserId}`, this.policy.callback);
  }

  async allowIp(ip: string): Promise<AbuseDecision> {
    return this.consumeKind('ip', ip, this.policy.ip);
  }

  async allowCommand(vkUserId: string, command: GameCommand): Promise<AbuseDecision> {
    const klass = classifyCommand(command);
    return this.consumeKind(classKind(klass), `vk:${vkUserId}`, this.policy.limits[klass]);
  }

  async tryPlayerLock(vkUserId: string, token: string): Promise<AbuseDecision> {
    if (!this.enabled) return { allowed: true };
    try {
      const ok = await this.store.tryLock(
        lockKey('player', `vk:${vkUserId}`),
        token,
        this.policy.playerLockTtlMs,
      );
      if (!ok) {
        this.metrics.rateLimitRejected += 1;
        return { allowed: false, reason: 'lock_busy' };
      }
      return { allowed: true };
    } catch {
      this.metrics.redisError += 1;
      return { allowed: false, reason: 'store_error' };
    }
  }

  async releasePlayerLock(vkUserId: string, token: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.store.unlock(lockKey('player', `vk:${vkUserId}`), token);
    } catch {
      return;
    }
  }

  noteDuplicate(): void {
    this.metrics.duplicateCallback += 1;
  }

  async ping(): Promise<boolean> {
    try {
      return await this.store.ping();
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  private async consumeKind(
    kind: string,
    id: string,
    spec: AbusePolicy['callback'],
  ): Promise<AbuseDecision> {
    if (!this.enabled) return { allowed: true };
    try {
      const ok = await this.store.consume(windowsFor(kind, id, spec));
      if (!ok) {
        this.metrics.rateLimitRejected += 1;
        return { allowed: false, reason: 'rate_limit' };
      }
      return { allowed: true };
    } catch {
      this.metrics.redisError += 1;
      return { allowed: false, reason: 'store_error' };
    }
  }
}
