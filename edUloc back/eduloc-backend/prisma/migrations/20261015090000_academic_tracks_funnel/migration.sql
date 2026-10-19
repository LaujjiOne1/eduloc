-- Entonnoir de recherche Niveau → Filière (série / mention) → Matière.

-- CreateEnum
CREATE TYPE "TrackKind" AS ENUM ('SERIE', 'MENTION');

-- CreateTable
CREATE TABLE "academic_tracks" (
    "id" TEXT NOT NULL,
    "kind" "TrackKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "programme" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_tracks_kind_isActive_idx" ON "academic_tracks"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "academic_tracks_kind_code_key" ON "academic_tracks"("kind", "code");

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "trackCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "trackId" TEXT;

-- CreateIndex
CREATE INDEX "offers_trackId_idx" ON "offers"("trackId");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "academic_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une série ne porte ni domaine ni mention ; une mention porte son domaine et pas de programme.
ALTER TABLE "academic_tracks" ADD CONSTRAINT "academic_tracks_kind_check"
  CHECK (
    ("kind" = 'SERIE' AND "domain" IS NULL AND "programme" IN ('NOUVEAU', 'ANCIEN'))
    OR ("kind" = 'MENTION' AND "domain" IS NOT NULL AND "programme" IS NULL)
  );

-- ------------------------------------------------------------
-- Catalogue : nomenclature nationale du Primaire (11ème → 7ème)
-- ------------------------------------------------------------
UPDATE "education_levels" SET "name" = CASE "name"
  WHEN 'CP1' THEN '11ème' WHEN 'CP2' THEN '10ème' WHEN 'CE' THEN '9ème' WHEN 'CM1' THEN '8ème' WHEN 'CM2' THEN '7ème'
END
WHERE "category" = 'Primaire' AND "name" IN ('CP1', 'CP2', 'CE', 'CM1', 'CM2');

-- Doctorat par année : l'ancien niveau unique « Doctorat » est conservé (rang 9) mais n'est plus proposé.
INSERT INTO "education_levels" ("id", "name", "category", "displayOrder", "isActive", "requiredDegree", "academicRank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, 'Université', 1100 + v.ord, true, 'DOCTORAT', 9, now(), now()
FROM (VALUES ('Doctorat 1', 1), ('Doctorat 2', 2), ('Doctorat 3', 3)) AS v(name, ord)
ON CONFLICT ("name", "category") DO NOTHING;

UPDATE "education_levels" SET "isActive" = false WHERE "category" = 'Université' AND "name" = 'Doctorat';

-- Matière : intitulé complet du programme du collège.
UPDATE "subjects" SET "name" = 'Sciences de la Vie et de la Terre (SVT)', "aliases" = ARRAY['SVT']
WHERE "name" = 'SVT';
