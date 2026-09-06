import { QUEST_TEMPLATES } from '@kubolesie/content';
import { MemoryGameStore, type GameStore } from '@kubolesie/game-core';
import { PrismaClient } from './generated/client';
import { PrismaGameStore } from './prisma-store';

export { PrismaClient } from './generated/client';
export { PrismaGameStore } from './prisma-store';

export async function createGameStore(): Promise<{ store: GameStore; kind: 'prisma' | 'memory'; prisma?: PrismaClient }> {
  const explicit = process.env.GAME_STORE;
  const databaseUrl = process.env.DATABASE_URL;
  const wantPrisma = explicit === 'prisma' || (!explicit && Boolean(databaseUrl));

  if (wantPrisma && databaseUrl) {
    try {
      const prisma = new PrismaClient();
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
      console.warn('[database] Prisma unavailable, falling back to memory store:', (error as Error).message);
    }
  }

  const filePath = process.env.MEMORY_STORE_PATH;
  const store = await MemoryGameStore.load(filePath);
  console.warn(
    '[database] Using in-memory store. PostgreSQL is the source of truth — set DATABASE_URL for persistence.',
  );
  return { store, kind: 'memory' };
}
