import { describe, expect, it, vi } from 'vitest';
import { GameRuntime, MemoryGameStore } from '@kubolesie/game-core';
import { VkAdapter, type VkLogEntry } from './adapter';
import {
  internalEventId,
  parseGameplayEvent,
  secretsEqual,
  verifyCallbackAuth,
  verifyConfirmation,
} from './callback';
import { RecordingVkApi } from './client';
import { callbackPayload, commandFromText } from './commands';
import { loadVkConfig, type VkConfig } from './config';
import { decodeButtonPayload } from './payload';

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
  out?: number;
  cmid?: number;
  id?: number;
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
        id: input.id ?? 17,
        date: 1,
        peer_id: input.peerId ?? userId,
        from_id: userId,
        text: input.text ?? '',
        out: input.out ?? 0,
        conversation_message_id: input.cmid ?? 5,
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
        ...(input.action !== undefined ? { action: input.action } : {}),
      },
    },
  };
}

function messageEvent(input: {
  eventId?: string | number;
  clickId?: string;
  userId?: number;
  peerId?: number;
  payload?: unknown;
  secret?: string;
  groupId?: number;
}): Record<string, unknown> {
  const userId = input.userId ?? 9001;
  return {
    type: 'message_event',
    event_id: input.eventId ?? 'evt-click-1',
    group_id: input.groupId ?? 111,
    secret: input.secret ?? 'test-secret',
    object: {
      user_id: userId,
      peer_id: input.peerId ?? userId,
      event_id: input.clickId ?? 'click-abc',
      payload: input.payload ?? { action: 'OPEN_PROFILE' },
    },
  };
}

function boot() {
  const store = new MemoryGameStore();
  const runtime = new GameRuntime(store);
  const client = new RecordingVkApi();
  const logs: VkLogEntry[] = [];
  const adapter = new VkAdapter(runtime, {
    client,
    config: CONFIG,
    log: (entry) => logs.push(entry),
  });
  return { store, runtime, client, adapter, logs };
}

