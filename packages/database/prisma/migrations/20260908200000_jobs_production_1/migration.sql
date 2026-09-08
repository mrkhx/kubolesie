CREATE TYPE "JobProfession" AS ENUM ('LOGGER', 'MINER', 'FARMER', 'FISHER', 'HUNTER', 'CRAFTER');
CREATE TYPE "JobTaskStatus" AS ENUM ('ACCEPTED', 'COMPLETED');
CREATE TYPE "ProductionBuildingType" AS ENUM ('WHEAT_FARM', 'SAWMILL', 'QUARRY', 'MINE', 'FISHERY', 'PEN');
CREATE TYPE "ProductionEventKind" AS ENUM ('TICK', 'COLLECT', 'BUILD', 'UPGRADE');

CREATE TABLE "player_jobs" (
    "player_id" TEXT NOT NULL,
    "profession" "JobProfession" NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "daily_completed" INTEGER NOT NULL DEFAULT 0,
    "daily_period" TEXT NOT NULL DEFAULT '',
    "last_completed_at" TIMESTAMP(3),
    "coins_earned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_jobs_pkey" PRIMARY KEY ("player_id", "profession"),
    CONSTRAINT "player_jobs_xp_nonnegative" CHECK ("xp" >= 0),
    CONSTRAINT "player_jobs_level_range" CHECK ("level" >= 1 AND "level" <= 20),
    CONSTRAINT "player_jobs_completed_count_nonnegative" CHECK ("completed_count" >= 0),
    CONSTRAINT "player_jobs_daily_completed_nonnegative" CHECK ("daily_completed" >= 0),
    CONSTRAINT "player_jobs_coins_earned_nonnegative" CHECK ("coins_earned" >= 0)
);

CREATE INDEX "player_jobs_profession_level_idx" ON "player_jobs"("profession", "level");

CREATE TABLE "player_job_tasks" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "profession" "JobProfession" NOT NULL,
    "template_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "period_key" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL,
    "job_xp" INTEGER NOT NULL,
    "player_xp" INTEGER NOT NULL,
    "status" "JobTaskStatus" NOT NULL DEFAULT 'ACCEPTED',
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "request_id" TEXT,

    CONSTRAINT "player_job_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "player_job_tasks_slot_range" CHECK ("slot" >= 0 AND "slot" <= 2),
    CONSTRAINT "player_job_tasks_target_positive" CHECK ("target" > 0),
    CONSTRAINT "player_job_tasks_progress_nonnegative" CHECK ("progress" >= 0),
    CONSTRAINT "player_job_tasks_progress_lte_target" CHECK ("progress" <= "target"),
    CONSTRAINT "player_job_tasks_coins_nonnegative" CHECK ("coins" >= 0),
    CONSTRAINT "player_job_tasks_job_xp_nonnegative" CHECK ("job_xp" >= 0),
    CONSTRAINT "player_job_tasks_player_xp_nonnegative" CHECK ("player_xp" >= 0)
);

CREATE UNIQUE INDEX "player_job_tasks_player_id_profession_period_key_template_id_key" ON "player_job_tasks"("player_id", "profession", "period_key", "template_id");
CREATE INDEX "player_job_tasks_player_id_profession_status_idx" ON "player_job_tasks"("player_id", "profession", "status");
CREATE INDEX "player_job_tasks_period_key_profession_idx" ON "player_job_tasks"("period_key", "profession");
CREATE INDEX "player_job_tasks_completed_at_idx" ON "player_job_tasks"("completed_at");
CREATE UNIQUE INDEX "player_job_tasks_one_accepted_per_profession" ON "player_job_tasks"("player_id", "profession") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "player_job_tasks_request_id_key" ON "player_job_tasks"("request_id") WHERE "request_id" IS NOT NULL;

CREATE TABLE "player_production_buildings" (
    "player_id" TEXT NOT NULL,
    "building_type" "ProductionBuildingType" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "stored_primary" INTEGER NOT NULL DEFAULT 0,
    "stored_secondary" INTEGER NOT NULL DEFAULT 0,
    "acc_primary_milli" INTEGER NOT NULL DEFAULT 0,
    "acc_secondary_milli" INTEGER NOT NULL DEFAULT 0,
    "last_calculated_at" TIMESTAMP(3) NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upgraded_at" TIMESTAMP(3),

    CONSTRAINT "player_production_buildings_pkey" PRIMARY KEY ("player_id", "building_type"),
    CONSTRAINT "player_production_buildings_level_range" CHECK ("level" >= 1 AND "level" <= 10),
    CONSTRAINT "player_production_buildings_stored_primary_nonnegative" CHECK ("stored_primary" >= 0),
    CONSTRAINT "player_production_buildings_stored_secondary_nonnegative" CHECK ("stored_secondary" >= 0),
    CONSTRAINT "player_production_buildings_acc_primary_nonnegative" CHECK ("acc_primary_milli" >= 0),
    CONSTRAINT "player_production_buildings_acc_secondary_nonnegative" CHECK ("acc_secondary_milli" >= 0)
);

CREATE INDEX "player_production_buildings_building_type_level_idx" ON "player_production_buildings"("building_type", "level");

CREATE TABLE "production_events" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "building_type" "ProductionBuildingType" NOT NULL,
    "kind" "ProductionEventKind" NOT NULL,
    "primary_amount" INTEGER NOT NULL DEFAULT 0,
    "secondary_amount" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "resource_units" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,

    CONSTRAINT "production_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_events_primary_amount_nonnegative" CHECK ("primary_amount" >= 0),
    CONSTRAINT "production_events_secondary_amount_nonnegative" CHECK ("secondary_amount" >= 0),
    CONSTRAINT "production_events_resource_units_nonnegative" CHECK ("resource_units" >= 0)
);

CREATE INDEX "production_events_created_at_idx" ON "production_events"("created_at");
CREATE INDEX "production_events_kind_created_at_idx" ON "production_events"("kind", "created_at");
CREATE INDEX "production_events_building_type_created_at_idx" ON "production_events"("building_type", "created_at");
CREATE INDEX "production_events_player_id_created_at_idx" ON "production_events"("player_id", "created_at");
CREATE UNIQUE INDEX "production_events_request_id_key" ON "production_events"("request_id") WHERE "request_id" IS NOT NULL;

ALTER TABLE "player_jobs" ADD CONSTRAINT "player_jobs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_job_tasks" ADD CONSTRAINT "player_job_tasks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_job_tasks" ADD CONSTRAINT "player_job_tasks_player_id_profession_fkey" FOREIGN KEY ("player_id", "profession") REFERENCES "player_jobs"("player_id", "profession") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "player_production_buildings" ADD CONSTRAINT "player_production_buildings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_events" ADD CONSTRAINT "production_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
