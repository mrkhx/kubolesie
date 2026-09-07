import { describe, expect, it, vi } from 'vitest';
import { GameRuntime, MemoryGameStore } from '@kubolesie/game-core';
import { AbuseGuard } from './abuse-guard';
import { DEFAULT_ABUSE_POLICY, THROTTLE_TEXT, type AbusePolicy } from './abuse-policy';
import { VkAdapter, type VkLogEntry } from './adapter';
import { parseGameplayEvent } from './callback';
import { RecordingVkApi } from './client';
import type { VkConfig } from './config';
import {
  GROUP_CONTINUE_IN_DM,
  GROUP_HELP_TEXT,
  GROUP_PROFILE_SENT,
  GROUP_PROFILE_UNAVAILABLE,
} from './group-chat';
import { MemoryEphemeralStore } from './memory-ephemeral';

const CONFIG: VkConfig = {
  groupId: 111,
  groupToken: 'test-token',
  callbackSecret: 'test-secret',
  confirmationCode: 'confirm-code',
  apiVersion: '5.199',
  production: false,
};

const GROUP_PEER = 2_000_000_001;

function messageNew(input: {
  eventId?: string | number;
  userId?: number;
  peerId?: number;
  text?: string;
  payload?: unknown;
  out?: number;
  action?: unknown;
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
        out: input.out ?? 0,
        conversation_message_id: 5,
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(input.action !== undefined ? { action: input.action } : {}),
      },
    },
  };
}

function groupMessage(input: {
  eventId?: string | number;
  userId?: number;
  text?: string;
  payload?: unknown;
  out?: number;
  action?: unknown;
  peerId?: number;
}): Record<string, unknown> {
  return messageNew({
    ...input,
    peerId: input.peerId ?? GROUP_PEER,
    userId: input.userId ?? 9001,
  });
}

function messageEvent(input: {
  eventId?: string | number;
  clickId?: string;
  userId?: number;
  peerId?: number;
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
      peer_id: input.peerId ?? userId,
      event_id: input.clickId ?? 'click-abc',
      payload: input.payload ?? { action: 'OPEN_PROFILE' },
    },
  };
}

function boot(input: { abuse?: AbuseGuard } = {}) {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const client = new RecordingVkApi();
  const logs: VkLogEntry[] = [];
  const adapter = new VkAdapter(runtime, {
    client,
    config: CONFIG,
    log: (entry) => logs.push(entry),
    abuse: input.abuse,
  });
  return { store, runtime, client, adapter, logs };
}

function groupSent(client: RecordingVkApi) {
  return client.sent.filter((row) => row.peerId === GROUP_PEER);
}

function dmSent(client: RecordingVkApi, userId: number) {
  return client.sent.filter((row) => row.peerId === userId);
}

describe('group chat parsing', () => {
  it('does not treat peer_id as the player identity', () => {
    const parsed = parseGameplayEvent(
      groupMessage({ text: 'Куболесье, начать', userId: 4242 }),
      'message_new',
      { groupId: 111 },
    );
    expect(parsed.kind).toBe('command');
    if (parsed.kind !== 'command') return;
    expect(parsed.userId).toBe('4242');
    expect(parsed.peerId).toBe(GROUP_PEER);
    expect(parsed.chat).toBe('group_chat');
    expect(parsed.command.type).toBe('START_GAME');
  });

  it('ignores unaddressed chatter and keeps DM fallback START_GAME', () => {
    const chatter = parseGameplayEvent(groupMessage({ text: 'привет всем' }), 'message_new', {
      groupId: 111,
    });
    expect(chatter.kind).toBe('ignore');
    if (chatter.kind === 'ignore') expect(chatter.reason).toBe('unaddressed');

    const dm = parseGameplayEvent(messageNew({ text: 'привет всем', userId: 9001 }), 'message_new');
    expect(dm.kind).toBe('command');
    if (dm.kind === 'command') expect(dm.command.type).toBe('START_GAME');
  });
});