describe('vk confirmation and auth', () => {
  it('returns the confirmation code for a matching group without secret', async () => {
    const { adapter } = boot();
    const result = await adapter.handleCallback({
      type: 'confirmation',
      group_id: 111,
    });
    expect(result).toEqual({ status: 200, body: 'confirm-code' });
  });

  it('confirms a production callback URL from the real VK payload without secret', async () => {
    const runtime = new GameRuntime(new MemoryGameStore());
    const handle = vi.spyOn(runtime, 'handle');
    const adapter = new VkAdapter(runtime, {
      config: { ...CONFIG, production: true, groupId: 235505485 },
      client: new RecordingVkApi(),
      log: () => undefined,
    });
    const result = await adapter.handleCallback({ type: 'confirmation', group_id: 235505485 });
    expect(result).toEqual({ status: 200, body: 'confirm-code' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects confirmation with a wrong group_id', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback({ type: 'confirmation', group_id: 999 });
    expect(result.status).toBe(403);
    expect(result.body).toBe('forbidden');
    expect(handle).not.toHaveBeenCalled();
  });

  it('ignores a present secret on confirmation', async () => {
    const { adapter } = boot();
    const withSecret = await adapter.handleCallback({
      type: 'confirmation',
      group_id: 111,
      secret: 'nope',
    });
    expect(withSecret).toEqual({ status: 200, body: 'confirm-code' });
  });

  it('fails closed when confirmation code is missing', async () => {
    const runtime = new GameRuntime(new MemoryGameStore());
    const adapter = new VkAdapter(runtime, {
      config: { ...CONFIG, confirmationCode: null },
      client: new RecordingVkApi(),
      log: () => undefined,
    });
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback({ type: 'confirmation', group_id: 111 });
    expect(result.status).toBe(503);
    expect(result.body).toBe('forbidden');
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects a wrong callback secret without calling core', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(messageNew({ text: 'начать', secret: 'nope' }));
    expect(result.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('rejects a missing secret on message_new without calling core', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const body = messageNew({ text: 'начать' });
    delete body.secret;
    const result = await adapter.handleCallback(body);
    expect(result.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects a missing secret on message_event without calling core', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const body = messageEvent({ payload: { action: 'START_GAME' } });
    delete body.secret;
    const result = await adapter.handleCallback(body);
    expect(result.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('accepts a gameplay callback with the correct secret', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'auth-ok' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).toHaveBeenCalled();
    expect(client.sent).toHaveLength(1);
  });

  it('rejects a wrong group_id without calling core', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(messageNew({ text: 'начать', groupId: 999 }));
    expect(result.status).toBe(403);
    expect(handle).not.toHaveBeenCalled();
  });

  it('acks unknown event types without gameplay', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback({
      type: 'group_join',
      event_id: 'join-1',
      group_id: 111,
      secret: 'test-secret',
      object: { user_id: 1 },
    });
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('handles malformed payloads without throwing', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    await expect(adapter.handleCallback(null)).resolves.toEqual({ status: 200, body: 'ok' });
    await expect(adapter.handleCallback('nope')).resolves.toEqual({ status: 200, body: 'ok' });
    await expect(adapter.handleCallback([])).resolves.toEqual({ status: 200, body: 'ok' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails closed when production config is incomplete', async () => {
    const runtime = new GameRuntime(new MemoryGameStore());
    const handle = vi.spyOn(runtime, 'handle');
    const adapter = new VkAdapter(runtime, {
      config: { ...CONFIG, groupToken: null, production: true },
      client: new RecordingVkApi(),
      log: () => undefined,
    });
    const result = await adapter.handleCallback(messageNew({ text: 'начать' }));
    expect(result.status).toBe(503);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('vk message_new policy', () => {
  it('starts a player from a direct "начать" message', async () => {
    const { adapter, store, client } = boot();
    const result = await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'start-1' }));
    expect(result).toEqual({ status: 200, body: 'ok' });
    const player = await store.findPlayerByVkUserId('9001');
    expect(player).not.toBeNull();
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]!.peerId).toBe(9001);
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.sent[0]!.keyboard?.buttons.length).toBeGreaterThan(0);
  });

  it('ignores outgoing community messages', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(messageNew({ text: 'начать', out: 1 }));
    expect(result.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent).toHaveLength(0);
  });

  it('ignores community senders and cross-user DM destinations', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const community = await adapter.handleCallback(
      messageNew({ text: 'начать', userId: -111, peerId: -111 }),
    );
    const cross = await adapter.handleCallback(
      messageNew({ text: 'начать', userId: 9001, peerId: 9002 }),
    );
    expect(community.body).toBe('ok');
    expect(cross.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not treat ordinary group chatter as a command', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const group = await adapter.handleCallback(
      messageNew({ text: 'привет всем', userId: 9001, peerId: 2000000001 }),
    );
    expect(group.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
  });

  it('ignores service/system messages', async () => {
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(
      messageNew({ text: '', action: { type: 'chat_invite_user' } }),
    );
    expect(result.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not replay START_GAME from an unknown VK type', async () => {
    const { adapter, store } = boot();
    await adapter.handleCallback({
      type: 'message_reply',
      event_id: 'reply-1',
      group_id: 111,
      secret: 'test-secret',
      object: { text: 'начать', from_id: 9001, peer_id: 9001 },
    });
    expect(await store.findPlayerByVkUserId('9001')).toBeNull();
  });
});

describe('vk event ids', () => {
  it('builds the same internal id for a retried payload', () => {
    const payload = messageNew({ eventId: 'stable-7', text: 'герой', cmid: 44, id: 9 });
    expect(internalEventId('message_new', payload)).toBe('vk:message_new:stable-7');
    expect(internalEventId('message_new', payload)).toBe(internalEventId('message_new', { ...payload }));
  });

  it('differs for different messages and namespaces', () => {
    const a = messageNew({ eventId: 'A', text: 'герой' });
    const b = messageNew({ eventId: 'B', text: 'герой' });
    const click = messageEvent({ eventId: 'A', payload: { action: 'OPEN_PROFILE' } });
    expect(internalEventId('message_new', a)).not.toBe(internalEventId('message_new', b));
    expect(internalEventId('message_new', a)).toBe('vk:message_new:A');
    expect(internalEventId('message_event', click)).toBe('vk:message_event:A');
    expect(internalEventId('message_new', a)).not.toBe(internalEventId('message_event', click));
  });

  it('falls back to peer + conversation id without Date.now or UUID', () => {
    const payload = messageNew({ text: 'лагерь', cmid: 18, id: 3 });
    delete payload.event_id;
    const id = internalEventId('message_new', payload);
    expect(id).toBe('vk:message_new:9001:18');
    expect(id).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('uses message_event object.event_id when the root id is absent', () => {
    const payload = messageEvent({ clickId: 'btn-77', payload: { action: 'OPEN_CAMP' } });
    delete payload.event_id;
    expect(internalEventId('message_event', payload)).toBe('vk:message_event:btn-77');
  });
});

describe('vk command flow', () => {
  it('maps text aliases through the existing parser', () => {
    expect(commandFromText('Начать').type).toBe('START_GAME');
    expect(commandFromText('начать').type).toBe('START_GAME');
    expect(commandFromText('Старт').type).toBe('START_GAME');
    expect(commandFromText('играть').type).toBe('START_GAME');
    expect(commandFromText('герой')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'hero' } });
    expect(commandFromText('профиль').type).toBe('OPEN_PROFILE');
    expect(commandFromText('клан')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'clan' } });
    expect(commandFromText('рейтинг')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'ratings' } });
    expect(commandFromText('клин')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'wedge' } });
    expect(commandFromText('печь')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'furnace' } });
    expect(commandFromText('вел')).toEqual({ type: 'TALK_NPC', payload: { npcId: 'vel' } });
    expect(commandFromText('яра')).toEqual({ type: 'TALK_NPC', payload: { npcId: 'yara' } });
    expect(commandFromText('дань').type).toBe('PAY_TRIBUTE');
  });

  it('maps week 2 russian aliases for farm, mist and mira', () => {
    expect(commandFromText('мира')).toEqual({ type: 'TALK_NPC', payload: { npcId: 'mira' } });
    expect(commandFromText('грядка')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'farm' } });
    expect(commandFromText('низина')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'lowland' } });
    expect(commandFromText('карьер')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'quarry' } });
    expect(commandFromText('кромка')).toEqual({ type: 'OPEN_MENU', payload: { menu: 'mist' } });
  });

  it('opens the hero meta menu from a "герой" message', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's1' }));
    client.sent.length = 0;
    const result = await adapter.handleCallback(messageNew({ text: 'герой', eventId: 'hero-1' }));
    expect(result.body).toBe('ok');
    expect(client.sent[0]!.text).toMatch(/Герой/i);
  });

  it('executes an allowlisted button payload, not the display label', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    await adapter.handleCallback(
      messageEvent({
        eventId: 'btn-open',
        payload: { action: 'START_GAME' },
      }),
    );
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { type: 'START_GAME', payload: {} },
      }),
    );
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.answers[0]!.eventId).toBe('click-abc');
  });

  it('rejects a tampered payload without calling Game Core', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback(
      messageEvent({
        eventId: 'evil',
        payload: { action: 'SET_RATING', pvpRating: 3000 },
      }),
    );
    expect(result.body).toBe('ok');
    expect(handle).not.toHaveBeenCalled();
    expect(client.sent[0]!.text).toMatch(/нельзя/i);
  });

  it('lets core reject a stale / unauthorized claim button', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's2' }));
    client.sent.length = 0;
    const result = await adapter.handleCallback(
      messageEvent({
        eventId: 'claim-bad',
        payload: { action: 'CLAIM_REWARD', rewardType: 'structure', rewardRef: 'barricade' },
      }),
    );
    expect(result.body).toBe('ok');
    expect(client.sent[0]!.text).toMatch(/не найдена|нельзя/i);
    const player = (await store.findPlayerByVkUserId('9001'))!;
    expect(await store.hasRewardClaim(player.id, 'structure', 'barricade')).toBe(false);
  });
});

