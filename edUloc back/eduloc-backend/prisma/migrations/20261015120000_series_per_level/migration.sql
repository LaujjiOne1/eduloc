-- Les séries du lycée sont propres à un niveau : Première (PS, POSE, PL, PA1…) et Terminale (TS, TOSE, TL, TA1…)
-- existent en parallèle. Les séries déjà créées deviennent celles de la Terminale ; celles de la Première sont
-- ajoutées par le seed.

ALTER TABLE "academic_tracks" ADD COLUMN "levelName" TEXT;

UPDATE "academic_tracks" SET "code" = 'T' || "code", "levelName" = 'Terminale' WHERE "kind" = 'SERIE';

-- Matières : chaque code de série (S) devient ses deux parallèles (PS, TS).
UPDATE "subjects"
SET "trackCodes" = ARRAY(SELECT 'P' || c FROM unnest("trackCodes") AS c UNION ALL SELECT 'T' || c FROM unnest("trackCodes") AS c)
WHERE cardinality("trackCodes") > 0 AND NOT ("trackCodes" && ARRAY['PS', 'TS', 'POSE', 'TOSE', 'PL', 'TL']);

ALTER TABLE "academic_tracks" DROP CONSTRAINT "academic_tracks_kind_check";
ALTER TABLE "academic_tracks" ADD CONSTRAINT "academic_tracks_kind_check"
  CHECK (
    ("kind" = 'SERIE' AND "domain" IS NULL AND "programme" IN ('NOUVEAU', 'ANCIEN') AND "levelName" IN ('Première', 'Terminale'))
    OR ("kind" = 'MENTION' AND "domain" IS NOT NULL AND "programme" IS NULL AND "levelName" IS NULL)
  );