describe('DM regression', () => {
  it('still starts, names and profiles a player in a direct message', async () => {
    const { adapter, store, client } = boot();
    const started = await adapter.handleCallback(messageNew({ text: 'Старт', eventId: 'dm-start' }));
    expect(started).toEqual({ status: 200, body: 'ok' });
    expect(client.sent[0]!.peerId).toBe(9001);
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.sent[0]!.text).not.toContain('отправляется в Куболесье');

    client.sent.length = 0;
    await adapter.handleCallback(messageNew({ text: 'Начать', eventId: 'dm-nachat' }));
    expect(client.sent[0]!.peerId).toBe(9001);

    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({ eventId: 'dm-name', payload: { action: 'PROMPT_HERO_NAME' } }),
    );
    expect(client.sent[0]!.text).toMatch(/звать/);
    client.sent.length = 0;
    await adapter.handleCallback(messageNew({ text: 'Виктор', eventId: 'dm-set' }));
    expect((await store.findPlayerByVkUserId('9001'))!.name).toBe('Виктор');

    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({ eventId: 'dm-prof', payload: { action: 'OPEN_PROFILE' } }),
    );
    expect(client.sent[0]!.text).toContain('Виктор');
    expect(client.sent[0]!.peerId).toBe(9001);
  });
});

describe('group start routes gameplay to DM', () => {
  it('posts one compact group notice and sends the game screen to DM', async () => {
    const { adapter, store, client, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(
      groupMessage({ text: 'Куболесье, начать', eventId: 'g-start', userId: 4242 }),
    );
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ providerUserId: '4242' }),
        command: expect.objectContaining({ type: 'START_GAME' }),
      }),
    );
    expect(await store.findPlayerByVkUserId('4242')).not.toBeNull();
    expect(await store.findPlayerByVkUserId(String(GROUP_PEER))).toBeNull();

    const notice = groupSent(client);
    expect(notice).toHaveLength(1);
    expect(notice[0]!.text).toContain('отправляется в Куболесье');
    expect(notice[0]!.text).toContain('личных сообщениях');
    expect(notice[0]!.text).not.toContain('приходишь в себя');
    expect(notice[0]!.text).not.toMatch(/❤️ HP/);
    expect(notice[0]!.keyboard?.buttons[0]?.[0]?.action).toMatchObject({
      type: 'open_link',
      label: '✉ Продолжить в личке',
      link: 'https://vk.me/club111',
    });

    const dm = dmSent(client, 4242);
    expect(dm).toHaveLength(1);
    expect(dm[0]!.text).toContain('приходишь в себя');
    expect(dm[0]!.keyboard?.buttons.length).toBeGreaterThan(0);
    expect(JSON.stringify(dm[0]!.keyboard)).toMatch(/OPEN_CRATE|📦/);
  });

  it('keeps two players in the same chat on separate progress', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, начать', eventId: 'ga', userId: 11 }));
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, начать', eventId: 'gb', userId: 22 }));
    const a = (await store.findPlayerByVkUserId('11'))!;
    const b = (await store.findPlayerByVkUserId('22'))!;
    expect(a.id).not.toBe(b.id);

    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'ga-wood',
        userId: 11,
        peerId: GROUP_PEER,
        payload: { action: 'GATHER_WOOD' },
      }),
    );
    expect((await store.getResources(a.id)).LOG ?? 0).toBeGreaterThan(0);
    expect((await store.getResources(b.id)).LOG ?? 0).toBe(0);
    expect(groupSent(client)).toHaveLength(0);
    expect(dmSent(client, 11)[0]!.peerId).toBe(11);
    expect(dmSent(client, 11)[0]!.text.length).toBeGreaterThan(0);
  });
});

describe('group buttons route to DM', () => {
  it('mutates only the clicking player and never posts gameplay in the group', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'ea', userId: 31 }));
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'eb', userId: 32 }));
    const a = (await store.findPlayerByVkUserId('31'))!;
    const b = (await store.findPlayerByVkUserId('32'))!;
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'click-a',
        userId: 31,
        peerId: GROUP_PEER,
        payload: { action: 'GATHER_WOOD', vkUserId: '32' },
      }),
    );
    expect((await store.getResources(a.id)).LOG ?? 0).toBeGreaterThan(0);
    expect((await store.getResources(b.id)).LOG ?? 0).toBe(0);
    expect(groupSent(client)).toHaveLength(0);
    expect(dmSent(client, 31)).toHaveLength(1);
    expect(client.answers[0]).toMatchObject({ userId: 31, peerId: GROUP_PEER });
  });

  it('routes an old group gameplay button to DM', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'old-s', userId: 44 }));
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'old-btn',
        userId: 44,
        peerId: GROUP_PEER,
        payload: { action: 'OPEN_CRATE' },
      }),
    );
    expect(groupSent(client)).toHaveLength(0);
    expect(dmSent(client, 44)[0]!.text.length).toBeGreaterThan(0);
    expect(dmSent(client, 44)[0]!.keyboard?.buttons.length).toBeGreaterThan(0);
  });

  it('does not send a callback destined at another user DM', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(
      messageEvent({
        eventId: 'spoof-dm',
        userId: 31,
        peerId: 32,
        payload: { action: 'GATHER_WOOD' },
      }),
    );
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });
});

