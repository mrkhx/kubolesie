import { Module } from '@nestjs/common';
import { GameRuntime } from '@kubolesie/game-core';
import { createGameStore } from '@kubolesie/database';
import { VkAdapter } from '@kubolesie/vk-bot';
import { GameController } from './game.controller';
import { HealthController } from './health.controller';
import { createRedisLock } from './redis';

@Module({
  controllers: [HealthController, GameController],
  providers: [
    {
      provide: 'STORE_BUNDLE',
      useFactory: async () => createGameStore(),
    },
    {
      provide: 'GAME_STORE',
      inject: ['STORE_BUNDLE'],
      useFactory: (bundle: Awaited<ReturnType<typeof createGameStore>>) => bundle.store,
    },
    {
      provide: 'STORE_KIND',
      inject: ['STORE_BUNDLE'],
      useFactory: (bundle: Awaited<ReturnType<typeof createGameStore>>) => bundle.kind,
    },
    {
      provide: GameRuntime,
      inject: ['GAME_STORE'],
      useFactory: (store: Awaited<ReturnType<typeof createGameStore>>['store']) =>
        new GameRuntime(store),
    },
    {
      provide: VkAdapter,
      inject: [GameRuntime],
      useFactory: (runtime: GameRuntime) => new VkAdapter(runtime),
    },
    {
      provide: 'REDIS_LOCK',
      useFactory: () => createRedisLock(),
    },
  ],
})
export class AppModule {}
