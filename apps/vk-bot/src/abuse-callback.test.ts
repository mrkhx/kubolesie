import { describe, expect, it } from 'vitest';
import { GameRuntime, MemoryGameStore } from '@kubolesie/game-core';
import { STARTING_ENERGY } from '@kubolesie/shared';
import { AbuseGuard } from './abuse-guard';
import {
  DEFAULT_ABUSE_POLICY,
  THROTTLE_TEXT,
  type AbusePolicy,
} from './abuse-policy';
import { VkAdapter, type VkLogEntry } from './adapter';
import { RecordingVkApi } from './client';
import { MemoryEphemeralStore, createMemoryBacking } from './memory-ephemeral';
import type { ConsumeWindow, EphemeralStore } from './ephemeral';
import type { VkConfig } from './config';

const CONFIG: VkConfig = {
  groupId: 111,
  groupToken: 'test-token',
  callbackSecret: 'test-secret',
  confirmationCode: 'confirm-code',
  apiVersion: '5.199',
  production: false,
};

function messageNew(input: {
  eventId?: string | number;
  userId?: number;
  peerId?: number;
  text?: string;
  payload?: unknown;
  secret?: string;
  groupId?: number;
}): Record<string, unknown> {
  const userId = input.userId ?? 9001;
  return {
    type: 'message_new',
    event_id: input.eventId ?? 'evt-new-1',
    group_id: input.groupId ?? 111,
    secret: input.secret ?? 'test-secret',
    object: {
      message: {
        id: 17,
        date: 1,
        peer_id: input.peerId ?? userId,
        from_id: userId,
        text: input.text ?? '',
        out: 0,
        conversation_message_id: 5,
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      },
    },
  };
}

function messageEvent(input: {
  eventId?: string | number;
  clickId?: string;
  userId?: number;
  payload?: unknown;
}): Record<string, unknown> {
  const userId = input.userId ?? 9001;
  return {
    type: 'message_event',
    event_id: input.eventId ?? 'evt-click-1',
    group_id: 111,
    secret: 'test-secret',
    object: {
      user_id: userId,
      peer_id: userId,
      event_id: input.clickId ?? 'click-abc',
      payload: input.payload ?? { action: 'GATHER_WOOD' },
    },
  };
}