describe('group profile and help', () => {
  it('sends the profile to DM and a short notice to the group', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'p-s', userId: 55 }));
    client.sent.length = 0;
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, профиль', eventId: 'p-1', userId: 55 }));
    expect(dmSent(client, 55)[0]!.text).toMatch(/Путник|Уровень/);
    expect(groupSent(client)).toHaveLength(1);
    expect(groupSent(client)[0]!.text).toBe(GROUP_PROFILE_SENT);
    expect(groupSent(client)[0]!.text).not.toMatch(/PvP|инвентар/i);
  });

  it('answers Помощь in a group chat without calling Game Core', async () => {
    const { adapter, runtime, client, store } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(groupMessage({ text: 'Помощь', eventId: 'help-1' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(await store.findPlayerByVkUserId('9001')).toBeNull();
    expect(groupSent(client)[0]!.text).toBe(GROUP_HELP_TEXT);
    expect(groupSent(client)[0]!.text).toContain('чат-RPG');
    expect(dmSent(client, 9001)).toHaveLength(0);
  });
});

describe('duplicate group events', () => {
  it('replays a duplicate group start without a second mutation or extra DM', async () => {
    const { adapter, store, client } = boot();
    const body = groupMessage({ text: 'Куболесье, начать', eventId: 'dup-g', userId: 77 });
    const first = await adapter.handleCallback(body);
    const player = (await store.findPlayerByVkUserId('77'))!;
    const energy = player.energy;
    const groupRandom = groupSent(client)[0]!.randomId;
    const dmRandom = dmSent(client, 77)[0]!.randomId;
    const second = await adapter.handleCallback(body);
    expect(first.body).toBe('ok');
    expect(second.body).toBe('ok');
    expect(groupSent(client)).toHaveLength(2);
    expect(dmSent(client, 77)).toHaveLength(2);
    expect(groupSent(client)[1]!.randomId).toBe(groupRandom);
    expect(dmSent(client, 77)[1]!.randomId).toBe(dmRandom);
    const again = (await store.findPlayerByVkUserId('77'))!;
    expect(again.id).toBe(player.id);
    expect(again.energy).toBe(energy);
    expect(await store.findProcessedEvent('vk:message_new:dup-g')).not.toBeNull();
  });
});

describe('self, service, chatter and malformed', () => {
  it('stays silent on ordinary group chatter', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(groupMessage({ text: 'привет всем', eventId: 'g-hi' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('ignores community/self and service messages in a group chat', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, начать', userId: -111, eventId: 'self' }));
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, начать', out: 1, eventId: 'out' }));
    await adapter.handleCallback(
      groupMessage({ text: '', action: { type: 'chat_invite_user' }, eventId: 'svc' }),
    );
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('acks malformed group payloads without throwing', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const badPeer = groupMessage({ text: 'Куболесье, начать', eventId: 'bad-peer' });
    (badPeer.object as { message: Record<string, unknown> }).message.peer_id = 'nope';
    await expect(adapter.handleCallback(badPeer)).resolves.toEqual({ status: 200, body: 'ok' });
    await expect(
      adapter.handleCallback({
        type: 'message_new',
        event_id: 'no-obj',
        group_id: 111,
        secret: 'test-secret',
        object: {},
      }),
    ).resolves.toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });
});

describe('DM unavailable fallback', () => {
  it('keeps a compact group fallback when the community cannot DM the player', async () => {
    const { adapter, store, client } = boot();
    client.failPeerCodes.set(88, 901);
    const result = await adapter.handleCallback(
      groupMessage({ text: 'Начать', eventId: 'no-dm', userId: 88 }),
    );
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(await store.findPlayerByVkUserId('88')).not.toBeNull();
    expect(dmSent(client, 88)).toHaveLength(0);
    const group = groupSent(client);
    expect(group.some((row) => row.text.includes('отправляется в Куболесье'))).toBe(true);
    const fallback = group.find((row) => row.text.includes('открой личные сообщения'));
    expect(fallback).toBeDefined();
    expect(fallback!.keyboard?.buttons[0]?.[0]?.action).toMatchObject({
      type: 'open_link',
      label: '✉ Открыть Куболесье',
      link: 'https://vk.me/club111',
    });
  });

  it('falls back compactly when a group gameplay button cannot DM', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'fb-s', userId: 99 }));
    const player = (await store.findPlayerByVkUserId('99'))!;
    client.sent.length = 0;
    client.failPeerCodes.set(99, 901);
    await adapter.handleCallback(
      messageEvent({
        eventId: 'fb-wood',
        userId: 99,
        peerId: GROUP_PEER,
        payload: { action: 'GATHER_WOOD' },
      }),
    );
    expect((await store.getResources(player.id)).LOG ?? 0).toBeGreaterThan(0);
    expect(dmSent(client, 99)).toHaveLength(0);
    expect(groupSent(client)).toHaveLength(1);
    expect(groupSent(client)[0]!.text).toBe(GROUP_CONTINUE_IN_DM);
    expect(groupSent(client)[0]!.keyboard?.buttons[0]?.[0]?.action).toMatchObject({
      type: 'open_link',
      label: '✉ Открыть Куболесье',
      link: 'https://vk.me/club111',
    });
  });

  it('tells the player to open DMs when profile cannot be delivered', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(groupMessage({ text: 'начать', eventId: 'pu-s', userId: 70 }));
    client.sent.length = 0;
    client.failPeerCodes.set(70, 901);
    await adapter.handleCallback(groupMessage({ text: 'профиль', eventId: 'pu-1', userId: 70 }));
    expect(groupSent(client)[0]!.text).toBe(GROUP_PROFILE_UNAVAILABLE);
    expect(dmSent(client, 70)).toHaveLength(0);
    expect(groupSent(client)[0]!.keyboard?.buttons[0]?.[0]?.action).toMatchObject({
      type: 'open_link',
      label: '✉ Открыть Куболесье',
      link: 'https://vk.me/club111',
    });
  });

  it('still DMs gameplay if the group notice send fails', async () => {
    const { adapter, store, client } = boot();
    client.failPeerCodes.set(GROUP_PEER, 10);
    const result = await adapter.handleCallback(
      groupMessage({ text: 'Начать', eventId: 'group-fail', userId: 61 }),
    );
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(await store.findPlayerByVkUserId('61')).not.toBeNull();
    expect(groupSent(client)).toHaveLength(0);
    expect(dmSent(client, 61)[0]!.text).toContain('приходишь в себя');
  });
});

