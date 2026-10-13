-- Compétences : niveaux d'enseignement par matière, création libre par les tuteurs, diplôme requis par niveau.
ALTER TABLE "subjects"
  ADD COLUMN "levelCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT;

ALTER TABLE "subjects"
  ADD CONSTRAINT "subjects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "subjects_createdById_idx" ON "subjects"("createdById");

ALTER TABLE "education_levels" ADD COLUMN "requiredDegree" TEXT NOT NULL DEFAULT 'BAC';
UPDATE "education_levels" SET "requiredDegree" = 'LICENCE' WHERE "category" = 'Université';
UPDATE "education_levels" SET "requiredDegree" = 'MASTER' WHERE "category" = 'Université' AND "name" = 'Master';

ALTER TABLE "tutor_profiles" ADD COLUMN "highestDegree" TEXT;
ALTER TABLE "education_levels" ADD CONSTRAINT "education_levels_requiredDegree_check"
  CHECK ("requiredDegree" IN ('BAC', 'LICENCE', 'MASTER', 'DOCTORAT'));
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_highestDegree_check"
  CHECK ("highestDegree" IS NULL OR "highestDegree" IN ('BAC', 'LICENCE', 'MASTER', 'DOCTORAT', 'OTHER'));
