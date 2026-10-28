-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('SCHOOL', 'LIBRARY', 'COWORKING', 'ASSOCIATION', 'COMMUNITY_CENTER', 'OTHER');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'NEEDS_CORRECTION', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoomPublication" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'UNPUBLISHED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VenueDocumentType" AS ENUM ('OWNERSHIP_PROOF', 'BUSINESS_REGISTRATION', 'MANAGER_IDENTITY', 'INSURANCE', 'OTHER');

-- AlterEnum
ALTER TYPE "ConflictType" ADD VALUE 'ROOM_UNAVAILABLE';

-- AlterEnum
ALTER TYPE "PlaceType" ADD VALUE 'PARTNER_ROOM';

-- AlterEnum
ALTER TYPE "TeachingMode" ADD VALUE 'PARTNER_ROOM';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "participantsCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requiredEquipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roomAccessInstructions" TEXT,
ADD COLUMN     "roomFee" DECIMAL(12,2),
ADD COLUMN     "roomId" TEXT;

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "durationOptions" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "partner_venues" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VenueType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "legalName" TEXT,
    "registrationNumber" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "status" "VenueStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_documents" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "type" "VenueDocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accessInstructions" TEXT,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (
      CASE WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
      END
    ) STORED,
    "zoneLabel" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "welcomesMinors" BOOLEAN NOT NULL DEFAULT false,
    "pricePerHour" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MGA',
    "rules" TEXT,
    "cancellationPolicy" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Indian/Antananarivo',
    "status" "RoomStatus" NOT NULL DEFAULT 'DRAFT',
    "publication" "RoomPublication" NOT NULL DEFAULT 'UNPUBLISHED',
    "publishedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_photos" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_availabilities" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_blocked_periods" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_blocked_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_rooms" (
    "id" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MGA',
    "durationDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_subscriptions" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_status_events" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "roomId" TEXT,
    "scope" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_venues_managerId_key" ON "partner_venues"("managerId");

-- CreateIndex
CREATE INDEX "partner_venues_status_idx" ON "partner_venues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "venue_documents_storagePath_key" ON "venue_documents"("storagePath");

-- CreateIndex
CREATE INDEX "venue_documents_venueId_idx" ON "venue_documents"("venueId");

-- CreateIndex
CREATE INDEX "rooms_venueId_idx" ON "rooms"("venueId");

-- CreateIndex
CREATE INDEX "rooms_status_publication_isActive_idx" ON "rooms"("status", "publication", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "room_photos_storagePath_key" ON "room_photos"("storagePath");

-- CreateIndex
CREATE INDEX "room_photos_roomId_position_idx" ON "room_photos"("roomId", "position");

-- CreateIndex
CREATE INDEX "room_availabilities_roomId_isActive_dayOfWeek_idx" ON "room_availabilities"("roomId", "isActive", "dayOfWeek");

-- CreateIndex
CREATE INDEX "room_blocked_periods_roomId_startAt_endAt_idx" ON "room_blocked_periods"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "tutor_rooms_roomId_idx" ON "tutor_rooms"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_rooms_tutorProfileId_roomId_key" ON "tutor_rooms"("tutorProfileId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_plans_code_key" ON "partner_plans"("code");

-- CreateIndex
CREATE INDEX "venue_subscriptions_venueId_status_idx" ON "venue_subscriptions"("venueId", "status");

-- CreateIndex
CREATE INDEX "partner_status_events_venueId_createdAt_idx" ON "partner_status_events"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_status_events_roomId_createdAt_idx" ON "partner_status_events"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_roomId_status_startAt_idx" ON "bookings"("roomId", "status", "startAt");

-- AddForeignKey
ALTER TABLE "partner_venues" ADD CONSTRAINT "partner_venues_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_venues" ADD CONSTRAINT "partner_venues_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_documents" ADD CONSTRAINT "venue_documents_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "partner_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "partner_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_photos" ADD CONSTRAINT "room_photos_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_availabilities" ADD CONSTRAINT "room_availabilities_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_blocked_periods" ADD CONSTRAINT "room_blocked_periods_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_rooms" ADD CONSTRAINT "tutor_rooms_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_rooms" ADD CONSTRAINT "tutor_rooms_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_subscriptions" ADD CONSTRAINT "venue_subscriptions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "partner_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_subscriptions" ADD CONSTRAINT "venue_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "partner_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_status_events" ADD CONSTRAINT "partner_status_events_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "partner_venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_status_events" ADD CONSTRAINT "partner_status_events_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_status_events" ADD CONSTRAINT "partner_status_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Contraintes non exprimables en Prisma (lieux partenaires)
-- ============================================================

CREATE INDEX IF NOT EXISTS rooms_location_gist ON rooms USING gist (location);

-- Une salle est une ressource entière (spec 4.2) : deux séances confirmées ne peuvent pas se chevaucher dans la même
-- salle. Les PENDING ne bloquent PAS (spec 7) ; la confirmation de la séance et celle de la salle sont une seule ligne,
-- donc atomiques. Même filet que bookings_no_overlap côté tuteur : la logique applicative reste la première défense.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_room_no_overlap
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("roomId" IS NOT NULL AND status IN ('CONFIRMED', 'IN_PROGRESS'));

-- Le mode salle partenaire et la salle vont ensemble. Comparaison en texte : une valeur d'enum ajoutée dans la même
-- migration ne peut pas être utilisée avant le commit.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_room_mode
  CHECK (("teachingMode"::text = 'PARTNER_ROOM') = ("roomId" IS NOT NULL));

ALTER TABLE bookings ADD CONSTRAINT bookings_participants_positive CHECK ("participantsCount" >= 1);

ALTER TABLE rooms ADD CONSTRAINT rooms_capacity_positive CHECK (capacity >= 1);
ALTER TABLE rooms ADD CONSTRAINT rooms_price_positive CHECK ("pricePerHour" IS NULL OR "pricePerHour" >= 0);
-- Une salle publiée est forcément validée : la publication ne peut pas précéder la validation.
ALTER TABLE rooms ADD CONSTRAINT rooms_published_requires_approval
  CHECK (publication <> 'PUBLISHED' OR status = 'APPROVED');

ALTER TABLE room_availabilities
  ADD CONSTRAINT room_availabilities_dow CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT room_availabilities_fmt CHECK ("startTime" ~ '^([01]\d|2[0-3]):[0-5]\d$'
                                              AND "endTime"   ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  ADD CONSTRAINT room_availabilities_order CHECK ("endTime" > "startTime");

ALTER TABLE room_blocked_periods ADD CONSTRAINT room_blocked_periods_order CHECK ("endAt" > "startAt");

ALTER TABLE offers ADD CONSTRAINT offers_duration_options_valid
  CHECK ("durationOptions" IS NULL OR "durationOptions" <@ ARRAY[15,30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270,285,300,315,330,345,360,375,390,405,420,435,450,465,480]);

-- Une seule souscription ouverte (en attente ou active) par structure.
CREATE UNIQUE INDEX venue_subscriptions_one_open
  ON venue_subscriptions ("venueId") WHERE status IN ('PENDING', 'ACTIVE');
