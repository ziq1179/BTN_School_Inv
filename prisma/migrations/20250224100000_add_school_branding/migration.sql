-- CreateTable
CREATE TABLE "School" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'By The Numb3rs',
    "logoPath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- Insert default row (id=1) so client can update it
INSERT INTO "School" ("id", "name", "logoPath", "updatedAt")
VALUES (1, 'By The Numb3rs', NULL, NOW());
