import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`[api] Kubolesie prototype 0.0.3 listening on ${host}:${port}`);
  console.log('[api] VK is an interface only. Game core does not require VK_GROUP_TOKEN.');
}

void bootstrap();
