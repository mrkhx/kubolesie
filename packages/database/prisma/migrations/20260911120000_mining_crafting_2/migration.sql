-- Mining & Crafting 2.0 resources. Additive enum values only.
-- Do not reference these values in this migration (PG 55P04).
ALTER TYPE "ResourceType" ADD VALUE 'COPPER_ORE';
ALTER TYPE "ResourceType" ADD VALUE 'COPPER_INGOT';
ALTER TYPE "ResourceType" ADD VALUE 'TIN_ORE';
ALTER TYPE "ResourceType" ADD VALUE 'TIN_INGOT';
ALTER TYPE "ResourceType" ADD VALUE 'BRONZE_INGOT';
ALTER TYPE "ResourceType" ADD VALUE 'SILVER_ORE';
ALTER TYPE "ResourceType" ADD VALUE 'SILVER_INGOT';
ALTER TYPE "ResourceType" ADD VALUE 'GOLD_ORE';
ALTER TYPE "ResourceType" ADD VALUE 'GOLD_INGOT';
ALTER TYPE "ResourceType" ADD VALUE 'DEEP_CRYSTAL';
ALTER TYPE "ResourceType" ADD VALUE 'COPPER_FITTING';
