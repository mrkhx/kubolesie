-- AlterTable
ALTER TABLE "clans" ADD COLUMN "disbanded_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "clans_disbanded_at_idx" ON "clans"("disbanded_at");

-- CreateIndex
CREATE INDEX "clan_contributions_period_key_idx" ON "clan_contributions"("period_key");

-- One pending application per player (race-safe join)
CREATE UNIQUE INDEX "clan_applications_one_pending_per_player"
  ON "clan_applications"("player_id")
  WHERE status = 'PENDING';

-- CreateTable
CREATE TABLE "clan_task_progress" (
    "id" TEXT NOT NULL,
    "clan_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "clan_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clan_task_progress_clan_id_period_key_task_id_key" ON "clan_task_progress"("clan_id", "period_key", "task_id");

-- CreateIndex
CREATE INDEX "clan_task_progress_period_key_idx" ON "clan_task_progress"("period_key");

-- CreateIndex
CREATE INDEX "clan_task_progress_completed_at_idx" ON "clan_task_progress"("completed_at");

-- AddForeignKey
ALTER TABLE "clan_task_progress" ADD CONSTRAINT "clan_task_progress_clan_id_fkey" FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
