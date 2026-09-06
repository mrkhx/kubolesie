-- AlterEnum
ALTER TYPE "ResourceType" ADD VALUE 'RAW_MEAT';
ALTER TYPE "ResourceType" ADD VALUE 'SHREW_FUR';
ALTER TYPE "ResourceType" ADD VALUE 'CHITIN_PLATE';
ALTER TYPE "ResourceType" ADD VALUE 'SHINY_STONE';
ALTER TYPE "ResourceType" ADD VALUE 'FOOD';

-- CreateTable
CREATE TABLE "player_discoveries" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "discovery_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT true,
    "defeated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_discoveries_player_id_discovery_id_key" ON "player_discoveries"("player_id", "discovery_id");

-- AddForeignKey
ALTER TABLE "player_discoveries" ADD CONSTRAINT "player_discoveries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
