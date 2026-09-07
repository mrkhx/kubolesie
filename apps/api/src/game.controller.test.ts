import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GameController } from './game.controller';
import { loadAppConfig } from './app-config';

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://kubolesie:s3cret@db:5432/kubolesie',
  VK_GROUP_ID: '111',
  VK_GROUP_TOKEN: 'test-token',
  VK_CALLBACK_SECRET: 'test-secret',
  VK_CONFIRMATION_CODE: 'confirm-code',
  ENABLE_MOCK_API: 'true',
};

function controller(env: NodeJS.Dict<string>) {
  return new GameController(
    { handle: vi.fn() } as never,
    { handleMockEvent: vi.fn() } as never,
    { findPlayerByVkUserId: vi.fn() } as never,
    'prisma',
    { consume: vi.fn(), tryLock: vi.fn(), unlock: vi.fn(), ping: vi.fn(), close: vi.fn() } as never,
    loadAppConfig(env),
  );
}

describe('production mock and inspect endpoints', () => {
  it('disables POST /v1/mock/event in production', async () => {
    const api = controller(PROD);
    await expect(
      api.mockEvent({ event_id: 'e1', vk_user_id: '1', action: 'START_GAME' }, { ip: '127.0.0.1' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disables GET /v1/players inspect in production', async () => {
    const api = controller(PROD);
    await expect(api.inspect('1001')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disables the mock console in production', () => {
    const api = controller(PROD);
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };
    expect(() => api.index(res as never)).toThrow(NotFoundException);
    expect(res.send).not.toHaveBeenCalled();
  });
});
