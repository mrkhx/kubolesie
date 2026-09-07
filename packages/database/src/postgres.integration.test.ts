import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { GameRuntime, InsufficientResourcesError } from '@kubolesie/game-core';
import { RecordingVkApi, VkAdapter } from '@kubolesie/vk-bot';
import { PrismaClient } from './generated/client';
import { PrismaGameStore } from './prisma-store';

const url = process.env.TEST_DATABASE_URL ?? '';
const describePg = url ? describe : describe.skip;

const MIGRATIONS = [
  '20260906120000_init',
  '20260906180000_day_one',
  '20260906190000_crafting_pipeline',
  '20260906200000_week_one',
  '20260906210000_meta_progression',
  '20260907120000_hardening',
] as const;

const MIGRATIONS_DIR = join(__dirname, '../prisma/migrations');

function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function replaceDbName(connectionString: string, name: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function sqlFile(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
}

async function applySql(client: Client, name: string): Promise<void> {
  await client.query(sqlFile(name));
}

const vkConfig = {
  groupId: 111,
  groupToken: 'test-token',
  callbackSecret: 'test-secret',
  confirmationCode: 'confirm-code',
  apiVersion: '5.199',
  production: true,
};

describePg('postgresql production path', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let store: PrismaGameStore;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
      env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
      stdio: 'pipe',
      cwd: join(__dirname, '..'),
    });
    await prisma.$connect();
    store = new PrismaGameStore(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a player, plays Day 1 actions and persists profile after reconnect', async () => {
    const vkUserId = uid('persist');
    const startId = uid('pg-start');
    const runtimeA = new GameRuntime(store);
    const start = await runtimeA.handle({
      eventId: startId,
      identity: { provider: 'vk', providerUserId: vkUserId, displayName: 'Путник' },
      command: { type: 'START_GAME' },
    });
    expect(start.text).toMatch(/приходишь/i);
    await runtimeA.handle({
      eventId: uid('pg-wood'),
      identity: { provider: 'vk', providerUserId: vkUserId },
      command: { type: 'GATHER_WOOD' },
    });
    await runtimeA.handle({
      eventId: uid('pg-profile'),
      identity: { provider: 'vk', providerUserId: vkUserId },
      command: { type: 'OPEN_PROFILE' },
    });
    const first = await store.findPlayerByVkUserId(vkUserId);
    expect(first).not.toBeNull();
    const wood = (await store.getResources(first!.id)).LOG ?? 0;
    expect(wood).toBeGreaterThan(0);
    await store.setFlag(first!.id, 'pg_probe', '1');
    await prisma.$disconnect();

    const prismaB = new PrismaClient({ datasources: { db: { url } } });
    await prismaB.$connect();
    const storeB = new PrismaGameStore(prismaB);
    const again = await storeB.findPlayerByVkUserId(vkUserId);
    expect(again?.id).toBe(first!.id);
    expect(again?.vkUserId).toBe(vkUserId);
    expect((await storeB.getResources(again!.id)).LOG).toBe(wood);
    expect((await storeB.getFlags(again!.id)).pg_probe).toBe('1');
    expect(await storeB.findProcessedEvent(startId)).not.toBeNull();
    await prismaB.$disconnect();
    await prisma.$connect();
    store = new PrismaGameStore(prisma);
  });

  it('replays the same event_id after restart without a second mutation', async () => {
    const vkUserId = uid('replay');
    const event = {
      eventId: uid('pg-replay'),
      identity: { provider: 'vk' as const, providerUserId: vkUserId },
      command: { type: 'START_GAME' as const },
    };
    const runtime = new GameRuntime(store);
    const first = await runtime.handle(event);
    const player = await store.findPlayerByVkUserId(vkUserId);
    const energy = player!.energy;
    const prismaB = new PrismaClient({ datasources: { db: { url } } });
    await prismaB.$connect();
    const runtimeB = new GameRuntime(new PrismaGameStore(prismaB));
    const second = await runtimeB.handle(event);
    expect(second.text).toBe(first.text);
    const again = await new PrismaGameStore(prismaB).findPlayerByVkUserId(vkUserId);
    expect(again?.id).toBe(player!.id);
    expect(again?.energy).toBe(energy);
    await prismaB.$disconnect();
  });

  it('replays a VK callback after restart without double mutation', async () => {
    const fromId = Math.floor(1_000_000 + Math.random() * 1_000_000);
    const client = new RecordingVkApi();
    const adapter = new VkAdapter(new GameRuntime(store), {
      client,
      config: vkConfig,
      log: () => undefined,
    });
    const body = {
      type: 'message_new',
      event_id: uid('pg-vk'),
      group_id: 111,
      secret: 'test-secret',
      object: {
        message: {
          id: 9,
          peer_id: fromId,
          from_id: fromId,
          text: 'начать',
          out: 0,
          conversation_message_id: 3,
        },
      },
    };
    expect(await adapter.handleCallback(body)).toEqual({ status: 200, body: 'ok' });
    const player = await store.findPlayerByVkUserId(String(fromId));
    const energy = player!.energy;
    const firstRandom = client.sent[0]!.randomId;
    const prismaB = new PrismaClient({ datasources: { db: { url } } });
    await prismaB.$connect();
    const clientB = new RecordingVkApi();
    const adapterB = new VkAdapter(new GameRuntime(new PrismaGameStore(prismaB)), {
      client: clientB,
      config: vkConfig,
      log: () => undefined,
    });
    expect(await adapterB.handleCallback(body)).toEqual({ status: 200, body: 'ok' });
    const again = await new PrismaGameStore(prismaB).findPlayerByVkUserId(String(fromId));
    expect(again?.energy).toBe(energy);
    expect(clientB.sent[0]!.randomId).toBe(firstRandom);
    await prismaB.$disconnect();
  });

  it('lets only one of two concurrent spends succeed when amount is 1', async () => {
    const player = await store.createPlayer({ vkUserId: uid('spend'), name: 'Spend' });
    await store.addResource(player.id, 'LOG', 1);
    const results = await Promise.allSettled([
      store.addResource(player.id, 'LOG', -1),
      store.addResource(player.id, 'LOG', -1),
    ]);
    const ok = results.filter((row) => row.status === 'fulfilled');
    const failed = results.filter((row) => row.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientResourcesError);
    expect((await store.getResources(player.id)).LOG ?? 0).toBe(0);
  });

  it('keeps a player in exactly one clan under concurrent accepts', async () => {
    const suffix = uid('c');
    const a = await store.createPlayer({ vkUserId: uid('ca'), name: 'А' });
    const b = await store.createPlayer({ vkUserId: uid('cb'), name: 'Б' });
    const target = await store.createPlayer({ vkUserId: uid('ct'), name: 'Цель' });
    const clanA = await store.createClan({
      name: `Север${suffix}`,
      tag: suffix.slice(0, 4).toUpperCase(),
      description: '',
      leaderPlayerId: a.id,
    });
    const clanB = await store.createClan({
      name: `Юг${suffix}`,
      tag: `${suffix.slice(-4).toUpperCase()}`,
      description: '',
      leaderPlayerId: b.id,
    });
    const results = await Promise.allSettled([
      store.addClanMember({ clanId: clanA.id, playerId: target.id, role: 'MEMBER' }),
      store.addClanMember({ clanId: clanB.id, playerId: target.id, role: 'MEMBER' }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const membership = await store.getPlayerClan(target.id);
    expect(membership).not.toBeNull();
    const members = (await store.listClanMembers(clanA.id)).concat(await store.listClanMembers(clanB.id));
    expect(members.filter((row) => row.playerId === target.id)).toHaveLength(1);
  });

  it('grants an entitlement only once under a duplicate race', async () => {
    const player = await store.createPlayer({ vkUserId: uid('ent'), name: 'Ent' });
    const results = await Promise.all([
      store.tryGrantEntitlement(player.id, 'title_ash', 'grant'),
      store.tryGrantEntitlement(player.id, 'title_ash', 'grant'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.listEntitlements(player.id)).filter((row) => row.productId === 'title_ash')).toHaveLength(
      1,
    );
  });

  it('atomically increments weekly score', async () => {
    const player = await store.createPlayer({ vkUserId: uid('week'), name: 'Week' });
    const period = uid('2026-W37');
    await Promise.all([
      store.incrementWeeklyScore(player.id, period, 5),
      store.incrementWeeklyScore(player.id, period, 7),
    ]);
    expect(await store.getWeeklyScore(player.id, period)).toBe(12);
  });
});

describePg('postgresql upgrade path', () => {
  it('applies later migrations on a DB that already has a player', async () => {
    const admin = new Client({ connectionString: replaceDbName(url, 'postgres') });
    await admin.connect();
    const dbName = `kubolesie_upgrade_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();

    const upgradeUrl = replaceDbName(url, dbName);
    const db = new Client({ connectionString: upgradeUrl });
    await db.connect();
    try {
      await applySql(db, MIGRATIONS[0]);
      await applySql(db, MIGRATIONS[1]);
      await applySql(db, MIGRATIONS[2]);
      await db.query(
        `INSERT INTO players (id, vk_user_id, name, updated_at)
         VALUES ('p_up', 'vk-upgrade', 'Старый', NOW())`,
      );
      await db.query(
        `INSERT INTO player_resources (id, player_id, resource, amount, updated_at)
         VALUES ('r1', 'p_up', 'LOG', 4, NOW())`,
      );
      await db.query(
        `INSERT INTO player_flags (id, player_id, flag, value, updated_at)
         VALUES ('f1', 'p_up', 'day_1_complete', '1', NOW())`,
      );
      await applySql(db, MIGRATIONS[3]);
      await applySql(db, MIGRATIONS[4]);
      await applySql(db, MIGRATIONS[5]);
      const player = await db.query(`SELECT vk_user_id, name FROM players WHERE id = 'p_up'`);
      expect(player.rows[0]).toMatchObject({ vk_user_id: 'vk-upgrade', name: 'Старый' });
      const resources = await db.query(`SELECT amount FROM player_resources WHERE player_id = 'p_up'`);
      expect(Number(resources.rows[0].amount)).toBe(4);
      const flags = await db.query(`SELECT value FROM player_flags WHERE player_id = 'p_up'`);
      expect(flags.rows[0].value).toBe('1');
      await db.query(
        `INSERT INTO player_resources (id, player_id, resource, amount, updated_at)
         VALUES ('r2', 'p_up', 'IRON_INGOT', 1, NOW())`,
      );
      const weekly = await db.query(`SELECT to_regclass('public.player_weekly_scores') AS name`);
      expect(weekly.rows[0].name).toBe('player_weekly_scores');
    } finally {
      await db.end();
      const drop = new Client({ connectionString: replaceDbName(url, 'postgres') });
      await drop.connect();
      await drop.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await drop.end();
    }
  });
});
