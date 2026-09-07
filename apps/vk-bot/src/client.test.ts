import { describe, expect, it, vi } from 'vitest';
import {
  clipVkText,
  randomIdFromEvent,
  RecordingVkApi,
  VK_API_ENDPOINT,
  VkApiClient,
  VkApiError,
} from './client';
import { toVkKeyboard } from './commands';
import { DEFAULT_VK_API_VERSION, VK_BUTTON_PAYLOAD_MAX, type VkConfig } from './config';

const CONFIG: VkConfig = {
  groupId: 111,
  groupToken: 'test-token',
  callbackSecret: 'test-secret',
  confirmationCode: 'confirm-code',
  apiVersion: '5.199',
  production: false,
};

describe('vk api client', () => {
  it('posts messages.send with peer_id, version and random_id, token only in the body', async () => {
    const http = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      const body = String(init?.body ?? '');
      expect(target).toBe(`${VK_API_ENDPOINT}/messages.send`);
      expect(target).not.toContain('test-token');
      expect(body).toContain('access_token=test-token');
      expect(body).toContain('peer_id=9001');
      expect(body).toContain('v=5.199');
      expect(body).toContain('random_id=');
      expect(body).toContain('keyboard=');
      return new Response(JSON.stringify({ response: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new VkApiClient(CONFIG, http as unknown as typeof fetch);
    await client.sendMessage({
      peerId: 9001,
      text: 'Привет',
      randomId: 42,
      keyboard: toVkKeyboard([{ label: '🔙 Назад', action: 'OPEN_MENU', payload: { menu: 'hub' } }]),
    });
    expect(http).toHaveBeenCalledOnce();
  });

  it('uses the configured API version, not a hardcoded scatter', async () => {
    const http = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(String(init?.body ?? '')).toContain('v=5.131');
      return new Response(JSON.stringify({ response: 1 }), { status: 200 });
    });
    const client = new VkApiClient({ ...CONFIG, apiVersion: '5.131' }, http as unknown as typeof fetch);
    await client.sendMessage({ peerId: 1, text: 'x', randomId: 1 });
    expect(DEFAULT_VK_API_VERSION).toBe('5.199');
  });

  it('throws a VkApiError without leaking the token', async () => {
    const http = vi.fn(async () =>
      new Response(JSON.stringify({ error: { error_code: 5, error_msg: 'user auth failed' } }), {
        status: 200,
      }),
    );
    const client = new VkApiClient(CONFIG, http as unknown as typeof fetch);
    await expect(client.sendMessage({ peerId: 1, text: 'x', randomId: 1 })).rejects.toBeInstanceOf(
      VkApiError,
    );
    try {
      await client.sendMessage({ peerId: 1, text: 'x', randomId: 1 });
    } catch (error) {
      expect((error as Error).message).not.toContain('test-token');
      expect(JSON.stringify(error)).not.toContain('test-token');
    }
  });

  it('answers message_event via sendMessageEventAnswer', async () => {
    const http = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe(`${VK_API_ENDPOINT}/messages.sendMessageEventAnswer`);
      return new Response(JSON.stringify({ response: 1 }), { status: 200 });
    });
    const client = new VkApiClient(CONFIG, http as unknown as typeof fetch);
    await client.answerEvent({ eventId: 'click-1', userId: 7, peerId: 7 });
    expect(http).toHaveBeenCalledOnce();
  });
});

describe('random_id and keyboard', () => {
  it('derives a stable non-zero int32 from the internal event id', () => {
    const a = randomIdFromEvent('vk:message_new:1');
    const b = randomIdFromEvent('vk:message_new:1');
    const c = randomIdFromEvent('vk:message_new:2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(0);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(-2147483648);
    expect(a).toBeLessThanOrEqual(2147483647);
  });

  it('keeps callback payload within the VK 255-byte limit and preserves Назад', () => {
    const keyboard = toVkKeyboard([
      { label: '🔙 Назад', action: 'OPEN_MENU', payload: { menu: 'hub' } },
      { label: '👤 Герой', action: 'OPEN_MENU', payload: { menu: 'hero' } },
    ]);
    expect(keyboard.inline).toBe(true);
    expect(keyboard.buttons[0]![0]!.action.label).toContain('Назад');
    for (const row of keyboard.buttons) {
      for (const button of row) {
        expect(Buffer.byteLength(button.action.payload, 'utf8')).toBeLessThanOrEqual(VK_BUTTON_PAYLOAD_MAX);
        expect(button.action.payload).not.toMatch(/player_|cuid|sql/i);
      }
    }
  });

  it('clips outbound text and records send failures without a real HTTP call', async () => {
    expect(clipVkText('ok')).toBe('ok');
    const api = new RecordingVkApi();
    api.failSend = true;
    await expect(api.sendMessage({ peerId: 1, text: 'x', randomId: 1 })).rejects.toBeInstanceOf(VkApiError);
    expect(api.sent).toHaveLength(0);
  });
});
