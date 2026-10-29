-- Matières propres à certains niveaux d'un même cycle (primaire : anglais, sciences et technologie, histoire, géographie dès la 8ème).

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "excludedLevels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
