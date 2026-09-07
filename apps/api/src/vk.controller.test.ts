import { describe, expect, it, vi } from 'vitest';
import { requestIp, VkController } from './vk.controller';
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

const req = { ip: '127.0.0.1', headers: {} };

describe('vk http callback', () => {
  it('returns confirmation as plain text, not GameResponse JSON', async () => {
    const adapter = {
      handleCallback: vi.fn(async (): Promise<CallbackHttpResult> => ({ status: 200, body: 'confirm-code' })),
    };
    const controller = new VkController(adapter as never);
    const res = mockRes();
    await controller.callback({ type: 'confirmation', group_id: 111 }, req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('confirm-code');
    expect(res.body.startsWith('{')).toBe(false);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(adapter.handleCallback).toHaveBeenCalledWith({ type: 'confirmation', group_id: 111 }, { ip: '127.0.0.1' });
  });

  it('does not invoke a second adapter path for forbidden callbacks', async () => {
    const adapter = {
      handleCallback: vi.fn(async (): Promise<CallbackHttpResult> => ({ status: 403, body: 'forbidden' })),
    };
    const controller = new VkController(adapter as never);
    const res = mockRes();
    await controller.callback({ type: 'message_new', secret: 'nope' }, req as never, res as never);
    expect(adapter.handleCallback).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('forbidden');
  });

  it('extracts client IP from x-forwarded-for without using it as player identity', () => {
    expect(
      requestIp({
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      }),
    ).toBe('203.0.113.9');
    expect(requestIp({ ip: '127.0.0.1', headers: {} })).toBe('127.0.0.1');
  });
});
