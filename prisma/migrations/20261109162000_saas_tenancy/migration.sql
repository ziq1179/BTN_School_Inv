-- SaaS conversion: multi-tenancy (shared database, tenantId per row)
-- Additive: existing rows are backfilled into tenant 1 ("By The Numb3rs").

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Seed the original single-tenant school as tenant 1 (PRO, keeps all features)
INSERT INTO "Tenant" ("name", "slug", "plan", "status", "createdAt", "updatedAt")
VALUES ('By The Numb3rs', 'by-the-numb3rs', 'PRO', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add tenantId columns (nullable first, backfill, then enforce NOT NULL)
ALTER TABLE "Category" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "Item" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "School" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "User" ADD COLUMN "tenantId" INTEGER;

-- Backfill all existing data to tenant 1
UPDATE "Category" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
UPDATE "Item" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
UPDATE "School" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
UPDATE "Transaction" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
UPDATE "User" SET "tenantId" = 1 WHERE "tenantId" IS NULL;

-- Drop old single-tenant unique constraints
DROP INDEX "Category_name_key";
DROP INDEX "Item_sku_key";

-- Enforce NOT NULL
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "School" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;

-- Branding default for new schools
ALTER TABLE "School" ALTER COLUMN "name" SET DEFAULT 'My School';

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");
CREATE UNIQUE INDEX "Category_tenantId_name_key" ON "Category"("tenantId", "name");
CREATE INDEX "Item_tenantId_idx" ON "Item"("tenantId");
CREATE UNIQUE INDEX "Item_tenantId_sku_key" ON "Item"("tenantId", "sku");
CREATE UNIQUE INDEX "School_tenantId_key" ON "School"("tenantId");
CREATE INDEX "Transaction_tenantId_idx" ON "Transaction"("tenantId");
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "School" ADD CONSTRAINT "School_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Resync id sequences. The 20250224100000_add_school_branding migration inserted
-- School id=1 with an explicit id (never calling nextval), leaving School_id_seq
-- behind the table — every implicit insert then collided on School_pkey.
SELECT setval('"School_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "School"));
SELECT setval('"Category_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "Category"));
SELECT setval('"Item_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "Item"));
SELECT setval('"Transaction_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "Transaction"));
SELECT setval('"User_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "User"));
SELECT setval('"Tenant_id_seq"', (SELECT COALESCE(MAX("id"), 1) FROM "Tenant"));
