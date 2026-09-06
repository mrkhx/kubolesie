import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Background worker skeleton.
 * Energy is regenerated lazily on player access — there is no energy cron.
 * Redis is used for queues/locks only. Progress lives in PostgreSQL.
 */
async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log(
      '[worker] REDIS_URL is not set. Worker idle. Energy uses lazy regeneration, no cron.',
    );
    return;
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const auditQueue = new Queue('audit', { connection });

  new Worker(
    'audit',
    async (job) => {
      console.log('[worker:audit]', job.name, job.data);
    },
    { connection },
  );

  await auditQueue.add('boot', { at: new Date().toISOString() });
  console.log('[worker] queues: audit. Energy regeneration is lazy — no energy cron.');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
