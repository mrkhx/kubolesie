import { Controller, Get, Inject } from '@nestjs/common';
import { describeVkConfig, isVkCallbackReady, type VkConfig } from '@kubolesie/vk-bot';

@Controller()
export class HealthController {
  constructor(@Inject('VK_CONFIG') private readonly vkConfig: VkConfig) {}

  @Get('/health')
  health() {
    return {
      ok: true,
      service: 'kubolesie-api',
      version: '0.0.3',
      env: process.env.NODE_ENV ?? 'development',
      vkConfigured: isVkCallbackReady(this.vkConfig),
    };
  }

  @Get('/v1/health')
  healthV1() {
    return this.health();
  }

  @Get('/v1/health/vk')
  vkHealth() {
    return describeVkConfig(this.vkConfig);
  }
}
