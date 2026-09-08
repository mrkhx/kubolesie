ALTER TABLE "market_listings" ADD COLUMN "starting_price" INTEGER;
ALTER TABLE "market_listings" ADD COLUMN "current_bid" INTEGER;
ALTER TABLE "market_listings" ADD COLUMN "current_bidder_player_id" TEXT;
ALTER TABLE "market_listings" ADD COLUMN "buyout_price" INTEGER;
ALTER TABLE "market_listings" ADD COLUMN "bid_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "market_listings" ADD COLUMN "extension_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "market_listings_listing_type_status_expires_at_idx" ON "market_listings"("listing_type", "status", "expires_at");
CREATE INDEX "market_listings_current_bidder_player_id_status_idx" ON "market_listings"("current_bidder_player_id", "status");

ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_current_bidder_player_id_fkey" FOREIGN KEY ("current_bidder_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "AuctionBidStatus" AS ENUM ('HOLD', 'REFUNDED', 'SETTLED', 'SUPERSEDED');

CREATE TABLE "auction_bids" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "bidder_player_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "AuctionBidStatus" NOT NULL DEFAULT 'HOLD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auction_bids_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "auction_bids_listing_id_created_at_idx" ON "auction_bids"("listing_id", "created_at");
CREATE INDEX "auction_bids_bidder_player_id_created_at_idx" ON "auction_bids"("bidder_player_id", "created_at");
CREATE UNIQUE INDEX "auction_bids_request_id_key" ON "auction_bids"("request_id") WHERE "request_id" IS NOT NULL;

ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "market_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidder_player_id_fkey" FOREIGN KEY ("bidder_player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "player_notices" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "listing_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "player_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "player_notices_player_id_read_at_idx" ON "player_notices"("player_id", "read_at");
CREATE INDEX "player_notices_player_id_created_at_idx" ON "player_notices"("player_id", "created_at");

ALTER TABLE "player_notices" ADD CONSTRAINT "player_notices_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
