-- Import de CV : étape en cours (affichée dans l'app) et cache par empreinte du fichier (un ré-import du même CV
-- ne repasse ni par l'OCR ni par le modèle de langage).
ALTER TABLE "cv_imports" ADD COLUMN "stage" TEXT;
ALTER TABLE "cv_imports" ADD COLUMN "fileHash" TEXT;
ALTER TABLE "cv_imports" ADD COLUMN "llmEntries" JSONB;

CREATE INDEX "cv_imports_userId_fileHash_idx" ON "cv_imports"("userId", "fileHash");
