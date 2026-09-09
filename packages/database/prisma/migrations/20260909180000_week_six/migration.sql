-- Week 6 Abandoned Station resources. Additive enum values only.
-- Do not reference these values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'GEAR_SCRAP';
ALTER TYPE "ResourceType" ADD VALUE 'STATION_CORE';
ALTER TYPE "ResourceType" ADD VALUE 'SEAL_SHARD_2';
