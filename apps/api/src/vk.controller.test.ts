import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { requestIp, VkController } from './vk.controller';
import { VkAdapter } from '@kubolesie/vk-bot';
import type { CallbackHttpResult } from '@kubolesie/vk-bot';
import { GameRuntime, MemoryGameStore } from '@kubolesie/game-core';

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

  it('injects VkAdapter by token so confirmation works under tsx without emitDecoratorMetadata', async () => {
    const handleCallback = vi.fn(async (): Promise<CallbackHttpResult> => ({ status: 200, body: 'confirm-code' }));
    @Module({
      controllers: [VkController],
      providers: [{ provide: VkAdapter, useValue: { handleCallback } }],
    })
    class VkHttpProbeModule {}
    const app = await NestFactory.create(VkHttpProbeModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    try {
      const address = app.getHttpServer().address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/vk/callback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'confirmation', group_id: 111 }),
      });
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(text).toBe('confirm-code');
      expect(handleCallback).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('confirms the real VK payload without secret over HTTP', async () => {
    const adapter = new VkAdapter(new GameRuntime(new MemoryGameStore()), {
      config: {
        groupId: 235505485,
        groupToken: 'test-token',
        callbackSecret: 'test-secret',
        confirmationCode: 'confirm-code',
        apiVersion: '5.199',
        production: true,
      },
      log: () => undefined,
    });
    @Module({
      controllers: [VkController],
      providers: [{ provide: VkAdapter, useValue: adapter }],
    })
    class VkRealConfirmModule {}
    const app = await NestFactory.create(VkRealConfirmModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    try {
      const address = app.getHttpServer().address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const response = await fetch(`http://127.0.0.1:${port}/vk/callback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'confirmation', group_id: 235505485 }),
      });
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(text).toBe('confirm-code');
    } finally {
      await app.close();
    }
  });
});
