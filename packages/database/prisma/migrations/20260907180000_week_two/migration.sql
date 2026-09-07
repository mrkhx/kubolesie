-- Additive Week 2 resources. Do not reference new values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'SEED';
ALTER TYPE "ResourceType" ADD VALUE 'WHEAT';
ALTER TYPE "ResourceType" ADD VALUE 'STRING';
ALTER TYPE "ResourceType" ADD VALUE 'REED';
ALTER TYPE "ResourceType" ADD VALUE 'CLAY';
ALTER TYPE "ResourceType" ADD VALUE 'RAW_FISH';
ALTER TYPE "ResourceType" ADD VALUE 'COOKED_FISH';
ALTER TYPE "ResourceType" ADD VALUE 'MIST_RESIN';
ALTER TYPE "ResourceType" ADD VALUE 'BOG_CORE';
ALTER TYPE "ResourceType" ADD VALUE 'SEAL_SHARD_6';
