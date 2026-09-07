-- CreateTable
CREATE TABLE "player_weekly_scores" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_weekly_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_weekly_scores_player_id_period_key_key" ON "player_weekly_scores"("player_id", "period_key");
CREATE INDEX "player_weekly_scores_period_key_score_idx" ON "player_weekly_scores"("period_key", "score" DESC);

ALTER TABLE "player_weekly_scores" ADD CONSTRAINT "player_weekly_scores_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Non-negative inventory / currency invariants
ALTER TABLE "player_resources" ADD CONSTRAINT "player_resources_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "players" ADD CONSTRAINT "players_coins_nonnegative" CHECK ("coins" >= 0);
ALTER TABLE "players" ADD CONSTRAINT "players_premium_nonnegative" CHECK ("premium" >= 0);
ALTER TABLE "player_weekly_scores" ADD CONSTRAINT "player_weekly_scores_score_nonnegative" CHECK ("score" >= 0);

-- Seed current weekly buckets so history is not empty after deploy
INSERT INTO "player_weekly_scores" ("id", "player_id", "period_key", "score")
SELECT md5(random()::text || clock_timestamp()::text || "player_id"), "player_id", "weekly_period", "weekly_score"
FROM "player_ratings"
WHERE "weekly_period" <> '' AND "weekly_score" > 0
ON CONFLICT ("player_id", "period_key") DO NOTHING;
