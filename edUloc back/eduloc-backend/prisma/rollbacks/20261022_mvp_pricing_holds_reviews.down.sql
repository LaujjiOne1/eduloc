-- Retour arrière MANUEL des migrations
--   20261022064942_booking_pricing_holds
--   20261022065823_room_reviews_venue_statuses
-- À exécuter dans une transaction, APRÈS sauvegarde (pg_dump -Fc), puis à retirer du journal Prisma :
--   DELETE FROM _prisma_migrations WHERE migration_name IN ('20261022065823_room_reviews_venue_statuses', '20261022064942_booking_pricing_holds');
--
-- Perte assumée : décomposition du prix des réservations, blocages, avis sur les salles, NIF / STAT, taux de commission.
-- Les valeurs d'enum ajoutées (VenueStatus REJECTED / DISABLED, VenueType TRAINING_CENTER / COMPANY) ne sont PAS retirées :
-- PostgreSQL ne sait pas supprimer une valeur d'enum. Elles sont inoffensives ; mais AVANT ce script, repasser les
-- structures concernées à un statut / type connu de l'ancien code :
--   UPDATE partner_venues SET status = 'SUSPENDED' WHERE status IN ('REJECTED', 'DISABLED');
--   UPDATE partner_venues SET type = 'OTHER' WHERE type IN ('TRAINING_CENTER', 'COMPANY');
-- En cas de doute, restaurer la sauvegarde complète plutôt que d'exécuter ce script.

BEGIN;

UPDATE partner_venues SET status = 'SUSPENDED' WHERE status IN ('REJECTED', 'DISABLED');
UPDATE partner_venues SET type = 'OTHER' WHERE type IN ('TRAINING_CENTER', 'COMPANY');

DROP TABLE IF EXISTS room_reviews;
DROP TABLE IF EXISTS booking_holds;
DROP TYPE IF EXISTS "HoldStatus";

ALTER TABLE rooms DROP COLUMN IF EXISTS rating, DROP COLUMN IF EXISTS "reviewsCount", DROP COLUMN IF EXISTS "commissionRate";
ALTER TABLE partner_venues DROP COLUMN IF EXISTS nif, DROP COLUMN IF EXISTS stat;
ALTER TABLE tutor_profiles DROP COLUMN IF EXISTS "commissionRate";
ALTER TABLE bookings
  DROP COLUMN IF EXISTS "travelFee", DROP COLUMN IF EXISTS "travelDistanceM", DROP COLUMN IF EXISTS "serviceFee",
  DROP COLUMN IF EXISTS "serviceFeeRate", DROP COLUMN IF EXISTS "totalAmount";

COMMIT;

-- Migration 20261022071915_search_preferences_room_radius (à retirer aussi du journal Prisma) :
BEGIN;
ALTER TABLE beneficiaries
  DROP COLUMN IF EXISTS "areaLabel", DROP COLUMN IF EXISTS "availabilityWindows", DROP COLUMN IF EXISTS "maxBudget",
  DROP COLUMN IF EXISTS "preferredPlace", DROP COLUMN IF EXISTS "searchRadiusM";
ALTER TABLE tutor_profiles DROP COLUMN IF EXISTS "partnerRoomRadiusM";
COMMIT;
-- DELETE FROM _prisma_migrations WHERE migration_name = '20261022071915_search_preferences_room_radius';
