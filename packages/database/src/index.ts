import { QUEST_TEMPLATES } from '@kubolesie/content';
import { MemoryGameStore, type GameStore } from '@kubolesie/game-core';
import { PrismaClient } from './generated/client';
import { PrismaGameStore } from './prisma-store';
import {
  assertDatabaseReady,
  loadDatabaseConfig,
  sanitizeDatabaseError,
} from './config';

export { PrismaClient } from './generated/client';
export { PrismaGameStore } from './prisma-store';
export {
  assertDatabaseReady,
  DatabaseConfigError,
  describeDatabaseConfig,
  loadDatabaseConfig,
  redactDatabaseUrl,
  sanitizeDatabaseError,
  type DatabaseConfig,
} from './config';

export interface StoreBundle {
  store: GameStore;
  kind: 'prisma' | 'memory';
  prisma?: PrismaClient;
}

export async function pingPrisma(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function createGameStore(
  env: NodeJS.Dict<string> = process.env,
): Promise<StoreBundle> {
  const config = loadDatabaseConfig(env);
  assertDatabaseReady(config);

  const wantPrisma =
    config.gameStore === 'prisma' || (!config.gameStore && Boolean(config.databaseUrl));

  if (config.production || (wantPrisma && config.databaseUrl)) {
    if (!config.databaseUrl) {
      throw new Error('[database] DATABASE_URL is required');
    }
    const prisma = new PrismaClient({
      datasources: { db: { url: config.databaseUrl } },
    });
    try {
      await prisma.$connect();
      const store = new PrismaGameStore(prisma);
      for (const quest of QUEST_TEMPLATES) {
        await store.upsertQuestTemplate({
          id: quest.id,
          title: quest.title,
          description: quest.description,
          defaultStatus: quest.defaultStatus,
        });
      }
      return { store, kind: 'prisma', prisma };
    } catch (error) {
      await prisma.$disconnect().catch(() => undefined);
      if (config.production) {
        throw new Error(`[database] PostgreSQL unavailable in production: ${sanitizeDatabaseError(error)}`);
      }
      console.warn(
        '[database] Prisma unavailable, falling back to memory store:',
        sanitizeDatabaseError(error),
      );
    }
  }

  if (config.production) {
    throw new Error('[database] production forbids MemoryStore');
  }

  const filePath = env.MEMORY_STORE_PATH;
  const store = await MemoryGameStore.load(filePath);
  console.warn(
    '[database] Using in-memory store. PostgreSQL is the source of truth — set DATABASE_URL for persistence.',
  );
  return { store, kind: 'memory' };
}