describe('vk duplicate delivery and races', () => {
  it('replays a duplicate callback without a second mutation', async () => {
    const { adapter, store, client } = boot();
    const body = messageNew({ text: 'начать', eventId: 'dup-1' });
    const first = await adapter.handleCallback(body);
    const player = (await store.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    const second = await adapter.handleCallback(body);
    expect(first.body).toBe('ok');
    expect(second.body).toBe('ok');
    expect(client.sent).toHaveLength(1);
    const again = (await store.findPlayerByVkUserId('9001'))!;
    expect(again.id).toBe(player.id);
    expect(again.energy).toBe(energy);
    expect(await store.findProcessedEvent('vk:message_new:dup-1')).not.toBeNull();
  });

  it('does not send a second VK message for the same message_event event_id', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-dup-evt' }));
    client.sent.length = 0;
    const click = messageEvent({
      eventId: 'click-dup',
      clickId: 'click-dup-1',
      payload: { action: 'OPEN_PROFILE' },
    });
    expect(await adapter.handleCallback(click)).toEqual({ status: 200, body: 'ok' });
    expect(await adapter.handleCallback(click)).toEqual({ status: 200, body: 'ok' });
    expect(client.sent).toHaveLength(1);
    expect(client.answers.length).toBeGreaterThanOrEqual(1);
    expect(client.answers[0]!.eventId).toBe('click-dup-1');
  });

  it('message_new with the same payload does not double a message_event action', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-cross' }));
    const player = (await store.findPlayerByVkUserId('9001'))!;
    const energy = player.energy;
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'btn-profile',
        clickId: 'c-profile',
        payload: { action: 'OPEN_PROFILE' },
      }),
    );
    await adapter.handleCallback(
      messageNew({
        eventId: 'txt-profile',
        payload: JSON.stringify({ action: 'OPEN_PROFILE' }),
        text: '👤 Профиль',
      }),
    );
    expect(client.sent.length).toBeGreaterThanOrEqual(1);
    expect(client.sent.length).toBeLessThanOrEqual(2);
    const again = (await store.findPlayerByVkUserId('9001'))!;
    expect(again.energy).toBe(energy);
    expect(await store.findProcessedEvent('vk:message_event:btn-profile')).not.toBeNull();
    expect(await store.findProcessedEvent('vk:message_new:txt-profile')).not.toBeNull();
  });
});

