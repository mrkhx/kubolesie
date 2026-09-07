-- AlterEnum
ALTER TYPE "CombatMode" ADD VALUE 'PVP';

-- AlterTable
ALTER TABLE "players" ADD COLUMN "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "players" SET "last_active_at" = "updated_at" WHERE "last_active_at" IS DISTINCT FROM "updated_at";

-- AlterTable
ALTER TABLE "combat_matches" ADD COLUMN "opponent_player_id" TEXT;
ALTER TABLE "combat_matches" ADD COLUMN "season_id" TEXT NOT NULL DEFAULT 'season_0';
ALTER TABLE "combat_matches" ADD COLUMN "attacker_rating_before" INTEGER;
ALTER TABLE "combat_matches" ADD COLUMN "attacker_rating_after" INTEGER;
ALTER TABLE "combat_matches" ADD COLUMN "defender_rating_before" INTEGER;
ALTER TABLE "combat_matches" ADD COLUMN "defender_rating_after" INTEGER;
ALTER TABLE "combat_matches" ADD COLUMN "reward_tier" TEXT;

-- CreateIndex
CREATE INDEX "players_created_at_idx" ON "players"("created_at");
CREATE INDEX "players_last_active_at_idx" ON "players"("last_active_at");
CREATE INDEX "player_flags_flag_idx" ON "player_flags"("flag");
CREATE INDEX "processed_events_created_at_idx" ON "processed_events"("created_at");
CREATE INDEX "combat_matches_mode_started_at_idx" ON "combat_matches"("mode", "started_at");
CREATE INDEX "combat_matches_player_id_mode_started_at_idx" ON "combat_matches"("player_id", "mode", "started_at");
CREATE INDEX "combat_matches_opponent_player_id_started_at_idx" ON "combat_matches"("opponent_player_id", "started_at");
