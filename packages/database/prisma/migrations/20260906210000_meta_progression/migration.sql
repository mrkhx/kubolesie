-- AlterEnum
ALTER TYPE "CurrencyCode" ADD VALUE 'PREMIUM';

-- AlterTable
ALTER TABLE "players" ADD COLUMN "premium" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "player_statistics" (
    "player_id" TEXT NOT NULL,
    "pve_wins" INTEGER NOT NULL DEFAULT 0,
    "pve_losses" INTEGER NOT NULL DEFAULT 0,
    "pvp_wins" INTEGER NOT NULL DEFAULT 0,
    "pvp_losses" INTEGER NOT NULL DEFAULT 0,
    "boss_wins" INTEGER NOT NULL DEFAULT 0,
    "boss_losses" INTEGER NOT NULL DEFAULT 0,
    "crafted_items" INTEGER NOT NULL DEFAULT 0,
    "resources_gathered" INTEGER NOT NULL DEFAULT 0,
    "items_looted" INTEGER NOT NULL DEFAULT 0,
    "rare_items_found" INTEGER NOT NULL DEFAULT 0,
    "coins_earned" INTEGER NOT NULL DEFAULT 0,
    "coins_spent" INTEGER NOT NULL DEFAULT 0,
    "trades_completed" INTEGER NOT NULL DEFAULT 0,
    "quests_completed" INTEGER NOT NULL DEFAULT 0,
    "daily_quests_completed" INTEGER NOT NULL DEFAULT 0,
    "days_completed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_statistics_pkey" PRIMARY KEY ("player_id")
);

CREATE TABLE "player_boss_stats" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "boss_id" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_boss_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_ratings" (
    "player_id" TEXT NOT NULL,
    "pvp_rating" INTEGER NOT NULL DEFAULT 1000,
    "lifetime_score" INTEGER NOT NULL DEFAULT 0,
    "weekly_score" INTEGER NOT NULL DEFAULT 0,
    "weekly_period" TEXT NOT NULL DEFAULT '',
    "season_id" TEXT NOT NULL DEFAULT 'season_0',
    "weekly_pvp_opponents" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_ratings_pkey" PRIMARY KEY ("player_id")
);

CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "tag_key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "leader_player_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clan_members" (
    "id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clan_applications" (
    "id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clan_invites" (
    "id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "from_player_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clan_contributions" (
    "id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "clan_contributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'COINS',
    "availability" TEXT NOT NULL DEFAULT 'CATALOG',
    "season_id" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_entitlements" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "external_transaction_id" TEXT,

    CONSTRAINT "player_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_cosmetics" (
    "player_id" TEXT NOT NULL,
    "profile_frame" TEXT,
    "title" TEXT,
    "badge" TEXT,
    "camp_theme" TEXT,
    "chat_badge" TEXT,

    CONSTRAINT "player_cosmetics_pkey" PRIMARY KEY ("player_id")
);

CREATE TABLE "player_achievements" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_boss_stats_player_id_boss_id_key" ON "player_boss_stats"("player_id", "boss_id");
CREATE INDEX "player_boss_stats_player_id_idx" ON "player_boss_stats"("player_id");
CREATE INDEX "player_ratings_lifetime_score_idx" ON "player_ratings"("lifetime_score" DESC);
CREATE INDEX "player_ratings_pvp_rating_idx" ON "player_ratings"("pvp_rating" DESC);
CREATE INDEX "player_ratings_weekly_period_weekly_score_idx" ON "player_ratings"("weekly_period", "weekly_score" DESC);
CREATE UNIQUE INDEX "clans_name_key_key" ON "clans"("name_key");
CREATE UNIQUE INDEX "clans_tag_key_key" ON "clans"("tag_key");
CREATE INDEX "clans_xp_idx" ON "clans"("xp" DESC);
CREATE UNIQUE INDEX "clan_members_player_id_key" ON "clan_members"("player_id");
CREATE INDEX "clan_members_clan_id_idx" ON "clan_members"("clan_id");
CREATE INDEX "clan_applications_clan_id_status_idx" ON "clan_applications"("clan_id", "status");
CREATE INDEX "clan_applications_player_id_status_idx" ON "clan_applications"("player_id", "status");
CREATE UNIQUE INDEX "clan_applications_pending_unique" ON "clan_applications"("clan_id", "player_id") WHERE "status" = 'PENDING';
CREATE INDEX "clan_invites_player_id_status_idx" ON "clan_invites"("player_id", "status");
CREATE INDEX "clan_invites_clan_id_status_idx" ON "clan_invites"("clan_id", "status");
CREATE UNIQUE INDEX "clan_contributions_clan_id_player_id_period_key_key" ON "clan_contributions"("clan_id", "player_id", "period_key");
CREATE INDEX "clan_contributions_clan_id_period_key_idx" ON "clan_contributions"("clan_id", "period_key");
CREATE UNIQUE INDEX "player_entitlements_player_id_product_id_key" ON "player_entitlements"("player_id", "product_id");
CREATE INDEX "player_entitlements_player_id_idx" ON "player_entitlements"("player_id");
CREATE UNIQUE INDEX "player_achievements_player_id_achievement_id_key" ON "player_achievements"("player_id", "achievement_id");

-- AddForeignKey
ALTER TABLE "player_statistics" ADD CONSTRAINT "player_statistics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_boss_stats" ADD CONSTRAINT "player_boss_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clans" ADD CONSTRAINT "clans_leader_player_id_fkey" FOREIGN KEY ("leader_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_from_player_id_fkey" FOREIGN KEY ("from_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_contributions" ADD CONSTRAINT "clan_contributions_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_contributions" ADD CONSTRAINT "clan_contributions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_entitlements" ADD CONSTRAINT "player_entitlements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_cosmetics" ADD CONSTRAINT "player_cosmetics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
