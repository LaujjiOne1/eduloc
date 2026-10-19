-- Import de CV (OCR + extraction structurée) pour pré-remplir le dossier tuteur.
CREATE TYPE "CvImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

CREATE TABLE "cv_imports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CvImportStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "result" JSONB,
    "errorCode" TEXT,
    "ocrEngine" TEXT,
    "model" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cv_imports_storagePath_key" ON "cv_imports"("storagePath");
CREATE INDEX "cv_imports_userId_createdAt_idx" ON "cv_imports"("userId", "createdAt");

ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
