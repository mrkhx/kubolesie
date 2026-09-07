import {
  Controller,
  Get,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BALANCE_VERSION, PROTOTYPE_VERSION } from '@kubolesie/shared';
import { pingPrisma, type StoreBundle } from '@kubolesie/database';
import { describeVkConfig, isVkCallbackReady, type EphemeralStore } from '@kubolesie/vk-bot';
import type { AppConfig } from './app-config';

@Controller()
export class HealthController {
  constructor(
    @Inject('APP_CONFIG') private readonly appConfig: AppConfig,
    @Inject('STORE_BUNDLE') private readonly bundle: StoreBundle,
    @Optional() @Inject('EPHEMERAL_STORE') private readonly ephemeral?: EphemeralStore | null,
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
      redisConfigured: this.appConfig.rateLimit.redisConfigured,
      rateLimitEnabled: this.appConfig.rateLimit.enabled,
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
    redis: 'ok' | 'down' | 'memory' | 'disabled';
  }> {
    const vkConfigured = isVkCallbackReady(this.appConfig.vk);
    const redis = await this.redisStatus();
    const redisBlocking =
      this.appConfig.rateLimit.enabled &&
      (this.appConfig.production || this.appConfig.rateLimit.backend === 'redis') &&
      redis !== 'ok' &&
      redis !== 'memory' &&
      redis !== 'disabled';

    if (this.appConfig.production && !this.bundle.prisma) {
      return { ready: false, database: 'down', store: this.bundle.kind, vkConfigured, redis };
    }
    if (this.bundle.prisma) {
      const ok = await pingPrisma(this.bundle.prisma);
      return {
        ready: ok && !redisBlocking,
        database: ok ? 'ok' : 'down',
        store: 'prisma',
        vkConfigured,
        redis,
      };
    }
    return {
      ready: !this.appConfig.production && !redisBlocking,
      database: 'memory',
      store: 'memory',
      vkConfigured,
      redis,
    };
  }

  private async redisStatus(): Promise<'ok' | 'down' | 'memory' | 'disabled'> {
    const { rateLimit } = this.appConfig;
    if (!rateLimit.enabled) return 'disabled';
    if (this.appConfig.production && rateLimit.enabled && !rateLimit.redisUrl) return 'down';
    if (rateLimit.backend !== 'redis') return 'memory';
    if (!this.ephemeral) return 'down';
    const ok = await this.ephemeral.ping();
    return ok ? 'ok' : 'down';
  }
}
