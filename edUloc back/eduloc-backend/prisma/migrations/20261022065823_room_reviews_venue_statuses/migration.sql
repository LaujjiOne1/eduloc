-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VenueStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "VenueStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VenueType" ADD VALUE IF NOT EXISTS 'TRAINING_CENTER';
ALTER TYPE "VenueType" ADD VALUE IF NOT EXISTS 'COMPANY';

-- AlterTable
ALTER TABLE "partner_venues" ADD COLUMN     "nif" TEXT,
ADD COLUMN     "stat" TEXT;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reviewsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "room_reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "cleanliness" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "accessibility" INTEGER NOT NULL,
    "equipment" INTEGER NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "comment" TEXT,
    "partnerReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "hiddenReason" TEXT,
    "hiddenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_reviews_roomId_createdAt_idx" ON "room_reviews"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "room_reviews_bookingId_authorId_key" ON "room_reviews"("bookingId", "authorId");

-- AddForeignKey
ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_reviews" ADD CONSTRAINT "room_reviews_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
