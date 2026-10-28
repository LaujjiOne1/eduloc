-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "serviceFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "serviceFeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "travelDistanceM" INTEGER,
ADD COLUMN     "travelFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "commissionRate" DECIMAL(5,4);

-- Réservations existantes : total = tarif du Tuteur + salle éventuelle, sans frais de service (créées avant la commission).
UPDATE "bookings" SET "totalAmount" = "price" + COALESCE("roomFee", 0);

-- AlterTable
ALTER TABLE "tutor_profiles" ADD COLUMN     "commissionRate" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "booking_holds" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tutorProfileId" TEXT NOT NULL,
    "roomId" TEXT,
    "teachingMode" "TeachingMode" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_holds_bookingId_key" ON "booking_holds"("bookingId");

-- CreateIndex
CREATE INDEX "booking_holds_tutorProfileId_status_expiresAt_idx" ON "booking_holds"("tutorProfileId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "booking_holds_roomId_status_expiresAt_idx" ON "booking_holds"("roomId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "booking_holds_requesterId_status_idx" ON "booking_holds"("requesterId", "status");

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tutorProfileId_fkey" FOREIGN KEY ("tutorProfileId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
