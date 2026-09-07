import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { VkController } from './vk.controller';
import { loadVkConfig, type CallbackHttpResult, type VkConfig } from '@kubolesie/vk-bot';

const READY: VkConfig = {
  groupId: 111,
  groupToken: 'test-token',
  callbackSecret: 'test-secret',
  confirmationCode: 'confirm-code',
  apiVersion: '5.199',
  production: false,
};

function mockRes() {
  const res = {
    statusCode: 200,
    body: '',
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe('vk http callback', () => {
  it('returns confirmation as plain text, not GameResponse JSON', async () => {
    const adapter = {
      handleCallback: vi.fn(async (): Promise<CallbackHttpResult> => ({ status: 200, body: 'confirm-code' })),
    };
    const controller = new VkController(adapter as never);
    const res = mockRes();
    await controller.callback({ type: 'confirmation', group_id: 111 }, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('confirm-code');
    expect(res.body.startsWith('{')).toBe(false);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('does not invoke a second adapter path for forbidden callbacks', async () => {
    const adapter = {
      handleCallback: vi.fn(async (): Promise<CallbackHttpResult> => ({ status: 403, body: 'forbidden' })),
    };
    const controller = new VkController(adapter as never);
    const res = mockRes();
    await controller.callback({ type: 'message_new', secret: 'nope' }, res as never);
    expect(adapter.handleCallback).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('forbidden');
  });
});

describe('health vk flag', () => {
  it('reports vkConfigured without secrets', () => {
    const empty = new HealthController(loadVkConfig({}));
    expect(empty.health().vkConfigured).toBe(false);
    const ready = new HealthController(READY);
    const body = ready.health();
    expect(body.vkConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('test-token');
    expect(JSON.stringify(body)).not.toContain('test-secret');
    expect(JSON.stringify(ready.vkHealth())).not.toContain('test-token');
    expect(ready.vkHealth().vkConfigured).toBe(true);
  });
});
