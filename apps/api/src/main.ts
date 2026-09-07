import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { VK_CALLBACK_JSON_LIMIT } from '@kubolesie/vk-bot';
import { AppModule } from './app.module';
import { assertProductionReady, loadAppConfig, logAppStartup } from './app-config';

async function bootstrap() {
  const config = loadAppConfig();
  assertProductionReady(config);
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.enableShutdownHooks();
  app.use(json({ limit: VK_CALLBACK_JSON_LIMIT }));
  app.use(urlencoded({ extended: true, limit: VK_CALLBACK_JSON_LIMIT }));
  logAppStartup(config);
  await app.listen(config.port, config.host);
  console.log(`[api] Kubolesie prototype ${config.prototypeVersion} listening on ${config.host}:${config.port}`);
  console.log('[api] VK is an interface only. Canonical callback: POST /vk/callback');
}

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api] startup failed:', message);
  process.exit(1);
});
