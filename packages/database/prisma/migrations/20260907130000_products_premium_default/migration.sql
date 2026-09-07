-- PostgreSQL forbids using a newly added enum value in the same transaction
-- that executed ALTER TYPE ... ADD VALUE (error 55P04). PREMIUM was added in
-- 20260906210000_meta_progression; set the catalog default after that commit.
ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'PREMIUM';
