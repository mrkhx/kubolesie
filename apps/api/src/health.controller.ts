import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BALANCE_VERSION, PROTOTYPE_VERSION } from '@kubolesie/shared';
import { pingPrisma, type StoreBundle } from '@kubolesie/database';
import { describeVkConfig, isVkCallbackReady } from '@kubolesie/vk-bot';
import type { AppConfig } from './app-config';

@Controller()
export class HealthController {
  constructor(
    @Inject('APP_CONFIG') private readonly appConfig: AppConfig,
    @Inject('STORE_BUNDLE') private readonly bundle: StoreBundle,
  ) {}

  @Get('/health')
  health() {
    return {
      ok: true,
      status: 'ok',
      service: 'kubolesie-api',
      version: this.appConfig.version,
      prototypeVersion: PROTOTYPE_VERSION,
      balanceVersion: BALANCE_VERSION,
      commit: this.appConfig.commitSha,
      env: this.appConfig.nodeEnv,
      vkConfigured: isVkCallbackReady(this.appConfig.vk),
      database: {
        configured: this.appConfig.database.dbConfigured,
        provider: this.appConfig.database.dbProvider,
      },
    };
  }

  @Get('/v1/health')
  healthV1() {
    return this.health();
  }

  @Get(['/ready', '/v1/ready'])
  async ready() {
    const result = await this.checkReady();
    if (!result.ready) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  @Get('/v1/health/vk')
  vkHealth() {
    return describeVkConfig(this.appConfig.vk);
  }

  async checkReady(): Promise<{
    ready: boolean;
    database: 'ok' | 'down' | 'memory';
    store: 'prisma' | 'memory';
    vkConfigured: boolean;
  }> {
    const vkConfigured = isVkCallbackReady(this.appConfig.vk);
    if (this.appConfig.production && !this.bundle.prisma) {
      return { ready: false, database: 'down', store: this.bundle.kind, vkConfigured };
    }
    if (this.bundle.prisma) {
      const ok = await pingPrisma(this.bundle.prisma);
      return {
        ready: ok,
        database: ok ? 'ok' : 'down',
        store: 'prisma',
        vkConfigured,
      };
    }
    return {
      ready: !this.appConfig.production,
      database: 'memory',
      store: 'memory',
      vkConfigured,
    };
  }
}
