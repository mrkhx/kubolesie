import { Module } from '@nestjs/common';
import { GameRuntime } from '@kubolesie/game-core';
import { createGameStore } from '@kubolesie/database';
import { loadVkConfig, VkAdapter, VkApiClient } from '@kubolesie/vk-bot';
import { GameController } from './game.controller';
import { HealthController } from './health.controller';
import { VkController } from './vk.controller';
import { createRedisLock } from './redis';

@Module({
  controllers: [HealthController, GameController, VkController],
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
      provide: 'VK_CONFIG',
      useFactory: () => loadVkConfig(),
    },
    {
      provide: 'VK_CLIENT',
      inject: ['VK_CONFIG'],
      useFactory: (config: ReturnType<typeof loadVkConfig>) => new VkApiClient(config),
    },
    {
      provide: VkAdapter,
      inject: [GameRuntime, 'VK_CLIENT', 'VK_CONFIG'],
      useFactory: (
        runtime: GameRuntime,
        client: VkApiClient,
        config: ReturnType<typeof loadVkConfig>,
      ) => new VkAdapter(runtime, { client, config }),
    },
    {
      provide: 'REDIS_LOCK',
      useFactory: () => createRedisLock(),
    },
  ],
})
export class AppModule {}
