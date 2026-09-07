import { describe, expect, it } from 'vitest';
import { AbuseGuard } from './abuse-guard';
import { DEFAULT_ABUSE_POLICY, type AbusePolicy } from './abuse-policy';
import { MemoryEphemeralStore, type MemoryBacking, createMemoryBacking } from './memory-ephemeral';
import type { ConsumeWindow, EphemeralStore } from './ephemeral';

function tightPolicy(over: Partial<AbusePolicy> = {}): AbusePolicy {
  return {
    ...DEFAULT_ABUSE_POLICY,
    limits: {
      ...DEFAULT_ABUSE_POLICY.limits,
      GAMEPLAY: { perMinute: 5, minuteTtlMs: 60_000, burst: 5, burstTtlMs: 5_000 },
      READ: { perMinute: 8, minuteTtlMs: 60_000 },
      EXPENSIVE_READ: { perMinute: 3, minuteTtlMs: 60_000 },
      PVP: { perMinute: 2, minuteTtlMs: 60_000 },
      SYSTEM: { perMinute: 4, minuteTtlMs: 60_000 },
      CLAN_MUTATION: { perMinute: 2, minuteTtlMs: 60_000, burst: 2, burstTtlMs: 10_000 },
    },
    callback: { perMinute: 20, minuteTtlMs: 60_000, burst: 20, burstTtlMs: 5_000 },
    ip: { perMinute: 50, minuteTtlMs: 60_000, burst: 50, burstTtlMs: 5_000 },
    ...over,
  };
}

class ThrowingStore extends MemoryEphemeralStore {
  override async consume(): Promise<boolean> {
    throw new Error('ECONNREFUSED redis://:secret@redis:6379');
  }
}

class RecordingStore implements EphemeralStore {
  keys: string[] = [];
  constructor(private readonly inner = new MemoryEphemeralStore()) {}
  async consume(windows: ConsumeWindow[]): Promise<boolean> {
    this.keys.push(...windows.map((window) => window.key));
    return this.inner.consume(windows);
  }
  tryLock(key: string, token: string, ttlMs: number) {
    this.keys.push(key);
    return this.inner.tryLock(key, token, ttlMs);
  }
  unlock(key: string, token: string) {
    return this.inner.unlock(key, token);
  }
  ping() {
    return this.inner.ping();
  }
  close() {
    return this.inner.close();
  }
}

describe('abuse guard', () => {
  it('passes below the command limit and rejects above it', async () => {
    const guard = new AbuseGuard(new MemoryEphemeralStore(), tightPolicy());
    const vk = '1001';
    for (let i = 0; i < 5; i += 1) {
      expect((await guard.allowCommand(vk, { type: 'GATHER_WOOD' })).allowed).toBe(true);
    }
    const denied = await guard.allowCommand(vk, { type: 'GATHER_WOOD' });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.reason).toBe('rate_limit');
    expect(guard.metrics.rateLimitRejected).toBe(1);
  });

  it('does not let gameplay fill the read bucket', async () => {
    const guard = new AbuseGuard(new MemoryEphemeralStore(), tightPolicy());
    for (let i = 0; i < 5; i += 1) {
      await guard.allowCommand('1', { type: 'GATHER_WOOD' });
    }
    expect((await guard.allowCommand('1', { type: 'OPEN_PROFILE' })).allowed).toBe(true);
    expect((await guard.allowCommand('1', { type: 'LEADERBOARD_PAGE' })).allowed).toBe(true);
  });

  it('does not let PvP or clan mutations starve gather', async () => {
    const guard = new AbuseGuard(new MemoryEphemeralStore(), tightPolicy());
    expect((await guard.allowCommand('1', { type: 'START_PVP' })).allowed).toBe(true);
    expect((await guard.allowCommand('1', { type: 'START_PVP' })).allowed).toBe(true);
    expect((await guard.allowCommand('1', { type: 'START_PVP' })).allowed).toBe(false);
    expect((await guard.allowCommand('1', { type: 'CLAN_ACT', payload: { act: 'create' } })).allowed).toBe(true);
    expect((await guard.allowCommand('1', { type: 'GATHER_WOOD' })).allowed).toBe(true);
  });

  it('shares one command limit across two guard instances', async () => {
    const backing: MemoryBacking = createMemoryBacking();
    const policy = tightPolicy({
      limits: {
        ...tightPolicy().limits,
        GAMEPLAY: { perMinute: 10, minuteTtlMs: 60_000 },
      },
    });
    const a = new AbuseGuard(new MemoryEphemeralStore(backing), policy);
    const b = new AbuseGuard(new MemoryEphemeralStore(backing), policy);
    const results = await Promise.all([
      ...Array.from({ length: 50 }, () => a.allowCommand('7', { type: 'CRAFT_ITEM' })),
      ...Array.from({ length: 50 }, () => b.allowCommand('7', { type: 'CRAFT_ITEM' })),
    ]);
    expect(results.filter((d) => d.allowed)).toHaveLength(10);
  });

  it('fail-closes when the store throws and does not leak Redis URLs as success', async () => {
    const guard = new AbuseGuard(new ThrowingStore(), tightPolicy());
    const decision = await guard.allowCommand('1', { type: 'GATHER_WOOD' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('store_error');
    expect(guard.metrics.redisError).toBe(1);
  });

  it('does not consume when disabled', async () => {
    const recording = new RecordingStore();
    const guard = new AbuseGuard(recording, tightPolicy(), false);
    expect((await guard.allowCommand('1', { type: 'GATHER_WOOD' })).allowed).toBe(true);
    expect(recording.keys).toEqual([]);
  });

  it('does not wait on a busy player lock', async () => {
    const store = new MemoryEphemeralStore();
    const guard = new AbuseGuard(store, tightPolicy());
    expect((await guard.tryPlayerLock('9', 'a')).allowed).toBe(true);
    const busy = await guard.tryPlayerLock('9', 'b');
    expect(busy.allowed).toBe(false);
    if (!busy.allowed) expect(busy.reason).toBe('lock_busy');
    await guard.releasePlayerLock('9', 'a');
    expect((await guard.tryPlayerLock('9', 'c')).allowed).toBe(true);
  });

  it('keeps player keys free of raw command text and secrets', async () => {
    const recording = new RecordingStore();
    const guard = new AbuseGuard(recording, tightPolicy());
    await guard.allowCommand('9001', { type: 'GATHER_WOOD' });
    await guard.allowCallbackUser('9001');
    await guard.allowIp('203.0.113.9');
    const dumped = recording.keys.join('\n');
    expect(dumped).toContain('kubolesie:rl:gameplay:vk:9001:m');
    expect(dumped).toContain('kubolesie:rl:callback:vk:9001:m');
    expect(dumped).toContain('kubolesie:rl:ip:203.0.113.9:m');
    expect(dumped).not.toMatch(/GATHER_WOOD|token|secret|password/i);
  });
});
