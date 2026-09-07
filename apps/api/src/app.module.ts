import { Module } from '@nestjs/common';
import { GameRuntime } from '@kubolesie/game-core';
import { createGameStore, type StoreBundle } from '@kubolesie/database';
import {
  AbuseGuard,
  loadAbusePolicy,
  loadVkConfig,
  VkAdapter,
  VkApiClient,
  type EphemeralStore,
} from '@kubolesie/vk-bot';
import { loadAppConfig, type AppConfig } from './app-config';
import { GameController } from './game.controller';
import { HealthController } from './health.controller';
import { AnalyticsController } from './analytics.controller';
import { StoreLifecycle } from './lifecycle';
import { VkController } from './vk.controller';
import { createEphemeralStore } from './redis';

@Module({
  controllers: [HealthController, GameController, VkController, AnalyticsController],
  providers: [
    StoreLifecycle,
    {
      provide: 'APP_CONFIG',
      useFactory: () => loadAppConfig(),
    },
    {
      provide: 'STORE_BUNDLE',
      useFactory: async () => createGameStore(),
    },
    {
      provide: 'GAME_STORE',
      inject: ['STORE_BUNDLE'],
      useFactory: (bundle: StoreBundle) => bundle.store,
    },
    {
      provide: 'STORE_KIND',
      inject: ['STORE_BUNDLE'],
      useFactory: (bundle: StoreBundle) => bundle.kind,
    },
    {
      provide: GameRuntime,
      inject: ['GAME_STORE'],
      useFactory: (store: StoreBundle['store']) => new GameRuntime(store),
    },
    {
      provide: 'VK_CONFIG',
      inject: ['APP_CONFIG'],
      useFactory: () => loadVkConfig(),
    },
    {
      provide: 'VK_CLIENT',
      inject: ['VK_CONFIG'],
      useFactory: (config: ReturnType<typeof loadVkConfig>) => new VkApiClient(config),
    },
    {
      provide: 'EPHEMERAL_STORE',
      inject: ['APP_CONFIG'],
      useFactory: (config: AppConfig) => createEphemeralStore(config.rateLimit),
    },
    {
      provide: AbuseGuard,
      inject: ['EPHEMERAL_STORE', 'APP_CONFIG'],
      useFactory: (store: EphemeralStore, config: AppConfig) =>
        new AbuseGuard(store, loadAbusePolicy(process.env), config.rateLimit.enabled),
    },
    {
      provide: VkAdapter,
      inject: [GameRuntime, 'VK_CLIENT', 'VK_CONFIG', AbuseGuard],
      useFactory: (
        runtime: GameRuntime,
        client: VkApiClient,
        config: ReturnType<typeof loadVkConfig>,
        abuse: AbuseGuard,
      ) => new VkAdapter(runtime, { client, config, abuse }),
    },
  ],
})
export class AppModule {}