function policy(over: Partial<AbusePolicy> = {}): AbusePolicy {
  return {
    ...DEFAULT_ABUSE_POLICY,
    limits: {
      ...DEFAULT_ABUSE_POLICY.limits,
      GAMEPLAY: { perMinute: 8, minuteTtlMs: 60_000, burst: 8, burstTtlMs: 5_000 },
      READ: { perMinute: 10, minuteTtlMs: 60_000 },
      EXPENSIVE_READ: { perMinute: 4, minuteTtlMs: 60_000 },
      SYSTEM: { perMinute: 5, minuteTtlMs: 60_000, burst: 5, burstTtlMs: 5_000 },
      PVP: { perMinute: 3, minuteTtlMs: 60_000 },
      CLAN_MUTATION: { perMinute: 3, minuteTtlMs: 60_000, burst: 3, burstTtlMs: 10_000 },
    },
    callback: { perMinute: 80, minuteTtlMs: 60_000, burst: 80, burstTtlMs: 5_000 },
    ip: { perMinute: 1_000, minuteTtlMs: 60_000, burst: 1_000, burstTtlMs: 5_000 },
    playerLockTtlMs: 4_000,
    ...over,
  };
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

function boot(input: { abuse?: AbuseGuard; store?: MemoryGameStore } = {}) {
  const gameStore = input.store ?? new MemoryGameStore();
  const runtime = new GameRuntime(gameStore);
  const client = new RecordingVkApi();
  const logs: VkLogEntry[] = [];
  const adapter = new VkAdapter(runtime, {
    client,
    config: CONFIG,
    log: (entry) => logs.push(entry),
    abuse: input.abuse,
  });
  return { gameStore, runtime, client, adapter, logs };
}

describe('callback anti-abuse', () => {
  it('limits a flood of distinct message_new events and always ACKs 200', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        callback: { perMinute: 8, minuteTtlMs: 60_000, burst: 8, burstTtlMs: 5_000 },
      }),
    );
    const { adapter, client, gameStore } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'boot' }));
    client.sent.length = 0;
    const results = [];
    for (let i = 0; i < 50; i += 1) {
      results.push(
        await adapter.handleCallback(
          messageNew({ text: 'рубить', eventId: `flood-${i}`, userId: 9001 }),
        ),
      );
    }
    expect(results.every((r) => r.status === 200 && r.body === 'ok')).toBe(true);
    const throttled = client.sent.filter((m) => m.text === THROTTLE_TEXT);
    const played = client.sent.filter((m) => m.text !== THROTTLE_TEXT);
    expect(played.length).toBeLessThanOrEqual(8);
    expect(throttled.length).toBeGreaterThan(30);
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    const wood = (await gameStore.getResources(player.id)).LOG ?? 0;
    expect(wood).toBeGreaterThan(0);
    expect(wood).toBeLessThan(50 * 6);
    let processed = 0;
    for (let i = 0; i < 50; i += 1) {
      if (await gameStore.findProcessedEvent(`vk:message_new:flood-${i}`)) processed += 1;
    }
    expect(processed).toBeLessThanOrEqual(8);
    expect(processed).toBeGreaterThan(0);
  });

  it('does not count a duplicate processed callback as new gameplay spam', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        limits: {
          ...policy().limits,
          SYSTEM: { perMinute: 2, minuteTtlMs: 60_000 },
        },
      }),
    );
    const { adapter, client, gameStore } = boot({ abuse });
    const body = messageNew({ text: 'начать', eventId: 'dup-keep' });
    expect(await adapter.handleCallback(body)).toEqual({ status: 200, body: 'ok' });
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    for (let i = 0; i < 5; i += 1) {
      expect(await adapter.handleCallback(body)).toEqual({ status: 200, body: 'ok' });
    }
    const again = (await gameStore.findPlayerByVkUserId('9001'))!;
    expect(again.id).toBe(player.id);
    expect(again.energy).toBe(energy);
    expect(abuse.metrics.duplicateCallback).toBe(5);
    expect(client.sent.length).toBeGreaterThan(1);
    expect(client.sent.every((m) => m.text !== THROTTLE_TEXT)).toBe(true);
  });

  it('does not create extra players or reset progress on START_GAME spam', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), policy());
    const { adapter, gameStore } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'start-0' }));
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    const coins = player.coins;
    for (let i = 1; i < 100; i += 1) {
      const result = await adapter.handleCallback(messageNew({ text: 'начать', eventId: `start-${i}` }));
      expect(result.status).toBe(200);
    }
    const again = (await gameStore.findPlayerByVkUserId('9001'))!;
    expect(again.id).toBe(player.id);
    expect(again.energy).toBe(energy);
    expect(again.coins).toBe(coins);
    expect(again.level).toBe(player.level);
    let processed = 0;
    for (let i = 0; i < 100; i += 1) {
      if (await gameStore.findProcessedEvent(`vk:message_new:start-${i}`)) processed += 1;
    }
    expect(processed).toBeLessThanOrEqual(5);
    expect(processed).toBeGreaterThanOrEqual(1);
  });

  it('rate-limits unknown text without draining energy', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), policy());
    const { adapter, gameStore, client } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'unk-boot' }));
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    expect(player.energy).toBe(STARTING_ENERGY);
    client.sent.length = 0;
    for (let i = 0; i < 40; i += 1) {
      await adapter.handleCallback(
        messageNew({ text: `qwerty-unknown-${i}`, eventId: `unk-${i}` }),
      );
    }
    const again = (await gameStore.findPlayerByVkUserId('9001'))!;
    expect(again.energy).toBe(STARTING_ENERGY);
    expect(again.id).toBe(player.id);
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(true);
  });

  it('does not explode processed_events on random event_id flood', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        callback: { perMinute: 6, minuteTtlMs: 60_000, burst: 6, burstTtlMs: 5_000 },
      }),
    );
    const { adapter, gameStore } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'rand-boot' }));
    for (let i = 0; i < 80; i += 1) {
      await adapter.handleCallback(messageNew({ text: 'рубить', eventId: `rand-${i}` }));
    }
    let processed = 0;
    for (let i = 0; i < 80; i += 1) {
      if (await gameStore.findProcessedEvent(`vk:message_new:rand-${i}`)) processed += 1;
    }
    expect(processed).toBeLessThanOrEqual(6);
  });

  it('button-mash of one gather command never goes negative and starts throttling', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), policy());
    const { adapter, gameStore, client } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'mash-boot' }));
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    for (let i = 0; i < 20; i += 1) {
      const result = await adapter.handleCallback(
        messageEvent({ eventId: `mash-${i}`, clickId: `c-${i}`, payload: { action: 'GATHER_WOOD' } }),
      );
      expect(result).toEqual({ status: 200, body: 'ok' });
    }
    const wood = (await gameStore.getResources(player.id)).LOG ?? 0;
    expect(wood).toBeGreaterThan(0);
    expect(wood).toBeLessThan(20 * 6);
    let processed = 0;
    for (let i = 0; i < 20; i += 1) {
      if (await gameStore.findProcessedEvent(`vk:message_event:mash-${i}`)) processed += 1;
    }
    expect(processed).toBeLessThanOrEqual(8);
    expect(processed).toBeGreaterThan(0);
    expect(player.energy).toBeGreaterThanOrEqual(0);
    expect((await gameStore.findPlayerByVkUserId('9001'))!.energy).toBeGreaterThanOrEqual(0);
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(true);
  });

  it('read spam hits the read limiter without mutating gameplay state', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        limits: {
          ...policy().limits,
          READ: { perMinute: 6, minuteTtlMs: 60_000 },
        },
      }),
    );
    const { adapter, gameStore, client } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'read-boot' }));
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    const coins = player.coins;
    const wood = (await gameStore.getResources(player.id)).LOG ?? 0;
    for (let i = 0; i < 100; i += 1) {
      await adapter.handleCallback(
        messageEvent({
          eventId: `prof-${i}`,
          clickId: `p-${i}`,
          payload: { action: 'OPEN_PROFILE' },
        }),
      );
    }
    const again = (await gameStore.findPlayerByVkUserId('9001'))!;
    expect(again.energy).toBe(energy);
    expect(again.coins).toBe(coins);
    expect((await gameStore.getResources(player.id)).LOG ?? 0).toBe(wood);
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(true);
  });

  it('does not block confirmation even under a tight callback limit', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        callback: { perMinute: 1, minuteTtlMs: 60_000, burst: 1, burstTtlMs: 5_000 },
      }),
    );
    const { adapter } = boot({ abuse });
    for (let i = 0; i < 20; i += 1) {
      const result = await adapter.handleCallback({
        type: 'confirmation',
        group_id: 111,
        secret: 'test-secret',
      });
      expect(result).toEqual({ status: 200, body: 'confirm-code' });
    }
  });

  it('does not pollute player keys on unauthenticated callbacks', async () => {
    const recording = new RecordingStore();
    const abuse = new AbuseGuard(recording, policy());
    const { adapter } = boot({ abuse });
    const result = await adapter.handleCallback(
      messageNew({ text: 'начать', eventId: 'nope', secret: 'wrong-secret' }),
    );
    expect(result.status).toBe(403);
    expect(recording.keys).toEqual([]);
  });

  it('still rejects tampered payloads without executing gameplay', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), policy());
    const { adapter, gameStore, client } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'tamp-boot' }));
    const player = (await gameStore.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    const result = await adapter.handleCallback(
      messageEvent({
        eventId: 'tamp-1',
        payload: { action: 'GRANT_PREMIUM', nested: { x: 1 } },
      }),
    );
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect((await gameStore.findPlayerByVkUserId('9001'))!.energy).toBe(energy);
    expect(client.sent.some((m) => m.text === 'Сейчас это сделать нельзя.')).toBe(true);
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(false);
  });

  it('never returns HTTP 429 to VK when the user is throttled', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        callback: { perMinute: 1, minuteTtlMs: 60_000, burst: 1, burstTtlMs: 5_000 },
      }),
    );
    const { adapter, client } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'n429-0' }));
    const second = await adapter.handleCallback(messageNew({ text: 'рубить', eventId: 'n429-1' }));
    expect(second.status).toBe(200);
    expect(second.body).toBe('ok');
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(true);
  });

  it('fail-closes store errors without running gameplay or returning 429', async () => {
    const inner = new MemoryEphemeralStore();
    const broken: EphemeralStore = {
      consume: async () => {
        throw new Error('ECONNREFUSED redis://:hunter2@redis:6379');
      },
      tryLock: inner.tryLock.bind(inner),
      unlock: inner.unlock.bind(inner),
      ping: async () => false,
      close: async () => undefined,
    };
    const abuse = new AbuseGuard(broken, policy());
    const { adapter, gameStore, logs } = boot({ abuse });
    const result = await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'down-1' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(await gameStore.findPlayerByVkUserId('9001')).toBeNull();
    const dumped = JSON.stringify(logs);
    expect(dumped).not.toContain('hunter2');
    expect(dumped).not.toContain('redis://');
  });

  it('does not log secrets, tokens or raw player text on a throttled path', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      policy({
        callback: { perMinute: 1, minuteTtlMs: 60_000, burst: 1, burstTtlMs: 5_000 },
      }),
    );
    const { adapter, logs } = boot({ abuse });
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'log-0' }));
    await adapter.handleCallback(
      messageNew({ text: 'секретный монолог игрока', eventId: 'log-1' }),
    );
    const dumped = JSON.stringify(logs);
    expect(dumped).not.toContain('test-token');
    expect(dumped).not.toContain('test-secret');
    expect(dumped).not.toContain('confirm-code');
    expect(dumped).not.toContain('секретный монолог игрока');
    expect(dumped).toContain('rate_limited');
  });

  it('uses one shared limiter across two adapters (two instances)', async () => {
    const backing = createMemoryBacking();
    const sharedPolicy = policy({
      callback: { perMinute: 10, minuteTtlMs: 60_000, burst: 10, burstTtlMs: 5_000 },
    });
    const a = boot({ abuse: new AbuseGuard(new MemoryEphemeralStore(backing), sharedPolicy) });
    const b = boot({
      abuse: new AbuseGuard(new MemoryEphemeralStore(backing), sharedPolicy),
      store: a.gameStore,
    });
    await a.adapter.handleCallback(messageNew({ text: 'начать', eventId: 'two-boot', userId: 4242 }));
    for (let i = 0; i < 20; i += 1) {
      const adapter = i % 2 === 0 ? a.adapter : b.adapter;
      await adapter.handleCallback(
        messageNew({ text: 'рубить', eventId: `two-${i}`, userId: 4242 }),
      );
    }
    const player = (await a.gameStore.findPlayerByVkUserId('4242'))!;
    const wood = (await a.gameStore.getResources(player.id)).LOG ?? 0;
    expect(wood).toBeGreaterThan(0);
    let processed = 0;
    for (let i = 0; i < 20; i += 1) {
      if (await a.gameStore.findProcessedEvent(`vk:message_new:two-${i}`)) processed += 1;
    }
    expect(processed).toBeLessThanOrEqual(10);
    expect(processed).toBeGreaterThan(0);
  });

  it('does not break a short Day 1 session under default limits', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), DEFAULT_ABUSE_POLICY);
    const { adapter, gameStore, client } = boot({ abuse });
    expect(await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'd1-start' }))).toEqual({
      status: 200,
      body: 'ok',
    });
    expect(
      await adapter.handleCallback(messageEvent({ eventId: 'd1-prof', payload: { action: 'OPEN_PROFILE' } })),
    ).toEqual({ status: 200, body: 'ok' });
    expect(await adapter.handleCallback(messageNew({ text: 'рубить', eventId: 'd1-wood' }))).toEqual({
      status: 200,
      body: 'ok',
    });
    expect(await adapter.handleCallback(messageNew({ text: 'герой', eventId: 'd1-hero' }))).toEqual({
      status: 200,
      body: 'ok',
    });
    const player = await gameStore.findPlayerByVkUserId('9001');
    expect(player).not.toBeNull();
    expect((await gameStore.getResources(player!.id)).LOG ?? 0).toBeGreaterThan(0);
    expect(client.sent.some((m) => m.text === THROTTLE_TEXT)).toBe(false);
  });
});
