-- Week 4 Rotten Trail resources. Additive enum values only.
-- Do not reference these values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'ROT_RESIN';
ALTER TYPE "ResourceType" ADD VALUE 'BLACKROOT_CORE';
ALTER TYPE "ResourceType" ADD VALUE 'SEAL_SHARD_4';
