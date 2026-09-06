import { PrismaClient } from '../src/generated/client';
import { QUEST_TEMPLATES } from '@kubolesie/content';

const prisma = new PrismaClient();

async function main() {
  for (const quest of QUEST_TEMPLATES) {
    await prisma.questTemplate.upsert({
      where: { id: quest.id },
      update: {
        title: quest.title,
        description: quest.description,
        defaultStatus: quest.defaultStatus,
      },
      create: {
        id: quest.id,
        title: quest.title,
        description: quest.description,
        defaultStatus: quest.defaultStatus,
      },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${QUEST_TEMPLATES.length} quest template(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
