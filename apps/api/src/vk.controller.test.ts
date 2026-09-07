import { describe, expect, it, vi } from 'vitest';
import { VkController } from './vk.controller';
import type { CallbackHttpResult } from '@kubolesie/vk-bot';

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
