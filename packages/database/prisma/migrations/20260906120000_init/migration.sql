-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('WOOD', 'STONE', 'IRON_ORE', 'FIBER', 'HIDE', 'HERBS', 'COAL');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "EquipmentSlot" AS ENUM ('WEAPON', 'HEAD', 'CHEST', 'HANDS', 'LEGS', 'FEET', 'AMULET', 'RING');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'ACTIVE', 'COMPLETED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ItemHistoryType" AS ENUM ('CREATED', 'LOOTED', 'EQUIPPED', 'SALVAGED', 'SOLD', 'DESTROYED');

-- CreateEnum
CREATE TYPE "BattleEventType" AS ENUM ('HIT', 'CRIT', 'DODGE', 'DEFEAT');

-- CreateEnum
CREATE TYPE "CombatMode" AS ENUM ('PVE');

-- CreateEnum
CREATE TYPE "CombatResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('COINS');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "vk_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "max_hp" INTEGER NOT NULL DEFAULT 100,
    "energy" INTEGER NOT NULL DEFAULT 20,
    "max_energy" INTEGER NOT NULL DEFAULT 20,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "current_location" TEXT NOT NULL DEFAULT 'forest_clearing',
    "current_state" TEXT NOT NULL DEFAULT 'start',
    "last_energy_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_daily_reset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_stats" (
    "player_id" TEXT NOT NULL,
    "attack" INTEGER NOT NULL DEFAULT 5,
    "defense" INTEGER NOT NULL DEFAULT 0,
    "speed" INTEGER NOT NULL DEFAULT 10,
    "crit_chance" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "crit_damage" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "dodge" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "luck" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_resources" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "resource" "ResourceType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "item_level" INTEGER NOT NULL DEFAULT 1,
    "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
    "enhance_level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_equipment" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "slot" "EquipmentSlot" NOT NULL,
    "item_id" TEXT NOT NULL,

    CONSTRAINT "player_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_flags" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '1',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_relations" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "npc_id" TEXT NOT NULL,
    "trust" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "npc_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_templates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "default_status" "QuestStatus" NOT NULL DEFAULT 'LOCKED',

    CONSTRAINT "quest_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_quests" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "quest_id" TEXT NOT NULL,
    "status" "QuestStatus" NOT NULL DEFAULT 'LOCKED',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "player_id" TEXT,
    "command" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "reward_type" TEXT NOT NULL,
    "reward_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_transactions" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_history" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "type" "ItemHistoryType" NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combat_matches" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "mode" "CombatMode" NOT NULL DEFAULT 'PVE',
    "enemy_id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "balance_version" TEXT NOT NULL,
    "result" "CombatResult",
    "player_snapshot" JSONB NOT NULL,
    "enemy_snapshot" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "combat_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combat_events" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "type" "BattleEventType" NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "combat_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_vk_user_id_key" ON "players"("vk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_resources_player_id_resource_key" ON "player_resources"("player_id", "resource");

-- CreateIndex
CREATE INDEX "inventory_items_player_id_idx" ON "inventory_items"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_equipment_player_id_slot_key" ON "player_equipment"("player_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "player_equipment_item_id_key" ON "player_equipment"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_flags_player_id_flag_key" ON "player_flags"("player_id", "flag");

-- CreateIndex
CREATE UNIQUE INDEX "npc_relations_player_id_npc_id_key" ON "npc_relations"("player_id", "npc_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_quests_player_id_quest_id_key" ON "player_quests"("player_id", "quest_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");

-- CreateIndex
CREATE INDEX "processed_events_player_id_idx" ON "processed_events"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_player_id_reward_type_reward_ref_key" ON "reward_claims"("player_id", "reward_type", "reward_ref");

-- CreateIndex
CREATE INDEX "currency_transactions_player_id_created_at_idx" ON "currency_transactions"("player_id", "created_at");

-- CreateIndex
CREATE INDEX "item_history_item_id_idx" ON "item_history"("item_id");

-- CreateIndex
CREATE INDEX "combat_matches_player_id_started_at_idx" ON "combat_matches"("player_id", "started_at");

-- CreateIndex
CREATE INDEX "combat_events_match_id_turn_idx" ON "combat_events"("match_id", "turn");

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_resources" ADD CONSTRAINT "player_resources_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_flags" ADD CONSTRAINT "player_flags_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_relations" ADD CONSTRAINT "npc_relations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quest_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_events" ADD CONSTRAINT "processed_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_transactions" ADD CONSTRAINT "currency_transactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combat_matches" ADD CONSTRAINT "combat_matches_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combat_events" ADD CONSTRAINT "combat_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "combat_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
