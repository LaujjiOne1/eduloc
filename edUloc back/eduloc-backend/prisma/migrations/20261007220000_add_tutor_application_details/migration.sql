CREATE TYPE "TutorExperienceType" AS ENUM ('PROFESSIONAL', 'ACADEMIC');

ALTER TABLE "places" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "places_single_primary_per_tutor_idx"
    ON "places"("tutorProfileId") WHERE "isPrimary" = true;

CREATE TABLE "tutor_experiences" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "type" "TutorExperienceType" NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_experiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tutor_intro_videos" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileName" TEXT,
    "durationMs" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_intro_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tutor_experiences_tutorProfileId_type_idx"
    ON "tutor_experiences"("tutorProfileId", "type");
CREATE UNIQUE INDEX "tutor_intro_videos_tutorProfileId_key"
    ON "tutor_intro_videos"("tutorProfileId");
CREATE UNIQUE INDEX "tutor_intro_videos_storagePath_key"
    ON "tutor_intro_videos"("storagePath");

ALTER TABLE "tutor_experiences"
    ADD CONSTRAINT "tutor_experiences_tutorProfileId_fkey"
    FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_intro_videos"
    ADD CONSTRAINT "tutor_intro_videos_tutorProfileId_fkey"
    FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
