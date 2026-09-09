-- Week 5 Black Marsh resources. Additive enum values only.
-- Do not reference these values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'BLACK_REED';
ALTER TYPE "ResourceType" ADD VALUE 'MARSH_HEART';
ALTER TYPE "ResourceType" ADD VALUE 'SEAL_SHARD_3';