describe('rate limit is per player, not per chat', () => {
  it('does not block an unrelated player in the same conversation', async () => {
    const abuse = new AbuseGuard(new MemoryEphemeralStore(), {
      ...DEFAULT_ABUSE_POLICY,
      limits: {
        ...DEFAULT_ABUSE_POLICY.limits,
        SYSTEM: { perMinute: 2, minuteTtlMs: 60_000, burst: 2, burstTtlMs: 5_000 },
      },
      callback: { perMinute: 80, minuteTtlMs: 60_000, burst: 80, burstTtlMs: 5_000 },
      ip: { perMinute: 1_000, minuteTtlMs: 60_000, burst: 1_000, burstTtlMs: 5_000 },
    } satisfies AbusePolicy);
    const { adapter, client, store } = boot({ abuse });
    for (let i = 0; i < 8; i += 1) {
      await adapter.handleCallback(
        groupMessage({ text: 'Куболесье, начать', eventId: `flood-a-${i}`, userId: 501 }),
      );
    }
    const throttled = client.sent.filter((m) => m.text === THROTTLE_TEXT);
    expect(throttled.length).toBeGreaterThan(0);
    client.sent.length = 0;
    const other = await adapter.handleCallback(
      groupMessage({ text: 'Куболесье, начать', eventId: 'flood-b', userId: 502 }),
    );
    expect(other).toEqual({ status: 200, body: 'ok' });
    expect(await store.findPlayerByVkUserId('502')).not.toBeNull();
    expect(dmSent(client, 502)[0]!.text).toContain('приходишь в себя');
    expect(groupSent(client).some((row) => row.text.includes('отправляется'))).toBe(true);
  });
});

describe('response destination', () => {
  it('sends DM-originated replies only to the user', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'dest-dm', userId: 9001 }));
    expect(client.sent.every((row) => row.peerId === 9001)).toBe(true);
  });
});
