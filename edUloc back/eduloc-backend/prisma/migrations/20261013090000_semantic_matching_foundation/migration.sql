-- ============================================================
-- Lot 1 — Fondations du matching sémantique (eduloc-recherche-semantique.md §3, + exigences E2/E3/E6/E9).
-- ============================================================

-- ------------------------------------------------------------
-- pgvector. En tête : l'extension doit exister avant la création de la colonne `vector`.
-- Supabase installe les extensions dans le schéma « extensions » (déjà dans le search_path du rôle) ;
-- sans ce schéma (PostgreSQL local), l'extension va dans « public ».
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END
$$;

-- Rang de diplôme (spec §3.1). OTHER / NULL = 0 : non admissible tant qu'aucune équivalence n'est appliquée.
-- Conservée pour les flux existants ; l'éligibilité universitaire utilise désormais education_levels."academicRank".
CREATE OR REPLACE FUNCTION degree_rank(d text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE d
    WHEN 'BAC' THEN 1 WHEN 'LICENCE' THEN 2
    WHEN 'MASTER' THEN 3 WHEN 'DOCTORAT' THEN 4
    ELSE 0 END
$$;

-- CreateEnum
CREATE TYPE "SearchChunkSource" AS ENUM ('PROFILE', 'SUBJECT', 'EXPERIENCE', 'OFFER', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "DegreeEquivalenceStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- AlterEnum (CV, relevé de notes, certificat de scolarité)
ALTER TYPE "TutorDocumentType" ADD VALUE 'CV';
ALTER TYPE "TutorDocumentType" ADD VALUE 'TRANSCRIPT';
ALTER TYPE "TutorDocumentType" ADD VALUE 'ENROLLMENT_CERTIFICATE';

-- AlterTable
ALTER TABLE "beneficiaries" ADD COLUMN     "institution" TEXT,
ADD COLUMN     "studyProgram" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "matchingSearchId" TEXT;

-- AlterTable
ALTER TABLE "education_levels" ADD COLUMN     "academicRank" INTEGER;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tutor_documents" ADD COLUMN     "autoCheck" JSONB,
ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "extractionStatus" "TranscriptStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "academicLevelId" TEXT,
ADD COLUMN     "academicLevelNote" TEXT,
ADD COLUMN     "academicLevelValidatedAt" TIMESTAMP(3),
ADD COLUMN     "academicLevelValidatedById" TEXT,
ADD COLUMN     "degreeCountry" TEXT,
ADD COLUMN     "degreeEquivalenceId" TEXT,
ADD COLUMN     "degreeInstitution" TEXT,
ADD COLUMN     "degreeTitle" TEXT,
ADD COLUMN     "fieldOfStudy" TEXT,
ADD COLUMN     "searchIndexedAt" TIMESTAMP(3),
ADD COLUMN     "specialization" TEXT;

-- CreateTable
CREATE TABLE "degree_equivalences" (
    "id" TEXT NOT NULL,
    "degreeTitle" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT '',
    "equivalentDegree" TEXT,
    "equivalentLevelId" TEXT,
    "status" "DegreeEquivalenceStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "degree_equivalences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_search_chunks" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "sourceType" "SearchChunkSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "subjectId" TEXT,
    "embedding" vector(768),
    "embeddingModel" TEXT NOT NULL,
    "embeddedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_search_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_searches" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "educationLevelId" TEXT NOT NULL,
    "subjectId" TEXT,
    "subjectText" TEXT,
    "needDescription" TEXT NOT NULL,
    "objective" "ObjectiveType",
    "format" "TeachingFormat",
    "candidateCount" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "degree_equivalences_status_idx" ON "degree_equivalences"("status");

-- CreateIndex
CREATE UNIQUE INDEX "degree_equivalences_degreeTitle_country_specialty_key" ON "degree_equivalences"("degreeTitle", "country", "specialty");

-- CreateIndex
CREATE INDEX "tutor_search_chunks_tutorProfileId_idx" ON "tutor_search_chunks"("tutorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_search_chunks_tutorProfileId_sourceType_sourceId_chun_key" ON "tutor_search_chunks"("tutorProfileId", "sourceType", "sourceId", "chunkIndex");

-- CreateIndex
CREATE INDEX "matching_searches_requesterId_createdAt_idx" ON "matching_searches"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_matchingSearchId_idx" ON "bookings"("matchingSearchId");

-- CreateIndex
CREATE INDEX "tutor_profiles_academicLevelId_idx" ON "tutor_profiles"("academicLevelId");

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_degreeEquivalenceId_fkey" FOREIGN KEY ("degreeEquivalenceId") REFERENCES "degree_equivalences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_academicLevelId_fkey" FOREIGN KEY ("academicLevelId") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_academicLevelValidatedById_fkey" FOREIGN KEY ("academicLevelValidatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_matchingSearchId_fkey" FOREIGN KEY ("matchingSearchId") REFERENCES "matching_searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "degree_equivalences" ADD CONSTRAINT "degree_equivalences_equivalentLevelId_fkey" FOREIGN KEY ("equivalentLevelId") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "degree_equivalences" ADD CONSTRAINT "degree_equivalences_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_search_chunks" ADD CONSTRAINT "tutor_search_chunks_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_searches" ADD CONSTRAINT "matching_searches_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_searches" ADD CONSTRAINT "matching_searches_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- Contraintes de cohérence (non exprimables en Prisma)
-- ------------------------------------------------------------
ALTER TABLE "education_levels" ADD CONSTRAINT "education_levels_academicRank_check"
  CHECK ("academicRank" IS NULL OR "academicRank" BETWEEN 1 AND 9);

-- Un niveau académique est toujours accompagné de sa date de validation, et inversement
-- (l'auteur peut disparaître : ON DELETE SET NULL).
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_academic_level_validation_check"
  CHECK (("academicLevelId" IS NULL) = ("academicLevelValidatedAt" IS NULL));

ALTER TABLE "degree_equivalences" ADD CONSTRAINT "degree_equivalences_decision_check"
  CHECK (
    ("equivalentDegree" IS NULL OR "equivalentDegree" IN ('BAC', 'LICENCE', 'MASTER', 'DOCTORAT'))
    AND ("status" <> 'VALIDATED' OR ("equivalentDegree" IS NOT NULL AND "equivalentLevelId" IS NOT NULL))
    AND ("status" <> 'REJECTED' OR ("equivalentDegree" IS NULL AND "equivalentLevelId" IS NULL))
  );

-- ------------------------------------------------------------
-- Échelle académique (E2) : rang rempli d'après les libellés RÉELS du catalogue.
--   Primaire < Collège < Lycée/Bac < L1 < L2 < L3 < M1 < M2 < Doctorat  →  1 … 9
-- Copie SQL de src/modules/catalog/domain/academic-scale.ts (vérifiée par les tests).
-- ------------------------------------------------------------

-- Le catalogue d'origine n'a qu'un niveau « Master » : on crée Master 1, Master 2 et Doctorat.
-- requiredDegree (flux existants de saisie du dossier tuteur) suit la convention déjà en place pour « Master ».
INSERT INTO "education_levels" ("id", "name", "category", "displayOrder", "isActive", "requiredDegree", "academicRank", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, 'Université', 1000 + v.ord, true, v.required_degree, v.academic_rank, now(), now()
FROM (VALUES
  ('Master 1', 1, 'MASTER',   7),
  ('Master 2', 2, 'MASTER',   8),
  ('Doctorat', 3, 'DOCTORAT', 9)
) AS v(name, ord, required_degree, academic_rank)
ON CONFLICT ("name", "category") DO NOTHING;

UPDATE "education_levels" SET "academicRank" = CASE
  WHEN "category" = 'Primaire' THEN 1
  WHEN "category" = 'Collège' THEN 2
  WHEN "category" = 'Lycée' THEN 3
  WHEN "category" = 'Université' AND "name" = 'Licence 1' THEN 4
  WHEN "category" = 'Université' AND "name" = 'Licence 2' THEN 5
  WHEN "category" = 'Université' AND "name" = 'Licence 3' THEN 6
  WHEN "category" = 'Université' AND "name" IN ('Master 1', 'Master') THEN 7
  WHEN "category" = 'Université' AND "name" = 'Master 2' THEN 8
  WHEN "category" = 'Université' AND "name" = 'Doctorat' THEN 9
  ELSE NULL  -- hors échelle (ex. « Formation pro »)
END;

-- L'ancien niveau « Master » reste en base (références existantes : matières, offres, bénéficiaires) avec le rang M1,
-- mais n'est plus proposé pour de nouvelles saisies.
UPDATE "education_levels" SET "isActive" = false WHERE "category" = 'Université' AND "name" = 'Master';

-- Ordre d'affichage cohérent avec l'échelle (displayOrder n'entre jamais dans l'éligibilité).
UPDATE "education_levels" e SET "displayOrder" = r.rn
FROM (
  SELECT "id", row_number() OVER (ORDER BY "academicRank" ASC NULLS LAST, "displayOrder" ASC, "name" ASC) AS rn
  FROM "education_levels"
) r
WHERE e."id" = r."id";
