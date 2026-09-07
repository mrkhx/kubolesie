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
import { VkAdapter, type EphemeralStore, type MockVkEvent } from '@kubolesie/vk-bot';
import { MOCK_CONSOLE_HTML } from './mock-console';
import type { AppConfig } from './app-config';

@Controller()
export class GameController {
  constructor(
    @Inject(GameRuntime) private readonly runtime: GameRuntime,
    @Inject(VkAdapter) private readonly adapter: VkAdapter,
    @Inject('GAME_STORE') private readonly store: GameStore,
    @Inject('STORE_KIND') private readonly storeKind: 'prisma' | 'memory',
    @Inject('EPHEMERAL_STORE') private readonly ephemeral: EphemeralStore,
    @Inject('APP_CONFIG') private readonly appConfig: AppConfig,
  ) {}

  @Get('/')
  index(@Res() res: Response) {
    this.assertMock();
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(MOCK_CONSOLE_HTML);
  }

  @Post('/v1/mock/event')
  async mockEvent(@Body() body: MockVkEvent, @Req() req: Request) {
    this.assertMock();
    if (!body?.event_id || body.vk_user_id == null) {
      throw new BadRequestException('event_id and vk_user_id are required');
    }
    const ip = String(req.ip ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    const user = String(body.vk_user_id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    const allowed = await this.ephemeral.consume([
      { key: `kubolesie:rl:mock:${ip}:${user}:m`, limit: 40, ttlMs: 10_000 },
    ]);
    if (!allowed) {
      throw new BadRequestException('rate limit');
    }
    const result = await this.adapter.handleMockEvent(body);
    return {
      ok: true,
      store: this.storeKind,
      game: result.game,
      vkKeyboard: result.vkKeyboard,
    };
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
    if (this.appConfig.production || !this.appConfig.mockApiEnabled) {
      throw new NotFoundException();
    }
  }
}