describe('vk rem dialogue duplicate and stale buttons', () => {
  async function seedRemDay2(store: MemoryGameStore) {
    const player = (await store.findPlayerByVkUserId('9001'))!;
    for (const flag of [
      'day_1_complete',
      'met_rem',
      'showed_token_to_rem',
      'found_broken_lantern',
      'node7_gate_closed',
      'activated_node7_token',
    ]) {
      await store.setFlag(player.id, flag, '1');
    }
    await store.createItem({ playerId: player.id, templateId: 'broken_lantern', rarity: 'COMMON' });
    player.currentState = 'rem_day2';
    player.currentLocation = 'rem_camp';
    await store.savePlayer(player);
    return player;
  }

  it('does not send «Кивок» twice for a duplicate Node 7 callback', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-rem' }));
    await seedRemDay2(store);
    client.sent.length = 0;
    const click = messageEvent({
      eventId: 'node7-dup',
      clickId: 'node7-click',
      payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'what7_shown' },
    });
    await adapter.handleCallback(click);
    await adapter.handleCallback(click);
    const nods = client.sent.filter((row) => row.text.includes('Кивок'));
    expect(nods).toHaveLength(1);
    expect(client.answers[0]!.eventId).toBe('node7-click');
  });

  it('second click of the same Node 7 button does not duplicate the line', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-rem2' }));
    await seedRemDay2(store);
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'node7-a',
        clickId: 'n7a',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'what7_shown' },
      }),
    );
    await adapter.handleCallback(
      messageEvent({
        eventId: 'node7-b',
        clickId: 'n7b',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'what7_shown' },
      }),
    );
    expect(client.sent.filter((row) => row.text.includes('Кивок'))).toHaveLength(1);
  });

  it('showing the lantern then a duplicate callback does not roll back the screen', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-lantern' }));
    await seedRemDay2(store);
    client.sent.length = 0;
    const show = messageEvent({
      eventId: 'lantern-show',
      clickId: 'lantern-1',
      payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'lantern' },
    });
    await adapter.handleCallback(show);
    expect(client.sent[0]!.text).toMatch(/Вел носит стёкла/i);
    expect(client.sent[0]!.keyboard?.buttons.flat().some((btn) => btn.action.label.includes('Убрать'))).toBe(
      true,
    );
    const after = (await store.findPlayerByVkUserId('9001'))!;
    expect(after.currentState).toBe('rem_day2_lantern');
    await adapter.handleCallback(show);
    expect((await store.findPlayerByVkUserId('9001'))!.currentState).toBe('rem_day2_lantern');
    expect(client.sent.filter((row) => /Вел носит стёкла/i.test(row.text))).toHaveLength(1);
  });

  it('a stale Rem button after the lantern does not restore the old hub', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-stale' }));
    await seedRemDay2(store);
    await adapter.handleCallback(
      messageEvent({
        eventId: 'lantern-go',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'lantern' },
      }),
    );
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'stale-node7',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'what7_shown' },
      }),
    );
    expect((await store.findPlayerByVkUserId('9001'))!.currentState).toBe('rem_day2_lantern');
    expect(client.sent).toHaveLength(0);
  });

  it('«К стану» leaves rem_day2 and «Начать» resumes camp', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-camp' }));
    const player = await seedRemDay2(store);
    await store.setFlag(player.id, 'player_camp_founded', '1');
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'node7',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'what7_shown' },
      }),
    );
    await adapter.handleCallback(
      messageEvent({
        eventId: 'node7-back',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2_node7_shown', choiceId: 'back' },
      }),
    );
    await adapter.handleCallback(
      messageEvent({
        eventId: 'lantern',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'lantern' },
      }),
    );
    await adapter.handleCallback(
      messageEvent({
        eventId: 'lantern-back',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2_lantern', choiceId: 'back' },
      }),
    );
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'to-camp',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'camp' },
      }),
    );
    expect(client.sent[0]!.text).not.toMatch(/ковыряет клин/);
    const left = (await store.findPlayerByVkUserId('9001'))!;
    expect(left.currentState).not.toMatch(/^rem_day2/);
    expect(left.currentLocation).toBe('player_camp');

    client.sent.length = 0;
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-resume' }));
    expect(client.sent[0]!.text).not.toMatch(/ковыряет клин/);
    expect((await store.findPlayerByVkUserId('9001'))!.currentState).not.toMatch(/^rem_day2/);

    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'stale-camp',
        payload: { action: 'DIALOGUE_CHOICE', nodeId: 'rem_day2', choiceId: 'camp' },
      }),
    );
    expect(client.sent).toHaveLength(0);
    expect((await store.findPlayerByVkUserId('9001'))!.currentState).not.toMatch(/^rem_day2/);
  });

  it('legacy EXPLORE payload from Rem no longer loops rem_day2 when camp exists', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's-explore' }));
    const player = await seedRemDay2(store);
    await store.setFlag(player.id, 'player_camp_founded', '1');
    client.sent.length = 0;
    await adapter.handleCallback(messageEvent({ eventId: 'old-explore', payload: { action: 'EXPLORE' } }));
    expect(client.sent[0]!.text).not.toMatch(/ковыряет клин/);
    expect((await store.findPlayerByVkUserId('9001'))!.currentLocation).toBe('player_camp');
  });
});

