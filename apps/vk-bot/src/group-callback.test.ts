import { describe, expect, it, vi } from 'vitest';
import { GameRuntime, MemoryGameStore } from '@kubolesie/game-core';
import { AbuseGuard } from './abuse-guard';
import { DEFAULT_ABUSE_POLICY, THROTTLE_TEXT, type AbusePolicy } from './abuse-policy';
import { VkAdapter, type VkLogEntry } from './adapter';
import { parseGameplayEvent } from './callback';
import { RecordingVkApi } from './client';
import type { VkConfig } from './config';
import { GROUP_HELP_TEXT } from './group-chat';
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

describe('A. DM regression', () => {
  it('still starts, names and profiles a player in a direct message', async () => {
    const { adapter, store, client } = boot();
    const started = await adapter.handleCallback(messageNew({ text: 'Старт', eventId: 'dm-start' }));
    expect(started).toEqual({ status: 200, body: 'ok' });
    expect(client.sent[0]!.peerId).toBe(9001);
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.sent[0]!.text).not.toContain('[id9001|игрок]');

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

describe('B–D. group message policy and personal progress', () => {
  it('stays silent on ordinary group chatter', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(groupMessage({ text: 'привет всем', eventId: 'g-hi' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
    expect(await adapter.handleCallback(groupMessage({ text: 'кто сегодня играет?', eventId: 'g-who' }))).toEqual(
      { status: 200, body: 'ok' },
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('starts a player from an addressed group command and replies to the chat peer', async () => {
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
    const player = await store.findPlayerByVkUserId('4242');
    expect(player).not.toBeNull();
    expect(await store.findPlayerByVkUserId(String(GROUP_PEER))).toBeNull();
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    expect(client.sent[0]!.text).toContain('[id4242|игрок]');
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.sent[0]!.text).not.toMatch(/❤️ HP/);
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
    const aWood = (await store.getResources(a.id)).LOG ?? 0;
    const bWood = (await store.getResources(b.id)).LOG ?? 0;
    expect(aWood).toBeGreaterThan(0);
    expect(bWood).toBe(0);

    client.sent.length = 0;
    await adapter.handleCallback(groupMessage({ text: 'Куболесье, профиль', eventId: 'gb-p', userId: 22 }));
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    expect(client.sent[0]!.text).toContain(b.name);
    expect(client.sent[0]!.text).not.toContain(a.id);
  });
});

describe('E–F. group buttons and spoof protection', () => {
  it('applies a group button click only to the clicking user', async () => {
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
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    expect(client.answers[0]).toMatchObject({ userId: 31, peerId: GROUP_PEER });
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

describe('G. duplicate group events', () => {
  it('replays a duplicate group start without a second player', async () => {
    const { adapter, store, client } = boot();
    const body = groupMessage({ text: 'Куболесье, начать', eventId: 'dup-g', userId: 77 });
    const first = await adapter.handleCallback(body);
    const player = (await store.findPlayerByVkUserId('77'))!;
    const energy = player.energy;
    const second = await adapter.handleCallback(body);
    expect(first.body).toBe('ok');
    expect(second.body).toBe('ok');
    expect(client.sent).toHaveLength(2);
    expect(client.sent[0]!.randomId).toBe(client.sent[1]!.randomId);
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    expect(client.sent[1]!.peerId).toBe(GROUP_PEER);
    const again = (await store.findPlayerByVkUserId('77'))!;
    expect(again.id).toBe(player.id);
    expect(again.energy).toBe(energy);
    expect(await store.findProcessedEvent('vk:message_new:dup-g')).not.toBeNull();
  });
});

describe('H–J. self, service and malformed group events', () => {
  it('ignores community/self messages in a group chat', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const bot = await adapter.handleCallback(
      groupMessage({ text: 'Куболесье, начать', userId: -111, eventId: 'self' }),
    );
    const outgoing = await adapter.handleCallback(
      groupMessage({ text: 'Куболесье, начать', out: 1, eventId: 'out' }),
    );
    expect(bot.body).toBe('ok');
    expect(outgoing.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('ignores service/system messages in a group chat', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(
      groupMessage({ text: '', action: { type: 'chat_invite_user' }, eventId: 'svc' }),
    );
    expect(result.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('acks malformed group payloads without throwing', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const badPeer = groupMessage({ text: 'Куболесье, начать', eventId: 'bad-peer' });
    (badPeer.object as { message: Record<string, unknown> }).message.peer_id = 'nope';
    const missing = {
      type: 'message_new',
      event_id: 'no-obj',
      group_id: 111,
      secret: 'test-secret',
      object: {},
    };
    await expect(adapter.handleCallback(badPeer)).resolves.toEqual({ status: 200, body: 'ok' });
    await expect(adapter.handleCallback(missing)).resolves.toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });
});

describe('K. group rate limit is per player, not per chat', () => {
  it('does not block an unrelated player in the same conversation', async () => {
    const abuse = new AbuseGuard(
      new MemoryEphemeralStore(),
      {
        ...DEFAULT_ABUSE_POLICY,
        limits: {
          ...DEFAULT_ABUSE_POLICY.limits,
          SYSTEM: { perMinute: 2, minuteTtlMs: 60_000, burst: 2, burstTtlMs: 5_000 },
        },
        callback: { perMinute: 80, minuteTtlMs: 60_000, burst: 80, burstTtlMs: 5_000 },
        ip: { perMinute: 1_000, minuteTtlMs: 60_000, burst: 1_000, burstTtlMs: 5_000 },
      } satisfies AbusePolicy,
    );
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
    expect(client.sent[0]!.text).not.toBe(THROTTLE_TEXT);
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
  });
});

describe('L. response destination', () => {
  it('sends DM replies to the user and group replies to the conversation peer', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'dest-dm', userId: 9001 }));
    expect(client.sent[0]!.peerId).toBe(9001);
    client.sent.length = 0;
    await adapter.handleCallback(
      groupMessage({ text: 'Куболесье, начать', eventId: 'dest-g', userId: 9002 }),
    );
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
  });
});

describe('group help and mentions', () => {
  it('answers Помощь in a group chat without calling Game Core', async () => {
    const { adapter, runtime, client, store } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(groupMessage({ text: 'Помощь', eventId: 'help-1' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(await store.findPlayerByVkUserId('9001')).toBeNull();
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    expect(client.sent[0]!.text).toBe(GROUP_HELP_TEXT);
    expect(client.sent[0]!.text).toContain('Куболесье, начать');
  });

  it('accepts @kubolesie and club mention prefixes', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(
      groupMessage({ text: '@kubolesie начать', eventId: 'at-1', userId: 81 }),
    );
    expect(await store.findPlayerByVkUserId('81')).not.toBeNull();
    expect(client.sent[0]!.peerId).toBe(GROUP_PEER);
    client.sent.length = 0;
    await adapter.handleCallback(
      groupMessage({
        text: '[club111|Куболесье] профиль',
        eventId: 'club-1',
        userId: 81,
      }),
    );
    expect(client.sent[0]!.text).toMatch(/Путник|игрок/i);
  });
});
