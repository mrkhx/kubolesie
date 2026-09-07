import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { loadVkConfig, logVkStartup, VK_CALLBACK_JSON_LIMIT } from '@kubolesie/vk-bot';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.use(json({ limit: VK_CALLBACK_JSON_LIMIT }));
  app.use(urlencoded({ extended: true, limit: VK_CALLBACK_JSON_LIMIT }));
  logVkStartup(loadVkConfig());
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`[api] Kubolesie prototype 0.0.3 listening on ${host}:${port}`);
  console.log('[api] VK is an interface only. Callback: POST /vk/callback');
}

void bootstrap();