describe('vk payload allowlist', () => {

  it('creates only one player when two first messages race', async () => {
    const { adapter, store } = boot();
    const a = messageNew({ text: 'начать', eventId: 'race-a', userId: 4242 });
    const b = messageNew({ text: 'начать', eventId: 'race-b', userId: 4242 });
    await Promise.all([adapter.handleCallback(a), adapter.handleCallback(b)]);
    const player = await store.findPlayerByVkUserId('4242');
    expect(player).not.toBeNull();
    const created = await store.createPlayer({ vkUserId: '4242', name: 'Другой' });
    expect(created.id).toBe(player!.id);
  });

  it('does not double gather after a VK send failure and retry', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's3' }));
    const player = (await store.findPlayerByVkUserId('9001'))!;
    client.failSend = true;
    const gather = messageNew({ text: 'рубить', eventId: 'gather-1' });
    const failed = await adapter.handleCallback(gather);
    expect(failed.status).toBe(503);
    const afterFail = await store.getResources(player.id);
    expect(afterFail.LOG ?? 0).toBeGreaterThan(0);
    const wood = afterFail.LOG ?? 0;
    client.failSend = false;
    const retried = await adapter.handleCallback(gather);
    expect(retried.body).toBe('ok');
    expect((await store.getResources(player.id)).LOG).toBe(wood);
  });
});

