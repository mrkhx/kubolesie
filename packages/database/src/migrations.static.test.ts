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
  '20260907180000_week_two',
  '20260907200000_pvp_analytics',
  '20260907210000_clans_1',
  '20260908120000_player_market_foundation',
  '20260908180000_market_auction_1',
  '20260908200000_jobs_production_1',
  '20260908210000_week_three',
  '20260909120000_week_four',
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
    expect(sql('20260907180000_week_two')).toMatch(/ADD VALUE 'SEED'/);
    expect(sql('20260907180000_week_two')).toMatch(/ADD VALUE 'BOG_CORE'/);
    expect(sql('20260907180000_week_two')).toMatch(/ADD VALUE 'SEAL_SHARD_6'/);
    expect(sql('20260907180000_week_two')).not.toMatch(/INSERT/i);
    expect(sql('20260908210000_week_three')).toMatch(/ADD VALUE 'ROOT_FIBER'/);
    expect(sql('20260908210000_week_three')).toMatch(/ADD VALUE 'ROOT_CORE'/);
    expect(sql('20260908210000_week_three')).toMatch(/ADD VALUE 'SEAL_SHARD_5'/);
    expect(sql('20260908210000_week_three')).not.toMatch(/INSERT/i);
    expect(sql('20260909120000_week_four')).toMatch(/ADD VALUE 'ROT_RESIN'/);
    expect(sql('20260909120000_week_four')).toMatch(/ADD VALUE 'BLACKROOT_CORE'/);
    expect(sql('20260909120000_week_four')).toMatch(/ADD VALUE 'SEAL_SHARD_4'/);
    expect(sql('20260909120000_week_four')).not.toMatch(/INSERT/i);
    expect(sql('20260907200000_pvp_analytics')).toMatch(/ADD VALUE 'PVP'/);
    expect(sql('20260907200000_pvp_analytics')).toMatch(/last_active_at/);
    expect(sql('20260907200000_pvp_analytics')).toMatch(/combat_matches_mode_started_at_idx/);
    expect(sql('20260907200000_pvp_analytics')).not.toMatch(/DROP TABLE "players"/);
    expect(sql('20260907210000_clans_1')).toMatch(/clan_task_progress/);
    expect(sql('20260907210000_clans_1')).toMatch(/disbanded_at/);
    expect(sql('20260907210000_clans_1')).toMatch(/clan_applications_one_pending_per_player/);
    expect(sql('20260907210000_clans_1')).not.toMatch(/DROP TABLE "clans"/);
    expect(sql('20260907210000_clans_1')).not.toMatch(/DROP TABLE "players"/);
    expect(sql('20260908120000_player_market_foundation')).toMatch(/CREATE TABLE "market_listings"/);
    expect(sql('20260908120000_player_market_foundation')).toMatch(/CREATE TABLE "market_transactions"/);
    expect(sql('20260908120000_player_market_foundation')).toMatch(/FIXED_PRICE/);
    expect(sql('20260908120000_player_market_foundation')).toMatch(/AUCTION/);
    expect(sql('20260908120000_player_market_foundation')).toMatch(/market_listings_status_asset_ref_unit_price_idx/);
    expect(sql('20260908120000_player_market_foundation')).not.toMatch(/DROP TABLE "players"/);
    expect(sql('20260908120000_player_market_foundation')).not.toMatch(/DROP TABLE "market_listings"/);
    expect(sql('20260908180000_market_auction_1')).toMatch(/CREATE TABLE "auction_bids"/);
    expect(sql('20260908180000_market_auction_1')).toMatch(/CREATE TABLE "player_notices"/);
    expect(sql('20260908180000_market_auction_1')).toMatch(/starting_price/);
    expect(sql('20260908180000_market_auction_1')).not.toMatch(/DROP TABLE "market_listings"/);
    expect(sql('20260908180000_market_auction_1')).not.toMatch(/DROP TABLE "players"/);
    expect(sql('20260908200000_jobs_production_1')).toMatch(/CREATE TABLE "player_jobs"/);
    expect(sql('20260908200000_jobs_production_1')).toMatch(/CREATE TABLE "player_job_tasks"/);
    expect(sql('20260908200000_jobs_production_1')).toMatch(/CREATE TABLE "player_production_buildings"/);
    expect(sql('20260908200000_jobs_production_1')).toMatch(/CREATE TABLE "production_events"/);
    expect(sql('20260908200000_jobs_production_1')).toMatch(/player_job_tasks_one_accepted_per_profession/);
    expect(sql('20260908200000_jobs_production_1')).not.toMatch(/DROP TABLE "players"/);
    expect(sql('20260908200000_jobs_production_1')).not.toMatch(/DROP TABLE "market_listings"/);
  });
});
