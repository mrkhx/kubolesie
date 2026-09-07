import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(__dirname, '../prisma/migrations');

const EXPECTED = [
  '20260906120000_init',
  '20260906180000_day_one',
  '20260906190000_crafting_pipeline',
  '20260906200000_week_one',
  '20260906210000_meta_progression',
  '20260907120000_hardening',
  '20260907130000_products_premium_default',
] as const;

function sql(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
}

describe('prisma migrations (static)', () => {
  it('keeps the additive migrations in order and does not reset schema', () => {
    const dirs = readdirSync(MIGRATIONS_DIR).filter((name) => existsSync(join(MIGRATIONS_DIR, name, 'migration.sql')));
    expect(dirs).toEqual([...EXPECTED]);
    for (const name of dirs) {
      const body = sql(name);
      expect(body).not.toMatch(/DROP DATABASE/i);
      expect(body).not.toMatch(/prisma migrate reset/i);
    }
  });

  it('init creates processed_events uniqueness and players.vk_user_id', () => {
    const body = sql('20260906120000_init');
    expect(body).toMatch(/CREATE TABLE "players"/);
    expect(body).toMatch(/vk_user_id/);
    expect(body).toMatch(/CREATE TABLE "processed_events"/);
    expect(body).toMatch(/processed_events_event_id_key/);
  });

  it('evolves ResourceType without rewriting init: LOG then IRON_INGOT', () => {
    expect(sql('20260906190000_crafting_pipeline')).toMatch(/ADD VALUE 'LOG'/);
    expect(sql('20260906190000_crafting_pipeline')).toMatch(/ADD VALUE 'PLANK'/);
    expect(sql('20260906190000_crafting_pipeline')).toMatch(/ADD VALUE 'STICK'/);
    expect(sql('20260906190000_crafting_pipeline')).toMatch(/ADD VALUE 'COBBLESTONE'/);
    expect(sql('20260906200000_week_one')).toMatch(/ADD VALUE 'IRON_INGOT'/);
    expect(sql('20260906120000_init')).not.toMatch(/IRON_INGOT/);
  });

  it('hardening adds weekly scores and non-negative CHECKs without dropping players', () => {
    const body = sql('20260907120000_hardening');
    expect(body).toMatch(/CREATE TABLE "player_weekly_scores"/);
    expect(body).toMatch(/player_resources_amount_nonnegative/);
    expect(body).toMatch(/players_coins_nonnegative/);
    expect(body).not.toMatch(/DROP TABLE "players"/);
    expect(body).toMatch(/ON CONFLICT \("player_id", "period_key"\) DO NOTHING/);
  });

  it('does not use a newly added enum value in the same migration (PG 55P04)', () => {
    for (const name of EXPECTED) {
      const body = sql(name);
      const added = [...body.matchAll(/ALTER TYPE "[^"]+" ADD VALUE '([^']+)'/g)].map((match) => match[1]);
      const remainder = body.replace(/ALTER TYPE "[^"]+" ADD VALUE '[^']+'/g, '');
      for (const value of added) {
        expect(remainder, `${name} still references newly added '${value}'`).not.toContain(`'${value}'`);
      }
    }
    expect(sql('20260906210000_meta_progression')).toMatch(/ADD VALUE 'PREMIUM'/);
    expect(sql('20260907130000_products_premium_default')).toMatch(/SET DEFAULT 'PREMIUM'/);
  });
});