describe('vk payload allowlist', () => {
  it('accepts a flat allowlisted command and strips action', () => {
    const decoded = decodeButtonPayload({ action: 'OPEN_MENU', menu: 'hero' });
    expect(decoded).toEqual({ ok: true, command: { type: 'OPEN_MENU', payload: { menu: 'hero' } } });
  });

  it('rejects nested objects and unknown commands', () => {
    expect(decodeButtonPayload({ action: 'START_GAME', nested: { x: 1 } }).ok).toBe(false);
    expect(decodeButtonPayload({ action: 'GRANT_PREMIUM' }).ok).toBe(false);
    expect(decodeButtonPayload('not-json').ok).toBe(false);
    expect(decodeButtonPayload({ command: 'start' })).toEqual({
      ok: true,
      command: { type: 'START_GAME', payload: {} },
    });
    expect(decodeButtonPayload('start')).toEqual({
      ok: true,
      command: { type: 'START_GAME', payload: {} },
    });
  });
});

describe('vk logging and config', () => {
  it('does not log token, secret, confirmation or player text', async () => {
    const { adapter, logs } = boot();
    await adapter.handleCallback(messageNew({ text: 'секретный монолог игрока', eventId: 'log-1' }));
    const dumped = JSON.stringify(logs);
    expect(dumped).not.toContain('test-token');
    expect(dumped).not.toContain('test-secret');
    expect(dumped).not.toContain('confirm-code');
    expect(dumped).not.toContain('секретный монолог игрока');
  });

  it('loads env placeholders without treating empty strings as set', () => {
    const config = loadVkConfig({
      VK_GROUP_ID: '',
      VK_GROUP_TOKEN: '   ',
      VK_CALLBACK_SECRET: '',
      VK_CONFIRMATION_CODE: '',
      VK_API_VERSION: '',
    });
    expect(config.groupId).toBeNull();
    expect(config.groupToken).toBeNull();
    expect(config.apiVersion).toBe('5.199');
  });

  it('compares secrets in constant time for equal-length values', () => {
    expect(secretsEqual('test-secret', 'test-secret')).toBe(true);
    expect(secretsEqual('test-secret', 'test-secr3t')).toBe(false);
    expect(verifyCallbackAuth(messageNew({ text: 'x' }), CONFIG)).toBe('ok');
    expect(verifyConfirmation({ type: 'confirmation', group_id: 111 }, CONFIG)).toBe('ok');
    expect(verifyConfirmation({ type: 'confirmation', group_id: 111, secret: 'nope' }, CONFIG)).toBe(
      'ok',
    );
    expect(verifyConfirmation({ type: 'confirmation', group_id: 999 }, CONFIG)).toBe('group');
    const missingSecret = messageNew({ text: 'x' });
    delete missingSecret.secret;
    expect(verifyCallbackAuth(missingSecret, CONFIG)).toBe('secret');
    const missingEventSecret = messageEvent({});
    delete missingEventSecret.secret;
    expect(verifyCallbackAuth(missingEventSecret, CONFIG)).toBe('secret');
  });

  it('does not require secret on confirmation when VK_CALLBACK_SECRET is configured', async () => {
    expect(CONFIG.callbackSecret).toBe('test-secret');
    const { adapter, runtime } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const result = await adapter.handleCallback({ type: 'confirmation', group_id: 111 });
    expect(result).toEqual({ status: 200, body: 'confirm-code' });
    expect(handle).not.toHaveBeenCalled();
  });
});

