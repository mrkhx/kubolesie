import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GameRuntime, type GameStore } from '@kubolesie/game-core';
import { VkAdapter, type MockVkEvent } from '@kubolesie/vk-bot';
import { MOCK_CONSOLE_HTML } from './mock-console';
import type { RedisLock } from './redis';

function mockApiEnabled(): boolean {
  if (process.env.ENABLE_MOCK_API === 'true') return true;
  if (process.env.ENABLE_MOCK_API === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

@Controller()
export class GameController {
  constructor(
    @Inject(GameRuntime) private readonly runtime: GameRuntime,
    @Inject(VkAdapter) private readonly adapter: VkAdapter,
    @Inject('GAME_STORE') private readonly store: GameStore,
    @Inject('STORE_KIND') private readonly storeKind: 'prisma' | 'memory',
    @Inject('REDIS_LOCK') private readonly redis: RedisLock,
  ) {}

  @Get('/')
  index(@Res() res: Response) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(MOCK_CONSOLE_HTML);
  }

  @Post('/v1/mock/event')
  async mockEvent(@Body() body: MockVkEvent, @Req() req: Request) {
    this.assertMock();
    if (!body?.event_id || body.vk_user_id == null) {
      throw new BadRequestException('event_id and vk_user_id are required');
    }
    const rateKey = `${req.ip}:${body.vk_user_id}`;
    const hits = await this.redis.incr(rateKey, 10_000);
    if (hits > 40) {
      throw new BadRequestException('rate limit');
    }
    const locked = await this.redis.tryLock(`event:${body.event_id}`, 15_000);
    try {
      const result = await this.adapter.handleMockEvent(body);
      return {
        ok: true,
        store: this.storeKind,
        game: result.game,
        vkKeyboard: result.vkKeyboard,
      };
    } finally {
      if (locked) await this.redis.unlock(`event:${body.event_id}`);
    }
  }

  @Get('/v1/players/:vkUserId')
  async inspect(@Param('vkUserId') vkUserId: string) {
    this.assertMock();
    const player = await this.store.findPlayerByVkUserId(vkUserId);
    if (!player) throw new NotFoundException('player not found');
    const [resources, items, flags, equipment, quests, discoveries] = await Promise.all([
      this.store.getResources(player.id),
      this.store.listItems(player.id),
      this.store.getFlags(player.id),
      this.store.getEquipment(player.id),
      this.store.listPlayerQuests(player.id),
      this.store.listDiscoveries(player.id),
    ]);
    const rem = await this.store.getNpcRelation(player.id, 'rem');
    return {
      player: {
        id: player.id,
        vkUserId: player.vkUserId,
        name: player.name,
        level: player.level,
        xp: player.xp,
        hp: player.hp,
        maxHp: player.maxHp,
        energy: player.energy,
        maxEnergy: player.maxEnergy,
        coins: player.coins,
        currentLocation: player.currentLocation,
        currentState: player.currentState,
        stats: player.stats,
      },
      resources,
      items,
      flags,
      equipment,
      quests,
      discoveries,
      relations: { rem },
    };
  }

  private assertMock() {
    if (!mockApiEnabled()) {
      throw new NotFoundException();
    }
  }
}
