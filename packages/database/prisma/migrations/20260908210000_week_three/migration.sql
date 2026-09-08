-- Week 3 Rootwood resources. Additive enum values only.
-- Do not reference these values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'ROOT_FIBER';
ALTER TYPE "ResourceType" ADD VALUE 'ROOT_CORE';
ALTER TYPE "ResourceType" ADD VALUE 'SEAL_SHARD_5';