describe('vk domain errors', () => {
  it('maps a core domain error to a Russian VK message', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 's4' }));
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'craft-empty',
        payload: { action: 'CRAFT_ITEM', recipeId: 'planks' },
      }),
    );
    expect(client.sent[0]!.text).toMatch(/хват|нельзя|рецепта/i);
    expect(client.sent[0]!.text).not.toMatch(/Prisma|P2002|stack/i);
  });

  it('maps an unexpected core throw to a generic Russian message without SQL', async () => {
    const { adapter, runtime, client } = boot();
    vi.spyOn(runtime, 'handle').mockRejectedValueOnce(
      new Error('Prisma P2002 Unique constraint failed on players_vk_user_id'),
    );
    const result = await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'boom' }));
    expect(result.body).toBe('ok');
    expect(client.sent[0]!.text).toBe('Сейчас это сделать нельзя.');
    expect(client.sent[0]!.text).not.toMatch(/Prisma|P2002|constraint|stack/i);
    expect(JSON.stringify(client.sent[0])).not.toContain('test-token');
  });

  it('does not leak the group token into GameResponse or VK send fields', async () => {
    const { adapter, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'начать', eventId: 'tok-1' }));
    const dumped = JSON.stringify(client.sent);
    expect(dumped).not.toContain('test-token');
    expect(client.sent[0]!.text).not.toContain('access_token');
    expect(callbackPayload(client.sent[0]!.keyboard!.buttons[0]![0]!)).not.toContain('test-token');
  });

  it('treats VK community Начать payload as START_GAME', async () => {
    const { adapter, runtime, client } = boot();
    const handle = vi.spyOn(runtime, 'handle');
    const body = messageNew({ text: 'Начать', eventId: 'vk-start-btn' });
    (body.object as { message: Record<string, unknown> }).message.payload = '{"command":"start"}';
    const result = await adapter.handleCallback(body);
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({
        command: { type: 'START_GAME', payload: {} },
      }),
    );
    expect(client.sent[0]!.text).toContain('приходишь в себя');
    expect(client.sent[0]!.keyboard?.buttons.flat().some((btn) => /📦/.test(btn.action.label))).toBe(true);
    expect(JSON.stringify(client.sent[0]!.keyboard)).not.toMatch(/COMMON|UNCOMMON|"BACK"/);
  });

  it('sets a hero name from chat text after the name prompt', async () => {
    const { adapter, store, client } = boot();
    await adapter.handleCallback(messageNew({ text: 'Старт', eventId: 'name-start' }));
    client.sent.length = 0;
    await adapter.handleCallback(
      messageEvent({
        eventId: 'name-prompt',
        payload: { action: 'PROMPT_HERO_NAME' },
      }),
    );
    expect(client.sent[0]!.text).toMatch(/звать/);
    client.sent.length = 0;
    const named = await adapter.handleCallback(messageNew({ text: 'Виктор', eventId: 'name-set' }));
    expect(named.body).toBe('ok');
    expect((await store.findPlayerByVkUserId('9001'))!.name).toBe('Виктор');
    expect(client.sent[0]!.text).toContain('Виктор');
    expect(JSON.stringify(client.sent[0]!.keyboard)).toMatch(/⬅ Назад/);
    expect(JSON.stringify(client.sent)).not.toMatch(/COMMON|UNCOMMON/);
  });
});
