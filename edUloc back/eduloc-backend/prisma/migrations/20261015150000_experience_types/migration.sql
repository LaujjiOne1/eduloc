-- Un seul formulaire d'expérience, avec un type : enseignement / soutien scolaire, encadrement académique,
-- professionnelle, projet académique, bénévolat. PROFESSIONAL et ACADEMIC existants gardent leur sens.
ALTER TYPE "TutorExperienceType" ADD VALUE 'TEACHING';
ALTER TYPE "TutorExperienceType" ADD VALUE 'SUPERVISION';
ALTER TYPE "TutorExperienceType" ADD VALUE 'VOLUNTEER';

ALTER TABLE "tutor_experiences" ADD COLUMN "audience" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "subjectsTaught" TEXT;
