-- CreateEnum
CREATE TYPE "MarketListingType" AS ENUM ('FIXED_PRICE', 'AUCTION');

-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MarketAssetKind" AS ENUM ('RESOURCE');

-- CreateTable
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "seller_player_id" TEXT NOT NULL,
    "listing_type" "MarketListingType" NOT NULL,
    "asset_kind" "MarketAssetKind" NOT NULL,
    "asset_ref" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "buyer_player_id" TEXT,
    "sold_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "request_id" TEXT,

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "market_listings_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "market_listings_unit_price_positive" CHECK ("unit_price" > 0),
    CONSTRAINT "market_listings_total_price_positive" CHECK ("total_price" > 0)
);

-- CreateTable
CREATE TABLE "market_transactions" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "seller_player_id" TEXT NOT NULL,
    "buyer_player_id" TEXT NOT NULL,
    "asset_kind" "MarketAssetKind" NOT NULL,
    "asset_ref" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "gross_price" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "seller_net" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,

    CONSTRAINT "market_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "market_transactions_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "market_transactions_gross_nonnegative" CHECK ("gross_price" >= 0),
    CONSTRAINT "market_transactions_fee_nonnegative" CHECK ("fee" >= 0),
    CONSTRAINT "market_transactions_net_nonnegative" CHECK ("seller_net" >= 0)
);

CREATE UNIQUE INDEX "market_listings_request_id_key" ON "market_listings"("request_id") WHERE "request_id" IS NOT NULL;
CREATE UNIQUE INDEX "market_transactions_request_id_key" ON "market_transactions"("request_id") WHERE "request_id" IS NOT NULL;
CREATE UNIQUE INDEX "market_transactions_listing_id_key" ON "market_transactions"("listing_id");

CREATE INDEX "market_listings_status_asset_ref_unit_price_idx" ON "market_listings"("status", "asset_ref", "unit_price");
CREATE INDEX "market_listings_seller_player_id_status_idx" ON "market_listings"("seller_player_id", "status");
CREATE INDEX "market_listings_expires_at_idx" ON "market_listings"("expires_at");
CREATE INDEX "market_listings_status_expires_at_idx" ON "market_listings"("status", "expires_at");
CREATE INDEX "market_listings_created_at_idx" ON "market_listings"("created_at");
CREATE INDEX "market_transactions_created_at_idx" ON "market_transactions"("created_at");
CREATE INDEX "market_transactions_seller_player_id_created_at_idx" ON "market_transactions"("seller_player_id", "created_at");
CREATE INDEX "market_transactions_buyer_player_id_created_at_idx" ON "market_transactions"("buyer_player_id", "created_at");

ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_seller_player_id_fkey" FOREIGN KEY ("seller_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_buyer_player_id_fkey" FOREIGN KEY ("buyer_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "market_transactions" ADD CONSTRAINT "market_transactions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "market_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "market_transactions" ADD CONSTRAINT "market_transactions_seller_player_id_fkey" FOREIGN KEY ("seller_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_transactions" ADD CONSTRAINT "market_transactions_buyer_player_id_fkey" FOREIGN KEY ("buyer_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
