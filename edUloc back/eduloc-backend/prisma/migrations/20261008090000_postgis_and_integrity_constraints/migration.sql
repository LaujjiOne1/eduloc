-- ============================================================
-- Contraintes non exprimables en Prisma (cf. prisma/sql/001_constraints.sql).
-- Elles n'avaient jamais été migrées : `places.location` était une colonne
-- simple jamais renseignée (la recherche géographique ne trouvait rien) et
-- l'intégrité des réservations n'était pas garantie par la base.
-- Migration idempotente.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Colonne géographique GÉNÉRÉE à partir de latitude / longitude.
ALTER TABLE places DROP COLUMN IF EXISTS location;
ALTER TABLE places
  ADD COLUMN location geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS places_location_gist ON places USING gist (location);
CREATE INDEX IF NOT EXISTS offers_search_idx
  ON offers ("subjectId", "educationLevelId") WHERE "isActive";

-- Anti-chevauchement : filet de sécurité final de UC-T03.
-- tsrange (et non tstzrange) : Prisma crée des colonnes timestamp sans fuseau.
-- Les PENDING ne bloquent pas (arbitrage à l'acceptation + auto-refus SYSTEM).
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    "tutorProfileId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status IN ('CONFIRMED', 'IN_PROGRESS'));

-- CHECK de cohérence
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_time_order;
ALTER TABLE bookings ADD CONSTRAINT bookings_time_order CHECK ("endAt" > "startAt");

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_range;
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

ALTER TABLE availabilities
  DROP CONSTRAINT IF EXISTS availabilities_dow,
  DROP CONSTRAINT IF EXISTS availabilities_fmt,
  DROP CONSTRAINT IF EXISTS availabilities_order;
ALTER TABLE availabilities
  ADD CONSTRAINT availabilities_dow CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT availabilities_fmt CHECK ("startTime" ~ '^([01]\d|2[0-3]):[0-5]\d$'
                                       AND "endTime"   ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  ADD CONSTRAINT availabilities_order CHECK ("endTime" > "startTime");

-- Une seule candidature PENDING par tuteur
CREATE UNIQUE INDEX IF NOT EXISTS tutor_applications_one_pending
  ON tutor_applications ("tutorProfileId") WHERE status = 'PENDING';
