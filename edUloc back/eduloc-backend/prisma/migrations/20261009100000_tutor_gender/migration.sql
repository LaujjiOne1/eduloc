-- Sexe du tuteur : avatar par défaut (silhouette homme / femme) quand il n'a pas de photo de profil.
ALTER TABLE "tutor_profiles" ADD COLUMN "gender" TEXT;
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_gender_check"
  CHECK ("gender" IS NULL OR "gender" IN ('MALE', 'FEMALE'));
